#!/usr/bin/env python3
"""Spell Kit: compose the phase strips written by tools/shots.mjs.
python3 sheet.py <sheets.json>  ->  shots/<id>.png (one strip per spell), shots/best/<id>.png, shots/contact.png"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

spec = json.load(open(sys.argv[1]))
OUT = spec['out']
try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
except OSError:
    FONT = SMALL = ImageFont.load_default()

W, H = 480, 307
bests = []
for s in spec['sheets']:
    fr = s['frames']
    if not fr: continue
    sheet = Image.new('RGB', (W * len(fr), H + 34), (16, 18, 24))
    d = ImageDraw.Draw(sheet)
    d.text((10, 7), s['label'], fill=(232, 192, 112), font=FONT)
    for i, f in enumerate(fr):
        im = Image.open(f['file']).convert('RGB').resize((W, H), Image.LANCZOS)
        sheet.paste(im, (i * W, 34))
        d.rectangle([i * W + 8, 42, i * W + 8 + 10 + 9 * len(f['label']), 64], fill=(12, 14, 20))
        d.text((i * W + 13, 44), f['label'], fill=(240, 230, 210), font=SMALL)
        if f['best']:
            big = Image.open(f['file']).convert('RGB')
            big.save(os.path.join(OUT, 'best', s['id'] + '.webp'), 'WEBP', quality=86)
            bests.append((s['label'], big))
    sheet.save(os.path.join(OUT, s['id'] + '.png'), optimize=True)

if bests and len(spec['sheets']) > 6:
    cols = 5; cw, ch = 400, 256
    rows = (len(bests) + cols - 1) // cols
    c = Image.new('RGB', (cols * cw, rows * (ch + 26)), (16, 18, 24))
    d = ImageDraw.Draw(c)
    for i, (label, im) in enumerate(bests):
        x, y = (i % cols) * cw, (i // cols) * (ch + 26)
        c.paste(im.resize((cw, ch), Image.LANCZOS), (x, y + 26))
        d.text((x + 8, y + 4), label, fill=(232, 192, 112), font=SMALL)
    c.save(os.path.join(OUT, 'contact.png'), optimize=True)
print(f'{len(spec["sheets"])} strips, {len(bests)} best frames -> {OUT}')
