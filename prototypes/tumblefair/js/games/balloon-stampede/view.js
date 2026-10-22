// BALLOON STAMPEDE, as drawn: a sunny toy playroom — a big floor of soft pastel play-mat squares inside chunky
// padded walls in candy stripes, with toy blocks stacked in the corners. Each balloon floats at chest height on a
// white string with a little knot, bobbing and leaning as it drifts. A seat's balloons are its colour AND its shape
// (red round, blue cube, green cone, pink diamond); gold ones are big shiny stars-in-a-ball; solo greys are dull
// lumpy rocks of a balloon. A pop throws confetti in the balloon's colour and a +1 / +3 / -1 that rises off it.
import { GOLD, GREY } from './sim.js';
import { SEATS } from '../../shared/protocol.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { pumpkinGeo, stemGeo, ghostGeo, faceTexture } from '../../client/halloween.js';

const MAX = 32, BY = 1.3, SIZE = 1.3;     // balloons are drawn 30% bigger than their geometry, so they read on a phone
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena, HW = ctx.season === 'halloween';     // Halloween: a dusk playroom, jack-o'-lantern gold balloons, little ghost greys
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });
  // ---- room: play-mat floor, padded striped walls, toy blocks in the corners, a big rug outside
  const out = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std(HW ? '#3b2a52' : '#ffe3b3', { roughness: 0.95 })); out.position.y = -0.03; group.add(out);
  const TW = 8, TD = 6, mats = new THREE.InstancedMesh(new THREE.BoxGeometry(hw * 2 / TW - 0.06, 0.12, hd * 2 / TD - 0.06), std('#ffffff', { roughness: 0.85 }), TW * TD);
  const MAT = (HW ? ['#64508c', '#4b3b70', '#7a5ea0', '#40634e'] : ['#ffd6e7', '#c8f0ff', '#fff2a8', '#d4f7c9']).map(c => new THREE.Color(c));
  for (let i = 0; i < TW * TD; i++) { const cx = i % TW, cz = Math.floor(i / TW); m4.makeTranslation(-hw + (cx + 0.5) * hw * 2 / TW, -0.06, -hd + (cz + 0.5) * hd * 2 / TD); mats.setMatrixAt(i, m4); mats.setColorAt(i, MAT[(cx + cz * 3) % 4]); }
  mats.receiveShadow = true; group.add(mats);
  const per = 2 * (Math.round(hw * 2 / 1.2) + Math.round(hd * 2 / 1.2)), pads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.8, 0.6), std('#ffffff', { roughness: 0.7 }), per + 4);
  const STRIPE = (HW ? ['#ff7a14', '#2a1840', '#9b5be0', '#2a1840'] : ['#ff6b9a', '#ffffff', '#6bc7ff', '#ffffff']).map(c => new THREE.Color(c));
  let pi = 0;
  const wallRun = (n, fx) => { for (let k = 0; k < n; k++) fx(k, n); };
  wallRun(Math.round(hw * 2 / 1.2), (k, n) => { for (const sz of [-1, 1]) { m4.compose(v.set(-hw + (k + 0.5) * hw * 2 / n, 0.4, sz * (hd + 0.3)), q.identity(), sc.set(hw * 2 / n, 1, 1)); pads.setMatrixAt(pi, m4); pads.setColorAt(pi++, STRIPE[k % 4]); } });
  wallRun(Math.round(hd * 2 / 1.2), (k, n) => { for (const sx of [-1, 1]) { m4.compose(v.set(sx * (hw + 0.3), 0.4, -hd + (k + 0.5) * hd * 2 / n), q.setFromEuler(e3.set(0, Math.PI / 2, 0)), sc.set(hd * 2 / n, 1, 1)); pads.setMatrixAt(pi, m4); pads.setColorAt(pi++, STRIPE[(k + 2) % 4]); } });
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { m4.compose(v.set(sx * (hw + 0.3), 0.45, sz * (hd + 0.3)), q.identity(), sc.set(0.7, 1.15, 1.15)); pads.setMatrixAt(pi, m4); pads.setColorAt(pi++, new THREE.Color(HW ? '#7dd84a' : '#ffd23f')); }
  pads.count = pi; pads.castShadow = true; group.add(pads);
  const toys = new THREE.InstancedMesh(HW ? pumpkinGeo(THREE, 0.55) : new THREE.BoxGeometry(0.9, 0.9, 0.9), std('#ffffff', { roughness: 0.5 }), 12), TOY = (HW ? ['#ff7a14', '#ff9a3a', '#e8650c', '#ffb04a'] : ['#ff4d4d', '#3d8bff', '#3ecf5a', '#ffd23f']).map(c => new THREE.Color(c));
  let ti = 0;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let k = 0; k < 3; k++) { m4.compose(v.set(sx * (hw + 1.6 + (k === 2 ? 0 : k * 0.95)), 0.45 + (k === 2 ? 0.9 : 0), sz * (hd + 1.5)), q.setFromEuler(e3.set(0, k * 0.4 + sx, 0)), sc.setScalar(1)); toys.setMatrixAt(ti, m4); toys.setColorAt(ti++, TOY[(k + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0)) % 4]); }
  toys.castShadow = true; group.add(toys);
  // ---- balloons: one instanced mesh per kind (4 seat shapes + gold + grey), plus strings and knots for all
  const SHAPES = { circle: new THREE.SphereGeometry(0.42, 16, 12), square: new THREE.BoxGeometry(0.66, 0.66, 0.66), triangle: new THREE.ConeGeometry(0.46, 0.9, 16).rotateX(Math.PI), diamond: new THREE.OctahedronGeometry(0.52, 0) };
  const kinds = [];
  for (let s = 0; s < 4; s++) { const S = SEATS[s]; kinds.push(new THREE.InstancedMesh(SHAPES[S.shape], std(S.color, { roughness: 0.25, metalness: 0.05, emissive: S.color, emissiveIntensity: 0.12 }), MAX)); }
  if (!HW) {
  kinds.push(new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.55, 1), std('#ffd21f', { roughness: 0.15, metalness: 0.5, emissive: '#d08a00', emissiveIntensity: 0.55, flatShading: true }), MAX));
  kinds.push(new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.44, 0), std('#8a8f99', { roughness: 0.9, flatShading: true }), MAX));
  } else {
    // gold = a glowing jack-o'-lantern balloon (+3), grey = a sleepy little ghost (-1); each gets a face that rides with it
    kinds.push(new THREE.InstancedMesh(pumpkinGeo(THREE, 0.56), std('#ff8a1a', { roughness: 0.35, emissive: '#ff5a00', emissiveIntensity: 0.55 }), MAX));
    kinds.push(new THREE.InstancedMesh(ghostGeo(THREE, 0.42).translate(0, -0.46, 0), std('#e9e2ff', { roughness: 0.5, emissive: '#8e7cc8', emissiveIntensity: 0.35, transparent: true, opacity: 0.88 }), MAX));
  }
  for (const k of kinds) { k.castShadow = true; k.count = 0; group.add(k); }
  const extras = [[], [], [], [], [], []];                // more instanced parts drawn with a kind's own matrix (Halloween faces)
  if (HW) {
    const add = (c, geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, MAX); im.count = 0; group.add(im); extras[c].push(im); };
    add(GOLD, stemGeo(THREE, 0.56), std('#4c7a2a'));
    add(GOLD, new THREE.PlaneGeometry(0.7, 0.7).translate(0, 0.02, 0.62), new THREE.MeshBasicMaterial({ map: faceTexture(THREE), transparent: true, depthWrite: false, toneMapped: false }));
    const eye = new THREE.SphereGeometry(0.075, 8, 6);
    add(GREY, mergeEyes(THREE, eye), new THREE.MeshBasicMaterial({ color: '#2a1840' }));
  }
  const strings = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 4), new THREE.MeshBasicMaterial({ color: '#ffffff' }), MAX * 2);
  const knots = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.14, 8), std('#ffffff'), MAX * 2);
  const shadows = new THREE.InstancedMesh(new THREE.CircleGeometry(0.36, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#5a3a5a', transparent: true, opacity: 0.22, depthWrite: false }), MAX * 2);
  strings.count = knots.count = shadows.count = 0; group.add(strings, knots, shadows);
  const balloons = new Map();                // id -> { x, z, tx, tz, c, born }
  // ---- confetti
  const bitGeo = new THREE.BoxGeometry(0.12, 0.03, 0.08), fx = [];
  function confetti(x, z, c) {
    const col = c === GOLD ? (HW ? '#ff8a1a' : '#ffd21f') : c === GREY ? (HW ? '#e9e2ff' : '#8a8f99') : SEATS[c].color, mat = new THREE.MeshBasicMaterial({ color: col });
    const bits = []; for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(bitGeo, mat); b.position.set(x, BY, z); const a = i * 0.52; b.userData.v = [Math.sin(a) * 3, 2 + (i % 4), Math.cos(a) * 3]; group.add(b); bits.push(b); }
    fx.push({ bits, mat, t: 0 });
  }
  const bar = scoreBar(ctx, { unit: 'pops' });
  return {
    state(g) {
      const seen = new Set();
      for (const [id, x, z, c] of g.bl) { seen.add(id); const b = balloons.get(id); if (b) { b.tx = x; b.tz = z; } else balloons.set(id, { x, z, tx: x, tz: z, c, born: 0 }); }
      for (const id of balloons.keys()) if (!seen.has(id)) balloons.delete(id);
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'pop') {
        confetti(ev.x, ev.z, ev.c); const mine = ev.pid === ctx.me;
        if (mine) ctx.sfx(ev.d > 1 ? 'coins' : ev.d > 0 ? 'good' : 'bad'); else if (ev.gift === ctx.me) ctx.sfx('good'); else ctx.sfx('tap');
        floatText(stage, ev.x, BY + 0.6, ev.z, ev.d > 0 ? '+' + ev.d : String(ev.d), ev.d > 0 ? 'good' : 'bad');
        if (ev.gift != null) { const a = ctx.actor(ev.gift); if (a) floatText(stage, a.group.position.x, 2.4, a.group.position.z, '+1 gift', 'good'); }
      } else if (ev.e === 'dash') { ctx.actor(ev.pid)?.play('punch', 300); if (ev.pid === ctx.me) ctx.sfx('throw'); }
      else if (ev.e === 'barge') { ctx.sfx('hit'); ctx.actor(ev.pid)?.play('hit', 500); }
    },
    pose(pid, flags) {
      if (flags & F.AIR) return 'attack';
      if (flags & F.STUN) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      const k = 1 - Math.exp(-dt * 10), count = [0, 0, 0, 0, 0, 0]; let si = 0;
      for (const [id, b] of balloons) {
        const dx = b.tx - b.x, dz = b.tz - b.z; b.x += dx * k; b.z += dz * k; b.born = Math.min(1, b.born + dt * 2.5);
        const kind = kinds[b.c], i = count[b.c]++; if (i >= MAX) continue;
        const bob = Math.sin(t * 2.2 + id * 1.7) * 0.12, lean = Math.max(-0.35, Math.min(0.35, -dx * 1.5)), leanZ = Math.max(-0.35, Math.min(0.35, dz * 1.5));
        const s = SIZE * (b.c === GOLD ? 1.1 : 1) * (b.born < 1 ? Math.sin(b.born * Math.PI / 2) * 1.15 : 1), y = BY + bob;
        m4.compose(v.set(b.x, y, b.z), q.setFromEuler(e3.set(leanZ, HW && b.c >= GOLD ? Math.sin(t * 0.8 + id) * 0.25 : t * 0.6 + id, lean)), sc.setScalar(s)); kind.setMatrixAt(i, m4); for (const x of extras[b.c]) x.setMatrixAt(i, m4);
        const sh = b.c === 3 ? 0.55 : b.c === 2 ? 0.48 : 0.4;                                     // where the string meets the balloon
        m4.compose(v.set(b.x, (y - sh * s) / 2, b.z), q.identity(), sc.set(1, Math.max(0.05, y - sh * s), 1)); strings.setMatrixAt(si, m4);
        m4.compose(v.set(b.x, y - sh * s, b.z), q.identity(), sc.setScalar(s)); knots.setMatrixAt(si, m4);
        m4.compose(v.set(b.x, 0.02, b.z), q.identity(), sc.setScalar(s)); shadows.setMatrixAt(si++, m4);
      }
      kinds.forEach((m, c) => { m.count = Math.min(MAX, count[c]); m.instanceMatrix.needsUpdate = true; for (const x of extras[c]) { x.count = m.count; x.instanceMatrix.needsUpdate = true; } });
      strings.count = knots.count = shadows.count = si;
      strings.instanceMatrix.needsUpdate = knots.instanceMatrix.needsUpdate = shadows.instanceMatrix.needsUpdate = true;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt;
        for (const b of f.bits) { const u = b.userData.v; u[1] -= 9 * dt; b.position.x += u[0] * dt; b.position.y = Math.max(0.03, b.position.y + u[1] * dt); b.position.z += u[2] * dt; b.rotation.x += dt * 9; b.rotation.z += dt * 6; }
        if (f.t > 1.1) { for (const b of f.bits) group.remove(b); f.mat.dispose(); fx.splice(i, 1); }
      }
    },
    dispose() { bar.el.remove(); },
  };
}

/** Two ghost eyes as one geometry (Halloween greys). */
function mergeEyes(THREE, eye) {
  const a = eye.clone().translate(-0.13, 0.08, 0.38), b = eye.clone().translate(0.13, 0.08, 0.38);
  const pos = [...a.toNonIndexed().attributes.position.array, ...b.toNonIndexed().attributes.position.array];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
