#!/usr/bin/env python3
"""Before/after table: v1 and v2 against Meshy (fit.py --json outputs) and the Codex silhouettes.
    python3 -I summary.py <v1dir> <v2dir>   (each holding fit-male.json / fit-female.json from fit.sh)"""
import json, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0]); import codexsil
K = '/home/radgh/claude/playground/avatar-3d/kestrel'
v1d, v2d = sys.argv[1:3]
# landmark heights read off the Codex pictures by eye on a 10 cm grid (tools/README: grid pictures), metres
CODEX = {'male': {'shoulder top': 1.385, 'chin': 1.476, 'elbow': 1.105, 'wrist': 0.89, 'crotch': 0.81},
         'female': {'shoulder top': 1.27, 'chin': 1.35, 'elbow': 1.03, 'wrist': 0.83, 'crotch': 0.795}}
def near(rows, key, y): return min(rows, key=lambda r: abs(r[key] - y))
for body, H in (('male', 1.78), ('female', 1.68)):
    a = json.load(open(f'{v1d}/fit-{body}.json')); b = json.load(open(f'{v2d}/fit-{body}.json'))
    M, O1, O2 = a['meshy'], a['ours'], b['ours']
    CF = codexsil.front(f'{K}/ref/{body}-front.png', H)
    print(f'\n### {body}\n')
    print('| measure | Codex | Meshy | v1 | v2 | v1 off (cm) | v2 off (cm) |\n|---|---|---|---|---|---|---|')
    for j in ('shoulder', 'elbow', 'wrist', 'hip', 'knee', 'neck', 'head'):
        m, x1, x2 = M['joints'][j][1], O1['joints'][j][1], O2['joints'][j][1]
        print(f'| {j} joint height (m) | | {m:.3f} | {x1:.3f} | {x2:.3f} | {(x1-m)*100:+.1f} | {(x2-m)*100:+.1f} |')
    print(f"| upper arm length | | {M['arm']['upper']['length']:.3f} | {O1['arm']['upper']['length']:.3f} | {O2['arm']['upper']['length']:.3f} | | |")
    print(f"| forearm length | | {M['arm']['fore']['length']:.3f} | {O1['arm']['fore']['length']:.3f} | {O2['arm']['fore']['length']:.3f} | | |")
    ys = {'male': [('hips', 0.88), ('waist', 1.06), ('lower chest', 1.16), ('chest', 1.26)], 'female': [('hips', 0.86), ('waist', 1.02), ('ribs', 1.10), ('bust', 1.14)]}[body]
    for name, y in ys:
        c = CF.get(round(y, 2)); c = c[1] * 100 if c and c[0] == 'trunk' else None
        m, x1, x2 = near(M['trunk'], 'y', y)['hw'] * 100, near(O1['trunk'], 'y', y)['hw'] * 100, near(O2['trunk'], 'y', y)['hw'] * 100
        ref = c if c is not None else m
        print(f"| {name} half-width at {y:.2f} m (cm) | {'' if c is None else f'{c:.1f}'} | {m:.1f} | {x1:.1f} | {x2:.1f} | {x1-ref:+.1f} | {x2-ref:+.1f} |")
    lys = {'male': [('thigh', 0.72), ('above knee', 0.57), ('knee', 0.5), ('calf', 0.39), ('ankle', 0.18)], 'female': [('thigh', 0.7), ('above knee', 0.56), ('knee', 0.48), ('calf', 0.33), ('ankle', 0.15)]}[body]
    for name, y in lys:
        c = min((k for k in CF if CF[k][0] == 'leg'), key=lambda k: abs(k - y)); c = CF[c][1] * 100
        m, x1, x2 = near(M['leg'], 'y', y)['w'] * 100, near(O1['leg'], 'y', y)['w'] * 100, near(O2['leg'], 'y', y)['w'] * 100
        print(f'| {name} width at {y:.2f} m (cm) | {c:.1f} | {m:.1f} | {x1:.1f} | {x2:.1f} | {x1-c:+.1f} | {x2-c:+.1f} |')
    for name, y in (('thigh', 0.69), ('calf', 0.39 if body == 'male' else 0.36)):
        m, x1, x2 = near(M['leg'], 'y', y)['d'] * 100, near(O1['leg'], 'y', y)['d'] * 100, near(O2['leg'], 'y', y)['d'] * 100
        print(f'| {name} depth at {y:.2f} m (cm) | | {m:.1f} | {x1:.1f} | {x2:.1f} | {x1-m:+.1f} | {x2-m:+.1f} |')
    # mean absolute differences over the whole trunk and legs vs Meshy
    def mean(O, part, key):
        d = []
        for r in M[part]:
            o = near(O[part], 'y', r['y'])
            if abs(o['y'] - r['y']) < 0.012: d.append(abs(o[key] - r[key]) * 100)
        return sum(d) / len(d)
    print(f"| mean trunk half-width diff vs Meshy, crotch→crown (cm) | | | | | {mean(O1,'trunk','hw'):.1f} | {mean(O2,'trunk','hw'):.1f} |")
    print(f"| mean leg width diff vs Meshy (cm) | | | | | {mean(O1,'leg','w'):.1f} | {mean(O2,'leg','w'):.1f} |")
    print(f"| mean leg depth diff vs Meshy (cm) | | | | | {mean(O1,'leg','d'):.1f} | {mean(O2,'leg','d'):.1f} |")
    print('\nLandmarks off the Codex picture (by eye, 10 cm grid):', ', '.join(f'{k} {v:.2f} m' for k, v in CODEX[body].items()))
