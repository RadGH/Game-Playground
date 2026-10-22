#!/usr/bin/env bash
# Turn Codex's full-size PNGs in assets/inbox/ (git-ignored) into the small webp files the game loads (assets/art/).
#   prototypes/tumblefair/tools/art.sh            every PNG in the inbox that has no webp yet (or is newer)
# logo: 900 px wide; card-*: 768x512; board-*: 1600x1600. Look at each picture before running this.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../assets"; mkdir -p art
for f in inbox/*.png; do
  [[ -e "$f" ]] || continue; n="$(basename "$f" .png)"; out="art/$n.webp"
  [[ -e "$out" && "$out" -nt "$f" ]] && continue
  case "$n" in
    logo*) bg="$(convert "$f" -format "%[pixel:p{3,3}]" info:)"; convert "$f" -fuzz 9% -fill none -draw "color 2,2 floodfill" -resize 900x -quality 90 -define webp:alpha-quality=90 "$out" ;;   # the flat backdrop it was drawn on becomes see-through
    card-*) convert "$f" -resize 768x512^ -gravity center -extent 768x512 -quality 80 "$out" ;;
    tt-vault*|*-bg) convert "$f" -resize '1280x1280>' -quality 80 "$out" ;;
    tt-*|sprite-*) convert "$f" -alpha set -fuzz 6% -fill none -draw "color 2,2 floodfill" -draw "color 1021,2 floodfill" -draw "color 2,1021 floodfill" -draw "color 1021,1021 floodfill" -trim +repage -resize '420x420>' -quality 85 -define webp:alpha-quality=85 "$out" ;;   # on flat white: the white becomes see-through
    board-*) convert "$f" -resize 1600x1600^ -gravity center -extent 1600x1600 -quality 82 "$out" ;;
    *) convert "$f" -resize '1024x1024>' -quality 82 "$out" ;;
  esac
  echo "$out $(du -h "$out" | cut -f1)"
done
