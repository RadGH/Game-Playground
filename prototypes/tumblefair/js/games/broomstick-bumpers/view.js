// BROOMSTICK BUMPERS, as drawn (under the shared Halloween dusk dressing): a mossy graveyard lawn inside a low stone
// wall padded with fat purple-and-orange rubber tubes (they squish when a broom bounces off). Friendly round-topped
// tombstones (or a little crypt) stand about as posts. Four graves sit round the middle: a mound with a stone lid
// that GLOWS green when it is about to open and slides aside to a dark hole puffing green mist while it is open.
// Every player sits on a floating broom in their seat colour wrapped in a padded bumper ring, bobbing; a bashed broom
// spins, a broom in a grave sinks out of sight. Practice riders are straw scarecrows on plain brooms.
// HUD: score bar, a pill with the scoring rule and "Boost ready", 3-2-1-GO, and "do this now" banners.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { pumpkinGeo, stemGeo, faceTexture } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { createJuice } from '../../client/juice.js';

const FLY_Y = 0.55;
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);

  // ---- lawn + outside ground
  const lawnTex = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = '#3f6b45'; c.fillRect(0, 0, w, w); let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 500; i++) { c.fillStyle = ['#4d7d50', '#365e3c', '#5a8a55', '#2f5536'][Math.floor(r() * 4)]; c.fillRect(r() * w, r() * w, 3, 6); } }));
  lawnTex.wrapS = lawnTex.wrapT = THREE.RepeatWrapping; lawnTex.repeat.set(3, 3);
  const outside = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#24332c', { roughness: 1 })); outside.position.y = -0.03; group.add(outside);
  const lawn = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: lawnTex, roughness: 0.95 })); lawn.position.y = 0.005; lawn.receiveShadow = true; group.add(lawn);
  // ---- stone wall with padded tubes
  const stone = std('#7d7396', { flatShading: true });
  for (const sz of [-1, 1]) mesh(geo(new THREE.BoxGeometry(A.hw * 2 + 1.6, 0.5, 0.4)), stone, 0, 0.25, sz * (A.hd + 0.55));
  for (const sx of [-1, 1]) mesh(geo(new THREE.BoxGeometry(0.4, 0.5, A.hd * 2 + 1.6)), stone, sx * (A.hw + 0.55), 0.25, 0);
  const segs = [], SEG = 1.0;
  for (const sz of [-1, 1]) for (let x = -A.hw + SEG / 2; x < A.hw; x += SEG) segs.push({ x, z: sz * (A.hd + 0.2), rot: 0 });
  for (const sx of [-1, 1]) for (let z = -A.hd + SEG / 2; z < A.hd; z += SEG) segs.push({ x: sx * (A.hw + 0.2), z, rot: Math.PI / 2 });
  const tubes = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.28, 0.28, SEG + 0.02, 12).rotateZ(Math.PI / 2)), std('#ffffff', { roughness: 0.45 }), segs.length);
  segs.forEach((s, i) => { tubes.setColorAt(i, col.set(i % 2 ? '#ff8a1a' : '#7a3cc8')); s.squish = 0; });
  tubes.castShadow = true; group.add(tubes);
  function placeTubes() { segs.forEach((s, i) => { const k = 1 - s.squish * 0.35; m4.compose(v.set(s.x, 0.28 * k, s.z), q.setFromEuler(e3.set(0, s.rot, 0)), sc.set(1, k, 1 + s.squish * 0.3)); tubes.setMatrixAt(i, m4); }); tubes.instanceMatrix.needsUpdate = true; }
  placeTubes();
  // ---- tombstones / crypt
  const slab = std('#a59cbd', { roughness: 0.9 }), moss = std('#6aa35a'), dark = std('#3a2c52');
  const postParts = [];
  for (const o of A.posts || []) {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); group.add(g);
    if (o.r > 1) {          // a little crypt: a box with a pointed roof and a door
      mesh(geo(new THREE.BoxGeometry(o.r * 1.5, 1.4, o.r * 1.5)), slab, 0, 0.7, 0, g);
      const roof = mesh(geo(new THREE.ConeGeometry(o.r * 1.2, 0.9, 4)), dark, 0, 1.85, 0, g); roof.rotation.y = Math.PI / 4;
      mesh(geo(new THREE.BoxGeometry(0.55, 0.8, 0.05)), dark, 0, 0.4, o.r * 0.76, g);
    } else {
      const w = o.r * 1.5, s = mesh(geo(new THREE.BoxGeometry(w, 1.0, 0.32)), slab, 0, 0.5, 0, g);
      mesh(geo(new THREE.CylinderGeometry(w / 2, w / 2, 0.32, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2)), slab, 0, 1.0, 0, g);
      mesh(geo(new THREE.BoxGeometry(w * 1.1, 0.12, 0.5)), moss, 0, 0.06, 0, g);
      void s;
    }
    postParts.push({ g, o, squish: 0 });
  }
  // ---- graves: mound + lid that glows and slides open, a dark hole, mist puffs
  const lidTex = tex(canvasTexture(64, 64, (c, w) => { c.fillStyle = '#8f86aa'; c.fillRect(0, 0, w, w); c.strokeStyle = '#5c5378'; c.lineWidth = 4; c.strokeRect(6, 6, w - 12, w - 12); c.beginPath(); c.moveTo(w / 2, 14); c.lineTo(w / 2, w - 14); c.moveTo(18, w / 2 - 6); c.lineTo(w - 18, w / 2 - 6); c.stroke(); }));
  const holeMat = basic({ color: '#120a1c' }), mistMat = basic({ color: '#7dff5a', transparent: true, opacity: 0.45, depthWrite: false });
  const graves = (init.graves || RULES.graves).map(gp => {
    const g = new THREE.Group(); g.position.set(gp.x, 0, gp.z); group.add(g);
    const mound = mesh(geo(new THREE.CylinderGeometry(init.graveR + 0.25, init.graveR + 0.4, 0.14, 20)), std('#4a3a2a', { roughness: 1 }), 0, 0.07, 0, g); mound.receiveShadow = true;
    const hole = new THREE.Mesh(geo(new THREE.CircleGeometry(init.graveR, 24).rotateX(-Math.PI / 2)), holeMat); hole.position.y = 0.15; hole.visible = false; g.add(hole);
    const lidM = std('#ffffff', { map: lidTex, emissive: '#3fbf2a', emissiveIntensity: 0 });
    const lid = mesh(geo(new THREE.BoxGeometry(init.graveR * 1.7, 0.12, init.graveR * 1.7)), lidM, 0, 0.2, 0, g);
    const glow = new THREE.Mesh(geo(new THREE.RingGeometry(init.graveR + 0.3, init.graveR + 0.55, 28).rotateX(-Math.PI / 2)), basic({ color: '#7dff5a', transparent: true, opacity: 0, depthWrite: false })); glow.position.y = 0.03; g.add(glow);
    const mist = new THREE.Mesh(geo(new THREE.SphereGeometry(init.graveR * 0.8, 12, 8)), mistMat); mist.visible = false; g.add(mist);
    return { g, hole, lid, lidM, glow, mist, st: 0, slide: 0 };
  });
  // ---- brooms
  const wood = std('#8a5a32'), straw = std('#e8c25a', { roughness: 0.9 }), band = std('#7a3cc8');
  const stickGeo = geo(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 6).rotateX(Math.PI / 2)), bristleGeo = geo(new THREE.ConeGeometry(0.3, 0.7, 10).rotateX(-Math.PI / 2)), ringGeo = geo(new THREE.TorusGeometry(0.78, 0.17, 8, 24).rotateX(Math.PI / 2));
  const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
  function makeBroom(color, mark) {
    const g = new THREE.Group();
    mesh(stickGeo, wood, 0, 0.1, 0.1, g);
    mesh(bristleGeo, straw, 0, 0.1, -1.1, g);
    mesh(geo(new THREE.TorusGeometry(0.12, 0.04, 6, 12)), band, 0, 0.1, -0.78, g).rotation.y = Math.PI / 2;
    const ringM = std(color, { roughness: 0.4 }); const ring = mesh(ringGeo, ringM, 0, 0.05, 0, g); ring.scale.set(1, 1, 1.25);
    const flagTex = tex(canvasTexture(64, 48, (c, w, hh) => { c.fillStyle = color; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(mark, w / 2, hh / 2 + 2); }));
    const flag = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.42, 0.3)), basic({ map: flagTex, side: THREE.DoubleSide })); flag.position.set(0.2, 0.5, -1.2); flag.rotation.y = Math.PI / 2; g.add(flag);
    const trail = new THREE.Mesh(geo(new THREE.ConeGeometry(0.22, 0.9, 8).rotateX(-Math.PI / 2)), basic({ color: '#b48cff', transparent: true, opacity: 0.75, depthWrite: false })); trail.position.set(0, 0.1, -1.8); trail.visible = false; g.add(trail);
    g.userData = { ringM, flag, trail, hit: 0 };
    return g;
  }
  const brooms = new Map();
  for (const p of ctx.players) { const a = ctx.actor(p.pid); if (!a) continue; const b = makeBroom(p.color, SHAPE_CH[p.shape] || '★'); a.group.add(b); brooms.set(p.pid, { broom: b, actor: a }); }
  const cpuTags = [];
  for (const [i, t] of (init.targets || []).entries()) {
    const b = makeBroom('#c9a25a', '✿'), holder = new THREE.Group(); holder.add(b); group.add(holder);
    const K = { broom: b, holder, target: true, cur: null, to: null };
    // a straw scarecrow rider: sack body, pumpkin head
    const body = mesh(geo(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 10)), std('#b98a4a'), 0, 0.55, 0, holder);
    const head = mesh(pumpkinGeo(THREE, 0.28), std('#ff7a14', { emissive: '#a83a00', emissiveIntensity: 0.3 }), 0, 1.12, 0, holder); void body;
    const face = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.4, 0.4)), basic({ map: tex(faceTexture(THREE)), transparent: true, depthWrite: false })); face.position.set(0, 1.12, 0.27); holder.add(face); void head;
    mesh(stemGeo(THREE, 0.28), std('#4a7a2a'), 0, 1.12, 0, holder);
    brooms.set(t.id, K);
    cpuTags.push(stage.tag(holder, { text: t.name, height: 1.9, cls: 'bb-cpu' })); void i;
  }
  // ---- pumpkins to grab
  const pkGeo = geo(pumpkinGeo(THREE, 0.38)), pkMat = std('#ff7a14', { emissive: '#a83a00', emissiveIntensity: 0.35, roughness: 0.5 }), pkStem = geo(stemGeo(THREE, 0.38)), stemM = std('#4a7a2a');
  const picks = new Map();
  // ---- bursts
  const burstGeo = geo(new THREE.OctahedronGeometry(0.16, 0)), bursts = [];
  function burst(x, z, color) { const m = basic({ color, transparent: true, opacity: 1 }); for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(burstGeo, m); b.position.set(x, 0.8, z); const a = i / 8 * Math.PI * 2; b.userData.v = [Math.sin(a) * 4, 3 + (i % 3), Math.cos(a) * 4]; group.add(b); bursts.push({ b, m, t: 0, first: i === 0 }); } }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'bb-pill', `<span><b>Back</b> 3</span><span><b>Side</b> 2</span><span><b>Nose</b> 1</span><span class="bb-grave"><b>Grave</b> +3</span><span class="bb-ready">⚡</span>`);
  const banner = h('div', 'bb-banner'), now = h('div', 'bb-now');
  ctx.ui.append(pill, banner, now);
  const medals = init.solo && init.medals ? h('div', 'bb-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  let bannerT = 0;
  function show(text, cls = '', ms = 1000) { banner.textContent = text; banner.className = 'bb-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = id => id < 0 ? ((init.targets || []).find(t => t.id === id)?.name || 'Scarecrow') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { const K = brooms.get(id); if (!K) return null; if (K.target) return K.cur; const a = K.actor; return a ? { x: a.group.position.x, z: a.group.position.z } : null; };
  const flagsOf = new Map();
  let started = false, lastScores = null, yardShown = false, gv = [0, 0, 0, 0], cd = 3, ready = true;
  const ZONE = { rear: 'BACK', side: 'SIDE', front: 'NOSE' };
  function nowText() {
    if (cd > 0) return 'Get ready to fly!';
    if (gv.includes(2)) return '🪦 A grave is OPEN — bash someone in!';
    if (gv.includes(1)) return '🟢 A grave is glowing — it opens soon!';
    return 'Ram the other brooms — from behind scores most!';
  }
  return {
    state(g) {
      bar.set(g.sc, g.left); lastScores = g.sc; gv = g.gv; cd = g.cd;
      if (!yardShown && g.cd) { yardShown = true; if (init.yardName) show(init.yardName, 'small', 1400); }
      g.gv.forEach((st, i) => { const G = graves[i]; if (!G) return; G.st = st; });
      const seen = new Set();
      for (const [id, x, z] of g.pk) {
        seen.add(id); if (picks.has(id)) continue;
        const pg = new THREE.Group(); pg.position.set(x, 0, z); group.add(pg);
        const icon = new THREE.Mesh(pkGeo, pkMat); icon.position.y = 0.5; icon.castShadow = true; pg.add(icon);
        const st = new THREE.Mesh(pkStem, stemM); st.position.y = 0.5; pg.add(st);
        pg.scale.setScalar(0.01); picks.set(id, { g: pg, icon, born: 0 });
      }
      for (const [id, P] of picks) if (!seen.has(id)) { group.remove(P.g); picks.delete(id); }
      for (const row of g.tg || []) { const K = brooms.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4], y: row[5] }; if (!K.cur) K.cur = { ...to }; K.to = to; }
      ready = ctx.me != null && !(g.bc && g.bc[ctx.me]);
      pill.classList.toggle('ready', ready && !g.cd && g.left > 0);
      now.textContent = g.left <= 0 ? '' : nowText();
      now.classList.toggle('hot', gv.includes(2));
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[ctx.players[0].pid] || 0) >= init.medals[i]));
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start('spooky'); }
      if (g.left <= 0 && tunes.playing) tunes.stop(false);
    },
    input(inp) { if ((inp.b & IN.A) && ready) { tunes.fx('whistle', 1.4); ready = false; } },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('FLY!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'bash') {
        ctx.sfx(ev.zone === 'rear' ? 'melee.crit' : 'hit'); tunes.fx('boing', ev.zone === 'rear' ? 0.8 : 1.1);
        burst(ev.x, ev.z, ev.zone === 'rear' ? '#ffd23f' : ev.zone === 'side' ? '#ff7ab8' : '#b48cff');
        floatText(stage, ev.x, 2.2, ev.z, `+${ev.pts} ${ZONE[ev.zone]}!`, ev.by === ctx.me ? 'good' : '');
        if (ev.by === ctx.me) { show(ev.zone === 'rear' ? 'BACK BASH!' : ev.zone === 'side' ? 'SIDE SWIPE!' : 'NOSE BONK!', 'go small', 800); juice.flash('rgba(255,210,63,.7)', 160); }
        if (ev.id === ctx.me) { show('Bonk!', 'small', 700); juice.flash('rgba(160,90,255,.8)', 220); navigator.vibrate?.(60); }
        juice.shake(ev.zone === 'rear' ? 0.16 : 0.09, 0.25);
        const V = brooms.get(ev.id); if (V) V.broom.userData.hit = 1;
      } else if (ev.e === 'clonk') ctx.sfx('dice');
      else if (ev.e === 'boing') {
        tunes.fx('boing', 0.9 + Math.random() * 0.3);
        let best = null, bd = 2.5; for (const s of segs) { const d = Math.hypot(s.x - ev.x, s.z - ev.z); if (d < bd) { bd = d; best = s; } } if (best) best.squish = 1;
      } else if (ev.e === 'glow') { tunes.fx('boo', 1.2); }
      else if (ev.e === 'open') { ctx.sfx('trap'); show('A grave opens!', 'warn small', 900); }
      else if (ev.e === 'drop') {
        const G = graves[ev.g]; const x = G ? G.g.position.x : 0, z = G ? G.g.position.z : 0;
        ctx.sfx('out'); burst(x, z, '#7dff5a');
        floatText(stage, x, 1.8, z, ev.by != null ? `GRAVE DROP +${ev.pts}` : ev.pts < 0 ? 'Oops! −1' : 'Plop!', ev.by === ctx.me ? 'good' : ev.id === ctx.me ? 'bad' : '');
        if (ev.by === ctx.me) { show('GRAVE DROP! +3', 'go small', 1100); juice.flash('rgba(125,255,90,.7)', 200); }
        if (ev.id === ctx.me) { show(ev.by != null ? `${nameOf(ev.by)} dropped you in!` : 'You fell in! −1', 'bad small', 1200); juice.shake(0.12, 0.3); navigator.vibrate?.(90); }
      } else if (ev.e === 'pick') { ctx.sfx('coins'); floatText(stage, ev.x, 1.6, ev.z, `+${RULES.pumpkin}`, ev.id === ctx.me ? 'good' : ''); }
      else if (ev.e === 'boost') { if (ev.id !== ctx.me) tunes.fx('whistle', 1.4); }
      else if (ev.e === 'end') {
        show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false);
        const sc2 = lastScores || {}, best = Math.max(0, ...Object.values(sc2));
        if (best > 0) for (const [pid, v2] of Object.entries(sc2)) if (v2 === best) { const p = posOf(+pid); if (p) floatText(stage, p.x, 2.6, p.z, `👑 ${nameOf(+pid)}!`, 'good'); }
      }
    },
    pose(pid, flags) { flagsOf.set(pid, flags); return 'sitGround'; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      for (const [id, K] of brooms) {
        let flags = 0, root;
        if (K.target) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y = to.y; let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          K.holder.position.set(c.x, FLY_Y + c.y + Math.sin(t * 3 + id) * 0.08, c.z); K.holder.rotation.y = c.yaw; flags = to.flags; root = K.holder;
          K.holder.visible = c.y > -1.3;
          if (flags & F.STUN) K.holder.rotation.y = t * 14;
        } else {
          const a = K.actor; flags = flagsOf.get(id) || 0;
          K.broom.rotation.y = a.body.group.rotation.y; a.body.group.position.y = FLY_Y + Math.sin(t * 3 + id) * 0.08; K.broom.position.y = a.body.group.position.y - 0.05;
          root = a.group; root.rotation.y = (flags & F.STUN) ? t * 14 : 0;
          a.body.group.visible = !(flags & F.GHOST) || (flags & F.FROZEN) || Math.floor(t * 10) % 2 === 0;
        }
        const ud = K.broom.userData; ud.trail.visible = !!(flags & F.BOOST); if (ud.trail.visible) ud.trail.scale.set(1, 1, 0.8 + Math.sin(t * 40) * 0.25);
        ud.flag.rotation.y = Math.PI / 2 + Math.sin(t * 9 + id) * 0.25;
        if (ud.hit > 0) { ud.hit = Math.max(0, ud.hit - dt * 4); ud.ringM.emissive.setRGB(ud.hit, ud.hit, ud.hit * 0.8); }
      }
      for (const G of graves) {
        const want = G.st === 2 ? 1 : 0; G.slide += (want - G.slide) * Math.min(1, dt * 6);
        G.lid.position.set(G.slide * 1.6, 0.2 + G.slide * 0.05, 0); G.lid.rotation.z = -G.slide * 0.25;
        G.hole.visible = G.slide > 0.05; G.mist.visible = G.st === 2;
        if (G.mist.visible) { const k = (t * 0.8) % 1; G.mist.position.y = 0.2 + k * 1.2; G.mist.scale.setScalar(0.6 + k * 0.8); }
        const pulse = G.st === 1 ? 0.5 + 0.5 * Math.abs(Math.sin(t * 8)) : G.st === 2 ? 0.35 : 0;
        G.glow.material.opacity = pulse * 0.85; G.lidM.emissiveIntensity = G.st === 1 ? pulse * 1.2 : 0;
      }
      mistMat.opacity = 0.3 + 0.15 * Math.sin(t * 4);
      for (const P of picks.values()) { P.born = Math.min(1, P.born + dt * 4); P.g.scale.setScalar(P.born); P.g.rotation.y = t * 1.5; P.g.position.y = Math.sin(t * 3 + P.g.position.x) * 0.1; }
      juice.frame(dt, t);
      let any = false; for (const s of segs) if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 3); any = true; } if (any) placeTubes();
      for (let i = bursts.length - 1; i >= 0; i--) { const B = bursts[i]; B.t += dt; const u = B.b.userData.v; u[1] -= 12 * dt; B.b.position.x += u[0] * dt; B.b.position.y = Math.max(0.1, B.b.position.y + u[1] * dt); B.b.position.z += u[2] * dt; B.b.rotation.x += dt * 8; if (B.first) B.m.opacity = Math.max(0, 1 - B.t * 1.6); if (B.t > 0.65) { group.remove(B.b); if (B.first) B.m.dispose(); bursts.splice(i, 1); } }
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove(); now.remove(); medals?.remove();
      for (const t2 of cpuTags) t2.remove();
      for (const [id, K] of brooms) if (!K.target) { K.broom.removeFromParent(); if (K.actor) { K.actor.body.group.position.y = 0; K.actor.group.rotation.y = 0; K.actor.body.group.visible = true; } void id; }
      for (const B of bursts) if (B.first) B.m.dispose();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
