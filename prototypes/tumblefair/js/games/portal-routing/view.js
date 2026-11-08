// PORTAL ROUTING on a screen: the shared board drawn in SVG (rails on stone islands over a dark chasm), the marble
// rolling on it, and on a phone that plays a row of big buttons, one per gate you own ("Gate 2 ->"). Your gates are
// ringed in white and wear your colour + shape on the board as well; tapping them on the board works too. Portals
// carry a letter AND a colour, so a pair is never told apart by colour alone. Round 12: a glowing trail shows where
// the marble will go with the gates as they are now (sim.js `trace`), ending in a green tick at the flag or a red
// cross at a pit, so every flip shows its effect at once.
// Expansion 1 M4: a race. Each phone draws ITS OWN board (a watching screen follows the leader), every gate on it is
// the player's, the trail stops at the next portal on normal/hard (a "?" in the portal's colour), and a race strip
// shows how many boards each racer (and Pip, the computer, when alone) has cleared.
import { esc } from '../../client/gamehud.js';
import { trace } from './sim.js';

const SHAPE = { circle: '<circle cx="0" cy="0" r="7"/>', square: '<rect x="-6.5" y="-6.5" width="13" height="13" rx="2"/>', diamond: '<path d="M0 -8 L8 0 L0 8 L-8 0 Z"/>', triangle: '<path d="M0 -8 L8 6 H-8 Z"/>' };
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
const PORTAL = [['A', '#b46bff'], ['B', '#2fd0c8'], ['C', '#ff8a3d'], ['D', '#ff5fa8'], ['E', '#9ad13b'], ['F', '#5aa0ff']];
const ARROW = ['↑', '→', '↓', '←'];
const WORD = ['up', 'right', 'down', 'left'];
const side = (x, y, d) => [x * 100 + 50 + DX[d] * 50, y * 100 + 50 + DY[d] * 50];
const arm = (x, y, d, len = 50) => `M${x * 100 + 50} ${y * 100 + 50} L${x * 100 + 50 + DX[d] * len} ${y * 100 + 50 + DY[d] * len}`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, W = init.w, H = init.h;
  const racers = [...players.map(p => ({ pid: p.pid, name: p.pid === me ? 'You' : p.name, p })), ...(init.cpu ? [{ pid: 'cpu', name: init.cpu, p: { pid: 'cpu', name: init.cpu, color: '#9aa4b2', dark: '#5b6370', shape: 'circle', portrait: '' } }] : [])];
  const meP = players.find(p => p.pid === me);
  ui.innerHTML = `
    <div class="pr-top"><span class="pr-title">Portal Routing</span><span class="clock"><b>--</b></span></div>
    <div class="pr-race">${racers.map(r => `<span class="pr-racer" data-pid="${r.pid}" style="--seat:${r.p.color}"><b>${esc(r.name)}</b><em>0</em></span>`).join('')}</div>
    <div class="pr-goal"><b class="pr-stage"></b></div>
    <div class="pr-boardwrap"><svg class="pr-board" viewBox="-8 -8 ${W * 100 + 16} ${H * 100 + 16}"><g class="pr-cells"></g><g class="pr-trail"></g><g class="pr-fx"></g><g class="pr-ball"><circle r="20" class="pr-shadow" cx="4" cy="8"/><circle r="20" class="pr-marble"/><circle r="7" cx="-7" cy="-7" class="pr-shine"/></g></svg>
      <div class="pr-banner"></div></div>
    <div class="pr-mine"></div>
    <p class="pr-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  ui.style.setProperty('--seat', meP?.color || '#ffd23f'); ui.style.setProperty('--seat-dark', meP?.dark || '#8a6a10');
  const ballEl = $('.pr-ball');
  let si = -1, view = me, stage = null, st = '', pend = new Map(), phase = '', ball = null, gateEls = [], btnEls = [];

  function cellSvg(c, i) {
    const x = i % W, y = (i / W) | 0, X = x * 100, Y = y * 100;
    if (!c) return '';
    let s = `<rect class="pr-island" x="${X + 4}" y="${Y + 4}" width="92" height="92" rx="16"/>`;
    const rails = ds => ds.map(d => arm(x, y, d)).join(' ');
    const ds = [0, 1, 2, 3].filter(d => c.m & (1 << d));
    if (c.k === 't') s += `<path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${rails(ds)}"/>`;
    else if (c.k === 'S') s += `<path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${rails(ds)}"/><g class="pr-start" transform="translate(${X + 50} ${Y + 50})"><circle r="30"/><path d="M-10 -14 L14 0 L-10 14 Z"/></g>`;
    else if (c.k === 'G') s += `<path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${rails(ds)}"/><g class="pr-flag" transform="translate(${X + 50} ${Y + 50})"><circle r="30" class="pr-cup"/><path d="M-6 22 V-26" class="pole"/><path d="M-6 -26 L22 -16 L-6 -6 Z" class="cloth"/></g>`;
    else if (c.k === 'x') s += `<path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${rails(ds)}"/><g class="pr-pit" transform="translate(${X + 50} ${Y + 50})"><circle r="30"/><path d="M-14 -14 L14 14 M14 -14 L-14 14"/></g>`;
    else if (c.k === 'p') { const [L, col] = PORTAL[c.pair % PORTAL.length];
      s += `<path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${rails(ds)}"/><g class="pr-portal" style="--pc:${col}" transform="translate(${X + 50} ${Y + 50})"><circle r="33" class="ring"/><circle r="22" class="hole"/><text y="10" text-anchor="middle">${L}</text></g>`; }
    else if (c.k === 'g') {
      const mine = !watching;
      s += `<g class="pr-gate${mine ? ' mine' : ''}" data-g="${c.gate}">
        <rect class="hit" x="${X}" y="${Y}" width="100" height="100" rx="16"/>
        <path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${arm(x, y, c.stem)}"/>
        <path class="pr-arm a0" d="${arm(x, y, c.arms[0])}"/><path class="pr-arm a1" d="${arm(x, y, c.arms[1])}"/>
        <path class="pr-bar b0" d="${bar(x, y, c.arms[0])}"/><path class="pr-bar b1" d="${bar(x, y, c.arms[1])}"/>
        <circle class="pr-hub" cx="${X + 50}" cy="${Y + 50}" r="15"/><text class="pr-num" x="${X + 50}" y="${Y + 57}" text-anchor="middle">${c.gate + 1}</text>
        </g>`;
    }
    return s;
  }
  // the shut arm of a gate gets a bar across it
  function bar(x, y, d) { const cx = x * 100 + 50 + DX[d] * 33, cy = y * 100 + 50 + DY[d] * 33, px = DY[d] * 21, py = DX[d] * 21; return `M${cx - px} ${cy - py} L${cx + px} ${cy + py}`; }
  function chasm() { let s = ''; for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; s += `<rect class="pr-void" x="${x * 100}" y="${y * 100}" width="100" height="100"/>`; } return s; }

  function build(n) {
    si = n; stage = init.stages[si]; pend = new Map(); trailKey = '';
    $('.pr-cells').innerHTML = chasm() + stage.cells.map(cellSvg).join('');
    // frame only the part of the board in use (a stage rarely fills all six rows), so the cells come out bigger
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    stage.cells.forEach((c, i) => { if (!c) return; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const svg = $('.pr-board');
    svg.setAttribute('viewBox', `${x0 * 100 - 8} ${y0 * 100 - 8} ${(x1 - x0 + 1) * 100 + 16} ${(y1 - y0 + 1) * 100 + 16}`);
    svg.style.setProperty('--cols', x1 - x0 + 1); svg.style.setProperty('--rows', y1 - y0 + 1);
    gateEls = [...ui.querySelectorAll('.pr-gate')];
    $('.pr-mine').innerHTML = watching ? '' : stage.gates.map((_, k) => `<button class="pr-btn" data-g="${k}"><small>Gate</small><b>${k + 1}</b><span class="dir"></span></button>`).join('');
    btnEls = [...ui.querySelectorAll('.pr-btn')];
  }
  const setting = n => (+st[n] || 0) ^ ((pend.get(n) || 0) & 1);   // the server's setting plus my flips it has not seen yet
  function paintGates() {
    for (const el of gateEls) { const n = +el.dataset.g, v = setting(n); el.classList.toggle('s1', v === 1); el.classList.toggle('s0', v === 0); }
    for (const b of btnEls) { const n = +b.dataset.g, c = stage.cells[stage.gates[n]], d = c.arms[setting(n)]; b.querySelector('.dir').textContent = `${ARROW[d]} ${WORD[d]}`; b.setAttribute('aria-label', `Gate ${n + 1}, pointing ${WORD[d]}. Tap to flip.`); }
    paintTrail();
  }
  // ---- where the marble goes now: one polyline per run (a portal jump starts a new one), and the end marker
  let trailKey = '', heading = '';
  function paintTrail() {
    if (!stage) return;
    const sts = stage.gates.map((_, n) => setting(n));
    const from = ball && phase === 'roll' ? [ball[0], ball[1]] : [stage.start, -1];
    const key = sts.join('') + '|' + from.join(',') + '|' + phase; if (key === trailKey) return; trailKey = key;
    const el = $('.pr-trail');
    if (phase === 'clear' || phase === 'drop') { el.innerHTML = ''; heading = ''; return; }
    const { path, end } = trace(stage, sts, from[0], from[1], init.peek === 'portal');
    const runs = [[]];
    for (const [c, i, o] of path) {
      const x = c % W, y = (c / W) | 0, run = runs[runs.length - 1];
      if (i >= 0) run.push(side(x, y, i)); run.push([x * 100 + 50, y * 100 + 50]); if (o >= 0) run.push(side(x, y, o));
      if (o < 0 && stage.cells[c].k === 'p') runs.push([]);
    }
    const last = path[path.length - 1], lc = last ? last[0] : stage.start, lx = lc % W, ly = (lc / W) | 0;
    const [ex, ey] = last && last[2] >= 0 ? side(lx, ly, last[2]) : [lx * 100 + 50, ly * 100 + 50];
    heading = end;
    const pc = end === 'portal' ? PORTAL[stage.cells[lc].pair % PORTAL.length] : null;
    el.innerHTML = runs.filter(r => r.length > 1).map(r => `<polyline class="pr-path ${end}" points="${r.map(p => p.join(',')).join(' ')}"/>`).join('')
      + (pc ? `<g class="pr-end portal" transform="translate(${ex + 30} ${ey - 30})" style="--pc:${pc[1]}"><circle r="22"/><text y="9" text-anchor="middle">${pc[0]}?</text></g>`
        : `<g class="pr-end ${end}" transform="translate(${ex} ${ey})"><circle r="26"/><path d="${end === 'goal' ? 'M-12 0 L-3 10 L13 -10' : 'M-10 -10 L10 10 M10 -10 L-10 10'}"/></g>`);
  }
  function flip(n) {
    if (watching || phase === 'clear' || phase === 'done' || !stage) return;
    if (!stage.cells[stage.gates[n]]) return;
    ctx.send('flip', n); ctx.sfx('tap');
    pend.set(n, (pend.get(n) || 0) + 1); paintGates();                       // flips at once; the server agrees a moment later
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('.pr-btn, .pr-gate.mine'); if (!t) return;
    flip(+t.dataset.g);
  });

  function place() {
    if (!ball || !stage) return;
    const [c, i, o] = ball, x = c % W, y = (c / W) | 0, t = ball.t;
    let px, py;
    if (t < 0.5) { if (i < 0) { px = x * 100 + 50; py = y * 100 + 50; } else { const [sx, sy] = side(x, y, i), k = t / 0.5; px = sx + (x * 100 + 50 - sx) * k; py = sy + (y * 100 + 50 - sy) * k; } }
    else { const [ex, ey] = side(x, y, o), k = (t - 0.5) / 0.5; px = x * 100 + 50 + (ex - x * 100 - 50) * k; py = y * 100 + 50 + (ey - y * 100 - 50) * k; }
    ballEl.setAttribute('transform', `translate(${px} ${py})${phase === 'drop' ? ' scale(.4)' : ''}`);
  }
  function banner(text) { const b = $('.pr-banner'); b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }

  /** The racer this screen follows: me, or (watching) whoever has cleared the most. */
  function follow(g) {
    if (!watching) return me;
    let best = view; for (const [p, r] of Object.entries(g.r)) if (!g.r[best] || r[7] > g.r[best][7]) best = p;
    return best;
  }
  return {
    state(g) {
      const v = follow(g), r = g.r[v]; if (!r) return;
      if (v !== view || r[0] !== si) { if (v !== view) { view = v; phase = ''; } build(r[0]); st = r[2]; }
      if (r[1] !== phase) {
        if (r[1] === 'clear') { ctx.sfx('win'); banner('Goal!'); }
        if (r[1] === 'ready') banner(`Board ${r[0] + 1}`);
        if (r[1] === 'done') banner('All boards!');
      }
      phase = r[1]; ui.dataset.phase = phase;
      for (const [n, k] of pend) if (k > 0 && r[2][n] !== st[n]) pend.set(n, k - 1);
      st = r[2];
      paintGates();
      ball = [r[3], r[4], r[5]]; ball.t = r[6] / 100; place(); paintTrail();
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 10);
      $('.pr-stage').textContent = watching ? `Following ${racers.find(x => String(x.pid) === String(view))?.name || ''} · board ${r[0] + 1} of ${init.stages.length}` : `Board ${r[0] + 1} of ${init.stages.length}`;
      for (const x of racers) { const el = ui.querySelector(`.pr-racer[data-pid="${x.pid}"]`), q = g.r[x.pid]; if (!el || !q) continue; el.querySelector('em').textContent = q[7]; }
      const top = Math.max(...Object.values(g.r).map(q => q[7]));
      for (const x of racers) ui.querySelector(`.pr-racer[data-pid="${x.pid}"]`)?.classList.toggle('lead', top > 0 && g.r[x.pid]?.[7] === top);
      $('.pr-note').textContent = phase === 'clear' ? 'Nice! On to the next board…'
        : phase === 'done' ? 'You cleared every board!'
        : phase === 'ready' ? (heading === 'goal' ? 'Get ready: the trail already reaches the flag!' : 'Quick: flip gates so the glowing trail reaches the flag!')
        : phase === 'drop' ? 'Dropped! Back to the start…'
        : watching ? 'Everyone races the same boards on their own phone.'
        : heading === 'goal' ? '✓ The trail reaches the flag — roll on!'
        : heading === 'portal' ? 'The trail goes into a portal: find the same letter to see where it comes out.'
        : '✗ The trail ends in a pit: flip a gate!';
    },
    event(ev) {
      if (String(ev.pid) !== String(view)) return;
      if (ev.e === 'drop') ctx.sfx('out');
      if (ev.e === 'warp') { ctx.sfx('pick'); const fx = $('.pr-fx'); for (const c of [ev.a, ev.b]) { const x = c % W, y = (c / W) | 0; fx.insertAdjacentHTML('beforeend', `<circle class="pr-pop" cx="${x * 100 + 50}" cy="${y * 100 + 50}" r="30"/>`); } setTimeout(() => { fx.innerHTML = ''; }, 600); }
      if (ev.e === 'bonk') ctx.sfx('hit');
    },
    frame(dt) {
      if (!ball || phase !== 'roll' || !stage) return;
      // roll on between server updates, but never past the end of this cell (the server decides what comes next)
      const k = stage.cells[ball[0]]?.k, stop = k === 'p' || k === 'x' || k === 'G' ? 0.5 : 1;
      if (ball.t < stop) { ball.t = Math.min(stop, ball.t + stage.speed * dt); place(); }
    },
    dispose() {},
  };
}
