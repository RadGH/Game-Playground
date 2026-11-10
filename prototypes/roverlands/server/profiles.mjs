// Players' saved profiles on the server (Expansion 1 M2, docs/EXPANSION-1.md "Profile"): gold, what they own, job
// levels… One live object per key, shared by every room that player is in, so two rooms can never each count the same
// gold. Keys: `acct:<user id>` (signed in to games.radgh.com — the id came from rgs-api, never from the browser) or
// `dev:<device id>` (a guest: the browser's own lasting id, localStorage `roverlands.device`).
//
// It lives in <data>/profiles.json beside what Knockabout's server/accounts.js keeps there (a signed-in player's name +
// look): one row per key, `{ name?, look?, made?, seen?, rover?: profile }`. accounts.js owns name/look/made/seen and
// hands its rows to `accountsPersist(all)`; this store owns `rover`; ONE writer (flush) merges both and writes the file
// all-or-nothing (temp file + rename), at most every couple of seconds (debounced by the caller's timer).
//
//   const store = createProfileStore({ initial: readJson(file, {}), persist: obj => saveJson(file, obj) });
//   store.get(key, look) -> live profile     store.changed(key)     store.adopt(acctKey, devKey)
//   store.accountsPersist(all)                store.flush()          store.peek(key)
import { newProfile, cleanProfile } from '../js/game/profile.js';

export const PROFILE_KEY = /^(acct|dev|tok|pid):[A-Za-z0-9_-]{1,64}$/;

export function createProfileStore({ initial = {}, persist = null, log = () => {} } = {}) {
  const rover = new Map();
  let acctRows = {};
  for (const [k, row] of Object.entries(initial || {})) {
    if (!row || typeof row !== 'object') continue;
    if (row.rover) rover.set(k, cleanProfile(row.rover));
    const { rover: _, ...rest } = row;
    if (Object.keys(rest).length) acctRows[k] = rest;
  }
  let dirty = false;
  return {
    /** The one live profile for this key (a new player's starting one the first time). */
    get(key, look = null) {
      if (!rover.has(key)) { rover.set(key, newProfile(look)); dirty = true; }
      return rover.get(key);
    },
    changed() { dirty = true; },
    peek: key => rover.get(key) || null,
    has: key => rover.has(key),
    /**
     * First sign-in on this device: if the account has no profile yet, this device's guest profile BECOMES the account's
     * (and the guest one is gone, so the same gold can never be spent twice). -> 'moved' | 'kept' | 'new'.
     */
    adopt(acctKey, devKey) {
      if (rover.has(acctKey)) return 'kept';
      if (devKey && rover.has(devKey)) { rover.set(acctKey, rover.get(devKey)); rover.delete(devKey); dirty = true; log('profile.moved', {}); return 'moved'; }
      return 'new';
    },
    /** accounts.js's persist(): its rows (name + look) are written with ours on the next flush. */
    accountsPersist(all) {
      acctRows = {};
      for (const [k, row] of Object.entries(all || {})) { if (!row || typeof row !== 'object') continue; const { rover: _, ...rest } = row; acctRows[k] = rest; }
      dirty = true;
    },
    flush() {
      if (!dirty || !persist) return false;
      dirty = false;
      const out = {};
      for (const [k, row] of Object.entries(acctRows)) out[k] = { ...row };
      for (const [k, p] of rover) out[k] = { ...(out[k] || {}), rover: p };
      try { persist(out); } catch (e) { dirty = true; log('profile.save.fail', { msg: String(e?.message || e).slice(0, 200) }); return false; }
      return true;
    },
    get size() { return rover.size; },
  };
}
