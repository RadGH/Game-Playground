// Thousandvale — CASTER FORMS: how a wand, staff, sceptre or off-hand focus attacks (play-test 5: T14, T15, T16). Pure.
//
//   T15 "A variety of wands and staves with special magic attacks: cones, areas, projectiles, beams, forks, shields.
//        Off-hand focuses too."
//   T14 "Wands with a short-range cone start shooting from out of range and wait for the enemy to come closer."
//   T16 "Sceptres stay a special item: MELEE attacks that deal elemental damage."
//
// Farhold gives a wand one of six bolt behaviours and a staff one of its element's shaped spells. Thousandvale keeps
// those (with Farhold's numbers, read from Farhold) and adds its own from data/rules/caster-forms.json: a wand may be a
// cone, a beam, a ring, a lobbed blast, a forking bolt, a warding bolt or a bolt that leaves burning ground; a staff
// may be a lance or an aegis ring; an off-hand focus adds a rider to the main hand's attack. js/rules/cast.js carries
// each one out; THIS file decides which one an item is, how far it reaches, and writes its card from the same
// numbers the attack uses — so a card cannot promise what the code does not do.
//
// A parity engine has no `engine.casterForms`, and then nothing here is consulted: Farhold's own behaviour runs.

import {
  wandBehaviour, staffSpell, isStaff, isWand, elementOf, statusOf, hashStr, weaponHands, meleeSpanOf, chargedForm, formOf,
  OFFHAND_DAMAGE, strikeAt, attuneWeapon,
} from './farhold.js';
import { isOrb, isTome, stampHand } from './hands.js';
import { attackRate, weaponAps, apsText, movingPace } from './combat-cfg.js';

const FARHOLD_TO_STYLE = { plain: 'bolt', burst: 'burst', split: 'fan', chain: 'chain', seeking: 'seeking', heavy: 'heavy' };
/** fireBolt's own chain falloff when a plan names none (js/rules/cast-skills.js). */
const CHAIN_KEEP = 0.65;
const CHAIN_RANGE = 8;          // fireBolt: the next body is the nearest other enemy within 8 m (a Shocked one within 12 m first)
/** main.js: a wand's splash default, and the bolt's reach when the item names none. */
const WAND_SPLASH = 2.2, WAND_RANGE = 34;

const hash01 = text => (hashStr(String(text)) % 100000) / 100000;
const pct = v => `${Math.round(v * 100)}%`;
const m = v => `${+(+v).toFixed(1)} m`;
const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Validate + index caster-forms.json once (engine boot). Null when there is nothing usable. */
export function buildCasterForms(cfg) {
  if (!cfg || !cfg.styles || !Object.keys(cfg.styles).length) return null;
  const styles = {};
  for (const [key, st] of Object.entries(cfg.styles)) {
    const how = st.farhold ? wandBehaviour({ wandBehaviour: st.farhold }) : null;
    styles[key] = { key, ...st, how };
  }
  // owner feedback 10 (Y16): a tome's forms are their own list — a wand never rolls one, a tome never rolls a wand's
  const list = Object.values(styles).filter(s => !s.tome);
  const total = list.reduce((n, s) => n + (s.w ?? 1), 0);
  const tomeList = Object.values(styles).filter(s => s.tome);
  for (const s of tomeList) if (s.pace == null) s.pace = cfg.tomePace ?? 1.5;
  return {
    styles, list, total, tomeList, tomeTotal: tomeList.reduce((n, s) => n + (s.w ?? 1), 0),
    staffStyles: Object.fromEntries(Object.entries(cfg.staffStyles || {}).map(([k, v]) => [k, { key: k, ...v }])),
    staffStyleChance: cfg.staffStyleChance ?? 0,
    staffForms: cfg.staffForms || {},
    riders: Object.fromEntries(Object.entries(cfg.focusRiders || {}).map(([k, v]) => [k, { key: k, ...v }])),
    focusBases: cfg.focusBases || {},
    focusForms: cfg.focusForms || {},
    novaReach: cfg.novaReach ?? 0.85,
    rangeSlack: cfg.rangeSlack ?? 1.5,
    offhandBolt: cfg.offhandBolt ?? OFFHAND_DAMAGE,
    tomeDamage: cfg.tomeDamage ?? 1,
  };
}

const idOf = item => item.id || item.uid || item.baseKey || '';
/** Y16: the grip sentence per hand (a two-hander keeps Farhold's own). */
const HAND_NOTES = Object.freeze({
  main: 'It is a main-hand weapon: your off hand is free for an orb, a focus or a shield.',
  one: 'It can go in either hand, or one in each.',
  off: 'Off hand',
});

/**
 * A WAND's style row. An item that names one (`castStyle`) keeps it; an older wand that only carries Farhold's
 * `wandBehaviour` keeps that behaviour; a `fresh` one (a drop being made) is given one of all thirteen by its id.
 */
export function wandStyle(forms, item, { fresh = false } = {}) {
  if (!forms || !item) return null;
  // owner feedback 10 (Y16): a TOME takes one of the tome forms (by its id; an older tome that carried a wand's
  // behaviour, or none, is given one the first time it is asked — it keeps it from then on)
  if (isTome(item) && forms.tomeList?.length) {
    let st = item.castStyle && forms.styles[item.castStyle]?.tome ? forms.styles[item.castStyle] : null;
    if (!st) {
      let r = hash01(idOf(item) + ':tome') * forms.tomeTotal;
      for (const s of forms.tomeList) { r -= (s.w ?? 1); if (r <= 0) { st = s; break; } }
      st = st || forms.tomeList[forms.tomeList.length - 1];
    }
    item.castStyle = st.key; item.castForm = st.castForm; item.wandBehaviour = 'plain';
    return st;
  }
  if (item.castStyle && forms.styles[item.castStyle] && !forms.styles[item.castStyle].tome) {
    const known = forms.styles[item.castStyle];
    if (item.castForm !== known.castForm) { item.castForm = known.castForm; item.wandBehaviour = known.farhold || 'plain'; }
    return known;
  }
  let key = null;
  if (!fresh && item.wandBehaviour && FARHOLD_TO_STYLE[item.wandBehaviour]) key = FARHOLD_TO_STYLE[item.wandBehaviour];
  if (!key) {
    let r = hash01(idOf(item) + ':style') * forms.total;
    for (const s of forms.list) { r -= (s.w ?? 1); if (r <= 0) { key = s.key; break; } }
    key = key || forms.list[forms.list.length - 1].key;
  }
  const st = forms.styles[key];
  item.castStyle = key;
  item.castForm = st.castForm;
  item.wandBehaviour = st.farhold || 'plain';       // what Farhold's own readers (its weapon card) are told
  return st;
}

/** A STAFF's Thousandvale style (lance / aegis ring), or null = Farhold's element spell. */
export function staffStyle(forms, item, { fresh = false } = {}) {
  if (!forms || !item) return null;
  if (item.castStyle && forms.staffStyles[item.castStyle]) { item.castForm = forms.staffStyles[item.castStyle].castForm; return forms.staffStyles[item.castStyle]; }
  if (!fresh || item.castStyle) return null;
  const keys = Object.keys(forms.staffStyles);
  const r = hash01(idOf(item) + ':staffstyle');
  if (!keys.length || r >= forms.staffStyleChance) return null;
  const key = keys[Math.floor(r / forms.staffStyleChance * keys.length) % keys.length];
  item.castStyle = key;
  item.castForm = forms.staffStyles[key].castForm;
  return forms.staffStyles[key];
}

/** Is this off-hand item HELD (a focus: an orb, a tome, a relic) rather than swung or fired? */
export function isHeldFocus(off) {
  if (!off) return false;
  if (off.type !== 'weapon') return !off.isShield && off.baseKey !== 'quiver' && (off.slot === 'offhand' || off.subtype === 'offhand');
  return isOrb(off);        // owner feedback 10 (Y16): a tome is a main-hand weapon now, never a held focus
}

/** The rider an off-hand focus adds to a caster's main-hand attack, or null. */
export function riderOf(forms, off) {
  if (!forms || !isHeldFocus(off)) return null;
  const key = off.focusRider || forms.focusBases[off.baseKey] || (off.subtype === 'orb' ? 'burst' : null);
  return (key && forms.riders[key]) || null;
}

/** Does the main-hand weapon cast (so a focus rider applies)? */
export const isCaster = item => !!item && item.weaponCategory === 'magic' && !!item.castElement;
/** A sceptre: a caster that swings (T16). */
export const isSceptre = item => !!item && (item.subtype === 'scepter' || item.baseKey === 'scepter') && !item.ranged;

/**
 * Write what an item IS onto it, once, so the bag card, the gear look and the attack all agree: `castStyle`,
 * `castForm` (F's six words), `focusRider`, and `attackText` (the honest card sentence). Call after attuneWeapon
 * (the element must be known). `fresh` = a new drop (pick a style by its id); otherwise an old item keeps what it did.
 */
export function stampCaster(engine, item, { fresh = false } = {}) {
  const forms = engine?.casterForms;
  if (!forms || !item || typeof item !== 'object') return item;
  const statuses = engine.statuses || {};
  // owner feedback 10 (Y16): a TOME is an attacking caster weapon — ranged like a wand, its own slower, heavier form.
  // The shared table files it as something swung, so it is made ranged HERE (and Farhold's own words for it rewritten).
  if (isTome(item) && item.castElement && forms.tomeList?.length) {
    const st = wandStyle(forms, item, { fresh });
    if (!item.ranged || item.castRange !== st.range) { item.ranged = true; item.castRange = st.range; attuneWeapon(item); }
    // the shared table rolls a tome's damage as a stat stick's (2-6 against a wand's 4-10): raised once, marked on the item
    if (!item.tvTome && Array.isArray(item.dmg) && forms.tomeDamage !== 1) item.dmg = item.dmg.map(v => Math.max(1, Math.round(v * forms.tomeDamage)));
    item.tvTome = 1;
    delete item.focusRider; delete item.focusText;                // it was a held focus before; that line is an orb's
    item.attackText = wandText(st, item, statuses);
  } else if (isOrb(item)) {
    delete item.attackText;                                         // an implement has no attack of its own
    item.rangeClass = 'none'; item.weaponHeadline = 'Off-hand implement'; item.weaponLine = 'Held in the off hand — it has no attack of its own'; item.handNote = 'Off hand'; item.castLine = null;
  } else if (item.type === 'weapon' && (item.focusRider || item.focusText)) { delete item.focusRider; delete item.focusText; }
  if (item.type === 'weapon' && isWand(item) && item.ranged && !isTome(item)) {
    const st = wandStyle(forms, item, { fresh });
    item.attackText = wandText(st, item, statuses);
  } else if (item.type === 'weapon' && isStaff(item)) {
    const tv = staffStyle(forms, item, { fresh });
    const spell = tv || staffSpell(item, elementOf(item));
    if (!tv) item.castForm = forms.staffForms[spell.shape] || 'projectile';
    item.attackText = staffText(tv, spell, item, statuses, forms);
  } else if (item.type === 'weapon' && isSceptre(item) && item.castElement) {
    item.castForm = 'melee';
    item.attackText = sceptreText(item, statuses);
  }
  if (isHeldFocus(item)) {
    const r = riderOf(forms, item);
    if (r) { item.focusRider = r.key; item.castForm = forms.focusForms[r.key] || item.castForm || 'projectile'; item.focusText = riderText(r); }
  }
  // Y16: which hand it goes in ("Main hand" | "Off hand" | "One-hand" | "Two-hand"); Y26: a weapon's own attack rate
  stampHand(item);
  if (item.hand && item.type === 'weapon') {
    // Farhold's own words for the grip say "one-handed … it can go in either hand" for every one-hander: rewritten to the hand it really takes
    const note = HAND_NOTES[item.hand], was = item.handNote;
    item.gripWord = item.handText;
    if (item.hand !== 'two' && note) {
      if (was && typeof item.weaponLine === 'string' && item.weaponLine.includes(was)) item.weaponLine = item.weaponLine.replace(was, note);
      item.handNote = note;
      if (typeof item.weaponHeadline === 'string') item.weaponHeadline = item.weaponHeadline.replace('One-handed', item.handText);
      if (Array.isArray(item.weaponTags)) item.weaponTags = item.weaponTags.map(t => (t === 'One-handed' ? item.handText : t));
    }
    if (isOrb(item)) item.weaponTags = ['Off hand', ...(item.weaponTags || []).filter(t => t !== 'Melee' && t !== 'Ranged' && t !== 'Off hand' && t !== 'One-handed')];
  }
  if (item.type === 'weapon' && engine.combatCfg) {
    const aps = weaponAps(item, { style: isTome(item) ? forms.styles[item.castStyle] : null });
    if (aps) { item.aps = aps; item.apsText = apsText(aps); } else { delete item.aps; delete item.apsText; }
  }
  return item;
}

// ------------------------------------------------------------------------------------------------ card sentences

const leaves = (item, statuses) => { const id = statusOf(item); return id && statuses[id] ? ` Hits leave ${statuses[id].name}.` : ''; };

/** The card sentence of a wand's style, from the numbers js/rules/cast.js `resolveWand` uses. */
export function wandText(st, item, statuses = {}) {
  const el = elementOf(item);
  const how = st.how || {};
  const range = st.how ? (item.castRange ?? WAND_RANGE) * (how.slow ? 0.85 : 1) : st.range;
  const mult = st.mult ?? how.mult ?? 1;
  let s;
  switch (st.shape) {
    case 'cone': s = `Basic attack: a ${Math.round(st.arc * 180 / Math.PI)}° cone of ${el} ${m(st.range)} long in front of you for ${pct(mult)} weapon damage to everything in it.`; break;
    case 'beam': s = `Basic attack: an instant beam of ${el} ${m(st.range)} long and ${m(st.width)} wide that strikes everything along it for ${pct(mult)} weapon damage.`; break;
    case 'nova': s = `Basic attack: a ring of ${el} that strikes everything within ${m(st.radius)} of you for ${pct(mult)} weapon damage.`; break;
    case 'lob': s = `Basic attack: lobs ${el} up to ${m(st.range)} onto your target; it lands for ${pct(mult)} weapon damage to everything within ${m(st.radius)}.`; break;
    default: {
      const n = how.projectiles || 1;
      const splash = st.splash ?? how.splash ?? WAND_SPLASH;
      s = `Basic attack: throws ${(st.text || 'one {el} bolt').replace('{el}', el)} up to ${m(range)}${n > 1 ? ', each' : ','} bursting ${m(splash)} for ${pct(mult)} weapon damage.`;
      if (how.chains) s += ` It then jumps up to ${how.chains} more times, each time to the nearest other enemy within ${CHAIN_RANGE} m, at ${pct(CHAIN_KEEP)} of the hit before.`;
      if (st.split) s += ` On a hit it splits into ${st.split.shards} shards that strike other enemies within ${m(st.split.range)} for ${pct(st.split.keep)} of the bolt.`;
      if (st.ward) s += ` An attack that hits gives you a barrier of ${pct(st.ward.share)} of your maximum health (it builds up to ${pct(st.ward.cap)}) for ${st.ward.seconds}s.`;
      if (st.pool) s += ` Where it hits it leaves ${el} ground ${m(st.pool.radius * 2)} across for ${st.pool.seconds}s, striking every 0.75s for ${pct(st.pool.power)} weapon damage.`;
    }
  }
  if (st.tome && st.name) s = s.replace(/^Basic attack:/, `Basic attack (${st.name}):`);
  return s + leaves(item, statuses);
}

/** The card sentence of a staff: a Thousandvale style, or Farhold's element spell as cast.js resolves it. */
export function staffText(tv, spell, item, statuses = {}, forms = null) {
  const el = elementOf(item);
  const mult = spell.mult ?? 1;
  const leave = spell.status && statuses[spell.status] ? ` Hits leave ${statuses[spell.status].name}.` : '';
  let s;
  if (tv?.shape === 'beam') s = `Basic attack (${tv.name}): an instant lance of ${el} ${m(tv.range)} long and ${m(tv.width)} wide that strikes everything along it for ${pct(mult)} weapon damage.`;
  else if (tv?.shape === 'nova') s = `Basic attack (${tv.name}): a ring of ${el} that strikes everything within ${m(tv.radius)} of you for ${pct(mult)} weapon damage${tv.ward ? ` and gives you${tv.ward.allies ? ' and every ally inside it' : ''} a barrier of ${pct(tv.ward.share)} of maximum health (it builds up to ${pct(tv.ward.cap)}) for ${tv.ward.seconds}s` : ''}.`;
  else if (spell.shape === 'nova') s = `Basic attack (${spell.name}): strikes everything within ${m(spell.radius)} of you for ${pct(mult)} weapon damage.`;
  else if (spell.shape === 'cone') s = `Basic attack (${spell.name}): a ${Math.round((spell.arc || 0.9) * 180 / Math.PI)}° cone ${m(spell.range || 9)} long in front of you for ${pct(mult)} weapon damage to everything in it.`;
  else if (spell.shape === 'wave') s = `Basic attack (${spell.name}): a narrow wave ${m(spell.range || 9)} long straight ahead for ${pct(mult)} weapon damage to everything in it.`;
  else if (spell.shape === 'chain') s = `Basic attack (${spell.name}): a bolt up to ${m(spell.range || 12)} for ${pct(mult)} weapon damage${forms ? `; it then jumps up to ${spell.chains || 3} more times, each time to the nearest other enemy within ${CHAIN_RANGE} m, at ${pct(CHAIN_KEEP)} of the hit before` : ''}.`;
  else s = `Basic attack (${spell.name}): throws a blast up to ${m(spell.range || 12)} that strikes everything within ${m(spell.radius || spell.width || 3)} of where it lands for ${pct(mult)} weapon damage.`;
  const big = !tv ? chargedForm(spell) : null;
  s += leave;
  s += big?.note ? ` Costs no mana; hold the attack to charge it with mana: ${big.note}.` : ' Costs no mana; hold the attack to charge it with mana for a stronger cast.';
  return s;
}

export function sceptreText(item, statuses = {}) {
  const el = elementOf(item);
  const span = meleeSpanOf(item, 0);
  return `Basic attack: a melee swing${span?.reach ? ` reaching ${m(span.reach)}` : ''} that deals ${el} damage instead of physical.${leaves(item, statuses)} It never throws a bolt.`;
}

export function riderText(r) {
  switch (r.key) {
    case 'echo': return `Held with a wand, tome or sceptre: every ${nth(r.every)} basic attack repeats itself ${r.delay}s later at ${pct(r.mult)} of its damage.`;
    case 'burst': return `Held with a wand, tome or sceptre: a basic attack that hits also bursts ${m(r.radius)} around the first enemy struck for ${pct(r.mult)} weapon damage.`;
    case 'ward': return `Held with a wand, tome or sceptre: a basic attack that hits gives you a barrier of ${pct(r.share)} of your maximum health (it builds up to ${pct(r.cap)}) for ${r.seconds}s.`;
    case 'siphon': return `Held with a wand, tome or sceptre: a basic attack that hits restores ${r.mana} mana.`;
    default: return '';
  }
}
const nth = n => (n === 2 ? 'second' : n === 3 ? 'third' : n === 4 ? 'fourth' : `${n}th`);

// ------------------------------------------------------------------------------------------------ reach (T14)

/** How the main hand attacks right now: 'form' | 'staff' | 'bolt' | 'arrow' | 'melee' (cast.js `kind`, plus a druid shape). */
export function attackKind(ch) {
  const f = formOf(ch, 'shape');
  if (f?.spec?.basic) return 'form';
  const w = weaponHands(ch).main;
  return isStaff(w) ? 'staff' : (w?.castElement && w?.ranged) ? 'bolt' : w?.ranged ? 'arrow' : 'melee';
}

/**
 * How far the BASIC ATTACK reaches right now, in metres — null for a melee swing (the client's own melee reach
 * applies). This is what the client walks into before auto-attacking, and what the server refuses beyond.
 */
export function attackReach(engine, ch) {
  const forms = engine?.casterForms || null;
  const kind = attackKind(ch);
  if (kind === 'form') {
    const b = formOf(ch, 'shape').spec.basic;
    return b.shape === 'bolt' ? (b.range ?? 14) : null;
  }
  const w = weaponHands(ch).main;
  if (kind === 'arrow') return ch.derived?.swing?.main?.range ?? engine?.balance?.player?.arrowRange ?? 46;
  if (kind === 'bolt') {
    const st = forms ? wandStyle(forms, w) : null;
    if (!st || st.how) return (w.castRange ?? WAND_RANGE) * (wandBehaviour(w).slow ? 0.85 : 1);
    return st.shape === 'nova' ? st.radius * forms.novaReach : st.range;
  }
  if (kind === 'staff') {
    const tv = forms ? staffStyle(forms, w) : null;
    if (tv) return tv.shape === 'nova' ? tv.radius * forms.novaReach : tv.range;
    const spell = staffSpell(w, elementOf(w));
    if (spell.shape === 'nova') return (spell.radius || 5) * (forms?.novaReach ?? 0.85);
    if (spell.shape === 'cone' || spell.shape === 'wave') return spell.range || 9;
    return spell.range || 12;
  }
  return null;
}

/** The slot-0 card (rules.basic): what the basic attack is, how far it reaches, how often — from the same rows. */
export function basicCard(engine, ch) {
  const forms = engine?.casterForms || null;
  const statuses = engine?.statuses || {};
  const hands = weaponHands(ch);
  const w = hands.main;
  const kind = attackKind(ch);
  const base = engine?.balance?.player?.attackEvery ?? 0.62;
  const hasteK = (ch.derived?.attackEvery ?? base) / base;
  const plan = ch.derived?.swing?.main;
  let every = (strikeAt(w, 0)?.every ?? base) * hasteK;
  let form = kind, desc = '';
  const el = kind === 'form' ? (formOf(ch, 'shape').spec.basic.element || 'nature') : elementOf(w);
  if (kind === 'form') {
    const f = formOf(ch, 'shape'), b = f.spec.basic;
    form = `form:${f.id}`;
    desc = b.shape === 'bolt'
      ? `Basic attack in ${f.name} shape: a lobbed strike out to ${m(b.range ?? 14)} that splashes ${m(b.splash ?? 1.5)} for ${pct(b.mult ?? 0.7)} weapon damage.`
      : `Basic attack in ${f.name} shape: a strike ${m(b.reach ?? 2.6)} in front of you for ${pct(b.mult ?? 1)} weapon damage.`;
  } else if (kind === 'bolt') {
    const st = forms ? wandStyle(forms, w) : null;
    form = st?.key || wandBehaviour(w).key;
    desc = st ? wandText(st, w, statuses) : `Basic attack: throws a bolt of ${el} up to ${m((w.castRange ?? WAND_RANGE))}.`;
  } else if (kind === 'staff') {
    const tv = forms ? staffStyle(forms, w) : null;
    const spell = tv || staffSpell(w, el);
    form = tv?.key || spell.key;
    desc = staffText(tv, spell, w, statuses, forms);
    every = plan?.afterCast ?? 0.28;
  } else if (kind === 'arrow') {
    const range = plan?.range ?? engine?.balance?.player?.arrowRange ?? 46;
    form = plan?.hold === 'draw' ? 'draw' : 'shot';
    every = plan?.hold === 'draw' ? (plan.draw?.full ?? 0.95) + (plan.afterShot ?? 0.12) : every;
    desc = `Basic attack: ${plan?.hold === 'draw' ? 'draws and looses an arrow' : 'looses a shot'} up to ${m(range)}; it strikes everything within ${m(engine?.balance?.player?.arrowSplash ?? 2.6)} of where it lands.`;
  } else {
    const span = meleeSpanOf(w, ch.derived?.areaPct || 0);
    form = isSceptre(w) && w.castElement ? 'sceptre' : 'swing';
    desc = form === 'sceptre' ? sceptreText(w, statuses)
      : `Basic attack: a melee swing${span?.reach ? ` reaching ${m(span.reach)}` : ''}${el !== 'physical' ? ` that deals ${el} damage` : ''}.`;
    if (hands.dual && !isHeldFocus(hands.off)) desc += ` Your off hand (${hands.off.name}) swings on its own clock for ${pct(OFFHAND_DAMAGE)} of its damage.`;
  }
  const rider = isCaster(w) ? riderOf(forms, hands.off) : null;
  if (rider) desc += ` ${cap(hands.off.name)}: ${riderText(rider).replace(/^Held with a wand, tome or sceptre: /, '')}`;
  const reach = attackReach(engine, ch);
  // owner feedback 10: Y26 — the real rate (the weapon's pattern, a tome's pace, attack speed inside its cap: the same
  // function js/rules/cast.js paces the attack with); Y7 — what moving does to it (nothing, unless the knob says so)
  const rate = engine?.combatCfg && kind !== 'form' ? attackRate(engine, ch, 'main', { styleOf: it => (forms && it?.ranged && it?.castElement && !isStaff(it) ? wandStyle(forms, it) : null) }) : null;
  if (rate) every = rate.every;
  const pace = movingPace(engine, kind);
  return {
    slot: 0, id: 'basic', name: w?.name || 'Unarmed', desc, kind, form,
    aps: Math.round(100 / every) / 100,
    moving: { ok: true, pace },
    reach: reach != null ? Math.round(reach * 10) / 10 : null,
    every: Math.round(every * 1000), el, wt: w?.subtype || w?.baseKey || 'fist',
    two: w?.twoHanded ? 1 : undefined,
    hands: hands.dual && !isHeldFocus(hands.off) ? 2 : 1,
    rider: rider?.key,
  };
}
