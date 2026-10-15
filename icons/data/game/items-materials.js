// Thousandvale profession materials. Hand-drawn for a transparent 64 × 64 slot.
const INK = '#1a1410';
const P = (d, fill, stroke = INK, width = 2.2) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
const L = (d, color, width = 1.6) => P(d, 'none', color, width);
const E = (x, y, rx, ry, fill, stroke = INK, width = 2.2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const C = (x, y, r, fill, stroke = 'none', width = 1.5) => E(x, y, r, r, fill, stroke, width);
const G = (art, transform) => `<g transform="${transform}">${art}</g>`;
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const shine = (x, y, color = '#fff5cf', r = 4) => P(`M${x} ${y-r}L${x+1} ${y-1}L${x+r} ${y}L${x+1} ${y+1}L${x} ${y+r}L${x-1} ${y+1}L${x-r} ${y}L${x-1} ${y-1}Z`, color, 'none');
const items = {};
const add = (id, name, tint, description, draw) => {
  const c = { m: tint, s: mix(tint, '#241b22', .44), h: mix(tint, '#fff6dc', .48), l: mix(tint, '#fffaf0', .78) };
  items[id] = { name, description, art: draw(c) };
};

// Ore: each seam follows a different fractured rock, rather than a gem silhouette.
add('copper_ore', 'Copper Ore', '#b87333', 'A low, fractured rock with broad copper seams and a loose chip.', c =>
  P('M7 38L14 22L28 16L43 22L52 41L44 52L17 54Z', c.s) +
  P('M14 22L28 16L33 31L20 42L7 38Z', c.m) + P('M33 31L43 22L52 41L36 48L20 42Z', '#69564c', 'none') +
  L('M19 23L24 31L19 39L29 43L34 51M24 31L36 28L43 35L49 35', c.h, 4.5) +
  P('M45 16L52 13L57 21L52 26L46 23Z', c.m) + L('M48 17L52 16', c.l, 2));
add('iron_ore', 'Iron Ore', '#8a8f98', 'An upright ironstone split by angular grey metal veins.', c =>
  P('M9 43L16 18L33 9L48 19L55 43L41 54L21 51Z', c.s) +
  P('M16 18L33 9L38 29L25 39L9 43Z', c.m) + P('M38 29L48 19L55 43L41 54Z', '#655b56', 'none') +
  L('M21 17L25 26L21 35L30 40L26 51M25 26L38 29L45 24M38 29L43 39L51 42', c.h, 3.8) + L('M32 13L36 23', c.l, 2));
add('silver_ore', 'Silver Ore', '#d5dbe3', 'Two pale silver-bearing rocks with bright branching veins.', c =>
  P('M7 39L10 26L23 20L33 31L30 48L15 52Z', c.s) + P('M25 29L31 12L44 9L56 24L53 45L40 54L29 47Z', c.m) +
  P('M31 12L44 9L47 26L36 35L25 29Z', c.h, 'none') + P('M47 26L56 24L53 45L40 54L36 35Z', c.s, 'none') +
  L('M35 17L38 28L34 39L43 44L44 51M38 28L49 22M34 39L49 37M13 32L22 36L18 46', c.l, 3.5) + shine(49, 15, c.l, 3));
add('blackiron_ore', 'Blackiron Ore', '#3b3f4a', 'Jagged charcoal ironstone with cold polished seams along its sharp ridges.', c =>
  P('M6 40L16 32L15 16L28 8L39 19L48 14L57 35L50 51L28 55L11 49Z', c.m) +
  P('M28 8L29 31L15 43L28 55L50 51L39 38L39 19Z', c.s, 'none') +
  L('M18 18L27 12L31 31L21 40L14 46M31 31L44 29L49 19M44 29L50 38L46 47', c.h, 3.2) +
  L('M31 33L32 47L40 51', '#888a9e', 2) + shine(27, 13, c.l, 3));
add('sunsteel_ore', 'Sunsteel Ore', '#f0c040', 'Golden sunsteel fills the large faults of a dark crown-shaped rock.', c =>
  P('M7 43L13 24L24 26L31 8L42 17L43 28L54 23L57 43L45 54L22 55Z', c.s) +
  P('M13 24L24 26L31 8L35 31L24 44L7 43Z', c.m) + P('M35 31L43 28L54 23L50 44L45 54L24 44Z', c.m) +
  L('M31 14L35 31L26 40L27 51M35 31L45 36L52 29M45 36L48 48', c.l, 3.3) +
  P('M10 47L20 45L23 54L13 56Z', c.h) + shine(42, 13, c.l, 4) + shine(53, 44, c.l, 3));
add('tin_ore', 'Tin Ore', '#c9ccd2', 'A broad slab of tin ore with stepped, silvery deposits.', c =>
  P('M7 36L16 20L42 17L55 30L51 48L27 54L11 48Z', '#655c54') +
  P('M16 20L42 17L49 28L38 37L17 38L7 36Z', c.m) + P('M17 38L38 37L34 49L15 45Z', c.s, 'none') +
  L('M18 25L29 24L28 31L41 29M14 36L23 34L24 41L37 43L47 37', c.l, 3.5) + L('M42 45L48 43', c.h, 3));

// Cut stones: quartz points, garnet rose cut, amethyst spear, sapphire step cut, opal cabochon.
add('rough_quartz', 'Rough Quartz', '#e8eef4', 'Three uneven milky quartz points joined at a rocky root.', c =>
  P('M10 44L8 29L17 22L25 29L27 48Z', c.s) + P('M22 48L20 18L30 7L40 19L39 47Z', c.m) +
  P('M37 49L38 29L49 20L56 31L51 49L36 55L16 52Z', c.h) +
  P('M30 7L30 43L20 18Z', c.l, 'none') + P('M40 19L30 43L39 47Z', c.s, 'none') +
  L('M20 18L30 24L40 19M38 29L46 34L56 31M46 34L44 48M9 29L17 34L24 30', '#929ca9', 1.4));
add('garnet', 'Garnet', '#a8243a', 'A deep red rose-cut garnet with a smaller triangular garnet chip.', c =>
  P('M9 27L20 13L39 12L51 25L48 42L30 54L13 43Z', c.m) +
  P('M20 13L23 28L9 27L13 43L25 38L30 54L37 36L48 42L51 25L36 27L39 12Z', c.s, 'none') +
  P('M23 28L29 18L36 27L37 36L25 38Z', c.h, 'none') +
  L('M9 27L23 28L20 13M39 12L36 27L51 25M13 43L25 38L30 54L37 36L48 42M23 28L25 38L37 36L36 27Z', '#e16a76', 1.3) +
  P('M47 48L56 43L57 54L49 57Z', c.m) + L('M22 17L29 16', c.l, 2));
add('amethyst', 'Amethyst', '#8e5cc8', 'Two violet spear-cut crystals flank a tall polished amethyst.', c =>
  P('M8 36L13 21L23 26L28 50L18 54Z', c.s) + P('M35 49L42 23L52 19L57 34L47 52Z', c.m) +
  P('M20 22L32 6L43 23L39 46L30 57L21 43Z', c.m) +
  P('M32 6L29 24L30 57L21 43L20 22Z', c.h, 'none') + P('M29 24L43 23L39 46L30 57Z', c.s, 'none') +
  L('M20 22L29 24L43 23M29 24L30 52M45 28L49 25', c.l, 1.8) + shine(32, 15, c.l, 3));
add('sapphire', 'Sapphire', '#2f6fd6', 'A blue octagonal step-cut sapphire beside a small square cut stone.', c =>
  G(P('M16 10H38L47 19V42L38 51H16L8 42V19Z', c.m) +
    P('M16 10L21 19H34L38 10M47 19L37 24V37L47 42M38 51L33 41H22L16 51M8 42L17 37V24L8 19', c.s, 'none') +
    P('M21 19H34L37 24V37L33 41H22L17 37V24Z', c.h, '#6db2ff', 1.4) +
    P('M21 19L17 24V37L22 41L25 23L34 19Z', '#8cc9ff', 'none') + L('M16 14H36M12 21V39', c.l, 1.8), 'rotate(-12 28 31)') +
  P('M46 43L56 46L53 57L42 53Z', c.m) + P('M48 47L53 48L51 53L46 51Z', c.h, 'none') + shine(44, 13, c.l));
add('star_opal', 'Star Opal', '#bfe8e0', 'An oval opal with broad iridescent facets and a star-bright centre, beside a little opal.', c =>
  E(29, 31, 20, 25, c.m) + P('M14 19Q21 6 33 9L25 26L11 34Z', c.l, 'none') +
  P('M25 26L43 17L47 34L32 40Z', '#8dcabb', 'none') + P('M11 34L25 26L32 40L24 53Q14 49 11 34Z', '#a7bdeb', 'none') +
  P('M32 40L47 34Q45 49 32 54L24 53Z', '#ead9b3', 'none') +
  L('M18 14Q24 9 30 10', '#ffffff', 2.5) + shine(29, 30, '#fffef0', 9) + E(49, 48, 8, 10, c.h) + shine(48, 45, '#ffffff', 3));

// Logs: bark, cut direction, knots and growth rings are individually drawn.
add('ash_log', 'Ash Log', '#c9b48a', 'A light ash log with an oval cut end and fine straight bark.', c =>
  P('M13 26L38 9Q53 7 57 24L35 48Z', c.m) + P('M33 30L57 24L48 39L34 48Z', c.s, 'none') +
  L('M24 24L44 12M32 29L51 18M39 34L51 27', c.h, 2.2) + E(23, 39, 17, 16, c.h) +
  E(23, 39, 11, 10, 'none', c.s, 1.6) + E(23, 39, 5, 4, 'none', c.s, 1.5) + L('M11 32L17 35M27 44L32 50', c.s));
add('oak_log', 'Oak Log', '#9a7446', 'A stout oak section with deep bark furrows and a trimmed branch knot.', c =>
  P('M11 24L33 9Q53 5 56 28L36 49Z', c.m) + P('M34 25L56 28L47 40L36 49Z', c.s, 'none') +
  P('M34 17L37 8L44 7L47 13L43 21Z', c.s) + E(41, 10, 4, 3, c.h) +
  L('M16 24L29 14M27 26L32 20M36 32L46 23L51 24M41 39L49 32', c.h, 2.4) +
  E(24, 39, 18, 17, c.h) + E(24, 39, 12, 11, 'none', c.s, 2) + E(25, 40, 6, 5, 'none', c.s, 1.6) + L('M12 48L19 43M34 28L29 34', c.s, 2));
add('yew_log', 'Yew Log', '#b0623a', 'A narrow reddish yew log with a pale sapwood edge and a wandering heart grain.', c =>
  P('M12 34L40 8Q51 7 57 20L32 51Z', c.m) + P('M32 30L57 20L51 31L32 51Z', c.s, 'none') +
  L('M24 30Q31 19 45 12M32 35Q41 26 49 23', c.h, 2.5) +
  E(22, 42, 15, 14, c.l) + E(22, 42, 11.5, 11, c.m, c.s, 1.5) +
  P('M18 37Q28 34 29 42Q29 49 21 49Q14 46 18 40Q21 37 24 41Q25 44 21 44', 'none', c.h, 1.8));
add('ironbark_log', 'Ironbark Log', '#5e5348', 'An ironbark block with armour-like bark plates and tight pale rings.', c =>
  P('M10 29L28 10L47 8L57 25L42 49L19 55Z', c.m) +
  P('M28 10L33 22L24 32L13 28ZM36 10L47 8L52 18L42 24ZM30 30L41 26L47 35L40 46Z', c.s, c.h, 1.5) +
  E(24, 40, 17, 16, c.h) + E(24, 40, 12, 11, 'none', c.s, 1.8) + E(24, 40, 7, 6, 'none', c.s, 1.6) + E(24, 40, 2, 2, c.s, 'none') +
  L('M9 39L15 40M26 25L26 31M35 49L31 46', c.s, 2) + L('M43 12L48 16', c.l, 2));
add('heartwood_log', 'Heartwood Log', '#7a2f2a', 'Red heartwood with a curled heart grain, polished end and copper-red bark.', c =>
  P('M10 27L32 9Q48 5 56 19L51 34L33 52Z', c.m) +
  P('M37 27L56 19L51 34L33 52Z', c.s, 'none') + L('M20 23Q29 11 40 11M30 27Q38 19 48 17M39 35L48 28', c.h, 2.3) +
  E(24, 39, 18, 17, c.h) + E(24, 39, 14, 13, c.m, c.s, 1.4) +
  P('M24 47C7 38 20 29 24 36C29 27 40 38 24 47Z', 'none', c.h, 2) + L('M13 34Q14 29 20 28M29 51L28 46', c.l, 1.8) + shine(43, 14, c.l, 3));

// Botanicals. Leaf shapes and flowers identify the plant before colour does.
add('meadowmint', 'Meadowmint', '#7fc98a', 'A fresh mint sprig with opposite serrated leaves.', c =>
  L('M29 56Q34 32 31 9', '#334d31', 3.2) +
  P('M31 24C20 25 11 18 9 9L15 11L18 9L22 14L26 14L29 20Z', c.m) +
  P('M32 30C33 18 42 13 54 14L52 19L54 22L48 24L47 28L39 28Z', c.h) +
  P('M31 43C18 46 9 36 7 28L13 30L16 27L21 32L25 31L30 38Z', c.m) +
  P('M31 48C36 36 46 34 55 37L51 41L52 44L46 46L43 50L36 49Z', c.m) +
  L('M14 14L31 24M33 29L48 19M13 33L30 42M33 47L48 40', c.s, 1.6));
add('feverleaf', 'Feverleaf', '#d8c24a', 'A fan of three long golden saw-edged fever leaves, tied at the cut stem.', c =>
  L('M30 56L33 19M30 53L14 26M31 53L49 29', c.s, 3) +
  P('M30 46L23 33L26 30L23 23L27 20L27 13L34 6L39 17L37 21L40 27L36 31L37 37Z', c.m) +
  P('M27 48L16 44L17 40L10 36L12 32L7 20L19 26L19 30L25 32L24 38L29 42Z', c.h) +
  P('M34 49L35 37L40 36L41 30L46 30L55 20L53 34L49 37L48 43L43 43L39 49Z', c.m) +
  L('M33 13L31 43M13 27L25 44M50 29L37 46', c.s, 1.6) + L('M25 51L35 54M25 54L34 56', '#a96740', 2.5));
add('moonpetal', 'Moonpetal', '#c9d4f2', 'A five-petalled moon-white flower over two curled blue leaves.', c =>
  L('M30 57Q36 42 33 25', '#657583', 3) + P('M32 48Q15 50 12 35Q27 32 32 48Z', c.m) + P('M34 43Q38 30 52 32Q50 47 34 43Z', c.s) +
  P('M31 29C20 23 24 8 32 6C42 10 42 20 35 27C40 16 54 13 58 21C57 31 46 35 37 31C48 32 52 44 44 48C34 47 31 39 32 33C30 44 19 49 13 42C12 32 23 27 28 29C16 30 7 24 8 15C17 9 29 18 31 29Z', c.m) +
  L('M32 12L32 24M51 22L39 28M42 41L36 34M19 39L27 32M14 19L26 26', c.l, 2.6) + C(32, 29, 5, '#eddfb1', INK) + C(31, 28, 2, '#fff9df'));
add('frostbloom', 'Frostbloom', '#9fe0ee', 'Three crystalline blue bell flowers hang from an icy branching stem.', c =>
  L('M30 57L31 19Q20 10 14 22M31 29Q43 14 49 25M31 20Q36 7 43 12', c.s, 3) +
  P('M31 50Q14 49 10 40Q25 36 31 50Z', c.m) + P('M32 45Q43 32 54 39Q48 48 32 45Z', c.h) +
  P('M9 22L17 20L24 36L17 33L13 39L10 33L6 34Z', c.m) +
  P('M44 24L52 24L58 39L51 36L47 42L44 36L39 38Z', c.m) +
  P('M39 12L46 12L52 24L45 22L41 27L38 22L34 24Z', c.h) +
  L('M13 24L14 31M48 27L48 34M42 14L42 20M16 43L28 49', c.l, 2.2) + shine(24, 12, c.l, 3));
add('sunroot', 'Sunroot', '#f0a030', 'A golden forked medicinal root beneath a small sun-yellow blossom and pointed leaves.', c =>
  P('M30 27Q18 20 18 8Q31 12 32 24Q35 12 48 10Q46 25 35 28Z', '#87914a') +
  L('M33 30L35 14', '#54652f', 3) +
  P('M35 6L38 11L44 10L42 16L46 20L39 21L36 27L32 21L26 21L29 16L27 10L33 11Z', c.h) + C(36, 16, 4, c.m, c.s) +
  P('M27 28Q32 24 39 29L43 37L36 43L39 55L32 50L29 41L22 49L14 53L18 43L24 35Z', c.m) +
  L('M29 30L37 32M25 36L34 38M21 44L26 43M34 44L35 49', c.s, 1.7) + L('M28 29L24 35M38 33L39 36', c.l, 2.2));

// Fungi, with cap profiles and stems deliberately unrelated to one another.
add('field_mushroom', 'Field Mushroom', '#e6dccb', 'A broad cream field mushroom with a skirted stem and a small companion.', c =>
  P('M27 29L37 29L40 51Q32 58 24 52L28 37Z', c.m) + P('M29 31L34 31L35 49L29 51Z', c.h, 'none') +
  P('M8 30C9 4 49 2 55 29Q34 39 8 30Z', c.m) + P('M8 30Q30 25 55 29Q36 40 8 30Z', c.s, INK, 1.6) +
  L('M16 22Q23 13 35 13', c.l, 3) + P('M26 36Q32 40 38 35L39 40L33 43L26 40Z', c.h, c.s, 1.4) +
  P('M12 44H19L21 55H12Z', c.h) + P('M6 45Q7 29 17 32Q27 33 27 44Q17 48 6 45Z', c.m) + L('M10 40Q13 36 17 36', c.l, 2));
add('amber_cap', 'Amber Cap', '#d98a2b', 'Two glossy orange funnel mushrooms with slender bent stems.', c =>
  P('M29 30L35 29Q30 43 40 52L32 56Q23 44 29 30Z', c.h) + P('M43 39L48 38L50 54L44 55Z', c.m) +
  P('M7 17Q17 25 28 18Q41 8 51 13Q50 27 35 33Q17 33 7 17Z', c.m) +
  P('M12 18Q28 23 45 15Q37 26 27 27Q17 25 12 18Z', c.s, 'none') + L('M13 16Q25 20 36 15M17 26L27 30L37 27', c.l, 2.1) +
  P('M35 31Q45 36 57 28Q58 40 48 43Q39 43 35 31Z', c.m) + L('M41 35L50 34', c.h, 2.5));
add('ghost_morel', 'Ghost Morel', '#cfd6d2', 'A tall pale morel with a deeply pitted honeycomb cap and hollow ivory stalk.', c =>
  P('M26 37H37L41 52Q34 58 23 53Z', c.h) + L('M30 43L29 51M36 44L37 51', c.s, 1.8) +
  P('M17 38C12 32 19 19 23 13Q32 2 38 12C45 20 50 34 43 40Q30 46 17 38Z', c.m) +
  P('M29 11L34 12L34 18L28 20L24 17ZM21 23L26 22L28 28L23 32L18 30ZM33 22L39 20L42 27L37 31L32 28ZM28 32L33 31L36 36L30 40L25 37ZM40 33L44 32L43 37L38 39Z', c.s, c.h, 1.8) + L('M24 12L20 19', c.l, 2));
add('king_bolete', 'King Bolete', '#8a5a34', 'A wide chestnut bolete with a stout mottled club stem and pale pore rim.', c =>
  P('M25 29H39Q37 38 43 48Q43 57 29 56Q19 54 22 46Z', c.h) +
  P('M33 32L38 32Q36 44 40 49Q35 54 31 53Z', c.m, 'none') +
  P('M6 29Q7 10 29 8Q51 5 58 27Q56 38 31 36Q11 38 6 29Z', c.m) +
  P('M7 29Q28 34 57 27Q54 37 31 36Q12 37 7 29Z', '#d9bc7c', INK, 1.5) +
  L('M14 22Q23 11 37 13', c.h, 3.2) + L('M26 41L28 44M25 48L27 50M33 39L34 42M34 47L36 49', c.s, 1.7) + shine(44, 16, c.l, 3));
add('starcap', 'Starcap', '#7a6fe0', 'An indigo mushroom with a pointed, star-shaped cap and luminous constellation spots.', c =>
  P('M28 28L37 28Q34 44 42 54Q30 59 23 53Q31 43 28 28Z', c.h) + L('M33 36Q31 47 33 52', c.l, 2.3) +
  P('M7 33L15 21L20 22L31 6L38 20L45 17L50 26L58 31L46 36L34 34L22 39L19 34Z', c.m) +
  P('M31 6L33 25L22 39L19 34L7 33L23 27Z', c.h, 'none') + P('M33 25L50 26L58 31L46 36L34 34L22 39Z', c.s, 'none') +
  shine(31, 22, c.l, 5) + shine(44, 28, c.l, 3) + C(22, 29, 1.6, c.l) + C(38, 30, 1.5, c.l) + shine(49, 12, c.l, 3));

// Fibre bundles: blue flax flowers, hemp blades, silk pods, moon tassels, golden skeins.
add('flax', 'Flax', '#8fb6e0', 'A bundle of slender flax stalks with blue flowers and combed blue-grey fibres.', c =>
  P('M21 31L41 30L46 55L35 51L31 57L25 51L17 54Z', c.m) +
  L('M24 35L21 49M29 35L28 51M35 35L36 51M39 35L42 51', c.h, 2.2) +
  L('M25 34L15 15M30 34L29 10M36 34L45 16', c.s, 2.8) +
  P('M10 10L15 12L19 8L21 14L25 17L19 20L16 25L12 19L7 16Z', c.m) +
  P('M25 7L30 10L35 7L36 13L41 16L35 19L31 23L27 18L22 16L26 12Z', c.h) +
  P('M41 13L46 10L49 15L55 16L52 22L48 25L43 22L38 22L40 17Z', c.m) +
  C(16, 16, 2, '#eddda6') + C(31, 15, 2, '#eddda6') + C(46, 18, 2, '#eddda6') + L('M20 33L40 36M20 37L40 32', '#9c7650', 3));
add('hemp', 'Hemp', '#8aa35a', 'A tied sheaf of green hemp blades with long stripped stalk ends.', c =>
  P('M24 32L39 32L44 55L36 52L30 57L26 53L18 54Z', c.m) +
  P('M26 34L9 18L20 21L14 8L27 20L30 6L34 22L46 9L42 24L55 19L40 36Z', c.m) +
  L('M30 12L31 35M19 15L29 33M44 15L34 34M15 22L29 34M49 23L35 35M26 39L23 50M31 39V52M36 39L40 51', c.h, 2) +
  L('M21 34L40 38M22 39L40 33', '#c6a273', 3) + P('M38 36Q48 35 45 42L40 39', 'none', '#c6a273', 2));
add('silkweed', 'Silkweed', '#f0e6f4', 'Split silkweed pods release curled ivory fibres above a tied bundle.', c =>
  P('M23 34H38Q39 44 48 54L37 51L32 57L24 52L16 55Q25 44 23 34Z', c.m) +
  L('M27 39Q29 47 23 51M33 40L33 51M37 40L41 49', c.s, 1.5) +
  L('M28 35L20 15M34 35L43 14M32 34L32 10', '#8c8890', 2.7) +
  P('M20 8Q8 14 17 31Q28 23 20 8Z', c.s) + P('M20 9Q14 20 17 28Q23 22 20 9Z', c.l, 'none') +
  P('M44 8Q32 17 39 30Q53 24 44 8Z', c.s) + P('M44 10Q36 20 40 27Q47 23 44 10Z', c.l, 'none') +
  L('M18 23Q8 20 8 13M20 22Q29 19 26 10M41 24Q55 22 56 13M41 18Q34 13 36 7', c.m, 2.5) + L('M22 35L39 38M22 39L39 34', '#b89975', 3));
add('moonflax', 'Moonflax', '#b8c4f0', 'Pale blue flax fibres hang in a smooth sheaf below three crescent-shaped seed heads.', c =>
  P('M21 31L40 31Q40 44 48 54Q42 56 37 52L32 57L26 53L18 55Q24 43 21 31Z', c.m) +
  L('M26 36Q29 46 23 51M32 36V52M37 36Q35 45 43 52', c.l, 2) +
  L('M26 33L15 16M32 32L32 12M38 32L49 17', c.s, 2.6) +
  P('M18 7Q10 15 22 21Q9 24 7 15Q7 8 18 7Z', c.h) +
  P('M35 6Q27 14 39 20Q26 23 24 14Q24 7 35 6Z', c.m) +
  P('M52 9Q44 17 56 22Q43 26 41 18Q41 11 52 9Z', c.h) +
  L('M21 33L41 37M21 38L41 32', '#a493c5', 3) + shine(47, 35, c.l, 3));
add('sunsilk', 'Sunsilk', '#f6dc8a', 'A lustrous golden hank of long silk fibres with a braided waist and loose shining ends.', c =>
  P('M22 31Q9 19 17 8Q29 5 32 17Q38 5 47 10Q54 22 40 33L45 53L36 50L32 57L27 51L17 54Z', c.m) +
  P('M23 13Q17 20 27 28Q33 21 23 13ZM42 15Q35 20 36 28Q48 23 42 15Z', c.s, 'none') +
  L('M20 11Q13 23 27 32M45 12Q50 23 37 32M26 39L22 49M31 40V51M36 39L40 49', c.l, 2.5) +
  L('M22 32L39 39M22 37L39 31M22 40L39 34', '#b88936', 2.5) + shine(49, 31, c.l, 4) + shine(13, 39, c.l, 3));

// Hides retain a recognisable four-leg outline. Different edges and grain show the animal.
add('light_hide', 'Light Hide', '#b08a5e', 'A small stretched tan hide with four tapered legs and a pale belly.', c =>
  P('M23 8Q31 13 39 8L44 13L42 23L56 29L52 36L43 35L42 43L50 51L44 57L34 49L28 49L19 56L12 51L21 41L20 34L9 37L7 29L21 22L19 14Z', c.m) +
  P('M27 17Q34 15 37 20L38 36Q36 45 31 46Q24 42 25 32Z', c.h, 'none') +
  L('M14 30L23 27M41 29L49 31M23 46L17 51M38 46L44 51', c.s, 1.7));
add('thick_hide', 'Thick Hide', '#8c6a44', 'A broad heavy brown hide with a shaggy neck and blunt leg ends.', c =>
  P('M20 9L26 12L31 8L36 12L43 9L45 18L41 24L56 27L54 37L43 36L43 43L52 49L47 56L36 50L27 51L16 57L11 49L20 42L19 35L8 38L6 28L21 23L18 17Z', c.m) +
  P('M26 17Q36 15 39 26L37 43L32 47L26 42L24 27Z', c.s, 'none') +
  L('M24 19L23 29M39 17L41 23M12 30L20 29M45 30L50 31M26 46L19 51M39 45L45 50', c.h, 2.4));
add('rugged_hide', 'Rugged Hide', '#6e5236', 'A ragged hide with a torn shoulder and three old pale claw scars.', c =>
  P('M19 9L28 13L34 8L41 11L40 22L47 24L50 20L57 29L52 37L43 34L41 43L48 49L45 55L35 50L29 52L22 49L15 56L9 48L20 39L20 33L10 35L6 28L18 23L16 16Z', c.m) +
  P('M28 15L36 16L37 41L31 48L23 42L25 27Z', c.s, 'none') +
  L('M25 23L35 30M24 29L35 36M23 35L33 42', c.h, 2.8) + L('M11 29L19 27M40 47L44 50M18 47L14 51', c.h, 2));
add('heavy_hide', 'Heavy Hide', '#57402a', 'A wide dark hide with a thick pale edge and strongly pebbled grain.', c =>
  P('M22 8L31 12L40 8L46 15L42 24L57 29L54 39L44 37L43 43L52 51L45 57L35 50H27L17 57L9 50L20 41L19 35L8 38L6 28L21 22L17 14Z', c.m) +
  L('M23 13L22 22L13 29M44 29L50 32M25 46L17 51M39 47L45 52', c.h, 2.7) +
  P('M27 18L35 17L40 29L36 45L28 46L23 32Z', c.s, 'none') +
  L('M27 25L30 23M34 27L37 25M26 33L30 31M33 35L37 33M28 40L32 38', c.h, 2));
add('drake_hide', 'Drake Hide', '#4c7a5a', 'A green drake skin with angular limbs, a short tail and overlapping shield scales.', c =>
  P('M25 8L32 13L39 8L43 18L41 24L55 20L57 29L44 35L40 43L48 48L43 55L34 49L30 58L27 49L18 55L11 49L22 40L20 33L7 29L9 20L23 24L21 16Z', c.m) +
  P('M26 18L32 21L38 18L37 27L32 31L27 27ZM22 29L28 31L32 36L27 40L22 36ZM34 31L41 28L40 37L35 41L31 36ZM28 41L33 39L37 43L32 49L27 45Z', c.s, c.h, 1.6) +
  L('M9 23L18 27M46 26L53 23M23 47L18 50', c.l, 1.7) + shine(36, 21, c.l, 3));

// Ingots: different stacks, proportions and forged edge details, always solid metal bars.
const ingot = (d, top, side, c) => P(d, c.m) + P(top, c.h, INK, 1.7) + P(side, c.s, INK, 1.7);
add('bronze_bar', 'Bronze Bar', '#c08a4a', 'Two squat bronze ingots stacked crosswise, with rough casting dents.', c =>
  ingot('M7 38L16 27L48 31L57 42L51 52L14 49Z', 'M7 38L16 27L48 31L40 42Z', 'M40 42L48 31L57 42L51 52Z', c) +
  ingot('M13 24L23 13L49 17L53 29L42 37L16 32Z', 'M13 24L23 13L49 17L39 28Z', 'M39 28L49 17L53 29L42 37Z', c) +
  L('M20 20L34 22M17 40L30 42', c.l, 2) + L('M22 29L25 30M31 47L35 47', c.s, 2));
add('iron_bar', 'Iron Bar', '#9aa0aa', 'Three long iron ingots in a compact stepped stack.', c =>
  ingot('M7 40L15 32L42 32L51 43L45 52H12Z', 'M7 40L15 32H42L35 42Z', 'M35 42L42 32L51 43L45 52H35Z', c) +
  ingot('M20 31L28 23L49 25L57 36L50 44L25 41Z', 'M20 31L28 23L49 25L42 34Z', 'M42 34L49 25L57 36L50 44Z', c) +
  ingot('M12 22L20 13L43 14L48 25L40 32L16 30Z', 'M12 22L20 13L43 14L35 24Z', 'M35 24L43 14L48 25L40 32Z', c) + L('M19 20L32 21M14 38L29 39', c.l, 2));
add('silversteel_bar', 'Silversteel Bar', '#dfe6ee', 'Two clean bevelled silversteel bars catch broad white reflections.', c =>
  ingot('M7 37L18 27L48 29L57 41L48 52L14 49Z', 'M7 37L18 27L48 29L38 41Z', 'M38 41L48 29L57 41L48 52Z', c) +
  ingot('M13 24L23 11L48 14L52 27L42 38L17 34Z', 'M13 24L23 11L48 14L37 27Z', 'M37 27L48 14L52 27L42 38Z', c) +
  L('M18 23L25 15L42 17M14 37L21 31L39 33M19 31L37 34', c.l, 2.3) + shine(45, 17, '#ffffff', 4));
add('blackiron_bar', 'Blackiron Bar', '#4a4f5c', 'Three dark square-ended bars with cold chamfered rims and hammered grooves.', c =>
  ingot('M7 39L13 31H39L45 44L39 53H10Z', 'M7 39L13 31H39L32 41Z', 'M32 41L39 31L45 44L39 53H32Z', c) +
  ingot('M24 31L31 23H51L57 36L50 44H28Z', 'M24 31L31 23H51L44 34Z', 'M44 34L51 23L57 36L50 44Z', c) +
  ingot('M14 23L22 11H43L48 24L40 33H18Z', 'M14 23L22 11H43L35 25Z', 'M35 25L43 11L48 24L40 33Z', c) +
  L('M19 22L25 14H38M12 38H29M30 30H42M20 28H32', c.l, 1.8) + L('M26 18L31 18M17 46H25', c.s, 2.4));
add('sunsteel_bar', 'Sunsteel Bar', '#f4cf5a', 'A fine stack of gold sunsteel with polished sunburst-forged top faces.', c =>
  ingot('M7 39L17 27L46 30L57 42L49 53L13 50Z', 'M7 39L17 27L46 30L37 42Z', 'M37 42L46 30L57 42L49 53Z', c) +
  ingot('M13 23L25 10L48 15L53 28L41 37L17 33Z', 'M13 23L25 10L48 15L36 28Z', 'M36 28L48 15L53 28L41 37Z', c) +
  E(30, 20, 5, 3, c.m, c.s, 1.4) + L('M22 20L19 20M29 15L28 13M38 19L42 18M33 25L34 27', c.s, 1.4) +
  L('M18 24L35 29M12 39L35 43', c.l, 2) + shine(45, 17, c.l, 4) + shine(50, 43, c.l, 3));

// Folded cured leathers, distinct from the spread skins above.
add('light_leather', 'Light Leather', '#c49a68', 'A soft tan leather rectangle folded back to show its pale suede underside.', c =>
  P('M9 28L43 15L55 38L47 51L17 54L7 43Z', c.m) + P('M10 32L43 23L48 46L17 50Z', c.s, 'none') +
  P('M10 19L42 10Q48 12 48 21L43 43L15 50Q9 46 12 38L17 25Z', c.h) +
  P('M10 19L42 10Q49 14 46 23L17 31Q19 23 10 19Z', c.m) + L('M20 35L41 29M16 44L40 37', c.s, 1.5));
add('thick_leather', 'Thick Leather', '#9c764c', 'A square folded slab of thick leather with a visible layered edge.', c =>
  P('M7 29L43 19L56 41L49 53L17 56L8 47Z', c.s) + L('M13 46L46 42L52 44M15 51L46 47', c.h, 2) +
  P('M9 20L42 10L53 31L47 45L14 49L8 38Q15 31 9 20Z', c.m) +
  P('M9 20L42 10L49 22L18 33Q17 24 9 20Z', c.h) + L('M23 37L44 30M19 43L42 38', c.s, 1.8));
add('rugged_leather', 'Rugged Leather', '#7c5c3c', 'A weathered folded leather piece with a torn corner and two broad scrape marks.', c =>
  P('M9 25L43 12L55 39L49 52L38 50L20 56L8 44Z', c.s) +
  P('M8 18L40 8L52 28L45 46L32 48L29 45L17 52L10 42L15 29Z', c.m) +
  P('M8 18L40 8L47 21L19 34Q19 23 8 18Z', c.h) +
  L('M22 35L37 29M20 42L39 34M18 49L23 47M39 49L47 47', c.h, 2.1) + L('M16 19L33 14', c.l, 1.5));
add('heavy_leather', 'Heavy Leather', '#624830', 'Three dark leather folds with a broad saddle crease and polished edges.', c =>
  P('M9 32L44 20L56 41L48 54L18 57L8 46Z', c.s) + L('M14 48L46 43M17 53L46 48', c.h, 2.2) +
  P('M8 18L42 8L54 30L47 45L15 50L9 39Q18 31 8 18Z', c.m) +
  P('M8 18L42 8L49 20L21 32Q20 23 8 18Z', c.h) +
  L('M23 35Q33 31 43 30M19 42Q31 37 43 37', c.s, 2.3) + L('M19 20L38 14M16 47L43 42', c.l, 1.6));
add('drake_leather', 'Drake Leather', '#588a66', 'A supple folded green drake leather with rows of polished overlapping scales.', c =>
  P('M9 28L41 17L56 38L49 52L16 56L7 43Z', c.s) +
  P('M8 18L40 8L53 28L46 46L17 52L10 42L16 29Z', c.m) +
  P('M8 18L40 8L47 20L20 32Q19 23 8 18Z', c.h) +
  L('M22 34Q26 40 30 32Q34 38 38 30Q42 35 47 27M19 42Q24 47 28 39Q32 44 36 37Q40 42 45 35', c.s, 1.8) +
  L('M17 20L37 13M19 48L41 43', c.l, 1.8) + shine(40, 18, c.l, 3));

// Cloth: the spiral end and unrolled hem make the bolt legible without a ribbon label.
const spiral = (x, y, color) => L(`M${x-6} ${y}C${x-6} ${y-7} ${x+6} ${y-7} ${x+6} ${y}C${x+6} ${y+6} ${x-3} ${y+7} ${x-3} ${y+1}Q${x-3} ${y-3} ${x+2} ${y-2}`, color, 1.8);
add('linen_bolt', 'Bolt of Linen', '#e4dcc8', 'A cream linen roll with a short square hem and visible coarse threads.', c =>
  P('M12 30L39 16L53 27L48 52L16 56L8 46Z', c.m) + P('M16 39L48 28L48 52L16 56Z', c.h, INK, 1.7) +
  P('M12 17L39 8Q54 9 55 22L25 35Z', c.m) + E(17, 27, 11, 13, c.h) + spiral(17, 27, c.s) +
  L('M23 45L43 39M22 49L43 43M28 42L26 52M35 40L34 51M42 38L41 49', c.s, 1.2));
add('canvas_bolt', 'Bolt of Canvas', '#b9ad8a', 'A stout canvas roll with a wide crosshatched flap and frayed edge.', c =>
  P('M12 29L42 17L56 36L48 54L18 55L7 43Z', c.m) + P('M19 35L50 28L48 52L18 55Z', c.h, INK, 1.6) +
  P('M12 19L38 8Q52 6 56 21L26 36Z', c.m) + E(18, 28, 12, 13, c.h) + spiral(18, 28, c.s) +
  L('M26 39L44 34M24 44L44 39M23 49L43 44M29 37L27 51M36 35L34 50M43 34L41 49', c.s, 1.4) + L('M22 53L21 57M30 53L30 57M39 52L40 55', c.m, 2));
add('silk_bolt', 'Bolt of Silk', '#f2e8f6', 'A pearl-pink silk bolt spills into a soft flowing fold with a broad satin highlight.', c =>
  P('M14 26L44 17Q45 35 56 46L45 54L34 49L23 56L9 47Q22 39 14 26Z', c.m) +
  P('M25 30L39 25Q33 43 45 53L35 49L24 54Q35 40 25 30Z', c.h, 'none') +
  L('M42 29Q42 43 50 46M16 47Q24 42 23 36', c.s, 1.7) +
  P('M12 17L38 7Q52 6 55 19L26 33Z', c.m) + E(18, 26, 11, 12, c.h) + spiral(18, 26, c.s) + L('M29 16L43 11', c.l, 3));
add('moonweave_bolt', 'Bolt of Moonweave', '#c2ccf4', 'A blue moonweave roll with a silver scalloped selvedge and lustrous folds.', c =>
  P('M13 29L42 16L55 40L48 54L34 50L20 56L9 45Z', c.m) +
  P('M25 32L40 27L40 42L48 54L34 50L24 53L28 41Z', c.h, 'none') +
  L('M18 49Q22 44 26 49Q30 43 34 47Q39 42 43 47Q47 42 51 44', c.l, 2.2) +
  P('M10 17L37 7Q51 6 55 21L25 36Z', c.m) + E(17, 27, 11, 13, c.h) + spiral(17, 27, c.s) +
  L('M29 17L43 11', c.l, 2.7) + shine(44, 35, c.l, 3));
add('sunsilk_bolt', 'Bolt of Sunsilk', '#f8e29a', 'A golden silk roll with a pointed brocade hem, warm folds and fine sun embroidery.', c =>
  P('M13 28L42 17L56 39L49 54L39 51L31 57L22 52L12 55L8 44Z', c.m) +
  P('M26 31L39 24Q35 40 45 52L38 49L30 54Q35 42 26 31Z', c.h, 'none') +
  L('M17 48L23 45L30 49L37 44L46 48L50 43', '#ba8534', 2.1) +
  P('M12 16L38 7Q52 6 56 20L26 34Z', c.m) + E(18, 26, 12, 13, c.h) + spiral(18, 26, c.s) +
  L('M30 15L44 11', c.l, 3) + shine(42, 35, '#fff9dc', 4) + shine(28, 39, '#fff9dc', 3));

// Special drops.
add('pine_resin', 'Pine Resin', '#d9a441', 'Three rounded amber sap lumps, one holding a dark pine needle.', c =>
  P('M10 39Q7 30 16 23Q24 17 30 24L35 37Q35 48 23 52Q12 52 10 39Z', c.m) +
  P('M29 22Q27 10 38 8Q50 6 54 17L52 34Q45 42 35 35Z', c.m) +
  P('M32 43Q39 33 50 39Q59 46 53 55L37 57Q29 53 32 43Z', c.h) +
  P('M13 37Q10 46 22 49L30 42L24 44Z', c.s, 'none') + P('M40 31L51 22L51 32L44 37Z', c.s, 'none') +
  L('M17 28Q22 25 25 29M35 16Q37 11 43 12M38 44L43 41', c.l, 3) + L('M38 21L44 29L46 18', '#715627', 1.5));
add('game_meat', 'Game Meat', '#b8504a', 'A raw red haunch with a creamy fat edge and exposed white knuckle bone.', c =>
  P('M39 40L49 47Q55 43 58 48Q61 54 55 56Q53 61 48 57Q44 55 46 51L34 44Z', '#efe2c4') +
  P('M9 18Q18 6 33 10Q51 12 51 27Q50 37 39 45L28 52Q16 55 10 43Q3 29 9 18Z', c.h) +
  P('M12 20Q21 10 34 14Q47 16 47 28Q44 36 35 40L26 47Q17 50 13 40Q7 28 12 20Z', c.m, c.s, 1.6) +
  P('M13 34Q19 40 29 31Q37 22 44 24Q39 36 31 38L25 45Q17 48 13 34Z', c.s, 'none') +
  L('M14 22Q24 16 32 20Q35 22 40 20M17 29Q25 22 31 25M18 39L23 36', '#edaba0', 2.2));
add('beast_fang', 'Beast Fang', '#efe6d2', 'A single great curved ivory fang with a rugged root and a sharp polished tip.', c =>
  P('M21 8L29 11L34 7L45 12Q51 30 38 44Q27 55 10 57Q28 44 27 27L19 20Z', c.m) +
  P('M37 14L45 12Q51 30 38 44Q27 55 10 57Q34 43 37 28Z', c.s, 'none') +
  P('M25 22L31 25Q33 39 19 49Q28 33 25 22Z', c.l, 'none') +
  P('M21 8L29 11L34 7L45 12L43 21L35 18L28 23L19 20Z', '#b8a389', INK, 1.7) + L('M25 12L27 17M37 11L39 16', c.h, 1.7));
add('sovereign_core', 'Sovereign Core', '#ffd24a', 'A luminous golden heart crystal enclosed by a dark bronze rib cage.', c =>
  P('M26 8L32 5L38 8L37 14H27Z', c.h) +
  P('M16 19Q32 9 48 19L53 34L46 51L32 58L18 51L11 34Z', '#705030') +
  P('M32 22C20 6 7 23 19 36L32 49L45 36C57 21 42 7 32 22Z', c.m) +
  P('M20 18L32 27L32 49L19 36L14 26Z', c.h, 'none') + P('M32 27L43 17L48 27L45 36L32 49Z', '#e49a28', 'none') +
  L('M21 18L21 29L32 27L43 17M21 29L32 49L43 30L32 27', c.l, 1.7) + shine(29, 28, '#fffbe0', 6) +
  L('M20 15Q8 34 21 51M44 15Q56 34 43 51M32 12V18M32 48V57', INK, 5) +
  L('M20 15Q8 34 21 51M44 15Q56 34 43 51M32 12V18M32 48V57', '#b78b45', 2.6) +
  P('M12 34L19 38L32 42L45 38L52 34L49 42L32 49L15 42Z', '#8f672e', INK, 1.8) +
  L('M16 37L32 45L48 38', c.h, 1.5) + C(32, 45, 2.2, c.l) + shine(51, 12, c.l, 3));

// Unknown-class artwork uses warm grey, with its own composition.
add('mat_ore', 'Ore', '#a19c92', 'A neutral grey rock with a broad branching metal seam.', c =>
  P('M8 40L17 19L35 12L52 26L56 44L42 54L19 52Z', c.s) + P('M17 19L35 12L36 34L20 41L8 40Z', c.m, 'none') +
  L('M24 20L29 31L22 42L29 50M29 31L43 26L49 33M36 34L43 45', c.l, 4));
add('mat_metal', 'Metal', '#b0aaa0', 'Two plain neutral metal bars in an offset stack.', c =>
  ingot('M7 39L17 28L48 31L57 44L49 54L13 49Z', 'M7 39L17 28L48 31L37 43Z', 'M37 43L48 31L57 44L49 54Z', c) +
  ingot('M12 23L22 12L43 14L49 27L39 35L16 31Z', 'M12 23L22 12L43 14L34 26Z', 'M34 26L43 14L49 27L39 35Z', c) + L('M21 19L32 20M17 39L30 41', c.l, 2));
add('mat_gem', 'Gemstone', '#c1bdb5', 'A neutral diamond-cut gem with a small companion crystal.', c =>
  P('M7 25L20 10H39L52 25L30 55Z', c.m) + P('M7 25H52L30 55Z', c.s, 'none') + P('M20 10L18 25L30 55L40 25L39 10Z', c.h, 'none') +
  L('M7 25H52M20 10L30 25L39 10', c.l, 1.8) + P('M44 43L52 37L58 46L53 55L46 53Z', c.m) + L('M52 40L50 49', c.l, 2));
add('mat_wood', 'Wood', '#a49b88', 'A grey-brown log with a cut face, growth rings and a split bark seam.', c =>
  P('M12 27L37 10Q52 7 57 24L34 50Z', c.m) + L('M26 24L45 14M35 31L49 22M39 37L49 29', c.s, 2) +
  E(23, 40, 17, 15, c.h) + E(23, 40, 11, 9, 'none', c.s, 1.8) + E(23, 40, 5, 4, 'none', c.s, 1.5) + L('M11 47L18 44', c.s, 2));
add('mat_herb', 'Herb', '#a8b1a0', 'A neutral sage-grey sprig with three broad leaves.', c =>
  L('M23 57Q35 36 34 13', c.s, 3) + P('M34 27Q22 15 35 6Q47 16 34 27Z', c.m) +
  P('M32 39Q9 40 8 21Q27 19 32 39Z', c.m) + P('M30 47Q35 25 56 27Q53 48 30 47Z', c.h) +
  L('M35 12L34 24M14 26L29 36M35 43L50 32', c.s, 1.7));
add('mat_mushroom', 'Mushroom', '#b7afa3', 'A neutral rounded mushroom with a curved stem and pale gills.', c =>
  P('M26 28H36Q33 42 42 54Q31 58 23 53Q31 41 26 28Z', c.h) +
  P('M7 31Q8 9 31 8Q53 9 57 30Q32 39 7 31Z', c.m) + P('M7 31Q30 26 57 30Q31 39 7 31Z', c.s, INK, 1.6) + L('M16 22Q23 14 33 14', c.l, 3) + L('M30 39L29 49', c.m, 2));
add('mat_fibre', 'Fibre', '#b6b0a0', 'A neutral sheaf of loose plant fibres gathered by a cord.', c =>
  P('M12 8L24 15L28 7L33 17L42 8L42 20L52 15L40 34L49 54L39 50L33 57L26 50L16 55L23 35Z', c.m) +
  L('M19 16L28 33M29 14L31 34M42 18L35 34M27 40L22 49M32 40V51M37 40L43 49', c.l, 2) + L('M23 33L40 38M22 38L40 32', c.s, 3));
add('mat_cloth', 'Cloth', '#bdb7aa', 'An undyed cloth bolt with a plain turned hem.', c =>
  P('M13 26L43 15L54 39L48 54L17 56L9 45Z', c.m) + L('M20 50L46 45', c.s, 2) +
  P('M12 17L38 8Q53 7 56 21L26 36Z', c.m) + E(18, 27, 12, 13, c.h) + spiral(18, 27, c.s) + L('M32 16L44 12', c.l, 2.5));
add('mat_hide', 'Hide', '#a79b88', 'A neutral stretched raw hide with a pale central belly.', c =>
  P('M22 9L31 14L41 9L45 17L42 24L56 29L53 36L43 34L41 42L50 51L44 56L34 49L27 50L17 56L11 49L22 40L20 33L10 36L7 29L21 22L19 16Z', c.m) +
  P('M28 19Q35 16 38 25L37 39L31 46L25 39L25 28Z', c.h, 'none') + L('M14 30L21 27M43 29L50 31', c.s, 1.6));
add('mat_leather', 'Leather', '#a39682', 'A neutral leather piece folded twice with a soft curled upper edge.', c =>
  P('M8 29L42 17L56 40L48 53L17 56L8 45Z', c.s) + L('M15 48L46 43', c.h, 2) +
  P('M9 18L42 9L53 29L45 46L16 51L10 40L17 28Z', c.m) + P('M9 18L42 9L48 21L19 33Q20 24 9 18Z', c.h) + L('M23 38L41 32', c.s, 2));
add('mat_resin', 'Resin', '#b6a58a', 'Two neutral honey-grey resin lumps with soft translucent highlights.', c =>
  P('M8 36Q6 20 21 12Q35 10 38 25L34 45Q24 55 12 48Z', c.m) +
  P('M32 40Q34 25 46 27Q58 29 57 43L50 55L37 56Q29 50 32 40Z', c.h) +
  P('M12 39L23 45L34 36L32 46L23 51L14 47Z', c.s, 'none') + L('M15 26Q18 19 24 18M39 37Q42 32 47 33', c.l, 3));

export default items;
