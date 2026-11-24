# Tabard step 2d — the face layer and the face data (round 4, 2026-11-23).
#
#   blender -b --python tb_face.py -- <male|female>        (edits build/<body>_fit.blend in place; safe to run again)
#
# In:  build/<body>_fit.blend (the finished body, tb_fit.py), build/<body>_asis.glb (the original Quaternius eyes and
#      eyebrows, which tb_body.py drops), data/shapes.json (the same head growth tb_body.py / tb_fit.py applied)
# Out: object `face_layer` in build/<body>_fit.blend — a copy of the head's front and sides (ear to ear, hairline to
#        under the chin, the two eye openings left open), same bone weights, pushed 0.4 mm out along its normals, with
#        its OWN texture layout: u = angle round the head's up axis, v = angle up/down from eye height (a globe's
#        longitude / latitude), both times the same radius, so a centimetre across = a centimetre down
#      models/<body>_face.json — eyes (centre, radius, forward, lid outline) in the Head bone's own frame, and the
#        face's landmarks in the face texture (see "_doc" in the file)
#      build/<body>_facemap.json — triangles for tools/head_clean.py: the head box's texture points with their 3D
#        place, the face layer's triangles in both layouts, the landmarks in world space
#      shots/<body>_face_{front,tq,side,zoom}.png (TB_FACE_SHOTS=1) — the landmarks as coloured balls on the body, to check by eye
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L

body = sys.argv[sys.argv.index("--") + 1]
BUILD = os.path.join(L.TABARD, "build")
SH = json.load(open(os.path.join(L.TABARD, "data", "shapes.json")))[body]
REG = json.load(open(os.path.join(L.TABARD, "data", "regions.json")))
FIT_PATH = os.path.join(BUILD, f"{body}_fit.blend")
PUSH = 0.0004            # how far the face layer sits out from the skin (m)
TEX = 1024               # face texture size the landmarks are scaled for (they are 0..1)

# ---------------------------------------------------------------- 1. the original eyes + brows, reshaped like the head
L.reset()
objs = L.import_glb(os.path.join(BUILD, f"{body}_asis.glb"))
arm0 = next(o for o in objs if o.type == "ARMATURE")
H0 = arm0.matrix_world @ arm0.data.bones["Head"].head_local
grow = SH["grow"].get("Head", 1.0)


def reshape(p):
    """Where a point of the original head ends up in the finished body (tb_body grow about the Head bone's head, then
    tb_fit's scale if the head is in it)."""
    q = H0 + (Vector(p) - H0) * grow
    k = SH.get("fit", {}).get("scale", {}).get("Head")
    if k: q = H0 + (q - H0) * k
    return q


def pts_of(prefix):
    o = next(o for o in objs if o.type == "MESH" and o.name.startswith(prefix))
    return np.array([tuple(reshape(o.matrix_world @ v.co)) for v in o.data.vertices])


def fit_sphere(P):
    A = np.c_[2 * P, np.ones(len(P))]; b = (P ** 2).sum(1); x = np.linalg.lstsq(A, b, rcond=None)[0]
    c = x[:3]; return Vector(c), float(math.sqrt(x[3] + c @ c))


EP, BP = pts_of("Eyes"), pts_of("Eyebrows")
EYES = {}
for side, sg in (("l", 1), ("r", -1)):          # +x = the character's own left
    c, r = fit_sphere(EP[EP[:, 0] * sg > 0]); EYES[side] = {"c": c, "r": r}
BROWS = {s: BP[BP[:, 0] * sg > 0] for s, sg in (("l", 1), ("r", -1))}

# ---------------------------------------------------------------- 2. the finished body
bpy.ops.wm.open_mainfile(filepath=FIT_PATH)
for o in list(bpy.data.objects):
    if o.name.startswith("face_layer"): bpy.data.objects.remove(o)
for m in list(bpy.data.meshes):
    if m.users == 0: bpy.data.meshes.remove(m)
mesh = bpy.data.objects["Body"]; arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
MW = mesh.matrix_world
WV = [MW @ v.co for v in mesh.data.vertices]
bvh = BVHTree.FromPolygons(WV, [tuple(p.vertices) for p in mesh.data.polygons])
HM = arm.matrix_world @ arm.data.bones["Head"].matrix_local      # Head bone frame (rest) -> world
HMi = HM.inverted()


def ray(o, d, far=2.0):
    h = bvh.ray_cast(Vector(o), Vector(d).normalized(), far)
    return h[0], h[1]


def front_hit(x, z):
    """Surface point seen straight from the front (-Y) at (x, z)."""
    return ray((x, -1.0, z), (0, 1, 0))[0]


def side_hit(sg, y, z):
    return ray((sg * 1.0, y, z), (-sg, 0, 0))[0]


ez = (EYES["l"]["c"].z + EYES["r"]["c"].z) / 2
# profile down the middle of the face (x = 0): y (depth) per height, 0.5 mm steps
zs = np.arange(ez + 0.12, ez - 0.20, -0.0005)
prof = []
for z in zs:
    h = front_hit(0.0, z); prof.append(h.y if h is not None else np.nan)
prof = np.array(prof)


def zi(z): return int(round((ez + 0.12 - z) / 0.0005))


def argext(z0, z1, fn):
    i0, i1 = sorted((zi(z0), zi(z1))); seg = prof[i0:i1 + 1]
    k = int(fn(seg)); return zs[i0 + k], seg[k]


# nose tip = the most forward point between the eyes and the mouth
tip_z, tip_y = argext(ez - 0.02, ez - 0.09, np.nanargmin)
# under the nose (subnasale): the deepest point just below the tip
# (walking down from the tip: the nose's underside runs steeply back, then the lip levels off — that turn)
i = zi(tip_z)
while i + 1 < len(prof) and not (prof[i] - tip_y > 0.008 and prof[i + 1] - prof[i] < 0.0002): i += 1
sub_z = zs[i]
# chin bottom: the last height before the front ray jumps back to the neck
i = zi(sub_z - 0.03)
while i + 1 < len(prof) and not (np.isnan(prof[i + 1]) or prof[i + 1] - prof[i] > 0.008): i += 1
menton_z = zs[i]
print(f"RES profile: tip {tip_z:.3f} under the nose {sub_z:.3f} chin bottom {menton_z:.3f}")


def slit_strength(x, z):
    """How much deeper the surface is at (x, z) than 2.5 mm above and below (the mouth slit is a narrow groove)."""
    a, b, c = front_hit(x, z + 0.0025), front_hit(x, z), front_hit(x, z - 0.0025)
    if a is None or b is None or c is None: return 0.0
    return b.y - (a.y + c.y) / 2


# mouth: the slit between the lips is a narrow groove (often closed right at the middle). Per column across the face,
# the strongest groove in the band under the nose; the mouth line is their median height, the corners where it fades.
def slit_at(x):
    best = (0.0, None)
    for z in np.arange(sub_z - 0.004, sub_z - 0.034, -0.0005):
        s_ = slit_strength(x, z)
        if s_ > best[0]: best = (s_, z)
    return best


cols = [(x, *slit_at(x)) for x in np.arange(0.003, 0.05, 0.001)]
mid = float(np.median([c[1] for c in cols[:8]]))
strong = [c for c in cols if c[1] > 0.3 * mid]        # the slit fades out at the corners (the cheek crease stays weak)
if os.environ.get("TB_FACE_DEBUG"): print("RES slit", [(round(x, 3), round(s_ * 1000, 2), round(z, 4) if z else None) for x, s_, z in cols])
mouth_z = float(np.median([c[2] for c in strong[:12]])) if strong else (sub_z - 0.018)
corners = {}
for side, sg in (("l", 1), ("r", -1)):
    run = None
    for x, s_, z in cols:          # walk out from the middle; the corner = the last strong column before a gap
        if s_ > 0.3 * mid and abs(z - mouth_z) < 0.008: run = (sg * x, z)
        elif run is not None and x > run[0] * sg + 0.004: break
    corners[side] = run or (sg * 0.02, mouth_z)
ul_z = mouth_z + (sub_z - mouth_z) * 0.4               # lip centres: the lips meet at the middle, so by proportion
ll_z = mouth_z - (mouth_z - menton_z) * 0.17
chin_z, _ = argext(menton_z + 0.4 * (mouth_z - menton_z), menton_z + 0.003, np.nanargmin)   # most forward point of the chin
print(f"RES mouth {mouth_z:.4f} upper lip {ul_z:.4f} lower lip {ll_z:.4f} chin {chin_z:.4f}")
print("RES mouth corners", {k: (round(v[0], 4), round(v[1], 4)) for k, v in corners.items()})

# lids: looking from the front, the eye opening is where the skin lies BEHIND the eyeball's surface (an eyeball there
# would be seen). A fine grid of rays from the front finds it; its outline is the lid edge, put on the eyeball surface.
for side, e in EYES.items():
    c, r = e["c"], e["r"]; st = 0.0004
    gx = np.arange(c.x - 1.6 * r, c.x + 1.6 * r, st); gz = np.arange(c.z - 1.2 * r, c.z + 1.2 * r, st)
    open_ = np.zeros((len(gz), len(gx)), bool)
    for a_, z in enumerate(gz):
        for b_, x in enumerate(gx):
            dx, dz = x - c.x, z - c.z
            if dx * dx + dz * dz >= r * r: continue
            h = front_hit(x, z); sy = c.y - math.sqrt(r * r - dx * dx - dz * dz)      # the eyeball's front at (x, z)
            open_[a_, b_] = h is None or h.y > sy + 0.0002
    # keep the biggest blob round the centre
    from collections import deque
    lab = np.zeros_like(open_, int); best, bl = 0, 0; n = 0
    for a_ in range(len(gz)):
        for b_ in range(len(gx)):
            if open_[a_, b_] and not lab[a_, b_]:
                n += 1; q = deque([(a_, b_)]); lab[a_, b_] = n; cnt = 0
                while q:
                    i_, j_ = q.popleft(); cnt += 1
                    for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        u_, w_ = i_ + di, j_ + dj
                        if 0 <= u_ < len(gz) and 0 <= w_ < len(gx) and open_[u_, w_] and not lab[u_, w_]: lab[u_, w_] = n; q.append((u_, w_))
                if cnt > best: best, bl = cnt, n
    m = lab == bl
    def on_ball(x, z):
        dx, dz = x - c.x, z - c.z; return Vector((x, c.y - math.sqrt(max(0.0, r * r - dx * dx - dz * dz)), z))
    colsx = np.nonzero(m.any(0))[0]
    upper, lower = [], []
    for j_ in colsx:
        rows = np.nonzero(m[:, j_])[0]
        upper.append(on_ball(gx[j_], gz[rows.max()] + st / 2)); lower.append(on_ball(gx[j_], gz[rows.min()] - st / 2))
    sg = 1 if side == "l" else -1
    if sg < 0: upper.reverse(); lower.reverse()          # inner (nose side) first
    inner = on_ball(upper[0].x, (upper[0].z + lower[0].z) / 2); outer = on_ball(upper[-1].x, (upper[-1].z + lower[-1].z) / 2)

    def resample(line, n=7):
        out = [inner]
        for k in range(1, n - 1):
            t = k / (n - 1); xx = inner.x + (outer.x - inner.x) * t
            out.append(min(line, key=lambda p: abs(p.x - xx)))
        return out + [outer]
    e["inner"], e["outer"] = inner, outer
    e["upper"], e["lower"] = resample(upper), resample(lower)
    e["outline"] = [inner] + resample(upper, 12)[1:-1] + [outer] + list(reversed(resample(lower, 12)[1:-1]))
    print(f"RES eye {side}: centre {tuple(round(x, 4) for x in c)} r {r:.4f}; opening {abs(outer.x - inner.x) * 1000:.1f} mm wide, "
          f"{(max(p.z for p in upper) - min(p.z for p in lower)) * 1000:.1f} mm tall")

# brows: the original brow meshes, read across in bins (inner end, highest point, outer end), put on the skin
BRW = {}
for side, P in BROWS.items():
    ax = np.abs(P[:, 0]); bins = np.linspace(ax.min(), ax.max(), 8)
    line = []
    for k in range(7):
        sel = P[(ax >= bins[k]) & (ax <= bins[k + 1])]
        if len(sel): line.append(sel.mean(0))
    line = [Vector(p) for p in line]

    def on_skin(p):
        h = front_hit(p.x, p.z); return h if h is not None else p
    # the original brows run far past the eye; end them a little past the outer eye corner
    lim = abs(EYES[side]["c"].x) + EYES[side]["r"] * 0.95 + 0.008
    line = [p for p in line if abs(p.x) <= lim] + ([Vector((math.copysign(lim, line[-1].x), line[-1].y, line[-1].z))] if abs(line[-1].x) > lim else [])
    peak = max(line[1:-1], key=lambda p: p.z)
    BRW[side] = {"inner": on_skin(line[0]), "peak": on_skin(peak), "outer": on_skin(line[-1]), "line": [on_skin(p) for p in line]}

# ears: side view; the ear stands out from the skull. Skull = a strongly smoothed side depth; ear = clearly beyond it.
EAR = {}
for side, sg in (("l", 1), ("r", -1)):
    ys_ = np.arange(-0.06, 0.08, 0.002); zz = np.arange(ez + 0.06, ez - 0.10, -0.002)
    X = np.full((len(zz), len(ys_)), np.nan)
    for a_, z in enumerate(zz):
        for b_, y in enumerate(ys_):
            h = side_hit(sg, y, z)
            if h is not None: X[a_, b_] = abs(h.x)
    # skull width per height: the median over the head's depth (the ear is a short bump)
    skull = np.nanmedian(X, axis=1)[:, None]
    ear = (X - skull) > 0.008
    ear &= (np.arange(len(ys_))[None, :] > 0)
    ii, jj = np.nonzero(ear)
    if len(ii) == 0: raise SystemExit(f"no ear found on {body}")
    # keep the biggest blob near eye height
    EAR[side] = {"front_y": float(ys_[jj.min()]), "back_y": float(ys_[jj.max()]), "top_z": float(zz[ii.min()]),
                 "bottom_z": float(zz[ii.max()]), "x": float(np.nanmax(X[ear]))}
print("RES ears", {k: {kk: round(vv, 3) for kk, vv in v.items()} for k, v in EAR.items()})

# jaw: seen from the front, per column from the chin out toward the ear, the lowest point where the ray still meets
# the face before it jumps back to the neck (or misses) — the jaw's lower edge, chin -> ear
JAW = {}
for side, sg in (("l", 1), ("r", -1)):
    line = []
    xe = EAR[side]["x"] * 0.74          # out to just inside the face layer's edge in front of the ear
    for k in range(9):
        x = sg * xe * k / 8; prev = None; edge = None
        z0 = mouth_z - 0.006 if abs(x) < corners[side][0] * sg + 0.012 else ez - 0.03     # below the nose and mouth slits
        for z in np.arange(z0, menton_z - 0.06, -0.0005):
            h = front_hit(x, z)
            # a jump back (the neck) or the surface turning to face down (steeper than ~72°: the jaw's underside)
            if h is None or (prev is not None and h.y - prev.y > 0.0015): edge = prev; break
            prev = h
        if edge is not None: line.append(edge)
    JAW[side] = line
print("RES jaw points", {k: len(v) for k, v in JAW.items()})

# face front for the head axis: the head's middle front-to-back at eye height
yf = min(p.y for p in WV if abs(p.z - ez) < 0.01 and abs(p.x) < 0.03)
yb = max(p.y for p in WV if abs(p.z - ez) < 0.01 and abs(p.x) < 0.03)
YC = (yf + yb) / 2; ZC = ez

# hairline: rule of thirds (hairline to brow = brow to under the nose), held below where the forehead turns back
brow_z = (BRW["l"]["peak"].z + BRW["r"]["peak"].z) / 2
hl_z = brow_z + (brow_z - sub_z) * 0.95
for z in np.arange(brow_z + 0.01, hl_z, 0.001):          # forehead tilts back past 50° from straight ahead -> stop
    a, b = front_hit(0, z), front_hit(0, z + 0.002)
    if a is None or b is None or (b.y - a.y) / 0.002 > math.tan(math.radians(50)): hl_z = z; break
print(f"RES brow {brow_z:.3f} hairline {hl_z:.3f}")


def surf_toward(target, sg):
    """Surface point closest to a 3D guess: ray from the head axis out through it."""
    o = Vector((0, YC, target.z)); d = (target - o); d.z = 0
    h = bvh.ray_cast(o + d.normalized() * 0.3, -d.normalized(), 0.6)
    return h[0] if h[0] is not None else target


LM = {}   # world-space landmarks: name -> Vector or [Vector]
for side, sg in (("l", 1), ("r", -1)):
    e = EYES[side]; ear = EAR[side]
    LM[f"eye_{side}"] = front_hit(e["c"].x, e["c"].z) or e["c"]
    LM[f"eye_inner_{side}"] = e["inner"]; LM[f"eye_outer_{side}"] = e["outer"]
    LM[f"lid_upper_{side}"] = e["upper"]; LM[f"lid_lower_{side}"] = e["lower"]
    LM[f"brow_inner_{side}"] = BRW[side]["inner"]; LM[f"brow_peak_{side}"] = BRW[side]["peak"]; LM[f"brow_outer_{side}"] = BRW[side]["outer"]
    LM[f"brow_line_{side}"] = BRW[side]["line"]
    LM[f"mouth_corner_{side}"] = front_hit(*corners[side])
    nx = sg * 0.42 * abs(e["inner"].x) + sg * 0.004
    LM[f"nostril_{side}"] = front_hit(nx, (tip_z + sub_z) / 2 - 0.002)
    LM[f"cheekbone_{side}"] = front_hit(e["outer"].x * 0.95, (e["c"].z + tip_z) / 2 - 0.004)
    LM[f"temple_{side}"] = surf_toward(Vector((sg * 0.1, (BRW[side]["outer"].y + ear["front_y"]) / 2, BRW[side]["outer"].z)), sg)
    LM[f"sideburn_top_{side}"] = side_hit(sg, ear["front_y"] - 0.008, ear["top_z"] - 0.004)
    LM[f"sideburn_bottom_{side}"] = side_hit(sg, ear["front_y"] - 0.008, (ear["top_z"] + ear["bottom_z"]) / 2 - 0.006)
    LM[f"ear_top_{side}"] = side_hit(sg, ear["front_y"] + 0.006, ear["top_z"] - 0.002)
    LM[f"ear_lobe_{side}"] = side_hit(sg, ear["front_y"] + 0.006, ear["bottom_z"] + 0.003)
    LM[f"jaw_{side}"] = JAW[side]
LM["nose_tip"] = front_hit(0, tip_z); LM["nose_bridge"] = front_hit(0, (brow_z + ez) / 2 - 0.004)
LM["subnasale"] = front_hit(0, sub_z)
LM["lip_upper"] = front_hit(0, ul_z); LM["mouth"] = front_hit(0, mouth_z); LM["lip_lower"] = front_hit(0, ll_z)
LM["chin"] = front_hit(0, chin_z); LM["chin_bottom"] = front_hit(0, menton_z + 0.001)
# hairline from the left sideburn top over the forehead to the right one
hl = []
for k in range(9):
    t = k / 8; a_ = (t - 0.5) * 2                                   # -1 (right) .. 1 (left)
    sg = 1 if a_ >= 0 else -1; st = LM[f"sideburn_top_{'l' if sg > 0 else 'r'}"]
    if abs(a_) < 0.5:       # forehead: curved gently, corners a little higher (slight widow's peak recess)
        x = a_ * abs(BRW["l"]["outer"].x) * 1.2; z = hl_z + 0.006 * (abs(a_) / 0.5) ** 2
        hl.append(front_hit(x, z) or Vector((x, yf, z)))
    else:                   # temple: from the forehead corner back down to the sideburn top
        s = (abs(a_) - 0.5) / 0.5
        corner = Vector((sg * abs(BRW["l"]["outer"].x) * 0.6, yf, hl_z + 0.006))
        g = corner.lerp(st, s); g.z = corner.z + (st.z - corner.z) * s ** 1.6
        hl.append(surf_toward(g, sg))
LM["hairline"] = hl
for k, v in LM.items():
    if v is None or (isinstance(v, list) and (not v or any(p is None for p in v))): raise SystemExit(f"landmark {k} not found on {body}")

# ---------------------------------------------------------------- 3. the face layer mesh
# which faces: in front of the ears, below the hairline (+1.5 cm for a fringe/stubble edge), above a slanted plane from
# under the chin to under the ear lobe (beards need the underside of the jaw), and not inside an eye socket
ear_front = min(EAR["l"]["front_y"], EAR["r"]["front_y"])
top_z = hl_z + 0.02
throat = Vector((0, LM["chin_bottom"].y + 0.05, menton_z - 0.03))
below_ear = Vector((0, ear_front, min(EAR["l"]["bottom_z"], EAR["r"]["bottom_z"]) - 0.025))
pn = Vector((0, -(below_ear.z - throat.z), below_ear.y - throat.y)).normalized()   # normal of the lower plane
if (LM["mouth"] - throat).dot(pn) < 0: pn = -pn                                     # ... pointing at the face


def in_face(p):
    if p.y > ear_front - 0.003 or p.z > top_z or p.z < menton_z - 0.04: return False
    return (p - throat).dot(pn) >= 0


def in_socket(f):
    """Every corner of the face behind the eyeball's surface: the eyeball hides it, so the layer leaves it open."""
    return any(all((MW @ v.co - e["c"]).length < e["r"] for v in f.verts) for e in EYES.values())


fl = mesh.copy(); fl.data = mesh.data.copy(); fl.name = fl.data.name = "face_layer"
bpy.context.scene.collection.objects.link(fl)
fl.parent = mesh.parent; fl.matrix_world = mesh.matrix_world.copy()
bm = bmesh.new(); bm.from_mesh(fl.data); bm.faces.ensure_lookup_table()
drop = [f for f in bm.faces if not in_face(MW @ f.calc_center_median()) or in_socket(f)]
bmesh.ops.delete(bm, geom=drop, context="FACES")
# keep the biggest connected piece (drops stray bits behind the ears)
bm.faces.ensure_lookup_table(); seen = set(); pieces = []
for f in bm.faces:
    if f.index in seen: continue
    st = [f]; seen.add(f.index); comp = []
    while st:
        g = st.pop(); comp.append(g)
        for e in g.edges:
            for h in e.link_faces:
                if h.index not in seen: seen.add(h.index); st.append(h)
    pieces.append(comp)
pieces.sort(key=len, reverse=True)
if len(pieces) > 1: bmesh.ops.delete(bm, geom=[f for c in pieces[1:] for f in c], context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
bm.normal_update()
for v in bm.verts: v.co += v.normal * PUSH        # vertex normals = the body's own (same faces round each point)

# its own texture layout
body_uv = bm.loops.layers.uv["UVMap"]
fuv = bm.loops.layers.uv.new("FaceUV")
W2 = [MW @ v.co for v in bm.verts]
RAD = float(np.median([math.hypot(p.x, p.y - YC) for p in W2]))


def lonlat(p):
    rho = math.hypot(p.x, p.y - YC)
    return math.atan2(p.x, -(p.y - YC)) * RAD, math.atan2(p.z - ZC, rho) * RAD


LL = [lonlat(p) for p in W2]
u0, u1 = min(a for a, _ in LL), max(a for a, _ in LL); v0, v1 = min(b for _, b in LL), max(b for _, b in LL)
M_ = 0.03; span = max(u1 - u0, v1 - v0) / (1 - 2 * M_)
U0 = (u0 + u1) / 2 - span / 2; V0 = (v0 + v1) / 2 - span / 2


def to_uv(p):
    """World point -> face texture (u right, v DOWN from the top, 0..1)."""
    a, b = lonlat(p); return ((a - U0) / span, 1 - (b - V0) / span)


for f in bm.faces:
    for l in f.loops:
        u, vd = to_uv(MW @ l.vert.co); l[fuv].uv = (u, 1 - vd)     # Blender keeps v up
tri_rows = []
for f in bm.faces:
    vs = f.loops
    for k in range(1, len(vs) - 1):
        tri = (vs[0], vs[k], vs[k + 1])
        tri_rows.append([[list(l[body_uv].uv), list(l[fuv].uv)] for l in tri])
bm.to_mesh(fl.data); bm.free()
me = fl.data
# only the face layout goes to the browser
me.uv_layers.active = me.uv_layers["FaceUV"]
me.uv_layers.remove(me.uv_layers["UVMap"]); me.uv_layers["FaceUV"].name = "UVMap"
for p in me.polygons: p.use_smooth = True
if os.environ.get("TB_FACE_DEBUG"): print("RES face bounds", ear_front, top_z, throat, below_ear)
print(f"RES face_layer: {len(me.polygons)} faces, {len(me.vertices)} points, radius {RAD:.3f}, "
      f"texture spans {(u1 - u0) * 100:.1f} x {(v1 - v0) * 100:.1f} cm")
bpy.ops.wm.save_as_mainfile(filepath=FIT_PATH)

# ---------------------------------------------------------------- 4. data out
def head_local(p): return [round(x, 5) for x in (HMi @ p)]


def uvr(p): return [round(x, 4) for x in to_uv(p)]


fwd = (HMi.to_3x3() @ Vector((0, -1, 0))).normalized()
eyes_out = {}
for side, e in EYES.items():
    eyes_out[side] = {"centre": head_local(e["c"]), "radius": round(e["r"], 5), "forward": [round(x, 5) for x in fwd],
                      "inner": head_local(e["inner"]), "outer": head_local(e["outer"]),
                      "lid_upper": [head_local(p) for p in e["upper"]], "lid_lower": [head_local(p) for p in e["lower"]],
                      "opening": [head_local(p) for p in e["outline"][::max(1, len(e["outline"]) // 24)]]}
lm_uv = {k: ([uvr(p) for p in v] if isinstance(v, list) else uvr(v)) for k, v in LM.items()}
lm_head = {k: ([head_local(p) for p in v] if isinstance(v, list) else head_local(v)) for k, v in LM.items()}
out = {
    "_doc": ("Tabard face data (tools/blender/tb_face.py). eyes: in the Head bone's own frame (metres; the same frame as "
             "models/props/sockets.json — bone frames are identical in Blender and three.js): centre, radius, forward "
             "(unit, where the eye looks), inner/outer corner, lid_upper / lid_lower (inner -> outer corner, on the "
             "skin where the lid meets the eyeball), opening (the socket's outline, going round). uv: landmarks in "
             "face_layer's own texture, 0..1, u to the RIGHT of the picture = the character's LEFT (as when looking "
             "at the face), v DOWN (0 = top of the picture; canvas pixel = uv * size). head: the same landmarks in the "
             "Head bone frame. Lists run inner -> outer (brows, lids), chin -> ear (jaw), right sideburn -> left "
             "sideburn (hairline). _l = the character's left. layout: how face_layer's texture is laid out."),
    "body": body, "texture": f"models/{body}/face.webp", "size": TEX,
    "layout": {"kind": "longitude-latitude", "axis": "vertical line through x=0, at the head's middle front-to-back",
               "radius_m": round(RAD, 4), "metres_per_uv": round(span, 4),
               "about": "u = angle round the head's up axis x radius; v = angle above/below eye height x radius (same "
                        "scale both ways: 1 cm across = 1 cm down near eye height)"},
    "eyes": eyes_out, "uv": lm_uv, "head": lm_head,
}
json.dump(out, open(os.path.join(L.TABARD, "models", f"{body}_face.json"), "w"), indent=1)

# for tools/head_clean.py: the head box's triangles (body texture layout + 3D place) and the face layer's triangles
x0, y0, w, h = REG["regions"]["head"]["rect"]; S = REG["size"]
uvl = mesh.data.uv_layers["UVMap"].data
head_tris = []
for p in mesh.data.polygons:
    us = [uvl[li].uv for li in p.loop_indices]
    if not all(x0 <= u.x * S <= x0 + w and y0 <= (1 - u.y) * S <= y0 + h for u in us): continue
    li = list(p.loop_indices); vi = list(p.vertices)
    for k in range(1, len(li) - 1):
        head_tris.append([[list(uvl[li[j]].uv), [round(c, 5) for c in (MW @ mesh.data.vertices[vi[j]].co)]] for j in (0, k, k + 1)])
world = {k: ([list(p) for p in v] if isinstance(v, list) else list(v)) for k, v in LM.items()}
world["eyes"] = {s: {"c": list(e["c"]), "r": e["r"]} for s, e in EYES.items()}
world["hairline_z"] = hl_z; world["ears"] = EAR; world["axis"] = [YC, ZC]
json.dump({"head_tris": head_tris, "face_tris": tri_rows, "world": world},
          open(os.path.join(BUILD, f"{body}_facemap.json"), "w"))

# ---------------------------------------------------------------- 5. look: landmarks as balls on the body + the layer
if os.environ.get("TB_FACE_SHOTS") == "1":     # TB_FACE_SHOTS=1: the check pictures (slow)
    import tb_pose as P
    for o in list(bpy.data.objects):
        if o.name.startswith("geo_"): o.hide_render = True
    mesh.data.materials.clear(); mesh.data.materials.append(P.flat_material("clay", (0.8, 0.7, 0.6, 1)))
    fl.data.materials.clear(); fl.data.materials.append(P.flat_material("layer", (0.55, 0.75, 0.9, 1)))
    cols = {"eye": (0.9, 0.1, 0.1, 1), "brow": (0.1, 0.1, 0.1, 1), "lid": (0.9, 0.9, 0.1, 1), "mouth": (0.8, 0.1, 0.6, 1),
            "lip": (0.8, 0.1, 0.6, 1), "nos": (0.1, 0.7, 0.2, 1), "jaw": (0.1, 0.3, 0.9, 1), "hair": (0.4, 0.2, 0.05, 1),
            "side": (0.4, 0.2, 0.05, 1), "chin": (0.1, 0.3, 0.9, 1), "temple": (1, 0.5, 0, 1), "cheek": (1, 0.5, 0, 1),
            "ear": (0, 0.8, 0.8, 1), "sub": (0.1, 0.7, 0.2, 1)}
    mats = {k: P.flat_material("m_" + k, c) for k, c in cols.items()}
    for k, v in LM.items():
        m = next((mm for kk, mm in mats.items() if k.startswith(kk)), mats["eye"])
        for p in (v if isinstance(v, list) else [v]):
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.0016, location=p + Vector((0, -0.0015, 0)), segments=8, ring_count=6)
            bpy.context.object.data.materials.append(m)
    for e in EYES.values():
        bpy.ops.mesh.primitive_uv_sphere_add(radius=e["r"], location=e["c"]); bpy.context.object.data.materials.append(P.flat_material("eyeball", (0.95, 0.95, 0.95, 1)))
    L.studio()
    sc = bpy.context.scene; camd = bpy.data.cameras.new("FC"); cam = bpy.data.objects.new("FC", camd); sc.collection.objects.link(cam)
    sc.camera = cam; sc.render.engine = "BLENDER_EEVEE"; sc.render.resolution_x = sc.render.resolution_y = 640
    c = Vector((0, -0.04, ZC - 0.03))
    for name, d, dist in (("front", (0, -1, 0.03), 0.55), ("tq", (0.75, -1, 0.1), 0.55), ("side", (1, -0.02, 0.03), 0.55), ("zoom", (0, -1, 0.03), 0.3)):
        cam.location = c + Vector(d).normalized() * dist; cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        camd.lens = 50; sc.render.filepath = os.path.join(L.TABARD, "shots", f"{body}_face_{name}.png")
        bpy.ops.render.render(write_still=True)
print("RES face data", os.path.join("models", f"{body}_face.json"))
