#!/usr/bin/env bash
#
# Two servers: one you can trust, one that is being worked on.
#
#   port 8400  STABLE  ~/claude/playground-stable   (the `stable` branch — only tools/publish-stable.sh moves it)
#   port 8401  DEV     ~/claude/playground          (the live working tree)
#   port 8442  STABLE over https, 8441 DEV over https — browsers only expose gamepads on secure pages.
#              Self-signed cert from tools/make-dev-cert.sh (tools/certs/, git-ignored; the stable
#              worktree gets a symlink to it). Skipped if no cert exists yet.
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

# Each server runs as its own little systemd job (playground-serve-<port>), not as a child of the terminal that
# started it: a plain `nohup ... &` stays inside the tmux pane's group, so when that pane is closed or killed
# (2026-11-24: an out-of-memory kill of a test browser took the whole pane) the page servers died with it.
launch() {  # launch <port> <dir> <log> [extra serve.py args]
  local port="$1" dir="$2" log="$3"; shift 3
  if command -v systemd-run >/dev/null && systemctl --user show-environment >/dev/null 2>&1; then
    systemctl --user reset-failed "playground-serve-$port" 2>/dev/null || true
    systemd-run --user --quiet --collect --unit="playground-serve-$port" -p WorkingDirectory="$dir" \
      bash -c "exec python3 tools/serve.py $port $* >> '$log' 2>&1"
  else
    ( cd "$dir" && nohup python3 tools/serve.py "$port" "$@" > "$log" 2>&1 & )
  fi
}

stop_port() {
  local port="$1"
  systemctl --user stop "playground-serve-$port" 2>/dev/null || true
  # match the serve.py invocation for that port, not every python on the box
  pkill -f "tools/serve.py $port" 2>/dev/null || true
  # and the older plain-http.server form, if one is still about from before this script existed
  pkill -f "http.server $port" 2>/dev/null || true
}

if [ "${1:-}" = "stop" ]; then
  stop_port 8400; stop_port 8401; stop_port 8441; stop_port 8442
  echo "servers stopped"
  exit 0
fi

stop_port 8400; stop_port 8401; stop_port 8441; stop_port 8442
sleep 0.4

if [ -d "$STABLE_DIR" ]; then
  launch 8400 "$STABLE_DIR" /tmp/playground-stable.log
  STABLE_AT="$(git -C "$STABLE_DIR" log -1 --format='%h %s' 2>/dev/null || echo '?')"
else
  STABLE_AT="(no worktree — run: git worktree add $STABLE_DIR stable)"
fi
launch 8401 "$DEV_DIR" /tmp/playground-dev.log

HTTPS_NOTE="(no cert — run tools/make-dev-cert.sh for gamepad-friendly https)"
if [ -f "$DEV_DIR/tools/certs/dev.crt" ]; then
  launch 8441 "$DEV_DIR" /tmp/playground-dev-https.log --https
  if [ -d "$STABLE_DIR" ]; then
    [ -e "$STABLE_DIR/tools/certs" ] || ln -s "$DEV_DIR/tools/certs" "$STABLE_DIR/tools/certs"
    launch 8442 "$STABLE_DIR" /tmp/playground-stable-https.log --https
  fi
  HTTPS_NOTE="https://$IP:8442/ (stable)   https://$IP:8441/ (dev)   — for gamepads"
fi

sleep 0.6
echo "STABLE  http://$IP:8400/   $STABLE_AT"
echo "DEV     http://$IP:8401/   $(git -C "$DEV_DIR" log -1 --format='%h %s')  (+ uncommitted work)"
echo "HTTPS   $HTTPS_NOTE"
echo
echo "Promote dev to stable with:  tools/publish-stable.sh"
