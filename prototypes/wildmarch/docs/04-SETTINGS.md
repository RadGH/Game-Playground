# WILDMARCH — Design Bible, page 04: settings

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.**
**Owns:** every settings tab, every option, its key (`set.<tab>.<key>`), its control, every value a
dropdown offers, its default, what it does, and where it is saved.
**Reads from:** [page 00](00-OVERVIEW.md) (canon), [page 02](02-CONTROLS.md) (every key; the Keybinds tab
is page 02's table made editable), [page 03](03-UI-SCREENS.md) (the Settings screen `scr_settings` and the
HUD pieces these options change), [page 11](11-BOSS-MECHANICS.md) (the telegraph colours the palettes
replace), [page 15](15-SOCIAL-ONLINE.md) (channels, invites, privacy), [page 16](16-TECH.md) (where
settings are stored), [page 17](17-ART-AUDIO.md) (sound buses, voices, graphics budget), [page 19](19-PROFESSIONS.md)
(professions), [page 20](20-TRAVEL.md) (Travel Methods, the Recall Stone).

**Round 2 (canon 00 §12):** the aim-model split, the soft lock, the light/torch and night options, raid
frames, raid tools and PvP beyond duels are removed; a **Targeting** group, a **Travel** group, item-card,
damage-meter and special-rarity options are added; the `set.raid.*` tab is now **Groups** (`set.group.*`).

Rule 6 of page 00 applies: **if an option is added anywhere, it is added here too.**

---

## 1. What Farhold has today (first-hand), and what carries over

Read out of `prototypes/farhold/js/settings.js` and the files it feeds on 2026-09-29.

### 1.1 How Farhold's settings work (reuse: `prototypes/farhold/js/settings.js`)

* **One panel on `O`**, a single scrolling list split into groups: Controls, Picture, Audio, Debug, then
  the Keys, then "Everything back to normal". Also reachable from the Esc pause menu (Resume, Settings,
  Save now, Main menu).
* **Three control kinds:** `toggle` (an On/Off button), `choice` (a row of buttons, one per value) and
  `range` (a slider, with the unit printed beside it — "1.5×", "62°", "75%" — because round D15 found
  "1" and "0.75" meant nothing to a player).
* **Every change applies at once** through one `apply(values, key)` callback in `main.js`, which is also
  run on load before the first frame. Nothing in the panel is a placeholder — D15 found the old "View
  distance: Near/Medium/Full" had never been read by anything, and replaced it with a real multiplier.
* **Saved in the browser** (`localStorage`, key `farhold.settings.v1`), merged over `DEFAULTS` on load so a
  new option gets its default automatically.
* **Reset keys** is one click; **Reset everything** takes two ("Sure? Click again"), and closing the panel
  forgets the first click (D15: it used to wipe everything on one click with no question).
* **URL options** override for testing: `?quality=low` boots the cheapest picture (what the Playwright
  specs use), `?graphics=off|low|high` forces a level; the player picking a level on the panel wins over
  both from then on.

### 1.2 Every Farhold setting, and its fate

| Farhold key | Group | Control | Values | Default | Wildmarch key | Fate |
|---|---|---|---|---|---|---|
| `shoulder` | Controls | choice | Left, Right | Left | `set.controls.shoulder` | **carried** |
| `invertY` | Controls | toggle | | Off | `set.controls.invertY` | **carried** |
| `invertFlight` | Controls | toggle | | Off | — | **dropped** (no flight) |
| `sensitivity` | Controls | range 0.3–2.5, step 0.1 | × | 1 | `set.controls.mouseSensitivity` | **carried** |
| `fov` | Picture | range 55–100, step 1 | ° | 62 | `set.controls.fov` | **carried**, moved to Controls → Camera |
| `viewDistance` | Picture | range 1–6, step 0.5 | × (1× = 1,818 m, 6× = 10,905 m on Farhold's clipmap) | 1 | `set.graphics.viewDistance` | **carried**, preset-driven |
| `density` | Picture | range 0–6, step 0.25 | × ("Trees and rocks") | 1 | `set.graphics.scatterDensity` | **carried**, preset-driven |
| `grass` | Picture | toggle | | On | `set.graphics.grass` | **carried** |
| `grassDistance` | Picture | choice | Near (38 m), Medium (70 m), Far (110 m), Very far (150 m), Extreme (200 m) | Very far | `set.graphics.grassDistance` | **carried**, all five values |
| `graphics` | Picture | choice | Off, Low, High | High | `set.graphics.preset` | **replaced** by Low/Medium/High/Ultra/Custom (§7.2: Off→Low, Low→Medium, High→High) |
| `sunfx` | Picture | toggle | ("Sun rays and flare") | On | `set.graphics.sunFlare` | **carried** |
| `damageNumbers` | Picture | toggle | | On | `set.interface.damageNumbers` | **carried**, widened to a dropdown |
| `hitStop` | Picture | toggle | ("Impact freeze") | On | `set.access.hitStop` | **carried**, moved to Accessibility |
| `screenShake` | Picture | toggle | | On | `set.access.screenShake` | **carried**, widened to a 0–100% slider |
| `coords` | Picture | toggle | ("Show coordinates") | Off | `set.interface.showCoordinates` | **carried** |
| `sound` | Audio | toggle | | On | `set.audio.enabled` | **carried** |
| `voices` | Audio | toggle | | On | `set.voice.voices` | **carried**, moved to Voice & Speech |
| `volume` | Audio | range 0–1, step 0.05 | % | 75% | `set.audio.master` | **carried** |
| `debugTeleport` | Debug | toggle | (map "Go here") | **On** | `set.debug.mapTeleport` | **carried**, dev builds only, default **Off** |
| `showHitboxes` | Debug | toggle | ("Show swing hit boxes") | Off | `set.debug.showHitboxes` | **carried** |
| `keys` | Keys | 19 key-capture rows | | (see page 02 §1.2) | `set.keybinds.*` | **carried** as page 02's table |

### 1.3 Farhold settings that live outside the panel

| Where in Farhold | What | Wildmarch |
|---|---|---|
| Log tab filter checkboxes (`hud.js` `LOG_KINDS`, R25) | 7 kinds: Damage you deal, Damage you take, Pet damage dealt, Pet damage taken, XP and gold, Loot, Everything else | **carried** into `set.interface.log*` (§5.10), with new kinds |
| Minimap `+`/`-` (`hud.minimapSpan`, 8–120 cells, not saved) | minimap zoom | **carried** as `set.interface.minimapZoom`, now saved |
| Perk tree "Names" checkbox (`#perk-labels`) | show node names on the perk forest | **carried** as `set.interface.perkNames` |
| `shared/langdebug.js` settings box | Language debug toggle; Export / Import / Submit overrides | **carried** into Voice & Speech (dev) |
| `balance.json` `sound.method` | the Sound Lab's maker: hybrid / synth / library / retro | **exposed** as `set.audio.soundStyle` |
| `sfx/js/sfx.js` bus volumes (exist, never exposed in Farhold) | sfx, ui, ambience buses | **exposed** in Audio |
| Title screen world options | Habitable start; Planet size (Super tiny 16×8 km … Full 163×82 km, default Small); Zones (Many 3×, Some 2×, Few 1×, Very few 0.6×); Level ladder (1–30, 1–50, 1–100); Level band (Tight 3, Normal 4, Wide 6); Enemies (Quiet 0.6×, Normal, Busy 1.6×, Swarming 2.4×) | **dropped.** Wildmarch is one shared hand-shaped continent with a level cap of 60 (canon); a world cannot be re-rolled per player |

---

## 2. How settings work in Wildmarch

### 2.1 The window (`scr_settings`, page 03 owns the layout)

* Opened by **`O`** (alt **F10**), the Game menu's **Settings** button, or `/settings`. It does **not** pause the game
  (nothing pauses online), so it opens as a large window with the world visible behind it.
* **Tabs down the left** (in this order): Gameplay (groups: Targeting, Travel, General, Class) · Controls ·
  Keybinds · Interface · Combat · Groups · Graphics · Audio · Voice & Speech · Accessibility · Social ·
  Online · Debug (only in dev builds). *Combat (`set.combat.*`) was added in the 2026-09-29 reconciliation
  pass; **Groups** (`set.group.*`) replaced "Raid & groups" (`set.raid.*`) in round 2 (§7b).*
* **A search box** at the top filters every option on every tab by label and by what it does.
* A **dot** beside any option not at its default; a small ↺ on the row resets that one option.
* **Every change applies live** (Farhold rule — no Apply button), with two exceptions that take a
  "Keep these settings? Reverting in 15 s" prompt: anything that changes render scale or anti-aliasing,
  and switching the pointer style (both can leave a player unable to reach the button).
* Footer: **Reset this tab** (one click, then "Sure?"), **Reset everything** (two clicks — reuse D15),
  **Export** (downloads `wildmarch-settings.json`), **Import** (reads one back; unknown keys ignored, bad
  values replaced with the default and listed).
* Controls: **toggle** (On/Off switch), **slider** (with min, max, step and the unit printed — reuse
  `shared/format.js`), **dropdown** (a real `<select>` when there are more than 4 values, a button row when
  4 or fewer — Farhold's `choice`), **key capture** (click, press, Esc cancels — reuse), **colour picker**
  (the browser's `<input type=color>` plus a hex field).

### 2.2 Where a setting is saved — the scope column

| Scope | Saved | Follows you to | Examples |
|---|---|---|---|
| **Device** (D) | this browser's `localStorage`, key `wildmarch.settings.device.v1` | only this computer and browser | graphics, audio output, render scale, gamepad deadzones |
| **Account** (A) | the server, on your account record | every computer you log in on, every character | targeting, keybinds (by default), accessibility, social privacy, chat filters |
| **Character** (C) | the server, on the character record | that character only | show helm, follower stance, action-bar layout choices, the per-character keybinds override |

* A device setting is written the moment it changes (Farhold behaviour). Account and character settings
  are written to the server 2 s after the last change (so dragging a slider sends one request) and also
  cached in `localStorage` so the game starts correctly before the server answers, and works if the
  connection drops.
* Only values **different from the default** are saved (reuse: Farhold's `keys: {}` rule, widened to
  every option), so changing a default later reaches everyone who never touched it.
* Accessibility options are **Account** so a player who needs them never has to set them twice; the
  telegraph palette is also shown on the **first launch** screen before the character list.

### 2.3 Data shape (page 16 owns the file name; proposal `data/settings.json`)

```json
{
  "version": 1,
  "tabs": ["gameplay", "controls", "keybinds", "interface", "combat", "group", "graphics", "audio",
           "voice", "access", "social", "online", "debug"],
  "options": [
    {
      "key": "set.graphics.shadows",
      "label": "Shadows",
      "tab": "graphics",
      "group": "Lighting",
      "control": "dropdown",
      "values": [["off", "Off"], ["low", "Low"], ["medium", "Medium"], ["high", "High"], ["ultra", "Ultra"]],
      "default": "high",
      "preset": true,
      "scope": "device",
      "origin": "new",
      "help": "Sun shadows. Low: 1024 px map, 2 cascades, 110 m. Ultra: 4096 px, 4 cascades, 340 m."
    },
    {
      "key": "set.audio.ambience",
      "label": "Ambience",
      "tab": "audio",
      "control": "slider", "min": 0, "max": 0.6, "step": 0.05, "unit": "%",
      "default": 0.6,
      "scope": "device",
      "origin": "reuse: sfx/js/sfx.js BUS_CAP"
    }
  ]
}
```

A test must check: every option has a key, label, control, default and scope; every dropdown default is
one of its values; every slider default is inside min–max and on a step; every option is **read by some
code** (the Farhold D15 lesson: an option nothing reads is a lie). Per the playground memory note
*testing dead data rules*: the test sets each option to an unusual value and asks the module that owns it
whether it changed — comparing the file to a constant would pass against an orphan.

### 2.4 URL options (dev and testing, reuse Farhold)

| URL | Does |
|---|---|
| `?quality=low` | boot on the Low preset and ignore saved graphics (the Playwright specs) |
| `?graphics=low\|medium\|high\|ultra` | boot on that preset |
| `?dev=1` | show the Debug tab and the `` ` `` debug menu (dev server only; ignored on the live server) |
| `?pointer=mouselook\|free` | force a pointer style for the session (page 02 §2.2) |
| `?palette=<id>` | force a telegraph palette, one of `set.access.telegraph_palette`'s values (for screenshot tests of each palette) |

---

## 3. Gameplay (`set.gameplay.*`)

### 3.1 Targeting (new — page 02 §2 owns the rules)

Tab targeting is the one model (canon 00 §12.1 W8). The first draft's `aimMode` (Hybrid / Action /
Classic), `softLockCone`, `tabCone`, `keepTargetRange` and `selfCast` are **gone**; the only camera choice
left is `set.controls.pointerStyle` (§4.1). Every option here changes **how a key picks a target**, never
lets the target frame change by itself (page 02 §2.6).

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `autotarget_sets_target` | Auto-target spells set my target | toggle | | **On** | when an Auto-target spell or ranged basic attack has no valid target and picks the enemy nearest your aim point, that enemy becomes your hard target. Off: it is hit, your target stays empty (page 02 §2.3) | A | new |
| `autotarget_cone` | Auto-target reach from the aim point | slider | 10°–45°, step 5° | 25° | how far from the aim point (as an angle) an enemy can be and still be picked | A | new |
| `self_cast_fallback` | Friendly spells fall back to me | toggle | | **Off** | a heal or buff (an **Ally** spell) pressed with no friendly target, or with an enemy targeted, goes to you. Off: it refuses with "No friendly target." (no silent self-cast, canon W8) | A | new |
| `heal_target_of_target` | Friendly spells on an enemy go to whoever it attacks | toggle | | Off | with an enemy targeted, an Ally spell goes to that enemy's target if it is friendly | A | new |
| `mouseover_cast` | Mouse-over casting | dropdown | Off · Frames only · Frames and the world | Frames only | with a free cursor over a party frame (or, on "Frames and the world", a body or nameplate), a spell key casts on the hovered unit without changing your target | A | new |
| `ground_at_target` | Ground spells land on my target | toggle | | Off | a Ground spell lands at your hard target's feet instead of at the aim point | A | new |
| `target_on_attack` | Target the first enemy my basic attack hits | toggle | | On | only when you have **no** target; never replaces one you chose | A | new |
| `tab_order` | Tab picks | dropdown | Nearest in front of the camera first · Nearest to the aim point first · Enemies fighting my group first · Lowest health first | Nearest in front of the camera first | the order Tab cycles in (page 02 §2.5) | A | new |
| `tab_range` | Tab reaches | slider | 20–60 m, step 5 | 40 m | how far Tab looks | A | new |
| `tab_behind` | Tab turns to enemies behind me when none are in view | toggle | | On | with nothing on screen, Tab takes the nearest enemy in any direction and turns the camera 0.3 s toward it | A | new |
| `tab_combat_only` | Tab skips enemies that are not fighting | toggle | | Off | so Tab never picks a sleeping pack by accident | A | new |
| `on_target_death` | When my target dies | dropdown | **Keep the body targeted** · Clear my target · Take the next enemy (as Tab) | Keep the body targeted | the only setting that can switch targets for you is the third value (page 02 §2.6) | A | new |
| `target_ring` | Ring under my target | dropdown | Gold ring · Gold ring and outline · Outline only | Gold ring and outline | how your hard target is marked in the world | A | new |

### 3.2 Travel (new — page 20 owns routes, fares and the Recall Stone's numbers)

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `auto_board` | Board by myself when my route departs | toggle | | **On** | with a route picked on a station board and you within 30 m, you board when the vehicle is ready (page 02 §5.18, page 03 §12.17) | A | new |
| `travel_stop_default` | Get off at | dropdown | The end of the line · Ask me on boarding | The end of the line | where you get off unless you pick a stop | A | new |
| `travel_camera` | Camera while riding | dropdown | Follow the vehicle · Free orbit | Follow the vehicle | the camera behind the wagon / strider / boat, or free to orbit | A | new |
| `recall_confirm` | Ask before using the Recall Stone | toggle | | Off | a "Return to {place}?" confirm before the 10 s cast | A | new |

(`set.social.boardWithParty` — party members get "Board with {name}?" — is in Social, §11.)

### 3.3 Everything else in Gameplay

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `dismountToCast` | Casting gets me off my mount | toggle | | On | pressing a spell key while riding dismounts and casts; Off = the key does nothing and says so | A | new |
| `autoLoot` | Loot everything when I open a body | toggle | | Off | On: E on a body takes everything that fits; Off: the loot window opens | A | new |
| `loot_filter` | Ground loot labels | dropdown | All · Uncommon and up · Rare and up · Epic and up | All | which dropped items show a name label (Left Alt shows every label while held, page 02) — page 08 key | A | new |
| `autoPickupGold` | Pick up gold by walking over it | toggle | | On | gold within 2 m goes straight into your purse | A | new |
| `lootNotice` | Show loot as | dropdown | Rewards card (reuse `shared/rewards.js`) · Toast in the corner · Chat line only | Rewards card | how a pickup is announced (Rare and up, and every special rarity, always get at least a toast) | A | reuse |
| `confirmSellRarity` | Ask before selling | dropdown | Never · Rare and up · Epic and up · Unique, Set and Legendary only | Epic and up | a "Sure?" before selling items of that rarity or better (special rarities always ask) | A | new |
| `confirmSalvageRarity` | Ask before salvaging | dropdown | Never · Uncommon and up · Rare and up · Epic and up | Rare and up | same, for salvage (reuse: Farhold recycle, page 08) | A | reuse |
| `confirmBuyOver` | Ask before buying anything over | dropdown | Never · 100 gold · 1,000 gold · 10,000 gold | 1,000 gold | a "Sure?" before an expensive buy | A | new |
| `autoSheathe` | Put weapons away out of combat | toggle | | On | weapons go on the back 5 s after combat ends | C | new |
| `showHelm` | Show my helm | toggle | | On | draw your head slot (others see what you choose) | C | new |
| `showCloak` | Show my cloak | toggle | | On | same for the back slot | C | new |
| `showShoulders` | Show my shoulder pieces | toggle | | On | same | C | new |
| `showTool` | Show my tool when not harvesting | toggle | | Off | draw the harvesting tool on your belt or back | C | new |
| `followerStance` | Followers | dropdown | Aggressive — attack anything near you · Defensive — attack what attacks you or your target · Passive — never attack, just follow | Defensive | how hired and class followers fight (page 05, reuse Farhold `js/followers.js`) | C | reuse |
| `followerSlots` | Followers fill empty party slots | toggle | | On | when you form a group, followers leave to make room; Off = they leave only when a real player joins | C | new |
| `auto_accept_shared` | Accept quests shared by my party | toggle | | Off | shared quests are accepted without a card (page 14 §5.7 key; was `autoAcceptShare`) | A | new |
| `sharePins` | Share my map pins with my party | toggle | | On | Shift+click pins show on your party's maps | A | reuse (Farhold pins) |
| `tutorialTips` | Help cards for new things | toggle | | On | the one-time explanation card when you meet a new system (canon rule 5 still shows the unlock card) | A | reuse (Farhold onboarding) |
| `unlockCard` | Unlocks appear as | dropdown | Full card with a sound · Toast only | Full card with a sound | how a feature unlock is announced | A | new |
| `sprintAutoEnd` | Sprint ends when I cast | toggle | | On | page 05 rule; Off keeps sprinting after an instant spell (still ends on cast-time spells) | A | new |
| `deathRecap` | Show what killed me | toggle | | On | on death, a card listing the last 5 hits (reuse: meters/ drill-down) | A | reuse |
| `language` | Language | dropdown | English | English | the only language in v2; the dropdown exists so the strings are kept in one place (Lingo) | A | new |

### 3.4 Class options (shown only to that class; asked for by the class files)

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `bard_song_ring` | Show my song's range ring | toggle | | On | the faint dotted 20 m ring in the song colour, seen only by the bard (`classes/bard.md`) | C | new |
| `bard_beat_cue` | Beat cue | toggle | | On | a shrinking ring on the `Q` / `1`–`6` keys that closes on the beat, plus a soft click (`classes/bard.md`) | C | new |
| `bard_beat_sound` | Beat click | toggle | | On | the click alone, without the ring | C | new |
| `necro_corpse_markers` | Corpse markers | toggle | | On | a bone glyph with a draining 30 s ring over every usable corpse (`classes/necromancer.md`) | C | new |
| `cleric_keeping_vigil` | Keeping Vigil | toggle | | On | the level-40 passive that spends 25 Devotion to leave a warded ally at 1 health instead of dying; Off keeps the Devotion for Raise (`classes/cleric.md` §2.3) | C | new (replaces the first draft's automatic group-revive option, gone with that spell, canon W35) |
| `chrono_ghost_opacity` | Ghost opacity | slider | 0–100%, step 5 | 45% | how solid your 5-second Ghost is drawn (`classes/chronomancer.md`) | C | new |
| `oracle_omen_auto` | Spend Omens automatically | toggle | | On | the next heal spends an Omen (instant, +50%); hold the second class key `G` while casting to keep it (page 02 §5.16; `classes/oracle.md`) | C | new |
| `dh_weakpoint_sound` | Weak-point sound | toggle | | On | the cue when Demonsight reveals a weak point (`classes/demon_hunter.md`) | C | new |
| `beast_trick_auto` | Defensive beast uses its trick on cooldown | toggle | | Off | a Defensive tamed beast also uses its special move by itself, not only on `G` (`classes/ranger.md`) | C | new |
| `beast_frame` | Show my tamed beast's frame | toggle | | On | the beast's small frame under yours, with health and its temper (`hud_pet`, page 03) | C | new |
| `beast_revive_prompt` | Remind me to revive my beast | toggle | | On | when your tamed beast is dead and you leave combat, a one-line prompt to cast its revive ritual | C | new |

---

## 4. Controls (`set.controls.*`)

### 4.1 Mouse and camera

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `pointerStyle` | Pointer style | button row | **Mouse-look** — the pointer is locked, the mouse turns the camera, a reticle marks the aim point · **Free cursor** — the pointer is free; hold right mouse to turn the camera, A/D turn | Mouse-look | page 02 §2.2; targeting works the same in both. Asks to confirm (15 s revert). Replaces the first draft's `set.gameplay.aimMode` | A | new |
| `autoAttack` | Keep swinging at my target | toggle | | Off (On in Free cursor) | your basic attack repeats on your hard target while it is in reach, without holding the button | A | new |
| `mouseSensitivity` | Mouse sensitivity | slider | 0.3×–2.5×, step 0.1 | 1.0× | how fast the camera turns (Farhold: 0.0026 rad per px sideways, 0.0022 up/down at 1×) | D | reuse |
| `mouseSensitivityY` | Up/down sensitivity | slider | 0.5×–2.0× of the above, step 0.1 | 1.0× | separate vertical speed | D | new |
| `invertY` | Invert look | toggle | | Off | mouse forward looks down | A | reuse |
| `shoulder` | Camera shoulder | button row | Left · Right | Left | which side the camera sits (`B` swaps in play) | A | reuse |
| `shoulderOffset` | Shoulder offset | slider | 0–1.2 m, step 0.05 | 0.85 m | how far to the side (0 = centred behind you) | A | reuse (balance `shoulderOffset`) |
| `cameraDistance` | Camera distance | slider | 1.2–12 m, step 0.1 | 7.5 m | the starting zoom (the wheel changes it in play) | A | reuse (Farhold `camDistance` 7.5) |
| `zoomToFirstPerson` | Zooming all the way in goes to first person | toggle | | On | page 02 §5.1 | A | new |
| `fov` | Field of view | slider | 55°–100°, step 1° | 62° | how wide the view is | D | reuse |
| `fovFirstPerson` | First-person field of view | slider | 55°–110°, step 1° | 75° | FOV while in first person | D | new |
| `cameraSmoothing` | Camera smoothing | slider | 0–100%, step 5 | 20% | how softly the camera catches up with the character (0 = rigid) | A | new |
| `cameraAutoFollow` | Camera swings behind me when I run | dropdown | Never · When moving · Only on a mount | Only on a mount | the camera slowly turns to face your direction | A | new |
| `bossCameraPullback` | Pull the camera back in boss fights | toggle | | On | +3 m of zoom-out allowance during a boss encounter so big telegraphs fit on screen | A | new |
| `adTurns` | A and D turn instead of strafe | toggle | | Off (On in Free cursor) | page 02 §2.2 | A | new |
| `reticleStyle` | Reticle | dropdown | Dot · Small cross · Circle · Circle with dot · Chevron | Circle with dot | the aim point's mark in Mouse-look (Farhold uses a dot); it never targets anything by itself | A | reuse |
| `reticleSize` | Reticle size | slider | 50–200%, step 10 | 100% | | A | new |
| `reticleColour` | Reticle colour | colour picker | any | #FFFFFF (with a 1 px dark edge) | | A | new |
| `reticleHitMarker` | Show a mark when I hit | toggle | | On | the reticle flashes an X for 0.1 s on a hit | A | new |

### 4.2 Keys and timing

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `holdThreshold` | Hold time | slider | 0.15–0.6 s, step 0.05 | 0.25 s | how long a press counts as a hold (E harvest, Q ring, Y watch-cast, Shift+Q utility ring, middle-mouse wheel) | A | new |
| `formKeys` | Form and stance keys | dropdown | Shift + 1–4 · Class key ring only · F6 and F7, the rest on the ring | Shift + 1–4 | page 02 §10.3 | A | new |
| `doubleTapDodge` | Double-tap a direction to dodge | toggle | | Off | W W, A A, S S or D D within 0.25 s rolls that way | A | new |
| `dodgeDirection` | Dodge goes | dropdown | The way I am moving · The way the camera faces · Always backward when standing still | The way I am moving | page 02 `dodge` | A | new |
| `spellQueueWindow` | Spell queue window | slider | 0–0.5 s, step 0.05 | 0.4 s | how early a spell key is remembered before it can fire (reuse: combat-feel input buffer) | A | reuse |
| `castOnKeyDown` | Cast when the key goes down | toggle | | On | Off = cast on release (some players prefer it for ground-aimed spells) | A | new |
| `groundCast` | Ground-aimed spells | dropdown | Cast at the aim point at once · Show a circle, second press to cast · Show a circle while held, cast on release | Show a circle while held, cast on release | how a **Ground** spell is placed (page 02 §2.3; `set.gameplay.ground_at_target` puts it on your target instead) | A | new |

### 4.3 Gamepad (new — Farhold has none)

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `padEnabled` | Use a gamepad | toggle | | On (does nothing without one) | read a connected controller | D |
| `padLayout` | Stick layout | dropdown | Default · Southpaw (sticks swapped) · Classic (move on LS, turn on LS sideways) | Default | | A |
| `padButtonIcons` | Button icons | dropdown | Automatic · Xbox · PlayStation · Generic (1–4) | Automatic | which icons prompts show | D |
| `padLeftDeadzone` | Move stick dead zone | slider | 0–30%, step 1 | 12% | how far the stick moves before anything happens | D |
| `padRightDeadzone` | Look stick dead zone | slider | 0–30%, step 1 | 10% | | D |
| `padLookSpeedX` | Look speed, sideways | slider | 0.3×–3.0×, step 0.1 | 1.0× | | A |
| `padLookSpeedY` | Look speed, up/down | slider | 0.3×–3.0×, step 0.1 | 0.8× | | A |
| `padInvertY` | Invert look (pad) | toggle | | Off | | A |
| `padCurve` | Look stick response | dropdown | Linear · Exponential (fine aim near the centre) · Dynamic (speeds up when held at the edge) | Exponential | | A |
| `padTriggerThreshold` | Trigger press point | slider | 10–90%, step 5 | 30% | how far a trigger goes down to count | D |
| `padVibration` | Vibration | slider | 0–100%, step 10 | 60% | rumble on hits and boss slams (where the browser supports it) | D |
| `padSprintMode` | Sprint on LS click | dropdown | Toggle · Hold | Toggle | | A |
| `padLayerHint` | Show spells when LB/RB is held | toggle | | On | page 02 §8 | A |

---

## 5. Keybinds (`set.keybinds.*`)

This tab is page 02's binding table made editable. Every row there is a row here. **Page 02 owns the
actions, defaults, contexts and unlocks**; this section owns how the tab behaves.

| Key | Label | Control | Values | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `<actionId>` (one per page 02 row, e.g. `set.keybinds.dodge`) | the action's label | key capture × 3 columns: **Key**, **Alt key**, **Pad** | any key/chord/mouse button/pad button not reserved | page 02's default | click a cell, press the key; Esc cancels (reuse Farhold) | A (or C, below) |
| `perCharacter` | Use separate keys for this character | toggle | | Off | On: this character's changes are saved on the character, not the account | C |
| `preset` | Start from | dropdown | Default · ZQSD (AZERTY keyboards) · ESDF (hand one key right) · Arrow keys (move on arrows, spells on the right-hand keys) · Left-handed (IJKL move, numpad spells) · Turn keys (A/D turn, Q/E strafe; the class key and interact move to other keys, which the preset lists) | Default | replaces every key with the preset's (asks first); the player's own changes are then saved as differences from Default | A |
| `showUnlocked` | Show keys I have not unlocked | toggle | | On | locked rows show a padlock and "Unlocks at level 5 (quest: Fall and Rise)"; they can still be rebound (page 02 §3) | A |
| `resetKeys` | Reset keys | button | | | back to the preset's defaults (one click, reuse Farhold) | — |
| `exportKeys` / `importKeys` | Export keys / Import keys | buttons | | | `wildmarch-keys.json` on its own | — |
| `pushToTalk` | Push to talk | key capture | | (unbound) | reserved for voice chat if the owner wants it (page 02 §12) | A |

**Rules shown on the tab** (all from page 02 §10): binding a taken key **swaps** the two and says so;
reserved browser keys cannot be captured (the cell says why: "F11 is the browser's full screen");
a `Shift+` chord shows the sprint warning; a Ctrl/Alt chord shows the browser warning; the tab has a
search box and groups (Movement, Combat, Class, Targeting, Pings & markers, Followers, Boss dialog, Windows,
Chat, Camera, Interface, Mounted, Travel).

---

## 6. Interface (`set.interface.*`)

### 6.1 Overall

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `uiScale` | Interface size | slider | 50–200%, step 5 | 100% | scales every HUD piece and window | D | new |
| `uiOpacity` | Interface opacity out of combat | slider | 30–100%, step 5 | 100% | the HUD fades to this when nothing is happening | A | new |
| `editLayout` | Move and resize HUD pieces | button | | | unlocks every HUD piece to drag, with a grid; Esc or Done locks it | — | new |
| `framesUnlocked` | Frames can be dragged | toggle | | Off | leave frames movable while playing | C | new |
| `layoutPreset` | HUD layout | dropdown | Standard · Centred (bars and frames round the reticle) · Healer (party frames centre-bottom, larger) · Minimal · Custom | Standard | page 03 owns what each looks like | C | new |
| `actionBar` | Spell bar | dropdown | Bottom row · Split either side of the centre · Arc under the reticle | Bottom row | | C | reuse (Farhold bar) |
| `keyHints` | Show keys on the spell bar | toggle | | On | prints the live key on each slot (reuse: Farhold `drawKeyHint`) | A | reuse |
| `cooldownNumbers` | Cooldown numbers | toggle | | On | seconds left written on a spell on cooldown | A | new |
| `cooldownSweep` | Cooldown sweep | toggle | | On | the dark clock-hand wipe | A | new |
| `reticleBars` | Health and resource beside the reticle | dropdown | Off · In combat · Always | In combat | two thin arcs either side of the reticle | A | new |
| `showCoordinates` | Show coordinates | toggle | | Off | x, z, altitude under the minimap (reuse Farhold `coords`) | A | reuse |
| `clock` | Clock | toggle | | Off | real time beside the minimap. There is no game clock: always daylight (canon 00 §4) | A | new |
| `clockFormat` | Clock format | button row | 12-hour · 24-hour | 12-hour | | A | new |
| `units` | Distances in | button row | Metres · Feet | Metres | every distance on screen (the owner thinks in feet; data stays in metres) | A | new |
| `numberFormat` | Big numbers | button row | Full (12,345) · Short (12.3k) | Short | (reuse `shared/format.js`) | A | reuse |
| `xpBar` | Experience bar | dropdown | Off · Bar · Bar with numbers | Bar with numbers | at 60 it shows your tracked reputation (page 03 §4.10); no rested XP | A | reuse |
| `objectiveTracker` | Objective tracker | toggle | | On | the tracked quest steps on the right (reuse: Farhold round 10 tracked objective) | A | reuse |
| (quests in the tracker) | see `quest_tracker_max`, §6.11 | | | | *was `trackerMax` (1–10, default 5); replaced by page 14's key* | | |
| `perkNames` | Names on the perk forest | toggle | | Off | reuse Farhold `#perk-labels` | A | reuse |
| `itemLevelOnIcons` | Item level on item icons | toggle | | On | | A | new |
| `rarityLetters` | Rarity letter on item icons | toggle | | Off | C/U/R/E/Q/S/L in a corner (also in Accessibility) | A | new |
| `specialRarityIcons` | Special-rarity icons in chat | toggle | | On | the bespoke Electrified / Starwoven / Twinned / Ancient / Living icon before an item's name in chat links and chat lines (page 03 §14.3.1). The item card always shows its own | A | new |
| `screenshotHideUi` | Screenshots without the interface | toggle | | Off | F9 hides the HUD for the one frame | A | new |
| `damageDirection` | Show which way a hit came from | toggle | | On | a red arc at the screen edge | A | new |
| `lowHealthEdge` | Low health warning | dropdown | Off · Edge glow · Edge glow + heartbeat sound | Edge glow | below 30% health | A | new |

### 6.2 Nameplates

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `plateEnemies` | Enemy nameplates | dropdown | Always · In combat · My target only · Never | Always | the name + health bar over enemies | A |
| `plateFriendlyPlayers` | Other players | dropdown | Always · Party only · Never | Always | | A |
| `plateNpcs` | NPC names | dropdown | Always · Within 20 m · Never | Within 20 m | | A |
| `plateFollowers` | Followers and pets | dropdown | Always · Mine only · Never | Mine only | | A |
| `plateSelf` | My own name | toggle | | Off | | A |
| `plateDistance` | Nameplate distance | slider | 20–80 m, step 5 | 40 m | | A |
| `plateHealthText` | Health on nameplates | dropdown | None · Percent · Value · Value and percent | Percent | | A |
| `plateCastBars` | Enemy cast bars on nameplates | toggle | | On | grey = cannot interrupt, gold edge = can (canon vocabulary) | A |
| `plateMyDebuffs` | My effects on enemy nameplates | toggle | | On | your DoTs and statuses as small icons with timers | A |
| `plateOverlap` | Nameplates | button row | Stack (never overlap) · Overlap | Stack | Overlap helps at a crowded world boss | A |
| `plateGuild` | Guild names | toggle | | On | | A |
| `plateTitles` | Titles | toggle | | On | "Kaela the Unbent" | A |
| `plateClassColour` | Player names in class colours | toggle | | On | | A |
| `plateThreat` | Threat colour on enemy nameplates | toggle | | On (tanks), Off (others) | edge colour: grey = not on you, amber = rising, red = attacking you (page 05) | C |
| `plateScale` | Nameplate size | slider | 60–160%, step 10 | 100% | | A |
| `plateRareMarks` | Monster rarity on nameplates | toggle | | On | champion packs' blue names and shared affix, rares' yellow names, star and affixes, named titles, boss crowns (page 03 §4.16; reuse Farhold champion/rare auras for the world glow) | A |
| `plateRarityAffixes` | Show monster affixes on nameplates | dropdown | Off · Champions and rares · Also greater rarities' badges only | Champions and rares | the affix words under the name | A |
| `plateGreaterBadges` | Greater-rarity badges | toggle | | On | the Giant / Flaming / Electrified / Frozen … badge before the name and the red double edge. Recommended on: a greater rarity is a big difficulty spike | A |

### 6.3 Damage and healing numbers

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `damageNumbers` | Damage numbers | dropdown | Off · Mine · Mine and my party's · Everyone's | Mine | Farhold toggle, widened | A | reuse |
| `damageNumberStyle` | Numbers move | dropdown | Float up · Arc out to the side · Stack beside the target | Float up | | A | reuse (Farhold floats up) |
| `damageNumberSize` | Number size | slider | 60–160%, step 10 | 100% | | A | new |
| `incomingDamage` | Damage I take | toggle | | On | red numbers by your character | A | new |
| `healingNumbers` | Healing numbers | dropdown | Off · Mine · Mine and received · Everyone's | Mine and received | | A | new |
| `overhealNumbers` | Show overhealing | toggle | | Off | the wasted part in brackets | A | new |
| `critStyle` | Critical hits | dropdown | Bigger · Bigger and shaken · Same as others | Bigger | | A | new |
| `mergeWindow` | Merge rapid hits | dropdown | Off · 0.25 s · 0.5 s · 1 s | 0.5 s | adds up ticks landing close together so a DoT reads "84" not "1 1 1…" (Farhold round 7 lesson) | A | reuse |
| `statusText` | Status words | toggle | | On | "Stunned", "Immune", "Resisted", "Absorbed 120" | A | new |

### 6.4 Cast bars and boss frames

| Key | Label | Control | Values | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `castBar` | My cast bar | dropdown | Off · Above the spell bar · Under the reticle | Under the reticle | | A |
| `castBarLatency` | Show latency on my cast bar | toggle | | On | the red end = the time the server needs, so you can queue the next key | A |
| `targetCastBar` | Target's cast bar | toggle | | On | under the target frame | A |
| `watchCastBar` | Watch target's cast bar | toggle | | On | on the watch frame (page 02 §2.7); its border pulses gold when the cast can be interrupted | A |
| `targetOfTarget` | Target-of-target frame | toggle | | On | who your target is targeting (page 03 §4.4) | A |
| `watchFrame` | Watch frame | toggle | | On | the watch target's frame (hidden when you have none) | A |
| `bossFrames` | Boss frames | dropdown | Top centre · Right side · Under the target frame | Top centre | up to 5 boss frames (page 03) | C |
| `bossCastBar` | Boss cast bar | dropdown | Top centre, large · Under the boss frame | Top centre, large | canon: grey = cannot interrupt, gold border = interruptible | A |
| `bossHealthText` | Boss health | dropdown | Percent · Value · Both | Percent | | A |
| `boss_timers` | Boss ability timers | dropdown | Off · Next ability only · Full timeline (next 30 s) | Next ability only on **Normal**; Off on Challenge (page 11 §4.3) | a small bar per upcoming big mechanic with its countdown, under the boss frame, from page 11's fight scripts; so nobody needs an add-on. Shows **only mechanics this character has seen before** on that boss (page 11: learned, not spoiled). *Page 11's key; was `bossTimeline`* | A |
| `bossBanner` | Boss speech banner | dropdown | Large, centre · Small, top | Large, centre | canon: a line is often the warning. **Cannot be turned off** | A |
| `enrageTimer` | Enrage timer | toggle | | On | the countdown on the boss frame | A |
| `phaseMarks` | Phase marks on the boss health bar | toggle | | On | ticks at the health % where phases change | A |

### 6.5 Party frames

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `partyFrames` | Party frames | dropdown | Left side · Bottom centre · Hidden | Left side | the five party frames (page 03 §4.5). Raid frames are not in v2 (canon W16, `WISHLIST.md`) | C |
| `partyFramesSolo` | Show party frames when I only have followers | toggle | | On | followers count as party (canon pillar 6) | C |
| `partySort` | Sort party frames by | dropdown | Join order (`F2`–`F5` follow it) · Role (tank, healer, damage) | Join order | the F-key targets follow the order shown | C |
| `partyDebuffs` | Debuffs on party frames | dropdown | Off · Ones I can remove · Boss debuffs · All | Boss debuffs + ones I can remove | | C |
| `partyBuffs` | Buffs on party frames | dropdown | Off · Mine · All | Mine | your heals-over-time and shields | C |
| `partyResource` | Resource bars on party frames | dropdown | Healers only · All · None | All | | C |
| `rangeFade` | Fade party members out of range | toggle | | On | frames of members beyond 40 m drop to 50% | A |
| `partyKeyHints` | Show F-keys on party frames | toggle | | On | the small "F2"…"F5" in each row's corner | A |
| `incomingHeals` | Show incoming heals | toggle | | On | a lighter bar ahead of the health bar | A |
| `absorbShields` | Show shields | toggle | | On | a striped bar for absorbs | A |
| `partyAggro` | Show who has aggro | toggle | | On | red edge on a frame being attacked by a monster when that member is not a tank | A |

### 6.6 Buffs and debuffs (your own)

| Key | Label | Control | Values | Default | Scope |
|---|---|---|---|---|---|
| `buffPosition` | My buffs | dropdown | Top right · Beside my frame · Above the spell bar | Top right | C |
| `buffTimers` | Buff timers | dropdown | Off · Under the icon · Sweep only | Under the icon | A |
| `debuffHighlight` | Highlight debuffs I can remove | toggle | | On | A |
| `buffSort` | Sort buffs | dropdown | Time left · Order gained · Mine first | Time left | A |

### 6.7 Tooltips (reuse: `shared/tooltip.js`)

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `tooltipAnchor` | Tooltips appear | dropdown | Beside the cursor · Bottom-right corner · Above the spell bar | Beside the cursor | | A |
| `tooltipDelay` | Tooltip delay | slider | 0–1,000 ms, step 50 | 150 ms | reuse: the shared engine's 150 ms | A |
| `tooltipDetail` | Tooltip detail | dropdown | Short · Full | Full | Short = name, numbers, one line | A |
| `tooltipCompare` | Compare with what I wear | dropdown | Always · **While Shift is held** · Never | While Shift is held | the Compare block on the item card (page 03 §7.2.1): shown only while Shift is down, so the card stays short; with Always, Shift flips to the other ring / hand instead (reuse: Farhold compare + Shift). Replaces 08's `compare_on_hover` | A |
| `itemPortrait` | 3D portrait on item cards | dropdown | **On — turning** · On — still picture · Off (flat icon) | On — turning | the item's 3D model at the top of the item card (page 03 §7.2.1). The Low graphics preset forces "still picture" | D |
| `itemCardEffects` | Item card effects | dropdown | **All** · Reduced (frames and special-rarity looks without motion) · None (plain frames) | All | the rarity frame's shimmer and the special-rarity overlays (arcs, stars, mirror, dust, vines); follows Reduce motion | A |
| `tooltipTags` | Tags on spell and item tooltips | toggle | | On | the tag chips (page 05's tags) on every spell and item card, with "applies to {n} of your spells" | A |
| `tooltipInCombat` | Tooltips in combat | dropdown | Show · Hide · Only while Left Alt is held | Show | | A |
| `tooltipSpellMaths` | Show the numbers behind a spell | toggle | | On | "140% weapon damage = 212" (canon rule 2) | A |

### 6.8 Minimap and map

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `minimap` | Minimap | toggle | | On | | A | reuse |
| `minimapShape` | Minimap shape | button row | Round · Square | Round | | A | new |
| `minimapSize` | Minimap size | dropdown | Small · Medium · Large | Medium | | D | new |
| `minimapRotate` | Rotate the minimap with the camera | toggle | | Off | Off = north always up (page 03 §4.12) | A | new |
| `minimapZoom` | Minimap zoom | slider | 80–1,200 m across, step 20 | 240 m | same as `=`/`-` (reuse `hud.minimapSpan`, now in metres and saved; page 03 §4.12) | A | reuse |
| `minimapReveal` | Show shops and quests within | slider | 30–200 m, step 10 | 70 m | reuse Farhold round 11's 70 m reveal rule | A | reuse |
| `minimapNodes` | Show harvesting nodes | toggle | | On | ore, herbs, timber, hides, fish spots your Harvesting can reach (page 19) | A | new |
| `minimapTravel` | Show Travel Methods | toggle | | On | stations and vehicles moving on their routes | A | new |
| `minimapRarities` | Show champion packs and rares | toggle | | On | the blue pips and yellow stars (page 03 §4.12) | A | new |
| `minimapParty` | Show my party | toggle | | On | | A | new |
| `mapOpacity` | Map see-through | slider | 50–100%, step 5 | 90% | the world shows behind the map (it does not pause) | A | new |
| `mapLabels` | Map labels | dropdown | All · Towns and regions · None | All | | A | reuse |
| `mapFollow` | Map follows me | toggle | | On | reuse Farhold's recentre rule | A | reuse |

### 6.9 Chat window

| Key | Label | Control | Values / range | Default | Scope |
|---|---|---|---|---|---|
| `chatFontSize` | Chat text size | slider | 10–22 px, step 1 | 14 px | A |
| `chatFade` | Fade chat after | dropdown | 10 s · 30 s · 60 s · Never | 30 s | A |
| `chatTimestamps` | Timestamps | dropdown | Off · 14:05 · 14:05:22 | Off | A |
| `chatClassColours` | Names in class colours | toggle | | On | A |
| `chatTabs` | Chat tabs | button (opens an editor) | per tab: name + which channels it shows | General (everything but combat), Combat log, Loot, Whispers | C |
| `chatBackground` | Chat background | slider | 0–100%, step 5 | 35% | A |
| `chatStickyChannel` | Enter reopens the last channel | toggle | | On | page 02 §5.11 | A |

### 6.10 Combat log (reuse: Farhold `LOG_KINDS` + `meters/`)

The combat log is a tab of the chat window (Farhold: the "What has happened" sheet tab). Each kind is a
toggle; all default **On** except where noted.

| Key | Label | Default | Origin |
|---|---|---|---|
| `logDealt` | Damage you deal | On | reuse |
| `logTaken` | Damage you take | On | reuse |
| `logPetDealt` | Follower and pet damage dealt | On | reuse (was "Pet damage dealt") |
| `logPetTaken` | Follower and pet damage taken | Off | reuse |
| `logReward` | XP and gold | On | reuse |
| `logLoot` | Loot | On | reuse |
| `logOther` | Everything else | On | reuse |
| `logHealDone` | Healing you do | On | new |
| `logHealTaken` | Healing you receive | On | new |
| `logStatus` | Effects gained and lost | Off | new |
| `logBoss` | Boss abilities (cast, hit, missed you) | On | new |
| `logParty` | Your party's combat | Off | new |
| `logDeaths` | Deaths | On | new |
| `logInterrupts` | Interrupts and dispels | On | new |
| `logLootOthers` | What others looted | Off | new |
| `logLines` | Lines on the HUD (slider 5–30, step 1) | 12 | reuse (Farhold shows 12) |
| `logTimestamps` | Timestamps in the log (toggle) | On | new |
| (damage meter) | its options are §6.13 | | |

### 6.11 Quests (page 14 §5.7's keys)

Added in the 2026-09-29 reconciliation pass. Page 14 owns what the quest flow does; these are its switches.

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `quest_tracker_max` | Quests in the tracker | slider | 3–12, step 1 | 8 | how many quests the objective tracker shows (page 14 §5). *Replaces `trackerMax` (1–10, default 5); page 03 still says "tracker_max, 5" — see the report* | A |
| `auto_track_new` | Track new quests | toggle | | On | a newly accepted quest is added to the tracker if there is room (was `set.gameplay.autoTrackQuests`) | C |
| `quest_text_speed` | Quest text speed | dropdown | Instant · Fast (90 characters a second) · Normal (45 a second) | Fast | how fast an NPC's quest text types out | A |
| `world_markers` | Quest markers in the world | dropdown | On · Tracked quests only · Off | Tracked quests only | the floating objective markers over places and things | A |
| `quest_object_glow` | Glow on quest objects | toggle | | On | an outline on a quest object within 20 m while its quest is active | A |
| `show_distant_quest_givers` | Show far-away quest givers | toggle | | Off | quest-giver icons beyond the minimap reveal radius | A |
| `show_quest_areas` | Show quest areas on the map | toggle | | On | the shaded area where an objective can be done | A |
| `show_low_level_quests` | Show low-level quests | toggle | | On | quest givers whose quests give little experience (grey) still show their icon | A |
| `event_banners` | Event banners | dropdown | All · Nearby (300 m) · Off | Nearby | the banner when a dynamic event starts | A |

(`set.audio.quest_voice` is in Audio, §8; `set.gameplay.auto_accept_shared` in Gameplay, §3.)

### 6.12 Class displays (asked for by the class files)

Shown only to the class they belong to.

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `druid_ghost_bar` | Show my caster bar in a form | toggle | | On | a 60%-size row of caster cooldowns above the form's bar (`classes/druid.md` §2) | C |
| `foresight_opacity` | Foresight ghost opacity | slider | 20–80%, step 5 | 40% | how solid the Oracle's early-warning ghost telegraphs are (`classes/oracle.md` §2) | C |
| `foresight_color` | Foresight colour | dropdown | Cyan · White · Magenta | Cyan | colour of the Oracle's ghost telegraphs; Cyan is the reserved dashed pale cyan `#7fe8ff` (canon 00 §10) — White and Magenta are for colour-blind players | C |
| `swash_floaters` | "Showstopper!" float text | toggle | | On | the gold float text over a Swashbuckler's head on a Showstopper dodge (`classes/swashbuckler.md` §2.3) | C |


### 6.13 Damage meter (reuse: `meters/js/meter.js`, `meter-ui.js`, as in Emberveil 2)

Canon 00 §12.1 W16 keeps the meter. Page 03 §11.1 owns the window.

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `meterShow` | Damage meter | dropdown | Off · Shown when I am in a group · Always | Shown when I am in a group | whether the docked meter is on screen (`Shift+M` toggles it any time) | C | reuse |
| `meterMode` | Meter opens on | dropdown | Damage done · Healing · Damage taken · Absorbs · Statuses · Deaths · Interrupts · Dispels · Threat · By tag | Damage done | the mode it starts in | C | reuse + new |
| `meterScope` | Meter shows | dropdown | This fight · Whole dungeon or session | This fight | the default scope | C | reuse |
| `meterResetOnEnter` | Reset the meter when I enter a dungeon | toggle | | On | | A | new |
| `meterFoldPets` | Fold followers and pets into their owner | toggle | | On | Off gives them their own bars | A | reuse |
| `meterPerSecond` | Show per-second numbers | toggle | | On | "{total} ({n}/s)" | A | reuse |
| `meterSparklines` | Sparklines on bars | toggle | | On | the small graph on each bar | A | reuse |
| `meterOpacity` | Meter background | slider | 0–100%, step 5 | 60% | | A | new |
| `meterReportChannel` | Report to | dropdown | Party · Say · Guild · Whisper… | Party | where the Report button and `/meter report` post the top 5 | A | new |
| `meterShareMine` | Share my numbers with my party | toggle | | On | Off: your party sees you on their meter only as "(private)" (page 15 owns meter privacy) | A | new |

---

## 7a. Combat (`set.combat.*`)

Added in the 2026-09-29 reconciliation pass: pages 05 and 11 wrote these keys under `set.combat`.

| Key | Label | Control | Values / range | Default | What it does | Scope | ✔ preset | Origin |
|---|---|---|---|---|---|---|---|---|
| `ally_ground_fx` | Other players' spell effects | dropdown | All · Reduced (half the particles) · Party only · Minimal (no particles, only impact flashes; **allied ground effects hidden**) | All (High/Ultra), Reduced (Low/Medium) | thins other players' spells — mostly for a crowded world boss. **Enemy telegraphs are never reduced by any setting** (page 11 §3.1 rule 4, page 17). *Page 11's key; it absorbs the old `set.graphics.otherPlayersEffects`* | D | ✔ | new |
| `boss_hints` | Beginner warnings | toggle | | On for Normal; Off for Challenge | a plain one-line instruction beside a telegraph's icon ("Leave the red") for a boss's first 3 pulls on Normal (page 03 boss banner, page 11) | A | | new |
| `view_cones` | Show enemies' view cones | dropdown | Off · When I am a Rogue · Always | When I am a Rogue | a faint cone on the ground in front of each hostile monster within 30 m, showing where it can see; outside is its blind spot (page 03 `hud_viewcone`; `classes/rogue.md` Blind Spots). Never drawn in a telegraph colour | C | | new |
| `lockCamera` | Camera follows my target | toggle | | Off | the camera turns to keep your hard target on screen (page 05; an accessibility aid) | A | | new |

*Removed in round 2:* `set.combat.aimAssist` (melee snap / ranged curve). With Tab targeting a melee swing
turns to your target and a ranged attack is Auto-target (page 02 §2.3), so there is nothing left for it to
do.

## 7b. Groups (`set.group.*`)

Was "Raid & groups" (`set.raid.*`). Raids and raid frames are not in v2 (canon W6, W16, `WISHLIST.md`), so
the raid-frame layout, size, colour, resource and "use raid frames for a party" options are **gone**;
party-frame options are in Interface §6.5. Boss dialog voting is fixed by canon (00 §10: the party votes,
a tie goes to the leader), so `dialog_vote` is gone too.

| Key | Label | Control | Values / range | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `pull_timer_length` | Pull timer | slider | 5–15 s, step 1 | 10 s | the default for `/pull` with no number (page 02 §6.2) | A |
| `marker_labels` | World marker labels | toggle | | On | the name (Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye) under each world marker | A |
| `markers_everyone` | Everyone in my party can place markers | toggle | | Off | the party leader's choice (page 03 §10.2) | C |
| `boss_banner` | Boss-line banners | dropdown | All · Warnings only | All | a line is often the warning, so there is **no Off** (canon; page 11) | A |
| `world_boss_alerts` | World boss warnings (15 min ahead) | dropdown | Region · All · Off | Region | a toast to everyone in the region (or everywhere), a horn at 1 minute (page 13) | A |
| `loot_popup` | Show others' personal loot in a popup | toggle | | Off | the combat log always shows it (`set.interface.logLootOthers`) | A |
| `ready_check_sound` | Ready check sound | toggle | | On | the bell when a ready check starts | A |

(The world-boss **Muster** channel is `set.social.joinMuster`, §11.)

---

## 7. Graphics (`set.graphics.*`)

All graphics options are **Device** scope — a laptop and a desktop keep their own.

### 7.1 Where Farhold stands (first-hand, `js/gfx.js`, `js/graphics.js`, `js/grass-gpu.js`)

Farhold's single "Graphics effects" choice (Off / Low / High, default High) sets, via `resolveGraphics()`:

| Flag | Off | Low | High |
|---|---|---|---|
| picture pipeline (HDR frame + tone mapping) | no | ACES | ACES |
| multisampling | 0 | 0 | 4× |
| bloom | off | half resolution | full |
| light shafts (36 samples) | off | off | on |
| colour grade / vignette | off / 0 | on / 0.22 | on / 0.22 |
| film grain | 0 | 0 | 0.012 |
| GPU grass field | no (CPU tufts) | no | yes (48k blades at 38 m, then per `grassDistance`) |
| rain drops / snowflakes / splashes / debris | 0 (old line rain) | 3,600 / 2,400 / 90 / 150 | 9,000 / 6,000 / 220 / 380 |
| rain sheets | no | yes | yes |
| height fog, wet ground | compiled out | on | on |
| wind sway | on | on | on |

Plus separate options: FOV, view distance (1–6×), trees and rocks (0–6×), grass on/off, grass distance
(5 steps), sun rays and flare. **Farhold has no shadow maps**, no resolution scale, no frame cap and no
texture setting; `renderer.setPixelRatio` is `min(2, screen)` (1 on `?quality=low`).
`highdef-3d/js/quality.js` has four fuller presets (Low/Medium/High/Ultra) with cascaded shadows, SSAO and
depth of field. **Wildmarch merges the two** (reuse both).

### 7.2 Presets

| Key | Label | Control | Values | Default | What it does |
|---|---|---|---|---|---|
| `preset` | Graphics preset | dropdown | Low · Medium · High · Ultra · Custom | chosen on first launch by a machine check (reuse `highdef-3d` `detectPreset()`, deliberately cautious), else **High** | sets every option marked ✔ in the table below. Changing any of those afterwards turns the preset to **Custom** |

**What each preset sets** (sources: F = Farhold `gfx.js`, H = `highdef-3d/js/quality.js`, N = new):

| Option | Low | Medium | High | Ultra | Source |
|---|---|---|---|---|---|
| `renderScale` | 85% | 100% | 100% | 135% (capped by the screen) | H |
| `antiAliasing` | Off | SMAA | MSAA 4× + SMAA | MSAA 8× + SMAA | F + H |
| `hdr` | Off | On | On | On | F |
| `bloom` | Off | Half | Full | Full | F |
| `lightShafts` | Off | Off | On | On | F |
| `sunFlare` | Off | On | On | On | F |
| `colourGrade` | Off | On | On | On | F |
| `filmGrain` | 0 | 0 | 0.012 | 0.012 | F |
| `vignette` | 0 | 0.22 | 0.22 | 0.22 | F |
| `shadows` | Low | Medium | High | Ultra | H |
| `ambientOcclusion` | Off | Off | Off | On | H |
| `depthOfField` | Off | Off | Off | On | H |
| `viewDistance` | 1× | 1.5× | 2.5× | 4× | F |
| `treeDistance` | 260 m | 420 m | 560 m | 760 m | H |
| `scatterDensity` | 0.45× | 0.75× | 1× | 1.25× | F + H |
| `detailDistance` | 45 m | 70 m | 95 m | 130 m | H |
| `grass` | Off | On | On | On | F |
| `grassDistance` | (Near) | Medium (70 m) | Very far (150 m) | Extreme (200 m) | F |
| `grassDensity` | 0 | 0.55× | 1× | 1.5× | H |
| `textureQuality` | Low (512) | Low (512) | High (1024) | High (1024) | H |
| `anisotropy` | 4× | 8× | 16× | 16× | H |
| `heightFog` | Off | On | On | On | F |
| `wetGround` | Off | On | On | On | F |
| `weatherParticles` | Off | Low | High | High | F |
| `rainSheets` | Off | On | On | On | F |
| `waterQuality` | Low | Medium | High | High | N |
| `spellEffects` | Low | Medium | High | High | N |
| `set.combat.ally_ground_fx` (was `otherPlayersEffects`) | Reduced | Reduced | All | All | N |
| `characterDetail` | Low | Medium | High | High | N |
| `playersDrawn` | 20 | 40 | 60 | 100 | N |
| `dynamicLights` | 4 | 8 | 16 | 32 | N |
| `itemPortrait` (Interface) | still picture | turning | turning | turning | N |

Farhold's levels map as: **Off → Low, Low → Medium, High → High**. Ultra is new.

### 7.3 Every graphics option

| Key | Label | Control | Values / range | Default (High) | What it does | ✔ preset | Origin |
|---|---|---|---|---|---|---|---|
| **Display** |||||||
| `renderScale` | Resolution scale | slider | 50–200%, step 5 (never above 2× the screen's own pixels) | 100% | draws the world at this fraction of the screen's pixels; the interface stays sharp. Confirm prompt | ✔ | new |
| `frameCap` | Frame rate limit | dropdown | 30 · 60 · 90 · 120 · 144 · 165 · 240 · Screen's own rate | Screen's own rate | the browser already stops at the screen's refresh rate; this only lowers it (saves laptop battery) | | new |
| `backgroundFrames` | When Wildmarch is not the active window | dropdown | Full speed · 30 fps · 10 fps | 10 fps | when the tab is hidden the browser pauses drawing anyway; the connection stays up | | new |
| `brightness` | Brightness | slider | 50–150%, step 5 | 100% | exposure before tone mapping; a calibration picture (a dark rune that should be just visible) sits beside it | | new |
| `hdr` | HDR picture | toggle | | On | the HDR frame + ACES tone mapping (Farhold `postfx`); Off also turns off bloom, shafts, grade, grain, vignette | ✔ | reuse |
| `antiAliasing` | Anti-aliasing | dropdown | Off · SMAA · MSAA 2× · MSAA 4× · MSAA 4× + SMAA · MSAA 8× + SMAA | MSAA 4× + SMAA | smooths jagged edges; MSAA is costly on big screens. Confirm prompt | ✔ | reuse (F: 4× on High; H: SMAA) |
| **Lighting** |||||||
| `shadows` | Shadows | dropdown | Off · Low (1,024 px map, 2 cascades, 110 m) · Medium (2,048 px, 3 cascades, 180 m) · High (2,048 px, 3 cascades, 240 m) · Ultra (4,096 px, 4 cascades, 340 m) | High | sun shadows (cascades = several shadow maps, sharp near you and coarse far away). Always daylight (canon 00 §4), so there is one sun and no moon | ✔ | reuse (highdef-3d; Farhold has none) |
| `shadowCasters` | What casts shadows | dropdown | Characters only · Characters and big things · Everything | Characters and big things | small props and grass never cast on Low/Medium | | new |
| `dynamicLights` | Moving lights | dropdown | 4 · 8 · 16 · 32 | 16 | how many spell lights, lava glows, glowing fungi and plants and town lamps light the world at once; the nearest win (reuse Farhold `light.js`). Dark places are "film-set dark" — they look dark but ambient light keeps everything readable (canon 00 §4), so this only changes how rich the glow is, never whether you can see | ✔ | reuse |
| `ambientOcclusion` | Ambient occlusion | toggle | | Off | soft contact shadows in corners (SSAO); the model kits already bake most of it, so it is Ultra only | ✔ | reuse (highdef-3d) |
| **Effects** |||||||
| `bloom` | Bloom | dropdown | Off · Half · Full | Full | glow round bright things (Farhold `bloomScale` 0.5 / 1) | ✔ | reuse |
| `lightShafts` | Light shafts | toggle | | On | sunbeams through trees (36 samples) | ✔ | reuse |
| `sunFlare` | Sun rays and flare | toggle | | On | the lens flare and horizon wash (Farhold `sunfx`) | ✔ | reuse |
| `colourGrade` | Colour grading | toggle | | On | the colour mood that follows the region and the weather (`sky-palette.js gradeFor`, held at its daytime entry) | ✔ | reuse |
| `filmGrain` | Film grain | slider | 0–0.03, step 0.002 | 0.012 | | ✔ | reuse |
| `vignette` | Vignette | slider | 0–0.5, step 0.02 | 0.22 | darker screen corners | ✔ | reuse |
| `depthOfField` | Depth of field | toggle | | Off | blurs the background **only** in conversations and boss introductions, never in play | ✔ | reuse (highdef-3d) |
| `heat_shimmer` | Heat shimmer | toggle | | On | the 2-pixel shimmer round a Pyromancer at high Heat (`classes/pyromancer.md` §2.2) | | new |
| `spellEffects` | Spell effects | dropdown | Low (batched sprites only) · Medium · High | High | reuse `avatar-3d/js/spellfx.js` and `spellfx-batched.js`. **Telegraphs are not spell effects** and are never reduced | ✔ | reuse |
| (other players' spell effects) | merged into **`set.combat.ally_ground_fx`** (§7a) — page 11's key; the preset still sets it | | | | | ✔ | new |
| **World** |||||||
| `viewDistance` | View distance | slider | 1×–6×, step 0.5 | 2.5× | how far the ground is drawn (Farhold: 1× = 1,818 m, 6× = 10,905 m) | ✔ | reuse |
| `treeDistance` | Tree distance | slider | 200–1,000 m, step 20 | 560 m | full trees out to here, a baked far ring beyond (reuse highdef-3d's 128 m cells) | ✔ | reuse |
| `scatterDensity` | Trees and rocks | slider | 0×–6×, step 0.25 | 1× | how thick the scatter is; a thinned cell is a subset of the full one (Farhold §1.4) | ✔ | reuse |
| `detailDistance` | Small detail distance | slider | 30–150 m, step 5 | 95 m | pebbles, flowers, twigs | ✔ | reuse |
| `grass` | Grass | toggle | | On | | ✔ | reuse |
| `grassDistance` | Grass distance | dropdown | Near (38 m) · Medium (70 m) · Far (110 m) · Very far (150 m) · Extreme (200 m) | Very far | Farhold `GRASS_DISTANCES`: blade budgets 48k / 80k / 110k / 140k / 180k | ✔ | reuse |
| `grassDensity` | Grass thickness | slider | 0.25×–1.5×, step 0.05 | 1× | | ✔ | reuse (highdef-3d) |
| `grassBending` | Grass bends round people | dropdown | Me only · Everyone near me | Me only | (Farhold bends round the player only) | | reuse |
| `windSway` | Wind in trees and grass | toggle | | On | one shared wind (reuse `wind.js`); off also stops rain leaning | | reuse |
| `heightFog` | Valley fog | toggle | | On | fog that pools in low ground | ✔ | reuse |
| `wetGround` | Wet ground in rain | toggle | | On | | ✔ | reuse |
| `weatherParticles` | Rain and snow | dropdown | Off (simple line rain) · Low (3,600 drops, 2,400 flakes, 90 splashes, 150 blown leaves) · High (9,000 / 6,000 / 220 / 380) | High | | ✔ | reuse |
| `rainSheets` | Distant rain curtains | toggle | | On | | ✔ | reuse |
| `waterQuality` | Water | dropdown | Low (flat colour) · Medium (waves, sky colour) · High (waves, reflections of the sky probe) | High | | ✔ | reuse (highdef-3d `water.js`, Farhold `water-plan.js`) |
| `textureQuality` | Texture detail | button row | Low (512 px) · High (1,024 px) | High | the generated ground surfaces (reuse highdef-3d `kit/textures.js`) | ✔ | reuse |
| `anisotropy` | Texture sharpness at an angle | dropdown | 1× · 2× · 4× · 8× · 16× | 16× | | ✔ | reuse |
| **Characters** |||||||
| `characterDetail` | Character detail | dropdown | Low (merged meshes, no face detail beyond 15 m) · Medium · High | High | reuse Chibi 2 and Farhold `mesh-merge.js` | ✔ | reuse |
| `playersDrawn` | Players drawn in full | dropdown | 20 · 40 · 60 · 100 · All | 60 | beyond this, the furthest are drawn as simple figures in their class colour | ✔ | new |
| `corpseTime` | Bodies stay for | dropdown | 10 s · 30 s · 60 s | 30 s | local only; loot is kept either way | | new |
| **Diagnostics** |||||||
| `showFps` | Show frame rate | toggle | | Off | also `/fps` | | new |
| `benchmark` | Run a benchmark | button | | | 30 s flight over Brightwater; reports the frame rate for each preset and recommends one | | new |

---

## 8. Audio (`set.audio.*`)

Reuse: `sfx/js/sfx.js` mixer — source → per-sound loudness gain → **category bus** → **master** →
limiter → speakers. Farhold exposes only master volume and two switches. `sfx/js/loudness.js` sets each
category's loudness target (spell −19, impact −16, melee −17, status −22, death −17, sting −18, loot −19,
world −21, ui −26, ambience −40 LUFS — a loudness unit), so these sliders are the player's trim on top of
an already balanced mix.

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `enabled` | Sound | toggle | | On | everything on/off (Farhold `sound`) | D | reuse |
| `master` | Master volume | slider | 0–100%, step 5 | 75% | Farhold `volume` | D | reuse |
| `sfx` | Effects | slider | 0–100%, step 5 | 100% | the `sfx` bus: combat, spells, footsteps, world | D | reuse (bus existed, not exposed) |
| `ui` | Interface | slider | 0–100%, step 5 | 100% | the `ui` bus: clicks, cards, unlock stings | D | reuse |
| `ambience` | Ambience | slider | 0–60%, step 5 | 60% | the `ambience` bus (wind, forest, town, cave beds). **Capped at 60%** by `BUS_CAP` so it always sits under everything else | D | reuse |
| `music` | Music | slider | 0–100%, step 5 | 60% | a new `music` bus (page 17 — there is no music in the playground yet) | D | new |
| `voices` | Voices | slider | 0–100%, step 5 | 100% | characters and NPCs speaking (formant voices) | D | reuse |
| `bossVoices` | Boss voices | slider | 25–100%, step 5 | 100% | boss lines. **Minimum 25%** because a line is often the warning (canon) | D | new |
| `narrator` | Narrator | slider | 0–100%, step 5 | 100% | the story narrator's voice (reuse: Emberveil's Narrator, `shared/voices.js`) | D | reuse |
| `otherPlayers` | Other players' sounds | slider | 0–100%, step 5 | 70% | their spells and weapons (yours stay at the Effects level) | D | new |
| `telegraphSounds` | Warning sounds | slider | 25–100%, step 5 | 100% | the cue a telegraph plays when it appears near you (page 11). Minimum 25% | D | new |
| `soundStyle` | Sound style | dropdown | Hybrid — recorded sounds plus synthesised ones (default) · Synth — every sound made on the fly · Library — recorded CC0 sounds only · Retro — chiptune | Hybrid | the Sound Lab's four makers (reuse `sfx/js/methods/*`) | D | reuse |
| `combatMusic` | Music changes in combat | toggle | | On | | D | new |
| `muteInBackground` | Mute when Wildmarch is not the active window | toggle | | On | | D | new |
| `dynamicRange` | Loudness range | dropdown | Full · Reduced · Quiet listening (quiet sounds up, loud ones down) | Full | extra compression on the master limiter | D | reuse (the limiter exists) |
| `spatial` | Positional sound | dropdown | Stereo (left/right by position) · Off | Stereo | reuse `play(id, { pan })`. Mono lives in Accessibility | D | reuse |
| `outputDevice` | Output device | dropdown | System default · (each device the browser lists) | System default | only in browsers that allow choosing (Chromium); hidden elsewhere | D | new |
| `heartbeat` | Heartbeat at low health | toggle | | On | tied to `set.interface.lowHealthEdge` | A | new |
| `quest_voice` | NPC voices on quest text | toggle | | On | quest givers speak their quest text (page 14 §5.7) | A | new |
| `foresight_chime` | Foresight chime | slider | 0–100%, step 5 | 60% | the 0.2 s glass chime each Oracle ghost telegraph plays (`classes/oracle.md`; Oracle only) | D | new |
| `swash_crowd` | Swashbuckler crowd | slider | 0–100%, step 5 | 50% | the crowd murmur at 10 Flair (`classes/swashbuckler.md` §2.3; Swashbuckler only) | D | new |

---

## 9. Voice & Speech (`set.voice.*`)

Reuse: `voice-lab/` (our formant synthesiser, `js/formant-voice.js`), `shared/voices.js` (a timbre per
class/role varied by seed — `voiceFor({ role, gender, seed })`), `lingo/` (what is said),
`shared/langdebug.js` (pronunciation fixing).

| Key | Label | Control | Values / range | Default | What it does | Scope | Origin |
|---|---|---|---|---|---|---|---|
| `voices` | Spoken lines | toggle | | On | Farhold `voices` — every spoken line, off leaves text only | A | reuse |
| `engine` | Voice engine | dropdown | Formant (our own synthesiser) · Babble (made-up speech sounds, no real words) · Browser voice (Web Speech) | Formant | the other voice-lab engines (espeak via meSpeak, Piper) are not offered: meSpeak is large and Piper downloads a neural model | A | reuse |
| `npcVoices` | NPCs speak | toggle | | On | townsfolk, quest givers | A | reuse |
| `ownBarks` | My character speaks | dropdown | Off · Important only (low health, out of resource) · All barks | Important only | cast/crit/low-health barks (class files, template §8) | C | reuse |
| `partyBarks` | Party chatter | dropdown | Off · Rare · Normal · Chatty | Normal | followers and party members' barks and camp talk (reuse Farhold/Emberveil conversations) | A | reuse |
| `otherPlayersBarks` | Other players' barks | dropdown | Off · Party · Everyone near me | Party | | A | new |
| `pingVoice` | Pings are spoken | toggle | | On | the ping wheel line in your character's voice (page 02 §5.4) | A | new |
| `speakChat` | Read chat aloud | dropdown | Off · Whispers · Party · Party and guild · Everything I can see | Off | chat lines spoken in the sender's character voice (formant), handy for players who cannot watch the chat box in a fight | A | new |
| `speechRate` | Speaking speed | slider | 0.7×–1.5×, step 0.05 | 1× | all synthesised speech | A | reuse (voice-lab `speed`) |
| `speechBubbles` | Speech bubbles | dropdown | Off · /say and NPCs · Everything nearby | /say and NPCs | the bubble over a speaker (reuse Farhold speech bubbles) | A | reuse |
| `subtitles` | Subtitles | dropdown | Off · On · On, with the speaker's name | On, with the speaker's name | spoken lines as text at the bottom | A | new |
| `subtitleSize` | Subtitle size | dropdown | Small · Medium · Large · Extra large | Medium | | A | new |
| `subtitleBackground` | Subtitle background | slider | 0–100%, step 10 | 60% | darkness behind the text | A | new |
| `narratorText` | Narration in italics in the log | toggle | | On | reuse Emberveil's Narrator style | A | reuse |
| `myVoice` | My character's voice | button | | | opens the voice editor from the character creator (pitch, depth, tone, breath, rough, speed — voice-lab's generic knobs) | C | reuse |
| `langDebug` | Language debug (click words in spoken lines) | toggle | | Off | **dev builds only.** Reuse `shared/langdebug.js`: click a word to see its pronunciation and phonemes, type a respelling or a replacement | D | reuse |
| `langOverrides` | Pronunciation fixes | buttons | Export overrides · Import · Submit to server | | **dev only**, reuse `mountSettings()` | D | reuse |

---

## 10. Accessibility (`set.access.*`)

All Accessibility options are **Account** scope, and the first five appear on the first-launch screen.

### 10.1 Telegraph colours (important for boss mechanics)

**Page 11 §3 owns the telegraph colours, patterns and palettes** (reconciliation pass 2026-09-29: this
section was changed to use page 11's key names and values exactly). This page lists the switches.
**Colour is never the only signal.** Every telegraph kind also has its own **pattern** and **edge**, drawn
always, so a player who sees no colour at all can still read the floor (page 11 §3, "Pattern" column):

| Telegraph kind (page 11) | Pattern (always) | Edge |
|---|---|---|
| Danger zone | diagonal hatch lines 45°; the hatch pulses faster in the last 0.5 s; fill grows from the edge inward | solid 0.12 m line |
| Void zone | slow spiral texture + rising bubbles | glowing violet rim, 2 Hz pulse |
| Soak | inward-pointing chevrons around the rim; N white pips that fill as players stand in | solid, with the pips |
| Safe zone | shield glyph in the centre; rings rotate slowly | double ring 0.08 m + 0.04 m, dashed outer |
| Targeted | crosshair glyph + the player's name floating above; the fill empties like a clock | solid |
| Beneficial | plus-sign glyphs drifting upward | soft dashed |
| Tether | beads every 0.5 m travelling toward the end that will be hit | 0.06 m line |

| Key | Label | Control | Values | Default | What it does |
|---|---|---|---|---|---|
| `telegraph_palette` | Telegraph colours | dropdown | `default` Standard · `deutan` Red-green friendly · `protan` Red-weak friendly · `tritan` Blue-yellow friendly · `mono` High contrast | `default` | the colours in the table below (page 11 §3.2); also recolours boss cast bars, threat colours and health bars to match. *Page 11's key; was `palette`. Page 03's `set.accessibility.colour_mode` is this key* |
| `telegraph_outline` | Telegraph edge | button row | Thin · Thick · Extra | Thin | edge width 0.12 / 0.2 / 0.3 m (page 11). *Replaces `telegraphEdge`* |
| `telegraph_opacity` | Telegraph fill | slider | 60–150%, step 5 | 100% | multiplies page 11's fill opacity. *Replaces `telegraphOpacity` (20–80%)* |
| `telegraph_glyphs` | Telegraph glyphs | toggle | | On | the crosshair, shield, plus and chevron glyphs (page 11) |
| `patternStrength` | Telegraph pattern strength | slider | 25–100%, step 5 | 50% | how bold the hatching, swirl and pips are (never 0) |
| `telegraph_sounds` | Telegraph sounds | toggle | | On | page 11 §6's cue sounds (their volume is `set.audio.telegraphSounds`) |
| `banner_size` | Warning banner size | button row | Small · Normal · Large | Normal | page 11 §8's centre banner |
| `screen_flash` | Lethal-warning edge flash | button row | On · Reduced · Off | On | the red screen-edge flash before a one-shot (page 11) |
| `spoken_warnings` | Spoken warnings | dropdown | Off · Lethal only · All | Lethal only | a narrator voice reads the banner (reuse: Emberveil's Narrator voice) |
| `telegraphPreview` | Preview | (a live panel) | | | a floor showing all seven kinds in the chosen palette, and a button to see them through a colour-blindness simulation |
| `customDanger` … `customTether` | Custom colours | colour pickers | any | | **held back**: a Custom palette needs page 11 to add a `custom` value (Question 5, §14). Until then these pickers are not shown |

**Palette values** — copied from page 11 §3.2 (page 11 is the fact; change them there first):

| Meaning | `default` | `deutan` (red-green) | `protan` (red-weak) | `tritan` (blue-yellow) | `mono` (high contrast) |
|---|---|---|---|---|---|
| Danger | `#ff3b30` | `#ff2d95` magenta-red | `#ff7a00` bright orange-red | `#ff3b30` | white hatch on black 60% |
| Void | `#140a1e` / `#8a3ae0` | same | same | `#140a1e` / `#c040c0` | black fill, white spiral |
| Soak | `#ff9a1f` | `#ffb000` | `#ffe000` yellow-orange | `#ff5fa0` pink | white chevrons, grey fill |
| Safe | `#3aa0ff` | `#00c8ff` | `#00c8ff` | `#00e0c0` teal | white double ring, shield glyph |
| Targeted | `#ffd23a` | `#ffe860` | `#ffe860` | `#ff8ac8` | white crosshair, name in black box |
| Beneficial | `#4cd964` | `#40a0ff` blue | `#40a0ff` blue | `#4cd964` | white plus-signs |
| Tether | `#f4f4f4` | same | same | same | white with black outline |

The Oracle's early warnings use dashed pale cyan `#7fe8ff`, which no real telegraph uses in any palette
(canon 00 §10; its own colour choice is `set.interface.foresight_color`, §6.12).

### 10.2 Motion, flashing and camera

| Key | Label | Control | Values / range | Default | What it does | Origin |
|---|---|---|---|---|---|---|
| `reduceMotion` | Reduce motion | toggle | | Off | one switch: screen shake 0, impact freeze off, camera smoothing up, interface animations and damage-number drift off, spell trails shortened | new |
| `screenShake` | Screen shake | slider | 0–100%, step 10 | 100% | Farhold toggle widened (position only, never rotation — `combat-feel.js`) | reuse |
| `hitStop` | Impact freeze | toggle | | On | the 35–150 ms pause on a connecting blow (Farhold `hitStop`); damage is the same either way | reuse |
| `reduceFlashes` | Reduce flashing | toggle | | Off | lightning, crit flashes, bloom spikes and boss enrage flashes are dimmed to under 3 flashes a second and 20% brightness change (the common photosensitivity guideline) | new |
| `cameraShakeOnBoss` | Boss slams shake the camera | toggle | | On | separate from hits, because boss slams can be large | new |

### 10.3 Text, contrast and the interface

| Key | Label | Control | Values | Default | What it does |
|---|---|---|---|---|---|
| `textSize` | Text size | dropdown | Small (90%) · Medium (100%) · Large (115%) · Extra large (130%) | Medium | every interface text, on top of `uiScale` |
| `readableFont` | Easier-to-read font | toggle | | Off | switches to a font designed for dyslexia (an OFL-licensed one, vendored) |
| `highContrastUi` | High-contrast interface | toggle | | Off | solid dark panels, thicker borders, no see-through |
| `rarityLetters` | Rarity letters on items | toggle | | Off | C/U/R/E/Q/S/L on every icon and in tooltips, so rarity is not colour-only (mirrors `set.interface.rarityLetters`); special rarities add their word in brackets ("[Twinned]") |
| `brightDarkPlaces` | Brighter dark places | dropdown | Normal · Brighter (+25% ambient light) · Brightest (+50%) | Normal | caves, crypts and graveyards are "film-set dark" — dark-looking but readable (canon 00 §4); this raises their ambient light further for players who find them hard to read. Telegraphs are unaffected | 
| `monsterRarityShapes` | Monster rarity shapes | toggle | | On | the champion square frame, rare star, named banner, boss crown and greater-rarity double edge on nameplates, so monster rarity is never colour-only (page 03 §4.16); cannot be turned off while `telegraph_palette` is not `default` |
| `enemyOutline` | Outline enemies | dropdown | Off · My target · All enemies in combat | Off | a coloured outline that shows through foliage |
| `outlineColour` | Outline colour | colour picker | any | `#FF4040` | |
| `cursorSize` | Cursor size | dropdown | Normal · Large · Extra large | Normal | the free cursor |
| `soundCaptions` | Sound captions | toggle | | Off | text for important sounds: "[Roar — behind you]", "[Ground rumbling]" |
| `monoAudio` | Mono sound | toggle | | Off | both ears hear everything |
| `dialogTimerScale` | More time to answer NPCs | dropdown | 1× · 1.5× · 2× · No timer | 1× | NPC conversation timers only. **Boss dialog opportunities** stretch only when you are solo, because a group shares one timer |

### 10.4 Hold or toggle

One dropdown per action, each **Hold** or **Toggle** (page 02 §10.5):

| Key | Action | Default |
|---|---|---|
| `holdOrToggle.sprint` | Sprint | Hold |
| `holdOrToggle.secondary` | Block / steady aim / channel | Hold |
| `holdOrToggle.attack` | Basic attack repeat | Hold |
| `holdOrToggle.freeCursor` | Free cursor | Hold |
| `holdOrToggle.gather` | Gather (E) | Hold |
| `holdOrToggle.orbit` | Camera orbit (V) | Hold |
| `holdOrToggle.pingWheel` | Ping wheel | Hold |
| `holdOrToggle.release` | Release when dead (R) | Hold (1 s) — Toggle is a two-press confirm instead |
| `holdOrToggle.classLayer` | Class layer (hold G — Chronomancer, Tactician; page 02 §5.16) | Hold |
| `holdOrToggle.followerRing` | Follower ring (hold `,`; page 02 §5.17) | Hold |

---

## 11. Social (`set.social.*`)

Page 15 owns what channels, invites and privacy mean; these are the switches. All **Account** scope
unless noted.

| Key | Label | Control | Values | Default | What it does |
|---|---|---|---|---|---|
| `joinZone` | Join the region channel | toggle | | On | `/z` for the region you are in |
| `joinTrade` | Join the trade channel | toggle | | On | Highcourt and hub towns only |
| `joinLfg` | Join the looking-for-group channel | toggle | | On | |
| `joinGuildRecruit` | Join guild recruiting | toggle | | Off | |
| `profanityFilter` | Rude-word filter | dropdown | Off · Mild (strong words) · Strict (strong and mild words, and `/rude`) | Mild | replaces filtered words with ✱✱✱; your own messages are unfiltered for others unless they filter |
| `spamFilter` | Hide repeated messages | toggle | | On | the same line from the same player within 60 s is hidden |
| `whispersFrom` | Whispers from | dropdown | Everyone · Friends, guild and group · Friends only · Nobody | Everyone | |
| `partyInvitesFrom` | Group invites from | dropdown | Everyone · Friends, guild and group · Friends only · Nobody | Everyone | |
| `guildInvitesFrom` | Guild invites from | dropdown | Everyone · Friends only · Nobody | Everyone | |
| `tradeFrom` | Trade requests from | dropdown | Everyone · Friends, guild and group · Nobody | Everyone | |
| `duels` | Duel challenges | dropdown | Ask me · Decline automatically | Ask me | friendly duels from level 10 — the only player-versus-player fighting in v2 (canon W1; page 15) |
| `declineInCombat` | Decline invites and trades while I fight | toggle | | On | they are held and shown when combat ends |
| `status` | Show me as | dropdown | Online · Away · Busy · Appear offline | Online | (Busy = `/dnd`, Away = `/afk`) |
| `allowInspect` | Let others inspect my gear | toggle | | On | |
| `shareAchievements` | Announce my achievements to my guild | toggle | | On | |
| `friendToasts` | Tell me when friends come online | toggle | | On | |
| `guildMotd` | Show the guild message on login | toggle | | On | |
| `mentionHighlight` | Highlight my name in chat | toggle | | On | |
| `mentionSound` | Sound when I am mentioned | toggle | | On | |
| `chatLinks` | Item, quest and spell links in chat | toggle | | On | click to see a tooltip |
| `streamMode` | Streaming mode | toggle | | Off | hides whispers, other players' names (shown as class and level) and your character list — for players who broadcast (Device scope) |
| `blockList` | Blocked and ignored players | button | | | opens the list (page 15) |
| `announceFriend` | Tell people when I add them as a friend | toggle | | On | they see "<name> added you as a friend" (page 15) |
| `finderFollowersNow` | Offer follower fill in the group finder at once | toggle | | Off | instead of after 2 minutes in the queue (page 15) |
| `marketUndercutMail` | Mail me when someone undercuts my listing | toggle | | Off | Character scope (page 15) |
| `joinNewcomers` | Join the Newcomers channel | toggle | | On (under level 20) | Character scope; leaves itself at level 20 (page 15) |
| `autoLayer` | Move me to my guild's world copy when I can | toggle | | On | (page 15) |
| `boardWithParty` | Ask my party to board with me | toggle | | On | when you board a Travel Method, party members at the station get "Board with {name}?" (page 02 §5.18, page 03 §5.10); Character scope |
| `joinMuster` | Join the Muster channel near world bosses | toggle | | On | `/mu` for everyone in a world-boss area (page 13, page 15) |
| `joinCarriage` | Join the Carriage channel while riding | toggle | | On | `/car` for everyone on the same Travel Method (page 20) |

---

## 12. Online (`set.online.*`)

Page 16 owns servers and networking; these are the player-facing switches. The region list is a
**proposal** — the owner decides hosting (page 16, Questions).

| Key | Label | Control | Values | Default | What it does | Scope |
|---|---|---|---|---|---|---|
| `region` | Region | dropdown | Automatic (lowest latency) · North America East · North America West · Europe · Oceania | Automatic | which data centre to connect to; changes on the next login | A |
| `server` | Server | dropdown | (filled from the server list, each with its population: Low / Medium / High / Full) | the one your last character is on | characters live on one server (page 15/16) | A |
| `latencyDisplay` | Show latency | dropdown | Off · Number (ms) · Number and a 30 s graph | Off | beside the minimap, green under 80 ms, amber under 160 ms, red above | D |
| `connectionIcon` | Connection warning icon | toggle | | On | shows when packets are late or lost | D |
| `autoReconnect` | Reconnect automatically | toggle | | On | tries 5 times over 30 s before returning to the log-in screen; your character stays in the world for 30 s (page 16) | D |
| `dataSaver` | Data saver | toggle | | Off | far-away players (over 60 m) update 10 times a second instead of 20 | D |
| `preloadRegions` | Download the next region ahead | toggle | | On | fetches a neighbouring region's data while you play, so crossing a border does not stall | D |
| `cacheSize` | Offline cache | dropdown | 250 MB · 500 MB · 1 GB · 2 GB | 500 MB | how much the browser may keep between sessions | D |
| `clearCache` | Clear downloaded data | button | | | | D |

---

## 13. Debug (`set.debug.*`) — dev builds only

Hidden unless `?dev=1` on the dev server (never on the live server). Reuse: Farhold's two debug settings
plus the `` ` `` debug menu (`js/debug.js`), whose tools become buttons here and `/dev` commands
(page 02 §6.7).

| Key | Label | Control | Values | Default | What it does | Origin |
|---|---|---|---|---|---|---|
| `mapTeleport` | Map "Go here" teleport | toggle | | Off | click any spot on the map and stand there (Farhold default On — Off here) | reuse |
| `showHitboxes` | Show swing hit boxes | toggle | | Off | draw attack shapes on the ground | reuse |
| `weather` | Weather | dropdown | Auto · (each of the 14 World Forge weather states) | Auto | reuse debug menu Weather group | reuse |
| `lightning` | Lightning strike | button | | | reuse (the eclipse and time-of-day tools are gone: always daylight) | reuse |
| `density` | Scatter | buttons | Bare 0 · Sparse 0.5 · Normal 1 · Thick 2 | | reuse | reuse |
| `toggleProps` / `toggleGrass` / `toggleFeatures` | Props / Grass / Roads and rivers on-off | buttons | | | reuse | reuse |
| `teleport` | Teleport to | buttons | each region hub · each dungeon entrance · each Travel Method station · each world boss · a random spot | | replaces Farhold's Nearest town / A city / A river / A road / A peak / Anywhere | reuse |
| `levelUp` / `setLevel` | Level up · Set level (1–60) | button + number | | | | reuse |
| `heal` | Heal | button | | | | reuse |
| `give` | Give | buttons | a Rare · an Epic · a Legendary · a set piece · each special rarity · a gem / jewel / soul / gadget · by item id | | | reuse |
| `discoverAll` | Discover every dungeon, waystone and station | button | | | fills the Dungeon Finder list and the map for testing | new |
| `setDepth` | Set Depth unlocked | number 0–30 | | | on the dungeon you are in or looking at | new |
| `professionSkill` | Set Harvesting / profession skill | two numbers 1–300 | | | | new |
| `spawn` / `clearEnemies` | Spawn enemy (by monster id, count) · Clear enemies | buttons | | | | reuse |
| `godMode` | Cannot die | toggle | | Off | | new |
| `unlockAll` | Unlock every feature | button | | | skips the page 07 ladder | new |
| `bossPhase` | Boss phase | dropdown + button | the current boss's phases | | jump to a phase | new |
| `showTelegraphTimes` | Show telegraph warning times | toggle | | Off | prints the warning time on each telegraph (checks page 11's minimums) | new |
| `showThreat` | Show threat numbers | toggle | | Off | each enemy's threat table over its head | new |
| `showAiState` | Show enemy AI state | toggle | | Off | | new |
| `netGhosts` | Show server positions | toggle | | Off | a ghost where the server thinks each body is | new |
| `fakeLatency` | Add latency | slider | 0–500 ms, step 10 | 0 | | new |
| `fakeLoss` | Drop packets | slider | 0–20%, step 1 | 0 | | new |
| `copyReport` / `copyLocation` | Copy debug report · Copy location | buttons | | | reuse (`copyTextVia`, works over plain http) | reuse |
| `soundToggle` / `voiceToggle` | Sound on/off · Voices on/off | buttons | | | reuse | reuse |
| `saveNow` | Save now | button | | | forces a character save to the server | reuse |

---

## 13a. Keys other pages wrote, and where they live (reconciliation 2026-09-29, updated round 2)

Every `set.` key written on another page resolves to one row on this page. Where another page used a
different name for an option this page already had, **this page's key is the one to use**, and that page
should be updated to it. Keys this pass **renamed** to another page's name are listed too.

| Key written elsewhere | Where | The setting here | Note |
|---|---|---|---|
| `set.accessibility.colour_mode` | 03 §2 | `set.access.telegraph_palette` | |
| `set.access.palette` | old 04 | `set.access.telegraph_palette` | renamed to page 11's key |
| `set.graphics.otherPlayersEffects` | old 04, 17 §4.3 | `set.combat.ally_ground_fx` | merged; page 11's key kept |
| `set.interface.bossTimeline` | old 04 | `set.interface.boss_timers` | renamed to page 11's key |
| `set.interface.ui_scale` | old 03 | `set.interface.uiScale` | resolved in round 2: 50–200% (03 now says so) |
| `set.interface.minimap_rotate` | old 03 | `set.interface.minimapRotate` | resolved in round 2: default Off (north up) on both pages |
| `set.interface.tracker_max`, `set.interface.trackerMax` | old 03, old 04 | `set.interface.quest_tracker_max` | page 14's key and range (3–12, default 8); 03 now matches |
| `set.gameplay.autoTrackQuests` | old 04 | `set.interface.auto_track_new` | page 14's key |
| `set.gameplay.autoAcceptShare` | old 04 | `set.gameplay.auto_accept_shared` | page 14's key |
| `set.interface.tips` | 03 | `set.gameplay.tutorialTips` | |
| `set.combat.quickcastGround` | 05 §2.2 | `set.controls.groundCast` = "Cast at the aim point at once" | |
| `set.gameplay.damageNumbers`, `set.combat.damageNumbers` | 05, 17 | `set.interface.damageNumbers` | |
| `set.gameplay.hitStop`, `set.gameplay.screenShake` | 05 §5 | `set.access.hitStop`, `set.access.screenShake` | |
| `set.combat.logLootOthers` | 15 | `set.interface.logLootOthers` | |
| `set.audio.classBarks`, `set.audio.class_barks` | 06 §17, `classes/swashbuckler.md` | `set.voice.ownBarks` + `set.voice.otherPlayersBarks` | 06's "On / Own only / Off" = both on / others Off / both Off |
| `set.interface.compactUnlockCards` | 07 | `set.gameplay.unlockCard` = "Toast only" | |
| `set.interface.showTitles` | 07 | `set.interface.plateTitles` | |
| `set.gameplay.auto_loot` | 08 | `set.gameplay.autoLoot` | 08 says default On; this page says Off (unresolved) |
| `set.gameplay.confirm_salvage_from` | 08 | `set.gameplay.confirmSalvageRarity` | same default (Rare and up) |
| `set.interface.show_item_level` | 08 | `set.interface.itemLevelOnIcons` | |
| `set.interface.compare_on_hover` | 08 | `set.interface.tooltipCompare` | 08's "off" = "While Shift is held" |
| `set.appearance.hide_head` / `_shoulders` / `_back` | 08 §21 | `set.gameplay.showHelm` / `showShoulders` / `showCloak` | the same switch, the other way up (`_light` / `showLight` removed: no light slot) |
| `set.social.chatStickyChannel` | 15, old 02 | `set.interface.chatStickyChannel` | |
| `set.interface.raidLayout` … `rangeFade`, all of `set.raid.*` | old 04, 13 | **removed** (raid frames → `WISHLIST.md`); `pull_timer_length`, `marker_labels`, `boss_banner`, `world_boss_alerts`, `loot_popup` moved to `set.group.*` (§7b); `set.interface.rangeFade` is back as a party option | round 2 |
| `set.raid.join_open_groups` | old 04, 13 | `set.social.joinMuster` | world bosses use the Muster channel (page 13, page 15) |
| `set.raid.dialog_vote` | old 04, 13 | **removed** — canon 00 §10 fixes the vote (party votes, tie to the leader) | round 2 |
| `set.gameplay.aimMode`, `softLockCone`, `tabCone`, `keepTargetRange`, `selfCast`, `mouseoverCast`, `tabRange`, `tabOrder`, `targetOnAttack` | old 04, old 02 | `set.controls.pointerStyle` + the Targeting group §3.1 (`self_cast_fallback`, `mouseover_cast`, `tab_range`, `tab_order`, `target_on_attack`…) | round 2 (W8) |
| `set.gameplay.autotarget_sets_target`, `ground_at_target`, `self_cast_fallback` | `classes/ranger.md`, `classes/cleric.md` | §3.1 | **`self_cast_fallback` defaults Off everywhere** (W8: no silent self-cast; decided in the round-2 sweep, the cleric file follows) |
| `set.gameplay.beast_trick_auto`, `bard_beat_cue`, `bard_beat_sound`, `dh_weakpoint_sound`, `cleric_keeping_vigil` | class files | §3.4 | added in round 2 |
| `set.gameplay.cleric_auto_mass_res` | old 04 | **removed** (no group revive, W35) | round 2 |
| `set.controls.aimAssist`, `set.controls.padAimAssist`, `set.combat.aimAssist` | old 04, 05 | **removed** (Tab targeting; page 02 §2.3) | round 2 |
| `set.graphics.nightTorches`, `set.graphics.stars`, `set.debug.timeOfDay`, `set.debug.eclipse`, `set.gameplay.showLight` | old 04 | **removed** (always daylight, no light slot) | round 2 |
| `set.interface.focusCastBar` | old 04 | `set.interface.watchCastBar` | the watch target (page 02 §2.7) |
| `set.interface.meterWindow` | old 04 | `set.interface.meterShow` + `meterMode` (§6.13) | |
| `set.travel.autoBoard`, `set.travel.boardWithParty` | early round-2 drafts | `set.gameplay.auto_board`, `set.social.boardWithParty` | |

---

## 14. Questions for the owner (also to go in `QUESTIONS.md`)

1. **Scopes** — keybinds per account by default with a per-character override; graphics per device;
   accessibility per account. Agree?
2. **Built-in boss ability timers** (`set.interface.boss_timers`; page 11 §4.3 sets it on for Normal, off for Challenge, and shows only mechanics already seen) — Wildmarch
   has no add-ons, so this stands in for what players of other games install. Keep it on by default, or
   make players learn fights without it?
3. **Read chat aloud** with formant voices — a nice fit for the voice work, but it costs CPU in a busy
   city. Keep as an option (default Off)?
4. **Region list** — the Online tab proposes four regions. Where will the servers really be (Cloudflare,
   Cloudways, one box)? One region at launch would remove the dropdown.
5. **Telegraph palettes** — page 11's five fixed palettes are in (§10.1). **Custom is held back** until page 11 adds it. Original question: five fixed palettes + Custom. Should Custom exist, given a custom palette can
   make a group harder to call ("stand in the orange")? *Recommendation: keep it; callouts should use kind
   names ("soak", "void"), which page 11 already standardises.*
6. **Units** — the owner speaks in feet ("100 or 200 ft", Farhold round 11). Default metres (the data's
   unit) or feet?
7. **Music** — there is no music system in the playground. The Music slider assumes page 17 adds one.
8. **(decided, round-2 sweep) Friendly spells with no friendly target** — `set.gameplay.self_cast_fallback`
   defaults **Off** everywhere, the cleric included (a heal refuses "No friendly target." rather than landing
   on you by surprise; canon W8). The first time a heal refuses, a tip says "Press F1 to target yourself".
9. **(new) Compare on the item card** — default **While Shift is held** (a shorter card) or **Always**?
   *Recommendation: Shift, as asked.*
10. **(new) Item portrait on Low graphics** — a still picture (default here) or off entirely?

---

## 15. Canon change requests (for page 00)

1. Add to §4: **"Telegraph colour is never the only signal — every telegraph kind also has a fixed pattern
   (page 04 §10.1)."** This constrains page 11 and every boss writer.
2. Add to §4: **"Nothing pauses"** (online) — Farhold's panels stop the game; Wildmarch's never do. Pages
   03, 05 and 11 depend on it.
3. The `_BRIEF.md` vocabulary lists the danger zone as "RED" and targeted as "YELLOW". With palettes,
   player-facing text (tooltips, boss journal, loading tips) should name **the kind** ("a danger zone"),
   never the colour. Suggest adding that to canon rule 2 or a new rule 9.
4. **(round 2)** Add to §4's Targeting row the **watch target** and the four targeting kinds' exact words
   (page 02 §13); and note that the gameplay targeting keys live in `set.gameplay.*` (§3.1).
