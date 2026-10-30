// Cloud saves for a browser-only game (2026-10-23, owner: "use my TV account for the other games - same password,
// different saves"). A game that keeps its saves in localStorage names those keys; while the player is signed in to
// games.radgh.com (shared/rgs-account.js) they are copied to the account (rgs-api table playground.saves, one row per
// game + slot) and brought back on another device. Signed out, nothing happens — the game is exactly as before.
//
//   import { cloudSave } from '../../shared/rgs-cloudsave.js';
//   const cloud = cloudSave({ game: 'farhold', keys: { saves: 'farhold.saves.v1', last: 'farhold.lastSave' },
//                             onRestore: () => location.reload() });
//   cloud.status()         { on, signedIn, state: 'off'|'idle'|'saving'|'saved'|'waiting'|'error', at, message }
//   cloud.onStatus(fn)     called whenever status() changes
//   await cloud.sync()     compare + upload or download now (also runs at sign-in, every minute and when the tab hides)
//   cloud.saveSoon()       the game just saved: upload within a few seconds
//
// Optional, added 2026-10-23 for Farhold and Emberveil 2 (both default to the old behaviour):
//   prefixes: { slot: 'farhold.seen.' }   every localStorage key starting with the prefix travels as ONE slot (a JSON
//                                         object of key -> value). For saves whose key names are made up as you play.
//   canRestore: () => boolean             false while a run is being played: a download (or a conflict question) waits
//                                         instead of replacing saves the running game will write over a moment later.
//                                         Uploads also wait while the account is ahead, so the newer copy is never
//                                         overwritten. status() is 'waiting' with a message saying so.
//   onConflict(q) may resolve to 'cloud', 'local', or anything else to decide later (it is not asked again until
//                                         the page reloads or the player signs in again). q.cloud = { slot: value } is
//                                         the account's copy, so a game can MERGE instead of asking: write the combined
//                                         saves to localStorage and resolve 'local' (Kindlewild, 2026-10-30).
//
// Which copy wins: each browser remembers the cloud copy it last matched (the server's time + a fingerprint of the
// values).
//   - nothing in the cloud yet               -> upload this browser's saves
//   - only the cloud changed since last time -> download (onRestore runs, so the game can re-read its saves)
//   - only this browser changed              -> upload
//   - both changed, or first time on a device that already has its own saves -> ask (onConflict, default a confirm())
// Times are always the SERVER's (the upsert returns updated_at), so a device whose clock is wrong cannot mistake its
// own upload for a newer save from somewhere else.
import { account } from './rgs-account.js';

const MINUTE = 60_000;
const fp = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36) + ':' + s.length; };
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } },
  keys(prefix) { try { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) out.push(k); } return out.sort(); } catch { return []; } },
};
const when = iso => { try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return iso; } };
const ms = iso => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : 0; };
const newest = rows => rows.reduce((m, r) => (ms(r.updated_at) > ms(m) ? r.updated_at : m), '');

export function cloudSave({ game, keys = {}, prefixes = {}, onRestore = () => location.reload(), onConflict = null, canRestore = () => true, device = navigator.userAgent.slice(0, 60) }) {
  if (!/^[a-z0-9-]{1,32}$/.test(game)) throw new Error('cloudSave: bad game id');
  const slots = Object.entries(keys);                        // [[slot, localStorage key], …]
  const groups = Object.entries(prefixes);                   // [[slot, key prefix], …]
  let uid = null;                                            // what this browser last matched is kept per account
  const SYNC = () => `rgs.cloud.${game}.${uid}`;
  const st = { on: true, signedIn: false, state: 'off', at: null, message: '' };
  const subs = new Set();
  const set = patch => { Object.assign(st, patch); for (const f of subs) try { f({ ...st }); } catch {} };
  let busy = null, soon = null, held = false;

  /** slot -> string value (or null) for every named key and every prefix group. */
  function localValues() {
    const out = {};
    for (const [slot, k] of slots) out[slot] = ls.get(k);
    for (const [slot, prefix] of groups) {
      const found = ls.keys(prefix);
      out[slot] = found.length ? JSON.stringify(Object.fromEntries(found.map(k => [k, ls.get(k)]))) : null;
    }
    return out;
  }
  const allSlots = () => [...slots.map(([s]) => s), ...groups.map(([s]) => s)];
  const fpOf = vals => fp(JSON.stringify(allSlots().map(s => vals[s])));
  const localFp = () => fpOf(localValues());
  const hasLocal = () => Object.values(localValues()).some(v => v != null);
  const synced = () => { try { return JSON.parse(ls.get(SYNC()) || 'null'); } catch { return null; } };
  const db = body => account.request('POST', '/db/playground', { table: 'saves', ...body });

  function writeLocal(slot, v) {
    const named = slots.find(([s]) => s === slot);
    if (named) return ls.set(named[1], v);
    const group = groups.find(([s]) => s === slot);
    if (!group) return;
    for (const k of ls.keys(group[1])) ls.set(k, null);
    let obj = null; try { obj = v == null ? null : JSON.parse(v); } catch { obj = null; }
    if (obj && typeof obj === 'object') for (const [k, val] of Object.entries(obj)) if (k.startsWith(group[1])) ls.set(k, val);
  }

  async function cloudRows() {
    const r = await db({ op: 'select', columns: 'slot, state, updated_at, device', filters: [['game', 'eq', game]] });
    if (r.error) throw Object.assign(new Error(r.error.message || 'Cloud saves are not answering'), { code: r.error.code });
    return r.data || [];
  }
  async function upload() {
    set({ state: 'saving', message: 'Saving to your account…' });
    const vals = localValues();
    const rows = allSlots().filter(slot => vals[slot] != null).map(slot => ({ game, slot, state: { v: vals[slot] }, device }));
    let at = '';
    if (rows.length) {
      const r = await db({ op: 'upsert', rows, onConflict: 'user_id,game,slot', returning: true, columns: 'updated_at' });
      if (r.error) throw Object.assign(new Error(r.error.message || 'Could not save to your account'), { code: r.error.code });
      at = newest(r.data || []);
    }
    for (const slot of allSlots()) if (vals[slot] == null) await db({ op: 'delete', filters: [['game', 'eq', game], ['slot', 'eq', slot]] }).catch(() => {});
    // the server's own clock when it can tell us, so a skewed device clock never looks like a newer cloud copy
    if (!at) at = newest(await cloudRows().catch(() => [])) || new Date().toISOString();
    ls.set(SYNC(), JSON.stringify({ at, fp: fpOf(vals) }));
    set({ state: 'saved', at, message: 'Saved to your account' });
  }
  function download(rows) {
    const by = Object.fromEntries(rows.map(r => [r.slot, r]));
    for (const slot of allSlots()) writeLocal(slot, by[slot] ? by[slot].state?.v ?? null : null);
    const at = newest(rows);
    ls.set(SYNC(), JSON.stringify({ at, fp: localFp() }));
    set({ state: 'saved', at, message: 'Loaded the saves from your account' });
    try { onRestore(); } catch (e) { console.error(e); }
  }
  function wait(text) { set({ state: 'waiting', message: text }); }
  async function ask(rows, latest) {
    if (held) return wait('Your account and this device have different saves. Nothing was changed.');
    const from = rows.find(r => r.updated_at === latest)?.device || 'another device';
    const q = { cloudAt: latest, cloudDevice: from, cloud: Object.fromEntries(rows.map(r => [r.slot, r.state?.v ?? null])), text: `Your account has saves from ${when(latest)} (${from}).\n\nOK = use your account's saves on this device.\nCancel = keep this device's saves and copy them to your account.` };
    const pick = onConflict ? await onConflict(q) : (window.confirm(q.text) ? 'cloud' : 'local');
    if (pick === 'cloud') {
      // the player may have started a run while the question was up
      if (!canRestore()) return wait('Your account has newer saves. They will load next time you are on the title screen.');
      return download(rows);
    }
    if (pick === 'local') return upload();
    held = true;
    return wait('Your account and this device have different saves. Nothing was changed.');
  }

  async function run() {
    const u = await account.user().catch(() => null);
    set({ signedIn: !!u }); uid = u ? u.id : null;
    if (!u) { set({ state: 'off', message: 'Sign in to keep your saves in your account' }); return; }
    const rows = await cloudRows();
    const latest = newest(rows);
    const last = synced(), nowFp = localFp();
    const localChanged = !last || last.fp !== nowFp, cloudChanged = !!latest && (!last || ms(latest) > ms(last.at));
    const later = 'Your account has newer saves. They will load next time you are on the title screen.';
    if (!rows.length) return hasLocal() ? upload() : set({ state: 'idle', message: 'Nothing saved yet' });
    if (!last) {                                              // first time on this device
      if (!canRestore()) return wait(later);
      return hasLocal() ? ask(rows, latest) : download(rows);
    }
    if (cloudChanged && !localChanged) return canRestore() ? download(rows) : wait(later);
    if (localChanged && !cloudChanged) return upload();
    if (localChanged && cloudChanged) return canRestore() ? ask(rows, latest) : wait(later);
    set({ state: 'saved', at: last.at, message: 'Your saves are in your account' });
  }
  function sync() {
    if (busy) return busy;
    busy = run().catch(e => set({ state: 'error', message: e.message || 'Cloud saves are not working right now' })).finally(() => { busy = null; });
    return busy;
  }
  function saveSoon() {
    if (!st.signedIn) return;
    clearTimeout(soon); soon = setTimeout(sync, 4000);
  }

  account.onChange(u => { held = false; set({ signedIn: !!u }); if (u) sync(); else { uid = null; set({ state: 'off', message: 'Sign in to keep your saves in your account' }); } });
  const tick = setInterval(() => { if (st.signedIn && uid && (synced()?.fp !== localFp() || st.state === 'waiting')) sync(); }, MINUTE);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && st.signedIn && uid && synced()?.fp !== localFp()) sync(); });
  sync();

  return {
    status: () => ({ ...st }),
    onStatus(fn) { subs.add(fn); fn({ ...st }); return () => subs.delete(fn); },
    sync, saveSoon,
    stop() { clearInterval(tick); clearTimeout(soon); },
  };
}

/** "saved 2 min ago" for a status line, from an ISO time. */
export function agoText(iso) {
  const t = ms(iso);
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return when(iso);
}

/** The one-line status both games show: "Saves kept in your account · saved 2 min ago" / "Sign in to keep…". */
export function statusLine(s) {
  if (!s || !s.signedIn) return 'Sign in to keep your saves in your account';
  if (s.state === 'saving') return 'Saving to your account…';
  if (s.state === 'error') return `Cloud saves: ${s.message || 'not working right now'} (your saves are still on this device)`;
  if (s.state === 'waiting') return s.message;
  if (s.state === 'idle') return 'Saves kept in your account · nothing saved yet';
  if (s.state === 'saved' && s.at) return `Saves kept in your account · saved ${agoText(s.at)}`;
  return 'Saves kept in your account';
}
