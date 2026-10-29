#!/usr/bin/env bash
# Publish a TESTED commit of Roverlands to the STABLE server (port 8550, https 8552) — the LAN testing copy.
#   prototypes/roverlands/tools/publish-roverlands.sh [<ref>]
# Knockabout's script with Roverlands' lists: it builds from `git archive <commit>` (never the working tree), refuses a
# commit whose .js does not parse or whose unit tests fail, keeps server-side files out of what is served, switches in
# one rename, restarts the user unit, checks /status shows the new build, and rolls back if it does not come up.
#   ~/.local/share/roverlands/releases/<sha>-<time>/{app,public,BUILD}    current -> the live one (3 newest kept)
# The PUBLIC game (games.radgh.com) is deployed from GitHub by the RGS repo, not by this script (~/claude/docs/rgs.md).
set -euo pipefail
GAME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; PLAY="$(cd "$GAME/../.." && pwd)"
REF="${1:-HEAD}"; SHA="$(git -C "$PLAY" rev-parse --verify "$REF^{commit}")"; SHORT="${SHA:0:10}"
BASE="$HOME/.local/share/roverlands"; PORT=8550
# exactly what server/static.js ALLOWs, plus the server's own imports (Tumblefair's feedback, insights and rgs modules,
# Knockabout's accounts module and the protocol it reads names/looks with)
ALLOW=(prototypes/roverlands prototypes/knockabout/js/client prototypes/tumblefair/js/client/look-tidy.js prototypes/tumblefair/js/client/qr.js prototypes/tumblefair/data/cosmetics.json
  prototypes/thousandvale/data/rules/classes-tv.json prototypes/emberveil/data/class-looks.json
  prototypes/thousandvale/js shared avatar-3d avatar-2d highdef-3d/js highdef-3d/assets highdef-3d/data vendor/three vendor/rapier vendor/qrcode-generator vendor/meshopt sfx assets
  prototypes/tumblefair/server/feedback.mjs prototypes/tumblefair/server/insights.mjs prototypes/tumblefair/server/rgs.mjs
  prototypes/knockabout/server/accounts.js prototypes/knockabout/js/net/protocol.js)
NOT_PUBLIC=(prototypes/roverlands/server prototypes/roverlands/ops prototypes/roverlands/tests prototypes/roverlands/tools prototypes/roverlands/docs
  prototypes/roverlands/package.json prototypes/roverlands/package-lock.json prototypes/tumblefair/server prototypes/knockabout/server prototypes/knockabout/js/net
  prototypes/thousandvale/js/sim prototypes/thousandvale/js/net prototypes/roverlands/assets/ref avatar-3d/kestrel)
echo "== publishing $SHORT ($(git -C "$PLAY" log -1 --format=%s "$SHA"))"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PRESENT=(); for p in "${ALLOW[@]}"; do git -C "$PLAY" cat-file -e "$SHA:$p" 2>/dev/null && PRESENT+=("$p"); done
git -C "$PLAY" archive "$SHA" -- "${PRESENT[@]}" | tar -x -C "$TMP"
[[ -f "$TMP/prototypes/roverlands/server/main.mjs" ]] || { echo "refusing: that commit has no Roverlands server"; exit 1; }
echo "== gate: node --check"
BAD=0; while IFS= read -r f; do node --check "$f" >/dev/null 2>&1 || { echo "   syntax error: ${f#$TMP/}"; BAD=1; }; done < <(find "$TMP/prototypes/roverlands" \( -name '*.js' -o -name '*.mjs' \) -not -path '*/node_modules/*')
[[ $BAD == 0 ]] || { echo "refusing: that commit does not parse"; exit 1; }
echo "== gate: unit tests"
ln -s "$GAME/node_modules" "$TMP/prototypes/roverlands/node_modules"
node --test "$TMP"/prototypes/roverlands/tests/*.test.js > "$TMP/test.log" 2>&1 || { grep -E '^not ok|# (pass|fail)' "$TMP/test.log" | head; echo "refusing: unit tests fail"; exit 1; }
grep -E '^# (pass|fail)' "$TMP/test.log" | sed 's/^/   /'; rm -f "$TMP/test.log" "$TMP/prototypes/roverlands/node_modules"
REL="$BASE/releases/$SHORT-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$REL/app" "$REL/public" "$BASE/stable"
cp -a "$TMP"/. "$REL/app/"; cp -a "$GAME/node_modules" "$REL/app/prototypes/roverlands/node_modules"; echo "$SHORT" > "$REL/BUILD"
cp -al "$REL/app"/. "$REL/public/"
for p in "${NOT_PUBLIC[@]}" prototypes/roverlands/node_modules; do rm -rf "$REL/public/$p"; done
find "$REL/public" -name ".*" -not -name "." -prune -exec rm -rf {} +
find "$REL/public" -type d \( -name tests -o -name test-results -o -name research \) -prune -exec rm -rf {} +   # nobody needs other folders' tests
echo "== gate: public copy contents"
LEAK="$(cd "$REL/public" && find . \( -name '*.mjs' -path '*server*' -o -name 'package*.json' -o -name '.*' -o -name node_modules -o -path '*/tests/*' -o -name '*.service' -o -name '*.sh' \) -print | grep -v '^\.$' | head -5 || true)"
[[ -z "$LEAK" ]] || { echo "refusing: server-side files in the public copy:"; echo "$LEAK"; rm -rf "$REL"; exit 1; }
echo "   $(find "$REL/public" -type f | wc -l) files public"
PREV="$(readlink "$BASE/current" 2>/dev/null || true)"
ln -sfn "$REL" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"
systemctl --user enable roverlands >/dev/null 2>&1 || true
systemctl --user restart roverlands
for _ in $(seq 1 30); do B="$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).build)}catch{}})' || true)"; [[ "$B" == "$SHORT" ]] && break; sleep 1; done
if [[ "${B:-}" != "$SHORT" ]]; then
  echo "!! the new build did not come up — rolling back"; [[ -n "$PREV" ]] && { ln -sfn "$PREV" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"; systemctl --user restart roverlands; }; exit 1
fi
ls -1dt "$BASE"/releases/* | tail -n +4 | xargs -r rm -rf
IP="$(hostname -I | awk '{print $1}')"
echo "== live: build $SHORT on :$PORT   http://$IP:$PORT/   (gamepads: https://$IP:8552/)"
