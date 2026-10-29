#!/usr/bin/env bash
# Codex's 1024px pixel-art PNGs (tools/art/out, git-ignored) -> assets/icons/<id>.webp at 128px, nearest-neighbour so
# the pixels stay crisp; then data/icons.json lists every icon that exists (the UI falls back to a plain badge).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p ../../assets/icons
for f in out/*.png; do
  [[ -e "$f" ]] || continue
  n="$(basename "$f" .png)"; o="../../assets/icons/$n.webp"
  [[ -e "$o" && "$o" -nt "$f" ]] && continue
  [[ -s "$f" ]] || continue
  convert "$f" -filter point -resize 128x128 -quality 92 "$o" || { echo "skip $f"; rm -f "$o"; }
done
ls ../../assets/icons/*.webp | xargs -n1 basename | sed 's/\.webp$//' | python3 -c "import sys,json; print(json.dumps({'icons': sorted(l.strip() for l in sys.stdin if l.strip())}, indent=1))" > ../../data/icons.json
echo "$(ls ../../assets/icons | wc -l) icons"
