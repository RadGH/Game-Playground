// Every way to move: keyboard (WASD / arrows), a game controller (left stick / d-pad) and the phone stick.
// Returns a SCREEN vector (x right, y down) — the camera turns it into world space, so W is always screen north.
export function createInput() {
  const keys = new Set();
  const touch = { mx: 0, mz: 0 };
  const isField = e => e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  addEventListener('keydown', e => { if (!isField(e)) keys.add(e.code); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());
  const pressed = new Set();       // one-shot presses (menu, etc.)
  let prevPad = {};
  function pad() {
    const gps = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const g = gps[0]; if (!g) return { x: 0, y: 0 };
    let x = g.axes[0] || 0, y = g.axes[1] || 0;
    if (Math.hypot(x, y) < 0.18) { x = 0; y = 0; }
    const b = i => !!g.buttons[i]?.pressed;
    if (b(12)) y = -1; if (b(13)) y = 1; if (b(14)) x = -1; if (b(15)) x = 1;
    const now = { menu: b(9) };
    for (const k of Object.keys(now)) if (now[k] && !prevPad[k]) pressed.add(k);
    prevPad = now;
    return { x, y };
  }
  return {
    touch,
    /** Screen-space move vector, length <= 1. */
    move() {
      let x = 0, y = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      const p = pad(); x += p.x + touch.mx; y += p.y + touch.mz;
      const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
      return { x, y };
    },
    take(k) { const h = pressed.has(k); pressed.delete(k); return h; },
    press(k) { pressed.add(k); },
  };
}
