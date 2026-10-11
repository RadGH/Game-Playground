// Input layer (play-test 10, Y1 — stream G2): starting an ACTIVITY lets go of whatever was moving you.
//
// Report #46: "If I am moving when I start a task like skinning, I am stuck moving after the popup closes until I press
// that key again." The mini-game swallows every key while it is up — the key-UP of the W you were holding included — so
// controls.js still believed W was down when it closed. The same happens with the pad's stick (the mini-game reads the
// pad itself) and with a finger resting on the phone's stick under a window.
//
// An activity = a profession mini-game, a cast line, a talk / shop / craft / cart window. When one STARTS every device
// lets go: controls.release() (held move keys — each ignored until it is pressed AGAIN — auto-run, click-to-move), the
// phone's stick (the gesture is ended) and the pad's stick (ignored until it comes back to the middle).
// Nothing is let go when it ENDS: walking away from a shop or a cast line is how you end those, and that walk must go on.
// A new modal activity that is not on the list: add its selector to ACTIVITY_SEL.

/** What counts as "busy with something" — each entry is a selector that matches only while that thing is on screen. */
export const ACTIVITY_SEL = [
  'html[data-prof]',                                        // a profession mini-game (ready or playing)
  '.tv-prof:not([hidden])',                                 // … and its result card
  '.tv-fish:not([hidden]):not([data-state="idle"])',        // a line in the water
  '.tv-dialog:not([hidden])',                               // talking to someone, a note, a grave, a fire
  '#panel-shop:not([hidden])', '#panel-craft:not([hidden])', '#panel-temper:not([hidden])', '#panel-cart:not([hidden])', '#panel-trainer:not([hidden])',
  '#panel-cook:not([hidden])', '#panel-trade:not([hidden])',
];

/** Pure: which activity (the first matching selector) is on — `has(sel)` answers for one selector. */
export function activeActivity(has, list = ACTIVITY_SEL) { for (const sel of list) if (has(sel)) return sel; return null; }

/**
 * createActivity({ release: [fn…] }) -> { tick(), get busy() }
 * `release` = what to call when an activity STARTS (nothing was on, now something is). tick() once a frame.
 */
export function createActivity({ release = [], doc = typeof document !== 'undefined' ? document : null, list = ACTIVITY_SEL } = {}) {
  let was = null, edges = 0;
  const has = sel => { try { return !!doc?.querySelector(sel); } catch { return false; } };
  function tick() {
    const now = activeActivity(has, list);
    if (now && !was) { edges++; for (const fn of release) { try { fn(now); } catch (e) { console.error('[input] release', e); } } }
    was = now;
    return now;
  }
  return { tick, get busy() { return was; }, get edges() { return edges; } };
}
