#!/usr/bin/env bash
# Thousandvale — put the VPS back on an earlier release (stream H, docs/HOSTING.md). Runs on the VM as radgh.
#   ops/vps/rollback.sh            # back to the release before the live one
#   ops/vps/rollback.sh --list     # show the releases kept on the VPS (newest first; the live one is marked)
#   ops/vps/rollback.sh <name>     # a specific release from --list
# Releases are code only: the database is not touched, so nobody loses characters or items by rolling back.
set -euo pipefail
. "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
LISTING="$(on tvdeploy <<<"cd $(q "$ROOT") && L=\$(readlink -f current 2>/dev/null || true); for d in \$(ls -1dt releases/*/ 2>/dev/null); do d=\${d%/}; [[ -f \$d/BUILD ]] || continue; m=' '; [[ \$(readlink -f \$d) == \"\$L\" ]] && m='*'; echo \"\$m \$(basename \$d) \$(cat \$d/BUILD)\"; done")"
if [[ "${1:-}" == "--list" ]]; then echo "$LISTING"; exit 0; fi
if [[ -n "${1:-}" ]]; then TARGET="$1"
else TARGET="$(awk 'f && $1 != "*" {print $1; exit} $1 == "*" {f=1}' <<<"$LISTING")"; fi
[[ -n "$TARGET" ]] || { echo "no earlier release on the VPS to go back to"; echo "$LISTING"; exit 1; }
LINE="$(awk -v t="$TARGET" '{n=($1=="*")?$2:$1; b=($1=="*")?$3:$2; if (n==t) print b}' <<<"$LISTING")"
[[ -n "$LINE" ]] || { echo "no release $TARGET on the VPS:"; echo "$LISTING"; exit 1; }
echo "== rolling back to $TARGET (build $LINE)"
switch_script "$TARGET" "$LINE" | on tvdeploy
https_check "$LINE"
