// The phone layout (try-anyway, the owner's words): a thumb stick on the left (it appears under your thumb) and five
// round buttons on the right — JUMP, L, R, ▲L, ▲R — plus ☰ for the menu. It drives ONE local player (device 'touch').
// Buttons are held states (hold L to grab, tap it to punch: the sim tells the two apart). Works held either way up.
export function createTouch(root, input) {
  const el = (tag, cls, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
  const pad = el('div', 'touchpad');
  const zone = el('div', 'tp-zone'), knob = el('div', 'tp-stick', '<i class="tp-ring"></i><b class="tp-thumb"></b>');
  zone.append(knob);
  const btns = el('div', 'tp-btns');
  const defs = [['raiseL', '▲L'], ['raiseR', '▲R'], ['grabL', 'L'], ['grabR', 'R'], ['jump', 'JUMP']];
  const st = { mx: 0, mz: 0, jump: false, grabL: false, grabR: false, raiseL: false, raiseR: false, duck: false, menu: false };
  for (const [k, label] of defs) {
    const b = el('button', 'tp-btn tp-' + k, label); b.dataset.k = k; btns.append(b);
    const down = e => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ } st[k] = true; b.classList.add('down'); input.touch.set(st); input.touch.press(k); };
    const up = () => { st[k] = false; b.classList.remove('down'); input.touch.set(st); };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
  }
  const menu = el('button', 'tp-menu', '☰'); menu.addEventListener('pointerdown', e => { e.preventDefault(); input.touch.press('menu'); });
  pad.append(zone, btns, menu); root.append(pad);
  const R = 56; let pid = null, ox = 0, oy = 0;
  const thumb = knob.querySelector('.tp-thumb');
  zone.addEventListener('pointerdown', e => {
    if (pid != null) return; pid = e.pointerId; try { zone.setPointerCapture(pid); } catch { /* not a live pointer */ }
    const r = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
    knob.style.left = (ox - r.left) + 'px'; knob.style.top = (oy - r.top) + 'px'; knob.classList.add('on'); mv(e); e.preventDefault();
  });
  const mv = e => {
    if (e.pointerId !== pid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    const f = Math.min(1, m / R);
    if (f < 0.15) { st.mx = 0; st.mz = 0; } else { st.mx = Math.round(dx / R * 100) / 100; st.mz = Math.round(dy / R * 100) / 100; }
    input.touch.set(st);
  };
  const up = e => { if (e.pointerId !== pid) return; pid = null; st.mx = st.mz = 0; input.touch.set(st); knob.classList.remove('on'); thumb.style.transform = ''; };
  zone.addEventListener('pointermove', mv); zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);
  return {
    show(v) { pad.classList.toggle('on', !!v); if (!v) { for (const k of Object.keys(st)) st[k] = typeof st[k] === 'number' ? 0 : false; input.touch.set(st); } },
    el: pad,
  };
}
export const isTouch = () => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
