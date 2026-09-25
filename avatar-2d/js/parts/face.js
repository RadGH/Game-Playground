// Face parts. Head shapes are centered at (150,135), radius ~72. Eyes/brows/nose/mouth are drawn around (0,0) and
// positioned by the renderer (eyes and brows are mirrored for the right side, so draw the LEFT one).
// Colors via CSS vars: --skin --skin-dark --eye --mouth --hair --hair-dark.
const S = 'var(--skin)', SD = 'var(--skin-dark)', E = 'var(--eye)', MO = 'var(--mouth)', H = 'var(--hair)', HD = 'var(--hair-dark)';

export const headShape = {
  round: { name: 'Round', svg: `<circle cx="150" cy="135" r="72" fill="${S}"/>` },
  oval: { name: 'Oval', svg: `<ellipse cx="150" cy="137" rx="64" ry="76" fill="${S}"/>` },
  square: { name: 'Square', svg: `<rect x="82" y="66" width="136" height="140" rx="34" fill="${S}"/>` },
  heart: { name: 'Heart', svg: `<path d="M78 120 C78 75 110 62 150 62 C190 62 222 75 222 120 C222 165 185 207 150 207 C115 207 78 165 78 120 Z" fill="${S}"/>` },
  long: { name: 'Long', svg: `<path d="M86 110 C86 70 118 62 150 62 C182 62 214 70 214 110 L212 160 C212 195 180 212 150 212 C120 212 88 195 88 160 Z" fill="${S}"/>` },
  wide: { name: 'Wide', svg: `<ellipse cx="150" cy="138" rx="80" ry="68" fill="${S}"/>` },
  chiseled: { name: 'Chiseled', svg: `<path d="M84 100 C84 70 115 62 150 62 C185 62 216 70 216 100 L218 150 L150 210 L82 150 Z" fill="${S}"/>` },
};

export const ears = {
  normal: { name: 'Normal', pieces: [{ layer: 'ears', svg: `<ellipse cx="80" cy="140" rx="11" ry="15" fill="${S}"/><ellipse cx="220" cy="140" rx="11" ry="15" fill="${S}"/><ellipse cx="81" cy="141" rx="5" ry="8" fill="${SD}" opacity=".5"/><ellipse cx="219" cy="141" rx="5" ry="8" fill="${SD}" opacity=".5"/>` }] },
  pointed: { name: 'Pointed (elf)', pieces: [{ layer: 'ears', svg: `<path d="M84 150 L40 118 C60 128 72 128 86 124 Z" fill="${S}"/><path d="M216 150 L260 118 C240 128 228 128 214 124 Z" fill="${S}"/><path d="M82 146 L52 124 C64 130 74 130 84 128 Z" fill="${SD}" opacity=".35"/><path d="M218 146 L248 124 C236 130 226 130 216 128 Z" fill="${SD}" opacity=".35"/>` }] },
  big: { name: 'Big', pieces: [{ layer: 'ears', svg: `<ellipse cx="76" cy="140" rx="17" ry="22" fill="${S}"/><ellipse cx="224" cy="140" rx="17" ry="22" fill="${S}"/><ellipse cx="78" cy="141" rx="8" ry="12" fill="${SD}" opacity=".45"/><ellipse cx="222" cy="141" rx="8" ry="12" fill="${SD}" opacity=".45"/>` }] },
  none: { name: 'None', pieces: [] },
  fins: { name: 'Fins (sea folk)', pieces: [{ layer: 'ears', svg: `<path d="M84 128 L46 112 L56 138 L44 160 L86 152 Z" fill="${S}"/><path d="M216 128 L254 112 L244 138 L256 160 L214 152 Z" fill="${S}"/><path d="M60 118 L58 140 M52 150 L80 146" stroke="${SD}" stroke-width="2" fill="none"/><path d="M240 118 L242 140 M248 150 L220 146" stroke="${SD}" stroke-width="2" fill="none"/>` }] },
};

// Eyes: left eye centered at origin. Iris uses --eye.
export const eyes = {
  round: { name: 'Round', svg: `<ellipse rx="12" ry="13" fill="#fff"/><circle cx="1" cy="1" r="7" fill="${E}"/><circle cx="1" cy="1" r="3.5" fill="#111"/><circle cx="-2" cy="-3" r="2" fill="#fff"/>` },
  almond: { name: 'Almond', svg: `<path d="M-14 0 Q0 -13 14 0 Q0 11 -14 0 Z" fill="#fff"/><circle cx="1" cy="0" r="6.5" fill="${E}"/><circle cx="1" cy="0" r="3" fill="#111"/><circle cx="-1.5" cy="-2.5" r="1.6" fill="#fff"/><path d="M-14 0 Q0 -13 14 0" stroke="#222" stroke-width="2" fill="none"/>` },
  narrow: { name: 'Narrow', svg: `<path d="M-14 0 Q0 -7 14 0 Q0 7 -14 0 Z" fill="#fff"/><circle cx="1" cy="0" r="5" fill="${E}"/><circle cx="1" cy="0" r="2.5" fill="#111"/><path d="M-14 0 Q0 -7 14 0" stroke="#222" stroke-width="2.5" fill="none"/>` },
  wide: { name: 'Wide open', svg: `<ellipse rx="14" ry="16" fill="#fff"/><circle cx="0" cy="2" r="8" fill="${E}"/><circle cx="0" cy="2" r="4" fill="#111"/><circle cx="-3" cy="-2" r="2.5" fill="#fff"/><ellipse rx="14" ry="16" stroke="#222" stroke-width="1.5" fill="none"/>` },
  sleepy: { name: 'Sleepy', svg: `<path d="M-13 2 Q0 -8 13 2 Q0 9 -13 2 Z" fill="#fff"/><circle cx="1" cy="2" r="6" fill="${E}"/><circle cx="1" cy="2" r="3" fill="#111"/><path d="M-13 -1 Q0 -8 13 -1" stroke="#222" stroke-width="3" fill="none"/><path d="M-14 2 Q0 -6 14 2" fill="${S}"/>` },
  angry: { name: 'Angry', svg: `<path d="M-13 -2 L13 2 Q0 12 -13 3 Z" fill="#fff"/><circle cx="2" cy="2" r="6" fill="${E}"/><circle cx="2" cy="2" r="3" fill="#111"/><path d="M-13 -2 L13 2" stroke="#222" stroke-width="3" fill="none"/>` },
  dot: { name: 'Dots', svg: `<circle r="4.5" fill="#111"/><circle cx="-1.5" cy="-1.5" r="1.3" fill="#fff"/>` },
  anime: { name: 'Big anime', svg: `<ellipse rx="13" ry="18" fill="#fff"/><ellipse cx="0" cy="3" rx="10" ry="13" fill="${E}"/><ellipse cx="0" cy="5" rx="6" ry="8" fill="#111"/><ellipse cx="-4" cy="-3" rx="3.5" ry="4.5" fill="#fff"/><circle cx="4" cy="8" r="1.8" fill="#fff"/><path d="M-13 -4 Q0 -20 13 -4" stroke="#222" stroke-width="3" fill="none"/>` },
  happy: { name: 'Closed happy', svg: `<path d="M-12 3 Q0 -10 12 3" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
  wink: { name: 'Wink (mirror = open)', svg: `<ellipse rx="12" ry="13" fill="#fff"/><circle cx="1" cy="1" r="7" fill="${E}"/><circle cx="1" cy="1" r="3.5" fill="#111"/><circle cx="-2" cy="-3" r="2" fill="#fff"/>`, right: `<path d="M-12 0 Q0 6 12 0" stroke="#222" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
  hollow: { name: 'Hollow (undead)', svg: `<ellipse rx="12" ry="13" fill="#1a1a1a"/><circle cx="1" cy="1" r="4" fill="${E}"/><circle cx="1" cy="1" r="4" fill="${E}" opacity=".6"><animate attributeName="r" values="4;5.5;4" dur="2s" repeatCount="indefinite"/></circle>` },
  slit: { name: 'Slit pupil (beast)', svg: `<ellipse rx="12" ry="13" fill="#fff"/><circle cx="1" cy="1" r="8" fill="${E}"/><ellipse cx="1" cy="1" rx="2" ry="7" fill="#111"/><circle cx="-2" cy="-3" r="2" fill="#fff"/>` },
  tired: { name: 'Tired (bags)', svg: `<ellipse rx="12" ry="11" fill="#fff"/><circle cx="1" cy="1" r="6.5" fill="${E}"/><circle cx="1" cy="1" r="3" fill="#111"/><path d="M-11 9 Q0 15 11 9" stroke="${SD}" stroke-width="2.5" fill="none" opacity=".8"/>` },
};

export const brows = {
  straight: { name: 'Straight', svg: `<path d="M-14 0 L14 -2" stroke="${HD}" stroke-width="4" stroke-linecap="round" fill="none"/>` },
  arched: { name: 'Arched', svg: `<path d="M-14 2 Q0 -8 14 0" stroke="${HD}" stroke-width="4" stroke-linecap="round" fill="none"/>` },
  angry: { name: 'Angry', svg: `<path d="M-14 -6 L14 3" stroke="${HD}" stroke-width="5" stroke-linecap="round" fill="none"/>` },
  worried: { name: 'Worried', svg: `<path d="M-14 4 L14 -5" stroke="${HD}" stroke-width="4" stroke-linecap="round" fill="none"/>` },
  thick: { name: 'Thick', svg: `<path d="M-15 2 Q0 -8 15 -1 Q0 -2 -15 2 Z" fill="${HD}"/>` },
  thin: { name: 'Thin', svg: `<path d="M-13 0 Q0 -5 13 -1" stroke="${HD}" stroke-width="2" stroke-linecap="round" fill="none"/>` },
  none: { name: 'None', svg: `` },
  raised: { name: 'One raised', svg: `<path d="M-14 0 Q0 -12 14 -6" stroke="${HD}" stroke-width="4" stroke-linecap="round" fill="none"/>` },
};

export const nose = {
  small: { name: 'Small', svg: `<path d="M-4 -8 Q-7 4 0 5 Q7 4 4 -8" fill="${SD}" opacity=".55"/>` },
  dot: { name: 'Dot', svg: `<circle cy="2" r="3" fill="${SD}" opacity=".6"/>` },
  button: { name: 'Button', svg: `<circle cy="0" r="7" fill="${SD}" opacity=".5"/><circle cx="-2" cy="-2" r="2.5" fill="${S}"/>` },
  long: { name: 'Long', svg: `<path d="M-2 -18 L-6 6 Q0 10 6 6 L2 -18" fill="${SD}" opacity=".5"/>` },
  wide: { name: 'Wide', svg: `<path d="M-10 4 Q-8 -8 0 -6 Q8 -8 10 4 Q0 10 -10 4 Z" fill="${SD}" opacity=".5"/>` },
  hook: { name: 'Hook', svg: `<path d="M0 -16 Q10 -4 4 6 Q0 9 -4 6 Q2 -4 -3 -14 Z" fill="${SD}" opacity=".55"/>` },
  upturned: { name: 'Upturned', svg: `<path d="M-5 0 Q-6 6 0 4 Q6 6 5 0 Q3 -6 0 -4 Q-3 -6 -5 0 Z" fill="${SD}" opacity=".55"/>` },
  none: { name: 'None', svg: `` },
  snout: { name: 'Snout (beast)', svg: `<ellipse rx="12" ry="8" fill="${SD}"/><ellipse cx="-4" cy="1" rx="3" ry="2" fill="#111"/><ellipse cx="4" cy="1" rx="3" ry="2" fill="#111"/>` },
};

export const mouth = {
  smile: { name: 'Smile', svg: `<path d="M-14 -2 Q0 12 14 -2" stroke="${MO}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
  neutral: { name: 'Neutral', svg: `<path d="M-12 0 L12 0" stroke="${MO}" stroke-width="3.5" stroke-linecap="round"/>` },
  frown: { name: 'Frown', svg: `<path d="M-13 4 Q0 -8 13 4" stroke="${MO}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
  open: { name: 'Open', svg: `<ellipse rx="10" ry="9" fill="#3a1518"/><ellipse cy="4" rx="6" ry="4" fill="${MO}"/><path d="M-9 -3 Q0 -1 9 -3" fill="#fff"/>` },
  grin: { name: 'Grin (teeth)', svg: `<path d="M-15 -3 Q0 14 15 -3 Z" fill="#fff"/><path d="M-15 -3 Q0 14 15 -3" stroke="${MO}" stroke-width="2.5" fill="none"/><path d="M-8 -1 L-8 5 M0 0 L0 7 M8 -1 L8 5" stroke="#ccc" stroke-width="1"/>` },
  smirk: { name: 'Smirk', svg: `<path d="M-12 2 Q0 4 12 -6" stroke="${MO}" stroke-width="3.5" fill="none" stroke-linecap="round"/>` },
  o: { name: 'O', svg: `<circle r="6" fill="#3a1518"/><circle r="6" stroke="${MO}" stroke-width="2" fill="none"/>` },
  tongue: { name: 'Tongue out', svg: `<path d="M-13 -2 Q0 10 13 -2" stroke="${MO}" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M-4 3 Q0 14 6 3 Z" fill="#d4636b"/>` },
  fangs: { name: 'Fangs', svg: `<path d="M-14 -2 Q0 10 14 -2" stroke="${MO}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M-9 0 L-7 8 L-5 0 Z M5 0 L7 8 L9 0 Z" fill="#fff"/>` },
  sad_open: { name: 'Wail', svg: `<path d="M-10 4 Q0 -8 10 4 Q0 10 -10 4 Z" fill="#3a1518"/><path d="M-10 4 Q0 -8 10 4" stroke="${MO}" stroke-width="2.5" fill="none"/>` },
  stitched: { name: 'Stitched (undead)', svg: `<path d="M-14 0 L14 0" stroke="${MO}" stroke-width="3" stroke-linecap="round"/><path d="M-9 -5 L-9 5 M-3 -5 L-3 5 M3 -5 L3 5 M9 -5 L9 5" stroke="#222" stroke-width="2"/>` },
  tusks: { name: 'Tusks (orc)', svg: `<path d="M-13 0 L13 0" stroke="${MO}" stroke-width="3.5" stroke-linecap="round"/><path d="M-11 2 L-9 -10 L-5 2 Z M11 2 L9 -10 L5 2 Z" fill="#f2f0dc"/>` },
};

export const facialHair = {
  none: { name: 'None', pieces: [] },
  stubble: { name: 'Stubble', pieces: [{ layer: 'facialHair', svg: `<path d="M92 150 C96 195 120 210 150 210 C180 210 204 195 208 150 C200 190 175 198 150 198 C125 198 100 190 92 150 Z" fill="${HD}" opacity=".35"/>` }] },
  goatee: { name: 'Goatee', pieces: [{ layer: 'facialHair', svg: `<path d="M136 196 Q150 230 164 196 Q150 204 136 196 Z" fill="${H}"/><path d="M136 196 Q150 230 164 196" stroke="${HD}" stroke-width="1.5" fill="none"/>` }] },
  mustache: { name: 'Mustache', pieces: [{ layer: 'facialHair', svg: `<path d="M150 183 C140 178 128 180 122 190 C132 186 142 190 150 186 C158 190 168 186 178 190 C172 180 160 178 150 183 Z" fill="${H}"/>` }] },
  full: { name: 'Full beard', pieces: [{ layer: 'facialHair', svg: `<path d="M88 145 C90 200 110 236 150 236 C190 236 210 200 212 145 C205 175 185 190 150 190 C115 190 95 175 88 145 Z" fill="${H}"/><path d="M150 183 C140 178 128 180 122 190 C132 186 142 190 150 186 C158 190 168 186 178 190 C172 180 160 178 150 183 Z" fill="${HD}"/>` }] },
  long: { name: 'Long beard (dwarf)', pieces: [{ layer: 'facialHair', svg: `<path d="M88 145 C86 220 105 290 150 292 C195 290 214 220 212 145 C205 175 185 190 150 190 C115 190 95 175 88 145 Z" fill="${H}"/><path d="M120 220 Q150 232 180 220 M114 250 Q150 262 186 250" stroke="${HD}" stroke-width="2.5" fill="none"/><path d="M150 183 C140 178 128 180 122 190 C132 186 142 190 150 186 C158 190 168 186 178 190 C172 180 160 178 150 183 Z" fill="${HD}"/>` }] },
  chinstrap: { name: 'Chinstrap', pieces: [{ layer: 'facialHair', svg: `<path d="M86 140 C88 195 115 214 150 214 C185 214 212 195 214 140 C210 190 186 204 150 204 C114 204 90 190 86 140 Z" fill="${H}"/>` }] },
  soul_patch: { name: 'Soul patch', pieces: [{ layer: 'facialHair', svg: `<path d="M144 200 Q150 210 156 200 Z" fill="${H}"/>` }] },
};
