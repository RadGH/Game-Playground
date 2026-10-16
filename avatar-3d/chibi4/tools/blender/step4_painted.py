# Chibi 4 — step 4: Codex-painted textures on the step-3 MakeHuman bodies, plus the slider push toward the reference.
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step4_painted.py -- <out_dir>
#
# What this step tests:
#   * Painted skin (face included) and hair: Codex repainted MakeHuman's own CC0 texture atlases in the reference sheets'
#     style, keeping the UV layout (it was given the original diffuse + the reference). The pictures live in
#     avatar-3d/chibi4/textures/ (made by tools/paint_textures.sh; registered back onto the original layout by
#     tools/register_texture.py so a few pixels of drift in Codex's output does not move the eyes).
#   * Sliders: bigger head (~6.8 heads tall instead of 7.9), larger eyes, broader shoulders for the mage, longer pointed
#     ears for the elf; the mage uses the CC0 skin that has a painted beard (no CC0 beard mesh exists in MakeHuman's packs).
# Clothes are still MakeHuman's stock modern suits — our own fantasy clothing is step 5.
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
C4 = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else os.path.join(C4, "shots", "step4")
TEX = os.path.join(C4, "textures")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
import c4lib, c4mh

bpy.ops.wm.read_factory_settings(use_empty=True)
X = {"mage": -0.45, "elf": 0.45}
roots, bodies = {}, {}
for who in ("mage", "elf"):
    bm, root = c4mh.build(f"C4_{who.title()}_S4", c4mh.STEP4[who], x=X[who])
    roots[who], bodies[who] = root, bm
    print("HEADS", who, c4mh.heads_tall(bm))


def paint(who):
    """Put the painted pictures on: skin on the body (MPFB shares one skin material between body and proxy), hair."""
    skin = os.path.join(TEX, f"{who}-skin.jpg")
    hair = os.path.join(TEX, f"{who}-hair.png")
    if os.path.exists(skin): print("skin", who, c4mh.set_diffuse(bodies[who], skin))
    h = c4mh.part(roots[who], "short02") or c4mh.part(roots[who], "braid")
    if h and os.path.exists(hair): print("hair", who, c4mh.set_diffuse(h, hair))


for who in ("mage", "elf"): paint(who)
c4mh.studio()

CENTRE = {"mage": 1.66, "elf": 1.55}
for who in ("mage", "elf"):
    c4mh.only(roots[who].name)
    c4lib.shot(os.path.join(OUT, f"s4{who}"), ("front", "three_quarter", "back", "left"), center=(X[who], 0, 0.9), dist=3.2, ortho=2.05, engine="CYCLES", samples=32)
    c4lib.shot(os.path.join(OUT, f"s4{who}face"), ("front", "three_quarter", "right"), center=(X[who], -0.02, CENTRE[who]), dist=1.0, ortho=0.42, engine="CYCLES", size=512, samples=48)
c4mh.show_all()
c4lib.shot(os.path.join(OUT, "s4game"), ("game",), center=(0, 0, 0.9), dist=9.0, lens=35, engine="CYCLES", size=512, samples=32)
print("TRIS", c4mh.tris(c4mh.children(roots["mage"])), c4mh.tris(c4mh.children(roots["elf"])))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "step4.blend"))
print("step4 done")
