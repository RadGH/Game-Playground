#!/usr/bin/env bash
# Thousandvale — prepare the NAMED tunnel (stream H, PLAN §11.3). LATER path; the first test uses ops/tunnel/quick.sh.
# Prepares everything and starts NOTHING.
#
# Needs: the owner's hostname on a Cloudflare-managed zone (e.g. play.radleysustaire.com), cloudflared installed.
#   Step A (radgh, once, opens a browser link the OWNER approves — it picks the zone):
#     cloudflared tunnel login                      # writes ~/.cloudflared/cert.pem (account cert — delete it after step B)
#   Step B (radgh, no sudo):
#     ops/tunnel/named/setup-named.sh --create play.example.com
#        -> cloudflared tunnel create thousandvale   (credentials ~/.cloudflared/<id>.json)
#        -> cloudflared tunnel route dns thousandvale play.example.com   (a CNAME to <id>.cfargotunnel.com)
#        -> renders build/thousandvale.yml and build/thousandvale-tunnel.service in this folder (git-ignored), validates them
#   Step C (sudo, the lead):
#     sudo ops/tunnel/named/setup-named.sh --install
#        -> /etc/cloudflared/thousandvale.yml (0644), /etc/cloudflared/thousandvale-tunnel.json (root 0600, moved from
#           ~/.cloudflared), /etc/systemd/system/thousandvale-tunnel.service — daemon-reload, NOT enabled, NOT started
#   Then: rm ~/.cloudflared/cert.pem, and the switches in ops/tunnel/README.md "Named tunnel: order of switches".
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/build"
CF="$(command -v cloudflared || true)"; [[ -n "$CF" ]] || { echo "install cloudflared first (docs/requests.md, H -> Lead (sudo), M3)" >&2; exit 1; }

case "${1:-}" in
  --create)
    HOST="${2:?hostname, e.g. play.radleysustaire.com}"
    [[ "$HOST" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]] || { echo "not a hostname: $HOST" >&2; exit 1; }
    [[ $EUID -ne 0 ]] || { echo "run --create as radgh, not root" >&2; exit 1; }
    [[ -f "$HOME/.cloudflared/cert.pem" ]] || { echo "run 'cloudflared tunnel login' first (the owner approves the zone in the browser)" >&2; exit 1; }
    "$CF" tunnel list -o json 2>/dev/null | grep -q '"name":"thousandvale"' || "$CF" tunnel create thousandvale
    ID="$("$CF" tunnel list -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const t=JSON.parse(s).find(x=>x.name==="thousandvale");console.log(t?t.id:"")})')"
    [[ -n "$ID" && -f "$HOME/.cloudflared/$ID.json" ]] || { echo "tunnel id or credentials missing (id='$ID')" >&2; exit 1; }
    "$CF" tunnel route dns thousandvale "$HOST"
    mkdir -p "$OUT"; umask 022
    sed -e "s#@TUNNEL_ID@#$ID#" -e "s#@HOSTNAME@#$HOST#" "$HERE/thousandvale.yml.template" > "$OUT/thousandvale.yml"
    sed -e "s#@CLOUDFLARED@#$CF#" "$HERE/thousandvale-tunnel.service" > "$OUT/thousandvale-tunnel.service"
    echo "$ID" > "$OUT/TUNNEL_ID"; echo "$HOST" > "$OUT/HOSTNAME"
    "$CF" tunnel --config "$OUT/thousandvale.yml" ingress validate
    "$CF" tunnel --config "$OUT/thousandvale.yml" ingress rule "https://$HOST/gw" | grep -q '127.0.0.1:8490' || { echo "the hostname does not route to 8490" >&2; exit 1; }
    "$CF" tunnel --config "$OUT/thousandvale.yml" ingress rule "https://anything-else.$HOST/" | grep -q 'http_status:404' || { echo "the catch-all is not 404" >&2; exit 1; }
    echo "== rendered into $OUT. Next (lead): sudo $0 --install" ;;
  --install)
    [[ $EUID -eq 0 ]] || { echo "run --install with sudo" >&2; exit 1; }
    U="${SUDO_USER:?run with sudo from radgh}"; ID="$(cat "$OUT/TUNNEL_ID")"
    CRED="/home/$U/.cloudflared/$ID.json"
    install -d -m 0755 /etc/cloudflared
    install -o root -g root -m 0644 "$OUT/thousandvale.yml" /etc/cloudflared/thousandvale.yml
    if [[ -f "$CRED" ]]; then install -o root -g root -m 0600 "$CRED" /etc/cloudflared/thousandvale-tunnel.json && shred -u "$CRED"; fi
    [[ -f /etc/cloudflared/thousandvale-tunnel.json ]] || { echo "no credentials at $CRED or /etc/cloudflared/thousandvale-tunnel.json" >&2; exit 1; }
    install -o root -g root -m 0644 "$OUT/thousandvale-tunnel.service" /etc/systemd/system/thousandvale-tunnel.service
    systemctl daemon-reload
    echo "== installed (disabled, stopped). Delete the account cert now: rm /home/$U/.cloudflared/cert.pem"
    echo "   then follow ops/tunnel/README.md 'Named tunnel: order of switches'" ;;
  *) sed -n 2,22p "$0"; exit 2 ;;
esac
