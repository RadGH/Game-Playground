"""Quick look: render one or more GLBs side by side (Workbench, painted texture, flat studio light) into one PNG.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/look.py -- <out.png> [--side|--back|--top] [--h 360] <a.glb> <b.glb> ...

Front view = looking at the model's front (-Y) from in front, so the model's own right hand is on the picture's
LEFT. Use it to check a split sheet for mirroring (compare with the drawing), before/after low-poly, a body's face.
--mark puts a red ball at each file's origin (a prop's grip point). Every model is scaled to the same height in its cell. Prints "LOOK <out> <triangles per file>".
"""
import bpy, sys, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
out = argv[0]; rest = argv[1:]
view = 'front'
for v in ('--side', '--back', '--top'):
    if v in rest: view = v[2:]; rest.remove(v)
H = 360
mark = '--mark' in rest
if mark: rest.remove('--mark')
if '--h' in rest: i = rest.index('--h'); H = int(rest[i + 1]); del rest[i:i + 2]
files = rest
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_backface_culling = False
sc.render.film_transparent = False
sc.world = bpy.data.worlds.new('w'); sc.world.color = (0.12, 0.13, 0.16)
tris = []
x = 0.0
for f in files:
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f)
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == 'MESH']
    pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    size = hi - lo
    k = 1.0 / max(size.z, 1e-6) if view != 'top' else 1.0 / max(size.y, 1e-6)
    root = bpy.data.objects.new('root', None); sc.collection.objects.link(root)
    for o in new:
        if o.parent is None: o.parent = root
    if mark:   # a red ball at the file's origin (a prop's grip / a shield's arm point)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025 / k, location=(0, 0, 0)); ball = bpy.context.active_object
        mat = bpy.data.materials.new('mark'); mat.diffuse_color = (1, 0, 0, 1); mat.use_nodes = True; next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (1, 0, 0, 1); ball.data.materials.append(mat); ball.parent = root
        sc.display.shading.color_type = 'TEXTURE'
    root.scale = (k, k, k)
    c = (lo + hi) / 2
    width = (size.y if view == 'side' else size.x) * k
    root.location = (x + width / 2 + 0.1 - (c.y * k if view == 'side' else c.x * k), -(c.y * k) if view != 'side' else 0, -lo.z * k)
    if view == 'side': root.location = (0, -(x + width / 2 + 0.1) + c.y * k, -lo.z * k)
    x += width + 0.2
    t = 0
    for o in meshes:
        dg = o.evaluated_get(bpy.context.evaluated_depsgraph_get()); m = dg.to_mesh(); m.calc_loop_triangles(); t += len(m.loop_triangles); dg.to_mesh_clear()
    tris.append(t)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
span = max(x, 1.0)
cam.data.ortho_scale = max(span, 1.15)
if view == 'front': cam.location = (x / 2, -10, 0.5); cam.rotation_euler = (math.pi / 2, 0, 0)
elif view == 'back': cam.location = (x / 2, 10, 0.5); cam.rotation_euler = (math.pi / 2, 0, math.pi)
elif view == 'side': cam.location = (10, -x / 2, 0.5); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
else: cam.location = (x / 2, 0, 10); cam.rotation_euler = (0, 0, 0)
sc.render.resolution_y = H
sc.render.resolution_x = max(H, int(H * span / 1.15))
if span > 1.15: sc.render.resolution_y = int(sc.render.resolution_x * 1.15 / span)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('LOOK', out, tris)
