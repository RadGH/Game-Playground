#!/usr/bin/env bash
# Install / refresh the Thousandvale dev user unit. No sudo needed. Safe to run more than once.
#   --now   also start (or restart) it
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "$HOME/.config/systemd/user"
ln -sf "$HERE/thousandvale-dev.service" "$HOME/.config/systemd/user/thousandvale-dev.service"
systemctl --user daemon-reload
systemctl --user enable thousandvale-dev.service
if [[ "${1:-}" == "--now" ]]; then systemctl --user restart thousandvale-dev.service; systemctl --user --no-pager status thousandvale-dev.service | head -8; fi
echo "installed: systemctl --user {start|stop|restart|status} thousandvale-dev"
