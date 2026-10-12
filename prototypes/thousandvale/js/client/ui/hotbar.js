// Potions and food (protocol §18.10, the lead's call after play-test 2): four consumable slots after the skills on the
// action bar (keys 7 8 9 0), and "use" in the bag (a click on a potion or a meal uses it).
//
//   item {op:'use', uid}            a bag item — or 'id:<item id>' from a slot, so a slot keeps working as the stack runs down
//   itemR {op:'use', ok, why, msg, cd}   refusals said as is (cooldown / out of combat only / full / not yet)
//   you {potionCd: ms}              every potion slot shows the shared 30 s sweep;  you {regen: {kind, ms} | null}  "Eating…"
//
// A slot holds an item KIND (`id`), kept per character in this browser. Drag a potion from the bag onto a slot, or let the
// first potions you carry fill the empty ones; right-click a slot to empty it.

import { h } from '../ui-panel.js';
import { iconFor, onIcon } from './item-icons.js';
import { rememberItems, nameOf } from './item-card.js';
import { isRod } from './angling.js';

export const CONSUMABLE_KINDS = new Set(['potion', 'good', 'food', 'drink']);
export const isConsumable = it => !!it && !isRod(it) && !it.tool && it.kind !== 'tool' && (CONSUMABLE_KINDS.has(it.kind) || !!it.use) && !it.slot && it.type !== 'weapon';
const KEYS = ['Digit7', 'Digit8', 'Digit9', 'Digit0'];
const LABEL = ['7', '8', '9', '0'];
const potionLike = it => it?.kind === 'potion' || /potion|tonic|antidote|draught|elixir/i.test(it?.name || '');

export function createHotbar({ net, hud, bag, me }) {
  const bar = document.getElementById('actionbar');
  const key = () => 'tv.hotbar.' + String(me()?.name || 'x').toLowerCase();
  let ids = [null, null, null, null];
  const load = () => { try { const v = JSON.parse(localStorage.getItem(key()) || 'null'); ids = Array.isArray(v) ? [0, 1, 2, 3].map(i => v[i] || null) : [null, null, null, null]; } catch { ids = [null, null, null, null]; } };
  const save = () => { try { localStorage.setItem(key(), JSON.stringify(ids)); } catch { /* private window */ } };
  const cd = { until: 0, len: 30000 };
  let regen = null;
  const sep = h('span.hb-sep', { 'aria-hidden': 'true' });
  const slots = LABEL.map((k, i) => {
    const b = h('button.slot.hb-slot.empty', { type: 'button', dataset: { hb: String(i) } }, h('span.key', {}, k), h('span.hb-face'), h('b.hb-n'), h('span.cd'));
    b.addEventListener('click', () => use(i));
    b.addEventListener('contextmenu', e => { e.preventDefault(); ids[i] = null; save(); draw(); });
    b.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('text/x-tv-item')) { e.preventDefault(); b.classList.add('drop'); } });
    b.addEventListener('dragleave', () => b.classList.remove('drop'));
    b.addEventListener('drop', e => {
      e.preventDefault(); b.classList.remove('drop');
      let d; try { d = JSON.parse(e.dataTransfer.getData('text/x-tv-item')); } catch { return; }
      const it = bag.state.bag.find(x => x.uid === d.uid);
      if (!isConsumable(it)) { hud.toast('Only potions and food go on these keys.', 'warn'); return; }
      assign(i, it);
    });
    return b;
  });
  // its own little group hung off the RIGHT of the action bar, so the bar keeps its old width (and stays clear of the chat box)
  const group = h('div.hb-group', { 'aria-label': 'Potions and food' }, ...slots);
  bar?.append(group);

  const kindOf = it => it.id || it.baseKey || it.name;
  const stack = id => bag.state.bag.filter(x => isConsumable(x) && kindOf(x) === id);
  function assign(i, it) { const id = kindOf(it); for (let j = 0; j < 4; j++) if (ids[j] === id) ids[j] = null; ids[i] = id; save(); draw(); }
  /** Fill empty slots with the potions/meals you carry (first time you have them). */
  function autoFill() {
    let changed = false;
    // Repair saved slots from before tools were excluded, so a rod cannot keep a potion key occupied.
    ids = ids.map(id => {
      const it = bag.state.bag.find(x => kindOf(x) === id);
      if (id && (isRod({ id }) || (it && !isConsumable(it)))) { changed = true; return null; }
      return id;
    });
    for (const it of bag.state.bag) {
      if (!isConsumable(it) || ids.includes(kindOf(it))) continue;
      const free = ids.indexOf(null); if (free < 0) break;
      ids[free] = kindOf(it); changed = true;
    }
    if (changed) save();
  }
  function draw() {
    for (let i = 0; i < 4; i++) {
      const b = slots[i], id = ids[i], list = id ? stack(id) : [], it = list[0];
      b.classList.toggle('empty', !id);
      b.classList.toggle('none-left', !!id && !list.length);
      const face = b.querySelector('.hb-face'); face.replaceChildren();
      if (it) { rememberItems([it]); const url = iconFor(it); face.append(url ? h('img', { src: url, alt: '' }) : h('span.glyph', {}, (nameOf(it)[0] || '?').toUpperCase())); }
      else if (id) face.append(h('span.glyph', {}, '·'));
      const total = list.reduce((s, x) => s + (x.count || 1), 0);            // U5: stacks
      b.querySelector('.hb-n').textContent = total > 1 ? String(total) : '';
      if (it) { delete b.dataset.tip; b.dataset.tipRender = 'item'; b.dataset.tipItem = String(it.uid); }
      else { delete b.dataset.tipRender; b.dataset.tip = id ? `None left — ${String(id).replace(/_/g, ' ')}` : 'Drag a potion or food here (or buy some: they fill the empty keys)'; }
      b.dataset.potion = it && potionLike(it) ? '1' : '';
    }
  }
  function use(i) {
    const id = ids[i]; if (!id) return;
    if (!stack(id).length) { hud.toast('None left.', 'warn'); return; }
    if (potionLike(stack(id)[0]) && cd.until > performance.now()) { hud.toast(`Potions are not ready (${Math.ceil((cd.until - performance.now()) / 1000)} s).`, 'warn'); return; }
    net()?.item('use', 'id:' + id);
    slots[i].classList.add('pressed'); setTimeout(() => slots[i].classList.remove('pressed'), 110);
  }
  /** A bag click on a consumable. */
  function useItem(it) { if (!isConsumable(it)) return false; net()?.item('use', it.uid); return true; }

  window.addEventListener('keydown', e => {
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const i = KEYS.indexOf(e.code);
    if (i < 0 || e.ctrlKey || e.metaKey || e.altKey || !me()) return;
    e.preventDefault(); use(i);
  });
  function tick() {
    const now = performance.now();
    for (const b of slots) {
      const left = b.dataset.potion === '1' ? Math.max(0, cd.until - now) : 0;
      b.querySelector('.cd').style.setProperty('--p', left > 0 ? (left / cd.len * 100).toFixed(1) + '%' : '0%');
    }
  }
  onIcon(() => draw());
  function wire(n) {
    n.on('joined', j => { load(); autoFill(); draw(); if (j.you?.potionCd) { cd.until = performance.now() + j.you.potionCd; cd.len = Math.max(cd.len, j.you.potionCd); } });
    n.on('bag', () => { autoFill(); draw(); });
    n.on('you', p => {
      if (p.potionCd != null) { cd.until = performance.now() + p.potionCd; cd.len = Math.max(1000, p.potionCd); }
      if ('regen' in p) {
        const was = regen; regen = p.regen;
        if (regen && !was) hud.toast(regen.kind === 'drink' ? 'Drinking…' : 'Eating…', 'info');
        bar?.classList.toggle('eating', !!regen);
      }
    });
    n.on('itemR', r => {
      if (r.op !== 'use' || r.handled) return;      // handled: a crate / gift's own refusal (ui/reveal.js)
      if (r.ok) { if (r.cd && potionLike({ name: r.id, kind: r.kind })) { cd.until = performance.now() + r.cd; cd.len = r.cd; } return; }
      const why = { cooldown: `Not ready yet${r.cd ? ` (${Math.ceil(r.cd / 1000)} s)` : ''}.`, combat: 'Not while fighting — eat once the fight is over.', full: 'You are already at full.', notYet: 'That does nothing yet.', dead: 'You are dead.', item: 'You have none.' };
      hud.toast(r.msg || why[r.why] || 'You cannot use that now.', 'warn');
      if (r.why === 'cooldown' && r.cd) { cd.until = performance.now() + r.cd; }
    });
  }
  return { wire, tick, draw, useItem, assign, get ids() { return ids.slice(); }, slots };
}
