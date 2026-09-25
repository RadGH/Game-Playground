# Farhold round 10 — the sheet becomes a full screen

**Design spec. Implementable as written.** No code was changed to produce this document.

The character sheet is a 880px-wide centred box with seven tabs and a `max-height: 86vh` scroll.
On a 1920×1080 screen it uses 20% of the pixels and still scrolls. Round 10 turns it into a
full-viewport interface with a rail, a persistent header, and one purpose-built layout per screen.

Read alongside:

- `index.html` lines 163–297 — the `#sheet` markup as it stands.
- `style.css` lines 96–145 (the old modal), 447–535 (the tabbed sheet), 606–680 (crafting + item card),
  870–905 (perks + talents).
- `js/hud.js` — `toggleSheet` 666, `setTab` 675, `renderSheet` 687, `slotGrid` 702, `renderCharacter` 719,
  `renderInventory` 833, `bagRow` 849, `renderSkills` 873, `renderPerks` 959, `drawForest` 1021,
  `renderPerkSide` 1108, `drawMaterials` 1155, `renderCrafting` 1196, `renderUpgrade` 1267,
  `renderJournal` 1371, `itemCard` 1435.

---

## 0. Three bugs found while reading. Fix them in this round.

They are not layout problems, but they sit inside the code this round touches and an implementer
will be in these functions anyway.

1. **The Perks screen is titled "Character".** `setTab` (hud.js ~683) builds the title from a map
   with no `perks` key, so it falls through to `'Character'`. Add `perks: 'Perks'`.
2. **Every skill offers the *bolt* talent tree.** `renderSkills` calls
   `treeFor(chosen.id, chosen.shape || 'bolt')` (hud.js ~915), but `skills.js` `state()` builds a
   fresh object with an explicit field list that does **not** include `shape` — so `chosen.shape`
   is always `undefined` and `OFFERS.bolt` is always used. A ground rune is offered "Fanned".
   Fix: add `shape: s.shape` (and `element: s.element` while you are there) to the object returned
   by `state()` in `js/skills.js` ~186.
3. **The XP bar is wrong above level 30.** `Hud._xpForLevel` (hud.js 474) is only the pre-30 curve
   `58·(l−1)^1.86`; `rpg.xpForLevel` bands levels 30–50 on top of it. Import `xpForLevel` from
   `./rpg.js` (hud.js already imports `itemScore, SLOTS, describeAffix` from there) and delete the
   private copy. The new header XP readout depends on this being right.

---

## 1. The layout system

### 1.1 Stacking order

`.sheet` moves from `z-index: 20` to **34**. Not higher. The ladder in `style.css` is:

| z | what |
|---|---|
| 10 | `.hud` (bars, minimap, log, boss bar, zone banner) — correctly hidden behind the sheet |
| 30 | `.back` |
| **34** | **`.sheet`** |
| 35 | `.talk` |
| 38 | `.settings` |
| 45 / 46 | `.map-screen` / `.chart` |
| 50 | `.debug` |
| 60 | `#pause` |
| 900 | `.rw-*` reward popup |
| 9000 | `.tipbox` |

`O` (settings) and `M` (map) can be pressed while the sheet is open, and both must draw *over* it.
34 keeps that true. An opaque sheet at 44 would hide the settings panel completely.

### 1.2 The root grid

Replace the whole `.sheet` rule (style.css 96–102). The old one is a centred modal; nothing in it
survives.

```css
.sheet {
  /* ------- tokens. Every number in the sheet comes from here. */
  --rail: 208px;          /* the tab rail */
  --head: 64px;           /* the persistent header */
  --gap: 14px;            /* between panes */
  --pad: 20px;            /* body gutter */
  --pane-r: 8px;          /* pane corner */
  --doll: 372px;          /* the equip figure column */
  --card: 360px;          /* a standing item card column */
  --fs: 13px;             /* body text in the sheet */
  --fs-sm: 12px;          /* the floor. Nothing in the sheet is smaller. */
  --fs-head: 11.5px;      /* pane titles — uppercase, tracked, so 11.5px still reads */

  --sheet-bg: #080d17;
  --pane-bg: #0f1624;
  --pane-bg2: #121a29;    /* rows inside a pane */
  --pane-line: #223049;
  --pane-line-soft: #1a2433;
  --ink: #cfe0ef;
  --ink-dim: #9fb0c8;
  --ink-faint: #7f8ea4;
  --accent: #7fd8ff;
  --gold: #ffd24a;
  --good: #8fe0a0;
  --bad: #ff9a8a;

  position: fixed; inset: 0; z-index: 34;
  display: grid;
  grid-template-columns: var(--rail) minmax(0, 1fr);
  grid-template-rows: var(--head) minmax(0, 1fr);
  grid-template-areas:
    "head head"
    "rail body";
  gap: 0;
  /* opaque: the world behind is paused and must not read through */
  background:
    radial-gradient(130% 100% at 16% -10%, #131d2e 0%, #0b1220 52%, var(--sheet-bg) 100%);
  color: var(--ink);
  font-size: var(--fs);
  overflow: hidden;        /* the page NEVER scrolls. Panes do. */
  /* undo the modal */
  top: auto; left: auto; transform: none; width: auto; max-height: none;
  border: 0; border-radius: 0; padding: 0; box-shadow: none;
}
.sheet.hidden { display: none; }
```

`minmax(0, 1fr)` on both the body column and the body row is what stops a long list from pushing
the grid wider than the viewport. Every nested grid repeats it.

### 1.3 Areas

```css
.sheet-head { grid-area: head; }
#sheet-tabs  { grid-area: rail; }
.tab-body    { grid-area: body; min-width: 0; min-height: 0; }
.tab-body.hidden { display: none !important; }   /* already present, line 886 */
```

All seven `.tab-body` elements occupy the same cell; only one is not `hidden`.

### 1.4 Reflow

Three declared sizes plus a safety net. Values are exact.

```css
/* 1920×1080 and up — more air, wider rail */
@media (min-width: 1600px) {
  .sheet { --rail: 220px; --head: 68px; --gap: 16px; --pad: 24px; --doll: 372px; --card: 380px; }
}

/* 1366×768 and 1280×720: shorter header, tighter gaps, narrower figure */
@media (max-width: 1440px), (max-height: 800px) {
  .sheet { --rail: 184px; --head: 56px; --gap: 10px; --pad: 12px; --doll: 332px; --card: 320px; }
  .pane-head { min-height: 26px; }
}

/* the safety net, BELOW the supported range (the game wants 1280×720 minimum).
   One column, and the body is allowed to scroll because nothing else will fit. */
@media (max-width: 1120px) {
  .sheet { grid-template-columns: 1fr; grid-template-rows: var(--head) 40px minmax(0, 1fr);
           grid-template-areas: "head" "rail" "body"; --rail: auto; }
  #sheet-tabs { flex-direction: row; overflow-x: auto; overflow-y: hidden;
                border-right: 0; border-bottom: 1px solid var(--pane-line); padding: 4px 8px; }
  #sheet-tabs button { min-height: 30px; white-space: nowrap; box-shadow: none; }
  .tab-body:not(.hidden) { grid-template-columns: minmax(0, 1fr) !important;
                           grid-template-rows: none !important; grid-template-areas: none !important;
                           grid-auto-rows: minmax(200px, auto); grid-auto-flow: row;
                           overflow-y: auto; }
  .pane-body { overflow: visible; }
}
```

**Budget check.** Content width = `100vw − rail − 2·pad`; content height = `100vh − head − gap − pad`.

| viewport | rail | head | content w | content h |
|---|---|---|---|---|
| 1920×1080 | 220 | 68 | 1652 | 972 |
| 1366×768 | 184 | 56 | 1158 | 690 |
| 1280×720 | 184 | 56 | 1072 | 642 |

Every per-screen column table below adds up to these numbers.

### 1.5 The header

`.sheet-head` (style.css 447) is a baseline flexbox today. It becomes a grid. `#sheet-title` sits
over the rail so the screen name and the rail line up on the same left edge; the character's
identity starts where the content does.

**Markup** (replaces index.html 165–177):

```html
<header class="sheet-head">
  <h2 id="sheet-title">Character</h2>
  <div class="sheet-who" id="sheet-who"></div>
  <div class="sheet-xp" id="sheet-xp">
    <div class="xpbar"><i id="sheet-xp-fill"></i></div>
    <span class="xp-text" id="sheet-xp-text"></span>
  </div>
  <div class="materials sheet-mats" id="sheet-materials"></div>
  <div class="sheet-purse" id="sheet-purse"></div>
  <button class="close" id="sheet-close" title="Close (Esc)" aria-label="Close">×</button>
</header>
```

`<nav class="tabs" id="sheet-tabs">` **moves out of the header** to become a direct child of
`#sheet` (see 1.6). The id is unchanged, so `$('sheet-tabs').querySelectorAll('button')` in the
constructor and in `setTab` keeps working untouched.

```css
.sheet-head {
  grid-area: head;
  display: grid;
  grid-template-columns:
    var(--rail)                  /* title, aligned with the rail */
    minmax(170px, auto)          /* who */
    minmax(170px, 260px)         /* xp */
    minmax(0, 1fr)               /* materials, takes the slack */
    auto                         /* purse */
    32px;                        /* close */
  grid-template-areas: "title who xp mats purse close";
  align-items: center;
  gap: var(--gap);
  margin: 0; padding: 0 var(--pad) 0 0;
  border-bottom: 1px solid var(--pane-line);
  background: linear-gradient(#101827, #0b1220);
  flex-wrap: nowrap;               /* kill the old flex behaviour */
}
.sheet-head h2 {
  grid-area: title; margin: 0;
  font-size: 14px; letter-spacing: 1.6px; text-transform: uppercase;
  color: var(--accent); padding-left: var(--pad);
}
.sheet-who { grid-area: who; display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.sheet-who b { font-size: 15px; color: #eaf6ff; white-space: nowrap;
               overflow: hidden; text-overflow: ellipsis; }
.sheet-who .who-class { font-size: var(--fs-sm); color: var(--ink-dim); text-transform: capitalize; }
.sheet-who .who-level { font-size: var(--fs-sm); color: var(--gold);
                        font-variant-numeric: tabular-nums; white-space: nowrap; }

.sheet-xp { grid-area: xp; display: flex; align-items: center; gap: 8px; min-width: 0; }
.sheet-xp .xpbar { flex: 1; min-width: 80px; height: 7px; border-radius: 4px;
                   background: #0c111b; border: 1px solid #2a3446; overflow: hidden; }
.sheet-xp .xpbar > i { display: block; height: 100%; width: 0;
                       background: linear-gradient(#d8b040, #8a6a10); }
.sheet-xp .xp-text { font-size: var(--fs-sm); color: var(--ink-faint);
                     font-variant-numeric: tabular-nums; white-space: nowrap; }

.sheet-mats { grid-area: mats; justify-content: flex-end; overflow: hidden;
              flex-wrap: nowrap; gap: 6px; }
.sheet-purse { grid-area: purse; margin: 0; font-size: var(--fs);
               font-variant-numeric: tabular-nums; white-space: nowrap; }
.sheet-purse b { color: var(--gold); }
.sheet .close { grid-area: close; position: static; font-size: 24px; line-height: 1;
                width: 32px; height: 32px; border-radius: 6px; }
.sheet .close:hover { background: #17293c; color: #eaf6ff; }

/* at 1280 and below, material chips drop their names and keep dot + count (46px each, not 118px) */
@media (max-width: 1340px) {
  .sheet-mats .material { padding: 3px 7px; }
  .sheet-mats .material > span { display: none; }
}
```

**Header render contract**, added to `renderSheet()` (hud.js 687) — it already sets
`sheet-purse` there, so this is the same three lines extended:

```js
const player = this.player;
$('sheet-purse').innerHTML = `<b>${player.gold}</b> gold`;      // level moved to sheet-who
$('sheet-who').innerHTML =
  `<b>${player.name}</b><span class="who-class">${player.classId}</span>`
  + `<span class="who-level">level ${player.level}</span>`;
const lo = xpForLevel(player.level), hi = xpForLevel(player.level + 1);
const pct = hi > lo ? Math.max(0, Math.min(100, (player.xp - lo) / (hi - lo) * 100)) : 100;
$('sheet-xp-fill').style.width = pct + '%';
$('sheet-xp-text').textContent = hi > lo
  ? `${hpNum(hi - player.xp)} xp to level ${player.level + 1}`
  : 'level 50';
this.drawMaterials('sheet-materials');
```

Everything here exists on `player`: `name`, `classId`, `level`, `xp`, `gold` (`js/rpg.js` 424–429).
`classId` is the raw id (`ranger`), which `text-transform: capitalize` makes presentable. If a
prettier label is wanted, `main.js` 349 already has `classDef.name` — pass it as a new
`classLabel` on the player at creation and read it here. Optional; not required.

**`#sheet-materials` replaces `#craft-materials` and `#up-materials`.** Those two ids are
**deleted** from `index.html` and `drawMaterials` is called once from `renderSheet()` instead of
twice from `renderCrafting`/`renderUpgrade`. Materials are the one number every screen wants and
they were previously only visible on two of seven. One test must follow:
`tests/round4.spec.js:265` reads `#craft-materials .material` → change to `#sheet-materials .material`.

### 1.6 The rail

**Markup** (a direct child of `#sheet`, after `</header>`):

```html
<nav class="tabs" id="sheet-tabs" role="tablist" aria-label="Character screens">
  <button data-tab="character" class="on" role="tab" aria-selected="true">
    <span class="rail-key">1</span><span class="rail-name">Character</span>
    <i class="rail-badge" id="rail-badge-character" hidden></i></button>
  <button data-tab="inventory" role="tab" aria-selected="false">
    <span class="rail-key">2</span><span class="rail-name">Inventory</span>
    <i class="rail-badge" id="rail-badge-inventory" hidden></i></button>
  <button data-tab="skills" role="tab" aria-selected="false">
    <span class="rail-key">3</span><span class="rail-name">Skills</span>
    <i class="rail-badge" id="rail-badge-skills" hidden></i></button>
  <button data-tab="perks" role="tab" aria-selected="false">
    <span class="rail-key">4</span><span class="rail-name">Perks</span>
    <i class="rail-badge" id="rail-badge-perks" hidden></i></button>
  <button data-tab="crafting" role="tab" aria-selected="false">
    <span class="rail-key">5</span><span class="rail-name">Crafting</span></button>
  <button data-tab="upgrade" role="tab" aria-selected="false">
    <span class="rail-key">6</span><span class="rail-name">Upgrade</span></button>
  <button data-tab="journal" role="tab" aria-selected="false">
    <span class="rail-key">7</span><span class="rail-name">Journal</span>
    <i class="rail-badge" id="rail-badge-journal" hidden></i></button>
  <div class="rail-foot">
    <span class="keyhint"><kbd>Esc</kbd> back to the world</span>
    <span class="keyhint"><kbd>1</kbd>–<kbd>7</kbd> screens</span>
  </div>
</nav>
```

`data-tab` values and their order are untouched — `tests/round4.spec.js:243` asserts the exact
array `['character','inventory','skills','perks','crafting','upgrade','journal']`.

Replace `.tabs` and `.tabs button` (style.css 452–458):

```css
.tabs {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--gap) 8px var(--pad);
  border-right: 1px solid var(--pane-line);
  background: linear-gradient(#0c1320, #090e18);
  overflow-y: auto; overflow-x: hidden;
}
.tabs button {
  display: flex; align-items: center; gap: 9px;
  min-height: 38px; padding: 0 10px;
  text-align: left; font: inherit; font-size: 13.5px;
  background: none; border: 1px solid transparent; border-radius: 6px;
  color: var(--ink-dim); cursor: pointer;
}
.tabs button:hover { background: #121b2b; border-color: var(--pane-line); color: var(--ink); }
.tabs button.on {
  background: #17293c; border-color: #2f5d84; color: var(--accent);
  box-shadow: inset 3px 0 0 var(--accent);
}
.rail-key {
  flex: none; width: 18px; height: 18px; border-radius: 4px;
  display: grid; place-items: center;
  font-size: var(--fs-sm); font-variant-numeric: tabular-nums;
  background: #0c111b; border: 1px solid #2a3446; color: var(--ink-faint);
}
.tabs button.on .rail-key { border-color: #2f5d84; color: var(--accent); }
.rail-name { flex: 1; }
.rail-badge {
  flex: none; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  display: grid; place-items: center;
  font-size: var(--fs-sm); font-style: normal; font-weight: 600;
  font-variant-numeric: tabular-nums;
  background: #4a3a10; border: 1px solid var(--gold); color: var(--gold);
}
.rail-foot { margin-top: auto; padding: 10px 4px 0; display: flex; flex-direction: column; gap: 5px; }
```

**Badge render contract** — in `renderSheet()`, after the header lines:

```js
const badge = (id, n) => {
  const b = $('rail-badge-' + id);
  if (!b) return;
  b.hidden = !n;
  if (n) b.textContent = String(n);
};
badge('character', player.pendingAttr || 0);
badge('perks', pointsLeft(player));                        // already imported from ./perks.js
badge('skills', this.skillState.filter(s =>
  !s.locked && tiersOpen(player.level).some(t => !picksFor(player, s.id)[t])).length);
badge('inventory', 0);                                     // reserved; see 3.2
badge('journal', (this.journal?.()?.quests || []).filter(q => q.done).length);   // ready to hand in
```

`tiersOpen` is exported from `js/skilltalents.js` (line 141) and is not yet imported by hud.js —
add it to the existing import on hud.js 15. Everything else is already in scope.

A badge is the single biggest thing full screen buys that isn't layout: "you have three perk points
sitting unspent" is currently invisible unless you happen to open the Perks screen.

---

## 2. Components

One set of parts, used by all seven screens. Add a `/* ---- round 10: panes */` block to
`style.css` after the header rules.

### 2.1 Pane

```css
.pane {
  display: flex; flex-direction: column; min-height: 0; min-width: 0;
  background: var(--pane-bg);
  border: 1px solid var(--pane-line);
  border-radius: var(--pane-r);
  overflow: hidden;
}
.pane-head {
  display: flex; align-items: center; gap: 10px;
  min-height: 30px; padding: 0 10px;
  background: linear-gradient(#141d2d, #101828);
  border-bottom: 1px solid var(--pane-line-soft);
  flex: none;
}
.pane-title {
  font-size: var(--fs-head); letter-spacing: 1.2px; text-transform: uppercase;
  color: var(--ink-dim); font-weight: 600; white-space: nowrap;
}
.pane-meta {
  font-size: var(--fs-sm); color: var(--ink-faint);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.pane-tools { margin-left: auto; display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; }
.pane-body {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: 10px; display: flex; flex-direction: column; gap: 8px;
  scrollbar-gutter: stable;          /* the list must not shift when a scrollbar appears */
}
.pane-body.tight { padding: 6px; gap: 5px; }
.pane-body.flush { padding: 0; gap: 0; }
.pane-stack { display: flex; flex-direction: column; gap: var(--gap); min-height: 0; min-width: 0; }
.pane-stack > .pane.grow { flex: 1; min-height: 0; }
.pane-stack > .pane.fixed { flex: none; }
```

`scrollbar-gutter: stable` is load-bearing: `replaceChildren` on a list that crosses the
scroll threshold would otherwise shove every row 15px sideways.

The old `.sheet h3` rule (style.css 104) had `margin: 16px 0 6px` and is what forced the current
stacked look. Keep the rule for anything outside a pane, but neutralise it inside:

```css
.pane h3, .pane h4 { margin: 0; }
.pane-body > h4 {
  margin: 4px 0 0; font-size: var(--fs-head); letter-spacing: 1px;
  text-transform: uppercase; color: var(--ink-faint);
}
```

### 2.2 Chips and filter bars

`.chip` / `.chip.on` / `.chip.off` already exist (style.css 253–259, borrowed from the map screen).
Reuse verbatim. Add a bar to hold them:

```css
.chipbar {
  display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 6px 10px; background: #0c1220;
  border-bottom: 1px solid var(--pane-line-soft); flex: none;
}
.chipbar .chip-label {
  font-size: var(--fs-sm); color: var(--ink-faint); text-transform: uppercase;
  letter-spacing: .6px; margin-right: 2px;
}
.chipbar .sep { width: 1px; height: 16px; background: var(--pane-line); margin: 0 3px; }
.chip { font-size: var(--fs-sm); min-height: 22px; display: inline-flex; align-items: center; }
```

A `.chipbar` sits between `.pane-head` and `.pane-body`, outside the scroll body, so filters never
scroll away from the list they filter.

### 2.3 Rows

`.bag .row` (style.css 118–127) keeps its shape and gains a rarity edge and stable number columns:

```css
.bag { gap: 4px; }
.bag .row { min-height: 34px; border-left-width: 3px; border-left-color: #2a3446; }
.bag .row[data-rarity="magic"]     { border-left-color: #7f95ff; }
.bag .row[data-rarity="rare"]      { border-left-color: #e8d020; }
.bag .row[data-rarity="legendary"] { border-left-color: #ff8020; }
.bag .row[data-rarity="unique"]    { border-left-color: #ff5a3c; }
.bag .row[data-rarity="set"]       { border-left-color: #2fc4b2; }
.bag .row .score { min-width: 62px; text-align: right; }   /* ▲ +128 never re-flows the row */
.bag .row > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis;
                               white-space: nowrap; flex: 1; }
.bag .row.on { outline: 1px solid var(--accent); outline-offset: -1px; }
```

One line in `bagRow` (hud.js ~855) feeds it:
`row.dataset.rarity = item.setId ? 'set' : item.isUnique ? 'unique' : (item.rarity || 'normal');`

A generic row for journal/zone/foe lists:

```css
.list-row {
  display: grid; align-items: baseline; gap: 4px 10px;
  padding: 5px 8px; border-radius: 5px;
  background: rgba(16, 24, 36, .6);
  border-left: 2px solid var(--pane-line);
  font-size: var(--fs);
}
.list-row .row-main { font-weight: 600; color: var(--ink); }
.list-row .row-note { color: var(--ink-faint); font-size: var(--fs-sm); }
.list-row .row-num  { color: var(--ink-dim); font-variant-numeric: tabular-nums;
                      text-align: right; min-width: 48px; }
```

### 2.4 Stat rows

`.stats` (style.css 129) keeps its `dl` markup and gains a second pair of columns on a wide screen
and a hairline per row so the eye tracks across:

```css
.stats { gap: 0 14px; font-size: var(--fs); }
.stats dt, .stats dd { padding: 3px 4px; border-bottom: 1px solid rgba(34, 48, 73, .5); }
.stats dd { text-align: right; min-width: 92px; }   /* reserved: 9 → 10 must not move the label */
@media (min-width: 1500px) { .stats { grid-template-columns: auto 1fr auto 1fr; } }
```

### 2.5 The standing item card

`itemCard()` returns HTML built from `.tip-*` classes, and **every one of those rules is scoped to
`.tipbox`** (style.css 664–680, 718–720, 851–855, 903–904). Dropping that HTML into a panel gives
unstyled text. Rewrite each of those selectors to accept a panel too:

```css
/* was:  .tipbox .tip-dim { … }   now: */
:is(.tipbox, .itemcard) .tip-dim { color: #8fa0b4; font-size: var(--fs-sm); }
```

…and the same `:is(.tipbox, .itemcard)` prefix for `.tip-base`, `.tip-affixes`, `.tip-affixes li`,
`.tip-affixes li::before`, `.tip-stat`, `.tip-cond`, `.tip-set`, `.tip-legend`, `.tip-base-affix`,
`.tip-set-head`, `.tip-lore`, `.tip-compare`, `.tip-compare .up`, `.tip-compare .down`,
`.tip-foot`, `.tip-line`, `.tip-shift`, `.tip-losing li`, `.tip-losing li::before`,
`.tip-req` and its three `.req-*` children, and `.tip-pattern` / `.tip-pattern .glyphs`.
This is a find-and-replace, but skipping it is the single most likely way to ship a broken panel.

Then:

```css
.itemcard {
  background: rgba(10, 16, 26, .7);
  border: 1px solid var(--pane-line);
  border-radius: 7px; padding: 9px 11px;
  font-size: 12.5px; line-height: 1.45;
}
.itemcard.empty { color: var(--ink-faint); font-style: italic; }
.itemcard b { color: #f0c46a; }                 /* .tipbox b, restated for the panel */
.itemcard--worn { border-color: #2f5d84; }
.itemcard--worn::before {
  content: "Worn now"; display: block; margin-bottom: 4px;
  font-size: var(--fs-head); letter-spacing: 1px; text-transform: uppercase;
  color: var(--accent);
}
```

### 2.6 Empty state, divider, key hint

```css
.empty-state {
  display: flex; flex-direction: column; gap: 4px; align-items: flex-start;
  padding: 14px 12px; color: var(--ink-faint); font-size: var(--fs);
  border: 1px dashed var(--pane-line); border-radius: 6px;
  background: rgba(10, 16, 26, .4);
}
.empty-state b { color: var(--ink-dim); font-weight: 600; }
.divider {
  display: flex; align-items: center; gap: 8px; margin: 6px 0 2px;
  font-size: var(--fs-head); letter-spacing: 1.1px; text-transform: uppercase;
  color: var(--ink-faint);
}
.divider::after { content: ""; flex: 1; height: 1px; background: var(--pane-line); }
.keyhint { font-size: var(--fs-sm); color: var(--ink-faint); }
.keyhint kbd {
  display: inline-block; min-width: 16px; padding: 1px 5px; margin: 0 1px;
  background: #0c111b; border: 1px solid #2a3446; border-bottom-width: 2px;
  border-radius: 4px; font: inherit; font-size: 11.5px; color: var(--ink-dim);
}
```

`.bag .empty` (style.css 127) and the many `el('p','muted small', …)` fallbacks in hud.js can keep
working as they are; swapping the important ones to `.empty-state` is listed in phase 5.

### 2.7 Buttons already in the sheet

`.forge-btn`, `.chip`, `.attr-row button`, `.scrap`, `.talent-card`, `.material`, `.cost-row`,
`.recipe-row`, `.forge-option`, `.zone-row`, `.journal-row`, `.pet-row`, `.power-row`,
`.skill-row`, `.bench-affix` all survive round 10 unchanged except where a per-screen section says
otherwise. They were designed for a 420px column and they read fine in a 500px pane.

---

## 3. The seven screens

Every wireframe is drawn at 1920×1080. Every pane is a `.pane` with a `.pane-head`; only the panes
marked **scrolls** get a scrolling `.pane-body`.

---

### 3.1 Character

**What a player comes here to do, ranked**

1. Read the numbers — did that new chest actually help.
2. See what is in each of the twelve slots, and take something off.
3. Spend a level-up point.
4. Read what the powers on their gear actually do.
5. Check on companions, and swap the boat or the ship.

**Cramped or hidden today**

- Twelve slots in a 3-across grid of text boxes, ~135px each: "Second ring" wraps, and the item
  name under it truncates to nothing.
- Sixteen stat rows in one `dl` in a 420px column, with no grouping — offence, defence and utility
  all read as one wall.
- `.powers { max-height: 260px; overflow-y: auto }` — the list of every property on every worn item,
  which on a geared character is 20+ lines, in a 260px window.
- Vehicles and companions are wedged under the slot grid where nobody looks.
- `#sheet-inert` (the effect-registry warning) renders at the bottom of a scrolled column and is
  effectively invisible.

**Wireframe**

```
┌ CHARACTER ┬─ Wren · ranger · level 12 ─ [====xp====] 1,240 xp to 13 ─ ●scrap 41 ●essence 8 ●dust 1 ─ 2,190 gold ─ × ┐
├───────────┼──────────────────────────────┬───────────────────────────┬───────────────────────────────────────────────┤
│ 1 Character│ WORN        click to take off │ STATS                     │ POWERS          on your gear                  │
│ 2 Inventory│ ┌─────────┐   ┌───────────┐  │ Health      412/412       │ ┌───────────────────────────────────────────┐ │
│ 3 Skills   │ │ HEAD    │ ▲ │ NECKLACE  │  │ Mana         96/96        │ │ Ashfall Hauberk   +12% fire damage        │ │
│ 4 Perks  ③ │ │ Rimcap  │/│\│ Tidecharm │  │ Damage      38–71         │ │ Ashfall Hauberk   burns on a block        │ │
│ 5 Crafting │ ├─────────┤ │ │├───────────┤  │ Armour         148        │ │ Drillmaster's…    +2 m/s while running    │ │
│ 6 Upgrade  │ │ CHEST   │ │ ││ HANDS     │  │ Magic resist    41       │ │ set or legendary  cinder step             │ │
│ 7 Journal ①│ │ Ashfall │ │ ││ Gripwraps │  │ Crit   14.5% for +180%   │ │ …                                         │ │
│            │ ├─────────┤/ \├───────────┤  │ Dodge         6.2%        │ │              (scrolls, full height)       │ │
│            │ │ WEAPON  │   │ OFF HAND  │  │ Accuracy   +5% (…)        │ └───────────────────────────────────────────┘ │
│  Esc back  │ │ Emberedge│  │ Warded…   │  │ Block           —         │ COMPANIONS                                    │
│  1–7 screens│├─────────┤   ├───────────┤  │ Barrier         —         │ ┌───────────────────────────────────────────┐ │
│            │ │ LEGS    │   │ RING      │  │ Attack speed  1.6/s      │ │ Fennec          38/38 · following         │ │
│            │ ├─────────┤   ├───────────┤  │ Cooldowns    -8%          │ └───────────────────────────────────────────┘ │
│            │ │ FEET    │   │ 2ND RING  │  │ Move speed  4.4 m/s       │ BOAT AND SHIP    bought once, yours for good   │
│            │ ├─────────┤   ├───────────┤  │ Better loot  +24%         │ ┌───────────────────────────────────────────┐ │
│            │ │ LIGHT   │   │ MOUNT     │  │ Gold find    +10%         │ │ Boat [Reed skiff  ▾] cheap, slow          │ │
│            │ └─────────┘   └───────────┘  │ Kills         318         │ │ Ship [Longhauler  ▾] carries the hold     │ │
│            │ ATTRIBUTES   3 points to spend│                          │ └───────────────────────────────────────────┘ │
│            │  STR  14 [+]   DEX  22 [+]   │                           │ ⚠ not understood by the registry: —           │
│            │  INT   8 [+]   CON  16 [+]   │                           │                                               │
└────────────┴──────────────────────────────┴───────────────────────────┴───────────────────────────────────────────────┘
```

**Panes**

| pane | id | grid | width 1920 / 1366 / 1280 | scrolls |
|---|---|---|---|---|
| Worn (equip figure) | `#sheet-slots` in `#sheet-equip` | `figure` | 372 / 332 / 332 | no |
| Attributes | `#sheet-attrs` in `#sheet-attr-pane` | `attrs` | same column | no |
| Stats | `#sheet-stats` in `#sheet-stat-pane` | `stats` | 1fr → 620 / 400 / 357 | **yes** |
| Powers | `#sheet-powers` in `#sheet-power-pane` | `side` (grow) | 1fr → 620 / 400 / 357 | **yes** |
| Companions | `#sheet-pets` | `side` (fixed) | ” | no (max 140px, then scrolls) |
| Boat and ship | `#sheet-vehicles` | `side` (fixed) | ” | no |
| Registry warning | `#sheet-inert` | `side` (fixed) | ” | no |

```css
.tab-body[data-tab="character"]:not(.hidden) {
  display: grid;
  grid-template-columns: var(--doll) minmax(340px, 1fr) minmax(340px, 1fr);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "figure stats side";
  gap: var(--gap);
  padding: var(--gap) var(--pad) var(--pad);
  min-height: 0;
}
.tab-body[data-tab="character"] .col-figure { grid-area: figure; }
.tab-body[data-tab="character"] .col-stats  { grid-area: stats; }
.tab-body[data-tab="character"] .col-side   { grid-area: side; }
@media (max-width: 1240px) {         /* stats and side share one column */
  .tab-body[data-tab="character"]:not(.hidden) {
    grid-template-columns: var(--doll) minmax(0, 1fr);
    grid-template-areas: "figure stats" "figure side";
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }
}
```

**The equip figure — accepted, with a caveat**

Accept the paper doll. Reject item **icons** in it: Farhold's items carry a name, a base name, a
rarity and numbers, and no art at all (`js/loot.js`, `data/items.json`) — an icon grid would be
twelve identical coloured squares. So the doll is **name plates arranged around a silhouette**,
which is what the data can actually fill.

The trick that makes it free: `slotGrid()` already writes `div.dataset.tipSlot = slot`
(hud.js 711), so CSS can place each plate by `[data-tip-slot]` with **no change to `slotGrid`**.

```css
/* index.html: both grids become class="slot-grid doll" */
.doll {
  display: grid;
  grid-template-columns: 1fr 96px 1fr;
  grid-template-rows: repeat(6, minmax(52px, 1fr));
  grid-template-areas:
    "head     body necklace"
    "chest    body hands"
    "weapon   body offhand"
    "legs     body ring"
    "feet     body ring2"
    "light    body mount";
  gap: 6px;
  min-height: 0;
  /* the silhouette lives in the middle column as a background, so replaceChildren cannot wipe it */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 150'%3E%3Cg fill='none' stroke='%232b3d57' stroke-width='2' stroke-linejoin='round'%3E%3Cpath d='M30 8c7 0 11 5 11 12 0 8-5 13-11 13s-11-5-11-13c0-7 4-12 11-12z'/%3E%3Cpath d='M18 36l12-4 12 4 6 10-4 26 3 30-7 2-4-24h-12l-4 24-7-2 3-30-4-26z'/%3E%3Cpath d='M12 46l-5 30 5 3'/%3E%3Cpath d='M48 46l5 30-5 3'/%3E%3Cpath d='M23 96l-2 44h6l3-30'/%3E%3Cpath d='M37 96l2 44h-6l-3-30'/%3E%3C/g%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: center;
  background-size: 88px auto;
}
.doll .slot[data-tip-slot="head"]     { grid-area: head; }
.doll .slot[data-tip-slot="necklace"] { grid-area: necklace; }
.doll .slot[data-tip-slot="chest"]    { grid-area: chest; }
.doll .slot[data-tip-slot="hands"]    { grid-area: hands; }
.doll .slot[data-tip-slot="weapon"]   { grid-area: weapon; }
.doll .slot[data-tip-slot="offhand"]  { grid-area: offhand; }
.doll .slot[data-tip-slot="legs"]     { grid-area: legs; }
.doll .slot[data-tip-slot="ring"]     { grid-area: ring; }
.doll .slot[data-tip-slot="feet"]     { grid-area: feet; }
.doll .slot[data-tip-slot="ring2"]    { grid-area: ring2; }
.doll .slot[data-tip-slot="light"]    { grid-area: light; }
.doll .slot[data-tip-slot="mount"]    { grid-area: mount; }
/* the right-hand column reads right-to-left so labels sit against the figure */
.doll .slot[data-tip-slot="necklace"], .doll .slot[data-tip-slot="hands"],
.doll .slot[data-tip-slot="offhand"],  .doll .slot[data-tip-slot="ring"],
.doll .slot[data-tip-slot="ring2"],    .doll .slot[data-tip-slot="mount"] { text-align: right; }

.doll .slot {
  min-height: 52px; padding: 5px 8px; display: flex; flex-direction: column;
  justify-content: center; gap: 2px; overflow: hidden;
  border-left: 3px solid #2a3446;                 /* rarity edge, as in the bag */
}
.doll .slot[data-rarity="magic"]     { border-left-color: #7f95ff; }
.doll .slot[data-rarity="rare"]      { border-left-color: #e8d020; }
.doll .slot[data-rarity="legendary"] { border-left-color: #ff8020; }
.doll .slot[data-rarity="unique"]    { border-left-color: #ff5a3c; }
.doll .slot[data-rarity="set"]       { border-left-color: #2fc4b2; }
.doll .slot .label { font-size: var(--fs-sm); }   /* was 11px — the floor is 12 */
.doll .slot .name  { margin: 0; font-size: var(--fs); line-height: 1.25;
                     display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                     overflow: hidden; }
.doll .slot:empty  { display: none; }
```

One line in `slotGrid` gives the rarity edge:
`div.dataset.rarity = item ? (item.setId ? 'set' : item.isUnique ? 'unique' : (item.rarity || 'normal')) : 'none';`

Plate width at 1920: `(372 − 96 − 12) / 2 = 132px` — enough for "Drillmaster's Treads" on two
lines. At 1366 (`--doll: 332`): 112px, still two lines. Total figure height
`6 × 52 + 5 × 6 = 342px`, which leaves the attributes pane 600px+ of the column at every size.

**Rejected here**

- **A live 3D portrait of the character in the doll.** Farhold already has a Chibi 2 body in the
  scene, but drawing it into the sheet means either a second renderer or a render target updated
  while the world is paused. The sheet must open instantly (`toggleSheet` → `renderSheet` is
  synchronous today) and this would make opening it a frame-cost decision. Not in round 10.
- **Drag and drop to equip.** Click already equips; a drag layer adds hit-testing and a ghost
  element and buys nothing new.

**Stats grouping — two options, pick by budget**

- *CSS-only (phase 1):* the `@media (min-width: 1500px)` four-column rule in 2.4. Sixteen rows
  become eight, and the whole list is visible without scrolling at 1920.
- *With a `renderCharacter` change (phase 4):* split `rows` into three arrays and write them into
  `#sheet-stats-offence`, `#sheet-stats-defence`, `#sheet-stats-utility`, each in a
  `.pane-body > h4` section inside the one Stats pane. `#sheet-stats` then becomes the wrapper.
  Grouping is what makes "did that chest help" a one-glance question, so it is worth the change:
  - offence: Damage, Crit, Accuracy, Attack speed, Cooldowns
  - defence: Health, Armour, Magic resistance, Dodge, Block, Barrier
  - utility: Mana, Move speed, Better loot, Gold find, Kills

Either way `STAT_HELP` tooltips keep working: they hang off `dt.dataset.tipStat`, not off position.

**Attributes** get a two-across grid now that there is width:

```css
#sheet-attrs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
.attr-row { margin: 0; min-height: 28px; }
.attr-row button { width: 28px; height: 26px; }
```

**Powers** loses its cap: delete `.powers { max-height: 260px; overflow-y: auto; }` (style.css 489)
— the pane scrolls instead. Add the source item's rarity edge:
`.power-row { border-left-color: #c8a24a; }` stays; the item name inside already carries
`rarityClass`.

**`#sheet-inert`** becomes a real warning instead of grey small print, and hides when empty:

```css
#sheet-inert:empty { display: none; }
#sheet-inert {
  margin: 0; padding: 7px 9px; border-radius: 6px; font-size: var(--fs-sm);
  color: #ffc9a0; background: rgba(60, 30, 14, .5); border: 1px solid #5a3a1e;
}
```

---

### 3.2 Inventory

**What a player comes here to do, ranked**

1. Decide whether a drop is better than what they are wearing.
2. Clear the bag out — recycle the junk into material.
3. Find one particular thing.
4. Check what is worn while doing all three.

**Cramped or hidden today**

- The bag is one flex column in a 420px half, so a name, a slot and a score share 420px and long
  names clip.
- No filter, no sort, no count beyond `#inv-count`. Twenty drops means scrolling twenty rows in a
  window six rows tall.
- The comparison is **only** the hover tooltip: it follows the pointer, it covers the row under it,
  and it vanishes the moment you move to compare against the next row.
- `.bagtools` is a paragraph of instructions and three buttons on one line.
- Rarity is carried only by the colour of the name text.

**Wireframe**

```
┌ INVENTORY ┬── header ────────────────────────────────────────────────────────────────────────── × ┐
├───────────┼─────────────────────────────┬──────────────────────────────────────────┬───────────────┤
│ rail      │ WORN                        │ BAG                    18 items · 41 kg? │ COMPARE       │
│           │ ┌────────┐  ┌────────────┐  │┌ show ▸ [all][weapon][armour][jewel] ───┐│ ┌───────────┐ │
│           │ │ HEAD   │▲ │ NECKLACE   │  ││ rarity ▸ [any][magic+][rare+]  │ sort ▸ ││ │ Emberedge │ │
│           │ ├────────┤/|\├────────────┤  ││ [score][rarity][slot][name][value] ▸▪▦ ││ │ rare · …  │ │
│           │ │ CHEST  │ | │ HANDS      │  │└────────────────────────────────────────┘│ │ 38–71 dmg │ │
│           │ ├────────┤ | ├────────────┤  ││▌Emberedge         Weapon   ▲ +128    ♺ ││ │ ⟶⟶⌄  1.9m │ │
│           │ │ WEAPON │/ \│ OFF HAND   │  ││▌Rimcap            Head     ▼ -14     ♺ ││ │ · +9 str  │ │
│           │ ├────────┤   ├────────────┤  ││▌Warded Buckler    Off hand ▲ +31     ♺ ││ │ · 12% fire│ │
│           │ │ LEGS   │   │ RING       │  ││▌Tidecharm         Necklace – 0       ♺ ││ │ Instead of│ │
│           │ ├────────┤   ├────────────┤  ││ …                                      ││ │ Rustbrand │ │
│           │ │ FEET   │   │ 2ND RING   │  ││ (scrolls, ~24 rows visible at 1080)    ││ │ +128      │ │
│           │ ├────────┤   ├────────────┤  ││                                        ││ └───────────┘ │
│           │ │ LIGHT  │   │ MOUNT      │  ││                                        ││ ┌───────────┐ │
│           │ └────────┘   └────────────┘  ││                                        ││ │ Worn now  │ │
│           │                              ││                                        ││ │ Rustbrand │ │
│           │                              │└────────────────────────────────────────┘│ │ 30–52 dmg │ │
│           │                              │ RECYCLE EVERYTHING UP TO                 │ │ · +4 str  │ │
│           │                              │ [normal] [magic] [rare]   R on a row     │ └───────────┘ │
└───────────┴─────────────────────────────┴──────────────────────────────────────────┴───────────────┘
```

**Panes**

| pane | id | width 1920 / 1366 / 1280 | scrolls |
|---|---|---|---|
| Worn | `#inv-slots` (`.doll`) in `#inv-equip` | 372 / 332 / 332 | no |
| Bag | `#sheet-bag` in `#inv-bag-pane`, with `#inv-filters` chipbar and `#inv-tools` footer | 1fr → 880 / 486 / 400 | **yes** |
| Compare | `#inv-compare` | 380 / 320 / 320 | **yes** |

```css
.tab-body[data-tab="inventory"]:not(.hidden) {
  display: grid;
  grid-template-columns: var(--doll) minmax(380px, 1fr) var(--card);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "figure bag compare";
  gap: var(--gap); padding: var(--gap) var(--pad) var(--pad); min-height: 0;
}
@media (max-width: 1240px) {   /* the doll drops under the compare card in one right rail */
  .tab-body[data-tab="inventory"]:not(.hidden) {
    grid-template-columns: minmax(380px, 1fr) 330px;
    grid-template-areas: "bag compare" "bag figure";
    grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
  }
}
#inv-tools {
  flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 7px 10px; border-top: 1px solid var(--pane-line-soft); background: #0c1220;
}
```

**New markup inside the bag pane** (the `.bagtools` paragraph, index.html 211–218, is replaced):

```html
<section class="pane" id="inv-bag-pane">
  <div class="pane-head">
    <span class="pane-title">Bag</span>
    <span class="pane-meta" id="inv-count"></span>
    <div class="pane-tools">
      <button class="chip" id="inv-view-list" aria-pressed="true">List</button>
      <button class="chip" id="inv-view-grid" aria-pressed="false">Grid</button>
    </div>
  </div>
  <div class="chipbar" id="inv-filters"></div>
  <div class="chipbar" id="inv-sort"></div>
  <div class="pane-body tight"><div class="bag" id="sheet-bag"></div></div>
  <div id="inv-tools">
    <span class="keyhint">Click to wear · <kbd>R</kbd> recycles what you are pointing at</span>
    <span class="sep"></span>
    <span class="keyhint">Recycle everything up to:</span>
    <button id="inv-recycle-junk" class="chip">normal</button>
    <button id="inv-recycle-magic" class="chip">magic</button>
    <button id="inv-recycle-rare" class="chip">rare</button>
    <span class="keyhint">uniques and set pieces are never taken in bulk</span>
  </div>
</section>
```

`#inv-recycle-junk/magic/rare` keep their ids, so the wiring at hud.js 226–228 is untouched
(they change from `.ghost` to `.chip`, which is only a class).

**Filter and sort — accepted**

State on the `Hud` instance, read at the top of `renderInventory`:

```js
this.bagFilter = { kind: 'all', rarity: 'any' };   // kind: all|weapon|armour|jewel|other
this.bagSort   = 'score';                          // score|rarity|slot|name|value
this.bagView   = 'list';                           // list|grid
```

`renderInventory` (hud.js 833) becomes:

```js
const KIND = {
  all: () => true,
  weapon: i => i.type === 'weapon',
  armour: i => ['head','chest','legs','hands','feet','offhand'].includes(i.slot),
  jewel:  i => ['ring','ring1','ring2','necklace'].includes(i.slot),
  other:  i => ['mount','light'].includes(i.slot) || i.quiver,
};
const RANK = { normal: 0, magic: 1, rare: 2, legendary: 3 };
const minRarity = { any: -1, 'magic+': 1, 'rare+': 2, 'legendary+': 3 }[this.bagFilter.rarity] ?? -1;
let rows = player.bag.filter(i =>
  KIND[this.bagFilter.kind](i) &&
  (RANK[i.rarity] ?? 0) >= minRarity || i.isUnique || i.setId && minRarity <= 2);
const key = {
  score:  i => -itemScore(i),
  rarity: i => -(RANK[i.rarity] ?? 0),
  slot:   i => String(i.slot),
  name:   i => i.name,
  value:  i => -(this.rpg?.price ? this.rpg.price(i) : itemScore(i)),
}[this.bagSort];
rows.sort((a, b) => { const ka = key(a), kb = key(b);
  return ka < kb ? -1 : ka > kb ? 1 : a.name.localeCompare(b.name); });
$('inv-count').textContent = rows.length === player.bag.length
  ? `${player.bag.length} item${player.bag.length === 1 ? '' : 's'}`
  : `${rows.length} of ${player.bag.length}`;
```

The two chipbars are built once and only have their `.on` class toggled, so clicking a filter never
re-creates the buttons the pointer is on:

```js
if (!$('inv-filters').dataset.wired) { /* build chips, set dataset.wired = '1' */ }
```

Every filter value above is read straight off an item that already exists (`type`, `slot`,
`rarity`, `isUnique`, `setId`, `quiver`) — no data is invented.

**Rejected: a text search box.** It would steal the keyboard from `R` and from the `1`–`7` screen
keys, and a run's bag sits in the tens of rows, which five filter chips and a sort cover. Add it
the day the bag routinely passes ~60 rows.

**Grid view — accepted, cheap**

```css
.bag--grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(196px, 1fr)); gap: 6px; }
.bag--grid .row { flex-wrap: wrap; align-items: flex-start; align-content: flex-start;
                  min-height: 62px; padding: 7px 9px; }
.bag--grid .row > span:first-child { flex: 1 0 100%; white-space: normal;
                                     display: -webkit-box; -webkit-line-clamp: 2;
                                     -webkit-box-orient: vertical; }
.bag--grid .row .score { min-width: 0; margin-left: auto; }
```

Three lines of JS: the two chips toggle `bagView` and `$('sheet-bag').classList.toggle('bag--grid', …)`,
and set `aria-pressed`. At 1920 the bag pane is 880px wide → 4 columns × ~13 rows = 52 items
visible at once with rarity edges. That is the "see the whole haul" view; the list stays the
default because the score column is easier to scan in one line.

**Compare panel — accepted, and it replaces the bag tooltip**

Two cards, stacked, in one pane: the item you are pointing at, then the item it would replace.
`itemCard()` already produces both (`itemCard(item)` includes its own "Instead of …" block, and
`itemCard(worn, { worn: true })` gives the worn one).

```js
/** Fill #inv-compare from an item. Called on hover and on focus; never cleared to empty. */
showCompare(item) {
  const box = $('inv-compare-body');
  if (!box) return;
  if (!item) {
    box.replaceChildren(Object.assign(el('div', 'itemcard empty'),
      { textContent: 'Point at something in the bag.' }));
    return;
  }
  const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
  const worn = this.player?.equipment?.[slot];
  const a = el('div', 'itemcard'); a.innerHTML = this.itemCard(item);
  const kids = [a];
  if (worn && worn !== item) {
    const b = el('div', 'itemcard itemcard--worn'); b.innerHTML = this.itemCard(worn, { worn: true });
    kids.push(b);
  }
  box.replaceChildren(...kids);
}
```

In `bagRow`, `row.onmouseenter` / `row.onfocus` already set `this.hoverItem`; add
`this.showCompare(item)` to both. **Do not** clear the panel in `onmouseleave` — a card that
blanks the moment you move the pointer is unusable. `hoverItem` keeps its current
set-on-enter/clear-on-leave behaviour because `R` depends on it.

And **stop calling `tipFor` on bag rows**: in `bagRow`, wrap it as
`if (pick) this.tipFor(row, item);` — the Upgrade tab's picker (`renderUpgrade`, which passes
`pick`) has no compare panel and keeps its tooltip; the bag has the panel instead. Two full item
cards on screen at once, one of them chasing the pointer, is noise.

Shift-to-compare-the-other-slot still works: `refreshTip()` only re-renders the tooltip, so add a
`this.showCompare(this.hoverItem)` call in the `shift()` handler (hud.js ~189) so the panel
follows Shift too.

The `inventory` rail badge is reserved for "items in the bag that beat what you are wearing":
`player.bag.filter(i => itemScore(i) > itemScore(player.equipment[slotOf(i)])).length`. Wire it in
phase 4 — it is the number that makes a player open the screen at all.

---

### 3.3 Skills

**What a player comes here to do, ranked**

1. Remember what keys 1–6 do.
2. Shape one skill with talents.
3. Find out when the next thing unlocks.

**Cramped or hidden today**

- The in-game bar and this screen share nothing: the screen is a text list, the bar is six boxes,
  and neither shows which talents are on a skill.
- The talent tree is three stacked `.tier-row`s in a 420px column — 2–3 cards per tier wrap to
  two lines each, so the three tiers read as one undifferentiated list.
- The skill picker is a `.shop-tabs` chip row built *inside* `#sheet-skilltree`, so it scrolls
  away with the tree.
- `#sheet-talent-points` says "one per tier · tiers open at 1, 8, 18" and nothing about *this*
  skill's state.

**Wireframe**

```
┌ SKILLS ┬── header ─────────────────────────────────────────────────────────────────────────── × ┐
├────────┼─────────────────────────────────────────────────────────────────────────────────────────┤
│ rail   │ YOUR BAR   click a key to shape it                                                      │
│        │ ┌──1──────┐┌──2──────┐┌──3──────┐┌──4──────┐┌──5──────┐┌──6──────┐                      │
│        │ │Quickshot││Volley   ││Hunter's ││Snare    ││ level 18││ level 24│                      │
│        │ │8 mana   ││14 mana  ││Mark     ││11 mana  ││ locked  ││ locked  │                      │
│        │ │4.0s ●●○ ││7.0s ●○○ ││12s  ○○○ ││9.0s ●●● ││         ││         │                      │
│        │ └─────────┘└═════════┘└─────────┘└─────────┘└─────────┘└─────────┘   ← ● = talent taken │
│        ├───────────────────────┬─────────────────────────────────────────────────────────────────┤
│        │ ALL SKILLS            │ VOLLEY — TALENTS      one from each tier                        │
│        │ ┌───────────────────┐ │ ┌──────────────┬──────────────┬──────────────────────────────┐  │
│        │ │1 Quickshot        │ │ │ TIER 1       │ TIER 2       │ TIER 3 — level 18            │  │
│        │ │  8 mana · 4.0s    │ │ │ how it flies │ when it lands│ what it does to the fight    │  │
│        │ │  A fast arrow…    │ │ ├──────────────┼──────────────┼──────────────────────────────┤  │
│        │ ├───────────────────┤ │ │┌────────────┐│┌────────────┐│┌────────────────────────────┐│  │
│        │ │2 Volley        ◀  │ │ ││ Fanned  ✓  │││ Bursting   │││ Cauterise        (locked)  ││  │
│        │ │  14 mana · 7.0s   │ │ ││ Three at…  │││ Bursts on… │││ A critical burns…          ││  │
│        │ │  A spread of…     │ │ │└────────────┘│└────────────┘│└────────────────────────────┘│  │
│        │ ├───────────────────┤ │ │┌────────────┐│┌────────────┐│┌────────────────────────────┐│  │
│        │ │3 Hunter's Mark    │ │ ││ Piercing   │││ Chaining ✓ │││ Echo             (locked)  ││  │
│        │ │  …                │ │ │└────────────┘│└────────────┘│└────────────────────────────┘│  │
│        │ │ (scrolls)         │ │ │┌────────────┐│┌────────────┐│┌────────────────────────────┐│  │
│        │ └───────────────────┘ │ ││ Heavy      │││ Deepening  │││ Branding         (locked)  ││  │
│        │ UNLOCK LADDER         │ │└────────────┘│└────────────┘│└────────────────────────────┘│  │
│        │ 1·3·7·12·18·24        │ └──────────────┴──────────────┴──────────────────────────────┘  │
│        │                       │ Volley: fanned, chaining. Drawn bigger for every talent on it.  │
└────────┴───────────────────────┴─────────────────────────────────────────────────────────────────┘
```

**Panes**

| pane | id | grid area | size | scrolls |
|---|---|---|---|---|
| Your bar | `#sheet-skillbar` (**new**) in `#sheet-bar-pane` | `bar` | full width × 118px (98px ≤1440) | no |
| All skills | `#sheet-skills` in `#sheet-skill-pane` | `list` | 380 / 320 / 300 | **yes** |
| Talents | `#sheet-skilltree` in `#sheet-talent-pane` | `tree` | 1fr → 1258 / 828 / 758 | **yes** |
| Summary line | `#sheet-talent-summary` (**new**) | in `tree` footer | — | no |
| Unlock ladder | `#sheet-talent-points` (existing id, moved) | in `list` footer | — | no |

```css
.tab-body[data-tab="skills"]:not(.hidden) {
  display: grid;
  grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
  grid-template-rows: 118px minmax(0, 1fr);
  grid-template-areas: "bar bar" "list tree";
  gap: var(--gap); padding: var(--gap) var(--pad) var(--pad); min-height: 0;
}
@media (max-width: 1440px) { .tab-body[data-tab="skills"]:not(.hidden) { grid-template-rows: 98px minmax(0,1fr); } }
```

**The bar preview strip — accepted, and it becomes the picker**

New id `#sheet-skillbar` (distinct from the in-game `#skillbar`). Rendered from `this.skillState`
plus `picksFor(player, id)`; both are already in scope in `renderSkills`.

```css
#sheet-skillbar { display: flex; gap: 8px; align-items: stretch; }
.sk-card {
  flex: 1 1 0; min-width: 0; max-width: 220px;
  display: flex; flex-direction: column; gap: 2px; position: relative;
  padding: 7px 9px 6px 26px;
  background: var(--pane-bg2); border: 1px solid #2a3446; border-radius: 7px;
  cursor: pointer; text-align: left; font: inherit; color: var(--ink);
}
.sk-card .sk-key {
  position: absolute; left: 6px; top: 6px;
  width: 16px; height: 16px; border-radius: 4px; display: grid; place-items: center;
  font-size: var(--fs-sm); font-variant-numeric: tabular-nums;
  background: #0c111b; border: 1px solid #2a3446; color: var(--ink-faint);
}
.sk-card .sk-name { font-weight: 600; font-size: var(--fs);
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sk-card .sk-cost { font-size: var(--fs-sm); color: var(--ink-faint);
                    font-variant-numeric: tabular-nums; }
.sk-card .sk-pips { display: flex; gap: 3px; margin-top: auto; }
.sk-card .sk-pips i { width: 7px; height: 7px; border-radius: 50%;
                      background: #26344a; border: 1px solid #38496a; }
.sk-card .sk-pips i.on   { background: var(--gold); border-color: var(--gold); }
.sk-card .sk-pips i.open { border-color: var(--accent); }     /* a tier you could spend in */
.sk-card:hover { border-color: #3f6f9a; }
.sk-card.on    { border-color: var(--accent); background: rgba(24, 44, 62, .9);
                 box-shadow: inset 0 -2px 0 var(--accent); }
.sk-card.locked { opacity: .45; cursor: default; }
.sk-card.locked .sk-name { color: var(--ink-faint); }
```

```js
// in renderSkills(), before the tree
const bar = $('sheet-skillbar');
const open = tiersOpen(player.level ?? 1);              // e.g. [1,2] at level 12
bar.replaceChildren(...this.skillState.map((s, i) => {
  const picks = s.locked ? {} : picksFor(player, s.id);
  const card = el('button', 'sk-card'
    + (s.locked ? ' locked' : '')
    + (s.id === this.talentSkill ? ' on' : ''));
  card.dataset.tipRender = 'skill'; card.dataset.tipSkill = String(i);
  card.innerHTML = `<span class="sk-key">${i + 1}</span>`
    + `<span class="sk-name">${s.locked ? `level ${s.unlockAt}` : s.name}</span>`
    + `<span class="sk-cost">${s.locked ? 'locked' : `${s.mp} mana · ${s.cooldown.toFixed(1)}s`}</span>`
    + `<span class="sk-pips">` + [1, 2, 3].map(t =>
        `<i class="${picks[t] ? 'on' : open.includes(t) ? 'open' : ''}"></i>`).join('') + `</span>`;
  if (!s.locked) card.onclick = () => { this.talentSkill = s.id; this.renderSheet(); };
  return card;
}));
```

The strip **replaces** the `.shop-tabs` picker built inside `#sheet-skilltree` — delete those seven
lines from `renderSkills` (hud.js ~907–913). It also replaces the `registerTip('skill')` hover on
the list rows as the primary read, but keep both: the tooltip renderer is unchanged and the
`data-tip-skill` index matches.

**Three visible tiers — accepted, and nearly free**

Once the picker and the summary paragraph move out, `#sheet-skilltree` contains exactly six
children in the order `h4, div, h4, div, h4, div`. `grid-auto-flow: column` then lays them out as
three columns of (head, cards) with no markup change at all:

```css
.skilltree {
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  grid-template-rows: auto minmax(0, 1fr);
  gap: 8px 12px;
  align-content: start; min-height: 0;
}
.skilltree > .tier-head { margin: 0; padding-bottom: 5px; border-bottom: 1px solid var(--pane-line); }
.skilltree > .tier-row  { flex-direction: column; flex-wrap: nowrap; gap: 7px;
                          min-height: 0; overflow-y: auto; }
.talent-card { width: auto; min-height: 62px; padding: 8px 10px;
               display: flex; flex-direction: column; gap: 3px; }
.talent-card b { font-size: 13.5px; color: #eaf6ff; }
.talent-card .small { font-size: var(--fs-sm); }
.talent-card.on::after { content: "✓"; position: absolute; right: 8px; top: 6px; color: var(--accent); }
.talent-card { position: relative; }
```

Two small `renderSkills` changes make it true:

1. Drop the `picker` from `kids` (it is now the strip).
2. Write the summary to `#sheet-talent-summary` instead of pushing a `<p>` into the tree.
3. Put the tier's theme in the head text so the columns mean something:
   `Tier 1 — how it flies`, `Tier 2 — when it lands`, `Tier 3 — what it does to the fight`
   (those three phrases are already in the comment at hud.js 891–897; move them into the UI).

Column width at 1280: `(758 − 24) / 3 = 244px` per tier — a 2-line name plus a 3-line description
fits at 12px. At 1920 it is 411px and the whole tree reads without scrolling.

**The unlock ladder** — `#sheet-talent-points` moves to the footer of the skills list pane and says
something useful:
`one talent per tier · tiers open at 1, 8, 18 · skills unlock at 1, 3, 7, 12, 18, 24`
(the second list is `data.skills` `unlockAt`, already on each `skillState[i].unlockAt` — join the
six values rather than hard-coding them).

---

### 3.4 Perks

**What a player comes here to do, ranked**

1. Spend a point.
2. Work out what is reachable, and what it would cost to get somewhere.
3. See what they have already taken.

**Cramped or hidden today**

- `.perk-canvas { min-height: 440px }` inside an `86vh` modal. `drawForest` fits the whole
  89-node forest into `min(w, h) / 2 − 34` — so the scale is driven by the *smaller* dimension and
  at 440px tall the nodes are 4.5px dots with no labels. Reading the shape of the tree, which is
  the whole mechanic ("the shape of the tree is the cost"), is guesswork.
- The legend and the refund button share the header row with the point count.
- Nothing lists what you have taken. To audit your build you hover 89 dots.

**Wireframe**

```
┌ PERKS ┬── header ──────────────────────────────────────────────────────────────────────────── × ┐
├───────┼──────────────────────────────────────────────────────────────┬────────────────────────────┤
│ rail  │ THE FOREST      click a node · ● reachable · ◆ keystone      │ WHERE YOU HAVE WALKED      │
│       │ ┌──────────────────────────────────────────────────────────┐ │ ●Blade        7            │
│       │ │                        ◇ Warden                          │ │ ●Warden       3            │
│       │ │              ●───●───●      ●───◆                        │ │ ●Flame        0            │
│       │ │             /        \      /                             │ │ ●Wind         2            │
│       │ │   ◇Flame ●─●    ● you began here ●─●─◇ Blade              │ │ ●Stone        0            │
│       │ │             \        /      \                             │ ├────────────────────────────┤
│       │ │              ●───●───●      ●───●                        │ │ Ironhide                   │
│       │ │                        ◇ Wind                             │ │ keystone · Warden          │
│       │ │        (fills 1258 × 972 at 1920; 758 × 642 at 1280)     │ │ Hits under 40 do nothing…  │
│       │ │                                                          │ │ costs 2 points             │
│       │ │                                                          │ │ [ Take it ]                │
│       │ └──────────────────────────────────────────────────────────┘ ├────────────────────────────┤
│       │ LEGEND  ●Blade ●Warden ●Flame ●Wind ●Stone   [Take it all back]│ TAKEN  12                │
│       │                                                              │ │ Keen Edge · Blade        │
│       │                                                              │ │ Ironhide · Warden        │
│       │                                                              │ │ … (scrolls)              │
└───────┴──────────────────────────────────────────────────────────────┴────────────────────────────┘
```

**Panes**

| pane | id | size | scrolls |
|---|---|---|---|
| The forest | `#perk-canvas` inside `#perk-stage` | 1fr × full height | no |
| Legend + refund | `#perk-legend`, `#perk-refund` in `#perk-foot` | 34px footer of the stage pane | no |
| Side | `#perk-side` | 340 / 320 / 320 | **yes** |
| Taken list | `#perk-taken` (**new**) inside `#perk-side` | — | with the side |

```css
.perks-body {                 /* was: flex, gap 12, min-height 460 */
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  grid-template-rows: minmax(0, 1fr);
  gap: var(--gap); min-height: 0; flex: 1;
}
@media (max-width: 1440px) { .perks-body { grid-template-columns: minmax(0, 1fr) 320px; } }

/* The canvas sizes itself FROM its wrapper (drawForest reads wrap.clientWidth/Height and then
   sets canvas.style.width/height in px). If the canvas were in normal flow the wrapper would
   size to the canvas and the two would fight. Take it out of flow. */
#perk-stage { position: relative; min-height: 0; min-width: 0; overflow: hidden; }
.perk-canvas {
  position: absolute; left: 4px; top: 4px;
  min-height: 0; min-width: 0;           /* drop the 440/360 floors */
  border: 1px solid var(--pane-line); border-radius: 6px;
}
#perk-foot {
  flex: none; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  padding: 6px 10px; border-top: 1px solid var(--pane-line-soft); background: #0c1220;
}
.perk-legend { font-size: var(--fs-sm); }
.perk-side { width: auto; }              /* the grid owns the width now */
.perk-bars { font-size: var(--fs); }
.perk-bar  { padding: 3px 6px; border-radius: 4px; background: rgba(16,24,36,.6);
             font-variant-numeric: tabular-nums; }
#perk-taken { display: flex; flex-direction: column; gap: 3px; }
```

**Markup** — `.perks-head` keeps `#perk-points`; `#perk-legend` and `#perk-refund` move into
`#perk-foot` under the canvas (they are reference material, not the headline):

```html
<div class="tab-body hidden" data-tab="perks">
  <div class="perks-body">
    <section class="pane" id="perk-stage-pane">
      <div class="pane-head">
        <span class="pane-title">The forest</span>
        <span class="pane-meta" id="perk-points"></span>
        <span class="pane-tools keyhint">click a node · ◆ keystone · ■ talent</span>
      </div>
      <div class="pane-body flush" id="perk-stage"><canvas id="perk-canvas" class="perk-canvas"></canvas></div>
      <div id="perk-foot">
        <div class="perk-legend" id="perk-legend"></div>
        <button id="perk-refund" class="chip">Take it all back</button>
      </div>
    </section>
    <aside class="pane"><div class="pane-head"><span class="pane-title">This node</span></div>
      <div class="pane-body" id="perk-side"></div></aside>
  </div>
</div>
```

`#perk-side` moves from `<aside class="perk-side">` to a `.pane-body`; keep the `perk-side` class
on it so `.perk-side h4 / .warn / .good` (style.css 878–880) still apply:
`<div class="pane-body perk-side" id="perk-side">`.

**The win is the size.** At 1920 the canvas is 1258 × 968 → `drawForest`'s scale becomes
`(968 − 68) / span` against today's `(440 − 68) / span`: **2.4× further apart**. At 1280 it is
`(642 − 68) / span`, still 1.5×. No draw-code change needed.

**Taken list — accepted** (new, ~10 lines in `renderPerkSide`):

```js
const taken = [...takenOf(player)].map(id => forest.byId.get(id)).filter(Boolean);
const list = el('div', null); list.id = 'perk-taken';
for (const n of taken.sort((a, b) => (a.arm || '').localeCompare(b.arm || '') || a.name.localeCompare(b.name))) {
  const row = el('div', 'list-row');
  row.style.borderLeftColor = ARMS.find(a => a.key === n.arm)?.color || '#2a3446';
  row.innerHTML = `<span class="row-main">${n.name}</span>`
    + `<span class="row-note">${NODE_KINDS[n.kind]?.name || n.kind}</span>`;
  row.onclick = () => { this.perkPick = n.id; this.renderSheet(); };
  list.append(row);
}
kids.push(el('div', 'divider', `Taken · ${taken.length}`), list);
```

The arm colour as an inline `borderLeftColor` is legitimate dynamic styling — `ARMS[].color` is
data.

**Rejected for round 10: pan and zoom on the canvas.** It needs a wheel handler, a drag handler,
and `perkUnder()` reworked to honour the offset — real work for a payoff that full screen already
delivers. If it is wanted later: keep `this._perkView = { cx, cy, scale }` as the single source of
truth (it already is), add `this._perkPan = {x, y}` and `this._perkZoom = 1`, apply both in
`drawForest` and in `perkUnder`, and clamp zoom to 0.6–3.

Also: `#sheet-title` must say "Perks" — see §0.1.

---

### 3.5 Crafting

**What a player comes here to do, ranked**

1. Forge a particular thing — usually a weapon or the one armour slot that is behind.
2. Find out whether they can pay for it, and what they are short of.
3. Understand what will come out before spending.

**Cramped or hidden today**

- Two nested scrollers in the right column: `.recipe-list { max-height: 42vh }` and
  `.forge-grid { max-height: 34vh }` — on a 768px screen that is 322px and 261px inside an
  `86vh` (660px) modal, so the Forge button is usually below the fold.
- The forge grid is `repeat(auto-fill, minmax(140px, 1fr))` in a 420px column → three columns of
  140px, which truncates "Reinforced Halfplate".
- Materials sit at the top of the left column and scroll away as you pick a recipe (fixed by
  moving them to the header, §1.5).
- Six create-recipes and their costs, the base options, the cost table, the outcome and the button
  all queue up in one column.

**Wireframe**

```
┌ CRAFTING ┬── header  ●scrap 41 ●essence 8 ●dust 1 ──────────────────────────────────────────── × ┐
├──────────┼───────────────────┬───────────────────────────────────────┬────────────────────────────┤
│ rail     │ RECIPES           │ WHAT TO MAKE     forge a weapon       │ FORGE A WEAPON             │
│          │ ┌───────────────┐ │ ┌──────────┬──────────┬──────────┐    │ Any weapon your class can  │
│          │ │Forge a weapon◀│ │ │Longsword │Warhammer │Recurve   │    │ hold, at your level.       │
│          │ │  8 scrap      │ │ │30–52 dmg │41–66 dmg │24–48 dmg │    │ ─────────────────────────  │
│          │ ├───────────────┤ │ │          │two-handed│ranged    │    │ COST                       │
│          │ │Forge armour   │ │ ├──────────┼──────────┼──────────┤    │ ●Scrap Iron    41 / 8   ✓  │
│          │ │  8 scrap      │ │ │Dagger    │Halberd   │Rapier    │    │ ●Bound Essence  8 / 2   ✓  │
│          │ ├───────────────┤ │ │19–31 dmg │38–70 dmg │26–40 dmg │    │ ─────────────────────────  │
│          │ │Bind a quiver  │ │ ├──────────┼──────────┼──────────┤    │ WHAT COMES OUT             │
│          │ ├───────────────┤ │ │Warbow    │Greatsword│Saber     │    │ magic Longsword, at your   │
│          │ │Cast a trinket │ │ │(cannot   │two-handed│          │    │ level (12)                 │
│          │ ├───────────────┤ │ │ hold)    │          │          │    │ Two properties.            │
│          │ │Forge a fine…  │ │ └──────────┴──────────┴──────────┘    │ Magic find 24% — every     │
│          │ ├───────────────┤ │  (scrolls; ~5 across × 4 down at 1920)│ forge can come out better. │
│          │ │Forge a master…│ │                                       │                            │
│          │ │  short 1 dust │ │                                       │ [       Forge it       ]   │
│          │ └───────────────┘ │                                       │                            │
└──────────┴───────────────────┴───────────────────────────────────────┴────────────────────────────┘
```

**Panes**

| pane | id | width 1920 / 1366 / 1280 | scrolls |
|---|---|---|---|
| Recipes | `#craft-list` | 320 / 280 / 280 | **yes** |
| What to make | `#craft-bases` (**new**) | 1fr → 900 / 464 / 392 | **yes** |
| Detail | `#craft-detail` | 380 / 340 / 340 | **yes** |

```css
.tab-body[data-tab="crafting"]:not(.hidden) {
  display: grid;
  grid-template-columns: minmax(280px, 320px) minmax(0, 1fr) var(--card);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "recipes bases detail";
  gap: var(--gap); padding: var(--gap) var(--pad) var(--pad); min-height: 0;
}
.recipe-list { max-height: none; overflow: visible; gap: 4px; }   /* the pane scrolls now */
.recipe-row  { min-height: 34px; align-items: center; }
.forge-grid  { max-height: none; overflow: visible;
               grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 7px; }
.forge-option { min-height: 58px; padding: 8px 10px; display: flex; flex-direction: column; gap: 3px; }
.forge-option b { font-size: 13.5px; }
.forge-option .small { font-size: var(--fs-sm); }
.recipe-detail { gap: 8px; }
.recipe-detail h4 { margin-top: 2px; }
.forge-btn { width: 100%; min-height: 38px; font-size: 14px; margin-top: auto; }
```

**`renderCrafting` change** — one block moves. Today the function pushes `h3, p, h4 "What to make",
grid, h4 "Cost", costTable, h4 "What comes out", out, btn` all into `#craft-detail`. Split it:

```js
$('craft-bases').replaceChildren(grid);      // just the .forge-grid
box.replaceChildren(                          // #craft-detail keeps the rest
  el('h3', null, r.name), el('p', 'muted', r.desc),
  el('h4', null, 'Cost'), this.costTable(q.cost || {}),
  el('h4', null, 'What comes out'), out, btn);
```

`tests/round4.spec.js:267` looks for `#craft-detail .forge-btn` — deliberately kept there.
`#craft-list .recipe-row` (line 266) is unchanged.

The middle pane's head shows which recipe is selected (`r.name`), so the column has a subject:
write it to a new `#craft-bases-title` span in the pane head.

---

### 3.6 Upgrade

**What a player comes here to do, ranked**

1. Pick the item they care about.
2. See everything that can be done to it, and what each costs.
3. Choose which property to trade (reweave), and commit.

**Cramped or hidden today**

- `#up-pick` is `.bag.small-bag { max-height: 190px; overflow-y: auto }` — **the worst pane in the
  sheet.** Every bag item *plus* every worn item (`renderUpgrade` builds
  `[...player.bag, ...Object.values(player.equipment)]`, so 30+ rows on a geared character) in a
  190px window, five rows at a time.
- The bench card, the grouped recipe board and the detail panel are all stacked in the other half
  column, so the cost table is usually off-screen from the item it applies to.
- The bench card shows a one-line summary; the item's actual properties are tooltip-only, which
  means you cannot read the affix list *and* pick which one to reweave at the same time.
- The reweave affix list (`.bench-affixes`) is where you make the actual decision, and it renders
  at the bottom of the third stacked block.

**Wireframe**

```
┌ UPGRADE ┬── header  ●scrap 41 ●essence 8 ●dust 1 ───────────────────────────────────────────── × ┐
├─────────┼──────────────────┬───────────────────┬───────────────┬─────────────────────────────────┤
│ rail    │ PICK SOMETHING   │ ON THE BENCH      │ WHAT YOU CAN  │ REWEAVE ONE PROPERTY            │
│         │ [bag][worn][all] │ ┌───────────────┐ │ DO TO IT      │ Trade one property for another. │
│         │ ┌──────────────┐ │ │ Emberedge     │ │ The item      │ ─────────────────────────────── │
│         │ │▌Emberedge  ◀ │ │ │ rare · fine   │ │  Temper       │ WHICH PROPERTY                  │
│         │ ├──────────────┤ │ │ 38–71 damage  │ │  Reinforce    │ ┌─────────────────────────────┐ │
│         │ │▌Rimcap       │ │ └───────────────┘ │ Rarity        │ │ +9 strength           ◀     │ │
│         │ ├──────────────┤ │ ┌───────────────┐ │  Promote      │ │ +12% fire damage            │ │
│         │ │▌Warded Buckl.│ │ │ FULL CARD     │ │  Inscribe     │ │ 14% chance to burn          │ │
│         │ ├──────────────┤ │ │ rare · Weapon │ │ Properties    │ │ part of the item (fixed)    │ │
│         │ │▌Tidecharm    │ │ │ item level 14 │ │  Reweave    ◀ │ └─────────────────────────────┘ │
│         │ ├──────────────┤ │ │ requires 12   │ │  Re-roll nums │ COST                            │
│         │ │ …            │ │ │ 38–71 damage  │ │  Recast all   │ ●Bound Essence   8 / 3      ✓   │
│         │ │ (scrolls,    │ │ │ ⟶⟶⌄ 1.9 m    │ │ Brands        │ ●Resonant Dust   1 / 1      ✓   │
│         │ │  full height)│ │ │ · +9 strength │ │  fire/rime/…  │ WHAT CHANGES                    │
│         │ │              │ │ │ · 12% fire    │ │               │ The property you picked is      │
│         │ │              │ │ │ · burns…      │ │               │ replaced.                       │
│         │ │              │ │ │ worth 640 g   │ │               │ [          Do it          ]     │
│         │ └──────────────┘ │ └───────────────┘ │               │                                 │
└─────────┴──────────────────┴───────────────────┴───────────────┴─────────────────────────────────┘
```

**Panes**

| pane | id | width 1920 | scrolls |
|---|---|---|---|
| Pick something | `#up-pick` in `#up-pick-pane`, with `#up-scope` chipbar | 340 | **yes** |
| On the bench | `#up-item` (summary) + `#up-card` (**new**, full card) | 340 | **yes** |
| What you can do | `#up-list` | 300 | **yes** |
| Detail | `#up-detail` | 1fr → 620 | **yes** |

```css
.tab-body[data-tab="upgrade"]:not(.hidden) {
  display: grid;
  grid-template-columns: 340px 340px 300px minmax(320px, 1fr);
  grid-template-rows: minmax(0, 1fr);
  grid-template-areas: "pick bench actions detail";
  gap: var(--gap); padding: var(--gap) var(--pad) var(--pad); min-height: 0;
}
/* 1366 and 1280: fold the bench and the action list into one column */
@media (max-width: 1599px) {
  .tab-body[data-tab="upgrade"]:not(.hidden) {
    grid-template-columns: 300px 330px minmax(320px, 1fr);
    grid-template-areas: "pick bench detail";
  }
  /* #up-list moves into the bench column as a second pane in a .pane-stack */
}
@media (max-width: 1199px) {
  .tab-body[data-tab="upgrade"]:not(.hidden) {
    grid-template-columns: 300px minmax(320px, 1fr);
    grid-template-areas: "pick bench" "pick detail";
    grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  }
}
.small-bag { max-height: none; overflow: visible; }     /* the pane scrolls */
.bench-card { padding: 10px 12px; }
.bench-affixes { gap: 4px; }
.bench-affix { padding: 6px 9px; font-size: var(--fs); min-height: 30px;
               display: flex; align-items: center; }
```

At 1599px and below, the middle column is a `.pane-stack` holding the bench pane (fixed) and the
actions pane (grow). Markup:

```html
<div class="pane-stack col-bench">
  <section class="pane fixed"><div class="pane-head"><span class="pane-title">On the bench</span></div>
    <div class="pane-body"><div id="up-item" class="bench-card-wrap"></div>
      <div class="itemcard" id="up-card"></div></div></section>
  <section class="pane grow"><div class="pane-head">
      <span class="pane-title">What you can do to it</span>
      <span class="pane-tools keyhint">click one for the details</span></div>
    <div class="pane-body tight"><div id="up-list" class="recipe-list"></div></div></section>
</div>
```

**`#up-card` — the full item card on the bench (new).** Two lines in `renderUpgrade`, right after
the summary card is built:

```js
const full = $('up-card');
if (full) {
  const worn = Object.values(player.equipment).includes(this.bench);
  full.innerHTML = this.itemCard(this.bench, { worn });
  full.classList.toggle('empty', false);
}
```

This is what makes reweaving readable: the affix list you are choosing from (in `#up-detail`) and
the item's full state (here) are both on screen.

**`#up-scope` chipbar (new).** Three chips — *bag* / *worn* / *all*, default *all*, held on
`this.upScope`. One line in the candidates expression:

```js
const candidates = this.upScope === 'bag' ? [...player.bag]
  : this.upScope === 'worn' ? Object.values(player.equipment).filter(Boolean)
  : [...player.bag, ...Object.values(player.equipment).filter(Boolean)];
```

`#up-list .recipe-row` keeps its id and class — `tests/round4.spec.js:270` is safe.

---

### 3.7 Journal

**What a player comes here to do, ranked**

1. Find out what to do next — the survey and any work in hand.
2. Decide where to go — which region is the right level.
3. Read what is hunting them, and what they have put down.

**Cramped or hidden today**

- Everything but the zone list is in one `#sheet-journal` column: the survey title, every
  objective, the nemesis, the quest log and the bestiary, in that order, in a 420px column.
- The bestiary is **truncated to 12** (`.slice(0, 12)` in `renderJournal`) because there was
  nowhere to put more.
- The nemesis is one row with no history. `campaign.defeatedNemeses` exists (it is in
  `campaign.toJSON()`) but `journal()` in `main.js` 825 does not pass it, so the screen cannot show
  who you have already beaten.
- Every zone's `descriptor` is in a `title=` attribute — invisible unless you hover and wait.

**Wireframe**

```
┌ JOURNAL ┬── header ──────────────────────────────────────────────────────────────────────────── × ┐
├─────────┼──────────────────────────┬──────────────────────────┬───────────────────────────────────┤
│ rail    │ THE SURVEY          62%  │ WHO IS HUNTING YOU       │ THE WORLD           13 regions    │
│         │ ┌──────────────────────┐ │ ┌──────────────────────┐ │ ┌───────────────────────────────┐ │
│         │ │ Walk the coast   ✓   │ │ │ Grix the Unquiet     │ │ │▌Hollow Reach     lvl 1–4      │ │
│         │ │   12 / 12 km         │ │ │ beat you 3×          │ │ │ where you started · quiet     │ │
│         │ │ Find four ruins      │ │ └──────────────────────┘ │ │ ├───────────────────────────────┤ │
│         │ │   2 / 4              │ │ PUT DOWN FOR GOOD        │ │▌Saltmarsh Verge  lvl 5–8  ◀you │ │
│         │ │ Chart the north      │ │ ┌──────────────────────┐ │ │ waterlogged flats · uneasy    │ │
│         │ │   0 / 1              │ │ │ Vella the Cinder     │ │ ├───────────────────────────────┤ │
│         │ │ (scrolls)            │ │ └──────────────────────┘ │ │▌Ashen Downs      lvl 9–12     │ │
│         │ └──────────────────────┘ ├──────────────────────────┤ │ burnt heath · dangerous       │ │
│         ├──────────────────────────┤ WHAT YOU HAVE KILLED 34  │ │ ├───────────────────────────────┤ │
│         │ WORK IN HAND        3    │ ┌──────────────────────┐ │ │ … (scrolls, full height)      │ │
│         │ ┌──────────────────────┐ │ │ moor hound      38   │ │ └───────────────────────────────┘ │
│         │ │ Clear the old mine   │ │ │ bog lurker      21   │ │                                   │
│         │ │   4 / 5          ✓   │ │ │ cinder shade    17   │ │                                   │
│         │ │ Carry the ledger     │ │ │ … (all of them)      │ │                                   │
│         │ │   0 / 1              │ │ └──────────────────────┘ │                                   │
│         │ └──────────────────────┘ │                          │                                   │
└─────────┴──────────────────────────┴──────────────────────────┴───────────────────────────────────┘
```

**Panes** — one layout at every size. Zones span both rows because a 13-row list with three lines
each is the tallest thing on the screen.

| pane | id | area | scrolls |
|---|---|---|---|
| The survey | `#sheet-journal` (kept) | `survey` | **yes** |
| Work in hand | `#journal-quests` (**new**) | `quests` | **yes** |
| Who is hunting you / put down | `#journal-foes` (**new**) | `foes` | **yes** |
| What you have killed | `#journal-kills` (**new**) | `kills` | **yes** |
| The world | `#sheet-zones` (kept) | `zones` | **yes** |

```css
.tab-body[data-tab="journal"]:not(.hidden) {
  display: grid;
  grid-template-columns: minmax(280px, .9fr) minmax(280px, .9fr) minmax(360px, 1.2fr);
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
  grid-template-areas:
    "survey foes  zones"
    "quests kills zones";
  gap: var(--gap); padding: var(--gap) var(--pad) var(--pad); min-height: 0;
}
.journal { gap: 3px; margin: 0; }
.journal-row {
  display: grid; grid-template-columns: 1fr auto; gap: 2px 10px;
  padding: 5px 8px; font-size: var(--fs);
}
.journal-row .muted { font-variant-numeric: tabular-nums; }
.zonelist { gap: 4px; }
.zone-row {
  grid-template-columns: 1fr auto auto;
  grid-template-areas: "name band danger" "desc desc desc";
  padding: 6px 9px; row-gap: 2px;
}
.zone-row > :nth-child(1) { grid-area: name; font-weight: 600; }
.zone-row > :nth-child(2) { grid-area: band; font-variant-numeric: tabular-nums; }
.zone-row > :nth-child(3) { grid-area: danger; }
.zone-row .zone-desc { grid-area: desc; font-size: var(--fs-sm); color: var(--ink-faint); }
.zone-row.here { box-shadow: inset 0 0 0 1px rgba(127, 216, 255, .35); }
```

**`renderJournal` changes**

1. `#sheet-journal` keeps only the survey head and `j.objectives`. The quest block moves to
   `#journal-quests`, the nemesis block plus `j.defeated` to `#journal-foes`, and the bestiary to
   `#journal-kills` **without** `.slice(0, 12)` — a 480px-tall pane holds 20 rows and scrolls past
   that.
2. `.zone-row` gains a fourth child: `el('span', 'zone-desc', z.descriptor || '')`, and the
   `row.title` line can go. `descriptor` is already on every zone (`js/zones.js` 129).
3. Pane heads carry the counts: `#journal-quests` head meta = `j.quests.length`, `#journal-kills`
   head meta = the number of distinct entries, `#sheet-zones` head meta = `list.length`, and the
   survey head meta = `${Math.round(j.share * 100)}%`.

**One `main.js` change:** add `defeated: campaign.defeatedNemeses` to the object returned by
`journal()` (main.js 825–833). Everything else on this screen already arrives.

**Test to follow:** `tests/town.spec.js:247–249` counts `#sheet-journal .journal-row` (expects > 6)
and asserts the text contains both `surveyed` and `moor hound`. Once the bestiary moves out, wrap
the five panes in `<div class="journal-grid" id="journal-body">` and change the test to read
`#journal-body .journal-row` / `#journal-body` textContent. That keeps what the test is really
checking (the journal renders objectives *and* kills) while letting the columns split.

---

## 4. Interaction and accessibility

### 4.1 Keys

| key | now | round 10 |
|---|---|---|
| `I` | toggles the sheet | unchanged |
| `Tab` | toggles the sheet | **opens only.** While the sheet is open, `Tab` must move focus. |
| `Esc` | closes the sheet (main.js 2206–2211) | unchanged — and the rail says so |
| `1`–`6` | cast a skill; frozen while the sheet is open (main.js 2308) | `1`–`7` switch screens |
| `R` | recycles the hovered bag item (hud.js 199–214) | unchanged |
| `Shift` | compares against the other slot | unchanged, and now also refreshes `#inv-compare` |
| `+` / `−` | minimap zoom, ignored while the sheet is open | unchanged |

The `Tab` fix is one line in main.js 2196:

```js
if (e.code === 'KeyI' || (e.code === 'Tab' && !hud.sheetOpen)) {
  e.preventDefault(); pauseMenu.toggle(false); hud.toggleSheet();
}
```

Without it, every attempt to keyboard-navigate the sheet closes it. This is a bug today, hidden
only by nothing in the sheet being reachable by keyboard.

Screen keys, added to the existing `keydown` listener in the `Hud` constructor:

```js
const SCREENS = ['character','inventory','skills','perks','crafting','upgrade','journal'];
window.addEventListener('keydown', e => {
  if (!this.sheetOpen || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  const n = +e.key;
  if (n >= 1 && n <= 7) { e.preventDefault(); this.setTab(SCREENS[n - 1]); }
});
```

The `SELECT` guard matters: `#sheet-vehicles` has real `<select>` elements.

### 4.2 Focus

There is **no focus style anywhere in the project today**, and `tabIndex = 0` is already set on
`.slot`, `.bag .row`, `.material`, `.skill-row` and `.recipe-row`. Add once:

```css
.sheet :focus-visible {
  outline: 2px solid var(--accent); outline-offset: 1px; border-radius: 5px;
}
.sheet .bag .row:focus-visible, .sheet .slot:focus-visible { outline-offset: -1px; }
```

`:focus-visible` rather than `:focus` so clicking a row does not leave a ring behind it.

On open, move focus into the sheet so `Tab` starts somewhere sensible, and return it on close:

```js
toggleSheet(open = !this.sheetOpen) {
  hideTip();
  this.sheetOpen = open;
  $('sheet').classList.toggle('hidden', !open);
  if (open) {
    this._returnFocus = document.activeElement;
    this.onOpenSheet?.(); this.renderSheet();
    $('sheet-tabs').querySelector('button.on')?.focus();
  } else { this.onCloseSheet?.(); this._returnFocus?.focus?.(); }
  return open;
}
```

### 4.3 Roles

```html
<section id="sheet" class="sheet hidden" role="dialog" aria-modal="true" aria-label="Character">
<nav class="tabs" id="sheet-tabs" role="tablist" aria-label="Character screens">
<div class="tab-body" data-tab="character" role="tabpanel" aria-label="Character">
```

In `setTab`, next to the existing `classList.toggle('on', …)`:
`btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');`

### 4.4 Hover versus click

- **Hover never changes state.** It fills `#inv-compare`, opens a tooltip, and highlights. That is
  all. Every commit — equip, recycle, spend, forge, take a perk, pick a talent — is a click.
- The compare panel **never empties on mouse-leave**. It holds the last thing you looked at.
- The tooltip engine (`shared/tooltip.js`) stays exactly as it is: 150ms delay, edge-flipping,
  keyboard-focus friendly, `refreshTip()` for Shift. `hideTip()` is already called on every
  destructive action and on `setTab`. Keep that discipline — a tooltip pointing at a row that has
  just been replaced is the one way this engine looks broken.
- Tooltips stay on: `.slot` (the doll), `.material`, `.skill-row`, `.sk-card`, `.recipe-row`,
  `.bench-affix`, `.stats dt`, the `♺` button, and the Upgrade tab's picker rows. Tooltips come off
  bag rows only, because the compare panel does that job better.

### 4.5 Text size and numbers

- **Nothing in the sheet below 12px.** Fix these: `.slot .label` 11px → `var(--fs-sm)`;
  `.tip-foot` 11px → 12px; `.tip-req` 11.5px → 12px; `.perk-legend` / `.legend` 11px → 12px;
  `.recipe-detail h4` and `.pane-title` may stay at 11.5px **only** because they are uppercase and
  tracked at `letter-spacing: 1.2px`, which reads larger than it measures.
- `font-variant-numeric: tabular-nums` on: `.stats` (has it), `.bag .row .score` (has it),
  `.material b` (has it), `.cost-row b` (has it), `.recipe-cost` (has it), and add it to
  `.sheet-purse`, `.sheet-xp .xp-text`, `.sheet-who .who-level`, `.list-row .row-num`,
  `.journal-row .muted`, `.zone-row` band, `.perk-bar`, `.sk-card .sk-cost`, `.rail-badge`,
  `.rail-key`.

### 4.6 What must not move when the data changes

`renderSheet()` calls `replaceChildren` on every list in the visible screen, and it runs on every
equip, recycle, spend, craft and perk pick. Three rules:

1. **Reserve width for every number that changes.** Already specified: `.bag .row .score`
   `min-width: 62px; text-align: right`, `.stats dd` `min-width: 92px; text-align: right`,
   `.list-row .row-num` `min-width: 48px`. Without these, an item score going from 98 to 102
   re-flows the name column of every row.
2. **Keep the scroll position.** Wrap the body of `renderSheet()`:

```js
renderSheet() {
  const player = this.player;
  if (!player) return;
  const keep = [...document.querySelectorAll('#sheet .pane-body')].map(n => [n, n.scrollTop]);
  /* … header, badges, and the per-tab render … */
  for (const [n, top] of keep) n.scrollTop = top;
}
```

   Scroll is restored on the pane, not on the list, which is why `.pane-body` is the scroller in
   every screen above.
3. **Do not rebuild what the pointer is on.** The two chipbars, the recycle buttons, the rail and
   the header are built once (`dataset.wired = '1'`, the pattern `renderPerks` already uses at
   hud.js 993 and 1014) and only have classes and text updated afterwards. A chip that is
   `replaceChildren`d out from under a mid-click pointer swallows the click.
4. `scrollbar-gutter: stable` on `.pane-body` (§2.1) keeps a list from jumping 15px sideways the
   first time it grows past its pane.

### 4.7 Reduced motion

No animation is specified in this round. If a pane fade is added later, guard it:
`@media (prefers-reduced-motion: reduce) { … transition: none }`, as `shared/tooltip.css` already
does.

---

## 5. Implementation order

Each item is tagged **[C]** CSS only, **[M]** markup + CSS, or **[J]** needs a `hud.js` (or
`main.js`) render change. Phases 1–3 each leave the game playable.

### Phase 1 — the shell. [M] Half a day.

1. `.sheet` root grid, tokens, z-index 34, media queries. §1.2, §1.4. **[C]**
2. Header markup and CSS; move `<nav id="sheet-tabs">` out of the header; rail CSS. §1.5, §1.6. **[M]**
3. Header + materials render contract; `#sheet-materials` replaces `#craft-materials` /
   `#up-materials`; update `tests/round4.spec.js:265`. **[J]**
4. Pane / chipbar / list-row / empty-state / divider / keyhint components. §2. **[C]**
5. The `:is(.tipbox, .itemcard)` rewrite of every `.tip-*` selector. §2.5. **[C]**
   *Do this before any screen that shows a standing card, or the card renders unstyled.*
6. The three bugs in §0. **[J]**
7. Focus ring, roles, the `Tab` fix, the `1`–`7` screen keys. §4.1–4.3. **[J]**
8. Scroll keeping and reserved number widths. §4.6. **[J]**

At the end of phase 1 every screen still uses `.cols` inside the new shell — two columns in a
1652px body, which looks sparse but works. Nothing is broken.

### Phase 2 — the two screens players live in. [M]/[J] One day.

9. Character: the `.doll` grid and the silhouette background; wrap the six sections in panes;
   three-column body; drop the `.powers` height cap; `#sheet-inert` as a warning. §3.1. **[M]**
10. `slotGrid`: one line for `data-rarity`. **[J]**
11. Inventory: three-column body, filter/sort chipbars, `#inv-tools` footer, grid view. §3.2. **[M]** + **[J]**
12. `#inv-compare` and `showCompare()`; `tipFor` off bag rows; `bagRow` gains `data-rarity`. **[J]**
13. Stats: the four-column `@media (min-width: 1500px)` rule. **[C]**

### Phase 3 — the three benches. [M]/[J] One day.

14. Crafting: three-column body, `#craft-bases`, drop the `42vh` / `34vh` caps. §3.5. **[M]** + **[J]**
15. Upgrade: four-/three-/two-column body, `#up-card`, `#up-scope`, kill `.small-bag`'s 190px. §3.6. **[M]** + **[J]**
16. Perks: `.perks-body` grid, `#perk-stage` with the absolutely-positioned canvas, `#perk-foot`,
    `#perk-taken`. §3.4. **[M]** + **[J]**

### Phase 4 — the screens that reward width. [J] Half a day.

17. Skills: `#sheet-skillbar` strip, the three-tier `grid-auto-flow: column` tree, move the picker
    and the summary out of `#sheet-skilltree`, tier theme names in the heads. §3.3. **[M]** + **[J]**
18. Journal: five panes, the bestiary un-truncated, `zone-desc`, `defeated` in `journal()`,
    `#journal-body` wrapper, update `tests/town.spec.js`. §3.7. **[M]** + **[J]**
19. Rail badges. §1.6. **[J]**
20. Grouped stats (`#sheet-stats-offence` / `-defence` / `-utility`). §3.1. **[J]**

### Phase 5 — polish. [C] A couple of hours.

21. Swap the important `el('p','muted small', …)` fallbacks for `.empty-state` with a sentence that
    says what to do ("Nothing in the bag yet. Kill something." is already the right tone — give it
    the box).
22. The 12px floor sweep. §4.5.
23. `tabular-nums` sweep. §4.5.
24. A Playwright screenshot spec at 1920×1080, 1366×768 and 1280×720 that opens each of the seven
    screens and asserts `document.documentElement.scrollWidth === clientWidth` (no horizontal
    scroll) and that `#sheet` itself has `scrollHeight === clientHeight` (the page does not
    scroll — only panes do). This is the one assertion that keeps the layout honest as screens
    gain content.

### Deliberately not in round 10

| idea | why not |
|---|---|
| A live 3D portrait in the equip figure | needs a second renderer or a render target while the world is paused; the sheet must open in one frame |
| Item icons in the doll | there is no item art in `data/items.json` — twelve coloured squares is worse than twelve names |
| Drag and drop equipping | click already equips; a drag layer buys no new capability |
| A text search in the bag | steals the keyboard from `R` and `1`–`7`; five filter chips cover a bag of tens. Revisit past ~60 rows |
| Pan and zoom on the perk forest | full screen already gives 2.4× the spread at 1920; the handlers plus reworking `perkUnder()` is its own round |
| A named-foe board fed by a damage meter | Farhold has no meter integration (that is Emberveil's `meters/`). The Journal's foes column is built from `nemesis` + `defeatedNemeses`, which do exist |
