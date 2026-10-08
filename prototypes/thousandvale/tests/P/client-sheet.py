# W9 (P-client): paste shots side by side so many can be looked at in one picture.  python3 client-sheet.py <device> <out.png> <cols> name1 name2 …
import sys
from PIL import Image
dev, out, cols, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4:]
ims = [Image.open(f'{__file__.rsplit("/",1)[0]}/shots/{dev}/{n}.png') for n in names]
w = max(i.width for i in ims); h = max(i.height for i in ims); rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (w * cols + 8 * (cols - 1), h * rows + 8 * (rows - 1)), (60, 20, 60))
for k, i in enumerate(ims): sheet.paste(i, ((k % cols) * (w + 8), (k // cols) * (h + 8)))
sheet.save(out); print(sheet.size)
