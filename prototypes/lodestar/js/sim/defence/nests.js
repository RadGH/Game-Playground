// Nests (PLAN M4). PURE. 6-10 on the home map, laid from the seed far from the HQ, in or beside the woods. Each has a
// stage (1-5) that grows over time and faster when Noise (and Glow, by the family's weights) reaches it; it sends
// raids when its raid timer runs out (fed nests often, unfed ones rarely, none before the difficulty's grace time);
// from stage `budAt` it buds new stage-1 nests nearby; destroyed, it leaves a core sample (sim.samples, M9 reads it).
// Nest entity (§3.2 `nest`): { kind: 'nest', type: family, stage, fed, budTimer, grow, raidTimer, r, hp, hpMax,
//   team: 1, seen }.

import { SUB } from '../entities.js';
import { OWNED, SCORCH, EDGE, BURN } from '../../world/grid.js';
import { walkable, floodMask } from '../../world/edges.js';
import { hash2 } from '../rng.js';
import { hyp, dir, powi } from './maths.js';

export function createNests(sim, DD) {
  const { g, M } = sim.world;
  const N = DD.N;
  const W = g.W, H = g.H;
  const rng = sim.rng.split('defence.nests');
  const fam = 'skitterkin';
  const lastHit = new Map();

  const list = () => sim.ents.list('nest');
  const centre = (n) => [n.x / SUB, n.y / SUB];
  const area = () => (W * H) / (1536 * 1536);

  /** Can a nest of radius r sit at (x, y)? Open land, nothing built, not on water. */
  function fits(x, y, r) {
    if (x - r < N.edgeGap || y - r < N.edgeGap || x + r >= W - N.edgeGap || y + r >= H - N.edgeGap) return false;
    for (let dy = -r - 1; dy <= r + 1; dy += 2) for (let dx = -r - 1; dx <= r + 1; dx += 2) {
      const c = g.cells[g.idx(x + dx, y + dy)];
      const m = c & 255;
      if ((c & (OWNED | EDGE)) || M.water[m] || M.hot[m] || !M.walk[m] || M.ore[m]) return false;
    }
    return true;
  }
  function woods(x, y) {
    let n = 0;
    for (let k = 0; k < 24; k++) { const [ca, sa] = dir(k / 24), d = 6 + (k % 4) * 6; const xx = Math.round(x + ca * d), yy = Math.round(y + sa * d); if (g.inside(xx, yy) && (g.cells[g.idx(xx, yy)] & 255) === M.id.tree) n++; }
    return n;
  }

  /** Lay the starting nests (a real map only; the flat test maps have none). */
  function layout() {
    const hq = sim.world.meta.hq;
    const scale = Math.sqrt(area());
    const want = Math.max(3, Math.min(N.max, Math.round((N.count[0] + rng.int(N.count[1] - N.count[0] + 1)) * area())));
    // what can be walked to from the HQ (raids must be able to reach it)
    const walk = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) walk[y * W + x] = walkable(M, g.cells[g.idx(x, y)]) ? 1 : 0;
    const reach = floodMask(walk, W, H, hq.x, hq.y);
    const minHq = N.minHqDist * scale, gap = N.minGap * scale;
    const cands = [];
    for (let k = 0; k < 3000; k++) {
      const x = N.edgeGap + 12 + rng.int(W - 2 * N.edgeGap - 24), y = N.edgeGap + 12 + rng.int(H - 2 * N.edgeGap - 24);
      const d = hyp(x - hq.x, y - hq.y);
      if (d < minHq || !reach[y * W + x] || !fits(x, y, 6)) continue;
      cands.push({ x, y, d, s: woods(x, y) * 4 + rng.float() * 30 });
    }
    cands.sort((a, b) => b.s - a.s || a.y - b.y || a.x - b.x);
    const picked = [];
    for (const c of cands) {
      if (picked.length >= want) break;
      if (picked.some((p) => hyp(p.x - c.x, p.y - c.y) < gap)) continue;
      picked.push(c);
    }
    picked.sort((a, b) => a.d - b.d);
    picked.forEach((p, i) => add(p.x, p.y, N.startStages[Math.min(N.startStages.length - 1, i)]));
  }

  function add(x, y, stage) {
    const st = DD.stage(stage);
    const n = sim.ents.add('nest', {
      type: fam, x: Math.round((x + 0.5) * SUB), y: Math.round((y + 0.5) * SUB), team: 1, stage, fed: 0, grow: 0,
      budTimer: 0, raidTimer: st.raidEvery * (0.6 + rng.float() * 0.6), r: st.r, hp: st.hp, hpMax: st.hp, seen: false, guardIn: 0,
    });
    stamp(n);
    sim.defence.blockVer++;
    sim.routeVer++;
    return n;
  }

  /** The mound in cells: a disc of nest with glowing pores. */
  function stamp(n) {
    const [cx, cy] = centre(n), r = n.r;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      const rag = r + ((hash2(dx + (cx | 0), dy + (cy | 0), 5) & 3) - 1.5) * 0.5;
      if (d2 > rag * rag) continue;
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
      if (!g.inside(x, y)) continue;
      const i = g.idx(x, y), c = g.cells[i], m = c & 255;
      if ((c & EDGE) || M.water[m] || M.hot[m] || ((c & OWNED) && m !== M.id.nest && m !== M.id.nest_pore)) continue;
      const pore = (hash2(x, y, 9) & 15) === 0 && d2 < (r - 1) * (r - 1);
      g.cells[i] = ((pore ? M.id.nest_pore : M.id.nest) | (M.ambient << 8) | OWNED) >>> 0;
      g.ver[i >>> 12]++;
      if (pore) g.emitHint[i >>> 12] = 1;
    }
  }
  function unstamp(n) {
    const [cx, cy] = centre(n), r = n.r + 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy;
      if (!g.inside(x, y)) continue;
      const i = g.idx(x, y), m = g.cells[i] & 255;
      if (m !== M.id.nest && m !== M.id.nest_pore) continue;
      g.cells[i] = (M.id.rubble | (170 << 8) | SCORCH) >>> 0; g.ver[i >>> 12]++; g.regrowHint[i >>> 12] = 1;
    }
    g.wakeAt(Math.floor(cx), Math.floor(cy));
  }

  /** The cells round a nest an enemy can stand on (where raids and guards come out). */
  function exits(n) {
    const [cx, cy] = centre(n), out = [];
    for (let k = 0; k < 32; k++) {
      const [ca, sa] = dir(k / 32);
      for (let d = n.r + 1; d <= n.r + 6; d++) {
        const x = Math.round(cx + ca * d), y = Math.round(cy + sa * d);
        if (g.inside(x, y) && walkable(M, g.cells[g.idx(x, y)])) { out.push([x, y]); break; }
      }
    }
    return out;
  }

  function heard(n) {
    const F = DD.F[n.type] || {};
    const [x, y] = centre(n);
    return Math.min(1, (sim.defence.fields.noiseAt(x, y) * (F.noiseWeight ?? 1) + sim.defence.fields.glowAt(x, y) * (F.glowWeight ?? 0)) / 255);
  }

  function step() {
    const every = N.every;
    const D = sim.defence;
    for (const n of [...list()]) {
      const [x, y] = centre(n);
      if (!n.seen && g.fog[g.qIdx(Math.floor(x), Math.floor(y))] >= 1) { n.seen = true; sim.events.push({ e: 'nestSeen', tick: sim.tick, base: sim.base, id: n.id, stage: n.stage, x: Math.round(x), y: Math.round(y) }); }
      n.fed = n.fed * (1 - N.feedRate) + heard(n) * N.feedRate;
      const st = DD.stage(n.stage);
      // growth
      if (n.stage < N.stages.length && st.growTicks > 0) {
        n.grow += (every / st.growTicks) * (1 + N.feedGrow * n.fed);
        if (n.grow >= 1) grow(n);
      }
      // budding
      if (n.stage >= N.budAt) {
        n.budTimer += every;
        if (n.budTimer >= N.budTicks) { n.budTimer = 0; bud(n); }
      }
      // guards trickle back
      const guards = sim.ents.list('enemy').filter((e) => e.nest === n.id && e.state === 'guard').length;
      const want = Object.values(st.guards).reduce((a, k) => a + k, 0);
      n.guardIn -= every;
      if (guards < want && n.guardIn <= 0 && !D.over) {
        n.guardIn = 600;
        const have = {};
        for (const e of sim.ents.list('enemy')) if (e.nest === n.id && e.state === 'guard') have[e.type] = (have[e.type] || 0) + 1;
        const type = Object.keys(st.guards).find((t) => (have[t] || 0) < st.guards[t]);
        const ex = exits(n);
        if (type && ex.length) { const [gx, gy] = ex[rng.int(ex.length)]; D.enemies.spawn(type, gx, gy, { nest: n.id, state: 'guard' }); }
      }
      // raids
      if (sim.tick >= D.grace && !D.over) {
        n.raidTimer -= every * (N.raidBase + N.feedRaid * n.fed);
        if (n.raidTimer <= 0) {
          n.raidTimer = st.raidEvery * (0.85 + rng.float() * 0.3);
          D.raids.form(n);
        }
      }
    }
  }

  function grow(n) {
    n.grow = 0;
    n.stage++;
    const st = DD.stage(n.stage);
    n.hp = Math.round((n.hp / n.hpMax) * st.hp); n.hpMax = st.hp; n.r = st.r;
    stamp(n);
    sim.defence.blockVer++; sim.routeVer++;
    const [x, y] = centre(n);
    sim.events.push({ e: 'nestGrew', tick: sim.tick, base: sim.base, id: n.id, stage: n.stage, x: Math.round(x), y: Math.round(y), seen: n.seen });
  }

  function bud(n) {
    if (list().length >= N.max) return null;
    const [cx, cy] = centre(n);
    for (let k = 0; k < 40; k++) {
      const [ca, sa] = dir(rng.float()), d = N.budDist[0] + rng.float() * (N.budDist[1] - N.budDist[0]);
      const x = Math.round(cx + ca * d), y = Math.round(cy + sa * d);
      if (!fits(x, y, DD.stage(1).r + 1)) continue;
      if (list().some((o) => hyp(o.x / SUB - x, o.y / SUB - y) < 30)) continue;
      const hq = sim.ents.list('building').find((b) => b.type === 'hq');
      if (hq && hyp(hq.fp.cx - x, hq.fp.cy - y) < N.minHqDist * 0.5) continue;
      const c = add(x, y, 1);
      sim.events.push({ e: 'nestBudded', tick: sim.tick, base: sim.base, id: c.id, from: n.id, stage: 1, x, y, seen: g.fog[g.qIdx(x, y)] >= 1 });
      return c;
    }
    return null;
  }

  function damage(n, amount, source) {
    n.hp -= amount;
    const [x, y] = centre(n);
    if (sim.tick - (lastHit.get(n.id) ?? -1e9) >= 20) { lastHit.set(n.id, sim.tick); sim.events.push({ e: 'damaged', tick: sim.tick, base: sim.base, id: n.id, type: 'nest', frac: Math.max(0, n.hp / n.hpMax), x: Math.round(x), y: Math.round(y) }); }
    // the guards come out for whoever is shooting
    if (source.from) sim.defence.raids.defend(n, source.from);
    if (n.hp <= 0) clear(n, source);
    return amount;
  }

  function clear(n, source) {
    const [x, y] = centre(n);
    unstamp(n);
    sim.ents.remove(n.id);
    sim.dirty.add(n.id);
    sim.world.blast(Math.floor(x), Math.floor(y), n.r + 2, 0.8, { by: 'ruin' });
    sim.samples = sim.samples || [];
    sim.samples.push({ kind: 'nest-core', family: n.type, stage: n.stage, tick: sim.tick });
    sim.defence.blockVer++; sim.routeVer++;
    // the guards scatter into the woods
    for (const e of [...sim.ents.list('enemy')]) if (e.nest === n.id && e.state === 'guard') sim.defence.enemies.remove(e);
    sim.events.push({ e: 'nestCleared', tick: sim.tick, base: sim.base, id: n.id, stage: n.stage, sample: true, x: Math.round(x), y: Math.round(y), by: source.kind });
  }

  return { layout, add, step, damage, list, exits, centre, bud, grow, heard, stamp };
}
