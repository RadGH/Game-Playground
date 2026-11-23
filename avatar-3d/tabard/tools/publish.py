"""Copy the baked atlases into the page's models folder as WebP: python3 tools/publish.py
build/<body>_<outfit>_atlas.png -> models/<body>/<outfit>.webp (quality 88, the canvas paints from these)."""
import glob, os
from PIL import Image
T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for p in sorted(glob.glob(os.path.join(T, "build", "*_atlas.png"))):
    body, outfit = os.path.basename(p)[:-len("_atlas.png")].split("_", 1)
    os.makedirs(os.path.join(T, "models", body), exist_ok=True)
    out = os.path.join(T, "models", body, outfit + ".webp")
    Image.open(p).convert("RGB").save(out, "WEBP", quality=88, method=6)
    print(out[len(T) + 1:], os.path.getsize(out) // 1024, "KB")
