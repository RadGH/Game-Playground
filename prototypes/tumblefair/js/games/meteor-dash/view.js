// METEOR DASH, as drawn: chunky lavender-stone hex tiles (each with a little rock spike underneath) floating over a
// glowing lava sea. A meteor shows as a red ring that closes in plus a dark shadow that grows, while the burning rock
// drops out of the sky onto it. Cracked tiles go dark, tiles about to drop shake orange, smashed tiles fall away.
import { TILES, HEX, RULES } from './sim.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage } = ctx;
  const N = TILES.length;
  // ---- lava sea + bubbles
  const lavaMat = new THREE.MeshBasicMaterial({ color: '#ff6a10' }), LAVA_A = new THREE.Color('#ff5a00'), LAVA_B = new THREE.Color('#ff9a1a');
  const lava = new THREE.Mesh(new THREE.CircleGeometry(70, 40).rotateX(-Math.PI / 2), lavaMat); lava.position.y = -3.2; group.add(lava);
  const crustMat = new THREE.MeshStandardMaterial({ color: '#3a1208', roughness: 1, flatShading: true });
  const crusts = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.2, 0.3, 7), crustMat, 26);
  const bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 10, 6), new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ff9a00', emissiveIntensity: 1 }), 18);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < 26; i++) { const a = i * 2.4, r = 11 + (i * 7.3) % 16; m4.compose(v.set(Math.sin(a) * r, -3.1, Math.cos(a) * r), q.identity(), sc.set(0.6 + (i % 4) * 0.5, 1, 0.5 + (i % 3) * 0.6)); crusts.setMatrixAt(i, m4); }
  group.add(crusts, bubbles);
  const bub = Array.from({ length: 18 }, (_, i) => ({ a: i * 1.9, r: 9 + (i * 5.1) % 12, ph: i * 0.37 }));
  // ---- tiles: a hex prism (top at y = 0) and a spike under it, both instanced, one slot per tile
  const tileMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(HEX * 0.95, HEX * 0.9, 0.6, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
  const spikeMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(HEX * 0.78, 1.7, 6).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: '#5b4a6e', roughness: 1 }), N);
  tileMesh.receiveShadow = true; tileMesh.castShadow = true; group.add(tileMesh, spikeMesh);
  const WHOLE = ['#7d8cff', '#93a0ff', '#6c7cf0'].map(c => new THREE.Color(c)), CRACK = new THREE.Color('#3d3f73'), SHAKE = new THREE.Color('#ff8a4a');
  const st = new Int8Array(N), drop = new Float32Array(N);     // state per tile; drop: how far a gone tile has fallen
  const put = (i, dy = 0, jx = 0, jz = 0, s = 1) => {
    const t = TILES[i];
    m4.compose(v.set(t.x + jx, -0.3 + dy, t.z + jz), q.identity(), sc.set(s, 1, s)); tileMesh.setMatrixAt(i, m4);
    m4.compose(v.set(t.x + jx, -1.45 + dy, t.z + jz), q.identity(), sc.set(s, 1, s)); spikeMesh.setMatrixAt(i, m4);
  };
  const tint = i => tileMesh.setColorAt(i, st[i] === 3 ? SHAKE : st[i] === 1 ? CRACK : WHOLE[(i * 7) % 3]);
  const setTile = (i, s) => { const was = st[i]; st[i] = s; if (s === 0 && was !== 0) drop[i] = 0.001; tint(i); };
  ctx.init.tiles.forEach((s, i) => { st[i] = s; tint(i); put(i, s === 0 ? -40 : s === 1 ? -0.08 : 0, 0, 0, s === 0 ? 0 : 1); });
  tileMesh.instanceColor.needsUpdate = true;
  // ---- meteors: a closing ring, a growing shadow, the burning rock and its tail
  const ringGeo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const rockGeo = new THREE.DodecahedronGeometry(0.62, 0), tailGeo = new THREE.ConeGeometry(0.5, 2.6, 8);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#4a2a1c', emissive: '#ff5a00', emissiveIntensity: 0.7, roughness: 0.9, flatShading: true });
  const tailMat = new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.7, depthWrite: false });
  const meteors = new Map(), fx = [];
  function addMeteor(id, x, z, left) {
    const g = new THREE.Group(); g.position.set(x, 0, z);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.95, depthWrite: false })); ring.position.y = 0.04;
    const shadow = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: '#2a0010', transparent: true, opacity: 0.2, depthWrite: false })); shadow.position.y = 0.03;
    const rock = new THREE.Mesh(rockGeo, rockMat), tail = new THREE.Mesh(tailGeo, tailMat); rock.castShadow = true;     // the tail does not spin with the rock
    g.add(ring, shadow, rock, tail); group.add(g);
    meteors.set(id, { g, ring, shadow, rock, tail, left, seen: true });
  }
  function dropMeteor(m) { group.remove(m.g); m.ring.material.dispose(); m.shadow.material.dispose(); }
  const debrisGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3), debrisMat = new THREE.MeshStandardMaterial({ color: '#7d8cff' });
  const bar = scoreBar(ctx, { unit: 'sec' });
  const outSet = new Set(), winners = new Set();
  return {
    state(g) {
      let colors = false;
      for (let k = 0; k < g.d.length; k += 2) { setTile(g.d[k], g.d[k + 1]); colors = true; }
      if (colors) tileMesh.instanceColor.needsUpdate = true;
      for (const m of meteors.values()) m.seen = false;
      for (const [id, x, z, left] of g.m) { const m = meteors.get(id); if (m) { m.seen = true; m.left = Math.min(m.left, left); } else addMeteor(id, x, z, left); }
      for (const [id, m] of meteors) if (!m.seen) { dropMeteor(m); meteors.delete(id); }
      for (const pid of g.out) if (!outSet.has(pid)) { outSet.add(pid); bar.mark(pid, 'out'); }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'boom') {
        ctx.sfx('splat');
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffcf3a', transparent: true, opacity: 1, depthWrite: false })); ring.position.set(ev.x, 0.1, ev.z); group.add(ring);
        const bits = []; for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(debrisGeo, debrisMat); const a = i * 0.9 + ev.x; b.position.set(ev.x, 0.3, ev.z); b.userData.v = [Math.sin(a) * 4, 6 + (i % 3) * 2, Math.cos(a) * 4]; group.add(b); bits.push(b); }
        fx.push({ ring, bits, t: 0 });
      } else if (ev.e === 'fall') { ctx.sfx('out'); floatText(stage, ev.x, 0.5, ev.z, 'OUT!', 'bad'); }
      else if (ev.e === 'bonk') { if (ev.pid === ctx.me) ctx.sfx('hit'); ctx.actor(ev.pid)?.play('hit', 450); }
      else if (ev.e === 'hop') { if (ev.pid === ctx.me) ctx.sfx('tap'); }
      else if (ev.e === 'win') { winners.add(ev.pid); if (ev.pid === ctx.me) ctx.sfx('win'); }
    },
    pose(pid, flags, b) {
      if (winners.has(pid)) return 'cheer';
      if (flags & F.OUT || b.y < -0.05) return 'hit';
      if (flags & F.STUN) return 'hit';
      return flags & F.AIR ? 'jump' : undefined;
    },
    frame(dt, t) {
      lavaMat.color.copy(LAVA_A).lerp(LAVA_B, 0.5 + Math.sin(t * 2.1) * 0.5);
      bub.forEach((b, i) => { const k = (t * 0.6 + b.ph) % 1; m4.compose(v.set(Math.sin(b.a) * b.r, -3.2 + Math.sin(k * Math.PI) * 0.4, Math.cos(b.a) * b.r), q.identity(), sc.setScalar(Math.sin(k * Math.PI) + 0.05)); bubbles.setMatrixAt(i, m4); });
      bubbles.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < N; i++) {          // ~90 tiles: cheap enough to rewrite every frame
        if (st[i] === 3) { put(i, -0.04, Math.sin(t * 47 + i) * 0.07, Math.cos(t * 39 + i * 2) * 0.07); }
        else if (st[i] === 0 && drop[i] > 0 && drop[i] < 40) { drop[i] += dt * (2 + drop[i] * 3); put(i, -drop[i], 0, 0, drop[i] > 6 ? 0 : 1); if (drop[i] > 6) drop[i] = 40; }
        else if (st[i] === 1 || st[i] === 2) { put(i, st[i] === 1 ? -0.08 : 0); }
      }
      tileMesh.instanceMatrix.needsUpdate = true; spikeMesh.instanceMatrix.needsUpdate = true;
      for (const m of meteors.values()) {
        m.left = Math.max(0, m.left - dt); const k = 1 - m.left / RULES.warn;      // 0 -> 1 as it comes down
        m.ring.scale.setScalar(RULES.blast * (1.6 - k * 0.6)); m.ring.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 14));
        m.shadow.scale.setScalar(RULES.blast * (0.25 + k * 0.75)); m.shadow.material.opacity = 0.15 + k * 0.45;
        m.rock.position.y = 0.4 + 17 * (1 - k) * (1 - k); m.tail.position.y = m.rock.position.y + 1.6; m.rock.rotation.x += dt * 5; m.rock.rotation.z += dt * 3;
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt;
        f.ring.scale.setScalar(0.5 + f.t * 9); f.ring.material.opacity = Math.max(0, 1 - f.t * 2.2);
        for (const b of f.bits) { const u = b.userData.v; u[1] -= 22 * dt; b.position.x += u[0] * dt; b.position.y += u[1] * dt; b.position.z += u[2] * dt; b.rotation.x += dt * 8; }
        if (f.t > 1) { group.remove(f.ring); f.ring.material.dispose(); for (const b of f.bits) group.remove(b); fx.splice(i, 1); }
      }
    },
    dispose() { bar.el.remove(); },
  };
}
