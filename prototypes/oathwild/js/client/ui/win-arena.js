// The arena's board (brainstorm 2026-11-27 §2c-§2g): two tabs in one window.
//   Brackets — every bracket by level range, marked Fair / Hard / Easy for YOUR hero (never locked), what a win and a
//              first clear bring, the bosses that may come out; pick one, then Start (looking is apart from starting,
//              lessons rule 47).
//   Champions — the ten ranks to the Grand Champion: who they are, what beating them gives (a title on your name and
//              their own unique item — the full card), what opens the next one; Challenge; the titles you can wear.
//
//   app.openWindow('arena', { kind: 'arena' | 'ladder', … the server's view }) → .win-arena  ([data-tab], [data-pick],
//   [data-act="start"], [data-act="challenge"], [data-honor])
import { openWin, esc } from './kit.js';
import { glyph } from './icons.js';
import { itemCardHtml } from './tip.js';
import { fmt } from '../../../../../shared/format.js';

const MARK = { fair: ['Your level', 'fair'], hard: ['Hard — under its levels', 'hard'], easy: ['Easy — above its levels', 'easy'] };

export function open(app, data = {}) {
  app.arenaBoard = app.arenaBoard || {};
  const st = app.arenaBoard;
  if (data.kind === 'ladder') st.ladder = data; else st.board = data;
  const tab = data.kind === 'ladder' ? 'champions' : 'brackets';
  const w = openWin({
    id: 'arena', title: 'The Bracket Board', cls: 'win-arena', size: 'wide', tab,
    tabs: [{ id: 'brackets', label: 'Brackets', icon: glyph('sword', 16) }, { id: 'champions', label: 'Champions', icon: glyph('star', 16) }],
    render: (body, t, w) => (t === 'champions' ? champions(app, st, w) : brackets(app, st, w)),
    foot: (el, w) => foot(app, st, el, w),
  });
  w.tab = tab; w.render();
  // the other tab's numbers come from the server the first time it is opened
  w.el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab === 'champions' && !st.ladder) app.act('arena-ladder');
    if (b.dataset.tab === 'brackets' && !st.board) app.act('arena-board');
    if (b.dataset.pick) { if (w.tab === 'champions') st.champ = b.dataset.pick; else st.bracket = b.dataset.pick; w.render(); }
    if (b.dataset.honor != null) app.act('arena-title', { title: b.dataset.honor });
  });
  if (!w.data.follows) { w.data.follows = true; w.follow(app, 'arenaView', () => JSON.stringify([app.arena?.state, app.arena?.wave])); }
  return w;
}

function busyLine(v) {
  if (!v || v.state === 'idle' || !v.state) return '';
  return `<div class="ar-busy">${glyph('sword', 18)}<span><b>A match is on:</b> ${esc(v.name || 'a match')}${v.kind === 'champion' ? '' : ` — wave ${fmt(Math.max(1, v.wave))} of ${fmt(v.of)}`}. The board opens again when it ends.</span></div>`;
}

function brackets(app, st, w) {
  const B = st.board;
  if (!B) return '<p class="ow-empty">Reading the board…</p>';
  const sel = B.brackets.find(b => b.id === st.bracket) || B.brackets.find(b => b.mark === 'fair') || B.brackets[0];
  st.bracket = sel.id;
  const card = b => `<button type="button" class="ar-card mark-${b.mark}" data-pick="${esc(b.id)}" aria-pressed="${b.id === sel.id}">
      <span class="ar-card-name"><b>${esc(b.name)}</b><small>Levels ${fmt(b.levels[0])}–${fmt(b.levels[1])}</small></span>
      <span class="ar-chip ${MARK[b.mark][1]}">${esc(MARK[b.mark][0])}</span>
      <span class="ar-card-won">${b.clears ? `${glyph('check', 14)} Won ${fmt(b.clears)}×` : '<i>Not won yet</i>'}</span>
    </button>`;
  const lv = sel.levels;
  return `${busyLine(B.busy || app.arena)}
    <div class="ar-split">
      <div class="ar-list" role="listbox" aria-label="Brackets">${B.brackets.map(card).join('')}</div>
      <div class="ar-detail" data-scroll-key="ar-detail">
        <h3>${esc(sel.name)} <small>levels ${fmt(lv[0])}–${fmt(lv[1])}</small></h3>
        <p class="ar-mark ${MARK[sel.mark][1]}">${sel.mark === 'hard' ? `You are level ${fmt(B.level)}: these monsters stand above you. You may still try.` : sel.mark === 'easy' ? `You are level ${fmt(B.level)}: above this bracket. Rewards roll at its level.` : `You are level ${fmt(B.level)}: a fair fight.`}</p>
        <ol class="ar-waves">${waveLines(app, sel).join('')}</ol>
        <p class="ar-note">${fmt(sel.kinds)} kinds of monster from the open world. A 20 s breather between waves; the water-bearers restore you. More heroes, more monsters.</p>
        <div class="ar-reward"><h4>${glyph('coin', 16)} A win brings</h4>
          <ul><li>A reward chest for each hero: 2 pieces of gear of level ${fmt(Math.min(lv[1], B.level > lv[1] ? lv[1] : Math.max(B.level, lv[0])))} and gold</li>
          ${sel.first ? '<li class="ow-gold">First clear: one more piece, a magic one or better for sure, and extra gold</li>' : ''}
          <li>Experience for every monster, as in the open world</li>
          ${B.next ? '' : ''}</ul></div>
        <p class="ar-note">Lose (everyone down) and you are back in the court with the experience you earned, but no chest.</p>
      </div>
    </div>`;
}

/** One line per wave, from data/arena.json (the same table the server's match reads). */
function waveLines(app, b) {
  const W = app.rules.data.arena.waves, [lo, hi] = b.levels;
  return W.list.map((r, i) => {
    const lv = Math.round(lo + (hi - lo) * (r.level || 0));
    const what = [r.normals ? `${fmt(r.normals)} monster${r.normals > 1 ? 's' : ''}` : '', r.brute ? 'a brute (a tough one)' : '', r.boss ? `a boss (${esc(b.bosses.slice(0, 2).join(' or '))}…)` : ''].filter(Boolean).join(' + ');
    return `<li><b>Wave ${fmt(i + 1)}</b> ${what} · level ${fmt(lv)}</li>`;
  });
}

function champions(app, st, w) {
  const Lr = st.ladder;
  if (!Lr) return '<p class="ow-empty">Asking the Arena Master…</p>';
  const list = Lr.champions;
  const sel = list.find(c => c.id === st.champ) || list.find(c => c.open && !c.beaten) || list.find(c => !c.beaten) || list[0];
  st.champ = sel.id;
  app.itemCache = app.itemCache || new Map();
  for (const c of list) if (c.unique) app.itemCache.set(c.unique.id, c.unique);
  const row = c => `<button type="button" class="ar-rank${c.beaten ? ' beaten' : c.open ? ' open' : ' locked'}" data-pick="${esc(c.id)}" aria-pressed="${c.id === sel.id}">
      <span class="ar-rank-n">${fmt(c.rank)}</span>
      <span class="ar-card-name"><b>${esc(c.name)}</b><small>${esc(c.epithet)} · level ${fmt(c.level)}</small></span>
      <span class="ar-chip ${c.beaten ? 'easy' : c.open ? 'fair' : 'hard'}">${c.beaten ? 'Beaten' : c.open ? 'Ready' : 'Locked'}</span>
    </button>`;
  return `${busyLine(Lr.busy || app.arena)}
    <div class="ar-titles"><span>Your rank: <b>${Lr.rank ? `${fmt(Lr.rank)} of 10 beaten` : 'none yet'}</b></span>
      ${Lr.titles.length ? `<span class="ar-title-list">Title shown: ${Lr.titles.map(t => `<button type="button" class="ow-btn ow-small${t === Lr.title ? ' ow-primary' : ''}" data-honor="${esc(t)}" aria-pressed="${t === Lr.title}">${esc(t)}</button>`).join('')}<button type="button" class="ow-btn ow-small${!Lr.title ? ' ow-primary' : ''}" data-honor="" aria-pressed="${!Lr.title}">None</button></span>` : ''}</div>
    <div class="ar-split">
      <div class="ar-list" role="listbox" aria-label="Champions">${list.map(row).join('')}</div>
      <div class="ar-detail" data-scroll-key="ar-champ">
        <h3>${esc(sel.name)} <small>${esc(sel.epithet)}</small></h3>
        <p class="ar-note">Rank ${fmt(sel.rank)} · level ${fmt(sel.level)} · ${esc(sel.classes.join(' / '))}. Fights like a hero: abilities, rolls, a red mark before every big blow.</p>
        ${sel.greet ? `<blockquote>“${esc(sel.greet)}”</blockquote>` : ''}
        <p class="ar-mark ${sel.beaten ? 'easy' : sel.open ? 'fair' : 'hard'}">${sel.beaten ? 'Beaten. A rematch gives gold and experience only.' : sel.open ? 'Ready when you are. With friends they fight harder (more health).' : esc(sel.why || '')}</p>
        <div class="ar-reward"><h4>${glyph('star', 16)} Beat them for</h4>
          <ul><li>The title <b class="ow-gold">${esc(sel.title)}</b>, shown with your name</li><li>Their own unique item:</li></ul>
          <div class="ar-unique">${sel.unique ? itemCardHtml(app, `item:${sel.unique.id}`) : ''}</div>
        </div>
      </div>
    </div>`;
}

function foot(app, st, el, w) {
  const v = app.arena;
  const busy = v && v.state && v.state !== 'idle';
  if (w.tab === 'champions') {
    const c = st.ladder?.champions.find(x => x.id === st.champ);
    el.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-act="close">Close</button><button type="button" class="ow-btn ow-primary" data-act="challenge" data-primary ${!c || !c.open || busy ? 'disabled' : ''}>${glyph('sword', 18)}<span>${c ? `Challenge ${esc(c.name.split(' ')[0])}` : 'Challenge'}</span></button>`;
  } else {
    const b = st.board?.brackets.find(x => x.id === st.bracket);
    el.innerHTML = `<button type="button" class="ow-btn ow-ghost" data-act="close">Close</button><button type="button" class="ow-btn ow-primary" data-act="start" data-primary ${!b || busy ? 'disabled' : ''}>${glyph('sword', 18)}<span>${b ? `Start ${esc(b.name)}` : 'Start'}</span></button>`;
  }
  el.querySelector('[data-act="close"]').onclick = () => w.close();
  el.querySelector('[data-act="start"]')?.addEventListener('click', () => { app.act('arena-start', { bracket: st.bracket }); w.close(); });
  el.querySelector('[data-act="challenge"]')?.addEventListener('click', () => { app.act('arena-start', { champion: st.champ }); w.close(); });
}
