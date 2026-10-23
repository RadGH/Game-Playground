// CHIP-IN CHALLENGE, as drawn: a round practice green on a fairway, with a painted target round the flag — four
// rings (gold 50, white 25, blue 10, green 5, each with its number) — the cup and a checked flag in the middle, two
// striped buckets at the back with "75" on them, and a mat for each player along the front in their seat colour.
// While you hold A, a dotted arc and a landing ring show where your chip will come down (with the same aim help the
// rules use: the ring turns gold when it has you on the flag or a bucket). A chip flies in a real arc with its
// shadow racing over the grass to a ring that marks where it will land, then rolls; points pop up where it stops.
import { CENTER, BUCKETS, RINGS, LEVELS, GREEN_R, landing, aimTargets, carryFor, flightOf } from './sim.js';
import { assistYaw, charge, BALL_R } from '../golf-kit.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';

export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx;
  const L = init.level || LEVELS.normal, HW = ctx.season === 'halloween';
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...extra }); mats.push(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const DRAW_R = BALL_R * 1.5;
  // ---- fairway, green, target
  const field = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std(HW ? '#34573a' : '#5fbf55', { roughness: 1 })); field.position.y = -0.02; field.receiveShadow = true; group.add(field);
  const stripes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 30).rotateX(-Math.PI / 2), basic(HW ? '#3d6342' : '#6dcc60', { transparent: true, opacity: 0.6, depthWrite: false }), 12);
  for (let i = 0; i < 12; i++) { m4.makeTranslation(-17.6 + i * 3.2, -0.01, 0); stripes.setMatrixAt(i, m4); } group.add(stripes);
  const green = new THREE.Mesh(new THREE.CircleGeometry(GREEN_R + 0.35, 48).rotateX(-Math.PI / 2), std(HW ? '#3f7a4c' : '#7ddc6a', { roughness: 0.9 })); green.position.set(CENTER.x, 0.004, CENTER.z); green.receiveShadow = true; group.add(green);
  const fringe = new THREE.Mesh(new THREE.RingGeometry(GREEN_R + 0.35, GREEN_R + 0.75, 48).rotateX(-Math.PI / 2), std(HW ? '#2d5a37' : '#4fae47')); fringe.position.set(CENTER.x, 0.003, CENTER.z); group.add(fringe);
  const target = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: targetTexture(), transparent: true, depthWrite: false })); mats.push(target.material);
  const tR = RINGS[RINGS.length - 1][0] * L.ring; target.scale.set(tR * 2, 1, tR * 2); target.position.set(CENTER.x, 0.012, CENTER.z); group.add(target);
  function targetTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'), R = 256, outer = RINGS[RINGS.length - 1][0];
    const COL = ['#ffd23f', '#ffffff', '#3d8bff', '#3ecf5a'];
    for (let i = RINGS.length - 1; i >= 0; i--) { g.beginPath(); g.arc(R, R, RINGS[i][0] / outer * (R - 4), 0, Math.PI * 2); g.fillStyle = COL[i]; g.globalAlpha = i === 0 ? 0.85 : 0.5; g.fill(); g.globalAlpha = 1; g.lineWidth = 6; g.strokeStyle = '#0d2228'; g.stroke(); }
    g.font = '900 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 6; g.strokeStyle = '#0d2228'; g.fillStyle = '#ffffff';
    for (let i = 1; i < RINGS.length; i++) { const r = (RINGS[i][0] + RINGS[i - 1][0]) / 2 / outer * (R - 4); g.strokeText(String(RINGS[i][1]), R, R + r); g.fillText(String(RINGS[i][1]), R, R + r); }
    g.strokeText('50', R + 44, R + 4); g.fillText('50', R + 44, R + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  }
  const cup = new THREE.Mesh(new THREE.CircleGeometry(L.cupR, 24).rotateX(-Math.PI / 2), basic('#0d1a12')); cup.position.set(CENTER.x, 0.02, CENTER.z); group.add(cup);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), std('#ffffff')); pole.position.set(CENTER.x, 1.1, CENTER.z); group.add(pole);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshStandardMaterial({ color: HW ? '#ff8a1a' : '#ff4d4d', side: THREE.DoubleSide })); mats.push(flag.material); flag.position.set(CENTER.x + 0.46, 1.95, CENTER.z); group.add(flag);
  const tags = [];
  // buckets: an open striped pail with "75" on the front
  for (const B of BUCKETS) {
    const g = new THREE.Group(); g.position.set(B.x, 0, B.z); group.add(g);
    const pail = new THREE.Mesh(new THREE.CylinderGeometry(B.r + 0.05, B.r * 0.82, 0.6, 20, 1, true), std(HW ? '#ff7a14' : '#ff5a7a', { side: THREE.DoubleSide })); pail.position.y = 0.3; pail.castShadow = true; g.add(pail);
    const inside = new THREE.Mesh(new THREE.CircleGeometry(B.r * 0.82, 20).rotateX(-Math.PI / 2), std('#3a2a2a')); inside.position.y = 0.02; g.add(inside);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(B.r + 0.05, 0.05, 6, 24).rotateX(Math.PI / 2), std('#ffffff')); rim.position.y = 0.6; g.add(rim);
    tags.push(stage.tag(rim, { text: '75', height: 0.45, cls: 'ci-bucket' }));
  }
  // mats
  for (const [i, M] of init.mats.entries()) {
    const p = players[i]; if (!p) continue;
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.2), std(p.color, { roughness: 0.9 })); mat.position.set(M.x, 0.03, M.z + 0.2); mat.receiveShadow = true; group.add(mat);
    const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.12, 6), std('#ffffff')); tee.position.set(M.x, 0.1, M.z); group.add(tee);
  }
  // ---- balls (one flying/rolling + one resting per player), shadows, landing rings, your aim arc
  const ballGeo = new THREE.SphereGeometry(DRAW_R, 16, 10), shadowGeo = new THREE.CircleGeometry(DRAW_R * 1.2, 16).rotateX(-Math.PI / 2), ringGeo = new THREE.RingGeometry(0.32, 0.42, 28).rotateX(-Math.PI / 2);
  const B = new Map();
  for (const p of players) {
    const mk = () => { const m = new THREE.Mesh(ballGeo, std(p.color, { roughness: 0.3 })); m.castShadow = true; m.visible = false; group.add(m); return m; };
    const shadow = new THREE.Mesh(shadowGeo, basic('#0d2228', { transparent: true, opacity: 0.35, depthWrite: false })); shadow.visible = false; group.add(shadow);
    const land = new THREE.Mesh(ringGeo, basic(p.color, { transparent: true, opacity: 0.95, depthWrite: false })); land.visible = false; group.add(land);
    B.set(p.pid, { ball: mk(), rest: mk(), shadow, land, x: 0, z: 0, y: 0, tx: 0, tz: 0, ty: 0, st: 0, left: init.shots, ch: 0, club: null, swing: 0 });
  }
  const preview = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.46, 28).rotateX(-Math.PI / 2), basic('#ffffff', { transparent: true, opacity: 0.9, depthWrite: false })); preview.visible = false; group.add(preview);
  const NDOT = 16, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), basic('#ffffff', { transparent: true, opacity: 0.9 }), NDOT); dots.count = 0; group.add(dots);
  const clubGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.78, 6).translate(0, -0.39, 0), headGeo = new THREE.BoxGeometry(0.16, 0.1, 0.06).translate(0.02, -0.78, 0);
  const clubMat = std('#c8ccd6', { metalness: 0.5, roughness: 0.3 }), headMat = std('#9aa0ad', { metalness: 0.6, roughness: 0.3 });
  function clubOf(pid) {
    const R = B.get(pid); if (R.club) return R.club;
    const a = ctx.actor(pid); if (!a) return null;
    const pivot = new THREE.Group(); pivot.position.set(0.06, 0.62, 0.26); pivot.add(new THREE.Mesh(clubGeo, clubMat), new THREE.Mesh(headGeo, headMat));
    pivot.rotation.x = 0.62; a.group.add(pivot); R.club = pivot; return pivot;
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'points' });
  const pill = h('div', 'gp-pill'), banner = h('div', 'gp-banner'), meter = h('div', 'gp-meter', '<i></i><b>POWER</b>');
  ctx.ui.append(pill, banner, meter);
  const meterFill = meter.querySelector('i');
  const showBanner = (html, cls = '', ms = 1600) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const medal = s => s >= 300 ? '🥇 Gold!' : s >= 180 ? '🥈 Silver' : s >= 90 ? '🥉 Bronze' : 'Keep practising!';
  let held = 0, lastIn = 0, last = null;
  const myMat = me != null ? init.mats[players.findIndex(p => p.pid === me)] : null;

  return {
    halloween: { spots: [[-8.4, 0, 6.6], [-3, 0, 7.2], [3, 0, 7.2], [8.4, 0, 6.6], [-8.6, 0, -6.4], [8.6, 0, -6.4]] },
    input(inp) { if (inp.b & 1) { held += 0.05; lastIn = performance.now(); } },
    state(g) {
      last = g;
      for (const row of g.b) {
        const R = B.get(row[0]); if (!R) continue;
        const [, x, z, y, st, left, ch] = row;
        if (st !== R.st && (st === 1)) { R.x = x; R.z = z; R.y = y; }
        R.tx = x; R.tz = z; R.ty = y; R.st = st; R.left = left; R.ch = ch / 100;
      }
      for (const R of B.values()) R.rest.visible = false;
      for (const [pid, x, z] of g.rest) { const R = B.get(pid); if (!R) continue; R.rest.visible = true; R.rest.position.set(x, DRAW_R, z); }
      bar.set(g.sc, g.left);
      const mine = me != null ? B.get(me) : null;
      pill.innerHTML = mine ? `<b>Shots</b> <span class="ci-pips">${Array.from({ length: init.shots }, (_, i) => `<i class="${i < mine.left ? 'on' : ''}"></i>`).join('')}</span> <em>${mine.left} left</em>` : '<b>Chip-In Challenge</b> <em>5 shots each</em>';
    },
    event(ev) {
      const R = B.get(ev.pid);
      if (ev.e === 'chip') { if (R) { R.land.position.set(ev.tx, 0.02, ev.tz); R.land.visible = true; R.swing = 1; } ctx.actor(ev.pid)?.play('attack', 420); if (ev.pid === me) held = 0; ctx.sfx('throw'); }
      else if (ev.e === 'land') { if (R) R.land.visible = false; ctx.sfx('tap'); }
      else if (ev.e === 'clack') ctx.sfx('hit');
      else if (ev.e === 'score') {
        const text = ev.kind === 'cup' ? `CHIP-IN! +${ev.pts}` : ev.kind === 'bucket' ? `BUCKET! +${ev.pts}` : ev.pts ? `+${ev.pts}` : 'Miss';
        floatText(stage, ev.x, 1.2, ev.z, text, ev.pts ? 'good' : 'bad');
        if (ev.pid === me) { ctx.sfx(ev.pts >= 50 ? 'win' : ev.pts ? 'coins' : 'bad'); if (ev.kind !== 'ring') showBanner(ev.kind === 'cup' ? 'Chip-in!' : 'Bucket bonus!', 'good'); }
        if (ev.pts >= 50) ctx.actor(ev.pid)?.play('cheer', 1200);
      }
      else if (ev.e === 'end') { const sc = last?.sc || {}; showBanner(players.length === 1 ? `${sc[players[0].pid] ?? 0} points<small>${medal(sc[players[0].pid] ?? 0)}</small>` : 'Done!', 'good', 4000); ctx.sfx('win'); }
    },
    pose(pid) { const R = B.get(pid); return R?.st === 0 && (pid === me ? held > 0 : R.ch > 0) ? 'ready' : undefined; },
    frame(dt, t) {
      if (me != null && held > 0 && performance.now() - lastIn > 160) held = 0;
      for (const [pid, R] of B) {
        const k = 1 - Math.exp(-dt * 14); R.x += (R.tx - R.x) * k; R.z += (R.tz - R.z) * k; R.y += (R.ty - R.y) * k;
        const live = R.st === 1 || R.st === 2;
        R.ball.visible = live; R.shadow.visible = live && R.y > 0.05;
        if (live) { R.ball.position.set(R.x, R.y + DRAW_R, R.z); R.shadow.position.set(R.x, 0.015, R.z); R.shadow.scale.setScalar(1 + R.y * 0.25); R.ball.rotation.x += dt * 8; }
        if (R.land.visible) R.land.scale.setScalar(1 + 0.12 * Math.sin(t * 12));
        const club = clubOf(pid);
        if (club) { const ch = pid === me ? charge(held, L.period) : R.ch; R.swing = Math.max(0, R.swing - dt * 3); club.rotation.x = 0.62 - (R.swing > 0 ? -1.2 * Math.sin(R.swing * Math.PI) : ch * 1.5); }
      }
      // your aim: a dotted arc to a landing ring, while you can chip
      const mine = me != null ? B.get(me) : null;
      if (mine && mine.st === 0 && myMat) {
        const a = ctx.actor(me), yaw0 = a ? a.body.group.rotation.y : Math.PI, yaw = assistYaw(null, myMat.x, myMat.z, yaw0, aimTargets(), L.help);
        const p = charge(held, L.period), at = landing(myMat.x, myMat.z, yaw, Math.max(0.02, p)), f = flightOf(carryFor(p));
        preview.visible = true; preview.position.set(at.x, 0.025, at.z); preview.material.color.set(Math.abs(yaw - yaw0) > 1e-4 ? '#ffe36b' : '#ffffff');
        const n = held > 0 ? NDOT : 6;
        for (let i = 0; i < n; i++) { const kk = (i + 1) / (NDOT + 1), x = myMat.x + (at.x - myMat.x) * kk, z = myMat.z + (at.z - myMat.z) * kk; m4.compose(v.set(x, 0.1 + 4 * f.apex * kk * (1 - kk), z), q.identity(), sc.setScalar(1)); dots.setMatrixAt(i, m4); }
        dots.count = n; dots.instanceMatrix.needsUpdate = true;
        const s = stage.toScreen(myMat.x, 0.3, myMat.z); meter.style.transform = `translate(${(s.x + 40).toFixed(0)}px, ${(s.y - 90).toFixed(0)}px)`;
        meter.classList.toggle('on', held > 0); meterFill.style.height = Math.round(p * 100) + '%';
      } else { preview.visible = false; dots.count = 0; meter.classList.remove('on'); }
    },
    dispose() { bar.el.remove(); clearTimeout(showBanner.t); for (const tg of tags) tg.remove(); for (const m of mats) m.dispose(); },
  };
}
