// One mission being played on this device: fixed-step sim (30 per second), drawing in between with smoothing
// (lessons 28: draw moving things between sim steps), the camera, input, events → effects, the HUD, and the end.
// Solo now; in co-op (R4) the same loop takes the server's state instead of stepping locally.
import { createMission, stepMission } from './sim/mission.js';
import { buildMissionDef } from './sim/missiondef.js';
import { makeMech } from './sim/mech.js';
import { arm } from './sim/weapons.js';
import { mechStats, weaponSpec } from './sim/loadout.js';
import { View } from './render/view.js';
import { makeEventFx } from './render/events.js';
import { Controls } from './input/controls.js';
import { installTouch } from './input/touch.js';
import { startSound, resume } from '../../../citykit/js/world/sound.js';

const STEP = 1 / 30;

export class Play {
  /**
   * @param {{ root: HTMLElement, mission: object, build: object, P: object, kinds: object, T: object, sprites: Sprites,
   *   mechDrawer: Function, hud: Hud, onEnd: (result) => void, night?: number, pid?: string }} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.pid = o.pid || 'p1';
    this.def = buildMissionDef(o.mission);
    const st = mechStats(o.build, o.P, o.C);
    const weapons = o.build.weapons.map((w, i) => { const p = w && o.P[typeof w === 'string' ? w : w.id]; return p ? arm(weaponSpec(p, typeof w === 'object' ? w : null, st), i) : null; });
    this.mech = makeMech({ id: 'm-' + this.pid, x: 0, z: 0, stats: st, weapons: weapons.map((w, i) => w || arm({ id: 'none', kind: 'none', dmg: 0, rate: 1, range: 1, speed: 1 }, i)), paint: o.build.paint, name: o.pilotName });
    this.mech.build = o.build;
    this.S = createMission(this.def, { kinds: o.kinds, T: o.T, players: [{ id: this.pid, mech: this.mech }], seed: this.def.seed });
    this.S.localPid = this.pid;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'of-play'; this.canvas.setAttribute('aria-label', 'The mission');
    o.root.append(this.canvas);
    this.view = new View(this.canvas, o.sprites, { zoom: o.T.cameraZoom || 2.5 });
    this.view.night = o.night ?? (o.mission.night ?? 0.75);
    this.view.mechDrawer = o.mechDrawer;
    this.view.cam.x = this.def.start[0].x; this.view.cam.z = this.def.start[0].z;
    this.controls = new Controls(this.canvas);
    this.touch = installTouch(this.controls, o.root);
    const deathSprite = kind => { const K = o.kinds[kind]; const a = o.sprites.animOf(K.recipe, 'die'); if (!a) return null; const n = o.sprites.frames(K.recipe, a), sp = o.sprites.facing(K.recipe, { seed: 1 }, (Math.random() * 16) | 0, a, n - 1); return sp ? { img: sp.day, ax: sp.ax, ay: sp.ay, w: sp.w, h: sp.h, scale: 1 / o.sprites.scale } : null; };
    this.fxOf = makeEventFx(this.view, { deathSprite, localId: () => this.mech.id, pan: (x) => Math.max(-1, Math.min(1, (this.view.P(x, 0).sx - this.view.W / 2) / (this.view.W / 2))) });
    this.acc = 0; this.last = performance.now(); this.t = 0; this.running = true; this.paused = false;
    this.prev = new Map();
    this.onResize = () => this.view.resize(); addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointerdown', () => { startSound(); resume(); });
    this.hud?.attach(this);
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Drawn position between the last two sim steps (smooth at any frame rate). */
  lerp = (o) => {
    const p = this.prev.get(o.id); if (!p) return o;
    const a = this.alpha; return { x: p[0] + (o.x - p[0]) * a, z: p[1] + (o.z - p[1]) * a, y: (p[2] ?? 0) + ((o.y ?? 0) - (p[2] ?? 0)) * a };
  };

  frame = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.paused) {
      this.acc += dt;
      const me = this.lerp(this.mech), s = this.view.P(me.x, me.z, (me.y || 0) + 0.4);
      const inp = this.controls.read({ x: s.sx, y: s.sy }, this.view);
      if (inp.menu) { this.controls.consume(); this.hud?.openMenu(); }
      let steps = 0;
      while (this.acc >= STEP && steps < 4) {
        this.prev.clear();
        for (const m of this.S.mechs) this.prev.set(m.id, [m.x, m.z, m.y]);
        for (const e of this.S.enemies) if (!e.dead) this.prev.set(e.id, [e.x, e.z, e.flying || 0]);
        const wasDrop = this.S.phase === 'drop';
        const ev = stepMission(this.S, { [this.pid]: inp }, STEP);
        if (wasDrop && this.S.phase !== 'drop') ev.push({ type: 'land', id: this.mech.id, x: this.mech.x, z: this.mech.z, hard: true });
        for (const e of ev) { this.fxOf(e, this.S); this.hud?.onEvent(e, this.S); }
        this.controls.consume();
        this.acc -= STEP; steps++;
        inp.qb = inp.jumpPressed = inp.lockOnPressed = false;
      }
      if (steps === 4) this.acc = 0;
      this.alpha = Math.min(1, this.acc / STEP);
      this.lastInput = inp;
    }
    const me = this.lerp(this.mech);
    const ax = this.lastInput?.ax ?? me.x, az = this.lastInput?.az ?? me.z;
    this.view.follow(me.x, me.z, ax, az, dt);
    this._feed();
    this.sprites.work(this.paused ? 12 : 4);
    this.view.draw(this.S, this.lerp, this.mech, dt, this.t);
    this.hud?.frame(this.S, this.mech, dt, this.lastInput);
    if (this.S.result && !this.ended) { this.ended = true; setTimeout(() => this.onEnd?.(this.S.result, this.S), this.S.result.won ? 2600 : 2200); }
  };

  /** Background baking while you play (owner report: "lag when attacking buildings for the first time"): every third
   *  frame, one picture the fight will soon need — the damaged looks of the buildings nearest your frame first, then
   *  buildings further out, then the enemies of later waves. A hit building keeps its old look until its new one is
   *  ready (sprites.building falls back), so nothing ever bakes in the middle of a hit. */
  _feed() {
    this._feedN = (this._feedN || 0) + 1;
    // first: the frame's own poses not baked at load (boost, dash, hover, recoil) — one per frame, they're needed soonest
    this._mechRest ||= [...this.mechArt.prebakeSteps(this.build, 'rest')];
    if (this._mechRest.length) {
      // during the drop-in (you can't move yet) bake as much as fits in a frame; after it, one every fourth frame
      const t0 = performance.now(), dropping = this.S.phase === 'drop';
      if (!dropping && this._feedN % 4) return;
      do { try { this._mechRest.shift()(); } catch (e) { console.warn(e); } } while (dropping && this._mechRest.length && performance.now() - t0 < 30);
      return;
    }
    if (this._feedN % 3 || this.sprites.queue.length > 1) return;
    if (!this._todo || this._feedN % 90 === 0) {
      const m = this.mech, lots = this.S.world.lots.filter(l => l.recipe).map(l => [Math.hypot(l.x + l.w / 2 - m.x, l.z + l.d / 2 - m.z), l]).sort((a, b) => a[0] - b[0]);
      const todo = [];
      const add = (maxD, st) => { for (const [d, l] of lots) if (d < maxD && l.stage <= st && !this.sprites.hasKey(this.sprites.buildingKey(l.recipe, l.params, st))) todo.push([l, st]); };
      add(18, 0); add(9, 1); add(9, 2); add(9, 3); add(16, 1); add(99, 0); add(16, 2);
      for (const w of this.def.waves) { const K = this.kinds[w.kind]; const walk = this.sprites.animOf(K.recipe, 'walk'); for (let d = 0; d < 16; d++) for (let f = 0; f < this.sprites.frames(K.recipe, walk); f++) todo.push([null, 0, K.recipe, walk, d, f]); }
      this._todo = todo;
    }
    while (this._todo.length) {
      const [l, st, recipe, anim, d, f] = this._todo.shift();
      if (l) { if (l.stage > st || this.sprites.hasKey(this.sprites.buildingKey(l.recipe, l.params, st))) continue; this.sprites.building(l.recipe, l.params, st); return; }
      if (this.sprites.facing(recipe, { seed: 1 }, d, anim, f)) continue;
      return;
    }
  }

  /** The state for Claude's game-eye and the tests. */
  state() {
    const m = this.mech;
    return { phase: this.S.phase, time: Math.round(this.S.time * 10) / 10, mech: { x: m.x, z: m.z, y: m.y, hp: Math.round(m.hp), hpMax: m.hpMax, energy: Math.round(m.energy), heat: Math.round(m.heat), anim: m.anim, aim: m.aim, face: m.face },
      enemies: this.S.enemies.filter(e => !e.dead).length, kills: this.S.stats.kills, objectives: this.S.objectives.map(o => ({ id: o.id, label: o.label, done: o.done, failed: !!o.failed, progress: o.progress })),
      result: this.S.result, baking: this.sprites.queue.length, cam: { ...this.view.cam } };
  }

  dispose() { this.running = false; cancelAnimationFrame(this.raf); this.controls.dispose(); this.touch?.dispose(); removeEventListener('resize', this.onResize); this.canvas.remove(); this.hud?.detach(); }
}
