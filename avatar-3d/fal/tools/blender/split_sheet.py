"""Cut one image-to-3D result made from a sheet of items (tools/sheet.py) into one model per item.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/split_sheet.py -- <sheet.glb> <cols> <out-dir> <id> <id> ...

The pieces sit in the same grid as the picture (left to right, top to bottom). Loose parts are grouped by the widest
empty gaps across X (columns) and Z (rows). Each item is saved as <out-dir>/<id>.glb with its texture (1024 px WebP),
centred on X/Y with its lowest point at Z = 0, front still facing -Y. --flip: the result came back mirrored
(left-right): the order AND each item are mirrored back (Test 3: sheet b; render with look.py and compare with the drawing). Prints "SPLIT {...}" with triangles per item.
"""
import bpy, bmesh, sys, json, os
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
flip = '--flip' in argv
argv = [a for a in argv if a != '--flip']
src, cols, out_dir, ids = argv[0], int(argv[1]), argv[2], argv[3:]
rows = (len(ids) + cols - 1) // cols
os.makedirs(out_dir, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
mesh = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
mw = mesh.matrix_world.copy()
mesh.parent = None; mesh.matrix_world = mw
bpy.context.view_layer.objects.active = mesh
for o in bpy.context.selected_objects: o.select_set(False)
mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for o in list(bpy.data.objects):
    if o is not mesh: bpy.data.objects.remove(o, do_unlink=True)
# shrink the shared texture so every item file stays small
for im in bpy.data.images:
    if im.size[0] > 1024: im.scale(1024, 1024)

bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.data.objects if o.type == 'MESH']

def bounds(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs))), Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
info = {o.name: bounds(o) for o in parts}
big = [o for o in parts if len(o.data.vertices) > 30]  # specks do not decide the grid

def cuts(axis, n):
    """the n-1 widest empty gaps along an axis, as cut positions"""
    spans = sorted((info[o.name][0][axis], info[o.name][1][axis]) for o in big)
    gaps, reach = [], spans[0][1]
    for a, b in spans[1:]:
        if a > reach: gaps.append((a - reach, (a + reach) / 2))
        reach = max(reach, b)
    return sorted(c for _, c in sorted(gaps, reverse=True)[:n - 1])

# the maker sometimes lays a row out front-to-back: use whichever ground axis is wider for the columns
span = lambda ax: max(info[o.name][1][ax] for o in big) - min(info[o.name][0][ax] for o in big)
AX = 0 if span(0) >= span(1) else 1
xc, zc = cuts(AX, cols), cuts(2, rows)
if len(xc) != cols - 1 or len(zc) != rows - 1:
    raise SystemExit(f'SPLIT could not find the grid: {len(xc)} column gaps, {len(zc)} row gaps')
groups = {}
for o in parts:
    lo, hi = info[o.name]; c = (lo + hi) / 2
    col = sum(c[AX] > x for x in xc)
    if flip: col = cols - 1 - col
    row = rows - 1 - sum(c.z > z for z in zc)
    i = row * cols + col
    if i < len(ids): groups.setdefault(ids[i], []).append(o)
    else: bpy.data.objects.remove(o, do_unlink=True)
report = {}
for iid, objs in groups.items():
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = iid
    if AX == 1:  # turn the row back so the item faces -Y like the others
        o.rotation_mode = "XYZ"; o.rotation_euler = (0, 0, 1.5707963); bpy.ops.object.transform_apply(rotation=True)
    if flip:   # the whole sheet came back mirrored: mirror each item back (not just the order) and turn its faces out
        o.scale = (-1, 1, 1); bpy.ops.object.transform_apply(scale=True)
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.flip_normals(); bpy.ops.object.mode_set(mode='OBJECT')
    lo, hi = bounds(o)
    off = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    for v in o.data.vertices: v.co -= o.matrix_world.inverted().to_3x3() @ off
    o.location = (0, 0, 0)
    o.data.calc_loop_triangles()
    report[iid] = {'triangles': len(o.data.loop_triangles), 'size': [round(v, 3) for v in (hi - lo)]}
for iid in groups:
    o = bpy.data.objects[iid]
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out_dir, iid + '.glb'), use_selection=True, export_image_format='WEBP', export_image_quality=85)
print('SPLIT ' + json.dumps(report))
