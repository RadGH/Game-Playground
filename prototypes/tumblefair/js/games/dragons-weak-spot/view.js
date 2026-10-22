// DRAGON'S WEAK SPOT, as drawn: a sandy fairground yard with striped fences, and behind its back edge a big goofy
// dragon made of plain shapes — a fat green body, a cream belly with four round plywood SCALES on it (Sun, Moon,
// Star, Leaf: each a colour AND a picture), a long neck with a round head, googly eyes, little horns, stubby wings and
// a tail with a red bow. In front of each scale, a strike pad on the ground with the same picture.
// Fire rings: a red ring + a filling disc where a fireball will land, then a ball drops in and bursts. Fire sweep: the
// swept arc glows orange on the ground first, then the head swings and a flame sweeps across. When it is dizzy the
// head droops, stars circle it and the scales light up (emissive turned up, never a light switched on).
// HUD: dragon health bar, team hearts, a banner, and in a window the progress pips + a draining timer bar. Your phone
// shows YOUR steps of the secret order in a card (solo: the one step you are on).
import { RULES, SCALES, sweepAngle, padAt } from './sim.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';

const INK = '#0d2228';
/** The picture on a scale, as SVG (HUD + phone card). */
export function scaleIcon(i, size = 40) {
  const s = SCALES[i], c = s.color, st = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  const art = {
    circle: `<circle cx="20" cy="20" r="9" fill="${c}" ${st}/>` + [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const a = k * Math.PI / 4; return `<path d="M${20 + Math.sin(a) * 12} ${20 + Math.cos(a) * 12} L${20 + Math.sin(a) * 17} ${20 + Math.cos(a) * 17}" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`; }).join(''),
    moon: `<path d="M26 5 A15 15 0 1 0 26 35 A17 17 0 0 1 26 5 Z" fill="${c}" ${st}/>`,
    star: `<path d="M20 3 L24.7 14.5 L37 15.3 L27.6 23.2 L30.6 35.3 L20 28.7 L9.4 35.3 L12.4 23.2 L3 15.3 L15.3 14.5 Z" fill="${c}" ${st}/>`,
    leaf: `<path d="M6 34 Q6 8 34 6 Q32 34 6 34 Z" fill="${c}" ${st}/><path d="M8 32 L26 14" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/>`,
  }[s.shape];
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${art}</svg>`;
}

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena, O = RULES.origin;
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra }); mats.push(m); return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();

  // ---- the yard
  mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#7cc95e'), 0, -0.03, 0).receiveShadow = true;
  mesh(new THREE.PlaneGeometry(hw * 2, hd * 2 + 3).rotateX(-Math.PI / 2), std('#ecd39a', { roughness: 1 }), 0, 0, -1.5).receiveShadow = true;
  // striped fence posts down the sides and the front (one instanced mesh)
  const postN = 2 * 12 + 18, posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 1, 0.28), std('#ffffff'), postN), col = new THREE.Color();
  let pi = 0;
  const post = (x, z) => { m4.compose(v.set(x, 0.5, z), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(pi, m4); posts.setColorAt(pi, col.set(pi % 2 ? '#e8434f' : '#fff3e0')); pi++; };
  for (const sx of [-1, 1]) for (let k = 0; k < 12; k++) post(sx * (hw + 0.4), -hd - 2 + k * (hd * 2 + 2.4) / 11);
  for (let k = 0; k < 18; k++) post(-hw - 0.4 + k * (hw * 2 + 0.8) / 17, hd + 0.4);
  posts.castShadow = true; group.add(posts);

  // ---- the strike pads (picture + colour on the ground)
  const shapeOf = i => {
    const S = new THREE.Shape(), k = SCALES[i].shape;
    if (k === 'circle') S.absarc(0, 0, 0.62, 0, Math.PI * 2, false);
    else if (k === 'moon') { S.absarc(0, 0, 0.7, Math.PI * 0.3, Math.PI * 1.7, false); S.absarc(0.32, 0, 0.5, Math.PI * 1.55, Math.PI * 0.45, true); }
    else if (k === 'star') { for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5, r = j % 2 ? 0.32 : 0.78; const x = Math.sin(a) * r, y = Math.cos(a) * r; j ? S.lineTo(x, y) : S.moveTo(x, y); } }
    else { S.moveTo(-0.6, -0.6); S.quadraticCurveTo(-0.6, 0.55, 0.65, 0.65); S.quadraticCurveTo(0.55, -0.6, -0.6, -0.6); }
    return new THREE.ShapeGeometry(S, 10).rotateX(-Math.PI / 2);
  };
  const pads = SCALES.map((s, i) => {
    const p = padAt(i), g = new THREE.Group(); g.position.set(p.x, 0, p.z); group.add(g);
    mesh(new THREE.CylinderGeometry(RULES.reach - 0.15, RULES.reach - 0.05, 0.12, 28), std('#fff8e7'), 0, 0.06, 0, g).receiveShadow = true;
    const ring = mesh(new THREE.TorusGeometry(RULES.reach - 0.1, 0.07, 6, 32).rotateX(Math.PI / 2), std(INK), 0, 0.13, 0, g);
    const icon = mesh(shapeOf(i), std(s.color, { emissive: new THREE.Color(s.color), emissiveIntensity: 0.05 }), 0, 0.14, 0, g);
    icon.scale.setScalar(1.15);
    return { g, ring, icon };
  });

  // ---- the dragon
  const D = new THREE.Group(); D.position.set(0, 0, O.z + 0.2); group.add(D);
  const green = std('#4fbf5a'), dark = std('#2f8f3e'), cream = std('#fff1c9'), white = std('#ffffff', { roughness: 0.3 }), ink = std(INK, { roughness: 0.4 }), horn = std('#ffd23f'), bowM = std('#e8434f');
  const body = mesh(new THREE.SphereGeometry(3.4, 28, 18), green, 0, 2.2, -0.6, D); body.scale.set(2.1, 0.95, 0.7); body.castShadow = true;
  const belly = mesh(new THREE.SphereGeometry(3, 26, 16), cream, 0, 2.0, 0.85, D); belly.scale.set(2.25, 0.82, 0.42);
  // the four scales on its chest, right above their pads
  const scales = SCALES.map((s, i) => {
    const g = new THREE.Group(); g.position.set(RULES.pads[i] * 0.98, 2.15 + (i === 1 || i === 2 ? 0.35 : 0), 2.05 - (i === 0 || i === 3 ? 0.35 : 0)); D.add(g);
    g.rotation.x = -0.25; g.rotation.y = -RULES.pads[i] * 0.05;
    const disc = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 26).rotateX(Math.PI / 2), std('#e7d7a8'), 0, 0, 0, g);
    const glow = std(s.color, { emissive: new THREE.Color(s.color), emissiveIntensity: 0.08 });
    const pic = mesh(shapeOf(i).rotateX(Math.PI / 2), glow, 0, 0, 0.12, g); pic.scale.setScalar(1.05);
    const lid = mesh(new THREE.SphereGeometry(1.0, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), dark, 0, 0, 0.05, g); lid.scale.set(1, 1, 0.45);
    return { g, disc, glow, lid, pop: 0 };
  });
  // stubby legs and wings
  for (const sx of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.4, 14), green, sx * 5.4, 0.7, 1.3, D); leg.castShadow = true;
    for (const t of [-0.35, 0, 0.35]) mesh(new THREE.ConeGeometry(0.16, 0.4, 8).rotateX(Math.PI / 2), white, sx * 5.4 + t, 0.15, 2.15, D);
    const wing = new THREE.Group(); wing.position.set(sx * 3.4, 4.1, -1.2); D.add(wing);
    const wm = mesh(new THREE.ConeGeometry(1.6, 3.2, 3), std('#7fd88a', { flatShading: true }), sx * 1.4, 0.6, 0, wing); wm.rotation.z = -sx * 1.1; wm.scale.set(1, 1, 0.25);
    wing.userData.sx = sx; D.userData[sx < 0 ? 'wl' : 'wr'] = wing;
  }
  // tail with a bow
  const tail = new THREE.Group(); tail.position.set(6.6, 1.3, -1.2); D.add(tail);
  [0.9, 0.75, 0.6, 0.46, 0.34].forEach((r, i) => mesh(new THREE.SphereGeometry(r, 14, 10), green, 0.9 * i, 0.15 * i, -0.25 * i, tail));
  for (const sx of [-1, 1]) { const b = mesh(new THREE.ConeGeometry(0.42, 0.8, 4), bowM, 3.9 + sx * 0.4, 0.95, -1.05, tail); b.rotation.z = sx * Math.PI / 2; }
  // neck and head: the neck pivots on the body, the head follows the beam
  const neck = new THREE.Group(); neck.position.set(0, 3.6, 0.2); D.add(neck);
  const neckM = mesh(new THREE.CylinderGeometry(0.75, 1.1, 2.6, 16), green, 0, 1.2, 0.4, neck); neckM.rotation.x = 0.35;
  const head = new THREE.Group(); head.position.set(0, 2.6, 1.0); neck.add(head);
  mesh(new THREE.SphereGeometry(1.25, 22, 16), green, 0, 0, 0, head).scale.set(1.15, 0.95, 1);
  const snout = mesh(new THREE.SphereGeometry(0.9, 18, 12), green, 0, -0.3, 1.0, head); snout.scale.set(1.1, 0.7, 1);
  for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.12, 8, 6), ink, sx * 0.35, -0.05, 1.82, head);
  const jaw = mesh(new THREE.SphereGeometry(0.8, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std('#ff8fa3'), 0, -0.55, 0.95, head); jaw.scale.set(1.05, 0.5, 0.9);
  const eyes = [];
  for (const sx of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(0.42, 16, 12), white, sx * 0.55, 0.62, 0.8, head);
    eyes.push(mesh(new THREE.SphereGeometry(0.2, 12, 8), ink, 0, 0, 0.3, e));
    const hn = mesh(new THREE.ConeGeometry(0.2, 0.7, 10), horn, sx * 0.6, 1.25, -0.2, head); hn.rotation.z = -sx * 0.4;
  }
  // dizzy stars over its head
  const dizzy = new THREE.Group(); dizzy.position.set(0, 1.9, 0); head.add(dizzy); dizzy.visible = false;
  const dStars = []; for (let k = 0; k < 4; k++) dStars.push(mesh(shapeOf(2).rotateX(Math.PI / 2), std('#ffd23f', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.4 }), 0, 0, 0, dizzy));
  dStars.forEach(s => s.scale.setScalar(0.45));
  D.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- attack pieces: rings, the fireball, the sweep fan and its flame
  const ringGeo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const ballGeo = new THREE.IcosahedronGeometry(0.55, 1), fireM = std('#ff7a1a', { emissive: new THREE.Color('#ff5a00'), emissiveIntensity: 0.9 });
  const rings = new Map(), fx = [];
  function addRing([id, x, z, left, total]) {
    const R = { id, x, z, left, total };
    R.ring = mesh(ringGeo, basic('#ff3b3b', { opacity: 0.95 }), x, 0.07, z); R.ring.scale.setScalar(RULES.ringR);
    R.fill = mesh(discGeo, basic('#ffb04a', { opacity: 0.55 }), x, 0.06, z);
    R.ball = mesh(ballGeo, fireM, x, 12, z);
    rings.set(id, R);
  }
  function dropRing(R) { group.remove(R.ring, R.fill, R.ball); R.ring.material.dispose(); R.fill.material.dispose(); }
  const FAN_R = 17;
  const fan = mesh(new THREE.CircleGeometry(FAN_R, 40, -Math.PI / 2 - RULES.sweepArc, RULES.sweepArc * 2).rotateX(-Math.PI / 2), basic('#ff7a1a', { opacity: 0 }), O.x, 0.05, O.z);
  fan.rotation.y = 0;
  const beam = new THREE.Group(); beam.position.set(O.x, 0.6, O.z); group.add(beam); beam.visible = false;
  const flame = mesh(new THREE.ConeGeometry(1.1, FAN_R, 12, 1, true).rotateX(-Math.PI / 2), basic('#ffb02e', { opacity: 0.85, side: THREE.DoubleSide }), 0, 0.6, FAN_R / 2, beam);
  const flameCore = mesh(new THREE.ConeGeometry(0.5, FAN_R, 10, 1, true).rotateX(-Math.PI / 2), basic('#fff3a0', { opacity: 0.9, side: THREE.DoubleSide }), 0, 0.6, FAN_R / 2, beam);
  const puffGeo = new THREE.IcosahedronGeometry(0.6, 0);
  function puff(x, y, z, color, size = 1) { const p = mesh(puffGeo, basic(color, { opacity: 0.9 }), x, y, z); p.userData.size = size; fx.push({ p, t: 0 }); }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'damage' });
  const hud = h('div', 'dw-hud'), banner = h('div', 'dw-banner'), card = h('div', 'dw-card');
  hud.innerHTML = `<div class="dw-hp"><b>Dragon</b><span class="dw-bar"><i></i></span><em></em></div><div class="dw-row"><span class="dw-hearts" aria-label="team hearts"></span><span class="dw-pips"></span><span class="dw-wbar"><i></i></span></div>`;
  ctx.ui.append(hud, banner, card);
  const hpFill = hud.querySelector('.dw-bar i'), hpTxt = hud.querySelector('.dw-hp em'), heartsEl = hud.querySelector('.dw-hearts'), pipsEl = hud.querySelector('.dw-pips'), wbar = hud.querySelector('.dw-wbar'), wFill = wbar.querySelector('i');
  const maxH = init.hearts;
  let G = null, lastPh = '', hearts = maxH, sweepT = null, sweepDir = 1, sweepId = 0, winTotal = 0, cardKey = '';
  const showBanner = (text, cls = '', ms = 1500) => { banner.textContent = text; banner.className = 'dw-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'dw-banner'; }, ms); };
  const drawHearts = n => { const s = '♥'.repeat(n) + '♡'.repeat(Math.max(0, maxH - n)); if (heartsEl.textContent !== s) heartsEl.textContent = s; heartsEl.classList.toggle('low', n <= 1); };
  drawHearts(maxH);
  function drawCard(pv) {
    const key = JSON.stringify(pv); if (key === cardKey) return; cardKey = key;
    if (me == null || !pv?.pat) { card.className = 'dw-card'; card.innerHTML = ''; return; }
    card.className = 'dw-card show';
    if (init.solo) {
      const [i, s] = pv.pat[0] || [];
      card.innerHTML = s == null ? '' : `<small>Next scale<br>${i + 1} of ${pv.len}</small><span class="dw-step now">${scaleIcon(s, 30)}<b>${esc(SCALES[s].name)}</b></span>`;
      return;
    }
    if (!pv.pat.length) { card.innerHTML = `<p>No steps for you this time (${pv.len} in all).<br>Listen to your team!</p>`; return; }
    card.innerHTML = `<small>Call out<br>your steps!</small>${pv.pat.map(([i, s]) => `<span class="dw-step${i === pv.step ? ' now' : ''}${i < pv.step ? ' done' : ''}"><u>${i + 1}</u>${scaleIcon(s, 30)}<b>${esc(SCALES[s].name)}</b></span>`).join('')}`;
  }
  const tall = () => innerHeight > innerWidth * 1.15;
  // frame the yard AND the dragon behind it (its head stands ~6 m up behind the back edge)
  const frameCam = () => { stage.setSafe?.(tall() ? { top: 0.2 } : { top: 0.15 }); ctx.camera({ cx: 0, cz: -2.4, hw: hw + 0.6, hd: hd + 3.4, tall: 4.5 }, { instant: true }); };
  const safe = frameCam; safe(); addEventListener('resize', safe);

  return {
    start() { frameCam(); showBanner('Here it comes!'); },
    state(g) {
      G = g;
      for (const R of rings.values()) R.seen = false;
      for (const row of g.rg) { const R = rings.get(row[0]); if (R) { R.seen = true; R.left = Math.min(R.left, row[3]); } else { addRing(row); rings.get(row[0]).seen = true; } }
      for (const [id, R] of rings) if (!R.seen) { dropRing(R); rings.delete(id); }
      if (g.sw) { if (g.sw[0] !== sweepId) { sweepId = g.sw[0]; sweepDir = g.sw[1]; sweepT = g.sw[2]; } else if (Math.abs(sweepT - g.sw[2]) > 0.2) sweepT = g.sw[2]; } else sweepT = null;
      hpFill.style.width = (100 * g.hp / init.hpMax).toFixed(1) + '%'; hpTxt.textContent = g.hp;
      if (g.hearts !== hearts) { hearts = g.hearts; drawHearts(hearts); }
      if (g.ph !== lastPh) {
        if (g.ph === 'window') { winTotal = g.wl; for (const s of scales) s.pop = 1; }
        lastPh = g.ph; hud.dataset.ph = g.ph;
      }
      if (g.ph === 'window') {
        const pips = Array.from({ length: g.len }, (_, i) => `<i class="${i < g.st ? 'done' : i === g.st ? 'now' : ''}">${i < g.st ? '✓' : i + 1}</i>`).join('');
        if (pipsEl.innerHTML !== pips) pipsEl.innerHTML = pips;
        wFill.style.width = (100 * g.wl / Math.max(0.1, winTotal)).toFixed(1) + '%';
      } else if (pipsEl.innerHTML) pipsEl.innerHTML = '';
      bar.set(g.sc, g.left);
    },
    priv(d) { drawCard(d); },
    event(ev) {
      if (ev.e === 'roar') { showBanner(ev.kind === 'sweep' ? 'Fire sweep: HOP!' : 'Fire rings: move!', 'warn', 1200); ctx.sfx('trap'); }
      else if (ev.e === 'boom') { puff(ev.x, 0.5, ev.z, '#ff8a2a', 1.6); puff(ev.x, 0.9, ev.z, '#ffd23f', 0.9); ctx.sfx('splat'); }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, '-1 ♥', 'bad'); ctx.actor(ev.pid)?.play('hit', 600); }
      else if (ev.e === 'dizzy') { showBanner('Dizzy! Strike the scales!', 'good', 1700); ctx.sfx('pick'); }
      else if (ev.e === 'hit') {
        const p = padAt(ev.pad); scales[ev.pad].pop = 1.6; ctx.sfx(ev.pid === me ? 'coins' : 'good');
        floatText(stage, p.x, 3.4, p.z - 1.5, `-${ev.dmg}${ev.done ? ' COMBO!' : ''}`, 'good'); puff(p.x, 2.6, p.z - 2.2, SCALES[ev.pad].color, 1.3);
        if (ev.done) showBanner('Combo!', 'good', 1100);
      } else if (ev.e === 'wrong') { ctx.sfx('bad'); const p = padAt(ev.pad); floatText(stage, p.x, 2.6, p.z, 'Wrong scale!', 'bad'); showBanner('It flinched!', 'bad', 900); }
      else if (ev.e === 'clang') { if (ev.pid === me) { ctx.sfx('tap'); const p = padAt(ev.pad); floatText(stage, p.x, 2.2, p.z, 'Wait for dizzy!', ''); } }
      else if (ev.e === 'recover') { if (!ev.combo) showBanner('It shook it off!', 'bad', 1100); }
      else if (ev.e === 'hop') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Dragon beaten!' : 'The dragon wins!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
    },
    input(inp) { if (inp.b & IN.A) ctx.actor(me)?.play('punch', 380); },
    pose(pid, flags) {
      if (flags & F.AIR) return 'jump';
      if (flags & F.STUN) return 'hit';
      if (G?.ph === 'end') return 'cheer';
      return undefined;
    },
    frame(dt, t) {
      const ph = G?.ph || 'ready', win = ph === 'window';
      // rings: the fill grows, the fireball drops in for the last half second
      for (const R of rings.values()) {
        R.left = Math.max(0, R.left - dt); const k = 1 - R.left / R.total;
        R.fill.scale.setScalar(Math.max(0.01, k * RULES.ringR * 0.9));
        R.ring.material.opacity = k > 0.7 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 18)) : 0.95;
        const fall = Math.max(0, R.left / 0.5); R.ball.position.y = Math.min(12, 0.5 + fall * 11); R.ball.visible = R.left < 0.55; R.ball.rotation.y += dt * 6;
      }
      // the sweep: the arc glows during the warning, then the flame and the head swing through it
      let headYaw = Math.sin(t * 0.7) * 0.15;
      if (sweepT != null) {
        sweepT += dt;
        if (sweepT < 0) { fan.material.opacity = 0.18 + 0.2 * Math.abs(Math.sin(t * 9)); beam.visible = false; headYaw = sweepAngle(sweepDir, 0); }
        else { const a = sweepAngle(sweepDir, sweepT); fan.material.opacity = 0.12; beam.visible = sweepT < RULES.sweepDur; beam.rotation.y = a; headYaw = a; flame.scale.x = flameCore.scale.x = 0.8 + 0.3 * Math.sin(t * 40); }
      } else { fan.material.opacity = 0; beam.visible = false; }
      neck.rotation.y += (headYaw - neck.rotation.y) * Math.min(1, dt * 10);
      neck.rotation.x += ((win ? -0.35 : ph === 'end' && G.hp <= 0 ? -0.6 : 0) - neck.rotation.x) * Math.min(1, dt * 4);
      jaw.rotation.x = sweepT != null && sweepT > -0.4 ? 0.5 : win ? 0.25 : 0.05 * Math.sin(t * 2);
      head.rotation.z = win ? Math.sin(t * 3) * 0.25 : 0;
      dizzy.visible = win; if (win) { dizzy.rotation.y = t * 3; dStars.forEach((s, k) => { const a = k * Math.PI / 2; s.position.set(Math.sin(a) * 1.1, 0.1 * Math.sin(t * 5 + k), Math.cos(a) * 1.1); }); }
      for (const e of eyes) e.position.set(win ? Math.sin(t * 6) * 0.15 : 0, win ? Math.cos(t * 6) * 0.15 : 0, 0.3);
      body.scale.y = 0.95 + 0.03 * Math.sin(t * 1.8);
      for (const w of [D.userData.wl, D.userData.wr]) w.rotation.z = w.userData.sx * (0.15 + 0.15 * Math.sin(t * (win ? 2 : 5)));
      tail.rotation.y = Math.sin(t * 1.3) * 0.25;
      // scales open and glow in a window; pads glow with them
      scales.forEach((s, i) => {
        s.lid.scale.y += ((win ? 0.05 : 1) - s.lid.scale.y) * Math.min(1, dt * 8); s.lid.visible = s.lid.scale.y > 0.08;
        s.glow.emissiveIntensity = win ? 0.45 + 0.3 * Math.abs(Math.sin(t * 4 + i)) : 0.05;
        s.pop = Math.max(0, s.pop - dt * 3); s.g.scale.setScalar(1 + 0.25 * Math.min(1, s.pop));
        pads[i].icon.material.emissiveIntensity = win ? 0.35 + 0.25 * Math.abs(Math.sin(t * 4 + i)) : 0.05;
        pads[i].ring.position.y = 0.13 + (win ? 0.04 * Math.sin(t * 6 + i) : 0);
      });
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; f.p.scale.setScalar(f.p.userData.size * (0.4 + f.t * 2.6)); f.p.material.opacity = Math.max(0, 0.9 - f.t * 1.8); if (f.t > 0.5) { group.remove(f.p); f.p.material.dispose(); fx.splice(i, 1); } }
    },
    dispose() { bar.el.remove(); for (const R of rings.values()) dropRing(R); clearTimeout(showBanner.t); removeEventListener('resize', safe); for (const m of mats) m.dispose(); },
  };
}
