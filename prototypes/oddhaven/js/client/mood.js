// A person's mood as weather (PLAN M1, M6 builds on it): the one reading every screen uses, so a stand-in 80 m away and the
// details panel always agree. Pure.
export const MOODS = [
  { min: 0.72, id: 'sunny', word: 'Sunny', icon: '☀️' },
  { min: 0.56, id: 'fair', word: 'Fair', icon: '⛅' },
  { min: 0.4, id: 'cloudy', word: 'Cloudy', icon: '☁️' },
  { min: 0.24, id: 'rainy', word: 'Rainy', icon: '🌧️' },
  { min: -1, id: 'stormy', word: 'Stormy', icon: '⛈️' },
];
export const moodIndex = m => { for (let i = 0; i < MOODS.length; i++) if ((m ?? 0.7) >= MOODS[i].min) return i; return MOODS.length - 1; };
export const moodOf = m => MOODS[moodIndex(m)];
export const NEED_NAMES = { food: 'Food', sleep: 'Sleep', fun: 'Fun', company: 'Company', clean: 'Clean', comfort: 'Comfort' };
export const RACE_NAMES = { human: 'Human', elf: 'Elf', dwarf: 'Dwarf', orc: 'Orc', giant: 'Giant', goblin: 'Goblin', halfling: 'Halfling', undead: 'Undead', beast: 'Beastfolk' };
export function clockText(minute, day) {
  const h = Math.floor(minute / 60) % 24, m = Math.floor(minute) % 60;
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return `${names[((day % 7) + 7) % 7]} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
