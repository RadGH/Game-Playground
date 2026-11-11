// The character screen (C, or the bag button): equipment, attributes (spend points), the numbers, the D2 grid bag and
// item tooltips with a comparison against what you wear. Every change goes to the sim as an action (the server is the
// referee); the screen redraws from the character the sim sends back.
//   const ui = createSheetUI({ items, send, getChar, nope });  ui.toggle();  ui.refresh(ch)
import { sheet } from '../rules/sheet.js';
import { itemName, itemMods, itemReq, weaponDamage, itemArmour, canEquip, profOf } from '../rules/items.js';
import { ATTRS, ATTR_NAMES, ATTR_HELP, xpAtLevel, xpToNext } from '../rules/progression.js';
import { BAG_W, BAG_H } from '../rules/bag.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GLYPH = { sword: '🗡', dagger: '🔪', axe: '🪓', mace: '🔨', sceptre: '⚚', greatsword: '⚔', greataxe: '🪓', maul: '🔨', spear: '🔱', polearm: '🔱', bow: '🏹', crossbow: '🏹', staff: '⚕', wand: '🪄',
  head: '⛑', chest: '👕', hands: '🧤', feet: '🥾', belt: '➰', shield: '🛡', focus: '🔮', quiver: '🎯', ring: '💍', neck: '📿' };
const SLOT_LABEL = { head: 'Head', chest: 'Chest', hands: 'Hands', belt: 'Belt', feet: 'Feet', neck: 'Neck', ring1: 'Ring', ring2: 'Ring', weapon: 'Main hand', offhand: 'Off hand' };
const STAT_TEXT = {
  physDamageFlat: v => `+${v} weapon damage`, physDamagePct: v => `+${v}% weapon damage`, fireDamageFlat: v => `+${v} fire damage`, frostDamageFlat: v => `+${v} frost damage`, stormDamageFlat: v => `+${v} storm damage`,
  poisonDamageOverTime: v => `+${v} poison damage`, shadowDamageFlat: v => `+${v} shadow damage`, attackPower: v => `+${v} attack power`, spellPower: v => `+${v}% spell damage`,
  fireDamagePct: v => `+${v}% fire damage`, frostDamagePct: v => `+${v}% frost damage`, stormDamagePct: v => `+${v}% storm damage`, poisonDamagePct: v => `+${v}% poison damage`, shadowDamagePct: v => `+${v}% shadow damage`,
  healingPower: v => `+${v}% healing`, critChance: v => `+${v}% critical strike chance`, attackSpeed: v => `+${v}% attack speed`, castSpeed: v => `+${v}% casting speed`, armourFlat: v => `+${v} armour`, armourPct: v => `+${v}% armour`,
  health: v => `+${v} health`, mana: v => `+${v} mana`, blockChance: v => `+${v}% block chance`, blockAmount: v => `+${v} damage blocked`, str: v => `+${v} Strength`, agi: v => `+${v} Agility`, int: v => `+${v} Intellect`, vit: v => `+${v} Vitality`, spi: v => `+${v} Spirit`,
  fireResist: v => `+${v}% fire resistance`, frostResist: v => `+${v}% frost resistance`, stormResist: v => `+${v}% storm resistance`, poisonResist: v => `+${v}% poison resistance`, shadowResist: v => `+${v}% shadow resistance`, allResist: v => `+${v}% to all resistances`,
  healthRegen: v => `+${v} health a second`, manaRegen: v => `+${v} mana a second`, lifeOnHit: v => `+${v} health each time you hit`, manaOnKill: v => `+${v} mana for each kill`, dodge: v => `+${v}% dodge`, moveSpeed: v => `+${v}% walking speed`,
  hitChance: v => `+${v}% chance to hit`, critDamage: v => `+${v}% critical damage`, goldFind: v => `+${v}% more gold`, magicFind: v => `+${v}% better items found`, thorns: v => `Attackers take ${v} damage`, reqReduce: v => `Requirements ${v}% lower`,
  cooldownReduction: v => `Cooldowns ${v}% shorter`, potionPower: v => `Potions ${v}% stronger`, threat: v => `+${v}% threat`, staggerChance: v => `+${v}% chance to stagger`, lightRadius: v => `+${v} light`, potionSlots: v => `${v} potion slots`,
};
export const rarityClass = it => 'r-' + (it.ided === false ? 'unid' : it.rarity);
export const glyph = (items, it) => GLYPH[items.bases[it.base]?.kind] || GLYPH[items.bases[it.base]?.slot] || '◆';

/** Tooltip HTML for an item, with requirement colours for `ch` and a comparison against `worn` (the item in that slot). */
export function itemTip(items, it, ch, worn = null) {
  const b = items.bases[it.base] || {}, req = itemReq(items, it), st = ch ? sheet(ch, items) : null;
  const lines = [];
  const wd = weaponDamage(items, it); if (wd) lines.push(`<div class="big">${wd.min}–${wd.max} damage · ${wd.speed} attacks a second</div>`);
  const ar = itemArmour(items, it); if (ar) lines.push(`<div class="big">${ar} armour</div>`);
  if (b.block) lines.push(`<div>${b.block.chance}% block · blocks ${b.block.amount}</div>`);
  if (it.ided === false) lines.push('<div class="unid">Unidentified — right-click (or tap Identify) to reveal it. Free.</div>');
  else for (const [stat, m] of Object.entries(itemMods(items, it))) lines.push(`<div class="mod">${esc((STAT_TEXT[stat] || (v => `+${v} ${stat}`))(m.value))}</div>`);
  if (it.power && it.ided !== false) { const pw = items.powers[it.power]; if (pw) lines.push(`<div class="power">★ ${esc(pw.name)}: ${esc(pw.text)}</div>`); }
  const reqs = [];
  const bad = (have, need) => have < need ? ' class="bad"' : '';
  reqs.push(`<span${bad(ch?.level || 1, req.level)}>Level ${req.level}</span>`);
  for (const k of ['str', 'agi', 'int', 'spi']) if (req[k]) reqs.push(`<span${bad(st?.attrs?.[k] || 0, req[k])}>${req[k]} ${ATTR_NAMES[k]}</span>`);
  const prof = ch && b.slot && !canUseByPath(items, ch, b) ? `<div class="bad">Your Path can't use this.</div>` : '';
  const cmp = worn && worn.uid !== it.uid ? compare(items, it, worn) : '';
  const uniq = it.unique && it.ided !== false ? items.uniques[it.unique] : null;
  return `<div class="tip ${rarityClass(it)}"><h4>${esc(itemName(items, it))}</h4><div class="sub">${esc(cap(it.rarity))} ${esc(b.name || '')} · item level ${it.ilvl}</div>
    ${lines.join('')}${uniq?.lore ? `<div class="lore">“${esc(uniq.lore)}”</div>` : ''}
    <div class="req">Requires ${reqs.join(' · ')}</div>${prof}${it.dur ? `<div class="dur${it.dur[0] <= 0 ? ' bad' : ''}">Durability ${it.dur[0]} / ${it.dur[1]}${it.dur[0] <= 0 ? ' — broken, repair in town' : ''}</div>` : ''}${cmp}</div>`;
}
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());
const canUseByPath = (items, ch, b) => { const p = profOf(items, ch); if (b.slot === 'weapon') return (p.weapons || []).some(x => x === b.proficiency || x === b.kind || x === b.class); if (b.slot === 'offhand') return (p.offhand || []).some(x => x === b.kind || x === b.class); if (['head', 'chest', 'hands', 'feet'].includes(b.slot)) return (p.armour || []).includes(b.proficiency); return true; };
function compare(items, it, worn) {
  const rows = [];
  const a = weaponDamage(items, it), b = weaponDamage(items, worn);
  if (a && b) { const da = (a.min + a.max) / 2 * a.speed, db = (b.min + b.max) / 2 * b.speed; if (Math.abs(da - db) >= 0.05) rows.push(delta('damage a second', da - db, 1)); }
  const ar = itemArmour(items, it) - itemArmour(items, worn); if (ar) rows.push(delta('armour', ar));
  const m1 = itemMods(items, it), m2 = itemMods(items, worn);
  for (const k of new Set([...Object.keys(m1), ...Object.keys(m2)])) { const d = (m1[k]?.value || 0) - (m2[k]?.value || 0); if (d) rows.push(delta((STAT_TEXT[k] ? STAT_TEXT[k](1).replace(/^\+?1%? ?/, '') : k), d)); }
  return rows.length ? `<div class="cmp"><b>Compared with ${esc(itemName(items, worn))}:</b>${rows.join('')}</div>` : '';
}
const delta = (label, d, dp = 0) => `<div class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${d.toFixed(dp)} ${esc(label)}</div>`;

export function createSheetUI({ items, send, getChar, nope }) {
  const root = document.createElement('div'); root.className = 'sheet-ui'; root.hidden = true;
  document.body.append(root);
  let sel = null, tipEl = null;
  function toggle(force) { root.hidden = force != null ? !force : !root.hidden; sel = null; if (!root.hidden) refresh(); hideTip(); }
  function refresh(ch = getChar()) {
    if (root.hidden || !ch) return;
    const st = sheet(ch, items), base = xpAtLevel(ch.level), need = xpToNext(ch.level);
    const slot = s => { const it = ch.equip?.[s]; return `<button class="eq ${it ? rarityClass(it) : 'empty'}${it?.dur?.[0] <= 0 ? ' broken' : ''}" data-slot="${s}" title="${SLOT_LABEL[s]}">${it ? glyph(items, it) : ''}<small>${SLOT_LABEL[s]}</small></button>`; };
    root.innerHTML = `<div class="sheet-panel">
      <header><h2>${esc(ch.name)}</h2><span>Level ${ch.level} ${esc(ch.spec || ch.path || 'Wanderer')} · Gear score ${st.gearScore}</span><button class="x" data-close aria-label="Close">×</button></header>
      <div class="cols">
        <section class="equip">${['head', 'neck', 'chest', 'weapon', 'offhand', 'hands', 'belt', 'feet', 'ring1', 'ring2'].map(slot).join('')}<button class="swap" data-swap title="Swap weapon sets (X)">⇄ Weapon set ${ch.equip?.weapon2 || ch.equip?.offhand2 ? '' : '(empty)'}</button></section>
        <section class="attrs"><div class="xp">Experience ${Math.max(0, ch.xp - base)} / ${Number.isFinite(need) ? need : '—'}</div>
          ${ch.unspent ? `<div class="pts">${ch.unspent} point${ch.unspent > 1 ? 's' : ''} to spend</div>` : ''}
          ${ATTRS.map(a => `<div class="attr" title="${esc(ATTR_HELP[a])}"><span>${ATTR_NAMES[a]}</span><b>${st.attrs[a]}</b>${ch.unspent ? `<button data-spend="${a}" aria-label="Add a point to ${ATTR_NAMES[a]}">+</button>` : ''}</div>`).join('')}
          <div class="nums"><div>Health <b>${st.maxHp}</b></div><div>Mana <b>${st.maxMana}</b></div><div>Damage <b>${st.weapon.min}–${st.weapon.max}</b></div><div>Armour <b>${st.armour}</b></div>
            <div>Critical <b>${st.crit}%</b></div><div>Dodge <b>${st.dodge}%</b></div>${st.block ? `<div>Block <b>${st.block.chance}%</b></div>` : ''}
            <div class="res">Resist: ${['fire', 'frost', 'storm', 'poison', 'shadow'].map(t => `<span class="ty-${t}">${t[0].toUpperCase() + t.slice(1)} ${st.resists[t]}%</span>`).join(' ')}</div></div></section>
      </div>
      <section class="bag" style="--w:${BAG_W};--h:${BAG_H}">${(ch.bag || []).map(it => { const g = items.bases[it.base]?.grid || { w: 1, h: 1 }; return `<button class="item ${rarityClass(it)}${sel === it.uid ? ' sel' : ''}" data-uid="${it.uid}" style="grid-column:${it.pos.x + 1}/span ${g.w};grid-row:${it.pos.y + 1}/span ${g.h}">${glyph(items, it)}</button>`; }).join('')}${cells()}</section>
      <div class="gold">🪙 ${ch.gold || 0} gold</div>
      <div class="actions"></div>
    </div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelectorAll('[data-spend]').forEach(b => b.onclick = () => send({ do: 'spend', attr: b.dataset.spend, n: 1 }));
    root.querySelector('[data-swap]').onclick = () => send({ do: 'swap' });
    root.querySelectorAll('.item').forEach(b => {
      const it = ch.bag.find(i => i.uid === b.dataset.uid);
      b.onclick = e => { e.stopPropagation(); sel = it.uid; showActions(ch, it); showTip(b, it, ch); root.querySelectorAll('.item.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
      b.oncontextmenu = e => { e.preventDefault(); if (it.ided === false) send({ do: 'identify', uid: it.uid }); else send({ do: 'equip', uid: it.uid }); };
      b.ondblclick = () => send({ do: 'equip', uid: it.uid });
      b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, it, ch); };
      b.onpointerleave = e => { if (e.pointerType === 'mouse' && sel !== it.uid) hideTip(); };
    });
    root.querySelectorAll('.eq').forEach(b => {
      const it = ch.equip?.[b.dataset.slot]; if (!it) return;
      b.onclick = () => { sel = null; showTip(b, it, ch, true); root.querySelector('.actions').innerHTML = `<button data-off>Take off</button>`; root.querySelector('[data-off]').onclick = () => send({ do: 'unequip', slot: b.dataset.slot }); };
      b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, it, ch, true); };
      b.onpointerleave = e => { if (e.pointerType === 'mouse') hideTip(); };
    });
    // empty bag cells take a selected item (move)
    root.querySelectorAll('.cell').forEach(c => c.onclick = () => { if (sel) send({ do: 'move', uid: sel, x: +c.dataset.x, y: +c.dataset.y }); });
  }
  const cells = () => { let s = ''; for (let y = 0; y < BAG_H; y++) for (let x = 0; x < BAG_W; x++) s += `<i class="cell" data-x="${x}" data-y="${y}" style="grid-column:${x + 1};grid-row:${y + 1}"></i>`; return s; };
  function showActions(ch, it) {
    const a = root.querySelector('.actions');
    a.innerHTML = it.ided === false ? `<button class="primary" data-id>Identify</button>` : `<button class="primary" data-eq>Equip</button>`;
    a.querySelector('[data-id]')?.addEventListener('click', () => send({ do: 'identify', uid: it.uid }));
    a.querySelector('[data-eq]')?.addEventListener('click', () => send({ do: 'equip', uid: it.uid }));
  }
  function showTip(anchor, it, ch, isWorn = false) {
    hideTip();
    const b = items.bases[it.base], slot = b?.slot === 'ring' ? 'ring1' : b?.slot;
    tipEl = document.createElement('div'); tipEl.className = 'tip-float';
    tipEl.innerHTML = itemTip(items, it, ch, isWorn ? null : ch.equip?.[slot]);
    document.body.append(tipEl);
    const r = anchor.getBoundingClientRect(), tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
    let x = r.right + 8, y = r.top; if (x + tw > innerWidth - 8) x = Math.max(8, r.left - tw - 8); if (y + th > innerHeight - 8) y = Math.max(8, innerHeight - th - 8);
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  function hideTip() { tipEl?.remove(); tipEl = null; }
  root.addEventListener('click', e => { if (e.target === root) toggle(false); });
  void canEquip; void nope;
  return { toggle, refresh, get open() { return !root.hidden; } };
}
