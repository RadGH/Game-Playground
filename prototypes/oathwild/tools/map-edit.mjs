#!/usr/bin/env node
// Change the Oathwild world from the command line, live: the same edits as the map editor page, through the DEV world
// server's editor line (/ws/edit, server/editor.js). Whoever has the editor (or the game) open sees the change within a
// second or two, and a blue marker shows where this tool last acted. Made for Claude to work on the owner's notes.
//
//   node prototypes/oathwild/tools/map-edit.mjs <command> [args] [--server ws://localhost:8661] [--who claude] [--json]
//
//   notes [--all]                       open notes (or every note), newest last
//   note add <x> <z> <text…>            pin a note
//   note done <id> [reply…]             mark a note done (turns green on the owner's screen), with an optional reply
//   note open <id> · note remove <id>
//   tree add <kind> <x> <z> [size]      kinds: oak-a oak-b birch pine-a pine-b willow marsh-tree dead-tree ancient-oak giant-spruce
//   tree remove <id | x,z>              a tree's id (t-1633_-770, shown with the editor's "Tree and rock names" layer) or the
//                                       nearest tree to a spot
//   tree area <x> <z> <r> <density> [add|set] [kind]    brush trees in (density 0 = clear the area)
//   rock add <kind> <x> <z> [size] · rock remove <id | x,z>
//   ground <raise|lower|flatten|smooth> <x> <z> <r> [amount] [y]
//   bridge list · bridge set <id> key=value…   keys: deck width ramp kind(bridge|ford) art(bridge-wood|bridge-stone)
//                                       a=x,z b=x,z (both ends) — key=null puts it back to worked out
//   road points <id> · road set <id> x,z x,z …   (river points / river set the same)
//   thing list [group] · thing move <group:id> <x> <z> [facing] · thing reset <group:id>
//   effect list · effect add <kind> <x> <z> [key=value…] · effect set <id> key=value… · effect move <id> <x> <z> · effect remove <id>
//       kinds: fog fireflies leaves dust shafts marsh embers look; keys: r soft amount tint tintAmount mist saturation contrast exposure bloom name
//   look show · look set <region> key=value…   keys: exposure saturation contrast warm bloom mist fogColour sunColour (=null resets)
//   probe <x> <z> [r]                   ground height, walked height, colliders and trees near a spot
//   marker <x> <z> [what…]              put the blue marker somewhere (where Claude is looking)
//   undo · redo · history · report · state
import WebSocket from 'ws';

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf('--' + n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const bool = n => { const i = argv.indexOf('--' + n); if (i < 0) return false; argv.splice(i, 1); return true; };
const server = flag('server', 'ws://localhost:8661'), who = flag('who', 'claude'), asJson = bool('json'), all = bool('all');
const url = server.replace(/\/ws(\/oathwild)?(\/edit)?$/, '') + '/ws/edit';
const num = v => { const n = Number(v); if (!Number.isFinite(n)) die(`"${v}" is not a number.`); return n; };
const xz = s => { const p = String(s).split(',').map(Number); if (p.length !== 2 || !p.every(Number.isFinite)) die(`"${s}" is not x,z.`); return p; };
function die(msg) { console.error(msg); process.exit(2); }
function kv(list) {
  const o = {};
  for (const s of list) {
    const i = s.indexOf('='); if (i < 1) die(`"${s}" should be key=value.`);
    const k = s.slice(0, i), v = s.slice(i + 1);
    o[k] = v === 'null' ? null : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : /^-?[\d.]+,-?[\d.]+$/.test(v) ? xz(v) : v;
  }
  return o;
}

const ws = new WebSocket(url);
let rid = 0, state = null;
const waits = new Map();
const opened = new Promise((res, rej) => {
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', who })));
  ws.on('message', d => {
    const m = JSON.parse(d.toString());
    if (m.t === 'state') { state = m; res(); }
    if (m.rid && waits.has(m.rid)) { waits.get(m.rid)(m); waits.delete(m.rid); }
  });
  ws.on('error', e => rej(new Error(`Could not reach the dev world server's editor at ${url} (${e.message}). Start it: tools/game-servers.sh start oathwild-dev`)));
  ws.on('unexpected-response', (q, r) => rej(new Error(`The server refused the editor line (HTTP ${r.statusCode}) — it only runs on the dev world server.`)));
});
const ask = m => new Promise(res => { const id = ++rid; waits.set(id, res); ws.send(JSON.stringify({ ...m, rid: id })); });
async function op(o, label) {
  const r = await ask({ t: 'op', op: o });
  if (r.t === 'no') die(`Refused: ${r.why}`);
  if (r.at) ws.send(JSON.stringify({ t: 'marker', at: r.at, what: label || o.op }));   // the owner sees where this happened
  out(r, `${label || o.op} — done${r.id ? ` (${r.id})` : ''}${r.at ? ` at ${r.at.join(', ')}` : ''}`);
}
function out(obj, text) { console.log(asJson ? JSON.stringify(obj, null, 1) : text); }
async function nearestId(spot, kind) {
  if (!/,/.test(spot)) return spot;
  const at = xz(spot), p = await ask({ t: 'probe', at, r: 12 });
  if (kind === 'tree') { const t = p.trees.sort((a, b) => Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) - Math.hypot(b.at[0] - at[0], b.at[1] - at[1]))[0]; if (!t) die('No tree within 12 m of that spot.'); return t.id; }
  die('Give the rock id (the editor shows it with the "Tree and rock names" layer).');
}

try { await opened; } catch (e) { die(e.message); }
const E = state.edits, [cmd, sub, ...rest] = argv;
const r1 = v => Math.round(v * 10) / 10;
switch (cmd) {
  case 'state': out(state, JSON.stringify({ zones: E.zones.length, notes: E.notes.length, treesAdded: E.trees.add.length, treesRemoved: E.trees.remove.length, areas: E.trees.areas.length, strokes: E.ground.length, moved: Object.keys(E.moves).length, orphans: state.report?.orphans?.length || 0, undo: state.undo, marker: state.marker }, null, 1)); break;
  case 'notes': {
    const list = E.notes.filter(n => all || !n.done);
    out(list, list.length ? list.map(n => `${n.done ? '[done]' : '[open]'} ${n.id} at ${n.at.join(', ')} by ${n.by}: ${n.text}${n.reply ? `\n        reply: ${n.reply}` : ''}`).join('\n') : (all ? 'No notes.' : 'No open notes.'));
    break;
  }
  case 'note':
    if (sub === 'add') await op({ op: 'note.add', at: [num(rest[0]), num(rest[1])], text: rest.slice(2).join(' ') }, 'note');
    else if (sub === 'done') await op({ op: 'note.done', id: rest[0], reply: rest.slice(1).join(' ') || undefined }, `note ${rest[0]} done`);
    else if (sub === 'open') await op({ op: 'note.open', id: rest[0] });
    else if (sub === 'remove') await op({ op: 'note.remove', id: rest[0] });
    else die('note add|done|open|remove');
    break;
  case 'tree':
    if (sub === 'add') await op({ op: 'tree.add', art: rest[0], at: [num(rest[1]), num(rest[2])], ...(rest[3] ? { scale: num(rest[3]) } : {}) }, `tree ${rest[0]}`);
    else if (sub === 'remove') await op({ op: 'tree.remove', id: await nearestId(rest[0], 'tree') }, 'tree removed');
    else if (sub === 'area') await op({ op: 'tree.area', at: [num(rest[0]), num(rest[1])], r: num(rest[2]), density: num(rest[3]), mode: rest[4] === 'add' ? 'add' : 'set', ...(rest[5] ? { kinds: [rest[5]] } : {}) }, 'tree area');
    else die('tree add|remove|area');
    break;
  case 'rock':
    if (sub === 'add') await op({ op: 'decor.add', art: rest[0], at: [num(rest[1]), num(rest[2])], ...(rest[3] ? { scale: num(rest[3]) } : {}) }, `rock ${rest[0]}`);
    else if (sub === 'remove') await op({ op: 'decor.remove', id: await nearestId(rest[0], 'rock') }, 'rock removed');
    else die('rock add|remove');
    break;
  case 'ground': await op({ op: 'ground', kind: sub, at: [num(rest[0]), num(rest[1])], r: num(rest[2]), ...(rest[3] ? { amount: num(rest[3]) } : {}), ...(rest[4] ? { y: num(rest[4]) } : {}) }, `ground ${sub}`); break;
  case 'bridge':
    if (sub === 'list') out(state.bridges, state.bridges.map(b => `${b.id.padEnd(18)} ${b.kind.padEnd(6)} ${(b.art || '').padEnd(12)} deck ${b.deck} water ${b.surface} width ${b.width} a ${b.a.join(',')} b ${b.b.join(',')}`).join('\n'));
    else if (sub === 'set') await op({ op: 'bridge.set', id: rest[0], ...kv(rest.slice(1)) }, `bridge ${rest[0]}`);
    else die('bridge list|set');
    break;
  case 'road': case 'river': {
    const line = cmd === 'road' ? 'roads' : 'rivers', L = state.map[line].find(r => r.id === rest[0]);
    if (sub === 'points') { if (!L) die(`No ${cmd} "${rest[0]}".`); out(L.points, L.points.map(p => p.join(',')).join(' ')); }
    else if (sub === 'set') await op({ op: 'line.set', line, id: rest[0], points: rest.slice(1).map(xz) }, `${cmd} ${rest[0]}`);
    else die(`${cmd} points|set`);
    break;
  }
  case 'thing':
    if (sub === 'move') await op({ op: 'thing.move', ref: rest[0], at: [num(rest[1]), num(rest[2])], ...(rest[3] ? { facing: num(rest[3]) } : {}) }, `moved ${rest[0]}`);
    else if (sub === 'reset') await op({ op: 'thing.reset', ref: rest[0] }, `put back ${rest[0]}`);
    else if (sub === 'list') out(E.moves, Object.entries(E.moves).map(([k, v]) => `${k} → ${v.at.join(', ')}`).join('\n') || 'Nothing moved. Refs: buildings:<id> shrines:<id> chests:<id> objects:<id> camps:<id> roam:<id> npcs:<id> props:<x*10>_<z*10>');
    else die('thing list|move|reset');
    break;
  case 'effect':
    if (sub === 'list') out(E.zones, E.zones.map(z => `${z.id.padEnd(5)} ${z.kind.padEnd(10)} at ${z.at.join(', ')} r ${z.r} soft ${z.soft} amount ${z.amount ?? 1}${z.name ? `  "${z.name}"` : ''}`).join('\n') || 'No effect zones.');
    else if (sub === 'add') await op({ op: 'zone.add', kind: rest[0], at: [num(rest[1]), num(rest[2])], ...kv(rest.slice(3)) }, `effect ${rest[0]}`);
    else if (sub === 'set') await op({ op: 'zone.set', id: rest[0], ...kv(rest.slice(1)) }, `effect ${rest[0]}`);
    else if (sub === 'move') await op({ op: 'zone.set', id: rest[0], at: [num(rest[1]), num(rest[2])] }, `effect ${rest[0]} moved`);
    else if (sub === 'remove') await op({ op: 'zone.remove', id: rest[0] }, `effect ${rest[0]} removed`);
    else die('effect list|add|set|move|remove');
    break;
  case 'look':
    if (sub === 'show' || !sub) out(E.looks, JSON.stringify(E.looks, null, 1) + `\nregions: ${state.map.regions.join(', ')}`);
    else if (sub === 'set') await op({ op: 'look.set', region: rest[0], values: kv(rest.slice(1)) }, `look ${rest[0]}`);
    else die('look show|set');
    break;
  case 'probe': {
    const p = await ask({ t: 'probe', at: [num(sub), num(rest[0])], r: rest[1] ? num(rest[1]) : 4 });
    out(p, `ground ${p.ground} m · walk ${r1(p.walk.y)} m on ${p.walk.on}${p.walk.bridge ? ` (${p.walk.bridge})` : ''} · ${p.solids} colliders · trees: ${p.trees.map(t => `${t.id} ${t.art}`).join(', ') || 'none'}`);
    break;
  }
  case 'marker': ws.send(JSON.stringify({ t: 'marker', at: [num(sub), num(rest[0])], what: rest.slice(1).join(' ') || 'looking here' })); out({ ok: true }, 'Marker placed.'); await new Promise(r => setTimeout(r, 200)); break;
  case 'undo': case 'redo': { const r = await ask({ t: cmd }); if (r.t === 'no') die(r.why); out(r, `${cmd} — done`); break; }
  case 'history': { const r = await ask({ t: 'history' }); out(r.history, r.history.slice(-30).map(h => `${h.at.slice(5, 16).replace('T', ' ')} ${h.by.padEnd(8)} ${h.what}${h.spot ? ` @ ${h.spot.join(', ')}` : ''}`).join('\n') || 'Nothing yet.'); break; }
  case 'report': { const o = state.report?.orphans || []; out(o, o.length ? o.map(x => `${x.kind} ${x.id || x.ref}: ${x.why}`).join('\n') : 'Every edit found its target.'); break; }
  default: console.log('Commands: notes, note, tree, rock, ground, bridge, road, river, thing, effect, look, probe, marker, undo, redo, history, report, state (see the top of this file).'); process.exitCode = cmd ? 2 : 0;
}
ws.close();
