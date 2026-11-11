// The wire between a browser and the Rogueloot room server. JSON frames { t: type, ... }. Pure, shared by both sides.
export const PROTOCOL = 1;
export const MAX_FRAME = 64 * 1024;            // a character sheet with a full stash fits easily
export const SNAP_EVERY = 2;                    // snapshots every 2nd sim step (10 Hz at 20 Hz)
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';  // no I, L, O: they look like 1 and 0
/** Messages a browser may send, and how many of each per second (token bucket). */
export const LIMITS = { hello: 2, create: 1, join: 2, leave: 2, input: 40, ping: 4, chat: 3, list: 2, host: 4, act: 16 };

export function parseFrame(text) {
  if (typeof text !== 'string' || text.length > MAX_FRAME) return { bad: 'size' };
  let msg; try { msg = JSON.parse(text); } catch { return { bad: 'json' }; }
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string' || !(msg.t in LIMITS)) return { bad: 'type' };
  return { msg };
}
export function createBuckets(now) {
  const b = {};
  return { take(t) { const r = LIMITS[t] || 1, n = now(), k = b[t] || (b[t] = { tok: r, at: n }); k.tok = Math.min(r, k.tok + (n - k.at) / 1000 * r); k.at = n; if (k.tok < 1) return false; k.tok -= 1; return true; } };
}
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
export function newCode(rand, taken) {
  for (let i = 0; i < 500; i++) { let c = ''; for (let j = 0; j < 4; j++) c += CODE_LETTERS[Math.floor(rand() * CODE_LETTERS.length)]; if (!taken(c)) return c; }
  return null;
}
