// Alibi Assembly's script: the crimes the Inspector is looking into and the pieces an alibi is built from. Every slot
// has ten options; a match shows four of them per slot while the group builds, and the Inspector's questions use those
// same four (the details the players actually saw) as the wrong answers. `yn` is the slot as a clause for the
// "So you were … and …?" yes/no questions: {x} is replaced by the option.
export const CRIMES = [
  'Who ate the prize pie?', 'Who let the goats out?', "Who painted the mayor's horse blue?", 'Who swapped the jam for glue?',
  'Who stole the giant pumpkin?', 'Who popped every balloon?', 'Who unplugged the Ferris wheel?', 'Who taught the parrot rude words?',
  'Who hid the trophy in the duck pond?', 'Who ate all the judging samples?', 'Who rang the fire bell at midnight?', 'Who knitted a sweater for the scarecrow?',
  'Who glued the bumper cars together?', 'Who replaced the brass band with kazoos?', 'Who fed the prize cow a whole cake?', 'Who took the bounce out of the bouncy castle?',
];
export const SLOTS = [
  { id: 'where', label: 'Where', ask: 'Where were you?', yn: 'you were at {x}',
    opts: ['the Ferris wheel', 'the duck pond', 'the pie tent', 'the bumper cars', 'the hall of mirrors', 'the goat pen', 'the bandstand', 'the haunted hayride', 'the lost-and-found booth', 'the giant pumpkin stand'] },
  { id: 'eating', label: 'Eating', ask: 'What were you eating?', yn: 'you were eating {x}',
    opts: ['a corn dog', 'candy floss', 'a pickled egg', 'a turnip on a stick', 'fried butter', 'three toffee apples', 'a cheese wheel', 'a jar of jam', 'a bucket of popcorn', 'a suspicious sandwich'] },
  { id: 'saw', label: 'Who saw you', ask: 'Who saw you there?', yn: '{x} saw you',
    opts: ['the goat judge', 'Grandma Pip', 'the ticket clown', 'a mime', 'the mayor', 'a sleepy guard', 'the fortune teller', 'a lost toddler', 'the pie baker', 'a very tall stranger'] },
  { id: 'time', label: 'When', ask: 'What time was it?', yn: 'it was {x}',
    opts: ['sunrise', 'half past nine', 'noon', 'teatime', 'three o\'clock', 'sunset', 'just before the fireworks', 'midnight', 'four on the dot', 'quarter to six'] },
  { id: 'wearing', label: 'Wearing', ask: 'What were you wearing?', yn: 'you were wearing {x}',
    opts: ['a bear costume', 'a borrowed tuxedo', 'swim goggles', 'a long cape', 'a paper crown', 'pyjamas', 'two hats at once', 'a fake moustache', 'roller skates', 'a yellow raincoat'] },
  { id: 'doing', label: 'Doing', ask: 'What were you doing?', yn: 'you were {x}',
    opts: ['judging the turnips', 'riding a goose', 'winning a staring contest', 'fixing the carousel', 'juggling eggs', 'practising the tuba', 'hiding from a duck', 'counting the ducks', 'napping in a wheelbarrow', 'looking for a lost shoe'] },
  { id: 'carrying', label: 'Carrying', ask: 'What were you carrying?', yn: 'you were carrying {x}',
    opts: ['a rubber chicken', 'a giant teddy', 'a ladder', 'a bucket of eels', 'a trumpet', 'a map of the fair', 'a single sock', 'an umbrella', 'a goldfish in a bag', 'a jar of buttons'] },
];
