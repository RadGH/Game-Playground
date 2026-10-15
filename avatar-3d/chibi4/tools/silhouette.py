#!/usr/bin/env python3
"""Measure a Codex reference sheet: for every row of a figure, the runs of non-background pixels, in metres.

  python3 silhouette.py <front.png> <side.png> <height_m> <out.json>

The background is the flat studio grey in the corner. Output (z up from the soles, x/y in metres from the figure's
centre line): {"front": [[z, [[x0, x1], ...]], ...], "side": [[z, [[y0, y1], ...]], ...]}. Chibi 4 step 1 lofts
the body and robe from these runs (front = width, side = depth)."""
import json, sys
from PIL import Image


def runs_of(path, height_m, step_m=0.01, thresh=34):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    bg = px[3, 3]

    def solid(x, y):
        r, g, b = px[x, y]
        return abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2]) > thresh

    rows = [y for y in range(H) if sum(solid(x, y) for x in range(0, W, 3)) > 1]
    top, bot = rows[0], rows[-1]
    s = height_m / (bot - top)
    # centre line = middle of the widest run in the lowest 40% (legs/hem)
    cols = [x for x in range(W) if any(solid(x, y) for y in range(top, bot, 4))]
    cx = (cols[0] + cols[-1]) / 2
    out = []
    y = bot
    while y >= top:
        rr, inside, start = [], False, 0
        for x in range(W):
            v = solid(x, y)
            if v and not inside: inside, start = True, x
            if not v and inside:
                inside = False
                if x - start > 2: rr.append([round((start - cx) * s, 4), round((x - cx) * s, 4)])
        if inside: rr.append([round((start - cx) * s, 4), round((W - cx) * s, 4)])
        out.append([round((bot - y) * s, 4), rr])
        y -= max(1, int(step_m / s))
    return out, s, cx


if __name__ == "__main__":
    front, side, h, dst = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
    f, sf, _ = runs_of(front, h)
    sd, ss, _ = runs_of(side, h)
    json.dump({"height": h, "front": f, "side": sd}, open(dst, "w"))
    print("rows", len(f), len(sd), "m/px", round(sf, 5), round(ss, 5))
