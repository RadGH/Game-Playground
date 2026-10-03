# Bannerline — online play (stream D, M5)

Online play is **deterministic lockstep**: every machine runs the whole simulation and only the
players' commands travel. It works for every game mode in the mode registry (`js/sim/modes/`),
because the network never looks inside the sim; a start packet carries the mode, format and seed.

## 1. Pieces

| File | Job |
|---|---|
| `js/net/transport.js` | The transport interface (host / join by room code, send, broadcast, peers, close), room codes, plain error messages, `createTransport(kind)` |
| `js/net/loopback.js` | In-process transport on virtual time with latency, jitter (so packets reorder), drops. Node tests |
| `js/net/channel.js` | BroadcastChannel between tabs of one browser. The Playwright two-page tests |
| `js/net/peerjs.js` | WebRTC data channels signalled through the public PeerJS broker (vendor/peerjs, MIT). Real online play |
| `js/net/cfrelay.js` | **Stub**: the upgrade path (§4). Throws "not deployed" |
| `js/net/lobbysync.js` | The online lobby: rooms, seats (couch / online / AI), ready, ping, start packet, back to lobby, rejoin |
| `js/net/lockstep.js` | The match protocol: inputs, turns, input delay, stalls, hash check + resync, takeover, rejoin, hidden tabs |
| `js/net/netclock.js` | The online match clock (same interface as `js/clock.js`) + hidden-tab handling |
| `js/sim/worker.js` | The clock worker: pulses while the tab is hidden |
| `tools/desync-diff.mjs` | Prints where two states disagree (from a lockstep desync dump) |

## 2. How a match runs

1. **Lobby.** The host makes a room (`createRoom`): a 5-letter code (no I, O or digits), peer id
   `bannerline-CODE` on PeerJS. Machines join with the code (`joinRoom`) and send their **data hash**:
   different data is refused with "Version mismatch: update and rejoin". Each machine claims seats for
   its local players (one keyboard + pads, i.e. couch play works online too); the host sets AI seats and
   open/closed seats. Up to 6 machines. The host pings every machine each second.
2. **Start.** When every human seat is ready the host sends the **start packet**: seed, mode, format,
   map, players, input delay (from the worst ping: `delayFor(rtt)`, 2–8 ticks; 1 offline), tick
   length, and per machine its players and a rejoin token. Every machine builds the same sim.
3. **Ticks.** Commands issued while the sim is at tick S are sealed into tick S + delay. Clients send
   every unacknowledged input to the host on the unreliable channel (so a lost packet is repaired by the
   next; one drop never stalls). The host assembles **turn T** once every live machine's input for T is
   in, keeps only commands for each machine's own players, and sends the turn reliably. Everyone runs
   turn T when it has it. A late machine stalls everyone (`waitingFor` says who); a lagging one catches
   up 8 ticks per update.
4. **Checks.** Every 20 ticks clients report their state hash. On a mismatch the host sends a snapshot
   and the turns after it; the client swaps its sim (a short hiccup). `dump: true` keeps both states:
   `node tools/desync-diff.mjs dump.json` prints the first fields that differ.
5. **Leaving.** A client that disconnects is replaced by a Veteran AI at an announced tick (a system
   command inside a turn, so every machine switches at the same tick). If the host leaves, the match
   ends: "Host left — match ended, results saved". No host migration (PLAN §11.4).
6. **Rejoin.** The machine comes back with its token (`joinRoom({ rejoinToken })`); the host sends the
   match packet, a snapshot and the turns after it, and hands the seat back (`release`) a few ticks
   ahead.
7. **Hidden tabs.** Browsers stop animation frames in hidden tabs, which would freeze lockstep for
   everyone. The clock worker keeps pulsing, so a hidden tab keeps sending inputs and running turns;
   the others see "(tab hidden)" next to the name. The host can still `replaceWithAI(machine)`.
   **Deviation from PLAN §11.3:** the sim stays on the main thread (the view reads `sim.state`
   synchronously each frame); the worker owns the clock, which is what hidden tabs needed.
8. **Back to lobby.** `room.backToLobby()` keeps seats and devices, clears ready.

## 3. Determinism, proven

- `tests/lockstep.test.js`: two and three machines under 0–300 ms latency with jitter and 20% drops agree
  every 20 ticks to tick 1200; stalls; injected desync -> resync; takeover; host leaving; rejoin.
- `tests/net.spec.js`: two browser pages over BroadcastChannel (same hash at tick 1200, guest closes ->
  AI), a hidden tab kept alive by the worker, and **cross-engine**: a recorded 5-minute 2v2 replays to
  the same hash every 200 ticks in Firefox (SpiderMonkey), Chromium and node (V8). Opt-in:
  `BL_PEERJS=1 npx playwright test prototypes/bannerline/tests/net.spec.js -g PeerJS` runs two pages
  over the real public broker (passed 2026-10-03).

## 4. Upgrade path: Cloudflare (recommended over Vercel / Cloudways)

The public PeerJS broker is free and needs no server, but (a) it is shared and has no uptime promise,
and (b) WebRTC fails between some networks (symmetric NATs, strict firewalls) because PeerJS uses only
public STUN, no TURN. When that shows up in testing:

- **Cloudflare Workers + one Durable Object per room.** Every machine opens a WebSocket to
  `wss://<worker>/room/<CODE>`; the Durable Object relays messages. It holds the sockets for the whole
  match (no 300 s limit like Vercel Hobby WebSocket functions), sits close to players, and the free tier
  covers friends' games. The relay speaks the protocol written at the top of `js/net/cfrelay.js`, which
  is a drop-in transport — the lobby and lockstep do not change.
- **Cloudflare Realtime TURN** (1,000 GB/month free) for WebRTC through strict networks, if direct
  peer connections are kept for latency.
- What is needed to build it: a Cloudflare account, `wrangler`, a ~100-line Worker (room routing, a
  Durable Object with `webSocket.accept()`, a `Map` of sockets, forward `{ to, msg }`), a TURN key, and
  `cfrelay.js` filled in (WebSocket client implementing the transport interface). Vercel's WebSocket
  functions cap connections at 300 s on Hobby; Cloudways means a VM to keep alive.

## 5. Limits (accepted for friends' games)

- Lockstep means every machine knows everything (no fog of war secrecy online).
- Speed and pause are fixed online (`netclock.setSpeed` / `setPaused` are no-ops).
- A machine that is hidden AND throttled by the OS still stalls everyone; the waiting banner names it.
