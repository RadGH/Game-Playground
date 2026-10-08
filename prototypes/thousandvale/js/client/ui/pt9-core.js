// Play-test 9 (stream D-UI) — the pure half: no DOM, no storage. Node-tested in tests/D/pt9.test.js.
//   X4 the barber's button · X6 deleting a character (the typed-name check, the limit line) · X1 the admin's "who is online" rows

// ---------------------------------------------------------------------------------------------- X4: the barber's button
/** Is everything at the barber free? (`used.free`, or every quoted price is 0 — the economy's `barber.mult: 0`.) */
export function barberFree(bill) {
  if (!bill) return false;
  if (bill.free) return true;
  const p = Object.values(bill.prices || {});
  return p.length > 0 && p.every(v => !(v > 0));
}
/** The Save button: "Save (Free)" when it costs nothing, else "Save (N gold)". Short on purpose — the long one scrolled the window sideways. */
export function barberSaveText(cost, bill = null) {
  const c = Math.max(0, Math.round(+cost || 0));
  return barberFree(bill) || c === 0 ? 'Save (Free)' : `Save (${c.toLocaleString('en')} gold)`;
}

// ------------------------------------------------------------------------------------------- X6: deleting a character
/** The typed confirmation: the character's own name, case and outer spaces aside. */
export const nameMatches = (typed, name) => !!name && String(typed || '').trim().toLowerCase() === String(name).trim().toLowerCase();
/** How many characters an account may hold: the server's number, else 20. */
export const charLimit = net => { const n = net?.charLimit ?? net?.limit ?? net?.account?.charLimit; return Number.isFinite(n) && n > 0 ? n : 20; };
/** The line under the list: "3 of 20 characters", and what to do at the limit. */
export function limitText(count, limit) {
  if (count >= limit) return `${count} of ${limit} characters — that is the most an account may hold. Delete one to make room for another.`;
  return `${count} of ${limit} characters`;
}
const DELETE_WHY = { name: 'That is not its name. Type it exactly as it is written above.', online: 'That character is in the world right now. Log it out first.', lease: 'It left the world a moment ago. Try again in a few seconds.',
  missing: 'That character is not on this account any more.', slow: 'One deletion every few seconds. Try again in a moment.' };
export const deleteRefusal = r => r?.msg || DELETE_WHY[r?.why] || 'The character could not be deleted.';
/** What the confirm box warns about. */
export function deleteWarning(c) {
  const what = `${c?.name || 'This character'}${c?.level ? `, level ${c.level}` : ''}`;
  return `${what}, will be gone for good: its gear, gold, quests and friends list. Letters other players sent it that still hold items go back to them. The name stays reserved for a day.`;
}

// ---------------------------------------------------------------------------------------- X1: who is online (admins)
export const ONLINE_SORTS = [['name', 'Name'], ['level', 'Level'], ['where', 'Place'], ['cls', 'Class']];
const nice = s => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
/** A's `adminOnline.list` rows, tidied and sorted. `dir` 1 = ascending (level starts highest first). */
export function onlineRows(list, sort = 'name', dir = 1) {
  const rows = (Array.isArray(list) ? list : []).filter(r => r && r.name).map(r => ({
    char: r.char ?? null, name: String(r.name), level: Math.max(1, r.level | 0), cls: r.clsName || nice(r.cls) || 'Adventurer',
    where: r.where || r.town || r.zoneName || nice(r.zone) || nice(r.province) || 'Somewhere', kind: r.roomKind || '',
    account: r.username || (r.claimed === false ? 'guest' : r.account != null ? `#${r.account}` : ''), admin: !!r.admin, guest: r.claimed === false,
  }));
  const by = { name: (a, b) => a.name.localeCompare(b.name), level: (a, b) => b.level - a.level || a.name.localeCompare(b.name),
    where: (a, b) => a.where.localeCompare(b.where) || a.name.localeCompare(b.name), cls: (a, b) => a.cls.localeCompare(b.cls) || a.name.localeCompare(b.name) }[sort] || (() => 0);
  rows.sort((a, b) => by(a, b) * (dir < 0 ? -1 : 1));
  return rows;
}
/** "3 players online · 2 accounts" */
export function onlineSummary(m) {
  const n = m?.count ?? (m?.list || []).length, a = m?.accounts;
  return `${n} player${n === 1 ? '' : 's'} online${Number.isFinite(a) ? ` · ${a} account${a === 1 ? '' : 's'}` : ''}`;
}
