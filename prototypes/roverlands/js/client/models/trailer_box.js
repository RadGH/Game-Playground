// Box Trailer (reference: assets/ref/trailer_box.webp). A tall cream box with dark corner extrusions, a dark top
// rail and bottom sill with amber side markers, on the shared semi-trailer running gear (semi-trailer-parts.js).
// Every wall is drawn where its physics part is (sides x 1.15..1.35, roof y 2.30..2.46, front z 4.4..4.6).
// The rear door is ONE panel hinged at the floor's back edge: closed it stands in the doorway where the closed
// collider is; open (st.acts.door_rear) it swings down to lie exactly on the `open` ramp collider, so you walk up
// what you see. It swings over ~0.6 s; the physics swaps at once.
import { createKit } from './kit.js';
import { semiTrailerGear, updateGear } from './semi-trailer-parts.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const W = 'cream', T = 'trim';
  const P = def.parts;
  const side = P.find(p => !p.door && p.box[0] < 0.2), roof = P.find(p => p.box[1] < 0.1);
  const front = P.find(p => !p.door && p.box[2] < 0.2), door = P.find(p => p.door === 'rear');
  const ox = side.p[0] + side.box[0];                 // outer face 1.35
  const ix = side.p[0] - side.box[0];                 // inner face 1.15
  const zf = front.p[2] + front.box[2], zr = door.p[2] - door.box[2];     // 4.6 .. -4.7
  const roofTop = roof.p[1] + roof.box[1], wallTop = roof.p[1] - roof.box[1];   // 2.46, 2.30

  const { wheels, top, bot } = semiTrailerGear(THREE, k, group, def, opts, { width: ox, sill: null });

  // --- floor: dark planks on top of the chassis slab ----------------------------------------------------------------
  const hz = def.chassis.hz;
  k.box(T, [ix * 2, top - bot - 0.04, hz * 2], [0, (top + bot) / 2 - 0.02, 0], { bevel: 0.01 });
  for (let i = 0; i < 8; i++) k.box(i % 2 ? 'woodDark' : 'wood', [ix * 2 / 8 - 0.01, 0.04, hz * 2 - 0.02], [-ix + (i + 0.5) * (ix * 2 / 8), top - 0.02, 0], { bevel: 0.004 });

  // --- walls (cream panels with faint seams), roof, front ---------------------------------------------------------
  const wallH = wallTop - top;
  for (const sx of [1, -1]) {
    k.box(W, [ox - ix, wallH, hz * 2], [sx * (ox + ix) / 2, top + wallH / 2, 0], { bevel: 0.02 });
    for (let z = -hz + 1.5; z < hz - 0.5; z += 1.5) k.box('hullWhite', [0.01, wallH - 0.1, 0.03], [sx * (ox + 0.002), top + wallH / 2, z], { bevel: 0 });
    // bottom sill (dark, amber markers) and top rail
    k.box(T, [0.1, 0.3, zf - zr], [sx * (ox - 0.03), bot + 0.08, (zf + zr) / 2], { bevel: 0.015 });
    for (let z = -hz + 0.7; z < hz - 0.3; z += 1.15) k.box('amber', [0.03, 0.06, 0.12], [sx * (ox + 0.025), bot + 0.1, z], { bevel: 0 });
    k.box(T, [0.08, 0.1, zf - zr], [sx * (ox - 0.02), roofTop - 0.04, (zf + zr) / 2], { bevel: 0.015 });
  }
  k.box(W, [ox * 2 - 0.08, roofTop - wallTop, hz * 2], [0, (roofTop + wallTop) / 2, 0], { bevel: 0.02 });
  k.box(W, [ox * 2 - 0.04, roofTop - top, front.box[2] * 2], [0, (roofTop + top) / 2, front.p[2]], { bevel: 0.02 });
  k.box(T, [ox * 2, 0.12, 0.12], [0, roofTop - 0.04, zf - 0.04], { bevel: 0.015 });
  k.box(T, [ox * 2, 0.3, 0.12], [0, bot + 0.08, zf - 0.04], { bevel: 0.015 });
  for (const sx of [1, -1]) {
    k.box(T, [0.13, roofTop - bot + 0.02, 0.13], [sx * (ox - 0.04), (roofTop + bot) / 2, zf - 0.04], { bevel: 0.02 });   // front corner posts
    k.box(T, [0.15, 0.06, 0.15], [sx * (ox - 0.04), roofTop + 0.01, zf - 0.04], { bevel: 0.01 });
  }
  // air + light connectors on the nose
  k.box(T, [0.3, 0.16, 0.05], [0, top + 0.5, zf + 0.02], { bevel: 0.01 });
  for (const [dx, c] of [[-0.08, 'red'], [0.08, 'blue']]) k.cyl(c, 0.035, 0.06, [dx, top + 0.5, zf + 0.06], { axis: 'z', seg: 8 });

  // --- rear frame: posts, header, sill (the doorway is the closed door collider) -----------------------------------
  const rz = door.p[2], dHalf = door.box[0];             // -4.6, opening half-width 1.2
  const postW = ox - dHalf + 0.02;
  for (const sx of [1, -1]) {
    k.box(T, [postW, roofTop - bot + 0.02, -hz - zr + 0.02], [sx * (ox - postW / 2), (roofTop + bot) / 2, (-hz + zr) / 2], { bevel: 0.02 });
    k.box('steel', [0.03, 0.12, 0.05], [sx * (dHalf + 0.02), top + 0.4, zr - 0.02], { bevel: 0 });        // hinges
    k.box('steel', [0.03, 0.12, 0.05], [sx * (dHalf + 0.02), top + 1.9, zr - 0.02], { bevel: 0 });
  }
  const doorTop = door.p[1] + door.box[1];
  const dz = -hz - zr;
  k.box(T, [dHalf * 2, roofTop - doorTop + 0.16, dz], [0, (roofTop + doorTop - 0.16) / 2, (-hz + zr) / 2], { bevel: 0.015 });   // header
  k.box(T, [dHalf * 2, 0.06, dz], [0, bot - 0.03, (-hz + zr) / 2], { bevel: 0.01 });     // sill, low enough for the ramp to swing over
  for (const sx of [1, -1]) k.box('amber', [0.08, 0.05, 0.03], [sx * 0.5, roofTop - 0.08, zr - 0.02], { bevel: 0 });

  // --- the door / ramp ------------------------------------------------------------------------------------------------
  // Open pose = the `open` collider: centre C, tilted `rot[0]` about x, half-length L. Its high end is the hinge H.
  const O = door.open, L = O.box[2], th = O.box[1], ang = O.rot[0];
  const H = [O.p[0], O.p[1] + Math.sin(-ang) * L, O.p[2] + Math.cos(ang) * L];
  const hinge = new THREE.Group(); hinge.position.set(...H);
  const panel = new THREE.Group(); hinge.add(panel);
  const dk = createKit(THREE, opts);
  const dw = O.box[0] * 2;
  dk.box(W, [dw, th * 2, L * 2], [0, 0, -L], { bevel: 0.015 });
  dk.box(T, [dw + 0.04, th * 2 + 0.02, 0.06], [0, 0, -L * 2 + 0.03], { bevel: 0.01 });           // top edge (the ramp's toe)
  dk.box(T, [0.05, th * 2 + 0.01, L * 2], [0, 0, -L], { bevel: 0 });                           // centre seam
  for (let i = 1; i < 9; i++) dk.box('steel', [dw - 0.16, 0.02, 0.035], [0, th + 0.01, -i * (L * 2 / 9)], { bevel: 0 });   // ribs on the walking side
  for (const x of [-0.75, -0.3, 0.3, 0.75]) {                                                  // lock rods on the outside
    dk.cyl('steel', 0.02, L * 2 - 0.12, [x, -th - 0.025, -L], { axis: 'z', seg: 6 });
    dk.box('steel', [0.06, 0.04, 0.12], [x + 0.06, -th - 0.03, -L * 0.9], { bevel: 0 });
  }
  for (const sx of [1, -1]) dk.box('tail', [0.1, 0.03, 0.18], [sx * 0.95, -th - 0.015, -L * 0.25], { bevel: 0 });   // reflectors
  dk.finish(panel);
  // closed: the panel stands up from the hinge, set back so it sits where the closed collider is
  const closedAng = Math.PI / 2, closedOff = rz - H[2];          // local y offset -> world z when standing
  let open = null;
  let lastT = null;
  function pose(f) {                                     // f: 0 closed .. 1 open
    hinge.rotation.x = closedAng + (ang - closedAng) * f;
    panel.position.y = closedOff * (1 - f);
  }

  k.finish(group);
  group.add(hinge);
  pose(0);
  return {
    group, wheels, door: hinge,
    update(st) {
      updateGear(wheels, st);
      const want = st.acts?.door_rear ? 1 : 0;
      const now = st.t ?? null;
      if (open === null || now === null || lastT === null) open = want;
      else open += Math.sign(want - open) * Math.min(Math.abs(want - open), Math.max(0, now - lastT) / 0.6);
      lastT = now;
      // ease: the panel falls faster near the end, like a heavy door
      pose(open < 0.5 ? 2 * open * open : 1 - 2 * (1 - open) * (1 - open));
    },
  };
}
