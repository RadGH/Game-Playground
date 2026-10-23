// SKY SERPENT, as drawn: a round stone lookout floating over a sea of clouds (puffy white balls far below, one
// instanced mesh), a low rim wall, and four brass harpoon cannons on the rim — each with a ground ring that is GREEN
// and says it is loaded, grey while it reloads. The serpent is a paper-lantern dragon: a round red head with a big
// nose, googly eyes, gold horns and whiskers, then a chain of red/gold lantern segments (ONE instanced mesh) that
// follow the head's own trail, ending in a ribbon tail. A dive: a dark shadow slides after its target, turns red and
// flashes when it locks, then the head swoops into it. Dazed: stars spin over its head and the HUD says DOUBLE.
// Harpoons are little silver darts with a rope line back to their cannon.
import { RULES, CANNONS } from './sim.js';
import { bossKit } from '../boss-kit-view.js';
import { scoreBar, floatText } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const SEG = 16, GAP = 0.62;

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const R = meta.arena.r;
  const K = bossKit(ctx, { name: 'Sky Serpent', color: 'linear-gradient(#ff8a7a, #d8343f)' });
  const { std, basic, mesh, keep } = K;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), e = new THREE.Euler();

  // ---- clouds below, the lookout, the rim
  mesh(keep(new THREE.PlaneGeometry(120, 90).rotateX(-Math.PI / 2)), std('#cfe6ff', { roughness: 1 }), 0, -7, 0);
  const cloudN = 46, clouds = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 12, 8)), std('#ffffff', { roughness: 1 }), cloudN);
  for (let i = 0; i < cloudN; i++) { const a = i * 2.39996, rr = R + 3 + (i % 7) * 2.2, s = 1.4 + (i % 5) * 0.5; m4.compose(v.set(Math.sin(a) * rr, -3.5 - (i % 3), Math.cos(a) * rr), q.identity(), sc.set(s * 1.6, s * 0.7, s)); clouds.setMatrixAt(i, m4); }
  group.add(clouds);
  const top = mesh(keep(new THREE.CylinderGeometry(R + 0.35, R - 0.6, 1.4, 40)), std('#b9b3c9', { roughness: 0.9 }), 0, -0.7, 0); top.receiveShadow = true;
  mesh(keep(new THREE.ConeGeometry(R - 0.6, 4, 40).rotateX(Math.PI)), std('#9a93ad', { roughness: 0.9 }), 0, -3.4, 0);
  mesh(keep(new THREE.CircleGeometry(R - 1.8, 40).rotateX(-Math.PI / 2)), std('#d3cde0'), 0, 0.01, 0).receiveShadow = true;
  const rim = mesh(keep(new THREE.TorusGeometry(R + 0.2, 0.22, 8, 64).rotateX(Math.PI / 2)), std('#8b84a3'), 0, 0.18, 0); rim.castShadow = true;

  // ---- cannons
  const brass = std('#d9a74a', { metalness: 0.5, roughness: 0.4 }), iron = std('#4a4f5c', { metalness: 0.4, roughness: 0.5 });
  const cannons = CANNONS.map((c, i) => {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z); group.add(g);
    mesh(keep(new THREE.CylinderGeometry(0.5, 0.6, 0.6, 14)), iron, 0, 0.3, 0, g);
    const yawG = new THREE.Group(); yawG.position.y = 0.75; g.add(yawG);
    const barrel = mesh(keep(new THREE.CylinderGeometry(0.17, 0.24, 1.5, 12).rotateX(Math.PI / 2)), brass, 0, 0, 0.45, yawG); barrel.rotation.x = -0.35;
    mesh(keep(new THREE.ConeGeometry(0.16, 0.35, 8).rotateX(Math.PI / 2)), std('#e6e9f0', { metalness: 0.6 }), 0, 0.28, 1.25, yawG);
    const ring = mesh(keep(new THREE.RingGeometry(RULES.reach - 0.12, RULES.reach, 32).rotateX(-Math.PI / 2)), basic('#5fe07a', { opacity: 0.9 }), 0, 0.04, 0, g);
    g.traverse(o => { if (o.isMesh && o !== ring) o.castShadow = true; });
    yawG.rotation.y = c.a;
    return { g, yawG, ring, yaw: c.a };
  });

  // ---- the serpent
  const red = std('#e8434f', { roughness: 0.5 }), gold = std('#ffd23f', { roughness: 0.4, metalness: 0.2 }), white = std('#ffffff', { roughness: 0.3 }), ink = std('#1d2228');
  const head = new THREE.Group(); group.add(head);
  const hb = new THREE.Group(); head.add(hb);
  mesh(keep(new THREE.SphereGeometry(0.85, 22, 16)), red, 0, 0, 0, hb).scale.set(1, 0.9, 1.15);
  mesh(keep(new THREE.SphereGeometry(0.42, 16, 12)), std('#ff9aa8'), 0, -0.12, 0.95, hb);
  for (const sx of [-1, 1]) {
    const eg = mesh(keep(new THREE.SphereGeometry(0.3, 14, 10)), white, sx * 0.42, 0.38, 0.55, hb); mesh(keep(new THREE.SphereGeometry(0.14, 10, 8)), ink, 0, 0, 0.2, eg);
    const hn = mesh(keep(new THREE.ConeGeometry(0.12, 0.6, 8)), gold, sx * 0.4, 0.8, -0.2, hb); hn.rotation.x = -0.5;
    const wk = mesh(keep(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 5)), gold, sx * 0.55, -0.2, 1.0, hb); wk.rotation.z = sx * 1.2; wk.rotation.y = sx * 0.4;
  }
  const dizzy = new THREE.Group(); dizzy.position.y = 1.2; head.add(dizzy); dizzy.visible = false;
  const starGeo = keep(new THREE.OctahedronGeometry(0.18, 0)), starM = std('#ffd23f', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.6 });
  for (let k = 0; k < 4; k++) mesh(starGeo, starM, Math.sin(k * Math.PI / 2) * 0.8, 0, Math.cos(k * Math.PI / 2) * 0.8, dizzy);
  const body = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.62, 14, 10)), std('#ffffff', { roughness: 0.5 }), SEG);
  for (let i = 0; i < SEG; i++) body.setColorAt(i, col.set(i % 3 === 2 ? '#ffd23f' : '#e8434f'));
  body.castShadow = true; body.frustumCulled = false; group.add(body);
  const tail = mesh(keep(new THREE.PlaneGeometry(0.9, 1.6)), std('#ffd23f', { side: THREE.DoubleSide }), 0, 0, 0);
  head.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const trail = [];            // recent head positions, newest first, spaced as the head moves

  // ---- the dive shadow
  const shadow = new THREE.Group(); group.add(shadow); shadow.visible = false;
  const shDisc = mesh(keep(new THREE.CircleGeometry(RULES.shadowR, 32).rotateX(-Math.PI / 2)), basic('#1b1630', { opacity: 0.45 }), 0, 0.05, 0, shadow);
  const shRing = mesh(keep(new THREE.RingGeometry(RULES.shadowR - 0.14, RULES.shadowR, 40).rotateX(-Math.PI / 2)), basic('#ff3b3b', { opacity: 0.9 }), 0, 0.06, 0, shadow);

  // ---- harpoons
  const darts = new Map(), dartGeo = keep(new THREE.ConeGeometry(0.12, 0.7, 8).rotateX(Math.PI / 2)), steel = std('#e6e9f0', { metalness: 0.7, roughness: 0.3 });

  const bar = scoreBar(ctx, { unit: 'damage' });
  const frameCam = () => ctx.camera({ cx: 0, cz: 0, hw: RULES.circleR + 0.6, hd: RULES.circleR + 0.3, tall: 3 }, { instant: true });
  frameCam(); addEventListener('resize', frameCam);
  let G = null, hx = 0, hz = -RULES.circleR, hy = RULES.high, hyaw = 0, shx = 0, shz = 0;

  return {
    start() { frameCam(); K.banner('Man the cannons!'); },
    state(g) {
      G = g;
      K.hp(g.hp, init.hpMax);
      K.row(g.ph === 'dazed' ? '<span class="bk-tag hot">DAZED — double damage!</span>' : g.sh ? '<span class="bk-tag hot">Shadow! B = dash out</span>' : '<span class="bk-tag">Face it from a cannon + A</span>');
      g.rl.forEach((r, i) => { const c = cannons[i]; c.ring.material.color.set(r > 0 ? '#9aa0ab' : '#5fe07a'); });
      const seen = new Set();
      for (const [id, x, z, yaw] of g.hs || []) {
        seen.add(id); let d = darts.get(id);
        if (!d) { const m = mesh(dartGeo, steel, x, 1.0, z); m.castShadow = true; d = { m, x, z, yaw, y: 1.0 }; darts.set(id, d); }
        d.x = x; d.z = z; d.yaw = yaw;
      }
      for (const [id, d] of darts) if (!seen.has(id)) { group.remove(d.m); darts.delete(id); }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'fire') { ctx.sfx(ev.pid === me ? 'throw' : 'tap'); if (ev.pid === me) ctx.actor(me)?.play('throw', 380); }
      else if (ev.e === 'hit') { K.puff(ev.x, hy, ev.z, '#ffd23f', ev.dmg > 1 ? 1.6 : 1); floatText(stage, ev.x, hy + 1, ev.z, ev.dmg > 1 ? '-2 DOUBLE!' : '-1', 'good'); ctx.sfx(ev.pid === me ? 'coins' : 'hit'); }
      else if (ev.e === 'mark') { if (ev.pid === me) { K.banner('It’s diving at YOU!', 'warn', 1100); ctx.sfx('trap'); } else K.banner('Dive incoming!', 'warn', 900); }
      else if (ev.e === 'lock') ctx.sfx('trap');
      else if (ev.e === 'crash') { K.puff(ev.x, 0.4, ev.z, '#ffffff', 2.2); K.puff(ev.x, 0.8, ev.z, '#ffd23f', 1.2); ctx.sfx('splat'); }
      else if (ev.e === 'dazed') K.banner('Dazed! Fire!', 'good', 1100);
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, 'WHOOSH!', 'bad'); }
      else if (ev.e === 'reload') { if (ev.pid === me) { const c = CANNONS[ev.c]; floatText(stage, c.x, 1.8, c.z, 'Reloading…', ''); } }
      else if (ev.e === 'nocannon') { if (ev.pid === me) { const p = ctx.pos(me); if (p) floatText(stage, p.x, 2, p.z, 'Stand at a cannon!', ''); ctx.sfx('tap'); } }
      else if (ev.e === 'dash') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { K.banner(ev.ok ? 'Serpent beaten!' : 'The serpent flies free!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.B) ctx.actor(me)?.play('jump', 300); },
    pose(pid, flags) { if (flags & F.STUN) return 'hit'; if (G?.ph === 'end') return G.hp <= 0 ? 'cheer' : 'sitGround'; return undefined; },
    frame(dt, t) {
      K.frame(dt, t);
      if (G) {
        const [sx, sz, sy, syaw] = G.s, k = Math.min(1, dt * 12);
        hx += (sx - hx) * k; hz += (sz - hz) * k; hy += (sy - hy) * k;
        let d = syaw - hyaw; d = Math.atan2(Math.sin(d), Math.cos(d)); hyaw += d * k;
      }
      const wob = Math.sin(t * 5) * 0.12;
      head.position.set(hx, hy + wob, hz); head.rotation.y = hyaw;
      hb.rotation.z = G?.ph === 'dazed' ? Math.sin(t * 6) * 0.3 : 0;
      dizzy.visible = G?.ph === 'dazed'; dizzy.rotation.y = t * 4;
      // body: follow the head's trail
      if (!trail.length || Math.hypot(trail[0][0] - hx, trail[0][2] - hz) + Math.abs(trail[0][1] - hy) > 0.12) { trail.unshift([hx, hy + wob, hz]); if (trail.length > 160) trail.pop(); }
      let si = 0, acc = 0, want = GAP;
      for (let i = 1; i < trail.length && si < SEG; i++) {
        const a = trail[i - 1], b = trail[i], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); acc += L;
        while (acc >= want && si < SEG) { const over = acc - want, f = L > 0 ? 1 - over / L : 0, x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f, z = a[2] + (b[2] - a[2]) * f, r = 1 - si / SEG * 0.55; m4.compose(v.set(x, y + Math.sin(t * 4 - si * 0.6) * 0.12, z), q.identity(), sc.setScalar(r)); body.setMatrixAt(si++, m4); want += GAP; }
      }
      body.count = si; body.instanceMatrix.needsUpdate = true;
      if (si) { body.getMatrixAt(si - 1, m4); v.setFromMatrixPosition(m4); tail.position.copy(v); tail.rotation.set(0, hyaw + Math.sin(t * 6) * 0.6, 0); }
      // shadow
      shadow.visible = !!G?.sh;
      if (G?.sh) {
        const [x, z, , mode] = G.sh, k = Math.min(1, dt * 14); shx += (x - shx) * k; shz += (z - shz) * k; if (shadow.userData.fresh !== true) { shx = x; shz = z; shadow.userData.fresh = true; }
        shadow.position.set(shx, 0, shz); shRing.material.opacity = mode >= 1 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 20)) : 0.55;
        shRing.material.color.set(mode >= 1 ? '#ff3b3b' : '#ffb04a'); shDisc.material.opacity = mode >= 1 ? 0.6 : 0.4;
      } else shadow.userData.fresh = false;
      // cannons swivel toward whoever is manning them
      cannons.forEach((c, i) => {
        let want = CANNONS[i].a;
        for (const p of ctx.players) { const pp = ctx.pos(p.pid); if (pp && Math.hypot(pp.x - CANNONS[i].x, pp.z - CANNONS[i].z) <= RULES.reach) want = pp.yaw; }
        let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 12); c.yawG.rotation.y = c.yaw;
      });
      // darts fly on between updates and rise toward the serpent
      for (const d of darts.values()) { d.x += Math.sin(d.yaw) * RULES.speed * dt; d.z += Math.cos(d.yaw) * RULES.speed * dt; d.y += (hy - d.y) * Math.min(1, dt * 5); d.m.position.set(d.x, d.y, d.z); d.m.rotation.y = d.yaw; }
    },
    dispose() { removeEventListener('resize', frameCam); bar.el.remove(); K.dispose(); },
  };
}
