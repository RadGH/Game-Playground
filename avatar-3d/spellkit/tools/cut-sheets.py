#!/usr/bin/env python3
"""Spell Kit: cut the Codex sheets (ref/<sheet>/painted.png) into textures/*.webp and mark them 'codex' in the manifest.

    python3 avatar-3d/spellkit/tools/cut-sheets.py [sheet…]

Run tools/procedural.py first (it writes the manifest and the fallbacks). Each cell becomes greyscale (brightest
channel), the black floor is lifted to pure black, a soft round mask hides anything near the cell edge, and the item is
re-centred on its brightness. Particles are 256², rune circles and decals 512², bands 1024x256 with the ends cross-faded
so the band repeats round a cylinder without a seam.
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'textures')
SHEETS = json.load(open(os.path.join(ROOT, 'tools', 'sheets.json')))['sheets']
MANP = os.path.join(OUT, 'manifest.json')
MAN = json.load(open(MANP))
KIND = lambda id_: ('rune' if id_.startswith(('rune_', 'ring_reticle')) else
                    'decal' if id_ in ('scorch', 'frost_patch', 'crack_ground', 'splat_poison', 'stain_shadow', 'glow_holy') else
                    'band' if id_.startswith('band_') else 'particle')
SIZE = {'rune': 512, 'decal': 512, 'particle': 256}


def grey(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255
    return a.max(axis=2)


def clean(a, floor=0.06):
    return np.clip((a - floor) / (1 - floor), 0, 1)


def recentre(a):
    h, w = a.shape
    tot = a.sum()
    if tot < 1: return a
    ys, xs = np.mgrid[0:h, 0:w]
    cy, cx = (a * ys).sum() / tot, (a * xs).sum() / tot
    dy, dx = int(round(h / 2 - cy)), int(round(w / 2 - cx))
    dy, dx = max(-h // 8, min(h // 8, dy)), max(-w // 8, min(w // 8, dx))
    return np.roll(np.roll(a, dy, axis=0), dx, axis=1)


def fit(a, thr=0.05, margin=0.04):
    """crop to the painted item's bounds (as a square round its middle), with a small black margin"""
    ys, xs = np.where(a > thr)
    if not len(xs): return a
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    half = max(y1 - y0, x1 - x0) / 2 * (1 + margin * 2) + 2
    h, w = a.shape
    out = np.zeros((int(half * 2), int(half * 2)), np.float32)
    sy, sx = int(cy - half), int(cx - half)
    for yy in range(out.shape[0]):
        y = sy + yy
        if 0 <= y < h:
            lo, hi = max(0, sx), min(w, sx + out.shape[1])
            if hi > lo: out[yy, lo - sx:hi - sx] = a[y, lo:hi]
    return out


def round_mask(n, inner=0.86):
    y, x = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    r = np.sqrt(x * x + y * y)
    return np.clip((1 - r) / (1 - inner), 0, 1)


def save(id_, a, source='codex'):
    im = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8), 'L')
    im.save(os.path.join(OUT, id_ + '.webp'), 'WEBP', quality=88, method=6)
    prev = MAN['textures'].get(id_, {})
    MAN['textures'][id_] = {**prev, 'file': id_ + '.webp', 'w': im.width, 'h': im.height, 'kind': prev.get('kind', KIND(id_)), 'source': source}


want = sys.argv[1:] or list(SHEETS)
for sid in want:
    p = os.path.join(ROOT, 'ref', sid, 'painted.png')
    if not os.path.exists(p):
        print(f'{sid}: not painted yet — keeping the procedural fallbacks'); continue
    sheet = Image.open(p).convert('RGB').resize((1536, 1024), Image.LANCZOS)
    spec = SHEETS[sid]
    for i, (id_, _) in enumerate(spec['items']):
        kind = KIND(id_)
        if spec['layout'] == 'cells':
            r, c = divmod(i, 3)
            cell = sheet.crop((c * 512, r * 512, c * 512 + 512, r * 512 + 512))
            a = clean(grey(cell))
            # a soft fade at the cell's own edge first (anything from a neighbour square), then trim to the item
            e = np.minimum.outer(np.minimum(np.arange(512), 511 - np.arange(512)), np.minimum(np.arange(512), 511 - np.arange(512)))
            a = a * np.clip(e / 16, 0, 1)
            a = fit(a)
            if kind in ('rune', 'decal'):
                a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((512, 512), Image.LANCZOS)) / 255
                a = a * round_mask(512, 0.9)
            n = SIZE[kind]
            a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((n, n), Image.LANCZOS)) / 255
            save(id_, a)
        else:
            strip = sheet.crop((0, i * 256, 1536, i * 256 + 256)).resize((1024, 256), Image.LANCZOS)
            a = clean(grey(strip))
            f = 160                                                    # cross-fade the ends so it repeats
            w = np.linspace(0, 1, f)[None, :]
            head, tail = a[:, :f].copy(), a[:, -f:].copy()
            a[:, :f] = head * w + tail * (1 - w)
            a = a[:, : 1024 - f]
            a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((1024, 256), Image.LANCZOS)) / 255
            # soften the very top/bottom rows
            yv = np.linspace(0, 1, 256)[:, None]
            a = a * np.clip(np.minimum(yv, 1 - yv) / 0.04, 0, 1)
            save(id_, a)
    print(f'{sid}: {len(spec["items"])} textures cut')

json.dump(MAN, open(MANP, 'w'), indent=1)
n = sum(1 for t in MAN['textures'].values() if t['source'] == 'codex')
print(f'manifest: {n} codex, {len(MAN["textures"]) - n} procedural')


# ---- painted flipbooks: animate a Codex painting by warping it frame by frame (flicker for flames, billow for smoke)
def warp(a, dx, dy):
    h, w = a.shape
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)
    sx = np.clip(xs + dx, 0, w - 1).astype(int); sy = np.clip(ys + dy, 0, h - 1).astype(int)
    return a[sy, sx]


def noise2(h, w, cells, seed):
    r = np.random.default_rng(seed)
    g = r.random((cells + 1, cells + 1)).astype(np.float32)
    im = Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(im).astype(np.float32) / 255 - 0.5


def painted_flipbook(id_, src_id, frame_fn, frames=8, cols=4):
    src = np.asarray(Image.open(os.path.join(OUT, MAN['textures'][src_id]['file'])).convert('L')).astype(np.float32) / 255
    n = src.shape[0]
    sheet = np.zeros((2 * n, cols * n), np.float32)
    for i in range(frames):
        r, c = divmod(i, cols)
        sheet[r * n:(r + 1) * n, c * n:(c + 1) * n] = np.clip(frame_fn(src, i / (frames - 1), i), 0, 1)
    im = Image.fromarray((sheet * 255).astype(np.uint8), 'L')
    im.save(os.path.join(OUT, id_ + '.webp'), 'WEBP', quality=88, method=6)
    MAN['textures'][id_] = {'file': id_ + '.webp', 'w': im.width, 'h': im.height, 'kind': 'flipbook', 'source': 'codex', 'frames': frames, 'cols': cols, 'rows': 2,
                            'note': 'frames warped from the Codex painting ' + src_id}


def flame_frame(src, t, i):
    n = src.shape[0]
    ys = np.linspace(0, 1, n)[:, None].astype(np.float32)          # 0 top .. 1 bottom
    nz = noise2(n, n, 5, 900 + i)
    dx = nz * 26 * (1 - ys)                                      # tips sway, base stays
    dy = noise2(n, n, 4, 950 + i) * 18 * (1 - ys) - t * 30 * (1 - ys)   # licks stretch upward as they live
    a = warp(src, dx, dy)
    return a * (1.05 - 0.55 * t)


def smoke_frame(src, t, i):
    n = src.shape[0]
    s = 0.55 + 0.45 * t                                          # grows
    im = Image.fromarray((src * 255).astype(np.uint8)).resize((max(8, int(n * s)), max(8, int(n * s))), Image.LANCZOS)
    a = np.zeros_like(src); o = (n - im.width) // 2
    a[o:o + im.height, o:o + im.width] = np.asarray(im) / 255
    a = warp(a, noise2(n, n, 4, 1000 + i) * 14, noise2(n, n, 4, 1050 + i) * 14 - t * 10)
    return a * (1 - t) ** 0.7


if MAN['textures'].get('flame_5', {}).get('source') == 'codex':
    painted_flipbook('fx_flame', 'flame_5', flame_frame); print('fx_flame: painted flipbook from flame_5')
if MAN['textures'].get('smoke_3', {}).get('source') == 'codex':
    painted_flipbook('fx_smoke', 'smoke_3', smoke_frame); print('fx_smoke: painted flipbook from smoke_3')
json.dump(MAN, open(MANP, 'w'), indent=1)


def burst_frame(src, t, i):
    """painted burst: the Codex starburst growing and spinning out while the Codex shock ring races outward"""
    n = src.shape[0]
    ring = np.asarray(Image.open(os.path.join(OUT, MAN['textures']['ring_shock']['file'])).convert('L').resize((n, n))).astype(np.float32) / 255
    def scaled(a, s, rot=0):
        im = Image.fromarray((a * 255).astype(np.uint8)).rotate(rot, resample=Image.BICUBIC)
        m = max(8, int(n * s)); im = im.resize((m, m), Image.LANCZOS)
        out = np.zeros((n, n), np.float32)
        if m <= n:
            o = (n - m) // 2; out[o:o + m, o:o + m] = np.asarray(im) / 255
        else:
            o = (m - n) // 2; out = np.asarray(im)[o:o + n, o:o + n].astype(np.float32) / 255
        return out
    star = scaled(src, 0.55 + 0.5 * t, rot=t * 25) * (1 - t) ** 1.3
    rg = scaled(ring, 0.35 + 0.65 * t ** 0.7) * (1 - t) ** 0.8 * 0.9
    puffs = warp(scaled(src, 0.4 + 0.4 * t), noise2(n, n, 6, 1200 + i) * 20, noise2(n, n, 6, 1250 + i) * 20) * 0.35 * (1 - t)
    return np.clip(star + rg + puffs, 0, 1)


if MAN['textures'].get('burst_star', {}).get('source') == 'codex':
    painted_flipbook('fx_burst', 'burst_star', burst_frame); print('fx_burst: painted flipbook from burst_star + ring_shock')
json.dump(MAN, open(MANP, 'w'), indent=1)
