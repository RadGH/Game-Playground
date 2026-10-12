# Thousandvale — 300-bot load run from a second machine (stream H, PLAN §15 M3, §16.3)

M3's gate says "300 bots (from a second machine) + real players". Bots on the same VM steal CPU from the server, so
the real run comes from another computer on the LAN (the owner's Windows PC) or an hourly cloud box. The same tools
rehearse it on this VM now.

## Pieces

| file | what |
|---|---|
| `load-server.sh` | starts a **load server** on port 8495: the published release (same code players get), its own throw-away Postgres (`ops/scratch-pg.sh`, unix socket only), `--max-per-ip 2000`. Never the stable server or its database. `stop` deletes the scratch DB. |
| `run-300.mjs` | the run: N child processes of real WebSocket bots (stream G's `tools/bot-client.mjs`), a `/status` sampler, a pass/fail report in `results/`. Refuses port 8490, a server reporting `env: stable`, and a protocol-version mismatch. |
| `pack-bots.sh` | zips the runner + the bot client + the 5 `js/net` modules it imports (from the published release, so the protocol matches) into `dist/thousandvale-bots-<build>.zip`. Node 22+ is all the other machine needs — no npm install. |

Gate (defaults, M2's numbers): ≥ 98% joined, tick p99 (median of the window) ≤ 20 ms, worst tick < 50 ms, ≤ 8 KB/s per
client (24 for `--scenario town`), ≤ 2% of bots without a snapshot at the end. Change with `--gate p99=20,worst=50,kb=8,join=0.98`.

Scenarios: `spread` (default — a third idle in Torborhold, two thirds out fighting), `town` (all 300 in the hub: PLAN §16's
"300 in one town" crowd), `fight` (all in the wilds).

## The real run (second machine)

1. On the VM: `ops/load/load-server.sh start --pin` (server on cpus 0-7). Note the `ws://192.168.1.34:8495` it prints.
2. `ops/load/pack-bots.sh` — prints a LAN link to the zip (served by the dev playground server on 8401).
3. On the PC: install Node 22 LTS, unzip, PowerShell in the folder:
   `node ops\load\run-300.mjs --url ws://192.168.1.34:8495` (10-minute window), then `--scenario town`.
4. Copy `ops\load\results\load-*.json` back (or paste the printed summary).
5. On the VM: `ops/load/load-server.sh stop`.

**Per-address caps.** The load server allows 2,000 sockets per address. New guest accounts are still capped at 20 per
address per hour by the gateway (no flag yet — asked of stream A). Until that flag exists, make the accounts on the VM
first (loopback is exempt) and hand the PC the tokens:
`node ops/load/run-300.mjs --url ws://127.0.0.1:8495 --seconds 30 --tokens tokens.json` on the VM, copy `tokens.json`
next to the runner on the PC, and add `--tokens tokens.json` there. The tokens belong to the load server's scratch
database only and die with `load-server.sh stop`.

Real players at the same time: point them at the load server's LAN address
(`http://192.168.1.34:8495/`) during the run, not at stable.

## Same-VM rehearsal

```bash
ops/load/load-server.sh start --pin
ops/load/pack-bots.sh && cd /tmp && unzip -o <the zip> && cd thousandvale-bots
node ops/load/run-300.mjs --url ws://127.0.0.1:8495 --rehearsal          # bots pinned to cpus 8-11, 5-minute window
```
A rehearsal proves the tools and gives a floor, not the gate: the 4 bot cores and the server share one machine
(and whatever else the other streams are running). Results of past runs: `docs/CHANGELOG.md` (H entries).
