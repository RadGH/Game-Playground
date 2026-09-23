// node --test prototypes/farhold/tests/round17-combat.test.js
//
// ROUND 17 — the weapons, tools, harvesting and resource-art cluster. Five reports:
//
//   3   "The staff tooltip … is repeated twice in the tooltip. It also appears to show a dot and a
//        slash as the attack style like a melee weapon … can it show an icon indicating what type
//        of spell is cast by the staff? … I think this is referred to as 'Unmaking' in the tooltip
//        but I don't like that descriptor. Also it seems I can hold to charge the spell before
//        releasing, does holding it actually do anything? … let's have it be one or the other, not
//        mixed."
//   12  "I found one of the new mega-trees … but was disappointed I could not cut it down."
//   13  "Generate a mining animation to use when a tool is being used."
//   14  "I asked for scrollwheel to reveal Weapon, Tool, Scanner, but I don't see the Scanner."
//   26  "Please update the resource graphics for things like Iron Ore. It's a single color orange
//        rock right now."
//
// Four of the five were a JOIN THAT HAD NEVER BEEN MADE rather than an algorithm that was wrong,
// which is this project's signature fault and the reason these assertions are shaped the way they
// are: most of them check that two halves of the game agree, not that one half computes correctly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import {
  weaponFacts, patternText, patternGlyphs, spellShapeOf, castsInsteadOfSwinging,
  STAFF_SPELLS, isStaff, isWand, isRangedWeapon,
  inputOf, INPUT_MODES, chargesOnHold, chargeAt, chargeReadout, chargeState, STAFF_CHARGE,
  withArea, strikeAt, staffSpell, WEAPON_TRAITS, rangedPlan,
} from '../js/weapons.js';
import { SPELL_SHAPES, SPELL_SHAPE_KEYS } from '../js/spellshapes.js';
import { feel } from '../js/combat-feel.js';
import {
  createGathering, createScanner, heldModes, heldNow, giveDevice, buildable, priceRow,
  scannerDevice, scannerTier, workClipFor, WORK_CLIPS,
} from '../js/tools.js';
import { harvestInfo, propKindFromJobId } from '../js/harvestinfo.js';
import { MATERIAL_ALIASES } from '../js/buildplan.js';
import { Rpg, attuneWeapon } from '../js/rpg.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const src = f => readFileSync(join(here, f), 'utf8');

const items = read('../../emberveil/data/items.json');
const balance = read('../data/balance.json');
const resources = read('../data/resources.json');
const toolData = read('../data/tools.json');
const megaflora = read('../data/megaflora.json');
const propsSrc = src('../js/props.js');
const motionSrc = src('../../../avatar-3d/js/chibi2-motion.js');

const rpg = new Rpg(items, balance);
const make = (key, level = 10) => attuneWeapon(rpg.loot.generate(key, 'normal', 'medium', { level }));

/** Every magic base in the shared items.json, by key. */
const MAGIC_BASES = Object.entries(items.weaponBases)
  .filter(([, b]) => b.weaponCategory === 'magic')
  .map(([k]) => k);

// ================================================================= item 3a — say it once

test('3a — a staff describes itself ONCE, not twice', () => {
  /**
   * The bug, exactly: js/hud.js prints `item.weaponLine` (which is `weaponFacts().line`) and then,
   * because a staff is not `ranged`, falls into its melee branch and prints `patternText(item)` —
   * and `patternText` opened by returning the same string. Two printers, one sentence.
   */
  for (const key of MAGIC_BASES.concat(['sword', 'greatsword', 'bow', 'dagger', 'halberd'])) {
    const item = make(key);
    if (!item) continue;
    const line = weaponFacts(item).line;
    const rhythm = patternText(item);
    assert.notEqual(rhythm, line, `${key}: the rhythm line is a copy of the description`);
    // …and no sentence of the description may reappear whole in the rhythm line
    for (const sentence of line.split('. ').map(s => s.trim()).filter(s => s.length > 24)) {
      assert.ok(!rhythm.includes(sentence), `${key}: "${sentence}" is printed twice`);
    }
  }
});

test('3a — the hand note and the headline belong to the description, not to both lines', () => {
  const staff = make('staff');
  const facts = weaponFacts(staff);
  assert.ok(facts.line.includes('off hand'), 'the description must still say what happens to the off hand');
  assert.ok(!patternText(staff).includes('off hand'), 'and the rhythm line must not repeat it');
  assert.ok(!patternText(staff).includes(facts.headline), 'nor the headline');
});

// ================================================================= item 3b — the spell shape

test('3b — every magic weapon resolves to exactly one spell shape, with a caption', () => {
  assert.ok(MAGIC_BASES.length >= 10, 'items.json did not load its magic bases');
  for (const key of MAGIC_BASES) {
    const item = make(key);
    if (!item) continue;
    /**
     * A QUARTERSTAFF IS THE ONE EXCEPTION AND IT IS DELIBERATE. items.json files it
     * `magic` + `twoHanded`, which is exactly `isStaff()`'s test — round 14 excluded it by name
     * because otherwise five classes start the game holding a free area spell. `attuneWeapon`
     * rewrites it to `light`, so by the time anything asks it is not a caster at all.
     */
    if ((item.baseKey || item.subtype) === 'quarterstaff') {
      assert.equal(spellShapeOf(item), null, 'a quarterstaff is a pole, not a spell launcher');
      continue;
    }
    const shape = spellShapeOf(item);
    assert.ok(shape, `${key} is a magic weapon with no spell shape`);
    assert.ok(SPELL_SHAPE_KEYS.includes(shape.key), `${key} resolved to an unknown shape "${shape.key}"`);
    assert.ok(shape.label && shape.label.length > 4, `${key}'s shape has no caption`);
    assert.ok(shape.svg.startsWith('<svg') && shape.svg.endsWith('</svg>'), `${key}'s glyph is not an svg`);
    // the glyph and the caption come from the same row, so they cannot disagree
    assert.equal(shape.svg, SPELL_SHAPES[shape.key].svg);
    assert.equal(shape.label, SPELL_SHAPES[shape.key].label);
  }
});

test('3b — a staff draws its spell, not a dot and a slash', () => {
  // the report, in one assertion: "· ⟋" was `CATEGORY_PATTERNS.magic` = ['jab','slash'], a melee
  // fallback a staff has never used
  const staff = make('staff');
  const glyphs = patternGlyphs(staff);
  assert.ok(!glyphs.includes('·'), `a staff still draws a melee jab: "${glyphs}"`);
  assert.ok(!glyphs.includes('⟋'), `a staff still draws a melee slash: "${glyphs}"`);
  assert.ok(glyphs.startsWith('<svg'), 'a caster should draw its spell shape');

  // …and a sword still draws its rhythm
  const sword = make('greatsword');
  assert.ok(!patternGlyphs(sword).startsWith('<svg'), 'a greatsword is not a spell');
  assert.ok(patternGlyphs(sword).length > 0, 'a greatsword draws no glyphs');
});

test('3b — an orb is swung with an element on it, and is not captioned as a bolt', () => {
  /**
   * `isWand()` is "magic and one-handed", which is a wand, a sceptre, an orb AND a tome — but only a
   * wand is made `ranged` (js/rpg.js `RANGED_CASTERS` has one entry) and js/main.js throws a bolt
   * only `if (weapon.castElement && weapon.ranged)`. So an orb is SWUNG. Captioning it "a bolt at
   * what you point at" would be a card describing behaviour the weapon does not have, which is
   * precisely the fault this item is about.
   */
  for (const key of ['orb', 'tome', 'scepter']) {
    const item = make(key);
    if (!item) continue;
    assert.equal(isWand(item), true, `${key} should still read as a one-handed caster`);
    assert.equal(isRangedWeapon(item), false, `${key} does not throw anything`);
    assert.equal(castsInsteadOfSwinging(item), false, `${key} swings, so it keeps its rhythm`);
    assert.equal(spellShapeOf(item).key, 'brand', `${key} should say the element rides the swing`);
    // …and the card still draws the SWING, not a spell glyph
    assert.ok(!patternGlyphs(item).startsWith('<svg'), `${key} lost its rhythm row`);
    assert.match(patternText(item), /Your swing carries it/);
  }
  // a wand, by contrast, really does cast instead of swinging
  assert.equal(castsInsteadOfSwinging(make('wand')), true);
  assert.equal(castsInsteadOfSwinging(make('staff')), true);
  assert.equal(castsInsteadOfSwinging(make('greatsword')), false);
});

test('3b — the Arc Staff really is a nova, and says "area surrounding you"', () => {
  // the exact weapon reported: an arcane staff whose spell goes off around the player
  const staff = make('staff');
  staff.castElement = 'arcane'; staff.castName = 'Arc'; staff.staffSpell = 'nova';
  const shape = spellShapeOf(staff);
  assert.equal(shape.key, 'nova');
  assert.match(shape.label.toLowerCase(), /area surrounding you/);
  assert.match(patternText(staff).toLowerCase(), /area surrounding you/);
});

test('3b — every shape a staff spell can have is in the glyph table', () => {
  for (const [element, list] of Object.entries(STAFF_SPELLS)) {
    for (const spell of list) {
      assert.ok(SPELL_SHAPES[spell.shape],
        `${element}'s ${spell.name} is shaped "${spell.shape}" and nothing draws one`);
    }
  }
});

// ================================================================= item 3c — the word

test('3c — "Unmaking" is gone, and the new name is not in Emberveil', () => {
  const weaponsSrc = src('../js/weapons.js');
  assert.ok(!weaponsSrc.includes("name: 'Unmaking'"), 'the descriptor is still there');
  const arcane = STAFF_SPELLS.arcane.find(s => s.key === 'nova');
  assert.equal(arcane.name, 'Arc Burst');
  /**
   * STAFF_SPELLS is Farhold's own table. The rename is safe only because it is not in the shared
   * data/items.json and not in Emberveil — this is the assertion that keeps it that way.
   */
  assert.ok(!JSON.stringify(items).includes('Unmaking'), 'the word leaked into the shared item file');
  assert.ok(!JSON.stringify(items).includes('Arc Burst'), 'the new word leaked into the shared item file');
});

// ================================================================= item 3d — one input mode

test('3d — no weapon is both hold-to-repeat and hold-to-charge', () => {
  const bases = Object.keys(items.weaponBases);
  assert.ok(bases.length > 40, 'items.json did not load');
  for (const key of bases) {
    const item = make(key);
    if (!item) continue;
    const mode = inputOf(item);
    assert.ok(INPUT_MODES.includes(mode), `${key} has input mode "${mode}"`);
    assert.equal(chargesOnHold(item), mode === 'charge');

    /**
     * AND THE TWO HALVES OF THE GAME AGREE. `rpg.swingPlan` decides whether the button builds
     * anything, and it worked it out from `isStaff()` and `rangedPlan().kind` — two unrelated tests
     * in a file that has nothing to do with rhythm. This is the assertion that stops `inputOf` and
     * the controller drifting apart.
     */
    const planWouldHold = isStaff(item) || rangedPlan(item)?.kind === 'draw';
    assert.equal(mode === 'charge', !!planWouldHold,
      `${key}: inputOf says "${mode}" and the swing plan disagrees`);
  }
});

test('3d — the families that charge are the staves and the drawn bows, and nothing else', () => {
  const charge = Object.entries(WEAPON_TRAITS).filter(([, t]) => t.input === 'charge').map(([k]) => k);
  assert.deepEqual(charge.sort(), ['bow', 'longbow', 'shortbow']);
  // a crossbow reloads and a javelin is thrown: both repeat
  assert.equal(inputOf(make('crossbow')), 'repeat');
  assert.equal(inputOf(make('javelin')), 'repeat');
  // a wand always works and never runs dry — it must not have become a charge weapon
  assert.equal(inputOf(make('wand')), 'repeat');
  // …and every melee base repeats
  for (const key of ['dagger', 'sword', 'greatsword', 'halberd', 'quarterstaff', 'mace']) {
    assert.equal(inputOf(make(key)), 'repeat', `${key} should not build anything`);
  }
  assert.equal(inputOf(make('staff')), 'charge');
});

test('3d — holding a staff ACTUALLY DOES SOMETHING now', () => {
  /**
   * THE BUG: `withArea` has read `feel.swing.charge` since round 15 and NOTHING in the codebase
   * ever assigned it — js/player.js put the released charge on `step.charge` and js/main.js never
   * read it. So `shape.charge` was permanently undefined, `chargedForm()` (six charged forms, about
   * 130 lines of main.js) never fired once, and the 0.60x-1.60x damage and 0.7x-2.0x radius were
   * both multiplied by one. "Does holding it actually do anything?" — it did not.
   *
   * `chargeAt` is the one function both halves already call, so it is the writer now.
   */
  const staff = make('staff');
  feel.swing.charge = null;

  // a tap: under the floor, so the small free version
  chargeAt(0.05, STAFF_CHARGE);
  const tapped = withArea(strikeAt(staff, 0), 0);
  assert.ok(tapped.charge, 'a tap must still reach the swing');
  assert.equal(tapped.charge.tap, true);
  assert.ok(tapped.damage < 1, 'a tap should be the weak version');

  // a full charge: more damage AND a bigger circle
  chargeAt(STAFF_CHARGE.max, STAFF_CHARGE);
  const full = withArea(strikeAt(staff, 0), 0);
  assert.ok(full.charge && !full.charge.tap, 'a full charge must not read as a tap');
  assert.ok(full.damage > tapped.damage * 2, `full ${full.damage} vs tap ${tapped.damage}`);
  assert.ok(full.scale > tapped.scale * 2, `radius: full ${full.scale} vs tap ${tapped.scale}`);

  // it is CONSUMED — the next swing is an ordinary swing
  const again = withArea(strikeAt(staff, 0), 0);
  assert.equal(again.charge, undefined, 'the charge was spent twice');
});

test('3d — a sword can never pick up a charge left on the channel', () => {
  // `chargeAt` posts on every frame the button is held, so the value sits there until something
  // takes it. Only a two-handed magic weapon may.
  feel.swing.charge = null;
  chargeAt(STAFF_CHARGE.max, STAFF_CHARGE);
  const sword = withArea(strikeAt(make('greatsword'), 0), 0);
  assert.equal(sword.charge, undefined, 'a greatsword collected a staff charge');
  assert.ok(feel.swing.charge, 'and the charge should still be waiting for the staff');
  feel.swing.charge = null;
});

// ================================================================= item 3e — the ramp, visible

test('3e — the charge readout names a floor, a ramp and a ceiling', () => {
  assert.equal(chargeReadout(null).active, false);
  const short = chargeReadout({ fill: 0.1, ready: false, kind: 'charge' });
  const mid = chargeReadout({ fill: 0.55, ready: true, kind: 'charge' });
  const near = chargeReadout({ fill: 0.9, ready: true, kind: 'charge' });
  const full = chargeReadout({ fill: 1, ready: true, kind: 'charge' });
  assert.deepEqual([short.state, mid.state, near.state, full.state], ['short', 'ready', 'near', 'full']);
  assert.equal(full.full, true);
  assert.equal(full.label, 'Release', 'the player has to be told when to let go');
  assert.equal(chargeState(0.5, false), 'short');
  // a bow says something different from a staff at the same fill
  assert.notEqual(chargeReadout({ fill: 0.5, ready: true, kind: 'draw' }).label, mid.label);
});

test('3e — and the meter has a stylesheet at last', () => {
  /**
   * js/hud.js has built `<div class="charge-meter"><i></i></div>` on every frame the button is
   * held since round 15, and there was not one `.charge-meter` rule anywhere in the project: an
   * unstyled div has no size, and a width percentage on an inline `<i>` does nothing. The bar has
   * been running invisibly for two rounds. js/combat-fx.js links combat.css now.
   */
  const css = src('../combat.css');
  for (const rule of ['.charge-meter', '.charge-meter > i', '[data-state="full"]']) {
    assert.ok(css.includes(rule), `combat.css has no ${rule} rule`);
  }
  assert.ok(src('../js/combat-fx.js').includes("'combat.css'"), 'nothing links the stylesheet');
  // the four states the stylesheet paints are the four js/weapons.js names, with no fifth
  for (const state of ['short', 'ready', 'near', 'full']) {
    assert.ok(css.includes(`[data-state="${state}"]`), `combat.css never paints "${state}"`);
  }
});

// ================================================================= item 12 — the giants

test('12 — every wood giant can be felled and pays about fifteen trees', () => {
  /** The ordinary rows, read out of js/props.js (it imports Three.js, so it cannot be imported). */
  const ordinary = {};
  for (const m of propsSrc.matchAll(/^  ([a-z_]+):\s*\{ hp: [\d.]+, tier: (\d+), drops: \{([^}]*)\}/gm)) {
    const drops = {};
    for (const d of m[3].matchAll(/(\w+):\s*([\d.]+)/g)) drops[d[1]] = Number(d[2]);
    ordinary[m[1]] = { tier: Number(m[2]), drops };
  }
  assert.ok(Object.keys(ordinary).length >= 14, 'PROP_HARVEST did not parse');

  let wood = 0;
  for (const [key, spec] of Object.entries(megaflora.kinds)) {
    if (!spec.wood) continue;
    wood++;
    const h = spec.harvest;
    assert.ok(h, `${key} is wood and carries no harvest block`);
    const like = ordinary[h.like];
    assert.ok(like, `${key} is fifteen of "${h.like}" and there is no such prop`);

    // ~15x, to the log
    for (const [mat, n] of Object.entries(like.drops)) {
      assert.ok(h.drops[mat], `${key} should drop ${mat} like a ${h.like} does`);
      const times = h.drops[mat] / n;
      assert.ok(times >= 13 && times <= 17, `${key} pays ${times.toFixed(1)}x its ${mat}, wanted ~15x`);
    }
    // a higher tool tier gate than the ordinary tree of the same family
    assert.ok(h.tier > like.tier, `${key} needs tier ${h.tier} and a ${h.like} needs ${like.tier}`);
    // a longer gather: several times an ordinary prop's 2.4 s bar
    assert.ok(h.seconds >= toolData.gather.propSeconds * 4,
      `${key} takes ${h.seconds}s — a whole giant for the price of a bush`);
    // and it stays down a good deal longer than the six hours an ordinary tree takes
    assert.ok(h.regrow > 21600 * 3, `${key} grows back in ${h.regrow}s — a landmark should not`);
    assert.ok(WORK_CLIPS[h.work], `${key} plays a work clip nobody built: "${h.work}"`);
  }
  assert.equal(wood, 4, 'the four wood-bodied giants are elder broadleaf, crown conifer, shelf palm, hollow snag');
});

test('12 — a giant that is not wood refuses, and says why', () => {
  let stone = 0;
  for (const [key, spec] of Object.entries(megaflora.kinds)) {
    if (spec.wood) continue;
    stone++;
    assert.equal(spec.harvest, undefined, `${key} is not wood and carries a harvest block`);
    assert.ok(spec.why && spec.why.length > 20,
      `${key} refuses silently, which is indistinguishable from the bug being fixed`);
    assert.ok(/[.!]$/.test(spec.why), `${key}'s refusal is not a sentence: "${spec.why}"`);
  }
  assert.equal(stone, 8, 'eight giants stay scenery');
});

test('12 — js/props.js actually puts the giants on the list you can hit', () => {
  /**
   * The whole of item 12 in one line of props.js: `standing` is what `near`, `nearest`, `describe`
   * and `strike` read, and the megaflora loop never pushed onto it. Everything else about a giant
   * already worked.
   */
  const megaBlock = propsSrc.slice(propsSrc.indexOf('A GIANT, NOW AND THEN'));
  assert.ok(/standing\.push\(\{ id: megaId/.test(megaBlock),
    'megaflora are still not on the list of things you can walk up to and hit');
  assert.ok(megaBlock.includes('felled.has(megaId)'), 'a felled giant would come back on the next rebuild');
  assert.ok(propsSrc.includes('function harvestSpec('),
    'props.js still asks PROP_HARVEST directly, which has no row for a giant');
});

// ================================================================= item 13 — the work clips

test('13 — a gather plays a work clip, and a seam plays the pick', () => {
  assert.deepEqual(Object.keys(WORK_CLIPS).sort(), ['chop', 'dig', 'forage']);
  assert.equal(workClipFor({ id: 'seam:n123', kind: 'seam' }), 'pickSwing');

  harvestInfo.set('broadleaf', { work: 'chop' });
  harvestInfo.set('boulder', { work: 'dig' });
  harvestInfo.set('bush', { work: 'forage' });
  assert.equal(workClipFor({ id: 'prop:broadleaf@1.0,2.0', kind: 'prop' }), 'chopSwing');
  assert.equal(workClipFor({ id: 'prop:boulder@1.0,2.0', kind: 'prop' }), 'pickSwing');
  assert.equal(workClipFor({ id: 'prop:bush@1.0,2.0', kind: 'prop' }), 'forage');
  // a kind nobody published falls back rather than throwing
  assert.equal(workClipFor({ id: 'prop:nonsense@0.0,0.0', kind: 'prop' }), 'pickSwing');
});

test('13 — the prop kind comes out of the job id exactly, not out of its display name', () => {
  assert.equal(propKindFromJobId('prop:elder_broadleaf@11438.0,3187.0'), 'elder_broadleaf');
  assert.equal(propKindFromJobId('seam:node_42'), null);
  assert.equal(propKindFromJobId(null), null);
});

test('13 — every harvestable thing in the game names a clip that exists', () => {
  for (const m of propsSrc.matchAll(/^  ([a-z_]+):\s*\{ hp: .*work: '(\w+)'/gm)) {
    assert.ok(WORK_CLIPS[m[2]], `${m[1]} works by "${m[2]}" and there is no such clip`);
  }
});

test('12 — a giant takes as long as a giant takes, whatever the caller worked out', () => {
  /**
   * js/main.js computes the bar length from two generic sizes (`secondsFor('prop')` = 2.4 s), which
   * was right while everything fellable was tree-sized. Fifteen trees' worth of timber in two and a
   * half seconds would make the giants the only sensible way to get wood.
   */
  const gather = createGathering({ data: toolData });
  harvestInfo.set('elder_broadleaf', { work: 'chop', seconds: 16, tier: 2, mega: true });
  const job = gather.begin({
    id: 'prop:elder_broadleaf@11438.0,3187.0', kind: 'prop', name: 'Elder Broadleaf',
    seconds: toolData.gather.propSeconds, speed: 1,
  });
  assert.equal(job.total, 16, 'the giant took a bush\'s bar');
  gather.cancel();

  // …and an ordinary prop still uses whatever the caller asked for
  harvestInfo.set('bush', { work: 'forage', seconds: null });
  const small = gather.begin({ id: 'prop:bush@0.0,0.0', kind: 'prop', seconds: 1.2, speed: 1 });
  assert.equal(small.total, 1.2);
  gather.cancel();
});

test('13 — the bar swings the body, which is the whole of the report', () => {
  /**
   * R17 (lead) — RE-AIMED WHEN THE HANDOFF PATCH WAS APPLIED.
   *
   * This used to assert that `gather.tick` wrote `control.swing` and `feel.swing.clip`, which was
   * js/tools.js putting the work clip through the path a weapon swing already uses — the only
   * route it had, because js/main.js belonged to another agent while it was written. main.js now
   * says it outright, with a branch of its own in the player's animation chain, so the assertion
   * moves to the same place the behaviour did. The job still carries its clip; what changed is who
   * plays it.
   */
  const gather = createGathering({ data: toolData });
  harvestInfo.set('broadleaf', { work: 'chop' });
  const job = gather.begin({ id: 'prop:broadleaf@0.0,0.0', kind: 'prop', name: 'tree', seconds: 3, speed: 1 });
  assert.equal(job.clip, 'chopSwing', 'the job does not know which clip it is');
  assert.equal(workClipFor(job), 'chopSwing');
  // …and main.js plays it from the animation chain rather than from the gather clock
  const main = src('../js/main.js');
  assert.match(main, /else if \(gathering\.active\) \{/, 'main.js has no branch for a gather');
  assert.match(main, /setActorAnim\(actor, workClipFor\(gathering\.job\)\)/);
  // a seam is always a pick, whatever the harvest registry says about a tree
  assert.equal(workClipFor({ kind: 'seam' }), 'pickSwing');
  gather.cancel();
});

test('13 — and Emberveil cannot see any of it', () => {
  /**
   * `avatar-3d/` is SHARED. The round-14 pattern is an opt-in list: the new clips go in their own
   * array and the existing arrays are byte-for-byte what they were, so a game that does not ask for
   * them does not build them and cannot be changed by them.
   */
  const listOf = name => {
    const m = motionSrc.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
    assert.ok(m, `${name} is not exported any more`);
    return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  };
  assert.deepEqual(listOf('CHIBI2_ANIMS'),
    ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead']);
  assert.deepEqual(listOf('CHIBI2_SWIM_ANIMS'), ['swim', 'swimBack', 'swimSide']);
  assert.deepEqual(listOf('CHIBI2_COMBAT_ANIMS'), [
    'slash', 'slashBack', 'thrust', 'overhead', 'sweep', 'jab', 'arcCut', 'slam', 'lunge',
    'shoot', 'reload', 'castPoint', 'castStaff', 'channel',
  ]);
  assert.deepEqual(listOf('CHIBI2_RIDE_ANIMS'), ['boat', 'sit']);
  assert.deepEqual(listOf('CHIBI2_WORK_ANIMS'), ['pickSwing', 'chopSwing', 'forage']);

  // the new clips are in NONE of the lists Emberveil could reach
  for (const name of ['CHIBI2_ANIMS', 'CHIBI2_SWIM_ANIMS', 'CHIBI2_COMBAT_ANIMS', 'CHIBI2_RIDE_ANIMS']) {
    for (const clip of ['pickSwing', 'chopSwing', 'forage']) {
      assert.ok(!listOf(name).includes(clip), `${clip} leaked into ${name}`);
    }
  }
  // …and the default a game gets when it asks for nothing is still the original twelve
  assert.match(motionSrc, /createClips\(rig, anims = CHIBI2_ANIMS\)/);
});

test('13 — Emberveil imports none of the opt-in animation lists, and no weapon look moved', () => {
  const hits = execSync('grep -rl "CHIBI2_COMBAT\\|CHIBI2_RIDE\\|CHIBI2_WORK\\|CHIBI2_SWIM" '
    + join(here, '../../emberveil/js') + ' || true', { encoding: 'utf8' }).trim();
  assert.equal(hits, '', `Emberveil reaches an opt-in list: ${hits}`);

  /**
   * The weapon looks are the other shared thing. `avatar-3d/js/chibi2-weapons.js` holds round 14's
   * eighteen new `fh_` models — a new file, new ids, one dispatch line — and round 17 added nothing
   * to it. This asserts the prefix rule rather than a file hash, so the next round can add an
   * `fh_` model without failing and still cannot rename an Emberveil one.
   */
  const weaponsSrc = src('../../../avatar-3d/js/chibi2-weapons.js');
  assert.ok(weaponsSrc.includes('FARHOLD_HELD') && weaponsSrc.includes('buildFarholdHeld'),
    'the Farhold-only weapon models are gone');
  const ids = [...weaponsSrc.matchAll(/^  (\w+)\(c, hc, q/gm)].map(m => m[1]);
  assert.ok(ids.length > 10, `chibi2-weapons.js builds nothing (${ids.length} found)`);
  for (const id of ids) {
    assert.ok(id.startsWith('fh_'),
      `"${id}" is not an fh_ id — a model in this file must be Farhold's own, or Emberveil's looks move`);
  }
});

// ================================================================= item 14 — the scanner

test('14 — the scanner was priced in a material that does not exist', () => {
  /**
   * THE ROOT CAUSE, asserted directly so it cannot come back. `heldModes()` was never wrong: it has
   * always put `scanner` in the ring when `player.devices.scanner` is set. Nothing could ever set
   * it, because `buildTool` refuses unless `canAfford`, and the Prospector's Scanner costs
   * `crystal` — which is not a material. data/resources.json calls it `crystal_raw`.
   */
  assert.equal(resources.materials.crystal, undefined,
    'if `crystal` has become a real material this test has stopped meaning anything');
  assert.equal(MATERIAL_ALIASES.crystal, 'crystal_raw');

  // every cost in data/tools.json must resolve to something the game actually produces
  const rows = [...(toolData.bases || []), ...(toolData.devices || [])];
  for (const row of rows) {
    const priced = priceRow(row.cost || {}, () => 0);
    for (const id of Object.keys(priced.cost)) {
      assert.ok(resources.materials[id],
        `${row.id} costs "${id}" and nothing in the game produces one — a cost you cannot obtain is a wall`);
    }
  }
});

test('14 — a scanner can now be paid for, and the display word survives the translation', () => {
  const stock = { crystal_raw: 5, iron_ingot: 9, wire: 9, steel_ingot: 9, machine_part: 9, control_board: 9, log: 9, fibre: 9, leather: 9 };
  const rows = buildable(toolData, {}, m => stock[m] || 0);
  const scanner = rows.find(r => r.id === 'scanner');
  assert.ok(scanner, 'the scanner is not on the bench');
  assert.equal(scanner.canAfford, true, 'the scanner still cannot be built');
  assert.equal(scanner.cost.crystal_raw, 1, 'the cost was not translated to the real material');
  assert.equal(scanner.cost.crystal, undefined, 'the untranslated word is still being charged');
  assert.equal(scanner.names.crystal_raw, 'crystal', 'the panel should still say "1 crystal"');

  // with an empty pool it is short of the REAL material, so the "Short: …" line is answerable
  const broke = buildable(toolData, {}, () => 0).find(r => r.id === 'scanner');
  assert.equal(broke.canAfford, false);
  assert.ok(broke.short.some(s => s.m === 'crystal_raw'));
});

test('14 — a fresh character has no scanner in the ring, and gets one the moment they build it', () => {
  /**
   * The ring is meant to grow. A brand new character has a weapon and the Knapped Tool they are
   * given, and earns the other two — so "no scanner" on a new character is correct, and "no
   * scanner ever" was the bug.
   */
  const fresh = { equipment: {}, devices: {} };
  assert.deepEqual(heldModes(fresh), ['weapon'], 'a new character scrolls between one thing');
  fresh.equipment.tool = { toolKey: 'stone_tool', tier: 1 };
  assert.deepEqual(heldModes(fresh), ['weapon', 'tool']);

  assert.equal(giveDevice(fresh, 'scanner'), true);
  assert.deepEqual(heldModes(fresh), ['weapon', 'tool', 'scanner']);
  assert.equal(giveDevice(fresh, 'scanner'), false, 'you cannot own two');

  fresh.held = 'scanner';
  assert.equal(heldNow(fresh), 'scanner');
});

test('14 — the ring carries ONE scanner: the best one you own', () => {
  const p = { equipment: {}, devices: { scanner: true } };
  assert.equal(scannerDevice(p), 'scanner');
  assert.equal(heldModes(p).filter(m => m === 'scanner').length, 1);
  p.devices.deep_scanner = true;
  assert.equal(scannerDevice(p), 'deep_scanner');
  p.devices.survey_array = true;
  assert.equal(scannerDevice(p), 'survey_array');
  assert.equal(heldModes(p).filter(m => m === 'scanner').length, 1, 'three scanners must not be three modes');
});

test('14 — the tiers reach further, sweep faster and notice more, in that order', () => {
  const tiers = ['scanner', 'deep_scanner', 'survey_array'].map(id =>
    scannerTier({ devices: { [id]: true } }, toolData));
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(tiers[i].range > tiers[i - 1].range, `${tiers[i].id} does not reach further`);
    assert.ok(tiers[i].everySeconds < tiers[i - 1].everySeconds, `${tiers[i].id} does not sweep faster`);
    assert.ok(tiers[i].tier > tiers[i - 1].tier);
  }
  assert.equal(tiers[2].detects, '*', 'the top tier should notice everything');
  assert.equal(scannerTier({ devices: {} }, toolData), null);
});

test('14 — the chooser can narrow a sweep and forget a survey', () => {
  const logs = [];
  const scanner = createScanner({ data: toolData, onLog: t => logs.push(t), label: n => n.resource });
  const player = { devices: { scanner: true }, equipment: {} };
  const nodes = [
    { id: 1, x: 2, z: 0, kind: 'ore_outcrop', resource: 'iron_ore' },
    { id: 2, x: 4, z: 0, kind: 'ore_outcrop', resource: 'copper_ore' },
    { id: 3, x: 6, z: 0, kind: 'rare_seam', resource: 'meteoric_iron', rare: true },
  ];
  scanner.setOn(true, player);
  const near = () => nodes;

  assert.equal(scanner.scanningAll, true, 'a scanner starts by listening for everything');
  scanner.tick(9, { x: 0, z: 0 }, { nodesNear: near, player });
  assert.equal(scanner.size, 3);
  assert.equal(scanner.tally().length, 3);

  // narrow it, forget, and sweep again: only the one asked for comes back
  scanner.clearFound();
  assert.equal(scanner.size, 0, 'the survey was not forgotten');
  scanner.setWanted(['copper_ore']);
  assert.equal(scanner.scanningAll, false);
  scanner.tick(9, { x: 0, z: 0 }, { nodesNear: near, player });
  assert.deepEqual(scanner.list().map(r => r.resource), ['copper_ore']);

  // a rare seam answers to its own name as well as to what it is rich in
  scanner.clearFound();
  scanner.setWanted(['rare_seam']);
  scanner.tick(9, { x: 0, z: 0 }, { nodesNear: near, player });
  assert.deepEqual(scanner.list().map(r => r.id), ['3']);

  // …and the filter survives a save
  const saved = JSON.parse(JSON.stringify(scanner.toJSON()));
  const other = createScanner({ data: toolData, onLog: () => {} });
  other.load(saved);
  assert.deepEqual(other.wanted, ['rare_seam'], 'a filter you must set again every load is not a filter');
});

test('14 — the chooser is a screen with its own stylesheet and nothing inline', () => {
  const ui = src('../js/scanner-ui.js');
  const css = src('../scanner.css');
  assert.ok(ui.includes("const CSS_HREF = 'scanner.css'"), 'the module does not load its own stylesheet');
  assert.ok(!/\.style\.[a-z]/i.test(ui.replace(/\/\*[\s\S]*?\*\//g, '')), 'the chooser sets an inline style');
  assert.ok(css.includes('.scan-panel'), 'scanner.css does not style the panel');
  /**
   * …and something constructs it, which is the fault this project keeps finding.
   *
   * R17 (lead): it was a guarded dynamic import at the bottom of `createScanner`, because
   * js/main.js was another agent's file while this was written. main.js constructs it explicitly
   * now, which is where the one thing in the game that claims the right mouse button belongs.
   */
  const main = src('../js/main.js');
  assert.ok(main.includes("import { createScannerChooser } from './scanner-ui.js';"), 'main.js does not import the chooser');
  assert.ok(main.includes('createScannerChooser({'), 'nothing builds the chooser');
  assert.ok(!src('../js/tools.js').includes("import('./scanner-ui.js')"),
    'js/tools.js is still building it as well — two owners of one panel');
});

// ================================================================= item 26 — the seams, drawn

test('26 — every node kind has a shape and a look, and nothing falls back', () => {
  const view = src('../js/ore-view.js');
  const shapes = new Set([...view.matchAll(/^  ([a-z_]+): \(\) => mergeGroups\(\[/gm)].map(m => m[1]));
  const looks = new Set([...view.matchAll(/^  ([a-z_]+): \{ rock: /gm)].map(m => m[1]));
  for (const kind of Object.keys(resources.nodeKinds)) {
    assert.ok(shapes.has(kind), `${kind} has no shape — it would draw as an iron outcrop`);
    assert.ok(looks.has(kind), `${kind} has no colours — it would draw in the fallback brown`);
  }
  for (const kind of shapes) {
    assert.ok(resources.nodeKinds[kind], `ore-view draws a "${kind}" that is not a node kind`);
  }
});

test('26 — every kind builds a real geometry, in two groups, host first', async () => {
  /**
   * Three.js resolves through index.html's import map in a browser and through tests/three-loader.mjs
   * here, so the composites are BUILT rather than read. A merge that silently produces an empty
   * group is a seam whose ore never appears, and that is not a thing anybody notices in a screenshot.
   */
  register(pathToFileURL(join(here, 'three-loader.mjs')).href);
  const view = await import('../js/ore-view.js');
  assert.ok(view.SHAPE_KINDS.length >= 17, 'the shape table did not load');

  for (const kind of view.SHAPE_KINDS) {
    const geo = view.buildShape(kind);
    assert.ok(geo, `${kind} builds nothing`);
    const n = geo.attributes.position.count;
    assert.ok(n > 60, `${kind} is ${n} vertices — that is one primitive, which is the bug`);
    assert.equal(geo.groups.length, 2, `${kind} does not have a host group and a seam group`);
    assert.equal(geo.groups[0].materialIndex, 0);
    assert.equal(geo.groups[1].materialIndex, 1);
    assert.equal(geo.groups[0].start, 0);
    assert.equal(geo.groups[0].count + geo.groups[1].count, n, `${kind} loses vertices between its groups`);
    assert.ok(geo.groups[0].count > 0, `${kind} has no host rock — it is a floating seam`);
    assert.ok(geo.groups[1].count > 0, `${kind} has no ore in it — it is just a rock`);
    // nothing daft: every coordinate inside a ten-metre box. Round 16 found five of props.js's
    // giants at coordinates in the thousands because a shared base geometry was transformed twice.
    const pos = geo.attributes.position.array;
    for (let i = 0; i < pos.length; i++) {
      assert.ok(Number.isFinite(pos[i]) && Math.abs(pos[i]) < 10,
        `${kind} has a vertex at ${pos[i]} — a shared base geometry was transformed in place`);
    }
    // and it stays a cheap thing to draw two hundred of
    assert.ok(n <= 1200, `${kind} is ${n} vertices, drawn up to 220 times`);
  }
});

test('26 — the fibre patch is a clump, and the iron outcrop is rock with ore in it', async () => {
  register(pathToFileURL(join(here, 'three-loader.mjs')).href);
  const view = await import('../js/ore-view.js');

  // "a tiny cone-shaped tree" — it was one cone. It is nine blades and two seed heads now.
  const fibre = view.buildShape('fibre_patch');
  assert.ok(fibre.groups[1].count > fibre.groups[0].count,
    'a fibre patch should be mostly leaf, not mostly mound');

  // "a single color orange rock" — the host is most of it and the ore is the part that glows
  const iron = view.buildShape('ore_outcrop');
  assert.ok(iron.groups[0].count >= iron.groups[1].count * 0.5,
    'an outcrop with almost no rock in it is the single-colour rock again');

  const viewSrc = src('../js/ore-view.js');
  assert.ok(viewSrc.includes('SEAM_EMISSIVE'), 'the glow is no longer concentrated on the seam');
  assert.ok(!/emissiveIntensity: 0\.35,\s*\n\s*roughness: look\.rough,\s*\n\s*metalness: 0\.05/.test(viewSrc),
    'the old whole-rock glow is back');
});

// ================================================================= R18 — the carried-forward item

/**
 * R18 — A QUARTERSTAFF IS NOT RE-ATTUNED BY THE BLOCK THAT DE-ATTUNES IT.
 *
 * Round 17 found this and recorded it, deliberately, as NOT fixed: "a quarterstaff is re-attuned by
 * rpg.js's `attuneWeapon` — `CASTERS.has(sub)` fires because `sub` is the subtype, which items.json
 * files as `staff`."
 *
 * The shape of it: `attuneWeapon` clears `castElement` for a quarterstaff, and the very next branch
 * asks `CASTERS.has(sub) && !item.castElement`. `sub` is `staff`, `staff` is in CASTERS, and the
 * clear had just made the second half true — so the de-attune was the thing that re-armed the
 * attune. The raw base came out as "Arc Quarterstaff" with an arcane `castElement`, a `cast_arcane`
 * affix on the card and a glowing element topper from `heldLookFor`.
 *
 * `spellShapeOf` was already null for it, because `isStaff()` excludes a quarterstaff BY NAME — so
 * the test above passed throughout and none of this showed up in it. That is why this one asks
 * about the attunement itself rather than about the spell.
 *
 * items.json is SHARED with Emberveil and has its own test over it, so the fix is on the item, in
 * `attuneWeapon`, exactly like `ranged`, `offHandOk` and `markHands`.
 */
test('R18 — a quarterstaff comes out of attuneWeapon a pole, and stays one', () => {
  const base = items.weaponBases.quarterstaff;
  assert.ok(base, 'items.json has no quarterstaff');
  // the two facts this whole bug rests on, asserted so the data moving is not silent
  assert.equal(base.subtype, 'staff', 'the quarterstaff subtype moved — re-check the CASTERS guard');
  assert.equal(base.weaponCategory, 'magic', 'items.json no longer files a quarterstaff as magic');

  const staff = make('quarterstaff');
  assert.ok(staff, 'the generator would not make a quarterstaff');

  assert.equal(staff.weaponCategory, 'light', 'a quarterstaff is still filed as a magic weapon');
  assert.equal(staff.castElement ?? null, null, 'a quarterstaff was given an element to cast');
  assert.equal(staff.castStatus ?? null, null, 'a quarterstaff was given a cast status');
  assert.ok(!staff.ranged, 'a quarterstaff became a ranged weapon');
  assert.ok(
    !(staff.affixes || []).some(a => a.stat === 'castElement'),
    'a quarterstaff carries a castElement affix: ' + JSON.stringify(staff.affixes),
  );
  // the name is where it showed: "Arc Quarterstaff", "Flame Quarterstaff"…
  for (const brand of ['Arc', 'Flame', 'Frost', 'Storm', 'Venom', 'Gloom', 'Ray']) {
    assert.ok(!staff.name.startsWith(brand + ' '), `a quarterstaff was renamed "${staff.name}"`);
  }
  assert.equal(spellShapeOf(staff), null, 'a quarterstaff is a pole, not a spell launcher');
  assert.ok(!isStaff(staff), 'a quarterstaff reads as a casting staff');

  /**
   * And again on the same object. The de-attune only fires while `weaponCategory` still says
   * `magic`, so a second pass — a reload, a re-roll at the bench, anything that attunes an item it
   * has already attuned — used to skip it and let the caster branch through unopposed.
   */
  const again = attuneWeapon(attuneWeapon(staff));
  assert.equal(again.castElement ?? null, null, 'attuning a quarterstaff twice gave it an element');
  assert.equal(again.weaponCategory, 'light', 'attuning a quarterstaff twice made it magic again');
  assert.ok(
    !(again.affixes || []).some(a => a.stat === 'castElement'),
    'attuning a quarterstaff twice added a cast affix',
  );
});

/** A real caster still gets attuned — the guard must not have turned the feature off. */
test('R18 — wands, scepters, orbs and tomes are still attuned', () => {
  for (const key of MAGIC_BASES) {
    const base = items.weaponBases[key];
    if (key === 'quarterstaff' || base.subtype === 'quarterstaff') continue;
    if (!['wand', 'scepter', 'orb', 'staff', 'tome'].includes(base.subtype)) continue;
    const item = make(key);
    if (!item) continue;
    assert.ok(item.castElement, `${key} lost its element — the quarterstaff guard is too wide`);
  }
});

/**
 * R18 — EVERY HOOK THE REGISTRY DEFINES HAS SOMETHING THAT CALLS IT.
 *
 * This is the project's signature fault expressed as a test. `js/effects.js` defines a hook by
 * giving an effect a named function — `onSwing`, `guardPower`, `noAmbush` — and something in the
 * game has to ASK for it (`fx.sum`, `fx.product`, `fx.onSwing`, a dispatcher method). Three of them
 * had no asker at all, so the affixes hanging off them were inert:
 *
 *   `onSwing`    — `cond_manaOnAttack`, "Every swing returns 1-3 mana", rollable from ilvl 4.
 *   `guardPower` — `cond_guardBond`, a 700-gold-class property on the Covenant Hammer.
 *   `noAmbush`   — `legendary:no_night_raids`, which is The Long Watch's whole reason to exist.
 *
 * A hook with no caller is indistinguishable from a feature that does not exist, and much harder to
 * see than a crash: every test of the registry itself passes.
 *
 * WHAT THIS CATCHES AND WHAT IT DOES NOT. Verified against the code before those three were wired:
 * it names `onSwing` and `noAmbush` and misses `guardPower`, because `guardPower` is read by one of
 * the registry's own aggregators and is therefore exempt by the rule below — the aggregator existed,
 * nothing asked it for that name. A regex cannot tell those apart without following the data flow.
 * Two of three with no false positives is worth having; it is not a proof.
 */
test('R18 — no effect hook is defined without a caller', () => {
  const effectsSrc = src('../js/effects.js');
  const game = ['main', 'rpg', 'pets', 'town', 'skills', 'actors', 'defence', 'combat-fx', 'craft', 'classbuild']
    .map(f => src(`../js/${f}.js`)).join('\n');

  /** Hook names: a bare `name: (…) =>` or `name: fn` inside a `def(...)` spec object. */
  const defined = new Set();
  for (const m of effectsSrc.matchAll(/\b([a-zA-Z][\w]*)\s*:\s*\((?:v|\)|[a-z])/g)) defined.add(m[1]);
  // the plain-stat plumbing and the description fields are not hooks
  for (const skip of ['field', 'plain', 'desc', 'id', 'name', 'stat', 'value', 'element', 'min', 'max',
    'ilvl', 'slots', 'growth', 'tier', 'kind', 'rt', 'self', 'target', 'get', 'set']) defined.delete(skip);

  const orphans = [];
  for (const hook of defined) {
    // asked by name through any of the dispatch helpers, or by a dispatcher method of its own
    /**
     * Asked from OUTSIDE js/effects.js, and only outside. The first version of this test also
     * accepted a mention inside effects.js, and effects.js contains
     * `onSwing(c) { return this.fire('onSwing', c); }` — so a dispatcher counted as its own caller
     * and the test passed against the broken code. A dispatcher with nothing calling it IS the bug.
     */
    const asked = new RegExp(`['"\`]${hook}['"\`]|\\bfx\\.${hook}\\b`);
    /**
     * …or consumed by one of the registry's own aggregators, which the game then calls. `flatOut`
     * is read as `e.flatOut(v, c)` inside `damageOut`, and that is a real consumer — unlike
     * `fire('onSwing', c)`, which only forwards. The difference between the two is exactly the
     * difference between a hook that works and a hook that is waiting for somebody.
     */
    const consumed = new RegExp(`\\be\\.${hook}\\b`).test(effectsSrc);
    if (!asked.test(game) && !consumed) orphans.push(hook);
  }
  assert.deepEqual(orphans, [],
    'these hooks are defined in js/effects.js and nothing in the game asks for them, so every '
    + 'affix hanging off them is inert:\n  ' + orphans.join('\n  '));
});
