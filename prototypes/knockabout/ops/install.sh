#!/usr/bin/env bash
# Install / inspect Knockabout's two user units on the VM (no sudo; lingering is already on for this user).
#   ops/install.sh            link the units, enable + start dev; enable stable once a published copy exists
#   ops/install.sh --status   one line per unit + the servers' /status
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; UDIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
case "${1:-}" in
  --status) for u in knockabout-dev knockabout; do printf '%-16s %s\n' "$u" "$(systemctl --user is-active $u)"; done
    for p in 8470 8471; do printf ':%s  ' $p; curl -fsS --max-time 2 "http://127.0.0.1:$p/status" || echo down; echo; done ;;
  *) mkdir -p "$UDIR"
    for u in knockabout-dev knockabout; do ln -sf "$HERE/$u.service" "$UDIR/$u.service"; done
    systemctl --user daemon-reload
    systemctl --user enable --now knockabout-dev
    if [[ -e "$HOME/.local/share/knockabout/current" ]]; then systemctl --user enable --now knockabout
    else echo "no published copy yet: run tools/publish-knockabout.sh (it enables and starts the stable unit)"; fi ;;
esac
