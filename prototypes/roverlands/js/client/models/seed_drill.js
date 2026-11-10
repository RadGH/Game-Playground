// Seed Drill (reference: assets/ref/seed_drill.webp, recoloured to the Furrowline orange + dark grey + cream: never the
// green-and-yellow of the sheet, the same rule as the harvester). A long seed hopper with a cream lid and latches on a
// dark frame, a row of seed tubes down to staggered coulter discs, two big tyres outboard at the back, an A-frame tongue
// to a ring eye at def.hitch, a jockey wheel (def.wheels' `leg`), lamp posts at the back corners. Moving: `coulters`
// (one merged group) drops 0.12 m into the soil while st.acts.door_sow is on (the tractor's fire button, session.js
// `tow_work`) and seed specks trickle down the tubes. No words, no brands.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const O = 'orange', OD = 'orangeDark', K = 'black', DM = 'darkMetal', C = 'cream', T = 'trim';
  const ch = def.chassis, hop = def.parts[0];
  const fx = ch.hx, fz0 = ch.p[2] - ch.hz, fz1 = ch.p[2] + ch.hz;        // ±1.25, -0.75..0.35
  const fy = ch.p[1];
  const hx = hop.box[0], hy0 = hop.p[1] - hop.box[1], hy1 = hop.p[1] + hop.box[1];   // ±1.15, 0.25..0.85
  const hz0 = hop.p[2] - hop.box[2], hz1 = hop.p[2] + hop.box[2];       // -0.6..0.3
  const road = def.wheels.filter(w => !w.leg), jock = def.wheels.find(w => w.leg);
  const ground = road[0].p[1] + 0.1 - 0.05 - road[0].r;                   // ~ -0.6 at rest

  // --- frame: front and back beams, side rails, the stub axles out to the wheels -----------------------------------
  k.box(DM, [fx * 2, 0.12, 0.12], [0, fy, fz1 - 0.06], { bevel: 0.02 });
  k.box(DM, [fx * 2, 0.12, 0.12], [0, fy, fz0 + 0.06], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    k.box(DM, [0.1, 0.12, fz1 - fz0], [sx * (fx - 0.05), fy, ch.p[2]], { bevel: 0.02 });
    const w = road.find(r => Math.sign(r.p[0]) === sx);
    k.box(DM, [Math.abs(w.p[0]) - fx + 0.05, 0.1, 0.1], [sx * (fx + (Math.abs(w.p[0]) - fx) / 2), w.p[1] + 0.06, w.p[2]], { bevel: 0.015 });
    k.box(DM, [0.08, fy - w.p[1], 0.1], [sx * (fx - 0.02), (fy + w.p[1] + 0.06) / 2, w.p[2]], { bevel: 0.01 });
    // hopper end stands
    k.box(O, [0.08, hy0 - fy + 0.1, 0.08], [sx * (hx - 0.1), (hy0 + fy) / 2, hz1 - 0.1], { bevel: 0.01 });
    k.box(O, [0.08, hy0 - fy + 0.1, 0.08], [sx * (hx - 0.1), (hy0 + fy) / 2, hz0 + 0.1], { bevel: 0.01 });
    // lamp post at the back corner, a red lamp on top
    k.box(DM, [0.06, hy1 + 0.1 - fy, 0.06], [sx * (fx + 0.02), (hy1 + 0.1 + fy) / 2, fz0 + 0.02], { bevel: 0.01 });
    k.box('tail', [0.08, 0.16, 0.05], [sx * (fx + 0.02), hy1 + 0.12, fz0 - 0.01], { bevel: 0.01 });
    k.box('amber', [0.05, 0.05, 0.04], [sx * (fx + 0.02), hy1 - 0.02, fz0 - 0.01], { bevel: 0 });
  }

  // --- hopper: a box over a narrower V bottom, cream lid with latches --------------------------------------------
  const mid = hy0 + (hy1 - hy0) * 0.45;
  k.box(O, [hx * 2, hy1 - mid, hz1 - hz0], [0, (hy1 + mid) / 2, (hz0 + hz1) / 2], { bevel: 0.03 });
  // the V bottom: two sloped plates down to a narrow trough
  const vd = (hz1 - hz0) / 2, vh = mid - hy0;
  for (const sz of [1, -1]) k.box(O, [hx * 2 - 0.04, 0.05, Math.hypot(vd * 0.7, vh)], [0, (mid + hy0) / 2, (hz0 + hz1) / 2 - 0.1 + sz * vd * 0.4], { rot: [sz * Math.atan2(vh, vd * 0.7) * -1, 0, 0], bevel: 0.01 });
  k.box(OD, [hx * 2 - 0.1, 0.08, 0.24], [0, hy0 + 0.04, (hz0 + hz1) / 2 - 0.1], { bevel: 0.02 });
  k.box(K, [hx * 2 + 0.01, 0.04, hz1 - hz0 + 0.01], [0, hy1 - 0.06, (hz0 + hz1) / 2], { bevel: 0 });          // dark seam under the lid
  k.box(C, [hx * 2 + 0.06, 0.08, hz1 - hz0 + 0.08], [0, hy1 + 0.0, (hz0 + hz1) / 2], { bevel: 0.03 });        // lid
  k.box(C, [hx * 2 - 0.1, 0.03, hz1 - hz0 - 0.1], [0, hy1 + 0.05, (hz0 + hz1) / 2], { bevel: 0.01 });
  for (const x of [-hx * 0.6, 0, hx * 0.6]) for (const z of [hz1 + 0.045, hz0 - 0.045]) k.box(T, [0.12, 0.08, 0.02], [x, hy1 - 0.04, z], { bevel: 0.005 });   // latches
  k.box(DM, [hx * 2 - 0.1, 0.05, 0.12], [0, hy0 + 0.02, (hz0 + hz1) / 2 - 0.1], { bevel: 0.01 });             // metering shaft housing

  // --- seed tubes + coulter arms (static), coulter discs (the moving group) -----------------------------------------
  const rows = 13, cz = [fz0 + 0.42, fz0 + 0.12];                         // two staggered rows of discs
  const coulters = new THREE.Group();
  const ck = createKit(THREE, opts);
  const dropY = ground + 0.15;                                             // disc centre when working
  const tubes = [];
  for (let i = 0; i < rows; i++) {
    const x = -hx + 0.08 + i * (hx * 2 - 0.16) / (rows - 1), z = cz[i % 2];
    const top = [x, hy0 + 0.02, (hz0 + hz1) / 2 - 0.1];
    k.tube('metal', [top, [x, fy + 0.02, z + 0.08], [x, fy - 0.12, z + 0.02]], 0.018, { seg: 4 });   // seed tube
    tubes.push([x, z]);
    // the disc + its arm, built at the working height; the group lifts them when not sowing
    ck.box(DM, [0.04, 0.05, 0.3], [x, dropY + 0.18, z + 0.15], { rot: [0.5, 0, 0], bevel: 0 });
    ck.cyl(DM, 0.16, 0.025, [x, dropY, z], { axis: 'x', seg: 12 });
    ck.cyl(T, 0.05, 0.04, [x, dropY, z], { axis: 'x', seg: 6 });
    ck.box(O, [0.05, 0.12, 0.06], [x, dropY + 0.1, z - 0.02], { bevel: 0.01 });                          // press boot
  }
  ck.finish(coulters);
  k.box(DM, [hx * 2, 0.08, 0.08], [0, fy - 0.1, cz[0] + 0.35], { bevel: 0.01 });                         // tool bar under the frame

  // --- tongue: A-frame to the ring eye; jockey wheel post ----------------------------------------------------------
  const [hX, hY, hZ] = def.hitch;
  for (const sx of [1, -1]) k.tube(O, [[sx * (fx - 0.15), fy, fz1 - 0.05], [hX + sx * 0.08, hY, hZ - 0.45]], 0.045, { seg: 6 });
  k.box(O, [0.12, 0.1, 0.5], [hX, hY, hZ - 0.25], { bevel: 0.02 });
  k.box(O, [fx * 1.2, 0.08, 0.08], [0, (fy + hY) / 2, (fz1 + hZ) / 2 - 0.3], { bevel: 0.01 });           // cross brace
  const eye = new THREE.TorusGeometry(0.075, 0.025, 5, 12); eye.rotateX(Math.PI / 2); eye.translate(hX, hY, hZ);
  if (jock) {
    const [jx, jy, jz] = jock.p;
    k.cyl(DM, 0.03, hY - jy + 0.15, [jx + 0.1, (hY + jy) / 2 + 0.05, jz], { seg: 8 });
    k.cyl(T, 0.04, 0.08, [jx + 0.1, hY + 0.15, jz], { seg: 8 });
    k.box(DM, [0.14, 0.04, 0.04], [jx + 0.05, jy + 0.06, jz], { bevel: 0 });
  }

  // --- wheels --------------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = w.leg ? k.tyre({ r: w.r, w: w.w, style: 'road', knobs: 10, rimCol: 'metal', rim: 0.5 }) : k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 18, rimCol: DM, rim: 0.5 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  // seed specks: a few points falling out of the tubes while sowing
  const N = 3, pos = new Float32Array(rows * N * 3);
  const specks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), seedMat(THREE));
  specks.visible = false; specks.frustumCulled = false; specks.userData.detail = true;

  k.finish(group);
  const eyeMesh = new THREE.Mesh(eye, k.mat(DM));
  group.add(coulters, specks, eyeMesh);
  let lift = 0.12, lastT = null;
  return {
    group, wheels, coulters,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.spin.rotation.x = w.spin || 0;
      });
      const t = st.t ?? performance.now() / 1000;
      const dt = lastT == null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const on = !!st.acts?.door_sow;
      lift += Math.sign((on ? 0 : 0.12) - lift) * Math.min(Math.abs((on ? 0 : 0.12) - lift), dt * 0.3);
      coulters.position.y = lift;
      specks.visible = on && lift < 0.02;
      if (specks.visible) {
        let o = 0;
        for (const [i, [x, z]] of tubes.entries()) for (let j = 0; j < N; j++) {
          const f = (t * 2.2 + j / N + i * 0.37) % 1;
          pos[o++] = x; pos[o++] = fy - 0.12 - f * (fy - 0.12 - ground - 0.02); pos[o++] = z;
        }
        specks.geometry.attributes.position.needsUpdate = true;
      }
    },
  };
}

let SEED = null;
function seedMat(THREE) { return SEED || (SEED = new THREE.PointsMaterial({ color: '#e8d27a', size: 0.06, sizeAttenuation: true })); }
