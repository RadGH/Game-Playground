// Input layer (T27) — which device the player used LAST: 'keyboard' (and mouse), 'pad' or 'touch'. Hints follow it
// (input/hints.js), the focus ring shows only for a pad, and <html data-input="…" data-glyphs="…"> lets CSS follow too.
import { GLYPH_SETS } from './bindings.js';

const subs = new Set();
let cur = 'keyboard', glyphs = 'xbox', forced = false, userGlyphs = null;
const html = typeof document !== 'undefined' ? document.documentElement : null;
function apply() { if (html) { html.dataset.input = cur; html.dataset.glyphs = glyphs; } for (const fn of [...subs]) { try { fn(cur, glyphs); } catch (e) { console.error('[input] device listener', e); } } }

export const device = {
  get current() { return cur; },
  get glyphs() { return userGlyphs || glyphs; },
  /** A device was just used. `g` = the glyph set the pad's id suggests (ignored once the player picked one in settings). */
  seen(d, g = null) { if (forced) return; const G = userGlyphs || g || glyphs; if (d === cur && G === glyphs) return; cur = d; glyphs = G; apply(); },
  /** Hold a device (the gallery's frames; tests). force(null) lets it follow real input again. */
  force(d, g = null) { if (d == null) { forced = false; return; } forced = true; cur = d; if (g && GLYPH_SETS.includes(g)) glyphs = g; apply(); },
  /** The player's own choice of glyphs (settings): 'auto' or a set name. */
  setGlyphs(g) { userGlyphs = g && g !== 'auto' && GLYPH_SETS.includes(g) ? g : null; if (userGlyphs) glyphs = userGlyphs; apply(); },
  get userGlyphs() { return userGlyphs || 'auto'; },
  on(fn) { subs.add(fn); return () => subs.delete(fn); },
};
if (html) { html.dataset.input = cur; html.dataset.glyphs = glyphs; }
