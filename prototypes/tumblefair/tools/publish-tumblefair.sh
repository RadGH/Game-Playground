#!/usr/bin/env bash
# Publish a TESTED commit of Tumblefair to the STABLE server (port 8480) — the one the public link points at.
#   prototypes/tumblefair/tools/publish-tumblefair.sh [<ref>]
# Like Thousandvale's: it builds from `git archive <commit>` (never the working tree), refuses a commit whose .js does
# not parse or whose unit tests fail, keeps server-side files out of what is served, switches in one rename, restarts
# the user unit, checks /status shows the new build, and rolls back if it does not come up.
#   ~/.local/share/tumblefair/releases/<sha>-<time>/{app,public,BUILD}    current -> the live one (3 newest kept)
set -euo pipefail
GAME="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; PLAY="$(cd "$GAME/../.." && pwd)"; cd "$PLAY"
REF="${1:-HEAD}"; SHA="$(git rev-parse --verify "$REF^{commit}")"; SHORT="${SHA:0:10}"
BASE="$HOME/.local/share/tumblefair"; PORT=8480
# exactly what server/static.js ALLOWs, plus the server's own imports (thousandvale/js/sim/looks.js)
ALLOW=(prototypes/tumblefair prototypes/thousandvale/js shared avatar-3d avatar-2d vendor/three vendor/qrcode-generator sfx assets)
NOT_PUBLIC=(prototypes/tumblefair/server prototypes/tumblefair/ops prototypes/tumblefair/tests prototypes/tumblefair/tools prototypes/tumblefair/docs
  prototypes/tumblefair/package.json prototypes/tumblefair/package-lock.json prototypes/thousandvale/js/sim prototypes/thousandvale/js/net avatar-3d/kestrel)
echo "== publishing $SHORT ($(git log -1 --format=%s "$SHA"))"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PRESENT=(); for p in "${ALLOW[@]}"; do git cat-file -e "$SHA:$p" 2>/dev/null && PRESENT+=("$p"); done
git archive "$SHA" -- "${PRESENT[@]}" | tar -x -C "$TMP"
echo "== gate: node --check"
BAD=0; while IFS= read -r f; do node --check "$f" >/dev/null 2>&1 || { echo "   syntax error: ${f#$TMP/}"; BAD=1; }; done < <(find "$TMP/prototypes/tumblefair" \( -name '*.js' -o -name '*.mjs' \) -not -path '*/node_modules/*')
[[ $BAD == 0 ]] || { echo "refusing: that commit does not parse"; exit 1; }
echo "== gate: unit tests"
ln -s "$GAME/node_modules" "$TMP/prototypes/tumblefair/node_modules"
(cd "$TMP/prototypes/tumblefair" && node --test tests/*.test.js > "$TMP/test.log" 2>&1) || { grep -E '^not ok|# (pass|fail)' "$TMP/test.log" | head; echo "refusing: unit tests fail"; exit 1; }
grep -E '^# (pass|fail)' "$TMP/test.log" | sed 's/^/   /'; rm -f "$TMP/test.log" "$TMP/prototypes/tumblefair/node_modules"
REL="$BASE/releases/$SHORT-$(date -u +%Y%m%dT%H%M%SZ)"; mkdir -p "$REL/app" "$REL/public" "$BASE/stable"
cp -a "$TMP"/. "$REL/app/"; cp -a "$GAME/node_modules" "$REL/app/prototypes/tumblefair/node_modules"; echo "$SHORT" > "$REL/BUILD"
cp -al "$REL/app"/. "$REL/public/"
for p in "${NOT_PUBLIC[@]}" prototypes/tumblefair/node_modules prototypes/tumblefair/assets/inbox; do rm -rf "$REL/public/$p"; done
find "$REL/public" -name ".*" -not -name "." -prune -exec rm -rf {} +
find "$REL/public" -type d \( -name tests -o -name test-results -o -name research \) -prune -exec rm -rf {} +   # nobody needs other folders' tests
echo "== gate: public copy contents"
LEAK="$(cd "$REL/public" && find . \( -name '*.mjs' -path '*server*' -o -name 'package*.json' -o -name '.*' -o -name node_modules -o -path '*/tests/*' -o -name '*.service' -o -name '*.sh' \) -print | grep -v '^\.$' | head -5 || true)"
[[ -z "$LEAK" ]] || { echo "refusing: server-side files in the public copy:"; echo "$LEAK"; rm -rf "$REL"; exit 1; }
echo "   $(find "$REL/public" -type f | wc -l) files public"
PREV="$(readlink "$BASE/current" 2>/dev/null || true)"
ln -sfn "$REL" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"
systemctl --user restart tumblefair
for _ in $(seq 1 30); do B="$(curl -fsS --max-time 2 "http://127.0.0.1:$PORT/status" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).build)}catch{}})' || true)"; [[ "$B" == "$SHORT" ]] && break; sleep 1; done
if [[ "${B:-}" != "$SHORT" ]]; then
  echo "!! the new build did not come up — rolling back"; [[ -n "$PREV" ]] && { ln -sfn "$PREV" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"; systemctl --user restart tumblefair; }; exit 1
fi
ls -1dt "$BASE"/releases/* | tail -n +4 | xargs -r rm -rf
echo "== live: build $SHORT on :$PORT   http://$(hostname -I | awk '{print $1}'):$PORT/"
