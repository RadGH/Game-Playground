// The character screen (C, or the bag button): equipment, attributes (spend points), the numbers, the bag (one square
// per item, owner 2026-11-13) and
// item tooltips with a comparison against what you wear. Every change goes to the sim as an action (the server is the
// referee); the screen redraws from the character the sim sends back.
//   const ui = createSheetUI({ items, send, getChar, nope });  ui.toggle();  ui.refresh(ch)
import { sheet } from '../rules/sheet.js';
import { itemName, itemMods, itemReq, weaponDamage, itemArmour, profOf } from '../rules/items.js';
import { cardStats } from '../rules/card.js';
import { gripOf, compareSlots, firstCompareSlot } from '../rules/hands.js';
import { ATTRS, ATTR_NAMES, ATTR_HELP, xpAtLevel, xpToNext } from '../rules/progression.js';
import { BAG_W, BAG_H } from '../rules/bag.js';
import { ask, tell, askText } from '../../../../shared/dialog.js';
import { itemIcon } from './icons.js';
import { gearIcon } from './gear-icons.js';
import { itemIconSvg } from '../../../../icons/js/game-icons.js';
import { freeSlots } from '../rules/bag.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
/** Potions, shards and dust are drawn art from the icon library; gear is drawn by its kind (gear-icons.js). */
export const glyph = (items, it) => (it.base === 'shard' || it.base === 'dust' || it.base === 'potion' ? itemIcon(it, null, 30) : null) || gearIcon(items.bases[it.base]?.kind, 30) || gearIcon(items.bases[it.base]?.slot, 30) || gearIcon('ring', 30);

/** Tooltip HTML for an item, with requirement colours for `ch` and a comparison against `worn` (the item in that slot). */
export function itemTip(items, it, ch, worn = null, potions = null, currency = null, label = '') {
  if (it.base === 'shard' || it.base === 'dust') {
    const C = currency || {}; const S = C.shards?.find(x => x.id === it.shard), G = C.grades?.[(it.grade || 1) - 1];
    if (it.base === 'dust') return `<div class="tip r-normal"><h4>Shard Dust ×${it.n}</h4><div>The crafter in town turns ${C.convert?.dustToGlimmer || 20} dust into a Glimmer Shard.</div></div>`;
    return `<div class="tip r-magic"><h4>${esc(G?.name || '')} ${esc(S?.name || it.shard)} ×${it.n}</h4><div class="big">${esc(S?.does || '')}</div><div class="sub">${esc(G?.name || '')} shards roll as if the item were at most item level ${G?.rollCap ?? '?'}.</div><div class="req">Select it, then tap an item. Or drag it onto the item.</div></div>`;
  }
  if (it.base === 'potion') { const z = potions?.sizes?.[it.size] || {}; return `<div class="tip r-normal"><h4>${esc(z.name || '')} ${it.kind === 'mana' ? 'Mana' : 'Healing'} Potion</h4><div class="sub">${it.n} in this stack</div><div class="big">Restores ${z[it.kind] || '?'} ${it.kind === 'mana' ? 'mana' : 'health'} over ${z.secs || '?'} seconds</div><div>Drinking another adds a second refill on top.</div><div class="req">${it.kind === 'mana' ? 'E' : 'Q'} drinks one from your belt</div></div>`; }
  const b = items.bases[it.base] || {}, req = itemReq(items, it), st = ch ? sheet(ch, items) : null;
  const lines = [], card = cardStats(items, it);
  // one line per stat (game standards §5b): the base's own number with its affixes folded in, the split beside it
  for (const l of card.lines) lines.push(`<div class="${l.key === 'speed' || l.key === 'block' ? 'line' : 'big'}">${esc(l.text)}${l.split ? ` <small class="split">(${esc(l.split)})</small>` : ''}</div>`);
  if (it.ided === false) lines.push('<div class="unid">Unidentified — right-click (or tap Identify) to reveal it. Free.</div>');
  else for (const [stat, m] of Object.entries(card.mods)) lines.push(`<div class="mod">${esc((STAT_TEXT[stat] || (v => `+${v} ${stat}`))(m.value))}</div>`);
  if (it.power && it.ided !== false) { const pw = items.powers[it.power]; if (pw) lines.push(`<div class="power">★ ${esc(pw.name)}: ${esc(pw.text)}</div>`); }
  const reqs = [];
  const bad = (have, need) => have < need ? ' class="bad"' : '';
  reqs.push(`<span${bad(ch?.level || 1, req.level)}>Level ${req.level}</span>`);
  for (const k of ['str', 'agi', 'int', 'spi']) if (req[k]) reqs.push(`<span${bad(st?.attrs?.[k] || 0, req[k])}>${req[k]} ${ATTR_NAMES[k]}</span>`);
  const prof = ch && b.slot && !canUseByPath(items, ch, b) ? `<div class="bad">Your class can't use this.</div>` : '';
  const cmp = worn && worn.uid !== it.uid ? compare(items, it, worn) : '';
  const uniq = it.unique && it.ided !== false ? items.uniques[it.unique] : null;
  return `<div class="tip ${rarityClass(it)}">${label ? `<div class="worn-label">${esc(label)}</div>` : ''}<h4>${esc(itemName(items, it))}</h4>${card.hand ? `<div class="hand">${esc(card.hand)}</div>` : ''}<div class="sub">${esc(cap(it.rarity))} ${esc(b.name || '')} · item level ${it.ilvl}</div>
    ${lines.join('')}${uniq?.lore ? `<div class="lore">“${esc(uniq.lore)}”</div>` : ''}
    <div class="req">Requires ${reqs.join(' · ')}</div>${prof}${it.dur ? `<div class="dur${it.dur[0] <= 0 ? ' bad' : ''}">Durability ${it.dur[0]} / ${it.dur[1]}${it.dur[0] <= 0 ? ' — broken, repair in town' : ''}</div>` : ''}${cmp}</div>`;
}
const cap = s => String(s || '').replace(/^\w/, c => c.toUpperCase());
const SLOT_NAME = { ...SLOT_LABEL, ring1: 'Ring 1', ring2: 'Ring 2' };
/** Side by side (game standards §5b): the item with green/red differences, and what it would replace in `slot`. When
 *  two slots could take it, the head names both and which one is compared (Shift, Y or the Compare button switches). */
export function compareTipHtml(items, it, ch, slot, slots = [slot], potions = null, currency = null) {
  const worn = ch?.equip?.[slot];
  const head = slots.length > 1 ? `<div class="cmp-head">Compare: ${slots.map(s => `<b class="${s === slot ? 'on' : ''}">${esc(SLOT_NAME[s])}</b>`).join(' / ')} <small>Shift · Y · Compare button</small></div>` : '';
  const right = worn ? itemTip(items, worn, ch, null, potions, currency, 'Equipped · ' + SLOT_NAME[slot]) : `<div class="tip empty"><div class="worn-label">Equipped · ${esc(SLOT_NAME[slot])}</div><p>Nothing there yet.</p></div>`;
  return `<div class="cmp-view">${head}<div class="cmp-cards">${itemTip(items, it, ch, worn, potions, currency)}${right}</div></div>`;
}
const canUseByPath = (items, ch, b) => { const p = profOf(items, ch); if (b.slot === 'weapon') return (p.weapons || []).some(x => x === b.proficiency || x === b.kind || x === b.class); if (b.slot === 'offhand') return (p.offhand || []).some(x => x === b.kind || x === b.class); if (['head', 'chest', 'hands', 'feet'].includes(b.slot)) return (p.armour || []).includes(b.proficiency); return true; };
function compare(items, it, worn) {
  const rows = [];
  const a = weaponDamage(items, it), b = weaponDamage(items, worn);
  const bl = items.bases[it.base]?.block, bw = items.bases[worn.base]?.block;
  if (bl || bw) { const c1 = (bl?.chance || 0) + (itemMods(items, it).blockChance?.value || 0), c2 = (bw?.chance || 0) + (itemMods(items, worn).blockChance?.value || 0); if (c1 !== c2) rows.push(delta('% block chance', c1 - c2)); }
  if (a && b) { const da = (a.min + a.max) / 2 * a.speed, db = (b.min + b.max) / 2 * b.speed; if (Math.abs(da - db) >= 0.05) rows.push(delta('damage a second', da - db, 1)); }
  const ar = itemArmour(items, it) - itemArmour(items, worn); if (ar) rows.push(delta('armour', ar));
  const m1 = cardStats(items, it).mods, m2 = cardStats(items, worn).mods;      // stats the damage/armour lines folded in are counted there, once
  for (const k of new Set([...Object.keys(m1), ...Object.keys(m2)])) { const d = (m1[k]?.value || 0) - (m2[k]?.value || 0); if (d) rows.push(delta((STAT_TEXT[k] ? STAT_TEXT[k](1).replace(/^\+?1%? ?/, '') : k), d)); }
  return rows.length ? `<div class="cmp"><b>Compared with ${esc(itemName(items, worn))}:</b>${rows.join('')}</div>` : '';
}
const delta = (label, d, dp = 0) => `<div class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲ +' : '▼ '}${d.toFixed(dp)}${label.startsWith('%') ? '' : ' '}${esc(label)}</div>`;

export function createSheetUI({ items, send, getChar, nope, potions = null, currency = null, skills = null, onSkills = () => {}, isTouch = () => false, content = null }) {
  let pendingShard = null;
  const root = document.createElement('div'); root.className = 'sheet-ui'; root.hidden = true;
  document.body.append(root);
  let sel = null, tipEl = null;
  function toggle(force) { root.hidden = force != null ? !force : !root.hidden; sel = null; if (!root.hidden) refresh(); hideTip(); }
  function refresh(ch = getChar()) {
    if (root.hidden || !ch) return;
    hideTip();
    const st = sheet(ch, items), base = xpAtLevel(ch.level), need = xpToNext(ch.level);
    const slot = s => { const it = ch.equip?.[s]; return `<button class="eq eq-${s} ${it ? rarityClass(it) : 'empty'}${it?.dur?.[0] <= 0 ? ' broken' : ''}" data-slot="${s}" aria-label="${SLOT_LABEL[s]}${it ? ': ' + esc(itemName(items, it)) : ', empty'}">${it ? glyph(items, it) : `<span class="ghost">${gearIcon(s, 30)}</span>`}<small>${SLOT_LABEL[s]}</small></button>`; };
    const xpNow = Math.max(0, ch.xp - base), xpPct = Number.isFinite(need) && need > 0 ? Math.min(100, Math.round(xpNow / need * 100)) : 100;
    const bag = ch.bag || [], used = BAG_W * BAG_H - freeSlots(bag);
    let cellsHtml = '';
    for (let y = 0; y < BAG_H; y++) for (let x = 0; x < BAG_W; x++) {
      const it = bag.find(i => i.pos && i.pos.x === x && i.pos.y === y);
      cellsHtml += it ? `<button class="item ${rarityClass(it)}${it.base === 'shard' ? ' g' + it.grade : ''}${sel === it.uid ? ' sel' : ''}" data-uid="${it.uid}" data-x="${x}" data-y="${y}" aria-label="${esc(itemName(items, it))}">${glyph(items, it)}${it.n > 1 ? `<b class="cnt">${it.n}</b>` : ''}</button>`
        : `<i class="cell" data-x="${x}" data-y="${y}"></i>`;
    }
    const pts = ch.skillPoints || 0;
    root.innerHTML = `<div class="sheet-panel">
      <header class="sh-top"><div class="sh-name"><h2>${esc(ch.name)}</h2><span>Level ${ch.level} ${esc(content?.specs?.[ch.spec]?.name || content?.paths?.[ch.path]?.name || '')} · Gear score ${st.gearScore}</span></div>
        <div class="sh-links"><button data-skills>Skills${isTouch() ? '' : ' <kbd>K</kbd>'}</button><button data-talents>Talents${pts ? ` <span class="pip">${pts}</span>` : ''}${isTouch() ? '' : ' <kbd>N</kbd>'}</button></div>
        <button class="x" data-close aria-label="Close">×</button></header>
      <div class="sh-body">
        <section class="sh-hero">
          <div class="doll">${['weapon', 'head', 'neck', 'offhand', 'chest', 'ring1', 'hands', 'belt', 'ring2', 'feet'].map(slot).join('')}</div>
          <button class="swap" data-swap>⇄ Swap weapon set${isTouch() ? '' : ' <kbd>X</kbd>'}${ch.equip?.weapon2 || ch.equip?.offhand2 ? '' : ' <small>(the other set is empty)</small>'}</button>
        </section>
        <section class="sh-stats">
          <div class="xp"><span>Experience</span><b>${Number.isFinite(need) ? `${xpNow} / ${need}` : 'Top level'}</b><i style="--p:${xpPct}%"></i></div>
          <div class="attrs">${ch.unspent ? `<div class="pts">${ch.unspent} attribute point${ch.unspent > 1 ? 's' : ''} to spend</div>` : ''}
            ${ATTRS.map(a => `<div class="attr"><span>${ATTR_NAMES[a]}</span><b>${st.attrs[a]}</b>${ch.unspent ? `<button data-spend="${a}" aria-label="Add a point to ${ATTR_NAMES[a]}">+</button>` : '<i></i>'}<small>${esc(ATTR_HELP[a])}</small></div>`).join('')}</div>
          <div class="nums"><div>Health <b>${st.maxHp}</b></div><div>Mana <b>${st.maxMana}</b></div><div>Damage <b>${st.weapon.min}–${st.weapon.max}</b></div>${st.offWeapon ? `<div>Off hand <b>${st.offWeapon.min}–${st.offWeapon.max}</b></div>` : ''}<div>Armour <b>${st.armour}</b></div>
            <div>Critical <b>${st.crit}%</b></div><div>Dodge <b>${st.dodge}%</b></div>${st.block ? `<div>Block <b>${st.block.chance}%</b></div>` : ''}
            <div class="res">Resist ${['fire', 'frost', 'storm', 'poison', 'shadow'].map(t => `<span class="ty-${t}">${t[0].toUpperCase() + t.slice(1)} ${st.resists[t]}%</span>`).join(' ')}</div></div>
        </section>
        <section class="sh-bag">
          <h3>Bag <small>${used} / ${BAG_W * BAG_H}</small><span class="gold">${itemIconSvg('coins', 20) || ''} ${ch.gold || 0} gold</span></h3>
          <div class="bag" style="--w:${BAG_W};--h:${BAG_H}">${cellsHtml}</div>
          <div class="belt-row"><span>Belt</span>${beltRow(ch, st)}</div>
          <div class="actions"><em class="hint">${isTouch() ? 'Tap an item to see it. Drag it onto a slot to wear it.' : 'Hover an item to see it. Right-click wears it; drag it to move it.'}</em></div>
          <div class="sh-detail" aria-live="polite"></div>
        </section>
      </div>
    </div>`;
    root.querySelector('[data-close]').onclick = () => toggle(false);
    root.querySelector('[data-skills]').onclick = () => { toggle(false); onSkills('skills'); };
    root.querySelector('[data-talents]').onclick = () => { toggle(false); onSkills('talents'); };
    root.querySelectorAll('[data-spend]').forEach(b => b.onclick = () => send({ do: 'spend', attr: b.dataset.spend, n: 1 }));
    root.querySelector('[data-swap]').onclick = () => send({ do: 'swap' });
    root.querySelectorAll('.item').forEach(b => {
      const it = ch.bag.find(i => i.uid === b.dataset.uid);
      b.onclick = e => { e.stopPropagation(); if (dragged) return;
        if (pendingShard && it.base !== 'shard' && it.base !== 'dust' && it.base !== 'potion') { send({ do: 'craft', shard: pendingShard, item: it.uid }); pendingShard = null; root.classList.remove('shaping'); return; }
        sel = it.uid; showActions(ch, it); showTip(b, it, ch); if (innerWidth < 720) root.querySelector('.sh-detail')?.scrollIntoView({ block: 'nearest' }); root.querySelectorAll('.item.sel').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); };
      b.oncontextmenu = e => { e.preventDefault(); if (it.base === 'potion') send({ do: 'belt', uid: it.uid }); else if (it.ided === false) send({ do: 'identify', uid: it.uid }); else send({ do: 'equip', uid: it.uid, slot: slotFor(it) }); };
      b.addEventListener('pointerdown', e => startDrag(e, b, it));
      b.ondblclick = () => send({ do: 'equip', uid: it.uid, slot: slotFor(it) });
      b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, it, ch); };
      b.onpointerleave = e => { if (e.pointerType === 'mouse' && sel !== it.uid) backToSel(ch); };
    });
    root.querySelectorAll('.eq').forEach(b => {
      const it = ch.equip?.[b.dataset.slot]; if (!it) return;
      b.onclick = () => { if (pendingShard) { send({ do: 'craft', shard: pendingShard, item: it.uid }); pendingShard = null; root.classList.remove('shaping'); return; } sel = null; showTip(b, it, ch, true); root.querySelector('.actions').innerHTML = `<button data-off>Take off</button>`; root.querySelector('[data-off]').onclick = () => send({ do: 'unequip', slot: b.dataset.slot }); };
      b.onpointerenter = e => { if (e.pointerType === 'mouse') showTip(b, it, ch, true); };
      b.onpointerleave = e => { if (e.pointerType === 'mouse') backToSel(ch); };
    });
    root.querySelectorAll('[data-belt]').forEach(b => { const i = +b.dataset.belt, it = ch.belt?.[i]; if (!it) return; b.onclick = () => { showTip(b, it, ch); root.querySelector('.actions').innerHTML = `<button class="primary" data-drink>Drink</button><button data-unbelt>To bag</button>`; root.querySelector('[data-drink]').onclick = () => send({ do: 'drink', kind: it.kind }); root.querySelector('[data-unbelt]').onclick = () => send({ do: 'unbelt', i }); }; });
    // empty bag cells take a selected item (move)
    root.querySelectorAll('.cell').forEach(c => c.onclick = () => { if (sel) send({ do: 'move', uid: sel, x: +c.dataset.x, y: +c.dataset.y }); });
  }
  function beltRow(ch, st) {
    const n = Math.max(0, st.potionSlots || 0), b = ch.belt || [];
    if (!n) return '<em>Wear a belt to carry potions.</em>';
    let out = ''; for (let i = 0; i < n; i++) { const it = b[i]; out += `<button class="bslot ${it ? '' : 'empty'}" data-belt="${i}">${it ? glyph(items, it) + `<b>${it.n}</b>` : ''}</button>`; }
    return out;
  }
  // ---- drag and drop (mouse, touch, pen): bag cell = move, equipment slot = wear, belt = potions ----
  let drag = null, dragged = false;
  function startDrag(e, el, it) {
    if (e.button === 2) return;
    drag = { it, el, x0: e.clientX, y0: e.clientY, on: false, ghost: null };
    dragged = false;
    addEventListener('pointermove', moveDrag); addEventListener('pointerup', endDrag, { once: true });
  }
  function moveDrag(e) {
    if (!drag) return;
    if (!drag.on && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 8) return;
    if (!drag.on) { drag.on = true; dragged = true; hideTip(); drag.ghost = document.createElement('div'); drag.ghost.className = 'drag-ghost'; drag.ghost.innerHTML = glyph(items, drag.it); document.body.append(drag.ghost); drag.el.style.opacity = 0.35; }
    drag.ghost.style.left = e.clientX + 'px'; drag.ghost.style.top = e.clientY + 'px';
    root.querySelectorAll('.drop-ok').forEach(x => x.classList.remove('drop-ok'));
    const t = target(e); if (t) t.el.classList.add('drop-ok');
  }
  function target(e) {
    drag.ghost && (drag.ghost.style.display = 'none'); const under = document.elementFromPoint(e.clientX, e.clientY); drag.ghost && (drag.ghost.style.display = '');
    const eq = under?.closest?.('.eq'), cell = under?.closest?.('.cell, .bag .item'), belt = under?.closest?.('.belt-row');
    const onItem = under?.closest?.('.bag .item');
    if (drag.it.base === 'shard' && onItem && onItem.dataset.uid !== drag.it.uid) return { el: onItem, act: { do: 'craft', shard: drag.it.uid, item: onItem.dataset.uid } };
    if (drag.it.base === 'shard' && eq && getChar()?.equip?.[eq.dataset.slot]) return { el: eq, act: { do: 'craft', shard: drag.it.uid, item: getChar().equip[eq.dataset.slot].uid } };
    if (eq) return { el: eq, act: { do: 'equip', uid: drag.it.uid, slot: eq.dataset.slot } };
    if (belt && drag.it.base === 'potion') return { el: belt, act: { do: 'belt', uid: drag.it.uid } };
    if (cell?.dataset.x != null && cell.dataset.uid !== drag.it.uid) return { el: cell, act: { do: 'move', uid: drag.it.uid, x: +cell.dataset.x, y: +cell.dataset.y } };   // onto an item: the two swap
    return null;
  }
  function endDrag(e) {
    removeEventListener('pointermove', moveDrag);
    if (drag?.on) { const t = target(e); drag.ghost?.remove(); drag.el.style.opacity = ''; if (t) send(t.act); setTimeout(() => { dragged = false; }, 50); }
    drag = null;
  }
  function showActions(ch, it) {
    const a = root.querySelector('.actions');
    if (it.base === 'shard') { a.innerHTML = `<button class="primary" data-use>Use on an item…</button>`; a.querySelector('[data-use]').onclick = () => { pendingShard = it.uid; root.classList.add('shaping'); a.innerHTML = '<em>Now tap the item to shape (or the shard again to stop).</em>'; }; return; }
    if (it.base === 'dust') { a.innerHTML = '<em>The crafter in town turns dust into Glimmer Shards.</em>'; return; }
    if (it.base === 'potion') { a.innerHTML = `<button class="primary" data-blt>To belt</button><button data-drink>Drink</button>`; a.querySelector('[data-blt]').onclick = () => send({ do: 'belt', uid: it.uid }); a.querySelector('[data-drink]').onclick = () => send({ do: 'drink', kind: it.kind }); return; }
    const c = cmpFor(ch, it);
    a.innerHTML = (it.ided === false ? `<button class="primary" data-id>Identify</button>` : `<button class="primary" data-eq>Equip${c && c.slots.length > 1 ? ` in ${esc(SLOT_NAME[c.slot])}` : ''}</button>`)
      + (c && c.slots.length > 1 ? `<button data-cmp>Compare: ${esc(SLOT_NAME[c.slot])} ⇄</button>` : '') + `<button data-salv>Break for shards</button>`;
    a.querySelector('[data-cmp]')?.addEventListener('click', () => cycleCompare());
    a.querySelector('[data-salv]').onclick = () => { ask({ title: 'Salvage this item?', text: 'It breaks into crafting materials and is gone for good.', ok: 'Salvage', danger: true }).then(y => y && send({ do: 'salvage', uid: it.uid })); };
    a.querySelector('[data-id]')?.addEventListener('click', () => send({ do: 'identify', uid: it.uid }));
    a.querySelector('[data-eq]')?.addEventListener('click', () => send({ do: 'equip', uid: it.uid, slot: slotFor(it) }));
  }
  // ---- compare (game standards §5b): which worn slot the item in hand is set against; Shift, the controller's Y and
  // the Compare button switch it when two slots could take the item, and Equip puts it in the slot being compared ----
  let cmp = { uid: null, slot: null, slots: [] }, tipFor = null;
  function cmpFor(ch, it) {
    if (!items.bases[it.base] || it.base === 'potion' || it.base === 'shard' || it.base === 'dust') return null;
    const slots = compareSlots(items, it, gripOf(items, ch, skills)); if (!slots.length) return null;
    if (cmp.uid !== it.uid || !slots.includes(cmp.slot)) cmp = { uid: it.uid, slot: firstCompareSlot(slots, ch.equip), slots };
    else cmp.slots = slots;
    return cmp;
  }
  const slotFor = it => cmp.uid === it.uid ? cmp.slot : undefined;
  function cycleCompare() {
    if (root.hidden || !cmp.uid || cmp.slots.length < 2) return false;
    cmp.slot = cmp.slots[(cmp.slots.indexOf(cmp.slot) + 1) % cmp.slots.length];
    if (tipFor && tipFor[1].uid === cmp.uid) showTip(...tipFor);
    const ch = getChar(), it = ch?.bag?.find(i => i.uid === cmp.uid); if (it && sel === it.uid) showActions(ch, it);
    return true;
  }
  addEventListener('keydown', e => { if (e.key === 'Shift' && !e.repeat && !root.hidden && tipFor && cycleCompare()) e.preventDefault(); });
  // the item card shows in one fixed place under the bag (lessons rule 15: nothing covers anything else), for hover,
  // tap and the controller alike; the selected item comes back when the pointer leaves another one
  function showTip(anchor, it, ch, isWorn = false) {
    tipFor = [anchor, it, ch, isWorn];
    const c = isWorn ? null : cmpFor(ch, it), box = root.querySelector('.sh-detail'); if (!box) return;
    box.innerHTML = c ? compareTipHtml(items, it, ch, c.slot, c.slots, potions, currency) : itemTip(items, it, ch, null, potions, currency, isWorn ? 'Equipped' : '');
    box.classList.add('on');
  }
  function hideTip() { tipFor = null; const box = root.querySelector('.sh-detail'); if (box) { box.innerHTML = ''; box.classList.remove('on'); } }
  function backToSel(ch) { const it = sel && ch?.bag?.find(i => i.uid === sel); const el = it && root.querySelector(`.bag .item[data-uid="${it.uid}"]`); if (el) showTip(el, it, ch); else hideTip(); }
  root.addEventListener('click', e => { if (e.target === root) toggle(false); });
  void nope;
  return { toggle, refresh, cycleCompare, get open() { return !root.hidden; } };
}
