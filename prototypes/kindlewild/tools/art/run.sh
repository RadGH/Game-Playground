#!/usr/bin/env bash
# Run each Codex icon batch in its own empty folder, one at a time; collect PNGs into ./out.
cd "$(dirname "$0")"; mkdir -p out
for b in batch*.txt; do
  n="${b%.txt}"; d="/tmp/claude-1000/kw-codex/$n"; mkdir -p "$d"
  if ls out/ 2>/dev/null | grep -q .; then :; fi
  ( cd "$d" && timeout 3000 codex exec -s danger-full-access --skip-git-repo-check < "$OLDPWD/$b" > codex.log 2>&1 ); echo "$n exit $?"
  cp "$d"/*.png out/ 2>/dev/null; ls out | wc -l
  tail -3 "$d/codex.log"
done
