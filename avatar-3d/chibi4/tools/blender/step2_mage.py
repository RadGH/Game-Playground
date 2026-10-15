# Chibi 4 — step 2: the same mage, built headless on the VM, painted only where each picture can see, baked, exported.
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step2_mage.py -- <out_dir>
#
# What changed from step 1 (owner's review: "duplicate face, duplicate pair of arms; sleeves near his hands may not be
# connected"):
#   * Each reference picture paints a spot only if its camera can SEE that spot (a ray from the spot toward the camera
#     hits nothing) and the spot faces it. Step 1 projected straight through the model, so the front picture also
#     landed on the side of the head and on the body behind the arms — the doubles.
#   * Spots no picture sees (under the arms, under the chin, between the legs) are filled from their neighbours.
#   * The sleeve ends in a cuff that turns inward and closes round the wrist (step1_mage.tube(cuff=True)).
#   * Everything is joined, unwrapped and baked to ONE texture, then exported as a GLB a browser can load.
import bpy, bmesh, math, os, sys
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(HERE, "..", "..", "shots", "step2")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
import c4lib

# a clean, empty scene
bpy.ops.wm.read_factory_settings(use_empty=True)
G = {"__name__": "c4_step1", "C4_CUFF": True, "C4_DOME": True}
exec(compile(open(os.path.join(HERE, "step1_mage.py")).read(), "step1_mage.py", "exec"), G)
PICS, H = G["PICS"], G["H"]

# ---------------------------------------------------------------- one mesh, smoothing applied
col = bpy.data.collections["C4_Step1"]
meshes = [o for o in col.objects if o.type == "MESH"]
for o in meshes:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
bpy.ops.object.select_all(action="DESELECT")
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.join()
mage = bpy.context.active_object; mage.name = "C4_Mage"
me = mage.data

# ---------------------------------------------------------------- pictures as python pixel arrays (for the fill colour)
class Pic:
    def __init__(self, key):
        file, W, Hp, (bx, by, bw, bh), (axis, sign) = PICS[key]
        img = bpy.data.images.load(os.path.join(G["TMP"], file), check_existing=True)
        self.W, self.Hp = img.size
        self.px = list(img.pixels)          # RGBA floats, bottom row first
        self.s = H / bh; self.cx = bx + bw / 2; self.bot = by + bh; self.axis, self.sign = axis, sign
        self.Wfile, self.Hfile = W, Hp

    def uv(self, co):
        hor = co.x if self.axis == "x" else co.y
        u = hor * self.sign / (self.Wfile * self.s) + self.cx / self.Wfile
        v = co.z / (self.Hfile * self.s) + 1 - self.bot / self.Hfile
        return u, v

    def sample(self, co):
        u, v = self.uv(co)
        x = min(self.W - 1, max(0, int(u * self.W))); y = min(self.Hp - 1, max(0, int(v * self.Hp)))
        i = (y * self.W + x) * 4
        return self.px[i:i + 3]


pics = {k: Pic(k) for k in PICS}
BG = pics["front"].px[(pics["front"].Hp - 4) * pics["front"].W * 4 + 12: (pics["front"].Hp - 4) * pics["front"].W * 4 + 15]   # a top-left corner pixel

# ---------------------------------------------------------------- who sees what: per-vertex weights
bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.normal_update()
bvh = BVHTree.FromBMesh(bm)
CAMS = {"F": ("front", Vector((0, -1, 0))), "B": ("back", Vector((0, 1, 0))),
        "L": ("side", Vector((1, 0, 0))), "R": ("side", Vector((-1, 0, 0)))}
w = {k: [0.0] * len(bm.verts) for k in CAMS}
for v in bm.verts:
    n = v.normal
    for k, (_, d) in CAMS.items():
        f = n.dot(d)
        if f <= 0.05: continue
        hit = bvh.ray_cast(v.co + d * 0.003 + n * 0.001, d, 10.0)
        if hit[0] is not None: continue
        r_, g_, b_ = pics[CAMS[k][0]].sample(v.co)        # the studio grey behind the figure counts as "not seen"
        if abs(r_ - BG[0]) + abs(g_ - BG[1]) + abs(b_ - BG[2]) < 0.06: continue
        w[k][v.index] = f ** 6
total = [sum(w[k][i] for k in CAMS) for i in range(len(bm.verts))]

# fill colour: the best visible picture's colour where something sees the vertex, then spread into the unseen
fill = [None] * len(bm.verts)
for v in bm.verts:
    i = v.index
    if total[i] < 0.02: continue
    best = max(CAMS, key=lambda k: w[k][i])
    fill[i] = pics[CAMS[best][0]].sample(v.co)
unseen = sum(1 for c in fill if c is None)
for _ in range(60):
    changed = 0
    nxt = list(fill)
    for v in bm.verts:
        if fill[v.index] is not None: continue
        cs = [fill[e.other_vert(v).index] for e in v.link_edges if fill[e.other_vert(v).index] is not None]
        if cs: nxt[v.index] = [sum(c[j] for c in cs) / len(cs) for j in range(3)]; changed += 1
    fill = nxt
    if not changed: break
fill = [c or [0.15, 0.17, 0.3] for c in fill]
bm.free()


def attr(name, vals):
    a = me.attributes.get(name) or me.attributes.new(name, "FLOAT", "POINT")
    a.data.foreach_set("value", vals)


attr("c4_wF", w["F"]); attr("c4_wB", w["B"]); attr("c4_wS", [w["L"][i] + w["R"][i] for i in range(len(total))])
ca = me.color_attributes.get("c4_fill") or me.color_attributes.new("c4_fill", "FLOAT_COLOR", "POINT")
ca.data.foreach_set("color", [x for c in fill for x in (*c, 1.0)])
print(f"vertices {len(total)}, unseen by every picture {unseen} ({100 * unseen / len(total):.1f}%)")

# ---------------------------------------------------------------- the painting material: pictures weighted by sight
m = bpy.data.materials["C4_Mage_Paint"]
nt = m.node_tree; L = nt.links.new
bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
texs = {}
for n in nt.nodes:
    if n.type == "TEX_IMAGE":
        for k, (file, *_r) in PICS.items():
            if n.image and n.image.name.startswith(os.path.splitext(file)[0]): texs[k] = n


def node(t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items(): setattr(n, k, v)
    return n


def mathn(op, a, b):
    n = node("ShaderNodeMath", operation=op)
    for i, x in enumerate((a, b)):
        if isinstance(x, (int, float)): n.inputs[i].default_value = x
        else: L(x, n.inputs[i])
    return n.outputs[0]


aF = node("ShaderNodeAttribute", attribute_name="c4_wF").outputs["Fac"]
aB = node("ShaderNodeAttribute", attribute_name="c4_wB").outputs["Fac"]
aS = node("ShaderNodeAttribute", attribute_name="c4_wS").outputs["Fac"]
aFill = node("ShaderNodeAttribute", attribute_name="c4_fill").outputs["Color"]
sumw = mathn("ADD", mathn("ADD", aF, aB), aS)
wFill = mathn("MAXIMUM", mathn("SUBTRACT", 0.15, sumw), 0.0)
norm = mathn("ADD", sumw, wFill)
acc = None
for col_out, wt in ((texs["front"].outputs[0], aF), (texs["back"].outputs[0], aB), (texs["side"].outputs[0], aS), (aFill, wFill)):
    sc_ = node("ShaderNodeVectorMath", operation="SCALE"); L(col_out, sc_.inputs[0]); L(mathn("DIVIDE", wt, norm), sc_.inputs["Scale"])
    if acc is None: acc = sc_.outputs[0]
    else:
        ad = node("ShaderNodeVectorMath", operation="ADD"); L(acc, ad.inputs[0]); L(sc_.outputs[0], ad.inputs[1]); acc = ad.outputs[0]
L(acc, bsdf.inputs["Base Color"])

# ---------------------------------------------------------------- unwrap and bake to one texture
bpy.context.view_layer.objects.active = mage; mage.select_set(True)
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
bpy.ops.object.mode_set(mode="OBJECT")
TEX = 2048
baked = bpy.data.images.new("C4_Mage_Baked", TEX, TEX)
emit = node("ShaderNodeEmission"); L(acc, emit.inputs[0])
out = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")
old_link = out.inputs[0].links[0].from_socket
L(emit.outputs[0], out.inputs[0])
tgt = node("ShaderNodeTexImage", image=baked); nt.nodes.active = tgt
sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 4
sc.render.bake.margin = 8
bpy.ops.object.bake(type="EMIT")
baked.filepath_raw = os.path.join(OUT, "mage-baked.png"); baked.file_format = "PNG"; baked.save()

# final, simple material: the baked picture on a plain surface (what the game would load)
fm = bpy.data.materials.new("C4_Mage"); fm.use_nodes = True
fb = next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); fb.inputs["Roughness"].default_value = 0.75
ft = fm.node_tree.nodes.new("ShaderNodeTexImage"); ft.image = baked
fm.node_tree.links.new(ft.outputs[0], fb.inputs["Base Color"])
me.materials.clear(); me.materials.append(fm)
for nm in ("c4_wF", "c4_wB", "c4_wS"): me.attributes.remove(me.attributes[nm])
me.color_attributes.remove(me.color_attributes["c4_fill"])

# ---------------------------------------------------------------- export + look
glb = os.path.join(OUT, "mage.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True, export_apply=True)
print("faces", len(me.polygons), "glb", os.path.getsize(glb) // 1024, "KB")
for o in bpy.data.objects:
    if o.name.startswith("Ref_"): o.hide_render = True
c4lib.shot(os.path.join(OUT, "s2"), ("front", "three_quarter", "back", "left"), dist=3.2, ortho=2.1, engine="CYCLES", samples=32)
c4lib.shot(os.path.join(OUT, "s2face"), ("front", "three_quarter", "right"), center=(0, -0.02, 1.64), dist=1.0, ortho=0.42, engine="CYCLES", size=512, samples=32)
c4lib.shot(os.path.join(OUT, "s2game"), ("game",), center=(0, 0, 0.9), dist=9.0, lens=35, engine="CYCLES", size=512, samples=32)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "mage-step2.blend"))
print("step2 done")
