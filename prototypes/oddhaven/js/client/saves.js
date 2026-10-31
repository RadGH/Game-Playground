// Saves (PLAN §2): the Worker's gzip text, kept in localStorage as base64 with a small note beside it. While signed in,
// shared/rgs-cloudsave.js copies the two keys to the account and back, so a town follows you between devices. Optional:
// signed out, nothing leaves this browser.
import { cloudSave } from '../../../../shared/rgs-cloudsave.js';

export const SAVE_KEY = 'oddhaven.save.v1', META_KEY = 'oddhaven.save.meta';
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };
export const toBase64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
export const fromBase64 = text => { const s = atob(text), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };

export function createSaves({ canRestore = () => true } = {}) {
  let locked = false;     // set before a reload to a restored copy, so the page cannot write its old town over it
  let cloud = null;
  const self = {
    meta() { try { return JSON.parse(ls.get(META_KEY) || 'null'); } catch { return null; } },
    has: () => !!ls.get(SAVE_KEY) && !!self.meta(),
    bytes() { const t = ls.get(SAVE_KEY); return t ? fromBase64(t) : null; },
    /** bytes = gzip from the Worker. False if the browser refused (storage full or private window). */
    write(bytes, meta) {
      if (locked) return false;
      const ok = ls.set(SAVE_KEY, toBase64(bytes)) && ls.set(META_KEY, JSON.stringify({ ...meta, at: Date.now(), size: bytes.length }));
      if (ok) cloud?.saveSoon?.();
      return ok;
    },
    clear() { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(META_KEY); } catch { /* nothing to clear */ } },
    get cloud() { return cloud; },
  };
  try {
    cloud = cloudSave({ game: 'oddhaven', keys: { save: SAVE_KEY, meta: META_KEY }, canRestore, onRestore: () => { locked = true; location.reload(); } });
  } catch (e) { console.warn('[oddhaven] cloud save', e); }
  return self;
}
