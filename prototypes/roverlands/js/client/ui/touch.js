// Phone controls (game-standards §1): a thumb stick that appears wherever the left thumb lands, drag anywhere on the
// right half to look around, and big named buttons — GAS, BRAKE, JUMP, ENTER, FIRE, SEAT (all ≥ 44 px, 60+ in fact).
// Pinch on the right half moves the camera in / out.
//
//   const touch = createTouch({ settings });   touch.show(true|false)   touch.mode('all'|'foot'|'drive'|'gunner'|'passenger')
//   touch.state() -> the held-state object js/game/input.js reads as its `touch` option:
//     { active, mx, my (+1 = stick pushed up), lookX, lookY (radians since the last read), gas, brake, jump, boost, fire,
//       use, swap, horn, camNear, camFar }       use / swap / camNear / camFar are true ONCE per press (cleared on read)
import { el } from './dom.js';

const BUTTONS = [
  ['gas', 'GAS'], ['brake', 'BRAKE'], ['jump', 'JUMP'], ['use', 'ENTER'], ['fire', 'FIRE'], ['swap', 'SEAT'],
];
/** Which buttons each situation shows (the lead calls touch.mode() when the player gets in / out). */
export const TOUCH_MODES = Object.freeze({
  all: ['gas', 'brake', 'jump', 'use', 'fire', 'swap'],
  foot: ['jump', 'use'],
  drive: ['gas', 'brake', 'jump', 'use', 'swap'],
  gunner: ['fire', 'use', 'swap'],
  passenger: ['use', 'swap'],
});

export function createTouch({ settings = () => ({}) } = {}) {
  const root = el('div', 'rl-touch');
  const zone = el('div', 'rl-tzone'), look = el('div', 'rl-tlook');
  const stick = el('div', 'rl-tstick', '<i class="rl-tring"></i><b class="rl-tthumb"></b>');
  zone.append(stick);
  const pad = el('div', 'rl-tbtns');
  root.append(look, zone, pad);
  const st = { active: false, mx: 0, my: 0, lookX: 0, lookY: 0, gas: false, brake: false, jump: false, boost: false, fire: false, use: false, swap: false, horn: false, camNear: false, camFar: false };
  const edgeKeys = new Set(['use', 'swap']);
  const btn = {};
  for (const [k, label] of BUTTONS) {
    const b = el('button', 'rl-tbtn rl-t-' + k, label); b.type = 'button'; b.dataset.k = k; b.dataset.nonav = '1'; btn[k] = b; pad.append(b);
    const down = e => { e.preventDefault(); try { b.setPointerCapture?.(e.pointerId); } catch { /* not a live pointer */ } b.classList.add('down'); if (edgeKeys.has(k)) st[k] = true; else st[k] = true; st.active = true; };
    const up = () => { b.classList.remove('down'); if (!edgeKeys.has(k)) st[k] = false; };
    b.addEventListener('pointerdown', down); b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  // ---- the stick: appears under the thumb
  const R = 58; let sid = null, ox = 0, oy = 0;
  const thumb = stick.querySelector('.rl-tthumb');
  zone.addEventListener('pointerdown', e => {
    if (sid != null) return; sid = e.pointerId; try { zone.setPointerCapture(sid); } catch { /* not a live pointer */ }
    const r = zone.getBoundingClientRect(); ox = e.clientX; oy = e.clientY;
    stick.style.left = (ox - r.left) + 'px'; stick.style.top = (oy - r.top) + 'px'; stick.classList.add('on'); moveStick(e); e.preventDefault(); st.active = true;
  });
  const moveStick = e => {
    if (e.pointerId !== sid) return;
    let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy);
    if (m > R) { dx *= R / m; dy *= R / m; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    if (m / R < 0.12) { st.mx = 0; st.my = 0; } else { st.mx = Math.round(dx / R * 100) / 100; st.my = -Math.round(dy / R * 100) / 100; }
  };
  const endStick = e => { if (e.pointerId !== sid) return; sid = null; st.mx = st.my = 0; stick.classList.remove('on'); thumb.style.transform = ''; };
  zone.addEventListener('pointermove', moveStick); zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
  // ---- look: drag on the right half; two fingers = pinch for the camera distance
  const fingers = new Map(); let pinch0 = null;
  look.addEventListener('pointerdown', e => { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { look.setPointerCapture(e.pointerId); } catch { /* not a live pointer */ } st.active = true; if (fingers.size === 2) pinch0 = spread(); e.preventDefault(); });
  look.addEventListener('pointermove', e => {
    const f = fingers.get(e.pointerId); if (!f) return;
    if (fingers.size >= 2) {
      f.x = e.clientX; f.y = e.clientY;
      const d = spread();
      if (pinch0 && Math.abs(d - pinch0) > 40) { if (d > pinch0) st.camNear = true; else st.camFar = true; pinch0 = d; }
      return;
    }
    const k = 0.0062 * (settings().mouseSens ?? 1), inv = settings().invertY ? -1 : 1;
    st.lookX += (e.clientX - f.x) * k; st.lookY += (e.clientY - f.y) * k * inv;
    f.x = e.clientX; f.y = e.clientY;
  });
  const endLook = e => { fingers.delete(e.pointerId); if (fingers.size < 2) pinch0 = null; };
  look.addEventListener('pointerup', endLook); look.addEventListener('pointercancel', endLook);
  function spread() { const [a, b] = [...fingers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }

  let shown = false, curMode = 'all';
  function mode(m) {
    curMode = TOUCH_MODES[m] ? m : 'all';
    for (const [k, b] of Object.entries(btn)) b.hidden = !TOUCH_MODES[curMode].includes(k);
    root.dataset.mode = curMode;
  }
  mode('all');
  return {
    el: root,
    show(v) {
      shown = !!v; root.classList.toggle('on', shown);
      if (!shown) { for (const k of Object.keys(st)) st[k] = typeof st[k] === 'number' ? 0 : false; sid = null; fingers.clear(); stick.classList.remove('on'); for (const b of Object.values(btn)) b.classList.remove('down'); }
    },
    get shown() { return shown; },
    mode, get currentMode() { return curMode; },
    /** Read once a frame. Look deltas and one-press buttons are used up by the read. */
    state() {
      const out = { ...st };
      st.lookX = 0; st.lookY = 0; st.use = false; st.swap = false; st.camNear = false; st.camFar = false;
      out.active = shown && (st.active || out.use || out.swap);
      return out;
    },
  };
}
