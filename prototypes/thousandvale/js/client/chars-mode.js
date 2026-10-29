// Which character system draws people: `?chars=kestrel` in the page URL = the Kestrel kit body (batch 1, 2026-10-27 —
// kestrel-body.js, avatar-3d/kestrel/kit/README.md "Thousandvale"); anything else = Chibi 2.5 exactly as before. Its own
// tiny module so anything (portraits, the far crowd, mount sizes) can ask without loading a body builder.

/** 'kestrel' | null from a page's query string (pure — exported for tests). */
export function charsMode(search = '') { return /(?:^|[?&])chars=kestrel(?:&|$)/.test(String(search || '')) ? 'kestrel' : null; }
export const CHARS = charsMode(typeof location !== 'undefined' ? location.search : '');
export const KESTREL = CHARS === 'kestrel';
