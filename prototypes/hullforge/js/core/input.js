// Keyboard, mouse (pointer lock while flying) and game controller, through ONE binding table (every key has one
// owner). `poll()` once a frame returns the flight controls plus the actions pressed since last frame.

export const BINDINGS = [
  // action        keys                      pad button (standard layout)      what it does (Controls screen)
  { id: 'fwd', keys: ['KeyW'], label: 'Thrust forward', pad: 'Left stick up' },
  { id: 'back', keys: ['KeyS'], label: 'Thrust back', pad: 'Left stick down' },
  { id: 'left', keys: ['KeyA'], label: 'Slide left', pad: 'Left stick left' },
  { id: 'right', keys: ['KeyD'], label: 'Slide right', pad: 'Left stick right' },
  { id: 'up', keys: ['Space'], label: 'Rise', pad: 'RB', btn: 5 },
  { id: 'down', keys: ['ControlLeft', 'KeyC'], label: 'Sink', pad: 'LB', btn: 4 },
  { id: 'rollL', keys: ['KeyQ'], label: 'Roll left', pad: 'D-pad left', btn: 14 },
  { id: 'rollR', keys: ['KeyE'], label: 'Roll right', pad: 'D-pad right', btn: 15 },
  { id: 'boost', keys: ['ShiftLeft', 'ShiftRight'], label: 'Boost (cruise when no enemies are near)', pad: 'A', btn: 0 },
  { id: 'fire', keys: [], mouse: 0, label: 'Fire every turret at the crosshair', pad: 'RT', btn: 7 },
  { id: 'lock', keys: ['KeyR'], mouse: 2, label: 'Lock the target nearest the crosshair', pad: 'Y', btn: 3, edge: true },
  { id: 'use', keys: ['KeyF'], label: 'Dock / use', pad: 'X', btn: 2, edge: true },
  { id: 'map', keys: ['KeyM'], label: 'Star map', pad: 'Back', btn: 8, edge: true },
  { id: 'hold', keys: ['KeyI'], label: 'Hold (parts and ore)', pad: 'D-pad down', btn: 13, edge: true },
  { id: 'goals', keys: ['KeyJ'], label: 'Goals', pad: 'D-pad up', btn: 12, edge: true },
  { id: 'menu', keys: ['Escape'], label: 'Menu', pad: 'Start', btn: 9, edge: true },
  // world: round 2 (ui/world-ext.js owns these)
  { id: 'harpoon', keys: ['KeyG'], label: 'Harpoon: fire at the crosshair / let go', pad: 'B', btn: 1, edge: true },
  { id: 'reel', keys: ['KeyT'], label: 'Reel the harpoon in (hold)', pad: 'LT (hold)', btn: 6 },
  { id: 'scan', keys: ['KeyV'], label: 'Scan pulse (marks ore, finds hidden things)', pad: 'Right stick press', btn: 11, edge: true },
  { id: 'drones', keys: ['KeyB'], label: 'Launch / recall drones', pad: 'Left stick press', btn: 10, edge: true },
  { id: 'jobs', keys: ['KeyK'], label: 'Jobs you have taken', edge: true },
  { id: 'factions', keys: ['KeyL'], label: 'Standing with the factions', edge: true },
];
const byKey = new Map(); for (const b of BINDINGS) for (const k of b.keys) byKey.set(k, b.id);
export const keyLabel = code => ({ Space: 'Space', ControlLeft: 'Ctrl', ShiftLeft: 'Shift', ShiftRight: 'Shift', Escape: 'Esc' }[code] || code.replace(/^Key/, '').replace(/^Digit/, ''));
export const bindingText = id => { const b = BINDINGS.find(x => x.id === id); if (!b) return ''; const k = b.keys.map(keyLabel); if (b.mouse === 0) k.push('Left mouse'); if (b.mouse === 2) k.push('Right mouse'); return k.join(' / '); };

export function createInput(canvas) {
  const down = new Set(); const edges = new Set(); let mx = 0, my = 0, wheel = 0, mouseBtn = new Set();
  let lastDevice = 'keyboard';
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select')) return;
    const a = byKey.get(e.code); if (!a) return;
    if (!down.has(e.code)) edges.add(a);
    down.add(e.code); lastDevice = 'keyboard';
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); mouseBtn.clear(); });
  // Mouse glitches (owner 2026-11-15, "I randomly get turned around like 180 degrees"): Chrome on Windows can report
  // one huge jump right after the mouse is captured, and now and then while captured. Skip any event far bigger than
  // the recent movement, and the first moments after capture changes. `spikes` counts what was skipped (tests).
  let avgMove = 6, lockAt = -1e9, spikes = 0;
  document.addEventListener('pointerlockchange', () => { lockAt = performance.now(); });
  addEventListener('mousemove', e => {
    const dx = e.movementX || 0, dy = e.movementY || 0; const m = Math.hypot(dx, dy);
    if (performance.now() - lockAt < 120 && m > 40) { spikes++; return; }
    if (m > 160 && m > avgMove * 10) { spikes++; return; }
    avgMove = avgMove * 0.85 + Math.min(m, 400) * 0.15; avgMove = Math.max(avgMove, 6);
    if (document.pointerLockElement === canvas || e.buttons) { mx += dx; my += dy; } else { mx += dx * 0.6; my += dy * 0.6; }
  });
  canvas.addEventListener('mousedown', e => { mouseBtn.add(e.button); lastDevice = 'keyboard'; for (const b of BINDINGS) if (b.mouse === e.button && b.edge) edges.add(b.id); });
  addEventListener('mouseup', e => mouseBtn.delete(e.button));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => { wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  const padPrev = new Map(); let last = null;
  function poll() {
    const k = id => BINDINGS.find(b => b.id === id).keys.some(c => down.has(c));
    const out = {
      thrust: { x: (k('right') ? 1 : 0) - (k('left') ? 1 : 0), y: (k('up') ? 1 : 0) - (k('down') ? 1 : 0), z: (k('fwd') ? 1 : 0) - (k('back') ? 1 : 0) },
      roll: (k('rollR') ? 1 : 0) - (k('rollL') ? 1 : 0),
      boost: k('boost'), fire: mouseBtn.has(0),
      look: { x: mx, y: my }, wheel, pressed: new Set(edges), device: lastDevice, padLook: { x: 0, y: 0 },
      held: new Set(BINDINGS.filter(b => b.keys.some(c => down.has(c))).map(b => b.id)),   // world: held actions (reel)
    };
    mx = 0; my = 0; wheel = 0; edges.clear();
    // controller
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const p of pads) {
      const dz = v => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
      const btn = i => !!p.buttons[i]?.pressed || (p.buttons[i]?.value || 0) > 0.4;
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      const any = lx || ly || rx || ry || p.buttons.some(b => b.pressed);
      if (any) lastDevice = 'pad';
      if (lx || ly) { out.thrust.x = lx; out.thrust.z = -ly; }
      if (rx || ry) { out.padLook.x = rx; out.padLook.y = ry; }
      for (const b of BINDINGS) {
        if (b.btn == null) continue;
        const on = btn(b.btn); const was = padPrev.get(p.index + ':' + b.btn) || false;
        if (on && !was && b.edge) out.pressed.add(b.id);
        padPrev.set(p.index + ':' + b.btn, on);
        if (!on) continue;
        if (b.id === 'up') out.thrust.y = 1; if (b.id === 'down') out.thrust.y = -1;
        if (b.id === 'rollL') out.roll = -1; if (b.id === 'rollR') out.roll = 1;
        if (b.id === 'boost') out.boost = true; if (b.id === 'fire') out.fire = true;
        out.held.add(b.id);   // world:
      }
    }
    out.device = lastDevice;
    last = out;   // world: the latest poll, for systems outside the main loop (held reel)
    return out;
  }
  return { poll, get spikes() { return spikes; }, get device() { return lastDevice; }, get last() { return last; }, clear() { down.clear(); mouseBtn.clear(); edges.clear(); } };
}
