#!/usr/bin/env bash
cd "$(dirname "$0")"
for b in later*.txt; do n="${b%.txt}"; d="/tmp/claude-1000/kw-codex/$n"; rm -rf "$d"; mkdir -p "$d"
  ( cd "$d" && timeout 3000 codex exec -s danger-full-access --skip-git-repo-check < "$OLDPWD/$b" > codex.log 2>&1 ); echo "$n exit $?"
  find "$d" -name '*.png' -size +0 -exec cp {} out/ \; ; tail -2 "$d/codex.log"; done
