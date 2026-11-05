// Request checking for the Kokoro voice service, kept free of the model and node_modules so unit tests can import it.
export const MAX_TEXT = 1000;
export const VOICES = ['af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam', 'am_michael', 'am_onyx', 'am_puck', 'am_santa',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily', 'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis'];

/** Validate and fill in a /tts request; throws a readable message for anything a page could get wrong. */
export function parseRequest(q = {}) {
  const text = String(q.text ?? '').replace(/\[\[|\]\]/g, '').trim();
  if (!text) throw new Error('text is empty');
  if (text.length > MAX_TEXT) throw new Error(`text is longer than ${MAX_TEXT} characters`);
  const voice = VOICES.includes(q.voice) ? q.voice : 'af_heart';
  const mix = VOICES.includes(q.mix) && q.mix !== voice ? q.mix : '';
  const mixAmt = mix ? Math.min(1, Math.max(0, Number(q.mixAmt) || 0)) : 0;
  const speed = Math.min(2, Math.max(0.5, Number(q.speed) || 1));
  return { text, voice, mix: mixAmt > 0 ? mix : '', mixAmt: mixAmt > 0 ? Math.round(mixAmt * 100) / 100 : 0, speed: Math.round(speed * 100) / 100 };
}
