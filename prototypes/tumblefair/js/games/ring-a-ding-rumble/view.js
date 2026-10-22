// RING-A-DING RUMBLE, as drawn: a raised boxing ring on a dark fairground-tent floor — a blue canvas mat with a big
// white circle and the game's name, a padded post in each corner wearing a seat colour, three ropes (red, white,
// blue) that wobble when somebody is knocked into them, and a cheering crowd of little bobbing figures round it.
// Every boxer wears big gloves in their seat colour. Under each boxer: a health bar (heart) and a puff bar (wind),
// so colour is never the only cue. A clean hit throws a starburst + POW/BAM; a knockdown shakes the ring and
// shows KNOCKDOWN!; your own punch plays the instant you press (view.input), before the server answers.
import { RULES, MODE } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { SEATS } from '../../shared/protocol.js';

const POW = ['POW!', 'BAM!', 'WHAM!', 'BOP!'];
export function createView(ctx) {
  const { THREE, group, stage, meta, init } = ctx, hw = meta.arena.hw, hd = meta.arena.hd;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  const world = new THREE.Group(); group.add(world);                 // everything but the boxers: shaken on big hits
  // ---- tent floor, ring platform, mat
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#3a2448', { roughness: 1 })); floor.position.y = -0.62; floor.receiveShadow = true; world.add(floor);
  const W = hw + 0.9, D = hd + 0.9;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W * 2, 0.6, D * 2), std('#2b2f6e')); deck.position.y = -0.31; deck.receiveShadow = true; world.add(deck);
  const skirtTex = canvasTexture(256, 32, (c, w, hh) => { c.fillStyle = '#ffd23f'; c.fillRect(0, 0, w, hh); c.fillStyle = '#e8394a'; for (let i = 0; i < 8; i++) c.fillRect(i * 32, 0, 16, hh); });
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(W * 2 + 0.04, 0.5, D * 2 + 0.04), new THREE.MeshBasicMaterial({ map: skirtTex })); skirt.position.y = -0.33; world.add(skirt);
  const matTex = canvasTexture(512, 512, (c, w) => {
    c.fillStyle = '#3d8bff'; c.fillRect(0, 0, w, w); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 10; c.strokeRect(14, 14, w - 28, w - 28);
    c.beginPath(); c.arc(w / 2, w / 2, 120, 0, Math.PI * 2); c.lineWidth = 12; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.92)'; c.font = '900 50px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('RING-A', w / 2, w / 2 - 26); c.fillText('DING!', w / 2, w / 2 + 30);
  });
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 0.1, D * 2 - 0.1).rotateX(-Math.PI / 2), std('#ffffff', { map: matTex, roughness: 0.9 })); mat.position.y = 0.005; mat.receiveShadow = true; world.add(mat);
  // ---- posts (a seat colour each) and ropes
  const PX = hw + 0.35, PZ = hd + 0.35, posts = [[-PX, -PZ], [PX, -PZ], [PX, PZ], [-PX, PZ]];
  posts.forEach(([x, z], i) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 10), std('#d9dde3', { metalness: 0.5, roughness: 0.35 })); p.position.set(x, 0.75, z); p.castShadow = true; world.add(p);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.1, 0.34), std(SEATS[i].color, { roughness: 0.55 })); pad.position.set(x, 0.62, z); pad.castShadow = true; world.add(pad);
  });
  const ROPE_Y = [0.38, 0.68, 0.98], ROPE_C = ['#e8394a', '#ffffff', '#3d8bff'];
  const ropes = { n: [], s: [], e: [], w: [] }, shake = { n: 0, s: 0, e: 0, w: 0 };
  for (const side of ['n', 's', 'e', 'w']) for (let i = 0; i < 3; i++) {
    const along = side === 'n' || side === 's', len = (along ? PX : PZ) * 2;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 6).rotateZ(Math.PI / 2), std(ROPE_C[i], { roughness: 0.5 }));
    if (!along) r.rotation.y = Math.PI / 2;
    r.position.set(side === 'e' ? PX : side === 'w' ? -PX : 0, ROPE_Y[i], side === 's' ? PZ : side === 'n' ? -PZ : 0); r.userData.base = r.position.clone(); r.castShadow = true;
    world.add(r); ropes[side].push(r);
  }
  // ---- crowd: little bobbing figures round the ring (two instanced meshes: bodies + heads)
  const CN = 64, crowdB = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.34, 0.9, 7), std('#ffffff', { roughness: 0.9 }), CN), crowdH = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 8, 6), std('#f2c79b', { roughness: 0.8 }), CN);
  const COLS = ['#ff5f5f', '#ffd23f', '#3ecf5a', '#39d0e0', '#b07cff', '#ff9a3d', '#f04fd8', '#ffffff'].map(c => new THREE.Color(c));
  const crowd = [];
  for (let i = 0; i < CN; i++) {
    const ring = i % 2, t = (i / CN) * 4, side = Math.floor(t), u = t - side, off = 2.2 + ring * 1.3, ex = W + off, ez = D + off;
    const x = side === 0 ? -ex + u * 2 * ex : side === 1 ? ex : side === 2 ? ex - u * 2 * ex : -ex, z = side === 0 ? -ez : side === 1 ? -ez + u * 2 * ez : side === 2 ? ez : ez - u * 2 * ez;
    crowd.push({ x, z, y: -0.62 + ring * 0.4, ph: i * 1.37 }); crowdB.setColorAt(i, COLS[i % COLS.length]);
  }
  world.add(crowdB, crowdH);
  let cheer = 0;
  // ---- gloves on every boxer
  const gloveGeo = new THREE.SphereGeometry(0.13, 12, 9), gloveMats = [], gloves = [];
  function glove(actor, color) {
    const parts = actor?.body?.parts; if (!parts) return;
    const m = std(color, { roughness: 0.35 }); gloveMats.push(m);
    for (const k of ['handL', 'handR']) { const bone = parts[k]; if (!bone) continue; const g = new THREE.Mesh(gloveGeo, m); g.scale.set(1, 1.1, 1.2); g.castShadow = true; bone.add(g); gloves.push(g); }
  }
  for (const p of ctx.players) glove(ctx.actor(p.pid), p.color);
  // ---- the CPU sparring partner
  let cpu = null, cpuTag = null; const cpuPos = { x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0, flags: 0, v: 0, seen: false };
  if (init.cpu) ctx.createActor({ look: { race: 'dwarf', seed: 90210 } }).then(a => { if (!a) return; cpu = a; glove(a, '#9aa3ad'); cpuTag = stage.tag(a.group, { text: init.cpu.name + ' (CPU)', height: a.height + 0.35, cls: 'rr-cpu' }); });
  // ---- hit effects
  const starGeo = new THREE.RingGeometry(0.1, 0.55, 8, 1), fx = [];
  function burst(x, z, color, size = 1) { const m = new THREE.Mesh(starGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, side: THREE.DoubleSide })); m.position.set(x, 1.05, z); m.rotation.x = -0.9; m.userData.size = size; group.add(m); fx.push({ m, t: 0 }); }
  let quake = 0;
  // ---- HUD: score bar with knockdown marks, meters under each boxer, banner
  const bar = scoreBar(ctx, { unit: 'points' }), marks = new Map();
  for (const p of ctx.players) { const c = bar.el.querySelector(`[data-pid="${p.pid}"]`); const e = document.createElement('i'); e.className = 'rr-downs'; c?.querySelector('.nm')?.after(e); marks.set(p.pid, e); }
  const meters = new Map();
  const ids = [...ctx.players.map(p => p.pid), ...(init.cpu ? [init.cpu.id] : [])];
  for (const id of ids) { const e = h('div', 'rr-meter' + (id === ctx.me ? ' me' : ''), '<span class="hp"><i>♥</i><b></b></span><span class="pf"><i>≋</i><b></b></span>'); ctx.ui.append(e); meters.set(id, { e, hp: e.querySelector('.hp b'), pf: e.querySelector('.pf b'), last: '' }); }
  const banner = h('div', 'rr-banner'); ctx.ui.append(banner); let bannerT = 0;
  function show(text, cls = '', ms = 1200) { banner.textContent = text; banner.className = 'rr-banner show ' + cls; bannerT = ms / 1000; }
  const nameOf = id => id < 0 ? (init.cpu?.name || 'CPU') : id === ctx.me ? 'You' : ctx.players.find(p => p.pid === id)?.name || '?';
  const actorOf = id => id < 0 ? cpu : ctx.actor(id);
  const posOf = id => { const a = actorOf(id); return a ? a.group.position : null; };
  let F_ = {}, standingN = ids.length;
  // your own presses, so your punch plays at once
  let lastBits = 0, lastInputAt = 0, holdT = 0, swungLocal = false, localJab = -9, localHay = -9;
  const myMode = () => F_[ctx.me]?.[3] ?? MODE.IDLE, myPuff = () => F_[ctx.me]?.[1] ?? 100;
  const free = () => ![MODE.DOWN, MODE.OUT].includes(myMode()) && !(ctx.actor(ctx.me) && flagsOf.get(ctx.me) & F.STUN);
  const flagsOf = new Map();
  function localHayNow() { if (swungLocal || holdT < RULES.hayMin || !free() || myPuff() < RULES.hay.cost) return; swungLocal = true; localHay = performance.now(); ctx.actor(ctx.me)?.play('throw', 520); }

  return {
    state(g) {
      F_ = g.f; standingN = 0;
      const pts = {};
      for (const [k, row] of Object.entries(g.f)) {
        const id = +k, [hp, pf, downs, mode] = row; if (mode !== MODE.OUT) standingN++;
        if (id >= 0) { pts[id] = row[4]; const mk = marks.get(id); const s = '✕'.repeat(downs) + '○'.repeat(Math.max(0, RULES.downs - downs)); if (mk && mk.textContent !== s) mk.textContent = s; bar.mark(id, 'out', mode === MODE.OUT); }
        const M = meters.get(id); if (!M) continue;
        const key = hp + ',' + pf + ',' + mode; if (M.last === key) continue; M.last = key;
        M.hp.style.width = Math.max(0, Math.min(100, hp)) + '%'; M.pf.style.width = Math.max(0, Math.min(100, pf)) + '%';
        M.e.classList.toggle('low', hp <= 30); M.e.classList.toggle('tired', pf < RULES.jab.cost); M.e.classList.toggle('gone', mode === MODE.OUT);
      }
      bar.set(pts, g.left);
      if (g.cpu) { const [x, z, yaw, flags, sp] = g.cpu; Object.assign(cpuPos, { tx: x, tz: z, tyaw: yaw, flags, v: sp }); if (!cpuPos.seen) { cpuPos.x = x; cpuPos.z = z; cpuPos.yaw = yaw; cpuPos.seen = true; } }
    },
    event(ev) {
      const a = actorOf(ev.id), mine = ev.id === ctx.me, now = performance.now();
      if (ev.e === 'jab') { if (!(mine && now - localJab < 450)) a?.play('punch', 320); if (!mine) ctx.sfx('tap'); }
      else if (ev.e === 'hay') { if (!(mine && now - localHay < 700)) a?.play('throw', 520); ctx.sfx('throw'); }
      else if (ev.e === 'hit') {
        const big = ev.k === 'hay', by = SEATS[ctx.players.find(p => p.pid === ev.by)?.seat ?? -1]?.color || '#ffd23f';
        burst(ev.x, ev.z, '#ffffff', big ? 1.6 : 1); burst(ev.x, ev.z, by, big ? 1.1 : 0.7);
        floatText(stage, ev.x, 1.9, ev.z, big ? POW[(ev.dmg + ev.id) % POW.length] : '+1', big ? 'good' : '');
        ctx.sfx('hit'); a?.play('hit', big ? 520 : 260); if (big) { quake = Math.max(quake, 0.25); cheer = 1; }
        if (mine && 'vibrate' in navigator) try { navigator.vibrate(big ? 70 : 25); } catch { /* not allowed */ }
      }
      else if (ev.e === 'block') { burst(ev.x, ev.z, '#9ad8ff', ev.big ? 1 : 0.6); ctx.sfx('tap'); if (ev.big) floatText(stage, ev.x, 1.9, ev.z, 'Blocked!', ''); }
      else if (ev.e === 'break') { ctx.sfx('bad'); const p = posOf(ev.id); if (p) floatText(stage, p.x, 2.1, p.z, 'Guard broken!', 'bad'); }
      else if (ev.e === 'down') { quake = 0.45; cheer = 1.5; ctx.sfx('out'); show(mine ? 'You\'re down! Get up!' : `KNOCKDOWN! ${ev.n}/${RULES.downs}`, mine ? 'bad' : '', 1500); }
      else if (ev.e === 'out') { quake = 0.5; cheer = 2; ctx.sfx('out'); show(mine ? 'Knocked out!' : `${nameOf(ev.id)} is out!`, mine ? 'bad' : 'good', 1800); }
      else if (ev.e === 'up') { if (mine) ctx.sfx('pick'); }
      else if (ev.e === 'dodge') { if (mine) ctx.sfx('tap'); }
      else if (ev.e === 'puff') { if (mine) { show('Out of puff!', 'small', 800); ctx.sfx('bad'); } }
      else if (ev.e === 'rope') { shake[ev.side] = 1; ctx.sfx('trap'); }
      else if (ev.e === 'whiff') { if (mine) ctx.sfx('tap'); }
    },
    input(inp) {
      const now = performance.now(), pa = (inp.b & 1) && !(lastBits & 1);
      if (!(lastBits & 1) && (inp.b & 1)) { holdT = 0; swungLocal = false; }
      if (inp.b & 1) holdT += 0.05;
      lastBits = inp.b; lastInputAt = now;
      if (pa && free() && myPuff() >= RULES.jab.cost && myMode() !== MODE.SWING) { localJab = now; ctx.actor(ctx.me)?.play('punch', 320); ctx.sfx('tap'); }
      if ((inp.b & 1) && holdT >= RULES.hayFull) localHayNow();
    },
    pose(pid, flags) {
      flagsOf.set(pid, flags);
      const mode = F_[pid]?.[3];
      if (mode === MODE.OUT || mode === MODE.DOWN) return 'dead';
      if (flags & F.STUN) return 'hit';
      if (standingN === 1 && mode != null) return 'cheer';
      if (mode === MODE.BLOCK) return 'guard';
      if (mode === MODE.CHARGE) return 'ready';
      return undefined;
    },
    frame(dt, t) {
      // a let-go of A that view.input never sees (it is only called while a button is down)
      if ((lastBits & 1) && performance.now() - lastInputAt > 80) { localHayNow(); lastBits = 0; holdT = 0; }
      else if (performance.now() - lastInputAt > 80) lastBits = 0;
      if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) banner.classList.remove('show'); }
      // CPU
      if (cpu && cpuPos.seen) {
        const k = 1 - Math.exp(-dt * 14); cpuPos.x += (cpuPos.tx - cpuPos.x) * k; cpuPos.z += (cpuPos.tz - cpuPos.z) * k;
        let d = cpuPos.tyaw - cpuPos.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); cpuPos.yaw += d * Math.min(1, dt * 14);
        cpu.place(cpuPos.x, 0, cpuPos.z, cpuPos.yaw); cpu.setSpeed(cpuPos.flags & (F.STUN | F.FROZEN | F.OUT) ? 0 : cpuPos.v);
        const mode = F_[-1]?.[3]; cpu.setPose(mode === MODE.OUT || mode === MODE.DOWN ? 'dead' : cpuPos.flags & F.STUN ? 'hit' : standingN === 1 && mode != null ? 'cheer' : mode === MODE.BLOCK ? 'guard' : mode === MODE.CHARGE ? 'ready' : 'idle');
        cpu.update(dt); flagsOf.set(-1, cpuPos.flags);
      }
      // blink while nothing can hit you (just up off the mat)
      for (const [id, fl] of flagsOf) { const a = actorOf(id); if (a) a.body.group.visible = !(fl & F.GHOST) || F_[id]?.[3] === MODE.DODGE || Math.floor(t * 10) % 2 === 0; }
      // meters follow their boxer's feet
      for (const [id, M] of meters) { const p = posOf(id); if (!p) { M.e.style.display = 'none'; continue; } const s = stage.toScreen(p.x, 0, p.z + 0.5); M.e.style.display = ''; M.e.style.transform = `translate(-50%, 0) translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`; }
      // ropes wobble, the ring shakes, the crowd bobs
      for (const side of ['n', 's', 'e', 'w']) { if (shake[side] <= 0) continue; shake[side] = Math.max(0, shake[side] - dt * 2.2); const off = Math.sin(t * 40) * 0.12 * shake[side]; for (const r of ropes[side]) { r.position.copy(r.userData.base); if (side === 'n' || side === 's') r.position.z += off; else r.position.x += off; } }
      if (quake > 0) { quake = Math.max(0, quake - dt); const s = quake * 0.35; world.position.set(Math.sin(t * 61) * s, 0, Math.cos(t * 53) * s); } else world.position.set(0, 0, 0);
      cheer = Math.max(0, cheer - dt * 0.6);
      for (let i = 0; i < CN; i++) {
        const c = crowd[i], hop = Math.max(0, Math.sin(t * (4 + cheer * 6) + c.ph)) * (0.06 + cheer * 0.25);
        m4.compose(v.set(c.x, c.y + 0.45 + hop, c.z), q.identity(), sc.setScalar(1)); crowdB.setMatrixAt(i, m4);
        m4.compose(v.set(c.x, c.y + 1.12 + hop, c.z), q.identity(), sc.setScalar(1)); crowdH.setMatrixAt(i, m4);
      }
      crowdB.instanceMatrix.needsUpdate = crowdH.instanceMatrix.needsUpdate = true;
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt * 4; f.m.scale.setScalar((0.5 + f.t * 1.4) * f.m.userData.size); f.m.material.opacity = Math.max(0, 1 - f.t); f.m.rotation.z += dt * 4; if (f.t >= 1) { group.remove(f.m); f.m.material.dispose(); fx.splice(i, 1); } }
    },
    dispose() {
      bar.el.remove(); banner.remove(); for (const M of meters.values()) M.e.remove(); cpuTag?.remove();
      for (const g of gloves) g.removeFromParent();
      for (const m of gloveMats) m.dispose(); gloveGeo.dispose();
      for (const id of ids) { const a = actorOf(id); if (a) a.body.group.visible = true; }
    },
  };
}
