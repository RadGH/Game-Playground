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

  npm run test:unit --silent >/dev/null 2>&1 \
    || { echo "Refusing to publish: npm run test:unit fails. Use --force if you really mean it."; exit 1; }
  echo "  …it parses and the tests pass."
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
