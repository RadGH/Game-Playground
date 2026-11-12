#!/usr/bin/env bash
#
# Promote a commit to the STABLE server.
#
# Why this exists, in the user's words:
#   "The game does not load due to [a half-written import]. Is that because work is in progress?
#    Can we make it so the hosted server is a stable version and have a different server for
#    development?"
#
# Yes it was, and yes we can. There are two servers now:
#
#   port 8400  STABLE  — a git worktree at ~/claude/playground-stable, pinned to the `stable`
#                        branch. Nothing writes to it except this script. Safe to have open while
#                        an agent is halfway through rewriting a module.
#   port 8401  DEV     — the live working tree. Broken half the time, on purpose.
#
# Usage:
#   tools/publish-stable.sh              promote HEAD
#   tools/publish-stable.sh <ref>        promote a specific commit or branch
#   tools/publish-stable.sh --force      skip the test run (don't)
#
# It will REFUSE to publish a tree that does not pass `npm run test:unit`, because the whole point
# of a stable server is that you can trust it without asking anybody.
set -euo pipefail
cd "$(dirname "$0")/.."

REF="HEAD"
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) REF="$arg" ;;
  esac
done

SHA="$(git rev-parse --verify "$REF^{commit}")"
SUBJECT="$(git log -1 --format=%s "$SHA")"
STABLE_DIR="$HOME/claude/playground-stable"

if [ ! -d "$STABLE_DIR" ]; then
  echo "No stable worktree at $STABLE_DIR. Make one with:"
  echo "  git worktree add $STABLE_DIR stable"
  exit 1
fi

# --- the gate. A stable server that serves a broken build is worse than no stable server, because
# --- now you do not know which of the two to believe.
if [ "$FORCE" -eq 0 ]; then
  echo "Checking $SHA before publishing it…"
  # syntax-check every module in the tree at that ref, which is what actually catches a half-written
  # import — a unit test suite will not, because node --test does not load the browser modules
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  git archive "$SHA" | tar -x -C "$TMP"
  BAD=0
  while IFS= read -r f; do
    node --check "$f" >/dev/null 2>&1 || { echo "  syntax error: ${f#$TMP/}"; BAD=1; }
  done < <(find "$TMP" -name '*.js' -not -path '*/node_modules/*' -not -path '*/vendor/*')
  [ "$BAD" -eq 0 ] || { echo "Refusing to publish: that commit does not parse."; exit 1; }

  # Run the unit tests on THAT commit, not on the working tree: agents keep half-finished edits in
  # the working tree, and testing those made this gate refuse good commits (and could pass bad ones).
  ln -s "$PWD/node_modules" "$TMP/node_modules"
  ( cd "$TMP" && npm run test:unit --silent >/dev/null 2>&1 ) \
    || { echo "Refusing to publish: npm run test:unit fails at $SHA. Use --force if you really mean it."; exit 1; }
  echo "  …it parses and the tests pass."

  # Every game that changed since the last stable passes tools/prepublish-check.sh (a game that has not had its QA
  # pass yet gets it the first time it is published again — owner 2026-11-11, see tools/qa-passed.json): game-lint, every module
  # connected, every screen walked on a desktop and a phone (owner 2026-11-11: "so the rules are enforced even
  # when I forget them"). WALK=0 skips only the screen walk.
  OLD="$(git -C "$STABLE_DIR" rev-parse HEAD 2>/dev/null || echo "")"
  # Only games whose PLAYABLE files changed: README, docs/ and tests/ edits (the "QA pass pending" notes, a test
  # moved to a new import) don't make a game go through its pass. SKIP_QA="game game" lets named games through for a
  # change that isn't game work (say why in the commit), and is printed so it is never silent.
  CHANGED="$( { [ -n "$OLD" ] && git diff --name-only "$OLD" "$SHA" -- prototypes || git ls-tree -r --name-only "$SHA" prototypes/; } \
    | grep -v -E '(^|/)(README[^/]*|[^/]*\.md)$|/(docs|tests|research|tools)/' | awk -F/ 'NF>=3{print $2}' | sort -u)"
  for g in $CHANGED; do
    [ -f "prototypes/$g/index.html" ] || continue
    if [[ " ${SKIP_QA:-} " == *" $g "* ]]; then echo "  SKIP_QA: $g's pre-publish checks skipped on request"; continue; fi
    tools/prepublish-check.sh "$g" "$SHA" || { echo "Refusing to publish: $g fails its pre-publish checks (above). Do its QA pass (README note), or SKIP_QA=\"$g\" if this change is not game work."; exit 1; }
  done
fi

# Move the branch from INSIDE the worktree. `git branch -f stable` from here refuses, and correctly
# so — you cannot force-move a branch another worktree has checked out. `checkout -B` does both in
# the one place that is allowed to.
#
# The worktree is a serving copy and nothing but this script writes to it, so a hard reset first is
# safe and stops a stray file from blocking the checkout. `library/synced/` is git-ignored and
# survives it.
git -C "$STABLE_DIR" reset -q --hard
git -C "$STABLE_DIR" checkout -q -B stable "$SHA"

IP="$(hostname -I | awk '{print $1}')"
echo
echo "STABLE is now $SHA"
echo "  $SUBJECT"
echo "  http://$IP:8400/"
echo
echo "(restart the stable server if it is not running: tools/serve-both.sh)"
