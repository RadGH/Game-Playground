# Chibi 4 — step 10b: the painted DETAIL of every generated garment, as small tiling pictures ("tiles").
#
#   ~/opt/blender/5.2/python/bin/python3.13 avatar-3d/chibi4/tools/tiles.py [<out_dir>]
#
# (Blender's own Python: it has numpy; the system Python on this VM does not. No PIL needed: PNGs are written here.)
#
# Writes <out_dir> (default avatar-3d/chibi4/textures/tiles/):
#   tiles.png        the colour band: COLS x ROWS cells of CELL px, each a seamless picture repeated over a garment
#   tiles-mask.png   the matching tint band: R = tinted by the piece's main colour, G = by its second colour,
#                    B = tinted by the SKIN (stubble), A = shine (0 cloth, ~0.4 leather, ~0.8 metal, 1 = glows)
#   tiles.json       name -> { index, channel: A|B|-, shine, world: metres one repeat covers }
#
# Every tinted tile is grey with the same average brightness (TINT_MEAN), so the runtime's tint (colour / painted
# brightness x the pixel's brightness) gives the item's exact colour on average and keeps the weave / grain / rings
# as light and shade. "lining" tiles are darker on purpose: Chibi 2 paints linings as a shade of the cloth.
# Fixed tiles keep their own colour (steel studs, gold trim, bone, rope ...). Emblems (tier 2) are three-colour
# discs: icon = main colour (the item's emblemColor), rim = second (its trim), plate = dark steel; outside the disc is
# transparent. Each cell is CELL px with PAD px of wrap-around border so the GPU's smaller copies do not bleed.
import numpy as np, os, sys, json, zlib, struct, math

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "textures", "tiles")
CELL, PAD = 256, 16
P = CELL - 2 * PAD           # 224: the repeating part
COLS, ROWS = 12, 5
TINT_MEAN = 0.62             # sRGB average of every tinted tile
rng = np.random.default_rng(10)


def srgb(h):
    h = h.lstrip("#"); return np.array([int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)], dtype=np.float32)


# ---------------------------------------------------------------- periodic building blocks (all tile seamlessly)
Y, X = np.mgrid[0:P, 0:P].astype(np.float32)
U, V = X / P, Y / P


def noise(scale, seed=None, aniso=(1.0, 1.0)):
    """Periodic smooth noise in [-1, 1]: white noise low-passed in the frequency domain (wraps by construction).
    scale = feature size in pixels; aniso stretches it (fur strands, brushed metal)."""
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((P, P))
    fy = np.fft.fftfreq(P)[:, None] * aniso[1]; fx = np.fft.fftfreq(P)[None, :] * aniso[0]
    f = np.sqrt(fx ** 2 + fy ** 2)
    k = np.exp(-(f * scale) ** 2 * 6)
    n = np.real(np.fft.ifft2(np.fft.fft2(w) * k))
    n -= n.mean(); n /= (np.abs(n).max() + 1e-6)
    return n.astype(np.float32)


def norm_mean(g, mean=TINT_MEAN, lo=0.05, hi=1.0):
    g = np.clip(g, lo, hi)
    for _ in range(6):                         # nudge until the average sits on `mean` after clipping
        g = np.clip(g + (mean - g.mean()), lo, hi)
    return g


def grey3(g): return np.repeat(g[..., None], 3, axis=2)


def tinted(g, mean=TINT_MEAN): return grey3(norm_mean(g, mean))


def fixed(hexc, g):
    """A fixed-colour tile: the colour, lit by a grey pattern g around 1."""
    return np.clip(srgb(hexc)[None, None, :] * g[..., None], 0, 1)


# ---------------------------------------------------------------- patterns (grey, ~0.5 +- detail)
def weave(period=8, depth=0.18, seed=1):
    a = np.sin(2 * np.pi * X / period); b = np.sin(2 * np.pi * Y / period)
    chk = np.sign(np.sin(np.pi * X / period) * np.sin(np.pi * Y / period))
    thread = np.where(chk > 0, np.abs(a), np.abs(b))
    return 0.6 + depth * (thread - 0.5) + 0.07 * noise(14, seed) + 0.05 * noise(3, seed + 7)


def knit(seed=2):
    rows = 14; cols = 16
    v = (Y % (P / rows)) / (P / rows); u = (X % (P / cols)) / (P / cols)
    vshape = np.abs(np.abs(u - 0.5) * 2 - (1 - v))
    return 0.62 + 0.2 * (0.5 - np.clip(vshape, 0, 1)) + 0.06 * noise(10, seed)


def quilt(seed=3):
    d1 = np.abs(((U + V) * 4) % 1 - 0.5); d2 = np.abs(((U - V) * 4) % 1 - 0.5)
    seam = np.minimum(d1, d2)
    puff = np.clip(seam * 4, 0, 1) ** 0.5
    return 0.4 + 0.28 * puff + 0.06 * weave(6, 0.3, seed) - 0.18 * (seam < 0.04)


def silk(seed=4):
    return 0.62 + 0.08 * np.sin(2 * np.pi * (U * 2 + V * 3)) + 0.05 * noise(30, seed) + 0.02 * noise(2, seed + 1)


def leather_g(seed=5):
    n = noise(5, seed); c = noise(40, seed + 3)
    pores = (noise(2.2, seed + 9) > 0.55).astype(np.float32)
    return 0.6 + 0.12 * n + 0.1 * c - 0.12 * pores


def fur_g(seed=6):
    s = noise(1.2, seed, aniso=(1.0, 0.06))
    return 0.58 + 0.45 * s + 0.1 * noise(20, seed + 2)


def mail_g(seed=7):
    rows, cols = 16, 16
    cy = P / rows; cx = P / cols
    out = np.zeros((P, P), np.float32)
    for off in (0.0, 0.5):
        yy = (Y + off * cy) % cy - cy / 2; xx = (X + off * cx) % cx - cx / 2
        r = np.sqrt(xx ** 2 + yy ** 2) / (cx / 2)
        ring = np.exp(-((r - 0.62) / 0.18) ** 2)
        out = np.maximum(out, ring * (0.75 + 0.25 * np.sign(off - 0.25)))
    return 0.18 + 0.85 * out + 0.04 * noise(8, seed)


def plate_g(seed=8):
    brushed = noise(1.0, seed, aniso=(0.05, 1.0))
    dents = noise(40, seed + 4)
    return 0.62 + 0.07 * brushed + 0.1 * dents


def scale_g(seed=9):
    rows, cols = 10, 9
    cy = P / rows; cx = P / cols
    out = np.ones((P, P), np.float32) * 0.25
    for r in range(rows + 1):
        off = (r % 2) * cx / 2
        for k in range(-1, cols + 1):
            ccx = k * cx + off; ccy = r * cy
            for dx in (-P, 0, P):
                for dy in (-P, 0, P):
                    d = np.sqrt((X - ccx - dx) ** 2 + ((Y - ccy - dy) * 1.0) ** 2) / (cx * 0.62)
                    lower = (Y - ccy - dy) > -cy * 0.2
                    m = (d < 1) & lower
                    out = np.where(m, 0.45 + 0.45 * np.clip(1 - d, 0, 1) ** 0.6, out)
    return out + 0.04 * noise(6, seed)


def feather_g(seed=10):
    barbs = np.sin(2 * np.pi * (X / 6 + np.abs((Y % 56) - 28) / 10))
    return 0.6 + 0.15 * barbs + 0.08 * noise(12, seed)


def rope_g(seed=11):
    return 0.6 + 0.22 * np.sin(2 * np.pi * (U * 3 + V * 7)) + 0.06 * noise(4, seed)


def wood_g(seed=12):
    n = noise(30, seed, aniso=(1.0, 0.1))
    return 0.62 + 0.14 * np.sin(2 * np.pi * (X / 18 + 2.5 * n)) + 0.05 * noise(3, seed + 3)


def straw_g(seed=13):
    return weave(12, 0.35, seed) + 0.05 * np.sin(2 * np.pi * X / 3)


def smooth_g(seed, amp=0.05, size=20): return 1.0 + amp * noise(size, seed)


def glass_g(seed):
    return 0.85 + 0.1 * noise(30, seed) + 0.25 * np.exp(-((U - V) % 1 - 0.3) ** 2 / 0.004)


def gem_g(seed):
    f = np.abs(np.sin(6 * np.pi * U) * np.cos(6 * np.pi * V))
    return 0.7 + 0.35 * f + 0.05 * noise(5, seed)


def glow_g(seed):
    return 0.9 + 0.1 * noise(18, seed)


def strands(seed=14):
    return 0.6 + 0.22 * noise(1.4, seed, aniso=(1.0, 0.08)) + 0.08 * noise(16, seed + 1)


# ---------------------------------------------------------------- emblems (alpha cut-out discs)
def poly_mask(pts, scale=1.0):
    """Even-odd fill of a polygon in [-1,1] tile coordinates."""
    x = (X + 0.5) / P * 2 - 1; y = 1 - (Y + 0.5) / P * 2
    inside = np.zeros((P, P), bool)
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i][0] * scale, pts[i][1] * scale
        x1, y1 = pts[(i + 1) % n][0] * scale, pts[(i + 1) % n][1] * scale
        cond = ((y0 > y) != (y1 > y)) & (x < (x1 - x0) * (y - y0) / ((y1 - y0) + 1e-9) + x0)
        inside ^= cond
    return inside


def circ(cx, cy, r):
    x = (X + 0.5) / P * 2 - 1; y = 1 - (Y + 0.5) / P * 2
    return (x - cx) ** 2 + (y - cy) ** 2 < r * r


def seg(x0, y0, x1, y1, w):
    x = (X + 0.5) / P * 2 - 1; y = 1 - (Y + 0.5) / P * 2
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((x - x0) * dx + (y - y0) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
    return (x - x0 - t * dx) ** 2 + (y - y0 - t * dy) ** 2 < w * w


def star(n, ro, ri, rot=math.pi / 2):
    return [((ro if k % 2 == 0 else ri) * math.cos(rot + k * math.pi / n), (ro if k % 2 == 0 else ri) * math.sin(rot + k * math.pi / n)) for k in range(2 * n)]


def icon(name):
    s = 0.62
    if name == "flame":
        pts = [(0, 1), (0.35, 0.35), (0.55, 0.2), (0.6, -0.25), (0.35, -0.75), (0, -0.9), (-0.35, -0.75), (-0.6, -0.25), (-0.5, 0.25), (-0.25, 0.1), (-0.2, 0.55)]
        return poly_mask(pts, s) & ~poly_mask([(0, 0.25), (0.25, -0.3), (0, -0.65), (-0.25, -0.3)], s)
    if name == "drop" or name == "blood":
        return poly_mask([(0, 1), (0.45, 0.1), (0.55, -0.35), (0.3, -0.8), (0, -0.9), (-0.3, -0.8), (-0.55, -0.35), (-0.45, 0.1)], s)
    if name == "bolt":
        return poly_mask([(0.2, 1), (-0.45, 0.0), (-0.05, 0.0), (-0.3, -1), (0.45, 0.15), (0.05, 0.15), (0.35, 1)], s)
    if name == "frost":
        m = np.zeros((P, P), bool)
        for k in range(6):
            a = k * math.pi / 3; cx, cy = math.cos(a) * s, math.sin(a) * s
            m |= seg(0, 0, cx, cy, 0.06)
            for t in (0.55,):
                bx, by = cx * t, cy * t
                for da in (0.6, -0.6):
                    m |= seg(bx, by, bx + math.cos(a + da) * 0.22, by + math.sin(a + da) * 0.22, 0.045)
        return m
    if name == "sun":
        m = circ(0, 0, 0.3)
        for k in range(12):
            a = k * math.pi / 6
            m |= seg(math.cos(a) * 0.38, math.sin(a) * 0.38, math.cos(a) * 0.62, math.sin(a) * 0.62, 0.05)
        return m
    if name == "star":
        return poly_mask(star(5, 1, 0.42), s)
    if name == "skull":
        m = circ(0, 0.12, 0.45) | poly_mask([(-0.28, -0.1), (0.28, -0.1), (0.24, -0.5), (-0.24, -0.5)])
        m &= ~(circ(-0.17, 0.08, 0.12) | circ(0.17, 0.08, 0.12) | poly_mask([(0, -0.05), (0.07, -0.2), (-0.07, -0.2)]))
        for x in (-0.12, 0, 0.12): m &= ~seg(x, -0.32, x, -0.5, 0.025)
        return m
    if name == "leaf":
        m = poly_mask([(0, 1), (0.42, 0.45), (0.5, 0), (0.35, -0.45), (0, -0.75), (-0.35, -0.45), (-0.5, 0), (-0.42, 0.45)], s)
        m &= ~seg(0, 0.5, 0, -0.45, 0.025)
        return m | seg(0, -0.45, 0, -0.68, 0.035)
    if name == "rune":
        m = np.zeros((P, P), bool)
        for a in ((0, 0.6, 0, -0.6), (0, 0.6, 0.35, 0.25), (0, 0.6, -0.35, 0.25), (0, 0.0, 0.35, -0.35), (0, 0.0, -0.35, -0.35)):
            m |= seg(*a, 0.07)
        return m
    if name == "claw":
        m = np.zeros((P, P), bool)
        for dx in (-0.3, 0, 0.3):
            for t in np.linspace(0, 1, 9):
                x = dx + 0.25 * math.sin(t * 2.2) - 0.12; y = 0.6 - 1.2 * t
                m |= circ(x, y, 0.07 * (1 - 0.7 * t) + 0.02)
        return m
    if name == "cog":
        x = (X + 0.5) / P * 2 - 1; y = 1 - (Y + 0.5) / P * 2
        r = np.sqrt(x * x + y * y); a = np.arctan2(y, x)
        teeth = 0.5 + 0.12 * (np.cos(8 * a) > 0.3)
        return (r < teeth) & (r > 0.2)
    if name == "eye":
        m = poly_mask([(-0.7, 0), (-0.35, 0.3), (0, 0.38), (0.35, 0.3), (0.7, 0), (0.35, -0.3), (0, -0.38), (-0.35, -0.3)])
        return m & ~(circ(0, 0, 0.24) & ~circ(0, 0, 0.12))
    if name == "moon":
        return circ(0, 0, 0.55) & ~circ(0.25, 0.12, 0.47)
    raise KeyError(name)


EMBLEMS = ["flame", "frost", "bolt", "drop", "blood", "skull", "sun", "rune", "leaf", "star", "claw", "cog", "eye", "moon"]


def emblem(name):
    rgb = np.zeros((P, P, 3), np.float32); a = np.zeros((P, P), np.float32); m = np.zeros((P, P, 4), np.float32)
    disc = circ(0, 0, 0.98); rim = disc & ~circ(0, 0, 0.84); ic = icon(name) & ~rim
    base = srgb("#3a3e46")[None, None, :] * (0.85 + 0.15 * smooth_g(3)[..., None])
    rgb[:] = base
    g = 0.7 + 0.3 * plate_g(20)
    rgb[rim] = grey3(norm_mean(g))[rim]; m[rim, 1] = 1; m[rim, 3] = 0.8
    rgb[ic] = grey3(norm_mean(g))[ic]; m[ic, 0] = 1; m[ic, 3] = 0.8
    m[disc & ~rim & ~ic, 3] = 0.7
    a[disc] = 1
    return rgb, a, m


# ---------------------------------------------------------------- the catalogue: name -> (rgb, alpha, mask)
def T(name, channel, shine, world, rgb, alpha=None, mask=None):
    return dict(name=name, channel=channel, shine=shine, world=world, rgb=rgb, alpha=alpha, mask=mask)


def build():
    out = []
    A = lambda nm, g, shine, world, mean=TINT_MEAN: out.append(T(nm, "A", shine, world, tinted(g, mean)))
    Bc = lambda nm, g, shine, world, mean=TINT_MEAN: out.append(T(nm, "B", shine, world, tinted(g, mean)))
    F = lambda nm, hexc, g, shine, world: out.append(T(nm, "-", shine, world, fixed(hexc, g)))
    for ch, add in (("A", A), ("B", Bc)):
        sfx = "" if ch == "A" else "_b"
        add("cloth" + sfx, weave(), 0.0, 0.10)
        add("lining" + sfx, weave(8, 0.12, 21), 0.0, 0.10, TINT_MEAN * 0.66)
        add("leather" + sfx, leather_g(), 0.35, 0.18)
        add("plate" + sfx, plate_g(), 0.85, 0.30)
        add("mail" + sfx, mail_g(), 0.8, 0.07)
        add("silk" + sfx, silk(), 0.5, 0.25)
        add("fur" + sfx, fur_g(), 0.0, 0.12)
        add("quilt" + sfx, quilt(), 0.0, 0.16)
    A("knit", knit(), 0.0, 0.08); A("scale", scale_g(), 0.8, 0.14); A("feather", feather_g(), 0.1, 0.10)
    A("strands", strands(), 0.1, 0.06)                         # beards (tinted by the beard colour)
    F("leather_brown", "#5a3a24", 0.75 + 0.5 * leather_g(31), 0.35, 0.18)
    F("leather_dark", "#2e211a", 0.75 + 0.5 * leather_g(32), 0.3, 0.18)
    F("steel", "#c8ccd6", 0.6 + 0.65 * plate_g(33), 0.9, 0.3)
    F("darksteel", "#4a4e56", 0.6 + 0.65 * plate_g(34), 0.85, 0.3)
    F("gold", "#d8b040", 0.6 + 0.65 * plate_g(35), 0.95, 0.3)
    F("brass", "#b89048", 0.6 + 0.65 * plate_g(36), 0.9, 0.3)
    F("bone", "#e8e0c8", smooth_g(37, 0.06, 12), 0.25, 0.1)
    F("rope", "#a88a5a", 0.4 + rope_g(38), 0.0, 0.06)
    F("wood", "#6a4a2a", 0.4 + wood_g(39), 0.15, 0.3)
    F("black", "#141418", 0.6 + 0.5 * weave(8, 0.2, 40), 0.1, 0.1)
    F("glass", "#a9d3dc", glass_g(41), 0.95, 0.2)
    F("gem_red", "#c83a3a", gem_g(42), 0.95, 0.06)
    F("gem_blue", "#7fd4ff", gem_g(43), 0.95, 0.06)
    F("herb", "#3aa35a", 0.6 + 0.6 * leather_g(44), 0.05, 0.08)
    F("parchment", "#efe6cc", smooth_g(45, 0.07, 6), 0.0, 0.15)
    F("straw", "#d8c078", 0.4 + straw_g(46), 0.0, 0.12)
    F("white", "#f4f0e4", 0.4 + weave(8, 0.15, 47), 0.0, 0.1)
    F("fur_white", "#e8e0d0", 0.4 + fur_g(48), 0.0, 0.12)
    F("redcloth", "#8a2a2a", 0.4 + weave(8, 0.2, 49), 0.0, 0.1)
    F("glow_warm", "#ffd27a", glow_g(50), 1.0, 0.2)
    F("glow_blue", "#4ad0ff", glow_g(51), 1.0, 0.2)
    F("glow_rune", "#7fe8ff", glow_g(52), 1.0, 0.2)
    F("glow_ember", "#ff8c2a", glow_g(53), 1.0, 0.2)
    F("glow_wisp", "#dff6ff", glow_g(54), 1.0, 0.2)
    # stubble: skin (B = tinted by the skin) with short dark hairs (R = tinted by the beard colour)
    dots = (noise(1.1, 60) > 0.12)
    sk = np.ones((P, P, 3), np.float32) * srgb("#c8967a")[None, None, :]
    rgbs = np.where(dots[..., None], grey3(np.full((P, P), TINT_MEAN, np.float32)), sk)
    ms = np.zeros((P, P, 4), np.float32); ms[..., 2] = (~dots).astype(np.float32); ms[..., 0] = dots.astype(np.float32)
    out.append(T("stubble", "A", 0.0, 0.03, rgbs, None, ms))
    for e in EMBLEMS:
        rgb, a, m = emblem(e)
        out.append(T("emblem_" + e, "A", 0.8, 0.0, rgb, a, m))
    return out


def png(path, arr):
    """Write an RGBA float array (H, W, 4) in [0,1], row 0 = TOP, as an 8-bit PNG."""
    h, w, _ = arr.shape
    raw = (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)
    data = b"".join(b"\x00" + raw[y].tobytes() for y in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(data, 6)) + chunk(b"IEND", b""))


def main():
    os.makedirs(OUT, exist_ok=True)
    tiles = build()
    assert len(tiles) <= COLS * ROWS, f"{len(tiles)} tiles > {COLS * ROWS} cells"
    W, H = COLS * CELL, ROWS * CELL
    col = np.zeros((H, W, 4), np.float32); msk = np.zeros((H, W, 4), np.float32)
    meta = {"cell": CELL, "pad": PAD, "cols": COLS, "rows": ROWS, "tintMean": TINT_MEAN,
            "tintLum": round(float(((TINT_MEAN + 0.055) / 1.055) ** 2.4), 4), "tiles": {}}
    for i, t in enumerate(tiles):
        r, c = divmod(i, COLS)
        rgb = t["rgb"]; a = t["alpha"] if t["alpha"] is not None else np.ones((P, P), np.float32)
        m = t["mask"]
        if m is None:
            m = np.zeros((P, P, 4), np.float32)
            if t["channel"] == "A": m[..., 0] = 1
            if t["channel"] == "B": m[..., 1] = 1
            m[..., 3] = t["shine"]
        tile = np.concatenate([rgb, a[..., None]], -1)
        # wrap-around border: the cell holds the tile plus PAD px of its own opposite edges
        mode = "constant" if t["name"].startswith("emblem_") else "wrap"      # an emblem is used once, not repeated
        big = np.pad(tile, ((PAD, PAD), (PAD, PAD), (0, 0)), mode=mode)
        bigm = np.pad(m, ((PAD, PAD), (PAD, PAD), (0, 0)), mode=mode)
        col[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = big
        msk[r * CELL:(r + 1) * CELL, c * CELL:(c + 1) * CELL] = bigm
        meta["tiles"][t["name"]] = {"index": i, "channel": t["channel"], "shine": t["shine"], "world": t["world"]}
    png(os.path.join(OUT, "tiles.png"), col)
    png(os.path.join(OUT, "tiles-mask.png"), msk)
    json.dump(meta, open(os.path.join(OUT, "tiles.json"), "w"), indent=1)
    print("tiles", len(tiles), "->", OUT)


if __name__ == "__main__":
    main()
