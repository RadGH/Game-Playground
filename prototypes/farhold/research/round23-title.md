# Round 23, item 3: the title, character and world screens

> "Redesign the main menu, character selector, world selector as the new extensive spell
> descriptions and other things have caused the layout to display poorly and I think it can be done
> better. The style can be about the same, the structure and content display is what could be
> improved. Update the character editor to show the 3d model instead of the 2d avatar."

The colours, fonts and buttons are unchanged. The flow is also unchanged (menu, then character,
then world, then Start) and every id is still there. What changed is where things sit and how much
text is on screen at once. Screenshots are in `research/round23-title/`, as `before-<width>-<screen>.jpg`
and `after-<width>-<screen>.jpg`, at 1280 x 800, 390 x 844 (a phone) and 1920 x 1080.

## What was wrong

Measured on the old screens before any change:

| Screen | Problem |
|---|---|
| Character step, 1280 x 800 | The page was **1,779 px tall**. The left half held three controls and then nothing. The right column was 340 px wide and held the figure, the kit line, and all six skills. Each skill's generated description (round 21, around 40 words) was squeezed into a **130 px sub-column**, so every skill ran to 8–10 lines. |
| Character step, 390 wide | The page was **460 px wide** on a 390 px phone, so it scrolled sideways. The class dropdown and the "Use the class look" button pushed the row wider than the screen. |
| Custom class card | The "Open the builder" button sat under six bullet rows and a refusal sentence, below the fold at 1280 x 800. |
| Class builder, Spells tab | All 40 spells were listed as full-sentence rows in one column: the 11 you could pick, then **29 greyed-out ones**. The slot list scrolled away as you read. Every slot row said its level three times ("Level 3 · Level 3 spell slot · Locked until level 3"). |
| Class builder, Loadout tab | 18 loadouts in a single column, three screens long. |
| World step | Labels were right-aligned in a 118 px gutter, with the hint text indented 126 px under each control. The map column was half empty. The page ran to 941 px at 1280 x 800 and 1,798 px on a phone. |
| Main menu | The controls were one paragraph, with the keys in bold in the middle of the sentence. |
| Appearance editor | Showed the 2D paper doll. On a phone the four buttons squeezed "Back to the class look" into a 70 px column and pushed the panel off the right edge. |
| **Bug: Escape in the builder** | Escape closed the character step *underneath* the builder and went back to the menu, leaving the builder open over menu buttons it was covering. The title's Escape listener and the builder's are both on the capture phase, and the builder's was added later (it is made lazily, the first time Custom is picked), so the title's always ran first. |
| **Wrong picture** | The 2D figure drew the class's *illustrated* weapon from `class-looks.json`, not the weapon the class actually starts with. For example, the warrior's picture held a greataxe, but `classes.json` starts the warrior with a longsword. |

## The new structure

`js/newgame.js` now sets `#boot[data-screen]` to whichever screen is showing, and `title.css` (new,
linked after `style.css`) lays each one out from that attribute.

- **Main menu.** Same column of buttons. The blurb is its own short paragraph, and the controls are
  a grid of key caps with a label beside each.
- **Both steps fill the window.** The big title shrinks to one line and the tagline hides. A step
  bar ("1 Character · 2 World · 3 Begin") sits beside the heading. The footer keeps Back on the
  left and Next/Start on the right, with a one-line summary between them ("Wren · Stormcaller ·
  seed 1 · Small planet").
- **Character step, three columns:**
  1. **Who.** Name and Class (label above each control, full width), then a **class list**: all 31
     entries with the role under each name and a "companion" mark. It is a readable version of the
     dropdown. The `<select>` stays the one the form is read from; a click on the list sets it and
     fires its `change` event.
  2. **The 3D figure,** with "Customize appearance…" and "Use the class look" under it.
  3. **What the class does.** Name and role, then the kit as chips ("Starts with a wand", "Cloth
     armour", "Main attribute INT"), then the companion line, then one card per skill. Each card
     shows the name and unlock level, then **fact chips** from `js/spellcard.js` (kind, element,
     damage, the status it applies, mana, cooldown), then the description **clamped to two lines**.
     Click or Enter opens the whole sentence in place, and hovering shows it in the shared tooltip.
     The class's `hook` line is left off on purpose: it is Emberveil's flavour text ("Precise
     Strike never misses") and describes skills Farhold doesn't have, which WORDING.md rules out.
- **World step, two columns:** the knobs in two groups ("The planet", "Levels and zones"), each a
  labelled field with its hint underneath. "Levels per zone" and "Enemy density" share a row. The
  map sits on the right with the planet name, its facts, and the "How the levels are laid out" note
  (moved over from the knob column, where it made the column the longest thing on screen).
- **Scrolling.** At 1000 px wide and 600 px tall or more, the steps fit the window and the page
  itself never scrolls. Each column scrolls on its own if it has to: the class list, the class
  card, the knob list. Under that size everything stacks into one column (figure or map first),
  the class list hides (the dropdown does the same job in a tenth of the height), and only the page
  scrolls. There is never a scroll box inside a scrolling page.
- **Class builder** (`js/classbuild-ui.js` + `classbuild.css`):
  - Loadouts and elements are grids of cards.
  - A spell card uses the same chips and two-line clamp. The selected card shows the full text,
    and the full text is also in the tooltip.
  - The spells for later slots are folded into a `<details>` ("Spells for later slots — 29 more
    open above level 1").
  - The six slots stay pinned on the left while the list scrolls. Each slot row's right-hand tag is
    just its state ("Choose now", "Locked", "Click to change").
  - On the title screen a fourth column holds the character in 3D, so picking "Bow and Quiver" puts
    a bow in its hands.
  - The in-game spell chooser (`inGame: true`, opened from the character sheet) gets the same card
    layout but no figure column: main.js passes no `figure`, so nothing changes there.
- **Custom class card:** the same layout as a preset class's card. The build shows as chips, the
  refusal or "Ready." comes next, then the button, then the six slots as a short ladder.
- **Escape:** the title's handler now steps aside while the builder is open (`if (builder?.open)
  return;`), so the builder's own listener closes just the builder.

## The 3D preview

Two new modules:

- **`js/titlelook.js` — what the character is wearing.** It repeats the steps `begin()` and
  `applyGearLook()` in main.js take for a new character, in the same order: the starter weapon
  (generated and attuned), the starting armour, the torch every character carries, and for a custom
  class the opening kit's second weapon, off-hand armour and element. It then writes `held`,
  `offhand` and the armour parts with the same `heldLookFor` / `offhandLookFor` / `rpg.gearLook`
  main.js uses. Three guards make this safe:
  - It runs on a **private `Rpg` over `structuredClone(items)`**. `new Rpg()` edits the shared
    affix tables in place, and the preview must not be the first thing to touch the game's data.
    It also has its own random numbers, so looking at the title never shifts what the run rolls.
  - A custom build is **copied** before `applyOpeningKit` sees it. That function stamps
    `build.granted = true`, and doing that to the real build would make the run's own call refuse
    and start the character with an empty off hand. The copy also has the crate switched off, since
    the preview has no use for three rolled items.
  - The kit is cached per class (per loadout for a custom class), so changing the face doesn't
    re-roll the sword.
- **`js/figure3d.js` — the view.** The body is built with `makeActor` from js/actors.js, the same
  call main.js makes for the player (Chibi 2 with the combat clips), so it is the same model and the
  same parts. It draws on **its own small WebGLRenderer** with a hemisphere light, a key light, a
  cyan rim light and a soft disc to stand on. The camera is framed from the body's height, with
  headroom for horns and hats.
  - **Motion.** The figure plays its idle animation and sways ±50° about every twelve seconds, so
    the face stays mostly in view while the weapon and back still come round. Dragging turns it
    freely.
  - **Only draws when visible.** The loop sleeps whenever its box is hidden (another screen, the
    world step, a background tab).
  - **One canvas, lent around.** The appearance editor and the class builder don't make their own
    views. `attach(box)` moves the one canvas into them while they're open and `restore()` moves it
    back, so the whole title uses **one WebGL context**. The appearance editor falls back to the
    old SVG if it is called without a figure.
  - **Disposed before the game starts.** `finish()` in newgame.js (the single exit for Start,
    Continue and Load) calls `dispose()` before `begin()` makes the game's renderer. That disposes
    the body, the disc and the renderer, calls `forceContextLoss()` so the browser gets the context
    back at once, and removes the canvas.
  - **Test hooks.** The canvas carries `data-rendered` (frames drawn) and `data-look` (a short hash
    of the avatar last put on). `canvas.__figure.sample()` renders one frame and counts the
    non-transparent pixels in the same call, because a WebGL canvas reads back blank outside the
    frame it drew.

**Known difference:** a *preset* caster's staff topper can differ between the title and the world.
`attuneWeapon` picks the element from a hash of the generated item's id, and the run generates its
own item. A custom class names its element, so that one always matches.

## Tests

- `tests/round23-title.spec.js` (new, 8 tests, all pass):
  - no horizontal spill at 390, 1280 and 1920 on the menu, the character step (preset and custom)
    and the world step; at 1280 and 1920 the page itself does not scroll;
  - the figure draws non-blank pixels, and changes when the class changes (through the class list,
    which also moves the dropdown);
  - the editor and the builder borrow the one canvas and give it back; a loadout change re-dresses
    the figure;
  - Escape in the builder leaves you on the character step;
  - a skill's chips include mana and cooldown, and a click opens its sentence;
  - **Start from a preset class and from a custom class** (built the way a player does it: builder,
    Spells, pick, Done) both reach the world. The preview canvas is gone afterwards, the game has
    its own canvas, and the custom build's opening kit was granted by the run, not spent by the
    preview.
- `tests/round23-titlelook.test.js` (new, node, 5 tests, all pass): every preset class holds its
  own starter weapon; the torch is in the free hand; the face passes through and `items` is
  untouched; the custom build stays un-granted; Blade and Board shows a shield and Knife Pair a
  second dagger.
- `tests/round16-title.spec.js`: the figure checks read `canvas` + `data-look` instead of `svg` +
  innerHTML. All 7 pass.
- Also run and passing: `round17-class.spec.js` (except the one below), `round20-unbinder.spec.js`
  (which includes the in-game spell chooser), `settings.spec.js`, and the save/continue and title
  tests in `round3`, `round4`, `round10` and `round17-ui`. The full node suite passes (1,209), and
  `tools/preload-modules.py --check` is up to date.
- **Failing before I started, and not touched:** `round17-class.spec.js` › "F opens the company on
  the sheet…" still expects a "Spells" tab on the Followers screen, which commit f528653 removed.
  The test needs `'Spells'` dropped from its tab list.

## Noticed, not changed

- **A second one-handed weapon is invisible in the hand.** `offhandLookFor` (js/rpg.js) only maps
  shields, bucklers, quivers and daggers. Two Blades' second sword draws as `none` in the game, and
  the torch moves to the belt because the off-hand slot is occupied. The preview shows exactly what
  the game shows. Fixing it needs an off-hand sword part in the Chibi 2 gear, which is shared with
  Emberveil.
- **The warrior has `shield: true` and no shield in its `startingArmour`,** so it starts holding
  the torch. The card now says "May carry a shield" rather than implying one comes with the class.
