"""Tabard step 3c — line Codex's painting back up with the clay sheet and cut it into per-view pictures.

    python3 tools/align.py <body> <outfit>

In:  ref/<body>/<outfit>.png (Codex), build/<body>_mask.png + build/<body>_views.json (tools/sheet.py)
Out: build/<body>_<outfit>_<view>.png — RGBA, exactly the clay render's frame (same pixels = same place on the body),
     alpha = the body's own outline; build/<body>_<outfit>_align.json (per view: scale and shift that were undone).

Codex usually keeps the figures in place but can drift a few pixels or shrink a figure slightly. Per view, the figure's
box in the painting (anything that differs from the painting's background) is matched to the box in the clay mask
(height decides the scale, the box's middle and the soles decide the shift), and the painting is resampled into the
clay frame. A view whose painted figure is more than 6% off in height is reported (the bake still runs).
"""
import json, os, sys
import numpy as np
from PIL import Image

T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
body, outfit = sys.argv[1], sys.argv[2]
B = os.path.join(T, "build")
meta = json.load(open(os.path.join(B, f"{body}_views.json")))
paint = Image.open(os.path.join(T, "ref", body, f"{outfit}.png")).convert("RGB")
mask = Image.open(os.path.join(B, f"{body}_mask.png"))
if paint.size != mask.size:
    paint = paint.resize(mask.size, Image.LANCZOS)
P = np.asarray(paint).astype(np.int32); M = np.asarray(mask)


def box_of(solid):
    rows = np.nonzero(solid.sum(axis=1) > 2)[0]; cols = np.nonzero(solid.sum(axis=0) > 2)[0]
    return cols[0], rows[0], cols[-1] + 1, rows[-1] + 1


# the painting's background: the median of its four corner patches
corners = np.concatenate([P[:12, :12].reshape(-1, 3), P[:12, -12:].reshape(-1, 3), P[-12:, :12].reshape(-1, 3), P[-12:, -12:].reshape(-1, 3)])
bg = np.median(corners, axis=0)
report = {}
for v, d in meta["views"].items():
    x0, w = d["x"], d["w"]; H = M.shape[0]
    # search a slightly wider strip in the painting (Codex may drift sideways)
    sx0, sx1 = max(0, x0 - 12), min(P.shape[1], x0 + w + 12)
    solid_p = np.abs(P[:, sx0:sx1] - bg).sum(axis=2) > 40
    solid_m = M[:, x0:x0 + w] > 128
    mx0, my0, mx1, my1 = box_of(solid_m)
    px0, py0, px1, py1 = box_of(solid_p); px0 += sx0 - x0; px1 += sx0 - x0
    # painted size / clay size: by height, or by width (--fit-width) when the painter added something on top that is
    # not in the model (a helm's plume) and would make the height lie
    k = (px1 - px0) / (mx1 - mx0) if "--fit-width" in sys.argv else (py1 - py0) / (my1 - my0)
    cxm, cxp = (mx0 + mx1) / 2, (px0 + px1) / 2
    # clay pixel (x, y) -> painting pixel: soles anchor the vertical, box middles the horizontal
    ys = np.arange(H); xs = np.arange(w)
    src_y = py1 + (ys - my1) * k
    src_x = cxp + (xs - cxm) * k + x0
    src_y = np.clip(np.round(src_y).astype(int), 0, P.shape[0] - 1)
    src_x = np.clip(np.round(src_x).astype(int), 0, P.shape[1] - 1)
    rgb = P[src_y][:, src_x].astype(np.uint8)
    # pull the outline in by 3 px: right at the silhouette the painting is often background-tinted
    from PIL import ImageFilter
    alpha = np.asarray(Image.fromarray(M[:, x0:x0 + w]).filter(ImageFilter.MinFilter(7)))
    if "--see-through" in sys.argv:   # props with torn parts: where the painting shows background, it is see-through
        painted = (np.abs(rgb.astype(np.int32) - bg).sum(axis=2) > 30).astype(np.uint8) * 255
        painted = np.asarray(Image.fromarray(painted).filter(ImageFilter.MedianFilter(3)))
        alpha = np.minimum(alpha, painted)
    out = np.dstack([rgb, alpha])
    Image.fromarray(out, "RGBA").save(os.path.join(B, f"{body}_{outfit}_{v}.png"))
    report[v] = {"scale": round(float(k), 4), "shift_x": round(float(cxp - cxm), 1), "shift_soles": round(float(py1 - my1), 1)}
    if abs(k - 1) > 0.06: print(f"WARN {body}/{outfit} {v}: painted figure is {k:.2f}x the clay height")
json.dump(report, open(os.path.join(B, f"{body}_{outfit}_align.json"), "w"), indent=1)
print(body, outfit, report)
