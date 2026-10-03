// Transports: how Bannerline machines talk (PLAN §11.4). Swappable — the lockstep and the lobby only
// ever see this interface:
//
//   const t = await createTransport(kind, opts)
//   t.id                                  this endpoint's id (unique in the room)
//   await t.host(code)                    become the host of room `code` (rejects { code: 'taken' })
//   await t.join(code)                    connect to the host of room `code` (rejects { code: 'no-room' | 'timeout' })
//   t.hostId                              the host's id (after host() or join())
//   t.send(to, msg, { reliable = true })  one JSON-safe message to one peer. Clients only ever talk to the
//                                         host (star topology); unreliable = may drop / reorder (inputs)
//   t.broadcast(msg, opts)                host: to every connected client
//   t.onMessage(fn(from, msg))            add a listener
//   t.onPeer(fn({ type: 'join' | 'leave', id }))
//   t.peers()                             host: connected client ids; client: [hostId]
//   t.close()                             leave (peers get a 'leave')
//
// Kinds: 'loopback' (in-process, node tests: latency, jitter, reorder, drops, virtual time),
// 'channel' (BroadcastChannel between tabs of one browser: Playwright, no network), 'peerjs' (WebRTC
// through the public PeerJS broker: real online play), 'cfrelay' (stub: the documented upgrade path,
// a Cloudflare Durable Objects relay + TURN — docs/online.md).

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // no I or O (and no digits: no 0/1 confusion)
export const CODE_LENGTH = 5;

/** A fresh room code: 5 letters. `rand` = () => [0,1) (net code, not the sim: Math.random is fine). */
export function newRoomCode(rand = Math.random) {
  let c = '';
  for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return c;
}

/** Normalise what a player typed: upper case, letters only, I->J? no: reject anything outside the alphabet. */
export function cleanRoomCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c.length !== CODE_LENGTH || [...c].some(ch => !CODE_ALPHABET.includes(ch))) return null;
  return c;
}

/** Listener plumbing every transport shares. */
export function listeners() {
  const msg = [], peer = [];
  return {
    onMessage(fn) { msg.push(fn); return () => { const i = msg.indexOf(fn); if (i >= 0) msg.splice(i, 1); }; },
    onPeer(fn) { peer.push(fn); return () => { const i = peer.indexOf(fn); if (i >= 0) peer.splice(i, 1); }; },
    emitMessage(from, m) { for (const f of msg.slice()) f(from, m); },
    emitPeer(ev) { for (const f of peer.slice()) f(ev); },
  };
}

export class NetError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** The plain-language messages the lobby shows (PLAN §11.4). */
export const NET_MESSAGES = {
  taken: 'That room code is in use. Try again.',
  'no-room': 'No room with that code. Check the code with the host.',
  timeout: "Your networks can't reach each other directly. Try another network, or host from the other machine.",
  version: 'Version mismatch: update and rejoin.',
  full: 'That room is full.',
  'host-left': 'Host left — match ended, results saved.',
};

/** Build a transport by kind. opts are passed to the kind's factory. */
export async function createTransport(kind, opts = {}) {
  switch (kind) {
    case 'loopback': { if (!opts.hub) throw new Error('loopback transport needs opts.hub (createLoopbackHub)'); return opts.hub.transport(opts.id); }
    case 'channel': { const m = await import('./channel.js'); return m.createChannelTransport(opts); }
    case 'peerjs': { const m = await import('./peerjs.js'); return m.createPeerTransport(opts); }
    case 'cfrelay': { const m = await import('./cfrelay.js'); return m.createRelayTransport(opts); }
    default: throw new Error(`Unknown transport "${kind}"`);
  }
}
