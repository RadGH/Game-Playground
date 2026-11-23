# Tabard proportions check: measures the rest-pose body against targets in data/proportions.json.
# Usage: blender -b --python tb_measure.py -- <body> [glb path]   -> build/measure_<body>.json + PASS/FAIL lines
import bpy, os, sys, json
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L
args = sys.argv[sys.argv.index("--") + 1:]
body = args[0]; path = args[1] if len(args) > 1 else os.path.join(L.TABARD, "models", body + ".glb")
L.reset(); L.import_glb(path)
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
mesh = max((o for o in bpy.data.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg); me = ev.to_mesh()
W = mesh.matrix_world
names = {g.index: g.name for g in mesh.vertex_groups}
def bone_of(v):
    best = max(v.groups, key=lambda g: g.weight, default=None); return names.get(best.group) if best else None
pts = [(W @ v.co, bone_of(mesh.data.vertices[v.index])) for v in me.vertices]
B = {b.name: (arm.matrix_world @ b.head_local, arm.matrix_world @ b.tail_local) for b in arm.data.bones}
zs = [p.z for p, _ in pts]; top, floor = max(zs), min(zs); H = top - floor
chin = min(p.z for p, b in pts if b == "Head")       # lowest point skinned to the head (jaw)
head_h = top - chin
hand = [p for p, b in pts if b and (b == "hand_r" or b.endswith("_r") and b.split("_")[0] in ("index", "middle", "ring", "pinky", "thumb"))]
wrist = B["hand_r"][0]
hand_len = max((p - wrist).length for p in hand)
shoulder_w = (B["upperarm_l"][0] - B["upperarm_r"][0]).length   # shoulder joint to shoulder joint
hand_w = max(p.y for p in hand) - min(p.y for p in hand)
# arms hanging: fingertip height if the arm pointed straight down from the shoulder joint
reach = (B["upperarm_r"][0] - B["lowerarm_r"][0]).length + (B["lowerarm_r"][0] - wrist).length + hand_len
tip_h = (B["upperarm_r"][0].z - reach - floor) / H
foot = [p for p, b in pts if b in ("foot_r", "ball_r")]
foot_len = max(p.y for p in foot) - min(p.y for p in foot)
m = dict(height=H, heads_tall=H / head_h, hand_over_head=hand_len / head_h, hand_width_over_head=hand_w / head_h,
         shoulders_over_head=shoulder_w / head_h, fingertip_height=tip_h, foot_over_head=foot_len / head_h)
PJ = json.load(open(os.path.join(L.TABARD, "data", "proportions.json"))); T = {**PJ["targets"], **PJ.get("bodies", {}).get(body, {})}
res = {}
for k, v in m.items():
    t = T.get(k); ok = t is None or t[0] <= v <= t[1]
    res[k] = dict(value=round(v, 3), target=t, ok=ok)
    print(f"MEASURE {body} {'PASS' if ok else 'FAIL'} {k} = {v:.3f} target {t}")
json.dump(res, open(os.path.join(L.TABARD, "build", f"measure_{body}.json"), "w"), indent=1)
