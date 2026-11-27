// The map editor's line into the world server (2026-11-26). DEV ONLY: server/main.mjs opens it on the dev build (and
// the test build), never on stable or the live droplet unless started with --editor (do not do that on the droplet).
//
// Every editor page and tools/map-edit.mjs talk to it over /ws/edit. Each message is one edit (js/world/edits.js
// applyOp): checked, written to data/edits.json or data/map.json, the world rebuilt with the same code the browser
// uses (js/world/live.js), and the change sent to every open editor AND every connected game client, which redraw it.
// Undo / redo keep the whole before/after of both files (in memory: a restart starts a fresh undo list); every change
// is also appended to a history log (saves/<build>/edit-log.jsonl).
//
//   const ed = createEditor({ files: { map, edits }, readJson, writeJson, appendLog, rebuild, broadcastGame, log })
//   ed.accept({ send }) → { message(text), close() }      ed.state()   (also for tests)
//
// Client → server: { t: 'hello', who: 'owner' | 'claude' | … } · { t: 'op', op: {…}, rid } · { t: 'undo' } · { t: 'redo' }
//   · { t: 'probe', at, r } (heights, colliders, trees near a spot) · { t: 'marker', at, look? } (where Claude is acting)
//   · { t: 'history' }
// Server → client: { t: 'state', edits, map: { roads, rivers, crossings }, bridges, report, marker, history, undo, redo }
//   · { t: 'ok', rid, id, at } / { t: 'no', rid, why } · { t: 'edit', touched, edits, map?, bridges, report, by, at, id }
//   · { t: 'marker', … } · { t: 'probe', … }
import { applyOp } from '../js/world/edits.js';
import { TREE_SPECIES } from '../js/world/scatter.js';

const HISTORY_MAX = 200;
// { op: 'batch', ops: [...] } = several edits as ONE change (one rebuild, one undo step): a dragged ground brush
function applyBatch(state, op, ctx) {
  if (op?.op !== 'batch') return applyOp(state, op, ctx);
  if (!Array.isArray(op.ops) || !op.ops.length || op.ops.length > 60) return { ok: false, why: 'A batch holds 1 to 60 edits.' };
  let st = state, last = null; const kinds = new Set();
  for (const o of op.ops) { if (o?.op === 'batch') return { ok: false, why: 'No batch inside a batch.' }; last = applyOp(st, o, ctx); if (!last.ok) return last; st = { edits: last.edits, map: last.map }; kinds.add(last.touched); }
  return { ...last, touched: kinds.size === 1 ? last.touched : 'all' };
}
const clone = o => JSON.parse(JSON.stringify(o));
const lines = map => ({ roads: map.roads.map(r => ({ id: r.id, name: r.name, points: r.points, width: r.width, town: r.town || null })), rivers: map.rivers.map(r => ({ id: r.id, name: r.name, points: r.points, width: r.width })), crossings: map.crossings || [], regions: Object.keys(map.regions || {}) });

export function createEditor({ files, readJson, writeJson, appendLog = () => {}, rebuild, broadcastGame = () => {}, getWorld, log = () => {}, now = () => new Date().toISOString() }) {
  let edits = readJson(files.edits), map = readJson(files.map);
  const undo = [], redo = [], history = [];
  const clients = new Set();
  let marker = null, busy = Promise.resolve(), report = getWorld()?.report || { orphans: [] };
  const bridgesNow = () => (getWorld()?.W.terrain.bridges || []).map(b => ({ id: b.id, name: b.name, kind: b.kind, art: b.art, at: b.at, a: b.a, b: b.b, width: b.width, deck: b.deck, surface: b.surface, road: b.road, river: b.river }));
  const sendAll = obj => { const s = JSON.stringify(obj); for (const c of clients) c.send(s); };
  const stateMsg = () => ({ t: 'state', edits, map: lines(map), mapFull: map, bridges: bridgesNow(), report, marker, history: history.slice(-40), undo: undo.length, redo: redo.length });

  async function commit(next, { touched, by, at, id, what }) {
    const mapChanged = JSON.stringify(next.map) !== JSON.stringify(map);
    undo.push({ edits, map, touched, what }); if (undo.length > HISTORY_MAX) undo.shift();
    redo.length = 0;
    await put(next, { touched, by, at, id, what, mapChanged });
  }
  async function put(next, { touched, by, at, id, what, mapChanged }) {
    edits = next.edits; map = next.map;
    writeJson(files.edits, edits);
    if (mapChanged) writeJson(files.map, map);
    // notes never change the world: no rebuild, game clients are not told
    if (touched !== 'notes') { const r = await rebuild({ map, edits, touched }); report = r?.report || report; }
    const entry = { at: now(), by, what, id: id || null, spot: at || null };
    history.push(entry); if (history.length > HISTORY_MAX) history.shift();
    appendLog(entry);
    if (by === 'claude' && at) marker = { at, by, what, when: entry.at };
    const msg = { t: 'edit', touched, edits, map: mapChanged ? lines(map) : undefined, mapFull: mapChanged ? map : undefined, bridges: bridgesNow(), report, by, at, id, what, marker, history: history.slice(-40), undo: undo.length, redo: redo.length };
    sendAll(msg);
    if (touched !== 'notes') broadcastGame({ t: 'worldEdit', touched, edits, map: mapChanged ? map : undefined });
    log('editor.edit', { by, what, touched });
  }
  const describe = op => op.op === 'batch' ? `${op.ops.length} × ${op.ops[0]?.op} ${op.ops[0]?.kind || ''}`.trim() : [op.op, op.kind || op.art || '', op.id || op.ref || op.region || ''].filter(Boolean).join(' ').trim();
  const queue = fn => { const p = busy.then(fn, fn); busy = p.catch(() => {}); return p; };

  function accept(conn) {
    const C = { send: conn.send, who: 'editor' };
    clients.add(C);
    const reply = o => C.send(JSON.stringify(o));
    async function message(text) {
      let m; try { m = JSON.parse(text); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (m.t === 'hello') { C.who = /^[a-z][a-z0-9-]{0,19}$/i.test(m.who || '') ? m.who : 'editor'; return reply(stateMsg()); }
      if (m.t === 'state') return reply(stateMsg());
      if (m.t === 'history') return reply({ t: 'history', history });
      if (m.t === 'marker') {
        if (!Array.isArray(m.at) || m.at.length !== 2 || !m.at.every(Number.isFinite)) return;
        marker = { at: m.at, by: C.who, what: String(m.what || 'looking').slice(0, 60), look: Array.isArray(m.look) ? m.look : null, when: now() };
        return sendAll({ t: 'marker', marker });
      }
      if (m.t === 'probe') {
        const w = getWorld(); if (!w || !Array.isArray(m.at)) return;
        const [x, z] = m.at, r = Math.min(30, Math.max(1, +m.r || 4)), T = w.W.terrain;
        const trees = w.scattered.trees.filter(t => Math.hypot(t.x - x, t.z - z) < r).map(t => ({ id: t.id, art: t.art, at: [t.x, t.z] }));
        return reply({ t: 'probe', rid: m.rid, at: m.at, ground: Math.round(T.heightAt(x, z) * 100) / 100, walk: T.walkHeightAt(x, z), solids: w.ground.solidsNear(x, z, r).length, trees });
      }
      if (m.t === 'undo' || m.t === 'redo') return queue(async () => {
        const from = m.t === 'undo' ? undo : redo, to = m.t === 'undo' ? redo : undo;
        const step = from.pop();
        if (!step) return reply({ t: 'no', rid: m.rid, why: `Nothing to ${m.t}.` });
        to.push({ edits, map, touched: step.touched, what: step.what });
        const mapChanged = JSON.stringify(step.map) !== JSON.stringify(map);
        await put({ edits: step.edits, map: step.map }, { touched: step.touched === 'notes' ? 'notes' : 'all', by: C.who, at: null, id: null, what: `${m.t} ${step.what}`, mapChanged });
        reply({ t: 'ok', rid: m.rid });
      });
      if (m.t === 'op') return queue(async () => {
        const w = getWorld();
        const r = applyBatch({ edits, map }, m.op, { T: w?.W.terrain, species: TREE_SPECIES, by: C.who, now });
        if (!r.ok) return reply({ t: 'no', rid: m.rid, why: r.why });
        try {
          await commit({ edits: r.edits, map: r.map }, { touched: r.touched, by: C.who, at: r.at, id: r.id, what: describe(m.op) });
        } catch (e) {
          log('editor.fail', { msg: String(e?.stack || e).slice(0, 600) });
          // a change that broke the world build: put the files back
          const back = undo.pop();
          if (back) { edits = back.edits; map = back.map; writeJson(files.edits, edits); writeJson(files.map, map); await rebuild({ map, edits, touched: 'all' }).catch(() => {}); }
          return reply({ t: 'no', rid: m.rid, why: `That change broke the world build (${String(e?.message || e).slice(0, 140)}). It was undone.` });
        }
        reply({ t: 'ok', rid: m.rid, id: r.id, at: r.at });
      });
    }
    return { message, close() { clients.delete(C); } };
  }
  return { accept, state: () => ({ edits: clone(edits), map: clone(map), report, marker, history, undo: undo.length, redo: redo.length }), get clients() { return clients.size; } };
}

// ---------------------------------------------------------------- map.json keeps its hand layout
// data/map.json is written by hand in a compact house style (one road per few lines, one crossing per line). The editor
// changes only road / river points and the crossings, so it patches just those pieces of the text; if a piece cannot be
// found it falls back to plain two-space JSON (still valid, just a bigger diff).
function closeOf(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) { const c = text[i]; if (c === '"') { i++; while (i < text.length && text[i] !== '"') { if (text[i] === '\\') i++; i++; } continue; } if (c === '[' || c === '{') depth++; else if (c === ']' || c === '}') { depth--; if (!depth) return i; } }
  return -1;
}
const pts = p => '[' + p.map(q => `[${q[0]}, ${q[1]}]`).join(', ') + ']';
export function mapText(oldText, map) {
  try {
    let s = oldText;
    const before = JSON.parse(oldText);
    for (const kind of ['roads', 'rivers']) for (const line of map[kind]) {
      const was = before[kind].find(r => r.id === line.id);
      if (was && JSON.stringify(was.points) === JSON.stringify(line.points)) continue;
      const at = s.indexOf(`"id": "${line.id}"`);
      const p = at < 0 ? -1 : s.indexOf('"points": [', at);
      if (p < 0) throw new Error('no ' + line.id);
      const o = p + '"points": '.length, c = closeOf(s, o);
      s = s.slice(0, o) + pts(line.points) + s.slice(c + 1);
    }
    if (JSON.stringify(before.crossings) !== JSON.stringify(map.crossings)) {
      const p = s.indexOf('"crossings": [');
      if (p < 0) throw new Error('no crossings');
      const o = p + '"crossings": '.length, c = closeOf(s, o);
      s = s.slice(0, o) + '[\n' + map.crossings.map(x => '    ' + JSON.stringify(x).replace(/^\{/, '{ ').replace(/\}$/, ' }').replace(/":/g, '": ').replace(/,"/g, ', "').replace(/,(?=[-\d])/g, ', ')).join(',\n') + '\n  ]' + s.slice(c + 1);
    }
    if (JSON.stringify(JSON.parse(s)) !== JSON.stringify(map)) throw new Error('patch drifted');
    return s;
  } catch { return JSON.stringify(map, null, 2) + '\n'; }
}
