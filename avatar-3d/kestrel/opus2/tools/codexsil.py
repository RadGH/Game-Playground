"""Silhouettes off the Codex pictures (plain grey background), in metres, for fit.py."""
from PIL import Image
def _mask(path):
    im = Image.open(path).convert('RGB'); W, H = im.size; px = im.load()
    bg = [px[3, 3], px[W - 4, 3], px[3, H // 2], px[W - 4, H // 2]]
    fg = lambda x, y: min(sum(abs(px[x, y][i] - b[i]) for i in range(3)) for b in bg) > 40
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
    ys = [y for y in range(H) if rows[y]]
    return rows, ys[0], ys[-1]
def front(path, Hm):
    R, top, bot = _mask(path); sc = Hm / (bot - top)
    mid = R[int(top + 0.5 * (bot - top))]; cx = (mid[0][0] + mid[-1][1]) / 2
    out = {}
    for i in range(4, int(Hm / 0.02)):
        y = round(i * 0.02, 2); runs = R[int(bot - y / sc)]
        th = [r for r in runs if r[0] <= cx <= r[1]]; rt = [r for r in runs if r[0] > cx and r[0] - cx < 0.3 / sc]
        if th and len(runs) > 1: out[y] = ('trunk', max(cx - th[0][0], th[0][1] - cx) * sc)
        elif not th and rt: out[y] = ('leg', (rt[0][1] - rt[0][0]) * sc)
    return out
def side(path, Hm, flip):
    R, top, bot = _mask(path); sc = Hm / (bot - top)
    r = R[int(bot - 0.25 / sc)]; zc = (r[0][0] + r[-1][1]) / 2; out = {}
    for i in range(3, int(Hm / 0.02) + 1):
        y = round(i * 0.02, 2); runs = R[int(bot - y / sc)]
        if not runs: continue
        a, b = (runs[0][0] - zc) * sc, (runs[-1][1] - zc) * sc
        out[y] = (-a, -b) if flip else (b, a)
    return out
