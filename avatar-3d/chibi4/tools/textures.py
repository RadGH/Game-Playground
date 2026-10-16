#!/usr/bin/env python3
"""Chibi 4 step 4 — getting MakeHuman's CC0 texture atlases repainted by Codex and back onto the same UV layout.

Why the crop: Codex's image tool refuses a whole-body skin atlas (an unrolled nude body reads as sexual content), so only
the HEAD island goes to Codex, turned upright (in MakeHuman's atlas the face lies on its side, which Codex paints badly).
The rest of the body is stylised here without AI: pores and body hair smoothed away, colour warmed (it is mostly under
clothes in every game use).

  python3 textures.py prep  <atlas.png> <head_for_codex.png>
  python3 textures.py merge <atlas.png> <codex_head.png> <out.jpg> [--warm R,G,B] [--fit]
  python3 textures.py hair  <hair.png> <codex_hair.png> <out.png>       (Codex RGB + the original's alpha)
  python3 textures.py gradient-hair <hair.png> <out.png>               (no-AI stand-in: auburn ramp)

Registration: Codex's output comes back at its own size (1254, 1536 or the input's); in edit mode it has kept the layout
so closely that the eyes land on the same pixels, so it is simply resized back. --fit instead registers by the bounding
box of the island outline (it was fooled by edge patches Codex repainted, so it is off by default). Only PIL is used (the VM's system Python has no numpy).
"""
import sys
from PIL import Image, ImageChops, ImageFilter, ImageStat

HEAD = (1240, 230, 1990, 1810)      # the head island in MakeHuman's 2048 body atlas (same for every MakeHuman skin)
import os
LAYOUT = os.path.expanduser("~/.config/blender/5.2/extensions/.user/user_default/mpfb/data/skins/jartur69_middleage_slavic_male_with_genitals_and_beard/Jartur_mid_old_Slavic_Male_with_Genitals_and_Beard_lsdif_lighter.png")
FACE = (1735, 1010)              # a point on the face (nose bridge) in the 2048 atlas
LOGO = (1980, 1440, 2048, 2010)     # the vertical 'makehuman.org' credit strip


def bg_of(im):
    return im.getpixel((1024, 20))


def island_mask(im, bg, thr=16):
    d = ImageChops.difference(im.convert("RGB"), Image.new("RGB", im.size, bg)).convert("L")
    return d.point(lambda v: 255 if v > thr else 0).filter(ImageFilter.MedianFilter(5))


def prep(atlas, out):
    im = Image.open(atlas).convert("RGB")
    head = im.crop(HEAD).transpose(Image.Transpose.ROTATE_270)      # face upright (crown at the top)
    w, h = head.size                                                  # 1580 x 750
    H = int(w * 2 / 3)
    canvas = Image.new("RGB", (w, H), bg_of(im))
    canvas.paste(head, (0, (H - h) // 2))
    canvas.save(out)
    print("prep", out, canvas.size)


def fit(painted, ref, bg_ref):
    """Scale + move the painted crop so its island outline's bounding box matches the reference crop's."""
    painted = painted.convert("RGB").resize(ref.size, Image.Resampling.LANCZOS)
    mb_r = island_mask(ref, bg_ref).getbbox()
    mb_p = island_mask(painted, bg_of_crop(painted)).getbbox()
    sx = (mb_r[2] - mb_r[0]) / max(1, mb_p[2] - mb_p[0]); sy = (mb_r[3] - mb_r[1]) / max(1, mb_p[3] - mb_p[1])
    print("fit: ref box", mb_r, "painted box", mb_p, "scale", round(sx, 3), round(sy, 3))
    nw, nh = int(painted.width * sx), int(painted.height * sy)
    p2 = painted.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGB", ref.size, bg_of_crop(painted))
    out.paste(p2, (int(mb_r[0] - mb_p[0] * sx), int(mb_r[1] - mb_p[1] * sy)))
    return out


def bg_of_crop(im):
    return im.getpixel((8, 8))


def stylise_body(im):
    """Painted-looking body skin without AI: kill pores/hair (median), soften, then a gentle warm grade."""
    s = im.filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.GaussianBlur(4))
    return ImageChops.blend(s, s.filter(ImageFilter.SMOOTH_MORE), 0.5)


def pad_islands(img, mask, rounds=24):
    """Push island colours outward past the edges (so a seam never samples background)."""
    cur = img.copy(); m = mask.copy()
    for _ in range(rounds):
        grown = cur.filter(ImageFilter.MaxFilter(3))
        m2 = m.filter(ImageFilter.MaxFilter(3))
        ring = ImageChops.subtract(m2, m)
        # use a blurred copy of the current image as the fill colour of the newly reached ring
        fillc = cur.filter(ImageFilter.BoxBlur(2))
        cur = Image.composite(fillc, cur, ring); m = m2
    return cur


def merge(atlas, painted_head, out, warm=None):
    im = Image.open(atlas).convert("RGB")
    bg = bg_of(im)
    body = stylise_body(im)
    body.paste(Image.new("RGB", (LOGO[2] - LOGO[0], LOGO[3] - LOGO[1]), bg), LOGO[:2])
    # the painted head, fitted onto the upright reference crop, then turned back onto its side
    ref = Image.open(atlas).convert("RGB").crop(HEAD).transpose(Image.Transpose.ROTATE_270)
    w, h = ref.size; H = int(w * 2 / 3)
    ref_canvas = Image.new("RGB", (w, H), bg); ref_canvas.paste(ref, (0, (H - h) // 2))
    painted = Image.open(painted_head).convert("RGB")
    if FIT: fitted = fit(painted, ref_canvas, bg)
    else: fitted = painted.resize(ref_canvas.size, Image.Resampling.LANCZOS)    # Codex kept the layout (checked by eye)
    fitted = fitted.crop((0, (H - h) // 2, w, (H - h) // 2 + h))
    fitted = fitted.transpose(Image.Transpose.ROTATE_90)
    # only inside the HEAD island (flood-filled from the face, so neighbouring torso/hand islands that share the crop
    # keep their own paint), grown a little and feathered so it melts into the neck
    from PIL import ImageDraw
    lay = Image.open(LAYOUT).convert("RGB")      # every MakeHuman skin shares one UV layout; this one has a clean background
    m = island_mask(lay.crop(HEAD), bg_of(lay), thr=10).filter(ImageFilter.MaxFilter(3))
    m = m.point(lambda v: 128 if v else 0)
    ImageDraw.floodfill(m, (FACE[0] - HEAD[0], FACE[1] - HEAD[1]), 255)
    m = m.point(lambda v: 255 if v == 255 else 0)
    m_hard = m
    m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    # the painted head is warmer than MakeHuman's photo skin: grade the whole body to the head's average skin colour
    # (measured on the face area, not the hair)
    face_box = (FACE[0] - 140 - HEAD[0], FACE[1] - 150 - HEAD[1], FACE[0] + 60 - HEAD[0], FACE[1] + 150 - HEAD[1])
    a = ImageStat.Stat(im.crop(HEAD).crop(face_box)).mean; b = ImageStat.Stat(fitted.crop(face_box)).mean
    k = [bb / max(1, aa) for aa, bb in zip(a, b)]
    print("skin grade", [round(x, 3) for x in k])
    body = Image.merge("RGB", [c.point(lambda v, kk=kk: min(255, int(v * kk))) for c, kk in zip(body.split(), k)])
    region = body.crop(HEAD)
    painted_only = island_mask(fitted, bg_of_crop(fitted))
    fitted = pad_islands(fitted, painted_only)
    region = Image.composite(fitted, region, m)
    body.paste(region, HEAD[:2])
    if warm:
        r, g, b = (float(x) for x in warm.split(","))
        body = Image.merge("RGB", [c.point(lambda v, k=k: min(255, int(v * k))) for c, k in zip(body.split(), (r, g, b))])
    body.save(out, quality=90)
    print("merged", out)


def hair(orig, painted, out):
    o = Image.open(orig).convert("RGBA")
    p = Image.open(painted).convert("RGB").resize(o.size, Image.Resampling.LANCZOS)
    # Codex keeps hair islands in place well (checked by eye); fit anyway by the alpha outline
    a = o.getchannel("A")
    p.putalpha(a)
    p = p.resize((1024, 1024), Image.Resampling.LANCZOS)
    p.save(out, optimize=True)
    print("hair", out, ImageStat.Stat(a).mean)


FIT = "--fit" in sys.argv     # register by the island's bounding box (off: Codex has kept the layout to the pixel so far)

def gradient_hair(orig, out, dark=(52, 16, 8), mid=(150, 62, 26), light=(236, 150, 82)):
    """No-AI stand-in (used when Codex is out of credit): MakeHuman's hair texture's light/dark, contrast-stretched and
    mapped onto an auburn ramp, then lightly clumped (median) so it reads painted rather than photographic."""
    o = Image.open(orig).convert("RGBA")
    a = o.getchannel("A")
    L = o.convert("L").filter(ImageFilter.MedianFilter(5))
    hist = L.histogram(mask=a.point(lambda v: 255 if v > 128 else 0)); tot = sum(hist); acc = 0; lo = hi = None
    for v, c in enumerate(hist):                    # 3rd..97th percentile (the white watermark must not set the top)
        acc += c
        if lo is None and acc > tot * 0.03: lo = v
        if hi is None and acc > tot * 0.97: hi = v
    hi = max(hi, lo + 20)
    def ramp(v):
        t = min(1.0, max(0.0, (v - lo) / (hi - lo))) ** 0.8
        if t < 0.55: u = t / 0.55; c0, c1 = dark, mid
        else: u = (t - 0.55) / 0.45; c0, c1 = mid, light
        return tuple(int(c0[k] + (c1[k] - c0[k]) * u) for k in range(3))
    lut = [ramp(v) for v in range(256)]
    rgb = Image.merge("RGB", [L.point([lut[v][k] for v in range(256)]) for k in range(3)])
    rgb.putalpha(a)
    rgb.resize((1024, 1024), Image.Resampling.LANCZOS).save(out, optimize=True)
    print("gradient hair", out, (lo, hi))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "prep": prep(sys.argv[2], sys.argv[3])
    elif cmd == "merge":
        warm = sys.argv[sys.argv.index("--warm") + 1] if "--warm" in sys.argv else None
        merge(sys.argv[2], sys.argv[3], sys.argv[4], warm)
    elif cmd == "hair": hair(sys.argv[2], sys.argv[3], sys.argv[4])
    elif cmd == "gradient-hair": gradient_hair(sys.argv[2], sys.argv[3])
