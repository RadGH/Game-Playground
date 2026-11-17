// What a set of Arcline saves holds, for the "which saves to keep?" choice (shared/rgs-cloudsave.js describe hook).
// Owner 2026-11-17: the phone's copy said "last updated just now" although he last played on his PC — each side now
// shows the time the game itself recorded (world lastPlayed, written when a city is saved or a world opened) and
// what is in it. values = { worlds, last, settings, regions, snaps } as the cloud-save module carries them.
const fmt = n => Math.round(n || 0).toLocaleString('en-US');

export function describeSaves(values) {
  let idx = null; try { idx = JSON.parse(values?.worlds || 'null'); } catch { idx = null; }
  const worlds = Array.isArray(idx?.worlds) ? idx.worlds : [];
  if (!worlds.length) return { playedAt: 0, lines: ['No saved worlds'] };
  const sorted = [...worlds].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  const lines = sorted.slice(0, 4).map(w => {
    const cities = Object.values(w.regions || {}).filter(s => s?.founded);
    const people = cities.reduce((a, s) => a + (s.population || 0), 0);
    const best = cities.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    return `${w.name || 'World'}: ${cities.length} ${cities.length === 1 ? 'city' : 'cities'}, ${fmt(people)} people${best ? ` (biggest: ${best.name || 'a city'}, day ${fmt(best.day)})` : ''}`;
  });
  if (sorted.length > 4) lines.push(`+ ${sorted.length - 4} more ${sorted.length - 4 === 1 ? 'world' : 'worlds'}`);
  return { playedAt: Math.max(0, ...worlds.map(w => w.lastPlayed || 0)), lines };
}
