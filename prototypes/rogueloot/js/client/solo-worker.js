// Solo play: the SAME hub + world the room server runs, inside a Worker, so a solo game is an online game with one seat
// and no network. The page talks to it with exactly the messages it would send a socket.
import { createHub } from '../net/hub.js';
import { STEP_HZ } from '../sim/world.js';
import { validateCharacter } from '../rules/validate.js';
import { loadContentAsync } from '../sim/content.js';

const early = [];
let conn = null;
onmessage = e => (conn ? conn.message(e.data) : early.push(e.data));
const content = await loadContentAsync(f => fetch(new URL('../../data/' + f, import.meta.url)).then(r => { if (!r.ok) throw new Error(f); return r.json(); }));
const hub = createHub({ seed: (Math.random() * 2 ** 31) >>> 0, build: 'solo', content, checkCharacter: ch => validateCharacter(ch) });
conn = hub.accept({ send: d => postMessage(d) });
for (const m of early.splice(0)) conn.message(m);
let last = performance.now(), owed = 0;
const STEP_MS = 1000 / STEP_HZ;
setInterval(() => { const t = performance.now(); owed = Math.min(owed + (t - last), STEP_MS * 5); last = t; while (owed >= STEP_MS) { owed -= STEP_MS; hub.step(); } }, 8);
