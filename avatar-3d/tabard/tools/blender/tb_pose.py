# Tabard: shared posing + rendering for the paint-over sheets and the checks.
import bpy, math, os
from mathutils import Matrix, Vector


def a_pose(arm, deg=52):
    """Lower both arms from the rest T-pose to an A-pose (rotation about the front axis at the shoulder joint)."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for side, sgn in (("_l", 1), ("_r", -1)):
        pb = arm.pose.bones["upperarm" + side]
        h = pb.bone.head_local
        R = Matrix.Translation(h) @ Matrix.Rotation(math.radians(deg) * sgn, 4, "Y") @ Matrix.Translation(-h)
        pb.matrix = R @ pb.matrix
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()


def flat_material(name, rgba, rough=0.9):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = rgba; b.inputs["Roughness"].default_value = rough
    return m


def ortho_views(path_base, views, height=2.05, size=(768, 1024), centre_z=0.98, engine="BLENDER_EEVEE", centre_xy=(0, 0)):
    """Orthographic renders, one file per view, the whole figure in frame (same scale for every view)."""
    sc = bpy.context.scene
    camd = bpy.data.cameras.get("TBCam") or bpy.data.cameras.new("TBCam")
    cam = bpy.data.objects.get("TBCam") or bpy.data.objects.new("TBCam", camd)
    if cam.name not in sc.collection.objects: sc.collection.objects.link(cam)
    sc.camera = cam; sc.render.engine = engine
    sc.render.resolution_x, sc.render.resolution_y = size
    camd.type = "ORTHO"; camd.ortho_scale = height * max(size) / size[1]
    DIRS = {"front": (0, -1, 0), "back": (0, 1, 0), "left": (1, 0, 0), "right": (-1, 0, 0)}
    outs = {}
    for v in views:
        d = Vector(DIRS[v]); c = Vector((centre_xy[0], centre_xy[1], centre_z))
        cam.location = c + d * 6
        cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
        p = f"{path_base}_{v}.png"; sc.render.filepath = p
        bpy.ops.render.render(write_still=True); outs[v] = p
    return outs
