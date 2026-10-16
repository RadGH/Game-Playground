# Chibi 4 — step 9: the clip list of the modular kit.
#
#   CLIPS      straight copies of Quaternius' Universal Animation Library (CC0) — name in the kit -> source clip
#   MIRRORED   the same strikes with the other hand (each bone reads its opposite, reflected through the mid-plane)
#   ROBE       walk/run-like clips that get a "<name>_robe" twin with step 6's robe-aware stride; the runtime plays the
#              twin whenever a long robe is worn (and step 6's foot-vs-hem check is run on every one of them)
#   EMOTES     clips the library does not have, authored on top of a base clip by overlay() (c4kit.py): each is
#              (base clip, seconds or None = the base's own length, loops?, fn(t, dur, ctx) -> ops)
# Directions are in the rig's space: front -y, up +z, the character's LEFT is +x.
import math
from mathutils import Vector as V
from c4kit import smooth

CLIPS = {
    "idle": "Idle_Loop", "ready": "Sword_Idle", "walk": "Walk_Loop", "run": "Jog_Fwd_Loop", "sprint": "Sprint_Loop",
    "walkFormal": "Walk_Formal_Loop", "crouch": "Crouch_Idle_Loop", "crouchWalk": "Crouch_Fwd_Loop",
    "attack": "Sword_Attack", "jab": "Punch_Jab", "cross": "Punch_Cross", "cast": "Spell_Simple_Shoot",
    "castEnter": "Spell_Simple_Enter", "channel": "Spell_Simple_Idle_Loop", "castExit": "Spell_Simple_Exit",
    "hit": "Hit_Chest", "hitHead": "Hit_Head", "death": "Death01", "talk": "Idle_Talking_Loop", "torch": "Idle_Torch_Loop",
    "interact": "Interact", "pickUp": "PickUp_Table", "kneelWork": "Fixing_Kneeling", "push": "Push_Loop", "roll": "Roll",
    "sitDown": "Sitting_Enter", "sit": "Sitting_Idle_Loop", "sitUp": "Sitting_Exit", "sitTalk": "Sitting_Talking_Loop",
    "swim": "Swim_Fwd_Loop", "swimIdle": "Swim_Idle_Loop", "dance": "Dance_Loop", "drive": "Driving_Loop",
    "reload": "Pistol_Reload", "aim": "Pistol_Aim_Neutral",
}
MIRRORED = {"attackL": "Sword_Attack", "jabL": "Punch_Jab", "crossL": "Punch_Cross", "castL": "Spell_Simple_Shoot"}
ROBE = {"walk": "walk", "run": "run", "sprint": "run", "walkFormal": "walk"}       # clip -> which LIMITS row


def ramp(t, dur, a=0.3):
    return smooth(0, a, t) * (1 - smooth(dur - a, dur, t))


def _wave(t, d, c):
    w = ramp(t, d); s = math.sin(2 * math.pi * 2.2 * t)
    return [("aim", "upperarm_r", V((-0.62, -0.15, 0.77)), w), ("aim", "lowerarm_r", V((-0.25 + 0.38 * s, -0.12, 0.92)), w),
            ("rot", "head", (0, 0, 1), -0.12 * w)]


def _point(t, d, c):
    w = ramp(t, d)
    return [("aim", "upperarm_r", V((-0.25, -0.93, 0.25)), w), ("aim", "lowerarm_r", V((-0.12, -0.97, 0.2)), w),
            ("rot", "head", (0, 0, 1), -0.15 * w)]


def _salute(t, d, c):
    w = ramp(t, d)
    return [("aim", "upperarm_r", V((-0.82, -0.38, 0.33)), w), ("at_bone", "lowerarm_r", "head", (-0.07, -0.1, 0.08), w)]


def _cheer(t, d, c):
    w = ramp(t, d); pump = 0.5 + 0.5 * math.sin(2 * math.pi * 2 * t)
    return [("aim", "upperarm_l", V((0.42, -0.1, 0.9)), w), ("aim", "upperarm_r", V((-0.42, -0.1, 0.9)), w),
            ("aim", "lowerarm_l", V((0.2, -0.05, 0.97)), w * (0.6 + 0.4 * pump)),
            ("aim", "lowerarm_r", V((-0.2, -0.05, 0.97)), w * (0.6 + 0.4 * pump)), ("rot", "head", (1, 0, 0), -0.15 * w)]


def _clap(t, d, c):
    w = ramp(t, d); gap = 0.035 + 0.07 * (0.5 + 0.5 * math.cos(2 * math.pi * 3 * t))
    return [("aim", "upperarm_l", V((0.28, -0.6, -0.75)), w), ("aim", "upperarm_r", V((-0.28, -0.6, -0.75)), w),
            ("at_bone", "lowerarm_l", "spine_03", (gap, -0.34, 0.0), w), ("at_bone", "lowerarm_r", "spine_03", (-gap, -0.34, 0.0), w)]


def _bow(t, d, c):
    w = ramp(t, d, 0.45)
    return [("rot", "spine_01", (1, 0, 0), 0.42 * w), ("rot", "spine_03", (1, 0, 0), 0.1 * w), ("rot", "head", (1, 0, 0), 0.15 * w)]


def _nod(t, d, c):
    return [("rot", "head", (1, 0, 0), 0.3 * max(0.0, math.sin(2 * math.pi * t / 0.55)) * ramp(t, d, 0.15))]


def _shake(t, d, c):
    return [("rot", "head", (0, 0, 1), 0.4 * math.sin(2 * math.pi * t / 0.5) * ramp(t, d, 0.15))]


def _shrug(t, d, c):
    w = ramp(t, d)
    return [("rot", "clavicle_l", (0, 1, 0), -0.25 * w), ("rot", "clavicle_r", (0, 1, 0), 0.25 * w),
            ("aim", "lowerarm_l", V((0.55, -0.75, 0.15)), w), ("aim", "lowerarm_r", V((-0.55, -0.75, 0.15)), w),
            ("rot", "head", (0, 1, 0), 0.12 * w)]


def _laugh(t, d, c):
    w = ramp(t, d); b = math.sin(2 * math.pi * 4 * t)
    return [("rot", "spine_02", (1, 0, 0), (-0.12 + 0.05 * b) * w), ("rot", "head", (1, 0, 0), -0.22 * w)]


def _cross(t, d, c):
    return [("aim", "upperarm_l", V((0.12, -0.4, -0.91)), 1), ("aim", "lowerarm_l", V((-0.94, -0.3, 0.14)), 1),
            ("aim", "upperarm_r", V((-0.12, -0.44, -0.89)), 1), ("aim", "lowerarm_r", V((0.94, -0.33, 0.06)), 1)]


def _look(t, d, c):
    return [("rot", "neck_01", (0, 0, 1), 0.6 * math.sin(2 * math.pi * t / d)), ("rot", "head", (1, 0, 0), 0.06 * math.sin(4 * math.pi * t / d))]


def _stretch(t, d, c):
    w = ramp(t, d, 0.5)
    return [("rot", "spine_02", (1, 0, 0), -0.15 * w), ("aim", "upperarm_l", V((0.25, 0.05, 0.97)), w),
            ("aim", "upperarm_r", V((-0.25, 0.05, 0.97)), w), ("aim", "lowerarm_l", V((0.1, 0.05, 1)), w),
            ("aim", "lowerarm_r", V((-0.1, 0.05, 1)), w)]


def _pray(t, d, c):
    return [("rot", "head", (1, 0, 0), 0.3), ("aim", "upperarm_l", V((0.22, -0.4, -0.89)), 1),
            ("aim", "upperarm_r", V((-0.22, -0.4, -0.89)), 1),
            ("at_bone", "lowerarm_l", "spine_03", (0.02, -0.3, 0.06), 1), ("at_bone", "lowerarm_r", "spine_03", (-0.02, -0.3, 0.06), 1)]


def _drink(t, d, c):
    lift = smooth(0.2, 0.7, t) * (1 - smooth(1.5, 1.9, t)); tip = smooth(0.6, 0.9, t) * (1 - smooth(1.3, 1.6, t))
    return [("aim", "upperarm_r", V((-0.2, -0.55, -0.8)), lift), ("at_bone", "lowerarm_r", "head", (-0.02, -0.16, -0.06), lift),
            ("rot", "head", (1, 0, 0), -0.25 * tip)]


def _guard(t, d, c):
    return [("aim", "upperarm_l", V((0.45, -0.75, -0.3)), 1), ("aim", "lowerarm_l", V((-0.45, -0.55, 0.7)), 1)]


def _kick(t, d, c):
    k = math.sin(math.pi * max(0.0, min(1.0, (t - 0.12) / 0.62)))
    return [("rot", "spine_01", (1, 0, 0), -0.12 * k), ("aim", "thigh_r", V((0, -0.9, -0.3)), k), ("aim", "calf_r", V((0, -0.55, -0.83)), k)]


def _spin(t, d, c):
    return [("rot", "pelvis", (0, 0, 1), 2 * math.pi * smooth(0.08, 0.85 * d, t))]


def _astride(gallop):
    def fn(t, d, c):
        f = 2.6 if gallop else 2.0
        bounce = (0.045 if gallop else 0.02) * math.sin(2 * math.pi * f * t)
        ops = [("move", "pelvis", V((0, 0, bounce))),
               ("rot", "thigh_l", (1, 0, 0), 0.55), ("rot", "thigh_l", (0, 0, 1), 0.5),
               ("rot", "thigh_r", (1, 0, 0), 0.55), ("rot", "thigh_r", (0, 0, 1), -0.5)]
        if gallop: ops.insert(1, ("rot", "spine_01", (1, 0, 0), 0.35))
        return ops
    return fn


def _sit_ground(t, d, c):
    return [("move", "pelvis", V((0, 0, c["sit_drop"]))), ("aim", "calf_l", V((0.06, -0.96, -0.25)), 1),
            ("aim", "calf_r", V((-0.06, -0.96, -0.25)), 1)]


# name: (base clip in the kit, seconds or None, loops, fn)
EMOTES = {
    "wave": ("idle", 2.2, False, _wave), "point": ("idle", 1.6, False, _point), "salute": ("idle", 1.8, False, _salute),
    "cheer": ("idle", 1.8, False, _cheer), "clap": ("idle", 1.8, False, _clap), "bow": ("idle", 2.0, False, _bow),
    "nod": ("idle", 1.2, False, _nod), "headShake": ("idle", 1.4, False, _shake), "shrug": ("idle", 1.4, False, _shrug),
    "laugh": ("idle", 1.8, False, _laugh), "crossArms": ("idle", None, True, _cross), "lookAround": ("idle", 4.0, True, _look),
    "stretch": ("idle", 2.2, False, _stretch), "pray": ("idle", None, True, _pray), "drink": ("idle", 2.0, False, _drink),
    "guard": ("ready", None, True, _guard), "kick": ("idle", 1.0, False, _kick), "spin": ("attack", None, False, _spin),
    "ride": ("drive", None, True, _astride(False)), "rideGallop": ("drive", None, True, _astride(True)),
    "sitGround": ("sit", None, True, _sit_ground),
}
