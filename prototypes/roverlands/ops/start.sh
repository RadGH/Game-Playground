#!/usr/bin/env bash
# Start a Roverlands server for a systemd user unit (systemd does not load nvm, so find node ourselves).
#   ops/start.sh dev      the working tree on 8551 (+ https 8553), data in ~/.local/share/roverlands/dev
#   ops/start.sh stable   the published copy ~/.local/share/roverlands/current on 8550 (+ https 8552), data in .../stable
# https uses the playground's self-signed cert (tools/certs/, made by tools/make-dev-cert.sh): gamepads need a secure page.
set -euo pipefail
MODE="${1:-dev}"
NODE="${NODE_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)}"; NODE="${NODE:-$(command -v node)}"
BASE="$HOME/.local/share/roverlands"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS="$(cd "$HERE/../.." && pwd)/tools/certs"
if [[ "$MODE" == stable ]]; then
  CUR="$BASE/current"; BUILD="$(cat "$CUR/BUILD")"
  exec "$NODE" "$CUR/app/prototypes/roverlands/server/main.mjs" --port 8550 --https-port 8552 --certs "$CERTS" --host 0.0.0.0 --public "$CUR/public" --build "$BUILD" --data "$BASE/stable"
else
  exec "$NODE" "$HERE/server/main.mjs" --port 8551 --https-port 8553 --certs "$CERTS" --host 0.0.0.0 --build dev --data "$BASE/dev"
fi
