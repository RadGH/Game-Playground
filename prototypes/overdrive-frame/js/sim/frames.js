// Frame lines and set bonuses (round 7 — owner: "more mech types to get … each faction to have multiple mechs, not just
// one frame"). Every head, core, arms, legs and booster belongs to a frame LINE (`line` in mechkit/data/parts.json); a
// line is one of a maker's mechs. Wearing 3 or more parts of one line gives that line's set bonus — something that
// changes how the frame plays, not a small number. Lines without a bonus here just don't have one yet.
// fx = chips.js applyFx keys (mul / add / res / weapon / rule / wmod). Pure: the co-op server agrees.
import { applyFx } from './chips.js';

export const SET_PARTS = ['head', 'core', 'arms', 'legs', 'booster'];
export const SET_NEED = 3;

/** line id → { name, maker, look, bonus text, fx }. From mechkit/data/lines.json's set-bonus ideas, each made a rule
 *  that changes how the frame plays (round 7). Lines of legs only (heron, glider…) can't make a set and aren't here. */
export const SETS = {
  wisp: { name: "Wisp", maker: "celerity", look: "A narrow arrowhead frame with a whip antenna and a glowing waist ring.", text: "Double Dash: quick boost twice in a row before it needs to recover", fx: { rule: { doubledash: 1 } } },
  stride: { name: "Stride", maker: "celerity", look: "The Celerity all-rounder: swept crest blades, a wedge chest and skirted legs.", text: "Phase Dash: nothing can hurt you for 0.35 s at the start of each quick boost", fx: { rule: { phase: 0.35 } } },
  halberd: { name: "Halberd", maker: "celerity", look: "Celerity at its heaviest: cheek plates, flank armour and a four-nozzle booster.", text: "Arc Mesh: 25% of hits from any weapon spark lightning to 2 enemies nearby", fx: { wmod: "coupler" } },
  vantage: { name: "Vantage", maker: "celerity", look: "A tall recon frame: a sensor-mast head, a dorsal blade, long scoped arms, a tail fin and stilt bird legs with sensor vanes.", text: "Spotter: enemies you lock on to or ping take 20% more damage from everyone; +1 lock target", fx: { rule: { painter: 0.2 }, add: { lockCount: 1 } } },
  rapier: { name: "Rapier", maker: "celerity", look: "A bladed duellist: a crested helm with one eye slit, a wasp-waisted V chest with coat-tail fins, tonfa-bladed arms and spiked legs.", text: "Duellist: after a quick boost, +30% damage for 2 s; melee hits turn electric and knock enemies flying", fx: { rule: { momentum: 0.3, brawler: 1 } } },
  mule: { name: "Mule", maker: "brannoch", look: "A squat Brannoch work frame with a single work lamp.", text: "Burst Rounds: every bullet bursts where it lands (7 m blast)", fx: { wmod: "burst" } },
  bastion: { name: "Bastion", maker: "brannoch", look: "The Brannoch standard: a slab cab, side armour, hazard stripes and exhaust stacks.", text: "Reactive Plate: blocks one hit completely every 8 s", fx: { rule: { reactive: 8 } } },
  mountain: { name: "Mountain", maker: "brannoch", look: "The heaviest Brannoch biped: a turret-bucket head with an antenna mast and four exhausts.", text: "Anchor: standing still for 1 s gives +25% damage until you move", fx: { rule: { anchor: 0.25 } } },
  redoubt: { name: "Redoubt", maker: "brannoch", look: "A siege frame: a periscope bunker head, a sloped casemate core with sandbag ridges, gun-carriage arms with mantlet shields and four braced legs on pads.", text: "Brace: standing still for 1 s gives +35% damage and you take 25% less until you move", fx: { rule: { anchor: 0.35, brace: 0.25 } } },
  breaker: { name: "Breaker", maker: "brannoch", look: "A breacher on treads: a caged welding-mask head, a wedge-prowed core, ram shoulders over huge fists and a dozer blade.", text: "Ram: boosting into enemies rams them for heavy kinetic damage and throws them back", fx: { rule: { ram: 1 } } },
  lily: { name: "Lily", maker: "calyx", look: "A Calyx light frame with one big eye and glowing pod lamps.", text: "Nanite Weave: repairs 1.2% armour a second after 4 s without being hit", fx: { rule: { nanite: 0.012 } } },
  shell: { name: "Shell", maker: "calyx", look: "The Calyx standard: a three-eyed bulb head and a beetle-shell core.", text: "Static Shell: enemies touching your frame take 120 electric damage a second", fx: { rule: { static: 1 } } },
  carapace: { name: "Carapace", maker: "calyx", look: "The heaviest Calyx frame: mandible plates and side carapace.", text: "Thermal Vent: overheating blasts fire around you (48 m) and dumps 40% of the heat", fx: { rule: { vent: 1 } } },
  bloom: { name: "Bloom", maker: "calyx", look: "A hover medic frame: a flower head round a lamp eye, a core hung with pod clusters, a halo shield emitter and a ring of floating seed pods.", text: "Field Medic: +1 repair kit charge, repairs 15% more, and your kit also repairs teammates within 48 m", fx: { rule: { kitCharges: 1, kitHeal: 0.15, kitShare: 1 } } },
  sickle: { name: "Sickle", maker: "calyx", look: "A mantis hunter: a triangle head with compound eyes and feelers, a hunched thorax with a hanging abdomen, scythe forearms and clawed bird legs.", text: "Reaper: a kill within 32 m readies your quick boost at once and gives +30% speed for 3 s", fx: { rule: { reaper: 0.3 } } },
  tinker: { name: "Tinker", maker: "patchwork", look: "An oil-drum head on a roll-caged forklift cab.", text: "Scavenger: every pickup repairs 2% of your armour", fx: { rule: { scavenge: 0.02 } } },
  junker: { name: "Junker", maker: "patchwork", look: "A camera-box head and a tyre for armour.", text: "Napalm Fill: every blast leaves burning ground for 4 s", fx: { wmod: "napalm" } },
  hulk: { name: "Hulk", maker: "patchwork", look: "A caged floodlight head and a rocket-drum booster.", text: "Last Stand: below 30% armour you take 35% less damage", fx: { rule: { laststand: 0.35 } } },
  hauler: { name: "Hauler", maker: "patchwork", look: "A junk-crawler: a crane-cab head with a beacon, a skip-bin core heaped with scrap, a crane jib and winch, an exhaust stack and treads with forklift tines.", text: "Field Engineer: turrets, mines and drones get +30% armour and last 25% longer", fx: { rule: { deployBoost: 1 } } },
  pogo: { name: "Pogo", maker: "patchwork", look: "A scrappy hopper: an upturned bucket head with a traffic-light eye, a barrel body with a flag, scaffold-pole arms and big pogo-spring bird legs.", text: "Shock Landing: landing from a jump shocks enemies within 32 m and knocks them back", fx: { rule: { shockland: 1 } } },
};

const lineOf = p => p?.line || null;

/** Which line each set slot belongs to, and how many of each line are worn. */
export function linesWorn(build, P) {
  const count = {};
  for (const s of SET_PARTS) { const it = build[s]; const p = P[typeof it === 'string' ? it : it?.id]; const l = lineOf(p); if (l) count[l] = (count[l] || 0) + 1; }
  return count;
}

/** The set bonuses a build has switched on: [{ line, name, text, worn }]. */
export function activeSets(build, P) {
  return Object.entries(linesWorn(build, P)).filter(([l, n]) => n >= SET_NEED && SETS[l]).map(([l, n]) => ({ line: l, worn: n, ...SETS[l] }));
}

/** Fold the active set bonuses into a build's stats. */
export function applySets(st, build, P) {
  for (const s of activeSets(build, P)) applyFx(st, s.fx || {});
  return st;
}
