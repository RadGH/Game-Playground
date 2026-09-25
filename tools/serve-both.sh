#!/usr/bin/env bash
#
# Two servers: one you can trust, one that is being worked on.
#
#   port 8400  STABLE  ~/claude/playground-stable   (the `stable` branch — only tools/publish-stable.sh moves it)
#   port 8401  DEV     ~/claude/playground          (the live working tree)
#
# The reason both exist: an agent halfway through rewriting a module leaves imports that do not
# resolve, and a browser pointed at that gets a blank screen and a SyntaxError. The bookmark you
# already have — 8400 — is the stable one, so that stops happening to you.
#
# Usage:  tools/serve-both.sh          start (or restart) both
#         tools/serve-both.sh stop     stop both
set -euo pipefail
cd "$(dirname "$0")/.."
DEV_DIR="$PWD"
STABLE_DIR="$HOME/claude/playground-stable"
IP="$(hostname -I | awk '{print $1}')"

stop_port() {
  local port="$1"
  # match the serve.py invocation for that port, not every python on the box
  pkill -f "tools/serve.py $port" 2>/dev/null || true
  # and the older plain-http.server form, if one is still about from before this script existed
  pkill -f "http.server $port" 2>/dev/null || true
}

if [ "${1:-}" = "stop" ]; then
  stop_port 8400; stop_port 8401
  echo "both servers stopped"
  exit 0
fi

stop_port 8400; stop_port 8401
sleep 0.4

if [ -d "$STABLE_DIR" ]; then
  nohup python3 "$STABLE_DIR/tools/serve.py" 8400 > /tmp/playground-stable.log 2>&1 &
  STABLE_AT="$(git -C "$STABLE_DIR" log -1 --format='%h %s' 2>/dev/null || echo '?')"
else
  STABLE_AT="(no worktree — run: git worktree add $STABLE_DIR stable)"
fi
nohup python3 "$DEV_DIR/tools/serve.py" 8401 > /tmp/playground-dev.log 2>&1 &

sleep 0.6
echo "STABLE  http://$IP:8400/   $STABLE_AT"
echo "DEV     http://$IP:8401/   $(git -C "$DEV_DIR" log -1 --format='%h %s')  (+ uncommitted work)"
echo
echo "Promote dev to stable with:  tools/publish-stable.sh"
