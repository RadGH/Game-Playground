// Hunters vs Farmers sound (stream C -> stream H): sim events (interfaces.md §12) to sfx/js/sfx.js.
//
//   import { createHvfSound } from './hvf-sound.js';
//   const sound = await createHvfSound({
//     localPlayers: [pid],                 // the people at this screen (split screen: both)
//     roleOf: pid => 'farmer' | 'hunter',  // the player's role (state.players[pid].role)
//     ears: () => [{ x, z }],              // where each local player "listens" (his character or camera target)
//     visible: (x, z) => bool,             // optional: query.visibleAt for the local team (fogged events are dropped)
//     entOf: id => ent,                    // optional: state ents by id (for events that carry only ids)
//   });
//   for (const ev of sim.drainEvents()) sound.onEvent(ev);
//   sound.ui('click' | 'build' | 'error' | ...);  sound.setVolume(v); sound.setMuted(b); sound.unlock()
//
// RULES (the mode's feel, hvf-PLAN §4): animal calls are how a hunter finds a farm, so a HUNTER hears an
// animal only when the sim says he did (`noise.heard` includes him) — through the fog, from up to 25 m,
// panned toward it — and a FARMER hears his own flock near him. Everything else is positional: full
// volume within 12 m of the nearest ear, fading to nothing at 60 m, panned left/right, dropped if the
// spot is fogged for this screen (combat in the dark is silent; that is the point). Stings (the Turn,
// a farmer down, release) are global. The same id plays at most every 90 ms; at most 8 starts a frame.

import { Sfx } from '../../../../sfx/js/sfx.js';

const STORE = 'bannerline.hvf-sound.v1';
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const save = s => { try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private window */ } };

/** Animal kind -> its call (also the hound's bay). */
export const ANIMAL_CALLS = { sheep: 'animal.sheep.bleat', hen: 'animal.hen.cluck', pig: 'animal.pig.oink', cow: 'animal.cow.moo', bay: 'death.beast' };
/** Event -> sound id (or [ids]) and how it is placed: 'pos' positional + fog, 'global' everyone, 'mine' only my own. */
export const HVF_SOUNDS = {
  buildStart: ['build.place', 'pos'], built: ['build.done', 'mine'], lost: ['stone.crumble', 'pos'],
  chopped: ['wood.chop', 'pos'], attack: ['melee.swing', 'pos'], hit: ['melee.hit', 'pos'], spear: ['spell.physical.launch', 'pos'],
  shot: ['tower.shot', 'pos'], animalKilled: ['death.beast', 'pos'], flee: ['animal.sheep.bleat', 'pos'],
  farmerDown: ['hvf.down', 'global'], farmerRevived: ['hvf.revive', 'global'], reviveStart: ['heal', 'mine'], respawn: ['revive', 'mine'],
  hunterDown: ['death.humanoid', 'global'], hunterOut: ['bell.toll', 'global'], released: ['hvf.horn', 'global'],
  bell: ['hvf.bell', 'pos'], horn: ['hvf.horn', 'pos'], pounce: ['melee.swing', 'pos'],
  snareSet: ['trap.snap', 'mine'], snared: ['trap.snap', 'pos'], snarePulled: ['ward.pull', 'pos'],
  wardPlanted: ['build.place', 'mine'], wardPulled: ['ward.pull', 'pos'], flare: ['spell.fire.launch', 'pos'],
  gold: ['coin', 'mine'], upgrade: ['equip', 'mine'], item: ['equip', 'mine'], sell: ['coin', 'mine'], use: ['heal', 'mine'],
  hawkArrived: ['hvf.hawk', 'pos'], levelUp: ['levelup', 'mine'], lyingLow: ['ui.close', 'mine'], reject: ['ui.error', 'mine'], turn: ['hvf.turn', 'global'],
};
export const HVF_UI = { click: 'ui.click', hover: 'ui.hover', open: 'ui.open', close: 'ui.close', error: 'ui.error', tab: 'ui.tab', build: 'build.place', buy: 'coin' };

export async function createHvfSound({ localPlayers = [0], roleOf = () => 'farmer', ears = () => [], visible = null, entOf = null, method = 'hybrid', near = 12, far = 60 } = {}) {
  const S = { volume: 0.8, muted: false, bus: { sfx: 1, ui: 0.8, ambience: 0.6 }, ...load() };
  const sfx = await Sfx.create({ method, volume: S.volume, muted: S.muted });
  for (const [b, v] of Object.entries(S.bus)) sfx.setBusVolume(b, v);
  const last = new Map(); let frameAt = 0, started = 0;
  const mine = p => localPlayers.includes(p);

  /** Volume and pan for a spot, from the nearest ear; null = too far. */
  function place(x, z, maxDist = far) {
    const list = ears() || [];
    if (!list.length || x == null) return { gain: 1, pan: 0 };
    let best = null, bd = Infinity;
    for (const e of list) { const d = Math.hypot(x - e.x, z - e.z); if (d < bd) { bd = d; best = e; } }
    if (bd > maxDist) return null;
    const gain = bd <= near ? 1 : Math.max(0, 1 - (bd - near) / Math.max(1, maxDist - near)) ** 1.5;
    return { gain: Math.max(0.08, gain), pan: Math.max(-0.8, Math.min(0.8, (x - best.x) / 30)) };
  }
  function play(id, { x = null, z = null, gain = 1, maxDist = far, fog = true } = {}) {
    if (!id) return false;
    if (Array.isArray(id)) return id.map(i => play(i, { x, z, gain, maxDist, fog })).some(Boolean);
    if (!sfx.entry(id)) return false;
    const now = performance.now();
    if (now - frameAt > 16) { frameAt = now; started = 0; }
    if (started >= 8 || now - (last.get(id) || 0) < 90) return false;
    let pan = 0;
    if (x != null) {
      if (fog && visible && !visible(x, z)) return false;
      const p = place(x, z, maxDist); if (!p) return false;
      gain *= p.gain; pan = p.pan;
    }
    last.set(id, now); started++;
    sfx.cue(id, { pan, gain });
    return true;
  }
  const at = id => { const e = entOf?.(id); return e ? { x: e.x, z: e.z } : {}; };

  const api = {
    sfx, play, place,
    /** Returns true when a sound started (tests read it). */
    onEvent(ev) {
      if (ev.type === 'noise') {
        const call = ANIMAL_CALLS[ev.kind]; if (!call) return false;
        for (const p of localPlayers) {
          // a hunter hears what the sim says he heard, through the fog; a farmer hears his flock nearby
          if (roleOf(p) === 'hunter' ? (ev.heard || []).includes(p) : true)
            return play(call, { x: ev.x, z: ev.z, maxDist: roleOf(p) === 'hunter' ? 30 : 22, fog: false, gain: roleOf(p) === 'hunter' ? 1 : 0.6 });
        }
        return false;
      }
      const row = HVF_SOUNDS[ev.type]; if (!row) return false;
      const [id, how] = row;
      // the hawk's owner always hears it land, however far it flew (a cue, like a sting); anyone else only nearby and in sight
      if (ev.type === 'hawkArrived' && mine(ev.player)) return play(id, { gain: 0.85 });
      if (how === 'global') return play(id);
      if (how === 'mine') return mine(ev.player) ? play(id) : false;
      const p = ev.x != null ? { x: ev.x, z: ev.z } : ev.grave ? ev.grave : at(ev.dst ?? ev.src ?? ev.id);
      // a positional sound with nowhere to put it stays SILENT: playing it everywhere would leak what the fog hides
      if (p.x == null) return false;
      let sid = id;
      if (ev.type === 'flee') { const e = entOf?.(ev.id); sid = e && ANIMAL_CALLS[e.type] || id; }
      if (ev.type === 'animalKilled' && ev.kind === 'hen') sid = 'animal.hen.cluck';
      return play(sid, { ...p, gain: ev.type === 'attack' || ev.type === 'hit' ? 0.6 : 1 });
    },
    ui(kind) { return play(HVF_UI[kind] || kind); },
    result(won) { return won ? play(['quest.complete', 'hvf.horn']) : play(['bell.toll', 'hvf.down']); },
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
