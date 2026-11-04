// World slots in IndexedDB (a planet save can be megabytes, too big for localStorage). Every call
// is wrapped: a private window or blocked storage just means "no saves", never a crash.

const DB = 'stoneward', STORE = 'worlds', SLOTS = 6;

function open() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); });
}

export const saves = {
  SLOTS,
  async list() {
    try {
      const out = [];
      for (let k = 0; k < SLOTS; k++) { const v = await tx('readonly', s => s.get('meta:' + k)); out.push(v || null); }
      return out;
    } catch { return Array(SLOTS).fill(null); }
  },
  async put(slot, save, meta) {
    try { await tx('readwrite', s => { s.put(save, 'save:' + slot); s.put({ ...meta, slot, at: Date.now() }, 'meta:' + slot); }); return true; } catch (e) { console.warn('[saves]', e); return false; }
  },
  async get(slot) { try { return await tx('readonly', s => s.get('save:' + slot)); } catch { return null; } },
  async remove(slot) { try { await tx('readwrite', s => { s.delete('save:' + slot); s.delete('meta:' + slot); }); } catch { /* nothing to do */ } },
  async latest() { const l = (await this.list()).filter(Boolean).sort((a, b) => b.at - a.at); return l[0] || null; },
};
