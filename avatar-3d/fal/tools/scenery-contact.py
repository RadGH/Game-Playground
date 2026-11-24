#!/usr/bin/env python3
"""Put scenery close-ups (tools/blender/scenery_look.py) on one labelled contact sheet.

    python3 -I avatar-3d/fal/tools/scenery-contact.py <in-dir> <out.png> [cols=6] [ids...]

Label: name, triangles, size in metres (from data/scenery.json + the GLB). No ids = every PNG in <in-dir>.
"""
import os, sys, json, struct
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
ind, outp = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 6
ids = sys.argv[4:] or sorted(f[:-4] for f in os.listdir(ind) if f.endswith('.png'))
D = {o['id']: o for s in json.load(open(os.path.join(ROOT, 'data', 'scenery.json')))['sheets'] for o in s['objects']}
def glb_info(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]; g = json.loads(b[20:20 + n])
    t = 0; lo = [1e9] * 3; hi = [-1e9] * 3
    for m in g['meshes']:
        for p in m['primitives']:
            t += g['accessors'][p['indices']]['count'] // 3
            a = g['accessors'][p['attributes']['POSITION']]
            lo = [min(lo[i], a['min'][i]) for i in range(3)]; hi = [max(hi[i], a['max'][i]) for i in range(3)]
    return t, [hi[i] - lo[i] for i in range(3)]
ims = [Image.open(os.path.join(ind, i + '.png')).convert('RGB') for i in ids]
w, h = ims[0].size; lab = 34
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w, rows * (h + lab)), (30, 32, 38))
dr = ImageDraw.Draw(sheet)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
except Exception: font = ImageFont.load_default()
for k, (iid, im) in enumerate(zip(ids, ims)):
    x, y = (k % cols) * w, (k // cols) * (h + lab)
    sheet.paste(im, (x, y))
    base = iid[:-5] if iid.endswith('-back') else iid
    f = os.path.join(ROOT, 'models', 'final', 'scenery', base + '.glb')
    t, s = glb_info(f) if os.path.exists(f) else (0, [0, 0, 0])
    dr.text((x + 6, y + h + 2), (D.get(base, {}).get('name', base))[:34], fill=(235, 235, 240), font=font)
    dr.text((x + 6, y + h + 17), f'{t:,} tris  {s[0]:.1f}x{s[2]:.1f}x{s[1]:.1f} m', fill=(170, 175, 185), font=font)
sheet.save(outp)
print('contact', outp, len(ims))
