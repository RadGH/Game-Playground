// PeerJS transport (PLAN §11.4): WebRTC data channels between browsers, signalled through the public
// PeerJS broker. Room code ABCDE -> the host's peer id `bannerline-ABCDE`. A client opens two data
// channels to the host: 'r' reliable + ordered (lobby, turns, control) and 'u' unreliable +
// unordered (inputs, repeated every packet, so one lost packet never stalls the match).
//   * 10 s connect timeout with the plain message "Your networks can't reach each other directly..."
//   * "ID is taken" -> NetError('taken') (lobbysync retries with a fresh code)
//   * heartbeats every second; a peer silent for 8 s (or whose channel closes) has left
//   * a message over chunks.js CHUNK characters (a snapshot) goes as frames on the reliable channel;
//     a send that throws is logged and drops that peer (a lost reliable message would desync it)
// The library is vendored (vendor/peerjs, MIT) and loaded only when someone hosts or joins.

import { listeners, NetError } from './transport.js';
import { split, createJoiner } from './chunks.js';

const PREFIX = 'bannerline-';
let loading = null;

function loadPeerJS() {
  if (typeof window !== 'undefined' && (window.Peer || (window.peerjs && window.peerjs.Peer))) return Promise.resolve(window.Peer || window.peerjs.Peer);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = new URL('../../../../vendor/peerjs/peerjs.min.js', import.meta.url).href;
    s.onload = () => resolve(window.Peer || (window.peerjs && window.peerjs.Peer));
    s.onerror = () => reject(new NetError('timeout', 'Could not load the online library'));
    document.head.appendChild(s);
  });
  return loading;
}

export async function createPeerTransport({ broker = {}, connectTimeoutMs = 10000, heartbeatMs = 1000, timeoutMs = 8000 } = {}) {
  const Peer = await loadPeerJS();
  const l = listeners();
  let peer = null, hostId = null, open = true;
  const conns = new Map();     // peer id -> { r, u, seen }
  let hb = 0, chunkId = 0;
  const now = () => performance.now();

  function wire(conn) {
    const id = conn.peer;
    const c = conns.get(id) || { r: null, u: null, seen: now(), joined: false, join: createJoiner() };
    conns.set(id, c);
    c[conn.label === 'u' ? 'u' : 'r'] = conn;
    conn.on('data', m => { c.seen = now(); if (m && m.k === 'hb') return; const whole = c.join(m); if (whole != null) l.emitMessage(id, whole); });
    conn.on('close', () => drop(id));
    conn.on('error', () => drop(id));
    return c;
  }
  function drop(id) { const c = conns.get(id); if (!c) return; conns.delete(id); try { c.r && c.r.close(); c.u && c.u.close(); } catch {} l.emitPeer({ type: 'leave', id }); }
  function startBeats() {
    hb = setInterval(() => {
      const t = now();
      for (const [id, c] of [...conns]) { if (t - c.seen > timeoutMs) { drop(id); continue; } try { c.r && c.r.open && c.r.send({ k: 'hb' }); } catch {} }
    }, heartbeatMs);
  }
  const brokerOpts = { debug: 0, ...broker };

  const t = {
    get id() { return peer ? peer.id : null; }, get hostId() { return hostId; },
    host(code) {
      return new Promise((resolve, reject) => {
        peer = new Peer(PREFIX + code, brokerOpts);
        const timer = setTimeout(() => reject(new NetError('timeout', "Could not reach the matchmaking service. Check your connection.")), connectTimeoutMs);
        peer.on('open', () => { clearTimeout(timer); hostId = peer.id; startBeats(); resolve(); });
        peer.on('error', e => { clearTimeout(timer); reject(new NetError(e.type === 'unavailable-id' ? 'taken' : 'timeout', e.message)); });
        peer.on('connection', conn => {
          conn.on('open', () => { const c = wire(conn); if (conn.label !== 'u' && !c.joined) { c.joined = true; l.emitPeer({ type: 'join', id: conn.peer }); } });
        });
      });
    },
    join(code) {
      return new Promise((resolve, reject) => {
        peer = new Peer(undefined, brokerOpts);
        const timer = setTimeout(() => { reject(new NetError('timeout', "Your networks can't reach each other directly. Try another network, or host from the other machine.")); }, connectTimeoutMs);
        peer.on('error', e => { clearTimeout(timer); reject(new NetError(e.type === 'peer-unavailable' ? 'no-room' : 'timeout', e.message)); });
        peer.on('open', () => {
          const target = PREFIX + code;
          const r = peer.connect(target, { reliable: true, serialization: 'json', label: 'r' });
          const u = peer.connect(target, { reliable: false, serialization: 'json', label: 'u' });
          let n = 0;
          const ready = () => { if (++n === 2) { clearTimeout(timer); hostId = target; startBeats(); resolve(); } };
          r.on('open', () => { wire(r); ready(); });
          u.on('open', () => { wire(u); ready(); });
        });
      });
    },
    send(to, msg, opts = {}) {
      const c = conns.get(to);
      if (!c) return;
      const frames = split(msg, ++chunkId);
      // frames must arrive in order and all of them: big messages always take the reliable channel
      const ch = frames.length === 1 && opts.reliable === false && c.u && c.u.open ? c.u : c.r;
      if (!ch || !ch.open) return;
      try { for (const f of frames) ch.send(f); } catch (err) {
        if (ch === c.u) { console.warn('peerjs: unreliable send failed', err); return; }   // inputs repeat anyway
        console.error('peerjs: reliable send failed — dropping', to, err);
        drop(to);
      }
    },
    broadcast(msg, opts) { for (const id of conns.keys()) t.send(id, msg, opts); },
    onMessage: l.onMessage, onPeer: l.onPeer,
    peers: () => [...conns.keys()],
    close() { if (!open) return; open = false; clearInterval(hb); for (const id of [...conns.keys()]) drop(id); if (peer) peer.destroy(); },
  };
  return t;
}
