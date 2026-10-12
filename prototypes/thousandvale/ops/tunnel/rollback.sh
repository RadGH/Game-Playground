#!/usr/bin/env bash
# Thousandvale — take the game OFF the internet and back to LAN-only, whichever tunnel was used. Safe to run any time,
# safe to run twice. Player data is not touched (nothing to roll back there: going public changes no data).
#
#   ops/tunnel/rollback.sh            as radgh: stops the QUICK tunnel only (no sudo needed) — the fast kill switch
#   sudo ops/tunnel/rollback.sh       also: stops + disables the NAMED tunnel, puts lan-only.conf back in place of
#                                     public-egress.conf, TV_HOST=0.0.0.0, restarts the game, re-runs check-stable
# Turnstile keys stay in the env (harmless with the tunnel down); remove them by hand if the widget breaks LAN play.
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ $EUID -ne 0 ]]; then
  systemctl --user stop thousandvale-quick-tunnel 2>/dev/null && echo "quick tunnel stopped" || echo "quick tunnel was not running"
  echo "(for the named tunnel and the server-side switches: sudo $0)"; exit 0
fi
U="${SUDO_USER:-radgh}"
sudo -u "$U" XDG_RUNTIME_DIR="/run/user/$(id -u "$U")" systemctl --user stop thousandvale-quick-tunnel 2>/dev/null && echo "quick tunnel stopped" || true
systemctl disable --now thousandvale-tunnel 2>/dev/null && echo "named tunnel stopped + disabled" || true
DROP=/etc/systemd/system/thousandvale.service.d
install -o root -g root -m 0644 "$HERE/../thousandvale-lan-only.conf" "$DROP/lan-only.conf"
rm -f "$DROP/public-egress.conf"
[[ -f /etc/thousandvale/env ]] && sed -i 's/^TV_HOST=.*/TV_HOST=0.0.0.0/' /etc/thousandvale/env
rm -f /run/thousandvale-public-ok
systemctl daemon-reload; systemctl restart thousandvale
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:8490/healthz >/dev/null 2>&1 && break; sleep 1; done
"$HERE/../lib/check-stable.sh"
echo "== back to LAN only: http://$(hostname -I | awk '{print $1}'):8490/"
