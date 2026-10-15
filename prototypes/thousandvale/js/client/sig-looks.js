// What every class's SIGNATURE magic looks like (2026-10-14, owner: "design new enhanced spell effect graphics for all
// spells. Give at least one distinct effect to each character, if not every spell"). Pure: no three, no DOM —
// tests/D/sig-looks.test.js walks all 180 skills of the 30 classes through it. sig-fx.js draws what this decides.
//
// The generic effects (spells.js → avatar-3d SpellFx) still draw the element: a fire bolt is fire whoever throws it.
// This layer goes ON TOP and says WHO threw it: each class has its own three shapes (Codex-drawn white sprites,
// icons/data/game/fx-motifs.js — a projectile head, an impact shard, a ground glyph), its own three colours, and its own
// way of moving (a bard's notes bob up on a wave, a tinker's cogs tumble and bounce, a chronomancer's sigil ticks round
// like a clock hand, a stormcaller's sparks zigzag). Every skill then varies that within the class by its own shape and a
// stable hash of its id, so no two of a class's six skills draw the same.
//
//   sigLook(cls, skillId, sk) -> { cls, palette, motif: {head, shard, glyph}, style, cast, travel, impact, ground } | null
//
// The Starcaller is not here: it has its own whole effect set (star-looks.js / star-fx.js). Its partner the Star Blade
// (play-test 11) IS here: star-steel shapes and the gold accent, from icons/data/game/fx-motifs.js like every class.

import { CLASS_MOTIFS, classPalette } from '../../../../icons/js/motifs.js';
import { hashId } from './spell-looks.js';

/**
 * How each class's magic MOVES. Fields (all optional; DEFAULT fills the rest):
 *   head    the thrown head: spin (rad/s), wobble 'none'|'sine'|'zigzag'|'spiral'|'tumble', size (m), trail (sprites/s), arc (m of lift)
 *   trail   what the head sheds: drift [x,y,z] m/s, gravity, life (s), shard ('head'|'shard')
 *   burst   on impact: n, speed, up, gravity, life, ring (a flat ring of shards spreading on the ground)
 *   glyph   the ground sigil: spin (rad/s), tick (snap the spin to steps — a clock hand), orbit (shapes circling it), rise (motes/s)
 *   cast    what blooms round the caster: 'rise' | 'spiral' | 'orbit' | 'fall' | 'flare' | 'ring'
 */
const DEFAULT = {
  head: { spin: 4, wobble: 'none', size: 0.62, trail: 26, arc: 0.6 },
  trail: { drift: [0, 0.4, 0], gravity: 0, life: 0.45, shard: 'shard' },
  burst: { n: 12, speed: 4.5, up: 1.5, gravity: 2, life: 0.6, ring: false },
  glyph: { spin: 0.8, tick: 0, orbit: 4, rise: 10 },
  cast: 'rise',
};
export const CLASS_STYLE = Object.freeze({
  warrior:      { head: { spin: 9, wobble: 'tumble', size: 0.7 }, trail: { drift: [0, 0, 0], gravity: 3, life: 0.3 }, burst: { n: 16, speed: 6.5, up: 3, gravity: 14, life: 0.55, ring: true }, glyph: { spin: 0.3, orbit: 0, rise: 4 }, cast: 'flare' },
  fighter:      { head: { spin: 14, size: 0.55, trail: 34 }, trail: { drift: [0, 0, 0], life: 0.22 }, burst: { n: 10, speed: 8, up: 0.5, gravity: 0, life: 0.35 }, glyph: { spin: 2.2, orbit: 2, rise: 6 }, cast: 'flare' },
  paladin:      { head: { spin: 6, size: 0.8, trail: 20 }, trail: { drift: [0, 1.2, 0], life: 0.6 }, burst: { n: 14, speed: 3.5, up: 4, gravity: -1, life: 0.8, ring: true }, glyph: { spin: 0.4, orbit: 6, rise: 18 }, cast: 'fall' },
  ranger:       { head: { spin: 0, size: 0.5, trail: 30, arc: 1.2 }, trail: { drift: [0, -0.3, 0], gravity: 1.5, life: 0.7 }, burst: { n: 9, speed: 3, up: 2.5, gravity: 4, life: 0.9 }, glyph: { spin: 0.5, orbit: 5, rise: 6 }, cast: 'spiral' },
  rogue:        { head: { spin: 16, size: 0.48, trail: 22 }, trail: { drift: [0, 0.2, 0], life: 0.55 }, burst: { n: 8, speed: 2.5, up: 0.8, gravity: 1, life: 1.0 }, glyph: { spin: -1.2, orbit: 3, rise: 4 }, cast: 'ring' },
  cleric:       { head: { spin: 1.5, size: 0.75, trail: 18 }, trail: { drift: [0, 1.5, 0], life: 0.7 }, burst: { n: 12, speed: 2.5, up: 3.5, gravity: -1.5, life: 0.9, ring: true }, glyph: { spin: 0.35, orbit: 8, rise: 22 }, cast: 'fall' },
  bard:         { head: { spin: 2, wobble: 'sine', size: 0.6, trail: 16 }, trail: { drift: [0, 1.4, 0], life: 1.0, shard: 'shard' }, burst: { n: 10, speed: 2.2, up: 3, gravity: -1.2, life: 1.2 }, glyph: { spin: 0.9, orbit: 6, rise: 14 }, cast: 'orbit' },
  mage:         { head: { spin: 3, size: 0.65, trail: 28 }, trail: { drift: [0, -0.6, 0], gravity: 2, life: 0.6 }, burst: { n: 14, speed: 5, up: 1.5, gravity: 9, life: 0.8, ring: true }, glyph: { spin: 0.25, orbit: 6, rise: 0 }, cast: 'fall' },
  necromancer:  { head: { spin: 1, wobble: 'sine', size: 0.7, trail: 22 }, trail: { drift: [0, 0.9, 0], life: 0.9 }, burst: { n: 10, speed: 2, up: 2.4, gravity: -0.6, life: 1.1 }, glyph: { spin: -0.5, orbit: 5, rise: 16 }, cast: 'rise' },
  warlock:      { head: { spin: -2, wobble: 'spiral', size: 0.7, trail: 24 }, trail: { drift: [0, 0.3, 0], life: 0.8 }, burst: { n: 12, speed: 3.5, up: 1, gravity: -0.4, life: 0.9 }, glyph: { spin: -0.9, orbit: 4, rise: 10 }, cast: 'spiral' },
  demon_hunter: { head: { spin: 0, size: 0.6, trail: 30 }, trail: { drift: [0, 0, 0], gravity: 0, life: 0.35 }, burst: { n: 12, speed: 6, up: 1, gravity: 6, life: 0.5 }, glyph: { spin: 1.6, orbit: 3, rise: 6 }, cast: 'ring' },
  scavenger:    { head: { spin: 12, wobble: 'tumble', size: 0.6, trail: 12, arc: 1.6 }, trail: { drift: [0, 0, 0], gravity: 9, life: 0.6 }, burst: { n: 14, speed: 5.5, up: 4, gravity: 16, life: 0.9 }, glyph: { spin: 0.6, orbit: 4, rise: 0 }, cast: 'flare' },
  swashbuckler: { head: { spin: 18, wobble: 'sine', size: 0.55, trail: 26 }, trail: { drift: [0, 0.6, 0], life: 0.4 }, burst: { n: 10, speed: 7, up: 1.5, gravity: 2, life: 0.45 }, glyph: { spin: 2.6, orbit: 3, rise: 5 }, cast: 'orbit' },
  dragon_knight:{ head: { spin: 0, wobble: 'sine', size: 0.85, trail: 34 }, trail: { drift: [0, 1.6, 0], life: 0.55 }, burst: { n: 16, speed: 4.5, up: 3, gravity: 1, life: 0.7, ring: true }, glyph: { spin: 0.7, orbit: 5, rise: 18 }, cast: 'flare' },
  pyromancer:   { head: { spin: 5, wobble: 'spiral', size: 0.75, trail: 40 }, trail: { drift: [0, 2.0, 0], life: 0.5 }, burst: { n: 18, speed: 4, up: 4, gravity: -1, life: 0.6 }, glyph: { spin: 1.2, orbit: 4, rise: 26 }, cast: 'spiral' },
  stormcaller:  { head: { spin: 0, wobble: 'zigzag', size: 0.65, trail: 36 }, trail: { drift: [0, 0, 0], life: 0.18 }, burst: { n: 14, speed: 9, up: 1, gravity: 0, life: 0.3 }, glyph: { spin: 3.2, orbit: 3, rise: 8 }, cast: 'fall' },
  druid:        { head: { spin: 2.5, wobble: 'spiral', size: 0.65, trail: 22 }, trail: { drift: [0, 0.5, 0], gravity: 0.8, life: 1.1 }, burst: { n: 12, speed: 2.8, up: 2.5, gravity: 1.8, life: 1.3 }, glyph: { spin: 0.45, orbit: 8, rise: 10 }, cast: 'spiral' },
  oracle:       { head: { spin: 0.5, size: 0.7, trail: 20 }, trail: { drift: [0, 0.4, 0], life: 0.9 }, burst: { n: 10, speed: 2, up: 1.5, gravity: 0, life: 1.0, ring: true }, glyph: { spin: 0.3, orbit: 7, rise: 8 }, cast: 'orbit' },
  tactician:    { head: { spin: 0, size: 0.6, trail: 20 }, trail: { drift: [0, 0, 0], life: 0.4 }, burst: { n: 8, speed: 4, up: 0.5, gravity: 0, life: 0.6, ring: true }, glyph: { spin: 0, tick: 4, orbit: 4, rise: 4 }, cast: 'ring' },
  chronomancer: { head: { spin: 6, size: 0.65, trail: 22 }, trail: { drift: [0, 0, 0], life: 1.0 }, burst: { n: 12, speed: 1.8, up: 0.6, gravity: 0, life: 1.2, ring: true }, glyph: { spin: 1.2, tick: 12, orbit: 4, rise: 0 }, cast: 'orbit' },
  monk:         { head: { spin: 0, size: 0.75, trail: 14 }, trail: { drift: [0, 0.2, 0], life: 0.5 }, burst: { n: 10, speed: 5, up: 0.2, gravity: 0, life: 0.45, ring: true }, glyph: { spin: 0.2, orbit: 0, rise: 6 }, cast: 'ring' },
  shaman:       { head: { spin: 0, wobble: 'sine', size: 0.75, trail: 20 }, trail: { drift: [0, 0.8, 0], gravity: 0.4, life: 1.0 }, burst: { n: 10, speed: 2.6, up: 2.8, gravity: 0.6, life: 1.2 }, glyph: { spin: 0.5, orbit: 4, rise: 12 }, cast: 'rise' },
  witch_hunter: { head: { spin: 0, size: 0.6, trail: 28 }, trail: { drift: [0, -0.2, 0], life: 0.4 }, burst: { n: 12, speed: 5.5, up: 1.2, gravity: 4, life: 0.5 }, glyph: { spin: -0.6, orbit: 4, rise: 6 }, cast: 'ring' },
  knight:       { head: { spin: 3, size: 0.75, trail: 14 }, trail: { drift: [0, 0.3, 0], life: 0.5 }, burst: { n: 12, speed: 4, up: 2, gravity: 8, life: 0.6, ring: true }, glyph: { spin: 0.25, orbit: 4, rise: 6 }, cast: 'flare' },
  sorcerer:     { head: { spin: 7, wobble: 'zigzag', size: 0.72, trail: 34 }, trail: { drift: [0, 0.5, 0], life: 0.5 }, burst: { n: 18, speed: 6, up: 2, gravity: 0, life: 0.55 }, glyph: { spin: -2.2, orbit: 6, rise: 14 }, cast: 'spiral' },
  runesmith:    { head: { spin: 2, size: 0.7, trail: 16 }, trail: { drift: [0, 0.6, 0], gravity: 0, life: 0.7 }, burst: { n: 14, speed: 5, up: 3, gravity: 10, life: 0.6 }, glyph: { spin: 0.4, tick: 6, orbit: 6, rise: 8 }, cast: 'fall' },
  shadow_dancer:{ head: { spin: -14, wobble: 'sine', size: 0.6, trail: 30 }, trail: { drift: [0, 0.3, 0], life: 0.65 }, burst: { n: 12, speed: 3.5, up: 0.6, gravity: -0.3, life: 0.8 }, glyph: { spin: -1.8, orbit: 5, rise: 6 }, cast: 'spiral' },
  tinker:       { head: { spin: 10, wobble: 'tumble', size: 0.6, trail: 14, arc: 1.4 }, trail: { drift: [0, 0, 0], gravity: 6, life: 0.7 }, burst: { n: 14, speed: 4.5, up: 4.5, gravity: 14, life: 1.0 }, glyph: { spin: 1.4, orbit: 5, rise: 0 }, cast: 'orbit' },
  priest:       { head: { spin: 1.2, wobble: 'sine', size: 0.7, trail: 20 }, trail: { drift: [0, 1.0, 0], life: 0.8 }, burst: { n: 12, speed: 2.6, up: 2, gravity: -0.8, life: 1.0, ring: true }, glyph: { spin: 0.5, orbit: 6, rise: 14 }, cast: 'fall' },
  enchanter:    { head: { spin: 1, wobble: 'sine', size: 0.62, trail: 24 }, trail: { drift: [0, 0.7, 0], gravity: -0.2, life: 1.2 }, burst: { n: 14, speed: 2.4, up: 2, gravity: -0.5, life: 1.3 }, glyph: { spin: 0.6, orbit: 8, rise: 16 }, cast: 'orbit' },
  // play-test 11 (owner #53): the Star Blade — star steel that sweeps and snaps: a straight fast point, shards that ring
  // out flat and drop, a sworn-star sigil that turns slowly with its studs circling it, stars drawn IN round the caster
  starblade:    { head: { spin: 0, size: 0.78, trail: 30 }, trail: { drift: [0, 0.5, 0], gravity: 0.5, life: 0.4 }, burst: { n: 15, speed: 5.5, up: 1.6, gravity: 5, life: 0.55, ring: true }, glyph: { spin: 0.5, orbit: 4, rise: 12 }, cast: 'orbit' },
});

/** Shapes a skill can have -> which parts of the signature it draws. */
const PARTS = {
  bolt:   { travel: 'head', impact: true, ground: null },
  beam:   { travel: 'stream', impact: true, ground: null },
  ground: { travel: null, impact: true, ground: 'aim' },
  around: { travel: null, impact: true, ground: 'self', ring: true },
  melee:  { travel: 'arc', impact: true, ground: null },
  dash:   { travel: 'path', impact: false, ground: 'self' },
  self:   { travel: null, impact: false, ground: 'self', cast: true },
  summon: { travel: null, impact: false, ground: 'front', cast: true },
};
const FALLBACK_PALETTE = { core: '#ffffff', glow: '#c8b8ff', accent: '#7fd0ff' };
const merge = (a, b) => ({ ...a, ...(b || {}) });

/**
 * The signature for one skill of one class. Null for a class with no motifs (the Starcaller, a monster) — the generic
 * effects alone draw it. Pure; same input, same answer.
 */
export function sigLook(cls, skillId, sk = {}) {
  const motifs = CLASS_MOTIFS[cls];
  if (!motifs || !motifs[0]) return null;
  const S = CLASS_STYLE[cls] || {};
  const style = { head: merge(DEFAULT.head, S.head), trail: merge(DEFAULT.trail, S.trail), burst: merge(DEFAULT.burst, S.burst), glyph: merge(DEFAULT.glyph, S.glyph), cast: S.cast || DEFAULT.cast };
  const h = hashId(cls + ':' + skillId);
  const vary = (salt, lo, hi) => lo + (((h >>> salt) & 255) / 255) * (hi - lo);
  const shape = PARTS[sk.shape] ? sk.shape : sk.shape === 'heal' || sk.shape === 'buff' || sk.shape === 'aura' || sk.shape === 'form' ? 'self' : 'bolt';
  const P = PARTS[shape];
  const [head, shard, glyph] = motifs;
  // within a class, a skill turns the other way, swaps which shape it throws, and is a little bigger or smaller
  const dir = (h & 1) ? 1 : -1;
  const swap = ((h >>> 1) & 3) === 0;                       // one skill in four throws its SHARD shape and sheds heads
  const size = +vary(2, 0.85, 1.25).toFixed(2);
  const r = Math.max(1.2, Math.min(12, +(sk.radius || sk.reach || sk.width || (shape === 'self' || shape === 'summon' ? 1.6 : 3))));
  const pal = classPalette(cls) || FALLBACK_PALETTE;
  const look = {
    cls, id: skillId, shape,
    palette: { core: pal.core, glow: pal.glow, accent: pal.accent },
    motif: { head: swap ? shard : head, shard: swap ? head : shard, glyph },
    style,
    size, dir,
    cast: P.cast || shape === 'ground' || shape === 'summon' ? { kind: style.cast, n: Math.round(vary(5, 8, 16)) } : null,
    travel: P.travel ? { kind: P.travel, size: +(style.head.size * size).toFixed(3), count: Math.max(1, Math.min(5, sk.projectiles || sk.count || 1)) } : null,
    impact: P.impact ? { n: Math.round(style.burst.n * vary(9, 0.8, 1.3)), ring: style.burst.ring || !!P.ring } : null,
    ground: P.ground ? { at: P.ground, r: +(P.ground === 'aim' ? r : Math.min(r, 4)).toFixed(2), spin: +(style.glyph.spin * dir * vary(13, 0.8, 1.4)).toFixed(3), tick: style.glyph.tick, orbit: style.glyph.orbit ? Math.max(2, style.glyph.orbit + (((h >>> 17) % 3) - 1)) : 0, ring: !!P.ring } : null,
  };
  return look;
}

/** Ids of the classes that have a signature (for tests and the gallery). */
export const SIG_CLASSES = Object.freeze(Object.keys(CLASS_STYLE));
