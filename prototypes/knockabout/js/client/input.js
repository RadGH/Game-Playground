// Every input device on this screen, read the same way. A DEVICE is one thing a person holds:
//   'kb1'   keyboard left half   (WASD, Space jump, Q/E grab-punch, Z/C raise, Shift duck, Esc menu)
//   'kb2'   keyboard right half  (arrows, Right Ctrl / Numpad 0 jump, Numpad 7 / , and Numpad 9 / . grab-punch,
//                                 Numpad 4 / K and Numpad 6 / L raise, Right Shift duck)
//   'pad0'… 'pad3'  each gamepad (standard mapping: A jump, L1/R1 grab-punch, X/Y raise, B duck, Start menu)
//   'touch' the on-screen stick and buttons (touch.js feeds it)
//
//   const input = createInput();
//   input.poll();                         // once a frame
//   input.held(dev)  -> { mx, mz, jump, grabL, grabR, raiseL, raiseR, duck, menu }   (what the SIM wants, held states)
//   input.edges(dev) -> { up, down, left, right, a, b, x, y, start, any }             (presses this frame, for menus)
//   input.devices()  -> devices that pressed anything this frame (the lobby's "press any button to join")
//
// Taps vs holds are NOT decided here (the sim does it). mx/mz are world-relative: +x right, +z toward the camera.
const K1 = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'], grabL: ['KeyQ'], grabR: ['KeyE'], raiseL: ['KeyZ'], raiseR: ['KeyC'], duck: ['ShiftLeft'], menu: ['Escape'] };
const K2 = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ControlRight', 'Numpad0', 'Enter', 'NumpadEnter'], grabL: ['Numpad7', 'Comma'], grabR: ['Numpad9', 'Period'], raiseL: ['Numpad4', 'KeyK'], raiseR: ['Numpad6', 'KeyL'], duck: ['ShiftRight'], menu: ['Backspace'] };
const KB = { kb1: K1, kb2: K2 };
const CODES = { kb1: new Set(Object.values(K1).flat()), kb2: new Set(Object.values(K2).flat()) };
export const DEVICE_NAMES = { kb1: 'Keyboard (left)', kb2: 'Keyboard (right)', touch: 'Touch screen' };
export const deviceName = d => DEVICE_NAMES[d] || (d.startsWith('pad') ? 'Controller ' + (+d.slice(3) + 1) : d);
/** Short button labels per device, for the hints on screen. */
export const BUTTONS = {
  pad: { jump: 'A', grabL: 'L1', grabR: 'R1', raiseL: 'X', raiseR: 'Y', duck: 'B', menu: 'Start', a: 'A', b: 'B', x: 'X', y: 'Y' },
  kb1: { jump: 'Space', grabL: 'Q', grabR: 'E', raiseL: 'Z', raiseR: 'C', duck: 'Shift', menu: 'Esc', a: 'Space', b: 'Shift', x: 'Z', y: 'C' },
  kb2: { jump: 'R-Ctrl', grabL: 'Num7', grabR: 'Num9', raiseL: 'Num4', raiseR: 'Num6', duck: 'R-Shift', menu: 'Bksp', a: 'Enter', b: 'R-Shift', x: 'Num4', y: 'Num6' },
  touch: { jump: 'JUMP', grabL: 'L', grabR: 'R', raiseL: '▲L', raiseR: '▲R', duck: '', menu: '☰', a: 'tap', b: 'back', x: '', y: '' },
};
export const buttonsFor = d => BUTTONS[d?.startsWith('pad') ? 'pad' : d] || BUTTONS.pad;
const EMPTY = Object.freeze({ mx: 0, mz: 0, jump: false, grabL: false, grabR: false, raiseL: false, raiseR: false, duck: false, menu: false });
const NOEDGE = Object.freeze({ up: false, down: false, left: false, right: false, a: false, b: false, x: false, y: false, start: false, any: false });

export function createInput() {
  const keys = new Set(), pressedKeys = new Set();     // pressedKeys: went down since the last poll
  const typing = () => /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  addEventListener('keydown', e => {
    if (typing()) return;
    if (!keys.has(e.code)) pressedKeys.add(e.code);
    keys.add(e.code);
    if (/^(Arrow|Space$|Tab$|Backspace$|Numpad)/.test(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const touch = { st: { ...EMPTY }, pressed: new Set() };
  let held = {}, edges = {}, active = [], prevPad = {}, prevStick = {};
  const has = (dev, act) => KB[dev][act].some(c => keys.has(c));
  const hit = (dev, act) => KB[dev][act].some(c => pressedKeys.has(c));

  function poll() {
    held = {}; edges = {}; active = [];
    for (const dev of ['kb1', 'kb2']) {
      let mx = (has(dev, 'right') ? 1 : 0) - (has(dev, 'left') ? 1 : 0), mz = (has(dev, 'down') ? 1 : 0) - (has(dev, 'up') ? 1 : 0);
      const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
      held[dev] = { mx, mz, jump: has(dev, 'jump'), grabL: has(dev, 'grabL'), grabR: has(dev, 'grabR'), raiseL: has(dev, 'raiseL'), raiseR: has(dev, 'raiseR'), duck: has(dev, 'duck'), menu: has(dev, 'menu') };
      const any = [...pressedKeys].some(c => CODES[dev].has(c));
      edges[dev] = { up: hit(dev, 'up'), down: hit(dev, 'down'), left: hit(dev, 'left'), right: hit(dev, 'right'), a: hit(dev, 'jump'), b: hit(dev, 'duck') || hit(dev, 'menu'), x: hit(dev, 'raiseL'), y: hit(dev, 'raiseR'), start: hit(dev, 'menu'), any };
      if (any) active.push(dev);
    }
    pressedKeys.clear();
    const pads = [...(navigator.getGamepads?.() || [])];
    for (let i = 0; i < pads.length && i < 8; i++) {
      const p = pads[i]; if (!p || !p.connected) continue;
      const dev = 'pad' + i, b = n => !!(p.buttons[n]?.pressed || (p.buttons[n]?.value || 0) > 0.5);
      let mx = p.axes[0] || 0, mz = p.axes[1] || 0;
      if (Math.hypot(mx, mz) < 0.2) { mx = 0; mz = 0; }
      if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) mz = -1; if (b(13)) mz = 1;
      const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
      held[dev] = { mx, mz, jump: b(0), grabL: b(4) || b(6), grabR: b(5) || b(7), raiseL: b(2), raiseR: b(3), duck: b(1), menu: b(9) };
      const now = p.buttons.map((_, n) => b(n)), was = prevPad[dev] || [];
      const down = n => now[n] && !was[n];
      // the stick as a d-pad for menus: an edge when it crosses 0.6 (and again after it comes back under 0.35)
      const st = prevStick[dev] || { x: 0, y: 0 }, sx = Math.abs(p.axes[0] || 0) > 0.6 ? Math.sign(p.axes[0]) : Math.abs(p.axes[0] || 0) < 0.35 ? 0 : st.x, sy = Math.abs(p.axes[1] || 0) > 0.6 ? Math.sign(p.axes[1]) : Math.abs(p.axes[1] || 0) < 0.35 ? 0 : st.y;
      const e = { up: down(12) || (sy === -1 && st.y !== -1), down: down(13) || (sy === 1 && st.y !== 1), left: down(14) || (sx === -1 && st.x !== -1), right: down(15) || (sx === 1 && st.x !== 1), a: down(0), b: down(1), x: down(2), y: down(3), start: down(9) };
      e.any = now.some((v, n) => v && !was[n]);
      edges[dev] = e; prevPad[dev] = now; prevStick[dev] = { x: sx, y: sy };
      if (e.any) active.push(dev);
    }
    held.touch = { ...touch.st };
    const tp = touch.pressed;
    edges.touch = { ...NOEDGE, a: tp.has('jump'), start: tp.has('menu'), any: tp.size > 0 };
    if (tp.size) active.push('touch');
    tp.clear();
  }
  return {
    poll,
    held: dev => held[dev] || EMPTY,
    edges: dev => edges[dev] || NOEDGE,
    devices: () => active.slice(),
    /** Every connected device name (for the lobby hint). */
    connected: () => ['kb1', 'kb2', ...[...(navigator.getGamepads?.() || [])].map((p, i) => (p && p.connected ? 'pad' + i : null)).filter(Boolean)],
    /** touch.js writes here. */
    touch: {
      set(st) { Object.assign(touch.st, st); },
      press(name) { touch.pressed.add(name); },
    },
  };
}
