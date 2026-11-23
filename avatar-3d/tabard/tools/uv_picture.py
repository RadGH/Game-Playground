"""Draw a Tabard UV layout check picture: python3 tools/uv_picture.py <body>  -> shots/<body>_uv.png"""
import json, sys, os, colorsys
from PIL import Image, ImageDraw
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
body = sys.argv[1]
reg = json.load(open(os.path.join(T, "data", "regions.json")))
lines = json.load(open(os.path.join(T, "build", f"{body}_uvlines.json")))
S = reg["size"]; im = Image.new("RGB", (S, S), (24, 24, 28)); d = ImageDraw.Draw(im)
names = list(reg["regions"])
col = {n: tuple(int(c * 255) for c in colorsys.hsv_to_rgb(i / len(names), 0.45, 0.55)) for i, n in enumerate(names)}
for n, r in reg["regions"].items():
    x, y, w, h = r["rect"]; d.rectangle([x, y, x + w - 1, y + h - 1], outline=col[n], width=2); d.text((x + 4, y + 4), n, fill=(230, 230, 230))
for r, pts in lines:
    d.polygon([tuple(p) for p in pts], fill=col[r], outline=(235, 235, 235))
im.save(os.path.join(T, "shots", f"{body}_uv.png")); print("wrote", body)
