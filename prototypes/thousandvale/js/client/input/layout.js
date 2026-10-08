// THE switch for the phone layout (play-test 5 T26; switched ON after the owner's review, 2026-10-07 — stream G).
//
// The phone layout is css/layout-phone.css + js/client/input/touch.js. Both do nothing unless <html data-layout="phone">
// is set, and this file is the only place in the game that sets it (the gallery's frame sets it itself).
//
//   PHONE_LAYOUT_ENABLED   false = the game never uses the phone layout (the gallery still shows it)
//   Settings > Key bindings > Touch > "Layout":  Automatic (a touch screen whose short side is under 500 px) / Desktop / Phone
//     saved in this browser as tv.layout; ?layout=phone|desktop on the address wins for one visit.
// The choice is made again when the screen turns or changes size (a phone rotating stays a phone; a tablet split-view
// that becomes narrow turns into one).
export const PHONE_LAYOUT_ENABLED = true;

const KEY = 'tv.layout';
export const LAYOUTS = [['auto', 'Automatic'], ['desktop', 'Desktop'], ['phone', 'Phone']];
export function layoutChoice() { try { const v = localStorage.getItem(KEY); return v === 'desktop' || v === 'phone' ? v : 'auto'; } catch { return 'auto'; } }
export function setLayoutChoice(v) { try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* private window */ } return applyLayout(); }

/** Is this a phone-sized touch screen? (coarse pointer, short side under 500 CSS px) */
export function looksLikePhone(w = window) {
  try { return (w.matchMedia('(pointer: coarse)').matches || (w.navigator && w.navigator.maxTouchPoints > 0)) && Math.min(w.innerWidth, w.innerHeight) < 500; } catch { return false; }
}
/** Which layout should be in force right now. Pure given its inputs — tests/G/bindings.test.js. */
export function decideLayout({ enabled = PHONE_LAYOUT_ENABLED, choice = 'auto', asked = null, phone = false } = {}) {
  if (asked === 'phone' || asked === 'desktop') return asked;
  if (!enabled) return 'desktop';
  if (choice === 'phone' || choice === 'desktop') return choice;
  return phone ? 'phone' : 'desktop';
}
const subs = new Set();
export const onLayout = fn => { subs.add(fn); return () => subs.delete(fn); };
let watching = false;
/** Set (or clear) the attribute for the layout in force. Returns 'phone' | 'desktop'. Safe to call again at any time. */
export function applyLayout(doc = document) {
  const html = doc.documentElement;
  if (html.dataset.gallery) return html.dataset.layout === 'phone' ? 'phone' : 'desktop';   // the gallery's frame decides for itself
  const q = new URLSearchParams(location.search);
  const want = decideLayout({ choice: layoutChoice(), asked: q.get('layout'), phone: looksLikePhone() });
  const was = html.dataset.layout === 'phone' ? 'phone' : 'desktop';
  if (want === 'phone') {
    html.dataset.layout = 'phone'; html.dataset.variant = q.get('variant') || html.dataset.variant || 'a';
    for (const href of ['css/input.css', 'css/layout-phone.css']) if (!doc.querySelector(`link[href$="${href}"]`)) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l); }
    // the page must not zoom or rubber-band under a thumb; the safe-area insets need viewport-fit=cover
    const vp = doc.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.content)) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  } else delete html.dataset.layout;
  if (!watching) {
    watching = true;
    let t = 0; const again = () => { clearTimeout(t); t = setTimeout(() => applyLayout(doc), 150); };
    addEventListener('resize', again); addEventListener('orientationchange', again);
    // iOS ignores user-scalable=no: refuse the pinch gesture itself while the phone layout is on (the map and the forest zoom by their own pinch)
    for (const ev of ['gesturestart', 'gesturechange']) doc.addEventListener(ev, e => { if (html.dataset.layout === 'phone') e.preventDefault(); }, { passive: false });
    let lastTap = 0; doc.addEventListener('touchend', e => { if (html.dataset.layout !== 'phone') return; const now = Date.now(); if (now - lastTap < 320 && !e.target.closest('input, textarea, select')) e.preventDefault(); lastTap = now; }, { passive: false });   // no double-tap zoom
  }
  const now = want === 'phone' ? 'phone' : 'desktop';
  if (now !== was) for (const fn of [...subs]) { try { fn(now); } catch (e) { console.error('[layout]', e); } }
  return now;
}
