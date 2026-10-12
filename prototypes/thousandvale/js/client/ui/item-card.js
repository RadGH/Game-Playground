// Item cards on the shared tooltip (play-test P5/P7/P15): any element with
//   data-tip-render="item" data-tip-item="<uid>"
// shows the full card for that item — name in its rarity colour, slot and base, the REQUIRED LEVEL (red when
// you are below it), damage/armour, every property in plain words (Farhold's own describeAffix), and how it
// compares with what you are wearing (hold Shift to compare against the other hand / other ring).
//
//   import { installItemCards, rememberItems } from './ui/item-card.js';
//   installItemCards({ equipment: () => worn, level: () => myLevel });
//   rememberItems(list);       // bag, equipment, mail attachments: anything a card may be asked about

import { registerTip, refreshTip } from './tips.js';
import { slotOf, altSlotOf, SLOT_NAME, RARITY_NAME, rarityOf, levelCheck, compareTo, plainScore } from './inv-core.js';
import { iconFor } from './item-icons.js';
import { isCrate, crateLines, rarityClass } from './pt5-core.js';
import { potionLine } from './pt6-core.js';
import { bagSlotsText } from './pt8-core.js';
import { handLine, apsLine, showsDamage } from './pt10-core.js';
import { fmt, pct } from '../../../../../shared/format.js';

const items = new Map();                       // uid -> item
export function rememberItems(list) { for (const it of list || []) if (it && it.uid != null) items.set(String(it.uid), it); }
export const itemByUid = uid => items.get(String(uid)) || null;

let F = { describe: null, score: null, name: null };
// C's wording (js/rules/wording.js, pure): Farhold's "companions" reads "your followers" — one vocabulary on every card (T2)
let who = t => t;
import('../../rules/wording.js').then(m => { if (typeof m.whoText === 'function') who = t => { try { return m.whoText(t) || t; } catch { return t; } }; }).catch(() => {});
// play-test 6 (U6): every property line is C's `affixText` (js/rules/item-text.js) — the one place that knows which stats are
// fractions and which are percents ("0.2% chance to block" was a fraction printed as a percent). No arithmetic here.
let ruleText = null;
import('../../rules/item-text.js').then(m => { if (typeof m.affixText === 'function') ruleText = m.affixText; }).catch(() => {});
const fload = Promise.all([import('../../../../farhold/js/effects.js'), import('../../../../farhold/js/rpg.js')])
  .then(([e, r]) => { F = { describe: e.describeAffix, score: r.itemScore, name: r.displayName }; }).catch(() => {});
export const farholdReady = () => fload;
export const scoreOf = it => (F.score ? F.score(it) : plainScore(it));
export const nameOf = it => (F.name ? F.name(it) : String(it?.name || 'Item'));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const title = s => String(s || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
function affixText(a) {
  if (a.text) return who(a.text);
  if (ruleText) { try { const t = ruleText(a); if (t) return t; } catch { /* fall through */ } }
  try { if (F.describe) return who(F.describe(a)); } catch { /* fall through */ }
  // last resort (the rules' text did not load): the name and the number as stored — a fraction below 1 is shown as a percent ONCE
  const v = a.value ?? '';
  const shown = typeof v === 'number' ? (Math.abs(v) < 1 && v !== 0 ? pct(v, 1) : fmt(v)) : String(v);
  return `${a.name || title(a.stat || a.id)}${v !== '' ? ` ${v > 0 ? '+' : ''}${shown}` : ''}`;
}

let ctx = { equipment: () => ({}), level: () => 1, vitals: () => null };
/** More context for the cards (play-test 6: your health and mana, so a potion says what it restores for YOU). */
export function setCardContext(c = {}) { ctx = { ...ctx, ...c }; }
// U17: the rules' own potion numbers (js/sim/consumables.js is pure) — the item table's old "Restores 40 HP" is not what it does
let potions = null;
import('../../sim/consumables.js').then(m => { if (typeof m.effectOf === 'function' && typeof m.potionAmount === 'function') potions = m; }).catch(() => {});
let shift = false;
export function installItemCards(c = {}) {
  ctx = { ...ctx, ...c };
  registerTip('item', el => {
    const it = itemByUid(el.dataset.tipItem);
    return it ? itemCardHtml(it, { worn: el.dataset.worn === '1' }) : null;
  });
  const key = on => e => { if (e.key === 'Shift' && shift !== on) { shift = on; refreshTip(); } };
  addEventListener('keydown', key(true)); addEventListener('keyup', key(false));
  addEventListener('blur', () => { shift = false; });
}

/** The card's HTML. `worn` = this is what you are wearing (no compare). */
export function itemCardHtml(item, { worn = false, level = null, equipment = null, alt = shift } = {}) {
  const lv = level ?? ctx.level() ?? 1, eq = equipment ?? ctx.equipment() ?? {};
  const r = rarityOf(item), slot = slotOf(item);
  const icon = iconFor(item);
  const b = [];
  // play-test 10 (Y16): which hand, in the rules' own words — "Main hand" / "Off hand" / "One-hand" / "Two-hand" (C's item.handText)
  const hand = handLine(item);
  b.push(`<div class="ic-head">${icon ? `<img class="ic-icon r-${esc(r)}" src="${icon}" alt="">` : ''}<div><div class="ic-name r-${esc(r)}">${esc(nameOf(item))}</div>`
    + `<div class="ic-kind">${esc(RARITY_NAME[r] || title(r))} ${esc(slot ? SLOT_NAME[slot] || title(slot) : isCrate(item) ? crateLines(item).kind.toLowerCase() : item.kind === 'junk' ? 'junk' : item.kind === 'fish' ? 'fish' : item.kind === 'material' ? 'crafting material' : item.tool ? 'tool' : 'item')}`
    + `${item.baseName && item.baseName !== item.name ? ' · ' + esc(item.baseName) : ''}${hand ? ' · ' + esc(hand) : item.twoHanded ? ' · two-handed' : ''}</div></div></div>`);
  // T9 / T20 (play-test 5): a crate or a gift says what it opens into and the lowest rarity it can be
  if (isCrate(item)) {
    const c = crateLines(item);
    b.push(`<div class="ic-crate"><div class="ic-crate-what">${esc(c.opens)}</div><div class="ic-crate-min r-${esc(rarityClass(c.min))}">${esc(c.rarity)}</div><div class="ic-dim">${esc(c.how)}</div></div>`);
  }
  // W19 (C): a backpack's first line — what it is FOR
  { const bt = bagSlotsText(item); if (bt) b.push(`<div class="ic-bag"><b>${esc(bt)}</b> <span class="ic-dim">while it is on your back</span></div>`); }
  if (slot) {
    const req = levelCheck(item, lv, eq);
    b.push(`<div class="ic-req">${item.ilvl ? `Item level ${esc(item.ilvl)} · ` : ''}<span class="${req.ok ? (req.reduced ? 'req-cut' : 'req-ok') : 'req-no'}">Requires level ${req.level}</span>`
      + `${req.ok ? '' : ` <i>— you are level ${lv}</i>`}</div>`);
  }
  const base = [];
  // Y16: an orb or focus has no attack of its own (`noAttack`) — no damage line and no attack speed for it
  if (item.dmg && showsDamage(item)) base.push(`<b>${item.dmg[0]}–${item.dmg[1]}</b> damage`);
  if (item.armor) base.push(`<b>${item.armor}</b> armour`);
  // Y26 (report #50): attacks per second under the damage, from the rules (`item.apsText`); the old "fast attacks" word only without it
  const aps = apsLine(item);
  if (aps) base.push(esc(aps).replace(/^([\d.]+)/, '<b>$1</b>'));
  else if (item.attackSpeed && item.type === 'weapon' && item.attackSpeed !== 'normal' && showsDamage(item)) base.push(`${esc(item.attackSpeed)} attacks`);
  if (item.ranged) base.push('ranged');
  if (base.length) b.push(`<div class="ic-base">${base.join(' · ')}</div>`);
  if (item.count > 1) b.push(`<div class="ic-base">A stack of <b>${esc(fmt(item.count, { decimals: 0 }))}</b>${item.stackMax ? ` <span class="ic-dim">(holds ${esc(item.stackMax)})</span>` : ''} — one is used at a time. Shift-click to split it.</div>`);
  // W9 (P-client): a crafting material says which trade uses it and what one sells for; a tool that it takes no slot; made gear who made it
  if (item.kind === 'material') b.push(`<div class="ic-base">Crafting material${item.prof ? ` · <b>${esc(title(item.prof))}</b>` : ''}${item.tier ? ` · tier ${esc(item.tier)}` : ''}${item.price ? ` <span class="ic-dim">— sells for ${esc(fmt(item.price, { decimals: 0 }))} gold each</span>` : ''}</div>`);
  if (item.tool && item.use?.prof) b.push(`<div class="ic-base"><b>${esc(title(item.use.prof))}</b> tool${item.use.tier ? ` · tier ${esc(item.use.tier)}` : ''} <span class="ic-dim">— takes no slot; keep it in your bag</span></div>`);
  if (item.crafted && item.maker) b.push(`<div class="ic-dim">Made by ${esc(item.maker)}</div>`);
  if (item.kind === 'fish' && item.size) b.push(`<div class="ic-base"><b>${esc(Math.round(item.size * 10) / 10)}</b> cm${item.record ? ' · your biggest' : ''}</div>`);
  let potionSaid = false;
  if (item.kind === 'potion' && potions) {
    try { const ef = potions.effectOf(item), v = ctx.vitals?.(); if (ef && v && v.hpMax) { const line = potionLine(potions.potionAmount(ef, v.hpMax, v.mpMax || 0), ef, (potions.POTION_CD_MS || 0) / 1000); if (line) { b.push(`<div class="ic-base">${esc(line)}</div>`); potionSaid = true; } } } catch { /* the plain description below */ }
  }
  if (item.desc && !item.lore && !(potionSaid && /restores?\s+\d/i.test(item.desc))) b.push(`<div class="ic-dim">${esc(item.desc)}</div>`);
  // T15 / T17 (C): what a caster weapon's attack IS, what a focus adds, what a converted weapon deals — written from the numbers
  for (const k of ['attackText', 'focusText', 'convertText']) if (item[k]) b.push(`<div class="ic-attack">${esc(who(item[k]))}</div>`);
  if (item.weaponHeadline) b.push(`<div class="ic-dim">${esc(item.weaponHeadline)}</div>`);
  const rolled = (item.affixes || []).filter(a => !a.baseIntrinsic), built = (item.affixes || []).filter(a => a.baseIntrinsic);
  if (rolled.length || built.length) {
    b.push('<ul class="ic-affixes">' + rolled.map(a => `<li class="${a.id === 'legendary_effect' ? 'ic-legend' : String(a.stat).startsWith('cond_') ? 'ic-cond' : ''}">${esc(affixText(a))}</li>`).join('')
      + built.map(a => `<li class="ic-built">${esc(affixText(a))} <i>(built in)</i></li>`).join('') + '</ul>');
  }
  if (item.uniquePower || item.power?.text) b.push(`<div class="ic-legend">${esc(who(item.power?.text || item.uniquePower))}</div>`);
  if (item.lore) b.push(`<div class="ic-lore">${esc(item.lore)}</div>`);
  if (slot && !worn) {
    const c = compareTo(item, eq, { score: scoreOf, alt: alt && !!altSlotOf(item) });
    if (c.worn) {
      const d = c.delta;
      b.push(`<div class="ic-compare">Instead of <b class="r-${esc(rarityOf(c.worn))}">${esc(nameOf(c.worn))}</b> <span class="ic-dim">(${esc(SLOT_NAME[c.slot] || c.slot)})</span> `
        + `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= '}${d}</span></div>`);
      const was = [];
      if (c.worn.dmg && showsDamage(c.worn)) was.push(`${c.worn.dmg[0]}–${c.worn.dmg[1]} damage`);
      if (apsLine(c.worn)) was.push(apsLine(c.worn));
      if (c.worn.armor) was.push(`${c.worn.armor} armour`);
      const lose = (c.worn.affixes || []).filter(a => !a.baseIntrinsic).map(affixText);
      if (was.length || lose.length) b.push(`<div class="ic-dim">You would lose: ${esc([...was, ...lose].join(' · '))}</div>`);
    } else b.push(`<div class="ic-dim">Nothing worn in ${esc(SLOT_NAME[c.slot] || c.slot)} — a free upgrade.</div>`);
    if (altSlotOf(item)) b.push(`<div class="ic-shift">${alt ? 'Comparing the other slot.' : 'Hold <kbd>Shift</kbd> to compare the other slot.'}</div>`);
  }
  if (item.value) b.push(`<div class="ic-value">Worth ${esc(item.value)} gold</div>`);
  return `<div class="itemtip">${b.join('')}</div>`;
}
