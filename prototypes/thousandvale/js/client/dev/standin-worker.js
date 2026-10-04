// STAND-IN — hosts js/client/dev/standin-sim.js inside a Worker (one tab) or a SharedWorker (every tab
// of this browser shares one server, so two tabs see each other offline). Replaced by stream A's
// Worker build. Each port / the worker itself is one connection; messages are the JSON objects a
// WebSocket would carry, posted as structured clones.
import { createStandinServer } from './standin-sim.js';

const server = createStandinServer({ seed: 7, now: () => performance.now() });
const live = new Set();
setInterval(() => {
  server.step();
  // A closed tab never tells a SharedWorker; a port silent for 8 s (pings are every 2 s) is gone.
  const now = performance.now();
  for (const c of live) if (now - c.seen > 8000) { c.conn.close(); live.delete(c); }
}, server.tickMs);

function attach(port) {
  const c = { seen: performance.now(), conn: server.connect(msg => port.postMessage(msg)) };
  live.add(c);
  port.onmessage = e => {
    c.seen = performance.now();
    if (e.data && e.data.t === '__close') { c.conn.close(); live.delete(c); } else c.conn.receive(e.data);
  };
  if (port.start) port.start();
}

if (typeof self.onconnect !== 'undefined' || typeof SharedWorkerGlobalScope !== 'undefined' && self instanceof SharedWorkerGlobalScope) {
  self.onconnect = e => attach(e.ports[0]);
} else {
  attach(self);
}
