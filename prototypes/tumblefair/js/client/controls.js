// What a player steers with during an arena minigame: a thumb stick on the left and up to two round buttons on the
// right on a touch screen (the same stick Thousandvale's phone layout uses: it appears under your thumb, full push
// runs), WASD / arrows + Space / E on a keyboard, and a gamepad's left stick + A / B on a secure page.
// read() -> { mx, mz, b }: a world direction for the fixed camera (screen up = away from you = -z) and button bits.
import { IN } from '../shared/protocol.js';

export const isTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export function createControls(root) {
  const keys = new Set();
  let stick = null, btn = 0, shown = null, pressed = 0;
  const R = 54;
  const el = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
  const zone = el('div', 'ph-stickzone'), knob = el('div', 'ph-stick', '<i class="ph-ring"></i><b class="ph-thumb"></b>');
  const btnA = el('button', 'ph-btn ph-a'), btnB = el('button', 'ph-btn ph-b'), hint = el('div', 'key-hint');
  zone.append(knob); root.append(zone, btnA, btnB, hint);
  let pid = null, ox = 0, oy = 0;
  const thumb = knob.querySelector('.ph-thumb');
  zone.addEventListener('pointerdown', e => {
    if (pid != null) return; pid = e.pointerId; zone.setPointerCapture(pid);
    ox = e.clientX; oy = e.clientY; knob.style.left = ox + 'px'; knob.style.top = oy + 'px'; knob.classList.add('on'); move(e); e.preventDefault();
  });
  const move = e => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    const f = Math.min(1, m / R);
    stick = f < 0.18 ? null : { mx: dx / R, mz: dy / R };
  };
  const up = e => { if (e.pointerId !== pid) return; pid = null; stick = null; knob.classList.remove('on'); thumb.style.transform = ''; };
  zone.addEventListener('pointermove', move); zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
  for (const [b, bit] of [[btnA, IN.A], [btnB, IN.B]]) {
    const down = e => { btn |= bit; pressed |= bit; b.classList.add('down'); e.preventDefault(); };
    const rel = () => { btn &= ~bit; b.classList.remove('down'); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('pointerleave', rel);
  }
  const typing = () => /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
  addEventListener('keydown', e => { if (typing() || !shown) return; if (!keys.has(e.code)) { if (e.code === 'Space') pressed |= IN.A; if (e.code === 'KeyE' || e.code === 'ShiftLeft') pressed |= IN.B; } keys.add(e.code); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault(); });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); btn = 0; stick = null; });

  /** Show the controls a game asks for: { stick: true, a: 'Throw', b: 'Dash' } — or null to hide them all. */
  function set(spec) {
    shown = spec || null;
    const touch = isTouch();
    root.classList.toggle('on', !!spec);
    zone.style.display = spec?.stick && touch ? '' : 'none';
    btnA.style.display = spec?.a && touch ? '' : 'none'; btnA.textContent = spec?.a || '';
    btnB.style.display = spec?.b && touch ? '' : 'none'; btnB.textContent = spec?.b || '';
    hint.style.display = spec && !touch ? '' : 'none';
    hint.innerHTML = spec ? [spec.stick && '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move', spec.a && `<kbd>Space</kbd> ${spec.a}`, spec.b && `<kbd>E</kbd> ${spec.b}`].filter(Boolean).join(' &nbsp; ') : '';
    if (!spec) { keys.clear(); btn = 0; stick = null; pressed = 0; }
  }
  /** One sample per 50 ms step. A tap shorter than a step still counts once (`pressed`). */
  function read() {
    let mx = 0, mz = 0, b = btn | pressed; pressed = 0;
    if (stick) { mx = stick.mx; mz = stick.mz; }
    else {
      if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) mz -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) mz += 1;
      if (keys.has('Space')) b |= IN.A; if (keys.has('KeyE') || keys.has('ShiftLeft')) b |= IN.B;
      const pad = [...(navigator.getGamepads?.() || [])].find(p => p && p.connected);
      if (pad) { const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0; if (Math.hypot(ax, ay) > 0.2) { mx = ax; mz = ay; } if (pad.buttons[0]?.pressed) b |= IN.A; if (pad.buttons[1]?.pressed || pad.buttons[2]?.pressed) b |= IN.B; }
    }
    const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
    return { mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, b };
  }
  set(null);
  return { set, read, get shown() { return shown; } };
}
