// The sim in a module Worker (solo play). The room server drives the same sim through driver.js.
//   const w = new Worker(new URL('./sim/worker.js', import.meta.url), { type: 'module' });
//
// In:  { type:'init', seed?, town?, save? (JSON text or gzip bytes), data?, awayMs? (real time since the save: the town catches up), paused? }   no town = fake-town.js; no data = fetch data/
//      { type:'cmd', cmd }        a sim command (README-sim.md)
//      { type:'speed', x }        0 1 2 4, solo god view only
//      { type:'control', on }     someone took control: holds speed at 1x
//      { type:'inspect', id }     details panel for one person
//      { type:'phone', household, who }   the Phone's data for one household
//      { type:'facts', a, b }     what two people have to talk about (gossip.js); the answer is type facts
//      { type:'save', id, now? }  ask for a save
//      { type:'saveText', id }    the plain text and hash of the state (moving a save to a room, tests)
//      { type:'step', n }         run n ticks now, then a snapshot (tests)
//      { type:'turbo', x }        any speed multiple, tests only
//      { type:'health' }          the audit: { problems, stuck, trips, resets }
//      { type:'resend' }          next snapshot is whole
// Out: { type:'ready', roster }   once, after init
//      { type:'snap', t, day, minute, people, gone, cars, events, routes? }   see snapshot.js
//      { type:'inspected', person }
//      { type:'health', ... }
//      { type:'saved', id, bytes (gzip, transferred), size }
//      { type:'stats', ticks, avgMs, maxMs, speed }   once a second
//      { type:'error', message }

import { createSim } from './index.js';
import { createDriver } from './driver.js';
import { fetchData } from './data.js';
import { fakeTown } from './fake-town.js';
import { gzipText, gunzipText } from './save.js';
import { problems, createStuckWatch } from './audit.js';

const PUMP_MS = 50;
const post = (msg, transfer) => self.postMessage(msg, transfer || []);
let sim = null, driver = null, timer = null, watch = null, watched = 0;

async function init(msg) {
  const data = msg.data || await fetchData(new URL('../../data/', import.meta.url));
  const town = msg.town || fakeTown();
  const save = msg.save && typeof msg.save !== 'string' ? await gunzipText(msg.save) : msg.save;
  sim = createSim({ seed: msg.seed ?? 1, data, town, save });
  const away = msg.awayMs ? sim.catchUp(msg.awayMs) : 0;
  driver = createDriver({ sim, post, timer: () => performance.now() });
  if (msg.paused) driver.setSpeed(0);
  watch = createStuckWatch(sim); watched = sim.t;
  post({ type: 'ready', roster: driver.roster(), caughtUp: away, hash: sim.hash(), t: sim.t });
  driver.resend();
  let beat = 0;
  timer = setInterval(() => {
    driver.pump(performance.now());
    if (sim.t - watched >= sim.clock.ticks(60)) { watched = sim.t; watch.check(); }
    if (++beat * PUMP_MS >= 1000) { beat = 0; post({ type: 'stats', ...driver.stats(), speed: driver.speed }); }
  }, PUMP_MS);
}

self.addEventListener('message', async ({ data: msg }) => {
  try {
    if (msg.type === 'init') { clearInterval(timer); await init(msg); return; }
    if (!sim) return;
    if (msg.type === 'cmd') driver.command(msg.cmd);
    else if (msg.type === 'speed') driver.setSpeed(msg.x);
    else if (msg.type === 'control') driver.setControlled(msg.on);
    else if (msg.type === 'inspect') post({ type: 'inspected', person: driver.inspect(msg.id) });
    else if (msg.type === 'phone') post({ type: 'phoned', phone: driver.phone(msg.household, msg.who) });
    else if (msg.type === 'facts') post({ type: 'facts', facts: driver.facts(msg.a, msg.b) });
    else if (msg.type === 'step') driver.stepNow(msg.n);
    else if (msg.type === 'resend') driver.resend();
    else if (msg.type === 'turbo') driver.setTestSpeed(msg.x);
    else if (msg.type === 'health') post({ type: 'health', id: msg.id, problems: problems(sim), stuck: watch.found.slice(0, 12), stuckCount: watch.found.length, t: sim.t, day: sim.clock.day(sim.t), trips: sim.state.trips.length, resets: sim.state.stats.resets, tripsDone: sim.state.stats.trips, billsRun: sim.state.stats.billsRun, poorest: Math.min(...sim.state.households.map(h => h.money)) });
    else if (msg.type === 'saveText') post({ type: 'savedText', id: msg.id, text: sim.save(msg.now ?? null), hash: sim.hash() });
    else if (msg.type === 'save') {
      const text = sim.save(msg.now ?? null), bytes = await gzipText(text);
      post({ type: 'saved', id: msg.id, bytes: bytes.buffer, size: bytes.length }, [bytes.buffer]);
    }
  } catch (err) { post({ type: 'error', message: String(err?.stack || err) }); }
});
