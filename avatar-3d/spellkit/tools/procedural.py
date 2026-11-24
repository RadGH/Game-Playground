#!/usr/bin/env python3
"""Spell Kit: procedural textures (python3 avatar-3d/spellkit/tools/procedural.py).

Makes every texture the kit uses as a white-on-black greyscale .webp in textures/:
  - the three FLIPBOOKS (flame, smoke, burst) — always procedural: an animation needs frames that follow each other,
    which a painter drawing one picture can't promise;
  - a FALLBACK for every Codex texture (rune circles, decals, bands, sparks, flames, smoke). tools/cut-sheets.py then
    overwrites the fallbacks with Codex paintings where a sheet was painted.
Writes textures/manifest.json (cut-sheets.py updates the 'source' of the ones it replaces).
"""
import json, math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'textures')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)
MAN = {}


def save(id_, arr, kind, **extra):
    a = np.clip(arr, 0, 1)
    im = Image.fromarray((a * 255).astype(np.uint8), 'L')
    im.save(os.path.join(OUT, id_ + '.webp'), 'WEBP', quality=88, method=6)
    MAN[id_] = {'file': id_ + '.webp', 'w': im.width, 'h': im.height, 'kind': kind, 'source': 'procedural', **extra}


# ---- value noise (tileable) --------------------------------------------------------------------------------------
def vnoise(w, h, cells, seed, tile=True):
    r = np.random.default_rng(seed)
    gx, gy = cells, max(1, int(cells * h / w))
    g = r.random((gy + 1, gx + 1))
    if tile:
        g[:, -1] = g[:, 0]; g[-1, :] = g[0, :]
    ys = np.linspace(0, gy, h, endpoint=False); xs = np.linspace(0, gx, w, endpoint=False)
    x0 = xs.astype(int); y0 = ys.astype(int)
    fx = xs - x0; fy = ys - y0
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
    a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
    top = a + (b - a) * fx[None, :]; bot = c + (d - c) * fx[None, :]
    return top + (bot - top) * fy[:, None]


def fbm(w, h, base, seed, oct=4, tile=True):
    s = np.zeros((h, w)); amp = 1; tot = 0
    for o in range(oct):
        s += vnoise(w, h, base * 2 ** o, seed + o * 31, tile) * amp; tot += amp; amp *= 0.5
    return s / tot


def grid(n):
    y, x = np.mgrid[0:n, 0:n] / (n - 1) * 2 - 1
    return x, y


# ---- flipbooks (4 x 2 frames of 256) -----------------------------------------------------------------------------
def flipbook(id_, frame_fn, frames=8, cols=4, size=256):
    rows = math.ceil(frames / cols)
    sheet = np.zeros((rows * size, cols * size))
    for i in range(frames):
        f = frame_fn(i / (frames - 1), i)
        r, c = divmod(i, cols)
        sheet[r * size:(r + 1) * size, c * size:(c + 1) * size] = f
    save(id_, sheet, 'flipbook', frames=frames, cols=cols, rows=rows)


N = 256
X, Y = grid(N)
R = np.sqrt(X * X + Y * Y)
NZ = fbm(N, N * 2, 4, 11)          # tall noise scrolled upward for flames
NZ2 = fbm(N, N, 5, 23)


def flame_frame(t, i):
    off = int(t * N * 0.9)
    n = NZ[N - off // 1 if off else N:, :][:N] if False else np.roll(NZ, off, axis=0)[:N]
    yy = (Y + 1) / 2                                   # 0 top .. 1 bottom
    width = 0.55 * (yy ** 0.8) + 0.05
    body = np.clip(1 - np.abs(X) / width, 0, 1)
    shape = body * np.clip(yy * 1.3 - (1 - (0.55 + 0.45 * n)) * 0.9, 0, 1)
    fade = 1 - t * 0.35
    return np.clip(shape * 1.6 * (0.6 + 0.6 * n), 0, 1) ** 1.3 * fade


def smoke_frame(t, i):
    r0 = 0.35 + 0.5 * t
    n = fbm(N, N, 4, 40 + i % 3, tile=False)
    d = R / r0 - (n - 0.5) * 0.7
    puff = np.clip(1 - d, 0, 1) ** 1.2
    return puff * (0.55 + 0.45 * n) * (1 - t) ** 0.8


def burst_frame(t, i):
    r0 = 0.15 + 0.8 * t ** 0.7
    ang = np.arctan2(Y, X)
    rays = 0.5 + 0.5 * np.cos(ang * 9 + NZ2 * 4)
    n = fbm(N, N, 5, 70 + i, tile=False)
    ring = np.exp(-((R - r0 * 0.85) / (0.12 + 0.2 * t)) ** 2)
    core = np.clip(1 - R / (r0 * (1 - t) + 0.05), 0, 1) ** 0.7
    v = core * (1.2 - t) + ring * (0.6 + 0.6 * n) * (1 - t) * 1.3 + rays * np.clip(1 - R / r0, 0, 1) * (1 - t) * 0.5
    return np.clip(v, 0, 1)


flipbook('fx_flame', flame_frame)
flipbook('fx_smoke', smoke_frame)
flipbook('fx_burst', burst_frame)


# ---- particle sprites (256) --------------------------------------------------------------------------------------
def soft_dot():
    return np.clip(1 - R, 0, 1) ** 2.2


def star4():
    core = np.clip(1 - R * 2.2, 0, 1) ** 2
    cross = np.exp(-(X * 14) ** 2) * np.clip(1 - np.abs(Y), 0, 1) ** 3 + np.exp(-(Y * 14) ** 2) * np.clip(1 - np.abs(X), 0, 1) ** 3
    return np.clip(core + cross * 0.9 + soft_dot() * 0.35, 0, 1)


def streak():
    return np.exp(-(Y * 16) ** 2) * np.clip((X + 1) / 2, 0, 1) ** 2.5 * np.clip(1 - np.abs(X) ** 8, 0, 1)


def flame_lick(seed):
    n = fbm(N, N, 4, seed, tile=False)
    yy = (Y + 1) / 2
    lean = (rng.random() - 0.5) * 0.4
    xx = X - lean * (1 - yy)
    width = 0.5 * yy ** 0.9 + 0.04
    body = np.clip(1 - np.abs(xx) / width, 0, 1)
    return np.clip(body * np.clip(yy * 1.4 - (1 - n) * 0.6, 0, 1) * 1.6, 0, 1) ** 1.2


def puff(seed, squash=1.0):
    n = fbm(N, N, 4, seed, tile=False)
    d = np.sqrt(X * X + (Y * squash) ** 2) / 0.8 - (n - 0.5) * 0.6
    return np.clip(1 - d, 0, 1) ** 1.1 * (0.5 + 0.5 * n)


def leaf():
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    d.ellipse([60, 100, 196, 156], fill=230); d.line([60, 128, 196, 128], fill=120, width=4)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(1.5))) / 255


def shard():
    im = Image.new('L', (N, N), 0); d = ImageDraw.Draw(im)
    d.polygon([(128, 20), (150, 128), (128, 236), (106, 128)], fill=200); d.line([128, 20, 128, 236], fill=255, width=3)
    return np.asarray(im.filter(ImageFilter.GaussianBlur(1.2))) / 255


def bolt(seed, size=N):
    r = np.random.default_rng(seed)
    im = Image.new('L', (size, size), 0); d = ImageDraw.Draw(im)
    pts = [(size / 2, 0)]
    for k in range(1, 9):
        pts.append((size / 2 + r.normal(0, size * 0.09), size * k / 8))
    d.line(pts, fill=255, width=5)
    for k in (2, 5):
        x, y = pts[k]; d.line([(x, y), (x + r.normal(0, 40), y + 50)], fill=180, width=3)
    glow = im.filter(ImageFilter.GaussianBlur(7))
    return np.clip(np.asarray(im) / 255 + np.asarray(glow) / 255 * 1.4, 0, 1)


def ring(r0=0.72, w=0.08):
    return np.exp(-((R - r0) / w) ** 2) * (R < 0.98)


save('dot_soft', soft_dot(), 'particle')
save('mote_star', star4(), 'particle')
save('spark_streak', streak(), 'particle')
save('leaf', leaf(), 'particle')
save('shard_ice', shard(), 'particle')
save('bolt_fork', bolt(3), 'particle')
for i in range(6): save(f'flame_{i + 1}', flame_lick(100 + i), 'particle')
for i in range(4): save(f'smoke_{i + 1}', puff(200 + i), 'particle')
save('cloud_poison', puff(300, 0.9), 'particle')
save('dust_1', puff(310, 2.2) * np.clip((Y + 1), 0, 1), 'particle')
save('burst_star', np.clip(soft_dot() * 1.2 + (0.5 + 0.5 * np.cos(np.arctan2(Y, X) * 8)) ** 6 * np.clip(1 - R, 0, 1) ** 1.5, 0, 1), 'particle')
save('ring_shock', np.clip(ring(0.7, 0.09) * 1.2 + np.exp(-((R - 0.6) / 0.2) ** 2) * 0.3, 0, 1), 'particle')


# ---- rune circles + decals (512) ---------------------------------------------------------------------------------
S = 512
GLYPH = {
    'fire': 'tri', 'frost': 'flake', 'holy': 'rays', 'nature': 'leafy', 'arcane': 'star8', 'shadow': 'thorn',
    'lightning': 'zig', 'poison': 'drop', 'summon': 'penta',
}


def rune_circle(school, seed):
    r = np.random.default_rng(seed)
    im = Image.new('L', (S, S), 0); d = ImageDraw.Draw(im)
    c = S / 2
    for rad, wd in ((240, 6), (222, 3), (160, 4), (148, 2)):
        d.ellipse([c - rad, c - rad, c + rad, c + rad], outline=255, width=wd)
    n = 24
    for k in range(n):                                    # glyphs between the outer rings
        a = k / n * 2 * math.pi; x, y = c + math.cos(a) * 191, c + math.sin(a) * 191
        g = r.integers(0, 4)
        if g == 0: d.line([x - 8, y - 8, x + 8, y + 8], fill=230, width=3); d.line([x - 8, y + 8, x, y], fill=230, width=3)
        elif g == 1: d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=230, width=3)
        elif g == 2: d.line([x - 9, y, x + 9, y], fill=230, width=3); d.line([x, y - 9, x, y + 9], fill=230, width=2)
        else: d.polygon([(x, y - 9), (x + 8, y + 7), (x - 8, y + 7)], outline=230)
    kind = GLYPH[school]
    if kind in ('star8', 'penta', 'flake', 'rays', 'tri'):
        pts = {'star8': 8, 'penta': 5, 'flake': 6, 'rays': 16, 'tri': 3}[kind]
        for k in range(pts):
            a = k / pts * 2 * math.pi - math.pi / 2
            if kind == 'rays':
                d.line([c + math.cos(a) * 30, c + math.sin(a) * 30, c + math.cos(a) * 140, c + math.sin(a) * 140], fill=200, width=3)
            else:
                step = 2 if kind == 'penta' else (3 if kind == 'star8' else 1)
                b = (k + step) / pts * 2 * math.pi - math.pi / 2
                d.line([c + math.cos(a) * 146, c + math.sin(a) * 146, c + math.cos(b) * 146, c + math.sin(b) * 146], fill=220, width=4)
                if kind == 'flake':
                    d.line([c, c, c + math.cos(a) * 140, c + math.sin(a) * 140], fill=220, width=4)
    elif kind == 'thorn':
        for k in range(14):
            a = k / 14 * 2 * math.pi
            d.polygon([(c + math.cos(a - 0.08) * 148, c + math.sin(a - 0.08) * 148), (c + math.cos(a + 0.08) * 148, c + math.sin(a + 0.08) * 148), (c + math.cos(a) * 90, c + math.sin(a) * 90)], fill=220)
    elif kind == 'zig':
        for k in range(6):
            a = k / 6 * 2 * math.pi; pts = []
            for j in range(6):
                rr = 20 + j * 24; aa = a + (0.12 if j % 2 else -0.12)
                pts.append((c + math.cos(aa) * rr, c + math.sin(aa) * rr))
            d.line(pts, fill=230, width=4)
    elif kind == 'leafy':
        for k in range(8):
            a = k / 8 * 2 * math.pi
            for j in range(5):
                rr = 40 + j * 22; d.ellipse([c + math.cos(a + j * 0.2) * rr - 8, c + math.sin(a + j * 0.2) * rr - 5, c + math.cos(a + j * 0.2) * rr + 8, c + math.sin(a + j * 0.2) * rr + 5], fill=200)
    elif kind == 'drop':
        for k in range(10):
            a = k / 10 * 2 * math.pi; x, y = c + math.cos(a) * 110, c + math.sin(a) * 110
            d.ellipse([x - 12, y - 12, x + 12, y + 12], outline=220, width=3)
    d.ellipse([c - 22, c - 22, c + 22, c + 22], outline=255, width=4)
    a = np.asarray(im) / 255
    glow = np.asarray(im.filter(ImageFilter.GaussianBlur(6))) / 255
    return np.clip(a + glow * 0.9, 0, 1)


for i, s in enumerate(['fire', 'frost', 'holy', 'nature', 'arcane', 'shadow', 'lightning', 'poison', 'summon']):
    save('rune_' + s, rune_circle(s, 400 + i), 'rune')

xs, ys = grid(S)
RS = np.sqrt(xs ** 2 + ys ** 2)
ANG = np.arctan2(ys, xs)
n1 = fbm(S, S, 6, 501, tile=False)
save('ring_reticle', np.clip(np.exp(-((RS - 0.93) / 0.025) ** 2) + (np.abs(np.sin(ANG * 24)) > 0.97) * (np.abs(RS - 0.86) < 0.04) * 0.8, 0, 1), 'rune')
save('scorch', np.clip((1 - RS / (0.7 + 0.25 * n1)) * 1.3, 0, 1) ** 0.8 * (0.6 + 0.4 * n1) * (0.85 + 0.15 * np.cos(ANG * 13 + n1 * 6)), 'decal')
save('frost_patch', np.clip((1 - RS / (0.65 + 0.3 * n1)), 0, 1) ** 0.6 * (0.4 + 0.6 * (np.abs(np.sin(ANG * 6 + RS * 9)) ** 4 + n1 * 0.5)), 'decal')
save('crack_ground', np.clip((np.abs(np.sin(ANG * 7 + n1 * 5)) > 0.96) * np.clip(1 - RS, 0, 1) * 1.5 + np.clip(1 - RS * 3, 0, 1), 0, 1), 'decal')
save('splat_poison', np.clip((1 - RS / (0.55 + 0.35 * n1)) * 2, 0, 1) * (0.7 + 0.3 * n1), 'decal')
save('stain_shadow', np.clip((1 - RS / (0.5 + 0.45 * n1 * (0.6 + 0.4 * np.cos(ANG * 5)))) * 1.6, 0, 1) ** 0.9, 'decal')
save('glow_holy', np.clip(np.clip(1 - RS, 0, 1) ** 1.5 * (0.7 + 0.3 * (0.5 + 0.5 * np.cos(ANG * 24))), 0, 1), 'decal')


# ---- cylinder bands (1024 x 256, repeat left-right) --------------------------------------------------------------
BW, BH = 1024, 256
by = np.linspace(0, 1, BH)[:, None]                       # 0 top .. 1 bottom
nb = fbm(BW, BH, 16, 601)
rays = fbm(BW, 8, 48, 602)[0:1, :]
save('band_light', np.clip((by ** 1.6) * (0.3 + 1.2 * rays ** 2) + (by > 0.92) * 0.6, 0, 1), 'band')
save('band_flame', np.clip(by * 1.5 - (1 - nb) * 0.9, 0, 1) ** 0.9, 'band')
runes = np.zeros((BH, BW)); im = Image.new('L', (BW, BH), 0); d = ImageDraw.Draw(im)
d.line([0, 80, BW, 80], fill=220, width=3); d.line([0, 176, BW, 176], fill=220, width=3)
r2 = np.random.default_rng(9)
for k in range(16):
    x = k * 64 + 32
    for _ in range(3):
        d.line([x + r2.integers(-16, 16), 100 + r2.integers(0, 20), x + r2.integers(-16, 16), 140 + r2.integers(0, 20)], fill=255, width=4)
img = np.asarray(im) / 255; glow = np.asarray(im.filter(ImageFilter.GaussianBlur(5))) / 255
save('band_runes', np.clip(img + glow, 0, 1), 'band')
save('band_mist', np.clip(fbm(BW, BH, 6, 610) * 1.6 - 0.4, 0, 1) * np.sin(by * math.pi), 'band')

with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
    json.dump({'_doc': 'Spell Kit textures: white-on-black greyscale (brightness = see-through + glow). source codex = painted by Codex (tools/codex-sheets.mjs + cut-sheets.py), procedural = tools/procedural.py.', 'textures': MAN}, f, indent=1)
print(f'{len(MAN)} procedural textures written to textures/')
