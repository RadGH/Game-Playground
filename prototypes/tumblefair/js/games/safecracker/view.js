// SAFECRACKER on a screen (Expansion 1 rework). A phone that plays shows its own safe: a big dial with a pointer on
// top, a lamp that reads Cold / Cool / Warm / Hot! / CLICK! (words AND a colour, never colour alone), the three number
// slots (filled as you set them) and one row of thumb buttons: ◀◀ 5, ◀ 1, SET, ▶ 1, ▶▶ 5 (hold an arrow to keep
// turning). Everyone's safes count along the bottom. A watch-only screen (the TV) shows a card per player: safes open
// and how many numbers into the next one — never their dial.
import { esc, chip } from '../../client/gamehud.js';

const WORDS = ['Cold', 'Cool', 'Warm', 'Hot!', 'CLICK!'];
const HEAT = ['#6aa6ff', '#9fd3ff', '#ffd25a', '#ff8a3d', '#3ee07a'];

function dialSvg(n) {
  let ticks = '';
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, big = i % 5 === 0, r1 = big ? 70 : 76, x1 = 100 + Math.sin(a) * r1, y1 = 100 - Math.cos(a) * r1, x2 = 100 + Math.sin(a) * 84, y2 = 100 - Math.cos(a) * 84;
    ticks += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" class="${big ? 'big' : ''}"/>`;
    if (big) ticks += `<text x="${(100 + Math.sin(a) * 57).toFixed(1)}" y="${(100 - Math.cos(a) * 57 + 6).toFixed(1)}">${i}</text>`;
  }
  return `<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="92" class="rim"/><g class="sc-face">${ticks}<circle cx="100" cy="100" r="30" class="knob"/></g><path d="M100 2 L90 20 H110 Z" class="ptr"/></svg>`;
}

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, N = init.dial || 40, LEN = init.len || 3;
  const cpu = init.cpu ? { pid: 'cpu', name: init.cpu, color: '#9fb6c2', dark: '#5a7080', shape: 'diamond', portrait: '' } : null;
  const everyone = cpu ? [...players, cpu] : players;
  ui.innerHTML = `
    <div class="sc-top"><span class="sc-title">Safecracker</span><span class="clock"><b>--</b></span></div>
    <section class="sc-mine">
      <p class="sc-goal">Turn until it says <b>CLICK!</b> then press <b>SET</b></p>
      <div class="sc-dialwrap"><div class="sc-dial">${dialSvg(N)}</div><div class="sc-read"><b class="sc-num">0</b><span class="sc-lamp">Cold</span></div></div>
      <div class="sc-slots">${Array.from({ length: LEN }, () => '<span class="sc-slot"></span>').join('')}</div>
      <div class="sc-pad">
        <button class="sc-turn" data-d="-5" aria-label="Turn left five">◀◀<small>5</small></button>
        <button class="sc-turn" data-d="-1" aria-label="Turn left one">◀<small>1</small></button>
        <button class="sc-set big-btn">SET</button>
        <button class="sc-turn" data-d="1" aria-label="Turn right one">▶<small>1</small></button>
        <button class="sc-turn" data-d="5" aria-label="Turn right five">▶▶<small>5</small></button>
      </div>
      <p class="sc-msg" aria-live="polite"></p>
    </section>
    <section class="sc-wall"></section>
    <div class="sc-players">${everyone.map(p => p.pid === 'cpu' ? `<span class="chip sc-cpu" data-pid="cpu" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">NN</i><b class="nm">${esc(p.name)}</b><em class="sc-p">0</em></span>` : chip(p, '<em class="sc-p">0</em>')).join('')}</div>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.sc-players [data-pid="${me}"]`)?.classList.add('me');
  let mine = null, msgT = 0, holdT = 0, holdI = 0, dialShown = 0, lastHeat = -1;

  function say(t, cls = '') { const m = $('.sc-msg'); m.textContent = t; m.className = 'sc-msg ' + cls; clearTimeout(msgT); if (t) msgT = setTimeout(() => { m.textContent = ''; }, 2200); }
  function paintMine() {
    if (watching || !mine) return;
    const heat = mine.heat ?? 0;
    // the dial turns so the number under the pointer is the one you are on (shortest way round, so it never spins back)
    let want = -mine.dial / N * 360; while (want - dialShown > 180) want -= 360; while (want - dialShown < -180) want += 360; dialShown = want;
    $('.sc-face').style.transform = `rotate(${dialShown}deg)`;
    $('.sc-num').textContent = mine.dial;
    const lamp = $('.sc-lamp'); lamp.textContent = WORDS[heat]; lamp.style.setProperty('--heat', HEAT[heat]);
    ui.classList.toggle('sc-click', heat === 4); ui.style.setProperty('--heat', HEAT[heat]);
    if (heat === 4 && lastHeat !== 4) ctx.sfx('tap');
    lastHeat = heat;
    const slots = ui.querySelectorAll('.sc-slot');
    slots.forEach((s, i) => { s.textContent = mine.set?.[i] ?? ''; s.classList.toggle('full', mine.set?.[i] != null); s.classList.toggle('now', i === mine.step); });
    ui.classList.toggle('is-locked', !!mine.lock);
    ui.querySelectorAll('.sc-pad button').forEach(b => { b.disabled = !!mine.lock; });
  }
  const turn = d => { if (!mine || mine.lock) return; ctx.send('turn', d); };
  function stopHold() { clearTimeout(holdT); clearInterval(holdI); holdT = holdI = 0; }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.sc-turn'); if (!b || watching) return;
    e.preventDefault(); stopHold(); const d = +b.dataset.d; turn(d);
    holdT = setTimeout(() => { holdI = setInterval(() => turn(Math.sign(d)), 95); }, 320);   // hold = keep turning one notch at a time
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) ui.addEventListener(ev, stopHold);
  ui.addEventListener('click', e => {
    const b = e.target.closest('.sc-set'); if (!b || watching || !mine || mine.lock) return;
    ctx.send('set'); ctx.sfx('pick');
  });
  function paintWall(g) {
    if (!watching) return;
    $('.sc-wall').innerHTML = everyone.map(p => {
      const s = p.pid === 'cpu' ? g.cpu : g.p[p.pid]; if (!s) return '';
      const dots = Array.from({ length: LEN }, (_, i) => `<i class="${i < s.step ? 'on' : ''}"></i>`).join('');
      return `<div class="sc-card${s.lock ? ' locked' : ''}" style="--seat:${p.color};--seat-dark:${p.dark}">${p.pid === 'cpu' ? `<b class="nm">${esc(p.name)}</b>` : chip(p)}<b>${s.safes} ${s.safes === 1 ? 'safe' : 'safes'}</b><span class="sc-dots" aria-label="${s.step} of ${LEN} numbers set">${dots}</span></div>`;
    }).join('');
  }
  return {
    state(g) {
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.left <= 10);
      let best = 0;
      for (const p of everyone) { const s = p.pid === 'cpu' ? g.cpu : g.p[p.pid]; if (s) best = Math.max(best, s.safes); }
      for (const p of everyone) {
        const s = p.pid === 'cpu' ? g.cpu : g.p[p.pid], c = ui.querySelector(`.sc-players [data-pid="${p.pid}"]`); if (!s || !c) continue;
        c.querySelector('.sc-p').textContent = s.safes;
        c.classList.toggle('locked', !!s.lock); c.classList.toggle('lead', best > 0 && s.safes === best);
      }
      paintWall(g);
    },
    priv(d) { if (watching || d.dial == null) return; mine = d; paintMine(); },
    event(ev) {
      if (ev.e === 'open') {
        if (ev.pid === me) { ctx.sfx('win'); say(`Safe open! That's ${ev.safes}.`, 'good'); }
        else if (!watching && ev.pid === 'cpu') { ctx.sfx('coins'); say(`${init.cpu} opened safe ${ev.safes}!`); }
      }
      if (ev.e === 'num') { ctx.sfx('good'); say('Got one! Find the next number.', 'good'); }
      if (ev.e === 'jam') { ctx.sfx('bad'); say('Not that one. Jammed!', 'bad'); }
    },
    dispose() { clearTimeout(msgT); stopHold(); },
  };
}
