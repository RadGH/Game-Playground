# shellcheck shell=bash disable=SC2034
# Thousandvale VPS helpers, sourced by install.sh, deploy.sh and rollback.sh (stream H). Runs on the VM.
# Reads ops/vps/target.env (or the file in TV_VPS_ENV). Test hooks (tests/H/vps.test.js drives a fake target on
# this machine): TV_VPS_SSH (the ssh command), TV_VPS_ROOT (/srv/thousandvale), TV_VPS_PORT (8490),
# TV_VPS_RESTART (the restart command run on the VPS), TV_VPS_WAIT (seconds to wait for /healthz, 60), TV_VPS_SKIP_HTTPS=1 (skip the public https check).
VPS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GAME_DIR="$(cd "$VPS_DIR/../.." && pwd)"
ENV_PATH="${TV_VPS_ENV:-$VPS_DIR/target.env}"
[[ -f "$ENV_PATH" ]] || { echo "no $ENV_PATH — copy ops/vps/target.env.template to ops/vps/target.env and fill it in" >&2; exit 2; }
# shellcheck disable=SC1090
. "$ENV_PATH"
: "${TV_VPS_HOST:?TV_VPS_HOST missing in $ENV_PATH}"
TV_VPS_KEY="${TV_VPS_KEY:-$HOME/.ssh/thousandvale_vps}"; TV_VPS_KEY="${TV_VPS_KEY/#\~/$HOME}"
ROOT="${TV_VPS_ROOT:-/srv/thousandvale}"
PORT="${TV_VPS_PORT:-8490}"
RESTART="${TV_VPS_RESTART:-sudo -n systemctl restart thousandvale.service}"
SSH_OPTS=(-i "$TV_VPS_KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=20)
if [[ -n "${TV_VPS_SSH:-}" ]]; then read -r -a SSH_CMD <<< "$TV_VPS_SSH"; else SSH_CMD=(ssh "${SSH_OPTS[@]}"); fi
# on <user>  (script on stdin) — run a script on the VPS as <user>
on() { "${SSH_CMD[@]}" "$1@$TV_VPS_HOST" bash -s; }
q() { printf '%q' "$1"; }

# switch_script <release name> <expected build> — prints a script for the VPS: point `current` at the release,
# restart the game, wait for /healthz and check /status reports the build; if it does not come up, point `current`
# back at the release that was live before and restart again (exit 1). Keeps the newest 3 releases + the live one.
switch_script() {
  cat <<SCRIPT
set -euo pipefail
ROOT=$(q "$ROOT"); NAME=$(q "$1"); WANT=$(q "$2"); PORT=$(q "$PORT"); RESTART=$(q "$RESTART"); WAIT=$(q "${TV_VPS_WAIT:-60}")
SCRIPT
  cat <<'SCRIPT'
cd "$ROOT"
[[ -f "releases/$NAME/BUILD" ]] || { echo "!! no release $NAME on the VPS"; exit 1; }
PREV="$(readlink -e current 2>/dev/null || true)"
ln -sfn "$ROOT/releases/$NAME" current.new && mv -T current.new current
echo "== switched current -> $NAME; restarting the game"
eval "$RESTART"
up=0
for i in $(seq 1 "$WAIT"); do curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && { up=1; break; }; sleep 1; done
LIVE="$(curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | /opt/thousandvale/node/bin/node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).build)}catch{console.log("")}})' 2>/dev/null || true)"
[[ -n "$LIVE" ]] || LIVE="$(curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | sed -n 's/.*"build":"\([^"]*\)".*/\1/p' || true)"
if [[ $up == 1 && "$LIVE" == "$WANT" ]]; then
  echo "== live on the VPS: build $LIVE"
  KEEP="$(readlink -f current)"
  ls -1dt "$ROOT"/releases/*/ 2>/dev/null | sed 's:/$::' | { grep -vxF "$KEEP" || true; } | tail -n +4 | xargs -r rm -rf
  exit 0
fi
echo "!! the release did not come up (healthz=$up, build='$LIVE')"
if [[ -n "$PREV" && -d "$PREV" && "$PREV" != "$(readlink -f current)" ]]; then
  ln -sfn "$PREV" current.new && mv -T current.new current
  eval "$RESTART"
  echo "!! rolled back to $(basename "$PREV")"
fi
echo "   on the VPS: sudo journalctl -u thousandvale -n 50"
exit 1
SCRIPT
}

# https_check <build> — from the VM, ask the public address (warn only: DNS may not be pointed yet)
https_check() {
  [[ "${TV_VPS_SKIP_HTTPS:-0}" == 1 || -z "${TV_VPS_DOMAIN:-}" ]] && return 0
  local b; b="$(curl -fsS --max-time 15 "https://$TV_VPS_DOMAIN/status" 2>/dev/null | sed -n 's/.*"build":"\([^"]*\)".*/\1/p' || true)"
  if [[ "$b" == "$1" ]]; then echo "== https://$TV_VPS_DOMAIN/ answers with build $b"
  else echo "   (https://$TV_VPS_DOMAIN/ did not answer with build $1 yet — DNS not pointed, or the certificate is still being issued; see docs/HOSTING.md §3)"; fi
}
