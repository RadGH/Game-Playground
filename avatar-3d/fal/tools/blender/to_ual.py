"""Move a Meshy-rigged body (fal-ai/meshy/rigging, skeleton_template ue5_mannequin) onto the free Universal Animation
Library skeleton, so every UAL clip plays on it unchanged.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/to_ual.py -- <rigged.glb> <UAL1_Standard.glb> <out.glb> [--tris N] [--head-lift DEG] [--meshy-default]

Steps
 1. Pose the Meshy skeleton into the UAL rest pose (T-pose): each arm / leg bone is turned so the line to its child
    joint points the same way as in UAL. Bake that pose into the mesh and make it the new rest.
 2. Copy the UAL skeleton and SLIDE every bone onto the matching Meshy joint without turning it. Every bone keeps
    UAL's own rest rotation, so the clips' rotations mean the same thing on this body. (Fingers, leaf bones and
    the root follow their nearest matched parent.)
 3. Rename / merge the Meshy weight groups onto UAL names (head -> Head, end bones -> their parent).
 4. --tris N (default 3000, 0 = keep all): collapse-decimate to about N triangles (weights and UVs survive). New
    bodies are already cut down before rigging (tools/blender/lowpoly.py); this catches anything left over.
 3b. Fingers: the library's finger bones are fitted to this hand (scaled to its length) and the finger part of the
    skin is weighted to them (nearest finger bone), so hands can close round a grip.
 5. Head lift (--head-lift DEG, default 15): the library's clips carry the head 13-26 degrees nose-down compared with
    the mannequin's T-pose (idle 14, walk 13, weapon ready 26, run 21). On the plain mannequin nobody notices; on a
    big-headed goblin it reads as "staring at the floor". The Head bone's rest is turned nose-down by DEG, so every
    clip lifts the face by that much. The mesh is untouched; only Head's rest frame differs from UAL's (owner
    2026-11-23: "heads tilt forward/down while animating"). Blender's own playback ignores this (its actions are
    relative to the rest), three.js (js/fal.js) applies it.
Prints one JSON line "TOUAL {...}" with the triangle count and the pelvis rest height (the page re-bases the
clips' pelvis height with it).
"""
import bpy, sys, json, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
src, ual, out = argv[0], argv[1], argv[2]
tris_target = int(argv[argv.index('--tris') + 1]) if '--tris' in argv else 3000
head_lift = float(argv[argv.index('--head-lift') + 1]) if '--head-lift' in argv else 15.0

bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

M_objs = imp(src)
M = next(o for o in M_objs if o.type == 'ARMATURE')
body = max((o for o in M_objs if o.type == 'MESH' and o.vertex_groups), key=lambda o: len(o.data.polygons))
U_objs = imp(ual)
U = next(o for o in U_objs if o.type == 'ARMATURE')
U.data.pose_position = 'REST'
bpy.context.view_layer.update()

NAME = {'Head': 'head'}  # UAL name -> Meshy name where they differ
if '--meshy-default' in argv:
    # Meshy's own default skeleton (used when it refuses ue5_mannequin, as for the long-coated bounty hunter):
    # Mixamo-style names, spine counted downward, no hand-end bones
    NAME = {'pelvis': 'Hips', 'spine_01': 'Spine02', 'spine_02': 'Spine01', 'spine_03': 'Spine', 'neck_01': 'neck', 'Head': 'Head'}
    for s_, S_ in (('l', 'Left'), ('r', 'Right')):
        NAME.update({f'thigh_{s_}': f'{S_}UpLeg', f'calf_{s_}': f'{S_}Leg', f'foot_{s_}': f'{S_}Foot', f'ball_{s_}': f'{S_}ToeBase',
                     f'clavicle_{s_}': f'{S_}Shoulder', f'upperarm_{s_}': f'{S_}Arm', f'lowerarm_{s_}': f'{S_}ForeArm', f'hand_{s_}': f'{S_}Hand'})
def mname(n): return NAME.get(n, n)

def U_head(n):  # UAL rest joint, in M's armature space
    return M.matrix_world.inverted() @ U.matrix_world @ U.data.bones[n].head_local

# ---- 1. pose Meshy into the UAL T-pose
CHAINS = []
for s in ('l', 'r'):
    CHAINS += [(f'clavicle_{s}', f'upperarm_{s}'), (f'upperarm_{s}', f'lowerarm_{s}'), (f'lowerarm_{s}', f'hand_{s}'),
               (f'thigh_{s}', f'calf_{s}'), (f'calf_{s}', f'foot_{s}'), (f'foot_{s}', f'ball_{s}')]
bpy.context.view_layer.objects.active = M
bpy.ops.object.mode_set(mode='POSE')
for a, b in CHAINS:
    pa, pb = M.pose.bones.get(mname(a)), M.pose.bones.get(mname(b))
    if not pa or not pb: continue
    cur = pb.head - pa.head
    want = U_head(b) - U_head(a)
    q = cur.rotation_difference(want)
    h = pa.head.copy()
    pa.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ pa.matrix
    bpy.context.view_layer.update()
# hands: point hand -> hand end the way UAL's hand -> middle finger points
for s, end in (('l', 'LeftHand_End'), ('r', 'RightHand_End')):
    ph, pe = M.pose.bones.get(f'hand_{s}'), M.pose.bones.get(end)
    if ph and pe:
        q = (pe.head - ph.head).rotation_difference(U_head(f'middle_01_{s}') - U_head(f'hand_{s}'))
        h = ph.head.copy(); ph.matrix = Matrix.Translation(h) @ q.to_matrix().to_4x4() @ Matrix.Translation(-h) @ ph.matrix
        bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='OBJECT')
# bake the pose into the mesh
bpy.context.view_layer.objects.active = body
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True)
mod = next(m for m in body.modifiers if m.type == 'ARMATURE')
bpy.ops.object.modifier_apply(modifier=mod.name)
mw = body.matrix_world.copy(); body.parent = None; body.matrix_world = mw
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
M_joint = {pb.name: M.matrix_world @ pb.head for pb in M.pose.bones}   # posed joints, world

# ---- 2. copy the UAL skeleton and slide each bone onto the matching joint
A = U.copy(); A.data = U.data.copy(); A.name = 'Armature'; A.data.name = 'Armature'
bpy.context.scene.collection.objects.link(A)
A.animation_data_clear()
A.data.pose_position = 'POSE'
bpy.context.view_layer.objects.active = A
for o in bpy.context.selected_objects: o.select_set(False)
A.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = A.data.edit_bones
inv = A.matrix_world.inverted()
delta = {}
order = [b.name for b in A.data.bones]  # parents before children
for b in eb: b.use_connect = False
for n in order:
    e = eb[n]
    mn = mname(n)
    if n != 'root' and mn in M_joint:
        d = inv @ M_joint[mn] - e.head
    else:
        d = delta.get(e.parent.name, Vector()) if e.parent else Vector()
    delta[n] = d
for n in order:
    e = eb[n]; e.head += delta[n]; e.tail += delta[n]
if head_lift and 'Head' in eb:   # see 5. above: nose-down rest = clips lift the face
    e = eb['Head']; h = e.head.copy()
    e.matrix = Matrix.Translation(h) @ Matrix.Rotation(math.radians(head_lift), 4, 'X') @ Matrix.Translation(-h) @ e.matrix
bpy.ops.object.mode_set(mode='OBJECT')

# ---- 3. weights onto UAL names
MERGE = {'head': 'Head', 'head_end': 'Head', 'headfront': 'Head', 'LeftHand_End': 'hand_l', 'RightHand_End': 'hand_r',
         'LeftToe_end': 'ball_l', 'RightToe_end': 'ball_r'}
if '--meshy-default' in argv:
    MERGE.update({m: u for u, m in NAME.items() if m != u})
vg = body.vertex_groups
for old, new in MERGE.items():
    g = vg.get(old)
    if not g: continue
    t = vg.get(new) or vg.new(name=new)
    for v in body.data.vertices:
        for ge in v.groups:
            if ge.group == g.index:
                try: w0 = t.weight(v.index)
                except RuntimeError: w0 = 0.0
                t.add([v.index], w0 + ge.weight, 'REPLACE')
    vg.remove(g)

# ---- 3b. fingers (owner 2026-11-23: "none of them are grasping the weapon"). Meshy rigged without finger bones, so
# the whole hand followed hand_l/r and could not close. Fit the library's finger bones to THIS hand (scaled about the
# wrist to the hand's measured length, never turned, so the clips' finger rotations still mean the same thing) and
# hand each finger part of the skin to its nearest finger bone (a mitten split is fine). The clips then curl the
# fingers, and js/fal.js closes them round a held handle.
FINGERS = ('thumb', 'index', 'middle', 'ring', 'pinky')
fingers_info = {}
for o in bpy.context.selected_objects: o.select_set(False)
bpy.context.view_layer.objects.active = A; A.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = A.data.edit_bones; Aw = A.matrix_world.copy()
hand_frame = {}
for s_ in 'lr':
    hand = eb.get(f'hand_{s_}'); hg = body.vertex_groups.get(f'hand_{s_}')
    if not hand or not hg or not eb.get(f'middle_01_{s_}'): continue
    wrist = Aw @ hand.head
    d = ((Aw @ eb[f'middle_01_{s_}'].head) - wrist).normalized()
    hv = [v.co for v in body.data.vertices if any(g.group == hg.index and g.weight > 0.5 for g in v.groups)]
    if len(hv) < 10: continue
    Lh = max((p - wrist).dot(d) for p in hv)
    tip = eb.get(f'middle_04_leaf_{s_}')
    Lu = ((Aw @ (tip.head if tip else eb[f'middle_03_{s_}'].tail)) - wrist).dot(d)
    f = Lh * 0.95 / Lu
    for b in hand.children_recursive:
        b.head = hand.head + (b.head - hand.head) * f; b.tail = hand.head + (b.tail - hand.head) * f
    hand_frame[s_] = (wrist, d, Lh)
    fingers_info[s_] = {'hand_length': round(Lh, 4), 'scale': round(f, 3)}
segs = {s_: [(b.name, Aw @ b.head, Aw @ b.tail) for b in eb[f'hand_{s_}'].children_recursive if not b.name.split('_')[1].startswith('04')]
        for s_ in hand_frame}
for s_ in hand_frame:   # the palm itself: wrist to the middle knuckle
    segs[s_].append((f'hand_{s_}', Aw @ eb[f'hand_{s_}'].head, Aw @ eb[f'middle_01_{s_}'].head))
bpy.ops.object.mode_set(mode='OBJECT')
def seg_dist(p, a, b):
    ab = b - a; t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length
for s_, sg in segs.items():
    hg = body.vertex_groups[f'hand_{s_}']
    groups = {n: (body.vertex_groups.get(n) or body.vertex_groups.new(name=n)) for n, _, _ in sg}
    moved = 0
    for v in body.data.vertices:
        w = next((g.weight for g in v.groups if g.group == hg.index), 0.0)
        if w <= 0: continue
        ds = sorted((seg_dist(v.co, a, b), n) for n, a, b in sg)[:2]
        if ds[0][1] == f'hand_{s_}' and ds[1][0] > ds[0][0] * 1.3: continue
        ws = [(1 / max(dd, 1e-5) ** 4, n) for dd, n in ds]; tot = sum(x for x, _ in ws)
        hand_share = sum(x for x, n in ws if n == f'hand_{s_}') / tot
        hg.add([v.index], w * hand_share, 'REPLACE')
        for x, n in ws:
            if n != f'hand_{s_}': groups[n].add([v.index], w * x / tot, 'ADD')
        moved += 1
    fingers_info[s_]['finger_points'] = moved

# ---- 4. optional decimate
if tris_target:
    body.data.calc_loop_triangles()
    now = len(body.data.loop_triangles)
    if now > tris_target:
        # weld points split along texture seams first, or the cut-down tears the shape into spikes
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT'); bpy.ops.mesh.remove_doubles(threshold=0.0002); bpy.ops.object.mode_set(mode='OBJECT')
        body.data.calc_loop_triangles(); now = len(body.data.loop_triangles)
        d = body.modifiers.new('dec', 'DECIMATE'); d.ratio = tris_target / now
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier='dec')

body.name = 'Body'
body.data.calc_loop_triangles()
n_tris = len(body.data.loop_triangles)

# ---- 5. split into body regions by each face's strongest bone, so the page can hide what armour covers
REGION = {'Head': 'head', 'neck_01': 'head', 'spine_01': 'torso', 'spine_02': 'torso', 'spine_03': 'torso',
          'clavicle_l': 'torso', 'clavicle_r': 'torso', 'upperarm_l': 'upperarms', 'upperarm_r': 'upperarms',
          'lowerarm_l': 'forearms', 'lowerarm_r': 'forearms', 'hand_l': 'hands', 'hand_r': 'hands',
          'pelvis': 'hips', 'thigh_l': 'thighs', 'thigh_r': 'thighs', 'calf_l': 'shins', 'calf_r': 'shins',
          'foot_l': 'feet', 'foot_r': 'feet', 'ball_l': 'feet', 'ball_r': 'feet'}
gname = {g.index: g.name for g in body.vertex_groups}
regions = sorted((set(REGION.values()) - {'head'}) | {'face', 'scalp'})
# head -> face + scalp: the scalp (hair, top and back of the head) is what a hat or cap covers; the face stays
head_v = [v.co for v in body.data.vertices if v.groups and max(v.groups, key=lambda g: g.weight).group in
          {g.index for g in body.vertex_groups if g.name in ('Head', 'neck_01')}]
hz0, hz1 = min(v.z for v in head_v), max(v.z for v in head_v)
hy0, hy1 = min(v.y for v in head_v), max(v.y for v in head_v)
def head_part(c):
    t = (c.z - hz0) / (hz1 - hz0); back = (c.y - hy0) / (hy1 - hy0)   # front is -Y
    return 'scalp' if t > 0.62 or (back > 0.55 and t > 0.3) else 'face'
base_mat = body.data.materials[0]
for r in regions:
    m = base_mat.copy(); m.name = 'REGION_' + r; body.data.materials.append(m)
import collections
for p in body.data.polygons:
    acc = collections.Counter()
    for vi in p.vertices:
        for ge in body.data.vertices[vi].groups:
            gn = gname.get(ge.group) or ''
            acc[REGION.get(gn, 'hands' if gn.split('_')[0] in FINGERS else 'torso')] += ge.weight
    r = acc.most_common(1)[0][0] if acc else 'torso'
    if r == 'head': r = head_part(p.center)
    p.material_index = 1 + regions.index(r)
for o in list(bpy.data.objects):  # drop the UAL mannequin and every other leftover before separating
    if o is not A and o is not body: bpy.data.objects.remove(o, do_unlink=True)
bpy.context.view_layer.objects.active = body
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True)
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='MATERIAL'); bpy.ops.object.mode_set(mode='OBJECT')
parts = []
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    if not o.data.polygons: bpy.data.objects.remove(o, do_unlink=True); continue
    used = o.data.materials[o.data.polygons[0].material_index]
    o.name = 'Body_' + used.name.replace('REGION_', '')
    o.data.materials.clear(); o.data.materials.append(base_mat)
    o.parent = A
    am = o.modifiers.new('Armature', 'ARMATURE'); am.object = A
    parts.append(o)
for m in list(bpy.data.materials):
    if m.name.startswith('REGION_'): bpy.data.materials.remove(m)
body = parts[0]

# clean up everything else
for o in list(bpy.data.objects):
    if o is not A and o not in parts: bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

pelvis = A.data.bones['pelvis'].head_local
zs = [(o.matrix_world @ v.co).z for o in parts for v in o.data.vertices]
info = {'triangles': n_tris, 'head_lift': head_lift, 'fingers': fingers_info, 'regions': sorted(o.name for o in parts), 'pelvis': round(pelvis.z, 4), 'height': round(max(zs) - min(zs), 3), 'feet': round(min(zs), 4)}
# the page paints with the colour texture only (js/fal.js paintedMaterial): drop normal / metal / roughness maps,
# which were ~85% of a Tripo body's file
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    for name in ('Normal', 'Metallic', 'Roughness'):
        for l in list(bsdf.inputs[name].links): nt.links.remove(l)
    for n in list(nt.nodes):
        if n.type in ('TEX_IMAGE', 'NORMAL_MAP', 'SEPARATE_COLOR', 'SEPRGB') and not any(o.links for o in n.outputs): nt.nodes.remove(n)
    for n in list(nt.nodes):   # a second pass catches textures that only fed a removed normal-map node
        if n.type == 'TEX_IMAGE' and not any(o.links for o in n.outputs): nt.nodes.remove(n)
for o in bpy.context.selected_objects: o.select_set(False)
A.select_set(True)
for o in parts: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_animations=False, export_skins=True, export_yup=True, export_image_format='WEBP', export_image_quality=88)
print('TOUAL ' + json.dumps(info))
