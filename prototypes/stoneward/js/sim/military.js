// Guards, towers, monsters, lairs, raids, safety and combat. PURE, a sim system.
//
// Owner decisions (2026-11-03):
//   * play-test 2 (owner): "I don't want to micromanage people at all … the cities should be all
//     auto-pilot and should have their own guards and archers that defend automatically". Every town
//     raises its OWN GARRISON from its population (more with barracks): spearmen walk the streets,
//     archers stand on wall towers and watchtowers, and anyone hostile inside the town's reach is
//     fought without an order. The only military order left is the ATTACK FLAG: plant one and the
//     troops the town can spare march out TOGETHER to fight there (lairs and camps are burned, rival
//     towns raided); move it and they follow, clear it and they come home;
//   * patrols raise SAFETY over time (red → green), which homes need and the mood feels;
//   * remote outposts need their own garrison; roads have a danger level and carts can be ambushed;
//   * magic towers cost crystals to build and then shoot forever (lightning chains, arcane missiles
//     home in, the shield dome soaks damage, the flamethrower cone burns undead and siege);
//   * beasts, brutes (smash walls), undead (rise at night, burn easily), drakes (fly over walls and
//     set roofs alight), bandits (go for stores and carts), and raids that grow with wealth and
//     population and hit the WEAKEST point. You can't really lose: a town is gone only when its keep
//     is razed AND everyone has fled or died; with no town left you land again elsewhere.

import { makeRng, subSeed } from '../planet/noise.js';
import { BIOME } from '../planet/biomes.js';
import { BURN } from './cells.js';
import { blastOf } from './blast.js';

export function createMilitary(sim, data) {
  const { M } = sim;
  const G = data.guards, TW = data.towers, MON = data.monsters, LAIRS = data.lairs, RAID = data.raids, SAFE = data.safety;
  const S = sim.state.military ??= { units: [], shots: [], lairsFound: [], lairsGone: [], nextId: 1, nextRaid: null, log: [], safety: {}, shields: {} };
  S.pending ??= []; S.flags ??= []; S.nextFlag ??= 1;
  const import_blast = () => blastOf(sim);
  const T = () => sim.state.town;
  const W = sim.W;
  const rng = sim.rng;
  const wrapX = x => ((x % W) + W) % W;
  const dxw = (a, b) => { let d = b - a; if (d > W / 2) d -= W; if (d < -W / 2) d += W; return d; };
  const dist = (ax, ay, bx, by) => Math.hypot(dxw(ax, bx), by - ay);
  const say = (text, kind, x, y) => sim.events.push({ t: 'say', text, kind, x, y });
  const level = k => ({ off: 0, low: 0.6, normal: 1, high: 1.6 }[k] ?? 1);
  const settings = () => sim.settings || {};
  const log = (text, x, y) => { S.log.unshift({ text, tick: sim.tick, x, y }); if (S.log.length > 30) S.log.pop(); };

  // ------------------------------------------------------------------ lairs: from the macro map, the same every time
  const lairs = (() => {
    const r = makeRng(subSeed(sim.macro.seed, 'lairs'));
    const out = [];
    const keyOf = k => Object.keys(BIOME).find(n => BIOME[n] === k);
    for (let my = 2; my < sim.macro.mh - 2; my++) for (let mx = 0; mx < sim.macro.mw; mx++) {
      const b = keyOf(sim.macro.biome[my * sim.macro.mw + mx]);
      const roll = r();
      for (const [kind, L] of Object.entries(LAIRS)) {
        if (!L.biomes.includes(b)) continue;
        const p = (L.rare ? 0.004 : kind === 'graveyard' ? 0.05 : 0.012) * 1;
        if (roll > p) continue;
        out.push({ id: out.length + 1, kind, x: Math.floor((mx + 0.5) * sim.macro.macroCell), y: Math.floor((my + 0.5) * sim.macro.macroCell) });
        break;
      }
    }
    return out;
  })();
  const lairById = new Map(lairs.map(l => [l.id, l]));
  const found = new Set(S.lairsFound), gone = new Set(S.lairsGone);

  // ------------------------------------------------------------------ units
  function addUnit(side, kind, x, y, extra = {}) {
    const def = side === 'guard' ? G[kind] : MON[kind];
    const u = { id: S.nextId++, side, kind, x: wrapX(x), y, hp: def.hp, max: def.hp, cd: 0, mode: side === 'guard' ? 'barracks' : 'raid', path: null, pi: 0, ...extra };
    S.units.push(u);
    return u;
  }
  const defOf = u => u.side === 'guard' ? G[u.kind] : MON[u.kind];
  const hostile = (a, b) => a.side !== b.side;

  // walls block guards and most enemies; brutes and sappers plan THROUGH walls (and break them)
  function navFor(u) {
    const d = defOf(u), nav = sim.town.nav;
    return (sx, sy, tx, ty, near) => {
      if (d.fly) return { path: [[Math.round(tx), Math.round(ty)]] };
      const far = dist(sx, sy, tx, ty) > 50;
      if (d.smash && dist(sx, sy, tx, ty) < 150) return nav.find(sx, sy, tx, ty, { near, maxNodes: 12000, costFn: (x, y) => { const c = nav.cost(x, y); if (isFinite(c)) return c; const at = sim.cell(x, y); return at && at.c.mat[at.i] && M.built[at.c.mat[at.i]] ? 12 : Infinity; } });
      return far ? nav.findLong(sx, sy, tx, ty, { maxNodes: 8000 }) : nav.find(sx, sy, tx, ty, { near, maxNodes: 6000 });
    };
  }
  let planTick = -1, plansLeft = 3;
  function moveToward(u, tx, ty, near = 1) {
    // re-plan when the goal moved a fair way or the path ran out — but never more than every 2 s,
    // and a search that failed waits longer (a hopeless search is the expensive kind)
    const stale = !u.path || u.pi >= u.path.length || (u.goal && dist(u.goal.x, u.goal.y, tx, ty) > 8 && (u.path.length - u.pi < 6 || sim.tick - (u.planned || 0) > 160));
    // at most a few searches a tick across every unit, so a raid of twenty arriving at once spreads its
    // planning over a second instead of stalling the game (play-test 2)
    if (planTick !== sim.tick) { planTick = sim.tick; plansLeft = 3; }
    if (stale && sim.tick - (u.planned || -1e9) > (u.failed ? 400 : 40) && plansLeft-- > 0) {
      const r = navFor(u)(u.x, u.y, tx, ty, near);
      u.failed = !r;
      u.path = r?.path || [[Math.round(tx), Math.round(ty)]]; u.pi = 0; u.goal = { x: tx, y: ty }; u.planned = sim.tick;
    }
    if (!u.path) return false;
    const step = u.path[u.pi]; if (!step) return true;
    const d = defOf(u);
    const ddx = dxw(u.x, step[0] + 0.5), ddy = step[1] + 0.5 - u.y, dd = Math.hypot(ddx, ddy);
    // a wall in the way: brutes and sappers break it
    if (d.smash && dd < 1.6) {
      const at = sim.cell(step[0], step[1]);
      if (at && at.c.mat[at.i] && M.built[at.c.mat[at.i]] && !M.flag.gate[at.c.mat[at.i]]) {
        if (u.cd <= 0) { sim.damage?.(step[0], step[1], d.smash); u.cd = d.cd * 20; if (d.fireWood && M.ignite[at.c.mat[at.i]] && rng() < 0.3) sim.rules.ignite(at.c, at.i); }
        return false;
      }
    }
    // gates hold enemies back (they must break them like a wall)
    if (u.side === 'enemy' && !d.fly && dd < 1.6) {
      const at = sim.cell(step[0], step[1]);
      if (at && M.flag.gate[at.c.mat[at.i]]) { if (u.cd <= 0) { sim.damage?.(step[0], step[1], d.smash || d.dmg); u.cd = d.cd * 20; } return false; }
    }
    let spd = 0.1 * d.speed;
    if (!d.fly) { const at = sim.cell(u.x, u.y); if (at) spd *= Math.max(0.3, (M.walk[at.c.ground[at.i]] || 100) / 100); }
    // never step INTO something solid (a straight-line fallback must respect walls too): brutes
    // break it, everyone else waits for a new plan
    if (!d.fly) {
      const nx = u.x + (dd > 0 ? ddx / dd : 0) * Math.max(spd, 0.6), ny = u.y + (dd > 0 ? ddy / dd : 0) * Math.max(spd, 0.6);
      if (Math.floor(nx) !== Math.floor(u.x) || Math.floor(ny) !== Math.floor(u.y)) {
        const nav = sim.town.nav;
        if (!isFinite(nav.cost(Math.floor(nx), Math.floor(ny))) && isFinite(nav.cost(Math.floor(u.x), Math.floor(u.y)))) {
          const at = sim.cell(nx, ny);
          if (d.smash && at && at.c.mat[at.i] && M.built[at.c.mat[at.i]]) { if (u.cd <= 0) { sim.damage?.(Math.floor(nx), Math.floor(ny), d.smash); u.cd = d.cd * 20; } }
          else {
            // a long trip's coarse route cuts a corner here: walk a fine path to the next waypoint
            // (dropping the route and asking again only got the same corner, for ever — guards stood
            // stuck at the corners of the keep)
            const fine = !u.finePi || u.finePi !== u.pi ? nav.find(u.x, u.y, step[0], step[1], { near: 0, maxNodes: 1500 }) : null;
            if (fine?.path?.length) { u.path.splice(u.pi, 1, ...fine.path); u.finePi = u.pi; }
            else { u.path = null; u.finePi = null; u.planned = Math.min(u.planned || 0, sim.tick - 30); }
          }
          return false;
        }
      }
    }
    if (dd <= spd) { u.x = wrapX(step[0] + 0.5); u.y = step[1] + 0.5; u.pi++; }
    else { u.x = wrapX(u.x + ddx / dd * spd); u.y += ddy / dd * spd; }
    return u.pi >= u.path.length;
  }

  // ------------------------------------------------------------------ targets
  const people = () => T()?.people || [];
  function nearestEnemyOf(u, r) {
    let best = null, bd = r;
    for (const o of S.units) if (o !== u && hostile(u, o) && o.hp > 0) { const d = dist(u.x, u.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
    return best;
  }
  function enemiesNear(x, y, r) { return S.units.some(o => o.side === 'enemy' && o.hp > 0 && dist(x, y, o.x, o.y) < r); }
  sim.enemiesNear = enemiesNear;
  /** A power or a blast hits every ENEMY within r: dmg each (fire hurts undead more), and frost
   *  freezes them for `freeze` ticks. Returns the units hit (for chain lightning). */
  function strike(x, y, r, dmg, { kind = 'blast', freeze = 0 } = {}) {
    const hit = [];
    for (const u of S.units) {
      if (u.side !== 'enemy' || u.hp <= 0) continue;
      const d = dist(x, y, u.x, u.y); if (d > r) continue;
      const def = MON[u.kind];
      let k = dmg * (1 - d / (r + 1) * 0.5);
      if (kind === 'fire' && def.burns) k *= 1.6;
      if (kind === 'frost' && (def.fire || u.kind === 'drake')) k *= 2;
      u.hp -= k;
      if (freeze) u.frozen = Math.max(u.frozen || 0, freeze);
      hit.push(u);
    }
    return hit;
  }

  function attack(u, tgt) {
    const d = defOf(u);
    let dmg = d.dmg * (d.big && tgt.kind && MON[tgt.kind]?.big ? 1 : 1) * ((G[u.kind]?.big && MON[tgt.kind]?.big) ? G[u.kind].big : 1);
    // archers on a wall (or a tower) reach further and hit harder
    if (d.ranged || d.lob) {
      S.shots.push({ x0: u.x, y0: u.y - 1, x1: tgt.x, y1: tgt.y - 0.5, t: sim.tick, d: Math.max(4, dist(u.x, u.y, tgt.x, tgt.y) * 0.6), kind: d.magic ? 'magic' : d.lob ? 'stone' : 'arrow' });
      if (d.splash) for (const o of S.units) if (o !== tgt && hostile(u, o) && dist(o.x, o.y, tgt.x, tgt.y) < d.splash) hurt(o, dmg * 0.5, u);
      if (d.lob && tgt.cell) { sim.damage?.(tgt.x, tgt.y, dmg); return; }
    }
    hurt(tgt, dmg, u);
  }
  function hurt(t, dmg, by) {
    if (t.person) {   // a townsperson
      const p = t.person;
      p.hurt = (p.hurt || 0) + dmg;
      if (p.hurt > 20) { const list = people(); const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); const town = T().towns.find(x => x.id === p.town); if (town) town.attacked = Math.min(0.4, (town.attacked || 0) + 0.04); }
      return;
    }
    t.hp -= dmg;
    if (MON[t.kind]?.burns && by && (defOf(by).burn || defOf(by).magic)) t.hp -= dmg * 0.5;
  }

  // ------------------------------------------------------------------ guards
  // A town's reach for its own defenders: everything it has built, plus a margin outside.
  const reachOf = town => (sim.town.radius?.(town) ?? 60) + 45;
  const townOf = u => T().towns.find(t => t.id === u.town) || T().towns[0];
  /** The nearest live enemy that this guard's town should fight (inside its reach). */
  function threatFor(u, town, extra = 0) {
    let best = null, bd = Infinity;
    const R = reachOf(town) + extra;
    for (const o of S.units) {
      if (o.side !== 'enemy' || o.hp <= 0) continue;
      if (dist(town.x, town.y, o.x, o.y) > R) continue;
      const d = dist(u.x, u.y, o.x, o.y); if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  /** What a street guard should fight: trouble in its own ward first, anything right beside it, then
   *  trouble nearby that nobody is answering yet. */
  function wardThreat(u, town) {
    const w = wardOf(u, town);
    if (!w) return threatFor(u, town);
    let best = null, bd = Infinity, help = null, hd = WARD_HELP;
    for (const o of S.units) {
      if (o.side !== 'enemy' || o.hp <= 0) continue;
      const dSelf = dist(u.x, u.y, o.x, o.y);
      if (dist(w.x, w.y, o.x, o.y) < w.r + 20 || dSelf < 16) { if (dSelf < bd) { bd = dSelf; best = o; } continue; }
      // next door: only if it is inside this town's land and fewer than two guards are on it
      if (dSelf < hd && (u.tgt === o.id || respondersOf(o.id) < 2) && (town.wards || []).some(x => dist(x.x, x.y, o.x, o.y) < x.r + 30)) { hd = dSelf; help = o; }
    }
    return best || help;
  }
  function fight(u, tgt, { stay = false } = {}) {
    const d = G[u.kind];
    const range = d.range * (onWall(u) ? 1.5 : 1);
    const dd = dist(u.x, u.y, tgt.x, tgt.y);
    if (dd <= range) { if (u.cd <= 0) { attack(u, tgt); u.cd = d.cd * 20; } }
    else if (!stay) moveToward(u, tgt.x, tgt.y, Math.max(1, Math.floor(range - 0.5)));
    u.fighting = true;
  }
  /** A walkable spot within r of (x, y) — never inside a building. */
  function openNear(x, y, r) {
    const nav = sim.town.nav;
    for (let k = 0; k < 30; k++) {
      const px = Math.floor(x + (rng() - 0.5) * 2 * r), py = Math.floor(y + (rng() - 0.5) * 2 * r);
      if (isFinite(nav.cost(px, py))) return { x: wrapX(px), y: py };
    }
    return { x: town0x(x), y };
  }
  const town0x = x => wrapX(Math.floor(x));
  /** A guard stuck inside something solid (a building went up round it, or it was pushed in) steps out
   *  to the nearest open cell — from inside a wall no path can ever be found. */
  function unstick(u) {
    const nav = sim.town.nav;
    if (u.up || isFinite(nav.cost(Math.floor(u.x), Math.floor(u.y)))) return;
    for (let r = 1; r <= 14; r++) for (let k = 0; k < 8 * r; k++) {
      const a = k / (8 * r) * Math.PI * 2, px = Math.floor(u.x + Math.cos(a) * r), py = Math.floor(u.y + Math.sin(a) * r);
      if (isFinite(nav.cost(px, py))) { u.x = wrapX(px + 0.5); u.y = py + 0.5; u.path = null; u.planned = -1e9; return; }
    }
  }
  function guardThink(u) {
    const d = G[u.kind], town = townOf(u);
    if (!town) return;
    if ((sim.tick + u.id) % 40 === 0) unstick(u);
    // old orders from earlier saves fold into the garrison
    if (u.mode === 'barracks' || u.mode === 'hold' || u.mode === 'post' && !u.wallPost || u.mode === 'patrol') { u.mode = 'garrison'; u.path = null; }
    if (u.mode === 'army') return armyThink(u, town);
    if (u.mode === 'escort') {
      const cart = sim.state.routes?.carts?.find(c => c.id === u.cart);
      const foe = nearestEnemyOf(u, 14);
      if (foe) return fight(u, foe);
      if (cart) moveToward(u, cart.x, cart.y, 2); else u.mode = 'garrison';
      markSafe(u.x, u.y); return;
    }
    // wall archers and tower crews hold their place and shoot; everyone else goes to the fight
    const holds = u.mode === 'wall' || u.mode === 'crew';
    const foe = holds ? nearestEnemyOf(u, d.range * (onWall(u) ? 1.5 : 1)) : wardThreat(u, town);
    u.tgt = foe && !holds ? foe.id : null;
    if (foe) { fight(u, foe, { stay: holds }); markSafe(u.x, u.y); return; }
    // a wall archer whose foe is inside the walls comes down to help
    if (holds && u.mode === 'wall') { const inside = threatFor(u, town, -40); if (inside && dist(u.x, u.y, inside.x, inside.y) < 40) { fight(u, inside); return; } }
    u.fighting = false;
    if (holds && u.post) {
      // up the tower: a wall archer climbs onto the tower it guards (and stays up there)
      if (u.mode === 'wall' && !u.up && dist(u.x, u.y, u.post.x, u.post.y) < 4) { u.x = wrapX(u.post.x + 0.5); u.y = u.post.y + 0.5; u.up = true; u.path = null; }
      if (u.up) { const at = sim.cell(u.post.x, u.post.y); if (!at || !at.c.mat[at.i] || !M.built[at.c.mat[at.i]]) { u.up = false; u.mode = 'garrison'; u.spot = null; } }
      else moveToward(u, u.post.x, u.post.y, 3);
    }
    else {
      // walk the streets of its own ward: a new corner whenever the last one is reached
      const w = wardOf(u, town);
      if (!u.beat || dist(u.x, u.y, u.beat.x, u.beat.y) < 2 || moveToward(u, u.beat.x, u.beat.y, 1) || sim.tick - (u.beatAt || 0) > 1600) {
        u.beat = (w ? sim.town.streetPoint?.(town, rng, w) : sim.town.streetPoint?.(town, rng)) || openNear(w ? w.x : town.x, w ? w.y : town.y, w ? w.r : 30);
        u.beatAt = sim.tick; u.path = null;
      }
    }
    // patrolling marks the ground as watched
    markSafe(u.x, u.y);
  }
  const onWall = u => { if (u.up) return true;
    const at = sim.cell(u.x, u.y + 1); return !!at && (M.built[at.c.mat[at.i]] && !at.c.part[at.i]); };

  // ------------------------------------------------------------------ safety
  const TILE = SAFE.tile;
  const tileKey = (x, y) => Math.floor(wrapX(x) / TILE) + ',' + Math.floor(y / TILE);
  function markSafe(x, y) { S.safety[tileKey(x, y)] = sim.tick; }
  /** 0 (nobody has walked by in ages) .. 1 (a post or a patrol right here, just now). */
  function safetyAt(x, y) {
    let s = 0;
    const r = Math.ceil(SAFE.patrolRadius / TILE);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const t = S.safety[tileKey(x + dx * TILE, y + dy * TILE)]; if (t == null) continue;
      const age = sim.tick - t, near = 1 - Math.hypot(dx, dy) / (r + 1);
      s = Math.max(s, Math.max(0, 1 - age / SAFE.patrolFade) * near);
    }
    for (const u of S.units) if (u.side === 'guard' && (u.mode === 'post' || u.mode === 'crew') && u.post && dist(x, y, u.post.x, u.post.y) < SAFE.postRadius) s = Math.max(s, 1 - dist(x, y, u.post.x, u.post.y) / SAFE.postRadius * 0.5);
    for (const b of T()?.buildings || []) if (b.state === 'up' && TW[data.kinds[b.kind]?.tower] && dist(x, y, b.x, b.y) < 18) s = Math.max(s, 0.7);
    // a lair nearby makes it worse
    for (const id of found) { if (gone.has(id)) continue; const l = lairById.get(id); if (dist(x, y, l.x, l.y) < 60) s -= 0.3; }
    return Math.max(0, Math.min(1, s));
  }
  function stepSafety() {
    const t = T(); if (!t) return;
    for (const b of t.buildings) if (b.state === 'up') b.safety = +safetyAt(b.x + (b.w >> 1), b.y + (b.h >> 1)).toFixed(2);
    for (const town of t.towns) { const homes = t.buildings.filter(b => b.town === town.id && data.kinds[b.kind].home); town.safety = homes.length ? +(homes.reduce((a, b) => a + b.safety, 0) / homes.length).toFixed(2) : null; }
    // forget very old patrol marks so the table stays small
    if (sim.tick % 4000 === 0) for (const [k, v] of Object.entries(S.safety)) if (sim.tick - v > SAFE.patrolFade) delete S.safety[k];
  }

  // ------------------------------------------------------------------ towers
  function stepTowers() {
    const t = T(); if (!t) return;
    for (const b of t.buildings) {
      const k = data.kinds[b.kind]; if (b.state !== 'up' || !k.tower || !TW[k.tower]) continue;
      const def = TW[k.tower]; if (!def) continue;
      const cx = b.x + (b.w >> 1), cy = b.y + (b.h >> 1);
      if (def.shield) { S.shields[b.id] ??= { e: def.absorb, x: cx, y: cy, r: def.shield }; const sh = S.shields[b.id]; sh.e = Math.min(def.absorb, sh.e + def.recharge / 20); continue; }
      // crewed towers need a guard posted as crew
      if (def.crew && !S.units.some(u => u.side === 'guard' && u.mode === 'crew' && u.tower === b.id)) {
        const free = S.units.filter(u => u.side === 'guard' && u.town === b.town && (u.mode === 'garrison' || u.mode === 'wall') && (def.crew === 'any' || u.kind === def.crew || u.kind === 'crossbowman'))[0];
        if (free) { free.mode = 'crew'; free.tower = b.id; free.post = { x: cx, y: b.y + b.h + 1 }; }
        else continue;
      }
      b.cd = (b.cd || 0) - 1; if (b.cd > 0) continue;
      const targets = S.units.filter(o => o.side === 'enemy' && o.hp > 0 && dist(cx, cy, o.x, o.y) <= def.range * (def.crew === 'archer' ? 1 : 1) && (!def.minRange || dist(cx, cy, o.x, o.y) >= def.minRange));
      if (!targets.length) continue;
      targets.sort((a, c) => dist(cx, cy, a.x, a.y) - dist(cx, cy, c.x, c.y));
      const tgt = targets[0];
      let dmg = def.dmg * (def.bonusVs?.includes(MON[tgt.kind].group) || (def.bonusVs?.includes('siege') && MON[tgt.kind].group === 'siege') ? 2 : 1);
      if (def.chain) {
        let from = { x: cx, y: cy - 4 }, hit = new Set();
        for (let k = 0; k < def.chain; k++) {
          const nxt = S.units.filter(o => o.side === 'enemy' && o.hp > 0 && !hit.has(o) && dist(from.x, from.y, o.x, o.y) < (k ? 8 : def.range)).sort((a, c) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, c.x, c.y))[0];
          if (!nxt) break;
          S.shots.push({ x0: from.x, y0: from.y, x1: nxt.x, y1: nxt.y, t: sim.tick, d: 4, kind: 'bolt' });
          hurt(nxt, dmg * (1 - k * 0.15)); hit.add(nxt); from = nxt;
        }
      } else if (def.cone) {
        for (const o of targets) if (dist(cx, cy, o.x, o.y) <= def.range) { hurt(o, dmg); if (MON[o.kind].burns || MON[o.kind].group === 'siege') hurt(o, dmg); }
        S.shots.push({ x0: cx, y0: cy - 2, x1: tgt.x, y1: tgt.y, t: sim.tick, d: 6, kind: 'flame' });
      } else {
        S.shots.push({ x0: cx, y0: cy - 4, x1: tgt.x, y1: tgt.y - 0.5, t: sim.tick, d: Math.max(5, dist(cx, cy, tgt.x, tgt.y) * 0.4), kind: def.magic ? 'magic' : def.splash ? 'stone' : 'bolt' });
        hurt(tgt, dmg);
        if (def.splash) for (const o of targets) if (o !== tgt && dist(o.x, o.y, tgt.x, tgt.y) < def.splash) hurt(o, dmg * 0.5);
      }
      b.cd = def.cd * 20;
    }
  }
  // the shield dome soaks damage to anything under it (and keeps fire from crossing into it)
  const baseDamage = sim.damage;
  if (baseDamage && !baseDamage.shielded) {
    sim.damage = Object.assign((x, y, amount, opts) => {
      for (const sh of Object.values(S.shields)) if (sh.e > 0 && dist(x, y, sh.x, sh.y) < sh.r) { const take = Math.min(sh.e, amount); sh.e -= take; amount -= take; if (amount <= 0) return false; }
      return baseDamage(x, y, amount, opts);
    }, { shielded: true });
  }
  sim.shielded = (c, i) => { const s = Object.values(S.shields); if (!s.length) return false; const x = c.cx * 64 + (i % 64), y = c.cy * 64 + ((i / 64) | 0); return s.some(sh => sh.e > 0 && dist(x, y, sh.x, sh.y) < sh.r); };

  // ------------------------------------------------------------------ enemies
  // Play-test 2: raids "just run up and touch your city" and soldiers "go AFK outside the keep
  // doors". Raiders now pick a BUILDING, break its cells and set it alight (bandits and soldiers
  // carry torches, bowmen shoot fire arrows), cut down townsfolk in their way, and move on to the
  // next building when that one is burning or gone; catapults and sappers make real explosions.
  const T_ = () => T();
  function enemyThink(u) {
    const d = MON[u.kind];
    // fight whatever guard is close
    const g = nearestEnemyOf(u, d.ranged ? d.range : 6);
    if (g) {
      if (dist(u.x, u.y, g.x, g.y) <= d.range) { if (u.cd <= 0) { attack(u, g); u.cd = d.cd * 20; } return; }
      moveToward(u, g.x, g.y, 1); return;
    }
    // undead melt away at dawn
    if (d.night && (sim.timeOfDay() < 0.5 && sim.timeOfDay() > 0.05)) { u.hp -= 0.5; }
    // anyone of the town within reach of a blade is cut down (raiders and beasts both)
    if (d.wants !== 'roofs' && !d.lob && u.cd <= 0) {
      for (const p of people()) if (dist(u.x, u.y, p.x, p.y) <= Math.max(1.6, d.ranged ? Math.min(d.range, 8) : d.range)) { hurt({ person: p }, d.dmg, u); u.cd = d.cd * 20; if (d.ranged) S.shots.push({ x0: u.x, y0: u.y - 1, x1: p.x, y1: p.y - 0.5, t: sim.tick, d: 6, kind: 'arrow' }); return; }
    }
    const tgt = goalOf(u);
    if (!tgt) { // nothing left to do: go home
      if (u.home) { if (moveToward(u, u.home.x, u.home.y, 2)) u.hp = 0, u.left = true; } else u.hp = 0, u.left = true;
      return;
    }
    // (+0.8: the path finder stops when the CELL is within reach, and a unit stands in the middle of its
    // cell, so without the slack a raider could stop one step short of its target forever — the
    // "AFK outside the keep doors" of play-test 2)
    if (dist(u.x, u.y, tgt.x, tgt.y) <= Math.max(d.range, tgt.r || 1.5) + 0.8) {
      if (u.cd > 0) return;
      u.cd = d.cd * 20;
      if (tgt.person) hurt(tgt, d.dmg, u);
      else if (tgt.store && !u.robbed) {
        const b = tgt.store; let take = d.steal || 4;
        for (const [gg, n] of Object.entries(b.store)) { if (!take) break; const k = Math.min(n, take); b.store[gg] -= k; take -= k; u.loot = (u.loot || 0) + k; }
        if ((u.loot || 0) >= 30 || !Object.values(b.store).some(n => n > 0)) u.robbed = true;      // then they burn the place
        if (!u.robLogged) { u.robLogged = true; log(`Bandits robbed the ${data.kinds[b.kind].name.toLowerCase()}.`, b.x, b.y); }
      } else if (tgt.cart) { const c = tgt.cart; if (c.load) { u.loot = (u.loot || 0) + c.load.n; c.load = null; say('A cart was robbed on the road.', 'bad', c.x, c.y); } u.done = true; }
      else if (tgt.roof) {
        // a drake breathes fire over roofs
        for (let k = 0; k < 6; k++) { const at = sim.cell(tgt.x + ((rng() * 7) | 0) - 3, tgt.y + ((rng() * 7) | 0) - 3); if (at && at.c.mat[at.i] && M.ignite[at.c.mat[at.i]]) sim.rules.ignite(at.c, at.i); }
        S.shots.push({ x0: u.x, y0: u.y - 3, x1: tgt.x, y1: tgt.y, t: sim.tick, d: 8, kind: 'flame' });
        u.burns = (u.burns || 0) + 1; if (u.burns > 6) u.done = true;
      } else if (tgt.building) { if (d.keg) keg(u, tgt.x, tgt.y - 1); else razeHit(u, d, tgt.building); }
      else if (tgt.cell) {
        if (d.lob) lobAt(u, d, tgt.x, tgt.y);
        else if (d.keg) { keg(u, tgt.x, tgt.y); }
        else sim.damage?.(tgt.x, tgt.y, d.smash || d.dmg);
      }
      return;
    }
    if (d.lob && (tgt.cell || tgt.building) && dist(u.x, u.y, tgt.x, tgt.y) <= d.range) { if (u.cd <= 0) { lobAt(u, d, tgt.x, tgt.y); u.cd = d.cd * 20; } return; }
    moveToward(u, tgt.x, tgt.y, d.lob ? Math.floor(d.range * 0.8) : 1);
  }
  /** A catapult stone: a real blast where it lands (play-test 2: "nothing was blowing up"). */
  function lobAt(u, d, x, y) {
    const tx = x + (rng() - 0.5) * 3, ty = y + (rng() - 0.5) * 3;
    S.shots.push({ x0: u.x, y0: u.y - 1, x1: tx, y1: ty, t: sim.tick, d: Math.max(6, dist(u.x, u.y, tx, ty) * 0.5), kind: 'stone' });
    const land = sim.tick + Math.max(6, Math.round(dist(u.x, u.y, tx, ty) * 0.5));
    S.pending.push({ at: land, x: tx, y: ty, r: d.splash || 3, power: d.blast || 2.6, fire: false });
  }
  /** A sapper's powder keg: it goes off against the wall, and so does the sapper. */
  function keg(u, x, y) {
    S.pending.push({ at: sim.tick + 30, x, y, r: 3.2, power: 3.4, fire: true });
    S.shots.push({ x0: u.x, y0: u.y, x1: x, y1: y, t: sim.tick, d: 30, kind: 'flame' });
    u.hp = 0; u.left = true;
    say('A sapper set a powder keg against the wall!', 'bad', x, y);
  }
  function stepPending() {
    if (!S.pending.length) return;
    const B = sim.blaster || null;
    for (let k = S.pending.length - 1; k >= 0; k--) {
      const p = S.pending[k]; if (p.at > sim.tick) continue;
      S.pending.splice(k, 1);
      import_blast().blast(p.x, p.y, p.r, p.power, { fire: p.fire, debris: 0.35, by: 'siege' });
      strike(p.x, p.y, p.r, 8);
    }
  }
  /** One blow at a building: a random cell of it breaks a little, and torches catch the flammable ones. */
  function razeHit(u, d, b) {
    const cells = [];
    for (let k = 0; k < 14; k++) {
      const x = b.x + ((rng() * b.w) | 0), y = b.y + ((rng() * b.h) | 0);
      const at = sim.cell(x, y); if (!at || at.c.part[at.i] !== b.id || !at.c.mat[at.i]) continue;
      cells.push({ x, y, at });
    }
    if (!cells.length) { u.tb = null; return; }
    const c = cells[(rng() * cells.length) | 0];
    if (d.torch !== false && (MON[u.kind].group === 'bandit' || MON[u.kind].group === 'army' || d.torch)) {
      const fl = cells.find(o => M.ignite[o.at.c.mat[o.at.i]] && !(o.at.c.flag[o.at.i] & BURN));
      if (fl && rng() < (d.ranged ? 0.35 : 0.3)) { sim.rules.ignite(fl.at.c, fl.at.i); fl.at.c.temp[fl.at.i] = 255; sim.wake(fl.at.c); }
    }
    if (d.ranged) S.shots.push({ x0: u.x, y0: u.y - 1, x1: c.x, y1: c.y, t: sim.tick, d: 6, kind: 'flame' });
    sim.damage?.(c.x, c.y, (d.smash || d.dmg) * 3);
    u.hits = (u.hits || 0) + 1;
    if (u.hits > 40) { u.tb = null; u.hits = 0; }                     // try somewhere else
  }
  const burningShare = b => { let n = 0, f = 0; for (let k = 0; k < 10; k++) { const at = sim.cell(b.x + ((rng() * b.w) | 0), b.y + ((rng() * b.h) | 0)); if (!at || at.c.part[at.i] !== b.id || !at.c.mat[at.i]) continue; n++; if (at.c.flag[at.i] & BURN) f++; } return n ? f / n : 1; };
  /** What a monster goes for, by its kind (owner: each type readable; raids hit the weakest point). */
  function goalOf(u) {
    if (u.done) return null;
    const d = MON[u.kind], t = T();
    const ux = u.x, uy = u.y;
    const nearest = (list, f) => { let b = null, bd = Infinity; for (const o of list) { const p = f(o); if (!p) continue; const dd = dist(ux, uy, p.x, p.y); if (dd < bd) { bd = dd; b = p; } } return b; };
    if (u.focus) { const f = u.focus; if (sim.tick - f.t < 3000) {
      // a raid heads to its chosen weak point first, then picks targets there
      if (dist(ux, uy, f.x, f.y) > 12) return { x: f.x, y: f.y, r: 4, move: true };
      u.focus = null;
    } }
    // raiders: a building to break and burn, the nearest one standing that is not already ablaze
    const raider = u.raid || ['bandit', 'army'].includes(d.group);
    if (raider && !d.lob && !d.keg && (d.wants !== 'stores' || u.robbed)) {
      if (u.raidLeft == null) u.raidLeft = 3000 + ((rng() * 2000) | 0);
      if (--u.raidLeft <= 0) return null;                                    // they have done their worst: off home
      let b = u.tb != null ? t.buildings.find(x => x.id === u.tb) : null;
      if (b && (b.state !== 'up' || (sim.tick + u.id) % 60 === 0 && burningShare(b) > 0.5)) b = null;
      if (!b) {
        let bd = Infinity;
        for (const o of t.buildings) {
          if (o.state !== 'up' || o.town < 0) continue;
          const k = data.kinds[o.kind];
          if (k.tower && TW[k.tower]?.magic) continue;
          // spread out over the town: a building others already went for counts as further away
          const crowd = S.units.reduce((n, q) => n + (q !== u && q.tb === o.id ? 1 : 0), 0);
          const dd = dist(ux, uy, o.x + o.w / 2, o.y + o.h / 2) + (o.kind === 'keep' ? 60 : 0) + (k.home ? 0 : 8) + crowd * 10;
          if (dd < bd && dd < 160) { bd = dd; b = o; }
        }
        u.tb = b?.id ?? null; u.hits = 0;
      }
      if (b) return { x: b.x + (b.w >> 1), y: b.y + b.h, building: b, r: Math.max(2, d.range) };
    }
    switch (d.wants) {
      case 'people': return nearest(people(), p => ({ x: p.x, y: p.y, person: p, r: 1.4 }));
      case 'carts': return nearest(sim.state.routes?.carts || [], c => c.load ? { x: c.x, y: c.y, cart: c, r: 1.6 } : null) || nearest(people(), p => ({ x: p.x, y: p.y, person: p, r: 1.4 }));
      case 'stores': return nearest(t.buildings.filter(b => b.state === 'up' && (data.kinds[b.kind].storage || 0) > 0 && Object.values(b.store).some(n => n > 0)), b => ({ x: b.x + (b.w >> 1), y: b.y + b.h + 1, store: b, r: 2 }));
      case 'roofs': return nearest(t.buildings.filter(b => b.state === 'up' && data.kinds[b.kind].home), b => ({ x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), roof: true, r: d.range }));
      case 'walls': case 'keep': {
        const keep = nearest(t.buildings.filter(b => b.kind === 'keep' && b.state === 'up'), b => ({ x: b.x + (b.w >> 1), y: b.y + b.h, building: b, r: 2 }));
        if (d.lob || d.keg || d.smash) {
          // siege and brutes: the nearest standing wall cell, else the keep
          const walls = sim.state.walls?.list || [];
          let best = null, bd = Infinity;
          for (const w of walls) for (const [x, y, mat] of w.cells) { const at = sim.cell(x, y); if (!at || at.c.mat[at.i] !== mat) continue; const dd = dist(ux, uy, x, y); if (dd < bd) { bd = dd; best = { x, y, cell: true, r: d.lob ? d.range : 1.6 }; } }
          return best || keep;
        }
        return keep;
      }
      default: return null;
    }
  }

  // ------------------------------------------------------------------ lairs, raids, the threat meter
  function stepFinds() {
    const t = T(); if (!t) return;
    const scanners = [...t.towns.map(x => ({ x: x.x, y: x.y, r: data.townScan || 260 })), ...t.buildings.filter(b => b.state === 'up' && data.kinds[b.kind].scan && b.kind !== 'keep').map(b => ({ x: b.x, y: b.y, r: data.kinds[b.kind].scan })), ...(sim.state.discover?.scouts || []).map(s => ({ x: s.x, y: s.y, r: 110 }))];
    for (const l of lairs) {
      if (found.has(l.id)) continue;
      if (scanners.some(s => dist(s.x, s.y, l.x, l.y) < s.r)) { found.add(l.id); S.lairsFound.push(l.id); say(`Scouts found a ${LAIRS[l.kind].name.toLowerCase()}.`, 'bad', l.x, l.y); }
    }
  }
  function stepLairs() {
    const t = T(); if (!t?.towns?.length) return;
    const dens = level(settings().monsters ?? 'normal'); if (!dens) return;
    const day = sim.tick / sim.dayTicks;
    for (const l of lairs) {
      if (gone.has(l.id)) continue;
      const L = LAIRS[l.kind];
      const town = t.towns.slice().sort((a, b) => dist(l.x, l.y, a.x, a.y) - dist(l.x, l.y, b.x, b.y))[0];
      if (!town || dist(l.x, l.y, town.x, town.y) > 700) continue;          // too far to bother anyone
      // a lair close to a town lies quiet (play-test 3: bandits wrecked the farms before the player could
      // react) — it is still there to find and burn with a flag
      if (t.towns.some(x => dist(l.x, l.y, x.x, x.y) < (SAFE.lairGap ?? 240))) continue;
      if (L.night && !(sim.timeOfDay() > 0.55 && sim.timeOfDay() < 0.95)) continue;
      l.next ??= (day + L.every * (0.5 + rng())) ;
      if (day < l.next || day < 1) continue;
      l.next = day + L.every * (0.6 + rng() * 0.8) / dens;
      const n = L.group[0] + Math.floor(rng() * (L.group[1] - L.group[0] + 1));
      for (let k = 0; k < n; k++) addUnit('enemy', L.spawn[(rng() * L.spawn.length) | 0], l.x + k, l.y, { home: { x: l.x, y: l.y }, lair: l.id });
      say(`${n === 1 ? 'Something' : n + ' creatures'} came out of a ${L.name.toLowerCase()}.`, 'bad', l.x, l.y);
      log(`Attack from a ${L.name.toLowerCase()}`, l.x, l.y);
    }
  }
  /** Raiders scale with wealth and population and pick the weakest point. */
  function planRaid() {
    const t = T(); if (!t?.towns?.length) return;
    const lv = level(settings().raids ?? 'normal'); if (!lv) return;
    const day = sim.tick / sim.dayTicks;
    if (S.nextRaid == null) S.nextRaid = { day: Math.max(RAID.firstDay, day + RAID.every[0]) };
    const nr = S.nextRaid;
    const town = t.towns[0];
    const pop = people().length, gold = t.gold;
    nr.strength = Math.max(2, Math.round((pop / 20 + gold / 400) * lv * (1 + day * 0.05)));
    const eta = (nr.day - day) * sim.dayTicks / 20;     // seconds
    if (!nr.warned && eta < RAID.warn) {
      nr.warned = true;
      const target = weakestPoint(town);
      nr.x = target.x; nr.y = target.y; nr.why = target.why;
      // where they will come from is decided NOW, so the warning can say it and the map can mark it
      // (play-test 1: "I couldn't tell where the enemies come from and never saw them")
      const a = Math.atan2(target.y - town.y, dxw(town.x, target.x)) || rng() * Math.PI * 2;
      const far = RAID.spawnDist ?? 200;
      nr.sx = ((target.x + Math.cos(a) * far) % W + W) % W; nr.sy = Math.max(30, Math.min(sim.H - 30, target.y + Math.sin(a) * far));
      nr.from = compass(dxw(town.x, nr.sx), nr.sy - town.y);
      sim.events.push({ t: 'warn', text: `Raiders are coming from the ${nr.from} — about ${nr.strength} of them, toward ${target.why}. Tap to see where.`, x: Math.round(nr.sx), y: Math.round(nr.sy), eta: Math.round(eta) });
    }
    if (day >= nr.day) {
      const tx = nr.x ?? town.x, ty = nr.y ?? town.y;
      const a = Math.atan2(ty - town.y, dxw(town.x, tx)) || rng() * Math.PI * 2;
      const far = RAID.spawnDist ?? 200;
      const sx = nr.sx ?? tx + Math.cos(a) * far, sy = nr.sy ?? Math.max(30, Math.min(sim.H - 30, ty + Math.sin(a) * far));
      const mix = pop > 120 ? ['bandit', 'bandit', 'archer_bandit', 'sapper', 'soldier'] : ['bandit', 'bandit', 'archer_bandit'];
      for (let k = 0; k < nr.strength; k++) addUnit('enemy', mix[(rng() * mix.length) | 0], sx + (k % 5), sy + Math.floor(k / 5), { focus: { x: tx, y: ty, t: sim.tick }, home: { x: sx, y: sy }, raid: true });
      if (pop > 200) addUnit('enemy', 'catapult', sx, sy + 4, { focus: { x: tx, y: ty, t: sim.tick }, home: { x: sx, y: sy }, raid: true });
      say(`The raid has begun — raiders${nr.from ? ' from the ' + nr.from : ''}! Tap to see them.`, 'bad', Math.round(sx), Math.round(sy));
      log(`A raid of ${nr.strength} hit ${nr.why || 'the town'}`, tx, ty);
      sim.events.push({ t: 'attack', x: tx, y: ty });
      S.nextRaid = { day: day + RAID.every[0] + rng() * (RAID.every[1] - RAID.every[0]) };
    }
  }
  function compass(dx, dy) {
    const names = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];   // y grows southward
    return names[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  }
  /** The least defended place worth hitting: low safety, few walls, goods to take. */
  function weakestPoint(town) {
    const t = T();
    let best = { x: town.x, y: town.y, why: 'the keep' }, bs = Infinity;
    for (const b of t.buildings) {
      if (b.state !== 'up' || b.town !== town.id) continue;
      const k = data.kinds[b.kind];
      const worth = (k.home ? 1 : 0) + (k.storage ? 2 : 0) + (b.remote ? 2 : 0) + (k.depot ? 3 : 0);
      if (!worth) continue;
      const score = (b.safety ?? 0) * 4 - worth - (b.outskirts ? 2 : 0) + rng();
      if (score < bs) { bs = score; best = { x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), why: b.outskirts ? 'the outskirts' : b.remote ? 'a far ' + k.name.toLowerCase() : 'the ' + k.name.toLowerCase() }; }
    }
    return best;
  }

  // ------------------------------------------------------------------ the garrison (play-test 2)
  // Every town keeps its own guards with no orders from the player: about one for every ten people
  // (more with barracks), recruited from the town a few at a time and paid a small wage from the
  // treasury. Archers go up on wall towers and watchtowers; the rest walk the streets.
  const GAR = data.garrison || { per: 10, base: 3, barracks: 8, max: 80, every: 240, archers: 0.4 };
  function garrisonTarget(town) {
    const pop = people().filter(p => p.town === town.id).length;
    const bar = T().buildings.filter(b => b.town === town.id && b.state === 'up' && data.kinds[b.kind].barracks).length;
    // at war (a flag is up, or enemies are in town) fighting comes before other work: the town calls up
    // a levy on top of its usual guards (play-test 3: "it should keep sending troops")
    const levy = atWar(town) ? Math.ceil(pop * (GAR.levy ?? 0.08)) : 0;
    // every guard post adds guards stationed at it (owner, play-test 3)
    const posted = postsOf(town).reduce((a, b) => a + data.kinds[b.kind].post, 0);
    return Math.min(GAR.max + levy + posted, GAR.base + Math.floor(pop / GAR.per) + bar * GAR.barracks + levy + posted);
  }
  /** A flag of this town is up, or enemies are inside its wards. */
  function atWar(town) {
    if (S.flags.some(f => f.town === town.id)) return true;
    return (town.wards || []).some(w => S.units.some(o => o.side === 'enemy' && o.hp > 0 && dist(o.x, o.y, w.x, w.y) < w.r + 20));
  }

  // ------------------------------------------------------------------ wards (play-test 3)
  // "Make it so a percentage of townfolk are staffed as guards who wander around so that you don't have
  // to send guards from across the map." A town's street guards are split into WARDS: patrol areas
  // centred on clusters of its buildings — farms, mines, docks and outposts out at the edge included —
  // and each guard walks and defends its own ward. Only a fight with nobody local to answer it pulls
  // in a guard from next door (at most WARD_HELP m away, at most two responders per enemy).
  const WARD_GAP = GAR.wardGap ?? 70, WARD_R = GAR.wardR ?? 45, WARD_HELP = GAR.wardHelp ?? 130;
  const postsOf = town => T().buildings.filter(b => b.town === town.id && b.state === 'up' && typeof data.kinds[b.kind].post === 'number');
  function computeWards(town) {
    const t = T();
    const posts = postsOf(town);
    const blds = t.buildings.filter(b => b.town === town.id && b.state === 'up' && !posts.includes(b))
      .map(b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }))
      .sort((a, b) => dist(a.x, a.y, town.x, town.y) - dist(b.x, b.y, town.x, town.y));
    const wards = [{ x: town.x, y: town.y, n: 0 }];
    for (const b of blds) {
      let best = null, bd = Infinity;
      for (const w of wards) { const d = dist(b.x, b.y, w.x, w.y); if (d < bd) { bd = d; best = w; } }
      if (bd > WARD_GAP) wards.push({ x: b.x, y: b.y, n: 1 }); else best.n++;
    }
    // a ward's middle is the middle of its buildings, its size reaches its furthest one
    for (const w of wards) { w.sx = 0; w.sy = 0; w.k = 0; w.r = 20; }
    for (const b of blds) {
      let best = wards[0], bd = Infinity;
      for (const w of wards) { const d = dist(b.x, b.y, w.x, w.y); if (d < bd) { bd = d; best = w; } }
      best.sx += dxw(best.x, b.x); best.sy += b.y - best.y; best.k++; best.r = Math.max(best.r, bd + 8);
    }
    const out = wards.map((w, k) => ({ id: k, x: wrapX(w.x + (w.k ? w.sx / w.k : 0)), y: w.y + (w.k ? w.sy / w.k : 0), r: Math.min(WARD_R + 25, Math.max(WARD_R * 0.6, w.r)), n: Math.max(1, w.k) }));
    // a guard post is a ward of its own: its guards stand watch around it
    for (const b of posts) out.push({ id: out.length, x: b.x + b.w / 2, y: b.y + b.h / 2, r: WARD_R * 0.8, n: 1, post: b.id, hold: data.kinds[b.kind].post });
    return out;
  }
  /** Give every street guard a ward: the busiest wards first, the guards spread evenly. */
  function assignWards(town, mine) {
    if (!town.wards || sim.tick - (town.wardsAt || -1e9) > 600) { town.wards = computeWards(town); town.wardsAt = sim.tick; for (const u of mine) u.ward = null; }
    const W2 = town.wards; if (!W2.length) return;
    const street = mine.filter(u => u.mode === 'garrison');
    const count = new Map(W2.map(w => [w.id, 0]));
    for (const u of street) if (u.ward != null && count.has(u.ward)) count.set(u.ward, count.get(u.ward) + 1); else u.ward = null;
    // guard posts are filled first, up to the guards they station
    for (const w of W2) if (w.hold) for (const u of street) {
      if (count.get(w.id) >= w.hold) break;
      if (u.ward != null && W2[u.ward]?.hold) continue;
      if (u.ward != null) count.set(u.ward, count.get(u.ward) - 1);
      u.ward = w.id; u.beat = null; count.set(w.id, count.get(w.id) + 1);
    }
    for (const u of street) {
      if (u.ward != null) continue;
      // fewest guards per building first; nearest breaks a tie
      let best = null, bs = Infinity;
      for (const w of W2) { if (w.hold) continue; const s2 = count.get(w.id) / w.n * 100 + dist(u.x, u.y, w.x, w.y) * 0.01; if (s2 < bs) { bs = s2; best = w; } }
      u.ward = best.id; count.set(best.id, count.get(best.id) + 1);
    }
  }
  const wardOf = (u, town) => town.wards?.[u.ward] || null;
  /** Who answers trouble: enemy id -> guards already on it (so a far guard only comes when needed). */
  let respondTick = -1, responders = new Map();
  function respondersOf(id) {
    if (respondTick !== sim.tick) { respondTick = sim.tick; responders = new Map(); for (const u of S.units) if (u.side === 'guard' && u.tgt != null) responders.set(u.tgt, (responders.get(u.tgt) || 0) + 1); }
    return responders.get(id) || 0;
  }
  const has = (town, kind) => T().buildings.some(b => b.town === town.id && b.state === 'up' && b.kind === kind);
  function recruitKind(town, mine) {
    const archers = mine.filter(u => G[u.kind].ranged).length;
    const wantArch = Math.round((mine.length + 1) * GAR.archers);
    if (has(town, 'mage_guild') && !mine.some(u => u.kind === 'mage') && mine.length > 8) return 'mage';
    if (archers < wantArch) return has(town, 'armourer') && rng() < 0.4 ? 'crossbowman' : 'archer';
    return has(town, 'smithy') || has(town, 'armourer') || mine.length > 6 ? 'spearman' : 'watchman';
  }
  /** Wall-tower and watchtower spots that want an archer on them. */
  function wallSpots(town) {
    const out = [];
    const R = reachOf(town) + 40;
    for (const w of sim.state.walls?.list || []) for (const [x, y] of w.towers || []) if (dist(x, y, town.x, town.y) < R) out.push({ x, y, key: 'w' + w.id + ':' + x + ',' + y });
    for (const b of T().buildings) if (b.town === town.id && b.state === 'up' && data.kinds[b.kind].tower === 'watchtower') out.push({ x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), key: 'b' + b.id });
    return out;
  }
  function stepGarrison() {
    const t = T(); if (!t?.towns?.length) return;
    for (const town of t.towns) {
      const keep = t.buildings.find(b => b.id === town.keep && b.state === 'up'); if (!keep) continue;
      const mine = S.units.filter(u => u.side === 'guard' && u.town === town.id);
      town.garrisonWant = garrisonTarget(town);
      const every = atWar(town) ? GAR.every / (GAR.warRecruit ?? 4) : GAR.every;
      if (!S.garrisonOff && mine.length < town.garrisonWant && sim.tick - (town.lastRecruit || -1e9) > every && t.gold >= 0) {
        const kind = recruitKind(town, mine);
        const home = t.buildings.find(b => b.town === town.id && b.state === 'up' && data.kinds[b.kind].barracks) || keep;
        const u = addUnit('guard', kind, home.x + (home.w >> 1), home.y + home.h + 1, { town: town.id, home: home.id, mode: 'garrison' });
        town.lastRecruit = sim.tick;
        mine.push(u);
      }
      assignWards(town, mine);
      // archers onto empty wall towers / watchtowers
      const spots = wallSpots(town);
      const taken = new Set(mine.filter(u => u.mode === 'wall').map(u => u.spot));
      for (const sp of spots) {
        if (taken.has(sp.key)) continue;
        const a = mine.find(u => u.mode === 'garrison' && G[u.kind].ranged);
        if (!a) break;
        a.mode = 'wall'; a.spot = sp.key; a.post = { x: sp.x, y: sp.y }; a.path = null; a.wallPost = true; taken.add(sp.key);
      }
      // a wall archer whose tower is gone comes back down
      const live = new Set(spots.map(s => s.key));
      for (const u of mine) if (u.mode === 'wall' && !live.has(u.spot)) { u.mode = 'garrison'; u.spot = null; u.post = null; }
    }
  }
  // a guard standing in a wall tower stands ON the wall: let it walk onto the tower's cells
  // (the tower itself is solid to everyone else)

  // ------------------------------------------------------------------ attack flags (play-test 2)
  // "Designate an area to be attacked, automatically sending troops in groups (not one at a time) to
  // attack outposts or enemies. Allow those flags to be moved or cleared and the troops should
  // automatically move or return to base."
  const FLAG_R = 34;
  function armySize(town) {
    const mine = S.units.filter(u => u.side === 'guard' && u.town === town.id && u.mode !== 'crew' && u.mode !== 'escort');
    const keepHome = Math.max(2, Math.ceil(mine.length * (GAR.keepHome ?? 0.2)));
    return Math.max(0, mine.length - keepHome);
  }
  function stepFlags() {
    const t = T(); if (!t?.towns?.length) return;
    // drop units from flags that are gone
    const ids = new Set(S.flags.map(f => f.id));
    for (const u of S.units) if (u.mode === 'army' && !ids.has(u.flag)) { u.mode = 'garrison'; u.flag = null; u.path = null; u.beat = null; }
    for (const f of S.flags) {
      const town = t.towns.slice().sort((a, b) => dist(f.x, f.y, a.x, a.y) - dist(f.x, f.y, b.x, b.y))[0];
      if (!town) continue;
      f.town = town.id;
      // the band gathers at the edge of town on the flag's side, then marches together
      const ang = Math.atan2(f.y - town.y, dxw(town.x, f.x));
      const R = Math.min(reachOf(town) - 30, dist(town.x, town.y, f.x, f.y) * 0.5);
      f.gx = wrapX(town.x + Math.cos(ang) * R); f.gy = town.y + Math.sin(ang) * R;
      const want = Math.ceil(armySize(town) / Math.max(1, S.flags.filter(g => g.town === town.id).length));
      let have = S.units.filter(u => u.mode === 'army' && u.flag === f.id);
      // fill the band from the street guards (melee first, then archers); never the wall archers.
      // Once the band has marched, anyone who falls is REPLACED: fresh guards (and the levy the town
      // raises while a flag is up) go straight out to the flag a few at a time (play-test 3: "they
      // just died easily and no more troops went out")
      if (have.length < want) {
        const marching = f.state === 'march' || f.state === 'fight';
        // the first band is picked once and leaves together; after that, help streams out
        const gathering = f.state === 'gather' && sim.tick - (f.since || 0) > 20;
        if (!gathering && (!marching || sim.tick - (f.sentAt || 0) > 60)) {
          const free = S.units.filter(u => u.side === 'guard' && u.town === town.id && u.mode === 'garrison')
            .sort((a, b) => (G[a.kind].ranged ? 1 : 0) - (G[b.kind].ranged ? 1 : 0) || (marching ? dist(a.x, a.y, f.x, f.y) - dist(b.x, b.y, f.x, f.y) : dist(a.x, a.y, f.gx, f.gy) - dist(b.x, b.y, f.gx, f.gy)));
          const n = marching ? Math.min(4, want - have.length) : want - have.length;
          const sent = free.slice(0, n);
          for (const u of sent) { u.mode = 'army'; u.flag = f.id; u.path = null; u.ward = null; u.direct = marching; have.push(u); }
          if (sent.length && marching) { f.sentAt = sim.tick; f.sent = (f.sent || 0) + sent.length; }
        }
        if (have.length && !marching && f.state !== 'gather') { f.state = 'gather'; f.since = sim.tick; }
      }
      if (!have.length) { f.state = 'waiting'; continue; }
      if (f.state === 'gather') {
        const ready = have.filter(u => dist(u.x, u.y, f.gx, f.gy) < 9).length;
        if (ready >= have.length || sim.tick - f.since > 900) { f.state = 'march'; f.since = sim.tick; say(`${have.length} troops march out to the flag.`, 'info', f.gx, f.gy); }
      }
      if (f.state === 'march' || f.state === 'fight') {
        const there = have.filter(u => dist(u.x, u.y, f.x, f.y) < FLAG_R).length;
        const foes = S.units.some(o => o.side === 'enemy' && o.hp > 0 && dist(o.x, o.y, f.x, f.y) < FLAG_R + 10);
        f.state = foes && there ? 'fight' : 'march';
        // a lair or camp in the flag's circle burns once its defenders are gone and the band stands there a while
        // (a few holding the spot is enough: with reinforcements the band can be far bigger than who got there)
        if (!foes && there >= Math.min(4, Math.ceil(have.length / 2))) {
          f.hold = (f.hold || 0) + 10;
          if (f.hold > 200) {
            for (const l of lairs) if (!gone.has(l.id) && dist(l.x, l.y, f.x, f.y) < FLAG_R + 6) {
              gone.add(l.id); S.lairsGone.push(l.id);
              say(`Your troops destroyed the ${LAIRS[l.kind].name.toLowerCase()}.`, 'good', l.x, l.y);
              log(`Your troops burned a ${LAIRS[l.kind].name.toLowerCase()}`, l.x, l.y);
              for (let k = 0; k < 10; k++) { const at = sim.cell(l.x + ((rng() * 9) | 0) - 4, l.y + ((rng() * 9) | 0) - 4); if (at && at.c.mat[at.i] && M.ignite[at.c.mat[at.i]]) sim.rules.ignite(at.c, at.i); }
            }
            const rv = sim.rivals?.ownerAt?.(f.x, f.y);
            if (rv && f.hold % 400 < 10) sim.rivals.raided?.(rv.id, f.x, f.y, have.length);
          }
        } else f.hold = 0;
      }
    }
  }
  function armyThink(u, town) {
    const f = S.flags.find(g => g.id === u.flag);
    if (!f) { u.mode = 'garrison'; return; }
    const foe = nearestEnemyOf(u, f.state === 'gather' ? 8 : 18);
    if (foe) return fight(u, foe);
    u.fighting = false;
    const k = S.units.filter(o => o.flag === f.id).indexOf(u);
    const ox = (k % 4) * 2 - 3, oy = Math.floor(k / 4) * 2 - 2;
    if ((f.state === 'gather' || f.state === 'waiting') && !u.direct) moveToward(u, (f.gx ?? town.x) + ox, (f.gy ?? town.y) + oy, 1);
    else {
      // in the flag's circle: go for anything hostile there, or hold the middle (burning a lair)
      const there = S.units.filter(o => o.side === 'enemy' && o.hp > 0 && dist(o.x, o.y, f.x, f.y) < FLAG_R + 10).sort((a, b) => dist(u.x, u.y, a.x, a.y) - dist(u.x, u.y, b.x, b.y))[0];
      if (there) return fight(u, there);
      moveToward(u, f.x + ox, f.y + oy, 1);
    }
  }

  // ------------------------------------------------------------------ defeat
  function stepDefeat() {
    const t = T(); if (!t) return;
    for (const town of [...t.towns]) {
      const keep = t.buildings.find(b => b.id === town.keep);
      const alive = t.people.some(p => p.town === town.id);
      if ((!keep || keep.state !== 'up') && !alive) {
        t.towns.splice(t.towns.indexOf(town), 1);
        for (const b of t.buildings) if (b.town === town.id) b.town = -1;          // ruins stay where they are
        say(`${town.name} has fallen.`, 'bad', town.x, town.y);
        if (!t.towns.length) sim.events.push({ t: 'defeated', name: town.name });
      }
    }
  }

  // ------------------------------------------------------------------ the system
  function step() {
    for (const u of S.units) if (u.cd > 0) u.cd--;
    for (const u of S.units) {
      if (u.hp <= 0) continue;
      if (u.frozen > 0) { u.frozen--; continue; }                     // Frost Nova
      if (u.side === 'guard') guardThink(u); else enemyThink(u);
    }
    stepPending();
    for (const u of S.units.filter(u => u.hp <= 0)) {
      S.units.splice(S.units.indexOf(u), 1);
      if (!u.left) sim.events.push({ t: u.side === 'guard' ? 'guardDown' : 'enemyDown', kind: u.kind, x: u.x, y: u.y });
      if (u.side === 'guard' && !u.left) say(`A ${G[u.kind].name.toLowerCase()} fell.`, 'bad', u.x, u.y);
    }
    S.shots = S.shots.filter(s => sim.tick - s.t < s.d);
    if (sim.tick % 4 === 1) stepTowers();
    if (sim.tick % 20 === 13) stepGarrison();
    if (sim.tick % 10 === 7) stepFlags();
    if (sim.tick % 40 === 21) stepFinds();
    if (sim.tick % 100 === 33) stepLairs();
    if (sim.tick % 20 === 9) planRaid();
    if (sim.tick % 200 === 41) stepSafety();
    if (sim.tick % 100 === 57) stepDefeat();
    if (sim.tick % sim.dayTicks === sim.dayTicks - 2) wages();
    // an attack anywhere near a town tells the page (it may drop the speed back to 1x)
    if (sim.tick % 40 === 5 && S.units.some(u => u.side === 'enemy' && T()?.towns.some(t => dist(u.x, u.y, t.x, t.y) < 120))) sim.events.push({ t: 'underAttack' });
  }
  /** The garrison's daily pay, from the treasury. An empty treasury means no NEW recruits until it
   *  fills again — nobody walks off and leaves the town undefended (owner: no micromanaging). */
  function wages() {
    const t = T(); let pay = 0;
    for (const u of S.units) if (u.side === 'guard') pay += G[u.kind].wage;
    t.gold = Math.max(-50, t.gold - pay);
  }

  function order(o) {
    const t = T();
    if (o.t === 'hire') {
      const def = G[o.kind]; if (!def) return null;
      if (sim.unlocked?.('guard:' + o.kind) === false) return { error: 'Your kingdom does not know how to make that yet.' };
      const town = t.towns.find(x => x.id === o.town) || t.towns[0]; if (!town) return null;
      const barracks = t.buildings.filter(b => b.town === town.id && b.state === 'up' && data.kinds[b.kind].barracks);
      const cap = barracks.reduce((a, b) => a + data.kinds[b.kind].barracks, 0) + 4;        // the keep holds a few
      const have = S.units.filter(u => u.side === 'guard' && u.town === town.id).length;
      if (def.needs && !t.buildings.some(b => b.kind === def.needs && b.state === 'up')) return { error: `Needs a ${data.kinds[def.needs].name.toLowerCase()}.` };
      if (have >= cap) return { error: 'No room: build a barracks.' };
      if (t.gold < def.hire) return { error: 'Not enough gold.' };
      t.gold -= def.hire;
      const home = barracks[0] || t.buildings.find(b => b.id === town.keep);
      const u = addUnit('guard', o.kind, home.x + (home.w >> 1), home.y + home.h + 1, { town: town.id, home: home.id });
      return { id: u.id, kind: u.kind };
    }
    const ids = o.ids || (o.id != null ? [o.id] : []);
    const units = S.units.filter(u => u.side === 'guard' && ids.includes(u.id));
    if (o.t === 'guard.post') { units.forEach((u, k) => { u.mode = 'post'; u.post = { x: o.x + (k % 3) * 2, y: o.y + Math.floor(k / 3) * 2 }; u.path = null; }); return units.length; }
    if (o.t === 'guard.patrol') { for (const u of units) { u.mode = 'patrol'; u.patrol = o.points.map(([x, y]) => [Math.floor(x), Math.floor(y)]); u.pk = 0; u.path = null; } return units.length; }
    if (o.t === 'guard.hold') { for (const u of units) { u.mode = 'hold'; u.path = null; } return units.length; }
    if (o.t === 'guard.home') { for (const u of units) { u.mode = 'barracks'; u.path = null; u.tower = null; } return units.length; }
    if (o.t === 'guard.dismiss') { for (const u of units) S.units.splice(S.units.indexOf(u), 1); return units.length; }
    if (o.t === 'route.escort') {
      const cart = sim.state.routes?.carts?.find(c => c.route === o.route);
      const g = S.units.find(u => u.side === 'guard' && u.mode === 'barracks');
      if (!cart || !g) return { error: g ? 'No cart on that route yet.' : 'No free guard in the barracks.' };
      g.mode = 'escort'; g.cart = cart.id; return { id: g.id };
    }
    if (o.t === 'flag.add') {
      if (S.flags.length >= 3) return { error: 'Three flags at most — move or clear one first.' };
      const f = { id: S.nextFlag++, x: wrapX(Math.floor(o.x)), y: Math.floor(o.y), state: 'waiting', since: sim.tick };
      S.flags.push(f);
      const town = t.towns.slice().sort((a, b) => dist(f.x, f.y, a.x, a.y) - dist(f.x, f.y, b.x, b.y))[0];
      const n = town ? armySize(town) : 0;
      return n ? { id: f.id, troops: n } : { id: f.id, troops: 0, warn: 'No troops to spare yet: a bigger town (or a barracks) raises more.' };
    }
    if (o.t === 'flag.move') { const f = S.flags.find(g => g.id === o.id); if (!f) return null; f.x = wrapX(Math.floor(o.x)); f.y = Math.floor(o.y); f.hold = 0; if (f.state === 'fight') f.state = 'march'; for (const u of S.units) if (u.flag === f.id) u.path = null; return { id: f.id }; }
    if (o.t === 'flag.clear') { S.flags = o.id == null ? [] : S.flags.filter(g => g.id !== o.id); return { ok: true }; }
    if (o.t === 'spawn' && MON[o.kind]) { const u = addUnit('enemy', o.kind, o.x, o.y, { home: { x: o.x, y: o.y } }); return { id: u.id }; }
    return null;
  }

  function view(rect) {
    const units = [];
    for (const u of S.units) {
      let x = u.x;
      if (rect) { while (x < rect.x0 - 10) x += W; while (x > rect.x1 + 10) x -= W; if (x < rect.x0 - 10 || x > rect.x1 + 10 || u.y < rect.y0 - 10 || u.y > rect.y1 + 10) continue; }
      units.push([u.id, u.side === 'guard' ? 1 : 0, u.kind, +x.toFixed(2), +u.y.toFixed(2), +(u.hp / u.max).toFixed(2), u.mode, u.fighting ? 1 : 0, u.frozen > 0 ? 1 : 0]);
    }
    const shots = S.shots.map(s => [s.x0, s.y0, s.x1, s.y1, Math.min(1, (sim.tick - s.t) / s.d), s.kind]);
    const lairsSeen = [...found].filter(id => !gone.has(id)).map(id => { const l = lairById.get(id); return [l.id, l.kind, l.x, l.y]; });
    const nr = S.nextRaid;
    const guards = S.units.filter(u => u.side === 'guard').map(u => ({ id: u.id, kind: u.kind, mode: u.mode, hp: Math.round(u.hp), max: u.max, x: Math.round(u.x), y: Math.round(u.y), town: u.town }));
    const flags = S.flags.map(f => ({ id: f.id, x: f.x, y: f.y, state: f.state, troops: S.units.filter(u => u.flag === f.id).length, sent: f.sent || 0, gx: f.gx, gy: f.gy, r: FLAG_R }));
    const garrison = (T()?.towns || []).map(t => ({ town: t.id, name: t.name, have: S.units.filter(u => u.side === 'guard' && u.town === t.id).length, want: t.garrisonWant ?? 0, wards: (t.wards || []).length, war: atWar(t) }));
    const shields = Object.values(S.shields).map(sh => [sh.x, sh.y, sh.r, sh.e]);
    return {
      units, shots, lairs: lairsSeen, guards, shields, log: S.log.slice(0, 10), flags, garrison,
      threat: nr ? { inSecs: Math.max(0, Math.round((nr.day - sim.tick / sim.dayTicks) * sim.dayTicks / 20)), strength: nr.strength || 0, toward: nr.why || null, from: nr.warned ? nr.from : null, sx: nr.warned ? Math.round(nr.sx) : null, sy: nr.warned ? Math.round(nr.sy) : null } : null,
      // every enemy within reach of your towns, so the page can point at the ones off screen
      near: S.units.filter(u => u.side === 'enemy' && T()?.towns?.some(t => dist(u.x, u.y, t.x, t.y) < 400)).slice(0, 80).map(u => [Math.round(u.x), Math.round(u.y), u.kind]),
      enemies: S.units.filter(u => u.side === 'enemy').length,
      armies: S.units.filter(u => u.side === 'enemy').filter((u, k) => k % 3 === 0).slice(0, 60).map(u => [Math.round(u.x), Math.round(u.y)]),
    };
  }

  return { id: 'military', step, order, view, safetyAt, enemiesNear, lairs, addUnit, strike };
}
