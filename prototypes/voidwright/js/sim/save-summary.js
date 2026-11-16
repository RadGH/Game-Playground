// What a set of Voidwright saves holds, for the "which saves to keep?" choice (shared/rgs-cloudsave.js describe hook).
// Owner 2026-11-16: lost a day of progress choosing blind — each side now shows when it was played and real stats.
// values = { prefs, last, slots } as the cloud-save module carries them; slots is a JSON object of
// 'voidwright.slot.N' -> that slot's save (a JSON string).
const fmt = n => Math.round(n || 0).toLocaleString('en-US');
const hours = ms => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m} min played` : `${(m / 60).toFixed(m < 600 ? 1 : 0)} h played`; };

export function describeSaves(values) {
  let group = {}; try { group = JSON.parse(values?.slots || '{}') || {}; } catch { group = {}; }
  const games = [];
  for (const [key, raw] of Object.entries(group)) {
    const n = +key.split('.').pop();
    let G = null; try { G = JSON.parse(raw); } catch { G = null; }
    if (G && typeof G === 'object') games.push({ n, G });
  }
  games.sort((a, b) => (b.G.savedAt || 0) - (a.G.savedAt || 0));
  if (!games.length) return { playedAt: 0, lines: ['No saved games'] };
  const lines = games.map(({ n, G }) => {
    const ships = 1 + (G.hangar?.length || 0);
    return `Slot ${n + 1} · ${G.name || 'Captain'}: ${G.ship?.name || 'ship'}${ships > 1 ? ` + ${ships - 1} more ship${ships > 2 ? 's' : ''}` : ''}, ${fmt(G.credits)} credits, chapter ${(G.quest?.chapter || 0) + 1}, ${(G.visited?.length || 1)} systems visited, ${hours(G.playTime)}`;
  });
  return { playedAt: Math.max(...games.map(g => g.G.savedAt || 0)), lines };
}
