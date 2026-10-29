// Kestrel kit — puts the head together for one look (batch 2): head skin, face pieces, hair, facial hair, marks and the
// accessory, and says which skin they cover. kestrel.js buildTemplate calls this ONE function in place of building the
// head itself, so everything about faces and hair lives in the face-* / hair* files.
//
//   const face = buildFace({ P, n, colors, lod, parts, add, hatFit });   // → { hide (cover bits to drop), hair, beard }
//
// `n.face` is face-catalog.js faceLook(look). `parts` = the body parts (neck / torso are used to keep long hair, beards
// and neck pieces off the body). `hatFit` (batch 3): when a hat is drawn, pass hairUnderHat(id, hat).underHat here and
// the hair is cropped to sit under it.
import { hexLin, cmul, cmix, clamp } from './kmath.js';
import { COVER } from './geo.js';
import { headPart, faceParts, FACE_COVER } from './face.js';
import { hairParts, hairUnderHat } from './hair.js';
import { beardParts } from './face-beard.js';
import { markParts } from './face-marks.js';
import { accParts } from './face-acc.js';
import { EAR_SHAPES } from './face-catalog.js';
import { bandFit } from './hat-build.js';   // batch 3

/** Hair-like colour grading (the same push as kestrel.js palette's hair: richer, brighter under the review lights). */
function gradeHair(hex) {
  const c = hexLin(hex), L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], s = 1.3;
  return cmul([Math.max(0, L + (c[0] - L) * s) * 1.02, Math.max(0, L + (c[1] - L) * s), Math.max(0, L + (c[2] - L) * s) * 0.96], 1.85);
}

/** The extra colours the face pieces read (second eye colour, eye whites, hair colour 2, beard). Mutates `colors`. */
export function faceColors(colors, F) {
  if (F.eyes.colorR) colors.irisR = hexLin(F.eyes.colorR);
  if (F.eyes.white) colors.white = hexLin(F.eyes.white);
  colors.hair2 = F.hair.color2 ? gradeHair(F.hair.color2) : null;
  colors.beard = F.beard.color ? gradeHair(F.beard.color) : cmul(colors.hair, 1.45);     // a beard reads darker than the same hair (it is in the jaw's shade)
  return colors;
}

export function buildFace({ P, n, colors, lod = 0, parts = {}, add, hatFit = null, worn = null, hat = null }) {
  const F = n.face;
  faceColors(colors, F);
  // batch 3: `hat` = hat-build.js planHat(): the hair is cut to its edge (or not built at all under a closed helm), and
  // the beard, face pieces, ears and accessories it hides are left out; the scalp / face under it is masked
  if (hat && !hatFit && hat.underHat) hatFit = hat.underHat;
  const body = parts.neck && parts.torso ? { neck: parts.neck, torso: parts.torso } : null;
  const ES = EAR_SHAPES[F.ears.id] || {};
  const sideEars = !ES.none && !ES.animal;
  const UH = F.hair.underHat;
  if (!hatFit && UH) hatFit = hairUnderHat(n.hair, UH === true ? (F.hat || {}) : UH).underHat;
  const NONE = { parts: [], paint: [], covers: () => false };
  let hair = hat && hat.hair === 'none' ? { parts: [], scalp: false, covers: () => false, ears: 'free' } : hairParts(P, null, colors, n.hair, { lod, body, underHat: hatFit, earsShown: sideEars, bodyPad: hat?.bodyPad || 0 });
  if (hat?.band && hair.parts.length) {
    // batch 3: a band on the hair — measured on the hair as built, then the hair is rebuilt cinched just inside it
    const fit = bandFit(P, hair.parts, hat.band);
    hat.bandR = fit.r;
    hair = hairParts(P, null, colors, n.hair, { lod, body, earsShown: sideEars, belt: fit.belt });
  }
  const beard = hat && !hat.beard ? NONE : beardParts(P, colors, F.beard, { lod, body });
  if (hat?.beardShell) beard.parts = beard.parts.filter(p => /^(beard|stache|stacheTip)$/.test(p.name));   // batch 3: a coif / hood keeps what lies on the face
  const marks = hat && !hat.face ? NONE : markParts(P, colors, F.marks, { lod });
  const acc = hat && !hat.accOk(F.acc.id) ? NONE : accParts(P, colors, F.acc, { lod, body, worn: worn || n.worn || {} });
  const S = COVER.SCALP, J = FACE_COVER.JAW, LF = FACE_COVER.LOWFACE;
  const mask = (y, th, hp) => (hair.scalp && hair.covers(y, th) ? S : 0) | (beard.covers(hp) ? J : 0) | (acc.covers(hp) ? LF : 0) | (hat ? hat.headMask(y, th, hp) : 0);   // batch 3: + the hat
  add(headPart(P, null, colors, { paint: [...beard.paint, ...marks.paint], mask }), { shade: 0.42 });
  // batch 5: a mannequin (n.mannequin, Thousandvale's gear icons) has no eyes, brows, lashes or teeth — only its ears
  if (!hat || hat.face) for (const fp of faceParts(P, null, colors, null, { lod })) { if (n.mannequin && !/^ear/.test(fp.name)) continue; if (hat && ((hat.ears === 'hide' && /^ear/.test(fp.name)) || (fp.name === 'animalEar' && hat.underHat))) continue; add(fp); }   // batch 3: not inside a closed helm; ears inside a helm / hood
  for (const hp of hair.parts) add(hp);
  for (const bp of beard.parts) add(bp);
  for (const mp of marks.parts) add(mp);
  for (const ap of acc.parts) add(ap);
  // plain ears under hair that covers them are not drawn; pointed / long ones poke through and stay
  const earsHidden = hair.ears === 'over' && sideEars && !ES.tip && !ES.fin;
  const hide = (hair.scalp ? S : 0) | J | LF | FACE_COVER.UNUSED | (earsHidden ? FACE_COVER.EARS : 0) | (hat ? hat.hide : 0);   // batch 3: + the skin under the hat
  return { hide, hair, beard, marks, acc };
}
void clamp; void cmix;
