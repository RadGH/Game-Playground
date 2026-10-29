#!/usr/bin/env python3
"""Silhouette numbers off a Codex reference picture (plain grey background), scaled to a height in metres.
    python3 -I codex.py <front.png> <side.png> <height>
front: per 2 cm the half-width of the run through the middle (trunk; below the crotch: one leg's width and centre).
side: per 2 cm the silhouette's front and back (relative to the middle of the shin)."""
import sys
from PIL import Image
def mask(path):
    im = Image.open(path).convert('RGB'); W, H = im.size; px = im.load()
    bg = [px[3, 3], px[W - 4, 3], px[3, H // 2], px[W - 4, H // 2]]
    def fg(x, y):
        c = px[x, y]; return min(sum(abs(c[i] - b[i]) for i in range(3)) for b in bg) > 40
    rows = []
    for y in range(H):
        runs = []; x = 0
        while x < W:
            if fg(x, y):
                s = x
                while x < W and fg(x, y): x += 1
                if x - s > 2: runs.append((s, x))
            x += 1
        rows.append(runs)
    ys = [y for y in range(H) if rows[y]]; top, bot = ys[0], ys[-1]
    return rows, top, bot, W
front, side, Hm = sys.argv[1], sys.argv[2], float(sys.argv[3])
R, top, bot, W = mask(front); sc = Hm / (bot - top)
cx = None
# centre: middle of the widest run near the hips
mid = [r for r in R[int(top + 0.5 * (bot - top))] ]
cx = (mid[0][0] + mid[-1][1]) / 2 if len(mid) > 1 else (mid[0][0] + mid[0][1]) / 2
print('FRONT  y   trunk half-width | leg width centre (cm)')
for i in range(4, int(Hm / 0.02)):
    y = i * 0.02; py = int(bot - y / sc); runs = R[py]
    through = [r for r in runs if r[0] <= cx <= r[1]]
    right = [r for r in runs if r[0] > cx and r[0] - cx < 0.3 / sc]
    s = '  %.2f ' % y
    if through: s += ' trunk %5.1f' % (max(cx - through[0][0], through[0][1] - cx) * sc * 100)
    elif right: s += ' leg w %5.1f  cx %5.1f' % ((right[0][1] - right[0][0]) * sc * 100, ((right[0][0] + right[0][1]) / 2 - cx) * sc * 100)
    s += '   runs %d' % len(runs)
    print(s)
R, top, bot, W = mask(side); sc = Hm / (bot - top)
py = int(bot - 0.25 / sc); r = R[py]; zc = (r[0][0] + r[-1][1]) / 2
print('SIDE  y   back..front (cm, +z = right of the picture)')
for i in range(4, int(Hm / 0.02)):
    y = i * 0.02; runs = R[int(bot - y / sc)]
    if runs: print('  %.2f  %6.1f %6.1f  depth %5.1f' % (y, (runs[0][0] - zc) * sc * 100, (runs[-1][1] - zc) * sc * 100, (runs[-1][1] - runs[0][0]) * sc * 100))
