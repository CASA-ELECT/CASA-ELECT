// CASA-ELECT  Edge Function  rappels  : envoie les notifications de l'agenda sur les telephones.
// Appelee toutes les 5 minutes par la base (script SQL 5). Secrets a definir dans Supabase  Edge Functions  Secrets :
//   VAPID_PUBLIC, VAPID_PRIVATE (cles de notification), CRON_SECRET (mot de passe partage avec le script SQL 5).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import webpush from 'npm:web-push@3.6.7';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';

// ---------- logique (sans acces reseau, testable) ----------
const TZ = 60; // Tunisie : UTC+1, sans heure d'\u00e9t\u00e9
function local(nowUtc) { const d = new Date(nowUtc.getTime() + TZ * 60000); return {date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), min: d.getUTCHours() * 60 + d.getUTCMinutes()}; }
const toMin = hm => { const m = /^(\d{1,2}):(\d{2})/.exec(hm || ''); return m ? +m[1] * 60 + +m[2] : null; };
const addDay = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function quiet(p, min) { const a = toMin(p.calmeDe), b = toMin(p.calmeA); if (a == null || b == null || a === b) return false; return a < b ? (min >= a && min < b) : (min >= a || min < b); }
// Rappels : codes "30m", "2h", "1j", "1s" (semaine), "1M" (mois), "1a" (an) ; ancien champ "rappel" en minutes accepte
function rapCodes(r, P) {
  let L = r && Array.isArray(r.rappels) && r.rappels.length ? r.rappels.slice() : r && r.rappel != null && r.rappel !== '' ? [+r.rappel && +r.rappel % 1440 === 0 ? +r.rappel / 1440 + 'j' : +r.rappel && +r.rappel % 60 === 0 ? +r.rappel / 60 + 'h' : (+r.rappel || 0) + 'm'] : ['def'];
  if (L.includes('def')) L = L.filter(x => x !== 'def').concat([(+(P || {}).rappel || 0) + 'm']);
  return [...new Set(L)].filter(c => /^[1-9]\d*[mhjsMa]$/.test(c));
}
function rapAt(date, heure, c) {
  const m = /^(\d+)([mhjsMa])$/.exec(c || ''); if (!m || !date) return null; const [y, mo, d] = date.split('-').map(Number), hm = /^(\d{1,2}):(\d{2})/.exec(heure || '') || [0, 8, 0], t = new Date(Date.UTC(y, mo - 1, d, +hm[1], +hm[2])), n = +m[1];
  if (m[2] === 'm') t.setUTCMinutes(t.getUTCMinutes() - n); else if (m[2] === 'h') t.setUTCHours(t.getUTCHours() - n); else if (m[2] === 'j') t.setUTCDate(t.getUTCDate() - n); else if (m[2] === 's') t.setUTCDate(t.getUTCDate() - 7 * n); else if (m[2] === 'M') t.setUTCMonth(t.getUTCMonth() - n); else t.setUTCFullYear(t.getUTCFullYear() - n);
  return t.getTime();
}
const rapJours = c => { const m = /^(\d+)([mhjsMa])$/.exec(c || ''); if (!m) return 1; const n = +m[1]; return ({m: 1, h: 1 + Math.ceil(n / 24), j: n + 1, s: 7 * n + 1, M: 31 * n + 1, a: 366 * n + 1})[m[2]]; };
const RAP_U = {m: ['min', 'min'], h: ['h', 'h'], j: ['jour', 'jours'], s: ['semaine', 'semaines'], M: ['mois', 'mois'], a: ['an', 'ans']};
const rapLbl = c => { const m = /^(\d+)([mhjsMa])$/.exec(c || ''); return m ? m[1] + ' ' + RAP_U[m[2]][+m[1] > 1 ? 1 : 0] : ''; };
const REP = {jour: 1, semaine: 1, mois: 1, an: 1};
// Dates d'un rendez-vous (repete ou non) entre d1 et d2, sans les jours retires de la serie
function rdvOcc(r, d1, d2) {
  if (!r || !r.date) return []; if (!REP[r.rep]) return r.date >= d1 && r.date <= d2 ? [r.date] : [];
  const out = [], fin = r.repFin && r.repFin < d2 ? r.repFin : d2, ex = new Set(r.exceptions || []), [y, m, d] = r.date.split('-').map(Number);
  const at = n => { if (r.rep === 'jour' || r.rep === 'semaine') return new Date(Date.UTC(y, m - 1, d + n * (r.rep === 'jour' ? 1 : 7))).toISOString().slice(0, 10); const mm = m - 1 + (r.rep === 'mois' ? n : 12 * n), yy = y + Math.floor(mm / 12), m2 = ((mm % 12) + 12) % 12, last = new Date(Date.UTC(yy, m2 + 1, 0)).getUTCDate(); return yy + '-' + String(m2 + 1).padStart(2, '0') + '-' + String(Math.min(d, last)).padStart(2, '0'); };
  let n0 = 0; if (d1 > r.date) { const j = Math.floor((Date.parse(d1) - Date.parse(r.date)) / 864e5); n0 = Math.max(0, r.rep === 'jour' ? j : r.rep === 'semaine' ? Math.floor(j / 7) : r.rep === 'mois' ? Math.floor(j / 31) - 1 : Math.floor(j / 366) - 1); }
  for (let n = n0, i = 0; i < 1500; n++, i++) { const x = at(n); if (x > fin) break; if (x >= d1 && !ex.has(x)) out.push(x); }
  return out;
}
const fdate = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
function calc(D, nowUtc, pas = 5) {
  const L = local(nowUtc), now = nowUtc.getTime() + TZ * 60000, out = [], prefs = Object.fromEntries((D.agprefs || []).map(x => [x.id, x])), nomOf = Object.fromEntries((D.personnel || []).filter(p => p.uid).map(p => [p.uid, (p.nom || '').toLowerCase().trim()]));
  const users = [...new Set((D.pushsubs || []).map(s => s.uid))], demain = addDay(L.date, 1);
  for (const u of users) {
    const P = {notif: true, rappel: 30, resume: '07:30', calmeDe: '21:00', calmeA: '07:00', ...(prefs[u] || {})}; if (P.notif === false) continue;
    const items = [], auj = [];
    (D.rdv || []).forEach(r => { if (r.owner !== u && !(r.invites || []).includes(u)) return; const C = rapCodes(r, P), h = Math.max(1, ...C.map(rapJours));
      rdvOcc(r, addDay(L.date, -1), addDay(L.date, h)).forEach(dt => { const it = {k: 'rdv', id: r.id, date: dt, heure: r.heure, titre: r.titre, sous: [r.client, r.lieu].filter(Boolean).join(' \u00b7 '), C}; items.push(it); if (dt === L.date) auj.push(it); }); });
    (D.interventions || []).forEach(i => { if (i.statut === 'Annul\u00e9e' || !(i.techIds || []).includes(u) || !i.date || i.date < addDay(L.date, -1) || i.date > addDay(L.date, 2)) return; const it = {k: 'interv', id: i.id, date: i.date, heure: i.heure, titre: i.titre, sous: [i.client, i.lieu].filter(Boolean).join(' \u00b7 '), C: rapCodes(null, P)}; items.push(it); if (i.date === L.date) auj.push(it); });
    const taches = (D.taches || []).filter(t => t.echeance === L.date && !['Termin\u00e9e', 'Faite'].includes(t.statut) && t.assigne && t.assigne.toLowerCase().trim() === nomOf[u]);
    if (!quiet(P, L.min)) {
      for (const it of items) for (const c of it.C) {
        const at = rapAt(it.date, it.heure, c); if (at == null || !(at > now - pas * 60000 && at <= now)) continue;
        const quand = it.date === L.date ? '' : it.date === demain ? ' (demain)' : ' le ' + fdate(it.date);
        out.push({u, key: 'r_' + u + '_' + it.k + '_' + it.id + '_' + it.date + (it.heure || '') + '_' + c, titre: (it.k === 'rdv' ? 'Rendez-vous' : 'Intervention') + quand + (it.heure ? ' \u00e0 ' + it.heure : ''), corps: it.titre + (it.sous ? ' \u00b7 ' + it.sous : '') + ' (rappel ' + rapLbl(c) + ' avant)'});
      }
      const rs = toMin(P.resume);
      if (rs != null && rs > L.min - pas && rs <= L.min && (auj.length || taches.length)) { auj.sort((a, b) => (a.heure || '').localeCompare(b.heure || '')); out.push({u, key: 'j_' + u + '_' + L.date, titre: 'Aujourd\'hui dans votre agenda', corps: [auj.length ? auj.length + ' rendez-vous / intervention(s)' + (auj[0].heure ? ', premier \u00e0 ' + auj[0].heure : '') : '', taches.length ? taches.length + ' t\u00e2che(s) \u00e0 \u00e9ch\u00e9ance' : ''].filter(Boolean).join(' \u00b7 ')}); }
    }
  }
  return out;
}

// ---------- appel ----------
Deno.serve(async req => {
  if (req.headers.get('x-casa-cle') !== Deno.env.get('CRON_SECRET')) return new Response('refus\u00e9', {status: 401});
  const sb = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  webpush.setVapidDetails('mailto:contact@casa-elect.tn', Deno.env.get('VAPID_PUBLIC'), Deno.env.get('VAPID_PRIVATE'));
  const D = {}; for (const c of ['rdv', 'interventions', 'taches', 'agprefs', 'pushsubs', 'personnel']) { const {data, error} = await sb.from('docs').select('id,data').eq('col', c); if (error) return new Response(error.message, {status: 500}); D[c] = data.map(r => ({id: r.id, ...r.data})); }
  const envois = calc(D, new Date()); let n = 0;
  for (const e of envois) {
    const {data: deja} = await sb.from('docs').select('id').eq('col', 'pushlog').eq('id', e.key).maybeSingle(); if (deja) continue;
    for (const s of D.pushsubs.filter(x => x.uid === e.u)) {
      const msg = JSON.stringify({title: 'CASA-ELECT - ' + e.titre, body: e.corps, url: './#agenda'});
      try { await webpush.sendNotification(s.sub, msg); n++; }
      catch (x) { if (x.statusCode === 404 || x.statusCode === 410) await sb.from('docs').delete().eq('col', 'pushsubs').eq('id', s.id); }
    }
    await sb.from('docs').upsert({col: 'pushlog', id: e.key, data: {le: new Date().toISOString()}});
  }
  await sb.from('docs').delete().eq('col', 'pushlog').lt('modifie_le', new Date(Date.now() - 3 * 864e5).toISOString());
  return new Response(JSON.stringify({envois: envois.length, notifications: n}), {headers: {'Content-Type': 'application/json'}});
});
