// ARPAbet phoneme inventory with acoustic targets for the formant synthesizer.
// Values are adult-male references (Hz); the synth scales them by the voice's vocal-tract size.
// f = steady formants [F1,F2,F3]; bw = bandwidths; for diphthongs f is the start and f2 the end target.
// av = voicing gain, af = frication gain, ah = aspiration gain (0..1). dur = base duration in ms (stressed, normal speed).
// Consonants carry a `locus` ([F1,F2,F3]) that neighbouring vowels glide toward, and stops a `burst` band.
// Sources: Klatt 1980 ("Software for a cascade/parallel formant synthesizer"), Peterson & Barney 1952 vowel means,
// Allen/Hunnicutt/Klatt "From Text to Speech" duration tables (values rounded and simplified).

export const VOWELS = {
  IY: { f: [270, 2290, 3010], bw: [60, 90, 150], dur: 120 },
  IH: { f: [390, 1990, 2550], bw: [60, 100, 150], dur: 85 },
  EH: { f: [530, 1840, 2480], bw: [70, 100, 160], dur: 110 },
  AE: { f: [660, 1720, 2410], bw: [80, 100, 170], dur: 150 },
  AA: { f: [730, 1090, 2440], bw: [80, 90, 170], dur: 150 },
  AO: { f: [570, 840, 2410], bw: [80, 80, 170], dur: 150 },
  UH: { f: [440, 1020, 2240], bw: [70, 90, 150], dur: 85 },
  UW: { f: [300, 870, 2240], bw: [60, 80, 150], dur: 120 },
  AH: { f: [640, 1190, 2390], bw: [80, 100, 170], dur: 100 },
  AX: { f: [500, 1500, 2500], bw: [80, 110, 180], dur: 60 },      // schwa (AH0)
  ER: { f: [490, 1350, 1690], bw: [80, 100, 120], dur: 140 },
  EY: { f: [530, 1840, 2480], f2: [390, 2100, 2650], bw: [70, 100, 160], dur: 170, diph: true },
  AY: { f: [730, 1090, 2440], f2: [400, 2000, 2600], bw: [80, 100, 170], dur: 190, diph: true },
  OW: { f: [570, 840, 2410], f2: [350, 800, 2240], bw: [80, 80, 170], dur: 170, diph: true },
  AW: { f: [730, 1090, 2440], f2: [420, 900, 2300], bw: [80, 100, 170], dur: 190, diph: true },
  OY: { f: [570, 840, 2410], f2: [430, 1900, 2550], bw: [80, 90, 170], dur: 200, diph: true },
};

// Consonants. locus = formant values the vowel transitions aim at (closure/constriction).
export const CONSONANTS = {
  // nasals: voiced, nasal branch on, murmur through low F1
  M: { cls: 'nasal', voiced: true, f: [250, 1000, 2200], bw: [80, 200, 250], locus: [250, 1000, 2200], av: 0.45, nasal: 1, dur: 70 },
  N: { cls: 'nasal', voiced: true, f: [250, 1500, 2500], bw: [80, 200, 250], locus: [250, 1650, 2600], av: 0.45, nasal: 1, dur: 65 },
  NG: { cls: 'nasal', voiced: true, f: [250, 2000, 2600], bw: [80, 250, 250], locus: [250, 2100, 2500], av: 0.4, nasal: 1, dur: 80 },
  // liquids / glides: voiced sonorants with their own formants
  L: { cls: 'liquid', voiced: true, f: [380, 1100, 2600], bw: [70, 120, 250], locus: [380, 1100, 2600], av: 0.7, dur: 65 },
  R: { cls: 'liquid', voiced: true, f: [400, 1150, 1550], bw: [80, 120, 150], locus: [400, 1150, 1550], av: 0.7, dur: 70 },
  W: { cls: 'glide', voiced: true, f: [300, 620, 2200], bw: [60, 90, 200], locus: [300, 620, 2200], av: 0.65, dur: 65 },
  Y: { cls: 'glide', voiced: true, f: [280, 2150, 2950], bw: [60, 100, 200], locus: [280, 2150, 2950], av: 0.65, dur: 60 },
  // aspirate: noise excites the following vowel's formants
  HH: { cls: 'asp', voiced: false, ah: 0.7, dur: 60 },
  // fricatives: noise through parallel resonators (bands) + bypass. voiced ones keep reduced voicing.
  S: { cls: 'fric', voiced: false, af: 0.9, bands: [[5500, 900, 1.0], [7000, 1500, 0.5]], bypass: 0.05, locus: [250, 1700, 2600], dur: 110 },
  Z: { cls: 'fric', voiced: true, af: 0.6, av: 0.35, bands: [[5500, 900, 1.0], [7000, 1500, 0.5]], bypass: 0.05, locus: [250, 1700, 2600], dur: 80 },
  SH: { cls: 'fric', voiced: false, af: 0.9, bands: [[2500, 400, 1.0], [3400, 600, 0.6], [5000, 1200, 0.3]], bypass: 0.03, locus: [250, 1900, 2500], dur: 115 },
  ZH: { cls: 'fric', voiced: true, af: 0.6, av: 0.35, bands: [[2500, 400, 1.0], [3400, 600, 0.6]], bypass: 0.03, locus: [250, 1900, 2500], dur: 85 },
  F: { cls: 'fric', voiced: false, af: 0.45, bands: [[4000, 2500, 0.5], [7500, 2500, 0.4]], bypass: 0.25, locus: [250, 1000, 2300], dur: 95 },
  V: { cls: 'fric', voiced: true, af: 0.3, av: 0.4, bands: [[4000, 2500, 0.5]], bypass: 0.2, locus: [250, 1000, 2300], dur: 60 },
  TH: { cls: 'fric', voiced: false, af: 0.4, bands: [[6000, 3000, 0.5]], bypass: 0.3, locus: [250, 1600, 2600], dur: 90 },
  DH: { cls: 'fric', voiced: true, af: 0.25, av: 0.45, bands: [[6000, 3000, 0.4]], bypass: 0.25, locus: [250, 1600, 2600], dur: 50 },
  // stops: closure (silence / voice bar) → burst (noise band) → aspiration (voiceless) before the vowel
  P: { cls: 'stop', voiced: false, locus: [250, 900, 2300], burst: [[900, 1500, 0.5], [3500, 3000, 0.25]], burstDur: 10, asp: 50, closure: 60, dur: 75 },
  B: { cls: 'stop', voiced: true, locus: [250, 900, 2300], burst: [[900, 1500, 0.4]], burstDur: 8, asp: 8, closure: 55, dur: 65 },
  T: { cls: 'stop', voiced: false, locus: [250, 1750, 2650], burst: [[4200, 2500, 0.9], [6500, 2000, 0.4]], burstDur: 12, asp: 55, closure: 60, dur: 80 },
  D: { cls: 'stop', voiced: true, locus: [250, 1750, 2650], burst: [[4000, 2500, 0.5]], burstDur: 8, asp: 10, closure: 50, dur: 60 },
  K: { cls: 'stop', voiced: false, locus: [250, 2100, 2400], burst: [[2000, 700, 1.0], [3500, 1500, 0.4]], burstDur: 16, asp: 60, closure: 65, dur: 85 },
  G: { cls: 'stop', voiced: true, locus: [250, 2100, 2400], burst: [[2000, 700, 0.6]], burstDur: 10, asp: 12, closure: 55, dur: 65 },
  // affricates = stop + fricative
  CH: { cls: 'affr', voiced: false, locus: [250, 1900, 2500], burst: [[3000, 1000, 0.8]], burstDur: 12, closure: 50, fric: 'SH', fricDur: 70, dur: 130 },
  JH: { cls: 'affr', voiced: true, locus: [250, 1900, 2500], burst: [[3000, 1000, 0.5]], burstDur: 8, closure: 45, fric: 'ZH', fricDur: 55, dur: 110 },
};

export const PHONEMES = { ...Object.fromEntries(Object.entries(VOWELS).map(([k, v]) => [k, { cls: v.diph ? 'diph' : 'vowel', voiced: true, av: 1, ...v }])), ...CONSONANTS };
export const VOWEL_SET = new Set(Object.keys(VOWELS));
export function isVowel(p) { return VOWEL_SET.has(stripStress(p)); }
export function stripStress(p) { return p.replace(/[0-9]$/, ''); }
export function stressOf(p) { const m = /([0-9])$/.exec(p); return m ? +m[1] : -1; }
export const SILENCE = { cls: 'sil', voiced: false, dur: 0 };
