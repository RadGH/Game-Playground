#!/usr/bin/env bash
# Thousandvale — the QUICK tunnel (free trycloudflare.com link, no account, no DNS). Stream H, M3 first test.
#
#   ops/tunnel/quick.sh --install   write the user unit (needs cloudflared; does NOT start anything)
#   ops/tunnel/quick.sh --start     start it — refuses unless check-public passed (see below) — then print the URL
#   ops/tunnel/quick.sh --url       print the current public URL
#   ops/tunnel/quick.sh --status    unit state, URL, tunnel metrics, game /status one-liner
#   ops/tunnel/quick.sh --stop      KILL SWITCH: stop the tunnel (the game keeps running on the LAN)
#   ops/tunnel/quick.sh --uninstall stop + remove the user unit
#
# Runs as radgh, no sudo. Installing cloudflared itself needs sudo once: docs/requests.md "H -> Lead (sudo)" M3.
# Gate: `sudo ops/lib/check-public.sh --mode quick` writes /run/thousandvale-public-ok (build + time). --start refuses
# when that stamp is missing, older than 1 hour, for another mode, or for a build other than the one live on 8490.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UNIT=thousandvale-quick-tunnel
UDIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
STAMP=/run/thousandvale-public-ok
PORT=8490

need_cf() { CF="$(command -v cloudflared || true)"; [[ -n "$CF" ]] || { echo "cloudflared is not installed — the lead runs the sudo lines in docs/requests.md (H -> Lead (sudo), M3)" >&2; exit 1; }; }
live_build() { curl -fsS --max-time 3 "http://127.0.0.1:$PORT/status" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).build||"")}catch{console.log("")}})'; }
url() {
  local since; since="$(systemctl --user show "$UNIT" -p ActiveEnterTimestamp --value 2>/dev/null)"
  [[ -n "$since" && "$since" != "n/a" ]] || return 1
  journalctl --user -u "$UNIT" --since "$since" --no-pager -o cat 2>/dev/null | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | tail -1
}

case "${1:-}" in
  --install)
    need_cf
    mkdir -p "$UDIR"
    sed "s#@CLOUDFLARED@#$CF#" "$HERE/$UNIT.service" > "$UDIR/$UNIT.service"
    systemctl --user daemon-reload
    echo "installed $UDIR/$UNIT.service (not enabled, not started)"
    echo "next: sudo $HERE/../lib/check-public.sh --mode quick   then   $0 --start" ;;
  --start)
    need_cf
    [[ -f "$UDIR/$UNIT.service" ]] || { echo "run $0 --install first" >&2; exit 1; }
    [[ -r "$STAMP" ]] || { echo "refusing: no pass from check-public. Run: sudo $HERE/../lib/check-public.sh --mode quick" >&2; exit 1; }
    read -r s_mode s_build s_time < "$STAMP"
    now=$(date +%s); live="$(live_build)"
    [[ "$s_mode" == quick || "$s_mode" == named ]] || { echo "refusing: stamp mode '$s_mode'" >&2; exit 1; }
    (( now - s_time < 3600 )) || { echo "refusing: check-public passed $(( (now - s_time) / 60 )) min ago — run it again" >&2; exit 1; }
    [[ -n "$live" && "$live" == "$s_build" ]] || { echo "refusing: check-public passed for build '$s_build' but 8490 runs '$live' — run it again" >&2; exit 1; }
    systemctl --user start "$UNIT"
    for _ in $(seq 1 40); do u="$(url || true)"; [[ -n "$u" ]] && break; sleep 1; done
    if [[ -n "${u:-}" ]]; then
      echo "== PUBLIC: $u/"
      echo "   kill switch: $0 --stop"
    else
      echo "!! no URL after 40 s — journalctl --user -u $UNIT -n 40"; exit 1
    fi ;;
  --url) u="$(url || true)"; [[ -n "$u" ]] && echo "$u/" || { echo "the quick tunnel is not running" >&2; exit 1; } ;;
  --status)
    systemctl --user --no-pager status "$UNIT" 2>/dev/null | head -5 || true
    echo "url: $(url || echo '(not running)')"
    curl -fsS --max-time 2 http://127.0.0.1:20241/metrics 2>/dev/null | grep -E '^cloudflared_tunnel_(ha_connections|total_requests|request_errors|concurrent_requests_per_tunnel) ' || true
    curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(`game: build ${j.build} ccu ${j.ccu} tick p99 ${j.tick&&j.tick.p99} max ${j.tick&&j.tick.max} human-check ${j.human}`)})' || echo "game: not answering on $PORT" ;;
  --stop) systemctl --user stop "$UNIT" && echo "tunnel stopped — the public link is dead; the game still runs on the LAN" ;;
  --uninstall) systemctl --user stop "$UNIT" 2>/dev/null || true; rm -f "$UDIR/$UNIT.service"; systemctl --user daemon-reload; echo "removed" ;;
  *) sed -n 2,16p "$0"; exit 2 ;;
esac
