# Side-by-side: each image cropped to its figure (pixels that differ from the corner colour) and scaled to one height.
#   python3 compare.py out.png H img1 img2 ...
import sys
from PIL import Image, ImageChops
out, H, *fs = sys.argv[1:]; H = int(H)
def fig(path):
    im = Image.open(path).convert('RGB')
    bg = Image.new('RGB', im.size, im.getpixel((4, 4)))
    diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 28 else 0)
    box = diff.getbbox() or (0, 0, im.width, im.height)
    pad = 6; box = (max(0, box[0]-pad), max(0, box[1]-pad), min(im.width, box[2]+pad), min(im.height, box[3]+pad))
    c = im.crop(box); return c.resize((max(1, int(c.width * H / c.height)), H))
ims = [fig(f) for f in fs]
s = Image.new('RGB', (sum(i.width for i in ims) + 10 * len(ims), H), (30, 30, 30)); x = 0
for i in ims: s.paste(i, (x, 0)); x += i.width + 10
s.save(out)
