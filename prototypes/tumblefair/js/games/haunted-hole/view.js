// HAUNTED HOLE, as drawn: a moonlit graveyard course (the shared Halloween dusk, a big moon behind, a crooked iron
// fence) on dark green felt with lavender stone rails. Tombstone Row: round-topped lavender tombstones with a smile and
// a sprig of flowers, and a friendly sheet ghost drifting across (it says "Boo!" and puffs a ball off line). Pumpkin
// Tunnel: a huge jack-o'-lantern sitting on the hedge; its grin is the way in, and a little pumpkin on the far side
// pops the ball out by the cup. Coffin Cup: the cup in a wooden coffin whose lid creaks (wobbles) and then shuts for a
// moment, again and again. Shared golf pieces (balls, clubs, aim line, meter, scorecard): js/games/golf-view.js.
import { createPuttView } from '../golf-view.js';
import { COFFIN, ghostAt } from './sim.js';
import { pumpkinGeo, stemGeo, ghostGeo, faceTexture, PALETTE } from '../../client/halloween.js';
import { floatText } from '../../client/gamehud.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }); mats.push(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  // ---- the moon and an iron fence round the course
  const moon = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4cf' })); moon.position.set(9, 9, -26); group.add(moon); mats.push(moon.material);
  const fenceN = 44, fence = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), std('#2a2338', { roughness: 0.5, metalness: 0.4 }), fenceN);
  for (let i = 0; i < fenceN; i++) { const back = i < 22, k = back ? i : i - 22, x = -10.5 + k * 1.0, z = back ? -6.4 : 6.6; m4.compose(v.set(x, 0.55, z), q.setFromEuler(e3.set(0, 0, ((i * 7) % 5 - 2) * 0.03)), sc.set(1, 1 + (k % 2) * 0.15, 1)); fence.setMatrixAt(i, m4); }
  fence.castShadow = true; group.add(fence);
  const faceTex = faceTexture(THREE), faceMat = new THREE.MeshBasicMaterial({ map: faceTex, transparent: true, depthWrite: false, toneMapped: false }); mats.push(faceMat);
  const pumpMat = std(PALETTE.pumpkin, { roughness: 0.55, emissive: '#b33a00', emissiveIntensity: 0.35 }), stemMat = std('#4c7a2a');
  const stoneMat = std('#b9a8d8', { roughness: 0.85 }), inkMat = std('#2a1f3d', { roughness: 0.5 }), woodMat = std('#7a4a2c', { roughness: 0.8 }), lidMat = std('#5e3a24', { roughness: 0.7 }), crossMat = std('#ffd36b', { roughness: 0.4, emissive: '#7a5a10', emissiveIntensity: 0.3 });
  let lid = null, lidT = 0;
  // round 12 (report #30): when the course is on show (your ball is in, between holes, the end) a soft moonlight comes
  // up so the dark corners can be seen. Always in the scene and only its strength changes (switching a light on and
  // off recompiles every shader).
  const moonlight = new THREE.HemisphereLight('#d9d2ff', '#3a3355', 0); group.add(moonlight);

  // ---- the ghost (outside the hole group: it lives across holes, shown when a hole has one)
  const ghost = new THREE.Group(); group.add(ghost); ghost.visible = false;
  const gbody = new THREE.Mesh(ghostGeo(THREE, 0.55), new THREE.MeshStandardMaterial({ color: '#f6f2ff', roughness: 0.35, transparent: true, opacity: 0.88, emissive: '#8f86c8', emissiveIntensity: 0.35 })); mats.push(gbody.material); ghost.add(gbody);
  for (const s of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), inkMat); eye.position.set(s * 0.17, 0.78, 0.47); eye.scale.set(1, 1.3, 0.6); ghost.add(eye); }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 6, 12, Math.PI), inkMat); smile.position.set(0, 0.6, 0.5); smile.rotation.z = Math.PI; ghost.add(smile);
  const gshadow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#1a1030', transparent: true, opacity: 0.35, depthWrite: false })); mats.push(gshadow.material); group.add(gshadow); gshadow.visible = false;
  let gx = 0, gz = 0, gOn = false, hasGhost = false, puff = 0;

  function tombstones(H, g) {
    const boxes = H.course.boxes || []; if (!boxes.length) return;
    const n = boxes.length, slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stoneMat, n), tops = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 18).rotateX(Math.PI / 2), stoneMat, n);      // a round top: the lower half sits inside the slab
    const flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 5), std('#ff9ad5', { emissive: '#7a2a5a', emissiveIntensity: 0.2 }), n * 2);
    boxes.forEach((b, i) => {
      const w = b.hw * 2, tall = 0.55 + (i % 3) * 0.12;
      m4.compose(v.set(b.x, tall / 2, b.z), q.identity(), sc.set(w, tall, b.hd * 2)); slabs.setMatrixAt(i, m4);
      m4.compose(v.set(b.x, tall, b.z), q.identity(), sc.set(w, w * 0.9, b.hd * 2)); tops.setMatrixAt(i, m4);
      for (const s of [0, 1]) { m4.compose(v.set(b.x + (s ? 0.18 : -0.22) * w, 0.07, b.z + b.hd + 0.08), q.identity(), sc.setScalar(1)); flowers.setMatrixAt(i * 2 + s, m4); }
    });
    slabs.castShadow = tops.castShadow = true; g.add(slabs, tops, flowers);
    // a smiling face on each stone (two dots and a curve, flat)
    const faceG = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshBasicMaterial({ map: stoneFace(), transparent: true, depthWrite: false }), n); mats.push(faceG.material);
    boxes.forEach((b, i) => { const tall = 0.55 + (i % 3) * 0.12; m4.compose(v.set(b.x, tall * 0.78, b.z + b.hd + 0.01), q.identity(), sc.set(b.hw * 2.1, b.hw * 2.1, 1)); faceG.setMatrixAt(i, m4); });
    g.add(faceG);
  }
  function stoneFace() {
    const c = document.createElement('canvas'); c.width = 96; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4a3a66'; x.beginPath(); x.arc(32, 22, 6, 0, 7); x.arc(64, 22, 6, 0, 7); x.fill();
    x.strokeStyle = '#4a3a66'; x.lineWidth = 6; x.lineCap = 'round'; x.beginPath(); x.arc(48, 30, 16, 0.35, Math.PI - 0.35); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  function bigPumpkin(H, g) {
    const T = H.tunnel; if (!T) return;
    const p = new THREE.Group(); p.position.set(T.x, 0, T.z - 0.3); g.add(p);
    const body = new THREE.Mesh(pumpkinGeo(THREE, 1.25), pumpMat); body.position.y = 0.85; body.castShadow = true; p.add(body);
    const stem = new THREE.Mesh(stemGeo(THREE, 1.25), stemMat); stem.position.y = 0.85; p.add(stem);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), faceMat); face.position.set(0, 0.95, 1.24); p.add(face);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.34), new THREE.MeshBasicMaterial({ color: '#ffb347', toneMapped: false })); mats.push(mouth.material); mouth.position.set(0, 0.17, 1.12); p.add(mouth);
    const out = new THREE.Group(); out.position.set(T.ox, 0, T.oz + 0.05); g.add(out);
    const small = new THREE.Mesh(pumpkinGeo(THREE, 0.5), pumpMat); small.position.y = 0.35; small.scale.set(1.2, 1, 0.8); out.add(small);
    const sface = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), faceMat); sface.position.set(0, 0.38, -0.42); sface.rotation.y = Math.PI; out.add(sface);
  }
  function coffin(H, g) {
    if (!H.coffin) return;
    const S = new THREE.Shape(); COFFIN.forEach(([x, z], i) => i ? S.lineTo(x, -z) : S.moveTo(x, -z)); S.closePath();
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(S).rotateX(-Math.PI / 2), woodMat); floor.position.y = 0.008; g.add(floor);
    // the lid hinges on the head end (the back), shaped like the coffin
    const hinge = new THREE.Group(); hinge.position.set(0, 0.3, -4.35); g.add(hinge);
    const LS = new THREE.Shape(); COFFIN.forEach(([x, z], i) => i ? LS.lineTo(x, -(z + 4.35)) : LS.moveTo(x, -(z + 4.35))); LS.closePath();
    const lidGeo = new THREE.ExtrudeGeometry(LS, { depth: 0.1, bevelEnabled: false }).rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(lidGeo, lidMat); slab.castShadow = true; hinge.add(slab);
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.8), crossMat), cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.1), crossMat);
    cross1.position.set(0, 0.12, 0.95); cross2.position.set(0, 0.12, 0.75); hinge.add(cross1, cross2);
    lid = hinge;
  }
  const decorate = (H, g) => { lid = null; tombstones(H, g); bigPumpkin(H, g); coffin(H, g); hasGhost = !!H.ghost; };
  decorate.ownBoxes = true; decorate.posts = false;              // the tunnel's two posts are the big pumpkin's cheeks
  const view = createPuttView(ctx, {
    theme: { field: '#26402d', felt: '#2f6a41', rail: '#9a8fbf', railTop: '#5b4f7a', bumper: PALETTE.pumpkin, bumperTop: '#ffb347', block: '#b9a8d8', ramp: '#3b7a4c', tee: '#1d4a2c', flag: '#ff8a1a' },
    decorate,
    onState(g) {
      if (g.gh) { if (!gOn) { gx = g.gh[0]; gz = g.gh[1]; } gOn = true; ghost.userData.tx = g.gh[0]; ghost.userData.tz = g.gh[1]; } else gOn = false;
    },
    onEvent(ev) {
      if (ev.e === 'boo') { puff = 1; floatText(stage, ev.x, 1.2, ev.z, 'Boo!', 'bad'); if (ev.pid === ctx.me) ctx.sfx('trap'); }
      else if (ev.e === 'tunnel') { ctx.sfx('pick'); if (ev.pid === ctx.me) floatText(stage, -5, 1.6, -1.2, 'Wheee!', 'good'); }
      else if (ev.e === 'lidDown') ctx.sfx('hit');
    },
    onFrame(dt, t, clock) {
      moonlight.intensity += ((view.overview() ? 1.6 : 0) - moonlight.intensity) * (1 - Math.exp(-dt * 3));
      ghost.visible = gshadow.visible = gOn && hasGhost;
      if (ghost.visible) {
        const k = 1 - Math.exp(-dt * 8); gx += ((ghost.userData.tx ?? gx) - gx) * k; gz += ((ghost.userData.tz ?? gz) - gz) * k;
        puff = Math.max(0, puff - dt * 2.5);
        ghost.position.set(gx, 0.25 + Math.sin(t * 2.2) * 0.12, gz); ghost.scale.setScalar(1 + puff * 0.25); ghost.rotation.y = Math.sin(t * 0.8) * 0.4;
        gshadow.position.set(gx, 0.02, gz);
      }
      if (lid) {
        const [o, c] = init.lid || [2.1, 1.6], ph = clock % (o + c), open = ph < o;
        const creak = open && ph > o - 0.45 ? Math.sin(ph * 60) * 0.06 : 0;             // a creak just before it shuts
        const want = open ? -1.75 + creak : 0;
        lidT += (want - lidT) * (1 - Math.exp(-dt * (open ? 10 : 22)));
        lid.rotation.x = lidT;
        for (const f of view.flag()) f.visible = lidT < -0.5;                       // the flag comes out with the lid up
      }
    },
  });
  const dispose = view.dispose;
  view.dispose = () => { dispose(); for (const m of mats) m.dispose(); faceTex.dispose(); };
  return view;
}
