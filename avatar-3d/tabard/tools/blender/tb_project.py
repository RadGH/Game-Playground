# Tabard: paint projection shared by bodies (tb_bake.py) and props (tb_prop.py).
#
# project_bake(obj, bvh, meta, pics, out_png, size, proxy=None, alpha=False)
#   obj    a static mesh with UVs, in the same place it had in the clay views
#   bvh    what can hide a spot from a camera (the body for bodies; the prop itself for props)
#   meta   build/<key>_views.json: height_m, h_px, centre_z, views{name: {w, centre?}}
#   pics   {view name: path of the aligned RGBA crop (tools/align.py)}
#   proxy  optional (index, p, n) -> (p, n): where a vertex borrows its paint from (swap-in pieces)
#   alpha  also bake the painting's alpha (props with see-through parts) and write RGBA
# Per vertex, each view gets a weight (how squarely the surface faces that camera, to the 4th power; zero when
# something is in the way or the picture says "not here"). The bake material samples every view per pixel through its
# own camera and blends by those weights; spots no view sees take the average colour of their seen neighbours.
import bpy, bmesh, os
import numpy as np
from mathutils import Vector

VIEWS = {"front": ("x", 1, Vector((0, -1, 0))), "back": ("x", -1, Vector((0, 1, 0))),
         "left": ("y", 1, Vector((1, 0, 0))), "right": ("y", -1, Vector((-1, 0, 0)))}


def _lin(x): return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4


class View:
    def __init__(self, name, meta, path):
        self.name = name
        self.axis, self.sign, self.dir = VIEWS[name]
        self.w = meta["views"][name]["w"]; self.c = meta["views"][name].get("centre", 0.0)
        self.H = meta["h_px"]; self.ppm = meta["h_px"] / meta["height_m"]; self.cz = meta["centre_z"]
        self.img = bpy.data.images.load(path, check_existing=False)
        a = np.empty(self.w * self.H * 4, dtype=np.float32); self.img.pixels.foreach_get(a)
        self.px = a.reshape(self.H, self.w, 4)                   # row 0 = bottom

    def sample(self, co):
        hor = (co.x if self.axis == "x" else co.y) - self.c
        x = self.w / 2 + hor * self.sign * self.ppm; y = self.H / 2 + (co.z - self.cz) * self.ppm
        return self.px[min(self.H - 1, max(0, int(y))), min(self.w - 1, max(0, int(x)))]


def project_bake(obj, bvh, meta, pics, out_png, size=1024, proxy=None, alpha=False, spread=0.015, label="", occl=None, occl_for=None):
    """occl (optional): extra things that hide spots from the cameras but are not baked (the painted, pre-fit hands);
    occl_for(p) says whether a spot is tested against it."""
    views = {k: View(k, meta, p) for k, p in pics.items()}
    me = obj.data; mw = obj.matrix_world
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
    N = len(bm.verts)
    ppos, pnrm = [None] * N, [None] * N
    for v in bm.verts:
        p = mw @ v.co; n = (mw.to_3x3() @ v.normal).normalized()
        if proxy: p, n = proxy(v.index, p, n)
        ppos[v.index] = p; pnrm[v.index] = n
    Wt = {k: [0.0] * N for k in views}; col = [None] * N; seen = 0
    for v in bm.verts:
        p = ppos[v.index]; n = pnrm[v.index]; best, bw = None, 0
        for k, vw in views.items():
            f = n.dot(vw.dir)
            if f <= 0.15: continue
            # five rays (centre + a little either way in the picture plane): a spot right beside something in front
            # of it counts as hidden too, because the painted outline of that thing is a little wider than the mesh
            hz = Vector((1, 0, 0)) if vw.axis == "x" else Vector((0, 1, 0))
            o0 = p + vw.dir * 0.004 + n * 0.002
            offs = (Vector(),) if not spread else (Vector(), hz * spread, hz * -spread, Vector((0, 0, spread)), Vector((0, 0, -spread)))
            if any(bvh.ray_cast(o0 + off + (vw.dir * 0.03 if off.length else Vector()), vw.dir, 10.0)[0] is not None for off in offs):
                continue
            if occl is not None and occl_for(p) and any(occl.ray_cast(o0 + off, vw.dir, 10.0)[0] is not None for off in offs):
                continue
            c = vw.sample(p)
            if c[3] < 0.5 and not alpha: continue
            Wt[k][v.index] = f ** 4
            if c[3] >= 0.5 and f > bw: best, bw = c[:3].copy(), f
        if best is not None: col[v.index] = best; seen += 1
    for _ in range(300):
        nxt = list(col); changed = 0
        for v in bm.verts:
            if col[v.index] is not None: continue
            cs = [col[e.other_vert(v).index] for e in v.link_edges if col[e.other_vert(v).index] is not None]
            if cs: nxt[v.index] = sum(cs) / len(cs); changed += 1
        col = nxt
        if not changed: break
    col = [c if c is not None else np.array([0.5, 0.4, 0.35]) for c in col]
    bm.free()
    print(f"RES {label}: {seen}/{N} vertices seen by a view ({100 * seen / max(1, N):.0f}%)")
    for k in views:
        a_ = me.attributes.new("w_" + k, "FLOAT", "POINT"); a_.data.foreach_set("value", Wt[k])
    pp = me.attributes.new("ppos", "FLOAT_VECTOR", "POINT")
    inv = mw.inverted()
    pp.data.foreach_set("vector", [c for q in ppos for c in (inv @ q)])
    ca = me.color_attributes.new("fill", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", [y for c in col for y in (_lin(float(c[0])), _lin(float(c[1])), _lin(float(c[2])), 1.0)])

    def material(alpha_pass):
        mat = bpy.data.materials.new("bake"); mat.use_nodes = True
        nt = mat.node_tree; Lk = nt.links.new
        out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
        pa = nt.nodes.new("ShaderNodeAttribute"); pa.attribute_name = "ppos"   # world-space paint position
        tr = nt.nodes.new("ShaderNodeVectorTransform"); tr.vector_type = "POINT"; tr.convert_from = "OBJECT"; tr.convert_to = "WORLD"
        Lk(pa.outputs["Vector"], tr.inputs[0])
        sep = nt.nodes.new("ShaderNodeSeparateXYZ"); Lk(tr.outputs[0], sep.inputs[0])

        def m(op, a, b):
            n_ = nt.nodes.new("ShaderNodeMath"); n_.operation = op
            for i, x in enumerate((a, b)):
                if isinstance(x, (int, float)): n_.inputs[i].default_value = x
                else: Lk(x, n_.inputs[i])
            return n_.outputs[0]

        def attr(name, out_="Fac"):
            n_ = nt.nodes.new("ShaderNodeAttribute"); n_.attribute_name = name; return n_.outputs[out_]

        terms = []; wsum = None
        for k, vw in views.items():
            hor = m("SUBTRACT", sep.outputs["X" if vw.axis == "x" else "Y"], vw.c)
            u = m("ADD", m("MULTIPLY", hor, vw.sign * vw.ppm / vw.w), 0.5)
            vv = m("ADD", m("MULTIPLY", m("SUBTRACT", sep.outputs["Z"], vw.cz), vw.ppm / vw.H), 0.5)
            cmb = nt.nodes.new("ShaderNodeCombineXYZ"); Lk(u, cmb.inputs[0]); Lk(vv, cmb.inputs[1])
            tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = vw.img; tex.extension = "EXTEND"; tex.interpolation = "Linear"
            Lk(cmb.outputs[0], tex.inputs[0])
            if alpha_pass:
                w = attr("w_" + k)
                al = nt.nodes.new("ShaderNodeCombineXYZ")
                for i in range(3): Lk(tex.outputs["Alpha"], al.inputs[i])
                terms.append((al.outputs[0], w))
            else:
                key = nt.nodes.new("ShaderNodeMapRange"); key.inputs["From Min"].default_value = 0.5; key.inputs["From Max"].default_value = 0.95
                Lk(tex.outputs["Alpha"], key.inputs["Value"])
                w = m("MULTIPLY", attr("w_" + k), key.outputs[0])
                terms.append((tex.outputs["Color"], w))
            wsum = w if wsum is None else m("ADD", wsum, w)
        if alpha_pass:
            norm = m("ADD", wsum, 1e-6)
        else:
            wfill = m("MAXIMUM", m("SUBTRACT", 0.003, wsum), 0.0)       # fill only where no view really sees
            terms.append((attr("fill", "Color"), wfill)); norm = m("ADD", wsum, wfill)
        acc = None
        for c_, w in terms:
            sc = nt.nodes.new("ShaderNodeVectorMath"); sc.operation = "SCALE"; Lk(c_, sc.inputs[0]); Lk(m("DIVIDE", w, norm), sc.inputs["Scale"])
            if acc is None: acc = sc.outputs[0]
            else:
                ad = nt.nodes.new("ShaderNodeVectorMath"); ad.operation = "ADD"; Lk(acc, ad.inputs[0]); Lk(sc.outputs[0], ad.inputs[1]); acc = ad.outputs[0]
        em = nt.nodes.new("ShaderNodeEmission"); Lk(acc, em.inputs[0]); Lk(em.outputs[0], out.inputs[0])
        img = bpy.data.images.new("bake_a" if alpha_pass else "bake_c", size, size)
        if alpha_pass: img.colorspace_settings.name = "Non-Color"
        tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = img; nt.nodes.active = tn
        return mat, img

    sc_ = bpy.context.scene; sc_.render.engine = "CYCLES"; sc_.cycles.device = "CPU"; sc_.cycles.samples = 1
    sc_.render.bake.margin = 6
    for ob in bpy.context.view_layer.objects: ob.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
    passes = [False, True] if alpha else [False]
    imgs = {}
    for ap in passes:
        mat, img = material(ap)
        me.materials.clear(); me.materials.append(mat)
        bpy.ops.object.bake(type="EMIT")
        imgs[ap] = img
    out = imgs[False]
    if alpha:
        c = np.empty(size * size * 4, dtype=np.float32); out.pixels.foreach_get(c)
        a = np.empty(size * size * 4, dtype=np.float32); imgs[True].pixels.foreach_get(a)
        c[3::4] = a[0::4]; out.pixels.foreach_set(c)
    out.filepath_raw = out_png; out.file_format = "PNG"; out.save()
    print("RES wrote", out_png)
    return out
