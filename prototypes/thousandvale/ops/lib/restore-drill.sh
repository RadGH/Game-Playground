#!/bin/sh
# Thousandvale restore drill (installed to /usr/local/lib/thousandvale/restore-drill.sh, runs as `thousandvale`).
# 1. restore the newest backup into thousandvale_drill_dev (a scratch DB owned by the stable role)
# 2. boot the PUBLISHED server against it on 127.0.0.1:8493 (--env dev --process drill), wait for /healthz
# 3. run the conservation check (no uid twice, no negative gold), stop the server
# Exit code 0 = the backup really restores into a working game. Writes /var/backups/thousandvale/drill-last.txt.
# Every path can be overridden from the environment (ops/drill-local.sh runs this same script, without sudo,
# against a throw-away Postgres cluster): TV_BACKUP_DIR, TV_DUMP, TV_DRILL_DB, TV_NODE, TV_APP, TV_PUBLIC,
# TV_LIB, TV_DRILL_PORT.
set -eu
DIR=${TV_BACKUP_DIR:-/var/backups/thousandvale}
REPORT="$DIR/drill-last.txt"
DUMP=${TV_DUMP:-$(readlink -f "$DIR/latest.dump" 2>/dev/null || true)}
DB=${TV_DRILL_DB:-thousandvale_drill_dev}
NODE=${TV_NODE:-/opt/thousandvale/node/bin/node}
APP=${TV_APP:-/srv/thousandvale/current/app/prototypes/thousandvale}
PUBLIC=${TV_PUBLIC:-/srv/thousandvale/current/public}
LIB=${TV_LIB:-/usr/local/lib/thousandvale}
PORT=${TV_DRILL_PORT:-8493}
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$REPORT"; }
: > "$REPORT"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { log "FAIL: no backup to restore (run thousandvale-backup first)"; exit 1; }
case "$DB" in *_dev) ;; *) log "FAIL: the drill database must end in _dev (got $DB)"; exit 1 ;; esac
log "restoring $DUMP into $DB"
export PGDATABASE="$DB"
unset DATABASE_URL   # the server prefers DATABASE_URL over PG* — it must never point the drill at a live database
pg_restore --clean --if-exists --no-owner -d "$DB" "$DUMP" >>"$REPORT" 2>&1 || { log "FAIL: pg_restore"; exit 1; }
log "booting the published server on the restored copy"
PUBARG=""; [ -d "$PUBLIC" ] && PUBARG="--public $PUBLIC"
# shellcheck disable=SC2086
"$NODE" "$APP/server/main.mjs" --port "$PORT" --host 127.0.0.1 --env dev --db pg --process drill $PUBARG --build drill >>"$REPORT" 2>&1 &
PID=$!
OK=0
for i in $(seq 1 120); do
  if "$NODE" -e "fetch('http://127.0.0.1:'+process.argv[1]+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" "$PORT"; then OK=1; break; fi
  sleep 1
done
kill -TERM "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true
[ "$OK" = 1 ] || { log "FAIL: the server never answered /healthz on the restored database"; exit 1; }
log "server came up on the restored database"
psql -X -q -d "$DB" -f "$LIB/conservation.sql" >>"$REPORT" 2>&1 || { log "FAIL: conservation check"; exit 1; }
log "DRILL PASSED"
