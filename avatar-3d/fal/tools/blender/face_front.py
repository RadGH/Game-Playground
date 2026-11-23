"""Turn an image-to-3D result to face front (-Y, Blender) with its feet at Z = 0, before rigging.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/face_front.py -- <in.glb> <out.glb> <degrees about Z>

Tripo P1 returns characters turned 90 degrees (nose toward +X); Meshy rigging needs them facing the front.
"""
import bpy, sys, math
from mathutils import Matrix
argv = sys.argv[sys.argv.index('--') + 1:]
src, out, deg = argv[0], argv[1], float(argv[2])
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
for o in meshes:
    o.select_set(True); bpy.context.view_layer.objects.active = o
    o.matrix_world = Matrix.Rotation(math.radians(deg), 4, 'Z') @ o.matrix_world   # (glTF import uses quaternions: set the matrix)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
zs = [(v.co.z) for o in meshes for v in o.data.vertices]
xs = [(v.co.x) for o in meshes for v in o.data.vertices]; ys = [(v.co.y) for o in meshes for v in o.data.vertices]
for o in meshes:
    for v in o.data.vertices:
        v.co.z -= min(zs); v.co.x -= (min(xs) + max(xs)) / 2; v.co.y -= (min(ys) + max(ys)) / 2
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_image_format='AUTO')
print('FRONT', out, round(max(zs) - min(zs), 3))
