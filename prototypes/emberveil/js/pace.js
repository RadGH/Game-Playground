// Combat speed (round 21, E34). No DOM, no Three.js: main.js and the stage read these numbers, and
// tests/pace.test.js checks them.
//
// The three buttons in the top bar are 1x, 2x and 4x. 4x is how fast fights have always run, so it
// is the default and at 4x every function below returns exactly the timing the game used before.
// 2x takes twice as long and 1x four times as long, so a fight can be followed one turn at a time.
//
// One factor paces everything, instead of a patch per number:
//   paceFactor(speed)  how many times longer a fight beat lasts (4x → 1, 2x → 2, 1x → 4)
//   timeScale(speed)   the inverse, for the stage's frame clock (4x → 1, 2x → 0.5, 1x → 0.25):
//                      every animation, walk-in, thrust, projectile and impact that runs on frame
//                      time slows by it, because the stage multiplies each frame's dt by it
//   paceMs(ms, speed)  a wait that already existed at 4x, stretched (sleep between hits, float text)
//   extraGap(ms, speed) a pause that did not exist at 4x: zero at 4x, `ms` at 2x, 3×`ms` at 1x.
//                      Used for the beats slower speeds need to be readable (between rounds, after a
//                      miss or a heal) without changing today's default pacing by a millisecond.

/** The speeds the top bar offers, slowest first. */
export const SPEEDS = [1, 2, 4];
/** Today's pace. New players and old saves both start here. */
export const DEFAULT_SPEED = 4;

/** Any stored or clicked value → one of SPEEDS. Unknown values fall back to the default. */
export function normalizeSpeed(v) { const n = Number(v); return SPEEDS.includes(n) ? n : DEFAULT_SPEED; }
/** How many times longer each fight beat lasts at this speed. */
export function paceFactor(speed) { return DEFAULT_SPEED / normalizeSpeed(speed); }
/** Multiplier for frame time on the stage. */
export function timeScale(speed) { return 1 / paceFactor(speed); }
/** A wait that existed at 4x, stretched for this speed. */
export function paceMs(ms, speed) { return Math.round((ms || 0) * paceFactor(speed)); }
/** A pause that only slower speeds get. */
export function extraGap(ms, speed) { return Math.round((ms || 0) * (paceFactor(speed) - 1)); }

/**
 * The base timings of a fight, in milliseconds at 4x. main.js reads these instead of bare numbers,
 * so this table is the one place to look when a fight feels too fast or too slow.
 */
export const PACE = {
  afterDamage: 160,      // after a hit lands (existing wait)
  afterSkill: 200,       // after a skill is announced (existing wait)
  afterPhase: 220,       // after a boss changes phase (existing wait)
  attackFlash: 90,       // rune flash before a ranged or magic attack flies (existing wait)
  floatText: 1000,       // how long a damage number floats (existing, matches the CSS animation)
  roundGap: 260,         // extra pause between rounds at slower speeds (0 at 4x)
  eventGap: 140,         // extra pause after a miss, heal, mana, damage-over-time or status line (0 at 4x)
};
/** Event types that get the extra `eventGap` pause at slower speeds. */
export const GAP_EVENTS = ['miss', 'heal', 'mana', 'dot', 'status', 'skip', 'revive', 'taunt', 'down', 'kill'];

/** Plain-words tooltip for each button. */
export const SPEED_TIPS = {
  1: 'Combat speed 1x: the slowest. Every swing, spell and number takes four times as long as 4x, with a pause between rounds, so you can follow a fight turn by turn.',
  2: 'Combat speed 2x: half the speed of 4x. Easier to follow, still moves along.',
  4: 'Combat speed 4x: the original pace. Fights play out quickly.',
};
