# Thousandvale — going public (stream H, PLAN §10.3 / §11, M3)

**State 2026-10-05: nothing is public.** Stable runs LAN-only on 8490. Everything below is scripted and NOT started.
The lead starts a tunnel only after `sudo ops/lib/check-public.sh` passes.

Owner decision (2026-10-05): the **first test with friends uses a free trycloudflare.com quick tunnel** (no account, no
DNS). A permanent hostname (named tunnel) comes later — its path is kept ready below.

## Kill switch (read this first)

| tunnel | stop it now | full rollback to LAN-only |
|---|---|---|
| quick | `ops/tunnel/quick.sh --stop` (as radgh, no sudo) | `sudo ops/tunnel/rollback.sh` |
| named | `sudo systemctl stop thousandvale-tunnel` | `sudo ops/tunnel/rollback.sh` |

Stopping the tunnel kills the public link at once; the game keeps running on the LAN and nobody loses anything
(players reconnect when it comes back). Going public changes no data, so there is no data to roll back.

## What is exposed — and what never is

Exactly one origin: `http://127.0.0.1:8490`, the stable server, which serves only the published allow-listed copy in
`/srv/thousandvale/current/public` and runs as Linux user `thousandvale` (cannot read /home, so not `~/claude/secrets`).
Never: 8400/8401 (`tools/serve.py` accepts file-writing POSTs), 8491 (dev), 8492 (admin), 5432 (Postgres), 22 (SSH),
8495 (load server). `check-public.sh` verifies this from the config and with live probes.

## Path 1 — quick tunnel (the first test)

**Human check (Turnstile): OFF for this test — decided, not forgotten.** Real Turnstile keys need the owner's Cloudflare
account and a widget pinned to fixed hostnames; a quick-tunnel hostname is random and changes every start, so a
widget cannot be pinned to it. The friends test relies instead on:
- at most **4 sockets per visitor address** (the server trusts `CF-Connecting-IP` only from 127.0.0.1, i.e. from cloudflared;
  a forged header from anywhere else is ignored — probed by check-public);
- **20 new guest accounts per address per hour** (gateway), per-message token buckets, 16 KB frame cap, Origin check;
- an unlisted random URL shared only with friends, and the kill switch.
Because Turnstile is off, the **lan-only drop-in stays in place**: the game process still cannot open a connection to the
internet at all (cloudflared is a separate process that only connects in over localhost).

Order of switches:
1. Commit + `tools/publish-thousandvale.sh` (the published build must include `public/privacy.html`).
   Until radgh logs in again after setup-stable added the group: `sg thousandvale -c tools/publish-thousandvale.sh`.
2. Lead (sudo): install cloudflared — the lines in `docs/requests.md`, "H -> Lead (sudo)", M3.
3. `ops/tunnel/quick.sh --install` (as radgh) — writes `~/.config/systemd/user/thousandvale-quick-tunnel.service`,
   not enabled (never starts at boot), not started.
4. `sudo ops/lib/check-public.sh --mode quick` — must end `== PASSED`. WARN lines are accepted for this test and say why
   (Turnstile off, admin page not yet built, offsite bucket not yet chosen). It writes the pass stamp.
5. `ops/tunnel/quick.sh --start` — refuses without a pass stamp under 1 h old for the build that is live; prints
   `https://<words>.trycloudflare.com/`. Give that to the owner. `quick.sh --status` shows connections, requests and CCU.
6. After a publish (new build) or a reboot: run 4 again before 5. The URL changes on every start.

Limits of a quick tunnel (Cloudflare's, 2026): no uptime promise, ~200 requests in flight (each player holds 1–2
WebSockets, so roughly 100 players), no Cloudflare dashboard rules. Fine for friends; not for strangers.

## Path 2 — named tunnel (later: the owner's own hostname)

Needs from the owner (see `docs/requests.md`, "Lead (owner decision)"): a hostname on a Cloudflare-managed zone, a
Turnstile widget for that hostname (site key + secret), the S3/R2 bucket for offsite backups, and a contact address
for the privacy note. Needs from other streams: D draws the Turnstile widget; A's admin page on 127.0.0.1:8492.

Order of switches:
1. Owner: `cloudflared tunnel login` on this VM (opens a link; the owner picks the zone).
2. `ops/tunnel/named/setup-named.sh --create play.<domain>` (radgh) — creates tunnel `thousandvale`, the DNS CNAME, renders
   and validates `named/build/thousandvale.yml` (one hostname -> 127.0.0.1:8490, catch-all 404).
3. `sudo ops/tunnel/named/setup-named.sh --install` — config to `/etc/cloudflared/thousandvale.yml`, credentials to
   `/etc/cloudflared/thousandvale-tunnel.json` (root 0600, handed to the unit by `LoadCredential`), unit
   `thousandvale-tunnel.service` (DynamicUser, hardened) — disabled, stopped. Then `rm ~/.cloudflared/cert.pem`.
4. `sudoedit /etc/thousandvale/env` — the real `TV_TURNSTILE_SITEKEY` / `TV_TURNSTILE_SECRET` (0x…).
5. Offsite backups live: `/etc/thousandvale/offsite.env` filled (ops/offsite.env.template), `sudo systemctl start thousandvale-offsite`, `journalctl -u thousandvale-offsite` shows `offsite ok`.
6. `sudo ops/tunnel/named/go-named.sh` — swaps `lan-only.conf` for `public-egress.conf` (the server may now reach
   Cloudflare's ranges for Turnstile's siteverify — and still nothing else), sets `TV_HOST=127.0.0.1` (the game answers only
   the tunnel and this machine; the owner plays through the public link), restarts, checks `/status` says `human:true`.
7. Cloudflare dashboard (manual, check-public lists them): a rate-limiting rule on the hostname (requests not to `/gw`
   or `/p/*`: 100 per 10 s per IP -> block 10 s), the Turnstile widget limited to the hostname, the DNS record proxied.
8. `sudo ops/lib/check-public.sh --mode named --confirm-manual` — must pass. No WARN is accepted in named mode for
   Turnstile, admin or offsite.
9. `sudo systemctl start thousandvale-tunnel` (and `enable` once it has run a day without trouble).

## Rollback

`sudo ops/tunnel/rollback.sh` — stops both tunnels, disables the named one, puts `lan-only.conf` back (removes
`public-egress.conf`), `TV_HOST=0.0.0.0`, restarts the game, deletes the pass stamp, runs `check-stable.sh`. Safe twice.
To retire the named tunnel entirely: `cloudflared tunnel delete thousandvale` (needs the cert from step 1 again) and
remove the DNS record.

## Files

| file | what |
|---|---|
| `quick.sh`, `thousandvale-quick-tunnel.service` | path 1 (user unit, radgh) |
| `named/setup-named.sh`, `named/thousandvale.yml.template`, `named/thousandvale-tunnel.service` | path 2 tunnel |
| `named/go-named.sh`, `named/public-egress.conf` | path 2 server switches |
| `rollback.sh` | back to LAN-only |
| `../lib/check-public.sh`, `../lib/probe-public.mjs` | the gate (PLAN §11 as a script + live probes) |
