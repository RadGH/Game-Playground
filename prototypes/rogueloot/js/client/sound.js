// Sound through the shared playground library (sfx/: real CC0 recordings for every id, credited automatically in the
// Credits screen). Starts on the first tap/key (browsers block audio before that). Volume 0 = off (☰ settings, M31).
let sfx = null, starting = null, vol = 0.8;
try { const v = localStorage.getItem('rogueloot.volume'); if (v != null) vol = +v; } catch { /* private */ }
function start() {
  if (sfx || starting) return;
  starting = import('../../../../sfx/js/sfx.js').then(m => m.Sfx.create({ method: 'hybrid', volume: vol })).then(s => { sfx = s; }).catch(e => console.warn('sound off', e));
}
addEventListener('pointerdown', start, { once: true, capture: true });
addEventListener('keydown', start, { once: true, capture: true });
export function play(id, opts) { if (!vol) return; try { sfx?.play(id, opts); } catch { /* a missing id must never break the game */ } }
export const LOOT_SOUND = { normal: 'loot.normal', magic: 'loot.magic', rare: 'loot.rare', unique: 'loot.epic', legendary: 'loot.legendary' };
