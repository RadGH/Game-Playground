// PHOTO BOOTH on a screen. Up top, the 3D booth: a curtain backdrop with a gold frame and every player's character
// standing in a row, facing the camera. Below, the pose card (its name and the button pictures it wants), a countdown
// bar on this phone's own clock, and four big pose buttons (tap = on/off; arrow keys too). At the flash the screen goes
// white, and when the server's judgement comes in each character plays the pose its player actually held (a Chibi 2
// emote clip) with a ✓ or ✗ tag. The strip at the end flips through all ten photos in the booth while a film strip
// below shows everyone's ticks. Halloween: a purple booth with orange bunting and bats on the curtain.
import { chip, esc } from '../../client/gamehud.js';
import { canvasTexture } from '../../client/stage.js';
import { BUTTONS, POSES } from './sim.js';

const INK = '#0d2228';
/** Little pictures for the four buttons (a round-headed figure in each pose). */
const ICON = {
  up: `<svg viewBox="0 0 40 40"><circle cx="20" cy="10" r="5.5"/><path d="M20 16 V29 M20 29 L14 38 M20 29 L26 38 M20 19 L11 6 M20 19 L29 6"/></svg>`,
  down: `<svg viewBox="0 0 40 40"><circle cx="20" cy="15" r="5.5"/><path d="M20 21 V29 M20 29 L12 31 L13 38 M20 29 L28 31 L27 38 M20 23 L12 27 M20 23 L28 27"/></svg>`,
  wave: `<svg viewBox="0 0 40 40"><circle cx="17" cy="10" r="5.5"/><path d="M17 16 V29 M17 29 L11 38 M17 29 L23 38 M17 19 L9 25 M17 19 L27 12 L30 4"/><path d="M33 3 q3 3 0 6 M36 1 q4 5 0 10" stroke-width="2"/></svg>`,
  silly: `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15"/><path d="M12 15 l5 3 l-5 3 M28 15 l-5 3 l5 3" /><path d="M12 26 q8 6 16 0" /><path d="M17 28 q3 7 6 0" fill="#ff7a9a" stroke-width="2"/></svg>`,
};
const SAY = { 0: 'Not ready!', ok3: 'Snap! +3', ok2: 'Got it +2', bad: 'Oops!' };

export function createView(ctx) {
  const { ui, players, me, init, THREE } = ctx, watching = me == null, HW = ctx.season === 'halloween', n = players.length;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="pb-top"><span class="pb-title">Photo Booth</span><span class="pb-round"></span><span class="clock"><b>--</b></span></div>
    <div class="pb-flash"></div>
    <div class="pb-space"></div>
    <section class="pb-panel">
      <div class="pb-card"><small>Strike this pose!</small><b class="pb-name">Get ready…</b><span class="pb-want"></span><i class="pb-bar"><i></i></i></div>
      <div class="pb-btns">${BUTTONS.map(b => `<button class="pb-btn" data-bit="${b.bit}" aria-pressed="false"><span class="pb-ic">${ICON[b.id]}</span><b>${b.name}</b></button>`).join('')}</div>
      <div class="pb-strip"></div>
      <div class="pb-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="pb-st"></strong>')).join('')}</div>
      <p class="pb-note"></p>
    </section>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.pb-players [data-pid="${me}"]`)?.classList.add('me');
  const btns = [...ui.querySelectorAll('.pb-btn')];

  // ---------------------------------------------------------------- the booth (3D)
  const G = new THREE.Group(); ctx.group.add(G);
  const W = Math.max(3.4, n * 1.25 + 1);
  const backTex = canvasTexture(512, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 20; i++) g.addColorStop(i / 20, HW ? (i % 2 ? '#3a1e5c' : '#5a2e8a') : (i % 2 ? '#a8203a' : '#d23a52'));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = HW ? '#ff8a1a' : '#ffd23f';
    for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 32, 0); c.lineTo(x + 16, 26); c.fill(); }
    if (HW) { c.fillStyle = '#1a0c28'; for (let i = 0; i < 7; i++) { const x = 40 + i * 70, y = 70 + (i % 3) * 50; c.beginPath(); c.ellipse(x, y, 7, 5, 0, 0, 7); c.moveTo(x - 6, y); c.quadraticCurveTo(x - 16, y - 12, x - 26, y - 2); c.quadraticCurveTo(x - 16, y + 2, x - 6, y + 3); c.moveTo(x + 6, y); c.quadraticCurveTo(x + 16, y - 12, x + 26, y - 2); c.quadraticCurveTo(x + 16, y + 2, x + 6, y + 3); c.fill(); } }
    else { c.fillStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 40; i++) { c.beginPath(); c.arc((i * 97) % w, 40 + (i * 53) % (h - 40), 4, 0, 7); c.fill(); } }
  });
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, 3.6), new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 })); back.position.set(0, 1.8, -1.1); G.add(back);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 0.2, 2.6), mat(HW ? '#2a1a3a' : '#7a4a2a')); floor.position.set(0, -0.1, 0.1); G.add(floor);
  const gold = mat(HW ? '#ff8a1a' : '#f2c033', { metalness: 0.4, roughness: 0.4 });
  for (const s of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.6, 0.22), gold); post.position.set(s * (W / 2 + 0.4), 1.8, -1); G.add(post); }
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 1.1, 0.3, 0.3), gold); top.position.set(0, 3.5, -1); G.add(top);
  const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.3), mat('#333')); camBox.position.set(0, 3.2, -0.7); G.add(camBox);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 16).rotateX(Math.PI / 2), mat('#88ccff', { metalness: 0.6, roughness: 0.2 })); lens.position.set(0, 3.2, -0.52); G.add(lens);
  const xs = players.map((_, i) => (i - (n - 1) / 2) * 1.2);
  const cast = new Map();
  players.forEach((p, i) => {
    const slot = { actor: null, tag: null };
    cast.set(p.pid, slot);
    ctx.createActor({ look: p.look || { race: 'human', seed: p.pid * 977 + 1 }, costume: p.costume, seat: p.seat }).then(a => {
      if (!a) return; slot.actor = a; a.place(xs[i], 0, 0, 0); a.setPose('ready');
      slot.tag = ctx.stage.tag(a.group, { text: '', seat: p.seat, height: (a.height || 1.6) + 0.25, cls: 'pb-tag empty' });
    }).catch(() => {});
  });
  ctx.camera({ cx: 0, cz: 0, hw: W / 2 + 0.3, hd: 0.9, pitch: 10, tall: 2.6 });
  function strike(masks, pts) {
    for (const p of players) {
      const s = cast.get(p.pid); if (!s?.actor) continue;
      const m = masks[p.pid] ?? 0, got = pts?.[p.pid] ?? 0;
      s.actor.setPose(POSES[m]?.clip || 'shrug');
      s.tag?.set(m === 0 ? SAY[0] : got === 3 ? SAY.ok3 : got === 2 ? SAY.ok2 : SAY.bad);
      s.tag?.el.classList.toggle('good', got > 0); s.tag?.el.classList.toggle('bad', !got); s.tag?.el.classList.remove('empty');
    }
  }
  function relax() { for (const s of cast.values()) { s.actor?.setPose('ready'); s.tag?.set(''); s.tag?.el.classList.remove('good', 'bad'); s.tag?.el.classList.add('empty'); } }

  // ---------------------------------------------------------------- the buttons
  let phase = 'count', round = -1, mask = 0, t0 = null, flashAt = null, fromAt = 0, flashed = false, last = null, strip = null, stripAt = 0, stripK = -1;
  const nowS = () => performance.now() / 1000;
  const myT = () => (t0 == null ? 0 : nowS() - t0);
  function sync(el) { if (t0 == null || Math.abs(el - myT()) > 0.35) t0 = nowS() - el; }
  function paintBtns() { for (const b of btns) { const on = !!(mask & +b.dataset.bit); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); } }
  function toggle(bit) {
    if (watching || phase !== 'pose' || flashed) return;
    mask ^= bit; paintBtns();
    ctx.send('set', { m: mask, t: Math.round(myT() * 100) / 100 }); ctx.sfx('tap');
  }
  let guard = 0;
  btns.forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); guard = nowS(); toggle(+b.dataset.bit); });
    b.addEventListener('click', e => { e.preventDefault(); if (nowS() - guard > 0.4) toggle(+b.dataset.bit); });
  });
  const KEYS = Object.fromEntries(BUTTONS.flatMap(b => [[b.key, b.bit]])); Object.assign(KEYS, { KeyW: 1, KeyS: 2, KeyA: 4, KeyD: 8 });
  const onKey = e => { if (e.repeat || !KEYS[e.code]) return; e.preventDefault(); toggle(KEYS[e.code]); };
  addEventListener('keydown', onKey);

  const want = card => BUTTONS.filter(b => card & b.bit).map(b => `<i class="pb-wi">${ICON[b.id]}<em>${b.name}</em></i>`).join('<span class="pb-plus">+</span>');
  function paintStrip(list) {
    $('.pb-strip').innerHTML = players.map(p => `<div class="pb-row">${chip(p)}<span class="pb-film">${list.map(([card, m, pts]) => `<i class="${pts[p.pid] ? 'ok' : 'no'}" title="${esc(POSES[card].name)}">${pts[p.pid] ? '✓' : '✗'}</i>`).join('')}</span></div>`).join('');
  }
  function note(g) {
    if (g.phase === 'count') return 'Watch the card, hit its buttons, then hold still for the flash!';
    if (g.phase === 'pose') return watching ? 'Pose! Pose! Pose!' : 'Switch on the card\'s buttons (and only those)!';
    if (g.phase === 'photo') return g.ph ? 'Say cheese!' : 'FLASH!';
    if (init.solo) { const s = g.sc[me ?? players[0].pid], m = init.medals.filter(v => s >= v).length; return `${s} of 30 — ${['no medal', 'bronze!', 'silver!', 'GOLD!'][m]} (medals at ${init.medals.join(' / ')})`; }
    return 'The photo strip! Most points wins.';
  }

  return {
    state(g) {
      last = g; sync(g.el);
      if (g.round !== round || g.phase !== phase) {
        if (g.phase === 'pose' && (g.round !== round || phase !== 'pose')) { mask = 0; paintBtns(); flashed = false; relax(); ctx.sfx('open'); }
        if (g.phase === 'strip' && phase !== 'strip') { strip = g.strip; stripAt = nowS(); paintStrip(strip); ctx.sfx('win'); }
        round = g.round; phase = g.phase;
      }
      ui.dataset.phase = g.phase;
      if (g.flash != null) { flashAt = g.flash; fromAt = g.from; }
      if (g.ph && !g.ph.shown) { g.ph.shown = true; strike(g.ph.m, g.ph.pts); }
      $('.pb-round').textContent = g.phase === 'strip' ? 'Photo strip' : g.round >= 0 ? `Photo ${g.round + 1}/${init.rounds}` : 'Get ready';
      $('.clock b').textContent = g.left;
      if (g.card != null) { $('.pb-name').textContent = POSES[g.card].name; const w = want(g.card); if ($('.pb-want').dataset.card !== String(g.card)) { $('.pb-want').innerHTML = w; $('.pb-want').dataset.card = g.card; } }
      else if (g.phase === 'count') $('.pb-name').textContent = 'Get ready…';
      for (const p of players) {
        const el = ui.querySelector(`.pb-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.sc[p.pid];
        const st = el.querySelector('.pb-st'), pts = g.ph?.pts?.[p.pid];
        st.textContent = g.phase === 'photo' && g.ph ? (pts ? `+${pts}` : '✗') : ''; st.className = 'pb-st ' + (pts ? 'good' : 'bad');
      }
      $('.pb-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e === 'photo' && me != null) ctx.sfx(ev.pts[me] === 3 ? 'win' : ev.pts[me] ? 'good' : 'bad');
      if (ev.e === 'photo') strike(ev.m, ev.pts);
    },
    frame(dt) {
      const t = myT();
      if (phase === 'pose' && flashAt != null) {
        const u = Math.max(0, Math.min(1, (flashAt - t) / Math.max(0.1, flashAt - fromAt)));
        $('.pb-bar i').style.transform = `scaleX(${u.toFixed(3)})`;
        if (!flashed && t >= flashAt) { flashed = true; $('.pb-flash').classList.remove('go'); void $('.pb-flash').offsetWidth; $('.pb-flash').classList.add('go'); ctx.sfx('pick'); }
      } else if (phase === 'photo' && !flashed) { flashed = true; $('.pb-flash').classList.remove('go'); void $('.pb-flash').offsetWidth; $('.pb-flash').classList.add('go'); }
      if (phase === 'strip' && strip?.length) {                  // flip through the photos, one every 0.6 s
        const k = Math.floor((nowS() - stripAt) / 0.6) % strip.length;
        if (k !== stripK) { stripK = k; const [, m, pts] = strip[k]; strike(m, pts); $('.pb-round').textContent = `Photo ${k + 1}/${strip.length}`; }
      }
      for (const s of cast.values()) s.actor?.update(dt);
    },
    dispose() { removeEventListener('keydown', onKey); for (const s of cast.values()) s.tag?.remove(); backTex.dispose(); },
  };
}
