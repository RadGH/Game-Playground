// Soarwing Glider (reference: assets/ref/glider.webp). A hang glider: a swept delta sail in coral-red and white
// chordwise stripes over a silver keel and leading-edge tubes, a king post with top rigging, an A-frame control bar
// whose base bar sits at the pilot's chest (the hands' grips), side wires to the wing, and a tail fin + small tailplane
// on the end of the keel (on its collider). The pilot hangs seated in a black-and-red harness from the hang strap;
// under the base bar two light struts carry little landing wheels and a foot stirrup (seat.feet rests on it), and a
// skid wheel under the harness tail. No engine, no prop. Original look: the stripes run along the chord, not the sheet's.
import { createKit } from './kit.js';

const SAIL = new Map();
function sailMat(THREE, enhance, col) {
  if (!SAIL.has(col)) SAIL.set(col, enhance(new THREE.MeshStandardMaterial({ color: col, roughness: 0.62, metalness: 0.02, side: THREE.DoubleSide })));
  return SAIL.get(col);
}

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const enhance = opts.enhance || (m => m);
  const group = new THREE.Group();
  const RED = '#ec5a42', WHITE = '#f1efe9', S = 'chrome', K = 'black', HR = '#c8402e';
  const wing = def.parts[0], tail = def.parts[1];
  const keelY = wing.p[1] + 0.02, span = wing.box[0];                     // 1.62, 4.6
  const nose = [0, keelY, 1.75], tipL = [span, keelY - 0.14, -0.85], tipR = [-span, keelY - 0.14, -0.85];
  const keelBack = [0, keelY, -1.45], tailEnd = [0, keelY, tail.p[2] - tail.box[2] - 0.15];
  const seat = def.seats[0], [gx, gy, gz] = seat.grips[0];               // base bar: y 0.2, z 0.5
  const hang = [0, keelY - 0.08, 0.25];
  const corner = sx => [sx * 0.66, gy, gz];

  // --- the sail: stripe panels between the leading edge and the trailing edge, a little billow -------------------------
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const panels = { [RED]: [], [WHITE]: [] };
  const N = 9;
  for (const tip of [tipL, tipR]) for (let i = 0; i < N; i++) {
    const t0 = i / N, t1 = (i + 1) / N;
    const bil = t => 0.12 * Math.sin(Math.PI * t);                       // billow: the sail sits up between the tubes
    const L0 = lerp(nose, tip, t0), L1 = lerp(nose, tip, t1), T0 = lerp(keelBack, tip, t0), T1 = lerp(keelBack, tip, t1);
    const mid = (a, b, t) => { const m = lerp(a, b, 0.5); m[1] += bil(t); return m; };
    const M0 = mid(L0, T0, t0), M1 = mid(L1, T1, t1);
    panels[i % 2 ? WHITE : RED].push(L0, L1, M1, L0, M1, M0, M0, M1, T1, M0, T1, T0);
  }
  for (const [col, pts] of Object.entries(panels)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, sailMat(THREE, enhance, col)); m.castShadow = true; m.name = 'part:sail';
    group.add(m);
  }
  // leading edges, keel, cross bar, tips
  k.tube(S, [tipL, nose, tipR], 0.035, { seg: 6 });
  k.tube(S, [nose, tailEnd], 0.035, { seg: 6 });
  k.tube(S, [lerp(nose, tipL, 0.55), [0, keelY - 0.02, 0.15], lerp(nose, tipR, 0.55)], 0.025, { seg: 5 });
  for (const tip of [tipL, tipR]) k.sphere(S, 0.05, tip, { seg: 6 });
  k.cyl(S, 0.05, 0.12, nose, { axis: 'z', seg: 6, r2: 0.02 });

  // --- tail fin + tailplane on the keel (the tail collider) -------------------------------------------------------------
  const [thx, , thz] = tail.box;
  k.box(RED, [thx * 2, 0.025, thz * 2], [0, tail.p[1] - 0.02, tail.p[2]], { bevel: 0.01 });
  k.box(WHITE, [thx * 0.7, 0.03, thz * 2 - 0.02], [0, tail.p[1] - 0.015, tail.p[2]], { bevel: 0 });
  k.wedge(RED, [0.035, 0.75, 0.2, 0.6], [0, keelY + 0.01, tail.p[2] - 0.05]);
  k.box(WHITE, [0.04, 0.16, 0.42], [0, keelY + 0.32, tail.p[2] - 0.12], { rot: [0.35, 0, 0], bevel: 0 });

  // --- king post + rigging, A-frame, base bar, side wires --------------------------------------------------------------
  const king = [0, keelY + 0.75, 0.2];
  k.tube(S, [[0, keelY, 0.2], king], 0.022, { seg: 5 });
  for (const p of [nose, tipL, tipR, tailEnd]) k.tube('#9aa0a6', [king, p], 0.006, { seg: 3 });
  for (const sx of [1, -1]) k.tube(S, [hang, corner(sx)], 0.026, { seg: 6 });
  k.tube(S, [corner(1), corner(-1)], 0.028, { seg: 6 });
  for (const sx of [1, -1]) for (const p of [nose, sx > 0 ? tipL : tipR, tailEnd, lerp(nose, sx > 0 ? tipL : tipR, 0.5)]) k.tube('#9aa0a6', [corner(sx), p], 0.006, { seg: 3 });
  for (const x of [gx, -gx]) k.cyl(K, 0.032, 0.14, [x, gy, gz], { axis: 'x', seg: 6 });          // grip sleeves

  // --- landing struts, wheels, foot stirrup ---------------------------------------------------------------------------
  const wheelDefs = def.wheels;
  const feetY = seat.feet[1], feetZ = seat.p[2] + seat.feet[2];
  for (const w of wheelDefs.slice(0, 2)) {
    const sx = Math.sign(w.p[0]);
    k.tube(S, [corner(sx), [w.p[0], w.p[1] + 0.12, w.p[2]]], 0.02, { seg: 5 });
  }
  k.tube(K, [[0.5, feetY - 0.025, feetZ], [-0.5, feetY - 0.025, feetZ]], 0.025, { seg: 6 });         // stirrup bar under the boots
  k.box(K, [0.5, 0.012, 0.1], [0, feetY - 0.006, feetZ], { bevel: 0 });

  // --- harness + hang strap ------------------------------------------------------------------------------------------
  const [sxp, syp, szp] = seat.p;
  k.tube(K, [hang, [0, syp + 0.75, szp - 0.25]], 0.025, { seg: 4 });                                   // hang strap
  k.box(K, [0.46, 0.06, 0.44], [sxp, syp - 0.09, szp + 0.02], { bevel: 0.02 });                          // seat board
  k.box(K, [0.46, 0.7, 0.14], [sxp, syp + 0.28, szp - 0.21], { rot: [-0.2, 0, 0], bevel: 0.05 });        // back pad
  k.box(HR, [0.48, 0.5, 0.06], [sxp, syp + 0.25, szp - 0.29], { rot: [-0.2, 0, 0], bevel: 0.02 });       // red panel
  k.box(K, [0.34, 0.3, 0.5], [sxp, syp - 0.25, szp - 0.45], { rot: [0.5, 0, 0], bevel: 0.06 });         // harness tail
  for (const sx of [1, -1]) k.tube(K, [[sx * 0.2, syp + 0.6, szp - 0.25], [sx * 0.08, syp + 0.75, szp - 0.25]], 0.02, { seg: 4 });

  // wheels: two little ones on the struts, a skid wheel under the harness tail
  const wheels = wheelDefs.map((w, i) => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', rim: 0.5, rimCol: 'rim' });
    t.group.position.set(...w.p); group.add(t.group);
    if (i === 2) k.tube(K, [[0, syp - 0.32, szp - 0.62], [0, w.p[1] + 0.1, w.p[2]]], 0.018, { seg: 4 });
    return { ...t, base: w.p };
  });

  k.finish(group);
  return {
    group, wheels,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.05) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
    },
  };
}
