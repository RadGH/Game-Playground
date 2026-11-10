// Water Bowser (reference: assets/ref/water_bowser.webp). A blue tank with two white bands and a dark manhole on top,
// on a dark tandem-axle frame; a yellow hose reel and pump at the front of the frame; an A-frame tongue with a ring eye
// at def.hitch and a parking stand; a spray boom across the back (x ±def.spray.hw) on a triangular truss with nozzles
// hanging under it. While st.acts.door_spray is on (the tractor's fire button, session.js `tow_work`) every nozzle
// throws a cone of mist: one Points cloud (frustum culling off, hidden past the detail distance), recycled drops.
// No words, no brands.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const B = 'blue', BD = 'blueDark', W = 'hullWhite', DM = 'darkMetal', K = 'black', Y = 'yellow', T = 'trim';
  const ch = def.chassis, tank = def.parts[0];
  const fx = ch.hx, fz0 = ch.p[2] - ch.hz, fz1 = ch.p[2] + ch.hz;        // ±0.7, -1.7..1.4
  const fy = ch.p[1];
  const R = 0.56, ty = tank.p[1], tz0 = tank.p[2] - tank.box[2], tz1 = tank.p[2] + tank.box[2];   // tank -1.35..0.95
  const w0 = def.wheels[0], ground = w0.p[1] + 0.1 - 0.05 - w0.r;       // ~ -0.53 at rest
  const sp = def.spray, boomZ = fz0 - 0.1, boomY = fy + 0.55;

  // --- frame: two rails, cross members, axle beams; fenders over the tandem -----------------------------------------
  for (const sx of [1, -1]) k.box(DM, [0.12, 0.16, fz1 - fz0], [sx * (fx - 0.1), fy, ch.p[2]], { bevel: 0.02 });
  for (const z of [fz1 - 0.08, fz0 + 0.08, 0.6, -0.2, -1.0]) k.box(DM, [fx * 2 - 0.1, 0.1, 0.1], [0, fy - 0.02, z], { bevel: 0.01 });
  for (const z of [...new Set(def.wheels.map(w => w.p[2]))]) {
    const x = Math.abs(w0.p[0]);
    k.box(DM, [x * 2 - w0.w, 0.1, 0.12], [0, w0.p[1] + 0.06, z], { bevel: 0.015 });
  }
  for (const sx of [1, -1]) {
    const zs = def.wheels.map(w => w.p[2]), za = Math.max(...zs) + w0.r + 0.06, zb = Math.min(...zs) - w0.r - 0.06;
    k.box(K, [w0.w + 0.12, 0.05, za - zb], [sx * Math.abs(w0.p[0]), w0.p[1] + 0.06 + w0.r + 0.12, (za + zb) / 2], { bevel: 0.015 });   // flat fender
    k.box(DM, [Math.abs(w0.p[0]) - fx + 0.1, 0.05, 0.08], [sx * (fx + (Math.abs(w0.p[0]) - fx) / 2), w0.p[1] + 0.06 + w0.r + 0.1, (za + zb) / 2], { bevel: 0 });
    k.box('tail', [0.1, 0.08, 0.04], [sx * (fx - 0.05), fy + 0.02, fz0 - 0.02], { bevel: 0.01 });
  }

  // --- tank: a 14-sided cylinder along z with chamfered ends, bands, saddles, manhole -------------------------------
  const len = tz1 - tz0 - 0.24;
  k.cyl(B, R, len, [0, ty, (tz0 + tz1) / 2], { axis: 'z', seg: 14 });
  k.cyl(B, R, 0.12, [0, ty, tz1 - 0.06], { axis: 'z', seg: 14, r2: R * 0.72 });          // front end (radius r at -z → r2 at +z)
  k.cyl(B, R * 0.72, 0.12, [0, ty, tz0 + 0.06], { axis: 'z', seg: 14, r2: R });
  k.cyl(BD, R * 0.7, 0.02, [0, ty, tz1 + 0.005], { axis: 'z', seg: 14 });
  k.cyl(BD, R * 0.7, 0.02, [0, ty, tz0 - 0.005], { axis: 'z', seg: 14 });
  for (const z of [tz0 + len * 0.28, tz0 + len * 0.78]) k.cyl(W, R + 0.012, 0.12, [0, ty, z], { axis: 'z', seg: 14 });
  k.cyl(K, 0.17, 0.1, [0, ty + R + 0.03, (tz0 + tz1) / 2], { seg: 8 });                   // manhole
  k.cyl(K, 0.12, 0.05, [0, ty + R + 0.1, (tz0 + tz1) / 2], { seg: 8 });
  for (const z of [tz0 + 0.35, tz1 - 0.35]) k.box(DM, [R * 1.6, ty - R * 0.6 - fy, 0.14], [0, (ty - R * 0.6 + fy) / 2 + 0.03, z], { bevel: 0.02 });   // saddles
  k.cyl(DM, 0.05, 0.3, [0, ty - R - 0.1, tz0 + 0.2], { seg: 6 });                         // drain valve
  k.tube(DM, [[0, ty - R + 0.05, tz0 + 0.1], [0, fy + 0.15, boomZ + 0.15], [0, boomY - 0.05, boomZ + 0.05]], 0.03, { seg: 5 });   // feed to the boom

  // --- hose reel + pump at the front of the frame -----------------------------------------------------------------
  const rz = fz1 - 0.25, ry = fy + 0.42;
  for (const sx of [1, -1]) k.box(DM, [0.05, 0.42, 0.06], [sx * 0.24, fy + 0.25, rz], { bevel: 0 });
  k.cyl(Y, 0.24, 0.04, [0.2, ry, rz], { axis: 'x', seg: 14 });
  k.cyl(Y, 0.24, 0.04, [-0.2, ry, rz], { axis: 'x', seg: 14 });
  k.cyl(Y, 0.17, 0.36, [0, ry, rz], { axis: 'x', seg: 12 });
  for (let i = 0; i < 6; i++) k.cyl('yellowDark', 0.175, 0.025, [-0.15 + i * 0.06, ry, rz], { axis: 'x', seg: 12 });   // hose coils
  k.box(DM, [0.3, 0.2, 0.22], [-0.42, fy + 0.18, rz], { bevel: 0.03 });                  // pump
  k.tube(Y, [[0, ry - 0.17, rz + 0.05], [-0.25, fy + 0.2, rz + 0.12], [-0.3, fy + 0.25, rz]], 0.025, { seg: 5 });

  // --- tongue + stand ------------------------------------------------------------------------------------------------
  const [hX, hY, hZ] = def.hitch;
  for (const sx of [1, -1]) k.tube(DM, [[sx * (fx - 0.12), fy, fz1 - 0.05], [hX + sx * 0.06, hY, hZ - 0.42]], 0.045, { seg: 6 });
  k.box(DM, [0.12, 0.1, 0.46], [hX, hY, hZ - 0.23], { bevel: 0.02 });
  const eye = new THREE.TorusGeometry(0.075, 0.025, 5, 12); eye.rotateX(Math.PI / 2); eye.translate(hX, hY, hZ);
  const standZ = hZ - 0.6;
  k.box(DM, [0.06, hY - ground - 0.12, 0.06], [hX + 0.08, (hY + ground + 0.12) / 2, standZ], { bevel: 0 });
  k.box(DM, [0.18, 0.03, 0.14], [hX + 0.08, ground + 0.12, standZ], { bevel: 0 });

  // --- boom: centre mount + two arms with a truss, nozzles underneath -------------------------------------------------
  k.box(DM, [0.3, 0.6, 0.12], [0, boomY + 0.12, boomZ], { bevel: 0.02 });                // mount plate
  k.box(DM, [0.12, 0.16, 0.3], [0, boomY, boomZ + 0.15], { bevel: 0.02 });
  const hw = sp.hw;
  for (const sx of [1, -1]) {
    k.box(DM, [hw, 0.05, 0.05], [sx * hw / 2, boomY, boomZ], { bevel: 0 });               // bottom rail (the spray bar)
    k.tube(DM, [[sx * 0.15, boomY + 0.4, boomZ], [sx * hw * 0.55, boomY + 0.12, boomZ], [sx * hw, boomY + 0.03, boomZ]], 0.022, { seg: 4 });   // top chord
    for (const f of [0.2, 0.38, 0.55]) k.tube(DM, [[sx * hw * f, boomY, boomZ], [sx * hw * (f + 0.12), boomY + 0.4 * (1 - (f + 0.12) / 0.55) * 0.7 + 0.08, boomZ]], 0.015, { seg: 4 });
    k.box('amber', [0.06, 0.06, 0.06], [sx * hw, boomY + 0.06, boomZ], { bevel: 0 });        // end markers
  }
  const nozzles = [];
  const nN = 11;
  for (let i = 0; i < nN; i++) {
    const x = -hw + 0.12 + i * (hw * 2 - 0.24) / (nN - 1);
    k.box(K, [0.04, 0.1, 0.04], [x, boomY - 0.06, boomZ], { bevel: 0 });
    nozzles.push(x);
  }

  // --- wheels ---------------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 16, rimCol: DM, rim: 0.55 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  // --- mist: drops falling out of each nozzle in a widening cone -------------------------------------------------
  const D = 14, n = nN * D, pos = new Float32Array(n * 3), seedA = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { seedA[i * 2] = Math.random(); seedA[i * 2 + 1] = Math.random() * Math.PI * 2; }
  const mist = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), mistMat(THREE));
  mist.visible = false; mist.frustumCulled = false; mist.userData.detail = true;

  k.finish(group);
  group.add(new THREE.Mesh(eye, k.mat(DM)), mist);
  return {
    group, wheels, mist,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.spin.rotation.x = w.spin || 0;
      });
      const on = !!st.acts?.door_spray;
      mist.visible = on && (group.userData.near !== false);
      if (!mist.visible) return;
      const t = st.t ?? performance.now() / 1000, h = boomY - 0.11 - ground;
      for (let i = 0; i < n; i++) {
        const x = nozzles[(i / D) | 0], f = (t * 1.8 + seedA[i * 2]) % 1, a = seedA[i * 2 + 1], r = f * 0.32;
        pos[i * 3] = x + Math.cos(a) * r;
        pos[i * 3 + 1] = boomY - 0.11 - f * h;
        pos[i * 3 + 2] = boomZ + Math.sin(a) * r - f * 0.1;
      }
      mist.geometry.attributes.position.needsUpdate = true;
    },
  };
}

let MIST = null;
function mistMat(THREE) { return MIST || (MIST = new THREE.PointsMaterial({ color: '#dff1ff', size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false })); }
