// CANNONBALL CATCH, as drawn: a bright grass courtyard with a cobbled cross path and fat hedges down the sides, a
// toy castle (cream walls, round towers with red and blue cone roofs, flags) right behind the back edge, and a chunky
// cannon on a platform off each side. A ball in flight is a black iron sphere on a high arc; where it will land there
// is a white ring the size of the catch area, a dark shadow that grows, and a yellow disc that fills the ring as the
// ball comes down (a clock you can read at a glance). Big balls are bigger, with a red ring and a "x2" label.
// A catch throws a puff and "+1"; a miss bounces into the castle, which shakes and loses a heart.
import { RULES, CANNON_X } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';

const PEAK = 7.5;
export function createView(ctx) {
  const { THREE, group, stage, meta } = ctx;
  const { hw, hd } = meta.arena, CASTLE_Z = -hd - 1.25;            // its front wall is the back edge of the courtyard
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra });
  // ---- ground, courtyard, path, hedges
  const field = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#69c95a')); field.position.y = -0.02; field.receiveShadow = true; group.add(field);
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2), std('#8ee070')); yard.position.y = 0; yard.receiveShadow = true; group.add(yard);
  const stoneGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.08, 7), NS = 46, stones = new THREE.InstancedMesh(stoneGeo, std('#e9dcc0', { flatShading: true }), NS);
  for (let i = 0; i < NS; i++) {
    const across = i < 22, k = across ? i : i - 22, x = across ? -hw + 0.4 + k * (hw * 2 - 0.8) / 21 : (k % 2 ? 0.45 : -0.45), z = across ? (k % 2 ? 0.4 : -0.4) : -hd + 0.4 + k * (hd * 2 - 0.8) / 23;
    m4.compose(v.set(x, 0.02, z), q.setFromEuler(e3.set(0, i, 0)), sc.setScalar(0.8 + (i % 3) * 0.12)); stones.setMatrixAt(i, m4);
  }
  stones.receiveShadow = true; group.add(stones);
  const hedgeGeo = new THREE.BoxGeometry(1, 0.9, 1), hedgeN = 2 * 12 + 18, hedges = new THREE.InstancedMesh(hedgeGeo, std('#2f9e44', { roughness: 1 }), hedgeN);
  let hi = 0;
  for (const sx of [-1, 1]) for (let k = 0; k < 12; k++) { m4.compose(v.set(sx * (hw + 0.55), 0.45, -hd + 0.45 + k * (hd * 2 - 0.9) / 11), q.identity(), sc.set(1, 1 + (k % 2) * 0.12, 1)); hedges.setMatrixAt(hi++, m4); }
  for (let k = 0; k < 18; k++) { if (k === 8 || k === 9) { m4.compose(v.set(0, -5, 0), q.identity(), sc.setScalar(0.01)); hedges.setMatrixAt(hi++, m4); continue; } m4.compose(v.set(-hw - 0.05 + k * (hw * 2 + 0.1) / 17, 0.35, hd + 0.55), q.identity(), sc.set(1, 0.75, 1)); hedges.setMatrixAt(hi++, m4); }
  hedges.castShadow = true; group.add(hedges);
  // ---- the castle
  const castle = new THREE.Group(); castle.position.set(0, 0, CASTLE_Z); group.add(castle);
  const wallMat = std('#fbe7c6'), trimMat = std('#e2c28f');
  const keep = new THREE.Mesh(new THREE.BoxGeometry(11, 3.2, 2.4), wallMat); keep.position.y = 1.6; keep.castShadow = keep.receiveShadow = true; castle.add(keep);
  const merlons = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), trimMat, 10);
  for (let k = 0; k < 10; k++) { m4.makeTranslation(-4.95 + k * 1.1, 3.5, 1.0); merlons.setMatrixAt(k, m4); }
  castle.add(merlons);
  const gate = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 20, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), std('#5a3a22')); gate.position.set(0, 0.9, 1.15); gate.scale.set(1, 1.3, 1); castle.add(gate);
  const gateLow = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 0.3), std('#5a3a22')); gateLow.position.set(0, 0.45, 1.15); castle.add(gateLow);
  const ROOF = ['#ff4d6d', '#3d8bff', '#ffd23f', '#3d8bff', '#ff4d6d'];
  [-5.6, -2.8, 0, 2.8, 5.6].forEach((x, i) => {
    const tall = i === 2 ? 5.2 : (i % 2 ? 3.9 : 4.6), r = i === 2 ? 1.25 : 0.95;
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, tall, 18), wallMat); tw.position.set(x, tall / 2, i === 2 ? -0.4 : 0.2); tw.castShadow = true; castle.add(tw);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, 1.8, 18), std(ROOF[i], { roughness: 0.5 })); roof.position.set(x, tall + 0.9, tw.position.z); roof.castShadow = true; castle.add(roof);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6), std('#ffffff')); pole.position.set(x, tall + 2.2, tw.position.z); castle.add(pole);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.42, 0.04), std(ROOF[(i + 1) % 5])); flag.position.set(x + 0.36, tall + 2.5, tw.position.z); castle.add(flag);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.6, 0.1), std('#3b2a7a')); win.position.set(x, tall * 0.62, tw.position.z + r); castle.add(win);
  });
  // ---- cannons on platforms off each side, barrels pointing up and in
  const cannons = [];
  for (const sx of [-1, 1]) {
    const c = new THREE.Group(); c.position.set(sx * CANNON_X, 0, 0); group.add(c);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 0.5, 8), std('#b07a4a')); deck.position.y = 0.25; c.add(deck);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 2.4, 14), std('#33333f', { metalness: 0.4, roughness: 0.4 }));
    barrel.position.set(-sx * 0.3, 1.5, 0); barrel.rotation.z = sx * 0.75; barrel.castShadow = true; c.add(barrel);
    for (const wz of [-0.6, 0.6]) { const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.22, 14).rotateX(Math.PI / 2), std('#ffd23f')); wheel.position.set(0, 0.95, wz); c.add(wheel); }
    cannons.push({ c, barrel, kick: 0, sx });
  }
  // ---- balls: iron sphere + landing ring + shadow + filling timer disc
  const ballGeo = new THREE.SphereGeometry(0.42, 16, 10), ironMat = std('#26262e', { metalness: 0.5, roughness: 0.35 });
  const ringGeo = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const balls = new Map(), fx = [];
  function addBall([id, fx0, fz0, x, z, left, total, big]) {
    const B = { id, from: new THREE.Vector3(fx0, 2.6, fz0), x, z, left, total, big, seen: true };
    const s = big ? 1.5 : 1;
    B.ball = new THREE.Mesh(ballGeo, ironMat); B.ball.scale.setScalar(s); B.ball.castShadow = true;
    B.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: big ? '#ff3b3b' : '#ffffff', transparent: true, opacity: 0.95, depthWrite: false }));
    B.fill = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: big ? '#ff8a8a' : '#fff36b', transparent: true, opacity: 0.7, depthWrite: false }));
    B.shadow = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color: '#1d4a1d', transparent: true, opacity: 0.2, depthWrite: false }));
    const R = RULES.catchR;
    B.ring.scale.setScalar(R); B.ring.position.set(x, 0.06, z); B.fill.position.set(x, 0.05, z); B.shadow.position.set(x, 0.04, z);
    group.add(B.ball, B.ring, B.fill, B.shadow);
    if (big) B.tag = stage.tag(B.ring, { text: 'x2', height: 0.3, cls: 'cc-big' });
    balls.set(id, B); return B;
  }
  function dropBall(B) { group.remove(B.ball, B.ring, B.fill, B.shadow); for (const m of [B.ring, B.fill, B.shadow]) m.material.dispose(); B.tag?.remove(); }
  const puffGeo = new THREE.IcosahedronGeometry(0.6, 0);
  function puff(x, y, z, color = '#ffffff', size = 1) { const p = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })); p.position.set(x, y, z); p.userData.size = size; group.add(p); fx.push({ kind: 'puff', p, t: 0 }); }
  // ---- the HUD: castle hearts, catches toward the goal, the wave
  const bar = scoreBar(ctx, { unit: 'catches' });
  const hud = h('div', 'cc-hud'), banner = h('div', 'cc-banner');
  hud.innerHTML = '<span class="cc-castle"><b>Castle</b> <i class="cc-hearts"></i></span><span class="cc-goal"><b>Catches</b> <em>0</em>/<em></em></span><span class="cc-wave">Wave <em>1</em></span>';
  ctx.ui.append(hud, banner);
  const heartsEl = hud.querySelector('.cc-hearts'), [cEl, gEl] = hud.querySelectorAll('.cc-goal em'), wEl = hud.querySelector('.cc-wave em');
  const maxHp = ctx.init.hearts; gEl.textContent = ctx.init.goal;
  const showBanner = (text, cls = '') => { banner.textContent = text; banner.className = 'cc-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'cc-banner'; }, 1600); };
  let shake = 0, hp = maxHp;
  const flat = new Map();                 // pid -> until (ms) for a squashed pose
  const drawHearts = n => { const s = '♥'.repeat(n) + '♡'.repeat(Math.max(0, maxHp - n)); if (heartsEl.textContent !== s) heartsEl.textContent = s; };
  drawHearts(maxHp);
  return {
    start() { showBanner('Wave 1!'); },
    state(g) {
      for (const B of balls.values()) B.seen = false;
      for (const row of g.bl) { const B = balls.get(row[0]); if (B) { B.seen = true; B.left = Math.min(B.left, row[5]); } else addBall(row); }
      for (const [id, B] of balls) if (!B.seen) { dropBall(B); balls.delete(id); }
      if (g.hp !== hp) { hp = g.hp; drawHearts(hp); hud.classList.toggle('low', hp <= 2); }
      if (cEl.textContent !== String(g.c)) cEl.textContent = g.c;
      if (wEl.textContent !== String(g.w)) wEl.textContent = g.w;
      bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'fire') { const c = cannons[ev.side < 0 ? 0 : 1]; c.kick = 1; c.c.position.z = ev.z; puff(c.c.position.x - c.sx * 1.2, 2.6, ev.z, '#dddddd', 1.3); ctx.sfx('throw'); }
      else if (ev.e === 'catch') {
        puff(ev.x, 0.9, ev.z, '#fff6c8'); ctx.sfx(ev.pids.includes(ctx.me) ? 'coins' : 'good');
        floatText(stage, ev.x, 2.2, ev.z, ev.big ? '+1 +1' : '+1', 'good');
        for (const pid of ev.pids) ctx.actor(pid)?.play('cheer', 520);
      } else if (ev.e === 'miss') {
        const ball = new THREE.Mesh(ballGeo, ironMat); ball.position.set(ev.x, 0.4, ev.z); group.add(ball);
        fx.push({ kind: 'bounce', p: ball, t: 0, from: new THREE.Vector3(ev.x, 0.4, ev.z), hurt: ev.hurt });
        puff(ev.x, 0.3, ev.z, '#c9a27a'); ctx.sfx('splat');
      } else if (ev.e === 'squash') { flat.set(ev.pid, performance.now() + RULES.squash * 1000); ctx.sfx('hit'); const a = ctx.actor(ev.pid); if (a) floatText(stage, a.group.position.x, 1.8, a.group.position.z, 'Need two!', 'bad'); }
      else if (ev.e === 'dive') { if (ev.pid === ctx.me) ctx.sfx('tap'); }
      else if (ev.e === 'wave') { showBanner(`Wave ${ev.n}!`); ctx.sfx('pick'); }
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Castle saved!' : 'The castle fell!', ev.ok ? 'good' : 'bad'); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    pose(pid, flags) {
      if ((flat.get(pid) || 0) > performance.now()) return 'dead';
      if (flags & F.AIR) return 'jump';
      if (flags & F.STUN) return 'hit';
      return undefined;
    },
    frame(dt, t) {
      for (const B of balls.values()) {
        B.left = Math.max(0, B.left - dt); const k = 1 - B.left / B.total;
        B.ball.position.set(B.from.x + (B.x - B.from.x) * k, B.from.y * (1 - k) + 0.42 + PEAK * 4 * k * (1 - k), B.from.z + (B.z - B.from.z) * k);
        B.ball.rotation.x += dt * 4;
        B.fill.scale.setScalar(Math.max(0.01, k * RULES.catchR * 0.86));
        B.shadow.scale.setScalar(RULES.catchR * (0.3 + 0.55 * k)); B.shadow.material.opacity = 0.12 + 0.3 * k;
        B.ring.material.opacity = k > 0.75 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 16)) : 0.95;
      }
      for (const c of cannons) { c.kick = Math.max(0, c.kick - dt * 4); c.barrel.position.x = -c.sx * 0.3 + c.sx * c.kick * 0.35; }
      shake = Math.max(0, shake - dt * 2.5);
      castle.position.x = Math.sin(t * 60) * shake * 0.25; castle.rotation.z = Math.sin(t * 47) * shake * 0.02;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt;
        if (f.kind === 'puff') { const s = f.p.userData.size; f.p.scale.setScalar(s * (0.4 + f.t * 2.6)); f.p.material.opacity = Math.max(0, 0.9 - f.t * 1.8); if (f.t > 0.5) { group.remove(f.p); f.p.material.dispose(); fx.splice(i, 1); } }
        else {
          const k = Math.min(1, f.t / 0.45), to = v.set(0, 1.4, CASTLE_Z + 1.4);
          f.p.position.set(f.from.x + (to.x - f.from.x) * k, 0.4 + Math.sin(k * Math.PI) * 2.2 + (to.y - 0.4) * k, f.from.z + (to.z - f.from.z) * k);
          if (k >= 1) {
            group.remove(f.p); fx.splice(i, 1); shake = 1; puff(to.x, to.y, to.z, '#ffb26b', 1.8);
            floatText(stage, 0, 4.2, CASTLE_Z + 1, f.hurt > 1 ? '-2 ♥' : '-1 ♥', 'bad'); ctx.sfx('bad');
          }
        }
      }
    },
    dispose() { bar.el.remove(); for (const B of balls.values()) B.tag?.remove(); clearTimeout(showBanner.t); },
  };
}
