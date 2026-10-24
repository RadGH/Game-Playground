// LONG DRIVE, as drawn: looking down a long straight fairway from behind the tees — mown stripes, a lighter rough
// either side, rows of round trees past that (out of bounds), a pond on the right at the long end, yardage boards
// every 50 yards, and (solo) three target flags in bronze, silver and gold. Every player's character stands on a tee
// in a row and swings when they drive; the ball (big, in the seat colour, with a white trail) flies in a high arc,
// bounces and rolls, and a pin in the seat colour marks where it stopped, with the yards (or "Rough", "Pond!", "Trees").
// A wind flag flaps by the tees. On a phone that plays: the panel at the bottom — ◀ aim ▶, the POWER bar, the
// ACCURACY bar, and one big SWING button (Space works too; arrow keys aim). The meters run here, on this phone.
import { pingPong, needle } from './sim.js';
import { scoreBar, h } from '../../client/gamehud.js';
import { pumpkinGeo, stemGeo, faceTexture, spriteTexture, PALETTE } from '../../client/halloween.js';

const S = 0.3;                                             // metres per yard in the scene
const LIE_TEXT = { fairway: '', rough: 'Rough', pond: 'Pond!', trees: 'Trees' };
export function createView(ctx) {
  const { THREE, group, stage, players, me, init, ui } = ctx;
  const L = init.level, n = players.length, HW = ctx.season === 'halloween';
  const mats = [], std = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra }); mats.push(m); return m; };
  const basic = (color, extra = {}) => { const m = new THREE.MeshBasicMaterial({ color, ...extra }); mats.push(m); return m; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const teeX = i => (i - (n - 1) / 2) * 3.2, LEN = 360 * S;
  const tags = [];
  // ---- the course
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 200).rotateX(-Math.PI / 2), std(HW ? '#221a38' : '#4f9e45', { roughness: 1 })); ground.position.set(0, -0.03, -60); ground.receiveShadow = true; group.add(ground);
  const rough = new THREE.Mesh(new THREE.PlaneGeometry(init.rough * 2 * S, LEN).rotateX(-Math.PI / 2), std(HW ? '#3a5e3c' : '#5fb653')); rough.position.set(0, -0.01, -LEN / 2 + 6); group.add(rough);
  const NS = 12, fw = new THREE.InstancedMesh(new THREE.PlaneGeometry(init.fairway * 2 * S, LEN / NS).rotateX(-Math.PI / 2), std('#ffffff'), NS);
  for (let i = 0; i < NS; i++) { m4.makeTranslation(0, 0, 6 - (i + 0.5) * LEN / NS); fw.setMatrixAt(i, m4); fw.setColorAt(i, col.set(HW ? (i % 2 ? '#4f8a52' : '#5a9a5c') : (i % 2 ? '#7fd66c' : '#8fe07a'))); }
  fw.receiveShadow = true; group.add(fw);
  const tee = new THREE.Mesh(new THREE.BoxGeometry(Math.max(6, n * 3.4), 0.12, 3), std(HW ? '#3f6e45' : '#9be88a')); tee.position.set(0, 0.06, 0.4); tee.receiveShadow = true; group.add(tee);
  const P0 = init.pond, pond = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), std(HW ? '#3a3a8a' : '#3aa6e8', { roughness: 0.15, metalness: 0.1 }));
  pond.scale.set((P0.x1 - P0.x0) / 2 * S, 1, (P0.y1 - P0.y0) / 2 * S); pond.position.set((P0.x0 + P0.x1) / 2 * S, 0.012, -(P0.y0 + P0.y1) / 2 * S); group.add(pond);
  // trees: two rows each side past the rough
  const NT = 64, trees = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 3.6, 8), std(HW ? '#2a2342' : '#2f8a3e'), NT), trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.28, 1, 6), std('#6a4a2a'), NT);
  for (let i = 0; i < NT; i++) {
    const side = i % 2 ? 1 : -1, row = (i >> 1) % 2, k = i >> 2, x = side * (init.rough * S + 2.2 + row * 2.6 + (k % 3) * 0.4), z = 4 - k * 7.4 - row * 3.6, s = 0.85 + ((i * 37) % 10) / 25;
    m4.compose(v.set(x, 1 + 1.8 * s, z), q.identity(), sc.setScalar(s)); trees.setMatrixAt(i, m4);
    m4.compose(v.set(x, 0.5, z), q.identity(), sc.set(1, 1, 1)); trunks.setMatrixAt(i, m4);
  }
  trees.castShadow = true; group.add(trees, trunks);
  // ---- round 12 (report #31, "what's halloween edition about it"): the Halloween edition is a night course — a
  // purple night sky with a big moon and stars across the top of the screen (.ld-night), a graveyard of smiling tombstones down both edges of
  // the rough, jack-o'-lanterns on the yardage boards, pumpkin balls with a band in the player's colour (and a
  // matching trail), bats flapping over the fairway. Only looks: the rules, yards and wind are the same.
  const hw = HW ? halloweenCourse() : null;
  function halloweenCourse() {
    const own = [];
    // tombstones down both edges of the rough, every 25 yards (round tops, a smile)
    const stones = [];
    for (let y = 25; y <= 350; y += 25) for (const side of [-1, 1]) stones.push([side * (init.rough * S + 1.4), -y * S + side * 1.2]);
    const n2 = stones.length, stoneMat = std('#b9acd8', { roughness: 0.9, emissive: '#3a2a5a', emissiveIntensity: 0.4 });
    const slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1, 0.5), stoneMat, n2), tops = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.5, 16).rotateX(Math.PI / 2), stoneMat, n2);
    stones.forEach(([x, z], i) => { const tall = 1.6 + (i % 3) * 0.35; m4.compose(v.set(x, tall / 2, z), q.identity(), sc.set(1, tall, 1)); slabs.setMatrixAt(i, m4); m4.compose(v.set(x, tall, z), q.identity(), sc.set(1, 1, 1)); tops.setMatrixAt(i, m4); });
    slabs.castShadow = tops.castShadow = true; group.add(slabs, tops);
    // jack-o'-lanterns: one on every yardage post, and a pair either side of the tees
    const faceTex = faceTexture(THREE); own.push(faceTex);
    const pumpMat = std(PALETTE.pumpkin, { roughness: 0.55, emissive: '#b33a00', emissiveIntensity: 0.55 }), stemMat = std('#4c7a2a'), faceMat = basic('#ffffff', { map: faceTex, transparent: true, depthWrite: false, toneMapped: false });
    const jack = (x, y, z, r) => {
      const p = new THREE.Group(); p.position.set(x, y, z);
      const b = new THREE.Mesh(pumpkinGeo(THREE, r), pumpMat); b.castShadow = true; p.add(b); p.add(new THREE.Mesh(stemGeo(THREE, r), stemMat));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(r * 1.5, r * 1.5), faceMat); f.position.z = r * 0.98; p.add(f);
      group.add(p); return p;
    };
    for (const side of [-1, 1]) jack(side * (Math.max(6, n * 3.4) / 2 + 1.6), 0.8, 1.2, 0.9);
    // bats: a few flat sprites that flap and circle over the fairway
    const batTex = spriteTexture(THREE, 'bat'); own.push(batTex);
    const bats = Array.from({ length: 7 }, (_, i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: batTex, transparent: true, depthWrite: false })); mats.push(sp.material); sp.scale.set(4.5, 4.5, 1); group.add(sp); return { sp, r: 7 + i * 1.5, z: -14 - i * 12, k: 0.5 + (i % 3) * 0.25, ph: i * 1.3 }; });
    // friendly ghosts drifting along the graveyard either side
    const ghostTex = spriteTexture(THREE, 'ghost'); own.push(ghostTex);
    const ghosts = Array.from({ length: 4 }, (_, i) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ghostTex, transparent: true, opacity: 0.9, depthWrite: false })); mats.push(sp.material); sp.scale.set(4, 4, 1); group.add(sp); return { sp, x: (i % 2 ? 1 : -1) * (init.rough * S + 5), z: -18 - i * 22, ph: i * 2.1 }; });
    return { jack, own, frame(t) { for (const b of bats) { b.sp.position.set(Math.sin(t * b.k + b.ph) * b.r, 7 + Math.sin(t * 3 + b.ph) * 1.2, b.z + Math.cos(t * b.k + b.ph) * 4); b.sp.scale.set(4.5 * (0.7 + 0.3 * Math.abs(Math.sin(t * 12 + b.ph))), 4.5, 1); }
      for (const g of ghosts) g.sp.position.set(g.x + Math.sin(t * 0.7 + g.ph) * 1.5, 2.6 + Math.sin(t * 1.6 + g.ph) * 0.5, g.z + Math.cos(t * 0.5 + g.ph) * 3); } };
  }
  // yardage boards on the left edge of the fairway
  // round 10 (report #19, "screen is busy with overlay text"): an upright phone gets three small boards, not five
  const tall = innerHeight > innerWidth * 1.15;
  for (const y of tall ? [100, 200, 300] : [100, 150, 200, 250, 300]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), std(HW ? '#3a2a1a' : '#ffffff')); post.position.set(-(init.fairway + 3) * S, 0.6, -y * S); group.add(post);
    if (hw) hw.jack(post.position.x, 2.2, post.position.z, 1.25);             // a jack-o'-lantern yardage board
    tags.push(stage.tag(post, { text: `${y}`, height: HW ? 3.2 : 0.9, cls: 'ld-yard' + (HW ? ' hw' : '') }));
  }
  if (init.medals) for (const [y, kind] of init.medals) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), std('#ffffff')); pole.position.set(0, 1.7, -y * S); group.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), new THREE.MeshStandardMaterial({ color: { gold: '#ffd23f', silver: '#d6dde6', bronze: '#d08a4a' }[kind], side: THREE.DoubleSide })); mats.push(flag.material); flag.position.set(0.72, 2.95, -y * S); group.add(flag);
    tags.push(stage.tag(pole, { text: tall ? `${y}` : `${kind[0].toUpperCase() + kind.slice(1)} ${y}`, height: 2.2, cls: 'ld-medal ld-' + kind }));
  }
  // wind flag by the tees
  const windPole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), std('#ffffff')); windPole.position.set(Math.max(4, n * 1.8 + 1.4), 1.5, -0.6); group.add(windPole);
  const windFlag = new THREE.Group(); windFlag.position.set(windPole.position.x, 2.75, -0.6); group.add(windFlag);
  const wf = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55).translate(0.55, 0, 0), new THREE.MeshStandardMaterial({ color: HW ? '#8a4fd8' : '#ff5a5a', side: THREE.DoubleSide })); mats.push(wf.material); windFlag.add(wf);
  // a wide screen looks across the fairway (tees on the left, downrange to the right); an upright phone looks down it
  let wide = null;
  const frameCam = (instant = false) => { const w = innerWidth > innerHeight * 1.15; if (w === wide && !instant) return; wide = w; ctx.camera(w ? { cx: 0, cz: -50, hw: 16, hd: 56, pitch: 38, yaw: 90, tall: 3 } : { cx: 0, cz: -44, hw: 15, hd: 50, pitch: 26, tall: 3 }, { instant }); };
  frameCam(true);

  // ---- the players: a character on each tee, a ball, a trail, a pin
  const ballGeo = new THREE.SphereGeometry(0.65, 16, 10), pinGeo = new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6).translate(0, 1.2, 0), pinFlag = new THREE.PlaneGeometry(0.9, 0.55).translate(0.45, 2.1, 0);
  const R = new Map();
  players.forEach((p, i) => {
    let ball;
    if (HW) {           // a pumpkin ball with a band in the player's colour, so it is still clear whose it is
      ball = new THREE.Group();
      const body = new THREE.Mesh(pumpkinGeo(THREE, 0.7), std(PALETTE.pumpkin, { roughness: 0.5, emissive: '#c24a00', emissiveIntensity: 0.4 })); body.castShadow = true;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.13, 8, 24).rotateX(Math.PI / 2), std(p.color, { roughness: 0.4, emissive: p.color, emissiveIntensity: 0.3 }));
      ball.add(body, band, new THREE.Mesh(stemGeo(THREE, 0.7), std('#4c7a2a')));
    } else { ball = new THREE.Mesh(ballGeo, std(p.color, { roughness: 0.3, emissive: p.color, emissiveIntensity: 0.25 })); ball.castShadow = true; }
    ball.visible = false; group.add(ball);
    const N = 40, tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); tg.setDrawRange(0, 0);
    const trail = new THREE.Line(tg, basic(HW ? p.color : '#ffffff', { transparent: true, opacity: 0.8 })); trail.frustumCulled = false; group.add(trail);
    const pin = new THREE.Group(); pin.visible = false; group.add(pin);
    pin.add(new THREE.Mesh(pinGeo, std('#ffffff')), new THREE.Mesh(pinFlag, new THREE.MeshStandardMaterial({ color: p.color, side: THREE.DoubleSide })));
    const pinTag = stage.tag(pin, { text: '', seat: p.seat, height: 2.7, cls: 'ld-pin' + (p.pid === me ? ' mine' : '') }); tags.push(pinTag);
    R.set(p.pid, { i, ball, trail, tg, N, pin, pinTag, fly: null, actor: null, best: 0, fade: 0 });
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }).then(a => { if (!a) return; a.place(teeX(i), 0.12, 0.6, Math.PI); R.get(p.pid).actor = a; });
  });
  // ---- HUD
  const bar = scoreBar(ctx, { unit: 'yards' });
  const playing = me != null;
  // a phone that plays shows the wind and its last drive INSIDE its own panel, so nothing floats over the fairway
  // where the balls land; only a watching screen gets the floating wind badge
  const wind = h('div', 'ld-wind' + (playing ? ' in-panel' : ''), '<i class="ld-arrow"></i><span><b>Wind</b> <em></em></span>');
  const banner = h('div', 'gp-banner');
  // the Halloween edition's night sky: the camera looks down at the course, so the sky is a band across the top of the
  // screen (stars, a moon, fading into the course), behind the score bar and never over the swing panel
  if (HW) ui.prepend(h('div', 'ld-night', '<i class="ld-moon"></i>'));
  ui.append(banner); if (!playing) ui.append(wind);
  const showBanner = (html, cls = '', ms = 1800) => { banner.innerHTML = html; banner.className = 'gp-banner show ' + cls; clearTimeout(showBanner.t); showBanner.t = setTimeout(() => { banner.className = 'gp-banner'; }, ms); };
  const panel = h('div', 'ld-panel' + (playing ? '' : ' hidden'), `
    <div class="ld-row ld-info"><b class="ld-drive">Drive 1/${init.drives}</b><span class="ld-wind-slot"></span><span class="ld-best">Best: –</span></div>
    <div class="ld-last" aria-live="polite"></div>
    <div class="ld-row ld-aim"><button class="ld-btn ld-l" aria-label="Aim left">◀</button><span class="ld-aimtx">Aim straight</span><button class="ld-btn ld-r" aria-label="Aim right">▶</button></div>
    <div class="ld-meter ld-power"><span>Power</span><div class="ld-track"><i class="ld-fill"></i><i class="ld-mark"></i></div></div>
    <div class="ld-meter ld-acc"><span>Accuracy</span><div class="ld-track"><i class="ld-sweet"></i><i class="ld-needle"></i></div></div>
    <button class="ld-swing big-btn">SWING!</button>`);
  ui.append(panel);
  const $ = s => panel.querySelector(s);
  if (playing) $('.ld-wind-slot').append(wind);
  const lastTx = $('.ld-last');
  const showLast = (text, cls) => { lastTx.textContent = text; lastTx.className = 'ld-last show ' + cls; clearTimeout(showLast.t); showLast.t = setTimeout(() => { lastTx.className = 'ld-last'; }, 2200); };
  const fill = $('.ld-fill'), mark = $('.ld-mark'), ndl = $('.ld-needle'), swingBtn = $('.ld-swing'), aimTx = $('.ld-aimtx'), driveTx = $('.ld-drive'), bestTx = $('.ld-best');
  let mode = 'wait', t0 = 0, t1 = 0, lockedP = 0, aim = 0, myN = 0, last = null, sent = false, sentAt = 0;
  const now = () => performance.now() / 1000;
  function setAim(a) { aim = Math.max(-init.aimMax, Math.min(init.aimMax, a)); aimTx.textContent = aim === 0 ? 'Aim straight' : `Aim ${Math.abs(aim * init.aimStep)}° ${aim < 0 ? 'left' : 'right'}`; ctx.sfx('tap'); }
  function tap() {
    if (mode === 'power') { lockedP = pingPong(now() - t0, L.power); mode = 'acc'; t1 = now(); ctx.sfx('tap'); }
    else if (mode === 'acc') {
      const a = Math.round(needle(now() - t1, L.acc) * 100) / 100;
      ctx.send('swing', { p: Math.round(lockedP * 1000) / 1000, a, aim }); mode = 'sent'; sent = true; sentAt = now(); ctx.sfx('throw');
      R.get(me)?.actor?.play('attack', 600);
    }
  }
  swingBtn.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  $('.ld-l').addEventListener('click', () => setAim(aim - 1)); $('.ld-r').addEventListener('click', () => setAim(aim + 1));
  const onKey = e => {
    if (!playing || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) tap(); }
    else if (e.code === 'ArrowLeft' || e.code === 'KeyA') setAim(aim - 1); else if (e.code === 'ArrowRight' || e.code === 'KeyD') setAim(aim + 1);
  };
  addEventListener('keydown', onKey);
  function showWind(k) {
    const w = init.winds[Math.min(k, init.winds.length - 1)]; if (!w) return;
    wind.querySelector('.ld-arrow').style.transform = `rotate(${w.dir + (wide ? Math.PI / 2 : 0)}rad)`;      // screen up = downrange (or right, looking across)
    wind.querySelector('em').textContent = `${w.mph} mph` + (init.winds.length > 1 && !playing ? ` · drive ${Math.min(k, init.winds.length - 1) + 1}` : '');
    windFlag.userData.w = w;
  }
  showWind(0);
  // a drive in the air: tee -> landing in an arc, then a bounce and a roll to where it stopped
  function launch(ev) {
    const r = R.get(ev.pid); if (!r) return;
    const x0 = teeX(r.i), from = new THREE.Vector3(x0, 0.5, 0.2), land = new THREE.Vector3(x0 + ev.cx * S, 0.42, -ev.cy * S), stop = new THREE.Vector3(x0 + ev.x * S, 0.42, -ev.y * S);
    r.fly = { t: 0, from, land, stop, apex: 3 + ev.carry * 0.032, T: 2.2, lie: ev.lie, y: Math.round(ev.y), pts: [] };
    r.ball.visible = true; r.pin.visible = false; r.pinTag.set('');
    if (ev.pid !== me) r.actor?.play('attack', 600);
  }
  return {
    state(g) {
      last = g;
      bar.set(g.sc, g.left);
      if (playing) {
        const n2 = g.n[me] ?? 0, busy = g.busy[me];
        if (n2 !== myN) { myN = n2; sent = false; }
        if (sent && now() - sentAt > 2.5 && !busy) { sent = false; mode = 'wait'; }      // the server never took it: try again
        if (!g.go) mode = 'wait';
        else if (n2 >= init.drives && !busy) mode = 'done';
        else if (!busy && !sent && (mode === 'wait' || mode === 'flying')) { mode = 'power'; t0 = now(); }
        else if (busy) mode = 'flying';
        driveTx.textContent = mode === 'done' ? 'All done!' : `Drive ${Math.min(init.drives, n2 + (busy ? 0 : 1))}/${init.drives}`;
        bestTx.textContent = `Best: ${g.sc[me] ? g.sc[me] + ' yds' : '–'}`;
        showWind(Math.max(0, Math.min(busy ? n2 - 1 : n2, init.drives - 1)));
      } else showWind(Math.min(...Object.values(g.n)));
    },
    event(ev) {
      if (ev.e === 'drive') { launch(ev); ctx.sfx(ev.pid === me ? 'throw' : 'tap'); }
      else if (ev.e === 'stop') {
        const r = R.get(ev.pid); if (!r) return;
        // a short label (yards, or just where it went); someone else's fades after a moment, yours stays
        r.pinTag.set(ev.lie === 'fairway' ? `${ev.y}` : LIE_TEXT[ev.lie]); r.fade = ev.pid === me ? 0 : 2.5; r.pinTag.el.classList.remove('faded');
        if (ev.pid === me) { ctx.sfx(ev.lie === 'fairway' ? 'good' : 'bad'); if (playing) showLast(ev.lie === 'fairway' ? `${ev.y} yards!` : `${LIE_TEXT[ev.lie]} — doesn't count`, ev.lie === 'fairway' ? 'good' : 'bad'); }
        if (ev.lie === 'fairway' && ev.y >= (last?.sc?.[ev.pid] ?? 0)) r.actor?.play('cheer', 1200);
      }
      else if (ev.e === 'end') {
        ctx.sfx('win');
        if (init.medals) { const y = last?.sc?.[players[0].pid] ?? 0, m = init.medals.find(([d]) => y >= d); showBanner(`${y} yards<small>${m ? { gold: '🥇 Gold!', silver: '🥈 Silver', bronze: '🥉 Bronze' }[m[1]] : 'Keep practising!'}</small>`, 'good', 4000); }
        else { const best = Math.max(...Object.values(last?.sc || { 0: 0 })); const who = players.filter(p => (last?.sc?.[p.pid] ?? 0) === best && best > 0).map(p => p.name).join(' & '); if (who) showBanner(`${best} yards<small>${who}</small>`, 'good', 4000); }
      }
    },
    frame(dt, t) {
      frameCam();
      // meters
      if (playing) {
        panel.dataset.mode = mode;
        const p = mode === 'power' ? pingPong(now() - t0, L.power) : lockedP;
        fill.style.width = (p * 100).toFixed(1) + '%'; mark.style.left = (lockedP * 100).toFixed(1) + '%'; mark.style.opacity = mode === 'acc' || mode === 'sent' ? 1 : 0;
        const a = mode === 'acc' ? needle(now() - t1, L.acc) : 0; ndl.style.left = (50 + a * 50).toFixed(1) + '%';
        swingBtn.textContent = { power: 'TAP: POWER', acc: 'TAP: ACCURACY', sent: 'Swing!', flying: 'Watch it fly…', done: 'All done!', wait: 'Get ready…' }[mode];
        swingBtn.disabled = !(mode === 'power' || mode === 'acc');
      }
      // wind flag flaps toward where the wind blows (dir 0 = down the fairway, -z)
      const w = windFlag.userData.w; if (w) { windFlag.rotation.y = Math.PI / 2 - w.dir + Math.sin(t * 6) * 0.08 * (0.3 + w.mph / 18); }
      for (const [pid, r] of R) {
        const F = r.fly; if (!F) continue;
        F.t += dt;
        const pos = v;
        if (F.t < F.T) { const k = F.t / F.T; pos.lerpVectors(F.from, F.land, k); pos.y = F.from.y + (F.land.y - F.from.y) * k + 4 * F.apex * k * (1 - k); }
        else { const k = Math.min(1, (F.t - F.T) / 0.9), e = 1 - (1 - k) * (1 - k); pos.lerpVectors(F.land, F.stop, e); pos.y = 0.42 + Math.abs(Math.sin(k * Math.PI * 2)) * (1 - k) * 1.2; if (F.lie === 'pond' && k > 0.4) r.ball.visible = false; }
        r.ball.position.copy(pos);
        if (F.pts.length < r.N && F.t < F.T + 0.2) { F.pts.push(pos.x, pos.y, pos.z); r.tg.attributes.position.array.set(F.pts); r.tg.attributes.position.needsUpdate = true; r.tg.setDrawRange(0, F.pts.length / 3); }
        if (F.t >= F.T + 0.95) { r.fly = null; r.pin.visible = true; r.pin.position.set(F.stop.x, 0, F.stop.z); r.tg.setDrawRange(0, 0); if (F.lie === 'pond') r.ball.visible = false; }
      }
      for (const r of R.values()) { r.actor?.update(dt); if (r.fade > 0 && (r.fade -= dt) <= 0) r.pinTag.el.classList.add('faded'); }
      hw?.frame(t);
    },
    dispose() { removeEventListener('keydown', onKey); clearTimeout(showBanner.t); clearTimeout(showLast.t); bar.el.remove(); for (const tg of tags) tg.remove(); for (const m of mats) m.dispose(); for (const x of hw?.own || []) x.dispose(); },
  };
}
