#!/usr/bin/env bash
# Measure opus2 against Meshy: dump both looks, then fit.py per body (overlay pictures into $1, default scratch).
OUT=${1:-/tmp/kestrel-fit}; mkdir -p "$OUT"
K=/home/radgh/claude/playground/avatar-3d/kestrel
node --import /home/radgh/claude/playground/avatar-3d/tests/three-register.mjs $K/opus2/tools/dump.mjs "$OUT" ${2:-opus2} || exit 1
python3 -I $K/opus2/tools/fit.py $K/meshy/models/multi-male.glb "$OUT/${2:-opus2}-male.json" --height 1.78 --codex $K/ref/male-front.png,$K/ref/male-left.png,0 --overlay "$OUT/ov-male.png" --json "$OUT/fit-male.json" $3
python3 -I $K/opus2/tools/fit.py $K/meshy/models/multi-female.glb "$OUT/${2:-opus2}-female.json" --height 1.68 --codex $K/ref/female-front.png,$K/ref/female-left.png,1 --overlay "$OUT/ov-female.png" --json "$OUT/fit-female.json" $3
