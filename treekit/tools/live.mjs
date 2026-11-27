#!/usr/bin/env node
// Tree Kit live channel (dev only, LAN): the Tree Kit page and Claude's command line share ONE working copy of the
// tree species, so a change from either side shows on the open page within a second (owner 2026-11-26: "it would be
// cool if you could access it realtime and change what we see instead of checking in later").
//
//   node treekit/tools/live.mjs [--port 8670] [--host 0.0.0.0]
//
// No WebSocket package needed: the page LISTENS on a Server-Sent Events stream (GET /events — one long HTTP response
// the server writes lines into) and TALKS with small POSTs. The server also serves the playground's files, so
// http://<LAN IP>:8670/treekit/ is the page with the channel on the same address (the 8401 page finds it too).
//
//   GET  /api/state               { species, dirty: [ids], notes, last, saved }
//   GET  /events                  event: hello | species | notes | saved | reverted   (data: JSON)
//   POST /api/set     { id, path, value, by }          one knob (clamped like the page's slider)
//   POST /api/species { id, species, by }              a whole species (the page's "reset to saved" uses /api/revert)
//   POST /api/save    { by }                           write data/species.json (measures the game sizes first)
//   POST /api/revert  { id?, by }                      back to the saved file (one species or all)
//   POST /api/notes   { species, text, at?, by }       pin a note on a tree ("trunk too thin")
//   POST /api/note    { id, status?, reply?, by }      mark done / reply / reopen
//
// Unsaved changes are kept in data/live-draft.json (not committed) so a restart loses nothing; notes live in
// data/notes.json (committed — they are the owner's review of the trees).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
register('../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { formatSpecies, setKnob, SPECIES_FILE } = await import('../js/species.js');
const { applyMeasure } = await import('../js/measure.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
export const LIVE_PORT = 8670;
const port = +arg('port', process.env.TREEKIT_PORT || LIVE_PORT), host = arg('host', '0.0.0.0');
const ROOT = path.resolve(new URL('../../', import.meta.url).pathname);
const DATA_DIR = path.resolve(new URL('../data/', import.meta.url).pathname);
const DRAFT = path.resolve(DATA_DIR, arg('draft', 'live-draft.json'));
const NOTES = path.resolve(DATA_DIR, arg('notes', 'notes.json'));
const SPECIES_PATH = arg('file', SPECIES_FILE.pathname);

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeAtomic = (f, text) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, text); fs.renameSync(tmp, f); };

let saved = readJson(SPECIES_PATH, null);
if (!saved) throw new Error(`treekit live: cannot read ${SPECIES_PATH}`);
const draft = readJson(DRAFT, null);
let work = structuredClone(saved);
if (draft?.species) for (const [id, sp] of Object.entries(draft.species)) if (work.species[id]) work.species[id] = sp;
let last = draft?.last || null;
let notes = readJson(NOTES, { notes: [] }).notes;
const clients = new Set();

const dirtyIds = () => Object.keys(work.species).filter(id => JSON.stringify(work.species[id]) !== JSON.stringify(saved.species[id]));
function keepDraft() {
  const dirty = dirtyIds();
  if (!dirty.length) { try { fs.unlinkSync(DRAFT); } catch {} return; }
  writeAtomic(DRAFT, JSON.stringify({ species: Object.fromEntries(dirty.map(id => [id, work.species[id]])), last }, null, 1));
}
const saveNotes = () => writeAtomic(NOTES, JSON.stringify({ about: 'Tree Kit notes: pinned on a tree on treekit/index.html, answered with treekit/tools/tree-edit.mjs notes / done.', notes }, null, 2) + '\n');
function send(event, data) {
  const line = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(line);
}
const state = () => ({ species: work.species, game: work.oathwild, dirty: dirtyIds(), notes, last, port });
const who = by => (by === 'claude' ? 'claude' : by === 'owner' || !by ? 'owner' : String(by).slice(0, 24));

const api = {
  'GET /api/state': () => state(),
  'POST /api/set': b => {
    const sp = work.species[b.id];
    if (!sp) throw Object.assign(new Error(`no tree "${b.id}"`), { code: 404 });
    const before = JSON.stringify(sp[b.path.split('.')[0]]?.[b.path.split('.')[1]]);
    const value = setKnob(sp, b.path, b.value);
    last = { by: who(b.by), id: b.id, path: b.path, value, before: before === undefined ? null : JSON.parse(before), at: Date.now() };
    keepDraft();
    send('species', { id: b.id, species: sp, last, dirty: dirtyIds() });
    return { ok: true, value, last };
  },
  'POST /api/species': b => {
    if (!work.species[b.id] && !b.create) throw Object.assign(new Error(`no tree "${b.id}"`), { code: 404 });
    if (!b.species || typeof b.species !== 'object' || !b.species.form) throw new Error('a species needs at least a form');
    work.species[b.id] = b.species;
    last = { by: who(b.by), id: b.id, path: '*', at: Date.now() };
    keepDraft();
    send('species', { id: b.id, species: b.species, last, dirty: dirtyIds() });
    return { ok: true };
  },
  'POST /api/save': b => {
    const next = structuredClone(work);
    const changes = applyMeasure(next);     // the game's trunk / crown follow the drawn trees (lessons rule 22)
    writeAtomic(SPECIES_PATH, formatSpecies(next));
    saved = next; work = structuredClone(next);
    last = { by: who(b.by), id: '*', path: 'save', at: Date.now() };
    keepDraft();
    send('saved', { last, measured: changes, game: work.oathwild, dirty: [] });
    return { ok: true, measured: changes, file: path.relative(ROOT, SPECIES_PATH) };
  },
  'POST /api/revert': b => {
    const ids = b.id ? [b.id] : Object.keys(work.species);
    for (const id of ids) if (saved.species[id]) work.species[id] = structuredClone(saved.species[id]);
    last = { by: who(b.by), id: b.id || '*', path: 'revert', at: Date.now() };
    keepDraft();
    send('reverted', { ids, species: Object.fromEntries(ids.map(id => [id, work.species[id]])), last, dirty: dirtyIds() });
    return { ok: true, ids };
  },
  'POST /api/notes': b => {
    const text = String(b.text || '').trim().slice(0, 400);
    if (!text) throw new Error('a note needs some words');
    if (!work.species[b.species]) throw Object.assign(new Error(`no tree "${b.species}"`), { code: 404 });
    const id = (notes.reduce((m, n) => Math.max(m, n.id), 0) || 0) + 1;
    const at = Array.isArray(b.at) && b.at.length === 3 && b.at.every(Number.isFinite) ? b.at.map(v => Math.round(v * 100) / 100) : null;
    const n = { id, species: b.species, text, at, by: who(b.by), status: 'open', made: new Date().toISOString() };
    notes.push(n); saveNotes();
    send('notes', { notes, changed: id });
    return { ok: true, note: n };
  },
  'POST /api/note': b => {
    const n = notes.find(x => x.id === +b.id);
    if (!n) throw Object.assign(new Error(`no note #${b.id}`), { code: 404 });
    if (b.status) { if (!['open', 'done'].includes(b.status)) throw new Error('status is open or done'); n.status = b.status; n.doneAt = b.status === 'done' ? new Date().toISOString() : undefined; n.doneBy = b.status === 'done' ? who(b.by) : undefined; }
    if (b.reply != null) n.reply = String(b.reply).slice(0, 400);
    if (b.remove) notes = notes.filter(x => x !== n);
    saveNotes();
    send('notes', { notes, changed: n.id });
    return { ok: true, note: n };
  },
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream', '.woff2': 'font/woff2', '.ktx2': 'image/ktx2', '.wasm': 'application/wasm' };
const PRIVATE = /(^|\/)(\.git|node_modules|secrets|\.env)(\/|$)/;
function serveFile(req, res, url) {
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (rel === '') { res.writeHead(302, { Location: '/treekit/' }); res.end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(ROOT + path.sep) || PRIVATE.test(rel)) { res.writeHead(403); res.end('refused'); return; }
  fs.stat(abs, (err, st) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
    if (st.isDirectory()) { res.writeHead(302, { Location: url.pathname + '/' }); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(abs).pipe(res);
  });
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (url.pathname === '/events') {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`retry: 1500\nevent: hello\ndata: ${JSON.stringify(state())}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clients.delete(res); clearInterval(ping); });
    return;
  }
  const fn = api[`${req.method} ${url.pathname}`];
  if (!fn) { if (req.method === 'GET') return serveFile(req, res, url); res.writeHead(404, cors); res.end(); return; }
  let body = '';
  req.on('data', c => { body += c; if (body.length > 2e6) req.destroy(); });
  req.on('end', () => {
    let out, code = 200;
    try { out = fn(body ? JSON.parse(body) : {}); }
    catch (e) { code = e.code || 400; out = { ok: false, error: e.message }; }
    res.writeHead(code, { ...cors, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out));
  });
});
server.listen(port, host, () => console.log(`treekit live channel on http://${host}:${port}/treekit/ (${clients.size} pages)`));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const r of clients) r.end(); server.close(); process.exit(0); });
