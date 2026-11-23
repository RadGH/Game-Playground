#!/usr/bin/env python3
"""Put several redrawn item pictures on one square picture, so one paid image-to-3D job makes them all.

    python3 -I avatar-3d/fal/tools/sheet.py <sheet-id> <cols> <item-id>...   → ref/sheet-<sheet-id>.png

Each item is trimmed to its own outline and centred in an equal cell on the same light grey, with clear gaps,
so the 3D result has separate pieces that tools/blender/split_sheet.py cuts apart (left to right, top to bottom).
"""
import os, sys
from PIL import Image
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
sid, cols, ids = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
rows = (len(ids) + cols - 1) // cols
S = 1024; cw, ch = S // cols, S // rows
bg = (200, 200, 200)
out = Image.new('RGB', (S, S), bg)
for i, iid in enumerate(ids):
    src = os.path.join(ROOT, 'ref', iid + '.png')
    if not os.path.exists(src): src = src[:-4] + '.webp'   # the repo keeps WebP copies of the redraws
    im = Image.open(src).convert('RGB')
    px = im.load(); W, H = im.size
    b0 = px[2, 2]
    ink = lambda p: sum(abs(p[k] - b0[k]) for k in range(3)) > 40
    xs = [x for x in range(0, W, 2) if any(ink(px[x, y]) for y in range(0, H, 4))]
    ys = [y for y in range(0, H, 2) if any(ink(px[x, y]) for x in range(0, W, 4))]
    im = im.crop((xs[0], ys[0], xs[-1] + 1, ys[-1] + 1))
    # re-flood the old background to the sheet grey
    im = Image.eval(im, lambda v: v)
    data = [bg if sum(abs(p[k] - b0[k]) for k in range(3)) <= 24 else p for p in im.getdata()]
    im.putdata(data)
    sc = min((cw * 0.82) / im.width, (ch * 0.82) / im.height)
    im = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
    cx, cy = (i % cols) * cw + cw // 2, (i // cols) * ch + ch // 2
    out.paste(im, (cx - im.width // 2, cy - im.height // 2))
out.save(os.path.join(ROOT, 'ref', f'sheet-{sid}.png'))
print(f'sheet-{sid}: {cols}x{rows} ' + ' '.join(ids))
