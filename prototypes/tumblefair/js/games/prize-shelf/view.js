// GONE MISSING! on a screen: a striped prize stall (awning, wooden shelves) with the prizes standing in rows, a big
// "do this now" line, and under it the TRAY of prizes to choose from. While you study, a countdown. Then a rolling
// shutter rattles down over the stall, and goes up again with puffs of sparkles where the vanished prizes stood (on
// Normal and Tricky the rest have been shuffled round). Tap the missing ones in the tray; each tap shows ✓ or ✗ at
// once. The reveal puts the vanished prizes back with a glow and every player's face over the tray prizes they chose.
// Halloween: a haunted stall (purple stripes, cobwebs, a moon) and the Halloween prize pictures (looks only).
import { chip } from '../../client/gamehud.js';
import { createJuice } from '../../client/juice.js';
import { prizeSvg, prizeName } from '../memory-icons.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, HW = ctx.season === 'halloween';
  const P = new Map(players.map(p => [p.pid, p]));
  ui.innerHTML = `
    <div class="ps-top"><span class="ps-title">${HW ? 'Gone Ghostly!' : 'Gone Missing!'}</span><span class="clock"><b>--</b></span></div>
    <div class="ps-board">${players.map(p => chip(p, '<em class="sc">0</em><strong class="st"></strong>')).join('')}</div>
    <div class="ps-stall"><div class="ps-awning"></div><div class="ps-shelf"></div><div class="ps-shutter"><b>${HW ? '👻' : '★'}</b></div></div>
    <div class="ps-now"></div>
    <div class="ps-tray"></div>
    <p class="ps-note"></p>`;
  const $ = s => ui.querySelector(s), juice = createJuice(ctx);
  ui.classList.toggle('watching', watching);
  if (me != null) ui.querySelector(`.ps-board [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', round = -1, mine = [], drawnShelf = '', drawnTray = '', last = null;
  const cols = size => (size === 9 || size === 6 ? 3 : 4);
  function shelf(items, size, { glow = [] } = {}) {
    const key = items.join() + '|' + glow.join(); if (key === drawnShelf) return; drawnShelf = key;
    const el = $('.ps-shelf'); el.style.setProperty('--cols', cols(size)); el.style.setProperty('--rowsN', Math.ceil(size / cols(size)));
    el.innerHTML = Array.from({ length: Math.ceil(size / cols(size)) * cols(size) }, (_, i) => {
      const p = items[i];
      if (p == null) return '<span class="ps-slot empty"></span>';
      if (p < 0) return '<span class="ps-slot gap"><i class="ps-puff"></i></span>';
      return `<span class="ps-slot${glow.includes(p) ? ' glow' : ''}" title="${prizeName(p, HW)}">${prizeSvg(p, HW)}</span>`;
    }).join('');
  }
  function tray(g) {
    const picks = g.picks || {}, key = g.tray.join() + '|' + mine.join() + '|' + JSON.stringify(picks) + (g.gone || []).join();
    if (key === drawnTray) return; drawnTray = key;
    $('.ps-tray').innerHTML = g.tray.map((p, i) => {
      const mineHit = mine.includes(i), right = g.gone ? g.gone.includes(p) : null, faces = Object.entries(picks).filter(([, a]) => a.includes(i)).map(([pid]) => P.get(+pid)).filter(Boolean);
      const cls = ['ps-pick', mineHit ? 'mine' : '', mineHit && mine.ok?.[i] === true ? 'right' : '', mineHit && mine.ok?.[i] === false ? 'wrong' : '', right ? 'answer' : right === false ? 'decoy' : ''].join(' ');
      return `<button class="${cls}" data-i="${i}">${prizeSvg(p, HW)}<b>${prizeName(p, HW)}</b><i class="ps-mark"></i>${faces.length ? `<span class="ps-faces">${faces.map(f => `<i style="--seat:${f.color}">${f.portrait ? `<img src="${f.portrait}" alt="">` : ''}</i>`).join('')}</span>` : ''}</button>`;
    }).join('');
  }
  function now(text, cls = '') { const e = $('.ps-now'); e.textContent = text; e.className = 'ps-now ' + cls; }
  ui.addEventListener('pointerdown', e => {
    const b = e.target.closest('.ps-pick'); if (!b || watching || phase !== 'pick') return;
    e.preventDefault(); const i = +b.dataset.i; if (mine.includes(i) || mine.length >= (mine.need || 0)) return;
    ctx.send('pick', i); ctx.sfx('tap'); b.classList.add('press');
  });
  const onKey = e => { if (watching || e.repeat || phase !== 'pick') return; const k = +e.key; const b = ui.querySelectorAll('.ps-pick')[k - 1]; if (k >= 1 && b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); };
  addEventListener('keydown', onKey);
  function paint(g) {
    for (const p of players) {
      const c = ui.querySelector(`.ps-board [data-pid="${p.pid}"]`); if (!c) continue;
      c.querySelector('.sc').textContent = g.sc[p.pid];
      c.querySelector('.st').textContent = g.phase === 'pick' ? '●'.repeat(g.np?.[p.pid] || 0) + '○'.repeat(Math.max(0, g.need - (g.np?.[p.pid] || 0))) : '';
    }
    const best = Math.max(0, ...Object.values(g.sc)); for (const p of players) ui.querySelector(`.ps-board [data-pid="${p.pid}"]`)?.classList.toggle('lead', g.sc[p.pid] === best && best > 0);
  }
  const word = k => (k === 1 ? 'prize' : 'prizes');
  return {
    state(g) {
      last = g;
      if (g.round !== round) { round = g.round; mine = []; mine.ok = {}; drawnShelf = ''; drawnTray = ''; }
      mine.need = g.need;
      if (g.phase !== phase) {
        if (g.phase === 'shut') { ctx.sfx('throw'); juice.shake(0.05, 0.3); }
        if (g.phase === 'pick') ctx.sfx('pick');
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      const round1 = `Shelf ${g.round + 1} of ${init.rounds}`;
      if (g.phase === 'ready') { now(watching ? 'Roll up, roll up!' : 'Get ready to LOOK!', 'look'); $('.ps-shelf').innerHTML = ''; drawnShelf = ''; }
      else if (g.phase === 'study') { shelf(g.shelf, g.size); now(`LOOK! Remember every prize… ${g.left}`, 'look'); $('.ps-tray').innerHTML = ''; drawnTray = ''; }
      else if (g.phase === 'shut') now(HW ? 'Lights out… something is vanishing!' : 'Shutter down… something is vanishing!', 'look');
      else if (g.phase === 'pick') {
        shelf(g.rest, g.size); tray(g);
        const left = g.need - mine.length;
        now(watching ? `What's gone? ${g.need} ${word(g.need)}!` : left > 0 ? `TAP the ${left} missing ${word(left)}!` : 'Done! Wait for the others…', left > 0 || watching ? 'go' : '');
      } else if (g.phase === 'reveal') {
        shelf(g.shelf, g.size, { glow: g.gone }); tray(g);
        now(`It was: ${g.gone.map(p => prizeName(p, HW)).join(', ')}`, 'reveal');
      } else if (g.phase === 'end') {
        now('Stall closed!', 'go');
        const s = g.sc[me] ?? 0, m = init.medals;
        $('.ps-note').textContent = init.solo && me != null ? `${s} of ${init.max} points — ${s >= m[2] ? 'GOLD medal!' : s >= m[1] ? 'SILVER medal!' : s >= m[0] ? 'BRONZE medal!' : `bronze needs ${m[0]}`}` : 'Points: 3 for each missing prize found, +1 for finding it first.';
      }
      if (g.phase !== 'end') $('.ps-note').textContent = g.phase === 'pick' || g.phase === 'study' ? round1 + (init.shuffle && g.phase === 'study' ? ' — the shelf gets shuffled!' : '') : '';
      $('.clock b').textContent = g.left; $('.clock').classList.toggle('hurry', g.phase === 'pick' && g.left <= 3);
      ui.classList.toggle('can-tap', g.phase === 'pick' && !watching && mine.length < g.need);
      paint(g);
    },
    event(ev) {
      if ((ev.e === 'right' || ev.e === 'wrong') && ev.pid === me) {
        if (!mine.includes(ev.i)) mine.push(ev.i);
        mine.ok[ev.i] = ev.e === 'right'; drawnTray = ''; if (last?.tray) tray(last);
        if (ev.e === 'right') { ctx.sfx('good'); juice.flash('#7dff8a', 200); juice.say(ev.first ? '+4 Found it first!' : '+3 Found it!', 900); }
        else { ctx.sfx('bad'); juice.flash('#ff5f5f', 200); juice.say('Not that one!', 800); }
      } else if (ev.e === 'reveal') ctx.sfx('coins');
    },
    frame(dt, t) { juice.frame(dt, t); },
    dispose() { removeEventListener('keydown', onKey); juice.dispose(); },
  };
}
