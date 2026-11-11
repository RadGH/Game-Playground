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
export function play(id, opts = {}) { if (!vol) return; try { const { volume, ...o } = opts; if (volume != null) o.gain = volume; sfx?.play(id, o)?.catch?.(() => {}); } catch { /* a missing id must never break the game */ } }
export function setVolume(v) { vol = Math.max(0, Math.min(1, +v || 0)); try { localStorage.setItem('rogueloot.volume', String(vol)); } catch { /* */ } try { sfx?.setVolume?.(vol); } catch { /* */ } }
export const getVolume = () => vol;
export const LOOT_SOUND = { normal: 'loot.normal', magic: 'loot.magic', rare: 'loot.rare', unique: 'loot.epic', legendary: 'loot.legendary' };

// ---- the game's events -> sounds (M31). Distance and side: things far off are quieter and pan left/right. ----
const TYPE_SOUND = { fire: 'fire', frost: 'ice', storm: 'lightning', poison: 'poison', shadow: 'shadow', physical: 'physical' };
export const AMBIENCE = { shore: 'ambience.wind', meadow: 'ambience.forest', forest: 'ambience.forest', marsh: 'ambience.marsh', highland: 'ambience.mountain', ruins: 'ambience.wind', grave: 'ambience.night', cave: 'ambience.cave', crypt: 'ambience.cave', catacomb: 'ambience.cave', mine: 'ambience.cave', cellar: 'ambience.cave' };
let lastAt = new Map();
/** Play a sound for a sim event. `pos(id)` -> [x, z] of an actor, `me` = { x, z } of the listener. */
export function soundFor(e, pos, me, myId) {
  const spot = id => { const p = id && pos(id); if (!p || !me) return { vol: 1, pan: 0 }; const dx = p[0] - me.x, dz = p[1] - me.z, d = Math.hypot(dx, dz); return { vol: Math.max(0, 1 - d / 40), pan: Math.max(-1, Math.min(1, dx / 18)) }; };
  const once = (key, ms = 60) => { const t = performance.now(); if (t - (lastAt.get(key) || 0) < ms) return false; lastAt.set(key, t); return true; };
  const go = (id, src) => { const s = spot(src); if (s.vol <= 0.05) return; if (!once(id + src, 50)) return; play(id, { pan: s.pan, volume: s.vol }); };
  switch (e.k) {
    case 'swing': return go('melee.swing', e.s);
    case 'dmg': if (e.s !== myId && e.t !== myId) return; return go(e.r === 'miss' || e.r === 'dodge' ? 'melee.miss' : e.r === 'block' ? 'melee.block' : e.r === 'crit' ? 'melee.crit' : e.ty && e.ty !== 'physical' ? `spell.${TYPE_SOUND[e.ty] || 'arcane'}.impact` : 'melee.hit', e.t);
    case 'shoot': return go(e.ty === 'arrow' ? 'arrow.shot' : `spell.${TYPE_SOUND[e.ty] || 'arcane'}.launch`, e.s);
    case 'cast': case 'fcast': return go('cast.start', e.s);
    case 'heal': return go('heal', e.t);
    case 'revive': return go('revive', e.t);
    case 'die': return go(e.t === myId ? 'death.humanoid' : 'death.beast', e.t);
    case 'level': if (e.t === myId) play('levelup'); return;
    case 'quest-done': play('quest.complete'); return;
    case 'interrupt': return go('status.silence.apply', e.t);
    case 'fx': if (e.t === myId) play(`status.${{ slow: 'slow', stun: 'stun', silence: 'silence', dot: 'poison' }[e.kind] || 'marked'}.apply`); return;
    case 'burst': play(e.ty === 'fire' ? 'explosion.small' : e.ty === 'frost' ? 'ice.crack' : e.ty === 'storm' ? 'thunder' : 'stone.crumble', { volume: 0.7 }); return;
    case 'phase': play('dragon.roar', { volume: 0.6 }); return;
    case 'enrage': play('beast.growl'); return;
    case 'summon': return go('magic.missile', e.s);
    case 'dash': case 'blink': return go('fire.whoosh', e.s);
  }
}
let amb = null;
export function ambience(theme) { const id = AMBIENCE[theme] || 'ambience.forest'; if (id === amb) return; amb = id; play(id, { volume: 0.5 }); }
