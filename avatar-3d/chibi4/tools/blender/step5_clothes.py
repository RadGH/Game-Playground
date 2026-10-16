# Chibi 4 — step 5: the mage's robe and the elf's armour as OUR clothing on the step-4 MakeHuman bodies.
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step5_clothes.py -- <out_dir>
#
# What this step tests (owner's three wishes: modular, no face clipping, no skin through clothes):
#   * Every garment is MEASURED OFF THE BODY it is made for (c4clothes.py): offset shells of the body's own surface for
#     tight things (trousers, undershirt, jerkin, boots, bracers, pauldrons), stacked body outlines for loose things
#     (robe, mantle, collar, belt, tabard), tubes along the arm for bell sleeves. Change a slider and rebuild: it fits.
#   * BODY MASKING: every body vertex a garment covers is deleted from the render (vertex group 'c4_hidden' + a Mask
#     modifier) — nothing under the clothes, so nothing can poke through.
#   * Paint: the Codex reference pictures projected onto the clothes, each picture painting only what its camera sees
#     (step 2's method), baked to one texture per character.
#   * Hair / hat fit: a wizard hat built from the head's own outline, the hair under it pulled inside the band; close-ups
#     from six angles, and a count of hair/hat/collar vertices that sit inside the head (should be 0).
import bpy, math, os, sys, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
C4 = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(C4, "shots", "step5")
REF = os.path.join(C4, "ref"); TEX = os.path.join(C4, "textures")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
import c4lib, c4mh, c4clothes as cc

FAST = "--fast" in sys.argv          # skip renders (step 6/7 import build_character from here)


def ring_at(B, verts, z, n, centre, off, band=0.012):
    r = cc.sector_outline(B, verts, z, n, centre, band)
    return None if r is None else [x + off for x in r]


def landmarks(B):
    """Neck base (MakeHuman's neck bone starts at chin height, so the clavicles mark the base) and the chin."""
    ratio, h, head = c4mh.heads_tall(B.obj)
    return B.head("clavicle_l").z + 0.035, B.top - head, head


def boot(B, s, top_z, off, cuff=0.0, col=None):
    """A boot: the foot as one smooth loft heel->toe (no toes), a sole, and a shaft up the leg to top_z."""
    foot = B.pick(["foot_" + s, "ball_" + s, "calf_" + s], 0.4, zmax=B.head("foot_" + s).z + 0.05)
    pts = [B.co[i] for i in foot]
    heel = max(pts, key=lambda p: p.y); toe = min(pts, key=lambda p: p.y)
    zc = B.bot + 0.045
    f = cc.axis_loft(f"BootFoot_{s}", B, foot, Vector((heel.x, heel.y + 0.02, zc)), Vector((toe.x, toe.y - 0.022, zc)),
                     steps=22, n=28, off=off + 0.006, flat_bottom=B.bot - 0.012, col=col)
    leg = B.pick(["calf_" + s, "thigh_" + s], 0.4)
    rings = []; z = B.head("foot_" + s).z - 0.02
    while z <= top_z + 1e-4:
        sel = [B.co[i] for i in leg if abs(B.co[i].z - z) < 0.012]
        if sel:
            c = sum(sel, Vector()) / len(sel)
            t = max(0.0, (z - (top_z - 0.08)) / 0.08)
            r = ring_at(B, leg, z, 32, c, off + cuff * t)
            if r: rings.append((z, Vector((c.x, c.y, z)), r))
        z += 0.012
    sh = cc.hull_loft(f"BootShaft_{s}", B, cc.smooth_rings(rings, 3, 2), 32, col=col)
    cc.solidify(sh, 0.005, -1.0)
    return [f, sh]


# ------------------------------------------------------------------ the mage: robe, mantle, collar, sleeves, belt, boots
def mage_outfit(B, col):
    H, bot, n = B.H, B.bot, 64
    pel = B.head("pelvis"); neck = B.head("neck_01"); headb = B.head("head")
    C = Vector((B.cx, pel.y + 0.0, 0))
    torso = B.pick(cc.TORSO, 0.5)
    legs = B.pick(cc.LEG_L + cc.LEG_R + ["pelvis"], 0.3)
    z_hip = pel.z + 0.02
    z_hem = bot + 0.13 * H
    z_nb, z_chin, headH = landmarks(B)
    z_top = z_nb
    hip_ring = ring_at(B, torso | legs, z_hip, n, C, 0.0)
    rings = []
    z = z_hem
    while z <= z_top + 1e-4:
        cz = Vector((C.x, C.y, z))
        if z >= z_hip:
            r = ring_at(B, torso, z, n, C, 0.016) or rings[-1][2]
        else:
            t = (z_hip - z) / (z_hip - z_hem)
            body_r = ring_at(B, torso | legs, z, n, C, 0.02, band=0.02) or hip_ring
            # A-line: the hip outline widened toward the hem (the reference's hem is ~1.6x the hips)
            cone = [hip_ring[k] * (1.0 + 0.8 * t ** 1.2) + 0.02 for k in range(n)]
            r = [max(a, b) for a, b in zip(body_r, cone)]
        rings.append((z, cz, r)); z += 0.015
    rings = cc.smooth_rings(rings, 3, 2)
    robe = cc.hull_loft("Robe", B, rings, n, col=col)

    # mantle: a short shoulder cape, its outline includes the tops of the arms
    z_arm = B.head("upperarm_l").z
    mant_verts = torso | B.pick(cc.ARM_L + cc.ARM_R, 0.3, zmin=z_arm - 0.14)
    mrings = []
    z = z_arm - 0.12
    while z <= z_top + 0.002:
        r = ring_at(B, mant_verts, z, n, C, 0.034, band=0.015)
        if r: mrings.append((z, Vector((C.x, C.y, z)), r))
        z += 0.012
    mantle = cc.hull_loft("Mantle", B, cc.smooth_rings(mrings, 3, 2), n, col=col)

    # high collar: from the neck base up to half the neck, flared
    # a stand collar: below the jaw at the front, up behind the head at the back (it must never touch the chin)
    neckv = B.pick(["neck_01", "spine_03", "head", "clavicle_l", "clavicle_r"], 0.3, zmin=z_nb - 0.05, zmax=z_chin + 0.06)
    nr = ring_at(B, neckv, z_chin - 0.045, n, C, 0.0, band=0.012)
    crings = []; steps = 6
    ztop = [z_chin - 0.045 + 0.085 * (0.5 + 0.5 * math.sin(2 * math.pi * (k + 0.5) / n)) for k in range(n)]
    for k in range(steps + 1):
        t = k / steps
        zs = [z_nb - 0.02 + (zt - z_nb + 0.02) * t for zt in ztop]
        base = ring_at(B, neckv, z_nb - 0.02, n, C, 0.0, band=0.015)
        r = [b * (1 - t) + a * t + 0.016 + 0.03 * t ** 1.5 for a, b in zip(nr, base)]
        crings.append((zs, Vector((C.x, C.y, 0)), r))
    collar = cc.hull_loft("Collar", B, crings, n, col=col)

    # bell sleeves along each arm, cuff closing round the wrist
    sleeves = []
    for s in ("l", "r"):
        sh, el, wr = B.head(f"upperarm_{s}"), B.head(f"lowerarm_{s}"), B.head(f"hand_{s}")
        sh = sh.lerp(Vector((B.cx, sh.y, sh.z)), 0.18)
        path = []
        for k in range(13):
            t = k / 12
            p = sh.lerp(el, t * 2) if t < 0.5 else el.lerp(wr + (wr - el).normalized() * 0.015, (t - 0.5) * 2)
            r = 0.072 + 0.06 * max(0.0, (t - 0.4) / 0.6) ** 1.5
            path.append((p, r))
        sleeves.append(cc.tube(f"Sleeve_{s}", path, n=28, cuff=(0.11, 0.034), col=col))

    # belt + pouches on the robe's own outline
    z_belt = bot + 0.6 * H
    br = next(r for z, c, r in rings if z >= z_belt - 0.008)
    belt = cc.hull_loft("Belt", B, [(z_belt - 0.032, Vector((C.x, C.y, z_belt - 0.032)), [x + 0.012 for x in br]),
                                    (z_belt + 0.032, Vector((C.x, C.y, z_belt + 0.032)), [x + 0.012 for x in br])], n, col=col)

    def on_surface(angle_deg, z, out):
        a = math.radians(angle_deg)
        k = int((a % (2 * math.pi)) / (2 * math.pi) * n) % n
        rr = next(r for zz, c, r in rings if zz >= z - 0.008)[k] + out
        return Vector((C.x + rr * math.cos(a), C.y + rr * math.sin(a), z)), Vector((math.cos(a), math.sin(a), 0))
    p1, f1 = on_surface(-125, z_belt - 0.075, 0.03)       # character's right front (-x, -y)
    p2, f2 = on_surface(-30, z_belt - 0.07, 0.025)        # left hip
    pouches = [cc.box("Pouch_r", p1, (0.12, 0.05, 0.12), f1, col=col), cc.box("Pouch_l", p2, (0.065, 0.045, 0.1), f2, col=col)]

    # trousers (seen between hem and boot) and boots
    knee = B.head("calf_l").z
    trousers = cc.shell("Trousers", B, B.pick(cc.LEG_L + cc.LEG_R, 0.5, zmax=pel.z), 0.007, col=col)[0]
    boot_top = bot + 0.13 * H
    boots = boot(B, "l", boot_top, 0.016, cuff=0.012, col=col) + boot(B, "r", boot_top, 0.016, cuff=0.012, col=col)
    pieces = [robe, mantle, collar, belt, trousers] + boots + sleeves + pouches
    for p in (robe, mantle, collar, belt) + tuple(sleeves): cc.solidify(p, 0.006, -1.0)
    return pieces


# ------------------------------------------------------------------ the elf: undershirt, jerkin, trousers, boots, bracers,
# pauldrons, tabard, belt, pouch, scabbard
def elf_outfit(B, col):
    H, bot, n = B.H, B.bot, 64
    pel = B.head("pelvis"); neck = B.head("neck_01")
    C = Vector((B.cx, pel.y, 0))
    torso = B.pick(cc.TORSO, 0.5)
    under = cc.shell("Undershirt", B, B.pick(cc.TORSO + cc.ARM_L + cc.ARM_R, 0.5, zmin=pel.z - 0.02, zmax=neck.z - 0.005), 0.004, col=col)[0]
    jerkin = cc.shell("Jerkin", B, B.pick(cc.TORSO, 0.55, zmin=pel.z - 0.05, zmax=neck.z - 0.01,
                                          test=lambda c, no, i: abs(c.x - B.cx) < 0.17), 0.011, taper=0.004, col=col)[0]
    trousers = cc.shell("Trousers", B, B.pick(cc.LEG_L + cc.LEG_R + ["pelvis"], 0.45, zmax=pel.z), 0.006, col=col)[0]
    knee = B.head("calf_l").z
    boots = boot(B, "l", knee + 0.08, 0.014, cuff=0.025, col=col) + boot(B, "r", knee + 0.08, 0.014, cuff=0.025, col=col)
    bracers = []
    for s in ("l", "r"):
        el, wr = B.head(f"lowerarm_{s}"), B.head(f"hand_{s}")
        ax = wr - el

        def near_wrist(c, no, i, el=el, ax=ax):
            t = (c - el).dot(ax) / ax.length_squared
            return 0.3 < t < 0.97
        bracers.append(cc.shell(f"Bracer_{s}", B, B.pick([f"lowerarm_{s}"], 0.5, test=near_wrist), 0.014, taper=0.004, col=col)[0])
    pauld = []
    for s in ("l", "r"):
        sh, el = B.head(f"upperarm_{s}"), B.head(f"lowerarm_{s}")
        ax = (el - sh).normalized()
        up = Vector((0, 0, 1)) - ax * ax.z; up.normalize()
        near = B.pick(["clavicle_" + s, "upperarm_" + s, "spine_03"], 0.3,
                      test=lambda c, no, i, sh=sh, ax=ax: -0.06 < (c - sh).dot(ax) < 0.2 and ((c - sh) - ax * (c - sh).dot(ax)).length < 0.11)
        for layer, (a, b, off) in enumerate(((-0.07, 0.17, 0.034), (-0.045, 0.1, 0.056))):
            pl = cc.axis_loft(f"Pauldron_{s}{layer}", B, near, sh + ax * a, sh + ax * b, steps=14, n=32, off=off,
                              cap0=False, cap1=False, col=col)
            cc.keep_side(pl, sh, ax, up, margin=0.02 + 0.01 * layer)
            cc.solidify(pl, 0.006, -1.0)
            pauld.append(pl)
    # belt at the hips (on the jerkin/trousers outline), tabard front + back panels with pointed ends
    z_belt = pel.z + 0.01
    hips = torso | B.pick(cc.LEG_L + cc.LEG_R, 0.3)
    br = ring_at(B, hips, z_belt, n, C, 0.02)
    belt = cc.hull_loft("Belt", B, [(z_belt - 0.028, Vector((C.x, C.y, z_belt - 0.028)), br),
                                    (z_belt + 0.028, Vector((C.x, C.y, z_belt + 0.028)), br)], n, col=col)
    z_tab = knee + 0.06
    trings = []; z = z_belt - 0.02
    while z >= z_tab - 0.1:
        t = (z_belt - z) / (z_belt - z_tab)
        r = ring_at(B, hips, z, n, C, 0.03 + 0.035 * t, band=0.02) or br
        trings.append((z, Vector((C.x, C.y, z)), r)); z -= 0.015
    trings = cc.smooth_rings(list(reversed(trings)), 4, 3)
    pointed = lambda a, mid: z_tab - 0.1 + 0.15 * min(1.0, abs(a - mid) / 34)
    tab = cc.join([cc.panel("Tabard_f", trings, n, -124, -56, lambda a: pointed(a, -90), col=col),
                   cc.panel("Tabard_b", trings, n, 56, 124, lambda a: pointed(a, 90), col=col)], "Tabard")
    cc.solidify(tab, 0.005, -1.0); cc.solidify(belt, 0.004, -1.0)
    # a pouch on the right hip and a scabbard on the left hip
    a = math.radians(-140)
    pr = br[int((a % (2 * math.pi)) / (2 * math.pi) * n) % n] + 0.03
    pouch = cc.box("Pouch", Vector((C.x + pr * math.cos(a), C.y + pr * math.sin(a), z_belt - 0.06)), (0.08, 0.04, 0.09),
                   Vector((math.cos(a), math.sin(a), 0)), col=col)
    a = math.radians(-15)
    sr = br[int((a % (2 * math.pi)) / (2 * math.pi) * n) % n] + 0.04
    top = Vector((C.x + sr * math.cos(a), C.y + sr * math.sin(a), z_belt + 0.02))
    scab = cc.tube("Scabbard", [(top, 0.024), (top + Vector((0.07, 0.10, -0.62)), 0.02), (top + Vector((0.075, 0.105, -0.66)), 0.006)], n=12, col=col)
    hilt = cc.tube("Hilt", [(top + Vector((-0.02, -0.03, 0.02)), 0.014), (top + Vector((-0.04, -0.06, 0.18)), 0.012),
                            (top + Vector((-0.045, -0.065, 0.2)), 0.022), (top + Vector((-0.047, -0.067, 0.215)), 0.004)], n=12, col=col)
    return [under, jerkin, trousers, belt, tab, pouch, scab, hilt] + boots + bracers + pauld


# ------------------------------------------------------------------ a hat fitted to the head + the hair tucked under it
def fit_hat(B, hair, col):
    import bmesh
    headH = 0.25 * B.H / 1.8 * 1.0
    top = B.top
    headv = B.pick(["head"], 0.6)
    z_band = top - 0.42 * landmarks(B)[2]
    hv = [B.co[i] for i in headv]
    cx = sum(p.x for p in hv) / len(hv); cy = sum(p.y for p in hv if p.z > z_band) / max(1, sum(1 for p in hv if p.z > z_band))
    Cc = Vector((cx, cy, 0)); n = 48
    # the band must clear the HAIR (not only the scalp) where the hair is thin, and the skull everywhere
    rb = ring_at(B, headv, z_band, n, Cc, 0.03, band=0.012)
    rings = [(z_band - 0.004, Vector((cx, cy, z_band - 0.004)), rb)]
    tipz = top + 0.30
    for k in range(1, 9):
        t = k / 8
        z = z_band + (tipz - z_band) * t
        shrink = (1 - t) ** 1.25
        rings.append((z, Vector((cx, cy + 0.07 * t ** 2, z)), [max(0.004, r * shrink) for r in rb]))
    crown = cc.hull_loft("Hat", B, rings, n, col=col)
    brim = cc.hull_loft("HatBrim", B, [(z_band - 0.01, Vector((cx, cy, z_band - 0.01)), [r + 0.13 for r in rb]),
                                       (z_band - 0.003, Vector((cx, cy, z_band - 0.003)), [r - 0.004 for r in rb])], n, col=col)
    cc.solidify(crown, 0.004, -1.0); cc.solidify(brim, 0.006, 0.0)
    # tuck the hair: anything above the band and outside the hat's inside wall moves inward to sit under it
    moved = 0
    if hair:
        me = hair.data
        sk = me.shape_keys
        for v in me.vertices:
            p = hair.matrix_world @ v.co
            if p.z < z_band - 0.015: continue
            a = math.atan2(p.y - cy, p.x - cx); k = int((a % (2 * math.pi)) / (2 * math.pi) * n) % n
            t = max(0.0, min(1.0, (p.z - z_band) / (tipz - z_band)))
            limit = rb[k] * (1 - t) ** 1.25 - 0.008
            d = math.hypot(p.x - cx, p.y - cy)
            if d > limit and p.z >= z_band - 0.015:
                f = max(0.3, limit / d)
                q = Vector((cx + (p.x - cx) * f, cy + (p.y - cy) * f, min(p.z, z_band + 0.06)))
                hit = B.bvh.find_nearest(q)               # never into the skull: stay 3 mm outside the scalp
                if hit[0] is not None and (q - hit[0]).dot(hit[1]) < 0.003: q = hit[0] + hit[1] * 0.003
                v.co = hair.matrix_world.inverted() @ q; moved += 1
    return [crown, brim], moved


def build_character(who, x=0.0, hat=False, col=None):
    """Step-4 body + painted textures + this step's outfit, masked and skinned. Returns a dict of the parts."""
    bm, root = c4mh.build(f"C4_{who.title()}", c4mh.STEP4[who], x=x, clothes=[])
    skin = os.path.join(TEX, f"{who}-skin.jpg"); hairtex = os.path.join(TEX, f"{who}-hair.png")
    if os.path.exists(skin): c4mh.set_diffuse(bm, skin)
    hair = c4mh.part(root, "short02") or c4mh.part(root, "braid")
    if hair and os.path.exists(hairtex): c4mh.set_diffuse(hair, hairtex)
    B = cc.Body(bm, root)
    col = col or bpy.context.scene.collection
    pieces = mage_outfit(B, col) if who == "mage" else elf_outfit(B, col)
    hatp, moved = ([], 0)
    if hat: hatp, moved = fit_hat(B, hair, col)
    for p in pieces + hatp:
        # tag pieces before solidify copies them (step 6 finds the robe, its hem, the tabard and the boots after the join)
        kind = 1 if p.name.startswith("Robe") else 2 if p.name.startswith("Boot") else 3 if p.name.startswith("Tabard") else 4 if p.name.startswith("Mantle") else 0
        zs = [v.co.z for v in p.data.vertices]; zmin = min(zs)
        a = p.data.attributes.new("c4_piece", "INT", "POINT"); a.data.foreach_set("value", [kind] * len(zs))
        h = p.data.attributes.new("c4_hem", "INT", "POINT")
        h.data.foreach_set("value", [1 if kind in (1, 3) and z < zmin + 0.004 else 0 for z in zs])
        cc.apply_mods(p)
    # what the clothes cover disappears (the head, neck above the collar and the hands are never candidates)
    cand = {i for i in B.idx if B.wsum(i, ["head", "neck_01"]) < 0.3 and not any(k.startswith(("hand", "index", "middle", "ring", "pinky", "thumb")) for k, w in B.w[i].items() if w > 0.3)}
    hide = cc.covered(B, pieces, cand, reach=0.35)
    cc.mask_body(bm, hide)
    return dict(body=bm, rig=root, B=B, pieces=pieces, hat=hatp, hair=hair, hidden=hide, moved=moved)


def paint(who, ch, out_png):
    """Join the outfit, unwrap, and bake the reference pictures onto it (step 2's sight-aware projection)."""
    B = ch["B"]
    clothes = cc.join(ch["pieces"], f"C4_{who.title()}_Clothes")
    cc.unwrap(clothes)
    xs = [clothes.matrix_world @ v.co for v in clothes.data.vertices]
    ymid = (min(p.y for p in xs) + max(p.y for p in xs)) / 2
    occ = [clothes, ch["body"]] + ([ch["hair"]] if ch["hair"] else [])
    if who == "mage":
        pics = {"front": (cc.Pic(os.path.join(REF, "mage-front.png"), (81, 21, 647, 1065), "x", 1, B.H, B.bot, B.cx), Vector((0, -1, 0))),
                "back": (cc.Pic(os.path.join(REF, "mage-back.png"), (354, 23, 658, 1064), "x", -1, B.H, B.bot, B.cx), Vector((0, 1, 0)))}
        side = os.path.join(REF, "mage-side.png"); sbox = (157, 23, 240, 1063)
    else:
        tp = os.path.join(REF, "warrior-turnaround.png")
        fbox = cc.figure_box(tp, 0, 780); sbox = cc.figure_box(tp, 780, None); side = tp
        pics = {"front": (cc.Pic(tp, fbox, "x", 1, B.H, B.bot, B.cx), Vector((0, -1, 0)))}
        back = os.path.join(REF, "warrior-back.png")
        if os.path.exists(back):
            pics["back"] = (cc.Pic(back, cc.figure_box(back), "x", -1, B.H, B.bot, B.cx), Vector((0, 1, 0)))
        else:
            # stand-in until Codex paints the elf's back view: the front picture seen from behind (left stays left), at
            # half weight-quality — tabard, boots, pauldrons and trousers are the same front and back
            pics["back"] = (cc.Pic(tp, fbox, "x", -1, B.H, B.bot, B.cx), Vector((0, 1, 0)))
    sp = cc.Pic(side, sbox, "y", -1, B.H, B.bot, ymid)
    pics["left"] = (sp, Vector((-1, 0, 0))); pics["right"] = (sp, Vector((1, 0, 0)))
    cc.project_bake(clothes, pics, occ, out_png)
    cc.skin_to(clothes, B, ch["rig"])
    ch["clothes"] = clothes
    return clothes


if __name__ == "__main__" and not FAST:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    X = {"mage": -0.5, "elf": 0.5}
    chars = {}
    report = {}
    for who in ("mage", "elf"):
        ch = build_character(who, X[who], hat=False)
        chars[who] = ch
        clip_before = cc.clip_report(ch["B"], ch["pieces"], hidden=None)
        paint(who, ch, os.path.join(OUT, f"{who}-clothes.png"))
        face = [o for o in (ch["hair"], c4mh.part(ch["rig"], "eyebrow"), c4mh.part(ch["rig"], "eyelash")) if o]
        clip_face = cc.clip_report(ch["B"], face)
        report[who] = {"hidden_body_vertices": len(ch["hidden"]), "body_vertices": len(ch["B"].idx),
                       "garment_vertices_inside_visible_body": {k: v for k, v in cc.clip_report(ch["B"], [ch["clothes"]], hidden=ch["hidden"]).items()},
                       "hair_brows_lashes_inside_head": clip_face,
                       "triangles": c4mh.tris(c4mh.children(ch["rig"]))}
        print("REPORT", who, json.dumps(report[who]))
    c4mh.studio()
    CENTRE = {"mage": 1.68, "elf": 1.57}
    for who in ("mage", "elf"):
        c4mh.only(chars[who]["rig"].name)
        c4lib.shot(os.path.join(OUT, f"s5{who}"), ("front", "three_quarter", "back", "left"), center=(X[who], 0, 0.92), dist=3.2, ortho=2.1, engine="CYCLES", samples=32)
        c4lib.shot(os.path.join(OUT, f"s5{who}face"), ("front", "three_quarter", "right"), center=(X[who], -0.02, CENTRE[who]), dist=1.0, ortho=0.45, engine="CYCLES", size=512, samples=40)
    c4mh.show_all()
    c4lib.shot(os.path.join(OUT, "s5game"), ("game",), center=(0, 0, 0.9), dist=9.0, lens=35, engine="CYCLES", size=512, samples=32)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "step5.blend"))
    # the hat test: the mage again with a hat, six close-ups each for hair and hat
    bpy.ops.wm.read_factory_settings(use_empty=True)
    six = [(0, -1, 0.05), (0.7, -0.7, 0.1), (1, 0, 0.05), (0.6, 0.8, 0.1), (-0.7, -0.5, 0.45), (0.2, -0.6, -0.35)]
    for who, hat in (("mage", True), ("elf", False), ("mage", False)):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        ch = build_character(who, 0.0, hat=hat)
        c4mh.studio()
        if hat:
            for p in ch["hat"]:
                m = bpy.data.materials.new("hatcloth"); m.use_nodes = True
                b = next(nn for nn in m.node_tree.nodes if nn.type == "BSDF_PRINCIPLED")
                b.inputs["Base Color"].default_value = (0.05, 0.07, 0.22, 1); b.inputs["Roughness"].default_value = 0.85
                p.data.materials.append(m)
        tag = f"{who}{'_hat' if hat else ''}"
        hz = ch["B"].top - 0.12
        for k, d in enumerate(six):
            c4lib.shot(os.path.join(OUT, f"s5fit_{tag}_{k}"), (d,), center=(0, 0.0, hz), dist=1.2, ortho=0.62 if hat else 0.45, engine="CYCLES", size=384, samples=24)
        face = [o for o in (ch["hair"], c4mh.part(ch["rig"], "eyebrow"), c4mh.part(ch["rig"], "eyelash")) if o] + ch["hat"]
        rep = cc.clip_report(ch["B"], face)
        report.setdefault("fit", {})[tag] = {"inside_head": rep, "hair_vertices_tucked_under_hat": ch["moved"]}
        print("FIT", tag, json.dumps(report["fit"][tag]))
    json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
    print("step5 done")
