// Potions (ruling 23) and the belt. Pure. A potion item: { uid, base: 'potion', kind: 'health'|'mana', size, n }.
export const POTION_KINDS = ['health', 'mana'];
export const isPotion = it => it?.base === 'potion';
export const potionName = (P, it) => `${P.sizes[it.size]?.name || ''} ${it.kind === 'mana' ? 'Mana' : 'Healing'} Potion${it.n > 1 ? ` ×${it.n}` : ''}`.trim();
export function makePotion(rng, kind, size, n = 1) { return { uid: 'p' + Math.floor(rng() * 2 ** 31).toString(36), base: 'potion', kind, size, n }; }
export function checkPotion(P, it) {
  if (!POTION_KINDS.includes(it.kind) || !P.sizes[it.size]) return { ok: false, why: 'unknown potion' };
  if (!(Number.isInteger(it.n) && it.n >= 1 && it.n <= (P.stack || 4))) return { ok: false, why: 'potion stack' };
  return { ok: true };
}
/** The belt's capacity in slots (from the worn belt's potionSlots; none without a belt). */
export const beltSlots = sheetOrMods => Math.max(0, Math.min(6, sheetOrMods?.potionSlots || 0));
/** Add a potion to the belt (stack onto the same kind+size first, then an empty slot). Returns { belt, rest } (rest = what did not fit). */
export function toBelt(P, belt, slots, it) {
  belt = belt.map(x => x && { ...x }); while (belt.length < slots) belt.push(null);
  let n = it.n;
  for (const s of belt) if (n && s && s.kind === it.kind && s.size === it.size && s.n < P.stack) { const k = Math.min(n, P.stack - s.n); s.n += k; n -= k; }
  for (let i = 0; i < slots && n; i++) if (!belt[i]) { belt[i] = { ...it, n: Math.min(n, P.stack), uid: it.uid + (i ? '-' + i : '') }; n -= belt[i].n; }
  return { belt: belt.slice(0, Math.max(slots, belt.filter(Boolean).length)), rest: n ? { ...it, n } : null };
}
/** Take one potion of a kind from the belt (leftmost first). -> { belt, potion } | null */
export function takeFromBelt(belt, kind) {
  const i = belt.findIndex(s => s && s.kind === kind); if (i < 0) return null;
  const b = belt.map(x => x && { ...x }), p = { ...b[i], n: 1 };
  if (--b[i].n <= 0) b[i] = null;
  return { belt: b, potion: p };
}
