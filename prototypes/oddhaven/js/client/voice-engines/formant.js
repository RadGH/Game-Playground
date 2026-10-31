// Our formant engine, behind the voice interface. The profile becomes voice-lab knobs here and nowhere else.
import { voiceFor } from '../../../../../shared/voices.js';

export const id = 'formant';
let lab = null, ready = null;
export async function load() {
  ready ||= import('../../../../../voice-lab/js/voice.js').then(m => { lab = m; });
  await ready;
}
/** Pure: profile -> voice-lab voice. */
export function toVoice(p) {
  const v = voiceFor({ role: 'villager', gender: p.gender || 'n', seed: p.seed || 1 });
  v.pitch = +(p.pitch * 0.7 + v.pitch * 0.3).toFixed(2);
  v.rough = +Math.min(1, p.rough).toFixed(2);
  v.tone = +(0.3 + p.warmth * 0.5).toFixed(2);
  v.speed = +(0.3 + p.speed * 0.4).toFixed(2);
  v.flutter = +(p.age * 0.3).toFixed(2);
  v.intonation = 2; v.wordgap = 0.1;
  return v;
}
export async function render(text, profile) {
  await load();
  return lab.synthesize(text, toVoice(profile));
}
