# Chibi 4 — step 9: the MODULAR kit. One body type per run:
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step9_kit.py -- male|female [<out_dir>] [--quick]
#
# Output in avatar-3d/chibi4/models/kit/<body>/ :
#   body.glb      the skeleton (MakeHuman's 53 bones + 8 skirt bones) and the body (+ eyes, brows, lashes) at three
#                 distances. Every vertex carries '_c4mask' (which garments cover it) and '_c4ears' (how far it moves
#                 for pointed elf ears — the runtime adds it for race 'elf')
#   anims.glb     the skeleton and every clip (Quaternius CC0 copies, mirrored strikes, authored emotes, *_robe twins)
#   g_<id>.glb    one garment each (robe, mantle, sleeves, boots_low, undershirt, jerkin, trousers, boots_tall,
#                 bracers, pauldrons, tabard, scabbard, hat), skinned to the same skeleton, three distances, with its
#                 own '_c4mask' (which OUTER garments cover it: a jerkin under a robe disappears where the robe is)
#   h_<id>.glb    one hair style each (MakeHuman CC0 hair fitted to this body), masked by the hat and the torso cloth
#   atlas.webp    ONE colour picture for everything above (so a whole character can be one draw call)
#   mask.webp     the tint picture: R = a garment's main colour, G = its second colour, B = skin
#   kit.json      what the runtime needs: bones, garments (bit, slots, layer, default colours), hairs, clips
# Nothing in the GLBs carries a material or a texture: the runtime puts atlas + mask on every piece.
import bpy, math, os, sys, json, time
import numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
C4 = os.path.normpath(os.path.join(HERE, "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
pos = [a for a in argv if not a.startswith("--")]
BODY = pos[0] if pos else "male"
OUT = pos[1] if len(pos) > 1 else os.path.join(C4, "models", "kit", BODY)
QUICK = "--quick" in argv                     # few clips, for iterating on the pipeline
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
sys.argv.append("--fast")
import c4mh, c4anim, c4kit, c4emotes
import c4clothes as cc
import step5_clothes as s5
import step6_robe_run as s6

T0 = time.time()
c4anim.DEBUG = bool(os.environ.get("C4DEBUG"))
def log(*a): print(f"[{time.time() - T0:6.1f}s]", *a, flush=True)

MPFB = os.path.expanduser("~/.config/blender/5.2/extensions/.user/user_default/mpfb/data")
REF = os.path.join(C4, "ref"); TEX = os.path.join(C4, "textures")
EARS = [c4mh.T("l-ear-shape-pointed", 1.0), c4mh.T("r-ear-shape-pointed", 1.0), c4mh.T("l-ear-scale-vert-incr", 1.0),
        c4mh.T("r-ear-scale-vert-incr", 1.0)]
EAR_KEYS = {e["target"] for e in EARS}
BODIES = {
    "male": dict(spec=dict(c4mh.STEP4["mage"], targets=c4mh.STEP4["mage"]["targets"] + EARS), skin="mage-skin.jpg", eyes="blue_eye.png"),
    "female": dict(spec=dict(c4mh.STEP4["elf"], targets=[t for t in c4mh.STEP4["elf"]["targets"] if t["target"] not in EAR_KEYS] + EARS),
                   skin="elf-skin.jpg", eyes="bluegreen_eye.png"),
}
# hair id -> (mhclo, painted texture or None)
HAIRS = {"short": ("short02/short02.mhclo", "mage-hair.png"), "braid": ("elvs_french_braid_variation/elvs_french_braid_variation.mhclo", "elf-hair.png"),
         "ponytail": ("ponytail01/ponytail01.mhclo", None), "long": ("long01/long01.mhclo", None),
         "bob": ("bob02/bob02.mhclo", None), "crop": ("short04/short04.mhclo", None)}
# garment id -> (paint group, piece-name prefixes, slots, layer). Higher layer = further out.
GARMENTS = {
    "robe": ("mage", ("Robe", "Belt", "Pouch"), ["torso", "skirt"], 4),
    "mantle": ("mage", ("Mantle", "Collar"), ["shoulders"], 6),
    "sleeves": ("mage", ("Sleeve",), ["arms"], 5),
    "boots_low": ("mage", ("Boot",), ["feet"], 2),
    "undershirt": ("elf", ("Undershirt",), ["shirt"], 1),
    "jerkin": ("elf", ("Jerkin",), ["torso"], 3),
    "trousers": ("elf", ("Trousers",), ["legs"], 1),
    "boots_tall": ("elf", ("Boot",), ["feet"], 2),
    "bracers": ("elf", ("Bracer",), ["wrists"], 3),
    "pauldrons": ("elf", ("Pauldron",), ["shoulders"], 7),
    "tabard": ("elf", ("Tabard", "Belt", "Pouch"), ["skirt"], 5),
    "scabbard": ("elf", ("Scabbard", "Hilt"), ["hip"], 7),
    "hat": ("plain", ("Hat",), ["head"], 8),
}
GIDS = list(GARMENTS)
BIT = {g: i for i, g in enumerate(GIDS)}
NO_MASK = {("trousers", "tabard")}          # (inner, outer) pairs that never hide: the tabard is two panels that swing
ATLAS_W, ATLAS_H, CELL = 3072, 2048, 1024
# cells (col, row, sub) — row 0 is the BOTTOM (Blender UV); sub = None (whole cell) or (sx, sy) quarter
CELLS = {"skin": (0, 0, None), "mage": (1, 0, None), "elf": (2, 0, None), "eyes": (2, 1, (0, 0)), "brows": (2, 1, (1, 0)),
         "lashes": (2, 1, (0, 1)), "flat": (2, 1, (1, 1))}
for k, hid in enumerate(HAIRS): CELLS["hair_" + hid] = (k // 4, 1, (k % 2, (k % 4) // 2))
LODS = ((1, 0.38), (2, 0.13))
CLOTH_RATIO = 0.3


def cell_rect(key):
    c, r, sub = CELLS[key]
    x, y, w, h = c * CELL, r * CELL, CELL, CELL
    if sub: w, h = CELL // 2, CELL // 2; x += sub[0] * w; y += sub[1] * h
    return x / ATLAS_W, y / ATLAS_H, w / ATLAS_W, h / ATLAS_H


def to_cell(obj, key, flat=False):
    me = obj.data
    if not me.uv_layers: me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active
    for l in list(me.uv_layers):
        if l != uv: me.uv_layers.remove(l)
    uv = me.uv_layers[0]; uv.name = "UVMap"
    x, y, w, h = cell_rect(key)
    a = np.empty(len(me.loops) * 2, dtype=np.float32); uv.data.foreach_get("uv", a); a = a.reshape(-1, 2)
    if flat: a[:, 0] = x + 0.5 * w; a[:, 1] = y + 0.5 * h
    else: a[:, 0] = x + np.clip(a[:, 0], 0, 1) * w; a[:, 1] = y + np.clip(a[:, 1], 0, 1) * h
    uv.data.foreach_set("uv", a.ravel())


def pixels(img, w, h):
    c = img.copy(); c.scale(w, h)
    a = np.empty(w * h * 4, dtype=np.float32); c.pixels.foreach_get(a)
    bpy.data.images.remove(c)
    return a.reshape(h, w, 4)


def diffuse_of(obj):
    return c4mh_diffuse(obj)


def c4mh_diffuse(obj):
    found = []
    def visit(tree):
        for n in tree.nodes:
            if n.type == "TEX_IMAGE" and n.image:
                nm = n.image.name.lower()
                if not any(k in nm for k in ("normal", "bump", "rough", "spec", "_nor", "sss", "displ")): found.append(n.image)
            if n.type == "GROUP" and n.node_tree: visit(n.node_tree)
    for sl in obj.material_slots:
        if sl.material and sl.material.use_nodes: visit(sl.material.node_tree)
    return found[0] if found else None


def select(objs, active=None):
    for o in list(bpy.context.view_layer.objects):
        if o is not None: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def apply_all_but_armature(obj):
    select([obj])
    for m in list(obj.modifiers):
        if m.type == "ARMATURE": continue
        if m.type == "SUBSURF": obj.modifiers.remove(m); continue
        bpy.ops.object.modifier_apply(modifier=m.name)


def dup(obj, name):
    c = obj.copy(); c.data = obj.data.copy(); c.name = name
    bpy.context.scene.collection.objects.link(c)
    return c


def split_by(obj, attr, values, names):
    """One object per value of an INT point attribute (the joined paint group -> one object per garment)."""
    import bmesh
    out = {}
    for val, nm in zip(values, names):
        c = dup(obj, nm)
        bm = bmesh.new(); bm.from_mesh(c.data)
        layer = bm.verts.layers.int.get(attr)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[layer] != val], context="VERTS")
        bm.to_mesh(c.data); bm.free()
        out[nm] = c
    bpy.data.objects.remove(obj)
    return out


def pics_for(group, B, ymid):
    """The reference pictures each paint group is projected from (step 5's set; the elf's back view is Codex's
    warrior-back.png when it exists)."""
    if group == "mage":
        pics = {"front": (cc.Pic(os.path.join(REF, "mage-front.png"), (81, 21, 647, 1065), "x", 1, B.H, B.bot, B.cx), Vector((0, -1, 0))),
                "back": (cc.Pic(os.path.join(REF, "mage-back.png"), (354, 23, 658, 1064), "x", -1, B.H, B.bot, B.cx), Vector((0, 1, 0)))}
        side, sbox = os.path.join(REF, "mage-side.png"), (157, 23, 240, 1063)
    else:
        tp = os.path.join(REF, "warrior-turnaround.png")
        fbox = cc.figure_box(tp, 0, 780); sbox = cc.figure_box(tp, 780, None); side = tp
        pics = {"front": (cc.Pic(tp, fbox, "x", 1, B.H, B.bot, B.cx), Vector((0, -1, 0)))}
        back = os.path.join(REF, "warrior-back.png")
        pics["back"] = (cc.Pic(back, cc.figure_box(back), "x", -1, B.H, B.bot, B.cx) if os.path.exists(back)
                        else cc.Pic(tp, fbox, "x", -1, B.H, B.bot, B.cx), Vector((0, 1, 0)))
        log("elf back view:", "Codex warrior-back.png" if os.path.exists(back) else "front picture mirrored (stand-in)")
    sp = cc.Pic(side, sbox, "y", -1, B.H, B.bot, ymid)
    pics["left"] = (sp, Vector((-1, 0, 0))); pics["right"] = (sp, Vector((1, 0, 0)))
    return pics


def tag(p, gid):
    kind = 1 if p.name.startswith("Robe") else 2 if p.name.startswith("Boot") else 3 if p.name.startswith("Tabard") else 4 if p.name.startswith("Mantle") else 0
    zs = [v.co.z for v in p.data.vertices]; zmin = min(zs)
    a = p.data.attributes.new("c4_piece", "INT", "POINT"); a.data.foreach_set("value", [kind] * len(zs))
    h = p.data.attributes.new("c4_hem", "INT", "POINT")
    h.data.foreach_set("value", [1 if kind in (1, 3) and z < zmin + 0.004 else 0 for z in zs])
    cc.apply_mods(p)
    g = p.data.attributes.new("c4_gid", "INT", "POINT"); g.data.foreach_set("value", [BIT[gid]] * len(p.data.vertices))


def bake_body(bm):
    """Sliders baked into the mesh with ears at 0 (human); the elf-ear offset kept as the '_c4ears' attribute; MakeHuman's
    helper geometry removed. Keeps the Armature modifier."""
    keys = bm.data.shape_keys.key_blocks
    saved = {k.name: k.value for k in keys}
    def mix(name):
        bm.shape_key_add(name=name, from_mix=True)
        kb = bm.data.shape_keys.key_blocks[name]
        co = np.empty(len(kb.data) * 3, dtype=np.float32); kb.data.foreach_get("co", co)
        kb.value = 0.0          # a new key comes in switched ON: left on, it would be added again by the next mix
        return co.reshape(-1, 3)
    elf = mix("__elf")
    for k in keys:
        if k.name in EAR_KEYS: k.value = 0.0
    human = mix("__human")
    for k, v in saved.items():
        if k in keys: keys[k].value = v
    select([bm]); bm.shape_key_clear()
    bm.data.vertices.foreach_set("co", human.ravel()); bm.data.update()
    a = bm.data.attributes.new("_c4ears", "FLOAT_VECTOR", "POINT"); a.data.foreach_set("vector", (elf - human).ravel())
    apply_all_but_armature(bm)


def add_hair(bm, hid):
    HS = c4mh.mpfb()
    path = os.path.join(MPFB, "hair", HAIRS[hid][0])
    h = HS.add_mhclo_asset(path, bm, asset_type="Hair", subdiv_levels=0, material_type="MAKESKIN")
    h.name = "h_" + hid
    tex = HAIRS[hid][1]
    if tex and os.path.exists(os.path.join(TEX, tex)): c4mh.set_diffuse(h, os.path.join(TEX, tex))
    if h.data.shape_keys:
        select([h]); h.shape_key_add(name="__m", from_mix=True)
        d = h.data.shape_keys.key_blocks["__m"].data; co = np.empty(len(d) * 3, dtype=np.float32); d.foreach_get("co", co)
        h.shape_key_clear(); h.data.vertices.foreach_set("co", co); h.data.update()
    apply_all_but_armature(h)
    return h


def world_mesh(obj):
    co = [obj.matrix_world @ v.co for v in obj.data.vertices]
    faces = [tuple(p.vertices) for p in obj.data.polygons]
    return co, faces


def make_lods(obj, base, ratio0=1.0):
    """[LOD0, LOD1, LOD2] copies named <base>_LOD<k>; masks re-read from the full-detail vertex nearest each kept one."""
    co0, _ = world_mesh(obj); bits0 = c4kit.get_mask(obj)
    out = []
    for lvl, ratio in ((0, ratio0),) + tuple((l, ratio0 * r) for l, r in LODS):
        c = dup(obj, f"{base}_LOD{lvl}")
        if ratio < 0.999 and len(c.data.polygons) > 40:
            d = c.modifiers.new("dec", "DECIMATE"); d.ratio = ratio; d.use_collapse_triangulate = True
            select([c]); bpy.ops.object.modifier_move_to_index(modifier="dec", index=0)
            bpy.ops.object.modifier_apply(modifier="dec")
            c4kit.copy_mask_nearest(co0, bits0, c)
        out.append(c)
    bpy.data.objects.remove(obj)
    return out


def tris(o):
    o.data.calc_loop_triangles(); return len(o.data.loop_triangles)


GLTFPACK = os.path.normpath(os.path.join(C4, "..", "..", "node_modules", ".bin", "gltfpack"))


def for_export(o):
    """gltfpack (meshopt compression) drops custom vertex attributes, so the hide mask travels as COLOR_0
    (R = garment bits 0-7, G = bits 8-15, each k/255 — exact through 8-bit quantisation) and the elf ears as a
    morph target 'elf_ears'."""
    me = o.data
    bits = c4kit.get_mask(o)
    ca = me.color_attributes.new("c4mask", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", [x for b in bits for x in ((b & 255) / 255, ((b >> 8) & 255) / 255, 0.0, 1.0)])
    me.color_attributes.active_color = ca
    if "_c4mask" in me.attributes: me.attributes.remove(me.attributes["_c4mask"])
    ears = me.attributes.get("_c4ears")
    if ears:
        d = np.empty(len(me.vertices) * 3, dtype=np.float32); ears.data.foreach_get("vector", d)
        me.attributes.remove(ears)
        co = np.empty(len(me.vertices) * 3, dtype=np.float32); me.vertices.foreach_get("co", co)
        o.shape_key_add(name="Basis"); k = o.shape_key_add(name="elf_ears")
        k.data.foreach_set("co", co + d)


CORE_CLIPS = ["idle", "ready", "walk", "run", "sprint", "jump", "attack", "cast", "hit", "death", "talk", "walk_robe", "run_robe", "sprint_robe"]


def glb_keep_animations(src, dst, names):
    """A copy of a GLB whose JSON lists only these animations (gltfpack then drops the data nothing refers to)."""
    import struct
    d = open(src, "rb").read()
    jl = struct.unpack("<I", d[12:16])[0]; j = json.loads(d[20:20 + jl]); rest = d[20 + jl:]
    j["animations"] = [a for a in j.get("animations", []) if a["name"] in names]
    js = json.dumps(j, separators=(",", ":")).encode(); js += b" " * ((4 - len(js) % 4) % 4)
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + len(rest)) + struct.pack("<II", len(js), 0x4E4F534A) + js + rest
    open(dst, "wb").write(out)


def export(path, objs, rig, anims=False, split=None):
    for o in objs: for_export(o)
    select([rig] + objs, rig)
    raw = path[:-4] + ".raw.glb"
    kw = dict(filepath=raw, export_format="GLB", use_selection=True, export_skins=True, export_morph=True,
              export_morph_normal=False, export_apply=False, export_yup=True, export_attributes=False,
              export_materials="NONE", export_vertex_color="ACTIVE", export_animations=anims)
    if anims: kw["export_animation_mode"] = "ACTIONS"
    bpy.ops.export_scene.gltf(**kw)
    import subprocess
    if split:
        out = {}
        for name, keep in split.items():
            part = os.path.join(os.path.dirname(path), "_" + name)
            glb_keep_animations(raw, part, set(keep))
            dst = os.path.join(os.path.dirname(path), name)
            r = subprocess.run([GLTFPACK, "-i", part, "-o", dst, "-cc", "-kn", "-af", "30"], capture_output=True, text=True)
            if r.returncode != 0: raise RuntimeError("gltfpack failed: " + r.stdout + r.stderr)
            RAW_BYTES[name] = os.path.getsize(part); os.remove(part)
            out[name] = os.path.getsize(dst)
        os.remove(raw)
        return out
    # -cc meshopt, -kn keep named nodes (bones), -kv keep the mask colour, -vpf/-vtf float positions + UVs (an
    # integer position would put its scale into each FILE's bind matrices, and the runtime merges pieces from many files
    # onto one skeleton), -af 30 animation resample
    r = subprocess.run([GLTFPACK, "-i", raw, "-o", path, "-cc", "-kn", "-kv", "-vpf", "-vtf", "-af", "30"], capture_output=True, text=True)
    if r.returncode != 0: raise RuntimeError("gltfpack failed: " + r.stdout + r.stderr)
    RAW_BYTES[os.path.basename(path)] = os.path.getsize(raw)
    os.remove(raw)
    return os.path.getsize(path)


RAW_BYTES = {}


def main():
    cfg = BODIES[BODY]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec = dict(cfg["spec"]); spec["hair"] = None
    bm, rig = c4mh.build(f"C4_{BODY}", spec, clothes=[])
    log("rig matrix_world", [list(map(lambda x: round(x, 3), r)) for r in rig.matrix_world])
    skin = os.path.join(TEX, cfg["skin"])
    if os.path.exists(skin): c4mh.set_diffuse(bm, skin)
    B = cc.Body(bm, rig)
    col = bpy.context.scene.collection
    # ---- every garment of both outfits, measured off THIS body
    pieces = {g: [] for g in GIDS}
    def file_under(objs, group):
        for p in objs:
            gid = next((g for g, (grp, pre, _, _) in GARMENTS.items() if grp == group and p.name.startswith(pre)), None)
            if gid is None: bpy.data.objects.remove(p); continue          # the mage's own trousers: the elf's are used
            p.name = f"{gid}:{p.name}"; pieces[gid].append(p)
    file_under(s5.mage_outfit(B, col), "mage")
    file_under(s5.elf_outfit(B, col, under_drop=0.09, trousers_rise=0.06), "elf")   # undershirt reaches into the trousers (no skin ring when worn without a jerkin)
    hat, _ = s5.fit_hat(B, None, col)
    z_band = B.top - 0.42 * s5.landmarks(B)[2]
    for p in hat: p.name = "Hat:" + p.name
    pieces["hat"] = hat
    for gid, objs in pieces.items():
        for p in objs:
            nm = p.name; p.name = nm.split(":", 1)[1]; tag(p, gid); p.name = nm
    log("garments", {g: len(v) for g, v in pieces.items()})
    # ---- hair styles
    hairs = {hid: add_hair(bm, hid) for hid in HAIRS}
    log("hairs", {h: len(o.data.vertices) for h, o in hairs.items()})
    # ---- masks. Body: which garments cover each body vertex (head, neck and hands are never hidden)
    cand = {i for i in B.idx if B.wsum(i, ["head", "neck_01"]) < 0.3 and not any(k.startswith(("hand", "index", "middle", "ring", "pinky", "thumb")) for k, w in B.w[i].items() if w > 0.3)}
    body_bits = [0] * len(B.co)
    report = {"body_hidden_by": {}, "garment_hidden_by": {}, "hair_hidden_by": {}}
    for gid in GIDS:
        if gid == "hat": continue
        hid = cc.covered(B, pieces[gid], cand, reach=0.35)
        for i in hid: body_bits[i] |= 1 << BIT[gid]
        report["body_hidden_by"][gid] = len(hid)
    # a floor-length robe hides EVERY leg vertex between its hem and the hips, not only the ones the ray test calls
    # covered: near the hem the tilted rays escape under it, and those vertices are the ones a stride swings out
    robe_obj = next(p for p in pieces["robe"] if p.name.split(":", 1)[1].startswith("Robe"))
    hem_z = min((robe_obj.matrix_world @ v.co).z for v in robe_obj.data.vertices) + 0.005
    hip_z = B.head("pelvis").z
    LEGB = ("thigh_l", "thigh_r", "calf_l", "calf_r", "foot_l", "foot_r", "ball_l", "ball_r")
    n = 0
    for i in B.idx:
        if hem_z < B.co[i].z < hip_z and B.wsum(i, LEGB) > 0.5 and not body_bits[i] & (1 << BIT["robe"]):
            body_bits[i] |= 1 << BIT["robe"]; n += 1
    report["body_hidden_by"]["robe_legs_rule"] = n
    log("body masks", report["body_hidden_by"])
    c4kit.set_mask(bm, body_bits)
    # garments: an outer (higher layer) garment hides what of an inner one it covers
    for gid in GIDS:
        objs = pieces[gid]
        data = [world_mesh(o) for o in objs]
        bits = [[0] * len(co) for co, _ in data]
        for outer in GIDS:
            if GARMENTS[outer][3] <= GARMENTS[gid][3] or (gid, outer) in NO_MASK or outer == "hat": continue
            n = 0
            for k, (co, faces) in enumerate(data):
                hid = c4kit.covered_by(co, c4kit.outward_normals(co, B), faces, pieces[outer], reach=0.35)
                for i in hid: bits[k][i] |= 1 << BIT[outer]
                n += len(hid)
            if n: report["garment_hidden_by"][f"{gid}<{outer}"] = n
        if gid in ("trousers", "boots_low", "boots_tall"):              # the robe's leg rule, for what is on the legs
            for k, (co, faces) in enumerate(data):
                for i, p in enumerate(co):
                    if hem_z < p.z < hip_z: bits[k][i] |= 1 << BIT["robe"]
        for o, b in zip(objs, bits): c4kit.set_mask(o, b)
    log("garment masks", report["garment_hidden_by"])
    # hair: the hat takes everything above its band inside the brim; torso cloth takes hair that goes under it
    cx = sum(B.co[i].x for i in B.idx) / len(B.idx)
    for hid, h in hairs.items():
        co, faces = world_mesh(h)
        bits = [0] * len(co)
        n_hat = 0
        for i, p in enumerate(co):
            if p.z > z_band - 0.01: bits[i] |= 1 << BIT["hat"]; n_hat += 1
        cov = {}
        for outer in ("mantle", "robe", "jerkin", "pauldrons", "undershirt"):
            hidd = c4kit.covered_by(co, c4kit.outward_normals(co, B), faces, pieces[outer], reach=0.2)
            for i in hidd: bits[i] |= 1 << BIT[outer]
            cov[outer] = len(hidd)
        c4kit.set_mask(h, bits)
        report["hair_hidden_by"][hid] = dict(cov, hat=n_hat)
    log("hair masks", report["hair_hidden_by"])
    # ---- paint: each outfit group joined, unwrapped and projected from its own reference pictures
    painted = {}
    garments = {}
    # weights are copied from the body with what the whole outfit covers hidden, measured TOGETHER as step 5 did (a
    # shin under boot + robe + trousers counts as covered even when no single piece covers it): a robe vertex then
    # takes the pelvis/spine and a boot shaft its foot, not the thigh/calf they happen to be nearest
    skin_hide = {grp: cc.covered(B, [p for g in GIDS if GARMENTS[g][0] == grp or g == "trousers" for p in pieces[g]], cand, reach=0.35)
                 for grp in ("mage", "elf")}
    for group in ("mage", "elf"):
        objs = [p for g in GIDS if GARMENTS[g][0] == group for p in pieces[g]]
        j = cc.join(objs, f"paint_{group}")
        cc.unwrap(j)
        xs = [j.matrix_world @ v.co for v in j.data.vertices]
        ymid = (min(p.y for p in xs) + max(p.y for p in xs)) / 2
        painted[group] = cc.project_bake(j, pics_for(group, B, ymid), [j, bm], os.path.join(OUT, f"_{group}-paint.png"))
        # weights: copied from the WHOLE body (a tight garment must bend where the limb under it bends: copied from a
        # body with the legs hidden, the trousers took the hip's and foot's weights and never bent at the knee)
        cc.skin_to(j, B, rig)
        gids = [g for g in GIDS if GARMENTS[g][0] == group]
        garments.update({nm[2:]: o for nm, o in split_by(j, "c4_gid", [BIT[g] for g in gids], ["g_" + g for g in gids]).items()})
        log("painted", group)
    # ...except the robe, which copies from the body with what the outfit covers hidden (step 5), so above the skirt
    # bones it follows the pelvis and spine and not the thigh each robe vertex happens to be nearest
    ro = garments["robe"]
    for m_ in [m_ for m_ in ro.modifiers if m_.type == "ARMATURE"]: ro.modifiers.remove(m_)
    ro.vertex_groups.clear()
    cc.mask_body(bm, skin_hide["mage"])
    cc.skin_to(ro, B, rig)
    bm.modifiers.remove(bm.modifiers["C4 hide under clothes"]); bm.vertex_groups.remove(bm.vertex_groups["c4_hidden"])
    # low boots ride the foot (what step 5's masked weight copy gave them, and what step 6 passed with): a shaft that
    # bends with the calf pushes its back edge through the robe's back wall when the leg swings back
    bo = garments["boots_low"]
    for v in bo.data.vertices:
        side = "l" if (bo.matrix_world @ v.co).x > B.cx else "r"
        for g in list(v.groups): bo.vertex_groups[g.group].remove([v.index])
        bo.vertex_groups["foot_" + side].add([v.index], 1.0, "REPLACE")
    hj = cc.join(pieces["hat"], "g_hat"); cc.skin_to(hj, B, rig); garments["hat"] = hj
    # ---- check: a garment vertex's strongest bone is the strongest bone of the body under it (tight garments)
    agree = {}
    for g in GIDS:
        o = garments[g]; names = {vg.index: vg.name for vg in o.vertex_groups}; hit = tot = 0
        for v in o.data.vertices:
            if not v.groups: continue
            top = names[max(v.groups, key=lambda x: x.weight).group]
            _, i, _ = B.kd.find(o.matrix_world @ v.co); bw = {k: w for k, w in B.w[B.idx[i]].items() if k in rig.data.bones}
            if bw: hit += top == max(bw, key=bw.get); tot += 1
        agree[g] = round(hit / max(1, tot), 3)
    report["weight_agreement"] = agree
    log("weight agreement", agree)
    # ---- skirt bones from the robe; the robe and the tabard both hang from them
    centre, hip_z, ring_r, hem_z, hem_r = s6.robe_geometry(garments["robe"], B, 1)
    c4anim.add_skirt_bones(rig, centre, hip_z, ring_r, hem_z, hem_r)
    c4anim.skirt_weights(garments["robe"], centre, hip_z - 0.16, hip_z + 0.07, pieces=(1,))
    c4anim.skirt_weights(garments["tabard"], centre, hip_z - 0.16, hip_z + 0.07, pieces=(3,))
    m = garments["mantle"]; me = m.data; kind = [0] * len(me.vertices); me.attributes["c4_piece"].data.foreach_get("value", kind)
    for v in me.vertices:                                  # the mantle rides the upper back, not the arms (step 7)
        if kind[v.index] != 4: continue
        side = "l" if (m.matrix_world @ v.co).x > B.cx else "r"
        for g in list(v.groups): m.vertex_groups[g.group].remove([v.index])
        m.vertex_groups["spine_03"].add([v.index], 0.7, "REPLACE"); m.vertex_groups["clavicle_" + side].add([v.index], 0.3, "REPLACE")
    # ---- clips
    src = c4anim.load_library()
    fps = bpy.context.scene.render.fps
    acts = {}
    clips = dict(c4emotes.CLIPS)
    if QUICK: clips = {k: clips[k] for k in ("idle", "walk", "run", "attack", "sit", "drive", "ready")}
    for name, clip in clips.items():
        stride = 1.0
        acts[name] = c4kit.retarget_seq(src, rig, name, [(clip, c4kit.frames_of(clip))], stride)
    log("copied clips", len(acts))
    if not QUICK:
        for name, clip in c4emotes.MIRRORED.items():
            acts[name] = c4kit.retarget_seq(src, rig, name, [(clip, c4kit.frames_of(clip))], mirror=True)
        acts["jump"] = c4kit.retarget_seq(src, rig, "jump", [("Jump_Start", c4kit.frames_of("Jump_Start")), ("Jump_Loop", c4kit.frames_of("Jump_Loop")), ("Jump_Land", c4kit.frames_of("Jump_Land"))])
        acts["standUp"] = c4kit.retarget_seq(src, rig, "standUp", [("Death01", list(reversed(c4kit.frames_of("Death01"))))])
        acts["sleep"] = c4kit.retarget_seq(src, rig, "sleep", [("Death01", [c4kit.frames_of("Death01")[-1]] * 24)])
    robe_strides = {}
    for name, row in c4emotes.ROBE.items():
        if name not in clips: continue
        st = c4anim.robe_stride(src, clips[name], **s6.LIMITS[row])
        if row == "run": st["spine"] = 0.6
        robe_strides[name] = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in st.items()}
        acts[name + "_robe"] = c4kit.retarget_seq(src, rig, name + "_robe", [(clips[name], c4kit.frames_of(clips[name]))], st)
    # emotes on top of a copied clip
    rig.animation_data.action = acts.get("sit") or acts["idle"]
    bpy.context.scene.frame_set(0)
    ctx = {"sit_drop": -max(0.0, (rig.matrix_world @ rig.pose.bones["thigh_l"].head).z - (B.bot + 0.11))}
    for name, (base, secs, loops, fn) in c4emotes.EMOTES.items():
        if base not in clips and base not in acts: continue
        if QUICK and name not in ("wave", "ride", "sitGround", "guard"): continue
        bf = c4kit.frames_of(clips[base]) if base in clips else None
        n = int(round(secs * fps)) + 1 if secs else len(bf)
        seg = [(clips[base], [bf[i % len(bf)] for i in range(n)])]
        a = c4kit.retarget_seq(src, rig, name, seg)
        c4kit.overlay(rig, a, lambda t, d, fn=fn: fn(t, d, ctx), fps)
        acts[name] = a
    log("clips", len(acts))
    raw_idle = c4kit.retarget_seq(src, rig, "_raw_idle", [(clips["idle"], c4kit.frames_of(clips["idle"]))], knee_fix=False)
    knees = {"idle_without_fix": c4kit.knee_report(rig, raw_idle)}
    bpy.data.actions.remove(raw_idle)
    for name, a in acts.items(): knees[name] = c4kit.knee_report(rig, a)
    log("knees (smallest bend, degrees; below 0 = bent the wrong way)", knees)
    for a in acts.values(): c4anim.drive_skirt(rig, a)
    log("skirt driven")
    # ---- step 6's check on every robe twin, with both kinds of boots, on this body
    robe_test = {}
    # (the runtime never puts knee boots under a floor-length robe — chibi4-outfit.js resolve() swaps them for low ones:
    # a tall shaft's heel kicked up 25 vertices through the back of the robe on one running frame)
    for boots in ("boots_low",):
        r = dup(garments["robe"], "_m_robe"); b = dup(garments[boots], "_m_boots")
        # what the runtime draws: boot vertices under the robe (its bit in the boot's mask) are not drawn, so they
        # cannot poke through it
        import bmesh
        bb = bmesh.new(); bb.from_mesh(b.data); bb.verts.ensure_lookup_table()
        hidden = [bb.verts[i] for i, m_ in enumerate(c4kit.get_mask(b)) if m_ & (1 << BIT["robe"])]
        bmesh.ops.delete(bb, geom=hidden, context="VERTS"); bb.to_mesh(b.data); bb.free()
        mo = cc.join([r, b], "_measure")
        for name in [n for n in acts if n.endswith("_robe")]:
            res = c4anim.measure_feet(mo, rig, acts[name])
            gaps = [x[2] for x in res if x[2] is not None]
            robe_test[f"{name}+{boots}"] = {"frames": len(res), "poking_vertices": sum(x[1] for x in res),
                                            "frames_with_pokes": sum(1 for x in res if x[1]),
                                            "min_gap_cm": round(100 * min(gaps), 1) if gaps else None}
        bpy.data.objects.remove(mo)
    log("robe test", robe_test)
    rig.animation_data.action = acts["idle"]; bpy.context.scene.frame_set(0)
    for o in [o for o in bpy.data.objects if o == src or o.parent == src or o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        if a.name not in acts: bpy.data.actions.remove(a)
    # ---- the face parts join the body; teeth and tongue are dropped
    eyes = c4mh.part(rig, "high-poly"); brows = c4mh.part(rig, "eyebrow"); lashes = c4mh.part(rig, "eyelash")
    keep = {bm, eyes, brows, lashes, *hairs.values(), *garments.values()}
    for o in c4mh.children(rig):
        if o.type == "MESH" and o not in keep: bpy.data.objects.remove(o)
    # ---- atlas
    eye_img = bpy.data.images.load(os.path.join(MPFB, "eyes", "materials", cfg["eyes"]))
    srcs = {"skin": c4mh_diffuse(bm), "mage": painted["mage"], "elf": painted["elf"], "eyes": eye_img,
            "brows": c4mh_diffuse(brows), "lashes": c4mh_diffuse(lashes), "flat": None}
    for hid, h in hairs.items(): srcs["hair_" + hid] = c4mh_diffuse(h)
    atlas = np.zeros((ATLAS_H, ATLAS_W, 4), dtype=np.float32); atlas[..., 3] = 1.0
    for key in CELLS:
        x, y, w, h = cell_rect(key)
        X, Y, W, H = int(round(x * ATLAS_W)), int(round(y * ATLAS_H)), int(round(w * ATLAS_W)), int(round(h * ATLAS_H))
        img = srcs.get(key)
        atlas[Y:Y + H, X:X + W] = pixels(img, W, H) if img is not None else (0.5, 0.5, 0.5, 1.0)
    for hid in HAIRS: to_cell(hairs[hid], "hair_" + hid)
    to_cell(eyes, "eyes"); to_cell(brows, "brows"); to_cell(lashes, "lashes")
    for g in GIDS:
        if g == "hat": to_cell(garments[g], "flat", flat=True)
        else: to_cell(garments[g], GARMENTS[g][0])
    # the body's UVs last: bake_body applies the helper mask
    bake_body(bm)
    to_cell(bm, "skin")
    # ---- tint mask (R main colour, G second colour, B skin), half the atlas size
    MW, MH = ATLAS_W // 2, ATLAS_H // 2
    mask = np.zeros((MH, MW, 3), dtype=np.float32)
    lab = np.full((MH, MW), -1, dtype=np.int32)
    for g in GIDS:
        if g == "hat": continue
        o = garments[g]; me = o.data; me.calc_loop_triangles()
        uv = np.empty(len(me.loops) * 2, dtype=np.float32); me.uv_layers[0].data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
        li = np.empty(len(me.loop_triangles) * 3, dtype=np.int32); me.loop_triangles.foreach_get("loops", li)
        t = uv[li].reshape(-1, 3, 2) * np.array([MW, MH])
        c4kit.raster_labels(t, np.full(len(t), BIT[g]), MW, MH, lab)
    c4kit.dilate_labels(lab, 3)
    small = atlas[::2, ::2, :3]
    gmeta = {}
    for g in GIDS:
        if g == "hat":
            gmeta[g] = {"refA": "#1e2a5a", "lumA": c4kit.lum(c4kit.srgb_to_lin([0.5] * 3)), "refB": None, "lumB": 1.0, "tintAlways": True}
            continue
        sel = lab == BIT[g]
        px = small[sel]
        if len(px) < 30: gmeta[g] = {"refA": "#808080", "lumA": 0.2, "refB": None, "lumB": 1}; continue
        samp = px[np.random.default_rng(3).choice(len(px), size=min(len(px), 6000), replace=False)]
        cen, cnt = c4kit.kmeans(samp, 3)
        d = ((px[:, None, :] - cen[None]) ** 2).sum(-1)
        wts = np.exp(-d / (2 * 0.09 ** 2)); wts /= wts.sum(1, keepdims=True) + 1e-6
        ch = np.zeros((len(px), 3), dtype=np.float32); ch[:, 0] = wts[:, 0]; ch[:, 1] = 1 - wts[:, 0]   # second colour = everything else (no untinted third colour left showing, e.g. a painted V-neck of skin)
        mask[sel] = ch
        la, lb = c4kit.srgb_to_lin(cen[0]), c4kit.srgb_to_lin(cen[1])
        gmeta[g] = {"refA": c4kit.hexc(cen[0]), "lumA": round(max(0.01, c4kit.lum(la)), 4), "refB": c4kit.hexc(cen[1]),
                    "lumB": round(max(0.01, c4kit.lum(lb)), 4), "share": [round(float(c) / cnt.sum(), 2) for c in cnt]}
    def cell_px(key):
        x, y, w, h = cell_rect(key)
        return slice(int(y * MH), int((y + h) * MH)), slice(int(x * MW), int((x + w) * MW))
    ys, xs = cell_px("skin"); mask[ys, xs, 2] = 1.0
    skin_ref = atlas[::2, ::2][ys, xs]
    sp = skin_ref[(skin_ref[..., :3].sum(-1) > 0.6)][:, :3]
    skin_lin = c4kit.srgb_to_lin(np.median(sp, 0)) if len(sp) else c4kit.srgb_to_lin([0.8, 0.6, 0.5])
    ys, xs = cell_px("brows"); mask[ys, xs, 0] = 1.0
    ys, xs = cell_px("flat"); mask[ys, xs, 0] = 1.0
    hmeta = {}
    for hid in HAIRS:
        ys, xs = cell_px("hair_" + hid)
        a = atlas[::2, ::2][ys, xs]
        mask[ys, xs, 0] = (a[..., 3] > 0.05).astype(np.float32)
        hp = a[a[..., 3] > 0.5][:, :3]
        ref = np.median(hp, 0) if len(hp) else np.array([0.3, 0.2, 0.1])
        hmeta[hid] = {"ref": c4kit.hexc(ref), "lum": round(max(0.01, c4kit.lum(c4kit.srgb_to_lin(ref))), 4)}
    ys, xs = cell_px("brows")
    bp = atlas[::2, ::2][ys, xs]; bp = bp[bp[..., 3] > 0.5][:, :3]
    brow_lum = round(max(0.01, c4kit.lum(c4kit.srgb_to_lin(np.median(bp, 0)))), 4) if len(bp) else 0.05
    def save(arr, w, h, name, alpha):
        im = bpy.data.images.new(name, w, h, alpha=alpha)
        a4 = arr if arr.shape[-1] == 4 else np.concatenate([arr, np.ones(arr.shape[:2] + (1,), np.float32)], -1)
        im.pixels.foreach_set(a4.astype(np.float32).ravel())
        png = os.path.join(OUT, "_" + name.replace(".webp", ".png")); im.filepath_raw = png; im.file_format = "PNG"
        im.save()
        return png
    # WebP through the system Python's PIL (Blender's WebP writer has no quality setting): the atlas at quality 82,
    # the tint mask at quarter size (it is smooth)
    import subprocess
    enc = ("import sys\nfrom PIL import Image\nsrc, out, q, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])\n"
           "im = Image.open(src)\nim = im.resize((w, h), Image.Resampling.LANCZOS) if im.size != (w, h) else im\n"
           "im.save(out, 'WEBP', quality=q, method=6)\n")
    subprocess.run(["python3", "-c", enc, save(atlas, ATLAS_W, ATLAS_H, "atlas.webp", True), os.path.join(OUT, "atlas.webp"), "82", str(ATLAS_W), str(ATLAS_H)], check=True)
    MW, MH = ATLAS_W // 4, ATLAS_H // 4
    subprocess.run(["python3", "-c", enc, save(mask, ATLAS_W // 2, ATLAS_H // 2, "mask.webp", False), os.path.join(OUT, "mask.webp"), "90", str(MW), str(MH)], check=True)
    sizes = {n: os.path.getsize(os.path.join(OUT, n)) for n in ("atlas.webp", "mask.webp")}
    log("textures", sizes)
    # ---- one mesh per piece: the body with its face parts, then LODs
    for o in (eyes, brows, lashes): apply_all_but_armature(o)
    body = cc.join([bm, eyes, brows, lashes], "body")
    for o in [body, *hairs.values(), *garments.values()]:
        o.data.materials.clear()
        for nm in [a.name for a in o.data.attributes if a.name.startswith("c4_")]: o.data.attributes.remove(o.data.attributes[nm])
        for cl in list(o.data.color_attributes): o.data.color_attributes.remove(cl)
        if not any(m.type == "ARMATURE" for m in o.modifiers):
            am = o.modifiers.new("Armature", "ARMATURE"); am.object = rig
        o.parent = rig
    files = {}
    meta = {"body": BODY, "bones": [b.name for b in rig.data.bones], "height": round(B.H, 3), "fps": fps,
            "atlas": {"file": "atlas.webp", "w": ATLAS_W, "h": ATLAS_H}, "mask": {"file": "mask.webp", "w": MW, "h": MH},
            "skinRef": [round(float(x), 4) for x in skin_lin], "browLum": brow_lum, "bits": BIT,
            "garments": {}, "hairs": {}, "clips": {}, "robeStrides": robe_strides, "robeTest": robe_test, "masks": report, "knees": knees}
    lods = make_lods(body, "body", 1.0)
    files["body.glb"] = export(os.path.join(OUT, "body.glb"), lods, rig)
    meta["bodyTris"] = [tris(o) for o in lods]
    for hid, h in hairs.items():
        ls = make_lods(h, "h_" + hid, 1.0)
        files[f"h_{hid}.glb"] = export(os.path.join(OUT, f"h_{hid}.glb"), ls, rig)
        meta["hairs"][hid] = dict(hmeta[hid], file=f"h_{hid}.glb", tris=[tris(o) for o in ls])
    for g in GIDS:
        ls = make_lods(garments[g], "g_" + g, 1.0 if g in ("hat",) else CLOTH_RATIO)
        files[f"g_{g}.glb"] = export(os.path.join(OUT, f"g_{g}.glb"), ls, rig)
        grp, _, slots, layer = GARMENTS[g]
        meta["garments"][g] = dict(gmeta[g], file=f"g_{g}.glb", bit=BIT[g], slots=slots, layer=layer, long=g == "robe",
                                   skirt=g in ("robe", "tabard"), tris=[tris(o) for o in ls])
    for o in [o for o in bpy.data.objects if o.type == "MESH"]: bpy.data.objects.remove(o)
    # clips in two files: the ones a character needs the moment it appears, and the rest (fetched right after)
    files.update(export(os.path.join(OUT, "anims.glb"), [], rig, anims=True,
                        split={"anims.glb": CORE_CLIPS, "anims_more.glb": [n for n in acts if n not in CORE_CLIPS]}))
    for name, a in acts.items():
        meta["clips"][name] = round((a.frame_range[1] - a.frame_range[0]) / fps, 3)
    meta["files"] = dict(files, **sizes)
    meta["uncompressedBytes"] = RAW_BYTES
    json.dump(meta, open(os.path.join(OUT, "kit.json"), "w"), indent=1)
    log("EXPORT", json.dumps({k: meta[k] for k in ("bodyTris", "files")}))
    ok = all(v["poking_vertices"] == 0 for v in robe_test.values())
    log("STEP9", BODY, "ROBE PASS" if ok else "ROBE FAIL")


main()
