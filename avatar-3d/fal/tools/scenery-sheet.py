#!/usr/bin/env python3
"""Clean a Codex 2x2 scenery drawing (ref/<sheet>.png, tools/refdraw.mjs) into the picture Trellis-2 gets.

    python3 -I avatar-3d/fal/tools/scenery-sheet.py <sheet-id>     → ref/sheet-<sheet-id>.png

Codex draws four objects, one per quarter, but not always centred or with even gaps. This finds the emptiest
column and row near the middle (the gutters), cuts the four quarters there, trims each object to its outline, flattens
the background to one grey and centres each object in an equal quarter of a 1024 square with wide gaps, so
tools/blender/split_sheet.py can cut the 3D result apart (left to right, top to bottom). Exits with an error when a
gutter is not empty (an object crosses into another quarter) — redraw that sheet (refdraw.mjs <id> --again).
"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sid = sys.argv[1]
src = os.path.join(ROOT, 'ref', sid + '.png')
if not os.path.exists(src): src = src[:-4] + '.webp'
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()
bg = tuple(sorted(px[x, y][i] for x, y in [(3, 3), (W - 4, 3), (3, H - 4), (W - 4, H - 4)])[1] for i in range(3))
def ink(p): return sum(abs(p[i] - bg[i]) for i in range(3)) > 36
colink = [sum(ink(px[x, y]) for y in range(0, H, 3)) for x in range(W)]
rowink = [sum(ink(px[x, y]) for x in range(0, W, 3)) for y in range(H)]
def gutter(arr, n):
    lo, hi = int(n * 0.3), int(n * 0.7)
    best = min(range(lo, hi), key=lambda i: (sum(arr[max(lo, i - 6):i + 7]), abs(i - n // 2)))
    return best, arr[best]
gx, cx_ink = gutter(colink, W)
gy, cy_ink = gutter(rowink, H)
# a vertical gutter may only be clear in each half separately (objects of different heights): check per half
def col_ink_in(x, y0, y1): return sum(ink(px[x, y]) for y in range(y0, y1, 2))
def row_ink_in(y, x0, x1): return sum(ink(px[x, y]) for x in range(x0, x1, 2))
bad = []
if col_ink_in(gx, 0, gy) > 2 or col_ink_in(gx, gy, H) > 2: bad.append(f'column gutter at x={gx} has ink')
if row_ink_in(gy, 0, gx) > 2 or row_ink_in(gy, gx, W) > 2: bad.append(f'row gutter at y={gy} has ink')
if bad and '--force' not in sys.argv: sys.exit(f'{sid}: ' + '; '.join(bad) + ' (redraw, or --force)')
S = 1024; cell = S // 2
out = Image.new('RGB', (S, S), (200, 200, 200))
boxes = [(0, 0, gx, gy), (gx, 0, W, gy), (0, gy, gx, H), (gx, gy, W, H)]
report = []; means = []
for i, (x0, y0, x1, y1) in enumerate(boxes):
    q = im.crop((x0, y0, x1, y1)); qp = q.load(); qw, qh = q.size
    xs = [x for x in range(qw) if any(ink(qp[x, y]) for y in range(0, qh, 2))]
    ys = [y for y in range(qh) if any(ink(qp[x, y]) for x in range(0, qw, 2))]
    if not xs: sys.exit(f'{sid}: quarter {i} is empty')
    # trim off stray specks: the object's own box is where most ink is (drop rows/cols with tiny ink at the edges)
    q = q.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
    q.putdata([(200, 200, 200) if sum(abs(p[k] - bg[k]) for k in range(3)) <= 22 else p for p in q.getdata()])
    fg = [p for p in q.getdata() if p != (200, 200, 200)]
    means.append([round(sum(p[c] for p in fg) / max(1, len(fg))) for c in range(3)])
    sc = min(cell * 0.80 / q.width, cell * 0.80 / q.height)
    q = q.resize((max(1, int(q.width * sc)), max(1, int(q.height * sc))), Image.LANCZOS)
    cx, cy = (i % 2) * cell + cell // 2, (i // 2) * cell + cell // 2
    out.paste(q, (cx - q.width // 2, cy - q.height // 2))
    report.append(f'{q.width}x{q.height}')
out.save(os.path.join(ROOT, 'ref', f'sheet-{sid}.png'))
# the drawing's mean colour per object: tools/blender/scenery.py lifts the baked texture to it (Trellis comes out darker)
import json
ids = [o['id'] for o in next(x for x in json.load(open(os.path.join(ROOT, 'data', 'scenery.json')))['sheets'] if x['id'] == sid)['objects']]
json.dump(dict(zip(ids, means)), open(os.path.join(ROOT, 'ref', f'sheet-{sid}.colors.json'), 'w'))
print(f'sheet-{sid}: gutters x={gx} y={gy}{" (FORCED: " + "; ".join(bad) + ")" if bad else ""}; ' + ' '.join(report))
