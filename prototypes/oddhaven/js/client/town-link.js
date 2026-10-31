// The page's end of the sim: it starts the Worker, keeps a mirror of the visible town and turns the Worker's messages into
// promises. Everything the view knows about people comes through here, so a Node room can replace the Worker at M8.
//
//   const town = createTown({ onEvent });
//   const roster = await town.start({ townData, seed | save, awayMs });
//   town.mirror  town.roster  town.tick()  town.cmd(c)  town.setSpeed(x)  await town.inspect(id)  await town.save()  await town.health()
import { createMirror } from '../sim/snapshot.js';

/** Solo: the sim in a Worker. */
function workerLink() {
  const w = new Worker(new URL('../sim/worker.js', import.meta.url), { type: 'module' });
  return { post: m => w.postMessage(m), on: f => { w.addEventListener('message', e => f(e.data)); w.addEventListener('error', e => f({ type: 'error', message: e.message })); }, stop: () => w.terminate() };
}
/** A room: the same messages down a socket (js/sim/room.js). */
function roomLink(url) {
  const ws = new WebSocket(url), queue = [];
  ws.addEventListener('open', () => { for (const m of queue.splice(0)) ws.send(m); });
  return {
    post(m) { const t = JSON.stringify(m); if (ws.readyState === 1) ws.send(t); else queue.push(t); },
    on(f) { ws.addEventListener('message', e => f(JSON.parse(e.data))); ws.addEventListener('error', () => f({ type: 'error', message: `no room at ${url}` })); },
    stop: () => ws.close(),
  };
}

export function createTown({ onEvent = () => {}, onError = e => console.error('[oddhaven sim]', e), room = null } = {}) {
  const worker = room ? roomLink(room) : workerLink();
  const waits = { inspected: [], saved: [], savedText: [], health: [], phoned: [], facts: [] };
  let ready = null, stats = { ticks: 0, avgMs: 0, maxMs: 0, speed: 1 }, snapAt = performance.now(), speed = 1, snaps = 0, listeners = [];
  const self = {
    mirror: createMirror(), roster: null, caughtUp: 0, owner: 'solo', inRoom: !!room, hash: null, get stats() { return stats; }, get speed() { return speed; }, get snaps() { return snaps; }, turbo: 0,
    /** Snap listeners get each snapshot as it lands (the car rail keeps its own copy of the targets). */
    onSnap(fn) { listeners.push(fn); },
    start({ townData, seed, save = null, awayMs = 0, paused = false }) {
      return new Promise(res => { ready = res; worker.post({ type: 'init', town: townData, seed, save, awayMs, paused }); });
    },
    cmd: cmd => worker.post({ type: 'cmd', cmd }),
    setSpeed(x) { speed = x; worker.post({ type: 'speed', x }); },
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
    saveText: () => new Promise(res => { if (room) { waits.saved.push(res); worker.post({ type: 'save', id: 1 }); } else { waits.savedText.push(res); worker.post({ type: 'saveText', id: 1 }); } }),
    /** Someone is being played: the clock holds at 1x (PLAN rule 1). */
    control: on => worker.post({ type: 'control', on }),
    health: () => new Promise(res => { waits.health.push(res); worker.post({ type: 'health' }); }),
    stop() { worker.stop(); },
  };
  worker.on(m => {
    if (m.type === 'snap') {
      snapAt = performance.now(); snaps++;
      self.mirror.apply(m);
      for (const f of listeners) f(m);
      for (const e of m.events) onEvent(e);
    } else if (m.type === 'ready') {
      self.mirror = createMirror(); self.roster = m.roster; self.caughtUp = m.caughtUp || 0; self.hash = m.hash; if (m.you) self.owner = m.you;
      for (const f of listeners) f(null);
      ready?.(m.roster); ready = null;
    } else if (m.type === 'stats') stats = m;
    else if (m.type === 'inspected') waits.inspected.shift()?.(m.person);
    else if (m.type === 'phoned') waits.phoned.shift()?.(m.phone);
    else if (m.type === 'facts') waits.facts.shift()?.(m.facts);
    else if (m.type === 'saved') waits.saved.shift()?.(m);
    else if (m.type === 'savedText') waits.savedText.shift()?.(m);
    else if (m.type === 'health') waits.health.shift()?.(m);
    else if (m.type === 'error') onError(m.message);
  });
  return self;
}
