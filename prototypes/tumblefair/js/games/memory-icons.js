// Pictures for the round-12 memory games (Gone Missing!, Pair Panic, Order Up!). Browser and node safe: plain strings.
// Every picture is a 64x64 inline SVG with a thick ink outline, and every one has its own SHAPE (colour is never the
// only thing that tells two apart). The sims only ever send an index; the view picks the plain or the Halloween list
// for that index, so a reskin changes looks only.
//   prizeSvg(i, hw)   one of 24 fair prizes (or 24 Halloween ones)       PRIZE_NAMES / PRIZE_NAMES_HW
//   foodSvg(i, hw)    one of 8 fair foods (or 8 Halloween treats)         FOOD_NAMES / FOOD_NAMES_HW
//   customerSvg(i, hw) one of 10 customers (a round critter + its own hat; Halloween = little monsters)
const O = 'stroke="#0d2228" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const o2 = 'stroke="#0d2228" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"';
const eye = (x, y, r = 2.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#0d2228"/>`;
const smile = (x, y, w = 6) => `<path d="M${x - w} ${y} Q${x} ${y + w * 0.8} ${x + w} ${y}" fill="none" ${o2}/>`;
const wrap = (b, cls = 'mi') => `<svg viewBox="0 0 64 64" class="${cls}" aria-hidden="true">${b}</svg>`;

export const PRIZE_NAMES = ['Teddy', 'Duck', 'Rocket', 'Fishbowl', 'Yo-yo', 'Balloon', 'Spinning top', 'Drum', 'Kite', 'Magic wand',
  'Crown', 'Trumpet', 'Beach ball', 'Robot', 'Sailboat', 'Train', 'Umbrella', 'Lollipop', 'Cupcake', 'Guitar', 'Toy car', 'Dino',
  'Flower', 'Snail'];
const PRIZES = [
  // teddy
  `<circle cx="18" cy="18" r="7" fill="#c98a4b" ${O}/><circle cx="46" cy="18" r="7" fill="#c98a4b" ${O}/><circle cx="32" cy="32" r="18" fill="#c98a4b" ${O}/><ellipse cx="32" cy="38" rx="8" ry="6" fill="#f2d2a6" ${o2}/>${eye(25, 28)}${eye(39, 28)}<circle cx="32" cy="35" r="2.4" fill="#0d2228"/><path d="M14 52 Q32 62 50 52" fill="#c98a4b" ${O}/>`,
  // duck
  `<path d="M8 40 C8 54 26 58 40 54 C54 50 58 40 52 34 C46 38 40 36 40 30 C42 22 40 12 30 12 C20 12 18 22 22 28 C24 32 20 34 14 34 C10 34 8 36 8 40 Z" fill="#ffd23f" ${O}/><path d="M18 20 L6 22 L18 26 Z" fill="#ff8a1a" ${o2}/>${eye(26, 20)}`,
  // rocket
  `<path d="M32 4 C44 14 46 30 42 46 L22 46 C18 30 20 14 32 4 Z" fill="#f4f6ff" ${O}/><circle cx="32" cy="24" r="6" fill="#4da3ff" ${O}/><path d="M22 34 L12 48 L22 46 Z M42 34 L52 48 L42 46 Z" fill="#e8394a" ${O}/><path d="M26 46 L32 60 L38 46 Z" fill="#ff8a1a" ${o2}/>`,
  // fishbowl
  `<path d="M14 18 H50 C60 30 58 52 32 58 C6 52 4 30 14 18 Z" fill="#bfe8ff" ${O}/><path d="M10 30 Q32 26 54 30" fill="none" stroke="#4da3ff" stroke-width="3"/><path d="M26 42 C30 36 38 36 40 42 C38 48 30 48 26 42 Z M40 42 L46 37 L46 47 Z" fill="#ff8a1a" ${o2}/>${eye(30, 41, 1.6)}`,
  // yo-yo
  `<path d="M32 2 V18" ${O}/><circle cx="32" cy="38" r="20" fill="#b57bff" ${O}/><circle cx="32" cy="38" r="12" fill="#e7d4ff" ${O}/><circle cx="32" cy="38" r="3.5" fill="#0d2228"/>`,
  // balloon
  `<ellipse cx="32" cy="26" rx="18" ry="21" fill="#ff6b6b" ${O}/><path d="M29 47 L35 47 L32 51 Z" fill="#ff6b6b" ${o2}/><path d="M32 51 C26 56 38 58 32 63" fill="none" ${o2}/><ellipse cx="25" cy="18" rx="4" ry="6" fill="#fff" opacity=".6"/>`,
  // spinning top
  `<path d="M32 4 V14" ${O}/><path d="M8 28 C8 20 56 20 56 28 C56 36 40 50 32 60 C24 50 8 36 8 28 Z" fill="#2fc4c4" ${O}/><path d="M10 30 Q32 40 54 30" fill="none" stroke="#ffd23f" stroke-width="4"/>`,
  // drum
  `<ellipse cx="32" cy="20" rx="22" ry="8" fill="#fff3d6" ${O}/><path d="M10 20 V46 C10 56 54 56 54 46 V20" fill="#e8394a" ${O}/><path d="M10 26 L20 50 L32 28 L44 50 L54 26" fill="none" stroke="#ffd23f" stroke-width="3"/><path d="M40 4 L30 18 M50 6 L36 18" ${O}/>`,
  // kite
  `<path d="M32 4 L52 26 L32 50 L12 26 Z" fill="#4fc35a" ${O}/><path d="M32 4 V50 M12 26 H52" ${o2}/><path d="M32 50 C24 54 40 56 30 62" fill="none" ${o2}/><path d="M28 55 L24 52 L26 58 Z" fill="#ff6b6b"/>`,
  // magic wand
  `<path d="M10 58 L36 30" stroke="#0d2228" stroke-width="8" stroke-linecap="round"/><path d="M10 58 L36 30" stroke="#b57bff" stroke-width="4" stroke-linecap="round"/><path d="M42 6 L46 18 L58 20 L48 28 L52 40 L42 32 L32 38 L35 26 L26 18 L38 18 Z" fill="#ffd23f" ${O}/>`,
  // crown
  `<path d="M8 50 L10 18 L22 32 L32 12 L42 32 L54 18 L56 50 Z" fill="#ffd23f" ${O}/><rect x="8" y="46" width="48" height="10" rx="3" fill="#ffb52e" ${O}/><circle cx="32" cy="36" r="4" fill="#e8394a" ${o2}/>`,
  // trumpet
  `<path d="M6 30 H34 L54 14 V50 L34 34 H6 Z" fill="#ffd23f" ${O}/><path d="M16 34 V44 H26 V34" fill="none" ${o2}/><ellipse cx="54" cy="32" rx="4" ry="18" fill="#ffb52e" ${O}/>`,
  // beach ball
  `<circle cx="32" cy="32" r="24" fill="#fff" ${O}/><path d="M32 8 C20 20 20 44 32 56" fill="#e8394a" ${o2}/><path d="M32 8 C44 20 44 44 32 56" fill="#4da3ff" ${o2}/><path d="M9 26 C22 30 42 30 55 26" fill="none" ${o2}/>`,
  // robot
  `<path d="M32 4 V12" ${O}/><circle cx="32" cy="4" r="3" fill="#e8394a"/><rect x="14" y="12" width="36" height="26" rx="6" fill="#b8c4d0" ${O}/><circle cx="24" cy="24" r="5" fill="#ffd23f" ${o2}/><circle cx="40" cy="24" r="5" fill="#ffd23f" ${o2}/><rect x="24" y="31" width="16" height="3" fill="#0d2228"/><rect x="18" y="40" width="28" height="20" rx="4" fill="#8fa0b0" ${O}/>`,
  // sailboat
  `<path d="M32 6 V44" ${O}/><path d="M32 8 L52 40 H32 Z" fill="#fff" ${O}/><path d="M30 14 L14 40 H30 Z" fill="#ff8fc8" ${O}/><path d="M6 46 H58 L50 58 H14 Z" fill="#c98a4b" ${O}/>`,
  // train
  `<rect x="8" y="24" width="34" height="22" rx="3" fill="#4da3ff" ${O}/><rect x="28" y="12" width="14" height="14" fill="#4da3ff" ${O}/><path d="M42 30 H54 L58 46 H42 Z" fill="#e8394a" ${O}/><path d="M14 12 H22 V24 H14 Z" fill="#0d2228"/><circle cx="18" cy="50" r="6" fill="#ffd23f" ${O}/><circle cx="38" cy="50" r="6" fill="#ffd23f" ${O}/>`,
  // umbrella
  `<path d="M4 32 C4 10 60 10 60 32 C54 28 48 28 42 32 C38 28 26 28 22 32 C16 28 10 28 4 32 Z" fill="#b57bff" ${O}/><path d="M32 30 V52 C32 60 22 60 22 52" fill="none" ${O}/>`,
  // lollipop
  `<path d="M32 36 V62" stroke="#0d2228" stroke-width="7" stroke-linecap="round"/><path d="M32 36 V62" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="22" r="18" fill="#ff8fc8" ${O}/><path d="M32 22 m-12 0 a12 12 0 1 1 12 12 a8 8 0 1 1 -8 -8 a4 4 0 1 1 4 4" fill="none" stroke="#fff" stroke-width="3"/>`,
  // cupcake
  `<path d="M14 34 L20 58 H44 L50 34 Z" fill="#4da3ff" ${O}/><path d="M22 36 L26 56 M32 36 V56 M42 36 L38 56" ${o2}/><path d="M10 34 C6 24 16 16 22 18 C24 8 40 8 42 18 C48 16 58 24 54 34 Z" fill="#fff3f8" ${O}/><circle cx="32" cy="8" r="5" fill="#e8394a" ${o2}/>`,
  // guitar
  `<path d="M44 6 L56 10 L52 14 L38 30" fill="none" ${O}/><path d="M38 30 C44 36 40 44 34 44 C38 54 26 62 18 54 C10 46 16 36 24 40 C24 32 32 26 38 30 Z" fill="#ff8a1a" ${O}/><circle cx="28" cy="44" r="4" fill="#0d2228"/>`,
  // toy car
  `<path d="M6 40 V32 L16 30 L24 18 H42 L50 30 L58 32 V40 Z" fill="#e8394a" ${O}/><path d="M26 22 H40 L45 30 H21 Z" fill="#bfe8ff" ${o2}/><circle cx="18" cy="42" r="7" fill="#2a2440" ${O}/><circle cx="46" cy="42" r="7" fill="#2a2440" ${O}/>`,
  // dino
  `<path d="M6 50 C10 38 20 34 28 36 L30 18 C30 8 50 8 50 18 C50 24 44 26 40 26 L40 40 C48 44 52 50 56 58 C46 56 40 52 36 52 L34 60 H26 L26 52 C20 54 12 54 6 50 Z" fill="#4fc35a" ${O}/>${eye(42, 16)}<path d="M30 24 L26 20 M30 30 L25 28" ${o2}/>`,
  // flower
  `<path d="M32 36 V62" stroke="#3f7a2a" stroke-width="4"/><path d="M32 52 C40 44 50 48 48 52 C44 56 36 56 32 52 Z" fill="#4fc35a" ${o2}/>${[0, 72, 144, 216, 288].map(a => `<ellipse cx="32" cy="12" rx="7" ry="10" fill="#ff8fc8" ${o2} transform="rotate(${a} 32 24)"/>`).join('')}<circle cx="32" cy="24" r="7" fill="#ffd23f" ${o2}/>`,
  // snail
  `<path d="M4 54 C10 44 20 46 26 48 H58 L54 54 Z" fill="#9be07a" ${O}/><path d="M6 50 L4 36 M12 48 L14 36" ${o2}/><circle cx="4" cy="35" r="2.5" fill="#0d2228"/><circle cx="14" cy="35" r="2.5" fill="#0d2228"/><circle cx="40" cy="34" r="16" fill="#ffb52e" ${O}/><path d="M40 34 m-9 0 a9 9 0 1 1 9 9 a5 5 0 1 1 -5 -5" fill="none" ${o2}/>`,
];
export const PRIZE_NAMES_HW = ['Pumpkin', 'Ghost', 'Bat', 'Black cat', 'Witch hat', 'Cauldron', 'Spider', 'Skull', 'Wrapped candy', 'Broom',
  'Moon', 'Owl', 'Mummy', 'Frankie', 'Candle', 'Eyeball', 'Potion', 'Cobweb', 'Candy corn', 'Gravestone', 'Lantern', 'Toadstool',
  'Coffin', 'Crow'];
const PRIZES_HW = [
  `<path d="M32 14 C14 12 6 24 8 38 C10 52 22 58 32 56 C42 58 54 52 56 38 C58 24 50 12 32 14 Z" fill="#ff8a1a" ${O}/><path d="M24 16 C18 30 18 46 24 56 M40 16 C46 30 46 46 40 56" fill="none" ${o2}/><path d="M32 14 C31 8 34 4 38 3" fill="none" stroke="#3f7a2a" stroke-width="5" stroke-linecap="round"/><path d="M22 32 L28 28 L28 34 Z M42 32 L36 28 L36 34 Z" fill="#ffe14a"/><path d="M22 40 Q32 48 42 40" fill="none" ${o2}/>`,
  `<path d="M14 58 V28 C14 10 50 10 50 28 V58 L44 52 L38 58 L32 52 L26 58 L20 52 Z" fill="#f4f6ff" ${O}/><ellipse cx="25" cy="30" rx="3.5" ry="5" fill="#0d2228"/><ellipse cx="39" cy="30" rx="3.5" ry="5" fill="#0d2228"/><ellipse cx="32" cy="42" rx="3.5" ry="4" fill="#0d2228"/>`,
  `<path d="M32 26 C24 14 10 14 2 22 C8 24 10 30 8 36 C14 32 20 34 22 40 C26 36 30 38 32 42 C34 38 38 36 42 40 C44 34 50 32 56 36 C54 30 56 24 62 22 C54 14 40 14 32 26 Z" fill="#5a4a7a" ${O}/><circle cx="28" cy="28" r="2.6" fill="#ffd23f"/><circle cx="36" cy="28" r="2.6" fill="#ffd23f"/>`,
  `<path d="M14 58 C10 44 14 30 22 26 L18 8 L30 20 H34 L46 8 L42 26 C50 30 54 44 50 58 Z" fill="#2a2440" ${O}/><ellipse cx="26" cy="36" rx="3.5" ry="4.5" fill="#ffd23f"/><ellipse cx="38" cy="36" rx="3.5" ry="4.5" fill="#ffd23f"/><path d="M30 44 L32 46 L34 44" fill="none" stroke="#fff" stroke-width="2"/>`,
  `<path d="M4 50 C14 44 50 44 60 50 C50 56 14 56 4 50 Z" fill="#3b2c5c" ${O}/><path d="M18 48 L30 6 C34 14 40 18 46 20 L44 48 Z" fill="#3b2c5c" ${O}/><rect x="18" y="38" width="27" height="7" fill="#b57bff" ${o2}/>`,
  `<path d="M8 26 H56 C58 46 48 58 32 58 C16 58 6 46 8 26 Z" fill="#2a2440" ${O}/><ellipse cx="32" cy="26" rx="26" ry="6" fill="#6fe06a" ${O}/><circle cx="24" cy="18" r="4" fill="#9bff8a" ${o2}/><circle cx="38" cy="14" r="3" fill="#9bff8a" ${o2}/>`,
  `<path d="M32 2 V18" ${o2}/><path d="M20 30 L6 20 M20 36 L4 36 M22 42 L8 52 M44 30 L58 20 M44 36 L60 36 M42 42 L56 52" ${O}/><circle cx="32" cy="36" r="14" fill="#3a2e55" ${O}/><circle cx="27" cy="33" r="3" fill="#fff"/><circle cx="37" cy="33" r="3" fill="#fff"/>${eye(27, 33, 1.6)}${eye(37, 33, 1.6)}`,
  `<path d="M12 30 C12 10 52 10 52 30 C52 38 46 42 44 44 V54 H20 V44 C18 42 12 38 12 30 Z" fill="#f4f0e6" ${O}/><circle cx="24" cy="30" r="6" fill="#2a2440"/><circle cx="40" cy="30" r="6" fill="#2a2440"/><path d="M30 40 L32 36 L34 40 Z" fill="#2a2440"/><path d="M26 48 V54 M32 48 V54 M38 48 V54" ${o2}/>`,
  `<path d="M4 24 L16 30 L4 40 Z M60 24 L48 30 L60 40 Z" fill="#ff8a1a" ${O}/><rect x="16" y="20" width="32" height="22" rx="10" fill="#b57bff" ${O}/><path d="M24 22 L22 40 M34 22 L32 40 M42 22 L40 40" stroke="#fff" stroke-width="3"/>`,
  `<path d="M50 4 L30 40" stroke="#0d2228" stroke-width="7" stroke-linecap="round"/><path d="M50 4 L30 40" stroke="#c98a4b" stroke-width="3" stroke-linecap="round"/><path d="M26 34 L38 42 L28 62 C22 60 12 56 8 50 Z" fill="#ffd23f" ${O}/><path d="M18 44 L14 54 M24 46 L20 58" ${o2}/>`,
  `<path d="M40 6 C22 8 12 26 18 42 C24 56 44 60 56 50 C40 50 28 38 30 24 C31 16 34 10 40 6 Z" fill="#ffe7a0" ${O}/><circle cx="26" cy="36" r="3" fill="#e0c060"/>${eye(28, 26, 1.8)}`,
  `<ellipse cx="32" cy="36" rx="20" ry="22" fill="#a0703a" ${O}/><path d="M14 18 L20 24 M50 18 L44 24" ${O}/><circle cx="24" cy="30" r="8" fill="#ffd23f" ${O}/><circle cx="40" cy="30" r="8" fill="#ffd23f" ${O}/>${eye(24, 30)}${eye(40, 30)}<path d="M29 38 L35 38 L32 44 Z" fill="#ff8a1a" ${o2}/>`,
  `<rect x="16" y="8" width="32" height="50" rx="14" fill="#efe6cf" ${O}/><path d="M16 20 L48 24 M16 34 L48 30 M16 46 L48 48" stroke="#b8a888" stroke-width="3"/><rect x="20" y="25" width="24" height="7" rx="3" fill="#2a2440"/><circle cx="27" cy="28.5" r="2.4" fill="#ffd23f"/><circle cx="37" cy="28.5" r="2.4" fill="#ffd23f"/>`,
  `<rect x="14" y="10" width="36" height="46" rx="6" fill="#9be07a" ${O}/><rect x="14" y="10" width="36" height="12" fill="#2a2440" ${O}/><circle cx="10" cy="40" r="4" fill="#b8c4cc" ${o2}/><circle cx="54" cy="40" r="4" fill="#b8c4cc" ${o2}/>${eye(25, 32)}${eye(39, 32)}<path d="M24 45 H40" ${O}/>`,
  `<path d="M32 4 C26 12 28 18 32 20 C36 18 38 12 32 4 Z" fill="#ffb52e" ${o2}/><path d="M32 20 V24" ${o2}/><path d="M20 24 H44 V58 H20 Z" fill="#fff3d6" ${O}/><path d="M20 30 C24 34 26 28 30 32 V40" fill="none" ${o2}/><rect x="14" y="56" width="36" height="5" rx="2" fill="#b8c4d0" ${o2}/>`,
  `<circle cx="32" cy="32" r="24" fill="#fff" ${O}/><path d="M12 22 L18 26 M10 36 L18 36 M52 22 L46 26 M54 38 L46 36" stroke="#ff6b6b" stroke-width="2"/><circle cx="32" cy="32" r="10" fill="#4da3ff" ${o2}/><circle cx="32" cy="32" r="4.5" fill="#0d2228"/><circle cx="29" cy="29" r="1.8" fill="#fff"/>`,
  `<path d="M26 4 H38 V20 L52 46 C56 54 50 60 44 60 H20 C14 60 8 54 12 46 L26 20 Z" fill="#e7d4ff" ${O}/><path d="M14 42 H50 L52 46 C56 54 50 60 44 60 H20 C14 60 8 54 12 46 Z" fill="#ff5fa8" ${o2}/><rect x="24" y="2" width="16" height="6" rx="2" fill="#c98a4b" ${o2}/>`,
  `<path d="M4 4 L60 60 M60 4 L4 60 M32 2 V62 M2 32 H62" stroke="#dfe6ff" stroke-width="2.5"/><path d="M32 14 L46 18 L50 32 L46 46 L32 50 L18 46 L14 32 L18 18 Z M32 24 L40 26 L42 32 L40 38 L32 40 L24 38 L22 32 L24 26 Z" fill="none" stroke="#dfe6ff" stroke-width="2.5"/><circle cx="32" cy="32" r="4" fill="#2a2440"/>`,
  `<path d="M32 60 L10 12 C24 6 40 6 54 12 Z" fill="#fff" ${O}/><path d="M14 22 C26 18 38 18 50 22 L44 36 C36 34 28 34 20 36 Z" fill="#ff8a1a"/><path d="M10 12 C24 6 40 6 54 12 L50 22 C38 18 26 18 14 22 Z" fill="#ffd23f" ${o2}/>`,
  `<path d="M12 60 V26 C12 8 52 8 52 26 V60 Z" fill="#b8c4d0" ${O}/><path d="M24 26 H40 M32 18 V40" stroke="#8fa0b0" stroke-width="4"/><path d="M6 60 H58" ${O}/><path d="M16 58 C18 52 22 52 24 58" fill="#4fc35a" ${o2}/>`,
  `<path d="M24 8 H40 L44 16 H20 Z" fill="#2a2440" ${O}/><path d="M32 2 V8" ${o2}/><path d="M18 16 H46 L50 52 H14 Z" fill="#2a2440" ${O}/><path d="M22 22 H42 L44 46 H20 Z" fill="#ffd23f"/><path d="M32 26 C26 34 30 40 32 42 C34 40 38 34 32 26 Z" fill="#ff8a1a"/><rect x="12" y="52" width="40" height="6" rx="2" fill="#2a2440" ${o2}/>`,
  `<path d="M4 34 C4 12 60 12 60 34 Z" fill="#e8394a" ${O}/><circle cx="20" cy="24" r="4" fill="#fff"/><circle cx="36" cy="18" r="3.5" fill="#fff"/><circle cx="46" cy="28" r="3.5" fill="#fff"/><path d="M22 34 H42 L40 58 H24 Z" fill="#fff3d6" ${O}/>${eye(28, 44, 2)}${eye(36, 44, 2)}`,
  `<path d="M22 4 H42 L54 18 L44 60 H20 L10 18 Z" fill="#8a5a3a" ${O}/><path d="M32 18 V40 M24 26 H40" stroke="#ffd23f" stroke-width="4"/>`,
  `<path d="M10 40 C10 26 20 18 32 20 L44 10 L46 22 C52 26 54 34 52 42 L60 46 L50 48 C44 56 30 58 20 52 L8 56 L12 46 C10 44 10 42 10 40 Z" fill="#2a2440" ${O}/><path d="M44 24 L58 26 L46 32 Z" fill="#ffb52e" ${o2}/><circle cx="40" cy="26" r="2.6" fill="#fff"/>`,
];
export const FOOD_NAMES = ['Hot dog', 'Popcorn', 'Lemonade', 'Pretzel', 'Cotton candy', 'Ice cream', 'Corn on the cob', 'Cookie'];
const FOODS = [
  `<path d="M4 34 C4 20 60 20 60 34 C60 50 4 50 4 34 Z" fill="#ffcf8a" ${O}/><path d="M10 30 C10 24 54 24 54 30 C54 38 10 38 10 30 Z" fill="#d9543a" ${O}/><path d="M14 29 Q20 25 26 29 T38 29 T50 29" fill="none" stroke="#ffd23f" stroke-width="3.5" stroke-linecap="round"/><path d="M8 40 Q32 48 56 40" fill="none" ${o2}/>`,
  `<circle cx="20" cy="14" r="7" fill="#fff8e0" ${o2}/><circle cx="32" cy="10" r="7" fill="#fff8e0" ${o2}/><circle cx="44" cy="14" r="7" fill="#fff8e0" ${o2}/><circle cx="26" cy="20" r="6" fill="#fff8e0" ${o2}/><circle cx="38" cy="20" r="6" fill="#fff8e0" ${o2}/><path d="M12 20 H52 L46 60 H18 Z" fill="#fff" ${O}/><path d="M22 20 L24 60 M32 20 V60 M42 20 L40 60" stroke="#e8394a" stroke-width="5"/>`,
  `<path d="M38 2 L34 22" ${O}/><path d="M14 18 H50 L44 60 H20 Z" fill="#fff36b" ${O}/><path d="M16 30 H48" ${o2}/><circle cx="26" cy="42" r="4" fill="#fff" opacity=".7"/><path d="M48 12 C56 12 58 22 50 24 Z" fill="#9be07a" ${o2}/>`,
  `<path d="M32 52 C10 58 2 36 14 22 C24 10 34 22 32 34 C30 22 40 10 50 22 C62 36 54 58 32 52 Z" fill="none" stroke="#0d2228" stroke-width="13" stroke-linecap="round"/><path d="M32 52 C10 58 2 36 14 22 C24 10 34 22 32 34 C30 22 40 10 50 22 C62 36 54 58 32 52 Z" fill="none" stroke="#c9813a" stroke-width="8" stroke-linecap="round"/><circle cx="16" cy="30" r="1.5" fill="#fff"/><circle cx="46" cy="28" r="1.5" fill="#fff"/><circle cx="32" cy="48" r="1.5" fill="#fff"/>`,
  `<path d="M32 36 L28 62" stroke="#0d2228" stroke-width="6" stroke-linecap="round"/><path d="M32 36 L28 62" stroke="#fff3d6" stroke-width="2.5" stroke-linecap="round"/><path d="M32 40 C14 42 8 30 14 22 C10 10 26 2 34 8 C44 2 58 12 52 22 C58 32 48 42 32 40 Z" fill="#ff9ad0" ${O}/><path d="M22 20 C28 16 36 18 40 24" fill="none" stroke="#fff" stroke-width="3"/>`,
  `<path d="M18 30 L32 62 L46 30 Z" fill="#e0a26a" ${O}/><path d="M22 34 L40 48 M42 34 L26 48" ${o2}/><circle cx="32" cy="22" r="14" fill="#fff3f8" ${O}/><circle cx="32" cy="8" r="5" fill="#e8394a" ${o2}/><path d="M22 28 C26 32 30 28 32 32 C34 28 38 32 42 28" fill="none" stroke="#ff8fc8" stroke-width="3"/>`,
  `<path d="M14 54 L4 60 M50 10 L60 4" ${O}/><path d="M12 52 C4 44 32 10 46 8 C54 8 58 12 54 20 C44 34 22 58 12 52 Z" fill="#ffd23f" ${O}/><path d="M22 40 L28 44 M28 32 L34 36 M34 24 L40 28 M40 16 L46 20" ${o2}/><path d="M12 52 C18 40 22 34 26 34 C24 44 18 50 12 52 Z" fill="#4fc35a" ${o2}/>`,
  `<circle cx="32" cy="32" r="24" fill="#d8a066" ${O}/><circle cx="22" cy="24" r="4" fill="#5a3418"/><circle cx="38" cy="20" r="3.5" fill="#5a3418"/><circle cx="42" cy="38" r="4" fill="#5a3418"/><circle cx="26" cy="42" r="3.5" fill="#5a3418"/><circle cx="33" cy="31" r="3" fill="#5a3418"/>`,
];
export const FOOD_NAMES_HW = ['Candy apple', 'Pumpkin pie', "Witch's brew", 'Eyeball gum', 'Bat cookie', 'Ghost mallow', 'Caramel corn ball', 'Gummy worms'];
const FOODS_HW = [
  `<path d="M32 4 L30 22" stroke="#c98a4b" stroke-width="5" stroke-linecap="round"/><path d="M32 18 C14 12 4 28 10 44 C16 58 28 60 32 56 C36 60 48 58 54 44 C60 28 50 12 32 18 Z" fill="#e8394a" ${O}/><path d="M10 46 C20 54 44 54 54 46 L52 52 C44 60 20 60 12 52 Z" fill="#ffb52e" ${o2}/>`,
  `<path d="M4 44 L32 10 L60 44 Z" fill="#ff8a1a" ${O}/><path d="M4 44 H60 V52 H4 Z" fill="#e0a26a" ${O}/><path d="M26 30 C30 24 40 26 38 32" fill="#fff3f8" ${o2}/>`,
  `<path d="M14 22 H50 V54 C50 60 14 60 14 54 Z" fill="#6fe06a" ${O}/><path d="M50 30 C60 30 60 46 50 46" fill="none" ${O}/><circle cx="24" cy="14" r="5" fill="#9bff8a" ${o2}/><circle cx="36" cy="8" r="4" fill="#9bff8a" ${o2}/>${eye(26, 38)}${eye(38, 38)}${smile(32, 44, 5)}`,
  `<circle cx="20" cy="22" r="12" fill="#fff" ${O}/><circle cx="20" cy="22" r="5" fill="#4fc35a"/><circle cx="20" cy="22" r="2.2" fill="#0d2228"/><circle cx="44" cy="22" r="12" fill="#fff" ${O}/><circle cx="44" cy="22" r="5" fill="#b57bff"/><circle cx="44" cy="22" r="2.2" fill="#0d2228"/><circle cx="32" cy="44" r="12" fill="#fff" ${O}/><circle cx="32" cy="44" r="5" fill="#4da3ff"/><circle cx="32" cy="44" r="2.2" fill="#0d2228"/>`,
  `<path d="M32 22 C26 12 12 12 4 20 C10 24 12 32 10 38 C16 34 22 36 24 42 C28 38 30 40 32 44 C34 40 36 38 40 42 C42 36 48 34 54 38 C52 32 54 24 60 20 C52 12 38 12 32 22 Z" fill="#c9813a" ${O}/><circle cx="28" cy="26" r="2.4" fill="#fff"/><circle cx="36" cy="26" r="2.4" fill="#fff"/>`,
  `<path d="M16 56 V28 C16 14 48 14 48 28 V56 L40 50 L32 56 L24 50 Z" fill="#fff" ${O}/><path d="M32 4 V14" stroke="#c98a4b" stroke-width="4"/>${eye(26, 30)}${eye(38, 30)}<ellipse cx="32" cy="40" rx="3" ry="4" fill="#0d2228"/>`,
  `<circle cx="32" cy="34" r="22" fill="#ffb52e" ${O}/><circle cx="22" cy="28" r="4" fill="#fff3d6" ${o2}/><circle cx="36" cy="22" r="4" fill="#fff3d6" ${o2}/><circle cx="42" cy="38" r="4" fill="#fff3d6" ${o2}/><circle cx="26" cy="42" r="4" fill="#fff3d6" ${o2}/><path d="M32 12 V4" stroke="#c98a4b" stroke-width="5" stroke-linecap="round"/>`,
  `<path d="M8 20 C18 8 26 30 36 18 C44 8 54 18 56 22" fill="none" stroke="#0d2228" stroke-width="10" stroke-linecap="round"/><path d="M8 20 C18 8 26 30 36 18 C44 8 54 18 56 22" fill="none" stroke="#ff5fa8" stroke-width="5" stroke-linecap="round"/><path d="M8 46 C18 34 26 56 36 44 C44 34 54 44 56 48" fill="none" stroke="#0d2228" stroke-width="10" stroke-linecap="round"/><path d="M8 46 C18 34 26 56 36 44 C44 34 54 44 56 48" fill="none" stroke="#4fc35a" stroke-width="5" stroke-linecap="round"/>`,
];
/** 10 customers: [face colour, hat]. Halloween: the same ten as little monsters (horns, bolts, a sheet…). */
const CUSTOMERS = ['#ffcf9e', '#9be07a', '#bfe8ff', '#ffc6df', '#ffe08a', '#e7d4ff', '#c98a4b', '#fff3d6', '#ffb3b3', '#b8f0e0'];
const HATS = [
  // cowboy hat
  `<path d="M4 20 C16 26 48 26 60 20 C56 30 8 30 4 20 Z" fill="#a0703a" ${O}/><path d="M18 22 C18 6 46 6 46 22 Z" fill="#a0703a" ${O}/><path d="M18 18 H46" stroke="#e8394a" stroke-width="3"/>`,
  // bow
  `<path d="M32 12 L14 2 V22 Z M32 12 L50 2 V22 Z" fill="#ff5fa8" ${O}/><circle cx="32" cy="12" r="5" fill="#ff5fa8" ${O}/>`,
  // propeller cap
  `<path d="M14 24 C14 8 50 8 50 24 Z" fill="#4da3ff" ${O}/><path d="M14 24 H58" ${O}/><path d="M32 8 V2" ${o2}/><path d="M18 2 H46" stroke="#e8394a" stroke-width="4" stroke-linecap="round"/>`,
  // crown
  `<path d="M14 24 L16 4 L24 14 L32 2 L40 14 L48 4 L50 24 Z" fill="#ffd23f" ${O}/>`,
  // top hat
  `<rect x="20" y="0" width="24" height="20" fill="#2a2440" ${O}/><path d="M10 22 H54" stroke="#0d2228" stroke-width="5" stroke-linecap="round"/><rect x="20" y="12" width="24" height="5" fill="#e8394a"/>`,
  // bobble beanie
  `<path d="M12 24 C12 6 52 6 52 24 Z" fill="#4fc35a" ${O}/><rect x="10" y="20" width="44" height="7" rx="3" fill="#fff" ${o2}/><circle cx="32" cy="4" r="5" fill="#fff" ${o2}/>`,
  // flower
  `${[0, 72, 144, 216, 288].map(a => `<ellipse cx="46" cy="6" rx="4" ry="6" fill="#fff" ${o2} transform="rotate(${a} 46 12)"/>`).join('')}<circle cx="46" cy="12" r="4" fill="#ffd23f" ${o2}/>`,
  // headphones
  `<path d="M10 34 C6 10 58 10 54 34" fill="none" stroke="#0d2228" stroke-width="6"/><path d="M10 34 C6 10 58 10 54 34" fill="none" stroke="#b57bff" stroke-width="3"/><rect x="4" y="28" width="10" height="16" rx="4" fill="#b57bff" ${O}/><rect x="50" y="28" width="10" height="16" rx="4" fill="#b57bff" ${O}/>`,
  // chef hat
  `<path d="M18 24 V14 C8 14 8 0 20 2 C22 -4 42 -4 44 2 C56 0 56 14 46 14 V24 Z" fill="#fff" ${O}/>`,
  // party hat
  `<path d="M20 24 L32 -2 L44 24 Z" fill="#ff8a1a" ${O}/><path d="M24 16 L40 16 M27 9 L37 9" stroke="#fff" stroke-width="3"/><circle cx="32" cy="-2" r="3.5" fill="#ffd23f" ${o2}/>`,
];
const MONSTER = [
  `<path d="M14 20 L8 4 L22 14 Z M50 20 L56 4 L42 14 Z" fill="#ff8a1a" ${O}/>`,                                        // horns
  `<path d="M32 12 L14 2 V22 Z M32 12 L50 2 V22 Z" fill="#b57bff" ${O}/><circle cx="32" cy="12" r="5" fill="#b57bff" ${O}/>`, // a bat bow
  `<rect x="2" y="34" width="8" height="8" fill="#b8c4cc" ${o2}/><rect x="54" y="34" width="8" height="8" fill="#b8c4cc" ${o2}/><rect x="14" y="10" width="36" height="10" fill="#2a2440" ${O}/>`, // bolts + flat top
  `<path d="M14 24 L16 4 L24 14 L32 2 L40 14 L48 4 L50 24 Z" fill="#9bff8a" ${O}/>`,                                      // a slime crown
  `<path d="M4 24 C16 28 48 28 60 24 L44 22 L36 -4 C32 4 28 8 22 10 L20 22 Z" fill="#3b2c5c" ${O}/>`,                      // witch hat
  `<path d="M16 18 C10 6 22 2 24 12 M48 18 C54 6 42 2 40 12" fill="none" ${O}/><circle cx="16" cy="4" r="4" fill="#9bff8a" ${o2}/><circle cx="48" cy="4" r="4" fill="#9bff8a" ${o2}/>`, // antennae
  `<path d="M12 22 L6 6 L22 16 Z M52 22 L58 6 L42 16 Z" fill="#2a2440" ${O}/>`,                                         // cat ears
  `<path d="M12 24 C12 -6 52 -6 52 24 L46 18 L40 24 L32 18 L24 24 L18 18 Z" fill="#f4f6ff" ${O}/>`,                       // ghost hood
  `<path d="M18 24 C18 10 46 10 46 24 Z" fill="#ff8a1a" ${O}/><path d="M32 12 V2" stroke="#3f7a2a" stroke-width="5" stroke-linecap="round"/>`,   // pumpkin cap
  `<path d="M20 24 L32 -2 L44 24 Z" fill="#2a2440" ${O}/><path d="M24 16 L40 16 M27 9 L37 9" stroke="#ff8a1a" stroke-width="3"/><circle cx="32" cy="-2" r="3.5" fill="#ff8a1a" ${o2}/>`, // spooky party hat
];
const MONSTER_FACE = ['#9be07a', '#b57bff', '#9be07a', '#6fe06a', '#ffcf9e', '#2fc4c4', '#5a4a7a', '#f4f6ff', '#ff8a1a', '#c9a0ff'];
export const CUSTOMER_NAMES = ['Cowboy', 'Bow', 'Propeller', 'Crown', 'Top hat', 'Beanie', 'Flower', 'Headphones', 'Chef', 'Party hat'];
export const CUSTOMER_NAMES_HW = ['Horns', 'Bat bow', 'Bolts', 'Slime crown', 'Witch hat', 'Antennae', 'Cat ears', 'Ghost hood', 'Pumpkin cap', 'Spooky hat'];

export const PRIZE_COUNT = PRIZES.length, FOOD_COUNT = FOODS.length, CUSTOMER_COUNT = CUSTOMERS.length;
export const prizeSvg = (i, hw = false, cls = 'mi') => wrap((hw ? PRIZES_HW : PRIZES)[i] || '', cls);
export const prizeName = (i, hw = false) => (hw ? PRIZE_NAMES_HW : PRIZE_NAMES)[i] || '?';
export const foodSvg = (i, hw = false, cls = 'mi') => wrap((hw ? FOODS_HW : FOODS)[i] || '', cls);
export const foodName = (i, hw = false) => (hw ? FOOD_NAMES_HW : FOOD_NAMES)[i] || '?';
export const customerName = (i, hw = false) => (hw ? CUSTOMER_NAMES_HW : CUSTOMER_NAMES)[i] || '?';
/** A customer: a round critter face (the hat is part of who they are, so two customers never share one). */
export function customerSvg(i, hw = false, cls = 'mi cust') {
  const face = (hw ? MONSTER_FACE : CUSTOMERS)[i] || '#fff', hat = (hw ? MONSTER : HATS)[i] || '';
  const mouth = hw ? `<path d="M24 46 Q32 52 40 46" fill="none" ${o2}/><path d="M27 47 L28 50 L30 48 M37 47 L36 50 L34 48" fill="#fff" stroke="#0d2228" stroke-width="1"/>` : smile(32, 45, 7);
  return `<svg viewBox="0 -6 64 70" class="${cls}" aria-hidden="true"><circle cx="32" cy="38" r="22" fill="${face}" ${O}/>${eye(24, 36, 3)}${eye(40, 36, 3)}<circle cx="18" cy="44" r="3.5" fill="#ff8fa8" opacity=".55"/><circle cx="46" cy="44" r="3.5" fill="#ff8fa8" opacity=".55"/>${mouth}${hat}</svg>`;
}
