# Chibi 4 shared Blender helpers (headless on the VM, or exec()d in the owner's Blender through Blender MCP).
import bpy, os
from mathutils import Vector

DIRS = {"front": (0, -1, 0.05), "back": (0, 1, 0.05), "right": (1, 0, 0.05), "left": (-1, 0, 0.05),
        "three_quarter": (0.7, -0.7, 0.25), "top": (0, -0.2, 1), "game": (0.35, -0.75, 0.75)}


def shot(path_base, views=("front",), center=(0, 0, 0.9), dist=3.0, size=640, engine="BLENDER_EEVEE", ortho=None,
         lens=50, samples=24):
    """Render the scene from named directions; returns the file paths (path_base + '_' + view + '.png')."""
    sc = bpy.context.scene
    camd = bpy.data.cameras.get("C4Cam") or bpy.data.cameras.new("C4Cam")
    cam = bpy.data.objects.get("C4Cam") or bpy.data.objects.new("C4Cam", camd)
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam; sc.render.engine = engine
    sc.render.resolution_x = sc.render.resolution_y = size
    if engine == "CYCLES":
        sc.cycles.samples = samples; sc.cycles.device = "CPU"; sc.cycles.use_denoising = True
    c = Vector(center); outs = []
    for v in views:
        d = Vector(DIRS[v] if isinstance(v, str) else v).normalized()
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        if ortho: camd.type = "ORTHO"; camd.ortho_scale = ortho
        else: camd.type = "PERSP"; camd.lens = lens
        p = f"{path_base}_{v if isinstance(v, str) else 'v'}.png"
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True); outs.append(p)
    return outs
