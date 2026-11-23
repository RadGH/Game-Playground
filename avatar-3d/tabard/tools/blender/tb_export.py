# Tabard step 4 — export what the browser loads.
#
#   blender -b --python tb_export.py -- <male|female>     -> models/<body>.glb (skeleton + body + swap-in pieces,
#                                                            no textures: the page paints them), models/<body>_asis.glb
#   blender -b --python tb_export.py -- anims              -> models/anims.glb (the CC0 Universal Animation Library
#                                                            clips on the same 65-bone skeleton, no mesh)
import bpy, os, sys, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tb_lib as L

what = sys.argv[sys.argv.index("--") + 1]
MODELS = os.path.join(L.TABARD, "models"); os.makedirs(MODELS, exist_ok=True)
if what == "anims":
    L.reset(); objs = L.import_glb(L.UAL)
    arm = next(o for o in objs if o.type == "ARMATURE")
    for o in objs:
        if o.type == "MESH": bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT"); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # every action as its own clip (NLA strips), named as in the library
    if arm.animation_data is None: arm.animation_data_create()
    arm.animation_data.action = None
    for act in bpy.data.actions:
        tr = arm.animation_data.nla_tracks.new(); tr.name = act.name
        st = tr.strips.new(act.name, int(act.frame_range[0]), act); st.name = act.name
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, "anims.glb"), use_selection=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_force_sampling=True, export_optimize_animation_size=True)
    print("RES anims", len(bpy.data.actions))
else:
    bpy.ops.wm.open_mainfile(filepath=L.final_blend(what))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    keep = [arm] + [o for o in bpy.data.objects if o.type == "MESH" and (o.name == "Body" or o.name.startswith("geo_"))]
    for o in bpy.data.objects:
        if o not in keep: bpy.data.objects.remove(o)
    for o in keep:
        if o.type == "MESH": o.data.materials.clear()
    for o in bpy.context.view_layer.objects: o.select_set(True)
    if arm.animation_data: arm.animation_data.action = None
    for pb in arm.pose.bones: pb.matrix_basis.identity()
    bpy.ops.export_scene.gltf(filepath=os.path.join(MODELS, f"{what}.glb"), use_selection=True, export_animations=False,
                              export_materials="NONE", export_skins=True, export_def_bones=False)
    shutil.copy(os.path.join(L.TABARD, "build", f"{what}_asis.glb"), os.path.join(MODELS, f"{what}_asis.glb"))
    print("RES", what, [(o.name, len(o.data.polygons)) for o in keep if o.type == "MESH"])
