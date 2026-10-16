# Chibi 4 — step 7: export a game-ready GLB per character.
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step7_export.py -- mage|elf [<out_dir>]
#
# Output: avatar-3d/chibi4/models/<who>.glb (+ <who>.json, the numbers the compare page shows). One file holds:
#   * the skeleton: MakeHuman's 53-bone game rig + 8 skirt bones (robe / tabard)
#   * 8 clips copied from Quaternius' CC0 library (idle, walk, run, cast, attack, hit, death, talk); the mage's walk
#     and run use step 6's robe-aware stride and every clip has the skirt bones keyed from the thighs
#   * ONE mesh per distance (LOD0 full, LOD1 ~35%, LOD2 ~12% of the triangles): body (with the hidden-under-clothes
#     faces removed), eyes, brows, lashes, hair and the whole outfit joined
#   * ONE texture: skin, outfit, hair, eyes, brows and lashes copied into cells of a 2048 atlas (WebP, alpha kept for
#     hair/brows/lashes), so a character is one material — a renderer draws it in one call
import bpy, math, os, sys, json, glob
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
C4 = os.path.normpath(os.path.join(HERE, "..", ".."))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHO = argv[0] if argv else "mage"
OUT = argv[1] if len(argv) > 1 else os.path.join(C4, "models")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
sys.argv.append("--fast")
import c4mh, c4anim
import c4clothes as cc
import step5_clothes as s5
import step6_robe_run as s6

MPFB = os.path.expanduser("~/.config/blender/5.2/extensions/.user/user_default/mpfb/data")
EYES = {"mage": "blue_eye.png", "elf": "bluegreen_eye.png"}
ATLAS = 2048
# atlas cells (x, y, w, h) in fractions; y from the BOTTOM (Blender's UV space)
CELLS = {"skin": (0, 0, 0.5, 0.5), "clothes": (0.5, 0, 0.5, 0.5), "hair": (0, 0.5, 0.5, 0.5),
         "eyes": (0.5, 0.5, 0.125, 0.125), "brows": (0.625, 0.5, 0.125, 0.125), "lashes": (0.75, 0.5, 0.125, 0.125)}
LODS = ((0, 1.0), (1, 0.4), (2, 0.15))
CLOTH_RATIO = 0.3


def diffuse_of(obj):
    """The colour picture of a part's material (searching node groups); None for procedural ones."""
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


def pixels(img, w, h):
    """An image resized to w x h as an (h, w, 4) float array (values as stored: sRGB pictures stay sRGB)."""
    c = img.copy(); c.scale(w, h)
    a = np.empty(w * h * 4, dtype=np.float32); c.pixels.foreach_get(a)
    bpy.data.images.remove(c)
    return a.reshape(h, w, 4)


def bake_atlas(parts, path):
    atlas = np.zeros((ATLAS, ATLAS, 4), dtype=np.float32); atlas[..., 3] = 1.0
    for key, (obj, img) in parts.items():
        x, y, w, h = CELLS[key]
        W, H = int(w * ATLAS), int(h * ATLAS); X, Y = int(x * ATLAS), int(y * ATLAS)
        if img is None:
            atlas[Y:Y + H, X:X + W] = (0.5, 0.45, 0.42, 1.0); continue
        atlas[Y:Y + H, X:X + W] = pixels(img, W, H)
    im = bpy.data.images.new("C4_atlas_" + WHO, ATLAS, ATLAS, alpha=True)
    im.pixels.foreach_set(atlas.ravel())
    im.filepath_raw = path; im.file_format = "PNG"; im.save()
    return im


def to_cell(obj, key):
    """Move a part's UVs into its atlas cell, as the single UV map 'UVMap'."""
    me = obj.data
    uv = me.uv_layers.active
    for l in list(me.uv_layers):
        if l != uv: me.uv_layers.remove(l)
    uv = me.uv_layers[0]; uv.name = "UVMap"
    x, y, w, h = CELLS[key]
    a = np.empty(len(me.loops) * 2, dtype=np.float32); uv.data.foreach_get("uv", a)
    a = a.reshape(-1, 2)
    a[:, 0] = x + np.clip(a[:, 0], 0, 1) * w; a[:, 1] = y + np.clip(a[:, 1], 0, 1) * h
    uv.data.foreach_set("uv", a.ravel())


def bake_down(obj):
    """Apply everything but the skeleton: shape keys (the sliders), masks (helpers + hidden-under-clothes), no
    subdivision (the game version is the plain MakeHuman mesh)."""
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.view_layer.objects: o.select_set(False)
    obj.select_set(True)
    if obj.data.shape_keys:
        obj.shape_key_add(name="__mix", from_mix=True)
        keys = obj.data.shape_keys.key_blocks
        mix = keys["__mix"].data
        co = np.empty(len(mix) * 3, dtype=np.float32); mix.foreach_get("co", co)
        obj.shape_key_clear()
        obj.data.vertices.foreach_set("co", co); obj.data.update()
    for m in list(obj.modifiers):
        if m.type == "ARMATURE": continue
        if m.type == "SUBSURF": obj.modifiers.remove(m); continue
        bpy.ops.object.modifier_apply(modifier=m.name)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ch = s5.build_character(WHO, 0.0)
    s5.paint(WHO, ch, os.path.join(OUT, f"_{WHO}-clothes.png"))
    rig, clothes, B, body = ch["rig"], ch["clothes"], ch["B"], ch["body"]
    # the mantle rides the upper back, not the arms (step 6: it lifted when the arms swung back)
    me = clothes.data; kind = [0] * len(me.vertices); me.attributes["c4_piece"].data.foreach_get("value", kind)
    for v in me.vertices:
        if kind[v.index] != 4: continue
        p = clothes.matrix_world @ v.co
        side = "l" if p.x > B.cx else "r"
        for g in list(v.groups): clothes.vertex_groups[g.group].remove([v.index])
        clothes.vertex_groups["spine_03"].add([v.index], 0.7, "REPLACE"); clothes.vertex_groups["clavicle_" + side].add([v.index], 0.3, "REPLACE")
    skirt_piece = 1 if WHO == "mage" else 3
    centre, hip_z, ring_r, hem_z, hem_r = s6.robe_geometry(clothes, B, skirt_piece)
    c4anim.add_skirt_bones(rig, centre, hip_z, ring_r, hem_z, hem_r)
    c4anim.skirt_weights(clothes, centre, hip_z - 0.16, hip_z + 0.07, pieces=(skirt_piece,))
    src = c4anim.load_library()
    info = {"who": WHO, "clips": {}}
    for name, clip in c4anim.CLIPS.items():
        stride = 1.0
        if WHO == "mage" and name in ("walk", "run"):
            stride = c4anim.robe_stride(src, clip, **s6.LIMITS[name])
            if name == "run": stride["spine"] = 0.6          # a robed run stands more upright than Quaternius' jog
        a = c4anim.retarget(src, clip, rig, name, stride=stride)
        c4anim.drive_skirt(rig, a)
        info["clips"][name] = round((a.frame_range[1] - a.frame_range[0]) / bpy.context.scene.render.fps, 3)
        if WHO == "mage" and name in ("walk", "run"):
            m = c4anim.measure_feet(clothes, rig, a)
            info.setdefault("robe_test", {})[name] = {"frames": len(m), "poking": sum(r[1] for r in m)}
    rig.animation_data.action = bpy.data.actions["idle"]
    # drop the source library (its armature and its clips would otherwise ride into the GLB)
    for o in [o for o in bpy.data.objects if o == src or o.parent == src or o.name.startswith("Icosphere")]:
        bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        if a.name not in c4anim.CLIPS: bpy.data.actions.remove(a)
    # the parts that ship
    eyes = c4mh.part(rig, "high-poly"); brows = c4mh.part(rig, "eyebrow"); lashes = c4mh.part(rig, "eyelash")
    hair = ch["hair"]
    for o in c4mh.children(rig):
        if o.type == "MESH" and o not in (body, eyes, brows, lashes, hair, clothes): bpy.data.objects.remove(o)
    eye_img = bpy.data.images.load(os.path.join(MPFB, "eyes", "materials", EYES[WHO]))
    parts = {"skin": (body, diffuse_of(body)), "clothes": (clothes, diffuse_of(clothes)), "hair": (hair, diffuse_of(hair)),
             "eyes": (eyes, eye_img), "brows": (brows, diffuse_of(brows)), "lashes": (lashes, diffuse_of(lashes))}
    print("ATLAS SOURCES", {k: (v[1].name if v[1] else None) for k, v in parts.items()})
    atlas = bake_atlas(parts, os.path.join(OUT, f"_{WHO}-atlas.png"))
    # the outfit was built dense for painting; the game copy keeps 30% of it (body and face stay full detail)
    d = clothes.modifiers.new("dec", "DECIMATE"); d.ratio = CLOTH_RATIO
    bpy.context.view_layer.objects.active = clothes
    bpy.ops.object.modifier_move_to_index(modifier="dec", index=0)
    for key, (obj, _) in parts.items():
        bake_down(obj); to_cell(obj, key)
        obj.data.materials.clear()
    mat = bpy.data.materials.new(f"C4_{WHO}"); mat.use_nodes = True
    nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    t = nt.nodes.new("ShaderNodeTexImage"); t.image = atlas
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    rnd = nt.nodes.new("ShaderNodeMath"); rnd.operation = "ROUND"            # glTF alpha MASK (cut-out hair, lashes)
    nt.links.new(t.outputs["Alpha"], rnd.inputs[0]); nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.78
    objs = [o for o, _ in parts.values()]
    for o in objs: o.data.materials.append(mat)
    lod0 = cc.join(objs, f"C4_{WHO}_LOD0")
    lod0.modifiers.clear(); am = lod0.modifiers.new("Armature", "ARMATURE"); am.object = rig
    lod0.parent = rig
    info["lods"] = []
    meshes = [lod0]
    for lvl, ratio in LODS[1:]:
        c = lod0.copy(); c.data = lod0.data.copy(); c.name = f"C4_{WHO}_LOD{lvl}"
        bpy.context.scene.collection.objects.link(c)
        d = c.modifiers.new("dec", "DECIMATE"); d.ratio = ratio; d.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.modifier_move_to_index(modifier="dec", index=0)
        bpy.ops.object.modifier_apply(modifier="dec")
        meshes.append(c)
    for m in meshes:
        m.data.calc_loop_triangles()
        info["lods"].append({"name": m.name, "triangles": len(m.data.loop_triangles), "vertices": len(m.data.vertices)})
    info["bones"] = len(rig.data.bones)
    info["height"] = round(B.H, 3)
    # export
    for o in bpy.context.view_layer.objects: o.select_set(False)
    rig.select_set(True)
    for m in meshes: m.select_set(True)
    bpy.context.view_layer.objects.active = rig
    glb = os.path.join(OUT, f"{WHO}.glb")
    kw = dict(filepath=glb, export_format="GLB", use_selection=True, export_animations=True, export_skins=True,
              export_morph=False, export_apply=False, export_yup=True, export_image_format="WEBP")
    try: bpy.ops.export_scene.gltf(export_animation_mode="ACTIONS", **kw)
    except TypeError: bpy.ops.export_scene.gltf(**kw)
    info["glb_bytes_raw"] = os.path.getsize(glb)
    # meshopt compression (step 9, owner: "my character took ~5 seconds to load"): 3.2 MB -> 0.9 MB. Float positions
    # and UVs (-vpf -vtf) so nothing about the face or hands moves; gltfpack drops mesh names, so the runtime orders
    # the distance versions by vertex count
    import subprocess, shutil
    gp = os.path.normpath(os.path.join(C4, "..", "..", "node_modules", ".bin", "gltfpack"))
    tmp = glb + ".raw.glb"; shutil.move(glb, tmp)
    subprocess.run([gp, "-i", tmp, "-o", glb, "-cc", "-kn", "-vpf", "-vtf"], check=True); os.remove(tmp)
    info["glb_bytes"] = os.path.getsize(glb)
    json.dump(info, open(os.path.join(OUT, f"{WHO}.json"), "w"), indent=1)
    print("EXPORT", json.dumps(info))


main()
