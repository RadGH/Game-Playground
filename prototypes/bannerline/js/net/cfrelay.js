// Cloudflare relay transport — STUB (the documented upgrade path, docs/online.md §4).
//
// When PeerJS can't connect two players (symmetric NATs, strict corporate networks), the plan is a
// small Cloudflare Worker with one Durable Object per room that every machine connects to over a
// WebSocket; the object relays messages (star topology, exactly what lockstep already uses), and
// Cloudflare Realtime TURN credentials let WebRTC through for anything that later wants it.
//
// Wire protocol this file will speak (so the server can be written against it):
//   connect  wss://<worker>/room/<CODE>?id=<clientId>&role=host|join
//   server -> { k: 'welcome', hostId }  |  { k: 'error', code: 'taken' | 'no-room' }
//   client -> { k: 'msg', to, msg, reliable }      server forwards as { k: 'msg', from, msg }
//   server -> { k: 'peer', type: 'join' | 'leave', id }
// Everything else (lobby, lockstep) is unchanged — it only sees js/net/transport.js.

import { NetError } from './transport.js';

export async function createRelayTransport() {
  throw new NetError('unavailable', 'The Cloudflare relay is not deployed yet (see docs/online.md). Use the default online mode.');
}
