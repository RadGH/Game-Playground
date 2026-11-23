"""Lay the four clay views out into the paint-over base: python3 tools/sheet.py <body>
-> ref/<body>/base.png (1536x1024: front | left | back | right, same scale) and the column placement in
   build/<body>_views.json ("x" per view), which tools/blender/tb_bake.py uses to cut Codex's painting back apart."""
import json, os, sys
from PIL import Image
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
body = sys.argv[1]
B = os.path.join(T, "build"); meta = json.load(open(os.path.join(B, f"{body}_views.json")))
W, H = 1536, meta["h_px"]
order = ["front", "left", "back", "right"]
total = sum(meta["views"][v]["w"] for v in order); gap = (W - total) // (len(order) + 1)
BG = (158, 158, 158)
sheet = Image.new("RGB", (W, H), BG); mask = Image.new("L", (W, H), 0)
x = gap
for v in order:
    im = Image.open(os.path.join(B, meta["views"][v]["file"])).convert("RGBA")
    sheet.paste(im, (x, 0), im); mask.paste(im.getchannel("A"), (x, 0)); meta["views"][v]["x"] = x; x += im.width + gap
os.makedirs(os.path.join(T, "ref", body), exist_ok=True)
sheet.save(os.path.join(T, "ref", body, "base.png")); mask.save(os.path.join(B, f"{body}_mask.png"))
meta["bg"] = BG
json.dump(meta, open(os.path.join(B, f"{body}_views.json"), "w"), indent=1)
print("base", body, [(v, meta["views"][v]["x"]) for v in order])
