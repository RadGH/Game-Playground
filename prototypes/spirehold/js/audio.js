// Spirehold — sound. Everything comes from the shared sfx/ library (real CC0 recordings for every id).
// A busy siege fires hundreds of shots a second, so every id is rate-limited and quieted with distance.

let sfx = null, vol = 0.7, muted = false, starting = null;
const last = new Map();
const GAP = { 'arrow.shot': 0.07, 'tower.shot': 0.12, 'magic.missile': 0.09, 'spell.physical.launch': 0.15, 'explosion.small': 0.09, 'explosion.large': 0.12, 'spell.ice.impact': 0.15, 'spell.lightning.impact': 0.12, 'fire.whoosh': 0.25, 'spell.holy.impact': 0.18, 'death.humanoid': 0.06, 'death.beast': 0.08, 'death.construct': 0.15, 'coin': 0.1, 'stone.crumble': 0.3, 'meteor.fall': 0.2, 'thunder': 0.4 };

export async function initAudio() {
  if (sfx || starting) return starting;
  starting = (async () => {
    try { const { Sfx } = await import('../../../sfx/js/sfx.js'); sfx = await Sfx.create({ method: 'hybrid', volume: vol, muted }); sfx.ambience('ambience.town'); }
    catch (e) { console.info('[spirehold] sound unavailable', e?.message); }
  })();
  return starting;
}
export function resumeAudio() { try { sfx?.context?.state === 'suspended' && sfx.context.resume(); } catch { /* */ } }
export function setVolume(v) { vol = v; sfx?.setVolume(v); }
export function setMuted(m) { muted = m; sfx?.setMuted(m); if (!m) sfx?.ambience('ambience.town'); }
export function play(id, { pan = 0, gain = 1, now = performance.now() / 1000 } = {}) {
  if (!sfx || muted) return;
  const g = GAP[id] ?? 0.05; const t = last.get(id) || 0; if (now - t < g) return; last.set(id, now);
  sfx.cue(id, { pan, gain });
}
export function ambience(id) { sfx?.ambience(id); }

const DEATH = { imp: 'death.humanoid', brute: 'death.humanoid', troll: 'death.beast', skeleton: 'death.construct', shield: 'death.humanoid', shaman: 'death.humanoid', ram: 'death.construct', wyvern: 'death.beast', ghost: 'death.construct', flame: 'fire.whoosh', golem: 'death.construct', wolf: 'death.beast', bug: 'death.beast' };
/** Turn the sim's events into sounds. `pan(x)` maps world x to -1..1. */
export function soundEvents(B, pan, speed = 1) {
  if (!sfx || muted) return;
  const quiet = speed > 1 ? 0.7 : 1;
  for (const e of B.ev) {
    switch (e.k) {
      case 'shoot': play(e.tower === 'arrow' ? 'arrow.shot' : e.tower === 'bolt' ? 'spell.physical.launch' : e.tower === 'shell' ? 'tower.shot' : e.tower === 'missile' ? 'magic.missile' : e.tower === 'flame' ? 'fire.whoosh' : 'tower.shot', { pan: pan(e.x), gain: 0.25 * quiet }); break;
      case 'blast': play(e.big ? 'explosion.large' : e.type === 'frost' ? 'spell.ice.impact' : e.type === 'holy' ? 'spell.holy.impact' : 'explosion.small', { pan: pan(e.x), gain: (e.big ? 0.7 : 0.35) * quiet }); break;
      case 'impact': play('explosion.large', { pan: pan(e.x), gain: 0.9 }); play('quake.rumble', { gain: 0.4 }); break;
      case 'meteor': play('meteor.fall', { pan: pan(e.x), gain: 0.6 }); break;
      case 'bolt': play(e.big ? 'thunder' : 'spell.lightning.impact', { pan: pan(e.pts?.[1]?.x || 0), gain: e.big ? 0.6 : 0.3 }); break;
      case 'frost': play('spell.ice.impact', { pan: pan(e.x), gain: 0.4 }); break;
      case 'beam': play('spell.holy.impact', { pan: pan(e.x), gain: 0.25 }); break;
      case 'pillar': play('spell.holy.impact', { pan: pan(e.x), gain: 0.6 }); break;
      case 'die': play(e.boss ? 'dragon.roar' : DEATH[e.look] || 'death.humanoid', { pan: pan(e.x), gain: (e.boss ? 0.9 : 0.18) * quiet }); break;
      case 'quake': play('quake.rumble', { gain: 1 }); break;
      case 'ward': play('status.barrier.apply', { gain: 0.8 }); break;
      case 'nova': play('fire.whoosh', { pan: pan(e.x), gain: 0.6 }); break;
      case 'cast': play('cast.start', { pan: pan(e.x), gain: 0.15 }); break;
      case 'spell': play(e.id === 'fireball' ? 'spell.fire.launch' : e.id === 'chain' ? 'spell.lightning.launch' : e.id === 'frostnova' ? 'spell.ice.launch' : e.id === 'barrage' ? 'spell.arcane.launch' : 'cast.start', { gain: 0.6 }); break;
      case 'wave': if (e.siege) play('hvf.horn', { gain: 0.8 }); break;
      case 'boss': play('beast.growl', { gain: 0.8 }); break;
      case 'breach': play('stone.crumble', { gain: 1 }); play('fragment.crash.large', { gain: 0.9 }); play('bell.toll', { gain: 0.7 }); break;
      case 'cleared': break;
      case 'bossdown': play('crowd.cheer', { gain: 0.7 }); break;
    }
  }
}
