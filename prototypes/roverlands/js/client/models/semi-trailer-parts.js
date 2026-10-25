// Shared running gear for the semi-trailers (box, flatbed, tanker): twin under-beams, the kingpin plate at
// def.hitch, a tandem bogie with mudguard quarters and flaps, an under-ride bar with a tow eye at def.tow, tail lamps,
// and the landing legs. Not a vehicle (no data entry has this id): each trailer model imports it.
//
// Wheels with `leg: 1` in the data are the landing legs: physics treats them as small wheels, the model draws a
// square outer leg fixed to the frame and an inner leg + foot pad that rides up and down with that "wheel"
// (so the pad is always where the physics thinks the ground contact is).
import { createKit } from './kit.js';

/**
 * Add the frame + running gear to kit `k`. Returns the `wheels` list a model's update() drives (legs included, in
 * def.wheels order) and the moving groups it added to `group` (call before k.finish(group)).
 * opts: { width: half-width of the side sill, sill: colour for the side sill (or null to skip it), markers: bool }
 */
export function semiTrailerGear(THREE, k, group, def, kitOpts, { width = 1.2, sill = 'trim', markers = true } = {}) {
  const ch = def.chassis;
  const top = ch.p[1] + ch.hy, bot = ch.p[1] - ch.hy;      // deck top 0, underside -0.2
  const hz = ch.hz;
  const K = 'trim', S = 'steel';
  const tyres = def.wheels.filter(w => !w.leg), legs = def.wheels.filter(w => w.leg);

  // --- under-beams: two deep beams the length of the trailer, with cross members ---------------------------------
  for (const sx of [1, -1]) {
    k.box(K, [0.12, 0.22, hz * 2 - 0.3], [sx * 0.48, bot - 0.11, -0.05], { bevel: 0.015 });
    k.box(K, [0.22, 0.03, hz * 2 - 0.3], [sx * 0.48, bot - 0.22, -0.05], { bevel: 0 });   // bottom flange
  }
  for (let z = -hz + 0.6; z < hz - 0.3; z += 1.1) k.box(K, [0.9, 0.08, 0.08], [0, bot - 0.06, z], { bevel: 0 });
  if (sill) {
    for (const sx of [1, -1]) k.box(sill, [0.08, 0.2, hz * 2], [sx * (width - 0.04), bot + 0.08, 0], { bevel: 0.015 });
  }
  if (markers) {
    for (const sx of [1, -1]) for (let z = -hz + 0.9; z < hz; z += 1.25) k.box('amber', [0.03, 0.05, 0.1], [sx * (width + 0.005), bot + 0.08, z], { bevel: 0 });
  }

  // --- kingpin: a skid plate under the nose, the pin at def.hitch ------------------------------------------------
  const [hx0, hy0, hzk] = def.hitch;
  k.box(S, [1.3, 0.03, 1.4], [0, bot - 0.015, hzk], { bevel: 0.01 });
  k.cyl(S, 0.06, 0.09, [hx0, bot - 0.06, hzk], { seg: 8 });
  void hy0;

  // --- bogie: hangers, axles, mudguard quarters, flaps --------------------------------------------------------------
  const axles = [...new Set(tyres.map(w => w.p[2]))].sort((a, b) => b - a);
  const wy = tyres[0].p[1], wr = tyres[0].r, ww = tyres[0].w;
  const bz0 = Math.min(...axles) - wr - 0.1, bz1 = Math.max(...axles) + wr + 0.1;
  for (const sx of [1, -1]) {
    k.box(K, [0.14, 0.12, bz1 - bz0 + 0.2], [sx * 0.82, bot - 0.06, (bz0 + bz1) / 2], { bevel: 0.015 });      // bogie rail
    for (const z of axles) {
      k.box(K, [0.1, 0.32, 0.14], [sx * 0.82, bot - 0.22, z], { bevel: 0.01 });          // hanger
      k.box(S, [0.08, 0.05, 0.9], [sx * 0.82, wy + 0.1, z], { bevel: 0.01 });           // leaf spring
    }
    const x = sx * 1.05;
    // quarter guards ahead of the first tyre and behind the last, a flap at the back
    k.box(K, [ww + 0.06, 0.04, 0.42], [x, wy + wr * 0.62, bz1 - 0.08], { rot: [0.75, 0, 0], bevel: 0.01 });
    k.box(K, [ww + 0.06, 0.04, 0.42], [x, wy + wr * 0.62, bz0 + 0.08], { rot: [-0.75, 0, 0], bevel: 0.01 });
    k.box(K, [ww + 0.04, 0.04, bz1 - bz0 - 0.5], [x, bot - 0.02, (bz0 + bz1) / 2], { bevel: 0.01 });   // flat guard under the sill
    k.box('rubber', [ww + 0.04, 0.42, 0.025], [x, wy - 0.12, bz0 - 0.02], { bevel: 0 });
  }
  for (const z of axles) k.box(S, [1.9, 0.1, 0.1], [0, wy + 0.04, z], { bevel: 0.01 });

  // --- rear: under-ride bar + tow eye at def.tow, tail lamps -------------------------------------------------------
  const [, ty, tz] = def.tow;
  const barY = ty - 0.2;
  for (const sx of [1, -1]) k.box(K, [0.08, bot - barY, 0.08], [sx * 0.75, (bot + barY) / 2, -hz + 0.02], { bevel: 0 });
  k.box(K, [2.0, 0.12, 0.1], [0, barY, -hz + 0.02], { bevel: 0.02 });
  for (const sx of [1, -1]) k.box('tail', [0.06, 0.06, 0.02], [sx * 0.9, barY, -hz - 0.04], { bevel: 0 });
  k.box(S, [0.12, ty - barY + 0.05, 0.12], [0, (ty + barY) / 2, -hz + 0.02], { bevel: 0.01 });
  k.box(S, [0.1, 0.06, Math.abs(tz + hz) + 0.1], [0, ty, (tz - hz) / 2], { bevel: 0 });
  k.cyl(S, 0.06, 0.05, [0, ty, tz], { seg: 8 });
  for (const sx of [1, -1]) {
    k.box(K, [0.34, 0.14, 0.05], [sx * (width - 0.22), bot + 0.02, -hz - 0.03], { bevel: 0.01 });
    k.box('tail', [0.14, 0.09, 0.03], [sx * (width - 0.29), bot + 0.02, -hz - 0.06], { bevel: 0 });
    k.box('amber', [0.1, 0.09, 0.03], [sx * (width - 0.13), bot + 0.02, -hz - 0.06], { bevel: 0 });
  }

  // --- landing legs: outer legs + bracing fixed, inner leg and foot ride with the "wheel" ---------------------------
  const legTop = bot;
  for (const w of legs) {
    const [x, y, z] = w.p;
    const outBot = y + 0.2;                                        // the outer leg stops 0.2 over the hub
    k.box(K, [0.15, legTop - outBot, 0.15], [x, (legTop + outBot) / 2, z], { bevel: 0.015 });
    k.box(K, [0.2, 0.04, 0.2], [x, outBot, z], { bevel: 0.01 });
    // diagonal brace back to the beams, and a cross tube between the two legs
    k.tube(K, [[x, outBot + 0.15, z], [Math.sign(x) * 0.48, bot - 0.15, z - 0.75]], 0.03, { seg: 5 });
  }
  if (legs.length === 2) {
    const [a, b] = legs;
    k.tube(K, [[a.p[0], a.p[1] + 0.35, a.p[2]], [b.p[0], b.p[1] + 0.35, b.p[2]]], 0.035, { seg: 6 });
    // crank handle and gearbox on the left leg
    const L = legs.find(l => l.p[0] > 0) || a;
    k.box(K, [0.1, 0.18, 0.2], [L.p[0] + 0.12, legTop - 0.25, L.p[2]], { bevel: 0.01 });
    k.tube(S, [[L.p[0] + 0.17, legTop - 0.25, L.p[2]], [L.p[0] + 0.3, legTop - 0.25, L.p[2]], [L.p[0] + 0.3, legTop - 0.45, L.p[2]]], 0.015, { seg: 4 });
  }

  // --- moving parts ------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    if (w.leg) {
      const g = new THREE.Group(); g.position.set(...w.p);
      const lk = createKit(THREE, kitOpts);
      lk.box(S, [0.11, 0.55, 0.11], [0, -w.r + 0.33, 0], { bevel: 0.01 });         // inner leg, slides inside the outer
      lk.box(K, [0.07, 0.08, 0.07], [0, -w.r + 0.06, 0], { bevel: 0 });
      lk.box(K, [0.3, 0.05, 0.3], [0, -w.r + 0.025, 0], { bevel: 0.015 });         // foot pad: its bottom = the contact
      lk.finish(g);
      group.add(g);
      return { group: g, spin: new THREE.Object3D(), base: w.p, leg: true };
    }
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 18, rimCol: 'metal', rim: 0.6 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  return { wheels, top, bot };
}

/** The update every semi-trailer shares: tyres ride and spin, leg feet ride. */
export function updateGear(wheels, st) {
  st.wheels?.forEach((w, i) => {
    const m = wheels[i]; if (!m) return;
    m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
    if (!m.leg) m.spin.rotation.x = w.spin || 0;
  });
}
