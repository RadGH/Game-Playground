"""Tabard step 3e — clean head + face texture (round 4, 2026-11-23):  python3 tools/head_clean.py <body> [--debug]

Hair is its own 3D layer now (js/hair.js) and eyes / brows / beards are drawn by js/face.js, so the BODY painting's head
must be plain skin: a bald scalp, no beard or stubble, no painted brows, eyes or lashes (ears, nose, lips stay). This
also removes the second brow/eye smear the side views left at the temples.

In:  build/<body>_skin_atlas.png (tb_bake.py), build/<body>_clay_shade.png (tb_bake.py <body> clay: the clay renders
     the painter painted over, baked the same way = the light and shade every painting follows),
     build/<body>_facemap.json (tb_face.py: the head box's triangles with their 3D place, the face layer's triangles,
     landmarks)
Out: build/<body>_skin_atlas.png with a clean head box; the same head box copied into every other outfit atlas of the
     body (outfits are edits of the skin painting, and the head box is always drawn from the skin anyway);
     models/<body>/face.webp — the clean face redrawn in the face layer's own layout (same pixels as the head beneath,
     so its edges never show); build/<body>_head_clean_debug.png with --debug (what was replaced, in magenta)

How: every head-box pixel knows its 3D spot. Paint / clay shade = the skin's own colour ("albedo"); spots that are
not skin-coloured (hair, brows, beard, eye whites, lashes), the whole scalp above the hairline and the eyes are
replaced by the skin colour spread in from the nearest real skin, times the clay's light and shade — a bald head lit
the way the painter lit the rest.
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

T = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(T, "build")
body = sys.argv[1]; DEBUG = "--debug" in sys.argv
REG = json.load(open(os.path.join(T, "data", "regions.json"))); S = REG["size"]
X0, Y0, W, H = REG["regions"]["head"]["rect"]
FM = json.load(open(os.path.join(B, f"{body}_facemap.json"))); LW = FM["world"]


def lin(a): return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
def srgb(a): a = np.clip(a, 0, 1); return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


# ---- 1. each head-box pixel's 3D spot (rasterise the triangles in the box)
P = np.full((H, W, 3), np.nan, np.float32)
yy, xx = np.mgrid[0:H, 0:W]; px = xx + 0.5; py = yy + 0.5
for tri in FM["head_tris"]:
    uv = np.array([[u * S - X0, (1 - v) * S - Y0] for (u, v), _ in tri]); w3 = np.array([p for _, p in tri])
    x0, x1 = int(max(0, np.floor(uv[:, 0].min()))), int(min(W, np.ceil(uv[:, 0].max()) + 1))
    y0, y1 = int(max(0, np.floor(uv[:, 1].min()))), int(min(H, np.ceil(uv[:, 1].max()) + 1))
    if x1 <= x0 or y1 <= y0: continue
    (ax, ay), (bx, by), (cx, cy) = uv
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-9: continue
    sx, sy = px[y0:y1, x0:x1], py[y0:y1, x0:x1]
    l1 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / d
    l2 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / d
    l3 = 1 - l1 - l2
    inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
    pos = l1[..., None] * w3[0] + l2[..., None] * w3[1] + l3[..., None] * w3[2]
    blk = P[y0:y1, x0:x1]; blk[inside] = pos[inside]
cov = ~np.isnan(P[..., 0])
# the bake margin around the islands: give those pixels their nearest covered spot
idx = ndi.distance_transform_edt(~cov, return_distances=False, return_indices=True)
Pm = P[idx[0], idx[1]]
X, Yd, Z = Pm[..., 0], Pm[..., 1], Pm[..., 2]
ax_ = np.abs(X)

# ---- 2. zones (world metres, rest pose; front = -y, the character's left = +x)
E = LW["eyes"]; ears = LW["ears"]
ez = (E["l"]["c"][2] + E["r"]["c"][2]) / 2
ear_front = min(ears["l"]["front_y"], ears["r"]["front_y"]); ear_back = max(ears["l"]["back_y"], ears["r"]["back_y"])
ear_top = max(ears["l"]["top_z"], ears["r"]["top_z"]); ear_bot = min(ears["l"]["bottom_z"], ears["r"]["bottom_z"])
ear_x = min(ears["l"]["x"], ears["r"]["x"])
tip = LW["nose_tip"]; sub = LW["subnasale"]; mouth = LW["mouth"]
corner_x = abs(LW["mouth_corner_l"][0])

# keep: ears, lips, nostrils (their own dark shading is not hair)
ear = (Yd > ear_front - 0.004) & (Yd < ear_back + 0.006) & (Z < ear_top + 0.006) & (Z > ear_bot - 0.006) & (ax_ > ear_x - 0.012)
lips = (ax_ < corner_x + 0.003) & (np.abs(Z - mouth[2]) < 0.011) & (Yd < mouth[1] + 0.025)
nose = (ax_ < 0.022) & (Z < tip[2] + 0.012) & (Z > sub[2] - 0.004) & (Yd < sub[1] + 0.02)
keep = ear | lips | nose

# eyes: the eyeball's whole neighbourhood (lids, lashes, whites) -> skin; the lead draws them on the face layer
eyes = np.zeros_like(cov); eyed = np.full(cov.shape, 9.0, np.float32)     # eyed: distance to the eye / its radius
for e in E.values():
    c = np.array(e["c"]); r = e["r"]
    eyed = np.minimum(eyed, np.linalg.norm(Pm - c, axis=2) / r)
EYE_R = 1.7                              # eye zone, in eye radii (1.45 left a pale ring of painted lid light)
eyes = eyed < EYE_R

# scalp: above the hairline in front of the ears (hairline points interpolated across), and the whole back of the head
# down to the nape (below the ears' bottom) — replaced outright, whatever colour the painter left there
hl = np.array(LW["hairline"]); order = np.argsort(hl[:, 0]); hx, hz = hl[order, 0], hl[order, 2]
hz_at = np.interp(X, hx, hz)
front = Yd < ear_front
scalp = (front & (Z > hz_at - 0.002)) | (~front & (Z > ear_bot - 0.02) & ~ear)

# ---- 3. skin colour (albedo = paint / light) and which pixels are not skin
# safe to run again: the fresh bake is kept as <body>_skin_bake.png the first time; a cleaned atlas carries a marker
atlas_p, raw_p = os.path.join(B, f"{body}_skin_atlas.png"), os.path.join(B, f"{body}_skin_bake.png")
_a = Image.open(atlas_p)
if _a.info.get("tabard") != "head-clean": _a.convert("RGB").save(raw_p)
img = np.asarray(Image.open(raw_p).convert("RGB")).astype(np.float32) / 255
# the head box comes from the bald, clean-shaven repaint (tools/paint.mjs <body> head + tb_bake.py <body> head) when
# there is one — a painter's bald head beats any fill; the steps below then only clean the eyes and any leftovers
HEADP = os.path.join(B, f"{body}_headpaint.png")
if os.path.exists(HEADP):
    hp = np.asarray(Image.open(HEADP).convert("RGB")).astype(np.float32) / 255
    img = img.copy(); img[Y0:Y0 + H, X0:X0 + W] = hp[Y0:Y0 + H, X0:X0 + W]
    print(f"RES {body}: head from the bald repaint")
sh = np.asarray(Image.open(os.path.join(B, f"{body}_clay_shade.png")).convert("RGB")).astype(np.float32) / 255
I = lin(img[Y0:Y0 + H, X0:X0 + W]); Sh = lin(sh[Y0:Y0 + H, X0:X0 + W]).mean(axis=2)
Sh = np.clip(Sh / max(1e-3, np.percentile(Sh[cov], 90)), 0.08, 1.5)
cheek = cov & front & ~keep & ~eyes & (Z < ez - 0.012) & (Z > tip[2] - 0.006) & (ax_ > 0.02) & (ax_ < 0.06)
neckf = cov & (Z < LW["chin_bottom"][2] - 0.03) & (Yd < 0)          # front of the neck: skin on both bodies
lumI = I.mean(axis=2)
# how strongly the painting follows the clay's light: fit lum = k * shade^g on the cheeks
g = 1.0
m_ = cheek & (lumI > 1e-3)
if m_.sum() > 50:
    g = float(np.clip(np.polyfit(np.log(Sh[m_]), np.log(lumI[m_]), 1)[0], 0.4, 1.4))
A = I / (Sh[..., None] ** g)
ref = np.median(np.concatenate([A[cheek], A[neckf]]), axis=0); refL = ref.mean()
AL = A.mean(axis=2)
chroma = np.linalg.norm(A / np.maximum(AL[..., None], 1e-4) - ref / refL, axis=2)
# hair, brows, beard, lashes are clearly darker than skin once the light is divided out; blush, lips and a warmer neck
# are not (a colour test flagged half the face, 2026-11-23)
notskin = (AL < 0.5 * refL) | ((AL < 0.7 * refL) & (chroma > 0.25))
# ... only where hair grows on a face: brows + temples (the side views' second brow/eye landed there), beard and
# sideburns. Elsewhere (neck, under the jaw) the painter's own deep shading is darker than that and must stay.
eo = max(abs(E["l"]["c"][0]), abs(E["r"]["c"][0])) + E["l"]["r"]
brow_band = front & (Z > ez - 0.01) & (Z < ez + 0.045) & (ax_ < eo + 0.035)
beard_band = front & (Z < tip[2] + 0.004) & (Z > LW["chin_bottom"][2] - 0.035) | (front & (Yd > ear_front - 0.03) & (Z < ear_top) & (Z > ear_bot - 0.03))
hair_band = front & (Z > ez + 0.02)                                  # the painted hairline may sit lower than ours
nape_band = ~front & (Z > ear_bot - 0.09)                            # hair painted down the back of the neck
dark = notskin.copy()
notskin &= cov & ~keep & (brow_band | beard_band | hair_band | nape_band)
notskin |= cov & ~ear & (I[..., 2] > I[..., 0] * 0.8)               # bluish = never skin (hair shine left on the neck)
# inside lips / nose only the very dark (a moustache over the lip), not the lips' red or the nose's shadows
notskin |= cov & (lips | nose) & ~ear & (AL < 0.33 * refL) & beard_band
notskin = ndi.binary_opening(notskin, iterations=1)
notskin = ndi.binary_dilation(notskin, iterations=3) & ~(keep & ~ndi.binary_dilation(notskin & (lips | nose), iterations=2))
replace = (notskin | (scalp & ~keep))
replace = ndi.binary_closing(replace, iterations=2) & ~(ear | (keep & ~notskin))
replace |= ~cov                                   # the margin round the islands gets re-made too
print(f"RES {body}: light follows clay^{g:.2f}; skin albedo {np.round(srgb(ref) * 255).astype(int)}; "
      f"replacing {100 * (replace & cov).sum() / cov.sum():.0f}% of the head")

# ---- 4. fill the skin colour in from real skin: a smooth membrane (each filled pixel = the average of its neighbours,
# solved coarse to fine), so holes get an even wash with no rings
def membrane(A, known, depth=0):
    h, w = known.shape
    if min(h, w) <= 8 or depth > 7:
        out = A.copy(); out[~known] = A[known].mean(0) if known.any() else ref; return out
    # coarse level: 2x2 averages of the known pixels
    hh, ww = (h + 1) // 2, (w + 1) // 2
    pa = np.zeros((hh * 2, ww * 2, 3), np.float32); pk = np.zeros((hh * 2, ww * 2), np.float32)
    pa[:h, :w] = np.where(known[..., None], A, 0); pk[:h, :w] = known
    sa = pa.reshape(hh, 2, ww, 2, 3).sum((1, 3)); sk = pk.reshape(hh, 2, ww, 2).sum((1, 3))
    ck = sk > 0; ca = np.where(ck[..., None], sa / np.maximum(sk, 1)[..., None], 0)
    coarse = membrane(ca, ck, depth + 1)
    X = np.repeat(np.repeat(coarse, 2, 0), 2, 1)[:h, :w].copy(); X[known] = A[known]
    free = ~known
    for _ in range(40):
        P_ = np.pad(X, ((1, 1), (1, 1), (0, 0)), mode="edge")
        avg = (P_[:-2, 1:-1] + P_[2:, 1:-1] + P_[1:-1, :-2] + P_[1:-1, 2:]) / 4
        X[free] = avg[free]
    return X


known = cov & ~replace
fill = membrane(np.where(known[..., None], A, 0).astype(np.float32), known)
# soft edge: blend over ~2 px
alpha = ndi.gaussian_filter(replace.astype(np.float32), 1.2)
alpha = np.maximum(alpha, replace * 0.85)
newA = A * (1 - alpha[..., None]) + fill * alpha[..., None]
out = srgb(newA * (Sh[..., None] ** g))
# eyes last, in plain colour (dividing by the clay's dark socket left pale "goggles"): the lids' surroundings spread
# in from just outside, with a soft edge over a fifth of the eye's size
ek = cov & ~eyes
ef = membrane(np.where(ek[..., None], out, 0).astype(np.float32), ek)
ea = np.clip((EYE_R - eyed) / 0.4, 0, 1)[..., None]; ea = ea * ea * (3 - 2 * ea)
out = out * (1 - ea) + ef * ea
replace |= eyes
clean = img.copy(); clean[Y0:Y0 + H, X0:X0 + W] = out

# ---- 5. write: skin atlas, the same head box in every other outfit atlas, the face texture
from PIL.PngImagePlugin import PngInfo
_mk = PngInfo(); _mk.add_text("tabard", "head-clean")
Image.fromarray((clean * 255 + 0.5).astype(np.uint8)).save(atlas_p, pnginfo=_mk)
for p in sorted(glob.glob(os.path.join(B, f"{body}_*_atlas.png"))):
    if p.endswith("_skin_atlas.png"): continue
    im = np.asarray(Image.open(p).convert("RGB")).copy()
    im[Y0:Y0 + H, X0:X0 + W] = (clean[Y0:Y0 + H, X0:X0 + W] * 255 + 0.5).astype(np.uint8)
    Image.fromarray(im).save(p)
if DEBUG:
    dbg = clean[Y0:Y0 + H, X0:X0 + W].copy(); dbg[replace & cov] = dbg[replace & cov] * 0.4 + np.array([1, 0, 1]) * 0.6
    dbg[keep & cov] = dbg[keep & cov] * 0.6 + np.array([0, 1, 0]) * 0.4
    Image.fromarray(np.concatenate([(img[Y0:Y0 + H, X0:X0 + W] * 255).astype(np.uint8), (dbg * 255).astype(np.uint8)], 1)).save(
        os.path.join(B, f"{body}_head_clean_debug.png"))

FS = 1024
face = np.zeros((FS, FS, 3), np.float32); fcov = np.zeros((FS, FS), bool)
fy, fx = np.mgrid[0:FS, 0:FS]; fpx, fpy = fx + 0.5, fy + 0.5
src = clean
for tri in FM["face_tris"]:
    buv = np.array([[u * S, (1 - v) * S] for (u, v), _ in tri]); fuv = np.array([[u * FS, (1 - v) * FS] for _, (u, v) in tri])
    x0, x1 = int(max(0, np.floor(fuv[:, 0].min()) - 1)), int(min(FS, np.ceil(fuv[:, 0].max()) + 2))
    y0, y1 = int(max(0, np.floor(fuv[:, 1].min()) - 1)), int(min(FS, np.ceil(fuv[:, 1].max()) + 2))
    (ax, ay), (bx, by), (cx, cy) = fuv
    d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
    if abs(d) < 1e-9: continue
    sx, sy = fpx[y0:y1, x0:x1], fpy[y0:y1, x0:x1]
    l1 = ((by - cy) * (sx - cx) + (cx - bx) * (sy - cy)) / d
    l2 = ((cy - ay) * (sx - cx) + (ax - cx) * (sy - cy)) / d
    l3 = 1 - l1 - l2
    inside = (l1 >= -0.01) & (l2 >= -0.01) & (l3 >= -0.01)
    bu = l1 * buv[0, 0] + l2 * buv[1, 0] + l3 * buv[2, 0] - 0.5
    bv = l1 * buv[0, 1] + l2 * buv[1, 1] + l3 * buv[2, 1] - 0.5
    smp = np.stack([ndi.map_coordinates(src[..., k], [bv[inside], bu[inside]], order=3, mode="nearest") for k in range(3)], -1)
    blk = face[y0:y1, x0:x1]; blk[inside] = smp; fb = fcov[y0:y1, x0:x1]; fb[inside] = True
# outside the triangles: the nearest face colour (no dark rim when the browser blends neighbouring pixels)
idx = ndi.distance_transform_edt(~fcov, return_distances=False, return_indices=True)
face = face[idx[0], idx[1]]
os.makedirs(os.path.join(T, "models", body), exist_ok=True)
Image.fromarray((np.clip(face, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(T, "models", body, "face.webp"), "WEBP", quality=90, method=6)
print(f"RES wrote models/{body}/face.webp ({100 * fcov.mean():.0f}% of the square is face)")
