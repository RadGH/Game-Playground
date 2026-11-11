// Input from keyboard + mouse, game controller and touch, merged into one object per frame:
//   { mx, my, aimX, aimY (screen px), fire, missile, boost, reel, harpoon*, utility*, interact*, build*, map*, menu*, quests* }
// (* = pressed this frame). W is screen-up (top-down game).

export function createInput(el) {
  const keys = new Set(), edges = new Set();
  const I = { mouse: { x: innerWidth / 2, y: innerHeight / 2, l: false, r: false, moved: 0 }, touch: { left: null, right: null, buttons: new Map() }, wheel: 0, padIndex: null, device: 'kb', enabled: true };
  const map = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    Space: 'boost', ShiftLeft: 'boost', KeyF: 'harpoon', KeyR: 'reel', KeyQ: 'utility', KeyE: 'interact', KeyB: 'build', KeyM: 'map', KeyN: 'local',
    KeyJ: 'quests', Tab: 'quests', Escape: 'menu', KeyI: 'hold', KeyG: 'missileKey', KeyC: 'drones', KeyZ: 'autofire', KeyX: 'fireKey',
  };
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select')) return;
    const a = map[e.code]; if (!a) return;
    if (!keys.has(a)) edges.add(a);
    keys.add(a); I.device = 'kb';
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  addEventListener('keyup', e => { const a = map[e.code]; if (a) keys.delete(a); });
  addEventListener('blur', () => keys.clear());
  el.addEventListener('mousemove', e => { I.mouse.x = e.clientX; I.mouse.y = e.clientY; I.mouse.moved = performance.now(); I.device = 'kb'; });
  el.addEventListener('mousedown', e => { if (e.button === 0) I.mouse.l = true; if (e.button === 2) I.mouse.r = true; I.device = 'kb'; });
  addEventListener('mouseup', e => { if (e.button === 0) I.mouse.l = false; if (e.button === 2) I.mouse.r = false; });
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('wheel', e => { I.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  // touch: left half = move stick, right half = aim stick (fires while pushed out)
  const stickR = 60;
  el.addEventListener('touchstart', e => {
    for (const t of e.changedTouches) {
      const side = t.clientX < innerWidth / 2 ? 'left' : 'right';
      if (!I.touch[side]) I.touch[side] = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
    }
    I.device = 'touch'; e.preventDefault();
  }, { passive: false });
  el.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) for (const side of ['left', 'right']) { const s = I.touch[side]; if (s && s.id === t.identifier) { s.x = t.clientX; s.y = t.clientY; } }
    e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) for (const side of ['left', 'right']) { const s = I.touch[side]; if (s && s.id === t.identifier) I.touch[side] = null; } };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);

  /** Touch buttons (HTML) call these. */
  I.press = (a) => { edges.add(a); };
  I.hold = (a, on) => { if (on) keys.add(a); else keys.delete(a); };

  const padPrev = new Set();
  I.read = () => {
    const out = { mx: 0, my: 0, aimX: I.mouse.x, aimY: I.mouse.y, aimStick: null, fire: false, missile: false, boost: false, reel: false };
    if (keys.has('up')) out.my -= 1; if (keys.has('down')) out.my += 1; if (keys.has('left')) out.mx -= 1; if (keys.has('right')) out.mx += 1;
    out.fire = I.mouse.l || keys.has('fireKey'); out.missile = I.mouse.r || keys.has('missileKey'); out.boost = keys.has('boost'); out.reel = keys.has('reel');
    // touch sticks
    const L = I.touch.left, Rt = I.touch.right;
    if (L) { const dx = L.x - L.x0, dy = L.y - L.y0; const d = Math.hypot(dx, dy); if (d > 6) { const k = Math.min(1, d / stickR); out.mx = dx / d * k; out.my = dy / d * k; } }
    if (Rt) { const dx = Rt.x - Rt.x0, dy = Rt.y - Rt.y0; const d = Math.hypot(dx, dy); if (d > 10) { out.aimStick = [dx / d, dy / d]; out.fire = out.fire || d > stickR * 0.45; } }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find(x => x && x.connected);
    if (p) {
      const dz = v => Math.abs(v) < 0.18 ? 0 : v;
      const lx = dz(p.axes[0] || 0), ly = dz(p.axes[1] || 0), rx = dz(p.axes[2] || 0), ry = dz(p.axes[3] || 0);
      const btn = i => !!p.buttons[i]?.pressed || (p.buttons[i]?.value || 0) > 0.4;
      if (lx || ly || rx || ry || p.buttons.some(b => b.pressed)) I.device = 'pad';
      if (I.device === 'pad') {
        if (lx || ly) { out.mx = lx; out.my = ly; }
        if (rx || ry) { const d = Math.hypot(rx, ry); out.aimStick = [rx / d, ry / d]; }
        out.fire = out.fire || btn(7); out.missile = out.missile || btn(6); out.boost = out.boost || btn(0); out.reel = out.reel || btn(5);
        const edge = (i, a) => { const k = 'p' + i; if (btn(i)) { if (!padPrev.has(k)) edges.add(a); padPrev.add(k); } else padPrev.delete(k); };
        edge(2, 'harpoon'); edge(3, 'interact'); edge(4, 'utility'); edge(9, 'menu'); edge(8, 'map'); edge(1, 'build'); edge(12, 'quests'); edge(13, 'drones'); edge(14, 'local');
      }
    }
    for (const a of edges) out[a + 'Pressed'] = true;
    edges.clear();
    out.wheel = I.wheel; I.wheel = 0;
    out.device = I.device;
    return out;
  };
  I.keys = keys;
  return I;
}
