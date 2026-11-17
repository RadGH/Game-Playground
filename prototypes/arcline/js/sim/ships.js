// Ships overhead (PLAN §0 'Ship comms', 'Landings', 'Orbital strikes'). A powered Comms Array lets the city hear the
// ships that pass on their own schedule; each one crosses the sky strip with a timer and an offer:
//   warship   — sells 1–3 orbital strike charges for Credits + Crystal
//   merchant  — sells EXCLUSIVE goods (turret Mk II/III parts, landmark pieces, blueprints) for Credits + Crystal, and
//               supply crates (Metal, Stone, Crystal, refined goods) for Credits
// Round 2 (owner 2026-11-16): ships no longer bring people — people move in on their own (city.immigrate). Drop pods
// now carry SUPPLIES: what you buy from a merchant, and a free supply crate from the colony's sponsors every
// T.supplyEveryDays (no Comms Array needed), now and then with a rare part inside.
// Pods land on open ground near the city (always safe) until a Landing Pad exists; then on the pad.
// Also: the founding pod rain, orbital strike charges and the Orbital Lance landmark's cooldown.
//
// Pure: no DOM. Time is the region's game day (r.day, advanced by city.tick); real-time numbers in tuning (minutes
// between ships, seconds a ship takes to cross) are turned into days with T.dayLengthSec (seconds per game day at 1×).
// Randomness: the region's seed + a counter kept in r.ships (same save → same ships).
import { T } from './tuning.js';
import { item } from './catalog.js';
import { rng } from '../../../../citykit/js/kit/rng.js';
import { fmt } from '../../../../shared/format.js';
import { damageNests } from './nests.js';
import { refreshArms, turretStats, MK } from './arms.js';

// ---------------------------------------------------------------- data
/** What each kind of ship is called on screen. */
export const KIND_NAMES = { warship: 'Warship', merchant: 'Merchant' };

/** How likely each kind is: a doing-well city mostly hears merchants; a struggling one hears warships. */
export const KIND_ODDS = {
  normal: { merchant: 0.6, warship: 0.4 },
  struggling: { merchant: 0.3, warship: 0.7 },
};

// Ship names: original, two words. Never "ember", "veil" or "muster" (docs/banned-names.md).
const NAME_A = ['Patient', 'Quiet', 'Distant', 'Silver', 'Steady', 'Seventh', 'Wandering', 'Amber', 'Northern', 'Gentle', 'Lucky', 'Hollow',
  'Bright', 'Long', 'Tenth', 'Brass', 'Cobalt', 'Glad', 'Slow', 'Far', 'Second', 'Copper', 'Open', 'Tidal'];
const NAME_B = {
  warship: ['Verdict', 'Reckoning', 'Answer', 'Bastion', 'Thunder', 'Argument', 'Rampart', 'Sentence', 'Anvil', 'Hammerhead', 'Warden', 'Gauntlet'],
  merchant: ['Ledger', 'Bargain', 'Margin', 'Tidings', 'Lot', 'Weight', 'Purse', 'Cargo', 'Barter', 'Courier', 'Manifest', 'Exchange'],
};
const CLASS = { warship: 'Frigate', merchant: 'Trader' };

/**
 * Exclusive goods merchants sell — things the city can't make. `from` = lowest milestone they're offered at;
 * `needs` = another good owned first; `rare` = only with a Deep-space Array or the Spaceport.
 * Effects are read by goodsEffect(); the ones outside this file (Mk II/III turrets, tougher walls, landmark discounts,
 * longer turret reach) are hooks for defence.js / build.js — see the report in ARCH/README.
 */
export const GOODS = [
  ...['pulse', 'mortar', 'arc', 'rail'].flatMap(t => {
    const nm = { pulse: 'Pulse Gun', mortar: 'Mortar', arc: 'Arc Coil', rail: 'Rail Lance' }[t];
    const base = { pulse: 4500, mortar: 6500, arc: 8000, rail: 11000 }[t];
    return [
      { id: `mk2-${t}`, name: `${nm} Mk II parts`, kind: 'turret', turret: t, mk: 2, credits: base, crystal: Math.round(base / 90), fromTurret: `tur-${t}`,
        blurb: `Refits every ${nm} — the ones standing and every one you build later — to Mk II: 40% more damage.` },
      { id: `mk3-${t}`, name: `${nm} Mk III parts`, kind: 'turret', turret: t, mk: 3, credits: base * 3, crystal: Math.round(base / 30), fromTurret: `tur-${t}`, needs: `mk2-${t}`, rare: true,
        blurb: `Refits every ${nm} to Mk III: twice the damage of Mk I and 15% more reach.` },
    ];
  }),
  { id: 'piece-spaceport', name: 'Docking ring', kind: 'landmark', landmark: 'lm-spaceport', credits: 9000, crystal: 120, from: 3, effect: { discount: 0.3 },
    blurb: 'A ready-made docking ring: the Spaceport costs 30% less.' },
  { id: 'piece-arcology', name: 'Sky-garden core', kind: 'landmark', landmark: 'lm-arcology', credits: 12000, crystal: 160, from: 4, effect: { discount: 0.3 },
    blurb: 'The living heart of an Arcology Spire: it costs 30% less.' },
  { id: 'piece-lance', name: 'Lance focusing crystal', kind: 'landmark', landmark: 'lm-lance', credits: 15000, crystal: 220, from: 5, effect: { lanceCooldown: 0.7 }, rare: true,
    blurb: 'The Orbital Lance recharges 30% faster.' },
  { id: 'bp-walls', name: 'Woven wall blueprint', kind: 'blueprint', credits: 6000, crystal: 60, from: 1, effect: { wallHp: 1.25 },
    blurb: 'Every wall and gate, standing and new, is 25% tougher.' },
  { id: 'bp-range', name: 'Range-finder blueprint', kind: 'blueprint', credits: 7000, crystal: 80, from: 2, effect: { turretRange: 1.1 },
    blurb: 'Every turret reaches 10% farther.' },
  { id: 'bp-strike', name: 'Shell-spread blueprint', kind: 'blueprint', credits: 5000, crystal: 70, from: 1, effect: { strikeRadius: 1.2 },
    blurb: 'Orbital strikes hit a 20% wider circle.' },
];
/**
 * Supply crates: bulk materials a merchant sells for credits (any number of times — not owned like GOODS), and what
 * the free sponsor drops carry. `from` = lowest milestone. give = stock added.
 */
export const SUPPLIES = [
  { id: 'crate-metal', name: 'Metal crates', kind: 'supply', give: { metal: 160 }, credits: 1100, crystal: 0, from: 0, blurb: '160 Metal for walls and turrets.' },
  { id: 'crate-stone', name: 'Stone crates', kind: 'supply', give: { stone: 160 }, credits: 800, crystal: 0, from: 0, blurb: '160 Stone.' },
  { id: 'crate-crystal', name: 'Crystal cache', kind: 'supply', give: { crystal: 45 }, credits: 2200, crystal: 0, from: 0, blurb: '45 Crystal — orbital strikes and rare goods take it.' },
  { id: 'crate-steel', name: 'Steel girders', kind: 'supply', give: { steel: 60 }, credits: 2600, crystal: 0, from: 1, blurb: '60 Steel, ready to build with.' },
  { id: 'crate-concrete', name: 'Concrete pallets', kind: 'supply', give: { concrete: 60 }, credits: 2200, crystal: 0, from: 2, blurb: '60 Concrete, ready to build with.' },
  { id: 'crate-cells', name: 'Power cell rack', kind: 'supply', give: { cells: 30 }, credits: 3600, crystal: 0, from: 3, blurb: '30 Power cells.' },
];
export const goodById = id => GOODS.find(g => g.id === id) || SUPPLIES.find(g => g.id === id);
const MAT_NAMES = { metal: 'Metal', stone: 'Stone', crystal: 'Crystal', steel: 'Steel', concrete: 'Concrete', cells: 'Power cells' };
/** "160 Metal, 20 Crystal" */
export const supplyText = give => Object.entries(give).filter(([, v]) => v > 0).map(([k, v]) => `${fmt(Math.round(v))} ${MAT_NAMES[k] || k}`).join(', ');

// ---------------------------------------------------------------- state
/** Fill in the ship fields (safe to call every tick; old saves and fresh regions both work). */
export function ensureShips(r) {
  const s = r.ships || (r.ships = {});
  s.passing ??= []; s.history ??= []; s.strikes ??= 0; s.lanceReady ??= 0; s.seq ??= 0; s.rolls ??= 0;
  s.goods ??= {};
  if (!r.arms) refreshArms(r, ownedGoods(r));   // old saves: the upgrades they paid for (report #78: Mk II did nothing)
  // round 2: ships no longer carry people — an old save's settler ships simply fly on
  s.passing = s.passing.filter(sh => sh.kind === 'warship' || sh.kind === 'merchant');
  s.nextDrop ??= (r.day || 0) + (T.supplyEveryDays ?? 25) * 0.5;
  // region.found() sets s.next in real seconds at 1×; turn it into a game day once
  if (s.nextDay == null) s.nextDay = (r.day || 0) + (s.next ? s.next / dayLen() : interval(r));
  return s;
}
const dayLen = () => Math.max(0.1, T.dayLengthSec ?? 6);
function roll(r) { const s = r.ships; s.rolls = (s.rolls || 0) + 1; return rng((r.seed || 1) * 7919 + s.rolls * 104729); }

/** The best powered Comms Array: 0 = none (no ships heard), 1..3. */
export function commsTier(r) {
  let t = 0; for (const l of r.lots) { const c = item(l.id)?.comms; if (c && (l.powered ?? 0) > 0.5) t = Math.max(t, c); }
  return t;
}
export function hasSpaceport(r) { return r.lots.some(l => l.id === 'lm-spaceport' && (l.powered ?? 0) > 0.5); }
/** A struggling city: in debt, shut down, or a wall broke in the last 10 days. */
export function struggling(r) {
  return r.money < 0 || !!r.shutdown || (r.threat?.lastBreach != null && r.day - r.threat.lastBreach < 10);
}
/** Days between ships right now (before jitter): T.shipEveryMin → T.shipEveryBest with reputation, faster with a
 *  bigger array, twice as often with the Spaceport. */
export function interval(r) {
  const good = clamp(r.reputation || 0, 0, 1);
  let min = lerp(T.shipEveryMin ?? 11, T.shipEveryBest ?? 4, good);
  const tier = Math.max(1, commsTier(r));
  min /= 1 + 0.3 * (tier - 1);
  if (hasSpaceport(r)) min /= 2;
  return min * 60 / dayLen();
}

// ---------------------------------------------------------------- the tick
/**
 * Advance the ships to r.day (call after city.tick moved the clock). Returns events:
 *   { type: 'landing', supply: { metal: n, … }, part?, text, … }  a free supply crate came down (landing() shape)
 *   { type: 'ship-arrived', ship }      a new ship entered the sky strip (ship = shipView)
 *   { type: 'ship-left', ship, answered }  it crossed out of range
 *   { type: 'comms-online' } / { type: 'comms-offline' }
 */
export function shipsTick(r, days = 0) {
  const s = ensureShips(r), ev = [];
  if (!r.founded) return ev;
  // the sponsors' free supply crate (no Comms Array needed)
  if (r.day >= s.nextDrop) {
    const R = roll(r), drop = supplyDrop(r, R);
    s.nextDrop = r.day + (T.supplyEveryDays ?? 25) * R.range(0.7, 1.3);
    if (drop) ev.push(drop);
  }
  // ships that crossed out of range
  for (const sh of [...s.passing]) if (r.day >= sh.leaves) { s.passing.splice(s.passing.indexOf(sh), 1); remember(r, sh, sh.answered ? 'answered' : 'missed'); ev.push({ type: 'ship-left', ship: shipView(r, sh), answered: !!sh.answered }); }
  const tier = commsTier(r);
  if (!tier) {
    if (!s.offline) { s.offline = true; ev.push({ type: 'comms-offline' }); }
    return ev;
  }
  if (s.offline) {
    s.offline = false; ev.push({ type: 'comms-online' });
    // the array just came (back) online: the first ship is a short wait, not instant and not a long one
    if (s.nextDay < r.day) s.nextDay = r.day + interval(r) * 0.25;
  }
  if (r.day >= s.nextDay) {
    const R = roll(r);
    if (s.passing.length < 2) { const sh = makeShip(r, R, tier); s.passing.push(sh); ev.push({ type: 'ship-arrived', ship: shipView(r, sh) }); }
    // never stack up a backlog (a long pause, a loaded old save): the next ship is a full interval from now
    s.nextDay = r.day + interval(r) * R.range(0.75, 1.25);
  }
  return ev;
}
function remember(r, sh, how) { const h = r.ships.history; h.push({ day: Math.round(r.day), kind: sh.kind, name: sh.name, how }); if (h.length > 40) h.shift(); }

function makeShip(r, R, tier) {
  const s = r.ships, odds = KIND_ODDS[struggling(r) ? 'struggling' : 'normal'];
  let kind = pickWeighted(R, odds);
  let offer = null;
  if (kind === 'merchant') { offer = merchantOffer(r, R, tier); if (!offer) kind = 'warship'; }
  if (kind === 'warship') offer = { charges: R.int(1, 3), price: T.strikePrice ?? 4000, crystal: T.strikeCrystal ?? 40 };
  const cls = kind;
  const name = `${R.pick(NAME_A)} ${R.pick(NAME_B[kind])}`;
  const cross = R.range(T.shipPassMinSec ?? 60, T.shipPassMaxSec ?? 90) / dayLen();
  return { id: ++s.seq, kind, cls, name, title: `${CLASS[cls]} ${name}`, came: r.day, leaves: r.day + cross, offer, answered: false };
}
function merchantOffer(r, R, tier) {
  const rare = tier >= 3 || hasSpaceport(r), own = r.ships.goods;
  const can = GOODS.filter(g => !own[g.id] && (!g.needs || own[g.needs]) && (!g.rare || rare)
    && (g.from == null || g.from <= r.milestone) && (!g.fromTurret || (item(g.fromTurret)?.unlock ?? 0) <= r.milestone)
    && (!g.landmark || (item(g.landmark)?.unlock ?? 0) <= r.milestone + 1));
  const goods = []; const pool = [...can];
  const n = Math.min(pool.length, R.int(1, 2) + (hasSpaceport(r) ? 1 : 0));
  for (let k = 0; k < n; k++) goods.push(pool.splice(R.int(0, pool.length - 1), 1)[0].id);
  // and a couple of supply crates (bigger arrays bring bigger traders: one more crate a tier)
  const crates = SUPPLIES.filter(c => (c.from ?? 0) <= r.milestone);
  for (let k = 0; k < Math.min(crates.length, 1 + tier) && crates.length; k++) goods.push(crates.splice(R.int(0, crates.length - 1), 1)[0].id);
  if (!goods.length) return null;
  return { goods };
}
function pickWeighted(R, odds) { const tot = Object.values(odds).reduce((a, b) => a + b, 0); let x = R() * tot; for (const [k, v] of Object.entries(odds)) { x -= v; if (x <= 0) return k; } return Object.keys(odds)[0]; }

// ---------------------------------------------------------------- answering
/**
 * Answer a passing ship. choice:
 *   (old saves' settler ships are gone: ensureShips drops them)
 *   warship:  a number of charges to buy (1..offered), 'accept' (= all) or 'refuse'
 *   merchant: a good id to buy, or 'refuse'
 * → { ok, why?, text, events: [landing…] }  Nothing is paid when ok is false.
 */
export function answer(r, shipId, choice) {
  const s = ensureShips(r), sh = s.passing.find(x => x.id === shipId);
  if (!sh) return { ok: false, why: 'That ship has already gone', events: [] };
  const R = roll(r);
  if (choice === 'refuse') { leave(r, sh, 'refused'); return { ok: true, text: `You waved the ${sh.title} on.`, events: [] }; }
  if (sh.kind === 'warship') {
    const want = choice === 'accept' ? sh.offer.charges : Math.floor(Number(choice));
    if (!(want >= 1 && want <= sh.offer.charges)) return { ok: false, why: `They have ${sh.offer.charges} charge${sh.offer.charges > 1 ? 's' : ''} to sell`, events: [] };
    const cost = want * sh.offer.price, cry = want * sh.offer.crystal, broke = afford(r, cost, cry);
    if (broke) return { ok: false, why: broke, events: [] };
    r.money -= cost; r.stock.crystal -= cry; s.strikes += want; sh.offer.charges -= want; sh.answered = true;
    if (sh.offer.charges <= 0) leave(r, sh, 'bought');
    return { ok: true, text: `Bought ${want} orbital strike charge${want > 1 ? 's' : ''}. You have ${s.strikes}.`, events: [] };
  }
  if (sh.kind === 'merchant') {
    const g = goodById(choice);
    if (!g || !sh.offer.goods.includes(g.id)) return { ok: false, why: 'They are not selling that', events: [] };
    const broke = afford(r, g.credits, g.crystal); if (broke) return { ok: false, why: broke, events: [] };
    r.money -= g.credits; r.stock.crystal -= g.crystal; sh.answered = true;
    if (g.kind === 'supply') for (const [k, v] of Object.entries(g.give)) r.stock[k] = (r.stock[k] || 0) + v;
    else s.goods[g.id] = r.day;
    const changed = g.kind === 'supply' ? null : refreshArms(r, ownedGoods(r));
    sh.offer.goods = sh.offer.goods.filter(id => id !== g.id);
    const land = landing(r, R, 0, { cargo: g.id });
    if (g.kind === 'supply') land.supply = { ...g.give };
    if (!sh.offer.goods.length) leave(r, sh, 'bought');
    r.log?.push({ day: Math.round(r.day), text: `Bought ${g.name} from the ${sh.title}.` });
    return { ok: true, text: g.kind === 'supply' ? `${g.name} are coming down: ${supplyText(g.give)}.` : upgradeText(r, g, changed), events: [land], upgrade: changed };
  }
  return { ok: false, why: 'Nothing to answer', events: [] };
}
function leave(r, sh, how) { const s = r.ships; sh.answered = true; s.passing = s.passing.filter(x => x !== sh); remember(r, sh, how); }
function afford(r, credits, crystal) {
  const lackC = r.money < credits, lackX = (r.stock.crystal || 0) < crystal;
  if (lackC && lackX) return `Needs ${fmt(credits)} credits and ${fmt(crystal)} Crystal`;
  if (lackC) return `Needs ${fmt(credits)} credits (you have ${fmt(Math.floor(r.money))})`;
  if (lackX) return `Needs ${fmt(crystal)} Crystal (you have ${fmt(Math.floor(r.stock.crystal || 0))})`;
  return null;
}

// ---------------------------------------------------------------- what the UI lists
/** Seconds left at 1× speed and days left for a passing ship, plus how far across the sky strip it is (0..1). */
export function timeLeft(r, sh) {
  const days = Math.max(0, sh.leaves - r.day);
  return { days, sec: Math.ceil(days * dayLen()), progress: clamp((r.day - sh.came) / Math.max(1e-6, sh.leaves - sh.came), 0, 1) };
}
/**
 * Everything the comms panel shows for one ship. choices: [{ choice, label, cost, ok, why }] — pass `choice` back
 * to answer(). Every number is already formatted (no long decimals).
 */
export function shipView(r, sh) {
  const tl = timeLeft(r, sh), out = { id: sh.id, kind: sh.kind, kindName: KIND_NAMES[sh.cls], name: sh.name, title: sh.title, secondsLeft: tl.sec, daysLeft: tl.days, progress: tl.progress, choices: [] };
  if (sh.kind === 'warship') {
    const o = sh.offer;
    out.text = `Offers ${o.charges} orbital strike charge${o.charges > 1 ? 's' : ''} at ${fmt(o.price)} credits + ${fmt(o.crystal)} Crystal each.`;
    out.lines = [`${o.charges} charge${o.charges > 1 ? 's' : ''} for sale`, `Each strike: a ${fmt(strikeRadius(r), { decimals: 1 })}-tile blast you aim anywhere`];
    for (let k = 1; k <= o.charges; k++) { const why = afford(r, k * o.price, k * o.crystal); out.choices.push({ choice: k, label: `Buy ${k}`, cost: `${fmt(k * o.price)} credits + ${fmt(k * o.crystal)} Crystal`, ok: !why, why }); }
  } else {
    out.text = `Sells rare goods you can't make yourself, and supply crates.`;
    out.lines = sh.offer.goods.map(id => goodById(id).name);
    for (const id of sh.offer.goods) { const g = goodById(id), why = afford(r, g.credits, g.crystal); out.choices.push({ choice: id, label: g.name, blurb: g.blurb, cost: g.crystal ? `${fmt(g.credits)} credits + ${fmt(g.crystal)} Crystal` : `${fmt(g.credits)} credits`, ok: !why, why }); }
  }
  out.choices.push({ choice: 'refuse', label: 'No thanks', cost: '', ok: true });
  return out;
}
/** The comms panel: ships overhead now (soonest to leave first), the next ship roughly, strikes on hand. */
export function commsView(r) {
  const s = ensureShips(r), tier = commsTier(r);
  return {
    tier, online: tier > 0,
    ships: s.passing.slice().sort((a, b) => a.leaves - b.leaves).map(sh => shipView(r, sh)),
    nextInSec: tier ? Math.max(0, Math.round((s.nextDay - r.day) * dayLen())) : null,
    note: tier ? null : 'Build a Comms Array and power it to hear passing ships.',
    strikes: strikeReady(r), goods: Object.keys(s.goods).map(id => goodById(id)).filter(Boolean),
    history: s.history.slice(-10).reverse(),
  };
}

// ---------------------------------------------------------------- landings
/**
 * Where pods come down: the Landing Pad if there is one, else open ground near the city (away from nests — always
 * safe). count = people (0 for a cargo pod). → { type: 'landing', x, z, count, onPad, cargo?, pods: [{ x, z, count, delay }] }
 * x/z are tile coordinates (centre of the landing), delay is real seconds after the event for each pod.
 */
export function landing(r, R, count, { pod = 8, cargo = null } = {}) {
  const pad = r.lots.find(l => l.id === 'col-pad');
  const pods = [], n = cargo ? 1 : Math.max(1, Math.min(14, Math.ceil(count / pod)));
  if (pad) {
    const x = pad.x + pad.w / 2, z = pad.z + pad.d / 2;
    for (let k = 0; k < n; k++) pods.push({ x: x + R.range(-0.4, 0.4) * pad.w * 0.6, z: z + R.range(-0.4, 0.4) * pad.d * 0.6, count: share(count, n, k), delay: k * 0.45 });
    return { type: 'landing', x, z, count, onPad: true, cargo, pods };
  }
  const spot = openSpot(r, R, 4, 34, 3);
  const tiles = openTilesAround(r, spot.x, spot.z, 2.5);
  for (let k = 0; k < n; k++) { const t = tiles.length ? tiles[R.int(0, tiles.length - 1)] : [spot.x, spot.z]; pods.push({ x: t[0] + R.range(0.25, 0.75), z: t[1] + R.range(0.25, 0.75), count: share(count, n, k), delay: k * 0.45 }); }
  return { type: 'landing', x: spot.x + 0.5, z: spot.z + 0.5, count, onPad: false, cargo, pods };
}
/**
 * The sponsors' free supply crate: raw materials (more at higher milestones), refined goods from milestone 1, and
 * now and then (T.rarePartChance, from milestone 1) a rare part a merchant would sell — the cheapest one you don't own.
 * Adds it to the stockpile and returns the landing event (landing() shape + supply, part?, text).
 */
export function supplyDrop(r, R) {
  ensureShips(r);
  const m = 1 + 0.5 * (r.milestone || 0), give = {};
  const raw = R.pick(['metal', 'stone', 'crystal']);
  give[raw] = Math.round((raw === 'crystal' ? R.range(12, 30) : R.range(60, 130)) * m);
  if (r.milestone >= 1 && R.chance(0.5)) { const ref = R.pick(r.milestone >= 3 ? ['steel', 'concrete', 'cells'] : r.milestone >= 2 ? ['steel', 'concrete'] : ['steel']); give[ref] = Math.round(R.range(15, 35) * m); }
  for (const [k, v] of Object.entries(give)) r.stock[k] = (r.stock[k] || 0) + v;
  let part = null;
  if (r.milestone >= 1 && R.chance(T.rarePartChance ?? 0.12)) {
    const own = r.ships.goods;
    const can = GOODS.filter(g => !own[g.id] && !g.rare && (!g.needs || own[g.needs]) && (g.from == null || g.from <= r.milestone) && (!g.fromTurret || (item(g.fromTurret)?.unlock ?? 0) <= r.milestone) && !g.landmark).sort((a, b) => a.credits - b.credits);
    if (can.length) { part = can[0]; own[part.id] = r.day; refreshArms(r, ownedGoods(r)); }
  }
  const land = landing(r, R, 0, { cargo: part ? part.id : 'supply' });
  const text = `A supply crate from the colony's sponsors landed${land.onPad ? ' on the Landing Pad' : ''}: ${supplyText(give)}${part ? `, and ${part.name}. ${upgradeText(r, part, null)}` : '.'}`;
  r.log?.push({ day: Math.round(r.day), text, kind: 'supply' });
  return { ...land, supply: give, part: part ? part.id : null, text };
}
const share = (count, n, k) => Math.floor(count / n) + (k < count % n ? 1 : 0);

/** Is this tile open ground a pod can land on? (dry, nothing built, not a road, not right on a nest) */
export function openGround(r, x, z) {
  const N = r.size; if (x < 1 || z < 1 || x >= N - 1 || z >= N - 1) return false;
  const i = z * N + x;
  if (r.ter.water[i] || r.tiles.road[i] || r.tiles.lot[i] >= 0 || r.tiles.wall[i] || r.tiles.transit?.[i]) return false;
  if (r.turrets.some(t => t.x === x && t.z === z)) return false;
  return true;
}
function nearNest(r, x, z, d) { return r.nests.some(n => Math.hypot(n.x - x, n.z - z) < d); }
function openTilesAround(r, x, z, rad) { const out = []; for (let k = -Math.ceil(rad); k <= rad; k++) for (let j = -Math.ceil(rad); j <= rad; j++) if (Math.hypot(j, k) <= rad && openGround(r, x + j, z + k)) out.push([x + j, z + k]); return out; }
/** The nearest open patch to the city centre (rings outward from `from` to `to` tiles), at least `need`×`need` clear-ish,
 *  away from nests. Unzoned ground preferred. Falls back to the city centre. */
function openSpot(r, R, from, to, need) {
  const c = cityCentre(r);
  for (let rad = from; rad <= to; rad += 2) {
    const best = [];
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2, x = Math.round(c.x + Math.cos(ang) * rad), z = Math.round(c.z + Math.sin(ang) * rad);
      if (!openGround(r, x, z) || nearNest(r, x, z, 14)) continue;
      const open = openTilesAround(r, x, z, need / 2 + 0.5).length;
      if (open >= need * need - 1) best.push({ x, z, zoned: r.tiles.zone[z * r.size + x] ? 1 : 0 });
    }
    if (best.length) { const unz = best.filter(b => !b.zoned); const pool = unz.length ? unz : best; return pool[R.int(0, pool.length - 1)]; }
  }
  return { x: Math.round(c.x), z: Math.round(c.z) };
}
export function cityCentre(r) { return r.core ? { x: r.core.x + 1.5, z: r.core.z + 1.5 } : { x: r.size / 2, z: r.size / 2 }; }

/**
 * The founding drop for the renderer: the Colony Core comes down first, then the first settlers in a pod rain around
 * it. Doesn't change state (region.found already queued the people). → { type: 'founding', core: {x, z}, x, z, count,
 * pods: [{ x, z, count, delay }] }
 */
export function foundingDrop(r) {
  const R = rng((r.seed || 1) * 31 + 5), c = cityCentre(r), count = r.people.arriving || (T.foundingSettlers ?? 40);
  const n = Math.max(4, Math.min(14, Math.ceil(count / 4))), pods = [];
  for (let k = 0; k < n; k++) {
    let x = c.x, z = c.z;
    for (let t = 0; t < 30; t++) { const ang = R() * Math.PI * 2, d = R.range(3.5, 8); const tx = Math.floor(c.x + Math.cos(ang) * d), tz = Math.floor(c.z + Math.sin(ang) * d); if (openGround(r, tx, tz)) { x = tx + R.range(0.25, 0.75); z = tz + R.range(0.25, 0.75); break; } }
    pods.push({ x, z, count: share(count, n, k), delay: 1.4 + k * 0.32 + R.range(0, 0.2) });
  }
  return { type: 'founding', core: r.core ? { ...r.core } : null, x: c.x, z: c.z, count, pods };
}

/** The goods this region owns, as GOODS entries. */
export function ownedGoods(r) { const own = r.ships?.goods || {}; return GOODS.filter(g => own[g.id] != null); }
/** What a bought good just did, in a sentence with its numbers (report #78: the player couldn't tell). */
export function upgradeText(r, g, changed) {
  if (g.turret) {
    const now = turretStats(r, g.turret), was = turretStats(r, g.turret, Math.max(1, g.mk - 1)), n = (r.turrets || []).filter(t => t.kind === g.turret).length;
    const reach = now.range > was.range + 0.01 ? `, reach ${fmt(was.range, { decimals: 1 })} → ${fmt(now.range, { decimals: 1 })} tiles` : '';
    return `${now.label}: ${n ? `your ${fmt(n)} ${now.name}${n > 1 ? 's are' : ' is'} refitted` : `every ${now.name} you build is ${MK[g.mk].label}`} — damage ${fmt(was.damage, { decimals: 0 })} → ${fmt(now.damage, { decimals: 0 })} a shot${reach}.`;
  }
  if (g.effect?.wallHp) return `${g.name}: every wall and gate is ${fmt(Math.round((g.effect.wallHp - 1) * 100))}% tougher, from now on and the ones standing.`;
  return `${g.name}: ${g.blurb}`;
}

// ---------------------------------------------------------------- orbital strikes
/** Merchant-good effects, combined. key: 'wallHp' | 'turretRange' | 'strikeRadius' | 'lanceCooldown' (multipliers, 1 if
 *  none) — or 'discount' with a landmark id (fraction off), or 'mk' with a turret kind (1..3). */
export function goodsEffect(r, key, arg) {
  const own = r.ships?.goods || {};
  if (key === 'mk') { let mk = 1; for (const g of GOODS) if (own[g.id] && g.turret === arg) mk = Math.max(mk, g.mk); return mk; }
  if (key === 'discount') { let d = 0; for (const g of GOODS) if (own[g.id] && g.landmark === arg && g.effect?.discount) d = Math.max(d, g.effect.discount); return d; }
  let m = 1; for (const g of GOODS) if (own[g.id] && g.effect?.[key]) m *= g.effect[key]; return m;
}
export const strikeRadius = r => (T.strikeRadius ?? 4.5) * goodsEffect(r, 'strikeRadius');
function lanceLot(r) { return r.lots.find(l => l.id === 'lm-lance'); }
/** Strikes on hand: { charges, lance: null | { powered, ready, daysLeft, secondsLeft, crystal, why } } */
export function strikeReady(r) {
  const s = ensureShips(r), L = lanceLot(r);
  let lance = null;
  if (L) {
    const powered = (L.powered ?? 0) > 0.5, daysLeft = Math.max(0, s.lanceReady - r.day), crystal = T.lanceCrystal ?? 60;
    const why = !powered ? 'The Orbital Lance needs power' : daysLeft > 0 ? `Recharging: ${fmt(Math.ceil(daysLeft * dayLen()))} s` : (r.stock.crystal || 0) < crystal ? `Needs ${fmt(crystal)} Crystal` : null;
    lance = { powered, ready: !why, daysLeft, secondsLeft: Math.ceil(daysLeft * dayLen()), crystal, why };
  }
  return { charges: s.strikes, ready: s.strikes > 0 || !!lance?.ready, lance };
}
/**
 * Fire a strike at (x, z) tiles. source 'charge' uses a bought charge; 'lance' fires the Orbital Lance (costs Crystal,
 * then recharges for T.lanceCooldownDays). → { ok, why?, strike: { x, z, radius, damage, fallSec, source } }.
 * The shell takes `fallSec` real seconds to land: call strikeImpact() then (effects run in real time).
 */
export function useStrike(r, x, z, source = 'charge') {
  const s = ensureShips(r), st = strikeReady(r);
  if (x < 0 || z < 0 || x >= r.size || z >= r.size) return { ok: false, why: 'Aim inside the region' };
  if (source === 'lance') {
    if (!st.lance) return { ok: false, why: 'Build the Orbital Lance first' };
    if (!st.lance.ready) return { ok: false, why: st.lance.why };
    r.stock.crystal -= st.lance.crystal;
    s.lanceReady = r.day + (T.lanceCooldownDays ?? 10) * goodsEffect(r, 'lanceCooldown');
  } else {
    if (s.strikes <= 0) return { ok: false, why: 'No strike charges — buy them from a passing warship' };
    s.strikes--;
  }
  return { ok: true, strike: { x, z, radius: strikeRadius(r), damage: T.strikeDamage ?? 520, fallSec: source === 'lance' ? 1.6 : 2.5, source } };
}
/** The shell lands: THE blast rule on the creatures (citykit Horde.blast) plus damage to nests in the circle.
 *  Never hurts your own walls. → { hit, killed, nestsHit, cleared: [{x, z}] } */
export function strikeImpact(r, horde, strike) {
  const b = horde ? horde.blast(strike.x, strike.z, { radius: strike.radius, damage: strike.damage, core: strike.radius * 0.35, edge: 0.3, push: 9, lift: 7, stun: 0.8 }) : { hit: 0, killed: 0 };
  const n = damageNests(r, strike.x, strike.z, strike.radius, strike.damage * 3);   // a strike clears a young nest, badly hurts a big one
  return { ...b, nestsHit: n.hit, cleared: n.cleared };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
