// THIN ICE, as drawn: a frozen pond in a snowy clearing — 61 pale-blue hexagon tiles of ice (one instanced mesh)
// floating on dark teal water, with lumpy snowbanks and snowy pine trees round the shore. A tile under strain goes a
// little whiter; a cracking tile gets white crack lines (thin, then many, then a heavy shattered web) and in its last
// moments it shivers; then it tips and sinks with a splash ring. A slide leaves a puff of ice dust; a bump flashes.
// Fallen players sink into the water and their chip is struck out. Solo: a spinning snowflake to grab (+3).
import { pond, HEX, RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const PD = pond(init.rings), TILES = PD.tiles, N = TILES.length, HW = ctx.season === 'halloween', PR = PD.radius;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  // ---- water, shore, snowbanks, pines
  const water = new THREE.Mesh(new THREE.CircleGeometry(PR + 2, 48).rotateX(-Math.PI / 2), std(HW ? '#24324f' : '#1d5f74', { roughness: 0.2, metalness: 0.2 })); water.position.y = -0.85; group.add(water);
  const shore = new THREE.Mesh(new THREE.RingGeometry(PR + 1.7, 60, 48, 1).rotateX(-Math.PI / 2), std('#f3f8ff', { roughness: 1 })); shore.position.y = -0.05; shore.receiveShadow = true; group.add(shore);
  const BANK = 44, bank = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 1), std('#ffffff', { roughness: 1, flatShading: true }), BANK);
  for (let i = 0; i < BANK; i++) { const a = i / BANK * Math.PI * 2, r = PR + 1.8 + (i % 3) * 0.25; m4.compose(v.set(Math.sin(a) * r, -0.35 + (i % 2) * 0.1, Math.cos(a) * r), q.setFromEuler(e3.set(i, i * 1.7, 0)), sc.set(1.1 + (i % 4) * 0.2, 0.7, 1)); bank.setMatrixAt(i, m4); }
  bank.castShadow = bank.receiveShadow = true; group.add(bank);
  const PN = 16, pineG = new THREE.ConeGeometry(1.1, 2.6, 7), pines = new THREE.InstancedMesh(pineG, std(HW ? '#2c4a3a' : '#2e6b4a', { flatShading: true }), PN * 2), snowCaps = new THREE.InstancedMesh(new THREE.ConeGeometry(0.62, 1.0, 7), std('#ffffff', { flatShading: true }), PN);
  for (let i = 0; i < PN; i++) {
    const a = i / PN * Math.PI * 2 + 0.15, r = PR + 4.3 + (i % 3) * 1.8, x = Math.sin(a) * r, z = Math.cos(a) * r, s = 0.9 + (i % 4) * 0.2;
    m4.compose(v.set(x, 1.3 * s, z), q.identity(), sc.setScalar(s)); pines.setMatrixAt(i * 2, m4);
    m4.compose(v.set(x, 2.5 * s, z), q.identity(), sc.setScalar(s * 0.75)); pines.setMatrixAt(i * 2 + 1, m4);
    m4.compose(v.set(x, 3.25 * s, z), q.identity(), sc.setScalar(s)); snowCaps.setMatrixAt(i, m4);
  }
  pines.castShadow = true; group.add(pines, snowCaps);

  // ---- the ice: one instanced hex prism per tile, plus three crack overlays (thin / many / shattered)
  const tileGeo = new THREE.CylinderGeometry(HEX * 0.965, HEX * 0.9, 0.36, 6).rotateY(Math.PI / 6).translate(0, -0.18, 0);
  const ice = new THREE.InstancedMesh(tileGeo, std('#ffffff', { roughness: 0.15, metalness: 0.05 }), N);
  ice.receiveShadow = true; group.add(ice);
  const crackTex = lvl => canvasTexture(128, 128, (c, w) => {
    // dark blue cracks with a white edge, so they read on pale ice: few and thin, then many, then a shattered web
    let s = 11 + lvl * 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const paths = [], arms = [3, 6, 10][lvl - 1];
    for (let k = 0; k < arms; k++) {
      let x = w / 2, y = w / 2, a = k / arms * Math.PI * 2 + r() * 0.6; const p = [[x, y]];
      for (let j = 0; j < 4; j++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 16; y += Math.sin(a) * 16; p.push([x, y]); if (lvl > 1 && r() < 0.4) paths.push([[x, y], [x + Math.cos(a + 1.3) * 12, y + Math.sin(a + 1.3) * 12]]); }
      paths.push(p);
    }
    if (lvl === 3) for (const rr of [22, 40]) { const p = []; for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 + r() * 0.3; p.push([w / 2 + Math.cos(a) * rr, w / 2 + Math.sin(a) * rr]); } paths.push(p); }
    c.lineCap = c.lineJoin = 'round';
    for (const [style, lw, off] of [['rgba(255,255,255,.95)', [8, 10, 13][lvl - 1], 2], [lvl === 3 ? '#0d2f4a' : '#1d4f74', [4.5, 6, 8][lvl - 1], 0]]) {
      c.strokeStyle = style; c.lineWidth = lw;
      for (const p of paths) { c.beginPath(); p.forEach(([x, y], i) => c[i ? 'lineTo' : 'moveTo'](x + off, y + off)); c.stroke(); }
    }
  });
  const overGeo = new THREE.CircleGeometry(HEX * 0.9, 6).rotateX(-Math.PI / 2).rotateY(Math.PI / 6);
  const overlays = [1, 2, 3].map(k => { const m = new THREE.InstancedMesh(overGeo, new THREE.MeshBasicMaterial({ map: crackTex(k), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), N); m.renderOrder = 2; group.add(m); return m; });
  const COLORS = { 0: HW ? '#d9ccff' : '#cdeeff', s: HW ? '#ebe2ff' : '#e8f7ff', 1: HW ? '#b9a6ee' : '#a8d6f0', 2: HW ? '#9a86dc' : '#86bfe6', 3: HW ? '#7d68c8' : '#5f9fd4' };
  const tiles = TILES.map(() => ({ s: '0', drop: -1 }));
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  function drawTile(i, t) {
    const T = tiles[i], [, , x, z] = TILES[i];
    let y = 0, rx = 0, rz = 0, s = 1;
    if (T.s === 'x') {
      const k = T.drop < 0 ? 1 : Math.min(1, (t - T.drop) / 0.7);
      y = -k * k * 1.4; rx = k * 0.5 * Math.sin(i * 2.1); rz = k * 0.5 * Math.cos(i * 1.3); s = k >= 1 ? 0 : 1;
    } else if (T.s === '3') { y = Math.sin(t * 38 + i) * 0.03; rx = Math.sin(t * 31 + i) * 0.04; rz = Math.cos(t * 27 + i) * 0.04; }
    if (!s) ice.setMatrixAt(i, zero); else { m4.compose(v.set(x, y, z), q.setFromEuler(e3.set(rx, 0, rz)), sc.setScalar(1)); ice.setMatrixAt(i, m4); }
    for (let k = 0; k < 3; k++) {
      if (s && T.s === String(k + 1)) { m4.compose(v.set(x, y + 0.012, z), q.setFromEuler(e3.set(rx, i * 0.7, rz)), sc.setScalar(1)); overlays[k].setMatrixAt(i, m4); }
      else overlays[k].setMatrixAt(i, zero);
    }
  }
  for (let i = 0; i < N; i++) { ice.setColorAt(i, col.set(COLORS[0])); drawTile(i, 0); }
  const moving = new Set();                                  // tiles that need redrawing every frame (shivering, sinking)

  // ---- splashes, ice dust, the solo snowflake
  const ringGeo = new THREE.RingGeometry(0.4, 0.55, 32).rotateX(-Math.PI / 2), fx = [];
  function splash(x, z, big = false) { for (let k = 0; k < (big ? 2 : 1); k++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#e6fbff', transparent: true, opacity: 0.9, depthWrite: false })); m.position.set(x, -0.8, z); group.add(m); fx.push({ m, t: -k * 0.15, kind: 'ring' }); } }
  const dustGeo = new THREE.IcosahedronGeometry(0.22, 0);
  function dust(x, z, color = '#ffffff') { for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(dustGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); const a = i * 1.05; m.position.set(x, 0.3, z); m.userData.v = [Math.sin(a) * 1.8, 1.2 + (i % 2), Math.cos(a) * 1.8]; group.add(m); fx.push({ m, t: 0, kind: 'dust' }); } }
  let flakeMesh = null;
  if (init.solo) {
    const fg = new THREE.BoxGeometry(0.9, 0.09, 0.12), parts = [];
    flakeMesh = new THREE.Group(); const fm = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#9be4ff', emissiveIntensity: 0.8 });
    for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(fg, fm); p.rotation.y = k * Math.PI / 3; flakeMesh.add(p); parts.push(p); }
    flakeMesh.visible = false; group.add(flakeMesh);
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: init.solo ? 'pts' : 's' });
  const banner = h('div', 'ti-banner'); ctx.ui.append(banner); let bannerT = 0;
  const show = (text, cls = '', s = 1.4) => { banner.textContent = text; banner.className = 'ti-banner show ' + cls; bannerT = s; };
  const tip = h('div', 'ti-tip', init.solo ? '❄ Keep moving! Grab snowflakes for +3' : '❄ Keep moving — the ice cracks!'); ctx.ui.append(tip);
  setTimeout(() => tip.classList.add('gone'), 4500);
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  let prevB = 0, prevS = -9, lastT = '';
  return {
    halloween: { y: -0.05, mist: false },
    start() { show('Ready…', '', init.grace - 0.4); setTimeout(() => { if (banner.isConnected) { show('GO! Keep moving!', 'good', 1.2); ctx.sfx('pick'); } }, (init.grace - 0.3) * 1000); },
    state(g) {
      if (g.t !== lastT) {
        const now = performance.now() / 1000;
        for (let i = 0; i < N; i++) {
          const ch = g.t[i]; if (ch === tiles[i].s) continue;
          const T = tiles[i]; T.s = ch;
          if (ch === 'x') { T.drop = now; moving.add(i); splash(TILES[i][2], TILES[i][3]); }
          else { ice.setColorAt(i, col.set(COLORS[ch])); if (ch === '3') moving.add(i); }
          drawTile(i, now);
        }
        ice.instanceColor.needsUpdate = true; ice.instanceMatrix.needsUpdate = true; for (const o of overlays) o.instanceMatrix.needsUpdate = true;
        lastT = g.t;
      }
      for (const p of ctx.players) bar.mark(p.pid, 'out', g.o.includes(p.pid));
      bar.set(g.sc, g.left);
      if (flakeMesh) { flakeMesh.visible = !!g.f; if (g.f) flakeMesh.position.set(g.f[0], 0.7, g.f[1]); }
    },
    input(inp) {
      const fresh = !(prevB & (IN.A | IN.B)) || inp.s !== prevS + 1; prevB = inp.b; prevS = inp.s;
      if ((inp.b & (IN.A | IN.B)) && fresh) ctx.actor(ctx.me)?.play('jump', 300);
    },
    event(ev) {
      if (ev.e === 'slide') { const p = ctx.pos(ev.pid); if (p) dust(p.x, p.z); if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 300); ctx.sfx('throw'); }
      else if (ev.e === 'bump') { dust(ev.x, ev.z, '#ffe08a'); ctx.sfx('hit'); }
      else if (ev.e === 'crack') ctx.sfx('tap');
      else if (ev.e === 'drop') { /* the splash is drawn when the state shows the tile gone */ }
      else if (ev.e === 'fall') { splash(ev.x, ev.z, true); ctx.sfx('splat'); floatText(stage, ev.x, 0.6, ev.z, ev.pid === ctx.me ? 'Splash! You fell in' : `${nameOf(ev.pid)} fell in!`, ev.pid === ctx.me ? 'bad' : ''); if (ev.pid === ctx.me) show('Splash!', 'bad'); }
      else if (ev.e === 'flake') { ctx.sfx('coins'); floatText(stage, ev.x, 1.2, ev.z, `+${RULES.flake}`, 'good'); }
      else if (ev.e === 'end') { if (ev.win != null) { show(ev.win === ctx.me ? 'Last one standing — you!' : `${nameOf(ev.win)} is the last one!`, ev.win === ctx.me ? 'good' : '', 2.5); ctx.sfx(ev.win === ctx.me ? 'win' : 'good'); } }
    },
    pose(pid, flags, b) { if (b.y < -0.05) return 'hit'; if (flags & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      const now = performance.now() / 1000;
      if (moving.size) {
        for (const i of moving) { drawTile(i, now); const T = tiles[i]; if (T.s === 'x' && now - T.drop > 0.75) moving.delete(i); else if (T.s !== 'x' && T.s !== '3') moving.delete(i); }
        ice.instanceMatrix.needsUpdate = true; for (const o of overlays) o.instanceMatrix.needsUpdate = true;
      }
      if (flakeMesh?.visible) { flakeMesh.rotation.y = t * 2; flakeMesh.position.y = 0.7 + Math.sin(t * 3) * 0.12; }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt * (f.kind === 'ring' ? 1.6 : 2.6); if (f.t < 0) continue;
        if (f.kind === 'ring') { f.m.scale.setScalar(1 + f.t * 4); f.m.material.opacity = Math.max(0, 0.9 - f.t); }
        else { const [vx, vy, vz] = f.m.userData.v; f.m.position.x += vx * dt; f.m.position.y += vy * dt; f.m.position.z += vz * dt; f.m.material.opacity = Math.max(0, 0.9 - f.t); }
        if (f.t >= 1) { f.m.removeFromParent(); f.m.material.dispose(); fx.splice(i, 1); }
      }
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.className = 'ti-banner'; }
    },
    dispose() { bar.el.remove(); for (const o of overlays) o.material.map.dispose(); },
  };
}
