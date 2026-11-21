#!/usr/bin/env bash
# Start the Wyrmroad room server for a systemd user unit (systemd does not load nvm, so find node ourselves).
#   ops/start.sh dev      this working tree on 8641 (+ wss 8643) — pairs with the dev page server 8401/8441
#   ops/start.sh stable   the stable worktree (~/claude/playground-stable) on 8640 (+ wss 8642) — pairs with 8400/8442
# The page itself is served by the playground's page servers; this is only the rooms (js/net/client.js serverUrl).
set -euo pipefail
MODE="${1:-dev}"
NODE="${NODE_BIN:-$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -1)}"; NODE="${NODE:-$(command -v node)}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERTS="$(cd "$HERE/../.." && pwd)/tools/certs"
if [[ "$MODE" == stable ]]; then
  G="$HOME/claude/playground-stable/prototypes/wyrmroad"
  [[ -d "$G/node_modules/ws" ]] || (cd "$G" && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 || npm install --omit=dev --no-audit --no-fund >/dev/null)
  exec "$NODE" "$G/server/main.mjs" --port 8640 --https-port 8642 --certs "$CERTS" --host 0.0.0.0 --build "stable-$(git -C "$G" rev-parse --short HEAD 2>/dev/null || echo unknown)"
else
  [[ -d "$HERE/node_modules/ws" ]] || (cd "$HERE" && npm install --omit=dev --no-audit --no-fund >/dev/null)
  exec "$NODE" "$HERE/server/main.mjs" --port 8641 --https-port 8643 --certs "$CERTS" --host 0.0.0.0 --build dev
fi
