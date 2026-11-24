// Phone controls (PLAN §0: phones can join with a simpler set — twin stick, aim assist, tap to place zones): a move
// stick on the left, dragging anywhere on the right turns the camera, big named buttons for Attack, Dodge, Use and
// Block, and the action bar's own buttons cast (a ground spell then waits for a tap on the ground to place it).
// Stuck fingers are cleared on a fresh pointerdown BEFORE the control takes the new finger (lessons rule 30).
import { esc } from '../ui/kit.js';

export function createTouch(app, input, play) {
  const root = document.createElement('div');
  root.className = 'hud-touch';
  root.innerHTML = `
    <div class="hud-stick" data-stick><i></i></div>
    <div class="hud-look" data-look></div>
    <div class="hud-tbtns">
      <button type="button" class="hud-tb big" data-tb="attack">Attack</button>
      <button type="button" class="hud-tb" data-tb="dodge">Dodge</button>
      <button type="button" class="hud-tb" data-tb="block">Block</button>
      <button type="button" class="hud-tb" data-tb="interact">Use</button>
      <button type="button" class="hud-tb" data-tb="sprint">Run</button>
    </div>
    <div class="hud-place" hidden><span></span><button type="button" class="ow-btn ow-small" data-tb="cancel">Cancel</button></div>`;
  document.getElementById('hud').append(root);
  // the stick and buttons sit just above the action bar, however many rows it wraps to on this screen
  const bottom = document.querySelector('#hud .hud-bottom');
  const lift = () => { const h = bottom ? Math.ceil(bottom.getBoundingClientRect().height) : 80; root.style.setProperty('--tb-lift', `${h + 22}px`); };
  const ro = new ResizeObserver(lift); if (bottom) ro.observe(bottom); lift();
  const stick = root.querySelector('[data-stick]'), knob = stick.querySelector('i');
  const fingers = new Map();
  const T = input.touch;
  let stickId = null, sx = 0, sy = 0;
  // capture throws when the pointer is already gone (a finger lifted between events): the stick still works without it
  const capture = (el, e) => { try { el.setPointerCapture?.(e.pointerId); } catch { /* no capture */ } };
  const R = 56;
  function clearStale(e) {
    // iOS can skip pointerup: a primary pointerdown means every other finger is gone
    if (e.isPrimary) { for (const id of [...fingers.keys()]) if (id !== e.pointerId) fingers.delete(id); if (stickId !== null && stickId !== e.pointerId) endStick(); T.held.clear(); }
  }
  function endStick() { stickId = null; T.move.x = T.move.y = 0; knob.style.transform = ''; }
  stick.addEventListener('pointerdown', e => {
    clearStale(e);
    e.preventDefault(); capture(stick, e);
    const r = stick.getBoundingClientRect(); stickId = e.pointerId; sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    move(e);
  });
  function move(e) {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx, dy = e.clientY - sy; const l = Math.hypot(dx, dy);
    if (l > R) { dx = dx / l * R; dy = dy / l * R; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    T.move.x = dx / R; T.move.y = -dy / R;
  }
  stick.addEventListener('pointermove', move);
  for (const ev of ['pointerup', 'pointercancel']) stick.addEventListener(ev, e => { if (e.pointerId === stickId) endStick(); });
  const look = root.querySelector('[data-look]');
  look.addEventListener('pointerdown', e => {
    clearStale(e);
    capture(look, e);
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
  });
  look.addEventListener('pointermove', e => {
    const f = fingers.get(e.pointerId); if (!f) return;
    const dx = e.clientX - f.x, dy = e.clientY - f.y;
    T.look.dx += dx * 1.4; T.look.dy += dy * 1.4;
    f.moved += Math.abs(dx) + Math.abs(dy); f.x = e.clientX; f.y = e.clientY;
  });
  for (const ev of ['pointerup', 'pointercancel']) look.addEventListener(ev, e => {
    const f = fingers.get(e.pointerId); fingers.delete(e.pointerId);
    if (f && ev === 'pointerup' && f.moved < 12 && performance.now() - f.t < 350) play.tapAt(e.clientX, e.clientY);   // a tap: place a zone / pick a target
  });
  for (const b of root.querySelectorAll('[data-tb]')) {
    const id = b.dataset.tb;
    b.addEventListener('pointerdown', e => {
      clearStale(e); e.preventDefault();
      if (id === 'cancel') { play.cancelPlace(); return; }
      if (id === 'sprint') { T.held.has('sprint') ? T.held.delete('sprint') : T.held.add('sprint'); b.classList.toggle('on', T.held.has('sprint')); return; }
      T.held.add(id); T.presses.add(id === 'attack' ? 'attackTap' : id);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => { if (id !== 'sprint') T.held.delete(id); });
  }
  return {
    root,
    placing(text) { const p = root.querySelector('.hud-place'); p.hidden = !text; if (text) p.querySelector('span').textContent = text; },
    show(on) { root.hidden = !on; },
    destroy() { ro.disconnect(); root.remove(); },
    esc,
  };
}
