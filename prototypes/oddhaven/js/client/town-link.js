// The page's end of the sim: it starts the Worker or opens a room, keeps a mirror of the visible town and turns the messages into promises.
// Everything the view knows about people comes through here, so a Node room and the Worker are the same thing to the rest of the page.
//
//   const town = createTown({ onEvent });
//   const roster = await town.start({ townData, seed | save, awayMs });
//   await town.start({ link: roomLink(...) })     a room instead of the Worker (js/client/room-link.js); each start brings its own link
//   town.mirror  town.roster  town.tick()  town.cmd(c)  town.setSpeed(x)  await town.inspect(id)  await town.save()  await town.health()
import { createMirror } from '../sim/snapshot.js';
import { createBody } from './smooth.js';
import { fetchData } from '../sim/data.js';

/** Solo: the sim in a Worker. */
function workerLink() {
  const w = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
  return { post: m => w.postMessage(m), on: f => { w.addEventListener('message', e => f(e.data)); w.addEventListener('error', e => f({ type: 'error', message: e.message })); }, stop: () => w.terminate() };
}
export function createTown({ onEvent = () => {}, onError = e => console.error('[oddhaven sim]', e), onRoom = () => {} } = {}) {
  let worker = workerLink(), spare = null, simData = null;
  /** A room's page may have come from the room's own server. If that server dies there is nothing left to load a Worker from, so one waits, loaded, with the data it needs. */
  const nextWorker = () => { const w = spare ?? workerLink(); spare = null; return w; };
  const waits = { inspected: [], saved: [], savedText: [], health: [], phoned: [], facts: [] };
  let ready = null, stats = { ticks: 0, avgMs: 0, maxMs: 0, speed: 1 }, snapAt = performance.now(), speed = 1, snaps = 0, listeners = [], rels = [];
  const self = {
    mirror: createMirror(), roster: null, caughtUp: 0, owner: 'solo', inRoom: false, hash: null, get stats() { return stats; }, get speed() { return speed; }, get snaps() { return snaps; }, turbo: 0, link: null, bodies: new Map(), room: null,
    /** Snap listeners get each snapshot as it lands (the car rail keeps its own copy of the targets). */
    onSnap(fn) { listeners.push(fn); },
    /** Another player's body, with the room's clock on it. */
    serverNow: () => (self.link?.clock.ready ? self.link.clock.now(performance.now()) : performance.now()),
    onRel(fn) { rels.push(fn); },
    post: m => worker.post(m),
    /** In a room (`link`) nothing has to be sent: the link has said hello and asked for a seat; the answer is `ready`, or `refused` and the promise says null. */
    start({ townData, seed, save = null, awayMs = 0, paused = false, link = null }) {
      worker.stop();
      self.bodies.clear(); self.room = null;
      if (link) { worker = link; self.link = link; self.inRoom = true; spare ??= workerLink(); fetchData(new URL('../../data/', import.meta.url)).then(d => { simData = d; }).catch(() => {}); } else { worker = nextWorker(); self.link = null; self.inRoom = false; self.owner = 'solo'; }
      wire();
      return new Promise(res => { ready = res; if (!link) worker.post({ type: 'init', town: townData, seed, save, awayMs, paused, ...(simData ? { data: simData } : null) }); });
    },
    cmd: cmd => worker.post({ type: 'cmd', cmd }),
    setSpeed(x) { speed = x; worker.post({ type: 'speed', x }); },
    /** What the room says the speed is: nothing to ask, only to keep the picture in step. */
    setLocalSpeed(x) { speed = x; },
    setTurbo(x) { self.turbo = x; worker.post({ type: 'turbo', x }); },
    step: n => worker.post({ type: 'step', n }),
    /** Interpolated sim tick: where the town is now, between snapshots. */
    tick() {
      const k = (self.turbo || speed) * (self.roster?.clock.ticksPerSecond ?? 4), ahead = (performance.now() - snapAt) / 1000 * k;
      return self.mirror.t + Math.min(ahead, 2 + k * 0.3);
    },
    inspect: id => new Promise(res => { waits.inspected.push(res); worker.post({ type: 'inspect', id }); }),
    phone: (household, who) => new Promise(res => { waits.phoned.push(res); worker.post({ type: 'phone', household, who }); }),
    facts: (a, b) => new Promise(res => { waits.facts.push(res); worker.post({ type: 'facts', a, b }); }),
    save: now => new Promise(res => { waits.saved.push(res); worker.post({ type: 'save', id: 1, now }); }),
    saveText: () => new Promise(res => { if (self.inRoom) { waits.saved.push(res); worker.post({ type: 'save', id: 1 }); } else { waits.savedText.push(res); worker.post({ type: 'saveText', id: 1 }); } }),
    /** Someone is being played: the clock holds at 1x (PLAN rule 1). */
    control: on => worker.post({ type: 'control', on }),
    health: () => new Promise(res => { waits.health.push(res); worker.post({ type: 'health' }); }),
    stop() { worker.stop(); },
    /** Out of a room: the socket is shut and nothing is running until the next start. */
    leaveRoom() { if (!self.inRoom) return; worker.stop(); self.inRoom = false; self.link = null; self.owner = 'solo'; worker = nextWorker(); wire(); },
  };
  function wire() {
    const here = worker;
    worker.on(m => {
      if (here !== worker) return;      // a link that has been replaced has nothing more to say
      if (m.type === 'snap') {
        snapAt = performance.now(); snaps++;
        self.mirror.apply(m);
        for (const f of listeners) f(m);
        for (const e of m.events) onEvent(e);
      } else if (m.type === 'ready') {
        const again = !ready;      // a socket that came back: the page keeps going, and takes a whole new picture of the town
        const routes = self.mirror.routes;
        self.mirror = createMirror(); self.roster = m.roster; self.caughtUp = m.caughtUp || 0; self.hash = m.hash; if (m.you) self.owner = m.you;
        if (again) { self.mirror.routes = routes; onRoom({ ...m, type: 'back' }); return; }
        for (const f of listeners) f(null);
        ready?.(m.roster); ready = null;
        if (m.you) onRoom(m);
      } else if (m.type === 'refused') { const r = ready; ready = null; if (r) r(null); onRoom(m); }
      else if (m.type === 'stats') stats = m;
      else if (m.type === 'rel') {
        for (const g of m.g) {
          for (const [id, x, z, h, lv, inside] of g.p) { let b = self.bodies.get(id); if (!b) self.bodies.set(id, b = createBody()); b.push(g.at, x, z, h, lv, inside); }
          for (const f of rels) f(g);
        }
      } else if (m.type === 'inspected') waits.inspected.shift()?.(m.person);
      else if (m.type === 'phoned') waits.phoned.shift()?.(m.phone);
      else if (m.type === 'facts') waits.facts.shift()?.(m.facts);
      else if (m.type === 'saved') waits.saved.shift()?.(m);
      else if (m.type === 'savedText') waits.savedText.shift()?.(m);
      else if (m.type === 'health') waits.health.shift()?.(m);
      else if (m.type === 'denied') { onEvent({ kind: 'cmd.refused', cmd: m.cmd, why: `denied:${m.why}`, who: m.who, owner: self.owner }); onRoom(m); }
      else if (m.type === 'error') onError(m.message);
      else if (m.type === 'nolink') { const r = ready; ready = null; if (r) r(null); }
      else onRoom(m);
    });
  }
  wire();
  return self;
}
