# Round 14 — the combat wiring I could not make myself

`js/main.js`, `js/hud.js`, `index.html`, `style.css` and `data/items.json` were off limits this
round because other agents were in them. Everything below is written as a copy-pasteable patch
against the code as it stood when I finished. **Nothing in this file has been applied.**

Read this first: **most of the combat revamp is already live.** Where a main.js change could be
avoided it was, by putting the work in a file I own — `js/combat-feel.js` (new), `js/weapons.js`,
`js/actors.js`, `js/rpg.js`, `js/player.js`, `js/combat-fx.js`. Several of the patches below are
therefore **tidying**: they replace a working indirection with the direct call, and the game plays
correctly without them. Each one says which it is.

| # | File | What | Without it |
|---|---|---|---|
| 1 | main.js | the staff nova draws nothing (`aoe` called with the wrong shape) | **a real bug, still live** |
| 2 | main.js | `spellfx.cast` is passed `scale`, which it does not take | **a real bug, still live** |
| 3 | main.js | a charged staff's nova and lob ignore the charge | **half a feature missing** |
| 4 | main.js | a javelin is never counted | **a feature missing** |
| 5 | main.js | `BatchedSpellFx` instead of `SpellFx` | performance only |
| 6 | main.js | the swing clip, passed straight | works today through a marker — see below |
| 7 | main.js | hit-stop reaches `spellfx` and `props` too | works today for everything else |
| 8 | main.js | the melee impact gate | already covered from `actors.js`; this tidies it |
| 9 | main.js | the off hand's dice and the arrow's draw, passed explicitly | already covered by the channel |
| 10 | main.js | `field.statusData` — one line, so an axe's bleed reads the real row | a copy of the row is used |
| 11 | main.js | a wand's heavy bolt flies slower | cosmetic |
| 12 | hud.js | the draw reticle, the charge meter and the javelin count | **the player cannot see the charge** |

---

## 1 — THE STAFF NOVA DRAWS NOTHING. `js/main.js`, in `swingWith`

**The bug.** `SpellFx.aoe`'s signature is `{ points = [], element, crit, stagger }`
(`avatar-3d/js/spellfx.js:578`) — it walks `points` and draws one burst at each. This call passes
`at` and `radius` instead, so `points` defaults to `[]`, the `forEach` runs zero times, and **every
staff nova in the game has drawn absolutely nothing**. Every other `aoe` call site in main.js
(lines 991 and 1036) passes `points` correctly; this is the one that does not. `ringPoints()` is
already in the file, at line 866.

Find:

```js
        if (spell.shape === 'nova') {
          spellfx.aoe({ at: new THREE.Vector3(control.x, control.y + 0.2, control.z), element, radius, scale: shape.scale });
```

Replace with:

```js
        if (spell.shape === 'nova') {
          // `aoe` draws one burst per POINT — passing it a centre and a radius drew nothing at all,
          // which is why a staff nova has been invisible for the life of the game. See round 14.
          spellfx.aoe({ points: ringPoints(control.x, control.z, radius), element, stagger: 0.04 });
```

---

## 2 — `spellfx.cast` is handed a `scale` it does not take. `js/main.js:5947`

**The bug.** `cast({ at, element, ms })` (`spellfx.js:749`). `scale` is silently dropped, so a
wide-area build's cast flourish is the same size as everybody else's. `ms` is what it wants, and a
charged staff should hold its flourish for longer.

Find:

```js
        spellfx.cast({ at: new THREE.Vector3(control.x, control.y + 1.1, control.z), element, scale: shape.scale });
```

Replace with:

```js
        // `cast` takes { at, element, ms } — `scale` was silently dropped. A bigger, longer-held
        // charge gets a longer flourish, which is the only feedback the cast itself gives.
        spellfx.cast({
          at: new THREE.Vector3(control.x, control.y + 1.1, control.z), element,
          ms: Math.round(380 * (shape.charge?.radius || shape.scale || 1)),
        });
```

---

## 3 — A CHARGED STAFF'S NOVA AND LOB IGNORE THE CHARGE. `js/main.js`, in `swingWith`

**What works already.** `js/weapons.js` `withArea` folds the charge into the strike's `scale` and
its `damage` share, so a charged staff already gets the bigger **radius** everywhere and the bigger
**damage** on the `cone` and `wave` shapes (which run through `meleeOpts.power`). The two branches
that compute their own power do not see it.

### 3a — the nova

Find:

```js
          for (const { enemy, result } of field.strikeArea(control.x, control.z, radius, player, { falloff: 0.35, element, power: share * (spell.mult || 1) })) {
```

Replace with:

```js
          for (const { enemy, result } of field.strikeArea(control.x, control.z, radius, player, { falloff: 0.35, element, power: share * (spell.mult || 1) * (shape.charge?.power || 1) })) {
```

### 3b — the lob / ground / chain branch

Find:

```js
          fireBolt(plan, a, a.dx, a.dy, a.dz, { ...meleeOpts, power: spell.mult || 1 }, from, true);
```

Replace with:

```js
          fireBolt(plan, a, a.dx, a.dy, a.dz, { ...meleeOpts, power: (spell.mult || 1) * (shape.charge?.power || 1) }, from, true);
```

### 3c — the charged form is a different KIND of spell

`js/weapons.js` exports `chargedForm(spell)`, which says what a held release should become — a cone
becomes a sustained jet, a nova a dome that shoves everything out 2.4 m, a wave a wall that stands
for three seconds, a lob an aimed mortar. **None of that is built.** Today a full charge is the same
shape, 1.6× the damage and 2× the radius, which is a reasonable weapon and not the design. Building
the four forms is a main.js job because every one of them is a branch of `swingWith`; the data and
the charge curve are ready and tested (`tests/combat-feel.test.js`).

---

## 4 — A JAVELIN IS NEVER COUNTED. `js/main.js`, in `swingWith`, the `weapon?.ranged` branch

A javelin is the best weapon in the game because it is a one-handed bow with no cost. The design
gives it six in hand, thrown at 1.15×, picked back up off the ground. The controller already refuses
to swing when `control.ammo` runs out is **not** implemented — this is the whole feature.

`js/weapons.js` `RANGED.javelin` carries `{ power: 1.15, carried: 6, every: 0.75, range: 28 }`, and
`player.derived.swing.main.carried` is 6 when a javelin is held.

Find, in the ranged branch:

```js
        const range = balance.player?.arrowRange ?? 46;
```

Replace with:

```js
        // a javelin has its own flight, and there are only so many of them
        const plan = player.derived.swing?.main;
        const range = plan?.range ?? balance.player?.arrowRange ?? 46;
        if (plan?.carried) {
          if (player.javelins == null) player.javelins = plan.carried;
          if (player.javelins <= 0) {
            hud.log('Out of javelins. Pick them back up, or draw something else.', 'warn');
            return;
          }
          player.javelins--;
          hud.ammo?.(player.javelins, plan.carried);
        }
```

…and give them back where they land, in `onArrowLand` (`js/main.js:756`), after the
`field.strikeArea` call:

```js
      // a thrown javelin sticks in the ground and can be walked over
      if (player.derived.swing?.main?.carried) {
        (player.javelinsOnGround || (player.javelinsOnGround = [])).push({ x: arrow.x, z: arrow.z });
      }
```

…and pick them up in the frame loop, next to the other proximity checks:

```js
    if (player.javelinsOnGround?.length) {
      for (let i = player.javelinsOnGround.length - 1; i >= 0; i--) {
        const j = player.javelinsOnGround[i];
        if (Math.hypot(j.x - control.x, j.z - control.z) > 1.8) continue;
        player.javelinsOnGround.splice(i, 1);
        player.javelins = Math.min(player.derived.swing?.main?.carried || 6, (player.javelins || 0) + 1);
        hud.ammo?.(player.javelins, player.derived.swing?.main?.carried || 6);
      }
    }
```

---

## 5 — batched sprites. `js/main.js:788`

Trails and the new impact effects multiply the live sprite count; `avatar-3d/js/spellfx-batched.js`
is a drop-in subclass and Emberveil already uses it. Purely a performance change.

Find:

```js
  const spellfx = new SpellFx(scene, { camera, scale: 1.15, maxParticles: 260, maxLive: 36 });
```

Replace with:

```js
  const spellfx = new BatchedSpellFx(scene, { camera, scale: 1.15, maxParticles: 260, maxLive: 36 });
```

…and the import at the top of the file:

```js
import { SpellFx } from '../../../avatar-3d/js/spellfx.js';
```

becomes

```js
import { SpellFx } from '../../../avatar-3d/js/spellfx.js';
import { BatchedSpellFx } from '../../../avatar-3d/js/spellfx-batched.js';
```

---

## 6 — the swing clip, passed straight. `js/main.js:5677`  *(tidying)*

**Works today.** `js/actors.js` substitutes the clip inside `setActorAnim`, for the player's body
only, identified by the fact that main.js calls `setRate` on exactly one actor. That is narrow and
it cannot misfire on a townsman or a pet — but this is the direct way, and it makes the marker in
`makeActor` deletable.

Find:

```js
    } else if (control.swing > 0) setActorAnim(actor, 'attack');
```

Replace with:

```js
    // the clip a swing plays comes from the strike shape: a jab is not an overhead chop, and a bow
    // shot is not either. js/player.js posts it when the swing STARTS. Round 14.
    } else if (control.swing > 0) setActorAnim(actor, control.swingClip || 'attack');
```

…and, in the stride block at `js/main.js:5697`, let a swing stretch its own clip:

Find:

```js
      const moving = control.moving > 0.15 && control.grounded && !control.mounted && !control.driving;
      actor.setRate(moving ? (control.moving * cycle) / STRIDE : 1);
```

Replace with:

```js
      const moving = control.moving > 0.15 && control.grounded && !control.mounted && !control.driving;
      // a swing owns the rate while it is in the air, so a hasted character's animation speeds up
      // with them instead of finishing long after the damage has landed
      if (control.swing > 0 && control.swingRate) actor.setRate(control.swingRate);
      else actor.setRate(moving ? (control.moving * cycle) / STRIDE : 1);
```

If patch 6 is applied, delete the marker in `js/actors.js` `makeActor`:

```js
  if (actor.setRate) {
    const rate = actor.setRate.bind(actor);
    actor.setRate = k => { actor.playerDriven = true; rate(k); };
  }
```

…and the line in `anim()` that reads `actor.playerDriven`.

---

## 7 — hit-stop reaches the spell effects and the scenery too. `js/main.js`, frame loop

**Works today for everything that matters** — the controller, the enemy field and the combat effects
all scale their own `dt` off `feel.scale` (`js/combat-feel.js`). `spellfx` and `props` do not,
because main.js ticks them, so a fireball keeps travelling at full speed through a 150 ms freeze.

Find (`js/main.js:6258`):

```js
    fx.update(dt);
    spellfx.update(dt);
```

Replace with:

```js
    fx.update(dt);
    // the world holds still on a heavy hit — see js/combat-feel.js. The CAMERA and the MOUSE are
    // deliberately exempt: a hit-stop that fights your aim is nausea, not weight.
    spellfx.update(dt * feel.scale);
```

…with, at the top of the file:

```js
import { feel } from './combat-feel.js';
```

`props.update(x, z, force)` (line 4912) takes no `dt` and needs nothing.

---

## 8 — the melee impact gate. `js/main.js`, in `swingWith`  *(tidying)*

**The bug, and it is fixed.** `if (element !== 'physical')` meant an ordinary steel sword hit drew
no impact effect at all, while `spellfx.impact({ element: 'physical' })` has always built two crossed
`slash.svg` planes, a spark burst and a dust puff. `js/actors.js` `land()` now draws the physical
case itself, so the coverage is complete — but main.js is still the one drawing the elemental case,
and having the two halves in two files is worth tidying up one day.

Find:

```js
      // a branded weapon flashes its element on every body it lands on
      if (element !== 'physical') {
        for (const h of hits) spellfx.impact({ at: new THREE.Vector3(h.enemy.x, h.enemy.y + 0.9, h.enemy.z), element, crit: h.result.crit });
      }
```

Replace with:

```js
      // Round 14: `field.strike` draws the impact itself now, physical included — this loop is
      // what used to be gated on `element !== 'physical'`, which is why a steel sword drew nothing.
```

**Do not apply 8 on its own without checking `actors.js` `land()` is still drawing both** — it
currently draws `physical` only, precisely so this loop is not doubled. Applying this patch means
changing `land()`'s guard from `if (element === 'physical')` to unconditional.

---

## 9 — the off hand and the arrow, passed explicitly  *(tidying)*

**Works today.** The off hand's own dice are found because `strikeAt` stamps the weapon onto the
strike and `field.strike` compares it against `playerUnit.equipment.offhand`; an arrow's draw
reaches `strikeArea` through a channel that `js/combat-fx.js` opens for exactly the moment the
landing callback runs. Both are documented where they happen. The direct versions:

In `swingWith`:

```js
      const meleeOpts = {
        element, onHit: brandHit, applyStatus: statusHook,
        power: share * shape.damage,
      };
```

becomes

```js
      const meleeOpts = {
        element, onHit: brandHit, applyStatus: statusHook,
        power: share * shape.damage,
        // which hand swung (the off hand rolls its own dice) and the shape, for the physics
        hand, strike: shape,
      };
```

In `onArrowLand` (`js/main.js:760`):

```js
      const hits = field.strikeArea(arrow.x, arrow.z, splash, player, { element });
```

becomes

```js
      // a shot is worth the draw it was loosed at — every arrow used to be a full-power hit
      const hits = field.strikeArea(arrow.x, arrow.z, splash, player, { element, power: arrow.power ?? 1 });
```

---

## 10 — one line so an axe's bleed reads the real status row. `js/main.js`

`js/actors.js` applies `bleed` itself now (an axe's cleave, and a dagger in the back). The field has
no skill data, so it carries a copy of the row from `data/skills.json` as a fallback. Lend it the
real one instead — anywhere after `field` is built:

```js
  // the field applies `bleed` on its own now; give it the real row rather than its own copy
  field.statusData = skillData.statuses;
```

---

## 11 — a heavy wand bolt should be visibly slow. `js/main.js`, the wand branch

`WAND_BEHAVIOURS.heavy` is "one slow bolt that lands hard" and now carries `speed: 34`, which
nothing reads. Find:

```js
        const plan = {
          element, range: (weapon.castRange ?? 34) * (how.slow ? 0.85 : 1),
```

Replace with:

```js
        const plan = {
          element, range: (weapon.castRange ?? 34) * (how.slow ? 0.85 : 1),
          speed: how.speed || undefined,       // "one slow bolt that lands hard", visibly
```

**Checked:** `fireBolt` (`js/main.js:884`) does **not** read a speed — a bolt's travel is a timed
flight to where the scan says it lands. So this patch needs `fireBolt` to take one as well, or it
is a no-op. It is the smallest item on this list; skip it if the flight is not worth reworking.

---

## 12 — `js/hud.js`: THE PLAYER CANNOT SEE THE CHARGE

This is the one genuinely missing piece. A bow has a draw and a staff has a channel, and both are
live — `control.charge` is `{ fill, power, ready, kind }` every frame while the button is held — but
nothing draws them, so the player is holding a button and guessing. Three small additions, each its
own method, no existing function edited.

### 12a — the element and the styles, once, in `hud.js`

Add near the other one-off element builders:

```js
  /**
   * THE DRAW, THE CHANNEL AND WHAT IS LEFT IN YOUR HAND.
   *
   * A bow that refuses under 0.35 s and pays 1.6x at full draw is unplayable if the player cannot
   * see where they are in it. One bar under the crosshair: it fills as the draw or the channel
   * builds, it goes amber at the point where the shot is worth taking, and it flashes at full.
   * Style is inline because style.css belongs to another agent this round.
   */
  chargeMeter(charge) {
    let bar = document.getElementById('charge-meter');
    if (!charge) { if (bar) bar.style.opacity = '0'; return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'charge-meter';
      bar.style.cssText = 'position:fixed;left:50%;top:calc(50% + 34px);transform:translateX(-50%);'
        + 'width:132px;height:6px;border:1px solid rgba(0,0,0,.6);border-radius:3px;'
        + 'background:rgba(0,0,0,.45);pointer-events:none;z-index:40;transition:opacity .12s';
      bar.innerHTML = '<i style="display:block;height:100%;width:0;border-radius:2px;background:#8fd0ff"></i>';
      document.body.appendChild(bar);
    }
    const fill = bar.firstChild;
    const k = Math.max(0, Math.min(1, charge.fill || 0));
    bar.style.opacity = '1';
    fill.style.width = (k * 100).toFixed(1) + '%';
    fill.style.background = !charge.ready ? '#6a7480' : k >= 0.99 ? '#ffd27a' : k > 0.8 ? '#ffb040' : '#8fd0ff';
    bar.style.boxShadow = charge.shaky ? '0 0 6px #c83a2a' : 'none';
  },

  /** How many javelins are left in your hand. Nothing else in the game has ammunition. */
  ammo(left, of) {
    let box = document.getElementById('ammo-count');
    if (!box) {
      box = document.createElement('div');
      box.id = 'ammo-count';
      box.style.cssText = 'position:fixed;right:18px;bottom:96px;font:13px/1.4 Cinzel,serif;'
        + 'color:#e8dcc0;text-shadow:0 1px 2px #000;pointer-events:none;z-index:40';
      document.body.appendChild(box);
    }
    box.textContent = left > 0 ? `${left} / ${of}` : 'empty';
    box.style.color = left > 0 ? '#e8dcc0' : '#c83a2a';
  },
```

### 12b — the call, once a frame, in `js/main.js`'s tick

After `const step = control.update(dt, snap, { frozen });`:

```js
    // the draw and the channel are only playable if you can see where you are in them
    hud.chargeMeter?.(control.charge);
```

### 12c — the reticle tightening (optional, nicer)

If `js/hud.js` owns the crosshair element, scale it by the draw: a loose draw is a wide reticle and
a full draw is a tight one. `control.charge.fill` is the number.

```js
    const cross = document.getElementById('crosshair');
    if (cross) cross.style.transform = `translate(-50%,-50%) scale(${1.6 - 0.6 * (control.charge?.fill || 1)})`;
```

---

## What is NOT in this file, and why

* **The sustained jet, the dome, the wall and the mortar** (§7.2 of `research/combat-redesign.md`).
  Each is a new branch of `swingWith` and a new shape in `spellfx`; the charge curve, the data
  (`CHARGED_FORMS` in `js/weapons.js`) and the tests are all in place and nothing calls them. This
  is the largest single piece still owed.
* **`spellfx.trail()` and `spellfx.ground()`** (§4.4 b and k). Both are additions to
  `avatar-3d/js/spellfx.js`, which is shared with Emberveil. `js/combat-fx.js` draws the swing arc
  in the weapon's own plane instead, procedurally, so a swing is no longer one flat white ring — but
  a sprite trail following the edge through the wind-up would be better, and `dropPool` in main.js
  is still hand-rolling a ground disc with a comment saying spellfx has no ground effect.
* **`melee.block`** (`sfx/data/catalog.json`, never played). `js/sound.js:107-115` is mine and the
  sparks-on-armour path in `actors.js` is where it belongs; it wants a `sound` handle the field does
  not have. One line in main.js's `onHit` would do it.
