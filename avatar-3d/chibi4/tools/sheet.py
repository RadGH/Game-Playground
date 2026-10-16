#!/usr/bin/env python3
"""Glue renders side by side into one review-page strip (system Python + PIL).

  python3 sheet.py <out.png> <img> [<img> ...] [--h 350] [--crop l,t,r,b]   (crop: fractions of each image)
"""
import sys
from PIL import Image

args = sys.argv[1:]
h = 350; crop = None
if "--h" in args: i = args.index("--h"); h = int(args[i + 1]); del args[i:i + 2]
if "--crop" in args: i = args.index("--crop"); crop = [float(x) for x in args[i + 1].split(",")]; del args[i:i + 2]
out, paths = args[0], args[1:]
ims = []
for p in paths:
    im = Image.open(p).convert("RGB")
    if crop:
        W, H = im.size; im = im.crop((int(crop[0] * W), int(crop[1] * H), int(crop[2] * W), int(crop[3] * H)))
    ims.append(im.resize((int(im.width * h / im.height), h), Image.Resampling.LANCZOS))
sheet = Image.new("RGB", (sum(i.width for i in ims), h))
x = 0
for i in ims: sheet.paste(i, (x, 0)); x += i.width
sheet.save(out, optimize=True)
print(out, sheet.size)
