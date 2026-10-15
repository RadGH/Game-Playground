#!/usr/bin/env python3
"""Turn Codex's sky panoramas (assets/sky/inbox/*.png, git-ignored) into the skybox files the game loads.

  python3 -I prototypes/thousandvale/tools/sky-art.py

For each sky in HORIZON (the row where the painted sky meets the haze, as a share of the picture's height, read by
eye from each picture): keep the sky from the top down to a little under the horizon, wrap the left/right edges into
each other so the panorama has no seam, scale to 2048 wide, save assets/sky/<id>.webp, and write assets/sky/skies.json
with the horizon's place in the cropped picture and its colours (the fog takes the horizon colour, so far hills melt
into the painted sky). Play-test 11 (Z59, live #60).
"""
import json, os, sys
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SKY = os.path.join(HERE, '..', 'assets', 'sky')
INBOX = os.path.join(SKY, 'inbox')
# id -> horizon row as a share of the source height (read from each picture)
HORIZON = {'day_clear': 0.655, 'cloudy': 0.6, 'dawn': 0.595, 'dusk': 0.575, 'night': 0.632, 'vharlen': 0.615}
FOG_K = {'night': 0.5}   # the night's horizon glow line is brighter than a night fog should be
BELOW = 0.06          # keep this much haze under the horizon (the fog covers the rest)
W = 2048
SEAM = 0.08           # share of the width blended across the wrap

def seamless(im):
    w, h = im.size
    rolled = Image.new(im.mode, (w, h)); rolled.paste(im.crop((w // 2, 0, w, h)), (0, 0)); rolled.paste(im.crop((0, 0, w // 2, h)), (w - w // 2, 0))
    band = int(w * SEAM)
    mask = Image.new('L', (w, h), 0); mp = mask.load()
    col = []
    for x in range(w):
        d = min(x, w - 1 - x)                  # distance to the nearest edge
        t = 1 - d / band if d < band else 0     # 1 at the edge -> the rolled copy (whose middle is continuous there)
        col.append(int(255 * (t * t * (3 - 2 * t))))
    for x in range(w):
        v = col[x]
        if v:
            for y in range(h): mp[x, y] = v
    return Image.composite(rolled, im, mask)

def avg(im, y0, y1):
    px = im.crop((0, max(0, y0), im.size[0], max(y0 + 1, y1))).resize((1, 1), Image.BOX).getpixel((0, 0))
    return [round(c / 255, 4) for c in px[:3]]

def main():
    out = {'_doc': 'Skybox panoramas (play-test 11 Z59): js/client/sky-box.js. horizonV = where the horizon sits in the picture (0 top .. 1 bottom); horizon / zenith = average colours there (linear-ish sRGB 0..1). Made by tools/sky-art.py from Codex pictures.', 'skies': {}}
    for sid, hz in HORIZON.items():
        src = os.path.join(INBOX, sid + '.png')
        if not os.path.exists(src): print('missing', src); continue
        im = Image.open(src).convert('RGB')
        w, h = im.size
        bottom = min(h, int(h * (hz + BELOW)))
        im = im.crop((0, 0, w, bottom))
        im = seamless(im)
        nh = round(W * bottom / w)
        im = im.resize((W, nh), Image.LANCZOS)
        hv = (h * hz) / bottom
        hy = int(nh * hv)
        dst = os.path.join(SKY, sid + '.webp')
        im.save(dst, 'WEBP', quality=80, method=6)
        out['skies'][sid] = {'file': sid + '.webp', 'w': W, 'h': nh, 'horizonV': round(hv, 4),
                             'horizon': avg(im, hy - max(2, nh // 60), hy), 'fog': [round(c * FOG_K.get(sid, 1), 4) for c in avg(im, hy - int(nh * 0.05), hy - int(nh * 0.01))], 'low': avg(im, int(hy * 0.8), int(hy * 0.88)), 'zenith': avg(im, 0, max(2, nh // 40))}
        print(sid, f'{W}x{nh}', os.path.getsize(dst) // 1024, 'KB', out['skies'][sid]['horizon'])
    with open(os.path.join(SKY, 'skies.json'), 'w') as f: json.dump(out, f, indent=1)

main()
