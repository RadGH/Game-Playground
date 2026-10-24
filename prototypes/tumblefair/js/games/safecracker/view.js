// SAFECRACKER on a screen. A phone that plays shows its own safe: the code slots, a keypad of big number buttons, TRY
// IT, the LISTEN shortcut and the list of guesses so far with their answers (filled dots = RIGHT, rings = MOVED, and
// the counts in words, so it never rests on colour). Everyone's progress runs along the bottom: which safe they are
// on and their points. A watch-only screen (the TV) shows a card per player with the answers they have had, never the
// numbers they typed.
import { esc, chip } from '../../client/gamehud.js';

const pegs = (hit, near, len) => `<span class="sc-pegs" aria-label="${hit} right, ${near} moved">${'<i class="hit"></i>'.repeat(hit)}${'<i class="near"></i>'.repeat(near)}${'<i></i>'.repeat(Math.max(0, len - hit - near))}</span>`;
const SAFE = '<svg viewBox="0 0 100 100" aria-hidden="true"><rect x="6" y="8" width="88" height="80" rx="10" class="body"/><rect x="16" y="18" width="68" height="60" rx="6" class="door"/><circle cx="50" cy="48" r="20" class="dial"/><g class="ticks"><path d="M50 30v6M50 60v6M32 48h6M62 48h6"/></g><path d="M50 48 L50 34" class="hand"/><rect x="14" y="88" width="14" height="6" class="foot"/><rect x="72" y="88" width="14" height="6" class="foot"/></svg>';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, LV = init.levels;
  const cpu = init.cpu ? { pid: 'cpu', name: init.cpu, color: '#9fb6c2', dark: '#5a7080', shape: 'diamond', portrait: '' } : null;
  const everyone = cpu ? [...players, cpu] : players;
  ui.innerHTML = `
    <div class="sc-top"><span class="sc-title">Safecracker</span><span class="clock"><b>--</b></span></div>
    <section class="sc-mine">
      <div class="sc-head"><span class="sc-safe">${SAFE}</span><div><b class="sc-name"></b><small class="sc-info"></small></div></div>
      <div class="sc-slots"></div>
      <div class="sc-keys"></div>
      <div class="sc-row"><button class="sc-back" aria-label="Delete last number">⌫</button><button class="sc-try big-btn">Try it</button></div>
      <button class="sc-listen"><b>Listen to the tumblers</b><span class="sc-ltx"></span></button>
      <p class="sc-msg" aria-live="polite"></p>
      <ol class="sc-hist"></ol>
    </section>
    <section class="sc-wall"></section>
    <div class="sc-players">${everyone.map(p => p.pid === 'cpu' ? `<span class="chip sc-cpu" data-pid="cpu" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">NN</i><b class="nm">${esc(p.name)}</b><em class="sc-lv"></em><em class="sc-p">0</em></span>` : chip(p, '<em class="sc-lv"></em><em class="sc-p">0</em>')).join('')}</div>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.sc-players [data-pid="${me}"]`)?.classList.add('me');
  let mine = null, entry = [], lvl = -1, g0 = null, msgT = 0;

  function say(t, cls = '') { const m = $('.sc-msg'); m.textContent = t; m.className = 'sc-msg ' + cls; clearTimeout(msgT); if (t) msgT = setTimeout(() => { m.textContent = ''; }, 2800); }
  function buildSafe() {
    const L = LV[lvl]; if (!L) return;
    entry = Array(L.len).fill(null);
    $('.sc-keys').innerHTML = Array.from({ length: L.sym }, (_, i) => `<button class="sc-key" data-n="${i + 1}">${i + 1}</button>`).join('');
    $('.sc-keys').style.setProperty('--cols', L.sym <= 6 ? 3 : 4);
  }
  function paintMine() {
    if (watching || !mine) return;
    const L = LV[mine.lvl], done = !L;
    ui.classList.toggle('all-open', done);
    if (done) { $('.sc-name').textContent = 'Every safe is open!'; $('.sc-info').textContent = 'Nice work. Watch the others sweat.'; $('.sc-slots').innerHTML = ''; $('.sc-hist').innerHTML = ''; return; }
    const seen = mine.seen || {}, tries = L.tries - mine.guesses.length;
    for (const [i, v] of Object.entries(seen)) entry[+i] = v;
    $('.sc-name').textContent = `Safe ${mine.lvl + 1} of ${LV.length}`;
    $('.sc-info').textContent = `${L.len} numbers, 1 to ${L.sym}${L.rep ? ', may repeat' : ', all different'} · ${tries} ${tries === 1 ? 'try' : 'tries'} left · worth ${L.pts}`;
    $('.sc-slots').innerHTML = entry.map((v, i) => `<span class="sc-slot${i in seen ? ' known' : ''}${v == null ? '' : ' full'}">${v ?? ''}</span>`).join('');
    $('.sc-hist').innerHTML = mine.guesses.slice().reverse().map(([g, hit, near]) => `<li><b>${[...g].join(' ')}</b>${pegs(hit, near, L.len)}<small>${hit} right · ${near} moved</small></li>`).join('');
    const locked = !!mine.lock;
    ui.classList.toggle('is-locked', locked);
    ui.querySelectorAll('.sc-key').forEach(b => { b.disabled = locked || entry.every(v => v != null) || (!L.rep && entry.includes(+b.dataset.n)); });   // all-different safe: a number already in is greyed
    $('.sc-back').disabled = locked || !entry.some((v, i) => v != null && !(i in seen));
    $('.sc-try').disabled = locked || entry.some(v => v == null);
    const ls = $('.sc-listen'), max = Math.min(init.listenMax ?? L.len - 1, L.len - 1), after = init.listenAfter ?? 0, used = Object.keys(seen).length >= max;
    ls.disabled = locked || used || mine.guesses.length < after;
    $('.sc-ltx').textContent = used ? 'Used on this safe.' : mine.guesses.length < after ? `Unlocks after ${after} guesses on this safe.` : `Once a safe: one number. Costs ${init.listenCost} points and ${init.listenS} s.`;
  }
  ui.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || watching || !mine || mine.lock || !LV[mine.lvl]) return;
    const seen = mine.seen || {};
    if (b.classList.contains('sc-key')) { const i = entry.findIndex((v, j) => v == null && !(j in seen)); if (i < 0) return; entry[i] = +b.dataset.n; ctx.sfx('tap'); paintMine(); }
    else if (b.classList.contains('sc-back')) { for (let i = entry.length - 1; i >= 0; i--) if (entry[i] != null && !(i in seen)) { entry[i] = null; break; } ctx.sfx('tap'); paintMine(); }
    else if (b.classList.contains('sc-try')) { if (entry.some(v => v == null)) return; ctx.send('guess', entry.slice()); ctx.sfx('pick'); entry = entry.map((v, i) => i in seen ? v : null); paintMine(); }
    else if (b.classList.contains('sc-listen')) { ctx.send('listen'); ctx.sfx('trap'); }
  });
  function paintWall(g) {
    if (!watching) return;
    $('.sc-wall').innerHTML = players.map(p => {
      const s = g.p[p.pid]; if (!s) return '';
      const L = LV[s.lvl];
      const rows = L ? s.pegs.map(v => `<li>${pegs((v / 10) | 0, v % 10, L.len)}</li>`).join('') : '';
      return `<div class="sc-card${L ? '' : ' done'}${s.lock ? ' locked' : ''}" style="--seat:${p.color};--seat-dark:${p.dark}">${chip(p)}<b>${L ? `Safe ${s.lvl + 1}` : 'All open!'}</b><small>${L ? `${L.tries - s.n} tries left${s.listens ? ` · listened ${s.listens}×` : ''}` : ''}</small><ol>${rows}</ol></div>`;
    }).join('');
  }
  return {
    state(g) {
      g0 = g;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 10);
      for (const p of everyone) {
        const s = p.pid === 'cpu' ? g.cpu : g.p[p.pid], c = ui.querySelector(`.sc-players [data-pid="${p.pid}"]`); if (!s || !c) continue;
        c.querySelector('.sc-p').textContent = s.pts;
        c.querySelector('.sc-lv').textContent = s.lvl >= LV.length ? 'all open' : `safe ${s.lvl + 1}`;
        c.classList.toggle('locked', !!s.lock);
      }
      const best = Math.max(...everyone.map(p => (p.pid === 'cpu' ? g.cpu : g.p[p.pid])?.pts || 0));
      for (const p of everyone) ui.querySelector(`.sc-players [data-pid="${p.pid}"]`)?.classList.toggle('lead', best > 0 && ((p.pid === 'cpu' ? g.cpu : g.p[p.pid])?.pts || 0) === best);
      paintWall(g);
    },
    priv(d) {
      if (watching || d.lvl == null) return;
      const was = mine; mine = d;
      if (d.lvl !== lvl) { lvl = d.lvl; buildSafe(); }
      else if (was && Object.keys(was.seen || {}).some(k => !(k in (d.seen || {})))) entry = entry.map(() => null);   // jammed: a fresh code, the old hints are gone
      if (d.jammed && !was?.jammed) say(`Jammed! The code was ${[...d.jammed].join(' ')}. New code coming…`, 'bad');
      if (d.lock && !d.jammed && !was?.lock) say('Listening… click… click…', '');
      paintMine();
    },
    event(ev) {
      const name = ev.pid === 'cpu' ? init.cpu : players.find(p => p.pid === ev.pid)?.name || '?';
      if (ev.e === 'open') {
        if (ev.pid === me) { ctx.sfx('win'); say(`Opened! +${ev.pay}${ev.first ? ' (first!)' : ''}`, 'good'); }
        else { ctx.sfx('coins'); if (!watching && ev.first) say(`${name} opened safe ${ev.lvl + 1} first!`, ''); }
      }
      if (ev.e === 'jam' && ev.pid === me) ctx.sfx('bad');
    },
    dispose() { clearTimeout(msgT); },
  };
}
