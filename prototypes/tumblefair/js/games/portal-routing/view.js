// PORTAL ROUTING on a screen: the shared board drawn in SVG (rails on stone islands over a dark chasm), the marble
// rolling on it, and on a phone that plays a row of big buttons, one per gate you own ("Gate 2 ->"). Your gates are
// ringed in white and wear your colour + shape on the board as well; tapping them on the board works too. Portals
// carry a letter AND a colour, so a pair is never told apart by colour alone. Round 12: a glowing trail shows where
// the marble will go with the gates as they are now (sim.js `trace`), ending in a green tick at the flag or a red
// cross at a pit, so every flip shows its effect at once.
import { esc, chip } from '../../client/gamehud.js';
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
  const bySeat = new Map(players.map(p => [p.seat, p])), mySeat = players.find(p => p.pid === me)?.seat ?? null;
  ui.innerHTML = `
    <div class="pr-top"><span class="pr-title">Portal Routing</span><span class="clock"><b>--</b></span></div>
    <div class="pr-goal"><b class="pr-stage"></b><span class="pr-pips"></span></div>
    <div class="pr-boardwrap"><svg class="pr-board" viewBox="-8 -8 ${W * 100 + 16} ${H * 100 + 16}"><g class="pr-cells"></g><g class="pr-trail"></g><g class="pr-fx"></g><g class="pr-ball"><circle r="20" class="pr-shadow" cx="4" cy="8"/><circle r="20" class="pr-marble"/><circle r="7" cx="-7" cy="-7" class="pr-shine"/></g></svg>
      <div class="pr-banner"></div></div>
    <div class="pr-mine"></div>
    <div class="pr-players">${players.map(p => chip(p, `<i class="pr-mark" style="--seat:${p.color}"><svg viewBox="-10 -10 20 20">${SHAPE[p.shape] || SHAPE.circle}</svg></i>`)).join('')}</div>
    <p class="pr-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.pr-players [data-pid="${me}"]`)?.classList.add('me');
  const ballEl = $('.pr-ball');
  let si = -1, stage = null, st = '', pend = new Map(), phase = '', ball = null, gateEls = [], btnEls = [];

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
      const p = bySeat.get(c.own), mine = c.own === mySeat;
      s += `<g class="pr-gate${mine ? ' mine' : ''}" data-g="${c.gate}" style="--seat:${p?.color || '#888'};--seat-dark:${p?.dark || '#444'}">
        <rect class="hit" x="${X}" y="${Y}" width="100" height="100" rx="16"/>
        <path class="pr-bed" d="${rails(ds)}"/><path class="pr-rail" d="${arm(x, y, c.stem)}"/>
        <path class="pr-arm a0" d="${arm(x, y, c.arms[0])}"/><path class="pr-arm a1" d="${arm(x, y, c.arms[1])}"/>
        <path class="pr-bar b0" d="${bar(x, y, c.arms[0])}"/><path class="pr-bar b1" d="${bar(x, y, c.arms[1])}"/>
        <circle class="pr-hub" cx="${X + 50}" cy="${Y + 50}" r="15"/><text class="pr-num" x="${X + 50}" y="${Y + 57}" text-anchor="middle">${c.gate + 1}</text>
        <g class="own" transform="translate(${X + 84} ${Y + 16})">${SHAPE[p?.shape] || SHAPE.circle}</g></g>`;
    }
    return s;
  }
  // the shut arm of a gate gets a bar across it
  function bar(x, y, d) { const cx = x * 100 + 50 + DX[d] * 33, cy = y * 100 + 50 + DY[d] * 33, px = DY[d] * 21, py = DX[d] * 21; return `M${cx - px} ${cy - py} L${cx + px} ${cy + py}`; }
  function chasm() { let s = ''; for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; s += `<rect class="pr-void" x="${x * 100}" y="${y * 100}" width="100" height="100"/>`; } return s; }

  function build(g) {
    si = g.stage; stage = init.stages[si]; pend = new Map();
    $('.pr-cells').innerHTML = chasm() + stage.cells.map(cellSvg).join('');
    // frame only the part of the board in use (a stage rarely fills all six rows), so the cells come out bigger
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    stage.cells.forEach((c, i) => { if (!c) return; const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const svg = $('.pr-board');
    svg.setAttribute('viewBox', `${x0 * 100 - 8} ${y0 * 100 - 8} ${(x1 - x0 + 1) * 100 + 16} ${(y1 - y0 + 1) * 100 + 16}`);
    svg.style.setProperty('--cols', x1 - x0 + 1); svg.style.setProperty('--rows', y1 - y0 + 1);
    gateEls = [...ui.querySelectorAll('.pr-gate')];
    const mine = stage.gates.map((ci, n) => ({ n, c: stage.cells[ci] })).filter(o => o.c.own === mySeat);
    $('.pr-mine').innerHTML = watching ? '' : mine.length
      ? `<span class="pr-minehead">Your gates</span>` + mine.map(o => `<button class="pr-btn" data-g="${o.n}" style="--seat:${bySeat.get(o.c.own)?.color};--seat-dark:${bySeat.get(o.c.own)?.dark}"><small>Gate</small><b>${o.n + 1}</b><span class="dir"></span></button>`).join('')
      : `<span class="pr-minehead">No gates for you on this stage: call out to your team!</span>`;
    btnEls = [...ui.querySelectorAll('.pr-btn')];
    $('.pr-pips').innerHTML = init.stages.map((_, i) => `<i class="${i < g.cleared ? 'done' : ''}${i === init.target - 1 ? ' goal' : ''}"></i>`).join('');
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
    const { path, end } = trace(stage, sts, from[0], from[1]);
    const runs = [[]];
    for (const [c, i, o] of path) {
      const x = c % W, y = (c / W) | 0, run = runs[runs.length - 1];
      if (i >= 0) run.push(side(x, y, i)); run.push([x * 100 + 50, y * 100 + 50]); if (o >= 0) run.push(side(x, y, o));
      if (o < 0 && stage.cells[c].k === 'p') runs.push([]);
    }
    const last = path[path.length - 1], lc = last ? last[0] : stage.start, lx = lc % W, ly = (lc / W) | 0;
    const [ex, ey] = last && last[2] >= 0 ? side(lx, ly, last[2]) : [lx * 100 + 50, ly * 100 + 50];
    heading = end;
    el.innerHTML = runs.filter(r => r.length > 1).map(r => `<polyline class="pr-path ${end}" points="${r.map(p => p.join(',')).join(' ')}"/>`).join('')
      + `<g class="pr-end ${end}" transform="translate(${ex} ${ey})"><circle r="26"/><path d="${end === 'goal' ? 'M-12 0 L-3 10 L13 -10' : 'M-10 -10 L10 10 M10 -10 L-10 10'}"/></g>`;
  }
  function flip(n) {
    if (watching || phase === 'clear' || !stage) return;
    const c = stage.cells[stage.gates[n]]; if (!c || c.own !== mySeat) return;
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

  return {
    state(g) {
      if (g.stage !== si) { build(g); st = g.st; }
      if (g.phase !== phase) {
        if (g.phase === 'clear') { ctx.sfx('win'); banner('Goal!'); }
        if (g.phase === 'ready') banner(`Stage ${g.stage + 1}`);
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      // each change the server shows is one of my flips seen (only I can flip my gates)
      for (const [n, k] of pend) if (k > 0 && g.st[n] !== st[n]) pend.set(n, k - 1);
      st = g.st;
      paintGates();
      ball = [g.b[0], g.b[1], g.b[2]]; ball.t = g.b[3] / 100; place(); paintTrail();
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 10);
      $('.pr-stage').textContent = `Stage ${g.stage + 1} of ${init.stages.length}  ·  cleared ${g.cleared} (goal ${g.target})`;
      ui.querySelectorAll('.pr-pips i').forEach((p, i) => p.classList.toggle('done', i < g.cleared));
      const mineN = btnEls.length;
      $('.pr-note').textContent = g.phase === 'clear' ? (g.cleared >= g.target ? 'Goal reached! Keep going for more.' : `Nice! ${g.target - g.cleared} more to reach the goal.`)
        : g.phase === 'ready' ? (heading === 'goal' ? 'Get ready: the trail already reaches the flag!' : 'Quick: flip your gates so the glowing trail reaches the flag!')
        : g.phase === 'drop' ? 'Dropped! Back to the start…'
        : watching ? 'Flip the gates on your phones so the marble reaches the flag.'
        : heading === 'goal' ? '✓ The glowing trail reaches the flag — keep it that way!'
        : mineN ? '✗ The trail ends in a pit: flip your gates until it reaches the flag!' : 'The trail ends in a pit: shout at your team to flip!';
    },
    event(ev) {
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
