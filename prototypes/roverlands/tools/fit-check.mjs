// Every seat of every vehicle with every race, no browser: build the real model, seat a Chibi 2.6 body exactly as the
// game does (riders.js + handTargets), and measure against the model's own meshes.
//   node --import ./avatar-3d/tests/three-register.mjs prototypes/roverlands/tools/fit-check.mjs [--only id,id] [--json]
// Per seat and race: stretch (1 = the arm reached without stretching), slide (how far a short driver moved the seat
// forward), hipErr, headroom (head top to the first surface above it; negative = through the roof), feet (sole to the
// first surface under it; negative = through the floor, big = dangling), fist (fist-to-target distance).
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
const webFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { const s = String(u); if (!s.startsWith('file:')) return webFetch(u, o); const t = await readFile(new URL(s), 'utf8'); return { ok: true, json: async () => JSON.parse(t), text: async () => t }; };
const { avatarOf, loadLookData } = await import('../../knockabout/js/client/look.js');
await loadLookData();
const { createRider, handTargets } = await import('../js/client/riders.js');
const { buildModel } = await import('../js/client/models/index.js');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const only = arg('only', '') ? arg('only', '').split(',') : null;
const defs = [...JSON.parse(await readFile(new URL('../data/vehicles.json', import.meta.url), 'utf8')).vehicles, ...JSON.parse(await readFile(new URL('../data/vehicles-next.json', import.meta.url), 'utf8')).vehicles].filter(v => v.type !== 'prop' && v.seats?.length && (!only || only.includes(v.id)));
const LOOKS = ['human', 'elf', 'dwarf', 'halfling'].map(race => ({ race, seed: 7, v: 1 }));
const riders = [];
for (const l of LOOKS) riders.push({ race: l.race, r: await createRider(avatarOf(l)) });

const scene = new THREE.Scene();
const ray = new THREE.Raycaster(), UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
const isUnder = (o, g) => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; };
const report = {};
for (const def of defs) {
  const model = await buildModel(THREE, def, {});
  scene.add(model.group); model.group.position.set(0, 10, 0);
  const st = { steer: 0, wheels: def.wheels.map(() => ({ comp: 0.11, spin: 0, steer: 0 })) };
  model.update?.(st);
  scene.updateMatrixWorld(true);
  const meshes = []; model.group.traverse(o => { if (o.isMesh && !(model.steer && isUnder(o, model.steer)) && !/glass|blur|glow/.test(o.name + (o.material?.name || ''))) meshes.push(o); });
  const cast = (from, dir) => { ray.set(from, dir); ray.far = 3; const h = ray.intersectObjects(meshes, false)[0]; return h ? h.distance : null; };
  report[def.id] = [];
  def.seats.forEach((seat, si) => {
    for (const { race, r } of riders) {
      scene.add(r.group);
      for (let i = 0; i < 40; i++) { scene.updateMatrixWorld(true); const h = handTargets(model, seat); r.seated(model.group, seat, h); r.update(0.016); }
      const h = handTargets(model, seat);
      const f = r.fitInfo();
      const B = r.body.parts;
      const head = B.head.getWorldPosition(new THREE.Vector3());
      const roof = cast(head, UP);
      const fist = h ? Math.max(...['R', 'L'].map((sd, k) => h[k] ? B['grip' + sd].getWorldPosition(new THREE.Vector3()).distanceTo(h[k]) : 0)) : null;
      const feet = f.soles.map(s => { const from = new THREE.Vector3(s[0], s[1] + 0.25, s[2]); const d = cast(from, DOWN); return d == null ? null : +(0.25 - d).toFixed(3) * -1; });
      report[def.id].push({ seat: si, role: seat.role, pose: seat.stand ? 'stand' : seat.pose, race, stretch: f.stretch, slide: f.slide, hipErr: f.hipErr,
        headroom: roof == null ? null : +(roof - r.size.headTop).toFixed(3), feet, fist: fist == null ? null : +fist.toFixed(3) });
      r.group.removeFromParent();
    }
  });
  model.group.removeFromParent();
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
const flag = x => (x.stretch > 1.001 ? ' STRETCH' : '') + (x.headroom != null && x.headroom < 0 ? ' HEAD' : '') + (x.feet.some(g => g != null && g < -0.03) ? ' FEET-IN' : '') + (x.feet.some(g => g == null || g > 0.08) ? ' FEET-AIR' : '') + (x.fist != null && x.fist > 0.04 ? ' FIST' : '');
for (const [id, rows] of Object.entries(report)) {
  console.log(`\n## ${id}`);
  for (const x of rows) console.log(`  #${x.seat} ${x.role.padEnd(9)} ${x.pose.padEnd(6)} ${x.race.padEnd(8)} stretch ${x.stretch} slide ${x.slide} hip ${x.hipErr} head ${x.headroom} feet ${x.feet.join('/')} fist ${x.fist}${flag(x)}`);
}
