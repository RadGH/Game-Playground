# LANTERNFALL — page 02: controls and interface

> Canon v2 — edited per EDIT-ORDERS.md (2026-09-26).

> Every key, button and screen in the game: what it is bound to, what it shows, where each element sits, and how it looks and sounds. **This is the only page that prints a key table** (00 §3, R18); every other page links here.

## Contents

1. [Ground rules for all input and all screens](#1-ground-rules)
2. [Keyboard and mouse bindings](#2-keyboard-and-mouse-bindings)
3. [Gamepad bindings](#3-gamepad-bindings)
4. [Mouse aim rules (and keyboard-only / gamepad aim)](#4-aim-rules)
5. [Input contexts and the binding file (`data/bindings.json`)](#5-input-contexts-and-the-binding-file)
6. [Screen map (how screens connect)](#6-screen-map)
7. [Title screen](#7-title-screen)
8. [Save slots](#8-save-slots)
9. [Class select](#9-class-select)
10. [New game options and difficulty](#10-new-game-options-and-difficulty)
11. [The HUD](#11-the-hud)
12. [Minimap](#12-minimap)
13. [Full-screen map (act map + room map)](#13-full-screen-map)
14. [Inventory and equipment](#14-inventory-and-equipment)
15. [The Wick builder](#15-the-wick-builder)
16. [Skill board and attribute screen](#16-skill-board-and-attribute-screen)
17. [The Ledger (damage meter)](#17-the-ledger)
18. [Journal, bestiary, codex](#18-journal-bestiary-codex)
19. [Settings](#19-settings)
20. [Pause menu](#20-pause-menu)
21. [Death screen and recap](#21-death-screen-and-recap)
22. [Level-up popup](#22-level-up-popup)
23. [Shop screens](#23-shop-screens)
24. [Dialogue box](#24-dialogue-box)
25. [UI styling: colours, fonts, panel art, sounds](#25-ui-styling)
26. [Tooltips and number formatting](#26-tooltips-and-number-formatting)
27. [Accessibility and menu focus / keyboard navigation](#27-accessibility-and-menu-navigation)
28. [Tests this page implies](#28-tests-this-page-implies)
29. [v2 changes (applied in v2)](#29-v2-changes-applied-in-v2)
30. [Parked (v2)](#parked-v2)

---

## 1. Ground rules

These rules apply to everything below. When a later section seems to disagree, this section wins.

1. **Two drawing layers.**
   - **The play layer** (HUD, world prompts, damage numbers, minimap) is drawn on the game canvas at the
     logical resolution of **480 × 270 cells**, integer-scaled with the world, using our own **5×7 pixel
     font** (3×5 "tiny" variant for pips and small counters). This keeps the HUD crisp and in the same
     pixels as the world.
   - **The menu layer** (every full screen: title, inventory, builder, map, settings, shops, dialogue,
     subtitles, tooltips) is **DOM** over the canvas, styled by standalone `.css` files, with **Cinzel**
     for headings and **Spectral** for body text (same families Emberveil uses; loaded from Google Fonts,
     with `Georgia, serif` as fallback so offline still works). Numbers in DOM menus use Spectral's
     lining figures (`font-variant-numeric: tabular-nums lining-nums`).
2. **The game pauses** whenever any full screen is open, **except** in Floodgate's build phase (09 §10.4),
   where the inventory, map and builder open over a running build timer. The Wick builder's test chamber
   runs its own little simulation while the main world is paused. **No menu has a timer** and breath stops
   draining while any menu is open (R74).
3. **Every action is rebindable** except: `Esc` (pause/back), `F1` (controls help), mouse move (aim), and
   gamepad `Menu`/`View`. Those four are fixed so a player can never lock themselves out.
4. **Browser-reserved keys are refused** by the rebind screen with the reason shown: `Ctrl+W`, `Ctrl+T`,
   `Ctrl+N`, `Ctrl+Q`, `Ctrl+Tab`, `Alt+F4`, `F5`, `F11`, `F12`, `Ctrl+Shift+I`, `Cmd+*` on Mac. Plain `Ctrl`
   and `Alt` alone are refused as gameplay keys (Ctrl+W closes the tab if a finger slips; Alt steals
   focus to the browser menu in some browsers).
5. **No action lives on two keys by accident.** A test (§28) fails if two actions in the same context share
   a key, or if any key the code listens for is missing from `data/bindings.json`.
6. **Hold-to-toggle**: every action marked "hold" in the tables can be switched to "toggle" in
   Settings → Accessibility (§19.6).
7. **One number formatter** (`shared/format.js`) and **one tooltip engine** (`shared/tooltip.js`) for
   every screen. Nothing on screen may read like `25.02000000000001` (§26).
8. **Sounds by id** only, through `sfx/js/sfx.js` (`Sfx.create({ method })`, `play(id, { pan })`).
   §25.5 lists every UI event and its id.
9. **No third-party names in player-facing text.** Button glyphs are generic (letters or shapes), never a
   console brand's name or logo.
10. **Numbers other pages own are linked, not copied.** Movement speeds and jump heights are 07's
    (`data/movement.json`), rope and grapple numbers are 07's, spell reach and oil costs are 03's, dodge
    windows and melee timings are 04's, light radii are 06's. Where a screen *shows* such a number it reads
    it from that data at run time.
11. **Desktop + gamepad only** (00 §16, R92). A phone or tablet gets a "Desktop recommended" card before the
    title (it can still be dismissed); the title and every menu must still pass a 390 px-wide layout test.

---

## 2. Keyboard and mouse bindings

"Unlock" says when the action first does anything (node ids are 09's). Before that, the key is bound but
pressing it shows a one-line pixel-font hint ("You have not learned that yet.") at most once per room.
The same tables are written out as data in `data/bindings.json` (§5.1); a test keeps the two identical.

### 2.1 Movement and body

| Action (id) | Default | Alt default | Hold/tap | Rebindable | Unlock | Notes |
|---|---|---|---|---|---|---|
| `move_left` | `A` | `←` | hold | yes | start | Walk; speeds in 07 §2 (`movement.json`). |
| `move_right` | `D` | `→` | hold | yes | start | |
| `look_up` / `climb_up` | `W` | `↑` | hold | yes | start | Climbs ladders and ropes; on flat ground, holding it for 0.4 s pans the camera up (06 owns the camera distance). |
| `look_down` / `climb_down` | `S` | `↓` | hold | yes | start | Crouch; hold 0.4 s pans the camera down. |
| `jump` | `Space` | — | tap / hold | yes | start | Tap = short hop, hold = full jump (heights in 07 §2). Wall-slide and wall-jump are part of `jump` from the start; ledge-grab is automatic. |
| `drop_through` | `S` + `Space` | — | combo | follows its parts | start | Falls through one-way platforms, planks and rope bridges. |
| `run` | `Shift` (left or right) | — | hold (toggle option) | yes | start | Setting "Always run" inverts it (Shift walks). |
| `dodge` | `Q` | — | tap | yes | start | Short roll; its safe window and recovery are 04's. |
| `swim_up` / `swim_down` | `W` / `S` (+ `Space` = kick) | | hold | follows its parts | Act 3 (`a3_n01`) | Swimming reuses the movement keys; `Space` is a strong kick (07 owns its numbers). |
| `interact` | `E` | — | tap (hold where marked) | yes | start | Talk, open, pick up, pull lever, sit at a lamp-post, touch a Rekindle post. Hold 0.6 s for "hold" interactions (turning a sluice wheel, carrying a body, relighting a Great Lamp). |

### 2.2 Combat and spells

| Action (id) | Default | Hold/tap | Rebindable | Unlock | Notes |
|---|---|---|---|---|---|
| `cast` | **Mouse left** | tap / hold | yes | start | A **tap** (released in under 0.15 s) casts the selected wick. From Act 2 **holding** overcharges it (03 §9): the charge ring fills, release to fire. Beam and tether do not overcharge — for them, holding is simply firing. Before the Charmwife's Niche (`a2_n06`) a hold is a tap. |
| `pole` | **Mouse right** | tap / hold | yes | start (heavy + plunge from `a1_n06`) | Melee swing with the lantern pole (or the class weapon). Hold = heavy swing; down in the air = plunge / pogo. Frame data is 04's. |
| `class_ability` | `R` | tap | yes | the Act 1 relight (`a1_n08`) | The class ability (Beacon, Floodwall, Turret, Flue Dash, Foresight — 04). The Tinker's Hijack node (04) also fires on this key. |
| `wick_1` … `wick_4` | `1` `2` `3` `4` | tap | yes | slot 1 start, 2 at `a1_n03`, 3 in Act 3 (`a3_n02`), 4 in Act 5 (`a5_n02`) | Selects the wick slot. The lantern light turns that wick's flame colour over 0.15 s. |
| `wick_next` / `wick_prev` | **Mouse wheel down / up** | tap | yes (can be moved to keys) | `a1_n03` | Skips empty and locked slots. Setting "Wheel direction" inverts it. |
| `belt_1` … `belt_4` | `Z` `X` `C` `V` | tap | yes | start | Uses the consumable on belt slot 1–4 (08 §2.1: the belt points at a satchel stack; the Guild flask is a belt item with 2 charges). The number row stays with the wicks, which you swap far more often. |
| `quick_heal` | `H` | tap | yes | start | Drinks the first **healing** tonic on the belt, or if none is belted, the first in the satchel (08). You can walk but not cast while drinking. |
| `hood` | `Y` | tap (toggle) | yes | Act 4 (`a4_n01`) | Hoods the lantern (hood is an **action**, not a gear slot). Press again to unhood. What it does to light and oil is 06's and the shared oil table's. |
| `inspect` | **hold `Tab`** | hold | yes | start (wires show from Act 2) | Brightens every wire and gate in view, labels plates with their weight and shows no-build hatching (07). Only in play; in menus `Tab` moves focus. |

### 2.3 Tools and building

| Action (id) | Default | Hold/tap | Rebindable | Unlock | Notes |
|---|---|---|---|---|---|
| `grapple` | `F` | tap / hold | yes | Act 2 start (`a2_n02`) | Fires the hook toward the aim point (range and reel speed are 07's). Hold = stay attached and swing; release = let go. Tap while attached = let go. `W`/`S` while attached reel in/out. |
| `build_mode` | `G` | tap (toggle) | yes | `a1_n06` (plank kit) | Enters build mode (context `build`, §5). **Time keeps its normal speed** (R19); a ghost part follows the cursor. Accessibility "Slow time while building" (§19.6) slows it to 35%. |
| `gravity_lantern` | `T` | tap | yes | Act 5 (`a5_n03`) | Throws a gravity lantern to the aim point (07). Tap again near a placed one to pick it up; hold `T` 0.5 s to flip every placed lantern at once. |
| `ping` | `Mouse middle` | tap | yes | start | Drops a temporary 8 s marker at the aim point that also shows on the minimap. |

**Build mode** (its own context; movement, jump, dodge and screen keys still work):

| Action (id) | Key | Notes |
|---|---|---|
| `build_part_1` … `build_part_8` | `1`–`8` | Pick a part from the part bar (07's 8 parts in unlock order: plank, brace, crate, ladder, rope peg, sandbag, float, lantern post). |
| `build_part_9`, `build_part_10` | `9`, `0` | The Tinker's two parts (turret, spikes). |
| `build_rotate_ccw` / `build_rotate_cw` | mouse wheel up / down | Rotates the ghost **45°** per step (07's build grid). |
| `build_place` | `cast` (mouse left) | Places the part. |
| `build_cancel` | `pole` (mouse right) | Drops the ghost; a second press leaves build mode. |
| `build_mode` | `G` | Leaves build mode. |

### 2.4 Screens

| Action (id) | Default | Rebindable | Unlock | Opens |
|---|---|---|---|---|
| `pause` | `Esc` | **no** | start | Pause menu (§20). In any other screen, `Esc` goes back one level. |
| `inventory` | `I` | yes | start | Inventory (§14) |
| `character` | `P` | yes | start | Attributes (§16.2) |
| `skills` | `K` | yes | start (board opens in Act 2) | Skill board (§16.1). In Act 1 it shows the banked skill points and "The board opens in Act 2". |
| `wick_builder` | `B` | yes | `a1_n03` | Wick builder (§15). Refused in combat (§15.1). |
| `map` | `M` | yes | start | Full-screen map, room tab (§13). Press `M` again for the act tab. |
| `ledger` | `L` | yes | start | Ledger (§17) |
| `journal` | `J` | yes | start | Journal (§18) |
| `help` | `F1` | **no** | start | Controls help overlay: the live binding table, drawn from `data/bindings.json`. |
| `minimap_zoom_in` / `_out` | `+` / `-` (numpad and main row) | yes | start | Minimap zoom (§12.4) |
| `minimap_toggle` | `N` | yes | start | Minimap size cycle S → M → L → hidden |
| `subtitle_log` | `U` | yes | start | Last 50 subtitle lines (§11.13) |
| `screenshot` | `F2` | yes | start | Saves a PNG of the play layer at 1× and 4× (`canvas.toBlob`, download). |
| `perf_overlay` | `F3` | yes | start | Frame time, sim ms, cells awake, draw calls (10's budget). |
| `debug_console` | `` ` `` | yes | only with `?debug=1` in the URL | Debug console (10). |

### 2.5 Keys inside menus (menu context)

| Action | Keys | Gamepad |
|---|---|---|
| Move focus | arrows, `W A S D`, `Tab` / `Shift+Tab` | D-pad, left stick |
| Confirm / activate | `Enter`, `Space`, mouse left | South (A) |
| Back / close | `Esc`, mouse right on empty space | East (B) |
| Previous / next tab | `Q` / `E` | LB / RB |
| Previous / next sub-tab | `[` / `]` | LT / RT |
| Jump to Satchel tab 1–6 | `1`–`6` | — |
| Secondary action on focused item (mark junk in the satchel, sell 1 in a shop, clear a socket in the builder) | `X` | West (X) |
| Tertiary action (details, lock) | `Y`; hold `Shift` to compare | North (Y) |
| Scroll a long list | mouse wheel, `PageUp`/`PageDown` | right stick |
| Close every screen at once | `Esc` held 0.5 s | Menu |

Menu keys are a **separate context** from gameplay, so `Q` means "previous tab" in a menu and "dodge" in
play, and `Tab` means "next field" in a menu and "inspect" in play, without clashing (§5).

**Dialogue context:** `1`–`4` pick a reply, `E` / `Space` / `Enter` / click advance, arrows move, `Esc` leaves
(pad: D-pad, South, East).

---

## 3. Gamepad bindings

Uses the browser **Standard Gamepad** layout (`gamepad.mapping === "standard"`). Buttons are named by
position (South/East/West/North) in code and data; the glyph set shown to the player is a setting
(§19.5: letters `A B X Y`, shapes, or numbers). A non-standard pad gets a "Press the button for Jump…"
guided mapping on first connect, saved per `gamepad.id`. A **tap** is a press shorter than 0.2 s; a
**hold** is 0.5 s or longer.

### 3.1 Gameplay

| Input | Action | Notes |
|---|---|---|
| Left stick | move; up/down climb, crouch, swim | Deflection > 0.85 runs (setting: "Run by stick push", default on; off = hold L3 to run). Dead zone 0.18 radial, setting 0.05–0.40. |
| Right stick | aim (§4.3) | Dead zone 0.20. With no aim input for 0.6 s, aim returns to the facing direction. |
| South (A) | `jump` | hold = full jump |
| East (B) | `dodge` | |
| West (X) | `pole` | hold = heavy swing |
| North (Y) | `interact` | hold for hold-interactions |
| RT | `cast` | Analogue: a half pull (> 0.3) casts; holding overcharges from Act 2; a beam follows the trigger. |
| LT | **aim steady**: while held, the right stick moves the aim at 40% speed for fine lob/rune placement. With "Overcharge needs a key" on, LT held + RT = overcharge (§19.6). | |
| RB | `grapple` | hold to stay attached |
| LB **tap** | `class_ability` | |
| LB **hold** | **tool wheel** (radial) | 8 wedges: belt 1, belt 2, belt 3, belt 4, `build_mode`, `gravity_lantern`, `hood`, `ping`. Flick the right stick to a wedge, release LB to use it. The game keeps running while the wheel is open (Accessibility "Slow time while building" also slows it to 35%). Locked wedges are drawn dim. |
| D-pad left / right | `wick_prev` / `wick_next` | |
| D-pad up / down | `wick_1` / `quick_heal` | Up selects slot 1 (the "panic button" back to your main wick). |
| L3 (left stick click) | run toggle (if "Run by stick push" off) or `hood` (if on) | |
| R3 (right stick click) | **soft lock**: aim snaps to the nearest visible enemy in a 60° cone; click again to release | See §4.3. |
| View **tap** | `map` | The map frame's tabs are Room map · Act map · **Journal** on a pad (the Journal also sits in the Satchel). |
| View **hold** | `inspect` | fixed button, not rebindable |
| Menu | `pause` | **not rebindable** |

### 3.2 Build mode on a gamepad

| Input | Action |
|---|---|
| Right stick | move the ghost part (it snaps to 07's build grid) |
| RT | place |
| West (X) | cancel the ghost (the `pole` button) |
| East (B) | leave build mode |
| LB / RB | rotate −45° / +45° |
| D-pad left / right | previous / next part on the part bar |

### 3.3 Rumble

`gamepad.vibrationActuator.playEffect('dual-rumble')` where the browser supports it. Setting 0–100%
(default 60%). Events: taking a hit (strong 0.35 × hit fraction of max health, 120 ms), overcharge past the
safe line (weak pulse every 0.25 s), gutter burst (strong 1.0, 250 ms), Great Lamp relit (weak 0.4, 900 ms
fade-out), boss phase change (strong 0.6, 300 ms). None for ordinary casts.

---

## 4. Aim rules

### 4.1 Mouse aim

- The system cursor is hidden over the game canvas and replaced by the **reticle**: a 7×7-cell pixel
  crosshair drawn in the selected wick's flame colour, with a 1-cell dark outline so it reads on bright
  rain. It turns grey with a slash when the selected wick cannot be cast (not enough oil, on cooldown,
  underwater with Ember).
- **Aim origin** is the lantern's hanging point: 10 cells above the player's feet, 4 cells in front of
  the body on the facing side.
- **Facing** follows the reticle's side of the player. Exception: while running with no `cast` or `pole`
  in the last 0.5 s, facing follows movement; the reticle stays where the mouse is.
- **No pointer lock by default** (the cursor can leave the window). Setting "Keep mouse in game window"
  (§19.6) turns on `requestPointerLock()`; the reticle then moves by mouse movement × sensitivity
  (0.25–3.0, default 1.0) and is clamped to the screen edge minus 4 cells.
- **Per-shape aim** (03 owns the behaviour and every reach; this is how aiming reads it):

| Shape | Aim reads | Preview drawn |
|---|---|---|
| `bolt` | direction from origin to reticle | none (a faint 1-cell dotted line 24 cells long if "Aim guides" is on) |
| `arc` | direction; the sweep is centred on it | a 1-frame ghost arc when the cast starts |
| `lob` | the reticle **point**; launch speed/angle solved to land there, clamped to 03's max range, the clamped landing point shown | dotted arc (every 4th cell) + a landing ring, while `cast` is held, or always if "Aim guides" is on |
| `beam` | direction, re-read every frame, turning at most 240°/s (so a beam cannot whip) | the beam itself |
| `ring` | no aim (centred on you) | the ring radius shown while charging |
| `rune` | the first solid surface along the ray from origin to reticle, up to 03's rune reach; if none, the reticle point snapped down to the nearest floor below it within 40 cells; if still none, refused ("No surface") | a ghost glyph on the surface, red if refused |
| `wave` | left or right only (which side the reticle is on) | none |
| `tether` | first cast: anchor A at the first solid along the ray (up to 03's tether reach); the line runs from A to the lantern while held; release anchors B at the current lantern position or, if `cast` is pressed again, at the reticle's surface | dotted line from A to the lantern |

- **Pole** swings toward the reticle's side, angled up if the reticle is more than 35° above horizontal
  (upswing), down if more than 35° below and you are in the air (downward plunge).
- **Grapple** fires along the ray to the reticle; if the ray misses a hookable surface within 07's range,
  it shows a 1-frame "clink" at the max point and does nothing.

### 4.2 Keyboard-only aim

Setting "Aim with keys" (§19.5). The **arrow keys** stop moving you and become `aim_up/left/down/right`
(`W A S D` still move); `;` is soft lock. Aim snaps to **16 directions**, and holding two keys gives the
diagonals. Lob range is set by holding the aim key: 0.1 s = 30% range … 0.8 s = 100%. Soft lock works as on
the gamepad. (The arrows were chosen so no screen key has to move.)

### 4.3 Gamepad aim and aim assist

- Right stick sets a **direction**; for `lob` and `rune`, the stick's deflection sets **distance** (0.2 →
  20% of max range, 1.0 → 100%).
- **Aim assist** (§19.6, `aim_assist` 0–3, default 1 on gamepad, 0 on mouse; the mouse setting is
  separate): if a visible enemy's centre lies within the assist cone of the aim direction, the aim bends
  toward it. Cone half-angle by level: 0 → 0°, 1 → 4°, 2 → 8°, 3 → 12°. Bend strength: 50% / 75% / 100% of
  the angle gap. Assist ignores enemies behind solid cells and anything more than 260 cells away. It never
  bends `ring` or `wave`.
- **Soft lock** (R3): aim snaps to the nearest visible enemy in a 60° cone, and the lock follows it until
  it dies, leaves view for 1 s, or you press R3 again. A 5×5 bracket glyph sits on the locked target.

---

## 5. Input contexts and the binding file

The input module (`js/core/input.js`, 10) reads keyboard, mouse and gamepad into one per-tick **action
state** (`down`, `pressed`, `released`, `heldFor`, `axis`). The game never reads raw keys. The active
**context** decides which table applies:

| Context | Active when | Blocks |
|---|---|---|
| `play` | no screen open | — |
| `build` | build mode on | uses `play` for movement, jump, dodge, interact and screen keys; `cast`/`pole`/`1`–`0`/wheel are replaced as in §2.3 |
| `menu` | any full screen open | all `play` actions |
| `dialogue` | dialogue box open | `play`; `1`–`4` pick a reply, `E`/`Space`/`Enter` advance |
| `text` | a text field focused (rename wick, name character, map pin note) | everything but `Esc` and `Enter` |
| `rebind` | waiting for a key in the rebind screen | everything; the next key/button is captured (`Esc` cancels) |
| `sandbox` | mouse over the Wick builder's test chamber (§15.4) | only `cast` (tap, or hold to overcharge from Act 2), aim and `wick_1..4` go to the chamber |

### 5.1 `data/bindings.json`

- The file is **written from the tables in §2–§3** and holds exactly the same defaults: per context,
  `action → [KeyboardEvent.code …]` for keys and mouse (`Mouse0` left, `Mouse1` middle, `Mouse2` right,
  `WheelUp`/`WheelDown`), a `gamepad` block with the same per-context map in Standard Gamepad button names,
  the two optional overlays ("Overcharge needs a key", "Aim with keys"), hold/toggle/combo/unlock notes and
  the reserved-chord list. **Its field shape is 10's** (10 §5.0); this page owns the values.
- `js/core/input.js` is **re-pointed at this file in M5**. The built defaults (commit `1080613`) swap cast and
  pole (attack on mouse left, cast on mouse right) and use other screen keys; M5 replaces them with this file.
- Keys use `KeyboardEvent.code` (layout-independent: `KeyA` is the key where A sits on a US board, so an
  AZERTY user gets the same physical layout). The help screen and prompts show `KeyboardEvent.key`-style
  labels through `navigator.keyboard.getLayoutMap()` where supported, so an AZERTY board shows "Z" for the
  up key.
- The player's overrides are saved in the **profile** as a diff from the defaults (so a later default
  change reaches players who never touched it); where and how is 10's save format.

### 5.2 Rebind screen rules

- Click an action's key cell → context `rebind` → next key or button is captured.
- A key already used **in the same context** triggers "`Q` is Dodge. Swap them?" [Swap] [Cancel].
- Each action has a primary and a secondary key; gamepad has one.
- "Reset this context" and "Reset all" buttons, each with a confirm.
---

## 6. Screen map

```
 Title ──► Save slots ──► (new) Class select ──► New game options ──► intro cutscene ──► PLAY
   │            └──► (continue) ─────────────────────────────────────────────────────────► PLAY
   ├──► Modes (Floodgate / Long Descent / Daily Wick / Boss Rush / Trials)  — page 09
   ├──► Guild Hall (meta unlocks, 09 §15)   ├──► Settings   └──► Credits

 PLAY ──Esc──► Pause ──► Resume / Satchel / Map / Status / Rekindle this room / Controls / Settings / quit
   ├── I ──► Inventory ─┐  All six character screens are TABS of one "Satchel" frame:
   ├── P ──► Attributes ├── Q/E (LB/RB) moves between Inventory · Wicks · Skills · Attributes · Ledger · Journal
   ├── K ──► Skills     │  The map is its own frame (it wants the whole screen).
   ├── B ──► Wick builder (Wicks tab)
   ├── L ──► Ledger     │
   ├── J ──► Journal ───┘  (pad: the Journal is also the map frame's third tab)
   ├── M ──► Map (Room tab ⇄ Act tab)
   ├── E at an NPC ──► Dialogue ──► Shop (if a shopkeeper)
   ├── E at a lamp-post ──► Lamp-post menu
   ├── E at a Rekindle post ──► confirm ──► the room streams back (07 §9.5)
   └── death ──► Death screen ──► respawn at lamp-post
```

**Lamp-post menu** (DOM, one column): `Rest` · `Braid wicks` · `Fast travel` · `Spend points` · `Change
difficulty` · `Move mastery` (Act 6, R17: pick which wick is mastered, free) · **`Answer the call`** (R30:
shown only at the first act-hub lamp-post reached after a class unlock; it opens the class select in
"switch" mode — same level, points refunded into the new class's spread, new kit, gear kept; the rule is 04's)
· `Leave`. 09 §8.1 owns what resting restores.

The **Satchel** frame (DOM, fills the viewport minus a 3% margin) has a tab rail across the top:
`Inventory · Wicks · Skills · Attributes · Ledger · Journal`. Each tab shows a gold dot badge when there
is something unspent or new (unspent points, a new strand, an unread codex page). The rail numbers
itself (`1`–`6` jump to a tab while the frame is open, only in `menu` context).

---

## 7. Title screen

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  (live background: a looping 480×270 scene rendered by the real engine —      │
│   rain over the Hollow, the Crown Lamp guttering high in the frame, the       │
│   drowned tiers below reflecting it; a new scene per Great Lamp relit)        │
│                                                                              │
│                         L A N T E R N F A L L                                │
│                  "Go down, Lamplighter. Light them again."                   │
│                                                                              │
│                          ▸ Continue   (Slot 2 · Act 3 · Lv 14 · 6h 12m)       │
│                            New Game                                          │
│                            Load                                              │
│                            Modes            (locked items show a padlock)    │
│                            Guild Hall       ◆ 34 marks                      │
│                            Settings                                          │
│                            Credits                                           │
│                                                                              │
│  v0.1.0 · build 2026-09-26                               Press F1 for keys   │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| Background scene | A small preset room per act (room files are 10's) run by the real simulation at 30 fps sim, rain on. Pick: the scene of the highest act any slot has reached (the Act 1 scene is the Guild Hall balcony view, B2). If WebGL2 is missing, the "needs WebGL2" card (06) replaces the title; Canvas2D is a debug view only. |
| Logo | Cinzel 64px, letter-spaced 0.3em, gold `--ink-gold` with a 2px `--flame-ember` glow that flickers ±8% brightness on a 1.7 s noise loop (off with flash reduction). |
| Tagline | Spectral italic 18px, `--ink-dim`. |
| Continue | Shown only if a save exists; loads the most recently played slot. Summary: slot, act, level, play time. |
| New Game | → Save slots (§8) in "choose a slot" mode. |
| Load | → Save slots in "load" mode. |
| Modes | Sub-list: Floodgate, The Long Descent (with the Daily Wick as its seeded daily flag), Boss Rush, Trials. Locked ones show a padlock and the unlock rule from 00 §14 as a tooltip ("Defeat Mother Tallow in any save"). Modes read unlocks from the **profile** (§8.3), not from a slot. |
| Guild Hall | The Guild mark shop: 10 unlocks (09 §15). Shows the profile's marks. |
| Settings | §19 |
| Credits | Scrolling list: "Design & direction: Radley Sustaire", the playground pieces used, vendored libraries and fonts with licences, Kenney CC0 sounds (the sfx library method). |
| First launch | Before the title shows, a one-time **"Before you start"** card: text size, flash reduction, subtitles, screen shake — the four settings a player may need before seeing anything. On a phone or tablet the "Desktop recommended" card (§1 rule 11) comes first. |
| Music | The procedural score's title bed (the rain is the score: rain, the Act 1 drone and the Guild bell motif, 10) on the `music` bus; ambience `ambience.void` under it at −12 dB. No jukebox. |

---

## 8. Save slots

### 8.1 Screen

```
┌─ Choose a lamp ─────────────────────────────────────────────────────────────┐
│ ┌──────────────────────────────┐ ┌──────────────────────────────┐ ┌───────┐ │
│ │ SLOT 1                  [⋯] │ │ SLOT 2                  [⋯] │ │SLOT 3 │ │
│ │ [portrait 48×48 px art]     │ │ Moth Oracle · "Ilse"         │ │ empty │ │
│ │ Lamplighter · "Wren"        │ │ Act 4 — Blackwater           │ │       │ │
│ │ Act 2 — The Gutterways      │ │ Level 19 · Lampless          │ │  + New│ │
│ │ Level 9 · Lamplighter       │ │ Lamps lit ●●●○○○              │ │       │ │
│ │ Lamps lit ●○○○○○            │ │ 11h 40m · 3 deaths            │ │       │ │
│ │ 2h 05m · 7 deaths           │ │ Last played 2026-09-25 22:14  │ │       │ │
│ │ Last played 2026-09-26      │ │ ⚑ Iron Wick                   │ │       │ │
│ └──────────────────────────────┘ └──────────────────────────────┘ └───────┘ │
│  Backup: each slot keeps 1 rotating backup of its previous save [Restore…]  │
│  [Export slot to file]  [Import slot from file]                  [Back]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| Slot card | 3 manual slots. Portrait = the character drawn by the real sprite renderer at 4×, lantern lit in their current wick-1 colour. |
| `[⋯]` menu | Rename character, Duplicate to empty slot, Export JSON, Delete (type the character's name to confirm). |
| Lamps lit | 6 pips, filled gold for each relit Great Lamp. |
| Iron Wick flag | Shown when the one-life option is on (§10.3). |
| Backup | **3 slots + 1 backup each** (R64, 00 §13): every save first copies the slot's previous save to its one backup. "Restore…" shows the backup's timestamp, act and node and asks to confirm. |
| Export / Import | JSON file download/upload through `shared/ui.js` export/import; validated against the save schema (10); a bad file is refused with the first error shown. |
| Storage | `localStorage` through `shared/store.js` (namespace `lanternfall:`); key names, the save format and the size budgets are 10's and 00 §13's. The card shows the slot's size as a small "18 KB" note (a slot must stay ≤ 64 KB). If `localStorage` throws (private window), a red banner: "This browser will not keep saves. Export before you close the tab." |

### 8.2 Autosave rules (summary; 09 §8 owns what dying and resting restore)

Saves happen at: resting at a lamp-post, relighting a Great Lamp, entering a new act, closing a shop,
quitting to title. Never mid-room. The HUD shows a spinning 7×7 lantern glyph bottom-right for 1 s.
What a save keeps of a room is its **prefab state only** (levers, doors, chests, lamp-posts, broken wall
groups, killed placed enemies, built parts); burned, melted or moved cells reset on re-entry (00 §13).

### 8.3 Profile (shared by all slots)

Class unlocks and their challenge progress, Guild marks, mode unlocks, best scores, achievements,
cosmetics, settings, bindings. Deleting a slot never touches the profile.

---

## 9. Class select

```
┌─ Who goes down? ────────────────────────────────────────────────────────────┐
│ ┌──────┬──────┬──────┐          ┌──────────────────────────────────────────┐ │
│ │LAMP- │SLUICE│TINKER│          │  [ animated 3× sprite: idle, then a cast  │ │
│ │LIGHTR│WARDEN│      │          │    of each starting wick into a dummy,    │ │
│ │  ◉   │  ◉   │  ◉   │          │    in a 160×90 chamber with rain ]        │ │
│ ├──────┼──────┼──────┘          │                                          │ │
│ │CHIMNY│ MOTH │                 │  LAMPLIGHTER — balanced caster-duelist   │ │
│ │SWEEP │ORACLE│                 │  Wicks: Ember Bolt · Gleam Ring          │ │
│ │  🔒  │  🔒  │                 │  Ability: Beacon (from the Crown relight)│ │
│ └──────┴──────┘                 │  Might ▮▮▯▯▯  Wick ▮▮▮▮▯  Draught ▮▮▮▮▯   │ │
│                                  │  Nerve ▮▮▯▯▯  Knack ▮▮▮▯▯                  │ │
│  Name: [ Wren________ ] [🎲]     │  Plays like: keep your distance, braid     │ │
│  Look: [◂ palette 3/8 ▸] [◂ lantern skin 1/1 ▸]                          │ │
│                                  │  big wicks, use the pole when crowded.   │ │
│                  [Back]  [Choose ▸]                                         │ │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Behaviour |
|---|---|
| Class grid | **5 cards** in canon order (00 §7): Lamplighter, Sluicewarden, Tinker (open from the start), Chimneysweep and Moth Oracle (unlockable). Unlocked: coloured portrait. Locked: silhouette in `--ink-dim`, a padlock, and the card still selectable to read about it. |
| Preview pane | Real-engine mini chamber (reuses the Wick builder test chamber, §15.4) playing the class's idle and each starting wick on a dummy. Locked classes play it too, greyed, so the player sees what they are working toward. The Sluicewarden's Tide Arc shows as **dry** (pushes and soaks with water already there; 03). |
| Attribute bars | 5 bars of 5 pips from the class's starting attributes (04), rounded to the nearest pip. |
| "Plays like" | 2 sentences from the class's `blurb` (04 owns the text). |
| **Locked class panel** | Replaces "Choose" with the **unlock challenge**, its **trial alternative**, and live **progress** from the profile (§9.1). `[Track]` pins the challenge to the HUD objective line (§11.12) in every save. |
| Name | 1–16 characters, letters, spaces, `'` and `-`. `🎲` rolls a name from Name Forge (`namegen/`) with the `human` language. |
| Look | **Palette swaps only** (00 §4: gear is a palette swap plus one overlay per slot): a coat palette (8 muted ramps) and a lantern skin (skins owned by the profile: Guild Hall `gh_cos_lanterns`, trial cosmetics, Ending C's "Lanternfall" skin). |
| Choose | → New game options (§10). |
| **Switch mode** | Opened from the lamp-post menu's **"Answer the call"** (§6, R30): the grid shows only unlocked classes other than your current one; Choose becomes `[Answer the call ▸]` with a summary of what changes ("Level 14 kept · attribute and skill points refunded into the Moth Oracle's spread · new starting wicks added · gear kept (off-class weapon −20%)"). The rule itself is 04's. |

### 9.1 Locked class progress display

Only the two unlockable classes have a progress line (R30). The challenges are 00 §7's; 04 owns the rules.

| Class | Challenge (canon) | Progress line shown | Tracked counters (profile) |
|---|---|---|---|
| `chimneysweep` | Swing **2,000 m** (16,000 cells) on ropes in one save, **or** bronze in the Rope Gauntlet trial | "Most rope swung in one save: 1,240 m / 2,000 m · Rope Gauntlet: not cleared (door in The Long Chain, Act 2)" | `ch_sweep_best_rope_m`, `trial_rope_gauntlet` medal |
| `moth_oracle` | Clear Act 4 without your lantern going out (the Widow's snuff never counts; hooding is not "out"), **or** bronze in the Hooded Crossing trial | "Blackwater cleared with lantern lit: not yet. Best: lantern went out 2× in your cleanest clear · Hooded Crossing: not cleared (door in Lampless Lane, Act 4)" | `ch_moth_best_outs`, `trial_hooded_crossing` medal |

"One save" for the Chimneysweep challenge means one save slot from new game to its current point (a death
does not reset it); the counter shown is the best across slots. 1 metre = 8 cells everywhere in the UI
(the player is 12 cells ≈ 1.5 m).

---

## 10. New game options and difficulty

```
┌─ Before you go down ────────────────────────────────────────────────────────┐
│  Difficulty                                                                 │
│   ○ Wick-lit      — for the story. Forgiving fights, longer warnings.       │
│   ● Lamplighter   — the intended game.                                      │
│   ○ Lampless      — harder hits, thinner oil, harsher deaths.               │
│   (hover or focus a choice to see its exact numbers →)                      │
│                                                                             │
│  ☐ Iron Wick — one life. Death ends this save. (Guild marks are kept.)      │
│  ☑ Lesson hints — pixel-font hints the first time each thing appears       │
│  ☑ Subtitles     ☐ Skip intro                                               │
│  Room seed: [ 48213977 ] [🎲]  (changes the kit-built fight rooms only)     │
│                                                                             │
│                                   [Back]   [Begin the descent ▸]            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 10.1 Difficulty multipliers (exact)

**This is the one difficulty table** (R15, 00 §3): three levels `wicklit` / `lamplighter` / `lampless` plus the
**Iron Wick** one-life toggle (§10.3), stored in `data/difficulty.json` (shape: 10). 05 reads the enemy rows,
09 §7 applies all of it **on top of** the per-act curve. The **Act 1 grace** (00 §6.2, 05 §2.3: telegraph
wind-ups ×1.25 and one melee attack token in Act 1) applies **on top of this table on every difficulty**.

| Knob | Wick-lit (`wicklit`) | Lamplighter (`lamplighter`) | Lampless (`lampless`) |
|---|---|---|---|
| Enemy health | ×0.70 | ×1.00 | ×1.35 |
| Enemy damage | ×0.60 | ×1.00 | ×1.30 |
| Enemy speed | ×0.90 | ×1.00 | ×1.08 |
| Boss health | ×0.75 | ×1.00 | ×1.25 |
| Mother Tallow's third phase (05; always on in Boss Rush) | no | no | **yes** |
| Telegraph wind-up time | ×1.30 | ×1.00 | ×0.90 (never below 250 ms, 05) |
| Attack tokens melee / ranged (05) | 1 / 2 | 2 / 3 | 3 / 4 |
| Elite chance per spawn group | 0% | 8% | 18% (elites from Act 2 are champions: 2 modifiers) |
| Bosses enrage | no | yes | yes |
| Void zone tick damage | ×0.50 | ×1.00 | ×1.30 |
| Oil cost of wicks | ×0.85 | ×1.00 | ×1.10 |
| Oil regen rate (never above 0 in the dark, shared oil table) | ×1.30 | ×1.00 | ×0.85 |
| Tonic healing | ×1.25 | ×1.00 | ×0.85 |
| Overcharge gutter chance past the safe line (03 §9.2) | ×0.50 | ×1.00 | ×1.25 |
| Breath underwater | ×1.50 | ×1.00 | ×0.80 |
| XP gained | ×1.00 | ×1.00 | ×1.10 |
| Pennies dropped | ×1.00 | ×1.00 | ×1.15 |
| Pennies lost on death (dropped as a recoverable purse, 08 / 09 §8.2) | 0% | 25% of carried | 50% of carried |
| Guild marks earned | ×0.80 | ×1.00 | ×1.30 |
| Aim assist default (gamepad) | 2 | 1 | 1 |

Build mode runs at full speed on every difficulty (R19); the only slow-down is the accessibility setting
"Slow time while building" (§19.6).

- **Changing difficulty later:** at any lamp-post, from the lamp-post menu. Lowering is always allowed.
  Raising is allowed too. The save records the **lowest difficulty ever used** (`save.lowestDifficulty`);
  achievements marked "Lampless" (09 §16) need it to be `lampless`.
- **Tooltip on each choice** is a `data-tip-render="difficulty"` card listing the table column above,
  numbers through `format.js` (`pct`, `sign`).

### 10.2 Room seed

A 32-bit unsigned integer, default random (`crypto.getRandomValues`). 09 §4 uses it to build the fight rooms
that come from **room kits**; hand-authored rooms and the story never change. Shown in the pause menu so a
player can share it.

### 10.3 Iron Wick

One life. On death: the death screen (§21) shows "The lamp is out.", the slot is moved to the **Hall of
Snuffed Wicks** (a read-only list on the Guild Hall screen with name, class, act, level, cause of death),
and Guild marks earned are kept in the profile. Cannot be switched on or off after the start.

---

## 11. The HUD

### 11.1 Layout at 480 × 270 (cell coordinates, origin top-left)

```
 0                                                                                 479
0┌─────────────────────────────────────────────────────────────────────────────────┐
 │ ♥▰▰▰▰▰▰▰▰▰▰▰▰▰▰▱▱▱ 142/180      MOTHER TALLOW                     ┌──minimap──┐│
 │ ◈▰▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱  61/100   ▐████████▌██████│███████│█████▌     │           ││
 │ ▔▔▔▔▔▔▔▔▔ (xp line)              phase ticks ↑       ↑           │   ▸  ·    ││
 │ [burn][chill][meal]                                               └───────────┘│
 │                                                                  ● 1,284  ◆ 3  │
 │                                                             ◇ Relight the Crown│
 │                                                                Lamp            │
 │                                                                                 │
 │                         (world)                          ┌ + Tallow Scrap ×3 ┐ │
 │                                                          └ + 40 pennies      ┘ │
 │                                                                                 │
 │                                 [E] Pull lever                                  │
 │                                     (world prompt above the lever)              │
 │                                                                                 │
 │              "The wax remembers every flame you ever lit."  — Mother Tallow     │
 │ ┌──┐┌──┐┌──┐┌──┐  ┌─┐┌─┐ ⚱×4                                                   │
 │ │1 ││2 ││3 ││4 │  │Z││X│ H                                               ◌ save │
269└─────────────────────────────────────────────────────────────────────────────────┘
```

**Every HUD element is anchored to a screen edge or corner** (R78), not to fixed 480 × 270 coordinates, so
the HUD holds together when the visible area changes (wide view, odd window sizes, HUD text 2×). An anchor is
`left`/`right` plus `top`/`bottom` (or `centre`), and an offset in cells measured inward from that edge. The
drawing above is the 480 × 270 case.

| Element | Anchor | Offset (x, y cells) | Size (cells) | Section |
|---|---|---|---|---|
| Health bar | top-left | 8, 6 | 96 × 6 (+ label) | §11.2 |
| Oil bar | top-left | 8, 15 | 96 × 4 (+ label) | §11.3 |
| XP line | top-left | 8, 21 | 96 × 1 | §11.2 |
| Status icons | top-left | 8, 25 | 9 × 9 each, 10 per row, 2 rows | §11.7 |
| Boss bar | top-centre | 0, 16 (name at 0, 7) | 240 × 6 (shrinks to 60% of the width if narrower) | §11.8 |
| Minimap | top-right | 6, 6 (size M) | 96 × 54 | §12 |
| Flood clock | top-right, under the minimap | 6, 62 | minimap width × 7 | §12.5 |
| Currencies | top-right (right-aligned) | 8, 64 (8, 72 while the flood clock shows) | pixel font | §11.11 |
| Objective line | top-right (right-aligned) | 8, 74 (+8 with the flood clock) | max 2 lines × 24 chars | §11.12 |
| Pickup toasts | top-right, stacking down | 8, 100 | 4 max | §11.14 |
| Interaction prompt | world space | — | — | §11.10 |
| Subtitles | DOM, bottom-centre | 22% of the viewport height up from the bottom | — | §11.13 |
| Wick slots | bottom-left | 8, 8 (bottom edge of the slots) | 4 × (24 × 24), gap 4 | §11.4 |
| Belt (4 quick slots) | bottom-left | 124, 8 | 4 × (16 × 16), gap 3 | §11.9 |
| Save glyph | bottom-right | 6, 6 | 7 × 7 | §8.2 |

Layouts are tested at **427 × 240, 512 × 288 and 640 × 360** visible cells (the smallest odd window, the
middle, and the wide view): nothing overlaps and nothing sits within 6 cells of an edge (§28).

**Safe margins:** nothing in the HUD sits closer than 6 cells to an edge (the renderer may crop up to one
row at odd window sizes, 06).

**HUD scale:** the play-layer HUD is part of the 480 × 270 image, so it scales with the game. For readers
who need more, Settings → Accessibility → "HUD text size" draws the HUD's text at 2× (the 5×7 font
becomes 10×14) with the layout reflowing: bars 128 wide, wick slots 32 × 32.

**HUD opacity:** 100% by default; when the player overlaps a HUD element (e.g. stands under the minimap),
that element fades to 35% over 0.2 s.

**Auto-hide (setting, default off):** bars and slots fade out after 4 s of full health, full oil, no
combat; any change brings them back instantly.

### 11.2 Health and XP

- Bar fill `--hud-health` (a warm red `#d8433b`), background `#1a1216`, 1-cell outline `#0a0a0c`.
- **Damage trail:** lost health first turns `#ffd2a6` and drains to the new value after 0.5 s at 60% of
  bar width per second, so a big hit reads as a big hit.
- **Healing:** fills with a 1-cell bright leading edge, `--flame-gleam`.
- **Label:** `142/180` in the 5×7 font right of the bar, via `format.hp()`. Setting "Show numbers on bars"
  (default on).
- **Low health** (< 25%): the bar pulses 1.2 Hz and the screen edge gets a 12-cell red vignette at 25%
  opacity (off if "Low-health vignette" is off). Heartbeat sound is **not** used (it masks telegraph
  sounds).
- **Barrier/shield** (from charms or class): a grey-white segment appended to the right of the fill, can
  overflow the bar by up to 24 cells.
- **XP line:** 1 cell tall, `--ink-gold`, under the oil bar. Full = level up (§22). The HUD has no hover,
  so the exact XP numbers live on the Attributes screen (§16.2).

### 11.3 Oil

- Bar fill `--hud-oil` (amber-brown `#c9892f` with a 1-cell lighter top line `#f2c56b`), height 4.
- **Pending cost preview:** while `cast` is held, the part of the bar the cast will spend
  is drawn hatched (1-cell diagonal) in the flame colour. If the cast would spend more oil than you have,
  the hatch is red and the reticle turns grey (§4.1).
- **Overcharge extra** is hatched in a second colour (flame colour at 50%).
- Label `61/100` via `format.hp()`.
- **Act 4 darkness economy** (numbers in the shared oil table and 06): a small lantern glyph at the bar's left
  end shows the lantern's state: lit (flame), hooded (half flame), **guttered out** (dark with a red slash —
  the "last drop", B4: relight it at a lamp-post, a sconce, or by striking any burning cell with the pole).
  While the ambient tier is `dark`, the bar's regen tick marks stop and a thin drain line runs from the right
  end, so the player sees that oil is not coming back. When oil is < 15%, the glyph flickers and the
  pixel-font text "OIL LOW" shows for 2 s once per drop below the line.
- **Guild flask:** not on this bar; it is a belt item with 2 charges (§11.9).

### 11.4 Wick slots

Four 24 × 24 slots. Empty slots are dim frames; slots not yet unlocked are not drawn (so a new player sees
one slot, not four empty frames).

```
  ┌─────────────────────┐   ← 1-cell frame; selected slot: frame in flame colour and raised 2 cells
  │ • • •          ◯   │   ← charm pips (up to 3, top-left) · knot glyph (top-right, Act 4+)
  │                     │
  │      [flame+shape   │   ← 16×16 icon: the shape's glyph drawn in the flame colour (page 03)
  │        icon]        │     colour-blind pattern overlay if on (§27.2)
  │                     │
  │ 12             ▪▪▪▫▫│  ← oil cost (tiny 3×5 font, bottom-left) · flame burn-in pips (bottom-right, 5)
  │                ▪▫▫▫▫│  ← shape burn-in pips (bottom-right, 5)
  └─────────────────────┘
    1                        ← the key label under the slot (current binding, tiny font)
```

| Element | Rule |
|---|---|
| Icon | Shape glyph (8 glyphs, 03) tinted with the flame's colour; brightness +3% per burn-in level on either track, to match the in-world light. |
| Charm pips | One 2 × 2 pip per equipped charm, coloured by charm family (03). Unlocked-but-empty charm sockets on that wick are 1-cell hollow pips. |
| Knot glyph | Act 4+ (`on_hit`, `on_kill`). A 5 × 5 loop, lit when the knot is armed; flashes when the knot fires. |
| Oil cost | Current cost after difficulty and gear, `format.fmt` whole number; red if > current oil. |
| Cooldown | A clockwise dark sweep (50% black) over the icon from 12 o'clock; if > 1.0 s left, the seconds in the 5×7 font centred (`format.secs` without the `s`, one decimal under 10 s, whole above). A 1-frame white flash and `ui.click` at −18 dB when it comes off cooldown (setting "Cooldown ready ping"). |
| Burn-in | **Two rows of 5 pips** (R38): the upper row is this wick's **flame** track, the lower its **shape** track (03 §10; thresholds 200 / 600 / 1,500 / 3,500 oil per track). Filled = level reached. On a level-up, the slot flashes the flame colour for 0.4 s and a toast names the track: "Ember burned in — level 3" or "Bolt burned in — level 2". |
| Overcharge | From Act 2. While charging the selected wick, a bar grows up the slot's left edge; the safe line is a white tick; past it the bar is red and shakes 1 cell. |
| Mastered | Act 6: the one mastered wick (R17) has a **gold frame** instead of the grey one, and its overcharge bar never turns red. |
| Disabled | Grey with a slash (Ember underwater, silenced status, etc.) and a one-word reason in tiny font above ("WET", "SILENCED"). |
| Selection | Changing slot: slot raises 2 cells over 0.1 s, `ui.tab` at −12 dB, the lantern's light eases to the new colour over 0.15 s. |

### 11.5 Charm pips vs. charm slots

The number of charm sockets per wick is the act-gated canon count (1 from the Charmwife's Niche `a2_n06`,
2 in Act 3, 3 in Act 6; 00 §6.2); pips only show sockets that exist for this save.

### 11.6 Overcharge ring (world space)

From Act 2 (`a2_n06`). Around the lantern point: a 1-cell ring, radius 9 cells, filling clockwise from 0 to
2× cost. The safe line (03 §9.2) is a 3-cell white notch. Past the safe line the ring turns `#ff4040`, pulses
at 6 Hz, and (flash reduction off) the lantern flickers; the gutter risk is live from the first charge.
The **mastered wick** (Act 6) never turns red and holds full charge for 2.0 s (03 §9.4).

### 11.7 Status icons

- 9 × 9 pixel icons, drawn as ASCII sprites in `sprites.json` (06's art format; one per status id in 03's
  table). Buffs first (left), then debuffs, each group sorted by time left.
- Border: buff `--ink-gold`, debuff `#d8433b`, meal buff `#9fd36b`.
- A 1-cell bar under each icon shows time left. Stacks: tiny number bottom-right.
- **Hover is impossible in play**, so each status also has a 3–5 letter tag drawn to its right the first
  3 times it appears in a save (`BURN`, `CHILL`, `FROZN`, `SHOCK`, `CORR`, `SOAK`, `DRAIN`, `DIM`, `RAD`), and
  all of them are explained on pause → the Status panel (§20). Tags and effect text come from 03's status
  table; 02 draws them only.

### 11.8 Boss bar

```
                         THE SLUICEMAW · the Great Reservoir
  ▐██████████████████████████│██████████████████│░░░░░░░░░░░░░░░░░░░░▌
                             ↑ 66%              ↑ 33%     (phase ticks)
  [void-zone icon] "Plague water — do not stand in it"  (first time only)
```

| Element | Rule |
|---|---|
| Name | Pixel font 5×7 at 2× (10×14), `--ink-gold`, centred, then " · " + arena name in 1× `--ink-dim`. |
| Bar | 240 × 6, fill in the boss's own light colour (Mother Tallow amber, Saint Gnaw sickly green, Sluicemaw deep blue, the Widow violet, the Bellfather bronze, Ossery Vane storm-white). Damage trail as for the player (§11.2). |
| Phase ticks | 1 × 8 white ticks at each phase threshold from 05. Mother Tallow shows 1 tick in the campaign (2 phases) and 2 on Lampless and in Boss Rush (her third phase). Ossery's bar at the Storm's Eye (`a6_n06`) shows phases 1–3 with 2 ticks; at the Dry Eye (`a6_n09`) it returns at phase 4's starting health with its own title. A crossed tick turns dim. On a phase change, the bar flashes and the phase's title shows under it for 2.5 s (e.g. "II — The Choir Swells"). |
| Armour / shield | A second thin bar (2 cells) under the main bar when the boss has a breakable shield. |
| Enrage timer | A thin countdown line above the bar when the boss has an enrage and it is on (Lamplighter, Lampless, Boss Rush; 05, §10.1). |
| Void-zone hint | The first time each void zone type appears in a save, its icon and a ≤ 6-word hint show under the bar for 4 s. |
| Multiple bosses / adds with names | Up to 2 extra named mini-bars (120 × 3) under the main bar. |

### 11.9 Belt

Four 16 × 16 slots showing each belted consumable's icon, its satchel count (tiny font) and the bound key
under it. A belt slot whose stack ran out shows the icon at 30% with `0`. All grey while a drink animation runs.
The **Guild flask** (the shared oil table: 2 charges × 40 oil, refilled only at lamp-posts) is a belt item: its
slot shows two charge pips instead of a count, both hollow once spent, and "refill at a lamp-post" in the
pause menu's Status panel.

### 11.10 Interaction prompts (world space)

- Drawn above the object's top edge, centred: a key glyph (7 × 9 pixel keycap with the bound key's label,
  or the pad glyph) + a verb in the 5×7 font: `[E] Pull lever`, `[E] Talk`, `[E hold] Turn wheel`.
- Only the **nearest** interactable within the interact range (07: 12 cells) of the player's centre shows a
  prompt; ties broken by facing direction.
- Hold interactions draw a progress arc around the keycap.
- Refused interactions show the reason in `#ff8a7a`: `[E] Locked`, `Needs the grapple`,
  `Too dark — light it first`.
- A **Rekindle post** (a small Guild lantern at the entry of puzzle, lesson, flood and trap rooms, 07 §9.5)
  shows `[E] Rekindle this room`, or `Not while you are fighting` when a fight is live.
- Prompts fade in over 0.1 s and never overlap the player sprite (pushed up if needed).

### 11.11 Currencies

Right-aligned under the minimap: `● 1,284` pennies (`--ink-gold`), `◆ 3` pearls (`#bfe8ff`, shown only once
you have owned a pearl), Guild marks are **not** on the HUD (they belong to the profile; shown in the pause
menu and Guild Hall). Changes animate: the number counts up over 0.4 s with a `coin` sound at −10 dB.

### 11.12 Objective line

The tracked objective (story step, a quest, or a tracked class challenge) in the 5×7 font, `◇` prefix,
max 2 lines of 24 characters, right-aligned. Completing it flashes and plays `quest.complete`. Toggle in
settings.

### 11.13 Subtitles and captions (DOM)

```
                 ┌──────────────────────────────────────────────┐
                 │ MOTHER TALLOW: The wax remembers every flame  │
                 │ you ever lit.                                 │
                 │ [bell tolls, far left]                        │
                 └──────────────────────────────────────────────┘
```

- DOM box, bottom centre, max width 60% of the viewport, 2 lines per speaker line, up to 3 lines total.
- Speaker name in the speaker's colour (01's NPC palette), text in `--ink`.
- **Sound captions** (setting, default off): bracketed descriptions for important non-speech sounds with a
  direction word from the stereo pan: `[water rushing, right]`, `[the Unlit hisses, behind you]`. Every
  sfx id may have a caption line in `strings.json` (02's file, 10 §5.0); only ids with a caption are
  captioned.
- Size small/medium/large/huge (16/20/26/32 px), background opacity 0–100% (default 70%).
- Line timing: shown while the voice plays; with voice off, `max(2.0, words × 0.33) s`.
- **Subtitle log** (`U`): the last 50 lines with speaker and time.
- Voiced lines are generated through Lingo and spoken through the chosen engine (§19.4); the subtitle text
  is always the exact Lingo output.

### 11.14 Pickup toasts

- Right side, stacking downward, max 4 visible, each 3.0 s (hover-free, so fixed).
- Format: `+ Tallow Scrap ×3`. Identical pickups within 1.5 s merge into one toast and bump its count
  (`×3` → `×5`) and reset its timer.
- Colour by rarity (08's ladder: `common`, `fine`, `rare`, `relic`) with the matching loot sound (§25.5);
  pennies merge into one running toast `+ 40 pennies`.
- New wick strands (a Flame, Shape, Charm or Knot) use a larger centre toast instead: 2× pixel font, flame
  colour, "NEW CHARM — Linger" for 3.5 s, and the Satchel's Wicks tab gets its badge.

### 11.15 Damage numbers and combo counter

| Rule | Value |
|---|---|
| Font | 5×7 pixel font; crits at 2× with a 1-cell dark outline. |
| Colour | Your damage: the wick's flame colour (pole: `--ink`). Damage to you: `#ff5a4a`. Healing: `--flame-gleam`, prefixed `+`. Absorbed: grey `#9aa3ad` in brackets. Immune: the word `IMMUNE` in grey. |
| Motion | Pops up 10 cells over 0.6 s with ease-out, drifts ±4 cells sideways (seeded by hit id so it is steady), fades over the last 0.25 s. |
| Merging | Hits on the **same target from the same source** within **0.30 s** merge into one number that grows (a beam or a ring ticking reads as one rising total, not a fountain). |
| Cap | At most 24 numbers on screen; the oldest fade immediately when a 25th arrives. |
| Setting | `Damage numbers: off / merged (default) / every hit`. "Every hit" disables merging but keeps the cap. |
| Formatting | `format.hp()` — always whole numbers. |
| **Combo counter** | Your hits on any enemy that land within **1.5 s** of the previous one chain. From 5 hits up, a counter shows under the reticle-side of the player: `×12` in the 5×7 font, turning from `--ink` to `--ink-gold` at 20 and to the flame colour at 50. It is a readout only — it does not change damage. (Not to be confused with 03's flame **combos** such as `steam_burst`, which are spell reactions.) It breaks 1.5 s after the last hit, with the total shown for 1 s: `×23 — 1,410`. Setting to hide. |
| Status text | Status applications show the status tag (`BURN`, `FROZN`, `SHOCK`; §11.7) once per target per 2 s, in the status colour, 1× font. |

### 11.16 Breath and other world-space meters

- **Breath** (underwater, from Act 3): 6 bubble pips in an arc above the head; each bursts as a sixth of the
  breath goes; the last pip flashes red. 07 owns breath time. Breath does not drain while a menu is open (R74).
- **Hold-interact** arcs (§11.10), **build ghost** colour (green placeable / red refused + reason, 07),
  **grapple range**: when the hook is ready and the reticle is on a hookable surface within range, the
  reticle gets a 1-cell hook tick.

---

## 12. Minimap

### 12.1 Sizes and position

Top-right, 6 cells from the edges. `N` cycles:

| Size | Cells on screen | Default zoom |
|---|---|---|
| S | 64 × 36 | 1 map pixel = 16 world cells |
| M (default) | 96 × 54 | 1 : 8 |
| L | 128 × 72 | 1 : 8 |
| hidden | — | — |

Frame: 1-cell `--panel-edge` outline, background `rgba(8,10,14,0.72)`.

### 12.2 What it shows

| Thing | Drawn as |
|---|---|
| Explored solid terrain | `#56606e` |
| Explored open space | `#1b2029` |
| Water (live) | `#2f5fa8`, updated twice a second from the room's water levels (basins and height-field floods, 06 §8.9), so flooding a room shows on the map |
| Oil / wax / other liquids | oil `#6b4a1a`, molten wax `#d98a2a` |
| Unexplored | not drawn (transparent over the dark background) |
| Room edges | 1 map-pixel lines `#8792a2` between rooms of this node |
| Player | 3 × 3 arrow in the current flame colour, pointing the facing direction; always centred except at the node edge |
| Doors / exits | 2 × 1 marks: open `--ink`, locked `#d8433b`, needs-mechanic `#b25cff` (09 §5.3), node exit `--ink-gold` |
| Rekindle posts | 3 × 3 small brass lantern at a room's entry (07 §9.5) |
| Trial doors | 3 × 3 hourglass, teal |
| Lamp-posts | 3 × 3 lantern glyph, gold when lit/rested, dim when not yet |
| Shops / NPCs | 3 × 3 glyphs (shop coin, speech mark) |
| Great Lamp | 5 × 5 glyph, dark until relit |
| Pins and pings | the pin's icon (§13.4), 3 × 3 |
| Known secrets | a `?` only after it has been revealed (by the map reveal from The Ferry or found) |
| Enemies | **not shown** (the dark is the point). Exceptions: a boss as a 3 × 3 red pip when in the same room; the Moth Oracle's sight shows lit enemies as 1-pixel dots. |
| Objective | if the tracked objective's target is off the minimap, a 3-cell gold arrow on the rim pointing to it |

### 12.3 Fog of war

- **Room granularity:** entering a room reveals its **outline** (room edges and its exits) on both maps.
- **Cell granularity inside a room:** the room's interior is divided into **map tiles of 8 × 8 world cells**
  — the same tiles as 06's CPU light grid (1/8 resolution), so each map tile is one light-grid tile. A tile is
  revealed when its `lightTier` is `dim` or brighter, or it is **in direct line of sight within 120 cells**,
  while on screen. The reveal reads the light grid at 4 Hz, so it costs almost nothing.
- **Saved at a coarser size.** The save stores fog per room as **16 × 16-cell blocks** (a block counts as
  seen when any of its four tiles was), run-length packed; a fully seen room stores the single flag `1`.
  That keeps fog for a whole campaign under about 8 KB of the 64 KB slot budget (00 §13; the max-save test
  counts it). On reload a block shows all four tiles.
- **Act 4 darkness:** only light reveals (line of sight in an `ambientTier` dark area reveals nothing), which
  makes map reveals from The Ferry valuable there.
- Terrain changes (a wall you burned through, a frozen waterfall) update revealed tiles only when seen again.

### 12.4 Zoom

`+`/`-` step through **1 : 4, 1 : 8, 1 : 16** (map pixel : world cells). Mouse wheel over the minimap does
the same only while paused (in play the wheel changes wicks). Zoom is remembered per size.

### 12.5 Flood clock (B14)

During a **flood node** (09's `flood` type: the Melting Stair, the Spillway, the Long Drop, the Falling Flood)
and during Floodgate waves and the Long Descent's flooding rooms:

- A **rising line** is drawn up the minimap's left edge in the flood's colour (water `#2f5fa8`, molten wax
  `#d98a2a`, falling rubble `#8792a2`), showing how far the flood is up the current room: bottom of the edge =
  the room's floor, top = its highest exit.
- Under the minimap, a 7-cell strip reads the **seconds until it reaches you** (`format.secs`, whole seconds):
  `FLOOD 12s` in `--ink`, amber under 10 s, red and pulsing at 2 Hz under 5 s. With the flood above you it
  reads `UNDER` and the breath pips (§11.16) take over.
- The Long Descent's floodline shows `FLOOD: 2 rooms behind` instead until it reaches your room (09 §11.4).
- With the minimap hidden, the line and the strip still draw at the minimap's anchor.
- The seconds come from the flood's own rise rate (06 §8.9 height-field level, rows per second) and the
  player's height; nothing is estimated.

---

## 13. Full-screen map

One frame, two tabs: **Room map** (current node) and **Act map** (the branching node graph of the current
act, 09 §6). `M` opens the Room map; `M` again or `Q`/`E` switches tabs. On a gamepad the frame has a third
tab, **Journal** (§18), because View's hold is `inspect`. Pausing: yes.

### 13.1 Act map tab

```
┌─ ACT 2 — THE GUTTERWAYS ───────────────────────── [Room map] [●Act map] ────┐
│                        (⌂ The Dripmarket ✚)          ✓                        │
│                                 │                                            │
│                        (✎ Hookwright's Forge)        ✓                        │
│                                 │                                            │
│                        (✎ Pickering's Lockhouse)     ✓                        │
│                   ┌─────────────┴─────────────┐                              │
│        (⚔ The Long Chain ⌛)          (◉⚙ The Brickgut)  strand               │
│                   │                     │   ┆                                │
│                   │                     │  (? found)                         │
│                   └─────────────┬─────────────┘                              │
│                        (✎ The Charmwife's Niche ✚)  charm                     │
│                                 │                                            │
│                        (☠ The Crank Room)                                    │
│                                 │                                            │
│                        (♛ The Gutter Cathedral)                              │
│  YOU ARE HERE: The Brickgut (1/2 rooms)   Rooms cleared 7/13                 │
│  ┌ Legend ─────────────────────────────────────────────────────────────────┐ │
│  │ ⌂ hub  ✎ lesson  ⚔ fight  ⚙ puzzle  ! event  ☠ elite  ≋ flood           │ │
│  │ ✚ lamp-post  ♛ boss  ? secret  ⌛ trial door inside  ░ locked route      │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│  [Fast travel ▸] (only from a lamp-post)   [Pins]   [Legend on/off]          │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Graph | Drawn from the act's node list (09 §6; the file is 10's `acts/actN.json`). Layers run top→bottom like the descent itself (Act 6 bottom→top because it is climbed up), matching 09 §6's drawings. Edges are 2px lines; walked edges are solid gold, known-but-unwalked are dashed `--ink-dim`, **locked** edges are hatched violet with the needed mechanic's icon and name ("needs Grapple"), and a **forced** edge (Act 6 after the Storm's Eye) is a single arrow. |
| Nodes | 28px circles with one of the **10 node type** icons (09 §3: hub, lesson, fight, puzzle, event, elite, flood, lamp-post, boss, secret). States: unknown (a `·` — you know something is there because an edge leads to it), known (icon, dim), visited (icon, lit), cleared (icon + small check), current (pulsing ring in flame colour). A secret node is drawn only once found or revealed. A node holding a **trial door** carries a small `⌛` beside its icon. |
| Node tooltip | `data-tip-render="node"`: name, type, room count, cleared rooms, what it rewarded or rewards (if known), the unlock needed for locked exits, the trial door inside (if any). |
| Route reward hint | Unvisited nodes adjacent to visited ones show their reward kind as a small icon (09 §5.2: e.g. "strand", "charm", "npc", "shortcut"). |
| Great Lamp | The boss node shows the district Lamp: dark until relit, then the act's frame warms (panel tint shifts from `--panel` to `--panel-lit`). |
| Other acts | `[`/`]` (LT/RT) switches to other visited acts' graphs (read-only unless fast travel is available). |

### 13.2 Room map tab

```
┌─ THE BRICKGUT ─ a2_n05 · 3 rooms ───────────────── [●Room map] [Act map] ───┐
│ ┌───────────────┐                                                            │
│ │ ░░▓▓▓▓▓▓▓░░░░ │╶┐     (room outlines, revealed tiles, live water)           │
│ │ ░▓▓   ▸  ▓▓░ ├─┤                                                           │
│ │ ░▓▓≈≈≈≈≈≈▓▓░ │ │  ┌──────────────────┐                                      │
│ └───────────────┘ └──┤ ▓▓▓▓  ✚  ▓▓▓▓   │                                      │
│                      │ ▓▓   ◇     ▓▓▓  ├── ⚿ (locked: Sluice Key)              │
│                      └──────────────────┘                                     │
│  Zoom: [−] 1:4 [+]    Layers: ☑ water ☑ pins ☑ doors ☐ grid                    │
│  Pins: 4/30 in this act      [Add pin at cursor] [Clear all pins in act]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

- Pan with mouse drag / arrow keys / left stick; zoom 1:2, 1:4, 1:8 with wheel / `+ -` / triggers; `Home`
  recentres on the player.
- Rooms are drawn with the same fog rules as the minimap (§12.3) and the same colours, bigger.
- Hover a room: tooltip with room name, cleared/uncleared, secrets found here n/m (only the count of
  already-found ones, never "1 more"), chests opened.
- Layers toggles: water, pins, doors, a 16-cell grid, "things you have seen" (enemy types met in this room).

### 13.3 Markers and legend (both tabs)

| Marker | Icon | Colour |
|---|---|---|
| Player | arrow | flame colour |
| Lamp-post | lantern | gold lit / grey unlit |
| Great Lamp | big lantern | dark / gold after relight |
| Shop | coin | `--ink-gold` |
| NPC | speech mark | NPC colour |
| Locked door (key) | padlock | red |
| Needs mechanic | the mechanic's icon (hook, wheel, lantern-dark, gravity arrows, snowflake) | violet |
| Chest (unopened / opened) | box | gold / grey |
| Silent Bell (found & rung / found, not rung) | bell | gold / white |
| Secret (found) | `?` | white |
| Trial door | hourglass | teal |
| Boss arena | crown | red |
| Death purse (09 §8.2) | a small purse with a red ring | red, pulsing |
| Pins | player icons (below) | player colour |

### 13.4 Pins

- Up to **30 pins per act**, each: position (world cells), one of **8 icons** (star, skull, key, question,
  chest, flame, water drop, arrow), one of 6 colours, and an optional **note of up to 40 characters**.
- Add: right-click on the map or `[Add pin at cursor]`; gamepad: West (X). Edit/remove: click the pin.
- Pins show on the minimap. Setting "Show pin notes on minimap edge arrows" (default off).
- Saved per slot (`save.pins[actId][]`).

### 13.5 Fast travel

- Available only **while sitting at a lamp-post** (the lamp-post menu has a `[Fast travel]` button that
  opens the Act map in travel mode).
- Destinations: any **lit** lamp-post (one you have rested at) **in the current act**, free, instant, with a
  2 s fade and the `travel.step` sound. Other acts' lamp-posts need **The Ferry** (page 08 `shop_ferry`),
  which charges pennies or max health.
- Not available during a boss fight, a rising-water set piece, or in any mode other than Campaign.
- Travel mode highlights valid destinations in gold and greys out the rest.

---

## 14. Inventory and equipment

The **Inventory** tab of the Satchel frame. Page 08 owns every item, rarity, stack size and stat; this
section owns the screen.

```
┌ Satchel ── [●Inventory] Wicks  Skills  Attributes  Ledger  Journal ──────────────────┐
│ ┌─ Worn ──────────────────┐ ┌─ Satchel (14/20) ──────────────┐ Filter: [All▾]         │
│ │         [Hood]          │ │ [▣][▣][▣][▣][▣]                │ Sort:   [Type▾]        │
│ │ [Weapon] (figure) [Lant.]│ │ [▣][▣][▣][▣][▣]                │ ☐ Hide junk            │
│ │         [Coat]          │ │ [▣][▣][▣][▣][ ]                │                        │
│ │ [Oil flask]     [Boots] │ │ [ ][ ][ ][ ][ ]                │ [+ row at Scrapwright's]│
│ │ [Trinket 1] [Trinket 2] │ └────────────────────────────────┘                        │
│ └─────────────────────────┘ Belt: [Z ▣ 4] [X ▣ 2] [C ▣ 7] [V ─]                         │
│ ┌─ Summary ──────────────┐  Key ring (3) ▸   Strand Case (14) ▸   Scrap Sack (212) ▸   │
│ │ Health 180  Oil 100     │                                                            │
│ │ Armour 22   Wick +14%   │  ● 1,284 pennies   ◆ 3 pearls                              │
│ │ Crit 8%  Oil regen 4/s  │                                                            │
│ └─────────────────────────┘  [Enter] Equip/Use  [X] Junk  [Del] Drop  [F] Belt  [Shift] Compare │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### 14.1 Slots, not weight (08-ITEMS-SHOPS.md §2 owns the numbers)

- **Satchel: 5 columns × 4 rows = 20 slots** at the start; each Scrapwright upgrade adds a row, max 35
  (the grid grows downward and the panel scrolls past row 5). Every item takes one slot.
- **No weight system.** Might does not limit carrying (see §29 for what "carry" means instead).
- **Stacking** per 08: consumables 10, materials/scrap 99, strands 5, keys never, gear never. Stack count in
  the cell's corner.
- **Belt:** 4 quick slots (`Z` `X` `C` `V`, §2.2) that point at satchel stacks; they hold nothing of their
  own. Shown under the grid and on the HUD (§11.9).
- **Key ring**, **Strand Case** (learned strands, 03 §15.3) and the **Scrap Sack** overflow are separate
  lists opened by the three links under the belt; none cost satchel slots.
- **Full satchel:** a pickup that does not fit stays on the ground glowing (08 §2.2) with the toast
  "Satchel full" in `--bad`.

### 14.2 Gear slots (paper doll; 08 §3)

| Slot (id) | Holds |
|---|---|
| `weapon` | the class weapon family (pole lantern, hook-staff, wrench, oar-staff, maul, anchor-blade, moth-lamp, brush-spear); off-class weapons show "−20% damage (not your family)" in the card |
| `lantern` | light radius, oil burn in darkness, Wick power % |
| `hood` | head |
| `coat` | body (the biggest armour) |
| `boots` | move / jump / swim |
| `trinket1`, `trinket2` | trinkets; the same unique cannot sit in both (the drop is refused with that reason) |
| `oil_flask` | reserve oil; a small fill bar on the slot shows the reserve |

The figure in the middle is the real player sprite at 6×, re-rendered live as gear changes (hood shape,
coat colour, lantern colour = wick 1's flame).

### 14.3 Item cells and tooltips

- Cell 40 × 40 px (DOM), 1px border in rarity colour, icon drawn from the item's pixel-art bitmap at 3×.
- Stack count bottom-right (Spectral 12px bold), new-item dot top-left (cleared on hover).
- Tooltip: `data-tip-render="item"` with `data-tip-item="<instance id>"` (not `data-item-id`; one attribute
  name for every renderer). Card: name (rarity colour), type, item level, stats, flame affinity, set/quirk
  text, sell price, flavour line in italic.

### 14.4 Compare tooltips

- Hovering a gear item shows **its card and the card of the item in that slot side by side** (worn on the
  right, labelled "Worn"). Trinkets compare against the weaker of the two worn trinkets.
- **Deltas** on the hovered card: each stat line gets `+4` green / `−2` red / `=` grey against worn, via
  `format.sign()`. Stats only on one side show as full gain/loss.
- Summary line at the bottom: "Health +12 · Wick power −3% · Oil regen +0.4/s" — the *derived* totals from
  the character sheet computed as if equipped (page 04 formulas), not just the item's own lines.
- Holding `Shift` (gamepad North) swaps what it compares against (second trinket; or pinned compare).
  The card updates in place with `refreshTip()` from `shared/tooltip.js`.

### 14.5 Actions

| Action | Mouse | Keyboard | Pad |
|---|---|---|---|
| Equip / use | double-click, or drag to slot | `Enter` | South |
| Unequip | drag to pack, or double-click worn | `Enter` on worn | South |
| Drop | drag outside the frame, or `[Drop]` | `Delete` | hold West 0.5 s |
| Split stack | `Shift`+drag | `S` then arrows for the amount | click L3 |
| Assign to belt | drag onto a belt slot | `F` ("fasten"): each press moves it to the next belt slot 1 → 2 → 3 → 4 → off | North + D-pad direction |
| Mark as junk (08 §2.4) | `Alt`+click (within menus Alt is safe) | `X` | West |
| Sort | Sort dropdown: Type, Rarity, Newest, Value | | |
| Filter | All, Gear, Consumables, Quest, Junk | | |

Selling junk in bulk is a shop action (§23.1).

---

## 15. The Wick builder

The **Wicks** tab of the Satchel. It is the main progression screen (canon pillar 3), so it gets the most
space. Page 03 owns every number the readouts show; this section owns the screen and its sandbox.

### 15.1 When it can open

- `B` opens the Wicks tab anywhere **out of combat** (no hostile within 160 cells that has noticed you, not
  in a boss arena, not in a rising-water set piece). Refused otherwise with the toast "Not with enemies near".
- **Away from a lamp-post** the tab opens in **swap mode** (03-SPELLS.md §15.1): you can equip saved wicks
  into slots, read every number and run the test chamber, but the strand sockets are locked with the note
  "Braid at a lamp-post or Lamp shrine".
- **At a lamp-post or Lamp shrine** (lamp-post menu → `[Braid wicks]`, or `B` while sitting) the tab opens in
  **braid mode** and everything is editable.
- Burn-in belongs to the **core** (Flame + Shape, 03 §10): changing charms or the knot keeps it; changing the
  flame or shape switches to that core's own saved burn-in. The builder shows the core's level beside the
  Flame and Shape sockets so the player sees this before they drop a new strand.

### 15.2 Layout

```
┌ Satchel ── Inventory [●Wicks] Skills Attributes Ledger Journal ─────────────────────────────────┐
│┌─ Strands ─────────────┐┌─ The braid ─────────────────────────────┐┌─ Test chamber ───────────┐│
││[Flames][Shapes][Charms]││   Name: [ Ember Bolt______ ] ✎ 🔒        ││ ┌──────────────────────┐ ││
││[Knots]    Search: [__] ││                                          ││ │ rain · dummy · pool  │ ││
││                        ││      ╭──FLAME──╮   ╭──SHAPE──╮            ││ │   ▸ (you)     ☺ dummy│ ││
││ ◉ Ember      amber     ││      │  ◉ ember│ ═ │  ➶ bolt │            ││ │ ▒▒ wood  ≈≈ water    │ ││
││ ◉ Rime       cyan      ││      ╰─────────╯   ╰─────────╯            ││ │ ▓ brick  ░ oil  ▲ice │ ││
││ ◉ Spark      yellow    ││           ║ braided strands ║             ││ └──────────────────────┘ ││
││ ◉ Gleam      gold      ││   ╭CHARM 1╮ ╭CHARM 2╮ ╭CHARM 3╮ ╭─KNOT─╮  ││ Target: [Dummy ▾]         ││
││ ◌ Bile   (Act 2)       ││   │ split │ │  ···  │ │ 🔒 A6 │ │🔒 A4 │  ││ [▶ Auto-cast] [■] [Reset] ││
││ ◌ Tide   (Act 3)       ││   ╰───────╯ ╰───────╯ ╰───────╯ ╰──────╯  ││ Materials: [Mixed ▾]      ││
││ ◌ Shade  (Act 4)       ││                                          ││                          ││
││                        ││ ┌ Readout ─────────────────────────────┐ ││ Measured (last 10 s):     ││
││ drag a strand onto a   ││ │ Oil per cast   14    (+2 from Split)  │ ││  DPS on dummy   38.4      ││
││ socket, or focus it    ││ │ Cast time      0.25s  Cooldown 0.60s  │ ││  Hits          21         ││
││ and press Enter        ││ │ Damage / hit   9–11 ×3 bolts          │ ││  Damage / oil  2.74       ││
││                        ││ │ Expected DPS   41.0                   │ ││  Burn uptime   62%        ││
││                        ││ │ Damage / oil   2.9                    │ ││  Cells burned  412        ││
││                        ││ │ Light radius   44 cells  amber        │ ││                          ││
││                        ││ │ Overcharge: safe to 1.4× · +45%       │ ││                          ││
││                        ││ │ Effects: burn 3/s 3s · ignites oil    │ ││                          ││
││                        ││ │ ⚠ 1.62× median damage/oil (see note)   │ ││                          ││
││                        ││ └───────────────────────────────────────┘ ││                          ││
│└────────────────────────┘└──────────────────────────────────────────┘└──────────────────────────┘│
│┌─ Your wicks (9/24) ────────────────────────────────────────────────────────────────────────────┐│
││ [1●Ember Bolt ▪▪▪][2●Gleam Ring ▪][3○—][4○—] | Saved: [Rime Arc 🔒][Spark Chain][Tide Lob]… ││
││ [Save as new] [Save] [Duplicate] [Delete] [Equip to 1 2 3 4]   Sort: [Recent ▾]              ││
│└────────────────────────────────────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 15.3 Building a wick

| Element | Rule |
|---|---|
| Strand list | 4 tabs (Flames, Shapes, Charms, Knots; Knots tab appears at Act 4). Each strand row: icon in its colour, name, a one-line effect summary. **Owned** strands are lit; **known-but-not-owned** ones (seen in a shop or on the canon list for acts reached) are dim with "Sold at Wick & Tallow" or "Act 3" as the reason; strands of acts not yet reached are **not listed at all** (the pool grows slowly, per the verdict). |
| Sockets | Flame (1), Shape (1), Charm 1–3 (locked sockets show a padlock and the act that opens them: "A2", "A3", "A6"), Knot (Act 4+). |
| Drag and drop | Pointer events (works for mouse and touch). Drop a strand onto a matching socket; dropping on the wrong kind snaps back with `ui.error` and "That's a Charm; drop it on a charm socket". Drag a socket's strand out to empty it. |
| Keyboard / pad | Focus a strand, `Enter` → the socket of its kind lights; arrows pick which (for charms), `Enter` places. `Delete` / West empties the focused socket. |
| Braid animation | When both Flame and Shape are set, the two sockets are joined by a braided rope drawn in both colours; each charm adds a thin strand twisting in (pure CSS/SVG, 60 fps, off with reduced motion). Sound on each placement: `ui.click`; completing a valid wick: the flame's `spell.<element>.launch` at −14 dB (§25.5 maps flames to elements). |
| Conflicts | Page 03's rule table (e.g. two travel charms that cannot coexist). A conflicting drop is allowed but the socket turns red, the readout says why, and Save is disabled until fixed. |
| Name | Auto-named by 03 §16.2's rule (`<Flame> <Shape>`, plus ` of the <noun>` with 2+ charms: "Ember Bolt of the Choir") until renamed. Rename: 1–24 characters. At burn-in 5, Odile Pennywax's Lingo name (her shop quirk) is offered as a chip `Odile calls it: "Candlewick Hail"` that you can click to accept. |
| Lock 🔒 | A locked wick cannot be edited, overwritten or deleted. Unlock with one click. |

### 15.4 The test chamber (sandbox)

- A **160 × 90-cell** chamber drawn at 2× inside the panel (320 × 180 CSS px at 1×, scales with the panel).
  It is a separate, tiny instance of the real cell simulation and renderer (page 06), so what you see is
  exactly what the wick does in the world — including light, rain and reflections.
- **Contents** (`data/rooms/sandbox_*.json`, picked by the Materials dropdown):

| Preset (id) | What is in it |
|---|---|
| `sandbox_mixed` (default) | stone floor, a training dummy at 110 cells from you, a 30 × 12 water pool, a wood crate stack, a brick pillar, a 20-cell oil puddle, an ice slab, a hanging rope |
| `sandbox_flooded` | the floor under 20 cells of water (test Spark in water, Tide) |
| `sandbox_dark` | Act 4 darkness, an Unlit dummy that flinches from light (reached Act 4 only) |
| `sandbox_crowd` | 5 dummies in a spread (split, chain, ring) |
| `sandbox_air` | a flying dummy bobbing on a sine path (seek, lob) |
| `sandbox_boss` | a large armoured dummy (armour, corrosion, shield break) |

- **Dummy** (`dummy_training`): 03 §16.1's dummy loops a cast every 2 s and resets. For the Measured column
  the chamber swaps in an unkillable variant: 10,000 health that refills after 3 s of no damage, armour 0 by
  default; target dropdown: Dummy (0 armour), Armoured (40), Unlit (weak to light), Swarm (5 × 60 health,
  respawning), Flying.
- **Controls** (context `sandbox`): with the mouse over the chamber, `cast` and `overcharge` fire the wick
  from the chamber's player with aim at the mouse; `1`–`4` swap equipped wicks for side-by-side testing.
  `[▶ Auto-cast]` casts the wick at the dummy every cooldown (or holds a beam) so the numbers fill on their
  own. `[Reset]` rebuilds the chamber (restores burned wood, refills water).
- **Oil** in the chamber is unlimited but **counted**, so damage per oil is real.
- **Performance:** the chamber sim is capped at 160 × 90 = 14,400 cells and runs at 60 fps only while the
  Wicks tab is visible. Fallback if the frame budget is exceeded: drop the chamber to 30 fps and turn its
  rain off (a note says so).

### 15.5 Readouts

Two columns: **Expected** (computed from page 03 formulas at your current stats and gear) and **Measured**
(recorded in the chamber over a rolling 10 s window, through a private `Meter` instance from `meters/`).

| Readout | Source | Format |
|---|---|---|
| Oil per cast | page 03 cost formula; the breakdown by strand in the tooltip ("Bolt 8 + Ember ×1.25 + Split +2 = 12") | `fmt`, whole |
| Cast time / cooldown | page 03 | `secs` |
| Damage per hit | min–max after Wick attribute and gear; multi-projectile shapes say "×3 bolts" | `range` |
| Expected DPS | per-hit × hits/s at 100% hit rate on the dummy, including DoT | `fmt` (2 decimals max) |
| Damage per oil | expected damage per cast ÷ oil per cast | `fmt` |
| Light radius and colour | page 06 light numbers | whole cells + colour swatch |
| Overcharge | safe line (× cost) and max bonus at that line | "safe to 1.4× · +45%" |
| Effects | status, terrain interactions (page 03's material table rows that apply, e.g. "ignites oil", "freezes water") | short phrases |
| Burn-in | level and uses to next | pips + "142 / 300 casts" |
| Balance flag | the page-03/10 headless ranking: if this wick's damage/oil is over 1.5× the median of all wicks available at this act, a small `⚠` note: "Strong for Act 2 — enjoy it". Informational only; a player-facing brag, and a debugging aid. | |
| **Measured** | DPS, hits, damage/oil, crit rate, status uptime, cells changed (burned, frozen, dissolved) | same formats |

### 15.6 Your wicks (library)

- Up to **24 saved wicks** per save (+2 from the First Flame trial, 09 §14).
- The strip shows equipped slots first (`1`–`4`, filled dot), then the saved list. Each chip: flame colour
  swatch, name, burn-in pips, a lock icon if locked.
- Buttons: **Save** (overwrite the selected unlocked wick), **Save as new**, **Duplicate**, **Delete**
  (confirm, refused if locked), **Equip to 1/2/3/4** (or drag a chip onto a slot in the strip).
- Sort: Recent, Name, Flame, Burn-in.
- Burn-in belongs to the core (Flame + Shape), not the slot or the saved wick: two saved wicks with the same
  core share one burn-in level (03 §10).
- Export a wick as a short code (base64 of its JSON, `LF1-…`) to share or paste back in: `[Copy code]` /
  `[Paste code]` — refused if it uses strands you do not own ("You have not found Linger yet").

---

## 16. Skill board and attribute screen

Page 04 owns the classes' boards, attributes and formulas.

### 16.1 Skill board (`K`, Skills tab)

```
┌ Satchel ── Inventory Wicks [●Skills] Attributes Ledger Journal ───────────────────────┐
│ Skill points: 2                         Class: Lamplighter  Level 9                    │
│ ┌──────────────────────────────────────────────────────────────┐ ┌─ Selected ────────┐ │
│ │        (a board of hex/diamond nodes, 5 columns × 7 rows,     │ │ Steady Hands      │ │
│ │         wired; three branches per class named by page 04)     │ │ Rank 1 / 3        │ │
│ │   ◇───◆───◇         ◆ taken   ◇ available   · locked          │ │ Overcharge safe   │ │
│ │   │   │   │         ✦ keystone (one per branch)               │ │ line +0.1× per    │ │
│ │   ·───◇───·                                                   │ │ rank.             │ │
│ │       │                                                       │ │ Next: +0.2×       │ │
│ │       ✦                                                       │ │ Requires: 2 points│ │
│ └──────────────────────────────────────────────────────────────┘ │ in "Wickcraft"    │ │
│ Branches: Wickcraft 5 · Pole 2 · Lamplight 0                      │ [Take rank ▸]     │ │
│                                                                    └───────────────────┘ │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- Nodes: 24px, taken = filled gold, available = gold outline, locked = grey dot. Wires light between taken
  nodes. Keystones are larger (36px) star shapes.
- Select a node → the side panel shows name, rank x/y, what the next rank does (**generated from the numbers**
  on the node, not free text, so the text cannot lie — the Farhold lesson), the requirement, and `[Take rank]`.
- Taking a rank asks no confirmation but can be undone until the screen closes (`[Undo]` in the footer;
  changes commit on close). Undo after that is a paid **respec** at The Ferry (page 08).
- Pan/zoom as for the map if the board is larger than the panel.

### 16.2 Attributes (`P`, Attributes tab)

```
┌ Satchel ── Inventory Wicks Skills [●Attributes] Ledger Journal ───────────────────────┐
│  WREN — Lamplighter, Level 9     XP 4,120 / 5,300  ▰▰▰▰▰▰▰▰▱▱                           │
│  Points to spend: 3                                                                   │
│  ┌──────────────┬────┬──────┬──────────────────────────────────────────────┐          │
│  │ Might        │ 12 │ [−][+]│ Pole damage +24% · knockback +12 · flasks 5   │          │
│  │ Wick         │ 21 │ [−][+]│ Spell power +42%                              │          │
│  │ Draught      │ 15 │ [−][+]│ Max oil 130 · oil regen 4.5/s                 │          │
│  │ Nerve        │ 10 │ [−][+]│ Max health 180 · stagger resist 20%           │          │
│  │ Knack        │ 11 │ [−][+]│ Crit 8% · build speed +11% · loot find +11%   │          │
│  └──────────────┴────┴──────┴──────────────────────────────────────────────┘          │
│  Pending: Wick +2, Nerve +1   → Max health 180 → 188 · Spell power 42% → 46%          │
│  [Reset pending]  [Confirm]                                                           │
│  ┌ Derived ────────────────────────────────────────────────────────────────┐          │
│  │ Health 180 · Oil 130 · Oil regen 4.5/s · Armour 22 · Crit 8% · Crit dmg 150% │     │
│  │ Move 60/95 cells/s · Jump 34 cells · Breath 12s · Light radius 44 · …      │     │
│  └─────────────────────────────────────────────────────────────────────────────┘      │
│  Totals: Deaths 7 · Play time 2h 05m · Rooms 58 · Wicks cast 3,410                   │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- `+` / `−` stage points (`−` only removes points staged this visit). Confirm commits (`levelup` sound at
  −8 dB). Numbers on the right are computed by the page 04 formulas with the staged values.
- Every derived stat has a `data-tip` explaining its sources ("Oil regen 4.5/s = 3.0 base + Draught 15 ×
  0.1"). No stat without a tooltip.

---

## 17. The Ledger

The **Ledger** tab: the `meters/` component (`renderMeter(meter, el, state)`) inside our frame, styled by
`css/ledger.css` over `METER_CSS`.

### 17.1 What feeds it

- The game keeps **one `Meter`** per save, and calls `startFight(roomId)` on room entry and `endFight()` on
  room exit (so a "fight" is a **room**).
- Every hit records `source: 'player'`, `via: 'wick:<savedWickId>'` with `viaName` the wick's name (so
  **each wick is a source**, canon), `pole` swings as `via: 'attack'`, traps/planks you built as
  `via: 'build:<part>'`, environmental kills you caused (dropped a crate, flooded a room) as
  `via: 'env:<kind>'`, knot follow-ups as `via: 'knot:<wickId>'`. `dtype` = the flame id (`ember`, `rime`,
  `spark`, `bile`, `gleam`, `tide`, `shade`) or `physical`. `itemId` = the pole or lantern responsible.
- Summons (Ferrywitch Oarsmen, Tinker turrets) are their own actors in the meter.

### 17.2 Modes (the meter's six + ours)

| Mode | From | Shows |
|---|---|---|
| Damage done | meters | bars per actor → sources (each wick) → hits |
| Healing | meters | Gleam heals, siphon, lifesteal |
| Damage taken | meters | by attacker source; dodged / blocked / absorbed split |
| Absorbs | meters | barriers |
| Statuses | meters | who applied what, uptime |
| Deaths | meters | your deaths with the last 5 hits before each |
| **Oil** (ours) | a small tally beside the meter (`js/ui/oil-ledger.js`) | oil spent per wick, damage per oil, overcharge oil and gutter bursts |
| **Terrain** (ours) | same | cells changed per wick: burned, melted, frozen, dissolved, water moved, planks placed |
| **Light** (ours) | same | seconds each flame colour was your lantern light; Great Lamp and lamp-posts lit |

The three new modes are rendered by our own small table component in the same visual style; the meter's
own `report(mode, scope)` does not need to change.

### 17.3 Scope

`This room · This node · This act · Whole run` (the meter's `fight`/`all` plus two groupings we build by
filtering fights by `nodeId`/`actId` stored in the fight's label, `"act2/n2_3/room1"`).

### 17.4 Layout

```
┌ Satchel ── … [●Ledger] Journal ──────────────────────────────────────────────────────┐
│ Mode: [Damage▾]  Scope: [This node▾]   Summary: 3 rooms · 1m 42s · 0 deaths          │
│ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
│ │ Wren          ██████████████████████████████████████  2,410 (88%) 23.6/s  ▁▃▅▇▅▃ │ │
│ │ Tinker turret ████                                        330 (12%)  3.2/s  ▁▁▂▂▁ │ │
│ └──────────────────────────────────────────────────────────────────────────────────┘ │
│ click a bar → sources: Ember Bolt 1,420 · Gleam Ring 610 · Pole 380 …                │
│ click a source → every hit with time, target, crit, overkill, flame                  │
│ Per-item: "Pole lantern of the Stair — 41 kills"                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Retention: the meter keeps the last 2,000 records per fight (its own rule); the run keeps the last
**200 rooms** of fights, older ones merged into per-act totals so the save stays small.

---

## 18. Journal, bestiary, codex

The **Journal** tab; sub-tabs switch with `[`/`]` (LT/RT).

| Sub-tab | Contents |
|---|---|
| **Story** | Current objective at the top; a timeline of story beats reached (page 01) as short entries dated by in-game day and act. |
| **Quests** | Active / done lists (page 01/08 own quests). Each: giver, place, steps with checkboxes, reward. `[Track]` sets the HUD objective. Keyring (keys and quest items) at the bottom. |
| **Bestiary** | Every monster met (page 05 ids): sprite at 4× animated idle, name, family, where met, kills. **Knowledge ranks** reveal lines by kills: 1 kill → description; 5 → health & armour; 15 → flame weaknesses/resistances as a 7-flame row of icons (✔ weak / — normal / ✖ resists / ☐ immune); 30 → drops; 50 → a lore line and the "Studied" gold border. Bosses: phases seen, your best time, deaths to it. Unmet monsters are a silhouette with "???" only if another entry mentions them. |
| **Codex** | Lore pages found in the world (page 01), grouped by district; unread ones have a gold dot. Material pages: every material you have seen with the flame interactions you have witnessed (a 7-column grid that fills in as you see e.g. Ember hit oil → "ignites"). This is how the physics rules get taught. |
| **People** | NPCs met (page 01): portrait, name, where, disposition (Lingo relations: a word, not a number, "warm", "wary"), last thing they said to you. |
| **Lamps** | The six Great Lamps: dark/relit, date relit, the district palette swatch before/after. Lamp-posts per act found/lit. |
| **Challenges** | Class unlock challenges with the same progress lines as §9.1, Trials cleared with best times, Silent Bells 12-pip row. |
| **Achievements** | Profile-wide (09 §16): name, how, date earned; hidden ones show "???" until earned. |

---

## 19. Settings

A full screen from the title or the pause menu. Left: category list. Right: rows. Every row has a
`data-tip` explaining what it does and its performance cost. Changes apply live; `[Revert]` restores the
values from when the screen opened. Saved to the profile (`store.js` key `settings`).

### 19.1 Video

| Setting (id) | Options | Default | Notes |
|---|---|---|---|
| `scale` | Auto (largest integer), ×1, ×2, ×3, ×4, ×5, ×6 | Auto | Integer scaling only; letterbox colour `#050608`. |
| `fullscreen` | on/off | off | `requestFullscreen` on the game wrapper. |
| `vsync_cap` | 30 / 60 / uncapped render | 60 | The sim is always a fixed 60 steps/s (page 06/10); this caps drawing. |
| `rain_density` | Off, Light (25%), Medium (50%), Heavy (100%) | Heavy | Both rain layers. Off still keeps puddles and wet sheen. Act 6 after the Rain stops ignores it. |
| `reflection_quality` | Off, Low (half-res, no ripple), Medium (full-res, ripple), High (full-res, ripple + wet-ground sheen) | Medium | Page 06 owns the passes. |
| `bloom` | Off, Low, High | Low | |
| `light_quality` | Low (light buffer at 1/4 res, 32 lights), Medium (1/2 res, 64 lights), High (full res, 128 lights, soft shadows) | Medium | Page 06. |
| `particles` | Low / Medium / High | Medium | Sparks, embers, spray caps (page 06). |
| `screen_shake` | 0–100% in 10% steps | 70% | 0 also removes camera kicks on casts. |
| `flash_reduction` | on/off | off | Caps full-screen brightness change to 10% per frame, no strobing (spark chains, bell tolls, lightning in Act 6 become soft fades), no lantern flicker. |
| `camera_lookahead` | 0 / 40 / 80 cells | 40 | How far the camera leads in the facing direction. |
| `perf_auto` | on/off | on | If frame time exceeds 20 ms for 3 s, step down rain → reflections → light quality one notch each, with a toast saying which. |
| `show_fps` | on/off | off | Same as F3's first line. |

### 19.2 Audio

The sfx engine has three buses (`sfx`, `ui`, `ambience`) plus master; Lanternfall adds **`music`** and
**`voice`** as two more gain nodes before the master limiter (built in our audio wrapper, not by editing
`sfx/`).

| Setting | Range | Default |
|---|---|---|
| Master | 0–100% | 80% |
| Music | 0–100% | 60% |
| Effects (`sfx` bus) | 0–100% | 80% |
| Interface (`ui` bus) | 0–100% | 60% |
| Ambience (`ambience` bus, rain lives here) | 0–100% (still capped by sfx's 0.6 ceiling) | 70% |
| Voices (`voice` bus) | 0–100% | 90% |
| Sound method | synth / library / hybrid / retro (from `sfx/`) | hybrid |
| Mute when the tab is hidden | on/off | on |
| Mono audio | on/off | off |
| Dynamic range | Full / Night (compressed: quieter loud sounds) | Full |
| Cooldown ready ping | on/off | on |

### 19.3 Voices

| Setting | Options | Default |
|---|---|---|
| Voice engine | Formant (ours, default), espeak, Piper, Browser speech, Babble only, Off (text only) | Formant |
| Voice volume | see Audio | |
| Babble for creatures | on/off (rats and moths speak `babble`) | on |
| Narrator | on/off | on |
| Speech speed | 0.75× – 1.5× | 1.0× |
| Piper voice download | shows size and a `[Download]` button; Piper only works once downloaded | — |

Page 01 assigns each NPC a voice from `shared/voices.js` (`voiceFor({ role, gender, seed })`).

### 19.4 Subtitles and text

| Setting | Options | Default |
|---|---|---|
| Subtitles | on/off | on |
| Sound captions | on/off | off |
| Subtitle size | small / medium / large / huge | medium |
| Subtitle background | 0–100% | 70% |
| Speaker names | on/off | on |
| Menu text size | 90% / 100% / 125% / 150% / 200% (rem scaling on the DOM layer) | 100% |
| HUD text size | 1× / 2× (§11.1) | 1× |
| Damage numbers | off / merged / every hit | merged |
| Combo counter | on/off | on |
| Lesson hints | on/off | on |
| Language debug mode (from `shared/langdebug.js`) | on/off | off (hidden unless `?debug=1`) |

### 19.5 Controls

The rebind screen (§5.2) for keyboard/mouse and gamepad, plus: mouse sensitivity (pointer lock only),
wheel direction, gamepad dead zones (left/right), rumble strength, button glyphs (letters / shapes /
numbers / auto), "Run by stick push", "Always run", "Aim with keys" (§4.2).

### 19.6 Accessibility

| Setting (id) | Options | Default | What it does |
|---|---|---|---|
| `flame_patterns` | on/off | off | Colour-blind **flame patterns** (§27.2) on projectiles, lights' rims, HUD icons, damage numbers. |
| `colour_filter` | none / red-weak / green-weak / blue-weak | none | Shifts the 7 flame colours to a set that stays distinct for that type (table §27.2). Does not recolour the world ramp. |
| `hold_to_toggle` | per action: run, overcharge, grapple, crouch, climb, build mode (already toggle), tool wheel | all hold | |
| `aim_assist_pad` | 0–3 | 1 | §4.3 |
| `aim_assist_mouse` | 0–3 | 0 | |
| `slow_mode` | 100% / 85% / 70% / 50% game speed | 100% | Scales the fixed timestep's game-time per step (the sim still steps 60/s; each step advances less game time). Achievements and scores are not blocked; Trials and Daily Wick record "slow mode" on the score. |
| `telegraph_boost` | on/off | off | Doubles telegraph outline thickness and adds a white inner line to every void zone rim. |
| `high_contrast_hud` | on/off | off | 2-cell black outline round every HUD element and prompt. |
| `reduce_motion` | on/off | off | No menu animations, no braid animation, no screen-transition slides; rain streaks drawn shorter. |
| `keep_mouse_in_window` | on/off | off | Pointer lock (§4.1). |
| `low_health_vignette` | on/off | on | §11.2 |
| `auto_hide_hud` | on/off | off | §11.1 |
| `dyslexia_font` | on/off | off | Menus use `Atkinson Hyperlegible` (Google Fonts, OFL) instead of Spectral. The pixel font is unchanged. |
| `pause_on_focus_loss` | on/off | on | Pauses when the tab or window loses focus. |

### 19.7 Gameplay

Difficulty (only via lamp-posts, shown read-only here with the reason), camera lookahead, "Aim guides"
(lob arcs and bolt lines always on), minimap size and zoom default, objective line on/off, auto-pickup
pennies (on), auto-pickup items (off / common only / all).

### 19.8 Data

Export profile, import profile, export all slots, "Delete everything" (type `LANTERNFALL` to confirm),
storage used (bytes, via `format.fmt`).

---

## 20. Pause menu

```
┌──────────────────────────── PAUSED ────────────────────────────┐
│  Act 3 — The Sluice Ward · Node: Cistern Row (2/3 rooms)      │
│  Seed 48213977 · Lamplighter difficulty · 3h 41m                │
│                                                                 │
│   ▸ Resume                                                      │
│     Satchel (Inventory · Wicks · Skills · …)                    │
│     Map                                                         │
│     Status panel   (what every icon on you means right now)     │
│     Controls                                                    │
│     Settings                                                    │
│     Return to last lamp-post   (costs what dying costs, §21)    │
│     Save and quit to title                                      │
│                                                                 │
│   ◆ Guild marks: 34      Tracked: Relight the Sluice Lamp      │
└─────────────────────────────────────────────────────────────────┘
```

- Opens with `Esc`/Menu; the world is dimmed to 40% and desaturated behind it (a shader uniform, not a blur).
- **Status panel:** every active status with icon, name, source, time left, and exact effect text.
- **Return to last lamp-post:** the "I am stuck" button; applies the death penalty (09 §8.2) minus the
  death count, after a confirm.
- **Save and quit:** saves only if at a lamp-post; elsewhere it says "Progress since your last lamp-post
  (12m ago) will be kept only up to that lamp-post" and asks to confirm. (Quitting mid-room restores you
  at the last lamp-post — a room is never saved half-done.)
- Iron Wick saves: "Save and quit" suspends the game at the current spot instead (a one-time resume save
  that is deleted on load, so quitting is not a way round death).

---

## 21. Death screen and recap

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           THE LAMP GUTTERS                                    │
│          (the last frame, frozen, fading to the drowned palette)              │
│                                                                              │
│   Killed by  Rat Chorister (elite: Plagued, Swift)  with "Choir Note" (spark) │
│   in         Culvert Crossing, room 2 · after 3m 12s in the room              │
│                                                                              │
│   Last 5 hits taken:      Your best wick this room:                          │
│    −22 Choir Note           Ember Bolt — 410 dmg, 38% of yours                │
│    −9  Plague puddle        Damage dealt 1,080 · taken 196 · healed 44         │
│    −9  Plague puddle        Oil spent 142 · overcharged 2× · guttered 0×       │
│    −31 Rat Swarm                                                             │
│    −14 Choir Note         Tip: "Rime freezes plague puddles solid."           │
│                                                                              │
│   Lost: 77 pennies (25%) — left in a purse where you fell (pick it back up)  │
│   Kept: all XP, items, wicks, strands                                        │
│                                                                              │
│      [Rekindle at Choir Lamp-post ▸]   [Ledger for this room]   [Quit]       │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Title | Random pick from 6 lines in `data/ui/death-titles.json` ("THE LAMP GUTTERS", "SNUFFED", "THE WATER TAKES YOU" if drowned, "LOST TO THE DARK" if killed by an Unlit in darkness…), chosen by cause. |
| Killer line | Killer's name with elite affixes, the attack's name and flame; environment deaths name the thing ("Drowned in the Sluice Ward", "Crushed by a falling bell"). |
| Last 5 hits | From the meter's Deaths mode. |
| Room recap | From the meter scoped to this room: best wick by damage, totals. |
| Tip | One tip from `data/ui/tips.json`, chosen by cause tag (drowned, burned, boss id, void zone, fall). Never the same tip twice in a row. |
| Losses | 09 §8.2 decides what is lost; this screen says it plainly with numbers. |
| Rekindle | Respawn at the last lamp-post rested at. 1.5 s fade. The death count goes up. |
| Iron Wick | Title "THE LAMP IS OUT"; buttons `[To the Hall of Snuffed Wicks]` and `[Title]`. |
| Modes | Floodgate/Long Descent/Daily/Boss Rush/Trials show their own end screen instead (page 09). |
| Sound | Music cuts; `death.humanoid` for you, then 1.5 s of rain only (`ambience.void` at −6 dB). |

---

## 22. Level-up popup

Not a pause. A centred banner in the play layer for 2.5 s, then a small reminder.

```
            ╔══════════════════════════════╗
            ║        LEVEL 10              ║   (2× pixel font, gold, rising 8 cells)
            ║  +3 attribute points          ║
            ║  +1 skill point               ║
            ║  Max health +6 · Max oil +4   ║   (the automatic per-level gains, page 04)
            ╚══════════════════════════════╝
```

- Sound `levelup`; a ring of gold light expands from the player (a light event, not a damage ring).
- Heals **nothing** (so a level-up never saves a fight by surprise; page 04 may change this).
- After the banner: the Satchel tab rail gets badges on Attributes and Skills, and a tiny HUD reminder
  under the XP line `▲3 ◆1` (points, skill points) stays until they are spent.
- New unlocks at that level (a class feature, a new board row) are listed on the banner as a 4th line.
- Multiple levels at once show one banner "LEVEL 10 → 12" with summed points.

---

## 23. Shop screens

### 23.1 Generic shop frame

Opened from a shopkeeper's dialogue (§24) with `[Trade]`. The world is paused.

```
┌─ WICK & TALLOW — Odile Pennywax ──────────────────────────────── ● 1,284 ◆ 3 ─┐
│ ┌portrait┐ "Mind the drips, love. Everything's cheaper since the Crown Lamp's │
│ │ 64×64  │  back on."                                (Lingo line, voiced)    │
│ └────────┘                                                                   │
│ [●Buy]  [Sell]  [Buyback]  [Quirk: Taste a wick]                             │
│ Categories: [All] [Flames] [Shapes] [Charms] [Oil & tonics]                  │
│ ┌──────────────────────────────────────────────┐ ┌─ Selected ────────────┐  │
│ │ ◉ Rime (Flame)             320 ●  owned: no   │ │ RIME                  │  │
│ │ ➶ Lob (Shape)              180 ●  owned: no   │ │ cyan · chill, freeze  │  │
│ │ • Linger (Charm)           450 ●  ▲ upgrade   │ │ (strand card)         │  │
│ │ ⚱ Tonic ×1                  25 ●  (4/6)       │ │ Price 320 (−20% Lamp) │  │
│ │ ◈ Lamp oil flask ×1         12 ●              │ │ [Buy]  [Buy ×5]       │  │
│ └──────────────────────────────────────────────┘ └───────────────────────┘  │
│ Price change: Crown Lamp relit −20%  · Your Knack 11: −2%                    │
│                                                     [Leave]                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Header | Shop name, keeper, the player's currencies (only those the shop uses in bold). |
| Portrait + line | Keeper portrait 64 × 64 (pixel art at 1:1 × 2), a Lingo line picked by context (first visit, returning, sold them something last time, district relit, you are hurt). Voiced (§19.3). |
| Tabs | Buy, Sell, Buyback (last 12 things sold this visit and the previous one, at the sell price), plus one **Quirk** tab per shop (§23.2). |
| Rows | Icon, name, kind, price (with the currency glyph), owned/equipped mark, and an **upgrade mark** (`▲` green if better than worn for gear; for strands: "owned"/"new"). Unaffordable rows: price in red, still readable. |
| Selected card | Full item/strand card (same renderer as the tooltip), price breakdown, `Buy` / `Buy ×5` / `Buy max` for stackables. |
| Sell tab | Your pack grid; click to sell 1, `Shift`+click stack; `[Sell all junk]` button with the total shown first. |
| Price breakdown | Every modifier listed (district relit, Knack, quirks, curses). |
| Sounds | Buy/sell: `coin`; refused: `ui.error`; opening: `ui.open`. |

### 23.2 Quirk extras per shop

Page 08 owns the rules and numbers; this is what each quirk adds to the screen.

| Shop | Quirk tab / extra UI |
|---|---|
| `shop_wick` Wick & Tallow | **Taste a wick**: pick one of your saved wicks; Odile "tastes" it (a 2 s braid animation in her hands) and gives it a name (Lingo name generator over flame + shape + charms), shown as a chip you can accept (renames the wick). A header strip shows the **price drop per relit Lamp** as 6 pips. |
| `shop_pawn` Crane's Pawn | **Ledger of sales**: Hollis's book of everything you ever sold him (name, date, price he paid), with `[Buy back at his price]` for items he still has. A **mood meter** (a face glyph + a word from Lingo relations: "sour", "fair", "generous") that sets the haggle range; a **Haggle** button on each row: 3 dialogue choices (flatter / threaten / walk away) that move the price ±5–20% by mood. |
| `shop_drowned` The Drowned Market | Prices in **pearls** only (penny column hidden). A water-level strip at the top: the shop's stalls are only open while the room is flooded above the line; if it drains mid-visit (it cannot while paused), nothing changes until you leave. A **Pearl exchange** row (sell items for pearls at 1 per 150 pennies of value, floor). |
| `shop_soup` Brisket's Soup Barge | **Today's menu**: 4 bowls from a seeded rotation (seed = save seed + visit count), each a timed buff card with duration (`secs`) and an ingredient list; one **Mystery bowl** with a `?` card and a hint word. Only one meal buff at a time; buying another shows "Replaces: Eel Chowder (4m 12s left)". |
| `shop_gamble` The Mothwife's Gamble | **Sealed lanterns**: a shelf of 6 lanterns glowing in colours that hint rarity (page 08 table), with price by slot type (hood, coat, pole…). Buying plays a 1.2 s unsealing: the glow flares, the item card flips in. A running "luck" line: lanterns opened, best result. |
| `shop_scrap` Scrapwright's | **Trade-in**: sell parts for credit toward blueprints. **Build a gadget**: 3 part sockets (drag parts from your materials), a live preview card of the gadget the combination makes (page 08 recipe table), `[Build]`. Unknown combinations show "???" until built once. |
| `shop_tithe` The Bell Tithe | **Blessings / Curses** tabs. A tally line "Bell-cultists slain: 14 — prices +28%". Curse rows show what they **pay you** in green and the downside in red; one active curse max per slot type (page 08). |
| `shop_ferry` The Ferry | **Map reveals** (per act: shows which nodes it would reveal), **Fast travel** (the Act map in travel mode across all acts), **Respec** (attributes / skills / both). Each price has a toggle `[Pay in pennies] [Pay in max health]` — the max-health price shows the permanent loss ("Max health 180 → 172") in red and needs a hold-to-confirm (1 s). |

---

## 24. Dialogue box

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐ ODILE PENNYWAX                                        [voice ♪]   │
│ │ portrait │ "You've got ember on your sleeve and rain in your boots. Sit a     │
│ │  64×64   │  minute. What's it to be?"                                         │
│ │ (animated│                                                                   │
│ │  mouth)  │  1 ▸ Trade.                                                        │
│ └──────────┘  2   Ask about the Crown Lamp.                                    │
│               3   Ask about the wax on the stairs.  (new)                       │
│               4   Goodbye.                                              ▼       │
└────────────────────────────────────────────────────────────────────────────────┘
```

| Element | Rule |
|---|---|
| Position | DOM box across the bottom 28% of the viewport, max width 960px, centred. The world stays visible above it (not paused for barks; paused for conversations). |
| Portrait | 64 × 64 pixel art at an integer multiple of the play scale. Mouth animates 2 frames while the voice plays (amplitude from the voice engine's output node, threshold 0.05). Portrait frames per mood (neutral, warm, wary, angry) from Lingo tone tags. |
| Name | Cinzel, the NPC's colour. |
| Text | Spectral 18px (scales with Menu text size), typed out at 60 characters/s; `E`/`Space`/click shows it all at once, pressed again advances. |
| Choices | Up to 4 visible, numbered; more scroll. Keys `1`–`4`, arrows + `Enter`, pad D-pad + South. Unseen choices marked `(new)`. Choices locked by a requirement show greyed with the reason ("Needs Knack 15"). |
| Voice | Lingo line → voice engine (§19.3). `[voice ♪]` replays. |
| Barks | Short lines while walking (not a conversation) use only the subtitle strip (§11.13), no box. |
| Log | Every conversation line also goes to the subtitle log (`U`). |
| Sounds | Open `ui.open`, advance `ui.click` at −20 dB, close `ui.close`. |

---

## 25. UI styling

### 25.1 Colour tokens (`css/tokens.css`)

The menus borrow the world's look: wet slate panels, brass trim, and colour only where light is.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#07090d` | page background, letterbox |
| `--panel` | `#121821` at 94% | panel fill |
| `--panel-lit` | `#1a1712` at 94% | panel fill once the current act's Lamp is relit |
| `--panel-edge` | `#2c3645` | 1px panel border |
| `--brass` | `#b08a4a` | trim, frame corners, dividers |
| `--brass-hi` | `#e6c27a` | trim highlight, focus ring |
| `--ink` | `#d9dee6` | body text |
| `--ink-dim` | `#8792a2` | secondary text |
| `--ink-gold` | `#f0c46a` | headings, currencies, selected |
| `--ok` | `#8fd46a` | gains, upgrades |
| `--bad` | `#ff6b5a` | losses, refusals |
| `--flame-ember` … `--flame-shade` | the 7 canon colours from 00-OVERVIEW §8 | every place a flame shows |
| `--hud-health` | `#d8433b` | health |
| `--hud-oil` | `#c9892f` | oil |
| `--rarity-*` | page 08's ladder | item borders |

The play-layer HUD uses the same values, quantised into the world palette file (page 06) so the HUD
pixels match world pixels.

### 25.2 Fonts

| Use | Font | Size (at 100%) |
|---|---|---|
| Menu headings | Cinzel 600, letter-spacing 0.08em | 22–28px |
| Menu body | Spectral 400 (italic for flavour) | 16px |
| Numbers in menus | Spectral 600, tabular lining figures | 16px |
| HUD, world prompts, damage numbers | our 5×7 pixel font (3×5 tiny variant) | 1 cell per font pixel |
| Accessibility option | Atkinson Hyperlegible | as body |

### 25.3 Panel art

- **9-slice panel frames** drawn as SVG in `assets/ui/` (our own art, no third-party): a slate rectangle
  with a 2px brass edge, riveted corners (4 × 4 brass dots), and a faint vertical "wet streak" texture
  (an SVG pattern at 6% opacity). Used via `border-image` in `css/panels.css`.
- **Tab rail:** brass tabs with a lit flame dot for the active tab.
- **Buttons:** slate with brass edge; hover warms the fill toward `--panel-lit`; pressed insets 1px;
  disabled at 45% opacity with `cursor: not-allowed`.
- **Dividers:** a brass rule with a tiny lantern glyph in the middle.
- **Scrollbars:** thin brass thumb (`scrollbar-color`).
- **Transitions:** screens slide 12px and fade in over 140 ms (off with reduce motion).

### 25.4 Cursor

Menus use a custom CSS cursor: a 16 × 16 brass pointer PNG with a 1px dark outline (hotspot 1,1); text
fields use the system I-beam.

### 25.5 UI sounds by sfx id

Existing `sfx/` ids are used where they fit. New ids (marked **new**) are added to the Lanternfall sound
list through a bridge like Emberveil's `sfx-bridge.js` (page 10 owns it), so `sfx/data/catalog.json` is
only extended, never changed.

| Event | Sound id | Level |
|---|---|---|
| Focus / hover a menu item | `ui.hover` | −22 dB |
| Click / confirm | `ui.click` | −12 dB |
| Tab switch | `ui.tab` | −12 dB |
| Open a screen | `ui.open` | −10 dB |
| Close a screen | `ui.close` | −10 dB |
| Refused / error | `ui.error` | −10 dB |
| Buy / sell / penny pickup | `coin` | −8 dB |
| Equip gear | `equip` | −8 dB |
| Loot pickup by rarity | `loot.common` … `loot.legendary` (page 08 maps rarities) | −6 dB |
| Level up | `levelup` | −4 dB |
| Quest / objective complete | `quest.complete` | −6 dB |
| Wick slot change | `ui.tab` | −14 dB |
| Wick completed in builder | `spell.<element>.launch` (ember→fire, rime→ice, spark→lightning, bile→poison, gleam→holy, tide→nature *for now*, shade→shadow) | −14 dB |
| Cooldown ready | `ui.click` | −18 dB |
| Fast travel | `travel.step` | −6 dB |
| Lamp-post rest | `camp.fire` | −8 dB |
| Save glyph | none | |
| Great Lamp relit | **new** `lf.lamp.relight` | −2 dB |
| Burn-in level up | **new** `lf.wick.burnin` | −10 dB |
| Overcharge charge tick (pitch rises past the safe line, 03 §9.2) | **new** `ui.tick` | −14 dB |
| Overcharge past safe line (loop) | **new** `lf.overcharge.warn` | −12 dB |
| Gutter burst | **new** `lf.overcharge.gutter` | −4 dB |
| Pin placed | **new** `lf.map.pin` | −14 dB |
| Silent Bell rung | **new** `lf.bell.silent` | −4 dB |
| Low oil warning | **new** `lf.oil.low` | −10 dB |

Tide mapping to `nature` is a stopgap until page 06/10 add a `water` element set (see §29).

---

## 26. Tooltips and number formatting

### 26.1 Tooltips (`shared/tooltip.js`)

- `installTooltips()` is called once on the DOM layer at boot; `shared/tooltip.css` linked in `index.html`.
- Plain text: `data-tip="..."`. Rich: `data-tip-render="<name>"` with a registered renderer.
- **One attribute name per kind of subject**, used by every renderer:

| Renderer (`registerTip` name) | Reads | Used on |
|---|---|---|
| `item` | `data-tip-item` (instance id) | inventory, shops, loot toasts in menus, paper doll |
| `strand` | `data-tip-strand` (`ember`, `bolt`, `split`, `on_hit`…) | Wick builder, shops, codex |
| `wick` | `data-tip-wick` (saved wick id) | wick library chips, Ledger sources |
| `status` | `data-tip-status` | status panel, bestiary |
| `enemy` | `data-tip-enemy` (page 05 id) | bestiary, death screen |
| `node` | `data-tip-node` (act node id) | act map |
| `stat` | `data-tip-stat` (derived stat id) | attributes, summary |
| `difficulty` | `data-tip-difficulty` | new game options |

- Compare cards (§14.4) use `refreshTip()` when `Shift` changes the comparison.
- Keyboard focus shows the same tooltip (the engine is focus-friendly); gamepad focus too.
- Tooltips never show in the play layer (the HUD explains itself through the pause menu's Status panel,
  §11.7).

### 26.2 Numbers (`shared/format.js`)

| Kind | Function | Example |
|---|---|---|
| Health, damage, pennies, oil, cells | `hp()` | `1,284` |
| General stats | `fmt()` (max 2 decimals) | `2.74` |
| Percent stored as a fraction | `pct(0.42)` | `42%` |
| Deltas | `sign()` | `+4`, `−2` |
| Ranges | `range(9, 11)` | `9–11` |
| Durations | `secs()` | `0.6s` |
| Rates | `fmt(v) + '/s'` | `4.5/s` |
| Distances shown to players | `hp(cells)` + ` cells`, or metres `fmt(cells/8, {decimals:0})` + ` m` for rope/depth | `44 cells`, `1,240 m` |
| Times over a minute | our `clock(s)` helper → `3m 12s`, `2h 05m` | |

A unit test renders every screen with fixture data and fails on `format.hasLongDecimal()` anywhere in the
DOM text (§28).

---

## 27. Accessibility and menu navigation

### 27.1 Focus and keyboard navigation

- Every interactive DOM element is a real `<button>`, `<a>`, `<input>` or has `role` + `tabindex`.
- **Roving focus** inside grids (inventory, strands, class grid, skill board, map nodes): one tab stop per
  grid; arrows move within it; `Tab` leaves the grid.
- **Focus ring:** 2px `--brass-hi` outline + 2px `--bg` inner gap, always visible when navigated by keys or
  pad (`:focus-visible`), never removed.
- **Focus on open:** each screen focuses its most useful element (Resume on pause, the first pack cell on
  inventory, the Flame socket on the builder, Continue on the title).
- **Focus return:** closing a screen returns focus to where it was opened from; closing to play returns to
  the canvas.
- **Gamepad in menus:** the pad drives the same focus system (D-pad/stick = arrow keys, South = Enter,
  East = Esc, LB/RB = Q/E). The focused element scrolls into view.
- **Drag and drop always has a key equivalent** (§14.5, §15.3).
- **Hold-to-confirm** actions (delete save, pay in max health) show a filling bar and work with `Enter`
  held or South held, 1.0 s.
- **Screen reader basics:** the DOM layer uses headings and labelled regions; toasts and level-ups are
  mirrored into an `aria-live="polite"` region; subtitles into another. The canvas has
  `aria-label="Lanternfall game view"`. Full play by screen reader is a non-goal.
- **Timers never kill a menu:** no menu auto-closes except the level-up banner (not a menu).

### 27.2 Colour-blind flame patterns

With `flame_patterns` on, each flame gets a **shape signature** in addition to colour:

| Flame | Pattern on projectiles / light rims | HUD icon mark | Colour under red-weak / green-weak | under blue-weak |
|---|---|---|---|---|
| `ember` | flickering **triangles** trailing | ▲ | `#ff8a2a` → `#ffb000` | `#ff6a3a` |
| `rime` | **cross-hatch / snowflake** points | ✳ | `#6fe3ff` → `#56b4e9` | `#7fe8e8` |
| `spark` | **zigzag** edge | ⚡ | `#fff27a` → `#f0e442` | `#ffffff` |
| `bile` | **dots** (1-cell stipple) | ⠿ | `#8dff4a` → `#009e73` | `#8dff4a` |
| `gleam` | **ring** (hollow circle) | ◯ | `#ffe6b0` → `#fff0d0` | `#ffe0e0` |
| `tide` | **wave lines** | ≈ | `#3f7bff` → `#0072b2` | `#3fa0a0` |
| `shade` | **diagonal stripes** | ▨ | `#b25cff` → `#cc79a7` | `#c050c0` |

Patterns are drawn as a 1-cell overlay mask in the projectile shader (page 06) and as the HUD icon's corner
mark, so they cost a lookup, not new art per wick. Damage numbers get the pattern glyph as a prefix.

### 27.3 Other promises

- **Darkness never hides attacks** (canon pillar 5): telegraphs and void zones are always lit, and
  `telegraph_boost` makes them louder still.
- **No information by colour alone** anywhere in the UI: locked vs unlocked, gain vs loss, rarity all have
  a second signal (icon, sign, word, or border pattern).
- **Audio cues have visual pairs**: every telegraph sound has a visual telegraph; sound captions cover the
  rest.
- **Slow mode, aim assist and hold-to-toggle** never lock content.

---

## 28. Tests this page implies

| Test | Kind | Checks |
|---|---|---|
| `tests/bindings.test.js` | node | No two actions in one context share a key; every action has a default; every `rebind:false` action is one of the four fixed ones; every key the input code listens for is in `bindings.json`; no reserved chord is a default. |
| `tests/format-screens.spec.js` | Playwright | Opens every screen with fixture saves (fresh, mid-Act 3, late Act 6) and fails on `hasLongDecimal`, `NaN`, `undefined`, `[object` in visible text. |
| `tests/focus.spec.js` | Playwright | Each screen: Tab/arrow through every control without a trap; `Esc` closes back to the opener; focus returns. |
| `tests/hud-layout.spec.js` | Playwright | Screenshots of the HUD at ×2, ×3, ×4 and HUD text 2×; no HUD element overlaps another; nothing within 6 cells of an edge. |
| `tests/builder.spec.js` | Playwright | Drag Ember+Bolt → readout shows cost; sandbox auto-cast fills Measured DPS within 3 s; keyboard-only build of the same wick gives the same JSON. |
| `tests/minimap-fog.test.js` | node | 8 × 8 tile reveal from a lit-cell mask; darkness reveals only lit tiles; bitset round-trips through the save. |
| `tests/tooltips.spec.js` | Playwright | Every `data-tip-render` name has a registered renderer; every renderer reads its one attribute. |
| `tests/difficulty.test.js` | node | `difficulty.json` has every knob for all three levels; the rules module reads each knob (set it to an odd value and ask the module — comparing the file to a constant passes against an orphan). |

---

## 29. Proposed canon changes

1. **Might's "carry"** (00-OVERVIEW §9) has no pack weight to act on, because this page uses slots, not
   weight. Proposal: "carry" means **tonic flask capacity** and **plank kit capacity** (page 04 to confirm).
2. **Two extra audio buses** (`music`, `voice`) live in Lanternfall's own audio wrapper rather than in
   `sfx/`. No change to the shared sfx module.
3. **A water sound element**: `tide` borrows `spell.nature.*` until a `spell.water.*` set is added to the
   sfx catalog via the Lanternfall bridge. Page 10 to own.
4. **Satchel frame**: Inventory, Wicks, Skills, Attributes, Ledger and Journal are tabs of one frame rather
   than six separate screens (the hotkeys still open each tab directly).
5. **Difficulty names.** 05-BESTIARY-BOSSES.md §2.4 proposed four tiers named `lamplit / normal / guttering /
   drowned`. The brief for this page fixes three menu names: **Wick-lit / Lamplighter / Lampless**
   (`wicklit / lamplighter / lampless`), using 05's enemy numbers for the first three rows, with `drowned`
   kept as a post-campaign unlock (§10.1). 05 should rename its ids to match, or keep its ids as aliases in
   `data/difficulty.json` (`"aliases": { "lamplit": "wicklit", "guttering": "lampless" }`).
6. **Belt keys.** 08-ITEMS-SHOPS.md §2.1 put the belt on keys `1`–`4`; those keys select wicks (canon: wick
   slots are the main verb). The belt moves to `Z X C V`; the character sheet moves to `P`; the hood to `Y`.
7. **Shop footer keys.** 08's shop mockup says "Tab switch tab"; in menus `Tab` moves focus (§27.1) and tabs
   switch with `Q`/`E`. 08's "Haggle (H)" stays (menu context, no clash).
8. **Overcharge input.** 03-SPELLS.md §9 is followed: holding `cast` overcharges. The `R` modifier is an
   opt-in accessibility setting only.

