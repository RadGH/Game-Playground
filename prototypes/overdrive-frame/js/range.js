// The test range: a long firing hall with target dummies at three distances (sim/hangarmap.js makeRangeMap), run as a
// Play mission that never ends (no waves, no objectives; dummies never die and never shoot back). A meter panel shows
// damage per second over the last 5 s, the total, the biggest hit and the split by damage type, using the Damage Meter
// experiment's recorder (playground/meters). Leave with the panel's button or from the pause menu (range.leave()).
import { Play } from './play.js';
import { ensureHangarCss } from './hangar.js';
import { RangePanel } from './ui/range-panel.js';
import { Meter } from '../../../meters/js/meter.js';
import { RANGE_ROWS } from './sim/hangarmap.js';

export const RANGE_MISSION = { id: 'range', name: 'Test range', map: { kind: 'range', seed: 1 }, night: 0.35, waves: [], comms: [] };
const WINDOW = 5;                // seconds the damage-per-second number looks back
const QUIET = 3;                 // a pause this long starts a new streak (the dummies mend after it too)

export class Range {
  /**
   * @param {{ root: HTMLElement, T, P, kinds, sprites, mechArt, build, pilotName?: string, hud?: Hud,
   *   onLeave: () => void, onMenu?: ({ resume, leave }) => void }} o
   *   hud: the mission HUD (energy, heat, weapons). Its ☰ / Escape opens the page's pause menu, which should offer
   *   "Leave range" → range.leave(). Without a hud, Escape calls onMenu({ resume, leave }) (or leaves if none).
   */
  constructor(o) {
    this.o = o; ensureHangarCss();
    o.sprites.lights = true;
    const self = this;
    const stub = { attach() {}, detach() {}, onEvent() {}, frame() {}, openMenu() { const p = self.play; p.paused = true; if (o.onMenu) o.onMenu({ resume: () => { p.paused = false; }, leave: () => self.leave() }); else self.leave(); } };
    this.play = new Play({ root: o.root, mission: RANGE_MISSION, build: o.build, P: o.P, C: o.C, kinds: o.kinds, T: o.T, sprites: o.sprites, mechArt: o.mechArt,
      mechDrawer: o.mechArt.draw, hud: o.hud || stub, pilotName: o.pilotName, night: RANGE_MISSION.night, onEnd() {} });
    this.play.view.zoom = (o.T.cameraZoom || 2.5) * 0.7;      // wider than a mission: the near rows are in sight from the line
    this.meter = new Meter(); this.meter.startFight('range');
    this.recent = []; this.streak = null; this.max = 0;
    const fx = this.play.fxOf;
    this.play.fxOf = (ev, S) => {
      if (ev.type === 'fire' && ev.slot != null) o.mechArt.fired(ev.id, ev.slot);      // the upper body's recoil
      if (ev.type === 'hit' && ev.by === this.play.mech.id) this._record(ev, S);
      fx(ev, S);
    };
    this.panel = new RangePanel(o.root, { onReset: () => this.reset(), onLeave: () => this.leave(), rows: RANGE_ROWS.map(d => d * 16) });
    this.timer = setInterval(() => this.panel.update(this.stats()), 200);
  }

  _record(ev, S) {
    const e = S.byId.get(ev.id), t = S.time;
    if (this.streak == null || t - (this.recent.at(-1)?.[0] ?? -99) > QUIET) this.streak = t;
    this.recent.push([t, ev.amount]); this.max = Math.max(this.max, ev.amount);
    this.meter.record({ t, source: this.play.mech.id, sourceName: 'You', target: ev.id, targetName: e ? S.kinds[e.kind]?.name : 'Target', kind: 'damage', amount: ev.amount, crit: (ev.tier || 0) > 0, dtype: ev.dtype || 'kinetic', via: ev.dtype || 'kinetic', viaName: ev.dtype || 'kinetic' });
  }

  /** { dps (last 5 s), total, max, hits, types: [{ dtype, total }] } */
  stats() {
    const now = this.play.S.time;
    this.recent = this.recent.filter(([t]) => now - t <= WINDOW);
    const sum = this.recent.reduce((s, [, a]) => s + a, 0);
    const span = this.streak == null ? 1 : Math.max(1, Math.min(WINDOW, now - this.streak));
    const sm = this.meter.summary(), me = this.meter.report('damage')[0];
    return { dps: this.recent.length ? sum / span : 0, total: sm.damage, max: this.max, hits: sm.hits, types: (me?.sources || []).map(s => ({ dtype: s.via, total: s.total })) };
  }

  /** Clear the meter and mend every target. */
  reset() {
    this.meter.startFight('range'); this.recent = []; this.streak = null; this.max = 0;
    for (const e of this.play.S.enemies) if (e.dummy) { e.hp = e.hpMax; e.quiet = 0; }
    this.panel.update(this.stats());
  }

  leave() { if (this.left) return; this.left = true; this.o.onLeave?.(); }

  pause(on) { this.play.paused = !!on; }
  state() { return { screen: 'range', ...this.play.state(), meter: this.stats() }; }
  dispose() { clearInterval(this.timer); this.panel.dispose(); this.play.dispose(); }
}
