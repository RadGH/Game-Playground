// PUMPKIN FLING on a screen: one 2D canvas, a side-on moonlit pumpkin patch. A wooden catapult on the left, distance
// signs every 20 m, a friendly scarecrow holding up the bucket for this fling, and at the far end the graveyard wall
// with spooky-cute woods behind it. Pumpkins fly in an arc with a dotted trail in the thrower's seat colour and leave
// a little pumpkin where they landed (in the woods: a "Lost!" puff). Bats flap the way the wind blows.
// A phone that plays has the swing panel under the field: Fling n/3, the wind, Best; the POWER bar; the ARM gauge
// (a fan from flat to straight up with the sweet middle marked); one big button that says what to do now. The meters
// run on this phone; it sends what it locked.
import { pingPong, armAt } from './sim.js';
import { scoreBar, h } from '../../client/gamehud.js';

export function createView(ctx) {
  const { players, me, init, ui } = ctx, L = init.level, playing = me != null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = '';
  const bar = scoreBar(ctx, { unit: 'metres' });
  const wrap = h('div', 'pf-wrap');
  wrap.innerHTML = `
    <div class="pf-field"><canvas></canvas><div class="pf-banner"></div></div>
    <div class="pf-panel${playing ? '' : ' hidden'}">
      <div class="pf-row pf-info"><b class="pf-n">Fling 1/${init.flings}</b><span class="pf-wind"><i class="pf-arrow"></i><em></em></span><span class="pf-best">Best: –</span></div>
      <div class="pf-last" aria-live="polite"></div>
      <div class="pf-meter pf-power"><span>Power</span><div class="pf-track"><i class="pf-fill"></i><i class="pf-mark"></i></div></div>
      <div class="pf-meter pf-arm"><span>Let go</span><div class="pf-track"><i class="pf-sweet"></i><i class="pf-needle"></i></div></div>
      <button class="pf-go big-btn">Get ready…</button>
    </div>
    <p class="pf-note"></p>`;
  ui.append(wrap);
  const $ = s => wrap.querySelector(s);
  const canvas = $('canvas'), g = canvas.getContext('2d');
  const fill = $('.pf-fill'), mark = $('.pf-mark'), ndl = $('.pf-needle'), btn = $('.pf-go'), lastTx = $('.pf-last');
  // the sweet part of the arm gauge: 38-52 degrees (where the best throws are), as a share of the gauge
  const [A0, A1] = init.arm, at = a => (a - A0) / (A1 - A0);
  $('.pf-sweet').style.left = (at(38) * 100) + '%'; $('.pf-sweet').style.width = ((at(52) - at(38)) * 100) + '%';
  let mode = 'wait', t0 = 0, t1 = 0, lockedP = 0, myN = 0, last = null, sent = false, sentAt = 0;
  const now = () => performance.now() / 1000;
  function tap() {
    if (mode === 'power') { lockedP = pingPong(now() - t0, L.power); mode = 'arm'; t1 = now(); ctx.sfx('tap'); }
    else if (mode === 'arm') { const a = Math.round(armAt(now() - t1, L.arm) * 10) / 10; ctx.send('fling', { p: Math.round(lockedP * 1000) / 1000, a }); mode = 'sent'; sent = true; sentAt = now(); armShown = a; ctx.sfx('throw'); }
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  canvas.addEventListener('pointerdown', e => { if (playing) { e.preventDefault(); tap(); } });
  const onKey = e => { if (!playing) return; if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) tap(); } };
  addEventListener('keydown', onKey);
  // the arm drops back after a fling (or if it was never let go, it springs up by itself at the end of its swing)
  let armShown = A0;
  const showLast = (text, cls) => { lastTx.textContent = text; lastTx.className = 'pf-last show ' + cls; clearTimeout(showLast.t); showLast.t = setTimeout(() => { lastTx.className = 'pf-last'; }, 2400); };
  const banner = $('.pf-banner');
  const showBanner = (html, ms = 2000) => { banner.innerHTML = html; banner.classList.add('show'); clearTimeout(showBanner.t); showBanner.t = setTimeout(() => banner.classList.remove('show'), ms); };

  // ---- flights and landed pumpkins
  const flying = [], landed = [];       // flying: { pid, d, h, lie, t, T }; landed: { pid, d, lie, k, pts }
  const curK = () => playing ? Math.min(init.flings - 1, myN) : Math.min(init.flings - 1, Math.min(...Object.values(last?.n || { 0: 0 })));

  // ---- drawing
  let W = 0, H = 0, dpr = 1;
  function size() { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1); if (!r.width) return; W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(canvas); size();
  const MAXD = 138, X0 = () => W * 0.1, gy = () => H * 0.82;
  const px = d => X0() + (W * 0.86 - X0()) * d / MAXD;
  const py = hh => gy() - Math.min(H * 0.7, hh * (H * 0.7) / 70);
  function pumpkin(x, y, r, color, face = true) {
    g.save(); g.translate(x, y);
    g.fillStyle = '#ff7a14'; g.strokeStyle = '#1a0f26'; g.lineWidth = Math.max(1.5, r * 0.14);
    for (const [ox, rx] of [[-r * 0.45, r * 0.62], [r * 0.45, r * 0.62], [0, r * 0.7]]) { g.beginPath(); g.ellipse(ox, 0, rx, r * 0.85, 0, 0, 7); g.fill(); g.stroke(); }
    g.fillStyle = '#4c7a2a'; g.fillRect(-r * 0.12, -r * 1.15, r * 0.24, r * 0.4);
    if (color) { g.strokeStyle = color; g.lineWidth = Math.max(2, r * 0.22); g.beginPath(); g.ellipse(0, 0, r * 1.02, r * 0.3, 0, 0, 7); g.stroke(); }
    if (face && r > 7) { g.fillStyle = '#ffd36b'; g.beginPath(); g.moveTo(-r * 0.45, -r * 0.15); g.lineTo(-r * 0.25, -r * 0.45); g.lineTo(-r * 0.05, -r * 0.15); g.fill(); g.beginPath(); g.moveTo(r * 0.05, -r * 0.15); g.lineTo(r * 0.25, -r * 0.45); g.lineTo(r * 0.45, -r * 0.15); g.fill(); g.beginPath(); g.arc(0, r * 0.12, r * 0.42, 0.15, Math.PI - 0.15); g.fill(); }
    g.restore();
  }
  function scene(t) {
    const Y = gy();
    // sky and moon
    const sky = g.createLinearGradient(0, 0, 0, Y); sky.addColorStop(0, '#120a26'); sky.addColorStop(1, '#3a2160'); g.fillStyle = sky; g.fillRect(0, 0, W, Y);
    g.fillStyle = '#fff4cf'; g.beginPath(); g.arc(W * 0.72, H * 0.16, Math.min(W, H) * 0.06, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 18; i++) { const sx = (i * 97 % 100) / 100 * W, sy = (i * 53 % 60) / 100 * Y; g.fillRect(sx, sy, 1.5, 1.5); }
    // woods past the wall: round dark trees with glowing eyes that blink (friendly)
    const wx = px(init.wall);
    for (let i = 0; i < 6; i++) { const tx = wx + 14 + i * (W - wx) / 5, th = Math.min(H * (0.28 + (i % 3) * 0.06), W * (0.16 + (i % 3) * 0.04)); g.fillStyle = i % 2 ? '#241a3f' : '#2c2050'; g.beginPath(); g.ellipse(tx, Y - th * 0.6, th * 0.32, th * 0.55, 0, 0, 7); g.fill(); g.fillRect(tx - 3, Y - th * 0.2, 6, th * 0.2); if (Math.sin(t * 0.9 + i * 2) > -0.85) { g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(tx - 5, Y - th * 0.6, 2.4, 0, 7); g.arc(tx + 5, Y - th * 0.6, 2.4, 0, 7); g.fill(); } }
    // ground: the patch (stripes), the woods floor past the wall
    g.fillStyle = '#2f5a34'; g.fillRect(0, Y, wx, H - Y); g.fillStyle = '#1d1730'; g.fillRect(wx, Y, W - wx, H - Y);
    g.fillStyle = 'rgba(255,255,255,.05)'; for (let d = 0; d < init.wall; d += 20) if ((d / 20) % 2) g.fillRect(px(d), Y, px(d + 20) - px(d), H - Y);
    // distance signs every 20 m
    g.font = `900 ${Math.max(10, Math.round(H * 0.035))}px "Baloo 2", system-ui, sans-serif`; g.textAlign = 'center';
    for (let d = W < 560 ? 40 : 20; d < init.wall; d += W < 560 ? 40 : 20) { const x = px(d); g.fillStyle = '#6a4a2a'; g.fillRect(x - 1.5, Y - 16, 3, 16); g.fillStyle = '#ffd36b'; g.fillRect(x - 13, Y - 30, 26, 15); g.fillStyle = '#1a0f26'; g.fillText(d, x, Y - 18); }
    // the graveyard wall: stones and a gate post, with a "lost" warning stripe
    g.fillStyle = '#8a7fa8'; g.fillRect(wx - 6, Y - H * 0.13, 12, H * 0.13); for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#9c92b8' : '#7c7298'; g.fillRect(wx - 7, Y - H * 0.13 + k * H * 0.032, 14, H * 0.03); }
    g.fillStyle = '#b9acd8'; g.beginPath(); g.arc(wx, Y - H * 0.13, 8, Math.PI, 0); g.fill();
    g.fillStyle = '#ffd36b'; g.fillText(W < 560 ? 'WALL' : `${init.wall} m wall`, wx, Y - H * 0.13 - 14);
    // the scarecrow and the bucket for the current fling
    const k = curK(), bx = px(init.buckets[k]), reach = (px(init.buckets[k] + L.bucket) - px(init.buckets[k] - L.bucket));
    g.fillStyle = 'rgba(255,210,63,.22)'; g.fillRect(bx - reach / 2, Y, reach, 7);
    g.strokeStyle = '#6a4a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(bx + 14, Y); g.lineTo(bx + 14, Y - 54); g.moveTo(bx - 2, Y - 40); g.lineTo(bx + 30, Y - 40); g.stroke();
    g.fillStyle = '#e8c27a'; g.beginPath(); g.arc(bx + 14, Y - 60, 9, 0, 7); g.fill(); g.fillStyle = '#3a2160'; g.beginPath(); g.moveTo(bx + 1, Y - 64); g.lineTo(bx + 27, Y - 64); g.lineTo(bx + 14, Y - 82); g.fill();
    g.fillStyle = '#1a0f26'; g.beginPath(); g.arc(bx + 10, Y - 61, 1.6, 0, 7); g.arc(bx + 18, Y - 61, 1.6, 0, 7); g.fill();
    g.fillStyle = '#9aa3ad'; g.strokeStyle = '#1a0f26'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx - 9, Y - 46); g.lineTo(bx + 5, Y - 46); g.lineTo(bx + 3, Y - 32); g.lineTo(bx - 7, Y - 32); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f'; g.fillText(`+${init.bonus}`, bx - 2, Y - 50);
    // bats flap the way the wind blows
    const w = init.winds[k];
    for (let i = 0; i < 4; i++) { const bxx = ((i * 0.27 + t * 0.03 * Math.sign(w || 1) * (0.5 + Math.abs(w) / 6)) % 1 + 1) % 1 * W, byy = H * (0.25 + i * 0.08) + Math.sin(t * 3 + i) * 6, f = Math.abs(Math.sin(t * 10 + i)) * 6;
      g.fillStyle = '#0d0818'; g.beginPath(); g.moveTo(bxx, byy); g.lineTo(bxx - 10, byy - f); g.lineTo(bxx - 4, byy + 2); g.lineTo(bxx, byy + 4); g.lineTo(bxx + 4, byy + 2); g.lineTo(bxx + 10, byy - f); g.closePath(); g.fill(); }
    // the catapult: a wooden frame and the arm at its angle (with a pumpkin in the cup while waiting)
    const cx = X0() - W * 0.02, cy = Y;
    g.fillStyle = '#7a4f2a'; g.fillRect(cx - 22, cy - 10, 44, 10); g.fillStyle = '#2b2b33'; g.beginPath(); g.arc(cx - 15, cy, 6, 0, 7); g.arc(cx + 15, cy, 6, 0, 7); g.fill();
    g.fillStyle = '#9a6a3a'; g.beginPath(); g.moveTo(cx - 12, cy - 10); g.lineTo(cx, cy - 34); g.lineTo(cx + 12, cy - 10); g.closePath(); g.fill();
    const armA = mode === 'arm' ? armAt(now() - t1, L.arm) : (mode === 'sent' || mode === 'flying') && now() - sentAt < 0.6 ? armShown : A0;
    const ar = (180 - armA) * Math.PI / 180, alen = Math.min(W * 0.11, 60), ex = cx + Math.cos(ar) * -alen, ey = cy - 30 - Math.sin(ar) * alen;
    g.strokeStyle = '#c08a4a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx + Math.cos(ar) * alen * 0.35, cy - 30 + Math.sin(ar) * alen * 0.35); g.lineTo(ex, ey); g.stroke();
    if (playing && (mode === 'power' || mode === 'arm' || mode === 'wait')) pumpkin(ex, ey - 6, Math.max(7, H * 0.025), byPid.get(me)?.color);
  }
  function draw(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    scene(t);
    const Y = gy(), r = Math.max(6, H * 0.024);
    for (const L2 of landed) { if (L2.lie === 'woods') continue; const p = byPid.get(L2.pid); pumpkin(px(L2.d), Y - r * 0.8, r * (L2.pid === me ? 0.9 : 0.7), p?.color, false); }
    for (let i = flying.length - 1; i >= 0; i--) {
      const F = flying[i], k = Math.min(1, (now() - F.t) / F.T), p = byPid.get(F.pid);
      const d = F.d * k, hh = 4 * F.h * k * (1 - k);
      g.fillStyle = p?.color || '#fff';
      for (let s = 0; s < 14; s++) { const kk = k * s / 14, dd = F.d * kk, h2 = 4 * F.h * kk * (1 - kk); g.globalAlpha = 0.25 + 0.5 * s / 14; g.beginPath(); g.arc(px(dd), py(h2), 2.4, 0, 7); g.fill(); }
      g.globalAlpha = 1;
      pumpkin(px(d), py(hh) - r * 0.5, r * 1.1, p?.color);
      if (k >= 1) flying.splice(i, 1);
    }
    // labels: everyone's best landing in the patch
    g.font = `900 ${Math.max(11, Math.round(H * 0.035))}px "Baloo 2", system-ui, sans-serif`; g.textAlign = 'center'; g.lineJoin = 'round';
    const bestOf = new Map(); for (const L2 of landed) if (L2.lie === 'patch' && (!bestOf.has(L2.pid) || bestOf.get(L2.pid).pts < L2.pts)) bestOf.set(L2.pid, L2);
    let row = 0;
    for (const [pid, L2] of bestOf) { const p = byPid.get(pid), x = px(L2.d), y = Y + 16 + (row++ % 2) * 15; g.lineWidth = 4; g.strokeStyle = '#1a0f26'; g.strokeText(`${p?.name?.slice(0, 6) || ''} ${L2.pts}`, x, y); g.fillStyle = p?.color || '#fff'; g.fillText(`${p?.name?.slice(0, 6) || ''} ${L2.pts}`, x, y); }
  }
  function showWind(k) {
    const w = init.winds[Math.min(k, init.winds.length - 1)];
    const el = $('.pf-wind'); el.querySelector('em').textContent = w === 0 ? 'calm' : `${Math.abs(w)} ${w > 0 ? 'tailwind' : 'headwind'}`;
    el.querySelector('.pf-arrow').style.transform = `rotate(${w >= 0 ? 0 : 180}deg)`; el.classList.toggle('head', w < 0);
  }
  showWind(0);
  const medal = s => init.medals?.find(([d]) => s >= d);
  return {
    state(gs) {
      last = gs; bar.set(gs.sc, gs.left);
      if (playing) {
        const n2 = gs.n[me] ?? 0, busy = gs.busy[me];
        if (n2 !== myN) { myN = n2; sent = false; }
        if (sent && now() - sentAt > 2.5 && !busy && n2 === myN && mode === 'sent') { sent = false; mode = 'wait'; }
        if (!gs.go) mode = 'wait';
        else if (n2 >= init.flings && !busy) mode = 'done';
        else if (!busy && !sent && (mode === 'wait' || mode === 'flying')) { mode = 'power'; t0 = now(); }
        else if (busy) mode = 'flying';
        $('.pf-n').textContent = mode === 'done' ? 'All done!' : `Fling ${Math.min(init.flings, n2 + (busy ? 0 : 1))}/${init.flings}`;
        $('.pf-best').textContent = `Best: ${gs.sc[me] ? gs.sc[me] : '–'}`;
        showWind(Math.max(0, Math.min(busy ? n2 - 1 : n2, init.flings - 1)));
      } else showWind(curK());
      const n = Object.values(gs.n), done = n.every(x => x >= init.flings);
      $('.pf-note').textContent = !gs.go ? 'Get ready to fling!' : done ? '' : playing ? (init.medals ? `Medals: bronze ${init.medals[2][0]}, silver ${init.medals[1][0]}, gold ${init.medals[0][0]}` : 'Longest fling that stays in the patch wins!') : 'Longest fling that stays in the patch wins!';
    },
    event(ev) {
      if (ev.e === 'fling') { flying.push({ pid: ev.pid, d: ev.d, h: ev.h, lie: ev.lie, t: now(), T: init.flight - 0.4 }); if (ev.pid !== me) ctx.sfx('throw'); }
      else if (ev.e === 'land') {
        landed.push({ pid: ev.pid, d: ev.d, lie: ev.lie, k: ev.k, pts: ev.pts });
        if (ev.pid === me) {
          if (ev.lie === 'woods') { showLast('Over the wall — lost in the woods!', 'bad'); ctx.sfx('bad'); }
          else if (ev.pts > ev.d) { showLast(`BUCKET! ${ev.d} m + ${init.bonus} = ${ev.pts}`, 'good'); ctx.sfx('coins'); }
          else { showLast(`${ev.d} metres!`, 'good'); ctx.sfx('good'); }
        }
      } else if (ev.e === 'end') {
        ctx.sfx('win');
        if (init.medals) { const s = last?.sc?.[players[0].pid] ?? 0, m = medal(s); showBanner(`${s} metres<small>${m ? { gold: '🥇 Gold!', silver: '🥈 Silver', bronze: '🥉 Bronze' }[m[1]] : 'Keep practising!'}</small>`, 4000); }
        else { const best = Math.max(...Object.values(last?.sc || { 0: 0 })), who = players.filter(p => (last?.sc?.[p.pid] ?? 0) === best && best > 0).map(p => p.name).join(' & '); if (who) showBanner(`${best} metres<small>${who}</small>`, 4000); }
      }
    },
    frame(dt, t) {
      if (playing) {
        $('.pf-panel').dataset.mode = mode;
        const p = mode === 'power' ? pingPong(now() - t0, L.power) : lockedP;
        fill.style.width = (p * 100).toFixed(1) + '%'; mark.style.left = (lockedP * 100).toFixed(1) + '%'; mark.style.opacity = mode === 'arm' || mode === 'sent' ? 1 : 0;
        const a = mode === 'arm' ? armAt(now() - t1, L.arm) : A0; ndl.style.left = (at(a) * 100).toFixed(1) + '%';
        if (mode === 'arm' && now() - t1 > L.arm + 0.05) tap();          // never let go: it springs up at the top by itself
        btn.textContent = { power: 'TAP: POWER!', arm: 'TAP: LET GO!', sent: 'Fling!', flying: 'Watch it fly…', done: 'All done!', wait: 'Get ready…' }[mode];
        btn.disabled = !(mode === 'power' || mode === 'arm');
      }
      draw(t);
    },
    dispose() { removeEventListener('keydown', onKey); ro?.disconnect(); clearTimeout(showLast.t); clearTimeout(showBanner.t); bar.el.remove(); },
  };
}
