// Rewards popup — a themed "you found loot" overlay: a chest lands, shakes, bursts open,
// gold/xp/fame count up, items fly out one by one with rarity-coloured glow (rare and better glow,
// legendary/unique get spinning light rays), then extras (level ups, quest done, memories).
// Standalone: needs only shared/rewards.css and the art in assets/data/ui (+ fx/spark.svg).
//
//   import { showRewards } from '../../shared/rewards.js';
//   await showRewards({
//     title: 'Victory', subtitle: 'The goblin band is dead.',
//     gold: 120, xp: 45, fame: 2,
//     items: [{ name: 'Longsword of Attunement', rarity: 'rare', slot: 'Weapon', lines: ['10–19 damage', '+24% first-hit crit'], unique: false, set: false }],
//     extras: [{ kind: 'level', text: 'Brannoc reaches level 4' }, { kind: 'quest', text: 'Bounty complete: The Brood Mother' }],
//   }, { speed: 1, base: '../../assets/data/ui', sounds: { open() {}, item(rarity) {}, close() {} } });
//
// Resolves when the player dismisses it (button, click outside, Enter/Space/Escape). Dismissing early
// skips straight to the fully revealed state first, so nothing is missed. `rarity` accepts the game's
// ladder (normal/magic/rare/epic/legendary) plus `unique: true` / `set: true` flags, or the strings
// 'unique' / 'set' directly. Rarity → gem icon uses the assets/data/ui/rarity_*.svg set.
//
// ---------------------------------------------------------------- CHOOSING ONE (opt-in, 2026-09-21)
//
// Farhold needed "a quest reward where you get to choose one of three rare or better items", and this
// popup already draws exactly the card a player wants to compare — gem, name, slot, stat lines, rarity
// glow. Writing a second set of item cards in Farhold would have been the same markup again, drifting
// apart the first time either side changed. So the popup grew ONE opt-in flag instead.
//
//   const i = await showRewards({ title: 'Pick one', items: [a, b, c], choose: true }, opts);
//
// `choose` is off unless a caller passes it, and everything below only branches on `choosing`, so a
// caller that does not pass it gets the popup it has always had and resolves with `undefined` exactly
// as before. Emberveil passes it nowhere. With it on: the cards are buttons, the footer button stays
// disabled until one is picked, and the promise resolves with the INDEX of the card taken.

const GEM = { normal: 'rarity_common', common: 'rarity_common', uncommon: 'rarity_uncommon', magic: 'rarity_rare', rare: 'rarity_unique', epic: 'rarity_epic', legendary: 'rarity_legendary', unique: 'rarity_legendary', set: 'rarity_set' };
const TAG = { legendary: 'Legendary', unique: 'Unique', set: 'Set piece', epic: 'Epic', rare: 'Rare' };

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'style') n.style.cssText = v; else n.setAttribute(k, v); }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}
const wait = (ms) => new Promise(r => setTimeout(r, ms));
export function rarityClass(it) { if (!it) return 'normal'; if (it.set || it.setId) return 'set'; if (it.unique || it.isUnique) return 'unique'; const r = String(it.rarity || 'normal').toLowerCase(); return GEM[r] ? r : 'normal'; }

/** Count a number up in a counter element over `ms` milliseconds. */
function countUp(node, to, ms) {
  return new Promise(res => { const t0 = performance.now(); const step = (t) => { const k = Math.min(1, (t - t0) / ms); const v = Math.round(to * (1 - Math.pow(1 - k, 3))); node.textContent = v.toLocaleString(); if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
}

let current = null;
/** Is a rewards popup open right now? */
export function rewardsOpen() { return !!current; }

/**
 * Show the popup. spec: { title, subtitle, gold, xp, fame, items[], extras[] } — every field optional.
 * `choose: true` (or `{ prompt, confirm }`) turns the item cards into a one-of-N chooser; the promise
 * then resolves with the index taken instead of `undefined`. Off by default — see the note up top.
 * opts: { speed (1 = normal, 2 = twice as fast), base (ui art folder), sounds { open, item(rarity), coin, close }, container }
 */
export function showRewards(spec = {}, opts = {}) {
  if (current) current.dismiss(true); // never stack two
  const speed = Math.max(0.25, opts.speed || 1); const T = (ms) => ms / speed;
  const base = opts.base || '../../assets/data/ui';
  const items = (spec.items || []).filter(Boolean); const extras = (spec.extras || []).filter(Boolean);
  const sounds = opts.sounds || {};
  const hasItems = items.length > 0; const counters = [['gold', spec.gold], ['xp', spec.xp], ['fame', spec.fame]].filter(([, v]) => v > 0);
  // opt-in chooser. `choosing` is false for every existing caller, and every branch below is guarded
  // by it, so nothing about the plain popup moves.
  const choosing = !!spec.choose && items.length > 0;
  const chooseOpts = (spec.choose && spec.choose !== true) ? spec.choose : {};
  let picked = -1;

  const overlay = el('div', { class: 'rw-overlay', role: 'dialog', 'aria-label': spec.title || 'Rewards' });
  const card = el('div', { class: 'rw-card' });
  overlay.append(card);
  card.append(el('i', { class: 'rw-corner tl' }), el('i', { class: 'rw-corner tr' }), el('i', { class: 'rw-corner br' }), el('i', { class: 'rw-corner bl' }));
  const skip = el('span', { class: 'rw-skip', text: 'skip ▸' }); card.append(skip);
  card.append(el('div', { class: 'rw-ribbon', text: spec.title || 'Rewards' }));
  card.append(el('p', { class: 'rw-sub', text: spec.subtitle || '' }));
  const stage = el('div', { class: 'rw-stage landing' });
  const chest = el('div', { class: 'rw-chest' }, el('i', { class: 'closed' }), el('i', { class: 'open' }));
  stage.append(el('i', { class: 'rw-rays' }), el('i', { class: 'rw-flash' }), chest);
  card.append(stage);
  const countersBox = el('div', { class: 'rw-counters' });
  const counterNodes = {};
  for (const [kind, v] of counters) { const num = el('span', { text: '0' }); const c = el('div', { class: 'rw-counter ' + kind }, el('i'), num, el('span', { class: 'rw-lbl', text: kind === 'gold' ? 'gold' : kind === 'xp' ? 'xp' : 'fame' })); counterNodes[kind] = { c, num, v }; countersBox.append(c); }
  card.append(countersBox);
  const itemsBox = el('div', { class: 'rw-items' }); card.append(itemsBox);
  const extrasBox = el('ul', { class: 'rw-extras' }); card.append(extrasBox);
  const btn = el('button', { class: 'rw-btn', type: 'button', text: choosing ? (chooseOpts.prompt || 'Pick one') : (spec.button || 'Continue') });
  if (choosing) btn.disabled = true;
  const hint = el('span', { class: 'rw-hint', text: choosing ? 'click a card to take it · ← → to move · Enter' : 'click anywhere to skip · Enter · Space · Esc' });
  card.append(el('div', { class: 'rw-foot' }, btn, hint));
  (opts.container || document.body).append(overlay);

  let revealed = false; let finished = false; let resolveP; const done = new Promise(r => { resolveP = r; });
  // `undefined` for every caller that did not ask to choose — the value the promise has always had.
  const cleanup = () => { document.removeEventListener('keydown', onKey); overlay.classList.add('rw-closing'); setTimeout(() => overlay.remove(), 200); current = null; sounds.close?.(); resolveP(choosing ? picked : undefined); };
  // First press/click: skip every animation and show the finished result. Second: close.
  // `force` (Escape, or being replaced by another popup) closes straight away.
  const dismiss = (force) => {
    if (finished) return;
    if (!revealed && !force) { revealAll(); return; }
    /**
     * A CHOOSER IS NEVER DISMISSED EMPTY-HANDED.
     *
     * Escape, a stray click on the dark surround, or another popup barging in would otherwise throw
     * away a rare item the player had already earned — the same rule as handing in gathered items:
     * a reward must never be a way to LOSE something. So nothing picked means the first card is
     * taken, and a soft dismiss leaves the popup open so they can still change their mind.
     */
    if (choosing && picked < 0) { select(0); if (!force) return; }
    finished = true; cleanup();
  };
  const onKey = (e) => {
    if (choosing && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      select((picked < 0 ? 0 : picked + step + items.length) % items.length);
      return;
    }
    if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); dismiss(e.key === 'Escape'); }
  };
  document.addEventListener('keydown', onKey);
  // A click ANYWHERE — the card, the chest, the dark surround — skips (E24). Clicking the popup
  // itself used to do nothing, so the only way to skip was the small "skip ▸" label in the corner.
  overlay.addEventListener('click', () => dismiss());
  btn.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  skip.addEventListener('click', (e) => { e.stopPropagation(); dismiss(); });
  current = { dismiss, overlay };

  // Build item cards (hidden until their turn) and extras up front so a skip can show everything at once.
  const itemNodes = items.map((it, i) => {
    const rc = rarityClass(it);
    const n = el('div', { class: 'rw-item ' + rc, style: 'animation-play-state: paused' });
    /**
     * Optional: the game's own hover card, through `shared/tooltip.js` `registerTip`.
     *
     * R22 — `tipItem` was missing, and it is the field the renderer actually reads. Farhold's
     * `registerTip('item', …)` looks the item up by `node.dataset.tipItem` (that is what
     * `hud.tipFor` stamps everywhere else in the game), while this only ever wrote `itemId`. So the
     * hook existed on both sides, spelled two different ways, and no reward card had ever shown a
     * tooltip. `itemId` is still written, because it is what a chooser's own analytics reads.
     */
    if (it.tipRender) {
      n.dataset.tipRender = it.tipRender;
      if (it.itemId) n.dataset.itemId = it.itemId;
      if (it.tipItem) n.dataset.tipItem = it.tipItem;
      if (it.tipClass) n.dataset.tipClass = it.tipClass;
    }
    if (TAG[rc]) n.append(el('span', { class: 'tag', text: TAG[rc] }));
    n.append(el('div', { class: 'gem', style: `background-image:url("${base}/${it.icon ? it.icon : GEM[rc] || 'rarity_common'}.svg")` }));
    n.append(el('div', { class: 'name', text: it.name || 'Item' }));
    if (it.slot) n.append(el('div', { class: 'slot', text: it.slot }));
    if (it.lines?.length) n.append(el('div', { class: 'lines' }, ...it.lines.slice(0, 3).map(l => el('div', { text: l, title: l }))));
    if (it.note) n.append(el('div', { class: 'note', text: it.note }));
    if (choosing) {
      // a card you can take is a button, and says so to a screen reader as well as to a mouse
      n.classList.add('rw-pick');
      n.append(el('i', { class: 'rw-tick', text: '✓' }));
      n.setAttribute('role', 'button'); n.setAttribute('tabindex', '0');
      n.setAttribute('aria-label', `Take ${it.name || 'this'}`);
      // stopPropagation because the overlay's own click handler is "skip / close", and a click on a
      // card must not be read as both
      n.addEventListener('click', (e) => { e.stopPropagation(); if (!revealed) revealAll(); select(i); });
      n.addEventListener('dblclick', (e) => { e.stopPropagation(); select(i); dismiss(true); });
    }
    n.style.visibility = 'hidden'; itemsBox.append(n); return { n, rc };
  });
  /** Highlight one card and arm the footer button with what taking it would mean. */
  function select(i) {
    if (!choosing || !itemNodes[i]) return;
    picked = i;
    itemNodes.forEach(({ n }, k) => { n.classList.toggle('rw-picked', k === i); n.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
    btn.disabled = false;
    btn.textContent = chooseOpts.confirm || `Take ${items[i].name || 'it'}`;
  }
  const extraNodes = extras.map((x) => { const li = el('li', { class: x.kind || 'item', style: 'animation-play-state: paused; visibility: hidden' }, el('i'), el('span', { text: x.text || '' })); extrasBox.append(li); return li; });
  btn.style.visibility = 'hidden';

  const showItem = (i) => { const { n, rc } = itemNodes[i]; n.style.visibility = ''; n.style.animationPlayState = 'running'; sounds.item?.(rc); };
  const showCounter = (kind, instant) => { const k = counterNodes[kind]; if (!k) return Promise.resolve(); k.c.classList.add('show'); if (instant) { k.num.textContent = k.v.toLocaleString(); return Promise.resolve(); } sounds.coin?.(kind); k.c.classList.add('bump'); return countUp(k.num, k.v, T(600)); };
  const showExtra = (i) => { const li = extraNodes[i]; li.style.visibility = ''; li.style.animationPlayState = 'running'; };
  // choosing: the footer button starts disabled, so focus the first card instead — focusing a
  // disabled button puts the keyboard nowhere
  const showButton = () => { btn.style.visibility = ''; btn.style.animationPlayState = 'running'; (choosing ? itemNodes[0]?.n || btn : btn).focus?.({ preventScroll: true }); };
  const sparks = () => { for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + Math.random() * .3; const r = 50 + Math.random() * 60; const s = el('i', { class: 'rw-spark', style: `--dx:${Math.cos(a) * r}px; --dy:${Math.sin(a) * r - 30}px; --d:${(Math.random() * .15).toFixed(2)}s` }); stage.append(s); setTimeout(() => s.remove(), T(1000)); } };
  const openChest = () => { if (stage.classList.contains('open')) return; stage.classList.remove('landing', 'shake'); stage.classList.add('open'); sounds.open?.(); sparks(); };
  // Everything at once, with no animation left running: the chest open, the counters at their final
  // values, every item and extra visible and the Continue button focused.
  const revealAll = () => {
    if (revealed) return; revealed = true;
    openChest(); stage.classList.remove('landing', 'shake');
    for (const k of Object.keys(counterNodes)) showCounter(k, true);
    itemNodes.forEach(({ n }, i) => { showItem(i); n.style.animationPlayState = 'running'; n.style.animationDelay = '0s'; });
    extraNodes.forEach((li, i) => { showExtra(i); li.style.animationDelay = '0s'; });
    skip.style.visibility = 'hidden';
    showButton();
  };

  (async () => {
    await wait(T(550)); if (revealed) return;
    stage.classList.remove('landing'); stage.classList.add('shake'); await wait(T(520)); if (revealed) return;
    openChest(); await wait(T(350)); if (revealed) return;
    for (const [kind] of counters) { if (revealed) return; await showCounter(kind); await wait(T(120)); }
    for (let i = 0; i < itemNodes.length; i++) { if (revealed) return; showItem(i); await wait(T(itemNodes[i].rc === 'normal' ? 260 : 420)); }
    for (let i = 0; i < extraNodes.length; i++) { if (revealed) return; showExtra(i); await wait(T(180)); }
    if (revealed) return; revealed = true; showButton();
  })();
  return done;
}

/** Convenience: build a spec from an Emberveil-style victory object { xp, gold, fame, drops, bossDrops, levelUps, questDone, namedSlain, sideDone }. */
export function specFromVictory(v, { title = 'Victory', subtitle = '' } = {}) {
  const items = [...(v.drops || []), ...(v.bossDrops || [])].map(itemToReward);
  const extras = [];
  for (const lu of v.levelUps || []) extras.push({ kind: 'level', text: `${lu.hero?.short || lu.hero?.name || 'Hero'} reaches level ${lu.hero?.level ?? lu.level ?? ''}` });
  if (v.namedSlain) extras.push({ kind: 'fame', text: `${v.namedSlain.name} is dead. The name goes on the board.` });
  for (const q of v.sideDone || []) extras.push({ kind: 'quest', text: `Bounty complete: ${q.title}${q.gold ? ` · +${q.gold} gold` : ''}` });
  if (v.questDone) extras.push({ kind: 'quest', text: `Quest complete: ${v.questDone.title}` });
  if (v.unlockedZone) extras.push({ kind: 'memory', text: `The way to ${v.unlockedZoneName || v.unlockedZone} is open` });
  return { title, subtitle, gold: v.gold || 0, xp: v.xp || 0, fame: v.fame || 0, items, extras };
}
/** Map a game item to a reward card. Works with Emberveil loot items and plain { name, rarity } objects. */
export function itemToReward(it) {
  if (!it) return null;
  const lines = [];
  if (it.dmg || it.damage) { const d = it.dmg || it.damage; lines.push(Array.isArray(d) ? `${d[0]}–${d[1]} damage` : `${d} damage`); }
  if (it.armor) lines.push(`${it.armor} armor`);
  for (const a of it.affixes || []) { const t = typeof a === 'string' ? a : a.text || a.desc || a.name; if (t) lines.push(t); }
  if (it.legendaryEffect || it.legendaryEffectId) lines.push(it.legendaryText || 'Legendary power');
  return { name: it.name, rarity: it.rarity, unique: !!it.isUnique, set: !!it.setId, slot: it.slotName || it.slot || it.type, lines: lines.slice(0, 3), itemId: it.id || null };
}
