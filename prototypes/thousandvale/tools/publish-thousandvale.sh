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
#     public/   what the server SERVES (A's --public): the PLAYGROUND as a browser sees it — the home page at
#               the root and every experiment and prototype it links — minus every server/, ops/, tests/, tools/,
#               research/ folder, Thousandvale's docs/, library/synced, node_modules, package files, dotfiles.
#               Hard links into app/ (no 2nd copy).
# The lists live in ONE place, server/static.js (ALLOW, DENY, PRIVATE_DIRS, PRIVATE_FILES): this script reads
# them from the commit it is publishing, so the dev server (8491) and the published copy cannot drift apart.
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

# What a browser may load is decided by server/static.js AT THAT COMMIT — no second list here.
TMP="$(mktemp -d)"; LISTS="$(mktemp -d)"; trap 'rm -rf "$TMP" "$LISTS"' EXIT
git show "$SHA:prototypes/thousandvale/server/static.js" > "$LISTS/static.mjs"
list() { node --input-type=module -e "const m = await import('file://$LISTS/static.mjs'); const l = m['$1']; if (!Array.isArray(l) || !l.length) { console.error('server/static.js exports no $1 list'); process.exit(1); } console.log(l.join('\n'));"; }
mapfile -t ALLOW < <(list ALLOW); mapfile -t DENY < <(list DENY)
mapfile -t PRIVATE_DIRS < <(list PRIVATE_DIRS); mapfile -t PRIVATE_FILES < <(list PRIVATE_FILES)
mapfile -t BROWSER_CODE < <(list BROWSER_CODE)     # folders named like a private one that hold page scripts
[[ ${#ALLOW[@]} -gt 0 && ${#DENY[@]} -gt 0 && ${#PRIVATE_DIRS[@]} -gt 0 && ${#PRIVATE_FILES[@]} -gt 0 ]] || { echo "refusing: could not read the lists from server/static.js at $SHORT"; exit 1; }
# Only what git holds as a real folder or file: a symlink (prototypes/tinyrts points at another repo) or a
# folder nobody has committed yet is skipped, not an error.
PRESENT=(); for p in "${ALLOW[@]}"; do
  case "$(git cat-file -t "$SHA:$p" 2>/dev/null || true)" in
    tree) PRESENT+=("$p") ;;
    blob) [[ "$(git ls-tree "$SHA" -- "$p" | cut -c1-6)" == 120000 ]] && echo "   skipping $p (a symlink)" || PRESENT+=("$p") ;;
    *) echo "   skipping $p (not in $SHORT)" ;;
  esac
done

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
TESTS=$(cd "$TMP/prototypes/thousandvale" && ls tests/*/*.test.js tests/*/*.test.mjs 2>/dev/null | grep -v -E '^tests/(load|e2e)/|/bots[0-9]+\.test\.js$' || true)
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

# public/: hard-linked subset of app/ — client files only (real files: `-type f` leaves every symlink behind)
mkdir -p "$REL/public"
SKIP=(-not -path '*/.*' -not -name '*.env')
for d in "${DENY[@]}"; do SKIP+=(-not -path "./$d/*" -not -path "./$d"); done
for f in "${PRIVATE_FILES[@]}"; do SKIP+=(-not -name "$f"); done
# a private folder name anywhere in the path, unless the file sits in one of the few excepted page-script folders
PRIV=(); for d in "${PRIVATE_DIRS[@]}"; do PRIV+=(-not -path "*/$d/*"); done
KEEP=(); KEEPDIRS=(); for d in "${BROWSER_CODE[@]}"; do KEEP+=(-o -path "./$d/*"); KEEPDIRS+=(-not -path "$REL/public/$d"); done
(cd "$REL/app" && find . -type f "${SKIP[@]}" \( \( "${PRIV[@]}" \) "${KEEP[@]}" \) -print0) | (cd "$REL/app" && cpio -0 -pdl --quiet "$REL/public")

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
refuse() { echo "refusing: $1"; rm -rf "$REL"; exit 1; }
# written out by hand ON PURPOSE (not read from static.js): if someone empties a list there, this still stops it
for d in server ops tests docs tools research; do [[ ! -e "$REL/public/prototypes/thousandvale/$d" ]] || refuse "public/ holds prototypes/thousandvale/$d/"; done
BADDIR="$(find "$REL/public" \( -name '.*' -o -name node_modules -o -name server -o -name ops -o -name tools -o -name tests -o -name research -o -name test-results -o -name synced -o -name secrets \) "${KEEPDIRS[@]}" -print | head -5)"
[[ -z "$BADDIR" ]] || refuse "public/ holds a private folder or dotfile: $BADDIR"
[[ ${#BROWSER_CODE[@]} -le 3 ]] || refuse "server/static.js excepts ${#BROWSER_CODE[@]} folders from the private names; that list is meant to stay tiny"
for d in "${BROWSER_CODE[@]}"; do [[ "$d" == prototypes/*/js/* && "$d" != prototypes/thousandvale/* && "$d" != *..* ]] || refuse "BROWSER_CODE may only name a page-script folder inside another prototype's js/, not $d"; done
BADFILE="$(find "$REL/public" \( -name 'package.json' -o -name 'package-lock.json' -o -name '*.env' -o -name 'env.example' -o -name '*.pem' -o -name '*.key' -o -name 'CLAUDE.md' -o -name '*.py' -o -name '*.sh' \) -print | head -5)"
[[ -z "$BADFILE" ]] || refuse "public/ holds a file that is not for a browser: $BADFILE"
[[ -z "$(find "$REL/public" -type l -print -quit)" ]] || refuse "public/ holds a symlink"
# everything at the top of public/ must be something the allow-list named
for top in "$REL/public"/*; do t="$(basename "$top")"; ok=0
  for a in "${ALLOW[@]}"; do [[ "$a" == "$t" || "$a" == "$t"/* ]] && ok=1; done
  [[ $ok == 1 ]] || refuse "public/ holds $t, which the allow-list does not name"; done
for top in "$REL/public/prototypes"/*; do t="prototypes/$(basename "$top")"; ok=0
  for a in "${ALLOW[@]}"; do [[ "$a" == "$t" ]] && ok=1; done
  [[ $ok == 1 ]] || refuse "public/ holds $t, which the allow-list does not name"; done
# and the things the owner opens must be there: the home page, its list, the game, and the file Emberveil needs
for f in index.html js/home.js css/home.css data/experiments.json shared/style.css prototypes/thousandvale/index.html prototypes/emberveil/index.html library/js/make.js; do
  [[ -s "$REL/public/$f" ]] || refuse "public/ is missing $f"; done
# extracted files keep the publisher's own group (not the setgid one), so hand the tree to the service group first
chgrp -R thousandvale "$REL" 2>/dev/null || [[ -n "${TV_SRV:-}" ]] || { echo "refusing: cannot give the release to group thousandvale (log out and back in after setup-stable.sh added you to it)"; rm -rf "$REL"; exit 1; }
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
