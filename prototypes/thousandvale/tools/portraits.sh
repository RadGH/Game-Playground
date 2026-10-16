#!/usr/bin/env bash
# Graphics pass 2026-10-16 (G-PROPS): turn Codex's painted portraits (assets/portraits/inbox/<id>.png, 1024 px, git-ignored)
# into the small round-frame pictures the game loads (assets/portraits/<id>.webp, 192 px, ~10 KB) and rewrite
# assets/portraits/index.json (the ids the client may ask for; js/client/ui/painted-portraits.js reads it).
# Look at each picture before running this. The prompts are in docs/CHANGELOG.md "2026-10-16 — graphics".
#   prototypes/thousandvale/tools/portraits.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../assets/portraits"
for f in inbox/*.png; do
  [[ -e "$f" ]] || continue; n="$(basename "$f" .png)"; out="$n.webp"
  [[ -e "$out" && "$out" -nt "$f" ]] && continue
  # the face sits a little above the middle: crop the centre 80% (a round frame cuts the corners anyway)
  convert "$f" -gravity center -crop 82%x82%+0-30 +repage -resize 192x192 -quality 78 "$out"
  echo "$out $(du -h "$out" | cut -f1)"
done
ls *.webp | sed 's/\.webp$//' | node -e 'const ids=require("fs").readFileSync(0,"utf8").trim().split("\n").filter(Boolean).sort();require("fs").writeFileSync("index.json",JSON.stringify({_doc:"Painted portraits (G-PROPS 2026-10-16): <id>.webp, 192 px. Made by Codex from tools/portraits.sh inbox. Keys: creature body types, Vharlen monster ids, humanoid enemy families, human NPC roles (js/client/ui/painted-portraits.js).",ids},null,1)+"\n");console.log(ids.length+" portraits")'
