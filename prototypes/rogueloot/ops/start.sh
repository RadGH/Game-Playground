#!/usr/bin/env bash
# Start a Rogueloot server for a systemd user unit (systemd does not load nvm, so find node ourselves).
#   ops/start.sh dev      the working tree on 8581 (+ https 8583), data in ~/.local/share/rogueloot/dev
#   ops/start.sh stable   the published copy ~/.local/share/rogueloot/current on 8580 (+ https 8582), data in .../stable
# https uses the playground's self-signed cert (tools/certs/, made by tools/make-dev-cert.sh): gamepads need a secure page.
set -euo pipefail
MODE="${1:-dev}"
NODE="${NODE_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)}"; NODE="${NODE:-$(command -v node)}"
BASE="$HOME/.local/share/rogueloot"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS="$(cd "$HERE/../.." && pwd)/tools/certs"
if [[ "$MODE" == stable ]]; then
  CUR="$BASE/current"; BUILD="$(cat "$CUR/BUILD")"
  exec "$NODE" "$CUR/app/prototypes/rogueloot/server/main.mjs" --port 8580 --https-port 8582 --certs "$CERTS" --host 0.0.0.0 --public "$CUR/public" --build "$BUILD" --data "$BASE/stable"
else
  exec "$NODE" "$HERE/server/main.mjs" --port 8581 --https-port 8583 --certs "$CERTS" --host 0.0.0.0 --build dev --data "$BASE/dev"
fi
