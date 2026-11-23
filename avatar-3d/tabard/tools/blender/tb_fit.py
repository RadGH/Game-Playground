# Tabard step 2c — fit: size changes after painting (data/shapes.json <body>.fit). Reads build/<body>_uv.blend (body +
# swap-in pieces), moves points only — same triangles, same texture layout, so the paintings still line up — and writes
# build/<body>_fit.blend, which every later step reads (L.final_blend). Safe to run again (always starts from _uv).
#   blender -b --python tb_fit.py -- <male|female>
import bpy, os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L
body = sys.argv[sys.argv.index("--") + 1]
FIT = json.load(open(os.path.join(L.TABARD, "data", "shapes.json")))[body].get("fit", {})
bpy.ops.wm.open_mainfile(filepath=os.path.join(L.TABARD, "build", f"{body}_uv.blend"))
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
AW = arm.matrix_world; B = arm.data.bones
FINGER = ("thumb", "index", "middle", "ring", "pinky")

def owner(bone):
    """The scale entry a bone follows: hand_l covers its fingers too."""
    if bone in FIT.get("scale", {}): return bone
    parts = bone.split("_")
    if parts[0] in FINGER: return "hand_" + parts[-1]
    return None

moved = 0
for o in bpy.data.objects:
    if o.type != "MESH" or not o.vertex_groups: continue
    names = {g.index: g.name for g in o.vertex_groups}
    W, Wi = o.matrix_world, o.matrix_world.inverted()
    for v in o.data.vertices:
        p = W @ v.co; d = p * 0
        for g in v.groups:
            k = owner(names.get(g.group, ""))
            if not k or k not in FIT.get("scale", {}): continue
            s = FIT["scale"][k]; pivot = AW @ B[k].head_local
            d += g.weight * (s - 1) * (p - pivot)
        if d.length > 1e-7: v.co = Wi @ (p + d); moved += 1
    o.data.update()
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(L.TABARD, "build", f"{body}_fit.blend"))
print("FIT", body, FIT, "points moved", moved)
