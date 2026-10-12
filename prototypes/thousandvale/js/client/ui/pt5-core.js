// Play-test 5 interface logic with no DOM and no Three.js (stream D-UI), so tests/D/pt5.test.js can drive it:
//   T5  starting kits: tidy what C's kitsFor() returns, and the gear map a choice puts on the 3D figure
//   T7  may this item go in the off hand (a second two-hander needs the Doubled Grasp perk) — and why not
//   T9  crates and gifts: what the card says (what it opens into, the lowest rarity)
//   T11 is the player inside an event; T12 the event tracker's lines (what, objective, progress, time left, reward, result)
//   T18 the character sheet: number formatting, the basic sheet from worn gear, the up/down change per row
//   T19 the feedback report: a small ring of recent log lines and what a bug report sends
//   T20 mail: is there room in the bag for what a letter holds
//   T25 angling: the tension tug (one step of the bar), the Catch tab's rows, cooking rows
//
// Numbers are formatted by shared/format.js so nothing reads "25.02000000000001".

import { fmt, hp as whole } from '../../../../../shared/format.js';

const title = s => String(s || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- rarity words (the same names the item card uses) ------------------------------------------------------
export const RARITY_WORD = { junk: 'Junk', common: 'Common', normal: 'Common', uncommon: 'Magic', magic: 'Magic', rare: 'Rare', epic: 'Epic', set: 'Set', legendary: 'Legendary', unique: 'Unique' };
export const rarityWord = r => RARITY_WORD[String(r || 'common').toLowerCase()] || title(r);
/** The CSS rarity class (`r-magic`…) for a rarity in either vocabulary (quests say uncommon, items say magic). */
export const rarityClass = r => ({ uncommon: 'magic', normal: 'common', epic: 'epic' }[String(r || 'common').toLowerCase()] || String(r || 'common').toLowerCase());

// ---- T9 / T20: crates and gifts ----------------------------------------------------------------------------
const CRATE_WHAT = {
  weapon: 'a weapon your calling can use', offhand: 'an off-hand item your calling can use', head: 'a helm or hat', chest: 'chest armour', legs: 'leg armour',
  hands: 'gloves', feet: 'boots', ring: 'a ring', neck: 'a necklace', necklace: 'a necklace', armor: 'a piece of armour', armour: 'a piece of armour',
  jewellery: 'a ring or a necklace', jewelry: 'a ring or a necklace', any: 'an item of any kind', fish: 'something from the water',
};
const CRATE_SHORT = { weapon: 'weapon', offhand: 'off-hand item', head: 'helm', chest: 'chest armour', legs: 'leg armour', hands: 'gloves', feet: 'boots', ring: 'ring', neck: 'necklace', necklace: 'necklace', armor: 'armour', armour: 'armour', jewellery: 'jewellery', jewelry: 'jewellery', any: 'any item' };
/** Is this bag item a crate or a gift (something you open)? */
export const isCrate = it => !!it && (it.kind === 'crate' || it.kind === 'gift' || !!it.crate || !!it.gift);
export const isGift = it => !!it && (it.kind === 'gift' || !!it.gift);
/** The crate's facts whatever the field names: { slot, min, gift }. */
export function crateSpec(it) {
  const c = (it && (it.crate || it.gift)) || it || {};
  const slot = String(c.slot || c.type || c.kind2 || 'any').toLowerCase();
  return { slot: slot === 'crate' || slot === 'gift' ? 'any' : slot, min: String(c.min || c.minRarity || c.rarity || it?.minRarity || 'common').toLowerCase(), gift: isGift(it), level: c.level ?? null };
}
/** The lines an item card shows for a crate. */
export function crateLines(it) {
  const s = crateSpec(it);
  const what = CRATE_WHAT[s.slot] || `${/^[aeiou]/.test(s.slot) ? 'an' : 'a'} ${s.slot.replace(/_/g, ' ')}`;
  const min = rarityWord(s.min);
  return {
    kind: s.gift ? 'Gift' : 'Crate',
    opens: `Opens into ${what}.`,
    rarity: s.min === 'common' || s.min === 'normal' ? 'Any rarity — Common at the least.' : `${min} at the least — it can be better.`,
    how: s.gift ? 'Click it in your bag to unwrap it.' : 'Click it in your bag to open it. What is inside is made for your level when you open it.',
    min: s.min, slot: s.slot,
  };
}
/** A quest's reward row: "Crate: boots (Magic or better)". */
export function crateRewardText(c) {
  const s = crateSpec({ crate: c });
  return `Crate: ${CRATE_SHORT[s.slot] || s.slot.replace(/_/g, ' ')} (${rarityWord(s.min)} or better)`;
}
/** Every crate on a quest reward, as text rows. */
export const crateRewards = reward => (reward?.text ? [] : null) || (Array.isArray(reward?.crates) ? reward.crates : reward?.crate ? [reward.crate] : []).map(crateRewardText);

// ---- T5: starting kits -------------------------------------------------------------------------------------
const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.entries(v).map(([id, x]) => ({ id, ...x })) : []);
/** Tidy C's kitsFor() answer into { armour: [set], weapons: [pack] }, set = { id, name, blurb, items: [item] }. */
export function normaliseKits(raw) {
  if (!raw) return { armour: [], weapons: [] };
  const set = (k, i) => ({ id: String(k.id ?? k.key ?? i), name: k.name || title(k.id || `Choice ${i + 1}`), blurb: k.blurb || k.desc || k.text || '',
    items: (Array.isArray(k.items) ? k.items : Object.values(k.items || k.gear || {})).filter(Boolean) });
  return { armour: arr(raw.armour || raw.armor || raw.armourSets || raw.sets).map(set), weapons: arr(raw.weapons || raw.weaponPacks || raw.packs).map(set) };
}
/** Which worn slot a kit item goes on (a pack's second weapon goes in the off hand). */
export function kitGear(armourSet, weaponPack) {
  const g = {};
  for (const it of armourSet?.items || []) { const s = kitSlot(it); if (s && !g[s]) g[s] = it; }
  for (const it of weaponPack?.items || []) {
    let s = it.hand === 'off' || it.slot === 'offhand' ? 'offhand' : kitSlot(it);
    if (s === 'weapon' && g.weapon) s = 'offhand';
    if (s && !g[s]) g[s] = it;
  }
  return g;
}
function kitSlot(it) {
  if (!it) return null;
  if (it.type === 'weapon' || it.slot === 'mainhand') return 'weapon';
  return { neck: 'necklace', ring1: 'ring' }[it.slot] || it.slot || null;
}
/** One honest line for an item on the kit screen: "4–7 damage · two-handed · slow attacks". */
export function itemFacts(it) {
  const out = [];
  // play-test 10: Y16 an orb / focus has no attack (no damage line); the hand in the rules' words; Y26 attacks per second
  if (Array.isArray(it?.dmg) && !it.noAttack) out.push(`${whole(it.dmg[0])}–${whole(it.dmg[1])} damage`);
  if (it?.armor) out.push(`${whole(it.armor)} armour`);
  if (it?.handText) out.push(String(it.handText).toLowerCase()); else if (it?.twoHanded) out.push('two-handed');
  if (it?.ranged) out.push('ranged');
  if (it?.apsText && !it.noAttack) out.push(it.apsText);
  else if (it?.attackSpeed && it.attackSpeed !== 'normal' && typeof it.attackSpeed === 'string' && !it.noAttack) out.push(`${it.attackSpeed} attacks`);
  if (it?.block) out.push(`blocks ${whole(it.block)}`);
  return out.join(' · ');
}
/** Totals for a choice: { armour, dmg: [lo, hi] | null }. */
export function kitTotals(gear) {
  let armour = 0; for (const it of Object.values(gear || {})) armour += it?.armor || 0;
  return { armour, dmg: gear?.weapon?.dmg || null };
}

// ---- T7: a second two-hander in the off hand ---------------------------------------------------------------
export const DUAL_2H_PERK = 'doubled_grasp';
/** Does this character own the perk that lets a two-hander sit in each hand? `you` = joined.you. */
export function hasDual2h(you) {
  if (!you) return false;
  if (you.dual2h || you.doubleGrip || you.flags?.doubleGrip) return true;
  const p = you.perks;
  const ids = Array.isArray(p) ? p : p && typeof p === 'object' ? (Array.isArray(p.taken) ? p.taken : Array.isArray(p.nodes) ? p.nodes : Object.keys(p)) : [];
  return ids.some(id => String(id).endsWith(':' + DUAL_2H_PERK) || String(id) === DUAL_2H_PERK);
}
/**
 * May `item` go in the off hand next to what is worn? Returns null (yes) or the plain reason why not.
 * A shield / focus / quiver is an off-hand item already; a one-handed weapon needs `offHandOk`; a two-hander needs the perk.
 */
export function offhandRefusal(item, equipment = {}, { dual2h = false } = {}) {
  if (!item) return 'Nothing to hold.';
  const main = equipment?.weapon || null;
  const isWeapon = item.type === 'weapon' || item.slot === 'mainhand' || item.slot === 'weapon';
  if (!isWeapon) {
    if (item.slot !== 'offhand') return 'That does not go in a hand.';
    if (main?.twoHanded && !item.withTwoHanded && !/quiver/i.test(`${item.baseKey || ''} ${item.name || ''}`)) return `${main.name || 'Your weapon'} needs both hands.`;
    return null;
  }
  if (item.twoHanded) {
    if (!dual2h) return 'A two-handed weapon needs both hands. The Doubled Grasp perk (Perk forest, N) lets you hold one in each hand.';
    if (main && !main.twoHanded) return 'Doubled Grasp holds a two-handed weapon in EACH hand — put a two-hander in your main hand first.';
    if (!main) return 'Put a weapon in your main hand first.';
    return null;
  }
  if (item.offHandOk === false) return `${item.name || 'That weapon'} can only be held in the main hand.`;
  if (item.offHandOk == null && item.ranged) return `${item.name || 'That weapon'} can only be held in the main hand.`;
  if (main?.twoHanded) return `${main.name || 'Your weapon'} needs both hands.`;
  return null;
}

// ---- T11 / T12: events ---------------------------------------------------------------------------------------
export const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** Is the player inside the event's ground? The server's flag wins; else the distance to its ring. */
export function inEvent(ev, me) {
  if (!ev) return false;
  if (typeof ev.inRange === 'boolean') return ev.inRange;
  if (typeof ev.inside === 'boolean') return ev.inside;
  if (!me || !Number.isFinite(ev.x) || !Number.isFinite(ev.z)) return false;
  return Math.hypot(ev.x - me.x, ev.z - me.z) <= (ev.r || 40) + 6;
}
const rewardWords = r => {
  if (!r) return '';
  if (typeof r === 'string') return r;
  if (r.text) return r.text;
  const out = [];
  if (r.xp) out.push(r.xp <= 3 ? `${fmt(r.xp * 100, { decimals: 0 })}% of a level in experience` : `${whole(r.xp)} experience`);
  if (r.gold) out.push(`${whole(r.gold)} gold`);
  for (const i of Array.isArray(r.items) ? r.items : []) out.push(typeof i === 'string' ? i : i?.name || '');
  if (r.item) out.push(typeof r.item === 'string' ? `a ${r.item} item` : r.item.tier ? `a ${rarityWord(r.item.tier).toLowerCase()} item${r.item.chance && r.item.chance < 1 ? ' (a chance)' : ''}` : 'an item');
  for (const c of crateRewards(r)) out.push(c);
  return out.filter(Boolean).join(' · ');
};
/**
 * Merge a server event record (any of zoneEvent.ev / realm.ev / eventFrame, old fields and new) into the tracker's
 * entry. Unknown fields keep their last value, so a bare progress frame never wipes the description.
 */
export function mergeEvent(prev, ev = {}, { state = null, now = Date.now(), scope = null } = {}) {
  const info = ev.info || {};
  const e = { ...(prev || {}) };
  const set = (k, v) => { if (v !== undefined && v !== null && v !== '') e[k] = v; };
  set('key', String(ev.uid ?? ev.id ?? ev.name ?? prev?.key ?? 'event'));
  set('name', String(ev.name || info.name || '').replace(/ — wave .*$/, ''));
  set('what', ev.text || ev.what || info.what || ev.blurb || ev.desc);
  set('scope', scope || ev.scope || (ev.realm === true || ev.kind === 'worldboss' || ev.kind === 'realm' ? 'realm' : ev.realm === false ? 'zone' : null));
  set('kind', ev.kind);
  set('where', ev.where || ev.zoneName);
  set('x', ev.x); set('z', ev.z); set('r', ev.r);
  if (typeof ev.inRange === 'boolean') e.inRange = ev.inRange; else if (typeof ev.inside === 'boolean') e.inRange = ev.inside;
  if (ev.stage && Number.isFinite(ev.stage.of)) e.stage = { n: ev.stage.n || 0, of: ev.stage.of, name: ev.stage.name || '' };
  set('players', ev.players);
  if (Number.isFinite(ev.hp)) e.hp = clamp(ev.hp, 0, 1);
  set('wave', ev.wave); set('waves', ev.waves);
  // the objective: one {text, n, of} — or the first unfinished of a list
  const objs = Array.isArray(ev.objectives) ? ev.objectives : ev.objective ? [ev.objective] : info.objective ? [info.objective] : null;
  if (objs) e.objectives = objs.map(o => ({ text: o.text || 'Objective', n: Number.isFinite(o.n) ? o.n : Number.isFinite(o.done) ? o.done : 0, of: Number.isFinite(o.of) ? o.of : Number.isFinite(o.count) ? o.count : 0, unit: o.unit || '' }));
  else if (Number.isFinite(ev.n) && Number.isFinite(ev.of) && e.objectives?.length) e.objectives = [{ ...e.objectives[0], n: ev.n, of: ev.of }, ...e.objectives.slice(1)];
  else if (!e.objectives && Number.isFinite(ev.waves) && ev.waves > 0) e.wavesOnly = true;
  // time: an end time, or a duration counted from when we first saw it live
  if (Number.isFinite(ev.endsAt)) e.endsAt = ev.endsAt;
  else if (Number.isFinite(ev.leftMs ?? ev.msLeft)) e.endsAt = now + (ev.leftMs ?? ev.msLeft);
  else if (!e.endsAt && state === 'live' && (Number.isFinite(ev.durationMs) || Number.isFinite(info.durationSec))) e.endsAt = now + (ev.durationMs ?? info.durationSec * 1000);
  if (Number.isFinite(ev.startsAt ?? ev.at)) e.at = ev.startsAt ?? ev.at;
  if (ev.state === 'soon' || ev.state === 'live') state = state && ev.state === 'soon' && state === 'live' ? state : ev.state;
  set('reward', rewardWords(ev.rewardText || info.rewardText || ev.reward));
  if (state) e.state = state;
  if (!e.state) e.state = 'live';
  if (!e.since) e.since = now;
  return e;
}
/** The tracker card for one event: every line it shows, as text. */
export function eventLines(e, { now = Date.now(), me = null } = {}) {
  const inside = inEvent(e, me);
  let objective = null;
  const objs = e.objectives || [];
  const cur = objs.find(o => !(o.of > 0 && o.n >= o.of)) || objs[objs.length - 1] || null;
  if (cur) objective = { text: cur.text, n: cur.n, of: cur.of, frac: cur.of > 0 ? clamp(cur.n / cur.of, 0, 1) : null, count: cur.of > 0 ? `${whole(Math.min(cur.n, cur.of))} / ${whole(cur.of)}${cur.unit ? ' ' + cur.unit : ''}` : '' };
  else if (e.waves > 0) objective = { text: e.wave > e.waves ? 'Defeat the leader' : 'Defeat every wave', n: Math.max(0, (e.wave || 1) - 1), of: e.waves, frac: clamp(((e.wave || 1) - 1) / e.waves, 0, 1), count: `wave ${whole(Math.min(e.wave || 1, e.waves))} of ${whole(e.waves)}` };
  else if (Number.isFinite(e.hp) && e.hp < 1) objective = { text: 'Bring it down', n: null, of: null, frac: 1 - e.hp, count: `${fmt((1 - e.hp) * 100, { decimals: 0 })}% done` };
  let time = '';
  if (e.state === 'soon') time = Number.isFinite(e.at) ? (e.at > now ? `Starts in ${mmss(e.at - now)}` : 'Starting…') : 'Starting soon';
  else if (e.state === 'live') time = Number.isFinite(e.endsAt) ? (e.endsAt > now ? `${mmss(e.endsAt - now)} left` : 'Time is up') : '';
  return {
    key: e.key, name: e.name || 'An event', state: e.state, scope: e.scope || 'zone',
    head: e.state === 'offer' ? 'On offer' : e.state === 'soon' ? 'Coming' : e.state === 'won' ? 'Won' : e.state === 'lost' ? 'Failed' : inside ? 'You are in it' : 'Nearby',
    what: e.what || (e.state === 'soon' ? (e.scope === 'realm' ? 'A realm event is gathering. The waystones will carry you to it free once it starts.' : 'Something is about to happen near here.') : ''),
    stage: e.stage && e.stage.of > 1 && e.state === 'live' ? `Stage ${whole(Math.min(e.stage.n || 1, e.stage.of))} of ${whole(e.stage.of)}${e.stage.name ? ' — ' + e.stage.name : ''}` : '',
    objective, time, urgent: e.state === 'live' && Number.isFinite(e.endsAt) && e.endsAt - now < 30000,
    reward: e.reward || '', players: e.players > 1 ? `${whole(e.players)} taking part` : '',
    where: !inside && e.where ? e.where : '', inside, result: e.result || '',
  };
}
/** The one line said when an event ends: won or failed, and what you got. */
export function eventResult(m = {}, name = '') {
  const ev = m.ev || {}, info = ev.info || {}, r = m.result && typeof m.result === 'object' ? m.result : {};
  const verdict = typeof m.result === 'string' ? m.result : null;            // eventDone: 'success' | 'fail'
  const n = name || ev.name || m.name || 'The event';
  const xp = r.xp ?? m.xp, gold = r.gold ?? m.gold;
  const got = [xp ? `${whole(xp)} experience` : '', gold ? `${whole(gold)} gold` : '', ...((r.items || m.items || []).map(i => (typeof i === 'string' ? i : i?.name)).filter(Boolean))].filter(Boolean);
  if (m.called === 'off' || m.why === 'left' || m.why === 'off' || m.why === 'fled') return { won: false, text: `${n} was called off — everyone walked away.`, got: '' };
  const won = verdict ? verdict === 'success' : !!(m.won ?? r.won);
  const said = v => (typeof v === 'string' && v.trim() && !/^(null|undefined)$/i.test(v.trim()) ? v.trim() : '');      // never print a missing line
  const tail = said(m.story) || said(won ? info.onSuccess || ev.onSuccess : info.onFail || ev.onFail) || (won ? '' : m.why === 'time' ? 'Time ran out.' : '');
  if (said(m.got)) return { won, text: `${won ? 'Won' : 'Failed'}: ${n}.${tail ? ' ' + tail : ''}`, got: said(m.got) };      // the server's own sentence (protocol §22)
  return { won, text: `${won ? 'Won' : 'Failed'}: ${n}.${tail ? ' ' + tail : ''}`,
    got: got.length ? (won ? `You got ${got.join(', ')}.` : `You still got ${got.join(', ')}.`) : m.onBody ? 'Your share lies on the body.' : won ? (m.credited === false ? 'You did not take part, so no share this time.' : '') : 'No reward this time.' };
}

// ---- T18: the character sheet ----------------------------------------------------------------------------------
/** A sheet number as text: whole numbers for points, at most two decimals otherwise, the unit after it. */
export function rowText(row) {
  if (!row) return '';
  if (row.text != null && row.value == null) return String(row.text);
  const v = row.value;
  if (Array.isArray(v)) return `${whole(v[0])}–${whole(v[1])}${row.unit ? ' ' + row.unit : ''}`;
  if (!Number.isFinite(v)) return '—';
  const u = row.unit || '';
  const d = u === '%' || u === 's' || u === '/s' || u === 'm' || Math.abs(v) < 10 ? (Number.isInteger(v) ? 0 : Math.abs(v) < 10 ? 2 : 1) : 0;
  const n = fmt(v, { decimals: d });
  return u === '%' ? `${n}%` : u === '/s' ? `${n} / s` : u ? `${n} ${u}` : n;
}
const rowNum = r => (Array.isArray(r?.value) ? (r.value[0] + r.value[1]) / 2 : Number.isFinite(r?.value) ? r.value : Number.isFinite(r?.dps) ? r.dps : null);
/** Every row of a sheet in one list (abilities become rows with value = dps). */
export function sheetRows(sheet) {
  if (!sheet) return [];
  return [...(sheet.core || []), ...(sheet.advanced || []), ...(sheet.abilities || []).map(a => ({ ...a, id: 'ab:' + (a.id ?? a.slot), value: a.dps, unit: '/s' }))];
}
/** id -> { delta, dir: 'up'|'down' (is it good news), text: '+3' } for every row whose number changed between two sheets. */
export function sheetDiff(prev, next) {
  const out = {};
  if (!prev || !next) return out;
  const old = new Map(sheetRows(prev).map(r => [String(r.id), r]));
  for (const r of sheetRows(next)) {
    const o = old.get(String(r.id)); if (!o) continue;
    const a = rowNum(o), b = rowNum(r);
    if (a == null || b == null) continue;
    const d = b - a;
    if (Math.abs(d) < 0.005) continue;
    const u = r.unit || '';
    out[String(r.id)] = { delta: d, dir: (d > 0) !== !!r.lowerIsBetter ? 'up' : 'down', text: `${d > 0 ? '+' : '−'}${fmt(Math.abs(d), { decimals: Math.abs(d) < 10 ? 2 : 1 })}${u === '%' ? '%' : ''}` };
  }
  return out;
}
const SPEED_EVERY = { 'very fast': 0.7, fast: 0.85, normal: 1.0, slow: 1.3, 'very slow': 1.6 };
/**
 * The basic sheet, worked out in the browser from what the server already sent (`you`, worn gear) — shown until the
 * server's full `sheet` arrives. Only numbers the client can honestly add up.
 */
export function basicSheet(you = {}, equipment = {}) {
  const worn = Object.values(equipment || {}).filter(Boolean);
  const armour = worn.reduce((s, it) => s + (it.armor || 0), 0);
  const w = equipment?.weapon || null, off = equipment?.offhand?.dmg && !equipment.offhand.noAttack ? equipment.offhand : null;
  const avg = it => (it?.dmg ? (it.dmg[0] + it.dmg[1]) / 2 : 0);
  const every = it => (Number.isFinite(it?.aps) && it.aps > 0 ? 1 / it.aps : Number.isFinite(it?.every) ? it.every / 1000 : Number.isFinite(it?.attackEvery) ? it.attackEvery : SPEED_EVERY[it?.attackSpeed] || 1);
  const core = [
    { id: 'level', label: 'Level', value: you.level || 1, tip: 'Your level. Each level raises health, mana and what you may wear.' },
    { id: 'hpMax', label: 'Health', value: Math.round(you.hpMax || 0), tip: 'The most health you can have, from your level, your calling and your gear.' },
  ];
  if (you.mpMax > 0) core.push({ id: 'mpMax', label: 'Mana', value: Math.round(you.mpMax), tip: 'The most mana you can have. Skills spend it; it comes back over time.' });
  core.push({ id: 'armour', label: 'Armour', value: armour, tip: `Added up from everything you wear (${worn.filter(i => i.armor).length} pieces). Armour takes a share off physical hits.` });
  if (w?.dmg) {
    core.push({ id: 'weapon', label: 'Weapon damage', value: [w.dmg[0], w.dmg[1]], tip: `The damage range printed on ${w.name || 'your main-hand weapon'}, before your skills and perks.` });
    // Y26: attacks per second, as the weapon's own card says it (the server's sheet row `aps` replaces this one when it arrives)
    if (Number.isFinite(w.aps) && w.aps > 0) core.push({ id: 'aps', label: 'Attacks per second', value: Math.round(w.aps * 100) / 100, tip: `How often ${w.name || 'your weapon'} strikes, before attack-speed bonuses.` });
    const dps = avg(w) / every(w) + (off ? avg(off) / every(off) * 0.5 : 0);
    core.push({ id: 'weaponDps', label: 'Basic attack', value: dps, unit: '/s', tip: `Average weapon damage (${fmt(avg(w))}) divided by the time between swings (${fmt(every(w))} s)${off ? ', plus half of the off-hand weapon the same way' : ''}. Gear only — perks and buffs are not counted here.` });
  } else core.push({ id: 'weapon', label: 'Weapon damage', text: 'Bare hands', tip: 'You hold no weapon.' });
  const stat = {};
  for (const it of worn) for (const a of it.affixes || []) if (a.stat && Number.isFinite(a.value) && !String(a.stat).startsWith('cond_')) stat[a.stat] = (stat[a.stat] || 0) + a.value;
  const advanced = Object.entries(stat).map(([k, v]) => ({ id: 'aff:' + k, label: title(k), value: Math.abs(v) < 1 ? v * 100 : v, unit: Math.abs(v) < 1 ? '%' : '', tip: `Added up from the properties on what you wear.` }));
  return { basic: true, core, advanced, abilities: [] };
}

// ---- T19: feedback -----------------------------------------------------------------------------------------------
/** A small ring of recent lines (client log, errors, system chat). */
export function createLogRing(max = 40, lineMax = 300) {
  const lines = [];
  return {
    push(kind, text) {
      const t = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, lineMax);
      if (!t) return;
      const last = lines[lines.length - 1];
      if (last && last.text === t && last.kind === kind) { last.n++; return; }
      lines.push({ kind, text: t, n: 1 });
      while (lines.length > max) lines.shift();
    },
    list: () => lines.map(l => `[${l.kind}] ${l.text}${l.n > 1 ? ` (x${l.n})` : ''}`),
    clear() { lines.length = 0; },
    get size() { return lines.length; },
  };
}
export const FEEDBACK_MAX = 2000, FEEDBACK_MIN = 10;
/** May this be sent? { ok, why }. */
export function feedbackCheck(kind, text) {
  const t = String(text || '').trim();
  if (kind !== 'bug' && kind !== 'suggestion') return { ok: false, why: 'Pick Suggestion or Bug report.' };
  if (t.length < FEEDBACK_MIN) return { ok: false, why: `Write a little more — at least ${FEEDBACK_MIN} letters.` };
  if (t.length > FEEDBACK_MAX) return { ok: false, why: `That is too long (${t.length} of ${FEEDBACK_MAX}).` };
  return { ok: true, why: '' };
}
/** What a bug report attaches. Everything is rounded and trimmed; nothing private (no token, no email). */
export function feedbackCtx(s = {}, log = []) {
  const r = v => (Number.isFinite(v) ? Math.round(v) : null);
  const o = { char: s.char ?? null, name: s.name || null, cls: s.cls || null, level: s.level || null, province: s.province || null, zone: s.zone || null, room: s.room || null,
    x: r(s.x), z: r(s.z), build: s.build || null, quality: s.quality || null, fps: r(s.fps), rtt: r(s.rtt), screen: s.screen || null, ua: String(s.ua || '').slice(0, 160) || null, log: log.slice(-40) };
  for (const k of Object.keys(o)) if (o[k] === null) delete o[k];
  return o;
}
/** The same thing as lines a player can read before sending. */
export function feedbackPreview(ctx) {
  const out = [];
  if (ctx.name) out.push(`Character: ${ctx.name}${ctx.level ? `, level ${ctx.level}` : ''}${ctx.cls ? ' ' + title(ctx.cls) : ''}`);
  const where = [ctx.zone, ctx.province && title(ctx.province), ctx.room].filter(Boolean).join(' · ');
  if (where || ctx.x != null) out.push(`Where: ${where}${ctx.x != null ? ` at ${ctx.x}, ${ctx.z}` : ''}`);
  const tech = [ctx.build && `build ${ctx.build}`, ctx.quality && `graphics ${ctx.quality}`, ctx.fps != null && `${ctx.fps} frames a second`, ctx.rtt != null && `${ctx.rtt} ms to the server`, ctx.screen].filter(Boolean).join(' · ');
  if (tech) out.push(`Game: ${tech}`);
  if (ctx.ua) out.push(`Browser: ${ctx.ua}`);
  return { lines: out, log: ctx.log || [] };
}

// ---- T20: mail needs bag room ---------------------------------------------------------------------------------------
export const BAG_MAX = 120;
/** { ok, need, free, why } for taking a letter's items into a bag holding `count` of `max`. */
export function bagRoom(count, items, max = BAG_MAX) {
  const need = Array.isArray(items) ? items.length : items | 0, free = Math.max(0, max - count);
  return { ok: need <= free, need, free, why: need <= free ? '' : free === 0 ? `Your bag is full. Make room for ${need} ${need === 1 ? 'item' : 'items'} first.` : `Your bag has room for ${free} more, and this letter holds ${need}. Make room first.` };
}

// ---- T25: angling ------------------------------------------------------------------------------------------------------
/** The tug's settings from the server's `fishTug` (every field optional). */
export function tugParams(m = {}) {
  return { ms: clamp(m.ms ?? 4500, 1500, 12000), band: clamp(m.band ?? 0.3, 0.1, 0.6), pull: clamp(m.pull ?? 0.4, 0, 1), jitter: clamp(m.jitter ?? 0.4, 0, 1), need: clamp(m.need ?? 0.6, 0.1, 1) };
}
/** A fresh tug. The marker starts in the middle of the band. */
export function tugStart(p) { return { t: 0, pos: 0.5, vel: 0, centre: 0.5, drift: 0, inBand: 0, done: false, p }; }
/**
 * One step of the tug. Holding reels (the marker climbs), letting go lets the fish run (it falls); the band the marker
 * must stay in wanders, faster for a harder fish. `rnd` = a 0..1 source. Returns the same state object.
 */
export function tugStep(s, dt, holding, rnd = Math.random) {
  if (s.done) return s;
  const p = s.p;
  dt = Math.min(dt, 0.1);
  // the fish: the band's centre wanders
  s.drift += (rnd() - 0.5) * (0.6 + p.jitter * 3.2) * dt * 6;
  s.drift *= 1 - Math.min(1, dt * 1.5);
  s.centre = clamp(s.centre + s.drift * dt, p.band / 2, 1 - p.band / 2);
  if (s.centre <= p.band / 2 || s.centre >= 1 - p.band / 2) s.drift *= -0.6;
  // the line: reel up against the fish's pull
  const acc = holding ? 2.6 : -(1.5 + p.pull * 2.2);
  s.vel = clamp(s.vel + acc * dt, -1.6, 1.6);
  s.pos += s.vel * dt;
  if (s.pos <= 0) { s.pos = 0; s.vel = 0; } else if (s.pos >= 1) { s.pos = 1; s.vel = 0; }
  if (Math.abs(s.pos - s.centre) <= p.band / 2) s.inBand += dt;
  s.t += dt;
  if (s.t * 1000 >= p.ms) s.done = true;
  return s;
}
/** Share of the time (0..1) the marker stayed in the band, and how tight the line is right now (0 slack .. 1 about to snap). */
export const tugHeld = s => (s.t > 0 ? clamp(s.inBand / s.t, 0, 1) : 1);
export const tugTension = s => clamp(0.5 + (s.pos - s.centre) / Math.max(0.05, s.p.band) * 0.5, 0, 1);

/** The Catch tab: species grouped by zone (water kind when a fish has no zone), caught ones with count and best size. */
export function catchRows(data = {}, angling = {}, zoneName = k => k) {
  const caught = angling.catches || {}, legends = new Set(angling.legends || []);
  const WATER = { river: 'Rivers', lake: 'Lakes', marsh: 'Marshes', coast: 'The coast' };
  const groups = new Map();
  const add = (g, row) => { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(row); };
  const waters = f => [].concat(f.water || []).filter(Boolean);
  for (const f of data.fish || []) {
    const c = caught[f.id];
    const row = { id: f.id, name: c ? f.name : '???', known: !!c, rarity: f.rarity || 'common', n: c?.n || 0, best: c?.best ?? null, bestText: c?.best != null ? `${fmt(c.best, { decimals: 1 })} cm` : '',
      hint: c ? (f.desc || f.text || '') : [waters(f).map(w => (WATER[w] || title(w)).toLowerCase()).join(' or '), f.time && f.time !== 'any' ? `at ${f.time}` : '', Array.isArray(f.bands || f.band) ? `level ${(f.bands || f.band)[0]}–${(f.bands || f.band)[1]} lands` : '', f.pool ? 'fish pools only' : ''].filter(Boolean).join(' · '), where: c?.zone ? zoneName(c.zone) : '' };
    const zs = Array.isArray(f.zones) && f.zones.length ? f.zones.map(zoneName) : waters(f).map(w => WATER[w] || title(w));
    for (const g of zs.length ? zs : ['Anywhere']) add(g, row);
  }
  const legendRows = (data.legends || (data.fish || []).filter(f => f.legend)).map(f => {
    const got = legends.has(f.id) || !!caught[f.id];
    return { id: f.id, name: got ? f.name : 'An unknown legend', known: got, zone: f.zone ? zoneName(f.zone) : '', title: got ? f.title || '' : '', best: caught[f.id]?.best ?? null, bestText: caught[f.id]?.best != null ? `${fmt(caught[f.id].best, { decimals: 1 })} cm` : '',
      hint: got ? (f.desc || f.text || '') : [f.zone ? `Somewhere in ${zoneName(f.zone)}` : '', f.water ? (WATER[[].concat(f.water)[0]] || '').toLowerCase() : '', f.time && f.time !== 'any' ? `at ${f.time}` : '', f.skill ? `angling ${f.skill}` : ''].filter(Boolean).join(' · ') };
  });
  const total = (data.fish || []).length, found = (data.fish || []).filter(f => caught[f.id]).length;
  let biggest = null;
  for (const f of [...(data.fish || []), ...(data.legends || [])]) { const c = caught[f.id]; if (c?.best != null && (!biggest || c.best > biggest.best)) biggest = { name: f.name, best: c.best, text: `${f.name}, ${fmt(c.best, { decimals: 1 })} cm` }; }
  return { groups: [...groups.entries()].map(([name, rows]) => ({ name, rows, found: rows.filter(r => r.known).length })), legends: legendRows, total, found, biggest, legendsFound: legendRows.filter(l => l.known).length };
}
/** The angling skill line: "Angling 12 / 100 — 30 of 80 to the next". */
export function anglingText(a = {}) {
  const lv = a.level ?? a.skill ?? 1, max = a.max || 100;
  return { level: lv, max, frac: a.next > 0 ? clamp((a.xp || 0) / a.next, 0, 1) : lv >= max ? 1 : 0, text: `Angling ${whole(lv)} / ${whole(max)}`, sub: lv >= max ? 'As good as it gets.' : a.next > 0 ? `${whole(a.xp || 0)} of ${whole(a.next)} to the next point` : 'Rises with every catch.' };
}
/** Cooking rows: what each recipe needs against what the bag holds. `count(id)` = how many of that fish/item you carry. */
export function cookRows(recipes = [], count = () => 0, skill = 1, names = {}) {
  return recipes.map(r => {
    const needs = (r.needs || []).map(n => { const id = n.id || n.fish || n.tag, want = n.n ?? n.count ?? 1, have = Number.isFinite(n.have) ? n.have : count(id, !!n.tag && !n.fish && !n.id); return { id, name: n.name || names[id] || (n.tag ? `any ${String(n.tag).replace(/_/g, ' ')}` : title(id)), want, have, ok: have >= want }; });
    const low = (r.skill || 0) > skill && r.can !== true;
    const can = typeof r.can === 'boolean' ? r.can : needs.every(n => n.ok) && !low;
    const times = low || !needs.length ? 0 : Math.min(...needs.map(n => Math.floor(n.have / Math.max(1, n.want))));
    return { id: r.id, name: r.name || title(r.id), text: r.makes?.text || r.desc || '', needs, can, times: can ? Math.max(1, times) : 0, why: can ? '' : r.why && typeof r.why === 'string' && /\s/.test(r.why) ? r.why : low ? `Needs angling ${r.skill}.` : `You lack ${needs.filter(n => !n.ok).map(n => `${n.want - n.have} ${n.name}`).join(', ')}.` };
  });
}
