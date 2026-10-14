// SNOWBALL SHOWDOWN, as drawn: a round slab of shiny pale-blue ice with lumpy snow packed round its sides (below the
// top, so it is not a wall), floating on a deep sea dotted with ice floes and little bergs. Snowballs are white
// spheres flying at chest height; a hit throws up a white puff. A player coming back blinks while nothing can hit
// them. Lives show as hearts on each score chip. Solo: snowmen to knock into the sea.
import { RULES } from './sim.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const R = meta.arena.r;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  // ---- sea, floes, bergs
  const sea = new THREE.Mesh(new THREE.CircleGeometry(70, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#1f6fa8', roughness: 0.35, metalness: 0.1 })); sea.position.y = -3.4; group.add(sea);
  const floes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.3, 7), new THREE.MeshStandardMaterial({ color: '#e8f6ff', roughness: 0.5 }), 22);
  const bergs = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 5), new THREE.MeshStandardMaterial({ color: '#d4f0ff', roughness: 0.4, flatShading: true }), 7);
  for (let i = 0; i < 22; i++) { const a = i * 2.7, r = 11 + (i * 5.3) % 14; m4.compose(v.set(Math.sin(a) * r, -3.3, Math.cos(a) * r), q.setFromEuler(e3.set(0, a, 0)), sc.set(0.5 + (i % 4) * 0.4, 1, 0.4 + (i % 3) * 0.4)); floes.setMatrixAt(i, m4); }
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.4, r = 15 + (i * 3.7) % 8; m4.compose(v.set(Math.sin(a) * r, -2.4, Math.cos(a) * r), q.identity(), sc.set(1 + (i % 3) * 0.5, 1 + (i % 2) * 0.6, 1 + (i % 3) * 0.4)); bergs.setMatrixAt(i, m4); }
  group.add(floes, bergs);
  // ---- the rink: ice slab, painted rings, snow packed round the side
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, 1.6, 56), new THREE.MeshStandardMaterial({ color: '#bfeaff', roughness: 0.12, metalness: 0.15 }));
  ice.position.y = -0.8; ice.receiveShadow = true; group.add(ice);
  const paint = new THREE.MeshBasicMaterial({ color: '#5fb6ff', transparent: true, opacity: 0.55, depthWrite: false });
  for (const [a, b] of [[2.6, 2.8], [5.4, 5.6], [R - 0.55, R - 0.35]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 64).rotateX(-Math.PI / 2), paint); ring.position.y = 0.01; group.add(ring); }
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5a7a', transparent: true, opacity: 0.7, depthWrite: false })); dot.position.y = 0.012; group.add(dot);
  const LUMPS = 46, lumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), LUMPS);
  for (let i = 0; i < LUMPS; i++) { const a = i / LUMPS * Math.PI * 2, r = R - 0.05; m4.compose(v.set(Math.sin(a) * r, -0.62 - (i % 3) * 0.12, Math.cos(a) * r), q.setFromEuler(e3.set(i, i * 2, 0)), sc.setScalar(0.75 + (i % 4) * 0.12)); lumps.setMatrixAt(i, m4); }
  lumps.castShadow = true; group.add(lumps);
  // ---- snowballs, puffs, snowmen
  const ballGeo = new THREE.SphereGeometry(0.24, 12, 8), ballMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  const balls = new Map(), puffs = [], snowmen = new Map();
  const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
  function puff(x, z, y = 1) { const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })); p.position.set(x, y, z); group.add(p); puffs.push({ p, t: 0 }); }
  const snowMat = new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.8 }), coal = new THREE.MeshStandardMaterial({ color: '#222' }), carrot = new THREE.MeshStandardMaterial({ color: '#ff8a1f' });
  const sGeo = [new THREE.SphereGeometry(0.62, 14, 10), new THREE.SphereGeometry(0.46, 14, 10), new THREE.SphereGeometry(0.34, 14, 10)], eyeGeo = new THREE.SphereGeometry(0.05, 6, 4), noseGeo = new THREE.ConeGeometry(0.07, 0.35, 8).rotateX(Math.PI / 2);
  function makeSnowman() {
    const g = new THREE.Group(); let y = 0.55;
    sGeo.forEach((geo, i) => { const s = new THREE.Mesh(geo, snowMat); s.position.y = y; s.castShadow = true; g.add(s); y += [0.85, 0.66, 0][i]; });
    for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(eyeGeo, coal); e.position.set(sx, 2.12, 0.3); g.add(e); }
    const n = new THREE.Mesh(noseGeo, carrot); n.position.set(0, 2.04, 0.45); g.add(n);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.34, 12), new THREE.MeshStandardMaterial({ color: '#c8324a' })); hat.position.y = 2.42; g.add(hat);
    return g;
  }
  // ---- score bar with hearts
  const bar = scoreBar(ctx, { unit: 'KOs' });
  const hearts = new Map();
  for (const p of ctx.players) { const c = bar.el.querySelector(`[data-pid="${p.pid}"]`); const hEl = document.createElement('i'); hEl.className = 'sb-lives'; c?.querySelector('.nm')?.after(hEl); hearts.set(p.pid, hEl); }
  const name = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  const flagsOf = new Map();
  return {
    state(g) {
      const seen = new Set();
      for (const [id, x, z] of g.s) {
        seen.add(id); let b = balls.get(id);
        if (!b) { b = new THREE.Mesh(ballGeo, ballMat); b.castShadow = true; b.position.set(x, 1, z); b.userData.to = new THREE.Vector3(x, 1, z); group.add(b); balls.set(id, b); }
        b.userData.to.set(x, 1, z);
      }
      for (const [id, b] of balls) if (!seen.has(id)) { puff(b.position.x, b.position.z); group.remove(b); balls.delete(id); }
      if (g.sm) {
        const s2 = new Set();
        for (const [id, x, z, y] of g.sm) { s2.add(id); let s = snowmen.get(id); if (!s) { s = makeSnowman(); s.userData.pop = 0; s.position.set(x, y, z); group.add(s); snowmen.set(id, s); } s.userData.to = [x, y, z]; }
        for (const [id, s] of snowmen) if (!s2.has(id)) { group.remove(s); snowmen.delete(id); }
      }
      for (const [pid, n] of Object.entries(g.lv)) { const e = hearts.get(+pid); const txt = '♥'.repeat(n) + '♡'.repeat(Math.max(0, RULES.lives - n)); if (e && e.textContent !== txt) e.textContent = txt; bar.mark(+pid, 'out', n <= 0); }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      const a = ev.pid != null ? ctx.actor(ev.pid) : null;
      if (ev.e === 'throw') { a?.play('throw', 380); ctx.sfx('throw'); }
      else if (ev.e === 'dash') { a?.play('punch', 350); if (ev.pid === ctx.me) ctx.sfx('throw'); }
      else if (ev.e === 'hit') { puff(ev.x, ev.z); ctx.sfx('hit'); }
      else if (ev.e === 'shove') { puff(ev.x, ev.z, 0.8); ctx.sfx('hit'); }
      else if (ev.e === 'fall') { ctx.sfx('out'); floatText(stage, Math.max(-R, Math.min(R, ev.x)), 0.5, Math.max(-R, Math.min(R, ev.z)), ev.by >= 0 ? `KO! ${name(ev.by)}` : 'Splash!', ev.by >= 0 ? 'good' : 'bad'); }
      else if (ev.e === 'back') { if (ev.pid === ctx.me) ctx.sfx('pick'); }
      else if (ev.e === 'pop') { ctx.sfx('good'); floatText(stage, Math.max(-R, Math.min(R, ev.x)), 1.5, Math.max(-R, Math.min(R, ev.z)), '+1', 'good'); }
    },
    pose(pid, flags, b) {
      flagsOf.set(pid, flags);
      if (flags & F.STUN || b.y < -0.05) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      const k = 1 - Math.exp(-dt * 18);
      for (const b of balls.values()) b.position.lerp(b.userData.to, k);
      for (const s of snowmen.values()) { const [x, y, z] = s.userData.to; s.position.x += (x - s.position.x) * k; s.position.z += (z - s.position.z) * k; s.position.y += (y - s.position.y) * k; s.userData.pop = Math.min(1, s.userData.pop + dt * 3); s.scale.setScalar(s.userData.pop < 1 ? Math.sin(s.userData.pop * Math.PI / 2) * 1.1 : 1); s.rotation.y = Math.sin(t * 2 + x) * 0.15; }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt * 3; p.p.scale.setScalar(0.4 + p.t * 1.6); p.p.material.opacity = Math.max(0, 0.9 - p.t); if (p.t >= 1) { group.remove(p.p); p.p.material.dispose(); puffs.splice(i, 1); } }
      for (const [pid, f] of flagsOf) { const a = ctx.actor(pid); if (a) a.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0; }
    },
    dispose() { bar.el.remove(); },
  };
}
