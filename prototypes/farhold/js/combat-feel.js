// Farhold — what a hit FEELS like, and the one place that decides it.
//
// Round 14. Before this, a swing was resolved on the frame the button went down and nothing moved:
// a number appeared over an enemy that was still walking toward you at the same speed. Greps for
// `shake`, `hitstop`, `knockback` and `recoil` across the whole playground came back with nothing
// but unrelated comments. Six things make a hit feel like a hit, and five of them did not exist:
//
//   hit-stop   the world holds still for 35-150 ms, by strike shape
//   shake      the camera is knocked about 4-32 mm, biased the way the blow went
//   knockback   the thing you hit travels, over 0.18 s, with rank resistance
//   stagger     it cannot act, with diminishing returns so a maul cannot lock a boss
//   recoil      its body is nudged 8 cm and eases back — the cheap half of all of it
//   weight      a wind-up you are committed to (that part lives in js/player.js)
//
// EVERYTHING IS OPTIONAL AND NOTHING HERE THROWS. Hit-stop and shake are both a Settings toggle,
// and with both off this module is a no-op that still books knockback and stagger, because those
// are rules rather than presentation.
//
//   import { feel } from './combat-feel.js';
//   feel.advance(dt);                      // once a frame, from the controller, with the REAL dt
//   const dt2 = dt * feel.scale;           // what every simulated system should tick on
//   feel.hit({ strike, crit, killed, fromX, fromZ, toX, toZ });
//   feel.cameraOffset(out);                // [x, y, z] metres to add to the camera
//
// Pure arithmetic — no DOM, no Three.js — so the node tests drive the real thing.

/**
 * R19 — THESE ARE DEFAULTS NOW, NOT THE TRUTH. `tuneFeel()` at the bottom is where the truth
 * arrives, out of `data/balance.json` `player.combat`, which has carried every one of these since
 * round 14 with no reader — under different names, and `hitStopMaxMs` in MILLISECONDS where this
 * holds seconds. They agree today, so nothing is broken; the breakage is scheduled for whenever
 * someone edits the file and the game does not move. `let`, not `const`, for that reason alone.
 */
/** How long a hit-stop may ever last, whatever the multipliers say. */
let MAX_HITSTOP = 0.26;
/** Metres of camera shake per point of a strike's `shake`, and the ceiling. */
let SHAKE_PER_POINT = 0.035;
let MAX_SHAKE = 0.12;
/** Shake decays to nothing over this long, wobbling at this many cycles a second. */
const SHAKE_SECONDS = 0.18;
const SHAKE_HZ = 38;
/** How long the world takes to come back up to speed after a hit-stop. */
const RAMP = 0.04;
/** How slow the world runs at the bottom of a hit-stop. Not zero — a frozen frame reads as a crash. */
let FLOOR = 0.05;

/**
 * A stagger on the same body inside this many seconds is worth progressively less.
 *
 * Read through `staggerWindow()` rather than the binding, because `tuneFeel` may move it and an
 * importer that took the number at module load would keep the old one forever.
 */
export let STAGGER_WINDOW = 6;
export const staggerWindow = () => STAGGER_WINDOW;
export const STAGGER_FALLOFF = [1, 0.6, 0.3, 0];

/** Knockback resistance by rank. Something that hovers has nothing to brace against. */
export const PUSH_RESIST = { normal: 1, champion: 0.7, rare: 0.5, boss: 0.25 };

export function createFeel() {
  let stopLeft = 0;          // seconds of hold-still remaining
  let shake = 0;             // current amplitude in metres
  let shakeAge = 0;
  let shakeDirX = 0, shakeDirZ = 0;
  let phase = 0;
  let enabled = { hitStop: true, screenShake: true };
  const out = [0, 0, 0];

  /**
   * The current strike, published for everything that draws it.
   *
   * `js/main.js` is not ours to edit this round, and the one place that knows which shape is being
   * swung is inside its `swingWith`. `js/weapons.js` `withArea` is called there, once, on the frame
   * the swing happens — so it posts the shape here and `combat-fx.js`, `actors.js` and the clip
   * chooser all read the same record rather than each guessing. One writer, several readers.
   */
  const swing = {
    strike: null, hand: 'main', weapon: null, element: 'physical', at: 0,
    /** What the last shot was loosed at, so the arrow can carry its draw to where it lands. */
    shotPower: 1,
    /** Set while an arrow is landing, so the shot carries the draw it was loosed at. */
    shot: null,
    /**
     * R17 — THE STAFF CHARGE, and the field that was read by one function and written by none.
     *
     * `js/weapons.js` `withArea` has read `feel.swing.charge` since round 15 and nothing anywhere
     * ever assigned it, so every charged staff cast in the game came out at 1.0x power and 1.0x
     * radius and the six `CHARGED_FORMS` never fired. It is declared here now — an undeclared
     * property on a shared channel is an invitation to exactly that bug — and `chargeAt()` is its
     * one writer. `{ fill, power, radius, ready, tap, mana }`, or null once a swing has spent it.
     */
    charge: null,
    /**
     * R17 — WHICH CLIP THE BODY SHOULD BE PLAYING, widened past the swing.
     *
     * js/player.js writes this on every swing and js/actors.js substitutes it for `'attack'` on the
     * player's body. js/tools.js now writes it too, for the gather animations, because a pick swing
     * is the same question ("what is this body doing right now") asked about a different verb.
     */
    clip: null,
  };

  return {
    /** Settings, read once at start-up and again whenever the panel changes them. */
    setEnabled(next = {}) { enabled = { ...enabled, ...next }; },
    get enabled() { return { ...enabled }; },

    /** The factor every SIMULATED system should multiply its dt by. Never the camera or the mouse. */
    get scale() {
      if (stopLeft <= 0) return 1;
      // the last RAMP seconds of the stop are a cubic ease back up to full speed
      const left = stopLeft;
      if (left > RAMP) return FLOOR;
      const k = 1 - left / RAMP;
      return FLOOR + (1 - FLOOR) * k * k * k;
    },
    get frozen() { return stopLeft > 0; },
    /** Seconds of hold-still left. Exposed so a test can read the clock rather than infer it. */
    get stopLeft() { return stopLeft; },
    get shakeAmount() { return shake; },

    /**
     * Once a frame, with the REAL dt. Called from the controller, which `main.js` ticks every
     * frame whether the game is frozen or not.
     */
    advance(dt) {
      if (!(dt > 0)) return;
      if (stopLeft > 0) stopLeft = Math.max(0, stopLeft - dt);
      if (shake > 0) {
        // the amplitude is held and the AGE does the decay, in cameraOffset — so a second knock
        // part way through the first one simply resets the age rather than adding to it
        shakeAge += dt;
        phase += dt * SHAKE_HZ;
        if (shakeAge >= SHAKE_SECONDS) { shake = 0; shakeAge = 0; }
      }
    },

    /**
     * A connecting hit. `strike` is a shape out of `STRIKES`; everything else is optional.
     *
     * A critical is worth 1.6x the hold and a killing blow 2.2x, because the moment a thing dies is
     * the moment worth stopping for. Only one hit-stop is ever live: a new one replaces the old one
     * only if it is longer, so a pack of six does not add up to a second of frozen screen.
     */
    hit({ strike = null, crit = false, killed = false, fromX = 0, fromZ = 0, toX = 0, toZ = 0 } = {}) {
      if (!strike) return;
      const mult = killed ? 2.2 : crit ? 1.6 : 1;
      if (enabled.hitStop) {
        const want = Math.min(MAX_HITSTOP, ((strike.hitstop || 0) / 1000) * mult);
        if (want > stopLeft) stopLeft = want;
      }
      if (enabled.screenShake) {
        const want = Math.min(MAX_SHAKE, (strike.shake || 0) * SHAKE_PER_POINT * (crit ? 1.5 : 1));
        if (want > shake * Math.max(0, 1 - shakeAge / SHAKE_SECONDS)) {
          shake = want; shakeAge = 0;
          const dx = toX - fromX, dz = toZ - fromZ;
          const len = Math.hypot(dx, dz) || 1;
          shakeDirX = dx / len; shakeDirZ = dz / len;
        }
      }
    },

    /** A shove with no strike behind it — a dome popping, a wall going up. */
    jolt(amount = 0.2, seconds = 0) {
      if (enabled.screenShake) { shake = Math.min(MAX_SHAKE, amount); shakeAge = 0; }
      if (enabled.hitStop && seconds > 0 && seconds > stopLeft) stopLeft = Math.min(MAX_HITSTOP, seconds);
    },

    /**
     * Where the camera should sit this frame, in metres, relative to where it wants to be.
     *
     * POSITION ONLY, never rotation: turning the camera moves the crosshair and ruins the shot you
     * were lining up. Two out-of-phase sine pairs rather than `Math.random()`, because random reads
     * as television static and a real knock has a direction — 70% of it goes the way the blow went.
     */
    cameraOffset(target = out) {
      const k = shake > 0 ? Math.max(0, 1 - shakeAge / SHAKE_SECONDS) : 0;
      if (k <= 0) { target[0] = target[1] = target[2] = 0; return target; }
      const a = shake * k;
      const s1 = Math.sin(phase * 6.283), s2 = Math.sin(phase * 4.1 + 1.7), s3 = Math.sin(phase * 8.9 + 0.6);
      target[0] = a * (shakeDirX * 0.7 * s1 + 0.3 * s2);
      target[1] = a * 0.45 * s3;
      target[2] = a * (shakeDirZ * 0.7 * s1 + 0.3 * s2);
      return target;
    },

    /** The swing channel — see the comment on `swing` above. */
    swing,

    /**
     * R17 — WHERE THE PLAYER'S BODY IS, once a frame.
     *
     * Two round-17 pieces need it and neither can reach it: the growing effect at the hands while a
     * staff charges (js/combat-fx.js `channel`), and the pick-swing animation while a gather bar
     * fills (js/tools.js). Both are drawn by modules that are handed a `dt` and nothing else.
     *
     * `js/tools.js` `gathering.tick(dt, control)` is the one call js/main.js makes every single
     * frame into a file that is ours this round, and the controller it passes is the body — so that
     * is where this is written, and it is written for everybody rather than for the gather clock.
     * It belongs in main.js's own frame block; see research/round17-combat-handoff.md, which has
     * the two lines that would move it there. Readers must cope with `active: false`, because
     * nothing has posted yet on the first frame and nothing posts at all in the node tests.
     */
    body: { active: false, x: 0, y: 0, z: 0, yaw: 0, charge: null },
    postBody(at = null) {
      const b = this.body;
      if (!at || typeof at.x !== 'number') { b.active = false; b.charge = null; return b; }
      b.active = true;
      b.x = at.x; b.y = at.y ?? 0; b.z = at.z; b.yaw = at.yaw ?? 0;
      b.charge = at.charge || null;
      return b;
    },
    postSwing(strike, { hand = null, weapon = null, element = null } = {}) {
      swing.strike = strike;
      swing.weapon = weapon || strike?.item || null;
      // what the weapon is made of, so the arc is drawn in its colour without main.js saying so
      swing.element = element || swing.weapon?.castElement || swing.weapon?.brand || 'physical';
      if (hand) swing.hand = hand;
      swing.at = (swing.at || 0) + 1;
      return strike;
    },
    /** Settings -> Debug -> "Show swing hit boxes". Read by js/combat-fx.js. */
    debugHitboxes: false,
    beginShotImpact(power = 1, strike = null) { swing.shot = { power, strike }; },
    endShotImpact() { swing.shot = null; },

    reset() {
      stopLeft = 0; shake = 0; shakeAge = 0;
      swing.strike = null; swing.shot = null;
      // R17 — a charge left on the channel across a load or a landing would be spent by whatever
      // swung first on the new world, which is a free 1.6x nobody built
      swing.charge = null; swing.clip = null;
      this.body.active = false; this.body.charge = null;
    },
  };
}

/** The one the game uses. Everything imports this rather than making its own. */
export const feel = createFeel();

/**
 * THE FIVE KNOBS THIS MODULE DOES NOT SPEND ITSELF, held here because it OWNS them.
 *
 * `balance.json` `player.combat` describes the whole feel of a blow, but three of its numbers are
 * spent in js/actors.js (the knockback ease, the recoil nudge, the wall slam) and two in
 * js/player.js (how slow you move mid-wind-up, how long a press is remembered). Putting them in
 * five more module-level constants across two more files is how this file came to be the second
 * copy in the first place. This object is read BY REFERENCE, so `tuneFeel` moving a field moves it
 * for everybody, including modules that imported it before boot ran.
 */
export const COMBAT_FEEL = {
  /** Seconds a knockback eases out over. */
  knockbackSeconds: 0.18,
  /** Metres a body is nudged along the blow, easing back. Pure presentation. */
  recoilMetres: 0.08,
  /** A body with a wall behind it takes this share of its own maximum health instead of travelling. */
  wallSlamShare: 0.015,
  /** Your share of walking speed while committed to a wind-up. */
  windCommitSpeed: 0.55,
  /** How long an attack press is remembered while the last swing recovers. */
  inputBufferSeconds: 0.18,
};

/**
 * Take the combat feel out of `data/balance.json` instead of restating it here.
 *
 * Called once from js/main.js at boot with `balance.player?.combat`. Every knob is optional and a
 * non-finite one is ignored, so a half-written block degrades to the defaults above rather than
 * putting `NaN` into the hit-stop clock — which would freeze the world, since `dt * feel.scale` is
 * what every simulated system ticks on.
 *
 * `hitStopMaxMs` is the one unit conversion: the file is in milliseconds because a strike's own
 * `hitstop` is (see `hit()`), and this module holds seconds.
 */
export function tuneFeel(cfg = {}) {
  const num = (v, fallback) => (Number.isFinite(v) ? v : fallback);

  MAX_HITSTOP = num(cfg.hitStopMaxMs / 1000, MAX_HITSTOP);
  FLOOR = Math.max(0, Math.min(0.9, num(cfg.hitStopFloor, FLOOR)));
  SHAKE_PER_POINT = num(cfg.shakePerPoint, SHAKE_PER_POINT);
  MAX_SHAKE = num(cfg.shakeMaxMetres, MAX_SHAKE);
  STAGGER_WINDOW = num(cfg.staggerWindowSeconds, STAGGER_WINDOW);

  for (const key of Object.keys(COMBAT_FEEL)) {
    COMBAT_FEEL[key] = num(cfg[key], COMBAT_FEEL[key]);
  }

  return { maxHitstop: MAX_HITSTOP, floor: FLOOR, staggerWindow: STAGGER_WINDOW, ...COMBAT_FEEL };
}

/**
 * How long a stagger actually lasts on this body, and the book that makes it fair.
 *
 * Without diminishing returns a maul build stands over a boss and it never acts again, which is not
 * a fight. The second stagger inside six seconds is 60% as long, the third 30%, the fourth nothing
 * at all — and the count fades once you stop landing them.
 */
export function staggerFor(target, seconds, now = 0) {
  if (!target || !(seconds > 0)) return 0;
  const book = target._staggerBook || (target._staggerBook = { n: 0, last: -99 });
  if (now - book.last > STAGGER_WINDOW) book.n = 0;
  book.last = now;
  const k = STAGGER_FALLOFF[Math.min(STAGGER_FALLOFF.length - 1, book.n)];
  book.n++;
  return seconds * k;
}

/** Knockback distance after the target's rank and whether it is standing on anything. */
export function pushFor(target, metres) {
  if (!target || !(metres > 0)) return 0;
  const rank = target.boss ? 'boss' : (target.rank || 'normal');
  let k = PUSH_RESIST[rank] ?? 1;
  if (target.hover) k *= 1.25;
  return metres * k;
}
