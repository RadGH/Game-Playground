// PAINT PANIC, as drawn: a walled courtyard of tiles that take the colour of whoever walked on them last, a paint
// roller in front of every player, and paint buckets (the bombs) that burst into a big splat.
import { GRID } from './sim.js';
import { SEATS } from '../../shared/protocol.js';
import { scoreBar } from '../../client/gamehud.js';

export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena, HW = ctx.season === 'halloween';     // Halloween: a night courtyard of purple flagstones, slime cauldrons for buckets
  const BLANK = new THREE.Color(HW ? '#5c4a7c' : '#e9e2d0'), BLANK2 = new THREE.Color(HW ? '#4d3d6a' : '#ddd5c0');
  const seatCol = SEATS.map(s => new THREE.Color(s.color));
  // floor: one instanced tile, coloured per tile
  const tileGeo = new THREE.BoxGeometry(0.96, 0.12, 0.96);
  const tiles = new THREE.InstancedMesh(tileGeo, new THREE.MeshStandardMaterial({ roughness: 0.75 }), GRID.w * GRID.h);
  const m4 = new THREE.Matrix4(), owner = new Int8Array(GRID.w * GRID.h).fill(-1), pop = new Float32Array(GRID.w * GRID.h);
  const put = (i, lift = 0) => { const cx = i % GRID.w, cz = Math.floor(i / GRID.w); m4.makeTranslation(cx + 0.5 - GRID.w / 2, -0.06 + lift, cz + 0.5 - GRID.h / 2); tiles.setMatrixAt(i, m4); };
  const tint = i => tiles.setColorAt(i, owner[i] < 0 ? ((i + Math.floor(i / GRID.w)) % 2 ? BLANK : BLANK2) : seatCol[owner[i]]);
  for (let i = 0; i < owner.length; i++) { owner[i] = ctx.init.grid[i]; put(i); tint(i); }
  tiles.receiveShadow = true; tiles.instanceColor.needsUpdate = true; group.add(tiles);
  // courtyard: a stone base, four low walls, corner posts
  const stone = new THREE.MeshStandardMaterial({ color: HW ? '#5e5470' : '#8c7a6b', roughness: 0.9 }), cap = new THREE.MeshStandardMaterial({ color: HW ? '#8a7aa8' : '#b9a48f', roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 2.4, 1.2, hd * 2 + 2.4), new THREE.MeshStandardMaterial({ color: HW ? '#2e2440' : '#5c6f74', roughness: 1 })); base.position.y = -0.73; base.receiveShadow = true; group.add(base);
  for (const [w, d, x, z] of [[hw * 2 + 1.2, 0.6, 0, -hd - 0.3], [hw * 2 + 1.2, 0.6, 0, hd + 0.3], [0.6, hd * 2 + 1.2, -hw - 0.3, 0], [0.6, hd * 2 + 1.2, hw + 0.3, 0]]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), stone); wall.position.set(x, 0.3, z); wall.castShadow = wall.receiveShadow = true; group.add(wall);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.14, d + 0.14), cap); top.position.set(x, 0.82, z); group.add(top);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.9), cap); post.position.set(sx * (hw + 0.3), 0.6, sz * (hd + 0.3)); post.castShadow = true; group.add(post); }
  // a roller for everyone: a handle and a fat drum in their colour, carried in front
  for (const p of ctx.players) {
    const a = ctx.actor(p.pid); if (!a) continue;
    const roller = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.95, 14).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.6 })); drum.position.set(0, 0.2, 0.75);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6).rotateX(Math.PI / 2.9), new THREE.MeshStandardMaterial({ color: '#d8d2c4' })); stick.position.set(0, 0.52, 0.42);
    roller.add(drum, stick); drum.castShadow = true; a.body.group.add(roller);
  }
  // buckets
  const bucketGeo = HW ? new THREE.LatheGeometry([[0.16, -0.25], [0.32, -0.18], [0.4, 0], [0.37, 0.16], [0.3, 0.22], [0.36, 0.25]].map(([x, y]) => new THREE.Vector2(x, y)), 16) : new THREE.CylinderGeometry(0.36, 0.28, 0.5, 14), bucketMat = HW ? new THREE.MeshStandardMaterial({ color: '#2a1f36', roughness: 0.45, metalness: 0.5, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: 0.4, metalness: 0.3 });
  const blobGeo = new THREE.SphereGeometry(0.3, 12, 8), blobMat = new THREE.MeshStandardMaterial(HW ? { color: '#7dff5a', roughness: 0.25, emissive: '#2f9a1f' } : { color: '#ffd84d', roughness: 0.3, emissive: '#7a5a00' });
  const buckets = new Map();
  const bar = scoreBar(ctx, { unit: 'tiles' });
  const splats = [];
  return {
    halloween: { spots: [[-hw - 0.3, 1.35, -hd - 0.3], [hw + 0.3, 1.35, -hd - 0.3], [-hw - 0.3, 1.35, hd + 0.3], [hw + 0.3, 1.35, hd + 0.3], [-hw * 0.4, -0.13, hd + 0.9], [hw * 0.4, -0.13, hd + 0.9]], y: -0.2 },
    state(g) {
      for (let k = 0; k < g.d.length; k += 2) { const i = g.d[k]; owner[i] = g.d[k + 1]; tint(i); pop[i] = 1; }
      if (g.d.length) tiles.instanceColor.needsUpdate = true;
      const seen = new Set();
      for (const [id, x, z] of g.bombs) {
        seen.add(id);
        if (!buckets.has(id)) { const b = new THREE.Group(); const can = new THREE.Mesh(bucketGeo, bucketMat); can.position.y = 0.25; can.castShadow = true; const blob = new THREE.Mesh(blobGeo, blobMat); blob.position.y = 0.55; b.add(can, blob); b.position.set(x, 3, z); b.userData.drop = 3; group.add(b); buckets.set(id, b); }
      }
      for (const [id, b] of buckets) if (!seen.has(id)) { group.remove(b); buckets.delete(id); }
      bar.set(g.c, g.left);
    },
    event(ev) {
      if (ev.e !== 'splat') return;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: SEATS[ev.seat].color, transparent: true, opacity: 0.9 }));
      ring.position.set(ev.x, 0.12, ev.z); group.add(ring); splats.push({ ring, t: 0, r: ev.r });
      ctx.sfx('splat');
    },
    frame(dt, t) {
      let moved = false;
      for (let i = 0; i < pop.length; i++) if (pop[i] > 0) { pop[i] = Math.max(0, pop[i] - dt * 5); put(i, Math.sin(pop[i] * Math.PI) * 0.16); moved = true; }
      if (moved) tiles.instanceMatrix.needsUpdate = true;
      for (const b of buckets.values()) { b.userData.drop = Math.max(0, b.userData.drop - dt * 9); b.position.y = b.userData.drop + Math.abs(Math.sin(t * 3 + b.position.x)) * 0.12; b.rotation.y += dt * 1.5; }
      for (let i = splats.length - 1; i >= 0; i--) { const s = splats[i]; s.t += dt * 2.4; const k = s.t; s.ring.scale.setScalar(1 + k * s.r * 2.2); s.ring.material.opacity = Math.max(0, 0.9 - k); if (k >= 1) { group.remove(s.ring); s.ring.geometry.dispose(); s.ring.material.dispose(); splats.splice(i, 1); } }
    },
    dispose() { bar.el.remove(); },
  };
}
