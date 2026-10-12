# Thousandvale — security checklist for the public link

**Owner:** stream H (ops). **Source:** PLAN §11 (+ §9.4 accounts, §9.6 backups, §10.1 ports, §16 evil-client tests).
**State (2026-10-04, M0): nothing is public.** The dev server (8491) is LAN-only; there is no stable server,
no tunnel and no domain yet. Every box below must be ticked, with the evidence written next to it,
**before any public link goes out (M3 entry gate)**. A box is ticked only when it has been checked on the
running machine, not when the code to do it exists.

**Runnable form (2026-10-05, M3): `sudo ops/lib/check-public.sh --mode quick|named` checks every item below that a
machine can check (plus live probes, `ops/lib/probe-public.mjs`) and must end `== PASSED` before a tunnel starts.
Going-public plan, order of switches and rollback: `ops/tunnel/README.md`.**

Legend: `[ ]` not done · `[~]` designed / partly in place · `[x]` verified (write how and when).

---

## 1. Separate Linux user and a locked-down service (PLAN §11.1)

- [~] Linux user `thousandvale` exists, no login shell, no sudo, home `/srv/thousandvale`. Script ready (`ops/setup-stable.sh`,
      verified by `ops/lib/check-stable.sh`); waiting for the lead's sudo run (requests.md "H -> Lead (sudo)" 2026-10-04).
- [ ] Stable server runs from a **system** unit with `User=thousandvale`, `ProtectHome=yes`,
      `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ReadOnlyPaths=/srv/thousandvale`, `PrivateTmp=yes`
      (plus `ReadWritePaths=` only for its log/state dir if needed). `systemd-analyze security thousandvale`
      score recorded here.
- [ ] Verified: as `thousandvale`, `ls /home/radgh` fails (home is `drwxr-x---`), so `~/claude/secrets/` is out
      of reach. Command + output pasted here.
- [ ] Its own secrets (DB password, ticket signing key, Turnstile secret) live in `/etc/thousandvale/env`,
      mode `0400`, owner `thousandvale`. Not in the repo, not in `~/claude/secrets/`, not in any log.
- [~] Dev server (8491) runs as `radgh` from a **user** unit (`ops/thousandvale-dev.service`) — acceptable only
      because it is LAN-only and never tunnelled. Its DB password is in `~/.config/thousandvale/dev.env`
      (mode 600), separate from the stable one.

## 2. Serve only an approved copy (PLAN §11.2)

- [~] `tools/publish-thousandvale.sh` builds an **allow-listed** folder into `/srv/thousandvale/public`: the
      client, its imports from Farhold/Emberveil/avatar-3d/shared, data, baked zones. Nothing else.
- [~] (2026-10-04, a `--build-only` release served by its own server on a scratch port: `/`, the client and terrain.bin 200;
      `server/main.mjs`, `ops/`, `docs/`, `tests/`, `node_modules/pg`, `/.git/config`, `../../CLAUDE.md` raw and `%2f`-encoded all 404 —
      re-check on /srv after the first real publish.) The stable server serves **only** that folder. Tested and recorded: `..` traversal (raw and
      URL-encoded), dotfiles, `.git`, `server/`, `tools/`, `docs/`, `node_modules/`, `ops/` all return 404.
- [ ] Never pointed at the playground root. **Never** put `tools/serve.py` (8400/8401) behind the tunnel —
      it accepts POSTs that write files (`/api/library/sync`, `/api/inbox/*`).
- [~] Dev (8491) serves allow-listed top folders of the playground (protocol.md §8.5) — LAN only.

## 3. Tunnel, one route (PLAN §11.3)

Owner decision 2026-10-05: the **first friends test uses a trycloudflare quick tunnel** (`ops/tunnel/quick.sh`); the named
tunnel is the later path for strangers (`ops/tunnel/named/`). Quick tunnel limits (~200 in-flight, no SLA) accepted for friends.
- [~] Quick tunnel: user unit with exactly one origin `--url http://127.0.0.1:8490`, no `[Install]` (never starts by itself),
      no config file it could pick up; `--start` refuses without a fresh check-public pass for the live build. Tested by
      `tests/H/public-ops.test.js`; waiting for cloudflared (lead sudo, requests.md 2026-10-05).
- [ ] Owner has picked the domain for the named path (requests.md "Lead (owner decision)").
- [~] Named tunnel config template: one ingress rule `<hostname> → http://127.0.0.1:8490` and catch-all `http_status:404`,
      validated with `cloudflared tunnel ingress validate` / `ingress rule` (test + check-public). Unit runs as a DynamicUser
      with the credentials passed by `LoadCredential`.
- [~] Nothing else reachable through it: no playground port, no 8491, no 8492, no 8495, no Postgres, no SSH — enforced by the
      template test and check-public's config checks.
- [~] Kill switch written (`ops/tunnel/README.md` top): quick `ops/tunnel/quick.sh --stop`, named `sudo systemctl stop
      thousandvale-tunnel`, full rollback `sudo ops/tunnel/rollback.sh`. Test it on the first start.

## 4. Bind addresses and firewall (PLAN §11.4)

- [x] Postgres listens on `127.0.0.1` only (`listen_addresses` default `localhost`) — 2026-10-04,
      `ss -ltn` shows `127.0.0.1:5432` only. Re-check after any Postgres config change.
- [~] Stable game server (8490) binds `0.0.0.0` for the LAN, and the systemd drop-in `lan-only.conf` (`IPAddressDeny=any`,
      allow localhost + 10/8, 172.16/12, 192.168/16, link-local, fc00::/7) makes the kernel drop every other peer. At M3 the tunnel
      arrives over localhost; the drop-in goes when Turnstile is switched on (it must reach Cloudflare).
- [ ] Admin (8492) binds `127.0.0.1`, reached by SSH tunnel (or Cloudflare Access). Never in tunnel ingress.
- [ ] `ufw` enabled with: default deny incoming; allow SSH from the LAN; allow 8491 (and 8490 if used on the
      LAN) from `192.168.1.0/24` only. Rules pasted here.
- [ ] Game DB role `thousandvale` is not a superuser and cannot create roles or databases (ops/postgres-setup.sql);
      dev and stable databases are separate (`thousandvale_dev` / `thousandvale_stable`) and never shared.

## 5. Limits (PLAN §11.5)

- [x] WebSocket `maxPayload` 16 KB — 2026-10-05, probe-public on live 8490: a 20 KB frame is closed with 1009.
- [ ] Per-message-type token buckets (protocol.md §3 rate/burst column); 20 bad messages in 10 s → kick.
- [x] ≤ 4 sockets per IP. `CF-Connecting-IP` trusted **only** when the TCP peer is the local `cloudflared` — 2026-10-05,
      probe-public on live 8490: 5 sockets from loopback with one CF-Connecting-IP → 4 open, 5th 429; 5 sockets from the LAN
      address each with a different forged CF-Connecting-IP → still 4 open, 5th 429 (header ignored from non-loopback).
- [x] Origin header check on the WebSocket upgrade — 2026-10-05, probe: `Origin: https://evil.example` → 403.
- [ ] Protocol version + build handshake (refuse → "reload").
- [ ] Cloudflare rate-limiting rule on the hostname (named path only — a quick tunnel has no dashboard rules; MANUAL item in
      check-public --mode named).

## 6. Accounts (PLAN §9.4, §11.6)

- [ ] Guest tokens: 256-bit random, only the SHA-256 stored, never expire.
- [ ] Optional claim with username + password hashed with `scrypt` (Node built-in).
- [~] Cloudflare **Turnstile** on guest creation and on claim (test keys in dev, real keys only in
      `/etc/thousandvale/env`). Server side done (server/turnstile.js); the client widget is asked of D. **OFF for the quick-tunnel
      friends test by decision** (random hostname per start cannot be pinned in a widget) — check-public prints it as WARN;
      named mode FAILS without it.
- [ ] Guest creation rate-limited per IP; name filter (banned names, slurs, impersonation of staff).
- [ ] No database keys, service keys or secrets ever reach the client (grep the published folder for them
      as part of `publish-thousandvale.sh`).
- [~] Privacy note: `public/privacy.html` (what is stored, how long, how to delete — `ops/lib/delete-account.sh`); probe
      checks it is served. Title-screen link asked of D. A contact address for strangers is an owner decision.

## 7. Admin off the tunnel (PLAN §11.7)

- [ ] Admin page on `127.0.0.1:8492`: online players, kick, timed mute, ban (account + IP hash), rename,
      last hour of chat, reports.
- [x] Public `/status` is read-only numbers (no IPs, no tokens) — 2026-10-05, probe: no address-shaped or secret strings.

## 8. The server never trusts the client (PLAN §11.8, §16 evil client)

- [ ] Speed checked against the mount table and the heightmap (`js/rules/terrain-read.js` slope/water).
- [ ] Cooldowns, mana, range, line of sight checked server-side.
- [ ] Loot / harvest / treasure **reach checks** (no looting a chest 300 m away).
- [ ] Item uid ownership checked on every item intent; a uid in two places fails a unique check.
- [ ] Every field validated against the protocol table; malformed messages dropped and logged.
- [ ] Evil-client suite green (stream G): speed hack, teleport, off-cooldown / out-of-range casts, far
      loot, trading an item you don't own, replayed uid, oversized + malformed messages, 1,000 msgs/s from
      one socket — all rejected and logged, server stays up.

## 9. Data safety (PLAN §9.2, §9.6)

- [ ] Journal saves (≤ 2 s loss), version + fencing token on every save; persistence chaos test
      (`kill -9` × 500, items and gold conserved) green.
- [ ] Hourly local `pg_dump -Fc` kept 48 h.
- [~] Nightly off-machine copy (S3 or R2), 14-day retention; the bucket key can write but not delete. Built:
      `ops/lib/offsite-upload.mjs` (SigV4, no deps, optional openssl encryption, tested against AWS's published vector),
      `thousandvale-offsite.{service,timer}` with its own env file the game never loads. Waiting for the owner's bucket.
- [ ] Weekly restore drill passes (restore into a scratch DB, boot dev on it, conservation check).

## 10. Observability (PLAN §11.4 "Observability")

- [ ] `/status` JSON + page: CCU, per-room counts, tick p50/p95/p99/max and worst in 10 min, messages and
      bytes per second, journal queue + last commit latency, heap, uptime, build hash.
- [ ] Structured JSON logs to journald; no tokens, passwords or full IPs in logs (IP hash only).
- [ ] `tools/status.mjs` prints `/status` for agents.

---

## Sign-off (M3)

| Date | Who | Sections verified | Notes |
|---|---|---|---|
| | | | |
