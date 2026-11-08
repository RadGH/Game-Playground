// FROSTY FREEZE TAG, as drawn: a bright snowy park under a pale winter sky — a trampled path loop, a low fence with
// snow on the posts, pines round the outside and flakes coming down. Obstacles are clear blue blocks of ice and
// snowmen. THE FROST glows icy blue with snowflake sparkles circling it; a frozen runner stands inside a see-through
// block of ice with a ring on the snow that fills as they thaw (a friend standing close, or the melt). FROST BREATH is
// a ring of frosty air rolling out. Solo: little round frost sprites (an ice crystal with a face and a pointy ice hat)
// chase you, and frozen snow pals (snowmen in ice blocks) wait to be thawed. HUD: score bar (clock = this round), a
// pill saying what YOU are, a banner per round, and three snowflakes for lives when alone.
import { RULES } from './sim.js';
import { snowKit, WINTER } from '../sled-bash/snow-kit.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { createJuice } from '../../client/juice.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const ICE = '#9fdcff', FROST_GLOW = '#7fc8ff';
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const kit = snowKit(ctx), { std, basic, geo } = kit;
  const texs = []; const tex = t => { texs.push(t); return t; };
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);
  kit.sky();

  // ---- ground: snow, a trampled loop path, fence with snowy caps, pines, flakes
  kit.ground(90);
  const path = new THREE.Mesh(geo(new THREE.RingGeometry(3.4, 4.3, 48).rotateX(-Math.PI / 2)), std(WINTER.shade, { roughness: 1 })); path.scale.set(1.45, 1, 1); path.position.y = 0.004; path.receiveShadow = true; group.add(path);
  const fp = [], STEP = 1.5;
  for (let x = -A.hw; x <= A.hw + 0.01; x += STEP) fp.push([x, -A.hd - 0.3], [x, A.hd + 0.3]);
  for (let z = -A.hd + STEP; z < A.hd - 0.01; z += STEP) fp.push([-A.hw - 0.3, z], [A.hw + 0.3, z]);
  const fence = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(0.16, 0.85, 0.16)), std('#8a5a32'), fp.length);
  const caps = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.14, 6, 4)), kit.snowMat, fp.length);
  fp.forEach(([x, z], i) => { m4.compose(v.set(x, 0.42, z), q.identity(), sc.setScalar(1)); fence.setMatrixAt(i, m4); m4.compose(v.set(x, 0.87, z), q.identity(), sc.set(1, 0.6, 1)); caps.setMatrixAt(i, m4); });
  fence.castShadow = true; group.add(fence, caps);
  const railMat = std('#9a6a40');
  for (const sz of [-1, 1]) for (const y of [0.3, 0.65]) { const r = new THREE.Mesh(geo(new THREE.BoxGeometry(A.hw * 2 + 0.6, 0.07, 0.06)), railMat); r.position.set(0, y, sz * (A.hd + 0.3)); group.add(r); }
  for (const sx of [-1, 1]) for (const y of [0.3, 0.65]) { const r = new THREE.Mesh(geo(new THREE.BoxGeometry(0.06, 0.07, A.hd * 2 + 0.6)), railMat); r.position.set(sx * (A.hw + 0.3), y, 0); group.add(r); }
  const pines = []; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + 0.25, r = A.hw + 3 + (i * 1.3) % 3; pines.push([Math.sin(a) * r, Math.cos(a) * r * 0.85, 0.9 + (i % 3) * 0.35]); }
  kit.pines(pines);
  kit.snowfall({ hw: A.hw + 3, hd: A.hd + 3, count: 150 });

  // ---- obstacles: clear ice blocks, snowmen
  const iceMat = std(ICE, { transparent: true, opacity: 0.6, roughness: 0.08, metalness: 0.1, emissive: '#2a6a9a', emissiveIntensity: 0.25 });
  const box = geo(new THREE.BoxGeometry(1, 1, 1));
  for (const b of A.blocks) { const m = new THREE.Mesh(box, iceMat); m.scale.set(b.hw * 2, 0.95, b.hd * 2); m.position.set(b.x, 0.475, b.z); m.castShadow = true; group.add(m); }
  for (const [i, p] of A.posts.entries()) { const s = kit.snowman(p.r / 0.48 * 0.95, i % 2 ? '#3d8bff' : WINTER.red); s.position.set(p.x, 0, p.z); s.rotation.y = Math.atan2(-p.x, 6 - p.z) * 0.6; group.add(s); }

  // ---- per player: icy tint for the Frost, an ice block + thaw ring when frozen, sparkles
  const sparkTex = tex(canvasTexture(32, 32, (c, w) => { c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(w / 2 - Math.cos(a) * 13, w / 2 - Math.sin(a) * 13); c.lineTo(w / 2 + Math.cos(a) * 13, w / 2 + Math.sin(a) * 13); c.stroke(); } }));
  const blockMat = std('#cfeeff', { transparent: true, opacity: 0.45, roughness: 0.05, metalness: 0.1, emissive: '#5fb0e0', emissiveIntensity: 0.3, depthWrite: false });
  const thawGeo = geo(new THREE.RingGeometry(0.7, 0.9, 32).rotateX(-Math.PI / 2));
  const GLOW = new THREE.Color(FROST_GLOW);
  const P = new Map();
  for (const p of ctx.players) {
    const block = new THREE.Mesh(box, blockMat); block.visible = false; block.renderOrder = 4; group.add(block);
    const ring = new THREE.Mesh(thawGeo, basic({ color: '#8ff07a', transparent: true, opacity: 0.8, depthWrite: false })); ring.visible = false; ring.position.y = 0.02; group.add(ring);
    const spPos = new Float32Array(8 * 3), spGeo = geo(new THREE.BufferGeometry()); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
    const spMat = new THREE.PointsMaterial({ map: sparkTex, color: '#e4f6ff', size: 0.26, transparent: true, opacity: 0, depthWrite: false }); // freed in dispose()
    const sparks = new THREE.Points(spGeo, spMat); sparks.frustumCulled = false; sparks.userData.mine = true;
    P.set(p.pid, { block, ring, sparks, spMat, spPos, ro: 0, k: 0, mats: null, flags: 0, th: 0, hgt: 1.6 });
  }
  function attach() {
    for (const [pid, s] of P) {
      if (s.mats) continue;
      const a = ctx.actor(pid); if (!a) continue;
      s.hgt = a.height || 1.6; s.mats = [];
      // keep a copy of each body material's emissive ONCE; later only the colour/intensity move (uniforms: no shader rebuilds)
      a.body.group.traverse(o => { if (!o.isMesh || o.userData.mine) return; for (const m of [].concat(o.material)) if (m.emissive && !s.mats.some(r => r.m === m)) s.mats.push({ m, emissive: m.emissive.clone(), ei: m.emissiveIntensity }); });
      a.group.add(s.sparks);
    }
  }
  function tint(s, k, t) {
    if (!s.mats) return;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    for (const r of s.mats) { r.m.emissive.copy(r.emissive).lerp(GLOW, k); r.m.emissiveIntensity = (r.ei ?? 1) * (1 - k) + k * (0.45 + 0.3 * pulse); }
  }

  // ---- solo: frost sprites and frozen snow pals
  const spriteMat = std('#bfe8ff', { flatShading: true, roughness: 0.2, metalness: 0.2, emissive: '#3a8fd0', emissiveIntensity: 0.5 });
  const coal = std('#1d2a3a'), crystal = geo(new THREE.IcosahedronGeometry(0.55, 0)), eye = geo(new THREE.SphereGeometry(0.07, 8, 6)), hat = geo(new THREE.ConeGeometry(0.28, 0.7, 6));
  const cpus = new Map();
  function sprite(id) {
    let c = cpus.get(id); if (c) return c;
    const g = new THREE.Group(); group.add(g);
    const body = new THREE.Mesh(crystal, spriteMat); body.position.y = 0.75; body.castShadow = true; g.add(body);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(eye, coal); e.position.set(sx * 0.17, 0.85, 0.46); g.add(e); }
    const smile = new THREE.Mesh(geo(new THREE.TorusGeometry(0.12, 0.025, 4, 10, Math.PI)), coal); smile.position.set(0, 0.68, 0.49); smile.rotation.z = Math.PI; g.add(smile);
    const cap = new THREE.Mesh(hat, spriteMat); cap.position.y = 1.5; cap.rotation.z = 0.2; g.add(cap);
    c = { g, x: 0, z: 0, tx: 0, tz: 0, yaw: 0, seen: false }; cpus.set(id, c); return c;
  }
  const pals = new Map();
  function pal(id, x, z, seed) {
    let p = pals.get(id); if (p) return p;
    const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g);
    const sm = kit.snowman(0.8, ['#3d8bff', WINTER.red, '#2f9e5a', '#ff7ab8'][seed % 4]); sm.rotation.y = (seed % 7) * 0.9; g.add(sm);
    const b = new THREE.Mesh(box, blockMat); b.scale.set(1.0, 1.55, 1.0); b.position.y = 0.78; b.renderOrder = 4; g.add(b);
    const ring = new THREE.Mesh(thawGeo, basic({ color: '#8ff07a', transparent: true, opacity: 0.85, depthWrite: false })); ring.position.y = 0.02; g.add(ring);
    p = { g, b, ring }; pals.set(id, p); return p;
  }

  // ---- frost breath rings
  const ringGeo = geo(new THREE.TorusGeometry(1, 0.08, 6, 40).rotateX(Math.PI / 2)), ripples = [];
  function ripple(x, z) { const m = new THREE.MeshBasicMaterial({ color: '#dff4ff', transparent: true, opacity: 0.85, depthWrite: false }); const r = new THREE.Mesh(ringGeo, m); r.position.set(x, 0.5, z); group.add(r); ripples.push({ r, m, t: 0 }); }

  // a portrait phone sees a 13 m slice that follows its own character; a TV / landscape / watcher sees the whole park
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
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'ft-pill'), banner = h('div', 'ft-banner'), lives = init.solo ? h('div', 'ft-lives') : null;
  ctx.ui.append(pill, banner); if (lives) ctx.ui.append(lives);
  let bannerT = 0, lastPill = '', g0 = null, ended = false, phase = 'between';
  function show(html, cls = '', ms = 1500) { banner.innerHTML = html; banner.className = 'ft-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = pid => (pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  function setPill(icon, text, cls = '') { const k = icon + text + cls; if (k === lastPill) return; lastPill = k; pill.className = 'ft-pill ' + cls; pill.innerHTML = `<i>${icon}</i><span>${text}</span>`; }
  let hudTop = -1;
  function placeHud() {
    const top = Math.round(bar.el.getBoundingClientRect().bottom - ctx.ui.getBoundingClientRect().top + 8), key = top * 1000 + pill.offsetHeight; if (key === hudTop || !(top > 0)) return; hudTop = key;
    pill.style.top = top + 'px'; if (lives) lives.style.top = (top + pill.offsetHeight + 6) + 'px';
  }
  tunes.start('jig');
  show(init.solo ? 'Run from the Frost!' : 'Frosty Freeze Tag!', 'go', 1600);
  return {
    winter: false,          // dresses itself with snow-kit.js (no shared Winter Fair dressing on top)
    state(g) {
      g0 = g; phase = g.ph;
      bar.set(g.sc, g.ph === 'play' ? g.rl : null);
      for (const [pid, s] of P) { s.ro = g.ro[pid] || 0; s.th = g.th?.[pid] || 0; bar.mark(pid, 'ft-frost', s.ro === 1 || s.ro === 2); bar.mark(pid, 'ft-frozen', s.ro === 3); }
      if (lives) lives.innerHTML = Array.from({ length: init.lives }, (_, i) => `<span class="${i < g.lv ? '' : 'gone'}">❄️</span>`).join('');
      if (g.cpu) {
        const seen = new Set();
        for (const [id, x, z] of g.cpu) { const c = sprite(id); if (!c.seen) { c.x = x; c.z = z; c.seen = true; } c.tx = x; c.tz = z; seen.add(id); }
        for (const [id, c] of cpus) if (!seen.has(id)) { c.g.removeFromParent(); cpus.delete(id); }
      }
      if (g.pal) {
        const seen = new Set();
        for (const [id, x, z, th, seed] of g.pal) { const p = pal(id, x, z, seed); seen.add(id); p.th = th; }
        for (const [id, p] of pals) if (!seen.has(id)) { p.g.removeFromParent(); p.ring.material.dispose(); pals.delete(id); }
      }
    },
    input(inp) {
      const a = ctx.actor(ctx.me), s = P.get(ctx.me); if (!a || !s || !(inp.b & IN.A)) return;
      if (s.ro === 1) a.play('cast', 500); else if (s.ro === 0 || s.ro === 4) a.play('jump', 280);
    },
    event(ev) {
      if (ev.e === 'round') {
        ended = false;
        if (init.solo) show('Run! ❄️ The Frost is coming!', 'go', 1500);
        else show(`<small>Round ${ev.round} of ${ev.rounds}</small>❄️ ${ev.frost === ctx.me ? 'YOU are the Frost!' : `${nameOf(ev.frost)} is the Frost!`}`, 'round', 2200);
        tunes.start('jig'); ctx.sfx('tap');
      } else if (ev.e === 'freeze') {
        kit.puff(ev.x, 1, ev.z, '#dff4ff', 10, 0.8); tunes.fx('chime', 0.8); ctx.sfx(ev.pid === ctx.me ? 'bad' : ev.by === ctx.me ? 'good' : 'tap');
        floatText(stage, ev.x, 2.3, ev.z, ev.pid === ctx.me ? 'Frozen!' : ev.by === ctx.me ? `Frozen! +${RULES.freezePts}` : `${nameOf(ev.pid)} frozen!`, ev.by === ctx.me ? 'good' : 'bad');
        if (ev.pid === ctx.me) { show('🧊 Frozen! Wait for a friend…', 'ice', 1400); juice.flash('rgba(170,220,255,.9)', 260); navigator.vibrate?.(80); }
        else if (ev.by === ctx.me) juice.flash('rgba(255,210,63,.7)', 160);
      } else if (ev.e === 'thaw') {
        kit.puff(ev.x, 1, ev.z, ICE, 8, 0.7); tunes.fx('pop', 1.2);
        if (ev.pal) { ctx.sfx('coins'); floatText(stage, ev.x, 2, ev.z, `Thawed! +${RULES.solo.palPts}`, 'good'); }
        else if (ev.by != null) { ctx.sfx(ev.by === ctx.me || ev.pid === ctx.me ? 'good' : 'tap'); floatText(stage, ev.x, 2.3, ev.z, ev.by === ctx.me ? `Thawed! +${RULES.thawPts}` : `${nameOf(ev.by)} to the rescue!`, ev.by === ctx.me ? 'good' : ''); }
        else floatText(stage, ev.x, 2.3, ev.z, 'Melted!', '');
        if (ev.pid === ctx.me) show('Free! Run!', 'go', 900);
      } else if (ev.e === 'deep') {
        show(`🧊 DEEP FREEZE! <small>${nameOf(ev.by)} +${RULES.allPts}</small>`, 'ice', 1600); tunes.fx('chime', 0.6); juice.shake(0.1, 0.3);
      } else if (ev.e === 'breath') {
        ripple(ev.x, ev.z); tunes.fx('whistle', 0.7); floatText(stage, ev.x, 2.4, ev.z, 'Brrr!', 'good');
        if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('cast', 500);
      } else if (ev.e === 'caught') {
        kit.puff(ev.x, 1, ev.z, '#dff4ff', 10, 0.8); tunes.fx('chime', 0.7); ctx.sfx('bad');
        juice.flash('rgba(170,220,255,.9)', 260); juice.shake(0.1, 0.25);
        show(ev.lives > 0 ? `Frozen! ${ev.lives} snowflake${ev.lives > 1 ? 's' : ''} left` : 'Frozen solid!', 'ice', 1300);
      } else if (ev.e === 'cpu') { tunes.fx('chime', 1.4); }
      else if (ev.e === 'pal') { tunes.fx('ding', 1.4); }
      else if (ev.e === 'dash') { tunes.fx('whistle', 1.3); if (ev.pid !== ctx.me) ctx.actor(ev.pid)?.play('jump', 280); }
      else if (ev.e === 'roundEnd') {
        if (init.solo || ev.round >= (init.rounds || 1)) ended = true;
        const names = ev.free.map(nameOf);
        if (init.solo) show(ev.why === 'caught' ? 'The Frost got you!' : 'You made it! ⛄', ev.why === 'caught' ? 'ice' : 'go', 2200);
        else if (names.length) show(`🏆 Still free: ${names.join(' & ')} <small>+${RULES.freePts}</small>`, 'go', 2200);
        else show('Everyone is frozen!', 'ice', 2000);
        ctx.sfx('win'); tunes.stop(false);
      }
    },
    pose(pid, flags) {
      const s = P.get(pid); if (s) s.flags = flags;
      if (!s) return undefined;
      if (s.ro === 3) return 'guard';
      if (s.ro === 2) return phase === 'play' ? 'guard' : 'ready';
      if (s.ro === 1) return undefined;
      if (flags & F.SLOW) return undefined;
      if (phase !== 'play') return 'ready';
      return undefined;
    },
    frame(dt, t) {
      juice.frame(dt, t); kit.frame(dt, t);
      attach(); frameCam(dt); placeHud();
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      for (const [pid, s] of P) {
        const frost = s.ro === 1 || s.ro === 2, frozen = s.ro === 3;
        s.k += ((frost ? 1 : frozen ? 0.6 : 0) - s.k) * Math.min(1, dt * 5);
        tint(s, s.k, t + pid);
        const a = ctx.actor(pid); if (!a) continue;
        const p = a.group.position, hgt = s.hgt || 1.6;
        s.block.visible = frozen; s.ring.visible = frozen;
        if (frozen) {
          s.block.position.set(p.x, hgt * 0.55, p.z); s.block.scale.set(1.0, hgt * 1.1, 1.0); s.block.rotation.y = 0.3;
          s.ring.position.set(p.x, 0.02, p.z); s.ring.scale.setScalar(0.4 + 0.6 * s.th); s.ring.material.opacity = 0.35 + 0.5 * s.th;
        }
        s.spMat.opacity = frost ? 0.95 : 0;
        if (frost) { for (let i = 0; i < 8; i++) { const ang = t * 1.8 + i * Math.PI / 4 + pid, r = 0.6 + 0.1 * Math.sin(t * 3 + i); s.spPos[i * 3] = Math.cos(ang) * r; s.spPos[i * 3 + 1] = hgt * (0.2 + ((i * 0.13 + t * 0.35) % 1) * 0.85); s.spPos[i * 3 + 2] = Math.sin(ang) * r; } s.sparks.geometry.attributes.position.needsUpdate = true; }
      }
      for (const c of cpus.values()) {
        const k = Math.min(1, dt * 12); c.x += (c.tx - c.x) * k; c.z += (c.tz - c.z) * k;
        const want = Math.atan2(c.tx - c.x, c.tz - c.z); if (Math.hypot(c.tx - c.x, c.tz - c.z) > 0.02) { let d = want - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * Math.min(1, dt * 6); }
        c.g.position.set(c.x, 0.15 + Math.sin(t * 3 + c.x) * 0.1, c.z); c.g.rotation.y = c.yaw; c.g.rotation.z = Math.sin(t * 2.3 + c.z) * 0.08;
      }
      for (const p of pals.values()) { p.ring.scale.setScalar(0.5 + 0.7 * (p.th || 0)); p.ring.material.opacity = 0.35 + 0.5 * (p.th || 0); p.b.material.opacity = 0.45; }
      for (let i = ripples.length - 1; i >= 0; i--) { const r = ripples[i]; r.t += dt; const k = r.t / 0.6; r.r.scale.setScalar(0.4 + k * RULES.breathR); r.m.opacity = 0.85 * (1 - k); if (k >= 1) { r.r.removeFromParent(); r.m.dispose(); ripples.splice(i, 1); } }
      const s = P.get(ctx.me), g = g0;
      if (!g) return;
      if (ended) setPill('⛄', 'Done! Brrr!');
      else if (ctx.me == null || !s) setPill('❄️', phase === 'play' ? 'The Frost is hunting!' : 'Get ready…');
      else if (phase !== 'play') setPill('⏳', 'Next round…');
      else if (init.solo) setPill(s.ro === 3 ? '🧊' : '🏃', s.ro === 3 ? 'Frozen! Hang on…' : 'RUN! Thaw the snow pals!', s.ro === 3 ? 'ice' : '');
      else if (s.ro === 2) setPill('🙈', 'Counting… then freeze them!', 'frost');
      else if (s.ro === 1) setPill('❄️', ctx.btn('THE FROST: tag them! A = frost breath'), 'frost');
      else if (s.ro === 3) setPill('🧊', 'Frozen! A friend can thaw you', 'ice');
      else if (s.flags & F.SLOW) setPill('🥶', 'Brrr! Keep going!', 'warn');
      else setPill('🏃', ctx.btn('RUNNER: run! Thaw friends. A = dash'), 'runner');
    },
    dispose() {
      juice.dispose(); tunes.dispose();
      bar.el.remove(); pill.remove(); banner.remove(); lives?.remove();
      for (const [pid, s] of P) {
        s.sparks.removeFromParent(); s.spMat.dispose(); s.ring.material.dispose();
        if (s.mats) for (const r of s.mats) { r.m.emissive.copy(r.emissive); r.m.emissiveIntensity = r.ei; }
      }
      for (const p of pals.values()) p.ring.material.dispose();
      for (const r of ripples) r.m.dispose();
      for (const x of texs) x.dispose();
      kit.dispose();
    },
  };
}
