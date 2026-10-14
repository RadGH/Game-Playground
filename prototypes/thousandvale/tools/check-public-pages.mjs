#!/usr/bin/env node
// Does every page the playground home page links actually load from this server?
//
//   node prototypes/thousandvale/tools/check-public-pages.mjs                       # dev, http://127.0.0.1:8491
//   node prototypes/thousandvale/tools/check-public-pages.mjs http://127.0.0.1:8490 # stable
//   node prototypes/thousandvale/tools/check-public-pages.mjs https://<the live link>
//   ... --depth 3     follow imports further (default 2)      ... --verbose    list every request
//
// It asks the server for the home page, data/experiments.json and data/served-by.json, then for every card:
// the page, its stylesheets and scripts, and what those scripts import (`import ... from '...'`, `import '...'`
// and `import('...')` with a plain string), two levels deep. Anything that is not HTTP 200 is listed with the
// file that asked for it. It also asks for a handful of private paths and expects every one to be refused.
// No browser: this is the check that catches "the page is looking for a file the server will not hand out"
// (the Emberveil / library/js/make.js fault) without needing Playwright. Exit code 1 when anything is wrong.

const argv = process.argv.slice(2);
const flag = n => { const i = argv.indexOf(n); return i < 0 ? null : argv.splice(i, 2)[1]; };
const DEPTH = +(flag('--depth') ?? 2);
const VERBOSE = argv.includes('--verbose');
const BASE = new URL((argv.find(a => !a.startsWith('--')) || 'http://127.0.0.1:8491').replace(/\/*$/, '/'));

const seen = new Map();          // url -> { status, type, text }
const bad = [];                  // { url, status, from }
let requests = 0;
async function get(url, from) {
  url = String(url).split('#')[0];
  if (seen.has(url)) return seen.get(url);
  let rec;
  try {
    const r = await fetch(url, { redirect: 'follow' });
    const type = r.headers.get('content-type') || '';
    const texty = /html|javascript|json|css|markdown|text/.test(type);
    rec = { status: r.status, type, text: texty ? await r.text() : (await r.arrayBuffer(), '') };
  } catch (e) { rec = { status: 0, type: '', text: '', error: e.cause?.code || e.message }; }
  requests++;
  seen.set(url, rec);
  if (VERBOSE) console.log(`   ${rec.status} ${url.replace(BASE.href, '/')}`);
  if (rec.status !== 200) bad.push({ url, status: rec.status || rec.error, from });
  return rec;
}
const inside = u => u.origin === BASE.origin;
const strip = js => js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function htmlRefs(html) {
  const out = { scripts: [], other: [] };
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) out.scripts.push(m[1]);
  for (const m of body.matchAll(/<link\b[^>]*>/gi)) { const h = /\bhref\s*=\s*["']([^"']+)["']/i.exec(m[0]); if (h && /stylesheet|icon|preload|modulepreload/i.test(m[0])) out.other.push(h[1]); }
  // inline module scripts import too
  for (const m of body.matchAll(/<script\b[^>]*type\s*=\s*["']module["'][^>]*>([\s\S]*?)<\/script>/gi)) if (m[1].trim()) out.scripts.push(...jsRefs(m[1]).map(r => ({ inline: r })));
  // an import map changes what a bare name means; note the mapped files so they get checked as well
  for (const m of body.matchAll(/<script\b[^>]*type\s*=\s*["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { out.other.push(...Object.values(JSON.parse(m[1]).imports || {}).filter(v => !v.endsWith('/'))); } catch { /* not ours to judge */ } }
  return out;
}
function jsRefs(js) {
  const src = strip(js), out = new Set();
  for (const m of src.matchAll(/(?:^|[\s;}])(?:import|export)\s+(?:[^'"`;()]*?\s+from\s+)?["']([^"'\n]+)["']/g)) out.add(m[1]);
  for (const m of src.matchAll(/\bimport\(\s*["']([^"'\n]+)["']\s*\)/g)) out.add(m[1]);
  return [...out].filter(s => /^(\.{1,2}\/|\/)/.test(s));      // bare names go through an import map
}
const walked = new Map();        // script url -> the deepest walk already started from it (import graphs loop)
async function walkScript(url, from, depth) {
  const r = await get(url, from);
  if (r.status !== 200 || depth <= 0 || (walked.get(url) ?? 0) >= depth) return;
  walked.set(url, depth);
  await Promise.all(jsRefs(r.text).map(ref => { const u = new URL(ref, url); return inside(u) ? walkScript(u.href, url, depth - 1) : null; }));
}
async function walkPage(href, from) {
  const url = new URL(href, BASE);
  const r = await get(url.href, from);
  if (r.status !== 200 || !/html/.test(r.type)) return r;
  const refs = htmlRefs(r.text);
  const jobs = [];
  for (const o of refs.other) { const u = new URL(o, url); if (inside(u)) jobs.push(get(u.href, url.href)); }
  for (const s of refs.scripts) { const u = new URL(s.inline || s, url); if (inside(u)) jobs.push(walkScript(u.href, url.href, s.inline ? DEPTH - 1 : DEPTH)); }
  await Promise.all(jobs);
  return r;
}

console.log(`== ${BASE.href}  (imports followed ${DEPTH} deep)`);
const home = await walkPage('', 'the address itself');
const notes = [];
if (home.status === 200 && !/<title>Playground/.test(home.text)) { bad.push({ url: BASE.href, status: 'not the playground home page', from: 'the address itself' }); }
const list = await get(new URL('data/experiments.json', BASE).href, 'the home page');
const host = await get(new URL('data/served-by.json', BASE).href, 'the home page');
await get(new URL('data/live-links.json', BASE).href, 'the home page');
let entries = [], info = {};
try { entries = JSON.parse(list.text).entries; } catch { bad.push({ url: 'data/experiments.json', status: 'not JSON', from: 'the home page' }); }
try { info = JSON.parse(host.text); } catch { /* reported above as a failed request */ }
const gone = new Set(info.unavailable || []);
if (info.game) notes.push(`served by the ${info.game} game server: that card opens ${info.path} on this address`);
else notes.push('data/served-by.json is empty: this is a plain file server (8400 or GitHub Pages), not the game server');

const rows = [];
for (const e of entries) {
  const before = bad.length, hidden = [];
  let page = e.href;
  if (info.game === e.id && e.server) page = info.path;
  if (!page && e.server) { rows.push([e.id, 'other server', `port ${e.server.port}`]); continue; }
  if (gone.has(page)) { rows.push([e.id, 'hidden', 'this server does not hold it; the home page leaves the card out']); continue; }
  await walkPage(page, 'the home page');
  for (const l of e.links || []) { if (gone.has(l.href)) hidden.push(l.label); else await walkPage(l.href, `the ${e.id} card`); }
  const readme = e.readme || (e.folder ? e.folder + '/README.md' : null);
  if (readme) { if (gone.has(readme)) hidden.push(e.readme ? 'Docs' : 'README'); else await get(new URL(readme, BASE).href, `the ${e.id} card`); }
  const n = bad.length - before;
  rows.push([e.id, n ? `${n} MISSING` : 'ok', hidden.length ? `button hidden: ${hidden.join(', ')}` : '']);
}
const w = Math.max(...rows.map(r => r[0].length), 4);
for (const [id, state, note] of rows) console.log(`   ${id.padEnd(w)}  ${state.padEnd(12)} ${note}`);

// private things stay private
const PRIVATE = ['CLAUDE.md', 'README.md', 'package.json', 'serve.sh', '.git/config', '.gitignore', 'tools/serve.py', 'docs/research-voices.md', 'tests/experiments.test.js', 'node_modules/',
  'library/synced/library.json', 'library/synced/', 'library/tests/library.spec.js', 'items/tools/build-items.py',
  'prototypes/thousandvale/server/main.mjs', 'prototypes/thousandvale/ops/setup-stable.sh', 'prototypes/thousandvale/tests/H/vps.test.js', 'prototypes/thousandvale/docs/PLAN.md',
  'prototypes/thousandvale/package.json', 'prototypes/thousandvale/node_modules/ws/package.json', 'prototypes/thousandvale/.data/dev-store.json',
  'prototypes/farhold/tests/', 'prototypes/farhold/tools/', 'prototypes/farhold/research/review-round10.md', 'prototypes/lanternfall/test-results/', 'prototypes/tumblefair/server/', 'prototypes/tumblefair/package.json', 'prototypes/tinyrts/'];
const open = [];
for (const p of PRIVATE) { let s = 0; try { s = (await fetch(new URL(p, BASE), { redirect: 'manual' })).status; } catch { s = 0; } if (s !== 404 && s !== 400) open.push(`${p} -> ${s}`); }

for (const n of notes) console.log('   note: ' + n);
console.log(`   ${requests} files asked for, ${bad.length} not loaded; ${PRIVATE.length} private paths asked for, ${open.length} answered`);
for (const b of bad) console.log(`   MISSING ${b.status}  ${b.url.replace(BASE.href, '/')}\n           asked for by ${String(b.from).replace(BASE.href, '/')}`);
for (const o of open) console.log(`   LEAK    ${o}`);
process.exit(bad.length || open.length ? 1 : 0);
