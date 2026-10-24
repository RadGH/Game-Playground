// TOWER PULL on a screen: one 2D canvas — a fairground table under a striped awning and the wooden tower on it, three
// blocks to a layer, the layers drawn alternately as block ENDS (with growth rings) and block SIDES (long grain), so
// the criss-cross reads. Missing blocks are dark holes. The tower sways with the shared WOBBLE (and jolts on every
// pull); when it falls, every block tumbles off the table. The player on turn sees a big "YOUR TURN" prompt, the
// blocks they may pull glow when tapped (a tap snaps to the nearest block that may be pulled), and a PULL panel with
// the sliding marker and its green zone (narrower for a riskier block) and a turn timer. Arrow keys pick a block too,
// Space grabs / pulls. Halloween: bone-white and pumpkin-orange blocks on a night table, cobwebs and a bat.
import { chip, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock, pingPong } from '../toss-kit.js';
import { canPull, riskOf, zoneOf } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const name = pid => (pid === me ? 'You' : byPid.get(pid)?.name || '?');
  ui.innerHTML = `
    <div class="tp-top"><span class="tp-title">${HW ? 'Bone Tower' : 'Tower Pull'}</span><span class="clock"><b>--</b></span></div>
    <div class="tp-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="tp-who"></div>
    <div class="tp-stall"><canvas></canvas><div class="tp-wob"><span>Wobble</span><div class="tp-wtrack"><i></i></div></div><div class="tp-count"></div><div class="tp-say"></div></div>
    <div class="tp-panel${watching ? ' hidden' : ''}" data-mode="wait">
      <div class="tp-row"><b class="tp-hint">Wait for your turn</b><span class="tp-tl"></span></div>
      <div class="tp-meter"><i class="tp-zone"></i><i class="tp-mark"></i></div>
      <button class="tp-btn big-btn" disabled>PULL!</button>
    </div>
    <p class="tp-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'count';
  if (me != null) ui.querySelector(`.tp-board [data-pid="${me}"]`)?.classList.add('me');
  const canvas = $('canvas'), g = canvas.getContext('2d'), btn = $('.tp-btn'), panel = $('.tp-panel');
  const tunes = createTunes({ volume: 0.18 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS, init.play + 20);

  let gs0 = null, phase = 'count', tower = [], who = null, pick = null, myPick = null, cursor = null, wob = 0, jolt = 0, sayT = 0, falling = null, lastK = -1;
  const myTurn = () => !watching && phase === 'turn' && who === me;
  const parse = s => (s || '').split('').map(Number);
  const legalList = () => { const out = []; for (let lv = 0; lv < tower.length; lv++) for (let s = 0; s < 3; s++) if (canPull(tower, lv, s)) out.push([lv, s]); return out; };
  function doPick(lv, s) {
    if (!myTurn() || !canPull(tower, lv, s)) return;
    const t = Math.round(clock.t() * 1000) / 1000; myPick = [lv, s, t]; cursor = [lv, s];
    ctx.send('pick', { lv, s, t }); ctx.sfx('pick'); setPanel();
  }
  function doPull() {
    if (!myTurn() || !myPick) return;
    ctx.send('pull', { t: Math.round(clock.t() * 1000) / 1000 }); ctx.sfx('tap'); myPick = null; setPanel(true);
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); doPull(); });
  canvas.addEventListener('pointerdown', e => {
    if (!myTurn()) return; e.preventDefault();
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, v = geom();
    let best = null, bd = Infinity;
    for (const [lv, s] of legalList()) { const c = cellXY(v, lv, s); const d = Math.hypot(c.x + v.bw / 2 - x, (c.y + v.bh / 2 - y) * 1.6); if (d < bd) { bd = d; best = [lv, s]; } }
    if (best && bd < v.bw * 2.2) doPick(best[0], best[1]);
  });
  const onKey = e => {
    if (!myTurn() || e.repeat || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    const list = legalList(); if (!list.length) return;
    let i = cursor ? list.findIndex(c => c[0] === cursor[0] && c[1] === cursor[1]) : -1;
    if (['ArrowLeft', 'ArrowDown', 'KeyA', 'KeyS'].includes(e.code)) { e.preventDefault(); i = (i <= 0 ? list.length : i) - 1; cursor = list[i]; }
    else if (['ArrowRight', 'ArrowUp', 'KeyD', 'KeyW'].includes(e.code)) { e.preventDefault(); i = (i + 1) % list.length; cursor = list[i]; }
    else if (['Space', 'Enter'].includes(e.code)) { e.preventDefault(); if (myPick && cursor && myPick[0] === cursor[0] && myPick[1] === cursor[1]) doPull(); else { const c = cursor || list[0]; doPick(c[0], c[1]); } }
  };
  addEventListener('keydown', onKey);
  function setPanel(sent = false) {
    const mine = myTurn();
    panel.dataset.mode = !mine ? 'wait' : myPick ? 'pull' : sent ? 'sent' : 'pick';
    $('.tp-hint').textContent = !mine ? (phase === 'turn' ? `${name(who)} is pulling…` : phase === 'fall' ? 'CRASH!' : 'Get ready…') : myPick ? 'Tap PULL in the green!' : 'Tap a block to grab it';
    btn.disabled = !(mine && myPick);
    if (mine && myPick) { const z = zoneOf(riskOf(tower, myPick[0], myPick[1]), L); const el = $('.tp-zone'); el.style.left = `${(0.5 - z) * 100}%`; el.style.width = `${z * 200}%`; }
  }

  // ---- drawing
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const C = HW ? { sky: ['#2a1d4a', '#140f26'], table: '#3a2466', tableTop: '#5a3a8a', wood: ['#efe6d2', '#ff9a3a'], grain: 'rgba(80,40,10,.35)', hole: '#0b0716', line: '#140a1f' }
    : { sky: ['#bfe8ff', '#ffe7b8'], table: '#a4592a', tableTop: '#c97a3e', wood: ['#e9c48a', '#dcae6c'], grain: 'rgba(120,70,20,.35)', hole: '#3b2412', line: '#4a2a10' };
  /** Block size and where the tower stands: fits about 22 layers in the canvas. */
  function geom() { const rows = Math.max(16, tower.length + 3), bh = Math.min(30, (H - 46) / rows), bw = Math.min(bh * 2.6, W * 0.2); return { bh, bw, cx: W / 2, base: H - 36 }; }
  const cellXY = (v, lv, s) => ({ x: v.cx - 1.5 * v.bw + s * v.bw, y: v.base - (lv + 1) * v.bh });
  function block(x, y, w, h, lv, s, hl) {
    const ends = lv % 2 === 0, col = C.wood[(lv + s) % 2];
    g.fillStyle = col; g.fillRect(x, y, w, h); g.strokeStyle = C.line; g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    g.strokeStyle = C.grain; g.lineWidth = 1;
    if (ends) { g.beginPath(); g.ellipse(x + w * 0.5, y + h * 0.55, w * 0.18, h * 0.22, 0, 0, Math.PI * 2); g.ellipse(x + w * 0.5, y + h * 0.55, w * 0.32, h * 0.36, 0, 0, Math.PI * 2); g.stroke(); }
    else { g.beginPath(); for (const k of [0.3, 0.55, 0.78]) { g.moveTo(x + 3, y + h * k); g.bezierCurveTo(x + w * 0.4, y + h * (k - 0.08), x + w * 0.6, y + h * (k + 0.08), x + w - 3, y + h * k); } g.stroke(); }
    if (hl) { g.strokeStyle = hl; g.lineWidth = 3.5; g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3); }
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, C.sky[0]); bg.addColorStop(1, C.sky[1]); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) { g.fillStyle = HW ? (i % 2 ? '#ff8a1a' : '#2a1d4a') : (i % 2 ? '#fff' : '#e8394a'); const x0 = i * W / 12; g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + W / 12, 0); g.lineTo(x0 + W / 12, 10); g.arc(x0 + W / 24, 10, W / 24, 0, Math.PI); g.closePath(); g.fill(); }
    if (HW) { g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; for (let a = 0; a <= 4; a++) { const an = a / 4 * Math.PI / 2; g.beginPath(); g.moveTo(W, 20); g.lineTo(W - Math.cos(an) * 80, 20 + Math.sin(an) * 80); g.stroke(); } for (let r = 20; r <= 76; r += 18) { g.beginPath(); for (let a = 0; a <= 4; a++) { const an = a / 4 * Math.PI / 2; const px = W - Math.cos(an) * r, py = 20 + Math.sin(an) * r; a ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke(); } }
    const v = geom();
    g.fillStyle = C.table; g.fillRect(v.cx - v.bw * 3.4, v.base, v.bw * 6.8, H - v.base); g.fillStyle = C.tableTop; g.fillRect(v.cx - v.bw * 3.6, v.base - 2, v.bw * 7.2, 9);
    if (falling) {
      const u = nowS() - falling.at;
      for (const b of falling.blocks) { const x = b.x + b.vx * u, y = b.y + b.vy * u + 600 * u * u * 0.5; g.save(); g.translate(x + v.bw / 2, y + v.bh / 2); g.rotate(b.spin * u); block(-v.bw / 2, -v.bh / 2, v.bw, v.bh, b.lv, b.s); g.restore(); }
      return;
    }
    // the sway: the shared wobble, a jolt after each pull, pivoting on the table
    const w = wob / 100, ang = (w * w * 0.07 + jolt * 0.05) * Math.sin(t * (5 + w * 4)) + w * w * w * 0.05;
    g.save(); g.translate(v.cx, v.base); g.rotate(ang); g.translate(-v.cx, -v.base);
    const mine = myTurn(), pk = mine ? myPick : pick;
    for (let lv = 0; lv < tower.length; lv++) for (let s = 0; s < 3; s++) {
      const c = cellXY(v, lv, s);
      if (!(tower[lv] & (1 << s))) { g.fillStyle = C.hole; g.globalAlpha = 0.55; g.fillRect(c.x + 3, c.y + 2, v.bw - 6, v.bh - 4); g.globalAlpha = 1; continue; }
      let hl = null, slide = 0;
      if (pk && pk[0] === lv && pk[1] === s) { hl = byPid.get(who)?.color || '#ffd23f'; slide = 0.18 * pingPong(clock.t() - pk[2], L.period) * v.bw; }
      else if (mine && cursor && cursor[0] === lv && cursor[1] === s) hl = 'rgba(255,255,255,.9)';
      else if (mine && !pk && canPull(tower, lv, s) && Math.floor(t * 2) % 2 === 0) hl = 'rgba(255,255,255,.35)';
      block(c.x + slide, c.y, v.bw, v.bh, lv, s, hl);
    }
    g.restore();
  }
  function say(text, cls) { const s = $('.tp-say'); s.textContent = text; s.className = 'tp-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  function topple() {
    const v = geom(), blocks = [];
    for (let lv = 0; lv < tower.length; lv++) for (let s = 0; s < 3; s++) if (tower[lv] & (1 << s)) { const c = cellXY(v, lv, s), k = lv / tower.length, side = (lv * 7 + s * 3) % 2 ? 1 : -1; blocks.push({ x: c.x, y: c.y, lv, s, vx: side * (40 + 220 * k) + (s - 1) * 30, vy: -80 - 140 * k, spin: side * (2 + 5 * k) }); }
    falling = { at: nowS(), blocks };
  }
  function note(gs) {
    if (gs.phase === 'count') return 'Take turns. Pull a block and put it on top — gently!';
    if (gs.phase === 'end') {
      if (init.solo && me != null) { const s = gs.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}`; }
      return 'Time! The tower stands (for now).';
    }
    if (gs.sd) return 'SUDDEN WOBBLE! Every pull shakes more.';
    return 'Clean +1 · risky +2 · topple: -4 (others +2)';
  }
  setPanel();
  return {
    state(gs) {
      gs0 = gs;
      if (gs.phase !== phase) {
        if (gs.phase === 'turn' && phase === 'count') { clock.reset(); clock.sync(gs.el || 0); tunes.start(HW ? 'spooky' : 'sing'); }
        if (gs.phase === 'end') { tunes.stop(); ctx.sfx('win'); }
        if (gs.phase === 'turn' && phase === 'fall') falling = null;
      }
      if (gs.phase === 'turn' || gs.phase === 'fall') clock.sync(gs.el);
      phase = gs.phase; ui.dataset.phase = gs.phase;
      if (gs.phase !== 'fall' || !falling) tower = parse(gs.tw);
      if (gs.who !== who || gs.k !== lastK) { who = gs.who; lastK = gs.k; myPick = null; cursor = null; if (myTurn()) { ctx.sfx('good'); navigator.vibrate?.(30); } }
      pick = gs.pk; wob = gs.w;
      if (myTurn() && myPick && !gs.pk) { /* our pick is on its way */ }
      const mine = myTurn(), whoEl = $('.tp-who');
      whoEl.className = 'tp-who' + (mine ? ' mine' : '');
      whoEl.innerHTML = gs.phase === 'turn' ? (mine ? 'YOUR TURN! Pull a block' : `${esc(name(gs.who))}'s turn`) : gs.phase === 'fall' ? 'CRASH!' : gs.phase === 'end' ? 'Time!' : 'Get ready';
      whoEl.style.setProperty('--c', byPid.get(gs.who)?.color || '#fff');
      $('.tp-tl').textContent = gs.phase === 'turn' && mine ? `${gs.tl}s` : '';
      $('.tp-wtrack i').style.width = `${Math.min(100, gs.w)}%`; $('.tp-wob').classList.toggle('hot', gs.w >= 70);
      $('.clock b').textContent = gs.left; $('.clock').classList.toggle('hurry', gs.phase === 'turn' && gs.left <= 10);
      $('.tp-count').textContent = gs.phase === 'count' ? gs.left : '';
      const best = Math.max(0, ...Object.values(gs.sc));
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.tp-board [data-pid="${pid}"]`); if (!c) continue; c.querySelector('.sc').textContent = n; c.classList.toggle('lead', n === best && best > 0); c.classList.toggle('turn', +pid === gs.who && gs.phase === 'turn'); }
      $('.tp-note').textContent = note(gs);
      setPanel();
    },
    event(ev) {
      if (ev.e === 'pull') {
        jolt = Math.min(1.5, 0.4 + ev.add / 20); tunes.fx('knock', ev.clean ? 1.3 : 0.8);
        if (ev.pid === me) { say(ev.clean ? `Clean pull! +${ev.pts}` : `Wobbly… +${ev.pts}`, ev.clean ? 'good' : 'bad'); ctx.sfx(ev.clean ? 'good' : 'tap'); }
        else if (watching) say(`${name(ev.pid)} +${ev.pts}`, 'good');
      } else if (ev.e === 'topple') {
        tower[ev.lv] &= ~(1 << ev.s); topple(); tunes.fx('boing', 0.6); ctx.sfx('out'); navigator.vibrate?.(120);
        say(ev.pid === me ? `You toppled it! ${init.topple}` : `${name(ev.pid)} toppled it! Everyone else +${init.bystander}`, ev.pid === me ? 'bad' : 'gold');
      } else if (ev.e === 'new') { falling = null; say('A new tower!', 'good'); ctx.sfx('pick'); }
      else if (ev.e === 'slow' && ev.pid === me) { say('Too slow! Fumbled it', 'bad'); }
      else if (ev.e === 'end') tunes.stop();
    },
    frame(dt) {
      const t = clock.t();
      jolt = Math.max(0, jolt - dt * 1.4);
      const mine = myTurn(), pk = mine ? myPick : null;
      if (pk) $('.tp-mark').style.left = `${pingPong(t - pk[2], L.period) * 100}%`;
      else if (!mine && pick) $('.tp-mark').style.left = `${pingPong(t - pick[2], L.period) * 100}%`;
      if (sayT && nowS() - sayT > 1.6) { $('.tp-say').classList.remove('pop'); sayT = 0; }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
