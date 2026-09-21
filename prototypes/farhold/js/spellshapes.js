// Farhold — WHAT SHAPE THE SPELL IS, drawn and said in one table.
//
// Round 17, reported in play:
//
//   "It also appears to show a dot and a slash as the attack style like a melee weapon. Instead,
//    can it show an icon indicating what type of spell is cast by the staff? The one I started
//    with (Arc Staff) appears to do a nova around the player, so maybe instead it should have a
//    circle icon with a dot that says 'Area surrounding the player'."
//
// The root cause is one line in js/weapons.js: `patternGlyphs` walks `profileOf(item).pattern`,
// and a magic weapon has no pattern of its own, so it fell through to `CATEGORY_PATTERNS.magic`
// — `['jab', 'slash']`, whose glyphs are a dot and a slash. The card was not describing the staff
// at all. It was describing the *melee* fallback a staff never uses, because a staff's attack goes
// down `STAFF_SPELLS` instead and nothing joined the two up.
//
// So this is the join, and it is deliberately ONE table:
//
//   * `label` is the caption a player reads.
//   * `svg` is the glyph they see.
//   * `key` is the `shape` field that `STAFF_SPELLS` entries already carry.
//
// Because the glyph and the caption come out of the same row, a staff can never draw a cone and be
// captioned "area surrounding you" — that class of disagreement is only possible when the picture
// and the words live in two places.
//
// NO STYLESHEET, ON PURPOSE. Every glyph is plain SVG with presentation ATTRIBUTES (`stroke`,
// `fill`, `stroke-width`) and `stroke="currentColor"`, so it inherits the colour of whatever text
// it is sitting in and needs no CSS rule anywhere. The house rule bans inline `style=` — these are
// SVG attributes, which is how SVG has always been written, and it means the glyph works in the
// item card, the shop row and a tooltip without any of them having to load anything.
//
// Pure data: no DOM, no Three.js. The node tests read it directly.

/** A 16x16 glyph with no fill, drawn in the current text colour. */
const g = body => `<svg class="spell-glyph" viewBox="0 0 16 16" width="15" height="15" `
  + `aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" `
  + `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

/**
 * THE SHAPE VOCABULARY.
 *
 * `key` matches the `shape` on a `STAFF_SPELLS` row exactly, plus `bolt` for a wand (which has no
 * row because a wand's variety lives in `WAND_BEHAVIOURS` instead), and `beam`/`self` which nothing
 * casts yet and which exist so that adding one is a data change rather than a code change.
 *
 * `label` is the short caption under the glyph. `note` is the longer sentence for the card.
 * `aim` says where the spell is centred, because "in front of you" and "around you" are the two
 * facts a player has to know before they press the button.
 */
export const SPELL_SHAPES = {
  nova: {
    key: 'nova',
    label: 'Area surrounding you',
    note: 'A ring that goes out from where you stand — everything close, all at once, whichever way you are facing.',
    aim: 'self',
    // a circle with a dot at its centre: you, and the ground that goes with you
    svg: g('<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/>'),
  },
  cone: {
    key: 'cone',
    label: 'A cone in front of you',
    note: 'A wedge that opens out from your hands — wide enough to catch a rank, and nothing behind you.',
    aim: 'forward',
    svg: g('<path d="M8 14.2 L2.6 4.2"/><path d="M8 14.2 L13.4 4.2"/><path d="M2.6 4.2 A 11 11 0 0 1 13.4 4.2"/>'),
  },
  wave: {
    key: 'wave',
    label: 'A line straight ahead',
    note: 'It travels out along your aim in a narrow band, through everything standing in the lane.',
    aim: 'forward',
    svg: g('<path d="M8 14 L8 3.4"/><path d="M4.2 6.2 L8 2.6 L11.8 6.2"/><path d="M3.6 11 L12.4 11"/>'),
  },
  lob: {
    key: 'lob',
    label: 'Lobbed — it bursts where it lands',
    note: 'Thrown on an arc at what you are pointing at, and it goes off when it gets there.',
    aim: 'aimed',
    svg: g('<path d="M2 13.6 A 9 9 0 0 1 12.6 6.6"/><circle cx="12.6" cy="6.6" r="2.6"/>'
      + '<path d="M12.6 2.6 L12.6 1.2 M15.6 5.2 L16.8 4.6" stroke-width="1"/>'),
  },
  ground: {
    key: 'ground',
    label: 'A patch of ground where you aim',
    note: 'It stays on the ground where you put it and keeps working on anything that walks through.',
    aim: 'aimed',
    svg: g('<ellipse cx="8" cy="10.4" rx="6" ry="3"/><ellipse cx="8" cy="10.4" rx="2.4" ry="1.2"/>'
      + '<path d="M8 6.6 L8 3.4" stroke-width="1"/>'),
  },
  chain: {
    key: 'chain',
    label: 'It jumps from one to the next',
    note: 'It lands on what you aimed at and then leaps to whatever is standing behind it.',
    aim: 'aimed',
    svg: g('<path d="M2.4 12.6 L6 8.6 L4.6 7.4 L8.6 3.4"/>'
      + '<circle cx="12" cy="5.6" r="1.6" fill="currentColor" stroke="none"/>'
      + '<path d="M8.6 3.4 L10.6 4.6" stroke-width="1"/>'),
  },
  bolt: {
    key: 'bolt',
    label: 'A bolt at what you point at',
    note: 'One shot that flies where you aim it. What it does when it gets there is the wand\'s own trick.',
    aim: 'aimed',
    svg: g('<path d="M2.4 13.6 L11 5"/><path d="M13.8 2.2 L10.4 3.2 L12.8 5.6 Z" fill="currentColor" stroke="none"/>'),
  },
  beam: {
    key: 'beam',
    label: 'A beam along your aim',
    note: 'A sustained line out of your hands that stays on whatever you keep it pointed at.',
    aim: 'forward',
    svg: g('<path d="M2.6 13.4 L13.4 2.6" stroke-width="2.2"/>'
      + '<circle cx="2.6" cy="13.4" r="1.6" fill="currentColor" stroke="none"/>'),
  },
  brand: {
    key: 'brand',
    label: 'Your swing carries it',
    note: 'It is a focus, not a launcher: the element rides the blow, goes through wards rather than armour, and leaves its mark on what you hit.',
    aim: 'melee',
    // a cut line with a spark on it: the element travelling with the swing rather than away from you
    svg: g('<path d="M2.8 13.2 L12 4"/><path d="M11 1.8 L11 4.4 M13.6 4.4 L11 4.4 M13 2.2 L11.4 3.8" stroke-width="1"/>'
      + '<circle cx="7.4" cy="8.6" r="1.5" fill="currentColor" stroke="none"/>'),
  },
  self: {
    key: 'self',
    label: 'On you',
    note: 'It goes on you and nothing else — a ward, a brand, a shield you carry.',
    aim: 'self',
    svg: g('<circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none"/>'
      + '<path d="M8 1.6 A 6.4 6.4 0 0 1 14.4 8" stroke-width="1.2"/>'
      + '<path d="M8 14.4 A 6.4 6.4 0 0 1 1.6 8" stroke-width="1.2"/>'),
  },
};

export const SPELL_SHAPE_KEYS = Object.keys(SPELL_SHAPES);

/**
 * The row for a shape key. Never throws and never returns undefined — a spell written tomorrow with
 * a shape nobody has drawn yet gets the bolt, which is the honest default for "something comes out
 * and goes at the thing you are looking at".
 */
export function shapeRow(key) {
  return SPELL_SHAPES[key] || SPELL_SHAPES.bolt;
}
