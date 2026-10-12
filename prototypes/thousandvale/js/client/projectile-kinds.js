// What a shot LOOKS like (play-test 8, W2 + W14). Pure — no three, no DOM; tests/D/playtest8.test.js walks every case.
//
// "Brigand archers hit at range with NO projectile — you take damage without knowing where from" and "Firebolt should
// be a projectile: it's a bolt." The rules (stream C) now send one event per shot, for players AND monsters:
//
//   fx { kind: 'bolt' | 'arrow' | 'shot' | 'thrown', id: <shooter>, from: {x, z}, to: <entity id> | {x, z}, ms, speed?,
//        element | el, proj?: 'arrow' | 'bolt' | 'orb' | 'thrown' | 'rock', skill?, wt?, home?, cosmetic? }
//
// and the damage lands `ms` later. This file answers the one question the drawing needs: WHICH body flies.
//
//   projectileKind(ev, { held })  -> { model, element, glow, arc, spin, scale, tail }
//
//   model   'arrow' | 'quarrel' | 'javelin' | 'knife' | 'axe' | 'stone' | 'firebolt' | 'orb' | 'shard' | 'spark'
//   glow    true = drawn with the bright (additive) material in the element's colour; false = a solid object
//   arc     how high the path bows, as a share of the distance (an arrow lobs a little, a bolt of magic flies flat)
//   spin    turns per second end over end (a thrown knife tumbles; an arrow does not)
//   tail    a streak behind it, in body lengths (fire trails; a stone has none)

/** Element words the rules use -> the eleven the effects draw. */
const ELEMENT = { fire: 'fire', ice: 'ice', cold: 'ice', frost: 'ice', shadow: 'shadow', void: 'shadow', holy: 'holy', light: 'holy', nature: 'nature', arcane: 'arcane', magic: 'arcane',
  lightning: 'lightning', storm: 'lightning', physical: 'physical', poison: 'poison', bleed: 'bleed', true: 'true' };
export const elementOfShot = e => ELEMENT[String(e || '').toLowerCase()] || null;

/** The colour each element's bolt glows (core, halo). */
export const SHOT_COLOUR = {
  fire: ['#fff0b0', '#ff7a1c'], ice: ['#ffffff', '#7fd4ff'], shadow: ['#e0c8ff', '#7a3ad8'], holy: ['#ffffff', '#ffe08a'], nature: ['#f0ffd0', '#6fd04a'],
  arcane: ['#ffffff', '#b08aff'], lightning: ['#ffffff', '#ffe84a'], poison: ['#f0ffb0', '#8ad02a'], bleed: ['#ffd0d0', '#d02a2a'], true: ['#ffffff', '#e8e8f0'], physical: ['#ffffff', '#d8d8d8'],
};

export const MODELS = ['arrow', 'quarrel', 'javelin', 'knife', 'axe', 'stone', 'firebolt', 'orb', 'shard', 'spark'];
const SOLID = {
  arrow: { glow: false, arc: 0.05, spin: 0, scale: 1, tail: 0 },
  quarrel: { glow: false, arc: 0.02, spin: 0, scale: 1, tail: 0 },
  javelin: { glow: false, arc: 0.07, spin: 0, scale: 1, tail: 0 },
  knife: { glow: false, arc: 0.04, spin: 2.6, scale: 1, tail: 0 },
  axe: { glow: false, arc: 0.07, spin: 1.9, scale: 1, tail: 0 },
  stone: { glow: false, arc: 0.1, spin: 1.3, scale: 1, tail: 0 },
};
const GLOW = {
  firebolt: { glow: true, arc: 0, spin: 0, scale: 1.3, tail: 3.2 },
  orb: { glow: true, arc: 0, spin: 0.6, scale: 1, tail: 1.6 },
  shard: { glow: true, arc: 0, spin: 0, scale: 1, tail: 1.2 },
  spark: { glow: true, arc: 0, spin: 0, scale: 1, tail: 2.4 },
};
const GLOW_BY_ELEMENT = { fire: 'firebolt', ice: 'shard', lightning: 'spark', shadow: 'orb', holy: 'orb', nature: 'orb', arcane: 'orb', poison: 'orb', bleed: 'shard', true: 'orb', physical: 'orb' };

/** What a held model id / weapon type throws or looses. */
function byWeapon(w) {
  const t = String(w || '').toLowerCase();
  if (!t) return null;
  if (/crossbow|arbalest/.test(t)) return 'quarrel';
  if (/bow/.test(t)) return 'arrow';
  if (/javelin|spear|harpoon/.test(t)) return 'javelin';
  if (/axe|hatchet|tomahawk/.test(t)) return 'axe';
  if (/dagger|knife|kris|dirk|shiv|blade/.test(t)) return 'knife';
  if (/sling|rock|stone|boulder/.test(t)) return 'stone';
  return null;
}

/**
 * Which body flies for a shot event. `held` = the model id (or weapon type) in the shooter's hand, when the client knows
 * it (a brigand archer's look holds a bow). Never returns null: an unknown shot is still SEEN.
 */
export function projectileKind(ev = {}, { held = null } = {}) {
  const el = elementOfShot(ev.element ?? ev.el) || (ev.kind === 'bolt' && !ev.wt ? 'arcane' : 'physical');
  const magic = el !== 'physical';
  const proj = String(ev.proj || '').toLowerCase();
  const wt = byWeapon(ev.wt) || byWeapon(ev.weapon);
  const hand = byWeapon(held);
  let model = null;
  // 1. the rules said what it is
  if (proj === 'arrow') model = wt === 'quarrel' || hand === 'quarrel' ? 'quarrel' : wt === 'javelin' ? 'javelin' : 'arrow';
  else if (proj === 'quarrel') model = 'quarrel';
  else if (proj === 'rock' || proj === 'stone') model = 'stone';
  else if (proj === 'thrown' || proj === 'knife' || proj === 'axe' || proj === 'javelin') model = proj !== 'thrown' ? proj : wt && wt !== 'arrow' && wt !== 'quarrel' ? wt : hand && hand !== 'arrow' && hand !== 'quarrel' ? hand : 'knife';
  else if (proj === 'orb') model = magic ? (el === 'fire' ? 'firebolt' : 'orb') : 'orb';
  else if (proj === 'bolt') model = magic ? GLOW_BY_ELEMENT[el] : (wt === 'quarrel' || hand === 'quarrel' ? 'quarrel' : wt || 'orb');     // a crossbow's bolt, or a bolt of magic
  else if (MODELS.includes(proj)) model = proj;
  // 2. it did not: the kind of event and what is in the hand decide
  if (!model) {
    if (ev.kind === 'thrown') model = wt && wt !== 'arrow' ? wt : hand && hand !== 'arrow' && hand !== 'quarrel' ? hand : 'knife';
    else if (magic && (ev.kind === 'bolt' || ev.kind === 'shot')) model = GLOW_BY_ELEMENT[el];
    else if (ev.kind === 'arrow') model = wt || hand || 'arrow';
    else if (ev.kind === 'shot') model = wt || hand || 'stone';        // a monster with nothing in its hand throws a rock
    else model = wt || GLOW_BY_ELEMENT[el] || 'orb';
  }
  const base = SOLID[model] || GLOW[model] || GLOW.orb;
  return { model, element: base.glow && el === 'physical' ? 'arcane' : el, ...base };
}

/** Flight time in ms: the rules' own (`ms`), else from `speed`, else a pace that can be seen. Never under 120 ms. */
export function flightMs(ev = {}, dist = 0, model = 'arrow') {
  if (Number.isFinite(ev.ms) && ev.ms > 0) return Math.max(120, ev.ms);
  const speed = Number.isFinite(ev.speed) && ev.speed > 0 ? ev.speed : (SOLID[model] ? 26 : 20);
  return Math.max(180, dist / speed * 1000);
}

/** Where along its flight (0..1) a body is, and how far above the straight line: a lobbed path that still lands on time. */
export function arcHeight(t, dist, arc) { return arc > 0 ? 4 * arc * Math.min(dist, 40) * t * (1 - t) : 0; }
