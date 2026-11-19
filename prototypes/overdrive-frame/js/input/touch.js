// Phone controls (owner: desktop + controller first, phone usable if possible): a move stick under the left thumb, an
// aim stick under the right thumb that fires both arms while held, and big named buttons for the rest. Feeds the same
// Controls object as keys and pads (touch.move / touch.aim / touch.buttons), so the sim never knows which was used.
import { BY_ID } from './bindings.js';

/** mode 'hangar': only the move stick (the bay prompt is its own button; nothing fires in the hangar). */
export function installTouch(controls, root, { mode = 'fight', overload = false } = {}) {
  if (!matchMedia('(pointer: coarse)').matches && !/[?&]touch=1/.test(location.search)) return null;
  const el = document.createElement('div'); el.className = 'of-touch' + (mode === 'hangar' ? ' of-touch-hangar' : '');
  el.innerHTML = mode === 'hangar' ? '<div class="of-stick of-stick-move" aria-label="Move"><i></i></div>' : `
    <div class="of-stick of-stick-move" aria-label="Move"><i></i></div>
    <div class="of-stick of-stick-aim" aria-label="Aim and fire"><i></i></div>
    <div class="of-tbtns">
      <button type="button" data-act="quick">Dash</button><button type="button" data-act="jump">Jump</button>
      <button type="button" data-act="boost">Boost</button><button type="button" data-act="lock">Lock</button>
      <button type="button" data-act="kit" class="of-tbtn-kit">Fix</button><button type="button" data-act="skill" class="of-tbtn-skill">Skill</button>
      <button type="button" data-act="fireSL">Left pod</button><button type="button" data-act="fireSR">Right pod</button>${overload ? '<button type="button" data-act="overload" class="of-tbtn-od">Overload</button>' : ''}
    </div>`;
  root.append(el);
  controls.device = 'touch';             // hints follow the device: no keyboard letters on a phone
  const stick = (node, set) => {
    let id = null, ox = 0, oy = 0; const knob = node.querySelector('i'), R = 56;
    node.addEventListener('pointerdown', e => { id = e.pointerId; node.setPointerCapture(id); const r = node.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; move(e); e.preventDefault(); });
    const move = e => { if (e.pointerId !== id) return; let dx = e.clientX - ox, dy = e.clientY - oy; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; set(l < 8 ? null : [dx / R, dy / R]); };
    const end = e => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; set(null); };
    node.addEventListener('pointermove', move); node.addEventListener('pointerup', end); node.addEventListener('pointercancel', end);
  };
  stick(el.querySelector('.of-stick-move'), v => { controls.touch.move = v; controls.device = 'touch'; });
  if (mode !== 'hangar') stick(el.querySelector('.of-stick-aim'), v => { controls.touch.aim = v; controls.touch.autoFire = !!v; controls.device = 'touch'; });
  for (const b of el.querySelectorAll('[data-act]')) {
    const id = b.dataset.act, hold = BY_ID[id]?.hold;
    // iOS can skip pointerup: every fresh touch-start clears stuck buttons first (lessons rule 30)
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (hold) controls.touch.buttons.add(id); if (!hold || id === 'jump') controls.pressed.add(id); b.classList.add('on'); });
    const up = () => { controls.touch.buttons.delete(id); b.classList.remove('on'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  }
  el.addEventListener('touchstart', e => { if (e.touches.length === 1) { controls.touch.buttons.clear(); el.querySelectorAll('.on').forEach(n => n.classList.remove('on')); } }, { passive: true });
  return { el, dispose: () => el.remove() };
}
