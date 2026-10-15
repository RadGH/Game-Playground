# Chibi 4 — step 1 (Blender MCP, "by eye"): the robed mage built from a Codex reference sheet.
#
# Run inside Blender (the lead fetches it over HTTP and exec()s it through Blender MCP). Everything it needs is served
# from BASE: the silhouette measurements (tools/silhouette.py) and the three reference pictures.
#   1. The body + robe + neck + head are ONE loft: a ring per centimetre of height whose width comes from the front
#      picture's outline and whose depth comes from the side picture's outline. The nose is pushed out to the side
#      outline; everything else on the face is paint.
#   2. Boots are two lofts from the outline below the hem; arms are tubes along the line the picture shows.
#   3. Paint: each picture is projected straight onto the model from its own direction (front, side, back) and blended
#      by which way the surface faces. Step 1 keeps the projection live; the bake to a texture comes with export.
import bpy, bmesh, json, math, os, tempfile, urllib.request
from mathutils import Vector

BASE = "http://192.168.1.34:8766/"
TMP = os.path.join(tempfile.gettempdir(), "chibi4")
os.makedirs(TMP, exist_ok=True)
H = 1.80
# picture -> world mapping: image size, figure box (x, y, w, h) in pixels, and which world axis is picture-right
PICS = {
    "front": ("mage-front.png", 755, 1145, (81, 21, 647, 1065), ("x", 1)),
    "side": ("mage-side.png", 618, 1145, (157, 23, 240, 1063), ("y", -1)),
    "back": ("mage-back.png", 1373, 1145, (354, 23, 658, 1064), ("x", -1)),
}


def fetch(name):
    p = os.path.join(TMP, name)
    urllib.request.urlretrieve(BASE + name, p)
    return p


sil = json.load(open(fetch("mage-silhouette.json")))


def table(rows):
    return {round(z, 2): r for z, r in rows}


def run_at(rows, z, pick):
    """The runs on the row nearest height z, reduced by pick(runs) -> (a, b) or None."""
    best = min(rows, key=lambda r: abs(r[0] - z))
    return pick(best[1]) if best[1] else None


def central(runs, gap=0.012):
    """Union of the runs that touch the centre line (joined across gaps under 1.2 cm)."""
    runs = sorted(runs)
    groups, cur = [], list(runs[0])
    for a, b in runs[1:]:
        if a - cur[1] <= gap: cur[1] = max(cur[1], b)
        else: groups.append(cur); cur = [a, b]
    groups.append(cur)
    hit = [g for g in groups if g[0] <= 0.0 <= g[1]]
    return hit[0] if hit else min(groups, key=lambda g: abs((g[0] + g[1]) / 2))


def smooth(vals, k):
    out = []
    for i in range(len(vals)):
        w = vals[max(0, i - k): i + k + 1]
        out.append(sum(w) / len(w))
    return out


def median(vals, k):
    out = []
    for i in range(len(vals)):
        w = sorted(vals[max(0, i - k): i + k + 1])
        out.append(w[len(w) // 2])
    return out


def ring(cx, cy, rx, ryf, ryb, n, e):
    """A superellipse ring, front half (toward -y) with radius ryf, back half with ryb."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        c, s = math.cos(t), math.sin(t)
        x = cx + rx * math.copysign(abs(c) ** (2 / e), c)
        ry = ryf if s < 0 else ryb
        y = cy + ry * math.copysign(abs(s) ** (2 / e), s)
        pts.append((x, y))
    return pts


def loft(name, rings, cap_bottom=False, cap_top=True):
    """rings: list of (z, [(x, y), ...]) bottom to top, all the same length."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    rows = [[bm.verts.new((x, y, z)) for x, y in pts] for z, pts in rings]
    n = len(rows[0])
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    if cap_top:
        top = bm.verts.new((sum(v.co.x for v in rows[-1]) / n, sum(v.co.y for v in rows[-1]) / n, rings[-1][0] + 0.004))
        for i in range(n): bm.faces.new((rows[-1][i], rows[-1][(i + 1) % n], top))
    if cap_bottom:
        bot = bm.verts.new((sum(v.co.x for v in rows[0]) / n, sum(v.co.y for v in rows[0]) / n, rings[0][0]))
        for i in range(n): bm.faces.new((rows[0][(i + 1) % n], rows[0][i], bot))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    return ob


# ---------------------------------------------------------------- body, robe, neck, head: one loft
Z0, Z1, DZ = 0.29, H - 0.014, 0.01
zs = [Z0 + i * DZ for i in range(int((Z1 - Z0) / DZ) + 1)]
fr = [run_at(sil["front"], z, central) for z in zs]
sd = [run_at(sil["side"], z, central) for z in zs]
cx = smooth([(a + b) / 2 for a, b in fr], 2)
rx = smooth([(b - a) / 2 for a, b in fr], 2)
# side picture: picture-right is the face direction = world -y
yf_raw = [-b for a, b in sd]                     # front-most (toward -y)
yb = smooth([-a for a, b in sd], 2)              # back-most
yf = median(yf_raw, 3)                            # the face's plane without the nose
yf = smooth(yf, 1)
rings = []
NOSE = (1.585, 1.685)
for i, z in enumerate(zs):
    head = z > 1.52
    e = 2.0 if head else (2.6 if z < 1.30 else 2.3)
    cy = (yf[i] + yb[i]) / 2
    ry = (yb[i] - yf[i]) / 2
    dome = 1.0
    if globals().get("C4_DOME") and z > Z1 - 0.07:              # step 2: round the crown instead of a flat cap
        k = (z - (Z1 - 0.07)) / 0.07
        dome = max(0.12, math.sqrt(max(0.0, 1 - k * k)))
    pts = ring(cx[i], cy, max(rx[i] * 0.97 * dome, 0.02), ry * 0.97 * dome, ry * 0.97 * dome, 40, e)
    if NOSE[0] < z < NOSE[1]:
        push = yf_raw[i] - yf[i]                 # negative = nose sticks out
        if push < 0:
            pts = [(x, y + push * max(0.0, 1 - ((x - cx[i]) / 0.022) ** 2) * (1 if y < cy else 0)) for x, y in pts]
    rings.append((z, pts))
if globals().get("C4_DOME"):
    rings = [(z + (0.012 * ((z - (Z1 - 0.07)) / 0.07) if z > Z1 - 0.07 else 0), p) for z, p in rings]
body = loft("C4_Mage_Body", rings, cap_top=True)

# ---------------------------------------------------------------- boots: two lofts below the hem
legs = []
for side in (-1, 1):
    lr = []
    for z in [0.012 + i * 0.01 for i in range(0, 34)]:
        row = min(sil["front"], key=lambda r: abs(r[0] - z))[1]
        mine = [r for r in row if (r[0] + r[1]) / 2 * side > 0.04 and r[1] - r[0] < 0.2]
        if not mine:                                    # under the robe: carry the last leg ring straight up
            if lr: lr.append((z, [(x, y) for x, y in lr[-1][1]]))
            continue
        a, b = min(mine, key=lambda r: abs((r[0] + r[1]) / 2 - side * 0.17))
        s = run_at(sil["side"], z, central)
        y0, y1 = -s[1], -s[0]
        lr.append((z, ring((a + b) / 2, (y0 + y1) / 2, (b - a) / 2 * 0.9, (y1 - y0) / 2 * 0.92, (y1 - y0) / 2 * 0.92, 24, 2.4)))
    legs.append(loft(f"C4_Mage_Boot{'L' if side < 0 else 'R'}", lr, cap_bottom=True, cap_top=False))

# ---------------------------------------------------------------- arms: sleeve tube + hand, along the picture's line
def tube(name, path, cuff=False):
    """path: list of (point Vector, radius_side, radius_depth); rings perpendicular to the path.
    cuff=True (step 2): the open end turns inward — a lip, then the sleeve's inside narrows back to the wrist — so the
    sleeve closes round the arm instead of ending in a cone."""
    rings_ = []
    n = 20
    for k, (p, r1, r2) in enumerate(path):
        p0 = path[max(0, k - 1)][0]; p1 = path[min(len(path) - 1, k + 1)][0]
        t = (p1 - p0).normalized()
        u = t.cross(Vector((0, 1, 0))).normalized()
        v = t.cross(u).normalized()
        rings_.append([p + u * (r1 * math.cos(2 * math.pi * i / n)) + v * (r2 * math.sin(2 * math.pi * i / n)) for i in range(n)])
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rows = [[bm.verts.new(c) for c in r] for r in rings_]
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(n): bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]))
    if cuff:
        p, r1, r2 = path[-1]
        t = (path[-1][0] - path[-2][0]).normalized()
        u = t.cross(Vector((0, 1, 0))).normalized(); v = t.cross(u).normalized()
        def mk(c, a, b): return [bm.verts.new(c + u * (a * math.cos(2 * math.pi * i / n)) + v * (b * math.sin(2 * math.pi * i / n))) for i in range(n)]
        lip = mk(p - t * 0.008, r1 * 0.9, r2 * 0.9)
        inner = mk(p - t * 0.11, 0.036, 0.032)
        for r0, r1_ in ((rows[-1], lip), (lip, inner)):
            for i in range(n): bm.faces.new((r0[i], r0[(i + 1) % n], r1_[(i + 1) % n], r1_[i]))
        tip = bm.verts.new(p - t * 0.13)
        for i in range(n): bm.faces.new((inner[i], inner[(i + 1) % n], tip))
    else:
        tip = bm.verts.new(path[-1][0] + (path[-1][0] - path[-2][0]).normalized() * 0.01)
        for i in range(n): bm.faces.new((rows[-1][i], rows[-1][(i + 1) % n], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    for f in me.polygons: f.use_smooth = True
    return bpy.data.objects.new(name, me)


arms = []
for side in (-1, 1):
    sh = Vector((side * 0.215, 0.0, 1.37))
    el = Vector((side * 0.36, 0.0, 1.14))
    cuff = Vector((side * 0.47, 0.0, 0.97))
    wr = Vector((side * 0.475, 0.0, 0.985))
    tipp = Vector((side * 0.535, -0.01, 0.86))
    path = []
    for k in range(9):                                   # sleeve: shoulder -> elbow -> bell cuff, widening
        t = k / 8
        p = sh.lerp(el, t * 2) if t < 0.5 else el.lerp(cuff, (t - 0.5) * 2)
        r = 0.065 + 0.055 * max(0.0, (t - 0.35) / 0.65) ** 1.6
        path.append((p, r, r * 0.9))
    sleeve = tube(f"C4_Mage_Sleeve{'L' if side < 0 else 'R'}", path, cuff=globals().get("C4_CUFF", False))
    hand = tube(f"C4_Mage_Hand{'L' if side < 0 else 'R'}", [
        (wr.lerp(el, 0.18), 0.027, 0.024), (wr, 0.028, 0.022), (wr.lerp(tipp, 0.45), 0.034, 0.015),
        (wr.lerp(tipp, 0.8), 0.028, 0.012), (tipp, 0.015, 0.009)])
    arms += [sleeve, hand]

# ---------------------------------------------------------------- paint: three pictures projected and blended
def proj_material():
    m = bpy.data.materials.get("C4_Mage_Paint") or bpy.data.materials.new("C4_Mage_Paint")
    m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); L = nt.links.new
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = 0.7
    L(bsdf.outputs[0], out.inputs[0])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); L(geo.outputs["Position"], sep.inputs[0])
    nsep = nt.nodes.new("ShaderNodeSeparateXYZ"); L(geo.outputs["Normal"], nsep.inputs[0])

    def math_(op, a, b=None):
        n = nt.nodes.new("ShaderNodeMath"); n.operation = op
        for idx, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): n.inputs[idx].default_value = v
            else: L(v, n.inputs[idx])
        return n.outputs[0]

    cols, weights = [], []
    for key, (file, W, Hp, (bx, by, bw, bh), (axis, sign)) in PICS.items():
        img = bpy.data.images.load(fetch(file), check_existing=True)
        s = H / bh
        cxp = bx + bw / 2
        bot = by + bh
        hor = sep.outputs["X" if axis == "x" else "Y"]
        u = math_("ADD", math_("MULTIPLY", hor, sign / (W * s)), cxp / W)
        v = math_("ADD", math_("MULTIPLY", sep.outputs["Z"], 1 / (Hp * s)), 1 - bot / Hp)
        uv = nt.nodes.new("ShaderNodeCombineXYZ"); L(u, uv.inputs[0]); L(v, uv.inputs[1])
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img; tex.extension = "EXTEND"
        L(uv.outputs[0], tex.inputs[0])
        cols.append(tex.outputs[0])
        if key == "front": w = math_("MAXIMUM", math_("MULTIPLY", nsep.outputs["Y"], -1), 0.0)
        elif key == "back": w = math_("MAXIMUM", nsep.outputs["Y"], 0.0)
        else: w = math_("ADD", math_("ABSOLUTE", nsep.outputs["X"]), math_("MULTIPLY", math_("MAXIMUM", nsep.outputs["Z"], 0.0), 0.35))
        weights.append(math_("POWER", w, 4.0))
    total = math_("ADD", math_("ADD", weights[0], weights[1]), weights[2])
    acc = None
    for c, w in zip(cols, weights):
        mix = nt.nodes.new("ShaderNodeVectorMath"); mix.operation = "SCALE"
        L(c, mix.inputs[0]); L(math_("DIVIDE", w, total), mix.inputs["Scale"])
        if acc is None: acc = mix.outputs[0]
        else:
            add = nt.nodes.new("ShaderNodeVectorMath"); add.operation = "ADD"
            L(acc, add.inputs[0]); L(mix.outputs[0], add.inputs[1]); acc = add.outputs[0]
    L(acc, bsdf.inputs["Base Color"])
    return m


col = bpy.data.collections.get("C4_Step1") or bpy.data.collections.new("C4_Step1")
if col.name not in bpy.context.scene.collection.children: bpy.context.scene.collection.children.link(col)
for o in list(col.objects): bpy.data.objects.remove(o, do_unlink=True)
for me_ in list(bpy.data.meshes):
    if me_.users == 0: bpy.data.meshes.remove(me_)
mat = proj_material()
for o in [body] + legs + arms:
    col.objects.link(o)
    o.data.materials.append(mat)
    sub = o.modifiers.new("Smooth", "SUBSURF"); sub.levels = 1; sub.render_levels = 1
# ---------------------------------------------------------------- a soft studio: grey sky light + warm key + cool rim
sc = bpy.context.scene
w = sc.world or bpy.data.worlds.new("World"); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.42, 0.44, 0.48, 1); bg.inputs[1].default_value = 0.9
for name, rot, energy, colr in (("C4_Key", (math.radians(50), 0, math.radians(-35)), 3.2, (1.0, 0.95, 0.88)),
                                ("C4_Rim", (math.radians(60), 0, math.radians(150)), 2.0, (0.8, 0.88, 1.0))):
    ld = bpy.data.lights.get(name) or bpy.data.lights.new(name, "SUN")
    ld.energy = energy; ld.color = colr; ld.angle = math.radians(12)
    lo = bpy.data.objects.get(name) or bpy.data.objects.new(name, ld)
    if lo.name not in col.objects: col.objects.link(lo)
    lo.rotation_euler = rot
old = bpy.data.objects.get("Light")
if old: old.hide_render = True

print("step1 built:", [o.name for o in col.objects], sum(len(o.data.polygons) for o in col.objects if o.type == "MESH"), "faces")
