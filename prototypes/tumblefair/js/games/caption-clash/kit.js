// Caption Clash's picture kit: every scene in data/scenes.json is a backdrop plus a few props, drawn here as inline SVG.
// The picture is 160 x 100. A prop is drawn around its FEET at (0, 0) (things that stand) and is about 30-40 units
// tall at scale 1; the scene places it with [id, x, y, scale, flip]. Unknown ids draw nothing, so a typo shows up as
// a gap in the picture, never as an error. Bold ink outlines and flat colours, to match the rest of the fair.
const INK = '#0d2228';
const O = `stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"`;
const T = `stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;
const eye = (x, y, r = 1.8) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + r * .35}" cy="${y - r * .35}" r="${r * .35}" fill="#fff"/>`;
const smile = (x, y, w = 4) => `<path d="M${x - w / 2} ${y} Q${x} ${y + w * .6} ${x + w / 2} ${y}" fill="none" ${T}/>`;

export const PROPS = {
  goat: `<path d="M-14 -10 V0 M-7 -10 V0 M5 -10 V0 M12 -10 V0" ${O} stroke-width="3"/><ellipse cx="0" cy="-17" rx="17" ry="9" fill="#f2efe6" ${O}/><path d="M-17 -19 l-5 -4" ${O}/>
    <path d="M10 -22 L14 -32 L22 -32 L24 -22 Q20 -16 15 -18 Z" fill="#f2efe6" ${O}/><path d="M14 -32 Q11 -40 16 -42 M21 -32 Q22 -40 27 -40" fill="none" ${O}/><path d="M22 -20 l1 6" ${O}/>${eye(19, -27, 1.4)}`,
  cat: `<path d="M-12 -10 Q-26 -14 -22 -26" fill="none" ${O} stroke-width="3"/><ellipse cx="-2" cy="-10" rx="13" ry="10" fill="#ff9a1f" ${O}/><path d="M-9 -3 l-2 3 M5 -3 l2 3" ${O}/>
    <circle cx="4" cy="-24" r="9" fill="#ff9a1f" ${O}/><path d="M-3 -29 L-4 -37 L2 -32 M7 -32 L12 -37 L12 -29" fill="#ff9a1f" ${O}/>${eye(1, -25, 1.3)}${eye(8, -25, 1.3)}<path d="M3 -20 h2" ${T}/>`,
  dog: `<path d="M-14 -16 l-6 -6" ${O} stroke-width="3"/><path d="M-11 -10 V0 M-4 -10 V0 M6 -10 V0 M12 -10 V0" ${O} stroke-width="3"/><ellipse cx="0" cy="-15" rx="16" ry="8" fill="#c98b4a" ${O}/>
    <circle cx="14" cy="-27" r="9" fill="#c98b4a" ${O}/><ellipse cx="8" cy="-26" rx="3.5" ry="7" fill="#8a5225" ${O}/><ellipse cx="22" cy="-25" rx="4" ry="3" fill="#c98b4a" ${O}/><circle cx="25" cy="-26" r="1.6" fill="${INK}"/>${eye(15, -30, 1.4)}`,
  chicken: `<path d="M-3 -8 V0 M3 -8 V0 M-6 0 h5 M1 0 h5" ${O}/><path d="M-12 -18 Q-14 -8 0 -8 Q12 -8 12 -18 L10 -30 Q8 -36 2 -36 Q-4 -36 -4 -28 Q-12 -26 -12 -18 Z" fill="#fff" ${O}/>
    <path d="M1 -38 q2 -5 4 0 q2 -5 4 0" fill="#e8383d" ${O}/><path d="M10 -30 l6 2 l-6 2 Z" fill="#ff9a1f" ${O}/><path d="M9 -25 q2 4 -1 5" fill="#e8383d" ${O}/>${eye(6, -31, 1.3)}<path d="M-8 -18 q6 4 10 -2" fill="none" ${T}/>`,
  cow: `<path d="M-14 -10 V0 M-8 -10 V0 M6 -10 V0 M12 -10 V0" ${O} stroke-width="3"/><rect x="-19" y="-28" width="34" height="19" rx="8" fill="#fff" ${O}/><path d="M-12 -27 q5 6 0 10 q-4 -3 -4 -8 Z M2 -20 q6 -2 6 4 q-6 2 -6 -4 Z" fill="${INK}"/>
    <path d="M12 -30 h12 q4 0 4 6 v4 q0 6 -8 6 h-4 q-6 0 -6 -6 Z" fill="#fff" ${O}/><rect x="15" y="-21" width="13" height="7" rx="3.5" fill="#ffb3c0" ${O}/><path d="M13 -30 l-3 -5 M25 -30 l3 -5" ${O}/>${eye(17, -26, 1.2)}${eye(23, -26, 1.2)}`,
  fish: `<path d="M-14 -12 L-22 -20 L-22 -4 Z" fill="#ff9a1f" ${O}/><ellipse cx="0" cy="-12" rx="15" ry="9" fill="#ff9a1f" ${O}/><path d="M-4 -20 q4 -6 8 0" fill="#ffd23f" ${O}/>${eye(7, -14, 1.6)}<path d="M12 -9 q-2 1 -3 0" fill="none" ${T}/>`,
  duck: `<path d="M-14 -14 Q-16 -2 0 -2 Q14 -2 12 -12 Q8 -10 4 -14 Z" fill="#ffd23f" ${O}/><circle cx="6" cy="-20" r="7" fill="#ffd23f" ${O}/><path d="M12 -21 q6 0 7 2 q-3 3 -7 1 Z" fill="#ff9a1f" ${O}/>${eye(7, -22, 1.2)}<path d="M-8 -10 q5 3 9 -1" fill="none" ${T}/>`,
  robot: `<path d="M-7 -14 V0 M7 -14 V0" ${O} stroke-width="4"/><rect x="-12" y="-34" width="24" height="21" rx="3" fill="#9fb6c2" ${O}/><circle cx="0" cy="-24" r="4" fill="#ffd23f" ${O}/>
    <path d="M-12 -30 l-7 8 M12 -30 l7 8" ${O} stroke-width="3"/><rect x="-10" y="-50" width="20" height="15" rx="3" fill="#cfdde4" ${O}/><circle cx="-4" cy="-43" r="2.6" fill="#39d0e0" ${O}/><circle cx="4" cy="-43" r="2.6" fill="#39d0e0" ${O}/>
    <path d="M0 -50 V-55" ${O}/><circle cx="0" cy="-56" r="2" fill="#e8383d" ${O}/><path d="M-4 -38 h8" ${T}/>`,
  ghost: `<path d="M-14 0 V-22 Q-14 -40 0 -40 Q14 -40 14 -22 V0 L9 -4 L4 0 L-1 -4 L-6 0 L-10 -4 Z" fill="#f4f7ff" ${O}/>${eye(-5, -26, 2)}${eye(5, -26, 2)}<ellipse cx="0" cy="-18" rx="3" ry="4" fill="${INK}"/>`,
  alien: `<path d="M-6 -12 V0 M6 -12 V0" ${O} stroke-width="3"/><path d="M-9 -12 Q-10 -26 0 -26 Q10 -26 9 -12 Z" fill="#7cdb6a" ${O}/><ellipse cx="0" cy="-36" rx="13" ry="11" fill="#7cdb6a" ${O}/>
    <ellipse cx="-5" cy="-37" rx="4" ry="5.5" fill="${INK}"/><ellipse cx="5" cy="-37" rx="4" ry="5.5" fill="${INK}"/><path d="M-6 -46 L-10 -54 M6 -46 L10 -54" ${O}/><circle cx="-10" cy="-55" r="2" fill="#ffd23f" ${O}/><circle cx="10" cy="-55" r="2" fill="#ffd23f" ${O}/>${smile(0, -29, 5)}`,
  snowman: `<circle cx="0" cy="-12" r="12" fill="#fff" ${O}/><circle cx="0" cy="-31" r="9" fill="#fff" ${O}/><circle cx="0" cy="-45" r="7" fill="#fff" ${O}/><path d="M0 -44 l7 2 l-7 1 Z" fill="#ff9a1f" ${O}/>
    ${eye(-2.5, -47, 1.2)}${eye(2.5, -47, 1.2)}<circle cx="0" cy="-33" r="1.3" fill="${INK}"/><circle cx="0" cy="-28" r="1.3" fill="${INK}"/><path d="M-8 -33 l-10 -6 M8 -33 l10 -6" ${O}/><path d="M-6 -39 h12" stroke="#e8383d" stroke-width="3"/>`,
  ufo: `<ellipse cx="0" cy="-14" rx="10" ry="9" fill="#bdf3ff" ${O}/><ellipse cx="0" cy="-8" rx="24" ry="7" fill="#9fb6c2" ${O}/><circle cx="-12" cy="-8" r="1.8" fill="#ffd23f"/><circle cx="0" cy="-6" r="1.8" fill="#ffd23f"/><circle cx="12" cy="-8" r="1.8" fill="#ffd23f"/>`,
  beam: `<path d="M-10 -58 L10 -58 L22 0 L-22 0 Z" fill="#fff59a" opacity=".55"/>`,
  rocket: `<path d="M-8 -12 L-16 0 L-8 -2 Z M8 -12 L16 0 L8 -2 Z" fill="#e8383d" ${O}/><path d="M-8 -2 V-34 Q0 -50 8 -34 V-2 Z" fill="#f4f7ff" ${O}/><circle cx="0" cy="-26" r="4" fill="#39d0e0" ${O}/><path d="M-5 -2 L0 6 L5 -2" fill="#ff9a1f" ${O}/>`,
  car: `<path d="M-24 -6 V-14 Q-24 -18 -18 -18 L-10 -18 L-4 -28 H10 L16 -18 H22 Q26 -18 26 -12 V-6 Z" fill="#e8383d" ${O}/><path d="M-2 -26 H8 L12 -19 H-6 Z" fill="#bdf3ff" ${O}/><circle cx="-14" cy="-5" r="5.5" fill="${INK}"/><circle cx="16" cy="-5" r="5.5" fill="${INK}"/><circle cx="-14" cy="-5" r="2" fill="#ccc"/><circle cx="16" cy="-5" r="2" fill="#ccc"/>`,
  plane: `<path d="M-30 -10 Q-32 -18 -22 -18 H22 Q32 -18 32 -12 Q30 -6 22 -6 H-24 Q-30 -6 -30 -10 Z" fill="#f4f7ff" ${O}/><path d="M-26 -18 L-32 -30 H-24 L-16 -18 Z" fill="#2f7ff0" ${O}/><path d="M-4 -10 L-14 6 H-6 L8 -10 Z" fill="#2f7ff0" ${O}/><path d="M20 -16 h6 q3 0 4 3 h-10 Z" fill="#bdf3ff" ${O}/><circle cx="6" cy="-13" r="1.8" fill="#bdf3ff" ${T}/><circle cx="12" cy="-13" r="1.8" fill="#bdf3ff" ${T}/>`,
  house: `<rect x="-18" y="-26" width="36" height="26" fill="#ffe3b0" ${O}/><path d="M-22 -24 L0 -42 L22 -24 Z" fill="#c2453a" ${O}/><rect x="-5" y="-14" width="10" height="14" fill="#8a5225" ${O}/><rect x="-14" y="-20" width="7" height="7" fill="#bdf3ff" ${O}/><rect x="7" y="-20" width="7" height="7" fill="#bdf3ff" ${O}/>`,
  tree: `<rect x="-3.5" y="-18" width="7" height="18" fill="#8a5225" ${O}/><circle cx="0" cy="-30" r="14" fill="#3ecf5a" ${O}/><circle cx="-9" cy="-22" r="8" fill="#3ecf5a" ${O}/><circle cx="9" cy="-22" r="8" fill="#3ecf5a" ${O}/><circle cx="4" cy="-34" r="3" fill="#7be08d"/>`,
  flowers: `<path d="M-10 0 V-12 M0 0 V-16 M10 0 V-11" ${O}/>${[[-10, -14, '#ff6b6b'], [0, -18, '#ffd23f'], [10, -13, '#b06bff']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${c}" ${O}/><circle cx="${x}" cy="${y}" r="1.5" fill="#fff"/>`).join('')}<path d="M-14 0 h28" ${O}/>`,
  can: `<path d="M-8 -14 H6 V0 H-8 Z" fill="#39d0e0" ${O}/><path d="M6 -10 L16 -18" ${O} stroke-width="3"/><path d="M-8 -12 Q-14 -10 -8 -4" fill="none" ${O}/><path d="M18 -16 l2 4 M20 -19 l4 2 M16 -14 l0 4" stroke="#2f7ff0" stroke-width="1.6" stroke-linecap="round"/>`,
  sofa: `<rect x="-26" y="-22" width="52" height="14" rx="5" fill="#7a6bd6" ${O}/><rect x="-30" y="-16" width="10" height="14" rx="4" fill="#7a6bd6" ${O}/><rect x="20" y="-16" width="10" height="14" rx="4" fill="#7a6bd6" ${O}/><rect x="-20" y="-12" width="40" height="10" rx="3" fill="#9a8ce6" ${O}/><path d="M-24 -2 v2 M24 -2 v2" ${O}/>`,
  tv: `<rect x="-18" y="-34" width="36" height="24" rx="3" fill="#2a2a34" ${O}/><rect x="-14" y="-30" width="28" height="16" fill="#39d0e0"/><path d="M-10 -24 q4 -6 8 0 t8 0" fill="none" stroke="#fff" stroke-width="1.6"/><path d="M-6 -10 L-10 0 M6 -10 L10 0" ${O}/>`,
  desk: `<rect x="-26" y="-20" width="52" height="20" rx="2" fill="#a46b3d" ${O}/><path d="M-26 -20 H26" ${O}/><rect x="-6" y="-14" width="12" height="4" rx="1" fill="#8a5225" ${T}/>`,
  table: `<rect x="-24" y="-20" width="48" height="5" rx="2" fill="#c98b4a" ${O}/><path d="M-19 -15 V0 M19 -15 V0" ${O} stroke-width="3"/>`,
  counter: `<rect x="-26" y="-22" width="52" height="22" fill="#5aa0d6" ${O}/><rect x="-28" y="-26" width="56" height="5" fill="#f4f7ff" ${O}/><rect x="10" y="-36" width="14" height="10" rx="1" fill="#2a2a34" ${O}/><rect x="12" y="-34" width="10" height="4" fill="#3ecf5a"/>`,
  podium: `<path d="M-14 0 L-11 -24 H11 L14 0 Z" fill="#2f7ff0" ${O}/><rect x="-16" y="-28" width="32" height="5" rx="2" fill="#1f5ab8" ${O}/><circle cx="0" cy="-13" r="5" fill="#ffd23f" ${O}/>`,
  throne: `<rect x="-14" y="-46" width="28" height="36" rx="4" fill="#9b4fe0" ${O}/><path d="M-14 -46 l4 -6 l4 6 l4 -6 l4 6 l4 -6 l4 6" fill="#ffd23f" ${O}/><rect x="-18" y="-14" width="36" height="8" rx="2" fill="#ffd23f" ${O}/><path d="M-14 -6 V0 M14 -6 V0" ${O} stroke-width="3"/>`,
  tub: `<path d="M-26 -18 H26 Q26 0 10 0 H-10 Q-26 0 -26 -18 Z" fill="#f4f7ff" ${O}/><path d="M-22 -16 H22" stroke="#39d0e0" stroke-width="4"/><path d="M20 -18 V-28 q0 -4 -5 -4" fill="none" ${O}/><circle cx="-14" cy="-22" r="3" fill="#fff" ${T}/><circle cx="-8" cy="-25" r="2.5" fill="#fff" ${T}/><circle cx="-3" cy="-21" r="2" fill="#fff" ${T}/>`,
  bowl: `<path d="M-14 -24 Q-20 -8 -10 0 H10 Q20 -8 14 -24 Z" fill="#bdf3ff" fill-opacity=".85" ${O}/><path d="M-15 -18 H15" stroke="#39d0e0" stroke-width="2"/>`,
  ring: `<ellipse cx="0" cy="0" rx="20" ry="7" fill="#ff6b6b" ${O}/><ellipse cx="0" cy="-1" rx="10" ry="3" fill="#39a7d0" ${T}/><path d="M-12 -5 l3 8 M10 -5 l-3 8" stroke="#fff" stroke-width="3"/>`,
  oven: `<rect x="-18" y="-38" width="36" height="38" rx="3" fill="#d8dee2" ${O}/><rect x="-13" y="-26" width="26" height="18" rx="2" fill="#2a2a34" ${O}/><path d="M-10 -12 q10 -5 20 0" stroke="#ff9a1f" stroke-width="2" fill="none"/><circle cx="-10" cy="-33" r="2" fill="${INK}"/><circle cx="-3" cy="-33" r="2" fill="${INK}"/><circle cx="4" cy="-33" r="2" fill="${INK}"/>`,
  toaster: `<rect x="-16" y="-24" width="32" height="24" rx="7" fill="#d8dee2" ${O}/><path d="M-9 -24 v-6 h6 v6 M3 -24 v-6 h6 v6" fill="#e0b071" ${O}/><path d="M16 -14 h4 v-6" fill="none" ${O}/>${eye(-5, -14, 1.6)}${eye(5, -14, 1.6)}${smile(0, -8, 6)}`,
  cake: `<rect x="-16" y="-14" width="32" height="14" rx="2" fill="#ffb3c0" ${O}/><rect x="-12" y="-26" width="24" height="12" rx="2" fill="#fff3d6" ${O}/><path d="M-16 -12 q4 4 8 0 t8 0 t8 0 t8 0" fill="none" stroke="#fff" stroke-width="2"/>
    <path d="M0 -26 V-32" ${O}/><path d="M0 -38 q3 3 0 5 q-3 -2 0 -5" fill="#ff9a1f" stroke="${INK}" stroke-width="1"/>`,
  pizza: `<path d="M-18 -4 L0 -34 L18 -4 Q0 2 -18 -4 Z" fill="#ffd23f" ${O}/><path d="M-18 -4 Q0 2 18 -4" fill="none" stroke="#c98b4a" stroke-width="4"/><circle cx="-4" cy="-12" r="3" fill="#e8383d"/><circle cx="5" cy="-16" r="3" fill="#e8383d"/><circle cx="0" cy="-24" r="2.5" fill="#e8383d"/>`,
  banana: `<path d="M-14 -30 Q-12 -4 14 -6 Q2 -10 -6 -32 Z" fill="#ffd23f" ${O}/><path d="M-15 -31 l-1 -4" ${O} stroke-width="3"/>${eye(-5, -18, 1.4)}${eye(1, -14, 1.4)}`,
  rock: `<path d="M-12 0 Q-14 -10 -4 -14 Q8 -16 12 -6 Q14 0 -12 0 Z" fill="#a0a4ad" ${O}/>`,
  trophy: `<rect x="-10" y="-6" width="20" height="6" fill="#8a5225" ${O}/><path d="M-3 -6 V-14 H3 V-6" fill="#ffd23f" ${O}/><path d="M-12 -34 H12 Q12 -14 0 -14 Q-12 -14 -12 -34 Z" fill="#ffd23f" ${O}/><path d="M-12 -30 q-7 0 -6 6 q1 4 7 4 M12 -30 q7 0 6 6 q-1 4 -7 4" fill="none" ${O}/>`,
  balloon: `<path d="M0 -26 Q-3 -14 2 0" fill="none" ${T}/><ellipse cx="0" cy="-36" rx="9" ry="11" fill="#ff5f5f" ${O}/><path d="M-2 -25 l2 2 l2 -2 Z" fill="#ff5f5f" ${T}/><ellipse cx="-3" cy="-40" rx="2" ry="3.5" fill="#fff" opacity=".6"/>`,
  umbrella: `<path d="M0 -30 V-2 q0 4 -4 4" fill="none" ${O}/><path d="M-22 -28 Q0 -50 22 -28 Q16 -32 11 -28 Q5 -32 0 -28 Q-5 -32 -11 -28 Q-16 -32 -22 -28 Z" fill="#ff5f5f" ${O}/><path d="M-11 -28 Q-4 -42 0 -42 Q4 -42 11 -28" fill="none" stroke="#fff" stroke-width="2.5" opacity=".7"/>`,
  flag: `<path d="M0 0 V-36" ${O}/><path d="M0 -36 H18 L14 -30 L18 -24 H0 Z" fill="#3ecf5a" ${O}/>`,
  crown: `<path d="M-10 0 L-12 -14 L-5 -7 L0 -16 L5 -7 L12 -14 L10 0 Z" fill="#ffd23f" ${O}/><circle cx="0" cy="-4" r="1.8" fill="#e8383d"/>`,
  tophat: `<rect x="-14" y="-4" width="28" height="4" rx="2" fill="#2a2a34" ${O}/><rect x="-9" y="-22" width="18" height="18" fill="#2a2a34" ${O}/><path d="M-9 -8 H9" stroke="#e8383d" stroke-width="3"/>`,
  chefhat: `<rect x="-9" y="-8" width="18" height="8" fill="#fff" ${O}/><path d="M-9 -8 Q-16 -10 -13 -17 Q-10 -24 -3 -20 Q0 -27 6 -21 Q14 -23 13 -15 Q15 -10 9 -8 Z" fill="#fff" ${O}/>`,
  shades: `<path d="M-14 -4 H14" ${O}/><rect x="-14" y="-6" width="12" height="8" rx="3" fill="${INK}"/><rect x="2" y="-6" width="12" height="8" rx="3" fill="${INK}"/><path d="M-11 -3 l3 -2" stroke="#fff" stroke-width="1.2"/>`,
  tie: `<path d="M-3 0 H3 L5 4 L2 22 L0 25 L-2 22 L-5 4 Z" fill="#e8383d" ${O}/>`,
  mic: `<path d="M0 0 V-26 M-8 0 H8" ${O}/><rect x="-4" y="-38" width="8" height="12" rx="4" fill="#5c6670" ${O}/>`,
  phone: `<rect x="-6" y="-20" width="12" height="20" rx="2" fill="#2a2a34" ${O}/><rect x="-4" y="-17" width="8" height="12" fill="#39d0e0"/><circle cx="0" cy="-3" r="1" fill="#fff"/>`,
  lights: `<path d="M0 0 V-30" ${O} stroke-width="3"/><rect x="-6" y="-56" width="12" height="28" rx="3" fill="#2a2a34" ${O}/><circle cx="0" cy="-50" r="3.2" fill="#5a2020"/><circle cx="0" cy="-42" r="3.2" fill="#5a4a10"/><circle cx="0" cy="-34" r="3.2" fill="#3ecf5a"/>`,
  button: `<rect x="-10" y="-10" width="20" height="10" rx="2" fill="#5c6670" ${O}/><ellipse cx="0" cy="-12" rx="8" ry="4" fill="#e8383d" ${O}/><path d="M0 -10 V-12" ${O}/>`,
  moonground: `<path d="M-90 0 V-14 Q-60 -22 -20 -16 Q20 -10 50 -18 Q76 -24 90 -16 V0 Z" fill="#b9bcc6" ${O}/><ellipse cx="-50" cy="-10" rx="8" ry="2.5" fill="#9a9ea8"/><ellipse cx="34" cy="-8" rx="6" ry="2" fill="#9a9ea8"/>`,
  moonball: `<circle cx="0" cy="-14" r="14" fill="#fff3b0" ${O}/><circle cx="-4" cy="-18" r="3" fill="#e8d98a"/><circle cx="5" cy="-10" r="2.5" fill="#e8d98a"/>`,
};

const sky = (a, b) => { const id = 'cc-sky' + a.slice(1) + b.slice(1); return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="100" fill="url(#${id})"/>`; };
const ground = (c, y = 90) => `<rect x="0" y="${y}" width="160" height="${100 - y}" fill="${c}"/><path d="M0 ${y} H160" stroke="${INK}" stroke-width="1.5"/>`;
const stars = n => Array.from({ length: n }, (_, i) => `<circle cx="${(i * 47 + 13) % 160}" cy="${(i * 29 + 7) % 70}" r="${i % 3 ? 0.8 : 1.3}" fill="#fff" opacity="${i % 2 ? .6 : .95}"/>`).join('');
const wall = (c, line) => `<rect width="160" height="100" fill="${c}"/>${line ? `<path d="M0 30 H160" stroke="${line}" stroke-width="2"/>` : ''}`;
const window_ = (x, y) => `<rect x="${x}" y="${y}" width="26" height="22" rx="2" fill="#bdf3ff" ${T}/><path d="M${x + 13} ${y} V${y + 22} M${x} ${y + 11} H${x + 26}" ${T}/>`;

export const BACKDROPS = {
  town: sky('#8fd8ff', '#d9f4ff') + `<circle cx="138" cy="16" r="9" fill="#ffd23f"/>` + `<path d="M0 90 V62 H18 V50 H34 V66 H50 V56 H70 V70 H92 V48 H108 V64 H128 V54 H146 V66 H160 V90 Z" fill="#b9c8d8"/>` + ground('#9aa3a8'),
  park: sky('#8fd8ff', '#e3f8ff') + `<circle cx="22" cy="16" r="9" fill="#ffd23f"/><path d="M0 74 Q40 58 84 70 T160 64 V90 H0 Z" fill="#8fd88a"/>` + ground('#5cc45a'),
  beach: sky('#7fd3ff', '#e3f8ff') + `<circle cx="140" cy="16" r="11" fill="#ffd23f"/><rect x="0" y="66" width="160" height="16" fill="#39a7d0"/><path d="M0 70 q10 -3 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#fff" stroke-width="1.5" fill="none"/>` + ground('#f3d98a', 82),
  space: `<rect width="160" height="100" fill="#14143a"/>${stars(30)}<circle cx="132" cy="22" r="10" fill="#6aa0ff" opacity=".9"/><path d="M124 18 q8 4 16 0" stroke="#3ecf5a" stroke-width="3" fill="none"/>`,
  night: `<rect width="160" height="100" fill="#1d2a5a"/>${stars(22)}<circle cx="26" cy="20" r="9" fill="#fff3b0"/><circle cx="30" cy="17" r="8" fill="#1d2a5a"/>` + ground('#2c4a3a'),
  sky: sky('#5fc4ff', '#cfefff') + `<g fill="#fff"><ellipse cx="30" cy="80" rx="22" ry="7"/><ellipse cx="44" cy="76" rx="12" ry="7"/><ellipse cx="130" cy="30" rx="18" ry="5"/><ellipse cx="120" cy="88" rx="26" ry="7"/></g>`,
  rain: sky('#7e8fa3', '#b9c4cf') + `<g stroke="#e3f0ff" stroke-width="1.2" opacity=".8">${Array.from({ length: 26 }, (_, i) => `<path d="M${(i * 37) % 160} ${(i * 23) % 80} l-3 8"/>`).join('')}</g>` + ground('#6a8a5a'),
  snow: sky('#c9dcef', '#f2f7fc') + `<g fill="#fff">${Array.from({ length: 24 }, (_, i) => `<circle cx="${(i * 41) % 160}" cy="${(i * 19) % 82}" r="1.4"/>`).join('')}</g>` + ground('#f7fbff'),
  room: wall('#f6d9a8', '#e0b878') + window_(18, 34) + `<rect x="120" y="40" width="16" height="20" fill="#ff9a1f" ${T}/>` + ground('#b77b4a'),
  kitchen: wall('#d9f0e6') + `<g fill="none" stroke="#b9d9cc" stroke-width="1">${Array.from({ length: 8 }, (_, i) => `<path d="M0 ${i * 12} H160 M${i * 22} 0 V90"/>`).join('')}</g>` + window_(66, 16) + ground('#c9a27a'),
  office: wall('#dfe6ee', '#c4ccd6') + window_(22, 36) + window_(112, 36) + `<rect x="74" y="22" width="12" height="14" fill="#fff" ${T}/>` + ground('#7d8a99'),
  studio: wall('#1d3f6a') + `<rect x="18" y="14" width="124" height="44" rx="4" fill="#2f7ff0" ${T}/><text x="80" y="42" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="14" fill="#fff">NEWS</text>` + ground('#13294a'),
  stage: `<rect width="160" height="100" fill="#3a1d2c"/><path d="M0 0 H24 Q20 50 28 90 H0 Z M160 0 H136 Q140 50 132 90 H160 Z" fill="#c2304a" ${T}/><path d="M0 0 H160 V10 Q80 18 0 10 Z" fill="#a0243a" ${T}/><ellipse cx="80" cy="90" rx="50" ry="8" fill="#fff3b0" opacity=".35"/>` + ground('#6a3a22'),
  castle: wall('#a8a2b8') + `<g fill="none" stroke="#8d87a0" stroke-width="1.3">${Array.from({ length: 8 }, (_, r) => `<path d="M0 ${r * 12 + 6} H160"/>`).join('')}</g><path d="M40 90 V20 M120 90 V20" stroke="#8d87a0" stroke-width="3"/><path d="M56 20 H104 V60 H56 Z" fill="#e8383d" ${T}/><path d="M80 26 l4 8 l8 1 l-6 6 l2 8 l-8 -4 l-8 4 l2 -8 l-6 -6 l8 -1 Z" fill="#ffd23f"/>` + ground('#6a5a7a'),
  shop: wall('#ffe9c2') + `<g>${[0, 1, 2].map(r => `<rect x="10" y="${16 + r * 20}" width="44" height="3" fill="#a46b3d"/><rect x="14" y="${6 + r * 20}" width="8" height="10" fill="#e8383d"/><rect x="26" y="${8 + r * 20}" width="8" height="8" fill="#3ecf5a"/><rect x="38" y="${6 + r * 20}" width="10" height="10" fill="#2f7ff0"/>`).join('')}</g>` + ground('#c9a27a'),
  lift: `<rect width="160" height="100" fill="#8d99a6"/><rect x="40" y="6" width="80" height="84" fill="#c8d0d8" ${T}/><path d="M80 6 V90" stroke="#9aa6b2" stroke-width="2"/><rect x="128" y="40" width="12" height="20" rx="2" fill="#5c6670" ${T}/><circle cx="134" cy="46" r="2" fill="#ffd23f"/><circle cx="134" cy="54" r="2" fill="#fff"/>` + ground('#5c6670'),
  pool: sky('#8fd8ff', '#d9f4ff') + `<rect x="0" y="62" width="160" height="38" fill="#39a7d0"/><path d="M0 66 q10 -3 20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0 t20 0" stroke="#bdf3ff" stroke-width="2" fill="none"/><rect x="0" y="56" width="160" height="6" fill="#f4f7ff" ${T}/>`,
};

/** A whole scene as one <svg> string. `cls` lets the view size it. */
export function sceneSvg(scene, cls = 'cc-pic') {
  if (!scene) return '';
  const props = (scene.props || []).map(([id, x, y, s = 1, flip = 0]) => PROPS[id] ? `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">${PROPS[id]}</g>` : '').join('');
  return `<svg class="${cls}" viewBox="0 0 160 100" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${String(scene.text).replace(/"/g, '&quot;')}">${BACKDROPS[scene.bg] || BACKDROPS.room}${props}</svg>`;
}
