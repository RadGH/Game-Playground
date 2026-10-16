# Chibi 4 — step 3: MakeHuman base bodies through MPFB 2 (Blender extension, GPL code; the assets and every character
# it outputs are CC0). Headless on the VM:
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step3_makehuman.py -- <out_dir>
#
# Installed once (2026-10-15): `blender -b --command extension install-file -r user_default --enable mpfb.zip` and the
# CC0 packs makehuman_system_assets, skins01, skins02, eyebrows01, eyelashes01, hair01 unzipped into
# ~/.config/blender/5.2/extensions/.user/user_default/mpfb/data (downloads kept in ~/opt/mpfb-dl/).
#
# What this step tests: a properly modelled face and body (real topology, eyes, teeth, lashes, brows) and a game
# skeleton, shaped by sliders toward our target (about 6.5 heads, slightly heroic, slightly bigger eyes). No Codex paint
# yet (that is step 4) — the skins are MakeHuman's own photo-based textures, the clothes MakeHuman's stock suits.
import bpy, math, os, sys, importlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(HERE, "..", "..", "shots", "step3")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
import c4lib

HS = importlib.import_module("bl_ext.user_default.mpfb.services.humanservice").HumanService

bpy.ops.wm.read_factory_settings(use_empty=True)
import addon_utils
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)


def human(name, phenotype, targets, skin, hair, brows, clothes, x):
    info = HS._create_default_human_info_dict()
    info.update({
        "name": name, "phenotype": phenotype, "targets": targets, "rig": "game_engine",
        "eyes": "high-poly/high-poly.mhclo", "eyebrows": brows, "eyelashes": "eyelashes01/eyelashes01.mhclo",
        "teeth": "teeth_base/teeth_base.mhclo", "tongue": "tongue01/tongue01.mhclo", "hair": hair,
        "skin_mhmat": skin, "skin_material_type": "ENHANCED_SSS", "eyes_material_type": "PROCEDURAL_EYES",
        "clothes": clothes, "alternative_materials": {}, "name": name,
    })
    settings = HS.get_default_deserialization_settings()
    settings["subdiv_levels"] = 1
    basemesh = HS.deserialize_from_dict(info, settings)
    root = basemesh.parent or basemesh
    root.location.x = x
    return basemesh, root


T = lambda t, v: {"target": t, "value": v}
# The robed mage of the Codex sheet: a man of ~35, lean-average build, long-legged heroic proportions.
mage_mesh, mage = human("C4_Mage_MH",
    {"gender": 1.0, "age": 0.56, "muscle": 0.55, "weight": 0.48, "proportions": 1.0, "height": 0.62, "cupsize": 0.5,
     "firmness": 0.5, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}},
    [T("l-eye-scale-incr", 0.25), T("r-eye-scale-incr", 0.25)],
    "middleage_caucasian_male/middleage_caucasian_male.mhmat", "short02/short02.mhclo",
    "eyebrow001/eyebrow001.mhclo", ["male_casualsuit04/male_casualsuit04.mhclo"], -0.45)
# The elf warrior: a woman of ~28, athletic, pointed ears, auburn hair.
elf_mesh, elf = human("C4_Elf_MH",
    {"gender": 0.0, "age": 0.45, "muscle": 0.62, "weight": 0.42, "proportions": 1.0, "height": 0.6, "cupsize": 0.45,
     "firmness": 0.6, "race": {"asian": 0.0, "caucasian": 1.0, "african": 0.0}},
    [T("l-ear-shape-pointed", 1.0), T("r-ear-shape-pointed", 1.0), T("l-ear-scale-vert-incr", 0.6),
     T("r-ear-scale-vert-incr", 0.6), T("l-eye-scale-incr", 0.3), T("r-eye-scale-incr", 0.3)],
    "toigo_light_skin_female_ginger/toigo_light_skin_female_ginger.mhmat", "elvs_french_braid_variation/elvs_french_braid_variation.mhclo",
    "eyebrow010/eyebrow010.mhclo", ["female_sportsuit01/female_sportsuit01.mhclo"], 0.45)

def tint_hair(mesh_root_name, rgb, lift=2.4):
    """Recolour a MakeHuman hair: keep the texture's light and dark, take the hue from rgb (black hair can't be
    multiplied into auburn, so blend in COLOR mode and lift the value)."""
    for o in bpy.data.objects:
        if o.type != "MESH" or "hair" not in o.name.lower() and "braid" not in o.name.lower(): continue
        if not o.parent or mesh_root_name not in (o.parent.name, getattr(o.parent.parent, "name", "")): continue
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.use_nodes: continue
            nt = m.node_tree
            bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not bsdf or not bsdf.inputs["Base Color"].links: continue
            src = bsdf.inputs["Base Color"].links[0].from_socket
            hsv = nt.nodes.new("ShaderNodeHueSaturation"); hsv.inputs["Value"].default_value = lift
            mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "COLOR"; mix.inputs[0].default_value = 0.85
            nt.links.new(src, hsv.inputs["Color"]); nt.links.new(hsv.outputs[0], mix.inputs[6])
            mix.inputs[7].default_value = (*rgb, 1)
            nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
            print("tinted", o.name, m.name)


tint_hair("C4_Elf_MH", (0.45, 0.12, 0.04))

# relax the T-pose arms down to the A-pose of the reference sheets (about 45 degrees)
for rig in (mage, elf):
    if rig.type != "ARMATURE": continue
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="POSE")
    for side, sign in (("l", -1), ("r", 1)):
        for nm in (f"upperarm_{side}", f"upper_arm_{side}", f"upperarm.{side.upper()}"):
            b = rig.pose.bones.get(nm)
            if b: b.rotation_mode = "XYZ"; b.rotation_euler = (0, 0, 0); b.rotation_euler.z = 0; break
    bpy.ops.object.mode_set(mode="OBJECT")
    print(rig.name, "bones:", len(rig.data.bones), [b.name for b in rig.data.bones][:12])

# studio light like steps 1-2
sc = bpy.context.scene
w = bpy.data.worlds.new("World"); sc.world = w; w.use_nodes = True
bg = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.42, 0.44, 0.48, 1); bg.inputs[1].default_value = 0.9
for name, rot, energy, col in (("C4_Key", (math.radians(50), 0, math.radians(-35)), 3.2, (1.0, 0.95, 0.88)),
                               ("C4_Rim", (math.radians(60), 0, math.radians(150)), 2.0, (0.8, 0.88, 1.0))):
    ld = bpy.data.lights.new(name, "SUN"); ld.energy = energy; ld.color = col; ld.angle = math.radians(12)
    lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo); lo.rotation_euler = rot

# measure: heads tall (crown to sole / crown to chin is the usual measure; here we report total height + vertex count)
deps = bpy.context.evaluated_depsgraph_get()
for nm, m in (("mage", mage_mesh), ("elf", elf_mesh)):
    ev = m.evaluated_get(deps); me = ev.to_mesh()
    zs = [ (ev.matrix_world @ v.co).z for v in me.vertices ]
    print(f"{nm}: height {max(zs) - min(zs):.3f} m, basemesh verts {len(me.vertices)}")
    ev.to_mesh_clear()
tris = 0
for o in bpy.data.objects:
    if o.type == "MESH" and not o.hide_render:
        ev = o.evaluated_get(deps); me = ev.to_mesh(); me.calc_loop_triangles(); tris += len(me.loop_triangles); ev.to_mesh_clear()
print("total triangles (both, subdivided)", tris)

def only(root_name):
    """Show one character (its rig and everything parented under it) for a solo shot."""
    for o in bpy.data.objects:
        top = o
        while top.parent: top = top.parent
        if o.type in ("MESH", "ARMATURE"): o.hide_render = top.name != root_name

for sub, cx in (("mage", -0.45), ("elf", 0.45)):
    only("C4_Mage_MH" if sub == "mage" else "C4_Elf_MH")
    c4lib.shot(os.path.join(OUT, f"s3{sub}"), ("front", "three_quarter", "back", "left"), center=(cx, 0, 0.88), dist=3.2, ortho=2.0, engine="CYCLES", samples=32)
    c4lib.shot(os.path.join(OUT, f"s3{sub}face"), ("front", "three_quarter", "right"), center=(cx, -0.02, 1.62 if sub == "mage" else 1.56), dist=1.0, ortho=0.38, engine="CYCLES", size=512, samples=48)
for o in bpy.data.objects: o.hide_render = False
c4lib.shot(os.path.join(OUT, "s3game"), ("game",), center=(0, 0, 0.9), dist=9.0, lens=35, engine="CYCLES", size=512, samples=32)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "step3.blend"))
print("step3 done")
