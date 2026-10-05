#!/usr/bin/env bash
# Thousandvale — STABLE server setup (stream H, PLAN §11 + §15 M1.5). The one script that needs sudo.
#
#   sudo prototypes/thousandvale/ops/setup-stable.sh             # do it — safe to run again, changes only what differs
#   prototypes/thousandvale/ops/setup-stable.sh --dry-run        # (no sudo needed) print what it would do
#
# It sets up, LAN ONLY (no tunnel, nothing public):
#   1. system user `thousandvale` (no shell, no password, no sudo; cannot read /home — checked at the end)
#   2. node for it: a root-owned copy of your nvm node in /opt/thousandvale (the service may not read /home)
#   3. folders /srv/thousandvale (releases you publish), /var/lib + /var/backups/thousandvale, /etc/thousandvale,
#      and the backup / drill scripts in /usr/local/lib/thousandvale
#   4. Postgres role `thousandvale_stable` + databases `thousandvale_stable` and `thousandvale_drill_dev` (restore
#      drill scratch). The password is generated here and written ONLY to /etc/thousandvale/env (thousandvale, 0400);
#      never printed. A re-run keeps it.
#   5. systemd: thousandvale.service (8490) + its lan-only drop-in (kernel drops non-LAN packets), hourly backups,
#      weekly restore drill
#   6. sudoers: you may start/stop/restart/status ONLY these units (so tools/publish-thousandvale.sh can restart it)
#   7. ufw: if ufw is already active, allow 8490 from the LAN. Never turns ufw on.
# It does not touch the dev server (8491), the dev database, the playground servers or anything in /home.
# Then: ops/lib/check-stable.sh verifies all of it. To undo: see UNDO at the bottom.
set -euo pipefail
DRY=0; [[ "${1:-}" == "--dry-run" ]] && DRY=1
[[ $DRY == 1 || $EUID -eq 0 ]] || { echo "run with sudo (or --dry-run)" >&2; exit 1; }
PUBLISHER="${SUDO_USER:-$(id -un)}"; [[ "$PUBLISHER" != root ]] || { echo "run it with sudo from your own account" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LAN="${TV_LAN:-192.168.1.0/24}"
cd /                                                    # postgres cannot enter /home
run() { if [[ $DRY == 1 ]]; then echo "   [dry-run] $*"; else "$@"; fi; }
say() { echo "== $*"; }
CHANGED=0                                               # restart the game only if its unit or env changed
put() {                                                 # put <src> <dest> <mode> [owner:group] — install only when different
  if [[ -f "$2" ]] && cmp -s "$1" "$2"; then return 0; fi
  run install -o "${4%%:*}" -g "${4##*:}" -m "$3" "$1" "$2"; CHANGED=1
}

say "1. user thousandvale"
id thousandvale >/dev/null 2>&1 || run useradd --system --user-group --home-dir /srv/thousandvale --no-create-home --shell /usr/sbin/nologin --comment "Thousandvale game server" thousandvale
id -nG "$PUBLISHER" 2>/dev/null | tr ' ' '\n' | grep -qx thousandvale || run usermod -aG thousandvale "$PUBLISHER"

say "2. node"
NODE_SRC="${NODE_SRC:-$(ls -d /home/"$PUBLISHER"/.nvm/versions/node/v22*/bin/node 2>/dev/null | sort -V | tail -1 || true)}"
[[ -x "$NODE_SRC" ]] || { echo "no node 22 found (set NODE_SRC=/path/to/node)" >&2; exit 1; }
run install -d -m 0755 /opt/thousandvale/node/bin
put "$NODE_SRC" /opt/thousandvale/node/bin/node 0755 root:root

say "3. folders and scripts"
run install -d -o "$PUBLISHER" -g thousandvale -m 2750 /srv/thousandvale /srv/thousandvale/releases
run install -d -o thousandvale -g thousandvale -m 0700 /var/lib/thousandvale /var/backups/thousandvale
run install -d -o root -g thousandvale -m 0750 /etc/thousandvale
run install -d -m 0755 /usr/local/lib/thousandvale /etc/systemd/system/thousandvale.service.d
for f in backup.sh restore-drill.sh conservation.sql; do put "$HERE/lib/$f" "/usr/local/lib/thousandvale/$f" 0755 root:root; done

say "4. postgres + /etc/thousandvale/env"
ENV_FILE=/etc/thousandvale/env
if [[ $DRY == 1 ]]; then
  echo "   [dry-run] role thousandvale_stable (generated password, kept on re-run), databases thousandvale_stable + thousandvale_drill_dev, $ENV_FILE"
else
  if [[ ! -f "$ENV_FILE" || "$(sudo -u postgres psql -XAtq -c "SELECT 1 FROM pg_roles WHERE rolname='thousandvale_stable'")" != 1 ]]; then
    PW="$(head -c 32 /dev/urandom | base64 | tr -d '/+=\n' | head -c 40)"
    # the password goes to psql as a variable on stdin — never in a file, a log or the process list
    sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -v pw="$PW" <<'SQL'
SELECT format('CREATE ROLE thousandvale_stable LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 80') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thousandvale_stable') \gexec
SELECT format('ALTER ROLE thousandvale_stable WITH PASSWORD %L', :'pw') \gexec
SQL
    TMP="$(umask 077; mktemp /etc/thousandvale/.env.XXXXXX)"
    TPL="$(<"$HERE/stable.env.template")"; printf '%s\n' "${TPL//@PASSWORD@/$PW}" > "$TMP"; unset PW TPL   # no sed: keeps PW out of argv
    chown thousandvale:thousandvale "$TMP"; chmod 0400 "$TMP"; mv -f "$TMP" "$ENV_FILE"; CHANGED=1
    echo "   new password generated into $ENV_FILE"
  else
    echo "   role and env file exist — password kept"
  fi
  sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'CREATE DATABASE thousandvale_stable OWNER thousandvale_stable ENCODING ''UTF8'' TEMPLATE template0' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'thousandvale_stable') \gexec
SELECT 'CREATE DATABASE thousandvale_drill_dev OWNER thousandvale_stable ENCODING ''UTF8'' TEMPLATE template0' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'thousandvale_drill_dev') \gexec
REVOKE ALL ON DATABASE thousandvale_stable, thousandvale_drill_dev FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE thousandvale_stable, thousandvale_drill_dev TO thousandvale_stable;
\connect thousandvale_stable
ALTER SCHEMA public OWNER TO thousandvale_stable;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
\connect thousandvale_drill_dev
ALTER SCHEMA public OWNER TO thousandvale_stable;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL
fi

say "5. systemd"
for u in thousandvale.service thousandvale-backup.service thousandvale-backup.timer thousandvale-drill.service thousandvale-drill.timer; do put "$HERE/$u" "/etc/systemd/system/$u" 0644 root:root; done
put "$HERE/thousandvale-lan-only.conf" /etc/systemd/system/thousandvale.service.d/lan-only.conf 0644 root:root
run systemctl daemon-reload
run systemctl enable --now thousandvale-backup.timer thousandvale-drill.timer
run systemctl enable thousandvale.service
if [[ ! -e /srv/thousandvale/current/BUILD ]]; then echo "   no release yet — run tools/publish-thousandvale.sh as $PUBLISHER (it starts the game)"
elif [[ $CHANGED == 1 ]]; then run systemctl restart thousandvale.service
else echo "   nothing changed — the running game is left alone"; fi

say "6. sudoers (only these units)"
S="$(command -v systemctl)"; TMPS="$(mktemp)"
printf '# Thousandvale (ops/setup-stable.sh): the publisher may control the stable game units, nothing else\n%s ALL=(root) NOPASSWD: %s start thousandvale.service, %s stop thousandvale.service, %s restart thousandvale.service, %s status thousandvale.service, %s start thousandvale-backup.service, %s start thousandvale-drill.service\n' \
  "$PUBLISHER" "$S" "$S" "$S" "$S" "$S" "$S" > "$TMPS"
[[ $DRY == 1 ]] || visudo -cf "$TMPS" >/dev/null || { echo "sudoers snippet failed visudo" >&2; rm -f "$TMPS"; exit 1; }
put "$TMPS" /etc/sudoers.d/thousandvale-publish 0440 root:root; rm -f "$TMPS"

say "7. firewall"
if command -v ufw >/dev/null && ufw status 2>/dev/null | grep -q '^Status: active'; then run ufw allow from "$LAN" to any port 8490 proto tcp comment 'thousandvale stable (LAN)'
else echo "   ufw is not active — nothing changed (the unit's lan-only drop-in still drops non-LAN packets)"; fi

[[ $DRY == 1 ]] || { say "checks"; "$HERE/lib/check-stable.sh"; }
echo "Next (as $PUBLISHER, no sudo): ~/claude/playground/prototypes/thousandvale/tools/publish-thousandvale.sh  ->  http://<LAN-IP>:8490/"

# UNDO (by hand, in this order — the DROP deletes every stable character, so pg_dump first):
#   sudo systemctl disable --now thousandvale.service thousandvale-backup.timer thousandvale-drill.timer
#   sudo rm -r /etc/systemd/system/thousandvale*.service /etc/systemd/system/thousandvale*.timer /etc/systemd/system/thousandvale.service.d /etc/sudoers.d/thousandvale-publish
#   sudo systemctl daemon-reload
#   sudo -u postgres psql -c 'DROP DATABASE thousandvale_drill_dev' -c 'DROP DATABASE thousandvale_stable' -c 'DROP ROLE thousandvale_stable'
#   sudo rm -rf /etc/thousandvale /usr/local/lib/thousandvale /opt/thousandvale /var/lib/thousandvale /srv/thousandvale
#   sudo rm -rf /var/backups/thousandvale       (only if you do not want the backups)
#   sudo gpasswd -d radgh thousandvale; sudo userdel thousandvale
#   (ufw: sudo ufw status numbered, then delete the 'thousandvale stable (LAN)' rule if it was added)
