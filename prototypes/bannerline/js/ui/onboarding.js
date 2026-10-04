// First-match hints (owner request): a short card sequence shown once per browser, re-openable from
// the pause menu ("How to play"). A step can finish itself when the player does the thing (the
// first send finishes step 1), or by Next / Got it. Pad: Y = next, B... no — the pad uses the
// pause menu; the card advances itself on actions and times out, so it never blocks play.

import { h } from './dom.js';

const KEY = 'bannerline.onboarded.v1';

function steps(isPad) {
  return [
    { id: 'send', title: 'Send units to raise your income',
      text: isPad ? 'Press <kbd class="pad">↓</kbd> on the d-pad (or walk to the Barracks) and hire units with <kbd class="pad">A</kbd> — hold it to keep hiring. They march on your rival, and every unit adds income for the rest of the match.'
        : 'Open the <b>Barracks</b> with <kbd>B</kbd> (or walk your hero to it) and hire units — hold to keep hiring. They march on your rival, and every unit adds income for the rest of the match.' },
    { id: 'defend', title: 'Defend your field with your hero',
      text: isPad ? 'Enemy units come through your gate. Move with the left stick, <kbd class="pad">A</kbd> attacks, <kbd class="pad">X</kbd> <kbd class="pad">Y</kbd> <kbd class="pad">B</kbd> <kbd class="pad">RB</kbd> cast. <kbd class="pad">LT</kbd> + a skill button learns it.'
        : 'Enemy units come through your gate. Right-click to move and attack; <kbd>Q</kbd> <kbd>W</kbd> <kbd>E</kbd> <kbd>R</kbd> cast at the cursor. <kbd>Ctrl</kbd> + a skill key learns it.' },
    { id: 'banners', title: 'Guard your banners',
      text: 'Units that reach your Keep tear down banners. Lose them all and the match is lost — tear down theirs first.' },
    { id: 'gear', title: 'Your town',
      text: isPad ? 'Gold arrives every payout. <kbd class="pad">View</kbd> Outfitter (items — stand next to it), <kbd class="pad">↑</kbd> Drill Yard (train every unit you send), <kbd class="pad">LB</kbd> Sanctum (powers you aim at a field). <kbd class="pad">R3</kbd> watches the rival\'s field.'
        : 'Gold arrives every payout. <kbd>O</kbd> Outfitter (items — stand next to it), <kbd>U</kbd> Drill Yard (train every unit you send), <kbd>P</kbd> Sanctum (powers you aim at a field). <kbd>F</kbd> watches the rival\'s field.' },
  ];
}

export function shouldOnboard() {
  try { return !localStorage.getItem(KEY); } catch { return false; }
}
function markDone() { try { localStorage.setItem(KEY, '1'); } catch { /* private window */ } }

export function createOnboarding({ root, isPad = false }) {
  const list = steps(isPad);
  const card = h('div', 'onboard', null, { 'data-ui': true, hidden: true });
  root.append(card);
  let i = -1;
  function show(k) {
    i = k;
    if (i < 0 || i >= list.length) { card.hidden = true; markDone(); return; }
    const s = list[i];
    card.hidden = false;
    card.innerHTML = `<div class="ob-step">How to play · ${i + 1} of ${list.length}</div>
      <div class="ob-title">${s.title}</div><p class="ob-text">${s.text}</p>
      <div class="ob-actions"><button class="ob-skip" data-act="skip">Got it</button><button class="ob-next" data-act="next">${i === list.length - 1 ? 'Done' : 'Next'}</button></div>`;
  }
  card.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'next') show(i + 1);
    if (act === 'skip') show(-1);
  });
  return {
    start() { show(0); },
    get open() { return !card.hidden; },
    get step() { return i >= 0 ? list[i]?.id : null; },
    /** The player did something: finish the step that asked for it. */
    did(what) { if (!card.hidden && list[i]?.id === what) show(i + 1); },
    next() { if (!card.hidden) show(i + 1); },
    close() { show(-1); },
    destroy() { card.remove(); },
  };
}
