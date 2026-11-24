# Tabard step 3d — project an aligned painting onto the posed body and bake it into the WoW-style atlas.
#
#   blender -b --python tb_bake.py -- <male|female> <outfit>
#
# In:  build/<body>_uv.blend, build/<body>_views.json, build/<body>_<outfit>_<view>.png (tools/align.py, RGBA)
# Out: build/<body>_<outfit>_atlas.png (1024², the whole body; the runtime cuts slot boxes out of it)
#
# The body is posed exactly as in the clay sheet (A-pose, same camera numbers), so a painted pixel sits on the same
# spot of the body it was painted on. Per vertex, each view gets a weight (how squarely the surface faces that camera,
# to the 4th power; zero when something is in the way or the picture's outline says "not body"). The bake material
# samples every view per pixel through its own camera and blends by those weights; spots no view sees (armpits, inner
# thighs, soles) take the average colour of their seen neighbours.
import bpy, bmesh, json, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L, tb_pose as P

body, outfit = sys.argv[sys.argv.index("--") + 1:][:2]
BUILD = os.path.join(L.TABARD, "build")
meta = json.load(open(os.path.join(BUILD, f"{body}_views.json")))
bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
mesh = bpy.data.objects["Body"]; arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
P.a_pose(arm, 62)

# posed, static copies (same UVs) to bake on: the body plus every swap-in piece (robe, cuffs), joined into one
deps = bpy.context.evaluated_depsgraph_get()


def posed_copy(src, name):
    me_ = bpy.data.meshes.new_from_object(src.evaluated_get(deps), depsgraph=deps)
    ob = bpy.data.objects.new(name, me_); bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = src.matrix_world.copy() if src.parent is None else src.matrix_world.copy()
    # finer copy for the bake only (same shape, same UVs): the "can this camera see it" test runs per vertex, so
    # more vertices = a sharper edge where a hand hangs in front of a thigh
    sd = ob.modifiers.new("fine", "SUBSURF"); sd.subdivision_type = "SIMPLE"; sd.levels = sd.render_levels = 2
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier="fine")
    src.hide_render = True
    return ob


posed = posed_copy(mesh, "Posed")
geos = [posed_copy(o, "P_" + o.name) for o in list(bpy.data.objects) if o.name.startswith("geo_")]
# swap-in pieces sit outside the painted outline, so each of their points borrows the paint of a body point: the
# nearest one (robe), or the nearest one moved down the limb toward the foot / hand (cuffs: the painted boot top or
# glove sits a little below where the cuff flares). "shift" = that move, per vertex, in metres.
_pose = {pb.name: (arm.matrix_world @ pb.head, arm.matrix_world @ pb.tail) for pb in arm.pose.bones}
for g in [posed] + geos:
    at = g.data.attributes.new("shift", "FLOAT_VECTOR", "POINT")
    if g is posed: continue
    nm = g.name[2:]
    if nm.startswith("geo_bootcuff") or nm.startswith("geo_glovecuff"):
        bone = ("calf" if "boot" in nm else "lowerarm") + nm[-2:]
        h, t = _pose[bone]; d = (t - h).normalized() * (0.07 if "boot" in nm else 0.05)
        at.data.foreach_set("vector", [c for _ in g.data.vertices for c in d])
    if nm.startswith("geo_robe"):   # the hem borrows from a little higher up the shin, where the painted trim is
        zs = [v.co.z for v in g.data.vertices]; z0, z1 = min(zs), max(zs)
        at.data.foreach_set("vector", [c for v in g.data.vertices for c in (0, 0, 0.16 * (1 - (v.co.z - z0) / max(1e-6, z1 - z0)) ** 1.5)])
    at2 = g.data.attributes.new("is_geo", "FLOAT", "POINT"); at2.data.foreach_set("value", [1.0] * len(g.data.vertices))
# only the body can hide something from a camera (a robe must not hide the legs from the skin bake)
_bm = [posed.matrix_world @ v.co for v in posed.data.vertices]
bvh = BVHTree.FromPolygons(_bm, [tuple(p.vertices) for p in posed.data.polygons])

# Hands shrunk by tb_fit.py AFTER painting: the painter still drew the old, bigger hand in front of the thigh. So the
# old hands (from _uv.blend, posed the same) also hide things from the cameras — except from the new hands themselves,
# which sit inside them. Without this the hand's paint lands on the thigh behind it (round 2, 2026-11-22).
occl, occl_for = None, None
_uv = os.path.join(BUILD, f"{body}_uv.blend")
if L.final_blend(body) != _uv and os.path.exists(_uv):
    with bpy.data.libraries.load(_uv) as (src, dst):
        dst.meshes = [mesh.data.name]
    old = bpy.data.objects.new("PaintedShape", dst.meshes[0]); bpy.context.scene.collection.objects.link(old)
    old.matrix_world = mesh.matrix_world.copy()
    for g in mesh.vertex_groups: old.vertex_groups.new(name=g.name)
    for v_old, v_new in zip(old.data.vertices, mesh.data.vertices):
        for g in v_new.groups: old.vertex_groups[mesh.vertex_groups[g.group].name].add([v_old.index], g.weight, "REPLACE")
    md = old.modifiers.new("Armature", "ARMATURE"); md.object = arm
    deps = bpy.context.evaluated_depsgraph_get()
    em = old.evaluated_get(deps).to_mesh()
    hands = [(_pose[h][0], _pose[h][1]) for h in ("hand_l", "hand_r")]

    def in_hand(p, pad=0.0):
        for h, t in hands:
            ax = t - h; L_ = ax.length; ax = ax / L_; q = p - h; s_ = q.dot(ax)
            if s_ > -0.02 - pad and (q - ax * s_).length < 0.13 + pad: return True
        return False
    ow = old.matrix_world
    pts = [ow @ v.co for v in em.vertices]
    faces = [tuple(f.vertices) for f in em.polygons if all(in_hand(pts[i]) for i in f.vertices)]
    if faces:
        occl = BVHTree.FromPolygons(pts, faces)
        occl_for = lambda p: not in_hand(p, 0.01)
    print("RES painted-hand occluder faces", len(faces))
    old.to_mesh_clear(); bpy.data.objects.remove(old)
for ob in bpy.context.view_layer.objects: ob.select_set(False)
for ob in [posed] + geos: ob.select_set(True)
bpy.context.view_layer.objects.active = posed; bpy.ops.object.join()

import tb_project as TP
me = posed.data
shift = me.attributes["shift"].data; isg = me.attributes.get("is_geo")


def proxy(i, p, n):
    """Swap-in pieces borrow the paint of the nearest body point (moved by their 'shift')."""
    if isg is not None and isg.data[i].value > 0.5:
        hit = bvh.find_nearest(p + Vector(shift[i].vector))
        if hit[0] is not None: return hit[0] + hit[1] * 0.002, hit[1]
    return p, n


# outfit "clay": the plain clay renders the painter painted over (tb_sheet.py), baked the same way -> the light and
# shade every painting follows, for tools/head_clean.py (bald scalp, shaved face). Not an outfit: not published.
if outfit == "clay":
    pics = {k: os.path.join(BUILD, f"{body}_view_{k}.png") for k in TP.VIEWS}; out_png = os.path.join(BUILD, f"{body}_clay_shade.png")
else:   # outfit "head" (tools/paint.mjs <body> head: the skin painting made bald and clean-shaven) is not published
    pics = {k: os.path.join(BUILD, f"{body}_{outfit}_{k}.png") for k in TP.VIEWS}
    out_png = os.path.join(BUILD, f"{body}_headpaint.png" if outfit == "head" else f"{body}_{outfit}_atlas.png")
# GRAZING: spots that every view sees edge-on (no view faces them better than 0.4; fully below 0.2) take their
# well-seen neighbours' paint — their own samples are streaks (shoulder tops, 2026-11-23); facing is judged on
# normals averaged over the neighbourhood (6 passes ≈ 3 cm), so the best view does not flip point to point
TP.project_bake(posed, bvh, meta, pics, out_png, 1024, proxy=proxy, label=f"{body}/{outfit}",
                occl=occl, occl_for=occl_for, grazing=(0.2, 0.4), smooth_normals=6)
