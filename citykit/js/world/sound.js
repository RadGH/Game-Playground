// Sound for the scene and the game: Sound Lab ids, panned by screen x, quieter with distance, with a repeat limit
// per id so 20 turrets don't stack 20 identical shots (research-boom-feel.md: "Each sound name has its own repeat
// limit, but different layers may play together"). Audio starts only after the player's first tap (browsers block
// it before that); until then every call is a silent no-op.
let sfx = null, starting = null;
const last = new Map();
const LIMIT = { 'tower.shot': [4, 0.1], 'melee.hit': [4, 0.1], 'spell.physical.impact': [4, 0.1], 'explosion.small': [3, 0.15],
  'spell.lightning.impact': [2, 0.12], 'death.beast': [1, 0.2], 'thunder': [1, 0.5], 'stone.crumble': [2, 0.3] };

export async function startSound() {
  if (sfx) return sfx; if (starting) return starting;
  starting = (async () => {
    const { Sfx } = await import('../../../sfx/js/sfx.js');
    sfx = await Sfx.create({ method: 'hybrid', volume: 0.75, base: new URL('../../../sfx/', import.meta.url).href });
    try { await sfx.ctx?.resume?.(); } catch { /* resumes on the next tap */ }
    return sfx;
  })();
  return starting;
}
export function soundOn() { return !!sfx; }
export function setMuted(m) { sfx?.setMuted?.(m); }

/** play(id, { pan -1..1, gain, pitch, delay s }) — skipped when over the id's limit. */
export function play(id, { pan = 0, gain = 1, pitch, delay = 0 } = {}) {
  if (!sfx) return;
  const now = performance.now() / 1000, [n, win] = LIMIT[id] || [3, 0.08];
  const times = (last.get(id) || []).filter(t => now - t < win);
  if (times.length >= n) return;
  times.push(now); last.set(id, times);
  const go = () => sfx.play(id, { pan: Math.max(-1, Math.min(1, pan)), gain, pitch }).catch(() => {});
  delay > 0 ? setTimeout(go, delay * 1000) : go();
}
