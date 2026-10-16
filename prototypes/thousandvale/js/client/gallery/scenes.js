// UI gallery — the scenes (play-test 5, T26 — stream G). DATA: each scene names the real modules it shows, the steps
// that bring the interface to that state, and the notes printed beside the frame. No markup lives here.
//
//   id        the deep link:  ui-gallery.html#scene=<id>&device=<desktop|laptop|phone-p|phone-l|pad>&layout=<current|proposed>&variant=<a|b>
//   stage     'world' (default: the HUD over a still of the 3D world) or 'title' (the title screen; `title` = which step)
//   modules   the files this scene exists to show — tests/G/gallery.test.js fails when a module under js/client/ui/ is in
//             no scene and not on NO_SCREEN below
//   steps     [verb, ...args] — the verbs are in stage.js (panel, hub, play, call, click, hover, target, dead, …).
//             'play' plays a server moment: recorded (fixtures/session.json) or hand-kept (fixtures/moments.json).
//   phone / pad   { steps } run after `steps` in that frame's PROPOSED layout;  phoneCurrent = steps for the phone frame's CURRENT layout
//   expect    a selector that must be on screen when the steps are done (the stage reports a scene that did not get there)
//   only      frames this scene is for (default: all);  proposedOnly = it shows something only the proposed layout has
//   notes     { all, desktop, phone, pad } — plain language, shown beside the frame
//
// To add a scene: add an entry here. That is all (docs/UI.md "Adding a scene").

import { PROF_SCENES } from './prof-scenes.js';      // W9 (P-client): the profession scenes live beside this file

const U = 'js/client/ui/';

/** Round 11 (Market, owner #25): a recorded Market — six listings (two of them yours) and a fee quote for every bag item. */
const marketFill = ['run', async G => {
  const now = Date.now(), day = 86400000;
  const it = (uid, name, rarity, extra) => ({ uid, name, rarity, ...extra });
  const list = [
    { id: 41, seller: 'Brannoc', item: it('mk-1', 'Copper Ore', 'normal', { kind: 'material', id: 'copper_ore', count: 20 }), price: 30, count: 20, listedAt: now - 2 * day, expiresAt: now + 28 * day },
    { id: 42, seller: 'Ysolde', item: it('mk-2', 'Wolfhide Gloves', 'magic', { type: 'armor', slot: 'hands', level: 6, armor: 9 }), price: 95, count: 1, listedAt: now - day, expiresAt: now + 29 * day },
    { id: 43, seller: 'Tamsin Reed', item: it('mk-3', 'Gullwick Longsword', 'rare', { type: 'weapon', slot: 'weapon', base: 'longsword', level: 8, dmg: [11, 18] }), price: 420, count: 1, listedAt: now - 3 * 3600000, expiresAt: now + 30 * day - 3 * 3600000 },
    { id: 44, seller: 'Odo Fenn', item: it('mk-4', 'Healing Potion', 'normal', { kind: 'potion', id: 'healing_potion', count: 5 }), price: 60, count: 5, listedAt: now - 5 * day, expiresAt: now + 25 * day },
    { id: 45, seller: 'You', mine: true, item: it('mk-5', 'Ashwood Staff', 'magic', { type: 'weapon', slot: 'weapon', base: 'staff', level: 5 }), price: 150, fee: 4, count: 1, listedAt: now - 6 * day, expiresAt: now + 24 * day },
    { id: 46, seller: 'You', mine: true, item: it('mk-6', 'Iron Ore', 'normal', { kind: 'material', id: 'iron_ore', count: 12 }), price: 48, fee: 1, count: 12, listedAt: now - 20 * day, expiresAt: now + 10 * day },
  ];
  const bag = (G.bag?.state?.bag || []).filter(i => !i.noSell && !i.keep && i.kind !== 'crate' && i.kind !== 'gift' && !i.quest);
  G.fake.push('game', { t: 'marketList', list, total: list.length, page: 0, per: 30, q: '', tab: '', sub: '', sort: 'cheap' });
  G.fake.push('game', { t: 'marketMine', list: list.filter(x => x.mine), cap: 20, feePct: 20, priceMax: 10000000, lastsMs: 30 * day, canSell: null,
    quotes: bag.map((x, i) => { const sell = 3 + (i * 7) % 40; return { uid: x.uid, sell, fee: Math.max(1, Math.ceil(sell * 0.2)) }; }) });
  await new Promise(r => setTimeout(r, 200));
}];
const chat = [['chat', [
  { text: 'Anyone for the Barrow? Need a tank.', cls: 'say', from: 'Sella' },
  { text: 'I can tank it. Two minutes — selling junk first.', cls: 'party', from: 'Aldra' },
  { text: 'You loot: Gilded Band of the Hare', cls: 'loot rarity-rare' },
  { text: 'Brem has come online.', cls: 'system' },
]]];
const fight = [['vitals', 0.64, 0.42], ['play', 'hurt-party'], ['target', 'enemy'], ['cast', 2], ['track', 2], ...chat];
/** V10: put the pointer on a RARE item in the bag that goes where a rare is already worn, so the card has something to compare. */
const rareCell = () => {
  const B = window.gallery.bag.state, worn = B.equipment || {}, slotOf = it => it.slot || (it.type === 'weapon' ? 'weapon' : null);
  const wornRare = new Set(Object.entries(worn).filter(([, it]) => it && ['rare', 'epic', 'legendary', 'unique'].includes(it.rarity)).map(([s]) => s.replace(/\d$/, '')));
  const pick = (B.bag || []).find(it => it.rarity === 'rare' && wornRare.has(String(slotOf(it) || '').replace(/\d$/, ''))) || (B.bag || []).find(it => it.rarity === 'rare' && worn[slotOf(it)]) || (B.bag || []).find(it => it.rarity === 'rare');
  return (pick && document.querySelector(`#bag-grid .islot[data-tip-item="${pick.uid}"]`)) || document.querySelector('#bag-grid .islot.r-rare') || document.querySelector('#bag-grid .islot:not(.empty)');
};
const stagePerks = ['run', async G => {
  const T = G.ui.talents; if (!T) return;
  for (let i = 0; i < 60 && !T.source?.forest; i++) await new Promise(r => setTimeout(r, 50));
  const F = T.source?.forest; if (!F) return;
  // stage three perks next to the ones already held — through the same action a click on a glowing node runs (talents.js stage.takePerk)
  const have = new Set([F.start?.id, ...(T.state.perks || [])]);
  for (let n = 0; n < 3; n++) {
    const next = F.nodes.find(x => !have.has(x.id) && (F.neighbours.get(x.id) || []).some(y => have.has(y)));
    if (!next) break;
    have.add(next.id); T.stage.takePerk(next.id);
  }
  T.graph?.fit?.();
}];

export const GROUPS = ['Start', 'In the world', 'Character', 'Windows', 'Social', 'Loot and trade', 'Angling', 'Professions', 'System', 'Controller', 'Phone', 'Reference'];

export const SCENES = [
  // ------------------------------------------------------------------------------------------------ Start
  { id: 'title-new', expect: '#login:not([hidden]) #classes .chip', group: 'Start', title: 'Title — new adventurer', stage: 'title', step: 'new', modules: ['index.html'],
    notes: { all: 'Step 1 of 3: a name, a people, a calling. This is index.html’s own markup; the six chips and the “More callings” list are filled from the class data.',
      phone: 'Proposed: the card is the whole screen and scrolls; every chip is 44 px tall; inputs are 16 px so iOS does not zoom the page when you tap one. On its side the card takes the left 400 px and the figure stays visible on the right.',
      pad: 'D-pad or stick moves the ring between chips, A picks, the name box opens the on-screen keyboard.' } },
  { id: 'title-chars', expect: '#front:not([hidden]) #char-chips .chip', group: 'Start', title: 'Title — your characters', stage: 'title', step: 'front', modules: [U + 'portraits.js', U + 'svg-portrait.js', 'js/client/account.js'],
    notes: { all: 'What a returning player sees: their characters (portrait, level, calling) and “New character”. The portraits are the game’s own — in the gallery they use its 2D-face path (the one it falls back to on computers without a graphics card).',
      phone: 'Each character is one full-width row, 56 px tall.' } },
  { id: 'title-login', expect: '#signin:not([hidden])', group: 'Start', title: 'Title — log in', stage: 'title', step: 'login', modules: ['js/client/account.js'],
    notes: { all: 'The Log in tab: username, password, “Forgot your password?”.', pad: 'Text boxes open the on-screen keyboard (see the “On-screen keyboard” scene). A controller player can stay a guest and never type.' } },
  { id: 'create-look', expect: '#panel-appearance:not([hidden])', group: 'Start', title: 'Creation — appearance', stage: 'title', step: 'look', modules: [U + 'appearance.js', U + 'appearance-core.js'],
    notes: { all: 'Step 2: the appearance editor (also the barber’s chair in the world). The figure it dresses is the 3D one behind it — here a still picture.',
      phone: 'Proposed: a sheet over the lower two thirds upright, so the figure stays in view above it (the next step, equipment, is a full sheet: three sets and the weapon packs need the room); on its side the editor is the left column. “Preview” in the title bar folds the editor away entirely so the figure has the whole screen. Swatches are 44 px (fewer to a row than on a desktop).',
      pad: 'LB / RB step through the editor’s sections; left / right on a list changes it.' } },
  { id: 'create-kit', expect: '#panel-kits:not([hidden]) .kit-choice', group: 'Start', title: 'Creation — starting equipment', stage: 'title', step: 'kit', modules: [U + 'kit-step.js', U + 'item-card.js'],
    notes: { all: 'Step 3 (new this round, T5): three armour sets and the weapon packs for the calling, each piece with its numbers written out. The kits are the server’s real answer for a cleric, recorded.',
      phone: 'Each choice is a full-width card you tap; hold a piece for its full card. “Preview” in the title bar folds the sheet down to its title so you can see the figure wearing what you picked; tap it again to come back.', pad: 'Up / down between choices, A picks, Menu = Create.' } },

  // ------------------------------------------------------------------------------------------------ In the world
  { id: 'hud', expect: '#target-frame:not([hidden])', group: 'In the world', title: 'HUD — in a fight', modules: ['js/client/hud.js', 'js/client/menubar.js', U + 'unseen.js', U + 'pt6-core.js', U + 'hotbar.js', U + 'buffs.js', U + 'minimap.js', U + 'event-tracker.js', U + 'pt2.js', U + 'pt5.js', U + 'suite.js', U + 'banner.js', U + 'tips.js', U + 'atlas.js', U + 'map-data.js', U + 'map-load.js'],
    steps: [...fight, ['play', 'event-live']],
    notes: { all: 'Everything on screen while you play: your frame and the target’s (top left), the party, the minimap, the event tracker and the quest tracker (right), chat (bottom left), the action bar (F + 1–6, then 7 8 9 0 for potions and food) and the window buttons down the right edge. State: a level 24 cleric in a party of four, recorded from a real server.',
      desktop: 'This is the game today, untouched.',
      phone: 'Proposed layout, built for thumbs on a phone held sideways:\n• LEFT THUMB: a stick that appears wherever you put your thumb down in the lower-left 40% (push to the edge to sprint). Nothing else lives there, so you cannot miss it.\n• RIGHT THUMB: Attack in the corner (76 px), skills 1–4 on an arc one thumb-length away (52 px), then a second arc: skills 5 and 6 straight above the corner (the easiest stretch), Belt, Target, Ally, Jump (46 px). These are the game’s real action-bar buttons, moved — same cooldown sweep, same cards.\n• HEALERS: the party frames are 44 px rows under your own frame — tap one and your heals go there; tap your own frame to heal yourself. The green Ally button does the same without reaching (it starts with whoever is hurt most).\n• Minimap top right (tap = map). Quests and events are behind ONE scroll button with a count (see “HUD — party as portraits, quests and events opened”); the three-heads button shrinks the party to round portraits.\n• Chat is a bubble with an unread count; the wheel button opens every window.\n• Key letters are gone from the buttons; nothing is under the island or the home bar.\nVariant B (switch above the frame): a flat 2×4 grid instead of the arcs.',
      pad: 'The same HUD with the hints switched to the controller’s buttons: X strikes, Y B RB RT are skills 1–4, hold LT for skills 5–6 and the D-pad potions. The glyphs follow the controller plugged in (Xbox / PlayStation / generic) and flip back to keys the moment you touch the keyboard.' },
    phoneCurrent: [], phone: { steps: [['touch', 'stick']] } },
  { id: 'hud-heal', expect: '#target-frame.friendly', group: 'In the world', title: 'HUD — healing a friend', modules: ['js/client/social.js', U + 'pt5.js'],
    steps: [['vitals', 0.9, 0.7], ['play', 'hurt-party'], ['target', 'ally'], ['wait', 400]],
    notes: { all: 'A party member is targeted: the target frame turns friendly and the note over the action bar says who your heals and wards will land on (T3).',
      phone: 'One thumb: tap the party row (44 px tall). The row you picked is outlined. Tapping your own frame clears it.', pad: 'D-pad down / up steps through the party (the first press goes to whoever is hurt most), D-pad left clears.' } },
  { id: 'hud-boss', expect: '#boss:not([hidden])', group: 'In the world', title: 'HUD — boss fight', modules: ['js/client/boss.js'],
    steps: [['vitals', 0.55, 0.3], ['play', 'hurt-party'], ['target', 'elite'], ['play', 'boss'], ['wait', 500]],
    notes: { all: 'The boss frame (name, phases as ticks on the bar, enrage timer, cast bar), its ward bar — how much is left to break and the seconds until it fades — and a call-out line.', phone: 'The boss bar sits under the target frame at 60% width so it clears the minimap and the party column.' } },
  { id: 'hud-popups', expect: '.roll-card', group: 'In the world', title: 'HUD — banners, pop-ups, a loot roll', modules: [U + 'banner.js', U + 'loot.js'],
    steps: [['call', 'tvui2.banner', { level: 'zone', lead: 'You enter', name: 'The Torbor Fields', sub: 'Levels 20–26' }], ['play', 'party-invite'], ['play', 'loot-roll'], ['play', 'realm-soon'], ['toast', 'Not enough mana.', 'warn']],
    notes: { all: 'The things that appear on their own: the area banner, a party invite, a Need / Greed / Skip roll, a realm event announcement, a warning line.',
      phone: 'Pop-ups that ask something stack under the target frame; their buttons are 44 px. The roll card moves to the top right under the minimap so it never covers the skill arc.', pad: 'A pop-up takes the focus ring while it is up: A = the gold button, B = the other.' } },
  { id: 'death', expect: '#rise:not([hidden])', group: 'In the world', title: 'Death', modules: ['js/client/hud.js'], steps: [['dead', 0]],
    notes: { all: 'You have fallen: the Rise button (after a 2.5 s wait).', phone: 'The Rise button is 52 px tall and thumb-centred.', pad: 'A rises.' } },
  { id: 'revive', expect: '.revive-ask:not([hidden])', group: 'In the world', title: 'Death — a friend offers to raise you', modules: [U + 'pt5.js'], steps: [['dead', 0], ['play', 'revive-ask']],
    notes: { all: 'T4: a party member cast a revive on you. Accept stands you up where you fell; the offer has a timer.', pad: 'The ring starts on Accept.' } },
  { id: 'lift', expect: '.lift-ask:not([hidden]), .tv-lift:not([hidden]), [class*="lift"]:not([hidden])', group: 'In the world', title: 'Dungeon lift — pick a floor', modules: ['js/client/world-ui.js', U + 'pt6-core.js'], steps: [['play', 'lift'], ['wait', 300]],
    notes: { all: 'Stairs and lifts in a dungeon list the floors you have reached.', phone: 'A bottom sheet with one 48 px button per floor.', pad: 'Up / down, A goes.' } },
  { id: 'hud-locked', expect: '#actionbar .slot.locked', group: 'In the world', title: 'HUD — a low-level bar (locked slots)', modules: ['js/client/hud.js', U + 'hotbar.js'],
    steps: [['run', async G => { const y = G.S.net.joined.you; G.fake.push('game', { t: 'you', bar: (y.bar || []).map((b, i) => (i >= 3 ? { ...b, locked: true, level: [12, 18, 24][i - 3] || 24 } : b)) }); await new Promise(r => setTimeout(r, 150)); }], ['vitals', 0.8, 0.6], ['target', 'enemy']],
    notes: { all: 'Skills you have not reached yet stay on the bar, greyed, with the level that unlocks them (“Lv 12”). Potions and food of one kind stack on one key with a count.', phone: 'Locked skills keep their place on the arcs so the layout never shifts as you level.' } },
  { id: 'dialog', expect: '.tv-dialog:not([hidden])', group: 'In the world', title: 'Talking to town folk', modules: ['js/client/world-ui.js'], steps: [['reply', 'use', 'offers'], ['wait', 300]],
    notes: { all: 'An NPC’s dialog with its buttons (quests to take or hand in, a shop, the barber’s chair, an inn to call home). Recorded from the starter town.',
      phone: 'The dialog is a bottom sheet; its buttons are full-width, 48 px.', pad: 'Up / down between the buttons, A presses, B walks away.' } },
  { id: 'context', expect: '.ent-menu:not([hidden])', group: 'In the world', title: 'Right-click menu on a player', modules: [U + 'context-menu.js'], steps: [['target', 'ally'], ['call', 'tvui2.context', '@ally', 640, 300]],
    notes: { all: 'The menu on another player: follow, trade, inspect, whisper, invite, friend, report.',
      phone: 'There is no right-click on a phone: hold on a player (or on their party row). The menu opens as a bottom sheet in two columns.', pad: 'X (the “other” button) on a targeted player opens it.' } },
  { id: 'tooltip', expect: '#tipbox:not([hidden]), .phone-sheet:not([hidden])', group: 'In the world', title: 'A skill’s card', modules: [U + 'tips.js'], steps: [...fight, ['wait', 400], ['hover', '#actionbar .slot:nth-child(3)']],
    phone: { steps: [['holdSheet', '#actionbar .slot:nth-child(3)']] },
    notes: { all: 'Every hover card in the game goes through one tooltip engine. This one is a skill: cost, cooldown, exactly who it touches (T2).',
      phone: 'No hover on a phone: HOLD anything that has a card (about a third of a second) and it opens as a sheet you can read at leisure; tap outside to close. A quick tap still uses the thing.', pad: 'Y shows the card of whatever the ring is on.' } },

  // ------------------------------------------------------------------------------------------------ Character
  { id: 'bag', expect: '#bag:not([hidden]) #bag-grid .islot:not(.empty)', group: 'Character', title: 'Bag and paper doll', modules: ['js/client/bag.js', U + 'inv-core.js', U + 'item-icons.js', U + 'item-cell.js'], steps: [['panel', 'bag'], ['icons']],
    notes: { all: 'The character window: the paper doll on the left (what you wear), the bag on the right with filters, search and sort. The 3D item icons are drawn by the game’s icon renderer.',
      phone: 'Proposed: the bag is a full-screen sheet. Upright: what you wear is a strip of squares on top, the bag is a grid of 58 px squares below. On its side: worn gear left, bag right. The tab bar (bottom upright, a rail on the left on its side) moves between Bag · Character · Skills · Perks · Map · Journal · Social with one tap.\nWhy a rail on its side: the screen is only 372 px tall there and a bottom bar would cost 15% of it; the left edge next to the island is dead space anyway.',
      pad: 'The ring moves square to square; A wears, X opens the item’s menu, Y shows its card; LB / RB change the filter.' } },
  { id: 'bag-tabs', expect: '#bag:not([hidden]) #inv-tabs .chip.tab', group: 'Character', title: 'Bag tabs (Equipment / Items / Other), the Mount slot, the Mount button', notes: { all: 'Round 11 (#11, #44, #29): three tabs counted on their own (Other never fills); the Mount slot lists your mounts to swap, with a compare card; the action bar carries a Mount button where the fishing button was.', pad: 'A focused square shows its card at once; Y on it compares the other hand / ring.' }, modules: [U + 'pt11.js', U + 'pt11-core.js'], steps: [['panel', 'bag'], ['icons']] },
  { id: 'bag-character', expect: '#panel-sheet:not([hidden]) .sh-row', group: 'Character', title: 'Character menu beside the bag', modules: [U + 'char-sheet.js', U + 'pt5-core.js'], steps: [['panel', 'bag'], ['panel', 'sheet'], ['icons']],
    notes: { all: 'T18: the Character menu (health, armour, damage per ability, angling skill) docks beside the bag. The numbers are the server’s own sheet, recorded.',
      phone: 'No room for two windows side by side: Character is its own tab next to Bag — one tap swaps them.' } },
  { id: 'item-card', expect: '#tipbox:not([hidden]) .itemtip, .phone-sheet:not([hidden]) .itemtip', group: 'Character', title: 'Item card and compare', modules: [U + 'item-card.js'], steps: [['panel', 'bag'], ['icons'], ['run', async (G, V) => { if (document.documentElement.dataset.layout === 'phone') return; const c = rareCell(); c.id = c.id || 'gallery-rare'; await V.hover('#' + c.id); }]],
    phone: { steps: [['run', async G => { const c = rareCell(); if (c) await G.input.touch?.itemSheet(c); }]] },
    notes: { all: 'The card of a rare item in the bag next to the rare one being worn in that slot: what it is, its numbers, and line by line what you would gain and lose by swapping.',
      phone: 'On a phone a tap on an item does not wear it straight away (too easy to mis-tap): it opens the card as a sheet with three big buttons — Use / wear, Other hand, Throw away. The comparison is in the card itself.', pad: 'Y on an item shows this card next to the ring.' } },
  { id: 'crate', expect: '.tv-reveal:not([hidden])', group: 'Character', title: 'Opening a crate', modules: [U + 'reveal.js'], steps: [['call', 'tvui5.reveal', '@item.crate-boots', 'crate'], ['wait', 1200]],
    notes: { all: 'T9: a crate opens into an item for your calling, with a short reveal.', phone: 'The button under it is 48 px.' } },
  { id: 'skills', expect: '#panel-skills:not([hidden])', group: 'Character', title: 'Skills and talents', modules: [U + 'talents.js', U + 'talent-model.js'], steps: [['panel', 'skills'], ['wait', 500], ['click', '#panel-skills .tvt-skill:not(.locked)']],
    notes: { all: 'The skill ladder for the calling and the talent tree of the chosen skill. Picks are staged first (T28): Undo, Redo, Cancel, Accept.',
      phone: 'A full-screen sheet; skills are 48 px rows, the tree’s nodes are finger-sized; the staged-picks bar is pinned to the bottom.' } },
  { id: 'perks', expect: '#panel-perks:not([hidden]) canvas', group: 'Character', title: 'Perk forest', modules: [U + 'perk-forest.js', U + 'talents.js'], steps: [['panel', 'perks'], ['wait', 700], stagePerks, ['wait', 300]],
    pad: { steps: [['cursor', '#panel-perks canvas', 0.56, 0.44]] },
    notes: { all: 'The perk forest with three picks staged (blue): nothing is spent until Accept (T28). The forest and the character’s taken perks are real.',
      phone: 'The graph is the whole screen: drag to look around, pinch to zoom (it already supported pinch). The bar with Undo · Redo · Cancel · Accept is pinned to the bottom, each button 48 px, so the thumb that staged a perk can accept it. The search box and the arm chips scroll sideways in one row; the long help paragraph is gone (hold a node for its card).',
      pad: 'A canvas cannot be stepped through, so the ring becomes a POINTER you steer with the left stick: A stages the perk under it, X hands one back, LT / RT zoom, the right stick pans. D-pad leaves the canvas for the buttons (Undo / Redo / Accept).' } },

  // ------------------------------------------------------------------------------------------------ Windows
  { id: 'map', expect: '#panel-map:not([hidden]) canvas', group: 'Windows', title: 'World map', modules: [U + 'worldmap.js', U + 'map-render.js', U + 'map-image-worker.js', U + 'atlas.js', U + 'map-tools.js', U + 'hidden-events.js', U + 'pt8-core.js'], steps: [['panel', 'map'], ['wait', 1500]],
    pad: { steps: [['cursor', '#panel-map canvas', 0.5, 0.5]] },
    notes: { all: 'The world map: the province with what you have discovered, waystones, quest and event markers, your party. Recorded map data; the fog of war is the character’s own.',
      phone: 'The map fills the sheet: drag pans, pinch zooms, hold drops a pin (the desktop’s right-click). The preset and layer buttons scroll in one row above it. “Hide list” in the title bar folds the quest / event / waystone list away so the map gets the whole screen.', pad: 'The steered pointer again: A selects what is under it (a waystone to travel to), X drops a pin, LT / RT zoom, right stick pans.' } },
  { id: 'journal', expect: '#panel-journal:not([hidden])', group: 'Windows', title: 'Journal — quests', modules: [U + 'journal.js'], steps: [['panel', 'journal'], ['wait', 300]],
    notes: { all: 'The quests you carry, the steps of the chosen one, rewards, track / abandon.', phone: 'List above, the chosen quest below (upright); list left, quest right (on its side).', pad: 'LB / RB change the tab (Quests · Done · Catch).' } },
  { id: 'shop', expect: '#panel-shop:not([hidden])', group: 'Windows', title: 'Shop', modules: [U + 'shop.js', U + 'item-cell.js'], steps: [['near', '@shop'], ['call', 'tvui2.openShop', '@shop', 'Hal Fletchard'], ['wait', 600], ['icons']],
    phone: { steps: [['touch', 'shop']] },
    notes: { all: 'A merchant’s wares, your bag to sell from, and buy-back. Recorded from a real merchant in the starter town.', phone: 'Each row is one 52 px tap target. A tap opens the item’s card as a sheet — with the comparison against what you are wearing — and one big “Buy for N gold” button, so nothing is bought by a stray thumb. (In the game the same compare card on the desktop shop is D-UI’s half.)' } },
  { id: 'settings', expect: '#panel-settings:not([hidden]) .set-row', group: 'Windows', title: 'Settings', modules: [U + 'settings.js', U + 'pt2-core.js'], steps: [['settings', 'game']],
    notes: { all: 'Esc opens the menu; Settings has Game, Graphics, Sound and Key bindings tabs.', phone: 'Sliders and checkboxes are 44 px rows.', pad: 'LB / RB switch tabs; left / right moves a slider.' } },
  { id: 'settings-keys', expect: '#panel-settings:not([hidden]) .bind-row, #panel-settings:not([hidden]) .ctl-ref', group: 'Windows', title: 'Settings — key bindings', modules: ['js/client/input/bindings-ui.js', 'js/client/input/bindings.js'], steps: [['settings', 'keys']],
    pad: { steps: [['click', '#panel-settings [data-bind="pad"]']] }, phone: { steps: [['click', '#panel-settings [data-bind="touch"]']] },
    notes: { all: 'New (T27): keys can be changed. Click a key, press the new one; a key already in use swaps places. The Controller tab picks the button names (automatic / Xbox / PlayStation / generic) and lists every button; the Touch tab lists the phone controls. All three lists are generated from one table (js/client/input/bindings.js).' } },
  { id: 'pause', expect: '#panel-pause:not([hidden])', group: 'Windows', title: 'Pause menu', modules: [U + 'settings.js'], steps: [['call', 'tvui2.pauseMenu']],
    notes: { all: 'Resume · Settings · Help · Log out. The world keeps going.', pad: 'Menu (Start) opens it from anywhere.' } },
  { id: 'help', expect: '#panel-help:not([hidden]) dl', group: 'Windows', title: 'Help — controls', modules: ['js/client/help.js'], steps: [['panel', 'help']],
    notes: { all: 'F1: the controls list. It is now drawn from the binding table, so it shows your own keys — or the controller’s buttons when that is what you last touched.' } },
  { id: 'feedback', expect: '#panel-feedback:not([hidden]) textarea', group: 'Windows', title: 'Feedback form', modules: [U + 'feedback.js'], steps: [['call', 'tvui5.feedback', 'bug']],
    notes: { all: 'T19: a suggestion or a bug report, with what gets attached written out.', pad: 'The text box opens the on-screen keyboard.' } },
  { id: 'reports', expect: '#panel-reports:not([hidden])', group: 'Windows', title: 'Admin — reports', modules: [U + 'feedback.js'], steps: [['admin'], ['call', 'tvui5.reports'], ['play', 'admin-reports'], ['click', '#panel-reports .rp-row']],
    notes: { all: 'T21: what an admin account sees — every report with its state, the client details and the recent log lines.' } },
  // ---- play-test 9 (stream D-UI) ----
  { id: 'online', expect: '#panel-online:not([hidden]) .on-table tbody tr', group: 'Windows', title: 'Admin — online players', modules: [U + 'online-window.js', U + 'pt9-core.js'],
    steps: [['admin'], ['call', 'tvui8.online'], ['play', 'admin-online'], ['wait', 200]],
    notes: { all: 'X1: what an admin account sees — everyone in the world now with level, class and where they are; Refresh asks again, a column heading sorts.', phone: 'A sheet; the class column gives way to the name, level and place.', pad: 'The ring reaches the column headings and Refresh.' } },
  { id: 'title-delete', expect: '.char-delete input', group: 'Start', title: 'Title — delete a character', stage: 'title', step: 'front', modules: ['js/client/account.js', U + 'pt9-core.js'],
    steps: [['wait', 900], ['click', '#char-chips .char-del'], ['wait', 150]],      // (the wait: input/touch.js swallows any click in a page's first 700 ms — its `swallow` clock starts at 0)
    notes: { all: 'X6: every character has a Delete button; the confirm asks you to type its name and says what goes with it. The list scrolls, and the line under it says how many of the account\'s characters are used.', phone: 'The confirm is a centred card; its buttons are thumb-sized.' } },
  // ---- play-test 8 (stream D-UI) ----
  { id: 'my-reports', expect: '#panel-feedback:not([hidden]) .my-row', group: 'Windows', title: 'Feedback — My reports', modules: [U + 'feedback.js', U + 'pt8-core.js'],
    steps: [['run', async G => { const n = G.S.net; try { n.claimed = true; } catch { /* read-only */ } if (n.joined?.you) n.joined.you.acct = { claimed: true, level: n.joined.you.level || 1 }; }], ['call', 'tvui5.feedback', 'mine'], ['wait', 300], ['play', 'my-reports'], ['wait', 200]],
    notes: { all: 'W29: everything your account has sent, its state, and the team\'s note — for a completed one, how it was fixed. Reply starts a new report that begins with the reference.', phone: 'A full sheet; each report is a card with a Reply button of thumb size.', pad: 'The ring walks the cards; A on Reply opens the form with the reference filled in.' } },
  { id: 'cart', expect: '#panel-cart:not([hidden]) .cart-row.picked', group: 'Windows', title: 'Ox cart — where to?', modules: [U + 'cart-travel.js', U + 'pt8.js', U + 'pt8-core.js'],
    steps: [['play', 'cart-list'], ['click', '#panel-cart .cart-row:not(.locked) [data-act="pick"]'], ['wait', 150]],
    notes: { all: 'W5: paid rides between towns. Every stop with its fare, the road distance and the ride time; a stop you may not ride to says why. Picking one asks once more before the gold goes.', phone: 'Rows wrap: the confirm buttons drop under the name.', pad: 'A picks, A again pays; B backs out.' } },
  { id: 'meter', expect: '#panel-meter:not([hidden]) .meter-row', group: 'Windows', title: 'Damage meter', modules: [U + 'meter-window.js', U + 'pt8.js', U + 'pt8-core.js'],
    steps: [['target', 'enemy'], ['play', 'hurt-party'], ['call', 'tvui8.meter', true], ['play', 'meter-hits'], ['wait', 700]],
    notes: { all: 'W21: the playground\'s damage meter in a window — Settings, Game, "Damage meter" (off by default). Bars for you, your pets and party members near you; click a bar for its skills, a skill for every hit.', phone: 'A sheet; bars are a thumb high.', pad: 'The ring walks the bars; A drills in, B comes back out.' } },
  { id: 'map-find', expect: '#panel-map:not([hidden]) .map-found', group: 'Windows', title: 'Map — find a shop or service', modules: [U + 'map-tools.js', U + 'worldmap.js', U + 'pt8-core.js'],
    steps: [['panel', 'map'], ['wait', 1500], ['run', async G => { const W = G.ui.worldMap; await W.find.load(); W.fitPreset('province'); W.find.set({ role: 'stablehand' }); }], ['wait', 700]],
    notes: { all: 'W15: a filter and a search over every shop and service. Zoomed out, the towns that have one are ringed and the rest fade; the list beside the map is nearest first. The map also opens where you left it.', phone: 'The filter and the search box sit in the top strip, which scrolls sideways.', pad: 'The ring reaches the filter; the list\'s Show buttons move the map.' } },
  { id: 'event-hidden', expect: '.et-hidden:not([hidden])', group: 'In the world', title: 'HUD — an event you hid', only: ['desktop', 'laptop', 'pad'],      /* the phone layout keeps the whole event column behind its HUD-info toggle (flagged to G last round) */ modules: [U + 'hidden-events.js', U + 'event-tracker.js', U + 'pt8.js'],
    steps: [['play', 'event-far'], ['wait', 300], ['call', 'tvui8.hide', { uid: 'e78', id: 'stone_snow', name: 'The Stone in the Snow' }], ['wait', 300]],      // (the same set the card's crossed-eye button writes; the card itself sits behind the HUD-info toggle on a phone)
    notes: { all: 'W13: the crossed eye on an event\'s card takes it off your screen — the card, the minimap pin and its arrow. One line stays to bring it back; the map\'s Events list does the same.', phone: 'The event cards live behind the HUD-info toggle on a phone; the line is there with them.' } },
  // ---- play-test 10 (stream D-UI) ----
  { id: 'title-loading', expect: '#front[data-state="loading"] .front-state.busy', group: 'Start', title: 'Title — finding your characters', stage: 'title', step: 'front-loading', modules: [U + 'title-front.js', U + 'pt10-core.js', 'index.html'],
    notes: { all: 'Y29: what a returning player sees for the moment before the character list arrives — one line and nothing to click. The new-character form no longer shows through.', phone: 'The same card, full width.' } },
  { id: 'title-empty', expect: '#front[data-state="empty"] #new-char:not([hidden])', group: 'Start', title: 'Title — no characters yet', stage: 'title', step: 'front-empty', modules: [U + 'title-front.js', U + 'pt10-core.js'],
    notes: { all: 'Y29: a new visitor (or an account with nobody on it) gets one button, "Create character" — the form opens when it is pressed, never by itself.', phone: 'The button is the full width of the card.' } },
  { id: 'title-calling', expect: '#class-card:not([hidden]) .cc-sig', group: 'Start', title: 'Title — the calling\'s card (Starcaller)', stage: 'title', step: 'new', modules: [U + 'class-card.js', 'index.html'],
    steps: [['wait', 900], ['run', async () => { const m = document.getElementById('class-more'); m.value = 'starcaller'; m.dispatchEvent(new Event('change')); }], ['wait', 200]],
    notes: { all: 'Y32: under the callings, a card for the one picked — its role, what it wears and runs on, its hook and its signature mechanic, in the class data\'s own words. Shown: the Starcaller, the calling that exists only in Thousandvale.', phone: 'The card is part of the scrolling form.' } },
  { id: 'title-calling-starblade', expect: '#class-card:not([hidden]) .cc-emblem', group: 'Start', title: 'Title — the calling\'s card (Star Blade)', stage: 'title', step: 'new', modules: [U + 'class-card.js', 'index.html'],
    steps: [['wait', 900], ['run', async () => { const m = document.getElementById('class-more'); m.value = 'starblade'; m.dispatchEvent(new Event('change')); }], ['wait', 200]],
    notes: { all: 'Play-test 11 (#53): the Star Blade, the Starcaller\'s melee partner — plate, swords, Starlight spent on a star shield that strikes back and on holding a crowd. The emblem at the top right is the calling\'s own ground sigil (every calling has one).', phone: 'The card is part of the scrolling form.' } },
  { id: 'changelog', expect: '.tv-changelog:not([hidden]) .cl-entry', group: 'Start', title: 'Changelog — what is new', stage: 'title', step: 'front', modules: [U + 'changelog.js', U + 'pt10.js', U + 'pt10-core.js'],
    steps: [['wait', 900], ['run', async () => { window.tvui10.changelog.open(); }], ['wait', 600]],
    notes: { all: 'Y30: every update, newest first; the ones you have not read are marked New. Opened from "What\'s new" on the title, the pause menu, or the popup that appears on the title after an update.', phone: 'A full-screen sheet that scrolls.', pad: 'B closes it; the right stick scrolls.' } },
  { id: 'changelog-popup', expect: '.tv-updated:not([hidden])', group: 'Start', title: 'Title — "The game was updated"', stage: 'title', step: 'front', modules: [U + 'changelog.js'],
    steps: [['wait', 900], ['run', async () => { const c = window.tvui10.changelog; await c.check(); try { localStorage.setItem('tv.changelog.seen', '2026-10-06'); } catch { /* in-memory storage */ } c.wire({ changelog: { latest: '2026-10-08', seen: '2026-10-06' }, on() {} }); await c.check(); }], ['wait', 300]],
    notes: { all: 'Y30: on the title after an update, a card in the corner says how many updates there have been since you last played, with a button to read them. A brand-new player never sees it.', phone: 'Top of the screen, under the island.' } },
  { id: 'map-party', expect: '#panel-map:not([hidden]) .map-party .map-person', group: 'Windows', title: 'Map — Locate player, the Party list, tracking', modules: [U + 'worldmap.js', U + 'pt10.js', U + 'pt10-core.js', 'js/client/friends.js'],
    steps: [['play', 'hurt-party'], ['panel', 'map'], ['wait', 1500], ['run', async G => { const P = window.tvui10.people().find(p => !p.self && p.placed) || window.tvui10.people().find(p => !p.self); if (P && !window.tvui10.isTracked(P.char)) window.tvui10.track(P.char, P.name, 'party'); G.ui.worldMap.fitPreset('region'); if (P && P.placed) G.ui.worldMap.pointAt(P.x + 9000, P.z); }], ['wait', 700]],
    notes: { all: 'Y28 + Y36: "Locate player" sits at the top-left and centres the map on you. The Party section lists everyone, yourself first, each with Show (zoom to them) and Track. Pointing at a row whose target is off the map draws an arrow on the map\'s edge towards it. A tracked person also gets an arrow at the edge of the game screen, with the distance, until you are near.', phone: 'The side lists sit under the map; the buttons are thumb-sized.', pad: 'The ring reaches Locate player and the list\'s buttons.' } },
  { id: 'emote-wheel', expect: '.tv-radial:not([hidden]) [data-id="emote:wave"]', group: 'In the world', title: 'Quick wheel — emotes', only: ['pad', 'phone-l', 'phone-p'], modules: [U + 'pt10.js', 'js/client/input/radial.js'],
    steps: [['run', async () => { window.gallery.input.radial.open({ ring: 2, hold: false }); }], ['wait', 200]],
    notes: { all: 'Y5: the wheel\'s third ring — wave, sit, dance, cheer, bow, point. The same six as /wave /sit /dance … in chat.', phone: 'Tap the wheel\'s middle to step from Windows to Do to Emotes.', pad: 'Hold LB, press RB to step the rings, point and let go.' } },
  { id: 'account', expect: '#panel-account:not([hidden])', group: 'Windows', title: 'Account', modules: ['js/client/account.js'], steps: [['panel', 'account']],
    notes: { all: 'Claim a guest account (free), or see the one you are logged into.' } },

  // ------------------------------------------------------------------------------------------------ Social
  { id: 'party', expect: '#panel-partyhub:not([hidden])', group: 'Social', title: 'Party menu', modules: [U + 'party-hub.js', 'js/client/social.js'], steps: [['hub', 'party']],
    notes: { all: 'The Party menu’s first tab: your party, invite by name, the join link, the loot threshold.', phone: 'The Social tab of the tab bar; its own tabs (Party · Friends · Guild · Mail · Group Finder) scroll in one row.', pad: 'LB / RB step through the five tabs.' } },
  { id: 'friends', expect: '#panel-partyhub:not([hidden])', group: 'Social', title: 'Friends', modules: ['js/client/friends.js'], steps: [['hub', 'friends']],
    notes: { all: 'Friends with portraits, who is online and where.' } },
  { id: 'guild', expect: '#panel-partyhub:not([hidden])', group: 'Social', title: 'Guild', modules: ['js/client/guild.js'], steps: [['hub', 'guild']],
    notes: { all: 'The guild tab (this character is in none: found one, or wait for an invite).' } },
  { id: 'mail', expect: '#panel-partyhub:not([hidden]) .ml-row', group: 'Social', title: 'Mail with a gift', modules: ['js/client/mail.js', U + 'reveal.js'], steps: [['hub', 'mail'], ['play', 'mail-gift'], ['wait', 300]],
    notes: { all: 'T20: a letter with a gift box attached — taking it unwraps it. Two older letters under it.', phone: 'List above, letter below; “Take” is a full-width 48 px button.' } },
  { id: 'market', expect: '#panel-partyhub:not([hidden]) .mk-row', group: 'Social', title: 'Market: browse', modules: [U + 'market.js'], steps: [['hub', 'market'], marketFill, ['icons']],
    notes: { all: 'Round 11 (#25): the player market in the party window — search, Equipment / Materials and items, a slot or kind, a sort; each row is the item (card on hover), the seller, the days left and the price (the price each for a stack). Your own rows say Yours.', phone: 'The bars wrap; every row and its Buy button is thumb-sized.', pad: 'The ring on a row shows the item card; A presses Buy.' } },
  { id: 'market-sell', expect: '#panel-partyhub:not([hidden]) .mk-form', group: 'Social', title: 'Market: sell', modules: [U + 'market.js'], steps: [['hub', 'market'], marketFill, ['click', '.mk-view[data-view="sell"]'], ['click', '.mk-grid .islot'], ['icons']],
    notes: { all: 'Round 11 (#25): pick a bag item, ask a price; the fee (20% of what a shop pays, the server\'s quote) is shown before you confirm. Kept things, quest items and boxes never appear here.' } },
  { id: 'callboard', expect: '#panel-partyhub:not([hidden])', group: 'Social', title: 'Group Finder', modules: ['js/client/callboard.js'], steps: [['hub', 'callboard']],
    notes: { all: 'Queue for a dungeon as tank, healer or damage.' } },
  { id: 'chat', expect: '#chat-log p', group: 'Social', title: 'Chat', modules: ['js/client/chat.js'], steps: [...chat, ['focus', '#chat-input']],
    phone: { steps: [['touch', 'chat']] }, pad: { steps: [['osk', '#chat-input']] },
    notes: { all: 'The chat window with its channel tabs.', phone: 'Folded to a bubble while you fight (with an unread count). Opened, it is a panel down the left (on its side) or the lower half (upright); the game controls step aside while you type.', pad: 'Chat is in the quick wheel; it opens the on-screen keyboard.' } },
  { id: 'inspect', expect: '#panel-inspect:not([hidden])', group: 'Social', title: 'Inspecting a player', modules: [U + 'context-menu.js'], steps: [['target', 'ally'], ['inspect', '@ally'], ['wait', 600]],
    notes: { all: 'What another player is wearing.' } },

  // ------------------------------------------------------------------------------------------------ Loot and trade
  { id: 'loot', expect: '#panel-loot:not([hidden]) .loot-row', group: 'Loot and trade', title: 'Loot window', modules: [U + 'loot.js'], steps: [['target', 'enemy'], ['near', '@enemy'], ['push', 'game', { t: 'lootable', id: '@enemy', on: true, best: 'rare' }], ['call', 'tvui2.openLoot', '@enemy'], ['play', 'loot'], ['wait', 500]],
    notes: { all: 'A body’s loot: gold, a junk item, a magic one, and a rare one the party will roll for.', phone: 'A sheet with 52 px rows and a full-width “Take all”.', pad: 'A takes the row, Menu takes all.' } },
  { id: 'loot-roll', expect: '.roll-card', group: 'Loot and trade', title: 'Need / Greed / Skip', modules: [U + 'loot.js'], steps: [...fight, ['play', 'loot-roll'], ['wait', 300]],
    notes: { all: 'The roll card with its timer.', phone: 'Top right under the minimap; the three buttons share the card’s width, 44 px tall.' } },
  { id: 'trade', expect: '#panel-trade:not([hidden])', group: 'Loot and trade', title: 'Trade', modules: [U + 'trade.js'], steps: [['near', '@ally'], ['play', 'trade'], ['wait', 500], ['icons']],
    notes: { all: 'A trade with a party member: both sides, gold, lock, confirm. Recorded from a real trade between two clients.' } },

  // ------------------------------------------------------------------------------------------------ Angling
  { id: 'fish-bite', expect: '.tv-fish[data-state="bite"]', group: 'Angling', title: 'Angling — a bite', modules: [U + 'angling.js'], steps: [['play', 'rod'], ['play', 'fish-bite'], ['wait', 300]],
    notes: { all: 'T25: the float dips — press in time.', phone: 'The Attack button turns into a big blue Hook! button (84 px) for as long as the bite lasts: the thumb is already there.', pad: 'A hooks (A means “what the screen is asking for”: hook > use > jump).' } },
  { id: 'fish-tug', expect: '.fish-tug', group: 'Angling', title: 'Angling — the tug', modules: [U + 'angling.js'], steps: [['play', 'rod'], ['play', 'fish-tug'], ['wait', 600]],
    notes: { all: 'Hold to pull the float up, let go to let it sink; keep it in the green band.', phone: 'Hold the Reel button.', pad: 'Hold A.' } },
  { id: 'fish-catch', expect: '.tv-fish:not([hidden])', group: 'Angling', title: 'Angling — a catch', modules: [U + 'angling.js'], steps: [['play', 'rod'], ['play', 'fish-tug'], ['play', 'fish-catch'], ['wait', 600]],
    notes: { all: 'A first catch and a personal record.' } },
  { id: 'cook', expect: '#panel-cook:not([hidden]) .ck-row', group: 'Angling', title: 'Cooking at a fire', modules: [U + 'angling.js'], steps: [['play', 'cook'], ['call', 'tvui5.cook'], ['play', 'cook'], ['wait', 300], ['calm']],
    notes: { all: 'Recipes at a campfire or an inn hearth: what each needs and why one cannot be made.' } },
  { id: 'journal-catch', expect: '#panel-journal:not([hidden])', group: 'Angling', title: 'Journal — the Catch tab', modules: [U + 'journal.js'], steps: [['call', 'tvui5.catchTab'], ['wait', 400]],
    notes: { all: 'Species found per zone, biggest size, legend trophies.' } },

  // ------------------------------------------------------------------------------------------------ Controller
  { id: 'pad-wheel', expect: '.tv-radial:not([hidden]) .rd-slice', group: 'Controller', title: 'Quick wheel', only: ['pad', 'phone-l', 'phone-p'], modules: ['js/client/input/radial.js'], steps: [...fight, ['wheel', 'bag']],
    notes: { all: 'Every window in one hold.', pad: 'A controller has no M, J, B, V, K, N, P keys, and sixteen buttons are not enough for nine windows. Hold LB: the wheel opens, point with either stick, let go to open what you pointed at. RB (while it is open) flips to the second ring: Mount, Fish, Camp, Map, Help. B cancels.',
      phone: 'The wheel button (gold ring, top right): tap it and tap a slice, or hold it, slide to a slice and let go. It is how you reach every window and the things that have no button (mount, camp, cast a line).' } },
  { id: 'pad-focus', expect: '.pad-ring:not([hidden])', group: 'Controller', title: 'Focus ring in a window', only: ['pad'], modules: ['js/client/input/focus.js', 'js/client/input/gamepad.js'], steps: [['panel', 'bag'], ['icons'], ['ring', '#bag-grid .islot:not(.empty)']],
    notes: { pad: 'In any window the pad drives a focus ring: D-pad or left stick jumps to the nearest control in that direction (it works on every window with no per-window code), A presses it, B backs out, X is the “other” click (what right-click does), Y shows its card, LB / RB step through the window’s tabs, the right stick scrolls.' } },
  { id: 'pad-osk', expect: '.tv-osk:not([hidden]) .osk-key', group: 'Controller', title: 'On-screen keyboard', only: ['pad'], modules: ['js/client/input/osk.js'], steps: [...chat, ['osk', '#chat-input']],
    notes: { pad: 'Text only where it cannot be avoided (chat, a name, a search box): pressing A on a text box opens this. A types, X deletes, Y is a space, the stick click is capitals, Menu sends, B closes.' } },
  { id: 'pad-mod', expect: '#actionbar', group: 'Controller', title: 'Second set (hold LT)', only: ['pad'], modules: ['js/client/input/gamepad.js'], steps: [...fight, ['attr', 'html', 'data-pad-mod', '1']],
    notes: { pad: 'While LT / L2 is held the action bar shows which slots the face buttons now fire: skills 5 and 6 on Y and B, the four potion slots on the D-pad, mount on X, cast a line on A, camp on RB.' } },

  // ------------------------------------------------------------------------------------------------ Phone
  { id: 'phone-belt', proposedOnly: true, expect: '.tv-radial:not([hidden]) .rd-slice', group: 'Phone', title: 'The belt (hold)', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js'], steps: [...fight, ['touch', 'belt']],
    notes: { phone: 'Potions and food: TAP the red-ringed Belt button to drink the first slot (the one you want in a hurry); HOLD it and the four slots fan out under your thumb — slide to one and let go. Why not four more buttons: the fight screen already has twelve.' } },
  { id: 'phone-compact', proposedOnly: true, expect: '.ph-info.on', group: 'Phone', title: 'HUD — party as portraits, quests and events opened', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js'], steps: [...fight, ['play', 'event-live'], ['target', 'ally'], ['touch', 'party'], ['touch', 'info']],
    notes: { phone: 'Two toggles that buy back screen:\n• The three-heads button shrinks the party to round portraits. The ring round each is two gauges: health climbs the LEFT half (green), mana the RIGHT half (blue). The member you have targeted wears a gold ring and a diamond mark — your heals go there. Tap a portrait to target, exactly like the full rows.\n• The scroll button (with a count) is the ONE home of quests and events. Closed, the fight screen carries no quest text at all. Open, the minimap grows to a readable size and the event and tracked quests are listed in full beside it; tap it again to put them away.' } },
  { id: 'phone-sheet', proposedOnly: true, expect: '.phone-tabs .pt-tab', group: 'Phone', title: 'A window as a sheet (tab bar)', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js'], steps: [['panel', 'journal'], ['wait', 300]],
    notes: { phone: 'Every window is a full-screen sheet instead of a floating box: no dragging, no overlap. One tab bar moves between the seven you use most; Close goes back to the world. The fight controls are hidden while a sheet is open so a stray thumb cannot cast.' } },

  // play-test 10 (G2)
  { id: 'phone-buttons', proposedOnly: true, expect: '.ph-explain:not([hidden]) .ph-ex-card li', group: 'Phone', title: 'What do these buttons do?', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js', 'js/client/input/bindings.js'], steps: [...fight, ['touch', 'fish'], ['wait', 500], ['touch', 'explain']],
    notes: { phone: 'Owner feedback 10 (Y34): a bottle-shaped button was taken for “drink” when it was casting a fishing line. Three answers, all generated from ONE table (TOUCH_CONTROLS in input/bindings.js):\n• Pause menu > “What do these buttons do?” puts a number on every control that is on screen and lists them by name.\n• Hold any button for a moment and it says its name.\n• Mount and Fish are buttons of their own now, a different shape from the round fight buttons, with their names on them. The Belt shows the picture of what a tap will really use, and never a tool.' } },
  { id: 'phone-fish', proposedOnly: true, expect: '.ph-hint:not([hidden]) li', group: 'Phone', title: 'Fishing by touch — the first-time hint', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js', 'js/client/input/water-reach.js'], steps: [...fight, ['touch', 'fishhint']],
    notes: { phone: 'Shown once per character: the first time water is in casting range with a rod in the bag, after talking to an angler, or on the first tap of Fish. The Fish button is blue and lit only when a cast would land (the server’s own rule, checked on the phone); away from water it is dim and a tap says “No water in reach”.' } },
  { id: 'phone-label', proposedOnly: true, expect: '.ph-label:not([hidden]) b', group: 'Phone', title: 'Hold a button: its name', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js'], steps: [...fight, ['touch', 'label', 'attack']],
    notes: { phone: 'A long press on any control shows what it is called and one sentence about it; letting go does NOT press it. (Skills keep their full card on a hold; the Belt and the wheel open their wheels.) Here: Attack — one tap keeps attacking, a second stops; the ring is lit while it is on.' } },
  { id: 'phone-track', proposedOnly: true, expect: '.phone-sheet:not([hidden]) .ps-plain', group: 'Phone', title: 'Hold a party portrait: Track', only: ['phone-l', 'phone-p'], modules: ['js/client/input/touch.js', 'js/client/input/party-arrows.js'], steps: [...fight, ['touch', 'party'], ['touch', 'track']],
    notes: { phone: 'Owner feedback 10 (Y36, “I had difficulty locating my friends”): hold a party member’s portrait for where they are and a Track button — a blue named arrow at the edge of the screen then leads you to them. Without tracking, every party member who is off the screen still gets a small green arrow with their initial and the distance.' } },
  { id: 'prof-ready', expect: '.tv-prof[data-state="ready"] .prof-ready', group: 'Professions', title: 'A mini-game waits for you (ready)', modules: ['js/client/ui/prof-minigame.js'], steps: [['call', 'tvprof.ready', 'skinning', { seed: 4 }], ['wait', 400]],
    notes: { all: 'Owner feedback 10 (Y19, “I do not know where to put the mouse before it begins”): every mini-game opens like this — the picture at its first moment and nothing moving. The first key, click or touch starts the clock (and is not counted as a move); after six seconds it starts by itself. Starting any of these also lets go of whatever key or stick was moving you (Y1).', phone: 'Put a finger on the knife and it begins under your finger.', pad: 'The work button (A) begins it.' } },

  // ------------------------------------------------------------------------------------------------ Reference
  { id: 'controls', expect: '.ctl-three .ctl-ref', group: 'Reference', title: 'Controls — all three devices', modules: ['js/client/input/bindings.js', 'js/client/input/bindings-ui.js'], steps: [['controls']],
    notes: { all: 'The whole binding table, three ways: keyboard and mouse, controller (with its glyphs), touch. This page is GENERATED from js/client/input/bindings.js — the same table the game’s input, the settings tab, the help window and every on-screen hint read — so it cannot be wrong without the game being wrong too.' } },
  // ------------------------------------------------------------------------------------------------ Professions (W9, P-client)
  ...PROF_SCENES,
];

export const sceneById = id => SCENES.find(s => s.id === id) || null;

/** Modules under js/client/ui/ that have no screen of their own, and why (the coverage test reads this). */
export const NO_SCREEN = {
  'js/client/ui/painted-portraits.js': 'a helper of portraits.js: picks the painted portrait for a monster or townsfolk (graphics pass 2026-10-16) — seen in the target frame',      // G-PROPS
  'js/client/ui/net2.js': 'only sends messages (no markup)',
  'js/client/ui/svg-portrait.js': 'a helper of portraits.js — seen wherever a portrait is (Title — your characters, the HUD frames)',
  'js/client/ui/portrait-mode.js': 'a rule of portraits.js: where the live 3D portrait may be used (play-test 10, Y33) — no markup',
  'js/client/ui/keep-scroll.js': 'keeps every list\'s scroll position through a redraw (Y27) — no markup of its own; tests/D/pt10.spec.js exercises it',
  'js/client/ui/skill-icons.js': 'Shared Icon Library: 186 spell pictures for every class, on the action bar and in the Skills window',
  'js/client/ui/class-res.js': 'the class resource pips on your frame (Y32) — drawn only when the server reports a resource; see docs/requests.md',
};

/** The frames. `w`/`h` in CSS px; `safe` = the iPhone 15 Pro's insets in that orientation. */
export const DEVICES = [
  { id: 'desktop', label: 'Desktop 1920 × 1080', w: 1920, h: 1080 },
  { id: 'laptop', label: 'Laptop 1366 × 768', w: 1366, h: 768 },
  { id: 'phone-l', label: 'iPhone 15 Pro — on its side', w: 852, h: 393, phone: true, safe: { top: 0, right: 59, bottom: 21, left: 59 } },
  { id: 'phone-p', label: 'iPhone 15 Pro — upright', w: 393, h: 852, phone: true, safe: { top: 59, right: 0, bottom: 34, left: 0 } },
  { id: 'pad', label: 'Controller (desktop frame)', w: 1366, h: 768, pad: true },
];
export const deviceById = id => DEVICES.find(d => d.id === id) || DEVICES[0];
/** Is a scene meant for a frame? */
export const sceneFits = (s, deviceId) => !s.only || s.only.includes(deviceId);

/**
 * Windows that landed AFTER the gallery's last pass and still need a scene of their own (play-test 8, stream D-UI).
 * This is a to-do list, not an exemption: tests/G/gallery.test.js prints it on every run, and the lead's audit reads it.
 */
export const PENDING_SCENES = {
  'js/client/ui/ship-travel.js': 'Expansion 1 (2026-10-14): the Harbourmaster window needs a recorded `ship` fixture from a two-province server; until then tests/V/voyage.spec.js opens it on a real server and screenshots it (tests/V/shots/v2-harbour-window.png).',
};
