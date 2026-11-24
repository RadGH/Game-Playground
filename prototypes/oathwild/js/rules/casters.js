// Oathwild — MAGIC WEAPONS: what a wand, tome, staff, sceptre or off-hand focus does when you attack. Pure.
//
// Owner 2026-11-24: "Did you keep the itemization from Thousandvale? Especially wands and tomes having special attacks
// or other effects. I'd like to see those elements in this new game too."
//
// WHICH style an item has is Thousandvale's call (caster-forms.js + its caster-forms.json, borrowed through
// js/rules/farhold.js): a wand is one of 13 styles (bolt, burst, fan, chain, seeking, heavy, cone, beam, ring, lob,
// fork, ward, pool), a tome one of 4 (Rune, Column, Gale, Brand), a staff one of Thousandvale's two (Lance, Aegis Ring)
// or Farhold's element spell (cone / nova / wave / lob / chain / ground), a sceptre swings in melee with its element,
// and an off-hand focus adds a rider (Echo, Burst, Ward, Siphon). Thousandvale's own attack code (cast.js) is built
// on its room and field, so Oathwild turns the style into its OWN plan here, fought by js/rules/caster-attack.js with
// Oathwild's world-sim shapes, and the card is written from the SAME plan — a card cannot promise what the code does
// not do (lessons-from-games). Oathwild's knobs on top are in data/casters.json.
//
//   finishCaster(rules, item, { fresh, starter })  attune + style + rider onto a magic item (idempotent)
//   casterKind(item)            'wand' | 'tome' | 'staff' | 'sceptre' | 'orb' | 'focus' | 'pole' | null
//   attackPlan(rules, gear, sheet)   → the main hand's caster attack plan, or null (not a magic weapon)
//   riderFor(rules, gear)       → the off hand's rider row, or null
//   attackCard(rules, plan, powerRange, { sheet })  → { rows, lines, how, status } with real numbers
//   riderLine(rules, rider, powerRange, plan)       → the rider's sentence
//   makeNamed(rules, id, { rng, ilvl, level })      → a named caster ("Wand of the Ninth Star")
//   namedDrop(rules, tableId, rng, level)           → a named caster for a boss table roll, or null

import {
  attuneWeapon, statusOf, staffSpell, buildCasterForms, wandStyle, staffStyle, riderOf, isHeldFocus, isTome,
  hashStr, swingTiming, strikeAt, fmt, fmtRange, fmtPctOf, fmtHp,
} from './farhold.js';

const ELEMENT_NAME = { physical: 'Physical', fire: 'Fire', ice: 'Frost', lightning: 'Lightning', arcane: 'Arcane', shadow: 'Shadow', holy: 'Holy', nature: 'Nature', poison: 'Poison' };
/** Player-facing names of the wand styles (Thousandvale names only the tome and staff ones). */
export const STYLE_NAME = Object.freeze({
  bolt: 'True Bolt', burst: 'Bursting Bolt', fan: 'Fan of Three', chain: 'Chain Bolt', seeking: 'Seeking Bolt', heavy: 'Heavy Bolt',
  cone: 'Cone', beam: 'Beam', nova: 'Ring', lob: 'Lobbed Blast', fork: 'Forking Bolt', ward: 'Warding Bolt', pool: 'Lingering Bolt',
});
const NTH = n => (n === 2 ? 'second' : n === 3 ? 'third' : n === 4 ? 'fourth' : `${n}th`);
const hash01 = s => (hashStr(String(s)) % 100000) / 100000;
const m = v => `${fmt(Math.round(v * 10) / 10, { decimals: 1 })} m`;
const pct = v => fmtPctOf(Math.round(v * 1000) / 10);
const range2 = ([a, b]) => (Math.round(a) === Math.round(b) ? fmt(Math.round(a)) : fmtRange(Math.round(a), Math.round(b)));
const scaleR = (r, k) => [r[0] * k, r[1] * k];
const deg = rad => Math.round(rad * 180 / Math.PI);
/** Seconds to two places (a pool strikes every 0.75s — one place would say 0.8s and be wrong). */
const sec = v => `${fmt(v, { decimals: 2 })}s`;
const an = w => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

/** Thousandvale's forms (indexed once per rules) + Oathwild's knobs. */
export function casterForms(rules) {
  if (!rules._casters) rules._casters = { forms: buildCasterForms(rules.data.casterForms), cfg: rules.data.casters };
  return rules._casters;
}

const subOf = it => it?.subtype || it?.baseKey || '';
/** What kind of magic item this is (null for anything that is not one). */
export function casterKind(item) {
  if (!item || typeof item !== 'object') return null;
  if (item.type === 'weapon') {
    if (item.baseKey === 'quarterstaff') return item.weaponCategory === 'magic' ? 'pole' : null;
    if (item.weaponCategory !== 'magic') return null;
    const sub = subOf(item);
    if (sub === 'wand') return 'wand';
    if (sub === 'tome') return 'tome';
    if (sub === 'staff') return 'staff';
    if (sub === 'scepter') return 'sceptre';
    if (sub === 'orb') return 'orb';
    return item.twoHanded ? 'staff' : 'wand';
  }
  if (item.isMagicShield || (isHeldFocus(item) && item.slot === 'offhand')) return 'focus';
  return null;
}

/**
 * Write what a magic item IS onto it, once: its element (Farhold's attuneWeapon: "Flame Wand"), its style
 * (`castStyle`, or a staff's `staffSpell`), an orb's or focus's `focusRider`. Same item id = same result, so an old
 * saved item that never had one gets the same answer every time it is asked. `starter` = a new hero's kit (a known,
 * readable style from casters.json `starter`).
 */
export function finishCaster(rules, item, { fresh = true, starter = false } = {}) {
  const kind = casterKind(item);
  if (!kind || kind === 'pole') return item;
  const { forms, cfg } = casterForms(rules);
  if (kind !== 'focus' && !item.castElement) {
    attuneWeapon(item);
    // Oathwild's sheet treats a magic weapon as a caster, never as a bow: Farhold's attune marks a wand `ranged`
    // (its own client's reach rules), which would make Oathwild's sheet halve its melee and grow a bow row
    item.ranged = false;
  }
  if (starter && cfg.starter?.[kind] && !item.castStyle) item.castStyle = cfg.starter[kind];
  if (kind === 'wand' || kind === 'tome') wandStyle(forms, item, { fresh });
  else if (kind === 'staff') {
    // a staff that names its element spell (a named staff) never rolls one of Thousandvale's two styles over it
    if (!staffStyle(forms, item, { fresh: fresh && !item.staffSpell })) staffSpell(item, item.castElement || 'arcane');
  }
  else if (kind === 'orb' && !item.focusRider) {
    const roll = cfg.focusRoll?.orb || { burst: 1 };
    const total = Object.values(roll).reduce((s, w) => s + w, 0);
    let r = hash01(`${item.id || item.baseKey}:rider`) * total;
    for (const [k, w] of Object.entries(roll)) { r -= w; if (r <= 0) { item.focusRider = k; break; } }
    item.focusRider = item.focusRider || Object.keys(roll)[0];
  } else if (kind === 'focus' && !item.focusRider) {
    const r = riderOf(forms, item);
    if (r) item.focusRider = r.key;
  }
  return item;
}

/** The rider the off hand adds to a main-hand wand, tome or sceptre (Echo, Burst, Ward, Siphon), or null. */
export function riderFor(rules, gear) {
  const main = gear?.weapon, off = gear?.offhand;
  const mk = casterKind(main);
  if (!off || !(mk === 'wand' || mk === 'tome' || mk === 'sceptre')) return null;
  const { forms, cfg } = casterForms(rules);
  let key = null;
  if (off.type === 'weapon' && isTome(off)) key = cfg.offhandTome;
  else if (casterKind(off) === 'orb' || casterKind(off) === 'focus') { finishCaster(rules, off); key = off.focusRider || riderOf(forms, off)?.key || null; }
  const row = key && forms.riders[key];
  return row ? { ...row, key, item: off.name } : null;
}

/** Statuses Oathwild can carry (a Farhold status the item names that Oathwild lacks is left off the plan AND the card). */
const statusIf = (rules, id) => (id && rules.statuses[id] ? id : null);

/**
 * The plan of the main hand's caster attack: everything js/rules/caster-attack.js needs to fight it and
 * attackCard needs to say it. `sheet` (optional) adds the school bonus and the attack clock.
 */
export function attackPlan(rules, gear, sheet = null) {
  const w = gear?.weapon;
  const kind = casterKind(w);
  if (!kind) return null;
  const { forms, cfg } = casterForms(rules);
  const C = rules.data.combat;
  const share = C.magicWeapon.mult;
  const boltSpeed = C.projectile.bolt;
  if (kind !== 'pole') finishCaster(rules, w);
  const element = kind === 'pole' ? C.magicWeapon.element : (w.castElement || C.magicWeapon.element);
  const school = 1 + (sheet?.school?.[element] || 0) / 100;
  const baseEvery = Math.max(0.45, swingTiming(w, 0, 1).every * 1.6);
  const p = {
    kind, key: 'bolt', name: STYLE_NAME.bolt, shape: 'bolt', element, status: kind === 'pole' ? null : statusIf(rules, statusOf(w)),
    share, styleMult: 1, school, range: C.magicWeapon.range, speed: boltSpeed, projectiles: 1, spread: 0, splash: 0,
    every: baseEvery, pace: 1, look: 'bolt',
  };
  if (kind === 'pole' || kind === 'orb') {
    // a quarterstaff is Farhold's pole (it keeps Oathwild's old plain arcane bolt); an orb held in the main hand from
    // an old save does the same until it is moved (an orb is an off-hand implement now)
    p.name = kind === 'orb' ? 'Plain bolt (an orb belongs in the off hand)' : 'Plain bolt';
  } else if (kind === 'wand' || kind === 'tome') {
    const st = wandStyle(forms, w);
    const how = st.how || {};
    Object.assign(p, {
      key: st.key, look: st.key, name: st.name || STYLE_NAME[st.key] || st.key, shape: st.shape,
      styleMult: st.mult ?? how.mult ?? 1, range: st.range ?? p.range, pace: st.tome ? (st.pace ?? forms.tomeList?.[0]?.pace ?? 1.5) : 1,
    });
    if (st.shape === 'bolt') {
      p.projectiles = how.projectiles || 1;
      p.spread = how.spread || 0;
      p.splash = st.splash ?? how.splash ?? 2.2;
      if (how.slow) p.speed = Math.round(boltSpeed * how.slow * 10) / 10;
      if (how.chains) p.chains = { n: how.chains, range: cfg.chain.range, keep: cfg.chain.keep };
      if (how.homing) p.homing = { ...cfg.homing };
      if (st.split) p.split = { ...st.split };
      if (st.ward) p.ward = { ...st.ward };
      if (st.pool) p.pool = { ...st.pool, every: 0.75 };
    } else if (st.shape === 'cone') { p.reach = st.range; p.arc = st.arc; }
    else if (st.shape === 'beam') { p.width = st.width; }
    else if (st.shape === 'nova') { p.radius = st.radius; p.range = st.radius; }
    else if (st.shape === 'lob') { p.radius = st.radius; p.speed = st.speed || cfg.lobSpeed; }
  } else if (kind === 'staff') {
    const tv = staffStyle(forms, w);
    if (tv) {
      Object.assign(p, { key: `staff:${tv.key}`, look: `staff:${tv.key}`, name: tv.name, shape: tv.shape, styleMult: tv.mult ?? 1 });
      if (tv.shape === 'beam') { p.range = tv.range; p.width = tv.width; }
      if (tv.shape === 'nova') { p.radius = tv.radius; p.range = tv.radius; if (tv.ward) p.ward = { ...tv.ward }; }
    } else {
      const sp = staffSpell(w, element);
      const shape = sp.shape === 'wave' ? 'beam' : sp.shape === 'chain' ? 'bolt' : sp.shape;
      Object.assign(p, { key: `staff:${sp.shape}`, look: `staff:${sp.shape}`, name: sp.name, shape, styleMult: sp.mult ?? 1 });
      p.status = statusIf(rules, sp.status) || null;
      if (shape === 'cone') { p.reach = sp.range || 9; p.arc = sp.arc || 0.9; p.range = p.reach; }
      else if (shape === 'nova') { p.radius = sp.radius || 5; p.range = p.radius; }
      else if (shape === 'beam') { p.range = sp.range || 12; p.width = sp.width || 2.4; }
      else if (shape === 'lob') { p.range = sp.range || 14; p.radius = sp.radius || 3; p.speed = cfg.lobSpeed; }
      else if (shape === 'bolt') { p.range = sp.range || cfg.staffChainRange; p.chains = { n: sp.chains || 3, range: cfg.chain.range, keep: cfg.chain.keep }; }
      else if (shape === 'ground') { p.range = cfg.staffGround.range; p.radius = sp.radius || 4.5; p.ground = { seconds: cfg.staffGround.seconds, every: cfg.staffGround.every }; }
    }
    p.every = Math.max(0.45, swingTiming(w, 0, 1).every * 1.6);
  } else if (kind === 'sceptre') {
    const sc = cfg.sceptre;
    const pattern = [];
    const of = Math.max(1, strikeAt(w, 0).of || 1);
    for (let i = 0; i < of; i++) {
      const st = strikeAt(w, i), t = swingTiming(w, i, 1);
      pattern.push({ name: st.name, reach: Math.max(st.reach, sc.minReach), arc: Math.max(Math.max(st.arc, 0.6) * 2, sc.minArc), damage: st.damage || 1, every: Math.max(0.2, t.every) });
    }
    Object.assign(p, { key: 'sceptre', look: 'sceptre', name: 'Elemental swing', shape: 'melee', styleMult: sc.mult, pattern, range: Math.max(...pattern.map(s => s.reach)), every: pattern[0].every });
  }
  p.mult = p.share * p.styleMult * p.school;
  p.rider = riderFor(rules, gear);
  const haste = 1 + (sheet?.hastePct || 0) / 100;
  p.attackEvery = Math.round(p.every * p.pace / haste * 100) / 100;
  return p;
}

/** Seconds between two basic attacks for this plan at `haste` (1 = none). Combat and the card both use this. */
export const planEvery = (plan, haste = 1, step = 0) => (plan.shape === 'melee' ? plan.pattern[step % plan.pattern.length].every : plan.every * plan.pace) / haste;

const elName = el => ELEMENT_NAME[el] || 'Arcane';
const lower = el => elName(el).toLowerCase();

/**
 * The card for a caster attack: `rows` (style, range, rate), `lines` (what it does, with this hero's numbers),
 * `how` (the sum), `status` (the status id a hit leaves, for describe.js's aura sentence). Every number here is a
 * field of `plan` — the same object the sim fights with.
 */
export function attackCard(rules, plan, powerRange, { sheet = null } = {}) {
  const el = elName(plan.element), low = lower(plan.element);
  const hit = scaleR(powerRange, plan.mult);
  const H = range2(hit);
  const lines = [], rows = [];
  const label = plan.kind === 'tome' ? 'Tome form' : plan.kind === 'staff' ? 'Staff spell' : plan.kind === 'sceptre' ? 'Attack' : 'Wand style';
  rows.push({ label, value: plan.name });
  const lead = `Basic attack (${plan.name}):`;
  switch (plan.shape) {
    case 'cone': lines.push(`${lead} a ${deg(plan.arc)}° cone of ${low} ${m(plan.reach)} long in front of you deals ${H} ${el} damage to everything in it.`); break;
    case 'beam': lines.push(`${lead} an instant ${plan.kind === 'staff' || plan.kind === 'tome' ? 'lance' : 'beam'} of ${low} ${m(plan.range)} long and ${m(plan.width)} wide deals ${H} ${el} damage to everything along it.`); break;
    case 'nova': lines.push(`${lead} a ring of ${low} deals ${H} ${el} damage to everything within ${m(plan.radius)} of you.`); break;
    case 'lob': lines.push(`${lead} lobs a blast of ${low} where you aim, up to ${m(plan.range)} away (it flies ${fmt(plan.speed)} m a second); it lands for ${H} ${el} damage to everything within ${m(plan.radius)}.`); break;
    case 'ground': {
      const n = Math.max(1, Math.round(plan.ground.seconds / plan.ground.every));
      lines.push(`${lead} sets the ground where you aim (up to ${m(plan.range)} away) alight with ${low} for ${sec(plan.ground.seconds)}: everything within ${m(plan.radius)} takes ${H} ${el} damage as it lands and every ${sec(plan.ground.every)} after (${fmt(n)} times).`);
      break;
    }
    case 'melee': {
      const parts = plan.pattern.map(s => `${s.name} reaching ${m(s.reach)} in a ${deg(s.arc)}° arc for ${range2(scaleR(hit, s.damage))}`);
      lines.push(`${lead} a melee swing that deals ${el} damage instead of physical: ${parts.join(', then ')}${plan.pattern.length > 1 ? ', and round again' : ''}.`);
      break;
    }
    default: {
      const n = plan.projectiles;
      const what = n > 1 ? `${fmt(n)} ${low} bolts in a fan, each dealing` : plan.speed < rules.data.combat.projectile.bolt ? `a slow, heavy ${low} bolt dealing` : `${an(low)} bolt dealing`;
      let s = `${lead} throws ${what} ${H} ${el} damage to the first enemy it hits, up to ${m(plan.range)} away`;
      if (plan.splash) s += `, and half that (${range2(scaleR(hit, 0.5))}) to everything within ${m(plan.splash)} of it`;
      lines.push(`${s}.`);
      if (plan.chains) lines.push(`It then jumps up to ${fmt(plan.chains.n)} more times, each time to the nearest other enemy within ${m(plan.chains.range)}, at ${pct(plan.chains.keep)} of the hit before.`);
      if (plan.homing) lines.push(`It turns toward the nearest enemy ahead of it (within ${m(plan.homing.seekMetres)}).`);
      if (plan.speed < rules.data.combat.projectile.bolt) lines.push(`It flies ${fmt(plan.speed)} m a second (a plain bolt flies ${fmt(rules.data.combat.projectile.bolt)}).`);
      if (plan.split) lines.push(`Where it hits it splits into ${fmt(plan.split.shards)} shards that strike other enemies within ${m(plan.split.range)} for ${pct(plan.split.keep)} of the bolt (${range2(scaleR(hit, plan.split.keep))}).`);
      if (plan.pool) {
        const ticks = Math.max(1, Math.round(plan.pool.seconds / plan.pool.every));
        lines.push(`Where it hits it leaves ${low} ground ${m(plan.pool.radius * 2)} across for ${sec(plan.pool.seconds)}, striking everything inside every ${sec(plan.pool.every)} (${fmt(ticks)} times) for ${range2(scaleR(hit, plan.pool.power))}.`);
      }
    }
  }
  if (plan.ward) {
    const w = plan.ward;
    const mh = sheet?.maxHp;
    lines.push(`Each attack that hits shields you${w.allies ? ' and every ally inside it' : ''} for ${pct(w.share)} of maximum health${mh ? ` (${fmtHp(mh * w.share)} for you)` : ''}, building up to ${pct(w.cap)}${mh ? ` (${fmtHp(mh * w.cap)})` : ''}, for ${sec(w.seconds)}.`);
  }
  if (plan.status) lines.push(`Hits leave ${rules.statuses[plan.status]?.name || plan.status}.`);
  if (plan.rider) lines.push(riderLine(rules, plan.rider, powerRange, plan, { lead: `${plan.rider.item}:` }));
  // the rows a card always carries
  if (plan.shape !== 'melee') rows.push({ label: 'Reach', value: plan.shape === 'nova' ? `${m(plan.radius)} round you` : m(plan.range) });
  else rows.push({ label: 'Reach', value: m(plan.range) });
  rows.push({ label: 'Attacks', value: plan.shape === 'melee' ? plan.pattern.map(s => sec(s.every / (1 + (sheet?.hastePct || 0) / 100))).join(' / ') : `every ${sec(plan.attackEvery)}${plan.pace !== 1 ? ` (a tome is ${fmt(plan.pace)}x slower than a wand, and hits harder)` : ''}` });
  rows.push({ label: 'Mana', value: 'None' });
  // how it is worked out, with this hero's numbers
  const parts = [`Spell power (Intelligence) ${range2(powerRange)}`, `${pct(plan.share)} (magic weapon)`];
  if (plan.styleMult !== 1) parts.push(`${pct(plan.styleMult)} (${plan.name})`);
  if (plan.school !== 1) parts.push(`${fmt(Math.round(plan.school * 100) / 100)} (${Math.round((plan.school - 1) * 100) >= 0 ? '+' : ''}${Math.round((plan.school - 1) * 100)}% ${el})`);
  const how = [`${parts.join(' x ')} = ${H} per hit, before armour and magic resistance.`];
  if (plan.shape === 'melee') how.push(`Each strike of the swing: ${plan.pattern.map(s => `${s.name} x ${pct(s.damage)}`).join(', ')}.`);
  if (sheet) how.push(`Critical hits (${fmtPctOf(sheet.critChance)} chance) deal ${fmtPctOf(sheet.critDamage)} more.`);
  return { rows, lines, how, status: plan.status, hit };
}

/** One rider as a sentence with real numbers. `lead` replaces the "Held in the off hand" opening. */
export function riderLine(rules, r, powerRange = null, plan = null, { lead = 'Held in the off hand with a wand, tome or sceptre:' } = {}) {
  const hit = powerRange && plan ? scaleR(powerRange, plan.mult) : null;
  switch (r.key) {
    case 'echo': return `${lead} every ${NTH(r.every)} basic attack repeats itself ${sec(r.delay)} later at ${pct(r.mult)} of its damage${hit ? ` (${range2(scaleR(hit, r.mult))} a hit)` : ''} (${r.name}).`;
    case 'burst': return `${lead} a basic attack that hits also bursts ${m(r.radius)} around the first enemy struck for ${pct(r.mult)} of the hit${hit ? ` (${range2(scaleR(hit, r.mult))})` : ''} to everything there (${r.name}).`;
    case 'ward': return `${lead} a basic attack that hits shields you for ${pct(r.share)} of your maximum health, building up to ${pct(r.cap)}, for ${sec(r.seconds)} (${r.name}).`;
    case 'siphon': return `${lead} a basic attack that hits gives you back ${fmt(r.mana)} mana (${r.name}).`;
    default: return '';
  }
}

// ---------------------------------------------------------------- named casters

/** Make a named caster from casters.json `named` (its element and style are fixed; its numbers roll at `ilvl`). */
export function makeNamed(rules, id, { rng, ilvl = 1, level = 1 } = {}) {
  const spec = casterForms(rules).cfg.named?.[id];
  if (!spec) return null;
  const it = rules.rpg.loot.generate(spec.base, spec.rarity || 'rare', 'high', { rng, ilvl, level, raw: true });
  if (!it) return null;
  delete it.castElement; it.affixes = (it.affixes || []).filter(a => a.stat !== 'castElement');
  it.attune = spec.attune;
  if (spec.castStyle) it.castStyle = spec.castStyle;
  if (spec.staffSpell) it.staffSpell = spec.staffSpell;
  it.named = id;
  finishCaster(rules, it);
  it.name = spec.name;                      // after the attune, which would put "Arc" in front of it
  return it;
}

/** A boss table's chance at a named caster (casters.json `namedDrops`). */
export function namedDrop(rules, tableId, rng, level) {
  const nd = casterForms(rules).cfg.namedDrops?.[tableId];
  if (!nd || !(rng() < nd.chance)) return null;
  const id = nd.ids[Math.floor(rng() * nd.ids.length)];
  return makeNamed(rules, id, { rng, ilvl: level, level });
}

/** How far the basic attack reaches, in metres (a ring counts a little inside its edge): what a bot or a client walks into. */
export function planReach(plan, forms = null) {
  if (!plan) return null;
  if (plan.shape === 'nova') return plan.radius * (forms?.novaReach ?? 0.85);
  if (plan.shape === 'cone') return plan.reach;
  return plan.range;
}
