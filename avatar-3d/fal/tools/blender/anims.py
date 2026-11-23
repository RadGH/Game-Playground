"""Build models/final/anims.glb: the UAL skeleton (no mesh) with a few CC0 Universal Animation Library clips.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/anims.py -- <UAL1_Standard.glb> <out.glb>

The page keeps only rotation tracks (and the pelvis position, re-based to each body's pelvis height), so the same
clips drive every body that tools/blender/to_ual.py made.
"""
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
KEEP = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sword_Idle', 'Sword_Attack', 'Spell_Simple_Shoot', 'Punch_Jab', 'Dance_Loop', 'Death01', 'Hit_Chest']
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for o in list(bpy.data.objects):
    if o is not arm: bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a.name not in KEEP: bpy.data.actions.remove(a)
    else: a.use_fake_user = True
arm.animation_data_create(); arm.animation_data.action = None
# push each kept action to its own NLA track so the exporter writes one clip per action
for a in bpy.data.actions:
    t = arm.animation_data.nla_tracks.new(); t.name = a.name; t.strips.new(a.name, int(a.frame_range[0]), a)
arm.select_set(True)
bpy.ops.export_scene.gltf(filepath=argv[1], use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True)
print('ANIMS', [a.name for a in bpy.data.actions])
