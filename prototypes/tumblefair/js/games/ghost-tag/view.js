// GHOST TAG, as drawn: a friendly moonlit pumpkin patch (purple sky, soft blue moonlight — never dark enough to lose
// anyone). Mossy grass with darker tufts, a wooden fence round the edge, six lantern posts with warm glowing lanterns,
// rounded lavender gravestones (a little carved moon, nothing grim) and glowing jack-o'-lanterns as obstacles, and a
// crooked bare tree at the back with a lantern hanging from it. HUMANS carry a torch: a pale yellow beam ahead of them.
// GHOSTS float a little off the ground and bob, their whole character turns see-through and glows pale blue with a
// slow shimmer and sparkles circling them, arms up ("wooo"). The round's first ghost covers its eyes while counting.
// A tag throws a puff of sparkles and "Tagged!"; a ghost's BOO! is a ring that ripples out. Solo: cartoon bedsheet
// ghosts drift after you. HUD: score bar (clock = this round), a pill saying what YOU are, a banner per round.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { spookyKit } from './spooky-kit.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const kit = spookyKit(ctx); kit.night();
  const tunes = createTunes({ volume: 0.24 });

  // ---- ground: mossy patch, darker tufts, a dirt ring path, fence
  const outside = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#33523f', { roughness: 1 })); outside.position.y = -0.03; outside.receiveShadow = true; group.add(outside);
  const grassTex = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#4b7a52'; c.fillRect(0, 0, w, w); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 260; i++) { c.fillStyle = r() < 0.5 ? 'rgba(40,80,50,.5)' : 'rgba(110,160,100,.35)'; c.beginPath(); c.ellipse(r() * w, r() * w, 3 + r() * 8, 2 + r() * 4, r() * 3, 0, 7); c.fill(); } }));
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(A.hw / 3, A.hd / 3);
  const patch = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: grassTex, roughness: 1 })); patch.receiveShadow = true; group.add(patch);
  const path = new THREE.Mesh(geo(new THREE.RingGeometry(3.4, 4.3, 48).rotateX(-Math.PI / 2)), std('#7a6450', { roughness: 1 })); path.scale.set(1.45, 1, 1); path.position.y = 0.004; path.receiveShadow = true; group.add(path);
  // fence: posts + two rails all round
  const fp = [], step = 1.5;
  for (let x = -A.hw; x <= A.hw + 0.01; x += step) fp.push([x, -A.hd - 0.3], [x, A.hd + 0.3]);
  for (let z = -A.hd + step; z < A.hd - 0.01; z += step) fp.push([-A.hw - 0.3, z], [A.hw + 0.3, z]);
  const fence = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.16, 0.9, 0.16)), std('#6b4a35'), fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.45, z), q.identity(), sc.setScalar(1)); fence.setMatrixAt(i, m4); });
  fence.castShadow = true; group.add(fence);
  const railMat = std('#7d5a40');
  for (const sz of [-1, 1]) for (const y of [0.3, 0.68]) mesh(geo(new THREE.BoxGeometry(A.hw * 2 + 0.6, 0.07, 0.06)), railMat, 0, y, sz * (A.hd + 0.3));
  for (const sx of [-1, 1]) for (const y of [0.3, 0.68]) mesh(geo(new THREE.BoxGeometry(0.06, 0.07, A.hd * 2 + 0.6)), railMat, sx * (A.hw + 0.3), y, 0);

  // ---- lantern posts round the edge (glow sprites, no extra lights)
  const lanternMat = std('#fff2c4', { emissive: '#ffc35a', emissiveIntensity: 2 }), postMat = std('#3a2c55', { metalness: 0.3, roughness: 0.5 });
  const lanterns = [];
  for (const [x, z] of [[-A.hw - 0.3, -A.hd - 0.3], [A.hw + 0.3, -A.hd - 0.3], [-A.hw - 0.3, A.hd + 0.3], [A.hw + 0.3, A.hd + 0.3], [-A.hw - 0.3, 0], [A.hw + 0.3, 0]]) {
    mesh(geo(new THREE.CylinderGeometry(0.07, 0.1, 2.2, 8)), postMat, x, 1.1, z);
    mesh(geo(new THREE.BoxGeometry(0.34, 0.42, 0.34)), lanternMat, x, 2.4, z).castShadow = false;
    mesh(geo(new THREE.ConeGeometry(0.3, 0.22, 4).rotateY(Math.PI / 4)), postMat, x, 2.72, z);
    const g = kit.glowSprite('#ffc35a', 2.6, 0.75); g.position.set(x, 2.4, z); group.add(g); lanterns.push(g);
    const pool = new THREE.Mesh(geo(new THREE.CircleGeometry(1.8, 24).rotateX(-Math.PI / 2)), basic({ color: '#ffc35a', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending })); pool.position.set(x, 0.012, z); group.add(pool);
  }

  // ---- obstacles: gravestones (blocks) and jack-o'-lanterns (posts); the last post is the crooked tree
  const stoneTex = tex(canvasTexture(128, 128, (c, w) => { c.fillStyle = '#b5aed0'; c.fillRect(0, 0, w, w); c.strokeStyle = '#7f77a3'; c.lineWidth = 7; c.beginPath(); c.arc(w / 2, w * 0.42, 22, Math.PI * 0.3, Math.PI * 1.7); c.stroke(); c.fillStyle = '#7f77a3'; for (const [x, y] of [[30, 96], [64, 102], [98, 96]]) { c.beginPath(); c.arc(x, y, 4, 0, 7); c.fill(); } }));
  const stoneMat = std('#ffffff', { map: stoneTex, roughness: 0.95 }), stoneBox = geo(new THREE.BoxGeometry(1, 1, 1)), stoneTop = geo(new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2));
  for (const b of A.blocks) {
    const g = new THREE.Group(); g.position.set(b.x, 0, b.z); group.add(g);
    const w = b.hw * 2, d = b.hd * 2, hh = 0.75;
    mesh(stoneBox, stoneMat, 0, hh / 2, 0, g).scale.set(w, hh, d);
    const top = mesh(stoneTop, stoneMat, 0, hh, 0, g); top.scale.set(w, w * 0.8, d);
  }
  const posts = A.posts.slice(0, -1), treeAt = A.posts[A.posts.length - 1];
  const jacks = posts.map((p, i) => { const j = kit.jackOLantern(p.r * 0.95); j.position.set(p.x, 0, p.z); j.rotation.y = Math.atan2(-p.x, 6 - p.z) * 0.6 + (i % 2 ? 0.2 : -0.2); group.add(j); const gl = kit.glowSprite('#ffa030', p.r * 4, 0.5); gl.position.set(p.x, p.r * 0.8, p.z + 0.2); group.add(gl); return { j, gl }; });
  // the crooked tree
  const bark = std('#4a3326', { roughness: 1, flatShading: true });
  const tree = new THREE.Group(); tree.position.set(treeAt.x, 0, treeAt.z); group.add(tree);
  const seg = (len, r0, r1, parent, rx, rz, y) => { const g = new THREE.Group(); g.position.y = y; g.rotation.set(rx, 0, rz); parent.add(g); mesh(geo(new THREE.CylinderGeometry(r1, r0, len, 6).translate(0, len / 2, 0)), bark, 0, 0, 0, g); return g; };
  const t1 = seg(1.6, 0.42, 0.3, tree, 0, 0.12, 0), t2 = seg(1.3, 0.3, 0.2, t1, 0, -0.35, 1.5);
  seg(1.4, 0.16, 0.06, t2, 0.2, 0.9, 1.1); seg(1.2, 0.14, 0.05, t2, -0.3, -0.8, 1.2); seg(0.9, 0.12, 0.05, t1, 0.4, -1.1, 1.2);
  const hangL = mesh(geo(new THREE.BoxGeometry(0.26, 0.32, 0.26)), lanternMat, -0.9, 2.55, 0.1, tree); hangL.castShadow = false;
  const hangG = kit.glowSprite('#ffc35a', 1.8, 0.7); hangG.position.set(-0.9, 2.55, 0.1); tree.add(hangG);
  // the moon
  const moon = new THREE.Mesh(geo(new THREE.CircleGeometry(2.4, 32)), basic({ color: '#fff6d8' })); moon.position.set(-7, 10, -24); group.add(moon);
  const moonGlow = kit.glowSprite('#fff2c4', 10, 0.5); moonGlow.position.copy(moon.position); group.add(moonGlow);

  // ---- per player: the torch beam (humans), glow + sparkles (ghosts); ghost bodies go see-through
  const beamGeo = geo(new THREE.ConeGeometry(0.85, 3.0, 18, 1, true).translate(0, -1.5, 0).rotateX(-Math.PI / 2));
  const sparkTex = tex(canvasTexture(32, 32, (c, w) => { c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 4 : 15; c.lineTo(w / 2 + Math.cos(a) * r, w / 2 + Math.sin(a) * r); } c.fill(); }));
  const P = new Map();
  for (const p of ctx.players) {
    const beam = new THREE.Mesh(beamGeo, basic({ color: '#fff2b0', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.userData.mine = true; beam.renderOrder = 3;
    const aura = kit.glowSprite('#9fd0ff', 2.4, 0); aura.userData.mine = true;
    const spPos = new Float32Array(8 * 3), spGeo = geo(new THREE.BufferGeometry()); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const sparks = new THREE.Points(spGeo, (() => { const m = new THREE.PointsMaterial({ map: sparkTex, color: '#dff2ff', size: 0.22, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push(m); return m; })());
    sparks.userData.mine = true; sparks.frustumCulled = false;
    P.set(p.pid, { beam, aura, sparks, spPos, ro: 0, ghostK: 0, mats: null, flags: 0 });
  }
  function attach() {
    for (const [pid, s] of P) {
      if (s.mats) continue;
      const a = ctx.actor(pid); if (!a) continue;
      const hgt = a.height || 1.6;
      // every body material goes transparent ONCE now (opacity 1 looks the same); later only opacity/emissive move,
      // which are uniforms, so a tag never recompiles a shader mid-game
      s.mats = [];
      a.body.group.traverse(o => { if (!o.isMesh || o.userData.mine) return; for (const m of [].concat(o.material)) if (!s.mats.some(r => r.m === m)) { s.mats.push({ m, transparent: m.transparent, opacity: m.opacity, emissive: m.emissive?.clone(), ei: m.emissiveIntensity, dw: m.depthWrite }); m.transparent = true; m.needsUpdate = true; } });
      s.beam.position.set(0, hgt * 0.42, 0.3); s.beam.rotation.x = 0.28; a.body.group.add(s.beam);
      s.aura.position.set(0, hgt * 0.5, 0); a.group.add(s.aura);
      a.group.add(s.sparks); s.hgt = hgt;
    }
  }
  function ghostLook(s, k, t) {
    if (!s.mats) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    for (const r of s.mats) {
      r.m.opacity = r.opacity * (1 - 0.55 * k);
      if (r.m.emissive) { r.m.emissive.copy(r.emissive).lerp(GHOST_GLOW, k); r.m.emissiveIntensity = (r.ei ?? 1) * (1 - k) + k * (0.55 + 0.35 * pulse); }
    }
  }
  const GHOST_GLOW = new THREE.Color('#8fc8ff');

  // ---- solo: bedsheet ghosts that drift after you
  const cpus = new Map();
  function cpuGhost(id) { let c = cpus.get(id); if (c) return c; const g = kit.sheetGhost({ opacity: 0.88, scale: 1.25 }); group.add(g); const gl = kit.glowSprite('#9fd0ff', 2.4, 0.55); gl.position.y = 0.7; g.add(gl); c = { g, x: 0, z: 0, tx: 0, tz: 0, yaw: 0, seen: false }; cpus.set(id, c); return c; }

  // ---- ripples (BOO!) and tag puffs
  const ringGeo = geo(new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2)), ripples = [];
  const puffGeo = geo(new THREE.BufferGeometry()); const PUFF = 14; puffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PUFF * 3), 3));
  const puffs = [];
  function ripple(x, z) { const m = new THREE.Mesh(ringGeo, basic({ color: '#bfe3ff', transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); m.position.set(x, 0.6, z); group.add(m); ripples.push({ m, t: 0 }); }
  function puff(x, z) { const g = new THREE.BufferGeometry(), pos = new Float32Array(PUFF * 3), vel = []; for (let i = 0; i < PUFF; i++) { const a = i / PUFF * Math.PI * 2; vel.push([Math.cos(a) * 2.2, 1.5 + (i % 3) * 0.8, Math.sin(a) * 2.2]); pos.set([x, 1, z], i * 3); } g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geos.push(g);
    const m = new THREE.PointsMaterial({ map: sparkTex, color: '#ffe9a8', size: 0.35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push(m); const pts = new THREE.Points(g, m); pts.frustumCulled = false; group.add(pts); puffs.push({ pts, vel, t: 0 }); }

  // a portrait phone sees a 13 m slice that follows its own character (the whole patch makes everyone ant-sized);
  // a TV, a landscape phone or a watcher sees the whole patch
  const FULL = { cx: 0, cz: -0.4, hw: A.hw + 0.8, hd: A.hd + 1.1 }, SLICE = 6.5;
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
  const bar = scoreBar(ctx, { unit: init.solo ? 's' : 'pts' });
  const pill = h('div', 'gt-pill'), banner = h('div', 'gt-banner'), lives = init.solo ? h('div', 'gt-lives') : null;
  ctx.ui.append(pill, banner); if (lives) ctx.ui.append(lives);
  let bannerT = 0, lastPill = '', g0 = null, ended = false, phase = 'between', roundWinners = new Set();
  function show(html, cls = '', ms = 1500) { banner.innerHTML = html; banner.className = 'gt-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  function setPill(icon, text, cls = '') { const k = icon + text + cls; if (k === lastPill) return; lastPill = k; pill.className = 'gt-pill ' + cls; pill.innerHTML = `<i>${icon}</i><span>${text}</span>`; }
  tunes.start('spooky');
  show(init.solo ? 'Run from the ghosts!' : 'Ghost Tag!', 'go', 1400);

  // the pill (and the line under it) sit just under the score bar, which wraps to two rows with four players on a phone
  let hudTop = -1;
  function placeHud() {
    const top = Math.round(bar.el.getBoundingClientRect().bottom - ctx.ui.getBoundingClientRect().top + 8), key = top * 1000 + pill.offsetHeight; if (key === hudTop || !(top > 0)) return; hudTop = key;
    pill.style.top = top + 'px'; const under = [pill, lives][1]; if (under) under.style.top = (top + pill.offsetHeight + 6) + 'px';
  }
  return {
    state(g) {
      g0 = g; phase = g.ph;
      bar.set(g.sc, g.ph === 'play' ? g.rl : null);
      for (const [pid, s] of P) { s.ro = g.ro[pid] || 0; bar.mark(pid, 'gt-ghost', s.ro > 0); }
      if (lives) lives.innerHTML = Array.from({ length: init.lives }, (_, i) => `<span class="${i < g.lv ? '' : 'gone'}">🏮</span>`).join('') + `<b>${g.sc[ctx.me ?? ctx.players[0].pid] || 0} s</b>`;
      if (g.cpu) {
        const seen = new Set();
        for (const [id, x, z] of g.cpu) { const c = cpuGhost(id); if (!c.seen) { c.x = x; c.z = z; c.seen = true; } c.tx = x; c.tz = z; seen.add(id); }
        for (const [id, c] of cpus) if (!seen.has(id)) { c.g.removeFromParent(); cpus.delete(id); }
      }
      if (!ended && g.left <= 0) { ended = true; }
    },
    input(inp) {
      const a = ctx.actor(ctx.me), s = P.get(ctx.me); if (!a || !s) return;
      if ((inp.b & IN.A) && s.ro === 1) a.play('cast', 500);
      if ((inp.b & IN.A) && s.ro === 0 && !(s.flags & (F.STUN | F.FROZEN))) a.play('jump', 280);
    },
    event(ev) {
      if (ev.e === 'round') {
        roundWinners.clear(); ended = false;
        if (init.solo) show('Run! 👻 Ghosts are coming!', 'go', 1500);
        else show(`<small>Round ${ev.round} of ${ev.rounds}</small>👻 ${ev.ghost === ctx.me ? 'YOU are the ghost!' : `${nameOf(ev.ghost)} is the ghost!`}`, 'round', 2200);
        tunes.start('spooky'); ctx.sfx('tap');
      } else if (ev.e === 'tag') {
        puff(ev.x, ev.z); tunes.fx('boo', 1.1); ctx.sfx(ev.pid === ctx.me ? 'bad' : ev.by === ctx.me ? 'good' : 'tap');
        floatText(stage, ev.x, 2.3, ev.z, ev.pid === ctx.me ? 'Tagged! You’re a ghost!' : ev.by === ctx.me ? 'Tagged! +3' : `${nameOf(ev.pid)} tagged!`, ev.by === ctx.me ? 'good' : 'bad');
        if (ev.pid === ctx.me) show('👻 You’re a ghost now!', 'boo', 1400);
        ctx.actor(ev.pid)?.play('hit', 600);
      } else if (ev.e === 'boo') {
        ripple(ev.x, ev.z); tunes.fx('boo', 0.85);
        floatText(stage, ev.x, 2.4, ev.z, 'BOO!', 'good');
        if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('cast', 500);
      } else if (ev.e === 'caught') {
        puff(ev.x, ev.z); tunes.fx('boo'); ctx.sfx('bad');
        show(ev.lives > 0 ? `Caught! ${ev.lives} lantern${ev.lives > 1 ? 's' : ''} left` : 'Caught!', 'boo', 1300);
      } else if (ev.e === 'cpu') { tunes.fx('boo', 1.3); }
      else if (ev.e === 'dash') { tunes.fx('whistle'); if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 280); }
      else if (ev.e === 'roundEnd') {
        for (const pid of ev.last) roundWinners.add(pid);
        if (init.solo || ev.round >= (init.rounds || 1)) ended = true;
        const names = ev.last.map(nameOf);
        if (init.solo) show(ev.why === 'caught' ? 'The ghosts got you!' : 'You made it! 🎃', ev.why === 'caught' ? 'boo' : 'go', 2200);
        else if (names.length) show(`🏆 Last human${names.length > 1 ? 's' : ''}: ${names.join(' & ')} <small>+${RULES.lastPts}</small>`, 'go', 2200);
        else show('Everyone is a ghost!', 'boo', 2000);
        ctx.sfx('win'); tunes.stop(false);
      }
    },
    pose(pid, flags, b) {
      const s = P.get(pid); if (s) s.flags = flags;
      if (phase !== 'play' && roundWinners.has(pid)) return 'cheer';
      if (!s) return undefined;
      if (s.ro === 2) return (flags & F.FROZEN) && phase === 'play' ? 'guard' : 'cast';
      if (s.ro === 1) return 'cast';
      if (flags & F.STUN) return 'hit';
      if (phase !== 'play') return 'ready';
      return undefined;
    },
    frame(dt, t) {
      attach(); frameCam(dt); placeHud();
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      for (const [pid, s] of P) {
        const ghost = s.ro > 0;
        s.ghostK += ((ghost ? 1 : 0) - s.ghostK) * Math.min(1, dt * 5);
        ghostLook(s, s.ghostK, t + pid);
        const a = ctx.actor(pid); if (!a || !s.mats) continue;
        a.body.group.position.y = ghost ? Math.sin(t * 3 + pid) * 0.09 : 0;
        s.beam.visible = s.ghostK < 0.5; s.beam.material.opacity = 0.16 * (1 - s.ghostK) * (0.9 + 0.1 * Math.sin(t * 9 + pid));
        s.aura.material.opacity = 0.5 * s.ghostK * (0.8 + 0.2 * Math.sin(t * 4 + pid));
        s.sparks.material.opacity = 0.9 * s.ghostK;
        for (let i = 0; i < 8; i++) { const ang = t * 1.6 + i * Math.PI / 4 + pid, r = 0.55 + 0.1 * Math.sin(t * 3 + i); s.spPos[i * 3] = Math.cos(ang) * r; s.spPos[i * 3 + 1] = (s.hgt || 1.6) * (0.25 + ((i * 0.13 + t * 0.35) % 1) * 0.8); s.spPos[i * 3 + 2] = Math.sin(ang) * r; }
        s.sparks.geometry.attributes.position.needsUpdate = true;
      }
      for (const c of cpus.values()) {
        const k = Math.min(1, dt * 12); c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k;
        const want = Math.atan2(c.tx - c.x, c.tz - c.z); if (Math.hypot(c.tx - c.x, c.tz - c.z) > 0.02) { let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 6); }
        c.g.position.set(c.x, 0.25 + Math.sin(t * 3 + c.x) * 0.12, c.z); c.g.rotation.y = c.yaw; c.g.rotation.z = Math.sin(t * 2.3 + c.z) * 0.08;
        c.g.userData.mat.opacity = 0.8 + 0.12 * Math.sin(t * 4 + c.x);
      }
      for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.t += dt; const k = r.t / 0.6; r.m.scale.setScalar(0.4 + k * RULES.booR); r.m.material.opacity = 0.8 * (1 - k); if (k >= 1) { r.m.removeFromParent(); ripples.splice(i, 1); } }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; const pos = p.pts.geometry.attributes.position; for (let j = 0; j < PUFF; j++) { pos.array[j * 3] += p.vel[j][0] * dt; pos.array[j * 3 + 1] += p.vel[j][1] * dt; pos.array[j * 3 + 2] += p.vel[j][2] * dt; p.vel[j][1] -= 4 * dt; } pos.needsUpdate = true; p.pts.material.opacity = 1 - p.t / 0.9; if (p.t >= 0.9) { p.pts.removeFromParent(); puffs.splice(i, 1); } }
      for (const [i, l] of lanterns.entries()) l.material.opacity = 0.7 + 0.08 * Math.sin(t * 5 + i * 1.7);
      for (const [i, j] of jacks.entries()) j.gl.material.opacity = 0.45 + 0.1 * Math.sin(t * 6 + i);
      // the pill: what am I?
      const s = P.get(ctx.me), g = g0;
      if (!g) return;
      if (ended) setPill('🎃', 'Done! Happy Halloween!');
      else if (ctx.me == null || !s) setPill('👻', phase === 'play' ? 'Ghosts are hunting!' : 'Get ready…');
      else if (phase !== 'play') setPill('⏳', 'Next round…');
      else if (init.solo) setPill('🏃', g.safe ? 'Phew! Run!' : ctx.btn('RUN! (A = dash)'), g.safe ? 'go' : '');
      else if (s.ro === 2 && (s.flags & F.FROZEN)) setPill('🙈', 'Counting… then tag them!', 'ghost');
      else if (s.ro > 0) setPill('👻', ctx.btn('GHOST: tag them! (A = BOO!)'), 'ghost');
      else if (s.flags & F.STUN) setPill('😱', 'Eek! Run!', 'warn');
      else setPill('🏃', ctx.btn('HUMAN: run! (A = dash)'), 'human');
    },
    dispose() {
      tunes.dispose(); kit.dispose();
      bar.el.remove(); pill.remove(); banner.remove(); lives?.remove();
      for (const [pid, s] of P) {
        s.beam.removeFromParent(); s.aura.removeFromParent(); s.sparks.removeFromParent();
        if (s.mats) for (const r of s.mats) { r.m.transparent = r.transparent; r.m.opacity = r.opacity; if (r.emissive) r.m.emissive.copy(r.emissive); r.m.emissiveIntensity = r.ei; r.m.needsUpdate = true; }
        const a = ctx.actor(pid); if (a) a.body.group.position.y = 0;
      }
      for (const x of texs) x.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
