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
// Added 2026-11-16 (owner lost a day of Voidwright to a bare "OK = account / Cancel = this device" box):
//   describe(values) → { playedAt?: ms, lines: [string] }   the game's own summary of a set of saves ({ slot: value },
//                                         this device's or the account's) so the choice shows real stats per side.
//   The default question is now an in-game dialog with both copies side by side (last played, which device, the
//   game's lines), never a browser confirm(). Whichever copy gets replaced is kept as a backup in this browser:
//   cloud.backup() → { kind: 'device'|'account', at, lines } | null, cloud.restoreBackup() puts it back.
//
// Which copy wins: each browser remembers the cloud copy it last matched (the server's time + a fingerprint of the
// values).
//   - nothing in the cloud yet               -> upload this browser's saves
//   - only the cloud changed since last time -> download (onRestore runs, so the game can re-read its saves)
//   - only this browser changed              -> upload
//   - both changed, or first time on a device that already has its own saves -> ask (onConflict, default chooseCopy: an in-game side-by-side dialog)
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

export function cloudSave({ game, keys = {}, prefixes = {}, onRestore = () => location.reload(), onConflict = null, canRestore = () => true, device = navigator.userAgent.slice(0, 60), describe = null }) {
  if (!/^[a-z0-9-]{1,32}$/.test(game)) throw new Error('cloudSave: bad game id');
  const slots = Object.entries(keys);                        // [[slot, localStorage key], …]
  const groups = Object.entries(prefixes);                   // [[slot, key prefix], …]
  let uid = null;                                            // what this browser last matched is kept per account
  const SYNC = () => `rgs.cloud.${game}.${uid}`;
  const st = { on: true, signedIn: false, state: 'off', at: null, message: '' };
  const subs = new Set();
  const set = patch => { Object.assign(st, patch); for (const f of subs) try { f({ ...st }); } catch {} };
  let busy = null, soon = null, held = false;
  const LOCAL_AT = `rgs.cloud.${game}.localAt`, BACKUP = `rgs.cloud.${game}.backup`;
  /** Remember when this device's saves last changed (the game may not stamp its own saves). */
  function noteLocal() {
    const fp = localFp(); let cur = null; try { cur = JSON.parse(ls.get(LOCAL_AT) || 'null'); } catch { cur = null; }
    if (!cur || cur.fp !== fp) ls.set(LOCAL_AT, JSON.stringify({ fp, at: Date.now() }));
  }
  const localAt = () => { try { return JSON.parse(ls.get(LOCAL_AT) || 'null')?.at || 0; } catch { return 0; } };
  const summary = vals => { try { return describe ? (describe(vals) || {}) : {}; } catch (e) { console.warn('[cloudsave] describe failed', e); return {}; } };
  function keepBackup(kind, values) {
    const d = summary(values);
    if (!ls.set(BACKUP, JSON.stringify({ kind, at: Date.now(), values, lines: d.lines || [] }))) console.warn('[cloudsave] no room to keep a backup');
  }

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
  function download(rows, { backup = false } = {}) {
    if (backup && hasLocal()) keepBackup('device', localValues());
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
    const cloudVals = Object.fromEntries(rows.map(r => [r.slot, r.state?.v ?? null])), localVals = localValues();
    const dl = summary(localVals), dc = summary(cloudVals);
    const q = {
      cloudAt: latest, cloudDevice: from, cloud: cloudVals,
      device: { at: dl.playedAt || localAt() || 0, device: deviceName(device), lines: dl.lines || [] },
      account: { at: dc.playedAt || ms(latest), device: deviceName(from), lines: dc.lines || [] },
      text: `Your account has saves from ${when(latest)} (${deviceName(from)}).`,
    };
    const pick = onConflict ? await onConflict(q) : await chooseCopy(q);
    if (pick === 'cloud') {
      // the player may have started a run while the question was up
      if (!canRestore()) return wait('Your account has newer saves. They will load next time you are on the title screen.');
      return download(rows, { backup: true });
    }
    if (pick === 'local') { keepBackup('account', cloudVals); return upload(); }
    held = true;
    return wait('Your account and this device have different saves. Nothing was changed.');
  }
  /** Put back the copy replaced by the last choice. */
  async function restoreBackup() {
    let b = null; try { b = JSON.parse(ls.get(BACKUP) || 'null'); } catch { b = null; }
    if (!b?.values) return false;
    keepBackup(b.kind === 'device' ? 'account' : 'device', localValues());          // so the restore can be undone too
    for (const slot of allSlots()) writeLocal(slot, b.values[slot] ?? null);
    try { await upload(); } catch (e) { console.warn(e); }
    try { onRestore(); } catch (e) { console.error(e); }
    return true;
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
    noteLocal();
    if (!st.signedIn) return;
    clearTimeout(soon); soon = setTimeout(sync, 4000);
  }

  account.onChange(u => { held = false; set({ signedIn: !!u }); if (u) sync(); else { uid = null; set({ state: 'off', message: 'Sign in to keep your saves in your account' }); } });
  const tick = setInterval(() => { noteLocal(); if (st.signedIn && uid && (synced()?.fp !== localFp() || st.state === 'waiting')) sync(); }, MINUTE);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && st.signedIn && uid && synced()?.fp !== localFp()) sync(); });
  noteLocal();
  sync();

  return {
    status: () => ({ ...st }),
    onStatus(fn) { subs.add(fn); fn({ ...st }); return () => subs.delete(fn); },
    sync, saveSoon, restoreBackup,
    backup() { try { const b = JSON.parse(ls.get(BACKUP) || 'null'); return b ? { kind: b.kind, at: b.at, lines: b.lines || [] } : null; } catch { return null; } },
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

/** "Windows · Chrome", "iPhone · Safari" from a user agent (or the text as given). */
export function deviceName(ua = '') {
  if (!/Mozilla|AppleWebKit|Gecko/.test(ua)) return ua || 'another device';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : 'a device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /SteamDeck|Steam/.test(ua) ? 'Steam' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${os} · ${br}` : os;
}

/**
 * The default question: both copies side by side, each with when it was last played, where, and the game's own
 * summary — never a browser confirm(). Resolves 'local', 'cloud' or 'later'.
 */
export function chooseCopy(q) {
  return new Promise(resolve => {
    injectStyle();
    const ago = t => { if (!t) return 'unknown'; const m = Math.round((Date.now() - t) / 60000); const rel = m < 2 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; return `${when(new Date(t).toISOString())} (${rel})`; };
    const newer = q.device.at > q.account.at ? 'device' : q.account.at > q.device.at ? 'account' : null;
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const card = (key, title, info, btn) => `<section class="rcs-card${newer === key ? ' rcs-newer' : ''}">
      <h3>${title}${newer === key ? '<span class="rcs-tag">Newer</span>' : ''}</h3>
      <p class="rcs-when">Last played: <b>${esc(ago(info.at))}</b></p><p class="rcs-dev">${esc(info.device)}</p>
      ${info.lines.length ? `<ul>${info.lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : ''}
      <button type="button" class="rcs-pick" data-pick="${key === 'device' ? 'local' : 'cloud'}">${btn}</button></section>`;
    const back = document.createElement('div'); back.className = 'rcs-back';
    back.innerHTML = `<div class="rcs-box" role="dialog" aria-modal="true" aria-label="Choose which saves to keep">
      <h2>Two different saves</h2>
      <p class="rcs-lead">This device and your account have different progress. Pick the one to keep — the other is kept as a backup in this browser, so you can switch back later.</p>
      <div class="rcs-cards">${card('device', 'This device', q.device, 'Keep this device\'s saves')}${card('account', 'Your account', q.account, 'Use my account\'s saves')}</div>
      <button type="button" class="rcs-later" data-pick="later">Decide later (change nothing)</button></div>`;
    const done = v => { back.remove(); removeEventListener('keydown', key, true); resolve(v); };
    const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done('later'); } };
    back.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) done(b.dataset.pick); });
    addEventListener('keydown', key, true);
    document.body.append(back);
    setTimeout(() => back.querySelector(newer === 'account' ? '[data-pick="cloud"]' : '[data-pick="local"]')?.focus(), 30);
  });
}
function injectStyle() {
  if (document.getElementById('rcs-style')) return;
  const st = document.createElement('style'); st.id = 'rcs-style';
  // own class prefix + every layout property set here, so a game's own CSS can't squeeze it (lessons rule 52)
  st.textContent = `
.rcs-back{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:safe center;justify-content:center;overflow-y:auto;padding:16px;background:rgba(4,8,16,.72);font:15px/1.4 system-ui,sans-serif;color:#e8eef5;box-sizing:border-box}
.rcs-box{width:min(720px,100%);box-sizing:border-box;margin:auto 0;padding:20px;border-radius:16px;background:#141c2a;border:1px solid rgba(140,190,255,.25);box-shadow:0 20px 60px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:12px}
.rcs-box h2{margin:0;font-size:21px;color:#7fe3ff}
.rcs-lead{margin:0;color:#b3c2d3;font-size:14px}
.rcs-cards{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.rcs-card{display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:12px;background:#1b2536;border:1px solid rgba(140,190,255,.18);min-width:0}
.rcs-card.rcs-newer{border-color:#6bf09a;box-shadow:0 0 0 1px rgba(107,240,154,.35)}
.rcs-card h3{margin:0;font-size:17px;display:flex;align-items:center;gap:8px}
.rcs-tag{font-size:12px;font-weight:700;color:#06210f;background:#6bf09a;border-radius:9px;padding:1px 8px}
.rcs-when,.rcs-dev{margin:0;font-size:14px}.rcs-dev{color:#9fb0c4}
.rcs-card ul{margin:2px 0 4px;padding-left:18px;font-size:14px;display:flex;flex-direction:column;gap:2px}
.rcs-pick,.rcs-later{font:600 15px system-ui,sans-serif;min-height:44px;border-radius:10px;cursor:pointer;padding:8px 12px;margin-top:auto}
.rcs-pick{background:#19c6d6;color:#031418;border:0}.rcs-card:not(.rcs-newer) .rcs-pick{background:#2a3a52;color:#e8eef5}
.rcs-later{background:transparent;color:#cfd9e6;border:1px solid rgba(140,190,255,.3)}
.rcs-pick:focus-visible,.rcs-later:focus-visible{outline:2px solid #7fe3ff;outline-offset:2px}
@media (max-width:600px){.rcs-cards{grid-template-columns:1fr}}`;
  document.head.append(st);
}
