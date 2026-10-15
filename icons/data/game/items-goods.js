// Thousandvale goods: original, hand-drawn compositions in a 64 × 64 viewBox.
// Dark ink silhouettes, warm shadow planes, and broad painted highlights.
const ink = '#1a1410';
const p = (d, fill, stroke = ink, width = 2.2) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const cut = (d, fill, width = 2.2, stroke = ink) => `<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
const l = (d, stroke, width = 2.2) => p(d, 'none', stroke, width);
const e = (x, y, rx, ry, fill, stroke = ink, width = 2.2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const c = (x, y, r, fill, stroke = ink, width = 2.2) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const g = (transform, art) => `<g transform="${transform}">${art}</g>`;
const gleam = (x, y, colour = '#fff1b4') => p(`M${x} ${y - 5} L${x + 1.5} ${y - 1.5} L${x + 5} ${y} L${x + 1.5} ${y + 1.5} L${x} ${y + 5} L${x - 1.5} ${y + 1.5} L${x - 5} ${y} L${x - 1.5} ${y - 1.5}Z`, colour, 'none');
const plate = (colour = '#bec8bd') => e(32, 43, 26, 12, '#617b7a') + e(32, 40, 26, 11, colour) + e(32, 40, 20, 7, '#819a90', '#dce3c7', 1.5);
const leaf = (x, y, angle = 0, colour = '#6aaf58') => g(`translate(${x} ${y}) rotate(${angle})`, p('M0 0 Q-10 -4 -6 -15 Q5 -13 0 0Z', colour) + l('M0 0 L-4 -10', '#b6d581', 1.6));
const mushroom = (x, y, scale = 1, colour = '#ba7040') => g(`translate(${x} ${y}) scale(${scale})`, p('M-3 0 L-4 9 Q0 12 4 9 L3 0Z', '#ead5a0') + p('M-10 1 Q-10 -11 0 -11 Q10 -10 10 1 Q0 5 -10 1Z', colour) + l('M-6 -4 Q-3 -8 1 -7', '#f1bf76', 2));
const coin = (x, y, rx = 8, ry = 5) => e(x, y + 3, rx, ry, '#a46a21') + e(x, y, rx, ry, '#eac252') + l(`M${x - rx + 3} ${y} Q${x} ${y - ry + 2} ${x + rx - 3} ${y}`, '#fff0a3', 1.8);

export default {
  healing_potion: {
    name: 'Healing Potion',
    description: 'A round glass flask of scarlet medicine, with a cork and a bright curved reflection.',
    art: p('M25 9 H39 L38 23 C53 28 56 48 44 55 Q32 62 20 55 C8 48 11 28 26 23Z', '#a4b3ac')
      + p('M17 35 Q31 39 47 34 C52 45 45 55 32 55 C20 55 13 47 17 35Z', '#d83838')
      + p('M35 38 Q44 37 47 36 Q51 49 38 54 L31 54 Q42 47 35 38Z', '#97252e', 'none')
      + e(32, 35, 15, 3, '#f76a60', 'none')
      + p('M25 7 L39 7 L37 16 H27Z', '#a8733f') + l('M28 9 H35', '#e6b97a')
      + p('M23 17 Q32 20 41 17 V22 Q32 25 23 22Z', '#ccd9cb')
      + l('M21 31 Q17 36 19 42', '#fff0d7', 3) + l('M22 48 L25 50', '#ffab9b', 2.5),
  },
  greater_healing: {
    name: 'Greater Healing',
    description: 'An ample crimson decanter with broad shoulders, a gold collar, and a gold foot.',
    art: p('M25 9 H39 L40 21 L50 28 Q54 35 50 48 L43 56 H21 L14 48 Q10 35 14 28 L24 21Z', '#b5aab0')
      + p('M17 32 Q32 36 47 31 L47 46 L41 52 H23 L17 46Z', '#a91536')
      + p('M34 34 L46 33 V45 L40 51 H30 L36 43Z', '#650f2c', 'none')
      + p('M25 6 H39 L37 15 H27Z', '#7b4430') + l('M28 8 H35', '#c89662')
      + p('M22 16 H42 V23 L36 26 H28 L22 23Z', '#d9a83c')
      + l('M26 19 H38', '#fff1a3', 2.6) + c(32, 23, 3, '#e25154', ink, 1.5)
      + p('M20 50 L25 53 H39 L44 50 L43 57 H21Z', '#bd8832')
      + l('M25 55 H38', '#f1cb67') + l('M19 30 L19 39', '#ffe1cd', 3)
      + l('M16 43 Q17 49 21 49 M48 43 Q47 49 43 49', '#efbd58', 2.5),
  },
  mana_potion: {
    name: 'Mana Potion',
    description: 'A tall blue glass flask filled with luminous azure mana and a bright rising bubble.',
    art: p('M27 9 H37 L38 24 L43 31 L44 51 Q43 57 32 58 Q21 57 20 51 L21 31 L26 24Z', '#819eb8')
      + p('M24 34 Q32 37 40 33 L41 50 Q40 54 32 54 Q24 54 23 50Z', '#3a7be8')
      + p('M34 35 L40 35 L41 50 Q38 54 32 54 L29 52 Q37 45 34 35Z', '#2450ad', 'none')
      + e(32, 34, 8, 2.5, '#80dcff', 'none')
      + p('M26 6 H38 L36 15 H28Z', '#a77648') + p('M25 17 H39 V22 H25Z', '#adcce0')
      + l('M27 27 L25 32 V44', '#c4f4ff', 2.7) + c(32, 42, 2.8, '#b3edff', 'none')
      + gleam(35, 48, '#a4eaff'),
  },
  group_tonic: {
    name: 'Group Tonic',
    description: 'A generous amber jug-flask with a side handle and a red ribbon tied around its neck.',
    art: p('M42 21 Q58 17 57 33 Q56 44 45 43 L42 36 Q51 38 51 29 Q51 25 44 28Z', '#b88c45')
      + p('M22 12 H37 L38 24 Q49 29 49 43 L46 53 Q30 61 13 53 L10 43 Q10 30 22 24Z', '#b4b99a')
      + p('M14 35 Q31 40 45 34 V45 L42 51 Q29 55 17 50 L14 43Z', '#df8e27')
      + p('M34 37 L45 36 L44 46 L40 51 L29 53 Q39 45 34 37Z', '#b75a21', 'none')
      + e(29, 35, 15, 3, '#ffc168', 'none')
      + p('M22 7 H37 L35 17 H24Z', '#9b683a') + l('M26 10 H33', '#d9aa6b')
      + p('M20 19 H39 V25 H20Z', '#bd4640')
      + p('M35 24 L44 24 L47 37 L41 34 L37 38Z', '#e66a4e')
      + l('M19 32 Q16 39 19 44', '#fff0c2', 3) + c(37, 23, 3, '#f6bc71', ink, 1.5),
  },
  antidote: {
    name: 'Antidote',
    description: 'A narrow green medicine vial with a long neck, tapered base, and waxed cork.',
    art: p('M26 10 H38 L36 29 L41 33 V49 Q39 55 32 58 Q25 55 23 49 V33 L28 29Z', '#a2b99a')
      + p('M26 35 Q32 37 38 35 V48 Q36 52 32 54 Q28 52 26 48Z', '#4fb860')
      + p('M34 37 H38 V48 L32 54 L31 50Z', '#26783d', 'none')
      + p('M25 7 H39 L37 16 H27Z', '#856439') + l('M28 10 H35', '#c9aa69')
      + l('M26 19 H38', '#dae4b2', 3) + l('M30 25 V30 M27 39 V45', '#e2ffd0', 2.3)
      + e(32, 35, 6, 1.5, '#95ee83', 'none'),
  },
  revival_flask: {
    name: 'Revival Flask',
    description: 'A white-gold pear-shaped elixir beneath a winged golden stopper.',
    art: p('M27 18 H37 V27 C43 31 51 40 48 49 Q46 57 32 58 Q18 57 16 49 C13 40 21 31 27 27Z', '#c0bea4')
      + p('M21 37 Q32 41 43 36 Q54 53 32 54 Q12 53 21 37Z', '#f4e4a1')
      + p('M36 39 L43 38 Q49 50 37 53 L29 54 Q40 47 36 39Z', '#d3ae55', 'none')
      + e(32, 38, 11, 2.5, '#fffbd9', 'none')
      + p('M30 17 Q18 19 13 8 L22 11 L20 6 Q28 7 32 13 Q36 7 44 6 L42 11 L51 8 Q46 19 34 17Z', '#e6bc58')
      + l('M19 12 L28 15 M45 12 L36 15', '#fff3bd', 2)
      + p('M25 19 H39 V24 H25Z', '#b68b36') + c(32, 16, 4, '#fff0b3')
      + l('M22 37 Q19 42 21 47', '#fffcec', 3) + gleam(33, 46, '#fffdf1'),
  },
  emberheart_draught: {
    name: 'Emberheart Draught',
    description: 'A squat faceted bottle holding coal-orange draught around a bright ember heart.',
    art: p('M25 11 H39 V22 L48 29 L52 43 L44 55 H20 L12 43 L16 29 L25 22Z', '#9f9a8c')
      + p('M19 33 L45 32 L48 42 L41 51 H23 L16 42Z', '#f17927')
      + p('M35 34 L44 34 L48 42 L41 51 H31 L38 43Z', '#ba3e21', 'none')
      + p('M32 39 C27 29 17 39 25 45 L32 51 L39 45 C47 38 37 29 32 39Z', '#ffce63', '#a93621', 1.8)
      + p('M32 42 Q27 37 26 41 L32 47 L37 41 Q34 38 32 42Z', '#fff3b3', 'none')
      + p('M25 7 H39 V15 H25Z', '#654232') + p('M23 17 H41 V23 H23Z', '#c87f38')
      + l('M27 19 H37 M19 30 L16 40', '#ffe3ac', 2.5),
  },
  thirsting_draught: {
    name: 'Thirsting Draught',
    description: 'An elegant dark wine-purple teardrop bottle with a slender blackened metal neck.',
    art: p('M28 9 H36 L35 24 C37 29 46 33 46 44 Q46 57 32 58 Q18 57 18 44 C18 33 27 29 29 24Z', '#958998')
      + p('M23 37 Q32 41 41 37 Q49 52 32 54 Q15 52 23 37Z', '#6c315f')
      + p('M35 39 L41 38 Q46 50 36 53 L29 54 Q38 48 35 39Z', '#41243d', 'none')
      + e(32, 38, 9, 2.5, '#a75e92', 'none')
      + p('M28 7 L32 5 L36 7 L35 17 H29Z', '#65434e')
      + p('M26 17 H38 V22 H26Z', '#b88b67')
      + l('M27 33 Q22 39 23 45', '#e0b7d3', 2.8) + c(29, 45, 2, '#bb7fa2', 'none'),
  },
  marrow_draught: {
    name: 'Marrow Draught',
    description: 'A square apothecary bottle of pale yellow-white draught with a crosswise bone stopper.',
    art: p('M25 16 H39 V26 L46 31 V53 Q32 59 18 53 V31 L25 26Z', '#b4b5a5')
      + p('M22 36 Q32 39 42 35 V50 Q32 54 22 50Z', '#eee2ab')
      + p('M35 37 L42 36 V50 L32 52 L30 49Z', '#c6b877', 'none')
      + p('M23 8 Q18 4 18 10 Q15 15 22 15 L26 13 H38 L42 15 Q49 15 46 10 Q46 4 41 8 L37 10 H27Z', '#e4d7b8')
      + l('M24 11 H39', '#fff4d6', 2) + p('M24 19 H40 V25 H24Z', '#82785b')
      + e(32, 36, 10, 2, '#fff8d3', 'none') + l('M23 32 V43', '#ffffe3', 3),
  },
  harmonic_ward: {
    name: 'Harmonic Ward',
    description: 'A lilac elixir in a curved lyre-shouldered flask, with a small luminous musical curl.',
    art: p('M27 10 H37 V23 C49 20 52 29 46 35 L43 50 Q40 57 32 57 Q24 57 21 50 L18 35 C12 29 15 20 27 23Z', '#aaa0b9')
      + p('M22 34 Q32 38 42 34 L39 49 Q32 55 25 49Z', '#ac7bcf')
      + p('M34 37 L41 35 L38 49 L31 52 L29 49Z', '#77579c', 'none')
      + p('M27 6 H37 L36 16 H28Z', '#b18d53') + l('M29 9 H35', '#ead19b')
      + p('M25 18 H39 V23 H25Z', '#ded0a3')
      + l('M33 44 V32 Q41 33 37 38', '#f4d8ff', 2.5)
      + e(29.5, 45, 4, 2.7, '#ffe9ff', 'none')
      + l('M26 48 Q21 43 25 39', '#d9b5ee', 1.7)
      + l('M20 28 Q18 29 21 32', '#fff0ef', 2.5),
  },

  travel_rations: {
    name: 'Travel Rations',
    description: 'A cloth-wrapped travelling lunch of a scored crusty loaf and a wedge of yellow cheese.',
    art: p('M8 29 L19 24 L48 27 L57 40 L50 55 L16 56 L7 45Z', '#8a9c73')
      + p('M13 30 Q10 20 24 14 Q37 10 43 20 L45 33 L20 41Z', '#c08b45')
      + p('M16 27 Q14 20 27 17 Q36 15 39 21 L38 26 L20 33Z', '#e6b66a', 'none')
      + l('M23 20 L25 26 M30 18 L32 24 M37 20 L38 24', '#89502f', 2.6)
      + p('M31 34 L45 23 L55 33 L53 44 L31 44Z', '#edc45d')
      + p('M31 34 L45 23 L55 33Z', '#ffe59a')
      + c(46, 37, 2.4, '#bd8738', 'none') + c(37, 39, 1.6, '#bd8738', 'none')
      + p('M8 32 L29 43 L55 35 L50 55 H17 L8 46Z', '#a7b38a')
      + p('M8 35 L29 46 L18 55 L11 48Z', '#657e62', 'none')
      + l('M29 44 L32 55 M10 43 L53 47', '#e5d2a4', 2.7) + p('M27 45 L24 40 L32 42 L36 39 L35 46Z', '#d9bd87'),
  },
  trail_ale: {
    name: 'Trail Ale',
    description: 'A banded wooden tankard with a sturdy handle and a frothy crown of ale.',
    art: p('M43 23 H51 Q59 25 57 36 Q56 47 44 46 V39 Q51 40 51 33 Q52 29 44 30Z', '#9b6739')
      + p('M12 19 L44 19 L43 52 Q28 59 13 52Z', '#a8723c')
      + p('M32 22 H44 L43 52 Q37 56 32 55Z', '#70442d', 'none')
      + l('M20 24 L21 50 M29 24 V52 M37 24 L36 50', '#5e3e2a', 2)
      + p('M12 26 Q28 30 44 26 V32 Q28 35 12 32Z M13 45 Q28 49 43 45 V51 Q28 56 13 51Z', '#8b9390')
      + l('M16 28 L29 30 M17 48 L29 50', '#d7d4bb', 2)
      + p('M11 24 Q6 17 14 15 Q13 8 22 11 Q29 5 35 11 Q44 7 46 15 Q50 20 43 25 L25 25 V32 Q19 36 18 29 V25Z', '#f3e6ba')
      + l('M16 18 Q20 15 24 17 M31 14 Q35 12 38 15', '#fff8dd', 2.5),
  },
  hearty_stew: {
    name: 'Hearty Stew',
    description: 'A red earthenware bowl brimming with brown stew, carrot rounds, potatoes, and a wooden spoon.',
    art: p('M10 33 L54 33 Q52 54 32 56 Q13 53 10 33Z', '#ad5b3b')
      + p('M35 35 H53 Q50 51 35 55 L25 54 Q40 46 35 35Z', '#783c2b', 'none')
      + e(32, 32, 24, 10, '#d59261') + e(32, 32, 20, 7, '#79502e')
      + p('M42 30 L52 9 Q53 6 56 8 Q58 9 56 12 L47 33Z', '#ad7b49')
      + e(42, 32, 6, 4, '#d2a56b')
      + p('M17 29 L24 25 L28 30 L23 35 L17 34Z M31 31 L36 27 L40 32 L37 37 L31 36Z', '#e7cd86', ink, 1.5)
      + e(30, 27, 4, 2.5, '#e89442', ink, 1.4) + e(21, 36, 4, 2, '#e89442', ink, 1.4)
      + l('M16 42 Q20 48 26 49', '#e4a16b', 3) + l('M14 20 Q10 15 15 10 M29 18 Q25 14 29 8', '#c5c3a8', 2),
  },
  roast_game: {
    name: 'Roast Game',
    description: 'A glazed roast haunch with an exposed bone on a blue-grey serving plate.',
    art: plate('#bdcbbd')
      + p('M39 25 L48 16 Q46 9 51 9 Q56 7 55 14 Q61 17 57 21 Q54 25 51 21 L44 31Z', '#ead7a7')
      + p('M12 34 Q10 24 23 20 Q35 16 43 27 Q48 36 38 43 Q24 50 15 42Z', '#a5562e')
      + p('M15 32 Q18 22 27 23 Q37 21 39 29 Q26 27 23 38Z', '#db8a48', 'none')
      + p('M24 40 Q38 41 42 31 Q44 40 34 44 L24 45Z', '#753b28', 'none')
      + l('M22 25 L18 30 M30 24 L26 30 M37 27 L33 33', '#f2b66c', 2.6)
      + leaf(45, 45, 72) + leaf(44, 45, 118),
  },
  mint_tea: {
    name: 'Mint Tea',
    description: 'A pale ceramic cup of green tea with a fresh mint sprig, resting on a saucer.',
    art: e(31, 51, 25, 7, '#748e83') + e(31, 49, 25, 6, '#c6d4b8')
      + p('M45 27 Q58 24 57 35 Q56 43 45 42 V36 Q51 37 51 33 Q51 30 46 33Z', '#bfccb3')
      + p('M11 28 H47 L44 44 Q40 52 29 52 Q17 51 14 43Z', '#d8d9b4')
      + p('M36 30 H47 L43 45 Q40 51 29 51 L27 48 Q39 44 36 30Z', '#97ad91', 'none')
      + e(29, 28, 18, 7, '#edf0ca') + e(29, 28, 14, 4, '#78a24b')
      + l('M18 36 Q18 43 23 45', '#fff3d2', 2.5)
      + leaf(34, 29, 30, '#4e9650') + leaf(34, 29, 95, '#78bd61')
      + l('M20 19 Q14 13 21 7 M35 16 Q31 12 35 7', '#c7d3b5', 2),
  },
  mushroom_skewers: {
    name: 'Mushroom Skewers',
    description: 'Two slanting wooden skewers threaded with broad roasted mushroom caps.',
    art: l('M12 56 L39 10 M29 56 L52 15', ink, 5.5) + l('M12 56 L39 10 M29 56 L52 15', '#c5985b', 2.5)
      + g('rotate(29 24 36)', mushroom(24, 36, .92, '#9e5b35'))
      + g('rotate(29 34 19)', mushroom(34, 19, .9, '#c78043'))
      + g('rotate(26 39 40)', mushroom(39, 40, .86, '#bf743d'))
      + g('rotate(26 48 24)', mushroom(48, 24, .83, '#925233'))
      + l('M18 33 L25 37 M28 16 L35 20 M34 38 L41 41 M43 22 L49 25', '#643c28', 2),
  },
  foragers_stew: {
    name: "Forager’s Stew",
    description: 'A black iron cooking pot packed with leafy greens, pale roots, and orange carrots.',
    art: l('M15 31 Q10 12 31 11 Q53 10 50 32', '#a9aba0', 3)
      + p('M11 30 L8 27 L5 31 L9 37 H13 M51 30 L55 27 L59 31 L55 37 H51', '#737e72')
      + p('M13 28 H51 L53 44 Q51 55 32 57 Q13 55 11 44Z', '#58625b')
      + p('M37 31 H50 L52 44 Q49 53 35 55 L28 55 Q42 46 37 31Z', '#343f39', 'none')
      + e(32, 29, 20, 8, '#889183') + e(32, 29, 16, 5, '#6f783c')
      + p('M18 28 L23 24 L29 27 L26 33 H21Z M35 29 L39 24 L45 27 L42 32Z', '#e1c793', ink, 1.4)
      + e(33, 30, 4, 2.5, '#db873d', ink, 1.5) + leaf(32, 30, -44, '#6aa454')
      + leaf(42, 30, 52, '#8cbb60') + l('M17 40 Q16 46 22 49', '#a0aa95', 3),
  },
  amber_broth: {
    name: 'Amber Broth',
    description: 'A shallow ochre bowl of clear golden broth with a prominent amber mushroom cap.',
    art: p('M8 33 H56 Q54 49 40 53 H24 Q10 49 8 33Z', '#c59450')
      + p('M33 36 H55 Q51 49 39 52 H28 Q40 44 33 36Z', '#896539', 'none')
      + e(32, 32, 25, 10, '#edcb83') + e(32, 32, 20, 6.5, '#dc9f30')
      + e(31, 33, 16, 4, '#f6c858', 'none')
      + p('M24 32 L27 39 L34 38 L33 31Z', '#f8deb0', ink, 1.7)
      + p('M18 30 Q18 17 31 17 Q44 17 45 29 Q32 35 18 30Z', '#bb6c21')
      + p('M21 27 Q23 19 31 20 Q39 20 41 26 Q31 23 21 27Z', '#f1b64a', 'none')
      + l('M15 41 Q19 46 25 47', '#f1cf91', 2.6) + l('M21 12 Q19 9 22 6 M42 18 Q38 13 42 9', '#d7c6a4', 2),
  },
  charred_fish_on_a_stick: {
    name: 'Charred Fish on a Stick',
    description: 'A whole fire-blackened fish skewered diagonally on a sharpened hazel stick.',
    art: l('M9 56 L53 9', ink, 6) + l('M9 56 L53 9', '#b58b54', 3)
      + p('M39 21 L44 10 L45 19 L54 18 L46 27Z', '#9e693c')
      + p('M17 32 L15 23 L28 24 M34 40 L42 43 L41 31', '#8b5a36')
      + p('M12 42 Q14 24 33 22 Q43 21 46 27 Q43 44 26 49 Q17 51 12 42Z', '#8a5533')
      + p('M16 43 Q27 45 43 29 Q39 42 26 46 Q20 49 16 43Z', '#c68a4e', 'none')
      + l('M25 27 L33 34 M33 25 L40 31 M20 33 L27 40', '#3d3025', 4)
      + l('M18 40 Q20 36 22 36', '#e5b471', 2.5) + c(17, 40, 2, '#e5c385')
      + l('M14 46 L19 45', '#3d3025', 1.8),
  },
  fried_perch: {
    name: 'Fried Perch',
    description: 'A crisp golden perch in a small dark skillet with a lemon wedge.',
    art: p('M43 26 L54 9 Q58 7 59 12 L49 32Z', '#77766b')
      + e(28, 41, 23, 15, '#38413c') + e(28, 37, 23, 13, '#858c7b') + e(28, 37, 19, 9, '#4a5043')
      + p('M40 34 L49 29 L47 36 L50 41 L40 40 Q29 49 15 41 L10 36 L17 29 Q32 24 40 34Z', '#d89939')
      + p('M16 32 Q26 26 37 34 L32 37 L17 38 L13 35Z', '#f4c769', 'none')
      + p('M23 29 L26 22 L33 29 M24 43 L30 48 L32 42', '#ba7930')
      + l('M25 31 L23 38 M32 32 L30 39 M38 35 L36 40', '#9c5b2a', 2.2)
      + c(16, 35, 1.8, '#493625', 'none')
      + p('M13 24 L23 15 Q29 22 22 27Z', '#f5d65e') + l('M16 23 L23 19 L22 24Z', '#fff3b4', 1.7)
      + c(55, 12, 1.4, '#ded3b5', 'none'),
  },
  river_chowder: {
    name: 'River Chowder',
    description: 'A blue crock of creamy fish chowder, with white fish chunks and bright leek rings.',
    art: p('M13 29 Q4 25 5 34 Q5 41 13 40 M51 29 Q60 25 59 34 Q59 41 51 40', '#7faaa9')
      + p('M12 29 H52 L49 48 Q45 56 32 56 Q19 56 15 48Z', '#6a969a')
      + p('M35 31 H51 L48 49 Q43 54 32 55 L27 52 Q40 46 35 31Z', '#426b78', 'none')
      + e(32, 29, 21, 9, '#bad7c5') + e(32, 29, 17, 6, '#e4d39b')
      + p('M17 28 L24 24 L30 27 L26 33 L18 32Z M35 27 L40 24 L47 28 L43 32 L36 32Z', '#fff1cf', ink, 1.4)
      + e(32, 32, 3.2, 2.3, '#adc577', '#526f42', 1.8)
      + e(33, 25, 2.7, 1.7, '#d1d491', '#526f42', 1.7)
      + l('M20 39 L21 46 L26 49', '#b5d6c4', 2.6) + l('M20 18 Q15 13 21 8 M39 17 Q34 11 40 6', '#c9d2be', 2),
  },
  smoked_eel: {
    name: 'Smoked Eel',
    description: 'A long copper-brown smoked eel curled into an S on a narrow wooden serving board.',
    art: p('M10 19 L43 13 L54 18 L56 47 L20 55 L10 48Z', '#9d703f')
      + p('M10 19 L20 25 L56 18 V47 L20 55 V25Z', '#bf9258')
      + l('M27 27 L29 48 M45 23 L47 44 M14 25 V43', '#8d5e35', 1.8)
      + p('M18 22 C18 9 46 9 48 23 C51 36 25 29 27 39 Q29 45 42 42 L49 40 Q46 51 29 50 C11 47 13 32 28 29 Q44 28 39 22 Q34 17 25 22Z', '#9a5930')
      + p('M20 22 Q22 14 34 16 Q45 17 44 25 Q44 29 32 30 Q19 30 20 39 Q21 49 38 47 Q28 51 21 45 Q11 32 28 27 Q42 26 38 22 Q33 19 25 24Z', '#d19a58', 'none')
      + p('M15 21 Q17 15 25 17 L29 22 L23 27 L16 26Z', '#b77942')
      + c(20, 21, 1.8, '#f1cf8a') + l('M16 25 L21 25 M32 16 L31 21 M40 18 L37 23 M27 36 L21 36 M30 43 L28 48', '#603f2b', 1.7),
  },
  pike_steaks: {
    name: 'Pike Steaks',
    description: 'Two thick pale fish steaks with dark skin and central bone holes, served on slate.',
    art: p('M8 29 L43 19 L57 29 L54 49 L20 57 L6 46Z', '#6d7c76')
      + p('M8 29 L22 39 L57 29 L54 49 L20 57 L6 46Z', '#4c615d')
      + l('M10 44 L21 51 L47 45', '#8ba49a', 2)
      + p('M12 31 Q13 18 28 17 Q43 18 40 31 L36 37 L28 39 L26 33 L22 34 L21 41 L15 39Z', '#597a6f')
      + p('M15 29 Q18 20 28 20 Q38 20 37 29 L33 34 L29 34 L28 29 L22 30 L19 35 L16 35Z', '#e6c7a0')
      + p('M28 43 Q29 29 43 28 Q55 30 53 42 L49 48 L43 50 L40 43 L36 44 L36 51 L29 49Z', '#4d7065')
      + p('M31 41 Q33 32 43 32 Q52 33 50 40 L47 45 L44 45 L43 39 L37 40 L34 46 L32 45Z', '#f1d8b4')
      + l('M20 25 L23 28 M31 24 L29 27 M35 37 L38 39 M47 36 L45 39', '#be9571', 1.6)
      + leaf(48, 24, 68),
  },
  fen_stew: {
    name: 'Fen Stew',
    description: 'A leaf-lined green bowl of dark marsh stew with fish flakes, root slices, and reed shoots.',
    art: p('M8 33 L55 32 Q55 51 35 55 Q17 56 8 33Z', '#697447')
      + p('M35 34 H55 Q52 50 35 54 L27 51Z', '#424d32', 'none')
      + e(32, 32, 24, 9, '#a7b572') + e(32, 32, 20, 6, '#5e6430')
      + p('M14 30 Q8 20 10 14 Q25 13 31 27 L26 34Z', '#58915b')
      + l('M12 18 L24 30 M17 20 L23 20', '#9dc06e', 1.8)
      + p('M25 31 L32 25 L38 29 L34 34Z M38 34 L44 29 L50 32 L45 37Z', '#ddd4a8', ink, 1.4)
      + e(23, 35, 4, 2.2, '#c69160', ink, 1.5)
      + l('M40 25 L47 12 M45 26 L53 17', '#91af66', 3)
      + p('M45 14 L45 8 L49 7 L49 13Z', '#bb9b58', ink, 1.5)
      + l('M15 41 Q21 47 26 48', '#9eac6e', 2.7),
  },
  herring_pie: {
    name: 'Herring Pie',
    description: 'A deep golden pie in a fluted pan, with a small fish-shaped pastry ornament on its crust.',
    art: e(32, 49, 26, 7, '#637d83')
      + p('M9 32 H55 L51 48 Q31 59 13 48Z', '#93866a')
      + l('M15 38 L18 47 M23 40 L25 51 M34 40 V52 M45 39 L43 49 M51 37 L48 45', '#c7c1a1', 2.2)
      + p('M8 32 L11 26 L16 25 L19 21 L25 21 L30 18 L36 20 L42 20 L46 24 L52 25 L56 31 L53 36 Q33 46 12 36Z', '#bd8137')
      + e(32, 29, 21, 10, '#dfac5e')
      + p('M19 28 Q29 19 39 27 L47 23 L45 29 L47 34 L39 31 Q28 39 19 28Z', '#f3d58d', '#9c642e', 1.6)
      + c(24, 28, 1.4, '#9c642e', 'none') + l('M31 25 Q35 29 31 32', '#bd873d', 1.8)
      + l('M17 20 L14 23 M25 18 L23 21 M40 18 L42 21 M51 24 L49 26 M16 35 L18 38 M45 36 L43 39', '#f7d28a', 2),
  },
  archers_fishcakes: {
    name: 'Archer’s Fishcakes',
    description: 'Three crisp fishcakes with herb flecks arranged on a broad folded leaf beside a twig fork.',
    art: p('M7 43 Q8 18 34 13 Q56 23 55 49 Q32 61 7 43Z', '#4d7f4c')
      + l('M10 44 L48 24 M22 39 L18 28 M33 33 L39 45', '#a0bd6a', 2)
      + e(23, 37, 11, 8, '#9e662f') + e(23, 34, 11, 7, '#d7a244')
      + e(40, 41, 11, 8, '#9d642e') + e(40, 38, 11, 7, '#e4b657')
      + e(34, 24, 11, 8, '#a76b2e') + e(34, 21, 11, 7, '#e6b562')
      + l('M17 32 L20 31 M23 36 L26 34 M32 20 L35 18 M38 23 L40 22 M36 37 L39 35 M43 40 L46 38', '#66804a', 2.5)
      + l('M11 55 L8 21 M8 24 L5 18 M8 24 L12 18', ink, 4.3)
      + l('M11 55 L8 21 M8 24 L5 18 M8 24 L12 18', '#ba9a60', 2),
  },
  pilgrims_supper: {
    name: 'Pilgrim’s Supper',
    description: 'A modest wooden trencher with a fish fillet, dark bread, and a spoonful of beans.',
    art: e(32, 40, 26, 15, '#795334') + e(32, 36, 26, 14, '#b08950')
      + e(32, 36, 21, 10, '#976f40', '#d0a56b', 1.5)
      + p('M10 26 L13 16 Q25 11 31 23 L28 34 L16 35Z', '#6e4d32')
      + p('M13 25 L15 18 Q24 16 28 25 L25 31 L16 32Z', '#c3985a')
      + l('M19 20 L20 24 M23 24 L24 27', '#edc88b', 2)
      + p('M28 32 L39 23 L51 29 L45 41 L29 44 L24 39Z', '#c4b58b')
      + p('M29 32 L39 26 L47 30 L41 38 L28 41Z', '#ead6a3', ink, 1.5)
      + l('M34 31 L39 35 M29 35 L34 39 M39 28 L44 31', '#b7915c', 1.8)
      + e(16, 40, 4, 2.5, '#a45d40', ink, 1.4) + e(23, 45, 4, 2.5, '#bc7950', ink, 1.4)
      + e(15, 46, 3.6, 2.3, '#c17b50', ink, 1.4),
  },
  anglers_feast: {
    name: 'Angler’s Feast',
    description: 'A lavish long platter of two grilled fish with lemon rounds and fresh green garnish.',
    art: e(32, 41, 27, 15, '#5d7f87') + e(32, 38, 27, 14, '#b8d1c1')
      + e(32, 38, 22, 10, '#81a697', '#e3e7c4', 1.5)
      + p('M12 29 Q22 17 38 24 L48 18 L46 26 L51 31 L39 29 Q22 39 12 29Z', '#c18b45')
      + p('M13 42 Q25 30 40 37 L50 31 L48 39 L53 44 L41 42 Q26 52 13 42Z', '#cf9b51')
      + l('M24 23 L27 29 M32 24 L34 29 M25 37 L28 43 M33 37 L36 42', '#755333', 2.2)
      + c(17, 28, 1.6, '#2e3428', 'none') + c(18, 41, 1.6, '#2e3428', 'none')
      + e(40, 48, 6, 4, '#f1d157') + l('M36 48 H44 M40 45 V51', '#fff2b1', 1.5)
      + leaf(20, 24, 30, '#4c9354') + leaf(20, 24, -24, '#7ab560')
      + leaf(46, 43, 35, '#63994c'),
  },
  legends_broth: {
    name: 'Legend’s Broth',
    description: 'A blue and gold footed bowl of luminous broth with a curled white fish and rising golden steam.',
    art: p('M20 55 L25 48 H39 L44 55Z', '#cc9e41') + e(32, 55, 13, 3, '#e6bf63')
      + p('M9 30 H55 Q52 47 32 50 Q12 47 9 30Z', '#487a9b')
      + p('M34 32 H54 Q49 46 33 49 L25 46Z', '#2e4c76', 'none')
      + l('M14 36 Q16 44 26 46 M50 36 Q48 44 38 46', '#e5b951', 3)
      + e(32, 30, 24, 9, '#eac66d') + e(32, 30, 19, 6, '#e0a64a')
      + p('M18 30 Q23 19 37 24 Q47 28 40 33 Q35 35 30 32 L34 28 Q31 25 25 29 L22 33Z', '#fff0bc', '#936334', 1.7)
      + p('M18 30 L14 24 L14 34 L22 33Z', '#f7dea1', '#936334', 1.7)
      + c(39, 28, 1.1, '#6d633e', 'none')
      + l('M23 18 Q15 11 24 8 M35 20 Q42 13 35 7', '#f6dea2', 2.5)
      + gleam(48, 16) + l('M24 54 H38', '#fff0b7', 2),
  },
  riders_kedgeree: {
    name: 'Rider’s Kedgeree',
    description: 'A travelling pan piled with yellow rice, smoked fish strips, and two bright egg quarters.',
    art: p('M43 37 L55 47 Q60 51 56 55 Q54 57 51 54 L39 44Z', '#af7a41')
      + e(28, 39, 23, 14, '#6a6d57') + e(28, 35, 23, 12, '#a6a98b')
      + p('M8 34 Q9 28 15 26 Q16 20 24 22 Q31 16 36 23 Q44 21 47 29 L49 36 Q30 49 8 34Z', '#d5a642')
      + l('M16 30 L19 31 M24 25 L27 27 M29 37 L32 36 M38 29 L41 31 M19 37 L22 38 M35 41 L38 39', '#ffe096', 2.5)
      + p('M10 26 Q9 16 18 15 Q27 15 25 27Z', '#f6eccc')
      + p('M13 24 Q13 18 18 18 Q23 18 22 25Z', '#edb33f', '#c4822b', 1.5)
      + p('M33 23 Q32 13 40 13 Q48 15 47 23Z', '#f6eccc')
      + p('M36 22 Q36 17 40 17 Q44 18 44 22Z', '#eab139', '#c4822b', 1.5)
      + p('M21 31 L31 27 L35 30 L25 35Z M33 36 L42 32 L46 35 L37 40Z', '#c08b57', ink, 1.6),
  },
  recall_charm: {
    name: 'Recall Charm',
    description: 'A glowing four-point compass amulet in a brass bezel, hanging from a loop of blue cord.',
    art: l('M26 22 Q12 7 26 6 H39 Q51 7 38 23', ink, 5)
      + l('M26 22 Q12 7 26 6 H39 Q51 7 38 23', '#6ca6b3', 2.5)
      + c(32, 23, 5, '#b88a36') + p('M32 23 L51 39 L32 58 L13 39Z', '#b78c3f')
      + p('M32 27 L46 39 L32 53 L18 39Z', '#65a2a4')
      + p('M32 30 L35 37 L42 39 L35 42 L32 50 L29 42 L22 39 L29 37Z', '#e9e5aa', '#37656e', 1.8)
      + p('M32 30 L35 37 L32 39 L29 37Z', '#fff9d5', 'none') + c(32, 39, 2.7, '#dcaa45')
      + l('M21 37 L28 30', '#fff0b1', 2) + gleam(51, 23, '#aeedf0'),
  },
  whetstone: {
    name: 'Whetstone',
    description: 'A thick grey sharpening stone with a polished face, set diagonally in a little wooden holder.',
    art: p('M7 37 L38 15 L57 25 L57 36 L25 58 L7 48Z', '#895e36')
      + p('M7 37 L25 47 L57 25 V36 L25 58 L7 48Z', '#b2874b')
      + p('M10 32 L38 13 L53 22 V34 L25 53 L10 44Z', '#7a8586')
      + p('M10 32 L38 13 L53 22 L25 42Z', '#b5bcb2')
      + p('M25 42 L53 22 V34 L25 53Z', '#5f747b')
      + l('M16 32 L38 18 M21 36 L43 21', '#dee0cb', 2.5)
      + l('M31 43 L46 33 M14 43 L21 47', '#92a6a3', 1.8),
  },
  armour_oil: {
    name: 'Armour Oil',
    description: 'A squat dark oil flask with a brass spout, resting against a folded polishing cloth.',
    art: p('M7 36 L35 30 L55 43 L51 56 L21 57 L6 48Z', '#c5b38e')
      + p('M7 36 L25 45 L55 43 L51 56 L21 57 L6 48Z', '#9e8b6a')
      + l('M25 45 L24 53 M10 46 L19 51 M35 48 L47 46', '#e6d1a6', 2)
      + p('M24 12 L35 10 L38 23 L45 29 L46 45 Q36 53 22 47 L18 32 L25 24Z', '#68745e')
      + p('M32 26 L38 25 L43 30 L43 44 Q38 48 32 47Z', '#3d4b3c', 'none')
      + p('M23 10 L34 7 L36 16 L25 19Z', '#bd9346')
      + p('M32 8 L42 7 L43 12 L35 14Z', '#d6b56a')
      + l('M23 32 L25 40 M27 13 L32 12', '#c6c9a2', 2.7)
      + p('M34 31 Q27 39 30 42 Q35 46 38 41 Q39 38 34 31Z', '#b7a14d', '#354035', 1.7),
  },
  silver_dust: {
    name: 'Silver Dust',
    description: 'A soft blue-grey pouch lying open beside a spill of bright silver powder.',
    art: p('M16 17 L31 20 Q30 25 40 31 Q46 43 33 51 Q16 56 9 45 Q4 35 16 27Z', '#718890')
      + p('M24 25 Q28 30 33 31 Q43 43 30 49 L19 49 Q31 40 24 25Z', '#45616e', 'none')
      + p('M14 12 L24 8 L34 14 L31 23 L16 23Z', '#9eacb1')
      + e(24, 13, 9, 4, '#374a55') + e(24, 14, 6, 2, '#c1cbd1', 'none')
      + l('M14 24 L32 25 M16 28 L12 34', '#d7bf86', 2.6)
      + p('M31 48 L39 42 L45 44 L49 49 L57 52 L51 56 L29 55 L25 52Z', '#b8c7cd')
      + p('M34 48 L40 44 L45 48 L51 51 L36 52Z', '#edf2e5', 'none')
      + c(53, 44, 1.8, '#c7d7df', 'none') + c(22, 55, 1.8, '#cad9df', 'none')
      + gleam(45, 37, '#f5ffff') + l('M12 39 Q12 44 17 46', '#a9bec2', 2.4),
  },
  fletching_kit: {
    name: 'Fletching Kit',
    description: 'Three arrow shafts, two broad feathers, and a bound spool of fletching twine.',
    art: l('M12 54 L37 10 M22 55 L46 12 M29 55 L53 17', ink, 4.8)
      + l('M12 54 L37 10 M22 55 L46 12 M29 55 L53 17', '#c49a5c', 2.3)
      + p('M17 35 Q7 29 10 18 Q11 10 18 7 Q28 14 26 24 L21 34Z', '#d5d5bb')
      + l('M17 38 L18 13 M18 22 L12 18 M18 29 L24 23', '#7b8c83', 1.8)
      + p('M31 35 Q25 27 30 18 Q34 10 42 8 Q46 19 39 27Z', '#7397a2')
      + l('M29 40 L39 14 M34 27 L31 22 M35 25 L41 20', '#d1e1cf', 1.7)
      + p('M36 35 L49 33 L54 39 L54 52 L42 57 L35 51Z', '#a97842')
      + e(44, 37, 9, 4, '#e0bd83') + e(44, 37, 3, 1.7, '#6e5133', 'none')
      + l('M37 41 Q45 44 53 40 M37 45 Q45 48 53 44 M38 49 Q45 52 53 48', '#e3c894', 2)
      + l('M40 54 Q29 59 27 49', '#d6b979', 2),
  },
  herb_poultice: {
    name: 'Herb Poultice',
    description: 'A folded cream linen dressing tied around a small bunch of fresh medicinal herbs.',
    art: leaf(33, 33, -30, '#65934e') + leaf(35, 28, 20, '#7da856')
      + leaf(41, 30, 58, '#4b8750') + leaf(27, 32, -68, '#93b26b')
      + l('M29 38 L34 17 M33 39 L45 22', '#b5c17c', 2)
      + p('M10 32 L24 25 L49 29 L56 42 L49 55 L20 57 L8 47Z', '#b3b39a')
      + p('M10 32 L31 42 L49 29 L56 42 L37 50 L8 47Z', '#e4dcc1')
      + p('M8 47 L31 43 L49 55 L20 57Z', '#c9c6a6')
      + l('M24 29 L29 54 M11 39 L52 47', '#879875', 3)
      + p('M27 41 Q18 32 19 40 Q20 46 28 43 Q39 36 37 43 Q34 47 28 43Z', '#b8955e', ink, 1.7)
      + l('M28 43 L25 50 M28 43 L34 49', '#7d6443', 2),
  },
  dye_pot: {
    name: 'Dye Pot',
    description: 'An open terracotta dye jar with glossy violet pigment running down its side and a stirring stick.',
    art: p('M17 23 H47 L51 42 Q53 56 32 57 Q11 56 13 42Z', '#a66647')
      + p('M35 27 H47 L51 42 Q53 54 34 56 L27 54 Q43 47 35 27Z', '#754533', 'none')
      + e(32, 23, 17, 7, '#ce9a73') + e(32, 23, 13, 4, '#764699')
      + p('M37 24 L47 7 Q49 5 51 8 L43 27Z', '#c9a06c')
      + p('M38 23 L43 25 L40 30 L36 28Z', '#a87cc6', ink, 1.4)
      + p('M20 24 Q28 29 39 26 L41 35 Q40 40 36 38 V34 Q33 30 31 34 L30 45 Q25 49 23 44 V32Z', '#9b67bb', '#553867', 1.7)
      + l('M26 32 V39 M18 46 Q20 50 25 51', '#d4a6de', 2.5),
  },
  saddle_bags: {
    name: 'Saddle Bags',
    description: 'A matched pair of leather saddle bags joined by a broad curved saddle strap, with brass buckles.',
    art: p('M16 29 Q15 7 31 7 Q48 7 48 29 L40 31 Q41 18 32 17 Q22 18 24 31Z', '#795333')
      + l('M20 26 Q19 11 31 11 Q44 11 44 26', '#bc8c51', 2.5)
      + p('M8 26 L26 23 L30 32 L29 53 L13 57 L7 48Z', '#a77440')
      + p('M35 24 L54 27 L58 48 L51 56 L34 53 L32 32Z', '#aa7744')
      + p('M8 26 L26 23 L29 34 L20 40 L8 36Z M35 24 L54 27 L56 38 L43 40 L33 34Z', '#c08c50')
      + p('M22 39 L29 35 V52 L22 54Z M49 39 L56 38 L58 48 L51 56 L48 51Z', '#775031', 'none')
      + p('M16 32 H21 V48 H16Z M42 33 H47 V49 H42Z', '#765231')
      + p('M14 38 H23 V45 H14Z M40 39 H49 V46 H40Z', '#d6ae53')
      + l('M18 38 V44 M44 39 V45', '#fff0a3', 1.7)
      + l('M11 45 L13 51 M37 46 V49', '#dab47b', 2),
  },
  oat_sack: {
    name: 'Oat Sack',
    description: 'An open burlap sack overflowing with oats, with a bent oat stalk tucked against the side.',
    art: p('M17 17 H43 L41 27 Q53 36 51 51 Q32 60 12 52 Q9 39 19 27Z', '#ac8d53')
      + p('M35 25 L42 26 Q51 37 50 50 Q42 56 30 56 L25 52 Q40 45 35 25Z', '#806437', 'none')
      + e(30, 17, 14, 6, '#cbb579') + e(30, 17, 10, 3.5, '#e2ce8a', '#806437', 1.6)
      + l('M22 16 L24 18 M28 14 L30 17 M33 17 L36 16 M26 20 L29 20', '#a78641', 1.7)
      + l('M18 27 Q30 30 42 27 M15 43 L20 48 M18 38 L25 45', '#d0b77b', 2.4)
      + l('M43 52 Q42 29 51 12', '#c6a351', 2.5)
      + p('M48 19 Q41 14 45 9 Q51 11 48 19Z M51 14 Q49 7 54 6 Q58 12 51 14Z M46 28 Q38 24 42 19 Q48 21 46 28Z M48 25 Q49 17 55 19 Q55 25 48 25Z M44 37 Q37 33 40 28 Q46 31 44 37Z', '#d9bd69', ink, 1.6),
  },
  lucky_horseshoe: {
    name: 'Lucky Horseshoe',
    description: 'A sound brass horseshoe with raised tips and seven square nail holes.',
    art: p('M13 9 L24 12 L22 33 Q22 45 32 46 Q42 45 42 33 L40 12 L51 9 L55 34 Q56 57 32 58 Q8 57 9 34Z', '#c69b46')
      + p('M48 15 L52 35 Q53 54 33 55 Q13 55 12 40 Q18 52 32 51 Q49 51 48 35 L45 16Z', '#8d662f', 'none')
      + l('M17 17 L15 32 Q12 50 29 52', '#f6d882', 2.8)
      + p('M15 22 L20 23 L19 28 L14 27Z M14 36 H19 V41 H14Z M22 47 L26 45 L29 49 L25 52Z M30 50 H35 V55 H30Z M39 47 L43 45 L46 49 L42 52Z M45 36 H50 V41 H45Z M44 22 L49 21 L50 26 L45 27Z', '#59472d', 'none')
      + gleam(53, 10, '#fff1b3'),
  },
  cart_token: {
    name: 'Cart Token',
    description: 'A thick brass trade token bearing a raised six-spoked cart wheel.',
    art: e(33, 34, 23, 24, '#946c30') + e(30, 31, 23, 24, '#d6ab4c')
      + e(30, 31, 18, 19, '#b98737', '#f5d57f', 2.4)
      + c(30, 31, 13, '#caa04a', '#684e29', 2.4)
      + l('M30 18 V44 M19 24 L41 38 M19 38 L41 24', '#6d522b', 3)
      + l('M29 19 V29 M20 24 L28 30 M20 37 L28 32', '#f5d682', 1.5)
      + c(30, 31, 4, '#e8be5e', '#6d522b', 2)
      + l('M13 22 Q17 13 25 12', '#ffdfa0', 2.6),
  },
  bait_worms: {
    name: 'Bait Worms',
    description: 'An open round bait tin full of dark earth and three curled pink fishing worms.',
    art: e(37, 18, 18, 10, '#6d8585') + e(37, 15, 18, 9, '#a4b4a7')
      + e(37, 15, 13, 5, '#738d88', '#d1d8bc', 1.5)
      + p('M8 34 H51 V49 Q31 62 8 49Z', '#6a8d8f')
      + p('M33 35 H51 V49 Q43 56 31 56 L27 53Z', '#416b77', 'none')
      + e(29, 34, 21, 10, '#bec8b3') + e(29, 34, 17, 6, '#584737')
      + l('M14 34 Q17 27 23 32 Q28 37 21 39 M29 31 Q32 23 39 28 Q44 33 37 35 M31 37 Q37 35 42 39 L43 43', ink, 5.8)
      + l('M14 34 Q17 27 23 32 Q28 37 21 39 M29 31 Q32 23 39 28 Q44 33 37 35 M31 37 Q37 35 42 39 L43 43', '#d28d83', 3.4)
      + l('M18 30 L18 33 M33 27 L34 30 M39 38 L38 40 M13 44 V48 L21 51', '#efc1a2', 1.6),
  },
  bait_bread_paste: {
    name: 'Bread Paste Bait',
    description: 'A soft ball of pale bread dough nestled in an open blue cloth with a small pinched portion.',
    art: p('M7 35 L17 20 L28 26 L45 20 L57 36 L52 52 L34 57 L12 49Z', '#719395')
      + p('M7 35 L28 43 L57 36 L52 52 L34 57 L12 49Z', '#94aeb0')
      + p('M17 37 Q11 28 20 18 Q29 8 42 17 Q53 23 48 37 Q40 47 26 43Z', '#d8c9a1')
      + p('M20 28 Q19 18 31 17 Q40 16 44 24 Q31 19 27 31Z', '#f6e4bb', 'none')
      + p('M38 31 Q45 29 48 32 L46 39 L39 43 L29 42 Q40 39 38 31Z', '#b19a71', 'none')
      + l('M26 32 Q29 27 34 31', '#b6a078', 2)
      + p('M7 35 L29 45 L18 51 L11 47Z M57 36 L41 46 L52 52Z', '#b1c4b8')
      + e(35, 50, 6, 4, '#e5d5ad') + l('M33 48 L37 48', '#fff0ce', 1.8),
  },
  bait_bright_lure: {
    name: 'Bright Spoon Lure',
    description: 'A polished silver fishing spoon with a copper edge, a red accent, and a hanging hook.',
    art: l('M33 40 L36 48 Q39 58 47 53 Q51 49 46 44 L46 50', ink, 5)
      + l('M33 40 L36 48 Q39 58 47 53 Q51 49 46 44 L46 50', '#bdcbd0', 2.7)
      + p('M46 44 L46 50 L42 47Z', '#dce4d8', ink, 1.2)
      + e(24, 11, 4, 5, 'none', '#c6bf9d', 2.4)
      + p('M25 14 C9 21 12 45 28 45 C45 45 47 21 30 14Z', '#c28f4c')
      + p('M25 16 C13 23 16 41 27 42 C40 43 43 24 29 16Z', '#acbbc0')
      + p('M25 17 Q14 29 24 38 Q20 25 31 21Z', '#f5f4da', 'none')
      + p('M33 20 Q43 30 33 39 L29 42 L27 37Z', '#6f8e9f', 'none')
      + p('M17 29 Q24 34 38 29 L38 34 Q26 40 17 34Z', '#bd4d3b', ink, 1.5)
      + gleam(44, 16, '#e9faff'),
  },
  angling_rod: {
    name: 'Angling Rod',
    description: 'A simple knobbled hazel fishing rod with a cork grip and a loose line ending in a hook.',
    art: l('M11 56 Q26 29 42 8', ink, 6)
      + l('M11 56 Q26 29 42 8', '#b68a4f', 3.3)
      + l('M42 8 Q51 22 49 45 Q49 53 55 50 L56 46', '#d3cfaa', 1.8)
      + p('M10 53 L18 39 L23 42 L15 57Z', '#b78b55')
      + l('M14 49 L19 51 M17 44 L21 46', '#e0bb7b', 1.7)
      + l('M22 35 L25 37 M30 24 L33 26 M37 14 L39 16', '#6e502f', 3.4)
      + c(26, 36, 3, 'none', '#c9b889', 1.8)
      + p('M56 46 L56 50 L52 48Z', '#adbec1', ink, 1.2),
  },
  ash_rod: {
    name: 'Ash Rod',
    description: 'A pale, springy ash fishing rod bowed at its tip, with a small wooden reel and a dangling bobber.',
    art: l('M9 55 Q26 21 40 9 Q46 4 50 13', ink, 5.8)
      + l('M9 55 Q26 21 40 9 Q46 4 50 13', '#d2bd86', 3.1)
      + l('M50 13 Q51 25 48 42', '#d8dcc4', 1.7)
      + p('M8 53 L14 40 L20 43 L14 57Z', '#8d6c42')
      + l('M12 50 L16 52 M15 45 L18 47', '#d4b47b', 1.7)
      + c(22, 41, 6, '#9d7845') + c(22, 41, 3.3, '#d4b16c', ink, 1.6)
      + l('M22 41 L27 44', '#f2daa3', 2)
      + l('M27 25 L30 27 M36 14 L38 16', '#928159', 2.8)
      + p('M48 39 Q43 43 45 48 L49 49 Q53 43 48 39Z', '#e1d8b8')
      + p('M45 45 L50 46 L49 49 H46Z', '#b95544', ink, 1.3),
  },
  river_wardens_rod: {
    name: 'River Warden’s Rod',
    description: 'A fine dark fishing rod with forest-green bindings, a large brass reel, and a silver hook.',
    art: l('M9 56 Q29 22 48 7', ink, 6.4)
      + l('M9 56 Q29 22 48 7', '#8d6940', 3.3)
      + l('M48 7 Q57 22 53 41 Q51 50 56 48 L57 43', '#b4c9bf', 1.8)
      + p('M7 53 L16 39 L22 43 L13 58Z', '#3f7960')
      + l('M11 50 L16 53 M14 45 L19 48', '#9bbb76', 1.8)
      + p('M20 34 L26 37 L23 42 L17 39Z', '#d4ac53')
      + c(29, 41, 8, '#ba8a37') + c(29, 41, 5, '#6b785e', '#efd082', 2)
      + l('M29 36 V46 M24 41 H34 M29 41 L38 46', '#d9b362', 1.8)
      + c(38, 46, 2.3, '#e8c574', ink, 1.5)
      + l('M29 25 L32 28 M38 15 L41 18', '#6aa37c', 3)
      + p('M57 43 L57 48 L53 45Z', '#d5e4dc', ink, 1.1),
  },

  plain_pick: {
    name: 'Plain Pick',
    description: 'A bronze double-pointed pick on a rough wooden haft with a simple leather grip.',
    art: p('M11 52 L34 18 L40 22 L18 57 L12 58Z', '#a77b43')
      + l('M16 51 L34 24', '#dbb57c', 2.6)
      + p('M11 51 L16 45 L22 49 L18 57 L13 58Z', '#6b4d33')
      + l('M14 51 L19 54', '#ba915d', 2)
      + p('M8 22 Q20 8 34 12 Q48 15 56 34 Q42 23 32 22 Q20 19 8 22Z', '#b98545')
      + p('M13 18 Q24 10 35 15 Q47 19 52 28 Q36 16 13 18Z', '#e2b574', 'none')
      + p('M29 13 L36 15 L35 25 L28 23Z', '#91632f')
      + l('M31 16 L30 21', '#efc68a', 2),
  },
  iron_pick: {
    name: 'Iron Pick',
    description: 'A heavy grey iron pick with a curved spike, a blunt rear face, and a reinforced ash handle.',
    art: p('M11 53 L32 17 L39 21 L18 57 L13 58Z', '#997041')
      + l('M16 50 L32 25', '#ceb07b', 2.4)
      + p('M13 49 L18 42 L24 46 L18 56 L13 58 L10 55Z', '#67675b')
      + p('M8 13 L17 8 L35 15 Q54 20 56 41 Q47 25 34 24 L12 24Z', '#858f92')
      + p('M10 14 L18 11 L35 18 Q47 21 52 31 Q40 21 33 21 L13 21Z', '#c5ccc5', 'none')
      + p('M28 13 L37 16 L36 28 L27 25Z', '#596c76')
      + l('M31 17 L30 23 M14 51 L18 53', '#acbabe', 2.1)
      + c(32, 20, 1.5, '#e2dfc8', 'none'),
  },
  silversteel_pick: {
    name: 'Silversteel Pick',
    description: 'A bright blue-white pick with swept steel points, a gilded socket, and blue wrapped grip.',
    art: p('M10 52 L32 17 L39 22 L17 57 L11 58Z', '#557b8d')
      + l('M17 47 L32 25', '#b6d9de', 2.6)
      + p('M9 52 L17 41 L23 45 L16 58Z', '#3e6079')
      + l('M13 47 L18 51 M16 43 L21 47', '#c2a455', 2.3)
      + p('M6 24 L17 10 L33 11 L47 16 L57 34 L42 24 L32 21 L18 19Z', '#aad8e6')
      + p('M8 23 L19 13 L33 14 L45 19 L53 28 L40 21 L31 18 L18 17Z', '#f0f6e3', 'none')
      + p('M29 10 L38 13 L37 26 L28 23Z', '#c6a047')
      + l('M32 13 L31 21', '#ffe7a0', 2.5) + c(33, 18, 2, '#4c8aa8', ink, 1.3)
      + p('M9 53 L14 57 L11 59 L7 56Z', '#d9b662', ink, 1.8),
  },
  plain_hatchet: {
    name: 'Plain Hatchet',
    description: 'A short wooden hatchet with a rounded bronze cutting head and a wrapped lower grip.',
    art: p('M16 54 L33 13 L40 16 L23 57Z', '#a47840')
      + l('M22 49 L35 20', '#d6ad71', 2.6)
      + p('M16 51 L19 43 L26 46 L23 57 L18 58Z', '#725034')
      + p('M31 13 L40 15 L42 27 L31 30 Q21 31 11 25 Q12 13 21 7 Q23 14 31 13Z', '#b88040')
      + p('M21 8 Q15 14 14 23 L20 25 Q19 17 24 14Z', '#e4ba78', 'none')
      + p('M31 14 L39 16 L38 27 L30 28Z', '#916438')
      + c(34, 21, 2, '#dabb7f', ink, 1.5) + l('M19 49 L24 51', '#bca178', 1.8),
  },
  iron_hatchet: {
    name: 'Iron Hatchet',
    description: 'A workmanlike iron hatchet with a broad squared edge, hammer poll, and dark wood haft.',
    art: p('M14 53 L30 13 L37 17 L21 57 L15 58Z', '#8f663d')
      + l('M20 48 L31 22', '#c4a16c', 2.4)
      + p('M16 14 L30 15 L38 12 L51 9 L56 28 L48 35 L36 28 L27 27 L16 23Z', '#78878c')
      + p('M38 14 L49 12 L53 26 L47 31 L44 29 Q44 22 38 14Z', '#c4ceca', 'none')
      + p('M27 14 L35 16 L33 29 L25 26Z', '#4f626b')
      + l('M29 18 L28 24 M19 17 L24 18', '#aebbb9', 2.2)
      + p('M13 51 L17 43 L24 46 L21 57 L15 58Z', '#636c63')
      + l('M17 50 L22 52', '#a7b5a3', 1.8),
  },
  silversteel_hatchet: {
    name: 'Silversteel Hatchet',
    description: 'A refined blue-white steel hatchet with a sweeping hooked blade and gilt ferrule.',
    art: p('M12 53 L32 14 L39 18 L20 58Z', '#517a86')
      + l('M20 46 L33 23', '#b4d8d7', 2.4)
      + p('M28 13 L39 16 Q44 17 50 7 L57 26 Q53 38 39 38 Q41 31 34 27 L24 23 L16 23 L20 13Z', '#abd9e5')
      + p('M50 9 L54 25 Q51 33 42 35 Q47 26 42 19Z', '#eff8ed', 'none')
      + p('M28 12 L36 15 L33 29 L25 25Z', '#c79d43')
      + l('M30 16 L28 23', '#ffe5a5', 2.5)
      + p('M12 50 L18 41 L25 45 L20 57 L14 58 L10 55Z', '#365b74')
      + l('M16 46 L22 49 M13 51 L20 54', '#d0ad5c', 2.4)
      + c(30, 20, 2, '#588da4', ink, 1.3),
  },
  plain_knife: {
    name: 'Plain Knife',
    description: 'A compact bronze utility knife with a broad leaf-point blade and a riveted wooden handle.',
    art: p('M25 34 Q29 15 54 8 Q55 31 34 43Z', '#b58a4a')
      + p('M29 33 Q35 19 52 11 L35 34Z', '#e2ba78', 'none')
      + p('M52 11 Q48 30 34 40 L30 36Z', '#8f6937', 'none')
      + p('M24 32 L36 42 L32 46 L20 36Z', '#785532')
      + p('M21 36 L31 44 L18 57 Q13 60 7 53 Q6 50 10 46Z', '#a67440')
      + l('M13 48 L22 41', '#d5a36b', 2.3)
      + c(14, 51, 2, '#e6c181', ink, 1.4) + c(23, 43, 1.8, '#d4b176', ink, 1.3),
  },
  iron_knife: {
    name: 'Iron Knife',
    description: 'A straight iron working knife with a clipped point, short guard, and dark leather handle.',
    art: p('M23 36 L44 9 L56 6 L53 20 L33 44Z', '#8f9c9d')
      + p('M26 35 L46 11 L54 9 L48 20 L29 39Z', '#cbd4cc', 'none')
      + p('M29 39 L49 18 L53 13 V20 L33 44Z', '#5e7580', 'none')
      + p('M22 32 L38 45 L34 49 L18 36Z', '#677e87')
      + l('M22 35 L34 45', '#bfcbc8', 2)
      + p('M20 38 L30 46 L18 58 Q11 59 7 52Z', '#69503b')
      + l('M16 43 L24 49 M12 48 L20 54', '#b19065', 2.3)
      + p('M8 50 L17 57 L14 60 L6 54Z', '#a8b7b5'),
  },
  silversteel_knife: {
    name: 'Silversteel Knife',
    description: 'A curved blue-white steel skinning knife with a gilded guard and blue wrapped handle.',
    art: p('M22 35 L39 16 Q48 11 54 6 Q59 22 48 33 L33 44Z', '#b6dfec')
      + p('M26 35 L42 19 L53 10 Q54 22 46 29 L30 40Z', '#f1f9ec', 'none')
      + p('M30 40 L47 29 Q54 23 55 17 Q57 29 47 35 L33 44Z', '#77afc8', 'none')
      + p('M20 32 L36 42 L37 47 L31 47 L19 38 L16 38Z', '#d1a54d')
      + l('M22 35 L33 43', '#ffe6a4', 2.4)
      + p('M19 39 L29 46 L18 57 Q12 60 8 54 Q7 51 11 47Z', '#416b82')
      + l('M16 44 L24 49 M12 49 L20 54', '#9dc4c9', 2.1)
      + p('M8 51 L16 57 L13 60 L6 55Z', '#d7b765'),
  },
  plain_sickle: {
    name: 'Plain Sickle',
    description: 'A simple bronze reaping sickle, its deep crescent blade fitted to a stout wooden grip.',
    art: p('M15 53 L30 33 L37 38 L22 57 Q17 60 13 56Z', '#a77842')
      + l('M20 50 L30 38', '#d6ad72', 2.5)
      + p('M28 35 C13 21 23 6 37 7 Q53 7 55 23 Q48 14 40 16 C29 16 27 24 36 31 L38 35 L33 41Z', '#b78946')
      + p('M29 32 Q16 19 29 11 Q44 3 53 18 Q45 10 35 14 Q23 20 32 30Z', '#e5bd79', 'none')
      + p('M28 33 L36 36 L33 42 L25 38Z', '#765336')
      + c(31, 37, 1.8, '#e2bb72', ink, 1.4),
  },
  iron_sickle: {
    name: 'Iron Sickle',
    description: 'A long curved iron sickle with a narrow point, sturdy tang, and dark leather-bound handle.',
    art: p('M11 52 L30 29 L36 35 L19 57 Q14 59 10 55Z', '#977449')
      + l('M18 49 L28 37', '#c5a57a', 2.5)
      + p('M29 32 Q16 20 26 10 Q36 1 49 10 Q57 16 56 31 L49 24 Q49 15 39 14 Q28 12 29 22 L36 29 L36 36Z', '#8b989a')
      + p('M29 27 Q22 19 28 13 Q37 5 47 12 Q52 16 53 24 L49 20 Q46 11 36 13 Q26 16 31 24Z', '#cdd6cd', 'none')
      + p('M27 29 L36 34 L32 41 L24 35Z', '#536b74')
      + p('M13 46 L21 52 L17 58 L9 54Z', '#656355')
      + l('M14 49 L19 53 M28 33 L32 36', '#aebbb3', 1.8),
  },
  silversteel_sickle: {
    name: 'Silversteel Sickle',
    description: 'An elegant silversteel crescent with a long curling point, gold mount, and blue grip.',
    art: p('M10 53 L29 31 L36 36 L19 58 L12 59Z', '#416a80')
      + l('M16 49 L25 39', '#a6ccd6', 2.5)
      + p('M28 35 Q13 24 20 13 Q27 3 42 6 Q57 9 58 26 Q51 20 46 19 Q47 11 36 12 Q27 12 26 19 Q27 25 37 27 L37 34 L33 40Z', '#b3deeb')
      + p('M29 30 Q18 23 23 15 Q30 4 43 9 Q53 12 55 21 L49 18 Q46 9 36 11 Q24 12 24 21Z', '#f4f9e9', 'none')
      + p('M26 31 L36 34 L33 42 L23 38Z', '#cda44e')
      + l('M28 34 L33 36 M14 48 L20 52 M11 53 L17 57', '#f0d38b', 2.2)
      + c(30, 36, 1.8, '#5b93ad', ink, 1.2),
  },
  crate: {
    name: 'Reward Crate',
    description: 'A sturdy three-quarter-view wooden reward crate with riveted iron straps and crossed lid braces.',
    art: p('M7 19 L35 8 L57 20 V47 L29 58 L7 46Z', '#9e6a37')
      + p('M7 19 L29 30 L57 20 L35 8Z', '#ce9d58')
      + p('M29 30 L57 20 V47 L29 58Z', '#79502e')
      + l('M8 28 L29 39 L56 29 M8 37 L29 48 L56 38 M18 15 L41 26 M44 12 L18 25', '#68482c', 1.8)
      + p('M11 17 L16 15 L38 27 V54 L33 56 V29Z M42 11 L47 14 L20 25 V52 L15 49 V22Z', '#717b75')
      + l('M13 18 L35 29 V53 M19 26 V49', '#a9b6aa', 1.7)
      + c(35, 37, 1.5, '#d6d4b5', 'none') + c(35, 48, 1.5, '#d6d4b5', 'none')
      + c(18, 33, 1.4, '#d6d4b5', 'none') + c(18, 44, 1.4, '#d6d4b5', 'none')
      + l('M24 32 L24 41 M43 43 L52 40', '#bb8d4b', 2),
  },
  sunken_crate: {
    name: 'Sunken Crate',
    description: 'A warped, half-open sea-worn crate with green weed, pale barnacles, and dripping water.',
    art: p('M9 23 L35 14 L55 24 L52 49 L27 56 L8 44Z', '#70816a')
      + p('M9 23 L27 33 L55 24 L35 14Z', '#354d43')
      + p('M27 33 L55 24 L52 49 L27 56Z', '#4a6657')
      + l('M9 32 L27 42 L54 33 M9 40 L27 50 L53 42', '#283e36', 2)
      + p('M7 17 L33 7 L55 16 L53 22 L28 27 L7 22Z', '#819477')
      + l('M13 18 L34 11 L48 17 M16 23 L40 15', '#adad7d', 2)
      + p('M14 26 L19 28 L18 49 L13 47Z M44 28 L49 26 L47 51 L42 52Z', '#567d7b')
      + l('M17 29 L16 44 M46 31 L44 48', '#93aaa0', 1.7)
      + p('M30 12 Q38 11 35 22 Q30 30 35 39 Q24 37 28 26 Q32 19 27 19Z M48 18 Q56 20 53 31 Q47 38 51 44 Q43 43 47 32 Q51 26 45 25Z', '#669a4b')
      + c(15, 40, 4.3, '#c3c7aa') + c(15, 40, 1.7, '#596d64', 'none')
      + c(22, 45, 3.5, '#ddd5ae') + c(22, 45, 1.3, '#6b7764', 'none')
      + p('M37 53 Q32 59 37 60 Q42 59 37 53Z M54 46 Q51 51 54 53 Q58 52 54 46Z', '#71b7bf', ink, 1.5),
  },
  gift_box: {
    name: 'Gift Box',
    description: 'A berry-red wrapped gift with a gold ribbon running around the box and a large looped bow.',
    art: p('M9 25 L34 17 L55 28 V49 L30 58 L9 46Z', '#b94e50')
      + p('M30 36 L55 28 V49 L30 58Z', '#803b48')
      + p('M8 23 L33 15 L57 27 V33 L30 42 L8 29Z', '#d77567')
      + p('M8 23 L33 15 L57 27 L30 36Z', '#e38979')
      + p('M19 20 L25 18 L47 30 V52 L41 54 V33Z M43 20 L49 23 L22 32 V53 L16 50 V29Z', '#e8bd62')
      + l('M21 21 L44 32 V50 M19 34 V48', '#fff0a1', 2)
      + p('M32 19 Q13 19 15 9 Q20 3 31 14 Q32 3 42 7 Q50 15 32 19Z', '#d7a94d')
      + p('M28 15 Q19 8 19 12 Q19 16 28 15Z M35 15 Q42 9 42 12 Q41 15 35 15Z', '#8d533c', ink, 1.2)
      + p('M29 16 L35 16 L39 23 L31 21 L26 27 L27 20Z', '#f2cf77') + c(32, 18, 3, '#fff0ab', ink, 1.6),
  },
  trophy: {
    name: 'Fish Trophy',
    description: 'A proud green-and-gold mounted fish fixed to a carved dark wooden trophy plaque.',
    art: p('M11 15 Q32 5 53 15 L58 25 L55 47 Q32 59 9 47 L6 25Z', '#765038')
      + p('M14 18 Q32 10 50 18 L54 26 L51 44 Q32 54 13 44 L10 26Z', '#a47648')
      + l('M15 20 Q31 13 47 20 M15 44 Q31 51 48 44', '#c99c5a', 2)
      + p('M22 27 L28 17 L36 25 M29 40 L34 47 L40 39', '#c4a354')
      + p('M9 33 Q20 19 40 29 L54 22 L51 32 L56 40 L41 36 Q21 48 9 33Z', '#6e9777')
      + p('M12 34 Q25 37 42 32 L41 37 Q25 45 12 34Z', '#d4c47f', 'none')
      + l('M22 27 Q27 32 24 39 M31 28 L34 31 M34 34 L37 37', '#3e6553', 1.8)
      + c(17, 31, 2.6, '#e9d48b') + c(17, 31, 1.2, '#263b30', 'none')
      + l('M11 36 L16 36', '#3c553f', 1.7),
  },
  quest_item: {
    name: 'Sealed Quest Parcel',
    description: 'A thick brown-paper parcel crossed with twine and secured by a red wax seal.',
    art: p('M8 18 L39 11 L56 23 V46 L24 56 L8 44Z', '#bc9661')
      + p('M8 18 L24 30 L56 23 L39 11Z', '#ddba7f')
      + p('M24 30 L56 23 V46 L24 56Z', '#9c794b')
      + l('M8 20 L22 27 M28 51 L52 44 M11 40 L20 47', '#e4c691', 1.8)
      + p('M17 16 L23 15 L40 26 V51 L35 53 V28Z M46 16 L50 19 L17 27 V51 L13 48 V24Z', '#dfd1a5', ink, 1.3)
      + l('M38 29 L38 48 M16 29 V46', '#f4e4ba', 1.5)
      + p('M30 31 L33 27 L39 28 L43 31 L42 37 L38 41 L32 39 L29 35Z', '#b64c40')
      + c(36, 34, 4, '#d56d55', '#7b362e', 1.7) + p('M36 31 L38 34 L36 37 L34 34Z', '#eaa27b', 'none'),
  },
  key: {
    name: 'Ornate Iron Key',
    description: 'A long iron key with an open trefoil bow, a ridged collar, and two deep teeth.',
    art: p('M25 28 L31 34 L16 50 L11 45Z', '#9baeb2')
      + p('M16 42 L23 49 L19 53 L16 50 L13 54 L8 49Z', '#778f99')
      + cut('M27 31 Q19 27 23 20 Q18 12 27 11 Q30 3 37 9 Q45 5 48 12 Q57 13 53 21 Q56 29 47 30 Q44 38 37 32 Q32 37 27 31Z M31 27 Q26 25 29 21 Q24 17 29 16 Q33 11 36 16 Q42 12 43 17 Q49 18 45 22 Q47 27 42 25 Q40 30 36 26 Q33 31 31 27Z', '#839ba2')
      + l('M27 13 Q29 9 33 12 M42 12 Q46 11 47 16 M28 37 L16 49', '#d5e1d7', 2.4)
      + p('M22 30 L30 38 L27 41 L19 33Z', '#aec1bf') + l('M22 33 L27 38', '#e8e8ce', 1.7),
  },
  letter: {
    name: 'Sealed Letter',
    description: 'A folded cream parchment letter with overlapping flaps and a round burgundy wax seal.',
    art: p('M7 17 L48 11 L57 43 L16 54 L8 44Z', '#c7b68e')
      + p('M7 17 L48 11 L57 43 L15 51Z', '#ead9ad')
      + p('M15 48 L27 29 L38 28 L54 42Z', '#f4e4bc')
      + p('M7 17 L48 11 L34 34 L27 36Z', '#fff0c8')
      + l('M11 20 L29 33 L33 31 L46 15 M18 45 L25 34 M42 32 L50 39', '#ba9a6b', 1.8)
      + p('M29 30 L35 29 L39 33 L38 39 L32 43 L27 39 L26 34Z', '#a74448')
      + c(32, 35, 4, '#d17365', '#80323a', 1.6)
      + p('M32 32 Q29 34 32 38 Q36 35 32 32Z', '#f0b38b', 'none'),
  },
  coins: {
    name: 'Gold Coins',
    description: 'A small pile of warm gold coins, with two stacked columns and one face-on coin.',
    art: coin(18, 47, 11, 5) + coin(19, 42, 11, 5) + coin(19, 37, 11, 5)
      + coin(43, 48, 12, 5) + coin(43, 43, 12, 5) + coin(43, 38, 12, 5) + coin(43, 33, 12, 5)
      + e(28, 29, 12, 15, '#ab772b') + e(25, 28, 12, 15, '#e7b94c')
      + e(25, 28, 8, 11, '#c79738', '#ffe18c', 2)
      + p('M25 20 L29 28 L25 36 L21 28Z', '#f4d77a', '#946728', 1.5)
      + l('M16 24 Q18 17 23 16 M10 42 L15 44 M38 47 L45 47', '#fff0a5', 2),
  },

  old_boot: {
    name: 'Old Boot',
    description: 'A battered leather boot with a torn cuff, broken laces, a hole, and a flapping sole.',
    art: p('M15 10 L21 13 L26 9 L31 13 L37 10 L35 34 Q38 40 49 40 Q56 40 57 49 L52 55 H10 L8 49 L13 35Z', '#78543b')
      + p('M15 10 L21 13 L26 9 L31 13 L37 10 L36 20 L15 20Z', '#a17a52')
      + p('M32 23 L35 21 L34 36 Q37 43 49 43 L53 48 L30 48 L25 40Z', '#543c2c', 'none')
      + p('M9 48 Q28 54 56 48 L56 54 L34 58 L10 55Z', '#514539')
      + l('M12 51 Q27 56 46 53', '#b19868', 2.1)
      + l('M20 24 L29 27 M19 29 L28 32 M18 35 L25 37 M24 30 L30 34 L35 31', '#c7b283', 2.2)
      + p('M16 40 L19 38 L23 42 L21 46 L16 45Z', '#2e2c24')
      + l('M39 43 L44 44', '#b08a5c', 2.4),
  },
  waterlogged_hat: {
    name: 'Waterlogged Hat',
    description: 'A sodden floppy felt hat with a collapsed crown, stained brim, and dripping blue water.',
    art: p('M7 39 Q6 31 19 32 L23 16 Q30 8 40 17 L44 32 Q59 31 58 39 L52 48 L37 47 L23 51 L9 46Z', '#7f8263')
      + p('M20 34 L23 16 Q29 11 33 16 L31 25 L40 30 L43 34Z', '#a0a181', 'none')
      + p('M33 16 Q39 14 40 20 L44 33 L35 37 L31 25Z', '#5d715e', 'none')
      + p('M20 30 Q32 36 43 30 L44 36 Q31 44 18 35Z', '#7c5e3f')
      + l('M11 39 Q17 35 21 40 M26 44 Q37 38 50 40', '#b1b08b', 2.2)
      + p('M40 43 Q44 39 50 40 L51 47 L43 48Z', '#526f5e', 'none')
      + p('M13 48 Q8 55 13 57 Q18 55 13 48Z M48 50 Q44 56 48 58 Q52 56 48 50Z', '#7db4bd', ink, 1.5),
  },
  bent_horseshoe: {
    name: 'Bent Horseshoe',
    description: 'A twisted rusty horseshoe with one inward-folded arm and uneven, worn nail holes.',
    art: p('M12 13 L22 16 L20 35 Q20 47 30 48 Q40 50 42 40 L41 30 L30 28 L32 18 L48 20 Q54 23 53 32 L52 42 Q50 60 29 58 Q7 57 9 34Z', '#817b65')
      + p('M17 17 L16 37 Q16 51 28 53 Q46 57 48 42 L48 30 L44 26 L33 25', 'none', '#b2b29a', 2.6)
      + p('M11 25 L20 24 L19 31 L10 34Z M43 21 L49 22 L52 29 L45 29Z M21 49 L28 53 L26 57 L19 54Z', '#ae6c3f', 'none')
      + p('M12 37 H17 V42 H12Z M29 51 L34 52 L33 57 L28 56Z M45 36 H50 V41 H45Z M34 21 H39 V26 H34Z', '#3d4238', 'none')
      + l('M39 26 L45 31 L42 35', '#514b39', 2),
  },
  rusty_bucket: {
    name: 'Rusty Bucket',
    description: 'A dented iron pail with a wire handle, orange rust patches, and a jagged hole near the base.',
    art: l('M13 29 Q7 7 30 7 Q53 7 49 30', ink, 5) + l('M13 29 Q7 7 30 7 Q53 7 49 30', '#9c9b80', 2.6)
      + p('M10 27 L52 24 L49 48 L43 54 L20 56 L14 49Z', '#7a867c')
      + p('M35 28 L52 25 L49 48 L43 54 L31 55 L29 50Z', '#54665f', 'none')
      + e(31, 26, 22, 8, '#a2ad9b') + e(31, 26, 17, 4.5, '#3f5147')
      + p('M15 33 L22 32 L25 38 L21 44 L15 42Z M36 42 L43 37 L49 40 L47 50 L40 54 L34 49Z', '#b87948', 'none')
      + p('M40 44 L44 42 L46 47 L42 50 L38 48Z', '#293c34')
      + l('M17 34 L19 46 M23 51 L30 52', '#bdc1a4', 2.4)
      + c(13, 29, 2, '#d1b486', ink, 1.5) + c(50, 28, 2, '#cba674', ink, 1.5),
  },
  tangle_of_line: {
    name: 'Tangle of Line',
    description: 'A disorderly coil of old fishing line tangled around a broken wooden bobbin and a hook.',
    art: p('M16 12 L25 8 L32 15 L27 20 L43 38 L47 34 L54 41 L45 49 L37 42 L41 38 L24 21 L20 25 L13 18Z', '#98764c')
      + l('M20 14 L46 43', '#c5a877', 2)
      + l('M16 48 C1 36 9 20 26 22 C49 24 46 48 30 49 C9 52 9 31 24 30 C43 27 48 47 35 54 C22 63 18 37 39 24 C57 14 59 45 43 47 C28 49 24 33 36 31 Q48 28 50 37', ink, 5)
      + l('M16 48 C1 36 9 20 26 22 C49 24 46 48 30 49 C9 52 9 31 24 30 C43 27 48 47 35 54 C22 63 18 37 39 24 C57 14 59 45 43 47 C28 49 24 33 36 31 Q48 28 50 37', '#a1b8ab', 2.7)
      + l('M50 37 L53 48 Q56 57 59 51 L57 47', '#c5cfbf', 2.3)
      + p('M57 47 L59 50 L54 50Z', '#c5cfbf', ink, 1.2),
  },
  cart_wheel_spoke: {
    name: 'Cart Wheel Spoke',
    description: 'A snapped wooden wagon spoke with a blocky hub end and a splintered narrow tip.',
    art: p('M9 44 L17 37 L23 39 L43 16 L42 10 L48 6 L53 10 L57 17 L53 22 L47 21 L29 45 L29 51 L19 58 L9 53Z', '#9f7844')
      + p('M17 42 L21 44 L46 16 L47 10 L51 11 L52 16 L27 47 L24 49Z', '#d3ac70', 'none')
      + p('M9 44 L19 49 L29 45 V51 L19 58 L9 53Z', '#735330')
      + l('M13 47 L18 51 L25 48 M28 39 L36 29 M22 43 L27 38', '#573f29', 1.8)
      + p('M42 10 L47 14 L46 7 L50 11 L51 6 L55 15 L53 20 L47 18Z', '#e3c38b')
      + l('M49 11 L51 16', '#8d683b', 1.6),
  },
  soggy_ledger: {
    name: 'Soggy Ledger',
    description: 'A swollen, water-stained account book with wavy pages, a broken clasp, and dripping corners.',
    art: p('M9 16 L41 9 L55 19 L52 49 L24 57 L10 47Z', '#576f60')
      + p('M13 23 L25 31 L52 23 L50 47 Q43 46 39 51 L26 54 L13 46Z', '#c3c3a0')
      + l('M17 33 L26 38 L48 31 M17 39 L26 44 L46 38 M18 45 L26 49 L46 44', '#8d9a7d', 1.8)
      + p('M9 16 L40 8 L56 19 L25 29 L11 25Z', '#78927a')
      + p('M9 16 L16 20 L17 48 L10 46Z', '#405e55')
      + p('M21 17 L35 13 L43 18 L29 23Z', '#a4ac82', '#526e5a', 1.5)
      + p('M37 24 L46 21 L45 31 L40 34 L37 30Z', '#9b8957')
      + p('M24 28 L31 27 L29 34 L33 39 L27 44 L23 40Z M40 45 L47 42 L49 49 L42 52Z', '#6f9b85', 'none')
      + p('M14 49 Q10 55 14 58 Q19 55 14 49Z', '#79bac0', ink, 1.5),
  },
  cracked_jug: {
    name: 'Cracked Jug',
    description: 'A chipped terracotta jug with a missing rim fragment and a dark branching crack down its belly.',
    art: p('M42 22 Q57 17 58 31 Q58 44 45 45 L42 38 Q51 38 51 31 Q51 26 45 29Z', '#a06c48')
      + p('M22 12 L27 15 L31 10 L34 16 L42 12 L40 25 Q50 30 48 46 Q46 57 30 58 Q13 56 12 45 Q11 32 23 25Z', '#b27b50')
      + p('M34 26 Q47 29 46 44 Q47 55 32 55 L25 52 Q38 46 34 26Z', '#805538', 'none')
      + p('M22 12 L27 15 L31 10 L34 16 L42 12 L40 21 Q29 26 22 21Z', '#d5a675')
      + l('M25 17 L29 19 L31 15 M36 19 L39 17', '#6c4a32', 1.7)
      + l('M31 24 L27 32 L34 38 L29 45 L33 55 M34 38 L41 36 M27 32 L21 31', '#493529', 2.4)
      + l('M18 36 Q15 43 20 48', '#e0b786', 2.6),
  },
  river_weed: {
    name: 'River Weed',
    description: 'A dripping bundle of long ribbon-like river plants, joined at a tangle of pale roots.',
    art: p('M30 48 Q12 40 15 23 Q18 12 10 8 Q27 8 24 25 Q19 37 32 44Z', '#4a8a60')
      + p('M29 47 Q36 34 29 21 Q21 10 33 6 Q29 14 38 22 Q46 37 34 48Z', '#76a96c')
      + p('M33 48 Q42 36 43 21 Q42 14 54 12 Q47 19 50 26 Q51 42 37 50Z', '#397a5a')
      + p('M28 49 Q11 46 8 33 Q19 35 18 39 L31 43Z', '#639c66')
      + p('M37 49 Q45 39 56 37 Q55 49 39 53Z', '#79a86e')
      + l('M32 45 Q38 31 33 22 M19 17 Q21 26 18 31 M46 25 Q47 34 42 42', '#b7c78d', 1.8)
      + l('M30 47 L25 55 L18 57 M32 48 L33 58 M36 48 L40 55 L47 56', '#bdac77', 2.4)
      + p('M12 44 Q9 49 12 52 Q16 49 12 44Z', '#81bbc0', ink, 1.4),
  },
  lost_bobber: {
    name: 'Lost Bobber',
    description: 'A weathered red-and-cream fishing float with a broken stem, trailing line, and green water stains.',
    art: l('M30 49 Q14 54 19 58 Q25 61 33 56 Q48 49 55 54', '#8ca99e', 2)
      + p('M29 9 L32 5 L34 8 L35 24 H29Z', '#9b7548')
      + p('M29 41 H35 L34 54 L30 57Z', '#8f7149')
      + p('M31 18 Q45 22 44 35 Q43 47 32 49 Q19 46 20 34 Q20 23 31 18Z', '#c2c4a3')
      + p('M20 32 Q32 37 44 32 Q45 44 32 49 Q19 46 20 32Z', '#ad584b')
      + p('M36 22 Q43 26 44 34 Q43 44 34 47 L29 48 Q39 37 36 22Z', '#685e48', 'none')
      + p('M20 32 Q28 35 35 34 L33 40 L27 38 L26 42 L21 39Z', '#d68b68', 'none')
      + l('M25 27 L24 31', '#ece5bd', 2.7) + p('M36 42 L42 39 L40 45 L35 48Z', '#5e8061', 'none'),
  },
  toll_token: {
    name: 'Toll Token',
    description: 'A worn hexagonal copper toll token with a bridge relief and a square punch hole.',
    art: cut('M20 8 L43 10 L57 28 L51 49 L30 58 L10 45 L7 24Z M25 15 L32 16 L31 22 L25 21Z', '#735f42')
      + cut('M18 7 L41 9 L54 27 L48 47 L28 55 L8 42 L6 22Z M25 15 L32 16 L31 22 L25 21Z', '#aa8858')
      + cut('M20 12 L38 14 L48 28 L43 43 L28 49 L14 39 L12 24Z M25 15 L32 16 L31 22 L25 21Z', '#8e7850', 2, '#d0b47c')
      + p('M16 32 L22 25 H40 L45 32 V39 H37 V33 Q31 26 25 33 V39 H17Z', '#c5a56b', '#66583a', 1.8)
      + p('M11 22 L16 19 L18 24 L14 29Z M41 42 L46 38 L45 45 L39 48Z', '#538371', 'none')
      + l('M19 43 L27 48', '#d9bb83', 1.8),
  },
  chewed_oar: {
    name: 'Chewed Oar',
    description: 'A weathered wooden oar with a wide, gnawed paddle, broken edge, and exposed pale bite marks.',
    art: p('M8 53 L31 30 L31 21 L49 6 L56 10 L54 16 L58 18 L53 22 L54 28 L49 28 L46 34 L38 35 L14 58Z', '#a2804d')
      + p('M32 30 L33 23 L49 10 L52 12 L48 19 L51 22 L48 26 L45 30 L38 32Z', '#c8a76e', 'none')
      + l('M13 52 L38 28 L49 15', '#e1c790', 2.7)
      + p('M54 16 L58 18 L53 22 L54 28 L49 28 L46 34 L43 31 L47 25 L49 25 L48 21 L52 18Z', '#e3c891')
      + l('M49 25 L51 26 M52 18 L54 19 M35 27 L43 19', '#7d613b', 1.7)
      + p('M10 51 L17 56 L14 59 L7 55Z', '#798574'),
  },

  junk: {
    name: 'Junk',
    description: 'A little pile of broken wood, a rusty bent nail, a pottery shard, and a chipped metal gear fragment.',
    art: p('M6 40 L11 31 L31 41 L45 37 L55 44 L50 55 L31 51 L13 56Z', '#927147')
      + p('M6 40 L13 42 L16 38 L19 45 L25 43 L31 51 L13 56Z', '#bf9b63')
      + l('M16 49 L24 48 M38 43 L48 46', '#5f4b32', 1.7)
      + p('M17 31 L19 22 L25 24 L28 17 L35 21 L33 27 L40 31 L35 39 L28 35 L24 42 L17 38 L20 33Z', '#7c8c80')
      + p('M24 29 L29 27 L33 31 L29 35 L24 34Z', '#354c43')
      + p('M35 29 L50 22 L56 36 L50 42 L43 39 L39 43Z', '#b77955')
      + p('M39 29 L49 26 L52 34 L48 37Z', '#d3a276', 'none')
      + l('M14 32 L9 21 L16 14 L21 19 M13 12 L20 19', ink, 5.5)
      + l('M14 32 L9 21 L16 14 L21 19 M13 12 L20 19', '#a77e53', 2.8),
  },
  bundle: {
    name: 'Tied Bundle',
    description: 'A plump sage-green cloth bundle with gathered folds and two knotted fabric corners.',
    art: p('M27 24 Q15 28 10 40 Q6 53 24 57 Q44 62 54 48 Q57 36 37 24Z', '#829773')
      + p('M34 26 Q51 33 51 44 Q51 53 34 56 L25 55 Q40 47 34 26Z', '#536e59', 'none')
      + p('M28 26 Q14 23 15 10 Q24 8 31 21 Q31 8 45 8 Q49 21 36 26Z', '#a8b58b')
      + p('M30 22 L36 21 L39 28 L29 31 L25 27Z', '#c0c49a')
      + l('M20 14 L28 23 M41 13 L35 22 M27 32 Q19 40 19 47 M33 33 L34 45 M39 33 L46 41', '#c4c9a1', 2.3)
      + l('M11 45 Q15 53 24 53', '#9eb38b', 2.5),
  },
  ring: {
    name: 'Blue Gem Ring',
    description: 'A thick gold ring viewed slightly from above, crowned with a faceted sapphire in a claw setting.',
    art: cut('M54 38 A22 20 0 1 1 10 38 A22 20 0 1 1 54 38Z M46 35 A14 12 0 1 1 18 35 A14 12 0 1 1 46 35Z', '#b27d27')
      + cut('M54 35 A22 20 0 1 1 10 35 A22 20 0 1 1 54 35Z M46 35 A14 12 0 1 1 18 35 A14 12 0 1 1 46 35Z', '#e6b84e')
      + e(32, 35, 14, 12, 'none', '#865f28', 2.2)
      + p('M11 31 Q10 48 28 53 Q43 58 53 42 Q49 55 32 57 Q11 57 10 39Z', '#94702b', 'none')
      + l('M16 36 Q17 47 27 49 M42 47 Q48 43 48 37', '#ffe29b', 3)
      + p('M22 24 L20 16 L27 8 L38 8 L45 17 L42 26 L32 32Z', '#d6aa4a')
      + p('M24 16 L29 10 L37 10 L42 17 L39 24 L32 28 L24 23Z', '#377ab8')
      + p('M29 10 L32 17 L24 16Z M29 10 H37 L32 17Z', '#b4e5ee', 'none')
      + p('M32 17 L42 17 L39 24 L32 28Z', '#254b83', 'none')
      + p('M24 16 L32 17 L32 28 L24 23Z', '#5aafd3', 'none')
      + l('M21 16 L25 18 M41 17 L44 17 M31 26 L32 30', '#ffe5a0', 2.5),
  },
  amulet: {
    name: 'Gem Amulet',
    description: 'A warm gold teardrop pendant with a garnet centre, hanging from a linked chain.',
    art: l('M23 30 Q8 19 16 9 Q22 3 32 7 Q42 3 48 9 Q56 19 41 30', ink, 5)
      + l('M23 30 Q8 19 16 9 Q22 3 32 7 Q42 3 48 9 Q56 19 41 30', '#c9a04e', 2.6)
      + l('M16 12 L20 13 M13 19 L18 18 M20 25 L24 22 M44 11 L47 14 M46 18 L51 19 M40 24 L44 27', '#f1d17b', 2)
      + c(32, 29, 5, 'none', '#dbb35b', 3)
      + p('M32 31 Q48 39 47 47 Q46 57 32 59 Q18 57 17 47 Q16 39 32 31Z', '#c6963a')
      + p('M32 36 Q42 41 42 48 L32 54 L22 48 Q22 41 32 36Z', '#a04c59')
      + p('M32 36 L32 46 L22 48 Q22 41 32 36Z', '#e6978b', 'none')
      + p('M32 46 L42 48 L32 54Z', '#6d354d', 'none')
      + l('M20 45 Q19 52 28 55', '#ffe3a0', 2.3) + c(32, 57, 1.5, '#fff0ad', 'none'),
  },
  focus: {
    name: 'Crystal Focus',
    description: 'A small luminous crystal orb cradled on a carved wooden tripod with brass fittings.',
    art: p('M24 39 L20 51 L11 55 L13 58 H29 L32 47 L35 58 H51 L53 55 L44 51 L40 39Z', '#966a3e')
      + p('M35 42 L39 45 L41 54 L49 56 H38Z', '#62462f', 'none')
      + l('M25 44 L23 52 L17 55 M34 48 L36 54', '#d8ac67', 2.3)
      + c(32, 25, 18, '#81b4ca')
      + p('M36 8 Q53 13 49 31 Q44 43 31 43 Q18 42 15 30 Q25 41 36 32 Q45 23 36 8Z', '#477d9b', 'none')
      + p('M23 15 Q31 10 37 16 L35 25 L27 30 L21 23Z', '#b3e0df', 'none')
      + l('M22 17 Q18 21 19 26', '#f4f9db', 3)
      + p('M14 34 Q18 33 22 40 L32 43 L42 40 Q46 33 50 34 L47 43 L39 48 H25 L17 43Z', '#c49b50')
      + l('M19 38 L24 43 L31 45 M44 39 L41 43', '#ffe0a0', 2.2) + gleam(35, 24, '#e5fff1'),
  },
  tool: {
    name: 'Tool Roll',
    description: 'An open leather tool roll holding a small hammer, pliers, and a steel awl, secured with a strap.',
    art: p('M8 24 L49 18 L57 28 L54 52 L16 58 L8 49Z', '#967347')
      + p('M8 24 L14 27 L17 53 L10 49Z', '#c29a63')
      + l('M20 39 L18 14', ink, 5.5) + l('M20 39 L18 14', '#c29a5f', 3)
      + p('M10 10 L24 8 L27 16 L12 19Z', '#9daaa4') + l('M13 12 L22 11', '#d9ddc5', 2)
      + l('M31 39 L30 24 L27 18 L28 9 M35 38 L34 24 L39 17 L37 8', ink, 5.5)
      + l('M31 39 L30 24 L27 18 L28 9 M35 38 L34 24 L39 17 L37 8', '#8b9f9f', 3)
      + c(32, 24, 2.5, '#d5be82', ink, 1.5)
      + p('M43 36 L45 14 L49 8 L50 15 L49 37Z', '#c7d6ce')
      + p('M14 36 L54 30 L54 51 L17 56Z', '#b18b53')
      + l('M25 36 L27 52 M39 34 L40 50', '#765633', 2)
      + p('M9 42 L56 35 L56 41 L10 48Z', '#6d5134')
      + p('M31 38 L41 36 L42 45 L32 47Z', '#c6a65e')
      + l('M35 39 L36 45', '#fff0b0', 2)
      + p('M53 30 Q60 29 59 36 L57 51 Q57 57 52 55 L49 52 L51 36 Q55 34 53 30Z', '#987043')
      + e(55, 32, 4, 3, '#d2ac71')
      + l('M54 32 Q57 30 57 33 M54 39 L53 50', '#654a30', 1.7),
  },
  potion: {
    name: 'Potion',
    description: 'A plain corked bottle of muted grey-pink liquid with a broad base and a soft glass highlight.',
    art: p('M26 10 H38 V23 L44 29 L48 51 Q48 57 32 58 Q16 57 16 51 L20 29 L26 23Z', '#a5aaa2')
      + p('M22 35 Q32 38 42 35 L44 50 Q43 54 32 54 Q21 54 20 50Z', '#b49a9d')
      + p('M35 37 H42 L44 50 Q41 54 32 54 L27 52 Q38 47 35 37Z', '#877880', 'none')
      + e(32, 35, 10, 2.5, '#d8c2bf', 'none')
      + p('M26 6 H38 L36 16 H28Z', '#a58356')
      + l('M29 9 H35', '#ddbf89', 2)
      + p('M24 18 H40 V23 H24Z', '#c1c8b4')
      + l('M25 30 L23 42', '#f6e9d2', 3) + l('M24 48 L27 50', '#e6cbc5', 2.3),
  },
};
