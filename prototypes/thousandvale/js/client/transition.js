// Travel transitions (play-test P10): a waystone jump, a dungeon door, a respawn or a province relocate used to
// freeze the last frame for a few seconds while the destination was torn down and rebuilt. Now the screen fades
// to a dark veil the moment the move is known (travelR ok, relocate, a used portal), the destination ground is
// loaded behind it, every new shader is compiled before the veil lifts (renderer.compileAsync), and it lifts
// only once the ground under you is drawn. Walking across a town edge (a handoff onto the same ground) never fades.
//
//   const tr = createTransition({ el, view, scene, camera })
//   tr.cover('Travelling…')          // fade in (idempotent)
//   await tr.reveal()                // compile what is new, wait two frames, fade out
//   tr.covered                       // true while the veil is up

import { nextFrame, perf } from './perf.js';

/** Handoffs that are a jump to somewhere else (fade) rather than a step onto the same ground (no fade). Pure. */
export function isJump(handoff, prevPos, nextPos) {
  const via = handoff?.via || '';
  if (/waystone|relocate|respawn|portal|dungeon|instance|exit|event|travel/.test(via)) return true;
  if (prevPos && nextPos && Math.hypot(nextPos.x - prevPos.x, nextPos.z - prevPos.z) > 60) return true;
  return false;
}

export function createTransition({ el, view, scene, camera, maxMs = 6000 } = {}) {
  let covered = false, coveredAt = 0, token = 0, safety = null;
  const label = el?.querySelector('.tr-text');
  function cover(text = 'Travelling…') {
    if (!el) return;
    if (label) label.textContent = text;
    if (covered) return;
    covered = true; coveredAt = performance.now(); token++;
    el.hidden = false;
    void el.offsetWidth;                 // restart the transition from transparent
    el.classList.add('on');
    perf.quiet(400);                     // the frame that starts the fade is allowed to be the slow one
    clearTimeout(safety);
    safety = setTimeout(() => { if (covered) reveal(true); }, maxMs);   // never leave the player behind a black screen
  }
  async function reveal(force = false) {
    if (!el || !covered) return;
    const my = token;
    if (!force) {
      // compile every program the new place needs while the veil is still up (no first-frame hitch after it lifts)
      try { if (view?.renderer?.compileAsync) await Promise.race([view.renderer.compileAsync(scene, camera), new Promise(r => setTimeout(r, 2500))]); } catch { /* compile() is an optimisation */ }
      // two frames so the new ground is on screen — but never WAIT on frames: a tab that is not being drawn (a second
      // window, a hidden tab) gets none, and the veil stayed up over its HUD until the 12 s safety (play-test 7)
      const frame = () => Promise.race([nextFrame(), new Promise(r => setTimeout(r, 350))]);
      await frame(); await frame();
      // a minimum so a very fast jump still reads as a jump rather than a flicker
      const min = 260 - (performance.now() - coveredAt);
      if (min > 0) await new Promise(r => setTimeout(r, min));
      if (my !== token) return;          // a second jump started meanwhile
    }
    covered = false; clearTimeout(safety);
    el.classList.remove('on');
    setTimeout(() => { if (!covered) el.hidden = true; }, 600);
  }
  return { cover, reveal, get covered() { return covered; } };
}
