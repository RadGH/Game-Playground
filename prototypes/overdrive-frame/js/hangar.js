// The hangar hub (owner ruling: "the hangar is a walkable hub, not menus"): you walk your own frame round a big lit
// hangar; every shop or station is a bay you walk up to. Runs the mission engine on the hangar map (sim/hangarmap.js)
// with no waves and no objectives, so it never ends; weapons never fire here. Same fixed iso view as the missions,
// everything prerendered (City Kit + Mech Kit pictures). Modelled on play.js.
//
// The page owns the bay screens: standing in a bay's circle shows a prompt ("Assembly bay · G"); pressing Use (or
// tapping the prompt) calls onBay(id). The page then calls pause(true) while its screen is open, pause(false) after.
import { createMission, stepMission } from './sim/mission.js';
import { buildMissionDef } from './sim/missiondef.js';
import { makeMech } from './sim/mech.js';
import { arm } from './sim/weapons.js';
import { mechStats, weaponSpec } from './sim/loadout.js';
import { View } from './render/view.js';
import { makeEventFx } from './render/events.js';
import { Controls } from './input/controls.js';
import { installTouch } from './input/touch.js';
import { hintFor } from './input/bindings.js';
import { TILE_W, TILE_H, dirOfHeading } from '../../../citykit/js/iso.js';
import { startSound, resume } from '../../../citykit/js/world/sound.js';
import './render/props.js';

const STEP = 1 / 30;
export const HANGAR_MISSION = { id: 'hangar', name: 'Hangar', map: { kind: 'hangar', seed: 1 }, night: 0.35 };

/** css/hangar.css, loaded once by whichever screen needs it first (the hangar or the range). */
export function ensureHangarCss() {
  if (document.querySelector('link[data-of-hangar]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../css/hangar.css', import.meta.url).href; l.dataset.ofHangar = '';
  document.head.append(l);
}

/** The sim mech for a build (same as play.js: empty weapon slots get a do-nothing weapon). */
export function mechFor(build, P, name, pid = 'p1') {
  const st = mechStats(build, P);
  const weapons = build.weapons.map((w, i) => { const p = w && P[typeof w === 'string' ? w : w.id]; return p ? arm(weaponSpec(p, typeof w === 'object' ? w : null, st), i) : arm({ id: 'none', kind: 'none', dmg: 0, rate: 1, range: 1, speed: 1 }, i); });
  const m = makeMech({ id: 'm-' + pid, x: 0, z: 0, stats: st, weapons, paint: build.paint, name });
  m.build = build; return m;
}

export class Hangar {
  /**
   * @param {{ root: HTMLElement, T: object, P: object, kinds: object, sprites: Sprites, mechArt: MechArt, build: object,
   *   pilotName?: string, onBay: (id: string) => void, onMenu: () => void, night?: number }} o
   */
  constructor(o) {
    Object.assign(this, o);
    this.pid = 'p1';
    ensureHangarCss();
    this.def = buildMissionDef(HANGAR_MISSION);
    this.bays = this.def.map.bays;
    this.sprites.lights = true;                       // indoor light: the neon signs and work lights glow
    this.mech = mechFor(o.build, o.P, o.pilotName, this.pid);
    this.mech.face = this.mech.aim = -Math.PI * 0.75;   // facing up the screen, toward the bays
    this.S = createMission(this.def, { kinds: o.kinds, T: o.T, players: [{ id: this.pid, mech: this.mech }], seed: 1 });
    this.S.localPid = this.pid;

    this.el = document.createElement('div'); this.el.className = 'of-hangar';
    this.el.innerHTML = `
      <canvas class="of-play" aria-label="The hangar: walk your frame to a bay"></canvas>
      <button type="button" class="of-hg-prompt" hidden></button>
      <button type="button" class="of-hg-menu" aria-label="Menu">☰</button>`;
    o.root.append(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.promptEl = this.el.querySelector('.of-hg-prompt');
    this.promptEl.addEventListener('click', () => { if (this.near && !this.paused) this.onBay?.(this.near.id); });
    this.el.querySelector('.of-hg-menu').addEventListener('click', () => { if (!this.paused) this.onMenu?.(); });

    // a little wider than a mission's view, so a bay or two is always in sight
    this.view = new View(this.canvas, o.sprites, { zoom: (o.T.cameraZoom || 2.5) * 0.8 });
    this.view.night = o.night ?? HANGAR_MISSION.night;
    this.view.mechDrawer = o.mechArt.draw;
    this.view.cam.x = this.def.start[0].x; this.view.cam.z = this.def.start[0].z - 1;
    this.view.underlay = (ctx, P, t) => this._rings(ctx, t);
    this.controls = new Controls(this.canvas);
    this.touch = installTouch(this.controls, this.el, { mode: 'hangar' });
    this.fxOf = makeEventFx(this.view, { deathSprite: () => null, localId: () => this.mech.id, pan: () => 0 });

    this.acc = 0; this.last = performance.now(); this.t = 0; this.running = true; this.paused = false; this.near = null;
    this.prev = new Map();
    this._queueBakes();
    this._mechSteps = this._mechBakeOrder(o.build);
    this.onResize = () => this.view.resize(); addEventListener('resize', this.onResize);
    this.canvas.addEventListener('pointerdown', () => { startSound(); resume(); });
    this.raf = requestAnimationFrame(this.frame);
  }

  lerp = (o) => {
    const p = this.prev.get(o.id); if (!p) return o;
    const a = this.alpha ?? 1; return { x: p[0] + (o.x - p[0]) * a, z: p[1] + (o.z - p[1]) * a, y: (p[2] ?? 0) + ((o.y ?? 0) - (p[2] ?? 0)) * a };
  };

  frame = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (!this.paused) {
      this.acc += dt;
      const me = this.lerp(this.mech), s = this.view.P(me.x, me.z, (me.y || 0) + 0.4);
      const inp = this.controls.read({ x: s.sx, y: s.sy }, this.view);
      inp.fire = [false, false, false, false]; inp.lockOnPressed = false;    // nothing fires in the hangar
      if (inp.menu) { this.controls.consume(); this.onMenu?.(); }
      else if (inp.interact && this.near) { this.controls.consume(); this.onBay?.(this.near.id); }
      let steps = 0;
      while (!this.paused && this.acc >= STEP && steps < 4) {
        this.prev.clear();
        for (const m of this.S.mechs) this.prev.set(m.id, [m.x, m.z, m.y]);
        const ev = stepMission(this.S, { [this.pid]: inp }, STEP);
        for (const e of ev) this.fxOf(e, this.S);
        this.controls.consume();
        this.acc -= STEP; steps++;
        inp.qb = inp.jumpPressed = false;
      }
      if (steps === 4) this.acc = 0;
      this.alpha = Math.min(1, this.acc / STEP);
      this.lastInput = inp;
    }
    const me = this.lerp(this.mech);
    this.near = this._nearBay(me);
    // the camera leads the aim only a little here (no fight to look ahead at)
    this.view.follow(me.x, me.z, this.lastInput?.ax ?? me.x, this.lastInput?.az ?? me.z, dt, 0.12, 1.2);
    this._feed();
    this.sprites.work(this.t < 4 ? 14 : this.paused ? 10 : 5);
    this.view.draw(this.S, this.lerp, this.mech, dt, this.t);
    this._prompt();
  };

  /** The bay whose circle the frame stands in (nearest wins), or null. */
  _nearBay(me) {
    let best = null, bd = Infinity;
    for (const b of this.bays) { const d = Math.hypot(b.x - me.x, b.z - me.z); if (d < b.r && d < bd) { bd = d; best = b; } }
    return best;
  }

  /** Each bay's walk-up circle painted on the floor; the one you stand in glows and pulses. */
  _rings(ctx, t) {
    const z = this.view.zoom;
    for (const b of this.bays) {
      const on = this.near === b, p = this.view.P(b.x, b.z), rx = b.r * TILE_W * 0.5 * z * Math.SQRT2, ry = b.r * TILE_H * 0.5 * z * Math.SQRT2;
      ctx.save(); ctx.strokeStyle = b.color; ctx.lineWidth = (on ? 2.5 : 1.5) * z * 0.6;
      ctx.globalAlpha = on ? 0.75 + 0.25 * Math.sin(t * 5) : 0.32 + 0.1 * Math.sin(t * 1.6 + b.x); ctx.setLineDash(on ? [] : [6 * z, 5 * z]); ctx.lineDashOffset = -t * 9 * z;   // idle circles slowly march: the hall is never still
      ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
      if (on) { ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rx); g.addColorStop(0, hexA(b.color, 0.22)); g.addColorStop(1, hexA(b.color, 0)); ctx.fillStyle = g; ctx.translate(p.sx, p.sy); ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }

  /** The in-world prompt over the bay you stand in: its name + the Use key for the device in use (keys, pad, touch). */
  _prompt() {
    const b = this.paused ? null : this.near, el = this.promptEl;
    if (!b) { if (!el.hidden) el.hidden = true; return; }
    const dev = this.controls.device, gl = this.controls.glyphs, sig = b.id + '|' + dev + '|' + gl;
    if (this._sig !== sig) {
      this._sig = sig;
      const key = hintFor('interact', dev, gl);
      el.innerHTML = `<b>${b.label}</b>${dev === 'touch' ? '<span class="of-hg-tap">Open</span>' : `<kbd>${key}</kbd><span>Open</span>`}`;
      el.style.setProperty('--bay', b.color);
      el.setAttribute('aria-label', `Open the ${b.label}`);
    }
    // above the bay circle, kept fully on screen (a phone is narrow)
    const p = this.view.P(b.x, b.z, 1.35), w = el.offsetWidth || 220, h = el.offsetHeight || 44;
    const x = Math.max(8, Math.min(this.view.W - w - 8, p.sx - w / 2)), y = Math.max(64, Math.min(this.view.H - h - 8, p.sy - h));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (el.hidden) el.hidden = false;
  }

  /** Bake the hangar's pictures nearest the start first (the view falls back to plain blocks until each is ready). */
  _queueBakes() {
    const st = this.def.start[0];
    const lots = [...this.S.world.lots].sort((a, b) => Math.hypot(a.x + a.w / 2 - st.x, a.z + a.d / 2 - st.z) - Math.hypot(b.x + b.w / 2 - st.x, b.z + b.d / 2 - st.z));
    for (const l of lots) { if (!l.recipe) continue; if (l.face != null) this.sprites.facing(l.recipe, l.params || {}, l.face); else this.sprites.building(l.recipe, l.params || {}, 0); }
  }

  /** The frame's poses: standing + walking in the facing it has now first, then the facings round it, then the rest. */
  _mechBakeOrder(build) {
    const L = this.mechArt.layersFor(build), d0 = dirOfHeading(this.mech.face, 16, 0), out = [];
    const dirs = [...Array(16).keys()].sort((a, b) => Math.min(Math.abs(a - d0), 16 - Math.abs(a - d0)) - Math.min(Math.abs(b - d0), 16 - Math.abs(b - d0)));
    for (const d of dirs) { out.push(() => L.legs('idle', 0, d), () => L.upper('idle', 0, d)); for (let f = 0; f < 8; f++) out.push(() => L.legs('walk', f, d)); }
    return out.concat([...this.mechArt.prebakeSteps(build, 'rest')]);
  }

  _feed() {
    if (!this._mechSteps.length) return;
    const t0 = performance.now(), budget = this.t < 3 ? 24 : 6;
    do { try { this._mechSteps.shift()(); } catch (e) { console.warn('[overdrive] hangar mech bake', e); } } while (this._mechSteps.length && performance.now() - t0 < budget);
  }

  /** A bay screen is open: stop input and the sim, keep drawing. */
  pause(on) {
    this.paused = !!on; this.controls.enabled = !on;
    this.controls.down.clear(); this.controls.mouseBtn.clear(); this.controls.pressed.clear();
    this.controls.touch.move = null; this.controls.touch.buttons.clear();
    if (!on) { this.acc = 0; this.last = performance.now(); }
    this._prompt();
  }

  /** The player's frame changed (new parts, weapons, paint): swap the mech in place and bake its new poses. */
  setBuild(build) {
    const old = this.mech, m = mechFor(build, this.P, this.pilotName, this.pid);
    for (const k of ['x', 'z', 'y', 'face', 'aim']) m[k] = old[k];
    this.S.mechs[this.S.mechs.indexOf(old)] = m; this.S.players[0].mech = m; this.S.byId.delete(old.id); this.S.byId.set(m.id, m); m.pid = this.pid;
    this.mech = m; this.build = build;
    this._mechSteps = this._mechBakeOrder(build);
  }

  /** For game-eye and the tests. */
  state() {
    const m = this.mech;
    return { screen: 'hangar', mech: { x: +m.x.toFixed(2), z: +m.z.toFixed(2) }, near: this.near?.id || null, paused: this.paused, baking: this.sprites.queue.length + this._mechSteps.length };
  }

  dispose() {
    this.running = false; cancelAnimationFrame(this.raf); this.controls.dispose(); this.touch?.dispose();
    removeEventListener('resize', this.onResize); this.el.remove();
  }
}

function hexA(h, a) { const v = parseInt(h.slice(1), 16); return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`; }
