# WILDMARCH — Design Bible, page 02: controls

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.**
**Owns:** the binding table — every key, mouse action and gamepad button, the context each one works in,
whether it can be rebound, and the level (or quest) that makes it appear.
**Reads from:** [page 00](00-OVERVIEW.md) (canon: spell ladder, calling quests, talent tiers, group sizes),
[page 07](07-PROGRESSION.md) (owns the feature-unlock ladder — this page *proposes* the levels for the
keys that canon does not fix, see §3), [page 04](04-SETTINGS.md) (every option that changes how a key
behaves), [page 03](03-UI-SCREENS.md) (the screens the keys open), [page 05](05-COMBAT.md) (what the
attacks do), [page 11](11-BOSS-MECHANICS.md) (boss dialog opportunities), [page 15](15-SOCIAL-ONLINE.md)
(chat channels, parties, trade), [page 20](20-TRAVEL.md) (Travel Methods, the Recall Stone).

Rule 6 of page 00 applies: **if a key is added anywhere, it is added here too.**

---

## 1. What Farhold does today (first-hand), and what changes

Everything below was read out of Farhold's code on 2026-09-29, not remembered.

### 1.1 How Farhold reads keys (reuse: `prototypes/farhold/js/settings.js`, `js/player.js`, `js/main.js`)

* **Two kinds of listener.** `js/player.js` `createInput()` keeps a set of held keys and a set of keys
  pressed since the last frame (`keys` and `pressed`). Movement asks `keys.has('KeyW')`; one-shot actions
  ask `snap.pressed.has('KeyH')`. Separately, `js/main.js` has one big `keydown` listener for the panel
  keys (`I`, `K`, `F`, `B`, `M`, `O`, `Esc`).
* **The binding table sits in front of all of them.** `settings.js` `BINDINGS` is a list of
  `{ action, label, code }`. When a player moves a key, a capture-phase listener on `window` (it runs
  before every other listener) swallows the real key event and sends the game a fake one with the code
  the game expects. So the game code never learns that `KeyZ` now means "walk forward" — it still sees
  `KeyW`. Three rules keep that honest: a fake event is never re-translated (`isTrusted` is false);
  nothing is touched while you type in a text box; and a default key you moved away from and did not
  give to anything else stops doing anything.
* **Binding a key that is already taken swaps them.** Every action always keeps some key.
* **Keys it will never take:** `Escape`, `F5`, `F11`, `F12`, `Tab` (`NEVER_TAKE`).
* **Saved in the browser** under `farhold.settings.v1`, and only the keys the player moved are saved
  (`keys: { map: 'KeyN' }`), so changing a default later reaches everyone who never touched it.
* **The number row 1–6 (skills) and the backtick (debug) are not in the table** — the skills are
  positional and debug is not a player key.
* **The pause menu's key list is built from the real bindings**, because a hard-coded "M map" is wrong the
  moment somebody rebinds it (Farhold RPG.md round 10).
* **The two-owner rule** (Farhold round 17): `settings.js` had the combat log on `K` while `main.js` had
  the Holding hard-coded on `K` too, so one press ran both. The fix was the rule, not the instance:
  `tests/round17-ui.test.js` **fails if any key `main.js` listens for is missing from `BINDINGS`**. It
  caught `B` and `F` within a minute of being written. Round 18 found `G` (the Garage) slipped past it
  because it was read through the input snapshot, not `e.code === 'KeyG'`.

### 1.2 Farhold's full key list today

| Farhold action | Key | What it does in Farhold | Wildmarch |
|---|---|---|---|
| `forward` / `back` / `left` / `right` | W S A D (+ arrows, hard-coded) | walk, strafe | **kept** (reuse) |
| `run` | Left Shift (+ Right Shift, hard-coded) | run | **kept** as Sprint |
| `jump` | Space | jump; in the air, climb | **kept**; air/space use dropped |
| `interact` | E | talk, open, enter, gather (hold) | **kept**, and also loots |
| `firstPerson` | V | tap: first person on/off; hold: swing the camera round you | **kept** |
| `torch` | L | light on/off | **dropped** — always daylight, no light slot, no torch key (canon 00 §12.3). `L` is free |
| `log` | (none) | "What has happened" — sheet tab 8 | log moves into the chat window, still no key |
| `holding` | K | the Holding (your colony) | **dropped** (no colonies); `K` becomes Spells & Talents |
| `scan` | X | scanner sweep | **dropped**; `X` becomes Sit (and Dive when swimming) |
| `order` | R | Command Rod order | **dropped**; `R` becomes Quick Heal |
| `build` | B | build mode | **dropped**; `B` becomes Shoulder Swap |
| `company` | F | Followers | **moved** into the Social window (`P`); `F` becomes Dodge Roll |
| `mount` | H | whistle for the horse | **kept** (behind the mount unlock) |
| (none) | — | — | **new:** `recallStone` on `Home` (§5.1); **Travel Methods**: board with `E`, ride in the `travel` context (§5.18) |
| `ship` | J | call the space ship | **dropped**; `J` becomes Journal |
| `garage` | G | get in/out of a vehicle | **dropped**; `G` becomes Class Key 2 |
| `map` | M | map (star chart off-planet) | **kept**; no star chart |
| `sheet` | I, and Tab while the sheet is closed | character sheet | **kept** on `I`; **Tab becomes target cycling** |
| `settings` | O | settings | **kept** |
| (not in table) | 1–6 | skills | **kept** as the six spell slots, now in the table |
| (not in table) | `` ` `` | debug menu | **kept**, dev builds only |
| (hard-coded) | Esc | close the top thing, else pause menu | **kept**, longer chain (§7.1) |
| (hard-coded, hud.js) | `+` `=` Num+ / `-` Num− | minimap zoom (8–120 cells) | **kept** |
| (sheet open) | 1–9, 0 | pick sheet tab 1–10 | **kept** |
| (sheet open) | R | recycle the item under the pointer | **kept** as Salvage (where salvage is allowed, page 08) |
| (sheet open) | Shift (held) | compare with the other slot | **kept** |
| (map open) | wheel / left-drag / click / Shift+click / Ctrl+Shift+click | zoom (7 steps: 1, 1.6, 2.6, 4.2, 6.8, 11, 18×) / pan / select / drop a pin / keep a place | **kept** |
| (air) | C | descend | **dropped** |
| (space) | W / Shift / hold Space / J | throttle / boost / warp / land | **dropped** |
| (build mode) | Enter / Ctrl+Z / `[` `]` / wheel / right-click / Tab / 1–9 | finish run / undo / brush size / rotate / ring / full list / ring pick | **dropped** |
| (mouse) | left button, hold | attack; holding keeps attacking at the weapon's own rate | **kept** (reuse: `js/player.js`) |
| (mouse) | right button | scanner material chooser | **dropped**; right button becomes the weapon's secondary |
| (mouse) | click the world | take the pointer back (pointer lock) | **kept** |

### 1.3 The five big changes

0. **Tab targeting replaces free aim as the targeting model** (canon 00 §12.1 W8). Farhold had no target
   at all — only a bar that guessed which enemy you meant. Wildmarch has one **hard target** that only the
   player changes (§2).
1. **Nothing pauses.** Farhold stops the frame loop whenever a panel is open (`uiPaused()`). Wildmarch is
   online: the world keeps running while your map, bags or a vendor are open, so **movement keys keep
   working with most windows open** (§7). The full-screen character sheet is the exception that blocks
   spell keys (they pick tabs), exactly as in Farhold.
2. **Tab is taken.** Farhold never takes Tab. Wildmarch uses it for target cycling, which every group
   game needs. Tab still moves keyboard focus *inside* an open window.
3. **The table becomes data and gains columns.** Each row has a context, an alternate key, a gamepad
   button and an unlock (§9). Farhold's row is `{ action, label, code }`.
4. **Chords.** Farhold binds single keys only. Wildmarch allows `Shift+key` chords, under a strict rule
   (§10.3). Ctrl chords are never defaults, because of the browser (§10.4). The one Alt chord is canon's
   **`Alt+1`–`4` boss-dialog replies** (00 §10; §5.12, §10.3).

---

## 2. Targeting — Tab targeting, the one model

This is the most important decision on the page, because it decides what half the keys mean. Canon (00
§12.1 W8) settles it: **Tab targeting, close to the classic online-RPG model.** There is one model. The
first draft's Hybrid / Action / Classic split is gone; what survives of it is a small **pointer style**
option (§2.2), which changes how the mouse steers the camera, not how targets work.

### 2.1 What was wrong in Farhold, in principle (so the builder does not repeat it)

The owner's complaint: "Farhold often shows the wrong enemy's health bar." Read out of Farhold's code on
2026-09-30 (`prototypes/farhold/js/targetpick.js`, round 28's fix, and the round-16 notes before it):

* Farhold's target bar is **worked out again every frame** from the scene — it is a *guess*, not a
  *choice*. Round 16 fed it `aim()`'s hitscan: "what would a shot down this line hit first". That scan
  counts any body within about 1.7 m of the line, which is a huge cone close to the camera, so a wolf
  5 m away and 18° off the crosshair "won" over the champion the crosshair was really on.
* When nothing was under the crosshair for 1.4 s, the bar fell back to **the last thing you hit**
  (4 s) and then to **the nearest enemy in front of your feet**. In melee, where the over-the-shoulder
  crosshair is often not on the body you swing at, the bar swapped to whichever neighbour was more in
  front of you.
* Round 28 made the guess much better (smallest angle to the body's silhouette wins), but it is still a
  guess, and two systems — the bar and the thing your attack hit — can still disagree.

**The rule in Wildmarch:** the target is **state the player sets**, never a value recomputed from the
scene. Nothing in the game may write `player.target` except the actions in §2.4 (Tab, click, a target
key, assist, a spell you cast with no target when `set.gameplay.autotarget_sets_target` is on, a slash command)
and the rules in §2.6 (the target despawns, you change zone). A test (page 16) fails if any module other
than the targeting module assigns it. The target frame (page 03 §4.4) **only draws** `player.target`; it
never asks "what is near the crosshair".

### 2.2 The pointer and the aim point

| Piece | How it works |
|---|---|
| **Pointer style** (`set.controls.pointerStyle`) | **Mouse-look** (default): the pointer is locked (reuse: Farhold pointer lock), moving the mouse turns the camera, and a small **reticle** sits just above screen centre. **Free cursor**: the pointer is free; hold **right mouse** to turn the camera and the character, hold both buttons to run forward, and `A`/`D` turn instead of strafe unless right mouse is held (`set.controls.adTurns`). Targeting works the same in both. |
| **Aim point** | where you are pointing: the reticle in Mouse-look, the cursor in Free cursor. It is used by three things only: **Auto-target** spells when you have no valid target (§2.3), **Ground** spells (they land where the aim point meets the ground), and the direction of a projectile or line fired with no target. |
| **Free cursor, held** | in Mouse-look, hold **Left Alt** to free the pointer without closing anything: click a body, nameplate or frame to target it, click a buff, hover a bag. Let go and the pointer locks again. |
| **Facing** | when you cast a spell or use a basic attack on a target, the character turns to face it (0.12 s turn, both styles). A target more than 150° behind the camera is refused: "Your target is behind you." |

### 2.3 The four targeting kinds every spell has

Every spell in `classes/*.md` names one of these (00 §5 template, field "targeting"). Heals, buffs and
cleanses that go to one ally are **Needs target (friendly)**, which the class template writes as **Ally**.

| Kind | With a valid hard target | With no valid target | Refusal line |
|---|---|---|---|
| **Needs target** (enemy) — single-target finishers, interrupts, marks, debuffs | casts on your target (range and line of sight checked) | **does not cast** | "No enemy target." / "Out of range." / "Not in line of sight." / "Target is dead." |
| **Needs target (friendly)** = **Ally** — heals, buffs, cleanses, revives on one person | casts on your target if it is friendly | does not cast — **no silent self-cast** unless `set.gameplay.self_cast_fallback` is on (default **off**). With it on, the spell goes to you | "No friendly target." (you have an enemy or nothing targeted) |
| **Auto-target** — most damage spells, ranged basic attacks | casts on your target | picks **the valid target closest to your aim point** (smallest angle from the aim ray, within `set.gameplay.autotarget_cone`, default 25°), within the spell's range and in line of sight; ties go to the nearer body. If `set.gameplay.autotarget_sets_target` is **on** (default), that body **becomes your hard target**; off, it is hit without changing your target. If nothing qualifies: a projectile, line or cone **fires anyway** along the aim ray (it may hit something on the way); a spell that must land on a body refuses | "No target in range." |
| **Ground** — circles and walls placed on the floor | lands at the aim point (not on your target) — unless `set.gameplay.ground_at_target` is on, then at your target's feet | lands at the aim point | "Too far away." (the circle turns red beyond range) |
| **Self** — auras, stances, self-buffs, shouts around you | ignores targets | same | — |

A spell's kind is fixed by its class file; a talent may change it (e.g. a Needs-target heal that becomes
"heals the ally nearest your aim point"). **Valid** means: alive (or dead, for a revive), the right side
(enemy / friendly), within range, in line of sight, and not hidden (a hidden enemy — see page 10 — shows
its frame greyed "Out of sight"). Enemies you cannot see on screen are never picked by Auto-target.

**Friendly spells and an enemy target.** A heal pressed while an enemy is targeted refuses with "No
friendly target." There are three ways around it, all opt-in except mouse-over:

1. **Mouse-over casting** (`set.gameplay.mouseover_cast`, default **Frames only**): with a free cursor over a
   party frame (or, on "Frames and the world", over a body or nameplate in the world), a spell key casts
   on the hovered unit **without changing your target**, if the spell can go to it.
2. **Target the healer's target of target** (`set.gameplay.heal_target_of_target`, default **off**): a
   friendly spell with an enemy targeted goes to whoever that enemy is attacking, if friendly.
3. **Auto self-cast** (`set.gameplay.self_cast_fallback`, default **off**): a friendly spell with no friendly
   target goes to you.

Plus the F-keys: `F1` targets you, `F2`–`F5` your party (§5.3), which is the healer's normal path.

**Basic attacks.** A **melee** basic attack is a swing with a shape (reuse: Farhold `js/weapons.js`
patterns): if you have a hard target within reach + 1 m, the character turns to it and swings; otherwise
it swings at the aim point. The shape hits every enemy it covers either way — melee stays an action game.
A **ranged** basic attack (bow, crossbow, wand, thrown) is **Auto-target**. With
`set.gameplay.target_on_attack` on (default), the first enemy your basic attack hits becomes your target —
**only when you have none**; it never replaces a target you chose.

### 2.4 Choosing a target

| How | What it targets | Notes |
|---|---|---|
| **Tab** | the next enemy (§2.5 order) | also `/targetenemy` |
| **Shift+Tab** | the previous enemy in the same list | |
| **Left click** a body, nameplate or frame (free cursor, or Left Alt held) | that unit, friend or foe | never attacks — a click is a click |
| **F1** | yourself | or click your own frame |
| **F2–F5** | party member 2–5, in party-frame order (followers count) | or click their frame |
| **T** (assist) | your target's target; with no target, the party leader's target | |
| **Watch target** (`Y` sets it) | a second, remembered unit — see §2.7 | *(reference: what other games call a focus target)* |
| `/target <name>`, `/tar` | the nearest unit with that name within 60 m | |
| **Esc** | clears the target (after the Esc chain has nothing to close, §7.1) | also `/cleartarget` |
| a spell with no target | Auto-target spells only, with `autotarget_sets_target` on | §2.3 |
| a basic attack with no target | only with `target_on_attack` on | §2.3 |

### 2.5 The Tab order

Tab looks for **hostile, living enemies that are on screen** (inside the camera's view), in line of sight,
within `set.gameplay.tab_range` (default 40 m).

1. **First press** (or the first press after the list goes stale): build a **list** of every enemy that
   qualifies and sort it by **distance from you**, nearest first. Take the first one that is not already
   your target.
2. **Each further press** takes the next one down the list; Shift+Tab goes back up. After the last one it
   wraps to the first.
3. **The list is kept, not rebuilt,** while you keep pressing: it goes stale 3 s after the last Tab, or
   when the camera turns more than 60°. This matters: re-sorting on every press makes the cycle jump
   back and forth between two enemies at almost the same distance (a common fault in tab games). An
   enemy that walks into view while the list is live is added at the end; one that dies or leaves view
   is skipped.
4. **Nothing on screen:** Tab takes the nearest enemy in any direction within range and turns the camera
   0.3 s toward it (`set.gameplay.tab_behind`, default on). If there is none: "No enemies nearby."
5. **Options** (`set.gameplay.tab_order`): **Nearest in front of the camera first** (default, above) ·
   Nearest to the aim point first · Enemies fighting my group first (then nearest) · Lowest health first.
   `set.gameplay.tab_combat_only` (default off) skips enemies that are not in combat, so Tab never pulls a
   sleeping pack by accident.

Friendly Tab (`targetNextAlly`, unbound) uses the same rules over players and followers.

### 2.6 When the target changes on its own — and when it does not

**The target frame never changes by itself.** It does not follow the last enemy that hit you, the one you
hit last, the nearest one, or the one under the reticle. The exhaustive list of things that change or
clear it without a targeting key:

| Event | What happens |
|---|---|
| Your target **dies** | the default (`set.gameplay.on_target_death` = **Keep the body**) keeps it targeted: the frame greys and reads "Dead", so you can loot it, a Necromancer can use the corpse, and nothing jumps to a neighbour. Needs-target spells refuse "Target is dead"; Auto-target spells treat a dead target as **no valid target** and use §2.3's pick. Other values: **Clear the target** (frame empties 1 s after death) · **Take the next enemy** (as if you pressed Tab; the only setting that switches for you) |
| Your target **despawns** (a body fades, a summon expires) | cleared |
| Your target is **more than 100 m away** for 5 s, or you change zone or enter a dungeon | cleared |
| Your target becomes **hidden** | kept, frame greyed "Out of sight"; spells refuse until it is seen again |
| Your target is a **player who logs out** | cleared |
| An Auto-target spell with no valid target and `autotarget_sets_target` on | the picked body becomes the target (you pressed a key that asked for it) |
| A basic attack with no target and `target_on_attack` on | the first enemy hit becomes the target |

Nothing else. Taking damage, a new enemy arriving, a boss phase, an add spawning, a mind-control ending —
none of them change your target. A **boss that becomes untargetable** (a phase in the air, page 11) stays
your target with its frame reading "Cannot be targeted"; your spells refuse until it comes back.

### 2.7 Target of target and the watch target

* **Target of target** (`hud_tot`, page 03 §4.4): a small frame beside the target frame showing **whom
  your target is targeting** (for an enemy: who it is attacking; for a friend: what they have targeted).
  Click it to target that unit, or press `T` (assist) with the target selected. A tank reads it to see an
  enemy turn to a healer; a healer reads it to see who the boss is hitting.
* **Watch target** (new name, original — not "focus"): one extra unit you want to keep an eye on while
  your hard target is something else, typically the caster you must interrupt. `Y` sets your current
  target as the watch target (pressed with no target, or on the same unit: clears it). It gets its own
  small frame with a cast bar (`hud_watch`, page 03 §4.4) and a **violet eye** over its head. It is
  cleared only on purpose (`Y`, `/clearwatch`), when it despawns, or on a zone change; a dead watch target
  shows "Dead" and clears after 10 s. `targetWatch` (unbound) makes it your hard target.
* **Watch casting:** a spell key pressed while **holding `Y`** casts on the watch target instead of your
  target (for interrupts), if the spell can go to it. `Y` held for 0.25 s never sets or clears it.

### 2.8 Other rules

* **Range and line of sight** are page 05's. A target out of range dims its frame to 55% and tints
  spell icons red (page 03).
* **Enemy and ally at once:** a spell that can go to either (a Priest spell that heals an ally or harms an
  enemy) goes to the target, whichever side it is on.
* **The target ring:** your target has a **gold ring** under its feet and a gold outline on its nameplate;
  the watch target a violet eye; nothing else gets a ring (there is no soft target).
* **One test per spell** (page 16): every spell in `classes/*.md` has a targeting kind from §2.3, and the
  test walks all four kinds through the three target states (enemy, friendly, none) against the refusal
  lines above.

---

## 3. Unlocks — when a key appears

**Page 07 owns the ladder** ([page 07 §The ladder, level by level](07-PROGRESSION.md#the-ladder-level-by-level));
this table only says which **keys** each rung brings alive. *Resolved (00 §10): the levels this page first
proposed (dodge 3, belt 5, mount 12, fast travel 8, mount skills 12/20/30) are replaced by page 07's.*

| Level | What unlocks (page 07) | Keys that come alive | Source |
|---|---|---|---|
| 1 | moving, jumping, basic attack, secondary, spell slot 1, interact, loot, targeting (§2), chat, pings, emotes, map, character sheet, journal, unlocks screen, social, settings, damage meter, Quick Heal, Tend the Fallen (hold `E` on a fallen ally) | W A S D, Space, LMB, RMB, 1, E, Tab, Shift+Tab, T, Y, F1–F5, Enter, /, MMB, `.`, M, C, I, K, J, U, P, O, R, `\`, Shift+M | page 07 (day-one kit) |
| 2 | the perk forest (first perk point) | N | page 07 (L) |
| 2 | **sprint**, quest `q_hv_the_long_field` | Left Shift | page 07 (Q) |
| 3 | **potion belt**, 2 slots, quest `q_hv_the_herbwifes_basket` | 7 8 | page 07 (Q) |
| 4 | spell slot 2 | 2 | canon |
| 5 | **dodge roll**, quest `q_hv_fall_and_rise` | F | page 07 (Q) |
| 6 | **class mechanic**, from calling quest 1 | Q, G (if the class uses a second key), Shift+1–4 (if the class has forms, stances or a borrowed bar) — see §5.16 | canon (calling 6) |
| 6 | **Group finder** (Social window tab) and **dungeon journal**, quest `q_hv_the_barrow_bell` | Shift+J | page 07 (Q) |
| 7 | **Recall Stone** (`it_recall_stone`, bound at the First Waystone `lm_first_waystone`; page 20) | Home | page 07 |
| 8 | **first follower slot**, quest `q_mf_coin_for_a_blade` (more at 15, 25, 35) | `,` / Mouse 5 (follower orders, §5.17) | page 07 (Q) |
| 9 | **Harvesting** (needs a tool in the tool slot) and **one crafting profession** (page 19) | hold E on a node (already live); **L** opens Professions | page 07 |
| 10 | spell slot 3; **Riding I** (first mount + gallop), quest `q_hc_saddle_and_bridle`; **Provoke** (the taunt of tank-capable classes), quest `q_hc_hold_the_line` | 3; H; Left Shift while riding = gallop; Z (Provoke) | page 07 |
| 12 | talent tier 1 (Spellbook gains its Talents tab); **waystones** and **Travel Methods** (page 20), quest `q_hc_the_waywardens_oath` | E at a station opens its board; the `travel` context keys (§5.18) | page 07 |
| 16 | potion belt, 4 slots | 9 0 | page 07 (L) |
| 18 | spell slot 4 | 4 | canon |
| 20 | calling quest 2; **Riding II** (faster mount), quest `q_ss_the_sand_runners` | (no new key) | page 07 |
| 28 | spell slot 5 | 5 | canon |
| 30 | **Second Loadout** (two saved builds, page 07) | none by default — the sheet header's switch, or `/loadout 1` · `/loadout 2` (`loadoutSwap`, unbound, can be given a key) | page 07 |
| 40 | spell slot 6; calling quest 3; **Riding III** (swim on the surface, leap), quest `q_dc_the_tide_steed` | 6; Space while galloping = leap 6 m | page 07 |
| 60 | **Riding IV — the sky** (flying mount), chain `q_sky_1` … `q_sky_5`; **Challenge mode** and deep **Depths** (page 12) | Space twice while mounted = take off; Space / X = climb / descend (§5.7); no new key for Challenge or Depth (chosen in the Dungeon Finder) | page 07 |

**How a locked key behaves:**

* The key **does nothing** in the world, and the first press shows one small toast: "Dodge roll —
  unlocks at level 5 (quest: Fall and Rise)". After that it stays quiet for 10 minutes.
* The Keybinds tab **still lists the row**, with a padlock and the unlock text, and it **can still be
  rebound**, so a player can set up their keys on day one.
* The spell bar shows empty slots with the unlock level printed in them (reuse: Farhold round 20's
  `empty`/`pending` slot on `createSkillBar`, and its green "Spell available" card).
* When the unlock happens, the card, sound and Unlocks-screen entry (canon rule 5) **name the key**:
  "Dodge roll unlocked — press **F**". The key name is read from the live binding, never hard-coded.

---

## 4. The keyboard map (defaults)

```
 ┌─────┐ ┌─────┬─────┬─────┬─────┐ ┌─────┬─────┬─────┬─────┐ ┌─────┬─────┬─────┬─────┐
 │ Esc │ │ F1  │ F2  │ F3  │ F4  │ │ F5  │ F6  │ F7  │ F8  │ │ F9  │ F10 │ F11 │ F12 │
 │menu │ │self │pty 2│pty 3│pty 4│ │pty 5│  -  │  -  │no UI│ │shot │opts │brwsr│brwsr│
 └─────┘ └─────┴─────┴─────┴─────┘ └─────┴─────┴─────┴─────┘ └─────┴─────┴─────┴─────┘
 ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────────┐
 │  `  │  1  │  2  │  3  │  4  │  5  │  6  │  7  │  8  │  9  │  0  │  -  │  =  │ Bksp    │
 │ dev │spl 1│spl 2│spl 3│spl 4│spl 5│spl 6│belt1│belt2│belt3│belt4│mini-│mini+│   -     │
 ├─────┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──────┤
 │  Tab   │  Q  │  W  │  E  │  R  │  T  │  Y  │  U  │  I  │  O  │  P  │  [  │  ]  │  \   │
 │target >│class│ fwd │ use │heal │assst│watch│unlck│ bags│ opts│socl │  -  │  -  │ walk │
 ├────────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴┬────┴──────┤
 │  Caps   │  A  │  S  │  D  │  F  │  G  │  H  │  J  │  K  │  L  │  ;  │  '  │  Enter    │
 │ (never) │left │back │right│dodge│clas2│mount│jrnl │spell│profs│  -  │reply│  chat     │
 ├─────────┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴──┬──┴───────────┤
 │ L Shift    │  Z  │  X  │  C  │  V  │  B  │  N  │  M  │  ,  │  .  │  /  │ R Shift      │
 │ sprint     │prvk │ sit │char │1st p│shldr│perks│ map │follw│emote│slash│ sprint (alt) │
 ├──────┬─────┴┬────┴─┬───┴─────┴─────┴─────┴─────┴────┬┴─────┼─────┴┬────┴─┬────────────┤
 │ Ctrl │ Win  │L Alt │             Space               │R Alt │ Menu │ Ctrl │            │
 │(never│      │free  │             jump                │  -   │      │(never│            │
 │ held)│      │cursor│                                 │      │      │ held)│            │
 └──────┴──────┴──────┴─────────────────────────────────┴──────┴──────┴──────┘            
 Shift + 1..4 = form / stance / borrowed bar 1..4 (§5.16) · Shift + Tab = previous enemy
 Alt + 1..4 = boss-dialog replies (§5.12) · hold G = class layer (Chronomancer, Tactician)
 Shift + J = dungeon journal · Shift + M = damage meter · Shift + P = group leader tools
 Home = Recall Stone · riding a Travel Method: E = stop at the next station, hold Space = jump off (§5.18)
 Numpad: NumLock = auto-run · 1–8 = target icons · 0 = clear icon · Shift+1–8 = world markers
         Shift+0 = clear all world markers · + / − = minimap zoom (alt)
 Mouse:  left = basic attack (hold repeats) · right = weapon secondary · middle tap = ping,
         middle hold = ping wheel · wheel = camera zoom · button 4 = auto-run (alt) ·
         button 5 = follower order (alt, §5.17)
 Arrows: move (alt for W S A D)
```

Keys marked `-` are **deliberately free** for later features (`[`, `]`, `;`, F6, F7, Backspace, R Alt).
`Z` is Provoke (the taunt of tank-capable classes, §5.2), `\` is walk, `,` and Mouse 5 are follower orders (§5.17) —
all set in the 2026-09-29 reconciliation pass. Round 2 (2026-09-30): `L` (the old light key) now opens
**Professions**, `Y` sets the **watch target** (§2.7), `Home` uses the **Recall Stone**.

---

## 5. The binding table — by context

Columns: **Action id** (also the settings key `set.keybinds.<id>`), **Default**, **Alt** (second key),
**Pad** (Xbox name, PlayStation in brackets — §8), **Does**, **Rebind** (✔ yes, ✖ no), **Unlock**,
**Origin** (reuse: Farhold / new).

`hold` means the action acts while the key is down; `tap` means once per press. Where the page 04 setting
`set.access.holdOrToggle.*` exists, the player can flip a hold into a toggle.

### 5.1 On foot (the default context)

| Action id | Default | Alt | Pad | Does | Rebind | Unlock | Origin |
|---|---|---|---|---|---|---|---|
| `forward` | W | ↑ | LS up | walk/run forward | ✔ | 1 | reuse |
| `back` | S | ↓ | LS down | walk backward at 70% speed | ✔ | 1 | reuse |
| `left` | A | ← | LS left | strafe left (Free cursor pointer style: turn left unless right mouse held, §2.2) | ✔ | 1 | reuse |
| `right` | D | → | LS right | strafe right (Free cursor: turn right) | ✔ | 1 | reuse |
| `jump` | Space | — | A (✕) | jump; out of water: climb a ledge up to 1.2 m | ✔ | 1 | reuse |
| `sprint` | Left Shift (hold) | Right Shift | LS click (toggle) | sprint: ×1.6 run speed, costs no resource, ends when you cast or attack (page 05) | ✔ | 2 (quest `q_hv_the_long_field`, page 07) | reuse (`run`) |
| `walkToggle` | \ (backslash) | — | (light stick push) | walk at 40% speed until pressed again (for roleplay, sneaking past non-aggressive packs); also `/walk`. *Moved off `Z`, which is now Provoke (§5.2)* | ✔ | 1 | new |
| `autoRun` | Num Lock | Mouse 4 | — | run forward until `forward`/`back` is pressed or `autoRun` again; steering still works | ✔ | 1 | new |
| `dodge` | F | — | B (○) | roll 4 m in the direction you are moving (backward if standing), 0.35 s of immunity, 1 charge per 4 s (page 05 owns the numbers) | ✔ | 5 (quest `q_hv_fall_and_rise`, page 07) | new |
| `sit` | X | — | (emote wheel) | sit / stand. Sitting doubles out-of-combat regeneration (page 05). Any movement stands you up | ✔ | 1 | new |
| `interact` | E (tap) | — | X (□) | talk, open, loot a body or bag, enter a door, pick up, read a sign, use a waystone, open a Travel Method station's board, board a waiting Travel Method, accept a revive | ✔ | 1 | reuse |
| `interactHold` | E (hold 0.3 s) | — | X hold | **harvest** a node (ore, herb, timber, hide, fish…) with the progress bar — needs the right tool in the tool slot and Harvesting from level 9 (page 19; refusal "You need a pick in your tool slot."); **loot all** bodies and bags within 6 m | (moves with `interact`) | 1 (loot all) · 9 (harvest) | reuse (Farhold hold-E work, `js/tools.js`) |
| `recallStone` | Home | — | D-pad down hold | use the **Recall Stone** (`it_recall_stone`): a 10 s cast, broken by damage or moving, that returns you to the waystone or landmark it is bound to; 30 min cooldown (page 20 owns the numbers). Binding it is done at a waystone with `E` → **Bind the Recall Stone here** (page 03 `scr_recall_bind`) | ✔ | 7 (page 07) | new (Farhold's `L` torch slot is gone) |
| `mount` | H | — | D-pad down | call your mount and ride (1.5 s cast, interrupted by damage); press again to get off | ✔ | 10 (Riding I, quest `q_hc_saddle_and_bridle`, page 07) | reuse |
| `firstPerson` | V | — | — | tap: first person on/off; hold: swing the camera round you (the character keeps facing the same way; the camera stays where you left it until the mouse moves) | ✔ | 1 | reuse |
| `shoulderSwap` | B | — | RS click hold 0.5 s | move the camera from the left shoulder to the right, or back | ✔ | 1 | new (Farhold had it as a setting only) |
| `freeCursor` | Left Alt (hold) | — | — | let go of the pointer while held; hover and click the interface; while held, **ground loot labels** show (page 08) and `1`–`4` become boss-dialog replies when a dialog panel is open (§5.12) | ✔ | 1 | new |
| (mouse move) | — | — | RS | look and turn | ✖ (sensitivity/invert in page 04) | 1 | reuse |
| (mouse wheel) | — | — | RS click + RS up/down | camera zoom, 1.2 m to 12 m in 8 steps (starts at Farhold's fixed 7.5 m); past 1.2 m goes to first person if `set.controls.zoomToFirstPerson` | ✖ | 1 | new (Farhold's camera distance was fixed) |
| `emoteWheel` | . (period, hold) | — | RB + Y hold | ring of 8 emotes (page 04 lets you pick which 8); release on one to play it | ✔ | 1 | new |
| `screenshot` | F9 | — | — | save the frame as `wildmarch-<date>-<time>.png` (no interface if `set.interface.screenshotHideUi`) | ✔ | 1 | new |
| `hideUi` | F8 | — | — | hide or show the whole interface (the world and the reticle stay) | ✔ | 1 | new |
| `minimapZoomIn` | = | Num + | — | minimap zoom in (×0.72 span, down to 8 cells) | ✔ | 1 | reuse (hud.js) |
| `minimapZoomOut` | − | Num − | — | minimap zoom out (×1.4 span, up to 120 cells) | ✔ | 1 | reuse |

### 5.2 In combat (these work everywhere you can fight)

| Action id | Default | Alt | Pad | Does | Rebind | Unlock | Origin |
|---|---|---|---|---|---|---|---|
| `attack` | Left mouse (hold) | — | RT (R2) | basic weapon attack: melee turns to your target if it is within reach + 1 m, else swings at the aim point; ranged goes to your target, else Auto-target (§2.3). Holding keeps attacking at the weapon's own rate; a bow draws while held and looses on release; a staff charges (page 05). Free cursor pointer style: a click on a body targets it, a second click or a hold attacks it, and `set.controls.autoAttack` keeps swinging at your target while it is in reach | ✔ | 1 | reuse |
| `secondary` | Right mouse (hold) | — | LT (L2) | the weapon's secondary: shield → block; two-hander → heavy strike; bow → steady aim (zoom 1.5×, +10% crit, page 05 to confirm); wand/staff → channel; dual wield → off-hand flurry. Free cursor pointer style: hold to steer the camera (the secondary moves to `Shift`+right mouse) | ✔ | 1 | new |
| `spell1` … `spell6` | 1 2 3 4 5 6 | — | LB+A, LB+B, LB+X, LB+Y, RB+A, RB+B | cast the spell in that slot | ✔ | 1 / 4 / 10 / 18 / 28 / 40 | reuse (Farhold 1–6, now in the table) |
| `classKey` | Q (tap; some classes also use a hold) | — | Y (△) | the class mechanic's main action (examples: Druid — tap returns to caster form, hold opens the Form Ring; Mage — Stasis; Bard — Finale; Necromancer — tap Assault, hold the command ring). **§5.16 lists what Q does for every class**; each `classes/<id>.md` gives the numbers | ✔ | 6 (class decides) | new |
| `classKey2` | G (tap, or **hold as a layer**) | — | RB + X (hold: ring of the layer) | the class mechanic's second action, only for classes that need one (examples: Necromancer — Return; Bard — next song; Warlock — Snuff). For two classes G is a **held layer**: while G is down, `1`–`6` cast the alternate versions instead (Chronomancer — Cast from the Past; Tactician — Orders 1–5). §5.16 lists every class. Unused classes grey the row | ✔ | 6 (class decides) | new |
| `form1` … `form4` | Shift+1 … Shift+4 | — | Y hold → ring | the **form / stance / borrowed bar** (canon: max 4): switch straight to form, stance, aspect, oath or banner 1–4, or use slot 1–4 of a temporary bar (Druid Heron/Bear/Wolf, Fighter Offense/Defense/Precision, Paladin oaths, Rogue coatings, Dragon Knight aspects, Knight banners, Monk Ways, Necromancer's Colossus bar, **Enchanter's borrowed bar**). §5.16 lists every class. For a class with none, Shift+digit casts the spell as normal. See §10.3 | ✔ | class decides (fighter and paladin from 1; most from 6) | new |
| `quickHeal` | R | — | D-pad up | drink the best health potion in your bags (whether or not it is on the belt); shared potion cooldown (page 08) | ✔ | 1 | new |
| `provoke` | Z | — | RB + RS click | **Provoke** (was "Challenge"; renamed in canon so "Challenge" only means the difficulty), the shared taunt of every class with Tank as its primary or hybrid role (13 classes in canon 00 §6; [page 06 §3.5](06-CLASSES.md) owns the numbers): your target (Needs target, §2.3) within 20 m is Taunted 3 s; 8 s cooldown; off the global cooldown. Other classes grey the row. | ✔ | 10 (quest `q_hc_hold_the_line`, page 07) | new |
| `belt1` … `belt4` | 7 8 9 0 | — | RB + D-pad up / right / down / left | use the consumable in that belt slot (potion, food, scroll, bomb, repair kit). Item ids `belt_1` … `belt_4` on page 08 are these rows | ✔ | 7 8 at 3; 9 0 at 16 (page 07) | new |
| `cancelCast` | Esc (first press) | move | B (○) | stop a cast or channel. Moving cancels casts that are not "cast while moving" | ✖ (Esc) | 1 | new |

**Queueing:** a spell key pressed during the last 0.4 s of a cast, a global cooldown or a swing is
remembered and fires when it can (reuse: Farhold's `COMBAT_FEEL.inputBufferSeconds` input buffer,
extended from swings to spells). Page 05 owns the global cooldown length.

### 5.3 Targeting

§2 is the rule book; these are its keys.

| Action id | Default | Alt | Pad | Does | Rebind | Unlock | Origin |
|---|---|---|---|---|---|---|---|
| `targetNextEnemy` | Tab | — | D-pad right | next enemy in the Tab list: on-screen enemies within 40 m, nearest first, list kept while you keep pressing (§2.5) | ✔ | 1 | new |
| `targetPrevEnemy` | Shift+Tab | — | D-pad left | previous enemy in the same list | ✔ | 1 | new |
| `targetNearestEnemy` | (none) | — | — | the closest enemy in any direction within range | ✔ | 1 | new |
| `targetUnderAim` | (none) | — | RS click | the enemy nearest the aim point (the same pick an Auto-target spell makes, §2.3) — for players who want to point, then lock | ✔ | 1 | new |
| `targetNextAlly` | (none) | — | — | cycle friendly players and followers (same rules as Tab) | ✔ | 1 | new |
| `targetNearestAlly` | (none) | — | — | closest friendly | ✔ | 1 | new |
| `targetSelf` | F1 | — | LB + D-pad up | target yourself (for heals and buffs on you) | ✔ | 1 | new |
| `targetParty2` … `targetParty5` | F2 F3 F4 F5 | — | LB + D-pad right/left cycles 2→5 | target party member 2–5 in party-frame order (followers count) | ✔ | 1 | new (F5 — see §10.4) |
| `assist` | T | — | LB + D-pad down | target your target's target (on a friend: whatever they are hitting). With no target: the party leader's target | ✔ | 1 | new |
| `setWatch` | Y (tap) | — | LB + RS click | make your target the **watch target** (§2.7). With no target, or on the watch target itself: clear it | ✔ | 1 | new |
| `castOnWatch` | Y (hold) | — | — | while held, spell keys cast on the watch target instead of your target (§2.7) | (moves with `setWatch`) | 1 | new |
| `targetWatch` | (none) | — | — | make your watch target your hard target | ✔ | 1 | new |
| `clearTarget` | Esc (when nothing to close or cancel) | — | B (○) with nothing to cancel | drop your target | ✖ (Esc) | 1 | new |
| (click) | left click a body, nameplate or frame with a free cursor (Left Alt held, or Free cursor style) | — | — | target it (no attack) | ✖ | 1 | new |
| `targetIcon1` … `targetIcon8` | Num 1 … Num 8 | — | ping wheel → Icons | put a **target icon** over your target, seen by your party: **Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye** (canon 00 §12.1 W23; ids `wm_sword`, `wm_shield`, `wm_anvil`, `wm_crown`, `wm_leaf`, `wm_wave`, `wm_key`, `wm_eye`; page 11 / page 17 own the art and colours, none of them a telegraph colour). Anyone in a party can set one | ✔ | 1 | new |
| `targetIconClear` | Num 0 | — | — | remove the icon from your target | ✔ | 1 | new |

The old soft-target row and `lockOn` are gone (there is no soft target). The watch target's violet eye is a
marker of its own, not one of the eight icons; the Eye **target icon** is drawn open and gold, the watch
eye half-closed and violet, so the two never read the same.

### 5.4 Pings, markers and quick chat (new)

| Action id | Default | Alt | Pad | Does | Rebind | Unlock |
|---|---|---|---|---|---|---|
| `ping` | Middle mouse (tap) | — | LB + RB (tap) | **smart ping** at the aim point, seen by your party: on an enemy → "Attack this" (red); on an ally → "Help them" (green); on an item or node → "Look here" (white); on the ground → "Go here" (blue). 3 per 5 s, then a 4 s cool-down (anti-spam) | ✔ | 1 |
| `pingWheel` | Middle mouse (hold 0.25 s) | — | LB + RB (hold) | ring of 8: Enemy here · Go here · **Danger — get out** · Stack on me · Spread out · Need healing · Out of resource · On my way. Each is also said in your character's own formant voice at low volume (page 04 `set.voice.pingVoice`) | ✔ | 1 |
| `worldMarker1` … `worldMarker8` | Shift+Num 1 … Shift+Num 8 | — | ping wheel → Markers | place a **world marker** on the ground at the aim point, visible to your party: discs with a light column, the same eight symbols as the target icons — **Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye** (canon 00 §12.1 W23; page 11 / page 17 own the art and colours, none of them a telegraph colour). Ctrl is never a default (§10.4), so they sit on Shift+Numpad. Party leader only (or everyone, if the leader ticks "Everyone can place markers" in `scr_party`); outside a group they are private practice markers | ✔ | 1 |
| `worldMarkerClear` | Shift+Num 0 | — | — | remove all world markers | ✔ | 1 |
| `readyCheck` | (none) — `/ready` | — | — | leader: ask everybody "ready?" (a 30 s card with Yes/No) | ✔ | 1 |
| `pullTimer` | (none) — `/pull 10` | — | — | leader: a big centre-screen countdown for everybody | ✔ | 1 |

### 5.5 Mounted (after the mount unlock)

Riding skill follows page 07's **Riding I–IV** ladder (levels 10 / 20 / 40 / 60). *Resolved (00 §10): the
mount bar this page first proposed (Surge, Rear and Kick, Steady on 1–3) is withdrawn — page 07 gives mounts
no skill bar; their verbs are gallop, leap and flight, on the movement keys below.* The spell bar stays on
screen. Casting a spell by its key while mounted **gets you off first** and then casts, unless
`set.gameplay.dismountToCast` is off (then the key does nothing and says so).

| Action id | Default | Pad | Does | Rebind | Unlock |
|---|---|---|---|---|---|
| (movement) | W S A D | LS | ride; A/D turn the mount rather than strafe (a horse does not step sideways) | ✔ (same rows) | 10 (Riding I) |
| `sprint` → **gallop** | Left Shift | LS click | gallop: +35% for 4 s, then 3 s to recover (page 07 Riding I, reuse Farhold `gallopBonus` / `gallopSeconds`; the road pace ×1.25 of Farhold round 27 applies once) | ✔ (uses `sprint`) | 10 (Riding I) |
| `jump` | Space | A | mount jump, 2 m | ✔ | 10 (Riding I) |
| (speed) | — | — | Riding II raises the mount's top speed to 10.8 m/s; no new key | — | 20 (Riding II) |
| `jump` → **leap** | Space while galloping | A while galloping | leap 6 m forward (page 07 Riding III) | ✔ (uses `jump`) | 40 (Riding III) |
| (swim) | W S A D in deep water | LS | the mount swims on the surface at +80% (page 07 Riding III); before 40, deep water puts you off — **except aquatic mounts** (the giant frogs and other swimmers of page 08's mount list), which swim from Riding I; `Space` held dives with them for 10 s | — | 40 (Riding III) · 10 for aquatic mounts |
| `jump` → **take off** | Space twice (within 0.4 s) while mounted | A twice | flying mounts only, where page 01 allows flight (§5.7) | ✔ (uses `jump`) | 60 (Riding IV) |
| `mount` | H | D-pad down | get off | ✔ | 10 |
| `interact` | E | X | talk from the saddle; gathering and looting get you off automatically | ✔ | 10 |
| `dodge` | F | B | **does nothing while mounted** (page 05: no roll while mounted); the toast says so once | — | — |

Any hit while riding **Dazes** you and puts you off the mount (page 05 status `dazed`, page 07 Riding I).

### 5.6 Swimming

Swimming starts when water is deeper than 1.4 m (reuse: Farhold `player.js` swim rule). No weapon
attacks or spells with a cast time in water; instant spells work (page 05 to confirm).

| Action | Default | Pad | Does |
|---|---|---|---|
| move | W S A D | LS | swim at 2.7 m/s (reuse: Farhold swim speed) |
| `sprint` | Left Shift | LS click | fast swim 4.0 m/s |
| `jump` | Space | A | rise; at the surface, stay up |
| `sit` → **dive** | X (hold) | B hold | sink / dive. `X` means Dive only in water (context shadow, §10.2) |
| `interact` | E | X | pick up from the river bed, open a sunken chest |
| breath | — | — | a breath bar appears under water (30 s, page 05); at 0 you lose 10% health a second |

### 5.7 Gliding and flying (Riding IV, level 60)

*Resolved (00 §10): flying mounts are **in**, at 60, through the `q_sky_1..5` chain (page 07 Riding IV).
Before that, winged mounts run and glide.* Flight works only where page 01 allows it (not in cities or
dungeons).

| Action | Default | Pad | Does | Unlock |
|---|---|---|---|---|
| glide | hold Space while falling on a winged mount | hold A | the mount spreads its wings and glides (winged mounts only; canon §10). Page 07/08 own the glide numbers | 10 (a winged mount) |
| take off | Space twice within 0.4 s while mounted | A twice | leave the ground (13.5 m/s in the air, page 07) | 60 |
| climb | hold Space | hold A | rise | 60 |
| descend | hold X | hold B | sink (`X` is Sit on the ground and Dive in water — a declared context shadow, §10.1) | 60 |
| move / turn | W S A D + mouse | LS + RS | fly where the camera points | 60 |
| land | descend to the ground, or H | D-pad down | H while flying lands first, then gets off | 60 |

### 5.8 Dead, and spectating

| Action | Default | Pad | Does | Rebind |
|---|---|---|---|---|
| `acceptRevive` | E | X | accept a resurrection someone cast on you (the card shows who and the health you come back with) | (uses `interact`) |
| `release` | R **hold 1.0 s** | Y hold | release to the nearest shrine (open world) or the dungeon entrance. Held so it can never happen by accident | (uses `quickHeal`'s key; context shadow) |
| `spectateNext` | Tab | D-pad right | in a dungeon, while dead and not released: watch the next living party member | (uses `targetNextEnemy`) |
| `spectatePrev` | Shift+Tab | D-pad left | the other way | |
| camera | mouse / wheel | RS | orbit the watched player | |
| chat, map, pings, ping wheel | Enter, M, MMB | — | work as normal — the dead can still call "Danger" | |
| everything else | — | — | does nothing; the toast says "You are dead — E to accept a revive, hold R to release" | |

### 5.9 In menus and windows (general rules)

| Key | Does | Rebind |
|---|---|---|
| **Esc** | close the top-most window (the Esc chain, §7.1) | ✖ |
| the window's own key | toggles it (`I` opens and closes bags) | ✔ (the window's row) |
| Tab / Shift+Tab | move keyboard focus inside the window (targeting is off while a window has focus) | ✖ |
| Enter / Space | press the focused button | ✖ |
| Arrow keys | move in a list or grid | ✖ |
| **W S A D, Space, Shift** | **still move your character** (nothing pauses) — except in the full-screen character sheet and a text box | — |
| Left Alt | not needed: the pointer is already free while a window is open (reuse: Farhold `input.setBlocked(panelOpen)`) | — |
| Left click outside any window | lock the pointer again and close nothing (Farhold behaviour) | — |

**The character sheet** (`C`, `I`, `K`, `N`, `J`, `U` all open it on their own tab; reuse Farhold's
full-screen sheet with tab rail):

| Key | Does | Origin |
|---|---|---|
| 1–9, 0 | pick tab 1–10 on the rail (the rail prints the number on each tab) | reuse (hud.js) |
| the tab's own key again (e.g. `I` on Inventory) | close the sheet | reuse |
| another tab's key | switch to that tab | reuse |
| Shift (held) over an item | compare with the other slot it could go in (rings, one-handers) | reuse |
| R over a bag item | salvage it, where salvage is allowed (page 08) | reuse (was recycle) |
| right-click an item | equip / use / (at a vendor) sell | new |
| double-click an item | equip / use | new |
| Shift+click an item | link it into the chat box | new |
| Ctrl+click an item | preview it on your figure (the live 3D figure, reuse: Farhold `js/figure3d.js`) | new |
| drag an item | move, equip, put on the belt, drop on a chat box (link), drop outside (destroy, with a confirm) | new |
| mouse wheel over the perk forest | zoom (reuse: Farhold perk lattice zoom ×1.18 per step) | reuse |
| drag on the perk forest | pan | reuse |
| movement keys | **do not move you** while the full sheet is open (it covers the screen) | reuse |
| spell keys 1–6 | pick tabs (above), never cast | reuse |

### 5.10 Map open

The map is a full-screen overlay but **does not pause** the game; `set.interface.mapOpacity` lets you see
through it while walking.

| Input | Does | Origin |
|---|---|---|
| M / Esc | close | reuse |
| mouse wheel | zoom in 7 steps (1, 1.6, 2.6, 4.2, 6.8, 11, 18×), keeping the point under the pointer still | reuse (map.js `ZOOMS`) |
| left-drag | pan (a drag under 4 px is still a click) | reuse |
| left click a waystone or a Travel Method station | select it: its card shows whether you have discovered it, where its routes go, the next departure and (for a waystone) whether your Recall Stone is bound there. **The map never teleports you** — there is no flight-path click; travel is by Travel Method, scroll, class spell or the Recall Stone (page 20) | reuse (map pads, without the travel button) |
| left click anything else | select it and show its card | reuse |
| Shift+click | drop a pin (quick, throw-away; shared with party if `set.gameplay.sharePins`) | reuse |
| Ctrl+Shift+click | keep a place (named, starred, listed in the Journal) | reuse |
| right-click | context menu: Set waypoint (the HUD arrow) · Share with party · Remove pin · Copy location | new |
| Home | recentre on you (the map context takes `Home` before the world's Recall Stone — a declared shadow, §10.1) | new (Farhold had a button only) |
| `+` / `-` | zoom (keyboard) | new |
| W S A D | still walk (the map stays open) | new |
| F1–F5 | centre the map on that party member | new |

### 5.11 Chat focused (a text box has the keyboard)

When the chat box (or any text box) has focus, **every key types**; no game key fires (reuse: Farhold's
`INPUT/TEXTAREA` guard in `settings.js` and `hud.js`).

| Key | Does |
|---|---|
| Enter (world) | open the chat box on the last channel you used (`set.interface.chatStickyChannel`) |
| / (world) | open the chat box with `/` already typed |
| ' (world) | open the chat box as a reply to the last whisper (`/r `) |
| Enter (in box) | send and close |
| Esc (in box) | close without sending; the text is kept as a draft |
| ↑ / ↓ | previous / next line you sent (history, 30 lines) |
| Tab | complete a slash command, channel or player name; press again to cycle |
| Shift+Enter | send and keep the box open |
| Ctrl+V, Ctrl+C, Ctrl+A, Ctrl+Z | the browser's own, untouched |
| Shift+click an item/quest/spell (anywhere) | insert a link to it |
| Page Up / Page Down | scroll the chat window |
| End | jump to the newest line |

### 5.12 Dialog open (NPC conversation) and boss dialog opportunities

**NPC dialog** (reuse: Farhold `js/talkui.js`; keys are new — Farhold's is mouse-only):

| Key | Does |
|---|---|
| 1 … 9 | pick reply 1–9 (the numbers are printed on the replies). Spell keys are suspended while a conversation has the focus |
| E / Enter / Space | continue (the "…" line); on the last line, close |
| Esc | close the conversation |
| walk more than 6 m away | closes it |
| mouse | click a reply |
| Pad | D-pad up/down to move, A to pick, B to close |

**Boss dialog opportunity** (page 11 §10 owns when they happen and how long): a panel opens at the
top-centre with **2–4 replies** and a timer bar (page 11: 10 s by default, 8–15 s per opportunity). The
boss holds while it is open (page 11 §10.2, the parley state), but nothing else pauses, so **the spell
keys stay on 1–6** and the replies use their own keys (canon 00 §10):

| Action id | Key | Does |
|---|---|---|
| `dialogChoice1` … `dialogChoice4` | **Alt+1 … Alt+4** | pick reply 1–4 (page 11's proposed id `key.dialog_choice_1..4` is these rows). Holding Left Alt also frees the cursor (§2.2), so the same hand can click the panel instead |
| `dialogWheel` | **E (hold)** | alternative for players whose browser takes Alt+digit (Chrome and Firefox on Linux switch tabs with it, §10.4): opens the reply ring over the aim point; while it is held, **1 2 3 4** pick a reply instead of casting |
| (click) | with Left Alt free cursor | pick a reply on the panel |
| (pad) | D-pad + A (page 11), or X hold then A/B/X/Y | same |

Who can answer (canon 00 §10): in a party everyone votes and a tie goes to the party leader; solo, you
pick. If nobody answers before the timer, the fight takes the default branch (page 11).

### 5.13 Vendor, trade, bank, mail and Trading Post windows

These open from an NPC (`E`), sit beside your bags, and **do not stop movement**; walking more than 8 m
away closes them.

| Window | Input | Does |
|---|---|---|
| **Vendor** | click an item for sale | buy one (confirm if over `set.gameplay.confirmBuyOver` gold) |
| | Shift+click | buy a stack / choose an amount |
| | right-click an item in your bags | sell it (confirm for Epic and up — `set.gameplay.confirmSellRarity`) |
| | drag bag → vendor | sell |
| | Buyback tab | the last 12 things you sold, at the price paid (reuse: Farhold round 9 buyback) |
| | Ctrl+click | preview on your figure |
| | R over a bag item | salvage (if this vendor salvages) |
| **Trade** (player to player, page 15) | drag into your side, or right-click in bags | offer an item |
| | gold field | type an amount |
| | **Accept** button | mouse only — **no key accepts a trade** (a key could be pressed by accident or by a macro); any change on either side un-accepts both |
| | Esc | cancel the trade |
| **Bank / Mail / Trading Post** | as bags: right-click moves between bags and bank; Shift+click splits | page 15 owns mail and Trading Post layout |

### 5.14 Party frames and click-to-heal

| Input on a frame (cursor free) | Does | Setting |
|---|---|---|
| left click | target that player | — |
| right click | menu: Target, Set as watch target, Whisper, Inspect, Trade, Follow, Invite/Kick, Promote to leader, Set target icon, Report | — |
| hover + a spell key | **mouse-over cast**: the spell goes to the hovered member without changing your target (§2.3) | `set.gameplay.mouseover_cast` (**Frames only**) |
| hover + a belt key | use a belt item on them (a bandage, a revive scroll) | same |
| drag a frame | move the frame group (when `set.interface.framesUnlocked`) | — |
| F1–F5 | target party members (§5.3) | — |

Healers who keep the pointer locked heal with the **F-keys** (`F1` yourself, `F2`–`F5` the party) and the
assist key; healers who want to click frames hold Left Alt, or pick the **Free cursor** pointer style (§2.2),
where the pointer is always free. **Raid frames are not in v2** (canon 00 §12.1 W16, parked in
`WISHLIST.md`); five party frames are the whole group.

### 5.15 Windows and panels (the keys that open screens)

Screen ids are page 03's. Every key here **toggles**: press it again to close. Pressing a different
sheet key while the sheet is open switches tab (reuse: Farhold `K`/`F` behaviour on the sheet).

| Action id | Default | Alt | Pad | Opens | Rebind | Unlock | Origin |
|---|---|---|---|---|---|---|---|
| `sheetCharacter` | C | — | View hold → tab | character sheet on **Gear** (paper doll + stats), `scr_sheet_gear` | ✔ | 1 | new (Farhold `I` opened the last tab) |
| `sheet` | I | — | View hold | character sheet on **Inventory**, `scr_sheet_bags` | ✔ | 1 | reuse (`sheet`, I) |
| `sheetSpells` | K | — | — | **Spellbook**, `scr_sheet_spells`; its Talents tab `scr_sheet_talents` appears at 12 | ✔ | 1 | new (was the Holding) |
| `sheetPerks` | N | — | — | **Perk forest**, `scr_sheet_perks` | ✔ | 2 | new |
| `journal` | J | — | — | **Quest journal**, `scr_sheet_journal` | ✔ | 1 | new (was the ship) |
| `instanceJournal` | Shift+J | — | — | **Dungeon journal** (bosses, their mechanics, their loot, world bosses), `scr_instance_journal` | ✔ | 6 (quest `q_hv_the_barrow_bell`, page 07) | new |
| `professions` | L | — | — | **Professions**, `scr_professions` (Harvesting + your crafting profession, page 19) | ✔ | 9 (page 07) | new |
| `unlocks` | U | — | — | **Unlocks** (the feature ladder), `scr_sheet_unlocks` | ✔ | 1 | new |
| `social` | P | — | — | **Social** window with tabs: Party (and followers) `scr_party`, Dungeon Finder `scr_group_finder` (tab appears at 6, page 07), Friends `scr_social`, Guild `scr_guild` | ✔ | 1 | new (followers were Farhold `F`) |
| `map` | M | — | View | **World map**, `scr_map` | ✔ | 1 | reuse |
| `leaderTools` | Shift+P | — | — | **Group leader tools** `scr_leader_tools` (ready check, pull timer, world markers, marker permissions — page 03 §10.2.1); for a non-leader the key opens the panel read-only and says "Only the party leader can use these." | ✔ | 1 | new (was `raidLeader`) |
| `meter` | Shift+M | — | — | **Damage meter**, `scr_meter` (reuse `meters/`, as Emberveil 2 uses it) | ✔ | 1 | new |
| `settings` | O | F10 | Menu → Settings | **Settings**, `scr_settings` ([page 04](04-SETTINGS.md)) | ✔ | 1 | reuse |
| (Esc) | Esc | — | Menu | **Game menu** `scr_game_menu` when nothing is open (§7.1) | ✖ | 1 | reuse |
| `help` | (none) — `/help`, Game menu → Help & keys | — | — | **Help & keys**, `scr_help`, whose key list is built from this table | ✔ | 1 | new |

The Shift chords here (`Shift+J`, `Shift+M`, `Shift+P`) are harmless if hit while sprinting — the worst case opens
a window instead of another window (§10.3).

### 5.16 Class keys at a glance (new — reconciliation pass 2026-09-29)

Every class tool has a slot in one scheme: **`Q`** class key (tap; a few classes also use a hold),
**`G`** second class key (tap, or held as a layer), **`Shift+1`–`4`** the form / stance / borrowed bar
(max 4, canon), spells on **`1`–`6`**, the shared **`Z`** Provoke for the 13 tank-capable classes.
Pet commands follow one pattern: **tap `Q`** = the attack command, **hold `Q`** = the command ring,
**`G`** = the one command that needs its own key. Where a class file proposed `Z`, `R`, `V`, `X`, `C`,
`F`, `Alt+`, `Ctrl+` or `Shift+Q/R/Z`, the class's tool moves to the slot in this table (the class files
are to be updated to match; the change list is in this pass's report). `—` = the key does nothing for that
class and its Keybinds row is greyed. Unlock levels are the class file's (calling quests 6 / 20 / 40).

Rows marked **†** changed class systems in round 2 (canon 00 §6, §12.1 W27–W37); the class agents are
rewriting those files now, so a † row is this page's **proposal** for where the new system's tools sit. The
class file's key wins if it differs, and this table is then corrected.

| Class | `Q` | `G` | `Shift+1`–`4` |
|---|---|---|---|
| `warrior` | — (Bulwark is passive) | — | — |
| `fighter` | cycle to the next stance | — | **stances**: 1 Offense · 2 Defense · 3 Precision (level 1). Calling 40: hold a stance key 1 s = Threefold Form |
| `paladin` | **oath wheel** (swear out of combat; in combat from calling 20) | — | **oaths**: 1 Keeping · 2 Mercy · 3 Dawnfire (20). Twin Oath (40): a Shift+digit replaces the older of your two oaths |
| `ranger` † | tap = your **tamed beast attacks** your target · hold = **beast command wheel** (Attack, Heel, Stay, Stance) | the beast's **special move** (depends on the species tamed — class file) | — |
| `rogue` † | — (Blind Spots and Wounds are passive; the finishers that spend Wounds are spells. No stealth, canon W29) | — | **coatings**: 1–3 switch the coating on your blades or bolts (class file names them) |
| `cleric` | tap **Raise** (revive one ally; there is no group revive, canon W35) | **Outpouring** (20) | — |
| `bard` | **Finale** | **next song** (Cadence → Hearthsong → Dirge) | — |
| `mage` † | **Stasis** (holds your Resonance from fading); at 5 Resonance after calling 40, **Critical Mass** | — (Wards and decoys for the tank hybrid are spells) | — |
| `necromancer` † | tap = your **controlled undead attack** · hold = command ring (Assault, Hold Here, Return, Stance) | **Return** | the **Colossus bar** while it stands: 1 Crushing Fist · 2 Skull Hurl · 3 Stand Guard · 4 Unmake (if the class file keeps the Colossus) |
| `warlock` † | tap = your **bound demon attacks** · hold = command ring (Attack, Heel/Stay, Snuff, Devour) | **Snuff** (the demon's interrupt) | — |
| `demon_hunter` † | **Demonsight** — a 30 m pulse that reveals hidden enemies and marks demon-tagged ones' weak points (no form, no gauge, canon W27) | **Set trap** at the aim point (if the class file puts traps on a key rather than spells) | — |
| `scavenger` | **Scrounge** | **Junk Avalanche** (40) | — |
| `swashbuckler` | **Riposte Guard** | — | — |
| `dragon_knight` † | at 100 Wyrmblood: **Scale Surge** (from 6) / **Dragon Form** (40); again = end it early | — | **aspects**: 1 **Firescale** (was Emberscale, renamed — no "ember", canon §11 rule 10) · 2 Rimescale · 3 Thunderscale (out of combat from 6; in combat from 20, 20 s cooldown) |
| `pyromancer` † | tap **Vent** (releases Heat) · hold **Controlled Burn** | **Hearthkeeper** | — |
| `stormcaller` | plant a **storm rod** at the aim point (hold = the 25 m placement preview; release plants) | **Conduit** | — |
| `druid` † | tap = back to **Grove** form (the default form) · hold = **Form Ring** | — | **forms**: 1 **Heron** · 2 **Bear** · 3 **Wolf** (6 / 20 / 40). A form turns each of the six spells into a different spell (canon W30); the bar keeps `1`–`6` |
| `oracle` | **Share the Vision** (40) | hold while casting a heal = **keep the Omen** (the file's "hold Alt"; Alt+digit is the dialog key) | — |
| `tactician` | **Battle Plan** picker (20; out of combat) | **hold = Orders layer**: `1`–`5` give Orders 1–5 (5 from 40); add Shift = every follower and group member within 30 m (+1 pip) | — |
| `chronomancer` | **Recall** (snap to your Ghost) | **hold = Cast from the Past** (20): `1`–`6` cast that slot from your Ghost | — |
| `monk` | — | — | **Ways** (20): 1 Storm Fist · 2 Still Water — starts the 10 s meditation, out of combat only *(proposal; the monk file uses the gauge's right-click menu)*. Breath (was Chi) is shown on the gauge |
| `shaman` † | **Great Storm** — usable once all three storm-beasts have been called (Storm Tales, canon W31) | — | — (the three beasts — Thunder Ox, Rain Crane, Wind Hare — are called by spells; no totems) |
| `witch_hunter` | **Witchsight** (20) | **Silvered Shots** on / off | — |
| `knight` | **Vow of Protection** on your friendly target (6) | **second Vow** (Oathsworn, 40) | **banners** (20): 1 Bastion · 2 Valor · 3 Mercy |
| `sorcerer` | **Nudge** (20) | — | — |
| `runesmith` | — (Speak the Runes is spell 2) | — | — |
| `shadow_dancer` † | **Shadowswap** (was Veilswap, renamed — no "veil"): you and your newest Shadow trade places | — | — |
| `tinker` | **Overclock** | — | — (while Climbed In to the Iron Walker, **the spell bar itself** becomes the Walker bar: `1` Haymaker · `2` Rocket Barrage · `3` Steam Vent · `4` Eject; `E` climbs in) |
| `priest` | **Anchor** (40) | — | — |
| `enchanter` | **Charm** a target; again = **Release** (Snap from 40) | **Hold Here** (the charmed creature walks to the aim point and stays) | the **borrowed bar**: 1–3 the creature's own abilities · 4 Attack my target / Guard me toggle |

**Utility spells** (out of combat, no slot — canon 00 §5 item 6 and §6: Mage **Portal**, Chronomancer
**Retrace**, Oracle **Guiding Call**, Druid **Heron's Flight**, and the rituals that revive a tamed beast or
a bound demon, **Tame Beast**, **Bind Demon**): they sit on a **utility ring**, `utilityRing` =
**`Shift+Q`** (hold; release on a wedge to cast), unlock 6 or the class file's level. They are also buttons
on the Spellbook's Utility strip (page 03 §7.3) and `/cast <name>`. In combat the ring does not open and
`Shift+Q` falls through to `Q`, so a sprinting player who presses Q still gets the class key (§10.3).

Rules this table follows:

* A bar that **replaces the whole spell bar** (Druid forms, Dragon Form, Pyromancer's Overheat versions,
  the Tinker's Walker) stays on `1`–`6`; `Shift+1`–`4` only ever *switches* or runs a small
  second bar.
* A **held layer** (`G` for Chronomancer and Tactician) is the only place `1`–`6` mean something else while
  a key is down. It is a declared context (`classLayer`, §10.2), so the one-owner test allows it.
* The pad reaches `Q` on Y (hold: ring), `G` on RB + X (hold: the layer's ring), `Shift+1`–`4` on the Y-hold
  ring (§8).

### 5.17 Follower and pet orders (new — reconciliation pass 2026-09-29)

Page 06 §10 gives every follower and pet four commands: **stance** (Aggressive / Defensive / Passive),
**attack my target**, **come back**, **stay here**. Page 06 proposed `Ctrl+1`–`4`; **Ctrl is never a default**
(§10.4 — the browser cannot be stopped from taking `Ctrl+1`–`9` as "switch tab"), so they sit here:

| Action id | Default | Alt | Pad | Does | Rebind | Unlock |
|---|---|---|---|---|---|---|
| `followerOrder` | `,` (comma) tap | Mouse 5 tap | LB + RB + A | every follower and pet you own **attacks your target** | ✔ | 8 (first follower slot, page 07) — or 6 for a class whose pet comes with calling 1 |
| `followerRing` | `,` hold | Mouse 5 hold | LB + RB + A hold | ring of 4: Attack my target · Come back · Stay here (at the aim point) · Stance (cycles) | ✔ | as above |
| `followerAttack` / `followerReturn` / `followerStay` / `followerStance` | (none) | — | — | the four commands on their own keys, for players who want them | ✔ | as above |

* Class pets answer these too; the class's own `Q` / `G` (§5.16) are shortcuts for its pet only.
* Page 11 §22's follower commands for dungeons (Hold position, Stack on me, Spread, Attack my target,
  Interrupt on/off, Use defensives now) are **extra wedges** on the same ring inside an instance; the
  Tactician's Orders layer (§5.16) extends them further.
* Mouse 5 was reserved for push-to-talk (§12 Q5). Voice chat is not in v2; if it is added, push-to-talk
  takes an unbound key and Mouse 5 stays here.

### 5.18 Travel Methods — boarding and riding (new, round 2)

**Travel Methods** replace flight paths (canon 00 §12.1 W15; [page 20](20-TRAVEL.md) owns routes, speeds,
schedules and the snap-back rule). Some leave like a bus (they wait up to a set time for riders), some run
to a schedule (trains, boats, barges) and a group boards together. Riders are protected from weather and
enemies. The keys:

**At a station** (the `world` context):

| Action id | Default | Pad | Does | Unlock |
|---|---|---|---|---|
| `interact` | E on the station sign or keeper | X | opens the station board `scr_travel_station` (page 03 §12.17): routes, next departures, riders waiting | 12 (page 07) |
| `interact` | E near a waiting vehicle | X | **board it** ("[E] Board the wagon to Anvilgate — leaves in 0:42"). Your party members within 30 m get a card "Board with {name}?" (`set.social.boardWithParty`) | 12 |
| (auto) | — | — | with `set.gameplay.auto_board` on (default **on**) and a route picked on the board, you board by yourself when the vehicle is ready and you stand within 30 m of it | 12 |

**While riding** (a new context, `travel`; it sits above `world` in §10.2):

| Action id | Default | Pad | Does |
|---|---|---|---|
| (mouse, wheel) | — | RS | orbit and zoom the camera round the vehicle; you do not steer (the route does) |
| `travelStop` | E (tap; shadow of `interact`) | X | **get off at the next station** on the route, or cancel that request (a toggle; the HUD strip says "Getting off at Reedhollow") |
| `travelJumpOff` | Space (hold 1.0 s; shadow of `jump`) | A hold | **step off here**, where the route allows it: refused on a bridge, over deep water, in the air (flyers) and inside the last 50 m of a station ("You can step off once the wagon is on open ground."). You lose the riders' protection at once |
| W A S D, spells, dodge, mount, Tab | — | — | **do nothing**; the first press shows once "Riding to Anvilgate · E: get off at the next stop · hold Space: step off" |
| M, I, C, K, J, P, Enter, chat, map, bags, meter | as normal | — | work while riding (nothing pauses) |
| Esc | Esc | B | the normal Esc chain (§7.1); it never throws you off |

---

## 6. Chat and slash commands (every one)

All commands are case-insensitive. `<name>` = a player name (Tab completes). Commands listed with a
comma are the same command. **Emote names are original.** Page 15 owns what each channel is.

### 6.1 Talking

| Command | Does |
|---|---|
| `/s`, `/say <text>` | speak aloud; heard within 30 m; shown as a speech bubble |
| `/y`, `/yell <text>` | shout; heard within 150 m |
| `/p`, `/party <text>` | your party |
| `/pw <text>` | party warning: a centre-screen banner and a sound for your party (party leader) |
| `/i`, `/instance <text>` | everyone in your dungeon, grouped or not |
| `/wc`, `/warcall <text>` | the **Warcall** channel: everyone in a world-boss area (page 13, page 15) |
| `/warcall lead` | offer to lead the world-boss fight in that area (page 13) |
| `/car <text>` | the **Carriage** channel: everyone riding the same Travel Method (page 20) |
| `/g`, `/guild <text>` | your guild |
| `/o`, `/officer <text>` | guild officers |
| `/w`, `/whisper`, `/t`, `/tell <name> <text>` | private message |
| `/r`, `/reply <text>` | reply to the last whisper |
| `/z`, `/zone <text>` | everyone in your region (e.g. all of Mossfen) |
| `/trade <text>` | the trade channel (Highcourt and hub towns only) |
| `/lfg <text>` | the looking-for-group channel |
| `/1` … `/9 <text>` | numbered custom channels you joined |
| `/join <channel>` | join a custom channel |
| `/leave <channel>` | leave one |
| `/chkick <channel> <name>` · `/chban <channel> <name>` · `/chpass <channel> <password>` · `/chowner <channel> <name>` | custom channel owner tools (page 15 §9) |
| `/recruit <text>` | the Guild Recruiting channel (page 15) |
| `/new <text>` | the Newcomers channel (under level 20, first 7 days, and Guides; page 15) |
| `/channels` | list the channels you are in |
| `/me`, `/em`, `/emote <text>` | a free-text emote: "Kaela checks her boots." |

### 6.2 Groups

| Command | Does |
|---|---|
| `/inv`, `/invite <name>` | invite to your party (max 5, followers included) |
| `/kick`, `/uninvite <name>` | remove (leader) |
| `/leave`, `/leaveparty` | leave your party |
| `/lead`, `/promote <name>` | make them the leader |
| `/ready` | ready check |
| `/pull <seconds>` | pull countdown (default 10, max 30) |
| `/countdown <seconds>` | a plain countdown (max 60) |
| `/roll [max]` | random 1–100 (or 1–max), shown to the group |
| `/difficulty <normal\|challenge>` | set the dungeon difficulty before entering (leader; Challenge at 60) |
| `/depth <n>` | set the Depth before entering (leader; any Depth you have unlocked on that dungeon, page 12) |
| `/resetdungeons` | reset your saved dungeons (outside, leader) |
| `/mark <1-8\|clear>` | target icon on your target |
| `/wm <1-8\|clear>` | world marker at the aim point (1 Sword · 2 Shield · 3 Anvil · 4 Crown · 5 Leaf · 6 Wave · 7 Key · 8 Eye) |
| `/followers` | open the Party tab of the Social window on your followers |
| `/dismiss <follower>` | send a follower away |
| `/order <attack\|hold\|follow>` | follower order, same as the §5.17 ring (page 15 §21.7) |
| `/stance <aggressive\|defensive\|passive>` | set your followers' stance (page 15 §21.7) |

### 6.3 Targeting

| Command | Does |
|---|---|
| `/target`, `/tar <name>` | target by name (nearest match within 60 m) |
| `/targetenemy` | same as Tab |
| `/assist [name]` | target their target |
| `/watch [name]` | set the watch target (your target if no name, §2.7) |
| `/clearwatch` | clear the watch target |
| `/targetself`, `/targetparty <2-5>` | as `F1`, `F2`–`F5` |
| `/cleartarget` | clear target |

### 6.4 Social and status

| Command | Does |
|---|---|
| `/friend`, `/addfriend <name>` · `/unfriend <name>` | friends list |
| `/ignore <name>` · `/unignore <name>` | hide their chat, invites and trades |
| `/block <name>` | ignore + they cannot see you online (page 15) |
| `/report <name>` | open the report form (page 15) |
| `/who [text]` | search online players by name, level, class, region |
| `/afk [message]` | away; auto-replies to whispers |
| `/dnd [message]` | busy; whispers are held silently |
| `/ginvite <name>` · `/gkick <name>` · `/gpromote <name>` · `/gdemote <name>` · `/gquit` · `/gmotd <text>` · `/ginfo` | guild commands (page 15) |
| `/inspect [name]` | view their gear (in 10 m) |
| `/trade <name>` (with a name) | ask to trade (in 10 m) — without a name it is the trade channel |
| `/duel <name>` | challenge to a friendly duel — from level 10, no rewards (page 15; the only player-versus-player fighting in v2, canon W1) |
| `/yield` | concede a duel (page 15) |
| `/follow [name]` | auto-follow them (breaks when you move) |

### 6.5 Information and utility

| Command | Does |
|---|---|
| `/help [topic]` | the command list, or help on one |
| `/ticket` | same as Help → Report a problem (page 15 §18.3) |
| `/keys` | print your current key list (built from the live bindings) |
| `/where`, `/loc` | print your location line: region, zone, x, z, altitude (reuse: Farhold debug `locationLine`) — handy for bug reports |
| `/played` | time played on this character, and at this level |
| `/time` | real server time and the next Monday 06:00 reset (there is no in-game clock: always daylight, canon 00 §4) |
| `/ping` | latency to the server now |
| `/fps` | show/hide the frame-rate counter |
| `/stuck` | move you to the last safe ground you stood on (10 min cooldown); if that fails, the nearest shrine |
| `/sit`, `/stand` | as `X` |
| `/walk`, `/run` | walk toggle |
| `/sheath` | put weapons away / draw them |
| `/screenshot` | as F9 |
| `/settings`, `/options` | open settings |
| `/camp`, `/logout` | back to the character list after 10 s standing still (instant in a town or at a waystone) |
| `/quit` | same as `/logout`, then show "You can close this tab" |
| `/combatlog [on\|off]` | write the detailed combat log to a downloadable file (page 15) |
| `/clear` | clear the chat window |
| `/reload` | reload the interface only (not the page) |
| `/recall` | use the Recall Stone (as `Home`) |
| `/board [route]` | board the waiting Travel Method at this station (as `E` near it; with a name, picks that route) |
| `/stepoff` | step off the Travel Method here, where allowed (as holding Space, §5.18) |
| `/cast <spell>` | cast a spell or utility spell by name (utility spells, §5.16) |
| `/loadout <1\|2>` | switch to Second Loadout 1 or 2 (out of combat, level 30, page 07) |
| `/professions`, `/prof` | open Professions (as `L`) |
| `/meter [reset\|report]` | open the damage meter, reset it, or post its top 5 to your party |

### 6.6 Emotes (original set)

Each plays an animation (reuse: Chibi 2 `CHIBI2_EMOTE_ANIMS` where one fits; the rest are new clips,
page 17) and prints a line. Targeted versions name your target.

`/wave` · `/bow` · `/cheer` · `/laugh` · `/dance` · `/clap` · `/salute` · `/point` · `/shrug` ·
`/nod` · `/shake` (head) · `/cry` · `/flex` · `/kneel` · `/pray` · `/thank` · `/hello` · `/bye` ·
`/yes` · `/no` · `/beg` · `/roar` · `/sleep` · `/sit` · `/stand` · `/facepalm` · `/think` ·
`/jeer` · `/beckon` · `/applaud` · `/toast` (raise a cup) · `/warmhands` (at a fire) · `/stretch` ·
`/spin` · `/shiver` · `/tired` · `/victory` · `/rude` (can be hidden by the profanity filter) ·
`/lute` (Bard only: a short tune)

### 6.7 Developer commands (dev builds only, `?dev=1`)

Not player-facing, never in release. `/dev tp <region|x z>`, `/dev level <n>`, `/dev give <item id>`,
`/dev spawn <monster id> [n]`, `/dev boss <id> phase <n>`, `/dev weather <key>`, `/dev depth <n>`,
`/dev god`, `/dev unlock all`, `/dev report` — they call the same hooks as the debug menu (page 04 §11).

---

## 7. Windows, the Escape chain and the pointer

### 7.1 The Escape chain (reuse: Farhold `main.js`, extended)

Each press of **Esc** does the **first** of these that applies, then stops:

1. close the key-capture prompt in Keybinds (leaves the key as it was)
2. close a confirm dialog (answers "No")
3. close the chat box (keeps the draft)
4. close an open ring (ping wheel, emote wheel, dialog wheel, form ring, class command ring, follower ring,
   utility ring)
5. close the top-most window (settings → trade → vendor/bank/mail/Trading Post → station board →
   conversation → character sheet → map → social → any other window, most recent first)
6. cancel a cast or channel in progress
7. clear your hard target (§2.4)
8. clear your watch target? **No** — it is only cleared on purpose (`Y` with no target, or `/clearwatch`)
9. open the **Game menu** (Resume, Settings, Keybinds, Help & keys, Report a bug, Log out, Quit)

After Esc closes the last window, the pointer is locked again (reuse: Farhold `regrab()`), unless the
pointer style is Free cursor (§2.2).

### 7.2 Pointer lock (reuse: `js/player.js`)

* A click on the world takes the pointer (browsers require a click; a key cannot).
* Any window opening lets it go; the last window closing asks for it back.
* A browser that refuses the lock (it does, if asked too quickly after Esc) gets a line in the log:
  "Click the world to aim again." (reuse: Farhold hud.js `pointerlockerror`).
* Mouse movements over 110 px in one event are dropped (reuse: `MAX_DELTA`), which stops the view
  jumping straight up or down on some drivers.
* The Free cursor pointer style never takes the pointer.

---

## 8. Gamepad (new — Farhold has none)

Browsers read gamepads through the Gamepad API (a built-in way for a web page to read a connected
controller). Names below are Xbox; PlayStation in brackets. The pad is **polled every frame** and
turned into the same actions as the keyboard, so every rule on this page applies to it.

```
          LT (L2) secondary                         RT (R2) attack
          LB (L1) spell layer A                     RB (R1) spell layer B
       ┌──────────────────────────────────────────────────────────┐
       │   LS  move              View = map (hold: sheet)          │
       │   LS click = sprint      Menu = game menu        Y  class  │
       │                                              X use   B dodge│
       │  D-pad: ↑ quick heal                             A  jump    │
       │         ↓ mount (hold: Recall Stone)                        │
       │         ← → target prev/next          RS  camera            │
       │                                   RS click = target under aim│
       └──────────────────────────────────────────────────────────┘
```

| Button | Alone | With LB held | With RB held | With LB+RB |
|---|---|---|---|---|
| A (✕) | jump | spell 1 | spell 5 | follower order (hold: follower ring, §5.17) |
| B (○) | dodge / cancel cast / back | spell 2 | spell 6 | — |
| X (□) | interact (hold: gather/loot all/dialog wheel) | spell 3 | class key 2 | — |
| Y (△) | class key (hold: form ring) | spell 4 | emote wheel | — |
| D-pad ↑ | quick heal | target self | belt 1 | — |
| D-pad → | next enemy | next party member | belt 2 | — |
| D-pad ↓ | mount (hold: Recall Stone) | assist | belt 3 | — |
| D-pad ← | previous enemy | previous party member | belt 4 | — |
| RS click | target the enemy under the aim point (hold 0.5 s: shoulder swap) | set watch target | Provoke (tank-capable classes) | — |
| LS click | sprint toggle | — | — | — |
| LB + RB tap / hold | — | — | — | ping / ping wheel |
| View | map (hold 0.5 s: character sheet) | — | — | — |
| Menu | game menu | — | — | — |

* Holding LB or RB shows the four spells of that layer as a cross over the bar, with their buttons.
* In windows: LS or D-pad moves focus, A picks, B backs out, LB/RB change tab, RS scrolls, X = the
  window's second action (equip/sell), Y = the third (compare/salvage).
* Chat on a pad: no on-screen keyboard in v2; the ping wheel's quick-chat lines stand in.
* Pad rebinding: every row in the Keybinds tab has a pad column that can capture a button (page 04).
* Deadzones, stick curves, vibration and trigger thresholds are in page 04 `set.controls.pad*`.

---

## 9. The binding table as data (new; reuse the Farhold translation layer)

Farhold's rows are code. Wildmarch's are data, one file, so tests and the Keybinds screen and the help
list all read one thing. Page 16 owns the final file name; the proposal is `data/bindings.json`:

```json
{
  "version": 1,
  "contexts": ["world", "combat", "mounted", "flying", "swimming", "travel", "dead", "sheet", "map",
               "chat", "dialog", "bossDialog", "trade", "frames", "ring", "classLayer"],
  "actions": [
    {
      "id": "dodge",
      "label": "Dodge roll",
      "group": "Movement",
      "contexts": ["world", "combat", "mounted"],
      "key": "KeyF",
      "alt": null,
      "pad": "B",
      "hold": false,
      "rebindable": true,
      "unlock": { "level": 5, "quest": "q_hv_fall_and_rise" },
      "origin": "new"
    },
    {
      "id": "form1",
      "label": "Form / stance 1",
      "group": "Class",
      "contexts": ["world", "combat"],
      "key": "Shift+Digit1",
      "alt": null,
      "pad": "Y:ring:1",
      "rebindable": true,
      "unlock": { "level": 6, "classOnly": ["druid", "fighter", "dragon_knight", "paladin", "knight",
                                           "rogue", "monk", "necromancer", "enchanter"] },
      "origin": "new"
    }
  ]
}
```

* `key` and `alt` use the browser's `KeyboardEvent.code` names (`KeyF`, `Digit1`, `Numpad3`, `F5`),
  never `key` (the printed character), so AZERTY and other layouts work — the code is the physical
  position. A chord is `Shift+<code>`. Mouse buttons are `Mouse0`…`Mouse4` and `Wheel`.
* The label shown to the player is `keyLabel(code)` (reuse: Farhold `settings.js`), which prints the
  keycap name ("Left Shift", "Num 3").
* **Saved:** only the rows the player changed (Farhold's `keys: {}` rule), per account on the server,
  with a per-character override switch (page 04 `set.keybinds.perCharacter`).

---

## 10. Rules for keys

### 10.1 One owner per key per context — and a test that enforces it (reuse: Farhold R17's rule, widened)

1. **Every key the game listens for is a row in `data/bindings.json`.** No module may call
   `addEventListener('keydown')` and test `e.code` itself, except the one input module. A test greps
   every `.js` file for `e.code ===`, `e.key ===`, `.has('Key`, `.has('Digit`, `pressed`, `button ===`
   and fails if it finds a key or button that is not in the table (Farhold's test only looked at
   `main.js` and only at `e.code === 'KeyX'`, which is how `G` got past it in round 18).
2. **No two actions share a key in overlapping contexts.** The test builds, for every context, the set of
   keys live in it (an action is live in each context it lists) and fails on any duplicate — for the
   defaults, and again for any saved player binding before it is accepted.
3. **Context shadows are declared, not accidental.** Where one key deliberately means two things in two
   contexts that can never be live at once (`X` = Sit on land, Dive in water, Descend in the air; `R` =
   Quick Heal alive, Release when dead; `Tab` = target alive, spectate when dead; `1`–`9` = spells in the
   world, replies in a conversation, tabs in the sheet, alternate spells while the `G` class layer is held
   (§5.16); `Space` = jump on foot, leap / take off / climb on a mount, hold-to-step-off on a Travel Method;
   `E` = interact on foot, get off at the next stop on a Travel Method; `Home` = Recall Stone in the world,
   recentre in the map; `Shift+Q` = utility ring out of combat, `Q` in combat), the second row names the first in a
   `shadows` field. The test allows exactly those pairs.
4. **Rebinding into a taken key swaps** (reuse: Farhold `bind()`), and the swap is shown: "F is now
   Dodge; Interact moved to E → G".
5. **The help lists are built from the table** — the Game menu's key list, `/keys`, the unlock cards,
   the loading-screen tips and the prompts ("E to talk") all print the live key.

### 10.2 Contexts, from the top

A key goes to the first context that is live and has the key:
`ring` → `chat` (any text box) → `dialog` → `trade` → `sheet` → `map` → `dead` → `travel` (riding a Travel
Method, §5.18) → `classLayer` (while `G` is held, Chronomancer and Tactician only) → `bossDialog` (only
`Alt+1`–`4`) → `mounted`/`flying`/`swimming` → `combat` → `world`. Movement keys fall through the `map`, `trade` and `dialog` contexts to `world`
(because nothing pauses), but not through `sheet` or `chat`.

### 10.3 Chords with Shift

Shift is the sprint key, so a `Shift+key` chord is pressed by accident whenever someone sprints. So:

* **Allowed default chords:** `Shift+Tab` (previous enemy — harmless if hit by mistake), `Shift+1..4`
  (form keys — see below), `Shift+Numpad` (world markers — leaders place them while standing),
  `Shift+click` (links, pins, stacks — mouse, not movement), `Shift+J`, `Shift+M` and `Shift+P` (windows — a
  mistaken press opens a window, nothing worse), and `Shift+Q` (the utility ring — out of combat only; in
  combat it falls through to `Q`, so a sprinting player's class key still works).
* **Form keys:** for a class with forms, pressing 1–4 while Shift is held switches form **instead of
  casting**. Casting already ends a sprint (page 05), so players learn to let go of Shift to cast. If the
  owner dislikes this, the page 04 setting `set.controls.formKeys` offers three layouts: `shiftDigits`
  (default), `ringOnly` (Q hold ring only), `functionKeys` (forms 1–2 on F6 and F7 — the page cancels F6's
  address-bar jump and F7's caret prompt while the game has focus — and forms 3–4 on the ring, because
  F8, F9 and F10 are taken).
* A player may bind any `Shift+key` chord themselves; the Keybinds screen warns "Shift is your sprint key
  — this will fire when you sprint and press G".
* **Ctrl chords are never defaults** (§10.4). **Alt chords are never defaults except `Alt+1`–`4`** for
  boss-dialog replies (canon 00 §10): holding Left Alt already frees the cursor (§2.2), so a player reaching
  for a reply has the pointer free too, and the spell keys stay on `1`–`6`. On Windows (the owner's
  platform) no browser uses `Alt+digit`; on Linux, Chrome and Firefox switch tabs with it and the page cannot
  stop them, so the `E`-hold reply ring (§5.12) is always offered as well. A player may bind other Ctrl/Alt
  chords themselves, with a warning.
* **Class keys** from the class files that used `Shift+Q`, `Shift+R`, `Shift+Z`, `Ctrl+R`, `Alt+1..5` or a
  held `Z` are replaced by the `Q` / `G` / `Shift+1`–`4` slots of §5.16 — no class needs a chord of its own.
  (`Shift+Q` is now the shared utility ring, not a class key.)

### 10.4 Keys the browser owns

Wildmarch runs in a browser tab. Some keys never reach the page, and some reach it but do something
harmful if the page misses them.

| Key | Browser does | Wildmarch |
|---|---|---|
| Esc | leaves full screen and pointer lock | cannot be taken; also the game's close key (Farhold `NEVER_TAKE`) |
| F11 | full screen | never taken (Farhold `NEVER_TAKE`); the game menu has a Full screen button instead |
| F12, Ctrl+Shift+I | developer tools | never taken |
| **F5**, Ctrl+R | reload the page | **taken for party member 5** — the page cancels the reload while the game has focus; Ctrl+R is left alone. A "Leave Wildmarch?" prompt catches anything that slips through. *Change from Farhold, which never takes F5 — see Questions* |
| F1 | browser help (Chrome, Firefox) | taken for Target Self (the page cancels the help) |
| F3, Ctrl+F | find in page | F3 unbound (Firefox would open find); Ctrl+F never taken |
| F6 | move focus to the address bar | unbound by default |
| F7 | caret browsing prompt (Chrome, Firefox) | unbound by default |
| Tab | move focus between links | taken in the world (target), given back inside windows |
| **Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab, Ctrl+1..9, Ctrl+Shift+T** | close tab, new tab, new window, switch tab | **cannot be stopped at all** on Windows (Chrome, Edge, Firefox). **This is why Ctrl is never a held key**: holding Ctrl to "crouch" and pressing W closes the game |
| Alt (alone) | Firefox and Edge show/focus the menu bar | the page cancels it on keydown and keyup while it is the Free Cursor key |
| Alt+1 … Alt+9 | nothing on Windows; **switch tab** in Chrome and Firefox on Linux (cannot be stopped) | `Alt+1`–`4` = boss-dialog replies (canon); the `E`-hold reply ring is the fallback (§5.12) |
| Alt+F4, Alt+Tab, the Windows key | close the window, switch apps, Start menu | never taken |
| Print Screen | Windows grabs it before the page | not used; screenshot is F9 |
| Mouse 4 / Mouse 5 | back / forward in history | the page cancels the navigation (on `mouseup`/`auxclick`) while the game has focus; Mouse 4 is Auto-run's alt, Mouse 5 the follower order's alt (§5.17) |
| Caps Lock | toggles capitals for the whole computer | never bound (chat would come out in capitals) |
| Num Lock | toggles the numpad between numbers and arrows | Auto-run uses it; `code` is the same either way, so target icons still work |
| Space, arrow keys | scroll the page | cancelled while the game has focus (reuse: Farhold cancels Space) |

**Full-screen keyboard lock** (a browser feature, Chromium only, that lets a page in full screen take
Esc, Ctrl+W and similar): v2 **does not use it**, so the rules above hold in every browser.

### 10.5 Hold, tap and toggle

* A **tap** is a press shorter than 0.25 s; a **hold** is longer (`set.controls.holdThreshold`,
  0.15–0.6 s). Keys with both (E, Q, G, Y, `,`, MMB, V, Shift+Q) act on release for a tap and at the
  threshold for a hold. (The first draft's 0.6 s Cleric hold for a group revive is gone with that spell,
  canon W35.)
* Every hold that the player keeps down for a long time can be a toggle instead (page 04
  `set.access.holdOrToggle`): sprint, walk, secondary (block/aim), free cursor, gather, first-person orbit,
  attack (auto-repeat), cast on the watch target (`Y` hold).

### 10.6 Keyboard layouts

Codes are physical positions, so on AZERTY `KeyW` is the key labelled **Z** and it still walks forward.
The Keybinds screen prints the **character the player's keyboard shows** for each code, using the
browser's keyboard-layout lookup where available (Chromium), else the code's name. A one-click preset
"ZQSD (AZERTY)" and "ESDF (shift the hand one key right)" are offered on the Keybinds tab (page 04).

---

## 11. Phones and tablets

**Not a v2 target.** An action RPG with six spells, targeting and boss movement does not fit a touch
screen without a separate design. The page detects touch-only devices and shows a card: "Wildmarch needs a
keyboard and mouse, or a gamepad." *(Lanternfall `prototypes/lanternfall/` has a touch layer that could be
borrowed later.)* See Questions.

---

## 12. Questions for the owner (also to go in `QUESTIONS.md`)

1. **Aim model** — **Resolved (00 §12.1 W8): Tab targeting is the one model.** The Hybrid / Action /
   Classic split is gone; a small **pointer style** option (Mouse-look / Free cursor, §2.2) survives
   because it is how the camera is steered, not how targets work.
2. **F5 for party member 5** — take F5 (cancel the reload while playing), or keep Farhold's "never take F5"
   and use F1–F4 + a different key for member 5? *Recommendation: take it; the leave-page prompt is the
   safety net.*
3. **Form keys on Shift+1–4** — **Resolved (00 §10).**
4. **Unlock levels** — **Resolved (00 §10, §12): page 07's ladder.**
5. **Voice chat** — v2 proposes **none**: text chat, pings, and a quick-chat wheel spoken by your
   character's formant voice. Real voice chat (WebRTC — the browser's built-in person-to-person audio)
   needs a relay server, moderation and a report path. If wanted, it would be party-only with a
   **push-to-talk** key (row `pushToTalk` already reserved, unbound — Mouse 5 went to follower orders, §5.17). Yes or no?
6. **Gliding** — **Resolved (00 §10).**
7. **Gamepad** — in v2 or later? It costs a second input path to test for every screen.
   *Recommendation: v2 plays with a pad (§8) but menus are mouse-first; full pad menus later.*
8. **Settings on `O`** is kept from Farhold. Keep?
9. **Phones** — confirm "not a v2 target".
10. **"Challenge" meant two things** — **Resolved (canon, round 2):** the taunt is **Provoke**; "Challenge"
    now only means Challenge mode.
11. **(new) Auto-target sets your target** (`set.gameplay.autotarget_sets_target`, §2.3) — on by default here,
    because a spell cast at the nearest enemy to your aim point is you choosing it. Off means the frame
    only ever changes by Tab, click or a target key. *Recommendation: on.*
12. **(new) Keep the target on the body when it dies** (§2.6) — the default keeps the dead body
    targeted (you loot it; nothing jumps). The alternative most action games use is "clear it".
    *Recommendation: keep the body.*
13. **(new) Recall Stone on `Home`** (§5.1) — mnemonic but far from the left hand; it is a 10 s
    out-of-combat cast, so reach does not matter. The freed `L` went to Professions. Agree?
14. **(new) Utility ring on `Shift+Q`** (§5.16) — one place for Portal, Retrace, Guiding Call, Heron's
    Flight and the revive rituals. Agree, or put utility spells in the Spellbook only?

---

## 13. Canon change requests (for page 00)

1. **Provoke** — done in canon (the taunt's old name was "Challenge"). Page 06 §3.5 and page 07's
   ladder should use `provoke`.
2. **Name the watch target in canon §4's Targeting row**: "a hard target in one target frame, a target of
   target, and one **watch target** (Wildmarch's focus)". Other pages (05, 11, classes) still say "focus".
3. **Add the four targeting states to 00 §5's template** exactly as §2.3 names them: *Needs target* ·
   *Ally* (Needs target, friendly) · *Auto-target* · *Ground* · *Self*. The template already lists these
   words; this asks that every class file uses them verbatim so the §2.8 test can read them.
4. **Recall Stone key and cooldown** — canon §4 could list "Recall Stone: `Home`, 10 s cast, 30 min
   cooldown" once page 20 confirms the numbers.
