// Thousandvale button artwork. Transparent 32 × 32 compositions; no backing discs.
import { path, line, circle, ring, star, GOLD as G, PALE as P, NIGHT as N, DEEP as D } from '../../js/draw.js';

const shape = (d, fill = G, stroke = D) => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/>`;
const mark = (d, color = N, width = 1.6) => line(d, color, width);
const head = (x, y) => circle(x, y, 3.3, D) + circle(x, y, 2.6, P);
const BLUE = '#6ab8e0';
const RED = '#e57470';

export default {
  // Action bar and touch controls.
  attack: {
    name: 'Attack',
    description: 'A broad, bright sword cuts upward through a short golden swing arc.',
    art: mark('M4 18 C2 9 10 3 19 4', G, 2.2)
      + path('M16 2 L22 4 L17 7 Z', P)
      + shape('M10 20 L21 7 L29 3 L26 12 L15 24 Z', P)
      + path('M12 21 L29 3 L26 12 L15 24 Z', G)
      + mark('M14 20 L24 9', P, 1.5)
      + shape('M8 19 L17 26 L19 23 L10 16 Z', G)
      + shape('M9 22 L12 25 L7 30 L3 27 Z', N, G)
      + mark('M5 27 L7 29', P),
  },
  cast_line: {
    name: 'Cast a line',
    description: 'A bent fishing rod suspends a blue fish from its curved line above a ripple.',
    art: mark('M5 26 Q7 5 22 4', G, 2.2)
      + mark('M8 14 Q12 6 22 4', P, 1.5)
      + mark('M22 4 Q29 8 24 14', P, 1.5)
      + shape('M3 23 L7 24 L6 30 L2 29 Z', N, G)
      + circle(9, 22, 2.6, G) + circle(9, 22, 1.1, N)
      + shape('M24 14 Q29 14 29 19 Q29 23 24 25 L27 30 L22 28 L18 30 L20 24 L17 22 L19 20 Q19 16 24 14 Z', BLUE)
      + path('M21 19 Q20 22 23 24 L25 22 Q22 23 23 19 Z', P)
      + mark('M24 19 L27 20', N, 1.4)
      + circle(25.5, 16.8, 1.2, D)
      + mark('M10 28 Q13 30 16 28', BLUE),
  },
  hook: {
    name: 'Set the hook',
    description: 'A large barbed fishhook pulls upward through a blue splash.',
    art: shape('M2 24 L6 25 L5 20 L11 24 L15 23 L18 26 L24 22 L23 26 L30 24 L27 29 H6 Z', BLUE)
      + mark('M17 8 V19 C17 26 27 26 27 19 V14', D, 2.2)
      + mark('M16 8 V18 C16 25 25 25 25 18 V14', G, 2.2)
      + shape('M25 12 L21 18 L26 16 Z', P)
      + ring(16, 5.5, 3, G, 2)
      + mark('M4 15 L6 17 M29 18 L28 20', BLUE, 2),
  },
  lock: {
    name: 'Locked slot',
    description: 'A heavy gold padlock with a pale shackle and dark keyhole.',
    art: shape('M8 15 V10 C8 0 24 0 24 10 V15 H20 V10 C20 5 12 5 12 10 V15 Z', P)
      + shape('M6 13 H26 V27 Q16 31 6 27 Z')
      + path('M7 24 Q16 27 25 24 V27 Q16 30 7 27 Z', N)
      + mark('M9 16 H23', P)
      + circle(16, 20, 2.7, D)
      + path('M15 21 H17 L18 25 H14 Z', D),
  },
  mount: {
    name: 'Summon mount',
    description: 'A proud horse in profile wears a gold bridle over its long pale muzzle.',
    art: shape('M5 29 Q4 20 9 13 L12 9 L11 3 L16 7 L20 3 L20 10 L28 17 L27 22 L22 23 L18 19 Q16 24 20 29 Z', G)
      + path('M11 9 Q5 19 7 28 H12 Q9 22 14 15 L16 10 Z', N)
      + path('M18 9 L19 12 L26 18 L24 20 L20 18 L16 14 Z', P)
      + mark('M17 9 L15 16 L24 22 M22 15 L20 21', N, 1.8)
      + circle(19.5, 12.7, 1.2, D)
      + circle(25.5, 18.8, .9, D)
      + circle(16, 17, 1.7, P)
      + mark('M16 19 Q19 26 25 25', G),
  },
  jump: {
    name: 'Jump',
    description: 'A figure springs upward, arms raised and both knees bent above the ground.',
    art: mark('M4 27 V19 M28 25 V17 M10 29 H21', G, 1.8)
      + shape('M12 12 L8 14 L4 9 L6 7 L10 10 L13 9 H18 L23 5 L26 7 L20 13 L19 18 L25 21 L22 26 L19 25 L20 22 L16 21 L12 24 L7 22 L8 19 L12 20 L13 17 Z')
      + path('M14 11 H18 L17 17 H13 Z', P)
      + head(15, 5),
  },
  target: {
    name: 'Target enemy',
    description: 'Four gold sight brackets frame a red watchful eye with a slit pupil.',
    art: mark('M4 11 V4 H11 M21 4 H28 V11 M28 21 V28 H21 M11 28 H4 V21', G, 2.2)
      + shape('M6 16 Q16 5 26 16 Q16 27 6 16 Z', RED)
      + path('M16 10 L19 16 L16 22 L13 16 Z', D)
      + circle(17, 13, 1.1, P)
      + mark('M16 2 V6 M16 26 V30 M2 16 H6 M26 16 H30', P, 1.8),
  },
  ally: {
    name: 'Target ally',
    description: 'A warm red heart carries a small pale healing plus at its upper right.',
    art: shape('M15 28 C11 24 3 19 3 12 C3 5 12 3 16 9 C20 4 27 7 27 13 C27 20 20 25 15 28 Z', RED)
      + mark('M7 13 Q6 9 10 9', P, 1.8)
      + shape('M22 3 H26 V7 H30 V11 H26 V15 H22 V11 H18 V7 H22 Z', P),
  },
  belt: {
    name: 'Potion belt',
    description: 'A round red potion bottle is secured in a broad buckled leather belt loop.',
    art: shape('M2 19 H30 V26 H2 Z', N, G)
      + shape('M11 3 H21 V7 H19 V11 Q24 13 24 18 V26 Q16 30 8 26 V18 Q8 13 13 11 V7 H11 Z', P)
      + path('M11 17 Q16 19 21 17 V25 Q16 28 11 25 Z', RED)
      + shape('M7 22 H25 V27 Q16 31 7 27 Z', N, G)
      + shape('M13 22 H19 V28 H13 Z', G)
      + path('M15 24 H17 V26 H15 Z', D)
      + mark('M12 5 H20', N, 1.8)
      + circle(4.5, 22.5, 1, P) + circle(27.5, 22.5, 1, P),
  },
  wheel: {
    name: 'Quick wheel',
    description: 'Six separate gold wedges form a radial selection wheel around an open centre.',
    art: shape('M18 3 Q24 4 27 9 L22 12 Q21 10 18 9 Z', P)
      + shape('M29 12 Q31 17 28 22 L23 19 Q24 16 23 15 Z')
      + shape('M26 25 Q23 29 18 29 V23 Q21 23 22 21 Z')
      + shape('M14 29 Q8 28 5 24 L10 21 Q12 23 14 23 Z', P)
      + shape('M3 21 Q1 16 4 11 L9 14 Q8 17 9 18 Z')
      + shape('M6 8 Q9 4 14 3 V9 Q12 9 10 11 Z')
      + circle(16, 16, 2.2, P),
  },
  chat: {
    name: 'Chat',
    description: 'A rolled parchment speech bubble has a clear pointed tail and three ink dots.',
    art: shape('M6 5 H25 Q29 5 29 9 V22 H15 L8 28 V22 H4 V9 Q4 5 6 5 Z', P)
      + path('M24 6 H26 Q28 6 28 9 V21 H24 Z', G)
      + mark('M7 5 Q11 6 9 10 H4 M24 18 H28', N)
      + circle(11, 15, 1.5, N) + circle(16, 15, 1.5, N) + circle(21, 15, 1.5, N),
  },
  close: {
    name: 'Close',
    description: 'Two broad bevelled gold strokes cross into a clear close mark.',
    art: shape('M6 3 L29 26 L26 29 L3 6 Z')
      + path('M6 3 L29 26 L27 26 L5 5 Z', P)
      + shape('M26 3 L29 6 L6 29 L3 26 Z')
      + path('M26 3 L28 5 L5 28 L3 26 Z', P),
  },
  menu: {
    name: 'Menu',
    description: 'Three solid pale bars are capped with round golden rivets.',
    art: shape('M4 4 H28 V10 H4 Z M4 13 H28 V19 H4 Z M4 22 H28 V28 H4 Z', P)
      + path('M5 8 H27 V10 H5 Z M5 17 H27 V19 H5 Z M5 26 H27 V28 H5 Z', G)
      + circle(8, 7, 1.8, G) + circle(8, 16, 1.8, G) + circle(8, 25, 1.8, G)
      + mark('M13 7 H24 M13 16 H24 M13 25 H24', N, 1.5),
  },
  autorun: {
    name: 'Auto run',
    description: 'A sturdy forward-stepping boot follows a pair of rightward motion arrows.',
    art: shape('M8 10 H19 L17 21 L24 23 Q28 24 28 29 H5 V24 L9 21 Z')
      + path('M10 12 H16 L15 20 L11 22 Z', P)
      + mark('M6 26 H26 M12 15 H16 M11 19 H15', N, 1.8)
      + mark('M16 3 L20 6 L16 9 M24 3 L28 6 L24 9', P, 2.2)
      + mark('M2 16 H6 M2 21 H5', G, 1.8),
  },
  camp: {
    name: 'Make camp',
    description: 'A small pitched tent shelters a bright two-tone campfire and crossed logs.',
    art: shape('M2 24 L12 5 L23 24 Z', P)
      + path('M12 7 L14 24 H5 Z', G)
      + path('M12 13 L11 24 H19 Z', N)
      + mark('M2 25 H13', G, 2)
      + shape('M17 26 L29 29 L30 26 L18 23 Z', G)
      + shape('M16 28 L29 23 L30 26 L18 30 Z', P)
      + shape('M23 9 Q24 14 28 17 Q32 24 24 26 Q16 26 17 20 L20 15 L21 19 Q24 16 23 9 Z')
      + path('M24 18 Q28 22 24 24 Q20 24 24 18 Z', P),
  },
  // Window menu.
  party: {
    name: 'Party',
    description: 'Three adventurers stand together, with a pale leader in front of two gold companions.',
    art: circle(7, 10, 3.3, G) + circle(25, 10, 3.3, G)
      + shape('M2 24 V19 Q2 14 7 14 Q12 14 12 19 V24 Z')
      + shape('M20 24 V19 Q20 14 25 14 Q30 14 30 19 V24 Z')
      + shape('M8 29 V23 Q8 16 16 16 Q24 16 24 23 V29 Z', P)
      + path('M11 28 L13 20 L16 24 L19 20 L21 28 Z', G)
      + circle(16, 10, 5, D) + circle(16, 10, 4, P)
      + mark('M16 24 V28', N),
  },
  friends: {
    name: 'Friends',
    description: 'Two welcoming hands clasp firmly between gold cuffs.',
    art: shape('M2 11 L7 8 L14 13 L20 12 L29 19 L25 25 L20 26 L7 19 L4 20 Z', G)
      + shape('M29 9 L25 7 L19 11 L15 10 L10 14 Q8 17 11 18 L16 15 L23 22 L29 17 Z', P)
      + mark('M14 19 L19 23 M17 17 L23 22 M11 21 L15 24', N, 1.5)
      + shape('M2 10 L6 8 L10 19 L6 22 L2 17 Z', N, G)
      + shape('M26 7 L30 9 V17 L27 20 L22 10 Z', N, G)
      + circle(5, 13, 1.1, P) + circle(27, 12, 1.1, P),
  },
  guild: {
    name: 'Guild',
    description: 'A fork-tailed guild banner hangs from a crossbar beside a sturdy pole.',
    art: mark('M6 5 V29 M4 29 H10', P, 2.2)
      + shape('M9 6 H27 V26 L19 22 L11 26 Z')
      + path('M14 8 H24 V20 L19 18 L14 21 Z', N)
      + star(19, 13, 4.3, .4, P)
      + mark('M5 5 H29', G, 2.2)
      + circle(6, 3.5, 1.8, P),
  },
  mail: {
    name: 'Mail',
    description: 'A folded parchment envelope closes beneath a round red wax seal.',
    art: shape('M3 7 H29 V26 H3 Z', P)
      + path('M4 25 L14 16 H18 L28 25 Z', G)
      + mark('M4 24 L12 17 M28 24 L20 17', N, 1.5)
      + shape('M3 7 H29 L16 19 Z', P)
      + circle(16, 18, 4.5, D) + circle(16, 18, 3.8, RED)
      + path('M16 15 L18 18 L16 21 L14 18 Z', P),
  },
  callboard: {
    name: 'Callboard',
    description: 'Two pinned notices overlap on a framed wooden board with short supporting legs.',
    art: shape('M6 22 H10 V30 H6 Z M23 22 H27 V30 H23 Z', G)
      + shape('M2 4 H30 V26 H2 Z')
      + path('M5 7 H27 V23 H5 Z', N)
      + shape('M7 8 L18 9 L17 22 L6 21 Z', P)
      + shape('M19 10 L27 8 L28 20 L20 22 Z', G)
      + circle(12, 9.5, 1.4, RED) + circle(23, 10.5, 1.4, RED)
      + mark('M9 14 H14 M9 18 H13 M22 15 L25 14', N, 1.5),
  },
  bag: {
    name: 'Backpack',
    description: 'A rounded leather backpack has a rolled flap, shoulder tabs and a buckled front pocket.',
    art: mark('M12 7 V5 Q16 1 20 5 V7', P, 2.2)
      + shape('M5 14 H9 V26 H4 Z M23 14 H27 L28 26 H23 Z', N, G)
      + shape('M7 9 Q16 4 25 9 L26 28 Q16 31 6 28 Z')
      + shape('M7 9 Q16 6 25 9 L23 17 Q16 21 9 17 Z', P)
      + shape('M10 22 H22 V28 H10 Z', N)
      + shape('M14 15 H18 V24 H14 Z', G)
      + mark('M15 19 H17 M13 26 H19', P, 1.5),
  },
  account: {
    name: 'Account',
    description: 'A hooded portrait has a shadowed face framed by a pale cowl and gold shoulders.',
    art: shape('M3 29 L5 23 L10 20 Q5 11 12 4 Q16 1 20 4 Q27 11 22 20 L27 23 L29 29 Z')
      + path('M16 4 Q7 10 11 20 L16 25 L22 20 Q25 11 16 4 Z', P)
      + shape('M11 11 Q16 7 21 11 L20 18 L16 21 L12 18 Z', N)
      + path('M13 12 H19 V17 L16 19 L13 17 Z', G)
      + mark('M13 13 H19', N, 2)
      + path('M7 25 L12 22 L16 28 L20 22 L25 25 L26 28 H6 Z', N)
      + circle(16, 27, 1.5, P),
  },
  map: {
    name: 'Map',
    description: 'A three-fold parchment map carries a winding dotted route to a bold destination cross.',
    art: shape('M2 7 L11 3 L21 7 L30 3 V25 L21 29 L11 25 L2 29 Z', P)
      + path('M11 4 L21 8 V28 L11 24 Z', G)
      + mark('M11 5 V10 M11 21 V24 M21 8 V12 M21 24 V27', N, 1.5)
      + mark('M5 23 L7 20 M8 16 Q9 13 12 14 M15 16 L17 18 M20 19 L22 17', N, 1.8)
      + mark('M23 9 L28 14 M28 9 L23 14', N, 2.2)
      + circle(5, 23, 1.4, G),
  },
  journal: {
    name: 'Quest journal',
    description: 'A thick closed quest book has metal corners, a sun clasp and a long pale bookmark.',
    art: shape('M7 3 H27 V27 H8 Q3 27 3 23 V7 Q3 3 7 3 Z')
      + path('M9 5 H25 V23 H9 Z', N)
      + shape('M7 24 H27 V28 H7 Q4 26 7 24 Z', P)
      + path('M18 24 H23 V31 L20.5 29 L18 31 Z', G)
      + mark('M7 5 V21 M11 6 H15 M23 6 V10 M11 21 H15 M23 18 V21', P, 1.5)
      + star(17, 14, 5, .4, G),
  },
  skills: {
    name: 'Skills',
    description: 'An open two-page spellbook catches the light of a large hovering four-point star.',
    art: shape('M2 12 Q9 9 16 14 Q23 9 30 12 V28 Q22 25 16 29 Q10 25 2 28 Z', G)
      + shape('M4 11 Q10 10 16 14 Q22 10 28 11 V25 Q22 23 16 27 Q10 23 4 25 Z', P)
      + mark('M16 16 V26 M7 17 L11 18 M7 21 L11 22 M21 18 L25 17 M21 22 L25 21', N, 1.5)
      + shape('M16 2 L18 7 L23 9 L18 11 L16 16 L14 11 L9 9 L14 7 Z', G)
      + path('M16 5 L17 8 L20 9 L17 10 L16 13 L15 10 L12 9 L15 8 Z', P)
      + mark('M7 4 L9 5 M25 4 L23 5', G, 1.5),
  },
  perks: {
    name: 'Perks',
    description: 'Three bright skill nodes branch from a single gilded tree junction.',
    art: mark('M16 12 V16 M16 16 L8 23 M16 16 L24 23', G, 2.2)
      + shape('M16 13 L19 16 L16 19 L13 16 Z', P)
      + circle(16, 7, 5.3, D) + circle(16, 7, 4.6, G) + circle(16, 7, 2.5, P)
      + circle(7, 25, 5.3, D) + circle(7, 25, 4.6, G) + circle(7, 25, 2.5, N)
      + circle(25, 25, 5.3, D) + circle(25, 25, 4.6, G) + circle(25, 25, 2.5, P),
  },
  sheet: {
    name: 'Character sheet',
    description: 'A gold-trimmed armoured tunic hangs on a small display stand.',
    art: mark('M16 23 V29 M9 30 H23 M16 3 V6', P, 2.2)
      + shape('M11 5 L6 7 L2 14 L7 17 L10 13 L8 26 H24 L22 13 L25 17 L30 14 L26 7 L21 5 L18 8 H14 Z')
      + path('M11 10 L16 12 L21 10 L20 19 H12 Z', P)
      + path('M10 21 H22 L23 25 H9 Z', N)
      + mark('M16 13 V18 M6 10 L9 11 M23 11 L26 10', N)
      + shape('M14 20 H18 V24 H14 Z', G),
  },
  feedback: {
    name: 'Feedback',
    description: 'A sweeping pale quill writes across a small parchment speech scroll.',
    art: shape('M4 12 H23 V25 H13 L7 30 V25 H3 V16 Q3 12 4 12 Z', G)
      + path('M6 14 H20 V23 H6 Z', P)
      + mark('M7 18 H12 M7 21 H10', N)
      + shape('M12 23 C10 14 18 4 29 2 Q29 15 20 20 L16 20 Z', P)
      + path('M14 21 L27 4 Q27 15 20 18 L17 18 Z', G)
      + mark('M10 27 L25 7 M17 17 L17 12 M20 14 L25 13', N, 1.5),
  },
  help: {
    name: 'Help',
    description: 'A gold-edged parchment carries a question mark drawn from a curved stroke and a dot.',
    art: shape('M8 3 H25 Q29 3 29 7 V9 H25 V25 Q25 29 21 29 H5 Q2 29 2 25 V23 H7 V7 H4 Q4 3 8 3 Z', P)
      + path('M23 4 H25 Q27 4 27 7 H23 Z M3 24 H20 V27 H6 Q3 27 3 24 Z', G)
      + mark('M11 11 C11 6 20 6 20 11 C20 14 16 14 16 18', N, 2.2)
      + circle(16, 21, 1.5, N)
      + mark('M23 8 V24 Q23 27 20 27', G, 1.5),
  },
  // Emotes share the same pale head, solid gold tunic and broad limbs.
  wave: {
    name: 'Wave',
    description: 'A standing figure raises one hand beside its head in a friendly wave.',
    art: shape('M12 11 H18 L22 15 L23 9 L22 6 L24 4 L26 7 L25 17 L22 19 L18 16 V21 L21 29 H17 L15 23 L13 29 H9 L12 20 L11 16 L7 21 L4 19 L9 12 Z')
      + path('M13 12 H17 V19 H13 Z', P)
      + head(15, 6)
      + mark('M28 4 L29 7 M19 3 L20 5', P, 1.5),
  },
  sit: {
    name: 'Sit',
    description: 'A relaxed figure sits upright on a low stool, with its knees forward and feet planted.',
    art: shape('M4 21 H16 V25 H4 Z M5 25 H8 V30 H5 Z M13 25 H16 V30 H13 Z', N, G)
      + shape('M10 11 H15 L17 16 L21 16 V19 H15 L13 16 L14 20 H23 L26 28 H29 V30 H22 L20 24 H12 Q8 23 9 19 Z')
      + path('M11 12 H14 V19 H10 Z', P)
      + mark('M17 23 L20 28 H23', N, 1.5)
      + head(12, 6),
  },
  dance: {
    name: 'Dance',
    description: 'A dancer leans into a step with one bent arm up and one leg kicked sideways.',
    art: shape('M13 10 L18 11 L23 14 L26 8 L29 10 L25 18 L22 18 L19 16 L17 21 L22 23 L27 20 L29 23 L23 27 L15 24 L12 29 H8 L12 20 L13 15 L8 13 L5 17 L2 15 L7 9 Z')
      + path('M14 11 L18 12 L16 19 L13 18 Z', P)
      + head(17, 5)
      + mark('M4 25 L6 23 M23 5 L25 3', P, 1.5),
  },
  cheer: {
    name: 'Cheer',
    description: 'A triumphant figure lifts both fists high and plants its feet wide apart.',
    art: shape('M12 12 L7 8 L6 3 L2 4 L4 11 L11 17 L12 21 L8 29 H12 L16 23 L20 29 H24 L20 20 L21 17 L28 11 L30 4 L26 3 L25 8 L20 12 Z')
      + path('M13 13 H19 L18 20 H14 Z', P)
      + head(16, 7),
  },
  bow: {
    name: 'Bow',
    description: 'A figure bends deeply at the waist, lowering its head and folding an arm across its chest.',
    art: shape('M9 11 L20 12 L22 17 L18 19 L13 16 L12 21 L19 28 L16 30 L9 24 L7 29 H3 L7 20 L7 15 Z')
      + path('M11 12 L19 14 L19 17 L11 15 Z', P)
      + shape('M18 17 L24 21 L22 24 L15 20 Z')
      + head(25, 15)
      + mark('M23 6 Q27 7 28 10', P, 1.6),
  },
  point: {
    name: 'Point',
    description: 'A standing figure extends one arm and finger straight toward the right.',
    art: shape('M8 11 H15 L20 12 L27 10 H30 V13 L25 15 L17 16 L15 15 V21 L18 29 H14 L11 23 L9 29 H5 L8 20 L7 16 L5 22 L2 21 L5 13 Z')
      + path('M9 12 H13 V19 H9 Z', P)
      + head(11, 6),
  },

  // Professions use their assigned accent and the shared spell palette.
  prof_mining: {
    name: 'Mining',
    description: 'A gold-handled pickaxe strikes a faceted copper-coloured ore boulder.',
    art: shape('M15 29 L13 23 L18 18 L25 17 L30 24 L28 29 Z', '#c9824a')
      + path('M18 19 L23 19 L21 24 L15 24 Z', P)
      + path('M22 25 L29 23 L27 28 H20 Z', G)
      + mark('M21 24 L24 27', N)
      + shape('M5 28 L8 30 L22 8 L19 6 Z')
      + shape('M7 3 Q23 0 27 20 L22 12 L18 8 L10 6 Z', P)
      + path('M10 5 L18 5 L24 12 L18 8 L10 6 Z', G)
      + star(27, 19.5, 3, .32, P)
      + mark('M29 12 L30 10 M24 13 V10', P, 1.8),
  },
  prof_logging: {
    name: 'Logging',
    description: 'A broad axe bites into a mossy cut log with visible growth rings.',
    art: shape('M3 20 L23 16 L28 18 L29 27 L23 30 L3 28 Z')
      + path('M4 21 L20 18 L23 21 L4 25 Z', '#7fb069')
      + shape('M23 17 Q30 17 30 24 Q30 30 24 30 Q18 29 18 24 Q18 19 23 17 Z', P)
      + mark('M25 21 Q21 20 21 24 Q21 28 26 27 M25 23 V25', N, 1.5)
      + mark('M5 27 L15 25', N)
      + shape('M7 26 L10 28 L22 5 L19 3 Z', G)
      + shape('M17 5 L22 8 L18 17 Q10 16 6 9 L10 5 Q13 7 17 5 Z', P)
      + path('M7 9 L10 8 Q12 13 19 14 L18 16 Q10 15 7 9 Z', G)
      + mark('M16 20 L18 23', N, 1.8),
  },
  prof_foraging: {
    name: 'Foraging',
    description: 'A forked herb sprig bears broad gold leaves and a cluster of purple berries.',
    art: mark('M14 29 L17 9 M15 22 L7 17 M16 17 L24 12', G, 2)
      + shape('M14 23 Q4 24 3 14 Q12 13 14 23 Z', G)
      + shape('M17 18 Q17 8 27 9 Q27 17 17 18 Z', P)
      + shape('M17 12 Q10 8 14 2 Q21 5 17 12 Z', G)
      + mark('M7 18 L12 21 M21 14 L25 11', N, 1.5)
      + circle(22, 22, 4, D) + circle(22, 22, 3.2, '#c58bff')
      + circle(27, 23, 3.6, D) + circle(27, 23, 2.8, '#c58bff')
      + circle(24, 27, 3.7, D) + circle(24, 27, 2.9, '#c58bff')
      + circle(21.4, 21, 1, P) + circle(23.5, 26, .9, P),
  },
  prof_skinning: {
    name: 'Skinning',
    description: 'A curved skinning knife rests over a stretched tan hide with four splayed corners.',
    art: shape('M10 10 L14 12 L20 11 L24 9 L29 14 Q24 18 28 25 L24 30 L19 27 L13 28 L9 30 L5 26 Q9 21 5 16 Z', '#d9a066')
      + path('M13 15 Q17 18 22 14 L22 24 L15 26 L11 23 Z', G)
      + mark('M10 20 L12 22 M21 25 L23 23', N, 1.5)
      + shape('M11 5 L16 8 Q21 12 28 9 Q23 21 13 13 L8 9 Z', P)
      + path('M12 8 Q20 15 26 11 Q21 18 13 12 Z', G)
      + shape('M3 3 Q4 1 6 3 L12 7 L9 11 L3 7 Z', N, G)
      + circle(5.5, 5.3, 1, P),
  },
  prof_angling: {
    name: 'Angling',
    description: 'A small arched rod and reel lift a broad blue fish with a forked tail.',
    art: mark('M4 18 Q9 1 24 4', G, 2.2)
      + mark('M24 4 Q29 9 23 17', P, 1.5)
      + shape('M2 16 L6 17 L4 25 L1 24 Z', N, G)
      + circle(8, 16, 2.5, P) + circle(8, 16, 1.1, N)
      + shape('M11 21 Q17 15 26 19 L30 22 L26 26 Q18 30 11 25 L6 29 L7 23 L6 18 Z', BLUE)
      + path('M13 24 Q20 28 27 23 Q21 24 17 22 Z', P)
      + path('M16 18 L20 14 L23 18 Z', BLUE)
      + mark('M24 20 Q22 23 24 25', N, 1.5)
      + circle(27, 21, 1, D),
  },
  prof_smithing: {
    name: 'Smithing',
    description: 'A heavy forging hammer strikes a wide gold anvil in a burst of orange sparks.',
    art: shape('M2 17 H30 L27 22 H21 L20 25 L26 28 V30 H8 V28 L13 25 L12 22 L6 21 Z', G)
      + path('M4 18 H28 L26 20 H7 Z', P)
      + path('M14 22 H20 L18 26 H14 Z', N)
      + shape('M5 3 L8 2 L19 14 L16 17 Z', G)
      + shape('M13 7 L18 3 L26 12 L21 16 Z', P)
      + path('M21 11 L24 13 L21 15 L18 12 Z', '#ff9a4a')
      + mark('M5 12 L7 14 M27 6 L29 4 M29 11 H30', '#ff9a4a', 2)
      + star(14, 17, 3, .35, '#ff9a4a'),
  },
  prof_outfitting: {
    name: 'Outfitting',
    description: 'A long-eyed sewing needle draws looping thread through folded rose-coloured cloth.',
    art: shape('M3 14 L18 11 L28 18 L23 30 L4 27 L7 21 Z', '#e58fb0')
      + path('M7 15 L17 13 L23 18 L20 27 L7 25 L10 20 Z', P)
      + mark('M8 18 L10 18 M14 17 L16 16 M8 23 L10 23', N, 1.5)
      + shape('M25 3 Q28 2 28 5 L14 23 L12 25 L13 21 Z', G)
      + mark('M25 5 L23 8', N, 1.5)
      + mark('M25 5 C17 1 12 3 15 8 C19 13 9 15 7 8', P, 1.7),
  },
  prof_alchemy: {
    name: 'Alchemy',
    description: 'A pale glass flask holds bubbling green liquid below an open narrow neck.',
    art: shape('M11 4 H21 V8 H19 V13 L27 24 Q30 29 24 30 H8 Q2 29 5 24 L13 13 V8 H11 Z', P)
      + path('M10 20 Q14 18 17 20 Q21 22 23 20 L27 26 Q28 28 24 28 H8 Q5 28 7 25 Z', '#58c0a0')
      + mark('M13 7 H19 M13 11 V14 L9 19', N, 1.5)
      + circle(12, 24, 1.6, P) + circle(20, 25, 1.2, P)
      + circle(17, 17, 1.6, '#58c0a0')
      + circle(24, 6, 2.1, '#58c0a0') + circle(20, 1.8, 1.2, '#58c0a0'),
  },
  prof_cooking: {
    name: 'Cooking',
    description: 'A round cooking pot with two loop handles sends up three curls of fragrant steam.',
    art: mark('M4 18 Q0 15 3 13 L7 14 M28 18 Q32 15 29 13 L25 14', G, 2)
      + shape('M5 13 H27 L25 25 Q16 32 7 25 Z', '#f0c060')
      + path('M8 21 Q16 27 24 21 L23 25 Q16 29 9 25 Z', G)
      + shape('M4 12 Q16 9 28 12 L27 16 H5 Z', P)
      + mark('M8 13 H24', N, 1.5)
      + mark('M10 8 Q7 6 10 3 M16 7 Q13 5 16 2 M22 8 Q19 6 22 3', P, 1.8)
      + mark('M10 28 L9 30 M22 28 L23 30', G, 2),
  },
  prof_tempering: {
    name: 'Tempering',
    description: 'A cool blue blade slides across a slanted whetstone, throwing a single bright spark.',
    art: shape('M3 21 L20 17 L29 22 L12 28 L3 26 Z', N, G)
      + path('M4 21 L20 18 L27 22 L12 25 Z', P)
      + mark('M12 25 V28', G, 1.5)
      + shape('M10 14 L23 3 L29 2 L27 8 L14 20 Z', '#7fd0ff')
      + path('M13 16 L28 3 L26 8 L15 18 Z', P)
      + shape('M7 13 L16 21 L13 23 L5 15 Z', G)
      + shape('M6 17 L10 21 L6 26 L2 22 Z', N, G)
      + star(22, 20, 5, .3, '#7fd0ff')
      + star(22, 20, 2.8, .3, P),
  },

  // Small utilities, including the full-height equipment mannequin.
  eye: {
    name: 'Visible',
    description: 'A broad pale eye frames a gold iris, dark pupil and bright catchlight.',
    art: shape('M2 16 Q8 6 16 6 Q24 6 30 16 Q24 26 16 26 Q8 26 2 16 Z', G)
      + path('M5 16 Q10 9 16 9 Q22 9 27 16 Q22 23 16 23 Q10 23 5 16 Z', P)
      + circle(16, 16, 6.5, N) + circle(16, 16, 4.7, G)
      + circle(16, 16, 2.8, D) + circle(14.5, 14.3, 1.4, P),
  },
  locate: {
    name: 'Locate',
    description: 'A bright map pin drops onto an open four-direction location crosshair.',
    art: mark('M4 20 V16 H8 M24 16 H28 V20 M4 24 V28 H10 M22 28 H28 V24', G, 1.8)
      + mark('M2 22 H7 M25 22 H30 M16 26 V30', P, 1.8)
      + shape('M16 25 C13 21 7 15 7 10 C7 0 25 0 25 10 C25 15 19 21 16 25 Z', G)
      + path('M16 23 C14 17 10 14 10 10 Q10 4 16 4 Z', P)
      + circle(16, 10, 4, N) + circle(16, 10, 1.6, P),
  },
  doll: {
    name: 'Equipment mannequin',
    description: 'A plain jointed wooden mannequin stands front-facing with its arms slightly out on a low plinth.',
    art: shape('M10 29 H22 L25 31 H7 Z', G)
      + mark('M16 26 V29', P, 1.8)
      + shape('M12 9 H20 L22 14 L25 20 L22 21 L19 15 L19 19 L21 27 H17 L16 21 L15 27 H11 L13 19 L13 15 L10 21 L7 20 L10 13 Z')
      + path('M14 10 H18 V17 H14 Z', P)
      + mark('M13 18 H19 M11 14 L13 15 M19 15 L21 14', N, 1.4)
      + circle(13.2, 23, 1.1, N) + circle(18.8, 23, 1.1, N)
      + shape('M13 3 Q16 0 19 3 V6 Q16 10 13 6 Z', P),
  },
};
