// TWINKLE TREE on a screen: a snowy night, a big evergreen with its six lights (each a colour, a shape and a number),
// a row of dots for the pattern length, and on a phone six big light buttons in two rows (the same colour + shape +
// number). While the tree shows the pattern (state.pat) this device plays the blinks on its own clock; then a phone taps
// the buttons (each tap lights that light on the tree too) and the dots fill. The score chips (and Twinkle the sprite,
// alone) show each player's progress: 3/5 while going, a tick for a whole pattern, a cross for a slip.
import { esc, scoreBar } from '../../client/gamehud.js';
import { LIGHTS, CPU } from './sim.js';

const SPOTS = [[100, 62], [76, 104], [126, 116], [62, 160], [104, 170], [144, 186]];
/** One light's shape centred on (cx, cy), radius r. */
export function shape(k, cx, cy, r, extra = '') {
  const L = LIGHTS[k], f = `fill="${L.hex}" stroke="#1d2a33" stroke-width="${(r / 6).toFixed(1)}" stroke-linejoin="round" ${extra}`;
  const P = pts => `<path d="M${pts.map(([x, y]) => `${(cx + x * r).toFixed(1)} ${(cy + y * r).toFixed(1)}`).join(' L')}Z" ${f}/>`;
  if (L.shape === 'ball') return `<circle cx="${cx}" cy="${cy}" r="${r}" ${f}/>`;
  if (L.shape === 'diamond') return P([[0, -1.1], [0.85, 0], [0, 1.1], [-0.85, 0]]);
  if (L.shape === 'triangle') return P([[0, -1.05], [1, 0.8], [-1, 0.8]]);
  if (L.shape === 'star') return P(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? 0.46 : 1.1; return [Math.cos(a) * q, Math.sin(a) * q]; }));
  if (L.shape === 'heart') return `<path d="M${cx} ${cy + r} C${cx - r * 1.7} ${cy - r * 0.1} ${cx - r * 0.7} ${cy - r * 1.4} ${cx} ${cy - r * 0.45} C${cx + r * 0.7} ${cy - r * 1.4} ${cx + r * 1.7} ${cy - r * 0.1} ${cx} ${cy + r}Z" ${f}/>`;
  // snowflake: a white hexagon with three crossing arms and little side branches
  const arms = [0, 1, 2].map(i => { const a = i * Math.PI / 3, c = Math.cos(a) * r * 0.9, s = Math.sin(a) * r * 0.9; return `M${(cx - c).toFixed(1)} ${(cy - s).toFixed(1)} L${(cx + c).toFixed(1)} ${(cy + s).toFixed(1)}`; }).join(' ');
  const twigs = Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3, bx = cx + Math.cos(a) * r * 0.55, by = cy + Math.sin(a) * r * 0.55, t = r * 0.25;
    return `M${(bx + Math.cos(a + 2.3) * t).toFixed(1)} ${(by + Math.sin(a + 2.3) * t).toFixed(1)} L${bx.toFixed(1)} ${by.toFixed(1)} L${(bx + Math.cos(a - 2.3) * t).toFixed(1)} ${(by + Math.sin(a - 2.3) * t).toFixed(1)}`; }).join(' ');
  return P(Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3 + Math.PI / 6; return [Math.cos(a), Math.sin(a)]; }))
    + `<path d="${arms} ${twigs}" fill="none" stroke="#5b8fc0" stroke-width="${(r / 7).toFixed(1)}" stroke-linecap="round" ${extra}/>`;
}
const num = (k, cx, cy, size) => `<text x="${cx}" y="${cy + size * 0.36}" text-anchor="middle" font-size="${size}" font-weight="900" fill="#1d2a33">${k + 1}</text>`;

function treeSVG() {
  return `<svg class="tw-svg" viewBox="0 0 200 240" aria-hidden="true">
    <rect x="88" y="206" width="24" height="26" rx="3" fill="#7a4a24" stroke="#1d2a33" stroke-width="3"/>
    <path d="M100 18 L150 92 L128 92 L170 150 L144 150 L186 210 L14 210 L56 150 L30 150 L72 92 L50 92Z" fill="#1f8a4c" stroke="#1d2a33" stroke-width="4" stroke-linejoin="round"/>
    <path d="M100 18 L124 54 Q100 64 76 54Z M72 92 Q100 104 128 92 L140 108 Q100 122 60 108Z M56 150 Q100 164 144 150 L158 168 Q100 184 42 168Z" fill="#e9f6ff" opacity=".85"/>
    <path d="M100 6 L106 18 L94 18Z" fill="#e9f6ff" stroke="#1d2a33" stroke-width="2"/>
    ${SPOTS.map(([x, y], k) => `<g class="tw-light" data-k="${k}"><circle class="tw-glow" cx="${x}" cy="${y}" r="24" fill="${LIGHTS[k].hex}"/>${shape(k, x, y, 12)}${num(k, x, y, 12)}</g>`).join('')}
  </svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  ui.innerHTML = `
    <div class="tw-sky" aria-hidden="true"></div>
    <div class="tw-top"><span class="tw-title">Twinkle Tree</span><span class="tw-round"></span></div>
    <div class="tw-stage"><div class="tw-tree">${treeSVG()}</div><div class="tw-count"></div><div class="tw-banner"></div></div>
    <div class="tw-dots"></div>
    <div class="tw-pad">${LIGHTS.map((L, k) => `<button class="tw-btn" data-k="${k}" type="button" aria-label="${k + 1} ${esc(L.name)}" style="--c:${L.hex}"><svg viewBox="0 0 40 40" aria-hidden="true">${shape(k, 20, 20, 15)}${num(k, 20, 20, 14)}</svg><span>${esc(L.name)}</span></button>`).join('')}</div>
    <p class="tw-note"></p>`;
  const bar = scoreBar(ctx, { unit: 'points' });
  if (init.cpu) bar.el.insertAdjacentHTML('beforeend', `<span class="chip tw-cpu" data-pid="${CPU}" style="--seat:#8a8f9c;--seat-dark:#4a4f5c"><i class="face tw-sprite"></i><b class="nm">${esc(init.cpu.name)}</b><em class="sc">0</em></span>`);
  ui.querySelector('.tw-top').append(bar.el);
  for (const c of bar.el.querySelectorAll('.chip')) c.insertAdjacentHTML('beforeend', '<b class="tw-prog"></b>');
  const $ = s => ui.querySelector(s), lights = [...ui.querySelectorAll('.tw-light')], btns = [...ui.querySelectorAll('.tw-btn')];
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  let phase = 'ready', round = -1, showAt = null, pat = '', len = 0, myPos = 0, mySt = 0, flash = new Map(), lastBlink = -1;
  const nowS = () => performance.now() / 1000;

  function light(k, secs = 0.35) { flash.set(k, nowS() + secs); }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.tw-btn'); if (!b || watching || phase !== 'play' || mySt !== 0) return;
    e.preventDefault(); const k = +b.dataset.k;
    ctx.send('tap', k); light(k); ctx.sfx('tap');
    b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
  });
  ui.addEventListener('click', e => {                  // a controller's A (padnav) clicks without a pointerdown
    const b = e.target.closest('.tw-btn'); if (!b || e.detail !== 0 || watching || phase !== 'play' || mySt !== 0) return;
    const k = +b.dataset.k; ctx.send('tap', k); light(k); ctx.sfx('tap');
  });
  function dots(g) {
    const n = g.len || 0, d = $('.tw-dots');
    if (d.childElementCount !== n) d.innerHTML = Array.from({ length: n }, () => '<i></i>').join('');
    [...d.children].forEach((x, i) => {
      x.className = g.phase === 'res' && g.pat ? 'ans' : i < myPos ? 'on' : '';
      x.innerHTML = g.phase === 'res' && g.pat ? `<svg viewBox="0 0 40 40">${shape(+g.pat[i], 20, 20, 15)}</svg>` : '';
    });
    d.classList.toggle('slip', mySt === 2 && g.phase !== 'show');
  }
  function chips(g) {
    for (const [id, n] of Object.entries(g.s || {})) {
      const c = bar.el.querySelector(`.chip[data-pid="${id}"]`); if (!c) continue;
      const sc = c.querySelector('.sc'); if (sc.textContent !== String(n)) sc.textContent = n;
      const p = g.p?.[id], pr = c.querySelector('.tw-prog');
      pr.textContent = !p ? '' : p[1] === 1 ? '✓' : p[1] === 2 ? '✗' : `${p[0]}/${g.len}`;
      pr.className = 'tw-prog' + (p ? ' st' + p[1] : '');
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Watch the tree closely!';
    if (g.phase === 'show') return 'Watch… remember the order!';
    if (g.phase === 'play') return watching ? 'Tap the lights back on your phones!' : mySt === 1 ? 'The whole pattern! +2' : mySt === 2 ? 'Oops! Back next round.' : `Your turn: tap ${len} lights in order.`;
    if (g.phase === 'res') return mySt === 1 ? 'Perfect!' : 'Here is how it went:';
    if (init.cpu) { const mine = g.s[players[0].pid], tw = g.s[CPU]; return mine > tw ? `🏆 You out-twinkled ${init.cpu.name}!` : mine === tw ? `A tie with ${init.cpu.name}!` : `${init.cpu.name} wins this time.`; }
    const best = g.best ? Math.max(...Object.values(g.best)) : 0;
    return best ? `Longest pattern: ${best} lights!` : 'The tree is all lit up!';
  }

  return {
    priv(d) { myPos = d.pos; mySt = d.st; },
    state(g) {
      const was = phase; phase = g.phase; ui.dataset.phase = g.phase; len = g.len;
      if (g.phase === 'show' && g.r !== round) { round = g.r; pat = g.pat; showAt = nowS(); lastBlink = -1; myPos = 0; mySt = 0; ctx.sfx('pick'); }
      if (g.p && me != null && g.p[me]) { myPos = g.p[me][0]; const st = g.p[me][1]; if (st !== mySt && g.phase === 'play') ctx.sfx(st === 1 ? 'coins' : 'bad'); mySt = st; }
      if (g.phase === 'end' && was !== 'end') ctx.sfx('win');
      $('.tw-round').textContent = g.r >= 0 && g.phase !== 'end' ? `Round ${g.r + 1} of ${init.rounds} · ${g.len} lights` : '';
      $('.tw-count').textContent = g.phase === 'ready' ? Math.max(1, g.left) : '';
      const ban = $('.tw-banner'); ban.textContent = g.phase === 'play' ? (watching ? 'Your turn!' : mySt === 0 ? 'Your turn!' : '') : g.phase === 'show' ? 'Watch!' : '';
      ban.className = 'tw-banner ' + g.phase;
      bar.set(null, g.left); chips(g); dots(g);
      btns.forEach(b => { b.disabled = watching || g.phase !== 'play' || mySt !== 0; });
      $('.tw-note').textContent = note(g);
    },
    frame() {
      const t = nowS(), on = new Set();
      if (phase === 'show' && showAt != null && pat) {
        const e = t - showAt, i = Math.floor((e - init.lead) / init.blink);
        if (i >= 0 && i < pat.length && (e - init.lead) - i * init.blink < init.blink * 0.7) { on.add(+pat[i]); if (i !== lastBlink) { lastBlink = i; ctx.sfx('tap'); } }
      }
      for (const [k, until] of flash) { if (t < until) on.add(k); else flash.delete(k); }
      lights.forEach((l, k) => { const v = on.has(k); if (l.classList.contains('on') !== v) l.classList.toggle('on', v); });
    },
    dispose() {},
  };
}
