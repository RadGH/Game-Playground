#!/usr/bin/env bash
# Start a Tumblefair server for a systemd user unit (systemd does not load nvm, so find node ourselves).
#   ops/start.sh dev      the working tree on 8483 (LAN), profiles in ~/.local/share/tumblefair/dev
#   ops/start.sh stable   the published copy ~/.local/share/tumblefair/current on 8480, profiles in .../stable
set -euo pipefail
MODE="${1:-dev}"
NODE="${NODE_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)}"; NODE="${NODE:-$(command -v node)}"
BASE="$HOME/.local/share/tumblefair"
if [[ "$MODE" == stable ]]; then
  CUR="$BASE/current"; BUILD="$(cat "$CUR/BUILD")"
  exec "$NODE" "$CUR/app/prototypes/tumblefair/server/main.mjs" --port 8480 --host 0.0.0.0 --public "$CUR/public" --build "$BUILD" --data "$BASE/stable"
else
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  exec "$NODE" "$HERE/server/main.mjs" --port 8483 --host 0.0.0.0 --build dev --data "$BASE/dev"
fi
