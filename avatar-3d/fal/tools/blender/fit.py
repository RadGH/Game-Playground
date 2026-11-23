"""Fit every armour piece over one body and skin it to that body's skeleton.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/fit.py -- <body> [item ...]

In:  models/final/<body>.glb (tools/blender/to_ual.py), models/items/<item>.glb (tools/blender/split_sheet.py),
     data/gear.json items[<item>].fit / .hides
Out: models/final/gear/<item>-<body>.glb   (the piece + the skeleton in the fitting pose as its bind pose)
     data/fits/<item>-<body>.json            (scale, offset, how much of the covered body it really covers)

How a piece is fitted (no hand placement):
 1. The body is posed like the pictures were drawn: arms 45 degrees down (A-pose), and that pose is baked.
 2. The piece is lined up with a body landmark (chest: collar at the base of the neck; legs: waistband at the top of
    the hips; feet: soles on the floor, one boot per foot; hands: along the hand, fingertips to fingertips; head:
    centred on the head) and centred on the covered body part.
 3. Scale and a small height shift are searched: the smallest size at which rays cast outward from the covered body
    part (the regions in `hides`) hit the piece at least 92 % of the time. A piece that covers its regions lets the
    page hide them, so nothing pokes through and no hole shows.
 4. Weights are copied from the nearest body surface (Blender Data Transfer), so the piece bends with the body.
 5. Exported with the posed skeleton as its rest; the page swaps those bones for the body's own bones by name.
"""
import bpy, bmesh, sys, os, json, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
BODY = argv[0]; ONLY = set(argv[1:])
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
GEAR = json.load(open(os.path.join(ROOT, 'data', 'gear.json')))
OUT = os.path.join(ROOT, 'models', 'final', 'gear'); os.makedirs(OUT, exist_ok=True)
FITS = os.path.join(ROOT, 'data', 'fits'); os.makedirs(FITS, exist_ok=True)
ARM_DEG = 45
TARGET = 0.92

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'final', BODY + '.glb'))
A = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
parts = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Body_')]
for o in [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Body_')]: bpy.data.objects.remove(o, do_unlink=True)

def select(objs, active=None):
    for o in bpy.context.selected_objects: o.select_set(False)
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]

# ---- 1. A-pose, baked into a single posed copy of the body (keeps bone weights + a group per region)
select([A]); bpy.ops.object.mode_set(mode='POSE')
for side, sg in (('_l', 1), ('_r', -1)):
    pb = A.pose.bones['upperarm' + side]
    h = pb.head.copy()
    pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(ARM_DEG) * sg, 4, 'Y') @ Matrix.Translation(-h) @ pb.matrix
    bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
copies = []
for o in parts:
    c = o.copy(); c.data = o.data.copy(); bpy.context.scene.collection.objects.link(c)
    reg = o.name.replace('Body_', '').split('.')[0]
    g = c.vertex_groups.new(name='REG_' + reg); g.add(list(range(len(c.data.vertices))), 1.0, 'REPLACE')
    select([c]); bpy.ops.object.modifier_apply(modifier=next(m.name for m in c.modifiers if m.type == 'ARMATURE'))
    mw = c.matrix_world.copy(); c.parent = None; c.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    copies.append(c)
select(copies); bpy.ops.object.join(); posed = bpy.context.view_layer.objects.active; posed.name = 'Posed'
for o in parts: o.hide_set(True); o.hide_render = True
select([A]); bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.armature_apply(); bpy.ops.object.mode_set(mode='OBJECT')
AW = A.matrix_world
J = lambda n: AW @ A.data.bones[n].head_local

pm = posed.data
reg_of = {}
for g in posed.vertex_groups:
    if g.name.startswith('REG_'): reg_of[g.index] = g.name[4:]
vreg = [next((reg_of[ge.group] for ge in v.groups if ge.group in reg_of), None) for v in pm.vertices]
vco = [posed.matrix_world @ v.co for v in pm.vertices]
vno = [(posed.matrix_world.to_3x3() @ v.normal).normalized() for v in pm.vertices]
zs = [c.z for c in vco]; FLOOR, H = min(zs), max(zs) - min(zs)

def region_verts(regs, side=0):
    out = [i for i, r in enumerate(vreg) if r in regs]
    if side: out = [i for i in out if vco[i].x * side > 0]
    return out

def box(pts):
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))

def coverage(bvh, sample, s, R, t):
    """fraction of sampled body points whose outward ray meets the piece (piece placed as R*s*v + t)"""
    Ri = R.inverted(); hit = 0
    for i in sample:
        p = Ri @ ((vco[i] - t) / s); d = (Ri @ vno[i]).normalized()
        loc, *_ = bvh.ray_cast(p + d * (0.002 / s), d, 0.22 * H / s)
        if loc is not None: hit += 1
    return hit / max(1, len(sample))

def hull_planes(pts):
    """outward planes (normal, d) of the convex hull of pts"""
    bm = bmesh.new()
    for p in pts: bm.verts.new(p)
    r = bmesh.ops.convex_hull(bm, input=bm.verts)
    for g in r.get('geom_interior', []) + r.get('geom_unused', []):
        if isinstance(g, bmesh.types.BMVert) and g.is_valid: pass
    bm.faces.ensure_lookup_table(); bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    planes = [(f.normal.copy(), f.normal.dot(f.calc_center_median())) for f in bm.faces if f.normal.length > 0.5]
    bm.free()
    return planes

import numpy as np
VCO = None
def inside_fraction(planes, sample, s, R, t, slack=0.0):
    global VCO
    if VCO is None: VCO = np.array([tuple(v) for v in vco])
    P = (VCO[sample] - np.array(tuple(t))) / (np.array(tuple(s)) if hasattr(s, '__len__') else s)
    P = P @ np.array(R)          # row vectors: (R^-1 p) for a rotation = p @ R
    N = np.array([tuple(n) for n, _ in planes]); D = np.array([d for _, d in planes])
    return float(np.mean(np.all(P @ N.T <= D + slack, axis=1)))

def yaw(deg): return Matrix.Rotation(math.radians(deg), 3, 'Z')

ANKLE = None
def zscale(anchor, s, ilo, ihi, extra):
    if anchor == 'waist': return (extra['waist'] - ANKLE) / max(1e-6, ihi.z - ilo.z)
    return s

def place_t(anchor, s, R, rc, item_vs, extra):
    rv = [R @ v for v in item_vs]; ilo, ihi = box(rv); ic = (ilo + ihi) / 2
    t = Vector((rc.x - s * ic.x, rc.y - s * ic.y, 0))
    if anchor == 'neck': t.z = J('neck_01').z + 0.02 * H - s * ihi.z
    elif anchor == 'waist': t.z = extra['waist'] - zscale(anchor, s, ilo, ihi, extra) * ihi.z
    elif anchor == 'floor': t.z = FLOOR - 0.004 * H - s * ilo.z
    elif anchor == 'head': t.z = extra['top'] + 0.012 * H - s * ihi.z
    elif anchor == 'hand': t = extra['tip'] - s * (R @ extra['item_tip'])
    return t, ilo, ihi

def search(item_vs, polys, regs, anchor, R=Matrix.Identity(3), side=0, extra=None, yaws=None):
    """smallest size (and best turn about the vertical) at which the covered body part sits inside the piece's
    outer shell; returns s, t, fraction, R"""
    idx = region_verts(regs, side)
    if not idx: return None
    if anchor == 'head':
        # leave out ears and wide hair spikes: keep the middle of the head, about as wide as the head is deep
        hl, hh = box([vco[i] for i in idx]); cx = (hl.x + hh.x) / 2; half = 0.55 * (hh.y - hl.y)
        idx = [i for i in idx if abs(vco[i].x - cx) <= half] or idx
    sample = idx[:: max(1, len(idx) // 220)]
    rlo, rhi = box([vco[i] for i in idx]); rc = (rlo + rhi) / 2
    if yaws is None: yaws = [0] if anchor == 'hand' else list(range(-50, 51, 10))
    best = None
    for yd in yaws:
        RR = (yaw(yd) @ R) if anchor != 'hand' else R
        planes = hull_planes([RR @ v for v in item_vs])
        _, ilo, ihi = place_t(anchor, 1.0, RR, rc, item_vs, extra)
        s0 = max(min((rhi.x - rlo.x) / max(1e-6, ihi.x - ilo.x), (rhi.y - rlo.y) / max(1e-6, ihi.y - ilo.y)), 0.05) * 0.6
        shifts = (0, -1, 1, -2, 2, -3, 3) if anchor == 'hand' else (0, -1, 1)
        for dzk in shifts:
            def frac(s):
                t, _, _ = place_t(anchor, s, RR, rc, item_vs, extra)
                if anchor == 'hand': t = t + extra['dir'] * (dzk * 0.012 * H)
                else: t.z += dzk * 0.01 * H
                S = Vector((s, s, zscale(anchor, s, ilo, ihi, extra)))
                return inside_fraction(planes, sample, S, Matrix.Identity(3), t), t
            # how much can this piece hold at all (sizes up to 2.6x the first guess)?
            steps = [s0 * 1.25 ** k for k in range(9)]
            fs = [frac(x) for x in steps]
            fmax = max(f for f, _ in fs)
            g0 = 0.85 if anchor == 'floor' else GEAR.get('bodyFit', {}).get(BODY, {}).get(anchor + '_goal', 0.95)
            goal = min(g0, 0.97 * fmax)
            k = next(i for i, (f, _) in enumerate(fs) if f >= goal)
            lo_s, hi_s = (steps[k - 1] if k else s0 * 0.8), steps[k]
            f, t = fs[k]
            for _ in range(7):
                mid = (lo_s + hi_s) / 2; fm, tm = frac(mid)
                if fm >= goal: hi_s, f, t = mid, fm, tm
                else: lo_s = mid
            # a piece that holds the body part better wins; then the smaller one; then less turn / shift
            key = (round(fmax, 1), -hi_s * (1 + 0.004 * abs(yd) + 0.01 * abs(dzk)))
            if best is None or key > best[0]: best = (key, (True, f, hi_s, t, RR, yd))
    ok, f, s, t, RR, yd = best[1]
    if anchor == 'waist':
        rv = [RR @ v for v in item_vs]; ilo, ihi = box(rv)
        sz = zscale(anchor, s, ilo, ihi, extra)
        t, _, _ = place_t(anchor, s * 1.03, RR, rc, item_vs, extra)
        return Vector((s * 1.03, s * 1.03, sz)), t, f, RR, yd
    return s * 1.03, t, f, RR, yd

def item_mesh(iid):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'items', iid + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    m = next(o for o in new if o.type == 'MESH')
    for o in new:
        if o is not m: bpy.data.objects.remove(o, do_unlink=True)
    select([m]); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return m

def place(o, s, t, R=Matrix.Identity(3)):
    S = Vector(tuple(s)) if hasattr(s, '__len__') else Vector((s, s, s))
    for v in o.data.vertices:
        r = R @ v.co; v.co = Vector((r.x * S.x, r.y * S.y, r.z * S.z)) + t
    o.data.update()

PREVIEW = []; HIDDEN = set()
def region_cover(o, regs):
    """how much of each region the placed piece covers (rays outward from the body)"""
    me = o.data
    bvh = BVHTree.FromPolygons([o.matrix_world @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])
    out = {}
    for r in regs:
        idx = region_verts({r}); sample = idx[:: max(1, len(idx) // 200)]
        out[r] = round(coverage(bvh, sample, 1.0, Matrix.Identity(3), Vector()), 3) if sample else 0
    return out

def skin_and_export(objs, iid, fit_report, hides=()):
    select(objs)
    if len(objs) > 1: bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = iid
    hull = hull_planes([o.matrix_world @ v.co for v in o.data.vertices])
    per = {}
    for r in hides:
        idx = region_verts({r})
        per[r] = round(inside_fraction(hull, idx[:: max(1, len(idx) // 200)], 1.0, Matrix.Identity(3), Vector()), 3) if idx else 0
    fit_report['region_inside'] = per
    fit_report['hides'] = sorted(set(fit_report.get('cover', [])) | {r for r, c in per.items() if c >= 0.8})
    HIDDEN.update(fit_report['hides'])
    pv = o.copy(); pv.data = o.data.copy(); pv.name = 'PV_' + iid; bpy.context.scene.collection.objects.link(pv); PREVIEW.append(pv)
    for g in posed.vertex_groups:
        if not g.name.startswith('REG_') and g.name not in o.vertex_groups: o.vertex_groups.new(name=g.name)
    dt = o.modifiers.new('dt', 'DATA_TRANSFER'); dt.object = posed
    dt.use_vert_data = True; dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    select([o]); bpy.ops.object.modifier_apply(modifier='dt')
    for g in list(o.vertex_groups):
        if g.name.startswith('REG_'): o.vertex_groups.remove(g)
    o.parent = A; am = o.modifiers.new('Armature', 'ARMATURE'); am.object = A
    o.data.calc_loop_triangles(); fit_report['triangles'] = len(o.data.loop_triangles)
    select([A, o], o)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, f'{iid}-{BODY}.glb'), use_selection=True, export_animations=False,
                              export_skins=True, export_image_format='WEBP', export_image_quality=85)
    json.dump(fit_report, open(os.path.join(FITS, f'{iid}-{BODY}.json'), 'w'), indent=1)
    bpy.data.objects.remove(o, do_unlink=True)
    print('FIT', iid, BODY, json.dumps(fit_report))

hips = region_verts({'hips'})
waist = max(vco[i].z for i in hips) + 0.005 * H if hips else J('pelvis').z + 0.07 * H
head_idx = region_verts({'face', 'scalp'})
head_top = max(vco[i].z for i in head_idx)
ANKLE = J('foot_l').z

for iid, g in GEAR['items'].items():
    if g.get('kind') != 'wear' or (ONLY and iid not in ONLY): continue
    f = g.get('fit', {}); anchor = f.get('anchor'); hides = set(g.get('hides', []))
    CORE = {'neck': {'torso'}, 'waist': {'hips', 'thighs'}, 'floor': {'feet'}, 'hand': {'hands'}, 'head': hides}
    present = {r for r in vreg if r}
    cover = set(f.get('core', CORE.get(anchor, hides))) & present; hides &= present
    ov = GEAR.get('bodyFit', {}).get(BODY, {})
    if anchor == 'head' and 'head_core' in ov: cover = set(ov['head_core']) & present
    o = item_mesh(iid)
    vs = [v.co.copy() for v in o.data.vertices]; polys = [tuple(p.vertices) for p in o.data.polygons]
    rep = {'item': iid, 'body': BODY, 'anchor': anchor, 'cover': sorted(cover)}
    if anchor in ('neck', 'waist', 'head'):
        s, t, cov, RR, yd = search(vs, polys, cover, anchor, extra={'waist': waist, 'top': head_top})
        place(o, s, t, RR); rep.update(scale=[round(x, 4) for x in s] if hasattr(s, '__len__') else round(s, 4), turn=yd, offset=[round(x, 4) for x in t], inside=round(cov, 3))
        skin_and_export([o], iid, rep, hides)
    elif anchor == 'floor':
        # a pair: split the two boots by X and fit each on its own foot
        select([o]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.separate(type='LOOSE'); bpy.ops.object.mode_set(mode='OBJECT')
        pieces = [x for x in bpy.data.objects if x.type == 'MESH' and (x is o or x.name.startswith(o.name + '.'))]
        sides = {1: [], -1: []}
        for x in pieces:
            c = sum((v.co for v in x.data.vertices), Vector()) / len(x.data.vertices)
            sides[1 if c.x > 0 else -1].append(x)
        done = []; covs = []; fits = []
        for sd, objs in sides.items():
            if not objs: continue
            select(objs)
            if len(objs) > 1: bpy.ops.object.join()
            b = bpy.context.view_layer.objects.active
            bvs = [v.co.copy() for v in b.data.vertices]; bpo = [tuple(p.vertices) for p in b.data.polygons]
            lo, hi = box(bvs); c = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, 0))
            bvs = [v - c for v in bvs]
            for v, nv in zip(b.data.vertices, bvs): v.co = nv
            s_, t_, cov, RR, yd = search(bvs, bpo, cover, 'floor', side=sd)
            fits.append((sd, b, bvs, s_, RR, yd, cov))
        # the pair keeps one size (the smaller), each boot re-placed on its own foot at that size
        s_pair = min(f[3] for f in fits)
        for sd, b, bvs, _, RR, yd, cov in fits:
            idx = region_verts(cover, sd); rlo, rhi = box([vco[i] for i in idx])
            t_, _, _ = place_t('floor', s_pair, RR, (rlo + rhi) / 2, bvs, {})
            place(b, s_pair, t_, RR); done.append(b); covs.append(cov)
            rep['turn_' + ('l' if sd > 0 else 'r')] = yd
        rep['scale'] = round(s_pair, 4)
        rep['inside'] = round(min(covs), 3)
        skin_and_export(done, iid, rep, hides)
    elif anchor == 'hand':
        # one right glove drawn fingers down, back of the hand to the front; the left one is its mirror image
        lo, hi = box(vs); tip_item = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
        made = []; covs = []
        for side, sd in (('r', -1), ('l', 1)):
            d = (J(f'middle_01_{side}') - J(f'hand_{side}')).normalized()
            back = (Vector((0, 0, 1)) - d * d.z).normalized()
            hidx = region_verts({'hands'}, sd)
            tip = max((vco[i] for i in hidx), key=lambda p: p.dot(d))
            tip = Vector((tip.dot(d) * d)) + (sum((vco[i] for i in hidx), Vector()) / len(hidx) - (sum((vco[i] for i in hidx), Vector()) / len(hidx)).dot(d) * d)
            # item frame: -Z = fingers, -Y = back of the hand  ->  body frame: d, back
            x_b = d.cross(back) * -1
            R = Matrix((x_b, -back, -d)).transposed()   # columns: where item X, Y, Z go
            if sd > 0:   # left: mirror the glove across its own X
                R = R @ Matrix.Diagonal((-1, 1, 1))
            g2 = o.copy(); g2.data = o.data.copy(); bpy.context.scene.collection.objects.link(g2)
            s, t, cov, R, _ = search(vs, polys, cover, 'hand', R=R, side=sd, extra={'tip': tip, 'item_tip': tip_item, 'dir': d})
            place(g2, s, t, R)
            if sd > 0:
                select([g2]); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.mesh.flip_normals(); bpy.ops.object.mode_set(mode='OBJECT')
            made.append(g2); covs.append(cov); rep['scale_' + side] = round(s, 4)
        bpy.data.objects.remove(o, do_unlink=True)
        rep['inside'] = round(min(covs), 3)
        skin_and_export(made, iid, rep, hides)
    else:
        print('FIT skip', iid, 'no anchor'); bpy.data.objects.remove(o, do_unlink=True)

# ---- a picture of the posed body wearing everything fitted this run (front and three-quarter)
if PREVIEW:
    sc = bpy.context.scene
    try: sc.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError: sc.render.engine = 'BLENDER_EEVEE'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    bgn = next(n for n in w.node_tree.nodes if n.type == 'BACKGROUND'); bgn.inputs[0].default_value = (.7, .7, .7, 1)
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 2; sun.rotation_euler = (0.8, 0, 0.5); sc.collection.objects.link(sun)
    A.hide_render = True
    bm = bmesh.new(); bm.from_mesh(posed.data)
    gone = [bm.verts[i] for i in range(len(bm.verts)) if vreg[i] in HIDDEN] if False else None
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in range(len(bm.verts)) if vreg[i] in HIDDEN], context='VERTS')
    bm.to_mesh(posed.data); bm.free()
    for o in [posed] + PREVIEW:
        c = o.copy(); c.data = o.data; sc.collection.objects.link(c); c.location.x += H * 0.75
        c.rotation_mode = 'XYZ'; c.rotation_euler.z = math.radians(-50)
        # turn the copy about the body's own middle
        c.matrix_world = Matrix.Translation((H * 0.75, 0, 0)) @ Matrix.Rotation(math.radians(-50), 4, 'Z') @ o.matrix_world
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = H * 1.6
    cam.location = (H * 0.375, -10, FLOOR + H / 2); cam.rotation_euler = (math.radians(90), 0, 0)
    sc.render.resolution_x, sc.render.resolution_y = 1000, 700
    sc.render.filepath = os.path.join(ROOT, 'shots', f'fit-{BODY}-{"-".join(sorted(ONLY))[:40] or "all"}.png')
    bpy.ops.render.render(write_still=True)
