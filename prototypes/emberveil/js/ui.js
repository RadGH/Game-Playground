// Emberveil 2 — themed interface helpers.
//
// Everything here is presentation only: icon markup from assets/data/ui, frame flourishes, the
// title-screen embers, the in-game menu overlay, tooltip content builders and the plain-language
// text that explains stats, node types and the game loop. main.js imports what it needs; nothing
// in here touches game rules.
import { installTooltips, registerTip, hideTip } from '../../../shared/tooltip.js';
import { rarityClass } from '../../../shared/rewards.js';
import { statName } from './loot.js';

export { installTooltips, registerTip, hideTip };

const UI = '../../assets/data/ui/';

/** `<i class="ic ic-gold">` markup for one icon from assets/data/ui. */
export function iconHtml(name, cls = '') { return `<i class="ic ic-${name}${cls ? ' ' + cls : ''}"></i>`; }
/** The same as an element. */
export function icon(name, cls = '') { const i = document.createElement('i'); i.className = `ic ic-${name}${cls ? ' ' + cls : ''}`; return i; }

// ------------------------------------------------------------------ rarity
/**
 * THE rarity table (round 22, E48). Every item has one display key — `set` if it has a setId, else `unique`
 * if isUnique, else its rarity (the same rule as shared/rewards.js rarityClass, which the loot popup uses) —
 * and each key has one colour and one gem. The name and the icon use them everywhere: loot popup, bag,
 * merchant, smith, enchanter, item card, tooltips, party tab and the log. The colours live in
 * data/items.json `rarityColors` (setRarityTable() writes them onto the page as --normal … --set); the
 * defaults below are the same values, for pages that never load the data.
 *
 * Why: before round 22 the bag coloured a name by `it.rarity` while the gem and the loot popup looked at
 * `setId` first, so a set piece (rarity "legendary" underneath) had a teal gem and an orange name. The gem
 * is picked by colour, not by file name: rare (yellow) takes the gold "unique" gem, unique and legendary
 * share the orange gem.
 */
export const RARITY_STYLE = {
  normal: { color: '#c9c2b6', gem: 'common', label: 'normal' },
  magic: { color: '#7f95ff', gem: 'rare', label: 'magic' },
  rare: { color: '#e8d020', gem: 'unique', label: 'rare' },
  legendary: { color: '#ff8020', gem: 'legendary', label: 'legendary' },
  unique: { color: '#ff5a3c', gem: 'legendary', label: 'unique' },
  set: { color: '#2fc4b2', gem: 'set', label: 'set piece' },
};
export const RARITY_GEM = { ...Object.fromEntries(Object.entries(RARITY_STYLE).map(([k, v]) => [k, v.gem])), epic: 'epic' };
/** The display key for an item: 'set' | 'unique' | 'legendary' | 'rare' | 'magic' | 'normal'. */
export function rarityKey(it) { return rarityClass(it); }
/** What the card says: "set piece · legendary", "unique · legendary", "rare". */
export function rarityLabel(it) { const k = rarityKey(it); return k === 'set' || k === 'unique' ? `${RARITY_STYLE[k].label} · ${it.rarity || 'legendary'}` : (it?.rarity || 'normal'); }
/** Load the table from data (items.json rarityColors / rarityGems) and write the colours onto the page. */
export function setRarityTable(colors = {}, gems = {}, root = typeof document !== 'undefined' ? document.documentElement : null) {
  for (const [k, c] of Object.entries(colors || {})) RARITY_STYLE[k] = { ...(RARITY_STYLE[k] || { label: k, gem: 'common' }), color: c };
  for (const [k, g] of Object.entries(gems || {})) { RARITY_STYLE[k] = { ...(RARITY_STYLE[k] || { label: k }), gem: g }; RARITY_GEM[k] = g; }
  if (root) for (const [k, v] of Object.entries(RARITY_STYLE)) root.style.setProperty('--' + k, v.color);
  return RARITY_STYLE;
}
export function gemFor(it) { if (!it) return 'common'; return RARITY_STYLE[rarityKey(it)]?.gem || 'common'; }
export function gemHtml(it) { return `<i class="gem gem-${gemFor(it)}" data-rarity="${rarityKey(it)}"></i>`; }

// ------------------------------------------------------------------ equipment slots
export const SLOT_ICON = { weapon: 'slot_weapon', offhand: 'slot_offhand', head: 'slot_head', chest: 'slot_chest', hands: 'slot_hands', legs: 'slot_legs', feet: 'slot_feet', ring: 'slot_ring', ring1: 'slot_ring', ring2: 'slot_ring', necklace: 'slot_necklace', amulet: 'slot_necklace' };
export const SLOT_NAME = { weapon: 'Weapon', offhand: 'Off hand', head: 'Head', chest: 'Chest', hands: 'Hands', legs: 'Legs', feet: 'Feet', ring1: 'Ring (left)', ring2: 'Ring (right)', ring: 'Ring', necklace: 'Necklace' };
export const slotIcon = s => SLOT_ICON[s] || 'slot_ring';

// ------------------------------------------------------------------ plain-language help
export const STAT_TIPS = {
  STR: 'Strength — melee damage and how much you can shrug off. Most heavy weapons scale with it.',
  DEX: 'Dexterity — ranged damage, chance to hit and chance to dodge.',
  INT: 'Intelligence — spell damage and healing, and the size of the mana pool.',
  CON: 'Constitution — maximum health, and how well you resist bleeding and poison.',
  armor: 'Armor — cuts the damage of every physical hit that lands.',
  hit: 'Hit — the chance an attack lands instead of missing, before the target dodges.',
  dodge: 'Dodge — the chance to slip an incoming attack entirely.',
  crit: 'Crit — the chance a hit lands hard, for extra damage.',
  dmg: 'Damage — the low and high ends of one weapon swing, before crits and skills.',
  hp: 'Health. At zero the hero goes down; they come back after a rest or a revive.',
  mp: 'Mana — spent on skills. It comes back slowly in fights and fully at a rest.',
  xp: 'Experience towards the next level. Levels bring attribute points and, at some levels, a talent.',
};
/** Node type → a name and a plain-words line for the map tooltip. */
export const NODE_INFO = {
  combat: ['Battle', 'Something is waiting here. Expect a fight.'],
  ambush: ['Ambush', 'A fight that starts badly — the enemy moves first.'],
  dialog: ['Meeting', 'Someone to talk to. Choices here can end in a reward or a fight.'],
  town: ['Settlement', 'Safe ground: merchant, smith, inn, quest board.'],
  treasure: ['Cache', 'Loot, if you can get to it.'],
  boss: ['Boss', 'The end of the act. Come rested and geared.'],
  lore: ['Old stone', 'A piece of the story. No danger.'],
  shrine: ['Shrine', 'A blessing or a bargain — sometimes both.'],
  challenge: ['Trial', 'A harder fight with a better reward.'],
  dungeon: ['Delve', 'Several rooms in a row with no rest between them.'],
  skillCheck: ['Test', 'One hero is measured against the road. Their attributes decide it.'],
  heroquest: ['Errand', "A personal job for one of your heroes."],
  named: ['Named enemy', 'A rival with a name. Beat them or they remember you.'],
  start: ['Trailhead', 'Where this zone begins.'],
};
export function nodeInfo(n) {
  const [name, text] = NODE_INFO[n.named ? 'named' : n.type] || NODE_INFO[n.type] || ['Waypoint', 'A stop on the road.'];
  return { name, text };
}

/** The "how to play" panel, in plain words. Used on the title screen and in the menu. */
export function howToHtml() {
  return `
  <p>You run a party of four down a road that stopped being safe a long time ago.</p>
  <h5>The loop</h5>
  <ul>
    <li><b>Travel.</b> Click a lit node on the map. Each move costs one of your moves for the day.</li>
    <li><b>Resolve the node.</b> Fights run themselves — you watch, and the log tells you what happened.</li>
    <li><b>Rest</b> when the moves run out. A rest eats a ration, heals the party and gives you a scene round the fire.</li>
    <li><b>Spend what you found.</b> Gear goes in the Bag; levels give points in the Skills tab.</li>
  </ul>
  <h5>Things that will bite you</h5>
  <ul>
    <li>No rations means exhaustion: −10% to hit, dodge and damage per stack, and it keeps stacking.</li>
    <li>Resting in the open can bring a night attack. Torches, tents and the right vehicle make it rarer.</li>
    <li>A hero at zero health is out for the rest of the fight. The whole party down ends the run of the day badly.</li>
  </ul>
  <h5>Good habits</h5>
  <ul>
    <li>Buy rations before leaving a settlement, and keep one spare day of food.</li>
    <li>Hover anything with a soft glow — gear, stats, skills, map nodes — for what it actually does.</li>
    <li>Click a hero in the Party tab to point the Skills tab at them.</li>
    <li>Save from the top bar or the menu. The save lives in this browser.</li>
  </ul>`;
}

// ------------------------------------------------------------------ decoration
/** Drop the four gold corner flourishes into every `.framed` box under `root` (safe to run more than once). */
export function decorateFrames(root = document) {
  const boxes = [];
  if (root instanceof Element && root.classList.contains('framed')) boxes.push(root);
  boxes.push(...root.querySelectorAll('.framed'));
  for (const box of boxes) {
    if (box.querySelector(':scope > .fc')) continue;           // already flourished
    for (const c of ['tl', 'tr', 'br', 'bl']) { const i = document.createElement('i'); i.className = `fc fc-${c}`; box.prepend(i); }
  }
}

/** Drifting embers on the title screen: a dozen cheap CSS-animated sprites. */
export function initEmbers(host, count = 14) {
  if (!host || host.childElementCount) return;
  for (let n = 0; n < count; n++) {
    const i = document.createElement('i');
    const dur = 9 + Math.random() * 11;
    i.style.left = (Math.random() * 100).toFixed(1) + '%';
    i.style.animationDuration = dur.toFixed(1) + 's';
    i.style.animationDelay = (-Math.random() * dur).toFixed(1) + 's';
    i.style.setProperty('--drift', (Math.random() * 120 - 60).toFixed(0) + 'px');
    i.style.width = i.style.height = (5 + Math.random() * 8).toFixed(0) + 'px';
    host.append(i);
  }
}

/** Fill every `[data-howto]` container with the how-to-play text. */
export function fillHowTo(root = document) { for (const box of root.querySelectorAll('[data-howto]')) box.innerHTML = howToHtml(); }

// ------------------------------------------------------------------ tooltip cards
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

/** An item's name, coloured by the one rarity table, with a live hover card (main.js registers the `item` renderer). */
export function itemNameHtml(it, { cls = '', tip = true } = {}) {
  if (!it) return '';
  const k = rarityKey(it);
  return `<span class="iname ${k}${cls ? ' ' + cls : ''}" data-rarity="${k}"${tip && it.id ? ` data-tip-render="item" data-tip-class="tip-compare" data-item-id="${esc(it.id)}"` : ''}>${esc(it.name)}</span>`;
}

// ------------------------------------------------------------------ comparing an item with what a hero wears
// One comparison, used by the hover card on every item row (E46) and by the item dialog (E4), so the two can
// never disagree.
const PCT_STATS = new Set(['critChance', 'critDamage', 'spellPower', 'goldFind', 'magicFind', 'xpFind', 'cooldownReduction', 'block_chance', 'dmgPct']);
/** A stat value the way people read it: 0.05 crit chance is "5%", 12 armour is "12". */
export function fmtStat(stat, v) {
  const pct = PCT_STATS.has(stat) || (String(stat).startsWith('cond_') && Math.abs(v) < 1);
  return pct ? `${Math.round(v * 1000) / 10}%` : String(Math.round(v * 10) / 10);
}
/** Everything an item's properties add, summed by stat ({ str: 5, critChance: 0.04 }). */
export function itemStatTotals(it) {
  const out = {}; if (!it) return out;
  for (const a of it.affixes || []) { if (typeof a.value !== 'number' || !a.stat || a.stat === 'cond_legendaryEffect') continue; out[a.stat] = (out[a.stat] || 0) + a.value; }
  return out;
}
/** Every slot worth comparing an item against for this hero: both rings; both hands for a one-hander that fits the off hand. */
export function compareSlots(hero, it) {
  if (it.slot === 'ring') return ['ring1', 'ring2'];
  if (it.type === 'weapon' && it.offHandOk && !it.twoHanded && hero?.equipment?.weapon && !hero.equipment.weapon.twoHanded) return ['weapon', 'offhand'];
  return [it.slot];
}
/**
 * Compare an item with what `hero` wears.
 *   compareItem(it, hero, { loot, canUse, slotFor })
 *   → { hero, usable, why, into, targets: [{ slot, cur, same, score, curScore, diff, rows: [{ key, label, mine, theirs, d, fmt }] }], set }
 * `into` is the slot equipping would really use (slotFor, the same rule as rules.equip); `targets` lists
 * every slot worth comparing against, `into` first. `set` is loot.setInfo(): pieces worn now and with it.
 */
export function compareItem(it, hero, { loot, canUse = () => true, slotFor = null } = {}) {
  if (!it || !hero || !loot) return null;
  const usable = it.type !== 'weapon' || canUse(hero, it);
  const into = slotFor ? slotFor(hero, it) : (it.slot === 'ring' ? 'ring1' : it.slot);
  const slots = compareSlots(hero, it); if (!slots.includes(into)) slots.unshift(into); else slots.sort((a, b) => (a === into ? -1 : b === into ? 1 : 0));
  const s = loot.score(it, hero); const mine = itemStatTotals(it);
  const targets = slots.map(slot => {
    const cur = hero.equipment?.[slot] || null; const same = !!cur && (cur === it || cur.id === it.id);
    const cs = cur ? loot.score(cur, hero) : null; const theirs = itemStatTotals(cur);
    const rows = [];
    const row = (key, label, a, b, fmt = v => String(Math.round(v * 10) / 10)) => { if (a == null && b == null) return; rows.push({ key, label, mine: a, theirs: b, d: (a ?? 0) - (b ?? 0), fmt }); };
    row('dmgLow', 'Damage (low)', it.dmg?.[0] ?? null, cur?.dmg?.[0] ?? null);
    row('dmgHigh', 'Damage (high)', it.dmg?.[1] ?? null, cur?.dmg?.[1] ?? null);
    row('armor', 'Armor', it.armor ?? null, cur?.armor ?? null);
    for (const stat of new Set([...Object.keys(mine), ...Object.keys(theirs)])) row('stat:' + stat, statName(stat), mine[stat] ?? null, theirs[stat] ?? null, v => fmtStat(stat, v));
    row('offense', 'Offense', s.offense, cs?.offense ?? 0); row('defense', 'Defense', s.defense, cs?.defense ?? 0); row('utility', 'Utility', s.utility, cs?.utility ?? 0);
    return { slot, cur, same, score: s, curScore: cs, diff: s.total - (cs?.total ?? 0), rows };
  });
  const why = usable ? '' : `${hero.short || hero.name} is a ${hero.className || 'hero'} and cannot use ${it.subtype || 'this'}s — ${(hero.weapons || []).join(', ') || 'no weapons'} only.`;
  return { hero, usable, why, into, targets, set: loot.setInfo ? loot.setInfo(it, hero.equipment, { slot: into }) : null };
}
/** A signed difference with a colour class: better (green), worse (red) or the same. */
function deltaHtml(d, fmt) { if (!d || Math.abs(d) < 1e-9) return '<span class="even">=</span>'; return `<span class="${d > 0 ? 'good' : 'bad'}">${d > 0 ? '+' : ''}${esc(fmt(d))}</span>`; }
/**
 * The set block: set name, pieces worn now and with this item, every piece (ticked when worn), and each
 * threshold with its bonus and power — lit when it is on, marked "with this" when this item would switch it on.
 */
export function setInfoHtml(info, { describe = null, legendaryText = id => id, heroShort = '', className = id => id } = {}) {
  if (!info) return '';
  const bonusText = b => Object.entries(b || {}).filter(([, v]) => typeof v === 'number').map(([k, v]) => describe ? describe({ stat: k, value: v }) : `+${fmtStat(k, v)} ${statName(k)}`).join(', ');
  const steps = info.steps.map(st => {
    const parts = []; const bt = bonusText(st.bonus); if (bt) parts.push(bt);
    if (st.power) parts.push(legendaryText(st.power)); if (st.legendary) parts.push(legendaryText(st.legendary));
    const cls = st.on ? 'on' : st.onWith ? 'next' : 'off';
    return `<div class="set-step ${cls}"><b>${st.at}</b> ${esc(parts.join(' · ') || '—')}${!st.on && st.onWith ? ' <i>(with this)</i>' : ''}</div>`;
  }).join('');
  const count = `${heroShort ? esc(heroShort) + ' wears ' : ''}${info.worn}/${info.pieces}${!info.wearing && info.withItem !== info.worn ? ` → ${info.withItem}/${info.pieces} with this` : ''}`;
  return `<div class="set-block"><div class="tip-row"><span class="set">◆ ${esc(info.set.name)}</span><b class="set-count">${count}</b></div>`
    + (info.classes?.length ? `<div class="tip-sub">Made for: ${esc(info.classes.map(className).join(', '))}</div>` : '')
    + `<div class="set-pieces">${info.pieceList.map(p => `<span class="${p.on ? 'on' : ''}">${p.on ? '✓' : '·'} ${esc(p.name)}</span>`).join('')}</div>${steps}</div>`;
}
/**
 * The compare hover card (E46): the hovered item and what the hero wears side by side (both rings / both
 * hands where relevant), a stat-by-stat table marked better or worse, whether the hero can use it, and set
 * progress. `note` is a line from the caller (price, "click for the full card").
 */
export function compareTipHtml(cmp, { it, describe, legendaryText, className, note = '' } = {}) {
  if (!cmp) return itemTipHtml({ it, describe, setHtml: '' }) + note;
  const hero = cmp.hero, multi = cmp.targets.length > 1;
  const newCard = itemTipHtml({ it, score: cmp.targets[0]?.score, describe });
  const curCards = cmp.targets.map(t => `<div class="tipcmp-label">${esc(hero.short)} · ${esc(SLOT_NAME[t.slot] || t.slot)}${t.same ? ' · this one' : ''}</div>`
    + (t.cur ? itemTipHtml({ it: t.cur, score: t.curScore, describe }) : '<div class="tip-sub">Nothing equipped.</div>')).join('<hr>');
  const keys = []; const byKey = {};
  for (const [ti, t] of cmp.targets.entries()) for (const r of t.rows) { if (!byKey[r.key]) { byKey[r.key] = { label: r.label, mine: r.mine, fmt: r.fmt, d: [] }; keys.push(r.key); } byKey[r.key].d[ti] = r; }
  const body = keys.filter(k => !['offense', 'defense', 'utility'].includes(k)).map(k => { const r = byKey[k];
    return `<tr><td>${esc(r.label)}</td><td>${r.mine == null ? '—' : esc(r.fmt(r.mine))}</td>${cmp.targets.map((t, ti) => `<td>${t.same ? '<span class="even">=</span>' : deltaHtml(r.d[ti]?.d ?? (r.mine ?? 0), r.fmt)}</td>`).join('')}</tr>`; }).join('');
  const total = `<tr class="total"><td>Score</td><td>${cmp.targets[0]?.score.total ?? 0}</td>${cmp.targets.map(t => `<td>${t.same ? '<span class="even">=</span>' : deltaHtml(t.diff, v => String(v))}</td>`).join('')}</tr>`;
  const head = `<tr><th></th><th>this</th>${cmp.targets.map(t => `<th>${multi ? esc(SLOT_NAME[t.slot] || t.slot) : 'vs worn'}</th>`).join('')}</tr>`;
  const use = cmp.usable ? `<div class="tip-sub use-ok">${esc(hero.short)} can use this${cmp.targets.some(t => t.same) ? ' — and is wearing it' : ''}.</div>` : `<div class="bad use-no">${esc(cmp.why)}</div>`;
  const set = cmp.set ? '<hr>' + setInfoHtml(cmp.set, { describe, legendaryText, heroShort: hero.short, className }) : '';
  return `<div class="tipcmp" data-hero="${esc(hero.id)}"><div class="tipcmp-cols"><div class="tipcmp-col new"><div class="tipcmp-label">Looking at</div>${newCard}</div><div class="tipcmp-col cur">${curCards}</div></div>`
    + `<hr><table class="tipcmp-diff">${head}${body}${total}</table>${use}${set}${note}</div>`;
}

/** Rich item card: name + gem, rarity (a set piece says "set piece · legendary"), slot, stats, affixes, optional set block. */
export function itemTipHtml({ it, score = null, cur = null, curScore = null, heroShort = '', describe = a => a.text || '', setHtml = '' }) {
  if (!it) return '';
  const bits = [`<div class="tip-title">${gemHtml(it)} ${itemNameHtml(it, { tip: false })}</div>`];
  bits.push(`<div class="tip-sub">${esc(rarityLabel(it))}${it.quality ? ' · ' + esc(it.quality) + ' quality' : ''} · ${esc(SLOT_NAME[it.slot] || it.slot)}${it.twoHanded ? ' · two-handed' : ''}</div>`);
  if (it.dmg) bits.push(`<div class="tip-row"><span>Damage</span><b>${it.dmg[0]}–${it.dmg[1]}</b></div>`);
  if (it.armor != null) bits.push(`<div class="tip-row"><span>Armor</span><b>${it.armor}</b></div>`);
  const aff = (it.affixes || []).map(a => `<div class="${a.baseIntrinsic ? '' : 'good'}">${esc(describe(a))}</div>`).join('');
  if (aff) bits.push('<hr>' + aff);
  if (score) {
    bits.push(`<hr><div class="tip-row"><span>Score</span><b>${score.total}</b></div>`);
    if (cur && curScore) {
      const d = score.total - curScore.total;
      bits.push(`<div class="tip-sub">vs ${esc(heroShort)}'s ${esc(cur.name)} (${curScore.total}) <span class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '+' : ''}${d}</span></div>`);
    } else if (!cur) bits.push('<div class="tip-sub">Nothing equipped in that slot.</div>');
  }
  if (it.lore) bits.push(`<hr><div class="tip-sub"><i>${esc(it.lore)}</i></div>`);
  return bits.join('');
}

// ------------------------------------------------------------------ menu overlay
/**
 * Wire the in-game menu dialog. `handlers` gets { resume, save, load, newGame, quit } — each may
 * return false to keep the menu open. Escape and the backdrop close it.
 */
export function initMenu(dlg, handlers = {}) {
  if (!dlg || dlg.dataset.wired === '1') return { open: () => dlg?.showModal(), close: () => dlg?.close() };
  dlg.dataset.wired = '1';
  const close = () => { hideTip(); if (dlg.open) dlg.close(); };
  const open = () => { if (!dlg.open) { hideTip(); dlg.showModal(); } };
  for (const b of dlg.querySelectorAll('[data-menu]')) {
    b.addEventListener('click', async () => {
      const act = b.dataset.menu;
      if (act === 'resume') return close();
      if (act === 'howto') { const d = dlg.querySelector('#menu-howto'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); } return; }
      const fn = { save: handlers.save, load: handlers.load, new: handlers.newGame, quit: handlers.quit }[act];
      const keepOpen = await fn?.();
      if (keepOpen !== true) close();
    });
  }
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });          // Escape
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });          // click the backdrop
  return { open, close };
}

/** One-time setup: tooltips, frame corners, embers, how-to text. */
export function setupUI() {
  installTooltips();
  decorateFrames();
  fillHowTo();
  initEmbers(document.getElementById('embers'));
}

// ------------------------------------------------------------------ skill checks
// One wording for every roll in the game, and one popup that shows it happening.
//
//   CON 18 + d20 (rolled 2) = 20 vs 20: pass
//
// Node tests, dialog choices, dungeon stages and crossings all used to print this differently
// ("Rolled 7 + 14 vs 18: success", "STR 14 + d20 9 vs 16: pass"). They all call checkText() now, so
// the log reads the same wherever the roll came from.

/**
 * The one line a skill check writes into the log.
 * @param {object} r
 * @param {string} r.stat        'CON', 'STR'…
 * @param {number} [r.best]      the party's best raw attribute score — what the player sees on the sheet
 * @param {number} [r.value]     the same thing, if the caller doesn't use `best`
 * @param {number} [r.statBonus] what that attribute is actually worth on the roll, when the rules
 *                               convert it (js/rules.js checkBonus). Shown in brackets when it differs.
 * @param {number} [r.bonus]     any extra on top (traits, the right words…)
 * @param {string} [r.bonusLabel] what that extra was, in plain words
 * @param {number} r.roll        the d20
 * @param {number} r.dc          what it had to beat
 * @param {boolean} r.ok
 * @returns {string} plain text, no markup
 */
export function checkText({ stat = '', best = null, value = null, statBonus = null, bonus = 0, bonusLabel = '', roll = 0, dc = 0, ok = false } = {}) {
  const attr = best ?? value ?? 0;
  const add = statBonus == null ? attr : statBonus;
  const total = add + (bonus || 0) + roll;
  const head = (statBonus != null && statBonus !== attr) ? `${stat} ${attr} (+${statBonus})` : `${stat} ${attr}`;
  const extra = bonus ? ` +${bonus}${bonusLabel ? ` (${bonusLabel})` : ''}` : '';
  return `${head}${extra} + d20 (rolled ${roll}) = ${total} vs ${dc}: ${ok ? 'pass' : 'fail'}`;
}
/** The same line as a coloured paragraph for the narrative panel. */
export function checkHtml(r) { return `<p class="sys check ${r.ok ? 'good' : 'bad'}">${esc(checkText(r))}</p>`; }

/** Is a skill-check popup on screen right now? */
let scOpen = null;
export function skillCheckOpen() { return !!scOpen; }

/**
 * Show a roll happening: a d20 tumbles for about 0.8 s, lands on the number, then the sum and a
 * PASS / FAIL stamp. A click, Enter, Space or Escape at any point jumps straight to the result;
 * after that the same keys close it. Resolves when it closes, so a caller can `await` it and keep
 * the scene in order.
 *
 * Every caller still writes checkText() into the log, so turning the popup off loses nothing.
 *
 *   await skillCheckPopup({ stat: 'CON', best: 18, roll: 2, dc: 20, ok: true, subtitle: 'The Ford' });
 *
 * @param {object} r     the same fields checkText() takes, plus { title, subtitle }
 * @param {object} opts  { container, speed (2 = twice as fast), enabled: false to do nothing }
 * @returns {Promise<void>}
 */
export function skillCheckPopup(r = {}, opts = {}) {
  if (opts.enabled === false || !r || typeof document === 'undefined') return Promise.resolve();
  if (scOpen) scOpen.close(true);
  const speed = Math.max(0.25, opts.speed || 1);
  const T = ms => ms / speed;
  const roll = Math.max(1, Math.min(20, Math.round(r.roll || 1)));

  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const overlay = mk('div', 'sc-overlay'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', r.title || 'Skill check');
  const card = mk('div', 'sc-card'); overlay.append(card);
  const skip = mk('span', 'sc-skip', 'skip ▸'); card.append(skip);
  card.append(mk('div', 'sc-ribbon', r.title || `${r.stat || ''} check`.trim()));
  card.append(mk('p', 'sc-sub', r.subtitle || (r.dc ? `difficulty ${r.dc}` : '')));
  const die = mk('div', 'sc-die rolling', '20'); card.append(die);
  const sum = mk('div', 'sc-sum'); card.append(sum);
  const stamp = mk('div', 'sc-stamp ' + (r.ok ? 'pass' : 'fail'), r.ok ? 'Pass' : 'Fail'); card.append(stamp);
  const btn = mk('button', 'sc-btn', 'Continue'); btn.type = 'button';
  const foot = mk('div', 'sc-foot'); foot.append(btn, mk('span', 'sc-hint', 'Enter · click')); card.append(foot);
  btn.style.visibility = 'hidden';
  (opts.container || document.body).append(overlay);

  let settled = false, closed = false, resolveP;
  const done = new Promise(res => { resolveP = res; });
  let spin = null;

  const settle = () => {
    if (settled) return; settled = true;
    if (spin) { clearInterval(spin); spin = null; }
    die.textContent = String(roll);
    die.classList.remove('rolling'); die.classList.add('settled');
    if (roll === 20) die.classList.add('nat20'); else if (roll === 1) die.classList.add('nat1');
    // "CON 18 + d20 (rolled 2) = 20 vs 20" — the verdict is the stamp underneath, not repeated here
    sum.innerHTML = `<b>${esc(checkText(r).replace(/: (pass|fail)$/, ''))}</b>`;
    sum.classList.add('show');
    stamp.classList.add('show');
    btn.style.visibility = '';
    btn.focus({ preventScroll: true });
  };
  const close = force => {
    if (closed) return;
    if (!settled && !force) return settle();              // the first click only skips the animation
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('sc-closing');
    setTimeout(() => overlay.remove(), 200);
    scOpen = null;
    resolveP();
  };
  const onKey = e => { if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); close(e.key === 'Escape'); } };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', () => close());
  btn.addEventListener('click', e => { e.stopPropagation(); close(true); });
  skip.addEventListener('click', e => { e.stopPropagation(); close(); });
  scOpen = { close, settle, overlay };

  // the tumble: a new face every 70 ms for about eight tenths of a second
  let face = 0;
  spin = setInterval(() => { face = 1 + ((face + 6) % 20); die.textContent = String(face); }, Math.max(20, T(70)));
  setTimeout(settle, T(800));
  return done;
}
