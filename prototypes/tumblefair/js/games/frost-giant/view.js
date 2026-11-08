// FROST GIANT'S WEAK SPOT, as drawn: a snowy yard with candy-cane fence posts, two big snow piles at the front corners,
// and behind its back edge a huge goofy giant built of stacked snowballs — a round belly with four ice CRYSTALS on it
// (Flake, Star, Heart, Bell: each a colour AND a picture), a round head with coal eyes, a carrot nose, a woolly hat,
// icicle shoulders and two big mitten hands resting on the snow. In front of each crystal, a throw pad with the same
// picture. Icicles: a blue ring + a filling disc where an icicle will drop, then it falls in and bursts. Freeze wave:
// a frosty ring glows round its feet, then rolls out across the whole yard. When it is dizzy its head wobbles, stars
// circle it and the crystals glow (emissive turned up, never a light switched on).
// HUD: giant health bar, team hearts, YOUR snowballs, a banner, and in a window the progress pips + a draining bar.
// Your phone shows YOUR steps of the secret order in a card (solo: the one step you are on). Solo: Pip the snow sprite
// floats by the pads and tosses a snowball now and then.
import { RULES, GEMS, waveRadius, padAt } from './sim.js';
import { scoreBar, floatText, h, esc } from '../../client/gamehud.js';
import { F } from '../../shared/arena.js';
import { IN } from '../../shared/protocol.js';
import { treeGeo } from '../../client/winter.js';

const INK = '#0d2228';
/** The picture on a crystal, as SVG (HUD + phone card). */
export function gemIcon(i, size = 40) {
  const s = GEMS[i], c = s.color, st = `stroke="${INK}" stroke-width="3" stroke-linejoin="round"`;
  const art = {
    flake: `<circle cx="20" cy="20" r="6" fill="${c}" ${st}/>` + [0, 1, 2, 3, 4, 5].map(k => { const a = k * Math.PI / 3; return `<path d="M${20 + Math.sin(a) * 7} ${20 + Math.cos(a) * 7} L${20 + Math.sin(a) * 17} ${20 + Math.cos(a) * 17}" stroke="${INK}" stroke-width="3.2" stroke-linecap="round"/><circle cx="${20 + Math.sin(a) * 17}" cy="${20 + Math.cos(a) * 17}" r="2.6" fill="${c}" stroke="${INK}" stroke-width="1.6"/>`; }).join(''),
    star: `<path d="M20 3 L24.7 14.5 L37 15.3 L27.6 23.2 L30.6 35.3 L20 28.7 L9.4 35.3 L12.4 23.2 L3 15.3 L15.3 14.5 Z" fill="${c}" ${st}/>`,
    heart: `<path d="M20 34 C4 23 4 9 12 7 C16 6 19 9 20 12 C21 9 24 6 28 7 C36 9 36 23 20 34 Z" fill="${c}" ${st}/>`,
    bell: `<path d="M20 5 C12 5 10 12 10 20 L7 28 L33 28 L30 20 C30 12 28 5 20 5 Z" fill="${c}" ${st}/><circle cx="20" cy="31" r="3.5" fill="${c}" ${st}/>`,
  }[s.shape];
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${art}</svg>`;
}

export function createView(ctx) {
  const { THREE, group, stage, meta, me, init } = ctx;
  const { hw, hd } = meta.arena, O = RULES.origin;
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, ...extra }); mats.push(m); return m; };
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const snow = std('#f4f8ff', { roughness: 0.95 });

  // ---- the yard: snow all round, packed snow inside, candy-cane posts
  mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), std('#e8f1fb', { roughness: 1 }), 0, -0.03, 0).receiveShadow = true;
  mesh(new THREE.PlaneGeometry(hw * 2, hd * 2 + 3).rotateX(-Math.PI / 2), std('#d6e6f5', { roughness: 1 }), 0, 0, -1.5).receiveShadow = true;
  const postN = 2 * 12 + 18, posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.14, 0.14, 1, 8).translate(0, 0, 0), std('#ffffff'), postN), col = new THREE.Color();
  let pi = 0;
  const post = (x, z) => { m4.compose(v.set(x, 0.5, z), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(pi, m4); posts.setColorAt(pi, col.set(pi % 2 ? '#e8322a' : '#fff6f0')); pi++; };
  for (const sx of [-1, 1]) for (let k = 0; k < 12; k++) post(sx * (hw + 0.4), -hd - 2 + k * (hd * 2 + 2.4) / 11);
  for (let k = 0; k < 18; k++) post(-hw - 0.4 + k * (hw * 2 + 0.8) / 17, hd + 0.4);
  posts.castShadow = true; group.add(posts);
  // a few snowy evergreens behind the giant
  const tN = 6, pines = new THREE.InstancedMesh(treeGeo(THREE, 4), std('#ffffff', { vertexColors: true }), tN);
  for (let k = 0; k < tN; k++) { m4.compose(v.set(-14 + k * 5.6, 0, O.z - 4.5 - (k % 2) * 1.5), q.identity(), sc.setScalar(0.9 + (k % 3) * 0.2)); pines.setMatrixAt(k, m4); }
  group.add(pines);

  // ---- the snow piles (scoop here)
  for (const p of RULES.piles) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); group.add(g);
    mesh(new THREE.CircleGeometry(RULES.pileR, 28).rotateX(-Math.PI / 2), basic('#9fd6ff', { opacity: 0.45 }), 0, 0.03, 0, g);
    for (const [x, z, r] of [[0, 0, 0.75], [-0.55, 0.35, 0.5], [0.6, 0.25, 0.48], [0.1, -0.55, 0.45], [0.25, 0.3, 0.38]]) { const b = mesh(new THREE.SphereGeometry(r, 14, 10), snow, x, r * 0.55, z, g); b.castShadow = true; }
  }

  // ---- the throw pads (picture + colour on the ground)
  const shapeOf = i => {
    const S = new THREE.Shape(), k = GEMS[i].shape;
    if (k === 'flake') { for (let j = 0; j < 12; j++) { const a = j * Math.PI / 6, r = j % 2 ? 0.3 : 0.8; const x = Math.sin(a) * r, y = Math.cos(a) * r; j ? S.lineTo(x, y) : S.moveTo(x, y); } }
    else if (k === 'star') { for (let j = 0; j < 10; j++) { const a = j * Math.PI / 5, r = j % 2 ? 0.32 : 0.78; const x = Math.sin(a) * r, y = Math.cos(a) * r; j ? S.lineTo(x, y) : S.moveTo(x, y); } }
    else if (k === 'heart') { S.moveTo(0, -0.7); S.bezierCurveTo(-0.9, -0.1, -0.7, 0.75, 0, 0.35); S.bezierCurveTo(0.7, 0.75, 0.9, -0.1, 0, -0.7); }
    else { S.moveTo(-0.62, -0.5); S.lineTo(0.62, -0.5); S.lineTo(0.45, -0.1); S.quadraticCurveTo(0.45, 0.7, 0, 0.7); S.quadraticCurveTo(-0.45, 0.7, -0.45, -0.1); S.lineTo(-0.62, -0.5); }
    return new THREE.ShapeGeometry(S, 10).rotateX(-Math.PI / 2);
  };
  const pads = GEMS.map((s, i) => {
    const p = padAt(i), g = new THREE.Group(); g.position.set(p.x, 0, p.z); group.add(g);
    mesh(new THREE.CylinderGeometry(RULES.reach - 0.15, RULES.reach - 0.05, 0.12, 28), std('#ffffff'), 0, 0.06, 0, g).receiveShadow = true;
    const ring = mesh(new THREE.TorusGeometry(RULES.reach - 0.1, 0.07, 6, 32).rotateX(Math.PI / 2), std(INK), 0, 0.13, 0, g);
    const icon = mesh(shapeOf(i), std(s.color, { emissive: new THREE.Color(s.color), emissiveIntensity: 0.05 }), 0, 0.14, 0, g);
    icon.scale.setScalar(1.15);
    return { g, ring, icon };
  });

  // ---- the giant
  const Gt = new THREE.Group(); Gt.position.set(0, 0, O.z + 0.2); group.add(Gt);
  const ice = std('#bfe6ff', { roughness: 0.25, metalness: 0.05 }), ink = std(INK, { roughness: 0.4 }), carrot = std('#ff8a1a'), hatM = std('#2f8ad8'), hatB = std('#ffffff');
  const belly = mesh(new THREE.SphereGeometry(3.3, 28, 18), snow, 0, 2.6, -0.4, Gt); belly.scale.set(1.9, 0.92, 0.75);
  const chest = mesh(new THREE.SphereGeometry(2.4, 24, 16), snow, 0, 5.4, -0.9, Gt); chest.scale.set(1.5, 0.85, 0.7);
  const crystals = GEMS.map((s, i) => {
    const g = new THREE.Group(); g.position.set(RULES.pads[i] * 0.98, 2.2 + (i === 1 || i === 2 ? 0.4 : 0), 2.0 - (i === 0 || i === 3 ? 0.35 : 0)); Gt.add(g);
    g.rotation.x = -0.25; g.rotation.y = -RULES.pads[i] * 0.05;
    mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.2, 6).rotateX(Math.PI / 2), ice, 0, 0, 0, g);
    const glow = std(s.color, { emissive: new THREE.Color(s.color), emissiveIntensity: 0.08 });
    const pic = mesh(shapeOf(i).rotateX(Math.PI / 2), glow, 0, 0, 0.12, g); pic.scale.setScalar(1.05);
    const lid = mesh(new THREE.SphereGeometry(1.0, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), snow, 0, 0, 0.05, g); lid.scale.set(1, 1, 0.45);
    return { g, glow, lid, pop: 0 };
  });
  // icicle shoulders and mitten hands
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 4; k++) { const c = mesh(new THREE.ConeGeometry(0.22, 1.1, 6).rotateX(Math.PI), ice, sx * (2.6 + k * 0.45), 5.0 - k * 0.15, -0.6, Gt); c.castShadow = true; }
    const arm = mesh(new THREE.SphereGeometry(1, 16, 12), snow, sx * 5.0, 2.0, 0.6, Gt); arm.scale.set(0.9, 1.6, 0.9); arm.rotation.z = sx * 0.5;
    const mit = mesh(new THREE.SphereGeometry(0.95, 16, 12), std(sx < 0 ? '#e8322a' : '#2f9a4a'), sx * 6.0, 0.7, 1.6, Gt); mit.scale.set(1.2, 0.8, 1.1);
    Gt.userData[sx < 0 ? 'ml' : 'mr'] = mit;
  }
  const head = new THREE.Group(); head.position.set(0, 8.0, -0.6); Gt.add(head);
  mesh(new THREE.SphereGeometry(1.7, 24, 16), snow, 0, 0, 0, head);
  const nose = mesh(new THREE.ConeGeometry(0.28, 1.5, 10).rotateX(Math.PI / 2), carrot, 0, -0.1, 2.2, head);
  const eyes = [];
  for (const sx of [-1, 1]) eyes.push(mesh(new THREE.SphereGeometry(0.2, 10, 8), ink, sx * 0.6, 0.45, 1.55, head));
  for (let k = 0; k < 5; k++) mesh(new THREE.SphereGeometry(0.12, 8, 6), ink, -0.6 + k * 0.3, -0.75 - Math.sin(k / 4 * Math.PI) * 0.22, 1.5, head);
  mesh(new THREE.CylinderGeometry(1.45, 1.65, 0.45, 20), hatB, 0, 1.15, 0, head);
  const hat = mesh(new THREE.ConeGeometry(1.4, 2.2, 18), hatM, 0, 2.4, 0, head); hat.rotation.z = 0.25;
  mesh(new THREE.SphereGeometry(0.38, 12, 10), hatB, -0.5, 3.4, 0, head);
  // dizzy stars over its head
  const dizzy = new THREE.Group(); dizzy.position.set(0, 3.0, 0); head.add(dizzy); dizzy.visible = false;
  const dStars = []; for (let k = 0; k < 4; k++) dStars.push(mesh(shapeOf(1).rotateX(Math.PI / 2), std('#ffd23f', { emissive: new THREE.Color('#ffd23f'), emissiveIntensity: 0.4 }), 0, 0, 0, dizzy));
  dStars.forEach(s => s.scale.setScalar(0.45));
  Gt.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // ---- Pip, the solo helper: a little floating snow sprite by the pads
  let pip = null;
  if (init.solo && !init.nopip) {
    pip = new THREE.Group(); pip.position.set(0, 1.8, -1.2); group.add(pip);
    mesh(new THREE.SphereGeometry(0.4, 14, 10), snow, 0, 0, 0, pip);
    for (const sx of [-1, 1]) mesh(new THREE.SphereGeometry(0.06, 6, 5), ink, sx * 0.13, 0.08, 0.36, pip);
    mesh(new THREE.ConeGeometry(0.3, 0.6, 10), std('#ff6fb5'), 0, 0.5, 0, pip);
  }

  // ---- attack pieces: icicle rings + falling icicles, the freeze wave, puffs, thrown snowballs
  const ringGeo = new THREE.RingGeometry(0.88, 1, 40).rotateX(-Math.PI / 2), discGeo = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const icicleGeo = new THREE.ConeGeometry(0.4, 1.6, 7).rotateX(Math.PI);
  const rings = new Map(), fx = [], balls = [];
  function addRing([id, x, z, left, total]) {
    const R = { id, x, z, left, total };
    R.ring = mesh(ringGeo, basic('#2f8ad8', { opacity: 0.95 }), x, 0.07, z); R.ring.scale.setScalar(RULES.ringR);
    R.fill = mesh(discGeo, basic('#9fd6ff', { opacity: 0.55 }), x, 0.06, z);
    R.ice = mesh(icicleGeo, ice, x, 12, z);
    rings.set(id, R);
  }
  function dropRing(R) { group.remove(R.ring, R.fill, R.ice); R.ring.material.dispose(); R.fill.material.dispose(); }
  const wave = mesh(new THREE.TorusGeometry(1, 0.22, 6, 64).rotateX(Math.PI / 2), basic('#bfe6ff', { opacity: 0 }), O.x, 0.25, O.z);
  const waveGlow = mesh(new THREE.RingGeometry(RULES.waveFrom - 0.6, RULES.waveFrom + 0.6, 48).rotateX(-Math.PI / 2), basic('#7fd0ff', { opacity: 0 }), O.x, 0.05, O.z);
  let waveT = null, waveId = 0;
  const puffGeo = new THREE.IcosahedronGeometry(0.6, 0), ballGeo = new THREE.SphereGeometry(0.22, 10, 8);
  function puff(x, y, z, color, size = 1) { const p = mesh(puffGeo, basic(color, { opacity: 0.9 }), x, y, z); p.userData.size = size; fx.push({ p, t: 0 }); }
  function throwBall(from, to) { const b = mesh(ballGeo, snow, from.x, 1.2, from.z); balls.push({ b, from: { ...from }, to, t: 0 }); }

  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'damage' });
  const hud = h('div', 'fg-hud'), banner = h('div', 'fg-banner'), card = h('div', 'fg-card');
  hud.innerHTML = `<div class="fg-hp"><b>Frost Giant</b><span class="fg-bar"><i></i></span><em></em></div><div class="fg-row"><span class="fg-hearts" aria-label="team hearts"></span><span class="fg-ammo" aria-label="your snowballs"></span><span class="fg-pips"></span><span class="fg-wbar"><i></i></span></div>`;
  ctx.ui.append(hud, banner, card);
  const hpFill = hud.querySelector('.fg-bar i'), hpTxt = hud.querySelector('.fg-hp em'), heartsEl = hud.querySelector('.fg-hearts'), ammoEl = hud.querySelector('.fg-ammo'), pipsEl = hud.querySelector('.fg-pips'), wbar = hud.querySelector('.fg-wbar'), wFill = wbar.querySelector('i');
  const maxH = init.hearts;
  let G = null, lastPh = '', hearts = maxH, winTotal = 0, cardKey = '', ammo = -1;
  const showBanner = (text, cls = '', ms = 1500) => { banner.textContent = text; banner.className = 'fg-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'fg-banner'; }, ms); };
  const drawHearts = n => { const s = '♥'.repeat(n) + '♡'.repeat(Math.max(0, maxH - n)); if (heartsEl.textContent !== s) heartsEl.textContent = s; heartsEl.classList.toggle('low', n <= 1); };
  const drawAmmo = a => { if (a === ammo || me == null) return; ammo = a; ammoEl.innerHTML = `${Array.from({ length: RULES.ammoMax }, (_, i) => `<i class="${i < a ? 'on' : ''}"></i>`).join('')}<small>${a ? `${a} snowball${a > 1 ? 's' : ''}` : 'Get snow!'}</small>`; ammoEl.classList.toggle('empty', !a); };
  drawHearts(maxH);
  function drawCard(pv) {
    const key = JSON.stringify(pv); if (key === cardKey) return; cardKey = key;
    if (me == null || !pv?.pat) { card.className = 'fg-card'; card.innerHTML = ''; return; }
    card.className = 'fg-card show';
    if (init.solo) {
      const [i, s] = pv.pat[0] || [];
      card.innerHTML = s == null ? '' : `<small>Next crystal<br>${i + 1} of ${pv.len}</small><span class="fg-step now">${gemIcon(s, 30)}<b>${esc(GEMS[s].name)}</b></span>`;
      return;
    }
    if (!pv.pat.length) { card.innerHTML = `<p>No steps for you this time (${pv.len} in all).<br>Listen to your team!</p>`; return; }
    card.innerHTML = `<small>Call out<br>your steps!</small>${pv.pat.map(([i, s]) => `<span class="fg-step${i === pv.step ? ' now' : ''}${i < pv.step ? ' done' : ''}"><u>${i + 1}</u>${gemIcon(s, 30)}<b>${esc(GEMS[s].name)}</b></span>`).join('')}`;
  }
  const tall = () => innerHeight > innerWidth * 1.15;
  const frameCam = () => { stage.setSafe?.(tall() ? { top: 0.2 } : { top: 0.15 }); ctx.camera({ cx: 0, cz: -2.6, hw: hw + 0.6, hd: hd + 3.6, tall: 6.5 }, { instant: true }); };
  frameCam(); addEventListener('resize', frameCam);

  return {
    winter: { spots: [[-11, 0, -6], [11, 0, -6], [-11, 0, 4], [11, 0, 4]], blanket: false },   // the shared winter dressing, kept off the giant
    start() { frameCam(); showBanner('Grab some snowballs!'); },
    state(g) {
      G = g;
      for (const R of rings.values()) R.seen = false;
      for (const row of g.rg) { const R = rings.get(row[0]); if (R) { R.seen = true; R.left = Math.min(R.left, row[3]); } else { addRing(row); rings.get(row[0]).seen = true; } }
      for (const [id, R] of rings) if (!R.seen) { dropRing(R); rings.delete(id); }
      if (g.wv) { if (g.wv[0] !== waveId) { waveId = g.wv[0]; waveT = g.wv[1]; } else if (Math.abs(waveT - g.wv[1]) > 0.2) waveT = g.wv[1]; } else waveT = null;
      hpFill.style.width = (100 * g.hp / init.hpMax).toFixed(1) + '%'; hpTxt.textContent = g.hp;
      if (g.hearts !== hearts) { hearts = g.hearts; drawHearts(hearts); }
      if (me != null && g.am?.[me] != null) drawAmmo(g.am[me]);
      if (g.ph !== lastPh) {
        if (g.ph === 'window') { winTotal = g.wl; for (const s of crystals) s.pop = 1; }
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
      if (ev.e === 'roar') { showBanner(ev.kind === 'wave' ? 'Freeze wave: HOP!' : 'Icicles: move!', 'warn', 1200); ctx.sfx('trap'); }
      else if (ev.e === 'boom') { puff(ev.x, 0.5, ev.z, '#bfe6ff', 1.5); puff(ev.x, 0.9, ev.z, '#ffffff', 0.9); ctx.sfx('splat'); }
      else if (ev.e === 'hurt') { ctx.sfx(ev.pid === me ? 'bad' : 'hit'); const p = ctx.pos(ev.pid); if (p) floatText(stage, p.x, 2, p.z, '-1 ♥', 'bad'); ctx.actor(ev.pid)?.play('hit', 600); }
      else if (ev.e === 'dizzy') { showBanner('Dizzy! Hit the crystals!', 'good', 1700); ctx.sfx('pick'); }
      else if (ev.e === 'hit' || ev.e === 'pip') {
        const p = padAt(ev.pad), from = ev.e === 'pip' ? (pip ? { x: pip.position.x, z: pip.position.z } : p) : (ctx.pos(ev.pid) || p);
        throwBall(from, { x: crystals[ev.pad].g.position.x, y: crystals[ev.pad].g.position.y, z: O.z + 2.2 });
        crystals[ev.pad].pop = 1.6; ctx.sfx(ev.pid === me ? 'coins' : 'good');
        floatText(stage, p.x, 3.4, p.z - 1.5, `${ev.e === 'pip' ? 'Pip! ' : ''}-${ev.dmg}${ev.done ? ' COMBO!' : ''}`, 'good'); puff(p.x, 2.6, p.z - 2.2, GEMS[ev.pad].color, 1.3);
        if (ev.done) showBanner('Combo!', 'good', 1100);
      } else if (ev.e === 'wrong') { ctx.sfx('bad'); const p = padAt(ev.pad); floatText(stage, p.x, 2.6, p.z, 'Wrong crystal!', 'bad'); showBanner('It flinched!', 'bad', 900); }
      else if (ev.e === 'chip') { const p = padAt(ev.pad); crystals[ev.pad].pop = 1.2; throwBall(ctx.pos(ev.pid) || p, { x: crystals[ev.pad].g.position.x, y: 2.4, z: O.z + 2.2 }); if (ev.pid === me) ctx.sfx('tap'); floatText(stage, p.x, 2.6, p.z - 1, `-${ev.dmg}`, ''); }
      else if (ev.e === 'clang') { if (ev.pid === me) { ctx.sfx('tap'); const p = padAt(ev.pad); floatText(stage, p.x, 2.2, p.z, 'Wait for dizzy!', ''); } }
      else if (ev.e === 'miss') { throwBall({ x: ev.x, z: ev.z }, { x: ev.x + Math.sin(ev.yaw) * 5, y: 0.2, z: ev.z + Math.cos(ev.yaw) * 5 }); if (ev.pid === me) floatText(stage, ev.x, 2.2, ev.z, 'Stand on a pad!', ''); }
      else if (ev.e === 'empty') { ctx.sfx('tap'); const p = ctx.pos(me); if (p) floatText(stage, p.x, 2.2, p.z, 'Grab snowballs!', 'bad'); }
      else if (ev.e === 'scoop') { ctx.sfx('pick'); }
      else if (ev.e === 'recover') { if (!ev.combo) showBanner('It shook it off!', 'bad', 1100); }
      else if (ev.e === 'hop') { if (ev.pid === me) ctx.sfx('tap'); }
      else if (ev.e === 'end') { showBanner(ev.ok ? 'Giant melted!' : 'The giant wins!', ev.ok ? 'good' : 'bad', 4000); ctx.sfx(ev.ok ? 'win' : 'bad'); }
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
      for (const R of rings.values()) {
        R.left = Math.max(0, R.left - dt); const k = 1 - R.left / R.total;
        R.fill.scale.setScalar(Math.max(0.01, k * RULES.ringR * 0.9));
        R.ring.material.opacity = k > 0.7 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 18)) : 0.95;
        const fall = Math.max(0, R.left / 0.5); R.ice.position.y = Math.min(12, 0.8 + fall * 11); R.ice.visible = R.left < 0.55;
      }
      // the freeze wave: a glow round its feet during the warning, then the frosty ring rolls out
      if (waveT != null) {
        waveT += dt;
        if (waveT < 0) { waveGlow.material.opacity = 0.25 + 0.3 * Math.abs(Math.sin(t * 9)); wave.material.opacity = 0; }
        else { waveGlow.material.opacity = 0; const r = waveRadius(waveT); wave.scale.set(r, 1, r); wave.material.opacity = waveT < RULES.waveDur ? 0.9 : 0; }
      } else { waveGlow.material.opacity = 0; wave.material.opacity = 0; }
      const stomp = waveT != null && waveT < 0 ? Math.abs(Math.sin(t * 10)) * 0.5 : 0;
      Gt.userData.ml.position.y = 0.7 + stomp; Gt.userData.mr.position.y = 0.7 + stomp;
      head.rotation.z = win ? Math.sin(t * 3) * 0.22 : Math.sin(t * 0.8) * 0.05;
      head.rotation.x += ((win ? 0.25 : ph === 'end' && G.hp <= 0 ? 0.5 : 0) - head.rotation.x) * Math.min(1, dt * 4);
      nose.rotation.z = win ? t * 4 : 0;
      dizzy.visible = win; if (win) { dizzy.rotation.y = t * 3; dStars.forEach((s, k) => { const a = k * Math.PI / 2; s.position.set(Math.sin(a) * 1.5, 0.1 * Math.sin(t * 5 + k), Math.cos(a) * 1.5); }); }
      for (const e of eyes) e.scale.setScalar(win ? 1 + 0.3 * Math.sin(t * 8) : 1);
      belly.scale.y = 0.92 + 0.03 * Math.sin(t * 1.8);
      if (ph === 'end' && G.hp <= 0) Gt.scale.y += (0.6 - Gt.scale.y) * Math.min(1, dt * 1.5);      // melting
      crystals.forEach((s, i) => {
        s.lid.scale.y += ((win ? 0.05 : 1) - s.lid.scale.y) * Math.min(1, dt * 8); s.lid.visible = s.lid.scale.y > 0.08;
        s.glow.emissiveIntensity = win ? 0.45 + 0.3 * Math.abs(Math.sin(t * 4 + i)) : 0.05;
        s.pop = Math.max(0, s.pop - dt * 3); s.g.scale.setScalar(1 + 0.25 * Math.min(1, s.pop));
        pads[i].icon.material.emissiveIntensity = win ? 0.35 + 0.25 * Math.abs(Math.sin(t * 4 + i)) : 0.05;
        pads[i].ring.position.y = 0.13 + (win ? 0.04 * Math.sin(t * 6 + i) : 0);
      });
      if (pip) { pip.position.set(Math.sin(t * 0.7) * 3.2, 1.8 + Math.sin(t * 2.3) * 0.25, -1.2 + Math.cos(t * 0.9) * 0.6); pip.rotation.y = Math.sin(t) * 0.4; }
      for (let i = balls.length - 1; i >= 0; i--) {
        const B = balls[i]; B.t += dt * 2.2; const k = Math.min(1, B.t);
        B.b.position.set(B.from.x + (B.to.x - B.from.x) * k, 1.2 + (B.to.y - 1.2) * k + Math.sin(k * Math.PI) * 2, B.from.z + (B.to.z - B.from.z) * k);
        if (k >= 1) { puff(B.b.position.x, B.b.position.y, B.b.position.z, '#ffffff', 0.7); group.remove(B.b); balls.splice(i, 1); }
      }
      for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.t += dt; f.p.scale.setScalar(f.p.userData.size * (0.4 + f.t * 2.6)); f.p.material.opacity = Math.max(0, 0.9 - f.t * 1.8); if (f.t > 0.5) { group.remove(f.p); f.p.material.dispose(); fx.splice(i, 1); } }
    },
    dispose() { bar.el.remove(); for (const R of rings.values()) dropRing(R); clearTimeout(showBanner.t); removeEventListener('resize', frameCam); for (const m of mats) m.dispose(); },
  };
}
