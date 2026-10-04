#!/usr/bin/env bash
# =====================================================================================================
# Publish a TESTED commit of Thousandvale to the STABLE server (port 8490) — stream H, PLAN §11.2.
#
#   prototypes/thousandvale/tools/publish-thousandvale.sh            # publish HEAD
#   prototypes/thousandvale/tools/publish-thousandvale.sh <ref>      # publish a commit / branch
#   prototypes/thousandvale/tools/publish-thousandvale.sh --build-only [<ref>]   # build the release, don't switch
#   TV_SRV=/some/dir ... --build-only                                # build somewhere else (testing this script)
#
# Like tools/publish-stable.sh, it refuses a commit that does not parse or whose unit tests fail. It never
# serves the working tree: it builds an APPROVED COPY from `git archive <commit>` with an allow-list, so the
# stable server can only ever hand out files that were committed and that are meant for a browser.
#
#   /srv/thousandvale/releases/<sha>-<time>/
#     app/      what the server RUNS: the allow-listed playground folders + prototypes/thousandvale (with server/,
#               js/, data/) + the server's node_modules (pg, ws). Never served.
#     public/   what the server SERVES (A's --public): the same client folders minus server/, ops/, tests/,
#               docs/, tools/, research/, node_modules, package files, dotfiles. Hard links into app/ (no 2nd copy).
#     BUILD     the commit hash; the server's --build and the client's stamped build agree, so an old tab reloads.
#   /srv/thousandvale/current -> releases/<the live one>   (switched in one rename; the previous one is kept for
#                                                          rollback, the oldest beyond 3 are pruned)
# Then it restarts the unit (sudoers allows exactly that, ops/setup-stable.sh), waits for /healthz and checks
# /status reports the new build — and rolls back to the previous release if it does not come up.
# Runs as radgh. No other sudo.
# =====================================================================================================
set -euo pipefail
GAME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLAY="$(cd "$GAME_DIR/../.." && pwd)"
cd "$PLAY"

BUILD_ONLY=0; REF=HEAD
for a in "$@"; do case "$a" in --build-only) BUILD_ONLY=1 ;; -*) echo "unknown option $a" >&2; exit 2 ;; *) REF="$a" ;; esac; done
SRV="${TV_SRV:-/srv/thousandvale}"
PORT="${TV_PORT:-8490}"
SHA="$(git rev-parse --verify "$REF^{commit}")"; SHORT="${SHA:0:12}"
echo "== publishing $SHORT ($(git log -1 --format=%s "$SHA"))"

# The client imports from these playground folders (server/static.js ALLOW); everything else stays out.
ALLOW=(prototypes/thousandvale prototypes/farhold prototypes/emberveil prototypes/bannerline shared avatar-3d avatar-2d vendor
       assets worldgen proctown items namegen lingo conversations voice-lab sfx meters library/data universe highdef-3d)
PRESENT=(); for p in "${ALLOW[@]}"; do git cat-file -e "$SHA:$p" 2>/dev/null && PRESENT+=("$p"); done

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
git archive "$SHA" -- "${PRESENT[@]}" | tar -x -C "$TMP"

# ---- gate 1: every module parses (a half-written import is what takes a page down) ----
echo "== gate: node --check"
BAD=0
while IFS= read -r f; do node --check "$f" >/dev/null 2>&1 || { echo "   syntax error: ${f#$TMP/}"; BAD=1; }; done \
  < <(find "$TMP" \( -name '*.js' -o -name '*.mjs' \) -not -path '*/node_modules/*' -not -path '*/vendor/*')
[[ $BAD == 0 ]] || { echo "refusing: that commit does not parse"; exit 1; }

# ---- gate 2: Thousandvale's unit tests at that commit (not the load/perf tests: they need a quiet machine) ----
echo "== gate: unit tests"
[[ -d "$GAME_DIR/node_modules" ]] || { echo "run npm install in prototypes/thousandvale first"; exit 1; }
ln -s "$GAME_DIR/node_modules" "$TMP/prototypes/thousandvale/node_modules"
ln -s "$PLAY/node_modules" "$TMP/node_modules" 2>/dev/null || true
if [[ "${TV_SKIP_TESTS:-0}" == 1 ]]; then
  [[ $BUILD_ONLY == 1 ]] || { echo "TV_SKIP_TESTS is only for --build-only (testing this script)"; exit 2; }
  echo "   SKIPPED (TV_SKIP_TESTS=1, --build-only)"; TESTS=""
else
TESTS=$(cd "$TMP/prototypes/thousandvale" && ls tests/*/*.test.js 2>/dev/null | grep -v -E '^tests/load/|/bots[0-9]+\.test\.js$' || true)
if [[ -n "$TESTS" ]]; then
  (cd "$TMP/prototypes/thousandvale" && node --test --test-concurrency=4 $TESTS > "$TMP/test.log" 2>&1) \
    || { grep -E '^not ok|# (pass|fail)' "$TMP/test.log" | head -20; echo "refusing: unit tests fail at $SHORT (full log: rerun them)"; exit 1; }
  grep -E '^# (pass|fail)' "$TMP/test.log" | sed 's/^/   /'
fi
fi
rm -f "$TMP/prototypes/thousandvale/node_modules" "$TMP/node_modules"

# ---- build the release ----
REL="$SRV/releases/$SHORT-$(date -u +%Y%m%dT%H%M%SZ)"
echo "== build $REL"
mkdir -p "$REL/app"
rm -f "$TMP/test.log"
cp -a "$TMP"/. "$REL/app/"
# the server's own dependencies, exactly as installed for the tested tree
cp -a "$GAME_DIR/node_modules" "$REL/app/prototypes/thousandvale/node_modules"
echo "$SHORT" > "$REL/BUILD"

# public/: hard-linked subset of app/ — client files only
mkdir -p "$REL/public"
(cd "$REL/app" && find . -type f \
  -not -path '*/node_modules/*' -not -path '*/.*' \
  -not -path './prototypes/thousandvale/server/*' -not -path './prototypes/thousandvale/ops/*' \
  -not -path './prototypes/thousandvale/docs/*' -not -path './prototypes/thousandvale/tools/*' \
  -not -path '*/tests/*' -not -path '*/research/*' -not -path '*/tools/*' \
  -not -name 'package.json' -not -name 'package-lock.json' -not -name '*.env' -not -name 'env.example' \
  -print0) | (cd "$REL/app" && cpio -0 -pdl --quiet "$REL/public")

# stamp the client with the build so the handshake matches the server's --build
STAMPED=0
CB="$REL/public/prototypes/thousandvale/js/client/build.js"
if [[ -f "$CB" ]]; then
  rm -f "$CB"; printf "// stamped by tools/publish-thousandvale.sh\nexport const BUILD = '%s';\n" "$SHORT" > "$CB"; STAMPED=1
else
  MAIN="$REL/public/prototypes/thousandvale/js/client/main.js"
  if [[ -f "$MAIN" ]] && grep -q "q.get('build') || 'dev'" "$MAIN"; then
    cp --remove-destination "$MAIN" "$MAIN.tmp" && mv "$MAIN.tmp" "$MAIN"     # break the hard link before editing
    sed -i "s/q.get('build') || 'dev'/q.get('build') || '$SHORT'/" "$MAIN"; STAMPED=1
  fi
fi
[[ $STAMPED == 1 ]] || { echo "refusing: could not stamp the client build (js/client/build.js or main.js pattern missing)"; rm -rf "$REL"; exit 1; }

# ---- gate 3: nothing secret or server-side in what the public can fetch ----
echo "== gate: public copy contents"
LEAK=$(grep -rIl -E 'PGPASSWORD=[A-Za-z0-9]{8}|BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|TV_TURNSTILE_SECRET=0x[0-9A-Za-z]{20}' "$REL/public" "$REL/app" 2>/dev/null | grep -v '/node_modules/' || true)
[[ -z "$LEAK" ]] || { echo "refusing: possible secret in $LEAK"; rm -rf "$REL"; exit 1; }
for d in server ops tests docs tools; do [[ ! -e "$REL/public/prototypes/thousandvale/$d" ]] || { echo "refusing: public/ holds $d/"; rm -rf "$REL"; exit 1; }; done
[[ -z "$(find "$REL/public" -name '.*' -o -name node_modules | head -1)" ]] || { echo "refusing: dotfiles or node_modules in public/"; rm -rf "$REL"; exit 1; }
chmod -R u=rwX,g=rX,o= "$REL"
echo "   app $(du -sh "$REL/app" | cut -f1), public $(find "$REL/public" -type f | wc -l) files"

if [[ $BUILD_ONLY == 1 ]]; then echo "== built (not switched): $REL"; exit 0; fi

# ---- switch, restart, verify, roll back on failure ----
PREV="$(readlink -f "$SRV/current" 2>/dev/null || true)"
ln -sfn "$REL" "$SRV/current.new" && mv -T "$SRV/current.new" "$SRV/current"
echo "== switched current -> $(basename "$REL"); restarting thousandvale.service"
sudo -n systemctl restart thousandvale.service
up=0
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then up=1; break; fi; sleep 1
done
LIVE="$(curl -fsS "http://127.0.0.1:$PORT/status" 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).build)}catch{console.log("")}})')"
if [[ $up == 1 && "$LIVE" == "$SHORT" ]]; then
  echo "== live: build $LIVE on :$PORT"
  ls -1dt "$SRV"/releases/*/ | tail -n +4 | xargs -r rm -rf   # keep the newest 3
  IP="$(hostname -I | awk '{print $1}')"; echo "   http://$IP:$PORT/"
else
  echo "!! the new release did not come up (healthz=$up, build='$LIVE')"
  if [[ -n "$PREV" && -d "$PREV" ]]; then
    ln -sfn "$PREV" "$SRV/current.new" && mv -T "$SRV/current.new" "$SRV/current"
    sudo -n systemctl restart thousandvale.service
    echo "!! rolled back to $(basename "$PREV")"
  fi
  echo "   journalctl -u thousandvale -n 50   (needs sudo or the adm group)"
  exit 1
fi
