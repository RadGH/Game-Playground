// Parcel Van (reference: assets/ref/delivery_van.webp — recoloured TEAL with a cream stripe: the sheet's brown-and-
// gold is a well-known parcel company's livery, and vehicles here never borrow one). A tall box van: a short bonnet
// with a black grille and lamps, a big windscreen, cab doors with windows (you get in through the seat), a box body
// with roof ribs, a SLIDING side door on the right (`side`: slides out then back along the body while
// st.acts.door_side is on, ending where the `open` collider is) and two BACK doors (`rearL`, `rearR`: hinged at the
// outer edges, swung flat against the sides from st.acts.door_rear). Inside: a dark floor, the rear wheel arches and
// two grey shelves along the left wall (the same boxes as the colliders, so parcels — prop crates — sit on what you
// see). A rear step bumper and a running board under the side door (each a step the walker can climb). No words.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const B = 'teal', BD = 'tealDark', C = 'cream', K = 'black', T = 'trim', G = 'steel';
  const ch = def.chassis, P = n => def.parts.find(p => p._doc?.startsWith(n));
  const floor = ch.p[1] + ch.hy;                                          // -0.04
  const roof = def.parts[1], roofY = roof.p[1] - roof.box[1];            // 2.07 (inside)
  const top = roofY + 0.1;
  const rearZ = -ch.hz, boxZ1 = 0.45, cabZ1 = 1.95, noseZ = ch.hz;       // -2.65, 0.45, 1.95, 2.65
  const wx = 0.96;                                                        // outer skin
  const drv = def.seats[0];
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const side = def.parts.find(p => p.door === 'side'), sz0 = side.p[2] - side.box[2], sz1 = side.p[2] + side.box[2];   // -1.45..0.05

  // --- underbody, bumpers, steps ---------------------------------------------------------------------------------
  k.box(K, [wx * 2 - 0.04, floor - (ch.p[1] - ch.hy), noseZ - rearZ], [0, (floor + ch.p[1] - ch.hy) / 2, 0], { bevel: 0.03 });
  const step = def.parts.find(p => p._doc?.startsWith('rear step')), board = def.parts.find(p => p._doc?.startsWith('running board'));
  k.box(K, [step.box[0] * 2 + 0.2, 0.08, step.box[2] * 2], [step.p[0], step.p[1] - 0.01, step.p[2]], { bevel: 0.02 });
  k.box(T, [step.box[0] * 2, 0.012, step.box[2] * 2 - 0.06], [step.p[0], step.p[1] + 0.03, step.p[2]], { bevel: 0 });
  k.box(K, [board.box[0] * 2, 0.06, board.box[2] * 2], [board.p[0], board.p[1] - 0.01, board.p[2]], { bevel: 0.015 });
  for (const sx of [1, -1]) k.box(K, [0.08, 0.06, 0.1], [sx * 0.4, step.p[1] + 0.02, rearZ - 0.02], { bevel: 0 });   // step brackets
  k.box(K, [wx * 2 + 0.04, 0.26, 0.18], [0, 0.0, noseZ + 0.04], { bevel: 0.04 });                         // front bumper

  // --- box body: left wall, right wall pieces around the door, roof with ribs, rear frame, stripe ----------------------
  const wallH = top - floor, wallY = (top + floor) / 2;
  k.box(B, [0.06, wallH, boxZ1 - rearZ], [wx - 0.03, wallY, (boxZ1 + rearZ) / 2], { bevel: 0.03 });
  k.box(B, [0.06, wallH, sz0 - rearZ], [-(wx - 0.03), wallY, (sz0 + rearZ) / 2], { bevel: 0.03 });
  k.box(B, [0.06, wallH, boxZ1 - sz1], [-(wx - 0.03), wallY, (boxZ1 + sz1) / 2], { bevel: 0.02 });
  k.box(B, [wx * 2 + 0.04, 0.12, cabZ1 - rearZ + 0.05], [0, top + 0.02, (cabZ1 + rearZ) / 2], { bevel: 0.05 });     // roof
  for (let i = 0; i < 5; i++) k.box(BD, [wx * 2 - 0.2, 0.03, 0.08], [0, top + 0.09, rearZ + 0.35 + i * 0.6], { bevel: 0.01 });
  for (const sx of [1, -1]) {
    k.box(BD, [0.1, wallH, 0.1], [sx * (wx - 0.04), wallY, rearZ + 0.02], { bevel: 0.02 });               // rear corner posts
    k.box('tail', [0.06, 0.3, 0.05], [sx * (wx - 0.03), floor + 0.35, rearZ - 0.03], { bevel: 0.01 });
    k.box('amber', [0.06, 0.1, 0.05], [sx * (wx - 0.03), floor + 0.13, rearZ - 0.03], { bevel: 0 });
    for (let z = rearZ + 0.5; z < boxZ1 - 0.1; z += 0.62) {                                               // vertical ribs
      if (sx < 0 && z > sz0 - 0.05 && z < sz1 + 0.05) continue;
      k.box(BD, [0.02, wallH - 0.3, 0.05], [sx * (wx + 0.005), wallY, z], { bevel: 0 });
    }
  }
  k.box(BD, [wx * 2, 0.12, 0.1], [0, top - 0.06, rearZ + 0.02], { bevel: 0.02 });                          // rear header
  const stripeY = floor + 1.0;
  k.box(C, [0.015, 0.14, boxZ1 - rearZ - 0.1], [wx + 0.006, stripeY, (boxZ1 + rearZ) / 2], { bevel: 0 });
  k.box(C, [0.015, 0.14, sz0 - rearZ - 0.1], [-wx - 0.006, stripeY, (sz0 + rearZ) / 2 + 0.05], { bevel: 0 });

  // --- cab: lower doors, pillars, windscreen frame, bonnet, grille, lamps, mirrors --------------------------------
  const belt = drv.p[1] + 0.5, cabTop = top - 0.05;
  const bon = def.parts[0], bonTop = bon.p[1] + bon.box[1];               // 0.8
  const wsBot = [bonTop + 0.06, cabZ1 + 0.25], wsTop = [cabTop - 0.05, cabZ1 - 0.05];   // windscreen (y, z) ends
  for (const sx of [1, -1]) {
    k.box(B, [0.06, belt - floor, cabZ1 - boxZ1 + 0.2], [sx * (wx - 0.03), (belt + floor) / 2, (cabZ1 + boxZ1 + 0.2) / 2], { bevel: 0.03 });   // door
    k.box(K, [0.02, belt - floor - 0.2, 0.02], [sx * (wx + 0.005), (belt + floor) / 2, boxZ1 + 0.05], { bevel: 0 });
    k.box(K, [0.03, 0.04, 0.14], [sx * (wx + 0.01), belt - 0.12, boxZ1 + 0.25], { bevel: 0 });
    k.box(B, [0.08, cabTop - belt, 0.1], [sx * (wx - 0.04), (cabTop + belt) / 2, boxZ1 + 0.02], { bevel: 0.02 });   // B pillar
    const L = Math.hypot(wsTop[0] - wsBot[0], wsTop[1] - wsBot[1]), a = Math.atan2(wsTop[1] - wsBot[1], wsTop[0] - wsBot[0]);
    k.box(B, [0.09, L, 0.09], [sx * (wx - 0.05), (wsTop[0] + wsBot[0]) / 2, (wsTop[1] + wsBot[1]) / 2], { rot: [a, 0, 0], bevel: 0.02 });   // A pillar
    k.box(B, [0.06, bonTop - floor + 0.06, noseZ - cabZ1 + 0.15], [sx * (wx - 0.03), (bonTop + floor + 0.06) / 2, (noseZ + cabZ1 - 0.15) / 2], { bevel: 0.03 });   // front wing
    k.box('lamp', [0.22, 0.14, 0.04], [sx * (wx - 0.2), bonTop - 0.2, noseZ + 0.01], { bevel: 0.02 });
    k.box('amber', [0.1, 0.06, 0.04], [sx * (wx - 0.2), bonTop - 0.34, noseZ + 0.01], { bevel: 0.01 });
    k.tube(K, [[sx * wx, belt + 0.05, cabZ1 - 0.05], [sx * (wx + 0.22), belt + 0.08, cabZ1 - 0.05], [sx * (wx + 0.22), belt + 0.4, cabZ1 - 0.05]], 0.02, { seg: 4 });
    k.box(K, [0.06, 0.38, 0.16], [sx * (wx + 0.24), belt + 0.3, cabZ1 - 0.05], { bevel: 0.02 });
    k.box(C, [0.015, 0.14, cabZ1 - boxZ1], [sx * (wx + 0.006), stripeY - 0.2, (cabZ1 + boxZ1) / 2 + 0.1], { bevel: 0 });   // stripe carries on low
  }
  k.wedge(B, [wx * 2 - 0.06, bonTop - floor + 0.04, bonTop - floor - 0.1, noseZ - cabZ1 - 0.2], [0, floor, (noseZ + cabZ1 + 0.2) / 2]);   // bonnet, sloping to the nose
  k.box(K, [wx * 1.1, 0.34, 0.04], [0, bonTop - 0.32, noseZ + 0.01], { bevel: 0.02 });                       // grille
  for (let i = 0; i < 3; i++) k.box(T, [wx * 1.0, 0.03, 0.02], [0, bonTop - 0.42 + i * 0.1, noseZ + 0.035], { bevel: 0 });
  k.box(B, [wx * 2, 0.12, 0.3], [0, cabTop + 0.0, cabZ1 - 0.1], { bevel: 0.04 });                           // brow over the windscreen
  // wheel arches (outside) + the rear arches inside the box (same as the colliders)
  for (const w of def.wheels) {
    const [x, y, z] = w.p, hub = y + 0.15, Rr = w.r + 0.07;
    for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6; k.box(K, [w.w + 0.08, 0.05, Rr * 0.6], [x, hub + Math.cos(a) * Rr, z + Math.sin(a) * Rr], { rot: [a, 0, 0], bevel: 0.01 }); }
  }
  for (const p of def.parts.filter(p => p._doc?.startsWith('wheel arch') || p.arch)) k.box(T, p.box.map(v => v * 2), p.p, { bevel: 0.03 });
  // floor, shelves with uprights
  k.box('deck', [wx * 2 - 0.14, 0.02, cabZ1 - rearZ - 0.1], [0, floor - 0.008, (cabZ1 + rearZ) / 2], { bevel: 0 });
  const shelves = def.parts.filter(p => p._doc?.startsWith('shelves') || (p.box[1] < 0.03 && p.box[0] < 0.25 && p.p[1] > 0.3));
  for (const s of shelves) k.box(G, s.box.map(v => v * 2), s.p, { bevel: 0.005 });
  if (shelves.length) {
    const s = shelves[0], x = s.p[0] - s.box[0] + 0.03, hiY = Math.max(...shelves.map(q => q.p[1])) + 0.05;
    for (const z of [s.p[2] - s.box[2] + 0.03, s.p[2], s.p[2] + s.box[2] - 0.03]) k.box(G, [0.04, hiY - floor, 0.04], [x, (hiY + floor) / 2, z], { bevel: 0 });
  }
  // dash, seats, steering column
  const W = drv.wheelAt;
  k.box(T, [wx * 2 - 0.12, 0.35, 0.4], [0, bonTop + 0.0, cabZ1 + 0.02], { bevel: 0.05 });
  k.box(T, [wx * 2 - 0.2, 0.22, cabZ1 - W[2] - 0.15], [0, bonTop - 0.08, (cabZ1 + W[2] + 0.15) / 2], { bevel: 0.04 });   // dash shelf back toward the driver
  k.tube(T, [[W[0], W[1] - 0.03, W[2] + 0.02], [W[0], bonTop - 0.12, W[2] + 0.3]], 0.03, { seg: 6 });
  for (const sx of [1, -1]) k.box(T, [0.34, fw.p[1] + 0.06 + fw.r + 0.04 - floor, 0.86], [sx * 0.7, (fw.p[1] + 0.06 + fw.r + 0.04 + floor) / 2, fw.p[2]], { bevel: 0.04 });   // front wheel boxes in the footwell
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box('seat', [0.48, y - 0.06 - floor, 0.46], [x, (y - 0.06 + floor) / 2, z + 0.02], { bevel: 0.04 });
    k.box('seat', [0.48, 0.66, 0.11], [x, y + 0.3, z - 0.26], { rot: [-0.12, 0, 0], bevel: 0.04 });
  }
  // glass: windscreen + cab side windows
  const gl = [];
  {
    const L = Math.hypot(wsTop[0] - wsBot[0], wsTop[1] - wsBot[1]), a = Math.atan2(wsTop[1] - wsBot[1], wsTop[0] - wsBot[0]);
    const g = new THREE.BoxGeometry(wx * 2 - 0.16, L, 0.02); g.rotateX(a); g.translate(0, (wsTop[0] + wsBot[0]) / 2, (wsTop[1] + wsBot[1]) / 2); gl.push(g);
    for (const sx of [1, -1]) { const s = new THREE.BoxGeometry(0.02, cabTop - belt - 0.05, cabZ1 - boxZ1 - 0.15); s.translate(sx * (wx - 0.03), (cabTop + belt) / 2, (cabZ1 + boxZ1) / 2 + 0.02); gl.push(s); }
  }
  const glass = new THREE.Mesh(mergeAll(THREE, gl), k.mat('glass'));
  glass.renderOrder = 2;

  // --- moving doors -------------------------------------------------------------------------------------------------
  const sideDoor = new THREE.Group();
  const dk = createKit(THREE, opts);
  dk.box(B, [0.05, wallH - 0.04, sz1 - sz0 - 0.02], [-(wx + 0.01), wallY, (sz0 + sz1) / 2], { bevel: 0.02 });
  dk.box(C, [0.015, 0.14, sz1 - sz0 - 0.1], [-wx - 0.04, stripeY, (sz0 + sz1) / 2], { bevel: 0 });
  dk.box(K, [0.04, 0.2, 0.05], [-wx - 0.04, stripeY - 0.25, sz1 - 0.12], { bevel: 0.01 });               // handle
  dk.box(BD, [0.02, 0.4, sz1 - sz0 - 0.3], [-wx - 0.04, top - 0.45, (sz0 + sz1) / 2], { bevel: 0 });   // window panel line
  dk.finish(sideDoor);
  const sideOpen = def.parts.find(p => p.door === 'side').open;
  const sideTo = [sideOpen.p[0] - side.p[0], sideOpen.p[2] - side.p[2]];   // (-0.12, -1.25)
  const rears = [];
  for (const sx of [1, -1]) {
    const g = new THREE.Group(); g.position.set(sx * (wx - 0.02), 0, rearZ - 0.02);
    const rk = createKit(THREE, opts);
    rk.box(B, [wx - 0.03, wallH - 0.1, 0.05], [-sx * (wx - 0.03) / 2, wallY, 0], { bevel: 0.02 });
    rk.box(BD, [wx - 0.25, 0.5, 0.02], [-sx * (wx - 0.03) / 2, top - 0.5, -0.03], { bevel: 0 });
    rk.box(K, [0.05, 0.18, 0.04], [-sx * (wx - 0.12), stripeY - 0.2, -0.04], { bevel: 0.01 });
    for (const y of [floor + 0.3, top - 0.3]) rk.box(T, [0.08, 0.1, 0.06], [0, y, -0.02], { bevel: 0.01 });   // hinges
    rk.finish(g);
    rears.push({ g, sx });
  }

  // --- wheels + steering wheel ------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', knobs: 16, rimCol: 'metal', rim: 0.6 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  const steer = new THREE.Group(); steer.position.set(...W); steer.rotation.x = -0.45;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.022, 0.022], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.04, 0.05, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 5, 14), k.mat(K)));
  steer.traverse(o => { o.userData.detail = true; });

  k.finish(group);
  group.add(glass, steer, sideDoor, ...rears.map(r => r.g));
  let sideT = 0, rearT = 0, lastT = null;
  return {
    group, wheels, steer, sideDoor, rearDoors: rears.map(r => r.g),
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.11) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
      const t = st.t ?? performance.now() / 1000;
      const dt = lastT == null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const ease = (v, on) => v + Math.max(-dt * 1.4, Math.min(dt * 1.4, (on ? 1 : 0) - v));
      sideT = ease(sideT, st.acts?.door_side); rearT = ease(rearT, st.acts?.door_rear);
      // slide: out sideways first, then back along the body
      sideDoor.position.set(sideTo[0] * Math.min(1, sideT * 4), 0, sideTo[1] * Math.max(0, (sideT - 0.2) / 0.8));
      for (const r of rears) r.g.rotation.y = -r.sx * rearT * 1.6;
    },
  };
}

function mergeAll(THREE, gs) {
  const list = gs.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
