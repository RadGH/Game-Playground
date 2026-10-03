// Bannerline sound (stream C): a bridge from sim events and UI to sfx/js/sfx.js.
//
//   import { createSound } from './sound.js';
//   const sound = await createSound({ localPlayers: [0], panOf: (x, z) => -1..1, tickHz: 20 });
//   for (const ev of events) sound.onEvent(ev);   // every drained sim event
//   sound.ui('click' | 'hover' | 'open' | 'close' | 'error' | 'tab' | 'buy')   // from menus / panels
//   sound.result(won)                              // the victory / defeat sting
//   sound.setVolume(0..1); sound.setMuted(bool); sound.setBusVolume('sfx' | 'ui' | 'ambience', v)
//   sound.unlock()                                 // call on the first user gesture (browsers start audio suspended)
//   sound.dispose()
//
// Settings (volume, mute, bus levels) persist per browser in localStorage.
// Rules that keep a 3v3 from turning into noise:
//  - Your own events are loud; other players' are quieter, and events far off-screen are dropped
//    (`panOf` returns null for "not in any of my views").
//  - The same sound id plays at most once per 70 ms, and at most 10 sounds start per frame.
//  - Hits pick a sound by damage type (blade/pierce/fire/nature), crits use the crit sound.

import { Sfx } from '../../../../sfx/js/sfx.js';

const STORE = 'bannerline.sound.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const save = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private window */ } };

/** Sim event -> sound id (functions get the event and return an id, an array, or null). */
export const SOUND_MAP = {
  queued: 'coin',
  wave: 'melee.swing',
  pay: 'coin',
  bounty: null,
  levelUp: 'levelup',
  talentReady: 'ui.open',
  heroDown: 'death.humanoid',
  respawn: 'revive',
  leak: ['stone.crumble', 'bell.toll'],
  tide: 'bell.toll',
  rising: 'bell.toll',
  champion: 'bell.toll',
  toll: 'bell.toll',
  item: 'equip', drop: 'loot.uncommon', sell: 'coin', use: 'heal', recall: 'spell.arcane.impact',
  upgrade: 'equip',
  reject: 'ui.error',
  revive: 'revive',
  form: 'spell.nature.impact',
  trap: 'fragment.crash.medium',
};
export const HIT_SOUNDS = { blade: 'melee.hit', pierce: 'spell.physical.impact', physical: 'melee.hit', fire: 'spell.fire.impact', nature: 'spell.nature.impact' };
export const CAST_SOUNDS = { physical: 'melee.swing', blade: 'melee.swing', pierce: 'spell.physical.launch', fire: 'spell.fire.launch', nature: 'spell.nature.launch' };
export const POWER_SOUNDS = { defensive: 'spell.holy.launch', offensive: 'spell.fire.launch', neutral: 'spell.lightning.launch' };
export const STATUS_SOUNDS = { burn: 'status.burn.apply', bleed: 'status.bleed.apply', root: 'status.root.apply', stun: 'status.stun.apply', slow: 'status.slow.apply', quarry: 'status.marked.apply', regen: 'status.regen.apply', haste: 'status.haste.apply', barrier: 'status.barrier.apply' };
export const UI_SOUNDS = { click: 'ui.click', hover: 'ui.hover', open: 'ui.open', close: 'ui.close', error: 'ui.error', tab: 'ui.tab', buy: 'coin' };

export async function createSound({ localPlayers = [0], panOf = null, entOf = null, heroes = null, method = 'hybrid', tickHz = 20 } = {}) {
  const S = { volume: 0.8, muted: false, bus: { sfx: 1, ui: 0.8, ambience: 0.6 }, ...load() };
  const sfx = await Sfx.create({ method, volume: S.volume, muted: S.muted });
  for (const [b, v] of Object.entries(S.bus)) sfx.setBusVolume(b, v);
  const last = new Map(); let startedThisFrame = 0, frameAt = 0;
  const mine = p => localPlayers.includes(p);

  function play(id, { x = null, z = null, volume = 1, player = null } = {}) {
    if (!id) return;
    if (Array.isArray(id)) { id.forEach(i => play(i, { x, z, volume, player })); return; }
    if (!sfx.entry(id)) return;
    const now = performance.now();
    if (now - frameAt > 16) { frameAt = now; startedThisFrame = 0; }
    if (startedThisFrame >= 10 || now - (last.get(id) || 0) < 70) return;
    let pan = 0;
    if (x != null && panOf) { pan = panOf(x, z); if (pan == null) return; }
    if (player != null && !mine(player)) volume *= 0.55;
    last.set(id, now); startedThisFrame++;
    sfx.cue(id, { pan, gain: volume });
  }
  const at = id => { const e = entOf?.(id); return e ? { x: e.x, z: e.z } : {}; };
  const skillEl = id => heroes?.skills?.[id]?.element;

  const api = {
    sfx, play,
    onEvent(ev) {
      switch (ev.type) {
        case 'hit': { const p = at(ev.dst); play(ev.crit ? 'melee.crit' : HIT_SOUNDS[ev.dmgType] || 'melee.hit', { ...p, volume: ev.skill ? 1 : 0.7 }); break; }
        case 'attack': if (!ev.ranged) play('melee.swing', { ...at(ev.src), volume: 0.5 }); break;
        case 'shot': play(CAST_SOUNDS[ev.dmgType] || 'spell.physical.launch', { ...at(ev.src), volume: 0.45 }); break;
        case 'cast': { const e = skillEl(ev.skill); play(CAST_SOUNDS[e] || 'cast.start', { ...at(ev.id) }); break; }
        case 'bolt': play(`spell.${skillEl(ev.skill) === 'nature' ? 'nature' : skillEl(ev.skill) === 'fire' ? 'fire' : 'physical'}.travel`, { x: ev.fromX, z: ev.fromZ, volume: 0.6 }); break;
        case 'zone': play(ev.dmgType === 'fire' ? 'fire.whoosh' : 'spell.nature.impact', { x: ev.x, z: ev.z, volume: 0.8 }); break;
        case 'heal': if (ev.amount > 25) play('heal', { ...at(ev.dst), volume: 0.6 }); break;
        case 'status': if (ev.on) play(STATUS_SOUNDS[ev.status], { ...at(ev.id), volume: 0.6 }); break;
        case 'death': { const e = entOf?.(ev.id); play(e && /golem|colossus|turret/.test(e.type || '') ? 'death.construct' : e && e.kind === 'unit' && /wolf|cat|bear|elk|hyena|rat|crow|thornback|tuskback/.test(e.type || '') ? 'death.beast' : 'death.humanoid', { x: ev.x, z: ev.z, volume: 0.7 }); break; }
        case 'power': play(POWER_SOUNDS[ev.kind] || 'spell.arcane.launch', { x: ev.x, z: ev.z, player: ev.player }); break;
        case 'powerHit': play(['spell.fire.impact', 'fragment.crash.large'], { x: ev.x, z: ev.z }); break;
        case 'pay': if (mine(ev.player)) play('coin', { volume: 0.5 }); break;
        case 'queued': if (mine(ev.player)) play('coin'); break;
        case 'levelUp': if (mine(ev.player)) play('levelup'); break;
        case 'reject': if (mine(ev.player)) play('ui.error'); break;
        case 'leak': play(SOUND_MAP.leak); break;
        case 'result': break;   // the game calls result(won) with the local team in mind
        default: { const id = SOUND_MAP[ev.type]; if (id && (ev.player == null || mine(ev.player))) play(id, { player: ev.player }); }
      }
    },
    ui(kind) { play(UI_SOUNDS[kind] || kind); },
    /** Victory: the quest fanfare and a bell. Defeat: the bell, a crumble and a low thud. */
    result(won) { if (won) play(['quest.complete', 'bell.toll']); else play(['bell.toll', 'stone.crumble', 'death.construct']); },
    unlock() { try { sfx._ctx?.resume?.(); } catch { /* no audio */ } },
    setVolume(v) { S.volume = Math.max(0, Math.min(1, v)); sfx.setVolume(S.volume); save(S); },
    setMuted(on) { S.muted = !!on; sfx.setMuted(S.muted); save(S); },
    setBusVolume(bus, v) { S.bus[bus] = v; sfx.setBusVolume(bus, v); save(S); },
    get settings() { return JSON.parse(JSON.stringify(S)); },
    setLocalPlayers(list) { localPlayers = list.slice(); },
    dispose() { sfx.stopAll?.(); },
  };
  return api;
}
