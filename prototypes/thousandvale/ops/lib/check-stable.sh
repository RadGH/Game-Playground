#!/usr/bin/env bash
# Thousandvale — verify the stable setup (stream H). Run by ops/setup-stable.sh at the end; run it again any time:
#   sudo prototypes/thousandvale/ops/lib/check-stable.sh
# Read-only: it changes nothing. Exit 1 if any check fails.
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
PUBLISHER="${SUDO_USER:-radgh}"
ENV_FILE=/etc/thousandvale/env
cd /
FAILED=0
ok()  { echo "   ok   $1"; }
bad() { echo "   FAIL $1"; FAILED=1; }
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }
nott()  { local what="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$what"; else ok "$what"; fi; }
pgq()   { sudo -u postgres psql -XAtq -c "$1" 2>/dev/null; }

nott  "thousandvale cannot read /home/$PUBLISHER"         sudo -u thousandvale test -r "/home/$PUBLISHER/claude"
nott  "thousandvale cannot list ~/claude/secrets"         sudo -u thousandvale ls "/home/$PUBLISHER/claude/secrets"
check "thousandvale has no login shell"                   test "$(getent passwd thousandvale | cut -d: -f7)" = /usr/sbin/nologin
nott  "thousandvale has no sudo"                          sh -c "sudo -l -U thousandvale | grep -q 'may run'"
check "env file is thousandvale 0400"                     test "$(stat -c '%U %a' "$ENV_FILE")" = "thousandvale 400"
check "env file holds TV_IP_SALT and TV_ADMIN_TOKEN (M3)"    sh -c "grep -q '^TV_IP_SALT=.' $ENV_FILE && grep -q '^TV_ADMIN_TOKEN=.' $ENV_FILE"
check "stable role: no superuser/createdb/createrole"     test "$(pgq "SELECT rolsuper::int + rolcreatedb::int + rolcreaterole::int FROM pg_roles WHERE rolname='thousandvale_stable'")" = 0
check "the service user can log into thousandvale_stable" sh -c "sudo -u thousandvale sh -c 'set -a; . $ENV_FILE; psql -XAtq -c \"select 1\"' | grep -qx 1"
check "the dev role cannot connect to thousandvale_stable" test "$(pgq "SELECT has_database_privilege('thousandvale','thousandvale_stable','CONNECT')")" = f
nott  "postgres listens on localhost only"                sh -c "ss -ltnH | awk '{print \$4}' | grep -E ':5432\$' | grep -vqE '^(127\.0\.0\.1|\[::1\]):5432\$'"
check "the unit is LAN-only (IPAddressDeny=any)"          sh -c "systemctl show thousandvale -p IPAddressDeny | grep -q 'IPAddressDeny=.\+'"
check "backup + drill timers are active"                  systemctl is-active --quiet thousandvale-backup.timer thousandvale-drill.timer
if [[ -f /etc/thousandvale/offsite.env ]]; then
  check "offsite env is thousandvale 0400"                test "$(stat -c '%U %a' /etc/thousandvale/offsite.env)" = "thousandvale 400"
  check "offsite timer is active"                         systemctl is-active --quiet thousandvale-offsite.timer
else
  echo "   --   off-machine backups not configured yet (owner's bucket; ops/offsite.env.template)"
fi
nott  "this machine has no public IPv4 address"           sh -c "hostname -I | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.' | grep -vqE '^(10\.|127\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.)'"
if systemctl is-active --quiet thousandvale; then
  check "the game answers /healthz on 8490"               sh -c "curl -fsS http://127.0.0.1:8490/healthz"
else
  echo "   --   thousandvale.service is not running (publish a release: tools/publish-thousandvale.sh)"
fi
if [[ $FAILED == 0 ]]; then echo "== all checks passed"; else echo "== SOME CHECKS FAILED — read above"; exit 1; fi
