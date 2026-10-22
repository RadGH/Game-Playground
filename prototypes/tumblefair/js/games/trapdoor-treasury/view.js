// TRAPDOOR TREASURY on a screen (round 5 art, 2026-10-22): a treasure vault stage with three painted chests standing on
// trapdoors (Codex art in assets/art/tt-*.webp), a piggy-bank safe to BANK, and each player's sack and safe. On the
// reveal every chest opens one after another: gold bursts out, or the trapdoor drops and the chest falls through.
// Who picked what is shown by their faces over the chest.
import { esc, chip } from '../../client/gamehud.js';

const ART = n => new URL(`../../../assets/art/tt-${n}.webp`, import.meta.url).href;
const LOOK = { safe: 'tin', tempting: 'oak', reckless: 'hoard' };
const RISK = r => !r ? 'Always safe' : r >= 0.5 ? 'Trapdoor: 1 in 2' : `Trapdoor: 1 in ${Math.round(1 / r)}`;

export function createView(ctx) {
  const { ui, players, me } = ctx, chests = ctx.init.chests;
  const face = p => `<i class="tt-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  ui.style.setProperty('--vault', `url(${ART('vault')})`);
  ui.innerHTML = `
    <div class="tt-top"><span class="tt-round"></span><span class="clock"><b>--</b></span></div>
    <div class="tt-chests">${chests.map((c, i) => `<button class="tt-chest tt-${c.id}" data-i="${i}">
      <span class="tt-who"></span>
      <span class="tt-pic"><img class="tt-hole" src="${ART('trapdoor')}" alt=""><img class="tt-closed" src="${ART(LOOK[c.id] + '-closed')}" alt=""><img class="tt-open" src="${ART(LOOK[c.id] + '-open')}" alt=""><span class="tt-coins">${'<i></i>'.repeat(8)}</span></span>
      <b>${esc(c.name)}</b><span class="tt-gold">${c.lo}–${c.hi} gold</span><em class="tt-risk r${Math.round(c.risk * 100)}">${RISK(c.risk)}</em>
      <strong class="out"></strong></button>`).join('')}</div>
    <button class="tt-bank" data-i="bank"><img src="${ART('safe')}" alt=""><span><b>BANK my sack</b><small>Safe for good, but you skip this chest round</small></span><span class="tt-who"></span></button>
    <div class="tt-players">${players.map(p => chip(p, `<span class="tt-psack"><img src="${ART('sack')}" alt="sack"><em class="sack">0</em></span><span class="tt-pbank"><img src="${ART('safe')}" alt="safe"><em class="bank">0</em></span><strong class="delta"></strong>`)).join('')}</div>
    <p class="tt-note"></p>`;
  const $ = s => ui.querySelector(s), row = pid => ui.querySelector(`.tt-players [data-pid="${pid}"]`);
  let mine = null, phase = '', shownRound = 0;
  ui.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b || me == null || phase !== 'pick') return; const i = b.dataset.i === 'bank' ? 'bank' : +b.dataset.i; ctx.send('pick', i); mine = i; paintMine(); ctx.sfx('tap'); });
  const paintMine = () => { for (const b of ui.querySelectorAll('[data-i]')) b.classList.toggle('mine', String(mine) === b.dataset.i); };
  if (me == null) ui.classList.add('watching');
  const timers = [];
  return {
    priv(d) { mine = d.pick; paintMine(); },
    state(g) {
      const fresh = g.phase !== phase;
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.tt-round').textContent = g.last ? `LAST ROUND! Bank now or lose your sack!` : `Round ${g.round} of ${ctx.init.rounds}`;
      $('.clock b').textContent = g.phase === 'pick' ? g.left : '';
      for (const p of players) {
        const r = row(p.pid); r.querySelector('.sack').textContent = g.sack[p.pid]; r.querySelector('.bank').textContent = g.bank[p.pid];
        r.classList.toggle('in', g.phase === 'pick' && g.in.includes(p.pid));
        const o = g.reveal?.out[p.pid]; const d = r.querySelector('.delta');
        d.textContent = !o ? '' : o.pick === 'bank' ? (o.d ? `banked ${o.d}` : 'banked') : o.trap ? (o.d ? `fell in! ${o.d}` : 'fell in!') : `+${o.d}`;
        d.className = 'delta ' + (!o ? '' : o.trap ? 'bad' : 'good');
      }
      const boxes = ui.querySelectorAll('.tt-chest');
      if (g.phase === 'reveal' && fresh) {
        // open them one after another, the safest first, so the gold hoard is the last (and loudest) surprise
        boxes.forEach((b, i) => {
          const c = g.reveal.chests[i];
          b.querySelector('.out').textContent = '';
          timers.push(setTimeout(() => {
            b.classList.add(c.trap ? 'trap' : 'open');
            b.querySelector('.out').textContent = c.trap ? 'TRAPDOOR!' : `${c.loot} gold`;
            const picked = players.some(p => g.reveal.out[p.pid].pick === i);
            if (picked) ctx.sfx(c.trap ? 'trap' : 'coins'); else ctx.sfx(c.trap ? 'bad' : 'pick');
          }, 350 + i * 750));
        });
      }
      if (g.phase === 'pick' && (fresh || shownRound !== g.round)) {
        shownRound = g.round; while (timers.length) clearTimeout(timers.pop());
        boxes.forEach(b => { b.classList.remove('open', 'trap'); b.querySelector('.out').textContent = ''; });
      }
      boxes.forEach((b, i) => { b.querySelector('.tt-who').innerHTML = g.reveal ? players.filter(p => g.reveal.out[p.pid].pick === i).map(face).join('') : ''; });
      $('.tt-bank .tt-who').innerHTML = g.reveal ? players.filter(p => g.reveal.out[p.pid].pick === 'bank').map(face).join('') : '';
      $('.tt-note').textContent = me == null ? 'Watching.' : g.phase === 'pick' ? (mine == null ? 'Pick a chest, or bank what is in your sack.' : 'Locked in. You can still change your mind.') : '';
      if (g.phase === 'pick' && !g.in.includes(me)) { mine = null; paintMine(); }
    },
    dispose() { while (timers.length) clearTimeout(timers.pop()); },
  };
}
