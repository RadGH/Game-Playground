// Round 11 (owner feedback 2026-10-15) — the pure pieces of the interface work. No DOM, no three: node tests read it.
//
//   mountRows(mounts, pick)     the Mount slot's list: owned mounts fastest first, which one is in the slot
//   mountTip(m, cur)            the HTML card for one mount, compared with the one in the slot
//   speedText(speed)            "35% faster than running"
//   autoTarget(cands, me)       controller attack with no target: what you face first, else the nearest in reach
//   isGreeting(ev)              an NPC's passing remark (goes to chat, never the big banner)
//   bannerWorthy(text, kind)    which lines still deserve the centre-screen banner

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** "35% faster than running" from a mount's speed multiplier (1.35). */
export const speedText = speed => `${Math.round((Math.max(1, +speed || 1) - 1) * 100)}% faster than running`;

/** Owned mounts, fastest first; `on` marks the one in the Mount slot (the picked one, else the fastest). */
export function mountRows(mounts = [], pick = null) {
  const list = (mounts || []).filter(m => m && m.id).slice().sort((a, b) => (b.speed || 0) - (a.speed || 0) || String(a.name).localeCompare(String(b.name)));
  const on = list.find(m => m.id === pick) || list[0] || null;
  return list.map(m => ({ ...m, on: !!on && m.id === on.id }));
}

/** The one in the slot (same rule as the server's `mountBook.best`). */
export const slotMount = (mounts, pick) => mountRows(mounts, pick).find(m => m.on) || null;

const pct = x => `${Math.round(x * 100)}%`;
const signed = (x, unit = '%') => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(Math.round(x))}${unit}`;

/** The card for mount `m`; `cur` = the one in the slot (a different one is compared with it). `saddle` = fitted saddle bags. */
export function mountTip(m, cur = null, { saddle = null } = {}) {
  if (!m) return '<div class="itemtip"><div class="ic-name">Mount</div><div class="ic-dim">You have no mount yet. A stablehand sells them — the Trail Horse is cheap.</div></div>';
  const b = [`<div class="itemtip mount-tip"><div class="ic-name r-normal">${esc(m.name)}</div><div class="ic-base">Mount</div>`];
  b.push(`<div>Rides <b>${esc(speedText(m.speed))}</b></div>`);
  b.push(`<div>Stays in the saddle when hit: <b>${esc(pct(m.calm || 0))}</b> of the time</div>`);
  if (m.desc) b.push(`<div class="ic-lore">${esc(m.desc)}</div>`);
  if (cur && cur.id !== m.id) {
    const ds = ((m.speed || 1) - (cur.speed || 1)) * 100, dc = ((m.calm || 0) - (cur.calm || 0)) * 100;
    b.push(`<div class="ic-compare">Instead of <b>${esc(cur.name)}</b>: <span class="${ds > 0 ? 'up' : ds < 0 ? 'down' : ''}">speed ${esc(signed(ds))}</span> · <span class="${dc > 0 ? 'up' : dc < 0 ? 'down' : ''}">steadiness ${esc(signed(dc))}</span></div>`);
    b.push('<div class="ic-dim">Click to put it in your Mount slot.</div>');
  } else if (cur && cur.id === m.id) b.push('<div class="ic-dim">In your Mount slot: this is the one you call.</div>');
  if (saddle && saddle.slots) b.push(`<div class="ic-status"><b>${esc(saddle.name || 'Saddle bags')}</b>: ${esc(saddle.slots)} more squares in your Equipment and Items tabs.</div>`);
  b.push('</div>');
  return b.join('');
}

/**
 * Round 11 (owner #21, controller): attack pressed with no target. `cands` = [{ id, x, z, hostile, dead, tappable }],
 * `me` = { x, z, yaw }, `reach` = how far counts as "in front of you" (m). Picks the enemy closest to straight ahead
 * inside a 70° cone within `reach + 14` m; else the nearest within `far` m; else null.
 * yaw: 0 faces +z (the game's convention: forward = (sin yaw, cos yaw)).
 */
export function autoTarget(cands = [], me = null, { reach = 2.4, far = 30, cone = 70 } = {}) {
  if (!me) return null;
  const fx = Math.sin(me.yaw || 0), fz = Math.cos(me.yaw || 0);
  const half = (cone / 2) * Math.PI / 180;
  let front = null, fScore = Infinity, near = null, nd = Infinity;
  for (const c of cands) {
    if (!c || c.dead || !c.hostile || c.tappable === false) continue;
    const dx = c.x - me.x, dz = c.z - me.z, d = Math.hypot(dx, dz);
    if (d < nd && d <= far) { nd = d; near = c; }
    if (d < 0.01) { front = c; fScore = -1; continue; }
    const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
    if (ang <= half && d <= reach + 14) { const sc = d + ang * 6; if (sc < fScore) { fScore = sc; front = c; } }
  }
  return front || near || null;
}

/** True for an NPC's passing remark (a greeting, small talk) — chat only, never the centre banner (owner #54). */
export function isGreeting(ev = {}) {
  if (!ev) return false;
  const k = String(ev.kind || ev.k || ev.type || '');
  if (/^(greet|greeting|bark|chatter|ambient|smalltalk|idle)$/i.test(k)) return true;
  return !!(ev.npc && (ev.say || ev.text) && !ev.banner && !ev.important);
}

/** The kinds of lines that still earn the big centre banner: entering a zone, level up, quest done, boss and event calls. */
export const BANNER_KINDS = Object.freeze(['zone', 'level', 'quest', 'boss', 'event', 'raid', 'death', 'system']);
export const bannerWorthy = kind => BANNER_KINDS.includes(String(kind || ''));

/**
 * The damage meter's key for one of OUR side (owner #51). Your entity id changes with every room (dying and waking at the
 * inn, a ship, a dungeon door), so a fight recorded under the old id vanished from a meter that matched "ours" by id.
 * Keys that never change: `ours:self` for you, `ours:p:<name>` for a party member, `ours:<id>` for a pet.
 */
export const OURS = 'ours:';
export function oursKey(id, { selfId = null, partyIds = [], nameOf = () => '' } = {}) {
  const s = String(id);
  if (selfId != null && s === String(selfId)) return OURS + 'self';
  if (partyIds.map(String).includes(s)) { const nm = nameOf(s); if (nm) return OURS + 'p:' + nm; }
  return OURS + s;
}
