# Tabard step 2 — lay the body's texture out in WoW-style boxes (data/regions.json).
#
#   blender -b --python tb_uv.py -- <male|female>
#
# In:  build/<body>_shaped.blend      Out: build/<body>_uv.blend, shots/<body>_uv.png (layout check picture)
#
# Every face goes to the box of the bones that pull on it most. Each box's faces are unwrapped on their own (Blender's
# smart project), split into islands, and shelf-packed into the box at the largest scale that fits — so a box holds
# only its own body part and an item painting for that box never bleeds onto a neighbour.
import bpy, bmesh, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L

body = sys.argv[sys.argv.index("--") + 1]
REG = json.load(open(os.path.join(L.TABARD, "data", "regions.json")))
SIZE = REG["size"]; GAP = 6  # pixels between islands (bake margin lives here)
BUILD = os.path.join(L.TABARD, "build")
bpy.ops.wm.open_mainfile(filepath=os.path.join(BUILD, f"{body}_shaped.blend"))
mesh = bpy.data.objects["Body"]; me = mesh.data
gname = {g.index: g.name for g in mesh.vertex_groups}

FINGERS = ("index", "middle", "pinky", "ring", "thumb")


def region_of_bone(n):
    for r, d in REG["regions"].items():
        for b in d["bones"]:
            if b == n: return r
            if b.startswith("*_") and b.endswith(":finger"):
                side = b[1:3]
                if n.endswith(side) and n.startswith(FINGERS): return r
    return None


# 1. face -> region by clean ring cuts at the joints (planes through the joint, square to the bone), so the border
#    between two armour pieces is a straight band round the limb, not the zigzag that bone weights give.
ARMOB = next(o for o in bpy.data.objects if o.type == "ARMATURE")
AM = mesh.matrix_world.inverted() @ ARMOB.matrix_world
B = {b.name: (AM @ b.head_local, AM @ b.tail_local) for b in ARMOB.data.bones}


def past(c, bone):
    """True when point c is past the plane through the bone's head, square to the bone (towards its tail)."""
    h, t = B[bone]; return (c - h).dot((t - h).normalized()) > 0


def classify(c):
    side = "_l" if c.x > 0 else "_r"
    if c.z > B["spine_03"][0].z and past(c, "upperarm" + side):
        if past(c, "hand" + side): return "hand" + side
        if past(c, "lowerarm" + side): return "arm_lower" + side
        return "arm_upper" + side
    if past(c, "neck_01") and abs(c.x) < abs(B["upperarm" + side][0].x): return "head"
    if past(c, "thigh" + side):
        if past(c, "foot" + side): return "foot" + side
        if past(c, "calf" + side): return "leg_lower" + side
        return "leg_upper" + side
    return "torso_upper" if c.z > B["spine_02"][0].z else "torso_lower"


# slice the mesh exactly along every joint plane (only through the two parts that meet there), so each border is a
# clean ring; the new vertices take blended bone weights from the edge they split
CUTS = [("neck_01", "head", "torso_upper")]
for sd in ("_l", "_r"):
    CUTS += [("upperarm" + sd, "arm_upper" + sd, "torso_upper"), ("lowerarm" + sd, "arm_lower" + sd, "arm_upper" + sd),
             ("hand" + sd, "hand" + sd, "arm_lower" + sd), ("calf" + sd, "leg_lower" + sd, "leg_upper" + sd),
             ("foot" + sd, "foot" + sd, "leg_lower" + sd), ("thigh" + sd, "leg_upper" + sd, "torso_lower")]
bm = bmesh.new(); bm.from_mesh(me)
for bone, ra, rb in CUTS:
    bm.faces.ensure_lookup_table()
    sgn = 1 if bone.endswith("_l") else -1 if bone.endswith("_r") else 0
    fs = [f for f in bm.faces if classify(f.calc_center_median()) in (ra, rb) and (sgn == 0 or f.calc_center_median().x * sgn > -0.01)]
    h, t = B[bone]
    geom = list(set(fs) | {e for f in fs for e in f.edges} | {v for f in fs for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, dist=0.0005, plane_co=h, plane_no=(t - h).normalized())
# the waist ring (horizontal) through the torso only
bm.faces.ensure_lookup_table()
fs = [f for f in bm.faces if classify(f.calc_center_median()).startswith("torso")]
geom = list(set(fs) | {e for f in fs for e in f.edges} | {v for f in fs for v in f.verts})
bmesh.ops.bisect_plane(bm, geom=geom, dist=0.0005, plane_co=B["spine_02"][0], plane_no=(0, 0, 1))
bmesh.ops.triangulate(bm, faces=bm.faces)
bm.to_mesh(me); bm.free()
print("RES tris after joint cuts", len(me.polygons))
face_reg = [classify(p.center) for p in me.polygons]
counts = {r: face_reg.count(r) for r in REG["regions"]}
print("RES faces per region", counts)
missing = [r for r, c in counts.items() if c == 0]
assert not missing, f"empty regions {missing}"

# 2. per region: smart project the region's faces alone
if me.uv_layers:
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
me.uv_layers.new(name="UVMap")
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
for r in [k for k, v in REG["regions"].items() if "wrap" not in v]:
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(me); bm.faces.ensure_lookup_table()
    for f in bm.faces: f.select_set(face_reg[f.index] == r)
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.smart_project(angle_limit=math.radians(72), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")

# 3. islands per region (faces joined by an edge whose two sides share UVs), then shelf-pack into the box
bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
uv = bm.loops.layers.uv.active
parent = list(range(len(bm.faces)))


def find(i):
    while parent[i] != i: parent[i] = parent[parent[i]]; i = parent[i]
    return i


def luv(f, v):
    for l in f.loops:
        if l.vert is v: return l[uv].uv
for e in bm.edges:
    fs = e.link_faces
    if len(fs) != 2: continue
    a, b = fs
    if face_reg[a.index] != face_reg[b.index]: continue
    if all((luv(a, v) - luv(b, v)).length < 1e-5 for v in e.verts): parent[find(a.index)] = find(b.index)

total_ok = True
A = mesh.matrix_world.inverted() @ bpy.data.objects[[o.name for o in bpy.data.objects if o.type == "ARMATURE"][0]].matrix_world
ARM = next(o for o in bpy.data.objects if o.type == "ARMATURE").data


def bone_pt(spec):
    n, _, end = spec.partition(":")
    b = ARM.bones[n]; return A @ (b.tail_local if end == "tail" else b.head_local)


def wrap_region(r, d):
    """Unroll the region round its axis: u = angle from the seam, v = distance along the axis; fills the box."""
    from mathutils import Vector
    x0, y0, w, h = d["rect"]; wr = d["wrap"]
    a0, a1 = bone_pt(wr["axis"][0]), bone_pt(wr["axis"][1]); ax = (a1 - a0).normalized()
    s = Vector(wr["seam"]); s = (s - ax * s.dot(ax)).normalized(); t = ax.cross(s)
    fs = [f for f in bm.faces if face_reg[f.index] == r]
    per = []
    for f in fs:
        pts = []
        for l in f.loops:
            q = l.vert.co - a0
            ang = math.atan2(q.dot(t), q.dot(s))            # 0 at the seam
            u = (ang % (2 * math.pi)) / (2 * math.pi)
            pts.append([u, q.dot(ax)])
        us = [p[0] for p in pts]
        if max(us) - min(us) > 0.5:                          # face straddles the cut: keep it on the far side
            for p in pts:
                if p[0] < 0.5: p[0] += 1
        per.append(pts)
    U = [p[0] for pts in per for p in pts]; V = [p[1] for pts in per for p in pts]
    u0, u1, v0, v1 = min(U), max(U), min(V), max(V)
    m = GAP
    for f, pts in zip(fs, per):
        for l, (u, v) in zip(f.loops, pts):
            X = x0 + m + (u - u0) / (u1 - u0) * (w - 2 * m)
            Y = y0 + m + (1 - (v - v0) / (v1 - v0)) * (h - 2 * m)   # top of the box = the axis end (towards the head/hand)
            l[uv].uv = (X / SIZE, 1 - Y / SIZE)
    print(f"RES {r}: wrapped, u span {u1 - u0:.2f} turns")


for r, d in REG["regions"].items():
    if "wrap" in d: wrap_region(r, d); continue
    x0, y0, w, h = d["rect"]
    isl = {}
    for f in bm.faces:
        if face_reg[f.index] == r: isl.setdefault(find(f.index), []).append(f)
    boxes = []
    for fs in isl.values():
        us = [l[uv].uv.x for f in fs for l in f.loops]; vs = [l[uv].uv.y for f in fs for l in f.loops]
        bw, bh = max(us) - min(us), max(vs) - min(vs)
        rot = bh > bw * 1.15 and h < w        # lay tall islands down in wide boxes
        boxes.append([fs, min(us), min(vs), bw, bh, rot])

    def place(scale):
        """Shelf pack at this scale (pixels per UV unit); returns placements or None."""
        items = sorted(boxes, key=lambda b: -(b[3] if b[5] else b[4]))
        x, y, shelf, out = GAP, GAP, 0, []
        for b in items:
            pw = (b[4] if b[5] else b[3]) * scale; ph = (b[3] if b[5] else b[4]) * scale
            if x + pw + GAP > w: x, y, shelf = GAP, y + shelf + GAP, 0
            if pw + 2 * GAP > w or y + ph + GAP > h: return None
            out.append((b, x, y)); x += pw + GAP; shelf = max(shelf, ph)
        return out

    lo, hi = 1.0, 4096.0
    for _ in range(40):
        mid = (lo + hi) / 2
        if place(mid): lo = mid
        else: hi = mid
    pl = place(lo)
    if not pl: total_ok = False; print("RES cannot pack", r); continue
    for (fs, mu, mv, bw, bh, rot), px, py in pl:
        for f in fs:
            for l in f.loops:
                u, v = l[uv].uv.x - mu, l[uv].uv.y - mv
                if rot: u, v = v, bw - u
                X = x0 + px + u * lo; Y = y0 + py + v * lo           # pixels, y down from the box top
                l[uv].uv = (X / SIZE, 1 - Y / SIZE)
    print(f"RES {r}: {len(isl)} islands, {lo:.0f} px per unit")
bm.to_mesh(me); bm.free()
assert total_ok
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, f"{body}_uv.blend"))

# 4. UV edges + face regions to JSON; tools/uv_picture.py draws the layout check picture (Blender has no PIL)
lines = []
for p in me.polygons:
    pts = [tuple(round(c * SIZE, 1) for c in (me.uv_layers.active.data[li].uv.x, 1 - me.uv_layers.active.data[li].uv.y)) for li in p.loop_indices]
    lines.append([face_reg[p.index], pts])
json.dump(lines, open(os.path.join(BUILD, f"{body}_uvlines.json"), "w"))
