// Phone controls, laid out for portrait: a thumb stick bottom left, GAS and BRAKE as big named buttons bottom right,
// HORN and VIEW small above them, and a drag anywhere up the screen to look round. Every target is at least 44 px.
// Reads like Roverlands' touch.state(), so its input.js can take this as its `touch` option.
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

export function createTouch({ onView, onHorn, onTap, onSkill, onDodge }) {
  const root = el('div', 'od-touch');
  const look = el('div', 'od-look'), zone = el('div', 'od-stickzone'), ring = el('i', 'od-ring'), thumb = el('b', 'od-thumb');
  zone.append(ring, thumb);
  const gas = el('button', 'od-btn od-gas', 'GAS'), brake = el('button', 'od-btn od-brake', 'BRAKE'), horn = el('button', 'od-btn od-mini od-horn', 'HORN'), view = el('button', 'od-btn od-mini od-view', 'VIEW'), use = el('button', 'od-btn od-use', 'GET IN'), skill = el('button', 'od-btn od-skill', 'SKILL'), dodge = el('button', 'od-btn od-dodge', 'DODGE');
  for (const b of [gas, brake, horn, view, use, skill, dodge]) { b.type = 'button'; b.dataset.nonav = '1'; }
  use.hidden = true;
  root.append(look, zone, gas, brake, horn, view, use, skill, dodge);
  skill.addEventListener('pointerdown', e => { e.preventDefault(); st.active = true; onSkill?.(); skill.classList.add('down'); setTimeout(() => skill.classList.remove('down'), 120); });
  dodge.addEventListener('pointerdown', e => { e.preventDefault(); st.active = true; onDodge?.(); dodge.classList.add('down'); setTimeout(() => dodge.classList.remove('down'), 120); });
  const st = { active: false, mx: 0, my: 0, lookX: 0, lookY: 0, gas: false, brake: false, use: false, useHeld: false };
  // the big button is pressed once for most things and held down for a hose
  use.addEventListener('pointerdown', e => { e.preventDefault(); st.active = true; st.use = true; st.useHeld = true; use.classList.add('down'); try { use.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ } });
  const useUp = () => { st.useHeld = false; use.classList.remove('down'); };
  use.addEventListener('pointerup', useUp); use.addEventListener('pointercancel', useUp); use.addEventListener('lostpointercapture', useUp);
  const hold = (b, k) => {
    const down = e => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ } b.classList.add('down'); st[k] = true; st.active = true; };
    const up = () => { b.classList.remove('down'); st[k] = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  };
  hold(gas, 'gas'); hold(brake, 'brake');
  horn.addEventListener('pointerdown', e => { e.preventDefault(); st.active = true; onHorn?.(); });
  view.addEventListener('pointerdown', e => { e.preventDefault(); st.active = true; onView?.(); });

  const R = 54; let sid = null, ox = 0, oy = 0;
  const stick = e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    st.mx = m / R < 0.1 ? 0 : Math.round(dx / R * 100) / 100; st.my = m / R < 0.1 ? 0 : -Math.round(dy / R * 100) / 100;
  };
  const reset = () => { sid = null; st.mx = st.my = 0; thumb.style.transform = ''; };
  zone.addEventListener('pointerdown', e => {
    // a new thumb always takes the stick: iOS can swallow a finger-up, and the stick must never stay held (Roverlands 2026-10-25)
    sid = e.pointerId; try { zone.setPointerCapture(sid); } catch { /* not a live pointer */ }
    const r = zone.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; stick(e); e.preventDefault(); st.active = true;
  });
  zone.addEventListener('pointermove', stick); zone.addEventListener('pointerup', reset); zone.addEventListener('pointercancel', reset); zone.addEventListener('lostpointercapture', reset);
  let lid = null, lx = 0, ly = 0, travel = 0, downAt = 0;
  look.addEventListener('pointerdown', e => { lid = e.pointerId; lx = e.clientX; ly = e.clientY; travel = 0; downAt = e.timeStamp; try { look.setPointerCapture(lid); } catch { /* not a live pointer */ } st.active = true; });
  look.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; st.lookX += (e.clientX - lx) * 0.006; st.lookY += (e.clientY - ly) * 0.006; travel += Math.hypot(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; });
  const endLook = () => { lid = null; };
  look.addEventListener('pointerup', e => { if (lid === e.pointerId && travel < 10 && e.timeStamp - downAt < 450) onTap?.(e.clientX, e.clientY); endLook(); }); look.addEventListener('pointercancel', endLook);
  for (const n of [root, zone, look]) { n.addEventListener('contextmenu', e => e.preventDefault()); n.addEventListener('selectstart', e => e.preventDefault()); }
  const letGo = () => { reset(); lid = null; st.gas = st.brake = st.useHeld = false; gas.classList.remove('down'); brake.classList.remove('down'); };
  addEventListener('blur', letGo); addEventListener('orientationchange', letGo); document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
  return {
    el: root, letGo, get useHeld() { return st.useHeld; },
    show(v) { root.classList.toggle('on', !!v); if (!v) letGo(); },
    /** 'car' shows the pedals; 'foot' only the stick and the use button. */
    mode(m) { root.dataset.mode = m; },
    skillInfo(name, left, dleft) { const a = left > 0 ? `${Math.ceil(left)}` : name, b = dleft > 0 ? `${Math.ceil(dleft)}` : 'DODGE'; if (skill.textContent !== a) skill.textContent = a; if (dodge.textContent !== b) dodge.textContent = b; skill.classList.toggle('wait', left > 0); dodge.classList.toggle('wait', dleft > 0); },
    useLabel(text) { use.hidden = !text; if (text && use.textContent !== text) use.textContent = text; },
    state() { const out = { ...st, swap: false }; st.lookX = 0; st.lookY = 0; st.use = false; return out; },
  };
}
