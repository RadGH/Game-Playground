// Skills (round 7 — owner: "more skills and talent type of systems"): one active skill per build, fired with key 2 ·
// controller d-pad right · touch Skill, then it recharges. New skills open with pilot rank; the Tuning rig picks the
// build's skill. The effects run in perks.js (pure, events for the look). Numbers here are the ONE place they live;
// damage grows with the mission's danger (tier) so a skill stays worth pressing late on.

export const SKILLS = [
  { id: 'repulse', name: 'Repulsor Pulse', rank: 1, cd: 12, colour: '#9fe8ff', r: 2.5, dmg: 300, stun: 1,
    text: 'Shoves every enemy within 40 m away and shocks them still for 1 s (300 energy damage)' },
  { id: 'nova', name: 'Arc Nova', rank: 2, cd: 16, colour: '#c8a8ff', r: 4, dmg: 600, n: 12, stun: 0.8,
    text: 'Lightning leaps from your frame to up to 12 enemies within 64 m (600 electric each)' },
  { id: 'dome', name: 'Barrier Dome', rank: 3, cd: 24, colour: '#3ff0ff', r: 2.2, t: 6, cut: 0.6,
    text: 'Raises a dome for 6 s: you and teammates inside take 60% less damage' },
  { id: 'well', name: 'Gravity Well', rank: 4, cd: 20, colour: '#b46bff', r: 2.4, t: 3, pull: 4, dmg: 900, reach: 9,
    text: 'Throws a singularity at your aim: it drags enemies within 38 m in for 3 s, then bursts (900 void)' },
  { id: 'decoy', name: 'Decoy Holo', rank: 5, cd: 22, colour: '#5fffb0', t: 6, dmg: 500, r: 1.8,
    text: 'A hologram of your frame draws enemy fire for 6 s, then bursts (500 energy, 29 m)' },
  { id: 'cryo', name: 'Cryo Burst', rank: 6, cd: 20, colour: '#bfe9ff', r: 3, t: 3, dmg: 200,
    text: 'Freezes every enemy within 48 m solid for 3 s (200 cryo damage)' },
  { id: 'lance', name: 'Orbital Lance', rank: 7, cd: 26, colour: '#ffd23f', r: 2, delay: 1.5, dmg: 2400, reach: 12,
    text: 'Marks your aim point; 1.5 s later a beam from orbit hits everything within 32 m (2,400 energy)' },
  { id: 'overdrive', name: 'Overdrive', rank: 8, cd: 30, colour: '#ffb02e', t: 6, rate: 1.5,
    text: 'For 6 s your weapons fire 50% faster and make no heat' },
];
export const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));

/** Skills a pilot of this rank can pick. */
export const skillsFor = rank => SKILLS.filter(s => s.rank <= rank);
/** The skill a build carries, if the pilot's rank allows it (co-op server check too). */
export const cleanSkill = (id, rank) => (SKILL_BY_ID[id] && SKILL_BY_ID[id].rank <= rank ? id : 'repulse');
