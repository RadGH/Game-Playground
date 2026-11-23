#!/usr/bin/env python3
"""Cut a redrawn turnaround sheet (ref/<id>.png, front | left | back) into one square picture per view.

    python3 -I avatar-3d/fal/tools/crop.py <id>     → ref/<id>-front.png, ref/<id>-left.png, ref/<id>-back.png

Finds the figures as runs of columns that differ from the flat background, keeps the SAME vertical band for all
views (heads and soles stay aligned) and centres each on a square canvas of the background colour.
Item pictures (one object) are also squared up: ref/<id>-front.png only.
"""
import os, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
cid = sys.argv[1]
src = os.path.join(ROOT, 'ref', cid + '.png')
if not os.path.exists(src): src = src[:-4] + '.webp'   # the repo keeps WebP copies of the redraws
im = Image.open(src).convert('RGB')
W, H = im.size
px = im.load()
bg = tuple(sum(px[x, y][i] for x, y in [(2, 2), (W - 3, 2), (2, H - 3), (W - 3, H - 3)]) // 4 for i in range(3))
def ink(p): return sum(abs(p[i] - bg[i]) for i in range(3)) > 40
cols = [any(ink(px[x, y]) for y in range(0, H, 2)) for x in range(W)]
rows = [any(ink(px[x, y]) for x in range(0, W, 2)) for y in range(H)]
runs, start = [], None
for x, c in enumerate(cols + [False]):
    if c and start is None: start = x
    if not c and start is not None:
        if x - start > 12: runs.append([start, x])
        start = None
merged = []
for r in runs:
    if merged and r[0] - merged[-1][1] < 25: merged[-1][1] = r[1]
    else: merged.append(r)
import json
kind = next((x.get('kind') for x in json.load(open(os.path.join(ROOT, 'data', 'refs.json')))['items'] if x['id'] == cid), None)
want = 3 if (W > H and kind in (None, 'body')) else 1   # enemy / beast / item pictures hold one view
if want == 1: merged = [[merged[0][0], merged[-1][1]]]
if len(merged) != want:
    sys.exit(f'{cid}: found {len(merged)} figures, expected {want}')
top = rows.index(True); bot = H - rows[::-1].index(True)
names = ['front', 'left', 'back'] if want == 3 else ['front']
for name, (a, b) in zip(names, merged):
    fig = im.crop((a, top, b, bot))
    side = int(max(b - a, bot - top) * 1.12)
    out = Image.new('RGB', (side, side), bg)
    out.paste(fig, ((side - (b - a)) // 2, (side - (bot - top)) // 2))
    out.save(os.path.join(ROOT, 'ref', f'{cid}-{name}.png'))
print(cid + ': ' + ', '.join(f'{n} {b - a}x{bot - top}' for n, (a, b) in zip(names, merged)))
