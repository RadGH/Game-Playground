#!/usr/bin/env bash
# Link Wyrmroad's two user units on the VM (no sudo). They are NOT enabled (owner 2026-11-16: local game servers run
# only while needed) — start one with playground/tools/game-servers.sh start wyrmroad-dev.
#   ops/install.sh            link the units
#   ops/install.sh --status   one line per unit + the servers' /status
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; UDIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
case "${1:-}" in
  --status) for u in wyrmroad-dev wyrmroad; do printf '%-14s %s\n' "$u" "$(systemctl --user is-active $u)"; done
    for p in 8640 8641; do printf ':%s  ' $p; curl -fsS --max-time 2 "http://127.0.0.1:$p/status" || echo down; echo; done ;;
  *) mkdir -p "$UDIR"
    for u in wyrmroad-dev wyrmroad; do systemctl --user link "$HERE/$u.service" >/dev/null; done
    systemctl --user daemon-reload; echo "linked (not enabled): wyrmroad-dev, wyrmroad" ;;
esac
