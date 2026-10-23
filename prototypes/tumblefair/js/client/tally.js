// Basic page counts (round 7, owner 2026-10-22: "basic analytics, replace with GA later").
//
//   import { tally } from './tally.js';
//   tally('host_game', { mode: 'board' });        // name: a-z 0-9 _ ; up to 4 plain properties
//
// Events are batched and posted to our own server (POST /tally, server/insights.mjs) — no cookies, nothing stored on the
// device, no third party. tools/insights-report.mjs reads the counts.
//
// TO SWAP IN GOOGLE ANALYTICS LATER: load gtag.js in index.html and set `window.tumblefairTally = (name, props) =>
// gtag('event', name, props)` before this module runs; every call then goes there as well. GA sets cookies, so it also
// needs a consent banner (and should only load after a yes) — the cookie-free counting here does not.
// (The file is not called analytics.js on purpose: ad-blocker lists block that name, and one blocked import stops the page.)
const URL_ = new URL('../../../../tally', import.meta.url).href;
const queue = [];
let timer = 0;
function send() {
  timer = 0; if (!queue.length) return;
  const body = JSON.stringify(queue.splice(0, 20));
  try {
    if (navigator.sendBeacon?.(URL_, new Blob([body], { type: 'text/plain' }))) return;       // survives closing the tab
  } catch { /* fall through */ }
  fetch(URL_, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}
export function tally(name, props = undefined) {
  try { window.tumblefairTally?.(name, props); } catch { /* the GA hook must never break the game */ }
  if (navigator.webdriver && !/[?&]tally=1/.test(location.search)) return;         // automated tests do not count (unless asked)
  queue.push(props ? { e: name, p: props } : { e: name });
  if (queue.length >= 20) send(); else if (!timer) timer = setTimeout(send, 4000);
}
addEventListener('pagehide', send);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
/** The kind of device, in one word (no fingerprinting: just the screen shape and touch). */
export const deviceKind = () => (matchMedia('(pointer: coarse)').matches ? (Math.min(screen.width, screen.height) >= 700 ? 'tablet' : 'phone') : 'computer');
