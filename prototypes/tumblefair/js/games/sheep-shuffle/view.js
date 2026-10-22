// SHEEP SHUFFLE, as drawn: a bright summer meadow with mown stripes inside a rustic split-rail fence, apple trees and
// hay bales outside. Each pen is a square of golden straw in a corner, fenced on its two inner sides with a gap at the
// inner corner, flying a flag in its owner's seat colour, with the seat's shape painted big on the straw and the
// owner's name + count floating over it. Sheep are fat white cotton-ball bodies on four dark legs that trot, with a
// dark face and ears; golden sheep shine. A BAA! is a pale cone that whooshes out in front of the shouter.
import { RULES } from './sim.js';
import { SEATS } from '../../shared/protocol.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { pumpkinGeo } from '../../client/halloween.js';

const MAX = 40;
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena, init = ctx.init, pens = init.pens, segs = init.arena.segs, HW = ctx.season === 'halloween';     // Halloween: a moonlit meadow, ghost sheep, pumpkins for hay, BOO! for BAA!
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  // ---- meadow
  const out = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std(HW ? '#30553a' : '#5fb84e')); out.position.y = -0.03; out.receiveShadow = true; group.add(out);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), std(HW ? '#557f4a' : '#86d86a')); field.receiveShadow = true; group.add(field);
  const STR = 8, stripes = new THREE.InstancedMesh(new THREE.PlaneGeometry(hw * 2 / STR, hd * 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: HW ? '#5f8a52' : '#9be57d', roughness: 0.9 }), STR / 2);
  for (let i = 0; i < STR / 2; i++) { m4.makeTranslation(-hw + (i * 2 + 0.5) * hw * 2 / STR, 0.005, 0); stripes.setMatrixAt(i, m4); }
  stripes.receiveShadow = true; group.add(stripes);
  // flowers dotted on the grass
  const FL = 70, flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), FL), FCOL = (HW ? ['#ff8a1a', '#c89bff', '#ffd36b', '#ff8a1a'] : ['#ffffff', '#ffe14d', '#ff9ed2', '#ffffff']).map(c => new THREE.Color(c));
  for (let i = 0; i < FL; i++) { m4.makeTranslation(((i * 7.31) % (hw * 2)) - hw, 0.05, ((i * 4.77) % (hd * 2)) - hd); flowers.setMatrixAt(i, m4); flowers.setColorAt(i, FCOL[i % 4]); }
  group.add(flowers);
  // ---- fences: posts + two rails, instanced, for the outer ring and every pen's inner sides
  const wood = std(HW ? '#7a5a52' : '#b9783f'), postGeo = new THREE.BoxGeometry(0.18, 1.0, 0.18), railGeo = new THREE.BoxGeometry(1, 0.1, 0.07);
  const runs = [{ ax: -hw, az: -hd, bx: hw, bz: -hd }, { ax: hw, az: -hd, bx: hw, bz: hd }, { ax: hw, az: hd, bx: -hw, bz: hd }, { ax: -hw, az: hd, bx: -hw, bz: -hd }].map(s => ({ ...s, out: true })).concat(segs);
  let nPost = 0, nRail = 0; for (const s of runs) { const L = Math.hypot(s.bx - s.ax, s.bz - s.az), k = Math.max(1, Math.round(L / 1.6)); nPost += k + 1; nRail += k * 2; }
  const posts = new THREE.InstancedMesh(postGeo, wood, nPost), rails = new THREE.InstancedMesh(railGeo, wood, nRail); let pi = 0, ri = 0;
  for (const s of runs) {
    const L = Math.hypot(s.bx - s.ax, s.bz - s.az), k = Math.max(1, Math.round(L / 1.6)), yaw = Math.atan2(-(s.bz - s.az), s.bx - s.ax), off = s.out ? 0.15 : 0;
    const ox = s.out ? Math.sign(s.ax + s.bx) * off : 0, oz = s.out ? Math.sign(s.az + s.bz) * off : 0;
    for (let j = 0; j <= k; j++) { const t = j / k; m4.compose(v.set(s.ax + (s.bx - s.ax) * t + ox, 0.5, s.az + (s.bz - s.az) * t + oz), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(pi++, m4); }
    for (let j = 0; j < k; j++) for (const y of [0.45, 0.82]) { const t = (j + 0.5) / k; m4.compose(v.set(s.ax + (s.bx - s.ax) * t + ox, y, s.az + (s.bz - s.az) * t + oz), q.setFromEuler(e3.set(0, yaw, 0)), sc.set(L / k + 0.05, 1, 1)); rails.setMatrixAt(ri++, m4); }
  }
  posts.castShadow = rails.castShadow = true; group.add(posts, rails);
  // ---- pens: straw floor, painted seat shape, flag, name + count
  const penTags = [];
  const SHAPE = { circle: new THREE.CircleGeometry(1, 28), square: new THREE.PlaneGeometry(1.7, 1.7), triangle: new THREE.CircleGeometry(1.15, 3), diamond: new THREE.CircleGeometry(1.1, 4) };
  for (const p of pens) {
    const pl = ctx.players.find(x => x.pid === p.pid), seat = SEATS[pl?.seat ?? 0];
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, W = p.x1 - p.x0, D = p.z1 - p.z0;
    const straw = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), std(HW ? '#b89a5a' : '#f2d27a', { roughness: 1 })); straw.position.set(cx, 0.012, cz); straw.receiveShadow = true; group.add(straw);
    const tint = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.25, D - 0.25).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: seat.color, transparent: true, opacity: 0.22, depthWrite: false })); tint.position.set(cx, 0.016, cz); group.add(tint);
    const ox = p.sx > 0 ? p.x1 : p.x0, oz = p.sz > 0 ? p.z1 : p.z0;               // the outer corner (back of the pen)
    const mark = new THREE.Mesh(SHAPE[seat.shape].clone().rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: seat.color, transparent: true, opacity: 0.55, depthWrite: false }));
    mark.position.set(ox - p.sx * 1.35, 0.02, oz - p.sz * 1.35); if (seat.shape === 'triangle' || seat.shape === 'diamond') mark.rotation.y = Math.PI / 2; group.add(mark);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 6), std('#7a4a22')); pole.position.set(ox - p.sx * 0.35, 1.3, oz - p.sz * 0.35); pole.castShadow = true; group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.62), new THREE.MeshStandardMaterial({ color: seat.color, side: THREE.DoubleSide, roughness: 0.6 })); flag.position.set(pole.position.x + 0.5, 2.25, pole.position.z); group.add(flag); flag.userData.ph = p.sx + p.sz;
    p.flag = flag;
    const anchor = new THREE.Object3D(); anchor.position.set(cx, 0, cz); group.add(anchor);
    const T = stage.tag(anchor, { text: (p.pid === ctx.me ? 'YOUR PEN' : (pl?.name || '?')) + ' · 0', seat: pl?.seat ?? 0, height: 2.4, cls: 'ss-pen' + (p.pid === ctx.me ? ' me' : '') });
    penTags.push({ T, pid: p.pid, label: p.pid === ctx.me ? 'YOUR PEN' : (pl?.name || '?'), last: -1 });
  }
  // ---- trees and hay outside the fence
  const TREES = [[-hw - 3, -hd + 1], [-hw - 4.5, 2], [hw + 3.5, -2], [hw + 3, hd - 1], [-4, -hd - 3.2], [5, -hd - 3.5], [0.5, -hd - 5], [-hw - 2.5, hd + 1.5], [hw + 2, -hd - 2]];
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1.6, 7), std('#8a5a2b'), TREES.length), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.5, 1), std(HW ? '#5a3a86' : '#3fa34a', { flatShading: true }), TREES.length);
  const apples = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 8, 6), std(HW ? '#ff8a1a' : '#ff3b3b', HW ? { roughness: 0.4, emissive: '#ff6a00', emissiveIntensity: 0.6 } : { roughness: 0.4 }), TREES.length * 5);
  TREES.forEach(([x, z], i) => {
    m4.makeTranslation(x, 0.8, z); trunks.setMatrixAt(i, m4); m4.compose(v.set(x, 2.5, z), q.setFromEuler(e3.set(0, i, 0)), sc.setScalar(1 + (i % 3) * 0.15)); crowns.setMatrixAt(i, m4);
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + i; m4.makeTranslation(x + Math.sin(a) * 1.3, 2.3 + (k % 3) * 0.4, z + Math.cos(a) * 1.3); apples.setMatrixAt(i * 5 + k, m4); }
  });
  trunks.castShadow = crowns.castShadow = true; group.add(trunks, crowns, apples);
  const HAY = [[-hw - 1.6, -1.5], [hw + 1.6, 2.5], [-2, hd + 1.7], [3.5, hd + 1.6], [-7, -hd - 1.6]];
  const hay = new THREE.InstancedMesh(HW ? pumpkinGeo(THREE, 0.8) : new THREE.CylinderGeometry(0.7, 0.7, 1.1, 14).rotateZ(Math.PI / 2), std(HW ? '#ff7a14' : '#e8c35a'), HAY.length);
  HAY.forEach(([x, z], i) => { m4.compose(v.set(x, 0.7, z), q.setFromEuler(e3.set(0, i * 0.8, 0)), sc.setScalar(1)); hay.setMatrixAt(i, m4); });
  hay.castShadow = true; group.add(hay);
  // ---- sheep: wool body, wool topknot, face, four legs; gold wool for golden sheep
  const woolGeo = new THREE.IcosahedronGeometry(0.5, 1), topGeo = new THREE.IcosahedronGeometry(0.26, 1), faceGeo = new THREE.SphereGeometry(0.2, 10, 8), legGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.42, 6).translate(0, -0.21, 0), earGeo = new THREE.SphereGeometry(0.08, 6, 4);
  const woolW = HW ? std('#f1ecff', { flatShading: true, roughness: 1, emissive: '#9d8cd8', emissiveIntensity: 0.4, transparent: true, opacity: 0.86 }) : std('#ffffff', { flatShading: true, roughness: 1 }), woolG = std(HW ? '#ffb02e' : '#ffd23f', { flatShading: true, roughness: 0.35, metalness: 0.35, emissive: HW ? '#ff7a00' : '#c88a00', emissiveIntensity: 0.45 }), dark = std(HW ? '#4a3570' : '#3b3138', { roughness: 0.7 });
  const mk = (geo, mat, n) => { const im = new THREE.InstancedMesh(geo, mat, n); im.count = 0; im.castShadow = true; group.add(im); return im; };
  const bodyW = mk(woolGeo, woolW, MAX), bodyG = mk(woolGeo, woolG, 8), topW = mk(topGeo, woolW, MAX), topG = mk(topGeo, woolG, 8), faces = mk(faceGeo, dark, MAX + 8), legs = mk(legGeo, dark, (MAX + 8) * 4), ears = mk(earGeo, dark, (MAX + 8) * 2);
  const shadow = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#204a18', transparent: true, opacity: 0.22, depthWrite: false }), MAX + 8); shadow.count = 0; group.add(shadow);
  const flock = new Map();       // id -> { x, z, tx, tz, gold, yaw, ph, born, spd }
  // ---- BAA! cones
  const coneGeo = new THREE.CircleGeometry(1, 20, -50 * Math.PI / 180, 100 * Math.PI / 180).rotateX(-Math.PI / 2), fx = [];
  function baaCone(x, z, yaw, seat) {
    const m = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: SEATS[seat ?? 0].color, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, 0.06, z); m.rotation.y = yaw - Math.PI / 2; group.add(m); fx.push({ m, t: 0 });
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'sheep' });
  const tip = h('div', 'ss-tip', ctx.me != null ? 'Walk <b>behind</b> sheep to push them into <b>your</b> pen' : 'Herd the sheep into your own pen!'); ctx.ui.append(tip);
  setTimeout(() => tip.classList.add('gone'), 6000);
  const seatOf = pid => ctx.players.find(p => p.pid === pid)?.seat ?? 0;
  let myCool = 0;
  return {
    state(g) {
      const seen = new Set();
      for (const [id, x, z, gold] of g.sh) { seen.add(id); const s = flock.get(id); if (s) { s.tx = x; s.tz = z; s.gold = gold; } else flock.set(id, { x, z, tx: x, tz: z, gold, yaw: (id * 2.3) % 6.28, ph: id, born: 0, spd: 0 }); }
      for (const id of flock.keys()) if (!seen.has(id)) flock.delete(id);
      for (const t of penTags) { const n = g.sc[t.pid] ?? 0; if (n !== t.last) { t.last = n; t.T.set(`${t.label} · ${n}`); } }
      bar.set(g.sc, g.left);
    },
    input(inp) { if (inp.b & 1 && myCool <= 0) { myCool = RULES.baaCool; ctx.actor(ctx.me)?.play('cheer', 450); } },
    event(ev) {
      if (ev.e === 'baa') {
        baaCone(ev.x, ev.z, ev.yaw, seatOf(ev.pid));
        if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('cheer', 450);
        ctx.sfx(ev.pid === ctx.me ? 'throw' : 'tap');
        floatText(stage, ev.x, 2.4, ev.z, HW ? 'BOO!' : 'BAA!', 'ss-baa');
      } else if (ev.e === 'pen') {
        const mine = ev.pid === ctx.me;
        ctx.sfx(ev.gold ? 'coins' : mine || ctx.me == null ? 'good' : 'tap');
        floatText(stage, ev.x, 1.4, ev.z, '+' + ev.v, 'good');
      } else if (ev.e === 'out') {
        if (ev.pid === ctx.me) ctx.sfx('bad');
        floatText(stage, ev.x, 1.4, ev.z, '-' + ev.v, 'bad');
      } else if (ev.e === 'spawn' && ev.gold) { ctx.sfx('pick'); floatText(stage, ev.x, 1.8, ev.z, 'Golden sheep!', 'good'); }
    },
    frame(dt, t) {
      if (myCool > 0) myCool -= dt;
      const k = 1 - Math.exp(-dt * 12);
      let nw = 0, ng = 0, nf = 0;
      for (const [id, s] of flock) {
        const ox = s.x, oz = s.z;
        s.x += (s.tx - s.x) * k; s.z += (s.tz - s.z) * k; s.born = Math.min(1, s.born + dt * 2.5);
        const vx = (s.x - ox) / Math.max(dt, 1e-3), vz = (s.z - oz) / Math.max(dt, 1e-3), sp = Math.hypot(vx, vz);
        s.spd += (sp - s.spd) * Math.min(1, dt * 8);
        if (sp > 0.25) { let d = Math.atan2(vx, vz) - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); s.yaw += d * Math.min(1, dt * 9); }
        s.ph += dt * (2 + s.spd * 3.2);
        const big = (s.gold ? 1.12 : 1) * (s.born < 1 ? Math.sin(s.born * Math.PI / 2) * 1.12 : 1), bob = Math.abs(Math.sin(s.ph)) * Math.min(0.12, s.spd * 0.03), y = 0.62 + bob;
        const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), lx = fz, lz = -fx;
        q.setFromEuler(e3.set(0, s.yaw, 0));
        const body = s.gold ? bodyG : bodyW, top = s.gold ? topG : topW, bi = s.gold ? ng++ : nw++;
        if ((s.gold && bi >= 8) || (!s.gold && bi >= MAX) || nf >= MAX + 8) continue;
        m4.compose(v.set(s.x, y * big, s.z), q, sc.set(0.95 * big, 0.82 * big, 1.15 * big)); body.setMatrixAt(bi, m4);
        m4.compose(v.set(s.x + fx * 0.42 * big, (y + 0.3) * big, s.z + fz * 0.42 * big), q, sc.setScalar(big)); top.setMatrixAt(bi, m4);
        m4.compose(v.set(s.x + fx * 0.6 * big, (y + 0.1) * big, s.z + fz * 0.6 * big), q, sc.set(0.9 * big, 1.05 * big, 1.2 * big)); faces.setMatrixAt(nf, m4);
        for (let e = 0; e < 2; e++) { const sd = e ? 1 : -1; m4.compose(v.set(s.x + fx * 0.55 * big + lx * sd * 0.2 * big, (y + 0.2) * big, s.z + fz * 0.55 * big + lz * sd * 0.2 * big), q, sc.set(1.6 * big, 0.7 * big, 1 * big)); ears.setMatrixAt(nf * 2 + e, m4); }
        for (let l = 0; l < 4; l++) {
          const front = l < 2 ? 1 : -1, side = l % 2 ? 1 : -1, swing = Math.sin(s.ph * 2 + (l === 0 || l === 3 ? 0 : Math.PI)) * Math.min(0.7, s.spd * 0.18);
          m4.compose(v.set(s.x + (fx * 0.28 * front + lx * 0.2 * side) * big, (y - 0.18) * big, s.z + (fz * 0.28 * front + lz * 0.2 * side) * big), q.setFromEuler(e3.set(swing, s.yaw, 0, 'YXZ')), sc.setScalar(big)); legs.setMatrixAt(nf * 4 + l, m4);
        }
        m4.compose(v.set(s.x, 0.02, s.z), q.identity(), sc.set(big, 1, big * 1.2)); shadow.setMatrixAt(nf, m4);
        nf++;
      }
      bodyW.count = topW.count = Math.min(MAX, nw); bodyG.count = topG.count = Math.min(8, ng); faces.count = shadow.count = nf; legs.count = nf * 4; ears.count = nf * 2;
      for (const im of [bodyW, bodyG, topW, topG, faces, legs, ears, shadow]) im.instanceMatrix.needsUpdate = true;
      for (const p of pens) if (p.flag) p.flag.rotation.y = Math.sin(t * 3 + p.flag.userData.ph) * 0.25;
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt * 2.6; f.m.scale.setScalar(0.6 + f.t * RULES.baaR); f.m.material.opacity = Math.max(0, 0.45 * (1 - f.t)); if (f.t >= 1) { group.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); } }
    },
    dispose() { bar.el.remove(); for (const t of penTags) t.T.remove(); },
  };
}
