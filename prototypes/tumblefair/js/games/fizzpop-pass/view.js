// FIZZPOP PASS, as drawn: a round picnic lawn ringed by a fat green hedge, with checked blankets on the grass, two
// picnic tables (things to dodge round) and a tall pink party cake in the middle. The pie is a golden lattice pie in a
// tin with a mound of cream and a cherry, held over the holder's head, with a fizzing fuse whose sparks grow and flicker
// faster (and the ticking speeds up) as it nears the end. A red ring pulses under whoever holds it. SPLAT: a burst of
// cream on the ground and on the holder's head. Players who are out sit on the "OUT" blanket at the back. Lives are
// hearts on the score chips. Solo: two CPU picnickers (Dot and Pip) pass it about with you.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx, R = A.r;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes();
  const checker = (a, b) => tex(canvasTexture(64, 64, (c, w) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * 8, j * 8, 8, 8); } }));

  // ---- lawn, hedge, blankets
  const outer = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#5fb34a', { roughness: 1 })); outer.position.y = -0.02; outer.receiveShadow = true; group.add(outer);
  const lawn = new THREE.Mesh(geo(new THREE.CircleGeometry(R + 0.3, 64).rotateX(-Math.PI / 2)), std('#8fdc6c', { roughness: 1 })); lawn.receiveShadow = true; group.add(lawn);
  const HEDGE = 46, hedge = new THREE.InstancedMesh(geo(new THREE.IcosahedronGeometry(0.75, 1)), std('#2f8f3a', { flatShading: true }), HEDGE);
  for (let i = 0; i < HEDGE; i++) { const a = i / HEDGE * Math.PI * 2; m4.compose(v.set(Math.sin(a) * (R + 0.6), 0.45, Math.cos(a) * (R + 0.6)), q.setFromEuler(e3.set(i, i * 2, 0)), sc.set(1, 0.85 + (i % 3) * 0.1, 1)); hedge.setMatrixAt(i, m4); }
  hedge.castShadow = true; group.add(hedge);
  const FLOWERS = 30, flowers = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.09, 6, 4)), std('#ffffff'), FLOWERS), fcol = new THREE.Color();
  for (let i = 0; i < FLOWERS; i++) { const a = i * 2.39996, r = 1.5 + ((i * 37) % 55) / 10; m4.compose(v.set(Math.sin(a) * r, 0.05, Math.cos(a) * r), q.identity(), sc.setScalar(1)); flowers.setMatrixAt(i, m4); flowers.setColorAt(i, fcol.set(['#ffd23f', '#ff7ab8', '#ffffff', '#b48cff'][i % 4])); }
  group.add(flowers);
  for (const [x, z, a, c1, c2] of [[-3.2, 2.9, 0.3, '#e8394a', '#ffffff'], [3.0, -3.0, -0.4, '#3d8bff', '#ffffff'], [4.6, 0.4, 1.2, '#ffd23f', '#ffffff']]) {
    const bl = new THREE.Mesh(geo(new THREE.PlaneGeometry(2, 1.6).rotateX(-Math.PI / 2)), basic({ map: checker(c1, c2), transparent: true, opacity: 0.75, depthWrite: false })); bl.position.set(x, 0.008, z); bl.rotation.y = a; group.add(bl);
  }
  // the OUT blanket at the back
  const B = init.bench || RULES.bench;
  const outTex = tex(canvasTexture(256, 96, (c, w, hh) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 6; j++) { c.fillStyle = (i + j) % 2 ? '#7a5cff' : '#ffffff'; c.fillRect(i * 16, j * 16, 16, 16); } c.fillStyle = 'rgba(13,34,40,.75)'; c.fillRect(70, 24, 116, 48); c.fillStyle = '#ffffff'; c.font = '900 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OUT', w / 2, hh / 2 + 2); }));
  const outBl = new THREE.Mesh(geo(new THREE.PlaneGeometry(4.8, 1.8).rotateX(-Math.PI / 2)), basic({ map: outTex, transparent: true, opacity: 0.9, depthWrite: false })); outBl.position.set(0.6, 0.01, B.z); group.add(outBl);
  // picnic tables (the arena's two blocks)
  const plank = std('#b9773a'), cloth = std('#ffffff', { map: checker('#e8394a', '#ffffff'), roughness: 0.9 });
  for (const b of A.blocks) {
    mesh(geo(new THREE.BoxGeometry(b.hw * 2, 0.1, b.hd * 2)), cloth, b.x, 0.78, b.z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(geo(new THREE.BoxGeometry(0.1, 0.78, 0.1)), plank, b.x + dx * (b.hw - 0.15), 0.39, b.z + dz * (b.hd - 0.12));
    for (const dz of [-1, 1]) mesh(geo(new THREE.BoxGeometry(b.hw * 2, 0.08, 0.3)), plank, b.x, 0.45, b.z + dz * (b.hd + 0.25));
    mesh(geo(new THREE.CylinderGeometry(0.12, 0.1, 0.22, 10)), std('#ffd23f'), b.x - 0.4, 0.94, b.z);
    mesh(geo(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 14)), std('#ffffff'), b.x + 0.35, 0.86, b.z);
  }
  // the party cake (the post in the middle)
  const P0 = A.posts[0];
  const icing = std('#ff9ec4', { roughness: 0.6 }), sponge = std('#fff4dc', { roughness: 0.7 });
  mesh(geo(new THREE.CylinderGeometry(0.66, 0.7, 0.5, 20)), icing, P0.x, 0.25, P0.z);
  mesh(geo(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 20)), sponge, P0.x, 0.7, P0.z);
  mesh(geo(new THREE.CylinderGeometry(0.34, 0.34, 0.35, 20)), icing, P0.x, 1.07, P0.z);
  const CAND = 6, cand = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 6)), std('#39d0e0'), CAND), flame = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.05, 6, 4)), basic({ color: '#ffb02e' }), CAND);
  for (let i = 0; i < CAND; i++) { const a = i / CAND * Math.PI * 2; m4.compose(v.set(P0.x + Math.sin(a) * 0.22, 1.37, P0.z + Math.cos(a) * 0.22), q.identity(), sc.setScalar(1)); cand.setMatrixAt(i, m4); m4.compose(v.set(P0.x + Math.sin(a) * 0.22, 1.54, P0.z + Math.cos(a) * 0.22), q.identity(), sc.set(1, 1.6, 1)); flame.setMatrixAt(i, m4); }
  group.add(cand, flame);

  // ---- the pie
  const pie = new THREE.Group(); group.add(pie);
  mesh(geo(new THREE.CylinderGeometry(0.36, 0.3, 0.13, 18)), std('#c9ced6', { metalness: 0.6, roughness: 0.35 }), 0, 0, 0, pie);
  mesh(geo(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 18)), std('#e9a748', { roughness: 0.7 }), 0, 0.08, 0, pie);
  const lattice = std('#c9822c');
  for (let i = -1; i <= 1; i++) { mesh(geo(new THREE.BoxGeometry(0.62, 0.03, 0.06)), lattice, 0, 0.12, i * 0.16, pie); mesh(geo(new THREE.BoxGeometry(0.06, 0.03, 0.62)), lattice, i * 0.16, 0.125, 0, pie); }
  const cream = mesh(geo(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), std('#fffaf0', { roughness: 0.5 }), 0, 0.12, 0, pie);
  mesh(geo(new THREE.SphereGeometry(0.07, 10, 8)), std('#d8203a', { roughness: 0.3 }), 0, 0.36, 0, pie);
  const wick = mesh(geo(new THREE.CylinderGeometry(0.02, 0.02, 0.32, 5)), std('#3a2a1a'), 0.16, 0.38, 0, pie); wick.rotation.z = -0.5;
  const sparkTex = tex(canvasTexture(64, 64, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff36a'); g.addColorStop(0.6, 'rgba(255,140,30,.7)'); g.addColorStop(1, 'rgba(255,90,30,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); c.strokeStyle = '#fff36a'; c.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; c.beginPath(); c.moveTo(w / 2, w / 2); c.lineTo(w / 2 + Math.cos(a) * w / 2, w / 2 + Math.sin(a) * w / 2); c.stroke(); } }));
  const sparkMat = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push(sparkMat);
  const spark = new THREE.Sprite(sparkMat); spark.position.set(0.25, 0.55, 0); pie.add(spark);
  pie.visible = false; pie.scale.setScalar(2.5);
  const holdRing = new THREE.Mesh(geo(new THREE.RingGeometry(0.7, 0.9, 32).rotateX(-Math.PI / 2)), basic({ color: '#ff4d5e', transparent: true, opacity: 0.8, depthWrite: false })); holdRing.position.y = 0.03; holdRing.visible = false; group.add(holdRing);
  // splats: cream blobs on the ground that fade, and a cream hat for the splatted player
  const blobGeo = geo(new THREE.SphereGeometry(0.3, 10, 6)), splats = [];
  function splat(x, z) {
    const g = new THREE.Group(); g.position.set(x, 0, z); group.add(g); const m = basic({ color: '#fffaf0', transparent: true, opacity: 1 });
    for (let i = 0; i < 9; i++) { const a = i * 0.7, r = i ? 0.4 + (i % 3) * 0.35 : 0, b = new THREE.Mesh(blobGeo, m); b.position.set(Math.sin(a) * r, 0.02, Math.cos(a) * r); b.scale.set(1 + (i % 2) * 0.6, 0.18, 1 + (i % 3) * 0.3); g.add(b); }
    splats.push({ g, m, t: 0 });
  }
  const hatGeo = geo(new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2)), hatMat = std('#fffaf0', { roughness: 0.5 });
  let hat = null;

  // ---- CPU picnickers (solo)
  const cpus = new Map();
  for (const [i, c] of (init.cpus || []).entries()) {
    const K = { id: c.id, name: c.name, actor: null, cur: null, to: null, holder: new THREE.Group() }; group.add(K.holder); cpus.set(c.id, K);
    K.tag = stage.tag(K.holder, { text: c.name + ' (CPU)', height: 2.0, cls: 'fzp-cpu' });
    ctx.createActor({ look: { race: i ? 'halfling' : 'elf', seed: 5150 + i * 91 } }).then(a => { if (!a) return; K.actor = a; K.holder.add(a.group); a.place(0, 0, 0, 0); });
  }
  const posOf = id => { if (id < 0) { const K = cpus.get(id); return K?.cur ? { x: K.cur.x, y: 0, z: K.cur.z, h: K.actor?.height || 1.6 } : null; } const p = ctx.pos(id); return p ? { ...p, h: ctx.actor(id)?.height || 1.6 } : null; };

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const hearts = new Map();
  for (const p of ctx.players) { const c = bar.el.querySelector(`[data-pid="${p.pid}"]`); const e = document.createElement('i'); e.className = 'sb-lives'; c?.querySelector('.nm')?.after(e); hearts.set(p.pid, e); }
  const pill = h('div', 'fzp-pill'), banner = h('div', 'fzp-banner');
  ctx.ui.append(pill, banner);
  let bannerT = 0;
  function show(text, cls = '', ms = 1200) { banner.textContent = text; banner.className = 'fzp-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = id => (id === ctx.me ? 'You' : id < 0 ? (cpus.get(id)?.name || 'CPU') : ctx.players.find(p => p.pid === id)?.name || '?');
  const maxLives = init.solo ? RULES.soloLives : RULES.lives(ctx.players.length);
  let lastBits = 0, lastInputAt = 0, g = null, holder = null, heat = 0, ph = 'ready', tickIn = 0, lastPill = '', fly = null, splatted = null, outSet = new Set();
  return {
    state(s) {
      g = s; ph = s.ph; heat = s.h;
      if (s.hold !== holder) { const from = holder != null ? posOf(holder) : null; holder = s.hold; if (from && holder != null) fly = { from, t: 0 }; }
      for (const [pid, n] of Object.entries(s.lv)) { const e = hearts.get(+pid); const txt = '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, maxLives - n)); if (e && e.textContent !== txt) e.textContent = txt; bar.mark(+pid, 'out', n <= 0); if (n <= 0) outSet.add(+pid); }
      bar.set(s.sc, s.left);
      for (const row of s.cpu || []) { const K = cpus.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4], v: row[5] }; if (!K.cur) K.cur = { ...to }; K.to = to; }
      let icon = '🥧', text = '';
      const mineOut = ctx.me != null && outSet.has(ctx.me);
      if (s.ph === 'ready') { icon = '⏳'; text = 'Get ready…'; }
      else if (s.ph === 'pop') { icon = '💥'; text = 'SPLAT!'; }
      else if (s.ph === 'done') { icon = '🏆'; text = 'Done!'; }
      else if (mineOut) { icon = '📣'; text = 'You’re out — cheer!'; }
      else if (holder === ctx.me) { icon = '🥧'; text = 'You’ve got the pie — bump someone!'; }
      else if (holder != null) { icon = '🏃'; text = `Run from ${nameOf(holder)}!`; }
      const key = icon + text + (holder === ctx.me);
      if (key !== lastPill) { lastPill = key; pill.dataset.hot = holder === ctx.me && s.ph === 'live' ? '1' : ''; pill.innerHTML = `<i>${icon}</i><span>${text}</span>`; }
    },
    event(ev) {
      if (ev.e === 'pass') {
        ctx.sfx(ev.from == null ? 'go' : 'throw');
        if (ev.from != null && ev.from >= 0 && ev.from !== ctx.me) ctx.actor(ev.from)?.play('throw', 380);
        if (ev.to === ctx.me) show(ev.from == null ? 'You start with it!' : 'Got it! Pass it on!', 'hot small', 1100);
        else if (ev.from === ctx.me) show('Passed!', 'go small', 700);
      } else if (ev.e === 'pop') {
        tunes.fx('pop'); ctx.sfx('splat'); splat(ev.x, ev.z); splatted = ev.id;
        const p = posOf(ev.id); floatText(stage, ev.x, (p?.h || 1.6) + 0.8, ev.z, 'SPLAT!', 'bad');
        show(ev.id === ctx.me ? 'SPLAT! You!' : `SPLAT! ${nameOf(ev.id)}`, ev.id === ctx.me ? 'hot' : '', 1800);
        if (ev.id >= 0 && ev.lives <= 0) setTimeout(() => ctx.sfx('out'), 500);
      } else if (ev.e === 'nopass') { if (ev.to === ctx.me) show(ev.back ? 'Not straight back!' : 'Get closer!', 'small', 900); ctx.sfx('tap'); }
      else if (ev.e === 'done') { if (ev.win != null) { ctx.sfx('win'); show(ev.win === ctx.me ? 'You win!' : `${nameOf(ev.win)} wins!`, 'go', 2600); } else show('Time!', 'small', 2000); }
    },
    input(inp) {
      // the instant you press A holding the pie: a toss animation at once (the server decides whether it passed)
      const pa = (inp.b & 1) && !(lastBits & 1); lastBits = inp.b; lastInputAt = performance.now();
      if (pa && holder === ctx.me) ctx.actor(ctx.me)?.play('throw', 380);
    },
    pose(pid, flags) {
      if (outSet.has(pid) && (flags & F.GHOST)) return 'sitGround';
      if (flags & F.STUN) return 'hit';
      if (ph === 'ready') return 'ready';
      if (ph === 'done') return outSet.has(pid) ? 'sitGround' : 'cheer';
      return undefined;
    },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (performance.now() - lastInputAt > 90) lastBits = 0;
      // CPUs slide between updates
      for (const K of cpus.values()) {
        if (!K.to || !K.cur) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
        c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
        K.holder.position.set(c.x, 0, c.z);
        if (K.actor) { K.actor.body.group.rotation.y = c.yaw; K.actor.setSpeed(to.flags & (F.FROZEN | F.STUN) ? 0 : to.v); K.actor.setPose(to.flags & F.STUN ? 'hit' : ph === 'ready' ? 'ready' : 'idle'); K.actor.update(dt); }
      }
      // the pie rides over the holder's head (and arcs across on a pass)
      const hp = holder != null ? posOf(holder) : null;
      pie.visible = !!hp && ph === 'live'; holdRing.visible = pie.visible;
      if (hp) {
        let x = hp.x, y = hp.h + 0.55, z = hp.z;
        if (fly) { fly.t += dt / 0.28; const k = Math.min(1, fly.t); x = fly.from.x + (x - fly.from.x) * k; z = fly.from.z + (z - fly.from.z) * k; y = (fly.from.h + 0.45) * (1 - k) + y * k + Math.sin(k * Math.PI) * 1.2; if (k >= 1) fly = null; }
        const shake = [0.02, 0.04, 0.07, 0.12][heat] || 0;
        pie.position.set(x + Math.sin(t * 47) * shake, y + Math.abs(Math.sin(t * 9)) * 0.05, z + Math.cos(t * 53) * shake);
        pie.rotation.y = t * 1.5;
        holdRing.position.x = hp.x; holdRing.position.z = hp.z; holdRing.scale.setScalar(1 + Math.sin(t * (6 + heat * 4)) * 0.12); holdRing.material.opacity = 0.55 + heat * 0.12;
        const sz = [0.32, 0.45, 0.62, 0.85][heat] || 0.3; spark.scale.setScalar(sz * (0.75 + Math.random() * 0.5)); sparkMat.rotation = t * 7;
        // the fizz: ticks get faster as it heats up (never an exact countdown)
        tickIn -= dt;
        if (tickIn <= 0 && ph === 'live') { tickIn = [0.7, 0.45, 0.26, 0.13][heat]; tunes.fx('tick', 0.8 + heat * 0.25); }
      }
      // cream hat for whoever just got splatted (until the next round starts)
      if (ph === 'pop' && splatted != null && !hat) {
        const a = splatted < 0 ? cpus.get(splatted)?.actor : ctx.actor(splatted);
        if (a) { hat = new THREE.Mesh(hatGeo, hatMat); hat.position.y = (a.height / (a.body.group.scale.x || 1)) - 0.12; hat.scale.set(1.3, 0.9, 1.3); a.body.group.add(hat); }
      } else if (ph !== 'pop' && hat) { hat.removeFromParent(); hat = null; splatted = null; }
      for (let i = splats.length - 1; i >= 0; i--) { const s = splats[i]; s.t += dt; s.g.scale.setScalar(Math.min(1, s.t * 6)); if (s.t > 4) s.m.opacity = Math.max(0, 1 - (s.t - 4) / 2); if (s.t > 6) { group.remove(s.g); s.m.dispose(); splats.splice(i, 1); } }
    },
    dispose() {
      tunes.dispose(); bar.el.remove(); pill.remove(); banner.remove(); hat?.removeFromParent();
      for (const K of cpus.values()) K.tag?.remove();
      for (const s of splats) s.m.dispose();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
