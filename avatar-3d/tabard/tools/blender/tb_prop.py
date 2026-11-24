# Tabard props — build, paint-over views, bake and sockets for the attached models (data/props.json).
#
#   blender -b --python tb_prop.py -- build <id>     model + 4 clay views  -> build/prop_<id>.blend, build/prop_<id>_views.json
#                                                    (then: python3 tools/sheet.py prop_<id>; node tools/paint.mjs prop <id>)
#   blender -b --python tb_prop.py -- bake <id>      project the aligned painting -> models/props/<id>.glb (+ its texture)
#   blender -b --python tb_prop.py -- sockets        where every prop sits on each body -> models/props/sockets.json
#
# Model space: long axis +Z, front -Y, origin = the attach point (sword: middle of the grip; shield: the strap; helm:
# the head bone; pauldron: the shoulder joint; cape: its top edge at the middle of the back).
import bpy, bmesh, json, math, os, sys
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L, tb_pose as P

args = sys.argv[sys.argv.index("--") + 1:]
cmd = args[0]
PROPS = json.load(open(os.path.join(L.TABARD, "data", "props.json")))["props"]
BUILD = os.path.join(L.TABARD, "build"); OUT = os.path.join(L.TABARD, "models", "props")
os.makedirs(OUT, exist_ok=True)


# ------------------------------------------------------------------ modelling helpers
def loft(bm, rings, cap0=True, cap1=True):
    """rings: lists of Vectors (same count), bottom to top; quads between, optional end caps."""
    vs = [[bm.verts.new(p) for p in r] for r in rings]; n = len(rings[0])
    for a, b in zip(vs, vs[1:]):
        for i in range(n): bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    if cap0: bm.faces.new(list(reversed(vs[0])))
    if cap1: bm.faces.new(vs[-1])
    return vs


def ring(c, rx, ry, n, z=None, phase=0.0):
    return [Vector((c.x + rx * math.cos(phase + 2 * math.pi * i / n), c.y + ry * math.sin(phase + 2 * math.pi * i / n), c.z if z is None else z)) for i in range(n)]


def box(bm, c, sx, sy, sz):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]: v.co = Vector((c.x + v.co.x * sx, c.y + v.co.y * sy, c.z + v.co.z * sz))


_HEAD = {}
def head_size(body="male"):
    """A body's head, measured on the built body: Head bone, half-width, front/back depth, crown, and every head point
    relative to the Head bone (helm fit + the poke check). Props are modelled on the man; the sockets scale them by
    head half-width for the woman."""
    if body in _HEAD: return _HEAD[body]
    bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
    o = bpy.data.objects["Body"]; a = next(x for x in bpy.data.objects if x.type == "ARMATURE")
    hb = a.matrix_world @ a.data.bones["Head"].head_local; nz = (a.matrix_world @ a.data.bones["neck_01"].head_local).z
    hv = [o.matrix_world @ v.co for v in o.data.vertices if (o.matrix_world @ v.co).z > nz + 0.03]
    _HEAD[body] = (hb, max(abs(v.x) for v in hv), min(v.y for v in hv), max(v.y for v in hv), max(v.z for v in hv),
                   [v - hb for v in hv])
    _EYES[body] = find_eyes(body, o, hb)                               # for eye_check (while the body file is open)
    print("EYES", body, _EYES[body][1], [[round(c, 3) for c in e] for e in _EYES[body][0]])
    return _HEAD[body]


def head_fit():
    """The man's head in prop space (origin = Head bone): the numbers every head shape is built from."""
    hb, hx, y0, y1, ztop, pts = head_size("male")
    # both heads in prop space (each scaled the way its socket scales the prop), so tight parts clear the woman's
    # head too (her forehead and crown sit further out than the man's once scaled — 2026-11-23 nasal helm)
    both = [p / (hx / 0.098) for p in pts]
    if "female" in _HEAD:
        f = _HEAD["female"]; both += [p / (f[1] / 0.098) for p in f[5]]
    return {"hx": hx, "y0": y0 - hb.y, "y1": y1 - hb.y, "cy": (y0 + y1) / 2 - hb.y, "top": ztop - hb.z, "pts": both,
            "brow": 0.55 * (ztop - hb.z)}   # just above the painted eyebrows (0.5 put the leather cap over the eyes)


def head_pivot(H):
    """The point a head prop's place.turn swings it about: the middle of the man's head (prop space)."""
    return Vector((0, H["cy"], 0.5 * H["top"]))


def place_matrix(pr, pivot):
    """A head prop's extra seat on the head, in prop space (data/props.json place): turn = degrees it tips back about
    the side-to-side axis through the head's middle (front edge up, back edge down — a hat pushed back off the
    eyes), lift = metres up. A rigid move, so the painting still fits (no repaint). Used by the sockets AND the checks."""
    t = math.radians(pr.get("place", {}).get("turn", 0)); lift = pr.get("place", {}).get("lift", 0)
    return (Matrix.Translation(Vector((0, 0, lift))) @ Matrix.Translation(pivot) @ Matrix.Rotation(-t, 4, "X")   # +X turn would tip the front DOWN
            @ Matrix.Translation(-pivot))


# ------------------------------------------------------------------ eyes (the eye-clearance check)
_EYES = {}
def find_eyes(body, o, hb):
    """Both eye centres of a body, relative to its Head bone (Blender world axes), on the face's surface.
    models/<body>_face.json (the face layer's landmarks) wins when present: `eyes` = [[x,y,z], [x,y,z]] in world
    metres, or {l:[..], r:[..]}. Otherwise the pupils are found on the painted skin's front view
    (build/<body>_skin_front.png: the darkest spot each side of the face between nose and brow) and dropped onto the
    face with a ray from the front."""
    fj = os.path.join(L.TABARD, "models", f"{body}_face.json")
    if os.path.exists(fj):
        # the face layer's landmarks (tools/blender/tb_face.py): eyes.l/r = {centre, radius, forward} in the Head bone's
        # own frame; the check starts from the front of the eyeball (centre + forward x radius)
        d = json.load(open(fj)); e = d.get("eyes") or {}
        a = next(x for x in bpy.data.objects if x.type == "ARMATURE"); Mh = a.matrix_world @ a.data.bones["Head"].matrix_local
        pts = []
        for side in ("l", "r"):
            q = e.get(side) or {}
            if "centre" in q:
                c = Vector(q["centre"]) + Vector(q.get("forward", (0, 0, 1))) * q.get("radius", 0.0)
                pts.append(Mh @ c - hb)
        if len(pts) == 2: return pts, "face.json"
    import numpy as np
    meta = json.load(open(os.path.join(BUILD, f"{body}_views.json")))
    img = bpy.data.images.load(os.path.join(BUILD, f"{body}_skin_front.png"))
    W, Hh = img.size; a_ = np.array(img.pixels[:], dtype=np.float32).reshape(Hh, W, 4)[::-1]   # row 0 = top
    lum = a_[..., 0] * 0.3 + a_[..., 1] * 0.59 + a_[..., 2] * 0.11 + (1 - a_[..., 3])           # outside = bright
    lum = sum(np.roll(np.roll(lum, dy, 0), dx, 1) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9  # 3x3 blur
    # a pupil is dark with the light eye-white beside it (a brow or lash line is dark beside itself too), and the two
    # eyes mirror each other: search the pair together (one side alone picked the man's brow, 2026-11-23)
    sc = lum - 0.4 * (np.roll(lum, 4, 1) + np.roll(lum, -4, 1))
    ppm = meta["h_px"] / meta["height_m"]
    bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
    best = None
    for zz in range(int((hb.z + 0.07 - meta["centre_z"]) * ppm), int((hb.z + 0.15 - meta["centre_z"]) * ppm)):
        for xx in range(int(0.015 * ppm), int(0.06 * ppm)):
            v = sc[Hh // 2 - zz, W // 2 + xx] + sc[Hh // 2 - zz, W // 2 - xx]
            if best is None or v < best[0]: best = (v, xx / ppm, meta["centre_z"] + zz / ppm)
    out = []
    for sgn in (1, -1):
        x, z = sgn * best[1], best[2]
        hit = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)), 4.0)[0]
        out.append((hit if hit is not None else Vector((x, hb.y - 0.1, z))) - hb)
    return out, "skin painting"


def eye_check(o, pr):
    """Can each eye see straight out? Rays from both eye centres of BOTH bodies (each body's head scaled the way its
    socket scales the prop, then the prop's place.turn/lift undone): straight ahead, 15° to either side, 8° and 15° up.
    Any ray that meets the prop = that eye is covered from the front at eye level (kettle-helm brim, wizard-hat brim
    2026-11-23). Closed helms (place.coversFace) report but never fail."""
    bvh = BVHTree.FromPolygons([v.co.copy() for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
    Pinv = place_matrix(pr, head_pivot(head_fit())).inverted(); R = Pinv.to_3x3()
    # the up rays: the library's idle / walk hold the head 12-18° down (tests: Head bone pitch), so a camera at eye
    # level sees the face from that far above the head's own forward — 8° and 15° up must be clear too
    fan = [Vector((0, -1, 0)), Vector((math.sin(0.26), -math.cos(0.26), 0)), Vector((-math.sin(0.26), -math.cos(0.26), 0)),
           Vector((0, -math.cos(0.14), math.sin(0.14))), Vector((0, -math.cos(0.26), math.sin(0.26)))]
    res = {}
    for body in ("male", "female"):
        k = head_size(body)[1] / 0.098; eyes, src = _EYES[body]
        blocked = []
        for e in eyes:
            q = Pinv @ (e / k + Vector((0, -0.004, 0)))           # 4 mm in front of the painted eye
            for d in fan:
                hit = bvh.ray_cast(q, (R @ d).normalized(), 0.6)
                if hit[0] is not None: blocked.append([round(c, 3) for c in hit[0]])
        res[body] = {"blocked": len(blocked), "rays": len(eyes) * len(fan), "eyes_from": src,
                     "eyes": [[round(c, 3) for c in e] for e in eyes], "first_hit": blocked[0] if blocked else None}
    res["coversFace"] = bool(pr.get("place", {}).get("coversFace"))
    return res


# ------------------------------------------------------------------ torso fit (tabards)
_TORSO = {}
def torso_fit(bone):
    """Both torsos in a prop's frame anchored at `bone`'s head (pelvis: the belt flaps; spine_03: the chest panels):
    for a grid of (x, z) the front-most and back-most body surface (rays from the front / back), each body scaled by
    its torso length against the man's (the socket's scale). Returns {"front": {(xi, zi): y}, "back": …, "land": {…}}
    with x, z in cm steps; the woman's chest and the man's belly both count (worst case)."""
    if bone in _TORSO: return _TORSO[bone]
    fr, bk = {}, {}; land = {}; male_len = None
    for body in ("male", "female"):
        bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
        o = bpy.data.objects["Body"]; a = next(x for x in bpy.data.objects if x.type == "ARMATURE")
        hw = lambda n: a.matrix_world @ a.data.bones[n].head_local
        tl = hw("neck_01").z - hw("pelvis").z; male_len = male_len or tl; s = tl / male_len
        A = hw(bone); bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
        if body == "male":
            land = {"belt": hw("pelvis").z + 0.145 - A.z, "collar": hw("neck_01").z - 0.075 - A.z, "knee": hw("calf_l").z + 0.05 - A.z}
        for xi in range(-20, 21):
            for zi in range(-70, 45):
                p = A + Vector((xi / 100, 0, zi / 100)) * s
                h1 = bvh.ray_cast(Vector((p.x, A.y - 1.5, p.z)), Vector((0, 1, 0)), 3.0)[0]
                h2 = bvh.ray_cast(Vector((p.x, A.y + 1.5, p.z)), Vector((0, -1, 0)), 3.0)[0]
                if h1 is not None: fr[(xi, zi)] = min(fr.get((xi, zi), 9), (h1.y - A.y) / s)
                if h2 is not None: bk[(xi, zi)] = max(bk.get((xi, zi), -9), (h2.y - A.y) / s)
    _TORSO[bone] = {"front": fr, "back": bk, "land": land}
    return _TORSO[bone]


def drape(fit, side, x, z_from, z_to, pad):
    """Cloth hanging from z_from down to z_to over column x: never inside the body, and never back in under a bulge
    above it (it falls straight down from the chest, like cloth). side: 'front' (y smaller = further out) or 'back'."""
    g = fit[side]; sg = -1 if side == "front" else 1; xi = round(x * 100)
    ys = []; cur = None
    for zi in range(round(z_from * 100), round(z_to * 100) - 1, -1):
        cands = [g[(xx, zi)] for xx in range(max(-20, xi - 2), min(20, xi + 2) + 1) if (xx, zi) in g]
        y = (min(cands) if sg < 0 else max(cands)) + sg * pad if cands else None
        if y is not None: cur = y if cur is None else (min(cur, y) if sg < 0 else max(cur, y))
        ys.append((zi / 100, cur))
    return ys


def sheet(bm, cols, rows):
    """Quads over a grid of points rows[r][c] (a flat cloth sheet; inner points so the paint projection has them)."""
    vs = [[bm.verts.new(p) for p in r] for r in rows]
    for r in range(len(vs) - 1):
        for c in range(len(vs[r]) - 1): bm.faces.new((vs[r][c], vs[r + 1][c], vs[r + 1][c + 1], vs[r][c + 1]))
    return vs


HEAD_SHAPES = ("helm_bulwark", "helm_open", "cap", "hood", "circlet", "hat_wizard")
DEFAULT_PARTS = {"helm_bulwark": ["plume"], "pauldron_bulwark": ["lames"]}   # what the first props were built with


def hug_r(H, a, z, band=0.016, width=0.25):
    """How far the head reaches from its middle line in direction a (radians, -90° = the face) around height z."""
    c = Vector((0, H["cy"], 0)); d = Vector((math.cos(a), math.sin(a), 0)); rs = []
    for p in H["pts"]:
        if abs(p.z - z) > band: continue
        q = Vector((p.x, p.y - c.y, 0))
        if q.length > 1e-6 and q.normalized().dot(d) > math.cos(width): rs.append(q.dot(d))
    return max(rs) if rs else None


def hug_point(H, a, z, pad):
    """A point `pad` metres outside the head at direction a, height z (above the crown: the last ring that had head)."""
    r = None; zz = z
    while r is None and zz > -0.1:
        r = hug_r(H, a, zz); zz -= 0.01
    r = (r or 0.08) * (1.0 if zz + 0.01 >= z else max(0.2, 1 - (z - zz) * 6))
    return Vector((math.cos(a) * (r + pad), H["cy"] + math.sin(a) * (r + pad), z))


def hug_ring(H, z, n, pad, phase=-math.pi / 2, shrink=0.0):
    """A closed ring following the head's real outline (not an ellipse) `pad` metres out — for parts that sit tight on
    the head (circlet, cap, hat band). z: a height, or a function of the direction (a tilted band). Bumps (ears) are
    smoothed outward only, so nothing pokes through."""
    zf = z if callable(z) else (lambda a: z)
    angs = [phase + 2 * math.pi * i / n for i in range(n)]
    rs = []
    for a in angs:
        r = hug_r(H, a, zf(a))
        rs.append(r)
    known = [r for r in rs if r is not None] or [0.08]
    rs = [r if r is not None else sum(known) / len(known) for r in rs]
    rs = [max(rs[i], (rs[i - 1] + rs[i] + rs[(i + 1) % n]) / 3) for i in range(n)]
    return [Vector((math.cos(a) * (r + pad), H["cy"] + math.sin(a) * (r + pad), zf(a))) for a, r in zip(angs, rs)]


def plate_shield(bm, pts, bulge, centre, drop, rings_in=()):
    """A shield plate from its outline (x, z): domed front (bulge), a rim, a flat back, then moved down by `drop`.
    rings_in: inner outline copies (fractions) so the front has points inside it for the paint projection."""
    cx, cz = centre; mine = []
    def P(x, z, y): v = bm.verts.new(Vector((x, y, z))); mine.append(v); return v
    rings = [[P(x * 0.97, z * 0.97, bulge(x, z) - 0.012) for x, z in pts]]
    for f in sorted(rings_in, reverse=True):
        rings.append([P(cx + (x - cx) * f, cz + (z - cz) * f, bulge(cx + (x - cx) * f, cz + (z - cz) * f) - 0.012) for x, z in pts])
    rimf = [P(x, z, -0.016) for x, z in pts]
    back = [P(x, z, 0.016) for x, z in pts]
    n = len(pts)
    cf = P(cx, cz, bulge(cx, cz) - 0.012); cb = P(cx, cz, 0.01)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((cf, rings[-1][i], rings[-1][j]))
        for a, b in zip(rings, rings[1:]): bm.faces.new((b[i], a[i], a[j], b[j]))
        bm.faces.new((rings[0][i], rimf[i], rimf[j], rings[0][j]))
        bm.faces.new((rimf[i], back[i], back[j], rimf[j]))
        bm.faces.new((cb, back[j], back[i]))
    for v in mine: v.co.z -= drop
    box(bm, Vector((0, 0.035, 0.0)), 0.06, 0.03, 0.22)                                                       # strap block


def tube(bm, path, radii, n=6, flat=None, cap1=False):
    """A tapered tube along a list of points (horns, spikes, feathers). flat=(sideways vector, ratio) squashes the
    cross-section into a blade (feathers)."""
    rings = []
    for i, (p, r) in enumerate(zip(path, radii)):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
        a = t.orthogonal().normalized() if flat is None else flat[0].normalized()
        a = (a - t * a.dot(t)).normalized(); b = t.cross(a)
        k = 1.0 if flat is None else flat[1]
        rings.append([p + a * r * math.cos(2 * math.pi * j / n) + b * r * k * math.sin(2 * math.pi * j / n) for j in range(n)])
    return loft(bm, rings, cap0=True, cap1=cap1)


def loft_open(bm, rows):
    """rows: lists of points (same count), NOT closed around (visor, ear flaps, hood front)."""
    vs = [[bm.verts.new(p) for p in r] for r in rows]
    for a, b in zip(vs, vs[1:]):
        for i in range(len(a) - 1): bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    return vs


def subdivided(bm, verts, cuts=2):
    """Points inside a part's faces: a bare box has only corners, all on the outline in every view, and the bake trims
    the outline — a part without inner points comes out unpainted (round 2's helm plume)."""
    bmesh.ops.subdivide_edges(bm, edges=list({e for v in verts for e in v.link_edges}), cuts=cuts, use_grid_fill=True)


# ------------------------------------------------------------------ the variant table's parts (data/props.json build.parts)
def part_plume(bm, H, top):
    r = bmesh.ops.create_cube(bm, size=1.0); y0, y1, cy = H["y0"], H["y1"], H["cy"]
    for v in r["verts"]:
        up = v.co.z > 0
        v.co = Vector((v.co.x * (0.03 if up else 0.045), cy + 0.012 + v.co.y * (y1 - y0) * (0.72 if up else 0.5) + (0.012 if up else 0), top - 0.012 + (0.075 if up else 0)))
    subdivided(bm, r["verts"], 3)


def part_wings(bm, H, side_x):
    """Two swept feathered wings on the temples: three flat feather blades each, fanned up and back."""
    for s in (1, -1):
        root = Vector((s * (side_x - 0.004), H["cy"] + 0.01, 0.10))
        for k, (ang, ln, w) in enumerate(((68, 0.22, 0.032), (48, 0.19, 0.030), (28, 0.15, 0.026))):
            a = math.radians(ang); d = Vector((s * 0.28, math.cos(a), math.sin(a))).normalized()
            base = root + Vector((0, 0.012 * k, -0.018 * k))
            path = [base + d * ln * t + Vector((s * 0.02 * t * t, 0, 0.02 * math.sin(math.pi * t))) for t in (0, 0.25, 0.5, 0.75, 1.0)]
            tube(bm, path, [w, w * 1.05, w * 0.95, w * 0.7, w * 0.12], n=6, flat=(Vector((s, 0, 0)).cross(d), 0.22))


def part_horns(bm, H, side_x):
    """Two horns from the sides, out then curling up and a little forward."""
    for s in (1, -1):
        st = Vector((s * (side_x - 0.01), H["cy"] - 0.005, 0.115))
        path = [st + Vector((s * 0.13 * t, -0.03 * t * t, 0.17 * t ** 2.2)) for t in (0, 0.18, 0.36, 0.54, 0.72, 0.88, 1.0)]
        tube(bm, path, [0.034, 0.031, 0.026, 0.02, 0.014, 0.008, 0.002], n=8)


def part_spikes(bm, tips):
    for base, d, r in tips:
        d = d.normalized(); tube(bm, [base, base + d * 0.04, base + d * 0.075], [r, r * 0.55, 0.002], n=6)


def build_mesh(pid):
    """The variant table: data/props.json build = {shape, parts}. shape picks the base model below (default: the prop's
    own id); parts adds pieces to it (wings, horns, plume, spikes, nasal, brim, earflaps, peak, lames, boss…). A new
    helm variant is one props.json entry — no code — unless it needs a new part."""
    spec = PROPS[pid].get("build", {})
    shape = spec.get("shape", pid)
    parts = set(spec.get("parts", DEFAULT_PARTS.get(shape, [])))
    bm = bmesh.new()
    if shape == "sword_arming":
        n = 8
        loft(bm, [ring(Vector((0, 0, z)), 0.017, 0.017, n) for z in (-0.075, 0.075)])                       # grip
        p = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.03); [setattr(v, "co", v.co + Vector((0, 0, -0.1))) for v in p["verts"]]
        box(bm, Vector((0, 0, 0.09)), 0.26, 0.04, 0.032)                                                     # crossguard
        rings = []
        for z, w in ((0.1, 0.046), (0.25, 0.045), (0.55, 0.04), (0.72, 0.028), (0.82, 0.002)):
            rings.append([Vector((w, 0, z)), Vector((0, -0.007, z)), Vector((-w, 0, z)), Vector((0, 0.007, z))])
        loft(bm, rings, cap1=False)
    elif shape == "staff_oak":
        n = 8; rings = []
        for k in range(9):
            z = -0.62 + 1.62 * k / 8; r = 0.024 - 0.004 * k / 8 + (0.004 if k in (2, 6) else 0)
            rings.append(ring(Vector((0.006 * math.sin(k), 0.005 * math.cos(k * 1.3), z)), r, r, n))
        loft(bm, rings)
        for a in range(3):                                                                                   # three prongs
            ang = 2 * math.pi * a / 3
            d = Vector((math.cos(ang), math.sin(ang), 0))
            pts = [Vector((0, 0, 0.98)) + d * 0.02, Vector((0, 0, 1.06)) + d * 0.07, Vector((0, 0, 1.15)) + d * 0.06, Vector((0, 0, 1.2)) + d * 0.025]
            loft(bm, [ring(pp, 0.014 - 0.003 * i, 0.014 - 0.003 * i, 6) for i, pp in enumerate(pts)])
        c = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.055)
        for v in c["verts"]: v.co = Vector((v.co.x, v.co.y, v.co.z * 1.5 + 1.1))
    elif shape == "shield_heater":
        # outline (x, z), clockwise from the top-left: flat top, straight upper sides, curving in to a point
        pts = [(-0.28 + 0.56 * i / 10, 0.36) for i in range(10)]
        pts += [(0.28, 0.36 - 0.24 * i / 3) for i in range(3)]
        pts += [(0.28 * math.cos(a) ** 1.5, 0.12 - 0.46 * math.sin(a)) for a in [math.pi / 2 * i / 10 for i in range(10)]]
        pts += [(-0.28 * math.cos(a) ** 1.5, 0.12 - 0.46 * math.sin(a)) for a in [math.pi / 2 * (10 - i) / 10 for i in range(10)]]
        pts += [(-0.28, 0.12 + 0.24 * i / 3) for i in range(3)]
        def bulge(x, z): return -0.035 * (1 - (x / 0.3) ** 2) * (1 - ((z - 0.05) / 0.45) ** 2)
        plate_shield(bm, pts, bulge, centre=(0, 0.05), drop=0.05)
    elif shape == "shield":
        # round / kite / tower (build.outline), same plate-with-rim build as the heater
        ol = spec["outline"]
        if ol == "round":
            R = 0.3; pts = [(R * math.cos(-2 * math.pi * i / 28 + math.pi / 2), R * math.sin(-2 * math.pi * i / 28 + math.pi / 2)) for i in range(28)]
            def bulge(x, z): return -0.05 * max(0.0, 1 - (x * x + z * z) / (R * R))
            plate_shield(bm, pts, bulge, centre=(0, 0), drop=0.0, rings_in=(0.35, 0.7))
        elif ol == "kite":
            pts = [(0.25 * math.cos(a), 0.30 + 0.16 * math.sin(a)) for a in [math.pi - math.pi * i / 12 for i in range(13)]]
            # sides fall nearly straight, then sweep in to the point (a power curve made a thin wedge)
            pts += [(0.25 * math.cos(t * math.pi / 2) ** 0.7, 0.30 - 0.82 * t) for t in [i / 10 for i in range(1, 11)]]
            pts += [(-0.25 * math.cos(t * math.pi / 2) ** 0.7, 0.30 - 0.82 * t) for t in [i / 10 for i in range(9, 0, -1)]]
            def bulge(x, z): return -0.06 * (1 - (x / 0.27) ** 2)
            plate_shield(bm, pts, bulge, centre=(0, 0.1), drop=0.1, rings_in=(0.4, 0.75))
        elif ol == "tower":
            W, Z0, Z1 = 0.27, -0.55, 0.45
            pts = [(-W + 2 * W * i / 10, Z1 + 0.04 * math.sin(math.pi * i / 10)) for i in range(10)]
            pts += [(W, Z1 - (Z1 - Z0) * i / 8) for i in range(8)]
            pts += [(W - 2 * W * i / 10, Z0) for i in range(10)]
            pts += [(-W, Z0 + (Z1 - Z0) * i / 8) for i in range(8)]
            def bulge(x, z): return -0.08 * (1 - (x / W) ** 2)
            plate_shield(bm, pts, bulge, centre=(0, -0.05), drop=0.0, rings_in=(0.35, 0.7))
        if "boss" in parts:   # a round iron boss in the middle of the front
            cz = {"round": 0.0, "kite": 0.0, "tower": -0.05}[ol]
            b = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.075)
            bmesh.ops.delete(bm, geom=[v for v in b["verts"] if v.co.y > 0.001], context="VERTS")
            for v in b["verts"]:
                if v.is_valid: v.co = Vector((v.co.x, v.co.y * 0.55 + bulge(v.co.x, v.co.z + cz) - 0.008, v.co.z + cz))
    elif shape == "helm_bulwark":
        # the greathelm; build.parts: plume (default), wings, horns
        H = head_fit(); hx, y0, y1, cy, top = H["hx"], H["y0"], H["y1"], H["cy"], H["top"]
        n = 16; rings = []
        for z, k in ((-0.06, 1.06), (0.0, 1.08), (0.08, 1.12), (0.16, 1.12), (top - 0.03, 1.08), (top + 0.025, 0.86), (top + 0.045, 0.45)):
            rings.append(ring(Vector((0, cy, z)), hx * k + 0.012, (y1 - y0) / 2 * k + 0.012, n, phase=-math.pi / 2))
        # flatten the face plate a little — but never behind the nose: the plate's flat sits 1.5 cm in front of the
        # face's most forward point (round 1 flattened at a fixed depth and the nose came through the eye slit)
        flat = y0 - 0.015
        for r in rings:
            for p in r:
                if p.y < flat: p.y = flat + (p.y - flat) * 0.25
        loft(bm, rings, cap0=False)
        # plume crest: as tall as Codex paints it (about a quarter of the helm's height above the crown), so the painted
        # red plume lands on real geometry (round 1 had a 2 cm ridge; the plume painting fell on nothing)
        if "plume" in parts: part_plume(bm, H, top + 0.045)
        if "wings" in parts: part_wings(bm, H, hx * 1.12 + 0.012)
        if "horns" in parts: part_horns(bm, H, hx * 1.12 + 0.012)
    elif shape == "helm_open":
        # a rounded bascinet with a pointed crown and a hinged snouted visor, shut over the face
        H = head_fit(); hx, y0, y1, cy, top = H["hx"], H["y0"], H["y1"], H["cy"], H["top"]
        n = 16; rings = []
        for z, k, back in ((-0.05, 1.13, 0.006), (0.0, 1.12, 0.003), (0.08, 1.12, 0), (0.16, 1.1, 0.004), (top - 0.03, 1.0, 0.012), (top + 0.015, 0.72, 0.024), (top + 0.04, 0.36, 0.04)):
            rings.append(ring(Vector((0, cy + back, z)), hx * k + 0.012, (y1 - y0) / 2 * k + 0.004, n, phase=-math.pi / 2))
        loft(bm, rings, cap0=False)
        rows = []
        for z in (-0.045, -0.01, 0.025, 0.055, 0.085, 0.115, 0.14):
            row = []; snout = 0.055 * math.exp(-((z - 0.05) / 0.055) ** 2)
            for i in range(11):
                a = -math.pi / 2 + math.radians(-78 + 156 * i / 10)
                rx = hx * 1.12 + 0.03 - (0.012 if z > 0.12 else 0); ry = (y1 - y0) / 2 * 1.12 + 0.012
                pt = Vector((rx * math.cos(a), cy + ry * math.sin(a), z))
                pt.y -= snout * max(0.0, -math.sin(a)) ** 3
                row.append(pt)
            rows.append(row)
        loft_open(bm, rows)
        for sgn in (1, -1):                                                              # hinge bosses
            h_ = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.022)
            for v in h_["verts"]: v.co = Vector((v.co.x * 0.6 + sgn * (hx * 1.12 + 0.03), v.co.y + cy - 0.01, v.co.z + 0.125))
    elif shape == "cap":
        # a dome on the top of the head down to the brow (lower at the back); build.parts: point (a peaked
        # spangenhelm), nasal (a guard down the nose), brim (a kettle hat), earflaps (a leather cap)
        H = head_fit(); top = H["top"]; brow = H["brow"]
        n = 16; pad = 0.012 if "earflaps" in parts else 0.014
        zb = lambda a: brow + 0.004 - 0.03 * (1 + math.sin(a))
        rings = []
        for t in (0.0, 0.3, 0.55, 0.75, 0.88):
            rings.append(hug_ring(H, lambda a, t=t: zb(a) * (1 - t) + (top + 0.012) * t, n, pad + 0.004 * t, shrink=t))
        loft(bm, rings, cap0=False, cap1=False)
        tipz = top + (0.07 if "point" in parts else 0.022)
        tip = bm.verts.new(Vector((0, H["cy"] + (0.004 if "point" in parts else 0.0), tipz)))
        lastv = list(bm.verts)[-n - 1:-1]
        mid = [bm.verts.new((v.co * 0.55 + tip.co * 0.45) + Vector((0, 0, 0.01 if "point" not in parts else 0))) for v in lastv]
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((lastv[i], lastv[j], mid[j], mid[i])); bm.faces.new((mid[i], mid[j], tip))
        base = rings[0]
        if "nasal" in parts:
            def face_y(z):
                near = [p.y for p in H["pts"] if abs(p.x) < 0.02 and abs(p.z - z) < 0.012]
                return min(near) if near else H["y0"]
            path = [Vector((0, face_y(z) - 0.012, z)) for z in (brow + 0.01, brow - 0.02, 0.06, 0.035)]
            tube(bm, path, [0.014, 0.013, 0.012, 0.011], n=6, flat=(Vector((1, 0, 0)), 0.4), cap1=True)
        if "brim" in parts:
            c = Vector((0, H["cy"], 0)); rows = []
            for out, down in ((0.0, 0.0), (0.04, 0.016), (0.08, 0.04), (0.084, 0.05), (0.04, 0.026), (0.0, 0.01)):
                rows.append([p + (Vector((p.x, p.y - c.y, 0)).normalized() * out) - Vector((0, 0, down)) for p in base])
            loft(bm, rows, cap0=False, cap1=False)
        if "earflaps" in parts:
            for side in (0.0, math.pi):
                rows = []
                for z in (zb(side) + 0.004, 0.06, 0.02, -0.02):
                    row = []
                    for i in range(5):
                        a = side + math.radians(-26 + 13 * i)
                        row.append(hug_point(H, a, z, pad + 0.002))
                    rows.append(row)
                loft_open(bm, rows)
    elif shape == "hood":
        # a cloth hood open at the face, falling onto the neck; build.parts: peak (the point hanging at the back)
        H = head_fit(); top = H["top"]; cy = H["cy"]
        n = 19; rows = []
        loose = 1.0 if "peak" in parts else 0.75   # a mail coif sits tighter
        spec_rows = [(-0.11, 30, (0.135, 0.13)), (-0.07, 38, (0.112, 0.115)), (-0.02, 50, 0.022), (0.04, 56, 0.024), (0.10, 52, 0.026),
                     (0.15, 40, 0.028), (0.19, 18, 0.03), (top - 0.01, 0, 0.03)]
        prev = None
        for z, gap, pad in spec_rows:
            row = []
            for i in range(n):
                a = -math.pi / 2 + math.radians(gap) + (2 * math.pi - 2 * math.radians(gap)) * i / (n - 1)
                if isinstance(pad, tuple):
                    rx, ry = pad                                     # round the neck: the coif as loose as the hood
                    if "peak" not in parts: rx += 0.008; ry += 0.012  # (2026-11-23: tighter, the neck came through)
                    row.append(Vector((rx * math.cos(a), cy + 0.01 + ry * math.sin(a), z)))
                else:
                    row.append(hug_point(H, a, z, pad * (0.55 + 0.45 * loose)))
            rows.append(row)
        if "peak" in parts:
            rows.append([Vector((p.x * 0.62, cy + (p.y - cy) * 0.62 + 0.035, top + 0.03)) for p in rows[-1]])
            rows.append([Vector((p.x * 0.28, cy + (p.y - cy) * 0.28 + 0.09, top + 0.025)) for p in rows[-2]])
            tipp = Vector((0, cy + 0.16, top - 0.02))
        else:
            rows.append([Vector((p.x * 0.6, cy + (p.y - cy) * 0.6, top + 0.022)) for p in rows[-1]])
            tipp = Vector((0, cy, top + 0.03))
        vs = loft_open(bm, rows)
        tip = bm.verts.new(tipp)
        for i in range(n - 1): bm.faces.new((vs[-1][i], vs[-1][i + 1], tip))
        bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0005)
    elif shape == "circlet":
        # a thin band round the forehead with a pointed jewel setting at the front
        H = head_fit(); z0 = H["brow"] + 0.02
        n = 22
        rings = [hug_ring(H, z, n, 0.006) for z in (z0 - 0.011, z0, z0 + 0.011)]
        loft(bm, rings, cap0=False, cap1=False)
        fy = rings[1][0].y
        path = [Vector((0, fy - 0.004 + 0.3 * (z - z0), z)) for z in (z0 - 0.012, z0 + 0.004, z0 + 0.022, z0 + 0.04, z0 + 0.058)]
        tube(bm, path, [0.013, 0.024, 0.026, 0.015, 0.003], n=6, flat=(Vector((1, 0, 0)), 0.3), cap1=True)
    elif shape == "hat_wizard":
        # a tall cone with a bent tip and a wide, drooping brim, sitting low on the head
        H = head_fit(); brow = H["brow"]; cy = H["cy"]
        n = 16
        zb = lambda a: brow + 0.012 - 0.022 * (1 + math.sin(a))
        band = hug_ring(H, zb, n, 0.014)
        c = Vector((0, cy, 0)); rows = []
        for out, down in ((0.0, 0.0), (0.05, 0.018), (0.105, 0.045), (0.108, 0.054), (0.05, 0.026), (0.0, 0.01)):
            rows.append([p + (Vector((p.x, p.y - c.y, 0)).normalized() * out) - Vector((0, 0, down)) for p in band])
        loft(bm, rows, cap0=False, cap1=False)
        zc = sum(p.z for p in band) / n; r0 = sum((Vector((p.x, p.y - cy, 0))).length for p in band) / n
        cone = [band]
        for dz, r, back in ((0.06, 0.95, 0.004), (0.12, 0.8, 0.012), (0.18, 0.62, 0.028), (0.235, 0.44, 0.055), (0.28, 0.28, 0.095), (0.305, 0.15, 0.14)):
            rg = ring(Vector((0, cy + back, zc + dz)), r0 * r * 1.02, r0 * r, n, phase=-math.pi / 2)
            for i, pt in enumerate(rg):            # never inside either head (the woman's crown sits further back)
                a = -math.pi / 2 + 2 * math.pi * i / n; r_ = hug_r(H, a, pt.z)
                if r_ is not None:
                    q = Vector((pt.x, pt.y - cy, 0)); need = r_ + 0.014
                    if q.dot(Vector((math.cos(a), math.sin(a), 0))) < need:
                        rg[i] = Vector((math.cos(a) * need, cy + math.sin(a) * need, pt.z))
            cone.append(rg)
        loft(bm, cone, cap0=False, cap1=False)
        tip = bm.verts.new(Vector((0, cy + 0.2, zc + 0.29)))
        lastv = list(bm.verts)[-n - 1:-1]
        for i in range(n): bm.faces.new((lastv[i], lastv[(i + 1) % n], tip))
    elif shape == "pauldron_bulwark":
        # left shoulder: a dome over the joint, its axis tipped outward, plus two lames below on the outer side
        n = 12; rings = []
        for k, (h, r) in enumerate(((-0.06, 0.135), (-0.02, 0.14), (0.03, 0.13), (0.07, 0.1), (0.095, 0.055), (0.105, 0.01))):
            rings.append(ring(Vector((0.02, 0, h)), r, r * 0.92, n))
        vs = loft(bm, rings, cap0=False)
        if "spikes" in parts:   # four iron spikes: crown, outer side, front, back
            part_spikes(bm, [(Vector((0.02, 0, 0.098)), Vector((0.1, 0, 1)), 0.024), (Vector((0.15, 0, 0.035)), Vector((1, 0, 0.45)), 0.026),
                             (Vector((0.06, -0.115, 0.045)), Vector((0.35, -1, 0.5)), 0.022), (Vector((0.06, 0.115, 0.045)), Vector((0.35, 1, 0.5)), 0.022)])
        for v in bm.verts:                                                     # tip outward (+X) by 25°
            v.co = Matrix.Rotation(math.radians(-25), 3, "Y") @ v.co
        for k, (z, r) in enumerate(((-0.085, 0.13), (-0.12, 0.115)) if "lames" in parts else ()):
            arc = [Vector((0.03 + r * math.cos(a), r * 0.95 * math.sin(a), z)) for a in [(-70 + 140 * i / 8) * math.pi / 180 for i in range(9)]]
            top = [bm.verts.new(p + Vector((0.008, 0, 0.035))) for p in arc]; bot = [bm.verts.new(p) for p in arc]
            for i in range(8): bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]))
    elif shape == "hair_ponytail":
        # two crossed cards hanging from the tie, slightly curved back; see-through between painted strand clumps
        rows = 8
        for axis in ("x", "y"):
            vs = []
            for r in range(rows + 1):
                t = r / rows; w = 0.075 * (1 - 0.45 * t); z = -0.42 * t; back = 0.05 * t ** 1.5
                a = Vector((-w, back, z)) if axis == "x" else Vector((0, back - w, z))
                b = Vector((w, back, z)) if axis == "x" else Vector((0, back + w, z))
                vs.append((bm.verts.new(a), bm.verts.new(b)))
            for r in range(rows): bm.faces.new((vs[r][0], vs[r + 1][0], vs[r + 1][1], vs[r][1]))
    elif shape == "cape_wayfarer":
        cols, rows = 10, 12; vs = []
        for r in range(rows + 1):
            t = r / rows; w = 0.22 + 0.09 * t; z = -0.98 * t; out = 0.02 + 0.11 * t ** 1.4
            row = []
            for c in range(cols + 1):
                s = -1 + 2 * c / cols; a = s * 0.95
                # middle furthest back, sides wrapping toward the shoulders (until 2026-11-23 the bow was reversed:
                # the middle sat 5 cm INTO the back and the shoulder blades came through)
                row.append(bm.verts.new(Vector((w * math.sin(a) / math.sin(0.95), out - 0.05 + 0.05 * (math.cos(a) - math.cos(0.95)) / (1 - math.cos(0.95)), z))))
            vs.append(row)
        for r in range(rows):
            for c in range(cols): bm.faces.new((vs[r][c], vs[r + 1][c], vs[r + 1][c + 1], vs[r][c + 1]))
    elif shape == "tabard_flap":
        # WoW-style tabard flaps hanging from the belt (anchor "belt" = the pelvis bone): build.parts front / back, each
        # one flat cloth sheet (straight across, sides bent a little toward the body), hung straight down from the belt
        # in front of (behind) whatever bulges below it on either body. js/tabard.js swings each one about its top
        # edge so a lifted thigh or heel never comes through (props.json place.hang.clear).
        F = torso_fit("pelvis"); top = spec.get("top", F["land"]["belt"]); bot = top - spec.get("length", 0.5)
        w0, w1 = spec.get("width", [0.115, 0.105]); cols, rows = 6, 10
        want = {"front": "front" in parts, "back": "back" in parts}
        for side in ("front", "back"):
            if not want[side]: continue
            sg = -1 if side == "front" else 1; out = min if sg < 0 else max
            cols_prof = [dict(drape(F, side, -w0 + 2 * w0 * c / cols, top, bot, 0.015)) for c in range(cols + 1)]
            pts = []
            for r in range(rows + 1):
                t = r / rows; z = round((top + (bot - top) * t) * 100) / 100
                ys = [p.get(z) for p in cols_prof if p.get(z) is not None]
                base = out(ys) + sg * 0.006 * t if ys else (0.15 * sg)
                w = w0 + (w1 - w0) * t; row = []
                for c in range(cols + 1):
                    u = -1 + 2 * c / cols; y = base - sg * 0.022 * u * u
                    own = cols_prof[c].get(z)
                    if own is not None: y = out(y, own)
                    row.append(Vector((w * u, y, top + (bot - top) * t)))
                pts.append(row)
            sheet(bm, cols, pts)
    elif shape == "tabard_top":
        # the full tabard's upper part (anchor "chest" = spine_03): a front and a back panel from just under the collar
        # to the belt, falling straight from the chest / shoulder blades like cloth, cinched in to the body at the belt
        # where the flaps (tabard_flap) carry on
        F = torso_fit("spine_03"); top = spec.get("top", F["land"]["collar"]); bot = F["land"]["belt"]
        w0, w1 = spec.get("width", [0.13, 0.12]); cols, rows = 8, 12
        for side in ("front", "back"):
            sg = -1 if side == "front" else 1; out = min if sg < 0 else max
            # cloth spans straight across the chest (it does not dip between the pecs or the bust, first try 2026-11-23):
            # each row sits at its most outward column, the sides bent back a little, never inside the body
            pts = []
            for r in range(rows + 1):
                t = r / rows; z = round((top + (bot - top) * t) * 100) / 100
                w = w0 + (w1 - w0) * t; us = [-1 + 2 * c / cols for c in range(cols + 1)]
                hang = [dict(drape(F, side, w * u, top, bot, 0.018)).get(z) for u in us]
                raw = [drape(F, side, w * u, z, z, 0.018)[0][1] for u in us]
                belt = [drape(F, side, w * u, bot, bot, 0.018)[0][1] for u in us]
                k = max(0.0, min(1.0, (bot + 0.09 - z) / 0.09)); k = k * k * (3 - 2 * k)   # cinch over the last 9 cm
                hv = [h for h in hang if h is not None]; bv = [h for h in belt if h is not None]
                base = out(hv) if hv else sg * 0.15
                if bv: base = base + (out(bv) - base) * k
                row = []
                for u, rw in zip(us, raw):
                    y = base - sg * 0.025 * u * u
                    if rw is not None: y = out(y, rw)
                    row.append(Vector((w * u, y, z)))
                pts.append(row)
            sheet(bm, cols, pts)
    if shape in HEAD_SHAPES or shape == "shield": bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.0003)
    me = bpy.data.meshes.new(pid); bm.normal_update(); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(pid, me); bpy.context.scene.collection.objects.link(o)
    if shape not in ("cape_wayfarer", "hair_ponytail"):
        for p in me.polygons: p.use_smooth = shape in ("helm_bulwark", "helm_open", "cap", "hood", "hat_wizard", "pauldron_bulwark", "staff_oak")
    return o


def unwrap(o):
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode="OBJECT")
    # an open shell (hood, coif) has no inside to measure against, so "consistent" may point every face inward and the
    # bake then sees almost nothing (hood 2026-11-23: 18% of points seen). Face them away from the middle.
    me = o.data; c = sum((v.co for v in me.vertices), Vector()) / max(1, len(me.vertices))
    if sum((p.center - c).dot(p.normal) * p.area for p in me.polygons) < 0 and not PROPS[o.name].get("seeThrough"):
        me.flip_normals()
    # a cape is one sheet: its painted outside must face away from the back (+Y). Facing the body, the bake used the
    # inside painting everywhere and cut its strap notch out as a hole (both capes until 2026-11-23)
    if PROPS[o.name]["place"]["anchor"] == "upper_back" and sum(p.normal.y * p.area for p in me.polygons) < 0:
        me.flip_normals()
    # tabard sheets: each panel / flap faces away from the body (front ones -Y, back ones +Y), face by face
    if PROPS[o.name]["place"]["anchor"] in ("belt", "chest"):
        bm = bmesh.new(); bm.from_mesh(me); bm.normal_update()
        bad = [f for f in bm.faces if f.normal.y * f.calc_center_median().y < 0]
        if bad: bmesh.ops.reverse_faces(bm, faces=bad)
        bm.to_mesh(me); bm.free(); me.update()


def views(pid, o):
    """Four orthographic clay views sized to the prop (same scale for all), for the Codex paint-over sheet."""
    cos = [o.matrix_world @ v.co for v in o.data.vertices]
    x0, x1 = min(c.x for c in cos), max(c.x for c in cos); y0, y1 = min(c.y for c in cos), max(c.y for c in cos)
    z0, z1 = min(c.z for c in cos), max(c.z for c in cos)
    H_PX = 1024
    ppm = min(H_PX * 0.86 / (z1 - z0), 1440 / (2 * (x1 - x0) + 2 * (y1 - y0) + 0.08))
    height = H_PX / ppm; cz = (z0 + z1) / 2
    W = {"front": x1 - x0, "back": x1 - x0, "left": y1 - y0, "right": y1 - y0}
    C = {"front": (x0 + x1) / 2, "back": (x0 + x1) / 2, "left": (y0 + y1) / 2, "right": (y0 + y1) / 2}
    me = o.data; me.materials.clear(); me.materials.append(P.flat_material("clay", (0.78, 0.76, 0.74, 1), 0.85))
    if PROPS[pid].get("seeThrough"):
        sd = o.modifiers.new("th", "SOLIDIFY"); sd.thickness = 0.004
    L.studio(bg=(0.62, 0.62, 0.62), sun=2.4)
    sc = bpy.context.scene; sc.render.film_transparent = True; sc.render.image_settings.color_mode = "RGBA"
    out = {}
    for v, wm in W.items():
        w = int(wm * ppm) + 24
        w += w % 2
        # move the camera's horizontal centre onto the prop's middle for this view
        camc = Vector((C[v], 0, cz)) if v in ("front", "back") else Vector((0, C[v], cz))
        p = P.ortho_views(os.path.join(BUILD, f"prop_{pid}_view"), (v,), height=height, size=(w, H_PX), centre_z=cz,
                          centre_xy=(camc.x, camc.y))
        out[v] = {"file": os.path.basename(p[v]), "w": w, "centre": C[v]}
    json.dump({"height_m": height, "h_px": H_PX, "centre_z": cz, "views": out, "bounds": {"x": [x0, x1], "y": [y0, y1], "z": [z0, z1]}},
              open(os.path.join(BUILD, f"prop_{pid}_views.json"), "w"), indent=1)
    for m in list(o.modifiers): o.modifiers.remove(m)


def head_poke(o):
    """Head points outside a head prop's shell, per body (the woman's head scaled the way her socket scales the prop):
    a point is through when a short ray toward the head's middle meets the prop and the ray outward does not."""
    bvh = BVHTree.FromPolygons([v.co.copy() for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
    Pinv = place_matrix(PROPS[o.name], head_pivot(head_fit())).inverted(); R = Pinv.to_3x3()   # the prop's own seat
    res = {}
    for body in ("male", "female"):
        hb, hx, y0, y1, ztop, pts = head_size(body); k = hx / 0.098; mk = head_size("male")[1] / 0.098
        c = Vector((0, (y0 + y1) / 2 - hb.y, 0.07 * k))
        through, worst, tight, at = 0, 0.0, 0, None
        for p in pts:
            d = (p - c).normalized()
            q = Pinv @ (p / k)                                         # this body's head point in the prop's frame (socket scale = k)
            dq = (R @ d).normalized()
            out = bvh.ray_cast(q + dq * 1e-4, dq, 0.4)
            inn = bvh.ray_cast(q - dq * 1e-4, -dq, 0.035)
            if inn[0] is not None and out[0] is None:
                through += 1
                if inn[3] > worst: worst = inn[3]; at = [round(c_, 3) for c_ in q]
            elif out[0] is not None and out[3] < 0.004: tight += 1
        res[body] = {"through": through, "worst_mm": round(worst * 1000, 1), "tight": tight, "worst_at": at}
    return res


def head_checks(pid, o):
    """Both head checks for a head prop: build/prop_<id>_poke.json (head through it) + build/prop_<id>_eyes.json."""
    pk = head_poke(o); print("POKE", pid, pk)
    json.dump(pk, open(os.path.join(BUILD, f"prop_{pid}_poke.json"), "w"))
    ey = eye_check(o, PROPS[pid])
    print("EYES", pid, "closed helm" if ey["coversFace"] else "", {b: f'{ey[b]["blocked"]}/{ey[b]["rays"]} rays blocked' for b in ("male", "female")})
    json.dump(ey, open(os.path.join(BUILD, f"prop_{pid}_eyes.json"), "w"))
    return pk, ey


if cmd == "build":
    pid = args[1]
    if PROPS[pid]["place"]["anchor"] in ("head", "head_back"):
        head_size("female"); head_size("male")                         # measure first: opening a body file wipes the scene
    if PROPS[pid]["place"]["anchor"] in ("belt", "chest"):
        torso_fit({"belt": "pelvis", "chest": "spine_03"}[PROPS[pid]["place"]["anchor"]])
    L.reset()
    o = build_mesh(pid)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in list(bpy.data.objects):
        if ob is not o: bpy.data.objects.remove(ob)
    unwrap(o)
    print("RES", pid, "tris", sum(len(p.vertices) - 2 for p in o.data.polygons))
    if PROPS[pid]["place"]["anchor"] == "head":
        head_checks(pid, o)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, f"prop_{pid}.blend"))
    views(pid, o)

elif cmd == "check":
    # the head checks again on the props as built (no rebuild, so the paintings stay valid): poke-through of either
    # head and eye clearance. tb_prop.py -- check [id …] (default: every head prop)
    ids = args[1:] or [k for k, v in PROPS.items() if v["place"]["anchor"] == "head"]
    head_size("female"); head_size("male")
    bad = []
    for pid in ids:
        bpy.ops.wm.open_mainfile(filepath=os.path.join(BUILD, f"prop_{pid}.blend"))
        pk, ey = head_checks(pid, bpy.data.objects[pid])
        if any(pk[b]["worst_mm"] > 5 for b in ("male", "female")) or (not ey["coversFace"] and any(ey[b]["blocked"] for b in ("male", "female"))):
            bad.append(pid)
    print("RES check", "all clear" if not bad else "PROBLEMS: " + ", ".join(bad))

elif cmd == "bake":
    import tb_project as TP
    pid = args[1]
    bpy.ops.wm.open_mainfile(filepath=os.path.join(BUILD, f"prop_{pid}.blend"))
    o = bpy.data.objects[pid]
    meta = json.load(open(os.path.join(BUILD, f"prop_{pid}_views.json")))
    bvh = BVHTree.FromPolygons([o.matrix_world @ v.co for v in o.data.vertices], [tuple(p.vertices) for p in o.data.polygons])
    size = PROPS[pid].get("texture", 512)
    png = os.path.join(BUILD, f"prop_{pid}_tex.png")
    see = bool(PROPS[pid].get("seeThrough"))
    TP.project_bake(o, bvh, meta, {k: os.path.join(BUILD, f"prop_{pid}_paint_{k}.png") for k in TP.VIEWS}, png, size,
                    alpha=see, spread=0.0, label=pid)
    # final material: the baked picture (alpha-cut when see-through), exported with the model
    for a_ in [a for a in o.data.attributes if a.name.startswith("w_") or a.name == "ppos"]: o.data.attributes.remove(a_)
    for c in list(o.data.color_attributes): o.data.color_attributes.remove(c)
    m = bpy.data.materials.new(pid); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); b.inputs["Roughness"].default_value = 0.9
    t = m.node_tree.nodes.new("ShaderNodeTexImage"); t.image = bpy.data.images.load(png)
    m.node_tree.links.new(t.outputs["Color"], b.inputs["Base Color"])
    if see:
        m.node_tree.links.new(t.outputs["Alpha"], b.inputs["Alpha"])
        m.surface_render_method = "DITHERED"
        try: m.blend_method = "CLIP"
        except Exception: pass
    o.data.materials.clear(); o.data.materials.append(m)
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
    if PROPS[pid]["place"]["anchor"] == "belt":
        # tabard flaps: one node per flap ('front', 'back'), so an item can wear only the front one and js/tabard.js
        # swings each about its own top edge
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type="LOOSE"); bpy.ops.object.mode_set(mode="OBJECT")
        for ob in [x for x in bpy.data.objects if x.type == "MESH"]:
            cy = sum(v.co.y for v in ob.data.vertices) / len(ob.data.vertices)
            ob.name = "front" if cy < 0 else "back"; ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f"{pid}.glb"), use_selection=True, export_image_format="WEBP",
                              export_image_quality=85)
    print("RES exported", pid)

elif cmd == "sockets":
    # Where each prop sits on each body at rest, as a matrix in its bone's own space (what three.js parents it to).
    res = {}; male_torso = None; pivot = None
    for body in ("male", "female"):
        bpy.ops.wm.open_mainfile(filepath=L.final_blend(body))
        arm = next(x for x in bpy.data.objects if x.type == "ARMATURE"); bodyo = bpy.data.objects["Body"]
        AW = arm.matrix_world
        B = {b.name: b for b in arm.data.bones}
        hw = lambda n: AW @ B[n].head_local
        tw = lambda n: AW @ B[n].tail_local
        nz = hw("neck_01").z
        hv = [bodyo.matrix_world @ v.co for v in bodyo.data.vertices if (bodyo.matrix_world @ v.co).z > nz + 0.03]
        head_scale = max(abs(v.x) for v in hv)                      # compared with the male's below
        res[body] = {"_head_halfwidth": head_scale}
        if pivot is None:   # the man's head middle in prop space (place.turn swings head props about it; see place_matrix)
            hbm = hw("Head"); pivot = Vector((0, (min(v.y for v in hv) + max(v.y for v in hv)) / 2 - hbm.y, 0.5 * (max(v.z for v in hv) - hbm.z)))
        torso = hw("neck_01").z - hw("pelvis").z; male_torso = male_torso or torso   # tabards: scaled by torso length

        def M(loc, xcol, ycol, zcol, s=1.0):
            m = Matrix((xcol, ycol, zcol)).transposed().to_4x4()
            for i in range(3):
                for j in range(3): m[i][j] *= s
            m.translation = loc
            return m

        def bone_space(bone, world):
            return (AW @ B[bone].matrix_local).inverted() @ world

        def mlist(m): return [m[r][c] for c in range(4) for r in range(4)]    # column-major, like three.js

        hand_dir = (tw("hand_r") - hw("hand_r")).normalized()
        palm = hw("hand_r") + hand_dir * 0.075 + Vector((0, 0, -0.03))
        fa_dir = (tw("lowerarm_l") - hw("lowerarm_l")).normalized()
        fore = hw("lowerarm_l").lerp(tw("lowerarm_l"), 0.5) + Vector((0, 0, 0.065))
        # the back's farthest point over the whole upper back (shoulder blades included): measuring one band at the
        # chest let the shoulder blades come through both capes while walking (2026-11-23 QA close-ups)
        chest_back = max(v.y for v in (bodyo.matrix_world @ v.co for v in bodyo.data.vertices) if hw("spine_02").z < v.z < hw("neck_01").z and abs(v.x) < 0.16) + 0.02   # + room for the shoulder blades moving with the arms
        for pid, pr in PROPS.items():
            a = pr["place"]["anchor"]; socks = []
            if a == "palm_r":
                # weapon: up the prop (+Z) leaves the fist on the thumb side (forward at rest), tilted back up the arm
                # by `tilt` degrees, so with the arm hanging the blade or staff stands up at an angle instead of
                # pointing level at the ground ahead (rest "back up the arm" = up once the arm hangs)
                tl = math.radians(pr["place"].get("tilt", 40))
                z = (Vector((0, -1, 0)) * math.cos(tl) + (-hand_dir) * math.sin(tl)).normalized()
                y = (Vector((0, 0, 1)) - z * z.z).normalized(); x = y.cross(z)
                socks.append(("hand_r", M(palm, tuple(x), tuple(y), tuple(z))))
            elif a == "forearm_l":  # shield on the back of the left forearm, face outward (+Z at rest), top toward the elbow
                socks.append(("lowerarm_l", M(fore, (0, 1, 0), (0, 0, -1), (-fa_dir.x, -fa_dir.y, -fa_dir.z))))
            elif a == "head":
                s = head_scale / 0.098
                socks.append(("Head", M(hw("Head"), (1, 0, 0), (0, 1, 0), (0, 0, 1), s) @ place_matrix(pr, pivot)))
            elif a in ("belt", "chest"):   # tabard flaps on the pelvis, the full tabard's panels on the chest
                bn = "pelvis" if a == "belt" else "spine_03"
                socks.append((bn, M(hw(bn), (1, 0, 0), (0, 1, 0), (0, 0, 1), torso / male_torso)))
            elif a == "shoulder":
                for sd, sg in (("_l", 1), ("_r", -1)):
                    loc = hw("upperarm" + sd) + Vector((0.0, 0.0, 0.035))
                    s = 1.0 if body == "male" else 0.88
                    m = M(loc, (sg, 0, 0), (0, 1, 0), (0, 0, 1), s)       # the right one is the left one mirrored
                    socks.append(("clavicle" + sd, m))
            elif a == "head_back":   # ponytail tie: the back of the skull, a little above ear height
                hb = hw("Head"); back_y = max(v.y for v in hv)
                socks.append(("Head", M(Vector((0, back_y - 0.01, hb.z + 0.09)), (1, 0, 0), (0, 1, 0), (0, 0, 1), head_scale / 0.098)))
            elif a == "upper_back":
                loc = Vector((0, chest_back + 0.025, hw("neck_01").z - 0.01))
                socks.append(("spine_03", M(loc, (1, 0, 0), (0, 1, 0), (0, 0, 1), 1.0 if body == "male" else 0.93)))
            res[body][pid] = [{"bone": b, "matrix": [round(x, 5) for x in mlist(bone_space(b, m))]} for b, m in socks]
        # grips for the fal.ai weapons (avatar-3d/fal, models/final/props/*.glb, their catalog's `grip`): the SAME rule
        # as avatar-3d/fal/tools/blender/sockets.py (read, not imported — Helper A owns it): palm a little down the hand
        # toward the middle finger, prop +Z out of the fist forward, tilted back up the arm (18° right / 40° left); shield on the back of
        # the left forearm; everything scaled by body height / 1.8 m. Same skeleton, so any fal weapon fits.
        zs = [(bodyo.matrix_world @ v.co).z for v in bodyo.data.vertices]; k = (max(zs) - min(zs)) / 1.8
        grips = {"_scale": round(k, 4)}
        for side in ("r", "l"):
            hd = (hw(f"middle_01_{side}") - hw(f"hand_{side}")).normalized()
            # tilt: 18° in the right hand, like Tabard's own sword (fal's 40° laid maces and axes along the forearm in
            # the ready / attack poses — 2026-11-23 close-ups); the bow in the left hand keeps fal's 40°
            pp = hw(f"hand_{side}") + hd * 0.075 * k + Vector((0, 0, -0.03 * k)); t40 = math.radians(18 if side == "r" else 40)
            z = (Vector((0, -1, 0)) * math.cos(t40) + (-hd) * math.sin(t40)).normalized()
            y = (Vector((0, 0, 1)) - z * z.z).normalized(); x = y.cross(z)
            grips["palm_" + side] = [{"bone": f"hand_{side}", "matrix": [round(v_, 5) for v_ in mlist(bone_space(f"hand_{side}", M(pp, tuple(x), tuple(y), tuple(z), k)))]}]
            if side == "r":
                # pole_r: staffs, spears and two-handers — the shaft straight through the fist at a right angle to the
                # forearm (tilt 0). At 18° (or the old staff's 65°) a long shaft lay along the upper arm (owner
                # 2026-11-23). js/tabard.js bends the elbow forward while such a weapon is held, so it stands up.
                z = Vector((0, -1, 0)); y = (Vector((0, 0, 1)) - z * z.z).normalized(); x = y.cross(z)
                grips["pole_r"] = [{"bone": "hand_r", "matrix": [round(v_, 5) for v_ in mlist(bone_space("hand_r", M(pp, tuple(x), tuple(y), tuple(z), k)))]}]
        la, ha = hw("lowerarm_l"), hw("hand_l"); fd = (ha - la).normalized()
        fo = la.lerp(ha, 0.5) + Vector((0, 0, 0.065 * k))
        grips["forearm_l"] = [{"bone": "lowerarm_l", "matrix": [round(v_, 5) for v_ in mlist(bone_space("lowerarm_l", M(fo, (0, 1, 0), (0, 0, -1), tuple(-fd), k)))]}]
        res[body]["_grips"] = grips
    json.dump(res, open(os.path.join(OUT, "sockets.json"), "w"), indent=1)
    print("RES sockets", list(res["male"]))
