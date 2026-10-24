// "My games" (round 10, reports #28 "I want to see my like history" and #29 "my play count"): every minigame this
// player has played, how many times, and their latest 👍/👎 with its reasons. The list lives in the player's profile on
// the server (js/sim/profiles.js `history`: a guest by its token, a signed-in player by `acct:<user id>`, so it follows
// an account onto any phone). Opened from the ☰ menu. Asks the server with `{ t: 'mygames' }`, which answers
// `{ t: 'mygames', list: [{ id, n, last, v, why }] }`.
//
//   const myGames = createMyGames({ net, games: GAMES, reasons: RATE_REASONS, sfx });   myGames.open();
//
// A reason id that is no longer in RATE_REASONS (an older rating) is simply not shown. The whole sheet scrolls (the
// modal does), never a box inside it — a scrolling box inside a panel blanks the 3D canvas behind it on phones.
import { h, esc } from './gamehud.js';

const ART = new URL('../../assets/art/', import.meta.url).href;
const FILTERS = [['all', 'All'], ['up', '👍 Liked'], ['down', '👎 Not for me'], ['none', 'Not rated']];
const SORTS = [['recent', 'Recent'], ['most', 'Most played'], ['az', 'A–Z']];

/** Pure: the rows to draw, filtered and sorted. Exported for tests. */
export function myGamesRows(list, { games, reasons, filter = 'all', sort = 'recent' }) {
  const label = (v, k) => (v > 0 ? reasons.up : reasons.down).find(r => r[0] === k)?.[1] || null;
  let rows = (list || []).filter(r => games[r.id]).map(r => ({
    id: r.id, title: games[r.id].meta.title, card: games[r.id].meta.card, n: r.n || 0, last: r.last || 0, v: r.v || 0,
    why: (r.why || []).map(k => label(r.v, k)).filter(Boolean),
  }));
  if (filter === 'up') rows = rows.filter(r => r.v > 0); else if (filter === 'down') rows = rows.filter(r => r.v < 0); else if (filter === 'none') rows = rows.filter(r => !r.v);
  if (sort === 'most') rows.sort((a, b) => b.n - a.n || b.last - a.last);
  else if (sort === 'az') rows.sort((a, b) => a.title.localeCompare(b.title));
  else rows.sort((a, b) => b.last - a.last);
  return rows;
}
/** Pure: the totals line. */
export function myGamesTotals(list, games) {
  const known = (list || []).filter(r => games[r.id]);
  return { plays: known.reduce((a, r) => a + (r.n || 0), 0), tried: known.filter(r => r.n > 0).length, of: Object.keys(games).length, up: known.filter(r => r.v > 0).length, down: known.filter(r => r.v < 0).length };
}
const ago = t => {
  if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return 'just now'; if (s < 86400) return 'today'; if (s < 172800) return 'yesterday';
  return `${Math.floor(s / 86400)} days ago`;
};

export function createMyGames({ net, games, reasons, sfx = () => {} }) {
  if (!document.querySelector('link[data-mygames]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../css/mygames.css', import.meta.url).href; l.dataset.mygames = '1'; document.head.append(l); }
  let el = null, list = null, filter = 'all', sort = 'recent';
  net.on('mygames', m => { list = Array.isArray(m.list) ? m.list : []; draw(); });
  function draw() {
    if (!el) return;
    const body = el.querySelector('.mg-body');
    if (!list) { body.innerHTML = '<p class="note">Loading…</p>'; return; }
    const T = myGamesTotals(list, games), rows = myGamesRows(list, { games, reasons, filter, sort });
    el.querySelector('.mg-totals').innerHTML = T.plays
      ? `<b>${T.plays}</b> ${T.plays === 1 ? 'play' : 'plays'} · <b>${T.tried}</b> of ${T.of} minigames tried · 👍 ${T.up} · 👎 ${T.down}`
      : 'No minigames played yet. Play a match and they show up here!';
    el.querySelectorAll('[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === filter));
    el.querySelectorAll('[data-s]').forEach(b => b.classList.toggle('on', b.dataset.s === sort));
    body.innerHTML = rows.length ? `<ul class="mg-list">${rows.map(r => `<li class="mg-row${r.v > 0 ? ' up' : r.v < 0 ? ' down' : ''}" data-game="${esc(r.id)}">
        <img src="${ART}${esc(r.card)}.webp" alt="" onerror="this.style.visibility='hidden'">
        <div class="mg-main"><b class="mg-title">${esc(r.title)}</b>
          <small>Played ${r.n === 1 ? 'once' : r.n === 2 ? 'twice' : `${r.n} times`}${r.last ? ` · ${ago(r.last)}` : ''}</small>
          ${r.why.length ? `<span class="mg-why">${r.why.map(w => `<i>${esc(w)}</i>`).join('')}</span>` : ''}</div>
        <span class="mg-v" aria-label="${r.v > 0 ? 'liked' : r.v < 0 ? 'not for me' : 'not rated'}">${r.v > 0 ? '👍' : r.v < 0 ? '👎' : '–'}</span></li>`).join('')}</ul>`
      : `<p class="note">${list.length ? 'Nothing here with this filter.' : ''}</p>`;
  }
  function close() { el?.remove(); el = null; }
  function open() {
    close();
    el = h('div', 'modal mygames');
    el.innerHTML = `<div class="panel"><div class="row mg-head"><h2>My games</h2><button class="btn small" data-x="1">Close</button></div>
      <p class="mg-totals"></p>
      <div class="mg-pills">${FILTERS.map(([k, t]) => `<button class="pill" data-f="${k}">${t}</button>`).join('')}</div>
      <div class="mg-pills">${SORTS.map(([k, t]) => `<button class="pill" data-s="${k}">${t}</button>`).join('')}</div>
      <div class="mg-body"></div>
      <p class="note">Your plays and ratings are kept with your character. Sign in to keep them on every device.</p></div>`;
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-x]')) { sfx('tap'); close(); return; }
      const f = e.target.closest('[data-f]')?.dataset.f, s = e.target.closest('[data-s]')?.dataset.s;
      if (f) { filter = f; sfx('tap'); draw(); } else if (s) { sort = s; sfx('tap'); draw(); }
    });
    document.body.append(el);
    list = null; draw(); net.send({ t: 'mygames' });
  }
  return { open, close, get isOpen() { return !!el; } };
}
