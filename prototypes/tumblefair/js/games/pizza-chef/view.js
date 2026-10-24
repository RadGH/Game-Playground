// PIZZA PRONTO on a screen: the ticket at the top (each thing it asks for is a pill: sauce, cheese, "3 pepperoni ·
// LEFT half"), the pizza on a wooden peel in the middle (a 2D canvas: dough with a crust, the sauce, a cheese melt,
// toppings where you dropped them, and a faint line down the middle with L and R so the halves are easy), the tray of
// buttons under it (two sauces, cheese, five toppings with a count on each, Undo, Start over) and one big button:
// INTO THE OVEN, then PULL IT OUT. In the oven the pizza browns as the bake bar runs (pale -> the golden band ->
// burnt). After each pizza a card says what it scored. At the bell: the gallery, each cook's best pizza and their
// funniest one with its name ("Charcoal Surprise"). A watching screen shows everyone's progress and the gallery.
// Halloween: pumpkin sauce, ghost sauce, cobweb cheese, pumpkin coins, toadstools, spooky olives, slime peppers and
// candy corn (the same rules and the same tickets, only the names, colours and pictures change).
import { chip, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock } from '../toss-kit.js';
import { judgeMatch } from './sim.js';

const NAMES = { pep: 'pepperoni', mush: 'mushrooms', olive: 'olives', pepper: 'peppers', pine: 'pineapple' };
const NAMES_HW = { pep: 'pumpkin coins', mush: 'toadstools', olive: 'spooky olives', pepper: 'slime peppers', pine: 'candy corn' };
const ICON = { pep: '#d8342a', mush: '#e8d8b8', olive: '#2a2a2a', pepper: '#3ecf5a', pine: '#ffd23f' };
const ICON_HW = { pep: '#ff8a1a', mush: '#e04a6a', olive: '#f4f6ff', pepper: '#7dff5a', pine: '#ffb020' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const TOPS = init.tops, orders = init.orders, bakeT = init.bakeT, B = init.bake;
  const NM = HW ? NAMES_HW : NAMES, IC = HW ? ICON_HW : ICON;
  const SAUCE = HW ? { red: ['Pumpkin sauce', '#ff7a14'], white: ['Ghost sauce', '#f4f6ff'] } : { red: ['Tomato sauce', '#d8342a'], white: ['White sauce', '#f3ead8'] };
  const CHEESE = HW ? 'Cobweb cheese' : 'Cheese';
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="pz-top"><span class="pz-title">${HW ? 'Fright Pizza' : 'Pizza Pronto'}</span><span class="clock"><b>--</b></span></div>
    <div class="pz-board">${players.map(p => chip(p, '<em class="sc">0</em><i class="pz-n"></i>')).join('')}</div>
    <div class="pz-ticket"></div>
    <div class="pz-stage"><canvas></canvas><div class="pz-count"></div><div class="pz-card"></div></div>
    <div class="pz-bake hidden"><div class="pz-bar"><i class="pz-gold"></i><i class="pz-mark"></i></div><div class="pz-bakew"><span>raw</span><span>golden</span><span>burnt</span></div></div>
    <div class="pz-tray${watching ? ' hidden' : ''}">
      <button data-s="red" class="pz-b sauce"><i style="--c:${SAUCE.red[1]}"></i>${SAUCE.red[0]}</button>
      <button data-s="white" class="pz-b sauce"><i style="--c:${SAUCE.white[1]}"></i>${SAUCE.white[0]}</button>
      <button data-c="1" class="pz-b cheese"><i style="--c:#ffd23f"></i>${CHEESE}</button>
      <button data-u="1" class="pz-b undo">↩ Undo</button><button data-x="1" class="pz-b clear">🗑 Redo</button>
      ${TOPS.map((t, k) => `<button data-k="${k}" class="pz-b top"><i style="--c:${IC[t]}"></i>${NM[t]}<b class="pz-cnt"></b></button>`).join('')}
    </div>
    <button class="pz-go big-btn${watching ? ' hidden' : ''}">INTO THE OVEN ➜</button>
    <div class="pz-gal hidden"></div>
    <p class="pz-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.pz-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('.pz-stage canvas'), g = canvas.getContext('2d');
  const tunes = createTunes({ volume: 0.18 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, init.play + 1);
  let sentAt = 0, phase = 'count', mode = 'build', k = 0, pizza = { s: null, c: 0, tp: [] }, sel = 0, ovenT = null, G = null, cardT = 0, lastDrop = null, myLast = null;
  // ---- the ticket
  function ticket() {
    const o = orders[k];
    if (!o) { $('.pz-ticket').innerHTML = '<b class="pz-oh">All orders done! 🎉</b>'; return; }
    const m = judgeMatch(o, pizza), cnt = m.counts;
    const pill = (ok, html) => `<span class="pz-p${ok ? ' ok' : ''}">${html}</span>`;
    const where = w => (w === 'all' ? 'anywhere' : `<u>${w.toUpperCase()}</u> half`);
    $('.pz-ticket').innerHTML = `<b class="pz-oh">Order ${k + 1}</b>` +
      pill(pizza.s === o.sauce, `<i style="--c:${SAUCE[o.sauce][1]}"></i>${SAUCE[o.sauce][0]}`) +
      pill(pizza.c === o.cheese, o.cheese ? `<i style="--c:#ffd23f"></i>${CHEESE}` : '🚫 NO cheese') +
      o.lines.map(ln => pill(cnt[ln.k] === ln.n, `<i style="--c:${IC[TOPS[ln.k]]}"></i><b>${ln.n}</b> ${NM[TOPS[ln.k]]} · ${where(ln.where)}`)).join('');
  }
  function tray() {
    const cnt = TOPS.map((_, kk) => pizza.tp.filter(t => t[0] === kk).length);
    ui.querySelectorAll('.pz-b.top').forEach(b => { const kk = +b.dataset.k; b.classList.toggle('on', kk === sel); b.querySelector('.pz-cnt').textContent = cnt[kk] || ''; });
    ui.querySelectorAll('.pz-b.sauce').forEach(b => b.classList.toggle('on', pizza.s === b.dataset.s));
    $('.pz-b.cheese').classList.toggle('on', !!pizza.c);
    const building = mode === 'build' && phase === 'play' && k < orders.length;
    $('.pz-tray').classList.toggle('off', !building);
    const go = $('.pz-go'); go.disabled = !(phase === 'play' && (mode === 'build' ? k < orders.length : mode === 'oven'));
    go.textContent = mode === 'oven' ? 'PULL IT OUT!' : k >= orders.length ? 'All done!' : 'INTO THE OVEN ➜';
    go.classList.toggle('pull', mode === 'oven');
    $('.pz-bake').classList.toggle('hidden', mode !== 'oven');
  }
  const refresh = () => { ticket(); tray(); };
  ui.querySelector('.pz-tray').addEventListener('click', e => {
    const b = e.target.closest('.pz-b'); if (!b || mode !== 'build' || phase !== 'play') return;
    if (b.dataset.s) pizza.s = pizza.s === b.dataset.s ? null : b.dataset.s;
    else if (b.dataset.c) pizza.c = pizza.c ? 0 : 1;
    else if (b.dataset.u) pizza.tp.pop();
    else if (b.dataset.x) pizza = { s: null, c: 0, tp: [] };
    else if (b.dataset.k != null) sel = +b.dataset.k;
    ctx.sfx('tap'); refresh();
  });
  // ---- dropping toppings: tap, or drag to sprinkle a trail
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const geo = () => { const R = Math.min(W, H) * 0.43; return { R, cx: W / 2, cy: H / 2 }; };
  function toPizza(e) { const r = canvas.getBoundingClientRect(), { R, cx, cy } = geo(); return { x: (e.clientX - r.left - cx) / R, y: (e.clientY - r.top - cy) / R }; }
  function drop(p) {
    if (mode !== 'build' || phase !== 'play' || k >= orders.length || pizza.tp.length >= init.max) return false;
    const d = Math.hypot(p.x, p.y); if (d > 0.9) { if (d > 1.15) return false; p.x *= 0.9 / d; p.y *= 0.9 / d; }
    pizza.tp.push([sel, Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]); lastDrop = p; ctx.sfx('pick'); refresh(); return true;
  }
  let dragging = false;
  canvas.addEventListener('pointerdown', e => { if (watching) return; e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); dragging = true; if (mode === 'oven') { pull(); return; } drop(toPizza(e)); });
  canvas.addEventListener('pointermove', e => { if (!dragging || mode !== 'build') return; const p = toPizza(e); if (!lastDrop || Math.hypot(p.x - lastDrop.x, p.y - lastDrop.y) > 0.26) drop(p); });
  const stop = () => { dragging = false; lastDrop = null; };
  canvas.addEventListener('pointerup', stop); canvas.addEventListener('pointercancel', stop);
  // ---- oven
  function oven() {
    if (mode !== 'build' || phase !== 'play' || k >= orders.length) return;
    const t = clock.t(); ovenT = t; mode = 'oven'; sentAt = nowS();
    ctx.send('oven', { p: pizza, t: Math.round(t * 1000) / 1000 }); ctx.sfx('throw'); tunes.fx('ding', 0.8); refresh();
  }
  function pull() {
    if (mode !== 'oven' || ovenT == null) return;
    const t = Math.max(ovenT + 0.05, clock.t()); ctx.send('pull', { t: Math.round(t * 1000) / 1000 }); mode = 'wait'; ctx.sfx('tap'); refresh();
  }
  $('.pz-go').addEventListener('click', () => (mode === 'oven' ? pull() : oven()));
  const onKey = e => { if (watching || e.repeat || !['Space', 'Enter'].includes(e.code) || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); mode === 'oven' ? pull() : oven(); };
  addEventListener('keydown', onKey);
  // ---- drawing a pizza (also used for the gallery)
  function drawTop(c, kind, x, y, s) {
    const t = TOPS[kind]; c.save(); c.translate(x, y); c.lineWidth = Math.max(1, s * 0.08); c.strokeStyle = '#3a1a0a';
    if (t === 'pep') { c.fillStyle = IC.pep; c.beginPath(); c.arc(0, 0, s * 0.55, 0, Math.PI * 2); c.fill(); c.stroke(); c.fillStyle = HW ? '#7a2a00' : '#a01a12'; for (const [a, r] of [[0.5, 0.25], [2.4, 0.3], [4.2, 0.22]]) { c.beginPath(); c.arc(Math.cos(a) * r * s, Math.sin(a) * r * s, s * 0.08, 0, Math.PI * 2); c.fill(); } if (HW) { c.strokeStyle = '#3f7a2a'; c.lineWidth = s * 0.12; c.beginPath(); c.moveTo(0, -s * 0.5); c.lineTo(s * 0.1, -s * 0.72); c.stroke(); } }
    else if (t === 'mush') { c.fillStyle = HW ? '#f4ecd8' : '#d9c8a6'; c.fillRect(-s * 0.14, -s * 0.05, s * 0.28, s * 0.42); c.fillStyle = IC.mush; c.beginPath(); c.ellipse(0, -s * 0.08, s * 0.5, s * 0.32, 0, Math.PI, 0); c.closePath(); c.fill(); c.stroke(); if (HW) { c.fillStyle = '#fff'; c.beginPath(); c.arc(-s * 0.18, -s * 0.2, s * 0.07, 0, Math.PI * 2); c.arc(s * 0.16, -s * 0.24, s * 0.06, 0, Math.PI * 2); c.fill(); } }
    else if (t === 'olive') { c.strokeStyle = HW ? '#2a2a2a' : '#1a1a1a'; c.fillStyle = IC.olive; c.lineWidth = s * 0.16; c.beginPath(); c.arc(0, 0, s * 0.32, 0, Math.PI * 2); if (HW) { c.fill(); c.stroke(); c.fillStyle = '#5a2a7a'; c.beginPath(); c.arc(0, 0, s * 0.13, 0, Math.PI * 2); c.fill(); } else c.stroke(); }
    else if (t === 'pepper') { c.strokeStyle = IC.pepper; c.lineWidth = s * 0.17; c.beginPath(); c.arc(0, 0, s * 0.36, 0.3, Math.PI * 1.75); c.stroke(); }
    else { c.fillStyle = IC.pine; c.beginPath(); c.moveTo(0, -s * 0.42); c.lineTo(s * 0.38, s * 0.3); c.lineTo(-s * 0.38, s * 0.3); c.closePath(); c.fill(); c.stroke(); if (HW) { c.fillStyle = '#fff6e0'; c.beginPath(); c.moveTo(0, -s * 0.42); c.lineTo(s * 0.14, -s * 0.16); c.lineTo(-s * 0.14, -s * 0.16); c.closePath(); c.fill(); } }
    c.restore();
  }
  function drawPizza(c, cx, cy, R, p, bake = 0, guide = null) {
    // bake: 0 raw .. 1 golden(ish) .. 1.4 charcoal
    const tint = f => { const gold = Math.min(1, f / 0.75), burn = Math.max(0, (f - 0.95) / 0.45); return { gold, burn }; }, { gold, burn } = tint(bake);
    c.save();
    c.fillStyle = `rgb(${Math.round(236 - 40 * gold - 150 * burn)},${Math.round(206 - 70 * gold - 140 * burn)},${Math.round(150 - 90 * gold - 90 * burn)})`;
    c.strokeStyle = '#3a1a0a'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.stroke();
    if (p.s) { c.fillStyle = SAUCE[p.s][1]; c.globalAlpha = 1 - burn * 0.6; c.beginPath(); c.arc(cx, cy, R * 0.86, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1; }
    if (p.c) { c.fillStyle = HW ? 'rgba(244,246,255,.85)' : '#ffd84a'; for (let i = 0; i < 22; i++) { const a = i * 2.39996, r = R * 0.78 * Math.sqrt((i + 0.5) / 22); c.beginPath(); c.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * 0.15, R * 0.1, a, 0, Math.PI * 2); c.fill(); } if (HW) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(i * 1.047) * R * 0.8, cy + Math.sin(i * 1.047) * R * 0.8); c.stroke(); } } }
    if (guide) { c.setLineDash([6, 6]); c.strokeStyle = 'rgba(58,26,10,.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy - R * 0.95); c.lineTo(cx, cy + R * 0.95); c.stroke(); c.setLineDash([]);
      if (guide !== 'all') { c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.arc(cx, cy, R * 0.86, guide === 'left' ? Math.PI / 2 : -Math.PI / 2, guide === 'left' ? Math.PI * 1.5 : Math.PI / 2); c.fill(); }
      c.font = `900 ${Math.round(R * 0.15)}px system-ui, sans-serif`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = '#0d2228'; c.fillStyle = '#ffffff'; for (const [t, x] of [['L', cx - R * 1.06], ['R', cx + R * 1.06]]) { c.strokeText(t, x, cy + R * 0.05); c.fillText(t, x, cy + R * 0.05); } }
    for (const [kk, x, y] of p.tp) drawTop(c, kk, cx + x * R, cy + y * R, R * 0.17);
    if (burn > 0) { c.fillStyle = `rgba(30,15,5,${Math.min(0.75, burn * 0.8)})`; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const { R, cx, cy } = geo();
    if (mode === 'oven' || (watching && G)) {
      // the oven: a brick arch with a fire at the back
      g.fillStyle = HW ? '#3a2a5a' : '#b8583a'; g.beginPath(); g.roundRect(cx - R * 1.15, cy - R * 1.05, R * 2.3, R * 2.1, R * 0.5); g.fill();
      g.fillStyle = '#1a0d08'; g.beginPath(); g.ellipse(cx, cy + R * 0.25, R * 1.0, R * 0.95, 0, Math.PI, 0); g.lineTo(cx + R, cy + R * 0.8); g.lineTo(cx - R, cy + R * 0.8); g.closePath(); g.fill();
      for (let i = 0; i < 5; i++) { g.fillStyle = HW ? ['#7dff5a', '#b57bff'][i % 2] : ['#ff8a1a', '#ffd23f'][i % 2]; const x = cx - R * 0.6 + i * R * 0.3, h = R * (0.3 + 0.12 * Math.sin(t * 9 + i * 2)); g.beginPath(); g.moveTo(x - R * 0.12, cy + R * 0.1); g.quadraticCurveTo(x, cy + R * 0.1 - h * 2, x + R * 0.12, cy + R * 0.1); g.fill(); }
      if (mode === 'oven' && ovenT != null) { const f = (t - ovenT) / bakeT; g.save(); g.translate(cx, cy + R * 0.52); g.scale(1, 0.38); drawPizza(g, 0, 0, R * 0.72, pizza, f); g.restore(); }
      return;
    }
    g.fillStyle = HW ? '#3b2c5c' : '#c8925a'; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, Math.PI * 2); g.fill();
    g.fillRect(cx - R * 0.14, cy + R * 1.0, R * 0.28, H);
    const o = orders[k], guide = o?.lines.find(ln => ln.k === sel)?.where || 'all';
    drawPizza(g, cx, cy, R, pizza, 0, guide);
  }
  function card(html, cls = '') { const c = $('.pz-card'); c.innerHTML = html; c.className = 'pz-card show ' + cls; cardT = nowS(); }
  function gallery(gal) {
    const box = $('.pz-gal'); box.classList.remove('hidden');
    $('.pz-tray').classList.add('hidden'); $('.pz-go').classList.add('hidden'); $('.pz-bake').classList.add('hidden'); $('.pz-ticket').classList.add('hidden');
    box.innerHTML = `<h3>The pizza gallery</h3>` + players.map(p => {
      const G2 = gal[p.pid] || {};
      const cell = (P, label) => P ? `<figure><canvas data-k="${P.k}"></canvas><figcaption><b>${esc(label)}</b><span>${P.pts} pts · ${esc(init.tags[P.tag])}</span></figcaption></figure>` : '';
      return `<div class="pz-row" style="--seat:${p.color}"><span class="pz-who">${chip(p)}</span>${cell(G2.best, 'Best')}${cell(G2.worst, 'Funniest')}${!G2.best ? '<em>No pizzas served!</em>' : ''}</div>`;
    }).join('');
    const cv = [...box.querySelectorAll('canvas')]; let i = 0;
    for (const p of players) for (const P of [gal[p.pid]?.best, gal[p.pid]?.worst]) {
      if (!P) continue; const c = cv[i++], s = 110; c.width = c.height = s * dpr; c.style.width = c.style.height = s + 'px';
      const cc = c.getContext('2d'); cc.setTransform(dpr, 0, 0, dpr, 0, 0); drawPizza(cc, s / 2, s / 2, s * 0.42, P, Math.min(1.4, P.bake / 0.74 * 0.75));
    }
  }
  function note(gs) {
    if (gs.phase === 'count') return watching ? 'The kitchen opens…' : 'Read the ticket, build it, bake it golden!';
    if (gs.phase === 'end') { if (init.solo && me != null) { const s = gs.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; } return 'Kitchen closed!'; }
    if (watching) return 'Everyone is cooking the same tickets!';
    return mode === 'oven' ? 'Pull it out in the GOLDEN band!' : 'Tap a topping, then tap the pizza (drag to sprinkle).';
  }
  refresh();
  return {
    state(gs) {
      G = gs;
      if (gs.phase !== phase) {
        if (gs.phase === 'play') { clock.reset(); clock.sync(gs.el || 0); tunes.start(HW ? 'spooky' : 'boogie'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx('win'); mode = 'done'; }
      }
      if (gs.phase === 'play') clock.sync(gs.el);
      phase = gs.phase;
      if (me != null) {
        // follow the server: a new ticket after a pizza is served; back in the oven after a reconnect
        if (gs.k[me] !== k) { k = gs.k[me]; pizza = { s: null, c: 0, tp: [] }; if (mode !== 'done') mode = 'build'; ovenT = null; }
        if (gs.ov[me] != null && mode === 'build' && phase === 'play') { mode = 'oven'; ovenT = gs.ov[me]; }
        // the server never took the pizza (a late or doubled message): after a couple of seconds, carry on building it
        if (gs.ov[me] == null && (mode === 'oven' || mode === 'wait') && gs.k[me] === k && nowS() - sentAt > 2.2) { mode = 'build'; ovenT = null; }
      }
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'play' && gs.left <= 10);
      $('.pz-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.pz-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.querySelector('.pz-n').textContent = `🍕${gs.k[pid]}`; c.classList.toggle('lead', n === best && best > 0); }
      if (gs.gal && $('.pz-gal').classList.contains('hidden')) gallery(gs.gal);
      $('.pz-note').textContent = note(gs);
      refresh();
    },
    event(ev) {
      if (ev.e === 'served' && ev.pid === me) {
        myLast = ev;
        const bw = { golden: 'Golden bake!', pale: 'A bit pale', dark: 'A bit dark', raw: 'Raw dough!', burnt: 'BURNT!' }[ev.word];
        card(`<b>+${ev.pts}</b><span>Match ${ev.match}/10 · ${bw} ${ev.bake ? '+' + ev.bake : ''} · ${ev.speed === 2 ? 'Speedy +2' : ev.speed ? 'Quick +1' : 'Slow'}</span>${ev.tag ? `<em>${esc(init.tags[ev.tag])}</em>` : ''}`, ev.pts >= 13 ? 'gold' : ev.pts >= 8 ? 'good' : 'bad');
        ctx.sfx(ev.pts >= 13 ? 'coins' : ev.pts >= 8 ? 'good' : 'bad');
      }
    },
    frame() {
      const t = phase === 'count' ? 0 : clock.t();
      if (mode === 'oven' && ovenT != null) {
        const f = (t - ovenT) / bakeT, u = Math.min(1, f / B.auto);
        $('.pz-mark').style.left = `${u * 100}%`;
        $('.pz-gold').style.left = `${B.gold[0] / B.auto * 100}%`; $('.pz-gold').style.width = `${(B.gold[1] - B.gold[0]) / B.auto * 100}%`;
        $('.pz-bar').classList.toggle('in', f >= B.gold[0] && f <= B.gold[1]);
        $('.pz-bar').classList.toggle('burn', f > B.dark);
      }
      if (cardT && nowS() - cardT > 1.8) { $('.pz-card').classList.remove('show'); cardT = 0; }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
