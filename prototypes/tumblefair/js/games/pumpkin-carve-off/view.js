// PUMPKIN CARVE-OFF on a screen. A phone that plays gets its secret prompt, a big orange pumpkin to carve with a
// finger (every cut shows as a dark hole with the candle glowing inside), two tools (thin knife, big scoop), Undo,
// Clear and Done. A watch-only screen shows a row of uncarved pumpkins, one per carver, that wobble as they carve.
// Then the lanterns light up in a row at night: phones tap one to vote, and the reveal shows each carver, their
// prompt, and the faces of who voted for them.
import { esc, chip } from '../../client/gamehud.js';

const hex2 = v => v.toString(16).padStart(2, '0');
const RULE_TEXT = { ink: 'the most pumpkin carved', cuts: 'the most separate cuts', even: 'the most even face (left matches right)' };

/** Draw a pumpkin with its carving on a 2D context `size` px square. `night`: the lantern look (dark rind, bright glow). */
export function paintPumpkin(g, cuts, size, tools, face, { night = false } = {}) {
  const k = size / 256;
  g.clearRect(0, 0, size, size);
  g.save(); g.scale(k, k);
  // the glow on the ground and round the lantern at night
  if (night && cuts.length) {
    const halo = g.createRadialGradient(128, 150, 40, 128, 150, 128);
    halo.addColorStop(0, 'rgba(255,170,40,.35)'); halo.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
  }
  // body: five overlapping lobes, the middle one in front
  const rind = night ? ['#9a3d08', '#b84d0c', '#6e2a05'] : ['#ff8f1f', '#ffa53d', '#d9600b'];
  const lobes = [[-58, 50], [58, 50], [-30, 66], [30, 66], [0, 78]];        // [offset from the middle, half-width]
  for (const [dx, rx] of lobes) {
    const gr = g.createRadialGradient(128 + dx * 0.9 - 14, 112, 10, 128 + dx * 0.9, 142, 110);
    gr.addColorStop(0, rind[1]); gr.addColorStop(0.65, rind[0]); gr.addColorStop(1, rind[2]);
    g.fillStyle = gr; g.strokeStyle = night ? '#3a1602' : '#8a3a06'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(128 + dx, 146, rx, 100, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  // stem and a curly vine
  g.fillStyle = night ? '#2f3b16' : '#4f7a22'; g.strokeStyle = '#1e2a0c'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(118, 44); g.quadraticCurveTo(114, 22, 126, 10); g.lineTo(142, 14); g.quadraticCurveTo(134, 26, 138, 46); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = night ? '#3c5a1a' : '#6aa22e'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(140, 30); g.bezierCurveTo(160, 18, 176, 34, 164, 42); g.bezierCurveTo(156, 48, 152, 38, 160, 36); g.stroke();
  // the carving: rind wall (dark), then candle glow, then the bright core — each pass over every cut so crossings merge
  if (cuts.length) {
    g.save();
    g.beginPath(); g.ellipse(face.cx, face.cy, face.rx, face.ry, 0, 0, Math.PI * 2); g.clip();
    g.lineCap = 'round'; g.lineJoin = 'round';
    const pass = (extra, color, blur = 0) => {
      g.strokeStyle = g.fillStyle = color; g.shadowColor = night ? 'rgba(255,190,60,.9)' : 'transparent'; g.shadowBlur = blur * k;
      for (const [w, p] of cuts) {
        const n = p.length / 4; if (!n) continue;
        const X = i => parseInt(p.substr(i * 4, 2), 16) + 0.5, Y = i => parseInt(p.substr(i * 4 + 2, 2), 16) + 0.5, lw = Math.max(1, tools[w] + extra);
        if (n === 1) { g.beginPath(); g.arc(X(0), Y(0), lw / 2, 0, Math.PI * 2); g.fill(); continue; }
        g.lineWidth = lw; g.beginPath(); g.moveTo(X(0), Y(0)); for (let i = 1; i < n; i++) g.lineTo(X(i), Y(i)); g.stroke();
      }
    };
    pass(5, night ? '#2a0f00' : '#3a1500');
    pass(0, night ? '#ffb32a' : '#ff9d1a', night ? 18 : 0);
    pass(-3, night ? '#fff2a8' : '#ffd23f');
    g.restore();
  }
  g.restore();
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, tools = init.tools, face = init.face;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const watching = me == null;
  ui.innerHTML = `
    <div class="pc-sky" aria-hidden="true"><i class="pc-moon"></i><i class="pc-bat b1"></i><i class="pc-bat b2"></i></div>
    <div class="pc-top"><span class="pc-title">Pumpkin Carve-Off</span><span class="clock"><b>--</b></span></div>
    <section class="pc-carve">
      <p class="pc-prompt"><small>Carve this (secret!):</small> <b></b></p>
      <div class="pc-pad"><canvas></canvas><i class="pc-full">Pumpkin full!</i></div>
      <div class="pc-tools">
        <div class="pc-row">${tools.map((w, i) => `<button class="pc-tool" data-w="${i}" aria-label="${i ? 'Big scoop' : 'Thin knife'}"><i style="--w:${i ? 22 : 8}px"></i>${i ? 'Big scoop' : 'Thin knife'}</button>`).join('')}</div>
        <div class="pc-row"><button class="pc-undo" data-do="undo">Undo</button><button class="pc-clear" data-do="clear">Clear</button></div>
        <button class="pc-done big-btn" data-do="done">My lantern is done!</button>
      </div>
    </section>
    <section class="pc-wait"><p class="shout">Phones out! Everyone is carving…</p>
      <div class="pc-patch">${players.map(p => `<div class="pc-blank" data-pid="${p.pid}"><canvas width="220" height="220"></canvas>${chip(p, '<em class="st">thinking…</em>')}</div>`).join('')}</div></section>
    <section class="pc-gallery"></section>
    <p class="pc-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'carve';
  const pad = $('.pc-pad canvas'), pg = pad.getContext('2d');
  let phase = 'carve', width = 0, cuts = [], cur = null, sid = 0, buf = '', bufFor = null, since = 0, total = 0, full = false;
  let mine = null, myVote = null, done = false, gallery = null, cards = [], tm = 0, dirty = true;
  // the watch screen's blank pumpkins
  for (const c of ui.querySelectorAll('.pc-blank canvas')) paintPumpkin(c.getContext('2d'), [], 220, tools, face);

  // ---- carving ----
  const size = () => pad.width;
  function fit() {
    const r = pad.getBoundingClientRect(), px = Math.max(64, Math.round(r.width * Math.min(2, devicePixelRatio || 1)));
    if (pad.width !== px) { pad.width = pad.height = px; dirty = true; }
  }
  const ro = new ResizeObserver(fit); ro.observe(pad);
  function flush() {
    if (!buf || bufFor == null) return;
    ctx.send('cut', { s: bufFor.id, w: bufFor.w, p: buf }); buf = ''; since = 0;
  }
  function point(e) {
    const r = pad.getBoundingClientRect();
    const x = Math.max(0, Math.min(255, Math.floor((e.clientX - r.left) / r.width * 256))), y = Math.max(0, Math.min(255, Math.floor((e.clientY - r.top) / r.height * 256)));
    const s = cur.s, p = s[1], n = p.length / 4;
    if (n) { const lx = parseInt(p.substr(-4, 2), 16), ly = parseInt(p.substr(-2), 16); if (Math.abs(lx - x) + Math.abs(ly - y) < 2) return; }
    if (total >= init.maxPoints) { setFull(true); return; }
    const h = hex2(x) + hex2(y); s[1] += h; buf += h; total++; dirty = true;
    if (buf.length / 4 >= init.maxChunk) flush();
  }
  const canCarve = () => !watching && phase === 'carve' && !done;
  pad.addEventListener('pointerdown', e => {
    if (!canCarve() || cur) return;
    if (cuts.length >= init.maxCuts || total >= init.maxPoints) { setFull(true); return; }
    e.preventDefault(); pad.setPointerCapture?.(e.pointerId);
    const s = [width, '']; cuts.push(s); cur = { s, id: ++sid, pid: e.pointerId };
    flush(); bufFor = { id: cur.id, w: width };
    point(e);
  });
  pad.addEventListener('pointermove', e => { if (!cur || e.pointerId !== cur.pid) return; for (const ev of (e.getCoalescedEvents?.() || [e])) point(ev); });
  const end = e => { if (!cur || e.pointerId !== cur.pid) return; flush(); if (!cur.s[1]) cuts.pop(); else ctx.sfx('tap'); cur = null; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end); pad.addEventListener('lostpointercapture', end);
  function setFull(on) { if (full === on) return; full = on; $('.pc-full').classList.toggle('on', on); }
  function recount() { total = cuts.reduce((n, s) => n + s[1].length / 4, 0); setFull(total >= init.maxPoints); dirty = true; }
  function paintTools() {
    ui.querySelectorAll('.pc-tool').forEach(b => b.classList.toggle('on', +b.dataset.w === width));
    const d = $('.pc-done'); d.classList.toggle('on', done); d.textContent = done ? 'Done! (tap to carve more)' : 'My lantern is done!';
    ui.classList.toggle('is-done', done);
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'carve') {
      if (t.dataset.w != null) { width = +t.dataset.w; ctx.sfx('tap'); }
      else if (t.dataset.do === 'undo' && !cur && cuts.length && !done) { cuts.pop(); ctx.send('undo'); recount(); ctx.sfx('tap'); }
      else if (t.dataset.do === 'clear' && !cur && cuts.length && !done) { cuts = []; ctx.send('clear'); recount(); ctx.sfx('bad'); }
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

  // ---- the lantern row ----
  function buildGallery(art) {
    gallery = art;
    const el = $('.pc-gallery');
    const both = !init.solo && players.length === 2 && !watching;
    el.innerHTML = `<p class="pc-ghead"></p><div class="pc-cards n${art.length}">${art.map((a, i) => `
      <button class="pc-card${a.k.length ? '' : ' blank'}" data-vote="${i}" aria-label="Lantern ${i + 1}">
        <span class="pc-frame"><canvas width="320" height="320"></canvas>${a.k.length ? '<i class="pc-flicker"></i>' : '<i class="pc-empty">Not carved!</i>'}<i class="pc-ribbon">Night Judge's ribbon</i><b class="pc-num">${i + 1}</b></span>
        <span class="pc-pr"></span><span class="pc-by"></span><span class="pc-vt"></span><strong class="pc-pts"></strong>
      </button>`).join('')}</div>${both ? '<button class="pc-both big-btn" data-vote="both">Both are great!</button>' : ''}`;
    cards = [...el.querySelectorAll('.pc-card')].map((c, i) => ({ el: c, g: c.querySelector('canvas').getContext('2d'), k: art[i].k }));
    paintVotes(); lightUp();
  }
  function lightUp() { for (const c of cards) paintPumpkin(c.g, c.k, 320, tools, face, { night: true }); }   // painted once; the candle flicker is a CSS glow over it
  function paintVotes() {
    cards.forEach((c, i) => { c.el.classList.toggle('mine', i === mine); c.el.classList.toggle('picked', myVote === i || myVote === 'both'); });
    $('.pc-both')?.classList.toggle('picked', myVote === 'both');
  }
  const facePic = p => `<i class="vface" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function paintReveal(r, scores) {
    cards.forEach((c, i) => {
      const pid = r.who[i], p = byPid.get(pid); if (!p) return;
      c.el.querySelector('.pc-pr').textContent = r.prompts[i];
      c.el.querySelector('.pc-by').innerHTML = chip(p, pid === me ? '<em class="you">you</em>' : '');
      const voters = Object.entries(r.votes).filter(([, v]) => v === i || v === 'both').map(([q]) => byPid.get(+q)).filter(Boolean);
      c.el.querySelector('.pc-vt').innerHTML = voters.length ? voters.map(facePic).join('') : (init.solo ? '' : '<em>no votes</em>');
      c.el.classList.toggle('ribbon', r.ribbon.includes(pid));
      c.el.querySelector('.pc-pts').textContent = scores ? (init.solo ? `${scores[pid]}/10` : `+${scores[pid]}`) : '';
    });
  }
  function note(g) {
    if (g.phase === 'carve') return watching ? 'The lanterns light up when the clock runs out.' : done ? 'Waiting for the other carvers…' : full ? 'Your pumpkin is full: tap Done.' : 'Draw on the pumpkin to carve it. Keep your prompt secret!';
    const rule = `Night Judge's ribbon (+1): ${RULE_TEXT[g.judge]}.`;
    if (g.phase === 'vote') return watching ? `Vote on your phones for the best lantern! ${rule}` : myVote == null ? `Tap the best lantern (not your own). ${rule}` : `Vote in. You can still change it. ${rule}`;
    if (init.solo) { const s = g.scores ? Object.values(g.scores)[0] : 0, st = g.reveal?.stats?.[me]; return s ? `The Night Judge gives your lantern ${s} out of 10${st ? ` (${st.ink} bits carved, ${st.even}% even)` : ''}.` : 'Practice round: carve a face next time for points.'; }
    return `1 point for each vote. ${rule}`;
  }

  return {
    priv(d) {
      if (d.cuts && !cuts.length && phase === 'carve' && !cur) { cuts = d.cuts.map(s => s.slice()); sid = Math.max(sid, d.sid ?? 0); recount(); }   // back after a drop: your carving so far
      $('.pc-prompt b').textContent = d.prompt || '';
      mine = d.mine; myVote = d.vote;
      if (d.done !== done) { done = d.done; paintTools(); }
      if (gallery) paintVotes();
    },
    event(ev) { if (ev.e === 'art') { buildGallery(ev.art); ctx.sfx('pick'); } },
    state(g) {
      if (g.phase !== phase && g.phase === 'reveal') ctx.sfx('win');
      if (g.phase !== 'carve' && phase === 'carve' && cur) { flush(); cur = null; }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.phase !== 'carve' && !gallery && init.art) buildGallery(init.art);
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'carve' && g.left <= 10);
      $('.pc-title').textContent = g.phase === 'carve' ? 'Pumpkin Carve-Off' : g.phase === 'vote' ? 'Vote for the best lantern!' : init.solo ? 'Your lantern' : 'The votes are in!';
      if (g.phase === 'carve') for (const p of players) {
        const r = ui.querySelector(`.pc-blank[data-pid="${p.pid}"]`); if (!r) continue;
        const isDone = g.done.includes(p.pid), n = g.n[p.pid] || 0;
        if (+r.dataset.n !== n && n > 0) { r.classList.remove('wob'); void r.offsetWidth; r.classList.add('wob'); }
        r.dataset.n = n; r.classList.toggle('in', isDone);
        r.querySelector('.st').textContent = isDone ? 'done!' : n ? `${n} cut${n > 1 ? 's' : ''}` : 'thinking…';
      }
      if (gallery) {
        const head = $('.pc-ghead');
        if (head) head.textContent = g.phase === 'vote' ? (watching ? `${g.voted.length} of ${players.length} have voted` : '') : '';
        if (g.reveal) paintReveal(g.reveal, g.scores);
      }
      $('.pc-note').textContent = note(g);
    },
    frame(dt) {
      tm += dt;
      if (cur && buf) { since += dt; if (since > 0.12) flush(); }
      if (phase === 'carve' && dirty && pad.width) { dirty = false; paintPumpkin(pg, cuts, size(), tools, face); }
    },
    dispose() { ro.disconnect(); },
  };
}
