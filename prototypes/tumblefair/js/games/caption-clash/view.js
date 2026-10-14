// CAPTION CLASH on a screen. Everyone sees the same picture (drawn from data/scenes.json by kit.js). A phone that plays
// gets a caption box with a letter count, a "Give me a starter" button that offers three openers, and Submit; a
// watch-only screen shows the picture big with who is still writing. Then the captions appear as cards: phones tap one
// to vote, and the reveal puts each writer's portrait on their caption with the faces of who voted for it.
import { esc, chip } from '../../client/gamehud.js';
import { sceneSvg } from './kit.js';

const RULE_TEXT = { short: 'the shortest caption', allit: 'the most words starting with the same letter', words: 'the most words' };

export function createView(ctx) {
  const { ui, players, me, init } = ctx;
  const byPid = new Map(players.map(p => [p.pid, p])), watching = me == null;
  ui.innerHTML = `
    <div class="cc-top"><span class="cc-title">Caption Clash</span><span class="clock"><b>--</b></span></div>
    <div class="cc-main">
      <figure class="cc-scene">${sceneSvg(init.scene)}<figcaption>${esc(init.scene.text)}</figcaption></figure>
      <div class="cc-side">
        <section class="cc-write">
          <label class="cc-label" for="cc-in">Your caption</label>
          <textarea id="cc-in" class="cc-in" rows="2" maxlength="${init.max}" placeholder="Type something funny…" autocomplete="off" autocapitalize="sentences" spellcheck="true"></textarea>
          <div class="cc-row"><button class="cc-starter" data-do="starter">Give me a starter</button><span class="cc-count">0/${init.max}</span></div>
          <div class="cc-starters"></div>
          <button class="cc-submit big-btn" data-do="done">Submit</button>
        </section>
        <section class="cc-wait"><p class="cc-shout">Phones out! Everyone is writing…</p><div class="cc-writers">${players.map(p => chip(p, '<em class="st">thinking…</em>')).join('')}</div></section>
        <section class="cc-gallery"><p class="cc-ghead"></p><div class="cc-cards"></div><button class="cc-both big-btn" data-vote="both" hidden>Both are great!</button></section>
        <p class="cc-note"></p>
      </div>
    </div>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'write';
  const box = $('.cc-in');
  let phase = 'write', done = false, mine = null, myVote = null, caps = null, cards = [], sent = '', timer = 0, starters = [], showStarters = false;

  // ---- writing ----
  const count = () => { $('.cc-count').textContent = `${box.value.length}/${init.max}`; };
  function push() { clearTimeout(timer); timer = 0; if (box.value !== sent) { sent = box.value; ctx.send('cap', sent.slice(0, 400)); } }
  box.addEventListener('input', () => { count(); clearTimeout(timer); timer = setTimeout(push, 450); if (done) { done = false; ctx.send('done', false); paintWrite(); } });
  box.addEventListener('blur', push);
  box.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  function submit() {
    if (!box.value.trim()) { ctx.sfx('bad'); box.focus(); return; }
    push(); done = true; ctx.send('done', true); ctx.sfx('good'); box.blur(); paintWrite();
  }
  function paintWrite() {
    const b = $('.cc-submit'); b.textContent = done ? 'Sent! (tap to edit)' : 'Submit'; b.classList.toggle('on', done);
    ui.classList.toggle('is-done', done);
    $('.cc-starter').textContent = showStarters ? 'Other starters' : 'Give me a starter';
    $('.cc-starters').innerHTML = showStarters && !done ? starters.map((s, i) => `<button class="cc-op" data-op="${i}">${esc(s)}</button>`).join('') : '';
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'write') {
      if (t.dataset.do === 'starter') { if (showStarters) ctx.send('starter'); showStarters = true; ctx.sfx('tap'); paintWrite(); }
      else if (t.dataset.op != null) {
        const s = starters[+t.dataset.op]; if (!s) return;
        box.value = (s.replace(/…$/, '') + ' ').slice(0, init.max);
        count(); push(); showStarters = false; paintWrite(); ctx.sfx('pick');
        box.focus(); box.setSelectionRange(box.value.length, box.value.length);
      } else if (t.dataset.do === 'done') { if (done) { done = false; ctx.send('done', false); paintWrite(); box.focus(); } else submit(); }
      return;
    }
    if (phase === 'vote' && t.dataset.vote != null) {
      const v = t.dataset.vote === 'both' ? 'both' : +t.dataset.vote;
      if (v !== 'both' && v === mine) return;
      myVote = v; ctx.send('vote', v); ctx.sfx('pick'); paintVotes();
    }
  });

  // ---- gallery ----
  function buildGallery(list) {
    caps = list;
    $('.cc-cards').innerHTML = list.map((c, i) => `
      <button class="cc-card" data-vote="${i}"><i class="cc-ribbon">Judge's ribbon</i><q>${esc(c)}</q>
        <span class="cc-by"></span><span class="cc-vt"></span><strong class="cc-pts"></strong></button>`).join('')
      || '<p class="cc-none">Nobody wrote a caption!</p>';
    cards = [...ui.querySelectorAll('.cc-card')];
    $('.cc-both').hidden = !(players.length === 2 && !init.solo && !watching && list.length);
    paintVotes();
  }
  function paintVotes() {
    cards.forEach((c, i) => { c.classList.toggle('mine', i === mine); c.classList.toggle('picked', myVote === i || myVote === 'both'); });
    $('.cc-both').classList.toggle('picked', myVote === 'both');
  }
  const face = p => `<i class="cc-face" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function paintReveal(r, scores) {
    cards.forEach((c, i) => {
      const pid = r.who[i], p = byPid.get(pid); if (!p) return;
      c.querySelector('.cc-by').innerHTML = chip(p, pid === me ? '<em class="you">you</em>' : '');
      const voters = Object.entries(r.votes).filter(([, v]) => v === i || v === 'both').map(([q]) => byPid.get(+q)).filter(Boolean);
      c.querySelector('.cc-vt').innerHTML = voters.length ? voters.map(face).join('') : (init.solo ? '' : '<em>no votes</em>');
      c.classList.toggle('ribbon', r.ribbon === pid);
      c.querySelector('.cc-pts').textContent = scores ? `+${scores[pid]}` : '';
    });
  }
  function note(g) {
    const rule = `Judge's ribbon (+1 point): ${RULE_TEXT[init.judge.id]} (a tie goes to whoever finished first).`;
    if (g.phase === 'write') return watching ? `Captions appear here when the clock runs out. ${init.solo ? '' : rule}` : done ? 'Sent! Waiting for the others…' : `Keep it short and silly: ${init.max} letters at most.`;
    if (g.phase === 'vote') return watching ? `Vote on your phones! ${rule}` : myVote == null ? `Tap the funniest caption (not your own). ${rule}` : `Vote in. You can still change it. ${rule}`;
    if (init.solo) return g.scores && Object.values(g.scores)[0] ? 'Practice round: nice one! 1 point for writing a caption.' : 'Practice round: write a caption next time for a point.';
    return `1 point for each vote. ${rule}`;
  }
  paintWrite();

  return {
    priv(d) {
      starters = d.starters || []; mine = d.mine; myVote = d.vote;
      if (d.done !== done && !box.matches(':focus')) done = d.done;
      if (phase === 'write' && !box.matches(':focus') && !timer && d.cap && !box.value) { box.value = d.cap; sent = d.cap; count(); }   // came back mid-game
      paintWrite();
      if (caps) paintVotes();
    },
    state(g) {
      if (g.phase !== phase) {
        if (phase === 'write') { push(); box.blur(); }
        if (g.phase === 'vote') ctx.sfx('pick');
        if (g.phase === 'reveal') ctx.sfx('win');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.caps && !caps) buildGallery(g.caps);
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'write' && g.left <= 10);
      $('.cc-title').textContent = g.phase === 'write' ? 'Caption Clash' : g.phase === 'vote' ? 'Vote for the funniest!' : init.solo ? 'Your caption' : 'The votes are in!';
      if (g.phase === 'write') for (const p of players) {
        const r = ui.querySelector(`.cc-writers [data-pid="${p.pid}"]`); if (!r) continue;
        const isDone = g.done.includes(p.pid); r.classList.toggle('in', isDone);
        r.querySelector('.st').textContent = isDone ? 'done!' : g.typing.includes(p.pid) ? 'writing…' : 'thinking…';
      }
      if (caps) {
        $('.cc-ghead').textContent = g.phase === 'vote' && watching ? `${g.voted.length} of ${players.length} have voted` : '';
        if (g.reveal) paintReveal(g.reveal, g.scores);
      }
      $('.cc-note').textContent = note(g);
    },
    dispose() { clearTimeout(timer); },
  };
}
