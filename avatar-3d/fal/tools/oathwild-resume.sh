#!/usr/bin/env bash
# Finish the Oathwild art once fal.ai has credit again. Owner 2026-11-23: budget US$8.80 for everything after the first
# round (FAL_CAPS oathwild2:8.50 keeps a US$0.30 margin); the rest stays PLACEHOLDER art (data/art.json, made by
# tools/oathwild-art.mjs). The balance ran out twice: after US$3.40 (round 1) and after US$0.40 (round 2: the two rigs).
#
#   avatar-3d/fal/tools/oathwild-resume.sh            the owner's priority order below; stops at the first refusal
#   avatar-3d/fal/tools/oathwild-resume.sh --dry      print the plan, pay nothing
#
# Order (owner 2026-11-23): horse → (bandit chief + scarecrow rigs: DONE) → three bosses + one weapon sheet for them →
# scenery: shrines/waystone, chests + loot sack, palisade + watchtower, well/market/cart, bridge + ruins, camp + banners,
# barrow, rocks → one more monster (hill ogre). Every drawing is already made (free, Codex). Safe to run again.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; BL="$HOME/opt/blender/blender"
export FAL_CAP="${FAL_CAP:-45.00}" FAL_CAPS="${FAL_CAPS:-oathwild2:8.50,oathwild:12.20}"
DRY="${1:-}"
run() { echo "+ $*"; [ "$DRY" = --dry ] || "$@" || { echo "STOPPED (budget cap or fal balance): $*"; exit 1; }; }

# 1. the horse (mount): Tripo P1 $0.50, rigged free by quad_rig.py; then measure its seat (README "Oathwild")
FAL_TAG=oathwild2-enemies run "$HERE/tools/run-body.sh" make riding-horse 4000
run "$BL" -b -P "$HERE/tools/blender/quad_rig.py" -- "$HERE/models/upright/riding-horse-tripo.glb" "$HERE/models/final/riding-horse.glb" --straighten --shot "$HERE/shots/check/riding-horse-rig.png"
# 2. three bosses: Tripo P1 $0.50 + Meshy rig $0.20 each — LOOK at shots/check/<id>-tripo.png before each rig
for spec in "goblin-warchief 4500" "marsh-hag 4500" "barrow-king 4500"; do
	set -- $spec
	FAL_TAG=oathwild2-enemies run "$HERE/tools/run-body.sh" make "$1" "$2"
	FAL_TAG=oathwild2-enemies run "$HERE/tools/run-body.sh" rig "$1"
done
# 3. their weapons (+ the bandit chief's axe): one Trellis-2 sheet of four, $0.30; grips + sockets free
set -- warchief-cleaver hag-staff barrow-blade chief-axe
run python3 -I "$HERE/tools/sheet.py" ow-weapons-a 2 "$@"
FAL_TAG=oathwild2-enemies run node "$HERE/tools/fal-job.mjs" fal-ai/trellis-2 sheet-ow-weapons-a --price 0.30 \
	--input '{"image_url":"@ref/sheet-ow-weapons-a.png","resolution":1024,"decimation_target":12000,"texture_size":2048}' --note "Oathwild boss weapons: $*"
run "$BL" -b -P "$HERE/tools/blender/split_sheet.py" -- "$(ls "$HERE/models/sheet-ow-weapons-a"/model_glb-*.glb 2>/dev/null | head -1)" 2 "$HERE/models/items" "$@"
echo "  LOOK: render the four with look.py and compare with the drawings; a mirrored sheet needs split_sheet.py --flip"
run "$BL" -b -P "$HERE/tools/blender/props.py" -- "$@"
run "$BL" -b -P "$HERE/tools/blender/sockets.py"
echo "  then set the bosses' weapon in data/gear.json (and bandit-chief: chief-axe)"
# 4. scenery in the owner's order ($0.30 per sheet of four)
for sid in sc-shrines sc-travel sc-banners-chests sc-loot sc-palisade sc-village sc-market sc-ruins sc-camp sc-barrow sc-rocks-a sc-rocks-b; do
	[ -d "$HERE/models/scn-$sid" ] && continue
	FAL_TAG=oathwild2-props run "$HERE/tools/scenery.sh" "$sid"
done
# 5. one more monster
FAL_TAG=oathwild2-enemies run "$HERE/tools/run-body.sh" make hill-ogre 4500
FAL_TAG=oathwild2-enemies run "$HERE/tools/run-body.sh" rig hill-ogre
# 5. catalog + checks
run node "$HERE/tools/build-catalog.mjs"
run node "$HERE/tools/oathwild-art.mjs"   # ready models replace their placeholders in prototypes/oathwild/data/art.json
echo "then: node --test avatar-3d/fal/tests/data.test.js; node --test prototypes/wyrmroad/tests/render/hd-models.test.mjs;"
echo "      set the horse seat (gear.json bodies.riding-horse.mount.seat, measured on its spine_2) and update the README Oathwild section"
