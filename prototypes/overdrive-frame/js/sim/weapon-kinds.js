// Round 7: the part → spec numbers for the new weapon kinds and the effect fields (sim/weapon-fx.js makes them happen).
// loadout.js weaponSpec calls extraSpec ONCE, right before it returns (part mods are applied after this, by the lead).
//
// Part fields in mechkit/data/parts.json use the same units as the rest of the file (metres, seconds, %):
//   ricochet (bounces) · chainJumps + chainChance (%) · seek (degrees / s) · echo (% of the damage) ·
//   wellRadius (m) + wellTime (s) + wellPull (m/s) + wellDps (% of the damage per second) · cluster (bomblets) ·
//   napalm (s of burning ground) · leech (% of damage dealt) · overkill (% of the killing hit)
//   new kinds: splits / splitRange (m) (prism) · delay (s) (orbital) · waveRange (m) + waveShare (%) (scythe) ·
//   targets (tesla) · orbs + life (s) (orb launcher) · strikeEvery (s) + life (s) (storm caller) · cloud (m) + life (s) (nanite)
//
// The spec fields this writes (and that part mods may set directly on any spec):
//   ricochet: n (1–4)              chainOnHit: { jumps 1–4, chance 0..1 }     seek: rad/s (1–5)     echo: 0..1
//   vortex: { r tiles 0.8–3, t s 1.5–5, pull tiles/s 0.6–2.5, dps? }        cluster: n (2–10)      napalm: s (2–6)
//   leech: 0..0.3                  overkill: 0..1                             dtype: 'cryo' | 'void'  look: drawing hint
const M = 16;   // metres per tile

/** What each new part kind fires as (the KIND_MAP rows in loadout.js point here too). */
export const NEW_KINDS = {
  'sweep-lance': { kind: 'lance' }, prism: { kind: 'prism' }, 'orbital-lance': { kind: 'orbital' }, scythe: { kind: 'scythe', speed: 9 },
  'rift-needler': { kind: 'bullet', speed: 18 }, 'cluster-mortar': { kind: 'lob', speed: 6 }, 'grav-anchor': { kind: 'plasma', speed: 4.5 },
  'cryo-projector': { kind: 'flame', speed: 5 }, 'tesla-coil': { kind: 'tesla' }, 'orb-launcher': { kind: 'orbs', speed: 3 },
  'storm-caller': { kind: 'storm' }, 'nanite-sprayer': { kind: 'lob', speed: 6 }, firepot: { kind: 'lob', speed: 6.5 },
  glaive: { kind: 'glaive', speed: 8 }, pinball: { kind: 'bullet', speed: 15 }, sparkplug: { kind: 'bullet', speed: 17 },
};

/** Plain names for every weapon kind (item cards, the Mech Kit page) — no code names on screen. */
export const KIND_LABELS = {
  'sweep-lance': 'Sweep lance', prism: 'Prism laser', 'orbital-lance': 'Orbital lance', scythe: 'Wave scythe', 'rift-needler': 'Rift needler',
  'cluster-mortar': 'Cluster mortar', 'grav-anchor': 'Gravity well launcher', 'cryo-projector': 'Cryo projector', 'tesla-coil': 'Arc coil',
  'orb-launcher': 'Seeker orbs', 'storm-caller': 'Storm caller', 'nanite-sprayer': 'Nanite sprayer', firepot: 'Firepot lobber',
  glaive: 'Returning disc', pinball: 'Ricochet gun', sparkplug: 'Spark carbine',
};

/** Plain lines for what an effect field does (item cards). value = the spec value. */
export const FX_TEXT = {
  ricochet: v => `Bounces to ${v} more ${v === 1 ? 'enemy' : 'enemies'}`,
  chainOnHit: v => `${Math.round(v.chance * 100)}% of hits spark to ${v.jumps} nearby`,
  seek: () => 'Shots curve toward enemies',
  echo: v => `Fires again for ${Math.round(v * 100)}% damage`,
  vortex: v => `Leaves a gravity well (${Math.round(v.r * M)} m, ${Math.round(v.t)} s)`,
  cluster: v => `Throws ${v} bomblets`,
  napalm: v => `Leaves burning ground for ${Math.round(v)} s`,
  leech: v => `Repairs you for ${Math.round(v * 100)}% of damage dealt`,
  overkill: v => `Kills burst for ${Math.round(v * 100)}% of the hit`,
};

/**
 * Fill in the round 7 fields. part = the parts.json entry, spec = weaponSpec's spec so far, n(key) = the part's number
 * after rarity and bonus lines (loadout.partNum), stats = the frame's mechStats (or null). Mutates and returns spec.
 */
export function extraSpec(part, spec, n, stats = null) {
  const num = k => { const v = n(k); return typeof v === 'number' ? v : 0; };
  // ---- effect fields any weapon part may carry ----
  if (part.ricochet) spec.ricochet = Math.round(num('ricochet'));
  if (part.chainJumps) spec.chainOnHit = { jumps: Math.round(num('chainJumps')), chance: Math.min(1, num('chainChance') / 100) };
  if (part.seek) spec.seek = num('seek') * Math.PI / 180;
  if (part.echo) spec.echo = Math.min(1, num('echo') / 100);
  if (part.wellRadius) spec.vortex = { r: num('wellRadius') / M, t: num('wellTime') || 3, pull: (num('wellPull') || 24) / M, dps: spec.dmg * (num('wellDps') || 0) / 100 };
  if (part.cluster) spec.cluster = Math.round(num('cluster'));
  if (part.napalm) spec.napalm = num('napalm');
  if (part.leech) spec.leech = Math.min(0.3, num('leech') / 100);
  if (part.overkill) spec.overkill = Math.min(1, num('overkill') / 100);
  // ---- the new kinds ----
  const map = NEW_KINDS[part.kind]; if (!map) return spec;
  spec.look = part.kind;
  switch (part.kind) {
    case 'sweep-lance': spec.pierce = 12; spec.width = 0.16; spec.spread = 0; break;
    case 'prism': spec.splits = part.splits || 3; spec.splitRange = (part.splitRange || 48) / M; spec.splitShare = 0.45; spec.width = 0.1; break;
    case 'orbital-lance': spec.delay = part.delay || 1.2; spec.splash = Math.max(0.6, spec.splash); break;
    case 'scythe':
      spec.range = Math.max(0.6, (num('range') / M) * 1.6); spec.arc = 2.4; spec.dmg *= stats?.meleeMul || 1; spec.knock = 2.5;
      spec.waveRange = (part.waveRange || 90) / M; spec.waveShare = (part.waveShare || 55) / 100; break;
    case 'cryo-projector': spec.status = 0.7; break;                // the flame branch already made it a cone; cold, not fire
    case 'tesla-coil': spec.jumps = part.targets || 4; spec.status = Math.max(spec.status, 0.25); break;
    case 'orb-launcher': spec.count = part.orbs || 3; spec.life = part.life || 4; spec.spread = 0.9; spec.zaps = 2; spec.zapR = 0.5; spec.turn = 3; break;
    case 'storm-caller': spec.life = part.life || 4; spec.every = part.strikeEvery || 0.22; spec.splash = Math.max(0.8, spec.splash); spec.boltR = 0.4; spec.status = Math.max(spec.status, 0.3); break;
    case 'nanite-sprayer': spec.zone = 'nanite'; spec.zoneR = (part.cloud || 16) / M; spec.zoneT = part.life || 5; spec.splash = 0; break;
    case 'glaive': spec.pierce = 99; spec.spread = 0; break;
    default: break;
  }
  return spec;
}

/** How bots use the new kinds (sim/bots.js): straight = fires along the aim; ground = lands on a spot (no sight line
 *  needed); aura = hits around the frame (fire when anything is that close). */
export const BOT_USE = { lance: 'straight', prism: 'straight', glaive: 'straight', orbital: 'ground', storm: 'ground', orbs: 'ground', tesla: 'aura', scythe: 'wave' };
