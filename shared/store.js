// Tiny localStorage wrapper with a namespace + schema version, so experiments don't collide.
// const store = makeStore('voice-lab', 1); store.set('presets', {...}); store.get('presets', fallback); store.list()
export function makeStore(ns, version = 1) {
  const prefix = `playground:${ns}:v${version}:`;
  return {
    get(key, fallback = null) { try { const v = localStorage.getItem(prefix + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(prefix + key, JSON.stringify(value)); return true; } catch { return false; } },
    remove(key) { localStorage.removeItem(prefix + key); },
    list() { return Object.keys(localStorage).filter(k => k.startsWith(prefix)).map(k => k.slice(prefix.length)); },
    clear() { for (const k of this.list()) this.remove(k); },
  };
}
