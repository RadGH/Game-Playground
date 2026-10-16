# Chibi 4 — shared MakeHuman (MPFB 2) helpers for steps 4-7. Imported by the step scripts; runs headless.
#
#   build(spec)            one character from a spec dict (sliders, skin, hair, brows, clothes, proxy) -> (basemesh, rig)
#   set_diffuse(obj, path) swap the colour picture inside an MPFB skin/hair material (keeps its node setup)
#   heads_tall(basemesh)   crown-to-sole height divided by crown-to-chin (the artist's "heads tall" measure)
#   studio()               the grey studio light every step renders under
#   only(root_name)        show one character for a solo shot
#
# Characters (SPECS) are the two test characters of the experiment: the robed mage and the elf warrior.
import bpy, math, os, importlib
from mathutils import Vector

_addon_ready = False


def mpfb():
    global _addon_ready
    if not _addon_ready:
        import addon_utils
        addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
        _addon_ready = True
    return importlib.import_module("bl_ext.user_default.mpfb.services.humanservice").HumanService


T = lambda t, v: {"target": t, "value": v}

# Step 3's sliders, kept as the "before".
STEP3 = {
    "mage": dict(phenotype={"gender": 1.0, "age": 0.56, "muscle": 0.55, "weight": 0.48, "proportions": 1.0, "height": 0.62,
                            "cupsize": 0.5, "firmness": 0.5, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}},
                 targets=[T("l-eye-scale-incr", 0.25), T("r-eye-scale-incr", 0.25)],
                 skin="middleage_caucasian_male/middleage_caucasian_male.mhmat", hair="short02/short02.mhclo",
                 brows="eyebrow001/eyebrow001.mhclo", clothes=["male_casualsuit04/male_casualsuit04.mhclo"]),
    "elf": dict(phenotype={"gender": 0.0, "age": 0.45, "muscle": 0.62, "weight": 0.42, "proportions": 1.0, "height": 0.6,
                           "cupsize": 0.45, "firmness": 0.6, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}},
                targets=[T("l-ear-shape-pointed", 1.0), T("r-ear-shape-pointed", 1.0), T("l-ear-scale-vert-incr", 0.6),
                         T("r-ear-scale-vert-incr", 0.6), T("l-eye-scale-incr", 0.3), T("r-eye-scale-incr", 0.3)],
                skin="toigo_light_skin_female_ginger/toigo_light_skin_female_ginger.mhmat",
                hair="elvs_french_braid_variation/elvs_french_braid_variation.mhclo",
                brows="eyebrow010/eyebrow010.mhclo", clothes=["female_sportsuit01/female_sportsuit01.mhclo"]),
}

# Step 4's push toward the reference sheets: a bigger head (fewer heads tall, ~6.8), larger eyes, a squarer heroic jaw and
# broader shoulders for the mage, a longer neck-free elf face with bigger pointed ears; the mage gets the CC0 skin with a
# painted beard (no CC0 beard mesh exists in MakeHuman's packs).
HEAD_PUSH = [T("head-scale-vert-incr", 1.0), T("head-scale-horiz-incr", 0.85), T("head-scale-depth-incr", 0.8), T("neck-scale-horiz-incr", 0.3)]
STEP4 = {
    "mage": dict(STEP3["mage"],
                 targets=HEAD_PUSH + [T("l-eye-scale-incr", 0.6), T("r-eye-scale-incr", 0.6), T("head-square", 0.35),
                                      T("measure-shoulder-dist-incr", 0.35), T("torso-vshape-incr", 0.3)],
                 skin="jartur69_middleage_slavic_male_with_genitals_and_beard/jartur69_middleage_slavic_male_with_genitals_and_beard.mhmat"),
    "elf": dict(STEP3["elf"],
                targets=HEAD_PUSH + [T("l-ear-shape-pointed", 1.0), T("r-ear-shape-pointed", 1.0),
                                     T("l-ear-scale-vert-incr", 1.0), T("r-ear-scale-vert-incr", 1.0),
                                     T("l-eye-scale-incr", 0.7), T("r-eye-scale-incr", 0.7), T("head-oval", 0.4)]),
}


def build(name, spec, x=0.0, subdiv=1, proxy=None, rig="game_engine", skin_type="ENHANCED_SSS", clothes=None):
    HS = mpfb()
    info = HS._create_default_human_info_dict()
    info.update({
        "name": name, "phenotype": spec["phenotype"], "targets": spec["targets"], "rig": rig,
        "eyes": "high-poly/high-poly.mhclo", "eyebrows": spec["brows"], "eyelashes": "eyelashes01/eyelashes01.mhclo",
        "teeth": "teeth_base/teeth_base.mhclo", "tongue": "tongue01/tongue01.mhclo", "hair": spec.get("hair") or "",
        "skin_mhmat": spec["skin"], "skin_material_type": skin_type, "eyes_material_type": "PROCEDURAL_EYES",
        "clothes": spec["clothes"] if clothes is None else clothes, "alternative_materials": {}, "proxy": proxy or "",
    })
    settings = HS.get_default_deserialization_settings()
    settings["subdiv_levels"] = subdiv
    basemesh = HS.deserialize_from_dict(info, settings)
    root = basemesh.parent or basemesh
    root.location.x = x
    return basemesh, root


def children(root):
    """Every object under a character's rig (body, eyes, brows, lashes, hair, clothes, proxy)."""
    out = []
    for o in bpy.data.objects:
        top = o
        while top.parent: top = top.parent
        if top == root and o != root: out.append(o)
    return out


def part(root, word):
    return next((o for o in children(root) if word in o.name.lower() and o.type == "MESH"), None)


def set_diffuse(obj, path, image_name=None):
    """Swap the colour picture of an MPFB material for another of the same UV layout. MPFB skins keep the image inside
    a node group; hair keeps it in the material itself — both are searched."""
    img = bpy.data.images.load(path, check_existing=True)
    if image_name: img.name = image_name
    done = 0

    def visit(tree):
        nonlocal done
        for n in tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and ("diffuse" in n.label.lower() or "diffuse" in n.name.lower()
                                                     or n.image.name.lower().endswith((".png", ".jpg")) and "normal" not in n.image.name.lower()
                                                     and "bump" not in n.image.name.lower() and "eye" not in n.image.name.lower()):
                n.image = img; done += 1
            if n.type == "GROUP" and n.node_tree: visit(n.node_tree)

    for slot in obj.material_slots:
        if slot.material and slot.material.use_nodes: visit(slot.material.node_tree)
    return done


def eval_verts(obj):
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps); me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


def heads_tall(basemesh):
    """Crown-to-sole height / crown-to-chin. Chin = bottom of the jaw on the centre line (the most-forward profile point
    below the mouth, where the profile turns back into the throat)."""
    pts = [p for p in eval_verts(basemesh)]
    zs = [p.z for p in pts]
    top, bot = max(zs), min(zs)
    h = top - bot
    cx = sum(p.x for p in pts) / len(pts)
    centre = [p for p in pts if abs(p.x - cx) < 0.006 and p.z > bot + h * 0.78]
    # the profile: for each 5 mm band, the most forward point (front is -y)
    bands = {}
    for p in centre:
        k = round(p.z / 0.01)
        if k not in bands or p.y < bands[k].y: bands[k] = p
    ks = sorted(bands)
    face_front = min(bands[k].y for k in ks if bands[k].z > top - h * 0.1)   # ~nose/brow depth
    chin = None
    for k in reversed(ks):          # from the crown down: the chin is the last band still near the face front
        if bands[k].z > top - h * 0.06: continue
        if bands[k].y < face_front + 0.065: chin = bands[k].z
        elif chin is not None: break
    head = top - (chin or top - h / 7.5)
    return round(h / head, 2), round(h, 3), round(head, 3)


def studio():
    sc = bpy.context.scene
    w = bpy.data.worlds.new("World"); sc.world = w; w.use_nodes = True
    bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = (0.42, 0.44, 0.48, 1); bg.inputs[1].default_value = 0.9
    for nm, rot, energy, col in (("C4_Key", (math.radians(50), 0, math.radians(-35)), 3.2, (1.0, 0.95, 0.88)),
                                 ("C4_Rim", (math.radians(60), 0, math.radians(150)), 2.0, (0.8, 0.88, 1.0))):
        ld = bpy.data.lights.new(nm, "SUN"); ld.energy = energy; ld.color = col; ld.angle = math.radians(12)
        lo = bpy.data.objects.new(nm, ld); sc.collection.objects.link(lo); lo.rotation_euler = rot


def only(root_name):
    for o in bpy.data.objects:
        top = o
        while top.parent: top = top.parent
        if o.type in ("MESH", "ARMATURE", "CURVE"): o.hide_render = top.name != root_name


def show_all():
    for o in bpy.data.objects:
        if not o.name.startswith(("Ref_", "C4_Hidden")): o.hide_render = False


def tris(objs):
    deps = bpy.context.evaluated_depsgraph_get(); n = 0
    for o in objs:
        if o.type != "MESH" or o.hide_render: continue
        ev = o.evaluated_get(deps); me = ev.to_mesh(); me.calc_loop_triangles(); n += len(me.loop_triangles); ev.to_mesh_clear()
    return n


def contact_sheet(paths, out, height=350):
    """Glue renders side by side (the review page's figure strips). Uses Blender's own image API (no PIL in Blender)."""
    imgs = [bpy.data.images.load(p, check_existing=False) for p in paths]
    ws = [int(i.size[0] * height / i.size[1]) for i in imgs]
    W = sum(ws)
    sheet = bpy.data.images.new("c4sheet", W, height)
    import array
    buf = array.array("f", [0.0]) * (W * height * 4)
    xo = 0
    for img, w in zip(imgs, ws):
        sw, sh = img.size
        px = array.array("f", [0.0]) * (sw * sh * 4); img.pixels.foreach_get(px)
        for y in range(height):
            sy = min(sh - 1, int(y * sh / height))
            row = sy * sw * 4
            for x in range(w):
                sx = min(sw - 1, int(x * sw / w)) * 4
                d = (y * W + xo + x) * 4
                buf[d:d + 4] = px[row + sx: row + sx + 4]
        xo += w
    sheet.pixels.foreach_set(buf)
    sheet.filepath_raw = out; sheet.file_format = "PNG"; sheet.save()
    for i in imgs: bpy.data.images.remove(i)
    bpy.data.images.remove(sheet)
    return out
