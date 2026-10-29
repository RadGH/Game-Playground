# Labelled contact sheet: python3 sheet.py out.png cols title img1 label1 img2 label2 ...
import sys
from PIL import Image, ImageDraw, ImageFont
out, cols, title, *rest = sys.argv[1:]; cols = int(cols)
pairs = [(rest[i], rest[i + 1]) for i in range(0, len(rest), 2)]
ims = [Image.open(p).convert('RGB') for p, _ in pairs]
w, h = ims[0].size; lab = 30
rows = (len(ims) + cols - 1) // cols
s = Image.new('RGB', (w * cols, (h + lab) * rows), (36, 40, 48)); d = ImageDraw.Draw(s)
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
except Exception: font = ImageFont.load_default()
for n, (im, (_, label)) in enumerate(zip(ims, pairs)):
    x, y = (n % cols) * w, (n // cols) * (h + lab)
    s.paste(im, (x, y)); d.text((x + w / 2, y + h + lab / 2), label.upper(), fill=(230, 230, 230), font=font, anchor='mm')
s.save(out)
