#!/usr/bin/env bash
# Start the Oddhaven room server for a systemd user unit (systemd does not load nvm, so find node ourselves).
#   ops/start.sh dev      the working tree on 8561 (+ https 8563), data in ~/.local/share/oddhaven/dev
#   ops/start.sh stable   the published copy ~/.local/share/oddhaven/current on 8560 (+ https 8562), data in .../stable
# https uses the playground's self-signed cert (tools/certs/, made by tools/make-dev-cert.sh). On a phone, open the page on the https port itself: one warning covers the page and its socket.
set -euo pipefail
MODE="${1:-dev}"
NODE="${NODE_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)}"; NODE="${NODE:-$(command -v node)}"
BASE="$HOME/.local/share/oddhaven"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS="$(cd "$HERE/../.." && pwd)/tools/certs"
if [[ "$MODE" == stable ]]; then
  CUR="$BASE/current"; BUILD="$(cat "$CUR/BUILD")"
  exec "$NODE" "$CUR/app/prototypes/oddhaven/server/main.mjs" --port 8560 --https-port 8562 --certs "$CERTS" --host 0.0.0.0 --public "$CUR/public" --build "$BUILD" --data "$BASE/stable"
else
  exec "$NODE" "$HERE/server/main.mjs" --port 8561 --https-port 8563 --certs "$CERTS" --host 0.0.0.0 --build dev --data "$BASE/dev" --dev
fi
