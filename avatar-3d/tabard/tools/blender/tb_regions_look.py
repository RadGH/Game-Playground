# Check picture: the body in A-pose with every texture box in its own colour (shots/<body>_regions_*.png).
import bpy, json, os, sys, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L, tb_pose as P
body = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
REG = json.load(open(os.path.join(L.TABARD, "data", "regions.json")))
mesh = bpy.data.objects["Body"]; me = mesh.data; arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
names = list(REG["regions"]); S = REG["size"]
me.materials.clear()
for i, n in enumerate(names):
    me.materials.append(P.flat_material(n, (*colorsys.hsv_to_rgb(i / len(names), 0.55, 0.8), 1)))
uvl = me.uv_layers.active.data
for p in me.polygons:
    u = sum(uvl[li].uv.x for li in p.loop_indices) / p.loop_total * S
    v = (1 - sum(uvl[li].uv.y for li in p.loop_indices) / p.loop_total) * S
    for i, n in enumerate(names):
        x, y, w, h = REG["regions"][n]["rect"]
        if x <= u < x + w and y <= v < y + h: p.material_index = i
P.a_pose(arm)
L.studio()
L.shot(os.path.join(L.TABARD, "shots", f"{body}_regions"), views=("front", "three_quarter", "back"), center=(0, 0, 0.95), dist=2.7, size=512, lens=40)
