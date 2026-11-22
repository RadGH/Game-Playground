#!/usr/bin/env bash
# The automated checks every game passes before it is published (docs/lessons-from-games.md Part 4).
#   tools/prepublish-check.sh <game> [<ref>]        e.g. tools/prepublish-check.sh rogueloot HEAD
# 1. game-lint   (tools/game-lint.mjs)    on the game AT THAT COMMIT: popups, browser tooltips, banned names, What's new…
# 2. connected   (tools/game-reach.mjs)   every module in js/ is loaded by a page, worker or the server
# 3. walk        (tools/walk-screens.mjs) every screen on a desktop and a phone, against the game's dev server
#                (skipped when the game has no tests/walk.mjs; WALK=0 skips it on purpose — say so when you do)
# Called by tools/publish-stable.sh (for each game that changed) and by every per-game publish script.
set -euo pipefail
PLAY="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$PLAY"
GAME="${1:?usage: tools/prepublish-check.sh <game> [<ref>]}"; GAME="${GAME%/}"; GAME="${GAME##*/}"
REF="${2:-HEAD}"
DIR="prototypes/$GAME"
[[ -d "$DIR" ]] || { echo "no game $DIR"; exit 2; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
REAL="$(realpath "$DIR")"
if [[ "$REAL" == "$PLAY/$DIR" ]]; then                     # in this repo: check the committed tree, not half-done edits
  SHA="$(git rev-parse --verify "$REF^{commit}")"
  mkdir -p "$TMP/prototypes"; git archive "$SHA" -- "$DIR" | tar -x -C "$TMP"
  SRC="$TMP/$DIR"
  git diff --quiet "$SHA" -- "$DIR" || DIRTY=1
else                                                         # a symlinked game with its own repo (TinyRTS)
  SHA="$(git -C "$REAL" rev-parse --verify "$REF^{commit}" 2>/dev/null || git -C "$REAL" rev-parse HEAD)"
  mkdir -p "$TMP/prototypes/$GAME"; git -C "$REAL" archive "$SHA" | tar -x -C "$TMP/prototypes/$GAME"
  SRC="$TMP/prototypes/$GAME"
fi
FAIL=0
echo "== $GAME: game-lint"
node tools/game-lint.mjs "$SRC" | sed "s#$TMP/##" | tail -40 || FAIL=1
echo "== $GAME: every module connected"
node tools/game-reach.mjs "$SRC" | sed "s#$TMP/##" || FAIL=1
if [[ -f "$DIR/tests/walk.mjs" && "${WALK:-1}" != 0 ]]; then
  echo "== $GAME: walk every screen (desktop + phone)${DIRTY:+ — NOTE: the dev server serves the working tree, which differs from $SHA}"
  # a game with its own dev server (tumblefair-dev …): local game servers are off by default (owner 2026-11-16), so
  # start it for the walk and stop it again if this check started it
  STARTED=""
  if systemctl --user cat "$GAME-dev.service" >/dev/null 2>&1 && [[ "$(systemctl --user is-active "$GAME-dev")" != active ]]; then
    tools/game-servers.sh start "$GAME-dev" >/dev/null && STARTED="$GAME-dev"
    PORT=$(grep -oE 'localhost:[0-9]+' "$DIR/tests/walk.mjs" | head -1 | cut -d: -f2)
    for _ in $(seq 1 60); do { [[ -n "$PORT" ]] && curl -s -o /dev/null "http://localhost:$PORT/"; } && break; sleep 1; done
    echo "   (started $STARTED for the walk)"
  fi
  # the walk's time limit catches a hung page; a big game may ask for more in its walk file (`budgetSec: 1500`)
  BUDGET=$(grep -oE 'budgetSec:[[:space:]]*[0-9]+' "$DIR/tests/walk.mjs" | grep -oE '[0-9]+' | head -1 || true); BUDGET=${BUDGET:-900}   # || true: no budgetSec = no match, which pipefail would turn into a silent exit
  timeout "$BUDGET" node tools/walk-screens.mjs "$GAME" | tail -60 || FAIL=1
  [[ -n "$STARTED" ]] && tools/game-servers.sh stop "$STARTED" >/dev/null && echo "   (stopped $STARTED again)"
elif [[ ! -f "$DIR/tests/walk.mjs" ]]; then
  echo "== $GAME: no tests/walk.mjs, screens not walked"
else
  echo "== $GAME: WALK=0, screens not walked"
fi
[[ $FAIL == 0 ]] && echo "== $GAME: all checks pass" || echo "== $GAME: CHECKS FAIL"
exit $FAIL
