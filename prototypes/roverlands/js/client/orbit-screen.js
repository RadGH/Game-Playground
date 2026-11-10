// The orbit screen (Expansion 1 M11): after the rocket clears SPACE.orbitAlt the view fades to black and comes back
// on the planet below — Wayfare, filling the view (js/client/world-view/space.js), the upper stage drifting in front —
// with three buttons: Dock at Lantern Station, Land on the Moon, Return home. The room has already put the crew in
// orbit; a pick sends the `go` (js/game/space-play.js travelMsg) and main.js rebuilds the world for the new place.
//
//   const os = createOrbitScreen({ THREE, renderer, buildModel, def, onPick(choice) });
//   os.render(dt)      instead of the game's scene while it is up;  os.el (the DOM);  os.dispose()
import { createSpaceBackdrop } from './world-view/space.js';
import { orbitChoices, SPACE } from '../game/space.js';

export function createOrbitScreen({ THREE, renderer, buildModel = null, def = null, onPick = () => {} }) {
  if (!document.querySelector('link[data-rl-space]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/space.css'; l.dataset.rlSpace = '1'; document.head.append(l);
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  // the planet straight below and ahead, big; the sun behind and to one side, so its edge is a lit crescent
  const space = createSpaceBackdrop(THREE, { sunDir: [0.75, 0.35, -0.55], planet: { dir: [0, -0.62, 0.78], size: 0.7, colour: '#4f8fd0' } }, { stars: 2600 });
  scene.add(space.group);
  scene.add(new THREE.AmbientLight('#8090a8', 0.5));
  const sun = new THREE.DirectionalLight('#fff6e8', 2.4); sun.position.set(6, 3, -5); scene.add(sun);
  let craft = null, t = 0, gone = false;
  if (buildModel && def) Promise.resolve(buildModel(THREE, def, {})).then(m => {
    if (gone || !m) return;
    craft = m; m.group.scale.setScalar(0.32); m.group.rotation.set(0.35, 0.6, -0.15);
    try { m.update?.({ acts: { door_stage: true }, lever: 0, t: 99 }); m.update?.({ acts: { door_stage: true }, lever: 0, t: 104 }); } catch { /* a model without update */ }
    if (m.booster) m.booster.visible = false;
    scene.add(m.group);
  }).catch(() => {});

  const el = document.createElement('div'); el.className = 'rl-orbit';
  el.innerHTML = `<div class="rl-orbit-panel" role="dialog" aria-label="In orbit"><h2>In orbit</h2>
    <div class="rl-orbit-alt">${SPACE.orbitAlt.toLocaleString()} m up · Wayfare below</div>
    <p>The rocket made it. Where to?</p>
    <div class="rl-orbit-list">${orbitChoices().map((c, i) => `<button type="button" class="rl-btn${i === 0 ? ' primary' : ''}" data-pick="${c.id}"><b>${c.label}</b><small>${c.note}</small></button>`).join('')}</div></div>`;
  document.body.append(el);
  try { document.exitPointerLock?.(); } catch { /* fine */ }
  let picked = false;
  el.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b || picked) return; picked = true; el.querySelectorAll('button').forEach(x => { x.disabled = true; }); onPick(b.dataset.pick); });
  // keyboard / controller: 1 2 3, or the first button has focus so Enter / A takes it
  const keys = e => { const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code]; if (n != null) el.querySelectorAll('[data-pick]')[n]?.click(); };
  addEventListener('keydown', keys);
  setTimeout(() => el.querySelector('[data-pick]')?.focus?.(), 50);

  return {
    el, scene, camera: cam,
    render(dt = 1 / 60) {
      t += dt;
      const w = renderer.domElement.clientWidth || innerWidth, h = renderer.domElement.clientHeight || innerHeight;
      if (Math.abs(cam.aspect - w / h) > 1e-3) { cam.aspect = w / h; cam.fov = w < h ? 70 : 55; cam.updateProjectionMatrix(); }
      // a slow drift: looking out along the orbit, the planet's limb turning under you
      cam.position.set(0, 0, 0);
      cam.lookAt(Math.sin(t * 0.02) * 0.3, -0.32, 1);
      space.update(cam);
      if (craft) { craft.group.position.set(1.4 + Math.sin(t * 0.3) * 0.05, -0.55 + Math.sin(t * 0.21) * 0.04, 5.2); craft.group.rotation.y = 0.6 + t * 0.05; }
      renderer.render(scene, cam);
    },
    dispose() { gone = true; removeEventListener('keydown', keys); el.remove(); space.dispose?.(); craft?.group.removeFromParent(); },
  };
}
