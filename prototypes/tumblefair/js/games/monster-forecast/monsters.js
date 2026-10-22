// Monster Forecast — the monsters, as data. Each has three moves; each move has two TELLS (things the monster does
// first) and one right ANSWER. A tell belongs to only one move of a monster, but the same tell means different moves
// on different monsters, so the cheat sheet on screen matters.
//
// TELLS is the shared vocabulary: every id is an animation the 3D monster in view.js knows, and `say` is the caption
// shown in the early rounds. To add a monster: a row in MONSTERS (colours + which parts it has) using only these tells.
export const ANSWERS = ['dodge', 'block', 'counter'];
export const ANSWER_NAMES = { dodge: 'Dodge', block: 'Block', counter: 'Counter' };
export const ANSWER_HINT = { dodge: 'jump out of the way', block: 'shield up', counter: 'bop it back' };

export const TELLS = {
  crouch: { name: 'Crouches low', say: 'It crouches down low…' },
  armsUp: { name: 'Arms go up', say: 'It throws its arms in the air…' },
  eyesGlow: { name: 'Eyes glow', say: 'Its eyes start to glow…' },
  lick: { name: 'Licks its lips', say: 'It licks its lips…' },
  breathIn: { name: 'Big breath in', say: 'It takes a huuuge breath…' },
  tailSwish: { name: 'Tail swish', say: 'Its tail swishes…' },
  lean: { name: 'Leans back', say: 'It leans way back…' },
  stomp: { name: 'Foot stomp', say: 'It stomps its foot…' },
  wiggle: { name: 'Wiggles', say: 'It wiggles all over…' },
};

export const MONSTERS = [
  { id: 'grumblepuff', name: 'Grumblepuff', blurb: 'a grumpy purple puffball',
    look: { body: '#8d5fd3', belly: '#d9c3ff', accent: '#ffd23f', eye: '#ff9a1f', ears: true, tail: true },
    moves: [
      { id: 'flop', name: 'Belly Flop', answer: 'dodge', tells: ['crouch', 'armsUp'] },
      { id: 'gobble', name: 'Gobble Chomp', answer: 'block', tells: ['eyesGlow', 'lick'] },
      { id: 'huff', name: 'Huffy Roar', answer: 'counter', tells: ['breathIn', 'tailSwish'] },
    ] },
  { id: 'carousel-croc', name: 'Carousel Croc', blurb: 'a painted croc that escaped the merry-go-round',
    look: { body: '#3fae6a', belly: '#f3e6a0', accent: '#ff5f5f', eye: '#ffd23f', spikes: true, tail: true },
    moves: [
      { id: 'spin', name: 'Tail Spin', answer: 'dodge', tells: ['tailSwish', 'lean'] },
      { id: 'snap', name: 'Snappy Snap', answer: 'block', tells: ['lick', 'crouch'] },
      { id: 'yawn', name: 'Lazy Yawn', answer: 'counter', tells: ['armsUp', 'breathIn'] },
    ] },
  { id: 'candyfloss-yeti', name: 'Candyfloss Yeti', blurb: 'a big pink fluff of sugar and bad manners',
    look: { body: '#ff9ccf', belly: '#fff3fa', accent: '#39d0e0', eye: '#39d0e0', horns: true, tail: false },
    moves: [
      { id: 'stomp', name: 'Sugar Stomp', answer: 'dodge', tells: ['stomp', 'breathIn'] },
      { id: 'swipe', name: 'Sticky Swipe', answer: 'block', tells: ['armsUp', 'lean'] },
      { id: 'sneeze', name: 'Sprinkle Sneeze', answer: 'counter', tells: ['eyesGlow', 'wiggle'] },
    ] },
  { id: 'tin-toad', name: 'Tin Toad', blurb: 'a wind-up toad with a squeaky key',
    look: { body: '#3fb7b0', belly: '#dff7f2', accent: '#ff9a1f', eye: '#ff5f5f', key: true, tail: false, bigEyes: true },
    moves: [
      { id: 'hop', name: 'Crushing Hop', answer: 'dodge', tells: ['crouch', 'eyesGlow'] },
      { id: 'lash', name: 'Tongue Lash', answer: 'block', tells: ['lick', 'wiggle'] },
      { id: 'whistle', name: 'Steam Whistle', answer: 'counter', tells: ['breathIn', 'stomp'] },
    ] },
];
