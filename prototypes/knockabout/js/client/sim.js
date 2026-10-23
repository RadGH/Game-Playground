// Which sim the page runs: the real one (js/sim/match.js) when it loads, the stand-in (sim-stub.js) only if it does not.
// `?sim=stub` forces the stand-in (for screen work while the real sim is broken). `simKind` says which one is in use.
export let simKind = 'none';
export async function loadSim() {
  const force = /[?&]sim=stub\b/.test(location.search);
  if (!force) {
    try { const m = await import('../sim/match.js'); if (typeof m.createMatch === 'function') { simKind = 'real'; return m; } }
    catch (e) { console.warn('[knockabout] real sim did not load, using the stand-in:', e?.message || e); }
  }
  simKind = 'stub';
  return import('./sim-stub.js');
}
