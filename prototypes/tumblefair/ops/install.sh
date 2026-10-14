#!/usr/bin/env bash
# Install / inspect Tumblefair's three user units (no sudo; lingering is already on for this user).
#   ops/install.sh            link the units, enable dev + stable + tunnel, start them
#   ops/install.sh --url      print the public link (the quick tunnel's current address)
#   ops/install.sh --status   one line per unit + the servers' /status
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; UDIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
url() { local since; since="$(systemctl --user show tumblefair-tunnel -p ActiveEnterTimestamp --value 2>/dev/null)"; [[ -n "$since" && "$since" != n/a ]] || return 1
  journalctl --user -u tumblefair-tunnel --since "$since" --no-pager -o cat 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1; }
case "${1:-}" in
  --url) u="$(url || true)"; [[ -n "$u" ]] && echo "$u/" || { echo "the tunnel is not running" >&2; exit 1; } ;;
  --status) for u in tumblefair-dev tumblefair tumblefair-tunnel; do printf '%-20s %s\n' "$u" "$(systemctl --user is-active $u)"; done
    for p in 8480 8483; do printf ':%s  ' $p; curl -fsS --max-time 2 "http://127.0.0.1:$p/status" || echo down; echo; done; echo "public: $(url || echo none)" ;;
  *) mkdir -p "$UDIR"
    for u in tumblefair-dev tumblefair tumblefair-tunnel; do ln -sf "$HERE/$u.service" "$UDIR/$u.service"; done
    systemctl --user daemon-reload
    systemctl --user enable --now tumblefair-dev
    [[ -e "$HOME/.local/share/tumblefair/current" ]] && systemctl --user enable --now tumblefair || echo "no published copy yet: run tools/publish-tumblefair.sh, then: systemctl --user enable --now tumblefair tumblefair-tunnel"
    [[ -e "$HOME/.local/share/tumblefair/current" ]] && systemctl --user enable --now tumblefair-tunnel
    for _ in $(seq 1 30); do u="$(url || true)"; [[ -n "$u" ]] && break; sleep 1; done; echo "public: ${u:-not yet}" ;;
esac
