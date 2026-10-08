// UI gallery — the profession scenes (play-test 8, W9 — stream P-client). DATA (PROF_SCENES, spread into scenes.js) and
// the one verb they use (`prof`, wired in stage.js). Every server message a scene plays was recorded from the real
// server by tests/P/client-fixtures.mjs into fixtures/professions.json; the mini-game patterns are made by the same
// `makeGame` the server uses, from data/rules/professions.json.

const U = 'js/client/ui/';
const GAME_MODS = [U + 'prof-minigame.js', U + 'prof-games.js', U + 'prof-draw.js', U + 'prof.js', U + 'prof-icons.js'];
const PAD = 'A is the work button, X / B (or the D-pad) are left and right; the stick does not walk you away while a game is up.';

/** [type, title, what it is, the phone note, where to stop the picture: how many flawless inputs are already in] */
const GAMES = [
  ['mining', 'strike', 'Mining — strike the vein', 'A marker sweeps the bar; strike as it crosses the bright spot. Three strikes, the spot moves each time. The boulder cracks with every good one.', 'Tap anywhere on the panel. The whole canvas is the button.', 1],
  ['logging', 'rhythm', 'Logging — chop in rhythm', 'Marks slide in from the left and the right; chop that side as each reaches the trunk. The wrong side bites bark and counts for nothing.', 'Tap the left or the right half — one thumb reaches both.', 2],
  ['foraging', 'pick', 'Foraging — pick them ripe', 'Six buds; three of them open one after another and close again. Pick each while it is open (the ring is its time running out); a shut one is bruised and costs a mark.', 'Tap the bud itself.', 1],
  ['skinning', 'trace', 'Skinning — follow the cut', 'The knife runs along the line by itself; you keep it ON the line. Twelve points of the cut are scored.', 'Slide a finger up and down anywhere on the panel.', 5],
  ['smithing', 'forge', 'Smithing — strike while it glows', 'The bar cools through a glowing band: hammer while the heat is inside it (the gold strip is a perfect blow). When it is cold, put it back in the fire — that costs time.', 'Tap the anvil to hammer, tap the fire on the left to re-heat.', 1],
  ['outfitting', 'stitch', 'Outfitting — stitch the seam', 'The needle runs along the seam; press as it crosses each mark. The marks are not evenly spaced.', 'Tap anywhere.', 2],
  ['alchemy', 'pour', 'Alchemy — stop at the mark', 'The flask fills by itself, faster and faster: stop it at the gold line. Then the second one. Over the top is spilled.', 'Tap anywhere to stop the pour.', 1],
  ['tempering', 'gauge', 'Tempering — stop it in the band', 'The gauge climbs toward a band that keeps narrowing. Stop it inside (the gold line is perfect). Past the band the materials are lost — the item never is.', 'One tap.', 0],
];

export const PROF_SCENES = [
  ...GAMES.map(([prof, type, title, what, phone, n]) => ({ id: 'prof-' + type, group: 'Professions', title, modules: GAME_MODS, expect: `.tv-prof[data-type="${type}"] .prof-canvas`,
    steps: [['prof', 'game', prof, { inputs: n }], ['calm']],
    notes: { all: `${what} A few seconds, then a card: Botched / Rough / Sound / Fine / Perfect. The pattern and the scoring are the server's; the client only reports when you pressed.`, phone: `${phone} The panel sits at the bottom of the screen upright, and under the right thumb on its side.`, pad: PAD } })),
  { id: 'prof-result', group: 'Professions', title: 'Mini-game — the result card', modules: GAME_MODS, expect: '.prof-card[data-q]', steps: [['prof', 'result', 'mining'], ['calm']],
    notes: { all: 'The card comes up the moment the last input is in, with what your own machine scored; the server’s answer fills in what you got, the skill gained and when the node is back. Here: the recorded answer to a flawless first boulder.', phone: 'Tap the card (or wait three seconds) to put it away.', pad: 'A puts it away.' } },
  { id: 'prof-trainer', group: 'Professions', title: 'A craftsman — learn a trade', modules: [U + 'prof.js'], expect: '#panel-trade:not([hidden]) .tr-row', steps: [['prof', 'trainer'], ['calm']],
    notes: { all: 'Talking to a craftsman who teaches: what he teaches (free), the tool again for gold if you lost it, and his station. The smith of Torborhold, recorded.', phone: 'A sheet; every button is 44 px.', pad: 'Up / down between rows, A presses.' } },
  { id: 'prof-npc', group: 'Professions', title: 'A craftsman — the doors in his dialog', modules: [U + 'prof.js'], expect: '.tv-dialog .prof-dlg', steps: [['prof', 'trainer', null, { dialog: true }], ['calm']],
    notes: { all: 'A craftsman usually has work on offer and a shop as well. His own dialog gains two buttons: Learn (what he teaches that you do not know yet) and Use the forge.', phone: 'The buttons are in the dialog’s own footer row.' } },
  { id: 'prof-craft', group: 'Professions', title: 'Crafting — the forge', modules: [U + 'prof-craft.js', U + 'prof.js'], expect: '#panel-craft:not([hidden]) .pc-row', steps: [['prof', 'craft', 'smithing'], ['calm']],
    notes: { all: 'One window for every station. A tab per craft the station serves; each recipe says what it makes, what it needs against what you carry, the fee, and — for gear — the pattern you want and what better work gives. The server’s own list, recorded at the smith.', phone: 'A full sheet; the recipe list scrolls; Make is a 44 px button on each row.', pad: 'LB / RB change the craft, up / down the recipe, A makes it.' } },
  { id: 'prof-craft-away', group: 'Professions', title: 'Crafting — away from a station', modules: [U + 'prof-craft.js'], expect: '#panel-craft:not([hidden])', steps: [['prof', 'craft', null, { away: true }], ['calm']],
    notes: { all: 'Opened from the journal with no station in reach: every recipe can be read, none can be made, and each says where to go.' } },
  { id: 'prof-temper', group: 'Professions', title: 'Tempering — an item, a work, the quote', modules: [U + 'prof-craft.js'], expect: '#panel-craft:not([hidden]) .pt-quote', steps: [['prof', 'temper'], ['calm']],
    notes: { all: 'Tempering works on gear in your bag. Pick the work, pick the item; the server quotes what it will cost and what it will do, with the numbers. A miss spends the materials, never the item.', phone: 'Upright the item list sits above the quote; on its side they are two columns.', pad: 'LB / RB to the Tempering tab; A picks.' } },
  { id: 'prof-skills', group: 'Professions', title: 'Journal — the Professions page', modules: [U + 'prof-skills.js', U + 'journal.js'], expect: '#panel-journal:not([hidden]) .pk-row', steps: [['prof', 'skills', 'journal'], ['calm']],
    notes: { all: 'Ten trades with their level, rank, your tool, and what the next band opens — or who teaches the ones you have not learned. "Recipes" opens the crafting window on that craft.', phone: 'A page of the journal sheet.' } },
  { id: 'prof-sheet', group: 'Professions', title: 'Character menu — the Professions block', modules: [U + 'prof-skills.js', U + 'char-sheet.js'], expect: '#panel-sheet:not([hidden]) .pk-row', steps: [['prof', 'skills', 'sheet'], ['calm']],
    notes: { all: 'The same ten, one line each, under the stats of the Character menu. Hover (or hold) a row for the full line.' } },
  { id: 'prof-material', group: 'Professions', title: 'Bag — a crafting material', modules: [U + 'item-card.js'], expect: '.tipbox, .phone-sheet', steps: [['prof', 'material'], ['calm']],
    phone: { steps: [['prof', 'material', { hold: true }]] },
    notes: { all: 'Materials stack in the bag. The card says what it is for, which craft and tier, and what one sells for.', phone: 'Hold a stack for its card.' } },
];

let FX = null;
const fixtures = () => (FX ||= fetch(new URL('./fixtures/professions.json', import.meta.url)).then(r => r.json()));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clone = o => JSON.parse(JSON.stringify(o));

/** The `prof` verb. */
export async function profStep(G, what, a, b = {}) {
  const F = await fixtures(), prof = G.prof;
  await prof.data;
  const push = m => G.fake.push('game', clone(m));
  const giveBag = () => { push({ t: 'bag', add: F.bag, remove: [], gold: F.gold }); };
  if (what === 'game') {
    // a real pattern, stopped a little before the next thing to hit, with `inputs` flawless ones already in
    const p = prof.demo(a, { seed: b.seed ?? 11 }); await sleep(60);
    const run = prof.mini.run, n = b.inputs ?? 1, done = run.perfect.slice(0, n);
    const next = run.perfect[n], at = run.type === 'trace' ? run.game.ms * 0.46 : next ? Math.max((done[n - 1]?.[0] ?? 0) + 40, next[0] - (run.type === 'gauge' ? 420 : run.type === 'pour' ? 260 : 170)) : run.game.ms * 0.5;
    if (run.type === 'trace') { const pts = []; for (let t = 0; t < at; t += 16) pts.push([t, null]); for (const [t] of pts) { run.advanceTo(t); run.aim(run.botNext().aim + (t > at * 0.55 && t < at * 0.75 ? 0.14 : 0)); } prof.mini.freezeAt(at); }
    else prof.mini.freezeAt(at, done);
    p.catch?.(() => {});
  } else if (what === 'result') {
    const game = clone(F.gatherR.game);
    const res = prof.mini.play({ game, prof: F.gatherR.prof, title: F.gatherR.node.name, sub: 'Mining · tier 1', tint: F.nodeInfo.info.node.look.tint, mins: null });
    await sleep(40); const run = prof.mini.run; for (const [t, v] of run.perfect) { run.advanceTo(t); run.press(v); }
    await sleep(120); res.catch?.(() => {});
    prof._test.onGatherDone(clone(F.gatherDone)); await sleep(350);
  } else if (what === 'trainer') { push({ t: 'you', professions: F.professions }); push(F.usedSmith); await sleep(260); if (!b.dialog) { G.worldUi.closeDialog?.(); prof.showTrainer(); } await sleep(120); }
  else if (what === 'craft') {
    giveBag(); push({ t: 'you', professions: F.professions });
    prof.craft.open({ npc: b.away ? null : F.craftList.station.npc, tab: a || undefined }); await sleep(60);
    push(b.away ? F.craftListAway : F.craftList); await sleep(150);
  } else if (what === 'temper') {
    giveBag(); push({ t: 'you', professions: F.professions });
    prof.craft.open({ npc: F.craftList.station.npc, tab: 'tempering' }); await sleep(60); push(F.craftList); await sleep(150);
    document.querySelector(`#panel-craft .pt-item[data-uid="${F.blade2Uid}"]`)?.scrollIntoView({ block: 'center' }); document.querySelector(`#panel-craft .pt-item[data-uid="${F.blade2Uid}"]`)?.click(); await sleep(80);
    push(F.craftQuote2); await sleep(150);
  } else if (what === 'skills') {
    push({ t: 'you', professions: F.professionsSeasoned }); await sleep(60);
    if (a === 'sheet') { G.panels.sheet.open(); await sleep(250); document.querySelector('#panel-sheet .pk-row')?.scrollIntoView({ block: 'center' }); }
    else { G.ui.journal.showTab('professions'); await sleep(250); }
  } else if (what === 'material') {
    giveBag(); await sleep(120); G.panels.bag.toggle(true); await sleep(400);
    const ore = F.bag.find(i => i.kind === 'material'), sel = `#bag-grid .islot[data-tip-item="${ore.uid}"]`;
    if (a && a.hold) await G.verbs.holdSheet(sel); else await G.verbs.hover(sel);
  }
}
