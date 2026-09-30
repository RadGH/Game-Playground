# WILDMARCH — Design Bible, page 03: UI screens

**Status:** v0.1 draft, 2026-09-29. Nothing is built. This page lists every screen, panel, tab, window,
popup, tooltip, card, dropdown and HUD element in Wildmarch. It **owns** screen ids (`scr_<snake>`) and
the HUD layout. Keys are owned by [page 02](02-CONTROLS.md), options by [page 04](04-SETTINGS.md),
unlock levels by [page 07](07-PROGRESSION.md) §Feature ladder, the telegraph language by
[page 11](11-BOSS-MECHANICS.md) and online rules by [page 15](15-SOCIAL-ONLINE.md). Where this page
names a key or an unlock level, it is the owner page's value; if the owner page differs, the owner wins
and this page is corrected. **Reconciled with [page 00](00-OVERVIEW.md) §10 on 2026-09-29:** keys follow
page 02's binding table, unlock levels follow page 07's ladder, slots/rarities/currencies follow page 08.

Farhold's UI was studied first: `prototypes/farhold/index.html`, `style.css`, `title.css`, `js/hud.js`,
`js/newgame.js`, `js/figure3d.js`, `js/appearance.js`, `js/bodypresets.js`, `js/map.js`, `js/markers.js`,
`js/talkui.js`, `js/vendors.js`, `js/followers-ui.js`, `js/spellcard.js`, `js/retrain.js`,
`js/questrewards.js`, `js/nearby-ui.js`, `js/settings.js`, `research/ui-round10-design.md`, the RPG.md
rounds on the sheet, map, loot card and log, plus `shared/rewards.js`, `shared/tooltip.js`, `meters/`
and Emberveil's themed look (`prototypes/emberveil/style.css`, `js/ui.js`).

---

## 0. How to read this page

Every screen entry has the same parts:

- **Id**: `scr_<snake>`. Tests and code use it as the DOM id and the `data-screen` value.
- **Open**: how the player gets there: a key (page 02 owns it), a button, an NPC, or an event.
- **Unlock**: the level or quest that makes it appear. "1" means always there. Before its unlock the
  screen's key does nothing and prints one line: "*{Screen} opens at level N.*" (see §2.8).
- **Source**: `(reuse: path)` when Farhold or the playground already builds it, `(reuse+: path)` when it
  is reused and extended, `(new)` when nothing like it exists.
- **Layout**: an ASCII sketch at 1920×1080. Columns reflow per §2.4.
- **Elements**: a table. Columns are element, what it shows, interactions, tooltip.
- **Dropdowns**: every value, in order, with the default in **bold**.
- **Empty** and **Error** states: the exact player-facing text. It follows Farhold's `WORDING.md`:
  numbers not feelings, no bare "it", a label is a label, sentence case.

Placeholders in quoted text use `{braces}`.

---

## 1. Screen index

| Id | Screen | Open | Unlock | Source |
|---|---|---|---|---|
| `scr_boot` | Boot / first load | page load | 1 | (reuse+: farhold `#boot` + main.js status lines) |
| `scr_login` | Log in | after boot | 1 | (new) |
| `scr_account` | Account | Login → Account, or Game menu | 1 | (new) |
| `scr_realm_select` | Realm select | after login, or Character select → Change realm | 1 | (new) |
| `scr_char_select` | Character select | after realm pick | 1 | (reuse+: farhold `#boot-load-screen`, `js/figure3d.js`) |
| `scr_char_delete` | Delete character confirm | Character select → Delete | 1 | (new) |
| `scr_char_create` | Character creation (5 steps) | Character select → Create | 1 | (reuse+: farhold `#boot-character`, `js/appearance.js`, `js/bodypresets.js`) |
| `scr_loading` | Loading screen with tips | entering the world, zoning, teleports | 1 | (new) |
| `scr_hud` | In-game HUD | always in the world | 1 | (reuse+: farhold `js/hud.js`) |
| `scr_telegraph_layer` | Ground warnings layer | always in the world | 1 | (new) |
| `scr_queue` | Realm queue card | choosing a Full realm | 1 | (new; requested by page 15 §2.1) |
| `hud_warning_banner` | Centre-screen boss warning banner (was `scr_boss_banner`) | boss line or mechanic | 1 | (reuse+: farhold `#zone-banner`; page 11 §8 owns the kinds) |
| `scr_unlock_card` | Unlock card | reaching an unlock | 1 | (reuse+: `shared/rewards.js`) |
| `scr_levelup` | Level-up card | gaining a level | 1 | (reuse+: `shared/rewards.js`) |
| `scr_loot_popup` | Chest / quest reward popup | opening a chest, quest reward | 1 | (reuse: `shared/rewards.js`) |
| `scr_loot_panel` | Personal loot panel + loot focus (was `scr_loot_roll`; canon is personal loot) | a kill gives you an item | 1 | (new) |
| `scr_loot_master` | Loot master hand-out window | a boss kill under the Loot master rule (premade raids) | 30 | (new; requested by page 13 §2.10) |
| `scr_death` | Death screen | health hits 0 | 1 | (new) |
| `scr_revive_offer` | Revive offer popup | an ally casts a revive on you | 1 | (new) |
| `hud_dialog_choice` | Boss dialog choice panel (was `scr_boss_dialog`) | a boss opens a dialog opportunity; answer with `Alt+1`–`Alt+4` | 5 (first dungeon) | (new; page 11 §10 owns the rules) |
| `scr_confirm` | Generic confirm dialog | any destructive action | 1 | (new) |
| `scr_invite` | Invite / ready check / summon popups | another player | 1 | (new) |
| `scr_sheet` | Character sheet shell + tab rail | any sheet tab key (`C`, `I`, `K`, `N`, `U`, `J`) | 1 | (reuse+: farhold `#sheet`) |
| `scr_sheet_gear` | Gear (paper doll + stats) | sheet tab 1, `C` | 1 | (reuse+: farhold Character tab) |
| `scr_sheet_bags` | Inventory + bags (with the Currency pane `scr_currency`) | sheet tab 2, `I` | 1 | (reuse+: farhold Inventory tab) |
| `scr_currency` | Currency pane | Bags tab → Currency | 1 | (new; requested by page 08 §17) |
| `scr_sheet_spells` | Spellbook | sheet tab 3, `K` | 1 | (reuse+: farhold Skills tab) |
| `scr_sheet_talents` | Talents (a tab inside the Spellbook) | Spellbook → Talents, `K` | 12 | (reuse+: farhold `#sheet-skilltree`) |
| `scr_sheet_perks` | Perk forest | sheet tab 4, `N` | 2 | (reuse: farhold Perks tab) |
| `scr_sheet_unlocks` | Unlocks (the feature ladder) | sheet tab 5, `U` | 1 | (new) |
| `scr_sheet_reputation` | Reputation | sheet tab 6 | 3 | (reuse+: farhold journal "Who holds this ground") |
| `scr_sheet_collections` | Collections: mounts, titles, appearance | sheet tab 7 | 1 | (new) |
| `scr_sheet_achievements` | Achievements | sheet tab 8 | 1 | (new) |
| `scr_sheet_journal` | Quest log / journal | sheet tab 9, `J` | 1 | (reuse+: farhold Journal tab) |
| `scr_renown` | Renown board | sheet tab 10 | 60 | (new; requested by page 07 §Renown) |
| `scr_bestiary` | Bestiary | Journal → Bestiary tab | 1 | (new; requested by page 10 §11) |
| `scr_world_boss_tracker` | World boss timers | Journal → World bosses tab, or Dungeon journal → World bosses | 1 | (new; requested by page 13 §8.2) |
| `scr_map` | World map | `M` | 1 | (reuse+: farhold `js/map.js`, `js/markers.js`) |
| `scr_instance_journal` | Dungeon & raid journal | `Shift+J`, or a dungeon door | 6 (quest `q_hv_the_barrow_bell`) | (new) |
| `scr_group_finder` | Group finder | `P` (Social → Group Finder tab) | 6 (quest `q_hv_the_barrow_bell`) | (new) |
| `scr_party` | Party / raid management | `P` (Social → Party tab) | 1 | (new) |
| `scr_raid_leader` | Raid leader tools | Party tab → Leader tools (leader/assist) | 30 | (new; requested by page 13 §2.5) |
| `scr_raid_lockouts` | Raid and dungeon lockouts | Party tab → Lockouts | 30 | (new; requested by page 13 §2.2) |
| `scr_guild` | Guild window | `P` (Social → Guild tab) | 1 to join · 15 to found (quest `q_hc_a_name_on_the_rolls`) | (new) |
| `scr_social` | Friends / ignore / recent | `P` (Social → Friends tab) | 1 | (new) |
| `scr_mail` | Mailbox | a mailbox object | 11 (quest `q_hc_keys_to_the_city`) | (new) |
| `scr_trading_post` | Trading post (player market) | Trading post NPC | 11 (quest `q_hc_keys_to_the_city`) | (new) |
| `scr_vendor` | Vendor | talk to a merchant | 1 | (reuse+: farhold `js/talkui.js` trade block) |
| `scr_gambler` | Gambler (sealed crates) | talk to `npc_gambler` | 1 | (reuse+: farhold `js/town.js` `gamble()`; requested by page 08 §12.7) |
| `scr_enchanter` | Enchanter (glyphs) | talk to `npc_enchanter` | 20 (glyph rank I) | (new; requested by page 08 §14) |
| `scr_jeweller` | Jeweller (gems) | talk to `npc_jeweller` | — (page 08 sets no level; the first sockets drop on Epic items) | (new; requested by page 08 §9) |
| `scr_wardrobe` | Wardrobe (change an item's look) | talk to `npc_wardrobe_keeper` / a glamourist | 25 (quest `q_ww_the_moonwell_mirror`) | (new; requested by page 08) |
| `scr_vault` | Weekly vault | the vault in any hub town | — (page 08 sets no level; a row fills once you do its content) | (new; requested by page 08 §12.9) |
| `scr_stable` | Stable | talk to `npc_stablemaster` | 10 (quest `q_hc_saddle_and_bridle`) | (new; requested by page 08 §20.1) |
| `scr_trainer` | Trainer and Unbinder | talk to a class trainer or `npc_unbinder_*` | 1 (Unbind tab 12) | (reuse+: farhold `js/retrain.js`, talkui Unbinder block) |
| `scr_craft_bench` | Crafting bench (page 08 calls it `scr_bench`) | `E` at a bench | 9 (quest `q_mf_what_the_fen_gives_back`) | (reuse+: farhold Crafting + Upgrade tabs) |
| `scr_tinker_toolbelt` | Tinker Toolbelt (gadget models) | Tinker only: a Workbench, or the Spellbook's Toolbelt button out of combat | 20 (Tinker Calling II) | (new; requested by `classes/tinker.md` §2.1) |
| `scr_bank` | Bank | banker NPC | 11 (quest `q_hc_keys_to_the_city`) | (new) |
| `scr_trade` | Player-to-player trade window | right-click a player → Trade | 5 | (new) |
| `scr_talk` | NPC conversation | `E` on an NPC | 1 | (reuse+: farhold `js/talkui.js`) |
| `scr_notice_board` | Notice board | `E` on a board | 1 | (reuse: farhold `#noticeboard`) |
| `scr_quest_offer` | Quest offer card | from `scr_talk` | 1 | (reuse+: talkui Work block, `js/questrewards.js`) |
| `scr_quest_turnin` | Quest turn-in card | from `scr_talk` at the turn-in NPC | 1 | (reuse+: `js/questrewards.js`; requested by page 14 §5.6) |
| `scr_quest_reward_choice` | Pick-your-reward panel | a turn-in with a `choice`, `pick3` or `class_pick` reward | 1 | (reuse: `shared/rewards.js` choose mode; requested by page 14 §5.6) |
| `scr_meter` | Damage meter | `Shift+M` or chat-box button | 1 | (reuse+: `meters/js/meter-ui.js`) |
| `scr_threat_meter` | Threat meter | Damage meter → Threat, or its own dock | 1 (shown in a group) | (reuse+: `meters/js/meter-ui.js`; requested by page 05 §13.7) |
| `scr_combat_log` | Combat log | chat tab "Combat", or sheet journal | 1 | (reuse+: farhold Log tab, `LOG_KINDS`) |
| `scr_settings` | Settings | `O` (alt `F10`), or Game menu | 1 | (reuse+: farhold `js/settings.js`) → [page 04](04-SETTINGS.md) |
| `scr_keybinds` | Key binding window | Settings → Keys | 1 | (reuse+: farhold settings Keys group) → [page 02](02-CONTROLS.md) |
| `scr_help` | Help & tutorial overlay | `/help`, Game menu → Help & keys, first-run tips | 1 | (new) |
| `scr_game_menu` | Game menu | `Esc` with nothing open | 1 | (reuse+: farhold `#pause`) |
| `scr_report` | Report a player | right-click a name → Report | 1 | (new) |
| `scr_spell_chooser` | New-spell card (was Farhold's spell chooser) | a spell slot opens (4, 10, 18, 28, 40) | 4 | (reuse+: farhold `onChooseSpell`) — no choice in v2, see §5.3 |

Seventy-three entries: 71 screens plus two HUD panels that behave like popups (`hud_warning_banner`,
`hud_dialog_choice`); every other HUD element is in §4.2. A test (`tests/ui-index.test.js`,
page 16) asserts every id here exists in the DOM build and every id in the DOM is listed here.

**Other pages' names for these screens.** Some pages were written before this index settled. The id on the
left is the one the builder uses; the aliases are only so a search finds the right entry.

| Id on this page | Also called on | Alias |
|---|---|---|
| `scr_sheet` | 06, 07, 08 | `scr_character` |
| `scr_sheet_spells` | classes/shaman.md | `scr_spellbook` |
| `scr_sheet_unlocks` | 07 | `scr_unlocks` |
| `scr_sheet_reputation` | 07 | `scr_reputation` |
| `scr_sheet_achievements` | 07 | `scr_achievements` |
| `scr_sheet_collections` | 07 | `scr_collections` |
| `scr_sheet_journal` | 14 | `scr_journal` |
| `scr_char_create` | 06 | `scr_create_character` |
| `scr_instance_journal` | 07, 12, 13 | `scr_dungeon_journal` (Dungeons tab), `scr_raid_journal` (Raids tab) |
| `scr_meter` | 05 | `scr_damage_meter` |
| `scr_craft_bench` | 08 | `scr_bench` |
| `hud_raid` | 13 | `scr_raid_frames` |
| `hud_quest_tracker` | — | was `hud_tracker` on this page |
| `hud_boss_frame` | — | was `hud_boss` on this page |
| `hud_dialog_choice` | 13 | `scr_dialog_choice`; was `scr_boss_dialog` on this page |
| `hud_warning_banner` | — | was `scr_boss_banner` on this page |

---

## 2. Rules every screen follows

### 2.1 Layers (stacking order)

Taken from Farhold's round-10 order (`research/ui-round10-design.md` §1.1) and extended.

| z | Layer | Notes |
|---|---|---|
| 5 | `scr_telegraph_layer` | drawn in the 3D scene, not DOM; listed for completeness |
| 8 | nameplates, floating combat text | DOM over the canvas, under the HUD |
| 10 | `scr_hud` | unit frames, bars, minimap, chat |
| 20 | `hud_warning_banner`, loot toasts | never block a click; `pointer-events: none` |
| 34 | `scr_sheet` and every full-screen window | one at a time |
| 35 | `scr_talk`, `scr_vendor`, `scr_trainer`, `scr_bank`, `scr_mail`, `scr_trade`, bench, `scr_gambler`, `scr_enchanter`, `scr_jeweller`, `scr_wardrobe`, `scr_vault`, `scr_stable` | NPC windows |
| 38 | `scr_settings`, `scr_keybinds` | must draw over the open sheet |
| 45 | `scr_map`, `scr_instance_journal` | must draw over the open sheet |
| 55 | `scr_loot_panel`, `scr_loot_master`, `hud_dialog_choice`, `scr_invite`, `scr_revive_offer` | timed popups; never behind a window |
| 60 | `scr_game_menu`, `scr_death` | |
| 900 | `scr_loot_popup`, `scr_unlock_card`, `scr_levelup` | reward cards |
| 950 | `scr_confirm` | always on top of what asked for it |
| 9000 | tooltip box | `shared/tooltip.js` |

### 2.2 Windows, cursor and Esc

- Wildmarch is a **free-cursor** game when a window is open and a **mouse-look** game when none is
  (Farhold's pointer lock). Opening any window at z 34+ releases pointer lock; closing the last one
  re-grabs it (Farhold's `regrabPointer()` retries at 140, 420 and 1300 ms). *(reuse: farhold hud.js)*
- **Combat never pauses.** This is an online game. Farhold paused the world when the sheet was open;
  Wildmarch does not. Every window is drawn at 94% opacity with the world visible behind the sheet's
  left rail gap, and the unit frame, party frames, cast bar and boss frame **stay on top of any window
  at z 34–35** (they are re-parented into a `#hud-over` strip), so you can see you are being hit.
- **Esc closes the top-most thing**, one per press: confirm → popup → window → sheet → map → nothing
  open opens `scr_game_menu`. Esc never closes `scr_death`, `scr_loot_master` or `hud_dialog_choice`
  (those have their own buttons and timers).
- Only one full-screen window at z 34 at a time. Opening a second one replaces the first; NPC windows
  (z 35) may sit beside the sheet (the bag opens next to a vendor automatically).
- Windows remember their last tab per character (saved server-side with the character's UI profile,
  page 16).

### 2.3 Tooltips

*(reuse: `shared/tooltip.js`)* One engine for every tooltip in the game. 150 ms delay; follows the
pointer 14 px off; flips at the right/bottom edge with an 8 px margin; keyboard focus hangs the box
under the element. Attributes: `data-tip` (plain text), `data-tip-html`, `data-tip-render="<name>"`
(a registered renderer), `data-tip-class`, `data-tip-off`. Renderers registered by Wildmarch:
`item`, `slot`, `spell`, `talent`, `perk`, `stat`, `buff`, `unit`, `unlock`, `achievement`, `rep`,
`mapmark`, `telegraph`, `currency`. `refreshTip()` re-renders on Shift (compare the other hand/ring).

### 2.4 Screen sizes

- Minimum supported window: **1280×720**. Designed at 1920×1080. Reflow breakpoints are Farhold's:
  ≥1600 wide (rail 220, head 68, gap 16, pad 24, card 380); ≤1440 wide or ≤800 tall (rail 184, head 56,
  gap 10, pad 12, doll 332, card 320); ≤1120 wide = one column, rail becomes a top strip.
- **The page never scrolls. Only a pane body scrolls.** (Farhold round 10's rule, with
  `scrollbar-gutter: stable` so a list crossing the scroll threshold does not jump sideways.)
- **UI scale** setting 80–150% (page 04 `set.interface.ui_scale`) multiplies every size above.
- Phone/tablet: see §14.9.

### 2.5 Numbers and text

- One number formatter: `shared/format.js` (`fmt` two decimals max, `hp` whole numbers, `pct`, `secs`,
  `range`, `sign`). Nothing ever prints `25.02000000000001`. *(reuse)*
- Thousands get a thin separator: `12 480`. Over 100 000 on a frame: `124k`; over 10 000 000: `12.4M`.
- Every changing number uses `font-variant-numeric: tabular-nums`.
- Player-facing text follows Farhold `WORDING.md`: "Deals 140% weapon damage in a 6 m cone", never
  "deals heavy damage". Durations in seconds with `s`. DoTs as total over duration.
- 12 px text floor. Only uppercase tracked pane titles may be 11.5 px.

### 2.6 Focus and accessibility

- `:focus-visible` = 2 px gold outline. Every window is `role="dialog"` with `aria-modal`; tab rails
  are `role="tablist"`. Focus goes to the selected tab when a window opens and back to the world on close.
- Hover never changes state. Every commit is a click (or Enter).
- Every colour-coded thing also has a shape or a word (telegraphs have shapes and pips, rarity has a
  gem shape, reaction colours have a nameplate icon) for colour-blind players. Colour-blind palettes
  live in page 04 (`set.accessibility.colour_mode`).
- Respect `prefers-reduced-motion`: no shake, no banner slide, reward cards skip the chest animation.

### 2.7 Build rules for the builder

- Build a window's DOM once (`dataset.wired = '1'`), then only toggle classes and text. Farhold's
  lesson: rebuilding the element under the pointer kills hover and drops clicks.
- A live-redrawing list uses Farhold's keyed morph `patch()` (frontier-foundry `js/ui/dom.js`),
  never `innerHTML` in a loop.
- Every key a screen listens for is in page 02's binding table. A test fails on a raw `e.code` check
  that is not in the table (Farhold `tests/round17-ui.test.js`).
- Every screen id in §1 appears in `tests/ui-index.test.js`.

### 2.8 Locked screens

A window whose unlock has not been reached: its key prints a line in the system chat channel,
"*The group finder opens at level 6, with the quest {quest name}.*" (quest `q_hv_the_barrow_bell`, page 07), plays `ui.error`, and does nothing else. Its rail tab or
menu button is drawn at 45% opacity with a padlock and the tooltip "Opens at level {N}." or
"Opens when you finish *{quest name}*." It is never hidden: the player should see what is coming.

---

## 3. The front end (before the world)

### 3.1 `scr_boot` — boot and first load

**Open:** loading the page. **Unlock:** 1. **Source:** (reuse+: farhold `#boot`, main.js status lines)

```
+--------------------------------------------------------------------------------+
|                                                                                |
|                         W I L D M A R C H                                      |
|             "Everyone starts with a torch and a stick."                        |
|                                                                                |
|                [=================------------]  62%                           |
|                reading the data...                                             |
|                                                                                |
|  v0.2.0 · build 2026-10-14                                    (c) Radley S.    |
+--------------------------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Title | "WILDMARCH" in Cinzel 56 px, gold, ember glow behind | — | — |
| Tagline | the pillar quote from page 00 | — | — |
| Progress bar | modules + data loaded, 0–100% | — | "{n} of {m} files" |
| Status line | one of: "reading the data…", "waking the voices…", "drawing the characters…", "finding the server…" | — | — |
| Version | client version + build date | click copies it | "Click to copy the version for a bug report" |
| Credit | "Radley Sustaire" | — | — |
| Embers | 14 drifting ember sprites (reuse: emberveil `initEmbers`) | — | — |

**Error states:**
- No WebGL2: "This browser cannot draw 3D. Wildmarch needs a desktop browser with WebGL 2 turned on." + button **How to turn it on** (opens `scr_help` page "Browser").
- Load failure: "Could not load {file}: {reason}." + **Try again** (reloads) + **Copy details**.
- Server down: goes on to `scr_login` which shows the realm status (§3.2).
- Blocked script (an ad blocker ate a file — Farhold's `beacon.js` lesson): "A browser extension blocked {file}. Allow this site in your blocker and reload."

### 3.2 `scr_login` — log in

**Open:** after boot. **Unlock:** 1. **Source:** (new). Page 15/16 own how accounts work.

```
+--------------------------------------------------------------------------------+
|  WILDMARCH                                                                     |
|                     +----------------------------------+                       |
|                     |  Log in                          |                       |
|                     |  Email     [____________________]|                       |
|                     |  Password  [____________________]|                       |
|                     |  [x] Remember me on this computer|                       |
|                     |  [        Log in         ]       |                       |
|                     |  Forgot password? · Make an account                      |
|                     +----------------------------------+                       |
|  Server: All realms up · 34 ms          Settings · Credits · Quit              |
+--------------------------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Email | text, `autocomplete="email"` | Enter moves to password | — |
| Password | password, show/hide eye | Enter submits | — |
| Remember me | checkbox, default off | keeps a login token 30 days | "Stay logged in on this computer for 30 days. Leave it off on a shared computer." |
| Log in | primary button | disabled until both fields have text | — |
| Forgot password? | link | opens a one-field form: "Email [__] [Send reset link]" | — |
| Make an account | link | opens the sign-up form (below) | — |
| Server status | "All realms up", "{n} realms down", "Maintenance until {time}" + ping ms | click opens `scr_realm_select` read-only | per-realm list |
| Settings | ghost button | `scr_settings` | — |
| Credits | ghost button | a scrolling credits pane (licences: Kenney CC0, Quaternius CC0, three.js MIT, fonts OFL) | — |
| Quit | shown only when `window.close()` works (reuse: farhold `canExit()`) | — | — |

**Sign-up form fields:** Email; Password (min 10 characters, shown strength meter: weak/fair/strong);
Confirm password; "I am 13 or older" checkbox (required); "Send me news" checkbox (default off);
**Make account**. After submit: "Check {email} for a link. The link works for 24 hours."

**Error states (exact text):**
- "That email and password do not match." (never says which one is wrong)
- "Too many tries. Wait {n} minutes and try again." (5 failures in 10 minutes)
- "Confirm your email first. [Send the link again]"
- "The login server is not answering. [Try again]"
- "This account is suspended until {date}. Reason: {reason}." + link to appeal (page 15 moderation).
- "Password must be at least 10 characters." / "The two passwords are different." / "That email already has an account. [Log in instead]"

### 3.3 `scr_account` — account

**Open:** Login → gear icon, or Game menu → Account. **Unlock:** 1. **Source:** (new)

Tabs (chip row): **Profile**, **Security**, **Characters**, **Privacy**.

| Tab | Elements |
|---|---|
| Profile | Account name (read-only), email (change → confirm by email), display language dropdown (**English**; others listed but greyed "coming later"), account created date, total play time |
| Security | Change password; Two-step login toggle (authenticator app; shows a QR code and 8 backup codes); "Log out everywhere else" button; list of logged-in devices (browser, last seen, **Log out** per row) |
| Characters | every character on every realm: name, class, level, realm, last played; **Rename** (paid token or free once, page 15); no delete here (delete is on `scr_char_select`) |
| Privacy | Who can whisper you (**Everyone** / Friends and guild / Friends only); Who can invite you to a group (**Everyone** / Friends and guild / Nobody); Show my online status (**On**/Off); Download my data (button, emails a JSON file); Delete account (red, opens `scr_confirm` with typed confirmation "DELETE {accountname}") |

### 3.4 `scr_realm_select` — realm select

**Open:** after login (skipped if the player has characters on exactly one realm; the last realm is
remembered). **Unlock:** 1. **Source:** (new)

```
+-------------------------------------------------------------------------------+
| Choose a realm                               Filter: [All types v] [x] Only mine|
+-------------------------------------------------------------------------------+
| *  Name          Type          Population   Ping    My characters  Status     |
| *  Brightwater   Normal        High         34 ms   3              Up         |
|    Ashfall       Normal        Medium       41 ms   0              Up         |
|    Rimehold      Hardcore      Low          88 ms   1              Up         |
|    Saltmarch     Normal        Full (queue) 36 ms   0              Up · 214 in queue |
|    Spire         Test realm    Low          120 ms  0              Down       |
+-------------------------------------------------------------------------------+
| Recommended: Brightwater (most of your friends)          [Back] [Choose realm]|
+-------------------------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Star | favourite realm | click to star/unstar | "Star this realm to put it first" |
| Name | realm name (named after in-world towns) | double-click = choose | — |
| Type | Normal / Hardcore / Test realm | — | Normal: "Death costs durability and a walk." Hardcore: "Death is permanent for characters made here." Test realm: "Resets without warning. For trying new builds." |
| Population | Low / Medium / High / Full (queue) | — | "Players online right now: about {n}" |
| Ping | round-trip ms, colour: ≤80 green, ≤150 amber, >150 red | refreshes every 5 s | "Time for a message to reach the realm and come back" |
| My characters | count on this realm | — | names and levels |
| Status | Up / Down / Maintenance / Up · {n} in queue | — | expected time back |
| Filter dropdown | **All types**, Normal, Hardcore, Test realm | — | — |
| Only mine | checkbox, default off | hides realms with 0 characters | — |
| Recommended line | the realm with the most friends, else lowest ping | — | — |
| Choose realm | primary | → `scr_char_select`; queue realm opens the queue card | — |

**Queue card** (`scr_queue`, requested by page 15 §2.1; page 15 owns realm capacity): "Saltmarch is full. You are number {n} in the queue, about {m} minutes." + **Leave
queue**. A sound (`ui.open`) plays when you get in.

**Empty:** "No realms answered. The servers may be down for maintenance. [Try again]"

> Hardcore and Test realm types are **proposals**. Page 15 decides whether they exist (see Questions).

### 3.5 `scr_char_select` — character select

**Open:** after realm pick. **Unlock:** 1. **Source:** (reuse+: farhold save list `drawSaves()` +
`js/figure3d.js`)

```
+----------------------------------------------------------------------------------+
| Brightwater (Normal) [Change realm]                          3 of 12 characters   |
+----------------------+--------------------------------------+--------------------+
| CHARACTERS           |                                      | WREN               |
| > Wren     Lv 23     |          (3D figure, sways,          | Level 23 Ranger    |
|   Ranger · Sunscar   |           drag to turn,              | Elf                |
| - Borin    Lv 8      |           idle clip of the class)    | Sunscar Barrens    |
|   Warrior · Mossfen  |                                      | Played 31h 12m     |
| - Pell     Lv 1      |                                      | Guild: Lantern Oath|
|   Cleric · Hearthvale|                                      | Last on 2 days ago |
|                      |          [ Rotate ] [ Zoom ]         |                    |
| [+ Create a character]|                                     | [Customize look]   |
+----------------------+--------------------------------------+--------------------+
| [Account]  [Delete character]                    [ Enter Wildmarch ]              |
+----------------------------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Realm line | realm name + type, **Change realm** | → `scr_realm_select` | — |
| Slot count | "{n} of 12 characters" (12 per realm, page 15) | — | — |
| Character row | name, level, class icon + class, region name, rarity-free; a small gold star on the last played | click selects; double-click enters; drag to reorder | class role + armour |
| Create a character | row at the end of the list | → `scr_char_create`; disabled at 12: "This realm is full for you. Delete a character or use another realm." | — |
| 3D figure | the selected character in their worn gear, idle clip, on a backdrop matching their region (the region's scenery SVG from `assets/data/scenery/`) | drag to turn (0.012 rad/px), wheel zooms 0.8–1.4× | "Drag to turn" |
| Details card | name, level + class, race, region, played time ("{h}h {m}m"), guild, last on | — | — |
| Customize look | ghost button | opens the barber version of the appearance editor (§3.7.4) with only Face and Hair tabs free; other tabs cost gold in town | — |
| Enter Wildmarch | primary button | → `scr_loading` | — |
| Delete character | ghost red | → `scr_char_delete` | — |

The figure is ONE WebGL context for the whole front end (Farhold's `figure3d.js` `attach()` /
`restore()`), disposed with `forceContextLoss()` before the game's renderer is made.

**Empty:** first visit to a realm with no characters skips straight to `scr_char_create`. If a player
backs out of creation with none: "No characters on {realm} yet." + **Create a character**.

**Error:** "{name} is in the world on another computer. [Log them out]" / "Could not load {name}.
[Try again] [Report]" / figure without WebGL: "This browser cannot draw 3D, so the preview is off."
(reuse: figure3d.js text)

### 3.6 `scr_char_delete` — delete confirm

**Open:** Character select → Delete character. **Source:** (new; Farhold deleted saves with **no
confirm**, which is the bug this fixes)

```
+------------------------------------------------------+
|  Delete Wren?                                        |
|  Level 23 Ranger · 31h 12m played                    |
|  Everything Wren carries and has in the bank is gone.|
|  Type WREN to confirm:  [__________]                 |
|                         [Cancel]  [Delete forever]   |
+------------------------------------------------------+
```

- Level 1–9 characters: a plain two-button confirm ("Delete Pell?" / **Cancel** / **Delete**).
- Level 10+: typed name required (case-insensitive); **Delete forever** stays disabled until it matches.
- Guild leaders: refused: "Wren leads Lantern Oath. Pass leadership on first."
- Deleted characters of level 10+ are restorable for 30 days from `scr_account` → Characters
  ("Restore" row, greyed). The confirm says so: "You can restore Wren from the Account screen for 30 days."

### 3.7 `scr_char_create` — character creation

**Open:** Character select → Create. **Unlock:** 1. **Source:** (reuse+: farhold `#boot-character`
three-column layout, `js/appearance.js`, `js/bodypresets.js`, `js/spellcard.js`, `shared/voices.js`)

Farhold had two steps (Character, World). Wildmarch has **five**, on a step bar. The world is fixed,
so Farhold's World step is gone. Back/Next keep everything you chose; Esc steps back one step.

```
 (1) Race  ·  (2) Look  ·  (3) Class  ·  (4) Voice  ·  (5) Name
+--------------------+---------------------------------+---------------------------+
| LEFT: the choices  |        3D figure (centre)       |  RIGHT: what it means     |
|  for this step     |   sways ±50°, drag to turn,     |  (race card, class card,  |
|                    |   plays the class idle          |   voice sample, rules)    |
+--------------------+---------------------------------+---------------------------+
| [<- Back]          Elf · Ranger · "Wren"                        [Next: Class ->]   |
+-----------------------------------------------------------------------------------+
```

Columns: `minmax(240px,300px) | minmax(300px,1fr) | minmax(340px,1.3fr)` (Farhold `title.css`).
Under 1000 px wide it stacks with the figure first.

#### 3.7.1 Step 1 — Race and body preset

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Race cards (4) | Human, Elf, Dwarf, Halfling: name, a 2D portrait (avatar-2d), one line of lore | click picks; applies the body preset | "{Race} proportions: height, build, head size and roundness" (reuse: appearance.js) |
| Gender presentation | chip row: **Masculine**, Feminine, Neutral | sets default hair/brows + voice gender | "Changes the starting look and voice. Every look and voice option stays open." |
| Race card (right) | lore paragraph (page 01), home region (all start in Hearthvale), "Race has no stats. It changes your look and how the townsfolk greet you." | — | — |

Body presets applied (reuse: `js/bodypresets.js` values):

| Race | Height | Build | Head size | Roundness | Skins offered first | Forced swaps |
|---|---|---|---|---|---|---|
| Human | 0.55 | 0.53 | 0.52 | 0.12 | #ffdbb4 #f1c27d #e0ac69 #c68642 #8d5524 #5c3a1e | none |
| Elf | 0.78 | 0.28 | 0.43 | 0 | #ffdbb4 #f1c27d #e0ac69 #c9cfc3 #b8a1d9 | ears → pointed |
| Dwarf | 0.17 | 0.80 | 0.65 | 0.45 | #f1c27d #e0ac69 #c68642 #d98f6a | no beard → full |
| Halfling | 0.15 | 0.57 | 0.68 | 0.35 | #ffdbb4 #f1c27d #e0ac69 #c68642 | ears pointed/normal |

Default race: **Human**, Masculine. Race is **locked for good** after creation (a race change is not
in v2).

#### 3.7.2 Step 2 — Look (appearance editor)

(reuse: `js/appearance.js`, same tabs, same controls, same palettes from `avatar-2d/data/presets.json`)
The editor sits in the left column; the figure is in the centre, live. A **Class outfit preview** toggle
(default on) dresses the figure in the chosen class's starting gear (`avatar-3d/js/class-outfits.js`
`dressAs`), because armour you find replaces hat/top/legs/boots anyway. Off shows the body's own
clothes (worn in town when "Show armour" is off, page 04).

Buttons: **Randomise** (race-weighted, `randomChibi2`), **Race default**, and the step bar's Back/Next.
Every slider row is label (116 px) · control · value readout (2 decimals when step < 1).

**Body tab**

| Control | Type | Range / values | Default |
|---|---|---|---|
| Height | slider | 0–1, step 0.01 | race preset |
| Build | slider | 0–1, step 0.01 | race preset |
| Head size | slider | 0–1, step 0.01 | race preset |
| Roundness | slider | 0–1, step 0.01 | race preset |
| Round cheeks | checkbox | on/off | **off** |
| Skin | 12 swatches + free colour | #ffdbb4 #f1c27d #e0ac69 #c68642 #8d5524 #5c3a1e #9db38a #7fa86a #c9cfc3 #b8a1d9 #6e8fb3 #d98f6a | race's 2nd skin |

Height and build are clamped to the race's range (Human 0.2–0.9 height, Elf 0.55–1, Dwarf 0–0.35,
Halfling 0–0.3; build Human 0.25–0.8, Elf 0.1–0.45, Dwarf 0.6–1, Halfling 0.35–0.8). Farhold let the
sliders run free; Wildmarch clamps so a "Dwarf" reads as a dwarf to other players.

**Face tab**

| Control | Values | Sliders |
|---|---|---|
| Head shape | round, oval, square, heart, long, wide, chiseled | — |
| Eyes | round, almond, narrow, wide, sleepy, angry, dot, anime, happy, wink, glow, glow_tear | Spacing −0.4..0.4 /0.02 · Height −0.3..0.3 /0.02 · Size 0.8..1.25 /0.01 · Tilt −10..10 /1 |
| Eye colour | #4a6b8a #3a8a5a #6b4a2a #222222 #8a6a2a #5a4aaa #c33333 #7fe0ee #e0c040 + free | — |
| Eyebrows | straight, arched, angry, worried, thick, thin, none, raised | Height −0.3..0.3 · Tilt −10..10 |
| Nose | small, dot, button, long, wide, hook, upturned, none | Height −0.2..0.3 · Size 0.8..1.3 |
| Mouth | smile, neutral, frown, open, grin, smirk, o, tongue | Height −0.2..0.3 · Size 0.8..1.3 |
| Mouth colour | cloth palette (16) | — |
| Ears | normal, pointed, big, none | — |
| Facial hair | none, stubble, goatee, mustache, full, long, chinstrap, soul_patch, braided_beard | — |
| Marks | none, freckles, blush, scar, scar_cheek, warpaint, tattoo, dirt, third_eye, wrinkles, burn_scar, nose_scar, paint_dots, cheek_stripes, eye_black, freckles_heavy, war_stripe, face_glyphs | — |

**Removed for players** (enemy-only parts kept out of the dropdowns, they are warband looks): eyes
`hollow`, `slit`; nose `snout`; mouth `fangs`, `sad_open`, `stitched`, `tusks`; ears `fins`; marks
`undead_skin`, `pale`, `blood`, `brand`, `lightning_arcs`, `chest_glow`, `soot`, `mud`.

**Hair tab**

| Control | Values |
|---|---|
| Hair | bald, buzz, short, side_part, bangs, bob, long, wavy, ponytail, bun, buns, mohawk, spiky, curly, afro, braids, pixie, slicked, hood_hair, tonsure (`horns_hair` removed: enemy-only) |
| Hair colour | #111111 #3b2a1a #6b4a2a #a86a3a #d9c27a #f2e2b0 #8a1a1a #d94a2a #888888 #eeeeee #4a3a8a #2a7a5a #e66aa8 + free |

**Outfit tab** (the clothes under armour; a new character starts in its class outfit)

| Control | Values |
|---|---|
| Top | tshirt, tunic, hoodie, vest, tank, robe, dress, coat, rags, apron, gi, travel_shirt, gambeson, fur_tunic, wraps, doublet, open_coat, sash_robe, silks, high_collar_robe (armour tops like plate/chainmail are gear only) |
| Top colour / Trim colour | cloth palette 16 + free; trim default #ffffff |
| Bottom | pants, shorts, skirt, kilt, ragged, loincloth, baggy, breeches, leggings |
| Shoes | sneakers→renamed "soft shoes", boots, sandals, barefoot, slippers, pointed, shoes, wraps |
| Accessory | none, glasses, round_glasses, monocle, eyepatch, scarf_mask, earrings, nose_ring, scarf, pendant, prayer_beads |
| Hat | none, hood, cap, bandana, headband, straw, circlet, wide_brim, feather_cap, feather_band, hood_down (helmets are gear) |
| Cape | none, cape, shoulder_cape, half_cape, shawl, travel_cloak |

Cloth palette: #2e7d32 #2f4f7f #8a2e2e #c9a227 #3b3d8a #6b4a2a #4a3a2a #8a8f99 #2a2a3a #7a2a6a #e8e8e8
#1a1a2a #5a5f66 #b5651d #2a6a6a #f2d9e6 + free colour.

Held/offhand/decor are not in the editor: gear owns them (reuse rule from appearance.js). Every new part
id offered here must be registered in `avatar-2d/js/parts/chibi2-parts.js` or the shared normaliser
drops it (playground CLAUDE.md rule).

#### 3.7.3 Step 3 — Class picker with preview

```
+-------------------------+-----------------------------+------------------------------+
| Role: [All v]           |  figure in the class outfit | RANGER            Damage     |
| Armour: [All v]         |  playing the class's first  | Light armour · Focus         |
| ------------------------|  spell on a loop against a  | Hunting cat + marks          |
| TANK                    |  training dummy             | [bow] [Can hold: bow, spear] |
|  Warrior    Tank/Dmg    |                             | Brings a companion: a cat.   |
|  Paladin    Tank/Heal   |  [Play spell 1..6 buttons]  | SPELLS (6, by level)         |
|  Knight     Tank/Supp   |                             | Lv1  Piercing Shot  [chips]  |
|  ...                    |                             | Lv4  ...  (locked, greyed)   |
| DAMAGE ...              |                             | MECHANIC: grows at 6/20/40   |
+-------------------------+-----------------------------+------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Role filter | dropdown: **All**, Tank, Healer, Damage, Support | filters the list; a class shows under each role it "can also" do | — |
| Armour filter | dropdown: **All**, Cloth, Light, Medium, Heavy | — | — |
| Resource filter | dropdown: **All**, Mana, Fury, Focus | — | "Mana: big pool, slow refill. Fury: builds by hitting and being hit, drains out of combat. Focus: small pool, fast refill." |
| Class list | 30 rows grouped by main role (headings TANK, HEALER, DAMAGE, SUPPORT, alphabetical inside), each: class icon, name, role tags, "companion" tag if it has one | click selects; ↑/↓ moves; the list keeps the dropdown-equivalent `#create-class` select as the one the form reads (reuse: farhold rule) | role + resource |
| Figure | class outfit (`class-outfits.json`), the chosen body | drag to turn | — |
| Spell preview buttons | 1–6: plays that spell's animation + spellfx on a dummy, 2.5 s loop | click | the spell card |
| Class card | name, main role, "Can also: {roles}", armour, resource, mechanic name + one-sentence brief (page 00 §6), weapons ("Starts with a {weapon}", "Can hold {list}") | — | — |
| Spell list | the 6 spells in ladder order with "Level 1/4/10/18/28/40", fact chips (reuse: `js/spellcard.js` order: shape, element, % damage, heals, summons, status, cost, cooldown) and a 2-line description that expands on click | click expands | full spell card (§7.3) |
| Mechanic panel | the gauge art + "Grows at level 6, 20 and 40 through the calling quests." | — | — |
| Difficulty dots | 1–3 dots: "How much there is to track" (page 06 owns the number per class) | — | "1 dot: one bar to watch. 3 dots: a gauge, a companion and timing windows." |
| Role line under Next | "Tanks take the hits in groups. The group finder will ask you to tank." (per role) | — | — |

Default class: **Warrior** (first in the Tank list). Class is locked for good (a class change is not in
v2; the Unbinder only undoes spell talents and perks).

**Empty:** a filter combination with no class: "No class matches those filters. [Clear filters]".

#### 3.7.4 Step 4 — Starting voice

(new; built on `shared/voices.js` `voiceFor({ role, gender, seed })` and the formant engine)

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Voice family | dropdown: **Class voice** (the class's `ROLE_VOICES` entry), Warm, Gruff, Bright, Soft, Old, Young | picks the base timbre | "The class voice is how {Class}s sound by default. The others are shared starting points." |
| Voice 1–6 | six chips, each a seed of that family | click plays the sample line | "Voice {n} of 6" |
| Pitch | slider 0–1 /0.01 | live | "How high the voice sits" |
| Depth | slider 0–1 /0.01 | live | "How big the chest sounds" |
| Speed | slider 0–1 /0.01 | live | "Words per second" |
| Tone | slider 0–1 /0.01 | live | "Bright or dark" |
| Breath | slider 0–1 /0.01 | live | "How much air is in it" |
| Rough | slider 0–1 /0.01 | live | "Gravel" |
| Gender | chips: Masculine / Feminine / Neutral (default from step 1) | shifts pitch/depth as `voiceFor` does | — |
| Sample line | dropdown: **Greeting** ("Well met. The road north is open."), Battle cry, Low health, Level up, Spell crit | plays through Lingo + the voice | — |
| Hear it | button (also Space) | plays the sample | — |
| Mute preview | toggle | — | — |

The voice is a JSON object saved on the character (`voice`, shared character schema). It can be changed
later for gold at a barber (the Customize look screen, Voice tab).

#### 3.7.5 Step 5 — Name

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Name field | text, max 16 | live validation, green tick or red reason under it | rules below |
| Random name | dice button | Name Forge (`namegen`) `person.first` for the race's language, re-rolls until the name is free | "A name in the {race} tongue" |
| Summary card | race, class, voice family, "Starts in Brightwater, Hearthvale" | — | — |
| Create | primary button "Begin in Hearthvale" | server checks the name; → `scr_loading` → the opening scene | — |

**Name rules** (checked in this order, first failure shown):

| Rule | Message |
|---|---|
| 3–16 characters | "A name is 3 to 16 letters." |
| Letters only, plus one apostrophe or hyphen not at the start or end | "Letters only, and one ' or - in the middle." |
| No letter three times in a row | "No letter three times in a row." |
| At most 2 capital letters, first letter forced capital | (auto-fixed, no message) |
| Accented Latin letters allowed (é, ö, ñ, å, ç…) | — |
| Not on the blocked-words list (page 15 moderation) | "That name is not allowed." |
| Not an NPC, boss, region or town id/name from pages 01, 10, 12, 13 | "That name belongs to someone in the Wildmarch already." |
| Free on this realm (case- and accent-insensitive) | "Someone on {realm} already has that name." |
| Server answered | "Could not check the name. [Try again]" |

Farhold took any text up to 18 and fell back to the class name; Wildmarch requires a name because other
players see it.

### 3.8 `scr_loading` — loading screen with tips

**Open:** entering the world, crossing into an instance, a teleport longer than 1 s. **Source:** (new;
Farhold had status lines only)

```
+----------------------------------------------------------------------------------+
|     (full-screen region art: the scenery SVG of the destination, darkened 30%)    |
|                                                                                   |
|   MOSSFEN                                                     Level 5–12           |
|   Reedhollow · the Fenfolk                                                        |
|                                                                                   |
|   TIP  A purple swirl on the ground keeps hurting you every 0.5 s while you       |
|        stand in it. Step out, then keep fighting.            [ < ] 12 / 140 [ > ]  |
|   [================================-----------]  loading the marsh...             |
+----------------------------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Backdrop | destination region art (`assets/data/scenery/*.svg`, tagged by region); dungeons use their own art | — | — |
| Destination | region/dungeon name, level band, hub + holder (page 00 §7) | — | — |
| Difficulty tag (instances) | Normal / Heroic / Mythic+ {key level} | — | — |
| Tip | one tip from `data/tips.json`, picked for the player's level band and class (weights: 50% general, 30% class, 20% region) | ← / → cycles; tips already seen 3 times are skipped | — |
| Tip counter | "{n} / {total}" | — | — |
| Progress bar + status | same as `scr_boot` | — | — |
| Lore line (optional) | a one-line quote from page 01 about the destination | — | — |

Tip categories and examples (the full list lives in `data/tips.json`, ~140 tips; page 11 wording):
- Telegraphs: "A red fill growing from the edge in hits once when it reaches the middle. Leave before then."
- Soak: "An orange circle with 3 pips needs 3 people inside it, or it hits the whole group."
- UI: "Hold Shift over an item to compare it with your other ring or your off hand."
- Class: "Warriors: every Shield Bash stores a block charge. Watch the Bulwark gauge." (numbers from the class file)
- World: "Night lasts 15 minutes of every hour, and the dark is more dangerous." (page 05 owns how much)

**Error:** after 60 s: "This is taking longer than usual. [Keep waiting] [Back to character select]".

---
## 4. `scr_hud` — the in-game HUD

**Open:** always, in the world. **Unlock:** each element has its own (column "Unlock" below).
**Source:** (reuse+: farhold `js/hud.js`). Farhold's HUD was a solo HUD: one health/mana/XP stack
top-left, a place card and minimap top-right, a 6-slot skill bar, a one-line target bar and a boss bar.
Wildmarch keeps those and adds everything a group game needs.

### 4.1 Layout at 1920×1080 (default positions)

```
+------------------------------------------------------------------------------------------------+
|[PLAYER FRAME]  [TARGET FRAME] [ToT]                [BOSS FRAMES 1-5, stacked]   [MINIMAP 200px] |
| portrait hp mp  portrait hp    name                 name  hp%  cast bar         | N  zoom +/-  |
| buffs debuffs   cast bar       hp                   name  hp%  cast bar         |  icons       |
| [FOCUS FRAME]   buffs debuffs                                                    +--------------+
|                                                                                  Region · 12:40 |
|[PARTY FRAMES]                          !! THE TIDE ANSWERS ME !!                  [QUEST TRACKER]|
| 4 members                              (boss warning banner)                     Main: ...      |
| hp mp role                                                                       [ ] 3/8 hides  |
| buffs                                                                            Side: ...      |
|                                                                                  [NEARBY]      |
|[RAID FRAMES replace party frames                                                                |
| in a raid: 2x5 or 4x5 grid]                  + crosshair                                        |
|                                    (floating combat text, nameplates in the world)              |
|                                                                                                 |
|[CHAT BOX 440x220]                   [PLAYER CAST BAR]                 [LOOT TOASTS stack up]    |
| tabs: General Party Guild Combat    [FORM BAR - druid etc.]            [UNLOCK CARD slot]       |
| lines...                            [MECHANIC GAUGE]                                           |
| [input]                  [1][2][3][4][5][6] [Q][G] [F dodge][R potion][H mount] [dur] [ms fps] |
|                                 [============== XP BAR full width ==================]           |
+------------------------------------------------------------------------------------------------+
```

Every frame can be moved and scaled in **HUD edit mode** (Game menu → Edit HUD layout; no default key —
page 02 has none):
drag frames, snap to a 16 px grid, scale 70–140% per frame, **Reset this frame** / **Reset all**.
Layouts save per character. *(new; Farhold's HUD was fixed)*

### 4.2 HUD elements index

| Element | Id | Unlock | Source |
|---|---|---|---|
| Player unit frame | `hud_player` | 1 | (reuse+: farhold `#hud-left` bars) |
| Target frame | `hud_target` | 1 | (reuse+: farhold `#target`) |
| Target of target | `hud_tot` | 1 | (new) |
| Focus frame | `hud_focus` | 1 | (new) |
| Party frames | `hud_party` | 1 (shown in a party) | (new) |
| Raid frames | `hud_raid` | 30 (shown in a raid) | (new) |
| Boss frames + cast bars + break bar | `hud_boss_frame` | 1 (shown in a boss fight) | (reuse+: farhold `#boss-bar`; page 11 §7 owns the parts) |
| Player cast bar | `hud_castbar` | 1 | (reuse+: farhold `charge-meter`) |
| Action bar (6 spells) | `hud_actionbar` | 1 | (reuse+: farhold `#skillbar`) |
| Shared keys (dodge, potion, potion belt, mount, light, basic attack) | `hud_utility` | per page 07 ladder | (new) |
| Mechanic gauge frame | `hud_gauge` | 6 (first calling quest) | (new) |
| Class gauges inside the frame | `hud_bulwark`, `hud_stance_dial`, `hud_oath`, `hud_quarry`, `hud_pet`, `hud_combo`, `hud_devotion`, `hud_class_gauge` | 6 (per class file) | (new; §4.9.1) |
| Borrowed bar (Enchanter's charmed enemy) | `scr_hud_borrowed_bar` | Enchanter only (class file) | (new; §4.9.2) |
| Form / stance bar | `hud_formbar` | class-specific | (new) |
| XP bar | `hud_xp` | 1 (hidden at 60, becomes Renown bar) | (reuse: farhold `.bar.xp`) |
| Buff / debuff rows | `hud_auras` | 1 | (reuse+: farhold `#hud-statuses`) |
| Minimap | `hud_minimap` | 1 | (reuse+: farhold `#minimap`) |
| Place line + clock | `hud_place` | 1 | (reuse: farhold `#hud-place`) |
| Quest tracker | `hud_quest_tracker` | 1 | (reuse+: farhold `#hud-objective`) |
| Event tracker | `hud_event_tracker` | 1 (shown during a dynamic event) | (new; requested by page 14 §13) |
| Nearby panel | `hud_nearby` | 1 | (reuse: farhold `js/nearby-ui.js`) |
| Chat box | `hud_chat` | 1 | (reuse+: farhold `#log`) |
| Floating combat text | `hud_fct` | 1 | (reuse+: farhold `#hitnums`) |
| Nameplates | `hud_nameplates` | 1 | (new) |
| Boss warning banner | `hud_warning_banner` | 1 | (reuse+: farhold `#zone-banner`) |
| Boss dialog choice | `hud_dialog_choice` | 5 | (new) |
| Pull timer / break timer | `hud_pull_timer`, `hud_break_timer` | 1 (shown when a leader starts one) | (new; §4.18) |
| Legendary loot banner | `hud_legendary_banner` | 1 | (new; requested by page 08 §8.2) |
| Zone banner | `hud_zone_banner` | 1 | (reuse: farhold `announceZone`) |
| Edge arrows | `hud_edge_arrows` | 1 | (reuse: farhold `edgeArrows`) |
| Interact prompt | `hud_prompt` | 1 | (reuse: farhold `#prompt`) |
| Work / gather bar | `hud_workbar` | 1 | (reuse: farhold `workBar`) |
| Loot toasts | `hud_toasts` | 1 | (new) |
| Durability doll | `hud_durability` | 1 | (new) |
| Latency / fps | `hud_net` | 1 | (new) |
| Notice line | `hud_notice` | 1 | (reuse: farhold `#hud-notice`) |
| Crosshair | `hud_crosshair` | 1 | (reuse: farhold `#crosshair`) |
| Micro-menu | `hud_micromenu` | 1 | (new) |

### 4.3 `hud_player` — player unit frame

```
+--------------------------------------------+
| [portrait]  Wren  Lv 23         [Leader ♛] |
|  (3D head,  [=====HEALTH 1 840 / 2 210====]|
|   class     [==MANA 612 / 900====]         |
|   ring)     [RESOURCE 2: Fury / Focus]     |
| buffs:  [ic][ic][ic][ic]  (up to 16)       |
| debuffs:[ic][ic]           (up to 8)       |
+--------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Portrait | live 3D head (a second small render of the Chibi 2 head, 64 px, updated 4×/s) with a class-coloured ring; in combat the ring pulses red | right-click: menu (Leave party, Set focus on self, Reset instances if leader, Loot rules if leader) | — |
| Name + level | "Wren  Lv 23" | — | "{race} {class}. {title}" |
| Leader crown | ♛ when you lead the party; ✦ when you are raid assistant | — | "Party leader" |
| PvP flag | crossed swords when flagged (page 15) | — | "You can be attacked by other players" |
| Rest mark | "zZ" in an inn: rested XP bonus is building | — | "Resting: kills give 2× XP until the purple bar runs out" (number: page 07) |
| Health bar | fill + "1 840 / 2 210"; a white overlay for shields/barrier "+ 320"; a green ghost for incoming heals; a red ghost for damage just taken (fades 0.6 s) | — | "Health. Out of combat it refills {n} a second." |
| Health text mode | per page 04: **Current / max**, Percent, Current only, Missing, None | — | — |
| Resource bar(s) | Mana (blue #4f7fff), Fury (red #d8452e), Focus (amber #e0a030); classes with forms show the form's resource second | — | resource rules (page 05) |
| Buff row | own buffs, 24 px icons, remaining time under each ("12s", "3m", nothing if permanent), stacks in the corner | right-click a buff: cancel it (not debuffs) | name, what it does in numbers, source, time left |
| Debuff row | 28 px, border colour = dispel type: Magic #4f8fff, Curse #a050e0, Poison #5fbf3f, Disease #b09040, Bleed #d03030, none = grey | — | same + "Dispel: {type}" |
| Low-health edge | below 30% health the screen edge glows red (vignette), 35% opacity, pulsing at 1 Hz below 15% | — | — |

**Empty:** no buffs = the row collapses (no "no buffs" text).

### 4.4 `hud_target`, `hud_tot`, `hud_focus`

Farhold's target bar was a name + a bar, fed by the 3D crosshair hitscan (round 16 fix). Wildmarch keeps
that pick rule (the target is what the crosshair ray hits, or what you Tab to / click) and makes it a
full frame.

```
TARGET                                       ToT
+-------------------------------------------+ +----------------+
| [portrait] Mossfen Lurker  Lv 11  Elite ◆ | | Borin    92%   |
|  [=========HEALTH 78%  4 120 / 5 300====] | +----------------+
|  [cast bar: Bog Spit  1.2s  (gold edge)]  |
|  debuffs YOU put on it (first) | others   |
|  buffs on it (enrage, shield)             |
|  12 m · Beast · threat: 84% [=====]       |
+-------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Name colour | reaction: hostile #e05040, neutral #e0c040, friendly #50c060, other player (friendly) #5aa0ff, other player flagged hostile #ff6a3a | — | — |
| Level | "Lv 11"; "Lv ??" skull when 10+ above you; colour by difference: grey ≤ −6, green −5..−3, yellow −2..+2, orange +3..+4, red +5 or more (same bands as Farhold's zone tones) | — | "{n} levels above you" |
| Rank tag | Normal (none), Elite ◆, Champion (blue #6ab0ff), Rare ★ (pink #ff8adf), Boss ♛ (gold #ffd24a) — Farhold's enemy colours | — | rank rules (page 10) |
| Portrait | 3D head of the unit | — | — |
| Health | % + numbers (per page 04 setting) | — | — |
| Cast bar | spell name + time left; grey fill = cannot interrupt, **gold border = interruptible** (page 11 rule); flashes white and reads "Interrupted" when kicked | — | the ability's journal entry |
| Aura rows | debuffs you applied first, bigger (28 px); others' 22 px; enemy buffs on a second row; a stealable/dispellable buff has a glowing border | — | name + numbers + time |
| Distance + type | "12 m · Beast" | — | — |
| Threat meter | only in a group, only on hostile targets: your share of the top threat, 0–100%+, bar green <70, amber 70–99, red ≥100 ("you have its attention") | — | "Threat: how angry it is at you compared to whoever it is hitting" |
| Target-of-target | small frame: name, health %, class colour | click targets it | — |
| Focus frame | a second target frame (smaller, 80%) for the unit you set as focus (`Y`, page 02 `setFocus`, or right-click → Set focus); shows cast bar, used to watch an interrupt target | click targets it | — |
| Out of range | frame dims to 55% when beyond your longest spell's range | — | — |

**Empty:** no target = the frame is hidden (no placeholder).

### 4.5 `hud_party` — party frames (2–5 players + followers)

```
+----------------------------+
| ♛ Borin   [T] [==HP 92%==] |
|           [mp ===      ]   |
|  [buffs] [debuff: Magic]   |
| Pell      [H] [==HP 61%==] |  <- red border flash when hit hard
| Mira      [D] [==HP 100%=] |
| Kael (follower) [D] [==]   |
+----------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Row | role icon (Tank shield, Healer cross, Damage sword, Support banner), name in class colour, health bar, resource bar (healers' mana always shown), level if different from yours | click targets; right-click menu (Whisper, Inspect, Trade, Follow, Promote to leader, Kick, Set focus, Report) | — |
| Debuffs | 3 most important, dispellable ones first, border in dispel colour | — | — |
| Dead | grey bar, "Dead" + a ghost icon; "Released" when they left their body | — | — |
| Offline | 40% opacity, "Offline" | — | — |
| Out of range | 50% opacity past 40 m | — | — |
| Ready check | ✓ / ✗ / ? over the row for 10 s | — | — |
| Incoming revive | a green pulse on the row | — | — |
| Follower rows | hired followers and class companions that fill party slots (pillar 6), marked "(follower)" and italic | right-click: Stance (Attack / Defend / Passive), Dismiss | — |
| Aggro warning | red border when a mob is targeting a non-tank | — | — |

Healers get **click-casting** (page 02): hovering a party frame and pressing a spell key casts on that
member.

### 4.6 `hud_raid` — raid frames (10 or 20)

Grid of groups of 5: 2×5 (10-player) or 4×5 (20-player), each cell 96×40 px: name (6 chars), health
fill, role icon corner, one dispellable debuff icon, a boss-mechanic marker (e.g. yellow "Targeted"
ring icon, orange "Soak" pip). Sort dropdown: **By group**, By role (tanks, healers, damage/support),
By class. Options (page 04): show resource bars (**off**), show pets (**off**), bars grow **left to
right**/bottom to top. Same click/right-click rules as party frames. The eight target icons (page 02
§5.3: Sun, Moon, Star, Flame, Leaf, Wave, Crown, Skull, keys `Num 1`–`Num 8`) show on raid frames and
nameplates. Page 13 §2.4 calls this element `scr_raid_frames` and adds its layouts (Grouped, By role,
Compact, Healer wide) and the page 11 mechanic badges; those are part of `hud_raid`.

### 4.7 `hud_boss_frame` — boss frames with cast bars (was `hud_boss`)

Up to 5 boss frames, top centre, stacked (a council fight shows all members). Each frame is 420 px:

```
+--------------------------------------------------------------+
| THE BARROWKING   Phase 2 of 3   [===========  62%  ========] |
| |---P2 at 70%---|---P3 at 35%---|   (phase ticks on the bar)  |
| Casting: Grave Tide   2.1s  [gold edge: interruptible]       |
| Enrage in 4:12                       Adds: 3                  |
+--------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Name + title | boss name (`b_<snake>` display name), rank art | click targets | — |
| Health bar | % with one decimal ("62.4%"), no raw numbers above 1M | — | exact numbers |
| Phase ticks | a thin mark at each phase threshold (page 12/13 per boss) | — | "Phase {n} starts at {p}%" |
| Phase label | "Phase 2 of 3" | — | phase summary from the journal |
| Cast bar | name + remaining; grey = cannot interrupt; **gold border = interruptible**; red fill for a cast that kills if not answered ("Wipe" tag); shows target name for targeted casts ("→ Pell") | — | the ability's journal text with its telegraph icon |
| Enrage timer | "Enrage in m:ss", red under 30 s | — | "At 0:00 the boss deals {n}% more damage" (page 11) |
| Add counter | "Adds: 3" when the fight spawns adds | — | — |
| Shield bar | a white bar over health when the boss is shielded | — | — |
| Break bar | under the health bar: fills as the group lands control effects (stun, knockdown, root, disarm — bosses ignore them, canon 00 §10); full = the boss is broken ("BREAK") | — | page 11 §12 |
| Next line (Oracle only) | from Oracle Calling II: under the cast bar in grey italic, "Next: {ability} — {n} s" counting down; "Next: unclear" when the server has not decided; talents can show the next two or three (`classes/oracle.md` §2) | — | — |
| Dialog marker | a speech icon when a dialog opportunity is open (§5.6) | — | — |

The boss frame is also drawn **on top of open windows** (§2.2). Page 11 §7 owns the parts' exact looks
(cast-bar states, threat %, add tracker); where it differs from this table, page 11 wins.

### 4.8 `hud_castbar` — your cast bar

Centred above the action bar, 320×18 px. Shows spell name, time left ("1.4s"), a fill; channels fill
backwards; a charge spell shows Farhold's charge meter states (`short`, `ready`, `near` >80%, `full`
≥99%) as colours grey/white/amber/gold. Pushback flashes the bar red. Interrupted: "Interrupted" in red
for 0.8 s. Latency shading: the last {ping} ms of the bar is tinted, so you know when you can start the
next cast (page 04 option, default **on**).

### 4.9 `hud_actionbar` — action bar, gauge and form bar

```
          [ MECHANIC GAUGE (per class) ]
          [ FORM BAR: Bear | Cat | Owl | Stag ]         (only classes with forms/stances)
 [LMB][1 ][2 ][3 ][4 ][5 ][6 ]  [Q class][G class 2]  [F dodge][R potion][7][8][9][0][E use][H mount][L light]
  basic Lv1 Lv4 Lv10 Lv18 Lv28 Lv40   Lv6      Lv6         Lv5    Lv1    belt Lv3/16  Lv1   Lv10   Lv1
```

**Spell slot** (reuse+: farhold `skill-slot`):

| Part | Shows |
|---|---|
| Icon | the spell icon (§14.5 style) |
| Key label | top-left corner, from the binding table ("1", "Shift+2", "M4") |
| Cooldown sweep | a clockwise dark sweep + whole seconds left in the middle ("12", "1.4" under 3 s) |
| Global cooldown | a thinner, lighter sweep on every slot for the GCD (page 05) |
| Cost | bottom-right, the resource cost ("30"); red when you cannot pay |
| Charges | bottom-left "2" for spells with charges |
| Range | icon tinted red when the target is out of range |
| Proc glow | gold animated border when a proc makes the spell free/empowered |
| Locked slot | padlock + "Lv 18"; tooltip "Opens at level 18." (reuse: farhold `locked`) |
| New slot | green pulse + "NEW" for 30 s after the spell arrives (see §5.3) |
| Usable states | classes as Farhold: `ready`, `cooling`, `poor` (cannot pay), `blocked` (silenced, stunned, wrong form), `locked` |

The six slots are **fixed** to the class's six spells in ladder order (canon: slots open at 1, 4, 10, 18,
28, 40). The player cannot drag spells off the bar (one spell per slot, nothing else fits), but can
**swap the order** by dragging icon onto icon on the Spellbook tab. Keys stay 1–6 by default.

**Class keys:** `Q` (class key) and `G` (second class key, only classes that use one; greyed otherwise),
both from level 6 (Calling I). Each shows the class file's icon for what the key does now.

**Shared keys (not spells):** basic attack (LMB, always), dodge roll (`F`, level 5, quest
`q_hv_fall_and_rise`), potion (`R`, Quick Heal, with a count "4"), potion belt (`7` `8` at level 3,
`9` `0` at level 16 — page 07), interact (`E`), mount (`H`, level 10, quest `q_hc_saddle_and_bridle`),
light (`L`). Each is a smaller 40 px slot with the same cooldown sweep. All keys from page 02.

**Mechanic gauge** (`hud_gauge`, unlock 6): a 360×28 px widget above the bar, different per class. Page
06 and `classes/<id>.md` own each gauge's art and numbers; this page fixes the **frame** every gauge fits
in: label left, value right, up to 10 pips or one continuous bar, a threshold tick, a glow when the
mechanic is ready to spend. Examples of shape per class type:

| Gauge type | Used by (examples) | Look |
|---|---|---|
| Pips (0–N) | Rogue combo points, Warlock soul shards, Monk chi, Warrior block charges | row of N diamonds, filled gold |
| Continuous bar with zones | Pyromancer Heat, Priest Light/Shadow balance | bar with coloured end zones; Priest's is a centred slider |
| Stack counter | Mage Arcane Charge, Swashbuckler Flair, Stormcaller Static | number + small ring |
| Slots | Shaman 4 totem slots, Tinker gadgets, Runesmith runes | 4 small icons with timers |
| Pet/companion bar | Ranger cat, Necromancer thralls, Enchanter charmed unit | mini frame with health + a command wheel hint |
| Ghost/timeline | Chronomancer 5 s recording | a scrubber bar |

**Form bar** (`hud_formbar`): only for classes whose bar swaps (Druid forms, Fighter stances, Dragon
Knight aspects, Paladin oaths, Demon Hunter Demon Form). 4 buttons max (canon: at most 4 forms or stances
per class), keys `Shift+1`–`Shift+4` (page 02 `form1`–`form4`). Swapping form replaces the six spell
icons with the form's alternate spells with a 0.25 s flip animation; the gauge swaps to the form's
resource. The Enchanter uses the same keys for its borrowed bar (§4.9.2).

#### 4.9.1 Class gauges (one per class, inside `hud_gauge`)

Each class file owns its gauge's art and numbers; this table lists the ids so the builder has one place
to look. A class file that names no id of its own uses `hud_class_gauge`, the generic frame above. When
each gauge appears (level 1 or Calling I at 6) is the class file's call.

| Id | Class | What it shows | Owner |
|---|---|---|---|
| `hud_bulwark` | Warrior | shield pips left of the Fury bar (2 → 5); a pip cracks when spent; 20 s lifetime line; red-iron border and "×4" enemy count while Unbreakable; Last Rampart clock | [classes/warrior.md](classes/warrior.md) §2.3 |
| `hud_stance_dial` | Fighter | triangle dial, one corner per stance (Offense, Defense, Precision) on `Shift+1`–`Shift+3`; 1.5 s swap ring; Stance Dance fade; Threefold Form white ring; a rider-coloured corner tab on each spell icon | [classes/fighter.md](classes/fighter.md) §2.3 |
| `hud_oath` | Paladin | round seal left of the mana bar with the oath's symbol; Sanctity ring filling to 100 ("Fulfilled"); red crack and "−50" on a broken vow; two half-seals for Twin Oath | [classes/paladin.md](classes/paladin.md) §2.4 |
| `hud_quarry` | Ranger | ten Hunt arrowhead pips right of the Focus bar (fifteen after Apex Bond; two tinted rows after calling 20); the Quarry's stack number on its nameplate | [classes/ranger.md](classes/ranger.md) §2.4 |
| `hud_pet` | Ranger (and any class with a combat companion) | companion frame under the player frame: portrait, health, current command icon (paw / shield / eye), respawn clock when dead | [classes/ranger.md](classes/ranger.md) §2.4 |
| `hud_combo` | Rogue | five coin pips (seven after calling 40) above the Focus bar; 12 s timer line; stealth vignette and a notice eye (closed / half / open); Slip Away cooldown icon | [classes/rogue.md](classes/rogue.md) §2.4 |
| `hud_devotion` | Cleric | chalice left of the mana bar filling 0–100, marks at 30/50/100; rim glow at 50 (Raise), overflow at 100 (Mass Resurrection); gold ward bars and "can raise" feathers on party frames | [classes/cleric.md](classes/cleric.md) §2.5 |
| `hud_class_gauge` | every other class (e.g. Chronomancer hourglass, Witch Hunter silver bullets, Knight banner, Monk Chi orbs, Tinker workbench strip + scrap nuts) | the generic frame: label left, value right, up to 10 pips or one bar, threshold tick, ready glow | the class file's "Gauge" section ([06-CLASSES.md](06-CLASSES.md)) |

#### 4.9.2 `scr_hud_borrowed_bar` — the Enchanter's charmed-enemy bar

(new; [classes/enchanter.md](classes/enchanter.md) §2.3) **Opens:** automatically when the Enchanter
charms an enemy; slides up above the spell bar and closes when the charm ends. **Keys:** `Shift+1`–`Shift+4`
(canon 00 §10: Shift+1–4 is the form/stance/**borrowed** bar), so `1`–`6` keep casting.

| Part | Shows |
|---|---|
| Portrait | the charmed creature's face in a violet frame, a **Will ring** draining clockwise with the number in the middle; flashes red at 25 Will |
| `Shift+1` `Shift+2` `Shift+3` | the first three abilities of its page-10 kit, with their own cooldowns; they cost you nothing; blank if it has fewer |
| `Shift+4` | stance toggle: **Attack my target** (default) / **Guard me** |
| Hold here | a button (click) — the creature walks to the reticle point and stays |
| Health bar | under the portrait |

The class file proposed `Alt+1`–`Alt+5`; those keys are the boss-dialog replies (canon), so the bar uses
`Shift+1`–`Shift+4` and **Hold here** has no key yet (listed in the report as unresolved).

### 4.10 `hud_xp` — XP bar

Full width under the action bar, 8 px (reuse: farhold `.bar.xp`, gold fill `#d8b040→#8a6a10`).
Rested XP shows as a purple ghost ahead of the fill (`--rw-xp #b080ff`). Hover: "12 480 / 18 000 XP to
level 24 · rested 3 200". At level 60 the bar becomes the **Renown** bar (page 07) in teal. Ticks every
10%. Level-up flashes the bar white.

### 4.11 `hud_auras` — buff and debuff rules

- Icons 24 px (buffs) / 28 px (debuffs) on the player frame; 20 px on party frames.
- Time left under the icon: "3m" over 60 s, "45" under 60 s, "4.2" under 5 s. Blinks under 3 s.
- Stacks as a number bottom-right.
- Sorting: debuffs you can dispel first, then by time left.
- Big important debuffs from bosses (page 11 flags them `important: true`) also show **large** (48 px)
  centre-left under the boss banner with their name, e.g. "Marked for the Tide — 6.0".
- Status colours reuse Farhold's `STATUS_COLOR` table (burn #ff9a5c, poison #9ede6a, bleed #ff6a6a,
  chill #8fd6ff, shock #ffe86a, curse #c090ff, weaken #a08ab0, might #ffd27a, guard #dfe9ff, haste
  #8fd0ff, regen #9ff0c0, rally #ffd0a0); page 05 owns the full status list.

### 4.12 `hud_minimap` — minimap with every icon

200×200 px round-cornered square (Farhold used 180 square), **north-up by default**, with an option
to rotate with the camera (page 04 `set.interface.minimap_rotate`, **off**). Farhold's zoom: span
default 26 cells equivalent → Wildmarch default **240 m across**, `+`/`-` step ×0.72/×1.4, range
80–1200 m. Buttons on its rim: zoom in, zoom out, **Tracking filter** (funnel), **Calendar/events**,
**Mail** (flashes when mail waits), **Group finder eye** (spins while queued).

Under it: `hud_place`: "Mossfen · Reedhollow" (region · sub-area), level band coloured by tone, clock
"12:40" (in-game) with a sun/moon icon, weather word. Coordinates only when Settings → Show coordinates.

**Every icon** (Farhold's glyph set extended; shapes stay readable at 12 px):

| Icon | Glyph / colour | Means | Range shown |
|---|---|---|---|
| Player | white arrow | you, pointing where you face | always |
| Party member | blue dot #5aa0ff, class-colour ring | party member | always (edge arrow if outside) |
| Raid member | smaller blue dot | raid member | 200 m |
| Friendly player | small green dot #50c060 | other players | 100 m |
| Hostile player | red dot with a ring | flagged enemy player (PvP) | 60 m |
| Enemy | red pip #ff4a2a, r3.6 | normal enemy | 70 m |
| Elite / champion | blue pip #6ab0ff, r4.6 | page 10 ranks | 90 m |
| Rare | pink star #ff8adf | rare elite | 150 m |
| Boss / world boss | gold skull #ffd24a / red burst #ff3a3a | boss | world boss: always within its region |
| Quest available | gold `!` #ffd24a | an NPC offering a quest | 70 m (Farhold `MINIMAP_NEAR`) |
| Quest low-level | grey `!` | quest 6+ levels under you (hidden by default) | 70 m |
| Quest turn-in | gold `?` | ready to hand in | 70 m |
| Quest in progress | grey `?` | NPC for an unfinished quest | 70 m |
| Quest area | gold dashed circle | where a tracked objective is | always (rim arrow) |
| Calling quest | orange `!` with a ring #ff9f4a | class calling quest (6/20/40) | always within region |
| Unlock quest | cyan `!` #7fd8ff | a quest that unlocks a feature | always within region |
| Vendor | `$` #8fe0a0 | merchant | 70 m |
| Trainer / Unbinder | book glyph #c0a0ff | class trainer / Unbinder | 70 m |
| Bank | chest glyph #ffd070 | banker | 70 m |
| Mailbox | envelope #e0e0e0 | mail | 70 m |
| Trading post | scales #ffd070 | player market | 70 m |
| Crafting bench | anvil #c8bca0 | bench | 70 m |
| Inn | bed #ffb060 | rest, set hearth | 70 m |
| Stable | horseshoe #c2a98a | mounts | 70 m |
| Flight/waystone | sigil disc #7fe8ff (lit) / #5a6a78 (unlit) | fast travel point | always |
| Dungeon entrance | arched gate #c090ff | 5-player dungeon | always |
| Raid entrance | gate with crown #ff6a3a | raid | always |
| Dynamic event | hourglass ⌛ #ffb060 + timer ring | event running | 400 m |
| Gathering node | ◆ in the material colour | ore/herb/wood (tracking filter) | 70 m |
| Chest | small gold pip #ffd24a | unopened chest | 40 m |
| Corpse (you) | ghost/skull #cfd8e3 | your body, after releasing | always |
| Group ping | expanding ring in the pinger's colour, 3 s | a ping (middle mouse, page 02 `ping`) or a map pin shared with the group (map right-click → Share with party) | always |
| Pin | ◈ #7fd4ff | your own pin | always (rim arrow) |
| Favourite | gold ring on any icon | starred | — |
| Tracked marker off-map | rim triangle + distance ("420 m") | off the minimap | — (reuse: farhold rim arrows) |
| North | "N" | top edge | — |

**Tracking filter dropdown** (checkbox list): Quest givers **on**, Low-level quests off, Vendors **on**,
Trainers **on**, Banks & mail **on**, Crafting **on**, Gathering nodes off, Chests **on**, Other players
**on**, Enemies **on**, Events **on**.

**Inside a dungeon:** the minimap shows the room plan (Farhold `drawDungeonMap`), boss rooms as skulls,
cleared bosses as grey skulls; the place line reads "{dungeon} · {difficulty} · {n}/{m} bosses".

### 4.13 `hud_quest_tracker` — quest tracker (was `hud_tracker`)

Right side under the minimap. Up to 8 tracked quests (page 04 `set.interface.tracker_max`, **5**).

```
MAIN STORY
 The Barrow Wakes          (Lv 6)   ⌖
   [x] Speak to Warden Hale
   [ ] Cleanse the barrow stones 2/4
CALLING  (Warrior, level 6)
 The Unbroken Line         ⌖
   [ ] Hold the bridge 0:42
SIDE
 Rats in the Granary       ⌖   ✓ ready to hand in
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Group heading | MAIN STORY, CALLING, UNLOCK, SIDE, DAILY, WEEKLY, EVENT | click collapses | — |
| Quest title | coloured by level tone; ✓ gold when ready to hand in | click opens it in the Journal; right-click: Untrack, Share with party, Abandon | — |
| Objectives | checkbox + text + count "2/4" or timer "0:42" (red under 10 s) | — | — |
| Locate ⌖ | — | click opens the map centred on the objective with the pulse rings (reuse: farhold `locate()`) | "Show on the map" |
| Distance | "310 m" on the top tracked quest | — | — |
| Super-tracked | one quest can be super-tracked (click the ⌖ twice): its objective gets the world waylight and an edge arrow (reuse: farhold `waylight.js`) | — | — |

**Empty:** "No quests tracked. Open the journal (J) and tick one." — shown once, then the panel hides.

**`hud_event_tracker`** (new; page 14 §13.1): a block **above** the quest tracker while a dynamic event
(`ev_<snake>`) runs near you, from its 60 s pre-warning to its end: event name, current phase, the phase
goal as a bar or count ("Carts safe 3/5", "Hold 1:12"), time left, and your contribution tier (page 14
§13.2). Click opens the map on the event; it hides 10 s after the Success/Failure banner.

### 4.14 `hud_chat` — chat box

Bottom-left, 440×220 px, resizable 300–800 × 120–500 px, background 55% opacity that rises to 85% on
hover (fades back after 6 s). Farhold's `#log` becomes the **System** tab's content; chat is new.

| Element | Shows | Interactions |
|---|---|---|
| Tabs | **General** (Say, Yell, Zone, Trade, LookingForGroup, System), **Party** (Party, Raid, Raid warning, Instance), **Guild** (Guild, Officer), **Whispers**, **Combat** (§11.2), **Loot** (loot, money, XP, reputation) | click switches; unread count badge; right-click a tab: Rename, Channels…, Colours…, Font size, Close; **+** adds a tab |
| Lines | "[12:40] [Zone] Borin: lfg barrow" — timestamp optional (page 04), channel tag, name in class colour (click = whisper, right-click = menu), text; item links shown in rarity colour with [brackets], hovering opens the item card; quest/spell/achievement links likewise | Shift+click an item in your bag pastes a link |
| Input | "Say:" prefix with the current channel; `Enter` opens it, `/` opens it with a slash | `Tab` completes a slash command, channel or player name (page 02 §5.11); ↑ recalls sent lines |
| Scroll | wheel scrolls; a "↓ new messages" button when scrolled up | — |

Channels and colours:

| Channel | Slash | Colour | Range |
|---|---|---|---|
| Say | `/s` | #ffffff | 40 m, also shows a speech bubble over the head |
| Yell | `/y` | #ff5040 | 300 m |
| Emote | `/me` | #ff8040 | 40 m |
| Whisper | `/w name` (reply: `/r`, or the `'` key) | #ff80ff | player |
| Party | `/p` | #8ab4ff | party |
| Raid | `/ra` | #ff8000 | raid |
| Raid warning | `/rw` (leader/assist) | #ff4800, also shown centre-screen | raid |
| Instance | `/i` | #ff9f40 | group-finder group |
| Guild | `/g` | #40ff40 | guild |
| Officer | `/o` | #40c040 | guild officers |
| Zone | `/z` | #ffc0a0 | the region |
| Trade | `/trade` | #ffc0a0 | towns |
| LookingForGroup | `/lfg` | #ffc0a0 | everywhere |
| System | — | #ffd24a | you (Farhold log kinds keep their colours: good #8fe0a0, bad #ff9a8a, loot #ffd070, level #7fd8ff) |
| NPC speech | — | #ffffa0, boss lines #ff6a3a bold | 40 m (bosses: instance) |

Moderation: right-click a name → Ignore, Report (→ `scr_report`), and page 15's filters (profanity
filter **on**).

### 4.15 `hud_fct` — floating combat text

(reuse+: farhold `hitnum`: 17 px bold #f0f4fa, crit 23 px #ffd24a, miss 14 px #9fb0c8, taken #ff8a7a,
drift ±26 px, 0.9 s rise, max 40 on screen)

| Kind | Look | Where |
|---|---|---|
| Your damage | white; element tint for spells (fire #ff9a5a, ice #9fd8ff, lightning #ffe86a, poison #9ede6a, shadow #c090ff, holy #ffe6a0, arcane #b8a0ff) | over the target |
| Your crit | 23 px gold + "!" and a 1.15× pop | over the target |
| DoT ticks | 14 px, element colour, stacked every 0.5 s into one number when ticks overlap | over the target |
| Heal done | green #8fe0a0 "+320" | over the healed ally |
| Overheal | grey "(120)" after the heal, option **off** | — |
| Damage taken | red #ff8a7a "−420" | over you, left side |
| Absorbed | "Absorb 180" pale blue | over you |
| Blocked / dodged / parried / immune | word in grey | over you or the target |
| Resource gains | "+15 Fury" small | over you, right side |
| XP / reputation / gold | "+124 XP", "+25 Vale Wardens" (off by default, shown in chat) | — |
| Pet/follower damage | 80% size, their own colour | over the target |

Merge rule: hits under 10 ms apart on the same target merge ("1 240 ×4"). Options (page 04): on/off per
kind, size 70–150%, **off for other players' damage**.

### 4.16 `hud_nameplates` — nameplates

Over every unit's head, 120×14 px (enemies), scaled by distance 60–100%, hidden past 45 m (page 04).

| Unit | Plate |
|---|---|
| Enemy | name (rank colour), level, health bar in reaction colour, cast bar under (gold border if interruptible), your debuffs over it (max 6), a raid marker icon if set, a threat tint border in groups (tank: red border when it is NOT on you; others: red when it IS on you) |
| Friendly NPC | name + role in <angle quotes> e.g. "Warden Hale <Vale Wardens>", quest `!`/`?` above; no bar unless damaged |
| Player | name in class colour, guild <name>, title; health bar only in combat or when damaged; party members always show a bar |
| Your target | plate 115%, gold outline, always on top |
| Follower / companion | owner's name small under: "Rook — Wren's cat" |

Stacking: plates never overlap (vertical nudge), except in raids where **Overlap** is the default for
enemies (page 04).

### 4.17 `scr_telegraph_layer` — the ground warnings

Drawn in the 3D scene on the ground (decals on the terrain mesh, `depthTest` on, rendered after the
ground and before characters). **Page 11 owns what each telegraph means and its timings**; this page
fixes how they are drawn so everyone draws them the same way.

| Kind | Fill | Edge | Motion | Extra |
|---|---|---|---|---|
| Danger zone | RED #e0302a, 35% → 60% as it fills | solid 3 px #ff5040 | fill grows from the edge in; when the fill reaches the centre it hits | a thin white ring marks where the fill will be in 0.5 s |
| Void zone | PURPLE-BLACK #2a0a3a at 70%, swirl texture | ragged #a050e0 | swirls 0.3 turns/s; grows if the mechanic grows | tick flash every 0.5 s |
| Soak | ORANGE #ff9020, 30% | 3 px #ffb040 | pulses at 1 Hz | N pips around the rim; a pip fills gold per player inside; turns green when enough |
| Safe zone | BLUE #3a8aff, 20% | 4 px #7fc0ff double ring | still | a countdown number in the middle |
| Targeted | YELLOW #ffd24a, 25% | 3 px #ffe680 | follows the player | the player's name printed on the ring; a big yellow arrow over their head; on YOUR ring the screen edge flashes yellow |
| Beneficial | GREEN #40d060, 25% | 2 px #8fe0a0 | slow shimmer | + icon in the middle |
| Tether | WHITE line 6 px #ffffff | — | crackles | turns red when the distance is wrong (page 11 per mechanic) |

**Shapes:** circle, donut (safe hole drawn clear with a blue inner edge), cone (arc with its angle),
line/beam (rectangle with arrowheads showing direction), cross, moving wave (a band with chevrons),
checkerboard (alternate tiles, the dangerous ones red), room-wide (the whole floor tinted + screen edge
glow in that colour).

**Countdown:** every telegraph with ≥1.5 s warning shows a thin **timer ring** on its edge that drains
clockwise, so players can read time left without numbers. Page 11's minimums apply (1.5 s Normal,
1.2 s Heroic/Mythic, 3.0 s for anything that one-shots).

**Colour-blind modes** (page 04): patterns added — Danger = diagonal hatch, Void = spiral, Soak = dots,
Safe = concentric rings, Targeted = chevrons, Beneficial = plus signs.

**Performance:** max 64 telegraph decals at once; beyond that the oldest non-lethal ones drop their fill
and keep their edge (page 17 budget).

### 4.18 Other small HUD pieces

| Element | Shows | Notes | Source |
|---|---|---|---|
| `hud_zone_banner` | Region name (Cinzel 42 px), "Level 5–12" in the tone colour, danger word ("a fair fight", "dangerous for you", "you should not be here yet"), holder ("the Fenfolk"). 5.2 s, slides down | also the town arrival card: "Reedhollow — town — held by the Fenfolk — inn, smith, bank" | (reuse: farhold `announceZone`, `announceTown`, `TONE_WORDS`) |
| `hud_prompt` | "[E] Talk to Warden Hale", "[E] Open the chest", "[E] Enter The Hollow Barrow (Normal, 5–7)" | bottom centre above the cast bar | (reuse) |
| `hud_workbar` | gather/channel progress bar over the node: "Mining Iron Vein 62%" | — | (reuse: farhold `workBar`) |
| `hud_edge_arrows` | up to 5 rim arrows for off-screen tracked things: name + distance, in the thing's colour | party members in combat also get one when off screen | (reuse: farhold `edgeArrows`) |
| `hud_toasts` | bottom-right stack, max 5, each 4 s: "Received: [Barrow-Iron Helm]" (rarity colour + gem), "+48 silver", "Reputation with the Vale Wardens +25 (Liked 1 240/3 000)", "Achievement: First Blood" | click an item toast opens the bag on that item; Epic+ toasts stay 8 s and play the rarity sting | (new) |
| `hud_durability` | a small paper-doll silhouette, hidden until any piece is ≤25% (yellow) or 0% (red, "Broken: no stats") | click opens the Gear tab | (new; page 08 owns durability) |
| `hud_net` | "34 ms · 60 fps" bottom-right; ms colour ≤80 green, ≤150 amber, >150 red; a plug icon + "Reconnecting…" on disconnect | hover: "Home realm {name}, {ms} ms. Frame {ms} ms." | (new) |
| `hud_notice` | centre-bottom red/amber refusal line: "Not enough Focus.", "Out of range.", "You must face your target." (throttled: the same line once per 1.5 s) | also logs to System | (reuse: farhold `notice()`) |
| `hud_crosshair` | a 4-dot crosshair; turns red over a hostile, green over a friendly, gold over an interactable | option to hide (page 04) | (reuse) |
| `hud_micromenu` | a row of 10 small buttons bottom-right: Character (`C`), Bags (`I`), Spellbook and talents (`K`), Perks (`N`), Journal (`J`), Dungeon journal (`Shift+J`), Unlocks (`U`), Map (`M`), Social (`P`), Game menu (`Esc`) — each with its key read from the live binding and a badge for unspent points / new mail / invites | the only mouse path to every window | (new) |
| `hud_pull_timer` | centre-screen countdown started by a leader or assist (`/pull 10`, or the Leader tools button): big numbers, a tick sound on the last 5, "Pull!" at 0; the same button cancels | 5–15 s in the tool (default 10; `/pull` accepts up to 30, page 02) | (new; page 13 §2.5) |
| `hud_break_timer` | a small corner countdown for a raid break (5 / 10 / 15 min) set by the raid leader | top-right under the minimap | (new; page 13 §2.5) |
| `hud_legendary_banner` | centre-screen, the whole group: "{name} looted **{Legendary name}**" in violet `#c86bff` with the item icon, sound `loot_legendary` (page 08 §8.2, page 17); only the first time a character loots each legendary | hover the name = item card; `pointer-events` only on the name | (new) |

---
## 5. Popups, cards and overlays in the world

### 5.1 `hud_warning_banner` — centre-screen boss warning banner (was `scr_boss_banner`)

(reuse+: farhold `#zone-banner` box and timing) Top-centre under the boss frames, 900 px wide,
`pointer-events: none`.

```
            ───────────  THE BARROWKING  ───────────
                 "The tide answers me!"
          ⚠  Tidal wave from the north in 3 s — get behind a pillar
```

| Line | Shows | Rules |
|---|---|---|
| Speaker | boss name, Cinzel 22 px, ember colour | — |
| Quote | the spoken line (also voiced + bubble over the boss) in italics, Spectral 26 px | page 11: a line often IS the warning |
| Warning line | optional plain instruction with the telegraph's colour icon: red ⚠ danger, purple void, orange soak, blue safe, yellow targeted | only for the boss's first 3 pulls on Normal ("Beginner warnings", page 04 `set.combat.boss_hints`, **on** for Normal, off for Heroic/Mythic) |
| Countdown | a shrinking underline matching the mechanic's warning time | — |

Timing: slides in 0.2 s, stays for the mechanic's warning time + 1 s (min 3 s), fades 0.4 s. Max 2
banners stacked; a newer one pushes the older up. Raid warnings (`/rw`) use the same banner without
the speaker line, in orange. A sound plays per telegraph colour (§14.6). Page 11 §8 owns the banner
**kinds** (`personal`, `lethal`, `mechanic`, `boss_say`, `phase`, `enrage`, `dialog`, `brace`), their
durations and the stacking priority; this section is the look they share.

### 5.2 `scr_levelup` — level-up card

(reuse+: `shared/rewards.js` with `level` extras) Farhold wrote "Level {n}! … press I." to the log.
Wildmarch shows a card that does not steal input: bottom-centre, 520×220, 6 s, click to dismiss, and
never during a boss fight (queued until combat ends; the log line still appears).

```
                 LEVEL 12
   +4 health per Constitution · 1 perk point
   NEW: Talent tier 1 for all your spells     [Open talents]
   Next: level 18 opens your 4th spell
```

| Element | Shows |
|---|---|
| Title | "LEVEL {n}" Cinzel, gold, rays behind (`assets/data/ui/rays.svg`) |
| Gains line | stat increases at this level (page 07), "1 perk point" |
| New line(s) | every unlock at this level, each with a button to the right screen |
| Next line | the next unlock on the ladder and its level |

Sound: `levelup`. XP bar flashes. Party members see a small "Wren reached level 12" toast.

### 5.3 `scr_unlock_card` — unlock card

(reuse+: `shared/rewards.js` card look; canon rule 5: every unlock is announced with a card, a sound and
an Unlocks-screen entry) Centre, 560×360, dims the screen 40%, **pauses nothing**, closes on the button
or Esc. Queued out of combat (like the level-up card). Every entry in page 07's feature ladder has one.

```
+--------------------------------------------------+
|              ✦ UNLOCKED ✦                        |
|             [ large icon ]                       |
|               DODGE ROLL                         |
|  Press F to roll 4 m. For 0.3 s of the roll,     |
|  nothing can hurt you. Costs 30 stamina.         |
|  (numbers: page 05 §3.3 and page 07)             |
|  [Show me] (plays a 3 s demo clip)   [Got it]    |
|  From: level 5 quest · also on Unlocks (U)       |
+--------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Kind ribbon | UNLOCKED (feature), NEW SPELL (spell slot), CALLING (mechanic upgrade), TALENT TIER, NEW TITLE, NEW MOUNT | — |
| Icon | the feature icon (§14.5) | — |
| Name | feature name | — |
| What it does | 1–3 lines, numbers, and **the key** from the player's own binding table | — |
| Show me | plays the demo clip (a looping in-engine recording, page 17) or opens the related screen | — |
| Got it | closes; the Unlocks screen entry stops glowing | — |
| Source | "From: level 5" or "From: *The Unbroken Line*" | — |

A **new spell** card also shows the full spell card (§7.3) and "It is on key 4." The spell arrives on
the bar automatically; there is no chooser (six bespoke spells per class, one per slot), so Farhold's
"Spell available" pick step is replaced by this card. `scr_spell_chooser` is kept only as the id of this
card's "New spell" variant.

### 5.4 `scr_loot_popup` — chest and quest reward popup

(reuse: `shared/rewards.js` `showRewards(spec)`) Exactly as in Farhold: ribbon title, subtitle, chest
that lands (550 ms), shakes (520 ms), opens (350 ms), gold/XP/fame counters count up over 600 ms, item
cards (rarity border, gem, tag, name, slot, up to 3 lines; hover = the full `item` tooltip, fixed in
Farhold round 22 by writing `data-tip-item`), extras list, **Continue** button; first click reveals
everything, second closes. Choose mode (`spec.choose`) gives **pick one of three** with "Take {name}".

Changes for Wildmarch:
- Used for **chests you open alone**, **quest rewards** and **boss chests in solo content**. Kill loot
  in a group uses `scr_loot_panel` instead.
- Quest reward kinds keep Farhold's five (`coin`, `crate`, `materials`, `choice`, `pick3` from
  `js/questrewards.js`), with `choice` titled "Name your price" (The coin / Something from the store /
  A load of stock) and `pick3` titled "Take one". Class quests may offer a pick of 3 **class items**.
- Never opens during a boss fight; queued with a chest icon on the micro-menu.

### 5.5 `scr_loot_panel` — personal loot panel (was `scr_loot_roll`)

(new) Canon (00 §4, page 08 §11): **personal loot everywhere** — the server rolls each eligible player's
loot separately, so there is no Need/Greed roll in normal play. This panel opens when a kill gives **you**
an item. Right side, stacked, max 4 visible (+"{n} more"), each 380×96:

```
+------------------------------------------------------------+
| [icon] [Barrow-Iron Helm]  Rare  Head · Heavy        1:59  |
|        ▲ +42 over your Worn Cap                             |
| [ Keep ]  [ Offer to group ]   Loot focus: [Tank v]  [?]    |
+------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Item | icon, name (rarity colour), rarity word, slot, armour type | hover = item card with compare | — |
| Upgrade hint | "▲ +42 over your {worn}" / "▼ worse than your {worn}" (reuse: farhold `itemScore`) | — | — |
| Trade timer | the 2-hour window (canon) in which you may trade it to anyone who was eligible for the same kill: "1:59" (h:mm) | — | "You can give this to anyone who was eligible for this kill for 2 hours." |
| Keep | closes the card; the item is already in your bags | — | — |
| Offer to group | posts the item link in party/raid chat with "Anyone need this?" | — | — |
| Loot focus dropdown | **your current role**, Tank, Healer, Damage, Support — what the server weights your next rolls toward (page 08 §11.1) | changes future rolls, not this one | "Your loot is rolled for your class and this focus." |
| Bonus roll | after a dungeon or raid boss: "Roll again: 40 Delver's Marks" / "Roll again: 60 Oathstones" (page 08 §11.3; 2 a week) | click, within 30 s of the kill | — |
| [?] | help | shows the rules card below | — |

**Rules card (shown on [?] and on the first item of a character's life):**
- Loot is rolled for you alone, for your class and your loot focus. Other players do not see your roll
  except as a line in the loot log.
- You may trade an item for 2 hours to anyone who was eligible for the same kill (canon 00 §4).
- Gold from a kill is split evenly among eligible group members (page 08 §11.1).
- Premade raids may use **Loot master** instead (`scr_loot_master`, below). The leader sets the rule in
  `scr_party`.

Result line in the Loot chat tab: "Borin received [Barrow-Iron Helm]." **Empty:** a kill that gives you
nothing shows no card; the loot log says "No item for you this time." and, where bad-luck protection
applies, "+5% item chance on the next boss" (page 08 §11.1).

### 5.5.1 `scr_loot_master` — loot master hand-out window

(new; page 13 §2.10) **Opens:** for the loot master only, when a boss dies in a premade raid whose loot
rule is **Loot master**; the boss's fixed number of items (page 13 §2.10.1) sit in a shared chest.
Centre-right, 520 px wide.

| Element | Shows | Interactions |
|---|---|---|
| Item list | each item in the chest: icon, name, slot, armour type | click selects |
| Eligible players | for the selected item: name, class, role, the item they wear in that slot and its item level, a ▲/▼ mark | click a name → **Give** (confirm) |
| Optional roll | **Ask for rolls**: every eligible player gets the old roll card for 60 s — [ Need ] [ Greed ] [ Pass ], Need beats Greed, highest 1–100 inside the best choice wins; results listed here | the loot master still clicks **Give** |
| Threshold | the raid's loot-master quality threshold (Rare / Epic / Unique+), set in Leader tools (page 13 §2.5) | — |

Esc does not close it (§2.2); it closes when the chest is empty.

### 5.6 `hud_dialog_choice` — boss dialog choice panel (was `scr_boss_dialog`)

(new; page 11 owns which bosses offer one and what each answer does) When a boss opens a **dialog
opportunity** the boss pauses (page 11 §10.2, the "parley state"), and each player sees a teal panel
above the action bar (page 11 §10.1). Page 13 calls it `scr_dialog_choice` / "the reply wheel".
**Keys: `Alt+1`–`Alt+4`** (canon 00 §10), so `1`–`6` keep casting; also click, or gamepad D-pad + A.

```
+-----------------------------------------------------------------+
|  THE DROWNED MAGISTRATE                                   0:08  |
|  "Name the debt you owe the sea, or pay it in breath."          |
|  Alt+1 [Parley]  "We owe nothing. Let us pass."      ● 2 votes  |
|  Alt+2 [Bargain] Offer 500 gold.                     ● 1 vote   |
|  Alt+3 [Taunt]   "The sea can come and collect."     ● 0 votes  |
|  Alt+4 [Riddle]  "A promise."  (only the Oracle can see this)   |
|  3 of 5 votes closes it early. Your pick: Alt+1                 |
+-----------------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Boss + timer | name, voice line (spoken), countdown (page 11: 10 s default, 8–15 s; pulses in the last 3 s) | — |
| Options | 2–4 answers, each with a tag (page 11 §10.1 uses tone tags — Honour, Greed, Defiance, Mercy, Cunning, Truth — and never shows the outcome; ⚔ marks a reply that restarts the fight), the words, and any cost ("500 gold", "a Moonwell Tear") | click or `Alt+1`–`Alt+4` to vote |
| Class/lore-only option | shown only to players who meet the condition (class, reputation, finished quest), marked "(only you can see this)" | — |
| Votes | live dots per option | — |
| Rule line | who chooses, per page 11 §10.3: party — majority closes it early, ties go to the leader's vote; raid — the Speaker picks, others Suggest; solo — no voting | — |

Timeout = page 11 §10.3's rule (the most-voted reply; with no votes, silence — the normal fight). The chosen answer is
spoken by the voting player's own voice. Journal records every answer found (§9).

### 5.7 `scr_death` — death screen

(new; Farhold only wrote a log line and moved you) Health at 0: the world desaturates over 1 s, the
camera rises 3 m, and this card appears centre:

```
+--------------------------------------------------------+
|                    YOU HAVE FALLEN                      |
|   Killed by Mossfen Lurker's Bog Spit (1 240 nature)    |
|   [Death recap ▸]                                       |
|                                                         |
|   [ Release to the Waystone ]   Reedhollow Waystone 420 m|
|   [ Wait for a revive ]    (Pell is a Cleric, 12 m away)|
|   Gear takes 10% durability damage when you release.    |
+--------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Killing blow | who, what ability, amount, element (from the meter's death record) | — |
| Death recap | expands to the last 10 s: a table of hits taken (time, source, ability, amount, overkill) and heals received, pulled from the meter's `taken` records (reuse: `meters/js/meter.js`) | — |
| Release | sends you to the nearest waystone/graveyard as a spirit (page 05 owns the corpse run) | click, or hold `R` 1.0 s (page 02 §5.8) |
| Wait for a revive | shown when a group member who can revive is alive; lists them with class + distance | — |
| Instance rule | in a dungeon or raid in combat: "Release is blocked while your group is fighting. [Release anyway] (you will wait outside)" | — |
| Hardcore realm | "Wren is dead for good." + [Export this character's story] + [Back to character select] | — |
| Penalty line | page 05 / 08 own the numbers (durability loss, no gold loss proposed) | — |

The card never closes on Esc. A **spirit** state after release shows a HUD strip: "Walk back to your
body (310 m) or use the Waystone Keeper to revive here with 25% durability loss." (numbers: page 05).

### 5.8 `scr_revive_offer` — revive popup

(new) When an ally casts a revive on your corpse:

```
+-----------------------------------------------+
| Pell wants to revive you (Cleric, Resurrect). |
| You will stand with 40% health and 20% mana.  |
| [ Accept ]   [ Decline ]              0:58    |
+-----------------------------------------------+
```
`E` accepts (page 02 `acceptRevive`). 60 s timer. In combat revives (page 05 "battle revive"), the popup shows the charge count left for the
group ("Battle revives left: 1"). Mass resurrection (Cleric Devotion) shows the same popup to everyone.

### 5.9 `scr_confirm` — generic confirm

One component for every destructive or costly action: title, one sentence with numbers, optional typed
confirmation, **Cancel** (default focus) and a red or gold action button. Used by: delete character,
destroy item ("Destroy [Barrow-Iron Helm]? It is gone for good."), salvage a Unique/Set/Legendary
(Farhold rule: bulk salvage never takes those), Unbind all, leave guild, disband guild (typed), leave an
instance group mid-dungeon ("You will get a 30-minute group finder lock."), buy with over 50% of your
gold, sell an Epic+.

### 5.10 `scr_invite` — invites, ready check, summons

Top-centre small cards, 30–60 s timers, one sound `ui.open`:

| Card | Text | Buttons |
|---|---|---|
| Party invite | "Borin (Warrior 23) invites you to a party." | Accept / Decline |
| Raid convert | "Your party is now a raid." | OK |
| Guild invite | "Lantern Oath (41 members) invites you to join." | Accept / Decline / View guild |
| Ready check | "Ready check from Borin." 30 s | Ready / Not ready |
| Role check | "Pick your role for the group finder." Tank / Healer / Damage (only roles your class can do) | Confirm |
| Group found | "Your group for The Drowned Mill (Normal) is ready." role icon, 5 portraits filling as each accepts, 40 s | Enter / Leave queue |
| Summon | "Mira is summoning you to The Glass Tombs." 120 s | Accept / Decline |
| Duel | "Kael challenges you to a duel." 30 s | Accept / Decline |
| Trade request | "Mira wants to trade." | Accept / Decline |

Auto-decline from people on your ignore list; privacy options (§3.3) apply.

### 5.11 `scr_report` — report a player

Reason dropdown: **Cheating or botting**, Abusive chat, Spam or gold selling, Offensive name,
Griefing, Other. Details text (max 500). "Include the last 50 chat lines from this player" checkbox
(**on**). Submit → "Report sent. Thank you. You will not see {name}'s messages for 1 hour." (auto
temp-ignore). Page 15 owns what moderators do.

---

## 6. `scr_sheet` — the character sheet shell

(reuse+: farhold `#sheet`, round-10 design) Full-screen window at z 34, 94% opaque. Grid:
`var(--rail) 1fr` columns, `var(--head) 1fr` rows. Only pane bodies scroll.

```
+-------------------------------------------------------------------------------------------+
| CHARACTER   Wren  Ranger · level 23  [xp ======----- 4 200 to 24]  [mats]  1 204g 32s  × |
+------------+------------------------------------------------------------------------------+
| 1 Gear     |                                                                              |
| 2 Bags     |                       (the tab's panes)                                      |
| 3 Spells  2|   <- gold badge = unspent (Talents is a tab inside Spells)                   |
| 4 Perks   1|                                                                              |
| 5 Unlocks ●|                                                                              |
| 6 Reputation                                                                              |
| 7 Collections                                                                             |
| 8 Achievements                                                                            |
| 9 Journal 3|                                                                              |
| 0 Renown 🔒|   (opens at 60)                                                             |
| Esc back   |                                                                              |
+------------+------------------------------------------------------------------------------+
```

**Header:** title (tab name), name + class + level (gold), XP bar with "{n} xp to level {L+1}" (or
Renown at 60), coins as gold · silver · copper (100 copper = 1 silver, 100 silver = 1 gold; `cur_gold`,
page 08 §17) with the coin icons, a **spec switch** once Dual spec is unlocked (level 30, quest
`q_hc_two_minds_one_will`; a 5 s cast out of combat, page 07), close ×. Other currencies live on the
Bags tab's Currency pane (`scr_currency`, §7.2). Farhold's material chips are dropped from the header (no
building/industry); crafting materials live in the Bags tab's Materials bag.

**Rail:** ten tabs, digits stamped from the tab order (Farhold `numberRail()`), badges (gold pill, count):

| Tab | Badge counts |
|---|---|
| Gear | pieces at 0 durability |
| Bags | new items since last open (resets on open) |
| Spells | spells learned but not yet looked at + open talent tiers without a pick |
| Perks | unspent perk points |
| Unlocks | unlocks not yet acknowledged |
| Reputation | new standing bands reached |
| Collections | new mounts/titles/looks |
| Achievements | new achievements |
| Journal | quests ready to hand in |
| Renown | unspent Renown points (level 60+) |

Keys: `1`–`0` switch tabs while the sheet is open (ignored in inputs/selects, Farhold rule). Open keys
(page 02 §5.15): `C` Gear, `I` Bags, `K` Spells (and its Talents tab), `N` Perks, `U` Unlocks, `J`
Journal. Reputation, Collections, Achievements and Renown have no key of their own (page 02 left them
unbound): open them from the rail.

---

## 7. The sheet tabs

### 7.1 `scr_sheet_gear` — paper doll and stats

(reuse+: farhold Character tab + round-10 doll grid) Three columns: doll / stats / side. The doll is
page 08 §2.2's layout: seven armour slots down the left, neck/back/rings/light/mount down the right,
weapons along the bottom.

```
+---------------------------+-------------------------------+-----------------------------+
| WORN                      | STATS            [show 6 more]| POWERS                      |
| Head      [plate] Neck    | ATTRIBUTES                    | Hunter's Mark: marks also   |
| Shoulders [     ] Back    |  STR 42  DEX 118  INT 20 CON 64| slow by 15% for 4 s (set 2) |
| Chest   (3D figure) Ring I|  OFFENCE                      | ...                         |
| Hands     [     ] Ring II |  Weapon damage  88–131        +-----------------------------+
| Waist     [     ] Light   |  Spell power    210           | SET BONUSES                 |
| Legs      [     ] Mount   |  Crit 14.2% for +50%          | Stalker's Weave 2/6 ✓ 4 ✗   |
| Feet                      |  Haste 8%                     +-----------------------------+
| Main hand [     ] Off hand|  DEFENCE ...                  | COMPANION  Rook the cat     |
| Item level 64.3           |  UTILITY ...                  | 1 400/1 400 · Assist        |
| Armour 4 210 · Legend. 1/2|                               |                             |
+---------------------------+-------------------------------+-----------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Slot plates | slot name + item name in rarity colour, 3 px rarity edge, durability pip (yellow ≤25%, red 0%) | click: unequip to bag; drag an item from the Bags tab onto it: equip; right-click: Salvage / Link in chat | item card (`slot` renderer: "Nothing worn here." when empty) |
| 3D figure | the character in the middle column of the doll, sways, drag to turn (figure3d) | — | — |
| Show helmet / Show cloak | two toggles under the figure | — | — |
| Item level | average equipped item level (page 08 §2.2: the 13 combat slots, light and mount excluded, a two-hander counted twice), one decimal | — | "Average of your 13 combat slots" |
| Footer | "Item level 64.3 · Armour 4 210 · Set: {name} n/6 · Legendaries n/2" (canon: at most 2 legendaries worn) | — | — |
| Stats | groups as Farhold: Attributes (STR, DEX, INT, CON — canon), Offence, Defence, Utility; blank rows hidden with "show {n} more" (reuse) | — | `stat` renderer text (Farhold `STAT_HELP`, rewritten for Wildmarch's formulas on page 05) |
| Powers | what your legendaries, uniques, set bonuses and keystone perks actually do (reuse: farhold Powers pane) | — | source item |
| Set bonuses | each set worn: "{set} {worn}/{total}", each step 2/4/6 with ✓ | — | full set text |
| Companion | class companion frame: name, health, stance dropdown (**Assist**, Defend, Passive) | — | — |
| Durability total | "Durability 92%" | click: list of pieces | — |

**Slots (page 08 §2.1 owns; canon 15):** Head, Shoulders, Chest, Back, Hands, Waist, Legs, Feet, Neck,
Ring I, Ring II, Main hand, Off hand, Light, Mount (ids `head`, `shoulders`, `chest`, `back`, `hands`,
`waist`, `legs`, `feet`, `necklace`, `ring`, `ring2`, `weapon`, `offhand`, `light`, `mount`). No wrists, no
trinkets. Farhold had 13 (weapon, offhand, head, chest, legs, hands, feet, ring, ring2, necklace, mount,
light, tool); Wildmarch drops **tool** and adds **shoulders**, **back** and **waist** (the waist item adds
potion belt charges, not slots — slots come from level, page 07; page 08 §16.1). **Light** and **mount** stay equipment slots (Farhold rule: they are
loot); the `L` and `H` keys use what is worn there, and Collections only stores mount *looks*. The off hand
shows a `2H` badge when a two-hander locks it (a quiver may still go with a bow).

**Empty:** "Nothing worn. Everything you find goes in your bags first — open Bags (I) and click an item."

### 7.2 `scr_sheet_bags` — inventory, bags, filters, compare

(reuse+: farhold Inventory tab) Three columns: Worn (compact doll) / Bags / Compare.

```
+-------------+------------------------------------------------+------------------------+
| WORN (mini) | BAGS  84 / 100            [List] [Grid]  🔍[____]| COMPARE                |
|             | Show: All Weapons Armour Jewellery Consumables  | [hovered item card]    |
|             |       Materials Quest Junk                     |                        |
|             | Rarity: Any Uncommon+ Rare+ Epic+               | [worn item card]       |
|             | Sort: How it compares · Rarity · Slot · Name ·   |  "Worn now"            |
|             |       Item level · Value · Newest                |                        |
|             | [bag1 16][bag2 20][bag3 20][bag4 24][bag5 20]   |                        |
|             | rows or grid of items...                        |                        |
|             | Salvage everything up to: [Common][Uncommon][Rare]|                       |
+-------------+------------------------------------------------+------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Capacity | "{used} / {total}" | — | per bag |
| View | **List** / Grid (reuse) | — | — |
| Search | text box; filters by name, affix or stat ("crit"). Farhold rejected search because it stole keys; Wildmarch's search box only takes keys while focused | click to focus it (page 02 never takes `Ctrl+F`, the browser's find) | — |
| Kind chips | **All**, Weapons, Armour, Jewellery, Consumables, Materials, Quest, Junk | — | — |
| Rarity chips | **Any**, Uncommon+, Rare+, Epic+ (Unique/Set/Legendary always pass, reuse rule) | — | — |
| Sort chips | **How it compares**, Rarity, Slot, Name, Item level, Value, Newest | — | — |
| Bag slots | 5 bag sockets: a backpack (16, cannot remove) + 4 bag items (8–24 slots each, page 08); the four sockets open at levels **7, 14, 24 and 36** (page 07); a closed socket shows its level | drag a bag item in; click filters to that bag | bag name + size |
| Item row | name (rarity), slot, item level, score arrow "▲ +42 / ▼ 12 / – 0" (reuse: farhold score), bound mark (🔒 soulbound), stack count, "New" dot | click: equip (or use); Shift+click: link in chat; Ctrl+click: preview on the figure; right-click: menu (Equip, Equip off hand, Use, Split stack, Salvage, Sell (at a vendor), Destroy, Link); drag: move/equip/trade | item card |
| Compare panel | hovered item + the worn item it would replace, never cleared on mouse-leave (reuse) | hold Shift = other ring/hand | — |
| Salvage buttons | "Salvage everything up to: Common / Uncommon / Rare", two-click arm "Salvage 14? Click again" 4 s (reuse: farhold bulk recycle); never takes Unique, Set, Legendary, or anything equipped in a saved outfit | — | "Salvage breaks items into crafting materials (page 08)" |
| Sort bags | button: stacks and sorts by the current sort | — | — |
| Materials bag | a separate tab strip entry "Materials" (its own 200 slots, stacks of 200) | — | — |
| Currency | a third tab strip entry "Currency" = `scr_currency` (below) | — | — |

**`scr_currency` — the Currency pane** (new; page 08 §17 owns the list, earn caps and uses). One row per
currency: icon, name, amount held / held cap, this week's earnings / weekly cap as a bar, and "Spent at:
{vendor}" with a ⌖ locate. Rows, in order: **Gold** `cur_gold` (shown as gold · silver · copper, 100
copper = 1 silver, 100 silver = 1 gold), **Delver's Marks** `cur_delve` (dungeons), **Oathstones**
`cur_oathstone` (raids and world bosses), **Glory** `cur_glory` and **Laurels** `cur_laurels` (PvP),
**Veil Sigils** `cur_veil_sigil` (Veilspire), **Festival Tokens** `cur_festival`, then one row per
reputation token `cur_rep_*` grouped under "Reputation tokens". A currency you have never earned is
listed greyed with how to earn it. Weekly caps reset Wednesday 07:00 server time (canon).

Item card (`item` tooltip), in order (reuse: farhold `itemCard`, adapted):
1. Name in rarity colour. 2. "{Rarity} · {slot} · {armour type or weapon type} · two-handed".
3. "Item level {n} · Requires level {m}" (red if you cannot). 4. Base line: "88–131 damage · 2.6 s ·
42.2 damage per second" or "312 armour". 5. Weapon pattern glyph + text (reuse: Farhold weapon patterns,
"Slash, slash, overhead · 3.0 m"). 6. Affixes (green), each with its number. 7. Legendary power (violet `#c86bff`, or the unique's
minor power in its colour; full sentence with numbers). 8. Set block: "{set} — {w} of {n} worn", each bonus ✓ when active.
9. Class restriction ("Classes: Ranger") if any. 10. Durability "82 / 100". 11. Flavour line (italic).
12. Compare block "Instead of {worn}: +12.4 DPS, −3 Crit". 13. "Hold Shift to compare with your
{other ring}". 14. Sell value + "Binds when picked up"/"Binds when worn"/"Account-bound".

**Empty:** "Your bags are empty. Kill something, or open a chest." / filters: "Nothing matches. Widen
the filters above." (reuse). **Full:** toast "Your bags are full. {item} went to your mailbox." (overflow
goes to mail, page 15).

### 7.3 `scr_sheet_spells` — spellbook

(reuse+: farhold Skills tab `sk-card` strip + `js/spellcard.js`) Left: six spell cards in ladder order;
right: the selected spell's full card; bottom: shared skills (basic attack, dodge, potion, mount) and
the class mechanic panel.

**Spell card fields, in order** (extends spellcard.js's chip order):

| # | Field | Example |
|---|---|---|
| 1 | Icon + name + slot level | Piercing Shot · Level 1 · key 1 |
| 2 | Chips: shape, element, damage, heal, summons, status, cost, cooldown | Line · Physical · 140% weapon damage · 20 Focus · 6 s cooldown |
| 3 | Cast | Instant / 1.5 s cast / 3 s channel / Charge up to 2 s |
| 4 | Range + shape size | 30 m · 2 m wide line |
| 5 | Effect text (generated from the numbers, Farhold round-21 rule) | "Deals 140% weapon damage to every enemy in a 30 m line. Marked targets take 25% more." |
| 6 | Talents taken on this spell (up to 4 pips, filled gold) | ●●○○ |
| 7 | Set/legendary riders that change this spell | "Stalker's Weave (4): also pierces shields" |
| 8 | Rank-up line at calling quests if any | — |
| 9 | Preview button | plays the spell on a dummy (reuse the creation preview) |

Interactions: drag a card onto another to swap bar order; click selects; the **Talents** button opens
`scr_sheet_talents` (the Spellbook's **Talents** tab, same key `K`) on that spell. Locked cards: padlock, "Level 18 spell slot" (WORDING rule 6),
full card still readable (the player may look ahead).

Mechanic panel: gauge art + "Calling: level 6 ✓ · level 20 ○ · level 40 ○" with each calling quest's
name and what it grants; click a quest name → Journal.

Alternate bars (forms/stances): tabs above the cards: "Base · Bear · Cat · Owl · Stag" showing each
form's spells.

Class extras on this tab (each from its class file; out of combat only unless the file says otherwise):

| Element | Class | Shows | Interactions |
|---|---|---|---|
| **Form** toggle | Demon Hunter | two buttons, **Ravager** (Damage) / **Bastion** (Tank): which Demon Form variant your Demon Form uses, with each one's numbers (e.g. Ravager +25% damage and +30% move speed; Bastion +100% armour, +30% max health, ×3 threat) | click; greyed in combat with "Change your Form out of combat." ([classes/demon_hunter.md](classes/demon_hunter.md) §2.4) |
| **Role focus** | classes with a "Can also" role | dropdown of the class's roles (page 00 §6) | page 06 owns what it changes |
| **Totems** tab | Shaman | the four totem slots (earth, fire, water, air) and the choice in each | click a choice to set that slot ([classes/shaman.md](classes/shaman.md) §4) |
| **Toolbelt** button | Tinker (Calling II, level 20) | opens `scr_tinker_toolbelt` (§12.11) | out of combat |

### 7.4 `scr_sheet_talents` — talents

(reuse+: farhold `#sheet-skilltree`, 3 tiers → canon **4 tiers at 12/22/32/45**) A tab inside the
Spellbook (`K`, canon 00 §10), not its own rail tab. Left: the six spells as a column; right: the
selected spell's 4 tiers, each a row of 2–3 talent cards. **Late spells:** a spell's tier opens at the
later of the tier's level and the spell's slot level (canon 00 §10), so spell 6 (level 40) opens tiers
1–3 at once; the tier heading then reads "Tier {n} · opens with this spell at level {L}".

```
 SPELLS            | PIERCING SHOT — talents                          summary
 > Piercing Shot ●●| Tier 1 · level 12   [Ricochet ✓] [Barbed] [Longshot]
   Snare Trap   ●  | Tier 2 · level 22   [Twin Line] [Hunter's Eye] 
   Call the Cat    | Tier 3 · level 32   (locked, 18 levels away)
   ...             | Tier 4 · level 45   (locked)
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Talent card | id `<spellid>_t<tier><a|b|c>`, name, what it changes (in numbers) | click to take (one per tier); a taken tier is locked — undo only at the Unbinder (Farhold round 20 rule) | full text + "Taken. An Unbinder in town will take this talent back off, for a price." |
| Tier heading | "Tier {n} · level {L}" (+ "locked" until then) | — | — |
| Badge | open tiers without a pick | — | — |
| Summary | "{spell}: {talents taken}." | — | — |

Talent picks are free when first taken. **Empty** (before level 12): "Talents open at level 12. Each
spell gets one pick at levels 12, 22, 32 and 45."

### 7.5 `scr_sheet_perks` — perk forest

(reuse: farhold Perks tab, `js/perks.js` canvas, pan/zoom, search, "Names" toggle, Fit to view, the
side panel with arm progress, Take it button, Unbinder signpost). Canon: one point per level from 2
(59 total). Farhold's arm set is replaced by page 07's forest; everything else is unchanged: wheel zoom
0.6–4×, drag pan, double-click reset, search rings matches gold, ◆ keystone / ■ talent / ● node, "a solid
line means taking one opens the other".

**Empty side panel:** "Click a node. Anything touching something you have already taken can be taken
next — the shape of the tree is the cost." (reuse)

### 7.6 `scr_sheet_unlocks` — Unlocks screen (the feature ladder)

(new; canon pillar 1 and rule 5; page 07 calls it `scr_unlocks`) One vertical timeline of every unlock from page 07 §Feature ladder,
level 1 → 60, with quest unlocks placed at their quest's level.

```
 LEVEL | UNLOCK                     | HOW                          | STATE
   1   | Basic attack, 1st spell    | start                         | ✓ (click: show card)
   4   | 2nd spell                  | level 4                       | ✓
   5   | Dodge roll                 | quest (Brightwater drill yard)| ✓
   6   | Class mechanic (calling I) | quest: The Unbroken Line      | ● ready — quest waiting
   6   | Group finder · dungeon jrnl| quest (Warden Captain Isolde) | ● ready — quest waiting
  10   | 3rd spell · first mount    | level 10 · quest (Highcourt)  | ○ 4 levels away
  12   | Talent tier 1              | level 12                      | ○
  ...
  60   | Heroic dungeons · Renown   | level 60                      | ○
 [Filter: All v]  [x] Hide done
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Row | level, icon + name, how it is earned (level / quest name with ⌖), state: ✓ done, ● available now (glows), ○ future (with "N levels away") | click a done row: replays its unlock card; click a quest: opens the Journal on it (or map) | the unlock text |
| Filter | **All**, Spells, Talents, Class mechanic, Movement & travel, Group & social, Items & crafting, Endgame | — | — |
| Hide done | checkbox, **off** | — | — |
| Next up | a banner at the top: "Next: Dodge roll at level 5 (2 levels away)" — the same line as the HUD's "Next unlock" line (page 07 rule 4) | — | — |

**Empty:** never empty (level 1 always has rows).

### 7.7 `scr_sheet_reputation` — reputation

(reuse+: farhold journal "Who holds this ground" standing rows: colour dot, name, pips per band, band
name, "+N% in their shops", ± value, "What moves it") List of factions grouped by region (the holders in
page 00 §7: Vale Wardens, Fenfolk, Deepforge Clans, Crown Assembly, Sandsworn, Moonwell Circle, Frost
Wardens, Riftwatch, plus page 01's others). Each row: name, band, a bar "1 240 / 3 000", band rewards
("Liked: 10% off, Mossfen hood recipe"). Click → detail pane: blurb, all bands with rewards (✓ earned),
"What moves it" (deeds with ± numbers), vendor location ⌖. Filter: **All**, This region, Can still
rise, Maxed. Checkbox "Show as XP-bar-style tracker on the HUD" (one faction). Bands and numbers:
page 07.

**Empty:** "Nobody has an opinion about you yet." (reuse)

### 7.8 `scr_sheet_collections` — mounts, titles, appearance

(new; page 07 §Collections; account-wide unless marked) Sub-tabs (chips): **Mounts**, **Titles**,
**Appearance**, **Followers**, **Companions** (non-combat pets). The Bestiary is on the Journal (§7.10).

| Sub-tab | Layout | Elements |
|---|---|---|
| Mounts | grid of cards + 3D preview pane (vehicles.js / creature bodies) | card: name, speed ("+60% on roads"), source; ★ favourite; **Use this look** button (the mount is an equipment slot, page 08 §2.1 — the worn mount item keeps its stats and takes this look); "Random favourite look when I press H" toggle; locked cards grey with "From: {source}" |
| Titles | list | title text as it would show ("Wren the Unbowed"), source, ✓ owned; radio to pick the active title; "No title" option |
| Appearance | slot dropdown (Head, Shoulders, Chest, …) + grid of unlocked looks (every item ever worn is learned) | browse and preview here; **applying** a look happens at a wardrobe (`scr_wardrobe`, §12.13), which unlocks at level 25 (quest `q_ww_the_moonwell_mirror`, page 07); "Hide this slot" option; **Save outfit** (5 outfit slots) |
| Followers | grid | mercenary and companion appearances you have earned (page 07) |
| Companions | grid | summon/dismiss a non-combat pet |

Filters on each: **All**, Owned, Not owned; search box; source dropdown (**Any**, Drop, Quest,
Vendor, Achievement, Reputation, Event). Counter "Mounts 12 / 48".

**Empty (Mounts before unlock):** "Your first mount comes at level 10 from the stablemaster at the
Royal Stables in Highcourt." (page 07: Riding I, quest `q_hc_saddle_and_bridle`).

### 7.9 `scr_sheet_achievements` — achievements

(new) Left: category tree (**Summary**, General, Quests, Exploration, Dungeons, Raids, Bosses (incl.
dialog answers found and secret bosses), Class, Collections, Reputation, PvP, Feats). Right: cards with
icon, name, text with numbers ("Kill the Barrowking without anyone standing in a void zone"), points,
progress bar "3 / 5", date earned, reward (title, mount, look). Summary shows totals and the 5 latest.
Search box; "Show only incomplete" checkbox. Tracking: pin up to 3 in the quest tracker.

### 7.11 `scr_renown` — Renown board

(new; page 07 §Renown owns the numbers) **Opens:** sheet tab 10 (no key). **Unlock:** 60 (before 60 the
rail tab is locked: "Opens at level 60."). Four tracks side by side — **Might**, **Bulwark**,
**Swiftness**, **Fortune** — each a column of 20 ranks, 1 Renown point per rank. Each rank cell shows its
bonus ("+0.25% damage and healing done"); the column footer shows the total ("+5% at 20 ranks"). Header:
Renown level, "{n} XP to Renown {L+1}", unspent points, and — after all 80 points are spent — "Each
Renown level now gives a Renown cache." Click a rank to spend a point (whether points can be taken back is
page 07's call). Note under the board: "Renown bonuses are off in rated PvP."

### 7.10 `scr_sheet_journal` — quest log and journal

(reuse+: farhold Journal nine-pane grid → Wildmarch uses four panes) Open with `J`. Page 14 calls the
quest pane `scr_journal` → Quests. A chip row across the top picks the view: **Quests** (the panes below),
**Rumours**, **Bestiary** (`scr_bestiary`, §7.10.1), **World bosses** (`scr_world_boss_tracker`, §7.10.2),
**History**.

```
+-------------------------+--------------------------------------------+-------------------+
| QUESTS  12/25  [filter] | THE BARROW WAKES            Main story · 6 | THE WORLD         |
| ▾ Main story            | Warden Hale wants the barrow stones clean. | Regions visited   |
|   The Barrow Wakes  ✓   | [x] Speak to Warden Hale                   | Hearthvale  1–6 ✓ |
| ▾ Calling               | [ ] Cleanse the stones 2/4          ⌖      | Mossfen     5–12  |
| ▾ Hearthvale            | Rewards: 1 240 XP · 3g · pick one of 3:    | FOES              |
|   Rats in the Granary   |   [item][item][item]                        | Named foes...     |
| ▾ Daily (2)             | [Track] [Share] [Abandon] [Hand in ✓]      | RUMOURS           |
+-------------------------+--------------------------------------------+-------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Quest list | grouped Main story, Calling, Unlock, region names, Dungeon, Raid, Daily, Weekly, Event; level tone colour; ✓ ready; cap "12 / 25" (page 14 owns the cap) | click selects; checkbox = track | — |
| Filter | **All**, Can hand in, This region, Group quests, Tracked | — | — |
| Detail | title, kind + level, giver, story text (may be voiced: ▶ button plays the giver's line), objectives with ⌖, rewards (reuse questrewards blurb), buttons Track / Share with party / Abandon (confirm) / Hand in (only for quests marked remote-turn-in, reuse Farhold journal hand-in) | — | — |
| The world | regions with level band and ✓ visited, dungeons found, waystones lit | ⌖ | — |
| Foes | named enemies that killed you, and rares you killed (reuse: farhold Foes pane) | — | — |
| Rumours | heard-about lines with who told you (reuse: farhold rumours) | ⌖ | — |
| History | completed quests (searchable) | — | — |

**Empty:** "Nobody has asked you for anything. Look for a gold ! over someone's head." (reuse wording).

#### 7.10.1 `scr_bestiary` — bestiary

(new; page 10 §11 owns what unlocks; reuse idea: Farhold `BESTIARY-IDEAS.md` §4) **Opens:** Journal →
Bestiary. **Unlock:** 1. Left: families (page 10) with a count "12 / 19 met"; right: one page per monster
id that fills in as you kill it.

| Kills | What appears on its page |
|---|---|
| 1 | name, a live 3D figure (reuse: Farhold `js/figure3d.js`), region, level range |
| 10 | the description paragraph and its role |
| 25 | every ability with numbers and the telegraph it uses (§14.4 icons) |
| 50 | loot hooks and its weakness — "Studied: +5% damage against it, forever" |

Named rares, warlords and bosses fill on the first kill. A finished family shows its title reward
(page 07). Filters: **All**, Met, Not met, Studied; search. **Empty:** "You have not met anything yet.
Everything you kill gets a page here."

#### 7.10.2 `scr_world_boss_tracker` — world boss timers

(new; page 13 §8.2) **Opens:** Journal → World bosses (the Dungeon journal's World bosses tab shows the
same list). **Unlock:** 1. One row per world boss: name, region, next spawn time on your local clock
("Next window 18:00–18:30"), whether you have looted it **today** and **this week** (✓/✗), and a **Guide
me** button that sets a map marker. A row turns orange while the boss is up, with "Up now — 22 min left".
Region alerts are page 04's `set.raid.world_boss_alerts`.

---
## 8. `scr_map` — world map

(reuse+: farhold `js/map.js`, `js/markers.js`, `js/map-hits.js`, `js/nearby-ui.js`) Farhold's map is a
generated planet with World Forge layers. Wildmarch's continent is **hand-shaped** (page 01), so the
map draws a painted continent image per zoom level instead of a generated raster, and keeps Farhold's
screen, hit-testing, markers, tabs and level overlay.

**Open:** `M`. **Unlock:** 1. Opening releases the cursor; the world keeps running.

```
+------------------------------------------------------------------------------------------+
| THE WILDMARCH   Mossfen · 12 km across · zoom 2.6×   [Copy location]                   × |
+------------------------------------------------------------+-----------------------------+
|                                                            | [Quests][Places][Find][Group]|
|         (painted continent; region wash by level tone;     | QUESTS IN HAND              |
|          icons; party dots; your arrow; pins)              |  ! Rats in the Granary ⌖ ◎  |
|                                                            |  ! The Barrow Wakes    ⌖ ◎  |
|                                                            | SELECTED                    |
|                                                            |  Reedhollow · town · 5–12   |
|                                                            |  [Set waypoint] [Pin]       |
+------------------------------------------------------------+ LAYERS & KEY ▸             |
| key strip: a region shows its level range and how rough it is: [far below][easy][fair]...|
| readout: Mossfen · Reedhollow · level 5–12 (a fair fight) · 420 m north-east             |
+------------------------------------------------------------------------------------------+
```

**Zoom levels** (wheel steps, reuse Farhold's ladder shape):

| Step | Scale | Shows |
|---|---|---|
| 1 | Continent | all 11 regions + Highcourt, region names, level bands, hubs, raid entrances, world bosses, your arrow |
| 2 | 1.6× | + towns, dungeon entrances, waystones |
| 3 | 2.6× (default when opening) | + villages, landmarks, quest givers you know, events |
| 4 | 4.2× | + roads by class, vendors/trainers/banks inside towns, gathering nodes you tracked |
| 5 | 6.8× | + small landmarks, chests you have seen, the path to a super-tracked objective |
| 6 | 11× | town plans (streets, buildings labelled: Inn, Bank, Trainer…) |

Inside a dungeon, `M` shows the dungeon's own floor map (rooms, boss skulls, your group) with a floor
dropdown for multi-floor dungeons.

**Region level overlay** (reuse: farhold level wash, 38% blend, tone table; on by default):

| Tone | Rule (region mid-level vs you) | Wash | Text | Word |
|---|---|---|---|---|
| trivial | ≤ −5 | 120,132,150 | #aab6c6 | far below you |
| easy | −4..−2 | 90,200,130 | #8fe0a0 | easy |
| even | −1..+2 | 230,200,90 | #ffe08a | a fair fight |
| hard | +3..+5 | 235,150,70 | #ffa860 | dangerous |
| deadly | > +5 | 235,70,60 | #ff6a5a | do not go here yet |

Each region shows "min–max" bold under its name. Region names: **shown for every region** (Farhold hid
unknown ones; Wildmarch's continent is known lore) but unvisited regions are drawn under a parchment fog
until you enter them (fog of war, per region, page 04 option to turn off).

**Side tabs:**

| Tab | Content | Empty text |
|---|---|---|
| Quests | tracked + untracked quests with locations, rows: star, icon, name, distance, ⌖ locate, ◎ track (reuse: farhold `markerRow`) | "Nothing on your list. Look for a gold ! in towns." |
| Places | Selected (what you clicked + **Set waypoint** / **Pin** / **Favourite**), Favourites, Pins, Waystones (lit ones, **Travel** button when standing at one) | "Click anywhere on the map. What you clicked shows up here." (reuse) |
| Find | search box for any place/NPC name you have discovered; dropdown **Anything**, Towns, Dungeons, Raids, Vendors, Trainers, Banks, Waystones, Events; sort **Nearest first** / By name; "Favourites only" | "Nothing by that name that you have found." |
| Group | party/raid members with region + distance + ⌖; ping button | "You are not in a group." |

**Layers & key (fold, closed by default):** toggles **Level overlay (on)**, **Quests (on)**, **Group
(on)**, **Waystones (on)**, **Dungeons & raids (on)**, **Services (on)**, **Gathering (off)**, **Events
(on)**, **Pins (on)**, **Roads (on)**, **Fog (on)**; the key lists every icon from §4.12 grouped
Beware / Settlements / Instances / Travel / Services / Yours, plus "a gold ring — one of your Favourites".

**Pins and marks:** Shift+click drops a pin "Pin {n}" (reuse); Ctrl+Shift+click saves a favourite
place; right-click anywhere opens page 02 §5.10's menu (Set waypoint · Share with party · Remove pin ·
Copy location) — **Share with party** pings the map and minimap for your group (3 s ring). `Home`
recentres on you, `+`/`-` zoom, `F1`–`F5` centre on that party member (page 02). Right-click a pin also
offers Rename (48 chars). Max 50 pins. A pin is shared as a chat link "[Pin: Mossfen 412,
88]" that others can click to add.

**Hover card:** name, kind, level band + tone word, "You have not been here" / blurb, services list for
towns, "Waystone — lit / not lit yet", quest objective text. **Readout strip:** "{region} · {sub-area} ·
level a–b ({tone word}) · {distance} {compass}". Hit-test: nearest centre wins, ties go to the top-most
painted (Farhold round 17 rule).

**Refusals:** "That is not on this continent." (instance/other-world marks), "You have not found that
place yet."

---

## 9. `scr_instance_journal` — dungeon and raid journal

(new) **Open:** `Shift+J`, the book button on a dungeon door's prompt, a Gathering Stone, clicking a
dungeon on the map, or a link in the group finder. **Unlock:** 6, quest `q_hv_the_barrow_bell` (page 07;
it opens the journal at the Hollow Barrow's page). Page 12 calls the Dungeons tab `scr_dungeon_journal`
and page 13 calls the Raids tab `scr_raid_journal`.

```
+--------------------+---------------------------------------------------------------+
| DUNGEONS | RAIDS | WORLD BOSSES   (Shift+J)                                         |
| ▾ Hearthvale       | THE HOLLOW BARROW   Levels 5–7 · Hearthvale                   |
|   Hollow Barrow ✓  | Difficulty: [Normal v]   Cleared this week: 2/3 bosses        |
| ▾ Mossfen          | [Overview][Bosses][Loot][Map][Secrets][Records][Affixes]      |
|   Drowned Mill     | BOSS: Grave-Warden Osric                    [3D model turning] |
| ...                |  Phase 1 (100–60%)                                            |
|                    |   ● [red] Barrow Slam — 8 m circle danger zone, 2.0 s warning  |
|                    |   ● [purple] Grave Rot — void zone, 6 s, 0.5 s ticks           |
|                    |   ● [gold edge] Summon Dead — interruptible 2.5 s cast         |
|                    |  Phase 2 (60–0%) ...                                          |
|                    |  Dialog: "Speak your name" — 2 answers found / 3              |
|                    |  Secret boss: ??? (a hint when found)                          |
+--------------------+---------------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Top tabs | **Dungeons**, Raids, World bosses | — |
| List | grouped by region; ✓ cleared this lockout; level band; locked entries grey with "Opens at level {n}" | click |
| Difficulty dropdown | **Normal**, Heroic, Mythic+ (dungeons); **Normal**, Mythic (raids); only difficulties you can enter are selectable, others say why ("Heroic opens at level 60.") | changes numbers, loot and extra abilities shown |
| Lockout line | "Cleared this week: 2/3 bosses · resets Wednesday 07:00" (canon weekly reset, server time) | — |
| Overview | lore, entrance location ⌖, group size, recommended item level, key level (Mythic+) | — |
| Bosses sub-tab | per boss: 3D model, lore line, **abilities by phase**, each with its **telegraph icon** (§14.4 colour + shape glyph), numbers ("deals 3 400 fire damage in an 8 m circle, 2.0 s warning"), tags: [Interrupt] [Dispel: Magic] [Tank swap] [Soak 3] [Kite] [Line of sight] [Enrage 6:00]; role tips (Tank / Healer / Damage) as three short lines | click an ability: plays a 3 s ghost preview of the telegraph on a flat floor |
| Dialog opportunities | known answers listed with what they did; unknown ones "???" with a count "2 / 3 found" | — |
| Secret boss | "???" until found; then name + how to summon it | — |
| Loot sub-tab | item grid for this boss/difficulty; filters **Your class** (default), All classes; slot dropdown (**Any**, Head, …); each item shows drop chance band (Common/Rare/Very rare) — page 12/13 own the tables | hover = item card; ★ wishlist (shows "On your wishlist" toast when it drops) |
| Map sub-tab | the dungeon floor plan with boss rooms numbered; rooms revealed as you enter them, Ember Shrines, chests found (page 12 §2.10) | — |
| Secrets sub-tab | one line per dungeon: "???" until **you** have found its secret boss, then the unlock condition in full; a hint line after your third clear (page 12 §2.10) | — |
| Records sub-tab | clears per difficulty, best time, deaths per boss, best Mythic+ key and time, secret kills | — |
| Affixes sub-tab | this week's Mythic+ affixes with full text (Mythic+ opens at 60) | — |

**Empty:** a dungeon with no bosses killed ever still shows everything (the journal is a guide, not a
reward). **Open question:** page 12 §2.10 instead hides each ability as "???" until you have seen it
once on that difficulty — the owner should pick one. The **World bosses** tab is the same list as
`scr_world_boss_tracker` (§7.10.2): spawn windows "Next window 18:00–18:30".

---

## 10. Groups and social

All four windows below are **tabs of one Social window** opened with `P` (page 02 `social`): **Party**
(`scr_party`, with its Leader tools and Lockouts sub-tabs), **Group Finder** (`scr_group_finder`),
**Friends** (`scr_social`) and **Guild** (`scr_guild`). `P` opens it on the last tab used.

### 10.1 `scr_group_finder` — group finder

(new) **Open:** `P` → **Group Finder** tab. **Unlock:** 6, quest `q_hv_the_barrow_bell` (page 07; before
then the tab reads "The group finder opens at level 6, with a quest from the Warden Captain in
Brightwater. Until then, ask in /lfg or invite people you meet.").

```
+------------------------------------------------------------------------------------+
| SOCIAL (P)  [Party] [Group Finder] [Friends] [Guild]  ›  [Find a group] [Premade listings] |
+------------------------------+-----------------------------------------------------+
| I can play: [Tank][Healer][Damage]  (Support = Damage slot)                         |
| Queue for:                   | SELECTED                                            |
| (•) Dungeons [Normal v]      |  [x] Random dungeon (my level)  +50% XP first daily |
|     [x] Hollow Barrow 5–7    |  [ ] The Drowned Mill 9–12                          |
|     [ ] Drowned Mill 9–12    |                                                      |
| ( ) Raids [Normal v]         |  Estimated wait: Damage 6 min · Tank 1 min           |
| ( ) World events             |  [ Join the queue ]                                  |
+------------------------------+-----------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Role toggles | Tank / Healer / Damage; only roles your class has (page 00 §6 Role + Can also); Support classes tick Damage with a "Support" note | at least one required | "{Class} can play: {roles}" |
| Category | **Dungeons**, Raids (unlock 30), World events | — | — |
| Difficulty dropdown | Dungeons: **Normal**, Heroic (60), Mythic+ is **not** queueable (premade only, page 15); Raids: **Normal** only (Mythic premade only) | — | — |
| Dungeon checklist | every dungeon whose band you are inside (or 60 for Heroic), with level band; greyed ones say why ("Too low: level 13 needed"); "Random dungeon (my level)" at the top | — | first-of-day bonus text (page 07) |
| Wait estimate | per role, from the server | — | — |
| Join the queue | primary; becomes **Leave queue** + a timer "In queue 3:12"; the minimap eye spins | — | — |
| Deserter lock | "You left a group early. You can queue again in 24:10." | — | — |

**Premade listings** tab: a board of player-made groups: title, activity, difficulty, key level, roles
needed (icons), leader, members "3/5", note, **Apply** (with role + note); your own listing form:
activity dropdown, difficulty, title (max 40), note (max 120), "Voice chat" checkbox, min item level.
Filters: activity, difficulty, "Roles I can fill". Empty: "No groups listed for that. List your own."

### 10.2 `scr_party` — party and raid management

(new) **Open:** `P` → **Party** tab, or right-click your portrait. **Unlock:** 1.

| Element | Shows | Interactions |
|---|---|---|
| Members | 5 rows (party) or groups 1–4 × 5 (raid): portrait, name, class, role icon, level, item level, zone, online | drag between raid groups (leader/assist); right-click: Promote to leader, Make assistant, Set role, Kick, Whisper, Inspect |
| Invite | name box + **Invite** | — |
| Loot rule dropdown (leader) | **Personal loot** (canon, and forced in the group finder); Loot master (premade raids only, page 13 §2.10) | — |
| Loot-master threshold dropdown (raid leader, Loot master only) | **Rare**, Epic, Unique+ (page 13 §2.5) | — |
| Difficulty dropdown (leader) | Dungeon: **Normal**, Heroic, Mythic+; Raid: **Normal**, Mythic | locked inside an instance |
| Buttons | Convert to raid / Convert to party, Ready check, Role check, Reset instances, Leave group | — |
| Raid markers | 8 target icons (`Num 1`–`Num 8`) + 8 world markers (`Shift+Num 1`–`Shift+Num 8`, page 02 §5.3–5.4) for leader/assist | — |
| Leader tools | sub-tab = `scr_raid_leader` (§10.2.1) | — |
| Lockouts | sub-tab = `scr_raid_lockouts` (§10.2.2) | — |
| Followers | "Fill empty slots with followers" (solo/Normal only, pillar 6): dropdown per empty slot of your hired followers | — |

#### 10.2.1 `scr_raid_leader` — raid leader tools

(new; page 13 §2.5 owns the rules) **Opens:** Party tab → **Leader tools** (leader and assists; shown
from the first raid, level 30, and in any party for the tools a party leader may use). One button row,
each with its key or slash command from page 02:

| Tool | Control | Who | Notes |
|---|---|---|---|
| World markers | 8 buttons (Sun, Moon, Star, Flame, Leaf, Wave, Crown, Skull) + **Clear all**; keys `Shift+Num 1`–`8`, `Shift+Num 0` clears; `/wm 1-8` | leader, assists | placed at the reticle; ground discs with a light column, drawn on the minimap and never in a page 11 telegraph colour |
| Target icons | same 8 symbols; keys `Num 1`–`8`, `Num 0` clears; `/mark` | leader, assists (anyone in a 5-player party) | — |
| Ready check | **Ready check** button; `/ready` | leader, assists | the 30 s card in `scr_invite`; results on the frames and in chat; 30 s cooldown |
| Role check | button | leader | — |
| Pull timer | **Pull** button + seconds (5–15, default 10); `/pull 10` | leader, assists | drives `hud_pull_timer`; the same button cancels |
| Raid warning | text box; `/rw` | leader, assists | shown with `hud_warning_banner` in orange |
| Break timer | 5 / 10 / 15 min | leader | drives `hud_break_timer` |
| Loot rules | Personal loot / Loot master + threshold | leader | out of combat |
| Difficulty | Normal / Mythic | leader | before the first kill of the lockout |
| Dialog vote | who answers dialog opportunities | leader | page 11 §10.3 and page 13 §2.5 differ (Speaker vs leader/vote) — see report |
| Mass summon, Kick, Hard-mode reminder, Subgroups | buttons / drag on the member list | leader (subgroups: assists too) | page 13 §2.5 |

#### 10.2.2 `scr_raid_lockouts` — lockouts

(new; page 13 §2.2) **Opens:** Party tab → **Lockouts**. One row per saved raid and dungeon: name,
difficulty, bosses looted (✓/✗), reset countdown to Wednesday 07:00 server time, and an **Extend
lockout** toggle for raids (keep this week's instance next week; no new loot from bosses already dead).
World bosses show looted today / this week.

### 10.3 `scr_guild` — guild window

(new) **Open:** `P` → **Guild** tab. **Unlock:** anyone may **join** from level 1; **founding** one needs
level 15 and the quest `q_hc_a_name_on_the_rolls` (page 07).

Tabs: **Roster**, **Ranks**, **Bank**, **Log**, **Info**.

| Tab | Elements |
|---|---|
| Roster | table: name, level, class, rank, zone, last online, note, officer note (officers only); sort by any column; "Show offline" checkbox (**off**); search; right-click: Invite to party, Whisper, Promote, Demote, Kick (confirm); counter "38 online / 124" |
| Ranks | up to 10 ranks (Guild leader, Officer, Veteran, Member, Recruit default); per rank checkboxes: Invite, Kick, Promote, Demote, Edit notes, See officer chat, Speak in officer chat, Edit message of the day, Withdraw from bank tab 1–6 (count per day), Deposit, Withdraw gold per day (number) |
| Bank | 6 tabs × 98 slots (bought with guild gold, page 15), each tab named with an icon; drag in/out per rank rights; gold line with Deposit/Withdraw; per-tab log |
| Log | events: joined, left, promoted, kicked, bank moves (who, what, when); filter dropdown **All**, Members, Ranks, Bank, Gold |
| Info | guild name, tabard (emblem, colours: 3 swatches from the cloth palette + 12 emblems), message of the day (editable by rank), guild info text (500 chars), created date, **Leave guild** (confirm), **Disband** (leader, typed confirm) |

Creating a guild: the registrar at the Hall of Records in Highcourt (`npc_hc_registrar_pell`), name 3–24
characters (letters, spaces, one apostrophe), fee (page 07: 10 gold; page 15 owns guilds), charter needs 4
other signatures. **Empty roster** cannot happen (the leader).
**No guild:** the window shows "You are not in a guild. Find one in /lfg, or found one at the Guild
Registrar in Highcourt." + **Browse guild listings** (recruiting guilds board, filters: realm time zone,
focus **Any**/Levelling/Dungeons/Raids/PvP/Social).

### 10.4 `scr_social` — friends, ignore, recent

(new) **Open:** `P` → **Friends** tab. Sub-tabs: **Friends**, **Ignore**, **Recent**.

| Tab | Elements |
|---|---|
| Friends | list: online first, name, level, class, zone, note; account-wide friends (optional, page 15) show which character; **Add friend** (name), right-click: Whisper, Invite, Remove, Set note; status dropdown for yourself **Online**, Away, Busy, Appear offline |
| Ignore | list of ignored names, **Add**, **Remove**; cap 100 |
| Recent | the last 25 players you grouped with (from the group finder), with the activity and date; **Add friend**, **Ignore**, **Report** |

**Empty Friends:** "No friends yet. Right-click a name in chat or in your group to add one."

### 10.5 `scr_mail` — mailbox

(new) **Open:** `E` on a mailbox in any town. **Unlock:** 11, quest `q_hc_keys_to_the_city` (page 07).
Tabs: **Inbox**, **Send**.

| Element | Shows | Interactions |
|---|---|---|
| Inbox rows | sender, subject, attachment icons (max 8 items + gold), days left (mail kept 30 days; auctions/returns 7), "COD {price}" tag | click opens; **Take all** button |
| Open letter | text, attachments (click to take), gold (take), **Reply**, **Return**, **Delete** (confirm if attachments) | — |
| Send | To (name, autocomplete from friends/guild), Subject (max 64), Body (max 500), up to 8 item slots (drag from bags), gold amount, **Cash on delivery** checkbox, postage cost "30 copper" (page 15), **Send** | — |
| Errors | "No character called {name} on this realm." / "That item is soulbound." / "Not enough gold for postage." / "{name}'s mailbox is full (100)." | — |

**Empty:** "No mail." Overflow from full bags arrives as "Carried for you" letters from the Postmaster.

---

## 11. Damage meter and combat log

### 11.1 `scr_meter` — damage meter

(reuse+: `meters/js/meter.js`, `meters/js/meter-ui.js`) A small dockable panel (default bottom-right
above the toasts, 300×220, resizable). **Unlock:** 1 (page 02; page 07's ladder does not gate it).
Toggle: `Shift+M`. Page 05 calls it `scr_damage_meter`.

| Element | Values / shows | Source |
|---|---|---|
| Scope dropdown | **This fight**, Whole instance / session ("all fights ({n})"), then one entry per fight labelled "{boss or first enemy} {time}" (max 50 kept) | reuse |
| Mode buttons | **Damage done**, Healing, Damage taken, Absorbs, Statuses, Deaths, + new: **Interrupts**, **Dispels**, **Threat** | reuse + new |
| Bars | one per group member (+ followers/pets folded into owner, toggle), width % of the top, "{total} ({per second}/s)" + sparkline | reuse |
| Drill-down 1 | click a bar: that actor's sources (spell or pet), each with total, hits, avg, max, crit %, absorbed, blocked, overheal | reuse |
| Drill-down 2 | click a source: every hit (time, target, amount, crit ★, overkill, absorbed, blocked, type) | reuse |
| Deaths mode | per death: time, killing blow, "Recap" opens the same 10 s table as the death screen | new |
| Header | "{duration} · total {n}" + summary line (misses, blocked, absorbed, overheal, statuses, deaths) | reuse |
| Report | button: posts the top 5 to a chat channel (dropdown **Party**, Raid, Say, Guild, Whisper…) | new |
| Reset | button + "Reset on entering an instance" option (**on**) | new |

Only your group's numbers are recorded (page 15: no meters on strangers). **Empty:** "No records yet."
(reuse)

### 11.2 `scr_combat_log` — combat log

(reuse+: farhold Log tab, `LOG_KINDS`, filters saved per character) The **Combat** tab of the chat box,
plus a full-screen version (chat tab → right-click → Pop out). Lines: "[12:40:03.2] Your Piercing Shot
hits Mossfen Lurker for 1 240 Physical. (crit)". Filters (checkboxes): **Damage you deal**, **Damage you
take**, **Healing**, Pet and follower damage, **Buffs and debuffs**, Interrupts and dispels, **Deaths**,
XP and gold, Loot, Everything else; source filter dropdown **Me**, My group, Everyone nearby. Max
2 000 lines kept; **Save to file** writes a text file (reuse: the meter's serialisation). Empty:
"Nothing has happened yet." / "Everything here is filtered out — switch a kind back on above." (reuse)

### 11.3 `scr_threat_meter` — threat meter

(reuse+: `meters/js/meter-ui.js`; page 05 §13.7 owns threat) **Opens:** the damage meter's **Threat**
mode, or popped out as its own small dock (right-click the mode → Pop out). **Unlock:** 1; shown only in a
group. One bar per group member (followers and pets included) for **your current target**: name, role
icon, threat as a % of whoever it is attacking, bar green under 70%, amber 70–99%, red at 100% ("has its
attention"); the unit's current target is marked ◆ at the top. Tanks see who is closest to pulling it
off them. **Empty:** "No target, or it has not noticed anyone yet."

---
## 12. NPC windows and the economy

### 12.1 `scr_talk` — NPC conversation

(reuse+: farhold `js/talkui.js`) Farhold's talk panel is one stacked panel (header, one greeting line,
then blocks: Work, Hire, Trade, Gambler, Unbinder, Your jobs) with no reply choices. Wildmarch keeps the
panel and adds **reply options** and a speech bubble.

```
+-----------------------------------------------------------+
| WARDEN HALE              Vale Warden · Brightwater      × |
| [portrait]  "The barrow's woken again. You have the look  |
|              of someone who doesn't mind the dark."   ▶   |
|  1  ! The Barrow Wakes (Main story, level 6)              |
|  2  ? Rats in the Granary — ready to hand in              |
|  3  Tell me about the Vale Wardens.                       |
|  4  [Shop] Show me your wares.                            |
|  5  Goodbye.                                              |
|  Standing: Liked (1 240 / 3 000)                          |
+-----------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Header | name, role · place, ×; portrait (3D head) | Esc / E closes (reuse) |
| Line | the NPC's line, spoken with their formant voice through Lingo (reuse: `shared/voices.js`, speech); ▶ replays; the same line floats as a bubble over their head for players nearby | — |
| Options | numbered 1–9: quest offers (gold `!`), turn-ins (gold `?`), lore topics, service buttons [Shop], [Train], [Unbind], [Bank], [Stable], [Set hearth], [Travel] which open the matching window | click or number keys |
| Standing | faction band with the NPC's faction | — |
| Class/rep-gated options | shown only when met, tagged "(Warrior)" or "(Liked)" | — |

Closing by walking away (>6 m) closes the panel. **Empty options** never happens (always "Goodbye.").

### 12.2 `scr_quest_offer` — quest offer and turn-in card

(reuse+: talkui Work block, `js/questrewards.js`) Replaces the talk panel body.

| Part | Shows |
|---|---|
| Title + kind + level | "The Barrow Wakes · Main story · level 6" |
| Story | 2–5 sentences, voiced |
| Objectives | the list with counts |
| Rewards | "{xp} XP · {gold}" + reward kind: items shown as cards; `choice` shows "You will pick one of these"; `pick3` shows "Take one of three rare finds" |
| Buttons | **Accept** / **Not now** (offer); **Hand it in** (turn-in; gather quests keep Farhold's checklist: "Add all", "Clear", "Hand over {n}") |
| Refusals | "Your quest log is full (25). Abandon one first." / "Come back at level {n}." / "You need to finish *{quest}* first." |

Page 14 §5.3–5.6 owns the flow and names the two halves separately; both are views of this card:

- **`scr_quest_offer`** — the offer: the parts above with **Accept** · **Decline** · (story quests)
  **Later**; `class_pick` items are rolled and shown now, before you accept.
- **`scr_quest_turnin`** — the turn-in: a short spoken completion line, then the reward panel (XP, coin,
  the item block); unlock cards, title cards and reputation lines follow; a full bag sends items to the
  mailbox with a note; the NPC may offer the next quest at once (**Accept next** is the default button).
- **`scr_quest_reward_choice`** — the pick inside a turn-in: `choice` = three buttons **Coin** (×1.5) ·
  **A crate** · **Materials**; `pick3` / `class_pick` = three item cards side by side, each with a compare
  strip against what you wear in that slot, click one → **Take** (confirm). (reuse: `shared/rewards.js`
  choose mode, `js/questrewards.js` `CHOICE_OPTIONS`)

### 12.3 `scr_notice_board` — notice board

(reuse: farhold `#noticeboard`) Title "Notice board — {town}", rows: job title, "posted by {faction}",
distance, "{gold} · {xp} XP", **Take it** / "taken"; Esc closes. Wildmarch uses it for daily and
repeatable region jobs (page 14). Empty: "Nothing is pinned to the board today. Come back after
something happens in this region." (reuse)

### 12.4 `scr_vendor` — vendor

(reuse+: farhold talkui trade block) Opens beside the Bags tab (the bag stays usable).

| Element | Values / shows |
|---|---|
| Tabs | **Weapons**, Armour, Consumables, Materials, Recipes, Mounts (stable master only), **Buy back** (last 12 sold, this session) |
| Row | name (rarity colour), spec line (reuse `specOf`: slot · damage/armour · level N), upgrade mark ▲/▼ vs worn, price with coin icons, reputation discount "−10% (Liked)", **Buy** (disabled with "That is {price} and you have {gold}.") ; Shift+click buys a stack (quantity popup 1–200) |
| Cannot-use | row tinted red, "Your class cannot use this" |
| Sell | drag from bags onto the vendor window, or right-click in bags; Junk (grey) has a **Sell all junk** button |
| Repair | **Repair all** "Repair everything: 1g 20s" + per-item repair from the Gear tab (page 08); guild repair option if the rank allows |
| Money line | "You have {gold}." |
| Limited stock | "3 left · restocks in 2:14:00" |

Empty tab: "Nothing of that sort today." Buyback empty: "You have not sold me anything." (reuse)

### 12.5 `scr_trainer` — class trainer and Unbinder

(reuse+: farhold `js/retrain.js` + talkui Unbinder block) One window, two tabs. **Unlock:** Trainer tab
1; Unbind tab 12 (page 07, `npc_hc_unbinder_mott` in Highcourt and an Unbinder in every hub from
Anvilgate on).

- **Trainer** tab (class trainers, one per hub): your six spells with their slot levels; a spell whose
  slot level you reached is learned **automatically** (canon); the trainer tab explains the calling
  quests ("Your next calling is at level 20: *{quest}*. [Show on map]") and sells **spell rank books**
  only if page 06 introduces ranks. Also: "Learn to ride" (mount skill) at the unlock level (page 07).
- **Unbind** tab (`npc_unbinder_*`, any hub): chips **Talents** / **Perks** (Spells removed: canon spells
  are fixed). Rows: name, "{spell} · tier {n}" or "{arm} arm", price, **Unbind** (disabled with the
  reason written on the row, not only in a tooltip — Farhold round 20 fix). **All** row with two-click
  confirm "Unbind all {n} talents? Click again." Prices from Farhold's table (talent 60 + 8/level, all
  250 + 30/level; perk 80 + 12/level, all 400 + 45/level) scaled by page 07/08's gold economy.
- **Dual spec** (Unbind tab, level 30, quest `q_hc_two_minds_one_will`, page 07): once earned, a
  **Second spec** row shows the two saved builds; switching is on the character sheet header (§6).
- Empty: "You have not taken a talent yet." / "You have not spent a perk point yet." (reuse)

### 12.6 `scr_craft_bench` — crafting bench

(reuse+: farhold Crafting and Upgrade tabs, `js/craft.js`, `data/crafting.json`; page 08 calls it
`scr_bench`) **Open:** `E` at a bench in a town. **Unlock:** 9, quest `q_mf_what_the_fen_gives_back`
(salvage and the forge); the **Upgrade** tab opens at 16 (quest `q_gr_the_second_hammer`: Temper,
Promote) and gains Inscribe, Reweave, Recast and Brand at 34 (quest `q_cs_brands_in_the_ash`) — page 07.
Tabs: **Craft**, **Upgrade**, **Salvage**.

| Tab | Columns | Elements |
|---|---|---|
| Craft | Recipes / What to make / The forge | recipe list (filter **All**, Can make now, Weapons, Armour, Jewellery, Consumables; search); bases with "a–b dmg · N armour · two-handed · your class cannot hold this"; cost table "have / need" per material (green/red); "What comes out: {rarity} {base}, item level {n}"; **Craft** ×1/×5/×max; refusal "Not enough {material}: have 3, need 5." |
| Upgrade | Pick an item / What you can do / What it becomes | scope chips **Everything**, In bags, Worn; actions Temper, Reinforce, Promote, Inscribe, Reweave, Recast, Brand (Farhold `CHANGE_TEXT` sentences); reweave picks one affix; warnings ("Every property is rolled again. The item can come out worse.") |
| Salvage | a drop zone + list | drag items in; preview "You will get: 4 Barrow Iron, 1 Ember Dust"; **Salvage** (confirm for Epic+) |

Empty: "Pick a recipe." / "Nothing on the bench. Pick something on the left." (reuse)

### 12.7 `scr_bank` — bank

(new) **Open:** banker NPC in any hub or Highcourt. **Unlock:** 11, quest `q_hc_keys_to_the_city`
(page 07). Main bank 48 slots + 6 purchasable
bag sockets (page 08 prices), a **Materials** tab (every material, stacks of 999, account-wide proposed),
**Account bank** tab (shared by your characters on the realm, 48 slots, soulbound items refused:
"That item is bound to Wren."). Search, sort, **Deposit all materials** button, gold is **not** stored
(page 08). Drag between bags and bank; Shift+right-click moves a stack.

### 12.8 `scr_trade` — player-to-player trade

(new) Two columns, 8 item slots each + gold field. Each side has **Lock** then **Trade**. Changing
anything after a lock unlocks both sides. Red warnings: "Mira changed the offer." / "This item will be
soulbound to Mira." Refusals: "Soulbound items cannot be traded." / "Too far away (max 10 m)." /
"{name}'s bags are full." Timeout 5 minutes idle. Logged server-side (page 15).

### 12.9 `scr_trading_post` — player market

(new) **Open:** Trading post NPC in Highcourt and hubs from Sunscar up. **Unlock:** 11, quest
`q_hc_keys_to_the_city` (page 07 calls it the **market**).
Tabs: **Browse**, **Sell**, **My listings**, **History**.

| Element | Values / shows |
|---|---|
| Search | name box + filters: Category (**All**, Weapons, Armour, Jewellery, Consumables, Materials, Recipes, Mounts, Appearance), Slot, Armour type, Rarity (**Any**…Legendary), Level range min–max, "Usable by me" checkbox |
| Results | icon, name, level, rarity, quantity, price each, seller (hidden, page 15), time left (Short <2 h, Medium 2–12 h, Long 12–48 h); sort by price/name/level/time |
| Buy | **Buy** with quantity for stacks; confirm over 10% of your gold |
| Sell | drag an item in; suggested price from the last 20 sales; duration dropdown **12 h**, 24 h, 48 h; deposit fee and the cut shown ("Deposit 20s · 5% on sale") — page 15 owns rates |
| My listings | cancel (deposit lost) |
| History | your sales and buys, 30 days |

Soulbound, quest and class-set items (page 15) are refused with the reason. Sales arrive by mail.

### 12.10 `scr_gambler` — gambler

(reuse+: farhold `js/town.js` `CRATE_TIERS`, `gamble()`; page 08 §12.7 owns crates and prices) **Open:**
talk to `npc_gambler` (towns of size 3+). **Unlock:** 1. One row per sealed crate — **Plain** (Common
floor), **Marked** (Uncommon), **Sealed** (Rare), **Warded** (Epic) — each with its floor, "{n}% chance of
one tier better", and the price at your level. **Buy** opens the crate at once through `scr_loot_popup`. Refusal: "That crate is
{price} and you have {gold}."

### 12.11 `scr_tinker_toolbelt` — Tinker toolbelt

(new; [classes/tinker.md](classes/tinker.md) §2.1) **Open:** Tinker only — `E` at any Workbench (towns,
camps), or the **Toolbelt** button on the Spellbook out of combat. **Unlock:** 20 (Tinker Calling II).
Three columns, one per gadget — **Cog Sentry**, **Springtrap Mine**, **Iron Walker** — each listing its
models as cards with their numbers (from the class file); the chosen one is ticked. Clicking another model
starts a **5 s** change bar (cancelled by combat). Refusal in combat: "Change models out of combat."

### 12.12 `scr_enchanter` — enchanter (glyphs)

(new; page 08 §14 owns glyphs) **Open:** talk to `npc_enchanter` (every hub). **Unlock:** 20 (rank I
glyphs; ranks II and III at 40 and 60). Left: glyph list filtered by **slot** (main hand, off hand, chest,
back, legs, feet, rings) with rank I / II / III columns and "price: gold + materials". Right: **Apply to…**
— pick a worn or bagged item of that slot; the card shows its current glyph and "This replaces {old
glyph}." (one glyph per item). Glyph scrolls can also be bought to trade.

### 12.13 `scr_wardrobe` — wardrobe

(new; page 08 §21 owns the rules) **Open:** talk to `npc_wardrobe_keeper` or a glamourist in any hub.
**Unlock:** 25, quest `q_ww_the_moonwell_mirror` (page 07). Left: the doll (15 slots, page 08). Middle:
collected looks for the selected slot, filtered to the same slot and an armour type you can wear (weapons:
same type). Right: the live 3D figure. Each change shows its cost ("5% of the item's sell price", page 07;
page 08 §18.3); **Remove look** is free. **Dyes**: three channels per armour piece (main, trim, metal).
**Hide** toggles for head, shoulders, back and light. **Outfits**: save and swap full looks out of combat.

### 12.14 `scr_jeweller` — jeweller

(new; page 08 §9 owns sockets and gems) **Open:** talk to `npc_jeweller` (hubs from Greyridge north and
Highcourt). Tabs: **Socket** (pick an item with a socket, then a gem from your bags; the card shows the
stat it adds), **Remove** (take a gem out — free, the gem comes back whole), **Combine** (upgrade gems a
grade; prices from page 08). Radiant gems show "Needs level 60 to socket." when you are lower.

### 12.15 `scr_vault` — weekly vault

(new; page 08 §12.9) **Open:** the vault in any hub town. Three rows — **Mythic+**, **Raid**, **World** —
each with three slots that open as you pass its thresholds this week (e.g. Raid: 2 / 4 / 6 bosses). An
open slot shows an item offered for you, with its item level. Pick **one** item from everything offered,
once a week; the choice resets Wednesday 07:00 server time. **Empty:** "Do a Mythic+ run, a raid boss or a
world boss this week and something will be waiting here."

### 12.16 `scr_stable` — stable

(new; page 08 §20.1 owns mounts) **Open:** talk to `npc_stablemaster` (hubs). **Unlock:** 10, quest
`q_hc_saddle_and_bridle` (Riding I, page 07). Tabs: **Buy** (the stablemaster's mounts: name, creature,
speed as a multiplier on the walk, jump, gallop time, level needed, price), **Stable** (every mount look you
have learnt, account-wide: pick one to show on your equipped mount item — its affixes stay), **Training**
(your riding rank and the speed cap it allows — Riding I 8.6 m/s, II–IV 10.8 m/s on the ground, IV 13.5 m/s
in the air — with the next rank's quest and level: 20, 40, 60).

---

## 13. System screens

### 13.1 `scr_settings` — settings

(reuse+: farhold `js/settings.js`; **[page 04](04-SETTINGS.md) owns every option, value and default**)
Farhold's settings were one scrolling list of groups (Controls, Picture, Audio, Debug, Keys). Wildmarch
makes it a window with a tab rail: **Gameplay**, **Controls**, **Keys** (`scr_keybinds`), **Interface**,
**Combat**, **Graphics**, **Audio**, **Chat**, **Social**, **Accessibility**, **Debug**. Control kinds
stay Farhold's: toggle (On/Off), choice (button group or dropdown), range (slider + value). Footer:
**Defaults for this tab**, **Reset everything** (two-click "Sure? Click again"), "Saved to your account"
(settings move from localStorage to the account, keys `set.<tab>.<key>`). Changes apply live;
graphics changes that need a reload say "Takes effect after a reload. [Reload now]".

### 13.2 `scr_keybinds` — key binding window

(reuse+: farhold settings Keys group; **[page 02](02-CONTROLS.md) owns the binding table**) A table of
every action: label, primary key, secondary key, gamepad button. Click a key cell → "Press the key you
want. Escape leaves it as it was." Binding a key another action has **swaps** them and says so ("Damage
meter moved to {old key}."). Never-bind keys: Esc, F11, F12 (Farhold `NEVER_TAKE`; page 02 §10 takes
**F5** for party member 5 and allows **Tab** for target cycling), and the browser shortcuts page 02 lists
as unstoppable (Ctrl+W, Ctrl+T, Ctrl+N, Ctrl+Tab, Ctrl+1–9). Search box; category filter (**All**, Movement, Combat, Spells, Targeting,
Windows, Chat, Camera, Group, Other); **Reset keys**. A row moved from default shows "Normally {key}".
Only changed keys are saved (Farhold delta rule).

### 13.3 `scr_help` — help and tutorial overlay

(new) Two parts:

- **First-run tips** (the tutorial): small anchored callouts that point at a HUD element the first time
  it matters, one at a time, max one per 20 s, never in combat: "This is your health. Out of combat it
  refills." → the action bar at the first cast → "A red circle on the ground: step out before it fills"
  the first time a danger zone appears near you (the telegraph briefly pauses **only in Hearthvale's
  first 2 levels**, proposal) → minimap → quest tracker → bags at first loot → unlock cards thereafter.
  Each tip: text, **Got it**, "Turn tips off" (page 04 `set.interface.tips`). Progress saved per
  character; Settings → **Show all tips again**. (Farhold's `js/onboarding.js` step line is the pattern.)
- **Help window** (`/help`, or Game menu → Help & keys; no default key — `F1` targets yourself, page 02):
  a searchable book with chapters: Getting started, Controls (live from the
  binding table), Combat, **Reading the ground** (the telegraph legend §14.4 with animated examples),
  Groups & loot rules, Classes (links to the class cards), Items & rarity, Travel, Online manners &
  reporting, Browser & performance, Credits. **Report a bug** button (copies location + version + last
  50 log lines, reuse: farhold map "Copy location").

### 13.4 `scr_game_menu` — game menu (Esc)

(reuse+: farhold `#pause`) Centre card, does **not** pause the game.

| Button | Does |
|---|---|
| Resume | closes |
| Settings | `scr_settings` |
| Key bindings | `scr_keybinds` |
| Edit HUD layout | HUD edit mode (§4.1) |
| Help | `scr_help` |
| Account | `scr_account` |
| Log out | back to `scr_char_select` after a 10 s camp timer when not in an inn ("Logging out in 10… [Cancel]"; instant in an inn or city) |
| Exit to login | same timer, to `scr_login` |
| Quit | same timer, closes the tab when allowed |
| ← Playground | link (dev builds only) |

Under the buttons: realm, ping, played time this session, and the controls summary built from the real
bindings (Farhold round 17 fix: the pause list read the table, not static text).

---

## 14. UI style

### 14.1 Palette tokens

Wildmarch uses **Emberveil's leather-and-gold** theme (the playground's dark-fantasy look, already used
by `shared/rewards.js`) on **Farhold's pane anatomy** (rail, header, panes, the round-10 sizes). Tokens
live on `:root` in `css/tokens.css`:

| Token | Value | Use |
|---|---|---|
| `--ink` | #0b0908 | page background |
| `--panel` | #171210 | window background (leather tile `panel_tile.svg` at 150 px) |
| `--panel2` | #221a15 | rows inside a pane |
| `--panel3` | #2c2119 | hover row |
| `--line` | #3a2c1e | soft divider |
| `--line2` | #54401f | pane border |
| `--gold` | #d9a641 | titles, selected tab bar, focus |
| `--gold-bright` | #f2d27a | headings, numbers that matter |
| `--gold-dim` | #6d5326 | disabled gold, tooltip border |
| `--ember` | #ff7a1a | accent, primary buttons, boss speaker |
| `--ember-soft` | #ffb060 | hover glow |
| `--ember-deep` | #8a2f08 | primary button bottom |
| `--text` | #ded3c4 | body text |
| `--muted` | #9a8d7c | secondary text |
| `--parch` | #e7dcc2 | parchment surfaces (quest text, map key) |
| `--good` | #8fd08a | gains, ✓, "can" |
| `--bad` | #e07070 | refusals, losses |
| `--info` | #8fb6e8 | neutral info, links |
| `--tip-bg` / `--tip-fg` / `--tip-line` / `--tip-strong` | #16110d / #ece3d2 / #6d5326 / #f0c46a | tooltip box |
| `--xp` | #b080ff (rested) / gold fill for XP | XP bar |
| `--hp` / `--mana` / `--fury` / `--focus` | #3fbf5a / #4f7fff / #d8452e / #e0a030 | resource bars |
| `--rail` `--head` `--gap` `--pad` `--pane-r` `--doll` `--card` | 208 / 64 / 14 / 20 / 6 / 372 / 360 px | Farhold round-10 sizes |

Panels: 1 px `--line2` border, radius 4, inner shadow `inset 0 0 60px rgba(0,0,0,.75)`; framed windows get
the four gold corner flourishes (`frame_corner.svg`, 24 px, Emberveil `decorateFrames()`). Buttons:
leather gradient `#2b211a→#1b1410`; **primary** `#d1741c→#8a3d08` with dark text; danger buttons
`#4a2418` bg / `#a04a2a` border / `#ffd0b8` text (Farhold's "Sure?" style).

### 14.2 Fonts

| Role | Font | Size |
|---|---|---|
| Display (window titles, banners, level-up, zone names) | **Cinzel** 500/600/700 (Google Fonts, OFL) | 14–56 px, tracked .04–.12em |
| Body (all UI text, tooltips, chat) | **Spectral** 400/600/italic (OFL) | 13 px base (UI), 12 px floor |
| Numbers on frames and bars | Spectral with tabular-nums | — |
| Monospace (combat log timestamps, debug, coordinates) | `ui-monospace, Consolas, monospace` | 12 px |
| Floating combat text | a heavy sans (`system-ui` 700) for legibility at speed | 14–23 px |

Fallbacks: "Palatino Linotype", Georgia, serif. Fonts are loaded from Google Fonts (allowed) and cached.

### 14.3 Rarity colours

Canon rarities with Farhold's colours (Farhold names in brackets):

| Rarity | Colour | Gem art | Border/glow |
|---|---|---|---|
| Common [normal] | #c9c2b6 | `rarity_common.svg` | none |
| Uncommon [magic] | #7f95ff | `rarity_uncommon.svg` | none |
| Rare | #e8d020 | `rarity_rare.svg` | soft glow on reward cards |
| Epic [legendary] | #ff8020 orange | `rarity_legendary.svg` (Farhold's legendary gem) | glow |
| Unique | #ff5a3c | `rarity_unique.svg` | glow + "Unique" tag |
| Set | **#2fc4b2** teal | `rarity_set.svg` | glow + "Set piece" tag |
| Legendary (new top tier) | **#c86bff** violet | `rarity_mythic.svg` (new art, page 08 §4 / page 17) | glow + animated shimmer on the name and edge of the item card |

Canon 00 §4 and page 08 §4 own these colours. Farhold's "legendary" tier is Wildmarch's **Epic**, so it
keeps Farhold's orange; Wildmarch's **Legendary** is a new tier in violet.

Note: `shared/rewards.css` uses #45d07a for Set while Farhold `style.css` and Emberveil use #2fc4b2;
Wildmarch picks **#2fc4b2** and the shared file should follow (see report). Enemy rank colours are a
separate table (§4.4) so a "rare" enemy is never confused with a "Rare" item.

### 14.4 Telegraph colour legend

The one legend shown in Help, the loading tips and the instance journal (page 11 owns the rules):

| Icon | Colour | Name | Meaning in one line |
|---|---|---|---|
| ⬤ fill from edge | RED #e0302a | Danger zone | Leave before it fills. Hits once. |
| ◌ swirl | PURPLE-BLACK #2a0a3a / #a050e0 | Void zone | Hurts every 0.5 s while you stand in it. |
| ◎ with pips | ORANGE #ff9020 | Soak | Needs N players inside or it hits everyone. |
| ◯ double ring | BLUE #3a8aff | Safe zone | Be inside when the cast ends. |
| ◉ with a name | YELLOW #ffd24a | Targeted | Follows one player. Move away from others. |
| ✚ circle | GREEN #40d060 | Beneficial | Stand in it for a buff or heal. |
| ── line | WHITE #ffffff | Tether | Break it by distance, or keep it, per mechanic. |

Journal ability icons combine this colour with a shape glyph: circle, donut, cone, line, cross, wave,
checkerboard, room-wide (8 small SVGs, `assets/data/ui/tg_<shape>.svg`, new).

### 14.5 Icon style

- **Spell icons:** 64×64 SVG, one per spell (180 + alternates), drawn in the fx sprite style
  (`assets/data/fx/*.svg`: flames, shards, runes, claws, slashes, bolts) on a round-cornered square
  whose background is the element colour at 30% (§4.15 element tints) and whose border is the class
  colour. Flat shapes, 2 px dark outline, one highlight; readable at 32 px. No text in icons.
- **Item icons:** 64×64 SVG rendered from the item's Chibi 2 model at load (a snapshot per base, cached)
  on a rarity-tinted backdrop; Farhold items had no art, so this is new.
- **UI glyphs:** Font Awesome 6 Pro (owner's licence, `~/claude/resources/fontawesome-pro-6.7.2-web/`)
  as SVG for window/micro-menu icons; Emberveil `assets/data/ui/*.svg` for slot silhouettes, tabs,
  rarity gems, level-up rays, coins.
- **Class colours** (name text, portrait rings): 30 distinct hues defined on page 06; this page needs
  each to pass 4.5:1 contrast on `--panel`.

### 14.6 Sounds per UI action

All from `sfx/js/sfx.js` (`Sfx.create({ method })`, the catalog ids), UI bus with its own volume
(page 04):

| Action | Sound id |
|---|---|
| Hover a button / row | `ui.hover` (throttled 1 per 60 ms) |
| Click | `ui.click` |
| Switch tab | `ui.tab` |
| Open a window | `ui.open` |
| Close a window | `ui.close` |
| Refused / error / "not enough" | `ui.error` |
| Equip | `equip` |
| Loot by rarity | `loot.common`, `loot.uncommon`, `loot.rare`, `loot.epic`, `loot.legendary` (Unique/Set use `loot.legendary`) |
| Gold | `coin` |
| Level up | `levelup` |
| Quest complete / unlock card | `quest.complete` |
| Revive accepted | `revive` |
| Boss banner by telegraph colour | red: `night.ambush`; others: `bell.toll` pitched per colour (new ids `ui.warn.<colour>` proposed for page 17) |
| Whisper received | `ui.open` pitched up (new id `ui.whisper` proposed) |
| Group found / ready check | `bell.toll` |
| Loot roll window | `ui.open` + rarity sting |

### 14.7 Motion

Windows fade 120 ms; cards scale 0.96→1 in 180 ms; banners slide 200 ms; nothing bounces. Reduced
motion removes slides, shakes and the chest animation. Hit-stop and screen shake are combat settings
(page 04, Farhold round 14), not UI.

### 14.8 Performance budget for the UI

- HUD updates run at 10 Hz for text and 60 Hz only for bars and cast sweeps.
- Raid frames: 20 rows updated from one diff per server tick, never rebuilt.
- Nameplates: max 40 drawn; beyond, the nearest 40 plus every boss and target.
- Chat: max 500 lines per tab in the DOM; older lines kept in memory.

### 14.9 Phone and tablet stance

**Proposal: Wildmarch v2 is desktop-only** (Windows/Mac/Linux browser, keyboard + mouse, gamepad
optional per page 02, minimum 1280×720). Reasons: mouse-look + 6 spells + dodge + targeting in boss
fights with telegraphs needs precise input; the HUD at 1280×720 is already dense; the owner's
playground games are desktop-first.

What a phone/tablet gets:
- `scr_boot` detects a touch-only device under 1024 px and shows: "Wildmarch is played on a computer
  with a keyboard and mouse. You can still log in here to read your character." + **Log in**.
- A read-only **companion view** (later, not v2 core): character sheet, bags (no moving), achievements,
  guild roster and chat, mail read. Built from the same screen components in their ≤1120 px one-column
  layout (Farhold's sheet already stacks).
- Tablets with a keyboard and mouse attached play normally.

---

## 15. Notes for other pages

- **Page 02:** ~~every key proposed here needs a row: `C` Gear, `B` Bags, `I` Bags (alias), `P` Spells,
  `N` Talents, `K` Perks, `U` Unlocks, `L` Journal, `M` Map, `J` Instance journal, `G` Groups, `O`
  Party, `Shift+O` Social, `Y` Guild, `Shift+M` Meter, `F1` Help, `F10` Settings, `Esc` Game menu,
  `Shift+F` Set focus, `Alt+click` ping, `Ctrl+Shift+H` HUD edit, `Shift+1..4` form bar, `Q` dodge,
  `R` potion, `T` mount, `Z` light, `Tab` target cycle, `Enter` chat.~~ **Resolved (00 §10):** this page
  now uses page 02's table (`C` `I` `K` `N` `J` `Shift+J` `U` `P` `M` `Shift+M` `O`/`F10`, `Y` focus, `F`
  dodge, `H` mount, `L` light, `Q`/`G` class keys, `Shift+1`–`4` forms/borrowed bar, `Alt+1`–`4` dialog).
  Still open for page 02: a key for **HUD edit mode** (was `Ctrl+Shift+H`), the Enchanter's **Hold here**
  on the borrowed bar, and rows for `Alt+1`–`Alt+4` (page 02 §5.12 still describes E-hold + 1–3).
- **Page 04:** every option named here (`set.interface.ui_scale`, `minimap_rotate`, `tracker_max`,
  `tips`, `set.combat.boss_hints`, health text mode, FCT per kind, nameplate range/overlap, raid frame
  options, colour-blind mode, latency shading, chat timestamps, profanity filter, fog of war).
- **Page 07:** ~~the unlock levels used here for windows (group finder 10, guild 10, mail 8, bank 3,
  trading post 15, focus frame 10, meter 6, raid frames 30, instance journal 5) are proposals.~~
  **Resolved (00 §10):** page 07's ladder is used — group finder and dungeon journal 6, guild join 1 /
  found 15, bank/mail/market 11, crafting 9, mount 10, wardrobe 25, dual spec 30, Renown 60. Focus frame
  and damage meter follow page 02 (level 1); raid frames 30.
- **Page 08:** ~~slot list (16 vs Farhold's 10 combat slots), currency denominations, durability,
  transmog yes/no, bag sizes, bank prices.~~ **Resolved (00 §10):** 15 slots (page 08 §2.1), coins
  100 copper = 1 silver, 100 silver = 1 gold, currencies per 00 §10, the wardrobe exists (level 25).
  Still open: durability numbers, bag sizes and bank prices (page 08).
- **Page 11:** ability flags `important`, `interruptible`, `wipe`, per-mechanic tether rules, dialog
  timers; the banner sound ids.
- **Page 15:** realm types, name rules list, loot rules, trade/auction fees, mail postage, meter
  privacy, report pipeline.
- **Page 16:** `tests/ui-index.test.js` (every `scr_` id exists), the UI profile saved per character.
