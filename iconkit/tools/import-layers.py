#!/usr/bin/env python3
"""Icon Kit — import painted layer PNGs (Codex) into iconkit/layers/codex/ and wire them into the data files.

    python3 -I iconkit/tools/import-layers.py <folder with frame-*.png plate-*.png glyph-*.png glow-*.png> [--dry]
    python3 -I iconkit/tools/import-layers.py <r3 batch folder with rows.json> [--dry] [--force]
    python3 -I iconkit/tools/import-layers.py <folder holding several batch folders>          (every sub-folder with rows.json)

A batch folder (round 3) has rows.json listing the files it should hold. Files not painted yet are skipped; run it again
as batches land: a picture already imported (its WebP newer than the PNG) is skipped unless --force, and rows are
updated in place by id, never duplicated. Row kinds, by id:
  * '<element>-<mechanic>' (matrix): a glyphs.json row with element + mechanic (+ artElement: its painted colour);
  * 'spell-<slug>': a glyphs.json row with `spells: [name]` — iconFor gives it to that spell (by name) and no other;
  * 'item-<base>': a data/items.json row (its drawn stand-in stays as the placeholder);
  * frame-item-square.png / frame-item-circle.png: the item frames (their opening is measured).

For every picture:
  * a #FF00FF magenta background is keyed out (only when the picture has no real transparency);
  * the visible art is found (alpha bounding box) and moved to the exact centre — painted art is never quite centred;
  * frames are scaled so their outer edge fills 96% of the canvas, and the opening inside is MEASURED (written to
    data/layers.json `inner`); plates are scaled to sit just under that opening; glows keep their size, centred;
  * glyphs are centred and scaled so their art fills 92% of the canvas, then a per-shape `fit` is stored in
    data/glyphs.json: the scale that puts the glyph's art inside ~78% of a circle frame's opening (its farthest pixel
    from the centre, and its width/height) and ~80% of a square frame's opening. The kit draws the glyph at that
    scale and clips glyph + glow to the plate, so nothing runs under the frame.
Writes <name>-256.webp and <name>-64.webp. The SVG placeholders stay as the fallback set.
"""
import json, math, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'layers' / 'codex'
CANVAS = 1024
FRAME_FILL = 0.96        # frame outer edge, share of the canvas
PLATE_OVERLAP = 0.02     # plate radius = frame opening + this (tucks under the ring)
GLYPH_FILL = 0.92        # glyph art's larger side, share of the canvas, before the per-shape fit
FIT = {'circle': 0.78, 'square': 0.80}
FAR = 0.92               # no visible pixel farther from the centre than this share of a circle's opening (the kit clips the rest)


def load(path):
    im = Image.open(path).convert('RGBA')
    lo, _ = im.getchannel('A').getextrema()
    if lo == 255:  # no transparency at all: key out magenta
        px = im.load()
        for y in range(im.height):
            for x in range(im.width):
                r, g, b, a = px[x, y]
                if r > 200 and b > 200 and g < 80:
                    px[x, y] = (0, 0, 0, 0)
        print(f'  {path.name}: keyed out magenta')
    return im


def bbox(im, thresh=16):
    return im.getchannel('A').point(lambda v: 255 if v > thresh else 0).getbbox()


def recentre(im, fill, tag):
    """Crop to the visible art, scale its larger side to `fill` of the canvas, paste centred."""
    b = bbox(im)
    w, h = b[2] - b[0], b[3] - b[1]
    off = ((b[0] + b[2]) / 2 - im.width / 2, (b[1] + b[3]) / 2 - im.height / 2)
    print(f'  {tag}: art {w}x{h}, was off centre by {off[0]:+.0f},{off[1]:+.0f} px')
    s = fill * CANVAS / max(w, h)
    art = im.crop(b).resize((max(1, round(w * s)), max(1, round(h * s))), Image.LANCZOS)
    out = Image.new('RGBA', (CANVAS, CANVAS))
    out.alpha_composite(art, ((CANVAS - art.width) // 2, (CANVAS - art.height) // 2))
    return out


def opening(frame, shape):
    """Distance from the centre to the frame's inner edge, as a share of the canvas (median over many rays)."""
    a = frame.getchannel('A').load()
    c = CANVAS / 2
    angles = [i * math.pi / 32 for i in range(64)] if shape == 'circle' else [0, math.pi / 2, math.pi, 3 * math.pi / 2]
    found = []
    for ang in angles:
        for r in range(4, CANVAS // 2):
            x, y = int(c + math.cos(ang) * r), int(c + math.sin(ang) * r)
            if a[x, y] > 128:
                found.append(r)
                break
    if shape == 'square':  # also walk at 30% / 70% along each side to dodge the middle studs
        for t in (0.3, 0.7):
            for (dx, dy, fx, fy) in ((1, 0, None, t), (-1, 0, None, t), (0, 1, t, None), (0, -1, t, None)):
                x0 = c if fx is None else fx * CANVAS
                y0 = c if fy is None else fy * CANVAS
                for r in range(4, CANVAS // 2):
                    if a[int(x0 + dx * r), int(y0 + dy * r)] > 128:
                        found.append(r)
                        break
    found.sort()
    return found[len(found) // 2] / CANVAS


LINE_THICKNESS = {'thin': (0.02, 0.05), 'hairline': (0.006, 0.02)}   # ring thickness a line frame must measure (share of the width)


def ring_thickness(frame):
    """How thick the ring is: the first solid run met walking in from each edge along the middle lines (median)."""
    a, n, runs = frame.getchannel('A').load(), CANVAS, []
    for t in (0.5,):
        line = int(n * t)
        for path in ([(x, line) for x in range(n)], [(x, line) for x in range(n - 1, -1, -1)], [(line, y) for y in range(n)], [(line, y) for y in range(n - 1, -1, -1)]):
            vals = [a[x, y] > 128 for x, y in path]
            if True not in vals:
                continue
            i = vals.index(True)
            j = vals.index(False, i) if False in vals[i:] else len(vals)
            runs.append((j - i) / n)
    runs.sort()
    return runs[len(runs) // 2] if runs else 0


def glyph_fit(g, inner):
    """Scale for one shape so the art sits inside FIT of the opening."""
    a = g.getchannel('A')
    b = a.getbbox()
    w, h = (b[2] - b[0]) / CANVAS, (b[3] - b[1]) / CANVAS
    # farthest visible pixel from the centre (sampled), so a round frame never cuts a corner of the art
    px, c, far = a.load(), CANVAS / 2, 0
    for y in range(b[1], b[3], 4):
        for x in range(b[0], b[2], 4):
            if px[x, y] > 96:
                far = max(far, math.hypot(x - c, y - c))
    far /= CANVAS
    circle = min(FAR * inner['circle'] / far, FIT['circle'] * 2 * inner['circle'] / max(w, h))
    square = FIT['square'] * 2 * inner['square'] / max(w, h)
    return {'circle': round(min(circle, 1.2), 3), 'square': round(min(square, 1.2), 3)}


def save(im, name, dry):
    if dry:
        return
    OUT.mkdir(parents=True, exist_ok=True)
    im.resize((256, 256), Image.LANCZOS).save(OUT / f'{name}-256.webp', 'WEBP', quality=88, method=6)
    im.resize((64, 64), Image.LANCZOS).save(OUT / f'{name}-64.webp', 'WEBP', quality=90, method=6)


def rel(name, size):
    return f'layers/codex/{name}-{size}.webp'


def fresh(png, name, force):
    """True when this picture was already imported and the PNG has not changed since (safe re-runs)."""
    out = OUT / f'{name}-256.webp'
    return not force and out.exists() and out.stat().st_mtime >= png.stat().st_mtime


def title(s):
    return ' '.join(w.capitalize() for w in s.replace('_', ' ').replace('-', ' ').split())


def import_rows(src, rows, glyphs, items, inner, dry, force):
    """One round-3 batch folder: every row whose file exists. Returns (imported, skipped as fresh, missing)."""
    gby = {g['id']: g for g in glyphs['glyphs']}
    iby = {r['id']: r for r in items['items']}
    done = fresh_n = missing = 0
    for r in rows:
        rid, f = r['id'], src / r['file']
        if not f.exists():   # not painted yet: no row either (a row without a picture would be picked and draw nothing)
            missing += 1
            continue
        if rid.startswith('item-'):
            row = iby.get(rid)
            if row is None:
                row = {'id': rid, 'base': r.get('base') or rid[5:].replace('-', '_'), 'name': title(r.get('base') or rid[5:]), 'slot': None, 'subtype': None, 'shape': 'square'}
                items['items'].append(row)
                iby[rid] = row
            name = rid
        else:
            row = gby.get(rid)
            if row is None:
                spell = rid.startswith('spell-')
                el = {'ice': 'frost'}.get(r.get('element'), r.get('element'))   # games call it ice, the kit frost
                row = {'id': rid, 'name': r.get('name') or title(rid), 'element': el, 'mechanic': r.get('mechanic') or 'strike',
                       'tintable': False, 'artElement': el, 'tags': []}
                if spell:
                    row['spells'] = [r.get('name') or title(rid[6:])]
                    if r.get('cls'):
                        row['cls'] = r['cls']
                glyphs['glyphs'].append(row)
                gby[rid] = row
            name = f'glyph-{rid}'
        if fresh(f, name, force) and row.get('file'):
            fresh_n += 1
            continue
        g = recentre(load(f), GLYPH_FILL, f.name)
        row['fit'] = glyph_fit(g, inner)
        save(g, name, dry)
        row.update(file=rel(name, 256), small=rel(name, 64))
        done += 1
    return done, fresh_n, missing


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src, dry, force = Path(sys.argv[1]), '--dry' in sys.argv, '--force' in sys.argv
    layers = json.loads((ROOT / 'data/layers.json').read_text())
    glyphs = json.loads((ROOT / 'data/glyphs.json').read_text())
    items_path = ROOT / 'data/items.json'
    items = json.loads(items_path.read_text()) if items_path.exists() else {'items': []}
    batches = [src] if (src / 'rows.json').exists() else sorted(p for p in src.iterdir() if p.is_dir() and (p / 'rows.json').exists())
    if batches:
        ref = {s: layers.get('glyphRef', {}).get(s) or layers['frames']['gold'][s]['inner'] for s in ('circle', 'square')}
        total = [0, 0, 0]
        for b in batches:
            rows = json.loads((b / 'rows.json').read_text())
            for shape in ('circle', 'square'):   # the item frames ride in a batch folder too
                f = b / f'frame-item-{shape}.png'
                if f.exists() and 'item' in layers['frames'] and not (fresh(f, f'frame-item-{shape}', force) and layers['frames']['item'][shape].get('file')):
                    fr = recentre(load(f), FRAME_FILL, f.name)
                    op = opening(fr, shape)
                    print(f'  {f.name}: opening {op:.3f} of the canvas')
                    save(fr, f'frame-item-{shape}', dry)
                    layers['frames']['item'][shape].update(file=rel(f'frame-item-{shape}', 256), small=rel(f'frame-item-{shape}', 64), inner=round(op, 4))
            n = import_rows(b, rows, glyphs, items, ref, dry, force)
            print(f'{b.name}: {n[0]} imported, {n[1]} already imported, {n[2]} not painted yet (of {len(rows)})')
            total = [a + c for a, c in zip(total, n)]
        if not dry:
            (ROOT / 'data/layers.json').write_text(json.dumps(layers, indent=2) + '\n')
            (ROOT / 'data/glyphs.json').write_text(json.dumps(glyphs, indent=1) + '\n')
            items_path.write_text(json.dumps(items, indent=1) + '\n')
        print(f'done: {total[0]} imported, {total[1]} already there, {total[2]} still to paint' + (' (dry run, nothing written)' if dry else ''))
        return
    inner = {}
    # frames: frame-<shape>.png is the studded gold one; frame-<id>-<shape>.png any other frame in data/layers.json
    for fid, fdef in layers['frames'].items():
        if fdef.get('style') == 'none':
            continue
        for shape in ('circle', 'square'):
            f = src / (f'frame-{shape}.png' if fid == 'gold' else f'frame-{fid}-{shape}.png')
            if not f.exists():
                continue
            fr = recentre(load(f), FRAME_FILL, f.name)
            if fid in LINE_THICKNESS:   # Codex has mixed up thin and hairline: check what the ring really is
                th, (lo, hi) = ring_thickness(fr), LINE_THICKNESS[fid]
                if not lo <= th <= hi:
                    print(f'  {f.name}: SKIPPED — the ring is {th * 100:.1f}% of the width, a {fid} is {lo * 100:.1f}-{hi * 100:.1f}% (the drawn {fid} stays)')
                    continue
                print(f'  {f.name}: ring {th * 100:.1f}% of the width — a real {fid}')
            op = opening(fr, shape)
            print(f'  {f.name}: opening {op:.3f} of the canvas')
            name = f'frame-{shape}' if fid == 'gold' else f'frame-{fid}-{shape}'
            save(fr, name, dry)
            fdef[shape].update(file=rel(name, 256), small=rel(name, 64), inner=round(op, 4))
            if fid == 'gold':
                inner[shape] = op
    for shape in ('circle', 'square'):
        p = src / f'plate-{shape}.png'
        if p.exists() and shape in inner:
            radius = inner[shape] + PLATE_OVERLAP
            pl = recentre(load(p), 2 * radius, p.name)
            save(pl, f'plate-{shape}', dry)
            layers['plates']['stone'][shape].update(file=rel(f'plate-{shape}', 256), small=rel(f'plate-{shape}', 64), radius=round(radius, 4))
    for gid in layers['glows']:
        p = src / f'glow-{gid}.png'
        if p.exists():
            im = load(p)
            b = bbox(im, 4)
            gl = recentre(im, max(b[2] - b[0], b[3] - b[1]) / CANVAS, p.name)  # keep its size, only centre it
            save(gl, f'glow-{gid}', dry)
            layers['glows'][gid].update(file=rel(f'glow-{gid}', 256), small=rel(f'glow-{gid}', 64))
    # glyph fit is always measured against the gold frame's opening (data/layers.json glyphRef); the kit rescales it
    inner = {s: layers.get('glyphRef', {}).get(s) or layers['frames']['gold'][s]['inner'] for s in ('circle', 'square')}
    for row in glyphs['glyphs']:
        p = src / f"glyph-{row['id']}.png"
        if not p.exists():
            continue
        g = recentre(load(p), GLYPH_FILL, p.name)
        row['fit'] = glyph_fit(g, inner)
        print(f"  glyph-{row['id']}: fit circle {row['fit']['circle']}, square {row['fit']['square']}")
        save(g, f"glyph-{row['id']}", dry)
        row.update(file=rel(f"glyph-{row['id']}", 256), small=rel(f"glyph-{row['id']}", 64))
        if row.get('tintable') and not row.get('artElement'):
            print(f"  glyph-{row['id']}: was a tintable stand-in; set artElement in data/glyphs.json if the painting has a fixed colour")
    if not dry:
        (ROOT / 'data/layers.json').write_text(json.dumps(layers, indent=2) + '\n')
        (ROOT / 'data/glyphs.json').write_text(json.dumps(glyphs, indent=1) + '\n')
    print('done' + (' (dry run, nothing written)' if dry else ''))


if __name__ == '__main__':
    main()
