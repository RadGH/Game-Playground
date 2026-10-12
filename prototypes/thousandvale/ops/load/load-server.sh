#!/usr/bin/env bash
# Thousandvale — the LOAD server for 300-bot runs (stream H). Never the stable server, never the dev database.
#
#   ops/load/load-server.sh start [--pin] [--tree <app dir>]   scratch Postgres + a game server on port 8495 (LAN)
#   ops/load/load-server.sh status
#   ops/load/load-server.sh stop                                stop both and DELETE the scratch database
#
# What runs: by default the PUBLISHED release that is live on 8490 (/srv/thousandvale/current/app) — so the run measures
# exactly what players get — with the same flags as the stable unit, except: port 8495, env dev, its own throw-away
# Postgres cluster (ops/scratch-pg.sh: no TCP port, unix socket only), and --max-per-ip 2000 so one bot machine may open
# hundreds of sockets. --tree <dir> runs another tree (e.g. the working tree: --tree ~/claude/playground/prototypes/thousandvale).
# --pin: server on cpus 0-7, leaving 8-11 for same-VM bots (PLAN §16.3). PROCS=1 runs the stage-2 shape (gateway + 1 child).
# LAN only: this machine has no public address and no tunnel ever points at 8495.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME="$(cd "$HERE/../.." && pwd)"
DATA="${TV_LOAD_DIR:-$GAME/.data/load}"
PORT="${PORT:-8495}"
PROCS="${PROCS:-0}"
NODE="${NODE_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v22*/bin/node 2>/dev/null | sort -V | tail -1 || command -v node)}"
cmd="${1:-}"; shift || true
PIN=0; TREE=""
while [[ $# -gt 0 ]]; do case "$1" in --pin) PIN=1 ;; --tree) TREE="$2"; shift ;; *) echo "unknown $1" >&2; exit 2 ;; esac; shift; done

case "$cmd" in
  start)
    if [[ -f "$DATA/server.pid" ]] && kill -0 "$(cat "$DATA/server.pid")" 2>/dev/null; then echo "already running (pid $(cat "$DATA/server.pid"))"; exit 0; fi
    if [[ -z "$TREE" ]]; then
      if [[ -r /srv/thousandvale/current/app/prototypes/thousandvale/server/main.mjs ]]; then TREE=/srv/thousandvale/current/app/prototypes/thousandvale; BUILD="$(cat /srv/thousandvale/current/BUILD)"
      else TREE="$GAME"; BUILD=dev; echo "   (the published release is not readable — log in again after setup-stable added you to group thousandvale; using the working tree)"; fi
    else BUILD=dev; fi
    mkdir -p "$DATA"
    eval "$("$GAME/ops/scratch-pg.sh" start "$DATA/pg" 55495 | sed 's/^/export /')"
    export PGDATABASE=tvload_dev
    psql -XAtq -d postgres -c "SELECT 1 FROM pg_database WHERE datname='tvload_dev'" | grep -q 1 || createdb tvload_dev
    PUBLIC=(); [[ "$TREE" == /srv/* ]] && PUBLIC=(--public /srv/thousandvale/current/public)
    EXTRA=(); [[ "$PROCS" != 0 ]] && EXTRA=(--procs "$PROCS")
    PRE=(); [[ $PIN == 1 ]] && PRE=(taskset -c 0-7)
    cd "$TREE"
    nohup "${PRE[@]}" "$NODE" server/main.mjs --port "$PORT" --host 0.0.0.0 --env dev --db pg --process load --max-per-ip 2000 --build "$BUILD" "${PUBLIC[@]}" "${EXTRA[@]}" > "$DATA/server.log" 2>&1 &
    echo $! > "$DATA/server.pid"
    for _ in $(seq 1 90); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break; sleep 1; done
    curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null || { echo "did not come up — tail $DATA/server.log"; tail -20 "$DATA/server.log"; exit 1; }
    echo "== load server up: ws://$(hostname -I | awk '{print $1}'):$PORT  (build $BUILD, tree $TREE, procs $PROCS, pinned $PIN)"
    echo "   log: $DATA/server.log   stop: $0 stop" ;;
  status) curl -fsS "http://127.0.0.1:$PORT/status" | head -c 400; echo ;;
  stop)
    [[ -f "$DATA/server.pid" ]] && { kill "$(cat "$DATA/server.pid")" 2>/dev/null || true; for _ in $(seq 1 80); do kill -0 "$(cat "$DATA/server.pid")" 2>/dev/null || break; sleep 1; done; rm -f "$DATA/server.pid"; }
    "$GAME/ops/scratch-pg.sh" stop "$DATA/pg"
    echo "stopped; scratch database deleted (token files for it are now worthless)" ;;
  *) sed -n 2,13p "$0"; exit 2 ;;
esac
