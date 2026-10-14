// DRAW THE DISASTER on a screen. A phone that plays gets its private prompt, a square canvas and a tool row (colours,
// two brushes, undo, clear, done); a watch-only screen shows who is drawing. Then everyone sees the gallery: phones tap
// a picture to vote, and the reveal puts each artist's portrait under their picture with the faces of who voted for it.
import { esc, chip } from '../../client/gamehud.js';

/** Paint a stroke list ([colour, brush, "xxyy…"]) onto a 2D context `size` pixels square. */
export function paint(g, strokes, size, colors, widths) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  const k = size / 256;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [c, w, p] of strokes) {
    const n = p.length / 4; if (!n) continue;
    g.strokeStyle = g.fillStyle = colors[c].hex; g.lineWidth = widths[w] * k;
    const X = i => (parseInt(p.substr(i * 4, 2), 16) + 0.5) * k, Y = i => (parseInt(p.substr(i * 4 + 2, 2), 16) + 0.5) * k;
    if (n === 1) { g.beginPath(); g.arc(X(0), Y(0), widths[w] * k / 2, 0, Math.PI * 2); g.fill(); continue; }
    g.beginPath(); g.moveTo(X(0), Y(0)); for (let i = 1; i < n; i++) g.lineTo(X(i), Y(i)); g.stroke();
  }
}
const hex2 = v => v.toString(16).padStart(2, '0');
const RULE_TEXT = { colours: 'most colours used', ink: 'most ink on the page', strokes: 'most brush strokes' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, colors = init.colors, widths = init.widths;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const watching = me == null;
  ui.innerHTML = `
    <div class="dd-top"><span class="dd-title">Draw the Disaster</span><span class="clock"><b>--</b></span></div>
    <section class="dd-draw">
      <p class="dd-prompt"><small>Draw this:</small> <b></b></p>
      <div class="dd-pad"><canvas></canvas><i class="dd-full">Page full!</i></div>
      <div class="dd-tools">
        <div class="dd-swatches">${colors.map((c, i) => `<button class="dd-sw${i === init.eraser ? ' rubber' : ''}" data-c="${i}" style="--c:${c.hex}" aria-label="${esc(c.name)}" title="${esc(c.name)}"><i></i></button>`).join('')}</div>
        <div class="dd-brushes">${widths.map((w, i) => `<button class="dd-br" data-w="${i}" aria-label="${i ? 'Thick' : 'Thin'} brush"><i style="--w:${Math.round(6 + i * 12)}px"></i>${i ? 'Thick' : 'Thin'}</button>`).join('')}
          <button class="dd-undo" data-do="undo">Undo</button><button class="dd-clear" data-do="clear">Clear</button></div>
        <button class="dd-done big-btn" data-do="done">I'm done!</button>
      </div>
    </section>
    <section class="dd-wait"><p class="shout">Phones out! Everyone is drawing…</p><div class="dd-artists">${players.map(p => chip(p, '<em class="st">drawing</em>')).join('')}</div></section>
    <section class="dd-gallery"></section>
    <p class="dd-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'draw';
  const pad = $('.dd-pad canvas'), pg = pad.getContext('2d');
  let phase = 'draw', color = 0, width = 0, strokes = [], cur = null, sid = 0, buf = '', bufFor = null, since = 0, total = 0, full = false;
  let mine = null, myVote = null, done = false, gallery = null, cards = [], last = null;

  // ---- drawing ----
  const size = () => pad.width;
  function fit() {
    const r = pad.getBoundingClientRect(), px = Math.max(64, Math.round(r.width * Math.min(2, devicePixelRatio || 1)));
    if (pad.width !== px) { pad.width = pad.height = px; paint(pg, strokes, px, colors, widths); }
  }
  const ro = new ResizeObserver(fit); ro.observe(pad);
  function flush() {
    if (!buf || bufFor == null) return;
    ctx.send('ink', { s: bufFor.id, c: bufFor.c, w: bufFor.w, p: buf }); buf = ''; since = 0;
  }
  function point(e) {
    const r = pad.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.floor((e.clientX - r.left) / r.width * 256))), y = Math.max(0, Math.min(255, Math.floor((e.clientY - r.top) / r.height * 256)));
    const s = cur.s, p = s[2], n = p.length / 4;
    if (n) { const lx = parseInt(p.substr(-4, 2), 16), ly = parseInt(p.substr(-2), 16); if (Math.abs(lx - x) + Math.abs(ly - y) < 2) return; }
    if (total >= init.maxPoints) { setFull(true); return; }
    const h = hex2(x) + hex2(y); s[2] += h; buf += h; total++;
    const k = size() / 256; pg.strokeStyle = pg.fillStyle = colors[s[0]].hex; pg.lineWidth = widths[s[1]] * k; pg.lineCap = 'round';
    if (!n) { pg.beginPath(); pg.arc((x + .5) * k, (y + .5) * k, widths[s[1]] * k / 2, 0, Math.PI * 2); pg.fill(); }
    else { pg.beginPath(); pg.moveTo((parseInt(p.substr(-4, 2), 16) + .5) * k, (parseInt(p.substr(-2), 16) + .5) * k); pg.lineTo((x + .5) * k, (y + .5) * k); pg.stroke(); }
    if (buf.length / 4 >= init.maxChunk) flush();
  }
  const canDraw = () => !watching && phase === 'draw' && !done;
  pad.addEventListener('pointerdown', e => {
    if (!canDraw() || cur) return;
    if (strokes.length >= init.maxStrokes || total >= init.maxPoints) { setFull(true); return; }
    e.preventDefault(); pad.setPointerCapture?.(e.pointerId);
    const s = [color, width, '']; strokes.push(s); cur = { s, id: ++sid, pid: e.pointerId };
    flush(); bufFor = { id: cur.id, c: color, w: width };
    point(e);
  });
  pad.addEventListener('pointermove', e => { if (!cur || e.pointerId !== cur.pid) return; for (const ev of (e.getCoalescedEvents?.() || [e])) point(ev); });
  const end = e => { if (!cur || e.pointerId !== cur.pid) return; flush(); if (!cur.s[2]) strokes.pop(); cur = null; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
  function setFull(on) { if (full === on) return; full = on; $('.dd-full').classList.toggle('on', on); }
  function redraw() { total = strokes.reduce((n, s) => n + s[2].length / 4, 0); setFull(total >= init.maxPoints); paint(pg, strokes, size(), colors, widths); }
  function paintTools() {
    ui.querySelectorAll('.dd-sw').forEach(b => b.classList.toggle('on', +b.dataset.c === color));
    ui.querySelectorAll('.dd-br').forEach(b => b.classList.toggle('on', +b.dataset.w === width));
    const d = $('.dd-done'); d.classList.toggle('on', done); d.textContent = done ? 'Done! (tap to keep drawing)' : "I'm done!";
    ui.classList.toggle('is-done', done);
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'draw') {
      if (t.dataset.c != null) { color = +t.dataset.c; ctx.sfx('tap'); }
      else if (t.dataset.w != null) { width = +t.dataset.w; ctx.sfx('tap'); }
      else if (t.dataset.do === 'undo' && !cur && strokes.length && !done) { strokes.pop(); ctx.send('undo'); redraw(); ctx.sfx('tap'); }
      else if (t.dataset.do === 'clear' && !cur && strokes.length && !done) { strokes = []; ctx.send('clear'); redraw(); ctx.sfx('bad'); }
      else if (t.dataset.do === 'done') { done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); }
      paintTools(); return;
    }
    if (phase === 'vote') {
      if (t.dataset.vote == null) return;
      const v = t.dataset.vote === 'both' ? 'both' : +t.dataset.vote;
      if (v !== 'both' && (v === mine || !gallery[v].k.length)) return;
      myVote = v; ctx.send('vote', v); ctx.sfx('pick'); paintVotes();
    }
  });
  paintTools();

  // ---- gallery ----
  function buildGallery(art) {
    gallery = art;
    const el = $('.dd-gallery');
    const both = !init.solo && players.length === 2 && !watching;
    el.innerHTML = `<p class="dd-ghead"></p><div class="dd-cards n${art.length}">${art.map((a, i) => `
      <button class="dd-card${a.k.length ? '' : ' blank'}" data-vote="${i}">
        <span class="dd-frame"><canvas width="384" height="384"></canvas>${a.k.length ? '' : '<i class="dd-empty">Nothing drawn!</i>'}<i class="dd-ribbon">Judge's ribbon</i></span>
        <span class="dd-pr">${esc(a.prompt)}</span>
        <span class="dd-by"></span><span class="dd-vt"></span><strong class="dd-pts"></strong>
      </button>`).join('')}</div>${both ? '<button class="dd-both big-btn" data-vote="both">Both are great!</button>' : ''}`;
    cards = [...el.querySelectorAll('.dd-card')];
    cards.forEach((c, i) => paint(c.querySelector('canvas').getContext('2d'), art[i].k, 384, colors, widths));
    paintVotes();
  }
  function paintVotes() {
    cards.forEach((c, i) => { c.classList.toggle('mine', i === mine); c.classList.toggle('picked', myVote === i || myVote === 'both'); });
    $('.dd-both')?.classList.toggle('picked', myVote === 'both');
  }
  const face = p => `<i class="vface" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function paintReveal(r, scores) {
    cards.forEach((c, i) => {
      const pid = r.who[i], p = byPid.get(pid); if (!p) return;
      c.querySelector('.dd-by').innerHTML = chip(p, pid === me ? '<em class="you">you</em>' : '');
      const voters = Object.entries(r.votes).filter(([, v]) => v === i || v === 'both').map(([q]) => byPid.get(+q)).filter(Boolean);
      c.querySelector('.dd-vt').innerHTML = voters.length ? voters.map(face).join('') : (init.solo ? '' : '<em>no votes</em>');
      c.classList.toggle('ribbon', r.ribbon.includes(pid));
      c.querySelector('.dd-pts').textContent = scores ? `+${scores[pid]}` : '';
    });
  }

  function note(g) {
    if (g.phase === 'draw') return watching ? 'Pictures appear here when the clock runs out.' : done ? 'Waiting for the others…' : full ? 'Your page is full: tap Done.' : 'Draw with your finger. Only you can see your prompt.';
    const rule = `Judge's ribbon (+1 point): ${RULE_TEXT[g.judge]}.`;
    if (g.phase === 'vote') return watching ? `Vote on your phones! ${rule}` : myVote == null ? `Tap your favourite (not your own). ${rule}` : `Vote in. You can still change it. ${rule}`;
    if (init.solo) return g.scores && Object.values(g.scores)[0] ? 'Practice round: nice picture! 1 point for drawing.' : 'Practice round: draw something next time for a point.';
    return `1 point for each vote. ${rule}`;
  }

  return {
    priv(d) {
      $('.dd-prompt b').textContent = d.prompt || '';
      mine = d.mine; myVote = d.vote;
      if (d.done !== done) { done = d.done; paintTools(); }
      if (gallery) paintVotes();
    },
    event(ev) { if (ev.e === 'art') { buildGallery(ev.art); ctx.sfx('pick'); } },
    state(g) {
      last = g;
      if (g.phase !== phase && g.phase === 'reveal') ctx.sfx('win');
      if (g.phase !== 'draw' && phase === 'draw' && cur) { flush(); cur = null; }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.phase !== 'draw' && !gallery && init.art) buildGallery(init.art);
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'draw' && g.left <= 10);
      $('.dd-title').textContent = g.phase === 'draw' ? 'Draw the Disaster' : g.phase === 'vote' ? 'Vote for the best picture!' : init.solo ? 'Your masterpiece' : 'The votes are in!';
      if (g.phase === 'draw') for (const p of players) {
        const r = ui.querySelector(`.dd-artists [data-pid="${p.pid}"]`); if (!r) continue;
        const isDone = g.done.includes(p.pid); r.classList.toggle('in', isDone);
        r.querySelector('.st').textContent = isDone ? 'done!' : g.n[p.pid] ? `${g.n[p.pid]} stroke${g.n[p.pid] > 1 ? 's' : ''}` : 'thinking…';
      }
      if (gallery) {
        const head = $('.dd-ghead');
        if (head) head.textContent = g.phase === 'vote' ? (watching ? `${g.voted.length} of ${players.length} have voted` : '') : '';
        if (g.reveal) paintReveal(g.reveal, g.scores);
      }
      $('.dd-note').textContent = note(g);
    },
    frame(dt) { if (cur && buf) { since += dt; if (since > 0.12) flush(); } },
    dispose() { ro.disconnect(); },
  };
}
