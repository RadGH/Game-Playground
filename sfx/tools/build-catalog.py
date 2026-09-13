#!/usr/bin/env python3
"""
Builds sfx/data/catalog.json.

The catalog is the single list of logical sound ids a game asks for ("spell.fire.impact",
"ui.click", "ambience.cave"). Each entry says which category it belongs to (categories set the
loudness target), whether it loops, an optional manual trim in dB, and one block per method
describing how that method makes the sound:

  "synth"   -> { dur, jitter, layers: [...] }   data-driven Web Audio recipe (see js/methods/synth.js)
  "library" -> { files: [...], pitch: [lo,hi] } sample files under sfx/assets/ (omitted = no sample)
  "retro"   -> { pattern, ... }                 chiptune recipe (see js/methods/retro.js)

Run:  python3 sfx/tools/build-catalog.py
Then: node --test sfx/tests/sfx.test.js
"""
import json, os, math

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'catalog.json')

# Elements and statuses are mirrored from avatar-3d/js/spellfx.js (ELEMENTS / STATUS_FX).
# The node test checks that these two lists still match that module.
ELEMENTS = ['fire', 'ice', 'shadow', 'holy', 'nature', 'arcane', 'lightning', 'physical', 'poison', 'bleed', 'true']
STATUSES = ['burn', 'poison', 'bleed', 'freeze', 'stun', 'sleep', 'confused', 'dazed', 'blind', 'slow',
            'marked', 'barrier', 'regen', 'sunder', 'curse', 'silence', 'disarm', 'root', 'rally',
            'haste', 'enchant', 'block', 'deflect']
RARITIES = ['common', 'normal', 'uncommon', 'magic', 'rare', 'epic', 'legendary']
AMBIENCES = ['forest', 'cave', 'town', 'marsh', 'mountain', 'void', 'fire', 'wind']

# ---------------------------------------------------------------------------------------------
# layer helpers — every one returns a plain dict the browser renderer understands


def noise(dur, f0, f1=None, q=1.0, ftype='bandpass', color='white', gain=0.8, a=0.004, d=None,
          delay=0.0, curve='exp'):
    return {'type': 'noise', 'color': color, 'dur': dur, 'delay': delay, 'gain': gain,
            'filter': {'type': ftype, 'f0': f0, 'f1': f1 if f1 is not None else f0, 'q': q},
            'env': {'a': a, 'd': d if d is not None else dur, 'curve': curve}}


def tone(dur, f0, f1=None, wave='sine', gain=0.6, a=0.003, d=None, delay=0.0, curve='exp', vib=None):
    l = {'type': 'tone', 'wave': wave, 'dur': dur, 'delay': delay, 'gain': gain,
         'f0': f0, 'f1': f1 if f1 is not None else f0,
         'env': {'a': a, 'd': d if d is not None else dur, 'curve': curve}}
    if vib:
        l['vib'] = {'rate': vib[0], 'depth': vib[1]}
    return l


def fm(dur, f0, f1=None, ratio=2.0, index=200, index1=0, gain=0.6, a=0.004, d=None, delay=0.0,
       wave='sine'):
    return {'type': 'fm', 'wave': wave, 'dur': dur, 'delay': delay, 'gain': gain,
            'f0': f0, 'f1': f1 if f1 is not None else f0, 'ratio': ratio,
            'index': index, 'index1': index1,
            'env': {'a': a, 'd': d if d is not None else dur, 'curve': 'exp'}}


def pluck(dur, freq, damp=0.5, gain=0.6, delay=0.0):
    return {'type': 'pluck', 'dur': dur, 'delay': delay, 'gain': gain, 'freq': freq, 'damp': damp}


def grain(dur, n, flo, fhi, glo=0.01, ghi=0.035, wave='sine', gain=0.4, delay=0.0, spread=1.0,
          sweep=1.0, noisy=False):
    return {'type': 'grain', 'dur': dur, 'delay': delay, 'gain': gain, 'n': n,
            'freq': [flo, fhi], 'gdur': [glo, ghi], 'wave': wave, 'spread': spread,
            'sweep': sweep, 'noisy': noisy}


def chord(dur, freqs, wave='sine', gain=0.45, stagger=0.05, delay=0.0, a=0.01, d=None):
    return {'type': 'chord', 'dur': dur, 'delay': delay, 'gain': gain, 'freqs': freqs,
            'wave': wave, 'stagger': stagger,
            'env': {'a': a, 'd': d if d is not None else dur, 'curve': 'exp'}}


def drone(dur, f0, f1, q=0.8, color='pink', gain=0.6, lfo=0.13, depth=0.5, ftype='bandpass'):
    """A steady bed for looping sounds: filtered noise whose filter drifts on a slow LFO."""
    return {'type': 'drone', 'dur': dur, 'gain': gain, 'color': color,
            'filter': {'type': ftype, 'f0': f0, 'f1': f1, 'q': q},
            'lfo': lfo, 'depth': depth}


# ---------------------------------------------------------------------------------------------
# element voices: (launch layers, travel layers, impact layers)

def element_recipes(el):
    """Returns dict phase -> (dur, layers) for one element."""
    R = {}
    if el == 'fire':
        R['launch'] = (0.34, [noise(0.30, 900, 2600, 1.1, color='brown', gain=0.85),
                              tone(0.22, 160, 320, 'sawtooth', gain=0.25),
                              grain(0.30, 10, 1200, 4000, noisy=True, gain=0.3)])
        R['travel'] = (1.20, [drone(1.20, 420, 1500, 0.9, 'brown', gain=0.7, lfo=3.1, depth=0.55),
                              drone(1.20, 90, 180, 1.4, 'pink', gain=0.35, lfo=1.7, depth=0.4)])
        R['impact'] = (0.72, [noise(0.60, 2200, 260, 0.9, color='brown', gain=1.0),
                              tone(0.36, 120, 44, 'sine', gain=0.85),
                              grain(0.70, 22, 700, 3800, noisy=True, gain=0.45, delay=0.03)])
    elif el == 'ice':
        R['launch'] = (0.30, [noise(0.26, 5200, 2400, 3.0, gain=0.7),
                              tone(0.22, 2600, 1700, 'triangle', gain=0.35)])
        R['travel'] = (1.20, [drone(1.20, 2600, 5200, 2.2, 'white', gain=0.5, lfo=2.3, depth=0.5)])
        R['impact'] = (0.85, [noise(0.34, 6000, 1400, 1.6, gain=0.9),
                              chord(0.80, [2093, 2794, 3520], 'sine', gain=0.5, stagger=0.02),
                              grain(0.60, 16, 2200, 6500, 0.006, 0.02, gain=0.4, delay=0.02),
                              tone(0.20, 140, 70, 'sine', gain=0.4)])
    elif el == 'shadow':
        R['launch'] = (0.42, [noise(0.40, 300, 120, 1.4, ftype='lowpass', color='brown', gain=0.8),
                              tone(0.34, 210, 92, 'sawtooth', gain=0.4)])
        R['travel'] = (1.20, [drone(1.20, 130, 420, 1.1, 'brown', gain=0.7, lfo=0.9, depth=0.6),
                              drone(1.20, 900, 1800, 3.0, 'pink', gain=0.2, lfo=2.6, depth=0.7)])
        R['impact'] = (0.95, [tone(0.70, 180, 38, 'sawtooth', gain=0.8),
                              noise(0.80, 600, 90, 0.8, ftype='lowpass', color='brown', gain=0.85),
                              tone(0.55, 305, 147, 'triangle', gain=0.3, delay=0.04),
                              grain(0.60, 9, 200, 800, 0.03, 0.09, gain=0.3, delay=0.05)])
    elif el == 'holy':
        R['launch'] = (0.40, [chord(0.38, [880, 1320, 1760], 'sine', gain=0.5, stagger=0.03),
                              noise(0.30, 4200, 6800, 1.4, ftype='highpass', gain=0.3)])
        R['travel'] = (1.20, [drone(1.20, 1800, 3600, 1.6, 'white', gain=0.35, lfo=1.1, depth=0.5),
                              drone(1.20, 500, 900, 2.4, 'pink', gain=0.25, lfo=0.6, depth=0.4)])
        R['impact'] = (1.20, [chord(1.10, [523.25, 659.25, 783.99, 1046.5], 'sine', gain=0.6, stagger=0.035),
                              noise(0.45, 3000, 7000, 1.0, ftype='highpass', gain=0.45),
                              tone(0.40, 110, 82, 'sine', gain=0.45)])
    elif el == 'nature':
        R['launch'] = (0.34, [noise(0.28, 1400, 700, 1.8, gain=0.6),
                              pluck(0.30, 330, 0.55, gain=0.55)])
        R['travel'] = (1.20, [drone(1.20, 700, 2200, 1.3, 'pink', gain=0.5, lfo=1.9, depth=0.6)])
        R['impact'] = (0.78, [noise(0.42, 1800, 420, 1.1, color='pink', gain=0.8),
                              pluck(0.70, 196, 0.4, gain=0.6),
                              grain(0.60, 14, 500, 1900, 0.012, 0.05, gain=0.4, delay=0.03),
                              tone(0.26, 96, 52, 'sine', gain=0.5)])
    elif el == 'arcane':
        R['launch'] = (0.38, [fm(0.34, 440, 880, ratio=3.5, index=600, index1=60, gain=0.55),
                              noise(0.24, 3200, 5600, 2.0, ftype='highpass', gain=0.3)])
        R['travel'] = (1.20, [drone(1.20, 900, 2400, 2.6, 'white', gain=0.35, lfo=4.3, depth=0.7),
                              drone(1.20, 220, 500, 1.6, 'pink', gain=0.3, lfo=1.3, depth=0.5)])
        R['impact'] = (0.90, [fm(0.70, 330, 110, ratio=3.51, index=1400, index1=40, gain=0.75),
                              noise(0.44, 5200, 1200, 1.2, gain=0.55),
                              chord(0.70, [349.23, 523.25, 739.99], 'triangle', gain=0.35, stagger=0.02, delay=0.03),
                              tone(0.28, 130, 55, 'sine', gain=0.5)])
    elif el == 'lightning':
        R['launch'] = (0.22, [noise(0.16, 4000, 9000, 0.8, ftype='highpass', gain=0.9),
                              tone(0.14, 1800, 5200, 'square', gain=0.25)])
        R['travel'] = (1.20, [drone(1.20, 3000, 8000, 1.2, 'white', gain=0.35, lfo=11.0, depth=0.8)])
        R['impact'] = (0.75, [noise(0.10, 6000, 2000, 0.5, ftype='highpass', gain=1.0),
                              noise(0.65, 1200, 120, 0.7, ftype='lowpass', color='brown', gain=0.8, a=0.001, delay=0.02),
                              tone(0.30, 90, 38, 'sine', gain=0.7, delay=0.01),
                              grain(0.35, 12, 3000, 9000, 0.003, 0.012, gain=0.45, noisy=True)])
    elif el == 'physical':
        R['launch'] = (0.26, [noise(0.22, 700, 2600, 0.9, gain=0.6, a=0.02, curve='lin')])
        R['travel'] = (1.20, [drone(1.20, 600, 2000, 0.9, 'white', gain=0.3, lfo=5.0, depth=0.6)])
        R['impact'] = (0.45, [noise(0.16, 2600, 400, 0.7, gain=0.95),
                              tone(0.26, 150, 52, 'sine', gain=0.9),
                              noise(0.30, 900, 200, 1.6, color='brown', gain=0.5, delay=0.01)])
    elif el == 'poison':
        R['launch'] = (0.36, [grain(0.34, 10, 260, 900, 0.02, 0.07, gain=0.6, sweep=2.2),
                              noise(0.30, 500, 220, 1.2, ftype='lowpass', color='pink', gain=0.5)])
        R['travel'] = (1.20, [drone(1.20, 300, 900, 1.8, 'pink', gain=0.45, lfo=2.7, depth=0.6)])
        R['impact'] = (0.85, [noise(0.50, 900, 180, 0.9, ftype='lowpass', color='pink', gain=0.8),
                              grain(0.80, 20, 200, 1100, 0.02, 0.09, gain=0.6, sweep=2.4, delay=0.02),
                              tone(0.30, 110, 60, 'sine', gain=0.45)])
    elif el == 'bleed':
        R['launch'] = (0.28, [noise(0.24, 800, 300, 1.0, ftype='lowpass', color='pink', gain=0.65)])
        R['travel'] = (1.20, [drone(1.20, 250, 700, 1.2, 'brown', gain=0.4, lfo=1.6, depth=0.5)])
        R['impact'] = (0.60, [noise(0.26, 1400, 260, 0.8, ftype='lowpass', color='pink', gain=0.9),
                              tone(0.30, 120, 46, 'sine', gain=0.6),
                              grain(0.50, 8, 300, 1200, 0.02, 0.06, gain=0.45, sweep=0.4, delay=0.05)])
    else:  # true
        R['launch'] = (0.30, [tone(0.26, 1200, 2400, 'sine', gain=0.5),
                              noise(0.20, 5000, 9000, 1.0, ftype='highpass', gain=0.3)])
        R['travel'] = (1.20, [drone(1.20, 1500, 3000, 3.0, 'white', gain=0.3, lfo=0.8, depth=0.4)])
        R['impact'] = (0.80, [chord(0.75, [1046.5, 1567.98, 2093], 'sine', gain=0.6, stagger=0.015),
                              noise(0.28, 7000, 2500, 1.1, gain=0.6),
                              tone(0.26, 100, 60, 'sine', gain=0.4)])
    return R


# Statuses: an "apply" sting and a quieter "tick" pulse.
STATUS_RECIPE = {
    'burn':     ('fire', [noise(0.40, 1600, 400, 1.1, color='brown', gain=0.8), grain(0.40, 10, 900, 3200, noisy=True, gain=0.35)]),
    'poison':   ('poison', [grain(0.45, 10, 220, 800, 0.02, 0.08, gain=0.6, sweep=2.2), noise(0.35, 450, 200, 1.2, ftype='lowpass', gain=0.4)]),
    'bleed':    ('bleed', [noise(0.30, 900, 250, 0.9, ftype='lowpass', color='pink', gain=0.7), tone(0.24, 420, 180, 'sine', gain=0.3, delay=0.06)]),
    'freeze':   ('ice', [noise(0.45, 5200, 1100, 1.4, gain=0.7), chord(0.50, [1568, 2093], 'sine', gain=0.4, stagger=0.03)]),
    'stun':     ('physical', [tone(0.55, 660, 330, 'triangle', gain=0.5, vib=(9, 0.06)), noise(0.16, 2400, 600, 0.8, gain=0.5)]),
    'sleep':    ('shadow', [tone(0.70, 300, 130, 'sine', gain=0.45, vib=(3.2, 0.05)), noise(0.50, 400, 180, 1.0, ftype='lowpass', gain=0.3)]),
    'confused': ('arcane', [fm(0.60, 380, 260, ratio=1.41, index=420, index1=120, gain=0.5), tone(0.55, 520, 700, 'triangle', gain=0.25, vib=(7, 0.1))]),
    'dazed':    ('physical', [tone(0.60, 520, 380, 'sine', gain=0.45, vib=(6, 0.08)), noise(0.25, 1600, 700, 1.4, gain=0.35)]),
    'blind':    ('shadow', [noise(0.60, 2400, 220, 0.7, ftype='lowpass', gain=0.7), tone(0.40, 180, 90, 'sine', gain=0.35)]),
    'slow':     ('shadow', [tone(0.75, 330, 110, 'sawtooth', gain=0.45), noise(0.60, 700, 200, 1.0, ftype='lowpass', gain=0.35)]),
    'marked':   ('physical', [tone(0.22, 880, 880, 'square', gain=0.35), tone(0.22, 1320, 1320, 'square', gain=0.3, delay=0.14)]),
    'barrier':  ('holy', [chord(0.70, [392, 587.33, 784], 'sine', gain=0.5, stagger=0.04), noise(0.35, 1400, 3200, 1.2, ftype='highpass', gain=0.3)]),
    'regen':    ('nature', [chord(0.75, [523.25, 659.25, 880], 'triangle', gain=0.45, stagger=0.07), pluck(0.60, 440, 0.5, gain=0.35)]),
    'sunder':   ('physical', [noise(0.30, 1800, 300, 0.8, color='brown', gain=0.85), tone(0.30, 130, 55, 'sine', gain=0.6), grain(0.35, 8, 400, 1600, 0.01, 0.04, gain=0.4)]),
    'curse':    ('shadow', [tone(0.85, 155, 58, 'sawtooth', gain=0.6), fm(0.70, 110, 82, ratio=2.51, index=300, gain=0.4), noise(0.60, 600, 140, 0.8, ftype='lowpass', gain=0.45)]),
    'silence':  ('shadow', [noise(0.45, 3000, 180, 0.6, ftype='lowpass', gain=0.6), tone(0.35, 440, 110, 'sine', gain=0.3)]),
    'disarm':   ('physical', [noise(0.30, 3000, 900, 2.2, gain=0.6), tone(0.35, 700, 260, 'triangle', gain=0.4), grain(0.35, 6, 1200, 3600, 0.008, 0.03, gain=0.35)]),
    'root':     ('nature', [noise(0.50, 700, 180, 1.0, ftype='lowpass', color='brown', gain=0.7), pluck(0.45, 147, 0.35, gain=0.45), grain(0.45, 10, 300, 1100, 0.015, 0.05, gain=0.35)]),
    'rally':    ('holy', [chord(0.60, [392, 493.88, 587.33, 784], 'triangle', gain=0.55, stagger=0.05), noise(0.25, 1800, 4000, 1.0, ftype='highpass', gain=0.25)]),
    'haste':    ('lightning', [tone(0.35, 600, 2200, 'triangle', gain=0.45), noise(0.30, 2200, 6000, 1.4, ftype='highpass', gain=0.35), grain(0.35, 10, 2000, 6000, 0.004, 0.014, gain=0.3)]),
    'enchant':  ('arcane', [fm(0.60, 660, 990, ratio=3.5, index=500, index1=50, gain=0.5), chord(0.55, [880, 1174.66], 'sine', gain=0.3, stagger=0.03)]),
    'block':    ('physical', [noise(0.24, 3400, 900, 1.8, gain=0.8), tone(0.30, 220, 120, 'triangle', gain=0.5), tone(0.45, 1760, 1500, 'sine', gain=0.25, delay=0.02)]),
    'deflect':  ('physical', [noise(0.20, 4200, 1400, 2.4, gain=0.7), tone(0.35, 1320, 2000, 'sine', gain=0.35)]),
}


def status_tick(layers):
    """A tick is the apply sting, shorter and softer: one layer, half the length."""
    base = dict(layers[0])
    base = json.loads(json.dumps(base))
    base['gain'] = round(base.get('gain', 0.6) * 0.55, 3)
    if 'dur' in base:
        base['dur'] = round(base['dur'] * 0.5, 3)
    if 'env' in base:
        base['env']['d'] = round(base['env']['d'] * 0.5, 3)
    return base


# ---------------------------------------------------------------------------------------------
# library mapping (Kenney CC0 packs vendored under sfx/assets/kenney/)

def f(pack, *names):
    return ['kenney/%s/%s' % (pack, n) for n in names]


def series(pack, stem, lo, hi, width=3, ext='ogg'):
    return ['kenney/%s/%s%s.%s' % (pack, stem, str(i).zfill(width), ext) for i in range(lo, hi + 1)]


LIBRARY = {
    'spell.physical.launch': f('rpg', 'knifeSlice.ogg', 'knifeSlice2.ogg', 'chop.ogg'),
    'spell.physical.impact': series('impact', 'impactPunch_medium_', 0, 4),
    'spell.ice.impact':      series('impact', 'impactGlass_medium_', 0, 4),
    'spell.nature.impact':   series('impact', 'impactWood_medium_', 0, 4),
    'spell.bleed.impact':    series('impact', 'impactSoft_medium_', 0, 4),
    'spell.holy.impact':     series('impact', 'impactBell_heavy_', 0, 4),
    'spell.true.impact':     series('impact', 'impactGlass_light_', 0, 4),

    'melee.swing': f('rpg', 'knifeSlice.ogg', 'knifeSlice2.ogg', 'drawKnife1.ogg', 'drawKnife2.ogg', 'drawKnife3.ogg'),
    'melee.hit':   series('impact', 'impactPunch_medium_', 0, 4),
    'melee.crit':  series('impact', 'impactPunch_heavy_', 0, 4),
    'melee.miss':  f('rpg', 'cloth1.ogg', 'cloth2.ogg', 'cloth3.ogg', 'cloth4.ogg'),
    'melee.block': series('impact', 'impactMetal_medium_', 0, 4),

    'death.humanoid':  series('impact', 'impactSoft_heavy_', 0, 2),
    'death.beast':     series('impact', 'impactSoft_heavy_', 3, 4),
    'death.construct': series('impact', 'impactPlate_heavy_', 0, 4),

    'status.freeze.apply': series('impact', 'impactGlass_light_', 0, 4),
    'status.stun.apply':   f('impact', 'impactBell_heavy_004.ogg'),
    'status.block.apply':  series('impact', 'impactMetal_light_', 0, 4),
    'status.sunder.apply': series('impact', 'impactPlank_medium_', 0, 4),

    'levelup':        series('interface', 'confirmation_', 1, 4),
    'quest.complete': f('interface', 'bong_001.ogg', 'maximize_005.ogg', 'maximize_009.ogg'),
    'heal':           f('interface', 'pluck_001.ogg', 'pluck_002.ogg'),
    'revive':         f('interface', 'confirmation_004.ogg', 'maximize_008.ogg'),

    'loot.common':    f('rpg', 'dropLeather.ogg', 'handleSmallLeather.ogg', 'handleSmallLeather2.ogg'),
    'loot.normal':    f('rpg', 'dropLeather.ogg', 'handleSmallLeather.ogg', 'handleSmallLeather2.ogg'),
    'loot.uncommon':  series('interface', 'drop_', 1, 4),
    'loot.magic':     series('interface', 'drop_', 1, 4),
    'loot.rare':      f('interface', 'glass_001.ogg', 'glass_003.ogg', 'glass_005.ogg'),
    'loot.epic':      f('interface', 'glass_002.ogg', 'glass_004.ogg', 'glass_006.ogg'),
    'loot.legendary': f('interface', 'bong_001.ogg') + f('impact', 'impactBell_heavy_000.ogg'),

    'coin':  f('rpg', 'handleCoins.ogg', 'handleCoins2.ogg'),
    'equip': f('rpg', 'beltHandle1.ogg', 'beltHandle2.ogg', 'clothBelt.ogg', 'clothBelt2.ogg', 'metalLatch.ogg', 'metalClick.ogg'),

    'ui.click': series('interface', 'click_', 1, 5),
    'ui.hover': f('interface', 'tick_001.ogg', 'tick_002.ogg', 'tick_004.ogg'),
    'ui.tab':   series('interface', 'select_', 1, 5),
    'ui.open':  series('interface', 'open_', 1, 4),
    'ui.close': series('interface', 'close_', 1, 4),
    'ui.error': series('interface', 'error_', 1, 4),

    'travel.step': f('rpg', *['footstep0%d.ogg' % i for i in range(10)]) + series('impact', 'footstep_grass_', 0, 4),
}

# ---------------------------------------------------------------------------------------------
# retro (chiptune) patterns: one per category, tuned per id by a hash of the id.

RETRO_PATTERN = {
    'spell':     {'pattern': 'arp', 'wave': 'square', 'dur': 0.30},
    'impact':    {'pattern': 'hit', 'wave': 'noise',  'dur': 0.22},
    'status':    {'pattern': 'blip', 'wave': 'square', 'dur': 0.22},
    'melee':     {'pattern': 'hit', 'wave': 'noise',  'dur': 0.16},
    'death':     {'pattern': 'fall', 'wave': 'square', 'dur': 0.5},
    'sting':     {'pattern': 'fanfare', 'wave': 'square', 'dur': 0.7},
    'loot':      {'pattern': 'rise', 'wave': 'triangle', 'dur': 0.3},
    'ui':        {'pattern': 'blip', 'wave': 'square', 'dur': 0.08},
    'ambience':  {'pattern': 'hum', 'wave': 'triangle', 'dur': 1.2},
    'world':     {'pattern': 'blip', 'wave': 'noise', 'dur': 0.12},
}


def entry(sid, category, label, synth_dur, layers, loop=False, trim=0.0, retro_over=None):
    e = {'id': sid, 'category': category, 'label': label, 'loop': loop, 'trim': trim,
         'synth': {'dur': round(synth_dur, 3), 'jitter': 0.06, 'layers': layers}}
    if sid in LIBRARY:
        e['library'] = {'files': LIBRARY[sid], 'pitch': [0.94, 1.06]}
    r = dict(RETRO_PATTERN.get(category, RETRO_PATTERN['ui']))
    if retro_over:
        r.update(retro_over)
    r['loop'] = loop
    e['retro'] = r
    return e


def build():
    out = []
    labels = {'launch': 'launch', 'travel': 'in flight', 'impact': 'impact'}
    for el in ELEMENTS:
        R = element_recipes(el)
        for phase in ('launch', 'travel', 'impact'):
            dur, layers = R[phase]
            cat = 'impact' if phase == 'impact' else 'spell'
            out.append(entry('spell.%s.%s' % (el, phase), cat,
                             '%s %s' % (el.capitalize(), labels[phase]),
                             dur, layers, loop=(phase == 'travel')))
    for st in STATUSES:
        el, layers = STATUS_RECIPE[st]
        dur = max(l.get('dur', 0.3) + l.get('delay', 0) for l in layers)
        out.append(entry('status.%s.apply' % st, 'status', '%s applied' % st.capitalize(), dur, layers))
        tick = status_tick(layers)
        out.append(entry('status.%s.tick' % st, 'status', '%s tick' % st.capitalize(),
                         tick.get('dur', 0.2), [tick], trim=-3.0))

    out.append(entry('cast.start', 'spell', 'Cast start', 0.55, [
        fm(0.50, 220, 660, ratio=2.5, index=300, index1=80, gain=0.55),
        noise(0.45, 600, 3400, 1.6, gain=0.4, a=0.12, curve='lin'),
        chord(0.45, [440, 554.37], 'sine', gain=0.25, stagger=0.04, delay=0.05)]))
    out.append(entry('heal', 'sting', 'Heal', 0.90, [
        chord(0.85, [523.25, 659.25, 783.99], 'sine', gain=0.55, stagger=0.06, a=0.02),
        noise(0.50, 2400, 5200, 1.2, ftype='highpass', gain=0.28, a=0.1, curve='lin'),
        pluck(0.60, 880, 0.6, gain=0.3, delay=0.05)]))
    out.append(entry('revive', 'sting', 'Revive', 1.40, [
        chord(1.30, [261.63, 392, 523.25, 783.99], 'sine', gain=0.6, stagger=0.10, a=0.03),
        noise(0.90, 1200, 5600, 1.0, ftype='highpass', gain=0.3, a=0.35, curve='lin'),
        tone(0.70, 65.41, 130.81, 'triangle', gain=0.35)]))

    out.append(entry('melee.swing', 'melee', 'Melee swing', 0.26, [
        noise(0.22, 600, 2800, 1.0, gain=0.7, a=0.03, curve='lin'),
        noise(0.20, 2800, 500, 1.2, gain=0.4, delay=0.05)]))
    out.append(entry('melee.hit', 'melee', 'Melee hit', 0.40, [
        noise(0.14, 2400, 500, 0.8, gain=0.95),
        tone(0.26, 160, 55, 'sine', gain=0.85),
        noise(0.28, 800, 220, 1.4, color='brown', gain=0.5, delay=0.01)]))
    out.append(entry('melee.crit', 'melee', 'Melee crit', 0.60, [
        noise(0.18, 3600, 500, 0.7, gain=1.0),
        tone(0.40, 190, 44, 'sine', gain=1.0),
        noise(0.45, 1100, 180, 1.1, color='brown', gain=0.6, delay=0.02),
        grain(0.40, 8, 800, 3200, 0.006, 0.02, gain=0.35, delay=0.02)], trim=1.0))
    out.append(entry('melee.miss', 'melee', 'Melee miss', 0.30, [
        noise(0.26, 400, 1800, 0.8, gain=0.55, a=0.06, curve='lin')], trim=-2.0))
    out.append(entry('melee.block', 'melee', 'Block', 0.55, [
        noise(0.16, 3800, 1000, 1.8, gain=0.85),
        tone(0.45, 1760, 1400, 'sine', gain=0.35, delay=0.01),
        tone(0.30, 230, 120, 'triangle', gain=0.55)]))

    out.append(entry('death.humanoid', 'death', 'Death (humanoid)', 0.90, [
        noise(0.55, 900, 180, 0.8, ftype='lowpass', color='pink', gain=0.8),
        tone(0.70, 180, 52, 'sawtooth', gain=0.5),
        noise(0.35, 500, 160, 1.2, color='brown', gain=0.45, delay=0.35)]))
    out.append(entry('death.beast', 'death', 'Death (beast)', 1.00, [
        fm(0.80, 150, 62, ratio=1.51, index=420, index1=40, gain=0.7),
        noise(0.70, 1400, 260, 0.9, ftype='lowpass', color='brown', gain=0.65),
        tone(0.50, 240, 90, 'sawtooth', gain=0.35, delay=0.10, vib=(7, 0.08))]))
    out.append(entry('death.construct', 'death', 'Death (construct)', 1.10, [
        noise(0.30, 3200, 700, 1.4, gain=0.85),
        grain(0.95, 20, 300, 2600, 0.01, 0.06, gain=0.6, delay=0.05),
        tone(0.45, 110, 40, 'sine', gain=0.6)]))

    out.append(entry('levelup', 'sting', 'Level up', 1.20, [
        chord(1.10, [523.25, 659.25, 783.99, 1046.5], 'triangle', gain=0.6, stagger=0.09, a=0.01),
        noise(0.50, 2000, 6000, 1.0, ftype='highpass', gain=0.3, a=0.2, curve='lin')]))
    out.append(entry('quest.complete', 'sting', 'Quest complete', 1.30, [
        chord(1.20, [392, 523.25, 659.25, 783.99], 'sine', gain=0.6, stagger=0.13, a=0.01),
        tone(0.60, 98, 196, 'triangle', gain=0.35)]))
    out.append(entry('night.ambush', 'sting', 'Night ambush', 1.30, [
        tone(1.10, 110, 55, 'sawtooth', gain=0.7, vib=(5.5, 0.04)),
        noise(1.00, 1800, 200, 0.7, ftype='lowpass', color='brown', gain=0.6, a=0.25, curve='lin'),
        tone(0.80, 165, 82, 'triangle', gain=0.35, delay=0.15)], trim=1.0))

    for r in RARITIES:
        bright = {'common': 0, 'normal': 0, 'uncommon': 1, 'magic': 1, 'rare': 2, 'epic': 3, 'legendary': 4}[r]
        base = 440 * (2 ** (bright / 12.0))
        layers = [chord(0.45 + bright * 0.12, [base, base * 1.5, base * 2][:1 + min(2, bright)], 'sine',
                        gain=0.5, stagger=0.04),
                  noise(0.28, 1800 + bright * 900, 4200 + bright * 1200, 1.2, ftype='highpass', gain=0.3)]
        if bright >= 3:
            layers.append(tone(0.7, base / 4, base / 4, 'triangle', gain=0.3, delay=0.06))
        out.append(entry('loot.%s' % r, 'loot', 'Loot: %s' % r, 0.5 + bright * 0.15, layers))

    out.append(entry('coin', 'loot', 'Coins', 0.50, [
        grain(0.45, 9, 2400, 6400, 0.006, 0.022, gain=0.6, spread=1.0),
        noise(0.20, 3800, 2200, 3.0, gain=0.35)], trim=-2.0))
    out.append(entry('equip', 'world', 'Equip', 0.45, [
        noise(0.18, 2600, 900, 1.6, gain=0.6),
        noise(0.30, 700, 260, 1.2, color='brown', gain=0.5, delay=0.05),
        tone(0.22, 320, 180, 'triangle', gain=0.3, delay=0.04)]))

    out.append(entry('ui.click', 'ui', 'UI click', 0.10, [
        noise(0.05, 2600, 1400, 3.0, gain=0.7),
        tone(0.08, 900, 620, 'triangle', gain=0.35)]))
    out.append(entry('ui.hover', 'ui', 'UI hover', 0.07, [
        tone(0.05, 1400, 1600, 'sine', gain=0.3),
        noise(0.04, 4200, 3400, 4.0, gain=0.2)], trim=-6.0))
    out.append(entry('ui.tab', 'ui', 'UI tab', 0.14, [
        tone(0.11, 620, 880, 'triangle', gain=0.4),
        noise(0.06, 2200, 3000, 2.5, gain=0.25)]))
    out.append(entry('ui.open', 'ui', 'UI open', 0.26, [
        tone(0.22, 330, 740, 'triangle', gain=0.4),
        noise(0.18, 900, 3000, 1.4, gain=0.3, a=0.05, curve='lin')]))
    out.append(entry('ui.close', 'ui', 'UI close', 0.26, [
        tone(0.22, 740, 300, 'triangle', gain=0.4),
        noise(0.18, 3000, 800, 1.4, gain=0.3)]))
    out.append(entry('ui.error', 'ui', 'UI error', 0.32, [
        tone(0.14, 220, 220, 'square', gain=0.4),
        tone(0.16, 165, 150, 'square', gain=0.4, delay=0.13)]))

    out.append(entry('travel.step', 'world', 'Travel step', 0.28, [
        noise(0.12, 1200, 300, 1.0, color='brown', gain=0.7),
        noise(0.22, 400, 160, 1.4, ftype='lowpass', gain=0.4, delay=0.01),
        grain(0.20, 5, 600, 2400, 0.006, 0.02, gain=0.3, noisy=True)], trim=-3.0))
    out.append(entry('camp.fire', 'ambience', 'Campfire (loop)', 2.40, [
        drone(2.40, 260, 900, 0.9, 'brown', gain=0.55, lfo=0.7, depth=0.5),
        grain(2.40, 26, 900, 4200, 0.004, 0.02, gain=0.35, noisy=True),
        drone(2.40, 60, 150, 1.2, 'brown', gain=0.3, lfo=0.31, depth=0.4)], loop=True))

    AMB = {
        'forest':   [drone(3.0, 300, 1400, 0.8, 'pink', gain=0.5, lfo=0.18, depth=0.55),
                     grain(3.0, 12, 1800, 5200, 0.02, 0.12, gain=0.22, spread=1.0),
                     drone(3.0, 80, 240, 1.0, 'brown', gain=0.25, lfo=0.09, depth=0.4)],
        'cave':     [drone(3.0, 90, 380, 1.1, 'brown', gain=0.6, lfo=0.07, depth=0.5),
                     grain(3.0, 7, 400, 1600, 0.03, 0.14, gain=0.25, sweep=0.5),
                     drone(3.0, 900, 1800, 3.0, 'pink', gain=0.15, lfo=0.21, depth=0.6)],
        'town':     [drone(3.0, 200, 900, 0.7, 'pink', gain=0.45, lfo=0.26, depth=0.5),
                     grain(3.0, 16, 300, 1200, 0.05, 0.2, gain=0.28, sweep=1.3),
                     drone(3.0, 1200, 2600, 2.0, 'white', gain=0.12, lfo=0.4, depth=0.5)],
        'marsh':    [drone(3.0, 140, 560, 1.0, 'brown', gain=0.5, lfo=0.12, depth=0.5),
                     grain(3.0, 14, 200, 900, 0.03, 0.16, gain=0.3, sweep=2.0),
                     drone(3.0, 2200, 4200, 2.4, 'white', gain=0.12, lfo=0.33, depth=0.6)],
        'mountain': [drone(3.0, 400, 2400, 0.6, 'white', gain=0.55, lfo=0.15, depth=0.7),
                     drone(3.0, 70, 200, 0.9, 'brown', gain=0.3, lfo=0.06, depth=0.5)],
        'void':     [drone(3.0, 60, 260, 1.4, 'brown', gain=0.55, lfo=0.04, depth=0.5),
                     drone(3.0, 700, 1500, 4.0, 'pink', gain=0.25, lfo=0.11, depth=0.8),
                     drone(3.0, 2400, 5200, 6.0, 'white', gain=0.12, lfo=0.23, depth=0.9)],
        'fire':     [drone(3.0, 240, 1100, 0.9, 'brown', gain=0.55, lfo=0.55, depth=0.55),
                     grain(3.0, 30, 800, 4600, 0.004, 0.02, gain=0.32, noisy=True),
                     drone(3.0, 55, 140, 1.1, 'brown', gain=0.3, lfo=0.19, depth=0.4)],
        'wind':     [drone(3.0, 300, 1800, 0.6, 'pink', gain=0.55, lfo=0.13, depth=0.7),
                     drone(3.0, 90, 260, 1.0, 'brown', gain=0.25, lfo=0.05, depth=0.5)],
    }
    for k, layers in AMB.items():
        out.append(entry('ambience.%s' % k, 'ambience', 'Ambience: %s' % k, 3.0, layers, loop=True))

    return out


def main():
    sounds = build()
    doc = {
        'version': 1,
        'generatedBy': 'sfx/tools/build-catalog.py',
        'note': 'Logical sound ids a game asks for. Categories drive the loudness target; see sfx/README.md.',
        'categories': {
            # target = K-weighted loudness the normalizer aims each clip at, in LUFS-ish dBFS.
            'spell':    {'target': -19, 'bus': 'sfx', 'label': 'Spells (cast / flight)'},
            'impact':   {'target': -16, 'bus': 'sfx', 'label': 'Spell impacts'},
            'melee':    {'target': -17, 'bus': 'sfx', 'label': 'Melee'},
            'status':   {'target': -22, 'bus': 'sfx', 'label': 'Status effects'},
            'death':    {'target': -17, 'bus': 'sfx', 'label': 'Deaths'},
            'sting':    {'target': -18, 'bus': 'sfx', 'label': 'Stings (heal, level up, quest)'},
            'loot':     {'target': -19, 'bus': 'sfx', 'label': 'Loot and coins'},
            'world':    {'target': -21, 'bus': 'sfx', 'label': 'World (steps, equip)'},
            'ui':       {'target': -26, 'bus': 'ui',  'label': 'Interface'},
            'ambience': {'target': -30, 'bus': 'ambience', 'label': 'Ambience loops'},
        },
        'peakCeilingDb': -1.0,
        'elements': ELEMENTS,
        'statuses': STATUSES,
        'rarities': RARITIES,
        'ambiences': AMBIENCES,
        'sounds': sounds,
    }
    with open(OUT, 'w') as fh:
        json.dump(doc, fh, indent=1)
    print('wrote %s with %d sounds (%d with library samples)' %
          (os.path.relpath(OUT), len(sounds), sum(1 for s in sounds if 'library' in s)))


if __name__ == '__main__':
    main()
