// Every input device turned into one held-state object the game reads each frame.
//
//   const input = createInput(canvas, { touch: () => touchState() });
//   const s = input.read(dt)  ->  { mx, my (-1..1 stick/WASD: my +1 = forward), lookX, lookY (radians this frame),
//                                   gas 0..1, brake 0..1, steer -1..1, jump, boost, fire,
//                                   use, swap, horn, map, menu, camNear, camFar (true on the frame pressed),
//                                   device: 'keys'|'pad'|'touch' }
//
// Controls (docs/PLAN.md): W/S gas and brake (or forward/back on foot), A/D steer, mouse look, Space handbrake/jump,
// Shift boost/run/lean back, E get in/out, F swap seat, left click fire, H horn, M map, V / wheel camera distance.
// Controller: left stick drive/walk, right stick look, RT gas / LT brake, A jump/handbrake, X get in/out, Y swap, B boost,
// RB fire (as gunner RT fires too), R3 horn, Back map, Start menu, d-pad up/down camera distance.

const DEAD = 0.15;
const dz = v => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

export function createInput(target, { touch = null, settings = () => ({}) } = {}) {
  const keys = new Set(), pressed = new Set();
  let mdx = 0, mdy = 0, wheel = 0, mouseDown = false, locked = false;
  let lastDevice = 'keys';
  const prevPad = new Map();

  const onKey = (e, down) => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const k = e.code;
    if (down) { if (!keys.has(k)) pressed.add(k); keys.add(k); } else keys.delete(k);
    lastDevice = 'keys';
    if (/^(Space|ArrowUp|ArrowDown|Tab)$/.test(k) && down && state.inGame) e.preventDefault();
  };
  addEventListener('keydown', e => onKey(e, true));
  addEventListener('keyup', e => onKey(e, false));
  addEventListener('blur', () => keys.clear());
  target.addEventListener('mousedown', e => {
    if (e.button === 0) mouseDown = true;
    lastDevice = 'keys';
    if (state.inGame && !locked && state.wantLock && matchMedia('(pointer: fine)').matches) target.requestPointerLock?.()?.catch?.(() => {});
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  addEventListener('mousemove', e => {
    if (!locked) return;
    mdx += e.movementX; mdy += e.movementY;
  });
  target.addEventListener('wheel', e => { wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === target; });

  const state = { inGame: false, wantLock: true, get locked() { return locked; } };

  function readPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    if (!pads.length) return null;
    // the pad with any input wins (several plugged in: the one in use)
    let best = null;
    for (const p of pads) {
      const active = p.axes.some(a => Math.abs(a) > 0.3) || p.buttons.some(b => b.pressed);
      if (active || !best) best = p;
      if (active) break;
    }
    const p = best;
    const b = i => !!p.buttons[i]?.pressed, v = i => p.buttons[i]?.value || 0;
    const prev = prevPad.get(p.index) || [];
    const edge = i => b(i) && !prev[i];
    prevPad.set(p.index, p.buttons.map(x => x.pressed));
    const any = p.axes.some(a => Math.abs(a) > 0.3) || p.buttons.some(x => x.pressed);
    if (any) lastDevice = 'pad';
    return {
      mx: dz(p.axes[0] || 0), my: -dz(p.axes[1] || 0), lx: dz(p.axes[2] || 0), ly: dz(p.axes[3] || 0),
      gas: v(7), brake: v(6), jump: b(0), boost: b(1) || b(10), fire: b(5) || v(7) > 0.5,
      use: edge(2), swap: edge(3), horn: edge(11), map: edge(8), menu: edge(9), camNear: edge(12), camFar: edge(13), any,
    };
  }

  function read(dt) {
    const s = settings() || {};
    const sens = (s.mouseSens ?? 1) * 0.0024, padSens = (s.padSens ?? 1) * 2.6 * dt;
    const inv = s.invertY ? -1 : 1;
    const k = c => keys.has(c), e = c => pressed.has(c);
    const out = {
      mx: (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0),
      my: (k('KeyW') || k('ArrowUp') ? 1 : 0) - (k('KeyS') || k('ArrowDown') ? 1 : 0),
      lookX: mdx * sens, lookY: mdy * sens * inv,
      gas: k('KeyW') || k('ArrowUp') ? 1 : 0, brake: k('KeyS') || k('ArrowDown') ? 1 : 0,
      jump: k('Space'), boost: k('ShiftLeft') || k('ShiftRight'), fire: mouseDown && (locked || !matchMedia('(pointer: fine)').matches),
      use: e('KeyE'), swap: e('KeyF'), horn: e('KeyH'), map: e('KeyM') || e('Tab'), menu: e('Escape'),
      camNear: wheel < 0, camFar: wheel > 0 || e('KeyV'), lookActive: Math.abs(mdx) + Math.abs(mdy) > 0, device: lastDevice,
      reset: e('KeyR'),
    };
    out.steer = out.mx;
    mdx = mdy = 0; wheel = 0; pressed.clear();
    const p = readPad();
    if (p) {
      if (Math.abs(p.mx) > Math.abs(out.mx)) out.mx = p.mx;
      if (Math.abs(p.my) > Math.abs(out.my)) out.my = p.my;
      out.steer = Math.abs(p.mx) > Math.abs(out.steer) ? p.mx : out.steer;
      out.lookX += p.lx * padSens; out.lookY += p.ly * padSens * inv;
      if (Math.abs(p.lx) + Math.abs(p.ly) > 0) out.lookActive = true;
      out.gas = Math.max(out.gas, p.gas, p.my > 0.2 && p.gas < 0.05 && state.stickGas ? p.my : 0);
      out.brake = Math.max(out.brake, p.brake);
      out.jump ||= p.jump; out.boost ||= p.boost; out.fire ||= p.fire;
      out.use ||= p.use; out.swap ||= p.swap; out.horn ||= p.horn; out.map ||= p.map; out.menu ||= p.menu;
      out.camNear ||= p.camNear; out.camFar ||= p.camFar;
    }
    const t = touch?.();
    if (t && t.active) {
      lastDevice = 'touch';
      if (Math.abs(t.mx || 0) > Math.abs(out.mx)) out.mx = t.mx;
      if (Math.abs(t.my || 0) > Math.abs(out.my)) out.my = t.my;
      out.steer = Math.abs(t.mx || 0) > Math.abs(out.steer) ? t.mx : out.steer;
      out.lookX += (t.lookX || 0); out.lookY += (t.lookY || 0);
      if (t.lookX || t.lookY) out.lookActive = true;
      out.gas = Math.max(out.gas, t.gas ? 1 : 0); out.brake = Math.max(out.brake, t.brake ? 1 : 0);
      out.jump ||= !!t.jump; out.boost ||= !!t.boost; out.fire ||= !!t.fire;
      out.use ||= !!t.use; out.swap ||= !!t.swap; out.horn ||= !!t.horn;
    }
    out.device = lastDevice;
    return out;
  }
  return Object.assign(state, { read, keys, unlock() { document.exitPointerLock?.(); } });
}
