// Gibberish for strangers: the rhythm of speech, no words, no dictionary, almost no cost.
export const id = 'babble';
let lab = null, ready = null;
export async function load() {
  ready ||= import('../../../../../voice-lab/js/voice.js').then(m => { lab = m; });
  await ready;
}
/** Pure: profile -> voice-lab voice. */
export function toVoice(p) {
  return { engine: 'babble', babbleMode: 'simlish', gender: p.gender || 'n', pitch: +(p.pitch * 0.8 + 0.1).toFixed(2), speed: +(0.45 + p.speed * 0.3).toFixed(2), depth: +(0.6 - p.pitch * 0.4).toFixed(2), tone: +(0.3 + p.warmth * 0.5).toFixed(2), breath: 0.2, rough: +Math.min(1, p.rough).toFixed(2) };
}
export async function render(text, profile) {
  await load();
  return lab.synthesize(text, toVoice(profile));
}
