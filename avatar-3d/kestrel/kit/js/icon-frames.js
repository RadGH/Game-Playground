// Kestrel kit — how Thousandvale's gear icons frame a piece worn by the Kestrel mannequin (batch 5, 2026-10-28).
//
// Thousandvale draws an armour / cloak / belt icon by putting exactly the item's parts on a plain mannequin and pointing a
// camera at the part of the body the item is on (js/client/ui/item-icons.js `PART_FRAMES`, written for Chibi's big head
// and short body). Under `?chars=kestrel` the mannequin is a Kestrel body (kestrel.js `look.mannequin`: one colour, a
// carved face, no eyes) at real proportions, so the same frames would show a hat as a speck on a tall figure. These are
// the same frames measured for Kestrel: `bones` = whose world positions are averaged for the target, `lift` = metres up
// from there as a fraction of the body's height, `fwd` = forward (+z, the way the mannequin faces) likewise, `radius` =
// the half-size of the view (fraction of height), `yaw` /
// `pitch` = where the camera stands. Pure data; tests/icons.test.js projects each item's own vertices through the camera
// these give (aimIcon below, the same arithmetic item-icons.js uses) and checks the piece fills the icon without being cut.
export const KESTREL_ICON_FRAMES = {
  bust: { bones: ['head'], lift: 0.062, radius: 0.108, yaw: 0.45, pitch: 0.12 },
  torso: { bones: ['chest'], lift: -0.06, radius: 0.19, yaw: 0.35, pitch: 0.06 },
  legs: { bones: ['kneeL', 'kneeR'], lift: 0.02, radius: 0.27, yaw: 0.45, pitch: 0.05 },
  feet: { bones: ['footL', 'footR'], lift: 0.045, fwd: 0.04, radius: 0.13, yaw: 0.7, pitch: 0.3 },
  hands: { bones: ['handR'], lift: 0.015, fwd: 0.035, radius: 0.11, yaw: 1.15, pitch: 0.1 },
  back: { bones: ['chest'], lift: -0.095, fwd: -0.04, radius: 0.3, yaw: Math.PI - 0.5, pitch: 0.1 },
  waist: { bones: ['hips'], lift: -0.05, fwd: 0.05, radius: 0.11, yaw: 0.35, pitch: 0.05 },
  neck: { bones: ['neck'], lift: -0.01, radius: 0.08, yaw: 0.2, pitch: 0.1 },
  ring: { bones: ['handR'], lift: 0.0, radius: 0.045, yaw: -1.2, pitch: 0.35 },
  carry: { bones: ['chest'], lift: -0.08, radius: 0.34, yaw: 0.45, pitch: 0.08 },
};
/** The icon cache's version suffix for Kestrel pictures (they must never be mixed with Chibi ones). */
export const KESTREL_ICON_VERSION = 'k1';

/**
 * The icon camera for a frame: item-icons.js `aim` (a camera `radius / sin(fov/2)` away from `target`, at `yaw` round
 * and `pitch` up). `camera` = a THREE.PerspectiveCamera (fov 26 in the game). Returns the camera.
 */
export function aimIcon(camera, target, radius, yaw = 0.35, pitch = 0.12) {
  const d = radius / Math.sin(camera.fov * Math.PI / 360);
  camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * d, target.y + Math.sin(pitch) * d, target.z + Math.cos(yaw) * Math.cos(pitch) * d);
  camera.near = Math.max(0.01, d - radius * 4); camera.far = d + radius * 6;
  camera.lookAt(target); camera.updateProjectionMatrix();
  return camera;
}
