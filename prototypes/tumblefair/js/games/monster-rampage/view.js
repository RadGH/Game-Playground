// MONSTER RAMPAGE, as drawn: a toy town on a green board with grey streets — little houses with pointed roofs, shops
// with striped awnings, tall towers, a clock tower with a face and spire, and a windmill whose sails turn. Every
// player wears monster horns and back spikes in their seat colour. A hit wobbles a building and darkens it; a flattened
// one bursts into toy blocks (instanced, they fly and bounce) and leaves a little rubble pile, until the townsfolk put
// it back up (it rises out of the ground). Toy tanks (box + turret + barrel) roll the streets and fire orange foam
// shells; toy helicopters with spinning rotors hover over a monster and a red ring on the ground shrinks to warn where
// the bonk lands. Halloween: a moonlit haunted town — pumpkin houses, purple towers, a crooked windmill, and the
// helicopters are little ghosts with a rotor on top.
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { canvasTexture } from '../../client/stage.js';
import { pumpkinGeo, ghostGeo } from '../../client/halloween.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { KINDS } from './sim.js';

export function createView(ctx) {
  const { THREE, group, stage, init, arena, me } = ctx, HW = ctx.season === 'halloween', W = arena.hw, D = arena.hd;
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });
  const nameOf = pid => (pid === me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?');
  // ---- the board: grass with a grid of streets
  const ground = canvasTexture(512, 384, (c, w, hh) => {
    c.fillStyle = HW ? '#2b2440' : '#6cbf5a'; c.fillRect(0, 0, w, hh);
    c.fillStyle = HW ? '#433a5a' : '#9aa0a8';
    for (let i = -4; i <= 4; i++) { const x = (i * 2.35 + 1.175 + W) / (W * 2) * w; c.fillRect(x - 6, 0, 12, hh); }
    for (let j = -3; j <= 3; j++) { const y = (j * 2.2 + 1.1 + D) / (D * 2) * hh; c.fillRect(0, y - 6, w, 12); }
    c.fillStyle = HW ? 'rgba(255,170,60,.35)' : 'rgba(255,255,255,.7)';
    for (let i = -4; i <= 4; i++) { const x = (i * 2.35 + 1.175 + W) / (W * 2) * w; for (let y = 4; y < hh; y += 18) c.fillRect(x - 1, y, 2, 8); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), std('#ffffff', { map: ground })); floor.receiveShadow = true; group.add(floor);
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 40, D * 2 + 40).rotateX(-Math.PI / 2), std(HW ? '#1d1730' : '#4f9a45')); outside.position.y = -0.02; group.add(outside);
  // ---- buildings
  const PAL = HW ? { wall: ['#3a2a5a', '#4a3a6a', '#2a3a4a'], roof: ['#ff8a1a', '#7a3cc8', '#2a1d4a'], win: '#ffd36b' }
    : { wall: ['#fff3d6', '#ffd9e0', '#d6ecff', '#e0f5d0'], roof: ['#e8394a', '#3d8bff', '#ffb020', '#3ecf6a'], win: '#5ab8ff' };
  const B = init.town.map((o, i) => {
    const K = KINDS[o.k], g = new THREE.Group(), mats = [], m = (cl, x = {}) => { const mt = std(cl, x); mats.push([mt, new THREE.Color(cl)]); return mt; };
    const wall = PAL.wall[i % PAL.wall.length], roof = PAL.roof[(i * 3) % PAL.roof.length];
    const add = (geo, mt, x, y, z) => { const me2 = new THREE.Mesh(geo, mt); me2.position.set(x, y, z); me2.castShadow = true; me2.receiveShadow = true; g.add(me2); return me2; };
    if (K.id === 'house') {
      if (HW && i % 2 === 0) { const p = add(pumpkinGeo(THREE, 0.62), m('#ff7a14'), 0, 0.5, 0); p.scale.set(1, 0.85, 0.9); add(new THREE.BoxGeometry(0.22, 0.3, 0.05), m('#2a1238'), 0, 0.2, o.hd + 0.02); }
      else { add(new THREE.BoxGeometry(o.hw * 2, 0.6, o.hd * 2), m(wall), 0, 0.3, 0); const r = add(new THREE.ConeGeometry(o.hw * 1.35, 0.5, 4), m(roof), 0, 0.85, 0); r.rotation.y = Math.PI / 4; r.scale.z = o.hd / o.hw; add(new THREE.BoxGeometry(0.2, 0.32, 0.04), m('#7a4a2a'), 0, 0.16, o.hd + 0.02); }
    } else if (K.id === 'shop') {
      add(new THREE.BoxGeometry(o.hw * 2, 0.95, o.hd * 2), m(wall), 0, 0.475, 0);
      add(new THREE.BoxGeometry(o.hw * 2 + 0.1, 0.12, 0.45), m(roof), 0, 0.72, o.hd + 0.15);
      add(new THREE.BoxGeometry(o.hw * 1.4, 0.35, 0.04), m(PAL.win, { emissive: PAL.win, emissiveIntensity: 0.25 }), 0, 0.38, o.hd + 0.02);
      add(new THREE.BoxGeometry(o.hw * 2 + 0.05, 0.15, o.hd * 2 + 0.05), m(roof), 0, 1.02, 0);
    } else if (K.id === 'tower') {
      add(new THREE.BoxGeometry(o.hw * 2, 1.5, o.hd * 2), m(HW ? '#5a3a8a' : wall), 0, 0.75, 0);
      for (const y of [0.5, 0.95, 1.35]) add(new THREE.BoxGeometry(o.hw * 2 + 0.02, 0.14, 0.16), m(PAL.win, { emissive: PAL.win, emissiveIntensity: 0.3 }), 0, y, o.hd);
      add(new THREE.ConeGeometry(o.hw * 1.2, 0.6, 4), m(roof), 0, 1.8, 0).rotation.y = Math.PI / 4;
    } else if (K.id === 'clock') {
      add(new THREE.BoxGeometry(o.hw * 1.7, 2.1, o.hd * 1.7), m(HW ? '#3a2a4a' : '#e8d8b8'), 0, 1.05, 0);
      const face = add(new THREE.CircleGeometry(0.42, 20), m(HW ? '#ffd36b' : '#ffffff', { emissive: HW ? '#ffb030' : '#000000', emissiveIntensity: HW ? 0.5 : 0 }), 0, 1.6, o.hd * 0.86); void face;
      const hand1 = add(new THREE.BoxGeometry(0.04, 0.3, 0.02), m('#1a1a22'), 0, 1.7, o.hd * 0.87); hand1.geometry.translate(0, 0.0, 0);
      const hand2 = add(new THREE.BoxGeometry(0.2, 0.04, 0.02), m('#1a1a22'), 0.08, 1.6, o.hd * 0.87); void hand2;
      add(new THREE.ConeGeometry(o.hw * 1.2, 0.9, 4), m(roof), 0, 2.55, 0).rotation.y = Math.PI / 4;
    } else {
      add(new THREE.CylinderGeometry(o.hw * 0.55, o.hw * 0.95, 2.0, 8), m(HW ? '#4a3a5a' : '#f4ecd8'), 0, 1.0, 0);
      add(new THREE.ConeGeometry(o.hw * 0.7, 0.5, 8), m(roof), 0, 2.25, 0);
      const hub = new THREE.Group(); hub.position.set(0, 1.85, o.hw * 0.62); g.add(hub);
      for (let k = 0; k < 4; k++) { const sail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 0.04), m(HW ? '#2a1d4a' : '#ffffff')); sail.geometry.translate(0, 0.6, 0); sail.rotation.z = k * Math.PI / 2; hub.add(sail); }
      g.userData.hub = hub;
    }
    g.position.set(o.x, 0, o.z); group.add(g);
    const rubble = new THREE.Group(); rubble.position.set(o.x, 0, o.z); rubble.visible = false; group.add(rubble);
    for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.22), std(k % 2 ? wall : roof)); r.position.set(((k * 37) % 7 - 3) / 6 * o.hw, 0.09, ((k * 53) % 5 - 2) / 4 * o.hd); r.rotation.y = k; rubble.add(r); }
    return { g, rubble, mats, hp: init.maxHp[i], max: init.maxHp[i], wob: 0, rise: 1, h: K.h, wall, roof };
  });
  // ---- flying toy blocks (instanced)
  const NB = 160, chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), std('#ffffff'), NB); chunks.count = 0; group.add(chunks);
  const flying = [], m4 = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), e3 = new THREE.Euler(), sc = new THREE.Vector3(), col = new THREE.Color();
  let seedN = 1; const rnd = () => (seedN = (seedN * 16807) % 2147483647) / 2147483647;
  function burst(i) {
    const o = init.town[i], b = B[i], n = Math.min(26, 10 + Math.round(b.h * 6));
    for (let k = 0; k < n; k++) {
      if (flying.length >= NB) flying.shift();
      flying.push({ x: o.x + (rnd() - 0.5) * o.hw * 2, y: rnd() * b.h, z: o.z + (rnd() - 0.5) * o.hd * 2, vx: (rnd() - 0.5) * 6, vy: 3 + rnd() * 4, vz: (rnd() - 0.5) * 6, r: rnd() * 6, s: 0.6 + rnd() * 0.8, t: 2.2, c: k % 2 ? b.wall : b.roof });
    }
  }
  // ---- monster horns and spikes on every player
  const horns = [];
  for (const p of ctx.players) {
    const a = ctx.actor(p.pid); if (!a) continue;
    const hg = new THREE.Group(), hm = std(HW ? '#ff8a1a' : '#fff6e0'), sm = std(p.color || '#7a3cc8');
    for (const s of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 8), hm); horn.position.set(s * 0.2, (a.height || 1.5) - 0.05, 0.02); horn.rotation.z = -s * 0.45; hg.add(horn); }
    for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 6), sm); sp.position.set(0, (a.height || 1.5) * (0.42 + k * 0.14), -0.28); sp.rotation.x = -0.9; hg.add(sp); }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 8), sm); tail.position.set(0, 0.35, -0.42); tail.rotation.x = -1.9; hg.add(tail);
    (a.body?.group || a.group).add(hg); horns.push(hg);
  }
  // ---- toy army
  const tankMat = std(HW ? '#4a2a6a' : '#5a7a3a'), tankDark = std(HW ? '#2a1238' : '#3a5226');
  const tanks = [];
  function tankMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 0.8), tankMat); body.position.y = 0.2; g.add(body);
    for (const s of [-1, 1]) { const tr = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.86), tankDark); tr.position.set(s * 0.36, 0.12, 0); g.add(tr); }
    const tur = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.16, 10), tankMat); tur.position.y = 0.4; g.add(tur);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8).rotateX(Math.PI / 2), tankDark); bar.position.set(0, 0.42, 0.32); g.add(bar);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    group.add(g); return { g, x: 0, z: 0, yaw: 0, flip: 0 };
  }
  const shellMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff8a1a', toneMapped: false }), 24); shellMesh.count = 0; group.add(shellMesh);
  const helis = [];
  function heliMesh() {
    const g = new THREE.Group();
    if (HW) { const gh = new THREE.Mesh(ghostGeo(THREE, 0.45), new THREE.MeshStandardMaterial({ color: '#f4ecd8', transparent: true, opacity: 0.85, emissive: '#c8b8ff', emissiveIntensity: 0.25 })); g.add(gh); }
    else {
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 10), std('#ffd23f')); body.scale.set(1, 0.85, 1.25); g.add(body);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.8, 6).rotateX(Math.PI / 2), std('#ffd23f')); tail.position.set(0, 0.05, -0.65); g.add(tail);
      const win = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), std('#5ab8ff', { roughness: 0.2 })); win.position.set(0, 0.08, 0.3); g.add(win);
    }
    const rotor = new THREE.Group(); rotor.position.y = HW ? 0.55 : 0.36; g.add(rotor);
    for (let k = 0; k < 2; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.03, 0.1), std('#3a3a44')); bl.rotation.y = k * Math.PI / 2; rotor.add(bl); }
    g.userData.rotor = rotor;
    const shadowRing = new THREE.Mesh(new THREE.RingGeometry(init.heliR * 0.92, init.heliR, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(init.heliR, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a3a', transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false }));
    const ring = new THREE.Group(); ring.add(shadowRing, fill); ring.visible = false; ring.position.y = 0.03; group.add(ring);
    group.add(g); return { g, ring, fill, x: 0, z: -12, warn: 0, wt: 0 };
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'points' });
  const pill = h('div', 'mr-pill'); ctx.ui.append(pill);
  const juice = createJuice(ctx);
  let camX = 0;
  let G = null, flats = 0;
  const myLine = g => {
    if (me == null) return 'Most destruction wins!';
    const a = ctx.pos(me); let near = null, nd = 3.2;
    if (a) init.town.forEach((o, i) => { if (B[i].hp > 0 && KINDS[o.k].landmark) { const d = Math.hypot(o.x - a.x, o.z - a.z); if (d < nd) { nd = d; near = KINDS[o.k]; } } });
    if (near) return `🏛 ${near.id === 'clock' ? 'Clock Tower' : 'Windmill'}: flatten it for +${near.bonus}!`;
    return flats ? `💥 You flattened ${flats} · B = STOMP` : 'A = PUNCH buildings · B = STOMP';
  };
  return {
    halloween: { y: 0, mist: true, spots: [[-W - 1.4, 0, -D + 1], [W + 1.4, 0, -D + 1], [-W - 1.4, 0, D - 1], [W + 1.4, 0, D - 1]] },
    start() { juice.say(init.solo ? 'SMASH the town!' : 'RAMPAGE! Most destruction wins', 1800); },
    state(g) {
      G = g; bar.set(g.sc, g.left);
      const hp = g.bs.split(',').map(Number); let changed = false;
      hp.forEach((v, i) => {
        const b = B[i]; if (v === b.hp) return;
        if (v > 0 && b.hp <= 0) { b.rise = 0; b.g.visible = true; b.rubble.visible = false; changed = true; }
        if (v <= 0 && b.hp > 0) { b.g.visible = false; b.rubble.visible = true; changed = true; }
        if (v < b.hp && v > 0) b.wob = 0.35;
        b.hp = v; const k = v > 0 ? (1 - v / b.max) * 0.5 : 0; for (const [mt, c0] of b.mats) mt.color.copy(c0).lerp(col.set('#3a2a2a'), k);
      });
      if (changed) arena.blocks = init.town.filter((o, i) => hp[i] > 0).map(o => ({ x: o.x, z: o.z, hw: o.hw, hd: o.hd }));
      while (tanks.length < g.tk.length) tanks.push(tankMesh());
      g.tk.forEach(([x, z, yaw, fl], i) => { const t = tanks[i]; t.x = x; t.z = z; t.yaw = yaw; t.flip = fl; });
      while (helis.length < g.hl.length) helis.push(heliMesh());
      g.hl.forEach(([x, z, w, rx, rz], i) => { const H = helis[i]; H.x = x; H.z = z; if (w && !H.warn) { H.wt = 0; H.ring.position.x = rx; H.ring.position.z = rz; } H.warn = w; H.ring.visible = !!w; });
      shellMesh.count = Math.min(24, g.sh.length);
      g.sh.slice(0, 24).forEach(([, x, z], i) => shellMesh.setMatrixAt(i, m4.makeTranslation(x, 0.42, z))); shellMesh.instanceMatrix.needsUpdate = true;
      const line = myLine(g); if (pill.textContent !== line) pill.textContent = line;
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 320); },
    event(ev) {
      if (ev.e === 'punch') { if (ev.pid !== me) ctx.actor(ev.pid)?.play('punch', 320); if (ev.pid === me && !ev.ok) ctx.sfx('tap'); }
      else if (ev.e === 'hit') { if (ev.pid === me) ctx.sfx('hit'); }
      else if (ev.e === 'flat') {
        burst(ev.id); const o = init.town[ev.id], K = KINDS[o.k];
        floatText(stage, o.x, B[ev.id].h + 0.6, o.z, `${K.landmark ? 'LANDMARK! ' : ''}+${ev.bonus}`, ev.pid === me ? 'good' : '');
        ctx.sfx(K.landmark ? 'coins' : 'splat'); juice.shake(K.landmark ? 0.22 : 0.1, K.landmark ? 0.5 : 0.25);
        if (ev.pid === me) { flats++; if (K.landmark) { juice.flash('#ffd23f', 300); juice.say(`You toppled the ${K.id === 'clock' ? 'Clock Tower' : 'Windmill'}!`, 1600); } }
        else if (K.landmark) juice.say(`${nameOf(ev.pid)} toppled the ${K.id === 'clock' ? 'Clock Tower' : 'Windmill'}!`, 1500);
      } else if (ev.e === 'hop') { ctx.actor(ev.pid)?.play('jump', 360); }
      else if (ev.e === 'stomp') { ctx.sfx('trap'); juice.shake(0.14, 0.3); if (ev.dizzy.includes(me)) juice.flash('#b38dff', 220); }
      else if (ev.e === 'tank') { floatText(stage, ev.x, 1, ev.z, ev.pid === me ? 'Tank flipped! +3' : '+3', ev.pid === me ? 'good' : ''); ctx.sfx('coins'); }
      else if (ev.e === 'fire') { ctx.sfx('throw'); }
      else if (ev.e === 'ring') { if (ev.pid === me) juice.say('Helicopter! Step out of the ring', 1100); }
      else if (ev.e === 'bonk') { floatText(stage, ev.x, 2, ev.z, ev.pid === me ? `Bonk! −${ev.lost}` : 'Bonk!', ev.pid === me ? 'bad' : ''); if (ev.pid === me) { juice.flash('#ff5f5f', 260); ctx.sfx('bad'); } }
      else if (ev.e === 'rebuilt') { ctx.sfx('pick'); }
      else if (ev.e === 'end') { if (ev.win != null) { juice.say(ev.win === me ? 'Most destruction — YOU!' : `${nameOf(ev.win)} wrecked the most!`, 2600); ctx.sfx(ev.win === me ? 'win' : 'good'); } }
    },
    pose(pid, flags) { if (flags & F.AIR) return 'jump'; if (flags & F.STUN) return 'hit'; return undefined; },
    frame(dt, t) {
      for (const b of B) {
        if (b.wob > 0) { b.wob -= dt; const k = Math.max(0, b.wob) * 0.4; b.g.rotation.z = Math.sin(t * 40) * k * 0.3; b.g.scale.set(1 + k * 0.3, 1 - k * 0.3, 1 + k * 0.3); } else { b.g.rotation.z = 0; }
        if (b.rise < 1) { b.rise = Math.min(1, b.rise + dt / 0.6); b.g.position.y = -b.h * (1 - b.rise); }
        if (b.g.userData.hub) b.g.userData.hub.rotation.z = t * (HW ? 0.8 : 1.6);
      }
      let n = 0;
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]; f.t -= dt; if (f.t <= 0) { flying.splice(i, 1); continue; }
        f.vy -= 14 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt; f.r += dt * 6;
        if (f.y < 0.1) { f.y = 0.1; f.vy = Math.abs(f.vy) * 0.35; f.vx *= 0.6; f.vz *= 0.6; }
      }
      for (const f of flying) { const s = f.s * Math.min(1, f.t * 2); m4.compose(v.set(f.x, f.y, f.z), q.setFromEuler(e3.set(f.r, f.r * 0.7, 0)), sc.set(s, s, s)); chunks.setMatrixAt(n, m4); chunks.setColorAt(n, col.set(f.c)); n++; }
      chunks.count = n; chunks.instanceMatrix.needsUpdate = true; if (chunks.instanceColor) chunks.instanceColor.needsUpdate = true;
      for (const T of tanks) {
        T.g.position.x += (T.x - T.g.position.x) * Math.min(1, dt * 10); T.g.position.z += (T.z - T.g.position.z) * Math.min(1, dt * 10);
        if (Math.hypot(T.x - T.g.position.x, T.z - T.g.position.z) > 3) T.g.position.set(T.x, 0, T.z);
        T.g.rotation.y = T.yaw; T.g.rotation.z += ((T.flip ? Math.PI : 0) - T.g.rotation.z) * Math.min(1, dt * 8); T.g.position.y = T.flip ? 0.45 : 0;
      }
      for (const H of helis) {
        H.g.position.x += (H.x - H.g.position.x) * Math.min(1, dt * 8); H.g.position.z += (H.z - H.g.position.z) * Math.min(1, dt * 8);
        H.g.position.y = 3.1 + Math.sin(t * 2 + H.x) * 0.12; H.g.userData.rotor.rotation.y = t * 22;
        if (H.warn) { H.wt += dt; const k = Math.max(0.15, 1 - H.wt / 1.3); H.fill.scale.set(1 - k, 1 - k, 1 - k); H.ring.children[0].material.opacity = 0.5 + 0.4 * Math.sin(t * 20); }
      }
      // an upright phone: follow your own character sideways so the town is big enough to play on
      if (innerHeight > innerWidth * 1.15) { const p = me != null ? ctx.pos(me) : null, cx = Math.max(-W + 5.8, Math.min(W - 5.8, p ? p.x : 0)); camX += (cx - camX) * Math.min(1, dt * 3); ctx.camera({ cx: camX, cz: 0, hw: 5.8, hd: D + 0.6 }, { instant: true }); }
      juice.frame(dt, t);
    },
    dispose() { bar.el.remove(); pill.remove(); juice.dispose(); ground.dispose(); for (const hg of horns) hg.removeFromParent(); },
  };
}
