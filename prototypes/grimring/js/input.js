// Every way to fight: keyboard (WASD / arrows, Space or J attack, E or K special, Shift or L dodge), the touch stick
// and buttons, and a game controller (left stick / d-pad, A attack, X special, B dodge, Start menu).
// Movement comes out in world terms with W = screen north = −z (the camera looks north; lessons rule 26).
// One table owns every key (lessons rule 34).
export const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  attack: ['Space', 'KeyJ'], special: ['KeyE', 'KeyK'], dodge: ['ShiftLeft', 'ShiftRight', 'KeyL'], menu: ['Escape'],
};
export const KEY_LABEL = { attack: 'Space', special: 'E', dodge: 'Shift' };
export const PAD_LABEL = { attack: 'A', special: 'X', dodge: 'B' };
export const PAD = { attack: 0, dodge: 1, special: 2, special2: 3, menu: 9 };

export function createInput({ onMenu, onDevice, enabled }) {
  const down = new Set();
  const pressed = { attack: false, special: false, dodge: false };   // edges, kept until read
  const touch = { attack: false, mx: 0, mz: 0 };
  let device = matchMedia('(pointer: coarse)').matches ? 'touch' : 'keys', padPrev = [];
  const setDevice = d => { if (d === device) return; device = d; onDevice?.(d); };
  const has = (name, code) => KEYS[name].includes(code);

  addEventListener('keydown', e => {
    if (e.target.closest?.('.gdlg-modal')) return;                          // the shared dialog handles its own keys
    if (has('menu', e.code)) { if (!e.repeat) onMenu?.(); return; }       // Esc closes a sheet even while typing in it
    if (e.target.closest?.('input, textarea, select')) return;
    setDevice('keys');
    if (!enabled()) return;
    if (Object.values(KEYS).some(l => l.includes(e.code))) e.preventDefault();
    if (!e.repeat) for (const k of ['attack', 'special', 'dodge']) if (has(k, e.code)) pressed[k] = true;
    down.add(e.code);
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => { down.clear(); touch.attack = false; touch.mx = touch.mz = 0; });

  // touch: a stick that follows the thumb, and the three action buttons
  function bindTouch(stick, knob, buttons) {
    let pid = null, cx = 0, cy = 0;
    const R = 50;
    const move = e => {
      const dx = e.clientX - cx, dy = e.clientY - cy, m = Math.hypot(dx, dy), k = m > R ? R / m : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      touch.mx = (dx * k) / R; touch.mz = (dy * k) / R;                 // screen down = +z (south)
    };
    stick.addEventListener('pointerdown', e => {
      setDevice('touch');
      if (pid != null && e.pointerType === 'touch') { /* iOS can skip pointerup: a fresh touch starts over (rule 30) */ }
      pid = e.pointerId; stick.setPointerCapture?.(e.pointerId);
      const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; move(e);
    });
    stick.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
    const end = e => { if (e.pointerId !== pid) return; pid = null; touch.mx = touch.mz = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end); stick.addEventListener('lostpointercapture', end);
    for (const [name, b] of Object.entries(buttons)) {
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); if (e.pointerType === 'touch') setDevice('touch');
        if (name === 'attack') touch.attack = true;
        pressed[name] = true;
      });
      const up = () => { if (name === 'attack') touch.attack = false; };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    }
  }

  function readPad() {
    const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
    if (!pad) return null;
    const now = pad.buttons.map(b => b.pressed), hit = i => now[i] && !padPrev[i];
    padPrev = now;
    const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    let mx = Math.abs(ax) > 0.2 ? ax : 0, mz = Math.abs(ay) > 0.2 ? ay : 0;
    if (now[12]) mz = -1; if (now[13]) mz = 1; if (now[14]) mx = -1; if (now[15]) mx = 1;
    if (now.some(Boolean) || mx || mz) setDevice('pad');
    if (hit(PAD.menu)) onMenu?.();
    if (enabled()) {
      if (hit(PAD.special) || hit(PAD.special2) || hit(5)) pressed.special = true;
      if (hit(PAD.dodge) || hit(4)) pressed.dodge = true;
      if (hit(PAD.attack) || hit(7)) pressed.attack = true;
    }
    return { mx, mz, attack: now[PAD.attack] || now[7] };
  }

  return {
    bindTouch,
    get device() { return device; },
    /** The input for this frame; edges are consumed. */
    read() {
      const pad = readPad();
      let mx = 0, mz = 0;
      if (KEYS.left.some(k => down.has(k))) mx -= 1; if (KEYS.right.some(k => down.has(k))) mx += 1;
      if (KEYS.up.some(k => down.has(k))) mz -= 1; if (KEYS.down.some(k => down.has(k))) mz += 1;
      mx += touch.mx; mz += touch.mz;
      if (pad) { mx += pad.mx; mz += pad.mz; }
      const out = {
        mx, mz,
        attack: pressed.attack || touch.attack || KEYS.attack.some(k => down.has(k)) || !!pad?.attack,
        special: pressed.special, dodge: pressed.dodge,
      };
      pressed.attack = pressed.special = pressed.dodge = false;
      return out;
    },
    clear() { down.clear(); pressed.attack = pressed.special = pressed.dodge = false; touch.attack = false; },
  };
}
