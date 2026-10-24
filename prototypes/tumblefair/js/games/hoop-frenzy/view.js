// HOOP FRENZY, as drawn: a fairground hoops booth under a striped awning, seen from behind the shooters. One lane per
// player (a seat-coloured strip with three marks: close, middle and the gold far mark that is worth 3), a hoop at the
// end of each lane on a pole in the seat colour. Each player's character stands on their mark, throws, and walks to
// the next mark. A ball flies the exact path the server sent (hoops-kit flyShot), on fire after three makes in a row,
// gold in the money-ball finish; the net swishes on a make. On a phone that plays: the HOLD panel at the bottom (the
// meter runs here; the green band is where this mark's shot drops) with the mark, the points and the streak above it.
import { SPOTS, THREE_AT, PLAY, slideAt, laneX } from './sim.js';
import { idealPower, tolFor, pathAt } from '../hoops-kit.js';
import { createHoopsArt, powerPanel } from '../hoops-view.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { PALETTE } from '../../client/halloween.js';

const MARK = ['close', 'middle', 'far', 'middle'];
export function createView(ctx) {
  const { THREE, group, stage, players, me, init } = ctx, HW = ctx.season === 'halloween', L = init.level, n = init.n;
  const art = createHoopsArt(ctx), std = art.std, g_ = art.g_, tags = [];
  const laneOf = pid => init.lanes[pid];
  // ---- the booth: floor, lanes, awning, back wall
  const W = n * init.lane + 2.4;
  const floor = new THREE.Mesh(g_(new THREE.PlaneGeometry(W + 10, 16).rotateX(-Math.PI / 2)), std(HW ? '#2d2340' : '#d9a066', { roughness: 0.9 })); floor.position.set(0, 0, -1); floor.receiveShadow = true; group.add(floor);
  const back = new THREE.Mesh(g_(new THREE.PlaneGeometry(W + 4, 6)), std(HW ? '#3a2160' : '#3d8bff', { roughness: 1 })); back.position.set(0, 3, init.hoopZ - 1.6); group.add(back);
  const NS = 14, awn = new THREE.InstancedMesh(g_(new THREE.BoxGeometry((W + 4) / NS, 0.12, 2.4)), std('#ffffff'), NS), m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < NS; i++) { m4.makeRotationX(-0.35); m4.setPosition(-(W + 4) / 2 + (i + 0.5) * (W + 4) / NS, 5.6, init.hoopZ - 0.6); awn.setMatrixAt(i, m4); awn.setColorAt(i, col.set(i % 2 ? '#ffffff' : HW ? PALETTE.orange : '#e8473a')); }
  group.add(awn);
  for (const s of [-1, 1]) { const post = new THREE.Mesh(g_(new THREE.CylinderGeometry(0.12, 0.12, 6, 8)), std(HW ? '#5a3a7a' : '#ffd23f')); post.position.set(s * (W / 2 + 1.6), 3, init.hoopZ - 1.2); group.add(post); }
  const hoops = new Map(), lanes = new Map();
  players.forEach(p => {
    const i = laneOf(p.pid), x = laneX(i, n);
    const strip = new THREE.Mesh(g_(new THREE.PlaneGeometry(init.lane - 0.3, 7).rotateX(-Math.PI / 2)), std(p.color, { transparent: true, opacity: 0.35, depthWrite: false })); strip.position.set(x, 0.01, init.hoopZ + 3.1); group.add(strip);
    const marks = SPOTS.slice(0, 3).map((d, k) => { const m = new THREE.Mesh(g_(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2)), std(d >= THREE_AT ? '#ffd23f' : '#ffffff', { roughness: 0.7 })); m.position.set(x, 0.02, init.hoopZ + d); group.add(m); return m; });
    const hp = art.hoop({ x, y: init.rimY, z: init.hoopZ, color: p.color }); group.add(hp); hoops.set(p.pid, hp);
    lanes.set(p.pid, { i, x, marks, actor: null, pos: { x, z: init.hoopZ + SPOTS[0] }, target: { x, z: init.hoopZ + SPOTS[0] } });
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }).then(a => { if (!a) return; const Ln = lanes.get(p.pid); Ln.actor = a; a.place(Ln.pos.x, 0, Ln.pos.z, Math.PI); tags.push(stage.tag(a.group, { text: p.pid === me ? 'YOU' : p.name, seat: p.seat, height: a.height + 0.3, cls: p.pid === me ? 'me' : '' })); });
  });
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = (instant = false) => ctx.camera(tall() ? { cx: 0, cz: init.hoopZ + 2.4, hw: Math.max(2.4, n * init.lane / 2 + 0.3), hd: 2.9, pitch: 14, tall: 4.2 } : { cx: 0, cz: init.hoopZ + 2.8, hw: n * init.lane / 2 + 1.4, hd: 3.6, pitch: 16, tall: 4.4 }, { instant });
  frameCam(true);
  // ---- balls in the air
  const flying = [];
  const pool = Array.from({ length: Math.min(10, n * 3) }, () => { const b = art.ball(); b.visible = false; group.add(b); return b; });
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'pts' }), playing = me != null;
  const pill = h('div', 'gp-pill'), banner = h('div', 'gp-banner'); ctx.ui.append(banner); if (me == null) ctx.ui.append(pill);
  const medals = init.medals ? h('div', 'hk-medals', [...init.medals].reverse().map(([s, k]) => `<span data-s="${s}">${{ gold: '🥇', silver: '🥈', bronze: '🥉' }[k]} ${s}</span>`).join('')) : null; if (medals) ctx.ui.append(medals);
  const showBanner = (html, cls = '', ms = 1500) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  let hoopT = -1.5, last = null, sentAt = -9, myK = 0;
  const panel = playing ? powerPanel(ctx, { period: L.period, label: 'HOLD to shoot', onShoot: p => { ctx.send('shoot', { p, ht: Math.round(Math.max(0, hoopT) * 100) / 100 }); sentAt = performance.now() / 1000; lanes.get(me)?.actor?.play('throw', 520); ctx.sfx('throw'); } }) : null;
  if (!playing) pill.textContent = 'Hold, let go in the green — three in a row is ON FIRE!';
  function setBand(k) { if (!panel) return; const d = SPOTS[k % SPOTS.length], p = idealPower(d), t = tolFor(d, L.tol); panel.band(p - t, p + t); }
  setBand(0);
  return {
    state(g) {
      if (last && g.go && !last.go) hoopT = 0;
      if (last && g.left !== last.left && g.go) hoopT = PLAY - g.left + 0.05;
      last = g; bar.set(g.sc, g.left);
      for (const p of players) {
        const [k, streak] = g.st[p.pid], Ln = lanes.get(p.pid);
        Ln.target = { x: Ln.x, z: init.hoopZ + SPOTS[k % SPOTS.length] };
        Ln.fire = streak >= init.fireAt;
      }
      if (panel) {
        const [k, streak, cool] = g.st[me]; if (k !== myK) { myK = k; setBand(k); }
        const d = SPOTS[k % SPOTS.length], pts = (d >= THREE_AT ? 3 : 2) * (streak >= init.fireAt ? 2 : 1) * (g.mb ? 2 : 1);
        panel.info(`<span>Mark: <b>${MARK[k % 4]}${d >= THREE_AT ? ' (3)' : ''}</b></span><span>${streak >= init.fireAt ? '<span class="hk-fire">🔥 ON FIRE</span> ' : streak ? `${streak} in a row` : ''}${g.mb ? ' <span class="hk-gold">💰 money</span>' : ''}</span><span>+${pts} a make</span>`);
        const busy = cool || performance.now() / 1000 - sentAt < 0.35;
        panel.mode(!g.go ? (g.left <= 0 || hoopT > 1 ? 'done' : 'wait') : busy ? 'fly' : 'ready');
      }
      if (medals) medals.querySelectorAll('span').forEach(s => s.classList.toggle('won', (g.sc[players[0].pid] || 0) >= +s.dataset.s));
      if (!playing) pill.textContent = g.mb ? '💰 Money balls! Double points' : 'Hold, let go in the green — three in a row is ON FIRE!';
    },
    event(ev) {
      if (ev.e === 'shot') {
        const b = pool.find(x => !x.visible) || pool[0]; b.visible = true; b.userData.look({ fire: !!ev.fire, gold: !!ev.gold });
        flying.push({ b, path: ev.path, t: 0, T: ev.T, pid: ev.pid, made: ev.made, swished: false });
        if (ev.pid !== me) lanes.get(ev.pid)?.actor?.play('throw', 520);
      } else if (ev.e === 'make') {
        const Ln = lanes.get(ev.pid); floatText(stage, Ln.x, init.rimY + 0.6, init.hoopZ, `+${ev.pts}${ev.fire ? ' 🔥' : ''}`, 'good');
        if (ev.pid === me) { ctx.sfx(ev.pts >= 6 ? 'coins' : 'good'); if (ev.lit) showBanner('ON FIRE!<small>double points until you miss</small>', 'good', 1600); }
        if (ev.lit) Ln.actor?.play('cheer', 900);
      } else if (ev.e === 'miss') {
        if (ev.pid === me) { ctx.sfx('bad'); if (ev.out) showBanner('Fire out!', 'bad', 1100); }
      } else if (ev.e === 'end') {
        ctx.sfx('win');
        const sc = last?.sc || {}, best = Math.max(0, ...Object.values(sc));
        if (init.medals) { const m = init.medals.find(([s]) => best >= s); showBanner(`${best} points<small>${m ? { gold: '🥇 Gold!', silver: '🥈 Silver', bronze: '🥉 Bronze' }[m[1]] : 'Keep shooting!'}</small>`, 'good', 4000); }
        else { const who = players.filter(p => sc[p.pid] === best && best > 0).map(p => p.name).join(' & '); if (who) showBanner(`${best} points<small>${who}</small>`, 'good', 4000); }
      }
    },
    frame(dt, t) {
      frameCam();
      if (last?.go) hoopT += dt;
      for (const p of players) {
        const Ln = lanes.get(p.pid), hp = hoops.get(p.pid);
        hp.position.x = Ln.x + slideAt(L, Math.max(0, hoopT), Ln.i, PLAY); hp.userData.frame(dt);
        const dz = Ln.target.z - Ln.pos.z, sp = Math.min(Math.abs(dz), dt * 4);
        Ln.pos.z += Math.sign(dz) * sp;
        if (Ln.actor) { Ln.actor.place(Ln.pos.x, 0, Ln.pos.z, Math.PI); Ln.actor.setSpeed?.(Math.abs(dz) > 0.05 ? 2.5 : 0); Ln.actor.update(dt); }
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const F = flying[i]; F.t += dt;
        const [x, y, z] = pathAt(F.path, F.t); F.b.position.set(x, y, z); F.b.rotation.x -= dt * 8; F.b.userData.flicker(t);
        if (F.made && !F.swished && F.t >= F.T) { F.swished = true; hoops.get(F.pid)?.userData.swish(); }
        if (F.t > (F.path.length / 3 - 1) * 0.05 + 0.15) { F.b.visible = false; flying.splice(i, 1); }
      }
      panel?.frame();
    },
    dispose() { clearTimeout(showBanner.t); bar.el.remove(); panel?.dispose(); for (const tg of tags) tg.remove(); art.dispose(); },
  };
}
