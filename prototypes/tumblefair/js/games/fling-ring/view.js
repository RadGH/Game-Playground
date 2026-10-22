// FLING RING, as drawn: a deck floating on open water, seen from high above. The raft is a plank disc that shrinks
// (its top is scaled to the server's radius, state.r); the carousel is a striped turntable turned to state.a with a
// padded sweeper bar at state.sw; the pier is built from half-metre planks with the gaps left out, and two barrels
// roll along it. Everyone wobbles a little all the time. A lifted player lies across their carrier's raised arms; a
// flung one spins. When you are carrying, a power bar fills (let go to throw); when you are carried, a big
// "MASH!" prompt counts your wriggles. Alone, Bumbles (straw-stuffed sparring dummies) wander on to be thrown.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const D = init.deck, T = D.theme, A = ctx.arena;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  // ---- water and buoys
  const water = new THREE.Mesh(new THREE.CircleGeometry(80, 40).rotateX(-Math.PI / 2), std(T.water, { roughness: 0.3, metalness: 0.1 }));
  water.position.y = -1.6; group.add(water);
  const NBU = 16, buoys = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 10, 6), std('#ffffff'), NBU);
  for (let i = 0; i < NBU; i++) { const a = i / NBU * Math.PI * 2, r = 12.5 + (i % 3) * 1.5; m4.compose(v.set(Math.sin(a) * r, -1.45, Math.cos(a) * r), q.identity(), sc.setScalar(1)); buoys.setMatrixAt(i, m4); buoys.setColorAt(i, col.set(T.flags[i % T.flags.length])); }
  group.add(buoys);
  // ---- the deck
  const deck = new THREE.Group(); group.add(deck);
  let sweeper = null, barrels = [];
  if (A.shape === 'circle') {
    const r0 = A.r;
    const tex = canvasTexture(512, 512, (g, w, hh) => {
      g.fillStyle = T.floor; g.fillRect(0, 0, w, hh);
      if (D.spin) { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? T.floor : T.plank; g.beginPath(); g.moveTo(w / 2, hh / 2); g.arc(w / 2, hh / 2, w / 2, i / 16 * Math.PI * 2, (i + 1) / 16 * Math.PI * 2); g.fill(); } g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w / 2, hh / 2, w * 0.1, 0, 7); g.fill(); }
      else { g.strokeStyle = T.plank; g.lineWidth = 6; for (let x = 0; x < w; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); } g.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 40; i++) g.fillRect((i * 97) % w, (i * 53) % hh, 14, 4); }
    });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(r0, r0, 0.7, 56), [std(T.rim), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), std(T.rim)]);
    top.position.y = -0.35; top.receiveShadow = true; deck.add(top);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r0, 0.12, 6, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff5f5f' })); rim.position.y = 0.02; deck.add(rim);
    if (D.sweeper) {
      const sw = D.sweeper, bar = new THREE.Group();
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, sw.len - 0.6).translate(0, 0.45, (sw.len - 0.6) / 2 + 0.6), std('#ffd23f', { roughness: 0.5 }));
      const stripes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.58, 0.62, 0.35), std('#ff3b3b'), 6);
      for (let i = 0; i < 6; i++) { m4.compose(v.set(0, 0.45, 1.1 + i * (sw.len - 1.4) / 5), q.identity(), sc.setScalar(1)); stripes.setMatrixAt(i, m4); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.9, 20), std('#ffffff')); hub.position.y = 0.45;
      pad.castShadow = true; bar.add(pad, stripes, hub); group.add(bar); sweeper = bar;
    }
  } else {
    const holes = A.holes || [], inHole = (x, z) => holes.some(o => Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd);
    const nx = Math.round(A.hw * 4), nz = Math.round(A.hd * 4), list = [];
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) { const x = -A.hw + 0.25 + i * 0.5, z = -A.hd + 0.25 + k * 0.5; if (!inHole(x, z)) list.push([x, z, i, k]); }
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), std('#ffffff'), list.length);
    list.forEach(([x, z, i, k], n) => { m4.compose(v.set(x, -0.25 - ((i * 7 + k * 3) % 5) * 0.004, z), q.identity(), sc.setScalar(1)); tiles.setMatrixAt(n, m4); tiles.setColorAt(n, col.set((k >> 1) % 2 ? T.floor : T.plank).offsetHSL(0, 0, (((i >> 3) * 7 + k) % 5 - 2) * 0.012)); });   // planks run along x, two rows to a board
    tiles.receiveShadow = true; deck.add(tiles);
    // posts under the pier, and red-and-white edging round each gap so it reads as a hole
    const edge = new THREE.MeshBasicMaterial({ color: '#ff5f5f' });
    for (const o of holes) for (const [w, d, x, z] of [[o.hw * 2, 0.08, o.x, o.z - o.hd], [o.hw * 2, 0.08, o.x, o.z + o.hd], [0.08, o.hd * 2, o.x - o.hw, o.z], [0.08, o.hd * 2, o.x + o.hw, o.z]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), edge); m.position.set(x, 0.02, z); deck.add(m); }
    const NP = 12, piles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.25, 2, 8), std(T.rim), NP);
    for (let i = 0; i < NP; i++) { m4.compose(v.set(-A.hw + 0.4 + (i % 6) * (A.hw * 2 - 0.8) / 5, -1.2, i < 6 ? -A.hd + 0.4 : A.hd - 0.4), q.identity(), sc.setScalar(1)); piles.setMatrixAt(i, m4); }
    deck.add(piles);
    const bGeo = new THREE.CylinderGeometry(0.75, 0.75, 1.4, 16).rotateX(Math.PI / 2), bMat = std('#8a5a2a'), hoop = new THREE.TorusGeometry(0.76, 0.06, 6, 18);
    for (const bz of init.barrelZ || []) {
      const b = new THREE.Group(); const body = new THREE.Mesh(bGeo, bMat); body.castShadow = true; b.add(body);
      for (const z of [-0.45, 0.45]) { const hp = new THREE.Mesh(hoop, std('#333')); hp.position.z = z; b.add(hp); }
      b.position.set(0, 0.75, bz); group.add(b); barrels.push(b);
    }
  }
  // ---- Bumbles (solo): Chibi characters in sparring gear, three looks
  const dummies = new Map();
  function addDummy(id) {
    const r = { id, a: null, to: [0, 0, 0, 0], flags: 0, wind: 0, tag: null };
    dummies.set(id, r);
    ctx.createActor({ look: { race: ['halfling', 'dwarf', 'human'][id % 3], seed: 7000 + (id % 3) }, costume: 'cos_monk' }, { scale: 0.9 }).then(a => {
      if (!a) return; if (!dummies.has(id)) { a.dispose(); return; }
      r.a = a; a.place(r.to[0], r.to[2], r.to[1], r.to[3]);
      for (const o of a.group.children) if (o.isMesh) o.material.color.set('#4a3a20'); a.setRing(true);
    });
    return r;
  }
  function dropDummy(r) { r.a?.dispose(); r.tag?.remove(); dummies.delete(r.id); }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: init.solo ? 'tossed' : 'KOs' });
  const hearts = new Map();
  for (const p of ctx.players) { const c = bar.el.querySelector(`[data-pid="${p.pid}"]`); const e = document.createElement('i'); e.className = 'sb-lives'; c?.querySelector('.nm')?.after(e); hearts.set(p.pid, e); }
  const power = h('div', 'fr-power', '<span>Let go to throw!</span><i><b></b></i>'); power.hidden = true;
  const mash = h('div', 'fr-mash', '<b>MASH!</b><span></span>'); mash.hidden = true;
  ctx.ui.append(power, mash);
  const powerFill = power.querySelector('b'), mashCount = mash.querySelector('span');
  const banner = (text, ms = 1600) => { const b = h('div', 'banner fx fr-banner'); b.textContent = text; ctx.ui.append(b); setTimeout(() => b.remove(), ms); };
  const name = k => { const pid = k?.[0] === 'p' ? +k.slice(1) : null; return pid == null ? 'A Bumble' : pid === ctx.me ? 'You' : ctx.players.find(p => p.pid === pid)?.name || '?'; };
  const actorOf = k => (k?.[0] === 'p' ? ctx.actor(+k.slice(1)) : dummies.get(+k?.slice(1))?.a) || null;
  const myKey = ctx.me != null ? 'p' + ctx.me : null;
  let carriers = new Map(), carried = new Set(), grabAt = 0, lastG = null, shrinkSaid = false, prevBits = 0, lastIn = 0;
  const flagsOf = new Map(), spin = new Map();

  return {
    start() { banner(D.name, 1600); },
    input(inp) {
      const now = performance.now(); if (now - lastIn > 90) prevBits = 0; lastIn = now;
      const bits = inp.b | 0, pa = (bits & IN.A) && !(prevBits & IN.A), pb = (bits & IN.B) && !(prevBits & IN.B); prevBits = bits;
      const me = ctx.actor(ctx.me), f = flagsOf.get(ctx.me) || 0;
      if (!me || carried.has(myKey)) { if ((pa || pb) && carried.has(myKey)) mash.classList.toggle('bump'); return; }
      if (f & (F.STUN | F.OUT | F.GHOST)) return;
      if (pa && !carriers.has(myKey)) me.play('throw', 260);              // reach out to grab
      else if (pb && !carriers.has(myKey)) me.play('punch', 300);         // the shove
    },
    state(g) {
      lastG = g;
      carriers = new Map(g.c); carried = new Set(g.c.map(r => r[1]));
      for (const p of ctx.players) { const n = g.lv[p.pid] ?? 0, e = hearts.get(p.pid), txt = '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, RULES.lives - n)); if (e && e.textContent !== txt) e.textContent = txt; bar.mark(p.pid, 'out', n <= 0); }
      if (g.d) {
        const seen = new Set();
        for (const [id, x, z, y, yaw, flags, wind] of g.d) { seen.add(id); const r = dummies.get(id) || addDummy(id); r.to = [x, z, y, yaw]; r.flags = flags; r.wind = wind; }
        for (const r of [...dummies.values()]) if (!seen.has(r.id)) dropDummy(r);
      }
      const mine = carried.has(myKey);
      mash.hidden = !mine; if (mine) mashCount.textContent = `${g.es?.[ctx.me] || 0} / ${RULES.escape}`;
      power.hidden = !carriers.has(myKey);
      if (g.r != null && D.shrink && !shrinkSaid && g.r < D.shrink.from - 0.05) { shrinkSaid = true; banner('The raft is shrinking!', 1400); }
      bar.set(g.sc, g.left);
    },
    event(ev) {
      const a = actorOf(ev.k);
      if (ev.e === 'grab') { ctx.sfx('pick'); if (ev.k === myKey) grabAt = performance.now(); if (ev.t === myKey) navigator.vibrate?.(80); }
      else if (ev.e === 'throw') { if (a) a.play('throw', 380); ctx.sfx('throw'); spin.set(ev.t, 0.001); }
      else if (ev.e === 'whiff') { if (ev.k !== myKey) a?.play('throw', 260); }
      else if (ev.e === 'shove') { if (ev.k !== myKey) a?.play('punch', 300); if (ev.t) { ctx.sfx('hit'); floatText(stage, ev.x, 1.4, ev.z, 'Oof!', ''); } }
      else if (ev.e === 'bowl' || ev.e === 'bonk') { ctx.sfx('hit'); floatText(stage, ev.x, 1.4, ev.z, ev.e === 'bowl' ? 'Strike!' : 'Bonk!', 'good'); }
      else if (ev.e === 'land') { spin.delete(ev.k); }
      else if (ev.e === 'escape') { if (ev.t === myKey) ctx.sfx('good'); const p = ev.t[0] === 'p' ? ctx.pos(+ev.t.slice(1)) : null; if (p) floatText(stage, p.x, 2, p.z, 'Free!', 'good'); }
      else if (ev.e === 'fall') {
        ctx.sfx('out'); spin.delete(ev.k);
        const R = (lastG?.r ?? (A.r || A.hw)) + 1, x = Math.max(-R, Math.min(R, ev.x)), z = Math.max(-R, Math.min(R, ev.z));
        floatText(stage, x, 0.6, z, ev.k[0] === 'd' ? '+1' : ev.by != null ? `KO! ${name('p' + ev.by)}` : 'Splash!', ev.by != null ? 'good' : 'bad');
      }
      else if (ev.e === 'back') { if (ev.k === myKey) ctx.sfx('pick'); }
      else if (ev.e === 'tell') { const r = dummies.get(+ev.k.slice(1)); r?.a?.play('ready', 600); }
    },
    pose(pid, flags, b) {
      flagsOf.set(pid, flags);
      const k = 'p' + pid;
      if (carried.has(k)) return 'hit';
      if (carriers.has(k)) return 'cheer';
      if (flags & (F.STUN | F.AIR) || b.y < -0.05) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      const g = lastG;
      if (g) {
        if (g.r != null) { const s = g.r / A.r; deck.scale.set(s, 1, s); }
        if (g.a != null) deck.rotation.y += (g.a - deck.rotation.y) * Math.min(1, dt * 12);
        if (sweeper && g.sw != null) { let d = g.sw - sweeper.rotation.y; sweeper.rotation.y += d * Math.min(1, dt * 14); }
        if (g.br) g.br.forEach((x, i) => { const b = barrels[i]; if (!b) return; const dx = (x - b.position.x) * Math.min(1, dt * 14); b.position.x += dx; b.rotation.z -= dx / 0.75; });
      }
      const k = 1 - Math.exp(-dt * 16);
      for (const r of dummies.values()) {
        const a = r.a; if (!a) continue; const [x, z, y, yaw] = r.to, p = a.group.position, px = p.x, pz = p.z;
        p.x += (x - p.x) * k; p.z += (z - p.z) * k; p.y += (y - p.y) * k;
        let d = yaw - a.body.group.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); a.body.group.rotation.y += d * Math.min(1, dt * 10);
        const key = 'd' + r.id, held = carried.has(key);
        a.setSpeed(r.flags & F.STUN || held ? 0 : Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 1e-3));
        a.setPose(held || r.flags & (F.STUN | F.AIR) ? 'hit' : r.wind ? 'ready' : 'idle');
        a.update(dt);
        a.body.group.visible = !(r.flags & F.GHOST) || Math.floor(t * 10) % 2 === 0;
        if (r.wind && !r.tag) r.tag = stage.tag(a.group, { text: '!', cls: 'fr-warn', height: 1.7 }); if (!r.wind && r.tag) { r.tag.remove(); r.tag = null; }
      }
      // wobble everyone; a lifted body lies flat across the arms; a flung one tumbles
      const wob = (key, a, i) => {
        const bg = a.body.group;
        if (carried.has(key)) { bg.rotation.x = -1.35; bg.rotation.z = Math.sin(t * 14 + i) * 0.25; return; }
        if (spin.has(key)) { const s = spin.get(key) + dt * 11; spin.set(key, s); bg.rotation.x = -s; bg.rotation.z = 0; return; }
        bg.rotation.x *= 0.8; bg.rotation.z = Math.sin(t * 6.5 + i * 1.7) * (a.speed > 0.6 ? 0.12 : 0.05);
      };
      ctx.players.forEach((p, i) => { const a = ctx.actor(p.pid); if (!a) return; wob('p' + p.pid, a, i); const f = flagsOf.get(p.pid) || 0; a.body.group.visible = !(f & F.GHOST) || Math.floor(t * 10) % 2 === 0; });
      for (const r of dummies.values()) if (r.a) wob('d' + r.id, r.a, r.id);
      if (!power.hidden) powerFill.style.width = Math.min(100, (performance.now() - grabAt) / (RULES.fullHold * 1000) * 100) + '%';
    },
    dispose() { bar.el.remove(); for (const r of [...dummies.values()]) dropDummy(r); },
  };
}
