// Kestrel kit — the "Body" pick for a character editor (masc / fem → avatar.body.form). Pure, no DOM, no Three.js.
//
// Thousandvale's looks have no gender field anywhere (kit/js/from-chibi.js formForChibi guesses one from the beard and
// the hair). This is the ONE pick a game adds so a player chooses instead. It has the same shape as an entry of
// prototypes/thousandvale/js/client/ui/appearance-core.js BODY_PICKS, so wiring it is one line there:
//
//   import { BODY_FORM_PICK } from '../../../../../avatar-3d/kestrel/kit/js/form-pick.js';
//   export const BODY_PICKS = [ BODY_FORM_PICK, { key: 'shape', … }, { key: 'posture', … } ];
//
// cleanCustom() already keeps any BODY_PICKS key whose value is in its `ids`, and applyCustom() lays `custom.body`
// over the avatar's body, so `avatar.body.form` then reaches createKestrelCharacter (and from-chibi.js, where
// `body.form` already wins over the guess). The wiring is left to batch 1 / the lead (batch 2 does not edit
// Thousandvale files).
export const BODY_FORM_PICK = {
  key: 'form', label: 'Body', ids: ['masc', 'fem'],
  names: { masc: 'Broad (masculine)', fem: 'Slender (feminine)' },
};

/** The form a look asks for: 'masc' | 'fem' (anything else → null, so a caller can fall back to its own guess). */
export function formOf(look) {
  const f = look?.body?.form;
  return f === 'masc' || f === 'fem' ? f : null;
}
