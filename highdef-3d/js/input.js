// Keyboard, mouse and pointer lock, in one place.
//
// Nothing here knows what the keys mean — it only records what is held down and what moved. The
// camera and the character controller read that. Keeping it separate is what makes rebinding a
// one-line change rather than a hunt through three files.

export const DEFAULT_BINDINGS = {
  forward:    ['KeyW', 'ArrowUp'],
  back:       ['KeyS', 'ArrowDown'],
  left:       ['KeyA', 'ArrowLeft'],
  right:      ['KeyD', 'ArrowRight'],
  sprint:     ['ShiftLeft', 'ShiftRight'],
  jump:       ['Space'],
  crouch:     ['ControlLeft', 'KeyC'],
  up:         ['KeyE'],           // RTS camera only: rise
  down:       ['KeyQ'],           // RTS camera only: drop
  rotateLeft: ['KeyZ'],
  rotateRight:['KeyX'],
  toggleView: ['KeyV'],
  wave:       ['KeyF'],
  dance:      ['KeyG'],
  swing:      ['KeyR'],
  roll:       ['KeyB'],
  screenshot: ['F2'],
  hud:        ['KeyH'],
  help:       ['Slash'],
};

export function createInput(target, { bindings = DEFAULT_BINDINGS } = {}) {
  const down = new Set();
  const pressedThisFrame = new Set();
  const state = {
    mouseDX: 0, mouseDY: 0, wheel: 0,
    buttons: new Set(),
    pointerLocked: false,
    pointer: { x: 0, y: 0, inside: false },
    dragging: false,
    enabled: true,
  };

  const isBound = (action, code) => (bindings[action] || []).includes(code);
  const held = (action) => {
    for (const code of bindings[action] || []) if (down.has(code)) return true;
    return false;
  };
  const pressed = (action) => {
    for (const code of bindings[action] || []) if (pressedThisFrame.has(code)) return true;
    return false;
  };

  function onKeyDown(e) {
    if (!state.enabled) return;
    // let the browser have its own shortcuts and anything typed into a field
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.ctrlKey && e.code !== 'ControlLeft') return;
    if (!down.has(e.code)) pressedThisFrame.add(e.code);
    down.add(e.code);
    // stop the page scrolling out from under the game
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { down.delete(e.code); }
  function onBlur() { down.clear(); state.buttons.clear(); state.dragging = false; }

  function onMouseDown(e) {
    if (!state.enabled) return;
    state.buttons.add(e.button);
    state.dragging = true;
    if (e.button === 1) e.preventDefault();
  }
  function onMouseUp(e) { state.buttons.delete(e.button); if (!state.buttons.size) state.dragging = false; }
  function onMouseMove(e) {
    const r = target.getBoundingClientRect();
    state.pointer.x = (e.clientX - r.left) / r.width;
    state.pointer.y = (e.clientY - r.top) / r.height;
    state.pointer.inside = state.pointer.x >= 0 && state.pointer.x <= 1 && state.pointer.y >= 0 && state.pointer.y <= 1;
    if (state.pointerLocked) {
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
    } else if (state.dragging) {
      state.mouseDX += e.movementX || 0;
      state.mouseDY += e.movementY || 0;
    }
  }
  function onWheel(e) {
    if (!state.enabled) return;
    state.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }
  function onContext(e) { e.preventDefault(); }
  function onLockChange() { state.pointerLocked = document.pointerLockElement === target; }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  target.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);
  target.addEventListener('wheel', onWheel, { passive: false });
  target.addEventListener('contextmenu', onContext);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    state, bindings, held, pressed, isBound,
    isDown: (code) => down.has(code),
    /** Axis from a pair of actions, -1 … 1. */
    axis(neg, pos) { return (held(pos) ? 1 : 0) - (held(neg) ? 1 : 0); },
    requestLock() { target.requestPointerLock?.(); },
    exitLock() { if (document.pointerLockElement === target) document.exitPointerLock(); },
    /** Call once at the end of each frame: clears the one-shot deltas. */
    endFrame() {
      state.mouseDX = 0; state.mouseDY = 0; state.wheel = 0;
      pressedThisFrame.clear();
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      target.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('wheel', onWheel);
      target.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
