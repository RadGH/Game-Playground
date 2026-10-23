// Everything this page tells the server, in one small module the server agent can wire (and every call fails softly
// when there is no server — offline couch play, GitHub Pages, the bare test server):
//   postFeedback(body)  -> { ok, id } | throws a friendly Error     POST <root>/feedback  (feedback.js uses it)
//   rateArena({ arena, mode, v: 1|-1, why: 'fun,buggy', players })  POST <root>/tally  as a 'rate' event
//   voteArena({ choices, votes, picked })                            POST <root>/tally  as a 'vote' event
//   tally(name, props)                                               cookie-free page counts (batched)
// <root> is the site root two folders above this page (like Tumblefair: new URL('../../../../x', import.meta.url)).
// To point somewhere else, set window.KNOCKABOUT_API = 'https://host/prefix' before the page loads.
const root = () => (typeof window !== 'undefined' && window.KNOCKABOUT_API) ? String(window.KNOCKABOUT_API).replace(/\/$/, '') + '/' : new URL('../../../../', import.meta.url).href;
const url = p => root() + p;

/** Ratings: 👍 / 👎 plus reasons (Tumblefair's list; Buggy and Unfair are offered on both thumbs). */
export const RATE_REASONS = Object.freeze({
  up: [['fun', 'Fun'], ['funny', 'Funny'], ['again', 'Again!'], ['buggy', 'But buggy'], ['unfair', 'But unfair']],
  down: [['boring', 'Boring'], ['confusing', 'Confusing'], ['hard', 'Too hard'], ['laggy', 'Laggy'], ['unplayable', 'Unplayable'], ['buggy', 'Buggy'], ['unfair', 'Unfair']],
});

export async function postFeedback(body) {
  let res;
  try { res = await fetch(url('feedback'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ game: 'knockabout', ...body }) }); }
  catch { throw new Error('Could not reach the server. Your report was not sent.'); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out.ok) throw new Error(res.status === 404 || res.status === 501 ? 'Reports are not switched on for this copy of the game yet.' : out.msg || `The server said ${res.status}.`);
  return out;
}

const queue = [];
let timer = 0;
function send() {
  timer = 0; if (!queue.length) return;
  const body = JSON.stringify(queue.splice(0, 20));
  try { if (navigator.sendBeacon?.(url('tally'), new Blob([body], { type: 'text/plain' }))) return; } catch { /* fall through */ }
  fetch(url('tally'), { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
}
/** A count. name: a-z 0-9 _ ; props: up to a few plain values. Automated tests do not count (unless ?tally=1). */
export function tally(name, props = undefined) {
  try { window.knockaboutTally?.(name, props); } catch { /* an outside hook must never break the game */ }
  if (navigator.webdriver && !/[?&]tally=1/.test(location.search)) return;
  queue.push({ g: 'knockabout', e: name, ...(props ? { p: props } : {}) });
  if (queue.length >= 20) send(); else if (!timer) timer = setTimeout(send, 4000);
}
export const rateArena = ({ arena, mode, v, why = '', players = 1 }) => tally('rate', { arena, mode, v: v > 0 ? 1 : -1, why, players });
export const voteArena = ({ choices, votes, picked }) => tally('vote', { choices: choices.join(','), votes: votes.join(','), picked });
if (typeof addEventListener !== 'undefined') {
  addEventListener('pagehide', send);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(); });
}
