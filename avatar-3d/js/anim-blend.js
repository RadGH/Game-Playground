// One rule for switching animation clips on a three.js mixer, shared by the Tabard and fal.ai character runtimes.
import * as THREE from 'three';

/**
 * Switch the mixer to action `a` over `fade` seconds so the weights of all clips ALWAYS add up to 1. three.js fills any
 * missing weight with the bind pose (the T-pose), and its own crossFadeFrom only fades the one previous clip, starting
 * from full weight: a clip change during another fade (attack → hit → idle) left the sum under 1 and flashed part of a
 * T-pose for a frame or two (owner 2026-11-23: "a single frame of T-pose"). Here every clip that still has weight fades
 * out from the weight it has now, and the new one fades in from the weight it has now. Loops that are still showing keep
 * their place in time (no jump); one-shots restart. Used by avatar-3d/tabard/js/tabard.js and avatar-3d/fal/js/fal.js.
 */
export function blendTo(mixer, a, fade, once) {
  const now = a.isScheduled() && a.enabled ? a.getEffectiveWeight() : 0;
  if (once || now <= 0.001) a.reset();
  a.enabled = true; a.paused = false;
  a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.clampWhenFinished = once;
  a.play();
  const others = mixer._actions.filter(x => x !== a && x.isScheduled() && x.enabled && x.getEffectiveWeight() > 0);
  if (fade <= 0 || !others.length) {
    for (const x of others) { x.stopFading(); x.stop(); }
    a.setEffectiveWeight(1);
    return;
  }
  for (const x of others) { const w = x.getEffectiveWeight(); x.stopFading(); x.weight = 1; x._scheduleFading(fade, w, 0); }
  a.stopFading(); a.weight = 1; a._scheduleFading(fade, Math.min(1, now), 1);
}
