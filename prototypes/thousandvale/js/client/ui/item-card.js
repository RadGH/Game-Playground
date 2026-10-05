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

const items = new Map();                       // uid -> item
export function rememberItems(list) { for (const it of list || []) if (it && it.uid != null) items.set(String(it.uid), it); }
export const itemByUid = uid => items.get(String(uid)) || null;

let F = { describe: null, score: null, name: null };
const fload = Promise.all([import('../../../../farhold/js/effects.js'), import('../../../../farhold/js/rpg.js')])
  .then(([e, r]) => { F = { describe: e.describeAffix, score: r.itemScore, name: r.displayName }; }).catch(() => {});
export const farholdReady = () => fload;
export const scoreOf = it => (F.score ? F.score(it) : plainScore(it));
export const nameOf = it => (F.name ? F.name(it) : String(it?.name || 'Item'));

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const title = s => String(s || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
function affixText(a) {
  if (a.text) return a.text;
  try { if (F.describe) return F.describe(a); } catch { /* fall through */ }
  const v = a.value ?? '';
  return `${a.name || title(a.stat || a.id)}${v !== '' ? ` ${v > 0 ? '+' : ''}${Math.round(v * 100) / 100}` : ''}`;
}

let ctx = { equipment: () => ({}), level: () => 1 };
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
  b.push(`<div class="ic-head">${icon ? `<img class="ic-icon r-${esc(r)}" src="${icon}" alt="">` : ''}<div><div class="ic-name r-${esc(r)}">${esc(nameOf(item))}</div>`
    + `<div class="ic-kind">${esc(RARITY_NAME[r] || title(r))} ${esc(slot ? SLOT_NAME[slot] || title(slot) : item.kind === 'junk' ? 'junk' : 'item')}`
    + `${item.baseName && item.baseName !== item.name ? ' · ' + esc(item.baseName) : ''}${item.twoHanded ? ' · two-handed' : ''}</div></div></div>`);
  if (slot) {
    const req = levelCheck(item, lv, eq);
    b.push(`<div class="ic-req">${item.ilvl ? `Item level ${esc(item.ilvl)} · ` : ''}<span class="${req.ok ? (req.reduced ? 'req-cut' : 'req-ok') : 'req-no'}">Requires level ${req.level}</span>`
      + `${req.ok ? '' : ` <i>— you are level ${lv}</i>`}</div>`);
  }
  const base = [];
  if (item.dmg) base.push(`<b>${item.dmg[0]}–${item.dmg[1]}</b> damage`);
  if (item.armor) base.push(`<b>${item.armor}</b> armour`);
  if (item.attackSpeed && item.type === 'weapon' && item.attackSpeed !== 'normal') base.push(`${esc(item.attackSpeed)} attacks`);
  if (item.ranged) base.push('ranged');
  if (base.length) b.push(`<div class="ic-base">${base.join(' · ')}</div>`);
  if (item.weaponHeadline) b.push(`<div class="ic-dim">${esc(item.weaponHeadline)}</div>`);
  const rolled = (item.affixes || []).filter(a => !a.baseIntrinsic), built = (item.affixes || []).filter(a => a.baseIntrinsic);
  if (rolled.length || built.length) {
    b.push('<ul class="ic-affixes">' + rolled.map(a => `<li class="${a.id === 'legendary_effect' ? 'ic-legend' : String(a.stat).startsWith('cond_') ? 'ic-cond' : ''}">${esc(affixText(a))}</li>`).join('')
      + built.map(a => `<li class="ic-built">${esc(affixText(a))} <i>(built in)</i></li>`).join('') + '</ul>');
  }
  if (item.uniquePower || item.power?.text) b.push(`<div class="ic-legend">${esc(item.power?.text || item.uniquePower)}</div>`);
  if (item.lore) b.push(`<div class="ic-lore">${esc(item.lore)}</div>`);
  if (slot && !worn) {
    const c = compareTo(item, eq, { score: scoreOf, alt: alt && !!altSlotOf(item) });
    if (c.worn) {
      const d = c.delta;
      b.push(`<div class="ic-compare">Instead of <b class="r-${esc(rarityOf(c.worn))}">${esc(nameOf(c.worn))}</b> <span class="ic-dim">(${esc(SLOT_NAME[c.slot] || c.slot)})</span> `
        + `<span class="${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= '}${d}</span></div>`);
      const was = [];
      if (c.worn.dmg) was.push(`${c.worn.dmg[0]}–${c.worn.dmg[1]} damage`);
      if (c.worn.armor) was.push(`${c.worn.armor} armour`);
      const lose = (c.worn.affixes || []).filter(a => !a.baseIntrinsic).map(affixText);
      if (was.length || lose.length) b.push(`<div class="ic-dim">You would lose: ${esc([...was, ...lose].join(' · '))}</div>`);
    } else b.push(`<div class="ic-dim">Nothing worn in ${esc(SLOT_NAME[c.slot] || c.slot)} — a free upgrade.</div>`);
    if (altSlotOf(item)) b.push(`<div class="ic-shift">${alt ? 'Comparing the other slot.' : 'Hold <kbd>Shift</kbd> to compare the other slot.'}</div>`);
  }
  if (item.value) b.push(`<div class="ic-value">Worth ${esc(item.value)} gold</div>`);
  return `<div class="itemtip">${b.join('')}</div>`;
}
