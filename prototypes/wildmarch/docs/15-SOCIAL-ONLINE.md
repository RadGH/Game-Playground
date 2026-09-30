# WILDMARCH — Design Bible, page 15: social and online

**Status:** v0.2 draft — 2026-09-30 (round 2 applied). **Nothing is built.** Owner of this page: everything
about playing with (or near) other people — accounts, realms, zone copies, parties of five, the Dungeon
Finder, world bosses as the one open-group activity, shared Travel Methods, guilds, chat, friends, trade,
the Trading Post, mail, the guild bank, duels, anti-cheat, moderation, names — and **solo play with
followers**, which is how one person gets through content built for five.

**What round 2 changed here** (canon 00 §12): Wildmarch is an **online action RPG with an MMO-style world
and a tight small-group focus** (W39). Nothing outside world bosses, towns/hubs and trading is designed for
more than **5 players**. Raid groups, the raid finder, battlegrounds, arenas, war mode, PvP currencies and
the PvP set are gone (parked in [`WISHLIST.md`](WISHLIST.md)); PvP is **friendly duels only** (W1, W2, W6).
Loot is **personal and tradeable** — nothing is bound except quest items (W18). The only coin is **gold**
(W19, W26). There is **one player faction** (W25). Dungeons are open, and show in the **Dungeon Finder** once
you have discovered their entrance (W9). The weekly reset (**Monday 06:00**) exists only for the Challenge-mode
and world-boss loot limits (W5). There is no day/night cycle (canon §12.3).

Other pages this touches: the keys are owned by [page 02](02-CONTROLS.md), the screens by
[page 03](03-UI-SCREENS.md), the settings by [page 04](04-SETTINGS.md), duel damage rules and threat by
[page 05](05-COMBAT.md), prices, loot rules and the weekly loot limit by [page 08](08-ITEMS.md), dungeon
content, Challenge mode and Depth by [page 12](12-DUNGEONS.md), world bosses by
[page 13](13-WORLD-BOSSES.md), Travel Method routes, stations and fares by [page 20](20-TRAVEL.md), and the
server that makes all of it work by [page 16](16-TECH.md). Keys, screens and settings use the ids those
pages already fixed; anything **new** this page needs is marked **(new → page 02/03/04)** and must be copied
there by that page's owner.

> **What already exists.** Farhold is single-player. Almost nothing on this page exists in the
> playground. The exceptions are the follower system (`prototypes/farhold/js/followers.js`,
> `js/pets.js`, `js/hire.js`, `data/mercenaries.json`), the threat/taunt rule for companions
> (`js/actors.js` `aimOf`/`taunt`, round 22), faction standing (`js/factions.js`), the damage meter
> (`meters/js/meter.js` + `meter-ui.js`, used by Emberveil 2), the emote animations
> (`avatar-3d/js/chibi2-motion.js` `CHIBI2_EMOTE_ANIMS`), and NPC speech (`lingo/`, `shared/voices.js`).
> Everything else below is **(new)**.

---

## 1. Principles

1. **The server decides.** Every rule on this page is checked on the server ([page 16](16-TECH.md)). The
   client asks; it never tells. A trade, a loot roll, a mail, a duel result, a guild bank withdrawal, a
   Travel Method departure — the server does the arithmetic and writes the row.
2. **Five is the group.** A party is at most 5 (players + followers). The only places more than five
   people fight together are **world bosses**; the only places more than five gather are towns, hubs,
   stations and the Trading Post.
3. **Solo is a real way to play, not a punishment.** Canon pillar 6: every open-world zone and every
   Normal dungeon is finishable alone with followers. No XP or loot penalty for bringing followers
   instead of people (§21).
4. **Nobody can be made to see anything.** Every channel can be left, every player ignored, every
   request auto-declined. Harassment tools are one right-click away.
5. **The economy has sinks.** Every transfer of value between players costs a little (postage, market
   cut, listing deposit) so gold does not pile up forever. Page 08 owns prices; this page owns the fees.
6. **Plain names.** Channels, screens and buttons say what they do: "Party", "Trade", "Mail", not
   invented jargon.

---

## 2. Accounts (new)

| Topic | Rule |
|---|---|
| Sign-up | Email + password, or a one-time email link ("magic link"). Handled by **Supabase Auth** ([page 16 §4](16-TECH.md)). Optional sign-in with Google or Discord — **question for the owner** (`QUESTIONS.md`). |
| Minimum age | 13. The sign-up page asks for a birth year and refuses under 13. |
| Email check | An account cannot enter a realm until its email is confirmed. Offline single-player (page 16 §15) needs no account at all. |
| Two-step sign-in | Optional authenticator-app code (Supabase supports it). Accounts with it on get a cosmetic: the **Keyholder's Trim** on any tabard. |
| Account id | A UUID from Supabase (`auth.users.id`). Never shown to players. |
| Account name | Not shown in game. Players only ever see **character names** (and, for friends who opt in, an **account tag** — §10). |
| Characters per realm | **10**. |
| Characters per account | **30** across all realms. |
| One session at a time | Logging in on a second device ends the first session with the message "You signed in somewhere else." |
| Disconnect grace | If the connection drops, the character stays in the world for **20 s** (can be hit, cannot act), then is pulled out. Reconnecting within **3 min** puts the character back in the same zone copy or dungeon; after that, they return to the dungeon **entrance** (the dungeon copy keeps the group's progress until it resets, §4.6). A player who drops while riding a Travel Method stays aboard, then is set down at the next stop (§22.6). |
| Idle | 15 min with no input → "Away" tag. 30 min → logged out to character select. In a Dungeon Finder dungeon, 3 min idle in combat marks the player **Idle** for the vote-kick (§7.6). |
| Account-wide things | Mount collection, appearance collection (the Wardrobe, page 08), titles, achievement points, the Kin list (§10), cosmetic pets, the friends list. **Not** account-wide: gold, items, reputation, quest state, discovered dungeons, waystones and stations, profession skill, and unlocks earned by levelling or quests (canon pillar 1 — each character unlocks its own features as it levels). Items and gold move between your own characters by instant mail (§15). |
| Account deletion | From the account page. 14-day wait, then characters, mail and market listings are removed; character names are released after a further 30 days (§19). |
| Data export | The account page offers a JSON download of every character (the same shape as the save, [page 16 §12](16-TECH.md)). |

### 2.1 Screens (page 03)

| id | What it is |
|---|---|
| `scr_login` | Email, password or "send me a link", "Play offline" button, realm status line, version. |
| `scr_realm_select` | Realm list: name, region, type, population (Low / Medium / High / Full), your characters there, queue estimate. |
| `scr_char_select` | Up to 10 cards, the 3D figure of the selected one (`prototypes/farhold/js/figure3d.js`, reuse), Enter World, Create, Delete (type the name to confirm), Rename (if flagged), realm switch. |
| `scr_queue` **(new → page 03)** | Shown when a realm is Full: place in line, estimated wait, "leave queue". |

---

## 3. Realms (new)

A **realm** (also called a shard) is one copy of the whole Wildmarch with its own characters, economy,
guilds and chat. Characters on different realms never meet, except in the cross-realm Dungeon Finder
(§7.6).

| Rule | Value |
|---|---|
| Launch realms | **2**: one per server region (North America, Europe). More only when a realm's queue exceeds 10 min at peak for 7 days running. |
| Realm names | Invented place-words, never canon region/town names (so a realm name never reads like a map location): e.g. `Thornrest`, `Kestrel Deep`, `Lanternmoor`, `Saltwind`. |
| Realm capacity | **3,000** characters online (soft), **3,600** (hard, then `scr_queue`). The number is set by the server's measured capacity (page 16), not a design choice. |
| Realm types | **Standard** only: all PvE, friendly duels by consent (§16). There is no PvP realm type. A **Hardcore** type (one life) is a question for the owner (§25). |
| Time of day | **None.** The Wildmarch is always in daylight (canon §4); there is no sun clock to share between players. Dark-looking places (graveyards, crypts, caves) look the same to everyone because they are dark by art direction, not by time ([page 17](17-ART-AUDIO.md)). |
| Character transfer | Between realms of the same region, once per 30 days. Goes with: items, gold (capped at 10,000 g carried), reputation; mail must be empty, not a guild leader, no active market listings. |
| Realm merge | Allowed if a realm falls under 300 peak for 60 days. Name clashes: the character created later gets a free rename flag. |

---

## 4. Zone copies (layers) and phasing (new)

### 4.1 Words

- **Region** — one of the 11 regions of canon §7 (plus Highcourt). One region is one map.
- **Layer** — one running copy of a region on the server. When too many players are in a region, the
  server starts a second layer. Players in different layers of the same region cannot see each other.
- **Instance** — a private copy for one party of at most 5: a dungeon (Normal, Challenge or a Depth run)
  or a solo story scene.
- **Phase** — what one player sees differently from another *inside the same layer*, because of their
  quest progress (a burnt farm after a quest, a camp that is gone after you cleared it).

### 4.2 How many players per layer

| Region(s) | Soft cap (new layer opens) | Hard cap (nobody else joins) | Why |
|---|---:|---:|---|
| `hearthvale` | 60 | 75 | New players; keep kill-stealing and crowded quest mobs down |
| `mossfen`, `greyridge`, `sunscar` | 80 | 100 | |
| `whisperwood`, `cinder_steppe`, `frostmantle` | 80 | 100 | |
| `drowned_coast`, `riftmarch`, `kingsfire` | 90 | 110 | Fewer players at this level; merge sooner |
| `spire_isle` | 120 | 150 | Endgame hub island; people want crowds |
| `highcourt` (capital) | 150 | 200 | Social hub; the only place trade chat and the Trading Post are always busy |
| World boss grounds (while a world boss is up) | 120 | 160 | See §6 |

Budget check: a layer is also a network and draw budget ([page 16](16-TECH.md) sends at most 150
entities to one client; [page 17](17-ART-AUDIO.md) draws the nearest 30 players at full detail). A layer
cap is **not** a group size: nothing in the open world except a world boss is tuned for more than 5.

### 4.3 Layer rules

1. **Party first.** Party members are always placed in the leader's layer. Joining a party moves you to
   the leader's layer the next time you are out of combat (a 3 s fade, "Joining your party's world").
2. **Guild second.** When choosing a layer for a lone player, the server prefers the layer holding the
   most of their guild, then friends, then the fullest layer under the soft cap.
3. **No hopping to farm.** A player can change layer at most once per **60 s**, and never in combat,
   never with an open loot window, never while a nearby rare or greater-rarity monster ([page 10](10-BESTIARY.md))
   has them on its threat list.
4. **Merge when quiet.** Two layers of the same region merge when both are under 40% of the soft cap for
   5 minutes. Players are moved at the next out-of-combat moment, with the same 3 s fade. **Riders on a
   Travel Method are moved with their vehicle** at the next station, never mid-route (§22.4).
5. **What stays per layer.** Rare monster timers, the open-world monster-rarity rolls ([page 10](10-BESTIARY.md)),
   dynamic event state ([page 14](14-QUESTS-EVENTS.md)), harvesting nodes ([page 19](19-PROFESSIONS.md))
   and chests. A merge keeps the layer with the most players' state.
6. **Towns and stations.** Hub towns and Travel Method stations are part of their region's layer.
   Highcourt is its own region with its own layers.

### 4.4 Phasing

- A quest can set a **phase flag** on a character (`phase.brightwater_mill_burnt`). Objects and NPCs in
  the region data carry `phase: { show: "<flag>" }` or `phase: { hide: "<flag>" }`.
- Players in the same party in **different phases** see the **leader's** phase for shared objects, but
  quest-giver NPCs follow each player's own flags (so nobody loses a quest they have not done).
- Phased content is kept small: at most **8 phase flags** active in one region's data at once, so the
  number of combinations a tester must check stays bounded.

### 4.5 Discovery is per character

A **discovered** place is a flag on the character, never on the party or account: dungeon entrances (they
unlock that dungeon in the Dungeon Finder, §7), waystones (Recall Stone binds and teleports), and Travel
Method stations (destinations, [page 20](20-TRAVEL.md)). You discover a place by walking into its
discovery ring (page 20 gives the radius) **or by arriving there any other way** — a Mage's Portal, an
Oracle's Guiding Call, a Chronomancer's Retrace, a teleport scroll, a Travel Method stopping at the station
(canon §6, W9). This is on purpose: it gives teleport casters a social job, carrying friends to entrances.

### 4.6 Instances

| Kind | Size | Who can enter | Resets | Loot limit |
|---|---|---|---|---|
| Dungeon, **Normal** | 1–5 (players + followers) | Party members; any level in or above the band may walk in | When the last player leaves + 30 min, or on "Reset instances" by the leader | None: bosses roll loot every run (canon §10) |
| Dungeon, **Challenge** | 1–5 **players** (no followers, §21.2) | Party members at level 60 | Same, max 10 instances entered per hour per account | **Once per boss per week** per character, reset **Monday 06:00** server time (page 08 owns it) |
| Dungeon, **Depth run** | 1–5 (followers only while the run's level is under 60, §21.2) | Party members who have **cleared that dungeon on Normal** and unlocked the chosen Depth (page 12) | One run; the instance closes when the last boss dies or the party leaves | Page 12 owns Depth rewards |
| Story scene | 1 (party can join) | The quest holder | Per scene | — |

There are **no raid instances, arenas or battlegrounds** (W1, W6 — see `WISHLIST.md`). The weekly reset is
one time for every realm of a server region (so cross-realm Dungeon Finder groups agree) and is used for
nothing else: no weekly quests, no weekly caps on anything but the two loot limits above.

---

## 5. Parties (new)

### 5.1 Basics

| Rule | Value |
|---|---|
| Size | **5** — players plus followers (§21) together. There is no way to make a bigger group. |
| Invite | `/invite Name`, right-click a player → Invite, or from the friends/guild list. Invite lasts **60 s**. |
| Accept / decline | Popup with the inviter's name, level, class and a Decline-all toggle (`set.social.partyInvitesFrom`, page 04). |
| Leave | `/leave` or the party frame menu. |
| Leader | The inviter. Leader can kick, promote, set the dungeon difficulty (Normal / Challenge) and Depth, reset instances, turn on Level sync (§5.3), start a ready check or pull timer, and answer ties in a boss-dialog vote (canon §10). |
| Assistants | The leader may make any member an **assistant**: assistants can place markers and start ready checks. |
| Leader leaves | Leadership passes to the member who joined earliest. |
| Offline members | Stay in the party for **30 min**, shown greyed. |
| Range | Party members share XP and quest credit within **120 m** of the kill (same layer or instance). |
| Markers | Leader and assistants can place **8 target symbols** on enemies or players (`/mark 1-8`) and **8 world markers** on the ground (`/wm 1-8`) — page 02 owns the commands. Both use the canon icon set (W23): **Sword, Shield, Anvil, Crown, Leaf, Wave, Key, Eye**. A target symbol never changes anyone's hard target (§5.5). |
| Ready check | Leader or assistant. Every member gets Ready / Not ready for 30 s; the party frame shows the answers. |
| Pull timer | Leader or assistant: `/pull 10` (page 02) shows a centre-screen count of 3–15 s to everyone in the party. |
| Role check | Leader only. Each member picks Tank / Healer / Damage / Support from the roles their class can take (canon §6: primary and hybrid). |
| Boss dialog | When a boss offers a dialog choice ([page 11](11-BOSS-MECHANICS.md)), every player in the party votes with `Alt+1`–`4`; the most votes wins, a tie goes to the leader, followers do not vote (canon §10). |

### 5.2 XP sharing

- Kill XP is split between players in range, weighted by level (a level 10 and a level 12 split 10:12).
- If the highest-level member is **8+ levels** above the kill's level band, everyone's share is reduced
  by 25% (so power-levelling a friend is possible but slow). Page 07 owns the per-kill XP number. There is
  no rested XP (W11).
- Each player's own **XP gain** magic-find stat applies to their own share only (page 08 §Magic find).
- Followers take **no** share (§21.6).

### 5.3 Level sync ("Walk with me") (new)

A party can turn on **Level sync** from the party menu. Every member above the band of the zone they are
in is scaled down to that zone's top level (stats, item power and spell numbers, not spells known —
you keep every spell you have unlocked). Rewards are scaled to the zone. This is what lets a level 50
help a level 8 friend without deleting the content. Sync ends when the party leaves or the leader turns
it off. Page 07 owns the scaling formula.

### 5.4 Loot

**Personal loot, always** — [page 08](08-ITEMS.md) owns the rules (eligibility, drop odds, magic find,
the weekly Challenge/world-boss limit). Each player's drops are rolled for them alone, using **their own**
item-quantity and item-rarity stats. There is no master looter, no need/greed and nothing to fight over.
What this page adds is the **social** side:

- **Everything is tradeable.** No item binds when picked up or worn; the only exception is a **quest
  item**, which says "Quest item" and cannot leave your bags (W18). So a drop that is better for a
  friend is simply handed over in the trade window (§13), mailed (§15) or listed (§14) — no gift window,
  no timer.
- **Loot line.** When a party member loots a Rare or better, a special-rarity item, a jewel or a soul, the
  party sees "Mara receives: [item]" in the Loot tab (`set.combat.logLootOthers`, page 04), with the
  item's special-rarity icon (§9.3). This is how people know to ask.
- Gold is split evenly among players in range (page 08); followers take none. Each player's **gold find**
  applies to their own share.

### 5.5 Party frames, targeting and the meter

- Party chat: §9.
- **Party frames** (part of `scr_hud`, page 03): name, class icon, role icon, health bar, resource
  bar, status icons (buffs/debuffs, dispellable ones framed), range fade (members out of 40 m are
  drawn at 50% opacity), leader crown, marker symbol, "Offline"/"Dead"/"Away" tags, follower tag, a small
  cart icon while the member is riding a Travel Method (§22).
- **Targeting a party member** (canon W8): `F1` targets yourself, `F2`–`F5` the party frames top to
  bottom, or click a frame. That player becomes your **hard target** and stays it until *you* change it
  (Tab, a click, a target key) or it dies — another player getting closer, or an enemy hitting you, never
  changes it. Heals and buffs marked **Needs target** use it; **Auto-target** spells ignore friendly
  targets when they need an enemy ([page 05](05-COMBAT.md)).
- **Target of target**: the target frame shows a small "targeting: Mara" line under an enemy's name, so a
  healer can see who the boss is on. Page 03 draws it.
- **Damage meter** (W16, reuse `meters/js/meter.js` + `meter-ui.js`, as in Emberveil 2): every party member
  can open it (`Shift+M`, page 02) on the party's fights. The per-fight record is built from the
  server's combat events, so every member sees the same numbers ([page 16](16-TECH.md)). Modes: damage,
  healing, damage taken, absorbs, statuses, deaths; per fight or per dungeon run; drill-down actor → spell
  → hit. Followers appear as their own rows.
- **Boss helpers**: boss ability timers, the ready check, the pull timer and world markers (W16). The
  **Tactician** and **Oracle** class mechanics (canon §6) show extra warning information to their party;
  party frames show the name of the player a Targeted telegraph is following. Page 11 owns the telegraphs.
- There are **no raid frames** (W16 — `WISHLIST.md`).

---

## 6. World bosses — the one open-group activity

World bosses (canon §9, [page 13](13-WORLD-BOSSES.md)) are the **only** fights built for more than five
people. They do not use a bigger party; instead everyone near the boss is loosely joined.

| Rule | Value |
|---|---|
| Where | A marked area of the region, the **world boss grounds**. When a boss is up, the grounds become their own layer-set with the caps in §4.2. |
| Warning | Everyone in the region gets a banner and a map pin when the boss is about to wake (page 13 owns the timers). |
| Joining | Walk into the grounds. You are moved to the grounds layer with the most room, **with your party** (a party is never split). No invite, no queue, no size limit beyond the layer cap. |
| Muster channel | While inside the grounds you are in the **Muster** chat channel (`/mu`, **new → page 02**) with everyone else there. Leaving the grounds leaves it. |
| Parties stay 5 | Your party frames still show only your party. The boss's frame is shared by everyone. Healing and buffs land on anyone (Needs-target heals can target any player you can click). |
| Markers | Only one person marks: the first player to type `/muster lead` inside the grounds becomes the **Muster lead** for that fight (a small banner icon on their nameplate) and may place the 8 world markers for everyone in the grounds. Anyone can take it over when the lead leaves. |
| Credit | Personal. A player qualifies for loot after dealing or healing **1%** of the boss's health, or holding its attention for 5 s (page 08 owns the rule). Followers' damage does not count toward their owner's share. |
| Loot limit | **Once per boss per week** per character, reset Monday 06:00 (W5). After that you may keep helping for gold and reputation (page 13). |
| Followers | Up to 4 per player, but see "Credit". |

---

## 7. The Dungeon Finder (new)

Screen `scr_dungeon_finder` (**renamed from `scr_group_finder` → page 03**) — the **Dungeon Finder tab of
the Social window** (`P`, page 02; the tab appears at level 6 with the calling I unlock, page 07 ladder).
Two halves: **Queue** (the server builds the group) and **Listings** (players post groups; other players
apply).

### 7.1 Discovered dungeons only

A dungeon appears in the Dungeon Finder **only after this character has discovered its entrance** (§4.5,
canon §8, W9). Undiscovered dungeons are listed greyed with the line "Find the entrance in <Region> to
queue for this dungeon", and a map pin button. Dungeons are otherwise **open**: no attunement, no key, and
any party may walk in at the door.

- **Solo in queue**: you can tick only dungeons you have discovered.
- **A party in queue**: the leader ticks dungeons; a dungeon is allowed only if **every player in the
  party** has discovered it. Members who have not are named in the refusal ("Mara has not found the Drowned
  Mill yet"). This is where a Mage's Portal, an Oracle's Guiding Call or a scroll helps: carry Mara to the
  entrance once and she has discovered it for good.
- **Random Normal** picks among the dungeons you have discovered whose band fits your level.

### 7.2 What can be queued

| Activity | Queue? | Listing? | Followers can fill? | Level |
|---|---|---|---|---|
| Dungeon — **Normal** (each discovered dungeon d01–d16, or "Random Normal") | Yes | Yes | **Yes** (§7.5) | The dungeon's band (canon §8); d15/d16 at 60 |
| Dungeon — **Challenge** (each discovered dungeon, or "Random Challenge") | Yes | Yes | **No** | 60 |
| Dungeon — **Depth** (one dungeon you have cleared on Normal + a Depth up to the highest you have unlocked for it, page 12) | Yes | Yes | Only while the run's level is under 60 (§21.2) | The Depth's level (page 12: dungeon level +3 per Depth, up to 60, then harder past 60) |
| World boss | No (walk in, §6) | Yes | Yes | Region band |
| Quest / dynamic event help | No | Yes | Yes | Any |
| Professions help (a crafter offering a recipe) | No | Yes | — | Any |

### 7.3 Group shape

- Every queued dungeon: **1 Tank, 1 Healer, 3 Damage**. **Support counts as a Damage slot** (canon §4).
- A player may tick every role their class can fill (canon §6: primary + hybrid). The finder picks the
  role that makes the group fastest; the player sees the picked role on the "Group found" popup.
- **Hybrid roles in Challenge**: the finder lets a hybrid queue as its hybrid role in Challenge mode but
  shows the line "Hybrid role: tuned for Normal and moderate Depth" on the role tick (canon §6).

### 7.4 Flow

1. Tick activities (max **6** at once) and roles → **Join queue**. For Depth, pick the Depth from a
   dropdown that lists only the Depths you have unlocked for that dungeon.
2. Estimated wait shown per role, from the last 30 min of matches on that activity.
3. **Group found** popup: activity, Depth if any, your role, 40 s to Accept or Decline. Declining or
   timing out removes you from the queue.
4. When all accept, everyone is teleported to the dungeon's entrance inside the instance. When the group
   finishes (last boss dead) or someone leaves, members may **Teleport out** back to where they queued.
   (Being teleported into a dungeon from the queue does not "discover" its entrance — you already had.)
5. **Role bonus.** When a role is short (wait for Damage is 3× the wait for Tank), the short roles show
   a **Satchel** icon: completing the run gives a bag with gold and a chance at a mount (page 08).

### 7.5 Filling with followers

- A player (or a partial party) in queue for a **Normal** dungeon, or a Depth run whose level is under 60,
  sees **"Fill with followers"** after **2 minutes** (or immediately with the setting
  `set.social.finderFollowersNow`, new → page 04).
- Clicking it drops the queue and enters the dungeon at once with the player's own followers filling the
  missing roles ([§21](#21-solo-play-with-followers)). A player with no follower for a missing role gets a
  **finder hire** for that run only: a standard mercenary of the needed role at the player's level, free.

### 7.6 Behaviour rules

| Rule | Value |
|---|---|
| Deserter | Leaving a finder group before the last boss (not counting a vote-kick) → **15 min** before the player can queue again. |
| Vote to remove | Any member can start one. Needs **3 of the other 4** players. A member can start one vote per 5 min; the same player cannot be voted on twice in 5 min. Not available for 60 s after a boss pull. Reasons list: Idle, Harassment, Not doing their role, Other. |
| Idle | 3 min with no input while the group is in combat → the player is tagged **Idle** on the frames; a vote with reason Idle needs only 2 of 4. |
| Avoid list | Up to **3** players you will never be matched with again (separate from ignore). |
| Loot | Personal (§5.4). |
| Ready check | Automatic on "Group found". |

### 7.7 Cross-realm

The queue pools **all realms in the same server region** (NA or EU). Cross-realm players can party, chat
and **trade inside the instance** (loot is tradeable, §5.4); they cannot mail each other or join each other's
guilds. Their names show as `Name-Realm`.

### 7.8 Listings

- Anyone can post a listing: activity (a dungeon + Normal / Challenge / a Depth, a world boss, quest help,
  professions help), title (60 chars), description (200 chars), minimum level or minimum item score, roles
  wanted. (The game has no voice chat.)
- Others press **Apply** with a role and a short note (60 chars). The lister sees applicants with name,
  class, level, item score, role, and whether each applicant **has discovered** the dungeon, and presses
  **Invite** or **Decline**.
- Listings expire after **1 hour** or when the group is full.
- **"Needs a lift"**: a listing may be ticked "I can open a portal / pull people to the entrance"; the list
  shows a small gate icon, so undiscovered players can find a caster (canon §6 travel utility spells).

---

## 8. Guilds (new)

Screen `scr_guild` — the **Guild tab of the Social window** (`P`, page 02). Its own sub-tabs: **Roster ·
Ranks · News · Bank · Deeds · Calendar · Info**. A guild is a social club and a shared bank, not a
bigger fighting group: members still play in parties of 5. Commands `/ginvite`, `/gkick`, `/gpromote`, `/gdemote`,
`/gquit`, `/gmotd`, `/ginfo` are page 02 §6.4.

### 8.1 Founding and basics

| Rule | Value |
|---|---|
| Create | Anyone may **join** a guild from level 1. **Founding** one needs the level-15 **Guild charter** unlock (quest `q_hc_a_name_on_the_rolls`, `npc_hc_registrar_pell`, Hall of Records, Highcourt — page 07 ladder): a name, a tabard design, **4 other signatures** and **10 g**. After the charter, the **Guild Registrar** NPC (`npc_guild_registrar`) in Highcourt or any hub town handles guild business. |
| Name | 3–24 characters, letters and single spaces, unique per realm (§19). |
| Size | **500** members. |
| Emblem and tabard | Pick an emblem (40 shapes), emblem colour, border, background colour. A member who equips the **Guild Tabard** (bought from the registrar, 1 g) wears it as the Chibi 2 `tabard` decor part in the guild's colours ([page 17](17-ART-AUDIO.md), Chibi 2 decor parts). |
| Message of the day | 250 chars, shown on login and at the top of the roster. |
| Info page | 1,000 chars, readable by members. |
| Public blurb | 200 chars, shown on the guild finder listing. |
| Guild finder | A tab in `scr_dungeon_finder`: guilds post a listing (focus, any of: Social / Levelling / Dungeons / Challenge and Depth / World bosses / Professions / Trading; play times; realm); players apply with a note. |
| Leaving | Anyone but the leader can leave at any time. |
| Disband | Leader only, only when the leader is the last member or types the guild name to confirm; the bank must be empty. |
| Leader gone | If the leader has not logged in for **60 days**, the highest-ranked member who has logged in within 7 days may **claim leadership** at the registrar. |

### 8.2 Ranks

Up to **10 ranks**. Rank 1 is the leader and cannot be edited. Defaults for a new guild:

| # | Default name | Default permissions |
|---|---|---|
| 1 | Guildmaster | All |
| 2 | Officer | All except disband and editing rank 1–2 |
| 3 | Veteran | Invite, guild chat, officer chat **read**, bank tabs 1–4 view + deposit, withdraw 10 stacks/day from tabs 1–3, 50 g/day |
| 4 | Member | Guild chat, bank tabs 1–2 view + deposit, withdraw 5 stacks/day from tab 1, 10 g/day |
| 5 | Initiate | Guild chat, bank tab 1 view + deposit |

Every permission a rank can hold:

| Permission | Kind |
|---|---|
| Speak in guild chat / listen to guild chat | on/off each |
| Speak in officer chat / listen to officer chat | on/off each |
| Invite | on/off |
| Remove members of a lower rank | on/off |
| Promote / demote up to one rank below own | on/off each |
| Edit the message of the day | on/off |
| Edit the public note of any member / edit officer notes / view officer notes | on/off each |
| Edit the info page | on/off |
| Create calendar events / edit other people's events | on/off each |
| Use the guild bank for repairs | on/off + gold per day (0–10,000 g) |
| Withdraw gold | gold per day (0–10,000 g, or unlimited) |
| Per bank tab: view · deposit · withdraw stacks per day (0–1,000) | per tab |
| Post a guild finder listing / answer applications | on/off |
| Spend deed points (§8.4) | on/off |

### 8.3 Guild bank

- **6 tabs × 98 slots**. Tab 1 comes with the guild; tabs 2–6 cost **50 / 200 / 500 / 1,000 / 2,500 g**,
  paid from the bank's gold.
- Each tab has a name (20 chars), an icon, and a free-text **tab note** (200 chars).
- **Gold** is held separately. Deposits by anyone with bank access.
- **Log**: every deposit and withdrawal (who, what, how many, when) — last **250** entries per tab and
  250 for gold. Shown on the Bank tab.
- Anything can go in the bank except **quest items** (nothing else binds, W18). Gold only — there are no
  other currencies to store.
- Accessed at a **Guild Vault** NPC (`npc_guild_vault`) in Highcourt and every hub town.
- The server writes every change as one database step ([page 16 §12](16-TECH.md)) so two people taking
  the last potion at the same moment cannot both get it.

### 8.4 Guild deeds and perks

Members earn **guild deeds** by playing: 1 per quest, 5 per dungeon boss (Normal), 8 per Challenge or Depth
boss, 10 per world boss, 3 per dynamic event, 2 per crafted Rare-or-better item. **Each member's deeds
count toward the guild's total only up to 1,500**, so ten active members can take a guild to the top rank
as surely as five hundred — a big guild does not outrun a small one by headcount alone. The total sets the
**guild rank** (1–10: 0 / 500 / 1,200 / 2,000 / 3,000 / 4,500 / 6,500 / 9,000 / 12,000 / 15,000); each rank
gives one **deed point** for a perk. Perks are chosen by anyone with the permission and can be respent once
every 7 days. (There is no weekly deed cap: the weekly reset is only for loot limits, §4.6.)

| Perk (original names) | Effect |
|---|---|
| **Shared Road** | +5% XP for members while at least one other guild member is in the party |
| **Open Purse** | −10% repair costs |
| **Long Memory** | +5% reputation from every source (stacks with the reputation-gain magic-find stat, page 08) |
| **Guild Workshop** | +5% profession XP for members ([page 19](19-PROFESSIONS.md)) |
| **Swift Standard** | At a discovered waystone, pull one party member to you (5 min cooldown). Arriving this way discovers the waystone for them (§4.5) |
| **Quartermaster** | A guild vendor in Highcourt that sells potions and food at −10% |
| **Deep Vault** | Bank tabs cost 25% less |
| **Mustering Horn** | A guild-wide 1 h buff, 24 h cooldown: +3% movement speed out of combat |
| **Kin of the Road** | Resurrection costs no durability for members |
| **Banner Call** | Place a guild banner in the world for 10 min: members within 20 m regain 1% health every 5 s out of combat |
| **Reserved Seats** | Members riding a bus-style Travel Method together always get the same carriage (§22.3) |

None of these touch combat power, so a dungeon's difficulty does not depend on which guild you are in.

### 8.5 News and calendar

- **News**: automatic entries for boss kills (first kill in the guild, first Challenge clear, a new deepest
  Depth), level-60 dings, Legendary, Set, soul and special-rarity items looted, a profession reaching 300,
  achievements, members joining and leaving. Members can "cheer" an entry.
- **Calendar**: events with title, activity, date/time (shown in each viewer's own time zone), sign-up
  (Accept / Tentative / Decline + role), 40-slot cap (a world boss or a social evening can take many;
  a dungeon event is still a party of 5). Reminders 15 min before.

### 8.6 Guild housing

A guild hall is parked in `WISHLIST.md` (§20).

---

## 9. Chat (new)

The chat window is part of `scr_hud` (page 03); its combat log is a tab of it (page 04 §6.10). **Enter**
opens the input line and **/** opens it with a slash (page 02). Messages are at most **255 characters**.
**Page 02 §6 owns every command's spelling**; this page owns what each channel is.

### 9.1 Every channel

| Channel | Who hears it | Command (page 02) | Default colour | Notes |
|---|---|---|---|---|
| **Say** | Players within **30 m** (same layer/instance) | `/s`, `/say` | white | Speech bubble over the head (`set.voice.speechBubbles`, page 04) |
| **Yell** | Players within **150 m** | `/y`, `/yell` | red-orange | Bubble in capitals |
| **Emote** | Players within **30 m** | `/me`, `/em`, `/emote` | orange | Free-text "Aldric checks his boots." Named emotes: §12 |
| **Whisper** | One player on the realm (or a cross-realm group member, or a Kin anywhere) | `/w`, `/whisper`, `/t`, `/tell` | pink | §11 |
| **Reply** | Last person who whispered you | `/r`, `/reply` | pink | |
| **Party** | Your party | `/p`, `/party` | blue | |
| **Party warning** | Your party, as a centre-screen banner (page 11 banner slot, white, with the sender's name) and a sound (`ui.partywarning`, [page 17](17-ART-AUDIO.md)) | `/pw`, `/warn` **(renamed → page 02)** | white on red | Leader and assistants only |
| **Instance** | Everyone in your dungeon instance (includes cross-realm finder members) | `/i`, `/instance` | blue-grey | |
| **Muster** | Everyone in the same world boss grounds (§6) | `/mu` **(new → page 02)** | amber | Auto-joined inside the grounds, left on leaving |
| **Carriage** | Everyone riding the same Travel Method vehicle (§22) | `/car` **(new → page 02)** | light tan | Auto-joined on boarding, left on stepping off |
| **Guild** | Guild members with the listen permission | `/g`, `/guild` | green | |
| **Officer** | Ranks with officer chat | `/o`, `/officer` | dark green | |
| **Region** | Everyone in your region, all layers (e.g. all of Mossfen) | `/z`, `/zone` | tan | Auto-joined (`set.social.joinZone`); changes as you travel |
| **Trade** | Everyone in Highcourt and in any hub town (one channel for all of them) | `/trade <text>` | tan | Only while standing in Highcourt or a hub town (`set.social.joinTrade`) |
| **Looking for Group** | Everyone on the realm who joined it | `/lfg` | tan | `set.social.joinLfg` |
| **Guild Recruiting** | Everyone on the realm who joined it | `/recruit` **(new → page 02)** | tan | Guilds advertise, players ask; off by default (`set.social.joinGuildRecruit`); one post per guild per 15 min |
| **Newcomers** | Characters under level 20 in their first 7 days, plus volunteer **Guides** (§18.4) | `/new` **(new → page 02)** | light green | Auto-joined for new characters; leaves itself at level 20 |
| **Custom channels** | Anyone who joins | `/join <name>`, `/leave <name>`, `/channels`, then `/1`…`/9` | tan | Up to 9 joined; name 3–20 letters/digits; optional password; the creator owns it (kick, ban, set password, pass ownership — `/chkick`, `/chban`, `/chpass`, `/chowner`, **new → page 02**) |
| **System** | You | — | yellow | Server messages, refusals in plain words, level-ups, unlock announcements (canon rule 5) |
| **Loot** | You (and group lines "Mara receives: …", `set.combat.logLootOthers`) | — | by rarity | A tab by default |
| **Combat** | You | — | grey | The combat log; built from combat events, never sent as chat |
| **NPC** | Players in Say range of the NPC | — | beige | Lingo lines (§9.5); boss lines also go to the centre banner (page 11 §8) |

### 9.2 Chat window

- Tabs (page 04 `chatTabs`): defaults **General** (everything but combat), **Combat log**, **Loot**,
  **Whispers**; up to 8, each with a name and a channel list.
- Page 04 §6.9 owns the look switches: text size (10–22 px), fade (10 s / 30 s / 60 s / never),
  timestamps, class-coloured names, background opacity, "Enter reopens the last channel".
- An unread whisper tab flashes; `set.social.mentionHighlight` / `mentionSound` mark your name.
- History: last **500** lines per tab kept in the client; nothing stored on the server except what
  moderation needs (§18.2).

### 9.3 Links

Shift-click inserts a link: `[Item name]` (hover = the full item card with its 3D portrait and rarity
frame, one renderer everywhere — Farhold `hud.itemCard`, reuse; page 03 and [page 17](17-ART-AUDIO.md) own
the card), `[Spell]`, `[Quest]`, `[Achievement]`, `[Map pin]` (click = set a waypoint),
`[Player]` (right-click menu). `set.social.chatLinks` turns them off for the reader. The server checks
every link is real (an item link must match an item that exists, with its rolled numbers) so nobody can
post a fake legendary.

**Special-rarity icons in text.** An item with a special rarity (canon §12.3: Electrified, Starwoven,
Twinned, Ancient, Living) shows its **bespoke SVG icon** right before the name wherever the name is
printed as text — chat links, the Loot tab, mail, the Trading Post, the trade window, guild news:
`[<bolt icon> Electrified Longsword]`. The icon is one of five original glyphs drawn by page 17 (a bolt, a
star, two linked rings, a carved rune, a sprout), inlined at the text's line height and tinted the item's
rarity colour; it is **never an emoji or a font character**. The link carries the special-rarity id
(`sr_electrified`…, page 16) so the reader's client draws the icon; the server checks it like the rest of
the link. When a player copies chat out of the game as plain text, the icon becomes the word in square
brackets (`[Electrified]`). A reader can turn icons off with the link switch below.

### 9.4 Commands

Every command and its spelling is in **page 02 §6** (talking, groups, targeting, social and status,
information, emotes, developer). Commands this page adds, for page 02 to copy: `/recruit`, `/new`,
`/chkick`, `/chban`, `/chpass`, `/chowner`, `/pw` (party warning, §9.1), `/mu` and `/muster lead` (§6),
`/car` (§22), `/board` and `/stepoff` (§22), `/yield` (§16), `/ticket` (same as `/help` → Report a problem,
§18.3), `/order <attack|hold|follow>` and `/stance <aggressive|defensive|passive>` (§21.7). **Removed**
in round 2: `/ra`, `/rw`, `/pvp`, `/feud`.

### 9.5 NPCs in chat

NPC lines are generated by **Lingo** from the NPC's personality and spoken in a formant voice
(`prototypes/farhold/js/speech.js` pattern, reuse — [page 17 §8](17-ART-AUDIO.md)). The server picks
the line (so every nearby player reads the same words) and sends the text; each client synthesizes the
voice locally from the NPC's voice JSON. Line choice is seeded by the NPC id + the server tick so it is
the same for everyone.

### 9.6 Rate limits and filters

| Rule | Value |
|---|---|
| Messages per channel | 5 per 10 s; the 6th is refused with "You are sending messages too quickly" and a **30 s** hold on that channel |
| Same message repeated | Refused if identical to one of your last 3 on that channel in 60 s |
| Public channels for new accounts | An account whose best character is under level **5** and has under **2 h** played cannot post in Trade, LFG, Region or Guild Recruiting (it can use Say, Party, Guild, Whisper to friends, Newcomers) — the most effective spam brake there is |
| Word filter | `set.social.profanityFilter` (page 04: Off / Mild / Strict, default Mild). Replaces listed words with ✱✱✱ on the **reader's** side, so the sender's text is unchanged and moderation sees the original. `set.social.spamFilter` also hides the same line from the same player within 60 s |
| Links to websites | Shown as plain text, not clickable; a warning icon if the text looks like a web address |

---

## 10. Friends, Kin and ignore (new)

Screen `scr_social` — the **Friends tab of the Social window** (`P`, page 02). Sub-tabs: **Friends · Kin ·
Ignore · Recent**. Commands (page 02 §6.4): `/friend`, `/unfriend`, `/ignore`, `/unignore`, `/block`,
`/who`, `/inspect`, `/follow`.

| List | Size | What it shows | Notes |
|---|---:|---|---|
| **Friends** | 100 per character | Name, level, class, region, status (Online / Away / Busy / Offline + "last seen 3 days ago"), your private note (48 chars) | One-way: you can friend someone without asking. They are told "Aldric added you as a friend." (can be turned off: `set.social.announceFriend`, **new → page 04**). `set.social.friendToasts` announces friends coming online |
| **Kin** | 200 per account | The friend's **account tag** (a name the player picks for the account, e.g. `Radley#4412`) and which character they are on, on any realm | Two-way: both must accept. Kin see each other across realms and characters. Kin whisper works across realms (§11) |
| **Ignore** | 100 per character | Name, date added | Hides their chat on every channel, whispers, party/guild/duel/trade invites, mail (returned to sender unread), and their bubbles. They are **not** told. The Dungeon Finder also avoids pairing you if possible |
| **Block** | (the Ignore list, marked) | | `/block` = ignore **and** they cannot see you online or find you with `/who` (page 02) |
| **Recent** | last 25 | People you grouped with in the last 7 days | One-click friend, ignore or report |

Right-click on any name anywhere (chat, frames, world) → **Whisper · Invite · Add friend · Ignore ·
Trade · Duel · Inspect · Follow · Report**.

**Inspect** (`/inspect`, 10 m range; a read-only `scr_sheet_gear` of the other player, page 03): their
paper doll, item cards, talents and perks — unless they turned off `set.social.allowInspect` (page 04).
**Status** (`set.social.status`: Online / Away / Busy / Appear offline) is what friends and guildmates see.

---

## 11. Whispers (new)

| Rule | Value |
|---|---|
| Send | `/w Name message`, or Whisper from a right-click |
| Who can whisper you | `set.social.whispersFrom` (page 04): **Everyone** (default) · **Friends, guild and group** · **Friends only** · **Nobody**. Kin always count as friends |
| New accounts | Under level **10** and under **2 h** played can whisper only friends, Kin, guild and group members (anti-spam) |
| Offline target | "Mara is not online." |
| Away / Busy | `/afk`, `/dnd` (page 02): the sender gets the auto-reply; in Busy the whisper is held silently |
| Kin | `/w Radley#4412 message` reaches the Kin on whatever character and realm they are on |
| Cross-realm | Inside a finder group, `Name-Realm` works |
| History | The whisper tab keeps the last 500 lines |

---

## 12. Emotes (new; animations reuse)

Emotes are a **text line** in Emote chat (30 m) plus an **animation** on the character. **Page 02 §6.6
owns the command list** (39 original emotes); this page gives each its animation and text. Animations
come from Chibi 2 (`avatar-3d/js/chibi2-motion.js` `CHIBI2_EMOTE_ANIMS` + `wave`/`talk`, reuse) where a
clip fits; the rest are **new clips** for page 17 to author, and until each exists it plays the fallback
shown. Clips in `HANDS_FREE` put the weapon away for their length automatically. An emote with a
**target** turns the character to face it.

| Command | Animation (reuse / **new**) | Fallback until new clip exists | Text (no target) | Text (with target) |
|---|---|---|---|---|
| `/wave` | `wave` | — | Aldric waves. | Aldric waves at Mara. |
| `/bow` | `bowGreet` | — | Aldric bows. | Aldric bows before Mara. |
| `/cheer` | `cheer` | — | Aldric cheers! | Aldric cheers for Mara! |
| `/laugh` | `laugh` | — | Aldric laughs. | Aldric laughs at Mara. |
| `/dance` | `dance` | — | Aldric dances. | Aldric dances with Mara. |
| `/clap` | `clap` | — | Aldric claps. | Aldric claps for Mara. |
| `/applaud` | `clap` (longer) | — | Aldric applauds. | Aldric applauds Mara. |
| `/salute` | `salute` | — | Aldric salutes. | Aldric salutes Mara. |
| `/point` | `point` | — | Aldric points ahead. | Aldric points at Mara. |
| `/shrug` | `shrug` | — | Aldric shrugs. | Aldric shrugs at Mara. |
| `/nod`, `/yes` | `nod` | — | Aldric nods. | Aldric nods at Mara. |
| `/shake`, `/no` | `headShake` | — | Aldric shakes their head. | Aldric shakes their head at Mara. |
| `/kneel` | `kneel` | — | Aldric kneels. | Aldric kneels before Mara. |
| `/pray` | `pray` | — | Aldric prays. | Aldric prays for Mara. |
| `/sleep` | `sleep` | — | Aldric lies down to sleep. | — |
| `/sit` (also `X`, page 02) | `sitGround` | — | Aldric sits down. | — |
| `/stand` | (ends any sitting/kneeling pose) | — | — | — |
| `/stretch` | `stretch` | — | Aldric stretches. | — |
| `/toast` | `drink` | — | Aldric raises a cup. | Aldric raises a cup to Mara. |
| `/hello` | `wave` | — | Aldric greets everyone. | Aldric greets Mara. |
| `/bye` | `wave` | — | Aldric waves goodbye. | Aldric waves goodbye to Mara. |
| `/thank` | `bowGreet` (short) | — | Aldric thanks everyone. | Aldric thanks Mara. |
| `/think` | `crossArms` + head tilt | — | Aldric thinks it over. | Aldric considers Mara. |
| `/cry` | **new** `weep` | `pray` | Aldric weeps. | Aldric weeps on Mara's shoulder. |
| `/flex` | **new** `flex` | `cheer` | Aldric flexes. | Aldric flexes at Mara. |
| `/beg` | **new** `beg` | `kneel` | Aldric begs. | Aldric begs Mara. |
| `/roar` | **new** `roar` | `cheer` | Aldric roars! | Aldric roars at Mara! |
| `/facepalm` | **new** `facepalm` | `shrug` | Aldric covers their face. | Aldric covers their face at Mara. |
| `/jeer` | **new** `jeer` | `laugh` | Aldric jeers. | Aldric jeers at Mara. |
| `/beckon` | **new** `beckon` | `point` | Aldric beckons. | Aldric beckons Mara over. |
| `/warmhands` | **new** `warmHands` (only near a fire) | `crossArms` | Aldric warms their hands. | — |
| `/spin` | **new** `spin` | `dance` | Aldric spins. | Aldric spins round Mara. |
| `/shiver` | **new** `shiver` | `crossArms` | Aldric shivers. | — |
| `/tired` | **new** `tired` | `stretch` | Aldric looks worn out. | — |
| `/victory` | **new** `victory` | `cheer` | Aldric raises a fist in victory! | Aldric celebrates with Mara! |
| `/rude` | **new** `rude` | `shrug` | Aldric makes a rude gesture. | Aldric makes a rude gesture at Mara. (text hidden by `profanityFilter` = Strict) |
| `/lute` (Bard only) | `CHIBI2_ANIMS` lute hold + **new** `strum` | `dance` | Aldric plays a short tune. | Aldric plays a tune for Mara. |

- Pronouns come from the character's chosen pronouns (Lingo pronoun sets; "their" shown above).
- **Emote wheel**: hold `.` (page 02 `emoteWheel`) for a ring of 8; page 04 lets the player pick the 8.
- In combat, emotes print their text only (no animation), so a dance never cancels a dodge.
- NPCs react to `/wave`, `/bow`, `/hello`, `/thank`, `/cheer` aimed at them with a Lingo `greet` or `thanks`
  line (page 01 owns who reacts).

---

## 13. Trade window (new)

Screen `scr_trade` (page 03). **Player trade opens at level 5** (page 07 ladder).

| Rule | Value |
|---|---|
| Start | `/trade Name`, right-click → Trade, or drag an item onto a player within **10 m**. The other player gets a 30 s popup. |
| Auto-decline | `set.social.tradeFrom` (page 04): Everyone / Friends, guild and group / Nobody. `set.social.declineInCombat` holds requests until combat ends |
| Slots | **6** items each side + gold |
| Lock and accept | Each side presses **Lock**. After both lock, each presses **Trade**. Any change on either side **unlocks both** and shows what changed in yellow for 3 s. |
| Protection | If the other side lowers the gold or swaps an item after you locked, a banner reads "Mara changed the trade" and your Trade button is disabled for **3 s**. |
| Big trades | If the gold changing hands is over **1,000 g**, or an Epic/Unique/Set/Legendary item, a special-rarity item, a jewel or a soul is included, the accept button needs a second click on a confirm line listing exactly what you give and get. |
| Range | Walking over 10 m apart cancels the trade. |
| Combat | Cannot trade in combat. |
| What can be traded | Every item except **quest items** (W18). Worn, socketed and levelled items trade with everything in them: sockets and their gems/jewels/souls/gadgets, a Living item's growth, rolled affixes. |
| Currency | Gold only (W19). |
| Record | The server writes every completed trade to the economy log ([page 16 §12](16-TECH.md)): who, what, when, where. |

---

## 14. The Trading Post (market) (new)

The realm-wide player market, **the Trading Post** (W14). Screen `scr_trading_post` (page 03), opened by talking to an **auctioneer** (`npc_auctioneer`,
page 08's NPC list) in Highcourt (4 of them) or any hub town (1). One market per realm, shared by every
auctioneer. **Opens at level 11** with the bank and mail (quest `q_hc_keys_to_the_city`, page 07 ladder).

### 14.1 Selling

| Rule | Value |
|---|---|
| Listing | Pick an item from the bags, set a **price** (buyout only — no bidding; bidding adds a lot of UI and timing disputes for little gain), pick a duration. |
| Durations | **12 h**, **24 h**, **48 h** |
| Deposit | **1% / 2% / 3%** of the item's vendor sell price for 12/24/48 h (page 08's 1% proposal for the shortest), minimum **1 gold**. Lost if the item does not sell; refunded if it sells. |
| Market cut | **5%** of the sale price, taken from the seller. This is the main gold sink between players. |
| Listings per character | **50** |
| Stackables | Commodities (crafting materials, potions, food, reagents) are listed by **unit price** and sold from a combined pool: a buyer asking for 40 buys the cheapest 40 across every seller. |
| Undercut notice | Optional (`set.social.marketUndercutMail`, **new → page 04**): a mail when someone lists the same item for less. |
| Cancel | Any time; the deposit is kept. |
| Sold | The gold arrives by **mail** (§15), minus the cut, at once. |
| Expired | The item comes back by mail. |

### 14.2 Buying

- **Search**: name text, category (Weapons → by type; Armour → by slot and weight; Jewellery;
  Off-hands incl. quivers and foci; Tools; Socketables → Gems / Jewels / Souls / Gadgets; Consumables;
  Harvested materials; Crafted materials; Recipes; Cosmetic; Mounts), rarity (min–max), **special rarity**
  (any / none / each of the five), item level range (1–60, which is also the level needed, W17),
  **usable by my class**, has affix (dropdown of every affix name, page 08), **has tag** (dropdown of every
  tag, page 05 — e.g. items that add damage to *Ice* or *Area* skills), **sockets** (at least N, of kind),
  set id, price range.
- **Sort**: price (unit or total), item level, rarity, time left, name.
- **Results**: 50 per page, each row with the special-rarity icon before the name, the full item card
  (3D portrait) on hover and the green/red upgrade arrow versus what you wear (Farhold `itemScore`, reuse).
- **Price history**: for commodities and for every base item + rarity, a 14-day line of median prices
  ([page 17](17-ART-AUDIO.md) draws it in the UI style).
- **Buy**: a confirm line with the price. Bought items arrive by **mail** instantly.

### 14.3 What may be sold

**Everything except quest items** (W18): gear, worn or not, tools, quivers, mounts-as-items, gems, jewels,
souls, gadgets, materials, recipes, consumables, cosmetics. The listing form greys out a quest item with the
reason ("Quest item"). There is nothing "bound to you".

---

## 15. Mail (new)

Screen `scr_mail` (page 03), opened at any **mailbox** (every town, hub, camp with a Waystone). **Opens at
level 11** (quest `q_hc_keys_to_the_city`, page 07 ladder).

| Rule | Value |
|---|---|
| Send to | Any character on the same realm (not cross-realm) |
| Contents | Subject (40 chars), body (500 chars), up to **12 attachments** (items or stacks), gold |
| Postage | **1 gold** per mail + **1 gold** per attachment. Gold is the only coin (W19); page 08 may retune postage as a sink |
| Delivery | **Instant** between characters on the same account, friends, Kin and guildmates. **1 hour** otherwise, so a scammer cannot empty a stolen account in one sitting. |
| COD | "Cash on delivery": the sender sets a price; the receiver can only take the attachments by paying it. |
| Kept | **30 days**, then returned to the sender (if it had attachments) or deleted. COD mail: 3 days. |
| Inbox size | **100** mails; more wait on the server and arrive as space frees. |
| Return | Receiver can press **Return** on any player mail. |
| Your own characters | Mail between characters on the same account is always instant (anything but quest items) |
| Quest items | Cannot be mailed |
| System mail | Trading Post sales/expiries/purchases, event rewards, GM restores. Never a "you have been reported" notice (reports are silent). No postage; kept 60 days. |
| Ignore | Mail from ignored players is returned unread. |
| Record | Every mail with attachments or gold goes to the economy log. |

---

## 16. Duels — the only player-versus-player

**Friendly duels are the only PvP in v2** (W1). There are no battlegrounds, no arenas, no rated play, no
open-world PvP flag, no war mode, no guild feuds, no PvP currencies and no PvP gear — all parked in
`WISHLIST.md`. A player can never be attacked by another player without accepting a duel. Page 05 owns
the duel combat numbers (damage and healing scaling, control limits).

| Rule | Value |
|---|---|
| Unlock | Level **10** for both players (page 07 ladder). |
| Challenge | `/duel Name` or right-click → Duel, within **20 m**. 30 s to accept. |
| Auto-decline | `set.social.duels` (page 04): Ask me / Decline automatically |
| Where | Anywhere in the open world outside towns, hubs, stations, world boss grounds and dungeons. Not while riding a Travel Method. |
| Start | A **flag** is planted between the two; a 3 s countdown; the flag's **40 m** ring is drawn. Leaving the ring for 10 s forfeits. |
| Targeting | Each duellist's hard target is set to the other at the countdown (the only time the game sets a target for you, W8). Auto-target spells may pick the opponent only. |
| End | When one side reaches **1 health** (nobody dies), forfeits (`/yield`), or leaves the ring. Both are healed to full and cleansed. |
| Monsters | If a monster attacks either duellist, the duel ends as a draw at once. |
| Followers | Not allowed; they stand back. Permanent class companions (a ranger's tamed beast, a warlock's bound demon) fight, because they are part of the class; controlled bodies (Control Undead, Charm) are not allowed. |
| Group duels | Party vs party (up to 5 v 5) — **question** (§25). |
| Gear | Your real character: no normalising, no PvP stats (a duel is a friendly test of your real build). |
| Rewards | **None.** No gold, no XP, no reputation, no ladder, no titles. |
| Record | Wins, losses and draws on the character sheet's statistics page, visible to you only. |

---

## 17. Anti-cheat (new)

A browser client can be read and changed by anyone, so **the client is never trusted**. Page 16 owns the
server design; this is the list of what the server checks.

| Cheat | Server check | Response |
|---|---|---|
| Speed hack | Each movement update is compared to the fastest the character could go (run speed × mount × buffs × 1.15 + 0.5 m slack over a 1 s window) | Snap back to the last good position; 5 snaps in 60 s → flag for review |
| Teleport / fly | Position must be reachable from the last one and on or above the ground (navmesh or heightmap + collision) | Snap back; flag |
| No-clip through walls | Movement segments are tested against the region's collision data | Snap back |
| Cooldown / cost cheats | Server keeps every cooldown and resource; a cast request is refused if not ready | Refused, no flag (network lag also causes this) |
| Damage / heal numbers | All damage and healing are computed on the server from server-side stats | Not possible |
| Loot / gold | Rolled and granted by the server only | Not possible |
| Range / line of sight | Checked on the server with lag allowance (page 16 §10) | Refused |
| Auto-dodge / script aim | Hard to detect; tell-tale: reaction times under 100 ms on 95% of telegraphs over an hour | Flag for human review only |
| Botting | Heuristics: the same path looped for hours, 20+ h online a day, no chat, identical click timing | Flag for review; a GM checks before any action |
| Duplication | Every item has a unique id; the database refuses a second copy of an id; every move of an item is one database step | Not possible if the database rules hold ([page 16 §12](16-TECH.md)); alert if a duplicate id is ever refused |
| Economy abuse | Alerts: any character gaining more than 10× the median gold per hour for their level; any account receiving mail/trades from 10+ new accounts in a day | Flag for review |
| Packet flooding | Per-connection message rate limit (60 messages/s); over it → disconnect | Automatic |
| Travel Method riding | While riding, the **server** moves the rider along the route (page 20); client movement input is ignored except "step off" | Not possible |
| Target tampering | The hard target lives on the server; a cast names its target and is refused if that target is out of range, out of sight or not valid for the spell | Refused |
| Discovery spoofing | A discovery is written only when the server sees the character inside the discovery ring or arriving by a server-run teleport | Not possible |
| Magic-find stacking | Magic-find stats are read from the server's copy of the equipped gear at the moment of the kill; caps are page 08's | Not possible |

Penalty ladder (applied by staff, never automatically except mutes): **warning → 3-day suspension →
14-day suspension → permanent ban**. Real-money trading of gold/items: suspension on first offence.

---

## 18. Moderation and reporting (new)

### 18.1 Report a player

`/report Name` or right-click → Report opens `scr_report` (page 03) in its **Report a player** mode:

| Field | Values |
|---|---|
| Reason | Spam / advertising · Harassment or hate · Cheating or exploiting · Botting · Offensive name · Real-money trading · Other |
| Details | Optional text, 500 chars |
| Attached automatically | The last **50 lines** of chat the reporter could see (all channels), the reported player's last 50 chat lines on shared channels, both positions and region/layer, the time |

- The reporter is never named to the reported player.
- **Auto-silence**: a player reported for **Spam** or **Harassment** by **5 different accounts** within
  10 minutes is silenced on public channels for **15 min** pending review. Guild, party and whisper to
  friends still work, so a mass-report cannot cut someone off from their group.
- A reported **name** is queued; if upheld, the character gets a forced rename flag at next login.
- Reporting the same player again within 1 h adds to the same report.

### 18.2 What the server keeps

- Public-channel and whisper chat: **30 days**, only for moderation, then deleted.
- Economy log (trades, mail with value, market sales): **1 year**.
- Moderation actions: forever, on the account.

### 18.3 Support tickets

Game menu → **Report a bug** (page 02 §7.1) or `/ticket` opens `scr_report` in its **Report a problem**
mode: Category (Stuck · Bug · Item or gold missing · Harassment · Account · Other), text, and an "include a
screenshot" tick (the game captures the canvas) plus the `/where` location line. Players can see their
open ticket and its answer on the same screen. (`/help` itself opens Help & keys, page 02.)

### 18.4 Staff roles

| Role | Can |
|---|---|
| **Guide** (volunteer player) | Speak in Newcomers with a green Guide tag; mute a player in Newcomers for 1 h |
| **Moderator** | Read reports and chat logs; mute (1 h–7 days); kick from realm; force rename; warn |
| **Game Master (GM)** | All moderator powers + teleport, invisible, summon player, restore items/gold (logged), suspend, run a live event, close a layer |
| **Admin** | All + ban, account actions, realm settings |

GM characters carry a gold **GM** badge on their nameplate and in chat. Every staff action is written to
an audit log with who, what, why.

### 18.5 Code of conduct

Shown at first login and on the account page: no harassment, no hate speech, no cheating or exploiting
(report bugs instead), no real-money trading, no impersonating staff, names follow §19.

---

## 19. Names (new)

### 19.1 Character names

| Rule | Value |
|---|---|
| Length | **3–16** characters |
| Letters | A–Z, a–z, plus accented Latin letters (é, ö, ñ…); **no digits**, no spaces |
| Joiners | At most **one** apostrophe or hyphen, not first or last, not next to another joiner (`Ka'len`, `Mara-Lee` OK; `'Kalen`, `Ka--len` not) |
| Case | First letter capital, the rest shown as typed (the server stores a lower-case copy for uniqueness) |
| Unique | Per realm, ignoring case and accents (`Aldric` blocks `aldríc`) |
| Repeats | No letter three times in a row (`Aaaron`) |
| Reserved | Every NPC, boss, town, region, faction, dungeon, station and spell name in pages 01, 06, 10–14 and 20 (built into `data/reserved-names.json` by a tool, [page 16 §13](16-TECH.md)); staff role words (GM, Admin, Moderator, Guide, System, Wildmarch); real-world famous names list |
| Offensive | A block list plus a "contains" list (checked after removing joiners and swapping look-alike letters: `1→i`, `0→o`, `3→e`, `4→a`, `5→s`, `@→a`) |
| Deleted characters | Their name is held for **30 days**, then released |
| Rename | Free when forced by moderation; otherwise a paid service **or** a free rename every 90 days — **question** |

### 19.2 Guild and channel names

| Name | Length | Allowed |
|---|---|---|
| Guild | 3–24 | Letters and single spaces, one apostrophe; the same reserved and offensive lists |
| Custom channel | 3–20 | Letters and digits |
| Account tag | 3–16 + `#` + 4 digits (assigned) | Letters and digits |

---

## 20. Housing — question for the owner

Farhold has a whole base-building system (`js/build.js`, `js/buildplan.js`, `js/colony.js`), and canon
says Wildmarch **drops** base building. Housing is therefore **not in v2** unless the owner asks for it.
If wanted later, the options are:

| Option | What it is | Cost to build |
|---|---|---|
| A. None | No housing | 0 |
| B. Personal room | An instanced room at an inn in Highcourt: place trophies from boss kills, a mannequin with a saved outfit, a crafting bench. No building, only placing from a fixed list. | Small |
| C. Guild hall | An instanced hall per guild with the bank, a trophy wall, a map table, and rooms that unlock with guild rank | Medium |
| D. Plots | Real plots in a region with Farhold's build tools | Large; reintroduces what canon dropped |

Recommendation if asked: **B then C**, never D. Parked in `WISHLIST.md` (housing).

The **Wardrobe** (an account-wide collection of appearances, unlocked at 25) is **not** a question: page 08
defines it, with the Wardrobe Keeper NPC (`npc_wardrobe_keeper`) in every hub.

---

## 21. Solo play with followers

Canon pillar 6: every open-world zone and every **Normal** dungeon can be finished alone. Followers are
how. This section reuses Farhold's follower book and mercenary data and extends it.

### 21.1 Words (page 06 (companions and followers) owns the kinds; restated for this page)

| Word | Meaning | Takes a group body slot? |
|---|---|---|
| **Class companion (bound)** | A permanent creature that **is part of a class mechanic**: the ranger's tamed beast (Tame Beast), the warlock's bound demon (Bind Demon). Revived out of combat by the class's ritual. Page 06 owns them. | **No** |
| **Controlled body** | A temporary body taken over by a spell: the necromancer's Control Undead (a fresh non-undead corpse, or a living Undead-tagged enemy), the enchanter's Charm. No class summons a pet out of thin air (canon §6). | **No** (00 §10); counted against the spell's own cap |
| **Follower** | A person who fights beside you **as a party member**: a mercenary, a hero, or a finder hire (this page). | **Yes** — page 06 (companions and followers): every follower takes one of the group's 5 body slots |

In Farhold all three shared one limit (`js/followers.js` `FOLLOWER_KINDS`: companion / mercenary / summon;
slots 3 at level 1, +1 at 20, +1 at 30, hard cap 12). **Wildmarch changes that**: companions and controlled
bodies live under the class's own caps (page 06), **followers fill party slots**, and the whole body count per
player in the open world stays under page 06's **6 alive** (`pets.maxAlive`).

### 21.2 How many followers

| Situation | Followers allowed |
|---|---|
| Open world, solo | Up to **4** (the party is you + 4) |
| Open world, in a party of N players | Up to **5 − N**, shared: each player may bring up to **their own limit** (below) and the leader decides who stays if there is not room |
| Normal dungeon | Same as open world (5 − players) |
| Depth run whose level is under 60 | Same as open world (5 − players) — Depth here only raises the level (page 12) |
| Depth run at level 60 or deeper, Challenge mode | **0** — "Challenge mode and deep Depths expect people" (canon pillar 6) |
| Duels | **0** (§16) |
| World boss | Up to 4 per player, but a world boss's credit rule (§6) counts only the player's own damage/healing |
| Riding a Travel Method | Followers ride with you, take no seat and step off with you (§22) |

**Personal follower limit** (how many one player can have out) — **page 07's ladder, Resolved (00 §10)**:
**1** at level **8** (quest `q_mf_coin_for_a_blade`, `npc_mf_broker_wendel`, Reedhollow), **2** at **15**,
**3** at **25**, **4** at **35**. Before level 8 a character has no followers of their own (the level 5–7
`d01_hollow_barrow` can still be filled with **finder hires**, §7.5, which are free and last one run). The
feature ladder announces each one. Farhold's
"Kept Company" perk arm (followers + slots) becomes **follower power** rather than more followers in
Wildmarch — page 07 owns that choice.

### 21.3 Where followers come from

| Source | Kinds | How you get them | Page |
|---|---|---|---|
| **Mercenaries** (reuse: `prototypes/farhold/data/mercenaries.json`; page 06 names Shield Warden as the tank and Field Mender as the healer) | 10 types: Blade for Hire (damage, melee), Shield Warden (tank), Longshot (damage, ranged), Hedge Burner (damage, fire caster), Frost Binder (damage, control), Field Mender (healer), Shadow Knife (damage, strikes from behind), Galecaller (support), Bone Singer (damage, summoner), Houndmaster (damage, pet) | Hired from the **mercenary broker** (page 08's NPC list) in each hub town. Farhold's rule: a board of **4 offers**, restocked every **3 days**, price grows **12% per level** (`scaling.pricePerLevel`). Contract lasts until dismissed or they fall and are not revived within 10 min. | 15 (this) + 08 (prices) |
| **Heroes of the Wildmarch** (new) | 12 named story characters, each a role, voice, personality and a small quest line; one or two per region (page 01 names them) | Recruited by finishing their introduction quest; permanent once recruited; levelled with you | 01, 14 |
| **Finder hires** (new) | One per missing role | Free, for one Normal (or under-60 Depth) dungeon run from the Dungeon Finder (§7.5) | 15 |

### 21.4 What a follower is (data shape, proposal)

A follower is one row in the follower book on the character ([page 16 §12](16-TECH.md)):

```jsonc
{
  "uid": "fw_7kq2",
  "kind": "hero",                 // "mercenary" | "hero" | "finderHire"
  "type": "hero_bryn_ashwell",    // a mercenaries.json id, or a hero id from data/followers.json
  "name": "Bryn Ashwell",
  "role": "tank",                 // tank | healer | damage | support
  "level": 14,                    // always = the owner's level (Farhold: "adjust to the player level automatically")
  "kit": { "weapon": "it_…", "armour": "it_…", "jewellery": "it_…" },   // no trinket slot in v2 (page 08 §2: neck/ring)
  "stance": "defensive",
  "hp": 1.0,                      // fraction, so a load does not need the formula
  "downedAt": null,
  "opinion": { "warmth": 0.2, "trust": 0.35 },   // lingo/js/relations.js, reuse
  "memories": []                  // lingo/js/memory.js bank, trimmed to 40 entries on save
}
```

### 21.5 How strong they are (reuse + one rule)

- **Scaling**: Farhold R22's rule — followers grow at the **same** per-level rate as enemies
  (`mercenaries.json` `scaling.perLevel` = `balance.enemies.perLevel`), and **no single follower hit may
  be larger than 75% of the top of the owner's own weapon damage range** (`scaleFollower`). The test for
  this is "these two knobs are equal", not either value (memory note: *tests that pin wording*).
- **A full follower party is weaker than a good human party** on purpose: a Normal dungeon with four
  followers should take about **1.3×** as long as with four average players. The balance bot (page 16
  §16) measures it.
- **Kit**: three slots — **weapon**, **armour**, **jewellery** (a necklace or ring; v2 has no trinket slot) — equipped from the owner's own bags (any
  item the follower's role could use). Only the item's **item level** and its **power** (if it has one)
  count; affixes are ignored so follower gearing stays simple. **Proposal**; page 08 confirms.

### 21.6 Rewards with followers

- XP and loot for the player are **the same** as a party of players (canon pillar 6: no punishment).
- Followers take **no** XP share and **no** loot.
- Followers never trigger the Dungeon Finder satchel.

### 21.7 How followers fight (new AI, built on reused rules)

| Role | Behaviour |
|---|---|
| **Tank** | Runs to the nearest enemy attacking the player or another follower; uses **Provoke** (the taunt) every 8 s (page 05 threat table; Farhold `EnemyField.taunt` is the reuse); faces enemies away from the group |
| **Healer** | Stays 12–20 m behind the tank; heals the lowest health % ally (players first when tied); cleanses dispellable debuffs; revives a downed ally out of combat |
| **Damage (melee)** | Attacks the player's target; if none, the tank's target |
| **Damage (ranged/caster)** | Same, from 15–25 m |
| **Support** | Keeps its buff up on everyone; uses its control spell on the enemy with the most threat on the healer |

**Every follower obeys the telegraph vocabulary** (page 11) the way a competent-but-not-perfect player
does — page 06 (companions and followers): it **reacts 1.0 s after a telegraph appears**, then: leaves a **danger zone** by the
shortest path, never stands in a **void zone**, joins a **soak** when the soak needs bodies and it is the
nearest free ally, goes to a **safe zone**, spreads when **targeted**, breaks or keeps a **tether** by its
rule. For **one-shot** telegraphs (3.0 s warnings, page 11 §4) the reaction is **0.3 s**, so a follower
never causes a wipe on Normal. The M7 test (page 18) checks every Normal ability in data: a follower
starting 1.0 s late at its role's usual distance still gets out before the resolve.

**Orders** — the same **pet bar** above the skill bar that page 06 (companions and followers) gives class pets (page 03 draws
it); keys are page 02 §5.17's: **`,` (comma) tap** or Mouse 5 = attack my target, **`,` hold** = the ring of
four below (Ctrl is never a default — page 02 §10.4); slash forms `/order` and `/stance` (§9.4). The
Tactician's class mechanic adds more (page 06).

| Order | Ring wedge (page 02 §5.17) | Effect |
|---|---|---|
| Attack my target | tap `,` / wedge 1 | All followers switch to your target |
| Stay here (at the reticle) | wedge 3 | Followers stand where they are (they still dodge telegraphs) |
| Come back | wedge 2 | Followers stop fighting and come to you |
| Stance | wedge 4 (cycles) | Page 06 §10.3: **Aggressive** (anything hostile within 12 m), **Defensive** (default: what attacks you or what you attack), **Passive** (never attacks) |

### 21.8 Downed and revived

- A follower at 0 health is **downed** (kneels, `kneel` clip), not dead. It gets up at **50%** health
  **14 s** after combat ends (page 06, Farhold `pets.reviveSeconds 14`), or at once from any revive
  spell or the player's **Help up** interaction (hold `E` for 3 s, only out of combat).
- A mercenary still downed when you leave the area (or log out) goes back to the broker; you re-hire them
  there for **25%** of their price (page 06: "killed and not revived at a broker").
- If all followers and the player are down, the party wipes as normal (page 05 owns death).

### 21.9 Talk and personality (reuse)

- Heroes and mercenaries have Lingo personalities (`speech` JSON), a formant voice from
  `shared/voices.js` `voiceFor({ role, gender, seed })`, a **memory bank** (`lingo/js/memory.js`) and a
  **relationship** with the player (`lingo/js/relations.js`).
- They bark in fights (`combat_bark`, `combat_hurt`, `ally_down`, `relief`, all on Lingo's `noRepeat`
  list), and at a **campfire** (resting at a Waystone or inn) they hold short conversations with each other
  and with the player from `conversations/data/topics.json` (reuse, plus a Wildmarch topic pack): the
  boss you just killed, the item that dropped, who went down.
- Opinion moves with what you do (reviving them raises trust; letting them fall repeatedly lowers it).
  At high opinion a hero gives their **personal quest** (page 14). Opinion never changes combat power.

### 21.10 Screens (page 03)

| id | What |
|---|---|
| `scr_party` | The **Party** tab of the Social window (`P`, page 02) holds the follower book: up to 4 active + the roster of recruited heroes and contracted mercenaries; kit slots; stance; dismiss; "talk"; opinion bar. Reuse of Farhold's `js/followers-ui.js` layout. `/followers` opens it (page 02) |
| `scr_vendor` (broker mode) | The broker's 4 offers: role, name, level, price, a 3D figure (Farhold `figure3d.js`), "Hire" |

---

## 22. Riding together: shared Travel Methods online (new)

**Travel Methods** replace flight paths (W15): wagons, horse and creature trails, giant striders, barges,
boats, a rail-hauler and flyers that run on **known routes**, much faster than walking, protecting their
riders and snapping back onto the route if anything goes wrong. **[Page 20](20-TRAVEL.md) owns every route,
station, speed, fare, seat count and timetable, and the snap-back rule.** This section owns only what
changes because other players are riding too: boarding, waiting, sharing a vehicle, layers and
disconnects. Numbers here marked *(page 20 may retune)* are defaults for page 20 to confirm.

### 22.1 Words

| Word | Meaning |
|---|---|
| **Route** | A fixed path between stations (`tm_…`, page 16 holds the shape). |
| **Station** | A stop on a route: a post, a dock, a platform or a perch. Stations are discovered like waystones (§4.5); **you can ride only to a station you have discovered**, except the next stop on a line, which is always allowed (riding there discovers it). |
| **Vehicle** | The wagon, strider, barge, rail-hauler or flyer. It is **one server entity** that everyone in the layer can see, whether they ride or not. |
| **Departure mode** | How a vehicle decides when to leave. Three modes, below. Page 20 says which route uses which. |

| Mode | What happens | Typical routes (page 20 owns the list) |
|---|---|---|
| **On demand** (`onDemand`) | A private vehicle for **your party only** appears when you pay, and leaves at once. | Short horse trails, flyers across a gorge or sea |
| **Waits for riders** (`bus`) | The vehicle sits at the station and **leaves after a countdown** or when it is full, whichever comes first. Strangers can share it. | Wagon lines, ox caravans, giant striders |
| **Scheduled** (`scheduled`) | The vehicle runs a **timetable** and must **arrive** before anyone can board; everyone waiting boards together when its doors open. | River barges, the coast ferry, the rail-hauler |

### 22.2 Boarding (every mode)

1. Walk up to the station post (or the vehicle) and press `E` (page 02 interact). The station screen
   (`scr_travel`, page 03) lists the reachable stations with fare, time and the next departure.
2. Pick a destination and press **Board** (or type `/board <station>`, **new → page 02**). The **fare** is
   paid in gold when you board (page 20 owns fares); it is refunded if the vehicle never leaves.
3. You cannot board **in combat**, while **duelling**, or while carrying a world-boss or event objective
   that must stay on foot (page 14 marks those). Your mount is put away automatically.
4. **Followers** ride with their owner, take **no seat**, and step off with their owner. Bound class
   companions (tamed beast, bound demon) ride too; controlled bodies (Control Undead, Charm) end on
   boarding.
5. **Board with your party.** When a party member boards, every other party member within **40 m** of the
   same station gets a prompt "Mara boarded for Saltmarch — board with her?" (Yes / No, 20 s). With
   `set.social.boardWithParty` = On (**new → page 04**) the answer is Yes automatically when the fare is
   under 10 g. **A party is never split across two vehicles**: seats are held for the whole party (up to 5)
   for 20 s after the first member boards.

### 22.3 Waits for riders (bus style)

| Rule | Value *(page 20 may retune)* |
|---|---|
| Seats | Set by the vehicle kind (page 20 owns the counts; page 17 draws the seats) |
| Countdown | Starts when the **first** rider boards: the route's `busWaitS` (default **45 s**, page 16 data). Each new rider adds **10 s**, up to **twice** `busWaitS` from the first boarding |
| Leaves early | At once when every seat is taken, or when **every** rider aboard presses **Leave now** (so a full party of 5 riding alone need not wait) |
| Full | If a party does not fit, a **second vehicle** is brought up at once for them (the route's `spare` count, page 20); other riders take the next one, which starts its own countdown |
| Who shares a vehicle | Anyone in the layer going the same direction on the same route. Riders get off at any station on the line. Guilds with the **Reserved Seats** perk (§8.4) keep their members together |
| Waiting | Riders can stand up and walk around inside the vehicle's boarding ring (8 m) during the countdown; leaving the ring unboards them and refunds the fare |
| Shown | A countdown over the vehicle, the seat count ("6 / 10"), and each rider's name in the Carriage channel |

### 22.4 Scheduled (trains, boats, long flyers)

| Rule | Value *(page 20 may retune)* |
|---|---|
| Timetable | Every scheduled route has a fixed period (the route's `schedule.everyS`, e.g. **5 min**, page 20). Departure times come from the realm's route clock on the server, so every layer and every player sees the same timetable. |
| Station board | The station post shows the next **3** arrivals with a live countdown, the route map with the vehicle's current position, and the seats free. |
| Wait here | Press **Wait here** on the board: you are marked waiting (a small ticket icon on your nameplate) and will board automatically when the doors open, as long as you are on the platform (a 25 m ring). You may shop, chat or emote while waiting. |
| Arrival | The vehicle arrives and stops; its **doors open for 25 s**. Everyone waiting on the platform boards at once in one step (the server seats them all together, party members side by side), and anyone who arrives in those 25 s may board with `E`. |
| Missed it | Arriving after the doors close means waiting for the next one. The fare is not taken until you board. |
| Seats | The largest vehicles in the game (page 20). If more people are waiting than there are seats, the vehicle carries **extra carriages** that trip — nobody on the platform is ever left behind. |
| Layers | Each layer runs its own copy of every scheduled vehicle on the **same** timetable. Riders never change layer mid-route: when layers merge or a party member joins from another layer, the move happens **at the next station** during the stop. |

### 22.5 While riding

- **Protected.** Riders cannot be attacked, targeted or pulled by monsters, and take no damage from weather,
  hazards or world-boss attacks (W15). Monsters ignore the vehicle. A rider cannot attack, cast combat
  spells or be targeted by other players' spells (a heal on a rider is refused "They are riding").
- **Social.** The **Carriage** chat channel (`/car`) holds everyone on the vehicle; Say and emotes work (a
  rider who `/wave`s waves from their seat). Riders are drawn **seated** (Chibi 2 `sit` / `boat` ride clips,
  `avatar-3d/js/chibi2-motion.js` `CHIBI2_RIDE_ANIMS`, reuse), each in a numbered seat. Party members sit
  together.
- **Screens.** Every menu works: bags, the character sheet, the map (showing the route and the vehicle),
  mail is **not** usable (mailboxes are at stations), the Trading Post is not reachable. The Dungeon Finder
  queue keeps running; a **Group found** popup while riding offers "Accept and step off at the next
  station" or "Accept and teleport now" (you leave the vehicle; the rest of the fare is not refunded).
- **Camera.** Free-look around the vehicle (page 02); `Space` or `/stepoff` asks to step off (§22.6).
- **Party frames** show a cart icon on members who are riding.

### 22.6 Stepping off, disconnects and snap-back

- **At a station**: every stop opens the vehicle for **15 s** (bus style) or **25 s** (scheduled); riders
  whose destination it is are set down on the platform; anyone else may step off with `E`.
- **Between stations**: on land routes a rider may step off (`Space`, confirm) and is set down at the
  nearest safe point beside the route (never in water, never on a cliff edge, never inside a monster camp —
  page 20 marks the safe points). On sea, lake and flyer routes there is no stepping off between stations.
  No refund.
- **Disconnect while riding**: the rider **stays aboard** (still protected) for the normal 3 min grace
  (§2). Back within it, they are in their seat. After it — or on logging out on purpose — the character is
  set down and saved at the **next stop** (page 16's save rule), which is always a safe place, and the rest
  of the fare is not refunded.
- **Snap-back is the server's job.** The server moves the vehicle along its route polyline; clients only
  draw it. If anything takes the vehicle off its path (a physics hiccup, a bridge change, a stuck wheel),
  the server returns it to the nearest point on the route within one tick and every rider sees a **0.5 s
  fade**; nobody falls, nobody is left behind, nobody takes damage. Page 20 owns the exact rule (how far
  off-route, how long stuck, what counts as falling), page 16 the data.

### 22.7 Stations as meeting places

Stations are small social hubs: a mailbox at every scheduled station, a bench to sit, the Carriage and
Say channels, and a **"Meet at"** button on the Social window that drops a map pin on a station for your
party. They are part of the region's layer (§4.3). Duels are not allowed inside a station ring (§16).

---

## 23. Settings (page 04 owns them)

Page 04 §11 (`set.social.*`), §12 (`set.online.*`), §6.9 (chat window), §6.2 (nameplates) and §9
(speech bubbles, read chat aloud) already hold the switches this page needs. **New ones for page 04 to add:**

| Key | Label | Control | Values | Default | Scope |
|---|---|---|---|---|---|
| `set.social.announceFriend` | Tell people when I add them as a friend | toggle | | On | A |
| `set.social.finderFollowersNow` | Offer follower fill in the Dungeon Finder at once | toggle | | Off | A |
| `set.social.marketUndercutMail` | Mail me when someone undercuts my listing | toggle | | Off | C |
| `set.social.joinNewcomers` | Join the Newcomers channel | toggle | | On (under level 20) | C |
| `set.social.autoLayer` | Move me to my guild's world copy when I can | toggle | | On | A |
| `set.social.boardWithParty` | Board a Travel Method with my party automatically (fares under 10 g) | toggle | | On | C |
| `set.social.joinMuster` | Join the Muster channel at world bosses | toggle | | On | A |

## 24. Keys (page 02 owns them)

Every social key already exists in page 02: **Social window `P`** (tabs Party + followers, Dungeon Finder,
Friends, Guild), chat `Enter` / `/`, emote wheel `.` (hold), sit `X`, meter `Shift+M`, Dungeon journal
`Shift+J`, target yourself `F1`, target party members `F2`–`F5`, interact `E` (boarding), follower orders `,` / Mouse 5 (tap = attack my target, hold = ring; page 02 §5.17 —
page 06's Ctrl+1–4 proposal is **Resolved (00 §10)**: keys are page 02's). **New for page 02:** the chat
commands listed in §9.4.

## 25. Open questions (to `QUESTIONS.md`)

1. Google/Discord sign-in, or email only?
2. A Hardcore realm type (one life)?
3. Group duels (party vs party, up to 5 v 5), or one-on-one only?
4. Rename: paid service or free every 90 days?
5. Housing (§20): none, personal room, guild hall? (Parked in `WISHLIST.md` until asked.)
6. Mail delay of 1 hour for strangers — acceptable, or too annoying?
7. Followers in Depth: allowed while the run's level is under 60, none from 60 on (§21.2) — right line?
8. Stepping off a land Travel Method between stations (§22.6) — allowed, or stations only?
9. World bosses: is the loose "Muster" (shared channel, one marker lead, no big group) enough, or should
   there be a temporary open group with frames for everyone present?
