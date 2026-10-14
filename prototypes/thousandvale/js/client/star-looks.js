// What the Starcaller's magic LOOKS like — the decisions, with no drawing in them (wrap-up 2026-10-13, Y32).
// Pure: no three, no DOM. tests/D/wrap-star.test.js walks every skill of the class through this file.
//
// The owner's brief: "throws golden star-like projectiles, summons stars from the sky, and lays AoE zones." The rules
// (stream C, docs/requests.md "Round 10 contracts — C (Starcaller, Y32)") already say all of it on the wire:
//
//   fx { kind:'bolt', skill:'star_dart'|'star_volley', proj:'star', from, to, ms }        a thrown star
//   fx { kind:'skyfall', id, skill, proj:'skystar', to:{x,z}, r, ms, n?, of? }             a star that lands `ms` later
//   fx { kind:'place', obj, skill:'star_field', x, z, r, seconds, follow? }                the Star Field
//   fx { kind:'pool', id:<caster>, pid, x, z, r, seconds, element }                        a talent's lingering ground
//   fx { kind:'orbs', id, count, seconds, element }                                        Wheeling Stars
//   you { res: [{ id:'starlight', n, max }] }                                              the Constellation (owner only)
//
// star-fx.js draws what this file decides. One rule runs through it: gold, never the generic arcane violet.

export const STAR_CLASS = 'starcaller';
export const STAR_SKILLS = Object.freeze(['star_dart', 'star_volley', 'called_star', 'star_field', 'wheeling_stars', 'sky_barrage']);
const SKILL_SET = new Set(STAR_SKILLS);
/** The class's two colours (the class card's own): gold for everything that glows, midnight for cloth. */
export const STAR_GOLD = '#ffc640';
export const STAR_PALE = '#fff3c4';
export const STAR_MIDNIGHT = '#1c1f4a';

export const isStarSkill = id => SKILL_SET.has(String(id || ''));
const isStarClass = cls => cls === STAR_CLASS;
const elementIsArcane = ev => { const e = String(ev?.element ?? ev?.el ?? 'arcane').toLowerCase(); return e === 'arcane' || e === 'magic'; };

/** Is this shot event a thrown STAR? (the rules name the projectile; the skill id is the belt to that pair of braces) */
export function isStarShot(ev = {}) {
  const proj = String(ev.proj || '').toLowerCase();
  return proj === 'star' || ((ev.kind === 'bolt' || ev.kind === 'shot') && (ev.skill === 'star_dart' || ev.skill === 'star_volley'));
}

/** The thrown star's flight: how big it is drawn, how fast it turns, how often it sheds a sparkle. */
export const STAR_SHOT = Object.freeze({ model: 'star', size: 0.46, halo: 1.05, spin: 7.5, trailEvery: 0.028, trailLife: 0.42, burst: 14 });

/**
 * A star falling out of the sky. THE rule: it touches the ground exactly `ev.ms` after the event — the rules deal the
 * damage `ms` after they send it, so `landMs` is `ev.ms` and nothing else (a late or early star is a number with no
 * cause). `skyAt(plan, t)` is where it is at `t` ms; at `t = landMs` that is the target, to the millimetre.
 */
export function skyfallPlan(ev = {}) {
  const landMs = Math.max(0, Number.isFinite(+ev.ms) ? +ev.ms : 0);
  const big = ev.skill === 'called_star' || !(ev.of > 1);
  const r = Math.max(0.8, Math.min(14, +ev.r || 3));
  // a barrage's stars come in from slightly different quarters (by their number), a called star always from the same one
  const n = Math.max(0, (ev.n | 0) - 1);
  const bearing = 0.7 + (big ? 0 : n * 2.39996);
  const height = big ? 30 : 22;
  const lean = big ? 0.32 : 0.24;                              // metres sideways for every metre of height
  return {
    landMs, big, r, height,
    x: +ev.to?.x || 0, z: +ev.to?.z || 0,
    dx: Math.sin(bearing) * height * lean, dz: Math.cos(bearing) * height * lean,
    size: big ? 1.35 : 0.72, tail: big ? 9 : 6,
    burst: big ? 30 : 12, src: ev.id ?? null, skill: ev.skill || null,
  };
}
/** Where a falling star is `t` ms after its event, as offsets from its landing point: { k, ox, oy, oz }. It speeds up. */
export function skyAt(plan, t) {
  const k = plan.landMs > 0 ? Math.max(0, Math.min(1, t / plan.landMs)) : 1;
  const e = 1 - Math.pow(k, 1.7);                              // 1 at the top, 0 on the ground
  return { k, ox: plan.dx * e + 0, oy: plan.height * e + 0, oz: plan.dz * e + 0 };      // (+ 0: never a negative zero)
}

/**
 * Is this ground zone one of the Starcaller's? `place` names its skill; a `pool` (Glitter, Star Crater, Lingering Light)
 * names only its caster, so the caster's class decides (`casterCls` = the look's class, when the client has that body).
 * Returns what to draw — { r, ms, key, src, follow } — or null for anybody else's zone (drawn as it always was).
 */
export function starZone(ev = {}, casterCls = null) {
  if (!ev || ev.end || ev.x == null || ev.z == null) return null;
  const mine = ev.kind === 'place' ? isStarSkill(ev.skill) : (ev.kind === 'pool' || ev.kind === 'zone') ? (isStarSkill(ev.skill) || (isStarClass(casterCls) && elementIsArcane(ev))) : false;
  if (!mine) return null;
  const seconds = ev.ms > 0 ? ev.ms / 1000 : (+ev.seconds || 2);
  return {
    key: ev.obj ?? ev.pid ?? ev.zone ?? (ev.kind === 'zone' ? ev.id : null) ?? null,
    src: ev.kind === 'pool' ? (ev.id ?? null) : (ev.s ?? null),
    x: +ev.x, z: +ev.z, r: Math.max(1, Math.min(16, +ev.r || 3)),
    ms: Math.max(400, Math.min(60000, seconds * 1000)),
    follow: ev.follow ?? null,
    field: ev.kind === 'place',                                // the Star Field itself (a fuller rune than a talent's patch)
  };
}

/** Wheeling Stars: the `orbs` event of a Starcaller. */
export function starOrbs(ev = {}, casterCls = null) {
  if (ev.kind !== 'orbs') return null;
  if (!(isStarSkill(ev.skill) || (isStarClass(casterCls) && elementIsArcane(ev)))) return null;
  return { id: ev.id, count: Math.max(1, Math.min(6, ev.count | 0 || 3)), ms: Math.max(500, Math.min(60000, (+ev.seconds || 12) * 1000)) };
}

/** How many Constellation motes to draw for a resource list / view (`you.res`, or class-res.js's `state`). 0..5. */
export function moteCount(res) {
  const list = Array.isArray(res) ? res : res && typeof res === 'object' ? [res] : [];
  const r = list.find(x => x && x.id === 'starlight');
  return r ? Math.max(0, Math.min(5, Math.round(+r.n || 0))) : 0;
}
/** Starlight only ever falls when it is SPENT (the big skills take all of it): that is the flare. */
export const moteSpent = (before, after) => (before > 0 && after < before ? before - after : 0);
/** Where mote `i` of five rides: an angle (radians) and a small bob, at `time` seconds. Five fixed seats, filled in order. */
export function moteSeat(i, time, full = false) {
  const a = (i / 5) * Math.PI * 2 + time * (full ? 2.6 : 1.5);
  return { a, bob: Math.sin(time * 2.2 + i * 1.3) * 0.045 };
}

/**
 * The class outfit laid over a worn-gear look (gear-look.js `classWear`): a Starcaller's plain cloth pieces are cut in
 * its own midnight and gold. `wear` = data/class-outfits-tv.json `wear[cls]` ({ cloth: { top, hat, bottom, shoes } }).
 * `tierOfSlot(slot)` = the weight of what is worn there ('cloth', 'light' …), null when nothing is. Only cloth changes;
 * a piece with its own model (item.look.worn) and every heavier piece keep what they had. Returns a NEW look.
 */
export function classWearLook(look, wear, tierOfSlot = () => null) {
  if (!wear?.cloth || !look) return look;
  const out = { ...look };
  const PART = { head: 'hat', chest: 'top', legs: 'bottom', feet: 'shoes' };
  for (const [slot, part] of Object.entries(PART)) {
    const w = wear.cloth[part];
    if (!w || tierOfSlot(slot) !== 'cloth') continue;
    const had = out[part] || {};
    // keep what other layers hang on the part (gloves ride on the top; a tier-2 emblem and trim win over ours)
    out[part] = { ...had, ...w, ...(had.gloves ? { gloves: had.gloves } : {}) };
  }
  return out;
}
