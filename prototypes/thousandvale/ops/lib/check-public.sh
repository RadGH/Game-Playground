#!/usr/bin/env bash
# Thousandvale — the PLAN §11 security checklist as a script. It MUST pass before any tunnel is started.
#
#   sudo ops/lib/check-public.sh --mode quick                    first test: trycloudflare quick tunnel (owner decision 2026-10-05)
#   sudo ops/lib/check-public.sh --mode named --confirm-manual   later: own hostname; --confirm-manual = the lead has done the
#                                                                MANUAL items it prints (Cloudflare dashboard settings)
#   add --tests  to also re-run the evil-client + fuzz suites from the live release (they already ran in the publish gate)
#
# Read-only except for one file: on a pass it writes /run/thousandvale-public-ok ("<mode> <build> <epoch>"), which
# ops/tunnel/quick.sh --start requires (fresh within 1 h, same build as live). A failed run deletes it.
# Result lines: ok / FAIL (blocks) / WARN (allowed in this mode, written down) / MANUAL (needs --confirm-manual).
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo" >&2; exit 1; }
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME="$(cd "$HERE/../.." && pwd)"
MODE=""; CONFIRM=0; TESTS=0
while [[ $# -gt 0 ]]; do case "$1" in --mode) MODE="$2"; shift ;; --confirm-manual) CONFIRM=1 ;; --tests) TESTS=1 ;; *) echo "unknown $1" >&2; exit 2 ;; esac; shift; done
[[ "$MODE" == quick || "$MODE" == named ]] || { echo "usage: sudo $0 --mode quick|named [--confirm-manual] [--tests]" >&2; exit 2; }
U="${SUDO_USER:-radgh}"; UH="/home/$U"
STAMP=/run/thousandvale-public-ok; rm -f "$STAMP"
NODE=/opt/thousandvale/node/bin/node; [[ -x $NODE ]] || NODE="$(command -v node || true)"
CUR=/srv/thousandvale/current; PUB="$CUR/public"
DROP=/etc/systemd/system/thousandvale.service.d
LANIP="$(hostname -I | awk '{print $1}')"
cd /
FAILED=0; MANUAL=0
ok()   { echo "   ok     $1"; }
bad()  { echo "   FAIL   $1"; FAILED=1; }
warn() { echo "   WARN   $1"; }
man()  { echo "   MANUAL $1"; MANUAL=1; }
check() { local w="$1"; shift; if "$@" >/dev/null 2>&1; then ok "$w"; else bad "$w"; fi; }
nott()  { local w="$1"; shift; if "$@" >/dev/null 2>&1; then bad "$w"; else ok "$w"; fi; }
prop()  { systemctl show thousandvale -p "$1" --value 2>/dev/null; }
echo "== Thousandvale public-link checklist — mode: $MODE — $(date -u +%FT%TZ)"

echo "-- §11.1 user, service, secrets (ops/lib/check-stable.sh)"
if "$HERE/check-stable.sh" | sed 's/^/  /'; then ok "check-stable passed"; else bad "check-stable failed (above)"; fi
check "service runs as user thousandvale"                 test "$(prop User)" = thousandvale
check "ProtectHome=yes"                                    test "$(prop ProtectHome)" = yes
check "ProtectSystem=strict"                               test "$(prop ProtectSystem)" = strict
check "NoNewPrivileges=yes"                                test "$(prop NoNewPrivileges)" = yes
check "PrivateTmp=yes"                                     test "$(prop PrivateTmp)" = yes
check "ReadOnlyPaths covers /srv/thousandvale"             sh -c "systemctl show thousandvale -p ReadOnlyPaths --value | grep -q /srv/thousandvale"
EXE="$(systemctl show thousandvale -p ExecStart --value)"
check "serves only the published folder (--public $PUB)"  sh -c "echo \"\$0\" | grep -q -- '--public /srv/thousandvale/current/public'" "$EXE"
check "runs --env stable --db pg"                          sh -c "echo \"\$0\" | grep -q -- '--env stable' && echo \"\$0\" | grep -q -- '--db pg'" "$EXE"
SCORE="$(systemd-analyze security thousandvale 2>/dev/null | tail -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)"
[[ -n "$SCORE" ]] && echo "   info   systemd-analyze security exposure: $SCORE (lower is safer)"
nott  "no Thousandvale secret file is tracked by git"      sh -c "cd '$GAME' && git ls-files | grep -E '(^|/)(\.env|.*\.env|stable\.env|offsite\.env|.*\.pass|.*tunnel.*\.json|cert\.pem)$' | grep -vE 'template|example'"

echo "-- §11.2 approved copy"
if [[ -d "$PUB" ]]; then
  for d in server ops tests docs tools; do nott "public/ has no prototypes/thousandvale/$d" test -e "$PUB/prototypes/thousandvale/$d"; done
  nott  "public/ has no dotfiles or node_modules"          sh -c "find '$PUB' \\( -name '.*' -o -name node_modules \\) | grep -q ."
  check "public/ holds the privacy note"                   test -s "$PUB/prototypes/thousandvale/public/privacy.html"
  nott  "no secret-looking strings in the release"         sh -c "grep -rIl -E 'PGPASSWORD=[A-Za-z0-9]{8}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|TV_TURNSTILE_SECRET=0x[0-9A-Za-z]{20}|TV_OFFSITE_SECRET=[A-Za-z0-9/+]{20}|AccountTag' '$CUR' 2>/dev/null | grep -v /node_modules/ | grep -q ."
else bad "no published release at $CUR (tools/publish-thousandvale.sh)"; fi
BUILD="$(cat "$CUR/BUILD" 2>/dev/null)"
LIVE="$(curl -fsS --max-time 3 http://127.0.0.1:8490/status 2>/dev/null | "$NODE" -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.build+" "+j.human+" "+j.env)}catch{console.log("")}})')"
read -r LBUILD LHUMAN LENV <<<"$LIVE"
check "8490 is up and runs the published build ($BUILD)"   test -n "$BUILD" -a "$LBUILD" = "$BUILD"
check "8490 reports env stable"                            test "$LENV" = stable

echo "-- live probes (ops/lib/probe-public.mjs: 404s, traversal, payload cap, Origin, per-IP cap, CF header trust)"
if [[ -n "$NODE" ]] && "$NODE" "$HERE/probe-public.mjs" --base http://127.0.0.1:8490 --lan "http://$LANIP:8490"; then ok "all live probes passed"; else bad "a live probe failed (above)"; fi

echo "-- §11.3 tunnel: one origin, nothing else"
CF="$(command -v cloudflared || true)"
check "cloudflared is installed"                           test -n "$CF"
if [[ "$MODE" == quick ]]; then
  UNITF="$UH/.config/systemd/user/thousandvale-quick-tunnel.service"
  check "quick tunnel unit installed (ops/tunnel/quick.sh --install)" test -f "$UNITF"
  if [[ -f "$UNITF" ]]; then
    check "its only origin is http://127.0.0.1:8490"        sh -c "grep '^ExecStart=' '$UNITF' | grep -qE -- '--url http://127\\.0\\.0\\.1:8490\$' && [ \$(grep -o -- '--url' '$UNITF' | wc -l) = 1 ]"
    nott  "it is not enabled at boot"                        test -e "$UH/.config/systemd/user/default.target.wants/thousandvale-quick-tunnel.service"
  fi
  for f in "$UH/.cloudflared/config.yml" "$UH/.cloudflared/config.yaml" /etc/cloudflared/config.yml /etc/cloudflared/config.yaml /usr/local/etc/cloudflared/config.yml; do
    nott "no default cloudflared config that a quick tunnel would read ($f)" test -e "$f"
  done
else
  Y=/etc/cloudflared/thousandvale.yml
  check "named config installed ($Y)"                      test -f "$Y"
  if [[ -f "$Y" && -n "$CF" ]]; then
    HOSTN="$(awk '/hostname:/{print $3; exit}' "$Y")"
    check "cloudflared validates the ingress"               "$CF" tunnel --config "$Y" ingress validate
    check "$HOSTN routes to 127.0.0.1:8490"                 sh -c "'$CF' tunnel --config '$Y' ingress rule 'https://$HOSTN/gw' | grep -q 'http://127.0.0.1:8490'"
    check "any other hostname gets 404"                     sh -c "'$CF' tunnel --config '$Y' ingress rule 'https://x.$HOSTN/' | grep -q 'http_status:404'"
    check "exactly one origin service in the config"        test "$(grep -cE '^\s*-?\s*service:' "$Y")" = 2
    nott  "no httpHostHeader (breaks the Origin check)"     grep -qi httpHostHeader "$Y"
    nott  "no playground/dev/admin/db/ssh port in the config" grep -qE ':(8400|8401|8491|8492|5432|22)\b' "$Y"
    check "credentials file is root 0600"                   test "$(stat -c '%U %a' /etc/cloudflared/thousandvale-tunnel.json 2>/dev/null)" = "root 600"
    check "tunnel unit runs as a DynamicUser"               test "$(systemctl show thousandvale-tunnel -p DynamicUser --value)" = yes
  fi
fi

echo "-- §11.4 bind addresses"
nott  "postgres is not on a public interface"              sh -c "ss -ltnH | awk '{print \$4}' | grep -E ':5432\$' | grep -vqE '^(127\\.0\\.0\\.1|\\[::1\\]):5432\$'"
if ss -ltnH | awk '{print $4}' | grep -qE ':8492$'; then
  nott "admin 8492 is bound to 127.0.0.1 only"            sh -c "ss -ltnH | awk '{print \$4}' | grep -E ':8492\$' | grep -vqE '^(127\\.0\\.0\\.1|\\[::1\\]):8492\$'"
elif [[ "$MODE" == named ]]; then bad "admin page (127.0.0.1:8492) is not running (M3 gate: stream A)"
else warn "admin page (8492) not running yet — friends test proceeds; moderation = stop the tunnel, ban by hand in SQL"; fi
if [[ "$MODE" == named ]]; then
  nott "8490 bound to localhost only (TV_HOST=127.0.0.1)"  sh -c "ss -ltnH | awk '{print \$4}' | grep -E ':8490\$' | grep -vqE '^(127\\.0\\.0\\.1|\\[::1\\]):8490\$'"
else
  echo "   info   8490 stays on the LAN too in quick mode (the owner plays on the LAN); the drop-in below drops non-LAN peers"
fi

echo "-- §11.5/§11.6 limits and the human check"
GW="$CUR/app/prototypes/thousandvale/js/sim/gateway.js"
GPH="$(grep -oE 'guestsPerIpPerHour = [0-9]+' "$GW" 2>/dev/null | grep -oE '[0-9]+$')"
if [[ -n "$GPH" && "$GPH" -le 20 ]]; then ok "new guest accounts capped at $GPH per address per hour"; else bad "guest-per-address cap missing or > 20 ('$GPH')"; fi
if [[ "$MODE" == quick ]]; then
  check "lan-only drop-in in place (the game process cannot call out)" test -f "$DROP/lan-only.conf"
  if [[ "$LHUMAN" == true ]]; then
    if [[ -f "$DROP/lan-only.conf" ]]; then bad "human check is ON but lan-only blocks siteverify — guests could not be created"; else ok "human check on"; fi
  else
    warn "human check (Turnstile) OFF — decided for the friends test: a quick-tunnel hostname changes every start, so a Turnstile widget cannot be pinned to it. Covered by: 4 sockets/address, $GPH new guests/address/hour, per-message rate limits, an unlisted link shared only with friends, and the kill switch"
  fi
else
  check "human check (Turnstile) is ON (/status human:true)" test "$LHUMAN" = true
  check "public-egress drop-in in place (same as the repo copy)" cmp -s "$DROP/public-egress.conf" "$HERE/../tunnel/named/public-egress.conf"
  nott  "lan-only drop-in removed (it would block siteverify)" test -f "$DROP/lan-only.conf"
  nott  "Turnstile keys are not Cloudflare's always-pass TEST keys" grep -qE '^TV_TURNSTILE_(SECRET|SITEKEY)=1x0' /etc/thousandvale/env
  for v in 4 6; do
    LIVEIPS="$(curl -fsS --max-time 5 "https://www.cloudflare.com/ips-v$v" 2>/dev/null | sort | tr '\n' ' ')"
    MINE="$(grep -A1 "^# cloudflare-v$v" "$HERE/../tunnel/named/public-egress.conf" 2>/dev/null | tail -1 | sed 's/^IPAddressAllow=//' | tr ' ' '\n' | sort | tr '\n' ' ')"
    if [[ -z "$LIVEIPS" ]]; then warn "could not fetch Cloudflare's ips-v$v to compare"
    elif [[ "$LIVEIPS" == "$MINE" ]]; then ok "public-egress Cloudflare v$v ranges are current"
    else bad "Cloudflare v$v ranges changed — update ops/tunnel/named/public-egress.conf and reinstall"; fi
  done
fi

echo "-- §9.6 backups"
check "hourly backup timer active"                          systemctl is-active --quiet thousandvale-backup.timer
check "newest local dump is under 2 hours old"              sh -c "find /var/backups/thousandvale/hourly -name '*.dump' -mmin -120 | grep -q ."
check "the restore drill passed in the last 8 days"         sh -c "journalctl -u thousandvale-drill --since '-8 days' --no-pager -o cat | grep -q 'DRILL PASSED'"
if [[ -f /etc/thousandvale/offsite.env ]]; then
  check "off-machine copy uploaded in the last 2 days"      sh -c "journalctl -u thousandvale-offsite --since '-2 days' --no-pager -o cat | grep -q 'offsite ok'"
elif [[ "$MODE" == named ]]; then bad "off-machine backups not configured (owner's bucket; ops/offsite.env.template)"
else warn "off-machine backups not configured yet (owner's bucket) — friends test proceeds on local hourly+daily copies"; fi

echo "-- §11.8 server never trusts the client"
echo "   info   evil-client + fuzz suites ran in the publish gate for build $BUILD (tools/publish-thousandvale.sh)"
if [[ $TESTS == 1 ]]; then
  OUT="$(sudo -u "$U" sh -c "cd '$CUR/app/prototypes/thousandvale' && '$NODE' --test tests/A/evil.test.js tests/A/fuzz.test.js" 2>&1)"; RC=$?
  echo "$OUT" | grep -E '^# (pass|fail)' | sed 's/^/   info   /'
  [[ $RC == 0 ]] && ok "evil + fuzz green on the live release" || bad "evil/fuzz red on the live release"
fi

echo "-- kill switch"
if [[ "$MODE" == quick ]]; then echo "   info   ops/tunnel/quick.sh --stop   (as $U, no sudo)   — full rollback: sudo ops/tunnel/rollback.sh"
else echo "   info   sudo systemctl stop thousandvale-tunnel   — full rollback: sudo ops/tunnel/rollback.sh"; fi

if [[ "$MODE" == named ]]; then
  echo "-- manual (Cloudflare dashboard; cannot be seen from this machine)"
  man "WAF -> Rate limiting rule on the hostname: requests not to /gw or /p/*, 100 per 10 s per IP -> block 10 s"
  man "Turnstile widget lists ONLY the game hostname; mode Managed"
  man "The DNS record for the hostname is the tunnel CNAME (proxied, orange cloud) and nothing else points at this house"
  man "public/privacy.html names a contact address for deletion requests (owner's choice) — the friends wording is not enough for strangers"
  [[ $CONFIRM == 1 ]] && ok "manual items confirmed by the lead (--confirm-manual)" || bad "manual items not confirmed (re-run with --confirm-manual once done)"
fi

if [[ $FAILED == 0 ]]; then
  echo "$MODE $BUILD $(date +%s)" > "$STAMP"; chmod 0644 "$STAMP"
  echo "== PASSED ($MODE) for build $BUILD — stamp written; the tunnel may be started within 1 hour"
else
  echo "== NOT READY — fix every FAIL above; no tunnel"; exit 1
fi
