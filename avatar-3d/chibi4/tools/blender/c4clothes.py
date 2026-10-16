# Chibi 4 — step 5: OUR clothing on a MakeHuman body, built by script from the body itself.
#
# Every garment is measured off the character it is made for, so it fits any slider body:
#   shell(...)      an offset shell: the body's own faces in a region (picked by skeleton weights + height), pushed out
#                   along their normals — trousers, undershirt, jerkin, boots, bracers, pauldrons
#   hull_loft(...)  rings stacked up the body; each ring is the body's outline at that height (the furthest body point
#                   in each of N directions from the spine) pushed out — robes, mantles, belts, collars, skirts
#   tube(...)       rings along an arm — bell sleeves
#   box(...)        rounded blocks — pouches, buckles
# Then:
#   skin_to(...)    copy the body's bone weights onto the garment (nearest surface) and add the armature
#   mask_body(...)  BODY MASKING: every body vertex a garment covers goes in the vertex group 'c4_hidden', and a Mask
#                   modifier removes those faces — skin cannot poke through what is not there
#   clip_report(..) vertices of hair/hat/garments that sit INSIDE the body (or a garment inside another)
#   project_bake(..) step 2's paint: each reference picture paints only what its camera can see (a ray test), unseen
#                   spots are filled from neighbours, the result is baked to one texture on the garments' own UVs
import bpy, bmesh, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree


# ------------------------------------------------------------------ reading the body
class Body:
    """The basemesh as it is after sliders (shape keys mixed), in world space, with bone weights per vertex. Helper
    geometry (MakeHuman's hidden fitting cages) is dropped; indices still match the basemesh."""

    def __init__(self, basemesh, rig):
        self.obj, self.rig = basemesh, rig
        saved = [(m, m.show_viewport) for m in basemesh.modifiers]
        for m, _ in saved: m.show_viewport = False                 # no mask, no subdivision: keep vertex indices
        deps = bpy.context.evaluated_depsgraph_get()
        ev = basemesh.evaluated_get(deps); me = ev.to_mesh()
        mw = basemesh.matrix_world
        self.co = [mw @ v.co for v in me.vertices]
        self.no = [(mw.to_3x3() @ v.normal).normalized() for v in me.vertices]
        self.faces = [tuple(p.vertices) for p in me.polygons]
        ev.to_mesh_clear()
        for m, s in saved: m.show_viewport = s
        names = {g.index: g.name for g in basemesh.vertex_groups}
        self.w = [dict() for _ in self.co]
        for v in basemesh.data.vertices:
            for g in v.groups:
                if g.weight > 0.001: self.w[v.index][names[g.group]] = g.weight
        self.real = [d.get("body", 0) > 0.5 for d in self.w]
        self.idx = [i for i, r in enumerate(self.real) if r]
        self.real_faces = [f for f in self.faces if all(self.real[i] for i in f)]
        zs = [self.co[i].z for i in self.idx]
        self.top, self.bot = max(zs), min(zs)
        self.H = self.top - self.bot
        self.cx = sum(self.co[i].x for i in self.idx) / len(self.idx)
        self.bone = {}
        for b in rig.data.bones:
            self.bone[b.name] = (rig.matrix_world @ b.head_local, rig.matrix_world @ b.tail_local)
        self.kd = KDTree(len(self.idx))
        for k, i in enumerate(self.idx): self.kd.insert(self.co[i], k)
        self.kd.balance()
        self.bvh = BVHTree.FromPolygons([tuple(c) for c in self.co], self.real_faces)

    def head(self, b): return self.bone[b][0]
    def tail(self, b): return self.bone[b][1]

    def wsum(self, i, bones):
        d = self.w[i]
        return sum(d.get(b, 0) for b in bones)

    def pick(self, bones, thr=0.5, zmin=-9, zmax=9, test=None):
        out = set()
        for i in self.idx:
            c = self.co[i]
            if not (zmin <= c.z <= zmax): continue
            if self.wsum(i, bones) < thr: continue
            if test and not test(c, self.no[i], i): continue
            out.add(i)
        return out

    def inside(self, p, eps=0.0):
        """Is a point inside the body? Nearest surface point + its normal (MakeHuman's body is closed enough)."""
        hit = self.bvh.find_nearest(p)
        if hit[0] is None: return False
        loc, n, _, d = hit
        return (p - loc).dot(n) < -eps


TORSO = ["pelvis", "spine_01", "spine_02", "spine_03", "clavicle_l", "clavicle_r", "neck_01"]
ARM_L = ["upperarm_l", "lowerarm_l"]; ARM_R = ["upperarm_r", "lowerarm_r"]
LEG_L = ["thigh_l", "calf_l"]; LEG_R = ["thigh_r", "calf_r"]
FOOT_L = ["foot_l", "ball_l"]; FOOT_R = ["foot_r", "ball_r"]


def _obj(name, bm, smooth=True, col=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(o)
    return o


# ------------------------------------------------------------------ garment builders
def shell(name, body, verts, d, smooth=2, taper=0.0, col=None):
    """The body's faces whose corners are all in `verts`, pushed out by d along the body normal (taper: extra push in
    the middle of the region, none at its rim, for a fuller cut). Returns the object and the body indices it covers."""
    faces = [f for f in body.real_faces if all(i in verts for i in f)]
    used = sorted({i for f in faces for i in f})
    bm = bmesh.new(); m = {}
    for i in used: m[i] = bm.verts.new(body.co[i] + body.no[i] * d)
    for f in faces:
        try: bm.faces.new([m[i] for i in f])
        except ValueError: pass
    bm.verts.ensure_lookup_table()
    rim = {v for v in bm.verts if v.is_boundary}
    if taper:
        # distance from the rim in rings, so the push grows toward the middle
        dist = {v: 0 for v in rim}; frontier = list(rim); k = 0
        while frontier:
            k += 1; nxt = []
            for v in frontier:
                for e in v.link_edges:
                    o = e.other_vert(v)
                    if o not in dist: dist[o] = k; nxt.append(o)
            frontier = nxt
        inv = {v: i for i, v in m.items()}
        for v in bm.verts:
            v.co += body.no[inv[v]] * taper * min(1.0, dist.get(v, 0) / 4)
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if v not in rim], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    return _obj(name, bm, col=col), set(used)


def sector_outline(body, verts, z, n, centre, band=0.012):
    """The body's outline at height z: for each of n directions round `centre`, the furthest point of `verts` within the
    band. Empty directions are filled from their neighbours."""
    r = [0.0] * n
    for i in verts:
        c = body.co[i]
        if abs(c.z - z) > band: continue
        dx, dy = c.x - centre.x, c.y - centre.y
        k = int((math.atan2(dy, dx) % (2 * math.pi)) / (2 * math.pi) * n) % n
        r[k] = max(r[k], math.hypot(dx, dy))
    if not any(r): return None
    for _ in range(n):
        if all(r): break
        r = [x if x else max(r[(k - 1) % n], r[(k + 1) % n]) for k, x in enumerate(r)]
    # round the outline: the hull of a few neighbours, then a light blur (cloth spans hollows)
    r = [max(r[(k + j) % n] * math.cos(j * 2 * math.pi / n) for j in range(-2, 3)) for k in range(n)]
    return [(r[(k - 1) % n] + 2 * r[k] + r[(k + 1) % n]) / 4 for k in range(n)]


def smooth_rings(rings, k=3, passes=2):
    """Average each direction's radius with the rings above and below (cloth does not follow every bump of the body
    from one centimetre to the next) and never let it shrink below the body outline it was made from minus 3 mm."""
    for _ in range(passes):
        out = []
        for i, (z, c, r) in enumerate(rings):
            win = rings[max(0, i - k): i + k + 1]
            avg = [sum(w[2][j] for w in win) / len(win) for j in range(len(r))]
            cx = sum(w[1].x for w in win) / len(win); cy = sum(w[1].y for w in win) / len(win)
            out.append((z, Vector((cx, cy, c.z)), [max(a, b - 0.003) for a, b in zip(avg, r)]))
        rings = out
    return rings


def hull_loft(name, body, rings, n=64, open_top=True, open_bottom=True, col=None):
    """rings: list of (z, centre Vector, outline[n] radii). z may be a list of n heights (a collar lower at the front)."""
    bm = bmesh.new(); rows = []
    for z, c, rad in rings:
        zs = z if isinstance(z, (list, tuple)) else [z] * n
        rows.append([bm.verts.new((c.x + rad[k] * math.cos(2 * math.pi * (k + 0.5) / n),
                                   c.y + rad[k] * math.sin(2 * math.pi * (k + 0.5) / n), zs[k])) for k in range(n)])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(n): bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
    if not open_top: bm.faces.new(rows[-1] if rings[-1][0] > rings[0][0] else rows[0])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, col=col)


def axis_loft(name, body, verts, p0, p1, steps=24, n=32, off=0.012, cap0=True, cap1=True, band=None, col=None,
              flat_bottom=None):
    """A loft along any axis (a boot foot runs heel->toe): each slice is the outline of `verts` within the slab around
    that point, measured round the slab's own centre. Toes, fingers and other small bumps merge into one smooth shape.
    flat_bottom: a height; points below it are lifted onto it (a sole)."""
    ax = (p1 - p0); L = ax.length; ax.normalize()
    u = ax.cross(Vector((0, 0, 1)))
    if u.length < 1e-3: u = ax.cross(Vector((0, 1, 0)))
    u.normalize(); v = ax.cross(u).normalized()
    band = band or L / steps * 0.9
    pts = [body.co[i] for i in verts]
    slices = []
    for s in range(steps + 1):
        t = s / steps; c = p0 + ax * (L * t)
        sel = [p for p in pts if abs((p - c).dot(ax)) <= band]
        if len(sel) < 4: continue
        cc_ = sum(sel, Vector()) / len(sel)
        cc_ = c + (cc_ - c) - ax * (cc_ - c).dot(ax)
        r = [0.0] * n
        for p in sel:
            d = p - cc_; x, y = d.dot(u), d.dot(v)
            k = int((math.atan2(y, x) % (2 * math.pi)) / (2 * math.pi) * n) % n
            r[k] = max(r[k], math.hypot(x, y))
        for _ in range(n):
            if all(r): break
            r = [x if x else max(r[(k - 1) % n], r[(k + 1) % n]) for k, x in enumerate(r)]
        r = [max(r[(k + j) % n] * math.cos(j * 2 * math.pi / n) for j in range(-2, 3)) + off for k in range(n)]
        slices.append((cc_, r))
    # smooth along the axis
    sm = []
    for i in range(len(slices)):
        win = slices[max(0, i - 2): i + 3]
        sm.append((sum((w[0] for w in win), Vector()) / len(win), [sum(w[1][k] for w in win) / len(win) for k in range(n)]))
    bm = bmesh.new(); rows = []
    for c, r in sm:
        row = []
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            p = c + u * (r[k] * math.cos(a)) + v * (r[k] * math.sin(a))
            if flat_bottom is not None and p.z < flat_bottom: p.z = flat_bottom
            row.append(bm.verts.new(p))
        rows.append(row)
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(n): bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
    for cap, row in ((cap0, rows[0]), (cap1, rows[-1])):
        if cap:
            centre = bm.verts.new(sum((x.co for x in row), Vector()) / n)
            for k in range(n): bm.faces.new((row[k], row[(k + 1) % n], centre))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, col=col)


def tube(name, path, n=24, cuff=None, col=None):
    """path: list of (point, radius). Rings perpendicular to the path. cuff=(lip_depth, inner_radius): the open end turns
    inward round the wrist (step 2's closed sleeve)."""
    bm = bmesh.new(); rows = []
    up = Vector((0, 0, 1))
    for k, (p, r) in enumerate(path):
        p0 = path[max(0, k - 1)][0]; p1 = path[min(len(path) - 1, k + 1)][0]
        t = (p1 - p0).normalized()
        u = t.cross(up)
        if u.length < 1e-4: u = t.cross(Vector((0, 1, 0)))
        u.normalize(); v = t.cross(u).normalized()
        rx, ry = (r, r) if not isinstance(r, tuple) else r
        rows.append([bm.verts.new(p + u * (rx * math.cos(2 * math.pi * i / n)) + v * (ry * math.sin(2 * math.pi * i / n))) for i in range(n)])
    if cuff:
        p, r = path[-1]; t = (path[-1][0] - path[-2][0]).normalized()
        u = t.cross(up).normalized(); v = t.cross(u).normalized()
        rx = r if not isinstance(r, tuple) else r[0]
        for back, rr in ((0.006, rx * 0.93), (cuff[0], cuff[1])):
            rows.append([bm.verts.new(p - t * back + u * (rr * math.cos(2 * math.pi * i / n)) + v * (rr * math.sin(2 * math.pi * i / n))) for i in range(n)])
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(n): bm.faces.new((r0[i], r0[(i + 1) % n], r1[(i + 1) % n], r1[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, col=col)


def box(name, centre, size, facing, bevel=0.008, col=None):
    """A rounded block; `facing` is the outward direction of its front face (+y of the block)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=2, affect="EDGES")
    f = Vector((facing.x, facing.y, 0)).normalized()
    rot = Vector((0, -1, 0)).rotation_difference(f).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(centre) @ rot, verts=bm.verts)
    return _obj(name, bm, smooth=False, col=col)


def solidify(o, thick=0.004, offset=1.0):
    m = o.modifiers.new("thick", "SOLIDIFY"); m.thickness = thick; m.offset = offset; m.use_even_offset = True
    m.use_rim = True
    return m


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        if m.type != "ARMATURE": bpy.ops.object.modifier_apply(modifier=m.name)


# ------------------------------------------------------------------ rigging and masking
def skin_to(o, body, rig, overrides=None):
    """Bone weights from the nearest body surface (Data Transfer), then an Armature modifier. overrides(i, co) may
    return a {bone: weight} dict to replace the copied weights for a vertex (the robe skirt uses this in step 6)."""
    for g in body.obj.vertex_groups:
        if g.name in rig.data.bones and g.name not in o.vertex_groups: o.vertex_groups.new(name=g.name)
    dt = o.modifiers.new("weights", "DATA_TRANSFER"); dt.object = body.obj
    dt.use_vert_data = True; dt.data_types_verts = {"VGROUP_WEIGHTS"}; dt.vert_mapping = "POLYINTERP_NEAREST"
    dt.layers_vgroup_select_src = "ALL"; dt.layers_vgroup_select_dst = "NAME"
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=dt.name)
    # drop non-bone groups the transfer may have created, normalise to 4 bones (glTF limit)
    for g in list(o.vertex_groups):
        if g.name not in rig.data.bones: o.vertex_groups.remove(g)
    names = {g.index: g.name for g in o.vertex_groups}
    for v in o.data.vertices:
        ws = {names[g.group]: g.weight for g in v.groups}
        if overrides:
            ov = overrides(v.index, o.matrix_world @ v.co)
            if ov is not None: ws = ov
        top = sorted(ws.items(), key=lambda kv: -kv[1])[:4]
        s = sum(w for _, w in top) or 1
        for g in list(v.groups): o.vertex_groups[g.group].remove([v.index])
        for b, w in top:
            if b not in o.vertex_groups: o.vertex_groups.new(name=b)
            o.vertex_groups[b].add([v.index], w / s, "REPLACE")
    o.parent = rig
    o.matrix_parent_inverse = rig.matrix_world.inverted()
    am = o.modifiers.new("Armature", "ARMATURE"); am.object = rig


def covered(body, garments, cand, reach=0.12):
    """Body vertices (of cand) that a garment covers: a ray straight out along the body normal, and four rays tilted
    40 degrees, all hit a garment within `reach`. Erode by one ring so the edge of a hidden region always stays under
    cloth."""
    polys = []; cos = []
    for g in garments:
        deps = bpy.context.evaluated_depsgraph_get(); ev = g.evaluated_get(deps); me = ev.to_mesh()
        base = len(cos)
        cos += [g.matrix_world @ v.co for v in me.vertices]
        polys += [tuple(base + i for i in p.vertices) for p in me.polygons]
        ev.to_mesh_clear()
    bvh = BVHTree.FromPolygons(cos, polys)
    hide = set()
    for i in cand:
        n = body.no[i]; p = body.co[i] + n * 0.0015
        t1 = n.orthogonal().normalized(); t2 = n.cross(t1)
        dirs = [n] + [(n + t * 0.84).normalized() for t in (t1, -t1, t2, -t2)]
        if all(bvh.ray_cast(p, d, reach)[0] is not None for d in dirs): hide.add(i)
    # erode: a vertex stays hidden only if all its neighbours are hidden or out of the candidate region
    nb = {}
    for f in body.real_faces:
        for a in f:
            for b in f:
                if a != b: nb.setdefault(a, set()).add(b)
    return {i for i in hide if all(j in hide for j in nb.get(i, ()))}


def mask_body(basemesh, hide):
    g = basemesh.vertex_groups.get("c4_hidden") or basemesh.vertex_groups.new(name="c4_hidden")
    g.add(list(hide), 1.0, "REPLACE")
    m = basemesh.modifiers.get("C4 hide under clothes") or basemesh.modifiers.new("C4 hide under clothes", "MASK")
    m.vertex_group = "c4_hidden"; m.invert_vertex_group = True
    # keep it before subdivision so the cut is clean (right after MakeHuman's own helper mask)
    want = 1 + max([k for k, mm in enumerate(basemesh.modifiers) if mm.type == "MASK" and mm != m] or [0])
    basemesh.modifiers.move(basemesh.modifiers.find(m.name), want)
    return len(hide)


def clip_report(body, pieces, eps=0.001, hidden=None):
    """For each piece: how many of its vertices are inside the body by more than eps (they would show skin through
    cloth, or cloth/hair through the face). Hidden body regions are not counted (nothing is there to poke through)."""
    out = {}
    deps = bpy.context.evaluated_depsgraph_get()
    for o in pieces:
        ev = o.evaluated_get(deps); me = ev.to_mesh()
        bad = 0; total = len(me.vertices)
        for v in me.vertices:
            p = ev.matrix_world @ v.co
            hit = body.bvh.find_nearest(p)
            if hit[0] is None: continue
            loc, n, fi, d = hit
            if (p - loc).dot(n) < -eps:
                if hidden is not None and all(i in hidden for i in body.real_faces[fi]): continue
                bad += 1
        ev.to_mesh_clear()
        out[o.name] = (bad, total)
    return out


# ------------------------------------------------------------------ painting: reference pictures, visibility, bake
class Pic:
    """One reference picture placed in the world: the figure's box in pixels maps to the model's height (soles at
    z=bot) and the box's middle maps to `centre` along the picture's horizontal axis."""

    def __init__(self, path, box, axis, sign, H, bot, centre, flip=False):
        self.img = bpy.data.images.load(path, check_existing=True)
        self.W, self.Hp = self.img.size
        import numpy as np
        a = np.empty(self.W * self.Hp * 4, dtype=np.float32); self.img.pixels.foreach_get(a)
        self.px = a.reshape(self.Hp, self.W, 4)
        bx, by, bw, bh = box
        self.s = H / bh; self.cx = bx + bw / 2; self.btm = by + bh; self.axis, self.sign = axis, sign
        self.bot, self.centre = bot, centre
        self.bg = self.px[self.Hp - 4, 4, :3].copy()

    def xy(self, co):
        hor = (co.x if self.axis == "x" else co.y) - self.centre
        px_x = self.cx + hor * self.sign / self.s
        px_y_top = self.btm - (co.z - self.bot) / self.s           # from the top of the picture
        return px_x, self.Hp - 1 - px_y_top                        # blender pixels: row 0 is the bottom

    def sample(self, co):
        x, y = self.xy(co)
        xi = min(self.W - 1, max(0, int(x))); yi = min(self.Hp - 1, max(0, int(y)))
        return self.px[yi, xi, :3]

    def is_bg(self, c, tol=0.12):
        return abs(c[0] - self.bg[0]) + abs(c[1] - self.bg[1]) + abs(c[2] - self.bg[2]) < tol


def figure_box(path, x0=0, x1=None, thresh=34):
    """The bounding box (x, y, w, h) of the non-background pixels of a reference picture (optionally between columns)."""
    import numpy as np
    img = bpy.data.images.load(path, check_existing=True)
    W, Hp = img.size
    a = np.empty(W * Hp * 4, dtype=np.float32); img.pixels.foreach_get(a)
    a = a.reshape(Hp, W, 4)[::-1, :, :3] * 255                        # row 0 = top
    x1 = x1 or W
    bg = a[3, 3]
    solid = (np.abs(a[:, x0:x1] - bg).sum(axis=2) > thresh)
    ys, xs = np.nonzero(solid)
    # ignore stray specks: rows/cols need a few solid pixels
    rows = np.nonzero(solid.sum(axis=1) > 2)[0]; cols = np.nonzero(solid.sum(axis=0) > 2)[0]
    return (int(cols[0] + x0), int(rows[0]), int(cols[-1] - cols[0]), int(rows[-1] - rows[0]))


def _lin(c):
    """sRGB picture value -> linear (colour attributes and bake emission are linear)."""
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def project_bake(o, pics, occluders, out_png, size=2048, fill_rgb=(0.2, 0.2, 0.25)):
    """o: the joined garments (UV unwrapped). pics: {key: (Pic, view_dir)} where view_dir points FROM the model TO the
    camera. Step 2's method: each vertex gets a weight per picture (it faces that camera and nothing blocks the ray,
    and the picture there is not studio background); the material then samples every picture PER PIXEL through its own
    projection and blends by those weights; spots no picture sees take their neighbours' colour. An emission bake
    writes the result into the UV texture."""
    import numpy as np
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
    mw = o.matrix_world
    cos, polys = [], []
    for occ in occluders:
        deps = bpy.context.evaluated_depsgraph_get(); ev = occ.evaluated_get(deps); m2 = ev.to_mesh()
        base = len(cos); cos += [ev.matrix_world @ v.co for v in m2.vertices]
        polys += [tuple(base + i for i in p.vertices) for p in m2.polygons]; ev.to_mesh_clear()
    bvh = BVHTree.FromPolygons(cos, polys)
    keys = list(pics)
    W = {k: [0.0] * len(bm.verts) for k in keys}
    col = [None] * len(bm.verts); seen = 0
    for v in bm.verts:
        p = mw @ v.co; n = (mw.to_3x3() @ v.normal).normalized()
        best, bw = None, 0
        for k in keys:
            pic, d = pics[k]
            f = n.dot(d)
            if f <= 0.08: continue
            if bvh.ray_cast(p + d * 0.004 + n * 0.002, d, 10.0)[0] is not None: continue
            c = pic.sample(p)
            if pic.is_bg(c): continue
            W[k][v.index] = f ** 4
            if f > bw: best, bw = c, f
        if best is not None: col[v.index] = np.array(_lin(best)); seen += 1
    for _ in range(200):
        nxt = list(col); changed = 0
        for v in bm.verts:
            if col[v.index] is not None: continue
            cs = [col[e.other_vert(v).index] for e in v.link_edges if col[e.other_vert(v).index] is not None]
            if cs: nxt[v.index] = sum(cs) / len(cs); changed += 1
        col = nxt
        if not changed: break
    col = [c if c is not None else np.array(fill_rgb) for c in col]
    bm.free()
    for k in keys:
        at = me.attributes.get("c4w_" + k) or me.attributes.new("c4w_" + k, "FLOAT", "POINT")
        at.data.foreach_set("value", W[k])
    ca = me.color_attributes.get("c4_fill") or me.color_attributes.new("c4_fill", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", [x for c in col for x in (float(c[0]), float(c[1]), float(c[2]), 1.0)])
    print(f"project_bake {o.name}: {seen}/{len(col)} vertices seen by a picture ({100 * seen / len(col):.0f}%)")

    mat = bpy.data.materials.new(o.name + "_bake"); mat.use_nodes = True
    nt = mat.node_tree; L = nt.links.new
    out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); L(geo.outputs["Position"], sep.inputs[0])

    def m(op, a, b):
        n_ = nt.nodes.new("ShaderNodeMath"); n_.operation = op
        for i, x in enumerate((a, b)):
            if isinstance(x, (int, float)): n_.inputs[i].default_value = x
            else: L(x, n_.inputs[i])
        return n_.outputs[0]

    def attr(name, out_="Fac"):
        n_ = nt.nodes.new("ShaderNodeAttribute"); n_.attribute_name = name; return n_.outputs[out_]

    terms = []; wsum = None
    for k in keys:
        pic = pics[k][0]
        hor = sep.outputs["X" if pic.axis == "x" else "Y"]
        u = m("ADD", m("MULTIPLY", m("SUBTRACT", hor, pic.centre), pic.sign / (pic.s * pic.W)), pic.cx / pic.W)
        vv = m("ADD", m("MULTIPLY", m("SUBTRACT", sep.outputs["Z"], pic.bot), 1.0 / (pic.s * pic.Hp)), 1 - pic.btm / pic.Hp)
        cmb = nt.nodes.new("ShaderNodeCombineXYZ"); L(u, cmb.inputs[0]); L(vv, cmb.inputs[1])
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = pic.img; tex.extension = "EXTEND"; tex.interpolation = "Cubic"
        L(cmb.outputs[0], tex.inputs[0])
        # per-pixel background key: where this picture shows its studio grey, its weight fades to 0
        dist = nt.nodes.new("ShaderNodeVectorMath"); dist.operation = "DISTANCE"
        L(tex.outputs[0], dist.inputs[0]); dist.inputs[1].default_value = tuple(_lin([float(x) for x in pic.bg]))
        key = nt.nodes.new("ShaderNodeMapRange"); key.inputs["From Min"].default_value = 0.025; key.inputs["From Max"].default_value = 0.07
        L(dist.outputs["Value"], key.inputs["Value"])
        w = m("MULTIPLY", attr("c4w_" + k), key.outputs[0])
        terms.append((tex.outputs[0], w)); wsum = w if wsum is None else m("ADD", wsum, w)
    wfill = m("MAXIMUM", m("SUBTRACT", 0.12, wsum), 0.0)
    terms.append((attr("c4_fill", "Color"), wfill)); norm = m("ADD", wsum, wfill)
    acc = None
    for c_, w in terms:
        sc = nt.nodes.new("ShaderNodeVectorMath"); sc.operation = "SCALE"; L(c_, sc.inputs[0]); L(m("DIVIDE", w, norm), sc.inputs["Scale"])
        if acc is None: acc = sc.outputs[0]
        else:
            ad = nt.nodes.new("ShaderNodeVectorMath"); ad.operation = "ADD"; L(acc, ad.inputs[0]); L(sc.outputs[0], ad.inputs[1]); acc = ad.outputs[0]
    em = nt.nodes.new("ShaderNodeEmission"); L(acc, em.inputs[0]); L(em.outputs[0], out.inputs[0])
    img = bpy.data.images.new(o.name + "_tex", size, size)
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img; nt.nodes.active = tn
    me.materials.clear(); me.materials.append(mat)
    sc_ = bpy.context.scene; sc_.render.engine = "CYCLES"; sc_.cycles.device = "CPU"; sc_.cycles.samples = 4
    sc_.render.bake.margin = 8
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type="EMIT")
    img.filepath_raw = out_png; img.file_format = "PNG"; img.save()
    fm = bpy.data.materials.new(o.name + "_cloth"); fm.use_nodes = True
    b_ = next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); b_.inputs["Roughness"].default_value = 0.78
    t = fm.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
    fm.node_tree.links.new(t.outputs[0], b_.inputs["Base Color"])
    me.materials.clear(); me.materials.append(fm)
    for k in keys: me.attributes.remove(me.attributes["c4w_" + k])
    me.color_attributes.remove(me.color_attributes["c4_fill"])
    return img


def unwrap(o, margin=0.003):
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=margin)
    bpy.ops.object.mode_set(mode="OBJECT")


def join(objs, name):
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    for ob in objs: ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    return o


def panel(name, rings, n, a0, a1, z_bottom, cols=24, rows=30, col=None):
    """A hanging cloth panel cut from a ring stack: angles a0..a1 (degrees, -90 = front), from the top ring down to
    z_bottom(angle) — a pointed tabard end is z_bottom rising toward the panel's sides."""
    rings = sorted(rings, key=lambda r: r[0])

    def radius(z, a):
        lo = max([r for r in rings if r[0] <= z] or [rings[0]], key=lambda r: r[0])
        hi = min([r for r in rings if r[0] >= z] or [rings[-1]], key=lambda r: r[0])
        t = 0 if hi[0] == lo[0] else (z - lo[0]) / (hi[0] - lo[0])
        f = (math.radians(a) % (2 * math.pi)) / (2 * math.pi) * n - 0.5
        k0 = int(math.floor(f)) % n; k1 = (k0 + 1) % n; u = f - math.floor(f)
        rl = lo[2][k0] * (1 - u) + lo[2][k1] * u; rh = hi[2][k0] * (1 - u) + hi[2][k1] * u
        c = lo[1].lerp(hi[1], t)
        return c, rl * (1 - t) + rh * t
    ztop = rings[-1][0]
    bm = bmesh.new(); grid = []
    for i in range(cols + 1):
        a = a0 + (a1 - a0) * i / cols
        zb = z_bottom(a); colv = []
        for j in range(rows + 1):
            z = ztop + (zb - ztop) * j / rows
            c, r = radius(z, a)
            colv.append(bm.verts.new((c.x + r * math.cos(math.radians(a)), c.y + r * math.sin(math.radians(a)), z)))
        grid.append(colv)
    for i in range(cols):
        for j in range(rows):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, col=col)


def keep_side(o, origin, axis, side, margin=0.0):
    """Delete the faces of o whose centre lies on the wrong side: keep (centre - nearest axis point) . side > -margin."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    ax = axis.normalized(); kill = []
    for f in bm.faces:
        c = o.matrix_world @ f.calc_center_median()
        d = c - origin; d -= ax * d.dot(ax)
        if d.dot(side) < -margin: kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(o.data); bm.free()
