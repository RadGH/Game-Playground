"""Render scenery props one by one for a close-up contact sheet (tools/scenery-contact.py puts them together).

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/scenery_look.py -- <out-dir> [--px 320] [--back] <a.glb> ...

Each prop alone, three-quarter view from the front-left and 25° above (--back: from the back-right), orthographic,
framed to fit, painted texture with flat studio light (Workbench). A 1.8 m man-height grey post stands beside props
under 12 m so their size reads. Writes <out-dir>/<file name>.png.
"""
import bpy, sys, os, math
from mathutils import Vector
argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]; rest = argv[1:]
PX = 320
if '--px' in rest: i = rest.index('--px'); PX = int(rest[i + 1]); del rest[i:i + 2]
back = '--back' in rest
if back: rest.remove('--back')
os.makedirs(out, exist_ok=True)
for f in rest:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.display.shading.show_backface_culling = False
    sc.display.shading.show_shadows = True
    sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.16, 0.17, 0.2)
    bpy.ops.import_scene.gltf(filepath=f)
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    size = hi - lo
    if size.z < 12:   # a person-sized post for scale, beside the prop
        bpy.ops.mesh.primitive_cylinder_add(radius=0.18, depth=1.8, location=(hi.x + 0.5, lo.y + size.y / 2, 0.9))
        post = bpy.context.active_object
        m = bpy.data.materials.new('post'); m.diffuse_color = (0.55, 0.55, 0.6, 1); post.data.materials.append(m)
        sc.display.shading.color_type = 'TEXTURE'
        hi.x += 0.7
    c = (lo + hi) / 2; r = max((hi - lo).length / 2, 0.3)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = r * 2.05
    az = math.radians(-35 if not back else 145); el = math.radians(25)
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    cam.location = c + d * (r * 4)
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.resolution_x = sc.render.resolution_y = PX
    sc.render.filepath = os.path.join(out, os.path.splitext(os.path.basename(f))[0] + ('-back' if back else '') + '.png')
    bpy.ops.render.render(write_still=True)
print('SCLOOK', len(rest))
