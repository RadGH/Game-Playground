// Sound cues through the playground's shared sound engine (sfx/js/sfx.js, the same one Tumblefair uses). Browsers only
// allow sound after a press, so the engine is made on the first press (unlock()); until then — and if it fails to load —
// every cue is silently nothing. `pan` (-1..1) puts a hit on the side of the screen it happened on.
const MAP = {
  tap: 'ui.click', move: 'ui.hover', open: 'ui.open', back: 'ui.close', bad: 'ui.error', join: 'loot.uncommon', ready: 'ui.tab',
  punch: 'melee.hit', whiff: 'melee.swing', grab: 'equip', throw: 'fire.whoosh', down: 'status.dazed.apply', up: 'ui.tab',
  out: 'loot.magic', spikes: 'trap.snap', fire: 'fire.whoosh', crush: 'fragment.crash.medium', round: 'quest.complete', wave: 'hvf.horn',
  win: 'loot.legendary', go: 'hvf.bell', hazard: 'lever.pull',
};
export function createSounds() {
  let engine = null, starting = false, last = {};
  const play = (name, { pan = 0, gap = 0.04 } = {}) => {
    const now = performance.now() / 1000; if (now - (last[name] || 0) < gap) return; last[name] = now;   // no machine-gun stacking
    try { engine?.cue?.(MAP[name] || name, { pan }); } catch { /* never break the game for a sound */ }
  };
  play.unlock = () => {
    if (engine || starting) return; starting = true;
    import('../../../../sfx/js/sfx.js').then(m => m.Sfx.create({ method: 'hybrid', volume: 0.6 })).then(e => { engine = e; }).catch(() => {});
  };
  return play;
}
