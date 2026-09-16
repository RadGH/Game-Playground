// Farhold — what the star does to the picture: god rays, lens flare, and the moment it drops behind
// a ridge.
//
// All of it is drawn in screen space over the canvas, not in the scene. That is an honest choice,
// not a shortcut dressed up: real volumetric shafts want a depth pre-pass and a radial blur, which
// is a lot of frame for a prototype that is already drawing a planet. What this does instead is
// project the sun to a screen position, ask the terrain whether anything is in the way, and paint
// a few gradients — which reads as sun shafts and a flare, costs nothing, and never touches WebGL.
//
//   const sunfx = createSunFx({ mount: document.body, terrain });
//   sunfx.update({ camera, sunDirection, cloud, eclipse, day });
//
// The terrain test is the interesting part, and it is what makes the sunset work: march along the
// sun's direction from the player's eye and see how much of the way is under the ground. A sun
// behind a mountain is fully blocked, a sun grazing a ridge is half blocked, and the rays and the
// flare fade with it instead of shining through the hill.

import * as THREE from 'three';

const GHOSTS = [
  { at: 0.34, size: 26, color: 'rgba(255,190,120,0.30)' },
  { at: 0.58, size: 15, color: 'rgba(120,200,255,0.24)' },
  { at: 0.86, size: 40, color: 'rgba(255,150,180,0.16)' },
  { at: 1.22, size: 22, color: 'rgba(180,255,200,0.18)' },
  { at: 1.65, size: 62, color: 'rgba(255,215,150,0.12)' },
];

const el = (cls, style) => {
  const n = document.createElement('div');
  n.className = cls;
  if (style) n.style.cssText = style;
  return n;
};

export function createSunFx({ mount = document.body, terrain = null, balance = {} } = {}) {
  const cfg = balance.sunfx || {};
  const root = el('sunfx');
  const rays = el('sunfx-rays');
  const glow = el('sunfx-glow');
  const horizon = el('sunfx-horizon');
  const ring = el('sunfx-ring');
  const ghosts = GHOSTS.map(g => {
    const n = el('sunfx-ghost');
    n.style.width = n.style.height = `${g.size}px`;
    n.style.background = `radial-gradient(circle, ${g.color} 0%, rgba(0,0,0,0) 70%)`;
    return n;
  });
  // The flare and the shafts fade together; the horizon wash does NOT — the sun going behind a
  // ridge is the moment the flare dies and the glow on the sky is all that is left.
  const flare = el('sunfx-flare');
  flare.append(rays, glow, ring, ...ghosts);
  root.append(horizon, flare);
  mount.append(root);

  let spin = 0, blocked = 0, strength = 0, onScreen = false, enabled = true;
  const view = new THREE.Vector3(), inverse = new THREE.Quaternion();

  /**
   * How much ground is between the eye and the star. 0 = clear sky, 1 = behind a mountain.
   * Marched in even steps, because a single ray/plane test cannot tell a ridge from a valley.
   */
  function occlusion(camera, dir) {
    if (!terrain || dir.y <= 0.002) return dir.y <= 0.002 ? 1 : 0;
    const steps = cfg.occlusionSteps ?? 22;
    const reach = cfg.occlusionMetres ?? 2600;
    const ex = camera.position.x, ey = camera.position.y, ez = camera.position.z;
    let hidden = 0;
    for (let i = 1; i <= steps; i++) {
      const t = (i / steps) * reach;
      if (ey + dir.y * t < terrain.heightAt(ex + dir.x * t, ez + dir.z * t)) hidden++;
    }
    return hidden / steps;
  }

  function update({ camera, sunDirection, cloud = 0, eclipse = 0, day = 1, dt = 0.016 } = {}) {
    if (!enabled) { root.style.visibility = 'hidden'; return; }
    if (!camera || !sunDirection) return;
    spin = (spin + dt * 2.4) % 360;

    // Where the star lands on screen. The sky is drawn with a camera at the origin holding only the
    // main camera's rotation, so the sun's DIRECTION projects exactly as a point at that direction
    // would: turn it into the camera's own space and divide by depth.
    inverse.copy(camera.quaternion).invert();
    view.copy(sunDirection).applyQuaternion(inverse);
    const vx = view.x, vy = view.y, vz = view.z;

    const w = mount.clientWidth || window.innerWidth;
    const h = mount.clientHeight || window.innerHeight;
    // in front of the camera means negative z in view space
    onScreen = vz < -0.05;
    const f = 1 / Math.tan((camera.fov * Math.PI / 180) / 2);
    const sx = onScreen ? (vx / -vz) * f / camera.aspect : 0;
    const sy = onScreen ? (vy / -vz) * f : 0;
    const px = (sx * 0.5 + 0.5) * w;
    const py = (-sy * 0.5 + 0.5) * h;

    blocked = occlusion(camera, sunDirection);
    // How strong the effect is: the star has to be up, in front of you, near the middle of the view,
    // out of the cloud, not eclipsed, and not behind a hill.
    const centred = onScreen ? Math.max(0, 1 - Math.hypot(sx, sy) * 0.55) : 0;
    const lowSun = Math.max(0, 1 - Math.abs(sunDirection.y) * 2.2);   // strongest near the horizon
    // An eclipse does NOT kill the flare — it is the one time a flare is worth having. The shafts
    // die with the light, but the ghosts brighten and a ring appears around the covered star: what
    // you actually see through a lens when a disc slides over the sun.
    // A star below the horizon gives nothing; above about 7 degrees it gives everything. `day` is
    // not used for this, because `day` falls off exactly when a low sun should flare hardest.
    const up = Math.max(0, Math.min(1, sunDirection.y * 8));
    strength = Math.max(0, Math.min(1,
      centred * (0.35 + lowSun * 0.85) * (1 - cloud * 0.85) * (1 - eclipse * 0.45) * (1 - blocked) * up));

    // The sun going behind a ridge, or down past the horizon: a warm wash up the bottom of the sky.
    // It is there whenever the star is near the horizon, and strongest while something is cutting
    // it in half — `blocked` at a half is a ridge across the disc, 0 or 1 is clear sky or a mountain.
    const nearHorizon = Math.max(0, 1 - Math.abs(sunDirection.y) * 3.5);
    const cut = 4 * blocked * (1 - blocked);
    const rim = nearHorizon * (0.3 + 0.7 * cut) * (1 - cloud * 0.7);
    horizon.style.opacity = String(Math.max(0, Math.min(0.55, rim)));

    flare.style.opacity = String(strength);
    if (strength <= 0.002 && rim <= 0.002) { root.style.visibility = 'hidden'; return; }
    root.style.visibility = 'visible';
    if (strength <= 0.002) return;

    glow.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${(1 + lowSun * 0.8) * (1 - eclipse * 0.6)})`;
    rays.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) rotate(${spin}deg) scale(${1 + lowSun})`;
    rays.style.opacity = String(1 - eclipse);
    // the corona ring, only while something is actually on the star
    root.classList.toggle('eclipsed', eclipse > 0.15);
    ring.style.opacity = String(Math.min(1, eclipse * 1.4));
    ring.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%) scale(${0.7 + eclipse * 0.5})`;
    // ghosts march from the star, through the middle of the screen, and out the far side
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < ghosts.length; i++) {
      const g = GHOSTS[i];
      ghosts[i].style.transform =
        `translate(${px + (cx - px) * g.at}px, ${py + (cy - py) * g.at}px) translate(-50%, -50%)`;
    }
  }

  return {
    root, update,
    /** Nothing to draw (in the ship, on the title screen). */
    hide() { strength = 0; root.style.visibility = 'hidden'; },
    /** Turn the whole thing off (the settings panel does this). */
    setEnabled(v) { enabled = !!v; if (!enabled) { strength = 0; root.style.visibility = 'hidden'; } },
    get enabled() { return enabled; },
    /** For the HUD, the debug menu and the tests. */
    stats: () => ({ strength: +strength.toFixed(3), blocked: +blocked.toFixed(3), onScreen, rim: +(+horizon.style.opacity || 0).toFixed(3) }),
    dispose() { root.remove(); },
  };
}
