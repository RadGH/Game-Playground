// SNOWBALL SHOWDOWN, as drawn: a round slab of shiny pale-blue ice with lumpy snow packed round its sides (below the
// top, so it is not a wall), floating on a deep sea dotted with ice floes and little bergs. Snowballs are white
// spheres flying at chest height; a hit throws up a white puff. A player coming back blinks while nothing can hit
// them. Lives show as hearts on each score chip. Solo: snowmen to knock into the sea.
import { RULES } from './sim.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { pumpkinGeo, witchHatGeo, faceTexture } from '../../client/halloween.js';
import { createJuice } from '../../client/juice.js';

export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const R = meta.arena.r, HW = ctx.season === 'halloween';     // Halloween: a lavender rink on a purple sea, glowing slime balls, pumpkin-headed snowmen
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  // ---- sea, floes, bergs
  const sea = new THREE.Mesh(new THREE.CircleGeometry(70, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: HW ? '#2a2058' : '#1f6fa8', roughness: 0.35, metalness: 0.1 })); sea.position.y = -3.4; group.add(sea);
  const floes = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.3, 7), new THREE.MeshStandardMaterial({ color: HW ? '#b9a8e0' : '#e8f6ff', roughness: 0.5 }), 22);
  const bergs = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 2.4, 5), new THREE.MeshStandardMaterial({ color: HW ? '#a894d8' : '#d4f0ff', roughness: 0.4, flatShading: true }), 7);
  for (let i = 0; i < 22; i++) { const a = i * 2.7, r = 11 + (i * 5.3) % 14; m4.compose(v.set(Math.sin(a) * r, -3.3, Math.cos(a) * r), q.setFromEuler(e3.set(0, a, 0)), sc.set(0.5 + (i % 4) * 0.4, 1, 0.4 + (i % 3) * 0.4)); floes.setMatrixAt(i, m4); }
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.4, r = 15 + (i * 3.7) % 8; m4.compose(v.set(Math.sin(a) * r, -2.4, Math.cos(a) * r), q.identity(), sc.set(1 + (i % 3) * 0.5, 1 + (i % 2) * 0.6, 1 + (i % 3) * 0.4)); bergs.setMatrixAt(i, m4); }
  group.add(floes, bergs);
  // ---- the rink: ice slab, painted rings, snow packed round the side
  const ice = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, 1.6, 56), new THREE.MeshStandardMaterial({ color: HW ? '#cdbdf2' : '#bfeaff', roughness: 0.12, metalness: 0.15 }));
  ice.position.y = -0.8; ice.receiveShadow = true; group.add(ice);
  const paint = new THREE.MeshBasicMaterial({ color: HW ? '#ff8a1a' : '#5fb6ff', transparent: true, opacity: 0.55, depthWrite: false });
  for (const [a, b] of [[2.6, 2.8], [5.4, 5.6], [R - 0.55, R - 0.35]]) { const ring = new THREE.Mesh(new THREE.RingGeometry(a, b, 64).rotateX(-Math.PI / 2), paint); ring.position.y = 0.01; group.add(ring); }
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: HW ? '#7dd84a' : '#ff5a7a', transparent: true, opacity: 0.7, depthWrite: false })); dot.position.y = 0.012; group.add(dot);
  const LUMPS = 46, lumps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: HW ? '#e6dcff' : '#ffffff', roughness: 0.9, flatShading: true }), LUMPS);
  for (let i = 0; i < LUMPS; i++) { const a = i / LUMPS * Math.PI * 2, r = R - 0.05; m4.compose(v.set(Math.sin(a) * r, -0.62 - (i % 3) * 0.12, Math.cos(a) * r), q.setFromEuler(e3.set(i, i * 2, 0)), sc.setScalar(0.75 + (i % 4) * 0.12)); lumps.setMatrixAt(i, m4); }
  lumps.castShadow = true; group.add(lumps);
  // ---- round 12: what stands on this rink (from the seed): snow forts, an igloo, ice pillars
  const juice = createJuice(ctx), kinds = ctx.init.kinds || [], posts = ctx.arena.posts || [];
  const blockMat = new THREE.MeshStandardMaterial({ color: HW ? '#e6dcff' : '#ffffff', roughness: 0.85, flatShading: true });
  const pillarMat = new THREE.MeshStandardMaterial({ color: HW ? '#b48cff' : '#9fdcff', roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.85 });
  const doorMat = new THREE.MeshStandardMaterial({ color: HW ? '#3a2466' : '#5d8fb5', roughness: 0.9 });
  const postMeshes = posts.map((o, i) => {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); group.add(g);
    const kind = kinds[i] || 'fort';
    if (kind === 'igloo') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(o.r, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), blockMat); dome.castShadow = true; g.add(dome);
      for (let k = 1; k < 4; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(o.r * Math.cos(k * 0.38), 0.035, 4, 28).rotateX(Math.PI / 2), doorMat); ring.position.y = o.r * Math.sin(k * 0.38); g.add(ring); }
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), doorMat); door.position.set(0, 0.35, o.r - 0.15); g.add(door);
    } else if (kind === 'pillar') {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(o.r * 0.7, o.r, 2.2, 6), pillarMat); p.position.y = 1.1; p.castShadow = true; g.add(p);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(o.r * 0.75, 0.6, 6), pillarMat); cap.position.y = 2.5; g.add(cap);
    } else {
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, b2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.42, 0.34), blockMat); b2.position.set(Math.sin(a) * (o.r - 0.2), 0.21 + (k % 2) * 0.42, Math.cos(a) * (o.r - 0.2)); b2.rotation.y = a; b2.castShadow = true; g.add(b2); }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(o.r - 0.05, o.r, 0.84, 10), blockMat); top.position.y = 0.42; top.castShadow = true; g.add(top);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.26), new THREE.MeshBasicMaterial({ color: HW ? '#ff8a1a' : ['#e8394a', '#3d8bff', '#ffd23f', '#5ec46b'][i % 4], side: THREE.DoubleSide })); flag.position.set(0.2, 1.55, 0); g.add(flag);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 5), doorMat); pole.position.y = 1.3; g.add(pole);
    }
    g.userData.wob = 0; return g;
  });
  // ---- snowballs, puffs, snowmen
  const ballGeo = new THREE.SphereGeometry(0.24, 12, 8), ballMat = HW ? new THREE.MeshStandardMaterial({ color: '#8dff5a', roughness: 0.25, emissive: '#3fbf2a', emissiveIntensity: 0.7 }) : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 });
  const balls = new Map(), puffs = [], snowmen = new Map();
  const puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
  function puff(x, z, y = 1) { const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: HW ? '#9cff7a' : '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })); p.position.set(x, y, z); group.add(p); puffs.push({ p, t: 0 }); }
  const snowMat = new THREE.MeshStandardMaterial({ color: '#f7fbff', roughness: 0.8 }), coal = new THREE.MeshStandardMaterial({ color: '#222' }), carrot = new THREE.MeshStandardMaterial({ color: '#ff8a1f' });
  const sGeo = [new THREE.SphereGeometry(0.62, 14, 10), new THREE.SphereGeometry(0.46, 14, 10), new THREE.SphereGeometry(0.34, 14, 10)], eyeGeo = new THREE.SphereGeometry(0.05, 6, 4), noseGeo = new THREE.ConeGeometry(0.07, 0.35, 8).rotateX(Math.PI / 2);
  const headGeo = HW ? pumpkinGeo(THREE, 0.4) : null, headMat = HW ? new THREE.MeshStandardMaterial({ color: '#ff7a14', roughness: 0.5, emissive: '#a83a00', emissiveIntensity: 0.3 }) : null;
  const faceGeo = HW ? new THREE.PlaneGeometry(0.56, 0.56) : null, faceMat = HW ? new THREE.MeshBasicMaterial({ map: faceTexture(THREE), transparent: true, depthWrite: false, toneMapped: false }) : null;
  const hatGeo = HW ? witchHatGeo(THREE, 0.36) : null, hatMat = HW ? new THREE.MeshStandardMaterial({ color: '#6a32b8', roughness: 0.7 }) : null;
  function makeSnowman() {
    const g = new THREE.Group(); let y = 0.55;
    sGeo.forEach((geo, i) => { const s = new THREE.Mesh(HW && i === 2 ? headGeo : geo, HW && i === 2 ? headMat : snowMat); s.position.y = y; s.castShadow = true; g.add(s); y += [0.85, 0.66, 0][i]; });
    for (const sx of [-0.12, 0.12]) { const e = new THREE.Mesh(eyeGeo, coal); e.position.set(sx, 2.12, 0.3); g.add(e); }
    if (HW) { const f = new THREE.Mesh(faceGeo, faceMat); f.position.set(0, 2.08, 0.47); g.add(f); const hat = new THREE.Mesh(hatGeo, hatMat); hat.position.y = 2.3; hat.rotation.z = 0.12; g.add(hat); return g; }
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
  let rinkShown = false;
  // Halloween dressing: pumpkins riding the ice floes, the mist down at sea level
  const floeSpots = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => { const a = i * 2.7, r = 11 + (i * 5.3) % 14; return [Math.sin(a) * r, -3.15, Math.cos(a) * r]; });
  return {
    halloween: { y: -3.2, spots: floeSpots, ghosts: [[-R - 2.6, 4.6, -R * 0.3], [R + 2.4, 4.9, -R * 0.5], [0.6, 5.4, -R - 3]] },
    state(g) {
      if (!rinkShown) { rinkShown = true; if (ctx.init.rinkName && posts.length) juice.say(ctx.init.rinkName + '!', 1500); }
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
      else if (ev.e === 'hit') { puff(ev.x, ev.z); ctx.sfx('hit'); if (ev.pid === ctx.me) { juice.flash('rgba(159,211,255,.9)', 200); juice.shake(0.08, 0.2); navigator.vibrate?.(40); } else if (ev.by === ctx.me && ev.pid != null) { floatText(stage, ev.x, 1.6, ev.z, 'Splat!', 'good'); } }
      else if (ev.e === 'thud') { puff(ev.x, ev.z, 0.8); ctx.sfx('dice'); let best = null, bd = 3; for (const [i, o] of posts.entries()) { const d = Math.hypot(o.x - ev.x, o.z - ev.z); if (d < bd) { bd = d; best = postMeshes[i]; } } if (best) best.userData.wob = 1; }
      else if (ev.e === 'shove') { puff(ev.x, ev.z, 0.8); ctx.sfx('hit'); }
      else if (ev.e === 'fall') {
        ctx.sfx('out'); floatText(stage, Math.max(-R, Math.min(R, ev.x)), 0.5, Math.max(-R, Math.min(R, ev.z)), ev.by >= 0 ? `KO! ${name(ev.by)}` : 'Splash!', ev.by >= 0 ? 'good' : 'bad');
        juice.shake(0.14, 0.3);
        if (ev.pid === ctx.me) { juice.flash('rgba(232,57,74,.8)', 260); juice.say(ev.lives > 0 ? `Splash! ${ev.lives} ${ev.lives === 1 ? 'life' : 'lives'} left` : 'Out of lives!', 1500, 'small'); }
        else if (ev.by === ctx.me) { juice.flash('rgba(255,210,63,.75)', 180); juice.say(`You knocked out ${name(ev.pid)}!`, 1300, 'small'); ctx.sfx('good'); }
        else if (ev.lives <= 0) juice.say(`${name(ev.pid)} is out!`, 1200, 'small');
      }
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
      juice.frame(dt, t);
      for (const m of postMeshes) if (m.userData.wob > 0) { m.userData.wob = Math.max(0, m.userData.wob - dt * 4); const w = m.userData.wob; m.scale.set(1 + w * 0.06, 1 - w * 0.05, 1 + w * 0.06); }
      for (const [pid, f] of flagsOf) { const a = ctx.actor(pid); if (a) a.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0; }
    },
    dispose() { bar.el.remove(); juice.dispose(); },
  };
}
