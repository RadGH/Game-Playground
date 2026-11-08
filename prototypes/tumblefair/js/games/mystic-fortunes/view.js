// MYSTIC FORTUNES on a screen. A phone that plays sees Mabel's mood, the fortune it is writing (for whom) with each
// blank as a big button, and under it the six cards for the chosen blank (a ★ marks the ones that suit Mabel's mood);
// picking a card fills the blank and moves on to the next empty one. Then the crystal ball reads each fortune: the
// words appear and every card flips in, one after another. The vote and the reveal are a list of fortune cards.
import { esc, chip } from '../../client/gamehud.js';
import { CARDS, MOODS, KIND_NAMES, pieces } from './cards.js';

const FLIP_MS = 900;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p])), nm = pid => byPid.get(pid)?.name || '?';
  const moodWord = MOODS[init.mood];
  ui.innerHTML = `
    <div class="mf-top"><span class="mf-title">Mystic Fortunes</span><span class="clock"><b>--</b></span></div>
    <p class="mf-mood"><span class="mf-mabel" aria-hidden="true"></span><span>Mabel's mood: <b>${esc(moodWord)}</b> <i class="mf-star">★</i></span></p>
    <section class="mf-write">
      <div class="mf-paper"><small class="mf-for"></small><p class="mf-sent"></p></div>
      <p class="mf-ask"></p>
      <div class="mf-hand"></div>
      <button class="mf-done big-btn">Done!</button>
    </section>
    <section class="mf-wait"><p class="mf-shout">Fortunes are being written…</p><div class="mf-writers">${players.map(p => chip(p, '<em class="st">writing…</em>')).join('')}</div></section>
    <section class="mf-read"><div class="mf-ball"><i class="mf-glow"></i><b class="mf-rfor"></b></div><p class="mf-rsent"></p><small class="mf-rno"></small></section>
    <section class="mf-gallery"><p class="mf-ghead"></p><div class="mf-cards"></div></section>
    <div class="mf-players">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <p class="mf-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (init.solo) ui.classList.add('solo');
  if (me != null) ui.querySelector(`.mf-players [data-pid="${me}"]`)?.classList.add('me');

  let phase = 'ready', mine = null, myVote = null, P = null, sel = 0, done = false, list = null, cur = -1, cards = [];

  const cardText = (k, c) => CARDS[k][c].text;
  const fits = (k, c) => CARDS[k][c].tags.includes(init.mood);
  /** A fortune as HTML: words plus each blank as a chip (a button while writing). */
  function sentHtml(t, picks, { buttons = false, flip = false, autoB = [] } = {}) {
    let n = 0;
    return pieces(t, picks).map(p => {
      if (p.blank == null) return `<span>${esc(p.text)}</span>`;
      const txt = p.text == null ? KIND_NAMES[p.kind] : p.cap ? p.text[0].toUpperCase() + p.text.slice(1) : p.text;
      const cls = `mf-blank${p.text == null ? ' empty' : ''}${buttons && p.blank === sel ? ' sel' : ''}${p.card >= 0 && fits(p.kind, p.card) ? ' fit' : ''}${autoB.includes(p.blank) ? ' auto' : ''}`;
      const star = p.card >= 0 && fits(p.kind, p.card) ? '<i class="mf-star">★</i>' : '';
      return buttons ? `<button class="${cls}" data-b="${p.blank}">${esc(txt)}${star}</button>`
        : `<b class="${cls}${flip ? ' flip' : ''}" style="--d:${(n++) * FLIP_MS + 500}ms">${esc(txt)}${star}</b>`;
    }).join('');
  }
  function paintWrite() {
    if (watching || !P) return;
    $('.mf-for').innerHTML = init.solo ? 'Your own fortune' : `A fortune for <b>${esc(nm(P.for))}</b>`;
    $('.mf-sent').innerHTML = sentHtml(P.t, P.pick, { buttons: true });
    const ks = pieces(P.t).filter(x => x.blank != null).map(x => x.kind), k = ks[sel];
    $('.mf-ask').innerHTML = `Pick a card for <b>${esc(KIND_NAMES[k])}</b>`;
    $('.mf-hand').innerHTML = P.hand[sel].map(c => `<button class="mf-card-w${P.pick[sel] === c ? ' on' : ''}${fits(k, c) ? ' fit' : ''}" data-c="${c}"><span>${esc(cardText(k, c))}</span>${fits(k, c) ? `<i class="mf-star" title="Mabel likes this">★</i>` : ''}</button>`).join('');
    const full = P.pick.every(c => c >= 0), d = $('.mf-done');
    d.disabled = !full; d.textContent = done ? 'Done! (tap to change)' : full ? 'Done!' : 'Fill every blank';
    d.classList.toggle('on', done); ui.classList.toggle('is-done', done);
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'fill' && P) {
      if (t.dataset.b != null) { sel = +t.dataset.b; ctx.sfx('tap'); paintWrite(); return; }
      if (t.dataset.c != null) {
        const c = +t.dataset.c; P.pick[sel] = P.pick[sel] === c ? -1 : c; done = false;
        ctx.send('pick', { b: sel, c: P.pick[sel] }); ctx.sfx('pick');
        if (P.pick[sel] >= 0) { const next = P.pick.findIndex(x => x < 0); if (next >= 0) sel = next; }
        paintWrite(); return;
      }
      if (t.classList.contains('mf-done') && P.pick.every(c => c >= 0)) { done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); paintWrite(); }
      return;
    }
    if (phase === 'vote' && t.dataset.vote != null) {
      const v = +t.dataset.vote; if (v === mine) { ctx.sfx('bad'); return; }
      myVote = v; ctx.send('vote', v); ctx.sfx('pick'); paintVotes();
    }
  });

  function readOne(i) {
    const f = list[i]; if (!f) return;
    $('.mf-rfor').textContent = init.solo ? 'Your future…' : `${nm(f.for)}'s future…`;
    $('.mf-rsent').innerHTML = sentHtml(f.t, f.c, { flip: true, autoB: f.auto });
    $('.mf-rno').textContent = `Fortune ${i + 1} of ${list.length}${f.auto.length ? ' · the spirits filled in a blank' : ''}`;
    const ball = $('.mf-ball'); ball.classList.remove('go'); void ball.offsetWidth; ball.classList.add('go');
    ctx.sfx('open');
  }
  function buildGallery() {
    $('.mf-cards').innerHTML = list.map((f, i) => `
      <button class="mf-fcard" data-vote="${i}"><span class="mf-fhead"><b>For ${esc(nm(f.for))}</b><em class="mf-flag"></em></span>
        <p>${sentHtml(f.t, f.c, { autoB: f.auto })}</p>
        <span class="mf-fout"><span class="mf-by"></span><span class="mf-vt"></span><strong class="mf-pts"></strong></span></button>`).join('');
    cards = [...ui.querySelectorAll('.mf-fcard')];
    paintVotes();
  }
  function paintVotes() {
    cards.forEach((c, i) => {
      const own = i === mine && !init.solo, picked = myVote === i;
      c.classList.toggle('mine', own); c.classList.toggle('picked', picked);
      c.querySelector('.mf-flag').textContent = own ? 'you wrote this' : picked ? '✓ your vote' : '';
    });
  }
  const face = p => `<i class="mf-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : ''}</i>`;
  function paintReveal(r, scores) {
    const best = Math.max(...Object.values(scores));
    cards.forEach((c, i) => {
      const pid = r.by[i], p = byPid.get(pid); if (!p) return;
      c.querySelector('.mf-by').innerHTML = 'by ' + chip(p, pid === me ? '<em class="you">you</em>' : '');
      const voters = Object.entries(r.votes).filter(([, v]) => v === i).map(([q]) => byPid.get(+q)).filter(Boolean);
      c.querySelector('.mf-vt').innerHTML = init.solo ? '' : voters.length ? voters.map(face).join('') : '<em>no votes</em>';
      c.classList.toggle('fav', r.favourite === pid);
      c.querySelector('.mf-pts').textContent = `+${scores[pid]}`;
      c.classList.toggle('best', !init.solo && best > 0 && Object.values(scores).filter(v => v === best).length === 1 && scores[pid] === best);
    });
  }
  function note(g) {
    if (g.phase === 'ready') return 'Mystic Mabel shuffles her cards…';
    if (g.phase === 'fill') {
      if (watching) return `${g.done.length} of ${players.length} done`;
      if (init.solo) return `2 points a blank, +3 a card Mabel likes (★ ${moodWord}).`;
      return done ? 'Done! Waiting for the others…' : 'Make it funny! A ★ card pleases Mabel (+2 for her favourite).';
    }
    if (g.phase === 'read') return 'The crystal ball speaks…';
    if (g.phase === 'vote') return watching ? `Vote on your phones! ${g.voted.length} of ${players.length} voted` : myVote == null ? 'Tap the funniest fortune (not your own).' : 'Vote in. You can still change it.';
    if (!g.list?.length) return 'Nobody wrote a fortune! The crystal ball is cloudy.';
    if (init.solo) return `Your score: ${g.scores[players[0].pid]} of 15 (2 a blank, +3 a ★ card).`;
    return '3 points a vote · +1 for filling every blank · +2 Mabel\'s favourite';
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.mf-players [data-pid="${p.pid}"]`); if (!el) continue;
      el.querySelector('.sc').textContent = g.scores ? g.scores[p.pid] : 0;
      el.classList.toggle('in', g.phase === 'vote' && g.voted.includes(p.pid));
      const w = ui.querySelector(`.mf-writers [data-pid="${p.pid}"]`);
      if (w && g.phase === 'fill') { const d = g.done.includes(p.pid); w.classList.toggle('in', d); w.querySelector('.st').textContent = d ? 'done!' : `${g.filled[p.pid]} picked`; }
    }
  }

  return {
    priv(d) {
      if (!P && d.hand) { P = { for: d.for, t: d.t, hand: d.hand, pick: d.pick.slice() }; sel = Math.max(0, P.pick.findIndex(c => c < 0)); }
      done = d.done; mine = d.mine; myVote = d.vote;
      if (phase === 'fill' || phase === 'ready') paintWrite(); else if (cards.length) paintVotes();
    },
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'fill') { ctx.sfx('open'); paintWrite(); }
        if (g.phase === 'vote') ctx.sfx('pick');
        if (g.phase === 'reveal') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.list && !list) { list = g.list; buildGallery(); }
      if (g.phase === 'read' && g.cur !== cur) { cur = g.cur; readOne(cur); }
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'fill' && g.left <= 8);
      $('.mf-ghead').textContent = g.phase === 'vote' ? 'Which fortune is funniest?' : g.phase === 'reveal' && list?.length ? (init.solo ? 'Your fortune' : 'The votes are in!') : '';
      if (g.phase === 'reveal' && g.reveal && cards.length) paintReveal(g.reveal, g.scores);
      paintChips(g);
      $('.mf-note').textContent = note(g);
    },
    frame() {},
    dispose() {},
  };
}
