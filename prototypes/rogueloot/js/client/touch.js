// Phone controls: a floating thumb stick on the left half of the screen. (M4 adds the skill arc on the right.)
export const isTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
export function createTouch(root, input) {
  const zone = document.createElement('div'); zone.className = 'stick-zone';
  const knob = document.createElement('div'); knob.className = 'stick'; knob.innerHTML = '<i></i><b></b>';
  zone.append(knob); root.append(zone);
  const thumb = knob.querySelector('b'), R = 56;
  let pid = null, ox = 0, oy = 0;
  zone.addEventListener('pointerdown', e => {
    if (pid != null) return; pid = e.pointerId; try { zone.setPointerCapture(pid); } catch { /* */ }
    const r = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
    knob.style.left = (ox - r.left) + 'px'; knob.style.top = (oy - r.top) + 'px'; knob.classList.add('on'); e.preventDefault();
  });
  zone.addEventListener('pointermove', e => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    const f = m / R; input.touch.mx = f < 0.15 ? 0 : dx / R; input.touch.mz = f < 0.15 ? 0 : dy / R;
  });
  const up = e => { if (e.pointerId !== pid) return; pid = null; input.touch.mx = input.touch.mz = 0; knob.classList.remove('on'); thumb.style.transform = ''; };
  zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
  return { show(v) { zone.classList.toggle('on', !!v); } };
}
