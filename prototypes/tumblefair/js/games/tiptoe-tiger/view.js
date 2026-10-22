// TIPTOE TIGER, as drawn: a mown strip of fairground grass between low white picket fences, a chalk start line near
// the camera and, at the far end, a little wooden stage with a striped tent backdrop where a big cardboard tiger sits
// (boxes with painted stripes, cone ears, a white snout, a swinging tail). A golden bell hangs from a post in front of
// the stage. Singing: the tiger has its back to you and music notes float up. The tell: the music scratches to a stop,
// its tail shoots up and a red "!" pops over its head. Looking: it faces you and its eyes glow red. Chalk lines across
// the field every 4 m with the distance to the bell. HUD: score bar (metres), a pill saying what to do, a big banner.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, arena: A } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = (opts) => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes();

  // ---- ground: grass, mown bands, fences, trees
  const grass = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#79c95f', { roughness: 1 })); grass.position.y = -0.02; grass.receiveShadow = true; group.add(grass);
  const BANDS = 14, bandGeo = geo(new THREE.PlaneGeometry(A.hw * 2, 1.5).rotateX(-Math.PI / 2)), bands = new THREE.InstancedMesh(bandGeo, std('#93dc74', { roughness: 1 }), BANDS);
  for (let i = 0; i < BANDS; i++) { m4.compose(v.set(0, 0.002, A.hd - 0.75 - i * 3), q.identity(), sc.setScalar(1)); bands.setMatrixAt(i, m4); }
  bands.receiveShadow = true; group.add(bands);
  // chalk: the start line and a line every 4 m, with the metres still to go painted at the side
  const chalk = basic({ color: '#ffffff', transparent: true, opacity: 0.85 });
  const startLine = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, 0.22).rotateX(-Math.PI / 2)), chalk); startLine.position.set(0, 0.01, RULES.startZ - 0.6); group.add(startLine);
  const dashGeo = geo(new THREE.PlaneGeometry(0.6, 0.12).rotateX(-Math.PI / 2)), DASHES = 60, dashes = new THREE.InstancedMesh(dashGeo, basic({ color: '#ffffff', transparent: true, opacity: 0.55 }), DASHES);
  let di = 0;
  const dist = RULES.startZ - RULES.bellZ;
  for (let m = 4; m < dist - 1; m += 4) {
    const z = RULES.startZ - m;
    for (let x = -A.hw + 0.5; x < A.hw - 0.4 && di < DASHES; x += 1.1) { m4.compose(v.set(x, 0.01, z), q.identity(), sc.setScalar(1)); dashes.setMatrixAt(di++, m4); }
    const t = tex(canvasTexture(128, 64, (c, w, hh) => { c.fillStyle = '#ffffff'; c.font = '900 44px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(`${Math.round(dist - m)}m`, w / 2, hh / 2 + 2); }));
    for (const sx of [-1, 1]) { const lab = new THREE.Mesh(geo(new THREE.PlaneGeometry(1.2, 0.6).rotateX(-Math.PI / 2)), basic({ map: t, transparent: true, depthWrite: false })); lab.scale.setScalar(1.3); lab.position.set(sx * (A.hw - 1.0), 0.012, z + 0.55); group.add(lab); }
  }
  dashes.count = di; group.add(dashes);
  const startTex = tex(canvasTexture(256, 64, (c, w, hh) => { c.fillStyle = '#ffffff'; c.font = '900 52px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('START', w / 2, hh / 2 + 3); }));
  const startLab = new THREE.Mesh(geo(new THREE.PlaneGeometry(3.2, 0.8).rotateX(-Math.PI / 2)), basic({ map: startTex, transparent: true, opacity: 0.85, depthWrite: false })); startLab.position.set(0, 0.012, RULES.startZ + 0.9); group.add(startLab);
  // picket fences down both sides and behind the start
  const picketGeo = geo(new THREE.BoxGeometry(0.12, 0.7, 0.06)), PK = 200, pickets = new THREE.InstancedMesh(picketGeo, std('#ffffff', { roughness: 0.6 }), PK);
  let pi = 0;
  const fenceZ0 = -8, fenceZ1 = A.hd + 0.4;
  for (const sx of [-1, 1]) for (let z = fenceZ0; z <= fenceZ1 && pi < PK; z += 0.32) { m4.compose(v.set(sx * (A.hw + 0.25), 0.35, z), q.setFromEuler(e3.set(0, Math.PI / 2, 0)), sc.setScalar(1)); pickets.setMatrixAt(pi++, m4); }
  for (let x = -A.hw - 0.25; x <= A.hw + 0.25 && pi < PK; x += 0.32) { m4.compose(v.set(x, 0.35, fenceZ1), q.identity(), sc.setScalar(1)); pickets.setMatrixAt(pi++, m4); }
  pickets.count = pi; pickets.castShadow = true; group.add(pickets);
  const railMat = std('#f4efe6', { roughness: 0.6 });
  for (const sx of [-1, 1]) for (const y of [0.22, 0.5]) mesh(geo(new THREE.BoxGeometry(0.05, 0.07, fenceZ1 - fenceZ0)), railMat, sx * (A.hw + 0.25), y, (fenceZ0 + fenceZ1) / 2);
  for (const y of [0.22, 0.5]) mesh(geo(new THREE.BoxGeometry(A.hw * 2 + 0.5, 0.07, 0.05)), railMat, 0, y, fenceZ1);
  const TREES = 26, treeTop = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(1, 0)), std('#2f9e44', { flatShading: true }), TREES), trunk = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.14, 0.2, 1.2, 6)), std('#7a4a2a'), TREES);
  for (let i = 0; i < TREES; i++) {
    const side = i % 2 ? 1 : -1, x = side * (A.hw + 2.2 + (i * 1.7) % 4.5), z = -12 + (i * 2.3) % 26, s = 0.9 + (i % 3) * 0.35;
    m4.compose(v.set(x, 1.2 + s * 0.8, z), q.setFromEuler(e3.set(i, i * 2, 0)), sc.setScalar(s)); treeTop.setMatrixAt(i, m4);
    m4.compose(v.set(x, 0.6, z), q.identity(), sc.setScalar(1)); trunk.setMatrixAt(i, m4);
  }
  treeTop.castShadow = true; group.add(treeTop, trunk);

  // ---- the stage and its striped backdrop
  const block = A.blocks[0];
  const stageMesh = mesh(geo(new THREE.BoxGeometry(block.hw * 2, RULES.stageTop, block.hd * 2)), std('#b9773a', { roughness: 0.8 }), 0, RULES.stageTop / 2, block.z); stageMesh.receiveShadow = true;
  const skirtTex = tex(canvasTexture(256, 32, (c, w, hh) => { c.fillStyle = '#e8394a'; c.fillRect(0, 0, w, hh); c.fillStyle = '#ffd23f'; for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16 + 8, hh * 0.8); c.lineTo(i * 16 + 16, 0); c.fill(); } }));
  skirtTex.wrapS = THREE.RepeatWrapping; skirtTex.repeat.set(3, 1);
  const skirt = new THREE.Mesh(geo(new THREE.PlaneGeometry(block.hw * 2, RULES.stageTop)), basic({ map: skirtTex })); skirt.position.set(0, RULES.stageTop / 2, block.z + block.hd + 0.01); group.add(skirt);
  const tentTex = tex(canvasTexture(256, 128, (c, w, hh) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#fff4dc' : '#e8394a'; c.fillRect(i * 16, 0, 16, hh); } c.fillStyle = '#ffd23f'; for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(i * 32 + 16, 0, 16, 0, Math.PI); c.fill(); } }));
  const backdrop = new THREE.Mesh(geo(new THREE.PlaneGeometry(block.hw * 2 + 1, 5.6)), basic({ map: tentTex })); backdrop.position.set(0, 2.8, block.z - block.hd - 0.05); group.add(backdrop);
  for (const sx of [-1, 1]) { const p = mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 6, 8)), std('#ffd23f', { roughness: 0.5 }), sx * (block.hw + 0.4), 3, block.z - block.hd); const ball = mesh(geo(new THREE.SphereGeometry(0.25, 12, 8)), std('#e8394a', { roughness: 0.4 }), 0, 3.1, 0, p); ball.castShadow = false; }

  // ---- the tiger (cardboard: boxes, flat colours, painted stripes)
  const stripeTex = tex(canvasTexture(128, 128, (c, w, hh) => { c.fillStyle = '#ff9a1f'; c.fillRect(0, 0, w, hh); c.fillStyle = '#2a1a10'; for (let i = 0; i < 3; i++) { const x = 16 + i * 40; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 14, 0); c.lineTo(x + 5, hh * 0.6); c.lineTo(x + 2, hh * 0.6); c.fill(); } }));
  const fur = std('#ffffff', { map: stripeTex, roughness: 0.95 }), plain = std('#ff9a1f', { roughness: 0.95 }), white = std('#fff6e8', { roughness: 0.9 }), black = std('#1d1410', { roughness: 0.6 }), pink = std('#ff9db0');
  const eyeMat = std('#1d1410', { roughness: 0.3, emissive: '#ff2020', emissiveIntensity: 0 });
  const tiger = new THREE.Group(); tiger.position.set(0, RULES.stageTop, RULES.tigerZ); tiger.rotation.y = Math.PI; tiger.scale.setScalar(1.3); group.add(tiger);
  const B = new THREE.BoxGeometry(1, 1, 1); geos.push(B);
  const box = (m, sx, sy, sz, x, y, z, parent = tiger) => { const o = mesh(B, m, x, y, z, parent); o.scale.set(sx, sy, sz); return o; };
  box(fur, 2.0, 1.4, 1.5, 0, 0.95, 0);                                   // body
  box(white, 1.1, 0.85, 0.05, 0, 0.85, 0.76);                            // belly
  for (const [x, z] of [[-0.7, 0.55], [0.7, 0.55], [-0.7, -0.55], [0.7, -0.55]]) box(fur, 0.42, 0.5, 0.42, x, 0.25, z);
  for (const x of [-0.45, 0.45]) box(white, 0.42, 0.22, 0.5, x, 0.12, 0.95);   // front paws
  const head = new THREE.Group(); head.position.set(0, 2.15, 0.35); tiger.add(head);
  box(plain, 1.7, 1.3, 1.15, 0, 0.1, 0, head);
  for (const [x, w] of [[-0.3, 0.1], [0, 0.12], [0.3, 0.1]]) box(black, w, 0.34, 0.04, x, 0.6, 0.58, head);     // forehead stripes
  for (const sx of [-1, 1]) for (const y of [0.0, 0.22]) box(black, 0.04, 0.08, 0.5, sx * 0.86, y, 0.1, head);
  box(white, 0.9, 0.5, 0.3, 0, -0.22, 0.65, head);                        // snout
  box(black, 0.32, 0.18, 0.12, 0, -0.05, 0.82, head);                     // nose
  const mouth = box(std('#8a1a2a'), 0.5, 0.05, 0.05, 0, -0.42, 0.81, head);   // opens wide for the roar
  const fangs = []; for (const sx of [-1, 1]) { const f = mesh(geo(new THREE.ConeGeometry(0.06, 0.16, 4)), white, sx * 0.15, -0.38, 0.84, head); f.rotation.x = Math.PI; f.visible = false; fangs.push(f); }
  for (const sx of [-1, 1]) {
    box(white, 0.42, 0.42, 0.06, sx * 0.4, 0.3, 0.59, head);
    const pupil = mesh(geo(new THREE.SphereGeometry(0.11, 12, 8)), eyeMat, sx * 0.4, 0.27, 0.63, head); pupil.castShadow = false;
    const ear = mesh(geo(new THREE.ConeGeometry(0.3, 0.5, 4)), fur, sx * 0.62, 0.9, 0, head); ear.rotation.y = Math.PI / 4;
    const inner = mesh(geo(new THREE.ConeGeometry(0.17, 0.32, 4)), pink, sx * 0.62, 0.86, 0.1, head); inner.rotation.y = Math.PI / 4;
    for (const dy of [-0.06, 0.06]) { const wh = box(white, 0.6, 0.03, 0.03, sx * 0.6, -0.2 + dy, 0.72, head); wh.rotation.z = sx * dy * 2.5; }
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.9, -0.75); tiger.add(tail);
  const tailSegs = []; let parent = tail;
  for (let i = 0; i < 5; i++) { const s = new THREE.Group(); s.position.set(0, i ? 0.32 : 0, 0); parent.add(s); const seg = mesh(geo(new THREE.CylinderGeometry(0.1, 0.12, 0.34, 8)), i === 4 ? black : fur, 0, 0.16, 0, s); seg.castShadow = true; tailSegs.push(s); parent = s; }
  tail.rotation.x = -0.9;
  // the "!" and the music notes
  const sprite = (draw, w, hh, scale) => { const t = tex(canvasTexture(w, hh, draw)), m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }); mats.push(m); const s = new THREE.Sprite(m); s.scale.set(scale * w / hh, scale, 1); return s; };
  const bang = sprite((c, w, hh) => { c.font = '900 110px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 14; c.strokeStyle = '#0d2228'; c.strokeText('!', w / 2, hh / 2 + 6); c.fillStyle = '#ff4d5e'; c.fillText('!', w / 2, hh / 2 + 6); }, 64, 128, 1.6);
  bang.position.set(0, 5.2, RULES.tigerZ); bang.visible = false; group.add(bang);
  const notes = [];
  for (let i = 0; i < 4; i++) { const n = sprite((c, w, hh) => { c.font = '900 52px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 8; c.strokeStyle = '#0d2228'; c.strokeText(i % 2 ? '♪' : '♫', w / 2, hh / 2); c.fillStyle = ['#ffd23f', '#39d0e0', '#ff7ab8', '#8ff07a'][i]; c.fillText(i % 2 ? '♪' : '♫', w / 2, hh / 2); }, 64, 64, 0.7); n.visible = false; group.add(n); notes.push({ s: n, t: i / 4 }); }

  // ---- the bell on its post
  const brass = std('#ffc83d', { metalness: 0.6, roughness: 0.3, emissive: '#5a3a00', emissiveIntensity: 0.25 });
  const post = mesh(geo(new THREE.CylinderGeometry(0.07, 0.09, 1.9, 8)), std('#7a4a2a'), RULES.bellX - 0.55, 0.95, RULES.bellZ);
  mesh(geo(new THREE.BoxGeometry(0.75, 0.08, 0.08)), std('#7a4a2a'), RULES.bellX - 0.2, 1.85, RULES.bellZ);
  const bellPivot = new THREE.Group(); bellPivot.position.set(RULES.bellX, 1.8, RULES.bellZ); group.add(bellPivot);
  const bellPts = []; for (let i = 0; i <= 10; i++) { const t = i / 10; bellPts.push(new THREE.Vector2(0.08 + 0.42 * Math.pow(t, 1.8) + (t > 0.9 ? 0.06 : 0), -t * 0.75)); }
  const bell = mesh(geo(new THREE.LatheGeometry(bellPts, 18)), brass, 0, -0.05, 0, bellPivot); bell.material.side = THREE.DoubleSide;
  mesh(geo(new THREE.SphereGeometry(0.11, 10, 8)), brass, 0, -0.8, 0, bellPivot);
  const glow = new THREE.Mesh(geo(new THREE.RingGeometry(1.0, 1.25, 40).rotateX(-Math.PI / 2)), basic({ color: '#ffd23f', transparent: true, opacity: 0.55, depthWrite: false })); glow.position.set(RULES.bellX, 0.02, RULES.bellZ); group.add(glow);
  post.castShadow = true;

  // frame the field a little lower so the score bar never sits over the tiger
  ctx.camera({ cx: 0, cz: -0.9, hw: A.hw + 0.5, hd: A.hd + 0.9 }, { instant: true });

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'm' });
  const pill = h('div', 'tpt-pill'), banner = h('div', 'tpt-banner');
  ctx.ui.append(pill, banner);
  let bannerT = 0;
  function show(text, cls = '', ms = 1100) { banner.textContent = text; banner.className = 'tpt-banner show ' + cls; bannerT = ms / 1000; }
  const PILL = { ready: ['⏳', 'Get ready…'], sing: ['🎵', 'Creep forward!'], tell: ['🐯', 'FREEZE!'], look: ['👀', 'Don’t move!'], fake: ['😅', 'Phew — go!'], done: ['🔔', 'Done!'] };
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  let ph = 'ready', phT = 0, watch = 0, winner = null, roaring = 0, bellSwing = 0, lastPill = '';
  function setPhase(next) {
    if (next === ph) return;
    const prev = ph; ph = next; phT = 0;
    if (next === 'sing') { tunes.start('sing'); if (prev === 'ready') show('GO!', 'go', 800); else if (prev === 'look') show('Creep!', 'go small', 700); }
    else if (next === 'tell') { tunes.stop(true); show('FREEZE!', 'freeze', 1500); ctx.sfx('status.stun.apply'); }
    else if (next === 'fake') show('Fooled you!', 'small', 900);
    else if (next === 'done') tunes.stop(false);
  }
  return {
    state(g) {
      setPhase(g.ph); watch = g.w; winner = g.win;
      bar.set(g.sc, g.left);
      const mine = ctx.me != null ? g.sc[ctx.me] : null;
      const [icon, text] = PILL[g.ph] || PILL.ready;
      const togo = mine != null && g.ph !== 'done' && g.ph !== 'ready' ? `<b>${Math.max(0, Math.round(RULES.startZ - RULES.bellZ - mine))} m</b>` : '';
      const s = `${icon}|${text}${togo}`;
      if (s !== lastPill) { lastPill = s; pill.dataset.ph = g.ph; pill.innerHTML = `<i>${icon}</i><span>${text}</span>${togo}`; }
    },
    event(ev) {
      if (ev.e === 'roar') {
        roaring = 1.1; tunes.fx('roar');
        floatText(stage, ev.x, 2.2, ev.z, ev.pid === ctx.me ? 'ROAR! Back you go!' : `ROAR! ${nameOf(ev.pid)}`, 'bad');
        if (ev.pid === ctx.me) show('ROAR!', 'freeze', 1200);
      } else if (ev.e === 'bell') {
        bellSwing = 1; tunes.fx('ding'); ctx.sfx('win');
        show(ev.pid === ctx.me ? 'DING! You win!' : `DING! ${nameOf(ev.pid)}!`, 'go', 2600);
      } else if (ev.e === 'time') { show('Time!', 'small', 2000); ctx.sfx('bad'); }
    },
    pose(pid, flags, b) {
      if (flags & F.AIR) return 'hit';
      if (winner != null) return pid === winner ? 'cheer' : 'idle';
      if (ph === 'ready') return 'ready';
      if (flags & F.FROZEN) return 'guard';
      return Math.hypot(b.vx || 0, b.vz || 0) > 0.3 ? 'walk' : undefined;
    },
    frame(dt, t) {
      phT += dt;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      // the tiger turns: back to you while singing, round to look, half way for a fake
      const want = ph === 'look' || ph === 'done' ? 0 : ph === 'fake' ? (phT < 0.4 ? Math.PI * 0.55 : Math.PI) : Math.PI;
      tiger.rotation.y += (want - tiger.rotation.y) * Math.min(1, dt * 13);
      const tell = ph === 'tell';
      tail.rotation.x = tell ? -0.2 + Math.sin(t * 40) * 0.12 : -0.9 + Math.sin(t * 2.2) * 0.15;
      tail.rotation.z = tell ? Math.sin(t * 45) * 0.25 : Math.sin(t * 1.7) * 0.4;
      tailSegs.forEach((s, i) => { if (i) s.rotation.x = tell ? 0.05 : 0.25 + Math.sin(t * 2 + i) * 0.08; });
      bang.visible = tell || (ph === 'look' && phT < 0.5);
      bang.scale.set(0.8 * (1 + Math.sin(t * 30) * 0.08), 1.6, 1);
      eyeMat.emissiveIntensity += ((ph === 'look' && watch === 2 ? 1.8 : 0) - eyeMat.emissiveIntensity) * Math.min(1, dt * 10);
      head.rotation.z = ph === 'sing' ? Math.sin(t * 3.4) * 0.12 : 0;
      head.position.y = 2.15 + (ph === 'sing' ? Math.abs(Math.sin(t * 3.4)) * 0.08 : 0);
      if (roaring > 0) { roaring -= dt; head.rotation.x = -0.25; head.rotation.y = Math.sin(t * 50) * 0.08; mouth.scale.y = 0.3; mouth.position.y = -0.34; for (const f of fangs) f.visible = true; }
      else { head.rotation.x = 0; head.rotation.y = 0; mouth.scale.y = 0.05; mouth.position.y = -0.42; for (const f of fangs) f.visible = false; }
      for (const n of notes) {
        n.t += dt * 0.6; if (n.t > 1) n.t -= 1;
        n.s.visible = ph === 'sing';
        const side = notes.indexOf(n) % 2 ? 1 : -1;
        n.s.position.set(side * (0.9 + n.t * 1.1) + Math.sin(n.t * 9) * 0.2, RULES.stageTop + 4.4 + n.t * 2.2, RULES.tigerZ + 0.3);
        n.s.material.opacity = n.t < 0.15 ? n.t / 0.15 : 1 - (n.t - 0.15) / 0.85;
      }
      if (bellSwing > 0) { bellSwing = Math.max(0, bellSwing - dt * 0.35); bellPivot.rotation.z = Math.sin(t * 16) * 0.5 * bellSwing; }
      glow.material.opacity = 0.35 + Math.sin(t * 4) * 0.2;
      glow.scale.setScalar(1 + Math.sin(t * 4) * 0.05);
      // a roared player spins in the air on the way home
      for (const p of ctx.players) { const a = ctx.actor(p.pid), at = ctx.pos(p.pid); if (a && at) a.body.group.rotation.x = at.y > 0.05 ? -at.y * 0.6 : 0; }
    },
    dispose() {
      tunes.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const p of ctx.players) { const a = ctx.actor(p.pid); if (a) a.body.group.rotation.x = 0; }
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      for (const g of geos) g.dispose();
    },
  };
}
