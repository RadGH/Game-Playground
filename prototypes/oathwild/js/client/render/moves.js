// How a body MOVES when it fights (owner 2026-11-26: "Sunlance and cleave don't even do an attack animation";
// lessons rule 48: every action has an animation facing its target). Two layers on top of the Tabard / fal clips:
//   1. the clip for the kind of ability (a sword swing for weapon spells, the spell push for bolts and beams, the
//      Spell_Simple_Enter -> Exit wind-up and follow-through for ground and self spells, a point-and-fire for wands);
//   2. a procedural move where the library has no clip: a full-body SPIN (Whirlwind), a crouch-and-SLAM (Ground Slam,
//      novas), an OVERHEAD chop (Earthquake), a forward BASH lunge, a ROAR (chest out, lean back), and every target's
//      reaction to a hit (pushed back ~0.28 m away from the attacker, puffed up to 112% for a moment).
// The procedural part only ever ADDS a change to the body group's position / turn / lean / scale and takes back
// exactly what it added the frame before, so whatever else moves that group (a mounted rider's seat, a knocked-down
// body drawn by actors.js) keeps its own values.
//
//   const M = createMoves(actors)
//   M.play(id, style, { reps, every, speed, clip, spell })   style: swing | overhead | slam | spin | bash | roar | cast |
//     channel | ground | wand | shoot, and the basic-attack moves blade | heavy | quick | thrust | jab (render/swings.js;
//     timed to the sword clip's real stroke at 0.40-0.54 s, measured by tools/measure-swings.mjs). speed: the clip's
//     speed (the move keeps pace); clip: false = the move only (the clip was started already); spell: a spell's swing
//     (render/swings.js leaves it alone — no basic-attack trail on a Cleave).
//   M.react(id, [fromX, fromZ], { strong })     M.update(dt)   (after actors.update)
import { CLIPS } from '../../../../../avatar-3d/tabard/js/tabard.js';

/** The clip each style starts with (Tabard library names, or the actor's own act() kinds). */
export const STYLE_CLIP = {
  swing: 'attack', overhead: 'attack', slam: 'Spell_Simple_Enter', spin: 'attack', bash: 'Punch_Cross', roar: 'Spell_Simple_Enter',
  cast: 'cast', shoot: 'cast', wand: 'Pistol_Shoot', ground: 'Spell_Simple_Enter', channel: 'channel',
  blade: 'attack', heavy: 'attack', quick: 'attack', thrust: 'attack', jab: 'attack',
};
/** Styles that follow their first clip with a second one (wind-up, then the follow-through) after `after` seconds. */
const FOLLOW = { ground: ['Spell_Simple_Exit', 0.32], slam: ['attack', 0.22], roar: ['Spell_Simple_Exit', 0.35] };
/** How long each procedural move lasts (s); 0 = clip only. */
const LENGTH = { swing: 0.42, overhead: 0.6, slam: 0.62, spin: 0.46, bash: 0.4, roar: 0.7, cast: 0.3, shoot: 0.3, wand: 0.25, ground: 0.6, channel: 0,
  blade: 0.75, heavy: 0.9, quick: 0.75, thrust: 0.75, jab: 0.45 };

const ease = k => 1 - (1 - k) ** 3;
const bump = (k, a, b) => (k <= a || k >= b ? 0 : Math.sin(((k - a) / (b - a)) * Math.PI));

/**
 * The procedural offsets of a style at k = 0..1 of its length: { y, lean (forward, radians), turn (radians),
 * fwd (metres forward), squash (scale.y factor), puff (uniform scale factor) }.
 */
export function pose(style, k, rep = 0) {
  const o = { y: 0, lean: 0, turn: 0, fwd: 0, squash: 1, puff: 1 };
  switch (style) {
    case 'swing':      // a step into the swing, a twist of the hips through it
      o.turn = (k < 0.35 ? -0.5 * ease(k / 0.35) : -0.5 + 0.9 * ease(Math.min(1, (k - 0.35) / 0.35))) * (1 - bump(k, 0.75, 1.25));
      o.fwd = 0.22 * bump(k, 0.15, 0.95); o.lean = 0.12 * bump(k, 0.25, 0.9);
      break;
    case 'spin':       // one full turn of the whole body per repeat (Whirlwind), a little hop, blades out
      o.turn = Math.PI * 2 * ease(k) * (rep % 2 ? -1 : 1); o.y = 0.12 * bump(k, 0, 1); o.lean = 0.08;
      break;
    case 'overhead':   // up on the toes, lean back, then chop down hard and crouch into it
      o.y = 0.18 * bump(k, 0, 0.45) - 0.12 * bump(k, 0.45, 1);
      o.lean = k < 0.4 ? -0.22 * ease(k / 0.4) : -0.22 + 0.6 * ease(Math.min(1, (k - 0.4) / 0.18)) - 0.38 * Math.max(0, (k - 0.7) / 0.3);
      o.squash = 1 - 0.1 * bump(k, 0.5, 1);
      break;
    case 'slam':       // crouch and gather, a small jump, then slam both fists into the ground
      o.y = -0.14 * bump(k, 0, 0.3) + 0.32 * bump(k, 0.25, 0.55) - 0.2 * bump(k, 0.55, 1);
      o.lean = -0.15 * bump(k, 0.2, 0.5) + 0.42 * bump(k, 0.5, 1);
      o.squash = 1 - 0.12 * bump(k, 0, 0.3) - 0.14 * bump(k, 0.55, 0.9);
      break;
    case 'bash':       // a lunge forward behind the shield
      o.fwd = 0.55 * bump(k, 0.05, 1); o.lean = 0.25 * bump(k, 0.05, 0.9);
      break;
    case 'roar':       // chest out, lean back, swell
      o.lean = -0.2 * bump(k, 0.05, 1); o.puff = 1 + 0.08 * bump(k, 0.1, 0.9);
      break;
    case 'ground':     // reach up and gather, then push down to the ground
      o.y = 0.06 * bump(k, 0, 0.45); o.lean = -0.08 * bump(k, 0, 0.45) + 0.16 * bump(k, 0.45, 1);
      break;
    // basic attacks: the strike of the sword clip is at k 0.53-0.72 of these lengths (0.40-0.54 s at speed 1)
    case 'blade':      // wind back to the right through the raise, twist hard left through the stroke, step in
      o.turn = k < 0.5 ? -0.35 * ease(k / 0.5) : k < 0.72 ? -0.35 + 0.8 * ease((k - 0.5) / 0.22) : 0.45 * (1 - ease((k - 0.72) / 0.28));
      o.fwd = 0.2 * bump(k, 0.4, 1); o.lean = 0.12 * bump(k, 0.45, 0.95);
      break;
    case 'quick':      // a dagger: the same stroke, smaller, with a dart forward
      o.turn = k < 0.5 ? -0.22 * ease(k / 0.5) : k < 0.72 ? -0.22 + 0.5 * ease((k - 0.5) / 0.22) : 0.28 * (1 - ease((k - 0.72) / 0.28));
      o.fwd = 0.32 * bump(k, 0.4, 0.95); o.lean = 0.14 * bump(k, 0.45, 0.9);
      break;
    case 'heavy':      // two hands: up on the toes leaning back through the raise, then chop down and crouch into it
      o.y = 0.08 * bump(k, 0, 0.46) - 0.1 * bump(k, 0.46, 1);
      o.lean = k < 0.44 ? -0.22 * ease(k / 0.44) : k < 0.6 ? -0.22 + 0.55 * ease((k - 0.44) / 0.16) : 0.33 * (1 - ease((k - 0.6) / 0.4));
      o.turn = k < 0.44 ? -0.25 * ease(k / 0.44) : k < 0.6 ? -0.25 + 0.55 * ease((k - 0.44) / 0.16) : 0.3 * (1 - ease((k - 0.6) / 0.4));
      o.squash = 1 - 0.08 * bump(k, 0.5, 1); o.fwd = 0.18 * bump(k, 0.4, 1);
      break;
    case 'thrust':     // a spear: gather back, then lunge the whole body forward on the stroke
      o.fwd = -0.1 * bump(k, 0, 0.52) + 0.55 * bump(k, 0.5, 1); o.lean = 0.18 * bump(k, 0.5, 0.95);
      o.turn = -0.18 * bump(k, 0, 0.55) + 0.12 * bump(k, 0.55, 1);
      break;
    case 'jab':        // bare hands: a step into the punch, shoulders turning with it
      o.fwd = 0.18 * bump(k, 0.05, 0.8); o.lean = 0.08 * bump(k, 0.1, 0.8); o.turn = 0.22 * bump(k, 0.1, 0.75) * (rep % 2 ? -1 : 1);
      break;
    case 'cast': case 'shoot': case 'wand':   // a small recoil into the push
      o.lean = -0.07 * bump(k, 0.1, 1); o.fwd = -0.05 * bump(k, 0.1, 1);
      break;
    default: break;
  }
  return o;
}

export function createMoves(actors) {
  const live = new Map();          // id -> { style, t, len, reps, every, rep, react: {...} | null, applied }
  const ZERO = { y: 0, lean: 0, turn: 0, fwd: 0, side: 0, scaleY: 1, scale: 1 };
  const st = id => { let s = live.get(id); if (!s) { s = { move: null, react: null, applied: { ...ZERO } }; live.set(id, s); } return s; };
  const groupOf = a => (a?.formBody || a?.body)?.group || null;

  const WEAPONISH = new Set(['attack', 'Punch_Cross']);
  function clip(a, name, spell = false) {
    if (!a) return;
    // a monster / animal body (fal, critter) knows only attack / cast / hit…: the nearest of those
    const tabard = !a.formBody && a.body?.isTabard;
    a.act(tabard ? name : WEAPONISH.has(name) || /Exit/.test(name) ? 'attack' : name === 'channel' ? 'channel' : 'cast', { spell });
    // a long library clip (Sword_Attack is 1.54 s) still lets walking take over after the move's own length
  }

  return {
    /** Start a fighting move on actor `id`. reps/every: repeated moves (a 5-turn Whirlwind). */
    play(id, style, { reps = 1, every = 0.3, speed = 1, clip: withClip = true, spell = false } = {}) {
      const a = actors.get(id); if (!a || a.dead) return;
      if (style === 'leap' || style === 'rush') return;        // the jump / the run: actors.js leap() / lunge()
      if (withClip) clip(a, STYLE_CLIP[style] || 'cast', spell);
      const f = FOLLOW[style];
      if (f && withClip) setTimeout(() => { if (!a.dead) clip(a, f[0], spell); }, f[1] * 1000);
      const len = (LENGTH[style] ?? 0.35) / Math.max(0.25, speed);
      if (len > 0 && !a.mounted) st(id).move = { style, t: 0, len, reps: Math.max(1, reps), every: Math.max(len, every), rep: 0 };
      if (style === 'spin' && reps > 1 && withClip) for (let i = 1; i < reps; i++) setTimeout(() => { if (!a.dead) clip(a, 'attack', spell); }, i * every * 1000);
    },
    /** A body that was hit: pushed away from the attacker for a moment, puffed up a little. */
    react(id, from, { strong = false } = {}) {
      const a = actors.get(id); if (!a || a.dead || !from || a.mounted) return;
      const dx = a.root.position.x - from[0], dz = a.root.position.z - from[1], d = Math.hypot(dx, dz) || 1;
      st(id).react = { t: 0, len: strong ? 0.32 : 0.24, wx: dx / d, wz: dz / d, push: strong ? 0.42 : 0.28, puff: strong ? 0.16 : 0.12 };
    },
    /** Is a move running on this actor (tests; the hero facing logic)? */
    busy: id => !!live.get(id)?.move,
    update(dt) {
      for (const [id, s] of live) {
        const a = actors.get(id), g = groupOf(a);
        const want = { ...ZERO };
        if (s.move) {
          const m = s.move; m.t += dt;
          const total = (m.reps - 1) * m.every + m.len;
          const rep = Math.min(m.reps - 1, Math.floor(m.t / m.every)), local = m.t - rep * m.every;
          if (local <= m.len) {
            const p = pose(m.style, Math.min(1, local / m.len), rep);
            want.y += p.y; want.lean += p.lean; want.turn += p.turn; want.fwd += p.fwd; want.scaleY *= p.squash; want.scale *= p.puff;
          }
          if (m.t >= total) s.move = null;
        }
        if (s.react && a) {
          const r = s.react; r.t += dt;
          const k = Math.min(1, r.t / r.len), out = k < 0.3 ? ease(k / 0.3) : 1 - ease((k - 0.3) / 0.7);
          // world push -> the root's frame (it turns with the body's facing)
          const f = a.root.rotation.y, c = Math.cos(f), sn = Math.sin(f);
          want.side += (r.wx * c - r.wz * sn) * r.push * out;
          want.fwd += (r.wx * sn + r.wz * c) * r.push * out;
          want.scale *= 1 + r.puff * out;
          if (r.t >= r.len) s.react = null;
        }
        if (g) {
          const was = s.applied;
          // take back last frame's change, put on this frame's (others' changes to the group stay)
          g.position.x += want.side - was.side; g.position.z += want.fwd - was.fwd; g.position.y += want.y - was.y;
          g.rotation.y += want.turn - was.turn; g.rotation.x += want.lean - was.lean;
          const sy = (want.scale * want.scaleY) / (was.scale * was.scaleY), sxz = want.scale / was.scale;
          g.scale.set(g.scale.x * sxz, g.scale.y * sy, g.scale.z * sxz);
          s.applied = want;
        }
        if (!s.move && !s.react && (!g || Object.keys(ZERO).every(k => s.applied[k] === ZERO[k]))) live.delete(id);
        else if (!a) live.delete(id);
      }
    },
    clips: CLIPS,
  };
}
