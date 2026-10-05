#!/usr/bin/env node
// A PROVINCE PROCESS (stream A, stage 2, PLAN §8.1): forked by server/main.mjs with its province list.
// It runs js/sim/province.js for those provinces, OWNS the game sockets the gateway hands it (the raw TCP
// socket arrives over IPC with the HTTP upgrade request; the WebSocket handshake happens here), and talks to
// the gateway over the IPC channel ({ bus: msg } both ways). Never started by hand.

import { performance } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { createProvince } from '../js/sim/province.js';
import { startTicker } from '../js/net/clock.js';
import { MAX_FRAME } from '../js/net/protocol.js';
import { log, loadRules, makeStore, loadLayouts } from './load.mjs';
import { wireSocket, startPinger } from './ws-conn.mjs';

const cfg = JSON.parse(process.argv[2]);
const now = () => performance.now();
const handlers = [];
const bus = { send: m => { if (process.connected) process.send({ bus: m }); }, on: fn => handlers.push(fn) };

const store = await makeStore(cfg);
const { createRules } = await loadRules(cfg.rules);
const { layouts, events, encounterInfo } = await loadLayouts(cfg.provinces);
const province = createProvince({
  proc: cfg.n, layouts, store, bus, createRules, encounterInfo, build: cfg.build, now, log,
  lingerMs: cfg.linger, saveEveryMs: cfg.saveEvery, journalMs: cfg.journalMs, processName: cfg.process,
});
await province.init();
bus.send({ k: 'hello', proc: cfg.n, provinces: layouts.map(L => L.key), events });

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
const pinger = startPinger(wss);
process.on('message', (m, handle) => {
  if (!m) return;
  if (m.bus) { for (const h of handlers) h(m.bus); return; }
  if (m.sock && handle) {
    const s = m.sock;
    const req = { method: s.method, url: s.url, headers: s.headers, socket: handle };
    wss.handleUpgrade(req, handle, Buffer.from(s.head, 'base64'), ws => wireSocket(ws, s.ip, s.path, (p, c) => province.accept(p, c)));
    return;
  }
  if (m.stop) stop(m.stop);
});
const ticker = startTicker(() => province.step(), { ms: 50, clock: { now, setTimeout, clearTimeout }, onSkip: k => province.tickStats.skip(k) });
process.send({ ready: true });
log('province process up', { n: cfg.n, provinces: cfg.provinces });

let stopping = false;
async function stop(code) {
  if (stopping) return;
  stopping = true;
  ticker.stop(); clearInterval(pinger);
  await province.shutdown(code);
  for (const ws of wss.clients) ws.terminate();
  if (store.close) await store.close();
  process.exit(0);
}
process.on('SIGTERM', () => stop('restart'));
process.on('disconnect', () => stop('restart'));      // the gateway died: save everyone and go
