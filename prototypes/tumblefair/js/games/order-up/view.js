// ORDER UP! on a screen: a striped food stand. While the bubbles are up, every customer in the line shows their order
// (little food pictures in a speech bubble) — learn who wants what by their HAT. Then the bubbles pop: one customer at
// a time steps up to the counter with a "?" bubble. Tap foods from the menu onto your tray (tap again to take one
// off), then the big SERVE button. Each served customer cheers (perfect), smiles (close) or frowns. At the tally every
// customer shows what they really wanted next to what you gave them.
// Halloween: Monster Snacks — little monster customers and spooky treats (looks only).
import { chip } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { foodSvg, foodName, customerSvg, customerName } from '../memory-icons.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  ui.innerHTML = `
    <div class="ou-top"><span class="ou-title">${HW ? 'Monster Snacks' : 'Order Up!'}</span><span class="clock"><b>--</b></span></div>
    <div class="ou-board">${players.map(p => chip(p, '<em class="sc">0</em><strong class="st"></strong>')).join('')}</div>
    <div class="ou-stand"><div class="ou-awning"></div><div class="ou-line"></div><div class="ou-counter"></div></div>
    <div class="ou-now"></div>
    <div class="ou-tray"><span class="ou-plate"></span><button class="ou-serve">SERVE</button></div>
    <div class="ou-menu cols-${init.foods > 6 ? 4 : init.foods > 4 ? 3 : 5}">${Array.from({ length: init.foods }, (_, i) => `<button class="ou-food" data-f="${i}">${foodSvg(i, HW)}<b>${foodName(i, HW)}</b><i>${i + 1}</i></button>`).join('')}</div>
    <p class="ou-note"></p>`;
  const $ = s => ui.querySelector(s), juice = createJuice(ctx), foods = [...ui.querySelectorAll('.ou-food')];
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.ou-board [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, last = null, tray = [], myK = 0, sent = -1, results = [], lineKey = '';
  const bubble = items => `<span class="ou-bubble">${items.map(f => foodSvg(f, HW)).join('')}</span>`;
  const cust = (c, inner = '', cls = '') => `<span class="ou-cust ${cls}" title="${customerName(c, HW)}">${customerSvg(c, HW)}${inner}</span>`;
  function now(text, cls = '') { const e = $('.ou-now'); e.textContent = text; e.className = 'ou-now ' + cls; }
  function drawTray() {
    $('.ou-plate').innerHTML = tray.length ? tray.map(f => `<i data-f="${f}">${foodSvg(f, HW)}</i>`).join('') : `<em>${phase === 'serve' ? 'Tap the food they wanted' : ''}</em>`;
    for (const b of foods) b.classList.toggle('on', tray.includes(+b.dataset.f));
    $('.ou-serve').disabled = !canServe() || !tray.length;
  }
  const canServe = () => !watching && phase === 'serve' && last && myK < last.n && sent !== myK;
  function line(g) {
    const key = [g.phase, g.round, g.phase === 'serve' ? myK : '', results.join()].join('|'); if (key === lineKey && g.phase !== 'show') return; lineKey = key;
    const L = $('.ou-line'), C = $('.ou-counter');
    if (g.phase === 'show') { L.innerHTML = g.who.map((c, i) => cust(c, bubble(g.orders[i]))).join(''); C.innerHTML = ''; L.className = 'ou-line show n' + g.n; }
    else if (g.phase === 'serve' && !watching) {
      const q = g.queue, at = q[myK];
      L.className = 'ou-line wait';
      L.innerHTML = q.map((ci, k) => (k === myK ? '' : cust(g.who[ci], k < myK ? `<b class="ou-res">${results[k] || ''}</b>` : '', k < myK ? 'done' : ''))).join('');
      C.innerHTML = at != null ? cust(g.who[at], '<span class="ou-bubble ask">?</span>', 'at') : `<span class="ou-closed">${HW ? 'All fed! 🎃' : 'All served! 🎉'}</span>`;
    } else if (g.phase === 'serve') { L.className = 'ou-line wait'; L.innerHTML = g.queue.map(ci => cust(g.who[ci])).join(''); C.innerHTML = ''; }
    else if (g.phase === 'tally') {
      const mine = g.served?.[me] || [];
      L.className = 'ou-line tally n' + g.n;
      L.innerHTML = g.who.map((c, i) => {
        const k = g.queue.indexOf(i), got = mine[k];
        const marks = got ? `<span class="ou-got">${got.map(f => `<i class="${g.orders[i].includes(f) ? 'ok' : 'no'}">${foodSvg(f, HW)}</i>`).join('') || '—'}</span>` : (watching ? '' : '<span class="ou-got">—</span>');
        return cust(c, bubble(g.orders[i]) + marks);
      }).join('');
      C.innerHTML = '';
    } else { L.innerHTML = ''; C.innerHTML = ''; L.className = 'ou-line'; }
  }
  function toggle(f) {
    if (!canServe()) return;
    const i = tray.indexOf(f); if (i >= 0) tray.splice(i, 1); else if (tray.length < 4) tray.push(f); else return;
    ctx.sfx('tap'); drawTray();
  }
  function serve() {
    if (!canServe() || !tray.length) return;
    sent = myK; ctx.send('serve', { r: last.round, k: myK, items: [...tray] }); ctx.sfx('throw');
    const b = $('.ou-serve'); b.classList.add('press'); setTimeout(() => b.classList.remove('press'), 160); drawTray();
  }
  ui.addEventListener('pointerdown', e => {
    if (watching) return;
    const f = e.target.closest('.ou-food'), pl = e.target.closest('.ou-plate i'), sv = e.target.closest('.ou-serve');
    if (f) { e.preventDefault(); toggle(+f.dataset.f); } else if (pl) { e.preventDefault(); toggle(+pl.dataset.f); } else if (sv) { e.preventDefault(); serve(); }
  });
  const onKey = e => { if (watching || e.repeat) return; const k = +e.key; if (k >= 1 && k <= init.foods) toggle(k - 1); else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); serve(); } };
  addEventListener('keydown', onKey);
  function paint(g) {
    for (const p of players) {
      const c = ui.querySelector(`.ou-board [data-pid="${p.pid}"]`); if (!c) continue;
      c.querySelector('.sc').textContent = g.sc[p.pid];
      c.querySelector('.st').textContent = g.phase === 'serve' ? (g.k[p.pid] >= g.n ? '✓' : `${g.k[p.pid]}/${g.n}`) : '';
    }
    const best = Math.max(0, ...Object.values(g.sc)); for (const p of players) ui.querySelector(`.ou-board [data-pid="${p.pid}"]`)?.classList.toggle('lead', g.sc[p.pid] === best && best > 0);
  }
  return {
    state(g) {
      last = g;
      if (g.round !== round) { round = g.round; tray = []; myK = 0; sent = -1; results = []; lineKey = ''; }
      if (me != null && g.k) { if (g.k[me] !== myK) { myK = g.k[me]; tray = []; } }
      if (g.phase !== phase) {
        if (g.phase === 'show') { ctx.sfx('pick'); juice.say(`${g.n} customers!`, 1000); }
        if (g.phase === 'serve') { ctx.sfx('pick'); tray = []; }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      line(g);
      if (g.phase === 'ready') now(watching ? 'The stand is opening…' : 'Get ready to read the orders!', 'look');
      else if (g.phase === 'show') now(`READ the orders! Who wants what? ${g.left}`, 'look');
      else if (g.phase === 'serve') now(watching ? 'Serve them from memory!' : myK >= g.n ? 'All served! Wait for the others…' : `SERVE customer ${myK + 1} of ${g.n}: food, then SERVE`, myK >= g.n ? '' : 'go');
      else if (g.phase === 'tally') now('What they really wanted:', 'reveal');
      else if (g.phase === 'end') now(HW ? 'The snack bar is closed!' : 'The stand is closed!', 'go');
      const s = g.sc[me] ?? 0, m = init.medals;
      $('.ou-note').textContent = g.phase === 'end'
        ? (init.solo && me != null ? `${s} tips — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}` : 'Tips: 1 a right food, -1 a wrong one, +2 for a perfect order, +1 first to serve everyone.')
        : g.phase === 'show' && init.shuffle ? 'Tricky: they come back to the counter in a NEW order — know them by their hats!' : '';
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'serve' && g.left <= 3);
      ui.classList.toggle('can-tap', canServe());
      drawTray(); paint(g);
    },
    event(ev) {
      if (ev.e === 'served' && ev.pid === me) {
        results[ev.k] = ev.exact ? '😄' : ev.pts > 0 ? '🙂' : '😟'; lineKey = '';
        if (ev.exact) { ctx.sfx('good'); juice.flash('#7dff8a', 200); juice.say(`+${ev.pts} Perfect!`, 800); }
        else if (ev.pts > 0) { ctx.sfx('tap'); juice.say(`+${ev.pts} Close!`, 800); }
        else { ctx.sfx('bad'); juice.flash('#ff5f5f', 200); juice.say('Wrong order!', 800); }
        if (last) line(last);
      } else if (ev.e === 'first' && ev.pid === me) juice.say('First to serve everyone! +1', 1000);
      else if (ev.e === 'tally') ctx.sfx('coins');
    },
    frame(dt, t) { juice.frame(dt, t); },
    dispose() { removeEventListener('keydown', onKey); juice.dispose(); },
  };
}
