#!/usr/bin/env node
// Thousandvale — DO OUR SET PIECES STILL FIT WHERE THEY WERE BOUND? (stream E, play-test 5: "an iron railing running
// inside Saint Hulda's stone wall").
//
//   node tools/content-fit.mjs            report every misfit; exit 1 when there is one (tests/E/playtest5-fit.test.js)
//   node tools/content-fit.mjs --fix      move every misfit out of the recipe (data/vignettes/setpieces.json) and re-space
//                                         the fence rows that stay; safe to run again
//
// THE FAULT. Six of our set pieces are BOUND onto one of stream B's baked ground pieces (placement `bound` + `scale`
// 0.43-0.83): the recipe's POSITIONS are multiplied by `scale` so the place fits B's plot, but its models, buildings
// and fence sections are drawn FULL SIZE (js/client/setpiece-view.js). And B draws that piece's own dressing too: the
// graveyard's drystone wall, grave rows, lychgate and chapel; the farm's house, granary and hedged fields; the mill
// and its wheel; the stone circle's stones and altar. So a bound recipe could (a) draw a second copy of what B draws,
// (b) stand a model in B's building, wall, pond or graves, or outside B's wall, (c) pile its own full-size models on
// top of each other once the spacing shrank, (d) overlap fence sections three deep.
//
// THE RULES (each finding names its rule):
//   twin      the recipe draws what B's piece already draws there (TWINS below, a building B has with the same `want`,
//             an enclosure where B has a wall or hedge)
//   attached  a model that touched a recipe building which is itself a twin (the mill's gear housing): it would float
//   inB       a model / building / field whose footprint lands in B's building, graves, stones, wheel or pond
//   outside   it lands outside B's walled plot
//   crowded   two of the recipe's own things overlap at this scale and did not at full size (the later one goes)
//   (an ANCHOR — a model within 2.5 m of one of the recipe's quest objects — is never moved by inB / outside / crowded)
//   row       fence / wall sections in a row closer than their own length: the row is re-spaced (not dropped) so that
//             after scaling each section starts where the last one ends
// A misfit is not deleted: it moves to the recipe's `ifFree` block ({models, buildings, fields, props} — what this
// place also has when it stands on open ground at full size; nothing reads it today), so the full design is kept.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { vignettePoint } from '../js/sim/vignettes.js';

const ROOT = new URL('../', import.meta.url);
const readJ = f => JSON.parse(readFileSync(new URL(f, ROOT), 'utf8'));
const FILE = 'data/vignettes/setpieces.json';
const ROWS = { wooden_fence: 3, iron_fence: 2, stone_wall: 3 };           // section length, m
/** What stream B's set-piece view draws by itself, per piece kind (js/client/setpiece-view.js `case 'set_piece'`). */
export const TWINS = {
  graveyard: ['gravestone', 'gravestone_leaning', 'tomb_chest', 'lychgate', 'bench'],
  mill_pond: ['watermill_wheel'],
  stone_circle: ['standing_stone', 'altar_stone'],
};
const PROP_R = 0.8;

function modelRadius(models, id) {
  const m = models[id]; if (!m) return 1;
  let hx = 0.3, hz = 0.3;
  for (const p of m.parts || []) { hx = Math.max(hx, Math.abs(p.x || 0) + (p.w || 0) / 2); hz = Math.max(hz, Math.abs(p.z || 0) + (p.d || 0) / 2); }
  return Math.max(0.35, (hx + hz) / 2 * 0.9);
}
const segDist = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / l2)) : 0; return Math.hypot(p.x - (a[0] + dx * t), p.z - (a[1] + dz * t)); };
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > p.z) !== (zj > p.z) && p.x < (xj - xi) * (p.z - zi) / (zj - zi) + xi) c = !c; } return c; };

/** Stream B's own dressing of one ground piece, as shapes in zone metres. */
function bakedPiece(bake, id) {
  const sp = bake.find(p => p.id === id); if (!sp) return null;
  const d = sp.data || {}, mine = bake.filter(p => (p.data || {}).setPiece === id);
  const discs = [];
  for (const b of mine.filter(p => p.kind === 'set_building')) discs.push({ what: `B's ${b.data.want}`, x: b.x, z: b.z, r: 0.5 * Math.min(b.data.w, b.data.d) + 0.6 });
  for (const g of d.graves || []) discs.push({ what: "B's graves", x: g[0], z: g[1], r: 0.7 });
  for (const s of d.stones || []) discs.push({ what: "B's stones", x: s[0], z: s[1], r: 0.8 });
  if (d.wheel) discs.push({ what: "B's mill wheel", x: d.wheel.x, z: d.wheel.z, r: 2.4 });
  const lines = mine.filter(p => (p.kind === 'wall' || p.kind === 'hedge' || p.kind === 'fence') && p.data.pts).map(p => ({ kind: p.kind, pts: p.data.pts }));
  // only an enclosure round the piece's own middle makes ours a twin (the farm's hedges are round its far fields)
  const encloses = lines.some(l => l.kind !== 'fence' && Math.min(...l.pts.map(q => Math.hypot(q[0] - sp.x, q[1] - sp.z))) < (d.r || 20) * 1.2);
  return { id, kind: d.piece, x: sp.x, z: sp.z, discs, lines, encloses, walled: mine.some(p => p.kind === 'wall') ? d.poly : null, pond: d.pond || null,
    buildings: mine.filter(p => p.kind === 'set_building').map(p => p.data.want) };
}
const inPond = (p, pond) => { if (!pond) return false; const a = pond.angle || 0, dx = p.x - pond.x, dz = p.z - pond.z, u = dx * Math.cos(a) + dz * Math.sin(a), v = -dx * Math.sin(a) + dz * Math.cos(a); return (u / pond.rx) ** 2 + (v / pond.rz) ** 2 < 1; };

/** Maximal straight rows of one section model: [{ id, yaw, axis: 'x'|'z', line (the fixed coordinate), items: [model…] sorted }] */
function rowsOf(models) {
  const rows = [];
  for (const id of Object.keys(ROWS)) {
    const secs = models.filter(m => m.id === id);
    for (const axis of ['x', 'z']) {
      const along = axis, across = axis === 'x' ? 'z' : 'x';
      const groups = new Map();
      // a section at yaw 0 runs along local X, at yaw 1.57 along local Z (data/vignettes/README.md)
      for (const m of secs) { const runsX = Math.abs(Math.cos(m.yaw || 0)) > 0.7; if ((axis === 'x') !== runsX) continue; const k = (m[across] || 0).toFixed(2); (groups.get(k) || groups.set(k, []).get(k)).push(m); }
      for (const [line, items] of groups) { items.sort((a, b) => a[along] - b[along]); let run = [items[0]]; const flush = () => { if (run.length >= 2) rows.push({ id, axis, line: +line, yaw: run[0].yaw || 0, items: run }); };
        for (let i = 1; i < items.length; i++) { if (items[i][along] - items[i - 1][along] <= ROWS[id] * 2.2) run.push(items[i]); else { flush(); run = [items[i]]; } } flush(); }
    }
  }
  return rows;
}

/** Everything wrong with one bound recipe -> [{ rule, list ('models'|'buildings'|'fields'|'props'), item, why }] + rows to re-space. */
export function misfits(rec, pl, B, models) {
  const k = pl.scale, out = [], gone = new Set();
  const W = it => vignettePoint(pl, (it.x || 0) * k, (it.z || 0) * k);
  const add = (rule, list, item, why) => { if (!gone.has(item)) { gone.add(item); out.push({ rule, list, item, why }); } };
  const isRow = m => m.id in ROWS;
  // twin
  for (const m of rec.models || []) if ((TWINS[B.kind] || []).includes(m.id)) add('twin', 'models', m, `B's ${B.kind} draws its own ${m.id}`);
  for (const b of rec.buildings || []) if (B.buildings.includes(b.want)) add('twin', 'buildings', b, `B built this ${B.kind}'s ${b.want}`);
  if (B.encloses) for (const m of (rec.models || []).filter(isRow)) add('twin', 'models', m, `B's ${B.lines[0].kind} already encloses the ${B.kind}`);
  // attached to a twin building (touching it at full size)
  for (const b of (rec.buildings || []).filter(x => gone.has(x))) for (const m of rec.models || []) {
    if (gone.has(m) || isRow(m) || (rec.objects || []).some(o => Math.hypot((o.x || 0) - m.x, (o.z || 0) - m.z) <= 2.5)) continue;      // a quest anchor stays
    const gap = Math.max(Math.abs(m.x - b.x) - (b.w || 7) / 2, Math.abs(m.z - b.z) - (b.d || 6) / 2) - modelRadius(models, m.id);
    if (gap < 1) add('attached', 'models', m, `it stood against the recipe's ${b.want}, which B built elsewhere`);
  }
  // footprints at this scale, in zone metres
  const things = [
    ...(rec.buildings || []).map(b => ({ list: 'buildings', item: b, r: 0.5 * Math.min(b.w || 7, b.d || 6) * Math.max(0.75, k), full: 0.5 * Math.min(b.w || 7, b.d || 6), name: b.want })),
    ...(rec.models || []).filter(m => !isRow(m)).map(m => ({ list: 'models', item: m, r: modelRadius(models, m.id) * (m.scale || 1), full: modelRadius(models, m.id) * (m.scale || 1), name: m.id })),
    ...(rec.fields || []).map(f => ({ list: 'fields', item: f, r: 0.5 * Math.min(f.w || 10, f.d || 8) * k, full: 0.5 * Math.min(f.w || 10, f.d || 8), name: (f.crop || 'crop') + ' field', field: true })),
    ...(rec.props || []).filter(p => p.kind !== 'ground').map(p => ({ list: 'props', item: p, r: PROP_R, full: PROP_R, name: p.id, prop: true })),
  ].filter(t => !gone.has(t.item)).map(t => ({ ...t, ...W(t.item) }));
  // an ANCHOR stays whatever it stands on: the model a quest object is part of (the crypt door you use, the notice
  // post you read) — the server puts that object at the same scaled spot, so moving the model would strand it
  const anchor = t => !t.prop && !t.field && (rec.objects || []).some(o => Math.hypot((o.x || 0) - (t.item.x || 0), (o.z || 0) - (t.item.z || 0)) <= 2.5);
  for (const t of things) {
    if (anchor(t)) { t.anchor = true; continue; }
    const hit = B.discs.find(d => Math.hypot(d.x - t.x, d.z - t.z) < d.r + t.r * 0.6);
    if (hit) { add('inB', t.list, t.item, `lands in ${hit.what}`); continue; }
    if (inPond(t, B.pond) && !/jetty|rowboat|fish_trap|sluice/.test(t.name)) { add('inB', t.list, t.item, "lands in B's mill pond"); continue; }
    if (B.walled && !inPoly(t, B.walled)) { add('outside', t.list, t.item, "lands outside B's wall"); continue; }
    const wall = !t.field && B.lines.find(l => l.pts.some((q, i) => i && segDist(t, l.pts[i - 1], q) < Math.min(1, t.r * 0.5)));
    if (wall) add('inB', t.list, t.item, `stands in B's ${wall.kind}`);
  }
  // crowded: our own solid things (not loose props, not fields) on top of each other only because the spacing shrank
  const solid = things.filter(t => !t.prop && !t.field && !gone.has(t.item));
  for (let i = 0; i < solid.length; i++) for (let j = 0; j < i; j++) {
    const a = solid[i], b = solid[j]; if (gone.has(a.item) || gone.has(b.item) || a.anchor) continue;
    const now = Math.hypot(a.x - b.x, a.z - b.z), was = Math.hypot(a.item.x - b.item.x, a.item.z - b.item.z);
    if (now < (a.r + b.r) * 0.75 && was >= (a.full + b.full) * 0.75) add('crowded', a.list, a.item, `${a.name} on top of ${b.name} (${now.toFixed(1)} m apart, they need ${(a.r + b.r).toFixed(1)})`);
  }
  // rows that stay: each section must start where the last ends AFTER scaling
  const rows = rowsOf((rec.models || []).filter(m => !gone.has(m))).filter(r => { const al = r.axis; const step = (r.items[r.items.length - 1][al] - r.items[0][al]) / (r.items.length - 1); return step * k < ROWS[r.id] * 0.85; });
  return { out, rows };
}

/** Every bound set piece of every zone -> [{ zone, id, piece, scale, out, rows }] */
export function checkAll(doc = readJ(FILE)) {
  const recipes = new Map(doc.vignettes.map(v => [v.id, v])), res = [];
  for (const f of readdirSync(new URL('data/vignettes/placements/', ROOT)).filter(n => /^z\d+_\d+\.json$/.test(n))) {
    const file = readJ('data/vignettes/placements/' + f), bound = file.placements.filter(p => p.bound && p.scale > 0 && p.scale < 1);
    if (!bound.length) continue;
    const bake = readJ(`data/zones/${file.zone}/placements.json`).placements;
    for (const pl of bound) {
      const rec = recipes.get(pl.recipe || pl.id), B = bakedPiece(bake, pl.bound);
      if (!rec || !B) continue;
      res.push({ zone: file.zone, id: rec.id, piece: B.kind, scale: pl.scale, rec, ...misfits(rec, pl, B, doc.models) });
    }
  }
  return res;
}

/** Take the misfits out (into `ifFree`) and re-space the rows. */
export function fix(doc) {
  const res = checkAll(doc);
  for (const r of res) {
    for (const m of r.out) {
      const list = r.rec[m.list], i = list.indexOf(m.item); if (i < 0) continue;
      list.splice(i, 1);
      ((r.rec.ifFree ||= {})[m.list] ||= []).push(m.item);
    }
    for (const row of r.rows) {
      const al = row.axis, L = ROWS[row.id], first = row.items[0][al], last = row.items[row.items.length - 1][al];
      const realLen = (last - first) * r.scale + L, n = Math.max(1, Math.round(realLen / L)), step = L / r.scale, mid = (first + last) / 2;
      const keep = row.items.slice(0, n), spare = row.items.slice(n);
      keep.forEach((m, i) => { m[al] = +(mid + (i - (n - 1) / 2) * step).toFixed(2); });
      for (const m of spare) { r.rec.models.splice(r.rec.models.indexOf(m), 1); ((r.rec.ifFree ||= {}).models ||= []).push(m); }
      row.respaced = { from: row.items.length, to: n, step: +step.toFixed(2) };
    }
    if (r.rec.ifFree) r.rec.ifFree._doc = 'What this place also has when it stands on open ground at full size. Moved here by tools/content-fit.mjs because the piece is bound onto one of stream B\'s ground pieces, which is smaller and draws its own (wall, graves, buildings, stones). Nothing draws this block.';
  }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const FIX = process.argv.includes('--fix');
  const text = readFileSync(new URL(FILE, ROOT), 'utf8'), doc = JSON.parse(text);
  const res = FIX ? fix(doc) : checkAll(doc);
  let n = 0;
  for (const r of res) {
    const by = {}; for (const m of r.out) (by[m.rule] ||= []).push(m);
    n += r.out.length + r.rows.length;
    console.log(`${r.zone} ${r.id} on B's ${r.piece} (scale ${r.scale}): ${r.out.length} misfit(s), ${r.rows.length} crowded row(s)`);
    for (const [rule, l] of Object.entries(by)) { const c = {}; for (const m of l) c[(m.item.id || m.item.want || m.item.crop) + ' — ' + m.why] = (c[(m.item.id || m.item.want || m.item.crop) + ' — ' + m.why] || 0) + 1; for (const [t, q] of Object.entries(c)) console.log(`   ${rule.padEnd(8)} ${q > 1 ? q + ' x ' : ''}${t}`); }
    for (const row of r.rows) console.log(`   row      ${row.items.length} x ${row.id} along ${row.axis} at ${row.axis === 'x' ? 'z' : 'x'} ${row.line}${row.respaced ? ` -> ${row.respaced.to} sections every ${row.respaced.step} m` : ''}`);
  }
  if (FIX) { const out = JSON.stringify(doc, null, 1) + '\n'; if (out !== text) writeFileSync(new URL(FILE, ROOT), out); console.log(`fit: ${n} thing(s) fixed; setpieces.json ${out === text ? 'unchanged' : 'written'}`); }
  else { console.log(`fit: ${n} misfit(s) in ${res.length} bound set pieces`); if (n) process.exit(1); }
}
