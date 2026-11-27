#!/usr/bin/env node
// Tree Kit command line — Claude (or anyone) changes trees while the owner watches the Tree Kit page.
// It talks to the live channel (tools/live.mjs, port 8670) so the open page redraws within a second; when the channel
// is off it reads and writes data/species.json directly (and says so).
//
//   node treekit/tools/tree-edit.mjs list                       every tree: id, name, shape, the game kinds using it
//   node treekit/tools/tree-edit.mjs knobs [tree]               every knob (with the tree's values when given)
//   node treekit/tools/tree-edit.mjs get oak [trunk.radius]     one knob, one part (trunk) or the whole tree
//   node treekit/tools/tree-edit.mjs set oak trunk.radius 1.3   change a knob (colours: set oak leaves.tint 0.9 1.2 0.5)
//   node treekit/tools/tree-edit.mjs save                       write species.json (the game reads it) + measured sizes
//   node treekit/tools/tree-edit.mjs revert [tree]              throw away unsaved changes
//   node treekit/tools/tree-edit.mjs status                     channel on/off, unsaved trees, last change, open notes
//   node treekit/tools/tree-edit.mjs notes [--all]              the owner's pinned notes (open ones; --all adds done)
//   node treekit/tools/tree-edit.mjs done 3 [reply words…]      mark note 3 done (it turns green on the page)
//   node treekit/tools/tree-edit.mjs reply 3 words…             answer a note without closing it
//   node treekit/tools/tree-edit.mjs reopen 3
//   node treekit/tools/tree-edit.mjs note oak words…            pin a note yourself
// Options: --by <name> (default claude), --port <n> (default 8670), --host <h> (default 127.0.0.1).
import fs from 'node:fs';
import { register } from 'node:module';
register('../../avatar-3d/tests/three-loader.mjs', import.meta.url);

process.stdout.on('error', e => { if (e.code === 'EPIPE') process.exit(0); });   // `| head` closed the pipe
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = n => { const i = argv.indexOf('--' + n); if (i < 0) return false; argv.splice(i, 1); return true; };
const by = opt('by', 'claude'), port = +opt('port', process.env.TREEKIT_PORT || 8670), host = opt('host', '127.0.0.1');
const all = flag('all');
const [cmd = 'help', ...rest] = argv;
const BASE = `http://${host}:${port}`;

async function call(method, path, body) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(4000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || `HTTP ${r.status}`), { api: true });
  return j;
}
let live = null;
async function liveState() {
  if (live !== null) return live;
  try { live = await call('GET', '/api/state'); } catch (e) { if (e.api) throw e; live = false; }
  return live;
}
const lib = () => import('../js/species.js');
const show = v => (typeof v === 'object' ? JSON.stringify(v) : String(v));
const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 90 ? `${s} s ago` : s < 5400 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };

async function species() {
  const L = await liveState();
  if (L) return { species: L.species, game: L.game, live: true };
  const { DATA } = await lib();
  return { species: DATA.species, game: DATA.oathwild, live: false };
}
function offlineNote() { console.log('(live channel is off — start it with: node treekit/tools/live.mjs — working on data/species.json directly)'); }

const cmds = {
  async list() {
    const { species: S, game } = await species();
    const uses = {};
    for (const [k, r] of Object.entries({ ...game.trees, ...game.understory })) (uses[r.tree] ||= []).push(`${k} ${r.height} m`);
    for (const [id, sp] of Object.entries(S)) console.log(`${id.padEnd(14)} ${sp.label.padEnd(20)} ${sp.form.padEnd(6)} ${(uses[id] || ['not in the game']).join(', ')}`);
  },
  async knobs(id) {
    const { KNOBS, knobsFor } = await lib();
    const { species: S } = await species();
    const sp = id ? S[id] : null;
    if (id && !sp) throw new Error(`no tree "${id}" (list shows them)`);
    for (const k of sp ? knobsFor(sp) : KNOBS) {
      const [p, key] = k.path.split('.');
      const range = k.kind === 's' ? k.of.join(' | ') : k.kind === 'b' ? 'on | off' : k.kind === 'c' ? `3 × ${k.min}-${k.max}` : `${k.min}-${k.max}`;
      console.log(`${k.path.padEnd(20)} ${(sp ? show(sp[p]?.[key]) : '').padEnd(18)} ${range.padEnd(16)} ${k.label}`);
    }
  },
  async get(id, path) {
    const { species: S } = await species();
    const sp = S[id];
    if (!sp) throw new Error(`no tree "${id}" (list shows them)`);
    if (!path) return console.log(JSON.stringify(sp, null, 1));
    const [p, key] = path.split('.');
    console.log(show(key ? sp[p]?.[key] : sp[p]));
  },
  async set(id, path, ...vals) {
    if (!id || !path || !vals.length) throw new Error('set <tree> <knob> <value>   e.g. set oak trunk.radius 1.3');
    const value = vals.length === 1 ? vals[0] : vals;
    if (await liveState()) {
      const r = await call('POST', '/api/set', { id, path, value, by });
      console.log(`${id} ${path} = ${show(r.value)}  (the page redraws now; "save" writes the file)`);
      return;
    }
    offlineNote();
    const { DATA, setKnob, formatSpecies, SPECIES_FILE } = await lib();
    if (!DATA.species[id]) throw new Error(`no tree "${id}"`);
    const v = setKnob(DATA.species[id], path, value);
    const { applyMeasure } = await import('../js/measure.js');
    applyMeasure(DATA);
    fs.writeFileSync(SPECIES_FILE, formatSpecies(DATA));
    console.log(`${id} ${path} = ${show(v)}  (written to species.json)`);
  },
  async save() {
    if (await liveState()) {
      const r = await call('POST', '/api/save', { by });
      console.log(`saved ${r.file}`);
      for (const [k, f, a, b] of r.measured) console.log(`  ${k} ${f}: ${a} → ${b} m (measured from the drawn tree)`);
      return;
    }
    offlineNote(); console.log('nothing unsaved: offline edits are written straight away');
  },
  async revert(id) {
    if (!(await liveState())) { offlineNote(); return; }
    const r = await call('POST', '/api/revert', { id, by });
    console.log(`back to the saved file: ${r.ids.length === 1 ? r.ids[0] : 'every tree'}`);
  },
  async status() {
    const L = await liveState();
    if (!L) { console.log(`live channel: off (start: node treekit/tools/live.mjs, port ${port})`); return; }
    console.log(`live channel: on, ${BASE}/treekit/`);
    console.log(`unsaved: ${L.dirty.length ? L.dirty.join(', ') : 'nothing'}`);
    if (L.last) console.log(`last change: ${L.last.by} — ${L.last.id} ${L.last.path}${L.last.value !== undefined ? ' = ' + show(L.last.value) : ''}, ${ago(L.last.at)}`);
    const open = L.notes.filter(n => n.status !== 'done');
    console.log(`notes: ${open.length} open, ${L.notes.length - open.length} done`);
  },
  async notes() {
    const L = await liveState();
    const list = L ? L.notes : JSON.parse(fs.readFileSync(new URL('../data/notes.json', import.meta.url), 'utf8')).notes;
    const shown = list.filter(n => all || n.status !== 'done');
    if (!shown.length) return console.log(all ? 'no notes' : 'no open notes (--all shows the done ones)');
    for (const n of shown) {
      console.log(`#${n.id} [${n.status}] ${n.species}${n.at ? ` at ${n.at.join(', ')}` : ''} — ${n.by}: "${n.text}"`);
      if (n.reply) console.log(`      reply: ${n.reply}`);
    }
  },
  async done(id, ...words) { await noteCall({ id, status: 'done', ...(words.length ? { reply: words.join(' ') } : {}) }, 'done'); },
  async reply(id, ...words) { await noteCall({ id, reply: words.join(' ') }, 'replied'); },
  async reopen(id) { await noteCall({ id, status: 'open' }, 'open again'); },
  async note(species, ...words) {
    if (!(await liveState())) throw new Error('notes need the live channel (node treekit/tools/live.mjs)');
    const r = await call('POST', '/api/notes', { species, text: words.join(' '), by });
    console.log(`note #${r.note.id} pinned on ${species}`);
  },
  async measure() {
    const { DATA, formatSpecies, SPECIES_FILE } = await lib();
    const { applyMeasure } = await import('../js/measure.js');
    const ch = applyMeasure(DATA);
    for (const [k, f, a, b] of ch) console.log(`${k} ${f}: ${a} → ${b} m`);
    if (ch.length) fs.writeFileSync(SPECIES_FILE, formatSpecies(DATA)); else console.log('sizes match the drawn trees');
  },
  help() {
    const src = fs.readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//   ') || l.startsWith('// Options'));
    console.log(src.map(l => l.slice(3)).join('\n'));
  },
};
async function noteCall(body, said) {
  if (!(await liveState())) throw new Error('notes need the live channel (node treekit/tools/live.mjs)');
  const r = await call('POST', '/api/note', { ...body, by });
  console.log(`note #${r.note.id} ${said}`);
}

try {
  if (!cmds[cmd]) throw new Error(`unknown command "${cmd}" — try: node treekit/tools/tree-edit.mjs help`);
  await cmds[cmd](...rest);
} catch (e) { console.error(e.message); process.exit(1); }
