// COFFIN CART RALLY, as drawn: a crypt seen from high up — a ribbon of grey-purple flagstones on dark mossy ground,
// edged by low stone walls with a stubby candle on every fourth block. Cracks in the floor are dark splits; when a hand
// is coming the crack glows purple and pulses, then a round, friendly, bone-white hand pops up and waves (it grabs any
// cart on the ground). Candle gates are stone arches with five candles; the first cart through blows them out (they
// relight a few seconds later). Every cart is a wooden coffin on four wheels with a band in the seat colour, a lantern
// on a pole at the back and a lid that flips up for a lid slam. CPU carts are grey-green. HUD: score bar (current
// lap), your place + lap, a big "HOP!" prompt when a hand is coming at you, 3-2-1-GO and finish banners.
import { RULES, handAt } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { glowTexture } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { createJuice } from '../../client/juice.js';

const ord = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const SEAT_Y = 0.36, CHAR_SCALE = 1.0, CART_SCALE = 1.15;

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx, T = init.track, A = ctx.arena, segs = A.segs, N = T.N, juice = createJuice(ctx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const glowTex = tex(glowTexture(THREE));

  // ---- ground, the flagstone ribbon (segs 0..N-1 one wall, N..2N-1 the other), start line
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#2b2438', { roughness: 1 })); ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);
  const stoneTex = tex(canvasTexture(128, 128, (c, w) => {
    c.fillStyle = '#6a6178'; c.fillRect(0, 0, w, w); c.strokeStyle = '#4a4258'; c.lineWidth = 4;
    for (let y = 0; y < 4; y++) { c.beginPath(); c.moveTo(0, y * 32); c.lineTo(w, y * 32); c.stroke(); for (let x = 0; x < 3; x++) { const xx = x * 48 + (y % 2) * 24; c.beginPath(); c.moveTo(xx, y * 32); c.lineTo(xx, y * 32 + 32); c.stroke(); } }
    c.fillStyle = 'rgba(120,200,110,.18)'; for (let i = 0; i < 18; i++) { c.beginPath(); c.arc((i * 37) % w, (i * 61) % w, 4 + (i % 3) * 2, 0, 7); c.fill(); }
  }));
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  const pos = [], uv = [], idx = [];
  for (let k = 0; k < N; k++) { const a = segs[k], b = segs[N + k]; pos.push(a.ax, 0, a.az, b.ax, 0, b.az); uv.push(0, k * 0.5, 1, k * 0.5); const i = k * 2, j = ((k + 1) % N) * 2; idx.push(i, j, i + 1, j, j + 1, i + 1); }
  const tg = geo(new THREE.BufferGeometry()); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); tg.setIndex(idx); tg.computeVertexNormals();
  const floor = new THREE.Mesh(tg, std('#ffffff', { map: stoneTex, roughness: 0.95, side: THREE.DoubleSide })); floor.position.y = 0.005; floor.receiveShadow = true; group.add(floor);
  const checker = tex(canvasTexture(256, 64, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#2a1840' : '#f4ecd8'; c.fillRect(i * 16, j * 16, 16, 16); } }));
  { const a = segs[0], b = segs[N], len = Math.hypot(a.ax - b.ax, a.az - b.az);
    const line = new THREE.Mesh(geo(new THREE.PlaneGeometry(len, 0.6).rotateX(-Math.PI / 2)), basic({ map: checker })); line.position.set((a.ax + b.ax) / 2, 0.015, (a.az + b.az) / 2); line.rotation.y = -Math.atan2(b.az - a.az, b.ax - a.ax); group.add(line); }
  // ---- stone walls (one block per wall segment) with a candle on every fourth
  const walls = new THREE.InstancedMesh(geo(new THREE.BoxGeometry(1, 0.34, 0.34)), std('#ffffff', { roughness: 0.9 }), segs.length), C1 = new THREE.Color('#857c96'), C2 = new THREE.Color('#6b6380');
  const candleSpots = [];
  segs.forEach((s, i) => {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az), x = (s.ax + s.bx) / 2, z = (s.az + s.bz) / 2;
    m4.compose(v.set(x, 0.17, z), q.setFromEuler(e3.set(0, -Math.atan2(s.bz - s.az, s.bx - s.ax), 0)), sc.set(len + 0.05, 1, 1)); walls.setMatrixAt(i, m4); walls.setColorAt(i, (i % N) % 2 ? C1 : C2);
    if ((i % N) % 4 === 1) candleSpots.push([x, 0.34, z]);
  });
  walls.castShadow = true; walls.receiveShadow = true; group.add(walls);
  // gate candles join the same instanced candles + flames (5 per arch, along its top)
  const gateCandle0 = candleSpots.length, gatePts = [];
  for (const g of T.gates) {
    const len = Math.hypot(g.bx - g.ax, g.bz - g.az), mx = (g.ax + g.bx) / 2, mz = (g.az + g.bz) / 2, r = len / 2;
    for (let i = 0; i < 5; i++) { const t = (i + 0.5) / 5, a = Math.PI * (1 - t), lx = Math.cos(a) * r, ly = Math.sin(a) * r * 0.55 + 0.9;
      candleSpots.push([mx + (g.bx - g.ax) / len * lx, ly + 0.05, mz + (g.bz - g.az) / len * lx]); }
    gatePts.push({ mx, mz, r, yaw: -Math.atan2(g.bz - g.az, g.bx - g.ax) });
  }
  const candles = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 8)), std('#f4ecd8', { roughness: 0.6 }), candleSpots.length);
  const flames = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(0.06, 0.2, 6)), basic({ color: '#ffc04a', toneMapped: false }), candleSpots.length);
  const halos = new THREE.InstancedMesh(geo(new THREE.PlaneGeometry(0.9, 0.9)), basic({ map: glowTex, color: '#ffa640', transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }), candleSpots.length);
  candleSpots.forEach(([x, y, z], i) => { m4.compose(v.set(x, y + 0.13, z), q.identity(), sc.setScalar(1)); candles.setMatrixAt(i, m4); });
  group.add(candles, flames, halos);
  const gateLit = T.gates.map(() => 1), gateK = T.gates.map(() => 1);
  // the arches
  const archMat = std('#8f86a3', { roughness: 0.85 });
  // from high up an arch is a thin line, so a lit gate also lays a warm glowing band across the floor
  const bands = gatePts.map(P => { const m = new THREE.Mesh(geo(new THREE.PlaneGeometry(P.r * 2, 0.9).rotateX(-Math.PI / 2)), basic({ color: '#ffb84a', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); m.position.set(P.mx, 0.03, P.mz); m.rotation.y = P.yaw; group.add(m); return m; });
  for (const P of gatePts) {
    const arch = new THREE.Mesh(geo(new THREE.TorusGeometry(P.r, 0.14, 6, 20, Math.PI)), archMat); arch.position.set(P.mx, 0.9, P.mz); arch.rotation.y = P.yaw; arch.scale.set(1, 0.55, 1); arch.castShadow = true; group.add(arch);
    for (const s of [-1, 1]) { const post = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.16, 0.2, 0.95, 8)), archMat); post.position.set(P.mx + Math.cos(-P.yaw) * P.r * s, 0.47, P.mz + Math.sin(-P.yaw) * P.r * s); post.castShadow = true; group.add(post); }
  }
  // ---- cracks + hands
  const crackGeo = geo(new THREE.CircleGeometry(RULES.handR, 18).rotateX(-Math.PI / 2)), crackMat = std('#1a1424', { roughness: 1 });
  const boneMat = std('#f4ecd8', { roughness: 0.55 });
  const palmGeo = geo(new THREE.SphereGeometry(0.22, 12, 8)), fingerGeo = geo(new THREE.CapsuleGeometry(0.055, 0.22, 3, 6)), wristGeo = geo(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 8));
  const hands = T.spots.map((s, i) => {
    const crack = new THREE.Mesh(crackGeo, crackMat); crack.position.set(s.x, 0.012, s.z); crack.scale.set(0.8, 1, 0.45); crack.rotation.y = i * 1.3; group.add(crack);
    const glow = new THREE.Mesh(geo(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2)), basic({ map: glowTex, color: '#b06cff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); glow.position.set(s.x, 0.03, s.z); group.add(glow);
    const hand = new THREE.Group(); hand.position.set(s.x, -1, s.z); hand.scale.setScalar(1.5); group.add(hand);
    const wrist = new THREE.Mesh(wristGeo, boneMat); wrist.position.y = 0.3; hand.add(wrist);
    const palm = new THREE.Mesh(palmGeo, boneMat); palm.position.y = 0.66; palm.scale.set(1, 0.85, 0.6); hand.add(palm);
    const fingers = [];
    for (let f = 0; f < 4; f++) { const fg = new THREE.Mesh(fingerGeo, boneMat); fg.position.set(-0.15 + f * 0.1, 0.94, 0); hand.add(fg); fingers.push(fg); }
    const thumb = new THREE.Mesh(fingerGeo, boneMat); thumb.position.set(0.24, 0.68, 0); thumb.rotation.z = -0.9; hand.add(thumb);
    hand.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return { s, glow, hand, fingers, y: -1, st: 0 };
  });
  // ---- carts: a coffin on wheels
  const coffin = new THREE.Shape(); [[-0.3, 0.8], [0.3, 0.8], [0.5, 0.35], [0.38, -0.8], [-0.38, -0.8], [-0.5, 0.35]].forEach(([x, y], i) => i ? coffin.lineTo(x, y) : coffin.moveTo(x, y));
  const tubGeo = geo(new THREE.ExtrudeGeometry(coffin, { depth: 0.28, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 1 }).rotateX(-Math.PI / 2));
  const bandGeo = geo(new THREE.ExtrudeGeometry(coffin, { depth: 0.07, bevelEnabled: false }).rotateX(-Math.PI / 2).scale(1.08, 1, 1.05));
  const lidGeo = geo(new THREE.ExtrudeGeometry(coffin, { depth: 0.05, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, 0, 0.8));   // hinged at the back edge
  const wheelGeo = geo(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 10).rotateZ(Math.PI / 2)), wheelMat = std('#2a2230'), woodMat = std('#7a4a2a', { roughness: 0.75 }), lidMat = std('#8f5a34', { roughness: 0.7 });
  const lampGeo = geo(new THREE.BoxGeometry(0.18, 0.22, 0.18)), lampMat = basic({ color: '#ffd36b', toneMapped: false }), poleMat = std('#3a3040');
  function makeCart(color) {
    const g = new THREE.Group();
    const tub = new THREE.Mesh(tubGeo, woodMat); tub.position.y = 0.2; g.add(tub);
    const band = new THREE.Mesh(bandGeo, std(color, { roughness: 0.5 })); band.position.y = 0.27; g.add(band);
    const hinge = new THREE.Group(); hinge.position.set(0, 0.52, -0.8); g.add(hinge);
    const lid = new THREE.Mesh(lidGeo, lidMat); lid.rotation.x = -1.25; hinge.add(lid);      // propped open behind the rider
    for (const [x, z] of [[-0.46, 0.5], [0.46, 0.5], [-0.42, -0.5], [0.42, -0.5]]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, 0.2, z); g.add(w); }
    const pole = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 5)), poleMat); pole.position.set(-0.36, 0.95, -0.6); g.add(pole);
    const lamp = new THREE.Mesh(lampGeo, lampMat); lamp.position.set(-0.36, 1.5, -0.6); g.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffc46a', transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); mats.push(halo.material);
    halo.position.copy(lamp.position); halo.scale.setScalar(0.9); g.add(halo);
    const flame = new THREE.Mesh(geo(new THREE.ConeGeometry(0.15, 0.6, 8).rotateX(-Math.PI / 2)), basic({ color: '#b06cff', transparent: true, opacity: 0.85, depthWrite: false })); flame.position.set(0, 0.3, -1.1); flame.visible = false; g.add(flame);
    g.traverse(o => { if (o.isMesh && o !== flame && o.material !== lampMat) o.castShadow = true; });
    g.scale.setScalar(CART_SCALE); g.userData = { hinge, flame, lidOpen: 0 };
    return g;
  }
  const carts = new Map();
  for (const p of ctx.players) { const a = ctx.actor(p.pid); if (!a) continue; const c = makeCart(p.color); a.group.add(c); carts.set(p.pid, { cart: c, actor: a }); }
  const cpuTags = [];
  for (const [i, c] of (T.cpu || []).entries()) {
    const k = makeCart(['#7fa88a', '#9aa3ad'][i % 2]), holder = new THREE.Group(); holder.add(k); group.add(holder);
    const K = { cart: k, holder, actor: null, cpu: true, cur: null, to: null }; carts.set(c.id, K);
    cpuTags.push(stage.tag(holder, { text: c.name + ' (CPU)', height: 1.9, cls: 'cc-cpu' }));
    ctx.createActor({ look: { race: i ? 'dwarf' : 'halfling', seed: 6161 + i * 91 } }, { scale: CHAR_SCALE }).then(a => { if (!a) return; K.actor = a; holder.add(a.group); a.place(0, 0, 0, 0); a.setPose('sitGround'); a.body.group.position.y = SEAT_Y; });
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'lap' });
  const hud = h('div', 'cc-hud'), banner = h('div', 'cc-banner'), sub = h('div', 'cc-sub'), prompt = h('div', 'cc-prompt');
  if (ctx.me != null) ctx.ui.append(hud, prompt);
  ctx.ui.append(banner, sub);
  hud.innerHTML = `<span class="cc-place"><b>-</b></span><span class="cc-lap">Lap <b>1</b>/${T.laps}</span><span class="cc-slam" data-ready="1">B Lid slam</span>`;
  const hPlace = hud.querySelector('.cc-place b'), hLap = hud.querySelector('.cc-lap b'), hSlam = hud.querySelector('.cc-slam');
  let bannerT = 0;
  function show(text, cls = '', ms = 1100) { banner.textContent = text; banner.className = 'cc-banner show ' + cls; bannerT = ms / 1000; }
  sub.textContent = T.name + ' · ' + T.laps + ' laps'; sub.classList.add('show');
  const nameOf = id => id < 0 ? ((T.cpu || []).find(c => c.id === id)?.name || 'CPU') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { const K = carts.get(id); if (!K) return null; if (K.cpu) return K.cur; const a = K.actor; return a ? { x: a.group.position.x, z: a.group.position.z } : null; };
  const flagsOf = new Map();
  let race = 0, raceAt = 0, going = false, lastBits = 0, lastInputAt = 0, promptNow = '';
  const nowS = () => performance.now() / 1000;

  return {
    state(g) {
      const laps = {}; for (const p of ctx.players) { const r = g.rs[p.pid]; if (!r) continue; laps[p.pid] = r[0]; bar.mark(p.pid, 'fin', r[2] >= 0); }
      bar.set(laps, g.left);
      const mine = ctx.me != null ? g.rs[ctx.me] : null;
      if (mine) {
        const pl = ord(mine[1]); if (hPlace.textContent !== pl) hPlace.textContent = pl;
        const lp = String(mine[0]); if (hLap.textContent !== lp) hLap.textContent = lp;
        const rd = mine[3] ? '0' : '1'; if (hSlam.dataset.ready !== rd) hSlam.dataset.ready = rd;
      }
      if (g.cd) sub.classList.add('show'); else sub.classList.remove('show');
      if (g.fw && !(mine && mine[2] >= 0)) { const s = `Finish in ${g.fw}`; if (bannerT <= 0) { banner.textContent = s; banner.className = 'cc-banner show small'; } }
      for (let i = 0; i < gateLit.length; i++) gateLit[i] = g.gl[i] === '1' ? 1 : 0;
      race = g.t; raceAt = nowS(); going = !g.cd && g.left > 0;
      for (const row of g.cpu || []) { const K = carts.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4], y: row[5] }; if (!K.cur) K.cur = { ...to }; K.to = to; }
    },
    event(ev) {
      const P = posOf(ev.id), mine = ev.id === ctx.me;
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GO!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'grab') { const H = hands[ev.s]; if (H) H.wave = 1; }
      else if (ev.e === 'spin') {
        ctx.sfx('trap');
        if (mine) { juice.flash('rgba(176,108,255,.75)', 240); navigator.vibrate?.(60); show(ev.why === 'hand' ? 'Grabbed!' : 'BOO\'d!', 'small', 800); }
        else if (ev.by === ctx.me) { juice.flash('rgba(255,210,63,.7)', 160); show('BOO!', 'go small', 800); }
        if (P) floatText(stage, P.x, 1.7, P.z, ev.why === 'hand' ? 'Grabbed!' : `BOO! ${nameOf(ev.by)}`, mine ? 'bad' : '');
      } else if (ev.e === 'slam') { const K = carts.get(ev.id); if (K) K.cart.userData.lidOpen = 1; ctx.sfx(ev.hit.length ? 'hit' : 'tap'); if (P && ev.hit.length) juice.shake(0.08, 0.2); }
      else if (ev.e === 'hop') { if (mine) ctx.sfx('tap'); }
      else if (ev.e === 'gate') { ctx.sfx('pick'); if (mine) { show('Candle boost!', 'go small', 900); juice.flash('rgba(255,192,74,.55)', 160); } else if (P) floatText(stage, P.x, 1.7, P.z, 'Whoosh!', ''); }
      else if (ev.e === 'lap') { if (mine) { show(ev.lap === T.laps ? 'Final lap!' : `Lap ${ev.lap}`, 'small', 1100); ctx.sfx('pick'); } }
      else if (ev.e === 'fin') {
        if (mine) { show(`${ord(ev.place)}!`, ev.place === 1 ? 'go' : '', 2400); ctx.sfx(ev.place === 1 ? 'win' : 'good'); juice.flash(ev.place === 1 ? 'rgba(255,210,63,.9)' : 'rgba(255,255,255,.7)', 500); }
        else if (P) floatText(stage, P.x, 2, P.z, `${nameOf(ev.id)} ${ord(ev.place)}`, 'good');
      }
    },
    input(inp) {
      const pa = (inp.b & 1) && !(lastBits & 1), pb = (inp.b & 2) && !(lastBits & 2); lastBits = inp.b; lastInputAt = performance.now();
      if (pa) ctx.sfx('tap');
      if (pb && ctx.me != null) { const K = carts.get(ctx.me); if (K && hSlam.dataset.ready === '1') K.cart.userData.lidOpen = 1; }
    },
    pose(pid, flags) { flagsOf.set(pid, flags); return 'sitGround'; },
    frame(dt, t) {
      juice.frame(dt, t);
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (performance.now() - lastInputAt > 90) lastBits = 0;
      const rt = going ? race + Math.min(0.25, nowS() - raceAt) : race;           // race time, carried on between updates
      // hands and their cracks
      for (const H of hands) {
        const st = handAt(H.s.ph, T.period, rt), want = st === 2 ? 0 : -1.6;
        H.y += (want - H.y) * Math.min(1, dt * (st === 2 ? 22 : 9)); H.hand.position.y = H.y; H.hand.visible = H.y > -1.5;
        const u = ((rt + H.s.ph) % T.period + T.period) % T.period;
        H.glow.material.opacity = st === 1 ? 0.35 + 0.55 * (u / T.warn) * (0.75 + 0.25 * Math.sin(t * 18)) : st === 2 ? 0.55 : 0;
        H.hand.rotation.z = Math.sin(t * 9 + H.s.k) * 0.25 + (H.wave || 0) * Math.sin(t * 30) * 0.4; if (H.wave) H.wave = Math.max(0, H.wave - dt * 1.2);
        for (const [i, fg] of H.fingers.entries()) fg.rotation.x = st === 2 ? Math.sin(t * 12 + i) * 0.35 : 0.6;
      }
      // candle flames (gate candles go out when their gate is out)
      for (let gi = 0; gi < gateK.length; gi++) gateK[gi] += (gateLit[gi] - gateK[gi]) * Math.min(1, dt * 6);
      for (let gi = 0; gi < bands.length; gi++) bands[gi].material.opacity = 0.08 + gateK[gi] * (0.5 + Math.sin(t * 8) * 0.1);
      for (let i = 0; i < candleSpots.length; i++) {
        const [x, y, z] = candleSpots[i], gi = i >= gateCandle0 ? Math.floor((i - gateCandle0) / 5) : -1, k = gi >= 0 ? gateK[gi] : 1, fl = (0.85 + Math.sin(t * 13 + i * 1.7) * 0.15) * Math.max(0.001, k);
        m4.compose(v.set(x, y + 0.33, z), q.identity(), sc.set(fl, fl, fl)); flames.setMatrixAt(i, m4);
        m4.compose(v.set(x, y + 0.33, z), stage.camera.quaternion, sc.setScalar(Math.max(0.001, k) * (gi >= 0 ? 1.3 : 1))); halos.setMatrixAt(i, m4);
      }
      flames.instanceMatrix.needsUpdate = true; halos.instanceMatrix.needsUpdate = true;
      // carts: player carts ride in their actor's group; CPU carts follow the server
      for (const [id, K] of carts) {
        let flags = 0;
        if (K.cpu) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y += (to.y - c.y) * Math.min(1, k * 1.5);
          let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          K.holder.position.set(c.x, c.y, c.z); K.cart.rotation.y = c.yaw; flags = to.flags;
          if (K.actor) { K.actor.body.group.rotation.y = c.yaw; K.actor.update(dt); }
        } else {
          const a = K.actor; flags = flagsOf.get(id) || 0;
          K.cart.rotation.y = a.body.group.rotation.y; a.body.group.position.y = SEAT_Y; a.body.group.scale.setScalar(CHAR_SCALE);
        }
        const root = K.cpu ? K.holder : K.actor.group;
        root.rotation.y = (flags & F.STUN) ? Math.sin(t * 30) * 0.5 : 0;
        const ud = K.cart.userData;
        ud.flame.visible = !!(flags & F.BOOST); if (ud.flame.visible) ud.flame.scale.set(1, 1, 0.8 + Math.sin(t * 40) * 0.25);
        ud.lidOpen = Math.max(0, ud.lidOpen - dt * 1.8); ud.hinge.rotation.x = -Math.min(1, ud.lidOpen * 3) * 0.9;
      }
      // the "do this now" prompt: a hand coming up near me, else a cart beside me to BOO
      if (ctx.me != null) {
        const me = ctx.pos(ctx.me); let say = '';
        if (me && going) {
          for (const H of hands) { const st = handAt(H.s.ph, T.period, rt); if (st && Math.hypot(H.s.x - me.x, H.s.z - me.z) < 3.4) { say = 'HOP! (A)'; break; } }
          if (!say && hSlam.dataset.ready === '1') for (const [id] of carts) { if (id === ctx.me) continue; const p = posOf(id); if (p && Math.hypot(p.x - me.x, p.z - me.z) < RULES.slamR + 0.3) { say = 'BOO them! (B)'; break; } }
        }
        if (say !== promptNow) { promptNow = say; prompt.textContent = say; prompt.classList.toggle('show', !!say); prompt.classList.toggle('boo', say.startsWith('BOO')); }
      }
    },
    dispose() {
      juice.dispose(); bar.el.remove(); hud.remove(); banner.remove(); sub.remove(); prompt.remove();
      for (const t2 of cpuTags) t2.remove();
      for (const K of carts.values()) if (!K.cpu) { K.cart.removeFromParent(); if (K.actor) { K.actor.body.group.position.y = 0; K.actor.body.group.scale.setScalar(1); K.actor.group.rotation.y = 0; } }
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
