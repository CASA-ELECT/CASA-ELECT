// CASA-ELECT · Edge Function « rappels » : envoie les notifications de l'agenda sur les téléphones.
// Appelée toutes les 5 minutes par la base (script SQL 5). Secrets à définir dans Supabase → Edge Functions → Secrets :
//   VAPID_PUBLIC, VAPID_PRIVATE (clés de notification), CRON_SECRET (mot de passe partagé avec le script SQL 5).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import webpush from 'npm:web-push@3.6.7';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';

// ---------- logique (sans accès réseau, testable) ----------
const TZ = 60; // Tunisie : UTC+1, sans heure d'été
function local(nowUtc) { const d = new Date(nowUtc.getTime() + TZ * 60000); return {date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), min: d.getUTCHours() * 60 + d.getUTCMinutes()}; }
const toMin = hm => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
const addDay = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function quiet(p, min) { const a = toMin(p.calmeDe), b = toMin(p.calmeA); if (a == null || b == null || a === b) return false; return a < b ? (min >= a && min < b) : (min >= a || min < b); }
function calc(D, nowUtc, pas = 5) {
  const L = local(nowUtc), out = [], prefs = Object.fromEntries((D.agprefs || []).map(x => [x.id, x])), nomOf = Object.fromEntries((D.personnel || []).filter(p => p.uid).map(p => [p.uid, (p.nom || '').toLowerCase().trim()]));
  const users = [...new Set((D.pushsubs || []).map(s => s.uid))];
  for (const u of users) {
    const P = {notif: true, rappel: 30, resume: '07:30', calmeDe: '21:00', calmeA: '07:00', ...(prefs[u] || {})}; if (P.notif === false) continue;
    const items = [];
    (D.rdv || []).forEach(r => { if (r.owner === u || (r.invites || []).includes(u)) items.push({k: 'rdv', id: r.id, date: r.date, heure: r.heure, titre: r.titre, sous: [r.client, r.lieu].filter(Boolean).join(' · '), rappel: r.rappel == null ? +P.rappel || 0 : +r.rappel}); });
    (D.interventions || []).forEach(i => { if (i.statut !== 'Annulée' && (i.techIds || []).includes(u)) items.push({k: 'interv', id: i.id, date: i.date, heure: i.heure, titre: i.titre, sous: [i.client, i.lieu].filter(Boolean).join(' · '), rappel: +P.rappel || 0}); });
    const taches = (D.taches || []).filter(t => t.echeance === L.date && !['Terminée', 'Faite'].includes(t.statut) && t.assigne && t.assigne.toLowerCase().trim() === nomOf[u]);
    if (!quiet(P, L.min)) {
      for (const it of items) { if (!it.heure || !it.rappel) continue; const st = toMin(it.heure); if (st == null) continue;
        const dd = it.date === L.date ? 0 : it.date === addDay(L.date, 1) ? 1440 : null; if (dd == null) continue;
        const at = st + dd - it.rappel; if (at > L.min - pas && at <= L.min) out.push({u, key: 'r_' + u + '_' + it.k + '_' + it.id + '_' + it.date + it.heure + '_' + it.rappel, titre: (it.k === 'rdv' ? 'Rendez-vous' : 'Intervention') + ' à ' + it.heure + (dd ? ' (demain)' : ''), corps: it.titre + (it.sous ? ' · ' + it.sous : '')}); }
      const rs = toMin(P.resume);
      if (rs != null && rs > L.min - pas && rs <= L.min) { const auj = items.filter(i => i.date === L.date); if (auj.length || taches.length) out.push({u, key: 'j_' + u + '_' + L.date, titre: 'Aujourd\'hui dans votre agenda', corps: [auj.length ? auj.length + ' rendez-vous / intervention(s)' + (auj[0] && auj[0].heure ? ', premier à ' + auj.sort((a, b) => (a.heure || '').localeCompare(b.heure || ''))[0].heure : '') : '', taches.length ? taches.length + ' tâche(s) à échéance' : ''].filter(Boolean).join(' · ')}); }
    }
  }
  return out;
}

// ---------- appel ----------
Deno.serve(async req => {
  if (req.headers.get('x-casa-cle') !== Deno.env.get('CRON_SECRET')) return new Response('refusé', {status: 401});
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  webpush.setVapidDetails('mailto:contact@casa-elect.tn', Deno.env.get('VAPID_PUBLIC'), Deno.env.get('VAPID_PRIVATE'));
  const D = {}; for (const c of ['rdv', 'interventions', 'taches', 'agprefs', 'pushsubs', 'personnel']) { const {data, error} = await sb.from('docs').select('id,data').eq('col', c); if (error) return new Response(error.message, {status: 500}); D[c] = data.map(r => ({id: r.id, ...r.data})); }
  const envois = calc(D, new Date()); let n = 0;
  for (const e of envois) {
    const {data: deja} = await sb.from('docs').select('id').eq('col', 'pushlog').eq('id', e.key).maybeSingle(); if (deja) continue;
    for (const s of D.pushsubs.filter(x => x.uid === e.u)) {
      try { await webpush.sendNotification(s.sub, JSON.stringify({title: 'CASA-ELECT · ' + e.titre, body: e.corps, url: './#agenda'})); n++; }
      catch (x) { if (x.statusCode === 404 || x.statusCode === 410) await sb.from('docs').delete().eq('col', 'pushsubs').eq('id', s.id); }
    }
    await sb.from('docs').upsert({col: 'pushlog', id: e.key, data: {le: new Date().toISOString()}});
  }
  await sb.from('docs').delete().eq('col', 'pushlog').lt('modifie_le', new Date(Date.now() - 3 * 864e5).toISOString());
  return new Response(JSON.stringify({envois: envois.length, notifications: n}), {headers: {'Content-Type': 'application/json'}});
});
