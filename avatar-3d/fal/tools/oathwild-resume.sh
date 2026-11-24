#!/usr/bin/env bash
# Finish the Oathwild art once fal.ai has credit again (the balance ran out on 2026-11-23 after US$3.40 of this job).
# Every drawing is already made (free, Codex); this only runs the paid steps, then the free ones after them.
#
#   avatar-3d/fal/tools/oathwild-resume.sh            everything below, in this order (bear/horse first, owner priority)
#   avatar-3d/fal/tools/oathwild-resume.sh --dry      print the plan and its cost, pay nothing
#
# Budget: fal-job.mjs refuses any job that would pass FAL_CAPS (default: this job's US$25, props US$14, enemies US$15),
# counting jobs already logged in data/spend.json with an oathwild-* tag. Safe to run again: finished steps are skipped
# and a submitted job is resumed, never paid twice. LOOK at the pictures it names before trusting a result.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; BL="$HOME/opt/blender/blender"
export FAL_CAP="${FAL_CAP:-57.80}" FAL_CAPS="${FAL_CAPS:-oathwild:25,oathwild-props:14,oathwild-enemies:15}"
DRY="${1:-}"
run() { echo "+ $*"; [ "$DRY" = --dry ] || "$@"; }

# 1. the horse (mount) and the rest of the animals: Tripo P1 $0.50 each, rigged free by quad_rig.py
for id in riding-horse; do
	FAL_TAG=oathwild-enemies run "$HERE/tools/run-body.sh" make "$id" 4000
	run "$BL" -b -P "$HERE/tools/blender/quad_rig.py" -- "$HERE/models/upright/$id-tripo.glb" "$HERE/models/final/$id.glb" --straighten --shot "$HERE/shots/check/$id-rig.png"
done
# 2. two-legged enemies: Tripo P1 $0.50 + Meshy rig $0.20 (bandit chief + scarecrow bodies are already paid: rig only)
for spec in "bandit-chief 4500" "field-scarecrow 3000" "goblin-warchief 4500" "marsh-hag 4500" "barrow-king 4500" "shrine-cultist 3000" "bog-lurker 3000" "barrow-ghoul 3000" "hill-ogre 4500" "fen-harpy 3000"; do
	set -- $spec
	FAL_TAG=oathwild-enemies run "$HERE/tools/run-body.sh" make "$1" "$2" || continue
	echo "  LOOK at shots/check/$1-tripo.png before the rig is paid (facing front, arms free, one piece)"
	FAL_TAG=oathwild-enemies run "$HERE/tools/run-body.sh" rig "$1"
done
# 3. their weapons: two Trellis-2 sheets of four ($0.30 each), then grips + sockets (free)
for sheet in "ow-weapons-a rusty-pitchfork chief-axe warchief-cleaver cultist-knife" "ow-weapons-b hag-staff barrow-blade ogre-club chief-buckler"; do
	set -- $sheet; sid="$1"; shift
	run python3 -I "$HERE/tools/sheet.py" "$sid" 2 "$@"
	FAL_TAG=oathwild-enemies run node "$HERE/tools/fal-job.mjs" fal-ai/trellis-2 "sheet-$sid" --price 0.30 \
		--input "{\"image_url\":\"@ref/sheet-$sid.png\",\"resolution\":1024,\"decimation_target\":12000,\"texture_size\":2048}" --note "Oathwild enemy weapons $sid: $*"
	run "$BL" -b -P "$HERE/tools/blender/split_sheet.py" -- "$(ls "$HERE/models/sheet-$sid"/model_glb-*.glb 2>/dev/null | head -1)" 2 "$HERE/models/items" "$@"
	echo "  LOOK: render the four with look.py and compare with the drawings; a mirrored sheet needs split_sheet.py --flip"
	run "$BL" -b -P "$HERE/tools/blender/props.py" -- "$@"
done
run "$BL" -b -P "$HERE/tools/blender/sockets.py"
# 4. scenery: every sheet not made yet ($0.30 each, 4 props)
for sid in $(node -e "const fs=require('fs');console.log(require('$HERE/data/scenery.json').sheets.filter(s=>!fs.existsSync('$HERE/models/scn-'+s.id)).map(s=>s.id).join(' '))"); do
	FAL_TAG=oathwild-props run "$HERE/tools/scenery.sh" "$sid"
done
# 5. catalog + checks
run node "$HERE/tools/build-catalog.mjs"
echo "then: node --test avatar-3d/fal/tests/data.test.js; node --test prototypes/wyrmroad/tests/render/hd-models.test.mjs;"
echo "      update prototypes/oathwild/data/art.json (status ready, horse seat) and the README Oathwild section"
