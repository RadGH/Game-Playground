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
//
// 2026-10-16 — the CONTROLLER layout (owner, Steam Deck: "it kept the desktop layout, there was no way to open the
// inventory … and the chat, quests, etc took up too much screen"). <html data-layout="pad"> = css/layout-pad.css +
// js/client/input/pad-layout.js (the controller menu, the folded chat, the one-line trackers). Automatic turns it on
// whenever a controller is the device in use (input/device.js says 'pad'), on any screen size, and off again when the
// mouse, the keyboard or a finger is used. Both ways are DEBOUNCED (PAD_ON_MS / PAD_OFF_MS) so a stray key press or a
// nudge of the mouse never makes the screen flicker between layouts. Forced with the same setting: Controller.
export const PHONE_LAYOUT_ENABLED = true;
export const PAD_ON_MS = 250, PAD_OFF_MS = 1500;

const KEY = 'tv.layout';
export const LAYOUTS = [['auto', 'Automatic'], ['desktop', 'Desktop'], ['phone', 'Phone'], ['pad', 'Controller']];
const CHOICES = new Set(LAYOUTS.map(l => l[0]));
export function layoutChoice() { try { const v = localStorage.getItem(KEY); return CHOICES.has(v) && v !== 'auto' ? v : 'auto'; } catch { return 'auto'; } }
export function setLayoutChoice(v) { try { if (v === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* private window */ } return applyLayout(); }

/** Is this a phone-sized touch screen? (coarse pointer, short side under 500 CSS px) */
export function looksLikePhone(w = window) {
  try { return (w.matchMedia('(pointer: coarse)').matches || (w.navigator && w.navigator.maxTouchPoints > 0)) && Math.min(w.innerWidth, w.innerHeight) < 500; } catch { return false; }
}
/**
 * Which layout should be in force right now. Pure given its inputs — tests/G/bindings.test.js.
 * `pad` = a controller is the device in use (already debounced by the caller). It wins over the phone on Automatic: a
 * controller in your hands means the touch buttons are in the way.
 */
export function decideLayout({ enabled = PHONE_LAYOUT_ENABLED, choice = 'auto', asked = null, phone = false, pad = false } = {}) {
  if (asked === 'phone' || asked === 'desktop' || asked === 'pad') return asked;
  if (choice === 'pad') return 'pad';
  if (choice === 'desktop') return 'desktop';
  if (pad) return 'pad';
  if (!enabled) return 'desktop';
  if (choice === 'phone') return 'phone';
  return phone ? 'phone' : 'desktop';
}
/** The controller-in-use flag the layout reads, debounced. input/index.js hands device changes here. */
let padLive = false, padTimer = 0;
export function padInUse() { return padLive; }
export function notePadDevice(isPad, doc = document) {
  clearTimeout(padTimer);
  if (isPad === padLive) return;
  padTimer = setTimeout(() => { padLive = isPad; applyLayout(doc); }, isPad ? PAD_ON_MS : PAD_OFF_MS);
}
const subs = new Set();
export const onLayout = fn => { subs.add(fn); return () => subs.delete(fn); };
let watching = false;
const named = l => (l === 'phone' || l === 'pad' ? l : 'desktop');
/** Set (or clear) the attribute for the layout in force. Returns 'phone' | 'pad' | 'desktop'. Safe to call again at any time. */
export function applyLayout(doc = document) {
  const html = doc.documentElement;
  if (html.dataset.gallery) return named(html.dataset.layout);   // the gallery's frame decides for itself
  const q = new URLSearchParams(location.search);
  const want = decideLayout({ choice: layoutChoice(), asked: q.get('layout'), phone: looksLikePhone(), pad: padLive });
  const was = named(html.dataset.layout);
  if (want === 'phone') {
    html.dataset.layout = 'phone'; html.dataset.variant = q.get('variant') || html.dataset.variant || 'a';
    for (const href of ['css/input.css', 'css/layout-phone.css']) if (!doc.querySelector(`link[href$="${href}"]`)) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l); }
    // the page must not zoom or rubber-band under a thumb; the safe-area insets need viewport-fit=cover
    const vp = doc.querySelector('meta[name="viewport"]');
    if (vp && !/viewport-fit/.test(vp.content)) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  } else if (want === 'pad') {
    html.dataset.layout = 'pad';
    if (!doc.querySelector('link[href$="css/layout-pad.css"]')) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/layout-pad.css'; doc.head.appendChild(l); }
  } else delete html.dataset.layout;
  if (!watching) {
    watching = true;
    let t = 0; const again = () => { clearTimeout(t); t = setTimeout(() => applyLayout(doc), 150); };
    addEventListener('resize', again); addEventListener('orientationchange', again);
    // iOS ignores user-scalable=no: refuse the pinch gesture itself while the phone layout is on (the map and the forest zoom by their own pinch)
    for (const ev of ['gesturestart', 'gesturechange']) doc.addEventListener(ev, e => { if (html.dataset.layout === 'phone') e.preventDefault(); }, { passive: false });
    let lastTap = 0; doc.addEventListener('touchend', e => { if (html.dataset.layout !== 'phone') return; const now = Date.now(); if (now - lastTap < 320 && !e.target.closest('input, textarea, select')) e.preventDefault(); lastTap = now; }, { passive: false });   // no double-tap zoom
  }
  const now = named(want);
  if (now !== was) for (const fn of [...subs]) { try { fn(now); } catch (e) { console.error('[layout]', e); } }
  return now;
}
