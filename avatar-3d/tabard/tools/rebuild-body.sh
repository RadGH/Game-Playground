#!/usr/bin/env bash
# Tabard: rebuild a body's model from its texture layout onward, without repainting (swap-in pieces, fit, bakes of
# every outfit already painted, export, prop places, published textures). Usage: tools/rebuild-body.sh male [female]
#   SKIP_BAKE=1  skips the bakes (mesh-only change: pieces' shape/weights, fit sizes that keep paint where it was)
set -euo pipefail
T="$(cd "$(dirname "$0")/.." && pwd)"; B=~/opt/blender/blender; BL="$T/tools/blender"
for body in "$@"; do
  $B -b --python "$BL/tb_geo.py" -- "$body" 2>&1 | grep -E "^RES|Error" || true
  $B -b --python "$BL/tb_fit.py" -- "$body" 2>&1 | grep -E "^FIT|Error" || true
  if [ -z "${SKIP_BAKE:-}" ]; then
    for o in $(python3 -c "import json; print(' '.join(json.load(open('$T/data/outfits.json'))['outfits']))"); do
      [ -f "$T/ref/$body/$o.png" ] || continue
      python3 "$T/tools/align.py" "$body" "$o" >/dev/null
      $B -b --python "$BL/tb_bake.py" -- "$body" "$o" 2>&1 | grep -E "^RES|Error" || true
    done
  fi
  $B -b --python "$BL/tb_export.py" -- "$body" 2>&1 | grep -E "^RES|Error" || true
done
$B -b --python "$BL/tb_prop.py" -- sockets 2>&1 | grep -E "^RES|Error" || true
python3 "$T/tools/publish.py"
