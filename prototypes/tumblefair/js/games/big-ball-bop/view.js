// BIG BALL BOP, as drawn: a striped lawn pitch with white lines, fat inflatable bumpers along the sides (instanced, in
// the two team colours: red/green on the left half that red + green defend, blue/pink on the right), and a goal at each
// end — white posts, a crossbar and a see-through net with the defending team's colour along its foot. A tag over each
// goal says who shoots there ("SHOOT HERE!" over yours, with the team's seat shapes). The giant beach ball has six
// coloured panels and white caps, rolls as it moves, squashes when it lands and casts a shadow that shrinks as it flies.
// Goalie Gus is a Chibi dwarf in a keeper's cap with big orange gloves, shuffling in front of his goal. HUD: the score
// bar, a team scoreboard pill under it ("● ▲ 2 : 1 ■ ◆", solo: "You 2 · Gus 1"), GOAL! banners and a 3-2-1 at kick-off.
import { RULES } from './sim.js';
import { scoreBar, floatText, h } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const TEAM = [{ name: 'Red + Green', shapes: '● ▲', a: '#ff4d4d', b: '#3ecf5a', cls: 't0' }, { name: 'Blue + Pink', shapes: '■ ◆', a: '#3d8bff', b: '#ff6fb5', cls: 't1' }];
export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena, R = RULES.R, GW = init.goalW ?? RULES.goalW;
  const mats = [], geos = [], texs = [], tags = [];
  const std = (c, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...extra }); mats.push(m); return m; };
  const basic = (c, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color: c, transparent: true, depthWrite: false, ...extra }); mats.push(m); return m; };
  const geo = g => { geos.push(g); return g; };
  const mesh = (g, m, x = 0, y = 0, z = 0, parent = group) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), e3 = new THREE.Euler(), col = new THREE.Color();
  const myTeam = me != null ? init.teams?.[me] : null;

  // ---- the pitch
  mesh(geo(new THREE.PlaneGeometry(90, 70).rotateX(-Math.PI / 2)), std('#6fb850', { roughness: 1 }), 0, -0.03, 0).receiveShadow = true;
  const turf = canvasTexture(256, 128, (c, w, hh) => { for (let i = 0; i < 10; i++) { c.fillStyle = i % 2 ? '#7fcf5c' : '#72c252'; c.fillRect(i * w / 10, 0, w / 10, hh); } }); texs.push(turf);
  mesh(geo(new THREE.PlaneGeometry(hw * 2, hd * 2).rotateX(-Math.PI / 2)), std('#ffffff', { map: turf, roughness: 1 }), 0, 0, 0).receiveShadow = true;
  const line = basic('#ffffff', { opacity: 0.85 });
  mesh(geo(new THREE.PlaneGeometry(0.12, hd * 2).rotateX(-Math.PI / 2)), line, 0, 0.01, 0);
  mesh(geo(new THREE.RingGeometry(1.9, 2.02, 48).rotateX(-Math.PI / 2)), line, 0, 0.01, 0);
  for (const sx of [-1, 1]) { mesh(geo(new THREE.PlaneGeometry(0.12, GW * 2 + 1.6).rotateX(-Math.PI / 2)), line, sx * (hw - 2.4), 0.01, 0); for (const sz of [-1, 1]) mesh(geo(new THREE.PlaneGeometry(2.4, 0.12).rotateX(-Math.PI / 2)), line, sx * (hw - 1.2), 0.01, sz * (GW + 0.8)); }
  // inflatable bumpers along the sides and the ends beside the goals
  const segs = [];
  for (const sz of [-1, 1]) for (let x = -hw + 0.5; x < hw; x += 1) segs.push([x, sz * (hd + 0.35), 0, x < 0 ? 0 : 1]);
  for (const sx of [-1, 1]) for (let z = -hd + 0.5; z < hd; z += 1) if (Math.abs(z) > GW + 0.2) segs.push([sx * (hw + 0.35), z, Math.PI / 2, sx < 0 ? 0 : 1]);
  const bump = new THREE.InstancedMesh(geo(new THREE.CylinderGeometry(0.35, 0.35, 1.02, 12).rotateZ(Math.PI / 2)), std('#ffffff', { roughness: 0.4 }), segs.length);
  segs.forEach(([x, z, r, t], i) => { m4.compose(v3.set(x, 0.35, z), q.setFromEuler(e3.set(0, r, 0)), sc.set(1, 1, 1)); bump.setMatrixAt(i, m4); bump.setColorAt(i, col.set(i % 2 ? TEAM[t].a : TEAM[t].b)); });
  bump.castShadow = true; group.add(bump);
  // goals: posts + crossbar + a see-through net, the defending team's colour along the foot
  const netTex = canvasTexture(64, 64, (c, w) => { c.clearRect(0, 0, w, w); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; for (let i = 0; i <= 8; i++) { c.beginPath(); c.moveTo(i * 8, 0); c.lineTo(i * 8, w); c.stroke(); c.beginPath(); c.moveTo(0, i * 8); c.lineTo(w, i * 8); c.stroke(); } }); texs.push(netTex);
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(4, 2);
  const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }); mats.push(netMat);
  const postMat = std('#ffffff', { roughness: 0.3 }), postGeo = geo(new THREE.CylinderGeometry(0.15, 0.15, 2.8, 12));
  for (const sx of [-1, 1]) {
    const g = new THREE.Group(); g.position.x = sx * hw; group.add(g); const def = sx > 0 ? 1 : 0;      // the right goal is defended by team 1
    for (const sz of [-1, 1]) mesh(postGeo, postMat, 0, 1.4, sz * GW, g).castShadow = true;
    const bar = mesh(geo(new THREE.CylinderGeometry(0.15, 0.15, GW * 2, 12).rotateX(Math.PI / 2)), postMat, 0, 2.8, 0, g); bar.castShadow = true;
    mesh(geo(new THREE.PlaneGeometry(GW * 2, 2.8)), netMat, sx * RULES.net, 1.4, 0, g).rotation.y = Math.PI / 2;
    for (const sz of [-1, 1]) mesh(geo(new THREE.PlaneGeometry(RULES.net, 2.8)), netMat, sx * RULES.net / 2, 1.4, sz * GW, g);
    mesh(geo(new THREE.PlaneGeometry(RULES.net, GW * 2)), netMat, sx * RULES.net / 2, 2.8, 0, g).rotation.x = Math.PI / 2;
    mesh(geo(new THREE.PlaneGeometry(RULES.net + 0.2, GW * 2 + 0.3).rotateX(-Math.PI / 2)), basic(TEAM[def].a, { opacity: 0.35 }), sx * RULES.net / 2, 0.015, 0, g);
    const shooter = 1 - def, T = TEAM[shooter];
    const anchor = new THREE.Object3D(); anchor.position.set(-sx * 2.4, 0, -GW - 0.6); g.add(anchor);     // inside the pitch, so the tag never runs off a phone's edge
    const arrow = sx > 0 ? '▶' : '◀', mineT = myTeam === shooter;
    tags.push(stage.tag(anchor, { text: mineT ? (sx > 0 ? `SHOOT HERE ${arrow}` : `${arrow} SHOOT HERE`) : (sx > 0 ? `${T.shapes} shoot ${arrow}` : `${arrow} ${T.shapes} shoot`), height: 0.4, cls: `bbb-goal bbb-${T.cls}${mineT ? ' mine' : ''}`, declutter: false }));
  }

  // ---- the beach ball: six panels + white caps (an equirect texture), rolling
  const ballTex = canvasTexture(256, 128, (c, w, hh) => { const P = ['#ff4d4d', '#ffffff', '#3d8bff', '#ffd23f', '#3ecf5a', '#ff8a3d']; for (let i = 0; i < 6; i++) { c.fillStyle = P[i]; c.fillRect(i * w / 6, 0, w / 6 + 1, hh); } c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, hh * 0.1); c.fillRect(0, hh * 0.9, w, hh * 0.1); }); texs.push(ballTex);
  const ballG = new THREE.Group(); group.add(ballG);
  const ball = mesh(geo(new THREE.SphereGeometry(R, 32, 20)), std('#ffffff', { map: ballTex, roughness: 0.35 }), 0, 0, 0, ballG); ball.castShadow = true;
  const shadow = mesh(geo(new THREE.CircleGeometry(R, 28).rotateX(-Math.PI / 2)), basic('#000000', { opacity: 0.25 }), 0, 0.02, 0);
  const B = { x: 0, z: 0, y: 2.6, sq: 0 }, axis = new THREE.Vector3(), rq = new THREE.Quaternion();

  // ---- Goalie Gus
  const gus = { x: 0, z: 0, a: null };
  if (init.gus) {
    ctx.createActor({ look: { race: 'dwarf', seed: 8812 }, seat: null }, { scale: 1.15 }).then(a => {
      if (!a) return; gus.a = a;
      const glove = std('#ff8a3d', { roughness: 0.5 }), gg = geo(new THREE.SphereGeometry(0.2, 12, 8));
      for (const sx of [-1, 1]) mesh(gg, glove, sx * 0.55, 0.95, 0.15, a.group);
      mesh(geo(new THREE.CylinderGeometry(0.32, 0.36, 0.22, 14)), std(TEAM[init.gus.team].a), 0, a.height - 0.05, 0, a.group);
      tags.push(stage.tag(a.group, { text: 'Goalie Gus', height: a.height + 0.35, cls: `bbb-gus bbb-${TEAM[init.gus.team].cls}` }));
      a.setPose?.('ready');
    });
  }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'goals' });
  const board = h('div', 'bbb-board'); ctx.ui.append(board);
  const banner = h('div', 'bbb-banner'); ctx.ui.append(banner);
  let bt = 0; const showBanner = (text, cls = '', ms = 1400) => { banner.textContent = text; banner.className = 'bbb-banner show ' + cls; clearTimeout(bt); bt = setTimeout(() => { banner.className = 'bbb-banner'; }, ms); };
  let lastBoard = '';
  const setBoard = gs => {
    const html = init.solo ? `<b>You ${gs[init.teams[me ?? ctx.players[0]?.pid] ?? 0]}</b>${init.gus ? `<span>·</span><em>Gus ${gs[init.gus.team]}</em>` : ''}`
      : `<span class="bbb-t t0${myTeam === 0 ? ' mine' : ''}">${TEAM[0].shapes} <b>${gs[0]}</b></span><span>:</span><span class="bbb-t t1${myTeam === 1 ? ' mine' : ''}"><b>${gs[1]}</b> ${TEAM[1].shapes}</span>`;
    if (html !== lastBoard) { lastBoard = html; board.innerHTML = html; }
  };
  setBoard([0, 0]);

  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => { stage.setSafe?.(tall() ? { top: 0.16 } : { top: 0.12 }); ctx.camera({ cx: 0, cz: 0.2, hw: hw + 1.2, hd: hd + 1.0, tall: tall() ? 3.4 : 3 }, { instant: true }); };
  frameCam(); addEventListener('resize', frameCam);
  let G = null, ph = 'ready', count = -1;

  return {
    winter: { spots: [[-13, 0, -8], [13, 0, -8], [-13, 0, 7], [13, 0, 7]] },
    halloween: { spots: [[-13, 0, -8], [13, 0, -8], [-13, 0, 7], [13, 0, 7]], ghosts: [[-11, 3, -9], [11, 3, -9]] },
    start() { frameCam(); showBanner(myTeam != null && !init.solo ? `You shoot ${myTeam === 0 ? 'RIGHT ▶' : '◀ LEFT'}` : 'Big Ball Bop!', '', 1600); },
    state(g) {
      G = g;
      if (g.ph !== ph) { ph = g.ph; count = -1; }
      if ((g.ph === 'kickoff' || g.ph === 'ready') && g.pl > 0) { const c = Math.ceil(g.pl * 3 / (g.ph === 'ready' ? RULES.start : RULES.kickoff)); if (c !== count && c > 0) { count = c; if (g.ph === 'ready' && c <= 3) showBanner(String(c), '', 500); } }
      setBoard(g.gs); bar.set(g.sc, g.left);
    },
    event(ev) {
      if (ev.e === 'go') { showBanner('BOP!', 'good', 700); ctx.sfx('pick'); }
      else if (ev.e === 'bop') { B.sq = 0.3; ctx.sfx(ev.pid === me ? 'throw' : 'hit'); ctx.actor(ev.pid)?.play('punch', 350); floatText(stage, ev.x, 2.8, ev.z, 'BOP!', ''); }
      else if (ev.e === 'lunge') { ctx.actor(ev.pid)?.play('punch', 350); }
      else if (ev.e === 'bump') { const p = ctx.pos(ev.on); if (p) floatText(stage, p.x, 2, p.z, 'OOF!', 'bad'); ctx.sfx(ev.on === me ? 'bad' : 'hit'); }
      else if (ev.e === 'header') { const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2.6, p.z, 'HEADER!', 'good'); ctx.sfx('hit'); }
      else if (ev.e === 'squeeze') { floatText(stage, B.x, 3, B.z, 'SQUEEZE!', ''); B.sq = 0.4; }
      else if (ev.e === 'thud') { B.sq = Math.min(0.35, ev.v * 0.05); }
      else if (ev.e === 'post') { ctx.sfx('trap'); floatText(stage, B.x, 3, B.z, 'POST!', ''); }
      else if (ev.e === 'save') { floatText(stage, ev.x, 2.6, ev.z, 'SAVED!', 'bad'); ctx.sfx('hit'); gus.a?.play?.('punch', 400); }
      else if (ev.e === 'goal') {
        const mine = myTeam === ev.team, who = init.solo ? (init.gus && ev.team === init.gus.team ? 'Gus scores!' : 'GOAL!') : `GOAL! ${TEAM[ev.team].shapes}`;
        showBanner(ev.own != null && !init.solo ? 'OWN GOAL!' : who, mine || (init.solo && !(init.gus && ev.team === init.gus.team)) ? 'good' : 'bad', 2000);
        ctx.sfx(mine || init.solo ? 'win' : 'bad');
        for (let i = 0; i < 6; i++) floatText(stage, B.x + (i - 2.5) * 0.5, 2 + (i % 3) * 0.5, B.z, ['★', '✦', '●', '▲', '■', '◆'][i], 'good');
        if (ev.team === init.gus?.team) gus.a?.play?.('cheer', 1200);
      }
      else if (ev.e === 'kickoff') { showBanner('Kick-off!', '', 800); }
      else if (ev.e === 'hop') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { const [a, b] = ev.g; showBanner(init.solo ? `${a + b > 0 ? 'Full time!' : 'Full time'}` : a === b ? 'A draw!' : `${TEAM[a > b ? 0 : 1].shapes} win!`, 'good', 4000); ctx.sfx('win'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 350); },
    pose(pid, flags) {
      if (flags & F.STUN) return 'hit';
      if (G?.ph === 'end') { const t = init.teams?.[pid], gs = G.gs; return init.solo || gs[t] > gs[1 - t] ? 'cheer' : gs[t] === gs[1 - t] ? undefined : 'sitGround'; }
      if (flags & F.AIR) return 'jump'; return undefined;
    },
    frame(dt, t) {
      if (G) {
        const [x, z, y, vx, vz] = G.b, k = Math.min(1, dt * 14), jump = Math.hypot(x - B.x, z - B.z) > 3;
        B.x = jump ? x : B.x + (x - B.x) * k; B.z = jump ? z : B.z + (z - B.z) * k; B.y = jump ? y : B.y + (y - B.y) * k;
        const sp = Math.hypot(vx, vz);
        if (sp > 0.05 && G.ph === 'play') { axis.set(vz, 0, -vx).normalize(); rq.setFromAxisAngle(axis, sp * dt / R); ball.quaternion.premultiply(rq); }
      }
      B.sq = Math.max(0, B.sq - dt * 1.6);
      const s = 1 + B.sq * Math.sin(t * 40) * 0.25;
      ballG.position.set(B.x, B.y + R * (1 - B.sq * 0.4), B.z); ballG.scale.set(s + B.sq * 0.3, 1 - B.sq * 0.4, s + B.sq * 0.3);
      shadow.position.set(B.x, 0.02, B.z); shadow.scale.setScalar(Math.max(0.35, 1 - B.y * 0.15)); shadow.material.opacity = Math.max(0.08, 0.25 - B.y * 0.03);
      if (gus.a && G?.gu) { const [gx, gz] = G.gu, k = Math.min(1, dt * 10); const ox = gus.x, oz = gus.z; gus.x += (gx - gus.x) * k; gus.z += (gz - gus.z) * k; const sp = Math.hypot(gus.x - ox, gus.z - oz) / Math.max(dt, 1e-3); gus.a.place(gus.x, 0, gus.z, gx > 0 ? -Math.PI / 2 : Math.PI / 2); gus.a.setSpeed?.(sp > 0.2 ? sp : 0); gus.a.update(dt); }
    },
    dispose() { clearTimeout(bt); removeEventListener('resize', frameCam); bar.el.remove(); board.remove(); banner.remove(); for (const tg of tags) tg.remove(); for (const m of mats) m.dispose(); for (const g of geos) g.dispose(); for (const x of texs) x.dispose(); },
  };
}
