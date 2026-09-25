// Sound for Frontier Foundry: one thin wrapper over the shared Sfx engine (../../sfx/) so the rest
// of the interface can say `sound.build()` without knowing which sample that is.
//
//   const sound = await Sound.create(settings);
//   sound.ui('click'); sound.alert(5); sound.turret('energy');
//
// The audio context cannot start until the player has clicked something, so every call is a no-op
// until then and `unlock()` is wired to the first pointer event.

import { Sfx, methodList } from '../../../../sfx/js/sfx.js';

const MAP = {
  click: 'ui.click', hover: 'ui.hover', tab: 'ui.tab', open: 'ui.open', close: 'ui.close', error: 'ui.error',
};

export class Sound {
  static async create(settings = {}) {
    const s = new Sound(settings);
    try {
      s.sfx = await Sfx.create({ method: settings.method || 'hybrid', volume: settings.master ?? 0.7 });
      s.sfx.setBusVolume?.('ui', settings.ui ?? 0.6);
      s.sfx.setBusVolume?.('sfx', settings.effects ?? 0.8);
      s.ok = true;
    } catch (err) {
      s.ok = false;                                    // no audio in this browser: the game still runs
      s.error = String(err?.message || err);
    }
    return s;
  }

  constructor(settings = {}) {
    this.muted = !!settings.muted;
    this.ok = false;
    this.unlocked = false;
    this.lastAt = new Map();
  }

  /** Browsers only let audio start after a real click. Call this from the first pointer event. */
  unlock() {
    if (this.unlocked || !this.ok) return;
    this.unlocked = true;
    try { this.sfx.context?.resume?.(); } catch {}
  }

  methods() { return this.ok ? methodList() : []; }
  setMethod(id) { if (this.ok) try { this.sfx.setMethod(id); } catch {} }
  setMuted(on) { this.muted = !!on; if (this.ok) this.sfx.setMuted(!!on); }
  setVolume(v) { if (this.ok) this.sfx.setVolume(v); }
  setBus(bus, v) { if (this.ok) this.sfx.setBusVolume?.(bus, v); }

  /** Play one sound, at most `gap` seconds apart so a battle does not turn into a buzz. */
  cue(id, { gap = 0.05, volume = 1, rate = 1 } = {}) {
    if (!this.ok || this.muted || !this.unlocked) return;
    const now = performance.now() / 1000;
    if (now - (this.lastAt.get(id) || -99) < gap) return;
    this.lastAt.set(id, now);
    try { this.sfx.cue(id, { volume, rate }); } catch {}
  }

  ui(kind = 'click') { this.cue(MAP[kind] || 'ui.click', { gap: 0.04, volume: 0.8 }); }
  build() { this.cue('equip', { gap: 0.08 }); }
  done() { this.cue('ui.open', { gap: 0.2, volume: 0.7 }); }
  research() { this.cue('levelup', { gap: 1, volume: 0.8 }); }
  quest() { this.cue('quest.complete', { gap: 1 }); }
  deliver() { this.cue('coin', { gap: 0.6, volume: 0.5 }); }
  wave() { this.cue('night.ambush', { gap: 3, volume: 0.9 }); }
  turret(type = 'bullet') {
    const id = type === 'energy' || type === 'laser' ? 'spell.arcane.launch'
      : type === 'fire' ? 'spell.fire.launch'
        : type === 'electric' ? 'spell.lightning.launch'
          : type === 'explosive' ? 'spell.physical.impact' : 'melee.hit';
    this.cue(id, { gap: 0.13, volume: 0.35 });
  }
  hit() { this.cue('melee.hit', { gap: 0.2, volume: 0.4 }); }
  lost() { this.cue('death.construct', { gap: 0.5, volume: 0.8 }); }
  launch() { this.cue('spell.fire.launch', { gap: 1, volume: 1 }); }

  /** A notification: importance 1-5 decides whether it makes a noise at all. */
  alert(importance = 1) {
    if (importance >= 5) this.cue('ui.error', { gap: 0.8, volume: 0.9 });
    else if (importance === 4) this.cue('ui.open', { gap: 0.6, volume: 0.6 });
  }
}
