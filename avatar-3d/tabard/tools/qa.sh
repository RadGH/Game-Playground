#!/usr/bin/env bash
# Tabard QA — run after ANY model change (body, swap-in piece, prop, fit, bake). Every check, one report:
#   1. mesh health  (tools/blender/tb_qa.py)       body closed, no holes / inside-out / loose bits
#   2. proportions  (tools/blender/tb_measure.py)  against data/proportions.json (owner's reference sheets)
#   3. poke-through (tests/qa-poke.mjs)            body through robe / cuffs while animating (needs dev server 8401)
#   4. turntables   (tests/qa-shots.mjs)           9-angle contact sheets per body x outfit x idle/walk -> shots/qa/
#   5. item close-ups (tests/qa-props.mjs)         every helm/hat/pauldron/cape/shield/weapon (fal ones too), 4 angles,
#                                                  one sheet per slot per body -> shots/qa/props_<slot>_<body>.png
# Writes data/qa/report.json with each model file's hash; tests/data.test.js fails when the report is missing, has a
# failure, or was made for different model files (so a rebuild without a QA run is caught).
# Head props: tb_prop.py build also prints POKE (head points through the helm, both bodies) -> build/prop_<id>_poke.json.
# Then LOOK at shots/qa/*.png (and build/qa_poke_*.png for any poke failure) — the numbers can't judge looks.
set -uo pipefail
T="$(cd "$(dirname "$0")/.." && pwd)"; P="$(cd "$T/../.." && pwd)"; B=~/opt/blender/blender
BODIES="${BODIES:-male female}"
for b in $BODIES; do
  $B -b --python "$T/tools/blender/tb_qa.py" -- "$b" 2>&1 | grep "^QACHECK"
  $B -b --python "$T/tools/blender/tb_measure.py" -- "$b" 2>&1 | grep "^MEASURE"
done
(cd "$P" && node avatar-3d/tabard/tests/qa-poke.mjs "${BODIES// /,}") ; POKE=$?
[ -n "${NO_SHOTS:-}" ] || (cd "$P" && node avatar-3d/tabard/tests/qa-shots.mjs avatar-3d/tabard/shots/qa "${BODIES// /,}" >/dev/null && echo "turntables -> shots/qa/")
[ -n "${NO_SHOTS:-}" ] || (cd "$P" && node avatar-3d/tabard/tests/qa-props.mjs avatar-3d/tabard/shots/qa "${BODIES// /,}" | tail -1 && echo "item close-ups -> shots/qa/props_*.png")
python3 - "$T" <<'PY'
import json, os, sys, hashlib, glob
T = sys.argv[1]; B = os.path.join(T, "build")
h = lambda p: hashlib.sha1(open(p, "rb").read()).hexdigest()[:12]
models = sorted(glob.glob(os.path.join(T, "models", "*.glb")) + glob.glob(os.path.join(T, "models", "props", "*.glb")) + glob.glob(os.path.join(T, "models", "*", "*.webp")))
rep = {"_doc": "Written by tools/qa.sh. tests/data.test.js checks every entry passed and the hashes match the model files.",
       "models": {os.path.relpath(p, T): h(p) for p in models if "_asis" not in p}, "mesh": {}, "proportions": {}, "poke": []}
for b in ("male", "female"):
    q = os.path.join(B, f"qa_{b}.json"); m = os.path.join(B, f"measure_{b}.json")
    if os.path.exists(q): rep["mesh"][b] = {k: v["ok"] for k, v in json.load(open(q)).items()}
    if os.path.exists(m): rep["proportions"][b] = json.load(open(m))
pk = os.path.join(B, "qa_poke.json")
if os.path.exists(pk): rep["poke"] = [{k: (round(v, 4) if isinstance(v, float) else v) for k, v in r.items()} for r in json.load(open(pk))]
os.makedirs(os.path.join(T, "data", "qa"), exist_ok=True)
json.dump(rep, open(os.path.join(T, "data", "qa", "report.json"), "w"), indent=1)
bad = [f"mesh {b}/{k}" for b, d in rep["mesh"].items() for k, ok in d.items() if not ok] + \
      [f"proportion {b}/{k}" for b, d in rep["proportions"].items() for k, v in d.items() if not v["ok"]] + \
      [f"poke {r['body']}/{r['piece']}/{r['clip']}" for r in rep["poke"] if not r["ok"]]
print("QA report: data/qa/report.json —", "ALL PASS" if not bad else "FAILURES: " + ", ".join(bad))
PY
