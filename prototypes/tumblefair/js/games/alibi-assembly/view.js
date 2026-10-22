// ALIBI ASSEMBLY on a screen: a police-desk look — a case file with the crime on it and the alibi as a typed statement.
// Build: one card per slot with its four options; the slot's owner (their face on the card) taps one, everyone sees it
// tick. Study: the whole statement, big. Questions: on a phone, the Inspector asks one thing at a time with big answer
// buttons; the TV shows the Inspector and how far each player has got. Verdict: a stamp (STORY HOLDS / BUSTED), the team
// score against the 70% line, each slot marked with whoever slipped up, and on a phone your own answers.
import { chip, esc } from '../../client/gamehud.js';

const INSPECTOR = `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#7aa7c7"/>
  <path d="M10 64 q4 -18 22 -18 q18 0 22 18 z" fill="#5b4a3a" stroke="#0d2228" stroke-width="2.5"/>
  <circle cx="32" cy="32" r="13" fill="#f2c9a0" stroke="#0d2228" stroke-width="2.5"/>
  <path d="M14 24 q18 -16 36 0 l-4 3 h-28 z" fill="#6b5a48" stroke="#0d2228" stroke-width="2.5"/><path d="M20 22 q12 -10 24 0" fill="#7d6a55"/>
  <circle cx="27" cy="33" r="2" fill="#0d2228"/><circle cx="37" cy="33" r="5" fill="none" stroke="#0d2228" stroke-width="2"/><circle cx="37" cy="33" r="1.6" fill="#0d2228"/>
  <path d="M42 36 l6 6" stroke="#0d2228" stroke-width="2.5"/><path d="M26 41 h10" stroke="#0d2228" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M24 38 q8 4 16 0" fill="#3b2a1c"/></svg>`;

export function createView(ctx) {
  const { ui, players, me, init } = ctx, watching = me == null;
  const byPid = new Map(players.map(p => [p.pid, p]));
  const face = p => `<i class="aa-face" style="--seat:${p?.color || '#999'}" title="${esc(p?.name || '')}">${p?.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  ui.innerHTML = `
    <div class="aa-top"><span class="aa-title">Alibi Assembly</span><span class="clock"><b>--</b></span></div>
    <div class="aa-case"><span class="aa-tag">The case</span><b>${esc(init.crime)}</b></div>
    <p class="aa-step"></p>
    <section class="aa-slots">${init.slots.map((s, i) => `
      <div class="aa-slot" data-s="${i}">
        <div class="aa-sh"><span class="aa-label">${esc(s.label)}</span>${s.owner != null && byPid.get(s.owner) ? `<span class="aa-own">${chip(byPid.get(s.owner), s.owner === me ? '<em class="aa-you">you pick</em>' : '')}</span>` : '<span class="aa-own aa-house">the house picks</span>'}</div>
        <div class="aa-opts">${s.opts.map((o, j) => `<button class="aa-opt" data-s="${i}" data-o="${j}" ${s.owner === me && !watching ? '' : 'tabindex="-1"'}><span class="aa-tick" aria-hidden="true">✔</span>${esc(o)}</button>`).join('')}</div>
        <div class="aa-val"><span class="aa-label">${esc(s.label)}</span><b></b><em class="aa-auto">nobody remembers, so the house says this</em><span class="aa-slip"></span></div>
      </div>`).join('')}</section>
    <section class="aa-ask">
      <div class="aa-insp">${INSPECTOR}<div class="aa-bubble"><small class="aa-qn"></small><b class="aa-qt"></b></div></div>
      <div class="aa-answers"></div>
    </section>
    <section class="aa-room">${INSPECTOR}<div class="aa-prog">${players.map(p => chip(p, '<em class="aa-pg">0</em>')).join('')}</div></section>
    <section class="aa-verdict"><div class="aa-stamp"></div><div class="aa-meter"><i class="aa-fill"></i><i class="aa-line" style="left:${init.need}%"></i></div><p class="aa-team"></p><div class="aa-scores">${players.map(p => chip(p, '<em class="aa-sc"></em>')).join('')}</div></section>
    <section class="aa-mine"></section>
    <p class="aa-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'build';
  let phase = '', picks = init.slots.map(() => null), qi = -1, sentFor = -1;

  function paintSlots(p, auto = [], rv = null) {
    ui.querySelectorAll('.aa-slot').forEach((el, i) => {
      const v = p[i];
      el.classList.toggle('filled', v != null);
      el.querySelectorAll('.aa-opt').forEach((b, j) => { b.classList.toggle('on', v === j); b.setAttribute('aria-pressed', v === j ? 'true' : 'false'); });
      el.querySelector('.aa-val b').textContent = v != null ? init.slots[i].opts[v] : '…';
      el.classList.toggle('auto', auto.includes(i));
      const slip = rv ? rv.wrong[i] : null;
      el.querySelector('.aa-slip').innerHTML = !rv ? '' : slip.length ? `slipped up: ${slip.map(q => face(byPid.get(q))).join('')}` : '<b class="aa-held">everyone agreed ✔</b>';
      el.classList.toggle('held', !!rv && !slip.length); el.classList.toggle('broke', !!rv && slip.length > 0);
    });
  }
  ui.addEventListener('click', e => {
    if (watching) return;
    const b = e.target.closest('button'); if (!b) return;
    if (phase === 'build' && b.classList.contains('aa-opt')) {
      const s = +b.dataset.s, o = +b.dataset.o; if (init.slots[s].owner !== me) return;
      picks[s] = o; paintSlots(picks); ctx.send('pick', { s, o }); ctx.sfx('pick');
    } else if (phase === 'ask' && b.classList.contains('aa-ans')) {
      if (sentFor === qi) return;
      sentFor = qi; b.classList.add('on'); ctx.send('ans', { i: qi, o: +b.dataset.o }); ctx.sfx('tap');
    }
  });
  function step(g) {
    if (g.phase === 'build') {
      if (init.solo) return 'The house is putting your story together. Watch every piece!';
      const mine = init.slots.filter(s => s.owner === me).length;
      return watching ? 'Phones out! Each of you fills in a piece of the alibi.' : mine ? `Pick your piece${mine > 1 ? 's' : ''} (your face is on ${mine > 1 ? 'them' : 'it'}). Read everyone else's too!` : 'Read every piece!';
    }
    if (g.phase === 'study') return 'Here is your story. Remember every word!';
    if (g.phase === 'ask') return watching ? 'The Inspector questions each of you in private…' : '';
    return '';
  }
  function note(g) {
    if (g.phase === 'build') return 'Every piece is visible to everyone. The Inspector will ask about all of them.';
    if (g.phase === 'ask') return watching ? 'Answer on your phones. No peeking at each other!' : qi < 0 || qi >= init.q ? 'All answered! Waiting for the others…' : `One go per question. ${init.need}% right as a team keeps you free.`;
    if (g.phase === 'verdict') return init.solo ? `Practice: ${g.scores[me] ?? 0} of ${init.q} right.` : 'Each right answer is a point. The best memory tops the results.';
    return '';
  }
  return {
    priv(d) {
      if (d.q !== undefined || d.qi !== undefined) {
        qi = d.qi;
        if (d.q) {
          $('.aa-qn').textContent = `Question ${d.qi + 1} of ${init.q}`;
          $('.aa-qt').textContent = d.q.text;
          $('.aa-answers').innerHTML = d.q.opts.map((o, j) => `<button class="aa-ans big-btn${d.q.opts.length === 2 ? ' yn' : ''}" data-o="${j}">${esc(o)}</button>`).join('');
        } else { $('.aa-qn').textContent = 'That will be all.'; $('.aa-qt').textContent = 'Thank you. Wait over there.'; $('.aa-answers').innerHTML = ''; }
      }
      if (d.mine) {
        $('.aa-mine').innerHTML = `<h3>Your answers</h3>` + d.mine.map(m => `<div class="aa-row ${m.got === m.right ? 'ok' : 'no'}"><span class="aa-mk">${m.got === m.right ? '✔ right' : '✘ wrong'}</span><span><small>${esc(m.text)}</small>${m.got === m.right ? esc(m.right) : `you said <s>${esc(m.got ?? 'nothing')}</s> — it was <b>${esc(m.right)}</b>`}</span></div>`).join('');
      }
    },
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'study') ctx.sfx('pick');
        if (g.phase === 'verdict') ctx.sfx(g.reveal.ok ? 'win' : 'bad');
      }
      phase = g.phase; ui.dataset.phase = g.phase;
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', (g.phase === 'build' || g.phase === 'ask') && g.left <= 5);
      $('.aa-title').textContent = { build: 'Build your alibi', study: 'Get your story straight!', ask: 'The Inspector', verdict: 'The verdict' }[g.phase];
      if (g.picks) { picks = g.picks.slice(); paintSlots(picks, g.auto || []); }
      if (g.phase === 'ask' && g.progress) for (const p of players) { const el = ui.querySelector(`.aa-prog [data-pid="${p.pid}"]`); if (!el) continue; const n = g.progress[p.pid]; el.querySelector('.aa-pg').textContent = `${n}/${init.q}`; el.classList.toggle('in', n >= init.q); }
      if (g.phase === 'verdict') {
        const r = g.reveal; paintSlots(r.picks, r.auto, r);
        const st = $('.aa-stamp'); st.textContent = r.ok ? 'STORY HOLDS' : 'BUSTED!'; st.classList.toggle('ok', r.ok); st.classList.toggle('no', !r.ok);
        $('.aa-fill').style.width = r.team + '%';
        $('.aa-team').textContent = `${init.solo ? 'You' : 'Your team'} got ${r.team}% right (${init.need}% needed). ${r.ok ? 'You are free to go!' : 'The Inspector is not convinced.'}`;
        for (const p of players) { const el = ui.querySelector(`.aa-scores [data-pid="${p.pid}"] .aa-sc`); if (el) el.textContent = `${r.right[p.pid]}/${init.q}`; }
      }
      $('.aa-step').textContent = step(g);
      $('.aa-note').textContent = note(g);
    },
    dispose() {},
  };
}
