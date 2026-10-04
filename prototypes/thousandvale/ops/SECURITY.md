# Thousandvale — security checklist for the public link

**Owner:** stream H (ops). **Source:** PLAN §11 (+ §9.4 accounts, §9.6 backups, §10.1 ports, §16 evil-client tests).
**State (2026-10-04, M0): nothing is public.** The dev server (8491) is LAN-only; there is no stable server,
no tunnel and no domain yet. Every box below must be ticked, with the evidence written next to it,
**before any public link goes out (M3 entry gate)**. A box is ticked only when it has been checked on the
running machine, not when the code to do it exists.

Legend: `[ ]` not done · `[~]` designed / partly in place · `[x]` verified (write how and when).

---

## 1. Separate Linux user and a locked-down service (PLAN §11.1)

- [ ] Linux user `thousandvale` exists, no login shell, no sudo, home `/srv/thousandvale`.
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

- [ ] `tools/publish-thousandvale.sh` builds an **allow-listed** folder into `/srv/thousandvale/public`: the
      client, its imports from Farhold/Emberveil/avatar-3d/shared, data, baked zones. Nothing else.
- [ ] The stable server serves **only** that folder. Tested and recorded: `..` traversal (raw and
      URL-encoded), dotfiles, `.git`, `server/`, `tools/`, `docs/`, `node_modules/`, `ops/` all return 404.
- [ ] Never pointed at the playground root. **Never** put `tools/serve.py` (8400/8401) behind the tunnel —
      it accepts POSTs that write files (`/api/library/sync`, `/api/inbox/*`).
- [~] Dev (8491) serves allow-listed top folders of the playground (protocol.md §8.5) — LAN only.

## 3. Named tunnel, one route (PLAN §11.3)

- [ ] Owner has picked the domain (a hostname on a Cloudflare-managed zone, e.g. `play.radleysustaire.com`).
- [ ] A **named** Cloudflare Tunnel (not a Quick Tunnel — 200 in-flight cap, no SLA) with exactly one ingress
      rule `play.<domain> → http://127.0.0.1:8490` and a catch-all `http_status:404`.
- [ ] Verified nothing else is reachable through it: no playground port, no 8491, no 8492, no Postgres, no SSH.
- [ ] Kill switch written in the game README and tested: `sudo systemctl stop cloudflared`.

## 4. Bind addresses and firewall (PLAN §11.4)

- [x] Postgres listens on `127.0.0.1` only (`listen_addresses` default `localhost`) — 2026-10-04,
      `ss -ltn` shows `127.0.0.1:5432` only. Re-check after any Postgres config change.
- [ ] Stable game server (8490) binds `127.0.0.1`; the LAN reaches it through `ufw` only if wanted.
- [ ] Admin (8492) binds `127.0.0.1`, reached by SSH tunnel (or Cloudflare Access). Never in tunnel ingress.
- [ ] `ufw` enabled with: default deny incoming; allow SSH from the LAN; allow 8491 (and 8490 if used on the
      LAN) from `192.168.1.0/24` only. Rules pasted here.
- [ ] Game DB role `thousandvale` is not a superuser and cannot create roles or databases (ops/postgres-setup.sql);
      dev and stable databases are separate (`thousandvale_dev` / `thousandvale_stable`) and never shared.

## 5. Limits (PLAN §11.5)

- [ ] WebSocket `maxPayload` 16 KB (frames over it dropped and counted).
- [ ] Per-message-type token buckets (protocol.md §3 rate/burst column); 20 bad messages in 10 s → kick.
- [ ] ≤ 4 sockets per IP. `CF-Connecting-IP` trusted **only** when the TCP peer is the local `cloudflared`.
- [ ] Origin header check on the WebSocket upgrade.
- [ ] Protocol version + build handshake (refuse → "reload").
- [ ] Cloudflare rate-limiting rule on the hostname.

## 6. Accounts (PLAN §9.4, §11.6)

- [ ] Guest tokens: 256-bit random, only the SHA-256 stored, never expire.
- [ ] Optional claim with username + password hashed with `scrypt` (Node built-in).
- [ ] Cloudflare **Turnstile** on guest creation and on claim (test keys in dev, real keys only in
      `/etc/thousandvale/env`).
- [ ] Guest creation rate-limited per IP; name filter (banned names, slurs, impersonation of staff).
- [ ] No database keys, service keys or secrets ever reach the client (grep the published folder for them
      as part of `publish-thousandvale.sh`).
- [ ] One-paragraph privacy note shown before the first public link (what is stored; chat logged 30 days).

## 7. Admin off the tunnel (PLAN §11.7)

- [ ] Admin page on `127.0.0.1:8492`: online players, kick, timed mute, ban (account + IP hash), rename,
      last hour of chat, reports.
- [ ] Public `/status` is read-only numbers (no names, no IPs, no tokens).

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
- [ ] Nightly off-machine copy (S3 or R2), 14-day retention; the bucket key can write but not delete.
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
