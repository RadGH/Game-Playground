// BroadcastChannel transport (PLAN §11.4): tabs of one browser on one origin talk through a channel
// named after the room. No network at all — the two-page Playwright tests run online play this way.
// It is reliable and ordered (an `unreliable` send is still delivered). A peer that goes silent for
// `timeoutMs` (heartbeats every `heartbeatMs`) or says `bye` (on close / pagehide) has left.

import { listeners, NetError } from './transport.js';

const rid = () => 'c' + Math.random().toString(36).slice(2, 10);

export function createChannelTransport({ heartbeatMs = 1000, timeoutMs = 6000, probeMs = 250, joinTimeoutMs = 3000 } = {}) {
  const id = rid();
  const l = listeners();
  let bc = null, hostId = null, isHost = false, open = true;
  const linked = new Map();   // peer id -> last seen (ms)
  let hb = 0, watch = 0;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const post = m => { if (bc && open) bc.postMessage({ ...m, from: id }); };

  function seen(peer) { if (linked.has(peer)) linked.set(peer, now()); }
  function drop(peer) { if (linked.delete(peer)) l.emitPeer({ type: 'leave', id: peer }); }
  function startBeats() {
    hb = setInterval(() => post({ k: 'hb' }), heartbeatMs);
    watch = setInterval(() => { const t = now(); for (const [p, at] of [...linked]) if (t - at > timeoutMs) drop(p); }, heartbeatMs);
    if (typeof addEventListener === 'function') addEventListener('pagehide', bye);
  }
  function bye() { post({ k: 'bye' }); }
  function openChannel(code) {
    bc = new BroadcastChannel('bannerline-room-' + code);
    bc.onmessage = e => {
      const m = e.data;
      if (!m || m.from === id) return;
      seen(m.from);
      if (m.k === 'probe' && isHost) post({ k: 'probe-ack', to: m.from });
      else if (m.k === 'hello' && isHost) { if (!linked.has(m.from)) { linked.set(m.from, now()); post({ k: 'welcome', to: m.from }); l.emitPeer({ type: 'join', id: m.from }); } }
      else if (m.k === 'bye') drop(m.from);
      else if (m.k === 'msg' && m.to === id && linked.has(m.from)) l.emitMessage(m.from, m.msg);
      else if (bc._wait) bc._wait(m);
    };
  }

  const t = {
    id, get hostId() { return hostId; },
    host(code) {
      return new Promise((resolve, reject) => {
        openChannel(code);
        let taken = false;
        bc._wait = m => { if (m.k === 'probe-ack' && m.to === id) taken = true; };
        post({ k: 'probe' });
        setTimeout(() => {
          bc._wait = null;
          if (taken) { bc.close(); bc = null; reject(new NetError('taken', 'room code taken')); return; }
          isHost = true; hostId = id; startBeats(); resolve();
        }, probeMs);
      });
    },
    join(code) {
      return new Promise((resolve, reject) => {
        openChannel(code);
        const timer = setTimeout(() => { bc._wait = null; reject(new NetError('no-room', 'no such room')); }, joinTimeoutMs);
        bc._wait = m => {
          if (m.k === 'welcome' && m.to === id) {
            clearTimeout(timer); bc._wait = null;
            hostId = m.from; linked.set(m.from, now()); startBeats(); resolve();
          }
        };
        post({ k: 'hello' });
      });
    },
    send(to, msg) { if (linked.has(to)) post({ k: 'msg', to, msg }); },
    broadcast(msg) { for (const p of linked.keys()) t.send(p, msg); },
    onMessage: l.onMessage, onPeer: l.onPeer,
    peers: () => [...linked.keys()],
    close() {
      if (!open) return;
      bye(); open = false;
      clearInterval(hb); clearInterval(watch);
      if (typeof removeEventListener === 'function') removeEventListener('pagehide', bye);
      if (bc) bc.close();
      linked.clear();
    },
  };
  return t;
}
