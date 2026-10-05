#!/usr/bin/env bash
# =====================================================================================================
# Thousandvale — set up a FRESH Ubuntu 24.04 VPS to run the game behind Caddy (stream H, docs/HOSTING.md).
# Runs ON THE VPS as root. You normally do not run it by hand: ops/vps/install.sh (on the VM) uploads it with
# the files it needs and runs it over SSH.
#
#   bootstrap.sh --domain play.example.com --email you@example.com --deploy-key /root/tv-deploy.pub
#   bootstrap.sh ... --dry-run          # print what it would do, change nothing (no root needed)
#
# Safe to run more than once: each step checks first and changes only what differs.
#   1. system updates (unattended security upgrades stay on), a swap file on small boxes, journald capped at 200 MB
#   2. firewall (ufw): deny everything coming in except 22 (SSH), 80 and 443 (Caddy; 443/udp too for HTTP/3)
#   3. users: `thousandvale` runs the game (no shell, no sudo); `tvdeploy` receives releases over SSH (key only)
#      and may restart the game units — nothing else
#   4. node 22 (official tarball, checksum verified) into /opt/thousandvale/node
#   5. Postgres 18 (PGDG apt repo), localhost only, sized for a small box; role + databases + /etc/thousandvale/env
#      (passwords generated here, written only to that file, never printed)
#   6. Caddy (official apt repo) with automatic Let's Encrypt for --domain
#   7. systemd: thousandvale.service (127.0.0.1:8490) + localhost-only drop-in, hourly backups, weekly restore
#      drill, nightly off-machine copy (skips itself until /etc/thousandvale/offsite.env exists)
#   8. SSH: key-only logins (password logins off) — only once a key is in place for root AND tvdeploy
#   9. checks (ops/vps/check-vps.sh)
# The game itself starts on the first ops/vps/deploy.sh (no release yet = nothing to run).
# =====================================================================================================
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPS="$(cd "$HERE/.." && pwd)"
DRY=0; DOMAIN=""; EMAIL=""; KEYFILE=""; UPGRADE=1
NODE_LINE="${NODE_LINE:-latest-v22.x}"
PG_VERSION="${PG_VERSION:-18}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="$2"; shift 2 ;;
    --email) EMAIL="$2"; shift 2 ;;
    --deploy-key) KEYFILE="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --no-upgrade) UPGRADE=0; shift ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "--domain play.example.com (lower case) is required" >&2; exit 2; }
[[ "$EMAIL" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { echo "--email you@example.com is required (Let's Encrypt expiry notices)" >&2; exit 2; }
[[ $DRY == 1 || $EUID -eq 0 ]] || { echo "run as root (or --dry-run)" >&2; exit 1; }
if [[ $DRY == 0 ]]; then
  . /etc/os-release
  [[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo "this script is for Ubuntu 24.04 (found $PRETTY_NAME)" >&2; exit 1; }
fi

run() { if [[ $DRY == 1 ]]; then echo "   [dry-run] $*"; else "$@"; fi; }
say() { echo "== $*"; }
rnd() { head -c "$1" /dev/urandom | base64 | tr -d '/+=\n'; }
CHANGED=0
put() {                                                 # put <src> <dest> <mode> [owner:group] — install only when different
  local own="${4:-root:root}"
  if [[ -f "$2" ]] && cmp -s "$1" "$2"; then return 0; fi
  run install -o "${own%%:*}" -g "${own##*:}" -m "$3" "$1" "$2"; CHANGED=1
}
export DEBIAN_FRONTEND=noninteractive
APT=(apt-get -y -q -o Dpkg::Options::=--force-confold)

say "1. system"
run "${APT[@]}" update
[[ $UPGRADE == 0 ]] || run "${APT[@]}" upgrade
run "${APT[@]}" install ca-certificates curl gnupg ufw rsync xz-utils unattended-upgrades
if [[ $DRY == 1 ]]; then echo "   [dry-run] 2 GB swap file if there is no swap and less than 4 GB RAM"
elif [[ -z "$(swapon --noheadings)" ]] && (( $(awk '/MemTotal/ {print $2}' /proc/meminfo) < 4000000 )); then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "   2 GB swap file added"
fi
run install -d -m 0755 /etc/systemd/journald.conf.d
TMPJ="$(mktemp)"; printf '[Journal]\nSystemMaxUse=200M\n' > "$TMPJ"; put "$TMPJ" /etc/systemd/journald.conf.d/thousandvale.conf 0644; rm -f "$TMPJ"
[[ $DRY == 1 ]] || systemctl restart systemd-journald

say "2. firewall (22, 80, 443 only)"
run ufw default deny incoming
run ufw default allow outgoing
run ufw allow 22/tcp comment 'ssh'
run ufw allow 80/tcp comment 'caddy (certificates + redirect)'
run ufw allow 443/tcp comment 'caddy https'
run ufw allow 443/udp comment 'caddy http/3'
run ufw --force enable

say "3. users"
id thousandvale >/dev/null 2>&1 || run useradd --system --user-group --home-dir /srv/thousandvale --no-create-home --shell /usr/sbin/nologin --comment "Thousandvale game server" thousandvale
id tvdeploy >/dev/null 2>&1 || run useradd --create-home --shell /bin/bash --comment "Thousandvale release uploads" tvdeploy
id -nG tvdeploy 2>/dev/null | tr ' ' '\n' | grep -qx thousandvale || run usermod -aG thousandvale tvdeploy
[[ $DRY == 1 ]] || passwd -l tvdeploy >/dev/null           # key only, never a password
if [[ -n "$KEYFILE" ]]; then
  [[ $DRY == 1 || -s "$KEYFILE" ]] || { echo "--deploy-key $KEYFILE is missing or empty" >&2; exit 1; }
  run install -d -o tvdeploy -g tvdeploy -m 0700 /home/tvdeploy/.ssh
  if [[ $DRY == 1 ]]; then echo "   [dry-run] add $KEYFILE to /home/tvdeploy/.ssh/authorized_keys"
  else
    touch /home/tvdeploy/.ssh/authorized_keys
    grep -qxF "$(head -1 "$KEYFILE")" /home/tvdeploy/.ssh/authorized_keys || head -1 "$KEYFILE" >> /home/tvdeploy/.ssh/authorized_keys
    chown tvdeploy:tvdeploy /home/tvdeploy/.ssh/authorized_keys; chmod 0600 /home/tvdeploy/.ssh/authorized_keys
  fi
fi

say "4. node ($NODE_LINE)"
if [[ $DRY == 1 ]]; then echo "   [dry-run] download node $NODE_LINE linux-x64 from nodejs.org, check SHA-256, unpack to /opt/thousandvale/node"
else
  BASE="https://nodejs.org/dist/$NODE_LINE"
  LINE="$(curl -fsS "$BASE/SHASUMS256.txt" | grep -E ' node-v22\.[0-9.]+-linux-x64\.tar\.xz$')"
  SUM="${LINE%% *}"; FILE="${LINE##* }"; VER="${FILE#node-}"; VER="${VER%-linux-x64.tar.xz}"
  if [[ "$(/opt/thousandvale/node/bin/node --version 2>/dev/null || true)" == "$VER" ]]; then echo "   node $VER already installed"
  else
    T="$(mktemp -d)"; curl -fsSL -o "$T/$FILE" "$BASE/$FILE"
    echo "$SUM  $T/$FILE" | sha256sum -c --quiet - || { echo "node download failed its checksum" >&2; exit 1; }
    install -d -m 0755 /opt/thousandvale
    rm -rf /opt/thousandvale/node.new; mkdir /opt/thousandvale/node.new
    tar -xJf "$T/$FILE" -C /opt/thousandvale/node.new --strip-components=1 --no-same-owner
    rm -rf /opt/thousandvale/node.old; [[ -d /opt/thousandvale/node ]] && mv /opt/thousandvale/node /opt/thousandvale/node.old
    mv /opt/thousandvale/node.new /opt/thousandvale/node; rm -rf /opt/thousandvale/node.old "$T"
    chown -R root:root /opt/thousandvale/node; CHANGED=1
    echo "   node $VER installed"
  fi
fi

say "5. postgres $PG_VERSION"
if [[ $DRY == 1 ]]; then echo "   [dry-run] PGDG apt repo (postgresql-common's apt.postgresql.org.sh), install postgresql-$PG_VERSION"
elif ! dpkg -s "postgresql-$PG_VERSION" >/dev/null 2>&1; then
  "${APT[@]}" install postgresql-common
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  "${APT[@]}" install "postgresql-$PG_VERSION"
fi
run install -d -m 0755 "/etc/postgresql/$PG_VERSION/main/conf.d"
PGCONF_CHANGED=$CHANGED; CHANGED=0
put "$HERE/postgres-small.conf" "/etc/postgresql/$PG_VERSION/main/conf.d/thousandvale.conf" 0644 postgres:postgres
[[ $CHANGED == 0 ]] || run systemctl restart "postgresql@$PG_VERSION-main"
CHANGED=$(( PGCONF_CHANGED | CHANGED ))

run install -d -o tvdeploy -g thousandvale -m 2750 /srv/thousandvale     # tvdeploy switches the `current` link
run install -d -o tvdeploy -g thousandvale -m 2750 /srv/thousandvale/releases
run install -d -o thousandvale -g thousandvale -m 0700 /var/lib/thousandvale /var/backups/thousandvale
run install -d -o root -g thousandvale -m 0750 /etc/thousandvale
ENV_FILE=/etc/thousandvale/env
if [[ $DRY == 1 ]]; then
  echo "   [dry-run] role thousandvale_stable (generated password, kept on re-run), TV_IP_SALT + TV_ADMIN_TOKEN, databases thousandvale_stable + thousandvale_drill_dev, $ENV_FILE with TV_HOST=127.0.0.1"
else
  cd /                                                  # postgres cannot enter root's home
  if [[ ! -f "$ENV_FILE" || "$(sudo -u postgres psql -XAtq -c "SELECT 1 FROM pg_roles WHERE rolname='thousandvale_stable'")" != 1 ]]; then
    PW="$(rnd 32 | head -c 40)"
    # the password reaches psql as a variable on stdin — never in a file, a log or the process list
    sudo -u postgres psql -X -q -v ON_ERROR_STOP=1 -v pw="$PW" <<'SQL'
SELECT format('CREATE ROLE thousandvale_stable LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION CONNECTION LIMIT 30') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thousandvale_stable') \gexec
SELECT format('ALTER ROLE thousandvale_stable WITH PASSWORD %L', :'pw') \gexec
SQL
    TMP="$(umask 077; mktemp /etc/thousandvale/.env.XXXXXX)"
    SALT="$(rnd 24)"; ATOK="$(rnd 24)"
    TPL="$(<"$OPS/stable.env.template")"; TPL="${TPL//@PASSWORD@/$PW}"; TPL="${TPL//@IP_SALT@/$SALT}"; TPL="${TPL//@ADMIN_TOKEN@/$ATOK}"
    TPL="${TPL//TV_HOST=0.0.0.0/TV_HOST=127.0.0.1}"
    printf '%s\n' "$TPL" > "$TMP"; unset PW TPL SALT ATOK
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

say "6. caddy (https for $DOMAIN)"
if [[ $DRY == 1 ]]; then echo "   [dry-run] Caddy apt repo (dl.cloudsmith.io/public/caddy/stable), install caddy"
elif ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  "${APT[@]}" update; "${APT[@]}" install caddy
fi
TMPC="$(mktemp)"; T="$(<"$HERE/Caddyfile.template")"; T="${T//@DOMAIN@/$DOMAIN}"; T="${T//@EMAIL@/$EMAIL}"; printf '%s\n' "$T" > "$TMPC"
run install -d -o caddy -g caddy -m 0755 /var/log/caddy
if [[ -f /etc/caddy/Caddyfile ]] && cmp -s "$TMPC" /etc/caddy/Caddyfile; then echo "   Caddyfile unchanged"
else
  [[ $DRY == 1 ]] || caddy validate --config "$TMPC" --adapter caddyfile >/dev/null 2>&1 || { caddy validate --config "$TMPC" --adapter caddyfile; echo "Caddyfile failed to validate" >&2; exit 1; }
  run install -o root -g root -m 0644 "$TMPC" /etc/caddy/Caddyfile
  run systemctl enable caddy
  run systemctl reload-or-restart caddy
fi
rm -f "$TMPC"

say "7. systemd units + scripts"
run install -d -m 0755 /usr/local/lib/thousandvale /etc/systemd/system/thousandvale.service.d
for f in backup.sh restore-drill.sh conservation.sql offsite-upload.mjs; do put "$OPS/lib/$f" "/usr/local/lib/thousandvale/$f" 0755; done
put "$HERE/check-vps.sh" /usr/local/lib/thousandvale/check-vps.sh 0755
put "$HERE/thousandvale.service" /etc/systemd/system/thousandvale.service 0644
for u in thousandvale-backup.service thousandvale-backup.timer thousandvale-drill.service thousandvale-drill.timer thousandvale-offsite.service thousandvale-offsite.timer; do put "$OPS/$u" "/etc/systemd/system/$u" 0644; done
put "$HERE/thousandvale-localhost-only.conf" /etc/systemd/system/thousandvale.service.d/localhost-only.conf 0644
[[ ! -f /etc/systemd/system/thousandvale.service.d/lan-only.conf ]] || run rm -f /etc/systemd/system/thousandvale.service.d/lan-only.conf
run systemctl daemon-reload
run systemctl enable --now thousandvale-backup.timer thousandvale-drill.timer thousandvale-offsite.timer
run systemctl enable thousandvale.service
[[ -f /etc/thousandvale/offsite.env ]] || echo "   off-machine copy: optional — fill ops/offsite.env.template into /etc/thousandvale/offsite.env (thousandvale 0400) to switch it on"
if [[ ! -e /srv/thousandvale/current/BUILD ]]; then echo "   no release yet — run ops/vps/deploy.sh on the VM (it starts the game)"
elif [[ $CHANGED == 1 ]]; then run systemctl restart thousandvale.service
else echo "   nothing changed — the running game is left alone"; fi

S="$(command -v systemctl || echo /usr/bin/systemctl)"; TMPS="$(mktemp)"
printf '# Thousandvale (ops/vps/bootstrap.sh): tvdeploy may control the game units, nothing else\ntvdeploy ALL=(root) NOPASSWD: %s start thousandvale.service, %s stop thousandvale.service, %s restart thousandvale.service, %s status thousandvale.service, %s start thousandvale-backup.service, %s start thousandvale-drill.service, %s start thousandvale-offsite.service\n' \
  "$S" "$S" "$S" "$S" "$S" "$S" "$S" > "$TMPS"
[[ $DRY == 1 ]] || visudo -cf "$TMPS" >/dev/null || { echo "sudoers snippet failed visudo" >&2; rm -f "$TMPS"; exit 1; }
put "$TMPS" /etc/sudoers.d/thousandvale-deploy 0440; rm -f "$TMPS"

say "8. ssh: key-only logins"
if [[ $DRY == 1 ]]; then echo "   [dry-run] if root and tvdeploy both have an authorized key: PasswordAuthentication no, PermitRootLogin prohibit-password"
elif [[ -s /root/.ssh/authorized_keys && -s /home/tvdeploy/.ssh/authorized_keys ]]; then
  TMPH="$(mktemp)"; printf '# Thousandvale (ops/vps/bootstrap.sh): keys only\nPasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > "$TMPH"
  if ! cmp -s "$TMPH" /etc/ssh/sshd_config.d/10-thousandvale.conf 2>/dev/null; then
    install -m 0644 "$TMPH" /etc/ssh/sshd_config.d/10-thousandvale.conf
    sshd -t && systemctl reload ssh && echo "   password logins are now off (keys only)"
  fi
  rm -f "$TMPH"
else
  echo "   WARNING: root or tvdeploy has no SSH key yet, so password logins were left ON. Add keys and run this again."
fi

if [[ $DRY == 0 ]]; then say "checks"; /usr/local/lib/thousandvale/check-vps.sh --domain "$DOMAIN" || true; fi
echo "Next (on the VM, no sudo): prototypes/thousandvale/ops/vps/deploy.sh   ->   https://$DOMAIN/"
