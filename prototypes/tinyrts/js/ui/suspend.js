// One suspended game, kept in IndexedDB (it stores typed arrays directly, and has room for a whole
// world snapshot). Every call is wrapped: IndexedDB can be missing or blocked (private windows).

const DB = 'tinyrts', STORE = 'suspend', KEY = 'current';

function open() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) { reject(new Error('no indexedDB')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    const r = fn(st);
    t.oncomplete = () => { db.close(); resolve(r && 'result' in r ? r.result : undefined); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function saveSuspend(snap) {
  try { await tx('readwrite', (st) => st.put(snap, KEY)); return true; } catch (e) { console.warn('suspend save failed', e); return false; }
}

export async function loadSuspend() {
  try { return await tx('readonly', (st) => st.get(KEY)); } catch (e) { return null; }
}

export async function deleteSuspend() {
  try { await tx('readwrite', (st) => st.delete(KEY)); } catch (e) { /* ignore */ }
}

export async function hasSuspend() {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const t = db.transaction(STORE, 'readonly');
      const r = t.objectStore(STORE).count(KEY);
      r.onsuccess = () => { db.close(); resolve(r.result > 0); };
      r.onerror = () => { db.close(); resolve(false); };
    });
  } catch (e) { return false; }
}
