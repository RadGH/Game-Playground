#!/usr/bin/env bash
# Tabard: rebuild a body's model from its texture layout onward, without repainting (swap-in pieces, fit, face layer,
# bakes of every outfit already painted, clean head, export, prop places, published textures).
#   Usage: tools/rebuild-body.sh male [female]
#   SKIP_BAKE=1  skips the bakes (mesh-only change: pieces' shape/weights, fit sizes that keep paint where it was)
#   UV=1         starts one step earlier, at the texture layout (tb_uv.py) — needed after a layout change
set -euo pipefail
T="$(cd "$(dirname "$0")/.." && pwd)"; B=~/opt/blender/blender; BL="$T/tools/blender"
for body in "$@"; do
  [ -z "${UV:-}" ] || $B -b --python "$BL/tb_uv.py" -- "$body" 2>&1 | grep -E "Error" || true
  $B -b --python "$BL/tb_geo.py" -- "$body" 2>&1 | grep -E "^RES|Error" || true
  $B -b --python "$BL/tb_fit.py" -- "$body" 2>&1 | grep -E "^FIT|Error" || true
  $B -b --python "$BL/tb_face.py" -- "$body" 2>&1 | grep -E "^RES (face_layer|eye)|Error" || true
  if [ -z "${SKIP_BAKE:-}" ]; then
    for o in $(python3 -c "import json; print(' '.join(json.load(open('$T/data/outfits.json'))['outfits']))") head; do
      [ -f "$T/ref/$body/$o.png" ] || continue
      python3 "$T/tools/align.py" "$body" "$o" >/dev/null
      $B -b --python "$BL/tb_bake.py" -- "$body" "$o" 2>&1 | grep -E "^RES .*seen|Error" || true
    done
    $B -b --python "$BL/tb_bake.py" -- "$body" clay 2>&1 | grep -E "Error" || true   # light + shade for head_clean
    python3 "$T/tools/head_clean.py" "$body"
  fi
  $B -b --python "$BL/tb_export.py" -- "$body" 2>&1 | grep -E "^RES|Error" || true
done
$B -b --python "$BL/tb_prop.py" -- sockets 2>&1 | grep -E "^RES|Error" || true
python3 "$T/tools/publish.py"
