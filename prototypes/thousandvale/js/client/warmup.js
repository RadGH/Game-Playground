// Shader warm-up (P1). The freezes that were left after the light pool and the zone-streaming fixes were all one
// thing: the first time a new kind of body appeared (a creature family, a humanoid outfit) three.js compiled its
// shaders on the frame it was first drawn — 1.5-4 s on the test VM's software GPU, a visible hitch on a real one.
//
// So while the title screen is up, one body of every creature type the bestiary uses and every humanoid monster
// look is built in idle moments, folded exactly as actors.js folds it, compiled, and KEPT (hidden, far below the
// world): a program stays cached for as long as one material uses it, so a wolf despawning never throws away the
// shader the next wolf needs. Costs a few MB and a couple of seconds of idle time at boot.
//
//   warmBodies({ scene, renderer, camera, monsterLooks })  -> Promise<{ creatures, humanoids, programs }>

import * as THREE from 'three';
import { createCreature, randomCreature } from '../../../../avatar-3d/js/creatures.js';
import { createChibi2Character } from '../../../../avatar-3d/js/chibi2.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { normalizeAvatar } from '../../../../avatar-2d/js/render.js';
import { bodyTypeFor } from './looks.js';
import { perf } from './perf.js';

const rest = () => new Promise(r => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 300 }) : setTimeout(r, 20)));
/**
 * Yield only when this slice has really used its time (play-test 7). The loop used to wait for an idle callback before
 * EVERY body — and a body takes about 3 ms to build, so the warm-up's length was 40 waits, not 40 builds. On a slow or
 * busy renderer (a frame every few seconds) an idle callback comes once a frame: the warm-up took over seven minutes
 * and the specs that wait for it timed out. Now it builds until 10 ms are spent, then rests once.
 */
let sliceAt = 0;
const idle = async () => { const now = performance.now(); if (now - sliceAt < 10) return; await rest(); sliceAt = performance.now(); };
const CHIBI_ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead', 'swim'];

export async function warmBodies({ scene, renderer, camera, monsterLooks = {}, maxHumanoids = 12, extraTypes = ['wolf'], extras = [] } = {}) {
  const pen = new THREE.Group(); pen.name = 'shader-warm-pen'; pen.position.set(0, -6000, 0);
  scene.add(pen);
  const types = new Set(extraTypes), humanoids = [];
  for (const look of Object.values(monsterLooks)) {
    if (look?.creature?.type) types.add(bodyTypeFor(look.creature.type));
    else if (look?.avatar && humanoids.length < maxHumanoids) humanoids.push(look.avatar);
  }
  let creatures = 0, people = 0;
  for (const type of types) {
    await idle();
    try {
      const body = await perf.span('warm:creature', () => createCreature(randomCreature(type, 7), { detail: 0.8 }));
      try { compactCreature(body); } catch { /* unfolded is still a valid warm-up */ }
      body.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      pen.add(body.group); creatures++;
    } catch { /* a type that fails to build here fails in actors.js too */ }
  }
  for (const av of humanoids) {
    await idle();
    try {
      const body = await createChibi2Character(normalizeAvatar(av), { anims: CHIBI_ANIMS });
      body.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      pen.add(body.group); people++;
    } catch { /* ignore */ }
  }
  // samples of the play-test 2-4 effect materials (swing crescents, loot sparkles/beams, rare rings): first drawn mid-fight they compiled on the spot
  for (const o of extras) if (o) pen.add(o);
  // Round 9: the two programs freeze.spec caught linking mid-walk (logged by name: one `basic`, one `points`). Neither had
  // a sample here because each is first DRAWN late: the selection ring under a target (actors.js: an unlit transparent
  // ring with no fog) the first time you pick something, and the night's point sprites (scene.js stars, horizon.js
  // settlement lights: same parameters) the first dusk. Twins of each, and of the fogged ring (swim ripples, rank marks).
  {
    const ring = new THREE.RingGeometry(0.85, 1.0, 12); ring.rotateX(-Math.PI / 2);
    pen.add(new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#ff4a3a', transparent: true, opacity: 0.9, depthWrite: false, fog: false })));
    pen.add(new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: '#e8f4ff', transparent: true, opacity: 0.45, depthWrite: false })));
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.3, 0.2, 0, -0.3, 0.1, 0], 3));
    pen.add(new THREE.Points(pg, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.5, depthWrite: false, fog: false })));
  }
  // lay them out so frustum tests never skip one, compile everything with the scene's lights, then hide the pen
  pen.children.forEach((c, i) => c.position.set((i % 8) * 3, 0, Math.floor(i / 8) * 3));
  const before = renderer.info.programs?.length || 0;
  try { await Promise.race([renderer.compileAsync(pen, camera, scene), new Promise(r => setTimeout(r, 8000))]); } catch { /* best effort */ }
  pen.visible = false;
  return { creatures, humanoids: people, programs: (renderer.info.programs?.length || 0) - before };
}
