// The two Kestrel test characters (the owner's mockup), in the shared avatar JSON every game already passes to Chibi 2.
// Every attempt is judged on these; an attempt's own page should use them too. Pure data, no Three.js.

export const LOOKS = {
  male: {
    body: { form: 'masc', height: 0.5, width: 0.5, skin: '#dba27a' },
    hair: { id: 'spiky', color: '#3a2417' },
    eyes: { id: 'almond', color: '#4a2a16' },
    brows: { id: 'straight', color: '#2b1a10' },
    mouth: { id: 'neutral', color: '#b06a5e' },
    facialHair: { id: 'none' },
    top: { id: 'none' }, bottom: { id: 'none' }, shoes: { id: 'none' }, hat: { id: 'none' },
  },
  female: {
    body: { form: 'fem', height: 0.5, width: 0.5, skin: '#dea67f' },
    hair: { id: 'high_ponytail', color: '#4a2a1a' },
    eyes: { id: 'almond', color: '#5a3220' },
    brows: { id: 'arched', color: '#2e1a10' },
    mouth: { id: 'neutral', color: '#c0716a' },
    facialHair: { id: 'none' },
    top: { id: 'none' }, bottom: { id: 'none' }, shoes: { id: 'none' }, hat: { id: 'none' },
  },
};

/** The one proof-of-slots outfit (CONTRACT.md §4). */
export const OUTFIT = {
  top: { id: 'shirt', color: '#56708c' },
  bottom: { id: 'pants', color: '#3e3a33' },
  shoes: { id: 'boots', color: '#5b3b24' },
};

/** A fresh copy of a test look, with or without the outfit. */
export function lookFor(body = 'male', outfit = false) {
  const base = structuredClone(LOOKS[body] || LOOKS.male);
  return outfit ? { ...base, ...structuredClone(OUTFIT) } : base;
}
