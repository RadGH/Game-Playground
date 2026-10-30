// A game session: one world + creatures + villages + spells + mana + (for a challenge) goals.
// PURE — no DOM, so tests can play a whole level in memory.
//
//   const s = createSession(data, { mode: 'challenge', level, seed, unlocked, spellLevels });
//   s.use('spell:meteor', x, y)     -> { ok, reason?, cost }
//   s.use('material:water', x, y, { brush: 4 })
//   s.step()                        one tick (30 a second)
//   s.result                        null while playing, then { won, stars, reason }

import { createSim, TICKS_PER_SECOND } from '../sim/index.js';
import { compileMaterials } from '../sim/materials.js';
import { createCreatures, compileCreatures } from '../sim/creatures.js';
import { createVillages } from '../sim/village.js';
import { createSpells } from '../sim/spells.js';
import { generate, findSpot } from '../sim/mapgen.js';
import { paint, ignite, setCell, raise, BURN } from '../sim/world.js';
import { makeRng } from '../sim/rng.js';
import { createObjectives } from './objectives.js';

export const TPS = TICKS_PER_SECOND;
export const BASE_RADIUS = 13;
const SWARM_PLACE = { mite: 14, rabbit: 2, chicken: 2, fish: 3, frog: 2, wisp: 3 };

/** Compile the data once (materials + creatures) and reuse it across sessions. */
export function prepareData(raw) {
  if (raw.compiled) return raw;
  return { ...raw, compiled: compileMaterials(raw.materials), species: compileCreatures(raw.creatures) };
}

export function createSession(rawData, cfg = {}) {
  const data = prepareData(rawData);
  const level = cfg.level ? structuredClone(cfg.level) : null;
  const map = level?.map || cfg.map || {};
  const W = map.W ?? cfg.W ?? 224, H = map.H ?? cfg.H ?? 224;
  const seed = map.seed ?? cfg.seed ?? ((Math.random() * 1e9) | 0);
  const sim = createSim(data, { W, H, seed, discovered: cfg.discovered });
  const w = sim.world, M = sim.M, ID = M.id;
  const rng = makeRng(seed ^ 0x5eed);
  sim.creatures = createCreatures(sim, data.species);
  sim.systems.push(sim.creatures);
  sim.village = createVillages(sim, data.buildings);
  sim.systems.push(sim.village);
  sim.spells = createSpells(sim, data.spells);
  sim.systems.push(sim.spells);

  const s = {
    data, sim, cfg, level, mode: cfg.mode || 'sandbox', seed,
    mana: { cur: 0, max: 100, regen: 1 },
    endless: !!cfg.endlessMana,
    cds: {},
    stats: { manaUsed: 0, casts: {}, ticks: 0, placed: 0 },
    result: null,
    info: null,
    pageMana: {},
    unlocked: new Set(cfg.unlocked || []),
    spellLevels: cfg.spellLevels || {},
    toasts: [],
    paused: false,
  };
  for (const p of data.grimoire.pages) if (p.mana != null) s.pageMana[p.id] = p.mana;

  // ---------- the land ----------
  const free = !level;   // anything that is not a tuned level
  const grow = cfg.scaleMap ? Math.max(1, W * H / (224 * 224)) : 1;
  s.info = generate(w, data.biomes, map.recipe || cfg.recipe || 'greenvale', seed, { recipe: map.override, dormantVents: map.dormantVents, extraSites: map.extraSites, calmSea: free, grow, siteMargin: cfg.scaleMap ? Math.round(Math.min(W, H) * 0.2) : undefined });
  if (grow > 1) w.popScale = Math.min(2.5, Math.sqrt(grow));
  if (map.ops) for (const op of map.ops) terrainOp(op);
  if (map.clock != null) w.clock = map.clock;
  if (map.dayLength) w.dayLength = map.dayLength;
  if (map.wind) { w.wind.x = map.wind[0]; w.wind.y = map.wind[1]; w.wind.strength = map.wind[2] ?? 1; w.windLocked = !!map.windLocked; }
  if (map.freezeTime) w.freezeTime = true;

  // villages + wildlife
  const villageCfg = level?.villages ?? cfg.villages;
  const sites = s.info.sites;
  // base 'choose': the land is shown first and the first village waits for the player's tap (s.placeBase below)
  s.placing = !level && cfg.base === 'choose' ? { r: cfg.baseRadius ?? BASE_RADIUS } : null;
  if (villageCfg !== false && !s.placing) {
    const vlist = Array.isArray(villageCfg) ? villageCfg : sites.map(() => cfg.villageTemplate || {});
    vlist.forEach((vc, k) => {
      const at = vc.at ? { x: vc.at[0], y: vc.at[1] } : sites[k];
      if (!at) return;
      if (vc.at) clearArea(at.x, at.y, 13);
      sim.village.found(at.x, at.y, { name: vc.name, people: vc.people ?? 5, prebuilt: vc.prebuilt, wardens: vc.wardens, mages: vc.mages, food: vc.food, wood: vc.wood, stone: vc.stone });
    });
  }
  const herds = cfg.herds === false ? [] : level?.herds ?? s.info.recipe.herds ?? [];
  for (const [sp, groups, size] of herds) {
    for (let g = 0; g < groups; g++) {
      const want = data.species[sp]?.aquatic ? 'water' : 'land';
      const at = findSpot(w, s.info, rng, want, sites.map(v => ({ x: v.x, y: v.y, r: 22 })));
      if (!at) continue;
      for (let k = 0; k < size; k++) {
        const x = at.x + ((rng() * 6) | 0) - 3, y = at.y + ((rng() * 6) | 0) - 3;
        if (want === 'water' ? M.liquid[w.mat[y * W + x]] : !M.solid[w.mat[y * W + x]] && !M.liquid[w.mat[y * W + x]]) sim.creatures.add(sp, x, y);
      }
    }
  }
  if (cfg.fish !== false && !level) {
    for (let k = 0; k < 4; k++) {
      const at = findSpot(w, s.info, rng, 'water');
      if (!at) break;
      for (let n = 0; n < 4; n++) { const x = at.x + n % 2, y = at.y + (n >> 1); if (w.inside(x, y) && M.liquid[w.mat[y * W + x]]) sim.creatures.add('fish', x, y); }
    }
  }

  // ---------- level setup ----------
  if (level) {
    // mana is tight to begin with; the Deeper Well and Quicker Flow boons widen it (cfg.manaScale)
    const ms = cfg.manaScale ?? 0.75, rs = cfg.regenScale ?? 0.75;
    s.mana.max = Math.round((level.mana?.max ?? 100) * ms);
    s.mana.cur = Math.min(s.mana.max, Math.round((level.mana?.start ?? 60) * ms));
    s.mana.regen = +((level.mana?.regen ?? 1) * rs).toFixed(2);
    s.unlocked = new Set([...(level.loadout || []), ...(cfg.extraTools || [])]);
    for (const sp of level.spawns || []) if (!sp.time && !sp.every) spawnGroup(sp);
    s.objectives = createObjectives(s, level);
  } else {
    s.mana.max = cfg.manaMax ?? 100;
    s.mana.regen = cfg.manaRegen ?? 1;
    s.mana.cur = cfg.manaStart ?? s.mana.max * 0.5;
  }

  function clearArea(x, y, r) {
    for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) {
      if (!w.inside(xx, yy) || (xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
      const i = yy * W + xx;
      if (M.liquid[w.mat[i]] && w.mat[i] !== ID.lava) { w.mat[i] = 0; w.life[i] = 0; }
      if (w.mat[i] && !M.liquid[w.mat[i]]) w.mat[i] = 0;
      if (w.ground[i] === ID.sand || w.ground[i] === ID.snow || w.ground[i] === ID.rock) w.ground[i] = ID.grass;
    }
  }

  /** Map edits a level asks for: vents, lava pools, forests, walls, flattening... */
  function terrainOp(op) {
    const [x, y] = op.at || [W >> 1, H >> 1];
    const r = op.r ?? 6;
    switch (op.op) {
      case 'flatten': {
        let sum = 0, n = 0;
        for (let yy = y - r; yy <= y + r; yy++) for (let xx = x - r; xx <= x + r; xx++) if (w.inside(xx, yy)) { sum += w.height[yy * W + xx]; n++; }
        const h = op.h ?? Math.round(sum / Math.max(1, n));
        const R2 = Math.ceil(r * 1.3);
        for (let yy = y - R2; yy <= y + R2; yy++) for (let xx = x - R2; xx <= x + R2; xx++) {
          if (!w.inside(xx, yy)) continue;
          const d = Math.hypot(xx - x, yy - y) / r;
          if (d > 1.3) continue;
          const k = d < 1 ? 1 : 1 - (d - 1) / 0.3;
          const i = yy * W + xx;
          w.height[i] = Math.round(w.height[i] * (1 - k) + h * k);
        }
        w.heightVer++; break;
      }
      case 'raise': raise(w, x, y, r, op.h ?? 20); break;
      case 'ridge': {
        // raise (h > 0) or dig (h < 0) along a line: a dyke, a trench, a river bed
        const [x2, y2] = op.to, n = Math.max(1, Math.ceil(Math.hypot(x2 - x, y2 - y) / Math.max(1, r / 2)));
        for (let k = 0; k <= n; k++) raise(w, x + (x2 - x) * k / n, y + (y2 - y) * k / n, r, (op.h ?? 20) / 2);   // steps of r/2 overlap about twice
        break;
      }
      case 'clear': clearArea(x, y, r); break;
      case 'paint': paint(w, x, y, r, ID[op.mat], { density: op.density ?? 1, amount: op.amount, rng }); break;
      case 'ground': paint(w, x, y, r, ID[op.mat], { clear: op.clearCells, rng }); break;
      case 'vent': setCell(w, y * W + x, ID.vent); break;
      case 'spring': setCell(w, y * W + x, ID.spring); break;
      case 'slope': {
        // tilt the whole map so liquids run one way: dir [dx, dy], amount over the map
        const [dx, dy] = op.dir;
        for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
          const i = yy * W + xx;
          const t = (dx * (xx / W - 0.5) + dy * (yy / H - 0.5));
          w.height[i] = Math.max(0, Math.min(255, Math.round(w.height[i] * (op.keep ?? 0.3) + (op.base ?? 70) * (1 - (op.keep ?? 0.3)) - t * (op.h ?? 40))));
        }
        w.heightVer++; break;
      }
      case 'line': {
        const [x2, y2] = op.to;
        const n = Math.ceil(Math.hypot(x2 - x, y2 - y));
        for (let k = 0; k <= n; k++) paint(w, x + (x2 - x) * k / n, y + (y2 - y) * k / n, r, ID[op.mat], { density: op.density ?? 1, amount: op.amount, rng });
        break;
      }
      case 'drain': {
        // remove all water (a dry map)
        for (let i = 0; i < w.N; i++) if (w.mat[i] === ID.water) { w.mat[i] = 0; w.life[i] = 0; w.ground[i] = ID.dirt; }
        break;
      }
      case 'dry': {
        for (let i = 0; i < w.N; i++) { if (w.mat[i] === 0 && (w.ground[i] === ID.grass) && rng() < (op.p ?? 0.25)) setCell(w, i, ID.tallgrass); if (w.ground[i] === ID.grass && rng() < 0.4) w.ground[i] = ID.meadow; }
        break;
      }
    }
    w.wakeAll();
  }

  /** Spawn a group: { species, count, at: [x,y] | 'west'/'east'/'north'/'south' | 'village', spread, goal } */
  function spawnGroup(g) {
    let x, y;
    const edge = (side) => {
      const t = 0.25 + rng() * 0.5;
      if (side === 'west') return [4, (H * (g.t ?? t)) | 0];
      if (side === 'east') return [W - 5, (H * (g.t ?? t)) | 0];
      if (side === 'north') return [(W * (g.t ?? t)) | 0, 4];
      return [(W * (g.t ?? t)) | 0, H - 5];
    };
    if (Array.isArray(g.at)) [x, y] = g.at;
    else if (g.at === 'village') { const v = sim.village.list[0]; [x, y] = v ? [v.x, v.y] : [W >> 1, H >> 1]; }
    else [x, y] = edge(g.at || 'west');
    const spread = g.spread ?? 4;
    const goal = g.goal === 'village' ? sim.village.list[0] : Array.isArray(g.goal) ? { x: g.goal[0], y: g.goal[1] } : null;
    const out = [];
    for (let k = 0; k < (g.count ?? 1); k++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * spread;
      const c = sim.creatures.add(g.species, (x + Math.cos(a) * r) | 0, (y + Math.sin(a) * r) | 0, { goal, team: g.team, hpScale: g.hp, leash: g.leash ? { x: g.leash[0], y: g.leash[1], r: g.leash[2] } : null });
      if (c) { if (g.tag) c.tag = g.tag; if (g.hunger != null) c.hunger = g.hunger; if (g.lives != null) c.lives = g.lives; out.push(c); }
    }
    if (g.announce) sim.fire('announce', { text: g.announce, x, y });
    return out;
  }
  s.spawnGroup = spawnGroup;

  /** A point `dir` of the first living village, at most `far` cells out: a threat on a huge map must not need minutes to arrive. */
  s.edgeNear = function (dir, far = 110) {
    const v = sim.village.list.find(q => q.alive);
    if (!v) return dir;
    const dx = dir === 'west' ? -1 : dir === 'east' ? 1 : 0, dy = dir === 'north' ? -1 : dir === 'south' ? 1 : 0;
    const across = (rng() - 0.5) * 60;
    for (let d = far; d > 20; d -= 6) {
      const x = Math.round(v.x + dx * d + dy * across), y = Math.round(v.y + dy * d + dx * across);
      if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) continue;
      const i = y * W + x;
      if (!M.solid[w.mat[i]] && !M.liquid[w.mat[i]]) return [x, y];
    }
    return dir;
  };

  // ---------- choosing where the base goes ----------
  /** Can the base stand here? { ok, reason }. A mode may add its own rule (s.baseRule). */
  s.canBase = function (x, y) {
    x |= 0; y |= 0;
    const r = s.placing?.r ?? BASE_RADIUS, edge = r + 6;
    if (x < edge || y < edge || x >= W - edge || y >= H - edge) return { ok: false, reason: 'Too close to the edge of the world' };
    let wet = 0, n = 0, lo = 255, hi = 0;
    for (let yy = y - r; yy <= y + r; yy += 2) for (let xx = x - r; xx <= x + r; xx += 2) {
      if ((xx - x) ** 2 + (yy - y) ** 2 > r * r) continue;
      const i = yy * W + xx, m = w.mat[i];
      n++;
      if (m === ID.lava) return { ok: false, reason: 'Lava!' };
      if (M.liquid[m]) wet++;
      lo = Math.min(lo, w.height[i]); hi = Math.max(hi, w.height[i]);
    }
    if (wet > n * 0.2) return { ok: false, reason: 'Too much water here' };
    if (hi - lo > 26) return { ok: false, reason: 'Too steep here' };
    return s.baseRule ? s.baseRule(x, y) : { ok: true };
  };
  /** A good place to start the choosing from: the generator's best site, else the nearest spot that works. */
  s.suggestBase = function () {
    for (const site of sites) if (s.canBase(site.x, site.y).ok) return [site.x, site.y];
    for (let r = 0; r < Math.max(W, H) / 2; r += 6) for (let k = 0; k < 16; k++) {
      const x = (W / 2 + Math.cos(k / 16 * 6.283) * r) | 0, y = (H / 2 + Math.sin(k / 16 * 6.283) * r) | 0;
      if (s.canBase(x, y).ok) return [x, y];
    }
    return null;
  };
  s.placeBase = function (x, y) {
    if (!s.placing) return { ok: false, reason: 'The base is already built' };
    x |= 0; y |= 0;
    const can = s.canBase(x, y);
    if (!can.ok) return can;
    const r = s.placing.r;
    s.placing = null;
    clearArea(x, y, r);
    w.wakeAll();
    // nothing with teeth waits inside a brand-new base
    sim.creatures.near(x, y, r + 8, (c) => { if (c.sp.diet === 'hunt' || c.team === 'monster') sim.creatures.remove(c); });
    if (s.onBase) s.onBase(x, y);
    else {
      sim.village.found(x, y, { people: 5 });
      // the land's other villages take their sites, as long as they are not on top of this one
      const rest = sites.filter(q => Math.hypot(q.x - x, q.y - y) > 60).slice(0, Math.max(0, sites.length - 1));
      if (cfg.villages !== false) for (const q of rest) sim.village.found(q.x, q.y, { people: 5 });
    }
    sim.fire('base-placed', { x, y });
    return { ok: true };
  };
  s.terrainOp = terrainOp;

  // ---------- the player's hand ----------
  s.has = (page) => (s.mode === 'sandbox' && s.cfg.everything) || (page.startsWith('structure:') && !!s.run?.build) ? true : s.unlocked.has(page);
  s.costOf = function (page, x, y, o = {}) {
    const [kind, id] = page.split(':');
    if (kind === 'spell') return sim.spells.costOf(id, x, y, o);
    if (kind === 'creature') return (data.species[id]?.cost ?? 1) * (SWARM_PLACE[id] ? 1 : 1);
    if (kind === 'material') return s.pageMana[page] ?? 0.2;
    if (kind === 'tool') return page === 'tool:torch' ? 0.5 : 0;
    if (kind === 'structure') return s.run?.priceOf ? s.run.priceOf(id) : 0;
    return 0;
  };
  s.spend = function (cost) {
    if (s.endless) { s.stats.manaUsed += cost; return true; }
    if (s.mana.cur + 1e-6 < cost) return false;
    s.mana.cur -= cost;
    s.stats.manaUsed += cost;
    return true;
  };
  s.cooldown = (page) => Math.max(0, (s.cds[page] || 0) - sim.tick) / TPS;

  /**
   * Use a tool. page = 'spell:meteor' | 'material:lava' | 'creature:sheep' | 'tool:erase'...
   * o: { brush, x2, y2, stroke (true while dragging) }
   */
  s.use = function (page, x, y, o = {}) {
    if (s.result) return { ok: false, reason: 'The level is over' };
    if (s.placing) return { ok: false, reason: 'Choose where your base goes first' };
    if (!s.has(page)) return { ok: false, reason: 'Not unlocked yet' };
    const [kind, id] = page.split(':');
    x = Math.max(0, Math.min(W - 1, x)); y = Math.max(0, Math.min(H - 1, y));
    if (s.cds[page] && s.cds[page] > sim.tick) return { ok: false, reason: 'Recharging', cooldown: true };
    if (kind === 'spell') {
      const d = data.spells.spells[id];
      const cost = sim.spells.costOf(id, x, y, o);
      if (!s.spend(cost)) return { ok: false, reason: 'Not enough mana', cost };
      sim.spells.cast(id, x, y, { ...o, level: s.spellLevels[id] || 0 });
      if (d.cd) s.cds[page] = sim.tick + d.cd * TPS;
      s.stats.casts[id] = (s.stats.casts[id] || 0) + 1;
      return { ok: true, cost };
    }
    if (kind === 'material') {
      const m = ID[id];
      const brush = o.brush ?? 3;
      const per = s.pageMana[page] ?? 0.2;
      const est = Math.PI * brush * brush * per * (M.tree[m] ? 0.35 : 1);
      if (!s.endless && s.mana.cur < Math.min(est, 0.5)) return { ok: false, reason: 'Not enough mana' };
      const n = paint(w, x, y, brush, m, { rng, amount: M.liquid[m] ? 24 : undefined });
      const cost = n * per;
      s.spend(Math.min(cost, s.endless ? cost : s.mana.cur));
      s.stats.placed += n;
      return { ok: n > 0, cost };
    }
    if (kind === 'creature') {
      const sp = data.species[id];
      if (!sp) return { ok: false, reason: 'Unknown' };
      const i = (y | 0) * W + (x | 0);
      if (!sp.flies && !sp.aquatic && (M.solid[w.mat[i]] || w.mat[i] === ID.lava)) return { ok: false, reason: 'No room there' };
      if (sp.aquatic && !M.liquid[w.mat[i]]) return { ok: false, reason: 'Fish need water' };
      const cost = sp.cost ?? 1;
      if (!s.spend(cost)) return { ok: false, reason: 'Not enough mana', cost };
      const n = SWARM_PLACE[id] || 1;
      let first = null;
      for (let k = 0; k < n; k++) {
        const opts = {};
        if (sp.kind === 'person') {
          let v = sim.village.nearestVillage(x, y);
          const soldier = sp.attack || sp.ranged || sp.guard;
          // soldiers serve the nearest village (or none); ordinary folk far from any village found one
          if (!soldier && (!v || Math.hypot(v.x - x, v.y - y) > 45)) v = sim.village.found(x | 0, y | 0, { people: 0, prebuilt: ['cottage'], food: 30, wood: 16, stone: 4 });
          if (v && (!soldier || Math.hypot(v.x - x, v.y - y) < 90)) opts.village = v.id;
          // a soldier holds the spot it was set down (and drifts with any flock it was set beside)
          if (soldier) opts.post = { x, y };
        }
        const c = sim.creatures.add(id, (x + (n > 1 ? (rng() - 0.5) * 4 : 0)) | 0, (y + (n > 1 ? (rng() - 0.5) * 4 : 0)) | 0, opts);
        if (c && !first) first = c;
        if (c && sp.kind === 'person' && sim.village && !(sp.attack || sp.ranged || sp.guard)) { const v = sim.village.list[c.village]; if (v) { v.pop++; v.beds = Math.max(v.beds, v.pop); } }
      }
      sim.fire('placed', { species: id, x, y });
      return { ok: !!first, cost, creature: first };
    }
    if (kind === 'structure') return s.run?.build ? s.run.build(id, x, y, o) : { ok: false, reason: 'Nothing happens' };
    if (kind === 'tool') {
      const brush = o.brush ?? 3;
      if (id === 'erase') { const n = paint(w, x, y, brush, 0); return { ok: n > 0, cost: 0 }; }
      if (id === 'torch') {
        if (!s.spend(0.5)) return { ok: false, reason: 'Not enough mana' };
        let lit = 0;
        for (let k = 0; k < 4; k++) {
          const xx = (x + (rng() - 0.5) * brush * 1.4) | 0, yy = (y + (rng() - 0.5) * brush * 1.4) | 0;
          if (w.inside(xx, yy) && ignite(w, yy * W + xx, true)) lit++;
        }
        return { ok: true, cost: 0.5, lit };
      }
      if (id === 'inspect') return { ok: true, cost: 0, info: s.inspect(x, y) };
      if (id === 'grab') return { ok: true, cost: 0 };
    }
    return { ok: false, reason: 'Nothing happens' };
  };

  /** What is at (x, y): for the inspect tool and long-press. */
  s.inspect = function (x, y) {
    x |= 0; y |= 0;
    if (!w.inside(x, y)) return null;
    const i = y * W + x;
    const c = sim.creatures.nearest(x + 0.5, y + 0.5, 4, () => true);
    return {
      cell: M.list[w.mat[i]].name, ground: M.list[w.ground[i]].name, temp: w.temp[i], height: w.height[i],
      burning: !!(w.flag[i] & BURN), amount: M.liquid[w.mat[i]] ? w.life[i] : null,
      creature: c ? { name: c.sp.name, hp: Math.ceil(c.hp), maxHp: c.maxHp, age: Math.floor(c.age / TPS), hunger: c.hunger, state: c.job || c.state, sex: c.sex, young: c.age < c.sp.adultAt * TPS } : null,
      village: (() => { const v = sim.village.nearestVillage(x, y); return v && Math.hypot(v.x - x, v.y - y) < 30 ? { name: v.name, pop: v.pop, beds: v.beds, food: Math.floor(v.food), wood: Math.floor(v.wood), stone: Math.floor(v.stone) } : null; })(),
    };
  };

  /** Grab tool: pick up the nearest creature (or null), then move/throw it. */
  s.grab = function (x, y) {
    const c = sim.creatures.nearest(x, y, 5, (o) => !o.sp.boss);
    if (!c) return null;
    c.held = true;
    return c;
  };
  s.carry = function (c, x, y) { if (!c?.alive) return; c.x = Math.max(0.5, Math.min(W - 0.5, x)); c.y = Math.max(0.5, Math.min(H - 0.5, y)); c.z = Math.max(c.z, 6); c.tx = c.x; c.ty = c.y; c.vx = 0; c.vy = 0; };
  s.throw = function (c, vx, vy) {
    if (!c?.alive) return;
    c.held = false;
    c.kx = vx; c.ky = vy;
    const sp = Math.hypot(vx, vy);
    if (!c.sp.flies) {
      c.z = 0;
      if (sp > 1.5) { sim.api.later(() => { if (c.alive) sim.creatures.hurt(c, sp * 6, 'thrown', 'hand'); }, 10); sim.api.discover('flung', c.x, c.y); }
    }
  };

  // ---------- the tick ----------
  s.step = function () {
    if (s.paused || s.result || s.placing) return;
    sim.step();
    s.stats.ticks++;
    if (!s.endless) s.mana.cur = Math.min(s.mana.max, s.mana.cur + s.mana.regen / TPS * (s.regenScale ?? 1));
    if (level) {
      for (const sp of level.spawns || []) {
        if (sp.time && !sp.done && s.stats.ticks >= sp.time * TPS) { sp.done = true; spawnGroup(sp); }
        if (sp.every && s.stats.ticks % (sp.every * TPS) === 0 && s.stats.ticks > 0 && (!sp.until || s.stats.ticks < sp.until * TPS)) spawnGroup(sp);
      }
      for (const ev of level.events || []) {
        if (!ev.done && s.stats.ticks >= ev.time * TPS) { ev.done = true; runEvent(ev); }
      }
      if (s.stats.ticks % 10 === 0) s.objectives.update();
    }
    if (s.onStep) s.onStep(s);
  };

  function runEvent(ev) {
    if (ev.cast) sim.spells.cast(ev.cast, ev.x, ev.y, { level: ev.level || 0 });
    if (ev.ignite) for (const [x, y, r] of ev.ignite) {
      // light the burnable cells near the point (a fire never 'starts' on bare sand)
      let lit = 0;
      for (let k = 0; k < 200 && lit < (r || 2) * 4; k++) {
        const rr = (r || 2) * (1 + k / 40);
        const xx = (x + (rng() - 0.5) * rr * 2) | 0, yy = (y + (rng() - 0.5) * rr * 2) | 0;
        if (w.inside(xx, yy) && ignite(w, yy * W + xx, true)) lit++;
      }
    }
    if (ev.op) terrainOp(ev.op);
    if (ev.wind) { w.wind.x = ev.wind[0]; w.wind.y = ev.wind[1]; w.wind.strength = ev.wind[2] ?? 1; }
    if (ev.spawn) spawnGroup(ev.spawn);
    if (ev.say) sim.fire('announce', { text: ev.say });
  }

  /** A compact view of the game for tests and the game-eye MCP. */
  s.state = function () {
    return {
      mode: s.mode, tick: sim.tick, placing: !!s.placing, run: s.run?.state?.() ?? null, mana: { cur: Math.floor(s.mana.cur), max: s.mana.max }, result: s.result,
      creatures: Object.fromEntries(Object.entries(sim.creatures.counts).filter(([, n]) => n > 0)),
      villages: sim.village.list.map(v => ({ name: v.name, pop: v.pop, beds: v.beds, houses: sim.village.housesStanding(v.id), food: Math.floor(v.food), alive: v.alive })),
      burning: w.stats.burning, lava: w.stats.lava, particles: sim.ps.n,
      goals: s.objectives ? s.objectives.status() : null,
    };
  };

  return s;
}
