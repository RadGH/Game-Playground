// THE switch for the phone layout (play-test 5, T26 — stream G).
//
// The phone layout is a PROPOSAL the owner reviews in the gallery (ui-gallery.html) before it goes live. It is real
// code — css/layout-phone.css and input/touch.js — that does nothing unless <html data-layout="phone"> is set, and the
// only place that may set it in the game is here.
//
//   To switch it on for players: set PHONE_LAYOUT_ENABLED = true (and add css/layout-phone.css + css/input.css to
//   index.html if they are not there yet). Nothing else changes. docs/UI.md "How a proposal graduates" has the checklist.
export const PHONE_LAYOUT_ENABLED = false;

/** Is this a phone-sized touch screen? (coarse pointer, short side under 500 CSS px) */
export function looksLikePhone(w = window) {
  try { return w.matchMedia('(pointer: coarse)').matches && Math.min(w.innerWidth, w.innerHeight) < 500; } catch { return false; }
}
/** Called once by input/index.js. Returns the layout in force: 'phone' | 'desktop'. The gallery's frame sets the attribute itself. */
export function applyLayout(doc = document) {
  const html = doc.documentElement;
  if (html.dataset.layout === 'phone') return 'phone';                        // the gallery (frame-boot.js)
  const asked = new URLSearchParams(location.search).get('layout');           // ?layout=phone on the dev pages, for trying it in the real game
  if ((PHONE_LAYOUT_ENABLED && looksLikePhone()) || (asked === 'phone' && /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname))) {
    html.dataset.layout = 'phone'; html.dataset.variant = new URLSearchParams(location.search).get('variant') || 'a';
    for (const href of ['css/input.css', 'css/layout-phone.css']) if (!doc.querySelector(`link[href="${href}"]`)) { const l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = href; doc.head.appendChild(l); }
    return 'phone';
  }
  return 'desktop';
}
