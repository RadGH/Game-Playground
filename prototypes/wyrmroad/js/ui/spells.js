// Spells: the class's three spells as cards (mana, cooldown, the level it is learned at, what it does with numbers
// from the hero's own power), and the two slots you carry. Pick a slot, then the spell to put in it. Spell 1 / Spell 2
// show the key this player presses.
import { heroStats } from '../sim/items.js';
import { hp as n } from '../../../../shared/format.js';
import { icon } from './icons.js';
import { esc, spellText, spellCost } from './text.js';
import { openSheet } from './kit.js';
import { keyLabel } from '../input/bindings.js';

export function openSpells(app, h, { live = false } = {}) {
  const { data } = app;
  const C = data.classes.classes[h.cls];
  let slot = 0;
  const sh = openSheet({ title: `${h.name} · Spells`, wide: true, cls: 'wr-spells', body: '<div class="wr-spellbook"></div>' });
  const root = sh.body.querySelector('.wr-spellbook');
  const key = k => { const d = app.input.last; return d === 'touch' ? '' : keyLabel(d === 'pad' ? 'pad' : 'kb', k ? 'spell2' : 'spell1'); };
  function draw() {
    const s = heroStats(data.classes, data.items, { cls: h.cls, level: h.level, gear: h.gear });
    root.innerHTML = `<div class="wr-spell-slots" role="radiogroup" aria-label="Spell slots">${[0, 1].map(k => {
      const S = data.classes.spells[h.spells[k]];
      return `<button type="button" class="wr-spell-slot${slot === k ? ' on' : ''}" role="radio" aria-checked="${slot === k}" data-slot="${k}">
        <small>Spell ${k + 1}${key(k) ? ` <kbd>${esc(key(k))}</kbd>` : ''}</small>${S ? `${icon(h.spells[k])}<b>${esc(S.name)}</b>${S.level > h.level ? `<em>Learned at level ${n(S.level)}</em>` : ''}` : `${icon('plus')}<b>Empty</b>`}</button>`;
    }).join('')}</div>
    <p class="wr-dim">Pick a slot, then the spell to carry in it.</p>
    <div class="wr-spell-cards">${C.spells.map(id => {
      const S = data.classes.spells[id], locked = S.level > h.level, inSlot = h.spells.indexOf(id);
      return `<article class="wr-spell-card${locked ? ' wr-locked' : ''}${inSlot >= 0 ? ' wr-in' : ''}">
        <header>${icon(id)}<div><h3>${esc(S.name)}</h3><p>${esc(spellCost(S))}</p></div></header>
        <p class="wr-spell-what">${esc(spellText(S, s.power, s.spell))}</p>
        <footer><span class="${locked ? 'wr-warn' : ''}">${S.level === 1 ? 'Known from the start' : locked ? `Learned at level ${n(S.level)} (you are ${n(h.level)})` : `Learned at level ${n(S.level)}`}</span>
          ${locked ? `<span class="wr-lockmark">${icon('lock')}</span>` : inSlot === slot ? `<span class="wr-good">${icon('check')}In spell ${slot + 1}</span>` : `<button type="button" class="wr-btn wr-small wr-primary" data-put="${id}">Put in spell ${slot + 1}</button>`}</footer>
      </article>`;
    }).join('')}</div>`;
  }
  root.addEventListener('click', e => {
    const s = e.target.closest('[data-slot]'); if (s) { slot = +s.dataset.slot; app.audio.play('ui.tab'); draw(); return; }
    const p = e.target.closest('[data-put]'); if (!p) return;
    const id = p.dataset.put, other = h.spells.indexOf(id);
    if (other >= 0) h.spells[other] = h.spells[slot];      // swapping two slots keeps both spells
    h.spells[slot] = id;
    app.audio.play('equip'); app.saveNow();
    if (live && app.session && !app.session.online) { const pl = (app.party || []).find(x => x.heroId === h.id), e2 = pl && app.session.G.heroes.find(x => x.pid === pl.pid); if (e2) e2.spells = [...h.spells]; }
    draw();
  });
  draw();
  return sh;
}
