// Password hashing for claimed accounts (stream A, PLAN §9.4): scrypt from Node's own crypto — slow on
// purpose (N=2^15, r=8, p=1: ~32 MB and tens of ms a hash), run on libuv's thread pool so the game tick never
// waits for it. Stored as "scrypt$N$r$p$saltHex$hashHex", so the cost can rise later without breaking
// old hashes. The gateway gets these two functions injected (it stays pure and runs in a Web Worker too).

import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';

export const SCRYPT = Object.freeze({ N: 1 << 15, r: 8, p: 1, keylen: 32 });
const run = (pass, salt, { N, r, p, keylen }) => new Promise((res, rej) =>
  scrypt(String(pass).normalize('NFKC'), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) => (err ? rej(err) : res(key))));

/** -> "scrypt$N$r$p$salt$hash" */
export async function hashPassword(pass, cost = SCRYPT) {
  const salt = randomBytes(16);
  const key = await run(pass, salt, cost);
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('hex'), key.toString('hex')].join('$');
}

/** true when `pass` matches `stored`; constant-time compare; false for anything malformed. */
export async function verifyPassword(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, N, r, p, saltHex, hashHex] = parts;
  const want = Buffer.from(hashHex, 'hex');
  if (!want.length) return false;
  try {
    const key = await run(pass, Buffer.from(saltHex, 'hex'), { N: +N, r: +r, p: +p, keylen: want.length });
    return timingSafeEqual(key, want);
  } catch { return false; }
}

/** A cheaper cost for tests only (the format and the code path are the same). */
export const TEST_COST = Object.freeze({ N: 1 << 10, r: 8, p: 1, keylen: 32 });
export const testHasher = { hashPassword: p => hashPassword(p, TEST_COST), verifyPassword };
