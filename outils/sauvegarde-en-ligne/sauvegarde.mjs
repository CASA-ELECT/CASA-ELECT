// CASA-ELECT · copie complète de la base, au même format que « Sauvegarde → Exporter » de l'application.
// Utilisé chaque nuit par GitHub Actions (dépôt PRIVÉ) : node sauvegarde.mjs > sauvegarde.json
// Variables : SUPABASE_URL, SUPABASE_SECRET_KEY (clé secrète « sb_secret_… » : ne jamais la publier).
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) { console.error('SUPABASE_URL et SUPABASE_SECRET_KEY sont obligatoires'); process.exit(1); }
const H = {apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/json'};
const out = {app: 'CASA-ELECT', version: 1, date: new Date().toISOString(), source: 'Supabase (copie automatique)', collections: {}};
const PAGE = 1000; let n = 0;
for (let from = 0; ; from += PAGE) {
  const r = await fetch(`${url}/rest/v1/docs?select=col,id,data&order=col,id&offset=${from}&limit=${PAGE}`, {headers: H});
  if (!r.ok) { console.error('Erreur ' + r.status + ' : ' + await r.text()); process.exit(1); }
  const rows = await r.json(); rows.forEach(x => { (out.collections[x.col] = out.collections[x.col] || {})[x.id] = x.data; n++; });
  if (rows.length < PAGE) break;
}
const p = await fetch(`${url}/rest/v1/profils?select=user_id,email,nom,role,roles,actif`, {headers: H});
if (p.ok) out.profils = await p.json();
process.stdout.write(JSON.stringify(out));
console.error(n + ' fiches sauvegardées');
