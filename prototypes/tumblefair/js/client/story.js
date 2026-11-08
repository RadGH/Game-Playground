// Story Night (Expansion 1, M8): the story card on a phone (and big on a TV). main.js owns the screen; this file only
// turns a card into HTML. A card is short on purpose — a title, 1-3 lines, big choice buttons or a Next button — because
// on a phone it IS the main screen. The buttons use main.js's existing actions: data-act="vote" (a pick) and
// data-act="skip" (Next), which the room routes to the story while the phase is 'story'.
const MOOD = { bold: '🔥', kind: '💛', clever: '💡', silly: '🤪' };

/**
 * h: { esc, chipOf, member(pid), me (pid or null), seated (bool: may answer), left (s), votes, ready, pick, seatColor(pid) }
 */
export function storyCardHtml(card, h) {
  const { esc } = h, lead = card.lead != null ? h.member(card.lead) : null, mine = h.me;
  const top = `<p class="st-top"><i aria-hidden="true">${esc(card.icon || '★')}</i> ${esc(card.arcTitle || 'Story Night')}${card.chapter ? ` <span>· Chapter ${card.chapter} of ${card.chapters}</span>` : ''}</p>`;
  if (card.kind === 'end') return endHtml(card, h, top);
  const lines = card.lines.map((l, i) => `<p class="st-line${i === 0 && card.lines.length > 1 && /^(After|Since|Not long ago|Everyone still remembers)/.test(l) ? ' recall' : ''}">${esc(l)}</p>`).join('');
  const stars = card.stars ? `<p class="st-stars">${Object.entries(card.stars).map(([pid, n]) => { const m = h.member(+pid); return m ? `<span class="st-star">${h.chipOf(m)}<b>+${n} ★</b></span>` : ''; }).join('')}</p>` : '';
  let foot = '';
  if (card.choices) {
    const canPick = h.seated && (card.who === 'vote' || card.lead === mine);
    const myVote = h.votes?.[mine];
    const who = card.who === 'vote' ? (h.seated ? 'Everyone votes!' : 'Everyone is voting…')
      : card.lead === mine ? 'You choose for the party!' : `${esc(lead?.name || 'The leader')} is choosing…`;
    const dots = i => Object.entries(h.votes || {}).filter(([, v]) => v === i).map(([pid]) => `<i class="dot" style="background:${h.seatColor(+pid)}"></i>`).join('');
    foot = `<p class="st-who${canPick ? ' you' : ''}">${who}</p>
      <div class="st-choices">${card.choices.map((c, i) => `<button class="btn big st-choice${myVote === i ? ' mine' : ''}${h.pick === i ? ' won' : ''}" data-act="vote" data-i="${i}" ${canPick ? '' : 'disabled'}>${c.mood ? `<i class="mood" aria-hidden="true">${MOOD[c.mood] || ''}</i>` : ''}<span>${esc(c.label)}</span><u class="who">${dots(i)}</u></button>`).join('')}</div>
      <p class="note st-timer">${canPick ? (myVote != null ? 'Picked! You can still change it.' : 'Tap one.') : 'Watch the story.'} <b class="count">${h.left}</b></p>`;
  } else {
    const ready = h.ready || [], me = ready.includes(mine);
    foot = `${card.game ? '<p class="st-who game">A minigame decides what happens next!</p>' : ''}
      ${h.seated ? `<button class="btn big primary st-next" data-act="skip">${me ? 'Ready ✓' : card.game ? 'Let’s play!' : 'Next ▸'}</button>` : ''}
      <p class="note st-timer">${ready.length ? `${ready.length} ready · ` : ''}<b class="count">${h.left}</b></p>`;
  }
  return `<div class="panel story-card${card.choices ? ' ask' : ''}${card.game ? ' to-game' : ''}" data-n="${card.n}">${top}
    ${card.title ? `<h1 class="shout st-title">${esc(card.title)}</h1>` : ''}<div class="st-lines">${lines}</div>${stars}${foot}</div>`;
}

/** The epilogue: how it ended, the hero, then everyone's title and what they did. */
function endHtml(card, h, top) {
  const { esc } = h, e = card.end;
  const hero = e.hero != null ? h.member(e.hero) : null;
  const rows = e.rows.map(r => { const m = h.member(r.pid); return `<li class="st-row${r.pid === e.hero ? ' hero' : ''}">${m ? h.chipOf(m) : `<b>${esc(r.name)}</b>`}<span class="st-title-tag">${esc(r.title)}</span><b class="st-n">${r.stars} ★</b>
    ${r.deeds.length ? `<small class="st-deeds">${esc(r.deeds.slice(-2).join(' · '))}</small>` : ''}</li>`; }).join('');
  return `<div class="panel story-card end" data-n="${card.n}">${top}<h1 class="shout st-title">${esc(card.title)}</h1>
    <div class="st-lines">${card.lines.map(l => `<p class="st-line">${esc(l)}</p>`).join('')}</div>
    ${hero ? `<p class="st-hero">🏅 <b>${esc(hero.name)}</b> is the Hero of the Night!</p>` : ''}
    <ol class="st-rows">${rows}</ol>
    ${h.seated ? `<button class="btn big primary st-next" data-act="skip">${(h.ready || []).includes(h.me) ? 'Ready ✓' : 'See the prizes ▸'}</button>` : ''}
    <p class="note st-timer"><b class="count">${h.left}</b></p></div>`;
}

/** One line for the final screen: which story, how it ended, the hero. */
export function storyFinalLine(story, nameOf) {
  if (!story) return '';
  const hero = story.hero != null ? nameOf(story.hero) : null;
  return `${story.icon || '★'} ${story.arcTitle}: ${story.won ? 'saved the day' : 'to be continued…'}${hero ? ` · Hero of the Night: ${hero}` : ''}`;
}

/** Who should cheer on this card (they just earned stars), and who stands ready (the leader). */
export function storyPoses(card, pids) {
  return Object.fromEntries(pids.map(pid => [pid, card.stars?.[pid] ? 'cheer' : card.kind === 'end' ? (card.end?.hero === pid ? 'cheer' : 'clap') : card.lead === pid && card.choices ? 'ready' : 'idle']));
}
