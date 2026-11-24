"""Rig a four-legged creature ourselves (free): read where the legs, head and tail are from the mesh, place a simple
named skeleton there, and let Blender work out the skin weights (automatic weights, "bone heat"; when that finds no
solution, as on the drake, each point follows its nearest bones by distance).

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/quad_rig.py -- <upright.glb> <out.glb> [--wings] [--tail-floor] [--straighten] [--shot <png>]

Why: fal's Tripo rig ($0.30, rig_type quadruped, v2.5) returned a wolf with only two legs and a drake with its back legs
missing (Test 3). The input is the turned-to-front, low-poly model (front = -Y, up = +Z, feet on Z = 0).

How the skeleton is found
  feet   the lowest points of the mesh away from the middle line (a tail on the ground is not a foot), split
         left/right by X and front/back by the widest gap along Y
  legs   each leg rises from its foot to the body line (the spine height above that foot); knee halfway, front elbows
         bend back, hind hocks bend forward (as on a dog)
  spine  hips (above the hind feet) to chest (above the front feet), at 70 % of the back's height there
  head   neck from the chest toward the front-most part of the mesh; head bone ends at the snout
  tail   from the hips to the back-most point, through the middle of each slice of the tail
  wings  (--wings) a two-bone chain per side lying along the folded wing on the back, shoulder to wing tip
Bone names (js/beast.js drives them by these names): root, hips, spine_1..3, neck, head, tail_1..4,
leg_fl_1..3, leg_fr_1..3, leg_bl_1..3, leg_br_1..3, wing_l_1..2, wing_r_1..2.
Prints "QUADRIG {...}" with the joint heights, triangles and the weighting result.
"""
import bpy, sys, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
wings = '--wings' in argv
shot = argv[argv.index('--shot') + 1] if '--shot' in argv else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
for o in list(bpy.data.objects):
    if o is not body: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = body; body.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# weld the points the maker split along texture seams (UVs live on the corners, so they survive): split points get
# different weights and open cracks when the body bends; bone heat also fails less on a closed surface
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005); bpy.ops.object.mode_set(mode='OBJECT')
if '--straighten' in argv:
    # a three-quarter drawing can come back turned a little (Oathwild mountain lion: ~23°, front feet both left of the
    # middle line): turn the body so its long axis (principal axis of the footprint) runs along Y, centred on X = 0
    import math as _m
    from mathutils import Matrix as _M
    P = [v.co for v in body.data.vertices]; mx = sum(p.x for p in P) / len(P); my = sum(p.y for p in P) / len(P)
    sxx = sum((p.x - mx) ** 2 for p in P); syy = sum((p.y - my) ** 2 for p in P); sxy = sum((p.x - mx) * (p.y - my) for p in P)
    ang = 0.5 * _m.atan2(2 * sxy, sxx - syy)          # angle of the long axis from +X
    turn = _m.pi / 2 - ang
    if turn > _m.pi / 2: turn -= _m.pi
    if turn < -_m.pi / 2: turn += _m.pi
    body.data.transform(_M.Translation((-mx, -my, 0)))
    body.data.transform(_M.Rotation(turn, 4, 'Z'))
    P = [v.co for v in body.data.vertices]
    body.data.transform(_M.Translation((-(min(p.x for p in P) + max(p.x for p in P)) / 2, 0, 0)))
    body.data.update()
    print('STRAIGHTEN', round(_m.degrees(turn), 1))
V = [v.co.copy() for v in body.data.vertices]
zmax = max(v.z for v in V); ymin = min(v.y for v in V); ymax = max(v.y for v in V); L = ymax - ymin
H = zmax

# ---- feet: points in the bottom 6 % of the height, split by side and by the widest gap along Y
low = [v for v in V if v.z < H * 0.08]
xr = max(abs(v.x) for v in low)
low = [v for v in low if abs(v.x) > xr * 0.3]   # feet stand apart; a tail lying on the ground runs down the middle
if '--tail-floor' in argv:   # a long tail whose tip rests on the ground off the middle line (mountain lion): no foot in the last 20 %
    low = [v for v in low if v.y < ymax - 0.2 * L]
def gap_split(vals):
    """two groups along one axis (2-means, started at the ends): robust to stray claw points between the feet"""
    a, b = min(vals), max(vals)
    for _ in range(30):
        cut = (a + b) / 2
        A_ = [v for v in vals if v < cut]; B_ = [v for v in vals if v >= cut]
        if not A_ or not B_: break
        a, b = sum(A_) / len(A_), sum(B_) / len(B_)
    return (a + b) / 2
feet = {}
for side, sel in (('l', lambda v: v.x > 0), ('r', lambda v: v.x < 0)):   # model faces -Y: its left is +X
    pts = [v for v in low if sel(v)]
    cut = gap_split([v.y for v in pts])
    for end, pick in (('f', lambda v: v.y < cut), ('b', lambda v: v.y >= cut)):
        p = [v for v in pts if pick(v)]
        feet[end + side] = Vector((sum(v.x for v in p) / len(p), sum(v.y for v in p) / len(p), 0))
yf = (feet['fl'].y + feet['fr'].y) / 2; yb = (feet['bl'].y + feet['br'].y) / 2

def top_at(y, half=0.04):
    """highest point of the trunk near this Y (ignores anything above the head line in front of the chest)"""
    zs = [v.z for v in V if abs(v.y - y) < half * L]
    return max(zs) if zs else H * 0.6
def mid_slice(y, half=0.03):
    p = [v for v in V if abs(v.y - y) < half * L]
    if not p: return None
    return Vector((0, y, (min(v.z for v in p) + max(v.z for v in p)) / 2)), max(v.z for v in p) - min(v.z for v in p)

back_f, back_b = top_at(yf), top_at(yb)
hips = Vector((0, yb, back_b * 0.70)); chest = Vector((0, yf, back_f * 0.68))
# head: the front-most part; snout = the front-most point, head base a little behind/above it
front = [v for v in V if v.y < ymin + 0.08 * L]
snout = Vector((0, ymin, sum(v.z for v in front) / len(front)))
head_len = min(0.22 * L, (yf - ymin) * 0.6)
head_base = Vector((0, ymin + head_len, max(snout.z, chest.z + (back_f - chest.z) * 0.6)))
neck_base = chest.lerp(head_base, 0.15)
# tail: from the hips to the back-most point through slice middles
tail_pts = [hips.copy()]
for k in range(1, 5):
    y = yb + (ymax - yb) * k / 4 - (0.01 * L if k == 4 else 0)
    m = mid_slice(y, 0.02)
    tail_pts.append(m[0] if m else Vector((0, y, hips.z)))

arm = bpy.data.armatures.new('Armature'); A = bpy.data.objects.new('Armature', arm)
bpy.context.scene.collection.objects.link(A)
bpy.context.view_layer.objects.active = A
for o in bpy.context.selected_objects: o.select_set(False)
A.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(name, head, tail, parent=None, connect=False):
    b = eb.new(name); b.head = head; b.tail = tail if (tail - head).length > 1e-4 else head + Vector((0, 0, 0.01))
    if parent: b.parent = eb[parent]; b.use_connect = connect
    b.roll = 0
    return b
bone('root', Vector((0, (yf + yb) / 2, 0)), Vector((0, (yf + yb) / 2 - 0.1 * L, 0)))
bone('hips', hips, hips.lerp(chest, 0.25), 'root')
sp = [hips.lerp(chest, t) for t in (0.25, 0.55, 0.85, 1.0)]
bone('spine_1', sp[0], sp[1], 'hips', True); bone('spine_2', sp[1], sp[2], 'spine_1', True); bone('spine_3', sp[2], chest, 'spine_2', True)
bone('neck', chest, head_base, 'spine_3', True)
bone('head', head_base, snout, 'neck', True)
for i in range(4):
    bone(f'tail_{i + 1}', tail_pts[i], tail_pts[i + 1], 'hips' if i == 0 else f'tail_{i}', i > 0)
for key, f in feet.items():
    front_leg = key[0] == 'f'
    top = Vector((f.x * 0.8, f.y, (chest if front_leg else hips).z))
    knee = top.lerp(f, 0.5) + Vector((0, (0.015 if front_leg else -0.01) * L, 0))     # a slight elbow back / stifle forward
    ankle = Vector((f.x, f.y + (0.0 if front_leg else 0.01 * L), H * 0.07))
    parent = 'spine_3' if front_leg else 'hips'
    bone(f'leg_{key}_1', top, knee, parent)
    bone(f'leg_{key}_2', knee, ankle, f'leg_{key}_1', True)
    bone(f'leg_{key}_3', ankle, Vector((f.x, f.y - 0.05 * L, 0.0)), f'leg_{key}_2', True)
if wings:
    # folded wings: from the shoulders back along the upper flank to about the hips
    for s, sx in (('l', 1), ('r', -1)):
        w = [v for v in V if sx * v.x > 0 and v.z > chest.z and yf < v.y < yb]
        reach = max((sx * v.x for v in w), default=0.1 * L)
        back_m = top_at((yf + yb) / 2)          # the back's height mid-body (not the horns above the chest)
        sh = Vector((sx * reach * 0.45, yf + 0.05 * L, back_m * 0.9))
        mid = Vector((sx * reach * 0.9, (yf + yb) / 2, back_m * 0.95))
        tip = Vector((sx * reach * 0.8, yb + 0.05 * L, back_b * 0.95))
        bone(f'wing_{s}_1', sh, mid, 'spine_3'); bone(f'wing_{s}_2', mid, tip, f'wing_{s}_1', True)
bpy.ops.object.mode_set(mode='OBJECT')

# ---- skin: automatic weights (bone heat); fall back to envelopes if heat finds no solution
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); A.select_set(True); bpy.context.view_layer.objects.active = A
result = 'heat'
try:
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
except Exception as e:
    result = 'error ' + str(e)
unweighted = sum(1 for v in body.data.vertices if not v.groups)
if unweighted > len(body.data.vertices) * 0.05:
    # heat found no solution (loose pieces, holes): weight every point by its distance to the nearest bones instead
    result += f' then nearest bones ({unweighted} points had no weight)'
    for g in list(body.vertex_groups): body.vertex_groups.remove(g)
    segs = [(b.name, A.matrix_world @ b.head_local, A.matrix_world @ b.tail_local) for b in arm.bones if b.name != 'root']
    groups = {n: body.vertex_groups.new(name=n) for n, _, _ in segs}
    def dist(p, a, b):
        ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
        return (p - (a + ab * t)).length
    for v in body.data.vertices:
        ds = sorted((dist(v.co, a, b), n) for n, a, b in segs)[:3]
        ws = [(1.0 / max(d, 1e-4) ** 4, n) for d, n in ds]
        # only blend with bones nearly as close as the nearest (keeps a leg from pulling the belly)
        ws = [(w, n) for (w, n), (d, _) in zip(ws, ds) if d < ds[0][0] * 1.6 + 0.01 * L]
        tot = sum(w for w, _ in ws)
        for w, n in ws: groups[n].add([v.index], w / tot, 'REPLACE')
body.name = 'Body_all'
body.data.calc_loop_triangles()
info = {'triangles': len(body.data.loop_triangles), 'weights': result, 'height': round(H, 3), 'length': round(L, 3),
        'hips': round(hips.z, 3), 'chest': round(chest.z, 3), 'feet': {k: [round(v.x, 3), round(v.y, 3)] for k, v in feet.items()}, 'wings': wings}
for o in bpy.context.selected_objects: o.select_set(False)
A.select_set(True); body.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_animations=False, export_skins=True, export_yup=True, export_image_format='WEBP', export_image_quality=88)
if shot:   # side view with the bones drawn, to check the joints sit inside the legs
    sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x, sc.render.resolution_y = 900, 600
    sc.display.shading.show_xray = True; sc.display.shading.xray_alpha = 0.35
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(L, H) * 1.15
    cam.location = (5, (ymin + ymax) / 2, H / 2); cam.rotation_euler = (math.pi / 2, 0, math.pi / 2)
    sc.render.filepath = shot
    # Workbench does not draw armatures: mark joints with small spheres instead
    for b in arm.bones:
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012 * max(L, H), location=A.matrix_world @ b.head_local)
        bpy.context.active_object.color = (1, 0.8, 0, 1)
    sc.display.shading.color_type = 'OBJECT'
    bpy.ops.render.render(write_still=True)
print('QUADRIG ' + json.dumps(info))
