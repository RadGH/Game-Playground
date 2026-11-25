// One input layer for keyboard + mouse, controller and touch, read through the binding table (bindings.js).
//   const I = createInput({ canvas, bindings, blocked })   blocked() = true while a window/menu has the input
//   I.held('attack')  I.take('dodge') (a press, once)  I.moveAxis() → {x, y}  I.takeLook() → {dx, dy} (mouse px / pad)
//   I.device  'keys' | 'pad' | 'touch' (the last one used: hints follow it)   I.lock() / I.unlock() pointer lock
//   I.touch   filled by the on-screen controls (ui/touch.js): { move:{x,y}, look:{dx,dy}, held:Set, presses:Set }
// The mouse pointer hides while keys or a pad are in use and shows again on mouse move (lessons rule 71).
import { ACTIONS, PAD_CHORD } from './bindings.js';

export function createInput({ canvas, bindings, blocked = () => false }) {
  const down = new Set();                 // key codes + 'Mouse0..2' held
  const presses = new Set();              // actions pressed since the last take
  const padPrev = [];
  const look = { dx: 0, dy: 0 };
  let wheel = 0;
  let lastMove = 0, lockAt = 0, avg = 8;
  const I = {
    // a phone starts as 'touch' (hints say Tap, not E, before the first touch lands)
    device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys', bindings, locked: false, pad: null, wheelZoom: 0,
    touch: { move: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, held: new Set(), presses: new Set() },
    onDevice: null, onFreeClick: null,
    held(action) {
      if (I.touch.held.has(action)) return true;
      const b = I.bindings[action]; if (!b) return false;
      if (!blocked() || action === 'freeMouse') for (const k of b.keys) if (down.has(k)) return true;
      const pad = I.pad;
      if (pad && !blocked()) {
        const chord = pad.buttons[4]?.pressed || pad.buttons[5]?.pressed;
        for (const i of b.pad) { if (chord && [0, 1, 2, 3].includes(i)) continue; if (pad.buttons[i]?.pressed) return true; }
        const slot = /^slot(\d)$/.exec(action);
        if (slot) { const n = +slot[1], sh = n <= 4 ? 4 : 5; if (pad.buttons[sh]?.pressed && pad.buttons[PAD_CHORD[sh][(n - 1) % 4]]?.pressed) return true; }
      }
      return false;
    },
    take(action) { const had = presses.has(action) || I.touch.presses.has(action); presses.delete(action); I.touch.presses.delete(action); return had; },
    clearPresses() { presses.clear(); I.touch.presses.clear(); },
    moveAxis() {
      let x = 0, y = 0;
      if (!blocked()) {
        if (I.held('forward')) y += 1; if (I.held('back')) y -= 1;
        if (I.held('right')) x += 1; if (I.held('left')) x -= 1;
        const p = I.pad;
        if (p) { const ax = p.axes[0] || 0, ay = p.axes[1] || 0; if (Math.hypot(ax, ay) > 0.18) { x += ax; y -= ay; } }
      }
      x += I.touch.move.x; y += I.touch.move.y;
      const l = Math.hypot(x, y);
      return l > 1 ? { x: x / l, y: y / l } : { x, y };
    },
    takeLook() {
      const out = { dx: look.dx + I.touch.look.dx, dy: look.dy + I.touch.look.dy };
      look.dx = look.dy = 0; I.touch.look.dx = I.touch.look.dy = 0;
      return out;
    },
    takeWheel() { const w = wheel; wheel = 0; return w; },
    lock() {
      if (I.locked || matchMedia('(pointer: coarse)').matches) return;
      // A browser driven by a test (Playwright, game-eye) only PRETENDS to lock: a real pointer lock in headless Chrome
      // leaks ~30 MB a second until the machine runs out of memory (2026-11-24 — it took down the tmux session).
      if (navigator.webdriver) { I.locked = true; lockAt = performance.now(); return; }
      try { const r = canvas.requestPointerLock({ unadjustedMovement: true }); r?.catch?.(() => canvas.requestPointerLock()); } catch { try { canvas.requestPointerLock(); } catch { /* not allowed */ } }
    },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); else if (navigator.webdriver) I.locked = false; },
    /** Read the controller once per frame (also the right stick into `look`). */
    poll(dt) {
      const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected) || null;
      I.pad = pad;
      if (!pad) return;
      let any = false;
      pad.buttons.forEach((b, i) => {
        const was = padPrev[i] || false;
        if (b.pressed && !was) {
          any = true;
          if (!blocked()) {
            const chord = (pad.buttons[4]?.pressed && i !== 4) ? 4 : (pad.buttons[5]?.pressed && i !== 5) ? 5 : null;
            if (chord && PAD_CHORD[chord].includes(i)) presses.add(`slot${(chord === 4 ? 0 : 4) + PAD_CHORD[chord].indexOf(i) + 1}`);
            else for (const [, id, , , padb] of ACTIONS) if ((I.bindings[id]?.pad || padb).includes(i)) presses.add(id);
          } else if (i === 9) presses.add('menu');
        }
        padPrev[i] = b.pressed;
      });
      const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      if (Math.hypot(rx, ry) > 0.15 && !blocked()) { look.dx += Math.sign(rx) * Math.pow(Math.abs(rx), 1.6) * 900 * dt; look.dy += Math.sign(ry) * Math.pow(Math.abs(ry), 1.6) * 600 * dt; any = true; }
      if (Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > 0.3) any = true;
      if (any) setDevice('pad');
    },
  };
  function setDevice(d) {
    if (I.device === d) return;
    I.device = d;
    document.body.dataset.device = d;
    I.onDevice?.(d);
  }
  const actionsFor = code => ACTIONS.filter(a => (I.bindings[a[1]]?.keys || a[3]).includes(code)).map(a => a[1]);
  addEventListener('keydown', e => {
    if (e.target?.closest?.('input, textarea, select')) return;
    setDevice('keys');
    document.body.classList.add('ow-nomouse');
    if (!down.has(e.code)) for (const a of actionsFor(e.code)) if (!blocked() || a === 'menu' || a === 'freeMouse' || ['bag', 'sheet', 'levelup', 'classes', 'talents', 'spellbook', 'quests', 'trade', 'map'].includes(a)) presses.add(a);
    down.add(e.code);
    if (!blocked() && (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'AltLeft' || e.code === 'Backquote')) e.preventDefault();
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); });
  canvas.addEventListener('mousedown', e => {
    const code = 'Mouse' + e.button;
    // a free mouse (or a phone tap's mouse echo) on a person / corpse / chest / shrine uses it instead of attacking
    if (!I.locked && e.button === 0 && !blocked() && I.onFreeClick?.(e.clientX, e.clientY)) return;
    if (e.sourceCapabilities?.firesTouchEvents) return;   // a phone tap is not an attack
    setDevice('keys');
    if (!blocked() && !I.locked && !I.held('freeMouse')) I.lock();
    down.add(code);
    for (const a of actionsFor(code)) presses.add(a);
  });
  addEventListener('mouseup', e => down.delete('Mouse' + e.button));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    document.body.classList.remove('ow-nomouse');
    if (!I.locked) return;
    const t = performance.now();
    if (t - lockAt < 120) return;                       // Chrome's first jump after the lock (lessons rule 55c)
    const m = Math.hypot(e.movementX, e.movementY);
    if (m > Math.max(200, avg * 12)) return;            // a glitch far bigger than the recent moves
    avg = avg * 0.9 + m * 0.1;
    look.dx += e.movementX; look.dy += e.movementY;
    lastMove = t;
  });
  canvas.addEventListener('wheel', e => { if (!blocked()) { wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
  document.addEventListener('pointerlockchange', () => { I.locked = document.pointerLockElement === canvas; if (I.locked) lockAt = performance.now(); });
  addEventListener('pointerdown', e => { if (e.pointerType === 'touch') setDevice('touch'); });
  addEventListener('gamepadconnected', () => setDevice('pad'));
  return I;
}
