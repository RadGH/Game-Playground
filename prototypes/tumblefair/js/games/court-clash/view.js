// COURT CLASH, as drawn: a toy outdoor court (blue paint inside green, white lines: halfway line, centre circle, a
// key and a three-point arc at each end), a low fence with bunting, and a hoop at each end on a pole in the colours of
// the team that shoots at it (right = red + green, left = blue + pink, with a tag saying so). The ball is bounced
// along by whoever has it, flies between server updates on its own velocity, and lights up the net on a basket. CPU
// fill-ins are ordinary characters drawn from the state. While someone holds A with the ball, a power meter floats by
// their head (the green band is where a shot from there drops; your own runs on your phone so it never lags).
import { THREE_R, hoopFor, LAYUP_R } from './sim.js';
import { idealPower, tolFor, meterAt, hoopDist, G, BALL_R } from '../hoops-kit.js';
import { createHoopsArt } from '../hoops-view.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';

const TEAM = [{ name: 'Red & Green', color: '#ff5f5f', alt: '#3ecf5a' }, { name: 'Blue & Pink', color: '#3d8bff', alt: '#ff6ad5' }];
export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx, HW = ctx.season === 'halloween', L = init.level;
  const { hw, hd } = ctx.arena, art = createHoopsArt(ctx), std = art.std, g_ = art.g_, tags = [], who = init.who;
  const iOf = new Map(who.map((w, i) => [w.pid, i])), myI = me != null ? iOf.get(me) : null, myTeam = myI != null ? who[myI].team : null;
  // ---- court
  const ground = new THREE.Mesh(g_(new THREE.PlaneGeometry(60, 40).rotateX(-Math.PI / 2)), std(HW ? '#2a3a2e' : '#7cc46a', { roughness: 1 })); ground.position.y = -0.02; ground.receiveShadow = true; group.add(ground);
  const court = new THREE.Mesh(g_(new THREE.PlaneGeometry(hw * 2 + 0.8, hd * 2 + 0.8).rotateX(-Math.PI / 2)), std(HW ? '#3a2a55' : '#3aa66a', { roughness: 0.9 })); court.receiveShadow = true; group.add(court);
  const inner = new THREE.Mesh(g_(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std(HW ? '#4a3070' : '#4a8ee0', { roughness: 0.85 })); inner.position.y = 0.005; inner.receiveShadow = true; group.add(inner);
  const lineM = std('#ffffff', { roughness: 0.6 }), line = (geo, x, z, rot = 0) => { const m = new THREE.Mesh(g_(geo), lineM); m.rotation.x = -Math.PI / 2; m.rotation.z = rot; m.position.set(x, 0.012, z); group.add(m); return m; };
  line(new THREE.PlaneGeometry(0.08, hd * 2), 0, 0); line(new THREE.RingGeometry(1.15, 1.23, 36), 0, 0);
  const hoopMesh = [];
  for (const t of [0, 1]) {
    const H = hoopFor(t), s = Math.sign(H.x);
    const key = new THREE.Mesh(g_(new THREE.PlaneGeometry(3.0, 2.8).rotateX(-Math.PI / 2)), std(TEAM[t].color, { transparent: true, opacity: 0.35, depthWrite: false })); key.position.set(H.x - s * 1.2, 0.01, 0); group.add(key);
    line(new THREE.RingGeometry(THREE_R - 0.05, THREE_R + 0.05, 48, 1, -Math.PI * 0.42, Math.PI * 0.84), H.x, 0, s > 0 ? Math.PI : 0);
    const hp = art.hoop({ x: H.x, y: H.y, z: H.z, nx: H.nx, nz: H.nz, color: TEAM[t].color }); group.add(hp); hoopMesh[t] = hp;
    tags.push(stage.tag(hp, { text: myTeam === t ? 'YOUR HOOP' : TEAM[t].name, height: 1.1, cls: 'cc-hoop cc-t' + t }));
  }
  // fence + bunting
  const NF = 28, posts = new THREE.InstancedMesh(g_(new THREE.CylinderGeometry(0.06, 0.06, 1, 6)), std(HW ? '#5a3a7a' : '#ffffff'), NF), flags = new THREE.InstancedMesh(g_(new THREE.ConeGeometry(0.16, 0.3, 3).rotateX(Math.PI)), std('#ffffff'), NF * 2);
  const m4 = new THREE.Matrix4(), col = new THREE.Color(), PAL = HW ? ['#ff8a1a', '#7a3cc8', '#7dff5a'] : ['#ff5f5f', '#ffd23f', '#3d8bff', '#3ecf5a', '#ff6ad5'];
  for (let i = 0; i < NF; i++) {
    const per = 2 * (hw * 2 + hd * 2) + 4, u = i / NF * per; let x, z; const W2 = hw + 0.8, D2 = hd + 0.8;
    if (u < W2 * 2) { x = -W2 + u; z = -D2; } else if (u < W2 * 2 + D2 * 2) { x = W2; z = -D2 + (u - W2 * 2); } else if (u < W2 * 4 + D2 * 2) { x = W2 - (u - W2 * 2 - D2 * 2); z = D2; } else { x = -W2; z = D2 - (u - W2 * 4 - D2 * 2); }
    m4.makeTranslation(x, 0.5, z); posts.setMatrixAt(i, m4);
    for (let k = 0; k < 2; k++) { m4.makeTranslation(x + (k ? 0.35 : -0.35) * (Math.abs(z) > hd ? 1 : 0), 0.92, z + (k ? 0.35 : -0.35) * (Math.abs(z) > hd ? 0 : 1)); flags.setMatrixAt(i * 2 + k, m4); flags.setColorAt(i * 2 + k, col.set(PAL[(i * 2 + k) % PAL.length])); }
  }
  group.add(posts, flags);
  // ---- the ball
  const ball = art.ball(); group.add(ball); ball.position.set(0, 3, 0);
  const shadow = new THREE.Mesh(g_(new THREE.CircleGeometry(BALL_R * 1.3, 16).rotateX(-Math.PI / 2)), new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.25, depthWrite: false })); art.mats.push(shadow.material); group.add(shadow);
  // ---- CPU fill-ins
  const cpus = new Map();
  who.forEach((w, i) => { if (!w.cpu) return; const C = { a: null, x: 0, z: 0, y: 0, yaw: 0, tx: 0, tz: 0, ty: 0, sp: 0, flags: 0, seen: false }; cpus.set(i, C);
    ctx.createActor({ look: { race: w.team ? 'elf' : 'dwarf', seed: 300 + i * 17 }, seat: null }).then(a => { if (!a) return; C.a = a; tags.push(stage.tag(a.group, { text: `${w.name} (CPU)`, height: a.height + 0.35, cls: 'cc-cpu cc-t' + w.team })); }); });
  const posOf = i => { const w = who[i]; if (w.cpu) { const C = cpus.get(i); return C ? { x: C.x, z: C.z, y: C.y, yaw: C.yaw } : null; } return ctx.pos(w.pid); };
  const nameOf = i => (i === myI ? 'You' : who[i].name);
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'gp-pill cc-pill'), banner = h('div', 'gp-banner'), meter = h('div', 'cc-meter', '<i class="cc-band"></i><i class="cc-fill"></i><b></b>');
  ctx.ui.append(pill, banner, meter);
  const mFill = meter.querySelector('.cc-fill'), mBand = meter.querySelector('.cc-band'), mTx = meter.querySelector('b');
  const showBanner = (html, cls = '', ms = 1500) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  let last = null, lastAt = 0, holdStart = null, lastA = 0, camX = 0;
  const now = () => performance.now() / 1000;
  const portrait = () => innerHeight > innerWidth * 1.15;
  return {
    halloween: { spots: [[-hw - 2, 0, -hd - 1.6], [hw + 2, 0, -hd - 1.6], [-hw - 2, 0, hd + 1.6], [hw + 2, 0, hd + 1.6]], ghosts: [[-4, 3, -hd - 1.4], [4, 3.2, -hd - 1.8]], mist: false },
    input(inp) { if (inp.b & 1) { if (holdStart == null) holdStart = now(); lastA = now(); } },
    state(g) {
      last = g; lastAt = now(); bar.set(g.sc, g.left);
      for (const [i, x, z, yaw, sp, fl, y] of g.c) { const C = cpus.get(i); if (!C) continue; if (!C.seen) { C.x = x; C.z = z; C.yaw = yaw; C.seen = true; } C.tx = x; C.tz = z; C.ty = yaw; C.sp = sp; C.flags = fl; C.y = y; }
      const hi = g.b[3];
      if (myI != null) {
        const H = hoopFor(myTeam), p = posOf(myI), d = p ? hoopDist(p.x, p.z, H) : 9;
        pill.innerHTML = hi === myI ? (d < LAYUP_R ? '<b>Layup!</b> press A' : d >= THREE_R ? '<b>3-pointer</b> · hold A, let go in the green' : '<b>2</b> · hold A to shoot · tap A to pass')
          : hi >= 0 && who[hi].team === myTeam ? `${esc(nameOf(hi))} has it — get open! ${who[hi].cpu ? '(A = pass it here)' : ''}`
          : hi >= 0 ? `Defend! B = steal / jump` : `Loose ball — grab it!`;
        pill.insertAdjacentHTML('beforeend', ` <em>${H.x > 0 ? 'shoot ▶' : '◀ shoot'}</em>`);
      } else pill.innerHTML = `<b style="color:${TEAM[0].color}">${TEAM[0].name}</b> ${g.s[0]} · ${g.s[1]} <b style="color:${TEAM[1].color}">${TEAM[1].name}</b>`;
    },
    event(ev) {
      if (ev.e === 'score') {
        const H = hoopFor(ev.team); hoopMesh[ev.team]?.userData.swish(); floatText(stage, H.x, H.y + 0.8, H.z, `+${ev.pts}`, ev.team === myTeam ? 'good' : '');
        showBanner(`${ev.pts === 3 ? 'THREE!' : 'Score!'}<small>${ev.by >= 0 ? esc(nameOf(ev.by)) + ' · ' : ''}${ev.team === myTeam ? 'your team' : esc(TEAM[ev.team].name)}</small>`, ev.team === myTeam ? 'good' : myTeam == null ? '' : 'bad', 1300);
        ctx.sfx(ev.team === myTeam ? 'coins' : 'bad');
      } else if (ev.e === 'shot') { const w = who[ev.by]; (w.cpu ? cpus.get(ev.by)?.a : ctx.actor(w.pid))?.play('throw', 520); if (ev.by === myI) ctx.sfx('throw'); holdStart = null; }
      else if (ev.e === 'steal') { const p = posOf(ev.by); if (p) floatText(stage, p.x, 2.2, p.z, 'Stolen!', who[ev.by].team === myTeam ? 'good' : 'bad'); if (ev.by === myI || ev.from === myI) ctx.sfx(ev.by === myI ? 'good' : 'bad'); }
      else if (ev.e === 'reach') { const p = posOf(ev.by); if (p) floatText(stage, p.x, 2.2, p.z, 'Whiff!', ''); if (ev.by === myI) ctx.sfx('bad'); }
      else if (ev.e === 'block') { const p = posOf(ev.by); if (p) floatText(stage, p.x, 2.6, p.z, 'SWATTED!', who[ev.by].team === myTeam ? 'good' : 'bad'); ctx.sfx('hit'); }
      else if (ev.e === 'rim' || ev.e === 'board') ctx.sfx('tap');
      else if (ev.e === 'pass') { if (ev.to === myI) ctx.sfx('pick'); }
      else if (ev.e === 'pick') { if (ev.by === myI) ctx.sfx('pick'); }
      else if (ev.e === 'end') { const [a, b] = ev.score; ctx.sfx('win'); showBanner(a === b ? `Tie game!<small>${a} – ${b}</small>` : `${esc(TEAM[a > b ? 0 : 1].name)} win!<small>${a} – ${b}</small>`, 'good', 4000); }
    },
    pose(pid, flags) { if (flags & 8) { const t = who[iOf.get(pid)]?.team; return last && last.s[t] >= last.s[1 - t] ? 'cheer' : 'idle'; } if (flags & 16) return 'jump'; return undefined; },
    frame(dt, t) {
      // camera: the whole court, or on an upright phone a slice that follows the ball
      if (portrait()) { const lim = hw + 0.6 - 5.2, want = Math.max(-lim, Math.min(lim, ball.position.x * 0.8)); camX += (want - camX) * Math.min(1, dt * 3); ctx.camera({ cx: camX, cz: 0, hw: 5.2, hd: hd + 0.6, tall: 3.2 }); }
      else ctx.camera({ cx: 0, cz: 0, hw: hw + 0.6, hd: hd + 0.6, tall: 3.2 });
      for (const [i, C] of cpus) {
        if (!C.a) continue; const k = 1 - Math.exp(-dt * 12); C.x += (C.tx - C.x) * k; C.z += (C.tz - C.z) * k; let dy = C.ty - C.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); C.yaw += dy * k;
        C.a.place(C.x, C.y, C.z, C.yaw); C.a.setSpeed?.(C.flags & 2 ? 0 : C.sp); C.a.setPose?.(C.flags & 8 ? (last && last.s[who[i].team] >= last.s[1 - who[i].team] ? 'cheer' : 'idle') : C.flags & 16 ? 'jump' : C.flags & 2 ? 'hit' : 'idle'); C.a.update(dt);
      }
      // the ball: in someone's hands (dribbled), or flying on its last known velocity
      if (last) {
        const [bx, by, bz, hi, vx, vy, vz] = last.b, p = hi >= 0 ? posOf(hi) : null;
        if (p) { const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), charging = last.h > 0.12 || (hi === myI && holdStart != null); ball.position.set(p.x + fx * 0.42, charging ? 1.6 + (p.y || 0) : BALL_R + Math.abs(Math.sin(t * 8)) * 0.8 + (p.y || 0), p.z + fz * 0.42); }
        else { const tau = Math.min(0.12, now() - lastAt); ball.position.set(bx + vx * tau, Math.max(BALL_R, by + vy * tau - G * tau * tau / 2), bz + vz * tau); }
        ball.rotation.z -= dt * 6; shadow.position.set(ball.position.x, 0.02, ball.position.z); shadow.scale.setScalar(Math.max(0.4, 1.2 - ball.position.y * 0.2));
      }
      for (const hm of hoopMesh) hm.userData.frame(dt);
      // the power meter: over whoever is charging a shot (yours from your own thumb)
      if (holdStart != null && now() - lastA > 0.12) holdStart = null;
      const hi = last ? last.b[3] : -1, mineHold = hi === myI && holdStart != null;
      const held = mineHold ? now() - holdStart : last && hi >= 0 && hi !== myI ? last.h : 0;
      const pp = hi >= 0 ? posOf(hi) : null;
      if (pp && held > 0.12) {
        const H = hoopFor(who[hi].team), d = hoopDist(pp.x, pp.z, H), p0 = idealPower(d), tl = tolFor(d, L.tol), p = meterAt(held, L.period);
        const s = stage.toScreen(pp.x, 2.3, pp.z); meter.style.transform = `translate(${s.x + 26}px, ${s.y - 60}px)`; meter.classList.add('on');
        mBand.style.bottom = (Math.max(0, p0 - tl) * 100).toFixed(1) + '%'; mBand.style.height = (tl * 200).toFixed(1) + '%';
        mFill.style.height = (p * 100).toFixed(1) + '%'; mFill.classList.toggle('in', Math.abs(p - p0) <= tl);
        mTx.textContent = d < LAYUP_R ? 'layup' : d >= THREE_R ? '3!' : '2';
      } else meter.classList.remove('on');
    },
    dispose() { clearTimeout(showBanner.t); bar.el.remove(); for (const tg of tags) tg.remove(); art.dispose(); },
  };
}
