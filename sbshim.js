/* CASA-ELECT · Connexion à Supabase.
   Fournit à l'application la même interface que la version d'essai (window.claude.use : db, user, downloads),
   mais les données sont dans la base Supabase de la société, avec une vraie connexion par compte. */
(function () {
  'use strict';
  const CFG = window.CASA_CFG || {url: 'https://yefptplgdjaqttbdplbl.supabase.co', key: 'sb_publishable_p1PW96wGie5wnB28qc0pQw_jsjX0NP8'};
  const sb = window.supabase.createClient(CFG.url, CFG.key, Object.assign({auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}}, CFG.opts || {}));
  window.CASA_SB = sb; window.CASA_SBCFG = CFG;
  const PAGE = 1000;
  const split = p => { const a = String(p).split('/'); return {col: a.slice(0, -1).join('/'), id: a[a.length - 1]}; };
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const err = e => { const c = e && (e.code || e.status); const x = new Error(e && e.message || 'Erreur base de données'); x.code = c === '42501' || c === 401 || c === 403 || /row-level security|permission/i.test(x.message) ? 'invalid_argument' : (e && e.code) || 'unavailable'; return x; };
  const rid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '').slice(0, 20) : Math.random().toString(36).slice(2) + Date.now().toString(36));

  /* ---------- cache local + temps réel ---------- */
  const COLS = new Map();   // col -> {map: Map(id -> data), ready, pending: [], subs: Set}
  const DOCS = new Map();   // 'col/id' -> {data, exists, ready, subs: Set}
  const snapDoc = (id, data) => ({id, exists: data !== undefined && data !== null, data: () => clone(data), metadata: {}});
  const snapCol = c => { const ds = [...c.map.entries()].map(([id, d]) => snapDoc(id, d)); return {docs: ds, size: ds.length, empty: !ds.length, metadata: {}}; };
  const tick = new Set(); let tickOn = false;
  const notify = key => { tick.add(key); if (tickOn) return; tickOn = true; queueMicrotask(() => { tickOn = false; const ks = [...tick]; tick.clear(); ks.forEach(k => {
    if (COLS.has(k)) { const c = COLS.get(k); if (c.ready) { const s = snapCol(c); c.subs.forEach(f => { try { f.next(s); } catch (e) { console.error(e); } }); } }
    if (DOCS.has(k)) { const d = DOCS.get(k); if (d.ready) { const s = snapDoc(split(k).id, d.data); d.subs.forEach(f => { try { f.next(s); } catch (e) { console.error(e); } }); } }
  }); }); };
  function apply(col, id, data) { /* data undefined = supprimé */
    const c = COLS.get(col);
    if (c) { if (!c.ready) c.pending.push([id, data]); else { if (data === undefined) c.map.delete(id); else c.map.set(id, data); notify(col); } }
    const k = col + '/' + id, d = DOCS.get(k);
    if (d) { d.data = data; if (d.ready) notify(k); }
  }
  let channel = null;
  function startRealtime() {
    if (channel) return;
    channel = sb.channel('casa-docs').on('postgres_changes', {event: '*', schema: 'public', table: 'docs'}, p => {
      if (p.eventType === 'DELETE') { const o = p.old || {}; if (o.col != null) { apply(o.col, o.id, undefined); saveLater(o.col); } }
      else { const n = p.new || {}; apply(n.col, n.id, n.data); if (n.modifie_le && SINCE.has(n.col)) SINCE.set(n.col, maxTs(SINCE.get(n.col), n.modifie_le)); saveLater(n.col); }
    }).subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { channel = null; setTimeout(startRealtime, 5000); } if (st === 'SUBSCRIBED') resync(); });
  }
  /* Copie locale sur l'appareil (IndexedDB) + chargement des seules modifications (remarque 25) */
  const IDB = (() => { let dbp = null; const open = () => dbp || (dbp = new Promise((res, rej) => { try { const r = indexedDB.open('casa-elect-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('c'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }));
    const tx = async (m, f) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('c', m), st = t.objectStore('c'), q = f(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return {get: k => tx('readonly', st => st.get(k)).catch(() => null), set: (k, v) => tx('readwrite', st => st.put(v, k)).catch(() => null), clear: () => tx('readwrite', st => st.clear()).catch(() => null)}; })();
  const ckey = col => 'v1|' + CFG.url + '|' + ((SESSION && SESSION.user && SESSION.user.id) || '-') + '|' + col;
  const SINCE = new Map(), SAVE = new Map(); let NODELTA = false;
  const saveLater = col => { clearTimeout(SAVE.get(col)); SAVE.set(col, setTimeout(() => { const c = COLS.get(col); if (c && c.ready && SINCE.get(col)) IDB.set(ckey(col), {since: SINCE.get(col), rows: Object.fromEntries(c.map)}); }, 1500)); };
  const maxTs = (a, b) => (!a ? b : !b ? a : (a > b ? a : b));
  /* après une coupure : on relit seulement ce qui a changé (ou tout, si la base n'a pas le script 4) */
  let resyncOn = false;
  async function resync() { if (resyncOn) return; resyncOn = true; try { for (const [col, c] of COLS) if (c.ready) await loadCol(col, c, true); for (const [k, d] of DOCS) if (d.ready) await loadDoc(k, d, true); } finally { resyncOn = false; } }
  async function fullCol(col) {
    const map = new Map(); let ts = null;
    for (let from = 0; ; from += PAGE) {
      const {data, error} = await sb.from('docs').select('id,data,modifie_le').eq('col', col).order('id').range(from, from + PAGE - 1);
      if (error) throw err(error);
      data.forEach(r => { map.set(r.id, r.data); ts = maxTs(ts, r.modifie_le); });
      if (data.length < PAGE) break;
    }
    return {map, ts: ts || new Date(0).toISOString()};
  }
  async function deltaCol(col, map, since) {
    const lim = new Date(new Date(since).getTime() - 120000).toISOString(); let ts = since;   /* 2 min de recouvrement : rien ne se perd */
    const {error: e0, data: del} = await sb.from('supprimes').select('id,le').eq('col', col).gt('le', lim);
    if (e0) { NODELTA = true; return null; }
    for (let from = 0; ; from += PAGE) {
      const {data, error} = await sb.from('docs').select('id,data,modifie_le').eq('col', col).gt('modifie_le', lim).order('modifie_le').range(from, from + PAGE - 1);
      if (error) throw err(error);
      data.forEach(r => { map.set(r.id, r.data); ts = maxTs(ts, r.modifie_le); });
      if (data.length < PAGE) break;
    }
    (del || []).forEach(r => { map.delete(r.id); ts = maxTs(ts, r.le); });
    return ts;
  }
  async function loadCol(col, c, refresh) {
    let since = SINCE.get(col), map = refresh ? new Map(c.map) : null, fromCache = false;
    if (!refresh && !NODELTA) { const k = await IDB.get(ckey(col)); if (k && k.since && (new Date(k.since).getTime() < 864e5 || (Date.now() - new Date(k.since).getTime()) < 150 * 864e5)) { map = new Map(Object.entries(k.rows || {})); since = k.since; fromCache = true;
      c.map = map; c.pending.forEach(([id, d]) => { if (d === undefined) map.delete(id); else map.set(id, d); }); c.pending = []; c.ready = true; notify(col); } }   /* ouverture immédiate depuis la copie locale */
    let ts = null;
    if (since && map && !NODELTA) ts = await deltaCol(col, map, since);
    if (!ts) { const f = await fullCol(col); map = f.map; ts = f.ts; }
    SINCE.set(col, ts);
    if (refresh || fromCache) { c.map = map; notify(col); saveLater(col); return; }
    c.map = map; c.pending.forEach(([id, d]) => { if (d === undefined) map.delete(id); else map.set(id, d); }); c.pending = []; c.ready = true; notify(col); saveLater(col);
  }
  async function loadDoc(k, d, refresh) {
    const {col, id} = split(k), {data, error} = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle();
    if (error) throw err(error);
    d.data = data ? data.data : undefined; d.ready = true; notify(k);
  }

  /* ---------- interface « db » ---------- */
  function query(col, filters = [], lim = 0) {
    return {
      where: (f, op, v) => query(col, filters.concat([[f, v]]), lim),
      limit: n => query(col, filters, n), orderBy: () => query(col, filters, lim),
      doc: id => doc(col + '/' + (id || rid())),
      add: async d => { const r = doc(col + '/' + rid()); await r.set(d); return r; },
      async get() {
        let q = sb.from('docs').select('id,data').eq('col', col);
        filters.forEach(([f, v]) => { q = q.eq('data->>' + f, String(v)); });
        if (lim) q = q.limit(lim);
        const {data, error} = await q; if (error) throw err(error);
        const ds = data.map(r => snapDoc(r.id, r.data)); return {docs: ds, size: ds.length, empty: !ds.length};
      },
      onSnapshot(next, onErr) {
        startRealtime();
        let c = COLS.get(col); const sub = {next, err: onErr};
        if (!c) { c = {map: new Map(), ready: false, pending: [], subs: new Set()}; COLS.set(col, c); c.subs.add(sub); loadCol(col, c).catch(e => { COLS.delete(col); c.subs.forEach(s => s.err && s.err(e)); }); }
        else { c.subs.add(sub); if (c.ready) queueMicrotask(() => next(snapCol(c))); }
        return () => c.subs.delete(sub);
      }
    };
  }
  function doc(path) {
    const {col, id} = split(path);
    return {
      id, path,
      async get() { const {data, error} = await sb.from('docs').select('data').eq('col', col).eq('id', id).maybeSingle(); if (error) throw err(error); return snapDoc(id, data ? data.data : undefined); },
      async set(d) { const v = clone(d); const {error} = await sb.from('docs').upsert({col, id, data: v}, {onConflict: 'col,id'}); if (error) throw err(error); apply(col, id, v); },
      async update(d) {
        const {data, error} = await sb.rpc('doc_maj', {p_col: col, p_id: id, p_patch: clone(d)}); if (error) throw err(error);
        if (!data) { const x = new Error('Fiche introuvable'); x.code = 'invalid_argument'; throw x; }
        const cur = (COLS.get(col) && COLS.get(col).map.get(id)) || (DOCS.get(path) && DOCS.get(path).data);
        if (cur) apply(col, id, Object.assign({}, cur, clone(d)));
      },
      async delete() { const {error} = await sb.from('docs').delete().eq('col', col).eq('id', id); if (error) throw err(error); apply(col, id, undefined); },
      async acquire(o) { const {data, error} = await sb.rpc('prendre_verrou', {p_cle: path, p_porteur: String(o.holder), p_ttl_ms: o.ttlMs || 8000}); if (error) throw err(error); return {acquired: !!data}; },
      onSnapshot(next, onErr) {
        startRealtime();
        let d = DOCS.get(path); const sub = {next, err: onErr};
        if (!d) { d = {data: undefined, ready: false, subs: new Set()}; DOCS.set(path, d); d.subs.add(sub); loadDoc(path, d).catch(e => { DOCS.delete(path); d.subs.forEach(s => s.err && s.err(e)); }); }
        else { d.subs.add(sub); if (d.ready) queueMicrotask(() => next(snapDoc(id, d.data))); }
        return () => d.subs.delete(sub);
      },
      collection: c => query(path + '/' + c)
    };
  }
  const db = {doc, collection: c => query(c)};

  /* ---------- interface « user » ---------- */
  let SESSION = null, PROFIL = null;
  const user = {
    id: async () => SESSION.user.id,
    isOwner: async () => !!(PROFIL && PROFIL.role === 'admin'),
    canEdit: async () => !!(PROFIL && PROFIL.role === 'admin' && PROFIL.actif),
    can: () => true,
    me: async () => ({id: SESSION.user.id, name: (PROFIL && PROFIL.nom) || SESSION.user.email, email: SESSION.user.email}),
    async profiles(ids) {
      const uu = ids.filter(i => /^[0-9a-f-]{36}$/i.test(i)); if (!uu.length) return {};
      const {data} = await sb.rpc('noms', {p_ids: uu}); const o = {};
      (data || []).forEach(r => { o[r.user_id] = {name: r.nom || ''}; }); return o;
    },
    search: async () => []
  };

  /* ---------- interface « downloads » : vrai téléchargement du navigateur ---------- */
  const downloads = {
    async save({filename, data}) {
      const blob = data instanceof Blob ? data : new Blob([data], {type: /\.html?$/i.test(filename) ? 'text/html;charset=utf-8' : /\.pdf$/i.test(filename) ? 'application/pdf' : /\.xml$/i.test(filename) ? 'application/xml' : /\.json$/i.test(filename) ? 'application/json' : 'application/octet-stream'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); return {status: 'saved'};
    }
  };

  /* ---------- écran de connexion ---------- */
  let readyRes; const READY = new Promise(r => { readyRes = r; });
  window.claude = {use: async n => { await READY; return {db, user, downloads}[n] || null; }};
  const css = `#lg{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--bg,#f4f6f9);padding:16px;font-family:Inter,system-ui,sans-serif}
#lg .bx{width:100%;max-width:380px;background:var(--surface,#fff);color:var(--fg,#0f172a);border:1px solid var(--line,#e2e8f0);border-radius:14px;padding:26px;box-shadow:0 10px 30px rgba(15,23,42,.08)}
#lg h1{font:700 22px 'Space Grotesk',Inter,sans-serif;margin:0 0 2px}#lg p{margin:.2rem 0 1rem;color:var(--muted,#64748b);font-size:13.5px}
#lg label{display:block;font-size:12.5px;font-weight:600;margin:.7rem 0 .25rem}#lg input{width:100%;box-sizing:border-box;padding:.6rem .7rem;border:1px solid var(--line,#cbd5e1);border-radius:9px;font-size:15px;background:var(--surface,#fff);color:inherit}
#lg button{width:100%;margin-top:1rem;padding:.65rem;border:0;border-radius:9px;background:var(--accent,#1d4ed8);color:#fff;font-weight:700;font-size:15px;cursor:pointer}#lg button:disabled{opacity:.6}
#lg .ln{display:flex;justify-content:space-between;gap:.5rem;margin-top:.9rem;font-size:13px}#lg .ln a{color:var(--accent,#1d4ed8);cursor:pointer;text-decoration:underline}
#lg .msg{margin-top:.8rem;font-size:13px;padding:.55rem .7rem;border-radius:8px;background:#fef3c7;color:#92400e}#lg .msg.ok{background:#dcfce7;color:#166534}#lg .msg.bad{background:#fee2e2;color:#991b1b}`;
  function box(mode, msg, cls) {
    let el = document.getElementById('lg'); if (!el) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); el = document.createElement('div'); el.id = 'lg'; document.body.appendChild(el); }
    const T = {login: ['Connexion', 'Entrez votre e-mail et votre mot de passe.', 'Se connecter'], signup: ['Créer mon compte', 'Votre compte sera actif dès que l\'administrateur l\'aura validé.', 'Créer le compte'], reset: ['Mot de passe oublié', 'Vous allez recevoir un e-mail pour choisir un nouveau mot de passe.', 'Envoyer l\'e-mail'], newpw: ['Nouveau mot de passe', 'Choisissez votre nouveau mot de passe (8 caractères minimum).', 'Enregistrer'], wait: ['Compte en attente', 'Votre compte est créé. L\'administrateur doit le valider et vous attribuer un rôle. Réessayez ensuite.', 'Réessayer']}[mode];
    el.innerHTML = `<form class="bx" autocomplete="on"><h1>CASA-ELECT</h1><p><b>${T[0]}</b><br>${T[1]}</p>
      ${mode === 'signup' ? '<label for="lg-n">Nom et prénom</label><input id="lg-n" required autocomplete="name">' : ''}
      ${['login', 'signup', 'reset'].includes(mode) ? '<label for="lg-e">E-mail</label><input id="lg-e" type="email" required autocomplete="username">' : ''}
      ${['login', 'signup', 'newpw'].includes(mode) ? `<label for="lg-p">Mot de passe</label><input id="lg-p" type="password" required minlength="${mode === 'login' ? 1 : 8}" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}">` : ''}
      <button type="submit">${T[2]}</button>
      <div class="ln">${mode === 'login' ? '<a data-m="reset">Mot de passe oublié ?</a><a data-m="signup">Créer mon compte</a>' : mode === 'wait' ? '<a data-m="logout">Changer de compte</a>' : '<a data-m="login">← Retour à la connexion</a>'}</div>
      ${msg ? `<div class="msg ${cls || ''}">${msg}</div>` : ''}</form>`;
    const f = el.querySelector('form'), v = id => (el.querySelector('#' + id) || {}).value || '';
    el.querySelectorAll('[data-m]').forEach(a => a.onclick = async () => { if (a.dataset.m === 'logout') { await sb.auth.signOut(); return box('login'); } box(a.dataset.m); });
    f.onsubmit = async e => {
      e.preventDefault(); const b = f.querySelector('button'); b.disabled = true;
      try {
        if (mode === 'login') { const {error} = await sb.auth.signInWithPassword({email: v('lg-e').trim(), password: v('lg-p')}); if (error) return box('login', /invalid/i.test(error.message) ? 'E-mail ou mot de passe incorrect.' : /confirm/i.test(error.message) ? 'Confirmez d\'abord votre adresse : cliquez sur le lien reçu par e-mail.' : error.message, 'bad'); await enter(); }
        else if (mode === 'signup') { const {data, error} = await sb.auth.signUp({email: v('lg-e').trim(), password: v('lg-p'), options: {data: {nom: v('lg-n').trim()}, emailRedirectTo: location.origin + location.pathname}}); if (error) return box('signup', error.message, 'bad'); if (data.session) await enter(); else box('login', 'Compte créé. Ouvrez l\'e-mail reçu pour confirmer votre adresse, puis attendez la validation de l\'administrateur.', 'ok'); }
        else if (mode === 'reset') { const {error} = await sb.auth.resetPasswordForEmail(v('lg-e').trim(), {redirectTo: location.origin + location.pathname}); box('login', error ? error.message : 'E-mail envoyé. Ouvrez le lien reçu pour choisir un nouveau mot de passe.', error ? 'bad' : 'ok'); }
        else if (mode === 'newpw') { const {error} = await sb.auth.updateUser({password: v('lg-p')}); if (error) return box('newpw', error.message, 'bad'); await enter(); }
        else if (mode === 'wait') await enter();
      } catch (x) { box(mode, 'Connexion impossible : vérifiez internet et réessayez.', 'bad'); }
    };
    const first = el.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
  }
  let entered = false;
  async function enter() {
    const {data: {session}} = await sb.auth.getSession(); if (!session) return box('login');
    SESSION = session;
    const {data: p, error} = await sb.from('profils').select('*').eq('user_id', session.user.id).maybeSingle();
    if (error) return box('login', 'La base ne répond pas : ' + error.message, 'bad');
    PROFIL = p;
    if (!p || !p.actif) return box('wait', p ? '' : 'Profil introuvable : contactez l\'administrateur.');
    const el = document.getElementById('lg'); if (el) el.remove();
    if (!entered) { entered = true; readyRes(); addLogout(); }
  }
  function addLogout() {
    const go = () => { const av = document.getElementById('av'); if (!av || document.getElementById('lg-out')) return;
      av.parentElement.insertAdjacentHTML('beforeend', `<button type="button" id="lg-out" class="ib" title="Se déconnecter" aria-label="Se déconnecter" style="margin-left:.5rem;white-space:nowrap;font-size:12px;padding:.3rem .55rem;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);cursor:pointer">Déconnexion</button>`);
      document.getElementById('lg-out').onclick = async () => { await IDB.clear(); await sb.auth.signOut(); location.reload(); };
      document.getElementById('lg-out').insertAdjacentHTML('beforebegin', `<button type="button" id="lg-pw" class="ib" title="Changer mon mot de passe" style="margin-left:.5rem;white-space:nowrap;font-size:12px;padding:.3rem .55rem;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--fg);cursor:pointer">Mot de passe</button>`);
      document.getElementById('lg-pw').onclick = () => box('newpw'); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
  }
  sb.auth.onAuthStateChange((ev, session) => {
    if (ev === 'PASSWORD_RECOVERY') return box('newpw');
    if (ev === 'TOKEN_REFRESHED' && session) SESSION = session;
    if (ev === 'SIGNED_OUT' && entered) location.reload();
  });
  const boot = () => { if (/type=recovery/.test(location.hash)) return; enter(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
