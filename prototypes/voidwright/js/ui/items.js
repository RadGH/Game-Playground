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
import { partStat, weaponStat } from '../sim/partstats.js';

/** Outfitter shelves by slot (play-test #38: "parts organized by slot … never seen parts that give more crew or CPU"). */
export const SLOTS = [
  { id: 'weapon', name: 'Weapons', cats: ['weapon'], n: 7 },
  { id: 'shield', name: 'Shields', cats: ['shield'], n: 3 },
  { id: 'power', name: 'Power', cats: ['power'], n: 3 },
  { id: 'engine', name: 'Engines', cats: ['engine', 'gyro'], n: 3 },
  { id: 'cpu', name: 'Computing', cats: ['cpu'], n: 4 },
  { id: 'crew', name: 'Crew & cargo', cats: ['crew', 'cargo'], n: 4 },
  { id: 'utility', name: 'Utility', cats: ['utility'], n: 4 },
  { id: 'drone', name: 'Drone ports', cats: ['drone'], n: 2 },
];

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

/** What each rolled bonus means (keys from sim/loot.js AFFIX). `flat` ones print as numbers, the rest as %. */
const AFFIX_TEXT = {
  dmg: 'damage', rate: 'fire rate', range: 'range', hp: 'block health', shield: 'shield strength', regen: 'shield recharge',
  power: 'less power used', output: 'power made', thrust: 'thrust', turn: 'turning', cargo: 'cargo', repair: 'repair speed', scan: 'scan reach',
};
const FLAT_TEXT = { cpu: n => `+${n} CPU`, crew: n => `+${n} crew room`, slots: n => `+${n} auto weapon slot${n > 1 ? 's' : ''}`, drones: n => `+${n} drone`, cpuLess: n => `${n} less CPU used` };

const norm = x => (typeof x === 'string' ? { block: x, rarity: null, mods: {} } : x || {});
const r1 = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10);
export const rarityColor = x => RARITY_BY_ID[norm(x).rarity || 'common']?.color || '#c9ccd4';

/** All the numbers for one part — the same maths the game uses (sim/partstats.js). */
export function itemStats(x) {
  const it = norm(x); const def = BLOCKS[it.block];
  if (!def) return { def: null, rows: [] };
  const rar = it.rarity ? RARITY_BY_ID[it.rarity] : null; const m = it.mods || {};
  const rows = []; const out = { def, rarity: rar, rows, dps: 0, key: null };
  const w = def.weapon ? ALL_WEAPONS[def.weapon] : null;
  if (w) {
    out.w = w;
    const dmg = weaponStat(w, it, 'dmg'), rate = weaponStat(w, it, 'rate'), range = weaponStat(w, it, 'range');
    const count = (w.count || 1) + (m.twin ? 1 : 0);
    const isBeam = w.mode === 'beam' || w.proj === 'beam';
    const chain = (w.chain || 0) + (m.chain ? 1 : 0);
    out.dps = isBeam ? dmg : dmg * count * rate * (chain ? 1 + chain * 0.6 : 1);
    if (w.mode === 'tool' && !w.dmg) out.dps = 0;
    out.key = w.tool === 'mine' ? ['Cutting', out.dps] : out.dps ? ['Damage per second', out.dps] : null;
    const D = DAMAGE[w.type];
    rows.push(['Damage', `<b style="color:${D.color}">${esc(D.name)}</b> · ${esc(HIT_SIZE[w.size].name)} hits`]);
    if (isBeam) rows.push(['Beam damage', `${r1(dmg)} per second`]);
    else if (w.mode !== 'tool' || w.dmg) rows.push(['Per hit', `${r1(dmg)}${count > 1 ? ` × ${count}` : ''}`]);
    if (!isBeam && rate) rows.push(['Fire rate', `${r1(rate)} per second`]);
    if (out.dps) rows.push(['Damage per second', `<b>${r1(out.dps)}</b>`]);
    rows.push(['Range', fmt(range)]);
    rows.push(['Arc', w.arc >= 360 ? 'All round' : `${w.arc}°`]);
    rows.push(['Aiming', esc(w.mode === 'tool' ? (TOOL_TEXT[w.tool] || 'Tool') : w.autoOnly ? 'Always automatic — needs no targeting slot' : 'Fires where you aim; set to Auto in build mode with a targeting slot')]);
    if (w.splash) rows.push(['Blast radius', fmt(w.splash * (m.splash ? 1.6 : 1))]);
    if (w.pierce || m.pierce) rows.push(['Pierces', `${(w.pierce || 0) + (m.pierce ? 2 : 0)} blocks`]);
    if (chain) rows.push(['Chains to', `${chain} more targets`]);
    if (w.burn || m.burn) rows.push(['Burns', 'Sets targets on fire']);
    if (w.emp) rows.push(['Disables', `${w.emp}s of weapons and engines`]);
    if (w.shieldMult > 1) rows.push(['Against shields', `×${w.shieldMult}`, 'good']);
    if (w.homing) rows.push(['Homing', 'Yes']);
    if (w.mineMult) rows.push(['Mining', `×${w.mineMult} on rock`]);
  } else {
    const th = partStat(def, it, 'thrust'), tu = partStat(def, it, 'turn'), po = partStat(def, it, 'powerOut'), cc = partStat(def, it, 'cpuCap'), cr = partStat(def, it, 'crewCap'), cg = partStat(def, it, 'cargo'), sl = partStat(def, it, 'autoSlots');
    if (th) { rows.push(['Thrust', fmt(th)]); out.key = ['Thrust', th]; }
    if (tu) { rows.push(['Turning', fmt(tu)]); out.key ||= ['Turning', tu]; }
    if (po) { rows.push(['Power made', `+${fmt(po)}`, 'good']); out.key = ['Power made', po]; }
    if (cc) { rows.push(['CPU given', `+${fmt(cc)}`, 'good']); out.key = ['CPU given', cc]; }
    if (sl) { rows.push(['Auto weapon slots', `+${sl}`, 'good']); out.key ||= ['Auto weapon slots', sl]; }
    if (cr) { rows.push(['Crew room', `+${fmt(cr)}`, 'good']); out.key = ['Crew room', cr]; }
    if (cg) { rows.push(['Cargo', `+${fmt(cg)}`]); out.key = ['Cargo', cg]; }
    if (def.shield) {
      const sh = def.shield; const hp = partStat(def, it, 'shield');
      rows.push(['Shield', `${fmt(hp)} (${sh.kind === 'arc' ? `${sh.arc}° wall one way` : 'bubble all round'})`]);
      rows.push(['Recharge', `${fmt(partStat(def, it, 'regen'))}/s after ${sh.delay}s without hits`]);
      out.key = ['Shield', hp];
    }
    const dr = partStat(def, it, 'drones'); if (dr) { rows.push(['Drones', `Carries ${dr}`]); out.key = ['Drones carried', dr]; }
    const rp = partStat(def, it, 'repair'); if (rp) { rows.push(['Repairs', `${fmt(rp)} health/s out of combat`]); out.key ||= ['Repairs', rp]; }
    if (def.scanRange) rows.push(['Scan reach', `${fmt(partStat(def, it, 'scanRange') / 1000)} km`]);
    if (def.fab) rows.push(['Crafts', `Parts up to tier ${def.fab >= 5 ? 'V' : 'II'} from ore, anywhere`]);
    if (def.jump) rows.push(['Jump reach', `${def.jump} links`]);
    if (def.magnet) rows.push(['Pull range', fmt(def.magnet)]);
    if (def.cloak) rows.push(['Cloak', `${def.cloak}s invisible`]);
    if (def.explode && !m.sun) rows.push(['When destroyed', 'Explodes', 'bad']);
  }
  // block costs: what fitting it takes
  const pw = partStat(def, it, 'powerUse');
  out.cost = { cpu: partStat(def, it, 'cpu'), power: pw, crew: def.crew || 0 };
  rows.push(['Size', `${def.size}×${def.size}`]);
  rows.push(['Block health', fmt(partStat(def, it, 'hp')) + (ARMOR[def.armor] ? ` · ${esc(ARMOR[def.armor].name)}` : '')]);
  if (out.cost.cpu) rows.push(['CPU', out.cost.cpu]);
  if (pw) rows.push(['Power use', r1(pw)]);
  if (out.cost.crew) rows.push(['Crew', out.cost.crew]);
  // rarity lift and rolled bonuses
  out.affixes = [];
  if (rar?.bonus) out.affixes.push(`${rar.name}: +${Math.round(rar.bonus * 100)}% base stats`);
  for (const [k, v] of Object.entries(m)) {
    if (FLAT_TEXT[k]) out.affixes.push(FLAT_TEXT[k](v));
    else if (AFFIX_TEXT[k]) out.affixes.push(`+${Math.round(v * 100)}% ${AFFIX_TEXT[k]}`);
  }
  out.power = it.power ? POWERS.find(p => p.key === it.power) : null;
  return out;
}

/** "Damage per second 42 → 61 (+19)" against the best fitted part of the same kind on `body`, or null. */
export function compareLine(x, body) {
  const S = itemStats(x); if (!S.def || !S.key || !body?.grid) return null;
  let best = null;
  for (const b of body.grid.blocks) {
    if (!b.alive || b.def.cat !== S.def.cat || (S.w && !!S.w.tool !== !!ALL_WEAPONS[b.def.weapon]?.tool)) continue;
    const o = itemStats(b.item || b.def.id); if (o.key?.[0] === S.key[0] && (!best || o.key[1] > best)) best = o.key[1];
  }
  if (best == null) return `<div class="it-cmp"><span class="up">New kind for your ship</span></div>`;
  const d = S.key[1] - best; const cls = d > 0.05 ? 'up' : d < -0.05 ? 'down' : '';
  return `<div class="it-cmp">${esc(S.key[0])} vs your best fitted: ${r1(best)} → <b class="${cls}">${r1(S.key[1])}</b> (${d >= 0 ? '+' : ''}${r1(d)})</div>`;
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
  const keys = opts.compact ? S.rows.filter(r => ['Damage', 'Damage per second', 'Range', 'Shield', 'Thrust', 'Power made', 'CPU given', 'Auto weapon slots', 'Crew room', 'Cargo', 'Drones', 'Size', 'CPU', 'Power use', 'Crew'].includes(r[0])) : S.rows;
  card.append(el('div', { html: rowsHTML(keys) }));
  if (opts.compact && keys.length < S.rows.length) {
    const more = el('details', { class: 'it-more' }, el('summary', {}, 'More numbers'));
    more.append(el('div', { html: rowsHTML(S.rows.filter(r => !keys.includes(r))) }));
    card.append(more);
  }
  card.append(el('div', { html: extrasHTML(S) }));
  if (opts.compare) { const c = compareLine(it, opts.compare); if (c) card.append(el('div', { html: c })); }
  if (opts.note) card.append(el('div', { class: 'hint' }, opts.note));
  if (opts.price != null || opts.actions?.length) {
    const foot = el('div', { class: 'row wrap it-foot' });
    if (opts.price != null) foot.append(el('span', { class: 'amber it-price' }, `${opts.priceLabel || 'Price'}: ${fmt(opts.price)} cr`));
    foot.append(el('div', { class: 'grow' }), ...(opts.actions || []));
    card.append(foot);
  }
  return card;
}
