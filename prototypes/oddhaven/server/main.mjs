// A tiny dev server for M2's co-op smoke test: rooms in memory, one WebSocket per tab, port 8561.
//   node prototypes/oddhaven/server/main.mjs [port]
// The room is js/sim/room.js, the same sim the Worker runs. Stable 8560, https 8562/8563, permissions, limits and saved rooms
// are M8. The path picks the room: ws://host:8561/room/ABCD. The first tab's `init` message sets it up (town, seed or save).
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { createRoom } from '../js/sim/room.js';
import { DATA_FILES } from '../js/sim/data.js';

const PORT = Number(process.argv[2]) || 8561, PUMP_MS = 50, IDLE_MS = 15000;
const data = Object.fromEntries(DATA_FILES.map(f => [f, JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'))]));
const rooms = new Map();

const http = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ ok: true, rooms: [...rooms.entries()].map(([id, r]) => ({ id, clients: r.room?.clients ?? 0, t: r.room?.sim.t ?? 0 })) }));
});
const wss = new WebSocketServer({ server: http, maxPayload: 32 * 1024 * 1024 });

function joinRoom(ws, code, msg) {
  let r = rooms.get(code);
  if (!r || (msg.fresh && !r.room?.clients)) { r = { room: createRoom({ data, town: msg.town, seed: msg.seed ?? 1, save: msg.save ?? null, paused: !!msg.paused }), empty: 0 }; rooms.set(code, r); }
  const send = m => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
  return { r, id: r.room.join(send) };
}

wss.on('connection', (ws, req) => {
  const code = (new URL(req.url, 'http://x').pathname.match(/^\/room\/([A-Za-z0-9_-]{1,16})$/) || [])[1];
  if (!code) { ws.close(); return; }
  let me = null;
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'init') { if (!me) me = joinRoom(ws, code, msg); return; }
      if (me) me.r.room.message(me.id, msg);
    } catch (e) { console.error('[oddhaven room]', e); ws.send(JSON.stringify({ type: 'error', message: String(e?.message || e) })); }
  });
  ws.on('close', () => { if (me) me.r.room.leave(me.id); });
});

setInterval(() => {
  const now = performance.now();
  for (const [code, r] of rooms) {
    try { r.room.pump(now); } catch (e) { console.error('[oddhaven room]', e); }
    if (r.room.clients) r.empty = 0; else if ((r.empty += PUMP_MS) > IDLE_MS) rooms.delete(code);
  }
}, PUMP_MS);

http.listen(PORT, '0.0.0.0', () => console.log(`[oddhaven] dev rooms on ${PORT}`));
