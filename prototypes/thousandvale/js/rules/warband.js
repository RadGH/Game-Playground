// Thousandvale — WARBANDS in a room: a leader's escort, its standard-bearer, the leader's aura, the
// rout, and the siege of a built piece that stands between a monster and what it is after.
//
// Forked from Farhold's actors.js `EnemyField` (R27 M10 `linkEscort` / `followersOf` / `breakAura` /
// `rout` / `removeModifier`, the escort block of `spawnPack`, and R28 `siegeOf`) with the meshes taken
// out. The numbers are Farhold's: `balance.warbands` (`leaderAura` 1.15, `routChance` 0.5,
// `routSeconds` 6) and the leader modifier is warbands.js `leaderModifier`, applied through
// monster-ai.js `applyModifier` exactly as actors.js does — folded into the escort's own damage once.
//
// What is different on purpose:
//   * an escort member is a room ENTITY like any monster: the room's `spawn` hook (index.js) makes it,
//     so every client draws it and it despawns like any corpse; the camp counts only the leader, and a
//     respawned leader brings a fresh escort;
//   * the escort's places and the bearer's rank roll come from the room's rng (Farhold: its spawner's).
//
//   attachWarbands(field, { cfg, spawn })      once per room; spawn(defId, x, z, level, rank, leader) -> unit
//   escortFor(field, leaderUnit, def)          bring a leader's escort and bearer, and link them
//   field.onLeaderFall(e)                      (set here) a bearer takes the aura down; a leader, the nerve too
//   siege: field.structures(ax, az, bx, bz) -> { id, x, z, gap } | null, field.strikeStructure(e, id) -> { ok, destroyed }

import { leaderModifier } from './farhold.js';
import { applyModifier } from './monster-ai.js';

/** actors.js `removeModifier`: take an `exact` modifier back off (the leader aura is the only one). */
export function removeModifier(e, id) {
  const held = e?.heldMods?.[id];
  if (!held) return false;
  e.dmg = e.dmg.map(v => v / (held.dmg ?? 1));
  e.modDmg = (e.modDmg || 1) / (held.dmg ?? 1);
  delete e.heldMods[id];
  e.modifiers = (e.modifiers || []).filter(x => x !== id);
  return true;
}

/** Everyone following this leader id, alive. */
export function followersOf(field, leaderId) {
  if (leaderId == null) return [];
  return field.monsters.filter(u => u.leader === leaderId && u.dying == null && !u.removed);
}

/** actors.js `linkEscort`: each escort knows its leader and carries the aura while it stands. */
export function linkEscort(field, leader, escort = []) {
  if (!leader) return;
  const W = field.warbands || {};
  leader.leads = true;
  const aura = { ...leaderModifier(W.cfg || {}), exact: true };
  for (const u of escort) {
    if (!u || u === leader || u.leader) continue;
    u.leader = leader.id;
    const def = field.room.engine.enemyDef(u.defId);
    if (def?.banner) u.bearer = true;
    if (!leader.auraBroken && Array.isArray(u.dmg)) {
      applyModifier(field, u, aura);
      (u.heldMods || (u.heldMods = {})).leader = aura;
    }
  }
  field.emit({ t: 'fx', kind: 'escort', id: leader.id, escort: escort.filter(Boolean).map(u => u.id) });
}

/** actors.js `breakAura`: the leader or its standard-bearer fell — every follower hits as it did. */
export function breakAura(field, leaderId) {
  const lead = field.monsters.find(u => u.id === leaderId);
  if (lead) lead.auraBroken = true;
  for (const u of followersOf(field, leaderId)) removeModifier(u, 'leader');
  field.emit({ t: 'fx', kind: 'auraBroken', id: leaderId });
}

/**
 * actors.js `rout`: the leader is down — each follower rolls `routChance` to break and run for
 * `routSeconds`, then comes back. At least one always breaks (the most hurt).
 */
export function rout(field, leaderId) {
  const cfg = field.warbands?.cfg || {};
  const chance = cfg.routChance ?? 0.5, secs = cfg.routSeconds ?? 6;
  const list = followersOf(field, leaderId);
  const broke = list.filter(() => field.rng() < chance);
  if (!broke.length && list.length) broke.push(list.reduce((a, b) => (a.hp / a.maxHp <= b.hp / b.maxHp ? a : b)));
  for (const u of broke) {
    u.state = 'flee';
    u.routed = true;
    u.fleeFor = Math.max(u.fleeFor || 0, secs);
  }
  for (const u of list) u.leader = null;
  if (broke.length) field.emit({ t: 'fx', kind: 'rout', id: leaderId, fled: broke.map(u => u.id), seconds: secs });
  return broke;
}

/**
 * The escort block of actors.js `spawnPack`: two of each `leads` id within the pack radius, then the
 * warband's standard-bearer 3 m off with a rolled rank, all linked to the leader.
 */
export function escortFor(field, leader, def) {
  const W = field.warbands;
  if (!W?.spawn || !leader || !def?.leads?.length) return [];
  const engine = field.room.engine;
  const radius = W.packRadius ?? 9;
  const escort = [];
  const at = r => { const a = field.rng() * Math.PI * 2, rr = r(); return [leader.x + Math.cos(a) * rr, leader.z + Math.sin(a) * rr]; };
  const ok = (x, z) => !field.terrain?.underwater?.(x, z) && field.wild(x, z) && !field.terrain?.blocked?.(x, z);
  for (const id of def.leads) {
    const sub = engine.enemyDef(id);
    if (!sub) continue;
    for (let i = 0; i < 2; i++) {
      const [x, z] = at(() => 3 + field.rng() * radius);
      if (!ok(x, z)) continue;
      const u = W.spawn(id, x, z, leader.level, 'normal', leader);
      if (u) escort.push(u);
    }
  }
  const band = (engine.bestiary.warbands?.warbands || []).find(b => b.id === def.warband);
  const bearerId = def.bearer || band?.bearer;
  if (bearerId && engine.enemyDef(bearerId)) {
    const [x, z] = at(() => 3);
    if (ok(x, z)) {
      const rank = engine.rpg.rollRank ? engine.rpg.rollRank(field.rng, {}) : 'normal';
      const u = W.spawn(bearerId, x, z, leader.level, rank, leader);
      if (u) escort.push(u);
    }
  }
  linkEscort(field, leader, escort);
  return escort;
}

/**
 * actors.js `siegeOf` (R28): the built piece standing between this monster and what it is after, or
 * null — asked every 0.4 s, never for something airborne or busy with a companion. A field with no
 * `structures` (every room today: Thousandvale v1 has no player building) never besieges.
 */
export function siegeOf(field, e, aim, dt) {
  if (!field.structures || e.hover || !aim || aim.kind === 'object' || aim.owner) { e.siege = null; return null; }
  e.siegeCheck = (e.siegeCheck || 0) - dt;
  if (e.siegeCheck <= 0) {
    e.siegeCheck = 0.4;
    e.siege = field.structures(e.x, e.z, aim.x, aim.z) || null;
  }
  return e.siege;
}

/** Once per room. `cfg` = balance.warbands; `spawn(defId, x, z, level, rank, leader)` makes one escort body. */
export function attachWarbands(field, { cfg = {}, spawn = null, packRadius = 9 } = {}) {
  field.warbands = { cfg, spawn, packRadius };
  // actors.js `kill`: a standard-bearer takes the aura down with it; a leader takes the aura AND the nerve
  field.onLeaderFall = e => {
    if (e.bearer && e.leader != null) breakAura(field, e.leader);
    if (e.leads) { breakAura(field, e.id); rout(field, e.id); }
  };
  return field.warbands;
}
