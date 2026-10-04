#!/usr/bin/env bash
# =====================================================================================================
# Thousandvale — STABLE server setup (stream H, PLAN §11 + §15 M1.5). THE ONE SCRIPT THAT NEEDS SUDO.
#
#   sudo prototypes/thousandvale/ops/setup-stable.sh            # do it (safe to run again)
#   sudo prototypes/thousandvale/ops/setup-stable.sh --dry-run  # print what it would do, change nothing
#
# Read it top to bottom before running it. Every step is idempotent (running it twice changes nothing the
# second time) and none of it touches the dev server (8491), the dev database, the playground servers
# (8400/8401) or anything under /home except reading the node binary and this repo's ops/ files.
#
# What it sets up (LAN only — no tunnel, nothing public):
#   1. Linux system user `thousandvale`: no login shell, no password, no sudo, home /srv/thousandvale.
#      It cannot read /home/radgh (drwxr-x---) and the unit adds ProtectHome=yes on top, so ~/claude/secrets
#      is out of reach twice over. Verified at the end of this script.
#   2. Node for that user: a copy of radgh's nvm node binary in /opt/thousandvale/node (root-owned),
#      because the service may not read /home.
#   3. Folders: /srv/thousandvale (releases; written by radgh's publish script, read by the group),
#      /var/lib/thousandvale (service state), /var/backups/thousandvale (dumps, 0700),
#      /etc/thousandvale (root:thousandvale 0750) and /usr/local/lib/thousandvale (backup + drill scripts).
#   4. Postgres: role `thousandvale_stable` (no superuser/createdb/createrole, 80 connections) and databases
#      `thousandvale_stable` + `thousandvale_drill_dev` (the restore-drill scratch copy), localhost only.
#      The password is GENERATED HERE and written ONLY into /etc/thousandvale/env (owner thousandvale, 0400).
#      It is never printed, never logged, never put in the repo or in ~/claude/secrets.
#   5. systemd: the hardened unit thousandvale.service (8490), hourly backups (thousandvale-backup.timer,
#      48 h hourly + 14 days daily) and a weekly restore drill (thousandvale-drill.timer).
#   6. sudoers: lets radgh (and only radgh) start/stop/restart/status THIS unit without a password, so
#      tools/publish-thousandvale.sh can restart it after a publish. Nothing else.
#   7. ufw: if (and only if) ufw is already active, allow 8490 from the LAN (192.168.1.0/24). It never
#      enables ufw (that could cut off SSH).
#
# To undo: see "UNDO" at the bottom of this file.
# =====================================================================================================
set -euo pipefail

DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1
run() { if [[ $DRY == 1 ]]; then echo "  [dry-run] $*"; else "$@"; fi; }
say() { echo "== $*"; }

[[ $EUID -eq 0 ]] || { echo "run with sudo: sudo $0 $*" >&2; exit 1; }
PUBLISHER="${SUDO_USER:-radgh}"
[[ "$PUBLISHER" != root ]] || { echo "run it with sudo from your own account (SUDO_USER is the publisher)" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd /   # postgres (sudo -u postgres) cannot enter /home; keep psql from warning about it
LAN="${TV_LAN:-192.168.1.0/24}"

# ---------------------------------------------------------------------------------------- 1. the user
say "1. system user thousandvale"
if id thousandvale >/dev/null 2>&1; then
  echo "   exists: $(id thousandvale)"
else
  run useradd --system --user-group --home-dir /srv/thousandvale --no-create-home --shell /usr/sbin/nologin --comment "Thousandvale game server" thousandvale
fi
run passwd -l thousandvale >/dev/null 2>&1 || true
# the publisher joins the group so the published files it writes are readable by the service (not the reverse)
id -nG "$PUBLISHER" | tr ' ' '\n' | grep -qx thousandvale || run usermod -aG thousandvale "$PUBLISHER"

# ---------------------------------------------------------------------------------------- 2. node
say "2. node for the service (/opt/thousandvale/node)"
NODE_SRC="${NODE_SRC:-$(ls -d /home/"$PUBLISHER"/.nvm/versions/node/v22*/bin/node 2>/dev/null | sort -V | tail -1 || true)}"
[[ -n "$NODE_SRC" && -x "$NODE_SRC" ]] || { echo "no node 22 found (set NODE_SRC=/path/to/node)" >&2; exit 1; }
echo "   from $NODE_SRC ($("$NODE_SRC" --version))"
run install -d -o root -g root -m 0755 /opt/thousandvale/node/bin
run install -o root -g root -m 0755 "$NODE_SRC" /opt/thousandvale/node/bin/node

# ---------------------------------------------------------------------------------------- 3. folders
say "3. folders"
run install -d -o "$PUBLISHER" -g thousandvale -m 2750 /srv/thousandvale
run install -d -o "$PUBLISHER" -g thousandvale -m 2750 /srv/thousandvale/releases
run install -d -o thousandvale -g thousandvale -m 0700 /var/lib/thousandvale
run install -d -o thousandvale -g thousandvale -m 0700 /var/backups/thousandvale
run install -d -o root -g thousandvale -m 0750 /etc/thousandvale
run install -d -o root -g root -m 0755 /usr/local/lib/thousandvale
run install -o root -g root -m 0755 "$HERE/lib/backup.sh" /usr/local/lib/thousandvale/backup.sh
run install -o root -g root -m 0755 "$HERE/lib/restore-drill.sh" /usr/local/lib/thousandvale/restore-drill.sh
run install -o root -g root -m 0644 "$HERE/lib/conservation.sql" /usr/local/lib/thousandvale/conservation.sql

# ---------------------------------------------------------------------------------------- 4. postgres + env
say "4. postgres role thousandvale_stable, databases thousandvale_stable + thousandvale_drill_dev, /etc/thousandvale/env"
ENV_FILE=/etc/thousandvale/env
role_exists=$(sudo -u postgres psql -XAtq -c "SELECT 1 FROM pg_roles WHERE rolname='thousandvale_stable'" 2>/dev/null || true)
if [[ -f "$ENV_FILE" && "$role_exists" == 1 ]]; then
  echo "   role and env file already exist — password kept"
else
  # a fresh password, held only in this shell's memory and then in the env file
  PW="$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n' | head -c 40)"
  if [[ $DRY == 1 ]]; then
    echo "  [dry-run] create/alter role thousandvale_stable with a generated password; write $ENV_FILE (0400 thousandvale)"
  else
    # the SQL text goes on stdin and the password as a psql variable — neither lands in a file or in `ps` args
    # longer than the psql call itself
    sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -v pw="$PW" <<'SQL'
SELECT format('CREATE ROLE thousandvale_stable LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 80', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thousandvale_stable') \gexec
SELECT format('ALTER ROLE thousandvale_stable WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 80', :'pw') \gexec
SQL
    umask 077
    TMP="$(mktemp /etc/thousandvale/.env.XXXXXX)"
    cat > "$TMP" <<ENV
# Thousandvale STABLE server environment. Written by ops/setup-stable.sh. Owner thousandvale, mode 0400.
# Never copy this file into the repo, ~/claude/secrets, a log or a chat.
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=thousandvale_stable
PGUSER=thousandvale_stable
PGPASSWORD=$PW
TV_ENV=stable
TV_HOST=0.0.0.0
TV_TERRAIN=z12_02
# Turnstile (M3): Cloudflare's public TEST keys until the real pair exists
TV_TURNSTILE_SITEKEY=1x00000000000000000000AA
TV_TURNSTILE_SECRET=1x0000000000000000000000000000000AA
ENV
    chown thousandvale:thousandvale "$TMP"; chmod 0400 "$TMP"; mv -f "$TMP" "$ENV_FILE"
    unset PW
    echo "   password generated and written to $ENV_FILE only"
  fi
fi
if [[ $DRY == 0 ]]; then
  sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE thousandvale_stable OWNER thousandvale_stable ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'thousandvale_stable') \gexec
SELECT 'CREATE DATABASE thousandvale_drill_dev OWNER thousandvale_stable ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'thousandvale_drill_dev') \gexec
REVOKE ALL ON DATABASE thousandvale_stable FROM PUBLIC;
REVOKE ALL ON DATABASE thousandvale_drill_dev FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE thousandvale_stable TO thousandvale_stable;
GRANT CONNECT, TEMPORARY ON DATABASE thousandvale_drill_dev TO thousandvale_stable;
-- the dev role must never reach stable data
REVOKE ALL ON DATABASE thousandvale_stable FROM thousandvale;
\connect thousandvale_stable
ALTER SCHEMA public OWNER TO thousandvale_stable;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
\connect thousandvale_drill_dev
ALTER SCHEMA public OWNER TO thousandvale_stable;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
else
  echo "  [dry-run] create databases thousandvale_stable + thousandvale_drill_dev (owner thousandvale_stable), revoke PUBLIC and the dev role"
fi

# ---------------------------------------------------------------------------------------- 5. systemd
say "5. systemd units"
for u in thousandvale.service thousandvale-backup.service thousandvale-backup.timer thousandvale-drill.service thousandvale-drill.timer; do
  run install -o root -g root -m 0644 "$HERE/$u" "/etc/systemd/system/$u"
done
run systemctl daemon-reload
run systemctl enable thousandvale.service thousandvale-backup.timer thousandvale-drill.timer
run systemctl start thousandvale-backup.timer thousandvale-drill.timer
if [[ -e /srv/thousandvale/current/BUILD ]]; then
  run systemctl restart thousandvale.service
else
  echo "   no release published yet: run tools/publish-thousandvale.sh as $PUBLISHER, it starts the unit"
fi

# ---------------------------------------------------------------------------------------- 6. sudoers
say "6. sudoers: $PUBLISHER may start/stop/restart/status thousandvale.service (only)"
SUDOERS=/etc/sudoers.d/thousandvale-publish
TMPS="$(mktemp)"
SYSTEMCTL="$(command -v systemctl)"
cat > "$TMPS" <<EOF
# Thousandvale: the publisher may control the stable game server unit and nothing else (ops/setup-stable.sh)
$PUBLISHER ALL=(root) NOPASSWD: $SYSTEMCTL start thousandvale.service, $SYSTEMCTL stop thousandvale.service, $SYSTEMCTL restart thousandvale.service, $SYSTEMCTL status thousandvale.service, $SYSTEMCTL start thousandvale-backup.service, $SYSTEMCTL start thousandvale-drill.service
EOF
visudo -cf "$TMPS" >/dev/null || { echo "sudoers snippet failed visudo" >&2; rm -f "$TMPS"; exit 1; }
run install -o root -g root -m 0440 "$TMPS" "$SUDOERS"; rm -f "$TMPS"

# ---------------------------------------------------------------------------------------- 7. firewall
say "7. firewall"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then
  run ufw allow from "$LAN" to any port 8490 proto tcp comment 'thousandvale stable (LAN)'
else
  echo "   ufw is not active — nothing changed. 8490 is reachable from the LAN like 8491 is; there is no tunnel."
fi

# ---------------------------------------------------------------------------------------- checks
say "checks"
if [[ $DRY == 0 ]]; then
  FAILED=0
  ok()   { echo "   ok   $1"; }
  bad()  { echo "   FAIL $1"; FAILED=1; }
  if sudo -u thousandvale test -r "/home/$PUBLISHER"; then bad "thousandvale can read /home/$PUBLISHER"; else ok "thousandvale cannot read /home/$PUBLISHER"; fi
  if sudo -u thousandvale ls "/home/$PUBLISHER/claude/secrets" >/dev/null 2>&1; then bad "thousandvale can list ~/claude/secrets"; else ok "thousandvale cannot list ~/claude/secrets"; fi
  if sudo -l -U thousandvale 2>/dev/null | grep -q 'may run'; then bad "thousandvale has sudo rights"; else ok "thousandvale has no sudo"; fi
  [[ "$(getent passwd thousandvale | cut -d: -f7)" == /usr/sbin/nologin ]] && ok "no login shell" || bad "thousandvale has a login shell"
  [[ "$(stat -c '%U %a' "$ENV_FILE")" == "thousandvale 400" ]] && ok "env file thousandvale 0400" || bad "env file owner/mode"
  [[ "$(sudo -u postgres psql -XAtq -c "SELECT rolsuper::int + rolcreatedb::int + rolcreaterole::int FROM pg_roles WHERE rolname='thousandvale_stable'")" == 0 ]] && ok "stable role: no superuser/createdb/createrole" || bad "stable role has extra rights"
  if sudo -u thousandvale sh -c "set -a; . '$ENV_FILE'; cd /; psql -XAtq -c 'select 1'" 2>/dev/null | grep -qx 1; then ok "the service user can log into thousandvale_stable"; else bad "the service user cannot log into thousandvale_stable"; fi
  [[ "$(sudo -u postgres psql -XAtq -c "SELECT has_database_privilege('thousandvale','thousandvale_stable','CONNECT')")" == f ]] && ok "the dev role cannot connect to thousandvale_stable" || bad "the dev role can connect to thousandvale_stable"
  if ss -ltnH | awk '{print $4}' | grep -E ':5432$' | grep -vqE '^(127\.0\.0\.1|\[::1\]):5432$'; then bad "postgres listens beyond localhost"; else ok "postgres listens on localhost only"; fi
  if [[ $FAILED == 0 ]]; then echo "== all checks passed"; else echo "== SOME CHECKS FAILED — read above"; exit 1; fi
fi
echo
echo "Next (as $PUBLISHER, no sudo): ~/claude/playground/tools/publish-thousandvale.sh   → http://<LAN-IP>:8490/"
echo "Backups: sudo systemctl start thousandvale-backup.service ; drill: sudo systemctl start thousandvale-drill.service"

# =====================================================================================================
# UNDO (by hand, in this order):
#   sudo systemctl disable --now thousandvale.service thousandvale-backup.timer thousandvale-drill.timer
#   sudo rm /etc/systemd/system/thousandvale*.service /etc/systemd/system/thousandvale*.timer /etc/sudoers.d/thousandvale-publish
#   sudo systemctl daemon-reload
#   sudo -u postgres psql -c 'DROP DATABASE thousandvale_drill_dev' -c 'DROP DATABASE thousandvale_stable' -c 'DROP ROLE thousandvale_stable'
#        (this deletes every stable character — take a pg_dump first)
#   sudo rm -rf /etc/thousandvale /usr/local/lib/thousandvale /opt/thousandvale /var/lib/thousandvale /srv/thousandvale
#   sudo rm -rf /var/backups/thousandvale   (only if you do not want the backups)
#   sudo gpasswd -d radgh thousandvale; sudo userdel thousandvale
#   (ufw: sudo ufw status numbered, then delete the 'thousandvale stable (LAN)' rule if it was added)
# =====================================================================================================
