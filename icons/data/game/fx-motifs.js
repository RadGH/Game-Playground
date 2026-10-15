// Thousandvale class signatures. Every finished sprite uses viewBox="0 0 64 64".
// White geometry is tinted by the effects renderer; empty space keeps the glow legible.
const shape = (d, opacity = 1) => `<path d="${d}" fill="#fff" fill-rule="evenodd" opacity="${opacity}"/>`;
const stroke = (d, width = 4, opacity = 1) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
const disc = (x, y, r, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${opacity}"/>`;
const ring = (x, y, r, width = 4, opacity = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#fff" stroke-width="${width}" opacity="${opacity}"/>`;
const ellipse = (x, y, rx, ry, opacity = 1) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity="${opacity}"/>`;
const turn = (art, angle) => `<g transform="rotate(${angle} 32 32)">${art}</g>`;
const fit = (art, scale) => `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${art}</g>`;
// Repetition is confined to the deliberate symmetry of a single emblem.
const radial = (art, angles) => angles.map(angle => turn(art, angle)).join('');
const motif = (name, description, art) => ({ name, description, art });

export const palettes = {
  warrior:       { core: '#fff1d9', glow: '#f05a36', accent: '#ffd27a' },
  fighter:       { core: '#edf8ff', glow: '#76b9ec', accent: '#f1c36e' },
  paladin:       { core: '#fff9d8', glow: '#f5c84a', accent: '#9de9ff' },
  ranger:        { core: '#f0f9ce', glow: '#78b845', accent: '#e3b675' },
  rogue:         { core: '#f1ffd0', glow: '#b5e331', accent: '#b78cff' },
  cleric:        { core: '#fffdf0', glow: '#ffe48c', accent: '#ffc6ba' },
  bard:          { core: '#fff0f7', glow: '#ee77ae', accent: '#9be8e1' },
  mage:          { core: '#ebfdff', glow: '#6dd8f2', accent: '#a7b1ff' },
  necromancer:   { core: '#e5ffe8', glow: '#72cba4', accent: '#baa2da' },
  warlock:       { core: '#f4e4ff', glow: '#ad66ed', accent: '#e0649a' },
  demon_hunter:  { core: '#ffe4eb', glow: '#d83160', accent: '#81e6c0' },
  scavenger:     { core: '#fff0ce', glow: '#ce9648', accent: '#90cca5' },
  swashbuckler:  { core: '#e8ffff', glow: '#23bbd4', accent: '#ffab75' },
  dragon_knight: { core: '#fff3ce', glow: '#ee7028', accent: '#e7c953' },
  pyromancer:    { core: '#fff6df', glow: '#ff3e29', accent: '#ffbe3b' },
  stormcaller:   { core: '#f1f3ff', glow: '#8c9bff', accent: '#f5e77e' },
  druid:         { core: '#e7ffda', glow: '#3bbd6e', accent: '#ecc26b' },
  oracle:        { core: '#f9edff', glow: '#bb94ed', accent: '#edc570' },
  tactician:     { core: '#e7f2ff', glow: '#4c84d6', accent: '#ffb75f' },
  chronomancer:  { core: '#fff6dc', glow: '#d8ae63', accent: '#8bdfd5' },
  monk:          { core: '#e8fff8', glow: '#6ce3ca', accent: '#eba886' },
  shaman:        { core: '#e4fff1', glow: '#54b5ad', accent: '#dba173' },
  witch_hunter:  { core: '#f5f7ff', glow: '#b9c9e8', accent: '#d476a6' },
  knight:        { core: '#eef4fa', glow: '#7e99b0', accent: '#d3ae69' },
  sorcerer:      { core: '#ffe9ff', glow: '#e34fea', accent: '#7beced' },
  runesmith:     { core: '#fff0df', glow: '#e29561', accent: '#89bde4' },
  shadow_dancer: { core: '#edeaff', glow: '#7d71c5', accent: '#c996df' },
  tinker:        { core: '#fff9df', glow: '#d8c478', accent: '#75bfcb' },
  priest:       { core: '#fff7ff', glow: '#d2b6ef', accent: '#f6d581' },
  enchanter:     { core: '#fff0fe', glow: '#f1a2db', accent: '#a5eab9' },
  // play-test 11 (owner #53): the Star Blade — star steel (cold silver-blue) with the Starcaller's gold as its accent
  starblade:     { core: '#f6f8ff', glow: '#8fa6ff', accent: '#e6c14a' },
};

export default {
  'warrior.a': motif('Fury fist', 'A clenched gauntlet drives forward above a jagged steel cuff.',
    shape('M17 31 L10 23 Q7 18 12 16 Q15 15 18 20 V13 Q18 8 23 9 L24 22 V10 Q25 6 29 9 L30 22 V11 Q32 7 36 11 L36 23 V14 Q39 10 43 14 L45 32 L40 42 H22 Z', .45)
    + shape('M18 25 V13 Q18 8 23 9 L24 25 H27 L26 10 Q27 6 30 10 L31 25 H34 L33 12 Q35 8 38 12 L39 26 H42 L41 15 Q44 13 46 18 L47 32 L40 43 H23 L14 33 L10 24 Q8 20 12 19 L19 27 L29 28 L27 33 L21 33 L24 37 L33 37 L37 28 L34 25 Z M21 46 H42 L46 56 L33 52 L20 56 Z')),
  'warrior.b': motif('Riven shock', 'Three broken steel plates peel away from a deep stepped impact crack.',
    shape('M8 9 L29 15 L25 25 L35 31 L27 37 L12 29 Z M39 10 L57 21 L48 37 L36 43 L43 30 L33 24 Z')
    + shape('M11 37 L25 44 L34 39 L45 46 L32 57 L20 51 Z', .65)),
  'warrior.c': motif('War-cry seal', 'Two nested war-cry chevrons brace a broken circular steel crest.',
    stroke('M13 18 A24 24 0 0 0 13 46 M51 18 A24 24 0 0 1 51 46', 5, .65)
    + shape('M13 21 L32 30 L51 21 L47 32 L32 41 L17 32 Z M20 39 L32 46 L44 39 L40 49 L32 55 L24 49 Z M26 6 H38 L35 17 H29 Z')
    + disc(8, 32, 3) + disc(56, 32, 3)),

  'fighter.a': motif('Duel crossing', 'Two narrow duelling swords cross above their separate swept guards.',
    shape('M9 7 L21 15 L43 39 L38 44 L15 21 Z M55 7 L49 21 L26 44 L21 39 L43 15 Z')
    + stroke('M14 35 Q19 44 28 48 M36 48 Q45 44 50 35', 5)
    + stroke('M20 45 L12 53 M44 45 L52 53', 6)
    + disc(10, 55, 3) + disc(54, 55, 3)),
  'fighter.b': motif('Perfect contact', 'An eight-point steel flash has four broad blades and four shorter teeth.',
    shape('M32 6 L38 23 L49 15 L41 27 L58 32 L41 37 L49 49 L38 41 L32 58 L26 41 L15 49 L23 37 L6 32 L23 27 L15 15 L26 23 Z')
    + shape('M32 20 L44 32 L32 44 L20 32 Z', .5)),
  'fighter.c': motif('Victor laurel', 'Paired laurel branches encircle the diamond of a clean duel.',
    stroke('M29 56 C9 47 7 23 21 9 M35 56 C55 47 57 23 43 9', 3.5, .6)
    + shape('M20 13 Q6 11 10 26 Q19 23 20 13 Z M14 27 Q2 28 10 40 Q17 36 14 27 Z M17 41 Q7 46 20 53 Q25 46 17 41 Z M22 12 Q31 17 21 25 Q17 18 22 12 Z M18 29 Q28 31 22 41 Q16 36 18 29 Z M44 13 Q58 11 54 26 Q45 23 44 13 Z M50 27 Q62 28 54 40 Q47 36 50 27 Z M47 41 Q57 46 44 53 Q39 46 47 41 Z M42 12 Q33 17 43 25 Q47 18 42 12 Z M46 29 Q36 31 42 41 Q48 36 46 29 Z')
    + shape('M32 23 L37 32 L32 41 L27 32 Z')),

  'paladin.a': motif('Oathwing hammer', 'A square-headed holy hammer flies on two stepped feather wings.',
    shape('M25 22 L7 11 L8 27 L14 25 L15 34 L21 31 L25 38 Z M39 22 L57 11 L56 27 L50 25 L49 34 L43 31 L39 38 Z', .65)
    + shape('M19 14 H45 V29 H36 V55 H28 V29 H19 Z')
    + stroke('M22 10 H42', 4, .5)),
  'paladin.b': motif('Oathburst', 'A flared four-armed sun cross strikes between four detached rays.',
    shape('M25 12 H39 L36 25 L52 22 V40 L36 37 L39 52 H25 L28 37 L12 40 V22 L28 25 Z')
    + shape('M9 6 L18 10 L14 17 Z M55 6 L50 17 L46 10 Z M9 58 L14 47 L18 54 Z M55 58 L46 54 L50 47 Z', .65)),
  'paladin.c': motif('Solar oath', 'A hammer stands inside a sun-topped oath circle with paired seals.',
    fit(stroke('M19 11 A24 24 0 1 0 45 11', 4)
    + disc(32, 11, 6) + stroke('M32 3 V5 M21 5 L24 8 M43 5 L40 8', 3.5, .7)
    + shape('M20 25 H44 V35 H35 V49 H29 V35 H20 Z')
    + shape('M6 25 L12 31 L6 37 L2 31 Z M58 25 L62 31 L58 37 L52 31 Z', .6), .9)),

  'ranger.a': motif('Wild fletching', 'A broad arrowhead flies diagonally above two leaf-shaped fletches.',
    shape('M56 7 L47 35 L38 26 L29 17 Z')
    + stroke('M14 50 L41 23', 5)
    + shape('M27 33 Q10 27 8 39 Q15 46 27 33 Z M31 37 Q37 54 25 56 Q18 49 31 37 Z', .7)),
  'ranger.b': motif('Willow shard', 'A pointed willow leaf splits into two broad luminous vein planes.',
    shape('M55 7 C33 7 9 16 10 45 C24 31 38 19 55 7 Z')
    + shape('M55 7 C53 36 39 53 17 49 C29 36 42 22 55 7 Z', .5)
    + stroke('M9 56 L20 44', 4.5)),
  'ranger.c': motif('Antler compass', 'Branching antlers frame a north needle within a woodland compass.',
    stroke('M19 11 A24 24 0 1 0 45 11', 3.5, .65)
    + stroke('M28 39 L20 29 L19 16 M20 28 L12 23 L10 16 M19 22 L26 17 L26 10 M36 39 L44 29 L45 16 M44 28 L52 23 L54 16 M45 22 L38 17 L38 10', 4)
    + shape('M32 5 L37 17 L32 14 L27 17 Z M32 31 L37 44 L32 53 L27 44 Z')
    + stroke('M5 32 H10 M54 32 H59', 4)),

  'rogue.a': motif('Nightfang dagger', 'A broad throwing dagger has a hooked blade, split guard, and short grip.',
    shape('M56 7 L46 33 L33 41 L24 32 L37 18 Z M56 7 L36 30 L33 36 L43 29 Z')
    + shape('M56 7 L36 30 L33 36 L43 29 Z', .4)
    + stroke('M20 28 L20 38 L32 46 L38 44', 5)
    + shape('M21 40 L28 46 L16 57 L8 50 Z')),
  'rogue.b': motif('Venom bead', 'A heavy poison tear trails two detached beads of venom.',
    shape('M33 7 C32 21 18 28 18 41 C18 59 47 59 47 41 C47 29 37 22 33 7 Z')
    + disc(11, 27, 4, .55) + disc(51, 18, 3.5, .7)),
  'rogue.c': motif('Smokewheel', 'Three hooked banks of smoke turn around an open shadow centre.',
    radial(shape('M32 6 C51 4 61 23 54 38 C55 22 43 15 33 18 C23 21 22 29 26 33 C17 30 15 21 21 14 C24 10 27 8 32 6 Z'), [0, 120, 240])
    + radial(disc(33, 11, 4, .4), [0, 120, 240])),

  'cleric.a': motif('Healing sun', 'A generous sun disc is surrounded by eight broad separated rays.',
    disc(32, 32, 14)
    + radial(shape('M29 6 H35 L36 14 H28 Z', .8), [0, 45, 90, 135, 180, 225, 270, 315])),
  'cleric.b': motif('Mercy spark', 'A small radiant healing cross throws four soft diagonal sparks.',
    shape('M26 14 H38 V26 H50 V38 H38 V50 H26 V38 H14 V26 H26 Z')
    + stroke('M9 9 L15 15 M49 49 L55 55 M49 15 L55 9 M9 55 L15 49', 5, .6)),
  'cleric.c': motif('Dawn halo', 'An unbroken open halo shines with twelve evenly spaced rays.',
    ring(32, 32, 18, 5)
    + radial(stroke('M32 5 V10', 4, .75), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330])),

  'bard.a': motif('Flying melody', 'Two bold oval notes hang from a slanting connected beam.',
    shape('M24 15 L52 7 V42 H46 V21 L30 26 V49 H24 Z')
    + ellipse(19, 49, 11, 8) + ellipse(41, 42, 11, 8)),
  'bard.b': motif('Trill spark', 'A single quaver flicks its flag outward above a rounded note head.',
    shape('M30 7 H36 C37 18 53 16 52 29 C49 35 43 35 40 33 C47 29 40 25 36 25 V46 H30 Z')
    + ellipse(24, 47, 13, 9) + shape('M9 15 L13 21 L9 27 L5 21 Z', .55)),
  'bard.c': motif('Lyric orbit', 'A three-string lyre curves inside a circular performance sigil.',
    ring(32, 32, 25, 3.5, .55)
    + stroke('M18 18 C26 17 19 31 22 39 Q32 52 42 39 C45 31 38 17 46 18 M20 23 H44 M24 46 H40', 4.5)
    + stroke('M27 24 V38 M32 24 V42 M37 24 V38', 3)
    + disc(18, 17, 3) + disc(46, 17, 3)),

  'mage.a': motif('Sixfold frost', 'Six thick crystal arms each end in two angular ice branches.',
    radial(stroke('M32 32 V7 M23 13 L32 21 L41 13', 4.5), [0, 60, 120, 180, 240, 300])
    + shape('M32 24 L39 28 V36 L32 40 L25 36 V28 Z', .6)),
  'mage.b': motif('Rime splinter', 'A long ice splinter breaks into three wide crystalline facets.',
    shape('M37 5 L51 23 L43 45 L24 58 L13 40 L21 16 Z', .4)
    + shape('M37 5 L32 29 L24 58 L13 40 L21 16 Z')
    + shape('M37 5 L51 23 L36 31 Z', .65)),
  'mage.c': motif('Frost hexagon', 'A six-sided frost boundary joins an inward-pointing crystal on every corner.',
    stroke('M32 7 L54 19 V45 L32 57 L10 45 V19 Z', 4, .6)
    + radial(shape('M32 5 L38 17 L32 25 L26 17 Z'), [0, 60, 120, 180, 240, 300])
    + shape('M32 27 L37 30 V35 L32 38 L27 35 V30 Z', .6)),

  'necromancer.a': motif('Grave skull', 'A broad skull has sunken eye sockets, a nasal notch, and three separated teeth.',
    shape('M12 31 C5 0 59 0 52 31 L49 40 H44 V51 H38 V45 H35 V54 H29 V45 H26 V51 H20 V40 H15 Z M18 25 Q25 21 29 28 L27 34 H19 Z M46 25 Q39 21 35 28 L37 34 H45 Z M32 34 L27 41 H37 Z')
    + shape('M18 25 Q25 21 29 28 L27 34 H19 Z M46 25 Q39 21 35 28 L37 34 H45 Z M32 34 L27 41 H37 Z', .35)),
  'necromancer.b': motif('Marrow fracture', 'A long broken bone retains two knuckles at its heavy end.',
    shape('M16 8 C9 3 4 12 11 17 C4 23 12 30 18 23 L39 46 L48 55 L45 41 L40 37 L36 38 L33 30 L23 18 C29 11 21 4 16 8 Z')
    + shape('M47 15 L56 23 L48 30 L44 25 Z', .55)),
  'necromancer.c': motif('Ossuary wheel', 'Four small skulls alternate with four curved bones around a grave circle.',
    ring(32, 32, 19, 3.5, .4)
    + radial(shape('M24 16 V11 C24 3 40 3 40 11 V16 H37 V21 H27 V16 Z M28 10 V14 H31 V10 Z M33 10 V14 H36 V10 Z'), [0, 90, 180, 270])
    + radial(stroke('M13 18 L18 13', 5) + disc(11, 17, 3) + disc(17, 11, 3), [0, 90, 180, 270])
    + shape('M32 26 L37 32 L32 38 L27 32 Z', .6)),

  'warlock.a': motif('Horned witness', 'An unblinking slit eye spreads beneath two great inward-curved horns.',
    shape('M12 26 C4 22 4 10 9 5 C9 15 15 16 21 18 L26 26 Z M52 26 C60 22 60 10 55 5 C55 15 49 16 43 18 L38 26 Z', .7)
    + shape('M5 34 Q32 9 59 34 Q32 59 5 34 Z M13 34 Q32 19 51 34 Q32 49 13 34 Z')
    + ellipse(32, 34, 8, 12, .45) + shape('M32 23 L36 34 L32 45 L28 34 Z')),
  'warlock.b': motif('Void tear', 'A thick crescent ends in a hooked falling tear and a detached void chip.',
    shape('M45 6 C23 2 5 20 12 38 C17 51 34 57 48 47 C27 49 19 33 27 20 C31 13 36 10 45 6 Z')
    + shape('M49 28 Q58 42 50 52 Q43 46 49 28 Z', .6)),
  'warlock.c': motif('Chainbound pact', 'Four linked shackles bind a circular void pact around a hollow centre.',
    fit(ring(32, 32, 23, 4, .6) + ring(32, 32, 10, 4)
    + radial(stroke('M27 8 Q27 3 32 3 Q37 3 37 8 V18 Q37 23 32 23 Q27 23 27 18 Z', 4), [0, 90, 180, 270])
    + radial(shape('M16 13 L21 17 L17 22 L12 18 Z'), [0, 90, 180, 270]), .88)),

  'demon_hunter.a': motif('Fiendhook', 'A barbed hunting bolt curves into a deep hook below its spear point.',
    shape('M37 5 L53 24 L41 22 V38 C41 62 9 62 9 40 V31 L23 39 L16 41 C18 53 34 49 34 38 V22 L23 26 Z')
    + shape('M28 29 L19 22 L29 21 Z', .55)),
  'demon_hunter.b': motif('Broken shackle', 'A heavy slanted chain link is split at one corner by the impact.',
    stroke('M26 48 L19 55 Q12 60 7 52 Q4 47 10 41 L35 16 Q42 9 49 16 Q55 22 48 29 L35 42', 7)
    + shape('M35 6 L41 3 L45 10 L39 12 Z M47 42 L55 46 L51 54 L44 48 Z', .55)),
  'demon_hunter.c': motif('Hound ward', 'A long-muzzled hunting hound guards a ring closed with two chain locks.',
    ring(32, 32, 25, 3.5, .55)
    + shape('M23 20 Q32 15 41 20 L49 25 L47 43 L41 40 L40 31 L38 47 L32 53 L26 47 L24 31 L23 40 L17 43 L15 25 Z M23 25 L29 28 L25 31 Z M41 25 L35 28 L39 31 Z M27 42 H37 L32 48 Z')
    + shape('M23 25 L29 28 L25 31 Z M41 25 L35 28 L39 31 Z', .35)
    + stroke('M27 7 V14 H37 V7 M6 28 H12 V36 H6 M58 28 H52 V36 H58', 3.5)),

  'scavenger.a': motif('Lucky scrap', 'An uneven salvaged gear spins behind a long bent nail.',
    shape('M21 10 H30 L32 16 L39 13 L46 20 L42 26 L48 31 L45 40 L37 39 L34 47 H24 L22 40 L14 42 L8 34 L13 28 L9 21 L17 17 Z M24 22 A9 9 0 1 0 32 38 A9 9 0 1 0 24 22 Z', .6)
    + shape('M40 8 L56 24 L51 29 L46 24 L30 41 L19 55 L24 39 L41 19 L36 14 Z')),
  'scavenger.b': motif('Found coin', 'A thick coin rim surrounds a diamond mint punch and two worn glints.',
    shape('M9 32 A23 23 0 1 0 55 32 A23 23 0 1 0 9 32 Z M32 22 L42 32 L32 42 L22 32 Z', .55)
    + ring(32, 32, 23, 5)
    + stroke('M15 23 L18 18 M46 41 L49 35', 4)),
  'scavenger.c': motif('Luckshoe', 'An open horseshoe holds four dim nail holes and a central luck diamond.',
    shape('M9 12 H22 V33 C22 51 42 51 42 33 V12 H55 V34 C55 65 9 65 9 34 Z M13 19 H18 V26 H13 Z M46 19 H51 V26 H46 Z M15 36 L20 35 L22 41 L17 44 Z M49 36 L44 35 L42 41 L47 44 Z')
    + shape('M13 19 H18 V26 H13 Z M46 19 H51 V26 H46 Z M15 36 L20 35 L22 41 L17 44 Z M49 36 L44 35 L42 41 L47 44 Z', .35)
    + shape('M32 8 L38 19 L32 30 L26 19 Z', .7)),

  'swashbuckler.a': motif('Flourished rapier', 'A needle rapier pierces diagonally above a curling swept basket hilt.',
    shape('M57 6 L35 37 L30 32 Z')
    + stroke('M15 30 Q18 43 35 46 C48 47 48 34 39 34 Q34 34 35 39', 4.5)
    + stroke('M31 37 L17 51', 5)
    + shape('M11 48 L20 57 L13 59 L6 52 Z')
    + stroke('M18 37 C6 34 5 23 12 20', 3.5, .55)),
  'swashbuckler.b': motif('Blade glint', 'A tall slender diamond glint sheds a pair of offset triangular flashes.',
    shape('M34 5 L39 27 L53 32 L39 37 L34 59 L29 37 L15 32 L29 27 Z')
    + shape('M10 9 L18 15 L10 21 L5 15 Z M52 45 L59 50 L52 55 L48 50 Z', .6)),
  'swashbuckler.c': motif('Corsair compass', 'Four long compass needles and four short bearings sit on a nautical ring.',
    ring(32, 32, 19, 3.5, .55)
    + radial(shape('M32 4 L38 25 L32 32 L26 25 Z'), [0, 90, 180, 270])
    + radial(shape('M16 16 L27 22 L23 27 Z', .6), [0, 90, 180, 270])
    + ring(32, 32, 5, 3)),

  'dragon_knight.a': motif('Wyrmfire head', 'A dragon profile bares a square snout above a long burning lower jaw.',
    shape('M17 10 L30 17 L42 5 L42 19 L56 28 L53 36 L40 36 L47 45 L55 45 L47 55 L26 53 L13 43 L9 30 L17 34 L13 21 L25 27 Z M35 23 L43 27 L36 30 Z M39 32 H54 V36 H39 Z')
    + shape('M35 23 L43 27 L36 30 Z', .35)
    + shape('M9 49 C3 37 10 18 5 11 C17 20 11 33 20 39 Z', .5)),
  'dragon_knight.b': motif('Wyrmscale', 'A broad pointed dragon scale carries a dim inner chevron facet.',
    shape('M32 6 L54 19 L49 40 L32 58 L15 40 L10 19 Z M18 22 L32 32 L46 22 L42 38 L32 49 L22 38 Z')
    + shape('M18 22 L32 32 L46 22 L42 38 L32 49 L22 38 Z', .4)),
  'dragon_knight.c': motif('Coiled wyrm', 'A dragon coils around an empty centre with a horned head biting its tapering tail.',
    shape('M42 8 C21 0 4 15 6 35 C8 54 26 62 43 55 C52 51 57 43 57 34 L49 37 C47 49 32 55 21 46 C9 35 16 16 30 16 L38 18 Z M16 17 L10 10 L23 11 Z M8 32 L3 27 L9 25 Z M19 52 L15 60 L27 56 Z')
    + shape('M34 9 L44 5 L43 14 L55 13 L59 23 L51 32 L40 28 L44 22 L33 18 Z M48 18 L54 21 L48 24 Z')
    + shape('M48 18 L54 21 L48 24 Z', .35)
    + shape('M41 51 Q53 45 52 34 L43 40 L43 32 Q37 40 41 51 Z', .55)),

  'pyromancer.a': motif('Curling fireball', 'A round fireball pours into a tall curled flame tail and a separate outer lick.',
    shape('M38 5 C23 15 49 19 50 35 C53 48 43 57 30 57 C15 57 6 46 10 33 C12 25 20 22 21 14 C27 21 24 26 23 29 C29 28 32 24 28 17 C25 9 31 5 38 5 Z')
    + shape('M47 12 C59 18 61 32 55 39 C57 27 46 25 47 12 Z', .55)
    + shape('M13 13 Q17 8 20 6 Q21 15 15 20 Z', .4)),
  'pyromancer.b': motif('Leaping ember', 'A jagged hot cinder tumbles below a short curling lick of fire.',
    shape('M25 25 L42 21 L49 35 L41 51 L25 57 L16 44 L14 32 Z')
    + shape('M27 23 C15 13 30 6 34 5 C27 15 40 10 40 19 Z', .6)
    + shape('M53 12 L59 20 L53 27 L50 20 Z M7 44 L12 50 L8 56 L4 49 Z', .55)),
  'pyromancer.c': motif('Crown of flame', 'Three upright flame tongues crown the upper half of a circular fire seal.',
    stroke('M10 30 A23 23 0 1 0 54 30', 4, .65)
    + shape('M17 36 C7 28 16 22 12 12 C25 18 18 27 24 29 C28 22 23 17 32 5 C31 19 43 20 40 29 C46 27 39 18 52 12 C48 22 57 28 47 36 L44 40 H20 Z')
    + stroke('M23 45 H41', 4)),

  'stormcaller.a': motif('Forked thunder', 'A heavy lightning bolt forks sharply toward a second jagged leader.',
    shape('M30 5 H45 L34 24 H48 L21 59 L27 37 H13 L26 17 H19 Z M38 31 L55 21 L50 34 L58 33 L42 49 L46 37 L35 42 Z')),
  'stormcaller.b': motif('Crackle fork', 'Three short lightning leaders snap away from a tight angular junction.',
    shape('M31 26 L25 7 L36 18 L35 29 L48 21 L45 12 L57 18 L51 31 L38 35 L47 53 L35 45 L30 36 L18 43 L11 57 L14 36 L25 31 L6 25 L17 20 Z')
    + shape('M11 8 L18 10 L17 16 L10 14 Z', .55)),
  'stormcaller.c': motif('Storm eye', 'Three sweeping wind bands orbit a calm pointed eye.',
    radial(shape('M28 6 C47 2 60 15 58 32 C53 18 42 14 29 18 L35 23 L17 21 L21 7 Z'), [0, 120, 240])
    + shape('M20 32 Q32 21 44 32 Q32 43 20 32 Z M27 32 A5 5 0 1 0 37 32 A5 5 0 1 0 27 32 Z')),

  'druid.a': motif('Briar curl', 'A thick living vine winds into a spiral with three projecting thorns and a new leaf.',
    stroke('M12 54 C12 41 49 52 50 31 C51 12 22 8 18 27 C15 41 36 42 37 29', 6)
    + shape('M14 45 L5 39 L15 37 Z M48 35 L58 30 L52 44 Z M29 14 L26 5 L38 14 Z')
    + shape('M36 28 C30 17 42 10 51 8 C49 20 45 27 36 28 Z', .65)),
  'druid.b': motif('Heartleaf', 'A broad heart-shaped leaf has two rounded shoulders and a bright central stem.',
    shape('M32 51 C4 46 4 14 13 7 Q27 8 32 19 Q37 8 51 7 C60 14 60 46 32 51 Z', .45)
    + shape('M32 51 C4 46 4 14 13 7 Q27 8 32 19 Z')
    + stroke('M32 22 V57 M32 38 L43 27', 4)),
  'druid.c': motif('Briar wreath', 'Four broad leaves and four outward thorns grow around a circular vine.',
    ring(32, 32, 21, 4, .6)
    + radial(shape('M29 7 C42 3 49 12 49 23 C36 24 28 20 29 7 Z M33 11 L43 20 L39 13 Z'), [0, 90, 180, 270])
    + radial(shape('M12 14 L6 7 L9 24 Z'), [0, 90, 180, 270])),

  'oracle.a': motif('Farseeing eye', 'A wide eye with a round iris shines beneath three separated prophetic rays.',
    shape('M5 33 Q32 7 59 33 Q32 58 5 33 Z M13 33 Q32 17 51 33 Q32 49 13 33 Z')
    + ring(32, 33, 8, 4) + disc(32, 33, 3, .6)
    + shape('M29 5 H35 L34 14 H30 Z M13 9 L20 14 L17 19 L10 14 Z M51 9 L54 14 L47 19 L44 14 Z', .65)
    + shape('M32 51 L36 57 L32 61 L28 57 Z', .6)),
  'oracle.b': motif('Knotted fate', 'A compact interlaced thread knot cinches two open loops between loose ends.',
    stroke('M8 53 L23 38 M41 26 L56 11', 5.5, .55)
    + stroke('M28 24 C21 7 7 14 12 27 C14 33 25 36 35 31', 6)
    + stroke('M36 40 C43 57 57 50 52 37 C50 31 39 28 29 33', 6)
    + shape('M26 21 L42 31 L38 39 L22 29 Z')
    + stroke('M25 36 L33 41 M31 23 L39 28', 5, .65)),
  'oracle.c': motif('Chart of omens', 'A central seeing eye lies inside an eight-node circular star chart.',
    ring(32, 32, 24, 3.5, .5)
    + stroke('M15 15 L32 9 L49 15 L55 32 L49 49 L32 55 L15 49 L9 32 Z', 3, .45)
    + radial(disc(32, 8, 3.5), [0, 45, 90, 135, 180, 225, 270, 315])
    + shape('M16 32 Q32 15 48 32 Q32 49 16 32 Z M23 32 Q32 22 41 32 Q32 42 23 32 Z')
    + disc(32, 32, 4.5)),

  'tactician.a': motif('Rally pennant', 'A squared battle pennant carries a bold chevron above a notched hem.',
    stroke('M12 7 V57', 5)
    + shape('M16 11 H54 V49 L35 41 L16 49 Z', .4)
    + shape('M18 17 H50 V24 L34 33 L18 24 Z M18 34 L34 41 L50 34 V42 L34 49 L18 42 Z')
    + shape('M7 6 L12 2 L17 6 L12 11 Z')),
  'tactician.b': motif('Advance marker', 'A solid command arrow advances ahead of a detached marching chevron.',
    shape('M32 6 L56 31 H43 V46 H21 V31 H8 Z')
    + shape('M19 46 L32 52 L45 46 V53 L32 60 L19 53 Z', .6)),
  'tactician.c': motif('Command board', 'A four-square command board sits inside a ring with four outward orders.',
    ring(32, 32, 23, 3.5, .6)
    + shape('M21 21 H43 V43 H21 Z', .4)
    + shape('M21 21 H30 V30 H21 Z M34 34 H43 V43 H34 Z')
    + radial(shape('M32 3 L38 14 H26 Z'), [0, 90, 180, 270])
    + radial(disc(16, 16, 3), [0, 90, 180, 270])),

  'chronomancer.a': motif('Falling instant', 'An hourglass pinches between broad end bars with sand gathering below.',
    shape('M15 6 H49 V12 H15 Z M15 52 H49 V58 H15 Z')
    + stroke('M20 14 C20 24 27 25 31 32 C27 39 20 40 20 50 M44 14 C44 24 37 25 33 32 C37 39 44 40 44 50', 4.5)
    + shape('M23 17 H41 L32 27 Z M32 38 L23 49 H41 Z', .65)
    + stroke('M32 29 V35', 3.5)),
  'chronomancer.b': motif('Broken second', 'Two heavy clock hands shear away together around their round pivot.',
    fit(shape('M29 6 H35 L38 30 L55 43 L49 50 L30 37 Z')
    + ring(31, 33, 8, 4) + disc(31, 33, 4, .45)
    + shape('M11 37 L19 36 L22 42 L14 47 Z M13 17 L21 20 L20 26 L10 23 Z', .55), 1.1)),
  'chronomancer.c': motif('Dial of hours', 'Twelve bold ticks mark a clock face with two unequal hands.',
    ring(32, 32, 25, 3.5, .6)
    + radial(stroke('M32 10 V15', 3.5), [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330])
    + stroke('M32 20 V32 L43 39', 4.5) + disc(32, 32, 3.5)),

  'monk.a': motif('Quiet palm', 'An open hand spreads its thumb and four distinct rounded fingers.',
    shape('M20 35 L13 29 C7 24 4 30 8 35 L17 47 L22 56 H42 L49 41 L52 21 C53 16 47 14 46 20 L43 32 L44 12 C44 6 38 6 38 12 L37 29 V8 C37 3 31 3 31 8 V29 L29 12 C29 7 23 8 23 13 L24 32 L22 20 C21 15 16 17 17 22 Z M23 37 Q32 32 41 37 L39 41 Q32 37 25 41 Z')
    + shape('M23 37 Q32 32 41 37 L39 41 Q32 37 25 41 Z', .4)),
  'monk.b': motif('Stillwater pulse', 'A single centred force droplet lands above two broad water ripples.',
    shape('M32 5 C29 14 21 20 21 28 C21 42 43 42 43 28 C43 20 35 14 32 5 Z')
    + stroke('M16 39 Q32 49 48 39', 4.5, .7)
    + stroke('M8 47 Q32 63 56 47', 4.5, .5)),
  'monk.c': motif('Three balanced waves', 'Three separate horizontal waves flow within an undivided circular boundary.',
    ring(32, 32, 25, 4)
    + stroke('M17 23 Q24 17 32 23 Q40 29 47 23 M16 32 Q24 26 32 32 Q40 38 48 32 M17 41 Q24 35 32 41 Q40 47 47 41', 3.5, .75)),

  'shaman.a': motif('Nightbird spirit', 'A wide owl spirit mask has swept ear tufts, large eye hollows, and a long beak.',
    shape('M7 7 L24 15 H40 L57 7 L52 35 L43 48 L32 58 L21 48 L12 35 Z M17 22 Q27 16 29 28 L25 35 L18 31 Z M47 22 Q37 16 35 28 L39 35 L46 31 Z M25 39 L32 52 L39 39 L32 43 Z')
    + shape('M17 22 Q27 16 29 28 L25 35 L18 31 Z M47 22 Q37 16 35 28 L39 35 L46 31 Z', .35)
    + shape('M32 25 L37 35 L32 43 L27 35 Z', .5)),
  'shaman.b': motif('Spirit feather', 'A slanting barred feather has a pointed tip, cut barbs, and a long quill.',
    shape('M53 6 C34 3 15 17 15 36 L24 29 L19 41 L25 43 L38 29 L34 41 C45 37 55 24 53 6 Z', .55)
    + shape('M53 6 C34 3 15 17 15 36 L24 29 L19 41 Z')
    + stroke('M10 57 L46 15', 4.5)),
  'shaman.c': motif('Four spirit totems', 'Four inward-facing animal masks guard an open ring of spirits.',
    ring(32, 32, 23, 3.5, .5)
    + radial(shape('M22 5 L27 10 H37 L42 5 L40 19 L32 26 L24 19 Z M26 14 L30 16 L27 19 Z M38 14 L34 16 L37 19 Z'), [0, 90, 180, 270])
    + radial(disc(14, 14, 3), [0, 90, 180, 270])),

  'witch_hunter.a': motif('Silver verdict', 'A long silver stake has a faceted spear point and two broad binding collars.',
    shape('M32 5 L43 25 L37 46 H27 L21 25 Z M32 5 L32 41 L37 25 Z')
    + shape('M32 5 L32 41 L37 25 Z', .4)
    + shape('M21 43 H43 V49 H21 Z M25 53 H39 V59 H25 Z')
    + shape('M10 23 L17 18 L16 30 Z M54 23 L47 18 L48 30 Z', .55)),
  'witch_hunter.b': motif('Severing keys', 'Two stout ward keys cross, with round bows and opposing square teeth.',
    ring(17, 17, 9, 5) + ring(47, 17, 9, 5)
    + stroke('M23 23 L50 50 M41 23 L14 50', 5)
    + shape('M39 45 L45 39 L50 44 L44 50 Z M46 52 L52 46 L57 51 L51 57 Z M25 45 L19 39 L14 44 L20 50 Z M18 52 L12 46 L7 51 L13 57 Z')),
  'witch_hunter.c': motif('Four-seal ward', 'Four diamond seals pin a circular ward around an open lozenge.',
    ring(32, 32, 23, 4, .6)
    + radial(shape('M32 3 L41 11 L32 20 L23 11 Z M32 8 L28 11 L32 15 L36 11 Z'), [0, 90, 180, 270])
    + stroke('M32 23 L41 32 L32 41 L23 32 Z', 4)
    + radial(stroke('M14 14 L18 18', 4, .7), [0, 90, 180, 270])),

  'knight.a': motif('Kite bulwark', 'A high-shouldered kite shield tapers to a long point below its divided face.',
    shape('M10 10 Q32 17 54 10 L50 35 Q46 47 32 59 Q18 47 14 35 Z M16 18 L20 34 Q23 43 32 51 Q41 43 44 34 L48 18 Q32 22 16 18 Z')
    + shape('M16 18 L20 34 Q23 43 32 51 V21 Q23 21 16 18 Z', .45)
    + shape('M32 21 V51 Q41 43 44 34 L48 18 Q40 20 32 21 Z', .75)),
  'knight.b': motif('Shield spall', 'An angular shield fragment keeps its thick rim and one broken inner facet.',
    shape('M10 10 L53 19 L49 34 L39 31 L42 43 L28 57 L16 36 Z M19 20 L23 34 L29 45 L34 37 L30 26 L44 28 L45 24 Z')
    + shape('M19 20 L23 34 L29 45 L34 37 L30 26 L44 28 L45 24 Z', .4)),
  'knight.c': motif('Crowned bastion', 'A three-point crown and paired heraldic boughs stand within a ring.',
    ring(32, 32, 25, 4, .65)
    + shape('M17 22 L25 28 L32 16 L39 28 L47 22 L43 39 H21 Z M22 43 H42 V48 H22 Z')
    + disc(17, 20, 3) + disc(32, 14, 3) + disc(47, 20, 3)
    + shape('M10 35 L16 39 L19 49 L13 44 Z M54 35 L48 39 L45 49 L51 44 Z', .6)),

  'sorcerer.a': motif('Untamed nexus', 'A hollow arcane orb erupts into five unequal jagged energy blades.',
    shape('M28 17 L38 5 L38 19 L45 22 L57 18 L50 31 L58 43 L43 41 L38 46 L34 59 L26 46 L14 51 L17 38 L5 30 L19 25 L13 12 Z M23 32 A9 9 0 1 0 41 32 A9 9 0 1 0 23 32 Z')
    + disc(32, 32, 6, .5)),
  'sorcerer.b': motif('Wild fracture', 'A crooked arcane shard splits around a deep diagonal fault.',
    shape('M31 5 L39 23 L57 20 L44 37 L51 54 L30 43 L10 56 L19 32 L6 20 L25 22 Z M16 44 L29 28 L44 27 L32 35 Z')
    + shape('M16 44 L29 28 L44 27 L32 35 Z', .35)
    + shape('M49 7 L57 10 L53 17 Z M8 39 L14 38 L10 46 Z', .6)),
  'sorcerer.c': motif('Unstable sixfold', 'Six bent spokes interrupt a broken circular rune around a hollow core.',
    radial(stroke('M43 10 A25 25 0 0 1 53 20', 3.5, .5), [0, 60, 120, 180, 240, 300])
    + radial(shape('M30 7 L38 11 L34 22 L38 28 L33 30 L27 23 L31 15 L25 13 Z'), [0, 60, 120, 180, 240, 300])
    + ring(32, 32, 7, 3.5)),

  'runesmith.a': motif('Forge rune-stone', 'A bevelled standing stone holds a carved diamond and two deep chisel marks.',
    shape('M20 6 L43 9 L51 22 L48 51 L34 58 L14 52 L11 23 Z', .4)
    + shape('M20 6 L43 9 L51 22 L48 51 L34 58 L14 52 L11 23 Z M22 12 L17 24 L20 47 L34 52 L42 47 L45 24 L39 15 Z')
    + stroke('M32 17 L39 27 L32 37 L25 27 Z M24 42 L29 46 M35 46 L40 42', 4.5)),
  'runesmith.b': motif('Anvil flash', 'A compact horned anvil throws one broad spark above its working face.',
    shape('M7 25 H53 V34 H42 L39 43 L48 49 V55 H17 V49 L26 43 L23 36 L13 34 Z')
    + shape('M31 5 L35 13 L43 16 L35 20 L31 23 L27 19 L20 16 L28 13 Z', .75)),
  'runesmith.c': motif('Carved covenant', 'Six different chisel-cut geometric marks surround an empty forge ring.',
    ring(32, 32, 25, 3.5, .45) + ring(32, 32, 12, 3.5, .65)
    + stroke('M26 9 L32 14 L38 9 M28 19 H36', 3.5)
    + turn(stroke('M26 10 H38 L32 18 Z', 3.5), 60)
    + turn(stroke('M26 8 L32 12 L38 8 M26 15 L32 19 L38 15', 3.5), 120)
    + turn(stroke('M32 6 L38 13 L32 20 L26 13 Z', 3.5), 180)
    + turn(stroke('M26 8 L31 13 L26 18 M37 8 L32 13 L37 18', 3.5), 240)
    + turn(shape('M26 8 L32 11 L26 14 Z M38 12 L32 15 L38 18 Z'), 300)),

  'shadow_dancer.a': motif('Dancing crescent', 'A sweeping hooked moon blade curves between a heavy heel and a needle tip.',
    shape('M54 7 C44 25 46 39 31 48 L15 51 L9 58 L6 40 L13 44 C36 44 33 17 54 7 Z')
    + shape('M54 7 C39 18 42 34 30 43 C44 34 52 30 54 7 Z', .45)
    + shape('M17 9 L23 14 L16 23 L10 25 Z', .5)),
  'shadow_dancer.b': motif('Night petal', 'A single broad shadow petal folds inward beneath its curling pointed tip.',
    shape('M49 6 C49 25 18 17 13 38 C9 51 21 58 32 53 C44 48 53 29 49 6 Z M44 20 C30 27 24 41 21 50 C35 44 36 30 44 20 Z')
    + shape('M44 20 C30 27 24 41 21 50 C35 44 36 30 44 20 Z', .4)),
  'shadow_dancer.c': motif('Moonstep orbit', 'Two opposing crescent moons sweep around a small diamond of shadow.',
    shape('M28 6 C8 8 0 31 12 46 C17 53 24 57 32 56 C18 48 16 36 20 25 C23 17 27 12 28 6 Z')
    + turn(shape('M28 6 C8 8 0 31 12 46 C17 53 24 57 32 56 C18 48 16 36 20 25 C23 17 27 12 28 6 Z'), 180)
    + shape('M32 23 L37 32 L32 41 L27 32 Z', .55)
    + disc(32, 6, 2.5, .5) + disc(32, 58, 2.5, .5)),

  'tinker.a': motif('Escapement cog', 'An eight-tooth clockwork cog has a wide round axle opening.',
    shape('M26 5 H38 L39 13 L45 16 L52 12 L59 23 L52 28 V36 L59 41 L52 52 L45 48 L39 51 L38 59 H26 L25 51 L19 48 L12 52 L5 41 L12 36 V28 L5 23 L12 12 L19 16 L25 13 Z M19 32 A13 13 0 1 0 45 32 A13 13 0 1 0 19 32 Z')
    + ring(32, 32, 10, 3.5, .45)),
  'tinker.b': motif('Coil fragment', 'A short broad spring zigzags between two detached metal end caps.',
    stroke('M18 15 L43 22 L18 29 L43 36 L18 43 L43 50', 6)
    + shape('M13 6 H31 V12 H13 Z M33 54 H51 V60 H33 Z', .65)),
  'tinker.c': motif('Gear train', 'Three meshing pinions form a round clockwork train around an open centre.',
    ring(32, 32, 19, 4, .45)
    + radial(shape('M28 3 H36 L37 8 L42 10 V18 L37 20 L36 25 H28 L27 20 L22 18 V10 L27 8 Z M28 14 A4 4 0 1 0 36 14 A4 4 0 1 0 28 14 Z'), [0, 120, 240])
    + radial(shape('M28 52 H36 L32 59 Z', .7), [0, 120, 240])),

  'priest.a': motif('Twin faith', 'A broad shadow moon embraces a smaller bright sun with three outward rays.',
    shape('M31 6 C7 4 0 30 12 47 C19 57 32 60 43 53 C19 51 14 27 31 6 Z', .5)
    + disc(39, 30, 12)
    + stroke('M39 9 V13 M54 17 L50 20 M57 31 H59 M53 43 L50 40', 4)
    + shape('M31 6 C7 4 0 30 12 47 C14 50 17 52 20 53 C5 36 15 16 31 6 Z')),
  'priest.b': motif('Twilight plume', 'An upright devotional feather is divided into bright and shadow vanes.',
    shape('M32 5 C8 16 7 39 29 48 L29 27 L21 22 L29 23 Z')
    + shape('M32 5 C56 16 57 39 35 48 L35 34 L44 27 L35 29 Z', .45)
    + stroke('M32 12 V58', 4)),
  'priest.c': motif('Divided halo', 'A full halo joins a bright solar half to a dim lunar half without splitting its centre.',
    stroke('M32 8 A24 24 0 0 0 32 56', 6)
    + stroke('M32 8 A24 24 0 0 1 32 56', 6, .4)
    + stroke('M9 19 L5 17 M7 32 H3 M9 45 L5 47', 4)
    + shape('M45 20 C38 25 38 39 45 44 C28 42 28 22 45 20 Z', .6)
    + shape('M22 23 L25 29 L29 32 L25 35 L22 41 L19 35 L15 32 L19 29 Z')
    + disc(32, 8, 4) + disc(32, 56, 4)),

  'enchanter.a': motif('Dream moth', 'A moth spreads tall scalloped forewings above smaller teardrop hindwings.',
    shape('M28 29 C21 8 5 5 7 21 C7 33 16 35 25 35 C6 37 12 53 23 50 L29 40 Z M36 29 C43 8 59 5 57 21 C57 33 48 35 39 35 C58 37 52 53 41 50 L35 40 Z M15 19 Q22 20 25 29 Q15 30 15 19 Z M49 19 Q42 20 39 29 Q49 30 49 19 Z')
    + shape('M15 19 Q22 20 25 29 Q15 30 15 19 Z M49 19 Q42 20 39 29 Q49 30 49 19 Z', .4)
    + shape('M32 22 C24 27 28 42 32 56 C36 42 40 27 32 22 Z', .65)
    + stroke('M30 23 L25 9 M34 23 L39 9', 3.5)),
  'enchanter.b': motif('Wish sparkle', 'A rounded four-point sparkle floats beside two tiny satellite diamonds.',
    shape('M30 7 Q33 27 50 31 Q34 35 30 56 Q26 35 9 31 Q26 27 30 7 Z')
    + shape('M50 7 Q51 13 58 16 Q51 18 50 25 Q48 18 42 16 Q48 13 50 7 Z M12 45 L17 51 L12 57 L7 51 Z', .65)),
  'enchanter.c': motif('Reverie filigree', 'Four curled arabesques make a lacy round sigil with a tiny diamond centre.',
    radial(stroke('M18 13 C26 3 42 6 43 16 C44 23 33 25 32 18 Q32 14 36 14 M18 13 Q10 21 16 28', 4), [0, 90, 180, 270])
    + radial(shape('M32 4 L36 8 L32 12 L28 8 Z', .6), [0, 90, 180, 270])
    + shape('M32 24 L38 32 L32 40 L26 32 Z', .65)),

  // play-test 11 (owner #53): the Star Blade, the Starcaller's melee partner — hand-drawn in the same contract (64x64 white)
  'starblade.a': motif('Star-steel point', 'A long four-point star whose forward point is drawn out into a sword tip.',
    shape('M32 2 L37 25 L58 32 L37 39 L32 62 L27 39 L6 32 L27 25 Z', .35)
    + shape('M32 2 L35.5 26 L32 46 L28.5 26 Z')
    + shape('M14 32 L28 29.5 L32 32 L28 34.5 Z M50 32 L36 29.5 L32 32 L36 34.5 Z', .8)
    + stroke('M22 50 L42 50 M32 50 V60', 4)),
  'starblade.b': motif('Star shard', 'A sharp faceted star splinter with one bright edge and a dimmer back facet.',
    shape('M32 4 L40 28 L58 34 L38 38 L30 60 L26 36 L8 30 L28 26 Z')
    + shape('M32 4 L28 26 L8 30 L26 36 Z', .45)),
  'starblade.c': motif('Sworn star', 'An eight-point star stands in a ring, its top point a sword blade and four steel studs on the rim.',
    ring(32, 32, 26, 4)
    + radial(shape('M32 10 L35 27 L32 32 L29 27 Z', .55), [45, 135, 225, 315])
    + radial(shape('M32 12 L36 27 L32 32 L28 27 Z'), [90, 180, 270])
    + shape('M32 2 L35 10 L35 28 L32 32 L29 28 L29 10 Z')
    + stroke('M26 12 H38', 3.5)
    + radial(disc(32, 6, 2.5), [45, 135, 225, 315])
    + disc(32, 32, 4, .6)),
};
