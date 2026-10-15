// Round 11 (owner feedback 2026-10-15), stream UI — the client's pure rules and the source facts a browser cannot cheaply
// prove. Run: node --test prototypes/thousandvale/tests/D/pt11.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mountRows, mountTip, slotMount, speedText, autoTarget, isGreeting, bannerWorthy, oursKey, OURS } from '../../js/client/ui/pt11-core.js';
import { tabOf, sortOther, isKept } from '../../js/sim/bag-tabs.js';
import { meterRecord } from '../../js/client/ui/pt8-core.js';
import { Meter } from '../../../../meters/js/meter.js';

const GAME = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = f => readFileSync(join(GAME, f), 'utf8');
const MOUNTS = [{ id: 'trail_horse', name: 'Trail Horse', speed: 1.35, calm: 0.15 }, { id: 'pony', name: 'Moor Pony', speed: 1.5, calm: 0.2 }];

test('#44: the Mount slot — fastest first, the picked one is in the slot, the card compares', () => {
  assert.deepEqual(mountRows(MOUNTS).map(m => [m.id, m.on]), [['pony', true], ['trail_horse', false]], 'no pick: the fastest');
  assert.equal(slotMount(MOUNTS, 'trail_horse').id, 'trail_horse');
  assert.equal(slotMount([], null), null);
  assert.equal(speedText(1.35), '35% faster than running');
  const card = mountTip(MOUNTS[1], MOUNTS[0]);
  assert.match(card, /Moor Pony/); assert.match(card, /Instead of <b>Trail Horse<\/b>/); assert.match(card, /speed \+15%/); assert.match(card, /steadiness \+5%/);
  assert.match(mountTip(null), /stablehand sells/);
  assert.match(mountTip(MOUNTS[0], MOUNTS[0], { saddle: { name: 'Saddle bags', slots: 12 } }), /12 more squares/);
});

test('#21: Strike with no target — straight ahead first, else the nearest, else nothing', () => {
  const me = { x: 0, z: 0, yaw: 0 };           // facing +z
  const behind = { id: 1, x: 0, z: -3, hostile: true }, ahead = { id: 2, x: 0.5, z: 9, hostile: true }, side = { id: 3, x: 6, z: 0.1, hostile: true };
  assert.equal(autoTarget([behind, ahead, side], me).id, 2, 'the one you face, though another is nearer');
  assert.equal(autoTarget([behind, side], me).id, 1, 'nothing ahead: the nearest');
  assert.equal(autoTarget([{ ...ahead, dead: true }, { id: 9, x: 0, z: 2, hostile: false }], me), null, 'dead and friendly do not count');
  assert.equal(autoTarget([{ id: 4, x: 0, z: 80, hostile: true }], me), null, 'too far: nothing');
});

test('#54: a passing remark is chat; bosses keep the banner', () => {
  assert.equal(isGreeting({ type: 'say', style: 'bark', npc: 1, text: 'Evening, morning, whichever.' }), true);
  assert.ok(bannerWorthy('boss') && bannerWorthy('zone') && !bannerWorthy('bark'));
  const boss = src('js/client/boss.js');
  assert.match(boss, /if \(isBark\(ev\)\) \{[^}]*toast\?\.chat\?\./, 'a bark goes to chat');
  assert.ok(boss.indexOf('if (isBark(ev))') < boss.indexOf("callout(ev.text, ev.style || 'yell', who)"), '…before the callout could draw it');
});

test('#51: the meter keeps a fight recorded under an old body id', () => {
  // record a fight as entity 41 (before a death), then look as entity 77 (woken at the inn): the bars are still yours
  const m = new Meter({ maxFights: 5 });
  m.startFight('Bog boss');
  const rec = meterRecord([41, 900, 120, 0, 'basic'], { t: 1, nameOf: id => (id === 41 ? 'starman' : 'Bog boss') });
  rec.source = oursKey(41, { selfId: 41 }); rec.target = '900';
  m.record(rec);
  assert.equal(rec.source, OURS + 'self');
  const mine = m.report('damage', 'current').filter(r => String(r.id).startsWith(OURS));
  assert.equal(mine.length, 1, 'still one bar for you');
  assert.equal(oursKey(77, { selfId: 77 }), rec.source, 'the new body maps to the same key');
  assert.equal(oursKey(5, { selfId: 77, partyIds: [5], nameOf: () => 'Bettony' }), OURS + 'p:Bettony');
  const mw = src('js/client/ui/meter-window.js');
  assert.match(mw, /n\.on\('joined', \(\) => \{ S\.gotHits = false; record\(\); \}\)/, 'every join asks for the feed (recording from login)');
  assert.doesNotMatch(mw, /n\.on\('hits', m => \{\s*if \(!S\.on\) return;/, 'hits are recorded whether or not the window is open');
});

test('#11 / #42: the bag window draws three tabs; Other is sorted and never padded; the shop sells only Equipment / Items', () => {
  const bag = src('js/client/bag.js');
  assert.match(bag, /TABS/); assert.match(bag, /S\.tab === 'other' \? sortOther/);
  const other = sortOther([{ name: 'Zed crate', kind: 'crate' }, { name: 'Parcel', quest: 'x', noSell: true }, { name: 'Recall charm', id: 'recall_charm', keep: true }]);
  assert.deepEqual(other.map(i => i.name), ['Recall charm', 'Parcel', 'Zed crate']);
  const shop = src('js/client/ui/shop.js');
  assert.match(shop, /\['gear', 'Equipment'\], \['items', 'Items'\]/);
  assert.match(shop, /filter\(it => tabOf\(it\) !== 'other'\)/);
  assert.ok(isKept({ id: 'recall_charm' }) && tabOf({ id: 'recall_charm' }) === 'other');
});

test('#43 / #28: Shift is heard in the capture phase (windows stop their keys); Y on a card flips the compare', () => {
  const card = src('js/client/ui/item-card.js');
  assert.match(card, /addEventListener\('keydown', key\(true\), true\)/);
  assert.match(card, /addEventListener\('tv:pad-alt'/);
  assert.match(src('js/client/ui/shop.js'), /addEventListener\('keydown', onShift, true\)/, 'the shop redraws its compare card on Shift');
  const focus = src('js/client/input/focus.js');
  assert.match(focus, /\[data-pad-first\]/, 'a window can say where the ring starts');
  assert.match(focus, /if \(!b \|\| b\.hidden\) details\(\)/, 'an item square shows its card when the ring lands on it');
  assert.match(src('js/client/input/gamepad.js'), /case 'Y': \(focus\.cardOrAlt \|\| focus\.details\)\(\)/);
  assert.match(src('js/client/ui/loot.js'), /setAttribute\('data-pad-first', ''\)/, '#22: the loot window starts on the first item');
});

test('#8 / #29 / #13: Loot walks there; the Mount button; the potion keys sit level', () => {
  const loot = src('js/client/ui/loot.js');
  assert.match(loot, /controls\.walkTo\(a\.pos\.x, a\.pos\.z\)/);
  assert.doesNotMatch(loot, /'Too far away to loot\.', 'warn'\); return true;/, 'no more "too far" with no walk');
  assert.match(src('js/client/ui/pt11.js'), /button\.slot\.mount-btn/);
  const css = src('css/pt11.css');
  assert.match(css, /\.hb-group \{ top: -1px; bottom: -1px;/);
  assert.match(css, /\.hb-group \.hb-slot \.hb-face \{ position: absolute; inset: 0;/);
  assert.match(src('index.html'), /css\/pt11\.css/);
});
