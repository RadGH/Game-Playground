#!/usr/bin/env python3
"""Measure a rigged character GLB into numbers a hand-coded body can be fitted to.

    python3 -I avatar-3d/kestrel/tools/measure-glb.py <character.glb> <out.json> [--height 1.78]

Everything is in the bind pose, scaled so the model is --height metres tall with the feet at y = 0, +z forward.
* joints: every bone's position.
* torso: for 48 heights from the crotch to the crown, the width (x), front (+z) and back (-z) of the trunk + head
  only (vertices not weighted mostly to an arm or leg bone), so arms do not widen the chest.
* limbs: for each long bone, 12 slices along it with the radius to the side, front, back, inside and outside.
Pure standard library. Reads the file as data only.
"""
import json, math, struct, sys

def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n]); off = 20 + n
    ln = struct.unpack('<I', b[off:off + 4])[0]
    return j, b[off + 8: off + 8 + ln]

FMT = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
SIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def accessor(j, bin_, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]
    f, s = FMT[a['componentType']]; k = SIZE[a['type']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', s * k)
    out = []
    for e in range(a['count']):
        vals = struct.unpack_from('<' + f * k, bin_, o + e * stride)
        if a.get('normalized') and f in 'BH': vals = tuple(x / (255 if f == 'B' else 65535) for x in vals)
        out.append(vals)
    return out

def inv_translation(m):   # column-major 4x4 rigid-ish matrix → translation of its inverse
    r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]
    t = [m[12], m[13], m[14]]
    # inverse of [R|t] where R may have scale: solve R p = -t
    det = (r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1]) - r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0]) + r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]))
    inv = [[(r[1][1]*r[2][2]-r[1][2]*r[2][1])/det, (r[0][2]*r[2][1]-r[0][1]*r[2][2])/det, (r[0][1]*r[1][2]-r[0][2]*r[1][1])/det],
           [(r[1][2]*r[2][0]-r[1][0]*r[2][2])/det, (r[0][0]*r[2][2]-r[0][2]*r[2][0])/det, (r[0][2]*r[1][0]-r[0][0]*r[1][2])/det],
           [(r[1][0]*r[2][1]-r[1][1]*r[2][0])/det, (r[0][1]*r[2][0]-r[0][0]*r[2][1])/det, (r[0][0]*r[1][1]-r[0][1]*r[1][0])/det]]
    return [-(inv[i][0]*t[0] + inv[i][1]*t[1] + inv[i][2]*t[2]) for i in range(3)]

def main():
    src, out = sys.argv[1], sys.argv[2]
    H = float(sys.argv[sys.argv.index('--height') + 1]) if '--height' in sys.argv else 1.78
    j, bin_ = read_glb(src)
    prim = j['meshes'][0]['primitives'][0]; skin = j['skins'][0]
    P = accessor(j, bin_, prim['attributes']['POSITION'])
    J = accessor(j, bin_, prim['attributes']['JOINTS_0']); W = accessor(j, bin_, prim['attributes']['WEIGHTS_0'])
    names = [j['nodes'][k]['name'] for k in skin['joints']]
    ibm = accessor(j, bin_, skin['inverseBindMatrices'])
    jp = {names[i]: inv_translation(ibm[i]) for i in range(len(names))}
    ys = [p[1] for p in P]; y0, y1 = min(ys), max(ys); k = H / (y1 - y0)
    xs = [p[0] for p in P]; cx = (min(xs) + max(xs)) / 2
    zs = [p[2] for p in P]
    # which way is forward? the toes sit in front of the ankles
    fwd = 1 if jp['LeftToeBase'][2] > jp['LeftFoot'][2] else -1
    def T(p): return ((p[0] - cx) * k * fwd, (p[1] - y0) * k, (p[2]) * k * fwd)
    V = [T(p) for p in P]; JP = {n: T(p) for n, p in jp.items()}
    zc = (JP['Hips'][2]); V = [(x, y, z - zc) for x, y, z in V]; JP = {n: (p[0], p[1], p[2] - zc) for n, p in JP.items()}
    dom = [names[J[i][max(range(4), key=lambda q: W[i][q])]] for i in range(len(P))]
    LIMB = {s + b for s in ('Left', 'Right') for b in ('Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase')}
    crotch = min(JP['LeftUpLeg'][1], JP['RightUpLeg'][1]) - 0.04 * H
    torso = []
    for s in range(48):
        ya = crotch + (H - crotch) * s / 48; yb = crotch + (H - crotch) * (s + 1) / 48
        pts = [v for v, d in zip(V, dom) if d not in LIMB and ya <= v[1] < yb]
        if not pts: continue
        torso.append({'y': round((ya + yb) / 2, 4), 'xMin': round(min(p[0] for p in pts), 4), 'xMax': round(max(p[0] for p in pts), 4),
                      'zFront': round(max(p[2] for p in pts), 4), 'zBack': round(min(p[2] for p in pts), 4), 'n': len(pts)})
    LIMBS = {'upperArmL': ('LeftArm', 'LeftForeArm', {'LeftArm', 'LeftShoulder'}), 'forearmL': ('LeftForeArm', 'LeftHand', {'LeftForeArm'}),
             'handL': ('LeftHand', None, {'LeftHand'}),
             'thighL': ('LeftUpLeg', 'LeftLeg', {'LeftUpLeg'}), 'shinL': ('LeftLeg', 'LeftFoot', {'LeftLeg'}), 'footL': ('LeftFoot', 'LeftToeBase', {'LeftFoot', 'LeftToeBase'})}
    limbs = {}
    for key, (a, b, bones) in LIMBS.items():
        pts = [v for v, d in zip(V, dom) if d in bones]
        A = JP[a]
        if b: B = JP[b]
        else:   # hand: furthest vertex from the wrist
            far = max(pts, key=lambda p: sum((p[i] - A[i]) ** 2 for i in range(3))); B = far
        ax = [B[i] - A[i] for i in range(3)]; L = math.sqrt(sum(c * c for c in ax)); ax = [c / L for c in ax]
        side = [1, 0, 0] if abs(ax[0]) < 0.8 else [0, 1, 0]       # limb's own frame: s (side), f (front)
        d = sum(side[i] * ax[i] for i in range(3)); s_ = [side[i] - d * ax[i] for i in range(3)]; n = math.sqrt(sum(c * c for c in s_)); s_ = [c / n for c in s_]
        f_ = [ax[1] * s_[2] - ax[2] * s_[1], ax[2] * s_[0] - ax[0] * s_[2], ax[0] * s_[1] - ax[1] * s_[0]]
        if f_[2] < 0 and abs(f_[2]) > 0.3: f_ = [-c for c in f_]
        slices = []
        for q in range(12):
            ta, tb = q / 12, (q + 1) / 12
            sel = []
            for p in pts:
                r = [p[i] - A[i] for i in range(3)]; t = sum(r[i] * ax[i] for i in range(3)) / L
                if ta <= t < tb: sel.append((sum(r[i] * s_[i] for i in range(3)), sum(r[i] * f_[i] for i in range(3))))
            if not sel: continue
            slices.append({'t': round((ta + tb) / 2, 3), 'sMin': round(min(p[0] for p in sel), 4), 'sMax': round(max(p[0] for p in sel), 4),
                           'fMin': round(min(p[1] for p in sel), 4), 'fMax': round(max(p[1] for p in sel), 4), 'n': len(sel)})
        limbs[key] = {'from': a, 'to': b or 'fingertip', 'length': round(L, 4), 'axis': [round(c, 3) for c in ax], 'sideAxis': [round(c, 3) for c in s_],
                      'frontAxis': [round(c, 3) for c in f_], 'slices': slices}
    res = {'source': src.split('/')[-1], 'height': H, 'units': 'metres, feet at y=0, +z forward, x = character left is +x? see joints',
           'joints': {n: [round(c, 4) for c in p] for n, p in JP.items()},
           'overall': {'xMin': round(min(v[0] for v in V), 4), 'xMax': round(max(v[0] for v in V), 4), 'zMin': round(min(v[2] for v in V), 4), 'zMax': round(max(v[2] for v in V), 4),
                       'triangles': len(accessor(j, bin_, prim['indices'])) // 3 if 'indices' in prim else len(P) // 3},
           'torso': torso, 'limbs': limbs}
    json.dump(res, open(out, 'w'), indent=1)
    print(src, 'height', H, 'shoulders', JP['LeftArm'][0] - JP['RightArm'][0], 'torso slices', len(torso))

main()
