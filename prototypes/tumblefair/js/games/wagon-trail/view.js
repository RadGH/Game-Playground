// WAGON TRAIL on a screen: a strip along the top shows the trail (river, hunt, wheel, storm, trading post, the
// valley) with the wagon creeping along it, the party's food and the wagon's hearts. Under it, one big card says what
// to do RIGHT NOW, then a 2D canvas scene for the challenge and its buttons:
//   travel   rolling prairie, the covered wagon bumping along behind its ox
//   river    a river with a pale CALM patch and a bobbing marker; three crossing buttons (the patch shrinks for the
//            deeper ones) and a big GO
//   hunt     a meadow: tap the hopping critters (a gold one is worth 3)
//   wheel    the wagon wheel with eight bolt holes: tap the one that glows, then the next…
//   storm    two signposts to vote on, then a dark sky — tap HOLD ON! the moment lightning flashes
//   post     a price board with a swinging needle; tap Spare wheel or Food sack when it is on a low price
// A watching screen shows the same scene bigger, plus everyone's progress. Halloween: a moonlit trail, bats instead of
// birds, pumpkin critters, a haunted trading post (same rules).
import { chip, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock } from '../toss-kit.js';
import { critterAt, riverAt, priceAt } from './sim.js';

const STOPS = { river: ['🌊', 'River'], hunt: ['🐇', 'Hunt'], wheel: ['🛞', 'Wheel'], storm: ['⛈️', 'Storm'], post: ['🏪', 'Trading post'] };
const CARD = {
  river: ['Ford the river!', 'Pick a crossing, then tap GO while the marker is in the CALM water.'],
  hunt: ['Supper hunt!', 'Tap the hopping critters before they get away!'],
  wheel: ['A wheel came off!', 'Tap the GLOWING bolt, then the next one. Fastest fixer wins!'],
  storm: ['Storm ahead!', 'Vote: the quick RIDGE or the muddy VALLEY?'],
  post: ['Trading post!', 'Tap what to buy when the needle shows a LOW price.'],
};

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const nameOf = pid => (pid === me ? 'You' : byPid.get(pid)?.name || '?');
  ui.innerHTML = `
    <div class="wt-top"><span class="wt-title">${HW ? 'Moonlit Trail' : 'Wagon Trail'}</span><span class="clock"><b>--</b></span></div>
    <div class="wt-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="wt-trail"><div class="wt-road">${init.order.map(c => `<i data-c="${c}">${STOPS[c][0]}</i>`).join('')}<i data-c="end">🏁</i><b class="wt-wagon">🛻</b></div><div class="wt-sup"><span class="wt-food">🌾 0</span><span class="wt-hp">❤❤❤</span></div></div>
    <div class="wt-card"><b></b><span></span></div>
    <div class="wt-scene"><canvas></canvas><div class="wt-count"></div><div class="wt-say"></div></div>
    <div class="wt-panel${watching ? ' hidden' : ''}"></div>
    <p class="wt-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  $('.wt-wagon').textContent = '';
  if (me != null) ui.querySelector(`.wt-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('.wt-scene canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.18 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS);
  let G = null, phase = 'count', cross = 1, panelFor = '', sayT = 0, flashSeen = -1, bagged = new Set(), myBolt = 0, jamTill = 0, lastShot = -9, travelT = 0;
  const pops = [];                                       // little "+1" pops on the canvas { x, y, text, t }
  // ---- the canvas
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const F = init.field, view = () => { const k = Math.min(W / F.w, H / F.h); return { k, ox: (W - F.w * k) / 2, oy: (H - F.h * k) / 2 }; };
  const wheelGeo = () => { const R = Math.min(W, H) * 0.38; return { R, cx: W / 2, cy: H / 2 }; };
  const boltXY = i => { const { R, cx, cy } = wheelGeo(), a = i / init.slots * Math.PI * 2 - Math.PI / 2; return { x: cx + Math.cos(a) * R * 0.78, y: cy + Math.sin(a) * R * 0.78 }; };
  const ct = () => clock.t() - (G?.t0 || 0);
  canvas.addEventListener('pointerdown', e => {
    if (watching || !G || G.ph !== 'go') return; e.preventDefault();
    const r = canvas.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (G.c === 'hunt') {
      const t = clock.t(); if (t - lastShot < 0.4) return; lastShot = t;
      const v = view(); ctx.send('shot', { x: Math.round((px - v.ox) / v.k * 10) / 10, y: Math.round((py - v.oy) / v.k * 10) / 10, t: Math.round(t * 1000) / 1000 }); ctx.sfx('throw');
    } else if (G.c === 'wheel') {
      if (nowS() < jamTill || myBolt >= init.seq.length) return;
      let best = -1, bd = 1e9; for (let i = 0; i < init.slots; i++) { const b = boltXY(i), d = Math.hypot(b.x - px, b.y - py); if (d < bd) { bd = d; best = i; } }
      if (bd > wheelGeo().R * 0.4) return;
      ctx.send('bolt', { i: best }); if (best === init.seq[myBolt]) { myBolt++; ctx.sfx('pick'); } else { jamTill = nowS() + 0.6; ctx.sfx('bad'); }
    }
  });
  const sky = (top, bot) => { const s = g.createLinearGradient(0, 0, 0, H); s.addColorStop(0, top); s.addColorStop(1, bot); g.fillStyle = s; g.fillRect(0, 0, W, H); };
  const C = HW ? { sky: ['#1d1430', '#4a2a6a'], grass: '#2e4a3a', grass2: '#24382e', water: '#2a4a8a', calm: '#7a9ad8', post: '#3a2a5a' }
    : { sky: ['#8fd0f5', '#e8f6ff'], grass: '#8fd16a', grass2: '#72b852', water: '#3d8bd6', calm: '#bfe8ff', post: '#c98f55' };
  function wagon(x, y, s, t) {
    const b = Math.abs(Math.sin(t * 7)) * 2 * s;
    g.save(); g.translate(x, y - b); g.lineWidth = 2; g.strokeStyle = '#0d2228';
    g.fillStyle = HW ? '#ff8a1a' : '#a8743f'; g.fillRect(-30 * s, -14 * s, 50 * s, 14 * s); g.strokeRect(-30 * s, -14 * s, 50 * s, 14 * s);
    g.fillStyle = HW ? '#f4ecd8' : '#fff6e0'; g.beginPath(); g.moveTo(-30 * s, -14 * s); g.bezierCurveTo(-30 * s, -44 * s, 20 * s, -44 * s, 20 * s, -14 * s); g.closePath(); g.fill(); g.stroke();
    for (const wx of [-20, 10]) { g.save(); g.translate(wx * s, 2 * s); g.rotate(t * 5); g.fillStyle = '#6a4426'; g.beginPath(); g.arc(0, 0, 9 * s, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-9 * s, 0); g.lineTo(9 * s, 0); g.moveTo(0, -9 * s); g.lineTo(0, 9 * s); g.stroke(); g.restore(); }
    g.fillStyle = '#9a6a3a'; g.beginPath(); g.ellipse(42 * s, -8 * s, 14 * s, 9 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(56 * s, -14 * s, 7 * s, 6 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#f4ecd8'; g.beginPath(); g.moveTo(53 * s, -19 * s); g.lineTo(50 * s, -26 * s); g.lineTo(56 * s, -20 * s); g.moveTo(59 * s, -19 * s); g.lineTo(62 * s, -26 * s); g.lineTo(58 * s, -20 * s); g.fill();
    g.restore();
  }
  function prairie(t) { sky(...C.sky); g.fillStyle = C.grass2; g.beginPath(); g.ellipse(W * 0.25, H * 0.62, W * 0.5, H * 0.22, 0, 0, Math.PI * 2); g.ellipse(W * 0.85, H * 0.65, W * 0.45, H * 0.2, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = C.grass; g.fillRect(0, H * 0.68, W, H); g.fillStyle = HW ? '#4a3f5a' : '#d9b87a'; g.fillRect(0, H * 0.78, W, H * 0.07); if (HW) { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(W * 0.8, H * 0.18, 14, 0, Math.PI * 2); g.fill(); } }
  function critter(x, y, s, gold) {
    g.save(); g.translate(x, y); g.lineWidth = 2; g.strokeStyle = '#0d2228';
    const col = gold ? '#ffd23f' : HW ? '#ff8a1a' : '#c9a07a';
    if (HW && !gold) { g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 9 * s, 7.5 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#3f7a2a'; g.fillRect(-1.5 * s, -10 * s, 3 * s, 4 * s); g.fillStyle = '#2a1d4a'; g.fillRect(-4 * s, -2 * s, 2.5 * s, 2.5 * s); g.fillRect(1.5 * s, -2 * s, 2.5 * s, 2.5 * s); }
    else { g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 9 * s, 6.5 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke(); g.beginPath(); g.ellipse(-3 * s, -9 * s, 2.2 * s, 6 * s, -0.2, 0, Math.PI * 2); g.ellipse(3 * s, -9 * s, 2.2 * s, 6 * s, 0.2, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#0d2228'; g.beginPath(); g.arc(-3 * s, -1 * s, 1.2 * s, 0, Math.PI * 2); g.arc(3 * s, -1 * s, 1.2 * s, 0, Math.PI * 2); g.fill(); }
    if (gold) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 13 * s, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }
  function draw() {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const t = nowS(), c = G?.c, ph = G?.ph;
    if (!G || ph === 'count' || ph === 'travel' || ph === 'end' || (ph === 'out' && c !== 'hunt')) { prairie(t); wagon(W * 0.45 + (ph === 'travel' ? Math.sin(t) * 6 : 0), H * 0.82, Math.min(1.6, H / 150), ph === 'travel' || ph === 'count' ? t : 0); if (ph === 'end') { g.font = `900 ${Math.round(H * 0.11)}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.strokeStyle = '#0d2228'; g.lineWidth = 4; g.strokeText('Fairhaven Valley!', W / 2, H * 0.3); g.fillText('Fairhaven Valley!', W / 2, H * 0.3); } drawPops(t); return; }
    const u = ct();
    if (c === 'river') {
      prairie(t); g.fillStyle = C.water; g.fillRect(0, H * 0.38, W, H * 0.34);
      const bandW = (init.cross[cross].w * L.band) * W, bx = init.river.c * W;
      g.fillStyle = C.calm; g.fillRect(bx - bandW / 2, H * 0.38, bandW, H * 0.34); g.strokeStyle = '#0d2228'; g.lineWidth = 2; g.setLineDash([5, 5]); g.strokeRect(bx - bandW / 2, H * 0.38, bandW, H * 0.34); g.setLineDash([]);
      g.font = `900 ${Math.round(H * 0.07)}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#0d2228'; g.fillText('CALM', bx, H * 0.36);
      for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); const y = H * (0.42 + (i % 3) * 0.1), x0 = ((i * 97 + t * 60) % (W + 60)) - 30; g.moveTo(x0, y); g.quadraticCurveTo(x0 + 10, y - 4, x0 + 20, y); g.stroke(); }
      const mine = G.dn?.includes(me), x = (mine && myFord ? myFord.x : riverAt(Math.max(0, u), L)) * W;
      g.fillStyle = '#e8394a'; g.strokeStyle = '#0d2228'; g.lineWidth = 3; g.beginPath(); g.arc(x, H * 0.55 + Math.sin(t * 6) * 3, H * 0.06, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(x - 2, H * 0.47, 4, H * 0.06);
    } else if (c === 'hunt') {
      sky(...C.sky); g.fillStyle = C.grass2; g.fillRect(0, H * 0.4, W, H * 0.1); g.fillStyle = C.grass; g.fillRect(0, H * 0.46, W, H); const v = view();
      for (let i = 0; i < 14; i++) { g.fillStyle = C.grass2; const x = (i * 71) % W, y = H * (0.55 + (i % 4) * 0.11); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 4, y - 9); g.lineTo(x + 8, y); g.fill(); }
      for (const cr of init.critters) { if (G.hit?.includes(cr.i) || bagged.has(cr.i)) continue; const p = critterAt(cr, u); if (!p) continue; critter(v.ox + p.x * v.k, v.oy + p.y * v.k, v.k * 0.9, cr.gold); }
    } else if (c === 'wheel') {
      sky(...C.sky); g.fillStyle = C.grass; g.fillRect(0, H * 0.7, W, H);
      const { R, cx, cy } = wheelGeo(); g.lineWidth = 4; g.strokeStyle = '#0d2228';
      g.fillStyle = HW ? '#5a3a2a' : '#8f5f30'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = HW ? '#2a1d4a' : '#c9925a'; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, Math.PI * 2); g.fill(); g.stroke();
      for (let i = 0; i < init.slots; i++) { const a = i / init.slots * Math.PI * 2; g.strokeStyle = '#6a4426'; g.lineWidth = 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86); g.stroke(); }
      g.fillStyle = '#6a4426'; g.beginPath(); g.arc(cx, cy, R * 0.18, 0, Math.PI * 2); g.fill();
      const lit = watching ? -1 : init.seq[myBolt];
      for (let i = 0; i < init.slots; i++) { const b = boltXY(i), on = i === lit && nowS() >= jamTill; g.fillStyle = on ? '#ffd23f' : '#8a8f99'; g.strokeStyle = '#0d2228'; g.lineWidth = 3; g.beginPath(); g.arc(b.x, b.y, R * (on ? 0.17 + Math.sin(t * 10) * 0.02 : 0.12), 0, Math.PI * 2); g.fill(); g.stroke(); }
      if (!watching) { g.font = `900 ${Math.round(R * 0.22)}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(myBolt >= init.seq.length ? '✓' : `${myBolt}/${init.seq.length}`, cx, cy + R * 0.08); }
      if (nowS() < jamTill) { g.fillStyle = 'rgba(232,57,74,.25)'; g.fillRect(0, 0, W, H); }
    } else if (c === 'storm') {
      const fl = G.rt ? init.flashes[G.rt] : [], hot = fl.some(f => u >= f && u - f < 0.35);
      sky(hot ? '#f4f6ff' : HW ? '#140f26' : '#3a4a5a', hot ? '#c8d8ff' : HW ? '#2a1d4a' : '#6a7a8a');
      g.fillStyle = HW ? '#24382e' : '#4a6a3a'; g.fillRect(0, H * 0.72, W, H);
      if (!G.rt) {
        // the two signposts
        for (const [i, x, label] of [[0, W * 0.28, 'RIDGE ⚡ quick'], [1, W * 0.72, 'VALLEY 🌧 muddy']]) {
          g.fillStyle = '#8f5f30'; g.fillRect(x - 4, H * 0.3, 8, H * 0.45); g.fillStyle = '#c9925a'; g.strokeStyle = '#0d2228'; g.lineWidth = 3; g.beginPath(); g.roundRect(x - W * 0.2, H * 0.2, W * 0.4, H * 0.16, 8); g.fill(); g.stroke();
          g.font = `900 ${Math.round(Math.min(W * 0.045, H * 0.08))}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#0d2228'; g.fillText(label, x, H * 0.3);
          const votes = Object.values(G.vt || {}).filter(v => v === i).length; g.fillText('👍'.repeat(votes), x, H * 0.5);
        }
      } else {
        for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(200,220,255,.6)'; g.lineWidth = 1.5; const x = (i * 53 + t * 300) % W, y = (i * 37 + t * 500) % H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 4, y + 12); g.stroke(); }
        if (hot) { g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(W * 0.6, 0); g.lineTo(W * 0.5, H * 0.3); g.lineTo(W * 0.62, H * 0.32); g.lineTo(W * 0.48, H * 0.7); g.stroke(); }
        wagon(W * 0.4, H * 0.86, Math.min(1.4, H / 160), t * 0.3);
      }
    } else if (c === 'post') {
      sky(...C.sky); g.fillStyle = C.post; g.fillRect(W * 0.08, H * 0.12, W * 0.84, H * 0.6); g.strokeStyle = '#0d2228'; g.lineWidth = 3; g.strokeRect(W * 0.08, H * 0.12, W * 0.84, H * 0.6);
      const n = init.strip.length, x0 = W * 0.12, w = W * 0.76 / n;
      init.strip.forEach((p, i) => { g.fillStyle = p <= 1 ? '#8ff07a' : p === 2 ? '#d8f59a' : p === 3 ? '#ffe9a8' : '#ffb8a8'; g.fillRect(x0 + i * w + 2, H * 0.3, w - 4, H * 0.26); g.strokeRect(x0 + i * w + 2, H * 0.3, w - 4, H * 0.26); g.font = `900 ${Math.round(H * 0.1)}px system-ui`; g.textAlign = 'center'; g.fillStyle = '#0d2228'; g.fillText(String(p), x0 + (i + 0.5) * w, H * 0.48); });
      g.font = `800 ${Math.round(H * 0.06)}px system-ui`; g.fillText('price (food)', W / 2, H * 0.24);
      const pIdx = init.strip.indexOf(priceAt(Math.max(0, u), L)), nx = x0 + (pIdx + 0.5) * w;
      g.fillStyle = '#e8394a'; g.beginPath(); g.moveTo(nx, H * 0.62); g.lineTo(nx - 12, H * 0.76); g.lineTo(nx + 12, H * 0.76); g.closePath(); g.fill(); g.stroke();
    }
    drawPops(t);
  }
  function drawPops(t) { for (let i = pops.length - 1; i >= 0; i--) { const P = pops[i], k = t - P.t; if (k > 1) { pops.splice(i, 1); continue; } g.globalAlpha = 1 - k; g.font = `900 ${Math.round(H * 0.08)}px system-ui`; g.textAlign = 'center'; g.fillStyle = P.bad ? '#ff5f5f' : '#ffd23f'; g.strokeStyle = '#0d2228'; g.lineWidth = 3; g.strokeText(P.text, P.x, P.y - k * 30); g.fillText(P.text, P.x, P.y - k * 30); g.globalAlpha = 1; } }
  function say(text, cls = '') { const s = $('.wt-say'); s.textContent = text; s.className = 'wt-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  // ---- the buttons under the scene, per challenge
  let myFord = null;
  function panel() {
    const key = G ? `${G.ci}:${G.ph}:${G.c === 'storm' ? (G.rt ? 'hold' : 'vote') : ''}` : ''; if (key === panelFor) return; panelFor = key;
    const P = $('.wt-panel'); P.innerHTML = '';
    if (watching || !G || G.ph !== 'go') { P.classList.add('quiet'); return; }
    P.classList.remove('quiet');
    const c = G.c;
    if (c === 'river') {
      P.innerHTML = `<div class="wt-row3">${init.cross.map((x, i) => `<button class="wt-b wt-x${i === cross ? ' on' : ''}" data-x="${i}"><b>${['Shallow ford', 'Rope ferry', 'Deep swim'][i]}</b><span>${x.pts} pt${x.pts > 1 ? 's' : ''}</span></button>`).join('')}</div><button class="big-btn wt-go">GO!</button>`;
      P.querySelectorAll('.wt-x').forEach(b => b.addEventListener('click', () => { if (myFord) return; cross = +b.dataset.x; P.querySelectorAll('.wt-x').forEach(x => x.classList.toggle('on', x === b)); ctx.sfx('tap'); }));
      P.querySelector('.wt-go').addEventListener('click', () => { if (myFord) return; const t = clock.t(); myFord = { x: riverAt(Math.max(0, t - G.t0), L), k: cross }; ctx.send('ford', { c: cross, t: Math.round(t * 1000) / 1000 }); ctx.sfx('throw'); P.querySelector('.wt-go').disabled = true; });
    } else if (c === 'hunt') P.innerHTML = '<p class="wt-hint">👆 Tap the critters in the meadow!</p>';
    else if (c === 'wheel') P.innerHTML = '<p class="wt-hint">👆 Tap the GLOWING bolt on the wheel!</p>';
    else if (c === 'storm' && !G.rt) {
      P.innerHTML = `<div class="wt-row2"><button class="big-btn wt-v" data-r="0">⚡ Ridge<small>quick, stormy</small></button><button class="big-btn wt-v" data-r="1">🌧 Valley<small>muddy: -2 food</small></button></div>`;
      P.querySelectorAll('.wt-v').forEach(b => b.addEventListener('click', () => { ctx.send('vote', { r: +b.dataset.r }); P.querySelectorAll('.wt-v').forEach(x => { x.disabled = true; x.classList.toggle('on', x === b); }); ctx.sfx('pick'); }));
    } else if (c === 'storm') {
      P.innerHTML = '<button class="big-btn wt-hold">HOLD ON!</button><p class="wt-hint">Tap the moment the lightning flashes!</p>';
      P.querySelector('.wt-hold').addEventListener('pointerdown', e => { e.preventDefault(); ctx.send('grab', { t: Math.round(clock.t() * 1000) / 1000 }); });
    } else if (c === 'post') {
      P.innerHTML = `<div class="wt-row2"><button class="big-btn wt-buy" data-it="0">🛞 Spare wheel<small>+1 ❤</small></button><button class="big-btn wt-buy" data-it="1">🌾 Food sack<small>+4 food</small></button></div>`;
      P.querySelectorAll('.wt-buy').forEach(b => b.addEventListener('click', () => { ctx.send('buy', { it: +b.dataset.it, t: Math.round(clock.t() * 1000) / 1000 }); ctx.sfx('tap'); }));
    }
  }
  function cardText(gs) {
    if (gs.ph === 'count') return ['Roll out!', 'Every few seconds the trail throws a challenge at you.'];
    if (gs.ph === 'end') return ['You made it!', init.solo ? `${gs.sc[me] ?? 0} points on the trail` : 'Welcome to Fairhaven Valley'];
    if (gs.ph === 'travel') return [`Next: ${STOPS[gs.c][1]}`, CARD[gs.c][1]];
    if (gs.ph === 'out' && gs.res) return [gs.res.best.length ? `Best: ${gs.res.best.map(nameOf).join(' & ')}` : 'Nobody scored', gs.res.notes.join(' · ')];
    if (gs.c === 'storm') return gs.rt ? ['HOLD ON!', 'Tap the moment the lightning flashes!'] : CARD.storm;
    return CARD[gs.c];
  }
  return {
    state(gs) {
      const prevCi = G?.ci; G = gs;
      if (gs.ph !== phase) {
        if (gs.ph === 'travel') { tunes.start(HW ? 'spooky' : 'boogie'); travelT = nowS(); }
        if (gs.ph === 'go') ctx.sfx('pick');
        if (gs.ph === 'end') { tunes.stop(); ctx.sfx('win'); }
      }
      phase = gs.ph; clock.sync(gs.el);
      if (gs.ci !== prevCi) { myFord = null; bagged = new Set(); myBolt = 0; jamTill = 0; cross = 1; flashSeen = -1; }
      if (gs.pr && me != null && gs.pr[me] > myBolt) myBolt = gs.pr[me];
      $('.clock b').textContent = gs.left;
      $('.wt-count').textContent = gs.ph === 'count' ? gs.left : '';
      const [h1, h2] = cardText(gs); $('.wt-card b').textContent = h1; $('.wt-card span').textContent = h2;
      $('.wt-card').className = 'wt-card ' + gs.ph;
      $('.wt-food').textContent = `🌾 ${gs.food}`; $('.wt-hp').textContent = '❤'.repeat(gs.hp) + '♡'.repeat(Math.max(0, 3 - gs.hp));
      // the wagon creeps along the trail
      const stops = init.order.length, at = gs.ph === 'end' ? stops : Math.max(0, gs.ci + (gs.ph === 'out' ? 0.5 : gs.ph === 'travel' ? -0.3 : 0));
      $('.wt-wagon').style.left = `${(at / stops) * 100}%`;
      ui.querySelectorAll('.wt-road i').forEach((el, i) => el.classList.toggle('done', i < gs.ci || (i === gs.ci && gs.ph === 'out') || gs.ph === 'end'));
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.wt-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0); c.classList.toggle('done', !!gs.dn?.includes(+pid)); }
      $('.wt-note').textContent = watching ? '' : gs.ph === 'go' && gs.dn?.includes(me) && gs.c !== 'hunt' ? 'Done! Waiting for the others…' : '';
      panel();
    },
    event(ev) {
      const v = view();
      if (ev.e === 'ford' && ev.pid === me) { say(ev.ok ? `Across! +${init.cross[ev.k].pts}` : 'Splash! Missed the calm water', ev.ok ? 'good' : 'bad'); ctx.sfx(ev.ok ? 'good' : 'splat'); }
      else if (ev.e === 'bag') { bagged.add(ev.i); const cr = init.critters[ev.i], p = critterAt(cr, ct()); if (p) pops.push({ x: v.ox + p.x * v.k, y: v.oy + p.y * v.k, text: ev.pid === me ? `+${ev.k}` : nameOf(ev.pid), t: nowS() }); if (ev.pid === me) ctx.sfx(ev.k > 1 ? 'coins' : 'good'); }
      else if (ev.e === 'miss' && ev.pid === me) pops.push({ x: v.ox + ev.x * v.k, y: v.oy + ev.y * v.k, text: 'miss', t: nowS(), bad: true });
      else if (ev.e === 'fixed') { if (ev.pid === me) { say(ev.place === 1 ? 'Fixed it first! +3' : `Fixed! #${ev.place}`, 'good'); ctx.sfx('coins'); } }
      else if (ev.e === 'jam' && ev.pid === me) say('Wrong bolt!', 'bad');
      else if (ev.e === 'route') { say(ev.route === 'ridge' ? 'Up the RIDGE! Hold on…' : 'Down the VALLEY…', ''); ctx.sfx('trap'); }
      else if (ev.e === 'grab' && ev.pid === me) { say(`Held on! +1 (${Math.round(ev.rt * 1000)} ms)`, 'good'); ctx.sfx('good'); }
      else if (ev.e === 'slip' && ev.pid === me) { say('Too soon!', 'bad'); ctx.sfx('bad'); }
      else if (ev.e === 'buy' && ev.pid === me) { say(`Bought for ${ev.price} food! +${ev.price <= 1 ? 3 : ev.price === 2 ? 2 : ev.price === 3 ? 1 : 0}`, ev.price <= 2 ? 'good' : ''); ctx.sfx('coins'); }
      else if (ev.e === 'nobuy' && ev.pid === me) { say(ev.why === 'full' ? 'The wagon is fine: buy food!' : 'Not enough food!', 'bad'); ctx.sfx('bad'); }
      else if (ev.e === 'out') { ctx.sfx(ev.best.includes(me) ? 'coins' : 'tap'); }
      else if (ev.e === 'arrive') { say(`Made it! +${ev.bonus} each`, 'good'); }
    },
    frame() {
      if (sayT && nowS() - sayT > 1.5) { $('.wt-say').classList.remove('pop'); sayT = 0; }
      if (G?.c === 'storm' && G.rt && G.ph === 'go') { const fl = init.flashes[G.rt], u = ct(), k = fl.findIndex(f => u >= f && u - f < 0.1); if (k >= 0 && k !== flashSeen) { flashSeen = k; ctx.sfx('hit'); } }
      draw();
    },
    dispose() { ro?.disconnect(); tunes.dispose(); },
  };
}
