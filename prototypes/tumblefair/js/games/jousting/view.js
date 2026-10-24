// TILT & LANCE on a screen: a 2D canvas of the jousting lane seen from the side — blue sky, a striped stand with
// pennants, a red-and-white fence down the middle, and two knights on bouncy hobby horses (the rider's face from the
// avatar system, a round helmet, a striped foam lance) charging in from either side. They meet in the middle at the
// crossing; a hit throws a star burst, an unhorsed knight tumbles off backwards. A phone that is riding gets the
// panel under it: the other knight's target shield with your wobbling aim dot, a strip where both knights close in
// on the NOW mark, and one big HOLD button (Space works too). Not riding: two big cheer buttons before the charge.
// Halloween: a moonlit lane, purple stands, pumpkin-orange shields, bat pennants (same rules).
import { chip, esc } from '../../client/gamehud.js';
import { createTunes } from '../../client/tunes.js';
import { createPhoneClock } from '../toss-kit.js';
import { wobble, grade } from './sim.js';

const SAY = { crack: 'CRACK! +3', solid: 'Solid hit! +2', glance: 'Glancing blow +1', miss: 'Missed!' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween', L = init.level;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const cpu = new Map(init.cpus.map(c => [c.pid, c]));
  const nameOf = pid => (pid === me ? 'You' : byPid.get(pid)?.name || cpu.get(pid)?.name || '?');
  const colorOf = (pid, side) => byPid.get(pid)?.color || (side ? '#3d8bff' : '#e8394a');
  ui.innerHTML = `
    <div class="jt-top"><span class="jt-title">${HW ? 'Moonlit Joust' : 'Tilt & Lance'}</span><span class="clock"><b>--</b></span></div>
    <div class="jt-board">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <div class="jt-head"></div>
    <div class="jt-lane"><canvas></canvas><div class="jt-count"></div><div class="jt-say"></div></div>
    <div class="jt-panel hidden">
      <div class="jt-row"><canvas class="jt-shield"></canvas><div class="jt-side"><b class="jt-pass">Pass 1/3</b><div class="jt-strip"><i class="jt-now">NOW</i><i class="jt-k a"></i><i class="jt-k b"></i></div><p class="jt-tip">HOLD to steady · LET GO at NOW</p></div></div>
      <button class="jt-btn big-btn">HOLD</button>
    </div>
    <div class="jt-cheer hidden"><p>Who will win this bout? Cheer them on!</p><div class="jt-cbtns"><button class="big-btn jt-c" data-s="0"></button><button class="big-btn jt-c" data-s="1"></button></div></div>
    <p class="jt-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.jt-board [data-pid="${me}"]`)?.classList.add('me');
  const lane = $('.jt-lane canvas'), g = lane.getContext('2d'), shield = $('.jt-shield'), sg = shield.getContext('2d');
  const tunes = createTunes({ volume: 0.2 });
  const nowS = () => performance.now() / 1000, clock = createPhoneClock(nowS);
  const faces = new Map(players.filter(p => p.portrait).map(p => { const im = new Image(); im.src = p.portrait; return [p.pid, im]; }));
  let G = null, phase = 'count', hold = null, sentPass = '', mySide = -1, flash = null, tumble = -1, tumbleT = 0, sayT = 0, burst = null;
  const passKey = () => (G ? `${G.b}:${G.k}` : '');
  // ---- the button: press = start steadying, let go = strike
  const btn = $('.jt-btn');
  const canRide = () => !watching && G && mySide >= 0 && (G.ph === 'ready' || G.ph === 'charge') && sentPass !== passKey();
  function down() { if (!canRide() || hold != null) return; hold = clock.t(); btn.classList.add('held'); btn.textContent = 'LET GO at NOW!'; ctx.sfx('tap'); }
  function up() {
    if (hold == null) return; const t = clock.t(); btn.classList.remove('held');
    if (!canRide() || t < G.t0) { hold = null; btn.textContent = 'HOLD'; return; }          // let go before the charge: try again
    ctx.send('lance', { h: Math.round(hold * 1000) / 1000, t: Math.round(t * 1000) / 1000 });
    mine = { k: passKey(), h: hold, t }; sentPass = passKey(); hold = null; btn.textContent = 'Strike!'; btn.disabled = true; ctx.sfx('throw');
  }
  let mine = null;
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); down(); });
  btn.addEventListener('pointerup', e => { e.preventDefault(); up(); });
  btn.addEventListener('pointercancel', () => up());
  const onKey = e => { if (watching || e.repeat || e.code !== 'Space' || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return; e.preventDefault(); if (e.type === 'keydown') down(); else up(); };
  addEventListener('keydown', onKey); addEventListener('keyup', onKey);
  ui.querySelectorAll('.jt-c').forEach(b => b.addEventListener('click', () => { ctx.send('cheer', +b.dataset.s); ctx.sfx('pick'); }));
  // ---- drawing helpers
  let W = 0, H = 0, dpr = 1, SW = 0;
  function size() { dpr = Math.min(2, devicePixelRatio || 1); const r = lane.getBoundingClientRect(); if (r.width) { W = r.width; H = r.height; lane.width = Math.round(W * dpr); lane.height = Math.round(H * dpr); } const s = shield.getBoundingClientRect(); if (s.width) { SW = s.width; shield.width = shield.height = Math.round(SW * dpr); } }
  const ro = window.ResizeObserver ? new ResizeObserver(size) : null; ro?.observe(lane); ro?.observe(shield); size();
  const C = HW ? { sky: ['#1d1430', '#3a2160'], stand: ['#5a2a7a', '#2a1d4a'], ground: '#4a3a52', fence: ['#ff8a1a', '#2a1d4a'], flag: ['#ff8a1a', '#b57bff', '#7dff5a'] }
    : { sky: ['#8fd0f5', '#d6f0ff'], stand: ['#e8394a', '#ffffff'], ground: '#e0c08a', fence: ['#e8394a', '#ffffff'], flag: ['#ffd23f', '#3d8bff', '#3ecf6a', '#ff7aa8'] };
  function knight(x, y, s, dir, pid, side, t, fall) {
    const col = colorOf(pid, side);
    g.save(); g.translate(x, y); if (fall > 0) { g.translate(-dir * fall * 30 * s, -Math.sin(fall * Math.PI) * 30 * s + fall * 10 * s); g.rotate(-dir * fall * 1.6); }
    const bob = Math.sin(t * 14) * 3 * s;
    // hobby horse: body, head, spring
    g.lineWidth = 2.5; g.strokeStyle = '#0d2228';
    g.fillStyle = HW ? '#2a1d4a' : '#fff6e0'; g.beginPath(); g.ellipse(0, -18 * s + bob, 26 * s, 12 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = col; g.fillRect(-20 * s, -24 * s + bob, 40 * s, 7 * s);
    g.fillStyle = HW ? '#2a1d4a' : '#fff6e0'; g.beginPath(); g.ellipse(dir * 26 * s, -32 * s + bob, 10 * s, 13 * s, dir * 0.5, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#0d2228'; g.beginPath(); g.arc(dir * 29 * s, -36 * s + bob, 2 * s, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#8a8f99'; g.lineWidth = 3 * s; g.beginPath(); for (let i = 0; i < 5; i++) { g.lineTo(-6 * s + (i % 2) * 12 * s, -6 * s + i * 1.5 * s); } g.stroke();
    // rider: body, head (face picture or a coloured ball), helmet
    g.lineWidth = 2.5; g.strokeStyle = '#0d2228';
    g.fillStyle = col; g.beginPath(); g.roundRect(-9 * s, -52 * s + bob, 18 * s, 26 * s, 6 * s); g.fill(); g.stroke();
    const hy = -64 * s + bob, hr = 12 * s, im = faces.get(pid);
    g.save(); g.beginPath(); g.arc(0, hy, hr, 0, Math.PI * 2); g.clip();
    if (im?.complete && im.naturalWidth) g.drawImage(im, -hr, hy - hr, hr * 2, hr * 2); else { g.fillStyle = '#ffd9b0'; g.fillRect(-hr, hy - hr, hr * 2, hr * 2); }
    g.restore(); g.beginPath(); g.arc(0, hy, hr, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#c9ced8'; g.beginPath(); g.arc(0, hy - 2 * s, hr + 1.5 * s, Math.PI, 0); g.fill(); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(0, hy - hr - 2 * s); g.quadraticCurveTo(-dir * 14 * s, hy - hr - 12 * s, -dir * 18 * s, hy - hr + 2 * s); g.lineTo(0, hy - hr); g.fill();
    // lance (striped foam) and shield
    const lx = dir * 64 * s, ly = -44 * s + bob;
    g.lineCap = 'round'; g.strokeStyle = '#0d2228'; g.lineWidth = 9 * s; g.beginPath(); g.moveTo(dir * 2 * s, -40 * s + bob); g.lineTo(lx, ly); g.stroke();
    g.strokeStyle = HW ? '#ff8a1a' : col; g.lineWidth = 6 * s; g.stroke(); g.strokeStyle = '#ffffff'; g.setLineDash([6 * s, 6 * s]); g.stroke(); g.setLineDash([]);
    g.fillStyle = HW ? '#ff8a1a' : '#ffffff'; g.beginPath(); g.arc(dir * 6 * s, -40 * s + bob, 9 * s, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = HW ? '#2a1d4a' : '#e8394a'; g.beginPath(); g.arc(dir * 6 * s, -40 * s + bob, 4.5 * s, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  function drawLane(t) {
    if (!W) size(); if (!W) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, C.sky[0]); sky.addColorStop(1, C.sky[1]); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (HW) { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(W * 0.82, H * 0.15, 16, 0, Math.PI * 2); g.fill(); }
    // stand with pennants
    const sy = H * 0.22; for (let i = 0; i < 14; i++) { g.fillStyle = C.stand[i % 2]; g.fillRect(i * W / 14, sy, W / 14 + 1, H * 0.2); }
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, sy + H * 0.2 - 6, W, 6);
    for (let i = 0; i < 9; i++) { const x = (i + 0.5) * W / 9; g.fillStyle = C.flag[i % C.flag.length]; g.beginPath(); g.moveTo(x - 9, sy - 4); g.lineTo(x + 9, sy - 4); g.lineTo(x, sy + 12); g.closePath(); g.fill(); }
    g.fillStyle = C.ground; g.fillRect(0, H * 0.42, W, H * 0.58);
    // knights: where along the lane
    let u = 0;
    if (G && (G.ph === 'charge' || G.ph === 'result' || G.ph === 'ready')) u = G.ph === 'ready' ? 0 : (t - G.t0) / L.charge;
    u = Math.max(0, Math.min(1.25, u));
    const s = Math.min(1.2, H / 210), cx = W / 2, reachX = 64 * s;
    const xa = 30 * s + (cx - reachX * 0.55 - 30 * s) * u, xb = W - 30 * s - (W - 30 * s - (cx + reachX * 0.55)) * u;
    const rd = G?.rd;
    if (rd) knight(xa, H * 0.62, s, 1, rd[0], 0, t, tumble === 0 ? Math.min(1, (nowS() - tumbleT) / 0.8) : 0);
    // the fence (between them)
    const fy = H * 0.7; for (let i = 0; i < 16; i++) { g.fillStyle = C.fence[i % 2]; g.fillRect(i * W / 16, fy, W / 16 + 1, 12 * s); } g.strokeStyle = '#0d2228'; g.lineWidth = 2; g.strokeRect(-2, fy, W + 4, 12 * s);
    if (rd) knight(xb, H * 0.9, s, -1, rd[1], 1, t + 0.3, tumble === 1 ? Math.min(1, (nowS() - tumbleT) / 0.8) : 0);
    if (burst) { const k = (nowS() - burst.t) / 0.6; if (k > 1) burst = null; else { g.save(); g.translate(cx, H * 0.7); g.rotate(k); g.fillStyle = burst.big ? '#ffd23f' : '#ffffff'; g.strokeStyle = '#0d2228'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 16; i++) { const r = (i % 2 ? 14 : 34) * s * (0.6 + k); g.lineTo(Math.cos(i * Math.PI / 8) * r, Math.sin(i * Math.PI / 8) * r); } g.closePath(); g.globalAlpha = 1 - k; g.fill(); g.stroke(); g.restore(); } }
    // names
    if (rd) { g.font = `900 ${Math.round(13 * Math.max(1, s))}px system-ui, sans-serif`; g.textAlign = 'left'; g.fillStyle = '#0d2228'; g.fillText(nameOf(rd[0]), 8, H * 0.47); g.textAlign = 'right'; g.fillText(nameOf(rd[1]), W - 8, H * 0.47); }
  }
  function drawShield(t) {
    if (!SW) size(); if (!SW) return;
    const R = SW / 2, sc = R * 0.62;
    sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.clearRect(0, 0, SW, SW);
    sg.fillStyle = HW ? '#2a1d4a' : '#5a3a2a'; sg.beginPath(); sg.arc(R, R, R - 2, 0, Math.PI * 2); sg.fill();
    const rings = HW ? ['#ff8a1a', '#2a1d4a', '#ff8a1a', '#ffd23f'] : ['#ffffff', '#e8394a', '#ffffff', '#e8394a'];
    [1, 0.75, 0.5, 0.25].forEach((f, i) => { sg.fillStyle = rings[i]; sg.beginPath(); sg.arc(R, R, sc * f, 0, Math.PI * 2); sg.fill(); });
    sg.strokeStyle = '#0d2228'; sg.lineWidth = 3; sg.beginPath(); sg.arc(R, R, sc, 0, Math.PI * 2); sg.stroke();
    if (!G || mySide < 0) return;
    const w = init.wob[(G.b * init.passes + G.k) * 2 + mySide];
    let p;
    if (mine && mine.k === passKey()) p = wobble(w, mine.t - G.t0, mine.h - G.t0, L);
    else p = wobble(w, t - G.t0, hold == null ? null : hold - G.t0, L);
    const x = R + p.x * sc, y = R + p.y * sc, me2 = byPid.get(me);
    sg.strokeStyle = '#0d2228'; sg.lineWidth = 5; sg.beginPath(); sg.arc(x, y, 9, 0, Math.PI * 2); sg.stroke();
    sg.strokeStyle = me2?.color || '#ffd23f'; sg.lineWidth = 3; sg.stroke();
    sg.beginPath(); sg.moveTo(x - 15, y); sg.lineTo(x + 15, y); sg.moveTo(x, y - 15); sg.lineTo(x, y + 15); sg.stroke();
  }
  function say(text, cls) { const s = $('.jt-say'); s.textContent = text; s.className = 'jt-say ' + cls; void s.offsetWidth; s.classList.add('pop'); sayT = nowS(); }
  function head(gs) {
    if (gs.ph === 'count') return 'Get ready to joust!';
    if (gs.ph === 'end') { if (init.solo && me != null) { const s = gs.sc[me] ?? 0, m = init.medals; return `${s} points — ${s >= m[2] ? 'GOLD!' : s >= m[1] ? 'SILVER!' : s >= m[0] ? 'BRONZE!' : `bronze needs ${m[0]}`}`; } return 'The tournament is over!'; }
    if (!gs.rd) return '';
    const bout = `Bout ${gs.b + 1}: ${esc(nameOf(gs.rd[0]))} ${gs.bp[0]} – ${gs.bp[1]} ${esc(nameOf(gs.rd[1]))}`;
    return bout;
  }
  return {
    state(gs) {
      G = gs;
      if (gs.ph !== phase) {
        if (gs.ph === 'intro') { tumble = -1; tunes.start(HW ? 'spooky' : 'boogie'); }
        if (gs.ph === 'ready') { tumble = -1; hold = null; btn.disabled = false; btn.textContent = 'HOLD'; btn.classList.remove('held'); mine = null; }
        if (gs.ph === 'charge' && mySide >= 0) ctx.sfx('pick');
        if (gs.ph === 'end') { tunes.stop(); ctx.sfx('win'); }
      }
      phase = gs.ph;
      clock.sync(gs.el);
      mySide = gs.rd && me != null ? gs.rd.indexOf(me) : -1;
      $('.clock b').textContent = gs.left;
      $('.jt-count').textContent = gs.ph === 'count' ? gs.left : '';
      $('.jt-head').innerHTML = head(gs);
      const riding = mySide >= 0 && gs.ph !== 'end';
      $('.jt-panel').classList.toggle('hidden', !riding || watching);
      const cheering = !watching && !riding && gs.rd && (gs.ph === 'intro' || (gs.ph === 'ready' && gs.k === 0));
      $('.jt-cheer').classList.toggle('hidden', !cheering);
      if (cheering) {
        const mineC = gs.ch?.[me];
        ui.querySelectorAll('.jt-c').forEach((b, i) => { b.textContent = `${mineC === i ? '📣 ' : ''}${nameOf(gs.rd[i])}`; b.style.setProperty('--seat', colorOf(gs.rd[i], i)); b.disabled = mineC != null; b.classList.toggle('picked', mineC === i); });
      }
      $('.jt-pass').textContent = gs.ph === 'intro' ? `Bout ${gs.b + 1}` : `Pass ${gs.k + 1}/${init.passes}`;
      for (const [pid, n] of Object.entries(gs.sc)) { const c = ui.querySelector(`.jt-board [data-pid="${pid}"]`); if (c) { c.querySelector('.sc').textContent = n; } }
      const best = Math.max(0, ...Object.values(gs.sc)); for (const c of ui.querySelectorAll('.jt-board .chip')) c.classList.toggle('lead', +c.querySelector('.sc').textContent === best && best > 0);
      const note = watching ? '' : riding ? 'Crack (3) while they glance = UNHORSED!' : gs.ch?.[me] != null ? `You cheer for ${nameOf(gs.rd?.[gs.ch[me]])}: +2 if they win` : gs.ph === 'end' ? '' : 'Watch the joust!';
      $('.jt-note').textContent = note;
    },
    event(ev) {
      if (ev.e === 'bout') { say(`Bout ${ev.b + 1}!`, ''); ctx.sfx('pick'); }
      else if (ev.e === 'hit') {
        burst = { t: nowS(), big: ev.g.includes(3) };
        ctx.sfx(ev.g.some(x => x) ? 'hit' : 'bad'); tunes.fx('ding', ev.g.includes(3) ? 2 : 1.4);
        if (ev.un >= 0) { tumble = ev.un; tumbleT = nowS(); }
        const side = G?.rd ? G.rd.indexOf(me) : -1;
        if (side >= 0) { const gr = grade(ev.q[side]); say(ev.un === 1 - side ? 'UNHORSED THEM! +3' : ev.un === side ? 'You were unhorsed!' : SAY[gr], ev.un === 1 - side || gr === 'crack' ? 'gold' : gr === 'miss' || ev.un === side ? 'bad' : 'good'); }
        else if (ev.un >= 0 && G?.rd) say(`${nameOf(G.rd[ev.un])} is UNHORSED!`, 'gold');
        else say(`${SAY[grade(ev.q[0])].split('!')[0]} · ${SAY[grade(ev.q[1])].split('!')[0]}`, '');
      } else if (ev.e === 'boutEnd') { say(ev.win === me ? 'You win the bout! +3' : `${nameOf(ev.win)} wins the bout!`, ev.win === me ? 'gold' : ''); if (ev.win === me) ctx.sfx('coins'); }
    },
    frame() {
      const t = clock.t();
      if (sayT && nowS() - sayT > 1.5) { $('.jt-say').classList.remove('pop'); sayT = 0; }
      // the strip: both knights closing in on NOW
      if (G && mySide >= 0) {
        const u = G.ph === 'charge' ? Math.min(1.2, (t - G.t0) / L.charge) : G.ph === 'result' ? 1.2 : 0;
        $('.jt-k.a').style.left = `${u * 50}%`; $('.jt-k.b').style.left = `${100 - u * 50}%`;
        $('.jt-strip').classList.toggle('now', G.ph === 'charge' && Math.abs(t - G.cr) < 0.18);
      }
      drawLane(t); if (mySide >= 0) drawShield(t);
    },
    dispose() { removeEventListener('keydown', onKey); removeEventListener('keyup', onKey); ro?.disconnect(); tunes.dispose(); },
  };
}
