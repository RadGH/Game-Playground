// STACK ATTACK, as drawn: a floating toy board of mint checker tiles with a chunky rail of red / yellow / blue blocks
// round it, puffy clouds below. Each player's pad is a slab in their colour with a flag (and their shape on it).
// Blocks are wooden toy cubes, gold ones shine; a carried block rides above its carrier's head. Towers stack on the
// pads, sway more the taller they get, and carry a height label.
import { PADS, RULES } from './sim.js';
import { SEATS } from '../../shared/protocol.js';
import { scoreBar, floatText } from '../../client/gamehud.js';

const BLOCK = 0.82, STEP = 0.66, MAX_H = 4.4;  // past MAX_H metres a tower is drawn with smaller blocks, so it stays on screen
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  // ---- board: checker tiles, a base, a rail of toy blocks, clouds underneath
  const T = 8, tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1.98, 0.3, 1.98), new THREE.MeshStandardMaterial({ roughness: 0.7 }), T * T);
  const A = new THREE.Color('#7fe3c6'), B = new THREE.Color('#b4f3df');
  for (let i = 0; i < T * T; i++) { const cx = i % T, cz = Math.floor(i / T); m4.makeTranslation(cx * 2 + 1 - hw, -0.15, cz * 2 + 1 - hd); tiles.setMatrixAt(i, m4); tiles.setColorAt(i, (cx + cz) % 2 ? A : B); }
  tiles.receiveShadow = true; group.add(tiles);
  const base = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 1.6, 1.4, hd * 2 + 1.6), new THREE.MeshStandardMaterial({ color: '#f4a259', roughness: 0.9 })); base.position.y = -1; group.add(base);
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 - 1, 1.2, hd * 2 - 1), new THREE.MeshStandardMaterial({ color: '#d9823b', roughness: 0.9 })); base2.position.y = -2.2; group.add(base2);
  const RAIL = ['#ff5a5a', '#ffd23f', '#4d9bff'].map(c => new THREE.Color(c)), per = Math.round(hw * 2 / 1.1);
  const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.8, 0.7), new THREE.MeshStandardMaterial({ roughness: 0.5 }), per * 4);
  let ri = 0;
  for (let side = 0; side < 4; side++) for (let k = 0; k < per; k++) {
    const u = -hw - 0.35 + (k + 0.5) * (hw * 2 + 0.7) / per, along = side < 2;
    const x = along ? u : (side === 2 ? -hw - 0.4 : hw + 0.4), z = along ? (side === 0 ? -hd - 0.4 : hd + 0.4) : u;
    m4.compose(v.set(x, 0.1, z), q.setFromEuler(e3.set(0, along ? 0 : Math.PI / 2, 0)), sc.set(1, 1, 1)); rail.setMatrixAt(ri, m4); rail.setColorAt(ri++, RAIL[(k + side) % 3]);
  }
  rail.castShadow = true; group.add(rail);
  const clouds = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }), 30);
  for (let i = 0; i < 30; i++) { const a = i * 2.1, r = 15 + (i * 4.7) % 16; m4.compose(v.set(Math.sin(a) * r, -6 - (i % 4), Math.cos(a) * r), q.identity(), sc.set(2 + (i % 3), 0.9, 1.6 + (i % 2))); clouds.setMatrixAt(i, m4); }
  group.add(clouds);
  // ---- pads with flags + a height label each
  const SHAPE = { circle: new THREE.CircleGeometry(0.32, 20), square: new THREE.PlaneGeometry(0.52, 0.52), triangle: new THREE.CircleGeometry(0.38, 3), diamond: new THREE.CircleGeometry(0.36, 4) };
  const pads = new Map(), labels = [];
  for (const [pid, seat] of ctx.init.pads) {
    const p = PADS[seat], S = SEATS[seat], col = new THREE.MeshStandardMaterial({ color: S.color, roughness: 0.5 });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(RULES.padHalf * 2, 0.14, RULES.padHalf * 2), col); pad.position.set(p.x, 0.07, p.z); pad.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(RULES.padHalf * 2 + 0.3, 0.1, RULES.padHalf * 2 + 0.3), new THREE.MeshStandardMaterial({ color: '#ffffff' })); rim.position.set(p.x, 0.04, p.z);
    const ox = Math.sign(p.x) * (RULES.padHalf + 0.15), oz = Math.sign(p.z) * (RULES.padHalf + 0.15);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 8), new THREE.MeshStandardMaterial({ color: '#eeeeee' })); pole.position.set(p.x + ox, 1.3, p.z + oz);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: S.color })); flag.position.set(p.x + ox - Math.sign(p.x) * 0.5, 2.25, p.z + oz);
    const mark = new THREE.Mesh(SHAPE[S.shape], new THREE.MeshBasicMaterial({ color: '#ffffff' })); mark.position.set(0, 0, 0.03); flag.add(mark);
    group.add(pad, rim, pole, flag);
    const top = new THREE.Object3D(); top.position.set(p.x, 0.4, p.z); group.add(top);
    const tag = stage.tag(top, { text: '0', seat, height: 0.6, cls: 'sa-height' }); labels.push(tag);
    pads.set(pid, { seat, x: p.x, z: p.z, tower: '', top, tag, pop: 0 });
  }
  // ---- blocks: wood and gold, floor + carried + towers, rebuilt every frame (a few hundred instances at most)
  const geo = new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK);
  const wood = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.65 }), 320);
  const gold = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: '#ffd21f', emissive: '#c07800', emissiveIntensity: 0.55, metalness: 0.1, roughness: 0.3 }), 120);
  wood.castShadow = gold.castShadow = true; group.add(wood, gold);
  const WOOD = ['#f3c98b', '#e8b26b', '#f8deb0', '#dca05a'].map(c => new THREE.Color(c));
  let floor = [];                                               // [id, x, z, gold, carrier]
  const seenAt = new Map();                                     // id -> drop-in height
  const bar = scoreBar(ctx, { unit: 'blocks' });
  const carryOf = new Set();
  return {
    state(g) {
      floor = g.k; carryOf.clear();
      for (const k of floor) { if (!seenAt.has(k[0])) seenAt.set(k[0], k[4] >= 0 ? 0 : 7); if (k[4] >= 0) carryOf.add(k[4]); }
      if (seenAt.size > 200) { const live = new Set(floor.map(k => k[0])); for (const id of seenAt.keys()) if (!live.has(id)) seenAt.delete(id); }
      if (g.tw) for (const [pid, s] of Object.entries(g.tw)) { const p = pads.get(+pid); if (p && p.tower !== s) { p.pop = s.length > p.tower.length ? 1 : 0; p.tower = s; } }
      for (const [pid, p] of pads) { const n = g.sc[pid] ?? 0; p.tag.set(String(n)); }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      const a = ev.pid != null ? ctx.actor(ev.pid) : null, me = ev.pid === ctx.me;
      if (ev.e === 'pick') { if (me) ctx.sfx('pick'); }
      else if (ev.e === 'drop') { if (me) ctx.sfx('tap'); }
      else if (ev.e === 'stack') { const p = pads.get(ev.pid); ctx.sfx(ev.gold ? 'coins' : 'good'); if (p) floatText(stage, p.x, 0.6 + Math.min(MAX_H, p.tower.length * STEP) + 1, p.z, ev.gold ? '+2' : '+1', 'good'); }
      else if (ev.e === 'steal') { const p = pads.get(ev.from); ctx.sfx('bad'); if (p) floatText(stage, p.x, 1 + Math.min(MAX_H, p.tower.length * STEP), p.z, 'STOLEN!', 'bad'); a?.play('attack', 400); }
      else if (ev.e === 'shove') { a?.play('punch', 380); if (me) ctx.sfx('throw'); }
      else if (ev.e === 'bump') { ctx.sfx('hit'); ctx.actor(ev.pid)?.play('hit', 500); if (ev.lost) { const b = ctx.actor(ev.pid); if (b) floatText(stage, b.group.position.x, 2.4, b.group.position.z, 'DROPPED!', 'bad'); } }
    },
    frame(dt, t) {
      let w = 0, gd = 0;
      const put = (isGold, x, y, z, ry = 0, rz = 0, s = 1) => {
        const mesh = isGold ? gold : wood, i = isGold ? gd++ : w++; if (i >= (isGold ? 120 : 320)) return;
        m4.compose(v.set(x, y, z), q.setFromEuler(e3.set(0, ry, rz)), sc.set(s, s, s)); mesh.setMatrixAt(i, m4);
        if (!isGold) mesh.setColorAt(i, WOOD[Math.abs(Math.round(x * 3 + z * 5 + y)) % 4]);
      };
      for (const [id, x, z, isGold, by] of floor) {
        if (by >= 0) { const a = ctx.actor(by); if (a) { const p = a.group.position, yaw = a.body.group.rotation.y; put(isGold, p.x + Math.sin(yaw) * 0.62, p.y + 0.95, p.z + Math.cos(yaw) * 0.62, yaw, 0, 0.8); } continue; }
        let h = seenAt.get(id) || 0; if (h > 0) { h = Math.max(0, h - dt * 14); seenAt.set(id, h); }
        put(isGold, x, BLOCK / 2 + h + Math.abs(Math.sin(t * 2 + id)) * 0.04, z, id * 0.7);
      }
      for (const p of pads.values()) {
        const n = p.tower.length, sway = Math.sin(t * 1.7 + p.seat * 1.3) * Math.min(0.12, n * 0.006);
        const k = Math.min(1, MAX_H / Math.max(1, n * STEP)), step = STEP * k;
        p.pop = Math.max(0, p.pop - dt * 4);
        for (let i = 0; i < n; i++) { const y = 0.14 + BLOCK * k / 2 + i * step, ang = sway * (i / Math.max(1, n)); const top = i === n - 1 ? 1 + p.pop * 0.25 : 1; put(p.tower[i] === '2', p.x + Math.sin(ang) * y, y, p.z, (i % 2) * 0.12, -ang, top * Math.max(k, 0.55)); }
        p.top.position.set(p.x + Math.sin(sway) * n * step, 0.3 + n * step, p.z);
      }
      wood.count = Math.min(w, 320); gold.count = Math.min(gd, 120);
      wood.instanceMatrix.needsUpdate = gold.instanceMatrix.needsUpdate = true; if (wood.instanceColor) wood.instanceColor.needsUpdate = true;
    },
    dispose() { bar.el.remove(); for (const l of labels) l.remove(); },
  };
}
