// Inventory — the Satchel frame's first tab (docs/02 §14; 08 owns every item and number). Paper doll of five gear
// slots, the satchel grid (5 × 4 = 20 at the start, rows bought later), the belt (4 slots that POINT at satchel
// stacks), a stat summary, currencies, and the key ring / strand case / scrap sack lists. Item tooltips compare
// against the worn item side by side with deltas and a derived-stat summary (02 §14.4); Shift pins the compare.
// Every change goes through ctx.actions (equip, unequip, use, drop, junk, belt) — see screens.js defaultActions.
import { el, toast, confirmBox, hp, fmt, pct, sign, cap, itemCard, registerItem, lookupItem, explainStat, RARITY, SLOT_NAMES } from './menukit.js';
import { refreshTip, hideTip } from '../../../../shared/tooltip.js';
import { deriveStats, SLOTS } from '../rpg/hero.js';

export const ICON = { weapon: '⚔', lantern: '✹', coat: '♜', boots: '⚲', trinket: '◈', consumable: '⚱', key: '⚷', quest: '✉', strand: '◇', material: '▪', junk: '·' };
export const iconOf = it => it.icon || ICON[it.slot] || ICON[it.type] || '◆';
const heroOf = ctx => (typeof ctx.hero === 'function' ? ctx.hero() : ctx.hero) || ctx.game?.hero;
const KIND = it => it.slot ? 'gear' : it.type === 'quest' || it.type === 'key' ? 'quest' : it.type === 'consumable' || it.type === 'meal' ? 'consumables' : 'other';
const RANK = { common: 0, fine: 1, rare: 2, relic: 3 };

let IV = null;
export const inventory = {
  id: 'inventory', title: 'Inventory', satchel: true,
  badge(ctx) { return (heroOf(ctx)?.satchel || []).some(i => i?.isNew); },
  render(root, ctx) {
    const H = heroOf(ctx); if (!H) { root.append(el('p', { class: 'dim', text: 'No character yet.' })); return; }
    IV = { ctx, H, root, filter: IV?.filter || 'all', sort: IV?.sort || 'type', hideJunk: IV?.hideJunk || false, sel: null, pinned: null, list: null };
    draw();
  },
  onKey(code, e) {
    if (!IV) return false;
    const it = focusedItem(); const worn = document.activeElement?.dataset?.worn;
    if (code === 'Enter' && (it || worn)) { if (worn) act('unequip', worn); else primary(it); return true; }
    if (code === 'KeyX' && it) { act('junk', it); return true; }
    if (code === 'Delete' && it) { drop(it); return true; }
    if (code === 'KeyF' && it) { fasten(it); return true; }
    if ((code === 'ShiftLeft' || code === 'ShiftRight') && !e.repeat) { IV.shift = !IV.shift; refreshTip(); return true; }
    return false;
  },
  destroy() { IV = null; },
  tips(ctx) { return { item: node => itemTip(ctx, node), stat: node => statTip(ctx, node) }; },
};
export const screens = [inventory];

function focusedItem() { const u = document.activeElement?.dataset?.tipItem; return u && !document.activeElement.dataset.worn ? lookupItem(u, IV.H) : null; }
function act(name, arg, k) {
  const r = IV.ctx.actions[name]?.(arg, k); if (typeof r === 'string') { toast(r, 'bad'); IV.ctx.sound?.('ui.error'); }
  hideTip(); draw();
}
function primary(it) { if (it.slot) act('equip', it); else if (it.type === 'consumable' || it.type === 'meal') act('use', it); else toast('Nothing to do with that here.'); }
async function drop(it) {
  if (it.type === 'key' || it.type === 'quest') { toast('Keys and quest items cannot be dropped.', 'bad'); return; }
  if (it.rarity === 'rare' || it.rarity === 'relic') { if (!(await confirmBox(IV.root.closest('.scr'), { title: `Drop ${it.name}?`, text: 'It stays on the ground where you stand.', yes: 'Drop' }))) return; }
  act('drop', it);
}
function fasten(it) {
  if (it.type !== 'consumable') { toast('Only consumables go on the belt.', 'bad'); return; }
  const b = IV.H.belt || []; const cur = b.indexOf(it.uid); const next = cur < 0 ? 0 : cur >= 3 ? null : cur + 1;
  act('belt', it, next); toast(next == null ? `${it.name} is off the belt.` : `${it.name} → belt ${next + 1} (${['Z', 'X', 'C', 'V'][next]})`);
}

function cell(it, opts = {}) {
  if (!it) return el('div', { class: 'cell empty', 'aria-hidden': 'true', text: opts.label || '' });
  registerItem(it);
  const r = RARITY[it.rarity] || RARITY.common;
  const c = el('button', { type: 'button', class: 'cell', style: { borderColor: it.slot ? r.color : '#3a4454', color: it.slot ? r.color : '#d9dee6' }, draggable: 'true',
    'aria-label': `${it.name}${it.qty > 1 ? ' ×' + it.qty : ''}${it.junk ? ', junk' : ''}`, dataset: { tipRender: 'item', tipItem: String(it.uid), k: 'it' + it.uid, ...(opts.worn ? { worn: opts.worn } : {}) } },
    iconOf(it), it.qty > 1 ? el('span', { class: 'cnt', text: hp(it.qty) }) : null, it.isNew ? el('span', { class: 'new' }) : null, it.junk ? el('span', { class: 'junk', text: 'junk' }) : null);
  c.addEventListener('pointerenter', () => { if (it.isNew) { it.isNew = false; c.querySelector('.new')?.remove(); } });
  c.addEventListener('dblclick', () => opts.worn ? act('unequip', opts.worn) : primary(it));
  c.addEventListener('click', e => { if (e.altKey) { e.preventDefault(); act('junk', it); } else if (it.slot && IV) IV.pinned = it; });
  c.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(it.uid)); e.dataTransfer.effectAllowed = 'move'; hideTip(); });
  return c;
}
function dropZone(node, onDrop) {
  node.addEventListener('dragover', e => { e.preventDefault(); node.classList.add('drop-ok'); });
  node.addEventListener('dragleave', () => node.classList.remove('drop-ok'));
  node.addEventListener('drop', e => { e.preventDefault(); node.classList.remove('drop-ok'); const it = lookupItem(e.dataTransfer.getData('text/plain'), IV.H); if (it) onDrop(it); });
  return node;
}

function draw() {
  const { H, ctx, root } = IV; const D = ctx.data;
  const fk = document.activeElement?.dataset?.k;
  const cap_ = H.satchelSlots ?? 20;
  let items = (H.satchel || []).filter(Boolean);
  if (IV.filter === 'junk') items = items.filter(i => i.junk); else if (IV.filter !== 'all') items = items.filter(i => KIND(i) === IV.filter);
  if (IV.hideJunk && IV.filter !== 'junk') items = items.filter(i => !i.junk);
  const sorters = { type: (a, b) => (a.slot || a.kind || '').localeCompare(b.slot || b.kind || ''), rarity: (a, b) => (RANK[b.rarity] ?? -1) - (RANK[a.rarity] ?? -1), newest: (a, b) => (b.found || 0) - (a.found || 0), value: (a, b) => (b.value || b.price || 0) - (a.value || a.price || 0) };
  items = [...items].sort(sorters[IV.sort]);
  // worn
  const slotCell = s => { const it = H.equipped?.[s]; const c = it ? cell(it, { worn: s }) : el('div', { class: 'cell empty', text: '' }, el('span', { class: 'slotname', text: SLOT_NAMES[s] })); if (it) c.append(el('span', { class: 'slotname', text: SLOT_NAMES[s] })); return dropZone(c, x => { if (x.slot !== s) { toast(`That goes in the ${SLOT_NAMES[x.slot] || '—'} slot.`, 'bad'); return; } act('equip', x); }); };
  const doll = el('div', { class: 'lf-doll' },
    el('div', { style: { gridColumn: 1, gridRow: 1 } }, slotCell('weapon')), el('div', { class: 'fig', 'aria-hidden': 'true', text: '♙' }), el('div', { style: { gridColumn: 3, gridRow: 1 } }, slotCell('lantern')),
    el('div', { style: { gridColumn: 1, gridRow: 2 } }, slotCell('coat')), el('div', { style: { gridColumn: 3, gridRow: 2 } }, slotCell('boots')),
    el('div', { style: { gridColumn: 1, gridRow: 3 } }, slotCell('trinket')));
  // satchel grid
  const grid = dropZone(el('div', { class: 'lf-grid', role: 'grid', 'aria-label': 'Satchel' }), it => { const s = Object.entries(H.equipped || {}).find(([, v]) => v === it); if (s) act('unequip', s[0]); });
  for (const it of items) grid.append(cell(it));
  for (let k = 0, n = Math.max(0, cap_ - H.satchel.filter(Boolean).length); k < n; k++) grid.append(cell(null));
  // belt
  const belt = el('div', { class: 'lf-belt' }, el('span', { class: 'small dim', text: 'Belt' }),
    H.flask ? el('div', { class: 'cell', 'data-tip': `Guild flask: pours 40 oil over 0.4 s. ${H.flask.charges} of ${H.flask.max} charges; refilled at lamp-posts.` }, '⚱', el('span', { class: 'cnt', text: '●'.repeat(H.flask.charges) + '○'.repeat(Math.max(0, H.flask.max - H.flask.charges)) })) : null,
    ...[0, 1, 2, 3].map(k => { const it = lookupItem(H.belt?.[k], H); const c = it ? cell(it) : el('div', { class: 'cell empty', text: '—' }); c.prepend(el('kbd', { text: ['Z', 'X', 'C', 'V'][k] })); return dropZone(c, x => { if (x.type !== 'consumable') { toast('Only consumables go on the belt.', 'bad'); return; } act('belt', x, k); }); }));
  // summary
  const s = H.stats && Object.keys(H.stats).length ? H.stats : (D.classes ? deriveStats(H, D) : {});
  const sum = [['Health', hp(s.maxHp), 'maxHp'], ['Oil', hp(s.maxOil), 'maxOil'], ['Armour', hp(s.armour), 'armour'], ['Spell power', sign((s.spellPower || 0) * 100, { decimals: 1 }) + '%', 'spellPower'], ['Crit', pct(s.critChance || 0, 1), 'critChance'], ['Oil regen', fmt(s.oilRegen) + '/s', 'oilRegen']];
  const summary = el('div', { class: 'lf-panel' }, el('h3', { class: 'lf-h', text: 'Summary' }), el('div', { class: 'lf-summary' }, sum.map(([k, v, id]) => [el('span', { class: 'dim', 'data-tip-render': 'stat', 'data-tip-stat': id, tabindex: -1, text: k }), el('span', { class: 'num', text: v })]).flat()),
    el('p', { class: 'small' }, el('span', { class: 'gold', text: `● ${hp(H.currency?.pennies || 0)} pennies` }), '   ', el('span', { text: `◆ ${hp(H.currency?.pearls || 0)} pearls` })));
  const lists = el('div', { class: 'col small' },
    listToggle('Key ring', H.keys || [], k => k.name || cap(String(k))), listToggle('Strand case', [...(H.unlocked?.flames || []), ...(H.unlocked?.shapes || []), ...(H.unlocked?.charms || [])], x => cap(x)),
    el('span', {}, `Scrap sack: ${hp(H.scrap || 0)} · strand dust ${hp(H.strandDust || 0)}`));
  const filters = el('div', { class: 'col' },
    el('label', { class: 'row small' }, 'Filter', el('select', { onchange: e => { IV.filter = e.target.value; draw(); } }, ['all', 'gear', 'consumables', 'quest', 'junk'].map(v => el('option', { value: v, text: cap(v), selected: v === IV.filter })))),
    el('label', { class: 'row small' }, 'Sort', el('select', { onchange: e => { IV.sort = e.target.value; draw(); } }, ['type', 'rarity', 'newest', 'value'].map(v => el('option', { value: v, text: cap(v), selected: v === IV.sort })))),
    el('label', { class: 'row small' }, el('input', { type: 'checkbox', checked: IV.hideJunk, onchange: e => { IV.hideJunk = e.target.checked; draw(); } }), 'Hide junk'),
    cap_ < 35 ? el('p', { class: 'dim tiny', text: "More rows at Crane's Pawn." }) : null, lists);
  root.replaceChildren(
    el('div', { class: 'lf-inv' },
      el('div', { class: 'col' }, el('div', { class: 'lf-panel' }, el('h3', { class: 'lf-h', text: 'Worn' }), doll), summary),
      el('div', { class: 'col' }, el('div', { class: 'lf-panel col' }, el('h3', { class: 'lf-h', text: `Satchel (${H.satchel.filter(Boolean).length}/${cap_})` }), grid, belt),
        el('p', { class: 'lf-keys', text: '[Enter] Equip / use   [X] Junk   [Del] Drop   [F] Belt   [Shift] Compare   Drag to a slot or the belt' })),
      filters));
  if (fk) root.querySelector(`[data-k="${CSS.escape(fk)}"]`)?.focus(); else if (!root.contains(document.activeElement)) root.querySelector('.lf-grid .cell:not(.empty)')?.setAttribute('data-autofocus', '');
}
function listToggle(label, list, name) {
  const d = el('details', {}, el('summary', { text: `${label} (${list.length}) ▸` }), el('div', { class: 'dim', text: list.length ? list.map(name).join(', ') : 'empty' }));
  return d;
}

/** Item tooltip with side-by-side compare (02 §14.4): the hovered card with its deltas, the worn card, and the
 *  derived totals as if equipped (04 formulas via deriveStats). Shift compares against the item you last clicked. */
function itemTip(ctx, node) {
  const H = heroOf(ctx), D = ctx.data; const it = lookupItem(node.dataset.tipItem, H); if (!it) return null;
  const worn = it.slot && !node.dataset.worn ? H?.equipped?.[it.slot] || null : undefined;
  const against = IV?.shift && IV.pinned && IV.pinned !== it ? IV.pinned : worn;
  if (!it.slot || against === undefined) return itemCard(it, D, { hero: H, sell: it.sellPrice });
  const card = itemCard(it, D, { hero: H, compareTo: against, sell: it.sellPrice });
  if (!against) return card;
  let summary = null;
  if (D?.classes && H) {
    const now = deriveStats(H, D); const then = deriveStats({ ...H, equipped: { ...H.equipped, [it.slot]: it } }, D); deriveStats(H, D);
    const parts = [['maxHp', 'Health', v => sign(Math.round(v))], ['maxOil', 'Oil', v => sign(Math.round(v))], ['spellPower', 'Wick power', v => sign(v * 100, { decimals: 1 }) + '%'], ['armour', 'Armour', v => sign(v)], ['critChance', 'Crit', v => sign(v * 100, { decimals: 1 }) + '%'], ['oilRegen', 'Oil regen', v => sign(v) + '/s'], ['lightRadius', 'Light', v => sign(Math.round(v))]]
      .map(([k, n, f]) => { const d = (then[k] || 0) - (now[k] || 0); return Math.abs(d) > 1e-6 ? el('span', { class: d > 0 ? 'good' : 'bad', text: `${n} ${f(d)}` }) : null; }).filter(Boolean);
    summary = el('div', { class: 'summary' }, parts.length ? parts.flatMap((p, i) => i ? [' · ', p] : [p]) : el('span', { class: 'dim', text: 'No change to your totals.' }));
  }
  return el('div', {}, el('div', { class: 'lf-compare' }, card, itemCard(against, D, { hero: H, label: IV?.shift && IV.pinned ? 'Pinned' : 'Worn' })), summary);
}
function statTip(ctx, node) {
  const H = heroOf(ctx); if (!H || !ctx.data?.classes) return null;
  return el('div', { class: 'lf-card' }, explainStat(node.dataset.tipStat, H, deriveStats(H, ctx.data), ctx.data));
}
