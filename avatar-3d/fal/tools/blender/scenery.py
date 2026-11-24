"""Scenery props: models/scenery-raw/<id>.glb (cut from a Trellis-2 sheet by split_sheet.py) -> models/final/scenery/<id>.glb

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/scenery.py -- <id> [<id> ...]

Settings per id come from data/scenery.json (h or w in metres, tris, tex, align, yaw). Steps:
  1. weld points split along texture seams (the cut-down would otherwise tear the shape), drop loose specks
  2. align (unless align:false): turn the footprint so its sides line up with X/Y (smallest bounding rectangle,
     searched within ±45° so the drawn front stays roughly toward -Y), then the extra `yaw` from the json
  3. real size: h = height, w = longest ground side; origin = middle of the footprint at the lowest point (Z = 0)
  4. low poly: a copy keeps only its outside skin (Trellis makes hollow double walls), is thickened, rebuilt as one
     closed surface (voxel remesh, `vox` = voxel size as a share of the size, default 0.006) and collapse-cut to `tris`
  5. its OWN texture: new UVs (smart project) on the low copy, the painted colour baked from the full-detail original
     (selected to active, Cycles, colour only) onto a tex x tex picture, so each file carries one small texture instead of a copy of the sheet's
  6. export GLB (WebP texture), matte material (roughness 1, metal 0)
Prints "SCENERY {...}" with triangles, size (x, y, z metres) and file kb per id.
"""
import bpy, bmesh, os, sys, json, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
SRC, OUT = os.path.join(ROOT, 'models', 'scenery-raw'), os.path.join(ROOT, 'models', 'final', 'scenery')
os.makedirs(OUT, exist_ok=True)
DATA = json.load(open(os.path.join(ROOT, 'data', 'scenery.json')))
DEF = {o['id']: o for s in DATA['sheets'] for o in s['objects']}
ids = sys.argv[sys.argv.index('--') + 1:]
report = {}

def hull2d(pts):
    pts = sorted(set(pts))
    if len(pts) < 3: return pts
    def cross(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0: lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0: up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]

for iid in ids:
    d = DEF[iid]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, d.get('src', iid) + '.glb'))
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
    me = o.data
    # 1. weld + drop specks (loose parts under 3.5% of the object's size, e.g. stray background bits)
    size0 = max(Vector([max(v.co[i] for v in me.vertices) - min(v.co[i] for v in me.vertices) for i in range(3)]))
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=size0 * 0.0008)
    seen, parts = set(), []
    for v in bm.verts:
        if v in seen: continue
        stack, part = [v], []
        seen.add(v)
        while stack:
            x = stack.pop(); part.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in seen: seen.add(y); stack.append(y)
        parts.append(part)
    total = len(bm.verts); dropped = 0
    def span(part): return max(max(v.co[i] for v in part) - min(v.co[i] for v in part) for i in range(3))
    for part in parts:
        if len(parts) > 1 and (len(part) < 12 or span(part) < size0 * 0.035):
            bmesh.ops.delete(bm, geom=part, context='VERTS'); dropped += 1
    bm.to_mesh(me); bm.free(); me.update()
    # 2. align the footprint
    yaw = 0.0
    if d.get('align', True):
        pts = hull2d([(round(v.co.x, 4), round(v.co.y, 4)) for v in me.vertices])
        best = None
        for deg in range(-45, 46):
            a = math.radians(deg); c, s = math.cos(a), math.sin(a)
            xs = [p[0] * c - p[1] * s for p in pts]; ys = [p[0] * s + p[1] * c for p in pts]
            area = (max(xs) - min(xs)) * (max(ys) - min(ys))
            if best is None or area < best[0] - 1e-9: best = (area, deg)
        yaw = best[1]
    yaw += d.get('yaw', 0)
    if yaw:
        me.transform(Matrix.Rotation(math.radians(yaw), 4, 'Z'))
    # 3. real size, origin at the middle of the footprint on the ground
    lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)]); hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    ext = hi - lo
    k = d['h'] / ext.z if 'h' in d else d['w'] / max(ext.x, ext.y)
    me.transform(Matrix.Translation(-Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))))
    me.transform(Matrix.Scale(k, 4))
    me.update()
    # 4. low poly: a copy with NO UVs is cut down (UV seams stop the collapse early and tear the shape — Oathwild
    #    pilot: crate 3,800 → only 1,071, barrel lumpy); the full-detail original stays as the bake source
    me.calc_loop_triangles(); before = len(me.loop_triangles)
    want = d.get('tris', 800)
    src = o.copy(); src.data = me.copy(); bpy.context.scene.collection.objects.link(src); src.name = 'src'
    while me.uv_layers: me.uv_layers.remove(me.uv_layers[0])
    S = max(ext) * k
    # Trellis builds many things as thin hollow shells (a barrel = an outside AND an inside wall a few mm apart); a
    # cut-down folds the two walls through each other (black flaps, holes). So: keep only faces that can be seen from
    # outside (rays in 64 directions), thicken that skin inward, rebuild it as one closed surface (voxel remesh), and
    # cut THAT down — a closed surface cuts down cleanly. The colour comes from the untouched original (step 5).
    remesh = d.get('remesh', True)   # false: thin poles and slats (a weapon rack) vanish in the remesh — keep the maker's own surface
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=S * 0.0008)
    bm.faces.ensure_lookup_table(); tree = BVHTree.FromBMesh(bm)
    dirs = []
    for i in range(64):
        zz = 1 - 2 * (i + 0.5) / 64; rr = math.sqrt(1 - zz * zz); tt = i * 2.399963
        dirs.append(Vector((rr * math.cos(tt), rr * math.sin(tt), zz)))
    hidden = []
    for fc in bm.faces:
        c = fc.calc_center_median(); nm = fc.normal; vis = False
        for dv in [nm] + dirs:
            if dv.dot(nm) < -0.2: continue
            if tree.ray_cast(c + dv * S * 0.002, dv, S * 3)[0] is None: vis = True; break
        if not vis: hidden.append(fc)
    if not remesh: hidden = []
    bmesh.ops.delete(bm, geom=hidden, context='FACES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free(); me.update()
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    VOX = d.get('vox', 0.006)
    if remesh:
      m = o.modifiers.new('s', 'SOLIDIFY'); m.thickness = S * VOX * 3.5; m.offset = -1
      bpy.ops.object.modifier_apply(modifier='s')
      m = o.modifiers.new('r', 'REMESH'); m.mode = 'VOXEL'; m.voxel_size = S * VOX
      bpy.ops.object.modifier_apply(modifier='r')
    me.calc_loop_triangles()
    if len(me.loop_triangles) > want * 1.08:
        m = o.modifiers.new('dec', 'DECIMATE'); m.ratio = want / len(me.loop_triangles); m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier='dec')
    # 5. its own texture: new UVs on the low copy, colour baked from the original (selected → active)
    new_uv = me.uv_layers.new(name='bake'); me.uv_layers.active = new_uv
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.012, area_weight=0.6, correct_aspect=True, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    T = d.get('tex', 512)
    img = bpy.data.images.new(iid, T, T, alpha=False)
    mat = bpy.data.materials.new(iid); mat.use_nodes = True
    mnt = mat.node_tree; bsdf = next(n for n in mnt.nodes if n.type == 'BSDF_PRINCIPLED')
    t2 = mnt.nodes.new('ShaderNodeTexImage'); t2.image = img
    for n in mnt.nodes: n.select = False
    t2.select = True; mnt.nodes.active = t2
    bsdf.inputs['Roughness'].default_value = 1.0; bsdf.inputs['Metallic'].default_value = 0.0
    me.materials.clear(); me.materials.append(mat)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
    bk = sc.render.bake
    bk.use_pass_direct = False; bk.use_pass_indirect = False; bk.use_pass_color = True
    bk.use_selected_to_active = True; bk.cage_extrusion = S * 0.04; bk.max_ray_distance = S * 0.12
    bk.margin = max(4, T // 128)
    src.select_set(True); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, use_selected_to_active=True, margin=max(4, T // 128))
    mnt.links.new(t2.outputs['Color'], bsdf.inputs['Base Color'])
    bpy.data.objects.remove(src, do_unlink=True)
    # colour: Trellis paints darker than the drawing (pilot: thatch 70 % as bright). Lift each channel toward the
    # drawing's mean colour (ref/sheet-<sheet>.colors.json from scenery-sheet.py), gain 0.9-1.6; points the bake
    # missed (black) take the mean colour
    import numpy as np
    sid = next(s_['id'] for s_ in DATA['sheets'] if any(x['id'] == iid for x in s_['objects']))
    cf = os.path.join(ROOT, 'ref', f'sheet-{sid}.colors.json')
    px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
    lin = px[:, :3]
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.clip(lin, 0, 1), 1 / 2.4) - 0.055) if img.colorspace_settings.name != 'sRGB' else lin
    hit = srgb.sum(axis=1) > 0.03
    gain = None
    if os.path.exists(cf) and hit.any():
        want_c = np.array(json.load(open(cf))[iid], dtype=np.float32) / 255
        have = srgb[hit].mean(axis=0)
        gain = np.clip(want_c / np.maximum(have, 1e-3), 0.9, 1.6)
        srgb = np.clip(srgb * gain, 0, 1)
        srgb[~hit] = srgb[hit].mean(axis=0)
    px[:, :3] = srgb; img.pixels[:] = px.ravel()
    img.update()
    img.pack()
    me.calc_loop_triangles()
    lo = Vector([min(v.co[i] for v in me.vertices) for i in range(3)]); hi = Vector([max(v.co[i] for v in me.vertices) for i in range(3)])
    for x in bpy.context.selected_objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    o.name = iid
    f = os.path.join(OUT, iid + '.glb')
    bpy.ops.export_scene.gltf(filepath=f, use_selection=True, export_image_format='WEBP', export_image_quality=88)
    report[iid] = {'triangles': len(me.loop_triangles), 'before': before, 'size': [round(v, 2) for v in (hi - lo)], 'yaw': yaw, 'dropped_parts': dropped, 'gain': [round(float(g), 2) for g in gain] if gain is not None else None, 'kb': round(os.path.getsize(f) / 1024)}
print('SCENERY ' + json.dumps(report))
