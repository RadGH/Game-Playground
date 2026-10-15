// Play-test 2 interface logic with no DOM and no Three.js (stream D-UI), so tests/D/pt2.test.js can drive it:
//   Q2  the right-click menu's entries for an entity, who may be followed, and the follow step
//   Q4  loot thresholds (which rarities are locked behind a Need / Greed / Skip roll) and the roll timer
//   Q6  the area banner: ONE banner area with a hierarchy (province > zone > place) and a short queue
//   Q11 shop prices and refusals
//   Q12 which ring slot a ring goes in
//   Q14 the trade window's state, read for the two halves
//   Q15 settings: defaults, cleaning a saved blob
//   Q24 the experience text

import { RARITY_RANK, slotOf } from './inv-core.js';

// ---- Q2: the context menu ------------------------------------------------------------------------------
/**
 * The entries for a right-click on an entity. `a` = { id, kind: player|npc|monster, hostile, dead, name, role, pet },
 * ctx = { selfId, inParty, isFriend, leader, canTrade, tradeFriendsOnly }. Returns [{ id, label, disabled?, why? }].
 */
export function contextItems(a, ctx = {}) {
  if (!a) return [];
  const out = [{ id: 'target', label: 'Target' }];
  const friendly = !a.hostile;
  if (a.kind === 'player' && a.id !== ctx.selfId) {
    out.push({ id: 'follow', label: 'Follow', ...(a.dead ? { disabled: true, why: 'They have fallen.' } : {}) });
    out.push({ id: 'inspect', label: 'Inspect' });
    out.push({ id: 'whisper', label: 'Whisper' });
    if (!ctx.inParty || ctx.leader) out.push({ id: 'invite', label: 'Invite to party' });
    out.push({ id: 'trade', label: 'Trade', ...(a.dead ? { disabled: true, why: 'They have fallen.' } : {}) });
    out.push(ctx.isFriend ? { id: 'unfriend', label: 'Remove friend' } : { id: 'friend', label: 'Add friend' });
  } else if (a.kind === 'npc' && !a.pet) {
    out.push({ id: 'talk', label: 'Talk' });
    if (friendly && !a.dead) out.push({ id: 'follow', label: 'Follow' });
    out.push({ id: 'inspect', label: 'Inspect' });
  } else {
    if (friendly && !a.dead) out.push({ id: 'follow', label: 'Follow' });
    if (a.hostile && !a.dead) out.push({ id: 'attack', label: 'Attack' });
    if (a.dead && a.loot) out.push({ id: 'loot', label: 'Loot' });
    out.push({ id: 'inspect', label: 'Inspect' });
  }
  return out;
}

/** May you /follow this? Allies and neutrals only — never an enemy, never the dead, never yourself. Returns null = yes, else why not. */
export function followRefusal(a, selfId = null) {
  if (!a) return 'Nobody to follow.';
  if (a.id === selfId) return 'You cannot follow yourself.';
  if (a.hostile) return 'You cannot follow an enemy.';
  if (a.dead) return `${a.name || 'They'} cannot be followed now.`;
  return null;
}

/**
 * One step of following: walk toward a spot `gap` metres behind the leader, stop inside it. Returns { mx, mz } (unit
 * or zero) — `far` when the leader is out of reach (the follow ends).
 */
export function followStep(self, lead, { gap = 2.6, maxRange = 60 } = {}) {
  if (!self || !lead) return { mx: 0, mz: 0, far: true };
  const dx = lead.x - self.x, dz = lead.z - self.z, d = Math.hypot(dx, dz);
  if (d > maxRange) return { mx: 0, mz: 0, far: true };
  if (d <= gap) return { mx: 0, mz: 0, far: false };
  return { mx: dx / d, mz: dz / d, far: false, d };
}

/** The /follow argument: a name (case-insensitive) among the actors you can see, else the target. */
export function findByName(list, name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return null;
  return list.find(a => String(a.name || '').toLowerCase() === k) || list.find(a => String(a.name || '').toLowerCase().startsWith(k)) || null;
}

// ---- Q4: loot thresholds and rolls ------------------------------------------------------------------------
/** The rarities a party leader may pick as the threshold (lowest first). Default 'rare'. */
export const LOOT_TIERS = [            // C's js/rules/loot-rules.js THRESHOLD_LABELS ('epic' is an alias of legendary: not shown)
  { id: 'magic', label: 'Magic or better' },
  { id: 'rare', label: 'Rare or better' },
  { id: 'legendary', label: 'Legendary or better' },
  { id: 'unique', label: 'Set pieces and uniques only' },
];
export const DEFAULT_THRESHOLD = 'rare';
/** Does an item go to a roll under this threshold? */
export function needsRoll(item, threshold = DEFAULT_THRESHOLD) {
  const r = RARITY_RANK[item?.setId ? 'set' : item?.rarity || 'normal'] ?? 0;
  const t = RARITY_RANK[threshold] ?? RARITY_RANK.rare;
  return r >= t;
}
export const ROLL_CHOICES = [
  { id: 'need', label: 'Need', tip: 'You will wear it — Need beats Greed.' },
  { id: 'greed', label: 'Greed', tip: 'You would take it — rolls against the other Greeds.' },
  { id: 'skip', label: 'Skip', tip: 'Let someone else have it.' },
];
/** Seconds left on a roll (0 when it has run out). */
export const rollLeft = (roll, now) => Math.max(0, ((roll.until ?? (roll.at + (roll.ms || 30000))) - now) / 1000);
/** "Need — Aldra rolled 87" style lines for chat, winner last. */
export function rollLines(r) {
  const word = { need: 'Need', greed: 'Greed', skip: 'Skip', pass: 'Skip' };
  const lines = (r.results || []).map(x => (x.choice === 'skip' || x.choice === 'pass' ? `${x.name} skipped ${r.item?.name || 'it'}.` : `${word[x.choice] || x.choice}: ${x.name} rolled ${x.n} for ${r.item?.name || 'it'}.`));
  lines.push(r.winner ? `${r.winner.name} won ${r.item?.name || 'the item'}.` : `Everyone skipped ${r.item?.name || 'it'} — it stays on the body.`);
  return lines;
}

// ---- Q6: the area banner --------------------------------------------------------------------------------
/** Province > zone > place. A bigger area replaces a smaller one at once; a smaller one waits its turn. */
export const AREA_RANK = { province: 3, zone: 2, room: 2, dungeon: 2, place: 1 };
export const BANNER_MS = 3400;
/**
 * The banner area's state machine (pure: pass `now`). state = { cur: {level,name,sub,until}|null, queue: [] }.
 * push(): same name as showing/queued -> ignored; higher-or-equal rank than showing -> replaces it (the old one is
 * dropped, not stacked); lower rank -> queued (max 2, oldest dropped). tick(): when cur runs out, the next comes up.
 */
export function bannerState() { return { cur: null, queue: [] }; }
export function bannerPush(st, b, now, ms = BANNER_MS) {
  const item = { level: b.level || 'zone', name: String(b.name || ''), sub: b.sub || '', rank: AREA_RANK[b.level] || 2 };
  if (!item.name) return st;
  if (st.cur && st.cur.until > now && st.cur.name === item.name) return st;
  if (st.queue.some(q => q.name === item.name)) return st;
  if (!st.cur || st.cur.until <= now || item.rank >= st.cur.rank) {
    // a bigger (or equal) area: replaces the one on screen. Anything queued that is smaller than it is now old news
    st.queue = st.queue.filter(q => q.rank > item.rank);
    st.cur = { ...item, until: now + ms };
  } else {
    st.queue.push(item);
    while (st.queue.length > 2) st.queue.shift();
  }
  return st;
}
export function bannerTick(st, now, ms = BANNER_MS) {
  if (st.cur && st.cur.until <= now) {
    const next = st.queue.shift();
    st.cur = next ? { ...next, until: now + ms } : null;
    return true;
  }
  return false;
}

// ---- Q11: shops -------------------------------------------------------------------------------------------
/** What the shop pays for an item (the server's own `sell` price wins; else a share of its price/value). */
export function sellPrice(item, rate = 0.25) {
  if (!item) return 0;
  if (Number.isFinite(item.sell)) return Math.max(0, Math.floor(item.sell));
  if (Number.isFinite(item.value)) return Math.max(0, Math.floor(item.value));      // protocol v6: a bag item's `value` = gold you get
  const v = item.price ?? item.basePrice ?? 0;
  return Math.max(item.kind === 'junk' ? 1 : 0, Math.floor(v * rate));
}
/** null = you can buy it; else why not. */
export function buyRefusal(row, gold, bagFree = 1) {
  if (!row) return 'Gone.';
  if (row.stock === 0) return 'Sold out.';
  if ((row.price || 0) > gold) return `You need ${row.price - gold} more gold.`;
  if (bagFree <= 0) return 'Your bag is full.';
  return null;
}
export const SHOP_WHY = { gold: 'You cannot afford that.', bagFull: 'Your bag is full.', far: 'Step closer to the counter.', stock: 'Sold out.', item: 'They will not take that.', worn: 'Take it off first.', trade: 'Finish your trade first.', locked: 'That item is in a trade.', notFound: 'That is gone.', none: 'Nothing needs mending.' };

// ---- Q12: rings -------------------------------------------------------------------------------------------
/** The slot to send for a click-to-wear: a second ring goes in the EMPTY ring slot, never over the first. */
export function wearSlot(item, equipment = {}) {
  const s = slotOf(item);
  if (s === 'ring' || s === 'ring2') {
    if (!equipment.ring) return 'ring';
    if (!equipment.ring2) return 'ring2';
    return 'ring';
  }
  return null;
}

// ---- Q14: trade -------------------------------------------------------------------------------------------
/** The status line under each half and the main button's label/state. */
export function tradeView(t) {
  if (!t) return null;
  const you = t.you || {}, them = t.them || {};
  const both = you.locked && them.locked;
  return {
    youSay: you.confirmed ? 'Accepted' : you.locked ? 'Locked in' : 'Choosing…',
    themSay: them.confirmed ? 'Accepted' : them.locked ? 'Locked in' : 'Choosing…',
    button: !you.locked ? { op: 'lock', label: 'Lock offer' } : !both ? { op: null, label: 'Waiting for them to lock…' } : you.confirmed ? { op: null, label: 'Waiting for them to accept…' } : { op: 'confirm', label: 'Accept trade' },
    canEdit: !you.locked,
  };
}
export const TRADE_WHY = { cancelled: 'The trade was cancelled.', tradeFar: 'You walked too far apart.', tradeFailed: 'The trade did not go through.', bagFull: 'Someone\'s bag is full.', gone: 'They left.', friendsOnly: 'They only trade with friends.', busy: 'They are already trading.', far: 'Stand closer (10 m) to trade.' };

// ---- Q15: settings ----------------------------------------------------------------------------------------
export const SETTINGS_DEFAULTS = { quality: 'auto', master: 0.8, music: 0.6, sfx: 0.8, ui: 1, tradeFriends: false, showGear: true, showHelm: true, meter: false, shareLocation: true, fx: 'enhanced' };   // meter: play-test 8 W21, off by default
export const QUALITIES = [{ id: 'auto', label: 'Automatic' }, { id: 'low', label: 'Low' }, { id: 'medium', label: 'Medium' }, { id: 'high', label: 'High' }];
/** A saved settings blob, cleaned: unknown keys dropped, numbers clamped, booleans forced. */
export function cleanSettings(raw) {
  const s = { ...SETTINGS_DEFAULTS };
  if (!raw || typeof raw !== 'object') return s;
  if (QUALITIES.some(q => q.id === raw.quality)) s.quality = raw.quality;
  for (const k of ['master', 'music', 'sfx']) if (Number.isFinite(raw[k])) s[k] = Math.max(0, Math.min(1, raw[k]));
  if (Number.isFinite(raw.ui)) s.ui = Math.max(0.8, Math.min(1.4, Math.round(raw.ui * 20) / 20));
  for (const k of ['tradeFriends', 'showGear', 'showHelm', 'meter', 'shareLocation']) if (typeof raw[k] === 'boolean') s[k] = raw[k];
  if (['enhanced', 'standard', 'reduced', 'off'].includes(raw.fx)) s.fx = raw.fx;      // Spell effects (fx-level.js), 2026-10-14
  return s;
}

// ---- Q24: experience ----------------------------------------------------------------------------------------
export function xpText(xp, next, level) {
  const f = next > 0 ? Math.max(0, Math.min(1, xp / next)) : 0;
  return { frac: f, text: `${Math.round(xp).toLocaleString()} / ${Math.round(next).toLocaleString()} XP (${Math.floor(f * 100)}%)`, tip: `Level ${level}: ${Math.round(xp).toLocaleString()} of ${Math.round(next).toLocaleString()} experience — ${Math.max(0, Math.round(next - xp)).toLocaleString()} to level ${level + 1}` };
}

// ---- Q25: class names -------------------------------------------------------------------------------------
export const className = (id, names = null) => (names && names[id]) || String(id || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Adventurer';

// ---- Q22: show equipment ----------------------------------------------------------------------------------
/** Worn armour pieces that "Show equipment" hides (weapons and the off hand stay: they are part of fighting). */
export const ARMOUR_SLOTS = ['head', 'chest', 'legs', 'feet', 'hands', 'necklace', 'ring', 'ring2', 'cape'];
/** The gear to DRAW for a character with these display prefs (the worn gear itself never changes). */
export function gearShown(gear, { showGear = true, showHelm = true } = {}) {
  if (!gear || (showGear && showHelm)) return gear;
  const out = { ...gear };
  if (!showGear) for (const k of ARMOUR_SLOTS) delete out[k];
  if (!showHelm) delete out.head;
  return out;
}

// ---- R3: an event that has not started says WHEN, never just "starting soon" ------------------------------
/** "Starts in 1:23" from a wall-clock start time; "Starts when someone comes near" when it waits for a player. */
export function soonText(at, now = Date.now(), { near = false } = {}) {
  if (!Number.isFinite(at)) return near ? 'Starts as you arrive' : 'Starts when someone comes near';
  const s = Math.max(0, Math.ceil((at - now) / 1000));
  if (s <= 0) return 'Starting now';
  return s >= 60 ? `Starts in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `Starts in ${s} s`;
}
/** R3: the line for an event in each state (protocol §19: ready | soon | live | cooldown). */
export function eventStateText(e, now = Date.now()) {
  if (e.state === 'soon') return soonText(e.at, now);
  if (e.state === 'cooldown') { if (!Number.isFinite(e.at)) return 'Resting'; const s = Math.max(0, Math.ceil((e.at - now) / 1000)); return s ? `Ready again in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Ready again'; }
  if (e.state === 'live') return 'Happening now';
  return 'Comes alive when you come near';
}

/** S3: the rows a shop really sells — a named item or a mount; a row that is only its category label is never for sale. */
export const saleRows = stock => (stock || []).filter(r => (r.mount && (r.mount.id || r.mount === true) && (r.item?.name || r.mount.name)) || (r.item && typeof r.item.name === 'string' && r.item.name.trim() && r.item.name !== r.label));
