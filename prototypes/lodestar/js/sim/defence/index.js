// The defence half of the game (PLAN M4): walls and gates, towers, nests, the Noise and Glow fields, raids and the
// enemies in them. PURE. createSim calls createDefence(sim) once; the systems in js/sim/systems.js step it.
//
//   sim.defence.walls / fields / nests / enemies / raids / towers     (one module each, this folder)
//   sim.defence.pulse(kind, x, y, level, ticks)   a short-lived Noise or Glow source (M6 spells, gunfire, blasts)
//   sim.defence.over                              set when the home HQ falls (Standard / Grim): the game is over
//   sim.defence.crippledUntil                     Calm: the HQ is crippled (towers at half rate) until this tick
// Hooks it adds for other milestones: sim.hooks.noise / sim.hooks.glow ([fn() → [{x, y, level}]]),
// sim.hooks.unitHurt ([fn(squad, amount, source) → damage done], M5). THE damage rule is targets.js.
// Every blast in the world (world.blast) also goes through `onBlast` here: enemies, nests, our buildings and walls
// take damage by the rule (our own shells and a building's own collapse never hurt our side).

import { SUB } from '../entities.js';
import { OWNED, SCORCH, BURN } from '../../world/grid.js';
import { compileDefence } from './data.js';
import { createWalls } from './walls.js';
import { createFields } from './fields.js';
import { createNests } from './nests.js';
import { createEnemies } from './enemies.js';
import { createRaids } from './raids.js';
import { createTowers } from './towers.js';
import { canDamage, hurt } from './targets.js';
import { hyp, dir, powi } from './maths.js';

export function createDefence(sim, opts = {}) {
  const raw = sim.data.raw;
  const DD = compileDefence(raw, sim.world.M);
  const { g, M } = sim.world;
  const bal = DD.bal;
  const diffId = bal.difficulty[opts.difficulty] ? opts.difficulty : 'standard';
  const D = {
    DD, blockVer: 0, over: null, crippledUntil: -1, kills: 0, difficulty: diffId,
    diff: bal.difficulty[diffId], grace: bal.difficulty[diffId].grace,
    respawns: [],
  };
  sim.defence = D;
  sim.hooks.noise ??= [];
  sim.hooks.glow ??= [];
  sim.hooks.unitHurt ??= [];
  for (const t of raw.towers.list) sim.levels['tower.' + t.id] ??= 1;
  sim.levels.wall ??= 1;

  D.walls = createWalls(sim, DD);
  D.fields = createFields(sim, DD);
  D.pulse = (kind, x, y, level, ticks) => D.fields.pulse(kind, x, y, level, ticks);
  D.nests = createNests(sim, DD);
  D.enemies = createEnemies(sim, DD);
  D.raids = createRaids(sim, DD);
  D.towers = createTowers(sim, DD);
  D.canDamage = (t, src) => canDamage(sim, t, src);
  D.hurt = (t, n, src) => hurt(sim, t, n, src);

  // ---- buildings: hit points, being hit, falling ---------------------------------------------------------------------
  let ownerMap = null, ownerKey = -1;
  /** The building whose footprint holds cell (x, y) (a cached map, rebuilt when anything was built or pulled down). */
  D.buildingAt = (x, y) => {
    if (ownerKey !== sim.routeVer || !ownerMap) {
      ownerMap = new Map(); ownerKey = sim.routeVer;
      for (const b of sim.ents.list('building')) { const f = b.fp; for (let yy = f.y0; yy < f.y0 + f.h; yy++) for (let xx = f.x0; xx < f.x0 + f.w; xx++) ownerMap.set(yy * g.W + xx, b); }
    }
    const b = ownerMap.get(y * g.W + x);
    return b && !b.removed ? b : null;
  };
  function hpFor(b) {
    if (DD.T[b.type]) return D.towers.stats(b.type).hp;
    if (b.type === 'hq') return bal.hp.hq;
    return Math.max(bal.hp.min, Math.round(b.fp.w * b.fp.h * bal.hp.perCell));
  }
  sim.hooks.built.push((b) => { b.hp = b.hpMax = hpFor(b); D.blockVer++; });

  const lastHit = new Map();
  D.damageBuilding = (b, amount, source) => {
    b.hp -= amount;
    if (sim.tick - (lastHit.get(b.id) ?? -1e9) >= 20) {
      lastHit.set(b.id, sim.tick);
      sim.events.push({ e: 'damaged', tick: sim.tick, base: sim.base, id: b.id, type: b.type, frac: Math.max(0, b.hp / b.hpMax), x: Math.round(b.fp.cx), y: Math.round(b.fp.cy), by: source.kind });
      sim.dirty.add(b.id);
      if (b.type === 'hq' && source.team === 1 && sim.tick - (D.hqToldAt ?? -1e9) > 600) { D.hqToldAt = sim.tick; sim.events.push({ e: 'hqHit', tick: sim.tick, base: sim.base, frac: Math.max(0, b.hp / b.hpMax), x: Math.round(b.fp.cx), y: Math.round(b.fp.cy) }); }
    }
    if (b.hp <= 0) { if (b.type === 'hq') hqLost(b, source); else ruin(b, source); }
    return amount;
  };

  /** A building is destroyed: it falls in on itself in rubble and fire; half its store is left as salvage. */
  function ruin(b, source) {
    const def = sim.data.B[b.type];
    const back = {};
    for (const [r, n] of Object.entries(b.store || {})) { const k = Math.floor(n / 2); if (k) back[r] = k; }
    const f = b.fp;
    for (let y = f.y0; y < f.y0 + f.h; y++) for (let x = f.x0; x < f.x0 + f.w; x++) {
      const i = g.idx(x, y);
      g.cells[i] = (M.id.rubble | (200 << 8) | SCORCH | (g.cells[i] & (1 << 31))) >>> 0;
      g.ver[i >>> 12]++; g.regrowHint[i >>> 12] = 1;
    }
    sim.ents.remove(b.id);
    sim.dirty.add(b.id);
    sim.poolsDirty = true; sim.routeVer++; D.blockVer++;
    sim.retireCrew(b);
    sim.construction.prune();
    sim.world.blast(Math.floor(f.cx), Math.floor(f.cy), Math.max(3, Math.round(Math.min(f.w, f.h) / 2)), 0.7, { by: 'ruin' });
    if (Object.keys(back).length) sim.dropPile(f.cx, f.cy, back, b.door);
    sim.events.push({ e: 'destroyed', tick: sim.tick, base: sim.base, id: b.id, type: b.type, name: def.name, x: Math.round(f.cx), y: Math.round(f.cy), by: source.team === 1 ? 'raid' : source.kind });
  }

  function hqLost(b, source) {
    const f = b.fp;
    if (D.diff.hqLoss === 'cripple') {
      b.hp = 1;
      D.crippledUntil = sim.tick + D.diff.crippleTicks;
      sim.world.blast(Math.floor(f.cx), Math.floor(f.cy), 10, 1, { by: 'ruin' });
      sim.events.push({ e: 'crippled', tick: sim.tick, base: sim.base, until: D.crippledUntil, x: Math.round(f.cx), y: Math.round(f.cy) });
      return;
    }
    b.hp = 0;
    D.over = { why: 'The headquarters fell.', tick: sim.tick, by: source.kind };
    for (let k = 0; k < 5; k++) sim.world.blast(Math.floor(f.x0 + 8 + (k * 13) % (f.w - 12)), Math.floor(f.y0 + 8 + (k * 29) % (f.h - 12)), 8, 1.2, { by: 'ruin' });
    for (const r of D.raids.list()) D.raids.withdraw(r);
    sim.events.push({ e: 'gameOver', tick: sim.tick, base: sim.base, why: D.over.why, x: Math.round(f.cx), y: Math.round(f.cy), day: sim.clock.dayAt(sim.tick), kills: D.kills });
  }

  // ---- carriers on the move --------------------------------------------------------------------------------------------
  const told = new Map();
  D.damageCarrier = (v, amount, source) => {
    if (!(v.hpMax > 1)) { v.hpMax = v.hp = bal.crew.hp?.[v.type] ?? 24; }
    v.hp -= amount;
    if (sim.tick - (told.get(v.home) ?? -1e9) > 400) { told.set(v.home, sim.tick); sim.events.push({ e: 'convoyHit', tick: sim.tick, base: sim.base, vehicle: v.id, type: v.type, line: v.line, x: Math.round(v.x / SUB), y: Math.round(v.y / SUB) }); }
    if (v.hp <= 0) loseCarrier(v);
    return amount;
  };
  function loseCarrier(v) {
    const x = v.x / SUB, y = v.y / SUB;
    sim.dispatcher.release?.(v);
    const cargo = v.cargo || {};
    v.cargo = {};
    sim.ents.remove(v.id);
    sim.dirty.add(v.id);
    sim.carriedDirty = true;
    if (Object.keys(cargo).length) sim.dropPile(x, y, cargo);
    if (v.home && !v.retire) D.respawns.push({ home: v.home, type: v.type, at: sim.tick + bal.crew.respawn });
    sim.events.push({ e: 'vehicleLost', tick: sim.tick, base: sim.base, vehicle: v.id, type: v.type, line: v.line, x: Math.round(x), y: Math.round(y) });
  }

  // ---- blasts ------------------------------------------------------------------------------------------------------------
  const blastOrig = sim.world.blast;
  sim.world.blast = (x, y, r, power = 1, o = {}) => {
    const res = blastOrig(x, y, r, power);
    const evs = sim.world.events;
    for (let i = evs.length - 1; i >= 0; i--) if (evs[i].e === 'explosion') { evs[i].by = o.by || 'blast'; break; }
    onBlast(x, y, r, power, o);
    return res;
  };
  function onBlast(x, y, r, power, o) {
    const by = o.by || 'blast';
    const splash = o.splash || r;
    const base = o.damage ?? bal.blast.damage * power;
    const src = { team: by === 'enemy' ? 1 : 0, kind: by === 'shell' ? 'shell' : 'blast', from: o.from, x, y };
    if (src.team === 0) {
      for (const e of [...sim.ents.list('enemy')]) {
        const d = hyp(e.x / SUB - x, e.y / SUB - y);
        if (d <= splash) hurt(sim, e, base * (1 - (d / splash) * 0.7) * (o.damage ? 1 : bal.blast.enemy), src);
      }
      for (const n of [...sim.ents.list('nest')]) {
        const d = hyp(n.x / SUB - x, n.y / SUB - y);
        if (d <= splash + n.r) hurt(sim, n, base * 0.6 * (1 - Math.min(1, Math.max(0, d - n.r) / splash) * 0.7), src);
      }
    }
    if (by !== 'shell' && by !== 'ruin') {
      for (const b of [...sim.ents.list('building')]) {
        const f = b.fp, dx = Math.max(f.x0 - x, 0, x - (f.x0 + f.w)), dy = Math.max(f.y0 - y, 0, y - (f.y0 + f.h)), d = hyp(dx, dy);
        if (d <= r) hurt(sim, b, base * 0.6 * (1 - d / (r + 1)), src);
      }
      for (const v of D.walls.list()) for (const s of v.sections) {
        if (s.state !== 'up') continue;
        const [mx, my] = D.walls.mid(v, s), d = Math.max(0, hyp(mx - x, my - y) - 4);
        if (d <= r) hurt(sim, { kind: 'section', wall: v, i: s.i }, base * (1 - d / (r + 1)), src);
      }
    }
    if (by !== 'ruin') D.pulse('noise', x, y, Math.min(255, bal.noise.blast * Math.min(2, power)), bal.noise.blastTicks);
  }

  // ---- commands --------------------------------------------------------------------------------------------------------
  sim.hooks.commands.drawWall = (s, cmd) => {
    if (D.over) return 'The headquarters has fallen.';
    const p = D.walls.plan(cmd.pts, !!cmd.straight);
    if (!p.ok) return { why: p.why };
    const short = sim.shortOf(p.cost);
    if (short) return { why: `The wall needs ${short}.` };
    const v = D.walls.add(p);
    sim.history.push({ tick: sim.tick, kind: 'wall', id: v.id });
    sim.events.push({ e: 'wallPlanned', tick: sim.tick, base: sim.base, id: v.id, len: v.len, sections: v.sections.length, cost: p.cost, joins: p.joins.length, snaps: p.snaps.map((q) => q.kind), closed: p.closed, gates: v.sections.filter((q) => q.gate).length });
    return { ok: true, id: v.id };
  };
  sim.hooks.commands.addGate = (s, cmd) => {
    let v = null, i = -1;
    if (cmd.wallId != null) { v = D.walls.get(cmd.wallId); if (v) i = Math.max(0, Math.min(v.sections.length - 1, Math.floor(((cmd.at ?? 0) / v.len) * v.sections.length))); }
    else if (cmd.x != null) { const n = D.walls.near(cmd.x, cmd.y, 4); if (n) { v = n.v; i = n.i; } }
    if (!v || i < 0) return 'There is no wall there to put a gate in.';
    if (v.sections[i].gate) return 'There is a gate there already.';
    D.walls.setGate(v, i, true, 'hand');
    return { ok: true, id: v.id, section: i };
  };
  sim.hooks.roadPlanned.push((p, road) => D.walls.onRoadPlanned(p, road));
  // Wall III and up: a tower may stand on a wall (its footing replaces the wall cells under it; they come back if it falls)
  sim.hooks.placeOn ??= [];
  sim.hooks.placeOn.push((def, c) => !!def.tower && DD.wallLevel(sim.levels.wall).towersOn && !!sim.world.M.list[c & 255]?.wallPart);
  // dev / test only (never from a machine): a nest and a raid from it right now; a global level
  sim.hooks.commands['dev.raid'] = (s, cmd) => {
    const n = cmd.nest ? sim.ents.get(cmd.nest) : D.nests.add(cmd.x | 0, cmd.y | 0, cmd.stage || 1);
    if (!n) return 'There is no such nest.';
    const hq = sim.ents.list('building').find((b) => b.type === 'hq');
    const t = cmd.target ? sim.ents.get(cmd.target) : null;
    const r = D.raids.form(n, { warn: cmd.warn ?? 40, target: t || (cmd.atHq ? hq : null) || undefined });
    return r ? { ok: true, id: r.id, nest: n.id } : { why: 'Nothing in that nest\'s reach to raid.' };
  };
  sim.hooks.commands['dev.build'] = (s, cmd) => { const r = sim.buildings.place(cmd.type, cmd.x | 0, cmd.y | 0, { free: true, instant: true }); return r.ok ? { ok: true, id: r.id } : { why: r.why }; };
  sim.hooks.commands['dev.wallNow'] = (s, cmd) => {
    const p = D.walls.plan(cmd.pts, !!cmd.straight);
    if (!p.ok) return { why: p.why };
    const v = D.walls.add(p);
    for (const q of v.sections) { for (const [r, n] of Object.entries(q.need)) sim.committed[r] = Math.max(0, (sim.committed[r] || 0) - n); q.state = 'up'; q.hp = D.walls.maxHp(); q.need = {}; q.delivered = {}; }
    D.walls.relevel(sim.levels.wall, sim.levels.wall);
    sim.routeVer++; D.blockVer++;
    return { ok: true, id: v.id };
  };
  sim.hooks.commands['dev.level'] = (s, cmd) => { if (!DD.levelKinds.has(cmd.kind)) return 'No such level.'; setLevel(cmd.kind, cmd.level | 0); return null; };
  sim.hooks.commands['dev.enemy'] = (s, cmd) => { const e = D.enemies.spawn(cmd.type || 'skitter', cmd.x | 0, cmd.y | 0, { state: 'guard', nest: cmd.nest ?? null, still: !!cmd.still }); return { ok: true, id: e.id }; };

  // ---- hud --------------------------------------------------------------------------------------------------------------
  sim.hooks.hud.push((h) => {
    h.defence = {
      raids: D.raids.list().map((r) => ({ id: r.id, state: r.state, n: r.members.length + r.toSpawn.length, target: r.target, leaveIn: Math.max(0, r.leaveAt - sim.tick), guards: r.guards })),
      enemies: sim.ents.list('enemy').length, nests: sim.ents.list('nest').filter((n) => n.seen).length,
      over: D.over, crippled: D.crippledUntil > sim.tick ? D.crippledUntil - sim.tick : 0, kills: D.kills,
      graceLeft: Math.max(0, D.grace - sim.tick), difficulty: D.difficulty,
      wallLevel: sim.levels.wall, wallName: DD.wallLevel(sim.levels.wall).name,
    };
  });

  // ---- global levels from the unlock list (M9's Calculator takes this over) --------------------------------------
  D.levelsStep = () => {
    for (const n of raw.research.list) {
      if (!n.levels || !sim.research.done.includes(n.id)) continue;
      for (const [k, lvl] of Object.entries(n.levels)) {
        if (!DD.levelKinds.has(k) || (sim.levels[k] || 1) >= lvl) continue;
        setLevel(k, lvl);
      }
    }
  };
  function setLevel(k, lvl) {
    const from = sim.levels[k] || 1;
    sim.levels[k] = lvl;
    if (k === 'wall') D.walls.relevel(from, lvl);
    else {
      const type = k.replace('tower.', '');
      for (const b of sim.ents.list('building')) if (b.type === type && b.built >= 1) { const top = D.towers.stats(type).hp; b.hp = Math.round((b.hp / b.hpMax) * top); b.hpMax = top; sim.dirty.add(b.id); }
    }
    const name = k === 'wall' ? `${DD.wallLevel(lvl).name} walls` : `${DD.T[k.replace('tower.', '')].name} level ${lvl}`;
    sim.events.push({ e: 'levelUp', tick: sim.tick, base: sim.base, kind: k, level: lvl, name });
  }
  D.setLevel = setLevel;

  // ---- the slow pass: fire on buildings, replacements for lost carriers, the crippled HQ --------------------------------
  D.slowStep = () => {
    for (const b of [...sim.ents.list('building')]) {
      if (b.built < 1 || b.removed || !canDamage(sim, b, { team: 0 })) continue;
      const f = b.fp;
      let n = 0;
      for (let y = f.y0 - 1; y <= f.y0 + f.h; y++) for (let x = f.x0 - 1; x <= f.x0 + f.w; x++) if (g.inside(x, y) && (g.cells[g.idx(x, y)] & BURN)) n++;
      if (n) D.damageBuilding(b, n * DD.wall.fireDamage * 0.5, { team: 0, kind: 'fire' });
    }
    for (let i = D.respawns.length - 1; i >= 0; i--) {
      const r = D.respawns[i];
      if (sim.tick < r.at) continue;
      D.respawns.splice(i, 1);
      const home = sim.ents.get(r.home);
      if (home && home.built >= 1) sim.spawnCarrier(r.type, home);
    }
    if (D.crippledUntil > 0 && sim.tick >= D.crippledUntil) {
      D.crippledUntil = -1;
      const hq = sim.ents.list('building').find((b) => b.type === 'hq');
      if (hq) { hq.hp = Math.round(hq.hpMax * D.diff.crippleHp); sim.dirty.add(hq.id); }
      sim.events.push({ e: 'hqPatched', tick: sim.tick, base: sim.base });
    }
  };

  if (opts.nests) D.nests.layout();
  return D;
}
