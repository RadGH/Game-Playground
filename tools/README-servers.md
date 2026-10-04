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
| **8490** | **STABLE** game server (later, M1.5): client + `/gw` + `/p/<n>` + `/status` | a published allow-listed copy in `/srv/thousandvale`, run as Linux user `thousandvale`, database `thousandvale_stable` | `127.0.0.1` (the LAN reaches it through ufw; the public link, M3, through a Cloudflare named tunnel) |
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

Give the owner `http://<LAN-IP>:8491/` while it is in development (there is no 8490 until M1.5).
The rules that matter (full list: `prototypes/thousandvale/ops/SECURITY.md`):

* **Never** put `tools/serve.py`, 8400 or 8401 behind a tunnel — serve.py accepts POSTs that write files.
* The public server serves only its published folder, never the playground root.
* Bots and Playwright run against **8491**, like the playground suite runs against 8401.
* The terrain viewer and other `tools/` pages of Thousandvale are dev pages: open them on 8401
  (`/prototypes/thousandvale/tools/terrain-viewer.html`); the game server does not serve `tools/`.
