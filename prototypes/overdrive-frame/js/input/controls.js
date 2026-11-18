// Reads keyboard + mouse, a controller (twin-stick) and touch into ONE input object per frame, in the sim's terms:
// { mx, mz } a world move vector (W = straight UP the screen — game-standards §1), { ax, az } the aim point in the
// world, held triggers per weapon slot, and presses (quick boost, jump, lock) that last exactly one sim step.
import { ACTIONS, BY_ID, PAD_INDEX, actionOfKey, glyphSetFor } from './bindings.js';
import { toWorld } from '../../../../citykit/js/iso.js';

const DEAD = 0.18;
const stick = (x, y) => { const l = Math.hypot(x, y); if (l < DEAD) return [0, 0]; const k = Math.min(1, (l - DEAD) / (1 - DEAD)) / l; return [x * k, y * k]; };

/** A screen-space direction (x right, y down) → a world x/z unit vector that LOOKS like that direction on screen. */
export function screenToWorldDir(sx, sy) {
  if (!sx && !sy) return [0, 0];
  const w = toWorld(sx, sy, 0); const l = Math.hypot(w[0], w[1]) || 1;
  return [w[0] / l, w[1] / l];
}

export class Controls {
  constructor(target) {
    this.el = target; this.down = new Set(); this.mouseBtn = new Set(); this.pressed = new Set();
    this.mouse = { x: innerWidth / 2, y: innerHeight / 2, on: false };
    this.device = 'keys'; this.glyphs = 'xbox'; this.padAim = [0, 0]; this.padAimLast = [1, 0];
    this.touch = { move: null, aim: null, buttons: new Set() };
    this.enabled = true; this.listeners = [];
    const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); this.listeners.push([el, ev, fn, o]); };
    on(window, 'keydown', e => {
      const id = actionOfKey(e.code); if (!id || !this.enabled) return;
      if (e.target?.closest?.('input, textarea, select')) return;
      if (id !== 'menu') e.preventDefault();
      if (!this.down.has(id)) this.pressed.add(id);
      this.down.add(id); this.device = 'keys';
    });
    on(window, 'keyup', e => { const id = actionOfKey(e.code); if (id) this.down.delete(id); });
    on(window, 'blur', () => { this.down.clear(); this.mouseBtn.clear(); });
    on(target, 'mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.on = true; this.device = 'keys'; });
    on(target, 'mousedown', e => { if (!this.enabled) return; this.mouseBtn.add(e.button); const a = ACTIONS.find(x => x.mouse === e.button); if (a && !a.hold) this.pressed.add(a.id); this.device = 'keys'; e.preventDefault(); });
    on(window, 'mouseup', e => this.mouseBtn.delete(e.button));
    on(target, 'contextmenu', e => e.preventDefault());
  }

  dispose() { for (const [el, ev, fn, o] of this.listeners) el.removeEventListener(ev, fn, o); }

  /** True while an action is held by any device. */
  held(id, pad) {
    const a = BY_ID[id];
    if (this.down.has(id)) return true;
    if (a.mouse != null && this.mouseBtn.has(a.mouse)) return true;
    if (pad && a.pad && PAD_INDEX[a.pad] != null) { const b = pad.buttons[PAD_INDEX[a.pad]]; if (b && (b.pressed || b.value > 0.4)) return true; }
    if (this.touch.buttons.has(id)) return true;
    return false;
  }

  _pad() {
    const pads = navigator.getGamepads?.() || [];
    for (const p of pads) if (p && p.connected && p.mapping === 'standard') return p;
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /**
   * Build this frame's input. mechScreen = where the player's mech is drawn on screen (px), view = { toWorldPoint(px, py) }
   * turns a screen pixel into a world point (the renderer knows the camera).
   */
  read(mechScreen, view) {
    const pad = this._pad();
    const out = { mx: 0, mz: 0, fire: [false, false, false, false], pad: false };
    // pad presses: rising edges
    if (pad) {
      this.glyphs = glyphSetFor(pad.id);
      this._padPrev ||= [];
      pad.buttons.forEach((b, i) => {
        const now = b.pressed || b.value > 0.5; const was = this._padPrev[i];
        if (now && !was) { const a = ACTIONS.find(x => PAD_INDEX[x.pad] === i); if (a && !a.hold) this.pressed.add(a.id); if (a?.id === 'jump') this.pressed.add('jump'); this.device = 'pad'; }
        this._padPrev[i] = now;
      });
    }
    // move: keys, then the left stick, then the touch stick
    let sx = (this.held('right') ? 1 : 0) - (this.held('left') ? 1 : 0), sy = (this.held('down') ? 1 : 0) - (this.held('up') ? 1 : 0);
    if (pad) { const [x, y] = stick(pad.axes[0] || 0, pad.axes[1] || 0); if (x || y) { sx = x; sy = y; this.device = 'pad'; } }
    if (this.touch.move) { sx = this.touch.move[0]; sy = this.touch.move[1]; }
    const sl = Math.hypot(sx, sy);
    if (sl > 0) { const [wx, wz] = screenToWorldDir(sx, sy); const k = Math.min(1, sl); out.mx = wx * k; out.mz = wz * k; }

    // aim: the mouse point, or the right stick's direction from the mech, or the touch aim stick
    let aimPx = null;
    if (pad) {
      const [x, y] = stick(pad.axes[2] || 0, pad.axes[3] || 0);
      if (x || y) { this.padAimLast = [x / Math.hypot(x, y), y / Math.hypot(x, y)]; this.device = 'pad'; }
      if (this.device === 'pad') { out.pad = true; aimPx = [mechScreen.x + this.padAimLast[0] * 220, mechScreen.y + this.padAimLast[1] * 220]; }
    }
    if (this.touch.aim) { out.pad = true; const [x, y] = this.touch.aim; const l = Math.hypot(x, y) || 1; aimPx = [mechScreen.x + x / l * 220, mechScreen.y + y / l * 220]; }
    if (!aimPx && this.mouse.on) aimPx = [this.mouse.x, this.mouse.y];
    if (aimPx) { const w = view.toWorldPoint(aimPx[0], aimPx[1]); out.ax = w.x; out.az = w.z; out.aimPx = aimPx; }

    ACTIONS.forEach(a => { if (a.weapon != null) out.fire[a.weapon] = this.held(a.id, pad); });
    if (this.touch.aim && this.touch.autoFire) out.fire[0] = out.fire[1] = true;
    out.boost = this.held('boost', pad);
    out.jump = this.held('jump', pad);
    out.jumpPressed = this.pressed.has('jump');
    out.qb = this.pressed.has('quick');
    out.lockOnPressed = this.pressed.has('lock');
    out.swap = this.pressed.has('swap');
    out.interact = this.pressed.has('interact');
    out.ping = this.pressed.has('ping');
    out.overload = this.pressed.has('overload');
    out.menu = this.pressed.has('menu');
    out.map = this.pressed.has('map');
    out.device = this.device;
    return out;
  }

  /** Presses are consumed once the sim has stepped with them. */
  consume() { this.pressed.clear(); }
}
