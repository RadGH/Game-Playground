# WILDMARCH — Design Bible, page 15: social and online

**Status:** v0.1 draft — 2026-09-29. **Nothing is built.** Owner of this page: everything about playing
with (or near, or against) other people — accounts, realms, zone copies, parties, raids, the group
finder, guilds, chat, friends, trade, the Trading Post, mail, PvP, anti-cheat, moderation, names — and
**solo play with followers**, which is how one person gets through content built for five.

Other pages this touches: the keys are owned by [page 02](02-CONTROLS.md), the screens by
[page 03](03-UI-SCREENS.md), the settings by [page 04](04-SETTINGS.md), the PvP damage rules and threat by
[page 05](05-COMBAT.md), currency and binding by [page 08](08-ITEMS.md), dungeon/raid content by
[page 12](12-DUNGEONS.md) and [page 13](13-RAIDS-WORLD-BOSSES.md), and the server that makes all of it
work by [page 16](16-TECH.md). Keys, screens and settings use the ids those pages already fixed; anything
**new** this page needs is marked **(new → page 02/03/04)** and must be copied there by that page's owner.

> **What already exists.** Farhold is single-player. Almost nothing on this page exists in the
> playground. The exceptions are the follower system (`prototypes/farhold/js/followers.js`,
> `js/pets.js`, `js/hire.js`, `data/mercenaries.json`), the threat/taunt rule for companions
> (`js/actors.js` `aimOf`/`taunt`, round 22), faction standing (`js/factions.js`), the emote animations
> (`avatar-3d/js/chibi2-motion.js` `CHIBI2_EMOTE_ANIMS`), and NPC speech (`lingo/`, `shared/voices.js`).
> Everything else below is **(new)**.

---

## 1. Principles

1. **The server decides.** Every rule on this page is checked on the server ([page 16](16-TECH.md)). The
   client asks; it never tells. A trade, a loot roll, a mail, a duel result, a guild bank withdrawal —
   the server does the arithmetic and writes the row.
2. **Solo is a real way to play, not a punishment.** Canon pillar 6: every open-world zone and every
   Normal dungeon is finishable alone with followers. No XP or loot penalty for bringing followers
   instead of people (§21).
3. **Nobody can be made to see anything.** Every channel can be left, every player ignored, every
   request auto-declined. Harassment tools are one right-click away.
4. **The economy has sinks.** Every transfer of value between players costs a little (postage, market
   cut, listing deposit) so gold does not pile up forever. Page 08 owns prices; this page owns the fees.
5. **Plain names.** Channels, screens and buttons say what they do: "Party", "Trade", "Mail", not
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
| Disconnect grace | If the connection drops, the character stays in the world for **20 s** (can be hit, cannot act), then is pulled out. Reconnecting within **3 min** puts the character back in the same zone copy, dungeon or raid; after that, they return to the dungeon/raid **entrance** (the lockout keeps their progress). |
| Idle | 15 min with no input → "Away" tag. 30 min → logged out to character select. In a group finder dungeon, 3 min idle in combat marks the player **Idle** for the vote-kick (§7.5). |
| Account-wide things | Mount collection, appearance collection (if the Wardrobe is approved — §20), titles, achievement points, the Kin list (§10), cosmetic pets, the friends list. **Not** account-wide: gold, items, reputation, quest state, unlocks earned by quests (canon pillar 1 — every character earns its own verbs). |
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
guilds and chat. Characters on different realms never meet, except in the cross-realm group finder
(§7.6) and arenas (§16.3).

| Rule | Value |
|---|---|
| Launch realms | **2**: one per server region (North America, Europe). More only when a realm's queue exceeds 10 min at peak for 7 days running. |
| Realm names | Invented place-words, never canon region/town names (so a realm name never reads like a map location): e.g. `Thornrest`, `Kestrel Deep`, `Lanternmoor`, `Saltwind`. |
| Realm capacity | **3,000** characters online (soft), **3,600** (hard, then `scr_queue`). The number is set by the server's measured capacity (page 16 §17), not a design choice. |
| Realm types | **Standard** only at launch: all PvE, PvP by opt-in flag (§16). A **Warfront** realm type (PvP always on outside towns) is a **question for the owner**. A **Hardcore** type (one life) is also a question. |
| Time of day | Realm-wide. The 60-minute day of canon (45 day / 15 night) is computed from the server clock, so every player on a realm sees the same sun. |
| Character transfer | Between realms of the same region, once per 30 days. Goes with: items, gold (capped at 10,000g carried), reputation, mail must be empty, not a guild leader, no active market listings. |
| Realm merge | Allowed if a realm falls under 300 peak for 60 days. Name clashes: the character created later gets a free rename flag. |

---

## 4. Zone copies (layers) and phasing (new)

### 4.1 Words

- **Region** — one of the 11 regions of canon §7 (plus Highcourt). One region is one map.
- **Layer** — one running copy of a region on the server. When too many players are in a region, the
  server starts a second layer. Players in different layers of the same region cannot see each other.
- **Instance** — a private copy for one group: a dungeon, a raid, an arena match, a solo story scene.
- **Phase** — what one player sees differently from another *inside the same layer*, because of their
  quest progress (a burnt farm after a quest, a camp that is gone after you cleared it).

### 4.2 How many players per layer

| Region(s) | Soft cap (new layer opens) | Hard cap (nobody else joins) | Why |
|---|---:|---:|---|
| `hearthvale` | 60 | 75 | New players; keep kill-stealing and crowded quest mobs down |
| `mossfen`, `greyridge`, `sunscar` | 80 | 100 | |
| `whisperwood`, `cinder_steppe`, `frostmantle` | 80 | 100 | |
| `drowned_coast`, `riftmarch`, `emberthrone` | 90 | 110 | Fewer players at this depth; merge sooner |
| `veilspire` | 120 | 150 | Endgame hub island; people want crowds |
| `highcourt` (capital) | 150 | 200 | Social hub; the only place trade chat and the Trading Post are always busy |
| World boss arena (while a world boss is up) | 120 | 160 | See §4.5 |

Budget check: a layer is also a network and draw budget ([page 16 §8](16-TECH.md) sends at most 150
entities to one client; [page 17 §7](17-ART-AUDIO.md) draws the nearest 30 players at full detail).

### 4.3 Layer rules

1. **Group first.** Party and raid members are always placed in the leader's layer. Joining a party
   moves you to the leader's layer the next time you are out of combat (a 3 s fade, "Joining your
   party's world").
2. **Guild second.** When choosing a layer for a lone player, the server prefers the layer holding the
   most of their guild, then friends, then the fullest layer under the soft cap.
3. **No hopping to farm.** A player can change layer at most once per **60 s**, and never in combat,
   never with an open loot window, never while a nearby rare elite has them on its threat list.
4. **Merge when quiet.** Two layers of the same region merge when both are under 40% of the soft cap for
   5 minutes. Players are moved at the next out-of-combat moment, with the same 3 s fade.
5. **What stays per layer.** Rare elite timers, dynamic event state ([page 14](14-QUESTS-EVENTS.md)),
   gathering nodes and chests. A merge keeps the layer with the most players' state.
6. **Towns.** Hub towns are part of their region's layer. Highcourt is its own region with its own layers.

### 4.4 Phasing

- A quest can set a **phase flag** on a character (`phase.brightwater_mill_burnt`). Objects and NPCs in
  the region data carry `phase: { show: "<flag>" }` or `phase: { hide: "<flag>" }`.
- Players in the same party in **different phases** see the **leader's** phase for shared objects, but
  quest-giver NPCs follow each player's own flags (so nobody loses a quest they have not done).
- Phased content is kept small: at most **8 phase flags** active in one region's data at once, so the
  number of combinations a tester must check stays bounded.

### 4.5 World bosses

World bosses (canon §9, page 13) spawn in an **arena area** of their region. When one is up, the arena
becomes its own layer-set with the caps in §4.2. Anyone in the region gets a banner and a map pin; walking
into the arena moves them to the arena layer with the most room. Contribution for loot is personal
(§5.4): a player qualifies after dealing or healing **1%** of the boss's health, or tanking it for 5 s (page 08 §11.1 owns the rule).

### 4.6 Instances

| Kind | Size | Who can enter | Resets |
|---|---|---|---|
| Dungeon, Normal | 1–5 (players + followers) | Party members | When the last player leaves + 30 min, or on "Reset instances" by the leader |
| Dungeon, Heroic | 5 players | Party members, level 60 | Same, max 10 instances entered per hour per account |
| Dungeon, Mythic+ | 5 players | Party, keystone holder | One run; the key sets the level |
| Raid, Normal | 10 (flex 8–10; `r05_veilspire` Normal 15–20 flex, canon 00 §4) | Raid members | **Loot lockout** per boss per week; the instance itself can be re-run |
| Raid, Mythic | 20 | Raid members | **Instance lockout**: saved to one raid id for the week |
| Arena match | 2v2, 3v3, 5v5 | Matched teams | Per match |
| Story scene | 1 (party can join) | The quest holder | Per scene |

Weekly reset: **Wednesday 07:00 server time** (canon 00 §4) (page 08 §11.3 owns the loot lockouts; one time for every realm of a server region, so cross-realm groups agree).

---

## 5. Parties (new)

### 5.1 Basics

| Rule | Value |
|---|---|
| Size | **5** — players plus followers (§21) together. |
| Invite | `/invite Name`, right-click a player → Invite, or from the friends/guild list. Invite lasts **60 s**. |
| Accept / decline | Popup with the inviter's name, level, class and a Decline-all toggle (`set.social.partyInvitesFrom`, page 04). |
| Leave | `/leave` or the party frame menu. |
| Leader | The inviter. Leader can kick, promote, set loot threshold, set difficulty, reset instances, set markers, start a ready check. |
| Leader leaves | Leadership passes to the member who joined earliest. |
| Offline members | Stay in the party for **30 min**, shown greyed. |
| Range | Party members share XP and quest credit within **120 m** of the kill (same layer or instance). |
| Party markers | Leader and assistants can place **8 target symbols** on enemies or players (`/mark 1-8`) and **8 world markers** on the ground (`/wm 1-8`) — page 02 §6.2. Symbols (original): Sun, Moon, Star, Crown, Anchor, Flame, Leaf, Skull. |
| Ready check | Leader only. Every member gets Ready / Not ready for 30 s; the party frame shows the answers. |
| Role check | Leader only. Each member picks Tank / Healer / Damage / Support from the roles their class can take (canon §6). |

### 5.2 XP sharing

- Kill XP is split between players in range, weighted by level (a level 10 and a level 12 split 10:12).
- If the highest-level member is **8+ levels** above the kill's level band, everyone's share is reduced
  by 25% (so power-levelling a friend is possible but slow). Page 07 owns the per-kill XP number.
- Followers take **no** share (§21.6).

### 5.3 Level sync ("Walk with me") (new)

A party can turn on **Level sync** from the party menu. Every member above the band of the zone they are
in is scaled down to that zone's top level (stats, item power and spell numbers, not spells known —
you keep every spell you have unlocked). Rewards are scaled to the zone. This is what lets a level 50
help a level 8 friend without deleting the content. Sync ends when the party leaves or the leader turns
it off. Page 07 owns the scaling formula.

### 5.4 Loot

**Personal loot, always** — [page 08 §11](08-ITEMS.md) owns the rules (eligibility, loot focus, bad-luck
protection, lockouts). Each player's drops are rolled for them alone. There is no master looter and
nothing to fight over. What this page adds is the **social** side:

- **Gift window** (page 08 §10): an item looted in a group can be traded to **anyone who was eligible for
  that same kill** for **2 hours**, even if it is Bind on Pickup, if its item level is not higher than the
  looter's own equipped item in that slot. The trade window (§13) shows it in the slot as "Gift (1 h 12 m
  left)"; mail cannot carry a gift (it must be handed over in person, which keeps it inside the group).
- **Need/Greed for Normal dungeons** is a question page 08 §11.2 leaves open. If the owner says yes, the
  leader switches it with `/loot group` (page 02 §6.2) and `/loot personal` switches back; `/loot leader`
  is **not** offered (it is the rule that causes the arguments personal loot exists to prevent).
- Gold is split evenly among eligible players (page 08); followers take none.

### 5.5 Party chat and frames

- Party chat: §9.
- Party frames (part of `scr_hud`, page 03): name, class icon, role icon, health bar, resource
  bar, status icons (buffs/debuffs, dispellable ones framed), range fade (members out of 40 m are
  drawn at 50% opacity), leader crown, marker symbol, "Offline"/"Dead"/"Away" tags, follower tag.

---

## 6. Raid groups (new)

| Rule | Value |
|---|---|
| Sizes | **10** (Normal, flex 8–10; `r05_veilspire` Normal is 15–20 flex) or **20** (Mythic). Canon §4. A raid group can hold up to 20 at any time. |
| Convert | Party leader → "Convert to raid". Needs 2+ players. A raid converts back only when it has 5 or fewer. |
| Subgroups | **4 subgroups of 5**. Drag members between them. Some buffs are subgroup-only (page 06 says which). |
| Leader | One **Raid leader** + up to **4 assistants** ("Assist" rank): can invite, kick, move members, set markers, send raid warnings, start ready checks. |
| Speaker | Page 11 §10.3: in a raid, one member is the **Speaker** who answers a boss's dialog opportunity (default: the raid leader). Raid frame right-click → **Make Speaker** (leader only); the Speaker's frame shows a small scroll icon. |
| Raid warning | `/rw text` (page 02) — a centre-screen banner (page 11 §8 banner slot, white, with the sender's name) and a sound (`ui.raidwarning`, new sfx id, [page 17](17-ART-AUDIO.md)). |
| Followers | **Not allowed in raids** (Normal or Mythic). Class companions that are part of a class mechanic (ranger's cat, necromancer's thralls — page 06) are allowed; they are not followers (§21.1). |
| Loot | Personal loot (§5.4); drop chances, bad-luck protection and bonus rolls are page 08 §11 and page 13. |
| Lockouts | Loot lockouts per page 08 §11.3 (each boss once per week per character). Mythic also saves the **instance** (one raid id per week) so a Mythic group cannot hop between copies. Shown in the **Dungeon & raid journal** (`scr_instance_journal`, `Shift+J`, page 02). |
| Raid frames | Part of `scr_hud` (page 03): 4 columns × 5 rows, the same information as party frames at smaller size; optional "sort by role"; click-to-target; debuff highlight for anything a healer can dispel. |
| Damage meter | Every raid member can open the meter (`meters/js/meter.js` + `meter-ui.js`, reuse) on their own data; the meter's per-fight record runs on the server's combat events so every member sees the same numbers ([page 16](16-TECH.md)). |
| Boss mechanics helpers | The **Tactician** and **Oracle** class mechanics (canon §6) show extra warning information to their group; raid frames show the name of the player a Targeted telegraph is following. Page 11 owns the telegraphs. |

---

## 7. Group finder (new)

Screen `scr_group_finder` — the **Group Finder tab of the Social window** (`P`, page 02 §5.15; the tab
appears at level 6, with quest `q_hv_the_barrow_bell` — page 07 ladder). Two halves: **Queue** (the
server builds the group) and **Listings** (players post groups; other players apply).

### 7.1 What can be queued

| Activity | Queue? | Listing? | Followers can fill? | Level |
|---|---|---|---|---|
| Dungeon — Normal (each of d01–d14, or "Random Normal") | Yes | Yes | **Yes** (§7.4) | The dungeon's band (canon §8) |
| Dungeon — Heroic (each, or "Random Heroic") | Yes | Yes | No | 60 |
| Dungeon — Mythic+ | No (needs a keystone) | Yes | No | 60 |
| Raid — Normal (r01–r05) | **Yes**, per wing of 2–3 bosses ("Raid finder") | Yes | No | Raid level |
| Raid — Mythic | No | Yes | No | Raid level |
| World boss | No | Yes | Yes (open world) | Region band |
| Quest / dynamic event help | No | Yes | Yes | Any |
| Arena skirmish (unrated) | Yes (PvP tab) | No | No | 60 (arenas open at 60 — 00 §10, page 05 §21) |
| Rated arena | Team queue | No | No | 60 |

### 7.2 Group shape

- Dungeons: **1 Tank, 1 Healer, 3 Damage**. **Support counts as a Damage slot** (canon §4).
- Raid finder (Normal): **2 Tanks, 2 Healers, 6 Damage** for 10.
- A player may tick every role their class can fill (canon §6 Role + Can also). The finder picks the
  role that makes the group fastest; the player sees the picked role on the "Group found" popup.

### 7.3 Flow

1. Tick activities (max **6** at once) and roles → **Join queue**.
2. Estimated wait shown per role, from the last 30 min of matches on that activity.
3. **Group found** popup: activity, your role, 40 s to Accept or Decline. Declining or timing out
   removes you from the queue.
4. When all accept, everyone is teleported to the dungeon's entrance inside the instance. When the group
   finishes (last boss dead) or someone leaves, members may **Teleport out** back to where they queued.
5. **Role bonus.** When a role is short (wait for Damage is 3× the wait for Tank), the short roles show
   a **Satchel** icon: completing the run gives a bag with gold and a chance at a mount (page 08).

### 7.4 Filling with followers (Normal dungeons only)

- A player (or a partial party) in queue for a Normal dungeon sees **"Fill with followers"** after
  **2 minutes** (or immediately with the setting `set.social.finderFollowersNow`, new → page 04).
- Clicking it drops the queue and enters the dungeon at once with the player's own followers filling the
  missing roles ([§21](#21-solo-play-with-followers)). A player with no follower for a missing role gets a
  **finder hire** for that run only: a standard mercenary of the needed role at the player's level, free.

### 7.5 Behaviour rules

| Rule | Value |
|---|---|
| Deserter | Leaving a finder group before the last boss (not counting a vote-kick) → **15 min** before the player can queue again. |
| Vote to remove | Any member can start one. Needs **3 of the other 4** (dungeons) or **6 of the other 9** (raid finder). A member can start one vote per 5 min; the same player cannot be voted on twice in 5 min. Not available for 60 s after a boss pull. Reasons list: Idle, Harassment, Not doing their role, Other. |
| Idle | 3 min with no input while the group is in combat → the player is tagged **Idle** on the frames; a vote with reason Idle needs only 2 of 4. |
| Avoid list | Up to **3** players you will never be matched with again (separate from ignore). |
| Loot | Personal (§5.4). |
| Ready check | Automatic on "Group found". |

### 7.6 Cross-realm

The queue pools **all realms in the same region** (NA or EU). Cross-realm players can party, chat and
use the gift window inside the instance; they cannot trade outside it, mail each other or join each
other's guilds. Their names show as `Name-Realm`.

### 7.7 Listings

- Anyone can post a listing: activity, title (60 chars), description (200 chars), minimum level or
  minimum item score, voice chat yes/no (text only — the game has no voice chat), roles wanted.
- Others press **Apply** with a role and a short note (60 chars). The lister sees applicants with name,
  class, level, item score and role, and presses **Invite** or **Decline**.
- Listings expire after **1 hour** or when the group is full.
- Mythic+ listings show the keystone dungeon and level.

---

## 8. Guilds (new)

Screen `scr_guild` — the **Guild tab of the Social window** (`P`, page 02). Its own sub-tabs: **Roster ·
Ranks · News · Bank · Perks · Calendar · Info**. Commands `/ginvite`, `/gkick`, `/gpromote`, `/gdemote`,
`/gquit`, `/gmotd`, `/ginfo` are page 02 §6.4.

### 8.1 Founding and basics

| Rule | Value |
|---|---|
| Create | Anyone may **join** a guild from level 1. **Founding** one needs the level-15 **Guild charter** unlock (quest `q_hc_a_name_on_the_rolls`, `npc_hc_registrar_pell`, Hall of Records, Highcourt — page 07 ladder): a name, a tabard design, **4 other signatures** and **10 g**. After the charter, the **Guild Registrar** NPC (`npc_guild_registrar`) in Highcourt or any hub town handles guild business. |
| Name | 3–24 characters, letters and single spaces, unique per realm (§19). |
| Size | **500** members. |
| Emblem and tabard | Pick an emblem (40 shapes), emblem colour, border, background colour. A member who equips the **Guild Tabard** (bought from the registrar, 1 g) wears it as the Chibi 2 `tabard` decor part in the guild's colours ([page 17](17-ART-AUDIO.md) §2.6). |
| Message of the day | 250 chars, shown on login and at the top of the roster. |
| Info page | 1,000 chars, readable by members. |
| Public blurb | 200 chars, shown on the guild finder listing. |
| Guild finder | A tab in `scr_group_finder`: guilds post a listing (focus: Social / Levelling / Dungeons / Raiding / PvP; play times; realm); players apply with a note. |
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
| Spend perk points (§8.4) | on/off |

### 8.3 Guild bank

- **6 tabs × 98 slots**. Tab 1 comes with the guild; tabs 2–6 cost **50 / 200 / 500 / 1,000 / 2,500 g**,
  paid from the bank's gold.
- Each tab has a name (20 chars), an icon, and a free-text **tab note** (200 chars).
- **Gold** is held separately. Deposits by anyone with bank access.
- **Log**: every deposit and withdrawal (who, what, how many, when) — last **250** entries per tab and
  250 for gold. Shown on the Bank tab.
- Bind-on-pickup items cannot go in the bank (page 08).
- Accessed at a **Guild Vault** NPC (`npc_guild_vault`) in Highcourt and every hub town.
- The server writes every change as one database step ([page 16 §12](16-TECH.md)) so two people taking
  the last potion at the same moment cannot both get it.

### 8.4 Guild renown and perks

Members earn **guild renown** by playing: 1 per quest, 5 per dungeon boss, 20 per raid boss, 10 per world
boss, 3 per dynamic event, all capped at **200 per member per week** so a big guild does not outrun a
small one by headcount alone past a point. Renown reaches **guild ranks** (1–10); each rank gives one
**perk point**. Perks are chosen by anyone with the permission and can be respent once per week.

| Perk (original names) | Effect |
|---|---|
| **Shared Road** | +5% XP for members while at least one other guild member is in the party |
| **Open Purse** | −10% repair costs |
| **Long Memory** | +5% reputation from every source |
| **Warm Hearth** | Rested XP builds 25% faster |
| **Swift Standard** | Summon a party member to you at a Waystone (5 min cooldown) |
| **Quartermaster** | A guild vendor in Highcourt that sells potions and food at −10% |
| **Deep Vault** | Bank tabs cost 25% less |
| **Mustering Horn** | Once per day, a guild-wide 1 h buff: +3% movement speed out of combat |
| **Kin of the Road** | Resurrection costs no durability for members |
| **Banner Call** | Place a guild banner in the world for 10 min: members within 20 m regain 1% health every 5 s out of combat |

None of these touch combat power, so a raid's difficulty does not depend on which guild you are in.

### 8.5 News and calendar

- **News**: automatic entries for boss kills (first kill in the guild), level-60 dings, Legendary and
  Set items looted, achievements, members joining and leaving. Members can "cheer" an entry.
- **Calendar**: events with title, activity, date/time (shown in each viewer's own time zone), sign-up
  (Accept / Tentative / Decline + role), 40-slot cap. Reminders 15 min before.

### 8.6 Guild housing

A guild hall is a **question for the owner** (§20).

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
| **Raid** | Your raid | `/ra`, `/raid` | orange | |
| **Raid warning** | Your raid, as a banner | `/rw`, `/warn` | white on red | Leader and assistants only |
| **Instance** | Everyone in your dungeon or raid instance, grouped or not (includes cross-realm finder members) | `/i`, `/instance` | blue-grey | |
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

Shift-click inserts a link: `[Item name]` (hover = the full item card, one renderer everywhere — Farhold
`hud.itemCard`, reuse), `[Spell]`, `[Quest]`, `[Achievement]`, `[Map pin]` (click = set a waypoint),
`[Player]` (right-click menu). `set.social.chatLinks` turns them off for the reader. The server checks
every link is real (an item link must match an item that exists, with its rolled numbers) so nobody can
post a fake legendary.

### 9.4 Commands

Every command and its spelling is in **page 02 §6** (talking, groups, targeting, social and status,
information, emotes, developer). Commands this page adds, for page 02 to copy: `/recruit`, `/new`,
`/chkick`, `/chban`, `/chpass`, `/chowner`, `/pvp` (§16.4), `/yield` (§16.2), `/feud <guild>` (§16.4),
`/ticket` (same as `/help` → Report a problem, §18.3), `/order <attack|hold|follow>` and
`/stance <aggressive|defensive|passive>` (§21.7).

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
| **Ignore** | 100 per character | Name, date added | Hides their chat on every channel, whispers, party/guild/duel/trade invites, mail (returned to sender unread), and their bubbles. They are **not** told. Group finder also avoids pairing you if possible |
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
| Big trades | If the gold changing hands is over **1,000 g**, or an Epic/Unique/Set/Legendary item is included, the accept button needs a second click on a confirm line listing exactly what you give and get. |
| Range | Walking over 10 m apart cancels the trade. |
| Combat | Cannot trade in combat. |
| Bound items | Bind on Pickup items cannot be traded, except within the party gift window (§5.4), which shows in the slot as "Gift (1 h 12 m left)". |
| Record | The server writes every completed trade to the economy log ([page 16 §12](16-TECH.md)): who, what, when, where. |

---

## 14. The Trading Post (market) (new)

The realm-wide market (page 08 calls it "the auction house"; the player-facing name is **the Trading
Post**). Screen `scr_trading_post` (page 03), opened by talking to an **auctioneer** (`npc_auctioneer`,
page 08 §18 NPC list) in Highcourt (4 of them) or any hub town (1). One market per realm, shared by every
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

- **Search**: name text, category (Weapons → by type; Armour → by slot and weight; Accessories;
  Off-hands; Consumables; Crafting; Recipes; Cosmetic; Mounts), rarity (min–max), item level range,
  required level range, **usable by my class**, has affix (dropdown of every affix name, page 08),
  set id, price range.
- **Sort**: price (unit or total), item level, rarity, time left, name.
- **Results**: 50 per page, each row with the full item card on hover and the green/red upgrade arrow
  versus what you wear (Farhold `itemScore`, reuse).
- **Price history**: for commodities and for every base item + rarity, a 14-day line of median prices
  ([page 17](17-ART-AUDIO.md) draws it in the UI style).
- **Buy**: a confirm line with the price. Bought items arrive by **mail** instantly.

### 14.3 What may be sold

Only what page 08 §10 (binding) allows: **Bind on equip** items not yet worn, and **unbound** things
(consumables, gems, materials, glyph scrolls, junk). Bind on pickup, account-bound and quest items can
never be listed. The listing form greys out anything else with the reason ("Bound to you").

---

## 15. Mail (new)

Screen `scr_mail` (page 03), opened at any **mailbox** (every town, hub, camp with a Waystone). **Opens at
level 11** (quest `q_hc_keys_to_the_city`, page 07 ladder).

| Rule | Value |
|---|---|
| Send to | Any character on the same realm (not cross-realm) |
| Contents | Subject (40 chars), body (500 chars), up to **12 attachments** (items or stacks), gold |
| Postage | **1 gold** per mail + **1 gold** per attachment (coins are copper, silver and gold — 100 copper = 1 silver, 100 silver = 1 gold, canon 00 §10; `cur_gold` is page 08 §17; page 08 may retune it as a sink) |
| Delivery | **Instant** between characters on the same account, friends, Kin and guildmates. **1 hour** otherwise, so a scammer cannot empty a stolen account in one sitting. |
| COD | "Cash on delivery": the sender sets a price; the receiver can only take the attachments by paying it. |
| Kept | **30 days**, then returned to the sender (if it had attachments) or deleted. COD mail: 3 days. |
| Inbox size | **100** mails; more wait on the server and arrive as space frees. |
| Return | Receiver can press **Return** on any player mail. |
| Account-bound items | Move freely between your own characters by mail (page 08 §10); always instant |
| Gifts | Gift-window items (§5.4) **cannot** be mailed |
| System mail | Trading Post sales/expiries/purchases, event rewards, GM restores. Never a "you have been reported" notice (reports are silent). No postage; kept 60 days. |
| Ignore | Mail from ignored players is returned unread. |
| Record | Every mail with attachments or gold goes to the economy log. |

---

## 16. PvP (proposal)

Page 05 owns PvP **combat maths** (damage and healing reduction, control effects in PvP). This page owns
**where and how** PvP happens. **Scope — Resolved (00 §10):** **duels from level 10**, **battlegrounds and
the open-world war-mode flag from level 20** (quest `q_hc_the_proving_yard`, page 07 ladder), **rated arenas
at level 60**. PvP-only scaling lives on page 05. The details below (maps, ratings, fees) remain proposals for
the owner.

### 16.1 Principles

- There are **no player factions** in canon, so there is no "their side vs our side" open-world war.
  PvP is opt-in everywhere on a Standard realm.
- **Combat numbers are page 05 §21**: player damage to players ×0.65, healing and absorbs ×0.70, crits
  ×1.25 instead of ×1.5, control capped at 4 s with full diminishing returns, knockback ×0.60, no
  hit-stop on the victim's screen, followers ×0.5 in open-world PvP and none in arenas/battlegrounds.
- **Rewards** are page 08 §17's two PvP currencies: **Glory** (`cur_glory`, any PvP, weekly cap 1,500)
  for the Glory set (item level 66, page 09) and **Laurels** (`cur_laurels`, rated wins only, weekly cap
  300) for Laurel upgrades (item level 72) and titles; plus cosmetics (titles, tabards, mount colours,
  arena frames). Glory gear is capped at Heroic-dungeon level so a PvE player never needs PvP.
- Rated arenas normalise gear (§16.3), so the Glory set helps in the open world and battlegrounds but not
  in rated play.

### 16.2 Duels

| Rule | Value |
|---|---|
| Challenge | `/duel Name` or right-click → Duel, within **20 m**. 30 s to accept. |
| Auto-decline | `set.social.duels` (page 04): Ask me / Decline automatically |
| Where | Anywhere outside towns, dungeons and raids; both players level **10+** (page 05) |
| Start | A **flag** is planted between the two; a 3 s countdown; the flag's **40 m** ring is drawn. Leaving the ring for 10 s forfeits. |
| End | When one side reaches **1 health** (nobody dies), forfeits (`/yield`), or leaves the ring. Both are healed to full and cleansed. |
| Followers | Not allowed; they stand back. Class companions that are part of the mechanic fight. |
| Group duels | Party vs party (up to 5v5) — **question** |
| Scaling | Page 05 §21 PvP numbers apply; no gear normalising (a duel is a friendly test of your real character) |
| Record | Wins/losses on the character sheet's PvP tab |

### 16.3 Arenas

| Rule | Value |
|---|---|
| Brackets | **2v2**, **3v3**, **5v5** |
| Modes | **Skirmish** (unrated, finder queue, level 60, same Even Footing template) and **Rated** (level 60, fixed teams) |
| Teams | Rated teams: name (3–24), 2× bracket size roster, captain; a player may be on one team per bracket |
| Maps (original names) | **The Salt Ring** (Saltmarch docks, open with pillars), **Ashfall Circle** (steppe ring of standing stones, a central fire that burns), **Rimehold Yard** (courtyard, ice patches slow), **The Glass Garden** (Sunscar tomb garden, line of sight broken by glass walls), **Moonwell Court** (Whisperwood, a healing well that turns on at 2 min) |
| Match | Best of one, **10 min** limit; at 5 min a **Closing Circle** (a danger zone, page 11 vocabulary) shrinks the arena every 30 s |
| Rating | A 0–3,000 rating per team and per player (Elo-style: gain from beating a higher-rated team, lose less to one); matchmaking within ±200, widening 50 per 30 s wait |
| Seasons | 12 weeks. End-of-season rewards by rating band (Bronze 1,200 · Silver 1,500 · Gold 1,800 · Champion 2,100 · Top 0.5%): titles, tabards, a mount colour; Laurels are earned per win during the season |
| Gear | The **Even Footing** template (page 05: "gear item level normalised to a PvP value per slot"): every slot counts as item level 66; items keep their **powers** (legendary effects, set bonuses) — **question** whether powers should be off too |
| Followers | Never |

### 16.4 Open-world flagging

| Rule | Value |
|---|---|
| Flag on | This is **war mode** (opens at level **20** with the battleground unlock, page 07). `/pvp`, the portrait menu → **Raise the War Banner**, or the war-mode toggle at any hub. Only in the open world, not in towns. |
| Flagged means | You can attack, and be attacked by, any other flagged player who is not in your party or raid. A red crossed-swords icon on your nameplate. |
| Flag off | `/pvp` again → the flag drops after **5 min** without a PvP action. |
| Towns and hubs | **Sanctuary**: no PvP damage. A flagged player's timer still counts down there. |
| Helping | Healing or buffing a flagged player flags you. |
| Guild feud | Two guild leaders can declare a **Feud** (both accept, 1 week, 50 g each): members of the two guilds are hostile to each other outside sanctuaries without needing the flag. |
| Grief brakes | Killing a player **10+ levels** below you gives nothing and, after 3 such kills in 10 min, marks you **Dishonoured** (30 min, shown on nameplate, town guards attack you on sight). Players killed by the same player 3 times in 5 min get **5 min of PvP immunity**. |
| Death | A PvP death costs no durability and no XP. |
| Rewards | **Glory** (page 08) for honourable kills: the victim within 5 levels, once per victim per hour, 10 Glory each. |
| Contested regions | `cinder_steppe`, `drowned_coast`, `emberthrone` (canon: "contested") — flagged players there earn +25% Glory. Nobody is flagged by entering. |

### 16.5 Battlegrounds (proposal — page 05 already gives their brackets)

| Rule | Value |
|---|---|
| What | 10 v 10 team objective matches, from the group finder's PvP tab, cross-realm |
| Brackets | 20–29, 30–39, 40–49, 50–59, 60 (page 05); everyone raised to the top of the bracket |
| Sides | Two teams made by the queue (no permanent factions): **the Ember Banner** and **the Tide Banner** for the match only |
| Maps (original) | **Mill Fields** (Hearthvale-style: hold 3 mills; first to 1,000 points), **Rimehold Relay** (carry a lantern across the ice to your beacon, 3 captures), **Ashen Crossing** (push a siege ram along a road) |
| Length | 15 min limit; winner by objective, else by points |
| Death | Release to your team's graveyard, 15 s wave timer (page 05) |
| Deserter | 15 min |
| Rewards | Glory (win 150 / loss 50); first win of the day +150 |

Battlegrounds are the **largest** PvP piece. *(Was a question — whether to cut them for a smaller PvP
scope. **Resolved (00 §10):** battlegrounds are in, from level 20.)*

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
| Reserved | Every NPC, boss, town, region, faction, dungeon, raid and spell name in pages 01, 06 and 10–14 (built into `data/reserved-names.json` by a tool, [page 16 §13](16-TECH.md)); staff role words (GM, Admin, Moderator, Guide, System, Wildmarch); real-world famous names list |
| Offensive | A block list plus a "contains" list (checked after removing joiners and swapping look-alike letters: `1→i`, `0→o`, `3→e`, `4→a`, `5→s`, `@→a`) |
| Deleted characters | Their name is held for **30 days**, then released |
| Rename | Free when forced by moderation; otherwise a paid service **or** a free rename every 90 days — **question** |

### 19.2 Guild, team and channel names

| Name | Length | Allowed |
|---|---|---|
| Guild | 3–24 | Letters and single spaces, one apostrophe; the same reserved and offensive lists |
| Arena team | 3–24 | Same |
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
| B. Personal room | An instanced room at an inn in Highcourt: place trophies from boss kills, a mannequin with a saved outfit, a bed for rested XP. No building, only placing from a fixed list. | Small |
| C. Guild hall | An instanced hall per guild with the bank, a trophy wall, a portal to the current raid, and rooms that unlock with guild rank | Medium |
| D. Plots | Real plots in a region with Farhold's build tools | Large; reintroduces what canon dropped |

Recommendation if asked: **B then C**, never D. Logged in `QUESTIONS.md`.

The **Wardrobe** (an account-wide collection of appearances) is **not** a question: page 08 §21 already
defines it, with the Wardrobe Keeper NPC (`npc_wardrobe_keeper`) in every hub.

---

## 21. Solo play with followers

Canon pillar 6: every open-world zone and every **Normal** dungeon can be finished alone. Followers are
how. This section reuses Farhold's follower book and mercenary data and extends it.

### 21.1 Words (page 06 §10.1 owns the kinds; restated for this page)

| Word | Meaning | Takes a group body slot? |
|---|---|---|
| **Class companion** | A creature or body that **is part of a class mechanic** (the ranger's hunting cat, the necromancer's thralls). Page 06 owns them. | **No** |
| **Summon** | A temporary creature called by a spell. Page 06 owns them. | **No** (00 §10); counted against the spell's own cap |
| **Follower** | A person who fights beside you **as a party member**: a mercenary, a hero, or a finder hire (this page). | **Yes** — page 06 §10.5: every follower takes one of the group's 5 body slots |

In Farhold all three shared one limit (`js/followers.js` `FOLLOWER_KINDS`: companion / mercenary / summon;
slots 3 at level 1, +1 at 20, +1 at 30, hard cap 12). **Wildmarch changes that**: companions and summons
live under the class's own caps (page 06), **followers fill party slots**, and the whole body count per
player in the open world stays under page 06's **6 alive** (`pets.maxAlive`).

### 21.2 How many followers

| Situation | Followers allowed |
|---|---|
| Open world, solo | Up to **4** (the party is you + 4) |
| Open world, in a party of N players | Up to **5 − N**, shared: each player may bring up to **their own limit** (below) and the leader decides who stays if there is not room |
| Normal dungeon | Same as open world (5 − players) |
| Heroic, Mythic+, raids, arenas, rated anything | **0** |
| World boss | Up to 4 per player, but a world boss's contribution rule (§4.5) counts only the player's own damage/healing |

**Personal follower limit** (how many one player can have out) — **page 07's ladder, Resolved (00 §10)**:
**1** at level **8** (quest `q_mf_coin_for_a_blade`, `npc_mf_broker_wendel`, Reedhollow), **2** at **15**,
**3** at **25**, **4** at **35**. Before level 8 a character has no followers of their own (the level 5–7
`d01_hollow_barrow` can still be filled with **finder hires**, §7.4, which are free and last one run). The
feature ladder announces each one. Farhold's
"Kept Company" perk arm (followers + slots) becomes **follower power** rather than more followers in
Wildmarch — page 07 owns that choice.

### 21.3 Where followers come from

| Source | Kinds | How you get them | Page |
|---|---|---|---|
| **Mercenaries** (reuse: `prototypes/farhold/data/mercenaries.json`; page 06 §10.5 names Shield Warden as the tank and Field Mender as the healer) | 10 types: Blade for Hire (damage, melee), Shield Warden (tank), Longshot (damage, ranged), Hedge Burner (damage, fire caster), Frost Binder (damage, control), Field Mender (healer), Shadow Knife (damage, stealth), Galecaller (support), Bone Singer (damage, summoner), Houndmaster (damage, pet) | Hired from the **mercenary broker** (page 08 §18 NPC list) in each hub town. Farhold's rule: a board of **4 offers**, restocked every **3 days**, price grows **12% per level** (`scaling.pricePerLevel`). Contract lasts until dismissed or they fall and are not revived within 10 min. | 15 (this) + 08 (prices) |
| **Heroes of the Wildmarch** (new) | 12 named story characters, each a role, voice, personality and a small quest line; one or two per region (page 01 names them) | Recruited by finishing their introduction quest; permanent once recruited; levelled with you | 01, 14 |
| **Finder hires** (new) | One per missing role | Free, for one Normal dungeon run from the group finder (§7.4) | 15 |

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
  "kit": { "weapon": "it_…", "armour": "it_…", "trinket": "it_…" },
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
- **Kit**: three slots — **weapon**, **armour**, **trinket** — equipped from the owner's own bags (any
  item the follower's role could use). Only the item's **item level** and its **power** (if it has one)
  count; affixes are ignored so follower gearing stays simple. **Proposal**; page 08 confirms.

### 21.6 Rewards with followers

- XP and loot for the player are **the same** as a party of players (canon pillar 6: no punishment).
- Followers take **no** XP share and **no** loot.
- Followers never trigger the group-finder satchel.

### 21.7 How followers fight (new AI, built on reused rules)

| Role | Behaviour |
|---|---|
| **Tank** | Runs to the nearest enemy attacking the player or another follower; **taunts** every 8 s (page 05 threat table; Farhold `EnemyField.taunt` is the reuse); faces enemies away from the group |
| **Healer** | Stays 12–20 m behind the tank; heals the lowest health % ally (players first when tied); cleanses dispellable debuffs; revives a downed ally out of combat |
| **Damage (melee)** | Attacks the player's target; if none, the tank's target |
| **Damage (ranged/caster)** | Same, from 15–25 m |
| **Support** | Keeps its buff up on everyone; uses its control spell on the enemy with the most threat on the healer |

**Every follower obeys the telegraph vocabulary** (page 11) the way a competent-but-not-perfect player
does — page 06 §10.5: it **reacts 1.0 s after a telegraph appears**, then: leaves a **danger zone** by the
shortest path, never stands in a **void zone**, joins a **soak** when the soak needs bodies and it is the
nearest free ally, goes to a **safe zone**, spreads when **targeted**, breaks or keeps a **tether** by its
rule. For **one-shot** telegraphs (3.0 s warnings, page 11 §4) the reaction is **0.3 s**, so a follower
never causes a wipe on Normal. The M7 test (page 18) checks every Normal ability in data: a follower
starting 1.0 s late at its role's usual distance still gets out before the resolve.

**Orders** — the same **pet bar** above the skill bar that page 06 §10.2 gives class pets (page 03 draws
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
  **14 s** after combat ends (page 06 §10.2, Farhold `pets.reviveSeconds 14`), or at once from any revive
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

## 22. Settings (page 04 owns them)

Page 04 §11 (`set.social.*`), §12 (`set.online.*`), §6.9 (chat window), §6.2 (nameplates) and §9
(speech bubbles, read chat aloud) already hold the switches this page needs. **New ones for page 04 to add:**

| Key | Label | Control | Values | Default | Scope |
|---|---|---|---|---|---|
| `set.social.announceFriend` | Tell people when I add them as a friend | toggle | | On | A |
| `set.social.finderFollowersNow` | Offer follower fill in the group finder at once | toggle | | Off | A |
| `set.social.marketUndercutMail` | Mail me when someone undercuts my listing | toggle | | Off | C |
| `set.social.joinNewcomers` | Join the Newcomers channel | toggle | | On (under level 20) | C |
| `set.social.autoLayer` | Move me to my guild's world copy when I can | toggle | | On | A |

## 23. Keys (page 02 owns them)

Every social key already exists in page 02: **Social window `P`** (tabs Party + followers, Group Finder,
Friends, Guild), chat `Enter` / `/`, emote wheel `.` (hold), sit `X`, meter `Shift+M`, Dungeon & raid
journal `Shift+J`, follower orders `,` / Mouse 5 (tap = attack my target, hold = ring; page 02 §5.17 —
page 06's Ctrl+1–4 proposal is **Resolved (00 §10)**: keys are page 02's). **New for page 02:** the chat
commands listed in §9.4.

## 24. Open questions (to `QUESTIONS.md`)

1. Google/Discord sign-in, or email only?
2. Realm types beyond Standard: Warfront (PvP-on) and/or Hardcore?
3. PvP scope: duels + arenas + flag + battlegrounds as proposed, or smaller? — **Resolved (00 §10):** duels 10, battlegrounds + war mode 20, rated arenas 60. Still open: group duels?
4. Arena "Even Footing": should item powers (legendaries, set bonuses) work in rated arenas?
5. Rename: paid service or free every 90 days?
6. Housing (§20): none, personal room, guild hall?
7. Mail delay of 1 hour for strangers — acceptable, or too annoying?
8. Personal follower limit ladder 1/2/3/4 at levels 1/6/12/20 (page 07 decides) — right pace? — **Resolved (00 §10):** slots at 8/15/25/35 (page 07).
9. Need/Greed as a leader option for Normal dungeons (page 08 §11.2)?
