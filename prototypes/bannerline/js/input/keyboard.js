// Keyboard + mouse as ONE device (browsers cannot tell two keyboards apart, PLAN §9.1).
//
// The device never talks to the sim. Each frame `poll()` returns a DeviceFrame:
//   { pressed:Set<action>, held:Set<action>, released:Set<action>,
//     pointer:{x,y,inside}, wheel:number, drag:{dx,dy}, stickL:null, stickR:null }
// and js/input/commands.js turns that into sim commands for the seat that owns the device.
// Gamepads (M2) return the same shape with stickL/stickR filled in, so a seat does not care.

import { actionsFor } from './bindings.js';

function typingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

// Inputs whose browser default must never fire while the game owns the keyboard.
const SWALLOW = new Set(['Tab', 'Space', 'F10', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function createKeyboardDevice({ root = document.body, type = 'keyboard' } = {}) {
  const down = new Set();          // physical inputs held right now
  const edgeDown = [];             // physical inputs pressed since last poll
  const edgeUp = [];
  const pointer = { x: 0, y: 0, inside: false, clientX: 0, clientY: 0 };
  let wheel = 0;
  let drag = { dx: 0, dy: 0 };
  let lastActivity = 0;
  let enabled = true;

  function press(input) {
    if (!down.has(input)) { down.add(input); edgeDown.push(input); }
    lastActivity = performance.now();
  }
  function release(input) {
    if (down.has(input)) { down.delete(input); edgeUp.push(input); }
  }

  const onKeyDown = (e) => {
    if (!enabled || typingTarget(e.target)) return;    // join keys ignored while typing (PLAN §9.3)
    if (SWALLOW.has(e.code)) e.preventDefault();
    if (e.repeat) {
      // Menus want held arrows to repeat; nothing else does.
      if (e.code.startsWith('Arrow')) { edgeDown.push(e.code); lastActivity = performance.now(); }
      return;
    }
    press(e.code);
  };
  const onKeyUp = (e) => { release(e.code); };
  const onBlur = () => { for (const k of [...down]) release(k); };

  const toLocal = (e) => {
    const r = root.getBoundingClientRect();
    pointer.clientX = e.clientX; pointer.clientY = e.clientY;
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x < r.width && pointer.y < r.height;
  };
  const onMouseMove = (e) => {
    toLocal(e);
    if (down.has('Mouse1')) { drag.dx += e.movementX || 0; drag.dy += e.movementY || 0; }
  };
  const onMouseDown = (e) => {
    if (!enabled) return;
    toLocal(e);
    // Only clicks on the game surface count; clicks on HUD buttons are handled by the buttons.
    if (e.target.closest?.('[data-ui]')) return;
    if (e.button === 1 || e.button === 2) e.preventDefault();
    press('Mouse' + e.button);
  };
  const onMouseUp = (e) => { release('Mouse' + e.button); };
  const onWheel = (e) => {
    if (!enabled || e.target.closest?.('[data-ui]')) return;
    e.preventDefault();
    wheel += Math.sign(e.deltaY);
    const input = e.deltaY < 0 ? 'WheelUp' : 'WheelDown';
    edgeDown.push(input); edgeUp.push(input);
  };
  const onContext = (e) => { if (!e.target.closest?.('[data-ui-menu]')) e.preventDefault(); };
  const onLeave = () => { pointer.inside = false; };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('mousemove', onMouseMove);
  root.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  root.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('contextmenu', onContext);
  root.addEventListener('mouseleave', onLeave);

  function mapAll(inputs) {
    const out = new Set();
    for (const i of inputs) for (const a of actionsFor(type, i)) out.add(a);
    return out;
  }

  return {
    id: 'kbm',
    type,
    label: 'Keyboard + mouse',
    icon: 'keyboard',
    connected: true,
    get lastActivity() { return lastActivity; },
    set enabled(v) { enabled = !!v; if (!v) onBlur(); },
    get enabled() { return enabled; },
    /** True while a physical input is down (for things like "Shift held"). */
    isDown(input) { return down.has(input); },
    poll() {
      const frame = {
        device: 'kbm',
        pressed: mapAll(edgeDown),
        released: mapAll(edgeUp),
        held: mapAll(down),
        rawPressed: edgeDown.slice(),
        pointer: { ...pointer },
        wheel,
        drag,
        stickL: null,
        stickR: null,
      };
      edgeDown.length = 0; edgeUp.length = 0; wheel = 0; drag = { dx: 0, dy: 0 };
      return frame;
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('mousemove', onMouseMove);
      root.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('contextmenu', onContext);
      root.removeEventListener('mouseleave', onLeave);
    },
  };
}
