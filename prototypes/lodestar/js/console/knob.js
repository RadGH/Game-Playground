// Rotary knobs with detents. PLAN §0.2: a knob turns by drag, mouse wheel, key, gamepad and a tap on its labelled
// detent — never slower than a plain menu. The model is pure (node-tested); the DOM part builds a bakelite knob with
// engraved ticks and a ring of labelled detent buttons, and a `mini` variant (44 px, tap left half = down, right half
// = up) for the phone strip.
//
//   const k = createKnob({ name: 'RANGE', labels: ['¼','½','1','2','4','8'], index: 3, onChange: (i, how) => ... });
//   host.append(k.el); k.set(2); k.step(+1); k.index
//   createKnob({ ..., bind: otherKnob })   // a second face for the same value (the phone strip mini knob)

/** Pure detent model. `drag(dx, dy)` takes movement in px (right / up = more) and returns how many detents it moved. */
export function knobModel({ count, index = 0, dragPx = 26, wheelStep = 50 }) {
  let i = clampI(index, count), acc = 0, wacc = 0;
  function clampI(n, c) { return Math.max(0, Math.min(c - 1, Math.round(n))); }
  const m = {
    get index() { return i; }, count,
    set(n) { const was = i; i = clampI(n, count); return i - was; },
    step(d) { return m.set(i + d); },
    drag(dx, dy) {
      acc += dx - dy;
      let moved = 0;
      while (acc >= dragPx) { acc -= dragPx; moved += m.step(1); }
      while (acc <= -dragPx) { acc += dragPx; moved += m.step(-1); }
      // stuck at an end: do not bank movement the knob cannot use
      if ((i === count - 1 && acc > 0) || (i === 0 && acc < 0)) acc = 0;
      return moved;
    },
    endDrag() { acc = 0; },
    /** deltaY from a wheel event; deltaMode 1/2 (lines/pages) is one detent per notch, pixels accumulate. */
    wheel(deltaY, deltaMode = 0) {
      if (deltaMode) return m.step(deltaY < 0 ? 1 : -1);
      wacc += deltaY;
      let moved = 0;
      // a mouse notch is ~100 px; a trackpad sends many small ones
      if (Math.abs(wacc) >= wheelStep) { moved = m.step(wacc < 0 ? 1 : -1); wacc = 0; }
      return moved;
    },
  };
  return m;
}

/** Angle of detent n (degrees, 0 = pointing up), spread over `sweep` degrees. */
export function detentAngle(n, count, sweep = 270) {
  if (count <= 1) return 0;
  return -sweep / 2 + (sweep * n) / (count - 1);
}

const SVGNS = 'http://www.w3.org/2000/svg';

export function createKnob({ name, labels, names = labels, index = 0, sweep, mini = false, onChange = () => {}, sound = () => {}, dragPx = 26, cls = '', bind = null, id = '' }) {
  const count = labels.length;
  sweep ??= count <= 3 ? 180 : count <= 4 ? 240 : 300;   // wide enough that 44 px detent buttons never touch
  const model = bind ? bind.model : knobModel({ count, index, dragPx });
  const el = document.createElement('div');
  el.className = `knob ${mini ? 'knob-mini' : 'knob-full'} ${cls}`.trim();
  if (id) el.dataset.knob = id;

  const face = document.createElement('div'); face.className = 'knob-face';
  // engraved scale (ticks + arc) as SVG so it stays crisp at any size
  const svg = document.createElementNS(SVGNS, 'svg'); svg.setAttribute('viewBox', '-50 -50 100 100'); svg.setAttribute('class', 'knob-scale'); svg.setAttribute('aria-hidden', 'true');
  for (let n = 0; n < count; n++) {
    const a = (detentAngle(n, count, sweep) - 90) * Math.PI / 180;
    const t = document.createElementNS(SVGNS, 'line');
    t.setAttribute('x1', (Math.cos(a) * 41).toFixed(2)); t.setAttribute('y1', (Math.sin(a) * 41).toFixed(2));
    t.setAttribute('x2', (Math.cos(a) * 48).toFixed(2)); t.setAttribute('y2', (Math.sin(a) * 48).toFixed(2));
    svg.append(t);
  }
  face.append(svg);

  const cap = document.createElement('button');
  cap.type = 'button'; cap.className = 'knob-cap';
  cap.setAttribute('role', 'slider'); cap.setAttribute('aria-label', name);
  cap.setAttribute('aria-valuemin', '0'); cap.setAttribute('aria-valuemax', String(count - 1));
  cap.innerHTML = '<span class="knob-rot"><span class="knob-skirt"></span><span class="knob-grip"></span><span class="knob-pointer"></span></span>';
  face.append(cap);

  const detents = [];
  if (!mini) {
    for (let n = 0; n < count; n++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'knob-detent'; b.dataset.detent = String(n); b.dataset.nopad = '';
      b.textContent = labels[n]; b.setAttribute('aria-label', `${name} ${names[n]}`);
      b.style.setProperty('--a', `${detentAngle(n, count, sweep)}deg`);
      b.addEventListener('click', () => set(n, 'tap'));
      face.append(b); detents.push(b);
    }
  }
  el.append(face);
  const plate = document.createElement('div'); plate.className = 'knob-plate';
  plate.innerHTML = `<span class="knob-name">${name}</span>${mini ? '<span class="knob-read"></span>' : ''}`;
  el.append(plate);
  const read = plate.querySelector('.knob-read');

  const faces = new Set();
  function paint() {
    const i = model.index;
    cap.style.setProperty('--rot', `${detentAngle(i, count, sweep)}deg`);
    cap.setAttribute('aria-valuenow', String(i)); cap.setAttribute('aria-valuetext', names[i]);
    el.dataset.index = String(i);
    detents.forEach((b, n) => b.classList.toggle('on', n === i));
    if (read) read.textContent = labels[i];
  }
  function set(n, how) {
    const moved = model.set(n);
    if (moved) changed(how, moved);
    else if (how === 'tap') sound('stop');
  }
  function changed(how, moved) {
    for (const f of k.faces) f.paint();
    sound('detent', { step: model.index, count, moved });
    (bind ? bind.notify : onChange)(model.index, how);    // one value, one listener, however many faces it has
  }

  // drag (mouse, pen, touch): right or up turns it clockwise
  let drag = null;
  cap.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
    try { cap.setPointerCapture(e.pointerId); } catch { /* old browsers */ }
    el.classList.add('turning');
  });
  cap.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    const moved = model.drag(dx, dy);
    if (moved) { drag.moved += Math.abs(moved); changed('drag', moved); }
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const wasTap = drag.moved === 0;
    model.endDrag(); drag = null; el.classList.remove('turning');
    // a mini knob tapped without dragging: left half = down, right half = up
    if (wasTap && mini && e && e.type === 'pointerup') {
      const r = cap.getBoundingClientRect();
      const d = e.clientX < r.left + r.width / 2 ? -1 : 1;
      const moved = model.step(d);
      if (moved) changed('tap', moved); else sound('stop');
    }
  };
  cap.addEventListener('pointerup', end); cap.addEventListener('pointercancel', end); cap.addEventListener('lostpointercapture', () => end(null));
  // after a pointer turn, give the keyboard back to the scope (arrow keys pan unless you Tab onto a knob)
  cap.addEventListener('mouseup', () => { if (!cap.matches(':focus-visible')) cap.blur(); });

  el.addEventListener('wheel', e => {
    e.preventDefault(); e.stopPropagation();
    const moved = model.wheel(e.deltaY, e.deltaMode);
    if (moved) changed('wheel', moved);
  }, { passive: false });

  cap.addEventListener('keydown', e => {
    let d = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') d = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') d = -1;
    else if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); return set(0, 'key'); }
    else if (e.key === 'End') { e.preventDefault(); e.stopPropagation(); return set(count - 1, 'key'); }
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const moved = model.step(d);
    if (moved) changed('key', moved); else sound('stop');
  });

  const k = {
    el, cap, model, faces: bind ? bind.faces : faces, paint, notify: onChange,
    get index() { return model.index; },
    set: (n, how = 'code') => set(n, how),
    /** One detent from code (keyboard shortcut, gamepad trigger, pinch). Returns how far it moved. */
    step(d, how = 'code') { const moved = model.step(d); if (moved) changed(how, moved); else sound('stop'); return moved; },
    /** The gamepad turning a grabbed knob. */
    padTurn(d) { return k.step(d, 'pad'); },
  };
  k.faces.add(k);
  cap._knob = k; el._knob = k;
  paint();
  return k;
}
