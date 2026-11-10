// Measure a Chibi 2.6 rider in every pose Roverlands seats people in (M1 of Expansion 1).
//   node --import ./avatar-3d/tests/three-register.mjs prototypes/roverlands/tools/measure-rider.mjs [--looks 12] [--v 2.5]
// Builds bodies exactly as the game does (createChibi2Character with { v25, v26 } from Thousandvale's switch and the
// knockabout look pipeline), plays each clip, and reads world points off the bones and the skinned mesh.
// Frame: the actor root is the origin, +z forward, +y up. Every value in metres.
import * as THREE from 'three';
import { createChibi2Character } from '../../../avatar-3d/js/chibi2.js';
import { tvChibiOpts } from '../../thousandvale/js/client/chibi-version.js';
import { ANIMS } from '../js/client/riders.js';
import { readFile } from 'node:fs/promises';
// the look pipeline fetch()es its data next to itself: answer file: URLs from disk
const webFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { const s = String(u); if (!s.startsWith('file:')) return webFetch(u, o); const t = await readFile(new URL(s), 'utf8'); return { ok: true, json: async () => JSON.parse(t), text: async () => t }; };
const { randomLook, avatarOf, loadLookData } = await import('../../knockabout/js/client/look.js');
await loadLookData();

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('looks', 12), V = +arg('v', 2.6);
const POSES = ['idle', 'drive', 'seated', 'ride', 'sit'];
const P = new THREE.Vector3();
const wp = (b, o = [0, 0, 0]) => P.set(...o).applyMatrix4(b.matrixWorld).clone();
const r3 = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];

function meshBox(actor) {
  const box = new THREE.Box3(), pt = new THREE.Vector3();
  actor.group.updateMatrixWorld(true);
  actor.group.traverse(m => {
    if (!m.isSkinnedMesh || !m.visible) return;
    m.skeleton.update();
    const n = m.geometry.attributes.position.count;
    for (let i = 0; i < n; i += 3) { m.getVertexPosition(i, pt); m.localToWorld(pt); box.expandByPoint(pt); }
  });
  return box;
}
function soleY(actor) {
  // lowest vertex mostly weighted to a foot bone
  let min = Infinity; const pt = new THREE.Vector3();
  actor.group.traverse(m => {
    if (!m.isSkinnedMesh) return;
    const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
    for (let i = 0; i < si.count; i++) {
      let best = 0; for (let k = 1; k < 4; k++) if (sw.getComponent(i, k) > sw.getComponent(i, best)) best = k;
      const nm = m.skeleton.bones[si.getComponent(i, best)]?.name;
      if (nm !== 'footL' && nm !== 'footR') continue;
      m.getVertexPosition(i, pt); m.localToWorld(pt); if (pt.y < min) min = pt.y;
    }
  });
  return min;
}

async function measure(avatar) {
  const a = await createChibi2Character(avatar, tvChibiOpts({ anims: [...new Set([...ANIMS, 'drive', 'seated'])] }, V));
  const out = {};
  for (const pose of POSES) {
    
    a.setAnim(pose, 0, true);
    for (let i = 0; i < 20; i++) a.update(0.016);
    a.group.updateMatrixWorld(true);
    const B = a.parts;
    const box = meshBox(a);
    const sh = [wp(B.armL), wp(B.armR)], el = [wp(B.elbowL), wp(B.elbowR)], ha = [wp(B.handL), wp(B.handR)];
    const gr = [B.gripL ? wp(B.gripL) : ha[0], B.gripR ? wp(B.gripR) : ha[1]];
    const upper = sh[0].distanceTo(el[0]), fore = el[0].distanceTo(ha[0]), toGrip = ha[0].distanceTo(gr[0]);
    out[pose] = {
      hip: r3(wp(B.hips)), sole: +soleY(a).toFixed(3), knee: r3(wp(B.kneeL)), foot: r3(wp(B.footL)),
      eye: +((wp(B.eyeL).y + wp(B.eyeR).y) / 2).toFixed(3), headTop: +box.max.y.toFixed(3), headTopZ: null,
      shoulderL: r3(sh[0]), shoulderR: r3(sh[1]), shoulderW: +sh[0].distanceTo(sh[1]).toFixed(3),
      gripL: r3(gr[0]), gripR: r3(gr[1]), armLen: +(upper + fore + toGrip).toFixed(3), upper: +upper.toFixed(3), fore: +fore.toFixed(3),
      legJoint: r3(wp(B.legL)), thigh: +wp(B.legL).distanceTo(wp(B.kneeL)).toFixed(3), shin: +wp(B.kneeL).distanceTo(wp(B.footL)).toFixed(3), ankle: +(wp(B.footL).y - soleY(a)).toFixed(3),
      front: +box.max.z.toFixed(3), back: +box.min.z.toFixed(3), halfWidth: +Math.max(box.max.x, -box.min.x).toFixed(3),
    };
  }
  out.height = a.metrics().totalHeight;
  a.dispose?.();
  return out;
}

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const looks = [{ name: 'default human', av: avatarOf({ race: 'human', seed: 1, v: 1 }) }];
for (const race of ['human', 'elf', 'dwarf', 'halfling']) looks.push({ name: race + ' seed 7', av: avatarOf({ race, seed: 7, v: 1 }) });
for (let i = 0; i < N; i++) { const l = randomLook(rand); looks.push({ name: `garage #${i} ${l.race}`, av: avatarOf(l) }); }
const all = [];
for (const l of looks) { const m = await measure(l.av); all.push({ name: l.name, ...m }); }
if (process.argv.includes('--json')) { console.log(JSON.stringify(all, null, 1)); process.exit(0); }
for (const m of all) {
  console.log(`\n## ${m.name} (height ${m.height?.toFixed?.(3)})`);
  for (const p of POSES) if (m[p]) {
    const x = m[p];
    console.log(`${p.padEnd(7)} hip ${x.hip} sole ${x.sole} eye ${x.eye} top ${x.headTop} shW ${x.shoulderW} shL ${x.shoulderL} gripL ${x.gripL} arm ${x.armLen} (${x.upper}+${x.fore}) knee ${x.knee} z[${x.back},${x.front}] halfW ${x.halfWidth} leg ${x.legJoint} thigh ${x.thigh} shin ${x.shin} ankle ${x.ankle} foot ${x.foot}`);
  }
}
