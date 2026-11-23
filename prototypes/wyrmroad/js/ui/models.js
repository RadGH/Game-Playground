// "How should the characters look?" — asked once on the first start (and once by saves made before it existed): High
// detail (painted fal.ai monsters + Tabard heroes, js/render/hd.js) or Legacy (the Chibi 2.6 heroes and the first
// monsters). Two picture cards over the village street; mouse, touch, keys (←/→ + Enter) and a controller (padnav)
// all pick. The choice is a device setting (settings.models) and can be switched any time in Settings, live.
//   app.go('models', { then: 'title' | 'online' })
import { icon } from './icons.js';

export const MODEL_CHOICES = [
  { id: 'hd', name: 'High detail', tag: 'New', pic: 'img/models-hd.jpg', text: 'Hand-painted heroes and monsters. Your armour changes as you find it.' },
  { id: 'legacy', name: 'Legacy', tag: '', pic: 'img/models-legacy.jpg', text: 'The original round heroes, with the face, hair and colours you pick.' },
];

export function modelsScreen(app, { then = 'title' } = {}) {
  const cur = app.settings.models;
  app.ui.innerHTML = `<section class="wr-screen wr-models">
    <div class="wr-models-main">
      <header class="wr-models-head"><p class="wr-kicker">Before you set off</p><h1>How should the characters look?</h1></header>
      <div class="wr-models-cards" role="group" aria-label="Character models">
        ${MODEL_CHOICES.map((c, i) => `<button type="button" class="wr-model-card${cur === c.id ? ' on' : ''}" data-models="${c.id}" aria-pressed="${cur === c.id}">
          <span class="wr-model-pic"><img src="${c.pic}" alt="" draggable="false">${c.tag ? `<i class="wr-model-tag">${c.tag}</i>` : ''}</span>
          <span class="wr-model-text"><b>${c.name}</b><small>${c.text}</small></span>
          <span class="wr-model-pick">${icon('play')}<span>${i ? 'Use Legacy' : 'Use High detail'}</span></span>
        </button>`).join('')}
      </div>
      <p class="wr-models-foot">${icon('cog')}<span>You can switch any time in Settings.</span></p>
    </div>
  </section>`;
  const root = app.ui.firstElementChild;
  const cards = [...root.querySelectorAll('[data-models]')];
  const pick = id => {
    app.audio.play('ui.click');
    app.setSetting('models', id);
    if (then === 'online') { app.go('title'); app.openOnline(); } else app.go(then);
  };
  root.addEventListener('click', e => { const b = e.target.closest('[data-models]'); if (b) pick(b.dataset.models); });
  // keys: ←/→ (or A/D) move between the two cards, Enter / Space picks (the focused button's own click)
  const onKey = e => {
    const i = cards.indexOf(document.activeElement);
    if (/^(ArrowLeft|ArrowUp|KeyA|KeyW)$/.test(e.code)) { e.preventDefault(); cards[Math.max(0, i - 1)].focus(); }
    else if (/^(ArrowRight|ArrowDown|KeyD|KeyS)$/.test(e.code)) { e.preventDefault(); cards[i < 0 ? 0 : Math.min(cards.length - 1, i + 1)].focus(); }
  };
  addEventListener('keydown', onKey);
  setTimeout(() => (cards.find(c => c.dataset.models === cur) || cards[0]).focus({ preventScroll: true }), 50);
  // the village street behind, held still (a menu: only the player's choice moves on screen)
  app.view.setChapter?.('millbrook');
  app.view.scenic?.(false);
  app.audio.ambience?.('millbrook');
  return () => { removeEventListener('keydown', onKey); };
}
