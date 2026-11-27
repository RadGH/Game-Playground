#!/usr/bin/env python3
"""House Kit: build the texture atlas from the Codex paintings.

    python3 housekit/tools/build-atlas.py

For every texture in tools/textures.json: take ref/<id>/painted.png (Codex) — or, if Codex has not painted it yet, a
plain stand-in (printed as MISSING so it is never mistaken for finished art) — make it repeat without a seam (the
half-offset blend, only where its own edges do not already meet), shrink it into its atlas square and wrap a gutter of
its own pixels round it so mipmaps never bleed into a neighbour. Writes textures/atlas.webp (2048), textures/atlas-1024.webp
(phones on Low) and data/atlas.json (each texture's rectangle, metres per repeat, how it is laid on).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SPEC = json.load(open(os.path.join(ROOT, 'tools', 'textures.json')))
SIZE, SLOT, GUT = 2048, 512, 32
LIGHT = {'plaster': 0.86, 'cloth': 0.88}          # these are tinted per house: keep them light and even


def standin(id_, n):
    """A flat stand-in so the kit runs before Codex has painted a texture (never shipped as art)."""
    rnd = np.random.default_rng(abs(hash(id_)) % 2**32)
    base = {'plaster': (235, 225, 205), 'timber': (140, 100, 62), 'planks': (150, 110, 70), 'stone': (170, 160, 145),
            'fieldstone': (140, 135, 125), 'shingles': (125, 90, 60), 'slate': (95, 105, 120), 'clay': (180, 85, 60),
            'thatch': (200, 160, 80), 'cobbles': (140, 135, 125), 'door': (100, 55, 40), 'window': (110, 150, 150),
            'ivy': (70, 120, 50), 'flowers': (180, 90, 120), 'signs': (150, 110, 70), 'iron': (70, 72, 78),
            'cloth': (230, 222, 205)}.get(id_, (128, 128, 128))
    a = np.ones((n, n, 3)) * np.array(base) / 255
    a *= (0.9 + 0.1 * rnd.random((n, n, 1)))
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def seam_error(a, axis):
    if axis == 1: return float(np.abs(a[:, 0] - a[:, -1]).mean())
    return float(np.abs(a[0] - a[-1]).mean())


def make_seamless(a, x=True, y=True):
    """blend with a copy rolled by half, using the roll only near the edges (where the original would seam)"""
    h, w, _ = a.shape
    out = a.copy()
    if x and seam_error(a, 1) > 0.035:
        r = np.roll(a, w // 2, axis=1)
        t = np.abs(np.linspace(-1, 1, w))                       # 1 at the edges, 0 in the middle
        m = np.clip((t - 0.55) / 0.45, 0, 1)[None, :, None] ** 1.5
        out = out * (1 - m) + r * m
    if y and seam_error(out, 0) > 0.035:
        r = np.roll(out, h // 2, axis=0)
        t = np.abs(np.linspace(-1, 1, h))
        m = np.clip((t - 0.55) / 0.45, 0, 1)[:, None, None] ** 1.5
        out = out * (1 - m) + r * m
    return out


def main():
    atlas = np.zeros((SIZE, SIZE, 3), np.float32)
    meta = {'_doc': 'written by tools/build-atlas.py — do not edit by hand. rect = [u, v, w, h] of the painted area as fractions of the atlas (v 0 = top row); metres = world size of one repeat.',
            'file': 'atlas.webp', 'small': 'atlas-1024.webp', 'size': SIZE, 'slot': SLOT, 'gutter': GUT, 'tiles': {}, 'missing': []}
    for id_, t in SPEC['textures'].items():
        slot = t['slot']
        sub = len(slot) == 3
        cell = SLOT // 2 if sub else SLOT
        n = cell - 2 * GUT
        x0 = slot[0] * SLOT + ((slot[2] % 2) * cell if sub else 0)
        y0 = slot[1] * SLOT + ((slot[2] // 2) * cell if sub else 0)
        p = os.path.join(ROOT, 'ref', t.get('from', id_), 'painted.png')
        if not os.path.exists(p): p = p[:-4] + '.webp'          # (kept in git as webp)
        if os.path.exists(p) and os.path.getsize(p) > 1000:
            im = Image.open(p).convert('RGB'); src = 'codex'
        else:
            im = standin(id_, n); src = 'stand-in'; meta['missing'].append(id_)
        if t['tile'] == 'cells':
            im = im.resize((n, n), Image.LANCZOS)
            a = np.asarray(im).astype(np.float32) / 255
            pad = np.pad(a, ((GUT, GUT), (GUT, GUT), (0, 0)), mode='edge')
        else:
            # square crop of the middle, shrink, then seam-fix at the final size
            w, h = im.size; s = min(w, h)
            im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((n, n), Image.LANCZOS)
            a = np.asarray(im).astype(np.float32) / 255
            a = make_seamless(a, x=True, y=t['tile'] == 'wrap')
            if t.get('sat') or t.get('gain'):                    # calm a loud painting down (Codex woods come out very orange)
                g = a.mean(axis=2, keepdims=True)
                a = np.clip((g + (a - g) * t.get('sat', 1)) * t.get('gain', 1), 0, 1)
            if t.get('light'):                                  # a derived, paintable copy: grey, light, contrast kept
                g = a.mean(axis=2, keepdims=True)
                g = (g - g.mean()) * 1.15 + t['light']
                a = np.clip(np.repeat(g, 3, axis=2), 0, 1)
            if id_ in LIGHT:
                m = a.mean()
                a = np.clip(a * (LIGHT[id_] / max(m, 0.05)), 0, 1)
                # even the big blotches out a little (a tinted wall should read as one colour)
                lum = a.mean(axis=2, keepdims=True)
                blur = np.asarray(Image.fromarray((lum[:, :, 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(n / 10))).astype(np.float32)[:, :, None] / 255
                a = np.clip(a - (blur - lum.mean()) * 0.5, 0, 1)
            mode = 'wrap' if t['tile'] == 'wrap' else None
            if mode:
                pad = np.pad(a, ((GUT, GUT), (GUT, GUT), (0, 0)), mode='wrap')
            else:   # band: wraps along x, its top/bottom borders are its own
                pad = np.pad(a, ((0, 0), (GUT, GUT), (0, 0)), mode='wrap')
                pad = np.pad(pad, ((GUT, GUT), (0, 0), (0, 0)), mode='edge')
        atlas[y0:y0 + cell, x0:x0 + cell] = pad
        meta['tiles'][id_] = {'rect': [round((x0 + GUT) / SIZE, 6), round((y0 + GUT) / SIZE, 6), round(n / SIZE, 6), round(n / SIZE, 6)],
                              'metres': t.get('metres', 1), 'tile': t['tile'], 'source': src, **({'cells': t['cells']} if 'cells' in t else {})}
        print(f'{id_:11s} {src:9s} slot {slot}')
    img = Image.fromarray((np.clip(atlas, 0, 1) * 255).astype(np.uint8))
    os.makedirs(os.path.join(ROOT, 'textures'), exist_ok=True)
    img.save(os.path.join(ROOT, 'textures', 'atlas.webp'), 'WEBP', quality=90, method=6)
    img.resize((SIZE // 2, SIZE // 2), Image.LANCZOS).save(os.path.join(ROOT, 'textures', 'atlas-1024.webp'), 'WEBP', quality=88, method=6)
    json.dump(meta, open(os.path.join(ROOT, 'data', 'atlas.json'), 'w'), indent=1)
    if meta['missing']: print('MISSING (stand-ins, run tools/codex-textures.mjs):', ' '.join(meta['missing']))


if __name__ == '__main__':
    main()
