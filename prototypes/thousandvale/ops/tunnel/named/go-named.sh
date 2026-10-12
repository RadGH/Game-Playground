#!/usr/bin/env bash
# Thousandvale — flip the stable server into PUBLIC (named-tunnel) mode. LATER path. sudo. Starts NO tunnel.
#   sudo ops/tunnel/named/go-named.sh            # do it
#   sudo ops/tunnel/named/go-named.sh --check    # say what is missing, change nothing
# Requires (refuses otherwise): real Turnstile keys in /etc/thousandvale/env (not Cloudflare's 1x000… test keys),
# the client drawing the Turnstile widget (stream D), and ops/tunnel/named/setup-named.sh --install done.
# Does, in this order: swap lan-only.conf -> public-egress.conf (server may reach Cloudflare for siteverify, nothing else),
# TV_HOST=127.0.0.1 in the env (the game then answers only the tunnel and this machine — the owner plays through the
# public link), daemon-reload, restart thousandvale, wait for /healthz and /status human:true.
# Undo: sudo ops/tunnel/rollback.sh
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME="$(cd "$HERE/../../.." && pwd)"
ENV_FILE=/etc/thousandvale/env; DROP=/etc/systemd/system/thousandvale.service.d
miss=0
grep -qE '^TV_TURNSTILE_SECRET=0x' "$ENV_FILE" || { echo "missing: a REAL TV_TURNSTILE_SECRET (0x…) in $ENV_FILE (sudoedit it)"; miss=1; }
grep -qE '^TV_TURNSTILE_SITEKEY=0x' "$ENV_FILE" || { echo "missing: a REAL TV_TURNSTILE_SITEKEY (0x…) in $ENV_FILE"; miss=1; }
grep -rqi turnstile "$GAME/js/client" 2>/dev/null || { echo "missing: the client does not draw the Turnstile widget yet (stream D) — guests could not be created"; miss=1; }
[[ -f /etc/systemd/system/thousandvale-tunnel.service && -f /etc/cloudflared/thousandvale.yml ]] || { echo "missing: sudo ops/tunnel/named/setup-named.sh --install"; miss=1; }
[[ "${1:-}" == --check ]] && { [[ $miss == 0 ]] && echo "ready" || true; exit $miss; }
[[ $miss == 0 ]] || { echo "refusing"; exit 1; }
install -o root -g root -m 0644 "$HERE/public-egress.conf" "$DROP/public-egress.conf"
rm -f "$DROP/lan-only.conf"
sed -i 's/^TV_HOST=.*/TV_HOST=127.0.0.1/' "$ENV_FILE"
systemctl daemon-reload; systemctl restart thousandvale
for _ in $(seq 1 60); do curl -fsS http://127.0.0.1:8490/healthz >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:8490/status | grep -q '"human":true' || { echo "!! /status does not report human:true — roll back: sudo ops/tunnel/rollback.sh"; exit 1; }
echo "== public mode on (tunnel NOT started). Next: sudo ops/lib/check-public.sh --mode named --confirm-manual, then sudo systemctl start thousandvale-tunnel"
