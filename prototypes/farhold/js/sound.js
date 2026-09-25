// Farhold phase 7 — sound.
//
// None of this is new audio work: `sfx/` (the Sound Lab) already has a catalog of 118 logical ids,
// four interchangeable makers behind one interface, and every clip measured and gain-matched to its
// category so a footstep and a thunderclap arrive at sensible relative volumes. This file only
// decides WHEN the game asks for what, and which ambience belongs over which ground.
//
//   const sound = await createSound({ balance });
//   sound.place(terrain.biomeAt(x, z).key, { inTown, night });   // crossfades the bed
//   sound.step(dt, control);                                     // footsteps at walking cadence
//   sound.combat('hit', { crit: true });
//
// Everything is a no-op until the browser hands us an audio context, which needs a click — so the
// game never breaks if the player has not interacted yet.

import { Sfx } from '../../../sfx/js/sfx.js';
import { familiesOf } from '../../../worldgen/js/biomes.js';

/** Which of the Sound Lab's ambience beds belongs over which kind of ground. */
const BED_BY_FAMILY = {
  grass: 'ambience.forest', jungle: 'ambience.forest', tundra: 'ambience.wind',
  ice: 'ambience.wind', desert: 'ambience.wind', rock: 'ambience.mountain',
  lava: 'ambience.void', toxic: 'ambience.marsh', crystal: 'ambience.void',
  void: 'ambience.void', ocean: 'ambience.wind',
};
const BED_BY_BIOME = {
  marsh: 'ambience.marsh', temperateForest: 'ambience.forest', rainforest: 'ambience.forest',
  borealForest: 'ambience.forest', mountains: 'ambience.mountain', snowyPeaks: 'ambience.mountain',
  volcanic: 'ambience.void', blighted: 'ambience.marsh', glimmerwaste: 'ambience.void',
};

export async function createSound({ balance = {}, method = null, volume = null, enabled = true } = {}) {
  const cfg = balance.sound || {};
  let sfx = null;
  let ready = false;
  let muted = !enabled;
  let bed = null;
  let stepPhase = 0;
  let lastFailure = null;

  async function start() {
    if (sfx || !enabled) return sfx;
    try {
      sfx = await Sfx.create({
        method: method || cfg.method || 'hybrid',
        volume: volume ?? cfg.volume ?? 0.75,
      });
      ready = true;
    } catch (err) {
      lastFailure = err?.message || String(err);      // no audio context yet, or none allowed
      sfx = null;
    }
    return sfx;
  }

  const play = (id, opts = {}) => {
    if (!ready || muted || !sfx) return false;
    try { sfx.play(id, opts); return true; } catch { return false; }
  };

  /** The bed under everything: where you are, and what the sky is doing. */
  function place(biomeKey, { inTown = false, storm = 0, inside = false } = {}) {
    if (!ready || muted) return bed;
    let want;
    if (inside) want = 'ambience.cave';
    else if (inTown) want = 'ambience.town';
    else if (storm > 0.6) want = 'ambience.wind';
    else want = BED_BY_BIOME[biomeKey] || null;
    if (!want) {
      const fam = familiesOf(biomeKeyToId(biomeKey));
      want = BED_BY_FAMILY[fam[0]] || 'ambience.wind';
    }
    if (want !== bed) {
      bed = want;
      play(bed);                       // a loop id replaces whatever loop is running
    }
    return bed;
  }

  // the bed lookup wants an id, but callers have a key; this keeps the import surface small
  let biomeIds = null;
  function biomeKeyToId(key) {
    if (!biomeIds) {
      biomeIds = {};
      // built lazily so the module stays cheap when sound is off
      for (const [i, b] of BIOME_LIST.entries()) biomeIds[b.key] = i;
    }
    return biomeIds[key] ?? 5;
  }

  /**
   * Footsteps at the cadence you are actually moving. `control` is the player controller.
   * Swimming and riding get their own sounds rather than boots on gravel.
   */
  /**
   * R25 — "Footsteps are too loud and do not sound like running on grass/dirt." On natural ground
   * (grass, forest, earth, sand, snow) a step is the muffled `travel.step.soft`; the harder recorded
   * step is kept for stone, roads and town streets. Every step also plays well under its catalog
   * level — a footstep is the most repeated sound in the game and should sit under everything.
   */
  let ground = 'soft';
  function setGround(kind) { ground = kind === 'hard' ? 'hard' : 'soft'; }
  function step(dt, control) {
    if (!ready || muted || !control) return false;
    if (control.swimming || !control.grounded || control.moving <= 0) { stepPhase = 0; return false; }
    const perMetre = control.mounted ? 0.22 : 0.52;
    stepPhase += control.moving * dt * perMetre;
    if (stepPhase < 1) return false;
    stepPhase -= 1;
    // alternate feet across the stereo field
    const id = ground === 'hard' || control.mounted ? 'travel.step' : 'travel.step.soft';
    return play(id, { pan: (stepPhase > 0.5 ? 0.18 : -0.18), gain: ground === 'hard' ? 0.45 : 0.6 });
  }

  /** R25 — a spell's own voice: its element's launch as it leaves the hand, its impact where it lands. */
  const SPELL_ELEMENTS = new Set(['fire', 'ice', 'shadow', 'holy', 'nature', 'arcane', 'lightning', 'physical', 'poison', 'bleed', 'true']);
  const spellEl = el => (SPELL_ELEMENTS.has(el) ? el : el === 'frost' || el === 'cold' ? 'ice' : el === 'void' ? 'shadow' : 'arcane');
  function spell(element, phase = 'launch', { pan = 0 } = {}) {
    return play(`spell.${spellEl(element)}.${phase}`, { pan, gain: phase === 'impact' ? 0.7 : 0.8 });
  }

  /** The noises a fight makes. */
  function combat(kind, { crit = false, pan = 0, beast = false } = {}) {
    if (kind === 'swing') return play('melee.swing', { pan });
    if (kind === 'hit') return play(crit ? 'melee.crit' : 'melee.hit', { pan });
    if (kind === 'miss') return play('melee.miss', { pan });
    if (kind === 'death') return play(beast ? 'death.beast' : 'death.humanoid', { pan });
    if (kind === 'bow') return play('spell.physical.launch', { pan });
    if (kind === 'arrow') return play('spell.physical.impact', { pan });
    return false;
  }

  /** Loot, by how good it is. */
  function loot(item) {
    const key = item?.setId || item?.isUnique ? 'loot.legendary'
      : { legendary: 'loot.epic', rare: 'loot.rare', magic: 'loot.magic' }[item?.rarity] || 'loot.normal';
    return play(key);
  }

  const ui = kind => play(`ui.${kind}`);

  return {
    start,
    get ready() { return ready; },
    get muted() { return muted; },
    get bed() { return bed; },
    get failure() { return lastFailure; },
    play, place, step, combat, loot, ui, spell, setGround,
    coin: () => play('coin'),
    equip: () => play('equip'),
    levelUp: () => play('levelup'),
    questDone: () => play('quest.complete'),
    mute(v = !muted) { muted = v; if (sfx) sfx.setMuted?.(muted); return muted; },
    setMethod(m) { try { sfx?.setMethod(m); return true; } catch { return false; } },
    stats: () => ({ ready, muted, bed, method: sfx?.method || null, failure: lastFailure }),
  };
}

// a tiny local copy of the biome order, so this module does not pull the whole table in
const BIOME_LIST = [
  { key: 'deepOcean' }, { key: 'ocean' }, { key: 'coast' }, { key: 'lake' }, { key: 'beach' },
  { key: 'grassland' }, { key: 'savanna' }, { key: 'shrubland' }, { key: 'temperateForest' },
  { key: 'rainforest' }, { key: 'borealForest' }, { key: 'tundra' }, { key: 'ice' },
  { key: 'desert' }, { key: 'badlands' }, { key: 'marsh' }, { key: 'hills' }, { key: 'mountains' },
  { key: 'snowyPeaks' }, { key: 'volcanic' }, { key: 'blighted' }, { key: 'ashPlain' },
  { key: 'veiledHills' }, { key: 'hallowed' }, { key: 'glimmerwaste' }, { key: 'seaIce' },
];
