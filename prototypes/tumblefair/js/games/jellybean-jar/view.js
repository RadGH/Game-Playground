// JELLYBEAN JAR on a screen. The container fills the top of a phone (the left of a TV), drawn by jar-art.js from the
// round's seed. A phone that plays gets a big number pad under it (DEL / OK); every digit is sent as a draft, so a
// number typed but never OK'd still counts when time runs out. The reveal dims every thing, then lights them up one
// by one as a big counter climbs (fast at first, slowing near the end), while each player's guess waits on the
// guess-o-meter and pops when the counter passes it.
import { esc, chip } from '../../client/gamehud.js';
import { svg, NAMES as PLAIN_NAMES, NAMES_HW, MANY_HW } from './jar-art.js';

const COUNT_MS = 3600;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const HW = ctx.season === 'halloween', NAMES = HW ? NAMES_HW : PLAIN_NAMES;      // Halloween: candy corn, eyeballs, a cauldron, ghosts
  ui.innerHTML = `
    <div class="jj-top"><span class="jj-title">${HW ? 'Candy Jar' : 'Jellybean Jar'}</span><span class="jj-round"></span><span class="clock"><b>--</b></span></div>
    <div class="jj-main">
      <div class="jj-stage"><div class="jj-pic"></div><div class="jj-count" aria-live="polite"><b>0</b><span></span></div></div>
      <div class="jj-side">
        <p class="jj-ask"></p>
        <div class="jj-entry"><span class="jj-disp">?</span><em class="jj-sent"></em></div>
        <div class="jj-pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => `<button data-d="${d}">${d}</button>`).join('')}<button data-k="del" class="jj-del" aria-label="Delete a digit">DEL</button><button data-d="0">0</button><button data-k="ok" class="jj-ok">OK</button></div>
        <div class="jj-meter"><div class="jj-track"><i class="jj-needle"></i></div><div class="jj-pins"></div></div>
      </div>
    </div>
    <div class="jj-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="jj-st"></strong>')).join('')}</div>
    <p class="jj-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.jj-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -2, entry = '', ok = false, items = [], counting = null, lastG = null;

  function paintEntry() {
    $('.jj-disp').textContent = entry || '?';
    $('.jj-disp').classList.toggle('empty', !entry);
    $('.jj-sent').textContent = ok ? 'Locked in!' : entry ? 'Press OK' : '';
    $('.jj-ok').disabled = !entry; $('.jj-ok').classList.toggle('on', ok);
    ui.classList.toggle('is-ok', ok);
  }
  function sendEntry(lock) { ok = !!lock && !!entry; ctx.send('guess', { n: entry ? +entry : null, ok }); paintEntry(); }
  ui.addEventListener('click', e => {
    const b = e.target.closest('.jj-pad button'); if (!b || watching || phase !== 'guess') return;
    if (b.dataset.d != null) { if (entry.length >= 4) { ctx.sfx('bad'); return; } entry = (entry === '0' ? '' : entry) + b.dataset.d; ctx.sfx('tap'); sendEntry(false); }
    else if (b.dataset.k === 'del') { entry = entry.slice(0, -1); ctx.sfx('tap'); sendEntry(false); }
    else if (b.dataset.k === 'ok' && entry) { ctx.sfx('good'); sendEntry(true); }
  });

  function drawPicture(g) {
    $('.jj-pic').innerHTML = svg(g.thing, g.n, g.look, g.fill, ctx.season);
    items = [...ui.querySelectorAll('.jj-it')];
    $('.jj-count span').textContent = NAMES[g.thing];
    $('.jj-ask').innerHTML = `How many <b>${esc(NAMES[g.thing])}</b>?`;
  }
  function startReveal(r) {
    const n = r.n, given = players.filter(p => r.guesses[p.pid] != null);
    const top = Math.max(n * 1.5, ...given.map(p => r.guesses[p.pid] * 1.08), 10);
    const lastX = [], rowOf = x => { let k = lastX.findIndex(v => x - v >= 30); if (k < 0) k = lastX.length < 4 ? lastX.length : lastX.indexOf(Math.min(...lastX)); lastX[k] = x; return k; };
    const placed = given.sort((a, b) => r.guesses[a.pid] - r.guesses[b.pid]).map(p => { const x = Math.min(93, Math.max(7, r.guesses[p.pid] / top * 100)); return { p, x, row: rowOf(x) }; });
    $('.jj-pins').style.height = (Math.max(1, lastX.length) * 42 + 8) + 'px';
    $('.jj-pins').innerHTML = placed.map(({ p, x, row }) => `
      <span class="jj-pin" data-pid="${p.pid}" style="--x:${x}%;--seat:${p.color};--row:${row}">
        <i class="jj-face">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i><b>${r.guesses[p.pid]}</b><small>${esc(p.name)}</small></span>`).join('') || '<em class="jj-none">Nobody guessed!</em>';
    $('.jj-track').style.setProperty('--top', top);
    ui.classList.add('counting');
    items.forEach(el => el.classList.remove('lit'));
    counting = { n, top, r, t0: performance.now(), shown: 0, lastTick: 0, done: false };
  }
  function finishReveal() {
    const c = counting; c.done = true; ui.classList.remove('counting');
    const r = c.r;
    $('.jj-count b').textContent = r.n; $('.jj-needle').style.left = Math.min(100, r.n / c.top * 100) + '%';
    items.forEach(el => el.classList.add('lit'));
    for (const p of players) {
      const pin = ui.querySelector(`.jj-pin[data-pid="${p.pid}"]`);
      if (pin) { pin.classList.toggle('best', r.closest.includes(p.pid)); pin.classList.toggle('exact', r.exact.includes(p.pid)); pin.classList.add('passed'); }
    }
    ui.classList.add('counted');
    ctx.sfx(r.exact.length ? 'win' : 'coins');
    paintChips(lastG);
  }
  function paintChips(g) {
    if (!g) return;
    for (const p of players) {
      const el = ui.querySelector(`.jj-players [data-pid="${p.pid}"]`); el.querySelector('.sc').textContent = g.scores[p.pid];
      const st = el.querySelector('.jj-st');
      let t = '', cls = '';
      if (g.phase === 'guess') { if (g.in.includes(p.pid)) { t = 'locked in'; cls = 'in'; } else if (g.typing.includes(p.pid)) t = 'typing…'; else t = 'thinking…'; }
      if (g.phase === 'reveal' && counting?.done) { const r = g.reveal, gu = r.guesses[p.pid]; t = gu == null ? 'no guess' : `${gu} (+${r.gain[p.pid]})`; cls = r.exact.includes(p.pid) ? 'exact' : r.closest.includes(p.pid) ? 'best' : ''; }
      st.textContent = t; st.className = 'jj-st ' + cls; el.classList.toggle('in', cls === 'in');
    }
  }
  function note(g) {
    if (g.phase === 'ready') return 'Get a good look…';
    if (g.phase === 'end') return 'All counted! Most points wins.';
    if (g.phase === 'reveal') {
      if (!counting?.done) return 'Counting…';
      const r = g.reveal, nm = pid => players.find(p => p.pid === pid)?.name || '?';
      if (r.exact.length) return `Spot on! ${r.exact.map(nm).join(' and ')} guessed exactly ${r.n}!`;
      if (r.closest.length) return `${r.closest.map(nm).join(' and ')} ${r.closest.length > 1 ? 'were' : 'was'} closest! There were ${r.n}.`;
      return `There were ${r.n} ${HW ? MANY_HW[g.thing] : NAMES[g.thing].split(' ')[0]}.`;
    }
    if (watching) return `${g.in.length} of ${players.length} locked in`;
    return ok ? 'Locked in. You can still change it.' : 'Type your guess, then press OK.';
  }

  return {
    priv(d) { if (phase === 'guess' && d.guess != null && !entry) { entry = String(d.guess); ok = d.ok; paintEntry(); } },
    state(g) {
      lastG = g;
      if (g.phase !== 'end' && (g.round !== round || !items.length)) { round = g.round; drawPicture(g); }
      if (g.phase !== phase) {
        if (g.phase === 'guess') { entry = ''; ok = false; paintEntry(); counting = null; ui.classList.remove('counting', 'counted'); $('.jj-count b').textContent = '?'; items.forEach(el => el.classList.remove('lit')); ctx.sfx('open'); }
        if (g.phase === 'reveal') startReveal(g.reveal);
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'guess' && g.left <= 5);
      $('.jj-round').textContent = g.phase === 'end' ? 'Final scores' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      if (g.phase === 'guess' && g.left <= 5 && g.left > 0 && !ok && !watching) $('.jj-entry').classList.add('nudge'); else $('.jj-entry').classList.remove('nudge');
      paintChips(g);
      $('.jj-note').textContent = note(g);
    },
    frame() {
      const c = counting; if (!c || c.done) return;
      const t = Math.min(1, (performance.now() - c.t0) / COUNT_MS), e = 1 - Math.pow(1 - t, 2.4);
      const v = Math.round(c.n * e);
      if (v !== c.shown) {
        for (let i = c.shown; i < v; i++) items[i]?.classList.add('lit');
        c.shown = v; $('.jj-count b').textContent = v;
        $('.jj-needle').style.left = Math.min(100, v / c.top * 100) + '%';
        for (const pin of ui.querySelectorAll('.jj-pin:not(.passed)')) if (+pin.querySelector('b').textContent <= v) pin.classList.add('passed');
        const now = performance.now(); if (now - c.lastTick > 90) { c.lastTick = now; ctx.sfx('tap'); }
      }
      if (t >= 1) finishReveal();
      if (lastG) $('.jj-note').textContent = note(lastG);
    },
    dispose() {},
  };
}
