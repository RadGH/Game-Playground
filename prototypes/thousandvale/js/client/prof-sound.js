// W9 professions — sound. Thousandvale had none before this; the mini-games are the first thing here that asks the
// playground's Sound Lab (sfx/js/sfx.js: a catalog of logical ids, loudness-levelled) for a noise.
//
//   const sound = createProfSound()            // nothing is fetched until the first cue (and a browser wants a gesture first)
//   sound.note(type, kind)                     // a mini-game moment: type 'strike' | 'rhythm' | …, kind 'perfect' | 'hit' | 'miss' | 'reheat' | 'spill' | 'over' | 'start'
//   sound.result(quality)                      // the result card
//
// Volume follows the game's own Settings > Audio sliders (master x sound effects, saved under `tv.settings`); a
// slider at 0 or a failed load makes this a no-op — sound can never break a game.

const NOTE = {
  strike: { start: null, perfect: ['fragment.crash.small', 'pearl.pickup'], hit: ['fragment.crash.small'], miss: ['melee.miss'] },
  rhythm: { perfect: ['wood.chop'], hit: ['wood.chop'], miss: ['melee.miss'] },
  pick: { perfect: ['pearl.pickup'], hit: ['oil.pickup'], miss: ['ui.error'], move: ['ui.hover'] },
  trace: { start: ['melee.swing'] },
  forge: { perfect: ['melee.block', 'pearl.pickup'], hit: ['melee.block'], miss: ['rain.tick.metal'], reheat: ['fire.whoosh'] },
  stitch: { perfect: ['ui.tab'], hit: ['ui.click'], miss: ['melee.miss'] },
  pour: { start: ['water.pour'], perfect: ['water.splash.small', 'pearl.pickup'], hit: ['water.splash.small'], miss: ['water.splash.small'], spill: ['water.drain'] },
  gauge: { perfect: ['steam.hiss', 'pearl.pickup'], hit: ['steam.hiss'], miss: ['ice.crack'], over: ['ice.crack'] },
};
const RESULT = { perfect: 'loot.rare', fine: 'loot.magic', good: 'loot.common', poor: 'ui.close', fail: 'ui.error' };
/** Every catalog id this module can ask for (a node test checks each exists in sfx/data/catalog.json). */
export const PROF_SOUND_IDS = [...new Set([...Object.values(NOTE).flatMap(t => Object.values(t).flatMap(a => a || [])), ...Object.values(RESULT)])];

function volume() {
  try { const s = JSON.parse(localStorage.getItem('tv.settings') || 'null') || {}; const m = Number.isFinite(s.master) ? s.master : 0.8, f = Number.isFinite(s.sfx) ? s.sfx : 0.8; return Math.max(0, Math.min(1, m * f)); } catch { return 0.64; }
}

export function createProfSound({ load = () => import('../../../../sfx/js/sfx.js') } = {}) {
  let sfx = null, loading = null, dead = false;
  const stats = { cues: 0, played: 0 };
  function ready() {
    if (sfx || dead) return Promise.resolve(sfx);
    return (loading ||= load().then(m => m.Sfx.create({ method: 'hybrid', volume: volume() })).then(s => { sfx = s; try { s.preload?.(['fragment.crash.small', 'wood.chop', 'melee.block', 'ui.click', 'pearl.pickup']); } catch {} return s; }).catch(e => { dead = true; console.warn('[prof] no sound:', e?.message || e); return null; }));
  }
  function cue(ids, opts = {}) {
    if (!ids || !ids.length || dead) return;
    stats.cues++;
    const v = volume(); if (v <= 0) return;
    ready().then(s => { if (!s) return; try { s.setVolume?.(v); for (const id of ids) { (s.cue || s.play).call(s, id, opts); stats.played++; } } catch { /* an unknown id or a suspended context: silence */ } });
  }
  return {
    stats, ready,
    note(type, kind, opts) { cue(NOTE[type]?.[kind] || (kind === 'perfect' ? NOTE[type]?.hit : null), opts); },
    result(quality) { cue([RESULT[quality] || 'ui.click']); },
    ui(id = 'ui.click') { cue([id]); },
  };
}
