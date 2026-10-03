# WILDMARCH — Design Bible, page 03: UI screens

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). Nothing is built. This page lists every screen, panel, tab, window,
popup, tooltip, card, dropdown and HUD element in Wildmarch. It **owns** screen ids (`scr_<snake>`) and
the HUD layout. Keys are owned by [page 02](02-CONTROLS.md), options by [page 04](04-SETTINGS.md),
unlock levels by [page 07](07-PROGRESSION.md) §Feature ladder, the telegraph language by
[page 11](11-BOSS-MECHANICS.md) and online rules by [page 15](15-SOCIAL-ONLINE.md). Where this page
names a key or an unlock level, it is the owner page's value; if the owner page differs, the owner wins
and this page is corrected. **Reconciled with [page 00](00-OVERVIEW.md) §10 on 2026-09-29:** keys follow
page 02's binding table, unlock levels follow page 07's ladder, slots/rarities/currencies follow page 08. **Round 2 (00 §12) applied
on 2026-09-30:** raid screens, raid frames, the currency tab, the timed-key UI, rested XP, Renown, daily and
weekly boards, the loot master, the weekly vault, flight-path travel and the light slot are gone (raids
and raid frames are parked in `WISHLIST.md`); Tab targeting, the item card with its 3D portrait and
special rarities, sockets, tags, magic find, professions, Travel Methods, the Recall Stone, the Second
Loadout and the Dungeon Finder's Depth picker are new.

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
| `hud_travel` | Travel strip while riding a Travel Method | boarding one | 12 | (new; §4.19) |
| `scr_unlock_card` | Unlock card | reaching an unlock | 1 | (reuse+: `shared/rewards.js`) |
| `scr_levelup` | Level-up card | gaining a level | 1 | (reuse+: `shared/rewards.js`) |
| `scr_loot_popup` | Chest / quest reward popup | opening a chest, quest reward | 1 | (reuse: `shared/rewards.js`) |
| `scr_loot_panel` | Personal loot panel (was `scr_loot_roll`; canon is personal loot) | a kill gives you an item | 1 | (new) |
| `scr_item_card` | The item card (every item tooltip, loot card and chat link hover) | hover any item | 1 | (reuse+: farhold `itemCard`, `js/figure3d.js`; §7.2.1) |
| `scr_death` | Death screen | health hits 0 | 1 | (new) |
| `scr_revive_offer` | Revive offer popup | an ally casts a revive on you | 1 | (new) |
| `hud_dialog_choice` | Boss dialog choice panel (was `scr_boss_dialog`) | a boss opens a dialog opportunity; answer with `Alt+1`–`Alt+4` | 5 (first dungeon) | (new; page 11 §10 owns the rules) |
| `scr_confirm` | Generic confirm dialog | any destructive action | 1 | (new) |
| `scr_invite` | Invite / ready check / Guiding Call / duel popups | another player | 1 | (new) |
| `scr_sheet` | Character sheet shell + tab rail | any sheet tab key (`C`, `I`, `K`, `N`, `U`, `J`, `L`) | 1 | (reuse+: farhold `#sheet`) |
| `scr_sheet_gear` | Gear (paper doll + stats + magic find) | sheet tab 1, `C` | 1 | (reuse+: farhold Character tab) |
| `scr_sheet_bags` | Inventory + bags | sheet tab 2, `I` | 1 | (reuse+: farhold Inventory tab) |
| `scr_sheet_spells` | Spellbook (with the Utility strip) | sheet tab 3, `K` | 1 | (reuse+: farhold Skills tab) |
| `scr_sheet_talents` | Talents (a tab inside the Spellbook) | Spellbook → Talents, `K` | 12 | (reuse+: farhold `#sheet-skilltree`) |
| `scr_sheet_perks` | Perk forest | sheet tab 4, `N` | 2 | (reuse: farhold Perks tab) |
| `scr_sheet_unlocks` | Unlocks (the feature ladder) | sheet tab 5, `U` | 1 | (new) |
| `scr_sheet_reputation` | Reputation (the seven factions) | sheet tab 6 | 3 | (reuse+: farhold journal "Who holds this ground") |
| `scr_sheet_collections` | Collections: mounts, titles, appearance | sheet tab 7 | 1 | (new) |
| `scr_sheet_achievements` | Achievements | sheet tab 8 | 1 | (new) |
| `scr_sheet_journal` | Quest log / journal | sheet tab 9, `J` | 1 | (reuse+: farhold Journal tab) |
| `scr_professions` | Professions: Harvesting + your crafting profession | sheet tab 10, `L` | 9 | (new; §7.11; page 19 owns the rules) |
| `scr_profession_choose` | Choose your profession dialog | a profession trainer, or the Professions tab before you have one | 9 | (new; §7.11.1) |
| `scr_loadout` | Second Loadout switch and editor | the sheet header's Loadout switch; a trainer | 30 | (new; §6.1; page 07 owns the rules) |
| `scr_bestiary` | Bestiary | Journal → Bestiary tab | 1 | (new; requested by page 10 §11) |
| `scr_world_boss_tracker` | World boss timers | Journal → World bosses tab, or Dungeon journal → World bosses | 1 | (new; requested by page 13 §8.2) |
| `scr_map` | World map | `M` | 1 | (reuse+: farhold `js/map.js`, `js/markers.js`) |
| `scr_instance_journal` | Dungeon journal | `Shift+J`, or a dungeon door | 6 (quest `q_hv_the_barrow_bell`) | (new) |
| `scr_dungeon_finder` | Dungeon Finder | `P` (Social → Dungeon Finder tab) | 6 (quest `q_hv_the_barrow_bell`) | (new) |
| `scr_party` | Party management | `P` (Social → Party tab) | 1 | (new) |
| `scr_leader_tools` | Group leader tools (was `scr_raid_leader`) | Party tab → Leader tools, `Shift+P` | 1 | (new) |
| `scr_loot_limits` | Weekly loot limits (was `scr_raid_lockouts`) | Party tab → Loot limits | 60 | (new; Challenge bosses and world bosses only, canon W5) |
| `scr_guild` | Guild window | `P` (Social → Guild tab) | 1 to join · 15 to found (quest `q_hc_a_name_on_the_rolls`) | (new) |
| `scr_social` | Friends / ignore / recent | `P` (Social → Friends tab) | 1 | (new) |
| `scr_mail` | Mailbox | a mailbox object | 11 (quest `q_hc_keys_to_the_city`) | (new) |
| `scr_trading_post` | Trading Post (player market) | Trading Post NPC | 11 (quest `q_hc_keys_to_the_city`) | (new) |
| `scr_vendor` | Vendor | talk to a merchant | 1 | (reuse+: farhold `js/talkui.js` trade block) |
| `scr_gambler` | Gambler (sealed crates) | talk to `npc_gambler` | 1 | (reuse+: farhold `js/town.js` `gamble()`; requested by page 08 §12.7) |
| `scr_enchanter` | Enchanter NPC (glyphs) | talk to `npc_enchanter` | 20 (glyph rank I) | (new; requested by page 08 §14) |
| `scr_jeweller` | Socketing (Gem, Jewel, Soul, Gadget) | talk to `npc_jeweller` | first socketed item | (new; page 08 owns sockets) |
| `scr_wardrobe` | Wardrobe (change an item's look) | talk to `npc_wardrobe_keeper` / a glamourist | 25 (quest `q_ww_the_moonwell_mirror`) | (new; requested by page 08) |
| `scr_stable` | Stable | talk to `npc_stablemaster` | 10 (quest `q_hc_saddle_and_bridle`) | (new; requested by page 08 §20.1) |
| `scr_trainer` | Trainer and Unbinder | talk to a class trainer or `npc_unbinder_*` | 1 (Unbind tab 12) | (reuse+: farhold `js/retrain.js`, talkui Unbinder block) |
| `scr_craft_bench` | Profession station (craft + salvage) | `E` at a forge, loom, tannery, bench… | 9 | (reuse+: farhold Crafting + Upgrade tabs; page 19) |
| `scr_tinker_toolbelt` | Tinker Toolbelt (Device models) | Tinker only: a Workbench, or the Spellbook's Toolbelt button out of combat | 20 (Tinker Calling II) | (new; requested by `classes/tinker.md` §2.1) |
| `scr_bank` | Bank | banker NPC | 11 (quest `q_hc_keys_to_the_city`) | (new) |
| `scr_trade` | Player-to-player trade window | right-click a player → Trade | 5 | (new) |
| `scr_talk` | NPC conversation | `E` on an NPC | 1 | (reuse+: farhold `js/talkui.js`) |
| `scr_notice_board` | Notice board | `E` on a board | 1 | (reuse: farhold `#noticeboard`) |
| `scr_quest_offer` | Quest offer card | from `scr_talk` | 1 | (reuse+: talkui Work block, `js/questrewards.js`) |
| `scr_quest_turnin` | Quest turn-in card | from `scr_talk` at the turn-in NPC | 1 | (reuse+: `js/questrewards.js`; requested by page 14 §5.6) |
| `scr_quest_reward_choice` | Pick-your-reward panel | a turn-in with a `choice`, `pick3` or `class_pick` reward | 1 | (reuse: `shared/rewards.js` choose mode; requested by page 14 §5.6) |
| `scr_travel_station` | Travel Method station board | `E` at a station sign or keeper | 12 | (new; §12.17; page 20 owns routes) |
| `scr_retrace_map` | Chronomancer Retrace map | Spellbook → Retrace map, or casting Retrace | Chronomancer, class file level | (new; §12.19; `classes/chronomancer.md`) |
| `scr_recall_bind` | Bind the Recall Stone dialog | `E` at a town waystone or safe landmark → Bind | 7 | (new; §12.18) |
| `scr_meter` | Damage meter | `Shift+M` or chat-box button | 1 | (reuse+: `meters/js/meter-ui.js`) |
| `scr_threat_meter` | Threat meter | Damage meter → Threat, or its own dock | 1 (shown in a group) | (reuse+: `meters/js/meter-ui.js`; requested by page 05 §13.7) |
| `scr_combat_log` | Combat log | chat tab "Combat", or sheet journal | 1 | (reuse+: farhold Log tab, `LOG_KINDS`) |
| `scr_settings` | Settings | `O` (alt `F10`), or Game menu | 1 | (reuse+: farhold `js/settings.js`) → [page 04](04-SETTINGS.md) |
| `scr_keybinds` | Key binding window | Settings → Keys | 1 | (reuse+: farhold settings Keys group) → [page 02](02-CONTROLS.md) |
| `scr_help` | Help & tutorial overlay | `/help`, Game menu → Help & keys, first-run tips | 1 | (new) |
| `scr_game_menu` | Game menu | `Esc` with nothing open | 1 | (reuse+: farhold `#pause`) |
| `scr_report` | Report a player | right-click a name → Report | 1 | (new) |
| `scr_spell_chooser` | New-spell card (was Farhold's spell chooser) | a spell slot opens (4, 10, 18, 28, 40) | 4 | (reuse+: farhold `onChooseSpell`) — no choice in v2, see §5.3 |

Seventy-seven entries: 74 screens plus three HUD panels that behave like popups (`hud_warning_banner`,
`hud_dialog_choice`, `hud_travel`); every other HUD element is in §4.2. A test (`tests/ui-index.test.js`,
page 16) asserts every id here exists in the DOM build and every id in the DOM is listed here.

**Removed in round 2** (canon 00 §12; the ids must not come back): `scr_currency` (gold only, W19/W26),
`scr_renown` (W13), `scr_loot_master` (personal loot only, W5/W18), `scr_raid_leader` → `scr_leader_tools`,
`scr_raid_lockouts` → `scr_loot_limits`, `scr_vault` (it paid out timed-key, raid and PvP rewards, W3/W6),
`hud_raid` (raid frames, W16 → `WISHLIST.md`), `hud_focus` → `hud_watch`.

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
| `scr_instance_journal` | 07, 12, 13 | `scr_dungeon_journal` |
| `scr_meter` | 05 | `scr_damage_meter` |
| `scr_craft_bench` | 08 | `scr_bench` |
| `hud_quest_tracker` | — | was `hud_tracker` on this page |
| `hud_boss_frame` | — | was `hud_boss` on this page |
| `hud_dialog_choice` | 13 | `scr_dialog_choice`; was `scr_boss_dialog` on this page |
| `hud_watch` | 02 | the watch target frame; was `hud_focus` on this page |
| `scr_dungeon_finder` | 02 (old), 12, 15 | `scr_group_finder` (the first draft's id) |
| `hud_warning_banner` | — | was `scr_boss_banner` on this page |

---

## 2. Rules every screen follows

### 2.1 Layers (stacking order)

Taken from Farhold's round-10 order (`research/ui-round10-design.md` §1.1) and extended.

| z | Layer | Notes |
|---|---|---|
| 5 | `scr_telegraph_layer` | drawn in the 3D scene, not DOM; listed for completeness |
| 8 | nameplates, floating combat text | DOM over the canvas, under the HUD |
| 10 | `scr_hud`, `hud_travel` | unit frames, bars, minimap, chat |
| 20 | `hud_warning_banner`, loot toasts | never block a click; `pointer-events: none` |
| 34 | `scr_sheet` and every full-screen window | one at a time |
| 35 | `scr_talk`, `scr_vendor`, `scr_trainer`, `scr_bank`, `scr_mail`, `scr_trade`, `scr_craft_bench`, `scr_gambler`, `scr_enchanter`, `scr_jeweller`, `scr_wardrobe`, `scr_stable`, `scr_travel_station`, `scr_recall_bind`, `scr_profession_choose` | NPC and station windows |
| 38 | `scr_settings`, `scr_keybinds` | must draw over the open sheet |
| 45 | `scr_map`, `scr_instance_journal` | must draw over the open sheet |
| 55 | `scr_loot_panel`, `hud_dialog_choice`, `scr_invite`, `scr_revive_offer` | timed popups; never behind a window |
| 60 | `scr_game_menu`, `scr_death` | |
| 900 | `scr_loot_popup`, `scr_unlock_card`, `scr_levelup` | reward cards |
| 950 | `scr_confirm` | always on top of what asked for it |
| 9000 | tooltip box, `scr_item_card` | `shared/tooltip.js` |

### 2.2 Windows, cursor and Esc

- Wildmarch is a **free-cursor** game when a window is open and a **mouse-look** game when none is
  (Farhold's pointer lock). Opening any window at z 34+ releases pointer lock; closing the last one
  re-grabs it (Farhold's `regrabPointer()` retries at 140, 420 and 1300 ms). *(reuse: farhold hud.js)*
- **Combat never pauses.** This is an online game. Farhold paused the world when the sheet was open;
  Wildmarch does not. Every window is drawn at 94% opacity with the world visible behind the sheet's
  left rail gap, and the unit frame, party frames, cast bar and boss frame **stay on top of any window
  at z 34–35** (they are re-parented into a `#hud-over` strip), so you can see you are being hit.
- **Esc closes the top-most thing**, one per press: confirm → popup → window → sheet → map → nothing
  open opens `scr_game_menu`. Esc never closes `scr_death` or `hud_dialog_choice` (those have their own
  buttons and timers).
- Only one full-screen window at z 34 at a time. Opening a second one replaces the first; NPC windows
  (z 35) may sit beside the sheet (the bag opens next to a vendor automatically).
- Windows remember their last tab per character (saved server-side with the character's UI profile,
  page 16).

### 2.3 Tooltips

*(reuse: `shared/tooltip.js`)* One engine for every tooltip in the game. 150 ms delay; follows the
pointer 14 px off; flips at the right/bottom edge with an 8 px margin; keyboard focus hangs the box
under the element. Attributes: `data-tip` (plain text), `data-tip-html`, `data-tip-render="<name>"`
(a registered renderer), `data-tip-class`, `data-tip-off`. Renderers registered by Wildmarch:
`item` (the item card, §7.2.1), `slot`, `spell`, `talent`, `perk`, `stat`, `buff`, `unit`, `unlock`,
`achievement`, `rep`, `mapmark`, `telegraph`, `tag` (what a tag means and which of your bonuses read it),
`socket`, `recipe`, `route` (a Travel Method route). `refreshTip()` re-renders on Shift (compare the other
hand/ring). Tags show on every spell and item tooltip (§7.2.1, §7.3).

### 2.4 Screen sizes

- Minimum supported window: **1280×720**. Designed at 1920×1080. Reflow breakpoints are Farhold's:
  ≥1600 wide (rail 220, head 68, gap 16, pad 24, card 380); ≤1440 wide or ≤800 tall (rail 184, head 56,
  gap 10, pad 12, doll 332, card 320); ≤1120 wide = one column, rail becomes a top strip.
- **The page never scrolls. Only a pane body scrolls.** (Farhold round 10's rule, with
  `scrollbar-gutter: stable` so a list crossing the scroll threshold does not jump sideways.)
- **UI scale** setting 50–200% (page 04 `set.interface.uiScale`) multiplies every size above.
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
  live in page 04 (`set.access.telegraph_palette`).
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
"*The Dungeon Finder opens at level 6, with the quest {quest name}.*" (quest `q_hv_the_barrow_bell`, page 07), plays `ui.error`, and does nothing else. Its rail tab or
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
|             "Everyone starts with a stick. The Wildmarch decides the rest."    |
|                                                                                |
|                [=================------------]  62%                           |
|                reading the data...                                             |
|                                                                                |
|  v0.2.0 · build 2026-10-14                                    (c) Radley S.    |
+--------------------------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Title | "WILDMARCH" in Cinzel 56 px, gold, a warm glow behind | — | — |
| Tagline | the pillar quote from page 00, without the torch (torches are gone, canon 00 §12.3): "Everyone starts with a stick. The Wildmarch decides the rest." — see §15, canon change request | — | — |
| Progress bar | modules + data loaded, 0–100% | — | "{n} of {m} files" |
| Status line | one of: "reading the data…", "waking the voices…", "drawing the characters…", "finding the server…" | — | — |
| Version | client version + build date | click copies it | "Click to copy the version for a bug report" |
| Credit | "Radley Sustaire" | — | — |
| Sparks | 14 drifting spark sprites (reuse: the Emberveil prototype's `initEmbers()` function) | — | — |

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
| Armour: [All v]         |  playing the class's first  | Light armour · Tempo         |
| ------------------------|  spell on a loop against a  | Tame Beast + marks           |
| TANK                    |  training dummy             | [bow] [Can hold: bow, spear] |
|  Warrior    Tank/Dmg    |                             | Tames a beast of your choice.|
|  Paladin    Tank/Heal   |  [Play spell 1..6 buttons]  | SPELLS (6, by level)         |
|  Knight     Tank/Supp   |                             | Lv1  Piercing Shot  [chips]  |
|  ...                    |                             | Lv4  ...  (locked, greyed)   |
| DAMAGE ...              |                             | MECHANIC: grows at 6/20/40   |
+-------------------------+-----------------------------+------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Role filter | dropdown: **All**, Tank, Healer, Damage, Support | filters the list; a class shows under each role it can do — its primary role and its **hybrid** role (canon 00 §6) | — |
| Armour filter | dropdown: **All**, Cloth, Light, Medium, Heavy | — | — |
| Build filter | dropdown: **All**, Melee, Ranged, Caster | — | "How the class mainly fights" (canon 00 §6) |
| Resource filter | dropdown: **All**, Mana, Momentum, Tempo | — | "Mana: big pool, slow refill. Momentum: starts empty, builds as you hit and are hit, drains out of combat. Tempo: small pool, refills in about 4 s." (canon 00 §6) |
| Class list | 30 rows grouped by main role (headings TANK, HEALER, DAMAGE, SUPPORT, alphabetical inside), each: class icon, name, role tags (primary bold, hybrid plain), "companion" tag if it binds or tames one | click selects; ↑/↓ moves; the list keeps the dropdown-equivalent `#create-class` select as the one the form reads (reuse: farhold rule) | role + resource |
| Figure | class outfit (`class-outfits.json`), the chosen body | drag to turn | — |
| Spell preview buttons | 1–6: plays that spell's animation + spellfx on a dummy, 2.5 s loop | click | the spell card |
| Class card | name, main role, "Hybrid: {role}" with one line on how well (open world and Normal dungeons, page 06), build, armour, resource, mechanic name + one-sentence brief (page 00 §6), weapons ("Starts with a {weapon}", "Can hold {list}") | — | — |
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
| Difficulty tag (instances) | Normal · Challenge, plus "Depth {n}" when a Depth is set (page 12) | — | — |
| Tip | one tip from `data/tips.json`, picked for the player's level band and class (weights: 50% general, 30% class, 20% region) | ← / → cycles; tips already seen 3 times are skipped | — |
| Tip counter | "{n} / {total}" | — | — |
| Progress bar + status | same as `scr_boot` | — | — |
| Lore line (optional) | a one-line quote from page 01 about the destination | — | — |

Tip categories and examples (the full list lives in `data/tips.json`, ~140 tips; page 11 wording):
- Telegraphs: "A red fill growing from the edge in hits once when it reaches the middle. Leave before then."
- Soak: "An orange circle with 3 pips needs 3 people inside it, or it hits the whole group."
- UI: "Hold Shift over an item to compare it with your other ring or your off hand."
- Class: "Warriors: every Shield Bash stores a block charge. Watch the Bulwark gauge." (numbers from the class file)
- World: "A wagon sign by the road is a Travel Method station. Riders are safe from weather and enemies." (page 20)
- Loot: "A blue name is a champion pack: every one of them shares one extra power. A yellow name is a rare." (page 10)

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
| [WATCH FRAME]   buffs debuffs                                                    +--------------+
|                                                                                  Mossfen · 5–12 |
|[PARTY FRAMES]                          !! THE TIDE ANSWERS ME !!                  [QUEST TRACKER]|
| 4 members                              (boss warning banner)                     Main: ...      |
| hp mp role                                                                       [ ] 3/8 hides  |
| buffs                                                                            Side: ...      |
|                                                                                  [NEARBY]      |
|                                              + reticle                                          |
|                                                                                                 |
|                                    (floating combat text, nameplates in the world)              |
|                                                                                                 |
|[CHAT BOX 440x220]                   [PLAYER CAST BAR]                 [LOOT TOASTS stack up]    |
| tabs: General Party Guild Combat    [FORM BAR - druid etc.]            [UNLOCK CARD slot]       |
| lines...                            [MECHANIC GAUGE]                                           |
| [input]            [1][2][3][4][5][6] [Q][G] [F dodge][R potion][7-0 belt][H mount][Home] [ms fps]|
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
| Watch frame (the watch target, page 02 §2.7) | `hud_watch` | 1 | (new; was `hud_focus`) |
| Party frames | `hud_party` | 1 (shown in a party) | (new) |
| Boss frames + cast bars + break bar | `hud_boss_frame` | 1 (shown in a boss fight) | (reuse+: farhold `#boss-bar`; page 11 §7 owns the parts) |
| Player cast bar | `hud_castbar` | 1 | (reuse+: farhold `charge-meter`) |
| Action bar (6 spells) | `hud_actionbar` | 1 | (reuse+: farhold `#skillbar`) |
| Shared keys (basic attack, dodge, potion, potion belt, mount, Recall Stone) | `hud_utility` | per page 07 ladder | (new) |
| Mechanic gauge frame | `hud_gauge` | 6 (first calling quest) | (new) |
| Class gauges inside the frame | `hud_bulwark`, `hud_stance_dial`, `hud_oath`, `hud_quarry`, `hud_pet`, `hud_wounds`, `hud_devotion`, `hud_class_gauge` | 6 (per class file) | (new; §4.9.1) |
| Enemy view cones (Rogue Blind Spots; setting `set.combat.view_cones`) | `hud_viewcone` | Rogue from 1; any class that turns the setting on | (new; §4.9.1) |
| Borrowed bar (Enchanter's charmed enemy) | `scr_hud_borrowed_bar` | Enchanter only (class file) | (new; §4.9.2) |
| Form / stance bar | `hud_formbar` | class-specific | (new) |
| XP bar | `hud_xp` | 1 (at 60 it shows one tracked reputation instead; there is no rested XP and no Renown) | (reuse: farhold `.bar.xp`) |
| Buff / debuff rows | `hud_auras` | 1 | (reuse+: farhold `#hud-statuses`) |
| Minimap | `hud_minimap` | 1 | (reuse+: farhold `#minimap`) |
| Place line | `hud_place` | 1 | (reuse: farhold `#hud-place`) |
| Quest tracker | `hud_quest_tracker` | 1 | (reuse+: farhold `#hud-objective`) |
| Event tracker | `hud_event_tracker` | 1 (shown during a dynamic event) | (new; requested by page 14 §13) |
| Nearby panel | `hud_nearby` | 1 | (reuse: farhold `js/nearby-ui.js`) |
| Chat box | `hud_chat` | 1 | (reuse+: farhold `#log`) |
| Floating combat text | `hud_fct` | 1 | (reuse+: farhold `#hitnums`) |
| Nameplates | `hud_nameplates` | 1 | (new) |
| Boss warning banner | `hud_warning_banner` | 1 | (reuse+: farhold `#zone-banner`) |
| Boss dialog choice | `hud_dialog_choice` | 5 | (new) |
| Pull timer | `hud_pull_timer` | 1 (shown when a party leader starts one) | (new; §4.18) |
| Legendary loot banner | `hud_legendary_banner` | 1 | (new; requested by page 08 §8.2) |
| Zone banner | `hud_zone_banner` | 1 | (reuse: farhold `announceZone`) |
| Edge arrows | `hud_edge_arrows` | 1 | (reuse: farhold `edgeArrows`) |
| Interact prompt | `hud_prompt` | 1 | (reuse: farhold `#prompt`) |
| Work / harvest bar | `hud_workbar` | 1 | (reuse: farhold `workBar`) |
| Travel strip (riding a Travel Method) | `hud_travel` | 12 | (new; §4.19) |
| Loot toasts | `hud_toasts` | 1 | (new) |
| Durability doll | `hud_durability` | 1 | (new) |
| Latency / fps | `hud_net` | 1 | (new) |
| Notice line | `hud_notice` | 1 | (reuse: farhold `#hud-notice`) |
| Reticle (the aim point in Mouse-look, page 02 §2.2) | `hud_crosshair` | 1 | (reuse: farhold `#crosshair`) |
| Micro-menu | `hud_micromenu` | 1 | (new) |

### 4.3 `hud_player` — player unit frame

```
+--------------------------------------------+
| [portrait]  Wren  Lv 23         [Leader ♛] |
|  (3D head,  [=====HEALTH 1 840 / 2 210====]|
|   class     [==TEMPO 62 / 100====]         |
|   ring)     [second bar: a form's resource]|
| buffs:  [ic][ic][ic][ic]  (up to 16)       |
| debuffs:[ic][ic]           (up to 8)       |
+--------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Portrait | live 3D head (a second small render of the Chibi 2 head, 64 px, updated 4×/s) with a class-coloured ring; in combat the ring pulses red | left click: target yourself (as `F1`); right-click: menu (Set as watch target, Leave party, Reset dungeons if leader, Loadout 1 / 2 from level 30) | — |
| Name + level | "Wren  Lv 23" | — | "{race} {class}. {title}" |
| Leader crown | ♛ when you lead the party | — | "Party leader" |
| Duel flag | crossed swords **only during a duel** (the only player fighting in v2, canon W1) | — | "In a duel with {name}" |
| Health bar | fill + "1 840 / 2 210"; a white overlay for shields/barrier "+ 320"; a green ghost for incoming heals; a red ghost for damage just taken (fades 0.6 s) | — | "Health. Out of combat it refills {n} a second." |
| Health text mode | per page 04: **Current / max**, Percent, Current only, Missing, None | — | — |
| Resource bar | **Mana** (blue #4f7fff), **Momentum** (red #d8452e — empty at rest, fills in a fight), **Tempo** (amber #e0a030 — refills fast); canon 00 §6. A druid form or other alternate bar shows its own resource second | — | resource rules (page 05) |
| Buff row | own buffs, 24 px icons, remaining time under each ("12s", "3m", nothing if permanent), stacks in the corner | right-click a buff: cancel it (not debuffs) | name, what it does in numbers, source, time left, its **tags** |
| Debuff row | 28 px, border colour = dispel type: Magic #4f8fff, Curse #a050e0, Poison #5fbf3f, Disease #b09040, Bleed #d03030, none = grey | — | same + "Dispel: {type}" |
| Low-health edge | below 30% health the screen edge glows red (vignette), 35% opacity, pulsing at 1 Hz below 15% | — | — |

**Empty:** no buffs = the row collapses (no "no buffs" text).

### 4.4 `hud_target`, `hud_tot`, `hud_watch` — the target frame, target of target, watch frame

**The rule** (page 02 §2.1, §2.6): `hud_target` **only draws `player.target`** — the one hard target the
player chose. It never asks "what is under the reticle", "what did I hit last" or "what is nearest".
That is the Farhold fault this frame exists to avoid: Farhold's bar was **recomputed every frame** from the
scene (the nearest body along the crosshair ray, then the last thing hit, then the nearest thing in
front of your feet), so it jumped to a wolf beside the champion you were fighting. Here the frame changes
**only** when the target changes, and the target changes only by the player's action or by the short
list of events in page 02 §2.6 (death, despawn, 100 m away, zone change). A test (page 16) swings at one
enemy while a second walks through the reticle and asserts the frame's unit id never changes.

```
TARGET                                              ToT
+--------------------------------------------------+ +---------------------+
| [portrait] ⚡ Electrified  Mirebound Troll  Lv 11 | | ▲ Borin (tank) 92%  |
|  Champion pack · "Stoneskin" · Rare drops ↑      | +---------------------+
|  [=========HEALTH 78%  4 120 / 5 300==========]  |
|  [cast bar: Bog Spit  1.2s  (gold edge)]         |  WATCH
|  debuffs YOU put on it (first) | others          | +---------------------+
|  buffs on it (enrage, shield)                    | | 👁 Fen Hexer  64%    |
|  12 m · Beast · Tags: Beast, Water · threat 84%  | | [Hex Bolt 0.8s ═══] |
+--------------------------------------------------+ +---------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Name colour | a monster's **rarity colour** (below) for hostile monsters; otherwise reaction: hostile #e05040, neutral #e0c040, friendly #50c060, other player #5aa0ff, a player duelling you #ff6a3a | — | — |
| **Monster rarity line** | under the name: **Champion pack** (name blue `#6ab0ff`) + its one shared affix ("Stoneskin"); **Rare** (name yellow `#ffd84a`) + its 2–3 affixes; **Named** (name orange `#ff9a3c`, its title); **Boss** (gold `#ffd24a`, crown). Canon 00 §4, page 10 owns the lists | hover an affix: its rule in numbers | "Champion pack: every monster in this group has Stoneskin: takes 30% less physical damage." |
| **Greater-rarity badge** | before the name, one small bespoke SVG badge per greater rarity (page 10): **Giant** (a tall silhouette), **Flaming** (a flame), **Electrified** (a bolt), **Frozen** (a snowflake), others as page 10 adds them; combined ones show both ("Giant Flaming") — never two elements at once (canon). A red-bordered frame edge marks a greater-rarity monster as a big difficulty spike | hover | "Greater rarity: Electrified — its hits chain lightning to one more player within 6 m. Electrified monsters drop Electrified items more often." |
| Level | "Lv 11"; "Lv ??" skull when 10+ above you; colour by difference: grey ≤ −6, green −5..−3, yellow −2..+2, orange +3..+4, red +5 or more (same bands as Farhold's zone tones) | — | "{n} levels above you" |
| Portrait | 3D head of the unit | click: nothing (it is already your target) | — |
| Health | % + numbers (per page 04 setting) | — | — |
| Cast bar | spell name + time left; grey fill = cannot interrupt, **gold border = interruptible** (page 11 rule); flashes white and reads "Interrupted" when kicked | — | the ability's journal entry, with its tags |
| Aura rows | debuffs you applied first, bigger (28 px); others' 22 px; enemy buffs on a second row; a dispellable buff has a glowing border | — | name + numbers + time |
| Distance + type + tags | "12 m · Beast · Tags: Beast, Water" (the tags your bonuses can read, page 05) | hover a tag: the `tag` tooltip | — |
| Threat meter | only in a group, only on hostile targets: your share of the top threat, 0–100%+, bar green <70, amber 70–99, red ≥100 ("you have its attention") | — | "Threat: how angry it is at you compared to whoever it is hitting" |
| States | **Dead** (frame greyed, "Dead"; kept by the default `set.gameplay.on_target_death`, page 02 §2.6) · **Out of sight** (hidden or behind a wall; greyed) · **Cannot be targeted** (a boss phase in the air) · **Out of range** (frame dims to 55% beyond your longest spell's range) | — | the reason in one sentence |
| Target-of-target (`hud_tot`) | a small frame to the right: who your target is targeting — a role icon, name in class colour, health %; red border when an enemy targets a non-tank in your party | click: target it (as `T`) | "{target} is attacking {name}" |
| Watch frame (`hud_watch`) | a second frame (80% size) under the target frame for the **watch target** (page 02 §2.7; `Y`): half-closed violet eye, name, health, **its cast bar** (the reason to have one); an interruptible cast makes the frame's border pulse gold | click: target it; right-click: Clear watch | "Watch target. Hold Y and press a spell key to cast on it." |

**Empty:** no target = the frame is hidden (no placeholder). A friendly target shows the same frame in
friendly colours, with their buffs first and a "Dispel: {type}" hint on debuffs you can remove.

### 4.5 `hud_party` — party frames (up to 5, followers included)

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
| Row | role icon (Tank shield, Healer cross, Damage sword, Support banner), name in class colour, health bar, resource bar (healers' mana always shown), level if different from yours; your own row is first (`F1`), then `F2`–`F5` in order | click targets (or `F1`–`F5`); right-click menu (Target, Set as watch target, Whisper, Inspect, Trade, Follow, Promote to leader, Kick, Set target icon, Report) | — |
| Key hint | a small "F2"…"F5" in the row's corner, read from the live binding | — | — |
| Your target | the row of whoever is your target gets a gold outline | — | — |
| Debuffs | 3 most important, dispellable ones first, border in dispel colour | — | — |
| Dead | grey bar, "Dead" + a ghost icon; "Released" when they left their body | — | — |
| Offline | 40% opacity, "Offline" | — | — |
| Out of range | 50% opacity past 40 m | — | — |
| Ready check | ✓ / ✗ / ? over the row for 10 s | — | — |
| Incoming revive | a green pulse on the row | — | — |
| Follower rows | hired followers that fill party slots (pillar 6), marked "(follower)" and italic. Class companions (tamed beast, bound demon, controlled undead) take **no** slot and show as a small pet bar under their owner's row | right-click: Stance (Attack / Defend / Passive), Dismiss | — |
| Aggro warning | red border when a monster is targeting a non-tank | — | — |
| Mechanic badges | page 11's markers on a member (yellow "Targeted" ring, orange "Soak" pip, a tether line icon) | — | the mechanic's one-line rule |
| Health history (Chronomancer only) | a thin segment behind each member's health bar showing where their health was **5 s ago** (the Chronomancer rewinds allies' health, canon 00 §6); only the Chronomancer sees it | — | "5 s ago: {n} health" ([classes/chronomancer.md](classes/chronomancer.md)) |

Healers get **mouse-over casting** (page 02 §2.3): hovering a party frame with a free cursor and pressing a
spell key casts on that member without changing your target.

### 4.6 Raid frames — not in v2

Parked in `WISHLIST.md` with raids (canon 00 §12.1 W16). Five party frames (§4.5) are the whole group,
everywhere except at a world boss, where the party frames stay and the other players around you show only
as nameplates.

### 4.7 `hud_boss_frame` — boss frames with cast bars (was `hud_boss`)

Up to 5 boss frames, top centre, stacked (a council fight shows all members). Each frame is 420 px:

```
+--------------------------------------------------------------+
| GRAVE-WARDEN OSRIC   Phase 2 of 3   [========  62%  =======] |
| |---P2 at 70%---|---P3 at 35%---|   (phase ticks on the bar)  |
| Casting: Summon Dead   2.5s  [gold edge: interruptible]      |
| Enrage in 4:12                       Adds: 3                  |
+--------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Name + title | boss name (`b_<snake>` display name), rank art, greater-rarity badges if a Depth tier gave it one (page 12) | click targets it (the only way this frame changes your target) | — |
| Health bar | % with one decimal ("62.4%"), no raw numbers above 1M | — | exact numbers |
| Phase ticks | a thin mark at each phase threshold (page 12 / page 13 per boss) | — | "Phase {n} starts at {p}%" |
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
          [ FORM BAR: Bear | Wolf | Heron ]             (only classes with forms/stances/coatings)
 [LMB][1 ][2 ][3 ][4 ][5 ][6 ]  [Q class][G class 2]  [F dodge][R potion][7][8][9][0][E use][H mount][Home recall]
  basic Lv1 Lv4 Lv10 Lv18 Lv28 Lv40   Lv6      Lv6         Lv5    Lv1    belt Lv3/16  Lv1   Lv10     Lv7
```

**Spell slot** (reuse+: farhold `skill-slot`):

| Part | Shows |
|---|---|
| Icon | the spell icon (§14.5 style) |
| Key label | top-left corner, from the binding table ("1", "Shift+2", "M4") |
| Targeting kind | a tiny corner glyph (page 02 §2.3): ◎ Needs target · ✚ Ally · ⌖ Auto-target · ▢ Ground · ● Self |
| Tags | not on the slot (too small); on the slot's tooltip, as chips (§7.3) |
| Cooldown sweep | a clockwise dark sweep + whole seconds left in the middle ("12", "1.4" under 3 s) |
| Global cooldown | a thinner, lighter sweep on every slot for the GCD (page 05) |
| Cost | bottom-right, the resource cost ("30"); red when you cannot pay |
| Charges | bottom-left "2" for spells with charges |
| Range | icon tinted red when the target is out of range; greyed with a crossed ring when the spell **Needs target** and you have none or the wrong kind ("No friendly target" on hover) |
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
Recall Stone (`Home`, level 7, with its 30 min cooldown sweep and the bound place's name on hover). Each
is a smaller 40 px slot with the same cooldown sweep. All keys from page 02. There is no light slot (always
daylight, canon 00 §12.3).

**Mechanic gauge** (`hud_gauge`, unlock 6): a 360×28 px widget above the bar, different per class. Page
06 and `classes/<id>.md` own each gauge's art and numbers; this page fixes the **frame** every gauge fits
in: label left, value right, up to 10 pips or one continuous bar, a threshold tick, a glow when the
mechanic is ready to spend. Examples of shape per class type:

| Gauge type | Used by (examples) | Look |
|---|---|---|
| Pips (0–N) | Monk Breath, Warrior block charges, Knight banner charges | row of N diamonds, filled gold |
| Continuous bar with zones | Pyromancer Heat (its Momentum), Priest Light/Shadow balance | bar with coloured end zones; Priest's is a centred slider |
| Stack counter | Mage Resonance, Swashbuckler Flair, Stormcaller Static, Warlock Tithes | number + small ring |
| Slots | Shaman's three storm-beast tales (Thunder Ox, Rain Crane, Wind Hare — lit when told), Tinker gadgets, Runesmith runes | 3–4 small icons with timers |
| Pet/companion bar | Ranger's tamed beast, Warlock's bound demon, Necromancer's controlled undead, Enchanter's charmed unit | mini frame with health + a command wheel hint; a revive-ritual hint when a bound or tamed one is dead |
| Ghost/timeline | Chronomancer 5 s recording | a scrubber bar |
| Marks on enemies | Rogue Wounds (on the target's frame and nameplate), Witch Hunter Silver-Branded, Demon Hunter's revealed weak points | pips over the enemy's frame |

**Form bar** (`hud_formbar`): only for classes with a `Shift+1`–`4` set (page 02 §5.16): Druid forms
(Bear, Wolf, Heron), Fighter stances, Paladin oaths, Rogue coatings, Dragon Knight aspects, Knight
banners, Monk Ways. 4 buttons max (canon: at most 4 forms or stances
per class), keys `Shift+1`–`Shift+4` (page 02 `form1`–`form4`). Swapping form replaces the six spell
icons with the form's alternate spells with a 0.25 s flip animation; the gauge swaps to the form's
resource. The Enchanter uses the same keys for its borrowed bar (§4.9.2).

#### 4.9.1 Class gauges (one per class, inside `hud_gauge`)

Each class file owns its gauge's art and numbers; this table lists the ids so the builder has one place
to look. A class file that names no id of its own uses `hud_class_gauge`, the generic frame above. When
each gauge appears (level 1 or Calling I at 6) is the class file's call.

| Id | Class | What it shows | Owner |
|---|---|---|---|
| `hud_bulwark` | Warrior | shield pips left of the Momentum bar (2 → 5); a pip cracks when spent; 20 s lifetime line; red-iron border and "×4" enemy count while Unbreakable; Last Rampart clock | [classes/warrior.md](classes/warrior.md) §2.3 |
| `hud_stance_dial` | Fighter | triangle dial, one corner per stance (Offense, Defense, Precision) on `Shift+1`–`Shift+3`; 1.5 s swap ring; Stance Dance fade; Threefold Form white ring; a rider-coloured corner tab on each spell icon | [classes/fighter.md](classes/fighter.md) §2.3 |
| `hud_oath` | Paladin | round seal left of the mana bar with the oath's symbol; Sanctity ring filling to 100 ("Fulfilled"); red crack and "−50" on a broken vow; two half-seals for Twin Oath | [classes/paladin.md](classes/paladin.md) §2.4 |
| `hud_quarry` | Ranger † | hunter's-mark pips right of the Tempo bar; the marked quarry's stack number on its nameplate (class file owns the numbers after its round-2 rewrite) | [classes/ranger.md](classes/ranger.md) §2.4 |
| `hud_pet` | Ranger, Warlock, Necromancer, Enchanter (any class with a companion) | companion frame under the player frame: portrait, species or demon name, health, current command icon (paw / shield / eye), and when a tamed beast or bound demon dies: "Dead — revive it with {ritual} out of combat" (canon 00 §6) | [classes/ranger.md](classes/ranger.md) §2.4 |
| `hud_wounds` | Rogue † | **Wounds** open on each enemy (pips on its nameplate and target frame) from hits landed from its **blind spots**; the rogue's finishers spend them (canon W29: no combo points, no stealth); the active coating on `Shift+1`–`3` shown as a small vial | [classes/rogue.md](classes/rogue.md) |
| `hud_viewcone` | Rogue (default on), anyone with `set.combat.view_cones` | a faint cone on the ground in front of each hostile monster within 30 m, showing where it can see; outside the cone is its blind spot. Drawn under telegraphs, never in a telegraph colour (pale grey `#c8c8c8` at 12%) | [classes/rogue.md](classes/rogue.md), page 04 |
| `hud_devotion` | Cleric | chalice left of the mana bar filling 0–100, marks at 30/50/100; rim glow at 50 (Raise); overhealing banks into shields shown as gold ward bars and "can raise" feathers on party frames | [classes/cleric.md](classes/cleric.md) §2.5 |
| `hud_class_gauge` | every other class (e.g. Chronomancer hourglass, Witch Hunter silver bullets, Knight banner, **Monk Breath orbs with the "Kept" portrait** — a small portrait of the technique being held — beside them, Tinker workbench strip + scrap nuts, Demon Hunter Demonsight pulse, **Shaman drum** — a round drum face with the three storm-beast tales as marks round its rim, lit as each is told) | the generic frame: label left, value right, up to 10 pips or one bar, threshold tick, ready glow | the class file's "Gauge" section ([06-CLASSES.md](06-CLASSES.md)) |

#### 4.9.2 `scr_hud_borrowed_bar` — the Enchanter's charmed-enemy bar

(new; [classes/enchanter.md](classes/enchanter.md) §2.3) **Opens:** automatically when the Enchanter
charms an enemy; slides up above the spell bar and closes when the charm ends. **Keys:** `Shift+1`–`Shift+4`
(canon 00 §10: Shift+1–4 is the form/stance/**borrowed** bar), so `1`–`6` keep casting.

| Part | Shows |
|---|---|
| Portrait | the charmed creature's face in a violet frame, a **Will ring** draining clockwise with the number in the middle; flashes red at 25 Will |
| `Shift+1` `Shift+2` `Shift+3` | the first three abilities of its page-10 kit, with their own cooldowns; they cost you nothing; blank if it has fewer |
| `Shift+4` | stance toggle: **Attack my target** (default) / **Guard me** |
| Hold here | a button (click), or `G` (page 02 §5.16) — the creature walks to the aim point and stays |
| Health bar | under the portrait |

The class file proposed `Alt+1`–`Alt+5`; those keys are the boss-dialog replies (canon), so the bar uses
`Shift+1`–`Shift+4`, and **Hold here** sits on the second class key `G`.

### 4.10 `hud_xp` — XP bar

Full width under the action bar, 8 px (reuse: farhold `.bar.xp`, gold fill `#d8b040→#8a6a10`). Hover:
"12 480 / 18 000 XP to level 24 · +12% XP gain from gear" (the magic-find XP stat, §7.1). There is **no
rested XP** (canon W11). At level 60 the bar shows the one reputation you track (§7.7) in that faction's
colour, or hides if you track none (there is no Renown, canon W13). Ticks every 10%. Level-up flashes the
bar white.

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
to rotate with the camera (page 04 `set.interface.minimapRotate`, **off**). Farhold's zoom: span
default 26 cells equivalent → Wildmarch default **240 m across**, `+`/`-` step ×0.72/×1.4, range
80–1200 m. Buttons on its rim: zoom in, zoom out, **Tracking filter** (funnel), **Calendar/events**,
**Mail** (flashes when mail waits), **Group finder eye** (spins while queued).

Under it: `hud_place`: "Mossfen · Reedhollow" (region · sub-area), level band coloured by tone, weather
word. No in-game clock and no sun/moon icon (always daylight, canon 00 §4); a real-time clock only if
`set.interface.clock` is on. Coordinates only when Settings → Show coordinates.

**Every icon** (Farhold's glyph set extended; shapes stay readable at 12 px):

| Icon | Glyph / colour | Means | Range shown |
|---|---|---|---|
| Player | white arrow | you, pointing where you face | always |
| Party member | blue dot #5aa0ff, class-colour ring | party member | always (edge arrow if outside) |
| Friendly player | small green dot #50c060 | other players | 100 m |
| Duel opponent | red dot with a ring | the player you are duelling (only during a duel) | 60 m |
| Enemy | red pip #ff4a2a, r3.6 | normal enemy | 70 m |
| Champion pack | blue pip #6ab0ff, r4.6, one per monster | a champion pack (page 10) | 90 m |
| Rare | yellow star #ffd84a | a rare monster and its minions | 150 m |
| Greater rarity | the rarity's badge glyph in red over the pip | a Giant / Flaming / Electrified / Frozen … monster | 150 m |
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
| Profession station | the profession's glyph (anvil, needle, mortar…) #c8bca0 | forge, loom, alchemy table… (page 19) | 70 m |
| Profession trainer | the same glyph in a ring | a trainer for one profession | 70 m |
| Inn | bed #ffb060 | inn (food vendor, a town waystone for your Recall Stone) | 70 m |
| Stable | horseshoe #c2a98a | mounts | 70 m |
| Waystone | rune disc #7fe8ff (discovered) / #5a6a78 (not yet) with a small house mark if your Recall Stone is bound there | a waystone (page 20); discovering one is what portals and Heron's Flight need | always |
| Travel Method station | a wagon wheel #e0c080 (a scheduled line: the wheel with a clock) | a station; its routes (page 20) | always |
| Travel Method in motion | its vehicle glyph moving along the route line | a wagon, strider, boat, train or flyer on its route | 200 m |
| Dungeon entrance | arched gate #c090ff | 5-player dungeon | always |
| Dynamic event | hourglass ⌛ #ffb060 + timer ring | event running | 400 m |
| Harvesting node | ◆ in the material colour | ore / herb / timber / hide / fish spot (tracking filter; greyed if your Harvesting skill or tool is too low) | 70 m |
| Chest | small gold pip #ffd24a | unopened chest | 40 m |
| Corpse (you) | ghost/skull #cfd8e3 | your body, after releasing | always |
| Group ping | expanding ring in the pinger's colour, 3 s | a ping (middle mouse, page 02 `ping`) or a map pin shared with the group (map right-click → Share with party) | always |
| Pin | ◈ #7fd4ff | your own pin | always (rim arrow) |
| Favourite | gold ring on any icon | starred | — |
| Tracked marker off-map | rim triangle + distance ("420 m") | off the minimap | — (reuse: farhold rim arrows) |
| North | "N" | top edge | — |

**Tracking filter dropdown** (checkbox list): Quest givers **on**, Low-level quests off, Vendors **on**,
Trainers **on**, Banks & mail **on**, Profession stations **on**, Harvesting nodes off (one checkbox per
kind: Ore, Herbs, Timber, Hides, Fish), Chests **on**, Travel Methods **on**, Other players **on**,
Enemies **on**, Champions and rares **on**, Events **on**.

**Inside a dungeon:** the minimap shows the room plan (Farhold `drawDungeonMap`), boss rooms as skulls,
cleared bosses as grey skulls; the place line reads "{dungeon} · {Normal | Challenge} · Depth {n} · {n}/{m} bosses".

### 4.13 `hud_quest_tracker` — quest tracker (was `hud_tracker`)

Right side under the minimap. Up to 12 tracked quests (page 04 `set.interface.quest_tracker_max`, default **8**).

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
| Group heading | MAIN STORY, CALLING, UNLOCK, SIDE, PROFESSION, EVENT (no daily or weekly quests, canon W20) | click collapses | — |
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
| Tabs | **General** (Say, Yell, Zone, Trade, LookingForGroup, Warcall, Carriage, System), **Party** (Party, Party warning, Instance), **Guild** (Guild, Officer), **Whispers**, **Combat** (§11.2), **Loot** (loot, gold, XP, reputation, profession skill-ups) | click switches; unread count badge; right-click a tab: Rename, Channels…, Colours…, Font size, Close; **+** adds a tab |
| Lines | "[12:40] [Zone] Borin: lfg barrow" — timestamp optional (page 04), channel tag, name in class colour (click = whisper, right-click = menu), text; item links shown in rarity colour with [brackets], hovering opens the item card (§7.2.1); a **special-rarity** item's link starts with its **bespoke SVG icon** (§14.3.1) before the name, e.g. "[⟨bolt⟩ Electrified Longsword]" — an inline 12 px SVG, never an emoji (canon 00 §12.3), hidden by `set.interface.specialRarityIcons` = off; quest/spell/achievement links likewise | Shift+click an item in your bag pastes a link |
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
| Party warning | `/pw` (party leader) | #ff4800, also shown centre-screen with `hud_warning_banner` | party |
| Instance | `/i` | #ff9f40 | your dungeon, or everyone at a world boss |
| Warcall | `/wc` | #ffb070 | everyone in a world-boss area (page 13); `/warcall lead` offers to call the fight |
| Carriage | `/car` | #d0c0a0 | everyone riding the same Travel Method (page 20) |
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
| Resource gains | "+15 Momentum" small | over you, right side |
| XP / reputation / gold | "+124 XP", "+25 the Wardens" (off by default, shown in chat) | — |
| Pet/follower damage | 80% size, their own colour | over the target |

Merge rule: hits under 10 ms apart on the same target merge ("1 240 ×4"). Options (page 04): on/off per
kind, size 70–150%, **off for other players' damage**.

### 4.16 `hud_nameplates` — nameplates

Over every unit's head, 120×14 px (enemies), scaled by distance 60–100%, hidden past 45 m (page 04).

| Unit | Plate |
|---|---|
| Enemy | name in its **rarity colour** (table below), level, health bar in reaction colour, cast bar under (gold border if interruptible), your debuffs over it (max 6), a target icon if set (Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye — page 02 §5.3), a threat tint border in groups (tank: red border when it is NOT on you; others: red when it IS on you) |
| Friendly NPC | name + role in <angle quotes> e.g. "Warden Hale <the Wardens>", quest `!`/`?` above; no bar unless damaged |
| Player | name in class colour, guild <name>, title; health bar only in combat or when damaged; party members always show a bar |
| Your target | plate 115%, gold outline, always on top; a gold ring on the ground under it (page 02 §2.8) |
| Your watch target | a half-closed violet eye beside the name |
| Follower / companion | owner's name small under: "Rook — Wren's tamed boar" |

**Monster rarity on the plate** (canon 00 §4, §12.3; page 10 owns the affix and greater-rarity lists):

| Rarity | Name colour | Plate extras |
|---|---|---|
| Normal | reaction colour (hostile #e05040) | — |
| **Champion pack** | **blue `#6ab0ff`** for every member | the pack's **one shared affix** in small caps under the name ("STONESKIN"); a thin blue frame |
| **Rare** | **yellow `#ffd84a`** | its **2–3 affixes** under the name; a yellow star before the name; its minions keep the reaction colour with a small yellow dot |
| Named | orange `#ff9a3c` | its title ("the Mire-Mother") |
| Boss | gold `#ffd24a` | a crown; the plate is 130% |
| **Greater rarity** (on top of any of the above) | the base colour stays | one bespoke SVG badge per greater rarity **before the name** (Giant, Flaming, Electrified, Frozen… — page 10), the name prefixed with the word ("Giant Flaming Ogre"), and a **red double edge** on the plate: a big difficulty spike. Hover the badge: its rule in numbers |

The rarity colours are also the plates' colour-blind-safe shapes: champion = square frame, rare = star,
named = banner, boss = crown, greater = double edge (§2.6: colour is never the only signal).

Stacking: plates never overlap (vertical nudge); **Overlap** is an option (page 04).

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
1.2 s Challenge, 3.0 s for anything that one-shots).

**Colour-blind modes** (page 04): patterns added — Danger = diagonal hatch, Void = spiral, Soak = dots,
Safe = concentric rings, Targeted = chevrons, Beneficial = plus signs.

**Performance:** max 64 telegraph decals at once; beyond that the oldest non-lethal ones drop their fill
and keep their edge (page 17 budget).

### 4.18 Other small HUD pieces

| Element | Shows | Notes | Source |
|---|---|---|---|
| `hud_zone_banner` | Region name (Cinzel 42 px), "Level 5–12" in the tone colour, danger word ("a fair fight", "dangerous for you", "you should not be here yet"), holder ("the Fenfolk"). 5.2 s, slides down | also the town arrival card: "Reedhollow — town — held by the Fenfolk — inn, smith, bank" | (reuse: farhold `announceZone`, `announceTown`, `TONE_WORDS`) |
| `hud_prompt` | "[E] Talk to Warden Hale", "[E] Open the chest", "[E] Enter The Hollow Barrow (Normal, 5–7)" | bottom centre above the cast bar | (reuse) |
| `hud_workbar` | harvest/channel progress bar over the node: "Mining Iron Vein 62% · Harvesting 142 → 143?" (a skill-up chance shown when the node can still raise your skill, page 19) | refusals: "You need a pick in your tool slot." / "Harvesting 150 needed (you have 142)." | (reuse: farhold `workBar`) |
| `hud_edge_arrows` | up to 5 rim arrows for off-screen tracked things: name + distance, in the thing's colour | party members in combat also get one when off screen | (reuse: farhold `edgeArrows`) |
| `hud_toasts` | bottom-right stack, max 5, each 4 s: "Received: [Barrow-Iron Helm]" (rarity colour + gem), "+48 gold", "Reputation with the Wardens +25 (Welcome 1 240/3 000)", "Harvesting 143 (+1)", "Achievement: First Blood"; a special-rarity item toast shows its icon before the name | click an item toast opens the bag on that item; Epic+ toasts stay 8 s and play the rarity sting | (new) |
| `hud_durability` | a small paper-doll silhouette, hidden until any piece is ≤25% (yellow) or 0% (red, "Broken: no stats") | click opens the Gear tab | (new; page 08 owns durability) |
| `hud_net` | "34 ms · 60 fps" bottom-right; ms colour ≤80 green, ≤150 amber, >150 red; a plug icon + "Reconnecting…" on disconnect | hover: "Home realm {name}, {ms} ms. Frame {ms} ms." | (new) |
| `hud_notice` | centre-bottom red/amber refusal line: "Not enough Tempo.", "Out of range.", "You must face your target." (throttled: the same line once per 1.5 s) | also logs to System | (reuse: farhold `notice()`) |
| `hud_crosshair` | the **reticle** (the aim point in Mouse-look, page 02 §2.2): a 4-dot mark; turns red over a hostile, green over a friendly, gold over an interactable. It never targets anything by itself | option to hide and restyle (page 04) | (reuse) |
| `hud_micromenu` | a row of 11 small buttons bottom-right: Character (`C`), Bags (`I`), Spellbook and talents (`K`), Perks (`N`), Professions (`L`), Journal (`J`), Dungeon journal (`Shift+J`), Unlocks (`U`), Map (`M`), Social (`P`), Game menu (`Esc`) — each with its key read from the live binding and a badge for unspent points / new mail / invites | the only mouse path to every window | (new) |
| `hud_pull_timer` | centre-screen countdown started by the party leader (`/pull 10`, or the Leader tools button): big numbers, a tick sound on the last 5, "Pull!" at 0; the same button cancels | 5–15 s in the tool (default 10; `/pull` accepts up to 30, page 02) | (new) |
| `hud_legendary_banner` | centre-screen, the whole group: "{name} looted **{Legendary name}**" in violet `#c86bff` with the item icon, sound `loot_legendary` (page 08 §8.2, page 17); only the first time a character loots each legendary | hover the name = item card; `pointer-events` only on the name | (new) |

### 4.19 `hud_travel` — riding a Travel Method

(new; page 20 owns routes, speeds and the snap-back rule; page 02 §5.18 owns the keys) While you ride a
wagon, strider, boat, train or flyer, the action bar, class gauge and target frame **fade to 30% and do
not respond** (riders are protected and cannot fight, canon W15), and this strip sits top-centre:

```
+---------------------------------------------------------------------------------+
| ⟨wheel⟩ Greyridge Road Wagon · Brightwater → Anvilgate          12:40 left ▸     |
|  Brightwater ●━━━━━━━━●━━━━━━━○━━━━━━━━━━○ Anvilgate                              |
|             (you)   Millford  Stonecross                                          |
|  Next stop: Stonecross in 3:10   [ Get off at Stonecross (E) ]  Riders: 4 · /car  |
|  Hold Space to step off here (open ground only)                                   |
+---------------------------------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Line name + ends | the route's name, start → end, time left to the end | hover: the whole timetable |
| Route bar | stations as dots, you as a moving marker, your stop ringed gold | click a station: set it as your stop |
| Next stop | name + countdown | — |
| Get off button | "Get off at {next stop} (E)" / "Staying on to {end} (E to get off sooner)" | click or `E` toggles (page 02 `travelStop`) |
| Step-off hint | "Hold Space to step off here" — greyed with the reason when refused ("on a bridge", "over deep water", "in the air") | hold Space 1.0 s |
| Riders | how many people are aboard, and the `/car` Carriage channel | click: opens chat on Carriage |
| Snap-back line | when the vehicle is put back on its route after something went wrong (page 20), a one-line notice: "The wagon was set back on the road." | — |

The map (`M`) works while riding and draws the route with your marker. On arrival the strip fades, the
action bar comes back, and the toast reads "Arrived at Anvilgate."

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
| Speaker | boss name, Cinzel 22 px, accent colour (`--accent`) | — |
| Quote | the spoken line (also voiced + bubble over the boss) in italics, Spectral 26 px | page 11: a line often IS the warning |
| Warning line | optional plain instruction with the telegraph's colour icon: red ⚠ danger, purple void, orange soak, blue safe, yellow targeted | only for the boss's first 3 pulls on Normal ("Beginner warnings", page 04 `set.combat.boss_hints`, **on** for Normal, off for Challenge) |
| Countdown | a shrinking underline matching the mechanic's warning time | — |

Timing: slides in 0.2 s, stays for the mechanic's warning time + 1 s (min 3 s), fades 0.4 s. Max 2
banners stacked; a newer one pushes the older up. Party warnings (`/pw`, party leader) use the same banner
without the speaker line, in orange. A sound plays per telegraph colour (§14.6). Page 11 §8 owns the banner
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
  in a group uses `scr_loot_panel` instead. Every item card in it is the full item card (§7.2.1) with its
  3D portrait, rarity frame and special-rarity look.
- Quest reward kinds keep Farhold's five (`coin`, `crate`, `materials`, `choice`, `pick3` from
  `js/questrewards.js`), with `choice` titled "Name your price" (The coin / Something from the store /
  A load of stock) and `pick3` titled "Take one". Class quests may offer a pick of 3 **class items**.
- Never opens during a boss fight; queued with a chest icon on the micro-menu.

### 5.5 `scr_loot_panel` — personal loot panel (was `scr_loot_roll`)

(new) Canon (00 §4, §12.1 W5/W18): **personal loot everywhere** — the server rolls each eligible player's
loot separately, so there is no roll and no loot master. **Loot is not bound**: every item can be traded,
mailed and sold; only quest items cannot. This panel opens when a kill gives **you** an item. Right side,
stacked, max 4 visible (+"{n} more"), each 380×96:

```
+------------------------------------------------------------+
| [3D] [⟨bolt⟩ Electrified Barrow-Iron Helm]  Rare  Head     |
|      ▲ +42 over your Worn Cap · 1 Gem socket                |
| [ Keep ]  [ Offer to party ]   Loot focus: [Tank v]  [?]    |
+------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Item | a small live 3D turn of the item (the item card's portrait, §7.2.1, at 48 px), name in rarity colour with its special-rarity icon, rarity word, slot, armour type, socket count | hover = full item card with compare | — |
| Upgrade hint | "▲ +42 over your {worn}" / "▼ worse than your {worn}" (reuse: farhold `itemScore`) | — | — |
| Keep | closes the card; the item is already in your bags | — | — |
| Offer to party | posts the item link in party chat with "Anyone need this?" | — | — |
| Loot focus dropdown | **your current role**, Tank, Healer, Damage, Support — what the server weights your next rolls toward (page 08) | changes future rolls, not this one | "Your loot is rolled for your class and this focus." |
| Weekly limit line | on a Challenge-mode boss or a world boss you already looted this week: "Looted this week — no item. Resets Monday 06:00." (canon W5) | — | — |
| [?] | help | shows the rules card below | — |

**Rules card (shown on [?] and on the first item of a character's life):**
- Loot is rolled for you alone, for your class and your loot focus, with your **item quantity** and
  **item rarity** stats (magic find, §7.1) applied. Other players do not see your roll except as a line
  in the loot log.
- Everything you loot can be traded, mailed or sold. Only quest items cannot ("Quest item").
- Gold from a kill is split evenly among eligible party members (page 08), and your **gold find** stat
  raises your share.

Result line in the Loot chat tab: "Borin received [Barrow-Iron Helm]." **Empty:** a kill that gives you
nothing shows no card; the loot log says "No item for you this time." and, where bad-luck protection
applies, "+5% item chance on the next boss" (page 08).

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
| Rule line | who chooses, per page 11 §10.3: party — everyone votes, a majority closes it early, a tie goes to the party leader (canon 00 §10); solo — you pick | — |

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
| Instance rule | in a dungeon in combat: "Release is blocked while your group is fighting. [Release anyway] (you will wait outside)" | — |
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
`E` accepts (page 02 `acceptRevive`). 60 s timer. There is **no limit on revives in combat** (canon W21)
and no group revive (W35), so the popup never shows a charge count.

### 5.9 `scr_confirm` — generic confirm

One component for every destructive or costly action: title, one sentence with numbers, optional typed
confirmation, **Cancel** (default focus) and a red or gold action button. Used by: delete character,
destroy item ("Destroy [Barrow-Iron Helm]? It is gone for good."), salvage a Unique/Set/Legendary
(Farhold rule: bulk salvage never takes those), Unbind all, leave guild, disband guild (typed), leave an
instance group mid-dungeon ("You will get a 30-minute Dungeon Finder lock."), buy with over 50% of your
gold, sell an Epic+, socket a Soul or a Jewel ("Removing it later costs {n} gold", page 08), choose your
crafting profession (§7.11.1), rebind the Recall Stone.

### 5.10 `scr_invite` — invites, ready check, summons

Top-centre small cards, 30–60 s timers, one sound `ui.open`:

| Card | Text | Buttons |
|---|---|---|
| Party invite | "Borin (Warrior 23) invites you to a party." | Accept / Decline |
| Guild invite | "Lantern Oath (41 members) invites you to join." | Accept / Decline / View guild |
| Ready check | "Ready check from Borin." 30 s | Ready / Not ready |
| Role check | "Pick your role for the Dungeon Finder." Tank / Healer / Damage (only roles your class can do; Support counts as Damage) | Confirm |
| Group found | "Your group for The Drowned Mill (Normal, Depth 0) is ready." role icon, 5 portraits filling as each accepts, 40 s | Enter / Leave queue |
| Guiding Call | "Mira (Oracle) is calling you to her side at The Glass Tombs." (the Oracle's assisted teleport, canon 00 §6; arriving counts as discovering the place) 60 s | Accept / Decline |
| Board with | "Borin is boarding the wagon to Anvilgate. Board with him?" (page 02 §5.18) 30 s | Board / Stay |
| Duel | "Kael challenges you to a duel." — friendly, from level 10, no rewards (canon W1); the only player-versus-player prompt in v2. 30 s | Accept / Decline |
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
| CHARACTER   Wren  Ranger · level 34  [xp ======----- 4 200 to 35]  [Loadout: 1 | 2]  1 204g × |
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
| 0 Professions ●                                                                           |
| Esc back   |                                                                              |
+------------+------------------------------------------------------------------------------+
```

**Header:** title (tab name), name + class + level (gold), XP bar with "{n} xp to level {L+1}" (at 60, the
tracked reputation), **gold** as one number with the coin icon ("1 204g" — gold is the only currency,
canon 00 §4; no smaller coins), the **Loadout switch** once the Second Loadout is unlocked (§6.1), close ×.
Farhold's material chips are dropped from the header (no building/industry); crafting materials live in
the Bags tab's Materials bag.

**Rail:** ten tabs, digits stamped from the tab order (Farhold `numberRail()`), badges (gold pill, count):

| Tab | Badge counts |
|---|---|
| Gear | pieces at 0 durability; an empty socket on a worn item |
| Bags | new items since last open (resets on open) |
| Spells | spells learned but not yet looked at + open talent tiers without a pick |
| Perks | unspent perk points |
| Unlocks | unlocks not yet acknowledged |
| Reputation | new standing tiers reached |
| Collections | new mounts/titles/looks |
| Achievements | new achievements |
| Journal | quests ready to hand in |
| Professions | new recipes learned; "choose a profession" from level 9 until you do |

Keys: `1`–`0` switch tabs while the sheet is open (ignored in inputs/selects, Farhold rule). Open keys
(page 02 §5.15): `C` Gear, `I` Bags, `K` Spells (and its Talents tab), `N` Perks, `U` Unlocks, `J`
Journal, `L` Professions. Reputation, Collections and Achievements have no key of their own (page 02 left
them unbound): open them from the rail.

### 6.1 `scr_loadout` — the Second Loadout

(new; canon 00 §12.1 W10; page 07 owns what a loadout holds) **Unlock:** 30. Two saved builds, **Loadout
1** and **Loadout 2**. Each holds: talent picks (all tiers of all six spells), perk forest points, spell
bar order, the equipped gear set (optional, ticked per loadout), and the Dungeon Finder role it queues as.

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Loadout switch (sheet header) | two pills "1 · {name}" "2 · {name}" (names up to 16 characters, default "Loadout 1/2") with the active one gold | click the other: a **5 s cast** out of combat (page 07), broken by damage; greyed in combat ("Switch loadouts out of combat.") | "{name}: {role} · {n} talents · {n} perks · gear set {on/off}" |
| Edit (pencil) | opens this panel as a small window: name field, role dropdown (the class's primary and hybrid roles), "Swap gear with this loadout" checkbox, **Copy from the other loadout** | — | — |
| Compare | a two-column list of what differs between the two (talents, perks, gear slots) | — | — |
| `/loadout 1` · `/loadout 2` | the same switch from chat (page 02 §6.5) | — | — |

**Empty:** before 30 the pills are absent and the Unlocks screen lists "Second Loadout — level 30".
Retraining one loadout at the Unbinder (§12.5) touches only the active one.

---

## 7. The sheet tabs

### 7.1 `scr_sheet_gear` — paper doll and stats

(reuse+: farhold Character tab + round-10 doll grid) Three columns: doll / stats / side. The doll is
page 08 §2's layout: seven armour slots down the left, neck/back/rings/**tool**/mount down the right,
weapons along the bottom.

```
+---------------------------+-------------------------------+-----------------------------+
| WORN                      | STATS            [show 6 more]| POWERS                      |
| Head      [plate] Neck    | ATTRIBUTES                    | Hunter's Mark: marks also   |
| Shoulders [     ] Back    |  STR 42  DEX 118  INT 20 CON 64| slow by 15% for 4 s (set 2) |
| Chest   (3D figure) Ring I|  OFFENCE                      | Soul of the Drowned: ...    |
| Hands     [     ] Ring II |  Weapon damage  88–131        +-----------------------------+
| Waist     [     ] Tool    |  Spell power    210           | SET BONUSES                 |
| Legs      [     ] Mount   |  Crit 14.2% for +50%          | Stalker's Weave 2/6 ✓ 4 ✗   |
| Feet                      |  DEFENCE ... UTILITY ...      +-----------------------------+
| Main hand [     ] Off hand|  MAGIC FIND                   | SOCKETS  Gem 3/4 · Jewel 1/1|
| Item level 34.3           |   Gold find +18% · Qty +6% …  |  Soul 1/1 · Gadget 0/1 ◇    |
| Armour 4 210 · Legend. 1/2|                               | COMPANION  Rook, tamed boar |
+---------------------------+-------------------------------+-----------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Slot plates | slot name + item name in rarity colour (special-rarity icon before it), 3 px rarity edge, durability pip (yellow ≤25%, red 0%), small socket dots (filled / empty, in the socket kind's colour) | click: unequip to bag; drag an item from the Bags tab onto it: equip; right-click: Salvage / Link in chat / Open socketing (at a jeweller) | the item card (§7.2.1; `slot` renderer: "Nothing worn here." when empty) |
| **Tool slot** | the harvesting tool (pick, sickle, skinning knife, axe, rod…, page 19): its tool kind, tier and Harvesting bonus | as any slot | "Tool: lets you harvest {kinds} up to Harvesting {n}. Hold E on a node." |
| 3D figure | the character in the middle column of the doll, sways, drag to turn (figure3d) | — | — |
| Show helmet / Show cloak | two toggles under the figure | — | — |
| Item level | average equipped item level (page 08: the combat slots, tool and mount excluded, a two-hander counted twice), one decimal. Item level is simply the level needed to wear an item (1–60, canon) | — | "Average of your combat slots" |
| Footer | "Item level 34.3 · Armour 4 210 · Set: {name} n/6 · Legendaries n/2" (canon: at most 2 legendaries worn) | — | — |
| Stats | groups as Farhold: Attributes (STR, DEX, INT, CON — canon), Offence, Defence, Utility, **Magic find**; blank rows hidden with "show {n} more" (reuse) | — | `stat` renderer text (Farhold `STAT_HELP`, rewritten for Wildmarch's formulas on page 05) |
| **Tag bonuses** (inside Offence) | every "+N% to {tag}" you carry, summed per tag or tag pair: "Ice +22% · Area Spell +20% · Basic Attack +15%" | click a tag: filter the Spellbook to spells with it | the `tag` tooltip: what the tag is on (page 05) and each source item |
| Powers | what your legendaries, uniques, **souls**, set bonuses and capstone perks actually do (reuse: farhold Powers pane) | — | source item |
| Set bonuses | each set worn: "{set} {worn}/{total}", each step 2/4/6 with ✓ | — | full set text |
| Sockets summary | per kind, filled / total across worn gear: **Gem**, **Jewel**, **Soul**, **Gadget** | click: lists every socket and what is in it | — |
| Companion | class companion frame (tamed beast, bound demon, controlled undead, charmed creature): name, health, stance dropdown (**Assist**, Defend, Passive) | — | — |
| Durability total | "Durability 92%" | click: list of pieces | — |

**The Magic find block** (canon 00 §12.3; page 08 owns the caps and how drop tables read them). Seven
rows, always shown (a zero row reads "+0%" in grey so the player learns the stat exists):

| Row | Example | What it changes | Tooltip |
|---|---|---|---|
| Gold find | +18% | gold dropped by monsters and your share of split gold | "+18% gold from kills and chests. From: {sources}" |
| Item quantity | +6% | the chance of each extra item roll on a drop | "More items drop. Applied to your personal loot only." |
| Item rarity | +24% | the chance that a dropped item rolls a better rarity (and a special rarity, page 08) | "Better items drop more often. Capped at {cap}% (page 08)." |
| XP gain | +5% | experience from every source | — |
| Reputation gain | +10% | reputation from every source | — |
| Profession skill | +8 | a flat +N to your effective Harvesting and crafting skill (canon: "+profession skill level") — lets you harvest or craft above your trained skill | "Counts as Harvesting 150 + 8 = 158 for what you can gather." |
| Profession XP | +12% | skill-up chance and speed in Harvesting and your crafting profession | — |

Each row's tooltip lists its sources (items, gems in jewellery, jewels, perks, faction buffs). Page 08's
caps show as a thin tick on the row ("cap 100%").

**Slots (page 08 §2 owns; canon 15):** Head, Shoulders, Chest, Back, Hands, Waist, Legs, Feet, Neck,
Ring I, Ring II, Main hand, Off hand, **Tool**, Mount (ids `head`, `shoulders`, `chest`, `back`, `hands`,
`waist`, `legs`, `feet`, `necklace`, `ring`, `ring2`, `weapon`, `offhand`, `tool`, `mount`). No wrists, no
trinkets, **no light slot** (always daylight, canon 00 §12.3). Farhold had 13 (weapon, offhand, head,
chest, legs, hands, feet, ring, ring2, necklace, mount, light, tool); Wildmarch drops **light**, keeps
**tool** (the harvesting tool) and adds **shoulders**, **back** and **waist** (the waist item adds potion
belt charges, not slots — slots come from level, page 07). **Tool** and **mount** are equipment slots
(Farhold rule: they are loot); `H` uses the worn mount, hold-`E` harvesting uses the worn tool, and
Collections only stores mount *looks*. The off hand shows a `2H` badge when a two-hander locks it (a
**quiver** — the bow and crossbow off hand, a damage stat-stick — may still go with a bow, canon 00 §12.3).

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
| Search | text box; filters by name, affix, stat or **tag** ("crit", "ice", "area spell"). Farhold rejected search because it stole keys; Wildmarch's search box only takes keys while focused | click to focus it (page 02 never takes `Ctrl+F`, the browser's find) | — |
| Kind chips | **All**, Weapons, Armour, Jewellery, Tools, Socketables, Consumables, Materials, Quest, Junk | — | — |
| Rarity chips | **Any**, Uncommon+, Rare+, Epic+, Special (any special rarity) (Unique/Set/Legendary always pass, reuse rule) | — | — |
| Sort chips | **How it compares**, Rarity, Slot, Name, Item level, Value, Newest | — | — |
| Bag slots | 5 bag sockets: a backpack (16, cannot remove) + 4 bag items (8–24 slots each, page 08); the four sockets open at levels **7, 14, 24 and 36** (page 07); a closed socket shows its level | drag a bag item in; click filters to that bag | bag name + size |
| Item row | name (rarity colour, special-rarity icon first), slot, level needed, score arrow "▲ +42 / ▼ 12 / – 0" (reuse: farhold score), socket dots, "Quest item" tag on quest items, stack count, "New" dot | click: equip (or use); Shift+click: link in chat; Ctrl+click: preview on the figure; right-click: menu (Equip, Equip off hand, Use, Split stack, Salvage, Sell (at a vendor), Destroy, Link); drag: move/equip/trade | item card |
| Compare panel | hovered item + the worn item it would replace, never cleared on mouse-leave (reuse) | hold Shift = other ring/hand | — |
| Salvage buttons | "Salvage everything up to: Common / Uncommon / Rare", two-click arm "Salvage 14? Click again" 4 s (reuse: farhold bulk recycle); never takes Unique, Set, Legendary, any special rarity, anything with a filled Jewel or Soul socket, or anything in a saved outfit or loadout | — | "Salvage breaks items into crafting materials (page 08)" |
| Sort bags | button: stacks and sorts by the current sort | — | — |
| Materials bag | a separate tab strip entry "Materials" (its own 200 slots, stacks of 200) | — | — |
| Socketables | a tab strip entry "Socketables": gems, jewels, souls and gadgets you carry (their own 60 slots), filterable by kind | drag one onto a worn item's socket (at a jeweller, §12.14) | the item card |

There is no Currency tab: **gold is the only currency** (canon 00 §4, W19/W26) and it sits in the sheet
header.

**Empty:** "Your bags are empty. Kill something, or open a chest." / filters: "Nothing matches. Widen
the filters above." (reuse). **Full:** toast "Your bags are full. {item} went to your mailbox." (overflow
goes to mail, page 15).

#### 7.2.1 `scr_item_card` — the item card

(reuse+: farhold `itemCard`, `hud.itemCard`, `js/figure3d.js`; new: the 3D portrait, rarity frames,
special rarities, sockets, tags) **One component** draws every item tooltip, every loot card, every item
in a chat link hover, the Trading Post preview and the reward popup's cards. Width 360 px (320 at the
small breakpoint), height up to 80% of the window; a longer card moves its Compare block into a second
card beside it.

```
╔══════════════════ (frame: Rare, with the Electrified overlay) ══════════════════╗
║  ┌──────────────────────────────────────────────────────────────────────────┐   ║
║  │             3D PORTRAIT 344×150 — the longsword turning slowly,           │   ║
║  │             lit on a rarity-tinted backdrop; small arcs crawl its blade   │   ║
║  └──────────────────────────────────────────────────────────────────────────┘   ║
║  ⟨bolt⟩ Electrified Barrow-Iron Longsword                                       ║
║  Rare · Electrified · Main hand · Sword · one-handed                            ║
║  Requires level 23                                                              ║
║  88–131 damage · 2.6 s · 42.2 damage per second                                 ║
║  Slash, slash, overhead · 3.0 m                                                 ║
║  Tags: [Melee] [Physical] [Sword]                                               ║
║  +14 Strength                                                                   ║
║  +8% critical hit chance                                                        ║
║  +12% damage with [Lightning] skills        (applies to 2 of your spells)       ║
║  ⟨bolt⟩ Electrified: hits have a 12% chance to arc 60% weapon damage as         ║
║         Lightning to 2 more enemies within 6 m                                  ║
║  SOCKETS                                                                        ║
║  ◆ Gem — Clear Ruby: +6% Fire damage (in a weapon)                              ║
║  ⬡ Jewel — (empty) · add one at a jeweller                                      ║
║  Durability 82 / 100                                                            ║
║  "Forged for the barrow wardens, before the barrow woke."                        ║
║  ── Instead of your Worn Blade: +12.4 damage per second, −3% critical ──        ║
║  Hold Shift to compare with your off hand · Sells for 12 gold                    ║
╚═════════════════════════════════════════════════════════════════════════════════╝
```

**Lines, in order** (a line with nothing to say is left out, never printed empty):

| # | Line | Rule |
|---|---|---|
| 1 | **3D portrait** | §"The portrait" below. Off (`set.interface.itemPortrait` = Off) shows the flat 64 px icon (§14.5) in a 64 px band instead |
| 2 | Name | rarity colour; a special-rarity item puts its **bespoke icon** (§14.3.1) and its word before the name ("⟨bolt⟩ Electrified …") |
| 3 | Kind line | "{Rarity} · {special rarity} · {slot} · {armour type or weapon type} · two-handed" |
| 4 | Requirement | "Requires level {n}" (item level = the level needed, canon: 1–60, no separate item level); red if you cannot; class restriction "Classes: Ranger" in the same line when there is one |
| 5 | Base | "88–131 damage · 2.6 s · 42.2 damage per second" or "312 armour"; a **quiver**: "+8% damage with bows" (a damage stat-stick, canon 00 §12.3) |
| 6 | Weapon pattern | glyph + text (reuse: Farhold weapon patterns) |
| 7 | **Tags** | chips for the item's own tags (page 05 owns the list: Melee, Ranged, Spell, Area, Ice, Fire, Basic Attack, Sword…). Hover a chip: the `tag` tooltip |
| 8 | Affixes | green, each with its number. An affix that targets tags shows them as chips ("+20% damage with [Area] [Spell] skills" — both needed, canon) and, at the right in grey, "(applies to {n} of your spells)" counted from your Spellbook. A **quiver** or other basic-attack effect says so: "Basic attacks only: 15% chance to fire an exploding arrow for 80% weapon damage in 3 m [Basic Attack]" |
| 9 | Special-rarity line | the special rarity's own effect in numbers, in its colour, with its icon (below) |
| 10 | Legendary power / unique power | violet `#c86bff` (Legendary) or the unique's colour; a full sentence with numbers |
| 11 | **Sockets** | one row per socket (§"Sockets on the card") |
| 12 | Set block | "{set} — {w} of {n} worn", each bonus with ✓ when active |
| 13 | Durability | "82 / 100" |
| 14 | Flavour | italic, one line |
| 15 | Compare | "Instead of {worn}: +12.4 damage per second, −3% critical" (reuse: farhold `itemScore`); off with `set.interface.tooltipCompare` = While Shift is held, until Shift is down |
| 16 | Footer | "Hold Shift to compare with your {other ring / off hand}" · "Sells for {n} gold" · **"Quest item"** on quest items (the only items that cannot be traded — canon W18; the word "soulbound" is never used) |

**Rarity frames.** The frame gets more decorated at every step (canon 00 §12.3). Colours are §14.3's.

| Rarity | Border | Corners | Header band (behind the name) | Portrait backdrop | Motion |
|---|---|---|---|---|---|
| Common | 1 px `--line2` | none | none | flat `--panel2` | none |
| Uncommon | 1 px blue `#7f95ff` | small square studs | a thin blue rule under the name | soft blue vignette | none |
| Rare | 2 px yellow `#e8d020` | small gold corner flourishes (`frame_corner.svg`, 16 px) | a yellow-to-clear gradient band | warm yellow radial glow | none |
| Epic | 2 px orange `#ff8020` + 1 px inner line | 24 px flourishes | orange band with a tooled-leather texture | orange glow, faint embossed pattern | a slow 6 s light sweep across the frame |
| Set | 2 px teal `#2fc4b2` + inner line | 24 px flourishes with a set emblem at the top | teal band with the set's name small at the right | teal glow | the set emblem glints once when the card opens |
| Unique | 3 px red-orange `#ff5a3c`, double line | 28 px flourishes + a gem at each corner | a band with a hand-drawn filigree edge | deep red glow, drifting motes | slow pulse on the corner gems |
| Legendary | 3 px violet `#c86bff`, double line with a gold hairline between | 32 px flourishes + a crest at the top centre | violet band with an animated shimmer (Farhold's legendary shimmer) | violet nebula glow | shimmer across the name and edge every 4 s; the portrait has a soft violet rim light |

`prefers-reduced-motion` and `set.access.reduceMotion` stop every animation above; the looks stay.

**Special rarities** (canon 00 §12.3; page 08 owns the numbers, page 17 the art). One special rarity sits
**on top of** an Uncommon-or-better item: the base rarity's frame stays, and the special rarity **adds an
overlay**, a line on the card, and its icon before the name everywhere the name is printed.

| Special rarity (`sr_` id) | Icon (bespoke SVG, §14.3.1) | Colour | What it does to the item (page 08 owns the numbers) | What it does to the card |
|---|---|---|---|---|
| **Electrified** (`sr_electrified`) | a forked bolt | `#7fd8ff` | lightning procs: hits or spells can arc lightning to more enemies | small lightning arcs crawl along the frame every 1.5–3 s; the portrait crackles; a faint static hiss on hover (sound `ui.card.static`, 20% volume, off with UI sound) |
| **Starwoven** (`sr_starwoven`) | a four-point star | `#b8a8ff` → a slow rainbow | **one extra affix** beyond the normal maximum, from a special pool (the extra line is marked with the star) | a **holographic, deep-space** card: the backdrop becomes a slow starfield with parallax that follows the pointer, and a rainbow sheen slides across the frame as the pointer moves |
| **Twinned** (`sr_twinned`) | two linked rings | `#e0e6ee` silver | **every affix rolled twice, the better kept** (each affix line shows a tiny "×2") | a **mirrored shimmer**: the frame's left and right halves mirror each other, and the portrait shows a faint twin of the item turning the other way |
| **Ancient** (`sr_ancient`) | a carved rune | `#d8b060` old gold | **every value rolls 10–20% above its normal maximum** (each such number in gold with a small ▲) | a **stone-and-gold frame**: carved stone texture on the border, gold inlay in the corners, dust motes drifting down over the portrait |
| **Living** (`sr_living`) | a sprout | `#7fd06a` | **grows stronger as it gets kills**, up to a limit (a line "Growth: +{n}% to its affixes · {k} / {cap} kills") | **vines creep over the card**: 5 growth stages drawn at 0 / 25 / 50 / 75 / 100% of the cap, from a few tendrils in one corner to vines round the whole frame with small leaves |

**The portrait** (new). The item's own 3D model — weapons from `avatar-3d/js/chibi2-weapons.js`, armour
pieces from the Chibi 2 part catalog, jewellery and socketables from small new models (page 17), mounts
from `avatar-3d/js/creatures.js` / vehicles — drawn by **one shared off-screen WebGL renderer** for every
card (never one WebGL context per card; reuse the `js/figure3d.js` pattern of one context), copied into the
card's 344×150 canvas.

| Rule | Value |
|---|---|
| Framing | the model's bounding box fitted to 80% of the band; weapons shown diagonally (hilt bottom-left), armour on an invisible stand, a mount side-on |
| Motion | a slow turn, 0.35 rad/s, starting three-quarters on; drag on the portrait turns it by hand (only in a pinned card: Alt+click an item pins its card) |
| Light | three-point light; rim light in the rarity colour; special-rarity effects on top (arcs, stars, the twin, dust, vines) |
| Frame rate | 24 fps while the card is open; 0 when closed; the last 32 portraits are cached as still images so re-hovering is instant |
| Budget | ≤ 2 ms of GPU time a frame for the portrait (page 17); on the Low graphics preset the portrait is a cached still that does not turn |
| Fallback | no WebGL, or `set.interface.itemPortrait` = Off: the 64 px icon; a model that fails to load: the icon plus "(no preview)" — never an empty box |

**Sockets on the card.** One row per socket in the order Gem, Jewel, Soul, Gadget (canon 00 §12.3; page 08
owns which items get which sockets and how many).

| Kind | Glyph | Filled row | Empty row |
|---|---|---|---|
| **Gem** | ◆ in the gem's colour | "◆ Gem — Clear Ruby: +6% Fire damage (in a weapon)". The effect shown is **the one for this item's type** (armour: defence and attributes; weapon: damage or spell damage; jewellery: secondary effects and magic find); hover shows all three | "◆ Empty Gem socket" |
| **Jewel** | ⬡ hexagon in the jewel's own rarity colour | "⬡ Jewel — Rare Jewel of the Pike" then its own 1–4 affixes indented, each with its number | "⬡ Empty Jewel socket" |
| **Soul** | a pale flame in a circle, violet-white `#e8d8ff` | "Soul of the Drowned Magistrate:" + its behaviour as a full sentence, and any requirement it meets ("needs a weapon · Ranger only"); a soul whose requirement you do **not** meet is greyed with the reason | "Empty Soul socket — souls come from certain bosses, quests and rare luck" |
| **Gadget** | a brass cog `#c8a060` | "⚙ Gadget — Spring Coil (made by {crafter}): +40 armour · +3% move speed" (the stats its Engineer chose) | "⚙ Empty Gadget socket — Engineers make gadgets" |

Every empty row ends "· add one at a jeweller" (§12.14).

**Shift, Ctrl and Alt on a card:** Shift = compare (or compare with the other ring/hand when compare is
always on); Ctrl = preview on your figure; Alt+click = pin the card open (drag to move, × to close, up to 3
pinned). Shift+click in any list = link it in chat.

**Empty and error:** an item the client has no data for yet (just linked by another player) shows the name
and "Loading…" for up to 1 s, then "Could not load this item." with a Retry link.

### 7.3 `scr_sheet_spells` — spellbook

(reuse+: farhold Skills tab `sk-card` strip + `js/spellcard.js`) Left: six spell cards in ladder order;
right: the selected spell's full card; bottom: shared skills (basic attack, dodge, potion, mount) and
the class mechanic panel.

**Spell card fields, in order** (extends spellcard.js's chip order):

| # | Field | Example |
|---|---|---|
| 1 | Icon + name + slot level | Piercing Shot · Level 1 · key 1 |
| 1b | **Targeting kind** (page 02 §2.3) | "Auto-target — if you have no target, hits the enemy nearest your aim point" / "Needs target" / "Ally — needs a friendly target" / "Ground" / "Self" |
| 1c | **Tags** (page 05 owns the list; canon 00 §12.3) | chips: [Ranged] [Physical] [Line] [Projectile]; hover a chip: which of your items and perks boost it, and by how much in total ("Ice: +22% from 3 sources") |
| 2 | Chips: targeting kind, shape, element, damage, heal, status, cost, cooldown | Auto-target · Line · Physical · 140% weapon damage · 20 Tempo · 6 s cooldown |
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

Alternate bars (forms/stances/coatings): tabs above the cards, e.g. the Druid's "Base · Bear · Wolf ·
Heron" showing what each of the six spells becomes in that form (canon W30: a form turns each spell into
a different spell, with its own tags and targeting kind).

**Utility strip** (new; canon 00 §5 item 6): under the six cards, the class's out-of-combat utility spells,
which use no slot — e.g. Mage **Portal**, Chronomancer **Retrace**, Oracle **Guiding Call**, Druid
**Heron's Flight**, the Ranger's revive ritual for its tamed beast, the Warlock's ritual for its bound
demon. Each is a button (click to cast, out of combat) with its card on hover; the same spells are on the
`Shift+Q` utility ring (page 02 §5.16). A travel spell's card lists the discovered destinations it can
reach. **Empty:** "Your class has no utility spells. Travel with scrolls, Travel Methods and your Recall
Stone."

Class extras on this tab (each from its class file; out of combat only unless the file says otherwise):

| Element | Class | Shows | Interactions |
|---|---|---|---|
| **Role focus** switch | every class with a hybrid role | a two-way switch **Primary / Hybrid** (e.g. Mage: Damage / Tank), changed **out of combat only** and saved **per Loadout** (§6.1); the Dungeon Finder queues you as this role. Some classes show it under their own name — Boon Table, Lead Dancer, Many Faces, Medic Kit, Wardweaving, Iron Covenant (the class files name which). For the **Paladin** the queued role follows the sworn **oath** (Keeping = Tank, Mercy = Healer) and the switch is read-only | page 06 and the class file own what it changes; greyed in combat: "Switch roles out of combat." |
| **Beast** panel | Ranger | the tamed beast: species, name (rename), its signature move on `G`, the revive ritual | out of combat ([classes/ranger.md](classes/ranger.md)) |
| **Pact Book** tab | Warlock | the demons you have bound with **Bind Demon** — **1 slot**, rising to **2 and 3** with the calling quests (class file owns the levels) — each with portrait, name, abilities, and which one is out; the out-of-combat ritual that revives a fallen one; release a demon to free a slot (confirm) | out of combat ([classes/warlock.md](classes/warlock.md)) |
| **Retrace map** button | Chronomancer | opens `scr_retrace_map` (§12.19) — where Retrace can take the party | out of combat ([classes/chronomancer.md](classes/chronomancer.md)) |
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
   Call the Beast  | Tier 3 · level 32   (locked, 18 levels away)
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
0.6–4×, drag pan, double-click reset, search rings matches gold, ◆ capstone / ■ talent / ● node, "a solid
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
   7   | Recall Stone               | level 7                       | ✓
   9   | Harvesting · a profession  | level 9                       | ✓
  12   | Travel Methods · waystones | quest (Highcourt)             | ○
  30   | Second Loadout             | level 30                      | ○
  60   | Challenge mode · deep Depth| level 60                      | ○
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

(reuse+: farhold journal "Who holds this ground" standing rows: colour dot, name, pips per tier, tier
name, "+N% in their shops", ± value, "What moves it") The **seven player factions** of canon 00 §12.2 —
the Wardens, the Crown Assembly, the Deepforge Clans, the Greenhand, the Lantern House, the Cutwater and
the Quiet Wake — each present from the starting regions to 60, then the **enemy factions** (standing only
goes down: the warbands, the Drowned, the Threadcutters, the Riftborn) in a collapsed group.

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Faction row | crest, name, tier (page 07's names: **Hunted, Disliked, Known, Welcome, Trusted, Kindred, Sworn**), a bar "1 240 / 3 000", the rival in grey ("Rival: the Greenhand") | click: detail pane | tier rewards |
| Chapters | under each faction, its chapters (e.g. the Wardens: Vale watch, Rime watch, the Waystone keepers) with where they are and a ⌖ | click a chapter: map on its town | — |
| Detail pane | blurb, every tier with its rewards (✓ earned), the **quartermaster**'s stock at your level (gear "at your level up to 60", jewels, gadget recipes, a mount — canon), "What moves it" (deeds with ± numbers, and "A deed for them is a third of a deed against their rival"), quartermaster location ⌖ | — | — |
| Reputation gain | "+10% reputation gain" from your magic find (§7.1) shown in the pane header | — | sources |
| Filter | **All**, This region, Can still rise, Sworn | — | — |
| Track | "Show on the XP bar" (one faction; at 60 the XP bar shows it, §4.10) | — | — |

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

(new) Left: category tree (**Summary**, General, Quests, Exploration, Travel, Dungeons (Normal, Challenge,
Depth), World bosses, Bosses (incl. dialog answers found and secret bosses), Class, Professions,
Collections, Reputation, Duels, Feats). Right: cards with
icon, name, text with numbers ("Kill the Barrowking without anyone standing in a void zone"), points,
progress bar "3 / 5", date earned, reward (title, mount, look). Summary shows totals and the 5 latest.
Search box; "Show only incomplete" checkbox. Tracking: pin up to 3 in the quest tracker.

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
| ▾ Professions (1)       | [Track] [Share] [Abandon] [Hand in ✓]      | RUMOURS           |
+-------------------------+--------------------------------------------+-------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Quest list | grouped Main story, Calling, Unlock, region names, Dungeon, Profession, Event (no daily or weekly quests, canon W20); level tone colour; ✓ ready; cap "12 / 25" (page 14 owns the cap) | click selects; checkbox = track | — |
| Filter | **All**, Can hand in, This region, Group quests, Tracked | — | — |
| Detail | title, kind + level, giver, story text (may be voiced: ▶ button plays the giver's line), objectives with ⌖, rewards (reuse questrewards blurb), buttons Track / Share with party / Abandon (confirm) / Hand in (only for quests marked remote-turn-in, reuse Farhold journal hand-in) | — | — |
| The world | regions with level band and ✓ visited, dungeons **discovered** (what the Dungeon Finder lists, canon W9), waystones discovered, Travel Method stations found | ⌖ | — |
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
("Next window 18:00–18:30"), whether you have looted it **this week** (✓/✗; one loot a week per world boss, reset Monday 06:00 — canon W5), and a **Guide
me** button that sets a map marker. A row turns orange while the boss is up, with "Up now — 22 min left".
Region alerts are page 04's `set.group.world_boss_alerts`.

### 7.11 `scr_professions` — professions

(new; canon 00 §4 and §12.3; **page 19 owns** the skill ranges, tools, node tiers, recipes, stations and
the switching rule. Farhold's closest pieces are reused: `js/tools.js` tool tiers, the hold-`E` work bar,
`js/craft.js` recipes and `data/crafting.json`.) **Opens:** sheet tab 10, `L`. **Unlock:** 9 (page 07);
before 9 the tab is locked "Opens at level 9."

Everyone **harvests** with one shared **Harvesting** skill (1–300), if the right tool is in the tool slot.
Each character picks **one** crafting profession — Blacksmithing, Leatherworking, Tailoring,
Jewelcrafting, Enchanting, Engineering or Alchemy — with its own skill (1–300).

```
+---------------------------------+-------------------------------------------------------------+
| HARVESTING   142 / 300          | BLACKSMITHING   88 / 300   (Journeyman)          [Change…]  |
| [=========------]  +8 from gear | Recipes: [All v] [Can make now] [search____]  Station: Forge  |
| Tool: Iron Pick · tier 2        | ▾ Weapons                                                   |
|   harvests up to 150            |   ● Iron Longsword        orange  (skill-up certain)        |
| ─────────────────────────────── |   ● Iron Mace             yellow                            |
| Ore       up to 150  ✓ tool     | ▾ Armour                                                    |
| Herbs     up to 150  ✗ no sickle|   ● Iron Helm             green                             |
| Timber    up to 150  ✓ axe      |   ○ Steel Helm (skill 125) grey — learn from the trainer    |
| Hides     up to 150  ✗ no knife | ─────────────────────────────────────────────────────────── |
| Fish      up to 150  ✗ no rod   | IRON LONGSWORD                     makes: Uncommon–Rare    |
| ─────────────────────────────── |   6 Iron Bar   have 9 ✓   · 2 Leather Strip  have 0 ✗     |
| Profession XP +12% (gear)       |   Station: any Forge (you are 40 m from one)               |
| Nodes nearby: 3 ◆ (map)         |   [Craft ×1] [×5] [×max]      Skill-up chance: 100%       |
+---------------------------------+-------------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Harvesting bar | skill / 300; "+N from gear" (the magic-find **profession skill** stat, §7.1) as a lighter segment; the effective value in brackets "(150)" | — | "Harvesting counts as {base} + {bonus} = {n} for what you can gather." |
| Tool line | the worn tool, its tier and the highest node it can harvest | click: opens the Gear tab on the tool slot | "Tools go in the tool slot. Better tools harvest tougher nodes and a little faster (page 19)." |
| Harvest kinds | one row per kind page 19 lists (Ore, Herbs, Timber, Hides, Fish, …): the highest node tier your skill allows, and ✓ / ✗ whether your tool covers it ("✗ no sickle") | click a kind: tracks its nodes on the minimap (the §4.12 filter) | where nodes of your tier are found |
| Profession XP | the magic-find **profession XP** stat | — | sources |
| Crafting header | profession name, skill / 300, its rank word (page 19 owns the words), a **Change…** button | Change… opens `scr_profession_choose` with the switching cost | "One crafting profession per character." |
| Recipe list | grouped by kind; each recipe coloured by skill-up chance — orange (certain), yellow (likely), green (unlikely), grey (none) — and greyed if not learned ("learn from the trainer" / "found as a drop" / "{faction} quartermaster, Trusted") | click selects; Shift+click links it in chat | the made item's card (§7.2.1) |
| Filters | **All**, Can make now, Weapons, Armour, Jewellery, Consumables, Gems, Gadgets, Socketables; a search box | — | — |
| Recipe detail | materials "have / need" (green / red), the **station** it needs, what comes out ("Uncommon–Rare, level 24"), skill-up chance, **Craft ×1 / ×5 / ×max** | Craft works only within 6 m of the right station (§12.6); away from one the button reads "Go to a Forge" with ⌖ | — |
| Gadget designer (Engineering only) | for a gadget recipe: pick its stats from a menu, with the budget it has to spend (canon: "a configurable baseline, chosen from a menu"; page 19 owns the menu and budget) | a list of stat rows with + / − and a points-left counter | the resulting gadget's card |

**Empty:** no profession yet — the right half shows seven profession cards and **Choose a profession**
(opens §7.11.1). No recipes match: "No recipe matches. Clear the filters."
**Refusals:** "Not enough Iron Bar: have 3, need 6." · "Blacksmithing 125 needed (you have 88)." ·
"You need to be at a Forge."

#### 7.11.1 `scr_profession_choose` — choose your profession

(new) **Opens:** the Professions tab's **Choose a profession** button, or talking to any profession
trainer before you have one. Seven cards in a row (two rows under 1440 px):

| Card part | Shows |
|---|---|
| Name + icon | e.g. **Jewelcrafting** |
| Makes | one line of what it makes (page 19): "rings, necklaces, cut gems, jewel settings" |
| Uses | the harvested materials it needs ("ore, gem stones") and its station ("a Jeweller's Bench, in every hub") |
| Good for | who benefits most, as a fact, not a push ("You wear heavy armour: Blacksmithing makes it") |
| Three sample recipes | at skill 1, 150 and 300, each with its item card on hover |

Pick one → the confirm (`scr_confirm`): "Become a Jewelcrafter? You can have one crafting profession.
Changing later costs {cost} and your Jewelcrafting skill goes back to 1." (page 19 owns the cost and
whether anything is kept). **Cancel** has default focus.

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
| 1 | Continent | all 11 regions + Highcourt, region names, level bands, hubs, world bosses, Travel Method lines, your arrow |
| 2 | 1.6× | + towns, discovered dungeon entrances, waystones, Travel Method stations |
| 3 | 2.6× (default when opening) | + villages, landmarks, quest givers you know, events |
| 4 | 4.2× | + roads by class, vendors/trainers/banks inside towns, gathering nodes you tracked |
| 5 | 6.8× | + small landmarks, chests you have seen, the path to a super-tracked objective |
| 6 | 11× | town plans (streets, buildings labelled: Inn, Bank, Trainer…) |

**While riding a Travel Method** the map opens on your route with your moving marker (§4.19).

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
| Places | Selected (what you clicked + **Set waypoint** / **Pin** / **Favourite**), Favourites, Pins, Waystones (discovered ones; the one your Recall Stone is bound to marked with a house), Stations (with their routes and next departures). **No travel button** — the map never teleports you (page 02 §5.10) | "Click anywhere on the map. What you clicked shows up here." (reuse) |
| Find | search box for any place/NPC name you have discovered; dropdown **Anything**, Towns, Dungeons, Vendors, Trainers, Profession stations, Banks, Waystones, Stations, Events; sort **Nearest first** / By name; "Favourites only" | "Nothing by that name that you have found." |
| Group | party members with region + distance + ⌖; ping button | "You are not in a group." |

**Layers & key (fold, closed by default):** toggles **Level overlay (on)**, **Quests (on)**, **Group
(on)**, **Waystones (on)**, **Travel Methods (on)** — each route as a line in its kind's style (wagon road
solid, strider trail dashed, boat and barge lanes dotted blue, train track with ties, flyer route an arc)
with moving vehicle glyphs, **Dungeons (on)**, **Services (on)**, **Harvesting (off)**, **Events (on)**,
**Champions and rares (off)**, **Pins (on)**, **Roads (on)**, **Fog (on)**; the key lists every icon from §4.12 grouped
Beware / Settlements / Dungeons / Travel / Services / Yours, plus "a gold ring — one of your Favourites".

**Pins and marks:** Shift+click drops a pin "Pin {n}" (reuse); Ctrl+Shift+click saves a favourite
place; right-click anywhere opens page 02 §5.10's menu (Set waypoint · Share with party · Remove pin ·
Copy location) — **Share with party** pings the map and minimap for your group (3 s ring). `Home`
recentres on you, `+`/`-` zoom, `F1`–`F5` centre on that party member (page 02). Right-click a pin also
offers Rename (48 chars). Max 50 pins. A pin is shared as a chat link "[Pin: Mossfen 412,
88]" that others can click to add.

**Hover card:** name, kind, level band + tone word, "You have not been here" / blurb, services list for
towns, "Waystone — discovered / not yet", "Your Recall Stone is bound here", a station's routes and next
departure, a dungeon's "Discovered — in the Dungeon Finder" / "Not discovered yet", quest objective text. **Readout strip:** "{region} · {sub-area} ·
level a–b ({tone word}) · {distance} {compass}". Hit-test: nearest centre wins, ties go to the top-most
painted (Farhold round 17 rule).

**Refusals:** "That is not on this continent." (instance/other-world marks), "You have not found that
place yet."

---

## 9. `scr_instance_journal` — dungeon journal

(new) **Open:** `Shift+J`, the book button on a dungeon door's prompt, clicking a dungeon on the map, or a
link in the Dungeon Finder. **Unlock:** 6, quest `q_hv_the_barrow_bell` (page 07; it opens the journal at
the Hollow Barrow's page). Page 12 calls it `scr_dungeon_journal`.

```
+--------------------+---------------------------------------------------------------+
| DUNGEONS | WORLD BOSSES   (Shift+J)                                                 |
| ▾ Hearthvale       | THE HOLLOW BARROW   Levels 5–7 · Hearthvale · Discovered ✓    |
|   Hollow Barrow ✓  | Difficulty: [Normal v]   Depth: [0 v] (up to 7 unlocked)      |
| ▾ Mossfen          | [Overview][Bosses][Loot][Map][Secrets][Records][Depth]        |
|   Drowned Mill ?   | BOSS: Grave-Warden Osric                    [3D model turning] |
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
| Top tabs | **Dungeons**, World bosses | — |
| List | all 16 dungeons grouped by region; ✓ cleared at least once; level band; **"?" and greyed until discovered** — an undiscovered dungeon shows only its region and "Not discovered yet — find its entrance, or have someone bring you there" (canon W9: the Dungeon Finder lists only discovered ones; the journal shows that the rest exist) | click |
| Difficulty dropdown | **Normal**, Challenge (canon W4: two difficulties); Challenge greyed below 60 ("Challenge mode opens at level 60.") | changes numbers, loot and the extra abilities shown |
| Depth dropdown | 0 (plain) up to the deepest Depth you have unlocked on this dungeon (page 12: any dungeon at a chosen Depth once cleared on Normal); shows the dungeon's level at that Depth ("Depth 4 · level 19") and, past 60, the Depth tier | changes the numbers, the added enemy types and abilities shown |
| Weekly line | Challenge only: "Challenge loot this week: 2/3 bosses · resets Monday 06:00" (canon W5; Normal bosses have no limit) | — |
| Overview | lore, entrance location ⌖ (if discovered), group size (5), recommended level, the deepest Depth you have cleared | — |
| Bosses sub-tab | per boss: 3D model, lore line, **abilities by phase**, each with its **telegraph icon** (§14.4 colour + shape glyph), numbers ("deals 3 400 fire damage in an 8 m circle, 2.0 s warning"), tags: [Interrupt] [Dispel: Magic] [Tank swap] [Soak 3] [Kite] [Line of sight] [Enrage 6:00]; abilities that exist only on Challenge or from a Depth tier marked "Challenge" / "Depth 10+"; role tips (Tank / Healer / Damage) as three short lines | click an ability: plays a 3 s ghost preview of the telegraph on a flat floor |
| Dialog opportunities | known answers listed with what they did; unknown ones "???" with a count "2 / 3 found" | — |
| Secret boss | "???" until found; then name + how to summon it | — |
| Loot sub-tab | item grid for this boss/difficulty/Depth; filters **Your class** (default), All classes; slot dropdown (**Any**, Head, …); each item shows drop chance band (Common/Rare/Very rare) and, at deep Depths, the better rarity odds and special-rarity chance (page 12 owns them); souls this boss can drop marked with the soul glyph | hover = item card; ★ wishlist (shows "On your wishlist" toast when it drops) |
| Map sub-tab | the dungeon floor plan with boss rooms numbered; rooms revealed as you enter them, shrines and chests found (page 12) | — |
| Secrets sub-tab | one line per dungeon: "???" until **you** have found its secret boss, then the unlock condition in full; a hint line after your third clear (page 12) | — |
| Records sub-tab | clears per difficulty, best time, deaths per boss, **deepest Depth cleared**, secret kills | — |
| Depth sub-tab | the Depth ladder for this dungeon (page 12 owns the numbers): each Depth's level (+3 per Depth until 60), then past 60 the health, damage and pack-size steps; every **Depth tier** (each 5 Depths) with the new enemy types and new enemy abilities it adds, and the reward line (rarity odds, jewels, souls, special rarities) | click a tier: the new enemies' bestiary pages |

**Empty:** a dungeon with no bosses killed ever still shows everything (the journal is a guide, not a
reward). **Resolved (00 §10):** every boss ability is visible from the start; only secrets stay hidden.
The **World bosses** tab is the same list as `scr_world_boss_tracker` (§7.10.2).

---

## 10. Groups and social

All four windows below are **tabs of one Social window** opened with `P` (page 02 `social`): **Party**
(`scr_party`, with its Leader tools and Loot limits sub-tabs), **Dungeon Finder** (`scr_dungeon_finder`),
**Friends** (`scr_social`) and **Guild** (`scr_guild`). `P` opens it on the last tab used.

### 10.1 `scr_dungeon_finder` — Dungeon Finder

(new; page 15 owns the queue rules, page 12 owns Normal / Challenge / Depth) **Open:** `P` → **Dungeon
Finder** tab. **Unlock:** 6, quest `q_hv_the_barrow_bell` (page 07; before then the tab reads "The
Dungeon Finder opens at level 6, with a quest from the Warden Captain in Brightwater. Until then, ask in
/lfg or invite people you meet.").

**Only discovered dungeons are listed** (canon 00 §8, §12.1 W9): a dungeon appears here once this
character has walked up to its entrance or arrived there by a teleport (a Mage's Portal, an Oracle's
Guiding Call, a scroll — page 20). A line under the list says how many exist and are still to find.

```
+------------------------------------------------------------------------------------------+
| SOCIAL (P)  [Party] [Dungeon Finder] [Friends] [Guild]  ›  [Find a group] [Listings]     |
+-----------------------------------+------------------------------------------------------+
| I can play: [Tank][Healer][Damage]| SELECTED                                             |
|   (Support counts as Damage)      |  THE DROWNED MILL · Mossfen · levels 9–12            |
| Difficulty: (•) Normal ( ) Challenge  Depth: [ 3 v ]  → level 18, Depth tier 0      |
|                                   |  Loot: Normal, no weekly limit                       |
| [x] Random discovered dungeon     |  Depth 3 adds: +2 enemies per pack                   |
|     (for my level)                |                                                      |
| [x] The Hollow Barrow   5–7  D≤7  |  Estimated wait: Damage 6 min · Tank 1 min           |
| [ ] The Drowned Mill    9–12 D≤3  |                                                      |
| [ ] Shaft Seven Mines  13–16  —   |  [ Join the queue ]                                  |
| 3 of 16 dungeons discovered.      |                                                      |
| 13 more to find in the world.     |                                                      |
+-----------------------------------+------------------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Role toggles | Tank / Healer / Damage; only roles your class has (page 00 §6: primary + hybrid); Support classes tick Damage with a "Support" note. The **Paladin**'s role follows its sworn oath (Keeping = Tank, Mercy = Healer; `classes/paladin.md`) and the toggle shows the oath's icon | at least one required | "{Class} can play: {roles}. Hybrid roles are tuned for the open world, Normal and moderate Depth (page 06)." |
| Difficulty | **Normal** · Challenge (level 60; the harder version with the full boss mechanic set, canon W4). Challenge greyed below 60: "Challenge mode opens at level 60." | radio | — |
| **Depth picker** | a number dropdown **0 … the deepest Depth unlocked** on the ticked dungeon(s) (page 12: a Depth opens once the dungeon is cleared on Normal, and each Depth cleared opens the next). Beside it: the dungeon's **level at that Depth** (+3 per Depth until 60) and, past 60, the **Depth tier** (every 5 Depths) with its added enemies, abilities and reward odds in one line | with several dungeons ticked, the dropdown offers only Depths every ticked one has; "Random" queues at Depth 0 | "Depth raises the dungeon's level by 3 per Depth until it reaches 60. Past 60, each Depth is harder and pays better (page 12)." |
| Dungeon checklist | every **discovered** dungeon, with its level band and **"D≤n"** (the deepest Depth you may pick there); greyed with the reason when out of reach ("Too low: level 13 needed", "Not cleared on Normal yet — no Depth"); "Random discovered dungeon (for my level)" at the top | tick one or more | the dungeon journal's overview |
| Discovery line | "{n} of 16 dungeons discovered. {m} more to find in the world." | click: opens the map's Find tab on Dungeons | "Walk up to a dungeon's entrance, or have a Mage open a Portal or an Oracle call you there." |
| Loot line | "Normal: no weekly limit" or "Challenge: this week 2/3 bosses looted" (canon W5) | — | — |
| Wait estimate | per role, from the server | — | — |
| Join the queue | primary; becomes **Leave queue** + a timer "In queue 3:12"; the minimap eye spins | — | — |
| Follower fill | "Fill empty slots with followers after {n} min" (page 15; `set.social.finderFollowersNow` fills at once). Normal only: every Normal dungeon is finishable solo with followers (canon pillar 6) | — | — |
| Deserter lock | "You left a group early. You can queue again in 24:10." | — | — |

**Listings** tab (premade groups): title, dungeon, difficulty, **Depth**, roles needed (icons), leader,
members "3/5", note, **Apply** (with role + note); your own listing form: dungeon dropdown (discovered only
— a leader may list an undiscovered one only if they have discovered it), difficulty, Depth, title (max
40), note (max 120), minimum level. Filters: dungeon, difficulty, Depth range, "Roles I can fill". Empty:
"No groups listed for that. List your own."

**Entering a dungeon you have not discovered** (you joined a listing for one): the group card says "You
have not discovered The Glass Tombs. You can still enter with this group; it counts as discovered once you
are inside." (Discovery by being brought is the point of W9.)

### 10.2 `scr_party` — party management

(new) **Open:** `P` → **Party** tab, or right-click your portrait. **Unlock:** 1. A party is at most **5**
(followers take slots; class companions do not — canon 00 §10).

| Element | Shows | Interactions |
|---|---|---|
| Members | 5 rows: portrait, name, class, role icon, level, zone, online; followers marked "(follower)" | right-click: Promote to leader, Set role, Kick, Whisper, Inspect, Target, Set as watch target |
| Invite | name box + **Invite** | — |
| Loot | a read-only line: "Personal loot — everyone gets their own." (canon W5/W18; no other rule exists) | — |
| Difficulty (leader) | **Normal** / Challenge, and a **Depth** dropdown (the deepest Depth every member has unlocked on the chosen dungeon) | locked inside a dungeon |
| Buttons | Ready check, Role check, Reset dungeons, Leave party | — |
| Markers | "Everyone can place markers" checkbox (leader; default off) | — |
| Leader tools | sub-tab = `scr_leader_tools` (§10.2.1) | — |
| Loot limits | sub-tab = `scr_loot_limits` (§10.2.2) | — |
| Followers | "Fill empty slots with followers" (solo/Normal): dropdown per empty slot of your hired followers | — |

#### 10.2.1 `scr_leader_tools` — group leader tools

(new; was `scr_raid_leader`; canon W16 keeps ready check, pull timer and world markers) **Opens:** Party
tab → **Leader tools**, or `Shift+P` (page 02). Usable by the party leader; read-only for everyone else
("Only the party leader can use these."), unless the leader ticked "Everyone can place markers".

| Tool | Control | Notes |
|---|---|---|
| World markers | 8 buttons — **Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye** (canon W23) — + **Clear all**; keys `Shift+Num 1`–`8`, `Shift+Num 0` clears; `/wm 1-8` | placed at the aim point; ground discs with a light column, drawn on the minimap and never in a page 11 telegraph colour |
| Target icons | the same 8 symbols; keys `Num 1`–`8`, `Num 0` clears; `/mark` | anyone in the party can set one |
| Ready check | **Ready check** button; `/ready` | the 30 s card in `scr_invite`; results on the party frames and in chat; 30 s cooldown |
| Role check | button | — |
| Pull timer | **Pull** button + seconds (5–15, default 10, `set.group.pull_timer_length`); `/pull 10` | drives `hud_pull_timer`; the same button cancels |
| Party warning | text box; `/pw` | shown to the party with `hud_warning_banner` in orange |
| Difficulty and Depth | as `scr_party` | out of combat, before entering |

#### 10.2.2 `scr_loot_limits` — weekly loot limits

(new; was `scr_raid_lockouts`) **Opens:** Party tab → **Loot limits**. **Unlock:** 60 (before then the
sub-tab reads "Nothing here limits your loot yet. Challenge-mode bosses and world bosses give loot once a
week each."). Canon W5: the weekly limit applies **only** to Challenge-mode bosses and world bosses; Normal
bosses and Depth runs have none (page 12 owns Depth rewards).

| Row | Shows |
|---|---|
| Challenge dungeon | name, each boss ✓ looted this week / ✗ not yet |
| World boss | name, region, ✓ / ✗ this week |
| Footer | "Resets Monday 06:00 server time — in 3 days 14 hours." |

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
focus **Any**/Levelling/Dungeons/Challenge and Depth/Professions/Social).

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
| Inbox rows | sender, subject, attachment icons (max 8 items + gold), days left (mail kept 30 days; Trading Post sales and returns 7), "COD {price}" tag | click opens; **Take all** button |
| Open letter | text, attachments (click to take), gold (take), **Reply**, **Return**, **Delete** (confirm if attachments) | — |
| Send | To (name, autocomplete from friends/guild), Subject (max 64), Body (max 500), up to 8 item slots (drag from bags), gold amount, **Cash on delivery** checkbox, postage cost "{n} gold" (page 15), **Send** | — |
| Errors | "No character called {name} on this realm." / "Quest items cannot be mailed." / "Not enough gold for postage." / "{name}'s mailbox is full (100)." | — |

**Empty:** "No mail." Overflow from full bags arrives as "Carried for you" letters from the Postmaster.

---

## 11. Damage meter and combat log

### 11.1 `scr_meter` — damage meter

(reuse+: `meters/js/meter.js`, `meters/js/meter-ui.js` — the playground's Skada-style meter experiment,
already dropped into the Emberveil 2 prototype as its meter tab; canon W16 keeps it) A small dockable panel
(default bottom-right above the toasts, 300×220, resizable 220–600 × 140–600 px). **Unlock:** 1 (page 02;
page 07's ladder does not gate it). Toggle: `Shift+M`, or `/meter`. Page 05 calls it `scr_damage_meter`.
Page 04 §6.13 owns its options (`set.interface.meter*`).

**How it is fed** (reuse, unchanged API): the combat code calls the meter's `record()` for every hit, heal,
miss, absorb, status and death with source, target, via (spell or item), type, crit, overkill,
blocked/mitigated/absorbed, overheal and killing blow — exactly as Emberveil 2 does. Wildmarch adds the
**tags** of the spell or attack to each record so the meter can split by tag, and the server sends each
party member's records to the others (page 15: no meters on strangers).

| Element | Values / shows | Source |
|---|---|---|
| Scope dropdown | **This fight**, Whole instance / session ("all fights ({n})"), then one entry per fight labelled "{boss or first enemy} {time}" (max 50 kept) | reuse |
| Mode buttons | **Damage done**, Healing, Damage taken, Absorbs, Statuses, Deaths, + new: **Interrupts**, **Dispels**, **Threat**, **By tag** (damage split by tag: Fire 42%, Area 30%… — for checking a tag build) | reuse + new |
| Bars | one per group member (+ followers/pets folded into owner, toggle), width % of the top, "{total} ({per second}/s)" + sparkline | reuse |
| Drill-down 1 | click a bar: that actor's sources (spell or pet), each with total, hits, avg, max, crit %, absorbed, blocked, overheal | reuse |
| Drill-down 2 | click a source: every hit (time, target, amount, crit ★, overkill, absorbed, blocked, type) | reuse |
| Deaths mode | per death: time, killing blow, "Recap" opens the same 10 s table as the death screen | new |
| Header | "{duration} · total {n}" + summary line (misses, blocked, absorbed, overheal, statuses, deaths) | reuse |
| Report | button: posts the top 5 to a chat channel (dropdown **Party**, Say, Guild, Whisper…); `/meter report` | new |
| Reset | button + "Reset on entering a dungeon" option (`set.interface.meterResetOnEnter`, **on**); `/meter reset` | new |
| Per-item kills (reuse) | the meter's per-item kill counts feed **Living** items' growth (§7.2.1) | reuse |

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
| WARDEN HALE          the Wardens (Vale watch) · Brightwater × |
| [portrait]  "The barrow's woken again. You have the look  |
|              of someone who doesn't mind the dark."   ▶   |
|  1  ! The Barrow Wakes (Main story, level 6)              |
|  2  ? Rats in the Granary — ready to hand in              |
|  3  Tell me about the Wardens.                            |
|  4  [Shop] Show me your wares.                            |
|  5  Goodbye.                                              |
|  Standing: Welcome (1 240 / 3 000)                        |
+-----------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Header | name, role · place, ×; portrait (3D head) | Esc / E closes (reuse) |
| Line | the NPC's line, spoken with their formant voice through Lingo (reuse: `shared/voices.js`, speech); ▶ replays; the same line floats as a bubble over their head for players nearby | — |
| Options | numbered 1–9: quest offers (gold `!`), turn-ins (gold `?`), lore topics, service buttons [Shop], [Train], [Unbind], [Bank], [Stable], [Learn a profession], [Bind the Recall Stone], [Travel] which open the matching window | click or number keys |
| Standing | faction band with the NPC's faction | — |
| Class/rep-gated options | shown only when met, tagged "(Warrior)" or "(Trusted)" | — |

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
distance, "{gold} · {xp} XP", **Take it** / "taken"; Esc closes. Wildmarch uses it for repeatable region
jobs (page 14; there are no daily or weekly quests, canon W20). Empty: "Nothing is pinned to the board today. Come back after
something happens in this region." (reuse)

### 12.4 `scr_vendor` — vendor

(reuse+: farhold talkui trade block) Opens beside the Bags tab (the bag stays usable).

| Element | Values / shows |
|---|---|
| Tabs | **Weapons**, Armour, Consumables, Materials, Recipes, Mounts (stable master only), **Buy back** (last 12 sold, this session) |
| Row | name (rarity colour), spec line (reuse `specOf`: slot · damage/armour · level N), upgrade mark ▲/▼ vs worn, price with coin icons, reputation discount "−10% (Trusted)", **Buy** (disabled with "That is {price} and you have {gold}.") ; Shift+click buys a stack (quantity popup 1–200) |
| Cannot-use | row tinted red, "Your class cannot use this" |
| Sell | drag from bags onto the vendor window, or right-click in bags; Junk (grey) has a **Sell all junk** button |
| Repair | **Repair all** "Repair everything: 12 gold" + per-item repair from the Gear tab (page 08); guild repair option if the rank allows |
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
- **Second Loadout** (Unbind tab, level 30, page 07 owns whether a quest is needed): once earned, a
  **Loadouts** row shows the two saved builds (§6.1); switching is on the character sheet header. Unbinding
  touches only the active loadout.
- Empty: "You have not taken a talent yet." / "You have not spent a perk point yet." (reuse)

### 12.6 `scr_craft_bench` — profession station (craft and salvage)

(reuse+: farhold Crafting and Upgrade tabs, `js/craft.js`, `data/crafting.json`; page 08 calls it
`scr_bench`; **page 19 owns** which station serves which profession and every recipe) **Open:** `E` at a
profession station — a Forge (Blacksmithing), Tanning Rack (Leatherworking), Loom (Tailoring), Jeweller's
Bench (Jewelcrafting), Enchanting Circle (Enchanting), Workbench (Engineering), Alchemy Table (Alchemy);
stations stand in every hub. **Unlock:** 9 (page 07). Anyone may **salvage** at any station; only the
matching profession may **craft** there.

Tabs: **Craft** (your profession's recipes that use this station — the same list and detail as §7.11,
with the Craft buttons live because you are at the station), **Upgrade** (Farhold's Temper / Reinforce /
Promote / Inscribe / Reweave / Recast / Brand actions, where page 08 and page 19 keep them), **Salvage**.

| Tab | Columns | Elements |
|---|---|---|
| Craft | Recipes / What to make / The station | recipe list (filter **All**, Can make now, Weapons, Armour, Jewellery, Consumables, Socketables; search); bases with "a–b dmg · N armour · two-handed · your class cannot hold this"; cost table "have / need" per material (green/red); "What comes out: {rarity range} {base}, level {n}"; skill-up chance; **Craft** ×1/×5/×max; refusals "Not enough {material}: have 3, need 5." · "This is a Loom. Your profession is Blacksmithing — find a Forge." |
| Upgrade | Pick an item / What you can do / What it becomes | scope chips **Everything**, In bags, Worn; actions (Farhold `CHANGE_TEXT` sentences); warnings ("Every property is rolled again. The item can come out worse.") |
| Salvage | a drop zone + list | drag items in; preview "You will get: 4 Barrow Iron, 1 Shimmer Dust"; **Salvage** (confirm for Epic+, special rarities and anything with a filled Jewel or Soul socket — "Take the jewel out first, or it is lost") |

Empty: "Pick a recipe." / "Nothing on the station. Pick something on the left." (reuse)

### 12.7 `scr_bank` — bank

(new) **Open:** banker NPC in any hub or Highcourt. **Unlock:** 11, quest `q_hc_keys_to_the_city`
(page 07). Main bank 48 slots + 6 purchasable
bag sockets (page 08 prices), a **Materials** tab (every material, stacks of 999, account-wide proposed),
**Account bank** tab (shared by your characters on the realm, 48 slots; every item may go in except quest
items: "Quest items stay with Wren."). Search, sort, **Deposit all materials** button, gold is **not** stored
(page 08). Drag between bags and bank; Shift+right-click moves a stack.

### 12.8 `scr_trade` — player-to-player trade

(new) Two columns, 8 item slots each + gold field. Each side has **Lock** then **Trade**. Changing
anything after a lock unlocks both sides. Red warning: "Mira changed the offer." Refusals: "Quest items cannot be traded." / "Too far away (max 10 m)." /
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
| Sell | drag an item in; suggested price from the last 20 sales; duration dropdown **12 h**, 24 h, 48 h; deposit fee and the cut shown ("Deposit 2 gold · 5% on sale") — page 15 owns rates |
| My listings | cancel (deposit lost) |
| History | your sales and buys, 30 days |

Quest items are refused with the reason (everything else can be sold, canon W18). Sales arrive by mail.

### 12.10 `scr_gambler` — gambler

(reuse+: farhold `js/town.js` `CRATE_TIERS`, `gamble()`; page 08 §12.7 owns crates and prices) **Open:**
talk to `npc_gambler` (towns of size 3+). **Unlock:** 1. One row per sealed crate — **Plain** (Common
floor), **Marked** (Uncommon), **Sealed** (Rare), **Warded** (Epic) — each with its floor, "{n}% chance of
one tier better", and the price at your level. **Buy** opens the crate at once through `scr_loot_popup`. Refusal: "That crate is
{price} and you have {gold}."

### 12.11 `scr_tinker_toolbelt` — Tinker toolbelt

(new; [classes/tinker.md](classes/tinker.md) §2.1) **Open:** Tinker only — `E` at any Workbench (towns,
camps), or the **Toolbelt** button on the Spellbook out of combat. **Unlock:** 20 (Tinker Calling II).
Three columns, one per Device — **Cog Sentry**, **Springtrap Mine**, **Iron Walker** — each listing its
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
**Hide** toggles for head, shoulders and back. **Outfits**: save and swap full looks out of combat.

### 12.14 `scr_jeweller` — socketing (Gem, Jewel, Soul, Gadget)

(new; canon 00 §12.3; **page 08 owns** which items get which sockets, how many, and every price) **Open:**
talk to `npc_jeweller` (every hub and Highcourt). **Unlock:** the first socketed item you own. Three
columns: **Your items** (worn first, then bags; filter chips **Has an empty socket**, **All socketed**) /
**The item** (its card, §7.2.1, with the socket rows enlarged as drop targets) / **Your socketables**
(gems, jewels, souls and gadgets from the Socketables bag, filtered to what fits the selected socket).

| Element | Shows | Interactions |
|---|---|---|
| Socket rows | one per socket, in the order Gem · Jewel · Soul · Gadget, with its kind glyph (§7.2.1) | drag a socketable onto a row, or click the row then the socketable |
| Fit rule | a socketable that cannot go in the selected socket is greyed with the reason: "Jewels go in Jewel sockets." · "This soul needs a weapon." · "This soul is for Rangers." · "Needs level 60 to socket." | — |
| Gem preview | a gem shows **the effect for this item's type** big (armour / weapon / jewellery, canon) and the other two small below, so the player learns the rule | — |
| Before / after | the item card's affected lines, old → new, with ▲ ▼ | — |
| Socket | **Socket it** (price in gold from page 08); a **Jewel** or **Soul** asks first (`scr_confirm`): "Removing it later costs {n} gold." | — |
| Remove | per filled row: **Remove** — a gem comes out whole for free; a jewel, soul or gadget for the page 08 price | — |
| Combine (gems) | three of a grade → one of the next (page 08 owns the grades and price) | — |

**Empty:** "None of your items has a socket. Sockets appear on some Uncommon-and-better drops, and on
crafted gear (page 08)." **Refusal:** "Your bags are full. Make room for the gem you are taking out."

### 12.15 (removed) — the weekly vault

Removed in round 2: it paid out for timed keys, raids and PvP, which are gone or changed (canon 00 §12.1
W3, W6, W1). The id `scr_vault` must not come back.

### 12.16 `scr_stable` — stable

(new; page 08 §20.1 owns mounts) **Open:** talk to `npc_stablemaster` (hubs). **Unlock:** 10, quest
`q_hc_saddle_and_bridle` (Riding I, page 07). Tabs: **Buy** (the stablemaster's mounts: name, creature,
speed as a multiplier on the walk, jump, gallop time, level needed, price), **Stable** (every mount look you
have learnt, account-wide: pick one to show on your equipped mount item — its affixes stay), **Training**
(your riding rank and the speed cap it allows — Riding I 8.6 m/s, II–IV 10.8 m/s on the ground, IV 13.5 m/s
in the air — with the next rank's quest and level: 20, 40, 60). The **Buy** tab lists the land species of page 08's catalogue — horses, great elk, boars, lizards,
beetles, raptor-like runners, a crested plains-strider, and the **giant frogs** (aquatic hybrids that swim
from Riding I, page 02 §5.5) — each with a "Swims" / "Glides" chip where it applies.

### 12.17 `scr_travel_station` — Travel Method station board

(new; canon 00 §12.1 W15; **page 20 owns** every route, speed, schedule, wait time and fare, the
snap-back rule and the station ids, `tms_<snake>`) This screen is the **station board**; waystones are
not a travel menu — they are teleport targets (for class spells and scrolls, from level 12) and Recall
Stone bind points (page 20). **Open:** `E` on a station's sign or keeper. **Unlock:** 12, quest
`q_hc_the_waywardens_oath` (page 07); before then the board reads "The keepers only carry people they
know. Speak to the Waywarden in Highcourt." A station appears on the map once you have been near it.

Travel Methods are **wagons, horse and creature trails, giant striders, boats, barges, trains and flyers**,
much faster than walking, on **known routes along real roads and paths**, and they **protect riders** from
weather and enemies. Two kinds of departure (canon):

* **Leaves when full, or after a wait** — like a bus: it waits up to a set time (page 20) for riders, then
  goes; it leaves early if every seat is taken.
* **Scheduled** — trains, boats, barges: they arrive and leave on a timetable; you wait for it to
  arrive, and everyone waiting boards together.

```
+-----------------------------------------------------------------------------------------+
| BRIGHTWATER STATION · the Waystone keepers                                     × (Esc)  |
+-----------------------------------------+-----------------------------------------------+
| ROUTES FROM HERE                        | GREYRIDGE ROAD WAGON  (leaves when full)      |
| ⟨wheel⟩ Greyridge Road Wagon  → Anvilgate|  Brightwater → Millford → Stonecross → Anvilgate|
|    leaves in 0:42 · 3/8 riders waiting  |  about 11 min · fare 4 gold                   |
| ⟨boat⟩  Fen Barge          → Reedhollow |  Waiting: 3 of 8 seats · leaves in 0:42        |
|    scheduled · arrives 2:10, leaves 3:10|    (or at once when the 8th rider boards)     |
| ⟨strider⟩ Longleg Strider  → Highcourt  |  Stops: [Millford] [Stonecross] [Anvilgate ✓] |
|    not discovered: Highcourt station    |  Your party: Borin ✓ boarding · Pell (40 m)   |
|                                         |  [ Board — get off at Anvilgate ]  [ Wait ]   |
|  ARRIVALS                               |  [x] Board by myself when it is ready          |
|  Fen Barge from Reedhollow · in 2:10    |                                                |
|  Greyridge Wagon from Anvilgate · 6:30  |                                                |
+-----------------------------------------+-----------------------------------------------+
```

| Element | Shows | Interactions | Tooltip |
|---|---|---|---|
| Routes list | every route leaving this station: kind icon (wagon, trail horse, strider, boat, barge, train, flyer), name, destination, and its **departure state**: "leaves in 0:42 · 3/8 riders waiting" (bus-like) or "scheduled · arrives 2:10, leaves 3:10" (timetable) or "boarding now" | click selects | the whole line with its stops and total time |
| Undiscovered destination | a route to a station you have not reached is listed greyed: "not discovered: {station}" — you may still ride it (discovery by arriving, canon W9) unless page 20 says a route needs the far end known | — | — |
| **Departure countdown** | big "leaves in m:ss"; for a bus-like route also "or at once when the {n}th rider boards" | — | — |
| **Waiting for riders** | seats "3 of 8" with a seat icon per rider (party members named, others counted); a rider who boards appears at once | — | the riders' names if they are in your party or guild |
| **Scheduled arrivals** | the Arrivals list: each vehicle coming into this station, from where, "in m:ss"; a delayed one reads "late — about 1:20" | — | — |
| Stops | the selected line's stops as chips; click one to choose **where you get off** (the last stop by default); ✓ on your pick | click | — |
| Fare | in gold (page 20); "free for Trusted with the Wardens" style discounts from reputation | — | — |
| Party | who in your party is here, boarding, or too far (with distance) | — | — |
| Board | "Board — get off at {stop}" — boards now if the vehicle is here, else puts you in the waiting list for the next one (you may walk around the station within 30 m) | click, or `E` near the vehicle (page 02 §5.18) | — |
| Wait | closes the board and keeps your place for the next departure; the HUD shows "Waiting for the Greyridge Road Wagon — leaves in 0:42" | — | — |
| Auto-board | checkbox, `set.gameplay.auto_board` (default **on**) | — | "Board by yourself when it is ready and you are within 30 m." |
| Board with party | `set.social.boardWithParty` — party members get a "Board with {name}?" card when you board (§5.10) | — | — |

**Empty:** a station whose routes all need a later unlock: "No routes you can take from here yet." **Errors:**
"Not enough gold for the fare (4 gold)." · "You are in combat. Board once the fight is over." · "This
route is closed while {event} goes on." (page 14 events may close a route; page 20 owns when).

While riding, `hud_travel` (§4.19) replaces this board.

### 12.18 `scr_recall_bind` — bind the Recall Stone

(new; canon 00 §12.1 W24; page 20 owns the cast time, cooldown and the list of bind points) **Open:** `E`
on a waystone or safe landmark **in a town or other populated, safe place** → **Bind the Recall Stone
here**. Never offered at a dungeon or a wild landmark. **Unlock:** 7 (page 07); every character starts
bound at **the First Waystone** in Brightwater (`lm_first_waystone`).

```
+------------------------------------------------------+
|  BIND YOUR RECALL STONE                              |
|  [waystone art]                                      |
|  Here: Reedhollow Waystone, Mossfen                  |
|  Now:  the First Waystone, Brightwater (Hearthvale)  |
|  Using the stone: 10 s, then 30 min before again.    |
|  [ Cancel ]                    [ Bind it here ]      |
+------------------------------------------------------+
```

| Element | Shows | Interactions |
|---|---|---|
| Here / Now | the new place and the current bind, each with region | — |
| Rule line | the cast time and cooldown (page 20's numbers) | — |
| Bind it here | binds instantly, free; toast "Your Recall Stone is bound to Reedhollow Waystone."; the map and minimap move the house mark | click |
| Cancel | default focus | Esc |
| Refusal (not a bind point) | the prompt never offers Bind; `/recall` from there still works | — |

The **Recall Stone** itself (`it_recall_stone`) sits on the action bar's shared keys (`Home`, §4.9) and in
bags; its item card shows the bound place and the cooldown left.



### 12.19 `scr_retrace_map` — the Chronomancer's Retrace map

(new; [classes/chronomancer.md](classes/chronomancer.md) owns the numbers; canon 00 §6: **Retrace**
returns the party to a spot one of them stood on in the last 10 minutes) **Opens:** the Spellbook's
**Retrace map** button, or casting Retrace (the map opens and the cast waits for a pick). Chronomancer only,
out of combat.

| Element | Shows | Interactions |
|---|---|---|
| Trail map | the local map with each party member's **path over the last 10 minutes** as a line in their class colour, fading with age; ticks every minute ("−3 min") | hover a point: who stood there and when |
| Pick | click a point on any trail: a gold marker and "Retrace here: {place}, 6 min ago" | click |
| Party list | who will come (members within the class file's range), with ✓ | — |
| Cast | **Retrace** — starts the cast (class file: cast time and cooldown) | click |
| Refusals | "Nobody stood there in the last 10 minutes." · "That spot is inside a dungeon you have left." · "Retrace cannot be cast in combat." | — |

---

## 13. System screens

### 13.1 `scr_settings` — settings

(reuse+: farhold `js/settings.js`; **[page 04](04-SETTINGS.md) owns every option, value and default**)
Farhold's settings were one scrolling list of groups (Controls, Picture, Audio, Debug, Keys). Wildmarch
makes it a window with a tab rail, in page 04's order: **Gameplay** (with its Targeting and Travel groups),
**Controls**, **Keybinds** (`scr_keybinds`), **Interface**, **Combat**, **Groups**, **Graphics**, **Audio**,
**Voice & Speech**, **Accessibility**, **Social**, **Online**, **Debug** (dev builds only). Control kinds
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
Class, Travel, Windows, Chat, Camera, Group, Other); **Reset keys**. A row moved from default shows "Normally {key}".
Only changed keys are saved (Farhold delta rule).

### 13.3 `scr_help` — help and tutorial overlay

(new) Two parts:

- **First-run tips** (the tutorial): small anchored callouts that point at a HUD element the first time
  it matters, one at a time, max one per 20 s, never in combat: "This is your health. Out of combat it
  refills." → the action bar at the first cast → "A red circle on the ground: step out before it fills"
  the first time a danger zone appears near you (the telegraph briefly pauses **only in Hearthvale's
  first 2 levels**, proposal) → minimap → quest tracker → bags at first loot → unlock cards thereafter.
  Each tip: text, **Got it**, "Turn tips off" (page 04 `set.gameplay.tutorialTips`). Progress saved per
  character; Settings → **Show all tips again**. (Farhold's `js/onboarding.js` step line is the pattern.)
- **Help window** (`/help`, or Game menu → Help & keys; no default key — `F1` targets yourself, page 02):
  a searchable book with chapters: Getting started, Controls (live from the
  binding table), Combat, **Reading the ground** (the telegraph legend §14.4 with animated examples),
  Targeting (page 02 §2 in plain words), Groups & loot rules, Classes (links to the class cards), Items,
  rarity, special rarities, sockets and tags, Professions, Travel (Travel Methods, waystones, the Recall
  Stone), Online manners & reporting, Browser & performance, Credits. **Report a bug** button (copies location + version + last
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
| Log out | back to `scr_char_select` after a 10 s camp timer ("Logging out in 10… [Cancel]"; instant in an inn, a city, at a waystone or while riding a Travel Method) |
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
| `--accent` | #ff7a1a | accent, primary buttons, boss speaker (was `--ember`) |
| `--accent-soft` | #ffb060 | hover glow |
| `--accent-deep` | #8a2f08 | primary button bottom |
| `--text` | #ded3c4 | body text |
| `--muted` | #9a8d7c | secondary text |
| `--parch` | #e7dcc2 | parchment surfaces (quest text, map key) |
| `--good` | #8fd08a | gains, ✓, "can" |
| `--bad` | #e07070 | refusals, losses |
| `--info` | #8fb6e8 | neutral info, links |
| `--tip-bg` / `--tip-fg` / `--tip-line` / `--tip-strong` | #16110d / #ece3d2 / #6d5326 / #f0c46a | tooltip box |
| `--xp` | gold fill `#d8b040→#8a6a10` | XP bar (no rested colour) |
| `--hp` / `--mana` / `--momentum` / `--tempo` | #3fbf5a / #4f7fff / #d8452e / #e0a030 | health and resource bars |
| `--sr-electrified` / `--sr-starwoven` / `--sr-twinned` / `--sr-ancient` / `--sr-living` | #7fd8ff / #b8a8ff / #e0e6ee / #d8b060 / #7fd06a | special-rarity accents (§14.3.1) |
| `--mob-champion` / `--mob-rare` / `--mob-named` / `--mob-boss` | #6ab0ff / #ffd84a / #ff9a3c / #ffd24a | monster rarity names (§4.16) |
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

Canon rarities with Farhold's colours (Farhold names in brackets). The second tier is **Uncommon** (blue)
everywhere — the owner's "magic items"; decided in the round-2 sweep.

| Rarity | Colour | Gem art | Item card frame (§7.2.1) |
|---|---|---|---|
| Common [normal] | #c9c2b6 | `rarity_common.svg` | plain: 1 px line, no corners |
| Uncommon [magic] | #7f95ff | `rarity_uncommon.svg` | blue line, square studs |
| Rare | #e8d020 | `rarity_rare.svg` | 2 px, small gold flourishes |
| Epic [legendary] | #ff8020 orange | `rarity_legendary.svg` (Farhold's legendary gem) | 2 px + inner line, 24 px flourishes, slow light sweep |
| Set | **#2fc4b2** teal | `rarity_set.svg` | teal, set emblem at the top |
| Unique | #ff5a3c | `rarity_unique.svg` | 3 px double line, corner gems |
| Legendary (new top tier) | **#c86bff** violet | `rarity_legendary_v2.svg` (new art, page 08 / page 17) | 3 px double line with a gold hairline, crest, shimmer |

Canon 00 §4 and page 08 own these colours. Farhold's "legendary" tier is Wildmarch's **Epic**, so it
keeps Farhold's orange; Wildmarch's **Legendary** is a new tier in violet.

Note: `shared/rewards.css` uses #45d07a for Set while Farhold `style.css` and Emberveil use #2fc4b2;
Wildmarch picks **#2fc4b2** and the shared file should follow (see report). **Monster** rarity colours
(§4.16: champion blue, rare yellow) are a separate table; a rare *monster*'s yellow name and a Rare
*item*'s yellow are the same family on purpose, but the monster plate always carries its star, so the
two never need colour to be told apart.

#### 14.3.1 Special-rarity icons (new)

(canon 00 §12.3: "a bespoke icon (an original SVG, never an emoji)") Five SVGs in
`assets/data/ui/sr_<id>.svg` (new; page 17 owns the art), drawn on a 16×16 grid, 1.5 px stroke, filled
in the special rarity's colour with a 1 px dark outline so they read on any background. Used **before the
item's name** everywhere the name is printed: chat links, the item card's name line, loot toasts, loot
panel rows, bag rows, Trading Post rows, mail attachments, the legendary banner.

| Id | Icon drawing | Colour | Size in chat | Alt text (screen readers, copy-paste) |
|---|---|---|---|---|
| `sr_electrified` | a forked lightning bolt, two branches | `#7fd8ff` | 12 px, baseline-aligned | "[Electrified]" |
| `sr_starwoven` | a four-point star with a small dot orbiting it | `#b8a8ff` | 12 px | "[Starwoven]" |
| `sr_twinned` | two interlocking rings | `#e0e6ee` | 12 px | "[Twinned]" |
| `sr_ancient` | a carved rune (an angular mark in a square stone) | `#d8b060` | 12 px | "[Ancient]" |
| `sr_living` | a sprout with two leaves | `#7fd06a` | 12 px | "[Living]" |

Rules: an icon is an inline `<svg>` (or `<img>` of the file) **inside** the link element, so a copied
chat line reads "[Electrified] Electrified Longsword" in plain text. **Never** a Unicode emoji or symbol
character (they draw differently on every system). `set.interface.specialRarityIcons` (page 04) turns
them off in chat only; the item card always shows its own.

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
| Boss banner by telegraph colour | new ids `ui.warn.<colour>` proposed for page 17 (until then: `bell.toll` pitched per colour) |
| Whisper received | `ui.open` pitched up (new id `ui.whisper` proposed) |
| Group found / ready check | `bell.toll` |
| Special-rarity drop | the rarity sting + a short layer per special rarity (`loot.sr.<id>`, new, page 17) |
| Travel Method departs / arrives | `travel.depart` / `travel.arrive` (new, page 17) |
| Harvesting skill-up / profession skill-up | `ui.skillup` (new) |

### 14.7 Motion

Windows fade 120 ms; cards scale 0.96→1 in 180 ms; banners slide 200 ms; nothing bounces. Reduced
motion removes slides, shakes and the chest animation. Hit-stop and screen shake are combat settings
(page 04, Farhold round 14), not UI.

### 14.8 Performance budget for the UI

- HUD updates run at 10 Hz for text and 60 Hz only for bars and cast sweeps.
- Party frames: 5 rows updated from one diff per server tick, never rebuilt.
- Item card portraits: one shared off-screen renderer, ≤ 2 ms a frame, 32 cached stills (§7.2.1).
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

- **Page 02:** this page uses page 02's table (`C` `I` `K` `N` `J` `Shift+J` `U` `P` `L` `M` `Shift+M`
  `Shift+P` `O`/`F10`, `Y` watch target, `F` dodge, `H` mount, `Home` Recall Stone, `Q`/`G` class keys,
  `Shift+Q` utility ring, `Shift+1`–`4` forms/coatings/borrowed bar, `Alt+1`–`4` dialog, `E` / hold Space on
  a Travel Method). Still open for page 02: a key for **HUD edit mode** (was `Ctrl+Shift+H`; proposal: none, the
  Game menu button is enough).
- **Page 04:** every option named here: `set.interface.itemPortrait`, `tooltipCompare`,
  `specialRarityIcons`, `meter*`, `clock`, `uiScale`, `minimapRotate`, `quest_tracker_max`; the targeting
  group (`set.gameplay.on_target_death` and the rest of page 02 §2); `set.gameplay.auto_board`;
  `set.social.boardWithParty`, `finderFollowersNow`; `set.combat.boss_hints`, `view_cones`;
  `set.group.pull_timer_length`, `world_boss_alerts`; health text mode, FCT per kind, nameplate
  range/overlap, colour-blind mode, latency shading, chat timestamps, profanity filter, fog of war.
- **Page 05:** the tag list (the item card, spell card, meter "By tag" mode and bag search all read it).
- **Page 07:** page 07's ladder is used — Dungeon Finder and dungeon journal 6, Recall Stone 7,
  professions 9, mount 10, bank/mail/Trading Post 11, Travel Methods and waystones 12, guild found 15,
  wardrobe 25, Second Loadout 30, Challenge mode and deep Depths 60. Watch frame and damage meter follow
  page 02 (level 1). Page 07 owns whether Second Loadout needs a quest.
- **Page 08:** 15 slots with **tool** (no light); gold only (no smaller coins); the socket rules, the
  special-rarity numbers, magic-find caps, the gem effect by item type; the new rarity art name for
  Legendary (`rarity_legendary_v2.svg` here, replacing the first draft's file name). Still open:
  durability numbers, bag sizes and bank prices.
- **Page 10:** the champion-pack affix list, the rare affix list, and the greater-rarity list with one
  badge each (the target frame and nameplates draw them, §4.4, §4.16).
- **Page 11:** ability flags `important`, `interruptible`, `wipe`, per-mechanic tether rules, dialog
  timers; the banner sound ids; the eight marker symbols' art and colours.
- **Page 12:** the Depth ladder numbers the Dungeon Finder and journal print; how a Depth unlocks.
- **Page 15:** realm types, name rules list, trade and Trading Post fees, mail postage, meter privacy,
  report pipeline, the Warcall and Carriage channels.
- **Page 16:** `tests/ui-index.test.js` (every `scr_` id exists), the "target frame never changes by
  itself" test (§4.4), the UI profile saved per character.
- **Page 17:** the item portrait models and budget, the five special-rarity card effects and icons
  (§7.2.1, §14.3.1), new sounds (`ui.card.static`, `loot.sr.<id>`, `travel.depart`, `travel.arrive`,
  `ui.skillup`, `ui.warn.<colour>`).
- **Page 19:** harvest kinds, tool tiers, the seven professions' stations and rank words, the gadget
  designer's menu and budget, the cost of changing profession.
- **Page 20:** route data for the station board (kinds, departures, waits, schedules, fares, `tms_` ids),
  the Recall Stone's cast time, cooldown and bind points.
- **Canon (page 00):** (1) the boot tagline still says "torch" although torches are gone — proposed
  "Everyone starts with a stick. The Wildmarch decides the rest."; (2) resolved in the round-2 sweep: the
  blue tier is called **Uncommon** everywhere (the owner's "magic items").
