// BUMPER BOATS, as drawn: a round paddling pond of bright blue water ringed by a fat inflatable tube (red and yellow
// segments that squish when a boat bounces off), a turning spiral whirlpool in the middle, three stone fountain basins
// gliding round the rim (they bubble before they spout a tall white column), and little yellow rubber ducks bobbing.
// Each player sits in a round tub boat in their seat colour that keeps slowly spinning (faster when it is hit), with a
// chunky water cannon on the front that points where they steer; A shoots a burst of white-blue droplets. A boat that
// goes down the drain spins and sinks into the swirl, then pops up at the rim. CPU duck boats are yellow with a bill.
// Halloween: night water with a green glow in the swirl, pumpkin boats' trim, lantern dressing from halloween.js.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { createTunes } from '../../client/tunes.js';
import { F } from '../../shared/arena.js';

const SEAT_Y = 0.18;
export function createView(ctx) {
  const { THREE, group, stage, arena: A, init } = ctx, HW = ctx.season === 'halloween', R0 = init.rules;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const mats = [], geos = [], texs = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra }); mats.push(m); return m; };
  const basic = opts => { const m = new THREE.MeshBasicMaterial(opts); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const tex = t => { texs.push(t); return t; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const tunes = createTunes({ volume: 0.2 });

  // ---- ground, pond, rim tube
  const grass = new THREE.Mesh(geo(new THREE.PlaneGeometry(90, 90).rotateX(-Math.PI / 2)), std(HW ? '#2c3a3a' : '#79c95e', { roughness: 1 })); grass.position.y = -0.05; grass.receiveShadow = true; group.add(grass);
  const deck = new THREE.Mesh(geo(new THREE.CylinderGeometry(A.r + 1.6, A.r + 1.8, 0.2, 48)), std(HW ? '#4a3a5a' : '#e0b27a', { roughness: 0.9 })); deck.position.y = -0.1; deck.receiveShadow = true; group.add(deck);
  const waterTex = tex(canvasTexture(256, 256, (c, w) => {
    c.fillStyle = HW ? '#23336a' : '#3aa6e8'; c.fillRect(0, 0, w, w);
    c.strokeStyle = HW ? 'rgba(160,140,255,.25)' : 'rgba(255,255,255,.32)'; c.lineWidth = 4;
    for (let i = 0; i < 14; i++) { const y = (i * 37) % w, x = (i * 71) % w; c.beginPath(); c.arc(x, y, 18 + (i % 4) * 8, 0.2, 1.4); c.stroke(); }
  }));
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(3, 3);
  const water = new THREE.Mesh(geo(new THREE.CircleGeometry(A.r + 0.1, 64).rotateX(-Math.PI / 2)), std('#ffffff', { map: waterTex, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95 })); water.position.y = 0.01; water.receiveShadow = true; group.add(water);
  const SEGS = 28, tubes = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.42, 0.42, (A.r + 0.45) * Math.PI * 2 / SEGS + 0.04, 12).rotateZ(Math.PI / 2)), std('#ffffff', { roughness: 0.4 }), SEGS);
  const segs = Array.from({ length: SEGS }, (_, i) => ({ a: (i + 0.5) / SEGS * Math.PI * 2, squish: 0 }));
  segs.forEach((s, i) => tubes.setColorAt(i, col.set(HW ? (i % 2 ? '#ff8a1a' : '#4a2a7a') : (i % 2 ? '#ffd23f' : '#e8394a'))));
  tubes.castShadow = true; group.add(tubes);
  function placeTubes() { segs.forEach((s, i) => { const k = 1 - s.squish * 0.35, rr = A.r + 0.45; m4.compose(v.set(Math.sin(s.a) * rr, 0.26 * k, Math.cos(s.a) * rr), q.setFromEuler(e3.set(0, s.a + Math.PI / 2, 0)), sc.set(1, k, 1 + s.squish * 0.3)); tubes.setMatrixAt(i, m4); }); tubes.instanceMatrix.needsUpdate = true; }
  placeTubes();
  // ---- the whirlpool: a spiral disc that turns, darker toward the drain
  const swirlTex = tex(canvasTexture(256, 256, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2); g.addColorStop(0, HW ? '#0a2a10' : '#06345a'); g.addColorStop(0.35, HW ? '#2a8a3a' : '#1a6fb0'); g.addColorStop(1, 'rgba(60,160,230,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w); c.strokeStyle = HW ? 'rgba(125,255,90,.55)' : 'rgba(255,255,255,.55)'; c.lineWidth = 5;
    for (let arm = 0; arm < 4; arm++) { c.beginPath(); for (let t = 0; t < 1; t += 0.02) { const a = arm * Math.PI / 2 + t * 5, r = 8 + t * (w / 2 - 10); const x = w / 2 + Math.cos(a) * r, y = w / 2 + Math.sin(a) * r; t ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  }));
  const swirl = new THREE.Mesh(geo(new THREE.CircleGeometry(R0.range, 48).rotateX(-Math.PI / 2)), basic({ map: swirlTex, transparent: true, depthWrite: false })); swirl.position.y = 0.025; group.add(swirl);
  const drainMesh = mesh(geo(new THREE.CylinderGeometry(R0.core * 0.7, R0.core * 0.2, 0.05, 24)), basic({ color: HW ? '#0a1a0a' : '#032038' }), 0, 0.03, 0);
  // ---- fountains: a stone basin ring, bubbles when warned, a column of water when spouting
  const fountains = (init.fountains || []).map(() => {
    const g = new THREE.Group(); group.add(g);
    mesh(geo(new THREE.TorusGeometry(R0.fr, 0.14, 8, 28).rotateX(Math.PI / 2)), std(HW ? '#8a7a9a' : '#cfd6dd', { roughness: 0.8 }), 0, 0.08, 0, g);
    const glow = new THREE.Mesh(geo(new THREE.CircleGeometry(R0.fr, 28).rotateX(-Math.PI / 2)), basic({ color: HW ? '#7dff5a' : '#ffffff', transparent: true, opacity: 0, depthWrite: false })); glow.position.y = 0.04; g.add(glow);
    const col2 = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.5, 0.9, 1, 14, 1, true).translate(0, 0.5, 0)), basic({ color: '#e8f6ff', transparent: true, opacity: 0.85, side: THREE.DoubleSide })); col2.visible = false; g.add(col2);
    return { g, glow, col: col2, st: 0, sp: 0 };
  });
  const bubGeo = geo(new THREE.SphereGeometry(0.12, 6, 4)), bubMat = basic({ color: '#ffffff', transparent: true, opacity: 0.8 });
  const BUBS = 36, bubs = new THREE.InstancedMesh(bubGeo, bubMat, BUBS); bubs.count = 0; group.add(bubs);
  // ---- ducks (instanced, up to a handful)
  const duckBody = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.32, 12, 8).scale(1.25, 0.8, 1)), std('#ffd23f', { roughness: 0.4 }), 6), duckHead = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.2, 10, 8)), std('#ffd23f', { roughness: 0.4 }), 6), duckBill = new THREE.InstancedMesh(geo(new THREE.ConeGeometry(0.08, 0.2, 6).rotateZ(-Math.PI / 2)), std('#ff8a1a'), 6);
  for (const d of [duckBody, duckHead, duckBill]) { d.count = 0; d.castShadow = true; group.add(d); }
  let ducks = [];
  // ---- boats
  const rubber = std(HW ? '#2a1d3a' : '#1d1f24', { roughness: 0.7 }), cannonMat = std('#cfd6dd', { metalness: 0.5, roughness: 0.35 });
  const tubGeo = geo(new THREE.CylinderGeometry(0.78, 0.7, 0.42, 22)), rimGeo = geo(new THREE.TorusGeometry(0.78, 0.17, 8, 26).rotateX(Math.PI / 2)), stripeGeo = geo(new THREE.TorusGeometry(0.79, 0.05, 6, 26).rotateX(Math.PI / 2));
  const barrelGeo = geo(new THREE.CylinderGeometry(0.1, 0.13, 0.7, 10).rotateX(Math.PI / 2)), tankGeo = geo(new THREE.SphereGeometry(0.2, 10, 8));
  function makeBoat(color, cpu = false) {
    const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
    const body = std(color, { roughness: 0.35 });
    mesh(tubGeo, body, 0, 0.2, 0, spin); mesh(rimGeo, cpu ? std('#ffffff') : rubber, 0, 0.42, 0, spin);
    const stripes = mesh(stripeGeo, std(HW ? '#ff8a1a' : '#ffffff'), 0, 0.22, 0, spin); stripes.scale.set(1, 1, 1);
    if (cpu) { const bill = mesh(geo(new THREE.BoxGeometry(0.5, 0.1, 0.4)), std('#ff8a1a'), 0, 0.45, 0.85, spin); bill.castShadow = false; }
    const gun = new THREE.Group(); g.add(gun);
    mesh(barrelGeo, cannonMat, 0, 0.78, 0.55, gun); mesh(tankGeo, std(HW ? '#7dff5a' : '#39d0e0', { roughness: 0.3 }), 0, 0.75, 0.15, gun);
    g.userData = { spin, gun, rot: 0, rate: 0.9 };
    return g;
  }
  const boats = new Map();       // id -> { boat, actor, cpu?, holder, cur, to }
  for (const p of ctx.players) { const a = ctx.actor(p.pid); if (!a) continue; const b = makeBoat(p.color); a.group.add(b); boats.set(p.pid, { boat: b, actor: a }); }
  const cpuTags = [];
  for (const [i, c] of (init.cpus || []).entries()) {
    const b = makeBoat('#ffd23f', true), holder = new THREE.Group(); holder.add(b); group.add(holder);
    const K = { boat: b, holder, actor: null, cpu: true, cur: null, to: null }; boats.set(c.id, K);
    cpuTags.push(stage.tag(holder, { text: c.name, height: 2.0, cls: 'bb-cpu' }));
    ctx.createActor({ look: { race: ['halfling', 'dwarf', 'elf'][i % 3], seed: 7300 + i * 41 } }).then(a => { if (!a) return; K.actor = a; holder.add(a.group); a.place(0, 0, 0, 0); a.setPose('sitGround'); a.body.group.position.y = SEAT_Y; });
  }
  // ---- water jets: droplets flying out of a cannon
  const DROPS = 140, drops = new THREE.InstancedMesh(geo(new THREE.SphereGeometry(0.11, 6, 4)), basic({ color: '#dff4ff' }), DROPS); drops.count = 0; group.add(drops);
  const jets = [];   // { x, z, yaw, t, seed }
  const lastSquirt = new Map();
  function jet(id, x, z, yaw) { jets.push({ x, z, yaw, t: 0 }); if (jets.length > 10) jets.shift(); const K = boats.get(id); if (K) K.boat.userData.rate = 4; }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'bb-pill', `<span><b>Drain</b> 3</span><span><b>Fountain</b> 2</span><span><b>Duck</b> 1</span>`), banner = h('div', 'bb-banner');
  ctx.ui.append(pill, banner);
  let bannerT = 0;
  const show = (text, cls = '', ms = 1000) => { banner.textContent = text; banner.className = 'bb-banner show ' + cls; bannerT = ms / 1000; };
  const nameOf = id => id < 0 ? ((init.cpus || []).find(c => c.id === id)?.name || 'Duck boat') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const posOf = id => { const K = boats.get(id); if (!K) return null; if (K.cpu) return K.cur; const p = ctx.pos(id); return p; };
  const flagsOf = new Map();
  let el = 0, elAt = 0, fs = [], started = false, heldAt = 0;
  const fAt = (i, t) => { const a = init.fountains[i] + R0.spin * t; return [Math.sin(a) * R0.ring, Math.cos(a) * R0.ring]; };
  return {
    halloween: { spots: [0.4, 1.3, 2.2, 3.1, 4.0, 4.9, 5.8].map(a => [Math.sin(a) * (A.r + 2.6), 0, Math.cos(a) * (A.r + 2.6)]) },
    state(g) {
      bar.set(g.sc, g.left);
      el = g.el; elAt = performance.now() / 1000; fs = g.fs || fs; ducks = g.dk || ducks;
      for (const row of g.cpu || []) { const K = boats.get(row[0]); if (!K) continue; const to = { x: row[1], z: row[2], yaw: row[3], flags: row[4], y: row[5] }; if (!K.cur) K.cur = { ...to }; K.to = to; }
      if (!g.cd && !started && g.left > 0) { started = true; tunes.start(HW ? 'spooky' : 'jig'); }
    },
    input(inp) {
      // called on every tick a button is held: a new press is one after a gap, and the cannon has its own cool-down
      const now = performance.now(), fresh = now - heldAt > 90; heldAt = now;
      if (ctx.me == null || !(inp.b & 1) || !fresh || now - (lastSquirt.get(ctx.me) || 0) < RULES.squirt.cool * 1000) return;
      const p = ctx.pos(ctx.me); if (!p || (flagsOf.get(ctx.me) & (F.STUN | F.OUT | F.FROZEN))) return;
      jet(ctx.me, p.x, p.z, p.yaw); lastSquirt.set(ctx.me, now); tunes.fx('pop', 1.4);
    },
    event(ev) {
      if (ev.e === 'count') { show(String(ev.n), 'count', 900); ctx.sfx('tap'); }
      else if (ev.e === 'go') { show('PADDLE!', 'go', 900); ctx.sfx('good'); }
      else if (ev.e === 'squirt') {
        if (ev.id === ctx.me && performance.now() - (lastSquirt.get(ctx.me) || 0) < 600) { /* already drawn when pressed */ }
        else { jet(ev.id, ev.x, ev.z, ev.yaw); tunes.fx('pop', 1.2 + Math.random() * 0.3); }
        for (const id of ev.hit) { const K = boats.get(id); if (K) K.boat.userData.rate = 7; if (id === ctx.me) show('Soaked!', 'small', 700); }
      } else if (ev.e === 'drain') {
        const p = posOf(ev.id); tunes.fx('slime', 0.8); ctx.sfx('out');
        if (p) floatText(stage, 0, 1.6, 0, ev.by != null ? `${nameOf(ev.by)} +${ev.pts}!` : 'Glug!', ev.by === ctx.me ? 'good' : '');
        if (ev.id === ctx.me) show('Down the drain!', 'small', 1300); else if (ev.by === ctx.me) show('DOWN THE DRAIN! +3', 'go small', 1000);
      } else if (ev.e === 'fling') {
        const [x, z] = fAt(ev.f, el); ctx.sfx('throw'); tunes.fx('boing', 0.7);
        floatText(stage, x, 2.4, z, ev.by != null ? `+${ev.pts} SPLOOSH!` : 'Whee!', ev.by === ctx.me ? 'good' : '');
        if (ev.by === ctx.me) show('FOUNTAIN! +2', 'go small', 900);
      } else if (ev.e === 'spout') { const F2 = fountains[ev.f]; if (F2) F2.sp = 0.5; tunes.fx('whistle', 1.3); }
      else if (ev.e === 'splash') ctx.sfx('splat');
      else if (ev.e === 'duck') { ctx.sfx('coins'); tunes.fx('honk', 1.6); floatText(stage, ev.x, 1.4, ev.z, '+1 quack!', ev.id === ctx.me ? 'good' : ''); }
      else if (ev.e === 'bonk') { ctx.sfx('hit'); tunes.fx('boing', 1.2); }
      else if (ev.e === 'boing') { let best = null, bd = 9; for (const s of segs) { const d = Math.abs(Math.atan2(Math.sin(s.a - Math.atan2(ev.x, ev.z)), Math.cos(s.a - Math.atan2(ev.x, ev.z)))); if (d < bd) { bd = d; best = s; } } if (best) best.squish = 1; tunes.fx('boing', 0.9); }
      else if (ev.e === 'pop') ctx.sfx('pick');
      else if (ev.e === 'end') { show('Time!', 'small', 1500); ctx.sfx('win'); tunes.stop(false); }
    },
    pose(pid, flags) { flagsOf.set(pid, flags); return 'sitGround'; },
    frame(dt, t) {
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      const now = performance.now() / 1000, elNow = el + Math.min(0.3, now - elAt);
      waterTex.offset.set((t * 0.02) % 1, (t * 0.013) % 1); swirl.rotation.y = -t * 2.2; drainMesh.rotation.y = -t * 4;
      // fountains
      let nb = 0;
      fountains.forEach((F2, i) => {
        const [x, z] = fAt(i, elNow); F2.g.position.set(x, 0, z);
        const st = fs[i] || 0; F2.glow.material.opacity = st === 1 ? 0.25 + Math.sin(t * 18) * 0.15 : 0.06;
        if (F2.sp > 0) F2.sp -= dt;
        F2.col.visible = st === 2 || F2.sp > 0; if (F2.col.visible) F2.col.scale.set(1, 3.4 + Math.sin(t * 30) * 0.3, 1);
        if (st === 1) for (let k = 0; k < 10 && nb < BUBS; k++) { const a = k * 2.4 + t * 3, r = (k % 3) * 0.4, yy = ((t * 1.6 + k * 0.37) % 1) * 0.5; m4.compose(v.set(x + Math.cos(a) * r, 0.05 + yy, z + Math.sin(a) * r), q.identity(), sc.setScalar(0.6 + (k % 3) * 0.3)); bubs.setMatrixAt(nb++, m4); }
      });
      bubs.count = nb; bubs.instanceMatrix.needsUpdate = true;
      // ducks bob
      ducks.slice(0, 6).forEach(([, x, z], i) => {
        const bob = Math.sin(t * 3 + i) * 0.05, yaw = t * 0.4 + i;
        m4.compose(v.set(x, 0.18 + bob, z), q.setFromEuler(e3.set(0, yaw, 0)), sc.setScalar(1)); duckBody.setMatrixAt(i, m4);
        m4.compose(v.set(x + Math.sin(yaw) * 0.28, 0.48 + bob, z + Math.cos(yaw) * 0.28), q.identity(), sc.setScalar(1)); duckHead.setMatrixAt(i, m4);
        m4.compose(v.set(x + Math.sin(yaw) * 0.48, 0.46 + bob, z + Math.cos(yaw) * 0.48), q.setFromEuler(e3.set(0, yaw - Math.PI / 2, 0)), sc.setScalar(1)); duckBill.setMatrixAt(i, m4);
      });
      for (const d of [duckBody, duckHead, duckBill]) { d.count = Math.min(6, ducks.length); d.instanceMatrix.needsUpdate = true; }
      // boats
      for (const [id, K] of boats) {
        const ud = K.boat.userData; let flags = 0, yaw = 0, root;
        if (K.cpu) {
          if (!K.to) continue; const k = 1 - Math.exp(-dt * 14), c = K.cur, to = K.to;
          c.x += (to.x - c.x) * k; c.z += (to.z - c.z) * k; c.y = to.y; let d = to.yaw - c.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); c.yaw += d * k;
          if (Math.hypot(to.x - c.x, to.z - c.z) > 3) { c.x = to.x; c.z = to.z; }
          K.holder.position.set(c.x, c.y, c.z); flags = to.flags; yaw = c.yaw; root = K.holder;
          if (K.actor) { K.actor.body.group.rotation.y = yaw; K.actor.update(dt); }
        } else { const a = K.actor; flags = flagsOf.get(id) || 0; yaw = a.body.group.rotation.y; a.body.group.position.y = SEAT_Y; root = a.group; }
        ud.rate += (0.9 - ud.rate) * Math.min(1, dt * 1.5); ud.rot += ud.rate * dt; ud.spin.rotation.y = ud.rot; ud.gun.rotation.y = yaw;
        if (flags & F.OUT) { root.position.y = -0.4; ud.spin.rotation.y = t * 12; root.rotation.y = t * 9; root.scale.setScalar(0.6); }
        else { root.rotation.y = flags & F.STUN ? Math.sin(t * 20) * 0.15 : 0; root.scale.setScalar(1); }
      }
      // jets
      let nd = 0;
      for (let i = jets.length - 1; i >= 0; i--) {
        const J = jets[i]; J.t += dt; if (J.t > 0.45) { jets.splice(i, 1); continue; }
        for (let k = 0; k < 14 && nd < DROPS; k++) {
          const spread = ((k % 7) - 3) * 0.09, u = Math.min(1, J.t * 2.6 + (k / 14) * 0.25), d = 0.6 + u * R0.squirt;
          const sx = Math.sin(J.yaw + spread), sz = Math.cos(J.yaw + spread);
          m4.compose(v.set(J.x + sx * d, 0.8 + Math.sin(u * Math.PI) * 0.5 - u * 0.6, J.z + sz * d), q.identity(), sc.setScalar(1.3 - u * 0.6)); drops.setMatrixAt(nd++, m4);
        }
      }
      drops.count = nd; drops.instanceMatrix.needsUpdate = true;
      let any = false; for (const s of segs) if (s.squish > 0) { s.squish = Math.max(0, s.squish - dt * 3); any = true; } if (any) placeTubes();
    },
    dispose() {
      tunes.dispose(); bar.el.remove(); pill.remove(); banner.remove();
      for (const t2 of cpuTags) t2.remove();
      for (const K of boats.values()) if (!K.cpu) { K.boat.removeFromParent(); if (K.actor) { K.actor.body.group.position.y = 0; K.actor.group.rotation.y = 0; K.actor.group.scale.setScalar(1); } }
      for (const t2 of texs) t2.dispose(); for (const m of mats) m.dispose(); for (const g2 of geos) g2.dispose();
    },
  };
}
