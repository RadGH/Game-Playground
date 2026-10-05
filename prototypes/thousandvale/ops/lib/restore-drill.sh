#!/bin/sh
# Thousandvale restore drill (installed to /usr/local/lib/thousandvale/restore-drill.sh, runs as `thousandvale`).
# 1. restore the newest backup into thousandvale_drill_dev (a scratch DB owned by the stable role)
# 2. boot the PUBLISHED server against it on 127.0.0.1:8493 (--env dev --process drill), wait for /healthz
# 3. run the conservation check (no uid twice, no negative gold), stop the server
# Exit code 0 = the backup really restores into a working game. Writes /var/backups/thousandvale/drill-last.txt.
set -eu
DIR=/var/backups/thousandvale
REPORT="$DIR/drill-last.txt"
DUMP=$(readlink -f "$DIR/latest.dump" 2>/dev/null || true)
NODE=/opt/thousandvale/node/bin/node
APP=/srv/thousandvale/current/app/prototypes/thousandvale
LIB=/usr/local/lib/thousandvale
log() { echo "$(date -u +%FT%TZ) $*" | tee -a "$REPORT"; }
: > "$REPORT"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { log "FAIL: no backup to restore (run thousandvale-backup first)"; exit 1; }
log "restoring $DUMP into thousandvale_drill_dev"
export PGDATABASE=thousandvale_drill_dev
pg_restore --clean --if-exists --no-owner -d thousandvale_drill_dev "$DUMP" >>"$REPORT" 2>&1 || { log "FAIL: pg_restore"; exit 1; }
log "booting the published server on the restored copy"
"$NODE" "$APP/server/main.mjs" --port 8493 --host 127.0.0.1 --env dev --db pg --process drill \
  --terrain "${TV_TERRAIN:-z12_02}" --public /srv/thousandvale/current/public --build drill >>"$REPORT" 2>&1 &
PID=$!
OK=0
for i in $(seq 1 120); do
  if "$NODE" -e "fetch('http://127.0.0.1:8493/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then OK=1; break; fi
  sleep 1
done
kill -TERM "$PID" 2>/dev/null || true; wait "$PID" 2>/dev/null || true
[ "$OK" = 1 ] || { log "FAIL: the server never answered /healthz on the restored database"; exit 1; }
log "server came up on the restored database"
psql -X -q -d thousandvale_drill_dev -f "$LIB/conservation.sql" >>"$REPORT" 2>&1 || { log "FAIL: conservation check"; exit 1; }
log "DRILL PASSED"
