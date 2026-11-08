// FUNHOUSE MIRRORS on a screen. A phone that plays sees the face it was handed inside a wavy mirror and a grid of big
// − / + controls under it (Tall, Wide, Bulge, Twist, Wobble, Tint, Prop), a "Surprise me!" button and "Done!".
// Every change sends the WHOLE warp (seven small whole numbers) and redraws at once. The show puts each mirror up big,
// wobbling in, with the plain face beside it; the vote is a grid of mirror cards; the reveal adds who made each one,
// the voters' faces and the points. A screen that only watches sees who is still warping, then the same show.
import { esc, chip } from '../../client/gamehud.js';
import { KEYS, WARPS, TINTS, PROPS, plain, silliness } from './sim.js';
import { mirrorHtml, stubFace, warpWords } from './mirror.js';

const LABEL = { tall: 'Tall', wide: 'Wide', bulge: 'Bulge', twist: 'Twist', wobble: 'Wobble', tint: 'Tint', prop: 'Prop' };
const valueText = (k, v) => k === 'tint' ? TINTS[v] : k === 'prop' ? PROPS[v] : v > 0 ? '+' + v : String(v);

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const src = pid => byPid.get(pid)?.portrait || stubFace(byPid.get(pid)?.color);
  const nm = pid => byPid.get(pid)?.name || '?';
  ui.innerHTML = `
    <div class="fm-top"><span class="fm-title">Funhouse Mirrors</span><span class="clock"><b>--</b></span></div>
    <section class="fm-work">
      <p class="fm-who"></p>
      <div class="fm-stage"></div>
      <div class="fm-ctl">${KEYS.map(k => `<div class="fm-row" data-k="${k}"><button class="fm-b" data-k="${k}" data-d="-1" aria-label="Less ${LABEL[k]}">−</button><span class="fm-lab"><b>${LABEL[k]}</b><em></em></span><button class="fm-b" data-k="${k}" data-d="1" aria-label="More ${LABEL[k]}">+</button></div>`).join('')}
        <button class="fm-rand">Surprise me!</button></div>
      <button class="fm-done big-btn">Done!</button>
    </section>
    <section class="fm-wait"><p class="fm-shout">Everyone is warping a face…</p><div class="fm-workers">${players.map(p => chip(p, '<em class="st">warping…</em>')).join('')}</div></section>
    <section class="fm-show"><div class="fm-pair"><div class="fm-before"><i class="fm-plain"></i><small>Before</small></div><div class="fm-big"></div></div><b class="fm-cap"></b><span class="fm-words"></span></section>
    <section class="fm-gallery"><p class="fm-ghead"></p><div class="fm-cards"></div></section>
    <div class="fm-players">${players.map(p => chip(p, '<em class="sc">0</em>')).join('')}</div>
    <p class="fm-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'ready';
  if (init.solo) ui.classList.add('solo');
  if (me != null) ui.querySelector(`.fm-players [data-pid="${me}"]`)?.classList.add('me');

  let phase = 'ready', of = null, warp = plain(), done = false, mine = null, myVote = null, show = null, cur = -1, cards = [], lastG = null;

  function paintWork() {
    if (watching || of == null) return;
    $('.fm-who').innerHTML = init.solo ? 'Warp <b>your own</b> face!' : `You're warping <b>${esc(nm(of))}</b>'s face!`;
    $('.fm-stage').innerHTML = mirrorHtml(src(of), warp, { cls: 'work' });
    for (const k of KEYS) {
      const row = ui.querySelector(`.fm-row[data-k="${k}"]`), [lo, hi] = WARPS[k];
      row.querySelector('em').textContent = valueText(k, warp[k]);
      row.classList.toggle('on', warp[k] !== 0);
      const cyc = k === 'tint' || k === 'prop';
      row.querySelector('[data-d="-1"]').disabled = !cyc && warp[k] <= lo;
      row.querySelector('[data-d="1"]').disabled = !cyc && warp[k] >= hi;
    }
    const d = $('.fm-done'); d.textContent = done ? 'Done! (tap to keep warping)' : 'Done!'; d.classList.toggle('on', done);
    ui.classList.toggle('is-done', done);
  }
  function send() { done = false; ctx.send('warp', { ...warp }); paintWork(); }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'warp' && of != null) {
      if (t.dataset.k) {
        const k = t.dataset.k, [lo, hi] = WARPS[k], cyc = k === 'tint' || k === 'prop';
        let v = warp[k] + +t.dataset.d;
        if (cyc) v = v > hi ? lo : v < lo ? hi : v; else if (v < lo || v > hi) return;
        warp[k] = v; ctx.sfx('tap'); send(); return;
      }
      if (t.classList.contains('fm-rand')) {
        const r = () => Math.random();
        for (const k of KEYS) { const [lo, hi] = WARPS[k]; warp[k] = r() < 0.3 && k !== 'prop' ? 0 : lo + Math.floor(r() * (hi - lo + 1)); }
        ctx.sfx('pick'); send(); return;
      }
      if (t.classList.contains('fm-done')) { done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); paintWork(); }
      return;
    }
    if (phase === 'vote' && t.dataset.vote != null) {
      const v = +t.dataset.vote; if (v === mine) { ctx.sfx('bad'); return; }
      myVote = v; ctx.send('vote', v); ctx.sfx('pick'); paintVotes();
    }
  });

  function showMirror(i) {
    const s = show[i]; if (!s) return;
    $('.fm-plain').innerHTML = `<img src="${esc(src(s.of))}" alt="">`;
    const big = $('.fm-big'); big.innerHTML = mirrorHtml(src(s.of), s.w, { cls: 'big' });
    big.classList.remove('in'); void big.offsetWidth; big.classList.add('in');
    $('.fm-cap').textContent = `Mirror ${i + 1} of ${show.length}: it's ${nm(s.of)}!`;
    $('.fm-words').textContent = warpWords(s.w);
    ctx.sfx(silliness(s.w) >= 8 ? 'splat' : 'pick');
  }
  function buildGallery() {
    $('.fm-cards').innerHTML = show.map((s, i) => `
      <button class="fm-card" data-vote="${i}"><span class="fm-no">${i + 1} · ${esc(nm(s.of))}</span><em class="fm-flag"></em>
        ${mirrorHtml(src(s.of), s.w, { cls: 'small' })}<span class="fm-by"></span><span class="fm-vt"></span><strong class="fm-pts"></strong></button>`).join('');
    cards = [...ui.querySelectorAll('.fm-card')];
    paintVotes();
  }
  function paintVotes() {
    cards.forEach((c, i) => {
      const own = i === mine && !init.solo, picked = myVote === i;
      c.classList.toggle('mine', own); c.classList.toggle('picked', picked);
      c.querySelector('.fm-flag').textContent = own ? 'you made this' : picked ? '✓ your vote' : '';
    });
  }
  const face = p => `<i class="fm-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${esc(p.portrait)}" alt="">` : ''}</i>`;
  function paintReveal(r, scores) {
    const best = Math.max(...Object.values(scores));
    cards.forEach((c, i) => {
      const pid = r.by[i], p = byPid.get(pid); if (!p) return;
      c.querySelector('.fm-by').innerHTML = 'by ' + chip(p, pid === me ? '<em class="you">you</em>' : '');
      const voters = Object.entries(r.votes).filter(([, v]) => v === i).map(([q]) => byPid.get(+q)).filter(Boolean);
      c.querySelector('.fm-vt').innerHTML = init.solo ? `<em>silliness ${r.silly[pid]}</em>` : voters.length ? voters.map(face).join('') : '<em>no votes</em>';
      c.classList.toggle('silliest', r.silliest.includes(pid));
      c.querySelector('.fm-pts').textContent = `+${scores[pid]}`;
      c.classList.toggle('best', !init.solo && best > 0 && Object.values(scores).filter(v => v === best).length === 1 && scores[pid] === best);
    });
  }
  function note(g) {
    if (g.phase === 'ready') return 'Step right up to the hall of mirrors…';
    if (g.phase === 'warp') {
      if (watching) return `${g.done.length} of ${players.length} done`;
      if (init.solo) return 'The sillier the mirror, the bigger your score!';
      return done ? 'Done! Waiting for the others…' : 'Make it as funny as you can, then press Done.';
    }
    if (g.phase === 'show') return init.solo ? 'Ta-da!' : 'Remember the funniest one!';
    if (g.phase === 'vote') return watching ? `Vote on your phones! ${g.voted.length} of ${players.length} voted` : myVote == null ? 'Tap the funniest mirror (not your own).' : 'Vote in. You can still change it.';
    if (init.solo) return `Silliness score: ${g.scores[players[0].pid]} (out of 18). Every warp, tint and prop counts!`;
    return `${3} points a vote · +1 for a finished mirror · +1 for the silliest`;
  }
  function paintChips(g) {
    for (const p of players) {
      const el = ui.querySelector(`.fm-players [data-pid="${p.pid}"]`); if (!el) continue;
      el.querySelector('.sc').textContent = g.scores ? g.scores[p.pid] : 0;
      const w = ui.querySelector(`.fm-workers [data-pid="${p.pid}"]`);
      if (w && g.phase === 'warp') { const d = g.done.includes(p.pid); w.classList.toggle('in', d); w.querySelector('.st').textContent = d ? 'done!' : 'warping…'; }
      el.classList.toggle('in', g.phase === 'vote' && g.voted.includes(p.pid));
    }
  }

  return {
    priv(d) {
      if (d.of != null && of == null) { of = d.of; warp = { ...d.warp }; }
      done = d.done; mine = d.mine; myVote = d.vote;
      if (phase === 'warp' || phase === 'ready') paintWork(); else if (cards.length) paintVotes();
    },
    state(g) {
      lastG = g;
      if (g.phase !== phase) {
        if (g.phase === 'warp') { ctx.sfx('open'); paintWork(); }
        if (g.phase === 'vote') ctx.sfx('pick');
        if (g.phase === 'reveal') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.show && !show) { show = g.show; buildGallery(); }
      if (g.phase === 'show' && g.cur !== cur) { cur = g.cur; showMirror(cur); }
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'warp' && g.left <= 8);
      $('.fm-ghead').textContent = g.phase === 'vote' ? (watching ? 'Which mirror is funniest?' : 'Which mirror is funniest?') : g.phase === 'reveal' ? (init.solo ? 'Your mirror' : 'The votes are in!') : '';
      if (g.phase === 'reveal' && g.reveal) paintReveal(g.reveal, g.scores);
      paintChips(g);
      $('.fm-note').textContent = note(g);
    },
    frame() {},
    dispose() {},
  };
}
