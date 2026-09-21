# Round 17 — weapons, tools, seams: the patches that belong in files I do not own

The weapons/tools/harvest/art cluster owns `js/weapons.js`, `js/tools.js`, `js/mining.js`,
`js/props.js`, `js/ore-view.js`, `js/combat-feel.js`, `js/combat-fx.js`, `data/tools.json`,
`data/resources.json`, `data/megaflora.json` and `avatar-3d/js/chibi2-motion.js` +
`chibi2-weapons.js`, plus new files and new tests.

**Everything in round 17 is live without any of the patches below.** This project's signature fault
is a finished module with no caller, and an unapplied handoff patch is that same fault by another
route — so where a hook was needed and `main.js` was not available, the work was wired through a
channel that already runs (see each patch for which one). Every patch here is a **tidy-up**: it
moves a side effect from the place that could reach it to the place it belongs. Nothing breaks if
none of them is applied, and each one says what it lets us delete.

The one exception is **patch 3**, which is not a tidy-up: it is a better sentence, not a fix.

---

## Patch 1 — the spell-shape glyph, drawn properly (js/hud.js)

**Live today without this.** `patternGlyphs(item)` returns the spell-shape SVG for a staff or a
wand and the old unicode strike glyphs for everything else, and hud.js already drops its return
value into `innerHTML`. So the fix works as it stands.

What this patch buys is the caption and the glyph as two nodes instead of one string, which is what
a screen that wants to lay them out differently needs.

`js/weapons.js` exports:

```js
spellShapeOf(item)   // -> { key, label, note, aim, svg, spell, element, elementName } or null
```

In `js/hud.js`, **after** this line (currently ~3474 in `itemCard`):

```js
      if (item.castLine) bits.push(`<div class="tip-dim">${item.castLine}</div>`);
```

insert:

```js
      /**
       * R17 — the spell's SHAPE, as a glyph and a caption out of the same row of
       * js/spellshapes.js. A staff used to print "· ⟋" here — `CATEGORY_PATTERNS.magic`, which is
       * a melee jab and a melee cut, neither of which a staff has ever done.
       */
      const shape = spellShapeOf(item);
      if (shape) {
        bits.push(`<div class="tip-pattern"><span class="glyphs">${shape.svg}</span>`
          + `<span class="muted small">${shape.label}</span></div>`);
      }
```

and add `spellShapeOf` to the `./weapons.js` import at the top of hud.js (line 41).

If you apply it, also change the guard below it so a caster does not draw both:

```js
    if (item.type === 'weapon' && item.rangeClass === 'melee' && !spellShapeOf(item)) {
```

---

## Patch 2 — the charge meter's stylesheet (style.css)

**Live today without this.** `js/combat-fx.js` links `combat.css` at start-up, the same way
`js/civics-ui.js` links `civics.css`.

**The bug it fixes, for the record:** `hud.chargeMeter()` has built
`<div class="charge-meter"><i></i></div>` on every frame the attack button is held since round 15,
and `grep -rn charge-meter` across the whole project returned **that one line and nothing else**.
There was no `.charge-meter` rule anywhere. An unstyled `div` has no size and no background, and a
width percentage on an inline `<i>` does nothing at all — so the bow's draw and the staff's channel
have both been drawing a completely invisible bar for two rounds. That is one half of "does holding
it actually do anything?".

To tidy it up: paste the contents of `combat.css` into `style.css` (it is ~90 lines, all under
`.charge-meter` and `.spell-glyph`), then delete `ensureCombatStyles()` and its call from
`js/combat-fx.js` and delete `combat.css`.

---

## Patch 3 — a giant made of stone says why (js/main.js) — NOT a tidy-up

`data/megaflora.json` gives every non-wood giant a `why` sentence ("The arch is one piece of
bedrock. Take a bite out of it and the rest comes down on you.") and `props.describe()` returns it.
`beginGather` prints its own generic refusal instead, which is true but implies a better tool would
work:

In `js/main.js` `beginGather` (~2801), replace:

```js
      if ((about.tier ?? 0) > tier) {
        hud.log(`The ${about.name || 'it'} is too hard for what you are carrying.`, 'warn');
        return true;
      }
```

with:

```js
      /** R17 — a giant that is not made of wood says why, rather than implying a better tool. */
      if (about.harvestable === false) {
        hud.log(about.why || `The ${about.name || 'it'} gives nothing.`, 'warn');
        return true;
      }
      if ((about.tier ?? 0) > tier) {
        hud.log(`The ${about.name || 'it'} is too hard for what you are carrying.`, 'warn');
        return true;
      }
```

---

## Patch 4 — post the body from the frame loop, not from the gather clock (js/main.js)

**Live today without this.** `js/tools.js` `gathering.tick(dt, control)` calls `feel.postBody(at)`
before its own "is there a job" guard, because it is the only call main.js makes **every frame**
into a file this round owns, and the `control` it passes is the body.

Two things read that channel and neither can reach a position on its own:

* `js/combat-fx.js` `update(dt)` draws the growing ring and the orbiting motes while a staff builds;
* `js/tools.js` `tick` plays the pick/chop/forage clip while a gather bar fills.

To move it where it belongs, in `js/main.js`'s frame block, right after the controller step (near
`hud.chargeMeter?.(control.charge)`, ~6890):

```js
    // R17 — where the body is, for the charge effect and the work animations. One writer.
    feel.postBody(control);
```

main.js currently imports only `pushFor` from that module (line 127), so widen it to
`import { pushFor, feel } from './combat-feel.js';`.

Then delete the `feel.postBody(at);` line and its comment block from `tick()` in `js/tools.js`.

---

## Patch 5 — the work animation, from the animation chain (js/main.js)

**Live today without this.** `js/tools.js` sets `control.swing = 0.2` and `feel.swing.clip` while a
gather bar is filling, which puts the gather clip through the path a weapon swing already uses:
main.js plays `'attack'` when `control.swing > 0`, and `js/actors.js` substitutes `feel.swing.clip`
on the player's body only. `control.swing` is a presentation timer that main.js itself writes from
outside in six places (`control.swing = Math.max(control.swing, 0.35)`).

To say it outright instead, in `js/main.js`'s player-animation chain (~6964), insert a branch
**before** `else if (control.swing > 0)`:

```js
    } else if (gathering.active) {
      // R17 — working a seam or a tree is a pick swing, not a sword swing
      setActorAnim(actor, workClipFor(gathering.job));
```

and import `workClipFor` from `./tools.js` (it is already exported). Then delete the
`if (at && typeof at.swing === 'number' && job.clip)` block from `tick()` in `js/tools.js`.

---

## Patch 6 — construct the scanner chooser explicitly (js/main.js)

**Live today without this.** `createScanner()` lazily `import()`s `js/scanner-ui.js` in a browser
and builds the chooser itself, guarded by `typeof document !== 'undefined'` so the node tests never
touch it. The panel installs its own capture-phase `contextmenu` listener — right-click was
completely unclaimed in Farhold (`grep contextmenu` and `grep 'button === 2'` over `js/` returned
nothing) — and only takes the event while the scanner is the held mode.

To construct it explicitly, in `js/main.js` after `const scanner = createScanner({...})` (~2630):

```js
  /** R17 — the scanner's right-click chooser: what to sweep for, and "forget survey". */
  const scanChooser = createScannerChooser({
    scanner,
    onLog: (t, c) => hud.log(t, c),
    materialName: id => resourceData?.materials?.[id]?.name || id,
    canOpen: () => heldNow(player) === 'scanner',
    onChange: () => { minimapDirty = true; },      // or whatever forces a marker redraw
  });
```

with `import { createScannerChooser } from './scanner-ui.js';` at the top. Then delete the
`if (typeof document !== 'undefined') { import('./scanner-ui.js')… }` block at the end of
`createScanner` in `js/tools.js`, **and** the `seenPlayer` / `lastKnownPlayer` side effect in
`heldNow()` in the same file, which exists only to give `canOpen` a player.

---

## Patch 7 — the tool bench can show the material's proper name (js/build-ui.js)

**Live today without this.** `buildable(data, player, have)` now returns a `names` map beside
`cost`, so a row that costs `crystal_raw` still prints "1 crystal", and `build-ui.js` already reads
`r.names?.[m]`.

To print the resource file's own word ("Rough Crystal") instead of the catalogue's short one, pass
the material table as a fourth argument wherever `buildableTools` is called in `js/main.js` (~4601):

```js
    const row = buildableTools(toolData, player, have, resourceData?.materials)
      .find(r => r.kind === kind && r.id === id);
```

and in the `tools.list()` adapter beside it.

---

## Not done, and why

Nothing in the five reports is deferred. Two things worth writing down:

* **The three new scanner tiers are buildable but nothing upgrades an old save into them.** A save
  with `devices.scanner` keeps the tier-1 sweep until the player builds a Deep Scanner, which is
  correct — but there is no "trade in" and the old one stays owned for ever. That is the same
  behaviour boats and lights have, so it is consistent rather than an omission.
* **A non-wood giant is still findable by `props.nearest()`** and so can be the thing your gather
  targets instead of a bush standing next to it. That is deliberate — it has to be findable for the
  refusal to be sayable at all — but if a player complains that the Stone Arch "eats" their clicks,
  the fix is a preference in `nearest()` for the nearest HARVESTABLE thing, not dropping the giants
  off the list again.

---

## Patch 8 — the module preload list (index.html)

Round 17 added four modules that are not in `index.html`'s generated `modulepreload` block —
`js/spellshapes.js`, `js/harvestinfo.js`, `js/scanner-ui.js` and (as a dynamic import)
`scanner.css` / `combat.css`. They load fine; they just discover late, which is the exact thing
round 16's preload work was for (7.31 s cold load down to 0.07 s).

Regenerate the block rather than editing it by hand:

```
python3 tools/preload-modules.py prototypes/farhold/index.html
```

`scanner-ui.js` is a dynamic import and may not be picked up by the walker; if it is not, it is one
module and the cost is one round trip the first time somebody right-clicks with a scanner in hand.
