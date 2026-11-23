# Tabard step 2b — swap-in mesh pieces (WoW "geosets"): robe skirt, boot cuffs, gauntlet cuffs.
#
#   blender -b --python tb_geo.py -- <male|female>        (edits build/<body>_uv.blend in place; safe to run again)
#
# Each piece is a ring of rings fitted to the body at rest (T-pose): at each height the body's own cross-section is
# measured, and the ring sits a little outside it (the robe flares toward the hem). UVs unroll the ring into the
# piece's box (data/regions.json "geosets"); bone weights: the robe blends from the pelvis at the waist to the
# nearer thigh lower down (so it stretches with the stride, as WoW robes do); cuffs follow their calf / forearm.
import bpy, bmesh, json, math, os, sys
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L

body = sys.argv[sys.argv.index("--") + 1]
REG = json.load(open(os.path.join(L.TABARD, "data", "regions.json"))); SIZE = REG["size"]
path = os.path.join(L.TABARD, "build", f"{body}_uv.blend")
bpy.ops.wm.open_mainfile(filepath=path)
for o in list(bpy.data.objects):
    if o.name.startswith("geo_"): bpy.data.objects.remove(o)
mesh = bpy.data.objects["Body"]; arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
AM = mesh.matrix_world.inverted() @ arm.matrix_world
B = {b.name: (AM @ b.head_local, AM @ b.tail_local) for b in arm.data.bones}
V = [v.co.copy() for v in mesh.data.vertices]


def section(axis0, axis1, t, pick, ref):
    """Cross-section of the body square to axis0->axis1 at fraction t: centre and the radius in each of N directions."""
    ax = (axis1 - axis0); L_ = ax.length; ax.normalize()
    c = axis0 + ax * (L_ * t)
    s = (ref - ax * ref.dot(ax)).normalized(); u = ax.cross(s)
    band = [p for p in V if pick(p) and abs((p - c).dot(ax)) < 0.025]
    return c, ax, s, u, band


def ring_radii(c, ax, s, u, band, n, grow):
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n; d = s * math.cos(a) + u * math.sin(a)
        best = 0.0
        for p in band:
            q = p - c; q -= ax * q.dot(ax)
            if q.length < 1e-6: continue
            if q.normalized().dot(d) > 0.94: best = max(best, q.length)
        out.append(best)
    # fill directions no vertex pointed at, then smooth a little
    for k in range(n):
        if out[k] == 0: out[k] = max(out)
    out = [(out[k - 1] + 2 * out[k] + out[(k + 1) % n]) / 4 for k in range(n)]
    return [r + grow for r in out]


def build(name, rings, n, rect, weights, uv_seam=0.0):
    """rings: list of (centre, s, u, radii) top to bottom. Seam at angle 0 (= s, the back)."""
    bm = bmesh.new(); rows = []
    for c, s, u, rad in rings:
        row = []
        for i in range(n + 1):                                         # n+1: the seam column is doubled for UVs
            a = 2 * math.pi * (i % n) / n
            row.append(bm.verts.new(c + (s * math.cos(a) + u * math.sin(a)) * rad[i % n]))
        rows.append(row)
    uvl = bm.loops.layers.uv.new("UVMap")
    x0, y0, w, h = rect; m = 4
    for r in range(len(rows) - 1):
        for i in range(n):
            f = bm.faces.new((rows[r][i], rows[r][i + 1], rows[r + 1][i + 1], rows[r + 1][i]))
            for l, (ii, rr) in zip(f.loops, ((i, r), (i + 1, r), (i + 1, r + 1), (i, r + 1))):
                X = x0 + m + ii / n * (w - 2 * m); Y = y0 + m + rr / (len(rows) - 1) * (h - 2 * m)
                l[uvl].uv = (X / SIZE, 1 - Y / SIZE)
    # weld the doubled seam column for shading, keep its UVs split (the loops keep their own UVs)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o.matrix_world = mesh.matrix_world.copy(); o.parent = arm; o.matrix_parent_inverse = arm.matrix_world.inverted() @ mesh.matrix_world
    for g in mesh.vertex_groups: o.vertex_groups.new(name=g.name)
    for v in me.vertices:
        for g, w in weights(v.co).items():
            if w > 0: o.vertex_groups[g].add([v.index], w, "REPLACE")
    md = o.modifiers.new("Armature", "ARMATURE"); md.object = arm
    for p in me.polygons: p.use_smooth = True
    print(f"RES {name}: {len(me.polygons) * 2} tris")
    return o


back = Vector((0, 1, 0))
# knobs (data/geosets.json would be nicer; kept here next to the code that uses them)
ROBE_TOP_GAP = 0.016   # waist clearance (m)
ROBE_GAP = 0.05        # clearance everywhere below
ROBE_BLEND = 0.12      # width (m) over which the skirt hands over from the left leg to the right
ROBE_LEG_RISE = 2.2    # how fast the legs take over from the pelvis going down (1 = only at the hem)
ROBE_LEG_MAX = 1.0
ROBE_CALF = 0.35       # share of the lowest skirt FRONT that bends with the knee
ROBE_CALF_BACK = 0.9   # … and of the BACK, where a running heel kicks up into it
BOOT_GROW = (0.016, 0.006)   # boot cuff clearance at its top (knee end) and bottom (m)
# --- robe: from just below the waist to just above the ankles; cross-section of BOTH legs (and hips) together
zt = B["spine_01"][0].z - 0.02; zb = B["foot_l"][0].z + 0.06
N = 24; body_r = []
for k in range(9):
    t = k / 8; z = zt + (zb - zt) * t
    band = [p for p in V if abs(p.z - z) < 0.03 and abs(p.x) < 0.34]
    c = Vector((0, (B["thigh_l"][0].y + B["calf_l"][1].y) / 2, z)); ax = Vector((0, 0, -1)); s = back; u = ax.cross(s)
    body_r.append((c, s, u, ring_radii(c, ax, s, u, band, N, 0.0)))
# a smooth cone: snug at the waist (the hip measurement), out to a flared oval hem (wider front-to-back so the
# stride fits), and never inside the legs at any height
top = [r + ROBE_TOP_GAP for r in body_r[0][3]]
hx = max(top[N // 4], top[3 * N // 4]) * 1.22; hy = max(top[0], top[N // 2]) * 1.65
rings = []
for k, (c, s, u, br) in enumerate(body_r):
    t = k / 8; e = t ** 1.15
    rad = []
    for i in range(N):
        a = 2 * math.pi * i / N
        hem = 1 / math.sqrt((math.cos(a) / hy) ** 2 + (math.sin(a) / hx) ** 2)
        rad.append(max(top[i] * (1 - e) + hem * e, br[i] + ROBE_GAP))
    rings.append([c, s, u, rad])
for _ in range(2):    # smooth top to bottom so a calf bulge never makes a step
    for k in range(1, 8):
        rings[k][3] = [(a + 2 * b + c) / 4 for a, b, c in zip(rings[k - 1][3], rings[k][3], rings[k + 1][3])]


def robe_w(co):
    """Robe skinning (checked by tests/qa-poke.mjs). Each side of the skirt follows its own leg firmly (a narrow
    blend in the middle, not a 50/50 split across the whole width), the lower half also bends a little with the knee,
    so a running stride or a lunge carries the cloth with the leg instead of the leg pushing through it."""
    t = max(0.0, min(1.0, (zt - co.z) / (zt - zb)))
    u = max(0.0, min(1.0, 0.5 + co.x / ROBE_BLEND)); side = u * u * (3 - 2 * u)
    leg = min(1.0, t * ROBE_LEG_RISE) * ROBE_LEG_MAX
    back_k = max(0.0, min(1.0, 0.5 + (co.y - B["calf_l"][0].y) / 0.16))      # 0 front of the shins … 1 behind the calves
    c = max(0.0, min(1.0, (t - 0.45) / 0.55)) * (ROBE_CALF + (ROBE_CALF_BACK - ROBE_CALF) * back_k)
    return {"pelvis": 1 - leg, "thigh_l": leg * side * (1 - c), "thigh_r": leg * (1 - side) * (1 - c),
            "calf_l": leg * side * c, "calf_r": leg * (1 - side) * c}


build("geo_robe", rings, N, REG["geosets"]["robe"]["rect"], robe_w)


# --- cuffs
def cuff(name, bone, t0, t1, grow0, grow1, flare_out, rect, wbone):
    h, tl = B[bone]; N2 = 16; rings = []
    side = 1 if bone.endswith("_l") else -1
    ref = Vector((0, 1, 0)) if bone.startswith("calf") else Vector((0, 0, -1))
    for k in range(4):
        t = t0 + (t1 - t0) * k / 3
        c, ax, s, u, band = section(h, tl, t, lambda p: p.x * side > 0.02, ref)
        rad = ring_radii(c, ax, s, u, band, N2, grow0 + (grow1 - grow0) * (k / 3) ** 1.5)
        rings.append((c, s, u, rad))
    if flare_out: rings.reverse()
    return build(name, rings, N2, rect, lambda co: {wbone: 1.0})


for sd in ("_l", "_r"):
    # boot cuff: top of the calf, flares out toward the knee (its top edge)
    cuff("geo_bootcuff" + sd, "calf" + sd, 0.10, 0.28, BOOT_GROW[0], BOOT_GROW[1], True, REG["geosets"]["bootcuff" + sd]["rect"], "calf" + sd)
    # gauntlet cuff: the wrist end of the forearm, flaring out toward the elbow
    cuff("geo_glovecuff" + sd, "lowerarm" + sd, 0.6, 0.9, 0.034, 0.009, True, REG["geosets"]["glovecuff" + sd]["rect"], "lowerarm" + sd)

bpy.ops.wm.save_as_mainfile(filepath=path)
