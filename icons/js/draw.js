// Small, reusable SVG drawing parts. All pictures share Starcaller's 32px medallion.
export const GOLD = '#e6c14a', PALE = '#fff2b8', NIGHT = '#1c1f4a', DEEP = '#10122e';
export const path = (d, fill = GOLD) => `<path d="${d}" fill="${fill}"/>`;
export const line = (d, color = GOLD, width = 1.6) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
export const circle = (x, y, r, fill = GOLD) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
export const ring = (x = 16, y = 16, r = 10, color = GOLD, width = 1.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
export const oval = (x = 16, y = 24, rx = 10, ry = 3, color = GOLD) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${color}" stroke-width="1.3"/>`;
export const at = (art, x = 16, y = 16, scale = 1, angle = 0) => `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale}) translate(-16 -16)">${art}</g>`;
export const faint = (art, opacity = 0.4) => `<g opacity="${opacity}">${art}</g>`;
export const star = (x = 16, y = 16, r = 6, w = 0.3, fill = GOLD) => {
  const k = r * w, points = [[x,y-r],[x+k,y-k],[x+r,y],[x+k,y+k],[x,y+r],[x-k,y+k],[x-r,y],[x-k,y-k]];
  return path(`M${points.map(p => p.map(v => +v.toFixed(2)).join(' ')).join('L')}Z`, fill);
};
export const disc = circle(16, 16, 15.5, NIGHT) + ring(16, 16, 15.5, GOLD, 1) + faint(ring(16, 16, 15, DEEP, 1), 0.6);
export const sweep = line('M5 21 Q3 6 23 7 M20 4 L25 7 L21 11');
export const burst = line('M16 4 V8 M16 24 V28 M4 16 H8 M24 16 H28 M7 7 L10 10 M22 22 L25 25 M7 25 L10 22 M22 10 L25 7', PALE);
export const trail = line('M5 24 L14 15 M4 20 L10 14 M9 27 L15 21', GOLD, 1.5);
export const crack = line('M16 9 L13 15 L18 17 L13 23 L16 28 M14 15 L8 17 M17 18 L23 22', PALE, 1.8);
export const glyph = {
  sword: path('M14 21 V8 L16 3 L18 8 V21 Z') + line('M16 7 V20', PALE, 1) + line('M10 22 H22 M16 22 V28', GOLD, 2.6),
  dagger: path('M14 21 L14 9 L17 5 L19 10 L17 21 Z') + line('M11 22 L20 23 M15 23 L14 28', PALE, 2.2),
  shield: path('M7 7 Q16 10 25 7 V17 Q24 24 16 28 Q8 24 7 17 Z') + path('M10 10 Q16 12 22 10 V17 Q21 22 16 25 Q11 22 10 17 Z', NIGHT) + line('M16 12 V22', PALE, 2),
  hammer: path('M7 6 H24 V14 H7 Z') + path('M14 14 H18 V28 H14 Z') + line('M10 8 H21 M16 16 V25', PALE),
  arrow: line('M6 27 L24 8', GOLD, 2.1) + path('M18 7 L27 4 L24 14 Z', PALE) + line('M5 22 L10 22 L10 27 M8 19 L13 19 L13 24'),
  bow: line('M10 4 Q29 16 10 28 L15 16 Z', GOLD, 2) + line('M5 16 H26', PALE) + path('M23 12 L28 16 L23 20', PALE),
  fist: path('M8 18 L6 14 Q5 11 8 11 L10 14 V8 Q11 5 13 8 V6 Q15 4 17 7 Q19 5 21 8 Q24 6 25 10 V18 L21 24 V28 H11 V23 Z') + line('M13 10 V15 M17 9 V15 M21 10 V16 M10 17 H19 L17 21', NIGHT, 1.5),
  heart: path('M16 27 C12 22 4 18 5 11 C6 5 13 5 16 10 C19 5 26 5 27 11 C28 18 20 23 16 27 Z') + line('M8 14 H12 L14 11 L17 20 L20 14 H24', NIGHT, 1.8),
  sun: circle(16,16,6) + circle(16,16,3,PALE) + line('M16 3 V7 M16 25 V29 M3 16 H7 M25 16 H29 M7 7 L10 10 M22 22 L25 25 M7 25 L10 22 M22 10 L25 7'),
  flame: path('M16 3 C19 11 26 12 25 20 C24 30 7 29 7 20 C6 14 13 11 12 7 L16 11 Z') + path('M16 15 C18 18 22 22 18 25 C12 29 10 21 16 15 Z', PALE),
  skull: path('M6 14 C6 1 26 1 26 14 L24 21 H21 V27 H11 V21 H8 Z') + circle(12,15,3,NIGHT) + circle(21,15,3,NIGHT) + path('M16 18 L13 22 H18 Z',NIGHT) + line('M14 24 V27 M18 24 V27',NIGHT),
  person: circle(16,9,3.3,PALE) + path('M10 26 L12 16 Q16 12 20 16 L23 26 Z') + line('M11 18 L6 22 M21 18 L26 22'),
  boot: path('M10 6 H20 L19 19 L25 22 L27 27 H7 V22 L10 18 Z') + line('M10 24 H24 M12 10 H17 M12 14 H17',NIGHT),
  drop: path('M16 4 C15 11 7 16 8 22 C9 31 25 29 25 21 C25 15 18 9 16 4 Z') + line('M12 19 Q10 24 16 25',PALE,2),
  cross: path('M13 5 H19 V12 H26 V18 H19 V26 H13 V18 H6 V12 H13 Z'),
  note: path('M15 6 L25 4 V22 H22 V10 L18 11 V24 H15 Z') + `<ellipse cx="12" cy="24" rx="6" ry="3.7" fill="${GOLD}"/><ellipse cx="21" cy="22" rx="5" ry="3.5" fill="${GOLD}"/>`,
  snow: line('M16 4 V28 M6 10 L26 22 M6 22 L26 10 M12 6 L16 10 L20 6 M12 26 L16 22 L20 26 M6 14 L10 12 L10 8 M22 8 L22 12 L26 14 M6 18 L10 20 L10 24 M22 24 L22 20 L26 18',PALE,1.7),
  crystal: path('M16 3 L23 11 L21 23 L16 29 L10 23 L8 11 Z') + line('M16 3 L13 12 L16 29 L19 12 Z M8 11 L13 12 M19 12 L23 11',NIGHT,1.2) + line('M16 6 L15 11',PALE),
  bone: path('M10 6 C6 1 2 7 7 11 L12 13 L21 24 C19 28 26 30 27 25 C32 23 28 18 24 20 L14 10 L13 7 Q14 2 10 6 Z'),
  cloud: path('M7 24 C0 23 3 14 9 15 C8 5 22 4 23 14 C30 12 33 23 26 24 Z') + line('M11 18 Q15 14 19 18',PALE),
  imp: path('M8 12 L6 3 L14 9 H19 L27 3 L24 14 L26 21 L16 29 L6 21 Z') + path('M9 15 L14 17 L10 19 Z M23 15 L18 17 L22 19 Z',PALE) + line('M12 23 L16 21 L20 23',NIGHT,2),
  wolf: path('M6 3 L14 9 H19 L27 3 L24 17 L21 25 L16 29 L11 25 L8 17 Z') + path('M9 13 L14 16 L10 18 Z M23 13 L18 16 L22 18 Z',PALE) + path('M12 22 H20 L16 26 Z',NIGHT),
  eye: path('M3 16 Q16 2 29 16 Q16 30 3 16 Z') + circle(16,16,6,NIGHT) + circle(16,16,3,PALE),
  moon: path('M23 4 C8 0 0 18 11 26 Q21 34 28 22 C15 27 9 10 23 4 Z'),
  portal: oval(16,16,9,12) + oval(16,16,5,9,PALE) + path('M14 8 L19 15 L14 25 L17 16 Z',PALE),
  chain: line('M6 19 L10 15 Q14 12 16 16 Q17 18 14 21 L10 25 Q6 27 5 23 Z M16 9 L20 5 Q25 2 27 7 Q28 9 24 13 L21 16 Q17 18 15 14 Z M12 19 L21 10',GOLD,2.4),
  hook: line('M17 3 V20 Q17 29 25 24 Q29 21 25 16 L24 22 M17 8 L11 5 L7 9 L11 13 L17 9',GOLD,2.5),
  coin: circle(16,16,11) + ring(16,16,8,NIGHT) + star(16,16,6,0.32,NIGHT),
  bag: path('M9 4 H23 L20 11 C32 25 27 29 16 29 C5 29 0 25 12 11 Z') + line('M11 11 H21 M13 7 L16 11 L19 7',NIGHT,1.7) + star(16,21,4,0.35,PALE),
  trap: line('M6 10 L9 15 L5 18 L10 21 L9 26 M26 10 L23 15 L27 18 L22 21 L23 26 M6 10 Q16 2 26 10 M9 26 Q16 30 23 26',GOLD,2) + line('M8 17 H24 M16 10 V24',PALE),
  bomb: circle(15,20,9) + path('M13 10 V7 H19 V12 Z') + line('M18 7 Q23 10 23 4',PALE) + star(25,5,3,0.3,PALE),
  feather: path('M8 26 C0 13 16 0 26 5 C29 18 20 25 8 26 Z') + line('M5 29 L22 9 M9 23 L8 17 M13 19 L21 19 M16 15 L16 9',NIGHT,1.5),
  dragon: path('M5 5 L16 10 L23 3 L23 12 L28 16 L25 21 L18 20 L22 28 L11 26 L6 20 L10 14 Z') + path('M19 12 L24 15 L19 16 Z',PALE) + line('M20 18 H26 M11 18 L14 23',NIGHT,1.5),
  wing: path('M5 27 L8 6 L15 13 L27 4 L25 15 L20 14 L18 22 L13 19 L5 27 Z') + line('M5 27 L15 13 L25 7 M15 13 L18 22',NIGHT),
  scale: path('M16 4 L27 11 L24 22 L16 28 L8 22 L5 11 Z') + line('M7 12 Q16 21 25 12 M10 21 Q16 26 22 21 M16 5 V15',NIGHT,1.8),
  lightning: path('M18 2 L7 18 H14 L11 30 L27 12 H19 L24 2 Z') + path('M18 6 L11 16 H17 L15 24 L23 14 H17 Z',PALE),
  leaf: path('M26 4 C27 19 24 30 7 24 C2 8 15 5 26 4 Z') + line('M5 28 L23 8 M10 22 L10 15 M15 17 L22 17 M18 14 L18 9',NIGHT,1.5),
  paw: `<ellipse cx="16" cy="22" rx="7" ry="6" fill="${GOLD}"/>` + circle(6,15,3) + circle(11,8,3.5) + circle(21,8,3.5) + circle(26,15,3),
  mushroom: path('M13 17 H19 L21 28 H11 Z') + path('M3 18 Q4 1 16 3 Q28 2 29 18 Z') + circle(11,11,2.5,PALE) + circle(21,12,3,PALE) + line('M6 18 H26',NIGHT,1.5),
  book: path('M4 6 Q10 4 16 9 Q22 4 28 6 V26 Q22 24 16 28 Q10 24 4 26 Z') + line('M16 9 V26 M7 11 L12 12 M7 16 L12 17 M20 12 L25 11 M20 17 L25 16',NIGHT,1.6),
  flag: line('M8 4 V28',PALE,2) + path('M9 5 Q15 2 21 6 L27 5 L24 12 L27 18 Q21 22 16 18 L9 19 Z') + star(17,12,4,0.3,NIGHT),
  hourglass: line('M8 4 H24 M8 28 H24 M10 5 Q10 12 16 16 Q22 20 22 27 M22 5 Q22 12 16 16 Q10 20 10 27',GOLD,2.2) + path('M12 9 H20 L16 14 Z M16 20 L11 26 H21 Z',PALE),
  clock: ring(16,17,11,GOLD,2) + line('M16 9 V17 L22 20 M16 3 V6 M12 3 H20',PALE,2) + circle(16,17,1.6),
  mountain: path('M3 27 L12 7 L17 16 L22 10 L30 27 Z') + path('M12 7 L8 16 L12 14 L16 16 Z M22 10 L19 17 H25 Z',PALE),
  post: path('M12 5 H20 V28 H12 Z M7 9 H25 V13 H7 Z M9 18 H23 V22 H9 Z') + star(16,11,3,0.3,NIGHT) + line('M16 17 V25',NIGHT,1.8),
  scroll: path('M8 4 H26 V23 Q26 29 21 28 H5 V24 H9 V8 H5 Q3 4 8 4 Z') + line('M13 9 H22 M13 13 H22 M13 17 H20 M9 24 H21 V27',NIGHT,1.5),
  net: line('M7 7 L25 9 L27 25 L9 27 Z M12 8 L14 26 M18 8 L20 26 M8 13 L26 15 M8 19 L27 21',GOLD,1.7),
  wall: path('M4 10 H8 V6 H12 V10 H20 V6 H24 V10 H28 V27 H4 Z') + line('M4 17 H28 M4 23 H28 M10 11 V17 M21 11 V17 M16 17 V23 M10 23 V27 M22 23 V27',NIGHT,1.7),
  orb: circle(16,16,8) + line('M11 12 Q16 8 21 13',PALE,2) + oval(16,18,13,4,PALE),
  anvil: path('M3 10 H28 V15 H22 L20 22 L26 26 V28 H8 V26 L13 22 L12 18 L6 16 Z') + line('M6 12 H25 M15 19 H20',PALE),
  gear: path('M13 3 H19 L20 8 L24 7 L28 12 L25 16 L28 20 L24 25 L20 24 L19 29 H13 L12 24 L8 25 L4 20 L7 16 L4 12 L8 7 L12 8 Z') + circle(16,16,6,NIGHT) + circle(16,16,2.5,PALE),
  flask: path('M11 3 H21 V7 H19 V12 L27 23 Q29 28 24 28 H8 Q3 28 5 23 L13 12 V7 H11 Z') + path('M10 19 H22 L26 25 H6 Z',PALE) + line('M13 6 H19',NIGHT),
  turret: path('M10 12 H23 V20 H10 Z M20 13 L28 10 V15 L23 18 Z') + circle(13,16,3,PALE) + line('M16 20 V25 M16 22 L6 28 M16 22 L26 28',GOLD,2.4),
  candle: path('M12 15 H20 V28 H12 Z') + at(path('M16 3 Q25 13 16 14 Q8 13 16 3 Z',PALE),16,10,1) + line('M15 17 V22 M8 28 H24',PALE),
  mask: path('M5 8 Q16 13 27 8 L25 22 Q16 34 7 22 Z') + line('M9 16 L14 18 M18 18 L23 16 M12 24 Q16 21 20 24',NIGHT,2),
};
