# Thousandvale — moving the server to a VPS (your own domain, no Cloudflare)

> **Superseded 2026-10-14.** Thousandvale is hosted on the RGS droplet at https://thousandvale.games.radgh.com/, set up
> from the `~/claude/rads-game-server` repo (Caddy + Postgres + its own copy of the service unit), not by `ops/vps/`.
> How to deploy: `~/claude/docs/rgs.md`. This page is kept for the reasoning (provider choice, Caddy, limits).


Stream H, 2026-10-05. Owner items **P29** (domain) and **P30** (move it off the VM, start small, at most ~5 players at once).

**Short version:** today the game runs on this Ubuntu VM on your Windows PC (LAN only, port 8490). Rent a small
Linux server (a "VPS") for about $10–25 a month, point `play.<your-domain>` at it, and Claude runs two commands from
this VM to set it up and ship the game there. HTTPS comes free from Let's Encrypt through Caddy. No Cloudflare needed.

---

## 1. Which server to rent

What the game needs: **Node 22 + Postgres + WebSockets on one port**, a process that stays running all day, and root
access so we can install those. The live server uses about 300 MB of RAM today; Postgres adds a couple of hundred MB.
For 5 players, **2 vCPU and 2–4 GB RAM** is plenty, with room to grow to 20–30.

Pick **Ubuntu 24.04 LTS** as the operating system, a data centre near you/your players, and turn on the provider's
weekly backups if it is a few dollars (a second safety net on top of ours).

| provider | plan | rough price (Oct 2026 — check the site) | why |
|---|---|---|---|
| **DigitalOcean** (recommended) | Basic Droplet, 2 vCPU / 2 GB / 60 GB | ~$18/mo (2 vCPU / 4 GB ~$24) | Cloudways is owned by DigitalOcean and runs on it, so you may already have an account and know the panel; US data centres; simple, reliable |
| **Vultr** | Regular Cloud Compute, 1 vCPU / 2 GB | ~$10/mo (2 vCPU / 4 GB ~$20) | cheapest decent option; also a Cloudways back end; many US cities |
| **Hetzner** | CPX22 in Ashburn or Hillsboro | ~$23/mo | fast hardware, but its June 2026 price rise took away the US bargain; great value if EU players are fine |

My pick: **DigitalOcean 2 vCPU / 2 GB** to start. If it ever feels tight, resizing to 4 GB is a button in their panel
and a reboot; nothing in our setup changes.

### Does Cloudways work?
**Classic Cloudways (the PHP/WordPress hosting you use): no.** It is a managed PHP stack — Apache/Nginx, PHP-FPM,
MariaDB. You get no root, cannot install Postgres or run your own long-lived Node process as a service, and our
backup/restore setup cannot be installed. It is the right tool for WordPress, not for a game server.

**Cloudways Velocity** (their new managed Node.js hosting, generally available since September 2026, from ~$20/mo for
2 vCPU / 2 GB, Postgres from the dashboard) could plausibly run the game later. It is untested here, WebSocket support
is not spelled out in their docs, and it would need a different deploy than the kit below. A plain VPS costs the same,
gives full control, and is what the kit is built and tested for. Revisit Velocity if you ever want someone else to
look after the server.

---

## 2. Point your domain at it (DNS)

You do this once, in whatever company holds your domain's DNS (your registrar, Cloudways' DNS, etc.).

1. Create the VPS first and copy its **public IPv4 address** (e.g. `203.0.113.10`) from the provider's panel.
2. Add a DNS record:

   | type | name / host | value / points to | TTL |
   |---|---|---|---|
   | **A** | `play` | the VPS IPv4 address | **300** (5 minutes) while setting up; 3600 later is fine |

   That makes `play.<your-domain>` (e.g. `play.radleysustaire.com`). Use another word than `play` if you prefer;
   just tell Claude the full name.
3. **Optional — IPv6:** if the VPS also shows an IPv6 address, add an **AAAA** record with the same name pointing to it.
   Skip it if unsure; IPv4 alone works for everyone.
4. **If the domain's DNS happens to be on Cloudflare:** set the record to **"DNS only" (grey cloud)**, not proxied.
5. **Check it** (from Windows, in PowerShell or Command Prompt) — it should print the VPS address:
   ```
   nslookup play.<your-domain> 1.1.1.1
   ```
   Usually a few minutes; can take up to an hour with some registrars. Claude can also check from the VM
   (`dig +short play.<your-domain>`).

Nothing else is needed: no CNAME, no TXT, no CAA record.

---

## 3. HTTPS without Cloudflare (Caddy)

On the VPS, **Caddy** sits in front of the game:

- It listens on ports 80 and 443, **gets a free Let's Encrypt certificate on its own** the first time someone visits
  `https://play.<your-domain>`, and renews it automatically (every ~60 days). `http://` is redirected to `https://`.
  It only works once the DNS record above points at the VPS — if the certificate fails at first, it simply retries.
- It hands every request to the game on `127.0.0.1:8490`, **including the WebSocket** the game uses (Caddy passes the
  "upgrade" through as-is; no special setting needed).
- The game itself only listens on `127.0.0.1` — nobody on the internet can reach it except through Caddy — and the
  kernel blocks the game process from talking to anything but this machine.
- **Who the visitor is:** the game limits each visitor address (4 connections, a few new guest characters per hour).
  It believes a visitor address only from a local proxy, in one header. Caddy writes that header with the visitor's
  real address and **overwrites anything the visitor tried to send**, so it cannot be faked. (Tested: a forged
  address is replaced, WebSockets pass, the game reads the right address — `tests/H/vps.test.js`.)
- The admin page stays private: `/admin` on the public address answers 404; the real admin page is only reachable
  through an SSH tunnel (`ssh -L 8492:127.0.0.1:8492 tvdeploy@play.<your-domain>`, then http://127.0.0.1:8492/).

Config: `ops/vps/Caddyfile.template` (validated with `caddy validate`).

### Sized for 5 players
`ops/vps/thousandvale.service` runs the game with: one process (no split into province processes), at most
**4 connections per address**, **6 new guest characters per address per hour**, **30 new guests per hour in total**
(stops a flood filling the database). Postgres is tuned for a 2–4 GB box (`ops/vps/postgres-small.conf`), and a 2 GB
swap file is added on boxes under 4 GB. The human check (Turnstile) stays off — it is a Cloudflare product; the caps
above and the small audience make it unnecessary for now.

---

## 4. The deploy kit (`ops/vps/`)

All of it runs **from this VM** as `radgh`; the VPS is set up and updated over SSH. Nothing is installed on your PC.

| script | runs where | what it does |
|---|---|---|
| `install.sh --print-key` | VM | shows the SSH public key to paste into the VPS provider when you create the server |
| `install.sh` | VM → VPS (as root) | uploads and runs `bootstrap.sh` on a fresh Ubuntu 24.04 VPS (3–6 min). Safe to run again |
| `bootstrap.sh` | VPS | updates; firewall **22/80/443 only**; users `thousandvale` (runs the game, no shell) and `tvdeploy` (receives releases, key only, may restart the game and nothing else); Node 22 (checksum-checked); Postgres 18 with a generated password nobody sees; Caddy; the game service; **hourly backups** (kept 48 h + 14 daily), a **weekly restore drill** (proves a backup really restores into a working game) and an **optional nightly off-site copy** to S3/R2; SSH switched to key-only logins once keys are in place; then `check-vps.sh` |
| `deploy.sh` | VM → VPS | ships a release and restarts. By default the exact release the LAN stable server runs (already passed the parse + unit-test + secret-scan gates); `--ref <commit>` builds a fresh one through the same gates. Only changed files are sent; an interrupted upload resumes. Waits for the game to answer with the new build — **if it does not come up, it switches back to the previous release by itself** |
| `rollback.sh` | VM → VPS | back to the previous release (`--list` shows the kept ones, or name one). Code only — characters and items are in the database and are not touched |
| `check-vps.sh` | VPS | read-only health check (firewall, users, ports, Postgres, Caddy, backups, `https://…/healthz`) |

Target settings live in `ops/vps/target.env` (copied from `target.env.template`, git-ignored, no secrets — IP,
domain, email for Let's Encrypt notices). Database passwords and tokens are generated on the VPS into
`/etc/thousandvale/env` (readable only by the game user) and never leave it.

Off-site backups (optional, recommended once real players have characters): an S3 or Cloudflare R2 bucket with a
write-only key, filled into `/etc/thousandvale/offsite.env` on the VPS from `ops/offsite.env.template`. Until then
backups stay on the VPS (plus the provider's own weekly backup if you turned it on).

### What was tested here (no real VPS yet)
- `tests/H/vps.test.js` (6 tests, green): unit/Caddyfile/firewall rules; `bootstrap.sh --dry-run` without root and
  refusing bad input; **real Caddy** in front of a test server (forged address replaced, WebSocket through, `/admin`
  404, the game's own address reader agrees); **deploy + rollback against a fake VPS on this machine** — ship, unchanged
  files hard-linked rather than re-sent, a broken release refused and the previous one put back automatically, manual
  rollback, old releases pruned.
- The real live release (179 MB) shipped to a fake VPS folder with `deploy.sh` and booted from there with the right build.
  The first real deploy uploads about 180 MB (a few minutes on a home connection); later ones send only changed files.
- ShellCheck clean on every script; `install.sh --dry-run` builds the upload bundle and runs the bootstrap's dry run.
- **Not tested:** the bootstrap's real installs (apt, Postgres, Caddy, ufw, sshd) — there is no container tool or
  sudo on this VM to try them in a throwaway box. The first real run on the VPS is that test; it stops at the first
  error and is safe to re-run after a fix.

---

## 5. Who does what

**You (Radley):**
1. [ ] Create the VPS: **Ubuntu 24.04**, 2 vCPU / 2–4 GB (e.g. DigitalOcean $18 droplet), nearest US region.
       In the "SSH key" box paste the key Claude gives you (`ops/vps/install.sh --print-key`) — add your own Windows
       key too if you want to log in yourself.
2. [ ] Send Claude: the VPS **IP address**, the **hostname** you want (e.g. `play.radleysustaire.com`), and the
       **email** for Let's Encrypt notices.
3. [ ] Add the DNS **A record** `play` → VPS IP, TTL 300 (§2). Check with `nslookup`.
4. [ ] Optional: an S3/R2 bucket + write-only key for off-site backups.
5. [ ] Open `https://play.<your-domain>/` and play.

**Claude:**
1. [ ] `install.sh --print-key` → send you the key; fill in `ops/vps/target.env`.
2. [ ] `install.sh` → sets the VPS up; reads the check list.
3. [ ] `deploy.sh` → ships the current stable release; confirms `https://play.<your-domain>/status` shows the build.
4. [ ] Off-site backup config if you provide a bucket; first restore drill by hand (`sudo systemctl start thousandvale-drill`).
5. [ ] From then on: every publish to the LAN stable server can be followed by `deploy.sh` to update the VPS
       (only with your OK — the VPS counts as **production** once friends play on it).

The LAN stable server (8490 on this VM) and the quick-tunnel option keep working; the VPS is a separate copy of the
game with its **own database** (characters made on the LAN server do not move over — say if you want them copied).
