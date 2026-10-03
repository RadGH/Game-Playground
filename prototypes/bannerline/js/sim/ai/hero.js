// Stream E — the AI hero in its own field: where to stand, what to hit, when to back off, when to
// walk to the Outfitter, and when to go and help a teammate's lane.
//
// Hero tier (data/ai.json `hero.tier`):
//   0 (Recruit)   stands in the middle of the field, hits whatever is nearest, never retreats, shops
//                 only when it happens to be at the Outfitter (after a respawn)
//   1 (Veteran)   holds its lane below the ford, hits the most advanced / weakest, ranged heroes step
//                 back from melee, walks home at 30% with no draught, walks to the Outfitter when its
//                 fund buys something and nothing is near the Keep, helps a teammate whose lane is far worse
//   2 (Commander) fights at the ford (units are slowed there) and falls back to the Keep when the wave is
//                 more than it can kill; target priority: whatever has slipped past toward the Keep,
//                 then healers / casters / champions, then the weakest in reach; kites with ranged heroes;
//                 drinks early; shops between waves; helps a leaking teammate; stays out of fights it
//                 cannot win (low and surrounded -> back to the Keep side)
//
// Movement and attacks go out as `move`, `amove` and `attack`.

import { dist2 } from '../mathx.js';
import { atShop } from '../items.js';
import { live } from './read.js';
import { isHidden } from '../traits.js';

/** Does a lane wall stand between (ax, az) and (bx, bz)? */
export function walled(f, ax, az, bx, bz) {
  for (const w of f.laneWalls) {
    const mid = (w.x0 + w.x1) / 2;
    if ((ax < mid) === (bx < mid)) continue;
    if (az > w.z1 + 0.5 && bz > w.z1 + 0.5) continue;
    return w;
  }
  return null;
}

/** Next waypoint from (x, z) toward (tx, tz) that does not walk into a lane wall. */
export function routeTo(f, x, z, tx, tz) {
  const w = walled(f, x, z, tx, tz);
  if (!w) return { x: tx, z: tz };
  const mid = (w.x0 + w.x1) / 2;
  // ways through: each gap, or around the end of the wall
  const ways = w.gaps.map(g => (g.z0 + g.z1) / 2).concat([w.z1 + 2]);
  let best = ways[0], bc = Infinity;
  for (const gz of ways) { const c = Math.abs(z - gz) + Math.abs(tz - gz); if (c < bc) { bc = c; best = gz; } }
  const side = x < mid ? -1 : 1;
  const near = Math.abs(x - mid) < 2.2 && Math.abs(z - best) < 1.6;
  if (near) return { x: mid - side * 3, z: best };   // through the gap to the other side
  return { x: mid + side * 2, z: best };
}

function order(hero) { return hero._ord || { k: 'idle' }; }

function moveCmd(cmd, f, hero, x, z, kind = 'move') {
  const wp = routeTo(f, hero.x, hero.z, x, z);
  const o = order(hero);
  if (o.k === kind && Math.abs(o.x - wp.x) < 0.6 && Math.abs(o.z - wp.z) < 0.6) return;
  if (dist2(hero.x, hero.z, wp.x, wp.z) <= 1.2) return;
  cmd(kind, { x: wp.x, z: wp.z });
}

const PRIORITY_ROLE = { caster: 3, champion: 3, siege: 2, ranged: 1 };

/** Pick the hero's target. Returns an entity or null. */
function chooseTarget(ctx, p, K, hero, foes, f) {
  const tier = K.hero.tier;
  if (!foes.length) return null;
  const { data } = ctx;
  const ranged = !data.heroes.heroes[p.hero].melee && p.form !== 'wolf' && p.form !== 'briarback';
  if (tier === 0) {
    let best = null, bd = Infinity;
    for (const e of foes) { const d = dist2(hero.x, hero.z, e.x, e.z); if (d < bd || (d === bd && e.id < best.id)) { bd = d; best = e; } }
    return best;
  }
  if (tier === 1) {
    if (ranged) { let best = null; for (const e of foes) if (!best || e.z > best.z || (e.z === best.z && e.id < best.id)) best = e; return best; }
    let best = null;
    for (const e of foes) if (dist2(hero.x, hero.z, e.x, e.z) <= 100 && (!best || e.hp < best.hp || (e.hp === best.hp && e.id < best.id))) best = e;
    if (best) return best;
    for (const e of foes) if (!best || e.z > best.z || (e.z === best.z && e.id < best.id)) best = e;
    return best;
  }
  // tier 2: score every body in REACH (chasing what you cannot catch is the classic waste); what is
  // out of reach is handled by moving to intercept it (interceptPoint)
  const def = data.heroes.heroes[p.hero];
  const reach = (ranged ? def.range + 1 : Math.max(def.range, hero._range || 0) + 2.5) + hero.r;
  let best = null, bs = -Infinity;
  for (const e of foes) {
    const d = Math.sqrt(dist2(hero.x, hero.z, e.x, e.z));
    if (d > reach + e.r) continue;
    const u = data.derived.units[e.type];
    let s = 0;
    const toKeep = f.leakZ - e.z;
    if (e.z > hero.z + 2) s += 3;          // already past me
    if (toKeep < 15) s += 6;
    if (u) s += PRIORITY_ROLE[u.role] || 0;
    if (e._traits.indexOf('heal') >= 0) s += 2;
    s += 3 * (1 - Math.min(1, e.hp / Math.max(1, e.hpMax)));   // finish what is low
    if (e.id === hero.target) s += 1.5;   // stickiness: do not twitch between targets
    if (s > bs || (s === bs && e.id < best.id)) { bs = s; best = e; }
  }
  return best;
}

/** Tier 2: where to stand to meet the most dangerous enemy group in my lane (keep-side of it). */
function interceptPoint(ctx, p, hero, foes, f, laneX) {
  const { data } = ctx;
  const def = data.heroes.heroes[p.hero];
  const ranged = !def.melee && p.form !== 'wolf' && p.form !== 'briarback';
  let best = null, bs = -Infinity;
  for (const e of foes) {
    const prox = (e.z - f.z0) / (f.leakZ - f.z0);
    const s = (e.kind === 'tide' ? 1 : e._leak) * (0.3 + prox * prox) - Math.abs(e.x - laneX) * 0.01;
    if (s > bs || (s === bs && e.id < best.id)) { bs = s; best = e; }
  }
  if (!best) return null;
  // meet it a little ahead (it walks +z); a ranged hero keeps most of its range between them
  const lead = ranged ? Math.min(def.range * 0.7, f.leakZ - 2 - best.z) : 2.5;
  return { x: Math.max(f.x0 + 1.5, Math.min(f.x1 - 1.5, best.x)), z: Math.max(f.z0 + 2, Math.min(f.leakZ - 2, best.z + Math.max(0, lead))) };
}

/**
 * Hero play for one think. Returns { target, foes } for the skill code.
 * S: { myLane, laneX, post, threat, D, wantShop, ... } from index.js.
 */
export function heroCommands(ctx, p, K, rng, hero, S, cmd) {
  const { state, data, map } = ctx;
  const f = map.fields[hero.field];
  const tier = K.hero.tier;
  const hp = hero.hp / hero.hpMax;
  const foesAll = [];
  for (const e of state.ents) if (live(e) && e.field === hero.field && e.team !== hero.team && e.kind !== 'hero' && !isHidden(e, hero.x, hero.z)) foesAll.push(e);
  // only what is on my side of the lane walls (a hero cannot shoot through one)
  const foes = foesAll.filter(e => !walled(f, hero.x, hero.z, e.x, e.z));
  const melee = data.heroes.heroes[p.hero].melee || p.form === 'wolf' || p.form === 'briarback';
  const shop = map.fields[hero.field].armory;

  // ── retreat ──
  const meleeOn = foes.filter(e => e._range <= 3 && e.target === hero.id).length;
  const noHeal = S.healSlot < 0;
  if (tier >= 1 && hp < K.hero.retreatAt && (noHeal || state.tick < (p.useAt || 0) + 10)) {
    // Commander stands and fights if the Keep is about to fall and the fight is small
    if (tier >= 2) {
      // Commander falls back toward the Keep FIGHTING (attack-move): the bodies come to it there, it
      // respawns next door if it dies, and walking home with a wave behind it only hands that wave the
      // lane (measured: walking home cost ~15% of games against a plain spammer)
      const fz = f.leakZ - 8;
      if (hero.z < fz - 3) { moveCmd(cmd, f, hero, S.laneX, fz, 'amove'); return { target: null, foes }; }
    } else {
      p.ai.retreat = true;
      moveCmd(cmd, f, hero, f.spawn.x, f.spawn.z);
      return { target: null, foes };
    }
  }
  if (p.ai.retreat) {
    if (hp < (tier >= 2 ? 0.75 : 0.6) && S.threat.near < 6) { moveCmd(cmd, f, hero, f.spawn.x, f.spawn.z); return { target: null, foes }; }
    p.ai.retreat = false;
  }

  // ── shopping trip ──
  if (S.wantShop) {
    if (!atShop(ctx, p)) { moveCmd(cmd, f, hero, shop.x, shop.z); return { target: null, foes }; }
    return { target: null, foes, shopping: true };
  }

  // ── where to stand ──
  const post = S.post;
  const target = chooseTarget(ctx, p, K, hero, foes, f);
  if (tier >= 2 && !target) {
    // nothing in reach: go and meet the most dangerous group (attack-move, so the first body in aggro
    // range gets hit on the way)
    const at = interceptPoint(ctx, p, hero, foes, f, S.laneX);
    if (at) { moveCmd(cmd, f, hero, at.x, at.z, 'amove'); return { target: null, foes }; }
  }
  if (target) {
    const d2 = dist2(hero.x, hero.z, target.x, target.z);
    const aggro = data.heroes.heroes[p.hero].aggro || 8;
    const engage = tier === 0 ? aggro + 2 : tier === 1 ? aggro + 8 : Infinity;   // tier 2 only targets what is in reach
    const chase = d2 <= engage * engage || (tier === 1 && target.z > hero.z && f.leakZ - target.z < 35);
    if (chase) {
      // ranged kiting (tier >= 1): step away from melee that is on me, then keep shooting
      // (only when it is losing that fight: every step away is a shot not taken — measured, kiting at
      // the first touch cost a third of the games against a plain spammer)
      if (!melee && tier >= 1 && K.hero.kite !== false && meleeOn >= (tier >= 2 ? 3 : 2) && hp < (tier >= 2 ? 0.45 : 0.5)) {
        let mx = 0, mz = 0, n = 0;
        for (const e of foes) if (e._range <= 3 && e.target === hero.id) { mx += e.x; mz += e.z; n++; }
        let dx = hero.x - mx / n, dz = hero.z - mz / n;
        const d = Math.sqrt(dx * dx + dz * dz) || 1;
        dx /= d; dz /= d;
        const tx = Math.max(f.x0 + 2, Math.min(f.x1 - 2, hero.x + dx * 5)), tz = Math.max(f.z0 + 2, Math.min(f.leakZ - 4, hero.z + dz * 5 + 1));
        moveCmd(cmd, f, hero, tx, tz);
        return { target, foes, kiting: true };
      }
      const o = order(hero);
      if (o.k !== 'attack' || o.target !== target.id) cmd('attack', { target: target.id });
      return { target, foes };
    }
  }
  // nothing worth chasing: walk to the post and hold it (attack-move, so anything on the way gets hit)
  if (dist2(hero.x, hero.z, post.x, post.z) > (tier >= 2 ? 9 : 25)) moveCmd(cmd, f, hero, post.x, post.z, 'amove');
  return { target: target && dist2(hero.x, hero.z, target.x, target.z) <= 400 ? target : null, foes };
}

/** Where the hero should hold, given the situation (tier-dependent). */
export function postFor(ctx, p, K, S) {
  const { state, map } = ctx;
  const f = map.fields[state.teams[p.team].field];
  const tier = K.hero.tier;
  if (tier === 0) return { x: f.cx, z: 92 };
  let laneX = S.laneX;
  // help: a teammate's lane leaks much worse than mine
  if (K.team >= 1 && S.threat.lanes.length > 1) {
    const mine = S.threat.lanes[S.myLane].danger;
    let worst = S.myLane;
    S.threat.lanes.forEach((l, i) => { if (l.danger > S.threat.lanes[worst].danger) worst = i; });
    const k = K.team >= 2 ? 1.5 : 2.5;
    if (worst !== S.myLane && S.threat.lanes[worst].danger > mine * k + (K.team >= 2 ? 0.8 : 2)) { laneX = f.gates[worst].x; p.ai.helping = worst; }
    else p.ai.helping = -1;
  }
  if (tier === 1) return { x: laneX, z: 84 };
  // Commander: fight at the ford unless the Keep side is threatened or the wave outclasses me
  const heavy = S.threat.ehp > S.myDps * 25;
  const PZ = K.hero.post || [74, 100];   // [forward post (the ford), fall-back post]
  let z = heavy || S.threat.near > 0 ? PZ[1] : PZ[0];
  if (S.threat.deepest && S.threat.deepest.z > z + 6) z = Math.min(f.leakZ - 6, S.threat.deepest.z);
  return { x: laneX, z };
}
