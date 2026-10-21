#!/usr/bin/env bash
# Install / inspect Tumblefair's two user units on the VM (no sudo; lingering is already on for this user).
#   ops/install.sh            link the units, enable dev + stable, start them
#   ops/install.sh --url      print the public link
#   ops/install.sh --status   one line per unit + the servers' /status
# The PUBLIC game is no longer served from this VM: since 2026-10-20 it runs on the games.radgh.com droplet at
# https://tumblefair.games.radgh.com/ (rads-game-server: server/units/tumblefair.service, `rgs update tumblefair`).
# The Cloudflare quick tunnel this script used to start is retired.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; UDIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
PUBLIC=https://tumblefair.games.radgh.com/
case "${1:-}" in
  --url) echo "$PUBLIC" ;;
  --status) for u in tumblefair-dev tumblefair; do printf '%-20s %s\n' "$u" "$(systemctl --user is-active $u)"; done
    for p in 8480 8483; do printf ':%s  ' $p; curl -fsS --max-time 2 "http://127.0.0.1:$p/status" || echo down; echo; done
    printf 'public: %s  ' "$PUBLIC"; curl -fsS --max-time 5 "${PUBLIC}status" || echo down; echo ;;
  *) mkdir -p "$UDIR"
    for u in tumblefair-dev tumblefair; do ln -sf "$HERE/$u.service" "$UDIR/$u.service"; done
    systemctl --user daemon-reload
    systemctl --user enable --now tumblefair-dev
    [[ -e "$HOME/.local/share/tumblefair/current" ]] && systemctl --user enable --now tumblefair || echo "no published copy yet: run tools/publish-tumblefair.sh, then: systemctl --user enable --now tumblefair"
    echo "public: $PUBLIC" ;;
esac
