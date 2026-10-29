// A tiny observable store for the console (main thread only; never game state — that lives in the sim).
//   const s = createState({ tool: null }); s.on('tool', v => ...); s.set('tool', 'wall'); s.get('tool')
export function createState(initial = {}) {
  const data = { ...initial };
  const subs = new Map();
  return {
    get: k => data[k],
    all: () => ({ ...data }),
    set(k, v) {
      if (Object.is(data[k], v)) return false;
      data[k] = v;
      for (const f of subs.get(k) || []) { try { f(v); } catch (e) { console.error(e); } }
      for (const f of subs.get('*') || []) { try { f(k, v); } catch (e) { console.error(e); } }
      return true;
    },
    on(k, f) { if (!subs.has(k)) subs.set(k, new Set()); subs.get(k).add(f); return () => subs.get(k).delete(f); },
  };
}
