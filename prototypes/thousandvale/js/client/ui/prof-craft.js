// W9 professions — the crafting window (one window for every station) and, inside it, tempering.
//
//   Crafting   a tab per craft this station serves (Smithing, Outfitting, Alchemy, Cooking, Tempering). Each recipe:
//              what it makes, what it needs against what you carry, the fee, why you cannot (the server's own words),
//              and for gear the base you want and the chances a better job gives — then Make -> the mini-game -> the card.
//   Tempering  pick the work (Temper / Promote / Reweave / Brand), pick an item from your bag, pick the property or the
//              element when the work asks for one; the server's quote says what it costs and what it will do, with the
//              numbers. A miss spends the materials, never the item.
//
// Every number shown is the server's (`craftList` rows, `craftQuote`) or is worked out from data/rules/professions.json
// (the rarity chances) — nothing is typed in here. Server messages: docs/requests.md "Round 8 contracts — P-core".

import { createPanel, h } from '../ui-panel.js';
import { fmt } from '../../../../../shared/format.js';
import { RARITY_NAME, rarityOf, slotOf } from './inv-core.js';
import { rememberItems } from './item-card.js';
import { profIcon, PROF_NAME, PROF_TINT } from './prof-icons.js';

/** The legendary power a quote or a finished work names (the server's `power` / `now`), as one sentence — or null. Pure. */
export function powerOf(m) { const p = m && (m.power || m.now); if (!p || typeof p !== 'object') return null; if (p.id && p.id !== 'legendary_effect' && !p.legendaryId) return null; return p.descriptor || p.text || p.desc || (p.name && p.name !== 'Legendary' ? p.name : null); }
/** Nested lists of nodes (and nulls) -> one flat list of nodes. */
const flatKids = k => [k].flat(Infinity).filter(x => x != null && x !== false);
const pct = v => fmt(v * 100, { decimals: 0 }) + '%';
const MAKING = ['smithing', 'outfitting', 'alchemy', 'cooking', 'tempering'];
const KIND_WORD = { material: 'Material', good: 'Goods', potion: 'Potion', tool: 'Tool', gear: 'Gear', temper: 'Tempering' };
const ELEMENT_NAME = { fire: 'Fire', ice: 'Ice', lightning: 'Lightning', poison: 'Poison', shadow: 'Shadow', holy: 'Holy', arcane: 'Arcane' };

/**
 * What better work gives on a gear recipe, from the data file's own table: [{ quality, word, magic, rare }] for the
 * qualities that can give anything. `surplus` = your skill past the recipe's (capped as the rules cap it). Pure.
 */
export function gearChances(numbers, surplus = 0) {
  const R = numbers?.craft?.rarity; if (!R) return [];
  const sur = Math.max(0, Math.min(R.maxSurplus ?? 30, surplus)), names = numbers.quality?.name || {};
  return ['good', 'fine', 'perfect'].map(q => {
    const m = R.magic?.[q] || 0, r = R.rare?.[q] || 0;
    const rare = r > 0 ? r + sur * (R.perSkill?.rare || 0) : 0, magic = m > 0 ? m + sur * (R.perSkill?.magic || 0) : 0;
    return { quality: q, word: names[q] || q, magic: Math.min(1 - Math.min(1, rare), magic), rare: Math.min(1, rare) };
  }).filter(x => x.magic > 0 || x.rare > 0);
}
/** How many of a recipe one batch can make: what the materials and the gold allow, up to the server's cap; 1 for gear and for what you cannot make. Pure. */
export function batchTimes(r, cap = 10, gold = Infinity) {
  if (!r || !r.can || r.kind === 'gear' || r.kind === 'temper' || r.kind === 'tool') return 1;
  let k = Math.max(1, cap || 1);
  for (const n of r.needs || []) k = Math.min(k, Math.floor((n.have ?? 0) / Math.max(1, n.n)));
  if (r.gold > 0) k = Math.min(k, Math.floor(gold / r.gold));
  return Math.max(1, k);
}
/** The recipes of one craft, the ones you can make first, then by tier and skill. Pure. */
export function recipeRows(recipes, prof) {
  return (recipes || []).filter(r => r.prof === prof && r.kind !== 'temper').sort((a, b) => (b.can ? 1 : 0) - (a.can ? 1 : 0) || (a.tier || 1) - (b.tier || 1) || (a.skill || 1) - (b.skill || 1) || String(a.name).localeCompare(String(b.name)));
}
/** Which tabs a list has, in the fixed order. Pure. */
export function craftTabs(list) {
  const have = new Set((list?.recipes || []).map(r => r.prof));
  const kinds = list?.station?.kinds || null;
  return MAKING.filter(p => have.has(p) && (!kinds || kinds.includes(p) || p === 'cooking'));
}
/** Bag items a tempering work can be offered for (gear with a slot; the server has the last word). Pure. */
export function temperCandidates(bag, op) {
  return (bag || []).filter(it => it && it.uid != null && slotOf(it) && !['mount', 'tool'].includes(slotOf(it)) && (op !== 'temper_brand' || it.type === 'weapon' || slotOf(it) === 'weapon'));
}

export function createCraftWindow({ net, hud, bag, numbers = () => null, onMake, onTemper }) {
  const S = { list: null, tab: null, npc: null, busy: false, base: {}, op: 'temper_quality', uid: null, index: 0, element: 'fire', quote: null, asked: '', lastTemper: null };
  const panel = createPanel({ id: 'craft', title: 'Crafting', width: 470, cls: 'craft-panel', onOpen: () => { ask(); draw(); }, onClose: () => { S.quote = null; } });
  const myGold = () => { const g = bag?.state?.gold ?? net()?.joined?.you?.gold; return Number.isFinite(g) ? g : Infinity; };
  const send = (op, a = {}) => { const n = net(); if (!n?.joined || typeof n.craft !== 'function') return false; n.craft(op, a); return true; };
  function ask() { send('list', S.npc != null ? { npc: S.npc } : {}); }
  function askQuote() {
    if (S.uid == null) { S.quote = null; return; }
    const key = `${S.op}|${S.uid}|${S.index}|${S.element}`; S.asked = key;
    send('quote', { id: S.op, uid: S.uid, npc: S.npc ?? undefined, ...(S.op === 'temper_reweave' ? { index: S.index } : {}), ...(S.op === 'temper_brand' ? { element: S.element } : {}) });
  }

  // (round 9, X5: a `kept` material — the Sovereign Core — is needed but NOT spent when the gauge is missed: its chip says so)
  const needChips = needs => h('span.pc-needs', {}, ...(needs || []).map(n => h('span.' + ((n.have ?? 0) >= n.n ? 'ok' : 'lack') + (n.kept ? '.kept' : ''), n.kept ? { dataset: { tip: `${n.name} is needed for this work, and you keep it if the gauge is missed.` } } : {}, `${fmt(n.have ?? 0, { decimals: 0 })}/${fmt(n.n, { decimals: 0 })} ${n.name}`, n.kept ? h('em', {}, 'kept on a miss') : null)));
  const feeNode = gold => (gold > 0 ? h('span.pc-fee', {}, `${fmt(gold, { decimals: 0 })} gold`) : null);

  function recipeRow(r) {
    const N = numbers(), myLevel = S.list?.level?.[r.prof] || 1;
    const bases = (r.bases || []).filter(b => b.can !== false), baseKey = S.base[r.id] && bases.some(b => b.key === S.base[r.id]) ? S.base[r.id] : bases[0]?.key;
    const chances = r.kind === 'gear' ? gearChances(N, myLevel - (r.skill || 1)) : [];
    const times = batchTimes(r, N?.craft?.batchMax, myGold());
    const makes = r.makes ? `${r.makes.n > 1 ? r.makes.n + ' × ' : ''}${r.makes.name}` : r.name;
    return h('li.pc-row' + (r.can ? '' : '.no'), { dataset: { id: r.id } },
      h('div.pc-main', {},
        h('div.pc-top', {}, h('b', {}, r.name), h('span.pc-kind', {}, `${KIND_WORD[r.kind] || 'Item'} · tier ${r.tier || 1}`), r.kind === 'gear' && r.level ? h('span.pc-kind', {}, `item level ${r.level}`) : null),
        r.kind !== 'gear' && r.makes ? h('small', {}, `Makes ${makes}${r.makes.text ? ' — ' + r.makes.text : ''}`) : r.desc ? h('small', {}, r.desc) : null,
        r.kind === 'gear' && (r.bases || []).length > 1 ? h('label.pc-base', {}, 'As ',
          h('select', { onchange: e => { S.base[r.id] = e.target.value; } }, ...(r.bases || []).map(b => h('option', { value: b.key, selected: b.key === baseKey, disabled: b.can === false }, b.name + (b.can === false ? ' (not yet)' : ''))))) : null,
        chances.length ? h('small.pc-band', { dataset: { tip: 'How well you play the mini-game decides this. Every skill point past the recipe adds a little.' } },
          'Better work, better gear: ', chances.map(c => `${c.word} ${pct(c.magic)} ${RARITY_NAME.magic.toLowerCase()}${c.rare > 0 ? ', ' + pct(c.rare) + ' ' + RARITY_NAME.rare.toLowerCase() : ''}`).join(' · ')) : null,
        h('div.pc-cost', {}, needChips(r.needs), feeNode(r.gold)),
        r.why ? h('small.pc-why', {}, r.why) : null),
      h('div.pc-btns', {},
        h('button.primary.pc-make', { type: 'button', disabled: !r.can || S.busy, dataset: { make: r.id }, onclick: () => { if (S.busy) return; onMake?.(r, { base: baseKey, npc: S.npc }); } }, verbOf(r.prof)),
        // a batch: as many as your materials and gold allow (the server's cap), for ONE mini-game — how well you play it counts for all of them
        times > 1 ? h('button.ghost.pc-batch', { type: 'button', disabled: !r.can || S.busy, dataset: { batch: r.id, n: times, tip: `Make ${times} in one go. One mini-game decides the quality of all of them.` }, onclick: () => { if (S.busy) return; onMake?.(r, { n: times, npc: S.npc }); } }, `× ${times}`) : null));
  }
  const verbOf = prof => ({ smithing: 'Forge', outfitting: 'Stitch', alchemy: 'Brew', cooking: 'Cook', tempering: 'Temper' }[prof] || 'Make');

  function temperPane() {
    const ops = (S.list?.recipes || []).filter(r => r.kind === 'temper');
    if (!ops.length) return [h('p.empty', {}, 'Nothing to temper here.')];
    if (!ops.some(o => o.id === S.op)) S.op = ops[0].id;
    const op = ops.find(o => o.id === S.op), items = temperCandidates(bag?.state?.bag, S.op);
    rememberItems(items);
    if (S.uid != null && !items.some(it => it.uid === S.uid)) { S.uid = null; S.quote = null; }
    const it = items.find(x => x.uid === S.uid) || null, q = S.quote && S.quote.uid === S.uid && S.quote.id === S.op ? S.quote : null;
    const props = it ? (it.affixes || []).filter(a => !a.baseIntrinsic) : [];
    const pickItem = uid => { S.uid = uid; S.index = 0; S.quote = null; askQuote(); draw(); };
    const F = flatKids;
    return [
      h('div.pt-ops', { role: 'tablist' }, ...ops.map(o => h('button.chip' + (o.id === S.op ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(o.id === S.op), dataset: { op: o.id }, onclick: () => { S.op = o.id; S.quote = null; askQuote(); draw(); } }, o.name))),
      h('p.pt-what', {}, op.desc), op.why ? h('p.pc-why', {}, op.why) : null,
      op.legendary ? h('p.pt-legend', {}, h('b.r-legendary', {}, 'Rare to legendary'), ` needs a ${op.legendary.material?.name || 'Sovereign Core'} and Tempering ${op.legendary.skill}. The item keeps every property and gains one legendary power.`) : null,
      h('div.pt-cols', {},
        h('div.pt-items', {}, h('span.pt-h', {}, 'From your bag'),
          items.length ? h('ul.pt-list', {}, ...items.map(x => h('li', {}, h('button.pt-item.r-' + rarityOf(x) + (x.uid === S.uid ? '.on' : ''), { type: 'button', dataset: { uid: x.uid, tipItem: x.uid }, onclick: () => pickItem(x.uid) },
            h('b', {}, x.name), h('small', {}, `${RARITY_NAME[rarityOf(x)] || ''}${x.quality ? ' · ' + x.quality + ' quality' : ''}${x.ilvl ? ' · level ' + x.ilvl : ''}`)))))
            : h('p.empty', {}, S.op === 'temper_brand' ? 'No weapon in your bag. Take the one you want branded out of your hands first.' : 'No gear in your bag. Take the piece off first — tempering works on what you carry, not what you wear.')),
        h('div.pt-quote', {}, h('span.pt-h', {}, 'The work'),
          ...F(!it ? h('p.empty', {}, 'Pick an item on the left.') : [
            h('strong.r-' + rarityOf(it), {}, it.name),
            S.op === 'temper_reweave' ? (props.length ? h('label.pc-base', {}, 'Replace ', h('select', { onchange: e => { S.index = +e.target.value; S.quote = null; askQuote(); draw(); } }, ...props.map((a, i) => h('option', { value: i, selected: i === S.index }, a.text || a.name || a.stat || `Property ${i + 1}`)))) : h('small.pc-why', {}, 'This item has no rolled property to replace.')) : null,
            S.op === 'temper_brand' ? h('div.pt-els', {}, ...(op.elements || []).map(el => h('button.chip.small' + (el === S.element ? '.on' : ''), { type: 'button', dataset: { el }, onclick: () => { S.element = el; S.quote = null; askQuote(); draw(); } }, ELEMENT_NAME[el] || el))) : null,
            !q ? h('p.dim', {}, 'Asking what it would take…') : [
              q.to ? h('div.pt-to', {}, h('span.r-' + rarityOf(it), {}, RARITY_NAME[rarityOf(it)] || rarityOf(it)), h('i', { 'aria-hidden': 'true' }, '→'), h('b.r-' + q.to, {}, RARITY_NAME[q.to] || q.to)) : null,
              q.text ? h('p.pt-text' + (q.can ? '' : '.pc-why'), {}, q.text) : null,
              powerOf(q) ? h('p.pt-power.r-legendary', {}, 'It will gain: ', h('b', {}, powerOf(q))) : null,
              h('div.pc-cost', {}, needChips(q.needs), feeNode(q.gold)),
              Number.isFinite(q.skill) ? h('small', {}, `Needs Tempering ${q.skill} — yours is ${S.list?.level?.tempering || 1}.`) : null,
              q.can || (q.why && q.why === q.text) ? null : h('small.pc-why', {}, q.why || 'You cannot do that yet.'),
              q.can || (q.needs || []).length ? h('small.pt-safe', {}, 'A miss spends the materials and the fee. The item is never harmed.') : null,
            ],
            S.lastTemper && S.lastTemper.uid === it.uid ? h('p.pt-last', {}, S.lastTemper.text) : null,
            h('button.primary.wide', { type: 'button', disabled: !q?.can || S.busy, dataset: { temper: S.op }, onclick: () => { if (!S.busy) onTemper?.(op, { uid: S.uid, npc: S.npc, ...(S.op === 'temper_reweave' ? { index: S.index } : {}), ...(S.op === 'temper_brand' ? { element: S.element } : {}) }, it); } }, op.name),
          ]))),
    ];
  }

  function draw() {
    if (!panel.isOpen) return;
    const L = S.list;
    if (!L) { panel.setTitle('Crafting', ''); panel.fill(h('p.dim', {}, 'Asking what can be made here…')); return; }
    if (L.ok === false) { panel.fill(h('p.empty', {}, L.msg || 'Nothing can be made here.')); return; }
    const tabs = craftTabs(L);
    if (!tabs.includes(S.tab)) S.tab = tabs[0] || null;
    panel.setTitle('Crafting', L.station ? `At ${L.station.name}` : 'No station here');
    const strip = h('div.pc-tabs', { role: 'tablist' }, ...tabs.map(p => h('button.pc-tab' + (p === S.tab ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': String(p === S.tab), dataset: { tab: p }, onclick: () => { S.tab = p; draw(); if (p === 'tempering') askQuote(); } },
      profIcon(p, 18), h('span', {}, PROF_NAME[p] || p), h('i', {}, String(L.level?.[p] ?? 1)))));
    const rows = S.tab && S.tab !== 'tempering' ? recipeRows(L.recipes, S.tab) : [];
    panel.fill(
      !L.station ? h('p.tiny-left.warn-text', {}, 'You can read every recipe here. To make one, stand in the craftsman’s building: the smith for metal, the tailor or bowyer for cloth, leather and bows, the apothecary for potions, any fire for cooking.') : null,
      tabs.length ? strip : null,
      !tabs.length ? h('p.empty', {}, 'No recipes yet. A craftsman in town teaches the trade — it costs nothing.')
        : S.tab === 'tempering' ? h('div.pt', {}, ...flatKids(temperPane()))
        : rows.length ? h('ul.pc-list', {}, ...rows.map(recipeRow)) : h('p.empty', {}, `No ${PROF_NAME[S.tab] || ''} recipes at your skill yet.`));
    const t = panel.body.querySelector('.pc-tab.on'); if (t) t.style.setProperty('--pt', PROF_TINT[S.tab] || '#d9b26a');
  }

  return {
    panel, draw, ask,
    open({ npc = null, tab = null } = {}) { S.npc = npc; if (tab) S.tab = tab; if (panel.isOpen) { ask(); draw(); } else panel.open(); },
    setBusy(on) { S.busy = !!on; draw(); },
    onList(m) { S.list = m; if (S.tab === 'tempering' && S.uid != null && !S.quote) askQuote(); draw(); },
    onQuote(m) { if (`${m.id}|${m.uid}|${S.index}|${S.element}` !== S.asked && (m.id !== S.op || m.uid !== S.uid)) return; S.quote = m; draw(); },
    onTempered(m) { if (m.item) { S.lastTemper = { uid: m.item.uid, text: m.msg || '' }; rememberItems([m.item]); } S.quote = null; askQuote(); draw(); },
    onBag() { if (panel.isOpen && S.tab === 'tempering') draw(); },
    showTab(tab) { S.tab = tab; draw(); },
    get state() { return { open: panel.isOpen, tab: S.tab, tabs: craftTabs(S.list), station: S.list?.station || null, recipes: (S.list?.recipes || []).length, busy: S.busy, op: S.op, uid: S.uid, quote: S.quote }; },
  };
}
