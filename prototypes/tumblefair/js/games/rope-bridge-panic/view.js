// ROPE BRIDGE PANIC, as drawn: grassy rock cliffs and two rock pillars standing out of a misty gorge with a river far
// below, joined by three plank-and-rope bridges. Planks are warm wood; worn ones go darker and redder and sag, weak ones
// are thinner and greyer from the start; a snapped plank tumbles into the gorge and leaves a gap. A bridge visibly tips
// toward the side its people stand on. Before a gust, a WIND arrow appears over that bridge; while it blows, white
// streaks race across it. The camera follows the team up the gorge.
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';

export function createView(ctx) {
  const { THREE, group, stage, init } = ctx;
  const { course, R } = init, HW = R.HW, PL = R.PL;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
  // ---- the gorge: river, mist, distant walls
  const river = new THREE.Mesh(new THREE.PlaneGeometry(14, course.hd * 2 + 60).rotateX(-Math.PI / 2), std('#3a8fd0', { roughness: 0.3, emissive: '#0c3050', emissiveIntensity: 0.4 })); river.position.y = -16; group.add(river);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(90, course.hd * 2 + 60).rotateX(-Math.PI / 2), std('#3f5a3a')); bed.position.y = -16.1; group.add(bed);
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(90, course.hd * 2 + 60).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#dff3ff', transparent: true, opacity: 0.35, depthWrite: false })); mist.position.y = -7; group.add(mist);
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std('#7d6a58', { flatShading: true }), 40);
  for (let i = 0; i < 40; i++) { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2), z = -course.hd - 20 + k * (course.hd * 2 + 40) / 19; m4.compose(v.set(side * (14 + (k * 7 % 5)), -10 + (k * 3 % 4) * 0.6, z), q.setFromEuler(e3.set(0, k * 0.7, 0)), sc.set(9, 14, 6 + (k % 3) * 2)); walls.setMatrixAt(i, m4); }
  group.add(walls);
  // ---- cliffs and pillars (rock with a grass top)
  const rockMat = std('#8c7a66', { flatShading: true }), grassMat = std('#78c25a');
  const lands = course.segs.filter(s => s.k === 'land');
  lands.forEach((L, i) => {
    const first = i === 0, last = i === lands.length - 1, len = L.z0 - L.z1 + (first || last ? 12 : 0), cz = (L.z0 + L.z1) / 2 + (first ? 6 : last ? -6 : 0), w = first || last ? 16 : 5;
    const rock = new THREE.Mesh(new THREE.BoxGeometry(w, 16, len), rockMat); rock.position.set(0, -8.15, cz); rock.receiveShadow = true; group.add(rock);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, 0.3, len + 0.2), grassMat); top.position.set(0, -0.15, cz); top.receiveShadow = true; group.add(top);
    if (last) { const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.05), std('#ffd23f')); flag.position.set(-2.2, 2.4, L.z1 + 1.8); group.add(flag); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6), std('#ffffff')); pole.position.set(-2.65, 1.4, L.z1 + 1.8); group.add(pole); }
  });
  // ---- the bridges
  const plankGeo = new THREE.BoxGeometry(HW * 2 + 0.3, 0.12, PL * 0.86), plankMat = std('#ffffff', { roughness: 0.85 });
  const ropeMat = std('#d9b77a'), postMat = std('#6b4a2e');
  const WOOD = new THREE.Color('#c08a52'), WORN = new THREE.Color('#7a3a22'), WEAK = new THREE.Color('#9a8a78');
  const spans = course.segs.filter(s => s.k === 'span').map(s => {
    const len = s.z0 - s.z1, mid = (s.z0 + s.z1) / 2;
    const g = new THREE.Group(); g.position.set(0, 0, mid); group.add(g);
    const planks = new THREE.InstancedMesh(plankGeo, plankMat, s.n); planks.castShadow = planks.receiveShadow = true; g.add(planks);
    for (const sx of [-1, 1]) for (const y of [0.95, 0.05]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, len + 0.4, 6).rotateX(Math.PI / 2), ropeMat); r.position.set(sx * (HW + 0.12), y, 0); g.add(r); }
    const hangers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4), ropeMat, Math.ceil(s.n / 2) * 2);
    for (let k = 0; k < hangers.count; k++) { const j = Math.floor(k / 2) * 2, sx = k % 2 ? 1 : -1; m4.makeTranslation(sx * (HW + 0.12), 0.5, len / 2 - (j + 0.5) * PL); hangers.setMatrixAt(k, m4); }
    g.add(hangers);
    for (const z of [s.z0 + 0.25, s.z1 - 0.25]) for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.5, 8), postMat); p.position.set(sx * (HW + 0.15), 0.6, z); p.castShadow = true; group.add(p); }
    const streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.04, 0.06), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }), 10); streaks.count = 0; group.add(streaks);
    const anchor = new THREE.Object3D(); anchor.position.set(0, 1.6, mid); group.add(anchor);
    const windTag = stage.tag(anchor, { text: '', height: 0, cls: 'rb-wind' }); windTag.el.style.display = 'none';
    const S = { s, g, planks, streaks, windTag, len, mid, hp: '', T: 0, tT: 0, dir: 0, on: 0, weak: [...s.weak].map(Number) };
    paint(S, '9'.repeat(s.n).split('').map((c, j) => (s.holes || []).includes(j) ? '-' : c).join(''));
    return S;
  });
  function paint(S, hp) {
    const old = S.hp; S.hp = hp;
    for (let j = 0; j < S.s.n; j++) {
      const c = hp[j], gone = c === '-', health = gone ? 0 : (+c) / 9, weak = S.weak[j];
      const sag = gone ? 0 : (1 - health) * 0.07;
      m4.compose(v.set(0, -0.06 - sag, S.len / 2 - (j + 0.5) * PL), q.setFromEuler(e3.set(0, 0, (j % 3 - 1) * 0.02)), gone ? sc.setScalar(0.0001) : sc.set(1, weak ? 0.55 : 1, 1));
      S.planks.setMatrixAt(j, m4);
      col.copy(weak ? WEAK : WOOD).lerp(WORN, Math.max(0, Math.min(1, (1 - health) * 1.3)));
      S.planks.setColorAt(j, col);
      if (gone && old && old[j] && old[j] !== '-') dropPlank(S, j, col.clone());
    }
    S.planks.instanceMatrix.needsUpdate = true; if (S.planks.instanceColor) S.planks.instanceColor.needsUpdate = true;
  }
  const fx = [];
  function dropPlank(S, j, c) {
    const m = new THREE.Mesh(plankGeo, std(c)); m.position.set(0, -0.06, S.s.z0 - (j + 0.5) * PL); group.add(m);
    fx.push({ m, t: 0, vy: 0, spin: (j % 2 ? 1 : -1) * (1.5 + (j % 3)) });
  }
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'bridges' }), hud = h('div', 'rb-hud'), banner = h('div', 'rb-banner');
  hud.innerHTML = '<span class="rb-me"></span><span class="rb-made"><b>Made it</b> <em>0</em>/' + ctx.players.length + '</span>';
  ctx.ui.append(hud, banner);
  const meEl = hud.querySelector('.rb-me'), madeEl = hud.querySelector('.rb-made em');
  if (ctx.me == null) meEl.style.display = 'none';
  const showBanner = (text, cls = '') => { banner.textContent = text; banner.className = 'rb-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'rb-banner'; }, 1700); };
  const done = new Set();
  let camZ = null;
  return {
    start() { showBanner('Cross!'); },
    state(g) {
      g.sp.forEach(([T, dir, on, hp], i) => {
        const S = spans[i]; if (!S) return;
        S.tT = T; S.dir = dir; S.on = on;
        if (hp !== S.hp) paint(S, hp);
        if (dir) { const txt = (dir > 0 ? 'WIND ➜' : '⬅ WIND'); if (S.windTag.el.textContent !== txt) S.windTag.set(txt); S.windTag.el.style.display = ''; S.windTag.el.classList.toggle('blow', !!on); }
        else S.windTag.el.style.display = 'none';
      });
      const sc2 = {}; let made = 0;
      for (const [pid, [crossed, d]] of Object.entries(g.pr)) { sc2[pid] = crossed; if (d) { made++; done.add(+pid); } if (+pid === ctx.me) { const t = d ? 'Safe across!' : `Bridge ${Math.min(3, crossed + 1)} of 3`; if (meEl.textContent !== t) meEl.textContent = t; } }
      if (madeEl.textContent !== String(made)) madeEl.textContent = made;
      { const y = bar.el.offsetTop + bar.el.offsetHeight + 6; if (y > 20 && hud.dataset.y !== String(y)) { hud.dataset.y = y; hud.style.top = y + 'px'; } }   // under the score bar, however many rows it wraps to
      bar.set(sc2, g.left);
      for (const pid of done) bar.mark(pid, 'fin');
    },
    event(ev) {
      const a = ev.pid != null ? ctx.actor(ev.pid) : null, mine = ev.pid === ctx.me;
      if (ev.e === 'fall') { if (a) floatText(stage, a.group.position.x, 1.8, a.group.position.z, ev.why === 'tip' ? 'Whoa!' : 'Aaah!', 'bad'); ctx.sfx(mine ? 'out' : 'splat'); if (mine) showBanner(ev.why === 'tip' ? 'Tipped off!' : 'Fell through!', 'bad'); }
      else if (ev.e === 'snap') ctx.sfx('trap');
      else if (ev.e === 'crack') { if (spans[ev.s]) ctx.sfx('tap'); }
      else if (ev.e === 'hop') { if (mine) ctx.sfx('throw'); }
      else if (ev.e === 'gust') ctx.sfx('pick');
      else if (ev.e === 'tip') { const S = spans[ev.s]; if (S && ev.n) floatText(stage, 0, 2.2, S.mid, 'TIPPED!', 'bad'); }
      else if (ev.e === 'safe') { if (mine) ctx.sfx('good'); }
      else if (ev.e === 'made') { a?.play('cheer', 900); ctx.sfx(mine ? 'win' : 'good'); if (a) floatText(stage, a.group.position.x, 2, a.group.position.z, 'Made it!', 'good'); }
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Everyone made it!' : "Time's up!", ev.ok ? 'good' : 'bad'); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    pose(pid, flags) {
      if (done.has(pid)) return 'cheer';
      if (flags & F.STUN) return 'hit';
      if (flags & F.AIR) return 'jump';
      return undefined;
    },
    frame(dt, t) {
      for (const S of spans) {
        S.T += (S.tT - S.T) * Math.min(1, dt * 8);
        S.g.rotation.z = -S.T * R.maxAngle + Math.sin(t * 1.7 + S.mid) * 0.01;
        // wind streaks while it blows
        if (S.on && S.dir) {
          S.streaks.count = 10;
          for (let k = 0; k < 10; k++) { const ph = (t * 1.6 + k * 0.37) % 1, x = S.dir * (-6 + ph * 12); m4.makeTranslation(x, 0.4 + (k % 4) * 0.35, S.mid - S.len / 2 + (k + 0.5) * S.len / 10); S.streaks.setMatrixAt(k, m4); }
          S.streaks.instanceMatrix.needsUpdate = true;
        } else S.streaks.count = 0;
      }
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]; f.t += dt; f.vy -= 12 * dt; f.m.position.y += f.vy * dt; f.m.rotation.x += f.spin * dt; f.m.rotation.z += f.spin * 0.4 * dt;
        if (f.m.position.y < -15) { f.m.removeFromParent(); f.m.material.dispose(); fx.splice(i, 1); }
      }
      // follow the team: frame every player still crossing (everyone, once all are over)
      let lo = Infinity, hi = -Infinity;
      for (const p of ctx.players) { if (done.has(p.pid) && done.size < ctx.players.length) continue; const ps = ctx.pos(p.pid); if (!ps) continue; lo = Math.min(lo, ps.z); hi = Math.max(hi, ps.z); }
      if (lo === Infinity) { lo = course.hd - 6; hi = course.hd - 2; }
      const want = (lo + hi) / 2 - 1.5;
      camZ = camZ == null ? want : camZ + (want - camZ) * Math.min(1, dt * 3);
      ctx.camera({ cx: 0, cz: camZ, hw: 3.4, hd: Math.max(6.5, (hi - lo) / 2 + 3.2), pitch: 50 });
    },
    dispose() { bar.el.remove(); hud.remove(); banner.remove(); for (const S of spans) S.windTag.remove(); clearTimeout(showBanner.t); },
  };
}
