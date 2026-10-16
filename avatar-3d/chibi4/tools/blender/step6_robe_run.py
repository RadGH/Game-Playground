# Chibi 4 — step 6: the robe vs the feet (the reason this experiment started: in Chibi 2 the feet run through robes).
#
#   ~/opt/blender/blender -b -P avatar-3d/chibi4/tools/blender/step6_robe_run.py -- <out_dir>
#
# The step-5 mage gets real walk and run clips: Quaternius' Universal Animation Library (CC0, vendored in
# avatar-3d/assets/quaternius) retargeted by bone name onto MakeHuman's game skeleton (c4anim.py). Three set-ups are
# measured on every frame of walk and run (c4anim.measure_feet: a boot vertex outside the cloth above the hem is a
# poke-through; otherwise the smallest foot-to-cloth gap):
#   A  the robe simply copies the nearest body weights (what any auto-skinned robe does)
#   B  + 8 skirt bones driven by BOTH thighs (front follows the further-forward leg, back the further-back one)
#   C  + a robe-aware stride: each clip's biggest thigh swing scaled to ~22-26 degrees and knee bend to 50-60 (a person in
#      a floor-length robe takes short steps and does not kick their heels up)
#   D  the stride alone, with copied weights (to show what each fix contributes)
# Fails (exit code 1) if C has any poke-through.
import bpy, math, os, sys, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
C4 = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 1 and not sys.argv[sys.argv.index("--") + 1].startswith("--") else os.path.join(C4, "shots", "step6")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
sys.argv.append("--fast")
import c4lib, c4mh, c4anim
import c4clothes as cc
import step5_clothes as s5

LIMITS = {"walk": dict(max_swing=22.0, max_knee=50.0), "run": dict(max_swing=24.0, max_knee=52.0)}


def robe_geometry(clothes, B, piece=1):
    """Pivot height, centre, and the robe's radius by angle at the hips and at the hem (from the robe itself)."""
    me = clothes.data
    kind = [0] * len(me.vertices); me.attributes["c4_piece"].data.foreach_get("value", kind)
    hem = [0] * len(me.vertices); me.attributes["c4_hem"].data.foreach_get("value", hem)
    centre = Vector((B.cx, B.head("pelvis").y, 0))
    hip_z = B.head("thigh_l").z
    pts = [clothes.matrix_world @ v.co for v in me.vertices]
    hemp = [p for i, p in enumerate(pts) if kind[i] == piece and hem[i]]
    mine = [p for i, p in enumerate(pts) if kind[i] == piece]
    if len(hemp) < 8:                                   # a pointed tabard: its lowest tenth stands in for the hem
        zs = sorted(p.z for p in mine); hemp = [p for p in mine if p.z <= zs[len(zs) // 10]]
    hipp = [p for p in mine if abs(p.z - hip_z) < 0.03] or [p for p in mine if p.z >= sorted(q.z for q in mine)[-len(mine) // 10]]
    hem_z = sum(p.z for p in hemp) / len(hemp)

    def by_angle(ps):
        def r(a):
            best = min(ps, key=lambda p: abs(((math.atan2(p.y - centre.y, p.x - centre.x) - a + math.pi) % (2 * math.pi)) - math.pi))
            return math.hypot(best.x - centre.x, best.y - centre.y)
        return r
    return centre, hip_z, by_angle(hipp), hem_z, by_angle(hemp)


def summary(rows):
    pokes = sum(r[1] for r in rows); bad = sum(1 for r in rows if r[1])
    gaps = [r[2] for r in rows if r[2] is not None]
    return {"frames": len(rows), "frames_with_pokes": bad, "poking_vertices_total": pokes,
            "poking_frames": [r[0] for r in rows if r[1]][:12],
            "min_gap_cm": round(100 * min(gaps), 1) if gaps else None}


def strip(rig, action, tag, frames):
    rig.animation_data.action = action
    paths = []
    for f in frames:
        bpy.context.scene.frame_set(f)
        p = c4lib.shot(os.path.join(OUT, f"s6{tag}_{f:02d}"), ((-1, 0, 0.08),), center=(0, 0, 0.92), dist=3.2, ortho=2.15,
                       engine="CYCLES", size=360, samples=16)[0]
        paths.append(p)
    return paths


if __name__ == "__main__":
    bpy.ops.wm.read_factory_settings(use_empty=True)
    ch = s5.build_character("mage", 0.0)
    s5.paint("mage", ch, os.path.join(OUT, "mage-clothes.png"))
    rig, clothes, B = ch["rig"], ch["clothes"], ch["B"]
    c4mh.studio()
    src = c4anim.load_library()
    report = {}
    acts = {}
    # A: copied weights, full stride
    for clip in ("walk", "run"):
        acts[("A", clip)] = c4anim.retarget(src, c4anim.CLIPS[clip], rig, f"A_{clip}")
        report[f"A_{clip}"] = summary(c4anim.measure_feet(clothes, rig, acts[("A", clip)]))
        print("MEASURE", f"A_{clip}", report[f"A_{clip}"])
    run_frames = list(range(0, 22, 3))
    pa = strip(rig, acts[("A", "run")], "A", run_frames)
    # D: copied weights + robe-aware stride (how much the stride alone does)
    strides = {clip: c4anim.robe_stride(src, c4anim.CLIPS[clip], **LIMITS[clip]) for clip in ("walk", "run")}
    print("STRIDES", strides)
    for clip in ("walk", "run"):
        a = c4anim.retarget(src, c4anim.CLIPS[clip], rig, f"D_{clip}", stride=strides[clip])
        report[f"D_{clip}"] = summary(c4anim.measure_feet(clothes, rig, a)); acts[("D", clip)] = a
        print("MEASURE", f"D_{clip}", report[f"D_{clip}"])
    pd = strip(rig, acts[("D", "run")], "D", run_frames)
    # B and C: skirt bones
    centre, hip_z, ring_r, hem_z, hem_r = robe_geometry(clothes, B)
    c4anim.add_skirt_bones(rig, centre, hip_z, ring_r, hem_z, hem_r)
    nw = c4anim.skirt_weights(clothes, centre, hip_z - 0.16, hip_z + 0.07)
    print("skirt-weighted robe vertices", nw)
    for setup, k in (("B", {"walk": 1.0, "run": 1.0}), ("C", strides)):
        for clip in ("walk", "run"):
            a = c4anim.retarget(src, c4anim.CLIPS[clip], rig, f"{setup}_{clip}", stride=k[clip])
            c4anim.drive_skirt(rig, a)
            acts[(setup, clip)] = a
            report[f"{setup}_{clip}"] = summary(c4anim.measure_feet(clothes, rig, a))
            print("MEASURE", f"{setup}_{clip}", report[f"{setup}_{clip}"])
    pb_ = strip(rig, acts[("B", "run")], "B", run_frames)
    pc = strip(rig, acts[("C", "run")], "C", run_frames)
    json.dump({"setups": {"A": "robe copies nearest body weights, full stride",
                          "B": "8 skirt bones driven by both thighs, full stride",
                          "C": "skirt bones + robe-aware stride", "D": "copied weights + robe-aware stride"},
               "strides": {k: {kk: (round(vv, 3) if isinstance(vv, float) else vv) for kk, vv in v.items()} for k, v in strides.items()},
               "results": report, "strips": {"A": pa, "B": pb_, "C": pc, "D": pd}}, open(os.path.join(OUT, "report.json"), "w"), indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "step6.blend"))
    ok = report["C_walk"]["poking_vertices_total"] == 0 and report["C_run"]["poking_vertices_total"] == 0
    print("STEP6", "PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)
