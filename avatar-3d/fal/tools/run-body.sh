#!/usr/bin/env bash
# One enemy body from its Codex front drawing to a rigged, animated-ready model (Test 3 pipeline).
#
#   avatar-3d/fal/tools/run-body.sh make <id> [triangles=3000]   Tripo P1 ($0.50) asked for that many faces directly
#        (Test 3: much cleaner than 8000 + our decimate, which smeared faces) → turned to face front → shots/check/<id>.png (LOOK AT IT before rigging: facing front? arms free? one piece?)
#   avatar-3d/fal/tools/run-body.sh rig <id>      Meshy rigging ($0.20, ue5_mannequin, 1 m) → to_ual.py → models/final/<id>.glb
#
# Paid steps refuse to start when data/spend.json would pass the round's cap (FAL_CAP, default 33.20 US$).
# Safe to run again: fal-job.mjs resumes a submitted job instead of paying twice; finished steps are skipped.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BL="$HOME/opt/blender/blender"
UAL="$HERE/../chibi4/assets/ual/UAL1_Standard.glb"
CAP="${FAL_CAP:-33.20}"
step="$1"; id="$2"
mkdir -p "$HERE/models/upright" "$HERE/shots/check" "$HERE/data/logs"
budget() {  # budget <price>
	node -e "const s=require('$HERE/data/spend.json'); const t=s.total+$1; if (t>$CAP+1e-9) { console.error('BUDGET: '+s.total+' + $1 would pass '+'$CAP'); process.exit(3) }"
}
if [ "$step" = make ]; then
	tris="${3:-3000}"; fl="${4:-$tris}"
	job="$id-tripo"; [ -n "${4:-}" ] && job="$id-tripo$fl"   # a 4th argument = a face-limit experiment, kept apart
	[ -f "$HERE/ref/$id-front.png" ] || python3 -I "$HERE/tools/crop.py" "$id"
	if ! ls "$HERE/models/$job"/model_mesh-*.glb >/dev/null 2>&1; then
		[ -f "$HERE/data/jobs/$job.json" ] || budget 0.50
		node "$HERE/tools/fal-job.mjs" tripo3d/p1/image-to-3d "$job" --price 0.50 \
			--input "{\"image_url\":\"@ref/$id-front.png\",\"face_limit\":$fl,\"texture\":true}" --note "$id: Tripo P1 textured, face_limit $fl" \
			> "$HERE/data/logs/$job.log" 2>&1 || { cat "$HERE/data/logs/$job.log"; exit 1; }
	fi
	src=$(ls "$HERE/models/$job"/model_mesh-*.glb | head -1)
	"$BL" -b -P "$HERE/tools/blender/face_front.py" -- "$src" "$HERE/models/upright/$job-hi.glb" -90 2>&1 | grep FRONT
	"$BL" -b -P "$HERE/tools/blender/lowpoly.py" -- "$HERE/models/upright/$job-hi.glb" "$HERE/models/upright/$job.glb" "$tris" 2>&1 | grep LOWPOLY
	"$BL" -b -P "$HERE/tools/blender/look.py" -- "$HERE/shots/check/$job.png" --h 420 "$HERE/models/upright/$job.glb" 2>&1 | grep LOOK >/dev/null
	"$BL" -b -P "$HERE/tools/blender/look.py" -- "$HERE/shots/check/$job-side.png" --side --h 420 "$HERE/models/upright/$job.glb" 2>&1 | grep LOOK >/dev/null
	echo "MADE $job → shots/check/$job.png"
elif [ "$step" = rig ]; then
	job="$id-rig"
	if ! ls "$HERE/models/$job"/rigged_character_glb-*.glb >/dev/null 2>&1; then
		[ -f "$HERE/data/jobs/$job.json" ] || budget 0.20
		node "$HERE/tools/fal-job.mjs" fal-ai/meshy/rigging "$job" --price 0.20 \
			--input "{\"model_url\":\"@models/upright/$(cat "$HERE/models/upright/$id.pick" 2>/dev/null || echo "$id-tripo").glb\",\"height_meters\":1,\"skeleton_template\":\"ue5_mannequin\",\"include_fingers\":false}" \
			--note "$id: Meshy rigging" > "$HERE/data/logs/$job.log" 2>&1 || { cat "$HERE/data/logs/$job.log"; exit 1; }
	fi
	"$BL" -b -P "$HERE/tools/blender/to_ual.py" -- "$HERE/models/$job/rigged_character_glb-rigged_character.glb" "$UAL" "$HERE/models/final/$id.glb" --tris 100000 2>&1 | grep TOUAL
else
	echo "usage: run-body.sh make|rig <id> ..." >&2; exit 2
fi
