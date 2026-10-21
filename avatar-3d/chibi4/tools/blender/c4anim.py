# Chibi 4 — step 6: animation on the MakeHuman 'game_engine' rig, and a robe whose hem the feet cannot get through.
#
#   load_library()             import Quaternius' Universal Animation Library (CC0, vendored in avatar-3d/assets/quaternius)
#   retarget(...)              copy a clip onto our rig BY BONE NAME (both are the same UE-style skeleton: pelvis,
#                              spine_01..03, thigh_l...). Each bone takes the source bone's world rotation, corrected for
#                              the difference between the two rest poses (Quaternius rests in a T, MakeHuman in an A), so
#                              limbs point where the source's point. stride < 1 scales the leg swing (robe-aware stride).
#   add_skirt_bones(...)       8 bones round the hips, pivoting at hip-joint height, each hanging to the hem
#   skirt_weights(...)         robe vertices below the hips follow the two nearest skirt bones (by angle), fading into the
#                              pelvis above
#   drive_skirt(...)           per frame: a skirt bone at the front swings as far forward as the FURTHER-forward thigh,
#                              one at the back as far back as the further-back thigh, side ones follow their own leg —
#                              so the cloth is always ahead of the knee and foot; baked as keys (exports to glTF)
#   measure_feet(...)          per frame: boot vertices vs the robe; a vertex outside the cloth above the hem is a
#                              poke-through; for the rest, the smallest gap between foot and the inside of the robe
import bpy, math, os
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

UAL = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "ual", "UAL1_Standard.glb"))
CLIPS = {"idle": "Idle_Loop", "walk": "Walk_Loop", "run": "Jog_Fwd_Loop", "cast": "Spell_Simple_Shoot",
         "attack": "Sword_Attack", "hit": "Hit_Chest", "death": "Death01", "talk": "Idle_Talking_Loop"}
LEGS = ("thigh_l", "thigh_r", "calf_l", "calf_r")
DEBUG = False


def load_library():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=UAL)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    for o in new:
        if o is not arm: o.hide_render = True; o.hide_viewport = True
    arm.hide_render = True
    if arm.animation_data is None: arm.animation_data_create()
    return arm


def _src_name(src, name):
    if name in src.pose.bones: return name
    low = {b.name.lower(): b.name for b in src.pose.bones}
    return low.get(name.lower())


def _order(rig):
    out = []
    def walk(b):
        out.append(b)
        for c in b.children: walk(c)
    for b in rig.data.bones:
        if b.parent is None: walk(b)
    return out


def leg_extent(src, clip):
    """The largest thigh swing (from straight down) and knee bend in a source clip, in degrees."""
    act = bpy.data.actions[clip]; src.animation_data.action = act
    f0, f1 = (int(x) for x in act.frame_range); th = kn = 0.0
    W = src.matrix_world.to_3x3()
    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        for sd in "lr":
            t = src.pose.bones[_src_name(src, "thigh_" + sd)]; c = src.pose.bones[_src_name(src, "calf_" + sd)]
            dt = (W @ (t.tail - t.head)).normalized(); dc = (W @ (c.tail - c.head)).normalized()
            th = max(th, math.degrees(dt.angle(Vector((0, 0, -1))))); kn = max(kn, math.degrees(dt.angle(dc)))
    return th, kn


def robe_stride(src, clip, max_swing=24.0, max_knee=55.0):
    """A robe-aware stride for a clip: scale factors that bring its biggest thigh swing and knee bend within a long
    robe's reach (a person in a floor-length robe takes short steps and does not kick their heels up)."""
    th, kn = leg_extent(src, clip)
    return {"thigh": min(1.0, max_swing / max(th, 1e-3)), "calf_": min(1.0, max_knee / max(kn, 1e-3)),
            "_extent": (round(th, 1), round(kn, 1))}


def retarget(src, clip, rig, name, stride=1.0, frames=None):
    """Bake `clip` (an action on the Quaternius armature) onto `rig` as a new action called `name`. stride: one factor
    for all leg bones, or {"thigh": k, "calf_": k} (see robe_stride)."""
    act = bpy.data.actions[clip]
    src.animation_data.action = act
    f0, f1 = (int(x) for x in act.frame_range)
    frames = frames or list(range(f0, f1 + 1))
    sc = bpy.context.scene
    Wsrc, Wt = src.matrix_world, rig.matrix_world
    Wt_inv = Wt.inverted()
    bones = _order(rig)
    # rest frames (world) and the per-bone correction between the two rests
    corr = {}
    for b in bones:
        sn = _src_name(src, b.name)
        if not sn: continue
        sb = src.data.bones[sn]
        s_rest = (Wsrc @ sb.matrix_local).to_quaternion()
        t_rest = (Wt @ b.matrix_local).to_quaternion()
        s_dir = (Wsrc.to_3x3() @ (sb.tail_local - sb.head_local)).normalized()
        t_dir = (Wt.to_3x3() @ (b.tail_local - b.head_local)).normalized()
        align = t_dir.rotation_difference(s_dir) if b.name not in ("Root", "pelvis") else Quaternion()
        corr[b.name] = (sn, s_rest.inverted() @ (align @ t_rest))
    # hip height ratio for the pelvis translation
    s_hip = (Wsrc @ src.data.bones[_src_name(src, "pelvis")].head_local).z
    t_hip = (Wt @ rig.data.bones["pelvis"].head_local).z
    k_hip = t_hip / max(1e-6, s_hip)
    s_pel_rest = Wsrc @ src.data.bones[_src_name(src, "pelvis")].head_local
    new = bpy.data.actions.new(name); new.use_fake_user = True
    if rig.animation_data is None: rig.animation_data_create()
    rig.animation_data.action = new
    for pb in rig.pose.bones: pb.rotation_mode = "QUATERNION"
    for f in frames:
        sc.frame_set(f)
        pose_arm = {}
        for b in bones:
            pb = rig.pose.bones[b.name]
            rest = b.matrix_local
            if b.name in corr:
                sn, O = corr[b.name]
                s_world = (Wsrc @ src.pose.bones[sn].matrix).to_quaternion()
                q_world = s_world @ O
                R = (Wt_inv.to_quaternion() @ q_world).to_matrix().to_4x4()
            else:
                R = (pose_arm[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest)).to_3x3().normalized().to_4x4() if b.parent else rest.to_3x3().to_4x4()
            if b.parent:
                head = pose_arm[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest).to_translation()
            else:
                head = rest.to_translation()
            if b.name == "pelvis":
                s_now = Wsrc @ src.pose.bones[_src_name(src, "pelvis")].head
                delta = (s_now - s_pel_rest) * k_hip              # bob and sway, scaled to our hip height
                head = rest.to_translation() + Wt_inv.to_3x3() @ delta
            M = Matrix.Translation(head) @ R
            pose_arm[b.name] = M
            rel = (b.parent.matrix_local.inverted() @ rest) if b.parent else rest
            par = pose_arm[b.parent.name] if b.parent else Matrix()
            basis = rel.inverted() @ par.inverted() @ M
            loc, q, _ = basis.decompose()
            k = stride.get(b.name[:5], 1.0) if isinstance(stride, dict) else stride
            if (b.name in LEGS or b.name.startswith("spine")) and k != 1.0:
                q = Quaternion().slerp(q, k)
                M = par @ rel @ Matrix.Translation(loc) @ q.to_matrix().to_4x4()
                pose_arm[b.name] = M
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if b.name == "pelvis":
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
    new.frame_range = (frames[0], frames[-1])
    return new


# ------------------------------------------------------------------ skirt bones
SKIRT_N = 8


def add_skirt_bones(rig, centre, hip_z, ring_r, hem_z, hem_r):
    """ring_r(angle)/hem_r(angle): radii (m) round `centre` at the pivot height and at the hem."""
    bpy.context.view_layer.objects.active = rig
    for o in bpy.context.view_layer.objects: o.select_set(False)
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    eb = rig.data.edit_bones
    inv = rig.matrix_world.inverted()
    for i in range(SKIRT_N):
        a = 2 * math.pi * i / SKIRT_N
        d = Vector((math.cos(a), math.sin(a), 0))
        b = eb.new(f"skirt_{i}")
        b.head = inv @ (centre + d * (ring_r(a) * 0.35) + Vector((0, 0, hip_z)))
        b.tail = inv @ (centre + d * hem_r(a) + Vector((0, 0, hem_z)))
        b.parent = eb["pelvis"]; b.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    for i in range(SKIRT_N): rig.pose.bones[f"skirt_{i}"].rotation_mode = "QUATERNION"


def skirt_weights(obj, centre, z_full, z_free, pieces=(1,)):
    """Robe (piece 1) / tabard (piece 3) vertices: below z_full they follow the skirt bones only; between z_full and
    z_free they fade into the weights they already had (pelvis, spine); above z_free untouched."""
    me = obj.data
    kind = [0] * len(me.vertices); me.attributes["c4_piece"].data.foreach_get("value", kind)
    for i in range(SKIRT_N):
        if f"skirt_{i}" not in obj.vertex_groups: obj.vertex_groups.new(name=f"skirt_{i}")
    names = {g.index: g.name for g in obj.vertex_groups}
    n = 0
    for v in me.vertices:
        if kind[v.index] not in pieces: continue
        p = obj.matrix_world @ v.co
        if p.z >= z_free: continue
        f = 1.0 if p.z <= z_full else (z_free - p.z) / (z_free - z_full)
        f = f * f * (3 - 2 * f)
        a = math.atan2(p.y - centre.y, p.x - centre.x) % (2 * math.pi)
        x = a / (2 * math.pi) * SKIRT_N; i0 = int(x) % SKIRT_N; i1 = (i0 + 1) % SKIRT_N; u = x - int(x)
        old = {names[g.group]: g.weight * (1 - f) for g in v.groups}
        new = dict(old)
        new[f"skirt_{i0}"] = new.get(f"skirt_{i0}", 0) + f * (1 - u)
        new[f"skirt_{i1}"] = new.get(f"skirt_{i1}", 0) + f * u
        top = sorted(new.items(), key=lambda kv: -kv[1])[:4]; s = sum(w for _, w in top) or 1
        for g in list(v.groups): obj.vertex_groups[g.group].remove([v.index])
        for b, w in top: obj.vertex_groups[b].add([v.index], w / s, "REPLACE")
        n += 1
    return n


def _leg_angles(rig, side):
    """Thigh swing in the pelvis's own frame: (pitch forward +, roll outward +) in radians, pose vs rest."""
    pel = rig.pose.bones["pelvis"]; th = rig.pose.bones["thigh_" + side]
    Pp = pel.matrix.to_3x3().normalized(); Pr = rig.data.bones["pelvis"].matrix_local.to_3x3().normalized()
    d = Pp.inverted() @ (th.tail - th.head); d0 = Pr.inverted() @ (rig.data.bones["thigh_" + side].tail_local - rig.data.bones["thigh_" + side].head_local)
    # pelvis local axes are bone axes: express in the rig's rest frame instead
    d = Pr @ d; d0 = Pr @ d0
    pitch = math.atan2(-d.y, -d.z) - math.atan2(-d0.y, -d0.z)
    out = 1 if side == "l" else -1
    roll = (math.atan2(d.x * out, -d.z) - math.atan2(d0.x * out, -d0.z))
    return pitch, roll


def drive_skirt(rig, action, margin=1.25):
    """Key every skirt bone on every frame of `action` from the two thighs (see module notes)."""
    rig.animation_data.action = action
    f0, f1 = (int(x) for x in action.frame_range)
    sc = bpy.context.scene
    Pr = rig.data.bones["pelvis"].matrix_local.to_3x3().normalized()
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        pl, rl = _leg_angles(rig, "l"); pr, rr = _leg_angles(rig, "r")
        for i in range(SKIRT_N):
            a = 2 * math.pi * i / SKIRT_N
            ca, sa = math.cos(a), math.sin(a)
            wf, wb, ws = max(0, -sa) ** 2, max(0, sa) ** 2, ca * ca
            side_p = pl if ca > 0 else pr
            pitch = margin * (wf * max(pl, pr, 0) + wb * min(pl, pr, 0) + ws * side_p)
            roll_side = rl if ca > 0 else rr
            roll = ws * max(0.0, roll_side) * (1 if ca > 0 else -1)
            # rotation in the rig's rest frame: pitch about x (forward = toward -y), roll about y
            Rrig = Matrix.Rotation(-pitch, 3, "X") @ Matrix.Rotation(-roll, 3, "Y")
            b = rig.data.bones[f"skirt_{i}"]
            Bl = b.matrix_local.to_3x3().normalized()
            # the bone's basis rotation: rest^-1 . (rotation in parent(pelvis)-rest space) . rest
            Prel = Pr.inverted() @ Rrig @ Pr
            q = (Bl.inverted() @ Pr @ Prel @ Pr.inverted() @ Bl).to_quaternion()
            pb = rig.pose.bones[f"skirt_{i}"]
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=f)


# ------------------------------------------------------------------ the measurement
def measure_feet(obj, rig, action, frames=None, step=1):
    """Per frame: boot vertices (c4_piece 2) against the robe (c4_piece 1).
    A boot vertex counts as POKING THROUGH when it is outside the robe's cloth (further from the hips' vertical axis
    than the nearest robe point) while above the hem there. For boot vertices under the robe, the gap to the cloth is
    measured; the result per frame is (pokes, smallest gap in metres)."""
    rig.animation_data.action = action
    f0, f1 = (int(x) for x in action.frame_range)
    frames = frames or list(range(f0, f1 + 1, step))
    sc = bpy.context.scene
    out = []
    for f in frames:
        sc.frame_set(f)
        deps = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(deps); me = ev.to_mesh()
        kind = [0] * len(me.vertices); me.attributes["c4_piece"].data.foreach_get("value", kind)
        hem = [0] * len(me.vertices); me.attributes["c4_hem"].data.foreach_get("value", hem)
        co = [ev.matrix_world @ v.co for v in me.vertices]
        robe_f = [tuple(p.vertices) for p in me.polygons if all(kind[i] == 1 for i in p.vertices)]
        bvh = BVHTree.FromPolygons(co, robe_f)
        hv = [i for i in range(len(co)) if hem[i] and kind[i] == 1]
        kd = KDTree(len(hv))
        for k, i in enumerate(hv): kd.insert(co[i], k)
        kd.balance()
        axis = rig.matrix_world @ rig.pose.bones["pelvis"].head
        pokes, gap = 0, 9.0
        for i, p in enumerate(co):
            if kind[i] != 2: continue
            hit = bvh.find_nearest(p)
            if hit[0] is None: continue
            loc = hit[0]
            if (p - loc).length > 0.3: continue
            hco, hk, hd = kd.find(Vector((p.x, p.y, loc.z)))
            hem_z = co[hv[hk]].z
            if p.z <= hem_z + 0.01: continue                    # below the hem: the foot is meant to show there
            if loc.z < hem_z + 0.03: continue                   # nearest cloth is the open hem: the foot is coming out
                                                                # UNDER the robe (allowed), not through its wall
            radial = Vector((loc.x - axis.x, loc.y - axis.y, 0))
            if radial.length < 1e-4: continue
            radial.normalize()
            if (p - loc).dot(radial) > 0.002:
                pokes += 1
                if DEBUG: print("POKE", f, tuple(round(x, 3) for x in p), "robe", tuple(round(x, 3) for x in loc), "hem_z", round(hem_z, 3))
            else: gap = min(gap, (p - loc).length)
        ev.to_mesh_clear()
        out.append((f, pokes, gap if gap < 9 else None))
    return out
