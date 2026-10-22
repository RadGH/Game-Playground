// CASTLE DEFENSE, as drawn: a cardboard fair castle seen from inside its courtyard — a sandy yard with a crenellated
// wall of painted cardboard across the top of the screen (three stretches, each with a health bar; a broken one is a
// pile of rubble with a gap), two chunky cannons on it, a crate pile of cannonballs on the left and a stack of planks
// on the right. Beyond the wall a grassy field where the creatures waddle up: green wobbly blobs, little purple
// hoppers that bounce, big orange stompers with horns — all googly-eyed. A manned cannon shows a dotted aiming line in
// its gunner's colour. HUD: score chips, the wave, the keep's hearts, and on your phone a line saying what your hands
// are doing and what A does here.
import { segOf } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx, A = ctx.arena, hw = A.hw;
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  ctx.camera({ cx: 0, cz: -5.3, hw: 7.8, hd: 8.6 }, { instant: true });
  // ---- ground: yard, field, path
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2 + 1, A.hd * 2 + 1).rotateX(-Math.PI / 2), std('#e3c48f')); yard.receiveShadow = true; yard.position.y = 0.005; group.add(yard);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(60, 50).rotateX(-Math.PI / 2), std('#73c25a')); field.position.set(0, -0.01, -8); field.receiveShadow = true; group.add(field);
  const tufts = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.35, 4), std('#4f9e3c'), 60);
  for (let i = 0; i < 60; i++) { m4.compose(v.set(((i * 7.31) % 18) - 9, 0.15, -4.5 - ((i * 3.77) % 12)), q.identity(), sc.setScalar(0.7 + (i % 3) * 0.3)); tufts.setMatrixAt(i, m4); }
  group.add(tufts);
  // ---- the wall: three stretches of cardboard with crenels, a health bar each; towers at the ends
  const card = canvasTexture(128, 64, (g, w, H) => { g.fillStyle = '#c99a5b'; g.fillRect(0, 0, w, H); g.strokeStyle = '#a7773d'; g.lineWidth = 3; for (let y = 8; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x + (x / 32 % 2) * 16, 0); g.lineTo(x + (x / 32 % 2) * 16, H); g.stroke(); } });
  card.wrapS = card.wrapT = THREE.RepeatWrapping; card.repeat.set(2, 1);
  const wallMat = std('#ffffff', { map: card }), rubbleMat = std('#9c7444', { flatShading: true }), segW = init.segW, WZ = -3.35;
  const segs = [0, 1, 2].map(s => {
    const x = -hw + (s + 0.5) * segW, g = new THREE.Group(); g.position.set(x, 0, WZ); group.add(g);
    const wall = new THREE.Group(); g.add(wall);
    const body = new THREE.Mesh(new THREE.BoxGeometry(segW - 0.05, 0.7, 0.55), wallMat); body.position.y = 0.35; body.castShadow = true; wall.add(body);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.55), wallMat); c.position.set(-segW / 2 + 0.4 + i * (segW - 0.8) / 3, 0.87, 0); c.castShadow = true; wall.add(c); }
    const rubble = new THREE.Group(); rubble.visible = false; g.add(rubble);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.08, 0), rubbleMat); r.position.set(-segW / 2 + 0.3 + i * (segW - 0.6) / 5, 0.2, (i % 2 ? 0.25 : -0.2)); r.rotation.set(i, i * 2, 0); rubble.add(r); }
    const barBg = new THREE.Mesh(new THREE.BoxGeometry(segW * 0.72, 0.34, 0.06), new THREE.MeshBasicMaterial({ color: '#2b1d0e' })); barBg.position.set(0, 1.55, 0.3); barBg.rotation.x = -0.6; g.add(barBg);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(segW * 0.68, 0.24, 0.08), new THREE.MeshBasicMaterial({ color: '#4cc26a' })); fill.position.set(0, 1.55, 0.33); fill.rotation.x = -0.6; g.add(fill);
    return { g, wall, rubble, fill, hp: -1, shake: 0 };
  });
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 2.4, 10), wallMat); t.position.set(sx * (hw + 0.6), 1.2, WZ); t.castShadow = true; group.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.1, 10), std('#d7263d')); roof.position.set(sx * (hw + 0.6), 2.95, WZ); group.add(roof);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.35), new THREE.MeshBasicMaterial({ color: '#ffd23f', side: THREE.DoubleSide })); flag.position.set(sx * (hw + 0.6) + 0.3, 3.7, WZ); group.add(flag);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5), std('#333')); pole.position.set(sx * (hw + 0.6), 3.55, WZ); group.add(pole);
  }
  // side fences of the yard
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, A.hd * 2 + 0.5), wallMat); f.position.set(sx * (hw + 0.2), 0.35, 0); group.add(f); }
  // ---- cannons with their ammo, and the aiming line
  const ironMat = std('#3b3f4a', { metalness: 0.5, roughness: 0.4 }), woodMat = std('#8a5a34'), ballGeo = new THREE.SphereGeometry(0.14, 10, 8);
  const cannons = init.cannons.map((x, i) => {
    const g = new THREE.Group(); g.position.set(x, 0, -2.75); group.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.8), woodMat); base.position.y = 0.25; base.castShadow = true; g.add(base);
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 12).rotateZ(Math.PI / 2), woodMat); w.position.set(sx * 0.5, 0.3, 0); g.add(w); }
    const turn = new THREE.Group(); turn.position.y = 0.65; g.add(turn);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 1.3, 14).rotateX(-(Math.PI / 2 - 0.25)), ironMat); barrel.position.z = -0.4; barrel.castShadow = true; turn.add(barrel);
    const pile = new THREE.InstancedMesh(ballGeo, ironMat, init.maxAmmo);
    for (let k = 0; k < init.maxAmmo; k++) { m4.compose(v.set((k % 3 - 1) * 0.3 + (i ? 0.9 : -0.9), 0.14 + Math.floor(k / 3) * 0.24, 0.55), q.identity(), sc.setScalar(1)); pile.setMatrixAt(k, m4); }
    pile.count = 0; g.add(pile);
    const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.14, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), 14);
    dots.count = 0; group.add(dots);
    const tag = stage.tag(turn, { text: '', height: 0.9, cls: 'cd-ammo' });
    return { x, g, turn, pile, dots, tag, aim: 0, want: 0, man: -1, ammo: -1 };
  });
  // ---- the two piles
  const crateMat = std('#b07a4a', { flatShading: true }), plankMat = std('#d9a066');
  const ammoPile = new THREE.Group(); ammoPile.position.set(init.piles.ammo.x, 0, init.piles.ammo.z); group.add(ammoPile);
  for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.6), crateMat); c.position.set((k - 1) * 0.45, 0.22 + (k === 1 ? 0.45 : 0), k === 1 ? 0 : 0.1); c.castShadow = true; ammoPile.add(c); }
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(ballGeo, ironMat); b.position.set(-0.2 + k * 0.14, 0.98, 0); ammoPile.add(b); }
  const plankPile = new THREE.Group(); plankPile.position.set(init.piles.plank.x, 0, init.piles.plank.z); group.add(plankPile);
  for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.3), plankMat); p.position.set(0, 0.08 + k * 0.13, (k % 2) * 0.12 - 0.06); p.rotation.y = (k % 2 ? 0.15 : -0.1); p.castShadow = true; plankPile.add(p); }
  const pileTags = [stage.tag(ammoPile, { text: 'AMMO', height: 1.3, cls: 'cd-pile' }), stage.tag(plankPile, { text: 'PLANKS', height: 1.0, cls: 'cd-pile' })];
  // ---- what players carry
  const carryGeo = { ammo: new THREE.BoxGeometry(0.45, 0.35, 0.45), plank: new THREE.BoxGeometry(1.2, 0.1, 0.28) };
  const carried = new Map();
  function setCarry(pid, kind) {
    const c = carried.get(pid); if ((c?.kind || '') === kind) return;
    const a = ctx.actor(pid); if (!a) return;
    c?.m.removeFromParent(); carried.delete(pid);
    if (!kind) return;
    const m = new THREE.Mesh(carryGeo[kind], kind === 'ammo' ? crateMat : plankMat); m.position.set(0, 1.0, 0.4); m.castShadow = true; a.body.group.add(m); carried.set(pid, { kind, m });
  }
  // ---- creatures: one instanced body per kind, shared googly eyes
  const KIND_LOOK = { blob: { color: '#5bd46a', sy: 0.85 }, hop: { color: '#a46bff', sy: 1 }, stomp: { color: '#ff8a3d', sy: 0.95 } };
  const MAXF = 60, bodyGeo = new THREE.SphereGeometry(1, 14, 10);
  const foeMesh = Object.fromEntries(Object.entries(KIND_LOOK).map(([k, L]) => { const m = new THREE.InstancedMesh(bodyGeo, std(L.color, { roughness: 0.5 }), MAXF); m.count = 0; m.castShadow = true; group.add(m); return [k, m]; }));
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), std('#ffffff', { roughness: 0.3 }), MAXF * 2), pupils = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), std('#111111'), MAXF * 2);
  const horns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.4, 6), std('#fff1d6'), MAXF * 2);
  eyes.count = pupils.count = horns.count = 0; group.add(eyes, pupils, horns);
  const foes = new Map();   // id -> { k, x, z, tx, tz, at, hp, flash, seen }
  // ---- balls in flight, puffs
  const flyMesh = new THREE.InstancedMesh(ballGeo, ironMat, 24); flyMesh.count = 0; group.add(flyMesh);
  let flying = [];
  const puffs = [], puffGeo = new THREE.IcosahedronGeometry(0.5, 0);
  function puff(x, z, color = '#ffffff', y = 0.6, s = 1) { const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); p.position.set(x, y, z); group.add(p); puffs.push({ p, t: 0, s }); }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' }), hud = h('div', 'cd-hud'), job = h('div', 'cd-job'), banner = h('div', 'cd-banner');
  hud.innerHTML = `<span class="cd-wave">Wave <b>0</b>/${init.waves}</span><span class="cd-hearts" aria-label="castle hearts"></span>`;
  ctx.ui.append(hud, job, banner);
  if (ctx.me == null) job.style.display = 'none';
  const waveEl = hud.querySelector('.cd-wave b'), heartsEl = hud.querySelector('.cd-hearts');
  const showBanner = (text, cls = '', ms = 1400) => { banner.textContent = text; banner.className = 'cd-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'cd-banner'; }, ms); };
  const name = pid => pid === ctx.me ? 'You' : (ctx.player(pid)?.name || '?');
  let last = null, jobKey = '';
  function jobText(g) {
    const me = ctx.me, p = ctx.pos(me); if (!p) return ['', ''];
    const carry = g.carry[me], ci = g.c.findIndex(c => c[2] === me);
    if (ci >= 0) { const n = g.c[ci][0]; return n ? [`Cannon: aim with the stick, A to fire (${n} ball${n === 1 ? '' : 's'}). B to step off.`, 'go'] : ['Out of ammo! B to step off and fetch a crate (or shout for one).', 'warn']; }
    const nearSeat = init.cannons.findIndex(x => Math.hypot(p.x - x, p.z - init.seatZ) < 1.2);
    if (carry === 'ammo') return nearSeat >= 0 ? ['A: load the cannon (+3 balls)', 'go'] : ['Carrying AMMO: take it to a cannon.', ''];
    if (carry === 'plank') { const s = segOf(p.x); return p.z < -1.65 ? (g.segs[s] < 100 ? ['A: patch this wall!', 'go'] : ['This stretch is fine: find a damaged one.', '']) : ['Carrying a PLANK: take it to a damaged wall.', '']; }
    if (Math.hypot(p.x - init.piles.ammo.x, p.z - init.piles.ammo.z) < 1.6) return ['A: pick up an AMMO crate', 'go'];
    if (Math.hypot(p.x - init.piles.plank.x, p.z - init.piles.plank.z) < 1.6) return ['A: pick up a PLANK', 'go'];
    if (nearSeat >= 0 && g.c[nearSeat][2] < 0) return ['A: man the cannon', 'go'];
    if (p.z < -1.65) return ['A: bonk the creatures at the wall!', 'go'];
    const low = g.segs.findIndex(hp => hp < 40); const free = g.c.findIndex(c => c[2] < 0);
    return [low >= 0 ? 'A wall is cracking! Fetch a PLANK (right).' : free >= 0 ? 'Man a CANNON, or fetch AMMO (left).' : 'Fetch AMMO (left) for the gunners.', ''];
  }
  return {
    start() { showBanner('Defend the castle!'); },
    state(g) {
      last = g;
      bar.set(g.sc, g.left);
      if (waveEl.textContent !== String(g.wave)) waveEl.textContent = g.wave;
      const ht = '♥'.repeat(g.hearts) + '♡'.repeat(Math.max(0, init.hearts - g.hearts)); if (heartsEl.textContent !== ht) heartsEl.textContent = ht;
      for (const [pid, k] of Object.entries(g.carry)) setCarry(+pid, k);
      g.segs.forEach((hp, s) => { const S = segs[s]; if (S.hp === hp) return; if (hp < S.hp) S.shake = 0.25; S.hp = hp; const f = hp / 100; S.fill.scale.x = Math.max(0.001, f); S.fill.position.x = -(1 - f) * (segW * 0.68) / 2; S.fill.material.color.set(f > 0.6 ? '#4cc26a' : f > 0.3 ? '#ffd23f' : '#ff4d6d'); S.wall.visible = hp > 0; S.rubble.visible = hp <= 0; S.wall.scale.y = 0.55 + 0.45 * f; });
      g.c.forEach(([ammo, aim, man], i) => {
        const C = cannons[i]; C.want = aim;
        if (C.ammo !== ammo) { C.ammo = ammo; C.pile.count = ammo; C.tag.set(`${ammo} ball${ammo === 1 ? '' : 's'}`); C.tag.el.classList.toggle('empty', ammo === 0); }
        if (C.man !== man) { C.man = man; const p = man >= 0 ? ctx.player(man) : null; C.dots.material.color.set(p?.color || '#ffffff'); C.dots.count = man >= 0 ? 14 : 0; }
      });
      const seen = new Set();
      for (const [id, k, x, z, hp, at] of g.f) {
        seen.add(id); let f = foes.get(id);
        if (!f) { f = { k, x, z, tx: x, tz: z, hp, at, flash: 0, ph: id * 1.3 }; foes.set(id, f); }
        if (hp < f.hp) f.flash = 0.2;
        f.tx = x; f.tz = z; f.hp = hp; f.at = at;
      }
      for (const id of [...foes.keys()]) if (!seen.has(id)) foes.delete(id);
      flying = g.b;
      if (ctx.me != null) { const [t, cls] = jobText(g), k2 = t + cls; if (k2 !== jobKey) { jobKey = k2; job.textContent = t; job.className = 'cd-job ' + cls; job.hidden = !t; } }
      { const y = bar.el.offsetTop + bar.el.offsetHeight + 6; if (y > 20 && hud.dataset.y !== String(y)) { hud.dataset.y = y; hud.style.top = y + 'px'; } }
    },
    event(ev) {
      const mine = ev.pid === ctx.me, a = ev.pid != null ? ctx.actor(ev.pid) : null;
      if (ev.e === 'fire') { ctx.sfx('throw'); const C = cannons[ev.c]; C.kick = 0.25; puff(C.x + Math.sin(C.aim) * 1.1, -3.3 - Math.cos(C.aim) * 1.1, '#dddddd', 1.0, 0.6); }
      else if (ev.e === 'boom') { ctx.sfx('hit'); puff(ev.x, ev.z, '#ffe28a', 0.6, 1.4); }
      else if (ev.e === 'plop') puff(ev.x, ev.z, '#c9b38a', 0.2, 0.6);
      else if (ev.e === 'pop') { const f = foes.get(ev.id); puff(ev.x, ev.z, f ? KIND_LOOK[f.k].color : '#ffffff', 0.6, 1.2); floatText(stage, ev.x, 1.4, ev.z, ev.by != null ? `+${ev.k === 'stomp' ? 4 : 2} ${name(ev.by)}` : 'Pop!', 'good'); if (ev.by === ctx.me) ctx.sfx('good'); foes.delete(ev.id); }
      else if (ev.e === 'bonk') { a?.play('punch', 300); if (mine) ctx.sfx(ev.hit ? 'hit' : 'tap'); }
      else if (ev.e === 'man') { if (mine) ctx.sfx('pick'); }
      else if (ev.e === 'pick') { if (mine) ctx.sfx('pick'); a?.play('throw', 250); }
      else if (ev.e === 'load') { ctx.sfx(mine ? 'coins' : 'tap'); floatText(stage, cannons[ev.c].x, 1.6, -2.8, '+3 balls', 'good'); }
      else if (ev.e === 'fix') { ctx.sfx(mine ? 'good' : 'tap'); floatText(stage, -hw + (ev.s + 0.5) * segW, 1.8, WZ, ev.was ? 'Patched!' : 'Repaired!', 'good'); a?.play('punch', 300); }
      else if (ev.e === 'empty' || ev.e === 'full') { if (ev.to === ctx.me) { ctx.sfx('bad'); const p = ctx.pos(ctx.me); if (p) floatText(stage, p.x, 2.2, p.z, ev.e === 'empty' ? 'No ammo!' : 'Already full!', 'bad'); } }
      else if (ev.e === 'breach') { ctx.sfx('bad'); floatText(stage, -hw + (ev.s + 0.5) * segW, 1.8, WZ, 'The wall broke!', 'bad'); }
      else if (ev.e === 'slip') { ctx.sfx('out'); floatText(stage, -hw + (ev.s + 0.5) * segW, 1.2, WZ + 1, '-1 ♥', 'bad'); }
      else if (ev.e === 'wave') { showBanner(ev.w + 1 === init.waves ? 'Final wave!' : `Wave ${ev.w + 1}!`, '', 1200); ctx.sfx('trap'); }
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Castle held!' : 'The castle fell!', ev.ok ? 'win' : 'lose', 3000); ctx.sfx(ev.ok ? 'win' : 'out'); }
    },
    pose(pid, flags) { if (flags & F.FROZEN && last && last.c.some(c => c[2] === pid)) return 'ready'; return undefined; },
    frame(dt, t) {
      const k = 1 - Math.exp(-dt * 12);
      // cannons swing toward the server's aim; the aiming dots run out from the muzzle
      for (const C of cannons) {
        C.aim += (C.want - C.aim) * k; C.turn.rotation.y = -C.aim; C.kick = Math.max(0, (C.kick || 0) - dt); C.turn.position.z = C.kick * 0.6;
        if (C.dots.count) { const dx = Math.sin(C.aim), dz = -Math.cos(C.aim); for (let i = 0; i < 14; i++) { const d = 1.2 + i * 1.05 + ((t * 2) % 1.05); m4.compose(v.set(C.x + dx * d, 0.03, -3.3 + dz * d), q.identity(), sc.setScalar(1)); C.dots.setMatrixAt(i, m4); } C.dots.instanceMatrix.needsUpdate = true; }
      }
      for (const S of segs) { if (S.shake > 0) { S.shake -= dt; S.g.position.x = -hw + (segs.indexOf(S) + 0.5) * segW + Math.sin(t * 60) * 0.05 * (S.shake > 0 ? 1 : 0); } }
      // creatures
      const cnt = { blob: 0, hop: 0, stomp: 0 }; let ne = 0, nh = 0;
      for (const f of foes.values()) {
        f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k; f.flash = Math.max(0, f.flash - dt);
        const K = init.kinds[f.k], L = KIND_LOOK[f.k], r = K.r;
        const hop = f.k === 'hop' && !f.at ? Math.abs(Math.sin(t * 7 + f.ph)) * 0.5 : 0;
        const bash = f.at ? Math.max(0, Math.sin(t * 6 + f.ph)) * 0.18 : 0;
        const squish = 1 + Math.sin(t * 8 + f.ph) * 0.06 + f.flash;
        const y = r * L.sy + hop, z = f.z + bash;
        m4.compose(v.set(f.x, y, z), q.setFromEuler(e3.set(0, Math.sin(t * 2 + f.ph) * 0.2, 0)), sc.set(r * squish, r * L.sy / squish, r * squish)); foeMesh[f.k].setMatrixAt(cnt[f.k]++, m4);
        for (const sx of [-1, 1]) {
          const ex = f.x + sx * r * 0.38, ey = y + r * 0.35, ez = z + r * 0.8, es = r * 0.3;
          m4.compose(v.set(ex, ey, ez), q.identity(), sc.setScalar(es)); eyes.setMatrixAt(ne, m4);
          const look = Math.sin(t * 3 + f.ph + sx) * 0.4;
          m4.compose(v.set(ex + look * es * 0.4, ey + Math.cos(t * 2.3 + f.ph) * es * 0.3, ez + es * 0.75), q.identity(), sc.setScalar(es * 0.45)); pupils.setMatrixAt(ne, m4); ne++;
          if (f.k === 'stomp') { m4.compose(v.set(f.x + sx * r * 0.55, y + r * 0.85, z), q.setFromEuler(e3.set(0, 0, -sx * 0.5)), sc.setScalar(1.3)); horns.setMatrixAt(nh++, m4); }
        }
      }
      for (const [kk, m] of Object.entries(foeMesh)) { m.count = cnt[kk]; m.instanceMatrix.needsUpdate = true; }
      eyes.count = pupils.count = ne; horns.count = nh; eyes.instanceMatrix.needsUpdate = pupils.instanceMatrix.needsUpdate = horns.instanceMatrix.needsUpdate = true;
      // balls in flight (the server's last positions, nudged on along the cannon's line)
      flyMesh.count = Math.min(24, flying.length);
      for (let i = 0; i < flyMesh.count; i++) { const [, x, z] = flying[i]; m4.compose(v.set(x, 0.9, z), q.identity(), sc.setScalar(1.3)); flyMesh.setMatrixAt(i, m4); }
      flyMesh.instanceMatrix.needsUpdate = true;
      for (let i = puffs.length - 1; i >= 0; i--) { const P = puffs[i]; P.t += dt * 2.5; P.p.scale.setScalar((0.4 + P.t * 1.4) * P.s); P.p.material.opacity = Math.max(0, 0.9 - P.t); if (P.t >= 1) { group.remove(P.p); P.p.material.dispose(); puffs.splice(i, 1); } }
      if (ctx.me != null && last) { const [tx, cls] = jobText(last), k2 = tx + cls; if (k2 !== jobKey) { jobKey = k2; job.textContent = tx; job.className = 'cd-job ' + cls; job.hidden = !tx; } }
    },
    dispose() { bar.el.remove(); hud.remove(); job.remove(); banner.remove(); for (const C of cannons) C.tag.remove(); for (const T of pileTags) T.remove(); clearTimeout(showBanner.t); card.dispose(); },
  };
}
