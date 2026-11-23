# Tabard step 1 — reshape a Quaternius CC0 base body into a softer, low-poly, WoW-proportioned body.
#
#   blender -b --python tb_body.py -- <male|female>
#
# In:  assets/quaternius/<src>.gltf + data/shapes.json (the knobs)
# Out: build/<body>_shaped.blend (armature + one mesh "Body", T-pose rest, weights kept)
#      build/<body>_asis.glb (the untouched original, for the comparison page)
#      shots/<body>_shape_{front,three_quarter}.png
#
# Steps: weld the glTF split vertices -> drop eyes/brows (Tabard paints faces) -> radial reshape per bone (blended by
# the vertex's bone weights, so joints stay smooth) -> grow hands/feet/head about the bone head -> Taubin smoothing on
# the torso and limbs (irons out abs/pecs grooves without shrinking) -> decimate to the triangle target.
import bpy, bmesh, json, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L

body = sys.argv[sys.argv.index("--") + 1]
cfg = json.load(open(os.path.join(L.TABARD, "data", "shapes.json")))[body]
BUILD = os.path.join(L.TABARD, "build"); os.makedirs(BUILD, exist_ok=True)
SHOTS = os.path.join(L.TABARD, "shots"); os.makedirs(SHOTS, exist_ok=True)

L.reset()
objs = L.import_glb(os.path.join(L.QUAT, cfg["src"]))
arm = next(o for o in objs if o.type == "ARMATURE")
mesh = next(o for o in objs if o.type == "MESH" and o.name == cfg["mesh"])

# the free pack has no normal maps for the eyes and hair: drop picture nodes whose file is missing (else the export
# writes a texture with no picture and three.js refuses the whole file)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    for n in list(m.node_tree.nodes):
        if n.type == "TEX_IMAGE" and (n.image is None or (not n.image.packed_file and not os.path.exists(bpy.path.abspath(n.image.filepath)))):
            m.node_tree.nodes.remove(n)
# the untouched original for the comparison column (body + eyes + brows, no helper sphere)
for o in objs:
    o.select_set(o.type == "ARMATURE" or (o.type == "MESH" and not o.name.startswith("Icosphere")))
bpy.ops.export_scene.gltf(filepath=os.path.join(BUILD, f"{body}_asis.glb"), use_selection=True, export_animations=False,
                          export_image_format="WEBP", export_image_quality=80)

for o in objs:
    if o.type == "MESH" and o is not mesh: bpy.data.objects.remove(o)
mesh.name = "Body"; me = mesh.data
print("RES original tris", L.tris(mesh))

# 1. weld the vertices glTF split at UV seams (so smoothing and decimation see one surface)
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
bm.to_mesh(me); bm.free()
bm = bmesh.new(); bm.from_mesh(me)
print("RES after weld: verts", len(me.vertices), "open edges", sum(1 for e in bm.edges if e.is_boundary)); bm.free()

# 2. bone lines in mesh space (rest pose)
A = mesh.matrix_world.inverted() @ arm.matrix_world
bones = {b.name: (A @ b.head_local, A @ b.tail_local) for b in arm.data.bones}
gname = {g.index: g.name for g in mesh.vertex_groups}


def closest_on(seg, p):
    a, b = seg; ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return a + ab * t


radial, grow = cfg["radial"], cfg["grow"]
# hands and feet: every finger/toe bone grows with its hand/foot (about the hand/foot bone head)
def grow_owner(n):
    for side in ("_l", "_r"):
        if n.endswith(side) and any(n.startswith(f) for f in ("index", "middle", "pinky", "ring", "thumb")): return "hand" + side
        if n in ("ball" + side, "ball_leaf" + side): return "foot" + side
    return n


new = []
for v in me.vertices:
    p = v.co.copy(); acc = Vector(); wsum = 0.0
    for g in v.groups:
        n = gname[g.group]; w = g.weight
        if w <= 0: continue
        own = grow_owner(n)
        if own in grow:
            h = bones[own][0]; q = h + (p - h) * grow[own]
        elif n in radial and n in bones:
            c = closest_on(bones[n], p); q = c + (p - c) * radial[n]
        else:
            q = p
        acc += q * w; wsum += w
    new.append(acc / wsum if wsum > 0 else p)
for v, q in zip(me.vertices, new): v.co = q

# 3. Taubin smoothing on the listed bones (weight-scaled, so it fades out toward hands, feet and head)
sm = set(cfg["smooth"]["bones"])
mask = [sum(g.weight for g in v.groups if gname[g.group] in sm) for v in me.vertices]
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
nbr = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
co = [v.co.copy() for v in bm.verts]
for i in range(cfg["smooth"]["passes"]):
    for lam in (0.5, -0.53):
        nxt = []
        for k, c in enumerate(co):
            m = mask[k]
            if m <= 0.01 or not nbr[k]: nxt.append(c); continue
            avg = sum((co[j] for j in nbr[k]), Vector()) / len(nbr[k])
            nxt.append(c + (avg - c) * lam * min(1.0, m))
        co = nxt
for v, c in zip(bm.verts, co): v.co = c
bm.to_mesh(me); bm.free()

# 4. decimate (collapse, mirrored) to the triangle target; vertex groups ride along
for p in me.polygons: p.use_smooth = True
d = mesh.modifiers.new("dec", "DECIMATE"); d.decimate_type = "COLLAPSE"; d.use_symmetry = True; d.symmetry_axis = "X"
d.ratio = cfg["tris"] / L.tris(mesh)
bpy.context.view_layer.objects.active = mesh
for m in list(mesh.modifiers):
    if m.type == "DECIMATE": bpy.ops.object.modifier_apply(modifier=m.name)
print("RES shaped tris", L.tris(mesh))

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, f"{body}_shaped.blend"))

# 5. a look: plain clay so the shape reads
mat = bpy.data.materials.new("clay"); mat.use_nodes = True
bs = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bs.inputs["Base Color"].default_value = (0.75, 0.55, 0.42, 1); bs.inputs["Roughness"].default_value = 0.8
me.materials.clear(); me.materials.append(mat)
L.studio()
L.shot(os.path.join(SHOTS, f"{body}_shape"), views=("front", "three_quarter"), center=(0, 0, 0.95), dist=2.7, size=512, lens=40)
