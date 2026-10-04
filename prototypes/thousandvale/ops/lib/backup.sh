#!/bin/sh
# Thousandvale stable backup (installed to /usr/local/lib/thousandvale/backup.sh, runs as `thousandvale`).
# Hourly pg_dump -Fc into /var/backups/thousandvale/hourly, kept 48 h; the first dump of each day is also
# copied to daily/, kept 14 days. The off-machine copy (S3/R2, PLAN §9.6) is not wired yet — it needs a bucket
# key from the owner; when it exists, add it here (write-only key) and to /etc/thousandvale/env.
set -eu
DIR=/var/backups/thousandvale
mkdir -p "$DIR/hourly" "$DIR/daily"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DIR/hourly/thousandvale_stable-$STAMP.dump"
pg_dump -Fc --no-owner -f "$OUT.part" "${PGDATABASE:?}"
mv "$OUT.part" "$OUT"
DAY=$(date -u +%Y%m%d)
ls "$DIR/daily/" 2>/dev/null | grep -q "$DAY" || cp "$OUT" "$DIR/daily/thousandvale_stable-$DAY.dump"
find "$DIR/hourly" -name '*.dump' -mmin +2880 -delete
find "$DIR/daily" -name '*.dump' -mtime +14 -delete
ln -sf "$OUT" "$DIR/latest.dump"
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
