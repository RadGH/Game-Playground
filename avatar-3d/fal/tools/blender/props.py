"""Weapons and shield: models/items/<id>.glb -> models/final/props/<id>.glb, ready to hold.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/props.py [-- <id> ...]   (no ids = all)

Model space (as Tabard): long axis +Z, front -Y, origin = the attach point (a weapon: the middle of its grip; the
shield: the middle of its back, where the forearm goes). Sizes are for the 1.8 m man; data/sockets.json scales them
per body. The grip is found as a fraction of the height from the bottom end (GRIP below, or `length` + `grip_at`
in a data/gear.json item; grip_at null = a shield).
Grip (owner 2026-11-23, Test 3b): held at grip_at (checked by eye with look.py --mark; Tabard found mace and axe
grips sitting high). The thin run of slices around the grip (±8 cm on one-handers) is squeezed to a 4 cm handle so a
fist fits round it. A shield whose face was built pointing +Y
(into the arm) is turned round. The report lists both (_handles, _turned).
Low poly (owner 2026-11-23): every prop is collapse-decimated to about `tris` triangles (gear.json, default 500;
UVs and the painted texture survive), and only the colour texture is kept (the page paints with it alone).
"""
import bpy, os, sys, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
SRC, OUT = os.path.join(ROOT, 'models', 'items'), os.path.join(ROOT, 'models', 'final', 'props')
os.makedirs(OUT, exist_ok=True)
#        id       length m  grip (fraction of height from the bottom)
GRIP = {'sword': (0.95, 0.10), 'dagger': (0.42, 0.14), 'axe': (0.75, 0.22), 'mace': (0.72, 0.20),
        'staff': (1.75, 0.45), 'bow': (1.30, 0.50), 'shield': (0.80, None),
        # goblin enemy weapons (sizes for the 1.8 m man too; the goblin's socket scales them down)
        'gob-cleaver': (0.85, 0.16), 'gob-shiv': (0.50, 0.14), 'gob-totem': (1.80, 0.42), 'gob-buckler': (0.75, None)}
GEAR = json.load(open(os.path.join(ROOT, 'data', 'gear.json')))['items']
TRIS = {}
for iid, g in GEAR.items():
    if g.get('kind') == 'held' and 'length' in g: GRIP[iid] = (g['length'], g.get('grip_at'))
    if g.get('kind') == 'held': TRIS[iid] = g.get('tris', 500)
ONLY = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
report = {}
for iid, (length, grip) in GRIP.items():
    if ONLY and iid not in ONLY: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, iid + '.glb'))
    o = next(x for x in bpy.data.objects if x.type == 'MESH')
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vs = [v.co for v in o.data.vertices]
    lo = Vector([min(v[i] for v in vs) for i in range(3)]); hi = Vector([max(v[i] for v in vs) for i in range(3)])
    s = length / (hi.z - lo.z)
    for v in o.data.vertices: v.co = (v.co - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))) * s   # bottom at 0, real size
    vs = [v.co for v in o.data.vertices]
    if grip is None:
        # shield: its face (boss, spike, emblem) must point -Y, away from the arm. Trellis sometimes builds it the
        # other way round (the goblin buckler's spike pointed +Y, into the arm): turn it when the far side bulges more
        ys = sorted(v.y for v in vs); med = ys[len(ys) // 2]
        if ys[-1] - med > 1.3 * (med - ys[0]):
            for v in o.data.vertices: v.co.x, v.co.y = -v.co.x, -v.co.y
            report.setdefault('_turned', []).append(iid)
        vs = [v.co for v in o.data.vertices]
        # the arm goes against the middle of the back, not behind the rim (a curved shield's rim reaches further
        # back than its middle: measuring from the rim left the shield floating off the forearm)
        xs_ = [v.x for v in vs]; w_ = max(xs_) - min(xs_); xm = (max(xs_) + min(xs_)) / 2
        core = [v for v in vs if abs(v.x - xm) < 0.15 * w_ and abs(v.z - length / 2) < 0.15 * length] or vs
        y1 = max(v.y for v in core)
        pivot = Vector((xm, y1, length / 2))   # middle of the back face
        for v in o.data.vertices: v.co -= pivot
    else:
        # cross-section profile in 1 cm slices: (centre x, centre y, radius), measured on points spread over the
        # SURFACE (a long smooth handle has corners only at its two ends)
        import random
        random.seed(1)
        o.data.calc_loop_triangles()
        tris_ = [[o.data.vertices[i].co.copy() for i in t.vertices] for t in o.data.loop_triangles]
        area = [((b - a).cross(c - a)).length / 2 for a, b, c in tris_]
        tot = sum(area) or 1
        pts = []
        for (a, b, c), ar in zip(tris_, area):
            n = int(40000 * ar / tot) + (1 if random.random() < (40000 * ar / tot) % 1 else 0)
            for _ in range(n):
                u, w = random.random(), random.random()
                if u + w > 1: u, w = 1 - u, 1 - w
                pts.append(a + (b - a) * u + (c - a) * w)
        bins = {}
        for v in pts: bins.setdefault(int(v.z / 0.01), []).append(v)
        prof = {}
        for k, b in bins.items():
            cx = sum(v.x for v in b) / len(b); cy = sum(v.y for v in b) / len(b)
            rs = sorted(((v.x - cx) ** 2 + (v.y - cy) ** 2) ** 0.5 for v in b)
            prof[k] = (cx, cy, rs[int(len(rs) * 0.9)])
        top = max(prof)
        kg = min(prof, key=lambda k: abs(k - grip * top))
        zg = (kg + 0.5) * 0.01
        cx, cy, rg = prof[kg]
        pivot = Vector((cx, cy, zg))
        # hand-sized handle (owner 2026-11-23: "the staff is so thick they need to grab it differently"): squeeze the
        # thin run of slices around the grip to a 4 cm thick handle (for the 1.8 m man; sockets scale it per body).
        # Only the cross-section changes, never the length; heads, guards and blades (wide slices) are left alone.
        GOAL = 0.020
        k_ = max(0.35, min(1.25, GOAL / max(rg, 1e-4))) if GEAR.get(iid, {}).get('squeeze', True) else 1.0
        one = grip <= 0.25            # one-handed: squeeze only where the fist goes (±8 cm), never the blade
        thin = lambda k: k in prof and prof[k][2] <= max(rg * 1.35, 0.014) and (not one or abs(k - kg) <= 8)
        lo_k = kg
        while thin(lo_k - 1): lo_k -= 1
        hi_k = kg
        while thin(hi_k + 1): hi_k += 1
        for v in o.data.vertices:
            k = int(v.co.z / 0.01)
            if lo_k - 2 <= k <= hi_k + 2:
                edge = min(k - (lo_k - 2), (hi_k + 2) - k) / 2.0     # fade over 2 cm at both ends of the run
                f = 1 + (k_ - 1) * max(0.0, min(1.0, edge))
                v.co.x = cx + (v.co.x - cx) * f; v.co.y = cy + (v.co.y - cy) * f
        report.setdefault('_handles', {})[iid] = {'grip_cm': round(zg * 100), 'was_mm': round(rg * 2000), 'squeeze': round(k_, 2), 'run_cm': hi_k - lo_k + 1}
        for v in o.data.vertices: v.co -= pivot
    s = 1.0
    o.data.update(); o.data.calc_loop_triangles()
    before = len(o.data.loop_triangles)
    # weld points split along texture seams first: otherwise the cut-down tears the shape into spikes (Test 3)
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0005 / s); bpy.ops.object.mode_set(mode='OBJECT')
    want = TRIS.get(iid, 500)
    if want and before > want * 1.1:
        d = o.modifiers.new('dec', 'DECIMATE'); d.ratio = want / before
        bpy.ops.object.modifier_apply(modifier='dec')
    for m in o.data.materials:   # colour texture only
        if not m or not m.use_nodes: continue
        nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf: continue
        for name in ('Normal', 'Metallic', 'Roughness'):
            for l in list(bsdf.inputs[name].links): nt.links.remove(l)
        for _ in range(2):
            for n in list(nt.nodes):
                if n.type in ('TEX_IMAGE', 'NORMAL_MAP', 'SEPARATE_COLOR') and not any(x.links for x in n.outputs): nt.nodes.remove(n)
    o.data.calc_loop_triangles()
    report[iid] = {'triangles': len(o.data.loop_triangles), 'before': before, 'length': length}
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, iid + '.glb'), use_selection=True, export_image_format='WEBP', export_image_quality=85)
print('PROPS ' + json.dumps(report))
