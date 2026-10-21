// Run with: node --import ./avatar-3d/tests/three-register.mjs prototypes/thousandvale/tests/W/anim-rest-probe.mjs
// Builds one Chibi 2.5 body in node and prints where its head, hips and hands are (world metres, body facing +z) while it
// plays a clip, so tests/W/anim-rest.test.js can check a stroke's shape without a browser.
import * as THREE from 'three';
const { createChibi2Character } = await import('../../../../avatar-3d/js/chibi2.js');
const { CHIBI2_REST_ANIMS, SIT_DOWN_MS } = await import('../../../../avatar-3d/js/chibi2-motion-rest.js');
const { normalizeAvatar } = await import('../../../../avatar-2d/js/render.js');
const look = normalizeAvatar({ body: { v: 2.5 } });
const anims = ['idle', 'swim', 'sitGround', ...CHIBI2_REST_ANIMS];
const body = await createChibi2Character(look, { anims, v25: true });
const v = new THREE.Vector3();
const at = n => { body.parts[n].getWorldPosition(v); return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)]; };
const out = { SIT_DOWN_MS };
for (const clip of anims) {
  if (clip === 'SIT_DOWN_MS') continue;
  body.setAnim(clip, 0); body.update(0.001, 0);
  const frames = [];
  for (let i = 0; i < 80; i++) { body.update(0.1, i * 0.1); body.group.updateMatrixWorld(true); frames.push({ t: +(i * 0.1 + 0.1).toFixed(2), head: at('head'), hips: at('hips'), handL: at('handL'), handR: at('handR') }); }
  out[clip] = frames;
}
console.log(JSON.stringify(out));
