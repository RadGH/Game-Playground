"""Report and render one GLB.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/inspect_glb.py -- <in.glb> <out.png>

Prints one JSON line: triangles, vertices, materials, textures (size), bones, height. Renders a front and a
three-quarter view side by side (EEVEE, flat even light so the painted texture reads as it is) into <out.png>.
"""
import bpy, sys, json, math, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
dg = bpy.context.evaluated_depsgraph_get()
tris = verts = 0
for o in meshes:
    m = o.evaluated_get(dg).to_mesh()
    m.calc_loop_triangles()
    tris += len(m.loop_triangles); verts += len(m.vertices)
    o.evaluated_get(dg).to_mesh_clear()
imgs = [(i.name, i.size[0], i.size[1]) for i in bpy.data.images if i.size[0]]
bones = sum(len(o.data.bones) for o in bpy.context.scene.objects if o.type == 'ARMATURE')
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in meshes:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
size = hi - lo
print('INSPECT ' + json.dumps({'file': os.path.basename(src), 'triangles': tris, 'vertices': verts, 'materials': len(bpy.data.materials), 'textures': imgs, 'bones': bones, 'size': [round(v, 3) for v in size]}))

sc = bpy.context.scene
try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
except TypeError:
    try: sc.render.engine = 'BLENDER_EEVEE'
    except TypeError: pass
sc.render.resolution_x, sc.render.resolution_y = 1024, 768
sc.render.film_transparent = False
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == 'BACKGROUND')
bg.inputs[0].default_value = (0.75, 0.75, 0.75, 1); bg.inputs[1].default_value = 1.0
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2.0
sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sc.collection.objects.link(sun)
centre = (lo + hi) / 2
h = max(size.z, size.x, size.y)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = h * 1.15
# Two views side by side: the model and a copy turned 40 degrees, both seen from the front (-Y looks at +Y in glTF-on-Blender).
dup = []
for o in [o for o in sc.objects if o.parent is None and o.type in ('MESH', 'ARMATURE', 'EMPTY')]:
    c = o.copy(); sc.collection.objects.link(c); dup.append(c)
    for ch in o.children_recursive:
        cc = ch.copy(); sc.collection.objects.link(cc); cc.parent = c if ch.parent == o else cc.parent
gap = max(size.x, size.y) * 1.25
for o in sc.objects:
    if o.parent is None and o.type in ('MESH', 'ARMATURE', 'EMPTY'):
        if o in dup:
            o.location.x += gap * 0.5; o.rotation_mode = 'XYZ'; o.rotation_euler.z += math.radians(-40)
        else:
            o.location.x -= gap * 0.5

cam.data.ortho_scale = max(h, gap * 2) * 1.15
cam.location = (centre.x, centre.y - 10, centre.z); cam.rotation_euler = (math.radians(90), 0, 0)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
