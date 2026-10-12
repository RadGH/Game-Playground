#!/usr/bin/env bash
# Thousandvale — a THROW-AWAY Postgres cluster for drills and chaos runs, no sudo (stream H).
#
#   ops/scratch-pg.sh start <dir> [port]   # initdb + start; prints the env lines to use it (source them)
#   ops/scratch-pg.sh stop  <dir>          # stop it and delete <dir>
#
# The cluster is owned by you, listens on NO TCP port at all (listen_addresses = ''), only on a unix socket inside
# <dir> (mode 0700) — so nobody else on the machine can reach it, and trust auth is safe. It never touches the real
# cluster on 5432, the dev database or the stable database. Postgres 18 binaries from /usr/lib/postgresql/18/bin.
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
cmd="${1:-}"; dir="${2:-}"; port="${3:-55432}"
[[ -n "$cmd" && -n "$dir" ]] || { echo "usage: $0 start|stop <dir> [port]" >&2; exit 2; }
case "$cmd" in
  start)
    mkdir -p "$dir"; chmod 700 "$dir"
    if [[ ! -f "$dir/data/PG_VERSION" ]]; then
      "$PGBIN/initdb" -D "$dir/data" -U tvadmin --auth=trust --encoding=UTF8 --no-instructions >"$dir/initdb.log" 2>&1
    fi
    "$PGBIN/pg_ctl" -D "$dir/data" -l "$dir/postgres.log" -w -o "-c listen_addresses='' -c unix_socket_directories='$dir' -p $port -c fsync=on" start >/dev/null
    echo "PGHOST=$dir"; echo "PGPORT=$port"; echo "PGUSER=tvadmin"
    ;;
  stop)
    [[ -f "$dir/data/PG_VERSION" ]] && "$PGBIN/pg_ctl" -D "$dir/data" -m fast -w stop >/dev/null 2>&1 || true
    case "$dir" in /|/home|/home/*/|"$HOME"|"$HOME/") echo "refusing to delete $dir" >&2; exit 1 ;; esac
    rm -rf "$dir"
    ;;
  *) echo "usage: $0 start|stop <dir> [port]" >&2; exit 2 ;;
esac
