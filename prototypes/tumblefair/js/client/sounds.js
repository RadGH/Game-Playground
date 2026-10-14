// Sound for the party: a handful of named cues ('tap', 'dice', 'good', 'bad', 'win', 'go' ...) played through the
// playground's shared sound engine (sfx/js/sfx.js). Browsers only allow sound after a touch, so the engine is made
// on the first tap (unlock()); before that, and if it fails to load, every cue is silently nothing.
const MAP = { tap: 'ui.click', open: 'ui.open', close: 'ui.close', bad: 'ui.error', good: 'loot.uncommon', coins: 'loot.common', win: 'loot.legendary', turn: 'ui.tab', dice: 'melee.block', go: 'loot.magic', splat: 'melee.hit', trap: 'death.construct', hit: 'melee.hit', throw: 'melee.swing', out: 'death.humanoid', pick: 'loot.normal' };
export function createSounds() {
  let engine = null, starting = false;
  const play = (name, opts) => { try { engine?.cue?.(MAP[name] || name, opts); } catch { /* never break the game for a sound */ } };
  play.unlock = () => {
    if (engine || starting) return; starting = true;
    import('../../../../sfx/js/sfx.js').then(m => m.Sfx.create({ method: 'hybrid', volume: 0.6 })).then(e => { engine = e; }).catch(() => {});
  };
  return play;
}
