// Gamepads as devices (PLAN §9.1, §9.3, §9.4).
//
// The device manager calls `pollGamepads(manager)` every frame: new pad indices become devices,
// vanished ones are marked disconnected (the seat then sends idle commands so lockstep never waits
// on a local device). Each device's poll() returns the same DeviceFrame shape as the keyboard:
//   { device, pressed, held, released, rawPressed, pointer:null, stickL:{x,y}, stickR:{x,y}, triggers }
// plus synthesised menu actions navUp/navDown/navLeft/navRight from the d-pad OR the left stick,
// with key-repeat while held, so every screen is usable by pad alone.
//
// Gamepads only exist on secure pages (https or localhost): `gamepadsAvailable()` says so, and the
// lobby shows a one-line notice with the https link when it is false.

import { actionsFor } from './bindings.js';
import { layoutFor, padLabel } from './padmap.js';

const DEAD = 0.22;
const NAV_DELAY = 0.38, NAV_REPEAT = 0.12;

export function gamepadsAvailable() {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' && (typeof window === 'undefined' || window.isSecureContext !== false);
}

function deadzone(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return { x: x * k, y: y * k };
}

/** Read one Gamepad into { held:Set<name>, lx, ly, rx, ry, lt, rt }. */
export function readPad(pad) {
  const L = layoutFor(pad);
  const held = new Set();
  pad.buttons.forEach((b, i) => {
    const name = L.buttons[i];
    if (!name) return;
    const v = typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5;
    if (v) held.add(name);
  });
  const ax = (i) => (i != null && pad.axes[i] != null ? pad.axes[i] : 0);
  let lt = 0, rt = 0;
  if (L.triggerAxes) {
    lt = (ax(L.triggerAxes.LT) + 1) / 2; rt = (ax(L.triggerAxes.RT) + 1) / 2;
    // Some drivers rest triggers at 0 rather than -1 until first pulled.
    if (pad.axes[L.triggerAxes.LT] === 0) lt = 0;
    if (pad.axes[L.triggerAxes.RT] === 0) rt = 0;
    if (lt > 0.5) held.add('LT');
    if (rt > 0.5) held.add('RT');
  } else {
    lt = held.has('LT') ? 1 : 0; rt = held.has('RT') ? 1 : 0;
  }
  if (L.hat) {
    const hx = ax(L.hat.x), hy = ax(L.hat.y);
    if (hx < -0.5) held.add('DLeft'); if (hx > 0.5) held.add('DRight');
    if (hy < -0.5) held.add('DUp'); if (hy > 0.5) held.add('DDown');
  }
  return { held, lx: ax(L.axes.LX), ly: ax(L.axes.LY), rx: ax(L.axes.RX), ry: ax(L.axes.RY), lt, rt, layout: L.name };
}

export function createGamepadDevice(pad) {
  const id = 'pad' + pad.index;
  let prev = new Set();
  let snap = null;
  let connected = true;
  let lastActivity = 0;
  const navHold = { navUp: 0, navDown: 0, navLeft: 0, navRight: 0 };
  let lastNow = performance.now();

  const dev = {
    id, type: 'gamepad', index: pad.index, icon: 'gamepad',
    label: padLabel(pad), padId: pad.id, mapping: pad.mapping,
    duplicate: false,
    get connected() { return connected; },
    set connected(v) { connected = v; },
    get lastActivity() { return lastActivity; },
    /** Feed the latest Gamepad object (called by pollGamepads before poll()). */
    feed(p) { snap = p ? readPad(p) : null; },
    poll() {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
      const held = snap && connected ? snap.held : new Set();
      const rawPressed = [], rawReleased = [];
      for (const b of held) if (!prev.has(b)) rawPressed.push(b);
      for (const b of prev) if (!held.has(b)) rawReleased.push(b);
      prev = new Set(held);
      if (rawPressed.length) lastActivity = now;
      const map = (list) => { const out = new Set(); for (const b of list) for (const a of actionsFor('gamepad', b)) out.add(a); return out; };
      const stickL = snap && connected ? deadzone(snap.lx, snap.ly) : { x: 0, y: 0 };
      const stickR = snap && connected ? deadzone(snap.rx, snap.ry) : { x: 0, y: 0 };
      const frame = {
        device: id,
        pressed: map(rawPressed), released: map(rawReleased), held: map(held),
        rawPressed, rawHeld: held,
        pointer: null, wheel: 0, drag: null,
        stickL, stickR,
        triggers: { lt: snap?.lt || 0, rt: snap?.rt || 0 },
      };
      // Menu navigation from the d-pad or the left stick, repeating while held.
      const dir = {
        navUp: held.has('DUp') || stickL.y < -0.55,
        navDown: held.has('DDown') || stickL.y > 0.55,
        navLeft: held.has('DLeft') || stickL.x < -0.55,
        navRight: held.has('DRight') || stickL.x > 0.55,
      };
      for (const k in dir) {
        if (!dir[k]) { navHold[k] = 0; continue; }
        if (navHold[k] === 0) { frame.pressed.add(k); navHold[k] = NAV_DELAY; continue; }
        navHold[k] -= dt;
        if (navHold[k] <= 0) { frame.pressed.add(k); navHold[k] = NAV_REPEAT; }
      }
      for (const k in dir) if (dir[k]) frame.held.add(k);
      return frame;
    },
    destroy() { connected = false; },
  };
  return dev;
}

/**
 * Per-frame: sync devices with navigator.getGamepads(). New pads are added, gone pads are marked
 * disconnected (kept, so the lobby can show "Player 2, press A" and re-claim by the next pad).
 */
export function pollGamepads(manager) {
  if (!gamepadsAvailable()) return;
  let pads;
  try { pads = navigator.getGamepads() || []; } catch { return; }
  const seen = new Set();
  for (const p of pads) {
    if (!p || p.connected === false) continue;
    const id = 'pad' + p.index;
    seen.add(id);
    let dev = manager.devices.get(id);
    if (!dev || dev.padId !== p.id) {
      if (dev) manager.removeDevice(id);
      dev = createGamepadDevice(p);
      manager.addDevice(dev);
    }
    dev.connected = true;
    dev.feed(p);
  }
  for (const dev of manager.devices.values()) {
    if (dev.type === 'gamepad' && !seen.has(dev.id)) { dev.connected = false; dev.feed(null); }
  }
}
