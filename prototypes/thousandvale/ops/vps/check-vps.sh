#!/usr/bin/env bash
# Thousandvale on a VPS — verify the setup (stream H). Run by ops/vps/bootstrap.sh at the end; run it again any time:
#   sudo /usr/local/lib/thousandvale/check-vps.sh [--domain play.example.com]
# Read-only: it changes nothing. Exit 1 if any check fails.
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
DOMAIN=""; [[ "${1:-}" == "--domain" ]] && DOMAIN="${2:-}"
ENV_FILE=/etc/thousandvale/env
cd /
FAILED=0
ok()  { echo "   ok   $1"; }
bad() { echo "   FAIL $1"; FAILED=1; }
check() { local what="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$what"; else bad "$what"; fi; }
nott()  { local what="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$what"; else ok "$what"; fi; }
pgq()   { sudo -u postgres psql -XAtq -c "$1" 2>/dev/null; }

check "thousandvale has no login shell"                   test "$(getent passwd thousandvale | cut -d: -f7)" = /usr/sbin/nologin
nott  "thousandvale has no sudo"                          sh -c "sudo -l -U thousandvale | grep -q 'may run'"
check "tvdeploy has a locked password (key only)"         sh -c "passwd -S tvdeploy | awk '{print \$2}' | grep -qx L"
check "env file is thousandvale 0400"                     test "$(stat -c '%U %a' "$ENV_FILE")" = "thousandvale 400"
check "env file: TV_HOST=127.0.0.1, salt + admin token"   sh -c "grep -qx 'TV_HOST=127.0.0.1' $ENV_FILE && grep -q '^TV_IP_SALT=.' $ENV_FILE && grep -q '^TV_ADMIN_TOKEN=.' $ENV_FILE"
check "stable role: no superuser/createdb/createrole"     test "$(pgq "SELECT rolsuper::int + rolcreatedb::int + rolcreaterole::int FROM pg_roles WHERE rolname='thousandvale_stable'")" = 0
check "the service user can log into thousandvale_stable" sh -c "sudo -u thousandvale sh -c 'set -a; . $ENV_FILE; psql -XAtq -c \"select 1\"' | grep -qx 1"
nott  "postgres listens on localhost only"                sh -c "ss -ltnH | awk '{print \$4}' | grep -E ':5432\$' | grep -vqE '^(127\.0\.0\.1|\[::1\]):5432\$'"
nott  "nothing but 22/80/443 listens on a public address" sh -c "ss -ltnH | awk '{print \$4}' | grep -vE '^(127\.[0-9.]+|\[::1\]|\[::ffff:127\.[0-9.]+\]):[0-9]+\$' | grep -vqE ':(22|80|443)\$'"
check "firewall is on (22, 80, 443 only)"                 sh -c "ufw status | grep -q '^Status: active' && ! ufw status | grep -E 'ALLOW' | grep -vqE '^(22|80|443)(/tcp|/udp)? '"
check "the game unit is localhost-only (IPAddressDeny)"   sh -c "systemctl show thousandvale -p IPAddressDeny | grep -q 'IPAddressDeny=.\+'"
check "caddy is running"                                  systemctl is-active --quiet caddy
check "backup + drill timers are active"                  systemctl is-active --quiet thousandvale-backup.timer thousandvale-drill.timer
check "ssh: password logins off"                          sh -c "sshd -T 2>/dev/null | grep -qx 'passwordauthentication no'"
if [[ -f /etc/thousandvale/offsite.env ]]; then
  check "offsite env is thousandvale 0400"                test "$(stat -c '%U %a' /etc/thousandvale/offsite.env)" = "thousandvale 400"
else
  echo "   --   off-machine backups not configured (optional; ops/offsite.env.template)"
fi
if systemctl is-active --quiet thousandvale; then
  check "the game answers /healthz on 127.0.0.1:8490"     sh -c "curl -fsS http://127.0.0.1:8490/healthz"
  nott  "the game does NOT answer on a public address"    sh -c "ss -ltnH | awk '{print \$4}' | grep -E ':8490\$' | grep -vqE '^127\.0\.0\.1:8490\$'"
  [[ -z "$DOMAIN" ]] || check "https://$DOMAIN/healthz answers (certificate ok)" sh -c "curl -fsS --max-time 10 https://$DOMAIN/healthz"
else
  echo "   --   thousandvale.service is not running yet (run ops/vps/deploy.sh on the VM)"
fi
if [[ $FAILED == 0 ]]; then echo "== all checks passed"; else echo "== SOME CHECKS FAILED — read above"; exit 1; fi
