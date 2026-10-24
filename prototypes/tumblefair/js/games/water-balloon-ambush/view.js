// WATER BALLOON AMBUSH, as drawn: a grassy farmyard inside a low wooden fence, golden hay bales with twine, four
// wooden buckets with balloons poking out of the top (one for each balloon left in it), water balloons in the
// thrower's seat colour lobbed in an arc, a blue splash ring and a puddle where each bursts. While you wind up, a ring
// on the ground shows where the balloon will land (it grows with the wind-up). A tag over each character counts the
// balloons in their hands and says SOAKED. Solo: scarecrows that topple when soaked. Halloween: slime-green balloons,
// pumpkin buckets and pumpkin-headed scarecrows (the arena dressing adds the dusk, bats and ghosts).
import { scoreBar, floatText } from '../../client/gamehud.js';
import { pumpkinGeo, faceTexture } from '../../client/halloween.js';
import { RULES } from './sim.js';

export function createView(ctx) {
  const { THREE, group, stage, players, arena, init } = ctx, HW = ctx.season === 'halloween';
  const W = arena.hw, D = arena.hd, mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  // ---- yard, fence, bales, buckets
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 8, D * 2 + 8).rotateX(-Math.PI / 2), mat(HW ? '#3c5a34' : '#7cc95a')); ground.receiveShadow = true; group.add(ground);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), mat(HW ? '#4a6a3a' : '#93d86c')); yard.position.y = 0.005; yard.receiveShadow = true; group.add(yard);
  const posts = [], m4 = new THREE.Matrix4();
  for (let x = -W; x <= W + 0.01; x += 1.5) posts.push([x, -D - 0.25], [x, D + 0.25]);
  for (let z = -D + 1.5; z < D; z += 1.5) posts.push([-W - 0.25, z], [W + 0.25, z]);
  const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.8, 0.16), mat('#a9743f'), posts.length);
  posts.forEach(([x, z], i) => postMesh.setMatrixAt(i, m4.makeTranslation(x, 0.4, z))); group.add(postMesh);
  for (const [w, d, x, z] of [[W * 2 + 0.5, 0.08, 0, -D - 0.25], [W * 2 + 0.5, 0.08, 0, D + 0.25], [0.08, D * 2 + 0.5, -W - 0.25, 0], [0.08, D * 2 + 0.5, W + 0.25, 0]]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), mat('#c08a50')); rail.position.set(x, 0.6, z); group.add(rail);
  }
  const hay = mat(HW ? '#c9a23a' : '#e8c25a'), twine = mat('#8a5a2a');
  for (const o of arena.blocks || []) {
    const bale = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, 1, o.hd * 2), hay); bale.position.set(o.x, 0.5, o.z); bale.castShadow = bale.receiveShadow = true; group.add(bale);
    const long = o.hw > o.hd;
    for (const k of [-0.5, 0.5]) { const t = new THREE.Mesh(new THREE.BoxGeometry(long ? 0.08 : o.hw * 2 + 0.02, 1.02, long ? o.hd * 2 + 0.02 : 0.08), twine); t.position.set(o.x + (long ? k * o.hw : 0), 0.5, o.z + (long ? 0 : k * o.hd)); group.add(t); }
  }
  const balloonGeo = new THREE.SphereGeometry(0.2, 14, 10).scale(1, 1.15, 1);
  const bucketMats = HW ? mat('#ff7a14', { emissive: '#7a2a00', emissiveIntensity: 0.3 }) : mat('#9a6a3a');
  const BCOL = HW ? ['#8dff5a', '#b38dff', '#ff9a3a', '#8dff5a'] : ['#ff5f7a', '#4fa8ff', '#ffd23f', '#4fdc6a'];
  const buckets = init.buckets.map(k => {
    const g = new THREE.Group(); g.position.set(k.x, 0, k.z); group.add(g);
    const body = HW ? new THREE.Mesh(pumpkinGeo(THREE, 0.55), bucketMats) : new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.7, 16, 1, true), bucketMats);
    body.position.y = HW ? 0.45 : 0.35; body.castShadow = true; g.add(body);
    if (!HW) { const water = new THREE.Mesh(new THREE.CircleGeometry(0.52, 16).rotateX(-Math.PI / 2), mat('#5fc0e8', { roughness: 0.2 })); water.position.y = 0.6; g.add(water); }
    const balls = Array.from({ length: 4 }, (_, i) => { const b = new THREE.Mesh(balloonGeo, mat(BCOL[i], { roughness: 0.3 })); b.position.set(Math.cos(i * 1.57) * 0.22, HW ? 0.95 : 0.78, Math.sin(i * 1.57) * 0.22); g.add(b); return b; });
    return { g, balls };
  });
  // ---- flying balloons, splashes, puddles
  const seatCol = new Map(players.map(p => [p.pid, HW ? '#8dff5a' : p.color]));
  const flying = new Map(), splashes = [], puddles = new Map();
  const puddleGeo = new THREE.CircleGeometry(RULES.puddleR, 20).rotateX(-Math.PI / 2), puddleMat = new THREE.MeshStandardMaterial({ color: HW ? '#6a4ab8' : '#4fb0e8', roughness: 0.1, transparent: true, opacity: 0.7, depthWrite: false });
  const ringGeo = new THREE.TorusGeometry(1, 0.08, 6, 28).rotateX(Math.PI / 2);
  function splash(x, z) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: HW ? '#a8ff8a' : '#bfeaff', transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, 0.15, z); group.add(m); splashes.push({ m, t: 0 }); }
  // ---- aim rings (one per player, shown while winding up)
  const aims = new Map(players.map(p => { const r = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.85, depthWrite: false })); r.position.y = 0.03; r.visible = false; group.add(r); return [p.pid, r]; }));
  // ---- scarecrows (solo)
  const crows = new Map(), headGeo = HW ? pumpkinGeo(THREE, 0.32) : new THREE.SphereGeometry(0.28, 12, 10), headMat = HW ? mat('#ff7a14') : mat('#f2d9a0');
  const faceMat = HW ? new THREE.MeshBasicMaterial({ map: faceTexture(THREE), transparent: true, depthWrite: false, toneMapped: false }) : null;
  function scarecrow() {
    const g = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), twine); pole.position.y = 0.85; g.add(pole);
    const arms = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), twine); arms.position.y = 1.25; g.add(arms);
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.3), mat('#c8324a')); shirt.position.y = 1.1; g.add(shirt);
    const head = new THREE.Mesh(headGeo, headMat); head.position.y = 1.65; g.add(head);
    if (HW) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), faceMat); f.position.set(0, 1.63, 0.33); g.add(f); }
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.3, 12), mat('#c9a23a')); hat.position.y = 1.95; g.add(hat);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g;
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'soaks' });
  const tags = new Map();
  const name = pid => (pid === ctx.me ? 'You' : players.find(p => p.pid === pid)?.name || '?');
  let lastH = {};
  return {
    halloween: { spots: [[-W - 1.6, 0, -D + 1], [W + 1.6, 0, -D + 1], [-W - 1.6, 0, D - 1], [W + 1.6, 0, D - 1], [0, 0, -D - 1.6]] },
    state(g) {
      bar.set(g.sc, g.left); lastH = g.h;
      g.bk.forEach((n, i) => buckets[i].balls.forEach((b, j) => { b.visible = j < n; }));
      const seen = new Set();
      for (const [id, sx, sz, ex, ez, u, by] of g.f) {
        seen.add(id); let f = flying.get(id);
        if (!f) { f = { m: new THREE.Mesh(balloonGeo, mat(seatCol.get(by) || '#4fa8ff', { roughness: 0.3 })), sx, sz, ex, ez, u, shown: u }; f.m.castShadow = true; group.add(f.m); flying.set(id, f); }
        f.u = u;
      }
      for (const [id, f] of flying) if (!seen.has(id)) { group.remove(f.m); f.m.material.dispose(); flying.delete(id); }
      const pSeen = new Set();
      for (const [id, x, z] of g.pd) { pSeen.add(id); if (!puddles.has(id)) { const m = new THREE.Mesh(puddleGeo, puddleMat); m.position.set(x, 0.02, z); m.scale.setScalar(0.2); group.add(m); puddles.set(id, m); } }
      for (const [id, m] of puddles) if (!pSeen.has(id)) { group.remove(m); puddles.delete(id); }
      if (g.cr) {
        const cs = new Set();
        for (const [id, x, z, down] of g.cr) { cs.add(id); let c = crows.get(id); if (!c) { c = scarecrow(); c.position.set(x, 0, z); c.userData.pop = 0; group.add(c); crows.set(id, c); } c.userData.down = down; }
        for (const [id, c] of crows) if (!cs.has(id)) { group.remove(c); crows.delete(id); }
      }
      for (const p of players) {
        let t = tags.get(p.pid); const a = ctx.actor(p.pid);
        if (!t && a) { t = stage.tag(a.group, { text: '', height: (a.height || 1.6) + 0.95, cls: 'wb-tag' }); tags.set(p.pid, t); }
        const h = g.h[p.pid]; if (!t || !h) continue;
        const txt = h[2] ? 'SOAKED!' : h[0] ? '●'.repeat(h[0]) : 'empty: find a bucket';
        if (t.text !== txt) { t.set(txt); t.text = txt; t.el.classList.toggle('soaked', !!h[2]); t.el.classList.toggle('empty', !h[0] && !h[2]); }
      }
    },
    event(ev) {
      const a = ev.pid != null ? ctx.actor(ev.pid) : null;
      if (ev.e === 'throw') { a?.play('throw', 380); ctx.sfx('throw'); }
      else if (ev.e === 'burst') { splash(ev.x, ev.z); ctx.sfx(ev.soaked.length ? 'splat' : 'tap'); if (ev.soaked.length) floatText(stage, ev.x, 1.2, ev.z, ev.soaked.includes(ctx.me) ? 'Soaked!' : ev.by === ctx.me ? `+${ev.soaked.length}` : `${name(ev.by)} +${ev.soaked.length}`, ev.by === ctx.me ? 'good' : ev.soaked.includes(ctx.me) ? 'bad' : ''); }
      else if (ev.e === 'grab' || ev.e === 'scoop') { if (ev.pid === ctx.me) ctx.sfx('pick'); }
      else if (ev.e === 'dash') { a?.play('jump', 300); }
      else if (ev.e === 'empty' && ev.pid === ctx.me) ctx.sfx('bad');
    },
    frame(dt, t) {
      const k = 1 - Math.exp(-dt * 16);
      for (const f of flying.values()) {
        f.shown = Math.min(1, f.shown + (f.u - f.shown) * k + dt * 0.5);
        const u = f.shown, d = Math.hypot(f.ex - f.sx, f.ez - f.sz);
        f.m.position.set(f.sx + (f.ex - f.sx) * u, 1.3 + Math.sin(u * Math.PI) * RULES.arc * d - u * 1.1, f.sz + (f.ez - f.sz) * u);
        f.m.rotation.z = t * 6;
      }
      for (let i = splashes.length - 1; i >= 0; i--) { const s = splashes[i]; s.t += dt * 2.2; s.m.scale.setScalar(0.3 + s.t * 1.3); s.m.material.opacity = Math.max(0, 0.9 - s.t); if (s.t >= 1) { group.remove(s.m); s.m.material.dispose(); splashes.splice(i, 1); } }
      for (const m of puddles.values()) if (m.scale.x < 1) m.scale.setScalar(Math.min(1, m.scale.x + dt * 3));
      for (const c of crows.values()) { c.userData.pop = Math.min(1, c.userData.pop + dt * 3); const tilt = c.userData.down ? Math.min(1.4, (c.rotation.x || 0) + dt * 4) : 0; c.rotation.x = tilt; c.scale.setScalar(Math.sin(c.userData.pop * Math.PI / 2)); }
      for (const p of players) {
        const ring = aims.get(p.pid), h = lastH[p.pid], a = ctx.actor(p.pid);
        if (!h || h[1] < 0 || !a) { ring.visible = false; continue; }
        const pos = ctx.pos(p.pid) || a.group.position, yaw = a.body?.group?.rotation?.y ?? 0, r = RULES.minRange + (RULES.maxRange - RULES.minRange) * h[1] / 100;
        ring.visible = true; ring.position.set(Math.max(-W, Math.min(W, pos.x + Math.sin(yaw) * r)), 0.03, Math.max(-D, Math.min(D, pos.z + Math.cos(yaw) * r))); ring.scale.setScalar(1 + Math.sin(t * 10) * 0.08);
      }
    },
    dispose() { bar.el.remove(); for (const t of tags.values()) t.remove(); },
  };
}
