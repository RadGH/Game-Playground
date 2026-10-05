#!/usr/bin/env bash
# Thousandvale — prove a backup RESTORES, without sudo (stream H, PLAN §9.6 "the restore drill is a test").
#
#   prototypes/thousandvale/ops/drill-local.sh          # backs up thousandvale_dev, restores it, boots on it
#
# Runs the SAME two scripts the stable server's timers run (ops/lib/backup.sh, ops/lib/restore-drill.sh), only
# with their paths pointed somewhere harmless:
#   1. backup.sh dumps the dev database (pg_dump -Fc, read-only for the source) into a temp folder
#   2. a throw-away Postgres cluster starts (ops/scratch-pg.sh: unix socket only, no TCP)
#   3. restore-drill.sh restores the dump into thousandvale_drill_dev there, boots THIS working tree's server on it
#      (--env dev --db pg --process drill), waits for /healthz, runs the conservation check (no item uid twice,
#      no negative gold)
#   4. row counts of the source and the restored copy are compared table by table
# then the cluster and the temp folder are deleted. Exit 0 = DRILL PASSED.
set -euo pipefail
GAME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVF="${TV_DEV_ENV:-$HOME/.config/thousandvale/dev.env}"
[[ -r "$ENVF" ]] || { echo "no dev env file ($ENVF)" >&2; exit 1; }
WORK="$(mktemp -d "${TMPDIR:-/tmp}/tv-drill.XXXXXX")"
PG="$WORK/pg"
cleanup() { "$GAME/ops/scratch-pg.sh" stop "$PG" || true; rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$WORK/backups"

echo "== 1. backup the dev database (same script as the stable timer)"
( set -a; . "$ENVF"; set +a; TV_BACKUP_DIR="$WORK/backups" sh "$GAME/ops/lib/backup.sh" )
DUMP="$(readlink -f "$WORK/backups/latest.dump")"

echo "== 2. throw-away cluster"
"$GAME/ops/scratch-pg.sh" start "$PG" 55433 > "$WORK/pg.env"
set -a; . "$WORK/pg.env"; set +a
unset PGPASSWORD PGDATABASE DATABASE_URL
createdb thousandvale_drill_dev

echo "== 3. restore + boot + conservation (same script as the weekly drill)"
TV_BACKUP_DIR="$WORK/backups" TV_DUMP="$DUMP" TV_NODE="$(command -v node)" TV_APP="$GAME" TV_PUBLIC=/nonexistent \
  TV_LIB="$GAME/ops/lib" TV_DRILL_PORT="${TV_DRILL_PORT:-8494}" sh "$GAME/ops/lib/restore-drill.sh" || { cat "$WORK/backups/drill-last.txt"; exit 1; }
grep -A2 -E 'characters \|' "$WORK/backups/drill-last.txt" | grep -v -- '--' ; grep -E 'NOTICE' "$WORK/backups/drill-last.txt" | sed 's/^/   /' || true

echo "== 4. row counts: source vs restored"
COUNTS="SELECT string_agg(relname || '=' || n, ' ' ORDER BY relname) FROM (SELECT c.relname, (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint AS n FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname = 'public') t"
SRC="$(env -u PGHOST -u PGPORT -u PGUSER bash -c "set -a; . '$ENVF'; set +a; psql -XAtq -c \"$COUNTS\"")"
DST="$(psql -XAtq -d thousandvale_drill_dev -c "$COUNTS")"
echo "   source:   $SRC"
echo "   restored: $DST"
# the server booted on the copy and may have written a little (leases, a migration stamp) — compare the player data
for t in characters accounts char_journal; do
  s="$(tr ' ' '\n' <<<"$SRC" | grep "^$t=" || true)"; d="$(tr ' ' '\n' <<<"$DST" | grep "^$t=" || true)"
  [[ "$s" == "$d" ]] || { echo "!! $t differs: source '$s' restored '$d'"; exit 1; }
done
echo "== DRILL PASSED ($(du -h "$DUMP" | cut -f1) dump)"
