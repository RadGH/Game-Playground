#!/usr/bin/env bash
# Thousandvale DEV game server (port 8491, LAN) — stream H.
# Runs the live working tree: node server/main.mjs --port 8491 --db pg.
# Used by the systemd user unit (ops/thousandvale-dev.service) and fine to run by hand:
#   prototypes/thousandvale/ops/start-dev.sh            # foreground
#   PORT=8495 DB=memory prototypes/thousandvale/ops/start-dev.sh
# Database settings come from ~/.config/thousandvale/dev.env (written by ops/postgres-setup.sh, mode 600).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME="$(dirname "$HERE")"                       # prototypes/thousandvale
ENV_FILE="${TV_ENV_FILE:-$HOME/.config/thousandvale/dev.env}"
PORT="${PORT:-8491}"
HOST="${HOST:-0.0.0.0}"                        # dev is LAN-only (ufw), never tunnelled — PLAN §11.4
DB="${DB:-pg}"

if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
elif [[ "$DB" == "pg" ]]; then
  echo "start-dev: $ENV_FILE missing — run ops/postgres-setup.sh first, or DB=memory" >&2
  exit 1
fi

# systemd does not load nvm, so find node: $NODE_BIN, else the newest nvm node, else the system one
NODE="${NODE_BIN:-}"
if [[ -z "$NODE" ]]; then
  NODE="$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1 || true)"
fi
[[ -z "$NODE" ]] && NODE="$(command -v node || true)"
if [[ -z "$NODE" ]]; then echo "start-dev: no node found (set NODE_BIN)" >&2; exit 1; fi

MAIN="$GAME/server/main.mjs"
if [[ ! -f "$MAIN" ]]; then echo "start-dev: $MAIN not found (stream A's server has not landed)" >&2; exit 1; fi

cd "$GAME"
exec "$NODE" "$MAIN" --port "$PORT" --host "$HOST" --db "$DB"
