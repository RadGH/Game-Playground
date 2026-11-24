#!/usr/bin/env bash
# One scenery sheet from its Codex drawing to four finished props (Oathwild 2026-11-23).
#
#   avatar-3d/fal/tools/scenery.sh <sheet-id> [--flip|--mid]   sheets live in data/scenery.json (--mid: split_sheet.py cuts at the middle lines)
#
#   1. ref/<sheet>.png        Codex 2×2 drawing (tools/refdraw.mjs <sheet-id>; free) — drawn first if missing
#   2. ref/sheet-<sheet>.png  cleaned + centred (tools/scenery-sheet.py)
#   3. Trellis-2 1024 ($0.30, tag oathwild-props; fal-job.mjs refuses past FAL_CAPS)
#   4. split into models/scenery-raw/<id>.glb (split_sheet.py, sheet texture kept at 2048)
#   5. tools/blender/scenery.py: weld, align, real size, cut-down, own baked texture → models/final/scenery/<id>.glb
#   6. shots/scenery/<sheet>.png (front) and -top.png — LOOK at them
# Safe to run again: the paid step resumes / is skipped when its result is on disk.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BL="$HOME/opt/blender/blender"
sid="$1"; flip="${2:-}"
export FAL_TAG="${FAL_TAG:-oathwild-props}" FAL_CAPS="${FAL_CAPS:-oathwild:25,oathwild-props:14}"
mkdir -p "$HERE/models/scenery-raw" "$HERE/shots/scenery" "$HERE/data/logs"
ids=$(node -e "const s=require('$HERE/data/scenery.json').sheets.find(x=>x.id==='$sid'); if(!s){console.error('no sheet $sid');process.exit(2)} console.log(s.objects.map(o=>o.id).join(' '))")
[ -f "$HERE/ref/$sid.png" ] || node "$HERE/tools/refdraw.mjs" "$sid"
python3 -I "$HERE/tools/scenery-sheet.py" "$sid" ${FORCE_SHEET:+--force}
job="scn-$sid"
if ! ls "$HERE/models/$job"/model_glb-*.glb >/dev/null 2>&1; then
	node "$HERE/tools/fal-job.mjs" fal-ai/trellis-2 "$job" --price 0.30 \
		--input "{\"image_url\":\"@ref/sheet-$sid.png\",\"resolution\":1024,\"decimation_target\":20000,\"texture_size\":2048}" \
		--note "Oathwild scenery sheet $sid (trellis-2 1024): $ids" > "$HERE/data/logs/$job.log" 2>&1 || { cat "$HERE/data/logs/$job.log"; exit 1; }
fi
src=$(ls "$HERE/models/$job"/model_glb-*.glb | head -1)
"$BL" -b -P "$HERE/tools/blender/split_sheet.py" -- "$src" 2 "$HERE/models/scenery-raw" $ids --tex 2048 $flip 2>&1 | grep -E "SPLIT|Error|error" || true
# shellcheck disable=SC2086
"$BL" -b -P "$HERE/tools/blender/scenery.py" -- $ids 2>&1 | grep -E "^SCENERY|Error|Traceback" || true
files=""; for i in $ids; do files="$files $HERE/models/final/scenery/$i.glb"; done
# shellcheck disable=SC2086
"$BL" -b -P "$HERE/tools/blender/look.py" -- "$HERE/shots/scenery/$sid.png" --h 420 $files 2>&1 | grep LOOK >/dev/null || true
echo "DONE $sid → shots/scenery/$sid.png"
