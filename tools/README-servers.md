# Two servers: one you can trust, one that is being worked on

## Why

> "The game does not load due to `Uncaught SyntaxError: The requested module
> '../../../avatar-3d/js/chibi2-motion.js' does not provide an export named 'CHIBI2_COMBAT_ALL'`.
> Is that because work is in progress? Can we make it so the hosted server is a stable version and
> have a different server for development?"

It was. An agent had written the `import` in `actors.js` and had not yet written the matching
`export` in `chibi2-motion.js` — a state that lasts seconds and takes the whole page down while it
does. There is no amount of care that removes that window; the fix is to not be pointed at it.

## What there is now

| port | what | where | who moves it |
|---|---|---|---|
| **8400** | **STABLE** | `~/claude/playground-stable` (a git worktree on the `stable` branch) | only `tools/publish-stable.sh` |
| **8401** | **DEV** | `~/claude/playground` (the live working tree) | every save, every agent |

**8400 is the bookmark you already have**, so nothing you have written down changes. It is now the
one that cannot break mid-edit.

## Using it

```bash
tools/serve-both.sh          # start or restart both
tools/serve-both.sh stop     # stop both
tools/publish-stable.sh      # promote HEAD to stable
tools/publish-stable.sh <ref>   # promote a specific commit or branch
tools/publish-stable.sh --force # skip the checks (don't)
```

## The gate

`publish-stable.sh` refuses to promote a commit that does not pass **both**:

1. **Every `.js` file in the tree parses** (`node --check`, on a `git archive` of that exact commit,
   not on the working tree). This is the check that catches the failure above, and it is the one a
   unit-test run does **not** — `node --test` never loads the browser modules, so a half-written
   import sails straight through a green suite.
2. **`npm run test:unit` passes.**

It has been tested by feeding it a deliberately broken commit: it named the file, refused, and left
stable where it was.

A stable server that serves a broken build is worse than no stable server, because now you do not
know which of the two to believe.

## Notes

* The worktree is a serving copy. Nothing but `publish-stable.sh` writes to it, and that script
  hard-resets it first, so a stray file can never block a publish.
* `library/synced/` is git-ignored and survives the reset, so a library sync to 8400 still works.
* The Playwright suite runs against **8401**, deliberately. Pointing it at stable would mean the
  tests passed against a build nobody is editing while the code being written went unchecked.

## Thousandvale (the MMO) — its own game server, not these two

Thousandvale is a real game server (Node + WebSockets + Postgres), not static files, so it does not go
through `serve.py` at all. Its ports sit next to the playground's in the same stable-lower / dev-higher
pattern (PLAN §10.1, ops notes in `prototypes/thousandvale/ops/`):

| port | what | where | bound to |
|---|---|---|---|
| **8490** | **STABLE** game server (M1.5): client + `/gw` + `/p/<n>` + `/status` + `/healthz` | a published allow-listed copy in `/srv/thousandvale/current` (built by `tools/publish-thousandvale.sh` from a tested commit), system unit `thousandvale.service` run as Linux user `thousandvale`, database `thousandvale_stable` | `0.0.0.0`, but a systemd drop-in (`lan-only.conf`: `IPAddressDeny=any` + LAN/localhost allowed) makes the kernel drop anything that is not this machine or the private LAN. M3's public link comes through a Cloudflare named tunnel over localhost |
| **8491** | **DEV** game server | the live working tree, database `thousandvale_dev` | `0.0.0.0`, LAN only — never tunnelled |
| 8492 | admin page (stable) | | `127.0.0.1` only, reached by SSH tunnel |

```bash
prototypes/thousandvale/ops/postgres-setup.sh      # once: env file + role/database (sudo step) + check
prototypes/thousandvale/ops/install-dev-unit.sh --now   # systemd USER unit for 8491 (no sudo)
systemctl --user {status|restart|stop} thousandvale-dev
journalctl --user -u thousandvale-dev -f           # logs
DB=memory PORT=8495 prototypes/thousandvale/ops/start-dev.sh   # a throwaway server by hand, no Postgres
curl -s http://127.0.0.1:8491/status               # tick times, players, rooms (read-only numbers)
```

**Stable (8490), once the lead has run the sudo setup** (`ops/setup-stable.sh`, read it first; it is safe to run again):

```bash
prototypes/thousandvale/ops/setup-stable.sh --dry-run    # what the sudo run would do (no sudo needed)
sudo prototypes/thousandvale/ops/setup-stable.sh         # user, node copy, folders, DB role + env, units, timers, sudoers
sudo prototypes/thousandvale/ops/lib/check-stable.sh     # re-verify any time (read-only)
prototypes/thousandvale/tools/publish-thousandvale.sh    # as radgh: publish HEAD (refuses unparsable code / red unit tests),
                                                         # switch current, restart, wait for /healthz, roll back if it fails
prototypes/thousandvale/tools/publish-thousandvale.sh --build-only   # build a release without switching (TV_SRV=dir to try it anywhere)
sudo systemctl start thousandvale-backup.service         # a backup now (hourly timer: 48 h hourly + 14 days daily, /var/backups/thousandvale)
sudo systemctl start thousandvale-drill.service          # restore drill now (weekly timer): restore newest dump -> boot -> conservation
prototypes/thousandvale/ops/drill-local.sh               # the same backup + drill scripts, no sudo: dev DB -> throw-away cluster
node prototypes/thousandvale/tools/chaos-kill9.mjs --kills 500 --db pg --scratch    # kill -9 x500 on its own throw-away Postgres
```

**Going public (M3, stream H) — scripted, NOT started.** Owner decision 2026-10-05: first a free trycloudflare **quick
tunnel** for friends; a named tunnel on the owner's own hostname later. Full plan, order of switches and rollback:
`prototypes/thousandvale/ops/tunnel/README.md`.

```bash
sudo prototypes/thousandvale/ops/lib/check-public.sh --mode quick    # PLAN §11 as a script + live probes; MUST pass first
prototypes/thousandvale/ops/tunnel/quick.sh --install|--start|--url|--status|--stop   # user unit, only origin 127.0.0.1:8490
sudo prototypes/thousandvale/ops/tunnel/rollback.sh                  # off the internet, back to LAN-only (safe twice)
node prototypes/thousandvale/ops/lib/probe-public.mjs --base http://127.0.0.1:8490   # the live probes alone, no sudo
```
Kill switch: `ops/tunnel/quick.sh --stop` (quick) / `sudo systemctl stop thousandvale-tunnel` (named).
The tunnel's only origin is **8490**. 8495 is the **load server** (`ops/load/load-server.sh`: the published release on a
throw-away Postgres, LAN only, for the 300-bot run in `ops/load/README.md`) — never tunnelled, stop it after a run.
Off-machine backups: `thousandvale-offsite.timer` (nightly, skips until the owner's bucket is in `/etc/thousandvale/offsite.env`).

Give the owner `http://<LAN-IP>:8490/` for the stable build once it is published, and `http://<LAN-IP>:8491/` for work in progress.
The rules that matter (full list: `prototypes/thousandvale/ops/SECURITY.md`):

* **Never** put `tools/serve.py`, 8400 or 8401 (or 8491, 8492, 8495) behind a tunnel — serve.py accepts POSTs that write files.
* The public server serves only its published folder, never the playground root.
* **The dev unit does not reload code.** After stream A changes `server/` or `js/sim`/`js/net`, run
  `systemctl --user restart thousandvale-dev` — a protocol bump makes the old process refuse every new client
  ("refused" in the page). The tests start their own server on a free port, so they never hit a stale one.
* Bots and Playwright run against **8491**, like the playground suite runs against 8401.
* The terrain viewer and other `tools/` pages of Thousandvale are dev pages: open them on 8401
  (`/prototypes/thousandvale/tools/terrain-viewer.html`); the game server does not serve `tools/`.
