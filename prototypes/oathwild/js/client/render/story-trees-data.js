// COPIED from Thousandvale (prototypes/thousandvale/js/client/tree-style-data.js, 2026-11-24) with story-trees.js.
//
// Storybook trees — the numbers (2026-10-20, owner: "the new big trees look better from a distance. They have big
// interesting leaves. When you get closer it gets replaced with a spindly tree with tiny leaves. Can we have trees
// updated to look more cartoony and mythical rather than realistic"). js/client/tree-style.js builds from this table.
//
// One row per tree NAME the scatter asks for (the kit species names in js/client/scatter-view.js KIND_ART, plus
// Thousandvale's own `story_fern_*`). All lengths are in the model's own units, before the scatter's `scale` — the same
// units the kit tree had, so a tree comes out the size it was (heights and crowns copied off the kit trees each one
// replaces, measured with the scatter's seeds).
//
//   form      which builder: round (a broadleaf of puffy leaf clumps), tall (stacked ovals: birch, beech), weep (a
//             willow's curtain), tiers (a conifer of stacked skirts), crown (a pine: a bare trunk, a few flat tiers at the
//             top), snag (dead, no leaves), palm, fern (a tree fern)
//   h         height;  trunkH  where the trunk stops and the crown starts (fraction of h)
//   rB / rT   trunk radius at the ground line / at the top. FITTED (2026-10-20) so the trunk at body height measures what
//             js/rules/nav-refine.js SCATTER_COLLIDE already says (tools/measure-scatter.mjs; tests/D/tree-style.test.js) —
//             the colliders and the baked routes did not change with the new art. Change one only with a re-bake.
//   flare     how much wider the very base is (root flare), twist  turns of the bark ridges up the trunk, ridge  how deep
//   crownR    the canopy's radius;  clumps  how many leaf clumps round the top one;  squash  canopy height / width
//   leafRow   atlas row (0 broadleaf, 1 needle, 2 small leaf, 3 frond);  leaf  vertex-colour multiplier on the leaf picture
//   bark      vertex-colour multiplier on the bark picture;  bands  birch-style dark bands up the trunk
//   accent    the mythical touch: { kind: 'blossom' | 'glow', color, n } small bright cards in the canopy
export const STORY_TREES = Object.freeze({
  oak:         { form: 'round', h: 12.5, trunkH: 0.42, rB: 0.56, rT: 0.379, flare: 0.75, twist: 0.6, ridge: 0.1, crownR: 4.8, clumps: 5, squash: 0.78, leafRow: 0, leaf: [0.88, 1.22, 0.5], bark: [1.6, 1.22, 0.92], limbs: 3 },
  beech:       { form: 'tall', h: 15, trunkH: 0.45, rB: 0.495, rT: 0.319, flare: 0.6, twist: 0.35, ridge: 0.07, crownR: 3.7, clumps: 4, squash: 1.35, leafRow: 0, leaf: [1.02, 1.22, 0.45], bark: [2.2, 2.6, 3.1], limbs: 3 },
  birch:       { form: 'tall', h: 13, trunkH: 0.4, rB: 0.384, rT: 0.217, flare: 0.45, twist: 0.2, ridge: 0.05, crownR: 3.0, clumps: 4, squash: 1.55, leafRow: 2, leaf: [1.1, 1.26, 0.42], bark: [4.6, 6.4, 8.4], bands: true, limbs: 2 },
  silver_birch: { form: 'tall', h: 13, trunkH: 0.4, rB: 0.497, rT: 0.281, flare: 0.45, twist: 0.2, ridge: 0.05, crownR: 3.0, clumps: 4, squash: 1.55, leafRow: 2, leaf: [1.1, 1.26, 0.42], bark: [4.6, 6.4, 8.4], bands: true, limbs: 2 },      // tree_birch (Torbor Downs): the same tree, its own trunk radius (nav-refine SCATTER_COLLIDE)
  ancient_oak: { form: 'round', h: 24, trunkH: 0.36, rB: 2.193, rT: 1.192, flare: 0.9, twist: 0.9, ridge: 0.16, crownR: 12, clumps: 7, squash: 0.72, leafRow: 0, leaf: [0.8, 1.16, 0.6], bark: [1.45, 1.12, 0.88], limbs: 5,
    accent: { kind: 'glow', color: [2.6, 2.2, 1.0], n: 22 } },
  willow:      { form: 'weep', h: 11, trunkH: 0.4, rB: 0.637, rT: 0.411, flare: 0.8, twist: 0.8, ridge: 0.12, crownR: 5.5, clumps: 5, squash: 0.55, leafRow: 2, leaf: [0.98, 1.22, 0.48], bark: [1.5, 1.25, 0.95], limbs: 4, strands: 22 },
  pine:        { form: 'crown', h: 19, trunkH: 0.44, rB: 0.416, rT: 0.153, flare: 0.6, twist: 0.4, ridge: 0.08, crownR: 4.6, tiers: 4, leafRow: 1, leaf: [0.8, 1.1, 0.72], bark: [1.65, 1.15, 0.85] },
  fir:         { form: 'tiers', h: 16, trunkH: 0.12, rB: 0.399, rT: 0.096, flare: 0.5, twist: 0.2, ridge: 0.05, crownR: 4.0, tiers: 5, leafRow: 1, leaf: [0.78, 1.12, 0.8], bark: [1.25, 1.0, 0.8] },
  spruce:      { form: 'tiers', h: 21, trunkH: 0.1, rB: 0.449, rT: 0.098, flare: 0.5, twist: 0.2, ridge: 0.05, crownR: 3.8, tiers: 6, leafRow: 1, leaf: [0.68, 1.02, 0.86], bark: [1.2, 0.98, 0.82] },
  dead_snag:   { form: 'snag', h: 8.5, rB: 0.328, rT: 0.15, flare: 0.8, twist: 1.2, ridge: 0.14, limbs: 3, bark: [1.7, 1.75, 1.9] },
  dead_pine:   { form: 'snag', h: 15, rB: 0.393, rT: 0.094, flare: 0.6, twist: 0.7, ridge: 0.1, limbs: 5, bark: [1.8, 1.85, 2.0], tall: true },
  palm_fan:    { form: 'palm', h: 7, rB: 0.183, rT: 0.129, flare: 0.5, twist: 0, ridge: 0, fronds: 8, frondLen: 3.1, leafRow: 3, leaf: [0.98, 1.22, 0.5], bark: [1.8, 1.45, 1.05] },
  // Oathwild understory (environment round 2026-11-24): shrubs are 'round' trees with no trunk to speak of — a low dome of
  // leaf tufts, the same leaves as the big trees so the woods read as one place; saplings are young oaks and spruces
  shrub:       { form: 'round', h: 1.8, trunkH: 0.08, rB: 0.07, rT: 0.04, flare: 0.3, twist: 0, ridge: 0, crownR: 1.3, clumps: 4, squash: 0.7, leafRow: 0, leaf: [0.8, 1.12, 0.48], bark: [1.4, 1.1, 0.85], limbs: 0 },
  shrub_tall:  { form: 'round', h: 2.8, trunkH: 0.12, rB: 0.09, rT: 0.05, flare: 0.3, twist: 0, ridge: 0, crownR: 1.5, clumps: 4, squash: 0.95, leafRow: 0, leaf: [0.9, 1.18, 0.5], bark: [1.4, 1.1, 0.85], limbs: 0 },
  shrub_berry: { form: 'round', h: 1.6, trunkH: 0.08, rB: 0.07, rT: 0.04, flare: 0.3, twist: 0, ridge: 0, crownR: 1.2, clumps: 3, squash: 0.72, leafRow: 0, leaf: [0.74, 1.04, 0.5], bark: [1.4, 1.1, 0.85], limbs: 0,
    accent: { kind: 'blossom', color: [2.3, 0.75, 0.9], n: 9 } },
  shrub_dry:   { form: 'round', h: 1.5, trunkH: 0.08, rB: 0.07, rT: 0.04, flare: 0.3, twist: 0, ridge: 0, crownR: 1.15, clumps: 3, squash: 0.7, leafRow: 0, leaf: [1.15, 1.1, 0.5], bark: [1.4, 1.1, 0.85], limbs: 0 },
  sapling:     { form: 'round', h: 6.5, trunkH: 0.4, rB: 0.16, rT: 0.1, flare: 0.5, twist: 0.3, ridge: 0.06, crownR: 2.4, clumps: 4, squash: 0.85, leafRow: 0, leaf: [0.95, 1.24, 0.5], bark: [1.6, 1.22, 0.92], limbs: 2 },
  story_fern_a: { form: 'fern', h: 3.0, rB: 0.22, rT: 0.183, flare: 0.5, twist: 0.15, ridge: 0.12, fronds: 9, frondLen: 2.3, leafRow: 3, leaf: [0.85, 1.2, 0.52], bark: [1.5, 1.15, 0.85] },
  story_fern_b: { form: 'fern', h: 3.5, rB: 0.218, rT: 0.182, flare: 0.5, twist: 0.15, ridge: 0.12, fronds: 10, frondLen: 2.6, leafRow: 3, leaf: [0.8, 1.18, 0.55], bark: [1.5, 1.15, 0.85] },
  story_fern_c: { form: 'fern', h: 2.7, rB: 0.215, rT: 0.179, flare: 0.5, twist: 0.15, ridge: 0.12, fronds: 11, frondLen: 2.1, leafRow: 3, leaf: [0.92, 1.22, 0.5], bark: [1.5, 1.15, 0.85] },
});

/** Detail by level: trunk sides, rings, leaf cards per clump, and whether a clump has a solid core. LOD 2 is the far card set. */
export const STORY_LOD = Object.freeze([
  { sides: 8, rings: 7, limbSides: 5, cards: 8, cardRows: 3, core: 1, accent: 1, strandsK: 1, frondSegs: 4 },
  { sides: 6, rings: 4, limbSides: 4, cards: 5, cardRows: 2, core: 0, accent: 0.5, strandsK: 0.5, frondSegs: 2 },
  { sides: 5, rings: 3, limbSides: 0, cards: 0, cardRows: 2, core: 0, accent: 0, strandsK: 0, frondSegs: 1 },   // Oathwild: 5 sides (3 made a giant's trunk a pyramid on Low)
]);
