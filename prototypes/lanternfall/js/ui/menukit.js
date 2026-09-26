// Shared pieces for the DOM menu layer (docs/02 §25-§27): element builder, buttons, tabs, modal confirm with
// hold-to-confirm, toasts (mirrored to an aria-live region), stat labels + explanations, item/strand/status text,
// and a small item registry the tooltip renderers read (02 §26.1: one attribute name per kind of subject).
import { fmt, hp, pct, sign, range, secs } from '../../../../shared/format.js';
import { tooltipLines } from '../rpg/items.js';
export { fmt, hp, pct, sign, range, secs };

export const FLAMES = ['ember', 'rime', 'spark', 'bile', 'gleam', 'tide', 'shade'];
export const ATTRS = ['might', 'wick', 'draught', 'nerve', 'knack'];
export const ATTR_NAMES = { might: 'Might', wick: 'Wick', draught: 'Draught', nerve: 'Nerve', knack: 'Knack' };
export const RARITY = { common: { name: 'Common', color: '#9aa3ad' }, fine: { name: 'Fine', color: '#8fc7ff' }, rare: { name: 'Rare', color: '#ffb347' }, relic: { name: 'Relic', color: '#c58cff' } };
export const SLOT_NAMES = { weapon: 'Weapon', lantern: 'Lantern', coat: 'Coat', boots: 'Boots', trinket: 'Trinket' };
export const FLAME_MARK = { ember: '▲', rime: '✳', spark: 'ϟ', bile: '⠿', gleam: '◯', tide: '≈', shade: '▨' };

/** el('div', { class, text, html, on*, data-*, style }, ...children) */
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'html') n.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
  return n;
}
/** A real <button>. disabled may be a reason string: the button is disabled and the reason is its tooltip. */
export function btn(label, onClick, { cls = '', disabled = null, tip = null, key = null, ...rest } = {}) {
  const b = el('button', { type: 'button', class: 'lf-btn ' + cls, ...rest }, label, key ? el('kbd', { text: key }) : null);
  if (onClick) b.addEventListener('click', e => { if (b.getAttribute('aria-disabled') === 'true') return; onClick(e); });
  if (disabled) { b.setAttribute('aria-disabled', 'true'); b.classList.add('off'); if (typeof disabled === 'string') b.dataset.tip = disabled; }
  else if (tip) b.dataset.tip = tip;
  return b;
}
export function panel(title, ...kids) { return el('section', { class: 'lf-panel' }, title ? el('h3', { class: 'lf-h', text: title }) : null, ...kids); }
/** Horizontal tab strip. tabs: [{ id, label, badge?, off? }]. Returns the strip; strip.select(id). */
export function tabStrip(tabs, current, onPick, { cls = '', sub = false } = {}) {
  const strip = el('div', { class: `lf-tabs ${sub ? 'sub' : ''} ${cls}`, role: 'tablist' });
  for (const t of tabs) {
    const b = el('button', { type: 'button', role: 'tab', class: 'lf-tab' + (t.id === current ? ' on' : '') + (t.off ? ' off' : ''), 'aria-selected': String(t.id === current), dataset: { tab: t.id } }, t.label, t.badge ? el('i', { class: 'dot', 'aria-label': 'new' }) : null);
    if (t.tip) b.dataset.tip = t.tip;
    b.addEventListener('click', () => { if (!t.off) onPick(t.id); });
    strip.append(b);
  }
  return strip;
}
/** Cycle a tab list by delta (Q/E, [/]). */
export function cycle(list, cur, d) { const i = Math.max(0, list.indexOf(cur)); return list[(i + d + list.length) % list.length]; }

/** Clock text: 3m 12s, 2h 05m (02 §26.2). */
export function clock(s) {
  s = Math.max(0, Math.round(s || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`;
}

// ---------- toasts + aria-live ----------
let toastHost = null, live = null;
export function toast(msg, kind = '') {
  if (!toastHost) { toastHost = el('div', { class: 'lf-toasts' }); document.body.append(toastHost); }
  const t = el('div', { class: 'lf-toast ' + kind, text: msg }); toastHost.append(t); announce(msg);
  setTimeout(() => t.classList.add('out'), 2200); setTimeout(() => t.remove(), 2600);
}
export function announce(msg) {
  if (!live) { live = el('div', { class: 'sr-only', 'aria-live': 'polite' }); document.body.append(live); }
  live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 20);
}

// ---------- modal confirm (no timers; hold-to-confirm is a hold, 02 §27.1) ----------
/**
 * confirmBox(host, { title, text, yes, no, hold, input: {label, match} }) -> Promise<boolean>
 * hold: true = the yes button must be held 1.0 s (mouse, Enter or Space). input.match = text the player must type.
 */
export function confirmBox(host, { title = 'Are you sure?', text = '', yes = 'Yes', no = 'Cancel', hold = false, input = null, extra = null } = {}) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const done = v => { box.remove(); prev?.focus?.(); resolve(v); };
    const field = input ? el('input', { class: 'lf-input', type: 'text', 'aria-label': input.label, placeholder: input.label }) : null;
    const okBtn = btn(yes, hold ? null : () => ok(), { cls: 'primary' + (hold ? ' hold' : '') });
    const ok = () => { if (field && field.value.trim() !== input.match) { field.classList.add('bad'); toast(`Type ${input.match} to confirm.`, 'bad'); return; } done(true); };
    if (hold) {
      let t0 = 0, raf = 0; const bar = el('i', { class: 'holdbar' }); okBtn.append(bar);
      const stop = () => { cancelAnimationFrame(raf); t0 = 0; bar.style.width = '0'; };
      const tick = () => { const f = Math.min(1, (performance.now() - t0) / 1000); bar.style.width = (f * 100) + '%'; if (f >= 1) { stop(); ok(); } else raf = requestAnimationFrame(tick); };
      const start = () => { if (!t0) { t0 = performance.now(); raf = requestAnimationFrame(tick); } };
      okBtn.addEventListener('pointerdown', start); okBtn.addEventListener('pointerup', stop); okBtn.addEventListener('pointerleave', stop);
      okBtn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } });
      okBtn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') stop(); });
    }
    const noBtn = btn(no, () => done(false), { cls: 'cancel' });
    const box = el('div', { class: 'lf-modal', role: 'alertdialog', 'aria-label': title },
      el('div', { class: 'lf-modal-card' }, el('h3', { class: 'lf-h', text: title }), text ? el('p', { text }) : null, extra, field,
        el('div', { class: 'row end' }, noBtn, okBtn), hold ? el('p', { class: 'dim small', text: 'Hold to confirm.' }) : null));
    box._cancel = () => done(false);
    host.append(box); (field || okBtn).focus();
  });
}

// ---------- item registry for tooltips ----------
const items = new Map();
export function registerItem(it) { if (it?.uid != null) items.set(String(it.uid), it); return it; }
export function lookupItem(uid, hero) {
  const k = String(uid);
  if (hero) { for (const it of hero.satchel || []) if (it && String(it.uid) === k) return it; for (const it of Object.values(hero.equipped || {})) if (it && String(it.uid) === k) return it; }
  return items.get(k) || null;
}

// ---------- stats: labels, units, explanations ----------
/** unit: 'pct' (fraction), 'num', 'rate' (/s), 'cells', 'x' */
export const STAT_INFO = {
  health: ['Health', 'num'], healthPct: ['Health', 'pct'], oil: ['Max oil', 'num'], armour: ['Armour', 'num'], wickPct: ['Wick power', 'pct'], spellPct: ['Spell power', 'pct'],
  critChance: ['Crit chance', 'pct'], critMult: ['Crit damage', 'pct'], meleePct: ['Pole damage', 'pct'], oilRegenPct: ['Oil regen', 'pct'], castSpeed: ['Cast speed', 'pct'],
  lightRadius: ['Light radius', 'cells'], lightRadiusPct: ['Light radius', 'pct'], lootFind: ['Loot find', 'pct'], lifeSteal: ['Life steal', 'pct'], moveSpeed: ['Move speed', 'pct'], resistAll: ['All resists', 'num'],
  darkBurn: ['Dark burn', 'pct'], jump: ['Jump', 'cells'], swim: ['Swim speed', 'pct'], breath: ['Breath', 's'],
};
for (const f of FLAMES) { STAT_INFO['resist_' + f] = [cap(f) + ' resist', 'num']; STAT_INFO['flame_' + f] = [cap(f) + ' damage', 'pct']; }
export function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }
export function statLabel(k) { return STAT_INFO[k]?.[0] || cap(k.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').toLowerCase()); }
export function statValue(k, v, signed = true) {
  const u = STAT_INFO[k]?.[1] || (/Pct$|Chance$/.test(k) ? 'pct' : 'num');
  if (u === 'pct') return signed ? sign(v * 100, { decimals: 1 }) + '%' : pct(v, 1);
  if (u === 's') return (signed ? sign(v) : fmt(v)) + 's';
  return signed ? sign(v) : fmt(v);
}
/** Sum an item's stat lines (implicit + affixes). */
export function itemStats(it) {
  const s = {}; if (!it) return s;
  for (const [k, v] of Object.entries(it.implicit || {})) s[k] = (s[k] || 0) + v;
  for (const a of it.affixes || []) if (a.stat) s[a.stat] = (s[a.stat] || 0) + (a.value || 0);
  return s;
}

/** Derived stats the Attributes screen lists (02 §16.2), with how each is shown. */
export const DERIVED = [
  ['maxHp', 'Health', v => hp(v)], ['maxOil', 'Oil', v => hp(v)], ['oilRegen', 'Oil regen', v => fmt(v) + '/s'], ['armour', 'Armour', v => hp(v)],
  ['critChance', 'Crit', v => pct(v, 1)], ['critMult', 'Crit damage', v => pct(v)], ['meleeMult', 'Pole damage', v => pct(v)], ['spellPower', 'Spell power', v => sign(v * 100, { decimals: 1 }) + '%'],
  ['statusPotency', 'Status potency', v => pct(v)], ['lightRadius', 'Light radius', v => hp(v) + ' cells'], ['darkBurn', 'Dark burn', v => fmt(v) + '×'], ['lootFind', 'Loot find', v => pct(v, 1)],
  ['poise', 'Poise', v => hp(v)], ['buildSpeed', 'Build speed', v => fmt(v) + '×'], ['walk', 'Walk', v => hp(v) + ' cells/s'], ['run', 'Run', v => hp(v) + ' cells/s'],
];
/** "Oil regen 4.5/s = 3 base + Draught 15 × 0.1" — every derived stat explains its sources (02 §16.2). */
export function explainStat(id, hero, stats, data) {
  const cls = data?.classes?.byId?.[hero.class] || {}, a = hero.attrs || {}, L = hero.level || 1;
  const eq = {}; for (const it of Object.values(hero.equipped || {})) for (const [k, v] of Object.entries(itemStats(it))) eq[k] = (eq[k] || 0) + v;
  const g = k => eq[k] ? ` + gear ${statValue(k, eq[k])}` : '';
  switch (id) {
    case 'maxHp': return `Health ${hp(stats.maxHp)} = (60 base + Nerve ${a.nerve} × 8 + ${L - 1} levels × 6) × class ${fmt(cls.hpMult ?? 1)}${g('health')}${hero.maxHpDebt ? ` − ${hp(hero.maxHpDebt)} owed to the Ferry` : ''}`;
    case 'maxOil': return `Oil ${hp(stats.maxOil)} = (75 base + Draught ${a.draught} × 5 + ${L - 1} levels × 4) × class ${fmt(cls.oilMult ?? 1)}${g('oil')}`;
    case 'oilRegen': return `Oil regen ${fmt(stats.oilRegen)}/s = 3 base + Draught ${a.draught} × 0.1${g('oilRegenPct')}. Never above 0 in the dark.`;
    case 'armour': return `Armour ${hp(stats.armour)} = class ${cls.armour || 0}${g('armour')}. Each point cuts hits by 100 / (100 + armour); Shade ignores armour.`;
    case 'critChance': return `Crit ${pct(stats.critChance, 1)} = 5% base + Knack ${a.knack} × 0.3%${g('critChance')}`;
    case 'critMult': return `Crit damage ${pct(stats.critMult)} = 150% + Might ${a.might} × 1%${g('critMult')}`;
    case 'meleeMult': return `Pole damage ${pct(stats.meleeMult)} = 100% + Might ${a.might} × 2%${g('meleePct')}`;
    case 'spellPower': return `Spell power ${sign(stats.spellPower * 100, { decimals: 1 })}% = Wick ${a.wick} × 2%${g('wickPct')}`;
    case 'statusPotency': return `Status potency ${pct(stats.statusPotency)} = 100% + Wick ${a.wick} × 1%`;
    case 'lightRadius': return `Light radius ${hp(stats.lightRadius)} cells = 64 base${g('lightRadiusPct')}${g('lightRadius')}`;
    case 'darkBurn': return `Dark burn ${fmt(stats.darkBurn)}× = 1 − Draught ${a.draught} × 1% (never below 0.7): how fast the lantern drinks oil in darkness`;
    case 'lootFind': return `Loot find ${pct(stats.lootFind, 1)} = Knack ${a.knack} × 1%${g('lootFind')}`;
    case 'poise': return `Poise ${hp(stats.poise)} = 30 + Nerve ${a.nerve} × 2: how much a hit must deal to stagger you`;
    case 'buildSpeed': return `Build speed ${fmt(stats.buildSpeed)}× = 1 + Knack ${a.knack} × 1%${cls.movement?.buildMult ? ` × class ${fmt(cls.movement.buildMult)}` : ''}`;
    case 'walk': case 'run': return `${cap(id)} ${hp(stats[id])} cells/s = class ${cls[id]}${g('moveSpeed')} (movement numbers are 07's)`;
    default: return statLabel(id);
  }
}

// ---------- item card (02 §14.3; compare §14.4) ----------
/**
 * The item card every screen shows (02 §14.3): items.js tooltipLines when the item data is loaded (one wording for
 * every screen), else a plain card from the item's own fields. opts: { label, hero, compareTo, sell, deltas }.
 */
export function itemCard(it, data, opts = {}) {
  if (!data?.items?.byId) return itemCardNode(it, opts);
  let lines; try { lines = tooltipLines(it, data, { hero: opts.hero, compareTo: opts.compareTo, sell: opts.sell }); } catch (e) { return itemCardNode(it, opts); }
  const r = RARITY[it.rarity];
  return el('div', { class: 'lf-card item', style: { borderColor: r?.color || '#3a4454' } }, opts.label ? el('div', { class: 'card-label', text: opts.label }) : null,
    lines.map(l => el('div', { class: l.kind === 'name' ? 'card-name' : l.kind === 'sub' ? 'card-sub' : l.kind === 'compare' ? 'card-line cmp' : 'card-line', style: { color: l.color }, text: l.text })),
    it.flavour ? el('div', { class: 'card-flavour', text: it.flavour }) : null);
}
/** A plain card node for an item; deltas = { stat: difference vs worn } marks each line. */
export function itemCardNode(it, { label = null, deltas = null, price = null, data = null } = {}) {
  const r = RARITY[it.rarity] || RARITY.common;
  const lines = [];
  for (const [k, v] of Object.entries(it.implicit || {})) lines.push([k, v, true]);
  for (const a of it.affixes || []) lines.push([a.stat, a.value, false, a.text]);
  const card = el('div', { class: 'lf-card item', style: { borderColor: r.color } },
    label ? el('div', { class: 'card-label', text: label }) : null,
    el('div', { class: 'card-name', style: { color: r.color }, text: it.name || it.base || 'Item' }),
    el('div', { class: 'card-sub', text: [r.name, it.slot ? SLOT_NAMES[it.slot] : cap(it.type || 'item'), it.ilvl ? `item level ${it.ilvl}` : null].filter(Boolean).join(' · ') }),
    it.qty > 1 ? el('div', { class: 'card-sub', text: `Stack ${hp(it.qty)}` }) : null,
    lines.length ? el('ul', { class: 'card-stats' }, lines.map(([k, v, imp, text]) => {
      const d = deltas?.[k];
      return el('li', { class: imp ? 'imp' : '' }, text || `${statValue(k, v)} ${statLabel(k)}`,
        d == null ? null : el('span', { class: 'delta ' + (d > 0 ? 'good' : d < 0 ? 'bad' : 'same'), text: d === 0 ? ' =' : ' ' + statValue(k, d) }));
    })) : null,
    it.flame ? el('div', { class: 'card-line', text: `Flame affinity: ${cap(it.flame)} ${FLAME_MARK[it.flame] || ''}` }) : null,
    it.offClass ? el('div', { class: 'card-line bad', text: '−20% damage (not your family)' }) : null,
    it.quirk || it.relic ? el('div', { class: 'card-line gold', text: it.quirk || it.relic }) : null,
    it.desc ? el('div', { class: 'card-line', text: it.desc }) : null,
    it.junk ? el('div', { class: 'card-line dim', text: 'Marked as junk' }) : null,
    (price ?? it.price) != null ? el('div', { class: 'card-line dim', text: `Sells for ${hp(price ?? it.price)} pennies` }) : null,
    it.flavour ? el('div', { class: 'card-flavour', text: it.flavour }) : null);
  return card;
}

/** One line describing a status (03 §4 numbers read from statuses.json). */
export function statusText(s) {
  if (!s) return '';
  const bits = [];
  if (s.perStackPct) bits.push(`${pct(s.perStackPct)} of the hit per stack every ${secs(s.tick)}`);
  if (s.maxStacks) bits.push(`up to ${s.maxStacks} stacks`);
  if (s.unlitMult) bits.push(`the Unlit take ×${fmt(s.unlitMult)}`);
  if (s.duration) bits.push(`lasts ${secs(s.duration)}`);
  return bits.join(' · ');
}
/** Short per-flame terrain notes for the builder's Effects line (03 §12 rows, compressed). */
export const FLAME_TERRAIN = {
  ember: ['ignites oil, wood and wax', 'boils water to steam', 'melts ice'], rime: ['freezes water', 'puts out fire', 'chills'],
  spark: ['electrifies water and metal', 'chains between targets', 'powers machines'], bile: ['corrodes armour', 'dissolves metal, brick and bone'],
  gleam: ['sears the Unlit', 'heals allies', 'lights dark places'], tide: ['soaks and shoves', 'makes water', 'pushes liquids'],
  shade: ['drains life and oil', 'ignores armour', 'eats light'],
};
