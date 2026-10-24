// SKETCHY COPY on a screen. Show: the doodle big on a paper card ("Remember it!") with a shrinking bar. Draw: an empty
// square pad (one pencil; Clear and Done). Reveal: the doodle next to every copy with its % match. Gallery: every round
// in a row — the original, then each player's copy with their face and score — which is where the laughs are. All the
// pictures are small SVGs drawn from the same point lists the sim scores, so what you see is what was judged.
// Halloween: spooky doodles (the sim picks them), orange paper and purple pencil.
import { chip, esc } from '../../client/gamehud.js';
import { ptsOf } from './sim.js';
import { SHAPES, SHAPES_HW } from './shapes.js';

const W = 6;                                            // pencil width on the 256 grid
const hex2 = v => v.toString(16).padStart(2, '0');

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = init.season === 'halloween' || ctx.season === 'halloween';
  const list = init.season === 'halloween' ? SHAPES_HW : SHAPES, INKC = HW ? '#4a1a7a' : '#1d1d24';
  const byPid = new Map(players.map(p => [p.pid, p]));
  const svgOf = (strokes, cls = '') => `<svg class="sk-pic ${cls}" viewBox="0 0 256 256" aria-hidden="true">${strokes.map(st => st.length === 1 ? `<circle cx="${st[0][0]}" cy="${st[0][1]}" r="${W / 2}"/>` : `<polyline points="${st.map(p => p.join(',')).join(' ')}"/>`).join('')}</svg>`;
  const inkSvg = (ink, cls) => svgOf((ink || []).map(ptsOf).filter(s => s.length), cls);
  ui.innerHTML = `
    <div class="sk-top"><span class="sk-title">Sketchy Copy</span><span class="sk-round"></span><span class="clock"><b>--</b></span></div>
    <section class="sk-show"><p class="sk-say">Remember it!</p><div class="sk-card"></div><i class="sk-bar"><i></i></i></section>
    <section class="sk-draw"><p class="sk-say">Now draw it from memory!</p><div class="sk-pad"><canvas></canvas><i class="sk-full">Page full!</i></div>
      <div class="sk-tools"><button class="sk-clear btn">Clear</button><button class="sk-done big-btn">I'm done!</button></div></section>
    <section class="sk-wait"><p class="sk-say">Everyone is drawing…</p><div class="sk-artists">${players.map(p => chip(p, '<em class="st">drawing</em>')).join('')}</div></section>
    <section class="sk-reveal"><div class="sk-rows"></div></section>
    <div class="sk-players">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <p class="sk-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.sk-players [data-pid="${me}"]`)?.classList.add('me');
  const pad = $('.sk-pad canvas'), pg = pad.getContext('2d');
  let phase = 'count', round = -1, strokes = [], cur = null, buf = '', bufFor = -1, total = 0, done = false, showUntil = 0, showFor = 1;
  const art = (init.art || []).slice();

  // ---- the pencil
  function repaint() {
    const k = pad.width / 256; pg.fillStyle = HW ? '#ffe2c0' : '#fffdf6'; pg.fillRect(0, 0, pad.width, pad.height);
    pg.strokeStyle = pg.fillStyle = INKC; pg.lineWidth = W * k; pg.lineCap = pg.lineJoin = 'round';
    for (const s of strokes) { const pts = ptsOf(s); if (!pts.length) continue; pg.beginPath(); pg.moveTo((pts[0][0] + .5) * k, (pts[0][1] + .5) * k); if (pts.length === 1) pg.lineTo((pts[0][0] + .6) * k, (pts[0][1] + .5) * k); for (const [x, y] of pts.slice(1)) pg.lineTo((x + .5) * k, (y + .5) * k); pg.stroke(); }
  }
  function fit() { const r = pad.getBoundingClientRect(), px = Math.max(64, Math.round(r.width * Math.min(2, devicePixelRatio || 1))); if (pad.width !== px) { pad.width = pad.height = px; repaint(); } }
  const ro = new ResizeObserver(fit); ro.observe(pad);
  function flush() { if (!buf || bufFor < 0) return; ctx.send('ink', { s: bufFor, p: buf }); buf = ''; }
  const canDraw = () => !watching && phase === 'draw' && !done;
  function point(e) {
    const r = pad.getBoundingClientRect(), x = Math.max(0, Math.min(255, Math.floor((e.clientX - r.left) / r.width * 256))), y = Math.max(0, Math.min(255, Math.floor((e.clientY - r.top) / r.height * 256)));
    const s = strokes[cur.i], n = s.length / 4;
    if (n) { const lx = parseInt(s.substr(-4, 2), 16), ly = parseInt(s.substr(-2), 16); if (Math.abs(lx - x) + Math.abs(ly - y) < 3) return; }
    if (total >= init.maxPoints) { $('.sk-full').classList.add('on'); return; }
    const h = hex2(x) + hex2(y); strokes[cur.i] += h; buf += h; total++;
    const k = pad.width / 256; pg.strokeStyle = pg.fillStyle = INKC; pg.lineWidth = W * k; pg.lineCap = 'round';
    pg.beginPath(); if (n) pg.moveTo((parseInt(s.substr(-4, 2), 16) + .5) * k, (parseInt(s.substr(-2), 16) + .5) * k); else pg.moveTo((x + .5) * k, (y + .5) * k); pg.lineTo((x + .5) * k + (n ? 0 : .1), (y + .5) * k); pg.stroke();
    if (buf.length / 4 >= init.maxChunk) flush();
  }
  pad.addEventListener('pointerdown', e => {
    if (!canDraw() || cur || strokes.length >= init.maxStrokes) return;
    e.preventDefault(); pad.setPointerCapture?.(e.pointerId);
    flush(); strokes.push(''); cur = { i: strokes.length - 1, pid: e.pointerId }; bufFor = cur.i; point(e);
  });
  pad.addEventListener('pointermove', e => { if (!cur || e.pointerId !== cur.pid) return; for (const ev of (e.getCoalescedEvents?.() || [e])) point(ev); });
  const end = e => { if (!cur || e.pointerId !== cur.pid) return; flush(); cur = null; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
  $('.sk-clear').addEventListener('click', () => { if (!canDraw()) return; flush(); strokes = []; total = 0; cur = null; bufFor = -1; $('.sk-full').classList.remove('on'); ctx.send('clear'); repaint(); ctx.sfx('tap'); });
  $('.sk-done').addEventListener('click', () => { if (!canDraw()) return; flush(); done = true; ctx.send('done', true); ctx.sfx('good'); paintDraw(); });
  function paintDraw() { $('.sk-done').textContent = done ? 'Done! Waiting…' : "I'm done!"; $('.sk-done').disabled = done; ui.classList.toggle('drawn', done); }

  // ---- reveal + gallery
  const cell = (p, ink, pct, big) => `<figure class="sk-copy${big ? ' big' : ''}" style="--seat:${p.color}">${inkSvg(ink)}<figcaption><i class="face">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i><b>${p.pid === me ? 'You' : esc(p.name)}</b><em>${pct}%</em></figcaption></figure>`;
  const rowHtml = (r, i) => `<div class="sk-row"><figure class="sk-copy orig">${svgOf(list[r.shape].k, 'orig')}<figcaption><b>${i == null ? 'The doodle' : `${i + 1}. ${esc(list[r.shape].name)}`}</b></figcaption></figure>${players.map(p => cell(p, r.ink[p.pid], r.pct[p.pid] ?? 0)).join('')}</div>`;
  function paintReveal(r) { $('.sk-rows').innerHTML = `<p class="sk-say">It was ${esc(list[r.shape].name)}!</p>` + rowHtml(r); }
  function paintGallery() { $('.sk-rows').innerHTML = `<p class="sk-say">The gallery</p>` + art.map((r, i) => rowHtml(r, i)).join(''); }
  function note(g) {
    if (g.phase === 'count') return 'Get ready to remember a doodle!';
    if (g.phase === 'show') return 'Look closely: it goes away in a moment!';
    if (g.phase === 'draw') return watching ? `${g.done.length} of ${players.length} done` : done ? 'Waiting for the others…' : 'Draw it as big as you like: only the shape counts.';
    if (g.phase === 'reveal') { const best = Math.max(...Object.values(g.r?.pct || { x: 0 })), who = players.filter(p => g.r?.pct[p.pid] === best && best > 0).map(p => p.pid === me ? 'You' : p.name); return init.solo ? `${g.r?.pct[players[0].pid] ?? 0}% match: +${g.r?.pts[players[0].pid] ?? 0} points` : who.length ? `Closest copy: ${who.join(' and ')} (${best}%)` : 'Nobody drew anything!'; }
    if (init.solo) { const s = g.sc[players[0].pid], m = init.medals.filter(v => s >= v).length; return `${s} of 30 — ${['no medal', 'bronze!', 'silver!', 'GOLD!'][m]} (medals at ${init.medals.join(' / ')})`; }
    return 'Most points wins. Some of these are… interesting.';
  }

  return {
    priv(d) { if (Array.isArray(d.ink) && d.ink.length && !strokes.length && phase === 'draw') { strokes = d.ink.slice(); total = strokes.reduce((a, s) => a + s.length / 4, 0); repaint(); } if (d.done !== undefined && phase === 'draw') { done = d.done; paintDraw(); } },
    state(g) {
      if (g.phase !== phase || g.round !== round) {
        if (g.phase === 'show') { $('.sk-card').innerHTML = svgOf(list[g.shape].k, 'orig'); showFor = init.show; showUntil = performance.now() / 1000 + Math.max(0.3, g.left - 0.0); ctx.sfx('open'); }
        if (g.phase === 'draw') { strokes = []; total = 0; done = false; cur = null; bufFor = -1; $('.sk-full').classList.remove('on'); repaint(); paintDraw(); ctx.sfx('tap'); }
        if (g.phase === 'reveal' && g.r) { const r = art[g.round] || { shape: g.shape, ink: {}, pct: g.r.pct }; paintReveal(r); if (me != null) ctx.sfx((g.r.pts[me] ?? 0) >= 7 ? 'win' : (g.r.pts[me] ?? 0) >= 4 ? 'good' : 'bad'); }
        if (g.phase === 'gallery') { paintGallery(); ctx.sfx('win'); }
        phase = g.phase; round = g.round;
      }
      ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.sk-round').textContent = g.phase === 'gallery' ? 'Gallery' : g.round >= 0 ? `Doodle ${g.round + 1}/${init.rounds}` : 'Get ready';
      for (const p of players) ui.querySelector(`.sk-players [data-pid="${p.pid}"] .sc`).textContent = g.sc[p.pid];
      if (g.phase === 'draw') for (const p of players) { const c = ui.querySelector(`.sk-artists [data-pid="${p.pid}"]`); const d = g.done.includes(p.pid); c.classList.toggle('in', d); c.querySelector('.st').textContent = d ? 'done!' : 'drawing'; }
      $('.sk-note').textContent = note(g);
    },
    event(ev) {
      if (ev.e === 'art') { art[ev.round] = { shape: ev.shape, ink: ev.ink, pct: ev.pct, pts: ev.pts }; if (phase === 'reveal' && round === ev.round) paintReveal(art[ev.round]); }
    },
    frame() { if (phase === 'show') { const u = Math.max(0, Math.min(1, (showUntil - performance.now() / 1000) / showFor)); $('.sk-bar i').style.transform = `scaleX(${u.toFixed(3)})`; } },
    dispose() { ro.disconnect(); },
  };
}
