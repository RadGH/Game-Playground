// REEL RUMBLE, as drawn: a lake seen from a grassy shore, a long wooden dock along the front with a peg (a little
// coloured mat) for each player, reeds and lily pads round the edge, trees behind. Fish are dark shadows under the
// surface — the size of the shadow is the size of the fish; a Moonscale's shadow glints gold. Everyone holds a rod
// (on the hand bone) with a line to their bobber; while YOU charge a cast a ring + dotted arc show where it lands. A
// nibble twitches the bobber, a bite plunges it with a splash and "BITE!"; while reeling a tension meter floats by
// your character (red zone at the top, "SURGE!" when the fish thrashes) and a bar shows how far out the fish is. A
// landed catch is held up over your head with its name, weight and points. Halloween: a moonlit purple lake and the
// fish's Halloween names (fish-species.js `hw`); the rules are the same.
import { CAST, WATER, castSpot, MEDALS } from './sim.js';
import { charge, castFlight, reelTarget } from '../fish-kit.js';
import { fishName, BY_ID } from '../fish-species.js';
import { fishViewKit } from '../fish-view.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { btnText } from '../../client/buttons.js';

export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx, HW = ctx.season === 'halloween';
  const K = fishViewKit(THREE, group), mats = [];
  const std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...extra }); mats.push(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), up = new THREE.Vector3(0, 1, 0);
  const W = init.water || WATER, pegs = init.pegs, period = init.level?.period || 1.8;
  const C = HW ? { grass: '#2f4a3a', water: '#3a2f6e', deep: '#241a4a', sand: '#6a5a6a', wood: '#6a4a3a', reed: '#3f6a45', tree: '#2c4a35', pad: '#3f7a4c' }
               : { grass: '#6cc45a', water: '#3fa8d8', deep: '#2a7ab8', sand: '#f2d9a0', wood: '#b07a4a', reed: '#4f9a4a', tree: '#2f8a45', pad: '#4fae47' };
  // ---- shore, lake, dock
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2), std(C.grass, { roughness: 1 })); ground.position.y = -0.05; ground.receiveShadow = true; group.add(ground);
  const lakeW = W.x1 - W.x0 + 1.6, lakeD = W.z1 - W.z0 + 1.2;
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(lakeW + 1.4, lakeD + 1).rotateX(-Math.PI / 2), std(C.sand, { roughness: 1 })); sand.position.set(0, -0.04, (W.z0 + W.z1) / 2 + 0.2); group.add(sand);
  const lake = new THREE.Mesh(new THREE.PlaneGeometry(lakeW, lakeD, 1, 8).rotateX(-Math.PI / 2), std(C.water, { roughness: 0.25, metalness: 0.1 })); lake.position.set(0, -0.02, (W.z0 + W.z1) / 2); group.add(lake);
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(lakeW - 1, lakeD * 0.45).rotateX(-Math.PI / 2), basic(C.deep, { transparent: true, opacity: 0.45, depthWrite: false })); deep.position.set(0, -0.015, W.z0 + lakeD * 0.25); group.add(deep);
  const sparkle = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.5, 0.06).rotateX(-Math.PI / 2), basic('#ffffff', { transparent: true, opacity: 0.5, depthWrite: false }), 40);
  for (let i = 0; i < 40; i++) { m4.compose(v.set(W.x0 + ((i * 97) % 100) / 100 * (W.x1 - W.x0), -0.005, W.z0 + ((i * 53) % 100) / 100 * (W.z1 - W.z0)), q.identity(), sc.setScalar(1)); sparkle.setMatrixAt(i, m4); } group.add(sparkle);
  const dockZ = pegs[0]?.z ?? 5, wood = std(C.wood);
  const dock = new THREE.Mesh(new THREE.BoxGeometry(17.5, 0.16, 1.9), wood); dock.position.set(0, 0.0, dockZ - 0.1); dock.receiveShadow = true; dock.castShadow = true; group.add(dock);
  const plankLines = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.02, 1.9), std('#5a3a22'), 28);
  for (let i = 0; i < 28; i++) { m4.makeTranslation(-8.6 + i * 0.64, 0.09, dockZ - 0.1); plankLines.setMatrixAt(i, m4); } group.add(plankLines);
  const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.11, 0.9, 8), wood, 12);
  for (let i = 0; i < 12; i++) { m4.makeTranslation(-8.4 + (i >> 1) * 3.36, -0.25, dockZ - 1 + (i % 2) * 1.8); posts.setMatrixAt(i, m4); } group.add(posts);
  for (const [i, pg] of pegs.entries()) { const p = players[i]; if (!p) continue; const mat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 1.0), std(p.color)); mat.position.set(pg.x, 0.1, pg.z + 0.45); group.add(mat); }
  // reeds, lily pads, trees
  const RE = 60, reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.05, 1.2, 4), std(C.reed), RE);
  for (let i = 0; i < RE; i++) { const side = i % 3, u = ((i * 37) % 100) / 100; const x = side === 0 ? W.x0 - 0.6 - (i % 2) * 0.3 : side === 1 ? W.x1 + 0.6 + (i % 2) * 0.3 : W.x0 + u * (W.x1 - W.x0), z = side === 2 ? W.z0 - 0.6 - (i % 2) * 0.3 : W.z0 + u * (W.z1 - W.z0); m4.compose(v.set(x, 0.5, z), q.setFromEuler(e3.set((i % 5 - 2) * 0.08, 0, (i % 3 - 1) * 0.1)), sc.set(1, 0.7 + (i % 4) * 0.2, 1)); reeds.setMatrixAt(i, m4); }
  group.add(reeds);
  const PD = 9, pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.38, 12, 0.3, Math.PI * 2 - 0.6).rotateX(-Math.PI / 2), std(C.pad), PD);
  for (let i = 0; i < PD; i++) { const x = i % 2 ? W.x0 + 0.6 + (i % 3) * 0.5 : W.x1 - 0.6 - (i % 3) * 0.5, z = W.z0 + 1 + i * 0.9; m4.compose(v.set(x, 0.0, z), q.setFromAxisAngle(up, i), sc.setScalar(0.8 + (i % 3) * 0.2)); pads.setMatrixAt(i, m4); }
  group.add(pads);
  const TR = 10, trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6), std('#5a3e2a'), TR), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.4, 1), std(C.tree, { flatShading: true }), TR);
  for (let i = 0; i < TR; i++) { const x = -12 + i * 2.7, z = W.z0 - 3 - (i % 2) * 1.5; m4.makeTranslation(x, 0.8, z); trunks.setMatrixAt(i, m4); m4.compose(v.set(x, 2.3, z), q.setFromEuler(e3.set(0, i, 0)), sc.set(1, 1.2, 1)); crowns.setMatrixAt(i, m4); }
  trunks.castShadow = crowns.castShadow = true; group.add(trunks, crowns);
  if (HW) { const moon = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), basic('#fff3c8')); moon.position.set(6, 8, W.z0 - 14); group.add(moon); }

  // ---- fish shadows (one instanced mesh; gold glints for Moonscales)
  const MAXF = 16, shadowGeo = new THREE.CircleGeometry(0.5, 16);
  shadowGeo.rotateX(-Math.PI / 2); shadowGeo.scale(0.5, 1, 1);
  const shadows = new THREE.InstancedMesh(shadowGeo, basic(HW ? '#120a24' : '#0d3050', { transparent: true, opacity: 0.45, depthWrite: false }), MAXF); shadows.count = 0; group.add(shadows);
  const glints = new THREE.InstancedMesh(new THREE.CircleGeometry(0.18, 10).rotateX(-Math.PI / 2), basic('#ffe36b', { transparent: true, opacity: 0.9, depthWrite: false }), 4); glints.count = 0; group.add(glints);
  const fishes = new Map();
  // ---- per player: rod, line, bobber, ripple, landing preview, held-up catch
  const rippleGeo = new THREE.RingGeometry(0.22, 0.3, 24).rotateX(-Math.PI / 2);
  const R = new Map();
  for (const p of players) {
    const bob = K.bobber(p.color); bob.visible = false; group.add(bob);
    const rip = new THREE.Mesh(rippleGeo, basic('#ffffff', { transparent: true, opacity: 0.7, depthWrite: false })); rip.visible = false; group.add(rip);
    R.set(p.pid, { bob, rip, line: K.line(), rod: null, st: 0, x: 0, z: 0, y: 0, tx: 0, tz: 0, ty: 0, ten: 0, surge: 0, ch: 0, dist: 0, nib: 0, bite: 0, show: null, showT: 0 });
  }
  const preview = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.46, 28).rotateX(-Math.PI / 2), basic('#ffffff', { transparent: true, opacity: 0.9, depthWrite: false })); preview.visible = false; group.add(preview);
  const NDOT = 14, dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), basic('#ffffff', { transparent: true, opacity: 0.85 }), NDOT); dots.count = 0; group.add(dots);
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' });
  const pill = h('div', 'gp-pill'), banner = h('div', 'gp-banner'), meter = h('div', 'gp-meter', '<i></i><b>CAST</b>');
  const ten = h('div', 'fk-ten', '<i></i><b>LINE</b><em>SURGE!</em>'), dist = h('div', 'fk-dist', '<i></i>'), card = h('div', 'fk-catch');
  ten.style.setProperty('--red', Math.round((1 - (reelTarget[init.level?.d] ?? 0.8)) * 100 + 8) + '%');
  ctx.ui.append(pill, banner, meter, ten, dist, card);
  const medals = init.medals ? h('div', 'fk-medals', init.medals.map((m, i) => `<span>${['🥉', '🥈', '🥇'][i]} ${m}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const tenFill = ten.querySelector('i'), distFill = dist.querySelector('i'), meterFill = meter.querySelector('i');
  const showBanner = (html, cls = '', ms = 1300) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const showCard = (html, ms = 1800) => { card.innerHTML = html; card.classList.add('show'); clearTimeout(showCard.t); showCard.t = setTimeout(() => card.classList.remove('show'), ms); };
  const nm = id => fishName(id, ctx.season);
  const HINT = { 0: 'Aim, then hold A and let go to cast', 1: 'Casting…', 2: 'Wait for a bite… (A = reel in)', 3: '<b>BITE!</b> Press A!', 4: 'Hold A to reel, let go to ease the line', 5: '' };
  let held = 0, lastIn = 0, last = null;
  const myPeg = me != null ? pegs[players.findIndex(p => p.pid === me)] : null;
  // a portrait phone frames its own stretch of dock and the water in front of it
  const FULL = { cx: 0, cz: -0.4, hw: 9.4, hd: 7 };
  const frameCam = instant => {
    if (!(myPeg && innerHeight > innerWidth * 1.15)) { ctx.camera(FULL, { instant }); return; }
    ctx.camera({ cx: Math.max(-4, Math.min(4, myPeg.x)), cz: -0.6, hw: 5.2, hd: 7 }, { instant });
  };
  frameCam(true);
  const tip = new THREE.Vector3(), bp = new THREE.Vector3();

  return {
    halloween: { spots: [[-9.6, 0, 6.4], [-6.5, 0, 6.8], [6.5, 0, 6.8], [9.6, 0, 6.4], [-10.2, 0, -2], [10.2, 0, -2]], ghosts: [[-4, 2.4, -4], [4, 2.6, -5]], mist: false },
    input(inp) { if (inp.b & 1) { held += 0.05; lastIn = performance.now(); } },
    state(g) {
      last = g;
      for (const row of g.b) {
        const S = R.get(row[0]); if (!S) continue;
        const [, st, x, z, y, tn, surge, ch, ds] = row;
        if (st === 1 && S.st !== 1) { S.x = x; S.z = z; S.y = y; }
        S.st = st; S.tx = x; S.tz = z; S.ty = y; S.ten = tn / 100; S.surge = surge; S.ch = ch / 100; S.dist = ds / 100;
      }
      const seen = new Set();
      for (const [id, x, z, hd, size, gold] of g.f) { seen.add(id); let f = fishes.get(id); if (!f) { f = { x, z, h: hd, size, gold }; fishes.set(id, f); } f.tx = x; f.tz = z; f.th = hd; }
      for (const id of [...fishes.keys()]) if (!seen.has(id)) fishes.delete(id);
      bar.set(g.sc, g.left);
      const mine = me != null ? R.get(me) : null;
      pill.innerHTML = mine ? btnText(HINT[mine.st] || '', ctx.meta.controls, { html: true }) : '<b>Reel Rumble</b> <em>biggest catch wins</em>';
      pill.style.display = pill.innerHTML ? '' : 'none';
      if (medals) medals.querySelectorAll('span').forEach((s, i) => s.classList.toggle('won', (g.sc[players[0].pid] || 0) >= init.medals[i]));
    },
    event(ev) {
      const S = R.get(ev.pid);
      if (ev.e === 'cast') { ctx.actor(ev.pid)?.play('attack', 420); if (ev.pid === me) { held = 0; ctx.sfx('throw'); } }
      else if (ev.e === 'plop') { if (S) { S.rip.visible = true; S.ripT = 0; } if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'nib') { if (S) S.nib = 1.2; }
      else if (ev.e === 'bite') { if (S) { S.bite = 1; S.ripT = 0; } if (ev.pid === me) { showBanner('BITE!', 'good', 700); ctx.sfx('pick'); } }
      else if (ev.e === 'miss') { if (ev.pid === me) { showBanner('Too slow!', 'bad', 900); ctx.sfx('bad'); } }
      else if (ev.e === 'hook') { if (ev.pid === me) { showBanner(ev.size >= 1 ? 'A BIG ONE!' : 'Hooked!', 'good', 800); ctx.sfx('hit'); } }
      else if (ev.e === 'snap') { if (ev.pid === me) { showBanner('SNAP!', 'bad'); ctx.sfx('bad'); } ctx.actor(ev.pid)?.play('hit', 600); }
      else if (ev.e === 'free') { if (ev.pid === me) { showBanner('It got away!', 'bad'); ctx.sfx('out'); } }
      else if (ev.e === 'back') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'land') {
        const a = ctx.actor(ev.pid), at = ctx.pos(ev.pid);
        if (S) { if (S.show) group.remove(S.show); S.show = K.fish(ev.sp); S.show.rotation.set(0, Math.PI / 2, 0.25); S.showT = 1.5; group.add(S.show); }
        if (at) floatText(stage, at.x, 2.9, at.z, ev.junk ? nm(ev.sp) : `+${ev.pts}`, ev.junk ? 'bad' : 'good');
        if (!ev.junk) a?.play('cheer', 1200);
        if (ev.pid === me) { showCard(ev.junk ? `${nm(ev.sp)}<small>Just junk!</small>` : `${nm(ev.sp)} · +${ev.pts}<small>${ev.kg} kg</small>`); ctx.sfx(ev.junk ? 'bad' : ev.pts >= 8 ? 'win' : 'coins'); }
      }
      else if (ev.e === 'end') { const s = last?.sc || {}; const solo = players.length === 1 && init.medals; const p0 = s[players[0].pid] ?? 0; showBanner(solo ? `${p0} pts<small>${p0 >= MEDALS[2] ? '🥇 Gold!' : p0 >= MEDALS[1] ? '🥈 Silver' : p0 >= MEDALS[0] ? '🥉 Bronze' : 'Keep fishing!'}</small>` : 'Lines in!', 'good', 4000); ctx.sfx('win'); }
    },
    pose(pid) { const S = R.get(pid); if (!S) return undefined; if (S.st === 4) return 'ready'; if (S.st === 0 && (pid === me ? held > 0 : S.ch > 0)) return 'ready'; return undefined; },
    frame(dt, t) {
      frameCam(false);
      if (me != null && held > 0 && performance.now() - lastIn > 160) held = 0;
      // shadows
      let i = 0, gi = 0; const k = 1 - Math.exp(-dt * 8);
      for (const f of fishes.values()) {
        f.x += (f.tx - f.x) * k; f.z += (f.tz - f.z) * k; let dh = f.th - f.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); f.h += dh * k;
        if (i < MAXF) { m4.compose(v.set(f.x, 0.005, f.z), q.setFromAxisAngle(up, f.h), sc.set(f.size * 1.6, 1, f.size * 1.6)); shadows.setMatrixAt(i++, m4); }
        if (f.gold && gi < 4) { const gl = 0.5 + 0.5 * Math.sin(t * 6 + f.x); m4.compose(v.set(f.x, 0.01, f.z), q.identity(), sc.setScalar(gl)); glints.setMatrixAt(gi++, m4); }
      }
      shadows.count = i; shadows.instanceMatrix.needsUpdate = true; glints.count = gi; glints.instanceMatrix.needsUpdate = true;
      // bobbers, lines, rods
      for (const p of players) {
        const S = R.get(p.pid), a = ctx.actor(p.pid);
        if (!S.rod && a) S.rod = K.rod(a, p.color);
        const kk = 1 - Math.exp(-dt * 14); S.x += (S.tx - S.x) * kk; S.z += (S.tz - S.z) * kk; S.y += (S.ty - S.y) * kk;
        const out = S.st >= 1 && S.st <= 4;
        S.bob.visible = out;
        if (out) {
          let y = S.st === 1 ? S.y : 0.05 + Math.sin(t * 2.2 + p.pid) * 0.02;
          if (S.nib > 0 && S.st === 2) { S.nib -= dt; y -= Math.max(0, Math.sin(t * 22)) * 0.06; }
          if (S.st === 3) y = -0.08 + Math.sin(t * 30) * 0.03;
          if (S.st === 4) y = 0.02 + Math.sin(t * 18) * 0.05 * (1 + S.surge * 2);
          S.bob.position.set(S.x, y, S.z); S.bob.rotation.z = S.st === 4 ? Math.sin(t * 14) * 0.4 : 0;
        }
        S.rip.visible = S.st >= 2 && S.st <= 4;
        if (S.rip.visible) { S.ripT = ((S.ripT || 0) + dt * (S.st >= 3 ? 2.4 : 0.7)) % 1; S.rip.position.set(S.x, 0.01, S.z); S.rip.scale.setScalar(1 + S.ripT * (S.st >= 3 ? 3 : 2)); S.rip.material.opacity = 0.7 * (1 - S.ripT); }
        const tp = K.tipPos(S.rod, tip);
        if (out && tp) S.line.set(tp, bp.set(S.x, S.bob.position.y + 0.1, S.z), S.st === 4 ? 0.05 + (1 - S.ten) * 0.2 : 0.5); else S.line.show(false);
        if (S.rod) S.rod.g.rotation.z = S.st === 4 ? -0.25 - S.ten * 0.5 + Math.sin(t * 20) * 0.03 * S.ten : 0;
        if (S.show) { S.showT -= dt; const at = ctx.pos(p.pid); if (at) S.show.position.set(at.x, 2.25 + Math.sin(t * 8) * 0.05, at.z); K.swim(S.show, t, 14); if (S.showT <= 0) { group.remove(S.show); S.show = null; } }
      }
      // my aim: ring + dotted arc while I can cast; tension + distance while reeling
      const mine = me != null ? R.get(me) : null;
      if (mine && mine.st === 0 && myPeg) {
        const a = ctx.actor(me), yaw = a ? a.body.group.rotation.y : Math.PI, p = Math.max(0.02, charge(held, period)), at = castSpot(myPeg, yaw, p);
        const f = castFlight(Math.hypot(at.x - myPeg.x, at.z - myPeg.z));
        preview.visible = true; preview.position.set(at.x, 0.03, at.z);
        const n = held > 0 ? NDOT : 5;
        for (let j = 0; j < n; j++) { const u = (j + 1) / (NDOT + 1), x = myPeg.x + (at.x - myPeg.x) * u, z = myPeg.z + (at.z - myPeg.z) * u; m4.compose(v.set(x, 0.9 + 4 * f.apex * u * (1 - u), z), q.identity(), sc.setScalar(1)); dots.setMatrixAt(j, m4); }
        dots.count = n; dots.instanceMatrix.needsUpdate = true;
        const s = stage.toScreen(myPeg.x, 0.4, myPeg.z); meter.style.transform = `translate(${(s.x + 40).toFixed(0)}px, ${(s.y - 100).toFixed(0)}px)`;
        meter.classList.toggle('on', held > 0); meterFill.style.height = Math.round(p * 100) + '%';
      } else { preview.visible = false; dots.count = 0; meter.classList.remove('on'); }
      if (mine && mine.st === 4 && myPeg) {
        const s = stage.toScreen(myPeg.x, 0.4, myPeg.z);
        ten.style.transform = `translate(${(s.x + 42).toFixed(0)}px, ${(s.y - 120).toFixed(0)}px)`; ten.classList.add('on');
        tenFill.style.height = `calc(${Math.round(Math.min(1, mine.ten) * 100)}% - 6px)`;
        ten.classList.toggle('warm', mine.ten > 0.55); ten.classList.toggle('hot', mine.ten > (reelTarget[init.level?.d] ?? 0.8)); ten.classList.toggle('surge', !!mine.surge);
        dist.style.transform = `translate(${(s.x - 45).toFixed(0)}px, ${(s.y + 26).toFixed(0)}px)`; dist.classList.add('on'); distFill.style.width = Math.round(mine.dist * 100) + '%';
      } else { ten.classList.remove('on'); dist.classList.remove('on'); }
      void CAST; void BY_ID;
    },
    dispose() { bar.el.remove(); clearTimeout(showBanner.t); clearTimeout(showCard.t); for (const m of mats) m.dispose(); K.dispose(); shadowGeo.dispose(); rippleGeo.dispose(); },
  };
}
