// Thousandvale catch portraits. Twelve hand-authored anatomical templates, facing right.
// Palettes, fin shapes and markings below are selected per species, never from an id hash.
const INK = '#1a1410';
const P = (d, fill, stroke = INK, width = 2.2) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const L = (d, color, width = 1.5) => P(d, 'none', color, width);
const E = (x, y, rx, ry, fill, stroke = INK, width = 2.2) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
const C = (x, y, r, fill, stroke = 'none', width = 1.5) => E(x, y, r, r, fill, stroke, width);
const G = (art, transform) => `<g transform="${transform}">${art}</g>`;
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
const gold = '#e5bd68';
const skin = (d, c, fill = c.body) => (c.legend ? P(d, 'none', '#cba359', 3.5) : '') + P(d, fill);
const fin = (d, c) => skin(d, c, c.fin);
const eye = (x, y, c, r = 2.8) => c.trait === 'blind'
  ? L(`M${x-2} ${y}Q${x} ${y+1} ${x+2} ${y}`, c.shadow, 1.8)
  : C(x, y, r, c.iris || '#f3d99a', INK, 1.4) + C(x+.7, y, r*.48, '#171713') + C(x+.1, y-.9, .65, '#fff6d9');
const glint = (d, c) => L(d, c.legend ? '#f6db94' : c.light, 1.8);
const star = (x, y, r, color) => P(`M${x} ${y-r}L${x+1} ${y-1}L${x+r} ${y}L${x+1} ${y+1}L${x} ${y+r}L${x-1} ${y+1}L${x-r} ${y}L${x-1} ${y-1}Z`, color, 'none');
const dots = (points, color, radius = 1.6) => points.map(([x,y]) => C(x,y,radius,color)).join('');
const markings = c => {
  switch (c.pattern) {
    case 'bars': return P('M23 26L27 24L29 35L25 34ZM31 23L35 23L37 37L33 37ZM39 24L42 25L44 35L41 38Z', c.mark, 'none');
    case 'tiger': return L('M21 27L25 29L26 33M28 24L31 27L30 31M35 24L38 28L37 32M41 26L43 29L42 33', c.mark, 2.4);
    case 'stripe': return P('M18 32Q31 26 44 29L45 32Q32 30 20 35Z', c.mark, 'none');
    case 'double': return L('M20 30Q32 25 43 28M21 34Q33 30 43 32', c.mark, 1.8);
    case 'spots': return dots([[23,29],[29,25],[35,26],[40,29],[27,34],[34,33],[38,37]], c.mark, 1.5);
    case 'freckles': return dots([[23,29],[27,26],[31,24],[36,25],[41,27],[30,31],[36,30],[24,34],[34,35],[40,34]], c.mark, 1.2);
    case 'rings': return [[24,29],[31,25],[37,29],[29,35],[39,36]].map(([x,y]) => C(x,y,2.2,c.light,'none')+C(x,y,1.25,c.mark)).join('');
    case 'scales': return L('M22 28Q25 34 28 28Q31 34 34 28Q37 34 40 28M25 34Q28 40 31 34Q34 40 37 34Q40 40 43 34M28 22Q31 28 34 22Q37 28 40 24', c.mark, 1.5);
    case 'plates': return P('M21 28L26 24L30 28L27 34L23 33ZM30 25L35 22L39 27L36 33L32 32ZM39 26L44 24L47 29L43 34L40 32Z', c.mark, c.light, 1.1);
    case 'marble': return P('M20 29Q26 21 30 28L27 31L33 35L28 38L24 33ZM34 24L39 25L38 29L43 33L40 38L35 33L37 29Z', c.mark, 'none');
    case 'pearls': return dots([[24,30],[30,27],[37,27],[27,35],[34,34],[40,33]], c.mark, 1.8);
    case 'scar': return L('M28 25L37 37M32 24L40 34', c.mark, 2.2);
    case 'glass': return L('M22 31L42 30M27 28L27 34M32 27V34M37 27V34', c.mark, 1.4) + E(37,34,3.7,2,c.fin,'none');
    case 'moon': return P('M34 22C25 22 24 34 33 35Q38 35 40 30Q32 34 31 27Q31 24 34 22Z', c.mark, 'none');
    case 'clay': return P('M18 30Q27 23 34 27L40 24L45 29L42 34L35 33L29 38L23 34Z', c.mark, 'none');
    default: return '';
  }
};

// Perch / bass: high spiny dorsal, deep shoulder and compact predatory jaw.
function perch(c) {
  const dorsal = c.trait === 'three_spines'
    ? 'M22 24L23 12L27 23L33 9L35 23L43 13L43 26Z'
    : c.trait === 'sail'
      ? 'M21 25Q20 7 29 7L34 10L38 8L42 12L47 13L46 26Z'
      : 'M21 25L24 15L28 19L32 12L35 18L39 13L42 19L47 20L47 27Z';
  return fin('M19 29L8 20L10 31L7 42L20 36Z',c) + fin(dorsal,c) + fin('M26 38L28 49L38 43L42 36Z',c) +
    L('M12 25L17 32L11 37M28 21L30 26M36 20L37 25',c.shadow,1.4) +
    skin('M17 30C25 17 42 17 51 24L58 31L55 37Q45 44 34 43Q24 41 17 35Z',c) +
    P('M20 34Q34 38 45 33L56 32L55 37Q41 48 25 39Z',c.belly,'none') +
    P('M20 29Q34 20 46 24L42 28Q30 26 20 31Z',c.back,'none') + markings(c) +
    fin('M40 33Q35 35 32 43L44 39Z',c) + L('M39 36L36 40',c.light) +
    L('M44 26Q40 32 45 37M53 34L57 33',c.shadow,1.7) + eye(50,28,c) + glint('M25 24Q33 20 40 22',c);
}

// Carp / bream: arched back, round belly, short fins, small puckered mouth.
function carp(c) {
  return fin('M20 29L8 19L10 31L7 43L20 37Z',c) +
    fin(c.trait === 'tall' ? 'M21 25L25 8L35 12L44 21Z' : 'M22 24L28 12L37 14L45 23Z',c) +
    fin('M25 40L27 52L38 47L43 38Z',c) +
    skin('M18 30C24 11 40 12 49 22Q55 25 56 30L59 32L56 36Q53 46 39 48Q26 48 18 36Z',c) +
    P('M20 34Q32 42 44 34L56 33Q53 46 39 48Q26 48 20 36Z',c.belly,'none') +
    P('M22 27Q32 16 42 21L43 25Q32 22 23 30Z',c.back,'none') + markings(c) +
    fin('M44 33Q38 35 35 43Q43 45 48 38Z',c) +
    L('M46 25Q41 31 46 37M56 33L59 33',c.shadow,1.7) + eye(51,28,c) +
    (c.trait === 'barbel' ? L('M56 36Q59 43 51 45M54 37Q55 42 49 42',c.light,1.8) : '') +
    glint('M26 22Q33 17 39 19',c);
}

// Trout / salmon: narrow waist, muscular curved flank and small adipose fin.
function trout(c) {
  return fin('M19 31L8 21L10 32L6 43L19 37Z',c) +
    fin(c.trait === 'grayling' ? 'M23 25L24 7Q36 5 45 16L44 26Z' : 'M27 25L31 13L41 19L43 27Z',c) +
    fin('M20 28L20 22Q24 21 25 27Z',c) + fin('M29 38L32 49L42 39Z',c) +
    skin('M17 31C28 20 40 19 49 24L58 30L56 35Q48 42 37 43Q26 41 17 36Z',c) +
    P('M20 35Q36 37 47 32L57 31L56 35Q46 45 32 41Z',c.belly,'none') +
    P('M20 30Q35 21 46 25L46 28Q32 25 21 32Z',c.back,'none') + markings(c) +
    fin('M44 33L35 41L43 43L48 35Z',c) + L('M44 26Q40 31 45 36M53 33L57 32',c.shadow,1.6) +
    eye(51,28,c,2.5) + glint('M28 25Q35 22 41 24',c) +
    (c.trait === 'grayling' ? L('M28 12L29 22M33 12L35 21M38 15L40 22',c.light,1.6) : '');
}

// Minnows and small marine fusiform fish: long silver belly, deeply forked tail.
function minnow(c) {
  return fin('M20 31L7 21L11 33L6 45L21 37Z',c) +
    fin(c.trait === 'tunny' ? 'M25 28L36 9L37 26Z' : 'M26 28L31 17L39 25Z',c) +
    fin('M31 37L35 47L41 38Z',c) +
    skin('M18 32Q35 18 49 25L58 31L57 35Q47 42 36 41Q25 40 18 36Z',c) +
    P('M20 35Q35 32 56 32L57 35Q46 44 32 39Z',c.belly,'none') +
    P('M22 30Q37 21 49 26L45 29Q32 26 22 33Z',c.back,'none') + markings(c) +
    fin(c.trait === 'tunny' ? 'M45 32L28 44L40 42L49 34Z' : 'M44 32L36 39L43 40L48 34Z',c) +
    L('M46 27Q43 31 47 35M54 34H57',c.shadow,1.5) + eye(51,28,c,2.6) + glint('M28 29Q36 25 43 26',c) +
    (c.trait === 'tunny' ? P('M20 29L22 24L24 28M23 39L25 43L27 39',c.fin,INK,1.2) : '');
}

// Pike: rear-set dorsal, very long flattened snout, low streamlined body.
function pike(c) {
  return fin('M19 30L7 21L10 32L6 43L20 37Z',c) + fin('M19 28L24 14L33 19L34 28Z',c) + fin('M24 37L29 48L37 39Z',c) +
    skin('M17 31Q28 21 42 24L49 27L59 28L58 34L48 37Q35 43 18 36Z',c) +
    P('M19 35Q35 36 46 31L58 31L58 34L48 37Q33 44 19 36Z',c.belly,'none') +
    P('M20 29Q31 23 42 26L45 29Q31 27 20 32Z',c.back,'none') + markings(c) +
    fin('M42 33L34 41L42 42L46 35Z',c) + L('M45 28Q42 31 46 35M50 32L58 31',c.shadow,1.6) + eye(49,28.5,c,2.3) +
    P('M52 32L53 35L54 32M56 32L56.5 34L58 32',c.light,'none') + glint('M24 27Q32 24 40 26',c) +
    (c.trait === 'crown' ? P('M30 24L29 17L34 20L38 14L41 22L45 19L46 26Z',c.light,INK,1.7) : '');
}

// Eels, congers and lampreys: a broad sweeping S, never a straight sausage.
function eel(c) {
  const body = 'M57 21C56 10 40 10 33 22C27 31 43 40 33 46C21 53 11 45 7 34C6 48 18 58 32 55C53 52 48 35 42 29C44 24 51 29 57 25Z';
  return fin('M10 35Q11 49 28 46Q43 42 32 30L31 23Q23 34 31 39Q37 46 24 48Q15 47 10 35Z',c) +
    skin(body,c) + P('M54 22C46 18 37 22 38 29C40 36 47 44 35 50C23 57 14 48 11 43C21 51 32 52 38 45C45 37 30 30 35 24C39 17 49 15 54 22Z',c.belly,'none') +
    glint('M37 21Q43 13 51 16',c) +
    (c.pattern === 'spots' ? dots([[39,19],[35,26],[38,33],[42,40],[39,48],[30,52],[22,51]],c.mark,1.7) : '') +
    (c.pattern === 'bars' ? L('M37 22L42 24M36 29L41 30M41 37L46 37M40 46L45 46M31 50L33 54M21 49L21 53',c.mark,2.3) : '') +
    (c.pattern === 'stripe' ? L('M52 19Q41 15 36 25Q34 29 39 33',c.mark,2) : '') +
    (c.trait === 'lamprey'
      ? E(55,23,4,6,c.shadow,INK,1.8) + E(55.5,23,2.2,3.8,'#c48e7c','none') + L('M54 20L56 21M54 25L56 24',c.light,1.4) + dots([[47,21],[44,22],[42,24]],c.shadow,1.1)
      : fin('M43 27Q37 30 42 35L48 29Z',c) + L('M47 18Q44 22 47 26M53 24L57 23',c.shadow,1.5) + eye(51,20,c,2.6)) +
    (c.trait === 'lure' ? L('M43 16Q42 4 52 7Q57 7 56 12',c.shadow,2.4) + C(56,13,5,c.mark,'none') + C(56,13,3.3,'#fff2a6',INK,1.3) + C(55,12,1.3,'#fffde5') : '');
}

// Catfish / wels, including the squat bullhead and walking mudskipper variants.
function catfish(c) {
  const goby = c.trait === 'skipper';
  const body = c.trait === 'bullhead' || goby
    ? 'M8 39L18 28Q24 18 39 18Q54 18 57 29Q61 38 48 44Q32 48 20 37L9 45Z'
    : 'M7 44Q12 31 21 31C28 13 46 15 55 25Q61 31 56 38C46 48 30 42 22 38Q14 38 7 44Z';
  return fin('M20 30L23 16L33 23L34 29Z',c) + fin('M27 37Q24 51 38 51L45 39Z',c) +
    skin(body,c) + P('M14 37Q31 35 43 31L57 31Q58 39 48 42Q34 44 22 37Z',c.belly,'none') +
    P('M23 29Q34 19 47 22L49 26Q36 23 26 32Z',c.back,'none') + markings(c) +
    fin(goby ? 'M40 35Q37 47 50 51L48 44L51 36Z' : 'M42 34Q30 38 31 46Q42 48 49 38Z',c) +
    L('M45 24Q42 30 46 36M51 34Q55 36 58 33',c.shadow,1.7) +
    (goby ? E(46,20,4,5,c.body) + E(54,23,4,4.5,c.body) + eye(47,19,c,2.5) + eye(55,22,c,2.3)
      : eye(51,27,c,2.7) + L('M55 34Q62 38 57 45M51 36Q54 47 44 50M53 33Q60 27 60 32',c.light,1.8)) +
    glint('M28 24Q36 19 43 21',c);
}

// Flatfish and rays are viewed from above, with the head at the right.
function flat(c) {
  if(c.trait === 'ray') return '' +
    L('M27 32C16 32 19 52 7 54',INK,5) + L('M27 32C16 32 19 52 7 54',c.body,2.8) +
    skin('M20 31Q30 23 30 7L42 15Q44 23 57 29L58 33Q45 39 42 48L31 56Q31 42 20 35Z',c) +
    P('M29 31Q39 22 33 12L41 18Q42 26 54 30L55 32Q42 34 38 45L33 50Q34 38 29 31Z',c.belly,'none') +
    L('M34 14Q40 28 51 30M34 49Q39 36 51 33M40 23L43 26M40 39L43 36',c.shadow,1.5) +
    eye(48,27,c,2.3) + eye(48,35,c,2.1) + glint('M33 14Q37 23 43 26',c) +
    dots([[37,25],[36,33],[39,40]],c.light,1.8);
  return fin('M20 29L7 22L10 33L7 43L20 38Z',c) +
    fin('M17 29Q20 10 37 9L45 15L51 21L55 28Z',c) + fin('M17 36Q25 56 42 52L48 44L55 36Z',c) +
    skin('M17 32Q23 13 39 16Q52 17 58 30L58 35Q46 51 32 47Q21 45 17 36Z',c) +
    P('M20 35Q32 39 48 28L57 30L58 35Q46 51 32 47Q22 44 20 35Z',c.belly,'none') + markings(c) +
    L('M22 32Q34 25 48 32M52 34L58 33M23 21L27 24M30 15L33 19M24 45L28 42M34 49L36 45',c.shadow,1.5) +
    eye(49,26,c,2.8) + eye(46,35,c,2.6) + fin('M41 29L34 34L40 38L44 33Z',c) + glint('M29 21Q36 17 42 21',c);
}

// Sturgeon: asymmetrical tail, armour scutes and an underslung pointed snout.
function sturgeon(c) {
  return fin('M20 29L6 12L10 31L6 41L20 36Z',c) + fin('M22 26L27 14L34 23Z',c) + fin('M28 37L29 49L40 39Z',c) +
    skin('M18 30Q31 20 44 25L59 32L54 35L49 34Q36 43 19 36Z',c) +
    P('M21 34Q37 32 48 31L53 33L47 37Q35 43 21 36Z',c.belly,'none') +
    P('M21 29L25 23L29 27L32 21L36 26L40 23L44 28L48 27L50 31Z',c.back,INK,1.4) +
    P('M23 32L27 29L31 32L28 36ZM32 31L36 28L40 31L37 35ZM41 31L44 29L47 32L44 35Z',c.light,c.shadow,1.1) +
    fin('M43 34L36 44L45 40L48 35Z',c) + L('M50 35L49 41M53 35L53 39M11 20L15 29',c.light,1.7) +
    eye(48,29,c,2.1) + glint('M25 25L28 27M33 23L36 26M41 25L44 28',c);
}

// Gar / spearfish: long beak balanced by a narrow crescent tail.
function gar(c) {
  const bill = c.trait === 'spear';
  return fin('M18 31L6 17L10 32L6 47L19 37Z',c) +
    fin(bill ? 'M21 28L29 9L34 12L35 25Z' : 'M19 29L22 19L30 24L32 29Z',c) + fin('M25 36L28 46L36 37Z',c) +
    skin(bill ? 'M17 32Q31 20 42 26L60 29L45 32L43 37Q29 43 18 36Z' : 'M17 32Q30 23 41 27L59 27L60 31L46 34Q32 42 18 36Z',c) +
    P('M20 35Q32 31 43 31L45 33L41 37Q30 42 20 36Z',c.belly,'none') +
    (c.pattern === 'spots' ? dots([[24,31],[29,28],[34,29],[30,35],[37,34]],c.mark,1.7) : markings(c)) +
    fin('M38 33L29 41L39 39L43 34Z',c) + L(bill ? 'M43 29L53 29M39 27L39 32' : 'M44 30L59 29M40 29L40 33',c.shadow,1.4) +
    eye(41,28,c,2.2) + glint('M23 29Q30 25 36 27',c);
}

// Angler: heavy round body, enormous toothed jaw and a separate luminous lure.
function angler(c) {
  return fin('M19 29L6 21L9 33L6 43L20 39Z',c) + fin('M23 24L25 14L32 19L36 13L42 22Z',c) +
    fin('M27 40L27 53L39 47L43 39Z',c) +
    skin('M17 32C20 17 40 15 49 23L57 28L54 33L59 41Q49 52 33 47Q20 44 17 32Z',c) +
    P('M22 37Q36 42 49 31L55 33L59 41Q47 53 31 45Z',c.belly,'none') +
    P('M40 30L55 28L51 34L58 41Q42 47 39 36Z',c.shadow,INK,1.5) +
    P('M42 30L45 36L47 29L49 34L53 29M43 40L45 35L48 42L50 36L53 42',c.light,'none') +
    fin('M33 33L24 41L30 47L39 39Z',c) + eye(44,25,c,3) +
    L('M35 20Q31 5 44 6Q53 6 53 14',c.shadow,3) + L('M35 18Q34 8 43 8',c.light,1.6) +
    C(53,14,6,c.mark,'none') + C(53,14,4,'#f9efac',INK,1.7) + C(52,13,1.8,'#fffde6') +
    dots([[25,29],[29,24],[23,35]],c.mark,1.5) + glint('M21 29L24 25',c);
}

// Lungfish / loach / snakehead: continuous dorsal, rounded tail and fleshy paired fins.
function lungfish(c) {
  return fin('M10 36Q7 22 16 17Q27 12 44 18L49 25L25 31Z',c) +
    skin('M7 37Q6 27 15 26Q22 28 27 24Q45 14 55 25L59 31L56 37Q43 45 31 37Q23 33 17 43Q10 50 7 37Z',c) +
    P('M10 35Q16 40 24 32Q34 27 46 30L57 31L56 37Q43 45 31 37Q23 33 17 43Q11 48 10 35Z',c.belly,'none') +
    P('M25 27Q40 20 49 25L47 28Q36 25 28 30Z',c.back,'none') + markings(c) +
    (c.trait === 'loach'
      ? fin('M42 33L34 40L43 41L48 35Z',c) + L('M56 34Q59 39 54 41M53 35L51 40',c.light,1.5)
      : fin('M42 34Q37 41 43 50L47 48Q43 40 49 36Z',c) + fin('M26 34Q21 42 23 48L27 45L30 36Z',c)) +
    L('M46 25Q43 30 47 35M53 33L58 32',c.shadow,1.6) + eye(51,27,c,2.5) +
    glint('M28 24Q36 19 43 22',c);
}

const templates = { perch, carp, trout, minnow, pike, eel, catfish, flat, sturgeon, gar, angler, lungfish };
const fish = {};
function add(id, name, description, kind, body, finColor, mark, pattern = '', trait = '', extra = () => '', options = {}) {
  const c = { body, fin: finColor, mark, pattern, trait, legend: id.startsWith('legend_'),
    shadow: mix(body, '#201d25', .57), back: mix(body, '#222f2d', .35),
    belly: mix(body, '#f2dfaf', .48), light: mix(body, '#fff5dd', .68), ...options };
  fish[id] = { name, description, art: templates[kind](c) + extra(c) };
}

// River fish.
add('silver_perch', 'Silver Perch', 'Bites at anything shiny, including its own reflection.', 'perch', '#a9bfc3', '#6d8c9d', '#4d6874', 'bars');
add('mudlip_gudgeon', 'Mudlip Gudgeon', 'A small brown opinion on the state of the riverbed.', 'minnow', '#ac895e', '#946245', '#634d3c', 'spots', '', c =>
  P('M53 31L58 30L59 34L54 36Z','#79604b',INK,1.4) + L('M56 36Q55 41 50 39',c.light,1.5));
add('ford_dace', 'Ford Dace', 'Lives where carts cross and has seen every wheel in the province.', 'minnow', '#aabfb2', '#9f9d75', '#647c6b', 'stripe');
add('millrace_chub', 'Millrace Chub', 'Fat from stolen grain. The miller wants a word.', 'carp', '#ab9862', '#a3734d', '#7f6c45', 'scales');
add('redfin_roach', 'Redfin Roach', 'Common as mud and twice as easy to cook.', 'carp', '#b8c2bf', '#d94d3d', '#778e8e', 'double', '', () => '', { iris:'#ee8c4e' });
add('tollbridge_pike', 'Tollbridge Pike', 'Waits under bridges and charges whatever it can swallow.', 'pike', '#7d9560', '#9e9a50', '#d7d09b', 'spots');
add('dawn_grayling', 'Dawn Grayling', 'Rises with the mist and is gone by breakfast.', 'trout', '#b7adc5', '#ae729f', '#765683', 'pearls', 'grayling');
add('copper_barbel', 'Copper Barbel', 'Whiskered, heavy and stubborn. Pulls like a debt.', 'carp', '#be8951', '#a65e3c', '#865c38', 'scales', 'barbel');
add('lantern_eel', 'Lantern Eel', 'Glows faintly. Tastes of nothing you can prove.', 'eel', '#619d92', '#9bb980', '#d5e994', 'spots', 'lure', () => '', { belly:'#b4d9a2' });
add('brook_speckle', 'Brook Speckle', 'A small trout with a great many freckles and no patience.', 'trout', '#9a9d67', '#c87b4d', '#6c392b', 'rings');
add('weir_salmon', 'Weir Salmon', 'Has jumped every weir in Torbor Downs and resents all of them.', 'trout', '#8aa3a5', '#8d8796', '#b97575', 'stripe', '', c =>
  dots([[29,25],[35,24],[40,25]],c.shadow,1.1));
add('pilgrim_trout', 'Pilgrim Trout', 'Swims upstream to Saint Orrin’s every year. Nobody knows what it prays for.', 'trout', '#c3bc9c', '#b39568', '#a96141', 'freckles');
add('reeves_sturgeon', 'Reeve’s Sturgeon', 'By old law it belongs to the reeve. By older law, to whoever lands it.', 'sturgeon', '#9ba694', '#75816a', '#ccd0a9');

// Lakes.
add('pond_bream', 'Pond Bream', 'Flat, calm and entirely without ambition.', 'carp', '#b7ab82', '#988968', '#847a61', 'double', 'tall');
add('greenback_carp', 'Greenback Carp', 'Older than most hamlets and not shy about it.', 'carp', '#799864', '#b19550', '#4c6f49', 'scales', 'barbel');
add('reed_rudd', 'Reed Rudd', 'Hides in the reeds. Badly.', 'carp', '#d0b86a', '#c66b41', '#a08448', 'pearls', '', () => '', { back:'#81945e' });
add('stone_loach', 'Stone Loach', 'Looks like a pebble. Fights like one too.', 'lungfish', '#b5a98e', '#a19778', '#746c56', 'marble', 'loach');
add('moon_tench', 'Moon Tench', 'Slick, green and only awake when you would rather not be.', 'carp', '#527d62', '#627763', '#c9ddbd', 'moon', '', () => '', { belly:'#92ad81' });
add('gullwick_whitefish', 'Gullwick Whitefish', 'The lakes’ daily bread. The gulls agree.', 'minnow', '#c7d6cf', '#8ba89b', '#91a9aa', 'double');
add('glass_minnow', 'Glass Minnow', 'You can see its lunch. It can see yours.', 'minnow', '#b9dcd7', '#a7cfbd', '#80a7a6', 'glass', '', () => '', { belly:'#dae9d0' });
add('mere_zander', 'Mere Zander', 'All teeth and bad temper, wrapped in a nice fillet.', 'perch', '#919b6a', '#91a183', '#4b634d', 'bars', '', c =>
  P('M53 34L54 37L55 34M56 33L57 36L58 33',c.light,'none'));
add('deepwater_char', 'Deepwater Char', 'Comes up from the cold dark for one reason: your bait.', 'trout', '#5d808b', '#c07c51', '#e6bd79', 'pearls', '', () => '', { belly:'#bf8e67' });
add('pale_carp', 'Pale Carp', 'White as a sheet. The monks say it is a sign. They say that about everything.', 'carp', '#e4dece', '#c7b5ad', '#b9b7b1', 'scales', 'barbel', () => '', { iris:'#d78b87' });
add('coldwater_lamprey', 'Coldwater Lamprey', 'Not a fish you catch so much as one you detach.', 'eel', '#939a93', '#727e80', '#53666b', 'bars', 'lamprey', () => '', { belly:'#bac6c0' });
add('crowned_pike', 'Crowned Pike', 'Wears a ridge of bony knobs and rules its bay like a bad baron.', 'pike', '#8e9a56', '#a98441', '#cac18a', 'marble', 'crown');

// Marshes.
add('bog_bullhead', 'Bog Bullhead', 'All head. The rest is an afterthought.', 'catfish', '#8b784e', '#937e55', '#4e553b', 'marble', 'bullhead');
add('fen_stickleback', 'Fen Stickleback', 'Three spines and a grudge.', 'perch', '#88a08c', '#9d9164', '#5b7565', 'plates', 'three_spines', () => '', { belly:'#d49b79' });
add('mire_mudskipper', 'Mire Mudskipper', 'Technically a fish. It has heard the arguments.', 'catfish', '#a39160', '#a97946', '#6c754b', 'spots', 'skipper');
add('black_weatherfish', 'Black Weatherfish', 'Wriggles before rain. Wriggles after rain. A poor forecaster.', 'lungfish', '#5d6455', '#6e7964', '#c1ad74', 'double', 'loach', () => '', { belly:'#8c9675' });
add('brackwater_eel', 'Brackwater Eel', 'The fen’s main export, after damp.', 'eel', '#93885d', '#82754e', '#534e35', 'stripe');
add('wisp_gar', 'Wisp Gar', 'Follows marsh lights around at night. Nobody has asked why.', 'gar', '#85a889', '#94c9b7', '#d0e8bc', 'spots', '', c =>
  L('M47 27L57 27',c.light,1.6), { belly:'#b8d1aa' });
add('sedge_snakehead', 'Sedge Snakehead', 'Breathes air, crosses fields and has opinions about ducks.', 'lungfish', '#9e9a5e', '#7b8b4b', '#555a32', 'marble', '', c =>
  P('M48 22L56 27L58 31L51 29Z',c.back,'none') + eye(52,27,c,2.5));
add('peat_catfish', 'Peat Catfish', 'Brown water, brown fish, brown stew. Delicious.', 'catfish', '#9b744f', '#b58b5b', '#685039', 'spots');
add('sunkenlight_angler', 'Sunkenlight Angler', 'Carries its own lamp, which is more than most fen travellers do.', 'angler', '#6f8c75', '#967e56', '#a9c977');
add('greywhisker_wels', 'Greywhisker Wels', 'A catfish the size of a calf. Something has been feeding it.', 'catfish', '#839393', '#728789', '#526f6b', 'marble', '', c =>
  L('M51 37Q49 54 35 54M55 35Q62 47 51 50', '#ced6c6',2));
add('oldmud_lungfish', 'Oldmud Lungfish', 'Sleeps through droughts and wakes up angry. Has seen four of them.', 'lungfish', '#9c8664', '#927956', '#62503d', 'marble', '', c =>
  L('M37 25L40 31M39 24L43 30',c.light,1.8));

// Coast.
add('harbour_sprat', 'Harbour Sprat', 'Comes by the thousand. You will catch one.', 'minnow', '#9cbdbb', '#81a5aa', '#dbe7d1', 'stripe');
add('sand_dab', 'Sand Dab', 'Flat on purpose.', 'flat', '#c7b181', '#b29a66', '#927e50', 'spots');
add('saltmouth_herring', 'Saltmouth Herring', 'Smoked, salted, pickled or fresh. The town does little else.', 'minnow', '#a6b9cc', '#6e91b2', '#597c9b', 'double', '', c =>
  dots([[28,34],[33,35],[38,34]],c.light,1.2));
add('tide_mullet', 'Tide Mullet', 'Arrives with the tide and leaves with your bait.', 'trout', '#b0b5a0', '#8d9476', '#737f6a', 'double', '', c =>
  P('M21 26L24 18L28 25Z',c.fin,INK,1.5));
add('rock_wrasse', 'Rock Wrasse', 'Bright as a painted door and about as easy to get out of the rocks.', 'perch', '#d08259', '#589c9d', '#68c0aa', 'bars', '', c =>
  L('M46 25L51 22M46 33L50 37M52 30L56 31','#f1d18a',1.8), { belly:'#e7aa72' });
add('grey_gurnard', 'Grey Gurnard', 'Grunts when landed. So would you.', 'perch', '#99a2a0', '#829b9e', '#6a7a7a', 'plates', '', c =>
  fin('M43 32L23 38L17 53L35 49L49 36Z',c) + P('M43 35L25 42L24 48L36 45Z','#739eae','none') + L('M43 35L26 47M42 37L35 46M49 38L52 47M47 39L47 49',c.light,1.6));
add('wreckers_conger', 'Wreckers’ Conger', 'Lives in sunk hulls and guards cargo it has no use for.', 'eel', '#77918f', '#526d6c', '#476367', 'spots', '', c =>
  L('M37 20L42 27M39 19L44 25',c.light,1.8), { belly:'#bac6ad' });
add('storm_bass', 'Storm Bass', 'Feeds in the surf when sensible people are indoors.', 'perch', '#6e8e9e', '#637e9c', '#bccfca', 'stripe', '', c =>
  L('M27 25L31 29L34 26L38 31',c.light,1.6), { belly:'#b6c8be' });
add('moonscale_ray', 'Moonscale Ray', 'Glides in on bright nights. Handle from the polite end.', 'flat', '#c5d3df', '#9cacc7', '#f2eddc', '', 'ray', () => '', { belly:'#e4e8e3' });
add('longbill_spearfish', 'Longbill Spearfish', 'Every captain in Saltmouth has nearly caught one. Ask them. At length.', 'gar', '#6b9fb8', '#506d9b', '#b6ded4', 'double', 'spear', c =>
  L('M26 22L29 15M30 23L32 17',c.light,1.5));

// Local catches and the upper provinces.
add('foldside_tench', 'Foldside Tench', 'Fat, slow and fond of the sheep-wash. The first fish most Torbor children land.', 'carp', '#a6a45f', '#9b8a4c', '#7e884b', 'spots', '', () => '', { iris:'#dc994f' });
add('sheepwash_trout', 'Sheepwash Trout', 'Lies under the fold bridge and judges every bait on its merits.', 'trout', '#c0b17d', '#d09260', '#9e513d', 'spots', '', c =>
  L('M22 32Q33 29 41 31','#e6c78c',1.8));
add('sedge_pickerel', 'Sedge Pickerel', 'A pike in miniature with a pike’s opinion of itself.', 'pike', '#b0aa63', '#b79b52', '#5f784b', 'tiger');
add('quay_whiting', 'Quay Whiting', 'Shoals under the fish stalls, living on what the gulls drop.', 'trout', '#c7c9b7', '#a9afa0', '#9aab9d', 'stripe', '', c =>
  P('M21 26L24 19L28 25ZM37 23L40 17L44 24Z',c.fin,INK,1.5) + L('M54 35L53 41',c.light,1.6));
add('torbor_goldscale', 'Torbor Goldscale', 'Every scale a new coin. Innkeepers pay for it before it is cooked, so it can be seen on the plate.', 'carp', '#e5b545', '#bd7c36', '#fff0a6', 'scales', '', c =>
  star(30,25,3.2,'#fff6c8') + glint('M26 20Q33 17 39 20',c), { belly:'#f4d47b' });
add('highforce_trout', 'Highforce Trout', 'Holds station under the falls and takes whatever the white water brings.', 'trout', '#8eaba4', '#729eac', '#466b69', 'freckles', '', c =>
  P('M20 34Q32 29 42 31L41 33Q30 31 22 36Z','#b8d2c0','none'));
add('ironback_barbel', 'Ironback Barbel', 'Plated like a gauntlet and about as easy to turn.', 'carp', '#929d9e', '#6d7974', '#68777e', 'plates', 'barbel');
add('kingsrun_salmon', 'Kingsrun Salmon', 'Runs the high rivers once a year and was once reserved for one table.', 'trout', '#b9a19a', '#b55d55', '#d4796f', 'stripe', '', c =>
  dots([[27,27],[33,25],[39,26]],'#655d60',1.4) + P('M52 35Q57 40 58 34L56 33Z',c.body,INK,1.4));
add('tarn_whitefish', 'Tarn Whitefish', 'Pale as the snowmelt it lives in, and nearly as cold to hold.', 'trout', '#dee3d9', '#a6bbc3', '#9cb2bb', 'pearls', '', () => '', { belly:'#f4f0d9' });
add('deepmere_pike', 'Deepmere Pike', 'Old enough to have outlived the boat that first hooked it.', 'pike', '#658277', '#64765c', '#b2c2a1', 'marble', '', c =>
  L('M31 26L37 37M34 25L40 36',c.light,1.7) + P('M53 31L56 31L55 34Z',c.shadow,'none'));
add('starless_char', 'Starless Char', 'Black above, black below; anglers find it by the hole it leaves in the reflections.', 'trout', '#39474f', '#4d5667', '#798e9b', '', '', c =>
  L('M21 35Q31 40 38 39','#72818c',1.8), { belly:'#39434c', back:'#242d36', light:'#8d9da5', iris:'#b1c0bb' });
add('blackwater_bowfin', 'Blackwater Bowfin', 'Breathes air when the bog runs out of anything better.', 'lungfish', '#6f8061', '#687e52', '#45593d', 'tiger', '', c =>
  C(18,32,4,'#c9b773',INK,1.2) + C(18,32,2.2,'#303c2e'));
add('fenlord_catfish', 'Fenlord Catfish', 'Rules a mile of drowned ditch and takes tribute in ducklings.', 'catfish', '#596d53', '#8e9061', '#c0b86e', 'pearls', '', c =>
  L('M51 37Q50 52 40 53',c.light,2) + P('M32 21L32 15L36 18L39 13L42 21Z',c.fin,INK,1.6));
add('shoal_mackerel', 'Shoal Mackerel', 'Comes in thousands or not at all.', 'minnow', '#75aba8', '#638e9f', '#355b65', 'tiger', '', () => '', { belly:'#cedbd0' });
add('greatfin_tunny', 'Greatfin Tunny', 'Fast enough to be somewhere else before the float settles.', 'minnow', '#668fa5', '#d5b85e', '#497187', 'double', 'tunny', () => '', { belly:'#c4c8b0' });
add('abyss_halibut', 'Abyss Halibut', 'A flat acre of muscle from where the charts stop. Both eyes are on you.', 'flat', '#647e83', '#718e94', '#a5b7aa', 'marble', '', c =>
  L('M29 22L34 28M32 21L37 27',c.light,1.8), { belly:'#8fa399', iris:'#e6c67a' });

// Legends: a fine warm rim surrounds the actual animal. Each has its own story marks.
add('legend_old_ploughshare', 'Old Ploughshare', 'A carp as long as a harrow, seen in the Torbor every spring since the bridge was wood.', 'carp', '#ad915a', '#806c3c', '#d2b978', 'scales', 'barbel', c =>
  L('M24 26L34 39M28 24L37 37','#ecdbac',2.1) + P('M43 16L45 9L48 14L52 11L53 23Z','#c5aa65',INK,1.7) + L('M29 44Q34 47 40 45',gold,1.5));
add('legend_the_penitent', 'The Penitent', 'A white trout that circles the pilgrims’ ford and has never once taken a blessed bait.', 'trout', '#eee9d8', '#d9c6a9', '#cabda3', 'freckles', '', c =>
  P('M44 32Q39 41 43 52L47 47L48 37Z','#e8d8b6',INK,1.6) + L('M45 40L44 47','#fff7dc',1.8) +
  L('M47 25L48 30','#b9927b',1.5), { iris:'#cf8e82', belly:'#f9eed1' });
add('legend_copperjaw', 'Copperjaw', 'A barbel that has swallowed so many miners’ hooks its mouth has gone green.', 'carp', '#b78a55', '#8e6840', '#785a36', 'plates', 'barbel', c =>
  P('M49 33L58 31L59 36L53 42L47 39Z','#b37142',INK,1.7) + P('M51 34L58 33L56 38L51 40L48 38Z','#6eac8d','none') +
  L('M55 38V43Q54 47 51 44L51 41','#d9bd7b',1.8) + L('M49 36Q47 45 42 44','#81b89b',1.8));
add('legend_mossback', 'Mossback', 'A pike so old that things grow on it. Some of the things have names.', 'pike', '#6c8253', '#747343', '#b8bd7b', 'spots', '', c =>
  P('M20 26L21 20L25 21L27 16L31 19L35 16L38 20L42 18L46 24L42 28L39 25L34 28L29 25L24 29Z','#64924d',INK,1.8) +
  L('M34 20L34 8M34 12L29 9M34 16L28 13M34 13L39 9M34 17L40 13','#b8c47a',2) +
  P('M54 33L54 38L56 33',c.light,'none') + L('M25 25L29 22M38 24L41 22','#9fba69',1.8));
add('legend_the_millers_debt', 'The Miller’s Debt', 'The chub that broke three wheels at Millbrook. The miller keeps a list.', 'carp', '#c2a268', '#a47140', '#876436', 'scales', 'tall', c =>
  P('M23 42Q32 51 43 46L44 49Q29 56 22 45Z','#d9be84',INK,1.7) +
  L('M24 24L31 36M29 22L36 35M34 22L41 34','#f3d69d',2.1) + P('M54 31L58 31L58 35L54 36Z','#a68151',INK,1.3));
add('legend_tollkeeper', 'The Tollkeeper', 'A pike under Halsbridge that takes one duck a day and considers it fair.', 'pike', '#6c7964', '#aa9250', '#c7b97e', 'bars', 'crown', c =>
  P('M50 32L58 31L57 38L52 40L48 36Z',c.shadow,INK,1.5) +
  P('M51 33L53 38L54 33M55 32L56 36L58 32',c.light,'none') +
  P('M45 40Q47 48 55 50Q56 42 48 39Z','#e5dbc1',INK,1.4) + L('M46 39L53 48','#9a8b6c',1.3));
add('legend_cistern_pale', 'The Cistern Pale', 'A blind white eel from the flooded cellars of Ashcombe. It finds you by the sound of your heart.', 'eel', '#e7e5d6', '#c8c9bc', '#c5c6ba', '', 'blind', c =>
  L('M35 27Q38 29 39 32M37 37L41 41M23 51L30 52','#b8bda9',1.7), { belly:'#fff3d5', light:'#fff7e5' });
add('legend_snowmelt', 'Snowmelt', 'A char that comes down with the thaw, cold enough to numb the hand that lifts it.', 'trout', '#a3cbd1', '#91b4cc', '#eaf3df', 'rings', '', c =>
  P('M28 40L30 52L34 46L37 54L40 42Z','#d3ede4',INK,1.6) + L('M30 43L31 48M37 45L37 49','#ffffff',1.6) +
  P('M26 23L29 14L32 21L36 12L39 23Z','#dcefe5',INK,1.5), { belly:'#d5e6d7' });
add('legend_grandfather_mud', 'Grandfather Mud', 'A lungfish older than Brackwater. The fen folk leave it bread and do not say why.', 'lungfish', '#95825c', '#a18b53', '#5a6240', 'marble', '', c =>
  L('M53 34Q59 48 46 53M51 36Q50 47 42 48','#d3c6a1',2.1) +
  L('M43 26L46 28M42 30L45 32M34 27L38 30',c.light,1.7) +
  P('M15 24L13 16L18 18L21 13L23 23Z','#788751',INK,1.5));
add('legend_the_fifth_lake', 'The Fifth Lake', 'There are four Gullwick lakes. The fishers say the fifth one swims.', 'carp', '#658c90', '#8caa95', '#bad5bc', 'scales', 'tall', c =>
  P('M21 39Q31 50 45 43L48 47Q37 58 25 50Z','#8db4a1',INK,1.8) +
  L('M25 29Q29 26 33 29Q37 32 41 29M25 35Q29 32 33 35Q37 38 41 35','#d9e4be',2) +
  P('M28 18L27 10L31 12L33 6L37 12L41 10L42 20Z','#87a18a',INK,1.6), { belly:'#a1c4ac' });
add('legend_bellmouth', 'Bellmouth', 'A zander that swallowed the Coldwater chapel bell. On still nights it tolls.', 'perch', '#a8a47a', '#b28e4b', '#646c4a', 'bars', 'sail', c =>
  P('M48 32Q53 25 58 30L58 39Q52 44 48 39Z','#9c753b',INK,1.8) +
  P('M51 32L56 31L56 37Q53 40 51 37Z','#433c2e','none') +
  L('M49 30Q53 27 57 30M49 39Q53 43 58 39','#e9ce82',1.8) + C(54,38,1.4,'#d2b26a'));
add('legend_the_harbourmaster', 'The Harbourmaster', 'A conger that has sunk two skiffs and inspects every hull that comes in.', 'eel', '#596d7a', '#687a86', '#a6b7b6', 'spots', '', c =>
  L('M38 19L43 26M41 17L46 24','#dccb9d',2.1) +
  P('M51 24L58 22L58 28L53 31L49 28Z',c.shadow,INK,1.5) + P('M53 25L54 29L55 24M56 24L57 27L58 23',c.light,'none') +
  E(24,52,4,2.8,'#b69a62',INK,1.3), { belly:'#96a8aa' });
add('legend_red_runner', 'The Red Runner', 'A salmon stained by the cliff clay. It has outrun every net on the frontier.', 'trout', '#c86a4f', '#a74e42', '#e4a16d', 'clay', '', c =>
  L('M28 27L34 35M31 25L38 33','#f8c99a',1.6) +
  P('M8 21L14 29L11 31L16 33L8 42L10 33Z','#cf9a67',INK,1.5) +
  P('M53 35Q58 41 59 34L56 33Z',c.body,INK,1.4), { belly:'#e5ac7c' });
add('legend_deserters_supper', 'Deserter’s Supper', 'A barbel grown fat on rations thrown in the river by men leaving in a hurry.', 'carp', '#a99f68', '#9b8052', '#6d754d', 'marble', 'barbel', c =>
  P('M23 41Q35 51 47 42L48 47Q35 56 25 49Z','#d4bd81',INK,1.7) +
  L('M27 27L35 36M31 25L39 35','#e4d3a0',1.7) + L('M57 36Q60 49 49 48',c.light,2));
add('legend_thornbelly', 'Thornbelly', 'Something the blight got into. The Scar has no water left, so it went downhill to the Coldwater meres, and it is not sorry.', 'angler', '#82718a', '#5b5363', '#b3cb74', '', '', c =>
  P('M22 42L19 53L28 47L31 58L36 49L43 56L44 46L53 50L51 43Z','#403b45',INK,1.8) +
  L('M24 45L22 49M33 49L33 53M44 46L47 48','#a99c9a',1.6) +
  P('M22 23L17 14L26 18L29 9L34 18Z','#49424e',INK,1.6) +
  C(26,30,2.5,'#b8cd7e',INK,1.2), { belly:'#a2929b', iris:'#da8a69' });
add('legend_steeplejack', 'Steeplejack', 'A sturgeon that lives in the nave of a drowned church and is exactly as long as its aisle.', 'sturgeon', '#96a6a2', '#6f8d87', '#d8d8b3', '', '', c =>
  P('M23 26L25 16L29 23L33 9L37 23L41 16L44 28L39 26L35 28L30 25L27 28Z','#b6bd9f',INK,1.7) +
  L('M33 13V24M25 20L27 25M41 21L42 25','#f2dfac',1.5) +
  L('M28 33L31 36M36 31L39 34',c.shadow,1.6));

add('fish', 'Fish', 'A generic silver fish with a blue-grey back, forked tail and clean pale belly.', 'minnow', '#b1c3c4', '#839ba4', '#7d959c', '', '', c =>
  L('M23 32Q34 29 42 30',c.light,2));

export default fish;
