// Guards, towers, monsters, lairs, raids, safety and combat. PURE, a sim system.
//
// Owner decisions (2026-11-03):
//   * orders, not hands: hire guards, give them a post or a patrol loop, hold, or send them back to
//     barracks. They pick their own targets. ENEMIES NEAR A PATROL ROUTE OR POST CALL THE GUARDS
//     AUTOMATICALLY — the game plays itself;
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

export function createMilitary(sim, data) {
  const { M } = sim;
  const G = data.guards, TW = data.towers, MON = data.monsters, LAIRS = data.lairs, RAID = data.raids, SAFE = data.safety;
  const S = sim.state.military ??= { units: [], shots: [], lairsFound: [], lairsGone: [], nextId: 1, nextRaid: null, log: [], safety: {}, shields: {} };
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
  function moveToward(u, tx, ty, near = 1) {
    // re-plan when the goal moved a fair way or the path ran out — but never more than every 2 s,
    // and a search that failed waits longer (a hopeless search is the expensive kind)
    const stale = !u.path || u.pi >= u.path.length || (u.goal && dist(u.goal.x, u.goal.y, tx, ty) > 8 && (u.path.length - u.pi < 6 || sim.tick - (u.planned || 0) > 160));
    if (stale && sim.tick - (u.planned || -1e9) > (u.failed ? 400 : 40)) {
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
          else { u.path = null; u.planned = Math.min(u.planned || 0, sim.tick - 30); }
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
  function guardThink(u) {
    const d = G[u.kind], town = T().towns.find(t => t.id === u.town);
    // anyone hostile near my post or route? (owner: enemies near a patrol call the guards)
    const anchors = u.mode === 'post' && u.post ? [u.post] : u.mode === 'patrol' && u.patrol?.length ? u.patrol.map(([x, y]) => ({ x, y })) : u.mode === 'crew' && u.post ? [u.post] : [{ x: u.x, y: u.y }];
    let call = null, cd = Infinity;
    for (const o of S.units) {
      if (o.side !== 'enemy' || o.hp <= 0) continue;
      for (const a of anchors) { const dd = dist(a.x, a.y, o.x, o.y); if (dd < SAFE.callRadius + (u.mode === 'hold' ? -10 : 0) && dd < cd) { cd = dd; call = o; } }
    }
    const range = d.range * (onWall(u) ? 1.5 : 1);
    if (call) {
      const dd = dist(u.x, u.y, call.x, call.y);
      if (dd <= range) { if (u.cd <= 0) { attack(u, call); u.cd = d.cd * 20; } }
      else if (u.mode !== 'crew' && u.mode !== 'hold') moveToward(u, call.x, call.y, Math.max(1, Math.floor(range - 0.5)));
      u.fighting = true;
      return;
    }
    u.fighting = false;
    if (u.mode === 'post' && u.post) moveToward(u, u.post.x, u.post.y, 1);
    else if (u.mode === 'crew' && u.post) moveToward(u, u.post.x, u.post.y, 1);
    else if (u.mode === 'patrol' && u.patrol?.length) { const [px, py] = u.patrol[u.pk % u.patrol.length]; if (moveToward(u, px, py, 1) || dist(u.x, u.y, px, py) < 1.5) { u.pk = (u.pk + 1) % u.patrol.length; u.path = null; } }
    else if (u.mode === 'escort') {
      const cart = sim.state.routes?.carts?.find(c => c.id === u.cart);
      if (cart) moveToward(u, cart.x, cart.y, 2); else u.mode = 'barracks';
    } else if (u.mode === 'barracks') {
      const b = T().buildings.find(b => b.id === u.home) || T().buildings.find(b => b.kind === 'keep' && b.town === u.town);
      if (b) moveToward(u, b.x + (b.w >> 1), b.y + b.h + 1, 2);
    }
    // patrolling marks the ground as watched
    markSafe(u.x, u.y);
  }
  const onWall = u => { const at = sim.cell(u.x, u.y + 1); return !!at && (M.built[at.c.mat[at.i]] && !at.c.part[at.i]); };

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
        const free = S.units.filter(u => u.side === 'guard' && u.town === b.town && u.mode === 'barracks' && (def.crew === 'any' || u.kind === def.crew || u.kind === 'crossbowman'))[0];
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
    sim.damage = Object.assign((x, y, amount) => {
      for (const sh of Object.values(S.shields)) if (sh.e > 0 && dist(x, y, sh.x, sh.y) < sh.r) { const take = Math.min(sh.e, amount); sh.e -= take; amount -= take; if (amount <= 0) return false; }
      return baseDamage(x, y, amount);
    }, { shielded: true });
  }
  sim.shielded = (c, i) => { const s = Object.values(S.shields); if (!s.length) return false; const x = c.cx * 64 + (i % 64), y = c.cy * 64 + ((i / 64) | 0); return s.some(sh => sh.e > 0 && dist(x, y, sh.x, sh.y) < sh.r); };

  // ------------------------------------------------------------------ enemies
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
    const tgt = goalOf(u);
    if (!tgt) { // nothing left to do: go home
      if (u.home) { if (moveToward(u, u.home.x, u.home.y, 2)) u.hp = 0, u.left = true; } else u.hp = 0, u.left = true;
      return;
    }
    if (dist(u.x, u.y, tgt.x, tgt.y) <= Math.max(d.range, tgt.r || 1.5)) {
      if (u.cd > 0) return;
      u.cd = d.cd * 20;
      if (tgt.person) hurt(tgt, d.dmg, u);
      else if (tgt.store) {
        const b = tgt.store; let take = d.steal || 4;
        for (const [gg, n] of Object.entries(b.store)) { if (!take) break; const k = Math.min(n, take); b.store[gg] -= k; take -= k; u.loot = (u.loot || 0) + k; }
        if ((u.loot || 0) >= 30 || !Object.values(b.store).some(n => n > 0)) u.done = true;
        log(`Bandits robbed the ${data.kinds[b.kind].name.toLowerCase()}.`, b.x, b.y);
      } else if (tgt.cart) { const c = tgt.cart; if (c.load) { u.loot = (u.loot || 0) + c.load.n; c.load = null; say('A cart was robbed on the road.', 'bad', c.x, c.y); } u.done = true; }
      else if (tgt.roof) {
        // a drake breathes fire over roofs
        for (let k = 0; k < 6; k++) { const at = sim.cell(tgt.x + ((rng() * 7) | 0) - 3, tgt.y + ((rng() * 7) | 0) - 3); if (at && at.c.mat[at.i] && M.ignite[at.c.mat[at.i]]) sim.rules.ignite(at.c, at.i); }
        S.shots.push({ x0: u.x, y0: u.y - 3, x1: tgt.x, y1: tgt.y, t: sim.tick, d: 8, kind: 'flame' });
        u.burns = (u.burns || 0) + 1; if (u.burns > 6) u.done = true;
      } else if (tgt.cell) {
        if (d.lob) attack(u, tgt); else sim.damage?.(tgt.x, tgt.y, d.smash || d.dmg);
      }
      return;
    }
    if (d.lob && tgt.cell && dist(u.x, u.y, tgt.x, tgt.y) <= d.range) { if (u.cd <= 0) { attack(u, tgt); u.cd = d.cd * 20; } return; }
    moveToward(u, tgt.x, tgt.y, d.lob ? Math.floor(d.range * 0.8) : 1);
  }
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
    switch (d.wants) {
      case 'people': return nearest(people(), p => ({ x: p.x, y: p.y, person: p, r: 1.4 }));
      case 'carts': return nearest(sim.state.routes?.carts || [], c => c.load ? { x: c.x, y: c.y, cart: c, r: 1.6 } : null) || nearest(people(), p => ({ x: p.x, y: p.y, person: p, r: 1.4 }));
      case 'stores': return nearest(t.buildings.filter(b => b.state === 'up' && (data.kinds[b.kind].storage || 0) > 0 && Object.values(b.store).some(n => n > 0)), b => ({ x: b.x + (b.w >> 1), y: b.y + b.h + 1, store: b, r: 2 }));
      case 'roofs': return nearest(t.buildings.filter(b => b.state === 'up' && data.kinds[b.kind].home), b => ({ x: b.x + (b.w >> 1), y: b.y + (b.h >> 1), roof: true, r: d.range }));
      case 'walls': case 'keep': {
        const keep = nearest(t.buildings.filter(b => b.kind === 'keep' && b.state === 'up'), b => ({ x: b.x + (b.w >> 1), y: b.y + b.h - 1, cell: true, r: 2 }));
        if (d.lob) {
          // siege: the nearest wall cell, else the keep
          const walls = sim.state.walls?.list || [];
          let best = null, bd = Infinity;
          for (const w of walls) for (const [x, y, mat] of w.cells) { const at = sim.cell(x, y); if (!at || at.c.mat[at.i] !== mat) continue; const dd = dist(ux, uy, x, y); if (dd < bd) { bd = dd; best = { x, y, cell: true, r: d.range }; } }
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
      nr.sx = ((target.x + Math.cos(a) * 110) % W + W) % W; nr.sy = Math.max(30, Math.min(sim.H - 30, target.y + Math.sin(a) * 110));
      nr.from = compass(dxw(town.x, nr.sx), nr.sy - town.y);
      sim.events.push({ t: 'warn', text: `Raiders are coming from the ${nr.from} — about ${nr.strength} of them, toward ${target.why}. Tap to see where.`, x: Math.round(nr.sx), y: Math.round(nr.sy), eta: Math.round(eta) });
    }
    if (day >= nr.day) {
      const tx = nr.x ?? town.x, ty = nr.y ?? town.y;
      const a = Math.atan2(ty - town.y, dxw(town.x, tx)) || rng() * Math.PI * 2;
      const sx = nr.sx ?? tx + Math.cos(a) * 110, sy = nr.sy ?? Math.max(30, Math.min(sim.H - 30, ty + Math.sin(a) * 110));
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
    for (const u of S.units) { if (u.hp <= 0) continue; if (u.side === 'guard') guardThink(u); else enemyThink(u); }
    for (const u of S.units.filter(u => u.hp <= 0)) {
      S.units.splice(S.units.indexOf(u), 1);
      if (!u.left) sim.events.push({ t: u.side === 'guard' ? 'guardDown' : 'enemyDown', kind: u.kind, x: u.x, y: u.y });
      if (u.side === 'guard' && !u.left) say(`A ${G[u.kind].name.toLowerCase()} fell.`, 'bad', u.x, u.y);
    }
    S.shots = S.shots.filter(s => sim.tick - s.t < s.d);
    if (sim.tick % 4 === 1) stepTowers();
    if (sim.tick % 40 === 21) stepFinds();
    if (sim.tick % 100 === 33) stepLairs();
    if (sim.tick % 20 === 9) planRaid();
    if (sim.tick % 200 === 41) stepSafety();
    if (sim.tick % 100 === 57) stepDefeat();
    if (sim.tick % sim.dayTicks === sim.dayTicks - 2) wages();
    // an attack anywhere near a town tells the page (it may drop the speed back to 1x)
    if (sim.tick % 40 === 5 && S.units.some(u => u.side === 'enemy' && T()?.towns.some(t => dist(u.x, u.y, t.x, t.y) < 120))) sim.events.push({ t: 'underAttack' });
  }
  function wages() {
    const t = T(); let pay = 0;
    for (const u of S.units) if (u.side === 'guard') pay += G[u.kind].wage;
    t.gold -= pay;
    if (t.gold < 0) {
      // unpaid guards walk off, the newest first
      while (t.gold < 0) { const u = S.units.filter(u => u.side === 'guard').pop(); if (!u) break; S.units.splice(S.units.indexOf(u), 1); t.gold += G[u.kind].wage * 5; say('An unpaid guard left.', 'bad', u.x, u.y); }
    }
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
    if (o.t === 'spawn' && MON[o.kind]) { const u = addUnit('enemy', o.kind, o.x, o.y, { home: { x: o.x, y: o.y } }); return { id: u.id }; }
    return null;
  }

  function view(rect) {
    const units = [];
    for (const u of S.units) {
      let x = u.x;
      if (rect) { while (x < rect.x0 - 10) x += W; while (x > rect.x1 + 10) x -= W; if (x < rect.x0 - 10 || x > rect.x1 + 10 || u.y < rect.y0 - 10 || u.y > rect.y1 + 10) continue; }
      units.push([u.id, u.side === 'guard' ? 1 : 0, u.kind, +x.toFixed(2), +u.y.toFixed(2), +(u.hp / u.max).toFixed(2), u.mode, u.fighting ? 1 : 0]);
    }
    const shots = S.shots.map(s => [s.x0, s.y0, s.x1, s.y1, Math.min(1, (sim.tick - s.t) / s.d), s.kind]);
    const lairsSeen = [...found].filter(id => !gone.has(id)).map(id => { const l = lairById.get(id); return [l.id, l.kind, l.x, l.y]; });
    const nr = S.nextRaid;
    const guards = S.units.filter(u => u.side === 'guard').map(u => ({ id: u.id, kind: u.kind, mode: u.mode, hp: Math.round(u.hp), max: u.max, x: Math.round(u.x), y: Math.round(u.y) }));
    const shields = Object.values(S.shields).map(sh => [sh.x, sh.y, sh.r, sh.e]);
    return {
      units, shots, lairs: lairsSeen, guards, shields, log: S.log.slice(0, 10),
      threat: nr ? { inSecs: Math.max(0, Math.round((nr.day - sim.tick / sim.dayTicks) * sim.dayTicks / 20)), strength: nr.strength || 0, toward: nr.why || null, from: nr.warned ? nr.from : null, sx: nr.warned ? Math.round(nr.sx) : null, sy: nr.warned ? Math.round(nr.sy) : null } : null,
      // every enemy within reach of your towns, so the page can point at the ones off screen
      near: S.units.filter(u => u.side === 'enemy' && T()?.towns?.some(t => dist(u.x, u.y, t.x, t.y) < 400)).slice(0, 80).map(u => [Math.round(u.x), Math.round(u.y), u.kind]),
      enemies: S.units.filter(u => u.side === 'enemy').length,
      armies: S.units.filter(u => u.side === 'enemy').filter((u, k) => k % 3 === 0).slice(0, 60).map(u => [Math.round(u.x), Math.round(u.y)]),
    };
  }

  return { id: 'military', step, order, view, safetyAt, enemiesNear, lairs, addUnit };
}
