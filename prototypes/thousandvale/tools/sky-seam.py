#!/usr/bin/env python3
"""Make each sky panorama in assets/sky/ wrap with no seam (owner 2026-10-16: "a tearing effect seam in the skybox").
Codex's panoramas do not quite meet at their left/right edges. Overlap-blend: the last B columns are cross-faded into
the first B and then dropped, so the new right edge sits next to what was column W-B-1 and the new left edge starts
with column W-B — neighbours in the original picture. The picture gets B pixels narrower. Safe to run once per new
picture (it records what it did in assets/sky/seam.json and skips pictures already done).
  python3 prototypes/thousandvale/tools/sky-seam.py [band=96]"""
import json, os, sys
from PIL import Image
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sky')
B = int(sys.argv[1]) if len(sys.argv) > 1 else 96
log_path = os.path.join(D, 'seam.json')
done = json.load(open(log_path)) if os.path.exists(log_path) else {}
for f in sorted(os.listdir(D)):
    if not f.endswith('.webp') or f in done: continue
    im = Image.open(os.path.join(D, f)).convert('RGB'); W, H = im.size
    px = im.load(); out = Image.new('RGB', (W - B, H)); po = out.load()
    for y in range(H):
        for x in range(W - B):
            if x < B:
                t = (x + 0.5) / B                       # 0 at the left edge -> take the old right edge; 1 -> the original
                a, b = px[W - B + x, y], px[x, y]
                po[x, y] = tuple(round(a[i] * (1 - t) + b[i] * t) for i in range(3))
            else:
                po[x, y] = px[x, y]
    out.save(os.path.join(D, f), 'WEBP', quality=82)
    done[f] = {'band': B, 'from': [W, H], 'to': [W - B, H]}
    print(f, W, '->', W - B)
json.dump(done, open(log_path, 'w'), indent=1)
