// TREASURE MAP BLUFF on a screen: a parchment map drawn in SVG — camp at the bottom, four winding routes (A-D) to four
// landmarks. On a phone that plays, your two known routes show what is there (chest / trap / nothing); the other two
// show "?". Tap a landmark to pick that route, then lock in. Under the map, the claims feed (everyone's canned lines,
// with faces) and a "say something" builder: choose a route letter, then a line. The reveal opens every route, lines up
// each player's face at the route they took with the gold won or lost, and stamps every claim TRUE or FIB.
import { chip, esc } from '../../client/gamehud.js';
import { CLAIMS, LETTERS, claimText } from './sim.js';

const INK = '#3b2414';
const DEST = [{ x: 62, y: 62, name: 'Crooked Creek' }, { x: 158, y: 44, name: 'Bat Cave' }, { x: 248, y: 44, name: 'Rope Bridge' }, { x: 340, y: 62, name: 'Skull Rock' }];
const PATHS = ['M200 256 C150 250 70 240 90 190 S40 130 62 106', 'M200 256 C190 230 120 210 150 160 S170 110 158 88', 'M200 256 C215 225 280 210 250 160 S230 110 248 88', 'M200 256 C250 250 330 240 310 190 S360 130 340 106'];
const LAND = [
  `<path d="M30 70 q16 -10 32 0 t32 0" fill="none" stroke="#3d8bff" stroke-width="5" stroke-linecap="round"/><path d="M34 80 q14 -8 28 0 t28 0" fill="none" stroke="#7fb8ff" stroke-width="3" stroke-linecap="round"/>`,
  `<path d="M128 56 q30 -44 60 0 z" fill="#5a4a3a" stroke="${INK}" stroke-width="3"/><path d="M144 56 q14 -20 28 0 z" fill="#1d1410"/><path d="M150 30 l6 -4 l2 4 l2 -4 l6 4 l-8 2 z" fill="${INK}"/>`,
  `<path d="M220 52 h56 M220 58 h56" stroke="#8a5225" stroke-width="3"/><path d="M222 52 v-14 M274 52 v-14" stroke="#8a5225" stroke-width="4"/><path d="M222 40 q26 14 52 0" fill="none" stroke="#c9a46a" stroke-width="2"/>${[0, 1, 2, 3, 4, 5].map(i => `<path d="M${226 + i * 9} 52 v6" stroke="#6b4518" stroke-width="3"/>`).join('')}`,
  `<path d="M312 70 q-4 -34 28 -36 q32 2 28 36 z" fill="#d8d0c0" stroke="${INK}" stroke-width="3"/><circle cx="330" cy="54" r="5" fill="${INK}"/><circle cx="350" cy="54" r="5" fill="${INK}"/><path d="M334 66 h12" stroke="${INK}" stroke-width="3"/>`,
];
// what a route holds, as a small picture + a word (never colour alone)
const THING = {
  gold: `<g><rect x="-13" y="-6" width="26" height="16" rx="3" fill="#b9773a" stroke="${INK}" stroke-width="2.5"/><path d="M-13 -6 q13 -12 26 0" fill="#d9a520" stroke="${INK}" stroke-width="2.5"/><circle cx="0" cy="0" r="3" fill="#ffd23f" stroke="${INK}" stroke-width="1.5"/></g>`,
  trap: `<g><path d="M-14 6 h28" stroke="${INK}" stroke-width="3"/><path d="M-12 6 l3 -12 l3 8 l3 -10 l3 10 l3 -8 l3 12" fill="#c8c8d0" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>`,
  empty: `<g><path d="M-9 -7 l18 14 M9 -7 l-18 14" stroke="#8a7a60" stroke-width="4" stroke-linecap="round"/></g>`,
  unknown: `<text x="0" y="8" text-anchor="middle" font-size="22" font-weight="900" fill="${INK}">?</text>`,
};
const WORD = { gold: 'TREASURE', trap: 'TRAP', empty: 'nothing' };
const PARROT = `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#3ecf5a"/><path d="M20 10 q8 2 6 10 l-6 -3 z" fill="#ffd23f" stroke="#0d2228" stroke-width="1.5"/><circle cx="15" cy="12" r="3" fill="#fff" stroke="#0d2228" stroke-width="1.5"/><circle cx="15.5" cy="12" r="1.3" fill="#0d2228"/><path d="M8 22 q8 -6 16 2" fill="#ff5f5f" stroke="#0d2228" stroke-width="1.5"/></svg>`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const who = [...players, ...(init.cpu ? [{ pid: init.cpu.pid, name: init.cpu.name, color: '#3ecf5a', dark: '#1d8a37', shape: 'circle', portrait: '', cpu: true }] : [])];
  const byId = new Map(who.map(p => [String(p.pid), p]));
  const face = p => p?.cpu ? `<i class="tm-face tm-parrot">${PARROT}</i>` : `<i class="tm-face" style="--seat:${p?.color || '#999'}">${p?.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  ui.innerHTML = `
    <div class="tm-top"><span class="tm-round">Treasure Map Bluff</span><span class="clock"><b>--</b></span></div>
    <div class="tm-chips">${who.map(p => p.cpu ? `<span class="chip tm-cpu" data-pid="${p.pid}" style="--seat:${p.color};--seat-dark:${p.dark}"><i class="face">${PARROT}</i><b class="nm">${esc(p.name)}</b><em class="sc">0</em><strong class="delta"></strong></span>` : chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <div class="tm-map">
      <svg viewBox="0 0 400 300" class="tm-svg" role="group" aria-label="the treasure map">
        <defs><filter id="tm-rough"><feTurbulence baseFrequency=".04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="6"/></filter></defs>
        <path d="M8 14 L392 6 L396 290 L6 296 Z" fill="#f2deb0" stroke="${INK}" stroke-width="4" filter="url(#tm-rough)"/>
        <path d="M20 250 q30 -20 60 -8 M330 260 q20 -16 50 -6 M180 120 q20 -10 40 0" fill="none" stroke="#d9bf86" stroke-width="3"/>
        ${LAND.join('')}
        ${PATHS.map((d, i) => `<path class="tm-path" data-r="${i}" d="${d}" fill="none" stroke="${INK}" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>`).join('')}
        <g class="tm-camp"><path d="M184 274 l16 -24 l16 24 z" fill="#e8434f" stroke="${INK}" stroke-width="3"/><path d="M200 250 v24" stroke="${INK}" stroke-width="2"/><text x="200" y="287" text-anchor="middle" font-size="11" font-weight="900" fill="${INK}">CAMP</text></g>
        ${DEST.map((d, i) => `<g class="tm-dest" data-r="${i}" transform="translate(${d.x} ${d.y + 58})" role="button" tabindex="0" aria-label="Route ${LETTERS[i]}, ${d.name}">
          <circle r="27" class="tm-node"/><text class="tm-letter" x="-22" y="-16" text-anchor="middle">${LETTERS[i]}</text><g class="tm-thing">${THING.unknown}</g>
          <text class="tm-word" y="40" text-anchor="middle"></text><g class="tm-who" transform="translate(0 -40)"></g></g>`).join('')}
      </svg>
    </div>
    <div class="tm-act"><button class="tm-lock big-btn">Lock in</button></div>
    <div class="tm-feed" aria-live="polite"></div>
    <div class="tm-say">
      <div class="tm-say-h">Say something <small class="tm-left"></small></div>
      <div class="tm-rsel">${[...LETTERS].map((l, i) => `<button class="tm-r" data-r="${i}" aria-label="about route ${l}">${l}</button>`).join('')}</div>
      <div class="tm-lines">${Object.entries(CLAIMS).map(([k, c]) => `<button class="tm-line${c.r ? ' needs-r' : ''}" data-k="${k}">${esc(c.r ? c.text.replace('{R}', '…') : c.text)}</button>`).join('')}</div>
    </div>
    <p class="tm-note"></p>`;
  const $ = s => ui.querySelector(s);
  const dests = [...ui.querySelectorAll('.tm-dest')];
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (me != null) ui.querySelector(`.tm-chips [data-pid="${me}"]`)?.classList.add('me');
  let privRound = -1, phase = '', round = -1, see = null, pick = null, locked = false, said = 0, rsel = 0, shown = -1, lastClaims = 0;

  function paintMap(rv) {
    dests.forEach((el, r) => {
      const c = rv ? rv.content[r] : see && see[r] != null ? see[r] : 'unknown';
      el.querySelector('.tm-thing').innerHTML = THING[c];
      el.querySelector('.tm-word').textContent = c === 'unknown' ? '' : (rv ? '' : 'you saw: ') + WORD[c];
      el.dataset.c = c; el.classList.toggle('mine', pick === r && !rv); el.classList.toggle('known', !!(see && see[r] != null));
      const wh = rv ? who.filter(p => rv.picks[p.pid] === r) : [];
      el.querySelector('.tm-who').innerHTML = wh.map((p, i) => `<g transform="translate(${(i - (wh.length - 1) / 2) * 24} 0)"><circle r="11" fill="${p.color}" stroke="${INK}" stroke-width="2"/><text y="4" text-anchor="middle" font-size="10" font-weight="900" fill="#fff">${esc((p.name || '?').slice(0, 2))}</text></g>`).join('');
    });
    ui.querySelectorAll('.tm-path').forEach((el, r) => el.classList.toggle('mine', pick === r && !rv));
  }
  function paintMe() {
    const l = $('.tm-lock'); l.textContent = locked ? 'Locked! (tap to change)' : pick == null ? 'Tap a route on the map' : `Lock in route ${LETTERS[pick]}`; l.classList.toggle('on', locked); l.disabled = pick == null;
    $('.tm-left').textContent = `${init.maxClaims - said} of ${init.maxClaims} left`;
    ui.querySelectorAll('.tm-line').forEach(b => { b.disabled = said >= init.maxClaims; });
    ui.querySelectorAll('.tm-r').forEach(b => b.classList.toggle('on', +b.dataset.r === rsel));
    ui.querySelectorAll('.tm-line.needs-r').forEach(b => { b.textContent = claimText(b.dataset.k, rsel); });
  }
  function paintFeed(list, stamped) {
    const feed = $('.tm-feed');
    feed.innerHTML = list.length ? list.slice(-8).map(([id, k, r, ok]) => {
      const p = byId.get(String(id)), st = ok == null || ok === -1 ? '' : ok ? '<b class="tm-true">TRUE</b>' : '<b class="tm-fib">FIB!</b>';
      return `<div class="tm-claim${String(id) === String(me) ? ' me' : ''}">${face(p)}<span><small>${esc(p?.name || '?')}</small>${esc(claimText(k, r))}</span>${st}</div>`;
    }).join('') : `<p class="tm-quiet">${stamped ? 'Nobody said a word.' : 'No claims yet…'}</p>`;
  }
  ui.addEventListener('click', e => {
    if (watching || phase !== 'plan') return;
    const d = e.target.closest('.tm-dest'), b = e.target.closest('button');
    if (d) { pick = +d.dataset.r; locked = false; ctx.send('pick', pick); ctx.sfx('pick'); paintMap(null); paintMe(); return; }
    if (!b) return;
    if (b.classList.contains('tm-lock')) { if (pick == null) return; locked = !locked; ctx.send('lock', locked); ctx.sfx(locked ? 'good' : 'tap'); paintMe(); }
    else if (b.classList.contains('tm-r')) { rsel = +b.dataset.r; ctx.sfx('tap'); paintMe(); }
    else if (b.classList.contains('tm-line') && said < init.maxClaims) { const k = b.dataset.k; ctx.send('say', CLAIMS[k].r ? { k, r: rsel } : { k }); said++; ctx.sfx('tap'); paintMe(); }
  });
  ui.addEventListener('keydown', e => { const d = e.target.closest?.('.tm-dest'); if (d && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); d.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  function note(g) {
    if (g.phase === 'ready') return watching ? 'Everyone holds a piece of the map…' : 'Your piece of the map shows two routes. Look closely!';
    if (g.phase === 'end') return init.solo ? (g.scores[me] > g.scores[init.cpu.pid] ? `You out-bluffed ${init.cpu.name}!` : g.scores[me] === g.scores[init.cpu.pid] ? `A draw with ${init.cpu.name}.` : `${init.cpu.name} got the better of you.`) : 'The map is used up. Richest explorer wins!';
    if (g.phase === 'reveal') { const r = g.reveal, gold = r.content.indexOf('gold'), n = Object.values(r.picks).filter(x => x === gold).length; return `The treasure was on ${LETTERS[gold]}! ${n === 0 ? 'Nobody found it.' : n === 1 ? 'One explorer takes the whole pot!' : `Split ${n} ways.`}`; }
    if (watching) return `${g.picked.length} of ${players.length} have picked a route`;
    return pick == null ? 'Tap a landmark to pick that route.' : locked ? 'Locked in. Waiting for the others…' : 'Lock in when you are sure. Claims can be true… or not.';
  }
  return {
    priv(d) {
      if (phase !== 'plan' || !d || d.see == null) return;
      privRound = d.round; see = d.see; pick = d.pick; locked = d.locked; said = d.said; paintMap(null); paintMe();
    },
    state(g) {
      if (g.round !== round && g.phase === 'plan') { round = g.round; lastClaims = 0; if (privRound !== g.round) { see = null; pick = null; locked = false; said = 0; } paintMap(null); paintMe(); }
      if (g.phase !== phase) {
        if (g.phase === 'reveal' && shown !== g.round) { shown = g.round; const mine = me != null ? g.reveal.gain[me] : null; ctx.sfx(mine == null ? 'coins' : mine > 0 ? 'coins' : mine < 0 ? 'trap' : 'tap'); }
        if (g.phase === 'end') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'plan' && g.left <= 4);
      $('.tm-round').textContent = g.phase === 'end' ? 'Final count' : g.phase === 'reveal' ? 'Reveal!' : `Round ${Math.max(0, g.round) + 1} of ${init.rounds}`;
      if (g.phase === 'reveal') { paintMap(g.reveal); paintFeed(g.reveal.claims, true); }
      else if (g.phase === 'plan') { paintFeed(g.claims, false); if (g.claims.length > lastClaims) { if (lastClaims || g.claims.length) ctx.sfx('tap'); lastClaims = g.claims.length; } }
      else if (g.phase === 'end') { paintFeed([], true); $('.tm-feed').innerHTML = ''; }
      const best = Math.max(...Object.values(g.scores));
      for (const p of who) {
        const el = ui.querySelector(`.tm-chips [data-pid="${p.pid}"]`); if (!el) continue;
        el.querySelector('.sc').textContent = g.scores[p.pid];
        el.classList.toggle('lead', g.scores[p.pid] === best && best > 0);
        el.classList.toggle('in', g.phase === 'plan' && (g.in || []).includes(p.pid));
        const d = el.querySelector('.delta'), gain = g.reveal?.gain[p.pid];
        d.textContent = g.phase === 'reveal' ? (gain > 0 ? `+${gain}` : gain < 0 ? `${gain} trap!` : g.reveal.picks[p.pid] == null ? 'camp' : '0') : g.phase === 'plan' && !p.cpu ? ((g.in || []).includes(p.pid) ? 'locked' : (g.picked || []).includes(p.pid) ? 'picked' : '…') : '';
        d.className = 'delta ' + (gain > 0 ? 'good' : gain < 0 ? 'bad' : '');
      }
      $('.tm-note').textContent = note(g);
    },
    dispose() {},
  };
}
