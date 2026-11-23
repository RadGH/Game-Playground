"""Low-poly step for an UNRIGGED body (after face_front.py, before paying for the rig): owner 2026-11-23 wants about
3,000 triangles per body (bosses and big creatures up to ~4,500).

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/lowpoly.py -- <in.glb> <out.glb> [triangles=3000]

Joins the meshes, merges doubled points, collapse-decimates to the target (UVs and the painted texture survive),
keeps only the colour texture (the page paints with it alone), exports. Rigging a light mesh is also faster.
Prints "LOWPOLY <before> -> <after>".
"""
import bpy, sys
argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
want = int(argv[2]) if len(argv) > 2 else 3000
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o, do_unlink=True)
for o in meshes: o.select_set(True)
bpy.context.view_layer.objects.active = meshes[0]
if len(meshes) > 1: bpy.ops.object.join()
o = bpy.context.view_layer.objects.active
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
o.data.calc_loop_triangles(); before = len(o.data.loop_triangles)
if before > want:   # weld seam-split points first, or the cut-down tears the shape into spikes
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0002); bpy.ops.object.mode_set(mode='OBJECT')
    d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = want / before
    bpy.ops.object.modifier_apply(modifier='dec')
for m in o.data.materials:
    if not m or not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for name in ('Normal', 'Metallic', 'Roughness'):
        for l in list(bsdf.inputs[name].links): nt.links.remove(l)
    for _ in range(2):
        for n in list(nt.nodes):
            if n.type in ('TEX_IMAGE', 'NORMAL_MAP', 'SEPARATE_COLOR') and not any(x.links for x in n.outputs): nt.nodes.remove(n)
o.data.calc_loop_triangles()
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_image_format='AUTO')
print('LOWPOLY', before, '->', len(o.data.loop_triangles))
