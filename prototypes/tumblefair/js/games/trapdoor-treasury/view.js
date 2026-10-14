// TRAPDOOR TREASURY on a screen: three chests to tap (and BANK), who has chosen, then the reveal.
import { h, esc, chip } from '../../client/gamehud.js';

export function createView(ctx) {
  const { ui, players, me } = ctx, chests = ctx.init.chests;
  ui.innerHTML = `
    <div class="tt-top"><span class="tt-round"></span><span class="clock"><b>--</b></span></div>
    <div class="tt-chests">${chests.map((c, i) => `<button class="tt-chest tt-${c.id}" data-i="${i}"><i class="lid"></i><b>${esc(c.name)}</b><span>${c.lo}–${c.hi} gold</span><em>${c.risk ? Math.round(c.risk * 100) + '% trapdoor' : 'always safe'}</em><u class="who"></u><strong class="out"></strong></button>`).join('')}</div>
    <button class="tt-bank big-btn" data-i="bank">BANK my sack<u class="who"></u></button>
    <div class="tt-players">${players.map(p => chip(p, '<em class="sack" title="sack">0</em><em class="bank" title="banked">0</em><strong class="delta"></strong>')).join('')}</div>
    <p class="tt-note"></p>`;
  const $ = s => ui.querySelector(s), row = pid => ui.querySelector(`.tt-players [data-pid="${pid}"]`);
  let mine = null, phase = '';
  ui.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b || me == null || phase !== 'pick') return; const i = b.dataset.i === 'bank' ? 'bank' : +b.dataset.i; ctx.send('pick', i); mine = i; paintMine(); ctx.sfx('tap'); });
  const paintMine = () => { for (const b of ui.querySelectorAll('[data-i]')) b.classList.toggle('mine', String(mine) === b.dataset.i); };
  if (me == null) ui.classList.add('watching');
  return {
    priv(d) { mine = d.pick; paintMine(); },
    state(g) {
      if (g.phase !== phase && g.phase === 'reveal') ctx.sfx(Object.values(g.reveal.out).some(o => o.trap) ? 'trap' : 'coins');
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.tt-round').textContent = g.last ? `LAST ROUND — bank now or lose your sack!` : `Round ${g.round} of ${ctx.init.rounds}`;
      $('.clock b').textContent = g.phase === 'pick' ? g.left : '';
      for (const p of players) {
        const r = row(p.pid); r.querySelector('.sack').textContent = g.sack[p.pid]; r.querySelector('.bank').textContent = g.bank[p.pid];
        r.classList.toggle('in', g.phase === 'pick' && g.in.includes(p.pid));
        const o = g.reveal?.out[p.pid]; const d = r.querySelector('.delta');
        d.textContent = !o ? '' : o.pick === 'bank' ? (o.d ? `banked ${o.d}` : 'banked') : o.trap ? (o.d ? `TRAPDOOR ${o.d}` : 'TRAPDOOR') : `+${o.d}`;
        d.className = 'delta ' + (!o ? '' : o.trap ? 'bad' : 'good');
      }
      ui.querySelectorAll('.tt-chest').forEach((b, i) => {
        const c = g.reveal?.chests[i];
        b.classList.toggle('open', !!c); b.classList.toggle('trap', !!c?.trap);
        b.querySelector('.out').textContent = !c ? '' : c.trap ? 'TRAPDOOR!' : `${c.loot} gold`;
        b.querySelector('.who').innerHTML = g.reveal ? players.filter(p => g.reveal.out[p.pid].pick === i).map(p => `<i class="dot" style="background:${p.color}"></i>`).join('') : '';
      });
      $('.tt-bank .who').innerHTML = g.reveal ? players.filter(p => g.reveal.out[p.pid].pick === 'bank').map(p => `<i class="dot" style="background:${p.color}"></i>`).join('') : '';
      $('.tt-note').textContent = me == null ? 'Watching.' : g.phase === 'pick' ? (mine == null ? 'Pick a chest, or bank what is in your sack.' : 'Locked in. You can still change your mind.') : '';
      if (g.phase === 'pick' && !g.in.includes(me)) { mine = null; paintMine(); }
    },
    dispose() {},
  };
}
