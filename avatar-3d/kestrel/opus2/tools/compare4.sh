#!/usr/bin/env bash
# Codex | Meshy | v1 | v2 at one height:  compare4.sh <v2ShotDir> <outDir> [height]
#   v2 shots named <body>-<view>.png as shots.sh writes them (front left back three-quarter); Meshy pictures are cropped out of the review-page shots.
K=/home/radgh/claude/playground/avatar-3d/kestrel; T=$K/opus2/tools; IN=$1; OUT=$2; H=${3:-700}; TMP=$(mktemp -d)
for B in male female; do for V in front left back three; do
  case $V in three) R=three-quarter; M=three;; *) R=$V; M=$V;; esac
  python3 -I -c "from PIL import Image; Image.open('$K/opus2-kit/shots/meshy-multi-$B-$M.png').crop((378,375,722,834)).save('$TMP/m.png')"
  python3 -I $T/compare.py $OUT/compare-$B-$V.png $H $K/ref/$B-$R.png $TMP/m.png $K/opus/shots/$B-$R.png $IN/$B-$R.png
done; done
rm -rf $TMP
