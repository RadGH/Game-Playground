// Browser built-in speech (Web Speech API). Free, uses the OS voices (on Windows 11: David/Zira/Mark offline, plus
// Google/Microsoft online voices). Only rate + pitch are controllable and there is NO audio buffer, so effects,
// overlapping NPCs, and pre-rendering are impossible. Included as the quality/zero-effort reference.
export const meta = {
  id: 'webspeech', name: 'Web Speech API (OS voices)', license: 'built-in', commercial: 'yes',
  licenseNote: 'Part of the browser; no bundling. Voice availability differs per OS/browser and some voices need internet.',
  offline: 'depends on voice', size: '0', quality: 'Good to very good (OS neural voices).',
  crowd: 'One utterance at a time, queued. Cannot overlap voices or apply effects. Not usable for crowds.',
  pros: ['Zero download', 'Best intelligibility for free', 'Many languages'],
  cons: ['Only rate + pitch knobs', 'No audio buffer → no effects, no mixing, no waveform', 'Voices differ per machine, so a "voice" is not portable', 'Chrome cuts long utterances; queue is global'],
  knobs: ['pitch', 'speed', 'variant'], supportsPhonemes: false, yieldsBuffer: false,
};
export async function load() { if (!('speechSynthesis' in window)) throw new Error('Web Speech API not available'); await voices(); }
let cached = null;
export function voices() {
  return new Promise(res => {
    const got = () => { const v = speechSynthesis.getVoices(); if (v.length) { cached = v; res(v); return true; } return false; };
    if (got()) return; speechSynthesis.addEventListener('voiceschanged', got, { once: true }); setTimeout(() => res(speechSynthesis.getVoices()), 1500);
  });
}
export function voiceOptions() { return (cached || speechSynthesis.getVoices()).map(v => ({ value: v.name, label: `${v.name} (${v.lang})${v.localService ? '' : ' [online]'}` })); }
export function mapKnobs(v) { return { rate: 0.5 + (v.speed ?? 0.3) * 1.7, pitch: (v.pitch ?? 0.5) * 2 }; }
/** Speaks directly; resolves when finished. There are no samples. */
export function speakDirect(text, v) {
  return new Promise((res, rej) => {
    const u = new SpeechSynthesisUtterance(text.replace(/\[\[|\]\]/g, ''));
    const { rate, pitch } = mapKnobs(v); u.rate = rate; u.pitch = pitch;
    const all = cached || speechSynthesis.getVoices(); const pick = all.find(x => x.name === v.variant) || all.find(x => /en/i.test(x.lang)); if (pick) u.voice = pick;
    u.onend = () => res({ info: { engine: 'webspeech', voice: pick?.name, rate, pitch } }); u.onerror = e => rej(new Error('speech error ' + e.error));
    speechSynthesis.speak(u);
  });
}
export function stop() { speechSynthesis.cancel(); }
