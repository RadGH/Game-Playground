// FLOOD RUSH, as drawn: a grassy fairground on rolling hills (one mesh, its heights from the sim's own groundAt), with
// striped stalls on the hilltops, wooden crates, and plank bridges from top to top. A sheet of blue water rises over it
// in stages (a scrolling canvas texture with ripples; the low grass turns to sand). A knocked-down plank tips into the
// water and floats off. A player swept away sits in a yellow rubber-duck ring and drifts to the edge. A pill under the
// score bar says what the water is doing ("Water rising in 3!"). Halloween: glowing green swamp water, purple grass,
// pumpkins on the crates and purple-and-orange stalls.
//
// Prediction: the player's phone steps its own character with ctx.arena; here the crates and stalls that are too tall
// for your feet are written into ctx.arena.blocks each frame (sim.js solidFor), the same rule the server uses.
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { canvasTexture } from '../../client/stage.js';
import { pumpkinGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { groundAt, solidFor } from './sim.js';

export function createView(ctx) {
  const { THREE, group, stage, init, arena, me } = ctx, HW = ctx.season === 'halloween', W = arena.hw, D = arena.hd;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const nameOf = pid => (pid === me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  // ---- the hills: one plane bent to the sim's heights, coloured by height (sand low, grass, light grass on top)
  const geo = new THREE.PlaneGeometry(W * 2 + 8, D * 2 + 8, 72, 54).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, cols = [], cLow = new THREE.Color(HW ? '#4a3f5a' : '#e8d39a'), cMid = new THREE.Color(HW ? '#3a2a5a' : '#5fae4a'), cTop = new THREE.Color(HW ? '#5a3a7a' : '#8fd06a'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = Math.abs(x) <= W + 0.2 && Math.abs(z) <= D + 0.2 ? groundAt(init.hills, x, z) : 0;
    pos.setY(i, y); const k = Math.min(1, y / 2.4);
    c.copy(cLow).lerp(cMid, Math.min(1, y * 3)).lerp(cTop, Math.max(0, k - 0.3)); cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.computeVertexNormals();
  const land = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })); land.receiveShadow = true; group.add(land);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 50, D * 2 + 50).rotateX(-Math.PI / 2), std(HW ? '#221a33' : '#4a8a3a')); outside.position.y = -0.05; group.add(outside);
  // a low fence round the edge
  const fence = [];
  for (let x = -W; x <= W + 0.01; x += 1.25) fence.push([x, -D - 0.25], [x, D + 0.25]);
  for (let z = -D + 1.25; z < D; z += 1.25) fence.push([-W - 0.25, z], [W + 0.25, z]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const fenceMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.7, 0.12), std(HW ? '#3a2a4a' : '#f4ecd8'), fence.length);
  fence.forEach(([x, z], i) => fenceMesh.setMatrixAt(i, m4.makeTranslation(x, 0.35, z))); group.add(fenceMesh);
  // ---- stalls and crates
  const wood = std(HW ? '#5a3a2a' : '#b07a42'), plankMat = std(HW ? '#6a4a3a' : '#c99a5f');
  const STRIPE = HW ? [['#7a3cc8', '#ff8a1a'], ['#2a1d4a', '#ff8a1a'], ['#7a3cc8', '#2a1d4a']] : [['#e8394a', '#ffffff'], ['#3d8bff', '#ffffff'], ['#ffd23f', '#e8394a']];
  let si = 0;
  for (const o of init.boxes) {
    const g = new THREE.Group(), base = groundAt(init.hills, o.x, o.z), hgt = o.top - base + 0.4; g.position.set(o.x, base - 0.4, o.z); group.add(g);
    if (o.k === 'stall') {
      const [a, b] = STRIPE[si++ % STRIPE.length];
      const body = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, hgt - 0.14, o.hd * 2), std(HW ? '#2a1d4a' : '#fff6e0')); body.position.y = (hgt - 0.14) / 2; g.add(body);
      const tex = canvasTexture(64, 64, (cx, w) => { for (let i = 0; i < 8; i++) { cx.fillStyle = i % 2 ? b : a; cx.fillRect(i * w / 8, 0, w / 8, w); } });
      const roof = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.16, 0.14, o.hd * 2 + 0.16), std('#ffffff', { map: tex })); roof.position.y = hgt - 0.07; g.add(roof);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.1, 0.12, 0.3), wood); counter.position.set(0, hgt * 0.45, o.hd + 0.1); g.add(counter);
    } else {
      const box = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2, hgt, o.hd * 2), std(HW ? '#6a4a3a' : '#c9925a')); box.position.y = hgt / 2; g.add(box);
      for (const y of [hgt * 0.3, hgt * 0.85]) { const s = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.02, 0.07, o.hd * 2 + 0.02), wood); s.position.y = y; g.add(s); }
      if (HW && o.id % 2 === 0) { const p = new THREE.Mesh(pumpkinGeo(THREE, 0.18), std('#ff7a14')); p.position.set(o.hw * 0.55, hgt + 0.13, -o.hd * 0.5); g.add(p); }
    }
    g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  }
  // ---- planks: a board from end to end, with posts
  const planks = new Map();
  for (const p of init.planks) {
    const dx = p.bx - p.ax, dz = p.bz - p.az, dy = p.bh - p.ah, L = Math.hypot(dx, dz);
    const g = new THREE.Group(); g.position.set((p.ax + p.bx) / 2, (p.ah + p.bh) / 2 + 0.08, (p.az + p.bz) / 2); g.rotation.order = 'YXZ'; g.rotation.y = Math.atan2(dx, dz); g.rotation.x = -Math.atan2(dy, L);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, Math.hypot(L, dy) + 0.3), plankMat); board.castShadow = true; board.receiveShadow = true; g.add(board);
    for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Math.hypot(L, dy)), wood); rail.position.set(s * 0.42, 0.3, 0); g.add(rail); }
    group.add(g); planks.set(p.id, { g, down: false, t: 0, y0: g.position.y });
  }
  // ---- water: a rising sheet with ripples
  // two layers: a murky base with blotches and a scrolling sheet of foam lines over it, so it reads as liquid from above
  const wTex = canvasTexture(256, 256, (cx, w) => {
    cx.fillStyle = HW ? '#14463e' : '#2f86d0'; cx.fillRect(0, 0, w, w);
    let s = 11; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 30; i++) { cx.fillStyle = HW ? (i % 2 ? 'rgba(40,120,90,.45)' : 'rgba(10,30,30,.4)') : (i % 2 ? 'rgba(90,170,235,.45)' : 'rgba(20,80,150,.35)'); const x = r() * w, y = r() * w, a = 14 + r() * 30, b = 8 + r() * 16; for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) { cx.beginPath(); cx.ellipse(x + ox, y + oy, a, b, r() * 3, 0, 7); cx.fill(); } }
  });
  const fTex = canvasTexture(256, 256, (cx, w) => {
    cx.clearRect(0, 0, w, w); let s = 29; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 46; i++) { cx.strokeStyle = HW ? 'rgba(170,255,190,.75)' : 'rgba(255,255,255,.8)'; cx.lineWidth = 2 + r() * 2.5; cx.lineCap = 'round'; const x = r() * w, y = r() * w, a = 10 + r() * 22; for (const ox of [-w, 0, w]) for (const oy of [-w, 0, w]) { cx.beginPath(); cx.arc(x + ox, y + oy, a, 0.5, 2.5); cx.stroke(); } }
  });
  for (const T of [wTex, fTex]) { T.wrapS = T.wrapT = THREE.RepeatWrapping; T.repeat.set(5, 4); }
  const waterMat = new THREE.MeshStandardMaterial({ map: wTex, transparent: true, opacity: HW ? 0.86 : 0.8, roughness: 0.08, metalness: 0.35, emissive: HW ? '#1a8a5a' : '#0a2a5a', emissiveIntensity: HW ? 0.22 : 0.18, depthWrite: false });
  const foamMat = new THREE.MeshBasicMaterial({ map: fTex, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  // Halloween: the swamp stays inside the fence, so the dark ground (and the mist) outside are not flooded
  const WS = HW ? [W * 2 + 0.5, D * 2 + 0.5] : [W * 2 + 50, D * 2 + 50];
  const water = new THREE.Group(); group.add(water); water.position.y = -0.2;
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(...WS).rotateX(-Math.PI / 2), waterMat); sheet.renderOrder = 1; water.add(sheet);
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(...WS).rotateX(-Math.PI / 2), foamMat); foam.position.y = 0.015; foam.renderOrder = 2; water.add(foam);
  // bubbles that swell and pop on the surface (instanced)
  const NBUB = 30, bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: HW ? '#9dffb0' : '#e8f6ff', transparent: true, opacity: 0.8, toneMapped: false }), NBUB);
  const bub = Array.from({ length: NBUB }, (_, i) => ({ x: ((i * 7.3) % (W * 2)) - W, z: ((i * 4.1) % (D * 2)) - D, t: (i * 0.37) % 1 }));
  water.add(bubbles);
  const bm4 = new THREE.Matrix4(), bq = new THREE.Quaternion(), bv = new THREE.Vector3(), bs = new THREE.Vector3(), bzero = new THREE.Matrix4().makeScale(0, 0, 0);
  // the shoreline: land vertices just above the water get a pale wet band (recoloured when the water moves)
  const baseCols = Float32Array.from(cols), colAttr = geo.attributes.color, shoreC = new THREE.Color(HW ? '#7fe0a8' : '#f4ecc8'), wetC = new THREE.Color(HW ? '#24303a' : '#8a7a5a');
  let shoreAt = -99;
  function shore(level) {
    shoreAt = level; const a = colAttr.array;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), d = y - level; let k = 0, cc = shoreC;
      if (d > -0.04 && d < 0.26) k = 1 - Math.max(0, d) / 0.26; else if (d <= -0.04 && d > -0.3) { k = 0.6; cc = wetC; }
      for (let j = 0; j < 3; j++) a[i * 3 + j] = baseCols[i * 3 + j] + ((j ? (j === 1 ? cc.g : cc.b) : cc.r) - baseCols[i * 3 + j]) * k;
    }
    colAttr.needsUpdate = true;
  }
  // ---- rubber duck rings for the swept-away
  const rings = new Map();
  function duckRing() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.2, 10, 20).rotateX(Math.PI / 2), std(HW ? '#ff8a1a' : '#ffd23f')); ring.position.y = 0.35; g.add(ring);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std(HW ? '#ff8a1a' : '#ffd23f')); head.position.set(0, 0.6, 0.62); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 6).rotateX(Math.PI / 2), std('#ff7a1a')); beak.position.set(0, 0.58, 0.82); g.add(beak);
    return g;
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'points' });
  const pill = h('div', 'fr-pill'); ctx.ui.append(pill);
  const juice = createJuice(ctx);
  let camX = 0;
  const WATER = HW ? 'Swamp' : 'Water';
  let wl = -0.2, wlT = -0.2, lastKey = '', myOut = false;
  return {
    halloween: { y: 0, mist: false, spots: [[-W - 1.6, 0, -D + 1], [W + 1.6, 0, -D + 1], [-W - 1.6, 0, D - 1], [W + 1.6, 0, D - 1], [0, 0, -D - 1.8]] },
    start() { juice.say(init.solo ? 'Get to HIGH ground!' : 'The water is coming — climb!', 1800); },
    state(g) {
      bar.set(g.sc, g.left);
      for (const p of ctx.players) bar.mark(p.pid, 'out', g.o.includes(p.pid));
      wlT = g.wl;
      const word = g.o.includes(me) ? '🦆 Swept away! Watch the others' : g.ph === 'warn' ? `🌊 ${WATER} rising in ${g.nx}!` : g.ph === 'rise' ? `🌊 ${WATER} rising! Get higher!` : g.nx > 0 ? `${WATER} holding… next rise in ${g.nx}` : `🌊 ${WATER} at its highest — hold on!`;
      if (pill.textContent !== word) pill.textContent = word;
      pill.className = 'fr-pill ' + (g.o.includes(me) ? 'out' : g.ph);
      for (const id of g.pk) { const P = planks.get(id); if (P && !P.down) P.down = true; }
      for (const pid of g.o) if (!rings.has(pid)) { const a = ctx.actor(pid); if (a) { const r = duckRing(); a.group.add(r); rings.set(pid, r); } }
      myOut = g.o.includes(me);
    },
    event(ev) {
      if (ev.e === 'warn') { juice.say(ev.last ? `The last rise — get as HIGH as you can!` : `${WATER} rising — get higher!`, 1500); ctx.sfx('trap'); }
      else if (ev.e === 'jump') { ctx.actor(ev.pid)?.play('jump', 420); }
      else if (ev.e === 'plank') { ctx.sfx('hit'); juice.shake(0.1, 0.3); const p = init.planks[ev.id]; if (p) floatText(stage, (p.ax + p.bx) / 2, 1.8 + (p.ah + p.bh) / 2, (p.az + p.bz) / 2, ev.pid === me ? 'Bridge down!' : `${nameOf(ev.pid)} dropped a bridge!`, ev.pid === me ? 'good' : ''); }
      else if (ev.e === 'shove') { ctx.actor(ev.pid)?.play('throw', 300); if (ev.hit.length) ctx.sfx('hit'); if (ev.hit.includes(me)) juice.flash('#ffd23f', 180); }
      else if (ev.e === 'swept') {
        ctx.sfx('splat'); floatText(stage, ev.x, 2, ev.z, ev.pid === me ? 'Swept away!' : `${nameOf(ev.pid)}: splash!`, ev.pid === me ? 'bad' : '');
        if (ev.pid === me) { juice.flash(HW ? '#7dff5a' : '#4fa8ff', 420); juice.say('Splash! Swept away', 1400); }
      } else if (ev.e === 'end') {
        if (ev.win != null) { juice.say(ev.win === me ? 'Last one dry — YOU!' : `${nameOf(ev.win)} is the last one dry!`, 2600); ctx.sfx(ev.win === me ? 'win' : 'good'); }
        else if (ev.dry.length) { juice.say(ev.dry.includes(me) ? 'Time! You stayed dry!' : 'Time! Higher = more points', 2400); ctx.sfx('good'); }
      }
    },
    pose(pid, flags) { if (flags & F.OUT) return 'sitGround'; if (flags & F.AIR) return 'jump'; if (flags & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      wl += (wlT - wl) * Math.min(1, dt * 6); water.position.y = wl + Math.sin(t * 1.7) * 0.02;
      wTex.offset.set(t * 0.012, t * 0.008); fTex.offset.set(-t * 0.035, t * 0.022); foamMat.opacity = 0.4 + 0.18 * Math.sin(t * 2.3);
      if (Math.abs(wl - shoreAt) > 0.03) shore(wl);
      for (let i = 0; i < NBUB; i++) {
        const B = bub[i]; B.t += dt * (0.6 + (i % 3) * 0.25);
        if (B.t >= 1) { B.t = 0; B.x = (((i * 7.3 + t * 13.1) % (W * 2)) + W * 2) % (W * 2) - W; B.z = (((i * 4.1 + t * 9.7) % (D * 2)) + D * 2) % (D * 2) - D; }
        if (wl < 0.05 || groundAt(init.hills, B.x, B.z) > wl - 0.1) { bubbles.setMatrixAt(i, bzero); continue; }
        const k = Math.sin(B.t * Math.PI) * (B.t > 0.9 ? 1.6 : 1); bm4.compose(bv.set(B.x, 0.02, B.z), bq.identity(), bs.set(k, k * 0.55, k)); bubbles.setMatrixAt(i, bm4);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      // your own crates-as-walls, from the height your feet are at (the sim's rule)
      if (me != null && !myOut) {
        const p = ctx.pos(me);
        if (p) { const solid = solidFor(init.boxes, p.y), key = solid.map(o => o.x + ',' + o.z).join('|'); if (key !== lastKey) { lastKey = key; arena.blocks = solid; } }
      }
      for (const P of planks.values()) {
        if (!P.down) continue; P.t += dt;
        const k = Math.min(1, P.t / 0.6); P.g.position.y = P.y0 + (Math.max(wl, -0.1) - P.y0) * k * k; P.g.rotation.z = k * 0.5;
        if (P.t > 0.6) { P.g.position.x += Math.sin(t + P.t) * dt * 0.3; P.g.position.z += dt * 0.4; }
      }
      for (const r of rings.values()) r.rotation.y = Math.sin(t * 2) * 0.3;
      // an upright phone: follow your own character sideways so the town is big enough to play on
      if (innerHeight > innerWidth * 1.15) { const p = me != null ? ctx.pos(me) : null, cx = Math.max(-W + 6.6, Math.min(W - 6.6, p ? p.x : 0)); camX += (cx - camX) * Math.min(1, dt * 3); ctx.camera({ cx: camX, cz: 0, hw: 6.6, hd: D + 0.6 }, { instant: true }); }
      juice.frame(dt, t);
    },
    dispose() { bar.el.remove(); pill.remove(); juice.dispose(); wTex.dispose(); fTex.dispose(); for (const r of rings.values()) r.removeFromParent(); },
  };
}
