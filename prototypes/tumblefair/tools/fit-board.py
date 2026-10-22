#!/usr/bin/env python3
"""Fit a board's spaces onto the path painted in its backdrop picture (round 4, 2026-10-21).

A bug report said the spaces did not sit on the painted path: the spaces were laid out by a formula and the picture was
painted separately. This finds the sand-coloured path in the picture and slides every space onto the middle of it,
keeping the spaces in their order and evenly spread, then writes data/boards/<id>-fit.json ({ id: [x, z] }), which
tools/build-board.mjs reads over its formula positions. Run it after changing the backdrop:

    python3 prototypes/tumblefair/tools/fit-board.py [fairground] [--debug out.png]
    python3 prototypes/tumblefair/tools/fit-board.py pier --guide guide.png     (the layout guide to paint over)

Needs Pillow + numpy + scikit-image (pip install --user scikit-image).
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
board_id = next((a for a in sys.argv[1:] if not a.startswith('--') and not a.endswith('.png')), 'fairground')
debug = sys.argv[sys.argv.index('--debug') + 1] if '--debug' in sys.argv else None
B = json.load(open(os.path.join(GAME, 'data/boards', board_id + '.json')))
if '--guide' in sys.argv:                          # draw the layout guide Codex paints over (round 5): field, path, gate stub
    out = sys.argv[sys.argv.index('--guide') + 1]; S0 = 1600; kk = S0 / B['size']; P = lambda x, z: ((x + B['size'] / 2) * kk, (z + B['size'] / 2) * kk)
    g = Image.new('RGB', (S0, S0), (18, 50, 58)); d = ImageDraw.Draw(g)
    d.rounded_rectangle([90, 90, S0 - 90, S0 - 90], 90, fill=tuple(int(B.get('guideField', '#5a9a4a')[i:i + 2], 16) for i in (1, 3, 5)))
    by = {s_['id']: s_ for s_ in B['spaces']}; W = 70
    for s_ in B['spaces']:
        for n in s_['next']: d.line([P(s_['x'], s_['z']), P(by[n]['x'], by[n]['z'])], fill=(232, 200, 140), width=W)
    for s_ in B['spaces']: x, y = P(s_['x'], s_['z']); d.ellipse([x - W / 2, y - W / 2, x + W / 2, y + W / 2], fill=(232, 200, 140))
    x, y = P(by[B['start']]['x'], by[B['start']]['z']); d.rectangle([x - W / 2 + 10, y, x + W / 2 - 10, S0 - 90], fill=(232, 200, 140))
    g.save(out); print('guide', out); sys.exit(0)
img = None if '--guide' in sys.argv else Image.open(os.path.join(GAME, 'assets/art', B['backdrop'] + '.webp')).convert('RGB')
S = img.size[0] if img else 1600; k = S / B['size']
to_px = lambda x, z: ((x + B['size'] / 2) * k, (z + B['size'] / 2) * k)
to_w = lambda px, py: (px / k - B['size'] / 2, py / k - B['size'] / 2)

# the path: warm sand (red > green > blue, by ratio so it is found in the lit middle and the dim corners alike)
a = np.asarray(img.filter(ImageFilter.MedianFilter(5))).astype(float)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
mask = (r > 110) & (g / np.maximum(r, 1) > 0.55) & (g / np.maximum(r, 1) < 0.82) & (b / np.maximum(r, 1) > 0.3) & (b / np.maximum(r, 1) < 0.62)
mask = ndimage.binary_opening(mask, iterations=3)
mask = ndimage.binary_closing(mask, iterations=4)
# distance to the path's edge: its ridge is the middle of the path
dist = ndimage.distance_transform_edt(mask)

sp = {s['id']: s for s in B['spaces']}
pos = {s['id']: np.array(to_px(s['x'], s['z'])) for s in B['spaces']}

def across(ids, closed):
    """Slide each space sideways (across the path, never along it) to the middle of the painted path there. Where the
    path widens (a junction, the gate's entrance) only the near edge is trusted and the space sits half a path-width in."""
    pts = [pos[i].copy() for i in ids]; n = len(pts); found = []
    for j in range(n):
        a_ = pts[(j - 1) % n] if closed or j > 0 else pts[0]; b_ = pts[(j + 1) % n] if closed or j < n - 1 else pts[-1]
        t = b_ - a_; t = t / max(np.linalg.norm(t), 1e-6); nrm = np.array([-t[1], t[0]])
        ts = np.arange(-260, 261, 2); on = []
        for u in ts:
            q = pts[j] + nrm * u; x, y = int(q[0]), int(q[1])
            on.append(0 <= x < S and 0 <= y < S and mask[y, x])
        on = np.array(on)
        if not on.any(): found.append(None); continue
        hits = np.where(on)[0]; k0 = hits[np.argmin(np.abs(ts[hits]))]       # the run nearest the space
        lo = k0; hi = k0
        while lo > 0 and on[lo - 1]: lo -= 1
        while hi < len(ts) - 1 and on[hi + 1]: hi += 1
        found.append((j, nrm, ts[lo], ts[hi]))
    halves = sorted((f[3] - f[2]) / 2 for f in found if f and f[2] > ts[0] and f[3] < ts[-1])
    half = halves[len(halves) // 2] if halves else 70
    for f in found:
        if not f: continue
        j, nrm, lo, hi = f
        if hi - lo <= half * 2.6: mid = (lo + hi) / 2                        # an ordinary stretch: the middle
        elif abs(lo) < abs(hi): mid = lo + half                               # wide below/beside: keep to the near edge
        else: mid = hi - half
        pos[ids[j]] = pts[j] + nrm * mid
    return half

def even(ids, closed):
    """Re-spread the spaces evenly along the polyline through them (the ends of an open run stay put)."""
    pts = [pos[i] for i in ids] + ([pos[ids[0]]] if closed else [])
    seg = [np.linalg.norm(pts[j + 1] - pts[j]) for j in range(len(pts) - 1)]
    cum = np.concatenate([[0], np.cumsum(seg)]); step = cum[-1] / (len(ids) if closed else len(ids) - 1)
    for t_i, i in enumerate(ids):
        if not closed and t_i in (0, len(ids) - 1): continue
        t = step * t_i; j = min(np.searchsorted(cum, t, side='right') - 1, len(seg) - 1)
        f = (t - cum[j]) / max(seg[j], 1e-6); pos[i] = pts[j] + (pts[j + 1] - pts[j]) * f

def depth_at(p):
    x, y = int(p[0]), int(p[1]); return float(dist[y, x]) if 0 <= x < S and 0 <= y < S else 0.0

loop = []; cur = B['start']
while True:
    loop.append(cur); cur = sp[cur]['next'][0]
    if cur == B['start']: break
for _ in range(3): across(loop, True); even(loop, True)
across(loop, True)
fork = next(s for s in B['spaces'] if len(s['next']) > 1)
short = [fork['id']]; cur = fork['next'][1]
while cur not in loop: short.append(cur); cur = sp[cur]['next'][0]
short.append(cur)
for _ in range(3): even(short, False); across(short[1:-1], False)

depth = {i: depth_at(pos[i]) for i in pos}
out = {i: [round(v, 2) for v in to_w(*pos[i])] for i in pos}
json.dump(out, open(os.path.join(GAME, 'data/boards', board_id + '-fit.json'), 'w'), indent=1)
off = [i for i, d in depth.items() if d < 8]
print(f'{board_id}: {len(out)} spaces fitted; on the path: {len(out) - len(off)}; off it: {off}')
if debug:
    im = img.copy(); d = ImageDraw.Draw(im)
    for i, p in pos.items():
        for n in sp[i]['next']: d.line([tuple(p), tuple(pos[n])], fill=(255, 255, 255), width=5)
    for i, p in pos.items(): d.ellipse([p[0] - 22, p[1] - 22, p[0] + 22, p[1] + 22], fill=(255, 40, 40) if i in off else (40, 120, 255), outline=(0, 0, 0), width=4)
    im.resize((800, 800)).save(debug)
# (pier, round 5: Codex hid the Ghost Train's lower end under its tunnel arch, so c0-c3 were placed by hand in
#  data/boards/pier-fit.json along the painted shortcut. Re-running this overwrites them: put them back.)
