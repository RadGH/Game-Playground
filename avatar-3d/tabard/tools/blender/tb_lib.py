# Tabard shared Blender helpers (headless Blender 5.2 at ~/opt/blender/blender).
import bpy, os, sys, math
from mathutils import Vector
HERE = os.path.dirname(os.path.abspath(__file__))
TABARD = os.path.normpath(os.path.join(HERE, "..", ".."))
ASSETS = os.path.join(TABARD, "assets")
QUAT = os.path.join(ASSETS, "quaternius")
UAL = os.path.normpath(os.path.join(TABARD, "..", "chibi4", "assets", "ual", "UAL1_Standard.glb"))
sys.path.insert(0, os.path.normpath(os.path.join(TABARD, "..", "chibi4", "tools", "blender")))
from c4lib import shot  # noqa: E402  (camera + render helper)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


def studio(bg=(0.32, 0.33, 0.36), sun=3.0):
    """Plain grey studio: a world colour, one sun and a soft fill. Used for every comparison shot."""
    sc = bpy.context.scene
    w = bpy.data.worlds.new("tb_world"); sc.world = w; w.use_nodes = True
    bgn = next(n for n in w.node_tree.nodes if n.type == "BACKGROUND")
    bgn.inputs[0].default_value = (*bg, 1); bgn.inputs[1].default_value = 1.0
    for name, rot, e in (("key", (math.radians(50), 0, math.radians(30)), sun), ("fill", (math.radians(70), 0, math.radians(-140)), sun * 0.35)):
        ld = bpy.data.lights.new(name, "SUN"); ld.energy = e
        lo = bpy.data.objects.new(name, ld); lo.rotation_euler = rot; sc.collection.objects.link(lo)
    sc.view_settings.view_transform = "Standard"


def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


def final_blend(body):
    """The finished body for every step after the swap-in pieces: build/<body>_fit.blend (tb_fit.py), else _uv.blend."""
    f = os.path.join(TABARD, "build", f"{body}_fit.blend")
    return f if os.path.exists(f) else os.path.join(TABARD, "build", f"{body}_uv.blend")
