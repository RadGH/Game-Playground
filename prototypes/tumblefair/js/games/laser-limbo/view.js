// LASER LIMBO, as drawn: a chunky round toy stage (deep violet top with bright tile rings, a rim of fat yellow and
// pink bumpers) on a mint-and-cream floor. A beam is a bright glowing bar between two chunky emitter posts, with a
// stripe painted on the floor under it so you can read where it is from above, and a HOP / DUCK label riding on one
// post. LOW beams are orange at shin height, HIGH beams purple at head height (height and label as well as colour).
// A spinner glows faintly round a centre pivot before it goes live. A zap throws a white-yellow flash and sparks.
import { LOW, SWEEP, incoming } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';

const H = [0.38, 1.3];                     // drawn beam height for LOW / HIGH (the rule is in sim.js `catches`)
const COL = ['#ff8a1a', '#b14dff'], CORE = ['#fff1c2', '#f3dcff'];
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const R = meta.arena.r, LEN = R * 2 + 1.4;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // ---- floor round the stage, the stage, tile rings, bumpers
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#9fe6cf', roughness: 0.9 }));
  ground.position.y = -0.62; ground.receiveShadow = true; group.add(ground);
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.6, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#fff7d6', roughness: 0.9 }), 40);
  for (let i = 0; i < 40; i++) { const a = i * 2.39, r = R + 2.5 + (i * 3.1) % 14; m4.compose(v.set(Math.sin(a) * r, -0.6, Math.cos(a) * r), q.identity(), sc.setScalar(0.6 + (i % 3) * 0.4)); dots.setMatrixAt(i, m4); }
  group.add(dots);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.3, R + 0.6, 0.6, 48), new THREE.MeshStandardMaterial({ color: '#ff5fa2', roughness: 0.6 }));
  base.position.y = -0.31; group.add(base);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 48), new THREE.MeshStandardMaterial({ color: '#3b2a7a', roughness: 0.55 }));
  top.position.y = -0.05; top.receiveShadow = true; group.add(top);
  const RINGS = ['#5ff0ff', '#ffe14d', '#5ff0ff'];
  [2.2, 4.4, R - 0.5].forEach((r, i) => { const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r + 0.12, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: RINGS[i], transparent: true, opacity: 0.55, depthWrite: false })); ring.position.y = 0.006; group.add(ring); });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.16, 20), new THREE.MeshStandardMaterial({ color: '#ffe14d', roughness: 0.4 })); hub.position.y = 0.05; group.add(hub);
  const NB = 36, bumpers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.5, 14), new THREE.MeshStandardMaterial({ roughness: 0.4 }), NB);
  const BUMP = [new THREE.Color('#ffd23f'), new THREE.Color('#ff5fa2')];
  for (let i = 0; i < NB; i++) { const a = i / NB * Math.PI * 2; m4.compose(v.set(Math.sin(a) * (R + 0.35), 0.05, Math.cos(a) * (R + 0.35)), q.identity(), sc.set(1, 1, 1)); bumpers.setMatrixAt(i, m4); bumpers.setColorAt(i, BUMP[i % 2]); }
  bumpers.castShadow = true; group.add(bumpers);
  // ---- beams: shared geometry, a material set per beam (opacity changes while a spinner warms up)
  const coreGeo = new THREE.CylinderGeometry(0.07, 0.07, LEN, 8).rotateZ(Math.PI / 2);
  const glowGeo = new THREE.CylinderGeometry(0.2, 0.2, LEN, 10).rotateZ(Math.PI / 2);
  const stripeGeo = new THREE.PlaneGeometry(LEN, 0.34).rotateX(-Math.PI / 2);
  const postGeo = new THREE.CylinderGeometry(0.3, 0.42, 1, 10), footGeo = new THREE.CylinderGeometry(0.55, 0.6, 0.18, 12), capGeo = new THREE.SphereGeometry(0.34, 14, 10);
  const postMats = [new THREE.MeshStandardMaterial({ color: '#b5531a', roughness: 0.45 }), new THREE.MeshStandardMaterial({ color: '#6a2aa8', roughness: 0.45 })], footMat = new THREE.MeshStandardMaterial({ color: '#2b2b44', roughness: 0.6 });
  const beams = new Map();
  function addBeam([id, k, h, a, s, vel, warn]) {
    const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
    const coreMat = new THREE.MeshBasicMaterial({ color: CORE[h], transparent: true, opacity: 1 });
    const glowMat = new THREE.MeshBasicMaterial({ color: COL[h], transparent: true, opacity: 0.55, depthWrite: false });
    const stripeMat = new THREE.MeshBasicMaterial({ color: COL[h], transparent: true, opacity: 0.45, depthWrite: false });
    const capMat = new THREE.MeshStandardMaterial({ color: COL[h], emissive: COL[h], emissiveIntensity: 0.8 });
    const core = new THREE.Mesh(coreGeo, coreMat), glow = new THREE.Mesh(glowGeo, glowMat), stripe = new THREE.Mesh(stripeGeo, stripeMat);
    core.position.y = glow.position.y = H[h]; stripe.position.y = 0.012; inner.add(core, glow, stripe);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMats[h]); post.scale.y = H[h] + 0.1; post.position.set(sx * LEN / 2, (H[h] + 0.1) / 2, 0); post.castShadow = true;
      const foot = new THREE.Mesh(footGeo, footMat); foot.position.set(sx * LEN / 2, 0.09, 0);
      const cap = new THREE.Mesh(capGeo, capMat); cap.position.set(sx * LEN / 2, H[h], 0);
      inner.add(post, foot, cap);
    }
    group.add(g);
    // the label rides the middle of the bar (over the stage, so it is never off the side of a phone screen)
    const mid = new THREE.Object3D(); mid.position.set(k === SWEEP ? 0 : R * 0.55, H[h], 0); inner.add(mid);
    const label = stage.tag(mid, { text: h === LOW ? '▲ HOP' : '▼ DUCK', height: 0.35, cls: 'll-tag ' + (h === LOW ? 'll-low' : 'll-high') });
    const B = { id, k, h, a, s, vel, warn, g, inner, mats: [coreMat, glowMat, stripeMat, capMat], label, seen: true };
    place(B); beams.set(id, B); return B;
  }
  // a sweep: the bar lies along the line at offset s from the middle, normal at angle a (its own x axis along the line)
  // a spinner: the bar runs through the middle at angle a
  function place(B) {
    if (B.k === SWEEP) { const nx = Math.cos(B.a), nz = Math.sin(B.a); B.g.position.set(nx * B.s, 0, nz * B.s); B.g.rotation.y = -B.a + Math.PI / 2; }
    else { B.g.position.set(0, 0, 0); B.g.rotation.y = -B.a; }
    const live = B.warn <= 0;
    B.mats[0].opacity = live ? 1 : 0.25; B.mats[1].opacity = live ? 0.55 : 0.15; B.mats[2].opacity = live ? 0.45 : 0.2;
  }
  function dropBeam(B) { group.remove(B.g); for (const m of B.mats) m.dispose(); B.label.remove(); }
  // ---- zap flashes + sparks
  const flashGeo = new THREE.IcosahedronGeometry(0.7, 1), sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12), sparkMat = new THREE.MeshBasicMaterial({ color: '#fff36b' });
  const fx = [];
  function zapFx(x, z, h) {
    const flash = new THREE.Mesh(flashGeo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 1, depthWrite: false })); flash.position.set(x, H[h], z); group.add(flash);
    const bits = []; for (let i = 0; i < 10; i++) { const b = new THREE.Mesh(sparkGeo, sparkMat); b.position.set(x, H[h], z); const a = i * 0.63; b.userData.v = [Math.sin(a) * 5, 3 + (i % 3) * 2, Math.cos(a) * 5]; group.add(b); bits.push(b); }
    fx.push({ flash, bits, t: 0 });
  }
  const bar = scoreBar(ctx, { unit: 'sec' });
  const outSet = new Set(), winners = new Set();
  const heartEls = new Map();
  const hearts = pid => { if (!heartEls.has(pid)) { const c = bar.el.querySelector(`[data-pid="${pid}"]`); const e = c ? h('i', 'sb-lives') : null; if (e) { e.setAttribute('aria-label', 'lives'); c.append(e); } heartEls.set(pid, e); } return heartEls.get(pid); };
  let safe = new Set();          // blinking for a moment after a zap that was not the last life
  // round 12: one DODGE button — a cue over YOUR head says what it will do for the beam that reaches you first
  // (the sim's own `incoming`), and flashes NOW when it is time to press
  let cue = null, cueAnchor = null, cueKey = '';
  function cueFrame() {
    if (ctx.me == null || outSet.has(ctx.me)) { if (cueAnchor) cueAnchor.visible = false; return; }
    const a = ctx.actor(ctx.me), p = ctx.pos(ctx.me); if (!a || !p) return;
    if (!cue) { cueAnchor = new THREE.Object3D(); a.group.add(cueAnchor); cue = stage.tag(cueAnchor, { text: '', height: (a.height || 1.4) + 1.6, cls: 'll-cue', declutter: false }); }
    const next = incoming([...beams.values()].map(B => ({ k: B.k, h: B.h, a: B.a, s: B.s, v: B.vel, warn: B.warn })), p.x, p.z);
    cueAnchor.visible = !!next;
    if (!next) return;
    const now = next.t < 0.38, key = next.beam.h + (now ? 'n' : '');
    if (key !== cueKey) { cueKey = key; cue.set(next.beam.h === LOW ? (now ? '▲ HOP NOW!' : '▲ hop') : (now ? '▼ DUCK NOW!' : '▼ duck')); cue.el.className = 'tag ll-cue ' + (next.beam.h === LOW ? 'll-low' : 'll-high') + (now ? ' now' : ''); }
  }
  return {
    state(g) {
      for (const B of beams.values()) B.seen = false;
      for (const row of g.bm) {
        const [id, , , a, s, vel, warn] = row, B = beams.get(id);
        if (!B) { addBeam(row); continue; }
        B.seen = true; B.vel = vel; B.warn = Math.min(B.warn, warn);
        // correct toward the server, gently unless we are far out
        if (Math.abs(a - B.a) > 0.6 || Math.abs(s - B.s) > 1.5) { B.a = a; B.s = s; } else { B.a += (a - B.a) * 0.35; B.s += (s - B.s) * 0.35; }
      }
      for (const [id, B] of beams) if (!B.seen) { dropBeam(B); beams.delete(id); }
      for (const pid of g.out) if (!outSet.has(pid)) { outSet.add(pid); bar.mark(pid, 'out'); }
      bar.set(g.sc, g.left);
      safe = new Set(g.sf || []);
      if (g.lv) ctx.players.forEach((p, i) => { const e = hearts(p.pid), t = '♥'.repeat(g.lv[i] || 0); if (e && e.textContent !== t) e.textContent = t; });
    },
    event(ev) {
      if (ev.e === 'zap') { ctx.sfx(ev.lv ? 'bad' : 'out'); zapFx(ev.x, ev.z, ev.h); floatText(stage, ev.x, 1.6, ev.z, ev.lv ? `ZAP! ${'♥'.repeat(ev.lv)} left` : 'ZAPPED OUT!', 'bad'); ctx.actor(ev.pid)?.play('hit', 380); }
      else if (ev.e === 'hop') { if (ev.pid === ctx.me) ctx.sfx('tap'); }
      else if (ev.e === 'duck') { if (ev.pid === ctx.me) ctx.sfx('pick'); }
      else if (ev.e === 'win') { winners.add(ev.pid); if (ev.pid === ctx.me) ctx.sfx('win'); }
    },
    pose(pid, flags) {
      if (winners.has(pid)) return 'cheer';
      if (flags & F.OUT) return 'dead';
      if (flags & F.AIR) return 'jump';
      if (flags & F.CARRY) return 'kneel';
      return undefined;
    },
    frame(dt, t) {
      for (const B of beams.values()) {
        if (B.warn > 0) { B.warn -= dt; B.mats[1].opacity = 0.1 + 0.15 * Math.abs(Math.sin(t * 12)); }
        else if (B.k === SWEEP) B.s += B.vel * dt; else B.a += B.vel * dt;
        place(B);
        B.mats[1].opacity *= B.warn > 0 ? 1 : 0.85 + 0.15 * Math.sin(t * 30 + B.id);
      }
      hub.rotation.y += dt * 2;
      cueFrame();
      for (const pid of ctx.players?.map(p => p.pid) || []) { const a = ctx.actor(pid); if (a && !outSet.has(pid)) a.group.visible = !safe.has(pid) || Math.sin(t * 30) > -0.3; }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt;
        f.flash.scale.setScalar(0.4 + f.t * 4); f.flash.material.opacity = Math.max(0, 1 - f.t * 3);
        for (const b of f.bits) { const u = b.userData.v; u[1] -= 18 * dt; b.position.x += u[0] * dt; b.position.y = Math.max(0.05, b.position.y + u[1] * dt); b.position.z += u[2] * dt; }
        if (f.t > 0.8) { group.remove(f.flash); f.flash.material.dispose(); for (const b of f.bits) group.remove(b); fx.splice(i, 1); }
      }
    },
    dispose() { bar.el.remove(); for (const B of beams.values()) B.label.remove(); cue?.remove(); },
  };
}
