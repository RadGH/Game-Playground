# Chibi 4 — step 9 helpers: the MODULAR kit (one skeleton per body type, every garment / hair its own skinned mesh).
#
#   retarget_seq(src, rig, name, segments, stride, mirror)
#                      step 6's retarget, generalised: a clip can be several source clips back to back (jump =
#                      start + loop + land), any frame order (stand up = a death played backwards, sleep = a death's
#                      last frame held), and MIRRORED (left-hand strikes from right-hand ones: each bone reads its
#                      opposite and the rotation is reflected through the body's mid-plane)
#   overlay(rig, action, fn)
#                      author an emote on top of a clip: per frame fn(t) returns ops — aim a bone along a direction or
#                      at a point, turn it about an axis, or move it — in the RIG's space (front -y, up +z, the
#                      character's left +x); applied parent-first, keyed into the action
#   covered_by(points, normals, faces, garment_objs, cand, reach)
#                      step 5's "is this vertex under cloth" ray test for ANY mesh (body, an inner garment), with
#                      one ring of erosion so a hidden patch never reaches the edge of the cloth over it
#   raster_labels(...) / cluster_colours(...)
#                      the tint mask: which atlas pixels belong to which garment, and per garment its two main
#                      colours (largest = primary, next = secondary), soft membership per pixel
import bpy, math
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
import c4anim

LEGS = ("thigh_l", "thigh_r", "calf_l", "calf_r")


def opposite(name):
    if name.endswith("_l"): return name[:-2] + "_r"
    if name.endswith("_r"): return name[:-2] + "_l"
    return name


def mirror_q(q):
    """A rotation reflected through the x = 0 plane (the body's mid-plane in the rig's space)."""
    return Quaternion((q.w, q.x, -q.y, -q.z))


def retarget_seq(src, rig, name, segments, stride=1.0, mirror=False, knee_fix=True):
    """segments: [(source clip name, [source frames...]), ...] played in order; the new action's frames are 0..n-1."""
    sc = bpy.context.scene
    Wsrc, Wt = src.matrix_world, rig.matrix_world
    Wt_inv = Wt.inverted()
    bones = c4anim._order(rig)
    corr = {}
    for b in bones:
        own = c4anim._src_name(src, b.name)
        if not own: continue
        read = c4anim._src_name(src, opposite(b.name)) if mirror else own
        if not read: continue
        sb = src.data.bones[own]; rb = src.data.bones[read]
        t_rest = (Wt @ b.matrix_local).to_quaternion()
        s_dir = (Wsrc.to_3x3() @ (sb.tail_local - sb.head_local)).normalized()
        t_dir = (Wt.to_3x3() @ (b.tail_local - b.head_local)).normalized()
        align = t_dir.rotation_difference(s_dir) if b.name not in ("Root", "pelvis") else Quaternion()
        corr[b.name] = (read, (Wsrc @ rb.matrix_local).to_quaternion().inverted(), align @ t_rest)
    pel = c4anim._src_name(src, "pelvis")
    s_hip = (Wsrc @ src.data.bones[pel].head_local).z
    t_hip = (Wt @ rig.data.bones["pelvis"].head_local).z
    k_hip = t_hip / max(1e-6, s_hip)
    s_pel_rest = Wsrc @ src.data.bones[pel].head_local
    new = bpy.data.actions.new(name); new.use_fake_user = True
    if rig.animation_data is None: rig.animation_data_create()
    rig.animation_data.action = new
    for pb in rig.pose.bones: pb.rotation_mode = "QUATERNION"
    k_out = 0
    for clip, frames in segments:
        src.animation_data.action = bpy.data.actions[clip]
        for f in frames:
            sc.frame_set(f)
            pose_arm = {}
            for b in bones:
                pb = rig.pose.bones[b.name]
                rest = b.matrix_local
                if b.name in corr:
                    read, s_rest_inv, tail_q = corr[b.name]
                    delta = (Wsrc @ src.pose.bones[read].matrix).to_quaternion() @ s_rest_inv
                    if mirror: delta = mirror_q(delta)
                    R = (Wt_inv.to_quaternion() @ (delta @ tail_q)).to_matrix().to_4x4()
                else:
                    R = (pose_arm[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest)).to_3x3().normalized().to_4x4() if b.parent else rest.to_3x3().to_4x4()
                head = pose_arm[b.parent.name] @ (b.parent.matrix_local.inverted() @ rest).to_translation() if b.parent else rest.to_translation()
                if b.name == "pelvis":
                    d = (Wsrc @ src.pose.bones[pel].head - s_pel_rest) * k_hip
                    if mirror: d.x = -d.x
                    head = rest.to_translation() + Wt_inv.to_3x3() @ d
                if b.name in ("calf_l", "calf_r") and knee_fix:
                    R = knee_straighten(R, pose_arm, rig, b.name)
                M = Matrix.Translation(head) @ R
                pose_arm[b.name] = M
                rel = (b.parent.matrix_local.inverted() @ rest) if b.parent else rest
                par = pose_arm[b.parent.name] if b.parent else Matrix()
                loc, q, _ = (rel.inverted() @ par.inverted() @ M).decompose()
                k = stride.get(b.name[:5], 1.0) if isinstance(stride, dict) else stride
                if (b.name in LEGS or b.name.startswith("spine")) and k != 1.0:
                    q = Quaternion().slerp(q, k)
                    pose_arm[b.name] = par @ rel @ Matrix.Translation(loc) @ q.to_matrix().to_4x4()
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=k_out)
                if b.name == "pelvis":
                    pb.location = loc
                    pb.keyframe_insert("location", frame=k_out)
            k_out += 1
    new.frame_range = (0, max(1, k_out - 1))
    return new


def _hinge(pose_arm, rig):
    """The knees' hinge axis now: the hips' left-right line (thigh_r -> thigh_l at rest) turned with the pelvis."""
    pr = rig.data.bones["pelvis"].matrix_local.to_3x3()
    L = (rig.data.bones["thigh_l"].head_local - rig.data.bones["thigh_r"].head_local).normalized()
    return ((pose_arm["pelvis"].to_3x3() @ pr.inverted()) @ L).normalized()


def knee_angle(t, c, L):
    """Signed knee bend in degrees in the plane across the hinge: + = the shin folds BACK (a knee), - = it folds
    forward (a leg bent the wrong way)."""
    tp = t - L * t.dot(L); cp = c - L * c.dot(L)
    if tp.length < 1e-6 or cp.length < 1e-6: return 0.0
    return math.degrees(math.atan2(tp.cross(cp).dot(L), tp.dot(cp)))


def knee_straighten(R, pose_arm, rig, calf):
    """Owner, 2026-10-16: 'the right leg was bent backwards in the idle stance'. MakeHuman rests in an A-pose with
    the knees dead straight and Quaternius in a T with them a hair bent; after the rest correction a nearly straight
    source knee can come out a few degrees PAST straight, which on a realistic leg reads as a knee bent the wrong
    way. Any bend past straight is taken out (the shin is turned about the hinge back onto the thigh's line)."""
    th = pose_arm["thigh_" + calf[-1]]
    t = (th.to_3x3() @ Vector((0, 1, 0))).normalized()
    c = (R.to_3x3() @ Vector((0, 1, 0))).normalized()
    L = _hinge(pose_arm, rig)
    a = knee_angle(t, c, L)
    if a >= 0: return R
    return (Quaternion(L, math.radians(-a)).to_matrix() @ R.to_3x3()).to_4x4()


def knee_report(rig, action):
    """Smallest signed knee bend (degrees) per leg over every frame of an action, from the posed rig."""
    sc = bpy.context.scene; rig.animation_data.action = action
    f0, f1 = (int(x) for x in action.frame_range)
    out = {"l": 999.0, "r": 999.0}
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        pa = {"pelvis": rig.pose.bones["pelvis"].matrix}
        L = _hinge(pa, rig)
        for s in "lr":
            th, ca = rig.pose.bones["thigh_" + s], rig.pose.bones["calf_" + s]
            out[s] = min(out[s], knee_angle((th.tail - th.head).normalized(), (ca.tail - ca.head).normalized(), L))
    return {k: round(v, 1) for k, v in out.items()}


def frames_of(clip):
    f0, f1 = (int(x) for x in bpy.data.actions[clip].frame_range)
    return list(range(f0, f1 + 1))


# ------------------------------------------------------------------ authoring emotes on top of a clip
def smooth(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))) if b != a else 1.0
    return t * t * (3 - 2 * t)


def overlay(rig, action, fn, fps=None):
    """fn(t, dur) -> [op, ...] with op one of
         ("aim", bone, Vector dir, weight)          bone's head->tail turns toward dir (rig space)
         ("at", bone, Vector point, weight)         bone's tail turns toward a point (rig space)
         ("at_bone", bone, other_bone, offset, w)   ... toward another bone's head + offset (both posed)
         ("rot", bone, axis, radians)               turn about an axis through the bone's head
         ("move", bone, Vector delta)               move the bone's head (pelvis drops, bounces)
       Ops run in the order given; list parents before children."""
    sc = bpy.context.scene
    fps = fps or sc.render.fps
    rig.animation_data.action = action
    f0, f1 = (int(x) for x in action.frame_range)
    dur = (f1 - f0) / fps
    for f in range(f0, f1 + 1):
        sc.frame_set(f)
        touched = []
        for op in fn((f - f0) / fps, dur):
            kind, bone = op[0], op[1]
            pb = rig.pose.bones[bone]
            M = pb.matrix.copy()
            head = M.to_translation()
            if kind == "move":
                M.translation = head + op[2]; pb.matrix = M
            else:
                if kind == "rot":
                    R = Quaternion(Vector(op[2]).normalized(), op[3])
                else:
                    cur = (pb.tail - pb.head).normalized()
                    if kind == "aim": tgt = Vector(op[2]).normalized()
                    elif kind == "at": tgt = (Vector(op[2]) - head).normalized()
                    else: tgt = (rig.pose.bones[op[2]].head + Vector(op[3]) - head).normalized()
                    R = Quaternion().slerp(cur.rotation_difference(tgt), max(0.0, min(1.0, op[-1])))
                N = Matrix.Translation(head) @ R.to_matrix().to_4x4() @ Matrix.Translation(-head) @ M
                pb.matrix = N
            # key BEFORE the update: an update re-evaluates the action at this frame and would put the old key back
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if kind == "move" or pb.name == "pelvis": pb.keyframe_insert("location", frame=f)
            bpy.context.view_layer.update()
            if bone not in touched: touched.append(bone)
    return action


# ------------------------------------------------------------------ "is this vertex under that cloth"
def mesh_world(obj):
    deps = bpy.context.evaluated_depsgraph_get(); ev = obj.evaluated_get(deps); me = ev.to_mesh()
    co = [ev.matrix_world @ v.co for v in me.vertices]
    faces = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return co, faces


def bvh_of(objs):
    cos, polys = [], []
    for g in objs:
        co, faces = mesh_world(g); base = len(cos)
        cos += co; polys += [tuple(base + i for i in f) for f in faces]
    return BVHTree.FromPolygons(cos, polys), cos


def covered_by(points, normals, faces, garments, cand=None, reach=0.35, erode=True):
    """Indices of `points` (with their outward `normals`) that the garments cover: a ray along the normal and four
    tilted 40 degrees all hit cloth within `reach`. One ring of erosion over `faces`."""
    bvh, gco = bvh_of(garments)
    if not gco: return set()
    lo = Vector((min(p.x for p in gco), min(p.y for p in gco), min(p.z for p in gco))) - Vector((reach,) * 3)
    hi = Vector((max(p.x for p in gco), max(p.y for p in gco), max(p.z for p in gco))) + Vector((reach,) * 3)
    hide = set()
    for i in (cand if cand is not None else range(len(points))):
        p0 = points[i]
        if not (lo.x <= p0.x <= hi.x and lo.y <= p0.y <= hi.y and lo.z <= p0.z <= hi.z): continue
        n = normals[i]; p = p0 + n * 0.0015
        t1 = n.orthogonal().normalized(); t2 = n.cross(t1)
        dirs = [n] + [(n + t * 0.84).normalized() for t in (t1, -t1, t2, -t2)]
        if all(bvh.ray_cast(p, d, reach)[0] is not None for d in dirs): hide.add(i)
    if not erode: return hide
    nb = {}
    for f in faces:
        for a in f:
            for b in f:
                if a != b: nb.setdefault(a, set()).add(b)
    return {i for i in hide if all(j in hide for j in nb.get(i, ()))}


def outward_normals(points, body):
    """For a garment's vertices: the normal of the nearest BODY surface (both shells of a solidified garment then
    point away from the body, which is what 'is something over me' needs)."""
    out = []
    for p in points:
        hit = body.bvh.find_nearest(p)
        out.append(hit[1].normalized() if hit[0] is not None else Vector((0, 0, 1)))
    return out


def set_mask(obj, bits_per_vertex):
    """The hide mask the runtime reads: a float vertex attribute '_c4mask' (glTF exports names starting with '_'),
    each bit one garment that covers this vertex (the runtime drops a triangle when any of its vertices is covered by
    a garment being worn). Floats hold whole numbers exactly up to 2^24, so 24 garments per kit."""
    me = obj.data
    a = me.attributes.get("_c4mask") or me.attributes.new("_c4mask", "FLOAT", "POINT")
    a.data.foreach_set("value", [float(b) for b in bits_per_vertex])


def get_mask(obj):
    me = obj.data; a = me.attributes.get("_c4mask")
    v = [0.0] * len(me.vertices)
    if a: a.data.foreach_get("value", v)
    return [int(round(x)) for x in v]


def copy_mask_nearest(src_co, src_bits, obj):
    """After decimation the mask is re-read from the nearest full-detail vertex (decimation blends float attributes,
    which would scramble bits)."""
    kd = KDTree(len(src_co))
    for i, p in enumerate(src_co): kd.insert(p, i)
    kd.balance()
    out = []
    for v in obj.data.vertices:
        _, i, _ = kd.find(obj.matrix_world @ v.co)
        out.append(src_bits[i])
    set_mask(obj, out)


# ------------------------------------------------------------------ the tint mask
def raster_labels(tris_px, labels, W, H, out):
    """tris_px: (N,3,2) pixel coords (x right, y down); labels: (N,) ints; writes label per covered pixel into out."""
    for t, lab in zip(tris_px, labels):
        x0, y0 = np.floor(t.min(0)).astype(int); x1, y1 = np.ceil(t.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-9: continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (1 - l1 - l2 >= -0.02)
        out[y0:y1 + 1, x0:x1 + 1][inside] = lab


def dilate_labels(lab, steps=3):
    for _ in range(steps):
        empty = lab < 0
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(lab, dy, 0), dx, 1)
            fill = empty & (sh >= 0)
            lab[fill] = sh[fill]
            empty = lab < 0
    return lab


def kmeans(px, k=3, iters=12, seed=1):
    rng = np.random.default_rng(seed)
    c = px[rng.choice(len(px), size=k, replace=False)]
    for _ in range(iters):
        d = ((px[:, None, :] - c[None]) ** 2).sum(-1); a = d.argmin(1)
        for j in range(k):
            if (a == j).any(): c[j] = px[a == j].mean(0)
    d = ((px[:, None, :] - c[None]) ** 2).sum(-1); a = d.argmin(1)
    counts = np.bincount(a, minlength=k)
    order = np.argsort(-counts)
    return c[order], counts[order]


def srgb_to_lin(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lum(lin):
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def hexc(c):
    return "#" + "".join(f"{int(round(max(0, min(1, x)) * 255)):02x}" for x in c[:3])
