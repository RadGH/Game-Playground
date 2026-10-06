// Thousandvale — the RULES of riding (play-test 2, Q16: "the owner wants to try one").
//
// Stream A owns the mounts themselves (js/sim/mounts.js: a character OWNS mounts, rides one, `entity.speedMul`
// scales the walk). This file is the rulebook both sides read, so the server, the client's prediction and the
// tests agree on WHEN you ride and WHEN you come off:
//
//   * calling a mount is a 1.5 s cast: you stand still, and a hit or a step breaks it;
//   * you cannot call one while fighting (a monster has you as its target, or you hit something in the last
//     5 s), while swimming, while dead, or inside a dungeon/instance;
//   * you come off when you ATTACK or CAST (the attack still happens — no "you are mounted" refusal), when you
//     swim, die, or go into a dungeon;
//   * a DAMAGING HIT from an enemy throws you, unless the mount keeps its head: a mount's `calm` (0..0.8, the
//     same idea as Farhold's `cond_mountCalm` "less likely to throw you when something charges") is the chance
//     you stay on. A burn or poison TICK never throws you (else you could not ride away from a fight you left
//     on fire), nor does a heal or a fully absorbed hit;
//   * thrown off, you cannot call the mount again for 3 s.
//
// Mounted speed is the mount's own multiplier on the on-foot speeds (A's table, 1.35x-1.75x), clamped here.
//
// Why not Farhold's mount ITEMS (rarity + slot affixes, js/gear.js)? Considered and left out on purpose: in an
// MMO a mount is a thing you collect once and keep (A's owned list), not loot that competes for a bag slot and
// gets salvaged; and Farhold's four mount affixes are three movement knobs A's prediction would have to share
// plus Trample, which needs a body-in-the-path test the room does not do. The one affix that IS a rule —
// Calm — is kept, as a per-mount number.
//
// Pure.

export const MOUNT_RULES = Object.freeze({
  /** seconds to call a mount (standing still) */
  castSeconds: 1.5,
  /** metres you may drift during the call before it breaks */
  castDrift: 0.6,
  /** seconds after your last hit landed / taken that you still count as fighting */
  combatSeconds: 5,
  /** seconds after being thrown before you can call the mount again */
  remountSeconds: 3,
  /** speed multiplier limits (A's table is 1.35-1.75) */
  minSpeed: 1, maxSpeed: 2.5,
  /** the highest calm a mount may have: nothing is never thrown */
  maxCalm: 0.8,
  /** room kinds you cannot ride in */
  noRideRooms: Object.freeze(['instance', 'dungeon']),
});

/** Why you may not call a mount right now, or null. `s` = { dead, swimming, fighting, roomKind, now, thrownAt, casting }. */
export function mountRefusal(s = {}) {
  if (s.dead) return 'You are dead.';
  if (s.swimming) return 'Your mount will not swim.';
  if (MOUNT_RULES.noRideRooms.includes(s.roomKind)) return 'There is no room to ride in here.';
  if (s.fighting) return 'Not while you are fighting.';
  if (s.casting) return 'You are busy.';
  if (s.thrownAt != null && s.now != null && s.now - s.thrownAt < MOUNT_RULES.remountSeconds) return 'Your mount is still skittish.';
  return null;
}

/** The speed multiplier while riding this mount (`{ speed }`), clamped. */
export function mountSpeedMul(mount) {
  const v = Number(mount?.speed);
  return Math.max(MOUNT_RULES.minSpeed, Math.min(MOUNT_RULES.maxSpeed, Number.isFinite(v) ? v : 1.4));
}

/** The chance a mount keeps you on when you are hit. */
export const mountCalm = mount => Math.max(0, Math.min(MOUNT_RULES.maxCalm, Number(mount?.calm) || 0));

/**
 * Does this thing take you off your mount? `what` is one of:
 *   'attack' | 'cast' | 'swim' | 'die' | 'dungeon' | 'dismount'   -> always
 *   'hit'  (with `ev` = the protocol hit event, `rng` = the room's seeded 0..1 roller, `mount`) -> a damaging enemy hit, unless calm holds
 *   anything else (a heal, a DoT tick, a miss)                      -> never
 */
export function dismounts(what, { ev = null, mount = null, rng = null } = {}) {
  if (['attack', 'cast', 'swim', 'die', 'dungeon', 'dismount'].includes(what)) return true;
  if (what !== 'hit' || !ev) return false;
  if (ev.kind && ev.kind !== 'dmg') return false;        // a heal, an absorb
  if (!(ev.n > 0)) return false;                         // nothing got through
  if (ev.skill === 'dot' || !ev.s) return false;         // a burn/poison tick (the room sends DoTs from s:0)
  // pass the room's seeded roller (host.random('mount')); without one the roll is a fixed coin (0.5)
  return (rng ? rng() : 0.5) >= mountCalm(mount);
}
