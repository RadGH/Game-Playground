// The spellbook: every spell the hero knows, by class, with its rank, and the 8-slot action bar. To put a spell on the
// bar: choose the spell, then the slot (or the slot, then the spell) — mouse, touch and controller alike, no dragging
// needed. A chosen slot can be cleared. Every spell shows the one tooltip card.
//
//   app.openWindow('spellbook') → .win-spellbook  (.sb-spell[data-spell], .sb-slot[data-slot], [data-act="clear"])
import { openWin, esc } from './kit.js';
import { tipAttrs } from './tip.js';
import { glyph, spellIcon } from './icons.js';
import { spellSources, classDef } from '../../rules/classes.js';
import { maxRankOf } from '../../rules/spells.js';
import { hintFor } from '../input/bindings.js';
import { fmt } from '../../../../../shared/format.js';

export function open(app) {
  const w = openWin({ id: 'spellbook', title: 'Spellbook', size: 'wide', cls: 'win-spellbook', render: (body, tab, w) => render(app, body, w), foot: (el, w) => wire(app, el, w) });
  if (!w._on) { w._on = true; const off = app.on('me', () => { if (w.open) w.render(); else off(); }); }
  return w;
}

const nameOf = (rules, id) => rules.spells[id]?.base?.name || 'Spell';

function render(app, body, w) {
  const c = app.me?.char;
  if (!c) return '<p class="ow-empty">Your character is still on the way.</p>';
  const rules = app.rules, src = spellSources(rules, c), bar = [...(c.bar || [])];
  while (bar.length < 8) bar.push(null);
  const pick = w.data.pick, slot = w.data.slot;
  const slots = bar.map((id, i) => `<button type="button" class="sb-slot${slot === i ? ' is-sel' : ''}${id ? '' : ' is-empty'}" data-slot="${i}" ${id ? tipAttrs('spell', { id }) : ''}>
    <span class="sb-key">${esc(hintFor(app.bindings, `slot${i + 1}`, app.device) || fmt(i + 1))}</span>${id ? spellIcon(id, 40, { cls: src[id]?.cls }) : `<span class="sb-blank">${glyph('plus', 18)}</span>`}<small>${id ? esc(nameOf(rules, id)) : 'Empty'}</small></button>`).join('');
  const by = {};
  for (const [id, s] of Object.entries(src)) (by[s.cls] = by[s.cls] || []).push([id, s]);
  const order = (c.classOrder || Object.keys(by)).filter(k => by[k]);
  const lists = order.length ? order.map(k => `<section class="ow-section"><h3>${esc(classDef(rules, k)?.name || 'Class')}</h3><div class="sb-list">${by[k].map(([id, s]) => {
    const onBar = bar.indexOf(id);
    return `<button type="button" class="sb-spell${pick === id ? ' is-sel' : ''}" data-spell="${esc(id)}" ${tipAttrs('spell', { id })}>${spellIcon(id, 44, { cls: k })}<span class="sb-txt"><b>${esc(nameOf(rules, id))}</b><small>Rank ${fmt(s.rank)} of ${fmt(maxRankOf(rules, id))}${onBar >= 0 ? ` · on slot ${fmt(onBar + 1)}` : ''}</small></span></button>`;
  }).join('')}</div></section>`).join('') : '<p class="ow-empty">You know no spells yet. Classes teach them as you level.</p>';
  const say = pick ? `Now choose a slot for ${nameOf(rules, pick)}.` : slot != null ? `Now choose a spell for slot ${slot + 1}, or clear it.` : 'Choose a spell, then a slot on the bar.';
  return `<section class="sb-bar ow-card"><h3>Action bar</h3><div class="sb-slots">${slots}</div><p class="ow-dim sb-say">${esc(say)}</p></section>${lists}`;
}

function wire(app, el, w) {
  el.innerHTML = `${w.data.slot != null && app.me?.char?.bar?.[w.data.slot] ? `<button type="button" class="ow-btn ow-danger" data-act="clear">${glyph('x', 18)}Clear slot ${fmt(w.data.slot + 1)}</button>` : ''}<button type="button" class="ow-btn" data-act="classes">${glyph('level', 18)}Classes</button>`;
  el.querySelector('[data-act="classes"]').onclick = () => { w.close(); app.openWindow('classes'); };
  el.querySelector('[data-act="clear"]')?.addEventListener('click', () => { app.act('bar', { slot: w.data.slot, spell: '' }); w.data.slot = null; w.render(); });
  const put = (slot, spell) => { app.act('bar', { slot, spell }); app.sfx('ui.click'); w.data.pick = null; w.data.slot = null; w.render(); };
  w.body.querySelectorAll('.sb-slot').forEach(b => { b.onclick = () => { const i = +b.dataset.slot; if (w.data.pick) put(i, w.data.pick); else { w.data.slot = w.data.slot === i ? null : i; w.render(); } }; });
  w.body.querySelectorAll('.sb-spell').forEach(b => { b.onclick = () => { const id = b.dataset.spell; if (w.data.slot != null) put(w.data.slot, id); else { w.data.pick = w.data.pick === id ? null : id; w.render(); } }; });
}
