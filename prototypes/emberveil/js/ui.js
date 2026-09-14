// Emberveil 2 — themed interface helpers.
//
// Everything here is presentation only: icon markup from assets/data/ui, frame flourishes, the
// title-screen embers, the in-game menu overlay, tooltip content builders and the plain-language
// text that explains stats, node types and the game loop. main.js imports what it needs; nothing
// in here touches game rules.
import { installTooltips, registerTip, hideTip } from '../../../shared/tooltip.js';

export { installTooltips, registerTip, hideTip };

const UI = '../../assets/data/ui/';

/** `<i class="ic ic-gold">` markup for one icon from assets/data/ui. */
export function iconHtml(name, cls = '') { return `<i class="ic ic-${name}${cls ? ' ' + cls : ''}"></i>`; }
/** The same as an element. */
export function icon(name, cls = '') { const i = document.createElement('i'); i.className = `ic ic-${name}${cls ? ' ' + cls : ''}`; return i; }

// ------------------------------------------------------------------ rarity
/**
 * Item rarity → the gem art that stands for it. The pick is by COLOUR, not by name: Emberveil's
 * rarities are normal (grey), magic (blue), rare (yellow) and legendary (orange), so they take the
 * grey, blue, gold and orange gems. The unused gems (uncommon green, epic purple) are there for
 * games with a different ladder.
 */
export const RARITY_GEM = { normal: 'common', magic: 'rare', rare: 'unique', epic: 'epic', legendary: 'legendary', unique: 'legendary', set: 'set' };
export function gemFor(it) { if (!it) return 'common'; if (it.setId) return 'set'; if (it.isUnique) return 'unique'; return RARITY_GEM[it.rarity] || 'common'; }
export function gemHtml(it) { return `<i class="gem gem-${gemFor(it)}"></i>`; }

// ------------------------------------------------------------------ equipment slots
export const SLOT_ICON = { weapon: 'slot_weapon', offhand: 'slot_offhand', head: 'slot_head', chest: 'slot_chest', hands: 'slot_hands', legs: 'slot_legs', feet: 'slot_feet', ring: 'slot_ring', ring1: 'slot_ring', ring2: 'slot_ring', necklace: 'slot_necklace', amulet: 'slot_necklace' };
export const SLOT_NAME = { weapon: 'Weapon', offhand: 'Off hand', head: 'Head', chest: 'Chest', hands: 'Hands', legs: 'Legs', feet: 'Feet', ring1: 'Ring (left)', ring2: 'Ring (right)', ring: 'Ring', necklace: 'Necklace' };
export const slotIcon = s => SLOT_ICON[s] || 'slot_ring';

// ------------------------------------------------------------------ plain-language help
export const STAT_TIPS = {
  STR: 'Strength — melee damage and how much you can shrug off. Most heavy weapons scale with it.',
  DEX: 'Dexterity — ranged damage, chance to hit and chance to dodge.',
  INT: 'Intelligence — spell damage and healing, and the size of the mana pool.',
  CON: 'Constitution — maximum health, and how well you resist bleeding and poison.',
  armor: 'Armor — cuts the damage of every physical hit that lands.',
  hit: 'Hit — the chance an attack lands instead of missing, before the target dodges.',
  dodge: 'Dodge — the chance to slip an incoming attack entirely.',
  crit: 'Crit — the chance a hit lands hard, for extra damage.',
  dmg: 'Damage — the low and high ends of one weapon swing, before crits and skills.',
  hp: 'Health. At zero the hero goes down; they come back after a rest or a revive.',
  mp: 'Mana — spent on skills. It comes back slowly in fights and fully at a rest.',
  xp: 'Experience towards the next level. Levels bring attribute points and, at some levels, a talent.',
};
/** Node type → a name and a plain-words line for the map tooltip. */
export const NODE_INFO = {
  combat: ['Battle', 'Something is waiting here. Expect a fight.'],
  ambush: ['Ambush', 'A fight that starts badly — the enemy moves first.'],
  dialog: ['Meeting', 'Someone to talk to. Choices here can end in a reward or a fight.'],
  town: ['Settlement', 'Safe ground: merchant, smith, inn, quest board.'],
  treasure: ['Cache', 'Loot, if you can get to it.'],
  boss: ['Boss', 'The end of the act. Come rested and geared.'],
  lore: ['Old stone', 'A piece of the story. No danger.'],
  shrine: ['Shrine', 'A blessing or a bargain — sometimes both.'],
  challenge: ['Trial', 'A harder fight with a better reward.'],
  dungeon: ['Delve', 'Several rooms in a row with no rest between them.'],
  skillCheck: ['Test', 'One hero is measured against the road. Their attributes decide it.'],
  heroquest: ['Errand', "A personal job for one of your heroes."],
  named: ['Named enemy', 'A rival with a name. Beat them or they remember you.'],
  start: ['Trailhead', 'Where this zone begins.'],
};
export function nodeInfo(n) {
  const [name, text] = NODE_INFO[n.named ? 'named' : n.type] || NODE_INFO[n.type] || ['Waypoint', 'A stop on the road.'];
  return { name, text };
}

/** The "how to play" panel, in plain words. Used on the title screen and in the menu. */
export function howToHtml() {
  return `
  <p>You run a party of four down a road that stopped being safe a long time ago.</p>
  <h5>The loop</h5>
  <ul>
    <li><b>Travel.</b> Click a lit node on the map. Each move costs one of your moves for the day.</li>
    <li><b>Resolve the node.</b> Fights run themselves — you watch, and the log tells you what happened.</li>
    <li><b>Rest</b> when the moves run out. A rest eats a ration, heals the party and gives you a scene round the fire.</li>
    <li><b>Spend what you found.</b> Gear goes in the Bag; levels give points in the Skills tab.</li>
  </ul>
  <h5>Things that will bite you</h5>
  <ul>
    <li>No rations means exhaustion: −10% to hit, dodge and damage per stack, and it keeps stacking.</li>
    <li>Resting in the open can bring a night attack. Torches, tents and the right vehicle make it rarer.</li>
    <li>A hero at zero health is out for the rest of the fight. The whole party down ends the run of the day badly.</li>
  </ul>
  <h5>Good habits</h5>
  <ul>
    <li>Buy rations before leaving a settlement, and keep one spare day of food.</li>
    <li>Hover anything with a soft glow — gear, stats, skills, map nodes — for what it actually does.</li>
    <li>Click a hero in the Party tab to point the Skills tab at them.</li>
    <li>Save from the top bar or the menu. The save lives in this browser.</li>
  </ul>`;
}

// ------------------------------------------------------------------ decoration
/** Drop the four gold corner flourishes into every `.framed` box under `root` (safe to run more than once). */
export function decorateFrames(root = document) {
  const boxes = [];
  if (root instanceof Element && root.classList.contains('framed')) boxes.push(root);
  boxes.push(...root.querySelectorAll('.framed'));
  for (const box of boxes) {
    if (box.querySelector(':scope > .fc')) continue;           // already flourished
    for (const c of ['tl', 'tr', 'br', 'bl']) { const i = document.createElement('i'); i.className = `fc fc-${c}`; box.prepend(i); }
  }
}

/** Drifting embers on the title screen: a dozen cheap CSS-animated sprites. */
export function initEmbers(host, count = 14) {
  if (!host || host.childElementCount) return;
  for (let n = 0; n < count; n++) {
    const i = document.createElement('i');
    const dur = 9 + Math.random() * 11;
    i.style.left = (Math.random() * 100).toFixed(1) + '%';
    i.style.animationDuration = dur.toFixed(1) + 's';
    i.style.animationDelay = (-Math.random() * dur).toFixed(1) + 's';
    i.style.setProperty('--drift', (Math.random() * 120 - 60).toFixed(0) + 'px');
    i.style.width = i.style.height = (5 + Math.random() * 8).toFixed(0) + 'px';
    host.append(i);
  }
}

/** Fill every `[data-howto]` container with the how-to-play text. */
export function fillHowTo(root = document) { for (const box of root.querySelectorAll('[data-howto]')) box.innerHTML = howToHtml(); }

// ------------------------------------------------------------------ tooltip cards
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

/** Rich item card: name + gem, slot, stats, affixes and the diff against what the hero wears. */
export function itemTipHtml({ it, score = null, cur = null, curScore = null, heroShort = '', describe = a => a.text || '' }) {
  if (!it) return '';
  const bits = [`<div class="tip-title"><i class="gem gem-${gemFor(it)}"></i> <span class="${it.rarity}">${esc(it.name)}</span></div>`];
  bits.push(`<div class="tip-sub">${esc(it.rarity)}${it.quality ? ' · ' + esc(it.quality) + ' quality' : ''} · ${esc(SLOT_NAME[it.slot] || it.slot)}${it.twoHanded ? ' · two-handed' : ''}</div>`);
  if (it.dmg) bits.push(`<div class="tip-row"><span>Damage</span><b>${it.dmg[0]}–${it.dmg[1]}</b></div>`);
  if (it.armor != null) bits.push(`<div class="tip-row"><span>Armor</span><b>${it.armor}</b></div>`);
  const aff = (it.affixes || []).map(a => `<div class="${a.baseIntrinsic ? '' : 'good'}">${esc(describe(a))}</div>`).join('');
  if (aff) bits.push('<hr>' + aff);
  if (score) {
    bits.push(`<hr><div class="tip-row"><span>Score</span><b>${score.total}</b></div>`);
    if (cur && curScore) {
      const d = score.total - curScore.total;
      bits.push(`<div class="tip-sub">vs ${esc(heroShort)}'s ${esc(cur.name)} (${curScore.total}) <span class="${d >= 0 ? 'good' : 'bad'}">${d >= 0 ? '+' : ''}${d}</span></div>`);
    } else if (!cur) bits.push('<div class="tip-sub">Nothing equipped in that slot.</div>');
  }
  if (it.lore) bits.push(`<hr><div class="tip-sub"><i>${esc(it.lore)}</i></div>`);
  return bits.join('');
}

// ------------------------------------------------------------------ menu overlay
/**
 * Wire the in-game menu dialog. `handlers` gets { resume, save, load, newGame, quit } — each may
 * return false to keep the menu open. Escape and the backdrop close it.
 */
export function initMenu(dlg, handlers = {}) {
  if (!dlg || dlg.dataset.wired === '1') return { open: () => dlg?.showModal(), close: () => dlg?.close() };
  dlg.dataset.wired = '1';
  const close = () => { hideTip(); if (dlg.open) dlg.close(); };
  const open = () => { if (!dlg.open) { hideTip(); dlg.showModal(); } };
  for (const b of dlg.querySelectorAll('[data-menu]')) {
    b.addEventListener('click', async () => {
      const act = b.dataset.menu;
      if (act === 'resume') return close();
      if (act === 'howto') { const d = dlg.querySelector('#menu-howto'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); } return; }
      const fn = { save: handlers.save, load: handlers.load, new: handlers.newGame, quit: handlers.quit }[act];
      const keepOpen = await fn?.();
      if (keepOpen !== true) close();
    });
  }
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); });          // Escape
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });          // click the backdrop
  return { open, close };
}

/** One-time setup: tooltips, frame corners, embers, how-to text. */
export function setupUI() {
  installTooltips();
  decorateFrames();
  fillHowTo();
  initEmbers(document.getElementById('embers'));
}

// ------------------------------------------------------------------ skill checks
// One wording for every roll in the game, and one popup that shows it happening.
//
//   CON 18 + d20 (rolled 2) = 20 vs 20: pass
//
// Node tests, dialog choices, dungeon stages and crossings all used to print this differently
// ("Rolled 7 + 14 vs 18: success", "STR 14 + d20 9 vs 16: pass"). They all call checkText() now, so
// the log reads the same wherever the roll came from.

/**
 * The one line a skill check writes into the log.
 * @param {object} r
 * @param {string} r.stat        'CON', 'STR'…
 * @param {number} [r.best]      the party's best raw attribute score — what the player sees on the sheet
 * @param {number} [r.value]     the same thing, if the caller doesn't use `best`
 * @param {number} [r.statBonus] what that attribute is actually worth on the roll, when the rules
 *                               convert it (js/rules.js checkBonus). Shown in brackets when it differs.
 * @param {number} [r.bonus]     any extra on top (traits, the right words…)
 * @param {string} [r.bonusLabel] what that extra was, in plain words
 * @param {number} r.roll        the d20
 * @param {number} r.dc          what it had to beat
 * @param {boolean} r.ok
 * @returns {string} plain text, no markup
 */
export function checkText({ stat = '', best = null, value = null, statBonus = null, bonus = 0, bonusLabel = '', roll = 0, dc = 0, ok = false } = {}) {
  const attr = best ?? value ?? 0;
  const add = statBonus == null ? attr : statBonus;
  const total = add + (bonus || 0) + roll;
  const head = (statBonus != null && statBonus !== attr) ? `${stat} ${attr} (+${statBonus})` : `${stat} ${attr}`;
  const extra = bonus ? ` +${bonus}${bonusLabel ? ` (${bonusLabel})` : ''}` : '';
  return `${head}${extra} + d20 (rolled ${roll}) = ${total} vs ${dc}: ${ok ? 'pass' : 'fail'}`;
}
/** The same line as a coloured paragraph for the narrative panel. */
export function checkHtml(r) { return `<p class="sys check ${r.ok ? 'good' : 'bad'}">${esc(checkText(r))}</p>`; }

/** Is a skill-check popup on screen right now? */
let scOpen = null;
export function skillCheckOpen() { return !!scOpen; }

/**
 * Show a roll happening: a d20 tumbles for about 0.8 s, lands on the number, then the sum and a
 * PASS / FAIL stamp. A click, Enter, Space or Escape at any point jumps straight to the result;
 * after that the same keys close it. Resolves when it closes, so a caller can `await` it and keep
 * the scene in order.
 *
 * Every caller still writes checkText() into the log, so turning the popup off loses nothing.
 *
 *   await skillCheckPopup({ stat: 'CON', best: 18, roll: 2, dc: 20, ok: true, subtitle: 'The Ford' });
 *
 * @param {object} r     the same fields checkText() takes, plus { title, subtitle }
 * @param {object} opts  { container, speed (2 = twice as fast), enabled: false to do nothing }
 * @returns {Promise<void>}
 */
export function skillCheckPopup(r = {}, opts = {}) {
  if (opts.enabled === false || !r || typeof document === 'undefined') return Promise.resolve();
  if (scOpen) scOpen.close(true);
  const speed = Math.max(0.25, opts.speed || 1);
  const T = ms => ms / speed;
  const roll = Math.max(1, Math.min(20, Math.round(r.roll || 1)));

  const mk = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const overlay = mk('div', 'sc-overlay'); overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', r.title || 'Skill check');
  const card = mk('div', 'sc-card'); overlay.append(card);
  const skip = mk('span', 'sc-skip', 'skip ▸'); card.append(skip);
  card.append(mk('div', 'sc-ribbon', r.title || `${r.stat || ''} check`.trim()));
  card.append(mk('p', 'sc-sub', r.subtitle || (r.dc ? `difficulty ${r.dc}` : '')));
  const die = mk('div', 'sc-die rolling', '20'); card.append(die);
  const sum = mk('div', 'sc-sum'); card.append(sum);
  const stamp = mk('div', 'sc-stamp ' + (r.ok ? 'pass' : 'fail'), r.ok ? 'Pass' : 'Fail'); card.append(stamp);
  const btn = mk('button', 'sc-btn', 'Continue'); btn.type = 'button';
  const foot = mk('div', 'sc-foot'); foot.append(btn, mk('span', 'sc-hint', 'Enter · click')); card.append(foot);
  btn.style.visibility = 'hidden';
  (opts.container || document.body).append(overlay);

  let settled = false, closed = false, resolveP;
  const done = new Promise(res => { resolveP = res; });
  let spin = null;

  const settle = () => {
    if (settled) return; settled = true;
    if (spin) { clearInterval(spin); spin = null; }
    die.textContent = String(roll);
    die.classList.remove('rolling'); die.classList.add('settled');
    if (roll === 20) die.classList.add('nat20'); else if (roll === 1) die.classList.add('nat1');
    // "CON 18 + d20 (rolled 2) = 20 vs 20" — the verdict is the stamp underneath, not repeated here
    sum.innerHTML = `<b>${esc(checkText(r).replace(/: (pass|fail)$/, ''))}</b>`;
    sum.classList.add('show');
    stamp.classList.add('show');
    btn.style.visibility = '';
    btn.focus({ preventScroll: true });
  };
  const close = force => {
    if (closed) return;
    if (!settled && !force) return settle();              // the first click only skips the animation
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('sc-closing');
    setTimeout(() => overlay.remove(), 200);
    scOpen = null;
    resolveP();
  };
  const onKey = e => { if (['Enter', ' ', 'Escape'].includes(e.key)) { e.preventDefault(); close(e.key === 'Escape'); } };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', () => close());
  btn.addEventListener('click', e => { e.stopPropagation(); close(true); });
  skip.addEventListener('click', e => { e.stopPropagation(); close(); });
  scOpen = { close, settle, overlay };

  // the tumble: a new face every 70 ms for about eight tenths of a second
  let face = 0;
  spin = setInterval(() => { face = 1 + ((face + 6) % 20); die.textContent = String(face); }, Math.max(20, T(70)));
  setTimeout(settle, T(800));
  return done;
}
