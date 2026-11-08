// SNOWMAN STYLING on a screen. A phone that plays sees the theme card, its own snowman big in the middle, a row of seven
// slot tabs (Hat, Scarf, Colour…) and the five choices of the open tab as big buttons (tap the worn one again to take
// it off), then "My snowman is ready!". A watch-only screen shows a snowy yard of bare snowmen that wobble as their
// owners dress them. Then the snowmen stand in a row: phones tap one to vote; the reveal shows who built each, the
// votes (player faces + the CPU judges' names) and the Frost Ribbon.
import { esc, chip, scoreBar } from '../../client/gamehud.js';
import { SLOTS, OPTIONS, THEMES, N_SLOTS, parseShow, filledOf } from './sim.js';
import { snowmanSVG, optionIcon } from './art.js';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null, theme = THEMES[init.th];
  const byPid = new Map(players.map(p => [String(p.pid), p]));
  const cpuName = new Map((init.cpus || []).map(c => [c.id, c.name]));
  ui.innerHTML = `
    <div class="sm-flakes" aria-hidden="true"></div>
    <div class="sm-top"><span class="sm-title">Snowman Styling</span></div>
    <p class="sm-theme"><small>Theme</small><b>${esc(theme.name)}</b><em>${esc(theme.hint)}</em></p>
    <section class="sm-dress">
      <div class="sm-me"></div>
      <div class="sm-tabs" role="tablist">${SLOTS.map((s, i) => `<button class="sm-tab" data-tab="${i}" role="tab"><i></i>${esc(s.name)}</button>`).join('')}</div>
      <div class="sm-opts"></div>
      <button class="sm-done big-btn" data-do="done">My snowman is ready!</button>
    </section>
    <section class="sm-yard"><p class="shout">Phones out! Everyone is building…</p>
      <div class="sm-patch">${players.map(p => `<div class="sm-blank" data-pid="${p.pid}">${snowmanSVG(new Array(N_SLOTS).fill(-1))}${chip(p, '<em class="st">rolling snow…</em>')}</div>`).join('')}</div></section>
    <section class="sm-gallery"><p class="sm-ghead"></p><div class="sm-cards"></div></section>
    <p class="sm-note"></p>`;
  const bar = scoreBar(ctx, { unit: 'points' });
  ui.querySelector('.sm-top').append(bar.el);
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'dress';
  let phase = 'dress', tab = 0, outfit = new Array(N_SLOTS).fill(-1), done = false, mine = null, myVote = null, shown = null;

  function paintMe() {
    $('.sm-me').innerHTML = snowmanSVG(outfit);
    ui.querySelectorAll('.sm-tab').forEach((b, i) => { b.classList.toggle('on', i === tab); b.classList.toggle('set', outfit[i] >= 0); b.setAttribute('aria-selected', i === tab); });
    const slot = SLOTS[tab].id;
    $('.sm-opts').innerHTML = OPTIONS[slot].map((o, i) => `<button class="sm-opt${outfit[tab] === i ? ' on' : ''}" data-i="${i}" aria-label="${esc(o.name)}">${optionIcon(slot, i)}<span>${esc(o.name)}</span></button>`).join('');
    const d = $('.sm-done'); d.classList.toggle('on', done); d.textContent = done ? 'Ready! (tap to change more)' : 'My snowman is ready!';
    ui.classList.toggle('is-done', done);
  }
  ui.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t || watching) return;
    if (phase === 'dress') {
      if (t.dataset.tab != null) { tab = +t.dataset.tab; ctx.sfx('tap'); }
      else if (t.dataset.i != null) {
        const i = +t.dataset.i, next = outfit[tab] === i ? -1 : i;
        outfit[tab] = next; if (done) { done = false; ctx.send('done', false); }
        ctx.send('wear', { s: tab, i: next }); ctx.sfx(next < 0 ? 'tap' : 'pick');
        if (next >= 0) { const nx = outfit.findIndex((v, k) => k > tab && v < 0); if (nx >= 0) tab = nx; }   // hop to the next empty slot
        const m = $('.sm-me'); m.classList.remove('wob'); void m.offsetWidth; m.classList.add('wob');
      } else if (t.dataset.do === 'done') { done = !done; ctx.send('done', done); ctx.sfx(done ? 'good' : 'tap'); }
      paintMe(); return;
    }
    if (phase === 'vote' && t.dataset.vote != null) {
      const v = +t.dataset.vote; if (v === mine || !shown || filledOf(shown[v]) === 0) return;
      myVote = v; ctx.send('vote', v); ctx.sfx('pick'); paintVotes();
    }
  });
  paintMe();

  function buildGallery(rows) {
    shown = rows;
    $('.sm-cards').className = `sm-cards n${rows.length}`;
    $('.sm-cards').innerHTML = rows.map((o, i) => `
      <button class="sm-card${filledOf(o) ? '' : ' blank'}" data-vote="${i}" aria-label="Snowman ${i + 1}" style="--d:${(i * 0.25).toFixed(2)}s">
        <span class="sm-frame">${snowmanSVG(o)}<b class="sm-num">${i + 1}</b><i class="sm-ribbon">Frost Ribbon</i>${filledOf(o) ? '' : '<i class="sm-empty">Not dressed!</i>'}</span>
        <span class="sm-by"></span><span class="sm-vt"></span><strong class="sm-pts"></strong>
      </button>`).join('');
    paintVotes();
  }
  function paintVotes() {
    ui.querySelectorAll('.sm-card').forEach((c, i) => { c.classList.toggle('mine', i === mine); c.classList.toggle('picked', i === myVote); });
  }
  const facePic = p => `<i class="vface" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function paintReveal(rv) {
    const best = Math.max(...rv.pts);
    ui.querySelectorAll('.sm-card').forEach((c, i) => {
      const who = String(rv.who[i]), p = byPid.get(who);
      c.querySelector('.sm-by').innerHTML = p ? chip(p, String(p.pid) === String(me) ? '<em class="you">you</em>' : '') : `<span class="sm-cpu">${esc(cpuName.get(who) || 'CPU')} <small>CPU</small></span>`;
      const voters = Object.entries(rv.v).filter(([, v]) => v === i).map(([q]) => byPid.get(q)).filter(Boolean).map(facePic);
      const judges = rv.j.map((v, k) => (v === i ? `<i class="sm-judge" title="${esc(init.judges[k])}">${esc(init.judges[k].split(' ').pop()[0])}</i>` : '')).join('');
      c.querySelector('.sm-vt').innerHTML = voters.join('') + judges || '<em>no votes</em>';
      c.classList.toggle('ribbon', rv.rb === i);
      c.classList.toggle('best', best > 0 && rv.pts.filter(x => x === best).length === 1 && rv.pts[i] === best);
      c.querySelector('.sm-pts').textContent = `+${rv.pts[i]}`;
    });
  }
  function note(g) {
    if (g.phase === 'dress') return watching ? 'The snowmen line up when the clock runs out.' : done ? 'Waiting for the other builders…' : `Dress your snowman for ${theme.name}. Tap a tab, then a piece.`;
    const judges = init.judges.length ? ` Judges ${init.judges.join(', ')} vote too.` : '';
    if (g.phase === 'vote') return watching ? `Vote on your phones!${judges}` : myVote == null ? `Tap the best snowman (not your own).${judges}` : 'Vote in. You can still change it.';
    if (init.alone && g.scores) return `The Frost Judge counts ${g.scores[players[0].pid]} of ${N_SLOTS} pieces that fit ${theme.name}.`;
    if (init.solo && g.scores) {
      const meP = g.scores[players[0].pid], cp = init.cpus.map(c => g.rv.pts[g.rv.who.indexOf(c.id)]);
      return meP > Math.max(...cp) ? '🏆 Your snowman won the yard!' : meP === Math.max(...cp) ? 'A tie for the top of the yard!' : `${init.cpus[cp.indexOf(Math.max(...cp))].name} won this time.`;
    }
    return '1 point per vote. Frost Ribbon (+1): the best fit for the theme.';
  }

  return {
    priv(d) {
      // a phone that comes back mid-game starts bare: take the snowman the server kept (never fight our own fresh taps)
      if (phase === 'dress' && Array.isArray(d.outfit) && outfit.every(v => v < 0) && d.outfit.some(v => v >= 0)) outfit = d.outfit.slice();
      if (d.done !== done) done = d.done;
      mine = d.mine; myVote = d.vote;
      paintMe(); paintVotes();
    },
    state(g) {
      if (g.phase !== phase && g.phase === 'reveal') ctx.sfx('win');
      if (g.phase !== phase && g.phase === 'vote') ctx.sfx('pick');
      phase = g.phase; ui.dataset.phase = g.phase;
      bar.set(g.scores || Object.fromEntries(players.map(p => [p.pid, 0])), g.left);
      $('.sm-title').textContent = g.phase === 'dress' ? 'Snowman Styling' : g.phase === 'vote' ? 'Vote for the best!' : 'The votes are in!';
      if (g.phase === 'dress') for (const p of players) {
        const r = ui.querySelector(`.sm-blank[data-pid="${p.pid}"]`); if (!r) continue;
        const n = g.n?.[p.pid] || 0, isDone = g.done?.includes(p.pid);
        if (+r.dataset.n !== n && n > 0) { r.classList.remove('wob'); void r.offsetWidth; r.classList.add('wob'); }
        r.dataset.n = n; r.classList.toggle('in', !!isDone);
        r.querySelector('.st').textContent = isDone ? 'ready!' : n ? `${n} of ${N_SLOTS} pieces` : 'rolling snow…';
      }
      if (g.show && (!shown || shown.length !== g.show.length)) buildGallery(g.show.map(parseShow));
      if (g.phase === 'vote') $('.sm-ghead').textContent = watching ? `${g.voted.length} of ${players.length} have voted` : '';
      else $('.sm-ghead').textContent = '';
      if (g.rv) paintReveal(g.rv);
      $('.sm-note').textContent = note(g);
    },
    frame() {},
    dispose() {},
  };
}
