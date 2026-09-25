#!/usr/bin/env bash
# publish-pages.sh — build the GitHub Pages site and push it.
#
# The site lives on the `gh-pages` branch of RadGH/Game-Playground and is served at
#   https://radgh.github.io/Game-Playground/
#
# Why a separate branch instead of pushing master as-is:
#   * prototypes/tinyrts is a SYMLINK to ~/claude/tinyrts (its own repo). GitHub Pages
#     cannot follow a symlink out of the repo, so the site branch holds TinyRTS's real files.
#   * The site does not need tests, test screenshots or research screenshots, and the
#     upload link here is slow (~40 kbps), so leaving them out gets the games up sooner.
#
# The branch is built with a throwaway index file — the working tree is never touched,
# so this is safe to run while other work is in progress.
#
# Usage:
#   tools/publish-pages.sh                    # whole site from the `stable` branch
#   tools/publish-pages.sh --ref master       # build from another ref
#   tools/publish-pages.sh --only "index.html shared/ prototypes/tinyrts/"
#                                             # publish a SUBSET (keeps paths starting with these)
#   tools/publish-pages.sh --no-push          # build the commit, do not push
#
# Each run adds one commit on top of the previous gh-pages commit, so a later push only
# uploads files that changed. Safe to run more than once.

set -euo pipefail
cd "$(dirname "$0")/.."

REF=stable
ONLY=""
PUSH=1
REMOTE=origin
TINYRTS=${TINYRTS_REPO:-$HOME/claude/tinyrts}

while [ $# -gt 0 ]; do
  case "$1" in
    --ref) REF=$2; shift 2 ;;
    --only) ONLY=$2; shift 2 ;;
    --no-push) PUSH=0; shift ;;
    *) echo "unknown option: $1" >&2; exit 1 ;;
  esac
done

# Paths the site never needs (regex, matched against the full path).
EXCLUDE='(^|/)(tests|test-results|playwright-report|node_modules)/|/research/.*\.(png|jpe?g|webp)$|^package(-lock)?\.json$|^playwright\.config\.js$'

# 1. Pull TinyRTS's committed files into this repo's object store (no merge, just objects).
git fetch -q "$TINYRTS" master:refs/tinyrts/master --force

TMPIDX=$(mktemp)
trap 'rm -f "$TMPIDX" "$TMPIDX.list"' EXIT
export GIT_INDEX_FILE=$TMPIDX

# 2. Playground files from REF, minus the symlink and the excluded paths.
{
  git ls-tree -r --full-tree "$REF" | awk -F'\t' '$2 != "prototypes/tinyrts"'
  git ls-tree -r --full-tree refs/tinyrts/master | awk -F'\t' '{ print $1 "\tprototypes/tinyrts/" $2 }'
} | awk -F'\t' -v re="$EXCLUDE" '$2 !~ re' > "$TMPIDX.list"

# 3. Optional subset (first uploads over a slow link).
if [ -n "$ONLY" ]; then
  awk -F'\t' -v only="$ONLY" 'BEGIN { n = split(only, p, " ") }
    { for (i = 1; i <= n; i++) if (index($2, p[i]) == 1) { print; next } }' "$TMPIDX.list" > "$TMPIDX.list2"
  mv "$TMPIDX.list2" "$TMPIDX.list"
fi

rm -f "$TMPIDX"
git update-index --add --index-info < "$TMPIDX.list"

# 4. .nojekyll: serve every file as-is (no Jekyll build, underscore folders kept).
EMPTY=$(git hash-object -w --stdin < /dev/null)
git update-index --add --cacheinfo 100644 "$EMPTY" .nojekyll

TREE=$(git write-tree)
PARENT=$(git rev-parse -q --verify refs/heads/gh-pages || true)
if [ -n "$PARENT" ] && [ "$(git rev-parse "$PARENT^{tree}")" = "$TREE" ]; then
  echo "gh-pages already matches — nothing to commit."
else
  SRC=$(git rev-parse --short "$REF"); TR=$(git rev-parse --short refs/tinyrts/master)
  MSG="Publish site from $REF $SRC + tinyrts $TR${ONLY:+ (subset: $ONLY)}"
  COMMIT=$(git commit-tree "$TREE" ${PARENT:+-p "$PARENT"} -m "$MSG")
  git update-ref refs/heads/gh-pages "$COMMIT"
  echo "gh-pages -> $(git rev-parse --short "$COMMIT"): $(wc -l < "$TMPIDX.list") files"
fi
unset GIT_INDEX_FILE

if [ "$PUSH" = 1 ]; then
  git push --progress "$REMOTE" gh-pages
fi
