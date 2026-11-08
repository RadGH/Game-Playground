// PRESENT PEEK on a screen: a big present in the middle (the toy drawn underneath, eight strips of wrapping paper and
// a bow over it). As the server tears strips off (state.off, in the order state.so, across or down) each one flies
// away. Four big answer buttons under it; a phone that taps is locked in (green tick or red cross when the round ends).
// The score chips sit on top (plus Pip the elf when you play alone), with a tick on everyone who has answered and the
// points each one won flying up after the round. A watch-only screen shows the same present big, without buttons.
import { esc, scoreBar } from '../../client/gamehud.js';
import { PICTURES, picOf, pointsAt, STRIPS, CPU } from './sim.js';
import { TOYS } from './art.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  ui.innerHTML = `
    <div class="pk-top"><span class="pk-title">Present Peek</span><span class="pk-round"></span></div>
    <div class="pk-box">
      <div class="pk-toy"></div>
      <div class="pk-paper">${Array.from({ length: STRIPS }, (_, i) => `<i class="pk-strip" data-i="${i}" style="--i:${i}"></i>`).join('')}</div>
      <i class="pk-bow" aria-hidden="true"></i>
      <b class="pk-worth"></b>
      <div class="pk-count"></div>
    </div>
    <div class="pk-opts">${[0, 1, 2, 3].map(i => `<button class="pk-opt" data-i="${i}" data-who="" type="button"><span></span></button>`).join('')}</div>
    <p class="pk-note"></p>`;
  const bar = scoreBar(ctx, { unit: 'points' });
  if (init.cpu) bar.el.insertAdjacentHTML('beforeend', `<span class="chip pk-cpu" data-pid="${CPU}" style="--seat:#8a8f9c;--seat-dark:#4a4f5c"><i class="face pk-elf"></i><b class="nm">${esc(init.cpu.name)}</b><em class="sc">0</em></span>`);
  ui.querySelector('.pk-top').append(bar.el);
  const $ = s => ui.querySelector(s), box = $('.pk-box'), strips = [...ui.querySelectorAll('.pk-strip')], opts = [...ui.querySelectorAll('.pk-opt')];
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  let phase = 'ready', round = -1, myPick = null, off = 0, t0 = null, last = null;
  const nowS = () => performance.now() / 1000;

  ui.addEventListener('click', e => {
    const b = e.target.closest('.pk-opt'); if (!b || watching || phase !== 'peek' || myPick != null || off < 1) return;
    myPick = +b.dataset.i; ctx.send('pick', myPick); ctx.sfx('pick'); paintOpts();
  });
  function paintOpts() {
    const g = last; if (!g?.opts) return;
    opts.forEach((b, i) => {
      b.querySelector('span').textContent = PICTURES[g.opts[i]]?.name || '';
      b.classList.toggle('mine', myPick === i);
      b.classList.toggle('right', g.phase === 'ans' && g.a === i);
      b.classList.toggle('wrong', g.phase === 'ans' && myPick === i && g.a !== i);
      b.disabled = watching || g.phase !== 'peek' || myPick != null || (g.off ?? 0) < 1;
      const who = g.pk ? Object.entries(g.pk).filter(([, v]) => v === i).map(([id]) => id) : [];
      b.dataset.who = who.length && g.phase === 'ans' ? who.map(id => (id === CPU ? init.cpu?.name : players.find(p => String(p.pid) === id)?.name) || '').join(', ') : '';
    });
  }
  function newRound(g) {
    round = g.r; myPick = null; off = 0; t0 = nowS();
    const pic = picOf(g.k, g.r, init.salt);
    $('.pk-toy').innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${TOYS[PICTURES[pic].id] || ''}</svg>`;
    box.dataset.o = g.o; box.classList.remove('open');
    const order = [...g.so].map(Number);
    strips.forEach(s => { s.classList.remove('off'); s.style.setProperty('--hue', (round * 47) % 360); });
    box.classList.remove('bowoff');
    ctx.sfx('pick');
  }
  function chips(g) {
    for (const [id, n] of Object.entries(g.s || {})) {
      const c = bar.el.querySelector(`.chip[data-pid="${id}"]`); if (!c) continue;
      const sc = c.querySelector('.sc'); if (sc.textContent !== String(n)) sc.textContent = n;
      c.classList.toggle('in', !!g.in?.includes(id === CPU ? CPU : +id));
      let pop = c.querySelector('.pk-gain');
      if (g.phase === 'ans' && g.gn && id in g.gn) {
        if (!pop) { pop = document.createElement('b'); pop.className = 'pk-gain'; c.append(pop); }
        pop.textContent = g.gn[id] ? `+${g.gn[id]}` : '✗'; pop.classList.toggle('miss', !g.gn[id]);
      } else pop?.remove();
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Get ready: what is inside the present?';
    if (g.phase === 'peek') {
      if (watching) return 'Guess on your phones! Sooner = more points.';
      if (myPick != null) return 'Locked in! Waiting for the others…';
      return (g.off ?? 0) < 1 ? 'Wait for the first strip…' : 'Tap the toy you think it is!';
    }
    if (g.phase === 'ans') { const name = PICTURES[g.opts[g.a]].name, fst = g.f == null ? null : g.f === CPU ? init.cpu?.name : players.find(p => p.pid === g.f)?.name; return `It was a ${name}!${fst ? ` First right: ${fst} (+2)` : ''}`; }
    if (init.cpu) { const mine = g.s[players[0].pid], pip = g.s[CPU]; return mine > pip ? `🏆 You beat ${init.cpu.name}!` : mine === pip ? `A tie with ${init.cpu.name}!` : `${init.cpu.name} wins this time.`; }
    return 'All the presents are open!';
  }

  return {
    priv(d) { if (d.pick != null) myPick = d.pick; paintOpts(); },
    state(g) {
      const was = phase; last = g; phase = g.phase; ui.dataset.phase = g.phase;
      if ((g.phase === 'peek' || g.phase === 'ans') && g.r !== round) newRound(g);
      if (g.phase === 'peek' || g.phase === 'ans') {
        const n = g.off ?? 0;
        if (n !== off) {
          const est = n ? init.first + (n - 1) * init.gap : 0;
          if (t0 == null || Math.abs((nowS() - t0) - est) > 0.4) t0 = nowS() - est;
          if (n > off && g.phase === 'peek') ctx.sfx('tap');
          off = n;
        }
        const order = [...g.so].map(Number);
        strips.forEach(s => s.classList.toggle('off', order.indexOf(+s.dataset.i) < off));
        box.classList.toggle('bowoff', off > 0); box.classList.toggle('open', g.phase === 'ans');
      }
      if (g.phase === 'ans' && was === 'peek') ctx.sfx(myPick == null ? 'out' : myPick === g.a ? 'coins' : 'bad');
      if (g.phase === 'end' && was !== 'end') ctx.sfx('win');
      $('.pk-round').textContent = g.r >= 0 && g.phase !== 'end' ? `Present ${g.r + 1} of ${init.rounds}` : g.phase === 'end' ? 'Final scores' : '';
      $('.pk-count').textContent = g.phase === 'ready' ? Math.max(1, g.left) : '';
      bar.set(null, g.left);
      chips(g); paintOpts();
      $('.pk-note').textContent = note(g);
    },
    frame() {
      const w = $('.pk-worth');
      if (phase === 'peek' && off >= 1 && myPick == null && t0 != null) { const t = Math.min(init.peek, nowS() - t0), s = `worth ${pointsAt(t)}`; if (w.textContent !== s) w.textContent = s; }
      else if (w.textContent) w.textContent = '';
    },
    dispose() {},
  };
}
