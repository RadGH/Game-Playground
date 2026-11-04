// Resource nodes and finding them. PURE.
//
// Owner (2026-11-03): ores are hidden until SCANNED. Scanning is automatic in a radius around your
// towns; outposts scan the land near them; scouts ride out (on their own toward unscanned land, or
// where you send them). Nodes never run out — a richer node is just faster to work.
//
// Nodes are generated from the macro map and the seed (the same every time), so only the FOUND set
// is saved. Rocky biomes hold ore; crystal fields hold crystal; forests are visible wood anyway.

import { makeRng, subSeed } from '../planet/noise.js';
import { BIOME } from '../planet/biomes.js';

const KINDS_BY_BIOME = {
  [BIOME.hills]:    [['iron', 3], ['coal', 3], ['granite', 2]],
  [BIOME.mountain]: [['iron', 4], ['coal', 3], ['granite', 2], ['gold', 1]],
  [BIOME.peak]:     [['iron', 2], ['gold', 1]],
  [BIOME.volcanic]: [['coal', 3], ['iron', 2], ['gold', 1]],
  [BIOME.crystal]:  [['crystal', 5], ['iron', 1]],
  [BIOME.ruins]:    [['granite', 2], ['crystal', 1]],
};
const CHANCE = { [BIOME.hills]: 0.05, [BIOME.mountain]: 0.08, [BIOME.peak]: 0.04, [BIOME.volcanic]: 0.07, [BIOME.crystal]: 0.09, [BIOME.ruins]: 0.05 };

export function generateNodes(macro) {
  const rng = makeRng(subSeed(macro.seed, 'nodes'));
  const nodes = [];
  const mc = macro.macroCell;
  for (let my = 0; my < macro.mh; my++) for (let mx = 0; mx < macro.mw; mx++) {
    const b = macro.biome[my * macro.mw + mx];
    const p = CHANCE[b]; const r = rng();
    if (!p || r > p) continue;
    const list = KINDS_BY_BIOME[b];
    let tot = 0; for (const [, w] of list) tot += w;
    let pick = rng() * tot, kind = list[0][0];
    for (const [k, w] of list) { pick -= w; if (pick <= 0) { kind = k; break; } }
    const rich = rng() < 0.15 ? 3 : rng() < 0.45 ? 2 : 1;
    nodes.push({ id: nodes.length + 1, kind, rich, x: Math.floor((mx + 0.2 + rng() * 0.6) * mc), y: Math.floor((my + 0.2 + rng() * 0.6) * mc), r: 5 + rich * 2 });
  }
  return nodes;
}

export function createDiscovery(sim, data) {
  const S = sim.state.discover ??= { found: [], scouts: [], nextScout: 1 };
  const found = new Set(S.found);
  const nodes = sim.nodes = generateNodes(sim.macro);
  // a coarse bucket grid so "nodes near (x, y)" is cheap on a big planet
  const B = 128, bw = Math.ceil(sim.W / B);
  const buckets = new Map();
  for (const n of nodes) { const k = Math.floor(n.x / B) + Math.floor(n.y / B) * bw; let l = buckets.get(k); if (!l) buckets.set(k, l = []); l.push(n); }
  const W = sim.W;
  const dist = (ax, ay, bx, by) => { let dx = Math.abs(ax - bx); if (dx > W / 2) dx = W - dx; return Math.hypot(dx, ay - by); };
  function near(x, y, r) {
    const out = [];
    const r0 = Math.ceil(r / B);
    const bx = Math.floor(x / B), by = Math.floor(y / B);
    for (let dy = -r0; dy <= r0; dy++) for (let dx = -r0; dx <= r0; dx++) {
      const kx = ((bx + dx) % bw + bw) % bw, ky = by + dy;
      for (const n of buckets.get(kx + ky * bw) || []) if (dist(x, y, n.x, n.y) <= r) out.push(n);
    }
    return out;
  }
  function scan(x, y, r, who) {
    for (const n of near(x, y, r)) {
      if (found.has(n.id)) continue;
      found.add(n.id); S.found.push(n.id);
      sim.events.push({ t: 'say', text: `${who} found ${NAMES[n.kind]}${n.rich === 3 ? ' — a rich seam' : ''}.`, kind: 'good', x: n.x, y: n.y });
      sim.events.push({ t: 'node', id: n.id });
    }
  }
  const NAMES = { iron: 'iron ore', coal: 'coal', granite: 'good building stone', gold: 'gold', crystal: 'mana crystals' };

  // ---- scouts: riders who go out, scan as they go, and come home
  const SCOUT_R = data.scoutRadius ?? 110, SCOUT_SPEED = 0.22;
  function addScout(town, target = null) {
    const s = { id: S.nextScout++, town: town.id, x: town.x, y: town.y + 8, tx: 0, ty: 0, home: false, target: !!target, hp: 10 };
    if (target) { s.tx = target.x; s.ty = target.y; } else pickTarget(s, town);
    S.scouts.push(s);
    return s;
  }
  function pickTarget(s, town) {
    // head for the least-scanned direction: try a few and keep the one with the most unfound nodes
    // (scouts don't know where nodes are; they pick by how little of that way has been seen)
    let best = null, bs = -1;
    for (let k = 0; k < 8; k++) {
      const a = sim.rng() * Math.PI * 2, d = 250 + sim.rng() * 450;
      const x = town.x + Math.cos(a) * d, y = Math.max(40, Math.min(sim.H - 40, town.y + Math.sin(a) * d));
      const seen = S.found.length ? near(x, y, SCOUT_R).filter(n => found.has(n.id)).length : 0;
      const score = sim.rng() * 2 - seen;
      if (score > bs) { bs = score; best = { x, y }; }
    }
    s.tx = best.x; s.ty = best.y; s.home = false;
  }
  function moveScout(s) {
    const town = sim.state.town?.towns?.find(t => t.id === s.town);
    let dx = s.tx - s.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const dy = s.ty - s.y, d = Math.hypot(dx, dy);
    if (d < 2) {
      if (s.home || !town) { s.done = true; return; }
      s.tx = town.x; s.ty = town.y + 8; s.home = true; return;
    }
    // ride around water: if the next step is water or ice, veer
    let ang = Math.atan2(dy, dx);
    for (let k = 0; k < 7; k++) {
      const a = ang + [0, 0.5, -0.5, 1, -1, 1.6, -1.6][k];
      const nx = s.x + Math.cos(a) * 2, ny = s.y + Math.sin(a) * 2;
      const at = sim.cell(nx, ny);
      if (at && !sim.M.liquid[at.c.mat[at.i]] && sim.M.walk[at.c.ground[at.i]]) { ang = a; break; }
      if (k === 6) { s.stuck = (s.stuck || 0) + 1; }
    }
    if ((s.stuck || 0) > 40) { s.stuck = 0; if (town) { if (s.home) { s.done = true; return; } s.tx = town.x; s.ty = town.y + 8; s.home = true; } }
    s.x = ((s.x + Math.cos(ang) * SCOUT_SPEED) % W + W) % W; s.y += Math.sin(ang) * SCOUT_SPEED;
  }

  function step() {
    const towns = sim.state.town?.towns || [];
    const blds = sim.state.town?.buildings || [];
    if (sim.tick % 40 === 0) {
      for (const t of towns) scan(t.x, t.y, data.townScan ?? 260, t.name);
      for (const b of blds) if (b.state === 'up' && data.kinds[b.kind]?.scan && b.kind !== 'keep') scan(b.x, b.y, data.kinds[b.kind].scan, 'Your outpost');
      for (const s of S.scouts) scan(s.x, s.y, SCOUT_R, 'A scout');
    }
    for (const s of S.scouts) {
      moveScout(s);
      if (sim.tick % 10 === 0 && sim.enemiesNear?.(s.x, s.y, 2.5)) { s.done = true; s.dead = true; sim.events.push({ t: 'say', text: 'A scout was killed.', kind: 'bad', x: s.x, y: s.y }); }
    }
    for (const s of S.scouts.filter(s => s.done)) {
      S.scouts.splice(S.scouts.indexOf(s), 1);
      const t = towns.find(t => t.id === s.town);
      if (t && !s.target && !s.dead) addScout(t);        // a free scout keeps exploring (a killed one is replaced later)
    }
    // every town keeps one scout riding out on its own
    if (sim.tick % 20 === 0) for (const t of towns) if (!S.scouts.some(s => s.town === t.id)) addScout(t);
  }
  function order(o) {
    if (o.t === 'scout') {
      const t = (sim.state.town?.towns || []).slice().sort((a, b) => dist(o.x, o.y, a.x, a.y) - dist(o.x, o.y, b.x, b.y))[0];
      if (!t) return null;
      if ((sim.state.town.gold ?? 0) < (data.scoutCost ?? 20)) return { error: 'Not enough gold.' };
      sim.state.town.gold -= data.scoutCost ?? 20;
      return addScout(t, { x: o.x, y: o.y });
    }
    return null;
  }
  const nodeAt = (x, y) => near(x, y, 12).filter(n => found.has(n.id)).sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y))[0] || null;
  /** Found nodes in a world rect (for the map), x unwrapped near the rect. */
  function view(rect) {
    const out = [];
    if (!rect) return out;
    const cx = (rect.x0 + rect.x1) / 2, cy = (rect.y0 + rect.y1) / 2, r = Math.hypot(rect.x1 - rect.x0, rect.y1 - rect.y0) / 2 + 20;
    for (const n of near(cx, cy, r)) if (found.has(n.id)) out.push([n.id, n.kind, n.x, n.y, n.rich, n.r]);
    return out;
  }
  return { id: 'discover', step, order, near, nodeAt, isFound: id => found.has(id), view, scouts: () => S.scouts, nodes, NAMES };
}
