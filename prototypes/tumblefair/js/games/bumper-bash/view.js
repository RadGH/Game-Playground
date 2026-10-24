// BUMPER BASH, as drawn: a shiny dark-blue rink floor painted with big pale circles, walled in by fat padded rubber
// tubes in red and yellow (they squish when a car bounces off), a red-and-white striped pole in the middle, and strings
// of coloured bulbs on posts above the corners. Each player sits in a round bumper car in their seat colour with a
// black rubber ring, a tall pole with a sparking tip and a flag with their seat shape; a hit car spins. Gold ★ stars
// and blue-and-yellow ⚡ bolts float and spin over glowing rings. Solo targets are orange-and-grey cars with a
// bullseye on the back. HUD: score bar, the scoring rule in a pill, 3-2-1-GO, and "+3 BACK!" style call-outs.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';
import { createJuice } from '../../client/juice.js';

const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
const SEAT_Y = 0.32, CAR_SCALE = 1.0;
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.22 }), juice = createJuice(ctx);

  // ---- floor, painted circles, outside ground
  const outside = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std('#6fbf5a', { roughness: 1 })); outside.position.y = -0.03; outside.receiveShadow = true; group.add(outside);
  const deck = new THREE.Mesh(geo(new THREE.BoxGeometry(A.hw * 2 + 2.4, 0.2, A.hd * 2 + 2.4)), std('#8a5a32', { roughness: 0.9 })); deck.position.y = -0.11; deck.receiveShadow = true; group.add(deck);
  const floorTex = tex(canvasTexture(256, 256, (c, w) => { c.fillStyle = init.floor || '#2f4c8f'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 32, 0); c.lineTo(i * 32, w); c.stroke(); c.beginPath(); c.moveTo(0, i * 32); c.lineTo(w, i * 32); c.stroke(); } }));
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(geo(new THREE.PlaneGeometry(A.hw * 2, A.hd * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: floorTex, roughness: 0.25, metalness: 0.15 })); floor.position.y = 0.005; floor.receiveShadow = true; group.add(floor);
  for (const [x, z, r, c] of [[0, 0, 3.2, '#9fd3ff'], [-5.2, 4, 1.4, '#ffd23f'], [5.2, -4, 1.4, '#ff7ab8'], [5.4, 4.2, 1, '#8ff07a'], [-5.4, -4.2, 1, '#b48cff']]) {
    const ring = new THREE.Mesh(geo(new THREE.RingGeometry(r - 0.18, r, 48).rotateX(-Math.PI / 2)), basic({ color: c, transparent: true, opacity: 0.45, depthWrite: false })); ring.position.set(x, 0.01, z); group.add(ring);
  }
  // ---- rubber walls: padded tubes, red and yellow, that squish when hit
  const segs = [], SEG = 1.0;
  for (const sz of [-1, 1]) for (let x = -A.hw + SEG / 2; x < A.hw; x += SEG) segs.push({ x, z: sz * (A.hd + 0.2), rot: 0 });
  for (const sx of [-1, 1]) for (let z = -A.hd + SEG / 2; z < A.hd; z += SEG) segs.push({ x: sx * (A.hw + 0.2), z, rot: Math.PI / 2 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) segs.push({ x: sx * (A.hw + 0.2), z: sz * (A.hd + 0.2), rot: 0, corner: true });
  const tubes = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.3, 0.3, SEG + 0.02, 12).rotateZ(Math.PI / 2)), std('#ffffff', { roughness: 0.45 }), segs.length);
  segs.forEach((s, i) => { tubes.setColorAt(i, col.set(i % 2 ? '#ffd23f' : '#e8394a')); s.squish = 0; });
  tubes.castShadow = true; group.add(tubes);
  function placeTubes() { segs.forEach((s, i) => { const k = 1 - s.squish * 0.35; m4.compose(v.set(s.x, 0.3 * k, s.z), q.setFromEuler(e3.set(0, s.rot, 0)), sc.set(s.corner ? 0.6 : 1, k, 1 + s.squish * 0.3)); tubes.setMatrixAt(i, m4); }); tubes.instanceMatrix.needsUpdate = true; }
  placeTubes();
  // ---- the posts in the middle (round 12: the rink comes from the seed — one pole, two, four bumpers, a bandstand…)
  const poleTex = tex(canvasTexture(64, 256, (c, w, hh) => { for (let i = 0; i < 16; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8394a'; c.save(); c.translate(0, i * 16); c.transform(1, 0.4, 0, 1, 0, 0); c.fillRect(-40, 0, w + 80, 16); c.restore(); } }));
  const poleMat = std('#ffffff', { map: poleTex }), padMat = std('#3d8bff', { roughness: 0.45 }), capMat = std('#ffd23f', { roughness: 0.4 });
  const postParts = [];        // [{ pad, o }] — a pad squishes when a car bounces off it
  for (const o of A.posts || []) {
    if (o.r > 1.2) {           // a bandstand: a padded drum with a little roof on poles
      const drum = mesh(geo(new THREE.CylinderGeometry(o.r - 0.05, o.r, 0.7, 28)), std('#e8394a', { roughness: 0.5 }), o.x, 0.35, o.z);
      mesh(geo(new THREE.TorusGeometry(o.r - 0.02, 0.16, 8, 32).rotateX(Math.PI / 2)), capMat, o.x, 0.7, o.z);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; mesh(geo(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6)), poleMat, o.x + Math.sin(a) * (o.r - 0.35), 1.8, o.z + Math.cos(a) * (o.r - 0.35)); }
      mesh(geo(new THREE.ConeGeometry(o.r + 0.2, 0.9, 8)), std('#ffffff', { map: poleTex }), o.x, 3.3, o.z);
      postParts.push({ pad: drum, o, y: 0.35 });
    } else {
      mesh(geo(new THREE.CylinderGeometry(o.r * 0.43, o.r * 0.43, 3.6, 16)), poleMat, o.x, 1.8, o.z);
      const pad = mesh(geo(new THREE.TorusGeometry(o.r - 0.12, 0.2, 10, 24).rotateX(Math.PI / 2)), padMat, o.x, 0.22, o.z);
      mesh(geo(new THREE.ConeGeometry(o.r * 0.8, 0.6, 16)), capMat, o.x, 3.9, o.z);
      postParts.push({ pad, o, y: 0.22 });
    }
  }
  // ---- light strings over the corners
  const BULBS = 64, bulbs = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.12, 8, 6)), basic({ color: '#ffffff' }), BULBS);
  const corners = [[-A.hw - 0.9, -A.hd - 0.9], [A.hw + 0.9, -A.hd - 0.9], [A.hw + 0.9, A.hd + 0.9], [-A.hw - 0.9, A.hd + 0.9]];
  for (const [x, z] of corners) mesh(geo(new THREE.CylinderGeometry(0.1, 0.12, 4.2, 8)), std('#ffd23f'), x, 2.1, z);
  let bi = 0;
  for (let s = 0; s < 4; s++) { const [x0, z0] = corners[s], [x1, z1] = corners[(s + 1) % 4]; for (let i = 0; i < 16 && bi < BULBS; i++) { const t = (i + 0.5) / 16; m4.compose(v.set(x0 + (x1 - x0) * t, 4.0 - Math.sin(t * Math.PI) * 0.7, z0 + (z1 - z0) * t), q.identity(), sc.setScalar(1)); bulbs.setMatrixAt(bi, m4); bulbs.setColorAt(bi, col.set(['#ff5f5f', '#ffd23f', '#8ff07a', '#39d0e0', '#ff7ab8'][bi % 5])); bi++; } }
  group.add(bulbs);

  // ---- cars
  const rubber = std('#1d1f24', { roughness: 0.8 }), chrome = std('#d9dde3', { metalness: 0.7, roughness: 0.3 });
  const tubGeo = geo(new THREE.CylinderGeometry(0.72, 0.78, 0.36, 22)), ringGeo = geo(new THREE.TorusGeometry(0.8, 0.13, 8, 26).rotateX(Math.PI / 2)), seatGeo = geo(new THREE.BoxGeometry(0.75, 0.55, 0.16));
  const flameGeo = geo(new THREE.ConeGeometry(0.16, 0.7, 8).rotateX(-Math.PI / 2)), flameMat = basic({ color: '#ffb02e', transparent: true, opacity: 0.85, depthWrite: false });
  const sparkTex = tex(canvasTexture(32, 32, (c, w) => { const g = c.createRadialGradient(w / 2, w / 2, 1, w / 2, w / 2, w / 2); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#9fe8ff'); g.addColorStop(1, 'rgba(80,180,255,0)'); c.fillStyle = g; c.fillRect(0, 0, w, w); }));
  function makeCar(color, dark, mark, target = false) {
    const g = new THREE.Group(), body = std(color, { roughness: 0.35, metalness: 0.1 }), trim = std(dark, { roughness: 0.5 });
    const tub = mesh(tubGeo, body, 0, 0.3, 0, g); tub.scale.set(1, 1, 1.22);
    const ring = mesh(ringGeo, rubber, 0, 0.2, 0, g); ring.scale.set(1, 1, 1.22);
    mesh(seatGeo, trim, 0, 0.62, -0.5, g);
    const wheel = mesh(geo(new THREE.TorusGeometry(0.16, 0.035, 6, 14)), chrome, 0, 0.72, 0.42, g); wheel.rotation.x = -0.9;
    const pole = mesh(geo(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 5)), chrome, 0, 1.3, -0.62, g); pole.castShadow = false;
    const sm = new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }); mats.push(sm);
    const spark = new THREE.Sprite(sm); spark.position.set(0, 2.2, -0.62); spark.scale.setScalar(0.4); g.add(spark);
    const flagTex = tex(canvasTexture(64, 48, (c, w, hh) => { c.fillStyle = target ? '#ff8a1f' : color; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(mark, w / 2, hh / 2 + 2); }));
    const flag = new THREE.Mesh(geo(new THREE.PlaneGeometry(0.5, 0.36)), basic({ map: flagTex, side: THREE.DoubleSide })); flag.position.set(0.25, 1.95, -0.62); flag.rotation.y = Math.PI / 2; g.add(flag);
    if (target) {
      const eye = tex(canvasTexture(64, 64, (c, w) => { for (const [r, f] of [[30, '#ffffff'], [22, '#e8394a'], [14, '#ffffff'], [7, '#e8394a']]) { c.fillStyle = f; c.beginPath(); c.arc(w / 2, w / 2, r, 0, Math.PI * 2); c.fill(); } }));
      const bull = new THREE.Mesh(geo(new THREE.CircleGeometry(0.34, 20)), basic({ map: eye })); bull.position.set(0, 0.36, -0.97); bull.rotation.y = Math.PI; g.add(bull);
    }
    const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.set(0, 0.3, -1.15); flame.visible = false; g.add(flame);
    g.scale.setScalar(CAR_SCALE); g.userData = { flame, flag, spark, body, hit: 0 };
    return g;
  }
  const cars = new Map();       // id -> { car, actor, target?, cur, to, holder }
  for (const p of ctx.players) { const a = ctx.actor(p.pid); if (!a) continue; const c = makeCar(p.color, p.dark, SHAPE_CH[p.shape] || '★'); a.group.add(c); cars.set(p.pid, { car: c, actor: a }); }
  const cpuTags = [];
  for (const [i, t] of (init.targets || []).entries()) {
    const c = makeCar('#9aa3ad', '#5a626b', '◎', true), holder = new THREE.Group(); holder.add(c); group.add(holder);
    const K = { car: c, holder, actor: null, target: true, cur: null, to: null }; cars.set(t.id, K);
    cpuTags.push(stage.tag(holder, { text: t.name, height: 2.1, cls: 'bmp-cpu' }));
    ctx.createActor({ look: { race: ['halfling', 'dwarf', 'elf'][i % 3], seed: 9100 + i * 53 } }).then(a => { if (!a) return; K.actor = a; holder.add(a.group); a.place(0, 0, 0, 0); a.setPose('sitGround'); a.body.group.position.y = SEAT_Y; });
  }
  // ---- pickups
  const starShape = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.2 : 0.48, a = i / 10 * Math.PI * 2; const x = Math.sin(a) * r, y = Math.cos(a) * r; i ? starShape.lineTo(x, y) : starShape.moveTo(x, y); }
  const boltShape = new THREE.Shape(); [[0.08, 0.5], [-0.28, -0.04], [-0.02, -0.04], [-0.12, -0.5], [0.3, 0.1], [0.04, 0.1]].forEach(([x, y], i) => i ? boltShape.lineTo(x, y) : boltShape.moveTo(x, y));
  const ext = { depth: 0.14, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 };
  const starGeo = geo(new THREE.ExtrudeGeometry(starShape, ext).center()), boltGeo = geo(new THREE.ExtrudeGeometry(boltShape, ext).center());
  const starMat = std('#ffd23f', { metalness: 0.5, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.4 }), boltMat = std('#39d0e0', { metalness: 0.3, roughness: 0.3, emissive: '#0a4a6a', emissiveIntensity: 0.5 });
  const glowGeo = geo(new THREE.RingGeometry(0.5, 0.75, 28).rotateX(-Math.PI / 2));
  const picks = new Map();
  // ---- bursts
  const burstGeo = geo(new THREE.OctahedronGeometry(0.16, 0)), bursts = [];
  function burst(x, z, color) { const m = basic({ color, transparent: true, opacity: 1 }); for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(burstGeo, m); b.position.set(x, 0.7, z); const a = i / 8 * Math.PI * 2; b.userData.v = [Math.sin(a) * 4, 3 + (i % 3), Math.cos(a) * 4]; group.add(b); bursts.push({ b, m, t: 0, first: i === 0 }); } }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'bmp-pill'), banner = h('div', 'bmp-banner');
  ctx.ui.append(pill, banner);
  pill.innerHTML = `<span><b>Back</b> 3</span><span><b>Side</b> 2</span><span><b>Nose</b> 1</span><span class="bmp-turbo">⚡ TURBO</span>`;
  let bannerT = 0;
  function show(text, cls = '', ms = 1000) { banner.textContent = text; banner.className = 'bmp-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = id => id < 0 ? ((init.targets || []).find(t => t.id === id)?.name || 'Target') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { const K = cars.get(id); if (!K) return null; if (K.target) return K.cur; const a = K.actor; return a ? { x: a.group.position.x, z: a.group.position.z } : null; };
  const flagsOf = new Map();
  let started = false, lastScores = null, rinkShown = false;
  const ZONE = { rear: 'BACK', side: 'SIDE', front: 'NOSE' };
  return {
    state(g) {
      bar.set(g.sc, g.left); lastScores = g.sc;
      if (!rinkShown && g.cd) { rinkShown = true; if (init.rinkName) show(init.rinkName, 'small rink', 1400); }
      const seen = new Set();
      for (const [id, x, z, kind] of g.pk) {
        seen.add(id); if (picks.has(id)) continue;
        const pg = new THREE.Group(); pg.position.set(x, 0, z); group.add(pg);
        const icon = new THREE.Mesh(kind ? boltGeo : starGeo, kind ? boltMat : starMat); icon.position.y = 0.8; icon.castShadow = true; pg.add(icon);
        const glow = new THREE.Mesh(glowGeo, basic({ color: kind ? '#39d0e0' : '#ffd23f', transparent: true, opacity: 0.6, depthWrite: false })); glow.position.y = 0.02; pg.add(glow);
        pg.scale.setScalar(0.01); picks.set(id, { g: pg, icon, glow, born: 0 });
      }
      for (const [id, P] of picks) if (!seen.has(id)) { group.remove(P.g); P.glow.material.dispose(); picks.delete(id); }
      for (const row of g.tg || []) { const K = cars.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4] }; if (!K.cur) K.cur = { ...to }; K.to = to; }
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start('boogie'); }
      if (g.left <= 0 && tunes.playing) tunes.stop(false);
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GO!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'bash') {
        ctx.sfx(ev.zone === 'rear' ? 'melee.crit' : 'hit'); tunes.fx('honk', ev.zone === 'rear' ? 0.8 : 1.1);
        burst(ev.x, ev.z, ev.zone === 'rear' ? '#ffd23f' : ev.zone === 'side' ? '#ff7ab8' : '#9fd3ff');
        floatText(stage, ev.x, 2.2, ev.z, `+${ev.pts} ${ZONE[ev.zone]}!`, ev.by === ctx.me ? 'good' : '');
        if (ev.by === ctx.me) { show(ev.zone === 'rear' ? 'BACK BASH!' : ev.zone === 'side' ? 'SIDE SWIPE!' : 'NOSE BONK!', 'go small', 800); juice.flash('rgba(255,210,63,.75)', 160); }
        if (ev.id === ctx.me) { show('Bonk!', 'small', 700); juice.flash('rgba(232,57,74,.8)', 220); navigator.vibrate?.(60); }
        juice.shake(ev.zone === 'rear' ? 0.16 : 0.09, 0.25);
        const V = cars.get(ev.id); if (V) V.car.userData.hit = 1;
      } else if (ev.e === 'clonk') { ctx.sfx('dice'); }
      else if (ev.e === 'boing') {
        tunes.fx('boing', 0.9 + Math.random() * 0.3);
        let best = null, bd = 2.5; for (const s of segs) { const d = Math.hypot(s.x - ev.x, s.z - ev.z); if (d < bd) { bd = d; best = s; } } if (best) best.squish = 1;
        for (const P of postParts) if (Math.hypot(P.o.x - ev.x, P.o.z - ev.z) < P.o.r + 1.4) P.squish = 1;
      } else if (ev.e === 'pick') {
        ctx.sfx(ev.kind === 'star' ? 'coins' : 'pick');
        floatText(stage, ev.x, 1.6, ev.z, ev.kind === 'star' ? `+${RULES.star}` : 'TURBO!', 'good');
        if (ev.id === ctx.me && ev.kind === 'zap') show('TURBO!', 'go small', 900);
      } else if (ev.e === 'end') {
        show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false);
        // the winner gets a crown call-out over their car
        const sc = lastScores || {}, best = Math.max(0, ...Object.values(sc));
        if (best > 0) for (const [pid, v] of Object.entries(sc)) if (v === best) { const p = posOf(+pid); if (p) floatText(stage, p.x, 2.6, p.z, `👑 ${nameOf(+pid)}!`, 'good'); }
      }
    },
    pose(pid, flags) { flagsOf.set(pid, flags); return 'sitGround'; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      pill.classList.toggle('turbo', !!(ctx.me != null && (flagsOf.get(ctx.me) & F.BOOST)));
      for (const [id, K] of cars) {
        let flags = 0;
        if (K.target) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          K.holder.position.set(c.x, 0, c.z); K.car.rotation.y = c.yaw; flags = to.flags;
          if (K.actor) { K.actor.body.group.rotation.y = c.yaw; K.actor.update(dt); }
        } else {
          const a = K.actor; flags = flagsOf.get(id) || 0;
          K.car.rotation.y = a.body.group.rotation.y; a.body.group.position.y = SEAT_Y;
        }
        const spin = flags & F.STUN, root = K.target ? K.holder : K.actor.group;
        root.rotation.y = spin ? t * 14 : 0;
        const ud = K.car.userData; ud.flame.visible = !!(flags & F.BOOST); if (ud.flame.visible) ud.flame.scale.set(1, 1, 0.8 + Math.sin(t * 40) * 0.25);
        ud.flag.rotation.y = Math.PI / 2 + Math.sin(t * 9 + id) * 0.25;
        ud.spark.scale.setScalar(0.3 + Math.random() * 0.25);
      }
      for (const P of picks.values()) { P.born = Math.min(1, P.born + dt * 4); P.g.scale.setScalar(P.born); P.icon.rotation.y = t * 2.5; P.icon.position.y = 0.8 + Math.sin(t * 3 + P.g.position.x) * 0.12; P.glow.material.opacity = 0.35 + Math.sin(t * 5) * 0.2; }
      juice.frame(dt, t);
      for (const P of postParts) if (P.squish > 0) { P.squish = Math.max(0, P.squish - dt * 3); const k = 1 - P.squish * 0.3; P.pad.scale.set(1 + P.squish * 0.25, k, 1 + P.squish * 0.25); }
      for (const K of cars.values()) { const ud = K.car.userData; if (ud.hit > 0) { ud.hit = Math.max(0, ud.hit - dt * 4); ud.body.emissive.setRGB(ud.hit, ud.hit, ud.hit * 0.8); } }
      let any = false; for (const s of segs) if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 3); any = true; } if (any) placeTubes();
      for (let i = bursts.length - 1; i >= 0; i--) { const B = bursts[i]; B.t += dt; const u = B.b.userData.v; u[1] -= 12 * dt; B.b.position.x += u[0] * dt; B.b.position.y = Math.max(0.1, B.b.position.y + u[1] * dt); B.b.position.z += u[2] * dt; B.b.rotation.x += dt * 8; if (B.first) B.m.opacity = Math.max(0, 1 - B.t * 1.6); if (B.t > 0.65) { group.remove(B.b); if (B.first) B.m.dispose(); bursts.splice(i, 1); } }
    },
    dispose() {
      tunes.dispose(); juice.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const t2 of cpuTags) t2.remove();
      for (const K of cars.values()) if (!K.target) { K.car.removeFromParent(); if (K.actor) { K.actor.body.group.position.y = 0; K.actor.group.rotation.y = 0; } }
      for (const P of picks.values()) P.glow.material.dispose();
      for (const B of bursts) if (B.first) B.m.dispose();
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
