// Mystic Fortunes: the fortune templates and the word cards (pure data + two helpers; the sim, the view and the CPU
// all read it). Four kinds of blank: `do` (something you do TO someone: "juggle", "knit a scarf for"), `thing` (a
// someone or something, with its article), `how` (the way it happens) and `place`. Every `do` card must read both ways:
// "you will ___ a goose" and "a goose will ___ you". Each card may carry tags Mystic Mabel can be in the mood for:
//   f food · a animals · y fancy · m messy · s music
// All original, all family friendly.
export const MOODS = Object.freeze({ f: 'food', a: 'animals', y: 'anything fancy', m: 'anything messy', s: 'music' });
export const MOOD_IDS = Object.freeze(Object.keys(MOODS));
export const KIND_NAMES = Object.freeze({ do: 'do what?', thing: 'who / what?', how: 'how?', place: 'where?' });

const card = s => { const [text, tags = ''] = s.split('|'); return Object.freeze({ text, tags: tags.split('') }); };

export const CARDS = Object.freeze({
  do: [
    'juggle', 'tickle', 'serenade|s', 'high-five', 'out-dance|s', 'adopt|a', 'befriend|a', 'race', 'polish|y', 'knit a scarf for',
    'bake a pie for|f', 'sing a lullaby to|s', 'curtsy to|y', 'throw custard at|fm', 'share a milkshake with|f', 'waltz with|sy',
    'give a piggyback to', 'paint a portrait of|y', 'write a love song for|s', 'teach yodelling to|s', 'arm-wrestle', 'sneeze on|m',
    'spoon-feed|fm', 'accidentally knight|y', 'brush the hair of|y', 'ride|a', 'squirt ketchup on|fm', 'hide behind', 'tuck in',
    'chase|a', 'do a duet with|s', 'play hopscotch with', 'carry', 'trade sandwiches with|f', 'build a sandcastle for|m',
    'win a staring contest against', 'tango with|sy', 'give a bubble bath to|m', 'photobomb', 'teach juggling to', 'feed grapes to|fy',
    'groom like a pony|a', 'splash|m', 'bow deeply to|y', 'drum on the head of|s',
  ].map(card),
  thing: [
    'a confused goose|a', 'a very polite llama|ay', "the mayor's pet hamster|a", 'a giant cupcake|f', 'a soggy sandwich|fm',
    'a tuba-playing bear|as', 'a duke made of jelly|fy', 'a runaway carousel horse|a', 'a grumpy garden gnome', 'a singing pumpkin|s',
    'a talking candyfloss cloud|f', 'a royal goat in a crown|ay', 'a mud-covered prince|my', 'a tap-dancing octopus|as',
    'three ducks in a trench coat|a', 'a sleepy walrus|a', 'a shy dragon|a', 'a wobbly jelly tower|fm', 'a bucket of spaghetti|fm',
    'a dancing teapot|s', 'an extremely fancy pigeon|ay', 'a lost clown', 'a marching band of mice|as', 'a ghostly accordion|s',
    'your future self', 'a baby elephant on roller skates|a', 'a pirate who is scared of water', 'a hot dog in a top hat|fy',
    'a squeaky rubber chicken|a', 'a sneezing scarecrow|m', 'a heap of mashed potato|fm', "the world's smallest knight|y",
    'a cheese wheel with feelings|f', 'a juggling squirrel|a', 'a pony with a moustache|a', 'a disco bunny|as', 'an opera-singing cow|as',
    'a melting ice-cream king|fmy', 'a bouncy castle', 'a crab in a tiara|ay', 'a nervous lighthouse keeper', 'a troll who loves knitting',
    'a balloon shaped like your aunt', 'a banjo with a cold|ms', 'a duchess covered in gravy|fmy',
  ].map(card),
  how: [
    'while wearing soup as a hat|fm', 'in slow motion', 'on a unicycle', 'while humming a sea shanty|s', 'in your pyjamas', 'blindfolded',
    'with a mouth full of popcorn|f', 'at the speed of a snail|a', 'while riding a llama|a', 'in a ball gown made of pancakes|fy',
    'while covered in glitter|my', 'in total silence', 'while juggling sausages|f', 'with a kazoo solo|s', 'backwards',
    'with a monocle and a cape|y', 'while standing in a bath of custard|fm', 'while a goat watches|a', 'to the beat of a drum|s',
    'on stilts', 'while sneezing every five seconds|m', 'with your shoes on your hands', 'at midnight, by candlelight|y',
    'while singing opera|sy', 'in a giant hamster ball|a', 'with ketchup on your nose|fm', 'in a tiara and wellies|y',
    'while doing the robot|s', 'for exactly nine seconds', 'without blinking', 'while hopping on one foot', 'wrapped in bubble wrap',
    'in a suit of armour|y', 'while eating a whole pie|f', 'covered in mud|m', 'while a brass band plays|s', 'with a parrot on your head|a',
    'up to your knees in jelly|fm', 'very, very politely|y', 'while everyone claps', 'with tremendous dignity|y', 'upside down',
    'while a choir of frogs sings|as', 'with a fish in each pocket|am',
  ].map(card),
  place: [
    'at the top of the Ferris wheel', 'inside a giant pie|f', 'on the bumper cars', 'in the hall of mirrors', 'behind the candyfloss stand|f',
    'in the duck pond|am', 'on the carousel|s', 'at the royal banquet|fy', 'in a bouncy castle', 'under the big top', 'in a muddy pig pen|am',
    'on a raft of waffles|f', 'at the village talent show|s', "in the queen's rose garden|y", 'inside a tuba|s', 'at the bottom of a ball pit',
    'on top of a giant pumpkin|f', 'at the dentist', 'in the school canteen|f', 'in a hot-air balloon', 'on a very wobbly bridge',
    "at grandma's tea party|fy", 'in a tree house', 'at the sheep show|a', 'in the splash zone|m', 'on a tightrope', 'at the bakery at dawn|f',
    'inside a snow globe', 'at the bottom of the garden', 'in the middle of a marching band|s', 'at the petting zoo|a',
    'in a floating bathtub|m', 'in a castle made of cheese|fy', 'in the lost-and-found tent', "at the world's longest picnic|f",
    'on stage at the opera|sy', 'in a field of sneezing flowers|m', 'at the duck races|a', 'in a spaghetti swamp|fm',
    'on the moon (just briefly)', 'in a lift full of goats|a', 'at the fanciest car wash|y', 'in a mud-wrestling ring|m',
    'at a goose concert|as',
  ].map(card),
});
export const KINDS = Object.freeze(Object.keys(CARDS));

/** Fortune templates: plain text with {kind} blanks (2 or 3 each, never the same kind twice). */
export const TEMPLATES = Object.freeze([
  'Tomorrow you will {do} {thing} {how}.',
  'Beware! {thing} will {do} you {place}.',
  'Great luck is coming: you will {do} {thing} {place}.',
  'Next week, {thing} will {do} you {how}.',
  'You will meet {thing} {place}. Do not panic.',
  'Your true destiny: to {do} {thing} {how}.',
  'One day you will be famous for being seen {place} {how}.',
  'I see {thing} in your future. It will {do} you {how}.',
  'Before the year is out, you will {do} {thing}. It will happen {place}.',
  'A secret admirer is {thing}. They will {do} you {place}.',
  'On your birthday you will {do} {thing} {how}.',
  'Watch out for {thing} {place}. It wants to {do} you.',
  'Your lucky charm is {thing}. Keep it close, {how}.',
  'In ten years you will {do} {thing} {place}.',
  'Tonight you will dream that you {do} {thing} {how}.',
  'The spirits whisper: {thing} will soon {do} you, {how}.',
]);

/** The blanks of a template in order: ['thing', 'do', 'place']. */
export const blanksOf = t => [...TEMPLATES[t].matchAll(/\{(\w+)\}/g)].map(m => m[1]);

/**
 * A template cut into pieces: [{ text }, { blank: 0, kind, card, cap }, …]. `picks` are card indices per blank (-1 =
 * empty). `cap` is true when the blank opens a sentence (its first letter should be a capital).
 */
export function pieces(t, picks = []) {
  const out = [], re = /\{(\w+)\}/g, s = TEMPLATES[t];
  let last = 0, m, b = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    const before = s.slice(0, m.index).trimEnd(), cap = before === '' || /[.!?:]$/.test(before) && !before.endsWith(':');
    const k = m[1], c = picks[b] ?? -1;
    out.push({ blank: b, kind: k, card: c, cap, text: c >= 0 ? CARDS[k][c].text : null });
    last = m.index + m[0].length; b++;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}
/** A finished fortune as one plain sentence ("___" for an empty blank). */
export function sentence(t, picks) {
  return pieces(t, picks).map(p => p.blank == null ? p.text : p.text == null ? '___' : p.cap ? p.text[0].toUpperCase() + p.text.slice(1) : p.text).join('');
}
/** How many of the picked cards suit Mabel's mood. */
export function moodCount(t, picks, mood) {
  const ks = blanksOf(t);
  return ks.reduce((n, k, i) => n + (picks[i] >= 0 && CARDS[k][picks[i]].tags.includes(mood) ? 1 : 0), 0);
}
