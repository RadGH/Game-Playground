// FIREFLY CATCH, as drawn: a meadow at dusk (the stage's two lights dimmed to a warm-violet evening and put back
// after; on Halloween the shared dusk dressing does it instead), soft hills of grass with tufts and little flowers, a
// split-rail fence, round trees and a rising moon outside. Fireflies are glowing points (one THREE.Points per kind,
// additive) that bob and blink — never fully dark, so you can always find them; golden ones are bigger and amber.
// Bushes are round leafy clumps; a full bush has a few glints inside, a shaken one rustles, throws its fireflies out
// and goes dull until it refills. Everyone carries a butterfly net (on the hand bone, so it swings); YOUR net shows
// a faint wedge on the grass = what a swing will catch. A catch throws a sparkle burst and "+1" / "+3".
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const A = init.arena, { hw, hd } = A, HW = ctx.season === 'halloween';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });
  // ---- dusk: dim the stage (restored on dispose); Halloween already brings its own dusk
  let restore = null;
  if (!HW) {
    const scene = stage.scene, hemi = scene.children.find(o => o.isHemisphereLight), sun = stage.sun;
    const was = { bg: scene.background?.clone?.() ?? scene.background, h: hemi && { c: hemi.color.clone(), g: hemi.groundColor.clone(), i: hemi.intensity }, s: sun && { c: sun.color.clone(), i: sun.intensity } };
    scene.background = new THREE.Color('#3b3270');
    if (hemi) { hemi.color.set('#c9b8ff'); hemi.groundColor.set('#3d4a6a'); hemi.intensity = was.h.i * 0.95; }
    if (sun) { sun.color.set('#ffb98a'); sun.intensity = was.s.i * 0.7; }
    restore = () => { scene.background = was.bg; if (hemi) { hemi.color.copy(was.h.c); hemi.groundColor.copy(was.h.g); hemi.intensity = was.h.i; } if (sun) { sun.color.copy(was.s.c); sun.intensity = was.s.i; } };
  }
  // ---- meadow, tufts, flowers, fence, trees, moon
  const field = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std(HW ? '#2f4a3a' : '#3d6e5a')); field.position.y = -0.02; field.receiveShadow = true; group.add(field);
  const grassTex = canvasTexture(256, 256, (c, w) => { c.fillStyle = HW ? '#4a6e4a' : '#4f8a62'; c.fillRect(0, 0, w, w); let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 300; i++) { c.fillStyle = r() < 0.5 ? 'rgba(30,70,40,.45)' : 'rgba(140,190,110,.3)'; c.beginPath(); c.ellipse(r() * w, r() * w, 2 + r() * 7, 1 + r() * 3, r() * 3, 0, 7); c.fill(); } });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(hw / 3, hd / 3);
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), std('#ffffff', { map: grassTex })); meadow.receiveShadow = true; group.add(meadow);
  const TU = 170, tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.07, 0.5, 4), std(HW ? '#3d6a45' : '#4f9a4a', { flatShading: true }), TU);
  for (let i = 0; i < TU; i++) { const x = ((i * 73) % 1000) / 1000 * (hw * 2 + 6) - hw - 3, z = ((i * 137) % 1000) / 1000 * (hd * 2 + 5) - hd - 2.5; m4.compose(v.set(x, 0.22, z), q.setFromEuler(e3.set((i % 5 - 2) * 0.12, i, (i % 3 - 1) * 0.15)), sc.set(1, 0.7 + (i % 4) * 0.2, 1)); tufts.setMatrixAt(i, m4); }
  group.add(tufts);
  const FL = 30, flowers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 6, 4), std('#ffffff', { roughness: 0.6 }), FL);
  for (let i = 0; i < FL; i++) { const x = ((i * 211) % 997) / 997 * hw * 2 - hw, z = ((i * 389) % 991) / 991 * hd * 2 - hd; m4.compose(v.set(x, 0.12, z), q.identity(), sc.setScalar(1)); flowers.setMatrixAt(i, m4); flowers.setColorAt(i, col.set(['#b58cff', '#ff8fb8', '#8fb8ff'][i % 3])); }
  group.add(flowers);
  const fp = []; for (let x = -hw; x <= hw + 0.01; x += 2) fp.push([x, -hd - 0.35], [x, hd + 0.35]); for (let z = -hd + 2; z < hd; z += 2) fp.push([-hw - 0.35, z], [hw + 0.35, z]);
  const fence = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.11, 0.9, 6), std('#7a5a3e'), fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.45, z), q.identity(), sc.setScalar(1)); fence.setMatrixAt(i, m4); }); fence.castShadow = true; group.add(fence);
  const railM = std('#8a6646');
  for (const sz of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.7, 0.07, 0.07), railM); r.position.set(0, 0.62, sz * (hd + 0.35)); group.add(r); }
  for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, hd * 2 + 0.7), railM); r.position.set(sx * (hw + 0.35), 0.62, 0); group.add(r); }
  const TR = 12, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6), std('#5a3e2a'), TR), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.3, 1), std(HW ? '#2c4a35' : '#2f6a3a', { flatShading: true }), TR);
  for (let i = 0; i < TR; i++) { const side = i % 4, u = (Math.floor(i / 4) / 3 - 0.33) * 2; const x = side < 2 ? u * hw * 1.1 : (side === 2 ? -1 : 1) * (hw + 3), z = side < 2 ? (side === 0 ? -1 : 1) * (hd + 3) : u * hd; m4.compose(v.set(x, 0.8, z), q.identity(), sc.setScalar(1)); trunks.setMatrixAt(i, m4); m4.compose(v.set(x, 2.2, z), q.setFromEuler(e3.set(0, i, 0)), sc.set(1, 1.15, 1)); crowns.setMatrixAt(i, m4); }
  trunks.castShadow = crowns.castShadow = true; group.add(trunks, crowns);
  if (!HW) { const moon = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: '#fff3c8' })); moon.position.set(hw - 2, 7, -hd - 14); group.add(moon); }

  // ---- bushes (also solid posts in the sim)
  const leaf = std(HW ? '#3a6a3f' : '#3f8f45', { flatShading: true }), leafDull = std(HW ? '#2e4a33' : '#36603c', { flatShading: true });
  const blob = new THREE.IcosahedronGeometry(0.55, 1);
  const glintMat = new THREE.MeshBasicMaterial({ color: '#fff3a0' }), glintGeo = new THREE.SphereGeometry(0.06, 6, 4);
  const bushes = A.posts.map((p, i) => {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); group.add(g);
    const parts = [[0, 0.55, 0, 1.25], [-0.45, 0.4, 0.15, 0.95], [0.45, 0.42, -0.1, 1], [0.05, 0.38, 0.45, 0.9]].map(([x, y, z, s]) => { const m = new THREE.Mesh(blob, leaf); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.set(i, x * 3, z); m.castShadow = true; g.add(m); return m; });
    const glints = [0, 1, 2].map(k => { const m = new THREE.Mesh(glintGeo, glintMat); m.position.set(Math.sin(k * 2.1) * 0.5, 0.5 + k * 0.15, Math.cos(k * 2.1) * 0.5 + 0.1); g.add(m); return m; });
    return { g, parts, glints, full: 1, shake: 0 };
  });

  // ---- fireflies: two Points clouds (plain + golden), additive, blinking by vertex colour
  const glow = canvasTexture(64, 64, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.6)'); gr.addColorStop(0.5, 'rgba(255,255,255,.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
  const MAXF = 64;
  const cloud = (size, color) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXF * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXF * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glow, size, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    pts.frustumCulled = false; pts.userData.base = new THREE.Color(color); group.add(pts); return pts;
  };
  const plain = cloud(3.8, HW ? '#b8ff6a' : '#eaff6a'), golden = cloud(5.4, '#ffb21e');
  const flies = new Map();          // id -> { x, z, tx, tz, gold, ph }
  // sparkle bursts
  const sparkGeo = new THREE.BufferGeometry(); const SP = 160; sparkGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SP * 3), 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: glow, size: 0.45, color: '#fff6b0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sparks.frustumCulled = false; group.add(sparks);
  const sd = Array.from({ length: SP }, () => ({ life: 0, x: 0, y: -9, z: 0, vx: 0, vy: 0, vz: 0 })); let si = 0;
  function sparkle(x, z, n = 14, y = 1.1) { for (let k = 0; k < n; k++) { const s = sd[si = (si + 1) % SP], a = k / n * Math.PI * 2; Object.assign(s, { life: 0.7, x, y, z, vx: Math.cos(a) * 2.2, vy: 1 + (k % 3) * 0.6, vz: Math.sin(a) * 2.2 }); } }

  // ---- nets in hands + my aim wedge
  const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6).translate(0, 0.45, 0), hoopGeo = new THREE.TorusGeometry(0.22, 0.02, 6, 20), bagGeo = new THREE.ConeGeometry(0.21, 0.4, 12, 1, true).rotateX(Math.PI);
  const netMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1 }), woodM = std('#a87a4a');
  const nets = new Set();
  function attach() {
    for (const p of ctx.players) {
      if (nets.has(p.pid)) continue; const a = ctx.actor(p.pid); if (!a) continue;
      const net = new THREE.Group(); net.add(new THREE.Mesh(handleGeo, woodM));
      const hoop = new THREE.Mesh(hoopGeo, std(p.color)); hoop.position.y = 1.1; hoop.rotation.y = Math.PI / 2; net.add(hoop);
      const bag = new THREE.Mesh(bagGeo, netMat); bag.position.set(0.18, 1.1, 0); bag.rotation.z = Math.PI / 2; net.add(bag);
      const hand = a.body?.parts?.handR; if (hand) { net.position.set(0, -0.05, 0); net.rotation.x = 1.2; hand.add(net); } else { net.position.set(0.3, 0.6, 0.2); a.body.group.add(net); }
      nets.add(p.pid);
    }
  }
  const wedge = new THREE.Mesh(new THREE.CircleGeometry(RULES.reach, 24, Math.PI / 2 - RULES.cone, RULES.cone * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff6b0', transparent: true, opacity: 0.16, depthWrite: false }));
  wedge.position.y = 0.03; wedge.visible = ctx.me != null; group.add(wedge);

  // a portrait phone sees a slice of the meadow that follows its own character (the whole meadow makes fireflies specks)
  const FULL = { cx: 0, cz: -0.3, hw: hw + 0.8, hd: hd + 1 }, SLICE = 6;
  const portrait = () => ctx.me != null && innerHeight > innerWidth * 1.15;
  let camX = 0;
  const frameCam = (dt, instant = false) => {
    if (!portrait()) { ctx.camera(FULL, { instant }); return; }
    const at = ctx.pos(ctx.me), lim = FULL.hw - SLICE, want = Math.max(-lim, Math.min(lim, at ? at.x : 0));
    camX = instant ? want : camX + (want - camX) * Math.min(1, dt * 4);
    ctx.camera({ cx: camX, cz: FULL.cz, hw: SLICE, hd: FULL.hd }, { instant });
  };
  frameCam(0, true);
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const medals = init.solo ? h('div', 'fc-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const tip = h('div', 'fc-tip', '✨ A = net · B by a bush = shake'); ctx.ui.append(tip); setTimeout(() => tip.classList.add('gone'), 5000);
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  let prevB = 0, prevS = -9;
  attach();
  return {
    state(g) {
      const seen = new Set();
      for (const [id, x, z, gold, ph] of g.f) { seen.add(id); let f = flies.get(id); if (!f) { f = { x, z, tx: x, tz: z, gold, ph, born: performance.now() }; flies.set(id, f); } f.tx = x; f.tz = z; }
      for (const id of [...flies.keys()]) if (!seen.has(id)) flies.delete(id);
      g.bu.forEach((full, i) => { const B = bushes[i]; if (!B || B.full === full) return; B.full = full; for (const m of B.parts) m.material = full ? leaf : leafDull; for (const gl of B.glints) gl.visible = !!full; });
      bar.set(g.sc, g.left);
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
    },
    input(inp) {
      const fresh = bit => (inp.b & bit) && (!(prevB & bit) || inp.s !== prevS + 1);
      if (fresh(IN.A)) ctx.actor(ctx.me)?.play('attack', 360);
      if (fresh(IN.B)) ctx.actor(ctx.me)?.play('cast', 360);
      prevB = inp.b; prevS = inp.s;
    },
    event(ev) {
      if (ev.e === 'catch') {
        if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('attack', 360);
        sparkle(ev.x, ev.z, 10 + ev.n * 4); ctx.sfx(ev.gold ? 'coins' : 'pick');
        floatText(stage, ev.x, 1.6, ev.z, `+${ev.add}${ev.gold ? ' ★' : ''}`, ev.pid === ctx.me ? 'good' : '');
        for (const id of ev.ids) flies.delete(id);
      } else if (ev.e === 'swish') { if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('attack', 360); if (ev.pid === ctx.me) ctx.sfx('throw'); }
      else if (ev.e === 'shake') { const B = bushes[ev.bush]; if (B) { B.shake = 0.6; sparkle(B.g.position.x, B.g.position.z, 12, 0.8); } if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('cast', 360); ctx.sfx('tap'); }
      else if (ev.e === 'empty') { const B = bushes[ev.bush]; if (B) B.shake = 0.25; if (ev.to === ctx.me) floatText(stage, B.g.position.x, 1.6, B.g.position.z, 'Empty — wait a bit', 'bad'); }
      void nameOf;
    },
    pose(pid, flags) { if (flags & F.FROZEN) return 'cheer'; return undefined; },
    frame(dt, t) {
      frameCam(dt);
      if (nets.size < ctx.players.length) attach();
      const k = 1 - Math.exp(-dt * 10);
      let ip = 0, ig = 0; const pp = plain.geometry.attributes.position, pc = plain.geometry.attributes.color, gp = golden.geometry.attributes.position, gc = golden.geometry.attributes.color;
      for (const f of flies.values()) {
        f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k;
        const y = 0.85 + 0.35 * Math.sin(t * 1.4 + f.ph) + 0.12 * Math.sin(t * 3.1 + f.ph * 2);
        const blink = 0.45 + 0.55 * Math.max(0, Math.sin(t * (f.gold ? 3.2 : 2.1) + f.ph)) ** 2, born = Math.min(1, (performance.now() - f.born) / 400);
        if (f.gold) { if (ig >= MAXF) continue; gp.setXYZ(ig, f.x, y, f.z); col.copy(golden.userData.base).multiplyScalar(blink * born); gc.setXYZ(ig, col.r, col.g, col.b); ig++; }
        else { if (ip >= MAXF) continue; pp.setXYZ(ip, f.x, y, f.z); col.copy(plain.userData.base).multiplyScalar(blink * born); pc.setXYZ(ip, col.r, col.g, col.b); ip++; }
      }
      plain.geometry.setDrawRange(0, ip); golden.geometry.setDrawRange(0, ig);
      pp.needsUpdate = pc.needsUpdate = gp.needsUpdate = gc.needsUpdate = true;
      // sparkles
      const sp = sparkGeo.attributes.position; let any = false;
      for (let i = 0; i < SP; i++) { const s = sd[i]; if (s.life <= 0) { sp.setXYZ(i, 0, -9, 0); continue; } any = true; s.life -= dt; s.vy -= 3 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; sp.setXYZ(i, s.x, s.y, s.z); }
      if (any) sp.needsUpdate = true;
      // bushes rustle; glints twinkle
      for (const B of bushes) { if (B.shake > 0) { B.shake -= dt; B.g.rotation.z = Math.sin(t * 40) * 0.08 * (B.shake / 0.6); B.g.rotation.x = Math.cos(t * 33) * 0.06 * (B.shake / 0.6); } else B.g.rotation.set(0, 0, 0); if (B.full) B.glints.forEach((gl, i) => gl.scale.setScalar(0.6 + 0.6 * Math.max(0, Math.sin(t * 3 + i * 2)))); }
      // my net's reach wedge
      if (wedge.visible) { const p = ctx.pos(ctx.me); if (p) { wedge.position.x = p.x; wedge.position.z = p.z; wedge.rotation.y = p.yaw + Math.PI; } }
    },
    dispose() { bar.el.remove(); restore?.(); glow.dispose(); grassTex.dispose(); },
  };
}
