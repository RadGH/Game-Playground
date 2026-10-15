// Thousandvale — VHARLEN'S HAZARDS (Expansion 1 §4, items 1–4; stream S). Pure: no DOM, no Node, no clock of its own.
//
// The island has four things no other land has. This file is the RULES of each — the numbers, the timing and the
// "is this body inside it?" geometry — shared by the server (js/sim/hazards.js runs them), the client
// (js/client/vharlen-fx.js draws them on the same clock) and the content tool (tools/content-hazards.mjs places them).
//
//   1. HOT SPRINGS  stand in one, OUT of combat: Steam-soaked — fast health and mana while you stay in. Climb out after
//                   at least SPRING.minSoakS seconds: Steam-warmed, +5% maximum health for 10 minutes.
//   2. GEYSERS      erupt every 15–25 s (each site its own period and phase, fixed by its id), after a 2 s rumble that is
//                   drawn as a telegraph. Standing on one: thrown ~14 m up, then you DRIFT down slowly
//                   (js/sim/movement.js `glide`) — a way up onto a ledge. A monster on one is thrown and takes a little damage.
//   3. LAVA VENTS   lines in the ground that glow; every 9–14 s a telegraph (always shown) and then fire spouts the whole
//                   length. Real damage, scaled to the zone's band; a second, smaller burn for anyone still standing in it.
//   4. ASHFALL      Pumice Wastes and Ashfall Hollow: drifting ash and closer fog (client only, no rule).
//
// TIME. A site's cycle is `cycleOf(id, kind)` -> { period, offset } in ms, from a hash of its id, so every server process
// and every client agrees when a geyser goes up without talking about it. `nextAt(cycle, t)` is the next eruption at or
// after realm time t; the warning runs from `at - warnMs` to `at`.

/** FNV-1a of a string, unsigned. */
export function hashId(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export const SPRING = Object.freeze({
  status: 'steam_soaked', name: 'Steam-soaked',
  healPerSecond: 0.06,        // share of maximum health a second while you sit in it (a status `healPerSecond`, smooth)
  manaPerSecond: 0.06,        // share of maximum mana a second (added once a second by the server)
  holdS: 1.6,                 // the soak status lasts this long and is refreshed every second while you stay in
  minSoakS: 3,                // how long you must soak before climbing out leaves you warmed
  warm: 'item:steamed', warmName: 'Steam-warmed', warmHpPct: 0.05, warmS: 600,
  shore: 14,                  // the crater lake counts as a spring this many metres in from its rim (the warm shallows)
});
export const GEYSER = Object.freeze({
  periodMs: [15000, 25000], warnMs: 2000,
  r: 2.6,                     // the vent's mouth: a body touching this circle is on it
  launchVy: 23.5,             // m/s straight up: ~13.8 m at the top (v² / 2g, g = MOVE.gravity 20)
  monsterHurt: 0.08,          // share of a monster's maximum health; never kills (floor 1)
  tossMs: 1400, tossH: 5,     // how a thrown monster is drawn (client only: up and down again)
  eruptMs: 3200,              // how long the column stands (drawing)
});
/** The slow fall after a geyser throw (js/sim/movement.js reads it; the client predicts with the same numbers). */
export const GLIDE = Object.freeze({ gravity: 0.3, fall: 3.6, air: 1.35 });
export const VENT = Object.freeze({
  periodMs: [9000, 14000], warnMs: 2400, spoutMs: 1400,
  w: 2.4,                     // the fissure's width (the telegraph line)
  hitShare: 0.26,             // of a fresh character's health AT THE ZONE'S BAND TOP (baseHp below) — a quarter of you
  burnShare: 0.4,             // the second burn, as a share of the hit, for a body still inside after burnMs
  burnMs: 700,
  element: 'fire',
});
/** A character's health with its starting kit (measured: js/rules/character.js, every class): 78 + 16 a level. */
export const baseHp = level => 78 + 16 * Math.max(1, level | 0);
/** One vent hit at a zone whose band tops out at `level`. */
export const ventDamage = level => Math.round(baseHp(level) * VENT.hitShare);
export const ventBurn = level => Math.round(ventDamage(level) * VENT.burnShare);
/** A monster thrown by a geyser: 8% of its health, never the last point. */
export const geyserHurt = (hp, maxHp) => Math.max(0, Math.min(Math.max(0, (hp | 0) - 1), Math.round((maxHp || 0) * GEYSER.monsterHurt)));
/** The zones with ashfall weather (world zone ids) — and the look of it (client). */
export const ASHFALL = Object.freeze({ zones: ['z11_10', 'z12_11'], fogK: 0.28, fogNearK: 0.15, color: '#8a837c', mix: 0.65 });

/** A site's cycle: { period, offset } ms, fixed by its id (and kind, so a geyser and a vent of one id differ). */
export function cycleOf(id, kind = 'geyser') {
  const spec = kind === 'vent' ? VENT : GEYSER;
  const h = hashId(kind + ':' + id), [lo, hi] = spec.periodMs;
  const period = lo + (h % (hi - lo + 1));
  const offset = (Math.imul(h ^ 0x9e3779b9, 2654435761) >>> 0) % period;
  return { period, offset };
}
/** The next eruption at or after realm time t (ms) and its index. */
export function nextAt(cycle, t) {
  const k = Math.ceil((t - cycle.offset) / cycle.period);
  return { k, at: cycle.offset + k * cycle.period };
}
/** What a site is doing at t: 'warn' (inside the wind-up), 'erupt' (the first `actMs` after), else 'idle'. */
export function phaseAt(cycle, t, warnMs, actMs) {
  const n = nextAt(cycle, t);
  if (n.at - t <= warnMs && n.at > t) return { phase: 'warn', k: n.k, at: n.at, left: n.at - t };
  const prevAt = n.at === t ? n.at : n.at - cycle.period;
  if (t - prevAt < actMs) return { phase: 'erupt', k: n.at === t ? n.k : n.k - 1, at: prevAt, left: actMs - (t - prevAt) };
  return { phase: 'idle', k: n.k, at: n.at, left: n.at - warnMs - t };
}

/** Is a body (radius br) standing in this spring? A pool: within its radius; the crater lake: in its warm shallows. */
export function inSpring(s, x, z, br = 0) {
  const d = Math.hypot(x - s.x, z - s.z);
  if (s.kind === 'crater_lake') return d <= s.r + br && d >= s.r - (s.shore ?? SPRING.shore);
  return d <= s.r + br;
}
/** On a geyser's mouth? */
export const onGeyser = (g, x, z, br = 0.45) => Math.hypot(x - g.x, z - g.z) <= (g.r ?? GEYSER.r) + br;
/** The telegraph (js/rules/telegraph.js shape) a vent fills: a line from a to b, VENT.w wide. */
export function ventShape(v) {
  const dx = v.bx - v.ax, dz = v.bz - v.az;
  return { shape: 'line', x: v.ax, z: v.az, yaw: Math.atan2(dx, dz), len: Math.hypot(dx, dz), w: v.w ?? VENT.w };
}
/** Is a body inside a vent's line? (the same test as telegraph.js `inside` for a line) */
export function inVent(v, x, z, br = 0.45) {
  const t = ventShape(v), fx = Math.sin(t.yaw), fz = Math.cos(t.yaw), dx = x - t.x, dz = z - t.z;
  const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
  return along >= -br && along <= t.len + br && across <= t.w / 2 + br;
}
/** Nearest distance from (x, z) to a vent's centre line. */
export function ventDist(v, x, z) {
  const dx = v.bx - v.ax, dz = v.bz - v.az, L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - v.ax) * dx + (z - v.az) * dz) / L2));
  return Math.hypot(v.ax + dx * t - x, v.az + dz * t - z);
}

/**
 * What the server does to one body (the rules' side of it — js/rules/index.js `hazard(e, op)` runs this inside the room):
 *   { kind: 'soak' }                       a second in a hot spring: Steam-soaked refreshed (smooth healing) + a second of mana
 *   { kind: 'warm' }                       out of the spring after a proper soak: Steam-warmed (+5% max health, 10 min)
 *   { kind: 'hit', amount, element, floor } hazard damage (a vent's fire, a geyser's scald on a monster); `floor` = never below it
 * `emit(ev)` = the field's emit (hits, statuses). Returns { amount, dead } for a hit, { ok } otherwise.
 */
export function applyHazard(u, op, emit = () => {}) {
  if (!u || u.dead || u.dying != null || !(u.hp > 0)) return null;
  u.statuses ||= {};
  if (op.kind === 'soak') {
    const had = !!u.statuses[SPRING.status];
    u.statuses[SPRING.status] = { type: SPRING.status, kind: 'buff', name: SPRING.name, remaining: SPRING.holdS, power: 1, healPerSecond: SPRING.healPerSecond, hazard: true };
    if (u.maxMp > 0) u.mp = Math.min(u.maxMp, (u.mp || 0) + u.maxMp * SPRING.manaPerSecond);
    if (!had) emit({ t: 'fx', kind: 'status', id: u.id, status: SPRING.status, on: true });
    return { ok: true, fresh: !had };
  }
  if (op.kind === 'warm') { const fresh = warmStatus(u, op.seconds ?? SPRING.warmS); emit({ t: 'fx', kind: 'status', id: u.id, status: SPRING.warm, on: true }); return { ok: true, fresh }; }
  if (op.kind === 'hit') {
    let n = Math.max(0, Math.round(op.amount || 0));
    const floor = Math.max(0, op.floor || 0);
    const soak = Math.min(Math.max(0, u.barrier || 0), n);
    if (soak) { u.barrier -= soak; n -= soak; }
    const before = u.hp;
    u.hp = Math.max(floor, u.hp - n);
    const dealt = Math.round(before - u.hp), dead = u.hp <= 0;
    emit({ t: 'hit', src: null, dst: u.id, amt: dealt, crit: false, kind: op.skill || 'hazard', element: op.element || 'physical', dodged: false, blocked: 0, absorbed: soak, over: dead ? Math.max(0, n - before) : 0, hp: Math.max(0, Math.round(u.hp)), dead });
    // a player the fire kills dies like any other death (index.js syncOut turns `dead` into the room's `die`)
    if (dead && u.kind === 'player') { u.dead = true; emit({ t: 'death', id: u.id, by: null }); }
    return { amount: dealt, dead };
  }
  return null;
}
/** Put Steam-warmed on a unit (an item-style buff: buffs.js itemBuffs reads `itemBuff`, the sheet re-derives health). */
export function warmStatus(u, seconds = SPRING.warmS) {
  u.statuses ||= {};
  const had = u.statuses[SPRING.warm];
  u.statuses[SPRING.warm] = { type: SPRING.warm, kind: 'buff', name: SPRING.warmName, remaining: Math.max(seconds, had?.remaining || 0), power: 1, itemBuff: { stat: 'hpPct', amount: SPRING.warmHpPct, source: 'spring' } };
  return !had;
}
