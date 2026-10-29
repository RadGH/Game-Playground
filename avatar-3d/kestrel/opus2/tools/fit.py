#!/usr/bin/env python3
"""Measure the Meshy GLB and our own dumped geometry (tools/dump.mjs) the SAME way and print the differences.

    python3 -I fit.py <meshy.glb> <dump.json> [--height 1.78] [--json out.json] [--quiet]

Both are measured in bind pose, feet at y = 0, +z forward, the right-hand side of the character mirrored onto +x so
sides do not matter. Classes come from each skeleton's own bone names (arm chain / leg chain / head / trunk).
* joints: hip, knee, ankle, shoulder, elbow, wrist, neck, head heights.
* trunk: per 2 cm height from the crotch to the chin: half-width (max |x|), front z, back z — trunk vertices plus leg
  vertices above the crotch (hips and glutes), arms excluded.
* leg: per 3 cm from the ankle to the crotch, one leg: width (x extent) and depth (z extent).
* arm: 10 slices along the upper arm and the forearm: thickness across and front-to-back.
"""
import json, math, struct, sys

FMT = {5126: ('f', 4), 5125: ('I', 4), 5123: ('H', 2), 5121: ('B', 1)}
SIZE = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
def read_glb(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n]); off = 20 + n; ln = struct.unpack('<I', b[off:off + 4])[0]
    return j, b[off + 8: off + 8 + ln]
def accessor(j, bin_, i):
    a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; f, s = FMT[a['componentType']]; k = SIZE[a['type']]
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); stride = v.get('byteStride', s * k); out = []
    for e in range(a['count']):
        vals = struct.unpack_from('<' + f * k, bin_, o + e * stride)
        if a.get('normalized') and f in 'BH': vals = tuple(x / (255 if f == 'B' else 65535) for x in vals)
        out.append(vals)
    return out
def inv_t(m):
    r = [[m[0], m[4], m[8]], [m[1], m[5], m[9]], [m[2], m[6], m[10]]]; t = [m[12], m[13], m[14]]
    det = (r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1]) - r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0]) + r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]))
    inv = [[(r[1][1]*r[2][2]-r[1][2]*r[2][1])/det, (r[0][2]*r[2][1]-r[0][1]*r[2][2])/det, (r[0][1]*r[1][2]-r[0][2]*r[1][1])/det],
           [(r[1][2]*r[2][0]-r[1][0]*r[2][2])/det, (r[0][0]*r[2][2]-r[0][2]*r[2][0])/det, (r[0][2]*r[1][0]-r[0][0]*r[1][2])/det],
           [(r[1][0]*r[2][1]-r[1][1]*r[2][0])/det, (r[0][1]*r[2][0]-r[0][0]*r[2][1])/det, (r[0][0]*r[1][1]-r[0][1]*r[1][0])/det]]
    return [-(inv[i][0]*t[0] + inv[i][1]*t[1] + inv[i][2]*t[2]) for i in range(3)]

def load_meshy(path, H):
    j, bin_ = read_glb(path); prim = j['meshes'][0]['primitives'][0]; skin = j['skins'][0]
    P = accessor(j, bin_, prim['attributes']['POSITION']); J = accessor(j, bin_, prim['attributes']['JOINTS_0']); W = accessor(j, bin_, prim['attributes']['WEIGHTS_0'])
    names = [j['nodes'][k]['name'] for k in skin['joints']]; ibm = accessor(j, bin_, skin['inverseBindMatrices'])
    jp = {names[i]: inv_t(ibm[i]) for i in range(len(names))}
    ys = [p[1] for p in P]; y0, y1 = min(ys), max(ys); k = H / (y1 - y0); xs = [p[0] for p in P]; cx = (min(xs) + max(xs)) / 2
    fwd = 1 if jp['LeftToeBase'][2] > jp['LeftFoot'][2] else -1
    T = lambda p: ((p[0] - cx) * k * fwd, (p[1] - y0) * k, p[2] * k * fwd)
    V = [T(p) for p in P]; JP = {n: T(p) for n, p in jp.items()}; zc = JP['Hips'][2]
    V = [(x, y, z - zc) for x, y, z in V]; JP = {n: (p[0], p[1], p[2] - zc) for n, p in JP.items()}
    dom = [names[J[i][max(range(4), key=lambda q: W[i][q])]] for i in range(len(P))]
    def cls(n):
        if n in ('LeftArm', 'RightArm'): return 'upper'
        if n in ('LeftForeArm', 'RightForeArm'): return 'fore'
        if n in ('LeftHand', 'RightHand'): return 'hand'
        if n.endswith('UpLeg'): return 'thigh'
        if n in ('LeftLeg', 'RightLeg'): return 'shin'
        if 'Foot' in n or 'Toe' in n: return 'foot'
        if n.startswith('head') or n == 'Head': return 'head'
        return 'trunk'
    side = lambda x: 1 if x > 0 else -1     # Meshy: Left at +x
    C = [cls(n) for n in dom]
    # mirror the left side (+x) onto +x and the right onto -x: keep left as the measured side
    jt = {
        'hip': JP['LeftUpLeg'], 'knee': JP['LeftLeg'], 'ankle': JP['LeftFoot'], 'shoulder': JP['LeftArm'], 'elbow': JP['LeftForeArm'],
        'wrist': JP['LeftHand'], 'neck': JP['neck'], 'head': JP['Head'], 'clav': JP['LeftShoulder'],
    }
    tris = accessor(j, bin_, prim['indices']); tris = [t[0] for t in tris]
    return V, C, jt, [tris[i:i+3] for i in range(0, len(tris), 3)]

def load_dump(path):
    d = json.load(open(path)); B = d['bones']; pos = d['pos']; V = [(pos[i], pos[i+1], pos[i+2]) for i in range(0, len(pos), 3)]
    def cls(n):
        import re
        if re.match(r'^arm[LR]$', n): return 'upper'
        if re.match(r'^elbow[LR]$', n): return 'fore'
        if re.match(r'^(hand|grip|thumb|index|middle|ring|pinky)', n): return 'hand'
        if re.match(r'^leg[LR]$', n): return 'thigh'
        if re.match(r'^knee[LR]$', n): return 'shin'
        if re.match(r'^(foot|toe)[LR]$', n): return 'foot'
        if n in ('hips', 'spine', 'chest', 'neck', 'root') or n.startswith('clav'): return 'trunk'
        return 'head'
    C = [cls(B[i]) for i in d['dom']]; J = d['joints']
    jt = {'hip': J['legR'], 'knee': J['kneeR'], 'ankle': J['footR'], 'shoulder': J['armR'], 'elbow': J['elbowR'], 'wrist': J['handR'],
          'neck': J['neck'], 'head': J['head'], 'clav': J['clavR']}
    I = d['index']
    return V, C, jt, [I[i:i+3] for i in range(0, len(I), 3)]

ARMC = ('upper', 'fore', 'hand')
def edges_of(tris):
    E = set()
    for a, b, c in tris:
        for u, v in ((a, b), (b, c), (c, a)): E.add((u, v) if u < v else (v, u))
    return list(E)
def cut(V, C, E, n, d):
    """Points where the edges cross the plane n.p = d, each with the class of its nearer endpoint."""
    out = []
    for u, v in E:
        pu, pv = V[u], V[v]
        a = pu[0]*n[0] + pu[1]*n[1] + pu[2]*n[2] - d; b = pv[0]*n[0] + pv[1]*n[1] + pv[2]*n[2] - d
        if (a > 0) == (b > 0) or a == b: continue
        t = a / (a - b); p = (pu[0] + (pv[0]-pu[0])*t, pu[1] + (pv[1]-pu[1])*t, pu[2] + (pv[2]-pu[2])*t)
        out.append((p, C[u] if t < 0.5 else C[v]))
    return out
def measure(V, C, jt, tris):
    E = edges_of(tris)
    crotch = jt['hip'][1] - 0.075
    chin = jt['head'][1] - 0.02
    out = {'joints': {k: [round(c, 3) for c in v] for k, v in jt.items()}, 'trunk': [], 'leg': [], 'arm': {}}
    top = max(v[1] for v in V)
    for i in range(int(crotch / 0.02) + 1, int(top / 0.02) + 1):
        y = i * 0.02
        allp = cut(V, C, E, (0, 1, 0), y)
        pts = [p for p, c in allp if c not in ARMC and (c != 'head' or y > chin - 0.03) and abs(p[0]) < 0.3]
        if len(pts) < 3: continue
        full = max([abs(p[0]) for p, c in allp if c != 'hand' and abs(p[0]) < 0.36] or [0])
        out['trunk'].append({'y': round(y, 3), 'full': round(full, 4), 'hw': round(max(abs(p[0]) for p in pts), 4), 'zf': round(max(p[2] for p in pts), 4), 'zb': round(min(p[2] for p in pts), 4)})
    ax = jt['ankle'][1]
    for i in range(int(ax / 0.03) + 1, int(crotch / 0.03) + 1):
        y = i * 0.03
        pts = [p for p, c in cut(V, C, E, (0, 1, 0), y) if c not in ARMC and 0 < p[0] < 0.32]
        if len(pts) < 3: continue
        out['leg'].append({'y': round(y, 3), 'w': round(max(p[0] for p in pts) - min(p[0] for p in pts), 4), 'cx': round((max(p[0] for p in pts) + min(p[0] for p in pts)) / 2, 4),
                           'd': round(max(p[2] for p in pts) - min(p[2] for p in pts), 4), 'zf': round(max(p[2] for p in pts), 4), 'zb': round(min(p[2] for p in pts), 4)})
    for name, a, b in (('upper', 'shoulder', 'elbow'), ('fore', 'elbow', 'wrist')):
        A, Bp = jt[a], jt[b]
        A = (abs(A[0]), A[1], A[2]); Bp = (abs(Bp[0]), Bp[1], Bp[2])
        axv = [Bp[i] - A[i] for i in range(3)]; L = math.sqrt(sum(c * c for c in axv)); axv = [c / L for c in axv]
        f = [0, 0, 1]; dd = sum(f[i] * axv[i] for i in range(3)); f = [f[i] - dd * axv[i] for i in range(3)]; nn = math.sqrt(sum(c * c for c in f)); f = [c / nn for c in f]
        s = [axv[1] * f[2] - axv[2] * f[1], axv[2] * f[0] - axv[0] * f[2], axv[0] * f[1] - axv[1] * f[0]]
        sl = []
        for q in range(10):
            t = (q + 0.5) / 10; c0 = [A[i] + axv[i] * L * t for i in range(3)]
            sel = []
            for p, c in cut(V, C, E, axv, sum(c0[i] * axv[i] for i in range(3))):
                if p[0] <= 0: continue
                r = [p[i] - c0[i] for i in range(3)]
                if math.sqrt(sum(x * x for x in r)) > 0.13: continue
                if c not in ARMC and q > 1: continue
                sel.append((sum(r[i] * s[i] for i in range(3)), sum(r[i] * f[i] for i in range(3))))
            if len(sel) < 3: continue
            sl.append({'t': round(t, 2), 'w': round(max(p[0] for p in sel) - min(p[0] for p in sel), 4), 'd': round(max(p[1] for p in sel) - min(p[1] for p in sel), 4)})
        out['arm'][name] = {'length': round(L, 4), 'slices': sl}
    out['headTop'] = round(max(v[1] for v in V), 3)
    return out

def near(rows, key, y, tol):
    best = min(rows, key=lambda r: abs(r[key] - y)) if rows else None
    return best if best and abs(best[key] - y) <= tol else None

def align(L):
    """Shift z so the shin's centre (y 0.18..0.32, one leg) is z = 0: hip joints sit at different depths in the two rigs."""
    V, C, jt, tris = L
    zs = [v[2] for v, c in zip(V, C) if 0.18 < v[1] < 0.32 and 0 < v[0] < 0.32 and c not in ARMC]
    zc = (max(zs) + min(zs)) / 2
    return [(x, y, z - zc) for x, y, z in V], C, {k: (p[0], p[1], p[2] - zc) for k, p in jt.items()}, tris

def overlay(LM, LO, path, H):
    """Orthographic silhouettes, front (x, y) and side (z, y): Meshy filled red, ours filled blue, overlap purple."""
    from PIL import Image, ImageChops, ImageDraw
    S = 1000; W = int(S * 1.25); pad = 20
    def sil(L, view):
        V, C, jt, tris = L
        im = Image.new('L', (W, int(S * H / 1.0) // 2 + 2 * pad), 0); d = ImageDraw.Draw(im); sc = (im.height - 2 * pad) / H
        for t in tris:
            pts = []
            for i in t:
                x, y, z = V[i]; h = x if view == 'front' else z
                pts.append((W / 2 + h * sc, im.height - pad - y * sc))
            d.polygon(pts, fill=255)
        return im
    panels = []
    for view in ('front', 'side'):
        a, b = sil(LM, view), sil(LO, view)
        rgb = Image.merge('RGB', (a, ImageChops.multiply(a, b).point(lambda v: v // 3), b))
        g = ImageDraw.Draw(rgb)
        for yy in range(0, int(H * 10) + 1):
            y = rgb.height - pad - yy * 0.1 * (rgb.height - 2 * pad) / H; g.line([(0, y), (12, y)], fill=(200, 200, 200))
        g.line([(W / 2, 0), (W / 2, rgb.height)], fill=(90, 90, 90))
        panels.append(rgb)
    out = Image.new('RGB', (W * 2 + 10, panels[0].height), (0, 0, 0)); out.paste(panels[0], (0, 0)); out.paste(panels[1], (W + 10, 0)); out.save(path)

def main():
    glb, dump = sys.argv[1], sys.argv[2]
    H = float(sys.argv[sys.argv.index('--height') + 1]) if '--height' in sys.argv else 1.78
    quiet = '--quiet' in sys.argv
    LM = align(load_meshy(glb, H)); LO = align(load_dump(dump))
    M = measure(*LM); O = measure(*LO)
    if '--overlay' in sys.argv: overlay(LM, LO, sys.argv[sys.argv.index('--overlay') + 1], H)
    res = {'meshy': M, 'ours': O}
    print('JOINTS (y, |x|, z)  meshy | ours | diff cm')
    for k in M['joints']:
        m, o = M['joints'][k], O['joints'][k]
        print('  %-8s y %.3f | %.3f | %+5.1f    x %.3f | %.3f | %+5.1f    z %+.3f | %+.3f | %+5.1f' % (k, m[1], o[1], (o[1]-m[1])*100, abs(m[0]), abs(o[0]), (abs(o[0])-abs(m[0]))*100, m[2], o[2], (o[2]-m[2])*100))
    print('  upper arm length %.3f | %.3f   forearm %.3f | %.3f' % (M['arm']['upper']['length'], O['arm']['upper']['length'], M['arm']['fore']['length'], O['arm']['fore']['length']))
    print('TRUNK  y   half-width m|o (d)    front z m|o (d)    back z m|o (d)   with-arms m|o [cm]')
    dif = {'hw': [], 'zf': [], 'zb': []}
    for r in M['trunk']:
        o = near(O['trunk'], 'y', r['y'], 0.011)
        if not o: continue
        dd = {k: (o[k] - r[k]) * 100 for k in ('hw', 'zf', 'zb')}
        for k in dd: dif[k].append(abs(dd[k]))
        if not quiet: print('  %.2f  %5.1f %5.1f (%+4.1f)   %5.1f %5.1f (%+4.1f)   %6.1f %6.1f (%+4.1f)   %5.1f %5.1f' % (r['y'], r['hw']*100, o['hw']*100, dd['hw'], r['zf']*100, o['zf']*100, dd['zf'], r['zb']*100, o['zb']*100, dd['zb'], r['full']*100, o['full']*100))
    print('  mean |d| cm: half-width %.1f  front %.1f  back %.1f' % tuple(sum(v)/max(1, len(v)) for v in dif.values()))
    print('LEG  y   width m|o (d)   depth m|o (d)   centre x m|o   front z m|o')
    dl = {'w': [], 'd': []}
    for r in M['leg']:
        o = near(O['leg'], 'y', r['y'], 0.016)
        if not o: continue
        dl['w'].append(abs(o['w'] - r['w']) * 100); dl['d'].append(abs(o['d'] - r['d']) * 100)
        if not quiet: print('  %.2f  %5.1f %5.1f (%+4.1f)   %5.1f %5.1f (%+4.1f)   %5.1f %5.1f   %5.1f %5.1f' % (r['y'], r['w']*100, o['w']*100, (o['w']-r['w'])*100, r['d']*100, o['d']*100, (o['d']-r['d'])*100, r['cx']*100, o['cx']*100, r['zf']*100, o['zf']*100))
    print('  mean |d| cm: width %.1f  depth %.1f' % (sum(dl['w'])/max(1, len(dl['w'])), sum(dl['d'])/max(1, len(dl['d']))))
    for nm in ('upper', 'fore'):
        print('ARM %s  t  width m|o  depth m|o [cm]' % nm)
        for r in M['arm'][nm]['slices']:
            o = next((x for x in O['arm'][nm]['slices'] if x['t'] == r['t']), None)
            if o and not quiet: print('  %.2f  %5.1f %5.1f   %5.1f %5.1f' % (r['t'], r['w']*100, o['w']*100, r['d']*100, o['d']*100))
    if '--codex' in sys.argv:
        sys.path.insert(0, __file__.rsplit('/', 1)[0]); import codexsil
        cf, cs, flip = sys.argv[sys.argv.index('--codex') + 1].split(',')
        CF = codexsil.front(cf, H); CS = codexsil.side(cs, H, flip == '1')
        def prof(L):
            V, C, jt, tris = L; E = edges_of(tris); out = {}
            for i in range(3, int(H / 0.02) + 1):
                y = i * 0.02; pts = [p for p, c in cut(V, C, E, (0, 1, 0), y) if c not in ARMC]
                if pts: out[round(y, 2)] = (max(p[2] for p in pts), min(p[2] for p in pts))
            return out
        PM, PO = prof(LM), prof(LO)
        print('SIDE (shin-aligned, arms left out of ours/meshy; codex includes arms)  y   front c|m|o    back c|m|o')
        for y in sorted(CS):
            if y not in PO or y not in PM: continue
            c = CS[y]; m = PM[y]; o = PO[y]
            print('  %.2f   %5.1f %5.1f %5.1f   %6.1f %6.1f %6.1f' % (y, c[0]*100, m[0]*100, o[0]*100, c[1]*100, m[1]*100, o[1]*100))
        print('FRONT codex: trunk half-width / leg width   (compare TRUNK hw and LEG w above)')
        tr = {r['y']: r for r in O['trunk']}; lg = {r['y']: r for r in O['leg']}
        for y in sorted(CF):
            kind, v = CF[y]
            if kind == 'trunk' and round(y, 2) in tr: print('  %.2f trunk  codex %5.1f  ours %5.1f' % (y, v * 100, tr[round(y, 2)]['hw'] * 100))
            if kind == 'leg':
                o = min(O['leg'], key=lambda r: abs(r['y'] - y)) if O['leg'] else None
                if o and abs(o['y'] - y) < 0.011: print('  %.2f leg    codex %5.1f  ours %5.1f' % (y, v * 100, o['w'] * 100))
    if '--json' in sys.argv: json.dump(res, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
main()
