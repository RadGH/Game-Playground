# Thousandvale — interface gallery, phone proposal, controller (play-test 5: T26, T27)

Stream G. Read this before touching `ui-gallery.html`, `js/client/gallery/`, `js/client/input/`, `css/layout-phone.css`.

**The gallery:** `ui-gallery.html` — every screen and menu, in desktop, phone and controller frames.
Dev link: `http://<LAN ip>:8401/prototypes/thousandvale/ui-gallery.html` (the playground's static dev server; no game
server needed). A scene has a link of its own: `ui-gallery.html#scene=perks&device=phone-l&layout=proposed`.
On a phone the same link opens the scene full-screen with a "Scenes" picker.

---

## 1. How the mockups stay tied to the game

The mockups are not drawings and not copies. **The frame runs the game's own interface code.**

| Piece | Where it comes from |
|---|---|
| Markup of the HUD and the title screen | `index.html`, fetched at run time by `js/client/gallery/frame-boot.js` (the frame page has no game markup of its own) |
| Stylesheets | `index.html`'s own `<link rel="stylesheet">` list, in its order |
| Every window, the HUD, chat, bag, map, perk forest… | the same `create*()` calls `main.js` makes, in `js/client/gallery/stage.js`, imported from the same files |
| The data on screen | `js/net/client.js` (the real one) on a fake socket that replays a **recording of a real server** (`js/client/gallery/fixtures/session.json`) |
| Keys, controller buttons, touch controls | `js/client/input/` — the same layer the game installs |

What is a stand-in: the 3D world (a still picture behind the HUD), the three objects `main.js` owns that only make sense
with a 3D scene (`actors`, `objects`, `controls` — small tables in `stage.js`), and the title screen's chip-filling
code (it lives inside `main.js`; `gallery/title-lite.js` is a 60-line copy of that glue — the one known duplication).

**The tests that keep it true** (`tests/G/`):

- `gallery.test.js` (node, no browser) — every file under `js/client/ui/` is in at least one scene or on the explicit
  `NO_SCREEN` list with a reason; every `create*` / `install*` that `main.js` imports from an interface file is also
  called by `stage.js`; every moment a scene plays exists in the fixtures; the frame page contains none of the game's
  markup; nothing private is in the fixtures.
- `bindings.test.js` (node) — the binding table (section 4).
- `gallery.spec.js` (Playwright) — opens every scene in every frame and fails on a console error, a scene that did not
  reach its state, text reading `undefined` / `[object Object]` / `NaN` / a long float, and — in the proposed phone
  layout — any control smaller than 44 × 44 px or outside the safe area. For today's layout on a phone it **reports**
  the same count instead of failing. A picture of every scene goes to `tests/G/shots/<frame>/<scene>.png`, so an
  interface change shows up in review as a changed mockup.
- `gamepad.spec.js` (Playwright) — the controller in the real game, with a faked `navigator.getGamepads`.

So: **change a window in the game and the gallery changes with it; add a window and a test tells you to give it a scene.**

### Adding a scene
One entry in `js/client/gallery/scenes.js`:

```js
{ id: 'bank', group: 'Windows', title: 'Bank', modules: ['js/client/ui/bank.js'], expect: '#panel-bank:not([hidden])',
  steps: [['call', 'tvui5.bank']],                       // or ['panel', 'bank'], ['play', '<moment>'], ['click', sel] …
  notes: { all: 'What it is.', phone: 'What the phone layout does and why.', pad: 'How a controller drives it.' } }
```

The verbs (`panel`, `hub`, `play`, `reply`, `call`, `click`, `hover`, `target`, `dead`, `vitals`, `wheel`, `ring`,
`cursor`, `osk`, `holdSheet`, `touch`, …) are documented where they are defined, in `stage.js`. If the window is created
by something new in `main.js`, add the same `create…()` call to `stage.js` (the node test fails until you do).

### Fixtures
- `fixtures/session.json` — recorded. `tools/record-ui-fixtures.mjs` starts a throw-away real server, plays a level-24
  cleric (bag, gear, perks, talents, a party of four real clients, a guild, mail, quests, shops, a trade, the map, the
  sheet) with every WebSocket frame logged, and cuts the tape into: the handshake, the boot stream (what arrives as you
  stand in the world), the answer to each request (`"shop:open"`, `"map:get"`, `"sheet"`…), and named steps.
  Re-record after a protocol change: `cd ~/claude/playground && flock /tmp/claude-1000/farhold-pw.lock node prototypes/thousandvale/tools/record-ui-fixtures.mjs`
  (`--rebuild` re-cuts the last tape without a browser).
- `fixtures/moments.json` — kept by hand, for what no server can be made to do on demand (a bite, a crate, a revive
  offer, an event at stage 3 of 4, an admin's report list). Same message shapes as the protocol; the same ones
  `tests/D/pt5.spec.js` plays.
- `fixtures/world.jpg`, `title.jpg` — stills of the 3D world, taken by the recorder.
- The frame's clock starts at the moment of the recording, so "starts in 2 minutes" still reads that way next month;
  its `localStorage` is in memory, so the gallery can never touch the real game's saved settings on the same address.

---

## 2. The frames

| Frame | Size (CSS px) | What it shows |
|---|---|---|
| Desktop | 1920 × 1080 | the game as it is |
| Laptop | 1366 × 768 | the game as it is |
| Phone, on its side | 852 × 393, safe area left/right 59, bottom 21 | **Today**: the same code on that screen. **Proposed**: the phone layout |
| Phone, upright | 393 × 852, safe area top 59, bottom 34 | same switch |
| Controller | 1366 × 768 | the desktop interface with the gamepad layer on (hints as button glyphs, the focus ring, the wheel) |

The iPhone 15 Pro's Dynamic Island and home bar are drawn over the phone frames; "Outline the safe area" shows the
rectangle everything must stay inside. The phone's insets are CSS variables (`--safe-top` …) that default to the real
`env(safe-area-inset-*)`, so the same stylesheet is right on a real phone.

---

## 3. The phone layout (a proposal — OFF in the game)

Real code, not a mock: `css/layout-phone.css` + `js/client/input/touch.js`. It does nothing unless
`<html data-layout="phone">` is set, and the only place the game may set it is `js/client/input/layout.js`:

```js
export const PHONE_LAYOUT_ENABLED = false;      // <- the one switch
```

(For trying it in the real game on the LAN before switching it on for everyone: `?layout=phone` on the dev pages.)

Design, in one paragraph: **the left thumb moves, the right thumb fights, everything else is one tap away and never under
a thumb by accident.** A stick appears wherever the left thumb lands. Attack sits in the bottom-right corner with skills
1–4 on an arc one thumb-length away and a second arc (skills 5–6, Belt, Target, Ally, Jump) beyond it — these are the
game's own action-bar buttons moved by CSS, not new ones. Party frames are 44 px rows under your own frame, so a healer
picks a friend with one thumb. Windows become full-screen sheets with one tab bar (bottom when upright, a rail on the
left when on its side, where height is scarce). Nothing needs a hover: hold anything that has a card and it opens as a
sheet. Every control is at least 44 × 44 px and nothing sits under the island or the home bar — both checked by test.
The reasoning for each screen is in that scene's notes in the gallery.

**Variant B** (switch above the frame, on its side only): a flat 2 × 4 grid of skills and a stick that stays put.

### How a proposal graduates into the game
1. The owner picks the variant in the gallery and gives notes; change `css/layout-phone.css` / `touch.js` until the
   scenes look right (the spec keeps the 44 px and safe-area rules honest).
2. Add `css/input.css` and `css/layout-phone.css` to `index.html` (they are no-ops without the attribute).
3. Set `PHONE_LAYOUT_ENABLED = true` in `js/client/input/layout.js`. `applyLayout()` then sets the attribute on
   phone-sized touch screens; `input/index.js` loads `touch.js`.
4. Play it on a real phone against the dev server (3D performance on a phone is a separate question — see open
   question 6), then publish.
5. Delete the "Today" frame's switch if you no longer want to compare.

A later proposal (a tablet layout, a redesign of one window) works the same way: real CSS/JS behind an attribute only
the gallery sets, a switch in the frame, scenes with notes, then one flag.

---

## 4. One binding table

`js/client/input/bindings.js` — a list of **actions**; each row carries its keyboard key, its gamepad button and its
touch control. Everything that shows or reads a key comes from it:

| Reader | How |
|---|---|
| The game's handlers | they listen for the **default key codes**; `input/keyboard.js` (re-bound keys), `gamepad.js` and `touch.js` turn whatever was pressed into that default key event (`input/emit.js`), so no handler had to change and none can be missed |
| Help window, Settings > Key bindings | `input/bindings-ui.js` (`social-core.js` `SHORTCUTS` / `PANEL_KEYS` are now built from the table too) |
| On-screen hints (`<kbd>E</kbd>`, the action bar's key letters) | `input/hints.js` re-labels them for the device used last: your own key, a button glyph, or nothing on touch |
| The gallery's "Controls" scene, this document | generated: `ui-gallery.html#scene=controls` |

`tests/G/bindings.test.js` fails if a key is hard-coded in `main.js` / `controls.js` / `hotbar.js` / `angling.js`
without being in the table, if two actions land on one chord, or if an action has no pad button or touch control.

**Keys can now be changed** (Settings > Key bindings): click a key, press the new one; a key already in use swaps
places. Saved in the browser (`tv.keys`).

### Controller (live in the game on desktop)
Standard-mapping pads (Xbox, PlayStation, most others). Glyphs are chosen from the pad's id and can be forced in
Settings > Key bindings > Controller. Hints flip between keys and glyphs by whichever device you touched last.

| | |
|---|---|
| Left stick / right stick | move / camera (click the left stick: sprint; click the right: zoom steps) |
| X · Y · B · RB · RT | strike · skills 1 · 2 · 3 · 4 |
| hold LT + Y · B | skills 5 · 6 |
| hold LT + D-pad | the four potion / food slots |
| hold LT + X · A · RB | mount · cast a line · make camp |
| D-pad right / down / up / left | next enemy / next party member / previous / clear target |
| A | what the screen is asking for: rise > hook a bite > use / talk / loot > jump |
| hold LB | the quick wheel: every window (RB while open: mount, fish, camp, map, help) |
| View / Menu | map / pause menu |
| In a window | D-pad or stick moves a focus ring, A presses, B backs out, X = the other click, Y = its card, LB / RB = tabs, right stick scrolls; on the map and the perk forest the ring becomes a pointer you steer (triggers zoom, right stick pans) |
| Text | pressing A on a text box opens an on-screen keyboard |

**Reaching the game with a pad:** browsers only give a page its gamepads on a secure address. On the LAN use the
playground's https dev port — `https://<LAN ip>:8441/prototypes/thousandvale/` serves the page (accept the self-signed
certificate once; `tools/README-servers.md`). The game server itself is on plain `ws://…:8491`, which an https page may
not open, so for a full session with a pad use the public https link (the tunnel), or open
`http://localhost:8491/prototypes/thousandvale/` in a browser on the machine that runs the server (localhost counts as
secure). The gallery's Controller frame works on any address for looking; a real pad drives it on https / localhost.

---

## 5. Open questions for the owner (with a recommendation each)

1. **Arcs or grid for the fight buttons (variant A / B)?** Recommend **A (arcs)**: every button is within one thumb
   sweep of the corner; B shows the same buttons in rows but the far column is a stretch on a 6.1-inch phone.
2. **Landscape only, or upright too, for play?** Recommend **landscape for play, upright fully supported for menus**
   (it is built that way: upright play works but the world is a narrow strip between the two thumbs).
3. **Tap an item = card with buttons, or tap = wear at once (as on desktop)?** Recommend **the card** (built): a mis-tap
   in a 58 px grid should not swap your weapon mid-fight. Costs one extra tap per item.
4. **Potions: behind the Belt (tap = slot 1, hold = wheel of four), or two always-visible potion buttons?**
   Recommend **the Belt** (built in A; B shows two): twelve controls on the fight screen is already the ceiling.
5. **Controller layout: X strikes and A is contextual (jump / use / hook / rise).** The alternative is A = strike
   (console action-game habit) with jump on a trigger. Recommend **as built** — one button that always means "do the
   thing the screen is asking for" is what makes fishing, looting and talking work without a second prompt key.
6. **3D performance on a phone is not part of this proposal.** The layout is ready; whether an iPhone 15 Pro holds a
   steady frame rate in a town is unmeasured. Recommend a separate half-day test on the real phone (quality "low",
   `tv.perf()`), before switching the layout on.
7. **Should the gallery be published on the public site (GitHub Pages) with the game?** It carries a recorded guest
   character and no secrets (a test checks). Recommend **yes**, linked from the playground card, once you have reviewed it.
8. **Key re-binding is new and touches input for everyone.** It is off the hot path (with default keys the translator
   does nothing), but if you would rather ship controller support first and re-binding after a play-test, the Settings
   tab can show the table read-only (one line in `input/bindings-ui.js`). Recommend **keep it on**.
9. **The title screen's glue lives in `main.js`**, so the gallery carries a 60-line copy of the chip-filling code
   (`gallery/title-lite.js`). Recommend D-UI moves `initTitle` into `js/client/title.js` next round so the copy goes.

## 6. Files

| | |
|---|---|
| `ui-gallery.html`, `css/ui-gallery.css`, `js/client/gallery/gallery.js` | the page: scene list, frame, notes, deep links |
| `ui-gallery-frame.html`, `css/ui-gallery-frame.css`, `js/client/gallery/frame-boot.js` | the frame: takes `index.html`'s markup and stylesheets, in-memory storage, recorded clock |
| `js/client/gallery/stage.js` | creates the game's interface on stand-ins; the scene verbs |
| `js/client/gallery/scenes.js` | the scenes (data), the frames, `NO_SCREEN` |
| `js/client/gallery/fake-net.js`, `fixtures/` | the recorded server |
| `js/client/gallery/title-lite.js`, `frame-chrome.js` | title-screen glue; the island / home bar / on-phone scene picker |
| `tools/record-ui-fixtures.mjs` | re-record |
| `js/client/input/bindings.js` | THE table (pure) |
| `js/client/input/{index,keyboard,emit,device,hints}.js` | install, re-bound keys, default-key events, last device, hint labels |
| `js/client/input/{gamepad,focus,radial,osk}.js` | controller, focus ring + steered pointer, quick wheel, on-screen keyboard |
| `js/client/input/{touch,layout}.js`, `css/layout-phone.css` | the phone proposal and its switch |
| `js/client/input/bindings-ui.js`, `css/input.css` | the settings tab, the reference tables, glyph / ring / wheel styles |
| `tests/G/{gallery,bindings}.test.js`, `tests/G/{gallery,gamepad}.spec.js`, `tests/G/shots/` | the guarantees |

Hooks in files stream G does not own (all small, listed in `docs/requests.md` "Round 5 contracts — G"):
`controls.js` `setAnalog()`, `main.js` `installInput()` + `input.tick()`, `social-core.js` (tables built from
`bindings.js`), `ui/settings.js` (the Key bindings tab), `help.js` (drawn from the table).
