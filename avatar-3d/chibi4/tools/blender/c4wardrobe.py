# Chibi 4 — step 10b: the WARDROBE generator. Every worn Chibi 2 part (tops, bottoms, shoes, gloves, hats, capes,
# packs, decor, accessories, facial hair, tier-2 emblems) built in Blender FROM THE BODY it is for, so the same recipes
# fit any kit body (both current bodies, and the builds step 10c adds).
#
#   fit = Fit(B, rig, hairs)        measure a body: landmarks (neck base, chin, brow band, hips, knees, ankles, arm and
#                                   leg axes), the HIDE ZONE of every body vertex, outlines at any height
#   g = Garment(fit, gid, layer)    a garment under construction; g.add(obj, tile, bind=...) adds a part
#   obj = finish(g)                 join the parts: tile UVs (tiles.json), skin weights, hide-zone bits, sway weights,
#                                   and the zones it really covers (measured with step 5's ray test)
#
# HIDE ZONES (ZONES below): 24 regions of the body. Every vertex of the body, the hair, beards and garments carries
# the bit of the zone it lies over (nearest body vertex). A garment lists the zones it fully covers (`hides`) and
# has a `layer`; the runtime drops a piece's triangle when one of its vertices lies in a zone hidden by a worn
# garment of a HIGHER layer — the body under a robe, a shirt under plate, hair under a hood are never drawn, so they
# cannot poke through. Zones replace step 9's bit-per-garment masks (16 garments max).
#
# TILES: generated garments are not projection-painted: each part repeats one small seamless picture from
# textures/tiles (tools/tiles.py — weave, leather grain, mail rings, plate, fur, gold ...). The UV of a tiled
# vertex is (u, 4 + 32*cell + v): the shader sees v >= 4, takes the cell and repeats the picture (fract), so a robe
# and a ring share one 256 px picture at the same detail per centimetre.
import bpy, bmesh, math, os, json
import numpy as np
from mathutils import Vector, Matrix
from mathutils.kdtree import KDTree
from mathutils.bvhtree import BVHTree
import c4clothes as cc

HERE = os.path.dirname(os.path.abspath(__file__))
C4 = os.path.normpath(os.path.join(HERE, "..", ".."))
TILES = json.load(open(os.path.join(C4, "textures", "tiles", "tiles.json")))

ZONES = ["neck", "sternum", "chest", "back", "belly", "hips", "shoulder", "upperarm", "forearm", "wrist", "hand",
         "thigh", "knee", "calf", "ankle", "foot", "scalp", "headback", "ears", "face", "jaw"]
ZB = {z: 1 << i for i, z in enumerate(ZONES)}
assert len(ZONES) <= 24
TORSO_Z = ("neck", "sternum", "chest", "back", "belly", "hips")
ARM_Z = ("shoulder", "upperarm", "forearm", "wrist")
LEG_Z = ("thigh", "knee", "calf", "ankle")
FINGERS = ("hand", "index", "middle", "ring", "pinky", "thumb")
V = Vector


def zbits(*names):
    b = 0
    for n in names: b |= ZB[n]
    return b


# ------------------------------------------------------------------ measuring a body
class Fit:
    def __init__(self, B, rig, hairs=(), ears=None):
        import step5_clothes as s5
        self.B, self.rig = B, rig
        self.H, self.bot, self.top, self.cx = B.H, B.bot, B.top, B.cx
        self.k = B.H / 1.8                                   # size relative to a 1.8 m body
        self.z_nb, self.z_chin, self.headH = s5.landmarks(B)
        self.z_band = self.top - 0.42 * self.headH          # brow band: where a hat sits
        self.groups = {g.index: g.name for g in B.obj.vertex_groups}
        bm = B.obj
        ears_g = bm.vertex_groups.get("ears"); scalp_g = bm.vertex_groups.get("scalp"); lips_g = bm.vertex_groups.get("lips")
        self.in_group = {"ears": set(), "scalp": set(), "lips": set()}
        for v in bm.data.vertices:
            for g in v.groups:
                nm = self.groups[g.group]
                if nm in self.in_group and g.weight > 0.5: self.in_group[nm].add(v.index)
        self.ears_off = ears                              # elf ear offsets (list of Vector per vertex) or None
        hv = [B.co[i] for i in B.idx if B.wsum(i, ["head"]) > 0.5]
        self.head_c = V((sum(p.x for p in hv) / len(hv), sum(p.y for p in hv) / len(hv), 0))
        ev = [B.co[i] for i in self.in_group["ears"] if B.real[i]] or hv
        self.y_ear = sum(p.y for p in ev) / len(ev)
        self.y_face = min(p.y for p in hv)                 # nose tip (front is -y)
        lv = [B.co[i] for i in self.in_group["lips"] if B.real[i]]
        self.z_mouth = sum(p.z for p in lv) / len(lv) if lv else self.z_chin + 0.04 * self.k
        self.mouth = V((self.cx, min(p.y for p in lv) if lv else self.y_face, self.z_mouth))
        self.z_eye = B.head("head").z + 0.6 * (self.top - B.head("head").z) - 0.02 * self.k if False else self.z_chin + 0.47 * self.headH
        bn = B.head
        self.z_hip = bn("thigh_l").z; self.z_waist = bn("spine_01").z; self.z_ribs = bn("spine_03").z
        self.z_knee = bn("calf_l").z; self.z_ankle = bn("foot_l").z
        self.z_crotch = self.z_hip - 0.075 * self.k
        tv = [B.co[i] for i in B.pick(cc.TORSO, 0.5)]
        self.torso_c = V((self.cx, sum(p.y for p in tv) / len(tv), 0))
        self.hairs = list(hairs)
        self._zones()
        self._kd()

    # ---- zones
    def _zones(self):
        B = self.B
        self.zone = [-1] * len(B.co)
        def proj(p, a, b):
            ab = b - a; return (p - a).dot(ab) / max(1e-9, ab.length_squared)
        for i in B.idx:
            p, w = B.co[i], B.w[i]
            def ws(*bones): return sum(w.get(b, 0) for b in bones)
            zn = None
            head = ws("head")
            if i in self.in_group["ears"]: zn = "ears"
            elif head > 0.5 or (p.z > self.z_chin + 0.01 and ws("neck_01") < 0.5 and abs(p.x - self.cx) < 0.12 * self.k and p.z > self.z_nb + 0.06 * self.k):
                if p.z >= self.z_band: zn = "scalp"
                elif p.y < self.y_ear - 0.02 * self.k and p.z > self.z_chin - 0.02 * self.k:
                    zn = "jaw" if p.z < self.z_mouth + 0.02 * self.k else "face"
                elif p.z < self.z_chin + 0.005: zn = "neck"
                else: zn = "headback"
            if zn is None:
                for s in ("l", "r"):
                    arm = ws(f"upperarm_{s}", f"lowerarm_{s}", f"hand_{s}") + sum(v for k, v in w.items() if k.startswith(FINGERS[1:]) and k.endswith(s))
                    if arm > 0.5:
                        if ws(f"hand_{s}") + sum(v for k, v in w.items() if k.startswith(FINGERS[1:]) and k.endswith(s)) > 0.5: zn = "hand"
                        elif ws(f"lowerarm_{s}") >= ws(f"upperarm_{s}"):
                            t = proj(p, B.head(f"lowerarm_{s}"), B.head(f"hand_{s}"))
                            zn = "upperarm" if t < 0.06 else "wrist" if t > 0.6 else "forearm"
                        else:
                            t = proj(p, B.head(f"upperarm_{s}"), B.head(f"lowerarm_{s}"))
                            zn = "shoulder" if t < 0.48 else "upperarm"
                        break
                    leg = ws(f"thigh_{s}", f"calf_{s}", f"foot_{s}", f"ball_{s}")
                    if leg > 0.5:
                        if ws(f"foot_{s}", f"ball_{s}") > 0.45 or p.z < self.z_ankle + 0.025 * self.k: zn = "foot"
                        elif ws(f"calf_{s}") >= ws(f"thigh_{s}"):
                            t = proj(p, B.head(f"calf_{s}"), B.head(f"foot_{s}"))
                            zn = "knee" if t < 0.1 else "ankle" if t > 0.58 else "calf"
                        else:
                            t = proj(p, B.head(f"thigh_{s}"), B.head(f"calf_{s}"))
                            zn = "thigh" if t < 0.5 else "knee"
                        break
            if zn is None:
                if p.z >= self.z_nb - 0.004: zn = "neck"
                elif p.z > self.z_ribs:
                    front = p.y < self.torso_c.y
                    if front and abs(p.x - self.cx) < 0.065 * self.k and p.z > self.z_nb - 0.15 * self.k: zn = "sternum"
                    else: zn = "chest" if front or p.z < self.z_nb - 0.2 * self.k else "back"
                    if not front and p.z < self.z_nb - 0.2 * self.k: zn = "back"
                elif p.z > self.z_waist: zn = "belly"
                else: zn = "hips"
            self.zone[i] = ZONES.index(zn)
        self.zone_verts = {z: {i for i in B.idx if self.zone[i] == k} for k, z in enumerate(ZONES)}

    def _kd(self):
        B = self.B
        self.kd = KDTree(len(B.idx))
        for k, i in enumerate(B.idx): self.kd.insert(B.co[i], k)
        self.kd.balance()
        torso = [i for i in B.idx if ZONES[self.zone[i]] in TORSO_Z or ZONES[self.zone[i]] in ("shoulder",)]
        self.kd_torso = KDTree(len(torso)); self.torso_idx = torso
        for k, i in enumerate(torso): self.kd_torso.insert(B.co[i], k)
        self.kd_torso.balance()
        nb = {}
        for f in B.real_faces:
            for a in f:
                for b in f:
                    if a != b: nb.setdefault(a, set()).add(b)
        self.nb = nb

    def zone_of(self, p):
        _, k, _ = self.kd.find(p); return self.zone[self.B.idx[k]]

    def bits_of(self, pts, hair=False):
        out = []
        for p in pts:
            z = self.zone_of(p)
            if hair and p.z > self.z_band - 0.01 * self.k and ZONES[z] in ("headback", "ears", "face", "neck"): z = ZONES.index("scalp")
            out.append(1 << z)
        return out

    def verts(self, *zones, grow=0):
        s = set()
        for z in zones: s |= self.zone_verts[z]
        for _ in range(grow):
            s |= {j for i in s for j in self.nb.get(i, ()) if self.B.real[j]}
        return s

    # ---- shape helpers
    def ring(self, verts, z, n=48, centre=None, off=0.0, band=0.012):
        r = cc.sector_outline(self.B, verts, z, n, centre or self.torso_c, band)
        return None if r is None else [x + off for x in r]

    def head_ring(self, z, n=48, off=0.0, band=0.01):
        hv = self.verts("scalp", "headback", "ears", "face", "jaw")
        return self.ring(hv, z, n, self.head_c, off, band)

    def bone(self, name): return self.B.head(name), self.B.tail(name)

    def surface(self, x, z, side=-1, off=0.0, verts=None):
        """The body surface at (x, z) seen from the front (side=-1) or back (+1): a ray along y."""
        o = V((x, side * 2.0, z)); d = V((0, -side, 0))
        hit = self.B.bvh.ray_cast(o, d, 4.0)
        if hit[0] is None: return None, None
        return hit[0] + hit[1] * off, hit[1]

    def limb_r(self, a, b, t, verts, band=0.012):
        """Radius of a limb (median distance of its vertices in a slab across the bone at t, from the axis)."""
        ax = (b - a); L = ax.length; ax = ax / L; c = a + ax * (L * t)
        d = [((self.B.co[i] - c) - ax * (self.B.co[i] - c).dot(ax)).length for i in verts if abs((self.B.co[i] - c).dot(ax)) < band]
        if not d: return 0.05 * self.k
        d.sort(); return d[int(len(d) * 0.75)]

    def hair_r(self, z, centre, n=48, band=0.012):
        """Outline of every hair style at height z (so a band or collar can clear any hair)."""
        r = [0.0] * n
        for h in self.hairs:
            for v in h.data.vertices:
                p = h.matrix_world @ v.co
                if abs(p.z - z) > band: continue
                dx, dy = p.x - centre.x, p.y - centre.y
                k = int((math.atan2(dy, dx) % (2 * math.pi)) / (2 * math.pi) * n) % n
                r[k] = max(r[k], math.hypot(dx, dy))
        return r


# ------------------------------------------------------------------ mesh primitives (all return objects)
def _obj(name, bm, smooth=True):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = smooth
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return o


def loft(name, rings, n, closed_top=False, closed_bottom=False):
    """rings: [(z or [z]*n, centre, radii[n])] from bottom to top (radii lists of n)."""
    bm = bmesh.new(); rows = []
    for z, c, rad in rings:
        zs = z if isinstance(z, (list, tuple)) else [z] * n
        rows.append([bm.verts.new((c.x + rad[k] * math.cos(2 * math.pi * (k + 0.5) / n), c.y + rad[k] * math.sin(2 * math.pi * (k + 0.5) / n), zs[k])) for k in range(n)])
    for r0, r1 in zip(rows, rows[1:]):
        for k in range(n): bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
    for cl, row, top in ((closed_top, rows[-1], True), (closed_bottom, rows[0], False)):
        if cl:
            c = bm.verts.new(sum((v.co for v in row), Vector()) / n)
            for k in range(n): bm.faces.new((row[k], row[(k + 1) % n], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm)


def sheet(name, grid):
    """grid[i][j] = Vector: a quad sheet (cols x rows)."""
    bm = bmesh.new(); vs = [[bm.verts.new(p) for p in col] for col in grid]
    for i in range(len(vs) - 1):
        for j in range(len(vs[0]) - 1):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    return _obj(name, bm)


def tube(name, path, n=12, caps=True):
    """path: [(point, radius)], rings perpendicular to the path (radius may be (rx, ry))."""
    o = cc.tube(name, path, n=n)
    if caps:
        bm = bmesh.new(); bm.from_mesh(o.data)
        edges = [e for e in bm.edges if e.is_boundary]
        if edges: bmesh.ops.holes_fill(bm, edges=edges, sides=0)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(o.data); bm.free()
    return o


def curve(name, pts, r0, r1=None, n=10):
    """A tapered tube through points (Catmull-Rom smoothed), radius r0 -> r1."""
    r1 = r0 if r1 is None else r1
    sm = []
    P = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(P) - 2):
        for s in range(6):
            t = s / 6; p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            sm.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    sm.append(pts[-1])
    path = [(p, r0 + (r1 - r0) * k / max(1, len(sm) - 1)) for k, p in enumerate(sm)]
    return tube(name, path, n=n)


def sphere(name, c, r, seg=12, rings=8):
    bm = bmesh.new(); rr = r if isinstance(r, (tuple, list)) else (r, r, r)
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    for v in bm.verts: v.co = V((c[0] + v.co.x * rr[0], c[1] + v.co.y * rr[1], c[2] + v.co.z * rr[2]))
    return _obj(name, bm)


def cone(name, base, tip, r, seg=10):
    bm = bmesh.new(); d = (tip - base); L = d.length
    bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.0, depth=L)
    rot = V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((base + tip) / 2) @ rot, verts=bm.verts)
    return _obj(name, bm)


def torus(name, c, R, r, axis=V((0, 0, 1)), seg=24, tseg=8, scale=(1, 1, 1)):
    bm = bmesh.new()
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(tseg):
            b = 2 * math.pi * j / tseg
            bm.verts.new(((R + r * math.cos(b)) * math.cos(a) * scale[0], (R + r * math.cos(b)) * math.sin(a) * scale[1], r * math.sin(b) * scale[2]))
    bm.verts.ensure_lookup_table()
    for i in range(seg):
        for j in range(tseg):
            a, b = i * tseg + j, i * tseg + (j + 1) % tseg
            c2, d2 = ((i + 1) % seg) * tseg + (j + 1) % tseg, ((i + 1) % seg) * tseg + j
            bm.faces.new((bm.verts[a], bm.verts[b], bm.verts[c2], bm.verts[d2]))
    rot = V((0, 0, 1)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ rot, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm)


def box(name, c, size, facing=V((0, -1, 0)), bevel=0.006, up=None):
    o = cc.box(name, c, size, facing, bevel=bevel)
    return o


def cylinder(name, a, b, r, seg=16, caps=True):
    return tube(name, [(a, r), (b, r)], n=seg, caps=caps)


def disc(name, c, r, normal, thick=0.004, seg=20):
    n = normal.normalized()
    return tube(name, [(c - n * thick / 2, r), (c + n * thick / 2, r)], n=seg, caps=True)


def octa(name, c, r, s=(1, 1, 1)):
    bm = bmesh.new()
    pts = [V((r * s[0], 0, 0)), V((-r * s[0], 0, 0)), V((0, r * s[1], 0)), V((0, -r * s[1], 0)), V((0, 0, r * s[2])), V((0, 0, -r * s[2]))]
    vs = [bm.verts.new(c + p) for p in pts]
    for a in (0, 1):
        for b in (2, 3):
            for d in (4, 5): bm.faces.new((vs[a], vs[b], vs[d]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _obj(name, bm, smooth=False)


def solid(o, t=0.004, offset=-1.0):
    m = o.modifiers.new("thick", "SOLIDIFY"); m.thickness = t; m.offset = offset; m.use_even_offset = True; m.use_rim = True
    cc.apply_mods(o)
    return o


def cut(o, keep):
    """Delete faces whose centre fails keep(Vector)."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(o.matrix_world @ f.calc_center_median())], context="FACES")
    bm.to_mesh(o.data); bm.free()
    return o


def deform(o, fn):
    """Move every vertex: fn(Vector) -> Vector."""
    for v in o.data.vertices: v.co = fn(o.matrix_world @ v.co)
    o.data.update()
    return o


def mirror_x(o, cx, name=None):
    c = o.copy(); c.data = o.data.copy(); c.name = name or o.name + "_m"
    bpy.context.scene.collection.objects.link(c)
    for v in c.data.vertices: v.co.x = 2 * cx - v.co.x
    bm = bmesh.new(); bm.from_mesh(c.data); bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(c.data); bm.free()
    return c


def shell(fit, name, verts, d, smooth=2, taper=0.0, keep=None):
    """The body's own faces over `verts`, pushed out by d (cc.shell) — tight cloth, gloves, mail. keep(p) prunes."""
    if keep: verts = {i for i in verts if keep(fit.B.co[i])}
    o, _ = cc.shell(name, fit.B, verts, d, smooth=smooth, taper=taper)
    return o


def rings_between(fit, verts, z0, z1, step, off, n=48, centre=None, band=0.014, smooth=(3, 2)):
    """Stacked outlines of `verts` from z0 up to z1; off may be a number or off(z, t, k) per direction."""
    rings = []; z = z0; last = None
    while z <= z1 + 1e-5:
        r = fit.ring(verts, z, n, centre, 0.0, band)
        if r is None: r = last
        if r is not None:
            t = (z - z0) / max(1e-6, z1 - z0)
            rr = [x + (off(z, t, k) if callable(off) else off) for k, x in enumerate(r)]
            rings.append((z, V(((centre or fit.torso_c).x, (centre or fit.torso_c).y, z)), rr)); last = r
        z += step
    if smooth: rings = cc.smooth_rings(rings, *smooth)
    return rings


def ring_point(fit, rings, angle_deg, z, out=0.0, n=48):
    """A point on a ring stack at an angle (deg; -90 = front) and height, pushed out by `out`."""
    a = math.radians(angle_deg)
    rr = min(rings, key=lambda r: abs(r[0] - z))
    k = int((a % (2 * math.pi)) / (2 * math.pi) * n) % n
    c = rr[1]; R = rr[2][k] + out
    return V((c.x + R * math.cos(a), c.y + R * math.sin(a), z)), V((math.cos(a), math.sin(a), 0))


# ------------------------------------------------------------------ a garment
class Garment:
    def __init__(self, fit, gid, layer, kind="garment", long=False, closed=False, hides=(), force=(), sway=False,
                 hair_cut=None, depth=None, note=""):
        self.fit, self.gid, self.layer, self.kind = fit, gid, layer, kind
        self.long, self.closed, self.sway = long, closed, sway
        self.want = set(hides)          # zones it should fully cover (checked: kept only if measured >= 95%)
        self.force = set(force)         # zones it hides even if the ray test cannot see it (robe legs near the hem)
        self.parts = []                 # (obj, tile, bind, sway)
        self.note = note; self.depth = depth

    def add(self, o, tile="cloth", bind="body", sway=0.0):
        assert tile in TILES["tiles"], f"{self.gid}: no tile {tile}"
        self.parts.append((o, tile, bind, sway)); return o


def _tile_uv(o, tile):
    """Smart-project the part, scale so one repeat of the tile covers its `world` metres, and encode the cell."""
    me = o.data
    if not me.polygons: return
    if not me.uv_layers: me.uv_layers.new(name="UVMap")
    info = TILES["tiles"][tile]
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.002)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = me.uv_layers.active
    a = np.empty(len(me.loops) * 2, dtype=np.float64); uv.data.foreach_get("uv", a); a = a.reshape(-1, 2)
    if info["world"] <= 0:                       # an emblem: the picture once over the whole part
        lo, hi = a.min(0), a.max(0); a = 0.03 + 0.94 * (a - lo) / np.maximum(1e-6, hi - lo)
    else:
        area3 = sum(p.area for p in me.polygons)
        me.calc_loop_triangles()
        areauv = 0.0
        for t in me.loop_triangles:
            p = a[list(t.loops)]
            areauv += abs((p[1, 0] - p[0, 0]) * (p[2, 1] - p[0, 1]) - (p[2, 0] - p[0, 0]) * (p[1, 1] - p[0, 1])) / 2
        k = math.sqrt(area3 / max(1e-12, areauv)) / info["world"]
        a = a * k
        if a[:, 1].max() > 31.0: a[:, 1] *= 31.0 / a[:, 1].max()
        a[:, 1] += 0.5
    a[:, 1] += 4 + 32 * info["index"]
    uv.data.foreach_set("uv", a.astype(np.float32).ravel())


def _weights_nearest(o, fit, pool="all", rigid=None):
    """Bone weights per vertex from the 3 nearest body vertices (pool all / torso), or one rigid bone."""
    B, rig = fit.B, fit.rig
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    groups = {}
    def grp(b):
        if b not in groups: groups[b] = o.vertex_groups.get(b) or o.vertex_groups.new(name=b)
        return groups[b]
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        if rigid:
            ws = rigid(p) if callable(rigid) else {rigid: 1.0}
        else:
            kd, idx = (fit.kd_torso, fit.torso_idx) if pool == "torso" else (fit.kd, B.idx)
            ws = {}
            near = kd.find_n(p, 3)
            tot = 0
            for co, k, d in near:
                wt = 1.0 / max(0.004, d); tot += wt
                for b, w in B.w[idx[k]].items():
                    if b in rig.data.bones: ws[b] = ws.get(b, 0) + w * wt
            ws = {b: w / tot for b, w in ws.items()}
        top = sorted(ws.items(), key=lambda kv: -kv[1])[:4]; s = sum(w for _, w in top) or 1
        for b, w in top: grp(b).add([v.index], w / s, "REPLACE")


def _skirt_bind(o, fit, z_full=None, z_free=None):
    """Torso weights above the hips, the skirt bones below (by angle round the hips), blended between."""
    import c4anim
    _weights_nearest(o, fit, pool="torso")
    if "skirt_0" not in fit.rig.data.bones: return
    z_full = z_full if z_full is not None else fit.z_hip - 0.16 * fit.k
    z_free = z_free if z_free is not None else fit.z_hip + 0.07 * fit.k
    names = {g.index: g.name for g in o.vertex_groups}
    N = c4anim.SKIRT_N
    for i in range(N):
        if f"skirt_{i}" not in o.vertex_groups: o.vertex_groups.new(name=f"skirt_{i}")
    names = {g.index: g.name for g in o.vertex_groups}
    c = fit.torso_c
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        if p.z >= z_free: continue
        f = 1.0 if p.z <= z_full else (z_free - p.z) / (z_free - z_full); f = f * f * (3 - 2 * f)
        a = math.atan2(p.y - c.y, p.x - c.x) % (2 * math.pi)
        x = a / (2 * math.pi) * N; i0 = int(x) % N; i1 = (i0 + 1) % N; u = x - int(x)
        new = {names[g.group]: g.weight * (1 - f) for g in v.groups}
        new[f"skirt_{i0}"] = new.get(f"skirt_{i0}", 0) + f * (1 - u)
        new[f"skirt_{i1}"] = new.get(f"skirt_{i1}", 0) + f * u
        top = sorted(new.items(), key=lambda kv: -kv[1])[:4]; s = sum(w for _, w in top) or 1
        for g in list(v.groups): o.vertex_groups[g.group].remove([v.index])
        for b, w in top: o.vertex_groups[b].add([v.index], w / s, "REPLACE")


def bind_part(o, fit, bind):
    if bind == "body": _weights_nearest(o, fit)
    elif bind == "torso": _weights_nearest(o, fit, pool="torso")
    elif bind == "skirt": _skirt_bind(o, fit)
    elif bind == "head": _weights_nearest(o, fit, rigid="head")
    elif bind == "foot": _weights_nearest(o, fit, rigid=lambda p: {("foot_l" if p.x > fit.cx else "foot_r"): 1.0})
    elif bind.startswith("bone:"): _weights_nearest(o, fit, rigid=bind[5:])
    elif bind.startswith("side:"):            # side:hand -> hand_l / hand_r by x
        b = bind[5:]; _weights_nearest(o, fit, rigid=lambda p: {f"{b}_{'l' if p.x > fit.cx else 'r'}": 1.0})
    else: raise ValueError(bind)


def finish(g, measure=True):
    """Join a garment's parts into one skinned object named g_<id>, with tile UVs, zone bits, sway and its hides."""
    fit = g.fit
    objs = []
    for o, tile, bind, sway in g.parts:
        cc.apply_mods(o)
        if not o.data.polygons: bpy.data.objects.remove(o); continue
        _tile_uv(o, tile)
        sw = sway(o) if callable(sway) else [float(sway)] * len(o.data.vertices)
        if not isinstance(sw, list): sw = [float(sw)] * len(o.data.vertices)
        a = o.data.attributes.new("_c4sway", "FLOAT", "POINT"); a.data.foreach_set("value", sw)
        bind_part(o, fit, bind)
        objs.append(o)
    assert objs, g.gid + " has no geometry"
    if len(objs) > 1:
        for ob in bpy.context.view_layer.objects: ob.select_set(False)
        for ob in objs: ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active if len(objs) > 1 else objs[0]
    o.name = "g_" + g.gid
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    import c4kit
    c4kit.set_mask(o, fit.bits_of(pts))
    o.parent = fit.rig; o.matrix_parent_inverse = fit.rig.matrix_world.inverted()
    am = o.modifiers.new("Armature", "ARMATURE"); am.object = fit.rig
    meta = {"layer": g.layer, "kind": g.kind, "long": g.long, "closed": g.closed, "sway": bool(g.sway)}
    if measure:
        cov = coverage(fit, [o], g.want | g.force)
        hides = sorted({z for z in g.want if cov.get(z, 0) >= 0.95} | g.force, key=ZONES.index)
        meta["hides"] = hides
        meta["coverage"] = {z: round(cov.get(z, 0), 3) for z in sorted(g.want | g.force, key=ZONES.index)}
        missing = sorted(z for z in g.want if cov.get(z, 0) < 0.95)
        if missing: meta["notCovered"] = missing
    o["c4meta"] = json.dumps(meta)
    return o, meta


def coverage(fit, objs, zones):
    """Share of each zone's body vertices that the objects cover (step 5's 5-ray test, no erosion)."""
    out = {}
    if not zones: return out
    import c4kit
    bvh, gco = c4kit.bvh_of(objs)
    B = fit.B
    for z in zones:
        vs = fit.zone_verts[z]
        if not vs: out[z] = 1.0; continue
        hit = 0
        for i in vs:
            n = B.no[i]; p = B.co[i] + n * 0.0015
            t1 = n.orthogonal().normalized(); t2 = n.cross(t1)
            dirs = [n] + [(n + t * 0.84).normalized() for t in (t1, -t1, t2, -t2)]
            if all(bvh.ray_cast(p, d, 0.35)[0] is not None for d in dirs): hit += 1
        out[z] = hit / len(vs)
    return out
