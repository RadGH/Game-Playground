#!/usr/bin/env bash
# SUPERSEDED 2026-10-14: production runs on the RGS droplet, deployed from ~/claude/rads-game-server (see ~/claude/docs/rgs.md).
# =====================================================================================================
# Thousandvale — ship a PUBLISHED release from this VM to the VPS and restart it (stream H, docs/HOSTING.md).
# Runs on the VM as radgh. No sudo here; on the VPS it uses the tvdeploy account (key only), which may restart
# the game and nothing else (ops/vps/bootstrap.sh set that up).
#
#   ops/vps/deploy.sh                  # ship the release the LAN stable server runs now (/srv/thousandvale/current)
#   ops/vps/deploy.sh --ref <commit>   # build a fresh release from a commit first (same gates as publish: parse + unit tests)
#   ops/vps/deploy.sh --release <dir>  # ship a release folder you already built
#
# What happens:
#   1. picks/builds the release (tools/publish-thousandvale.sh --build-only, so the same allow-list, parse gate,
#      unit-test gate and secret scan as the LAN publish)
#   2. rsync over SSH into /srv/thousandvale/releases/<name>.part on the VPS — files whose CONTENT did not change since
#      the live release are hard-linked there, not sent again (compared by checksum, because every commit gives every
#      file a new date), then renamed to <name> once complete. An interrupted upload resumes from the .part folder.
#   3. switches /srv/thousandvale/current, restarts, waits for /healthz and the right build on /status;
#      if it does not come up, switches back to the previous release by itself (ops/vps/rollback.sh does it by hand)
#   4. asks https://<domain>/status from here
# =====================================================================================================
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
REL=""; REFARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --release) REL="$2"; shift 2 ;;
    --ref) REFARG="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done
if [[ -n "$REFARG" ]]; then
  STAGE="${TV_VPS_STAGE:-$HOME/.cache/thousandvale-vps}"; mkdir -p "$STAGE"
  TV_SRV="$STAGE" "$GAME_DIR/tools/publish-thousandvale.sh" --build-only "$REFARG"
  REL="$(ls -1dt "$STAGE"/releases/*/ | head -1)"
  ls -1dt "$STAGE"/releases/*/ | tail -n +4 | xargs -r rm -rf          # local staging keeps 3
fi
[[ -n "$REL" ]] || REL="/srv/thousandvale/current"
REL="$(readlink -f "$REL")"; NAME="$(basename "$REL")"
[[ -f "$REL/BUILD" && -d "$REL/app" && -d "$REL/public" ]] || { echo "not a release folder: $REL (needs BUILD, app/, public/)" >&2; exit 1; }
BUILD="$(cat "$REL/BUILD")"
echo "== shipping $NAME (build $BUILD, $(du -sh "$REL" | cut -f1)) to $TV_VPS_HOST"

LINK="$(on tvdeploy <<<"readlink -e $(q "$ROOT")/current 2>/dev/null || true")"
RSYNC_LINK=(); [[ -n "$LINK" ]] && RSYNC_LINK=(--link-dest="$LINK/")
printf -v RSH '%q ' "${SSH_CMD[@]}"
rsync -rlpH --chmod=u=rwX,g=rX,o= --checksum --delete --info=stats1 "${RSYNC_LINK[@]}" -e "$RSH" "$REL/" "tvdeploy@$TV_VPS_HOST:$ROOT/releases/$NAME.part/"
on tvdeploy <<SCRIPT
set -euo pipefail
cd $(q "$ROOT")/releases
chgrp -R thousandvale $(q "$NAME.part") 2>/dev/null || [[ -n $(q "${TV_VPS_FAKE:-}") ]] || { echo "!! cannot give the release to group thousandvale (is tvdeploy in it? re-run the bootstrap)"; exit 1; }
chmod -R u=rwX,g=rX,o= $(q "$NAME.part")
rm -rf $(q "$NAME"); mv -T $(q "$NAME.part") $(q "$NAME")
SCRIPT
switch_script "$NAME" "$BUILD" | on tvdeploy
https_check "$BUILD"
