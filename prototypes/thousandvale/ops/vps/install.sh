#!/usr/bin/env bash
# SUPERSEDED 2026-10-14: production runs on the RGS droplet, deployed from ~/claude/rads-game-server (see ~/claude/docs/rgs.md).
# =====================================================================================================
# Thousandvale — set up a fresh Ubuntu 24.04 VPS from this VM, in one command (stream H, docs/HOSTING.md).
# Runs on the VM as radgh. Uploads ops/vps/bootstrap.sh + the unit files and backup scripts it needs, then runs it
# on the VPS as root over SSH. Safe to run again (e.g. after changing the Caddyfile or a unit).
#
#   ops/vps/install.sh --print-key   # 1. show the public key to paste into the VPS provider when creating the server
#   ops/vps/install.sh               # 2. set the VPS up (reads ops/vps/target.env)
#   ops/vps/install.sh --dry-run     # build the upload bundle and run the bootstrap's --dry-run HERE; touches nothing remote
#
# TV_VPS_ADMIN (default root): the login that can become root on the VPS. Use e.g. `ubuntu` on providers that
# do not allow root logins; it must have passwordless sudo (their default).
# =====================================================================================================
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
ADMIN="${TV_VPS_ADMIN:-root}"
MODE=run
case "${1:-}" in --print-key) MODE=key ;; --dry-run) MODE=dry ;; "") ;; *) echo "unknown option $1" >&2; exit 2 ;; esac

if [[ ! -f "$TV_VPS_KEY" ]]; then
  [[ $MODE == dry ]] && { echo "   (no key at $TV_VPS_KEY yet; --print-key makes one)"; } || {
    mkdir -p "$(dirname "$TV_VPS_KEY")"; chmod 700 "$(dirname "$TV_VPS_KEY")"
    ssh-keygen -q -t ed25519 -N "" -C "thousandvale-deploy@$(hostname)" -f "$TV_VPS_KEY"
    echo "== made a new SSH key for the VPS: $TV_VPS_KEY"; }
fi
if [[ $MODE == key ]]; then
  echo "Paste this ONE line into your VPS provider's \"SSH keys\" box when you create the server"
  echo "(and/or into /root/.ssh/authorized_keys on an existing one):"; echo; cat "$TV_VPS_KEY.pub"; exit 0
fi
: "${TV_VPS_DOMAIN:?TV_VPS_DOMAIN missing in $ENV_PATH}"; : "${TV_VPS_EMAIL:?TV_VPS_EMAIL missing in $ENV_PATH}"

# the bundle: the same layout as the repo (ops/ and ops/vps/), only the files the bootstrap reads
B="$(mktemp -d)"; trap 'rm -rf "$B"' EXIT
OPS="$GAME_DIR/ops"
mkdir -p "$B/ops/vps" "$B/ops/lib"
cp "$OPS"/vps/{bootstrap.sh,check-vps.sh,Caddyfile.template,thousandvale.service,thousandvale-localhost-only.conf,postgres-small.conf} "$B/ops/vps/"
cp "$OPS"/{stable.env.template,offsite.env.template} "$OPS"/thousandvale-{backup,drill,offsite}.{service,timer} "$B/ops/"
cp "$OPS"/lib/{backup.sh,restore-drill.sh,conservation.sql,offsite-upload.mjs} "$B/ops/lib/"
[[ -f "$TV_VPS_KEY.pub" ]] && cp "$TV_VPS_KEY.pub" "$B/deploy.pub"
echo "== bundle: $(find "$B" -type f | wc -l) files"

if [[ $MODE == dry ]]; then
  bash "$B/ops/vps/bootstrap.sh" --domain "$TV_VPS_DOMAIN" --email "$TV_VPS_EMAIL" --deploy-key /root/thousandvale-ops/deploy.pub --dry-run
  echo "== dry run: would upload to $ADMIN@$TV_VPS_HOST:/root/thousandvale-ops and run the above as root"; exit 0
fi
[[ -f "$B/deploy.pub" ]] || { echo "no public key $TV_VPS_KEY.pub" >&2; exit 1; }
SUDO=""; [[ "$ADMIN" == root ]] || SUDO="sudo -n"
echo "== uploading to $ADMIN@$TV_VPS_HOST"
tar -C "$B" -czf - . | "${SSH_CMD[@]}" "$ADMIN@$TV_VPS_HOST" "$SUDO rm -rf /root/thousandvale-ops && $SUDO mkdir -p -m 0700 /root/thousandvale-ops && $SUDO tar -xzf - -C /root/thousandvale-ops --no-same-owner"
echo "== running the bootstrap on the VPS (a fresh box takes 3-6 minutes)"
"${SSH_CMD[@]}" "$ADMIN@$TV_VPS_HOST" "$SUDO bash /root/thousandvale-ops/ops/vps/bootstrap.sh --domain $(q "$TV_VPS_DOMAIN") --email $(q "$TV_VPS_EMAIL") --deploy-key /root/thousandvale-ops/deploy.pub"
echo "== done. Next: ops/vps/deploy.sh"
