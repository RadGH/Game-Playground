// WOBBLEWHEEL RALLY, as drawn: a fairground go-kart track seen from high up — warm grey tarmac with a dashed white
// middle line and a chequered start line, red-and-white kerbs along both edges (the walls), on bright grass with
// round trees and striped tents round the outside. Each player sits in a little kart painted their seat colour, with
// their seat shape on a flag at the back; CPU karts are orange-and-grey. Arrow pads are yellow chevrons, mud is a
// brown splodge, ? boxes are spinning gold cubes, a Slick is a purple puddle, a Bonk Ball is a striped ball.
// HUD: score bar (current lap), your place + lap + item at the top, a big 3-2-1-GO and finish banners.
import { RULES, ITEMS } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { SEATS } from '../../shared/protocol.js';
import { createJuice } from '../../client/juice.js';

const ITEM_NAME = { zoom: 'Zoom Jar', slick: 'Slick', bonk: 'Bonk Ball' }, ITEM_ICON = { zoom: '⚡', slick: '💧', bonk: '●' };
const SHAPE_CH = { circle: '●', square: '■', triangle: '▲', diamond: '◆' };
const ord = n => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const SEAT_Y = 0.29, CHAR_SCALE = 1.05, KART_SCALE = 1.2;      // drawn a little bigger than the 0.45 m body so it reads on a phone

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx, T = init.track, A = ctx.arena, segs = A.segs, N = T.N, juice = createJuice(ctx);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  // ---- grass, tarmac ribbon (from the two walls: segs 0..N-1 are one side, N..2N-1 the other), centre dashes, start line
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std('#6fcf5b', { roughness: 1 })); grass.position.y = -0.02; grass.receiveShadow = true; group.add(grass);
  const pos = [], idx = [];
  for (let k = 0; k < N; k++) { const a = segs[k], b = segs[N + k]; pos.push(a.ax, 0, a.az, b.ax, 0, b.az); const i = k * 2, j = ((k + 1) % N) * 2; idx.push(i, j, i + 1, j, j + 1, i + 1); }
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); tg.setIndex(idx); tg.computeVertexNormals();
  const tarmac = new THREE.Mesh(tg, std('#7c7480', { roughness: 0.95, side: THREE.DoubleSide })); tarmac.position.y = 0.005; tarmac.receiveShadow = true; group.add(tarmac);
  const mid = k => { const a = segs[k], b = segs[N + k]; return [(a.ax + b.ax) / 2, (a.az + b.az) / 2]; };
  const dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0.7 }), N);
  let di = 0;
  for (let k = 2; k < N - 1; k += 2) { const [x, z] = mid(k), [x2, z2] = mid(k + 1); m4.compose(v.set(x, 0.012, z), q.setFromEuler(e3.set(0, Math.atan2(x2 - x, z2 - z), 0)), sc.setScalar(1)); dashes.setMatrixAt(di++, m4); }
  dashes.count = di; group.add(dashes);
  const checker = canvasTexture(256, 64, (c, w, hh) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * 16, j * 16, 16, 16); } });
  { const a = segs[0], b = segs[N]; const len = Math.hypot(a.ax - b.ax, a.az - b.az);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: checker })); line.position.set((a.ax + b.ax) / 2, 0.015, (a.az + b.az) / 2); line.rotation.y = -Math.atan2(b.az - a.az, b.ax - a.ax); group.add(line);
    for (const p of [a, b]) { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), std('#ffffff')); pole.position.set(p.ax, 1.1, p.az); group.add(pole); }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 0.06), new THREE.MeshBasicMaterial({ map: checker })); banner.position.set((a.ax + b.ax) / 2, 2.1, (a.az + b.az) / 2); banner.rotation.y = -Math.atan2(b.az - a.az, b.ax - a.ax); group.add(banner); }
  // ---- kerbs: one red/white block per wall segment
  const kerbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.22, 0.28), std('#ffffff', { roughness: 0.6 }), segs.length), RED = new THREE.Color('#e8394a'), WHITE = new THREE.Color('#ffffff');
  segs.forEach((s, i) => { const len = Math.hypot(s.bx - s.ax, s.bz - s.az); m4.compose(v.set((s.ax + s.bx) / 2, 0.11, (s.az + s.bz) / 2), q.setFromEuler(e3.set(0, -Math.atan2(s.bz - s.az, s.bx - s.ax), 0)), sc.set(len + 0.05, 1, 1)); kerbs.setMatrixAt(i, m4); kerbs.setColorAt(i, (i % N) % 2 ? RED : WHITE); });
  kerbs.castShadow = true; kerbs.receiveShadow = true; group.add(kerbs);
  // ---- pads, mud
  const chevron = canvasTexture(64, 128, (c, w, hh) => { c.fillStyle = '#ffb21f'; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff36a'; for (let i = 0; i < 3; i++) { const y = 100 - i * 40; c.beginPath(); c.moveTo(6, y); c.lineTo(32, y - 26); c.lineTo(58, y); c.lineTo(58, y + 14); c.lineTo(32, y - 12); c.lineTo(6, y + 14); c.fill(); } });
  for (const p of T.pads) { const m = new THREE.Mesh(new THREE.PlaneGeometry(p.hw * 2, p.hl * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: chevron })); m.position.set(p.x, 0.02, p.z); m.rotation.y = p.yaw + Math.PI; group.add(m); }
  const mudMat = std('#6b4423', { roughness: 1 }), mudGeo = new THREE.CircleGeometry(1, 18).rotateX(-Math.PI / 2), blobGeo = new THREE.SphereGeometry(0.22, 8, 5);
  for (const p of T.muds) {
    const m = new THREE.Mesh(mudGeo, mudMat); m.position.set(p.x, 0.018, p.z); m.rotation.y = p.yaw; m.scale.set(p.hw * 1.15, 1, p.hl * 1.15); group.add(m);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(blobGeo, std('#4f3018', { roughness: 1 })); const a = i * 1.7 + p.yaw; b.position.set(p.x + Math.sin(a) * 0.5, 0.02, p.z + Math.cos(a) * 0.7); b.scale.set(1, 0.25, 1.3); group.add(b); }
  }
  // ---- ? boxes
  const qTex = canvasTexture(64, 64, (c, w) => { c.fillStyle = '#ffcf2e'; c.fillRect(0, 0, w, w); c.strokeStyle = '#a86a00'; c.lineWidth = 6; c.strokeRect(3, 3, w - 6, w - 6); c.fillStyle = '#7a3d00'; c.font = '900 46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', w / 2, w / 2 + 3); });
  const boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), new THREE.MeshStandardMaterial({ map: qTex, roughness: 0.4, emissive: '#5a3a00', emissiveIntensity: 0.35 }), T.boxes.length);
  boxMesh.castShadow = true; group.add(boxMesh);
  const boxOn = T.boxes.map(() => 1), boxScale = T.boxes.map(() => 1);
  // ---- slicks + bonk balls (pooled)
  const slickMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(RULES.slickR, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#4b2a6e', roughness: 0.1, metalness: 0.3 }), 8);
  const ballTex = canvasTexture(64, 32, (c, w, hh) => { c.fillStyle = '#ff3d6e'; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.fillRect(0, 12, w, 8); });
  const ballMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 14, 10), new THREE.MeshStandardMaterial({ map: ballTex, roughness: 0.35 }), 8);
  slickMesh.count = 0; ballMesh.count = 0; ballMesh.castShadow = true; group.add(slickMesh, ballMesh);
  let slicks = [], balls = new Map();
  // ---- scenery: trees and tents outside the track box
  const treeTop = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), std('#2f9e44', { flatShading: true }), 40), trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.15, 0.2, 1, 6), std('#7a4a2a'), 40);
  let ti = 0;
  for (let i = 0; i < 40; i++) {
    const a = i * 2.39996, r = 1.25 + (i % 5) * 0.12, x = Math.sin(a) * (A.hw + 2.5) * r, z = Math.cos(a) * (A.hd + 2.5) * r;
    m4.compose(v.set(x, 1.6, z), q.setFromEuler(e3.set(i, i, 0)), sc.setScalar(0.9 + (i % 3) * 0.3)); treeTop.setMatrixAt(ti, m4);
    m4.compose(v.set(x, 0.5, z), q.identity(), sc.setScalar(1)); trunk.setMatrixAt(ti++, m4);
  }
  treeTop.castShadow = true; group.add(treeTop, trunk);
  for (const [x, z, c] of [[-A.hw - 2.6, -A.hd + 1, '#ff5f5f'], [A.hw + 2.6, A.hd - 1, '#3d8bff'], [A.hw + 2.4, -A.hd + 2, '#ffd23f']]) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 8), std(c, { flatShading: true })); tent.position.set(x, 1.1, z); tent.castShadow = true; group.add(tent);
  }
  // ---- karts
  const wheelGeo = new THREE.CylinderGeometry(0.21, 0.21, 0.18, 10).rotateZ(Math.PI / 2), wheelMat = std('#22252b'), trimMat = std('#ffffff', { roughness: 0.5 });
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.85, depthWrite: false }), flameGeo = new THREE.ConeGeometry(0.16, 0.7, 8).rotateX(-Math.PI / 2);
  const mats = [];
  function makeKart(color, dark, shape) {
    const g = new THREE.Group(), bodyMat = std(color, { roughness: 0.45 }), darkMat = std(dark, { roughness: 0.6 }); mats.push(bodyMat, darkMat);
    const tub = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.26, 1.45), bodyMat); tub.position.y = 0.26; g.add(tub);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.18, 0.4), bodyMat); nose.position.set(0, 0.24, 0.86); nose.rotation.x = 0.25; g.add(nose);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.12, 0.12), trimMat); bumper.position.set(0, 0.18, 1.02); g.add(bumper);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.12), darkMat); back.position.set(0, 0.5, -0.52); g.add(back);
    for (const [x, z] of [[-0.5, 0.48], [0.5, 0.48], [-0.5, -0.5], [0.5, -0.5]]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, 0.21, z); g.add(w); }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 5), trimMat); pole.position.set(0.32, 0.95, -0.62); g.add(pole);
    const flagTex = canvasTexture(64, 48, (c, w, hh) => { c.fillStyle = color; c.fillRect(0, 0, w, hh); c.fillStyle = '#fff'; c.font = '900 34px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(SHAPE_CH[shape] || '★', w / 2, hh / 2 + 2); });
    const flagMat = new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }); mats.push(flagMat);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.36), flagMat); flag.position.set(0.32 + 0.25, 1.38, -0.62); flag.rotation.y = Math.PI / 2; g.add(flag);
    const flame = new THREE.Mesh(flameGeo, flameMat); flame.position.set(0, 0.28, -0.95); flame.visible = false; g.add(flame);
    g.traverse(o => { if (o.isMesh && o !== flame) o.castShadow = true; });
    g.scale.setScalar(KART_SCALE); g.userData = { flame, flag };
    return g;
  }
  const karts = new Map();       // id -> { kart, actor, cpu?, cur: {x,z,yaw,y}, to }
  for (const p of ctx.players) { const a = ctx.actor(p.pid); if (!a) continue; const k = makeKart(p.color, p.dark, p.shape); a.group.add(k); karts.set(p.pid, { kart: k, actor: a }); }
  const cpuTags = [];
  for (const [i, c] of (T.cpu || []).entries()) {
    const k = makeKart(['#ff8a1f', '#9aa3ad'][i % 2], ['#a64f00', '#5a626b'][i % 2], 'star'), holder = new THREE.Group(); holder.add(k); group.add(holder);
    const K = { kart: k, holder, actor: null, cpu: true, cur: null, to: null }; karts.set(c.id, K);
    cpuTags.push(stage.tag(holder, { text: c.name + ' (CPU)', height: 1.8, cls: 'wr-cpu' }));
    ctx.createActor({ look: { race: i ? 'dwarf' : 'halfling', seed: 4242 + i * 77 } }, { scale: CHAR_SCALE }).then(a => { if (!a) return; K.actor = a; holder.add(a.group); a.place(0, 0, 0, 0); a.setPose('sitGround'); a.body.group.position.y = SEAT_Y; });
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'lap' });
  const hud = h('div', 'wr-hud'), banner = h('div', 'wr-banner'), sub = h('div', 'wr-sub');
  if (ctx.me != null) ctx.ui.append(hud);
  ctx.ui.append(banner, sub);
  hud.innerHTML = `<span class="wr-place"><b>-</b></span><span class="wr-lap">Lap <b>1</b>/${T.laps}</span><span class="wr-item" data-it=""><i></i><em>No item</em></span>`;
  const hPlace = hud.querySelector('.wr-place b'), hLap = hud.querySelector('.wr-lap b'), hItem = hud.querySelector('.wr-item');
  let bannerT = 0;
  function show(text, cls = '', ms = 1100) { banner.textContent = text; banner.className = 'wr-banner show ' + cls; bannerT = ms / 1000; }
  sub.textContent = T.name + ' · ' + T.laps + ' laps'; sub.classList.add('show');
  const nameOf = id => id < 0 ? ((T.cpu || []).find(c => c.id === id)?.name || 'CPU') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { const K = karts.get(id); if (!K) return null; if (K.cpu) return K.cur; const a = K.actor; return a ? { x: a.group.position.x, y: a.group.position.y, z: a.group.position.z } : null; };
  const flagsOf = new Map();
  let lastBits = 0, lastInputAt = 0, myItem = 0;

  return {
    state(g) {
      const laps = {}; for (const p of ctx.players) { const r = g.rs[p.pid]; if (!r) continue; laps[p.pid] = r[0]; bar.mark(p.pid, 'fin', r[3] >= 0); }
      bar.set(laps, g.left);
      const mine = ctx.me != null ? g.rs[ctx.me] : null;
      if (mine) {
        const pl = ord(mine[1]); if (hPlace.textContent !== pl) hPlace.textContent = pl;
        const lp = String(mine[0]); if (hLap.textContent !== lp) hLap.textContent = lp;
        const it = ITEMS[mine[2]] || ''; if (hItem.dataset.it !== it) { hItem.dataset.it = it; hItem.querySelector('i').textContent = it ? ITEM_ICON[it] : ''; hItem.querySelector('em').textContent = it ? ITEM_NAME[it] + ' — A' : 'No item'; if (it) hItem.classList.add('pop'); setTimeout(() => hItem.classList.remove('pop'), 300); }
        myItem = mine[2];
      }
      if (g.cd) { sub.classList.add('show'); } else sub.classList.remove('show');
      if (g.fw && !(mine && mine[3] >= 0)) { const s = `Finish in ${g.fw}`; if (banner.dataset.fw !== s) { banner.dataset.fw = s; if (bannerT <= 0) { banner.textContent = s; banner.className = 'wr-banner show small'; } } }
      // boxes
      for (let i = 0; i < boxOn.length; i++) boxOn[i] = g.bx[i] === '1' ? 1 : 0;
      slicks = g.sl; const seen = new Set();
      for (const [id, x, z] of g.bo) { seen.add(id); const b = balls.get(id); if (b) { b.tx = x; b.tz = z; } else balls.set(id, { x, z, tx: x, tz: z }); }
      for (const id of balls.keys()) if (!seen.has(id)) balls.delete(id);
      for (const row of g.cpu || []) { const K = karts.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4], y: row[5], v: row[6] }; if (!K.cur) K.cur = { ...to }; K.to = to; }
    },
    event(ev) {
      const P = posOf(ev.id), mine = ev.id === ctx.me;
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('GO!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'item') { if (mine) ctx.sfx('pick'); }
      else if (ev.e === 'use') { if (ev.it === 1) { if (mine || ctx.me == null) ctx.sfx('throw'); } else ctx.sfx(ev.it === 2 ? 'splat' : 'throw'); }
      else if (ev.e === 'pad') { if (mine) { ctx.sfx('tap'); juice.flash('rgba(57,208,224,.55)', 140); } }
      else if (ev.e === 'spin') { ctx.sfx('trap'); if (mine) { juice.flash('rgba(232,57,74,.8)', 240); navigator.vibrate?.(60); } else if (ev.by === ctx.me && ev.by !== ev.id) { juice.flash('rgba(255,210,63,.7)', 160); show('Got them!', 'small', 800); } if (P) floatText(stage, P.x, 1.6, P.z, ev.by != null && ev.by !== ev.id ? `Bonk! ${nameOf(ev.by)}` : 'Whoops!', mine ? 'bad' : ''); }
      else if (ev.e === 'bump') { ctx.sfx('hit'); if (P) floatText(stage, P.x, 1.6, P.z, 'Bump!', ev.id === ctx.me ? 'bad' : 'good'); }
      else if (ev.e === 'lap') { if (mine) { show(ev.lap === T.laps ? 'Final lap!' : `Lap ${ev.lap}`, 'small', 1100); ctx.sfx('pick'); } }
      else if (ev.e === 'fin') {
        if (mine) { show(`${ord(ev.place)}!`, ev.place === 1 ? 'go' : '', 2400); ctx.sfx(ev.place === 1 ? 'win' : 'good'); juice.flash(ev.place === 1 ? 'rgba(255,210,63,.9)' : 'rgba(255,255,255,.7)', 500); }
        else if (P) floatText(stage, P.x, 2, P.z, `${nameOf(ev.id)} ${ord(ev.place)}`, 'good');
      }
    },
    input(inp) {
      // the instant you press: a sound, so the button never feels dead while the server answers
      const pa = (inp.b & 1) && !(lastBits & 1), pb = (inp.b & 2) && !(lastBits & 2); lastBits = inp.b; lastInputAt = performance.now();
      if (pa && myItem) ctx.sfx('throw');
      if (pb) ctx.sfx('tap');
    },
    pose(pid, flags) { flagsOf.set(pid, flags); return 'sitGround'; },
    frame(dt, t) {
      juice.frame(dt, t);
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      if (performance.now() - lastInputAt > 90) lastBits = 0;           // view.input is only called while a button is down
      // player karts ride in their actor's group; turn the kart with the body, sit the character in it
      for (const [id, K] of karts) {
        let flags = 0;
        if (K.cpu) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y += (to.y - c.y) * Math.min(1, k * 1.5);
          let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          K.holder.position.set(c.x, c.y, c.z); K.kart.rotation.y = c.yaw; flags = to.flags;
          if (K.actor) { K.actor.body.group.rotation.y = c.yaw; K.actor.update(dt); }
        } else {
          const a = K.actor; flags = flagsOf.get(id) || 0;
          K.kart.rotation.y = a.body.group.rotation.y; a.body.group.position.y = SEAT_Y; a.body.group.scale.setScalar(CHAR_SCALE);
        }
        const spin = flags & F.STUN, root = K.cpu ? K.holder : K.actor.group;
        root.rotation.y = spin ? Math.sin(t * 30) * 0.5 : 0;
        K.kart.userData.flame.visible = !!(flags & F.BOOST); if (flags & F.BOOST) K.kart.userData.flame.scale.set(1, 1, 0.8 + Math.sin(t * 40) * 0.25);
        K.kart.position.y = (flags & F.SLOW) ? Math.sin(t * 25) * 0.03 : 0;
        K.kart.userData.flag.rotation.y = Math.PI / 2 + Math.sin(t * 9 + id) * 0.25;
      }
      // boxes spin and pop back
      for (let i = 0; i < T.boxes.length; i++) {
        boxScale[i] += ((boxOn[i] ? 1 : 0) - boxScale[i]) * Math.min(1, dt * 8); const b = T.boxes[i];
        m4.compose(v.set(b.x, 0.62 + Math.sin(t * 3 + i) * 0.1, b.z), q.setFromEuler(e3.set(0.4, t * 1.6 + i, 0.2)), sc.setScalar(Math.max(0.001, boxScale[i]))); boxMesh.setMatrixAt(i, m4);
      }
      boxMesh.instanceMatrix.needsUpdate = true;
      let si = 0; for (const [, x, z] of slicks) { if (si >= 8) break; m4.compose(v.set(x, 0.025, z), q.identity(), sc.set(1, 1, 0.8)); slickMesh.setMatrixAt(si++, m4); }
      slickMesh.count = si; slickMesh.instanceMatrix.needsUpdate = true;
      let bi = 0; const k = 1 - Math.exp(-dt * 18);
      for (const b of balls.values()) { if (bi >= 8) break; b.x += (b.tx - b.x) * k; b.z += (b.tz - b.z) * k; m4.compose(v.set(b.x, 0.32, b.z), q.setFromEuler(e3.set(t * 12, 0, 0)), sc.setScalar(1)); ballMesh.setMatrixAt(bi++, m4); }
      ballMesh.count = bi; ballMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      juice.dispose();
      bar.el.remove(); hud.remove(); banner.remove(); sub.remove();
      for (const t of cpuTags) t.remove();
      for (const K of karts.values()) if (!K.cpu) { K.kart.removeFromParent(); if (K.actor) { K.actor.body.group.position.y = 0; K.actor.body.group.scale.setScalar(1); K.actor.group.rotation.y = 0; } K.kart.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
      for (const m of mats) { m.map?.dispose(); m.dispose(); }
      wheelGeo.dispose(); flameGeo.dispose(); wheelMat.dispose(); trimMat.dispose(); flameMat.dispose();
    },
  };
}
