// WORD RELAY on a screen: a big letter tile and the rule card on top, the chain of words so far under it (each word's
// last letter lit, because that is where the next one starts), then — on a phone that plays — one big text box and a
// SEND button, with live ticks as you type (starts with the letter? obeys the rule?). Every good word pops up with
// the player's face and its points; a refused word says why, only on that player's phone.
import { esc, chip } from '../../client/gamehud.js';
import { RULE, clean } from './sim.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const cpu = init.cpu ? { pid: 'cpu', name: init.cpu, color: '#c9a36b', dark: '#7a5a2c', shape: 'diamond', portrait: '' } : null;
  const everyone = cpu ? [...players, cpu] : players, byId = new Map(everyone.map(p => [String(p.pid), p]));
  ui.innerHTML = `
    <div class="wr-top"><span class="wr-title">Word Relay</span><span class="clock"><b>--</b></span></div>
    <section class="wr-prompt"><div class="wr-letter"><small>starts with</small><b>?</b></div>
      <div class="wr-rule"><small>Rule</small><b></b><em></em></div></section>
    <div class="wr-chain"></div>
    <form class="wr-form" autocomplete="off">
      <input class="wr-in" type="text" maxlength="${init.max}" inputmode="text" enterkeyhint="send" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="Type a word…" aria-label="Your word">
      <button class="wr-send big-btn" type="submit">Send</button>
      <div class="wr-checks"><span class="ck ck-l"></span><span class="ck ck-r"></span></div>
      <p class="wr-msg" aria-live="polite"></p>
    </form>
    <div class="wr-got"></div>
    <div class="wr-timer"></div>
    <div class="wr-players">${everyone.map(p => p.pid === 'cpu' ? `<span class="chip wr-cpu" data-pid="cpu" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">🦉</i><b class="nm">${esc(p.name)}</b><em class="wr-p">0</em></span>` : chip(p, '<em class="wr-p">0</em>')).join('')}</div>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.wr-players [data-pid="${me}"]`)?.classList.add('me');
  const box = $('.wr-in');
  let g0 = null, link = -1, mineIn = false, msgTimer = 0, drawn = '';

  function checks() {
    if (watching || !g0) return;
    const raw = box.value.trim().toLowerCase(), w = clean(raw), L = g0.letter, r = RULE[g0.rule];
    const l = $('.ck-l'), k = $('.ck-r');
    const okL = !!w && w[0] === L, okR = !!w && r.test(w);
    l.className = 'ck ck-l' + (raw ? okL ? ' ok' : ' bad' : ''); l.textContent = `${raw ? okL ? '✓' : '✗' : '•'} starts with ${L.toUpperCase()}`;
    k.className = 'ck ck-r' + (raw ? okR ? ' ok' : ' bad' : ''); k.textContent = `${raw ? okR ? '✓' : '✗' : '•'} ${r.short}`;
  }
  function say(text, cls) { const m = $('.wr-msg'); m.textContent = text; m.className = 'wr-msg ' + (cls || ''); clearTimeout(msgTimer); if (text) msgTimer = setTimeout(() => { m.textContent = ''; }, 2600); }
  box.addEventListener('input', checks);
  $('.wr-form').addEventListener('submit', e => {
    e.preventDefault();
    if (watching || !g0 || g0.phase !== 'go' || mineIn) return;
    const w = box.value.trim(); if (!w) { ctx.sfx('bad'); return; }
    ctx.send('word', w.slice(0, 40)); ctx.sfx('tap'); box.focus();
  });
  // the chain: earlier words small, the newest big, each word's last letter lit
  const wordHtml = (w, by, skip) => { const p = by != null ? byId.get(String(by)) : null;
    return `<span class="wr-link${skip ? ' skip' : ''}" ${p ? `style="--seat:${p.color}"` : ''}>${p ? `<i class="face">${p.portrait ? `<img src="${p.portrait}" alt="">` : p.pid === 'cpu' ? '🦉' : ''}</i>` : ''}<b>${esc(w.slice(0, -1))}<u>${esc(w.slice(-1))}</u></b></span>`; };

  return {
    state(g) {
      g0 = g;
      if (g.link !== link) { link = g.link; mineIn = false; if (!watching) { box.value = ''; box.disabled = false; } }
      ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 10);
      $('.wr-letter b').textContent = g.letter.toUpperCase();
      const back = g.prev && g.prev[g.prev.length - 1] !== g.letter;
      $('.wr-letter small').textContent = back ? `(${g.prev.slice(-1).toUpperCase()} is too hard) starts with` : 'starts with';
      $('.wr-rule b').textContent = RULE[g.rule].text;
      $('.wr-rule em').textContent = g.ruleLeft <= 1 ? 'New rule after this word!' : `New rule in ${g.ruleLeft} words`;
      const ck = JSON.stringify([g.chain, g.got]); if (ck !== drawn) { drawn = ck;
      $('.wr-chain').innerHTML = g.chain.map(([w, by, skip], i) => (i ? '<i class="wr-arrow">→</i>' : '') + wordHtml(w, by, skip)).join('');
      $('.wr-got').innerHTML = g.got.map(([k, w, p, f]) => { const pl = byId.get(String(k)); return `<span class="wr-word${f ? ' first' : ''}" style="--seat:${pl?.color || '#999'}"><i class="face">${pl?.portrait ? `<img src="${pl.portrait}" alt="">` : k === 'cpu' ? '🦉' : ''}</i><b>${esc(w)}</b><em>+${p}${f ? ' first!' : ''}</em></span>`; }).join(''); }   // (rebuilt only when it changes, so the pop-in plays once)
      $('.wr-timer').textContent = g.phase === 'show' ? 'Next word…' : g.close != null ? `${g.close} s left to add yours!` : g.linkLeft != null && g.linkLeft <= 6 ? `${g.linkLeft} s, then a new letter` : '';
      for (const p of everyone) { const e = ui.querySelector(`.wr-players [data-pid="${p.pid}"] .wr-p`); if (e) e.textContent = g.pts[p.pid] ?? 0; }
      const best = Math.max(...Object.values(g.pts));
      for (const p of everyone) ui.querySelector(`.wr-players [data-pid="${p.pid}"]`)?.classList.toggle('lead', best > 0 && g.pts[p.pid] === best);
      mineIn = g.got.some(([k]) => k === me);
      if (!watching) {
        ui.classList.toggle('is-in', mineIn);
        $('.wr-send').disabled = mineIn || g.phase !== 'go';
        $('.wr-send').textContent = mineIn ? 'Scored!' : 'Send';
        box.placeholder = mineIn ? 'Scored! Wait…' : g.phase === 'go' ? `${g.letter.toUpperCase()}…` : 'Next word…';
        checks();
      }
    },
    event(ev) {
      if (ev.e === 'yes') {
        if (ev.k === me) { ctx.sfx('good'); say(`"${ev.w}" +${ev.p}${ev.first ? ' (first!)' : ''}`, 'good'); box.value = ''; }
        else ctx.sfx(ev.first ? 'pick' : 'coins');
      }
      if (ev.e === 'no') { ctx.sfx('bad'); say(`"${ev.w}": ${ev.why}`, 'bad'); box.select?.(); }
    },
    dispose() { clearTimeout(msgTimer); },
  };
}
