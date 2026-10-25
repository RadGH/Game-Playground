// Utility Trailer (reference: assets/ref/trailer_utility.webp). An open olive box on a steel frame: plank sides with
// dark corner posts, a dark plank floor, round fenders over two road wheels with silver rims, an A-frame tongue to a
// ball coupler at def.hitch and a small jockey wheel (stowed high, so it never pokes through the ground when towed).
// The walls match the physics `parts` boxes exactly, so cargo sits inside what you see.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const G = 'olive', P = 'steel', D = 'deck';
  const ch = def.chassis;
  const top = ch.p[1] + ch.hy;                     // floor surface, 0.12
  const wallTop = 0.52, wallBot = 0.08, hx = ch.hx, hz = ch.hz;

  // floor: planks + the frame under it
  for (let i = 0; i < 6; i++) k.box(D, [hx * 2 - 0.04, 0.05, (hz * 2) / 6 - 0.02], [0, top - 0.025, -hz + (i + 0.5) * (hz * 2 / 6)], { bevel: 0.008 });
  k.box(P, [hx * 2, 0.16, hz * 2], [0, top - 0.13, 0], { bevel: 0.02 });
  for (const sx of [1, -1]) k.box(P, [0.08, 0.1, hz * 2 + 0.1], [sx * (hx - 0.1), top - 0.26, 0], { bevel: 0.01 });
  k.box(P, [hx * 2 - 0.1, 0.08, 0.1], [0, top - 0.24, def.wheels[0].p[2]], { bevel: 0.01 });    // axle beam

  // walls: three planks a side (a lighter line between them), corner posts
  const wh = wallTop - wallBot, plank = wh / 3;
  const wall = (w, d, x, z) => {
    for (let i = 0; i < 3; i++) k.box(i % 2 ? 'olivePale' : G, [w, plank - 0.012, d], [x, wallBot + plank * (i + 0.5), z], { bevel: 0.008 });
  };
  wall(hx * 2 - 0.08, 0.06, 0, hz - 0.02); wall(hx * 2 - 0.08, 0.06, 0, -hz + 0.02);
  wall(0.06, hz * 2 - 0.08, hx - 0.03, 0); wall(0.06, hz * 2 - 0.08, -hx + 0.03, 0);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    k.box('trim', [0.1, wh + 0.08, 0.1], [sx * (hx - 0.02), (wallTop + wallBot) / 2, sz * (hz - 0.02)], { bevel: 0.015 });
    k.box('trim', [0.11, 0.04, 0.11], [sx * (hx - 0.02), wallTop + 0.04, sz * (hz - 0.02)], { bevel: 0.01 });
  }
  for (const sx of [1, -1]) k.box('tail', [0.05, 0.08, 0.1], [sx * (hx - 0.12), top - 0.12, -hz - 0.03], { bevel: 0 });

  // fenders: a curved arch over each wheel (five short angled slats), plus a mud flap
  for (const w of def.wheels) {
    const [x, y, z] = w.p, hubY = y + 0.06, R = w.r + 0.08;
    for (let i = 0; i < 5; i++) {
      const a = -1.15 + i * (2.3 / 4);
      k.box('trim', [w.w + 0.08, 0.04, R * 0.52], [x, hubY + Math.cos(a) * R, z + Math.sin(a) * R], { rot: [a, 0, 0], bevel: 0.01 });
    }
    k.box('trim', [w.w + 0.02, 0.16, 0.02], [x, hubY - 0.02, z - R + 0.01], { bevel: 0 });
    k.box(P, [Math.abs(x) - hx + 0.06, 0.06, 0.12], [x - Math.sign(x) * (Math.abs(x) - hx) / 2, top - 0.22, z], { bevel: 0 });   // stub axle
  }

  // tongue: an A-frame from the front corners to the coupler, with a ball socket at the hitch point
  const [hx0, hy0, hz0] = def.hitch;
  const tY = top - 0.17;
  k.tube(P, [[hx - 0.15, tY, hz - 0.05], [hx0, hy0, hz0 - 0.28]], 0.035, { seg: 6 });
  k.tube(P, [[-hx + 0.15, tY, hz - 0.05], [hx0, hy0, hz0 - 0.28]], 0.035, { seg: 6 });
  k.box(P, [0.09, 0.08, 0.34], [hx0, hy0, hz0 - 0.15], { bevel: 0.015 });
  k.sphere('chrome', 0.055, [hx0, hy0 + 0.01, hz0], { seg: 10 });
  // jockey wheel: a post through a clamp, a little wheel at its foot (raised: its bottom sits 7 cm off the ground)
  const jx = 0.1, jz = hz0 - 0.5;
  k.cyl(P, 0.03, 0.5, [jx, hy0 - 0.06, jz], { seg: 8 });
  k.cyl('trim', 0.035, 0.08, [jx, hy0 + 0.22, jz], { seg: 8 });
  k.box('trim', [0.1, 0.02, 0.02], [jx, hy0 + 0.27, jz], { bevel: 0 });
  k.box(P, [0.03, 0.08, 0.06], [jx, hy0 - 0.3, jz], { bevel: 0 });
  k.cyl('rubber', 0.06, 0.04, [jx, hy0 - 0.33, jz], { axis: 'x', seg: 10 });

  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', knobs: 18, rimCol: 'metal', rim: 0.6 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  k.finish(group);
  return {
    group, wheels,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.spin.rotation.x = w.spin || 0;
      });
    },
  };
}
