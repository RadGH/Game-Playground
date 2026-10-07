// Menu-bar badges (play-test 6, U1): a red badge counts ONLY things you have not seen yet, and clears when you see them.
//   friends   a friend who came online, or a new name on your list, since you last had the Friends tab open
//   mail      unread letters (the server's count — it re-sends it after every read / take / delete)
//   bag       items that arrived since you last had the bag open
// The Party button shows the sum of its tabs (friends + mail + guild). It never shows "how many are in your party" or
// "how many friends are online" — those are facts, not news; they live in the window titles.
// Skills / perks keep a QUIET gold number (points waiting to be spent): that is a to-do, not news, and is drawn as one.
//
//   import { UNSEEN } from './ui/unseen.js';
//   UNSEEN.add('friends', 'on:17');  UNSEEN.set('mail', 2);  UNSEEN.seen('friends');  UNSEEN.count('friends');
// The pure part (createUnseen) is tested in tests/D/pt6.test.js.

/** Groups of unseen things: a group is a set of keys (so the same friend coming online twice counts once) or a plain number. */
export function createUnseen() {
  const sets = new Map(), nums = new Map(), fns = new Set();
  const fire = () => { for (const f of fns) { try { f(); } catch { /* a badge must never break its caller */ } } };
  return {
    add(group, key) { const s = sets.get(group) || sets.set(group, new Set()).get(group); const n = s.size; s.add(String(key)); if (s.size !== n) fire(); },
    drop(group, key) { if (sets.get(group)?.delete(String(key))) fire(); },
    /** A count the server owns (unread mail). */
    set(group, n) { const v = Math.max(0, Math.round(Number(n) || 0)); if ((nums.get(group) || 0) !== v) { nums.set(group, v); fire(); } },
    /** You looked: everything in the group is seen. */
    seen(group) { const had = (sets.get(group)?.size || 0); sets.get(group)?.clear(); if (had) fire(); },
    count(group) { return (sets.get(group)?.size || 0) + (nums.get(group) || 0); },
    total(groups) { return groups.reduce((s, g) => s + this.count(g), 0); },
    onChange(fn) { fns.add(fn); return () => fns.delete(fn); },
    reset() { sets.clear(); nums.clear(); fire(); },
  };
}
/** The text a badge shows: nothing for zero, "99+" past 99. */
export const badgeText = n => (n > 99 ? '99+' : n > 0 ? String(n) : '');

export const UNSEEN = createUnseen();
const PARTY_TABS = ['friends', 'mail', 'guild'];
/** Paint every badge that is fed from here. */
export function paintBadges(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return;
  const put = (id, n) => { const b = doc.getElementById(id)?.querySelector('b'); if (b && b.textContent !== badgeText(n)) b.textContent = badgeText(n); };
  put('menu-friends', UNSEEN.count('friends'));
  put('menu-mail', UNSEEN.count('mail'));
  put('menu-guild', UNSEEN.count('guild'));
  put('party-btn', UNSEEN.total(PARTY_TABS));
  put('bag-btn', UNSEEN.count('bag'));
  doc.getElementById('menu-mail')?.classList.toggle('alert', UNSEEN.count('mail') > 0);
}
UNSEEN.onChange(() => paintBadges());
