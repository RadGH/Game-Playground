# Tabard step 3a — the paint-over base: the body in A-pose as light clay, four orthographic views.
#
#   blender -b --python tb_sheet.py -- <male|female>
#
# Out: build/<body>_view_{front,left,back,right}.png (same scale) + build/<body>_views.json (the model's bounds in the
#      pose). tools/sheet.py lays them out into ref/<body>/base.png, the picture Codex paints over.
import bpy, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L, tb_pose as P

body = sys.argv[sys.argv.index("--") + 1]
BUILD = os.path.join(L.TABARD, "build")
bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
mesh = bpy.data.objects["Body"]; arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
P.a_pose(arm, 62)
me = mesh.data; me.materials.clear(); me.materials.append(P.flat_material("clay", (0.78, 0.76, 0.74, 1), 0.85))
L.studio(bg=(0.62, 0.62, 0.62), sun=2.4)
sc = bpy.context.scene; sc.render.film_transparent = True; sc.render.image_settings.color_mode = "RGBA"  # alpha = the figure mask

HEIGHT = 2.2                     # metres shown top to bottom in every view
H_PX = 1024
deps = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(deps); m2 = ev.to_mesh()
cos = [ev.matrix_world @ v.co for v in m2.vertices]; ev.to_mesh_clear()
xs, ys, zs = [c.x for c in cos], [c.y for c in cos], [c.z for c in cos]
bounds = {"x": [min(xs), max(xs)], "y": [min(ys), max(ys)], "z": [min(zs), max(zs)]}
cz = HEIGHT / 2 - 0.08 + bounds["z"][0]          # soles a little above the bottom edge
widths = {"front": 560, "left": 200, "back": 560, "right": 200}
out = {}
for v, w in widths.items():
    p = P.ortho_views(os.path.join(BUILD, f"{body}_view"), (v,), height=HEIGHT, size=(w, H_PX), centre_z=cz)
    out[v] = {"file": os.path.basename(p[v]), "w": w}
json.dump({"bounds": bounds, "height_m": HEIGHT, "h_px": H_PX, "centre_z": cz, "views": out},
          open(os.path.join(BUILD, f"{body}_views.json"), "w"), indent=1)
print("RES bounds", bounds)
