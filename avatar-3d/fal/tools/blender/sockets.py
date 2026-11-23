"""Where a held prop sits on each body, as a matrix in its bone's own frame -> data/sockets.json.

    ~/opt/blender/blender -b -P avatar-3d/fal/tools/blender/sockets.py

Same method as avatar-3d/tabard/tools/blender/tb_prop.py "sockets" (read only, not imported): bone frames on this
UAL skeleton are the same in Blender and three.js. Props are modelled long axis +Z, front -Y, origin = grip.
  palm_r     weapon in the right fist (measured from the body's own hand, not the wrist), tilted 18 degrees back
  palm_l     the bow in the left fist, the same mirrored
  forearm_l  shield on the back of the left forearm, top toward the elbow
Each socket is scaled by body height / 1.8 m, so the goblin holds a goblin-sized sword.
"""
import bpy, os, json, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, '..', '..')
res = {}
BODIES = [k for k, b in json.load(open(os.path.join(ROOT, 'data', 'gear.json')))['bodies'].items() if b.get('skeleton', 'biped') == 'biped']   # every finished two-legged body
for body in BODIES:
    if not os.path.exists(os.path.join(ROOT, 'models', 'final', body + '.glb')): continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'models', 'final', body + '.glb'))
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith('Body_')]
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    k = (max(zs) - min(zs)) / 1.8
    AW = arm.matrix_world; B = arm.data.bones
    hw = lambda n: AW @ B[n].head_local
    def M(loc, x, y, z, s):
        m = Matrix((x, y, z)).transposed().to_4x4()
        for i in range(3):
            for j in range(3): m[i][j] *= s
        m.translation = loc
        return m
    def bone_space(bone, world): return (AW @ B[bone].matrix_local).inverted() @ world
    def mlist(m): return [round(m[r][c], 5) for c in range(4) for r in range(4)]
    out = {'_scale': round(k, 4)}
    # tilt of a held weapon back up the arm. 40 degrees laid maces along the forearm; Tabard uses 18 (Test 3b)
    tl = math.radians(18)
    def part(name):
        o = next((m for m in meshes if m.name == 'Body_' + name), None)
        return [o.matrix_world @ v.co for v in o.data.vertices] if o else []
    hands, fores = part('hands'), part('forearms')
    for side, sg in (('r', 1), ('l', -1)):
        wrist = hw(f'hand_{side}')
        # the hand as modelled (owner 2026-11-23: "the weapons are in their wrist, not hand"): the bone starts at the
        # wrist, so the grip point is measured from this body's own hand: along the hand to the knuckles, in the middle
        # of the hand's thickness, a little toward the palm (the palm faces down in the rest T-pose)
        hv = [p for p in hands if (p.x - wrist.x) * (1 if wrist.x > 0 else -1) > -0.01 * k]
        hand_dir = ((sum(hv, Vector()) / len(hv)) - wrist).normalized() if hv else (hw(f'middle_01_{side}') - wrist).normalized()
        ln = max(((p - wrist).dot(hand_dir) for p in hv), default=0.15 * k)
        mid = [p for p in hv if 0.3 * ln < (p - wrist).dot(hand_dir) < 0.6 * ln] or hv
        c = sum(mid, Vector()) / len(mid)
        zlo, zhi = min(p.z for p in mid), max(p.z for p in mid)
        palm = c + Vector((0, 0, -(zhi - zlo) * 0.2))
        z = (Vector((0, -1, 0)) * math.cos(tl) + (-hand_dir) * math.sin(tl)).normalized()
        y = (Vector((0, 0, 1)) - z * z.z).normalized(); x = y.cross(z)
        out['palm_' + side] = [{'bone': f'hand_{side}', 'matrix': mlist(bone_space(f'hand_{side}', M(palm, tuple(x), tuple(y), tuple(z), k)))}]
        out['_hand_' + side] = {'length': round(ln, 4), 'grip_from_wrist': round((palm - wrist).length, 4)}
    la, ha = hw('lowerarm_l'), hw('hand_l')
    fa_dir = (ha - la).normalized()
    # shield on the back of the left forearm (up in the rest T-pose), its face (-Y in the file) pointing away from
    # the arm; sits on this body's own forearm surface
    mid = la.lerp(ha, 0.5)
    near = [p for p in fores if p.x > 0 and abs((p - mid).dot(fa_dir)) < 0.04 * k]
    top = max((p.z for p in near), default=mid.z + 0.05 * k)
    fore = Vector((mid.x, mid.y, mid.z + (top - mid.z) * 0.8))   # pressed onto the arm (a strap, not a gap)
    out['forearm_l'] = [{'bone': 'lowerarm_l', 'matrix': mlist(bone_space('lowerarm_l', M(fore, (0, 1, 0), (0, 0, -1), tuple(-fa_dir), k)))}]
    res[body] = out
json.dump(res, open(os.path.join(ROOT, 'data', 'sockets.json'), 'w'), indent=1)
print('SOCKETS', {b: v['_scale'] for b, v in res.items()})
