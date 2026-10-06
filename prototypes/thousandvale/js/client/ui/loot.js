// Play-test 2 Q3 (loot stays on the corpse until you take it) and Q4 (party Need / Greed / Skip rolls), protocol v6:
//
//   lootable {id, on}                          a corpse holds something for you -> it sparkles (D-world) and E / a click opens it
//   loot {op:'open'|'take'|'all'|'close', id, uid?} -> lootWin {id, name, items, gold, free?} | lootWin {id, closed}
//   lootR {op, ok:false, why, msg}             a refusal, said as is
//   lootRoll {roll, corpse, item, ms, members} a roll pop-up with a 30 s bar; loot {op:'roll', roll, choice}
//   lootRolled {roll, item, rolls:[{char,name,choice,n}], winner} -> the lines in chat, the pop-up goes
//
// The loot window is a small panel by the corpse list; "Take all" takes everything that fits.

import { h, createPanel } from '../ui-panel.js';
import { send2 } from './net2.js';
import { itemCell, itemName, goldText } from './item-cell.js';
import { onIcon, iconsActive } from './item-icons.js';
import { ROLL_CHOICES, rollLeft, rollLines } from './pt2-core.js';
import { hideTip } from './tips.js';
import { rarityOf } from './inv-core.js';

const LOOT_RANGE = 6;

export function createLoot({ net, hud, actors, me }) {
  const lootable = new Map();          // corpse id -> best rarity in it for me (S23: the marker's colour)
  const W = { id: null, data: null };
  const panel = createPanel({ id: 'loot', title: 'Loot', width: 300, cls: 'loot-panel', onClose: () => { if (W.id != null) send2.loot(net(), 'close', { id: W.id }); W.id = null; W.data = null; iconsActive(false, 'loot'); } });

  // ---- the window ----
  function open(id) {
    const a = actors.get(id), m = me();
    if (!a || !m) return false;
    if (Math.hypot(a.pos.x - m.x, a.pos.z - m.z) > LOOT_RANGE + 0.5) { hud.toast('Too far away to loot.', 'warn'); return true; }
    W.id = id; W.data = null;
    send2.loot(net(), 'open', { id });
    panel.setTitle(a.name || 'Loot', 'Searching…');
    panel.fill(h('p.dim', {}, 'Searching the body…'));
    iconsActive(true, 'loot');
    panel.open();
    return true;
  }
  function draw() {
    const d = W.data;
    if (!d) return;
    const items = d.items || [], free = d.free || [];
    const rows = [];
    if (d.gold > 0) rows.push(h('div.loot-row.gold', { onclick: () => take('gold') }, h('div.islot.gold-slot', {}, h('span.glyph', {}, '◉')), h('b', {}, goldText(d.gold)), h('button.ghost.small', { type: 'button' }, 'Take')));
    for (const it of items) rows.push(row(it));
    if (free.length) { rows.push(h('h4', {}, 'Left by your party (anyone may take it)')); for (const it of free) rows.push(row(it)); }
    const empty = !rows.length;
    const many = (d.corpses || []).length > 1;
    panel.setTitle(d.chest ? (d.name || 'A chest') : many ? `${d.corpses.length} bodies` : (d.name || actors.get(W.id)?.name || 'Loot'), empty ? 'Empty' : `${items.length + free.length} item${items.length + free.length === 1 ? '' : 's'}${d.gold > 0 ? ` · ${goldText(d.gold)}` : ''}`);
    panel.fill(
      empty ? h('p.dim', {}, 'Nothing left.') : h('div.loot-list', {}, ...rows),
      h('div.row.end', {}, h('button.ghost.small', { type: 'button', onclick: () => panel.close() }, 'Close'), empty ? null : h('button.primary.small', { type: 'button', dataset: { act: 'all' }, onclick: takeAll }, 'Take all')));
  }
  function row(it) {
    // S12: rows from several bodies carry which body they lie on (`corpse`); a party-pile row says so
    return h('div.loot-row' + (it.shared ? '.shared' : ''), { dataset: { uid: String(it.uid) }, onclick: () => take(it.uid, it.corpse) }, itemCell(it, { small: true }), itemName(it), it.shared ? h('small.dim', {}, 'party') : null, h('button.ghost.small', { type: 'button' }, 'Take'));
  }
  function take(uid, from = null) { if (W.id == null) return; hideTip(); send2.loot(net(), 'take', uid === 'gold' ? { id: W.id, uid: 'gold' } : { id: from ?? W.id, uid }); }
  function takeAll() { if (W.id == null) return; hideTip(); send2.loot(net(), 'all', { id: W.id }); }
  onIcon(() => { if (panel.isOpen && W.data) { clearTimeout(draw.t); draw.t = setTimeout(draw, 80); } });

  // ---- E near a lootable corpse: the prompt + the key ----
  const prompt = h('div.interact.loot-prompt', { hidden: true }, h('kbd', {}, 'E'), h('span', {}, 'Loot'));
  document.getElementById('hud')?.appendChild(prompt);
  let near = null;
  function nearest() {
    const m = me(); if (!m || !lootable.size) return null;
    let best = null, bd = LOOT_RANGE;
    for (const id of lootable.keys()) { const a = actors.get(id); if (!a) continue; const d = Math.hypot(a.pos.x - m.x, a.pos.z - m.z); if (d < bd) { bd = d; best = a; } }
    return best;
  }
  function tick() {
    for (const id of lootable.keys()) { const el = actors.get(id)?.plate?.root; if (el && !el.classList.contains('has-loot')) markPlate(id); }
    const a = panel.isOpen ? null : nearest();
    if ((a?.id ?? null) !== near) { near = a?.id ?? null; prompt.hidden = near == null; if (a) prompt.querySelector('span').textContent = `Loot ${a.name}`; }
    // walked away from an open corpse: close it
    if (panel.isOpen && W.id != null) { const c = actors.get(W.id), m = me(); if (!c || (m && Math.hypot(c.pos.x - m.x, c.pos.z - m.z) > LOOT_RANGE + 3)) panel.close(); }
  }
  /** E: true when it opened a corpse (main.js stops the key there). */
  function useKey() { if (near == null) return false; open(near); return true; }

  // ---- rolls (Q4) ----
  const rollsEl = h('div.roll-stack', { 'aria-live': 'polite' });
  document.getElementById('hud')?.appendChild(rollsEl);
  const rolls = new Map();
  function onRoll(m) {
    if (!m || m.roll == null || rolls.has(m.roll)) return;
    const it = m.item || {}, ms = m.ms || 30000, at = performance.now();
    const fill = h('i');
    const card = h('div.roll-card.r-' + rarityOf(it), { dataset: { roll: String(m.roll) } },
      h('div.rc-head', {}, itemCell(it, { key: 'roll:' + m.roll, small: true }), h('div.rc-name', {}, itemName(it), h('small', {}, `${(m.members || []).length || 'Your'} ${(m.members || []).length ? 'in the roll' : 'party'} · 30 s`))),
      h('div.rc-bar', {}, fill),
      h('div.rc-btns', {}, ...ROLL_CHOICES.map(c => h('button.' + (c.id === 'need' ? 'primary' : 'ghost') + '.small', { type: 'button', title: c.tip, dataset: { choice: c.id }, onclick: () => choose(m.roll, c.id) }, c.label))));
    rollsEl.appendChild(card);
    iconsActive(true, 'rolls');
    rolls.set(m.roll, { card, fill, at, ms, chose: null, item: it });
    hud.chat(`A roll for ${it.name || 'an item'} — Need, Greed or Skip (30 s).`, 'loot rarity-' + rarityOf(it));
  }
  function choose(roll, choice) {
    const r = rolls.get(roll); if (!r || r.chose) return;
    r.chose = choice;
    send2.loot(net(), 'roll', { roll, choice });
    r.card.classList.add('chosen');
    r.card.querySelector('.rc-btns').replaceChildren(h('span.rc-said', {}, choice === 'skip' ? 'You skipped.' : `You chose ${choice === 'need' ? 'Need' : 'Greed'} — waiting for the others…`));
  }
  function onRolled(m) {
    const lines = rollLines({ item: m.item, results: (m.rolls || []).map(x => ({ name: x.name, choice: x.choice, n: x.n })), winner: m.winner });
    for (const l of lines) hud.chat(l, 'loot rarity-' + rarityOf(m.item || {}));
    const r = rolls.get(m.roll);
    if (r) { r.card.classList.add('done'); setTimeout(() => endRoll(m.roll), 1800); r.card.querySelector('.rc-btns').replaceChildren(h('span.rc-said', {}, lines[lines.length - 1])); }
  }
  function endRoll(roll) { const r = rolls.get(roll); if (!r) return; r.card.remove(); rolls.delete(roll); if (!rolls.size) iconsActive(false, 'rolls'); }
  function tickRolls() {
    const now = performance.now();
    for (const [id, r] of rolls) {
      const left = rollLeft({ at: r.at, ms: r.ms }, now);
      r.fill.style.width = (left / (r.ms / 1000) * 100).toFixed(1) + '%';
      if (left <= 0 && !r.card.classList.contains('done')) { r.card.classList.add('done'); if (!r.chose) r.card.querySelector('.rc-btns').replaceChildren(h('span.rc-said', {}, 'Time ran out — counted as Skip.')); setTimeout(() => endRoll(id), 4000); }
    }
  }

  // S23: a corpse holding loot for you says so on its nameplate (a star in the colour of the best thing in it); D-world glows the body
  function markPlate(id) {
    const a = actors.get(id), el = a?.plate?.root; if (!el) return;
    const r = lootable.get(id);
    el.classList.toggle('has-loot', r != null);
    for (const c of [...el.classList]) if (c.startsWith('loot-')) el.classList.remove(c);
    if (r != null) el.classList.add('loot-' + r);
  }
  function wire(n) {
    n.on('lootable', m => { if (m.on === false) lootable.delete(m.id); else lootable.set(m.id, m.best || m.rarity || 'normal'); markPlate(m.id); });
    n.on('lootWin', m => {
      if (m.closed) { lootable.delete(m.id); markPlate(m.id); if (W.id === m.id) { W.id = null; panel.close(); } return; }
      // S5/S12: a chest's loot, or several bodies looted at once, can arrive without us asking for that exact id
      if (W.id !== m.id) { if (!(m.chest || m.group || (m.corpses && m.corpses.length > 1))) return; W.id = m.id; iconsActive(true, 'loot'); panel.open(); }
      W.data = m; draw();
      if (!(m.items || []).length && !(m.free || []).length && !(m.gold > 0)) lootable.delete(m.id);
    });
    n.on('lootR', r => { if (r.ok === false) hud.toast(r.msg || ({ far: 'Too far away.', gone: 'It is gone.', bagFull: 'Your bag is full.', roll: 'That is up for a party roll.' }[r.why]) || 'You cannot loot that.', 'warn'); });
    n.on('lootRoll', onRoll);
    n.on('lootRolled', onRolled);
    n.on('joined', () => { lootable.clear(); if (panel.isOpen) panel.close(); for (const id of [...rolls.keys()]) endRoll(id); });
  }
  return {
    wire, open, tick: () => { tick(); tickRolls(); }, useKey, onRoll, onRolled, choose, panel,
    isLootable: id => lootable.has(id), lootable,
    get state() { return { open: panel.isOpen ? W.id : null, data: W.data, lootable: [...lootable.keys()], rolls: [...rolls.keys()], prompt: !prompt.hidden }; },
  };
}
