// Item cards and tooltips: one place that turns a part (an item from the parts hold, or a bare block id)
// into the real numbers a player needs — damage type, hit size, damage per second, range, arc, how it
// aims, CPU, power, crew, rarity, bonuses and legendary power. The station shops and build mode share it.
//
// Exports (keep small):
//   MODE_TEXT                    targeting mode id -> plain words
//   itemStats(itemOrId)          -> { def, w, rarity, rows: [[label, value, cls?]], dps, ... } numbers only
//   itemCard(itemOrId, opts)     -> a .card element (opts: { price, priceLabel, actions: [button elements], note, compact })
//   itemTipHTML(itemOrId)        -> HTML string for dom.js tip()
//   rarityColor(itemOrId)        -> the rarity's colour

import { el, esc, fmt } from './dom.js';
import { BLOCKS, CATEGORIES } from '../data/blocks.js';
import { ALL_WEAPONS } from '../data/weapons.js';
import { DAMAGE, HIT_SIZE, RARITY_BY_ID, ARMOR } from '../data/types.js';
import { POWERS } from '../sim/loot.js';

/** How each weapon aims, in plain words. */
export const MODE_TEXT = {
  auto: 'Auto turret — aims and fires by itself',
  pd: 'Point defence — shoots missiles and drones first',
  manual: 'Manual aim — fires where you point',
  fixed: 'Fixed forward — aim with your ship',
  lock: 'Missile lock — chases the target nearest your aim',
  beam: 'Beam — hold Fire, sweeps where you aim',
  tool: 'Tool',
};
const TOOL_TEXT = { mine: 'Tool — mining laser', harpoon: 'Tool — harpoon', tractor: 'Tool — tractor beam' };

/** What each bonus means. */
const AFFIX_TEXT = {
  dmg: 'damage', rate: 'fire rate', range: 'range', hp: 'block health', shield: 'shield strength',
  power: 'less power used', thrust: 'thrust', turn: 'turning',
};

const norm = x => (typeof x === 'string' ? { block: x, rarity: null, mods: {} } : x || {});
const r1 = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
export const rarityColor = x => RARITY_BY_ID[norm(x).rarity || 'common']?.color || '#c9ccd4';

/** All the numbers for one part, the same maths the game uses in combat (world.js wStat). */
export function itemStats(x) {
  const it = norm(x); const def = BLOCKS[it.block];
  if (!def) return { def: null, rows: [] };
  const rar = it.rarity ? RARITY_BY_ID[it.rarity] : null; const rb = rar?.bonus || 0; const m = it.mods || {};
  const rows = []; const out = { def, rarity: rar, rows, dps: 0 };
  const w = def.weapon ? ALL_WEAPONS[def.weapon] : null;
  if (w) {
    out.w = w;
    const dmg = w.dmg * (1 + rb + (m.dmg || 0));
    const rate = (w.rate || 0) * (1 + (m.rate || 0) + rb * 0.3);
    const range = w.range * (1 + (m.range || 0) + rb * 0.15);
    const count = (w.count || 1) + (m.twin ? 1 : 0);
    const isBeam = w.mode === 'beam' || w.proj === 'beam';
    const chain = (w.chain || 0) + (m.chain ? 1 : 0);
    out.dps = isBeam ? dmg : dmg * count * rate * (chain ? 1 + chain * 0.6 : 1);
    if (w.mode === 'tool' && !w.dmg) out.dps = 0;
    const D = DAMAGE[w.type];
    rows.push(['Damage', `<b style="color:${D.color}">${esc(D.name)}</b> · ${esc(HIT_SIZE[w.size].name)} hits`]);
    if (isBeam) rows.push(['Beam damage', `${r1(dmg)} per second`]);
    else if (w.mode !== 'tool' || w.dmg) rows.push(['Per hit', `${r1(dmg)}${count > 1 ? ` × ${count}` : ''}`]);
    if (!isBeam && rate) rows.push(['Fire rate', `${r1(rate)} per second`]);
    if (out.dps) rows.push(['Damage per second', `<b>${r1(out.dps)}</b>`]);
    rows.push(['Range', fmt(range)]);
    rows.push(['Arc', w.arc >= 360 ? 'All round' : `${w.arc}°`]);
    rows.push(['Aiming', esc(w.mode === 'tool' ? (TOOL_TEXT[w.tool] || 'Tool') : MODE_TEXT[w.mode] || w.mode)]);
    if (w.splash) rows.push(['Blast radius', fmt(w.splash * (m.splash ? 1.6 : 1))]);
    if (w.pierce || m.pierce) rows.push(['Pierces', `${(w.pierce || 0) + (m.pierce ? 2 : 0)} blocks`]);
    if (chain) rows.push(['Chains to', `${chain} more targets`]);
    if (w.burn || m.burn) rows.push(['Burns', 'Sets targets on fire']);
    if (w.emp) rows.push(['Disables', `${w.emp}s of weapons and engines`]);
    if (w.shieldMult > 1) rows.push(['Against shields', `×${w.shieldMult}`, 'good']);
    if (w.homing) rows.push(['Homing', 'Yes']);
    if (w.mineMult) rows.push(['Mining', `×${w.mineMult} on rock`]);
  } else {
    if (def.thrust) rows.push(['Thrust', fmt(def.thrust * (1 + (m.thrust || 0)))]);
    if (def.turn) rows.push(['Turning', fmt(def.turn * (1 + (m.turn || 0)))]);
    if (def.power > 0) rows.push(['Power made', `+${fmt(def.power)}`, 'good']);
    if (def.cpuCap) rows.push(['CPU given', `+${def.cpuCap}`, 'good']);
    if (def.crewCap) rows.push(['Crew bunks', `+${fmt(def.crewCap)}`, 'good']);
    if (def.cargo) rows.push(['Cargo', `+${fmt(def.cargo)}`]);
    if (def.shield) {
      const sh = def.shield; const hp = sh.hp * (1 + rb + (m.shield || 0));
      rows.push(['Shield', `${fmt(hp)} (${sh.kind === 'arc' ? `${sh.arc}° wall one way` : 'bubble all round'})`]);
      rows.push(['Recharge', `${fmt(sh.regen)}/s after ${sh.delay}s without hits${m.bulwark ? ' (×2)' : ''}`]);
    }
    if (def.drones) rows.push(['Drones', `Carries ${def.drones}`]);
    if (def.repair) rows.push(['Repairs', `${def.repair} health/s out of combat`]);
    if (def.scan) rows.push(['Scanner', 'Shows enemy armour; finds ore further']);
    if (def.jump) rows.push(['Jump reach', `${def.jump} links`]);
    if (def.magnet) rows.push(['Pull range', fmt(def.magnet)]);
    if (def.cloak) rows.push(['Cloak', `${def.cloak}s invisible`]);
    if (def.explode) rows.push(['When destroyed', 'Explodes', 'bad']);
  }
  // block costs: what fitting it takes
  const pw = def.power < 0 ? -def.power * (1 - (m.power || 0)) : 0;
  out.cost = { cpu: def.cpu || 0, power: pw, crew: def.crew || 0 };
  rows.push(['Size', `${def.size}×${def.size}`]);
  rows.push(['Block health', fmt(def.hp * (1 + (m.hp || 0) + rb * 0.5)) + (ARMOR[def.armor] ? ` · ${esc(ARMOR[def.armor].name)}` : '')]);
  if (out.cost.cpu) rows.push(['CPU', out.cost.cpu]);
  if (pw) rows.push(['Power use', r1(pw)]);
  if (out.cost.crew) rows.push(['Crew', out.cost.crew]);
  // bonuses and powers
  out.affixes = Object.entries(m).filter(([k]) => AFFIX_TEXT[k]).map(([k, v]) => `+${Math.round(v * 100)}% ${AFFIX_TEXT[k]}`);
  out.power = it.power ? POWERS.find(p => p.key === it.power) : null;
  return out;
}

function rowsHTML(rows) {
  return `<div class="kv">${rows.map(([k, v, c]) => `<span>${esc(k)}</span><span${c ? ` class="${c}"` : ''}>${v}</span>`).join('')}</div>`;
}
function headHTML(it, S) {
  const rar = S.rarity; const col = rarityColor(it);
  const name = it.name || S.def.name;
  const kind = (S.w ? (S.w.race ? 'Alien weapon' : 'Weapon') : CATEGORIES[S.def.cat] || S.def.cat);
  return `<h4 style="color:${col}">${esc(name)}</h4><div class="hint">${rar ? `<span style="color:${col}">${esc(rar.name)}</span> · ` : ''}${esc(kind)} · tier ${S.def.tier}</div>`;
}
function extrasHTML(S) {
  let h = '';
  if (S.affixes.length) h += `<div class="it-mods">${S.affixes.map(a => `<span>${esc(a)}</span>`).join('')}</div>`;
  if (S.power) h += `<div class="it-power">★ ${esc(S.power.name.replace(/^of /, ''))}: ${esc(S.power.blurb)}</div>`;
  if (S.def.blurb) h += `<div class="hint">${esc(S.def.blurb)}</div>`;
  return h;
}

/** HTML for a hover tooltip (dom.js tip()). */
export function itemTipHTML(x) {
  const it = norm(x); const S = itemStats(it); if (!S.def) return '';
  return headHTML(it, S) + rowsHTML(S.rows) + extrasHTML(S);
}

/**
 * A card element for a shop or the parts hold.
 * opts.price (number) + opts.priceLabel ('Price'), opts.actions (array of buttons), opts.note (text),
 * opts.compact (true = only the key numbers; the rest in a <details> fold).
 */
export function itemCard(x, opts = {}) {
  const it = norm(x); const S = itemStats(it);
  const card = el('div', { class: 'card it-card', style: `border-color:${rarityColor(it)}55` });
  if (!S.def) { card.append(el('div', {}, 'Unknown part')); return card; }
  card.append(el('div', { html: headHTML(it, S) }));
  const keys = opts.compact ? S.rows.filter(r => ['Damage', 'Damage per second', 'Range', 'Aiming', 'Shield', 'Thrust', 'Power made', 'CPU given', 'Drones', 'Size', 'CPU', 'Power use', 'Crew'].includes(r[0])) : S.rows;
  card.append(el('div', { html: rowsHTML(keys) }));
  if (opts.compact && keys.length < S.rows.length) {
    const more = el('details', { class: 'it-more' }, el('summary', {}, 'More numbers'));
    more.append(el('div', { html: rowsHTML(S.rows.filter(r => !keys.includes(r))) }));
    card.append(more);
  }
  card.append(el('div', { html: extrasHTML(S) }));
  if (opts.note) card.append(el('div', { class: 'hint' }, opts.note));
  if (opts.price != null || opts.actions?.length) {
    const foot = el('div', { class: 'row wrap it-foot' });
    if (opts.price != null) foot.append(el('span', { class: 'amber it-price' }, `${opts.priceLabel || 'Price'}: ${fmt(opts.price)} cr`));
    foot.append(el('div', { class: 'grow' }), ...(opts.actions || []));
    card.append(foot);
  }
  return card;
}
