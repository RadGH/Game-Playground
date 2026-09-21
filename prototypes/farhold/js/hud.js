// Farhold — the interface over the top of the world: bars, the log, the minimap, and the character
// sheet. Plain DOM, no framework, no build step.
//
// The HUD never decides anything; main.js hands it the player and it draws what is there.
//
// Round 4 split the sheet into **tabs** — Character, Inventory, Skills, Crafting, Journal — because
// one scrolling column could not hold thirty passives, six skills, a materials list and a bench.
// Only the visible tab is rebuilt, so opening the sheet is cheap whatever is in the bag.

import { itemScore, SLOTS, describeAffix, xpForLevel, displayName } from './rpg.js';

/** What each talent tier is for. Tier 1 is how it is thrown, 2 what happens when it lands, 3 what it
 *  does to the fight — it was written down in a comment and never shown to the player. */
const TIER_THEMES = { 1: 'how it flies', 2: 'when it lands', 3: 'what it does to the fight' };

/** The seven screens, in rail order — also what the `1`–`7` keys pick. */
const SCREENS = ['character', 'inventory', 'skills', 'perks', 'crafting', 'upgrade', 'journal'];

/** What the header calls each screen. `perks` was missing, so the Perks screen said "Character". */
const SHEET_TITLES = {
  character: 'Character', inventory: 'Inventory', skills: 'Skills', perks: 'Perks',
  crafting: 'Crafting', upgrade: 'Upgrade', journal: 'Journal',
};
import { worldPixels } from '../../../worldgen/js/render.js';
import { M_PER_CELL } from './planet.js';
import { zoneTone } from './zones.js';
import { treeFor, picksFor, talentSummary, tiersOpen, TIER_LEVELS } from './skilltalents.js';
import { ARMS, NODE_KINDS, RINGS, pointsFor, pointsLeft, spentBy, takenOf, canTake, canRefund, refundOne, linksOf, armProgress } from './perks.js';

/** How far in and out the perk forest zooms, and the rings it draws under the nodes. */
const PERK_ZOOM = [0.6, 4];

/** A colour at a fraction of its strength, over the canvas's own near-black. */
function tint(hex, amount) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = c => Math.round(11 + (c - 11) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
const PERK_RINGS = RINGS.map(r => r.radius);
import { patternGlyphs, patternText, handsOf, profileOf } from './weapons.js';
import { VEHICLES, vehicleFor } from './gear.js';
import { MARKER_LOOKS, distanceText } from './markers.js';
import { NEARBY_ICONS, mmss } from './nearby.js';
import { installTooltips, registerTip, hideTip, refreshTip } from '../../../shared/tooltip.js';
// The playground's one number formatter. Nothing on screen should ever read "513.4100000000000001"
// — Emberveil hit exactly this and `shared/format.js` is the fix it produced.
import { fmt, hp as hpNum } from '../../../shared/format.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

/**
 * What a boat or a ship is FOR, in the dry voice the rest of the character screen uses.
 *
 * Built from the vehicle's own numbers rather than its lore line, so the two dropdowns say what
 * changes when you pick the other one.
 */
function vehicleFunction(slot, kind) {
  if (!kind) return '';
  // every figure is optional: a vehicle added later without one simply drops that part of the line
  const bits = [];
  if (slot === 'boat') {
    bits.push('Water only');
    if (kind.speed != null) bits.push(`${fmt(kind.speed)} m/s`);
  } else {
    bits.push('Reaches orbit');
    if (kind.thrust != null) bits.push(`thrust ${fmt(kind.thrust)}×`);
    if (kind.warp != null) bits.push(`warp ${fmt(kind.warp)}×`);
  }
  return bits.join(' · ');
}

/** The colour class for an item's name — the same rarity words Emberveil uses. */
export function rarityClass(item) {
  if (!item) return 'rarity-normal';
  if (item.setId) return 'rarity-set';
  if (item.isUnique) return 'rarity-unique';
  return 'rarity-' + (item.rarity || 'normal');
}

export const SLOT_LABELS = {
  weapon: 'Weapon', offhand: 'Off hand', head: 'Head', chest: 'Chest', legs: 'Legs',
  hands: 'Hands', feet: 'Feet', ring: 'Ring', ring2: 'Second ring', necklace: 'Necklace',
  mount: 'Mount', light: 'Light',
};
/** The other place an item could go, for the Shift-to-compare card. */
const ALT_SLOT = { weapon: 'offhand', offhand: 'weapon', ring: 'ring2', ring2: 'ring' };

/** What colour each status reads as in the chip row. */
const STATUS_COLOR = {
  burn: '#ff9a5c', poison: '#9ede6a', bleed: '#ff6a6a', chill: '#8fd6ff', web: '#b8e08a',
  shock: '#ffe86a', curse: '#c090ff', weaken: '#a08ab0',
  might: '#ffd27a', guard: '#dfe9ff', haste: '#8fd0ff', stoneskin: '#c8bca0',
  regen: '#9ff0c0', rally: '#ffd0a0',
};

/** What each line on the character sheet actually means, for its hover card. */
const STAT_HELP = {
  // R14: the four attributes are a readout now, under Stats. They are earned on perk nodes —
  // js/perks.js hands out str/dex/int/con — not bought a point at a time.
  Strength: 'Raises the damage of every melee swing, and how much you can carry. Earned on perk nodes.',
  Dexterity: 'Raises ranged damage and adds a little critical chance and dodge. Earned on perk nodes.',
  Intellect: 'Raises spell power and the size of your mana pool. Earned on perk nodes.',
  Constitution: 'Raises health and how fast it comes back. Earned on perk nodes.',
  Health: 'How much damage you can take before you black out. Constitution and `+health` gear raise it.',
  Mana: 'What skills are paid for with. Intellect and `+mana` gear raise the pool; mana regeneration refills it.',
  Damage: 'The range one swing rolls in, after your weapon, your attribute, your talents and every damage property on your gear.',
  Armour: 'Cuts physical damage. The curve is damage x 100/(100+armour), so the first points are worth the most.',
  'Magic resistance': 'The same curve, against fire, ice, lightning, poison, shadow and arcane.',
  Crit: 'The chance a hit rolls critical, and how much extra it does when it lands. Dexterity adds a little of the first.',
  Dodge: 'The chance a hit misses you entirely. Capped at 35%, however high the number goes.',
  Block: 'A share of hits take a flat chunk off before anything else. Shields only.',
  Barrier: 'A pool that soaks damage before your health does, and refills when nothing is fighting you.',
  'Attack speed': 'How many swings a second. Comes from the `initiative` property, which is turn order in Emberveil and haste here.',
  Cooldowns: 'How much sooner every skill comes back.',
  'Move speed': 'Metres a second at a walk. Heavy armour slows you; talents and haste do not.',
  'Better loot': 'Magic find: shifts every drop roll towards the good end of the rarity table.',
  Kills: 'Everything you have put down, on every world.',
};

/** What a zone's colour means, spelled out under the banner. */
const TONE_WORDS = {
  trivial: 'nothing here can hurt you',
  easy: 'easy going',
  even: 'a fair fight',
  hard: 'dangerous for you',
  deadly: 'you should not be here yet',
};

/** How many properties each rarity rolls, for the "what comes out" panel. */
const AFFIX_COUNT = {
  normal: 'No properties — promote it afterwards to give it some.',
  magic: 'Two properties.',
  rare: 'Three properties.',
  legendary: 'Five or six properties.',
};
/** A plain sentence for what each kind of rework does, when the quote has no note of its own. */
const CHANGE_TEXT = {
  quality: 'Every number on the item goes up a step.',
  promote: 'The item moves up a rarity and gains a property.',
  addAffix: 'One more property is added.',
  reroll: 'The property you picked is replaced.',
  rerollAll: 'Every property is rolled again.',
  values: 'The properties stay; their numbers are rolled again.',
  brand: 'The weapon gains a brand, and its hits carry that element.',
  intrinsic: 'The base of the item itself gets better.',
};

export class Hud {
  constructor({
    rpg, terrain, onEquip, onSpendPassive = null, onTakeTalent = null,
    onRecycle = null, onCraft = null, craft = null, pets = null, zones = null,
    journal = null, seed = 1, onOpen = null, onClose = null,
    // round 7: the perk forest, the per-skill talent trees, the vehicle dropdowns
    onTakePerk = null, onRefundPerks = null, onRefundPerk = null, onPickTalent = null, onClearTalent = null,
    onSelectVehicle = null,
    // The Territory expansion: who holds the ground, what it is offering, and what people say
    standings = null, territoryHere = null, board = null, rumours = null, onTakeJob = null,
    factionBands = null, factionDeeds = null, factionRewards = null,
    factionName = null, distanceTo = null,
    // A1: the one line that says what you are doing
    objective = null, settings = null,
    /**
     * R14 — the map, at arm's length.
     *
     * `hud.js` must not import `js/map.js`: the HUD is built once at boot and the map is rebuilt on
     * every world you land on. So the journal gets three callbacks instead — show me that place,
     * star it, forget it — and knows nothing else about the map screen.
     */
    onLocate = null, onStarSaved = null, onForgetSaved = null,
    /** R14: the same list the Nearby panel draws, so the journal cannot disagree with it. */
    nearby = null,
  } = {}) {
    this.nearby = nearby;
    this.onLocate = onLocate;
    this.onStarSaved = onStarSaved;
    this.onForgetSaved = onForgetSaved;
    this.objective = objective;
    this.settings = settings;
    this.standings = standings;
    this.factionBands = factionBands;
    this.factionDeeds = factionDeeds;
    this.factionRewards = factionRewards;
    this.factionName = factionName;
    this.distanceTo = distanceTo;
    this.territoryHere = territoryHere;
    this.board = board;
    this.rumours = rumours;
    this.onTakeJob = onTakeJob;
    this.onTakePerk = onTakePerk;
    this.onRefundPerks = onRefundPerks;
    // 4.3: one perk back rather than all of them. main.js may not hand us a callback for it yet, in
    // which case `refundPerk` does the work here — see the note there.
    this.onRefundPerk = onRefundPerk;
    this.onPickTalent = onPickTalent;
    this.onClearTalent = onClearTalent;
    this.onSelectVehicle = onSelectVehicle;
    this.journal = journal;
    this.onSpendPassive = onSpendPassive;
    this.onTakeTalent = onTakeTalent;
    this.onRecycle = onRecycle;
    this.onCraft = onCraft;
    this.craft = craft;
    this.pets = pets;
    this.zones = zones;
    this.rpg = rpg;
    this.terrain = terrain;
    this.seed = seed;
    this.onEquip = onEquip;
    this.onOpenSheet = onOpen;
    this.onCloseSheet = onClose;
    this.lines = [];
    /**
     * The last fifty lines, kept whether or not they are still on screen.
     *
     * The log is the only teacher this game has — every rule, every faction, every "that will not
     * work yet" is said once in the corner and then pushed off the bottom in seconds. `L` puts this
     * back on screen.
     */
    this.history = [];
    this.historyOpen = false;
    this.sheetOpen = false;
    this.tab = 'character';
    this.bench = null;                 // the item on the crafting bench
    this.minimapBase = null;
    this.lastMinimap = 0;
    this.skillState = [];
    /** How many world cells the minimap shows across. `+` and `-` change it. */
    this.minimapSpan = 26;
    /**
     * How much further an affix lets you see, as a multiplier on the span.
     *
     * Kept apart from `minimapSpan` on purpose: `+` and `-` write that directly, so folding the
     * affix into it would mean the player's own setting drifting every frame. `revealRange` was
     * derived off the affixes and read by nothing at all until this.
     */
    this.revealMul = 1;
    /** Which skill's talent tree is showing on the Skills tab. */
    this.talentSkill = null;
    /** Is the town notice board up? See `openNoticeBoard`. */
    this.boardOpen = false;
    /** Which perk node the forest has selected. */
    this.perkPick = null;
    /** D9: names under the nodes. Off until you ask for them. */
    this.perkLabels = false;
    /** D10: what is typed in the perk search box. */
    this.perkQuery = '';

    /**
     * D3: LEAVING THE INVENTORY SOMETIMES LEFT THE MOUSE LOOSE.
     *
     * "It's fine most of the time unless I'm in the menu a while clicking around a lot." The close
     * path always asked for the pointer back — but a browser is allowed to REFUSE that request, and
     * does: Chrome turns down a `requestPointerLock` for about a second after the lock was given up,
     * and again if the request did not ride on a fresh click or keypress. The refusal arrives as a
     * `pointerlockerror` event, which nothing was listening for, so the ask failed in silence and
     * the player was left with a cursor and no way to aim.
     *
     * Two halves to the fix: ask again a few times after closing (`regrabPointer`), and notice the
     * refusal here so the last word is a line the player can act on rather than nothing at all.
     */
    document.addEventListener('pointerlockerror', () => {
      if (this.sheetOpen || document.pointerLockElement) return;
      clearTimeout(this._lockMoan);
      this._lockMoan = setTimeout(() => {
        if (!document.pointerLockElement && !this.sheetOpen) this.log('Click the world to aim again.', '');
      }, 1800);
    });

    // `+` and `-` zoom the minimap. It is fixed at 26 cells otherwise, which is either far too
    // close for finding a town or far too wide for picking your way between trees.
    window.addEventListener('keydown', e => {
      if (this.sheetOpen) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        this.minimapSpan = Math.max(8, Math.round(this.minimapSpan * 0.72));
      } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        this.minimapSpan = Math.min(120, Math.round(this.minimapSpan * 1.4));
      } else return;
      e.preventDefault();
      this.log(`Minimap: ${Math.round(this.minimapSpan * 0.64)} km across.`);
    });

    /**
     * `L` shows the last fifty lines of the log.
     *
     * Everything the game explains goes through five lines in the bottom corner and is then gone,
     * with no way to read it again — so anything you looked away from was simply lost. Held off
     * while the sheet is open, where `1`-`7` and `R` already own the keyboard.
     */
    window.addEventListener('keydown', e => {
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      // K, not L: the user asked for L to be the light, on foot and in the ship. The log is the
      // thing that moved, because a light you cannot turn on at night is a worse problem than a
      // scrollback on an unfamiliar key.
      if (e.code !== 'KeyK' || this.sheetOpen) return;
      // …and not over a screen that already owns the whole window
      if (document.querySelector('#pause:not(.hidden), #map-screen:not(.hidden), .screen.chart:not(.hidden), #talk:not(.hidden)')) return;
      e.preventDefault();
      this.toggleLogHistory();
    });

    // Rich hover cards everywhere in the sheet. `title=""` was never going to be enough for an item
    // with six properties on it, and the user asked for the affixes "properly detailed".
    installTooltips();
    registerTip('item', node => this.itemCard(this.tipItems.get(node.dataset.tipItem)));
    registerTip('slot', node => {
      const item = this.player?.equipment?.[node.dataset.tipSlot];
      return item ? this.itemCard(item, { worn: true })
        : `<b>${SLOT_LABELS[node.dataset.tipSlot] || node.dataset.tipSlot}</b><div class="tip-dim">Nothing worn here.</div>`;
    });
    registerTip('material', node => {
      const m = this.craft?.M?.[node.dataset.tipMaterial];
      if (!m) return null;
      return `<b>${m.name}</b><div class="tip-dim">Tier ${m.tier} · you have ${this.craft.materials.count(node.dataset.tipMaterial)}</div>`
        + `<div class="tip-line">${m.desc || ''}</div>`;
    });
    registerTip('skill', node => {
      const s = this.skillState[+node.dataset.tipSkill];
      if (!s) return null;
      return `<b>${s.name}</b>`
        + (s.locked ? `<div class="tip-bad">Unlocks at level ${s.unlockAt}.</div>`
          : `<div class="tip-dim">${s.mp} mana · ${s.cooldown.toFixed(1)}s cooldown${s.ready > 0 ? ` · ${s.ready.toFixed(1)}s left` : ''}</div>`)
        + `<div class="tip-line">${s.desc || ''}</div>`;
    });
    registerTip('stat', node => `<b>${node.dataset.tipStat}</b><div class="tip-line">${STAT_HELP[node.dataset.tipStat] || ''}</div>`);
    /** Items shown in a tooltip are held by id, because a dataset can only carry a string. */
    this.tipItems = new Map();
    /** The bag row the pointer (or the keyboard) is on, so `R` knows what to recycle. */
    this.hoverItem = null;
    /** Holding Shift compares an item against the OTHER slot it could go in. */
    this.shiftHeld = false;
    const shift = on => {
      if (this.shiftHeld === on) return;
      this.shiftHeld = on;
      refreshTip();                     // the open card re-renders in place, without flicker
      // …and so does the standing compare panel, which is showing the same card
      if (this.tab === 'inventory') this.showCompare(this.hoverItem || null);
    };
    window.addEventListener('keydown', e => { if (e.key === 'Shift') shift(true); });
    window.addEventListener('keyup', e => { if (e.key === 'Shift') shift(false); });
    window.addEventListener('blur', () => shift(false));

    // `R` recycles the item under the pointer. The markup advertised it from the start and nothing
    // was listening — the ♺ button was the only way, and "recycle everything normal" did not touch
    // anything better than normal, which is what the user hit.
    window.addEventListener('keydown', e => {
      if (!this.sheetOpen || e.repeat) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code !== 'KeyR') return;
      e.preventDefault();
      const item = this.hoverItem;
      if (!item) { this.log('Point at something in the bag first, then press R.'); return; }
      if (!this.player?.bag.includes(item)) { this.log('That one is not in the bag.'); return; }
      hideTip();
      this.hoverItem = null;
      this.onRecycle?.(item);
      this.renderSheet();
    });

    /**
     * `1`–`7` pick a screen while the sheet is open.
     *
     * Safe: casting on the digit keys is already frozen while the sheet is open (main.js), and the
     * SELECT guard matters because the Boat and ship rows are real `<select>` elements.
     */
    window.addEventListener('keydown', e => {
      if (!this.sheetOpen || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const n = Number(e.key);
      if (!(n >= 1 && n <= SCREENS.length)) return;
      e.preventDefault();
      this.setTab(SCREENS[n - 1]);
    });

    $('sheet-close').onclick = () => this.toggleSheet(false);
    for (const btn of $('sheet-tabs').querySelectorAll('button')) {
      btn.onclick = () => this.setTab(btn.dataset.tab);
    }
    // "everything up to X" rather than "everything normal": the old button only ever took plain
    // items, which is why recycling a bag full of magic junk had to be done one row at a time.
    const RARITY_ORDER = ['normal', 'magic', 'rare', 'legendary'];
    const bulk = (upTo) => {
      const cap = RARITY_ORDER.indexOf(upTo);
      const junk = (this.player?.bag || []).filter(i =>
        !i.isUnique && !i.setId && RARITY_ORDER.indexOf(i.rarity || 'normal') <= cap);
      for (const item of junk) this.onRecycle?.(item, { quiet: true });
      this.log(junk.length
        ? `Recycled ${junk.length} item${junk.length > 1 ? 's' : ''} up to ${upTo}.`
        : `Nothing ${upTo} or below in the bag.`, junk.length ? 'loot' : '');
      hideTip();
      this.renderSheet();
    };
    /**
     * Two clicks, and the first one counts what it is about to destroy. These sat in a row of filter
     * chips, looked exactly like filter chips, and irreversibly recycled gear on a single click.
     */
    const RARITY_ORDER2 = RARITY_ORDER;
    const armBulk = (id, upTo, label) => {
      const btn = $(id);
      if (!btn) return;
      const reset = () => { btn.dataset.armed = ''; btn.textContent = label; btn.classList.remove('arm'); };
      btn.onclick = () => {
        const cap = RARITY_ORDER2.indexOf(upTo);
        const n = (this.player?.bag || []).filter(i =>
          !i.isUnique && !i.setId && RARITY_ORDER2.indexOf(i.rarity || 'normal') <= cap).length;
        if (!n) { this.log(`Nothing ${upTo} or below in the bag.`); return; }
        if (btn.dataset.armed !== '1') {
          btn.dataset.armed = '1';
          btn.textContent = `Recycle ${n}? Click again`;
          btn.classList.add('arm');
          setTimeout(reset, 4000);
          return;
        }
        reset();
        bulk(upTo);
      };
    };
    armBulk('inv-recycle-junk', 'normal', 'normal');
    armBulk('inv-recycle-magic', 'magic', 'magic');
    armBulk('inv-recycle-rare', 'rare', 'rare');
    this.buildMinimapBase();
  }

  // ---------------------------------------------------------------- log

  /**
   * Twelve lines, not five.
   *
   * The box held nine and was only tall enough to show about five of them, so the one line that
   * introduces a whole system — "The Bleak Moor is the Reach's ground." — was gone before it had
   * been read. Twelve stay up, all fifty stay in `history`, and the text is brighter than it was.
   */
  log(text, cls = '') {
    this.lines.unshift({ text, cls });
    if (this.lines.length > 12) this.lines.pop();
    this.history.unshift({ text, cls });
    if (this.history.length > 50) this.history.pop();
    const box = $('log');
    box.replaceChildren(...this.lines.map(l => el('div', l.cls, l.text)));
    if (this.historyOpen) this.drawLogHistory();
  }

  /** `L` opens and closes the history panel. */
  toggleLogHistory(on = !this.historyOpen) {
    this.historyOpen = !!on;
    const box = $('log-history');
    if (!box) return;
    box.classList.toggle('hidden', !this.historyOpen);
    if (this.historyOpen) this.drawLogHistory();
  }

  /** The panel behind `L`: the last fifty lines, newest at the top, in the same colours. */
  drawLogHistory() {
    const box = $('log-history-lines');
    if (!box) return;
    box.replaceChildren(...(this.history.length
      ? this.history.map(l => el('div', l.cls, l.text))
      : [el('div', 'muted small', 'Nothing has happened yet.')]));
  }

  /** The one-line "press E to…" strip above the hint. */
  prompt(text) {
    const box = $('prompt');
    if (!box) return;
    box.classList.toggle('hidden', !text);
    if (text) box.innerHTML = text;
  }

  /**
   * Announce a region as you walk into it — the name, its level band and what that means for you.
   * This is the one piece of Hack/Mine's presentation worth copying outright: without it the bands
   * exist only on the map, and a player who never opens the map never learns the world has any.
   */
  announceZone(zone, playerLevel) {
    const box = $('zone-banner');
    if (!box || !zone) return false;
    if (this.announcedZone === zone.id) return false;
    const first = this.announcedZone === undefined;
    this.announcedZone = zone.id;
    if (first && zone.home) return false;       // do not shout at the player on the loading frame
    const tone = zoneTone(zone.midLevel, playerLevel);
    box.querySelector('.zb-name').textContent = zone.name;
    box.querySelector('.zb-level').textContent = `level ${zone.minLevel}\u2013${zone.maxLevel}`;
    box.querySelector('.zb-level').className = 'zb-level zone-' + tone;
    box.querySelector('.zb-danger').textContent = zone.danger + ' · ' + TONE_WORDS[tone];
    box.className = 'hud zb-' + tone;
    box.classList.remove('hidden');
    // restart the animation even if the banner is already up
    box.style.animation = 'none';
    void box.offsetWidth;
    box.style.animation = '';
    clearTimeout(this.zoneTimer);
    this.zoneTimer = setTimeout(() => box.classList.add('hidden'), 5200);
    this.log(`${zone.name} — level ${zone.minLevel}\u2013${zone.maxLevel}, ${zone.danger.toLowerCase()}.`, tone === 'deadly' ? 'bad' : 'level');
    return true;
  }

  /**
   * The space reticles: a bracket round every world in view, with a card beside the one the
   * crosshair is on. `marks` comes from `space.marks()`, `under` is the targeted body and `card` is
   * `space.describe(under)` — which always says whether you can land, and if not, why not.
   *
   * Nodes are reused between frames: this runs at 60 fps and rebuilding a dozen elements a frame is
   * the kind of waste that shows up as a stutter.
   */
  /**
   * R14 — A RADIAL ARROW FOR ANYTHING OFF THE SIDE OF THE SCREEN.
   *
   *   "In the world, there should be a large animated pointer above the location or object to help
   *    the player find it, and a radial arrow pointing to it when its off-screen."
   *
   * The pointer itself is `js/beacon.js`, a column of light over the spot. This is its other half:
   * when the spot is behind you or past the edge, the beacon is doing nothing and an arrow pinned
   * to the rim of the screen is the only thing that can help.
   *
   * There were already two rim arrows in this file — the minimap's (`drawMinimap`) and space mode's
   * brackets (`reticles` above) — and neither is this one: the first is on a 180 px circle in the
   * corner and the second gives up the moment a thing leaves the view. This is the ELSE branch that
   * was never written.
   *
   * A node pool of five, built once, exactly like `this._ret` above: the panel it serves is redrawn
   * four times a second for the whole run, and five divs a redraw is fifteen thousand an hour.
   */
  edgeArrows(list = [], camera = null) {
    const box = $('edge-arrows');
    if (!box) return;
    if (!camera || !list.length) {
      if (this._edge) for (const n of this._edge) n.node.hidden = true;
      return;
    }
    const MAX = 5;
    if (!this._edge) {
      this._edge = [];
      for (let i = 0; i < MAX; i++) {
        const node = el('div', 'edge-arrow');
        node.hidden = true;
        node.innerHTML = '<i class="ea-tip"></i><span class="ea-name"></span><span class="ea-dist"></span>';
        box.append(node);
        this._edge.push({ node, tip: node.querySelector('.ea-tip'), name: node.querySelector('.ea-name'), dist: node.querySelector('.ea-dist'), key: null });
      }
    }

    const w = window.innerWidth, h = window.innerHeight;
    // the rim the arrows sit on: a little inside the screen so the whole arrow is visible
    const rx = w / 2 - 54, ry = h / 2 - 54;
    /**
     * A scratch vector without importing Three.js.
     *
     * `hud.js` deliberately has no Three.js import — it is the one big file that is pure DOM, and
     * `reticles` above works the same way, projecting vectors its caller built. `camera.position`
     * is a Vector3, so cloning it gives us one to reuse, and `.set()` overwrites it every row.
     */
    const v = camera.position.clone();

    for (let i = 0; i < MAX; i++) {
      const row = this._edge[i];
      const a = list[i];
      if (!a) { row.node.hidden = true; row.key = null; continue; }
      v.set(a.x, a.y ?? 0, a.z).project(camera);
      const behind = v.z > 1;
      // on screen and in front: the beacon in the world is doing this job, so the arrow steps back
      if (!behind && Math.abs(v.x) <= 0.96 && Math.abs(v.y) <= 0.96) { row.node.hidden = true; continue; }
      row.node.hidden = false;

      /**
       * A point behind the camera projects to the OPPOSITE side of the screen, which is how you get
       * an arrow pointing confidently away from the thing it is tracking. Flipping both axes when
       * `z > 1` is the standard fix and it is one line.
       */
      let dx = behind ? -v.x : v.x;
      let dy = behind ? -v.y : v.y;
      if (dx === 0 && dy === 0) dy = -1;
      // push the direction out to whichever rim it hits first
      const scale = Math.min(rx / Math.abs(dx * rx || 1e-6), ry / Math.abs(dy * ry || 1e-6));
      const px = w / 2 + dx * rx * scale;
      const py = h / 2 - dy * ry * scale;
      row.node.style.left = `${px}px`;
      row.node.style.top = `${py}px`;
      // the tip turns to point outward; 0 rad is up, and screen y runs down
      row.tip.style.transform = `rotate(${Math.atan2(dx, dy)}rad)`;
      if (row.key !== a.id) {
        row.key = a.id;
        row.name.textContent = a.name || '';
        row.node.style.color = a.color || '#ffd24a';
      }
      row.dist.textContent = a.where || '';
    }
  }

  reticles(marks, under = null, camera = null, card = null) {
    const box = $('reticles');
    if (!box) return;
    if (!marks || !marks.length || !camera) {
      if (this._ret?.length) { box.replaceChildren(); this._ret = null; }
      // the card hangs off the reticle, so it goes when the reticles do — otherwise it sat there
      // through the whole warp describing a world that was several hundred light years behind you
      $('space-card')?.classList.add('hidden');
      return;
    }
    if (!this._ret || this._ret.length !== marks.length) {
      this._ret = marks.map(() => {
        const n = el('div', 'reticle');
        n.innerHTML = '<i class="rt tl"></i><i class="rt tr"></i><i class="rt bl"></i><i class="rt br"></i>'
          + '<span class="rt-name"></span><span class="rt-dist"></span><span class="rt-mark"></span>';
        return n;
      });
      box.replaceChildren(...this._ret);
    }
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i], node = this._ret[i];
      const p = m.position.clone().project(camera);
      // behind the camera, or off the edge
      if (p.z > 1 || p.x < -1.25 || p.x > 1.25 || p.y < -1.25 || p.y > 1.25) { node.style.display = 'none'; continue; }
      node.style.display = '';
      // how big the disc looks, so the bracket hugs it rather than being a fixed square
      const edge = m.position.clone().add(camera.up.clone().multiplyScalar(m.radius)).project(camera);
      const px = Math.max(16, Math.abs(edge.y - p.y) * h * 1.35);
      node.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      node.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
      node.style.width = `${Math.min(px * 2, 420)}px`;
      node.style.height = `${Math.min(px * 2, 420)}px`;
      node.className = 'reticle'
        + (m.body === under ? ' on' : '')
        + (m.star ? ' star' : m.moon ? ' moon' : m.landable ? ' landable' : ' nolanding');
      node.querySelector('.rt-name').textContent = m.name;
      node.querySelector('.rt-dist').textContent = m.distance > 0 ? `${(m.distance / 14000).toFixed(2)} AU` : '';
      // "if you have a marker on a planet it should have an indicator in space mode" — a world with
      // something tracked on it wears its markers' glyphs above the bracket, so you can pick it out
      // of a system from an AU away without opening anything.
      const badge = node.querySelector('.rt-mark');
      const mine = m.markers || [];
      badge.textContent = mine.map(k => (MARKER_LOOKS[k] || MARKER_LOOKS.pin).icon).join(' ');
      badge.style.display = mine.length ? '' : 'none';
      if (mine.length) node.classList.add('marked');
    }

    // the card, beside the one you are pointing at
    const info = $('space-card');
    if (!info) return;
    info.classList.toggle('hidden', !card);
    if (!card) return;
    info.innerHTML = `<div class="sc-name">${card.name}</div>`
      + `<div class="sc-kind">${card.kind}${card.distanceAu != null ? ` · ${card.distanceAu.toFixed(2)} AU` : ''}</div>`
      + `<ul class="sc-lines">${card.lines.map(l => `<li>${l}</li>`).join('')}</ul>`
      + (card.markers?.length
        ? `<div class="sc-marks">${card.markers.map(m => `<span style="color:${(MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin).color}">${(MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin).icon}</span> ${m.name}`).join('<br>')}</div>`
        : '')
      + (card.landable
        ? `<div class="sc-land">${card.altitude != null && card.altitude < 1.8 ? '<b>J</b> to land' : 'Fly closer, then <b>J</b> to land'}</div>`
        : `<div class="sc-noland">${card.why}</div>`);
  }

  /** The boss health bar across the top. `null` hides it. */
  boss(unit) {
    const box = $('boss-bar');
    if (!box) return;
    box.classList.toggle('hidden', !unit);
    if (!unit) return;
    $('boss-name').textContent = `${unit.name} · level ${unit.level}`;
    $('boss-fill').style.width = Math.max(0, unit.hp / unit.maxHp * 100) + '%';
  }

  // ---------------------------------------------------------------- skill bar

  /**
   * Draw the slots. `state` is `skills.state()` — name, cooldown left, whether it can be used.
   * Rebuilt only when the shape changes; on every other frame it just moves the cooldown sweep,
   * because this runs at 60 fps and replacing nine nodes a frame is a waste.
   */
  skills(state) {
    const box = $('skillbar');
    if (!box) return;
    this.skillState = state || [];
    // `null` means "no bar" — in the ship, say, where 1-6 does nothing. Clear it once, not per frame.
    if (!state || !state.length) {
      if (this._skillSlots) { box.replaceChildren(); this._skillSlots = null; }
      return;
    }
    if (!this._skillSlots || this._skillSlots.length !== state.length) {
      this._skillSlots = state.map((s, i) => {
        const slot = el('div', 'skill-slot');
        slot.dataset.tipRender = 'skill';
        slot.dataset.tipSkill = String(i);
        slot.innerHTML = `<span class="skill-key">${i + 1}</span>`
          + `<span class="skill-name"></span>`
          + `<span class="skill-mp"></span>`
          + `<i class="skill-cd"></i>`
          + `<span class="skill-left"></span>`;
        return slot;
      });
      box.replaceChildren(...this._skillSlots);
    }
    for (let i = 0; i < state.length; i++) {
      const s = state[i], slot = this._skillSlots[i];
      // A locked slot used to read "level 7" and nothing else, so the bar you stare at all game told
      // you nothing about what you were working towards. Name the skill; put the level underneath.
      slot.querySelector('.skill-name').textContent = s.name;
      slot.querySelector('.skill-mp').textContent = s.locked ? `lvl ${s.unlockAt}` : (s.mp ? String(s.mp) : '');
      slot.querySelector('.skill-cd').style.height = `${Math.round((s.ready / s.cooldown) * 100)}%`;
      /**
       * C3: a dead key now says WHY it is dead. `blocked` covered both "on cooldown" and "you cannot
       * afford it", which look identical, so a key that did nothing gave you no reason.
       */
      const cooling = !s.locked && s.ready > 0;
      const poor = !s.locked && !cooling && !s.usable;
      slot.classList.toggle('blocked', !s.usable);
      slot.classList.toggle('cooling', cooling);
      slot.classList.toggle('poor', poor);
      slot.classList.toggle('locked', !!s.locked);
      slot.classList.toggle('ready', s.usable);
      const left = slot.querySelector('.skill-left');
      if (left) left.textContent = cooling && s.ready > 1.4 ? s.ready.toFixed(0) : '';
      // the hover card is the tooltip now; `title` would show a second, worse one over the top
    }
  }

  /**
   * FLOATING NUMBERS, WHERE YOU ARE LOOKING.
   *
   * Every hit, crit, heal and status tick went to the text log in the far corner of the screen, away
   * from the fight. A number that rises off the thing you hit is the whole feedback loop of a
   * real-time game, and it was the one piece missing. Off in Settings for people who hate them.
   */
  hit(worldPos, text, kind = '', camera = null) {
    if (!camera || !worldPos) return;
    if (this.settings && !this.settings.get('damageNumbers')) return;
    const box = $('hitnums');
    if (!box) return;
    const p = worldPos.clone().project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) return;
    const n = el('div', 'hitnum' + (kind ? ' ' + kind : ''), String(text));
    n.style.left = `${(p.x * 0.5 + 0.5) * window.innerWidth}px`;
    n.style.top = `${(-p.y * 0.5 + 0.5) * window.innerHeight}px`;
    // a little sideways scatter, so three hits in a second do not stack into one unreadable number
    n.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 26}px`);
    box.append(n);
    setTimeout(() => n.remove(), 900);
    // never let a long fight leave hundreds of dead nodes behind
    while (box.childElementCount > 40) box.firstElementChild.remove();
  }

  // ---------------------------------------------------------------- bars and place

  tick(player, { place, zone, clock, target, sky, weather, where, flying = false }) {
    /**
     * E10: IN SPACE THE HUD WAS STILL THE GROUND'S.
     *
     * Health, mana, the status chips and the objective line all stayed up while flying, where
     * nothing can hit you and nothing is a step away — and they sat over a minimap still drawing
     * the surface of the world you had just left. The name and the XP bar stay: they are the only
     * place the level is written.
     */
    this.flying = !!flying;
    $('hud-left').classList.toggle('flying', this.flying);
    const hpPct = Math.max(0, player.hp / player.maxHp * 100);
    $('bar-hp-fill').style.width = hpPct + '%';
    $('bar-hp-text').textContent = player.barrier > 0
      ? `${hpNum(player.hp)} / ${hpNum(player.maxHp)} +${hpNum(player.barrier)}`
      : `${hpNum(player.hp)} / ${hpNum(player.maxHp)}`;
    $('bar-mp-fill').style.width = (player.mp / player.maxMp * 100) + '%';
    $('bar-mp-text').textContent = `${hpNum(player.mp)} / ${hpNum(player.maxMp)}`;

    const lo = this._xpForLevel(player.level), hi = this._xpForLevel(player.level + 1);
    const pct = hi > lo ? Math.max(0, Math.min(100, (player.xp - lo) / (hi - lo) * 100)) : 100;
    $('bar-xp-fill').style.width = pct + '%';
    // it was a 6px unlabelled sliver, and the only XP number in the game was inside the sheet
    const xpText = $('bar-xp-text');
    if (xpText) xpText.textContent = hi > lo ? `${hpNum(player.xp - lo)} / ${hpNum(hi - lo)} to level ${player.level + 1}` : 'level 50';
    // `pendingAttr` is dead — attributes stopped being bought a point at a time in round 7
    const waiting = pointsLeft(player) ? `${pointsLeft(player)} perk` : player.pendingTalent ? `${player.pendingTalent} talent` : '';
    $('hud-name').innerHTML = `${player.name} <small>level ${player.level}${waiting ? ` · ${waiting} to spend` : ''}</small>`;

    /**
     * WHAT YOU ARE DOING. One line, fed from the marker book that already existed — the game used to
     * land you beside a town with a quest-giver forty metres away and say nothing at all.
     */
    const strip = $('hud-objective');
    if (strip) {
      const lead = this.objective?.();
      strip.classList.toggle('hidden', !lead);
      if (lead) {
        $('objective-name').textContent = lead.name;
        $('objective-where').textContent = lead.where || '';
      }
    }

    // statuses burning/chilling/buffing the player right now
    const chips = Object.values(player.statuses || {});
    const box = $('hud-statuses');
    if (box) box.replaceChildren(...chips.map(st => {
      const c = el('span', 'status-chip', `${st.name || st.type} ${st.remaining.toFixed(0)}s`);
      c.style.color = STATUS_COLOR[st.type] || '#cfd8e3';
      return c;
    }));

    $('hud-place-name').textContent = place || '';
    const zbox = $('hud-zone');
    if (zbox) {
      if (zone) {
        zbox.textContent = `level ${zone.minLevel}–${zone.maxLevel} · ${zone.danger}`;
        zbox.className = 'small zone-' + zoneTone(zone.midLevel, player.level);
      } else zbox.textContent = '';
    }
    $('hud-clock').textContent = clock || '';

    /**
     * C5: the target bar used to stick to something thirty metres away at full health with nothing on
     * it to say so — no distance, no out-of-reach state — and underground it stacked directly under
     * the boss bar, so two red bars sat on top of each other and only one had a name.
     */
    const bossUp = !$('boss-bar').classList.contains('hidden');
    if (target) {
      const box = $('target');
      box.classList.remove('hidden');
      box.classList.toggle('under-boss', bossUp);
      const away = Number.isFinite(target.distance) ? ` · ${Math.round(target.distance)} m` : '';
      const rank = target.rank && target.rank !== 'normal' ? ` · ${target.rank}` : '';
      box.classList.toggle('far', Number.isFinite(target.distance) && Number.isFinite(target.reach)
        && target.distance > target.reach + 1.5);
      $('target-name').textContent = `${target.name} · level ${target.level}${rank}${away}`;
      $('target-name').className = target.rank === 'rare' ? 'rarity-unique'
        : target.rank === 'champion' ? 'rarity-rare' : target.rank === 'boss' ? 'rarity-legendary' : '';
      $('target-fill').style.width = Math.max(0, target.hp / target.maxHp * 100) + '%';
    } else {
      $('target').classList.add('hidden');
    }
    if (sky) $('hud-sky').textContent = sky;
    if (weather !== undefined) $('hud-weather').textContent = weather;
    const scaleBox = $('hud-scale');
    if (scaleBox) scaleBox.textContent = this.minimapScaleText();
    const whereBox = $('hud-where');
    if (whereBox && where !== undefined) whereBox.textContent = where;
    // B2: nothing else redraws the minimap once the ship is in the air — see drawFlightMinimap
    this.drawFlightMinimap();
  }

  /** Where the player is, in every form worth pasting into a bug report. */
  /**
   * The line under the minimap. Where you are, not what the engine thinks.
   *
   * It used to print the seed, the metres and the map cell permanently, which is a debug readout —
   * useful to me, meaningless to a player, and it collided with the bottom of the minimap. The
   * coordinates come back with "Show coordinates" in Settings, and the debug menu still has them.
   */
  locationText(control, dungeon = null) {
    const coords = !!this.settings?.get?.('coords');
    if (dungeon) {
      return `${dungeon.name} · ${dungeon.plan.rooms.length} rooms · level ${dungeon.level}`
        + (coords ? ` · x ${Math.round(control.x)} z ${Math.round(control.z)}` : '');
    }
    const cell = this.terrain.cellAt(control.x, control.z);
    return `${this.terrain.biomeAt(control.x, control.z).name} · ${Math.round(control.y)} m`
      + (coords ? ` · seed ${this.seed} · x ${Math.round(control.x)} z ${Math.round(control.z)} · cell ${cell.x},${cell.y}` : '');
  }

  /** XP thresholds without importing the module twice. */
  /**
   * The XP curve, from the one place that owns it.
   *
   * This used to be a private copy of only the PRE-30 half of the curve (`58 * (l-1)^1.86`), so
   * every XP bar above level 30 was measured against a number the game does not use — the bar
   * looked full from 31 onwards. `rpg.xpForLevel` bands 30-40 and 40-50 on top of that.
   */
  _xpForLevel(level) { return xpForLevel(level); }

  // ---------------------------------------------------------------- minimap

  /**
   * Draw the whole planet map once into an offscreen canvas; the live map is a window onto it.
   *
   * This uses World Forge's own `worldPixels()` WITH HILLSHADE rather than painting raw biome
   * colour. Raw colour is why seed 9 came out as a white sheet: it is a 100% ice world, every cell
   * the same near-white, and `universe/` produces single-biome worlds constantly (ice, lava,
   * crystal, barren, void). Relief shading gives those worlds something to read.
   */
  buildMinimapBase() {
    const world = this.terrain.world;
    if (!world) { this.minimapBase = null; return; }
    const c = document.createElement('canvas');
    c.width = world.width; c.height = world.height;
    const ctx = c.getContext('2d');
    const px = worldPixels(world, { layer: 'biomes', hillshade: true, shade: 7 });
    const img = ctx.createImageData(world.width, world.height);
    img.data.set(px.data);
    ctx.putImageData(img, 0, 0);
    this.minimapBase = c;
  }

  /**
   * The minimap inside a dungeon: the room plan, not the planet. Drawing the world map down there
   * gave a black square, because the dungeon's coordinates are its own and start at the origin.
   */
  drawDungeonMap(player, plan, enemies = [], chests = []) {
    const canvas = $('minimap');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const b = plan.bounds;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) + 12;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const to = (x, z) => [(x - cx) / span * size + size / 2, (z - cz) / span * size + size / 2];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0a0806'; ctx.fillRect(0, 0, size, size);
    // corridors under the rooms
    ctx.strokeStyle = '#3a342a';
    ctx.lineWidth = Math.max(2, plan.corridor / span * size);
    for (const h of plan.halls) {
      const midX = h.bendX ? h.bx : h.ax;
      const [ax, az] = to(h.ax, h.az), [mx, mz] = to(midX, h.bendX ? h.az : h.bz), [bx, bz] = to(h.bx, h.bz);
      ctx.beginPath(); ctx.moveTo(ax, az); ctx.lineTo(mx, mz); ctx.lineTo(bx, bz); ctx.stroke();
    }
    for (const r of plan.rooms) {
      const [x, z] = to(r.x - r.w / 2, r.z - r.h / 2);
      ctx.fillStyle = r.kind === 'boss' ? '#5a3a2a' : r.kind === 'entrance' ? '#3a4a3a' : '#443c30';
      ctx.fillRect(x, z, r.w / span * size, r.h / span * size);
    }
    for (const c of chests) {
      if (c.opened) continue;
      const [x, z] = to(c.x, c.z);
      ctx.fillStyle = '#ffd24a'; ctx.fillRect(x - 2, z - 2, 4, 4);
    }
    for (const e of enemies) {
      if (e.dying != null) continue;
      const [x, z] = to(e.x, e.z);
      ctx.beginPath(); ctx.arc(x, z, e.rank === 'boss' ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = e.rank === 'boss' ? '#ffd24a' : e.rank === 'normal' ? '#ff4a2a' : '#6ab0ff';
      ctx.fill();
    }
    const [px, pz] = to(player.x, player.z);
    ctx.save();
    ctx.translate(px, pz); ctx.rotate(-player.yaw);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(10,8,6,.9)'; ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /**
   * The minimap, in space: the system from above instead of the ground you left.
   *
   * The canvas is never cleared between modes, so flying away from a world left the planet's
   * surface — with a little player arrow standing on it — up for the whole flight. Everything here
   * comes from the positions `space.js` has already worked out this frame, so there is no second
   * copy of where anything is and nothing else has to be loaded to draw it.
   *
   * `bodies` are `{ x, z, au, giant, moon, target }` in AU, `ship` is `{ x, z }` in AU.
   */
  drawSystemMap({ bodies = [], ship = null, yaw = 0 } = {}) {
    const canvas = $('minimap');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#06080f';
    ctx.fillRect(0, 0, size, size);

    // fit the whole system, or the ship if it has wandered outside the outermost orbit. The floor is
    // small on purpose: a red dwarf holds all of its worlds inside about half an AU, and a fixed
    // one-AU box drew that system as five dots in the middle of nothing.
    let reach = 0.2;
    for (const b of bodies) reach = Math.max(reach, Math.hypot(b.x, b.z));
    if (ship) reach = Math.max(reach, Math.hypot(ship.x, ship.z));
    const span = reach * 2.25;
    this.systemSpanAu = span;
    const to = (x, z) => [x / span * size + size / 2, z / span * size + size / 2];

    // the orbits first, so nothing is drawn through a planet
    for (const b of bodies) {
      const r = Math.hypot(b.x, b.z) / span * size;
      if (!(r > 0.5)) continue;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = b.target ? 'rgba(127,216,255,.5)' : 'rgba(120,150,190,.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // the star, then the worlds on their orbits
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd24a';
    ctx.fill();
    for (const b of bodies) {
      const [x, z] = to(b.x, b.z);
      ctx.beginPath();
      ctx.arc(x, z, b.giant ? 3.6 : 2.4, 0, Math.PI * 2);
      ctx.fillStyle = b.target ? '#7fd8ff' : '#9fb0c8';
      ctx.fill();
      if (b.target) {
        ctx.beginPath();
        ctx.arc(x, z, 6.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(127,216,255,.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    if (!ship) return;
    const [sx, sz] = to(ship.x, ship.z);
    ctx.save();
    ctx.translate(sx, sz);
    // the ship's heading is (sin yaw, cos yaw) looking down on the system, and the arrow is drawn
    // pointing up the screen — hence the half turn
    ctx.rotate(Math.PI - yaw);
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(6,8,15,.9)';
    ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /**
   * B2: THE MINIMAP WHILE YOU ARE FLYING THE SHIP.
   *
   * "The minimap does not update while flying — it appears stuck to the player's old on-foot
   * position." It was: main.js draws the minimap from the walking controller at the bottom of the
   * ground tick, and flight returns out of `stepFlight` long before it, so the canvas simply kept
   * whatever was last painted on it — the ground you took off from, with an arrow standing on it.
   *
   * In the air the ship IS the player: `air.state` carries the same x/z/yaw, so the ordinary planet
   * minimap is the right thing to draw, and B9 says so outright ("in atmosphere it should switch to
   * the planet minimap"). Driven from `tick()` rather than from main.js because that file belongs to
   * another agent this round; the one line there would be, inside the `mode === 'air'` branch:
   *   if (state.frames % 6 === 0) hud.drawMinimap(air.state, field.enemies, [], []);
   */
  drawFlightMinimap() {
    const g = typeof window !== 'undefined' ? window.farhold : null;
    if (!g || g.mode !== 'air') return;
    const ship = g.air?.state;
    if (!ship || !Number.isFinite(ship.x)) return;
    this._airFrames = (this._airFrames || 0) + 1;
    if (this._airFrames % 6) return;                 // six times less work, same apparent smoothness
    // the night wash is set by the ground tick, which is not running — take it off the sky directly
    const sunY = g.sky?.sunDirection?.y;
    if (Number.isFinite(sunY)) this.daylight = Math.max(0.28, Math.min(1, sunY * 1.7 + 0.3));
    const book = g.markers;
    const marks = book ? book.tracked().map(m => {
      const b = book.bearing(m, ship, this.terrain);
      return { ...m, x: b.x, z: b.z, distance: b.distance };
    }) : [];
    this.drawMinimap(ship, g.field?.enemies || [], [], marks);
  }

  drawMinimap(player, enemies = [], extras = [], markers = []) {
    const canvas = $('minimap');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const span = this.minimapSpan * (this.revealMul || 1);   // `+`/`-` set the base; an affix widens it
    const cx = player.x / M_PER_CELL, cy = player.z / M_PER_CELL;
    if (this.minimapBase) {
      ctx.drawImage(this.minimapBase, cx - span / 2, cy - span / 2, span, span, 0, 0, size, size);
      /**
       * C8: at night the map stayed in full daylight colours while the world outside it was dark.
       * One multiply over the base image, driven by the same gloom the sky uses.
       */
      const dark = 1 - Math.max(0, Math.min(1, this.daylight ?? 1));
      if (dark > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `rgba(${Math.round(90 + 110 * (1 - dark))}, ${Math.round(100 + 110 * (1 - dark))}, ${Math.round(140 + 90 * (1 - dark))}, 1)`;
        ctx.fillRect(0, 0, size, size);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = '#14100c';
      ctx.fillRect(0, 0, size, size);
    }
    const toPx = (wx, wz) => [
      ((wx / M_PER_CELL) - (cx - span / 2)) / span * size,
      ((wz / M_PER_CELL) - (cy - span / 2)) / span * size,
    ];
    const pip = (wx, wz, colour, r = 3.6) => {
      const [px, py] = toPx(wx, wz);
      if (px < -4 || py < -4 || px > size + 4 || py > size + 4) return;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = colour;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(10,8,6,.95)';
      ctx.stroke();
    };
    // chests, dungeon mouths and the folk worth talking to, under the enemy pips
    for (const x of extras) {
      if (x.icon) {
        const [ix, iy] = toPx(x.x, x.z);
        if (ix < -8 || iy < -8 || ix > size + 8 || iy > size + 8) continue;
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,16,.95)';
        ctx.strokeText(x.icon, ix, iy);
        ctx.fillStyle = x.color;
        ctx.fillText(x.icon, ix, iy);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else pip(x.x, x.z, x.color, x.r || 3.2);
    }
    // …and which way is up. A map with no north mark and no scale is a picture.
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,16,.9)';
    ctx.strokeText('N', size / 2, 11);
    ctx.fillStyle = 'rgba(220, 232, 246, .85)';
    ctx.fillText('N', size / 2, 11);
    ctx.textAlign = 'left';

    // enemies: a red pip with a dark ring, so they read over snow, sand and grass alike; a
    // champion or a rare gets its own colour, because that is the pip worth walking towards
    for (const e of enemies) {
      if (e.dying != null) continue;
      const colour = e.rank === 'boss' ? '#ffd24a' : e.rank === 'rare' ? '#ff8adf' : e.rank === 'champion' ? '#6ab0ff' : '#ff4a2a';
      pip(e.x, e.z, colour, e.rank && e.rank !== 'normal' ? 4.6 : 3.6);
    }
    // ---- tracked markers: a pin where it is, or an arrow at the rim pointing the way there
    // "If it's too far to display on the minimap, an arrow indicating its direction should show
    // instead." The rim arrow sits on the edge of the circle at the marker's true bearing, with the
    // distance written beside it, so a marker off the map still tells you which way to walk.
    // nearest first, so when two rim arrows land on top of each other the closer one keeps its label
    const labelled = [];
    for (const m of [...markers].sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))) {
      const look = MARKER_LOOKS[m.kind] || MARKER_LOOKS.pin;
      const [mx, my] = toPx(m.x, m.z);
      const inside = mx > 10 && my > 10 && mx < size - 10 && my < size - 10;
      if (inside) {
        ctx.font = '700 12px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(8,10,16,.95)';
        ctx.strokeText(look.icon, mx, my);
        ctx.fillStyle = m.done ? '#9ae06a' : look.color;
        ctx.fillText(look.icon, mx, my);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        continue;
      }
      // off the window: park an arrow on the rim, pointing the right way
      const r = size / 2 - 11;
      const ang = Math.atan2(my - size / 2, mx - size / 2);
      const ax = size / 2 + Math.cos(ang) * r, ay = size / 2 + Math.sin(ang) * r;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.closePath();
      ctx.fillStyle = m.done ? '#9ae06a' : look.color;
      ctx.strokeStyle = 'rgba(8,10,16,.95)'; ctx.lineWidth = 1.6;
      ctx.fill(); ctx.stroke();
      ctx.restore();
      // the distance, tucked inside the arrow — but only where it will not land on another one's
      const tx = size / 2 + Math.cos(ang) * (r - 16), ty = size / 2 + Math.sin(ang) * (r - 16);
      const clear = labelled.every(l => Math.hypot(l[0] - tx, l[1] - ty) > 26);
      if (m.distance != null && clear) {
        labelled.push([tx, ty]);
        ctx.font = '600 9px system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,16,.95)';
        ctx.strokeText(distanceText(m.distance), tx, ty);
        ctx.fillStyle = '#e8dfd2';
        ctx.fillText(distanceText(m.distance), tx, ty);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      }
    }

    const [px, py] = toPx(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    /**
     * The arrow used to point due north whenever you walked south.
     *
     * The map draws +z DOWNWARDS, and the player's facing is `(sin yaw, cos yaw)` in (x, z) — so at
     * yaw 0 the character walks toward the BOTTOM of the map. The arrow is modelled tip-up, and
     * rotating it by `-yaw` left it tip-up too. The rotation that carries (0,-1) onto
     * (sin yaw, cos yaw) is `π - yaw`, not `-yaw`.
     */
    ctx.rotate(Math.PI - player.yaw);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(10,20,32,.9)'; ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- character sheet

  /** How much of the world the minimap window covers, in km — printed under it. */
  minimapScaleText() {
    // in space the same box is the system seen from above, and km is the wrong unit for that
    if (this.flying) return this.systemSpanAu ? `${fmt(this.systemSpanAu)} AU across` : '';
    return `${(this.minimapSpan * M_PER_CELL / 1000).toFixed(1)} km across`;
  }

  toggleSheet(open = !this.sheetOpen) {
    hideTip();
    this.sheetOpen = open;
    $('sheet').classList.toggle('hidden', !open);
    if (open) {
      this._returnFocus = document.activeElement;
      this.onOpenSheet?.();
      this.renderSheet();
      // put the keyboard somewhere sensible, or Tab starts at the top of the document
      $('sheet-tabs').querySelector('button.on')?.focus();
    } else {
      this.regrabPointer();
      this._returnFocus?.focus?.();
    }
    return open;
  }

  /**
   * D3: ask for the mouse back, and keep asking for a moment.
   *
   * `onCloseSheet` is main.js's `regrab()`, which is already a no-op when a panel still owns the
   * mouse or the lock is already held — so asking three more times costs nothing and covers the one
   * window where the browser turns the first ask down flat (see the note in the constructor). The
   * delays step over Chrome's roughly one-second lock-out after an exit.
   */
  regrabPointer() {
    this.onCloseSheet?.();
    const again = () => {
      if (this.sheetOpen || document.pointerLockElement) return;
      this.onCloseSheet?.();
    };
    for (const ms of [140, 420, 1300]) setTimeout(again, ms);
  }

  setTab(tab) {
    hideTip();
    this.tab = tab;
    for (const btn of $('sheet-tabs').querySelectorAll('button')) {
      btn.classList.toggle('on', btn.dataset.tab === tab);
      btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
    }
    for (const body of document.querySelectorAll('.tab-body')) body.classList.toggle('hidden', body.dataset.tab !== tab);
    $('sheet-title').textContent = SHEET_TITLES[tab] || 'Character';
    this.renderSheet();
  }

  /**
   * The header, the rail badges, and then only the tab you are looking at.
   *
   * The header is the same on all seven screens: who you are, how far to the next level, what
   * crafting material you are holding and how much gold. Materials used to appear on the Crafting
   * and Upgrade screens only — which are the two screens where you already know, and neither of the
   * screens where you decide whether to recycle something.
   */
  renderSheet() {
    const player = this.player;
    if (!player) return;
    /**
     * KEEP THE SCROLL.
     *
     * This runs on every equip, recycle, spend, craft and perk pick, and it `replaceChildren`s every
     * list on the visible screen. Without this, recycling the fortieth item in the bag threw you back
     * to the first. The position is kept on the PANE, which is why `.pane-body` is the only scroller
     * in every screen.
     */
    const keep = [...document.querySelectorAll('#sheet .pane-body')].map(n => [n, n.scrollTop]);
    $('sheet-purse').innerHTML = `<b>${player.gold}</b> gold`;
    const who = $('sheet-who');
    if (who) {
      who.innerHTML = `<b>${player.name}</b>`
        + `<span class="who-class">${player.classLabel || player.classId || ''}</span>`
        + `<span class="who-level">level ${player.level}</span>`;
    }
    const lo = xpForLevel(player.level), hi = xpForLevel(player.level + 1);
    const fill = $('sheet-xp-fill'), xpText = $('sheet-xp-text');
    if (fill) fill.style.width = (hi > lo ? Math.max(0, Math.min(100, (player.xp - lo) / (hi - lo) * 100)) : 100) + '%';
    if (xpText) xpText.textContent = hi > lo ? `${hpNum(hi - player.xp)} xp to level ${player.level + 1}` : 'level 50';
    this.drawMaterials('sheet-materials');
    this.railBadges();

    if (this.tab === 'character') this.renderCharacter();
    if (this.tab === 'inventory') this.renderInventory();
    if (this.tab === 'skills') this.renderSkills();
    if (this.tab === 'perks') this.renderPerks();
    if (this.tab === 'crafting') this.renderCrafting();
    if (this.tab === 'upgrade') this.renderUpgrade();
    if (this.tab === 'journal') this.renderJournal();
    for (const [node, top] of keep) node.scrollTop = top;
  }

  /**
   * A number on the rail for anything waiting to be spent.
   *
   * Unspent attribute, perk and talent points are invisible today unless you happen to open the
   * screen they belong to, so a character can walk around for an hour three perks poorer than they
   * should be. Same for a finished quest waiting to be handed in.
   */
  railBadges() {
    const player = this.player;
    const set = (tab, n) => {
      const b = $('rail-badge-' + tab);
      if (!b) return;
      b.hidden = !n;
      if (n) { b.textContent = String(n); b.title = `${n} waiting`; }
    };
    // R14: `pendingAttr` has not been incremented by anything since round 7, so this badge could
    // only ever read zero. The Character tab has nothing waiting on it — perks and talents do.
    set('character', 0);
    set('perks', pointsLeft(player));
    // `tiersOpen` returns a COUNT of open tiers, not a list of them
    const openTiers = tiersOpen(player.level);
    let talentsOpen = 0;
    for (const skill of this.skillState || []) {
      if (skill.locked) continue;
      const picks = picksFor(player, skill.id);
      for (let tier = 1; tier <= openTiers; tier++) if (!picks[tier]) talentsOpen++;
    }
    set('skills', talentsOpen);
    const quests = this.journal?.()?.quests || [];
    set('journal', quests.filter(q => q.done).length);   // finished, waiting to be handed in
  }

  /** The worn-gear grid, used by both the character and inventory tabs. */
  slotGrid(target) {
    const player = this.player;
    const grid = $(target);
    if (!grid) return;
    grid.replaceChildren(...SLOTS.map(slot => {
      const item = player.equipment[slot];
      const div = el('div', 'slot');
      div.innerHTML = `<span class="label">${SLOT_LABELS[slot]}</span>
        <span class="name ${item ? rarityClass(item) : 'muted'}">${item ? displayName(item) : '—'}</span>`;
      div.dataset.tipRender = 'slot';
      div.dataset.tipSlot = slot;
      // the rarity as a colour down the left edge of the plate, the same as in the bag
      div.dataset.rarity = item
        ? (item.setId ? 'set' : item.isUnique ? 'unique' : (item.rarity || 'normal'))
        : 'none';
      div.tabIndex = 0;
      div.onclick = () => { if (item) { this.onEquip(null, slot); hideTip(); this.renderSheet(); } };
      return div;
    }));
  }

  renderCharacter() {
    const player = this.player;
    const d = player.derived;
    this.slotGrid('sheet-slots');

    const rows = [
      ['Health', `${hpNum(player.hp)} / ${hpNum(d.maxHp)}`],
      ['Mana', `${hpNum(player.mp)} / ${hpNum(d.maxMp)}`],
      ['Damage', `${hpNum(d.damage[0])}–${hpNum(d.damage[1])}`],
      ['Armour', hpNum(d.armor)],
      ['Magic resistance', hpNum(d.magicResist)],
      ['Crit', `${fmt(d.critChance)}% for +${hpNum(d.critDamage)}%`],
      ['Dodge', `${fmt(d.dodge)}%`],
      ['Accuracy', d.hit ? `+${fmt(d.hit)}% (cancels ${fmt(d.hit / 2)}% of their dodge)` : '—'],
      ['Block', d.blockChance ? `${fmt(d.blockChance)}% for ${hpNum(d.blockPower)}` : '—'],
      ['Barrier', d.barrier ? `${hpNum(player.barrier || 0)} / ${hpNum(d.barrier)}` : '—'],
      ['Attack speed', `${fmt(1 / (d.attackEvery || 0.62))} a second${d.haste ? ` (+${fmt(d.haste)}%)` : ''}`],
      ['Cooldowns', d.cooldownReduction ? `-${fmt(d.cooldownReduction)}%` : '—'],
      ['Move speed', `${fmt(d.moveSpeed)} m/s`],
      ['Better loot', d.magicFind ? `+${fmt(d.magicFind)}%` : '—'],
      ['Gold find', d.goldFind ? `+${fmt(d.goldFind)}%` : '—'],
      ['Kills', player.kills],
      /**
       * R14 — THE FOUR ATTRIBUTES, AS A READOUT.
       *
       *   "Remove attributes from the Character screen, but keep them under stats. STR/DEX/INT/CON
       *    can still be used but is instead gained through perks."
       *
       * They were their own pane with a `+` button beside each one, and those buttons had been dead
       * since round 7: the perk forest replaced point-buy and nothing has incremented
       * `player.pendingAttr` since, so the pane read "no points to spend" for the whole of a run.
       * The numbers themselves are still real and still do work — `js/perks.js` hands out `str`,
       * `dex`, `int` and `con` on its nodes — so they belong with the other things you read and
       * cannot click.
       */
      ['Strength', player.attrs?.str ?? 0],
      ['Dexterity', player.attrs?.dex ?? 0],
      ['Intellect', player.attrs?.int ?? 0],
      ['Constitution', player.attrs?.con ?? 0],
    ];
    /**
     * Sixteen rows in one list read as a wall — "did that chest help" was a question you answered by
     * counting. They are three groups now, in three lists, and on a wide screen each group is two
     * pairs of columns. `STAT_HELP` tooltips hang off `dt.dataset.tipStat`, not off position, so they
     * follow the rows wherever they go.
     */
    const GROUPS = {
      // R14: first, because they are what the rest is built out of
      attrs: ['Strength', 'Dexterity', 'Intellect', 'Constitution'],
      offence: ['Damage', 'Crit', 'Accuracy', 'Attack speed', 'Cooldowns'],
      defence: ['Health', 'Armour', 'Magic resistance', 'Dodge', 'Block', 'Barrier'],
      utility: ['Mana', 'Move speed', 'Better loot', 'Gold find', 'Kills'],
    };
    const statRow = ([k, v]) => {
      const dt = el('dt', null, k);
      if (STAT_HELP[k]) { dt.dataset.tipRender = 'stat'; dt.dataset.tipStat = k; dt.tabIndex = 0; }
      return [dt, el('dd', null, String(v))];
    };
    /**
     * Six of eighteen rows read "—" at level 1, and a dash does not tell you whether that means zero
     * or does-not-apply. They are hidden by default and a toggle in the pane header brings them back,
     * because once you are wearing something with block on it you do want to see it.
     */
    const byName = new Map(rows.map(r => [r[0], r]));
    // R14: an attribute reading 0 is a fact about your character, not an empty row, and the four of
    // them vanishing under "hide the empty ones" would put the pane straight back where it was.
    const ATTRS = new Set(GROUPS.attrs);
    const blank = v => v === '—' || v === '0' || v === 0;
    const showAll = !!this.showAllStats;
    let hidden = 0;
    for (const [group, names] of Object.entries(GROUPS)) {
      const box = $('sheet-stats-' + group);
      if (!box) continue;
      const wanted = names.filter(n => byName.has(n)).filter(n => {
        if (showAll || ATTRS.has(n)) return true;
        const keep = !blank(byName.get(n)[1]);
        if (!keep) hidden++;
        return keep;
      });
      box.replaceChildren(...wanted.flatMap(n => statRow(byName.get(n))));
    }
    const more = $('sheet-stats-more');
    if (more) {
      more.textContent = showAll ? 'hide the empty ones' : (hidden ? `show ${hidden} more` : '');
      more.hidden = !hidden && !showAll;
      if (!more.dataset.wired) {
        more.dataset.wired = '1';
        more.onclick = () => { this.showAllStats = !this.showAllStats; this.renderSheet(); };
      }
    }


    /**
     * The boat and the ship: a DROPDOWN, not an equipment slot.
     *
     * "In the inventory, instead of equipping them from a list you change them using a dropdown.
     * This treats them more as unlockables than items, and keeps them out of the loot pool."
     */
    const vbox = $('sheet-vehicles');
    if (vbox) {
      const kids = [];
      for (const [slot, spec] of Object.entries(VEHICLES)) {
        const owned = player.vehicles?.owned?.[slot] || [spec.starter];
        const active = player.vehicles?.active?.[slot] || spec.starter;
        const row = el('div', 'vehicle-row');
        row.append(el('span', 'muted small', slot === 'boat' ? 'Boat' : 'Ship'));
        const select = el('select');
        for (const key of owned) {
          const kind = spec.kinds[key];
          if (!kind) continue;
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = kind.name;
          opt.selected = key === active;
          select.append(opt);
        }
        select.onchange = () => this.onSelectVehicle?.(slot, select.value);
        row.append(select);
        /**
         * D7: what the thing DOES, not a joke about it.
         *
         * The line under these two dropdowns used to be the vehicle's lore — "Six logs and a great
         * deal of rope. It floats, which is the entire specification." — on a screen that is
         * otherwise a column of numbers. This is built out of the vehicle's own figures instead, so
         * picking between two of them is a comparison rather than a read.
         */
        row.append(el('span', 'muted small', vehicleFunction(slot, spec.kinds[active])));
        kids.push(row);
      }
      vbox.replaceChildren(...kids);
    }

    // companions
    const petBox = $('sheet-pets');
    if (petBox) {
      const roster = this.pets?.roster?.() || [];
      petBox.replaceChildren(...(roster.length ? roster.map(p => {
        const row = el('div', 'pet-row');
        row.innerHTML = `<span>${p.name}</span><span class="muted small">${p.hp}/${p.maxHp} · ${p.state}</span>`;
        return row;
      }) : [el('p', 'muted small', 'This class fights alone.')]));
    }

    // every power on your gear, in plain language — the "carried but not wired up" list is gone,
    // because nothing is carried and unwired any more
    const powers = $('sheet-powers');
    if (powers) {
      const lines = [];
      for (const [slot, item] of Object.entries(player.equipment)) {
        for (const a of item?.affixes || []) {
          if (a.baseIntrinsic && !a.brand && !a.intrinsic) continue;
          lines.push({ from: displayName(item), text: describeAffix(a), rarity: rarityClass(item) });
        }
      }
      for (const id of player.legendaryPowers || []) {
        lines.push({ from: 'set or legendary', text: id.replace('legendary:', '').replace(/_/g, ' '), rarity: 'rarity-legendary' });
      }
      powers.replaceChildren(...(lines.length ? lines.map(l => {
        const row = el('div', 'power-row');
        row.innerHTML = `<span class="${l.rarity}">${l.from}</span><span class="muted">${l.text}</span>`;
        return row;
      }) : [el('p', 'muted small', 'Nothing on your gear does anything clever yet.')]));
      // …and the pane shrinks to fit when there is nothing in it, so what is below rises
      powers.closest('.pane')?.classList.toggle('empty', !lines.length);
    }

    $('sheet-inert').textContent = d.inert?.length
      ? `Not understood by the effect registry: ${d.inert.join(', ')}`
      : '';
  }

  /**
   * The bag, filtered, sorted, and compared against what you are wearing.
   *
   * What this screen is for, in order: decide whether a drop beats what you have on, clear the junk
   * out, and find one particular thing. None of those had any help before — the bag was one flex
   * column with no filter, no sort and no count, and the only comparison was a tooltip that followed
   * the pointer, covered the row under it and vanished the moment you moved to the next row.
   *
   * Every filter reads a field an item already has (`type`, `slot`, `rarity`, `isUnique`, `setId`).
   * Nothing here invents data.
   */
  renderInventory() {
    const player = this.player;
    this.slotGrid('inv-slots');
    this.bagFilter = this.bagFilter || { kind: 'all', rarity: 'any' };
    this.bagSort = this.bagSort || 'score';
    this.bagView = this.bagView || 'list';
    this.buildBagControls();

    const KIND = {
      all: () => true,
      weapon: i => i.type === 'weapon',
      armour: i => ['head', 'chest', 'legs', 'hands', 'feet', 'offhand'].includes(i.slot),
      jewel: i => ['ring', 'ring1', 'ring2', 'necklace'].includes(i.slot),
      other: i => ['mount', 'light'].includes(i.slot) || !!i.quiver,
    };
    const RANK = { normal: 0, magic: 1, rare: 2, legendary: 3 };
    const floor = { any: -1, magic: 1, rare: 2, legendary: 3 }[this.bagFilter.rarity] ?? -1;
    const keep = i => (KIND[this.bagFilter.kind] || KIND.all)(i)
      // a unique or a set piece always survives a rarity floor — it is never "below magic"
      && (i.isUnique || i.setId || (RANK[i.rarity] ?? 0) >= floor);
    const rows = player.bag.filter(keep);

    const key = {
      score: i => -itemScore(i),
      rarity: i => -((RANK[i.rarity] ?? 0) + (i.isUnique || i.setId ? 4 : 0)),
      slot: i => String(i.slot || ''),
      name: i => i.name,
    }[this.bagSort] || (i => -itemScore(i));
    rows.sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : String(a.name).localeCompare(String(b.name));
    });

    $('inv-count').textContent = rows.length === player.bag.length
      ? `${player.bag.length} item${player.bag.length === 1 ? '' : 's'}`
      : `${rows.length} of ${player.bag.length}`;

    const bag = $('sheet-bag');
    bag.classList.toggle('bag--grid', this.bagView === 'grid');
    if (!player.bag.length) {
      const empty = el('div', 'empty-state');
      empty.innerHTML = '<b>Nothing in the bag yet.</b><span>Kill something, or open a chest.</span>';
      bag.replaceChildren(empty);
    } else if (!rows.length) {
      const empty = el('div', 'empty-state');
      empty.innerHTML = '<b>Nothing matches.</b><span>Widen the filters above.</span>';
      bag.replaceChildren(empty);
    } else {
      bag.replaceChildren(...rows.map(item => this.bagRow(item)));
    }
    this.showCompare(this.hoverItem || null);
  }

  /**
   * The two chipbars and the two view buttons, built ONCE.
   *
   * `renderSheet` calls `replaceChildren` on every list in the visible screen, on every equip and
   * every recycle. A chip rebuilt out from under a mid-click pointer swallows the click, so these are
   * built on first render and afterwards only have a class toggled — the `dataset.wired` pattern the
   * perk canvas already uses.
   */
  buildBagControls() {
    const KINDS = [['all', 'All'], ['weapon', 'Weapons'], ['armour', 'Armour'], ['jewel', 'Jewellery'], ['other', 'Other']];
    const RARITIES = [['any', 'Any'], ['magic', 'Magic +'], ['rare', 'Rare +'], ['legendary', 'Legendary +']];
    const SORTS = [['score', 'How it compares'], ['rarity', 'Rarity'], ['slot', 'Slot'], ['name', 'Name']];

    const filters = $('inv-filters'), sorts = $('inv-sort');
    if (filters && !filters.dataset.wired) {
      filters.dataset.wired = '1';
      const kids = [el('span', 'chip-label', 'Show')];
      for (const [value, label] of KINDS) {
        const b = el('button', 'chip', label);
        b.dataset.kind = value;
        b.onclick = () => { this.bagFilter.kind = value; this.renderSheet(); };
        kids.push(b);
      }
      kids.push(el('span', 'sep'), el('span', 'chip-label', 'Rarity'));
      for (const [value, label] of RARITIES) {
        const b = el('button', 'chip', label);
        b.dataset.rarityFilter = value;
        b.onclick = () => { this.bagFilter.rarity = value; this.renderSheet(); };
        kids.push(b);
      }
      filters.replaceChildren(...kids);
    }
    if (sorts && !sorts.dataset.wired) {
      sorts.dataset.wired = '1';
      const kids = [el('span', 'chip-label', 'Sort by')];
      for (const [value, label] of SORTS) {
        const b = el('button', 'chip', label);
        b.dataset.sort = value;
        b.onclick = () => { this.bagSort = value; this.renderSheet(); };
        kids.push(b);
      }
      sorts.replaceChildren(...kids);
    }
    for (const b of filters?.querySelectorAll('[data-kind]') || []) b.classList.toggle('on', b.dataset.kind === this.bagFilter.kind);
    for (const b of filters?.querySelectorAll('[data-rarity-filter]') || []) b.classList.toggle('on', b.dataset.rarityFilter === this.bagFilter.rarity);
    for (const b of sorts?.querySelectorAll('[data-sort]') || []) b.classList.toggle('on', b.dataset.sort === this.bagSort);

    for (const [id, view] of [['inv-view-list', 'list'], ['inv-view-grid', 'grid']]) {
      const b = $(id);
      if (!b) continue;
      if (!b.dataset.wired) {
        b.dataset.wired = '1';
        b.onclick = () => { this.bagView = view; this.renderSheet(); };
      }
      b.classList.toggle('on', this.bagView === view);
      b.setAttribute('aria-pressed', this.bagView === view ? 'true' : 'false');
    }
  }

  /**
   * Fill the compare panel: the item you are pointing at, and the item it would replace.
   *
   * It is NEVER cleared on mouse-leave. A card that blanks the moment the pointer moves is unusable —
   * the whole point is to look at one, then look at the next, and see both against the same worn
   * item. It holds the last thing you looked at until you look at something else.
   */
  showCompare(item) {
    const box = $('inv-compare-body');
    if (!box) return;
    box.closest('.pane')?.classList.toggle('empty', !item);
    if (!item) {
      const hint = el('div', 'itemcard empty', 'Point at something in the bag.');
      box.replaceChildren(hint);
      return;
    }
    const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
    const worn = this.player?.equipment?.[slot];
    const a = el('div', 'itemcard');
    a.innerHTML = this.itemCard(item);
    const kids = [a];
    if (worn && worn !== item) {
      const b = el('div', 'itemcard itemcard--worn');
      b.innerHTML = this.itemCard(worn, { worn: true });
      kids.push(b);
    }
    box.replaceChildren(...kids);
  }

  /** One line in the bag: name, slot, how it compares, and a recycle button. */
  bagRow(item, { pick = null } = {}) {
    const player = this.player;
    const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
    const worn = player.equipment[slot];
    const delta = itemScore(item) - itemScore(worn);
    const row = el('div', 'row');
    // The Upgrade tab's picker keeps its tooltip (it has no compare panel); the bag does not, because
    // two full item cards on screen at once with one of them chasing the pointer is noise.
    if (pick) this.tipFor(row, item);
    row.tabIndex = 0;
    row.dataset.rarity = item.setId ? 'set' : item.isUnique ? 'unique' : (item.rarity || 'normal');
    row.innerHTML = `<span class="${rarityClass(item)}">${displayName(item)}</span>
      <span class="muted small">${SLOT_LABELS[slot] || slot}</span>
      <span class="score ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}" title="${
        delta > 0 ? `${delta} points better than the ${worn ? displayName(worn) : 'nothing'} you have on`
        : delta < 0 ? `${Math.abs(delta)} points worse than your ${worn ? displayName(worn) : 'gear'}`
        : 'about the same as what you are wearing'
      }">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '– '}${Math.abs(delta)}</span>`;
    if (pick) {
      row.onclick = () => { hideTip(); pick(item); };
    } else {
      row.onmouseenter = () => { this.hoverItem = item; this.showCompare(item); };
      // `hoverItem` still clears, because `R` reads it — the PANEL does not, on purpose
      row.onmouseleave = () => { if (this.hoverItem === item) this.hoverItem = null; };
      row.onfocus = () => { this.hoverItem = item; this.showCompare(item); };
      const scrap = el('button', 'scrap', '♺');
      scrap.dataset.tip = 'Recycle this into crafting material. What you get back depends on its rarity, what it is made of, and how well made it is.';
      scrap.textContent = '♺';
      scrap.onclick = e => { e.stopPropagation(); hideTip(); this.onRecycle?.(item); this.renderSheet(); };
      row.append(scrap);
      row.onclick = () => { hideTip(); this.onEquip(item); this.renderSheet(); };
    }
    return row;
  }

  renderSkills() {
    const player = this.player;

    /**
     * YOUR BAR — THE ONLY LIST OF SKILLS ON THIS SCREEN.
     *
     * D5: "Your Bar and All Skills show the same information." They did, and there was never any
     * more to show: a class has exactly six skills (`skills.json` lists six ids per class) and both
     * panels drew all six, with the same names, the same mana and the same cooldowns, in the same
     * order. The list is gone; what it had that the strip did not — the line saying what a skill
     * actually does — is on the card now, so nothing was lost with it.
     *
     * The strip is the bar: same keys, same order as the one across the bottom of the screen. It is
     * also the talent picker (that used to be a chip row INSIDE the tree, so it scrolled away with
     * the thing it was picking).
     *
     * Three dots under each key: filled means a talent taken on that tier, an outlined one means a
     * tier you could spend in right now, a dark one means a tier not open yet.
     */
    const bar = $('sheet-skillbar');
    if (bar) {
      const open = tiersOpen(player.level ?? 1);
      bar.replaceChildren(...this.skillState.map((s, i) => {
        const picks = s.locked ? {} : picksFor(player, s.id);
        const card = el('button', 'sk-card'
          + (s.locked ? ' locked' : '')
          + (s.id === this.talentSkill ? ' on' : ''));
        card.dataset.tipRender = 'skill';
        card.dataset.tipSkill = String(i);
        card.innerHTML = `<span class="sk-key">${i + 1}</span>`
          + `<span class="sk-name">${s.locked ? `level ${s.unlockAt}` : s.name}</span>`
          + `<span class="sk-cost">${s.locked ? 'locked' : `${s.mp} mana · ${s.cooldown.toFixed(1)}s`}</span>`
          + `<span class="sk-desc">${s.locked ? `unlocks at level ${s.unlockAt}` : (s.desc || '')}</span>`
          + '<span class="sk-pips">' + [1, 2, 3].map(t =>
            `<i class="${picks[t] ? 'on' : t <= open ? 'open' : ''}"></i>`).join('') + '</span>';
        if (!s.locked) card.onclick = () => { this.talentSkill = s.id; this.renderSheet(); };
        return card;
      }));
      if (!this.skillState.length) bar.replaceChildren(el('p', 'muted small', 'No skills yet.'));
    }

    /**
     * A TREE PER SKILL, three tiers deep, one node per tier.
     *
     * The broad talent ladder and the passive tree both moved into the Perks forest, so this space
     * is now where a skill becomes *yours*: pick the skill on the left, and its three tiers appear
     * on the right. Tier 1 is how it is thrown, tier 2 is what happens when it lands, tier 3 is what
     * it does to the fight — and you may only have one from each, so a Firebolt is either a fan of
     * three or one that bursts, never both.
     */
    const treeBox = $('sheet-skilltree');
    if (treeBox) {
      const list = this.skillState.filter(s => !s.locked);
      if (!list.length) {
        treeBox.replaceChildren(el('p', 'muted small', 'No skills yet. They unlock as you level.'));
      } else {
        if (!list.some(s => s.id === this.talentSkill)) this.talentSkill = list[0]?.id || null;
        const chosen = list.find(s => s.id === this.talentSkill) || list[0];
        // the picker is the bar strip above now, so `#sheet-skilltree` holds exactly six children —
        // h4, row, h4, row, h4, row — which `grid-auto-flow: column` lays out as three tier columns
        const kids = [];
        const tree = treeFor(chosen.id, chosen.shape || 'bolt');
        const picks = picksFor(player, chosen.id);
        for (const tier of tree.tiers) {
          const open = (player.level ?? 1) >= tier.level;
          // what each tier is FOR, which was only ever written down in a comment in this file
          const theme = TIER_THEMES[tier.tier] || '';
          kids.push(el('h4', 'tier-head' + (open ? '' : ' locked'),
            `Tier ${tier.tier}${theme ? ` — ${theme}` : ''}${open ? '' : ` · level ${tier.level}`}`));
          const row = el('div', 'tier-row');
          for (const node of tier.nodes) {
            const on = picks[tier.tier] === node.id;
            const card = el('div', 'talent-card' + (on ? ' on' : '') + (open ? '' : ' locked'));
            card.innerHTML = `<b>${node.name}</b><span class="muted small">${node.desc}</span>`;
            if (open) {
              card.onclick = () => {
                if (on) this.onClearTalent?.(chosen.id, tier.tier);
                else this.onPickTalent?.(chosen.id, tier.tier, node.id, chosen.shape || 'bolt');
                this.renderSheet();
              };
            }
            row.append(card);
          }
          kids.push(row);
        }
        treeBox.replaceChildren(...kids);
        const title = $('sheet-tree-title');
        if (title) title.textContent = `${chosen.name} — talents`;
        const sum = $('sheet-talent-summary');
        if (sum) {
          const summary = talentSummary(player, chosen.id);
          sum.textContent = summary
            ? `${chosen.name}: ${summary}. The spell is drawn bigger and busier for every talent on it.`
            : `${chosen.name} has no talents yet. Pick one from each tier.`;
        }
      }
    }
    const tp = $('sheet-talent-points');
    if (tp) {
      const ladder = this.skillState.map(s => s.unlockAt).filter(Number.isFinite);
      tp.textContent = `one talent per tier · tiers open at ${TIER_LEVELS.join(', ')}`
        + (ladder.length ? ` · skills unlock at ${[...new Set(ladder)].sort((a, b) => a - b).join(', ')}` : '');
    }
  }


  // ---------------------------------------------------------------- the perk forest

  /**
   * The forest, drawn on a canvas.
   *
   * Nodes are dots, links are lines, taken ones are lit and the reachable ones glow faintly. Click
   * one to select it; the side panel says what it does and offers the point. It is a canvas rather
   * than ninety DOM nodes because it is drawn on every hover and pan, and because the links have to
   * be drawn UNDER the nodes.
   */
  renderPerks() {
    const player = this.player;
    const forest = this.rpg?.forest;
    const canvas = $('perk-canvas');
    if (!forest || !canvas) return;

    const points = pointsLeft(player);
    // "0 taken · none left to spend" on a screen of inert dots, with no hint when that changes
    const nextAt = (() => {
      for (let l = (player.level || 1) + 1; l <= 60; l++) if (pointsFor(l) > pointsFor(player.level || 1)) return l;
      return null;
    })();
    $('perk-points').textContent = points > 0
      ? `${points} point${points === 1 ? '' : 's'} to spend · ${spentBy(player)} taken`
      : `${spentBy(player)} taken${nextAt ? ` · your next point comes at level ${nextAt}` : ' · none left to spend'}`;

    const legend = $('perk-legend');
    if (legend) {
      legend.replaceChildren(...ARMS.map(a => {
        const n = el('span', 'perk-arm');
        n.innerHTML = `<i style="background:${a.color}"></i>${a.name}`;
        n.title = a.blurb;
        return n;
      }));
    }

    /**
     * D4: two clicks for anything you cannot undo.
     *
     * "Take it all back" stated no cost and implied no confirmation, and the bulk-recycle chips
     * looked exactly like the filter chips they sit beside while irreversibly destroying gear. The
     * first click arms and says what it is about to do; the second does it.
     */
    const refund = $('perk-refund');
    if (refund && !refund.dataset.wired) {
      refund.dataset.wired = '1';
      refund.onclick = () => {
        if (refund.dataset.armed !== '1') {
          refund.dataset.armed = '1';
          refund.textContent = `Give back all ${spentBy(this.player)}? Click again.`;
          refund.classList.add('arm');
          setTimeout(() => {
            refund.dataset.armed = ''; refund.textContent = 'Take it all back'; refund.classList.remove('arm');
          }, 4000);
          return;
        }
        refund.dataset.armed = ''; refund.textContent = 'Take it all back'; refund.classList.remove('arm');
        this.onRefundPerks?.();
        this.renderSheet();
      };
    }

    this.drawForest();
    this.renderPerkSide();

    const fit = $('perk-fit');
    if (fit && !fit.dataset.wired) {
      fit.dataset.wired = '1';
      fit.onclick = () => { this.perkZoom = 1; this.perkPan = { x: 0, y: 0 }; this.drawForest(); };
    }

    /**
     * D9: the names under the nodes, on a switch.
     *
     * "The perk tree shows a tooltip under every node when zoomed in. Make that a checkbox, default
     * OFF." It was tied to the zoom, so coming in close to read one node buried the whole screen in
     * eighty-nine labels. Off by default; when it is on the labels are drawn at any zoom and the
     * ones that would land on top of each other are dropped (see `drawForest`).
     */
    const labelBox = $('perk-labels');
    if (labelBox && !labelBox.dataset.wired) {
      labelBox.dataset.wired = '1';
      labelBox.checked = !!this.perkLabels;
      labelBox.onchange = () => { this.perkLabels = labelBox.checked; this.drawForest(); };
    }

    /** D10: the search box. Typing redraws — nothing is filtered out, only ringed or faded. */
    const search = $('perk-search');
    if (search && !search.dataset.wired) {
      search.dataset.wired = '1';
      search.value = this.perkQuery || '';
      search.oninput = () => { this.perkQuery = search.value; this.drawForest(); };
      // the sheet's own keys (1-6, R, Tab) must not fire while you are typing a perk name
      search.onkeydown = e => { if (e.code !== 'Escape') e.stopPropagation(); };
    }

    if (!canvas.dataset.wired) {
      canvas.dataset.wired = '1';
      canvas.addEventListener('click', e => {
        if (this._perkDragged) { this._perkDragged = false; return; }
        const hit = this.perkUnder(e);
        if (hit) { this.perkPick = hit.id; this.renderSheet(); }
      });
      canvas.addEventListener('mousemove', e => {
        if (this._perkDrag) return;
        const hit = this.perkUnder(e);
        canvas.style.cursor = hit ? 'pointer' : 'grab';
      });

      /**
       * ZOOM AND PAN, both through the one projector.
       *
       * The wheel keeps whatever is under the pointer under the pointer — the same trick the world
       * map uses — so you can aim at a corner of the forest and pull it towards you rather than
       * zooming to the middle and hunting for it again.
       */
      canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const proj = this._perkView;
        if (!proj) return;
        const { px, py } = this.perkPixel(e);
        const before = proj.from(px, py);
        const step = e.deltaY < 0 ? 1.18 : 1 / 1.18;
        this.perkZoom = Math.max(PERK_ZOOM[0], Math.min(PERK_ZOOM[1], (this.perkZoom || 1) * step));
        this.drawForest();
        const after = this._perkView;
        // put the world point that was under the pointer back under the pointer
        this.perkPan = {
          x: before.x - (px - after.w / 2) / after.scale,
          y: before.y - (py - after.h / 2) / after.scale,
        };
        this.drawForest();
      }, { passive: false });

      canvas.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        this._perkDrag = { px: e.clientX, py: e.clientY, moved: 0 };
        this._perkDragged = false;
        canvas.setPointerCapture?.(e.pointerId);
        canvas.style.cursor = 'grabbing';
      });
      canvas.addEventListener('pointermove', e => {
        const drag = this._perkDrag, proj = this._perkView;
        if (!drag || !proj) return;
        const dx = e.clientX - drag.px, dy = e.clientY - drag.py;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.px = e.clientX; drag.py = e.clientY;
        // client pixels -> device pixels -> world units
        this.perkPan = {
          x: (this.perkPan?.x || 0) - dx * proj.ratioX / proj.scale,
          y: (this.perkPan?.y || 0) - dy * proj.ratioY / proj.scale,
        };
        if (drag.moved > 5) this._perkDragged = true;
        this.drawForest();
      });
      const endDrag = e => {
        if (!this._perkDrag) return;
        this._perkDrag = null;
        canvas.releasePointerCapture?.(e.pointerId);
        canvas.style.cursor = 'grab';
      };
      canvas.addEventListener('pointerup', endDrag);
      canvas.addEventListener('pointercancel', endDrag);
      canvas.addEventListener('dblclick', () => {
        this.perkZoom = 1; this.perkPan = { x: 0, y: 0 }; this.drawForest();
      });

      window.addEventListener('resize', () => { if (this.tab === 'perks' && this.sheetOpen) this.drawForest(); });
    }
  }

  /**
   * A mouse event as DEVICE pixels on the perk canvas.
   *
   * The old code worked out one ratio from the width and used it on both axes. The canvas is sized
   * by flex, and its backing buffer was being measured from its PARENT (which also holds the 270px
   * side panel), so the two axes had different ratios — x came out right and y was inflated by about
   * half, which is why a click landed on whatever was ~100px below the cursor. Both axes are measured
   * separately now, and the buffer is measured from the canvas's own box, so they cannot disagree.
   */
  perkPixel(e) {
    const canvas = $('perk-canvas');
    const rect = canvas.getBoundingClientRect();
    return {
      px: (e.clientX - rect.left) * (canvas.width / Math.max(1, rect.width)),
      py: (e.clientY - rect.top) * (canvas.height / Math.max(1, rect.height)),
    };
  }

  /** Map a canvas pixel to the node under it, or null. */
  perkUnder(e) {
    const forest = this.rpg?.forest;
    const canvas = $('perk-canvas');
    const proj = this._perkView;
    if (!forest || !canvas || !proj) return null;
    const { px, py } = this.perkPixel(e);
    let best = null, bd = Infinity;
    for (const node of forest.nodes) {
      const { x, y } = proj.to(node.x, node.y);
      const d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; best = node; }
    }
    // the nodes themselves grow with the zoom, so the grab radius has to as well
    const reach = 16 * proj.dpr * Math.max(1, Math.min(2.2, this.perkZoom || 1));
    return bd <= reach ? best : null;
  }

  /**
   * Size the backing buffer to the canvas's OWN box, and build the projector.
   *
   * One transform, with a real inverse, used by every draw call and by the hit test — they cannot
   * drift apart the way the six hand-inlined copies of `cx + x * scale` did.
   */
  perkView() {
    const canvas = $('perk-canvas');
    const forest = this.rpg?.forest;
    if (!canvas || !forest) return null;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(240, rect.width || canvas.clientWidth || 640);
    const cssH = Math.max(240, rect.height || canvas.clientHeight || 480);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;

    let span = 0;
    for (const n of forest.nodes) span = Math.max(span, Math.hypot(n.x, n.y));
    span = Math.max(1, span);
    const fit = (Math.min(w, h) / 2 - 42 * dpr) / span;
    const zoom = this.perkZoom || 1;
    const pan = this.perkPan || (this.perkPan = { x: 0, y: 0 });
    const scale = fit * zoom;
    const cx = w / 2 - pan.x * scale, cy = h / 2 - pan.y * scale;
    return {
      w, h, dpr, span, fit, zoom, scale, cx, cy,
      // client pixels -> device pixels, measured per axis so the two can never disagree
      ratioX: w / Math.max(1, rect.width || cssW),
      ratioY: h / Math.max(1, rect.height || cssH),
      to: (x, y) => ({ x: cx + x * scale, y: cy + y * scale }),
      from: (px, py) => ({ x: (px - cx) / scale, y: (py - cy) / scale }),
    };
  }

  drawForest() {
    const player = this.player;
    const forest = this.rpg?.forest;
    const canvas = $('perk-canvas');
    if (!forest || !canvas) return;
    const proj = this.perkView();
    if (!proj) return;
    this._perkView = proj;
    const { dpr, span, scale, cx, cy, zoom } = proj;

    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0b0e15';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /**
     * THE GUIDE RINGS ARE NOT EDGES, AND THEY USED TO LOOK EXACTLY LIKE ONES.
     *
     * "I took the perk from the '8% Experience' which is connected to 'Companions deal 18% more
     * damage' and '18% critical damage', but it appears the node is not actually connected to these
     * when it comes to unlocking the next node. However there is a line connecting them."
     *
     * Every one of those three nodes sits at radius 3, so the ring-3 circle sweeps straight through
     * all of them — and it was drawn 1px in rgba(80,100,140,.16) while a real link was drawn 1px in
     * rgba(110,130,170,.16). Two lines nobody could tell apart, one of which meant something. The
     * circles are dotted and dimmer now and the links are brighter and thicker (below), so the only
     * solid line between two nodes is one that says "taking this opens that".
     */
    ctx.save();
    ctx.strokeStyle = 'rgba(70, 86, 118, .28)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([1.5 * dpr, 5 * dpr]);
    for (const ring of PERK_RINGS) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const taken = takenOf(player);
    const colourOf = node => ARMS.find(a => a.key === node.arm)?.color || '#9fb4d4';

    /**
     * D10: WHAT YOU TYPED, AND WHAT IT FOUND.
     *
     * "A player can find 'magic find' without reading 89 nodes." The name and the description are
     * both searched, because half of these nodes are named for the feel of them ("Carrion Eye") and
     * say what they do only in the line underneath. Nothing is hidden: a match gets a ring, the rest
     * drop to a quarter opacity, so the shape of the tree around a match is still readable — which
     * is the whole point, since the shape is what the perk costs.
     */
    const q = (this.perkQuery || '').trim().toLowerCase();
    const hits = q
      ? new Set(forest.nodes.filter(n => `${n.name || ''} ${n.desc || ''}`.toLowerCase().includes(q)).map(n => n.id))
      : null;
    const faded = node => !!hits && !hits.has(node.id);
    const note = $('perk-search-note');
    if (note) {
      note.textContent = !q ? ''
        : hits.size ? `${hits.size} of ${forest.nodes.length} match`
        : 'nothing by that name';
      note.classList.toggle('bad', !!q && !hits.size);
    }

    /**
     * Links, under everything — dimmed as a set while a search is on, so the rings stand out.
     *
     * An untaken link was 16% of a grey-blue, which is why the ring circles could pass for one. It
     * is a clear line now, and the edges of whichever node is SELECTED are drawn on top in that
     * node's own colour: point at a perk and the screen shows you precisely what taking it opens,
     * which is the question the report was really asking.
     */
    if (hits) ctx.globalAlpha = 0.4;
    const picked = this.perkPick && forest.byId.has(this.perkPick) ? this.perkPick : null;
    const touching = picked ? new Set(forest.neighbours.get(picked) || []) : null;
    for (const [a, b] of forest.links) {
      const na = forest.byId.get(a), nb = forest.byId.get(b);
      if (!na || !nb) continue;
      const live = taken.has(a) && taken.has(b);
      const onPick = !!picked && (a === picked || b === picked);
      ctx.strokeStyle = onPick ? colourOf(forest.byId.get(picked))
        : live ? 'rgba(225, 235, 250, .7)'
        : 'rgba(126, 148, 190, .38)';
      ctx.lineWidth = (onPick ? 2.6 : live ? 2 : 1.2) * dpr;
      const a0 = proj.to(na.x, na.y), b0 = proj.to(nb.x, nb.y);
      ctx.beginPath();
      ctx.moveTo(a0.x, a0.y);
      ctx.lineTo(b0.x, b0.y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    for (const node of forest.nodes) {
      const { x, y } = proj.to(node.x, node.y);
      const kind = NODE_KINDS[node.kind];
      const r = (node.kind === 'hub' ? 9 : 4.5 * (kind?.size || 1)) * dpr * Math.min(1.7, Math.max(1, zoom * 0.85));
      const has = taken.has(node.id);
      const open = !has && canTake(player, forest, node.id).ok;
      const colour = colourOf(node);
      ctx.globalAlpha = faded(node) ? 0.22 : 1;

      if (node.kind === 'keystone') {
        // a keystone is a diamond, so it reads as different from across the screen
        ctx.beginPath();
        ctx.moveTo(x, y - r * 1.4); ctx.lineTo(x + r * 1.4, y);
        ctx.lineTo(x, y + r * 1.4); ctx.lineTo(x - r * 1.4, y);
        ctx.closePath();
      } else if (node.kind === 'talent') {
        ctx.beginPath();
        ctx.rect(x - r, y - r, r * 2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      /**
       * D3: EIGHTY-NINE BLACK DOTS ON A BLACK FIELD.
       *
       * An untaken node was 28% white, so you could not tell which arm a node belonged to, which
       * ones you could reach, or what any of them were without clicking each one. Every node carries
       * its arm's colour at low saturation now, and anything you could take RIGHT NOW gets a white
       * ring — which is the only question you are asking when you have a point to spend.
       */
      ctx.fillStyle = has ? colour : open ? tint(colour, 0.34) : tint(colour, 0.13);
      ctx.fill();
      ctx.lineWidth = (has ? 2 : open ? 2 : 1) * dpr;
      ctx.strokeStyle = has ? '#ffffff' : open ? '#ffffff' : 'rgba(120, 140, 175, .45)';
      ctx.stroke();
      if (open) {
        ctx.beginPath();
        ctx.arc(x, y, r + 4 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, .35)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
      }

      if (this.perkPick === node.id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 7 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.6 * dpr; ctx.stroke();
      }

      // D10: a match wears a gold ring, well clear of the white "you can take this" one
      if (hits && hits.has(node.id)) {
        ctx.beginPath();
        ctx.arc(x, y, r + 10 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.4 * dpr; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    /**
     * The hub and the four arm names. They are drawn BEFORE the node names so the boxes they take up
     * can be handed to the collision test below — drawn last, a node name was being written straight
     * across "The Deep Study".
     */
    const spoken = [];
    const keep = (text, x, y, top, bottom) => {
      const w = ctx.measureText(text).width;
      spoken.push({ x0: x - w / 2 - 3 * dpr, x1: x + w / 2 + 3 * dpr, y0: y - top, y1: y + bottom });
    };
    // the hub says what it is, because an unlabelled dot in the middle is a mystery
    ctx.font = `600 ${11 * dpr}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(220, 230, 245, .8)';
    ctx.textAlign = 'center';
    ctx.fillText('you began here', cx, cy + 22 * dpr);
    keep('you began here', cx, cy + 22 * dpr, 11 * dpr, 4 * dpr);
    // …and so does each arm, out past its rim so the label never sits on a node
    for (const arm of ARMS) {
      const ax = cx + Math.cos(arm.angle) * (span * scale + 20 * dpr);
      const ay = cy + Math.sin(arm.angle) * (span * scale + 20 * dpr);
      const px = Math.max(60 * dpr, Math.min(canvas.width - 60 * dpr, ax));
      const py = Math.max(14 * dpr, Math.min(canvas.height - 6 * dpr, ay));
      ctx.fillStyle = arm.color;
      ctx.fillText(arm.name, px, py);
      keep(arm.name, px, py, 11 * dpr, 4 * dpr);
    }
    ctx.textAlign = 'left';

    /**
     * D9: the names under the nodes, when the checkbox asks for them — and always on a search hit,
     * whatever the checkbox says, because a ring you cannot read the name of is half an answer.
     *
     * They used to appear on their own past 1.5× zoom, which is what the report calls "a tooltip
     * under every node". They are drawn at any zoom now and a label that would land on one already
     * placed is simply dropped, so zoomed out you get the ones there is room for rather than a
     * solid block of overlapping text.
     */
    const labelled = this.perkLabels ? forest.nodes : (hits ? forest.nodes.filter(n => hits.has(n.id)) : []);
    if (labelled.length) {
      ctx.font = `500 ${10.5 * dpr}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      const placed = [...spoken];
      // hits first, so when two labels collide the one you searched for is the one that survives
      const order = hits ? [...labelled].sort((a, b) => (hits.has(b.id) ? 1 : 0) - (hits.has(a.id) ? 1 : 0)) : labelled;
      for (const node of order) {
        if (node.kind === 'hub' || !node.name) continue;
        const { x, y } = proj.to(node.x, node.y);
        if (x < -80 * dpr || x > canvas.width + 80 * dpr || y < 0 || y > canvas.height) continue;
        const words = node.name.length > 26 ? node.name.slice(0, 25) + '…' : node.name;
        const tw = ctx.measureText(words).width;
        const box = { x0: x - tw / 2 - 3 * dpr, x1: x + tw / 2 + 3 * dpr, y0: y + 9 * dpr, y1: y + 22 * dpr };
        if (placed.some(p => box.x0 < p.x1 && box.x1 > p.x0 && box.y0 < p.y1 && box.y1 > p.y0)) continue;
        placed.push(box);
        const hit = !!hits && hits.has(node.id);
        ctx.globalAlpha = faded(node) ? 0.3 : 1;
        ctx.fillStyle = 'rgba(12, 16, 24, .78)';
        ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, 13 * dpr);
        ctx.fillStyle = hit ? '#ffd24a' : taken.has(node.id) ? '#eaf6ff' : 'rgba(190, 205, 228, .82)';
        ctx.fillText(words, x, y + 19 * dpr);
      }
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Hand ONE perk back.
   *
   * main.js owns the point-spending callbacks, and its `onRefundPerks` takes no argument and empties
   * the whole tree — so calling that with an id would quietly wipe a forty-point walk. When main.js
   * hands us an `onRefundPerk` we use it (it can log, play the click and save); until then the work
   * happens here and the sheet stays correct, because `rpg.refresh` is what rebuilds the stat sheet
   * and the HUD already holds the rpg.
   */
  refundPerk(id) {
    const player = this.player;
    const forest = this.rpg?.forest;
    if (!player || !forest) return;
    if (this.onRefundPerk) { this.onRefundPerk(id); this.renderSheet(); return; }
    const out = refundOne(player, forest, id);
    if (!out.ok) { this.log(out.why, 'bad'); return; }
    this.rpg?.refresh?.(player, { full: true });
    this.log(`${out.node.name || 'That perk'} given back. The point is yours again.`, 'level');
    this.renderSheet();
  }

  /** The panel beside the forest: what the selected node does, and the button that takes it. */
  renderPerkSide() {
    const player = this.player;
    const forest = this.rpg?.forest;
    const side = $('perk-side');
    if (!side || !forest) return;
    const kids = [];

    const walked = armProgress(player, forest);
    const bars = el('div', 'perk-bars');
    for (const arm of ARMS) {
      const row = el('div', 'perk-bar');
      row.innerHTML = `<span style="color:${arm.color}">${arm.name}</span><b>${walked[arm.key] || 0}</b>`;
      row.title = arm.blurb;
      bars.append(row);
    }
    kids.push(bars);

    const node = this.perkPick ? forest.byId.get(this.perkPick) : null;
    // "THIS NODE" over a panel with no node in it
    const sideTitle = $('perk-side-title');
    if (sideTitle) sideTitle.textContent = node ? (node.name || 'This node') : 'The forest';
    if (!node) {
      kids.push(el('p', 'muted small', 'Click a node. Anything touching something you have already taken can be taken next — the shape of the tree is the cost.'));
    } else {
      const has = takenOf(player).has(node.id);
      const check = canTake(player, forest, node.id);
      const kind = NODE_KINDS[node.kind];
      kids.push(el('h4', null, node.name || 'A perk'));
      kids.push(el('p', 'muted small', `${kind?.name || node.kind}${node.arm ? ` · ${ARMS.find(a => a.key === node.arm)?.name}` : node.oddball ? ' · out on its own' : ''}`));
      kids.push(el('p', null, node.desc || ''));
      if (node.cost) kids.push(el('p', 'warn small', node.cost));
      if (has) {
        kids.push(el('p', 'small good', 'Taken.'));
        /**
         * ONE PERK BACK — "as long as nothing requires it".
         *
         * The button is always here and always says where it stands, because "you cannot" with no
         * reason is the thing that sends a player back to Take it all back. `canRefund` names the
         * perks that would be cut off from the middle if this one went.
         */
        const back = canRefund(player, forest, node.id);
        const b = el('button', 'chip perk-refund-one' + (back.ok ? '' : ' off'), 'Give this one back');
        b.disabled = !back.ok;
        b.dataset.tip = back.ok
          ? 'Nothing you have taken reaches the middle through this one, so it can go back and the point is yours again.'
          : back.why;
        if (back.ok) b.onclick = () => { this.refundPerk(node.id); };
        kids.push(b);
        if (!back.ok) kids.push(el('p', 'warn small', back.why));
      } else if (check.ok) {
        const b = el('button', 'primary', 'Take it');
        b.onclick = () => { this.onTakePerk?.(node.id); this.renderSheet(); };
        kids.push(b);
      } else kids.push(el('p', 'muted small', check.why));

      /**
       * WHAT THIS ONE ACTUALLY TOUCHES.
       *
       * The report was a player reading a guide circle as an edge (see `drawForest`). A drawn line
       * is now unmistakable, and this is the same answer in words: every node this one connects to,
       * which is exactly the set `canTake` walks. Click a row to jump to it.
       */
      const near = linksOf(forest, node.id);
      if (near.length) {
        kids.push(el('div', 'divider', has ? `Opens · ${near.length}` : `Connects to · ${near.length}`));
        const web = el('div', 'perk-links');
        for (const n of near) {
          const row = el('div', 'list-row' + (takenOf(player).has(n.id) ? ' on' : ''));
          row.style.borderLeftColor = ARMS.find(a => a.key === n.arm)?.color || '#2a3446';
          row.innerHTML = `<span class="row-main">${n.kind === 'hub' ? 'Where you began' : (n.name || n.id)}</span>`
            + `<span class="row-note">${takenOf(player).has(n.id) ? 'taken' : NODE_KINDS[n.kind]?.name || n.kind}</span>`;
          row.onclick = () => { this.perkPick = n.id; this.renderSheet(); };
          web.append(row);
        }
        kids.push(web);
      }
    }

    /**
     * WHAT YOU HAVE ALREADY TAKEN.
     *
     * Nothing listed it before, so auditing a build meant hovering eighty-nine dots. Click a row to
     * select that node in the forest. The arm colour on the left edge is dynamic on purpose —
     * `ARMS[].color` is data, not style.
     */
    const taken = [...takenOf(player)].map(id => forest.byId.get(id)).filter(n => n && n.kind !== 'hub');
    kids.push(el('div', 'divider', `Taken · ${taken.length}`));
    const list = el('div');
    list.id = 'perk-taken';
    taken.sort((a, b) => String(a.arm || '').localeCompare(String(b.arm || ''))
      || String(a.name || '').localeCompare(String(b.name || '')));
    for (const n of taken) {
      const row = el('div', 'list-row');
      row.style.borderLeftColor = ARMS.find(a => a.key === n.arm)?.color || '#2a3446';
      row.innerHTML = `<span class="row-main">${n.name || n.id}</span>`
        + `<span class="row-note">${NODE_KINDS[n.kind]?.name || n.kind}</span>`;
      row.onclick = () => { this.perkPick = n.id; this.renderSheet(); };
      list.append(row);
    }
    if (!taken.length) list.append(el('p', 'muted small', 'Nothing taken yet.'));
    kids.push(list);

    side.replaceChildren(...kids);
  }

  // ---------------------------------------------------------------- crafting and upgrading
  //
  // Two tabs, and both are laid out the way a big MMO lays out a trade skill: a plain LIST of
  // recipes on the left, and a detail panel on the right that only fills in when you click one.
  // The old single panel tried to show sixteen recipes and every cost at once, which is a wall.

  /** Bag / worn / all, above the pick list. Built once — see `buildBagControls`. */
  buildUpScope() {
    const bar = $('up-scope');
    if (!bar) return;
    if (!bar.dataset.wired) {
      bar.dataset.wired = '1';
      const kids = [el('span', 'chip-label', 'Show')];
      for (const [value, label] of [['all', 'Everything'], ['bag', 'In the bag'], ['worn', 'Worn']]) {
        const b = el('button', 'chip', label);
        b.dataset.scope = value;
        b.onclick = () => { this.upScope = value; this.renderUpgrade(); };
        kids.push(b);
      }
      bar.replaceChildren(...kids);
    }
    for (const b of bar.querySelectorAll('[data-scope]')) b.classList.toggle('on', b.dataset.scope === this.upScope);
  }

  /**
   * The materials row, shared by both tabs.
   *
   * R14 — ONLY WHAT THIS SCREEN CAN SPEND.
   *
   *   "The top of the inventory where it shows currencies has become too much. Instead, only show
   *    relevant materials for the current screen. The crafting screen should show things like Bound
   *    Essence and Scrap Iron. Maybe there can be a dropdown to view all next to the filtered ones,
   *    where you can view all other materials."
   *
   * It used to list everything you were carrying above all seven tabs — two rows of chips over the
   * Journal, which cannot spend any of them. Now `craft.spendableOn(tab)` says which materials the
   * screen in front of you is actually about, and `+n more` opens the rest in place. The toggle is
   * a button rather than a real dropdown because the strip is already a row of chips and a `select`
   * of thirty materials is worse than the thing being fixed — same job, one click, no menu.
   *
   * The screens that spend nothing (Character, Skills, Perks, Journal) get no strip at all; gold is
   * beside it and is the only thing those screens care about.
   */
  drawMaterials(target) {
    const box = $(target);
    if (!box) return;
    // in the header it is a strip of chips, so the empty case is three words, not a sentence
    const tight = box.classList.contains('sheet-mats');
    if (!this.craft) { box.replaceChildren(el('span', 'muted small', tight ? '' : 'No bench here.')); return; }

    const relevant = tight ? this.craft.spendableOn?.(this.tab) ?? null : null;
    if (tight && relevant === null) { box.replaceChildren(); box.hidden = true; return; }
    box.hidden = false;

    const held = this.craft.held();
    const showAll = !!this.showAllMaterials;
    const shown = relevant && !showAll ? held.filter(m => relevant.has(m.id)) : held;
    const rest = relevant ? held.length - shown.length : 0;

    const chip = m => {
      const c = el('div', 'material');
      c.dataset.tipRender = 'material';
      c.dataset.tipMaterial = m.id;
      c.tabIndex = 0;
      c.innerHTML = `<i style="background:${m.color}"></i><span>${m.name}</span><b>${m.n}</b>`;
      return c;
    };

    const kids = shown.map(chip);
    if (!held.length) {
      kids.push(el('span', 'muted small', tight
        ? 'no materials yet'
        : 'Nothing yet. Recycle something on the Inventory tab — that is where every material comes from.'));
    } else if (!shown.length) {
      kids.push(el('span', 'muted small', 'nothing this screen uses'));
    }
    if (relevant && (rest > 0 || showAll)) {
      const more = el('button', 'chip mat-more', showAll ? 'show less' : `+${rest} more`);
      more.title = showAll
        ? 'Back to the ones this screen can spend'
        : 'Show every material you are carrying, not only the ones this screen uses';
      more.onclick = () => { this.showAllMaterials = !this.showAllMaterials; this.drawMaterials(target); };
      kids.push(more);
    }
    box.replaceChildren(...kids);
  }

  /** One row in a recipe list: name, what it costs, and whether you can pay for it. */
  recipeRow(r, quote, selected, onPick) {
    const row = el('div', 'recipe-row' + (selected ? ' on' : '') + (quote.ok ? '' : ' off'));
    row.tabIndex = 0;
    row.innerHTML = `<span class="recipe-name">${r.name}</span>`
      + `<span class="recipe-cost">${quote.cost ? this.craft.costText(quote.cost) : ''}</span>`;
    row.dataset.tip = quote.ok ? r.desc : `${r.desc}\n\nCannot: ${quote.why}`;
    row.onclick = () => { hideTip(); onPick(); };
    row.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(); } };
    return row;
  }

  /** The cost breakdown: what it wants, what you hold, and what you are short of. */
  costTable(cost) {
    const box = el('div', 'cost-table');
    for (const [id, want] of Object.entries(cost || {})) {
      const have = this.craft.materials.count(id);
      const m = this.craft.M[id] || { name: id, color: '#888' };
      const row = el('div', 'cost-row' + (have >= want ? ' ok' : ' short'));
      row.innerHTML = `<i style="background:${m.color}"></i><span>${m.name}</span>`
        + `<b>${have} / ${want}</b>`;
      box.append(row);
    }
    if (!Object.keys(cost || {}).length) box.append(el('div', 'muted small', 'Costs nothing.'));
    return box;
  }

  renderCrafting() {
    const player = this.player;
    const craft = this.craft;
    // materials live in the sheet header now — one place, on all seven screens
    if (!craft) { $('craft-list').replaceChildren(); $('craft-detail').replaceChildren(); return; }

    const list = $('craft-list');
    const chosen = this.craftRecipe || craft.creates[0]?.id;
    list.replaceChildren(...craft.creates.map(r => {
      const q = craft.quote(r.id, null, { player });
      return this.recipeRow(r, q, r.id === chosen, () => {
        this.craftRecipe = r.id;
        this.forgeBase = null;
        this.renderCrafting();
      });
    }));

    // ---- the detail panel
    const box = $('craft-detail');
    const r = craft.byId[chosen];
    if (!r) { box.replaceChildren(el('p', 'muted small', 'Pick a recipe.')); return; }
    const q = craft.quote(r.id, null, { player });
    const options = craft.forgeOptions(r, player);
    if (!this.forgeBase || !options.some(o => o.baseKey === this.forgeBase)) {
      this.forgeBase = (options.find(o => o.canUse) || options[0])?.baseKey || null;
    }
    const picked = options.find(o => o.baseKey === this.forgeBase);

    const kids = [];
    kids.push(el('h3', null, r.name));
    kids.push(el('p', 'muted', r.desc));

    /**
     * The bases go in their own column now.
     *
     * They used to be a `repeat(auto-fill, minmax(140px, 1fr))` grid capped at `34vh`, inside a
     * `42vh`-capped list, inside an 86vh modal — two nested scrollers that put the Forge button below
     * the fold on a 768px screen. The pane scrolls, and the grid is as wide as the screen allows.
     */
    const grid = el('div', 'forge-grid');
    for (const o of options) {
      const cell = el('button', 'forge-option' + (o.baseKey === this.forgeBase ? ' on' : '') + (o.canUse ? '' : ' cannot'));
      cell.innerHTML = `<b>${o.name}</b><span class="muted small">`
        + [o.dmg ? `${o.dmg[0]}\u2013${o.dmg[1]} dmg` : null, o.armor ? `${o.armor} armour` : null,
           o.twoHanded ? 'two-handed' : null, o.ranged ? 'ranged' : null,
           o.canUse ? null : 'your class cannot hold this'].filter(Boolean).join(' · ')
        + '</span>';
      cell.onclick = () => { this.forgeBase = o.baseKey; hideTip(); this.renderCrafting(); };
      grid.append(cell);
    }
    const bases = $('craft-bases');
    if (bases) bases.replaceChildren(grid);
    else kids.push(grid);
    const basesTitle = $('craft-bases-title');
    if (basesTitle) basesTitle.textContent = r.name;

    // what it costs, and what comes out
    kids.push(el('h4', null, 'Cost'));
    kids.push(this.costTable(q.cost || {}));
    kids.push(el('h4', null, 'What comes out'));
    const mf = Math.round(player.derived?.magicFind || 0);
    const out = el('div', 'forge-result');
    out.innerHTML = `<div><b class="rarity-${r.rarity}">${r.rarity}</b> ${picked ? picked.name : r.makes}, at your level (${player.level})</div>`
      + `<div class="muted small">${AFFIX_COUNT[r.rarity] || ''}</div>`
      + `<div class="muted small">Magic find ${mf}% — every forge has a chance to come out a rarity better, and can keep climbing.</div>`
      + (picked && !picked.canUse ? '<div class="tip-bad small">Your class cannot hold this one. It will still forge.</div>' : '');
    kids.push(out);

    /**
     * D9: the reason a button is dead belongs ON the button. "Forge it" was greyed out with
     * "Scrap Iron 0 / 10" in red three hundred pixels above it.
     */
    const btn = el('button', 'forge-btn', q.ok ? 'Forge it' : (q.need || 'Not enough material'));
    btn.disabled = !q.ok || !picked;
    if (!q.ok) btn.dataset.tip = q.why;
    btn.onclick = () => {
      hideTip();
      this.onCraft?.(r.id, null, { baseKey: this.forgeBase, magicFind: player.derived?.magicFind || 0 });
      this.renderCrafting();
    };
    kids.push(btn);
    box.replaceChildren(...kids);
  }

  renderUpgrade() {
    const player = this.player;
    const craft = this.craft;
    // materials live in the sheet header now
    if (!craft) return;

    // the bench item may have been recycled or equipped since it was picked
    if (this.bench && !player.bag.includes(this.bench) && !Object.values(player.equipment).includes(this.bench)) this.bench = null;

    /**
     * What you could work on — the bag, what you are wearing, or both.
     *
     * This list was `.small-bag { max-height: 190px }` holding thirty-odd rows five at a time, which
     * made picking the item you cared about the slowest thing in the sheet. It is a full-height pane
     * with a scope filter now.
     */
    this.upScope = this.upScope || 'all';
    this.buildUpScope();
    const pick = $('up-pick');
    const worn = Object.values(player.equipment).filter(Boolean);
    const candidates = this.upScope === 'bag' ? [...player.bag]
      : this.upScope === 'worn' ? worn
      : [...player.bag, ...worn];
    const count = $('up-count');
    if (count) count.textContent = `${candidates.length} item${candidates.length === 1 ? '' : 's'}`;
    pick.replaceChildren(...(candidates.length ? candidates.map(item => {
      const row = this.bagRow(item, { pick: it => { this.bench = it; this.craftIndex = 0; this.upRecipe = null; this.renderUpgrade(); } });
      if (item === this.bench) row.classList.add('on');
      return row;
    }) : [el('div', 'empty', 'Nothing to work on.')]));

    // the item itself
    const head = $('up-item');
    const full = $('up-card');
    if (!this.bench) {
      const empty = el('div', 'empty-state');
      empty.innerHTML = '<b>Nothing on the bench.</b><span>Pick something on the left — anything in your bag, or anything you are wearing.</span>';
      head.replaceChildren(empty);
      if (full) full.innerHTML = '';
      $('up-list').replaceChildren();
      const hint = el('div', 'empty-state');
      hint.innerHTML = '<b>Nothing to work on yet.</b>'
        + '<span>Pick an item, then pick what to do to it. Tempering and reinforcing raise its numbers,'
        + ' promoting raises its rarity, reweaving trades one property for another, and a brand adds an element.</span>';
      $('up-detail').replaceChildren(hint);
      return;
    }
    const card = el('div', 'bench-card');
    this.tipFor(card, this.bench);
    card.innerHTML = `<div class="${rarityClass(this.bench)}"><b>${this.bench.name}</b></div>
      <div class="muted small">${this.bench.rarity}${this.bench.quality ? ' · ' + this.bench.quality : ''}`
      + `${this.bench.dmg ? ' · ' + this.bench.dmg[0] + '\u2013' + this.bench.dmg[1] + ' damage' : ''}`
      + `${this.bench.armor ? ' · ' + this.bench.armor + ' armour' : ''}`
      + `${this.bench.reworks ? ' · reworked ' + this.bench.reworks + '×' : ''}</div>`;
    head.replaceChildren(card);
    /**
     * The item's FULL card, standing still under the summary.
     *
     * Reweaving is choosing which property to trade. You could not read the property list and pick
     * from it at the same time, because the list was tooltip-only — so you hovered, read, moved away,
     * lost it, and hovered again. Both are on screen now: the card here, the pickable list in the
     * detail pane.
     */
    if (full) full.innerHTML = this.itemCard(this.bench, { worn: worn.includes(this.bench) });

    // the recipe list, grouped
    const list = $('up-list');
    const groups = craft.upgradeBoard(this.bench, player);
    const kids = [];
    for (const g of groups) {
      kids.push(el('div', 'recipe-group', g.name));
      for (const r of g.list) {
        const q = r.id === 'reweave'
          ? craft.quote('reweave', this.bench, { index: this.craftIndex || 0, player })
          : r.quote;
        kids.push(this.recipeRow(r, q, r.id === this.upRecipe, () => { this.upRecipe = r.id; this.renderUpgrade(); }));
      }
    }
    list.replaceChildren(...kids);

    // ---- the detail panel
    const box = $('up-detail');
    const r = craft.byId[this.upRecipe];
    if (!r) { box.replaceChildren(el('p', 'muted small', 'Pick one to see what it costs and what it changes.')); return; }
    const q = r.id === 'reweave'
      ? craft.quote('reweave', this.bench, { index: this.craftIndex || 0, player })
      : craft.quote(r.id, this.bench, { player });

    const out = [];
    out.push(el('h3', null, r.name));
    out.push(el('p', 'muted', r.desc));

    // reweave needs you to say WHICH property, so the options go here
    if (r.kind === 'reroll') {
      out.push(el('h4', null, 'Which property'));
      const opts = el('div', 'bench-affixes');
      (this.bench.affixes || []).forEach((a, i) => {
        const can = this.rpg.loot.rerollable(a);
        const row = el('div', 'bench-affix' + (this.craftIndex === i ? ' picked' : '') + (can ? ' pickable' : ' fixed'));
        row.innerHTML = `<span>${describeAffix(a)}</span>`;
        row.dataset.tip = can ? 'Trade this one for a different property.' : 'Part of what the item is — it cannot be rewoven.';
        if (can) row.onclick = () => { this.craftIndex = i; hideTip(); this.renderUpgrade(); };
        opts.append(row);
      });
      out.push(opts);
    }

    out.push(el('h4', null, 'Cost'));
    // A refused quote carries no priced cost, and "Costs nothing" under a greyed-out button reads
    // as a bug. Fall back to the recipe's own list so you can still see what it would take.
    out.push(this.costTable(q.cost || r.cost || {}));

    out.push(el('h4', null, 'What changes'));
    const change = el('div', 'forge-result');
    change.innerHTML = q.ok
      ? `<div>${q.note || CHANGE_TEXT[r.kind] || 'It is reworked.'}</div>`
        + (r.kind === 'rerollAll' ? '<div class="tip-bad small">Every property is thrown away and rolled again. It can come out worse.</div>' : '')
        + (r.kind === 'promote' ? '<div class="muted small">A promotion always comes with one more property.</div>' : '')
      : `<div class="tip-bad">${q.why}</div>`;
    out.push(change);

    const btn = el('button', 'forge-btn', q.ok ? 'Do it' : (q.need || q.why || 'Not yet'));
    btn.disabled = !q.ok;
    btn.onclick = () => {
      hideTip();
      this.onCraft?.(r.id, this.bench, { index: this.craftIndex || 0 });
      this.renderUpgrade();
    };
    out.push(btn);
    box.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- journal

  /**
   * The journal, as five panes instead of one column.
   *
   * Everything but the zone list used to queue up in a single 420px column — the survey, every
   * objective, the nemesis, the quest log and the bestiary, in that order — and the bestiary was
   * truncated to twelve because there was nowhere to put the rest. Each of those is its own pane now,
   * and the kill list is complete.
   */
  /**
   * R14 — ⌖, THE ONE BUTTON THAT MEANS "SHOW ME WHERE".
   *
   *   "for anything else on this screen with a primary location, add a target icon to 'locate on
   *    map' which opens the map, centered on that location."
   *
   * One glyph (U+2316) and one verb, everywhere it appears, so it is learned once. Returns null
   * when the thing has no position, and the caller simply appends nothing — a row without a place
   * must not grow a button that does nothing, which is the failure this whole round keeps finding.
   */
  locateButton(place, what = '') {
    if (!place || (!Number.isFinite(place.x) && !place.cell)) return null;
    if (!this.onLocate) return null;
    const b = el('button', 'row-locate', '\u2316');
    b.dataset.tip = `Show ${what || place.name || 'this'} on the map.`;
    b.setAttribute('aria-label', `Show ${what || place.name || 'this'} on the map`);
    b.onclick = ev => { ev.stopPropagation(); hideTip(); this.onLocate(place); };
    return b;
  }

  renderJournal() {
    const j = this.journal?.();
    const row = (text, note, cls = '', place = null, what = '') => {
      const n = el('div', 'journal-row' + (cls ? ' ' + cls : ''));
      n.innerHTML = `<span>${text}</span><span class="muted">${note ?? ''}</span>`;
      const go = this.locateButton(place, what);
      if (go) { n.append(go); n.classList.add('has-locate'); }
      return n;
    };
    const fill = (id, kids, emptyText) => {
      const box = $(id);
      if (!box) return;
      box.replaceChildren(...(kids.length ? kids : [el('p', 'muted small', emptyText)]));
    };
    const meta = (id, text) => { const n = $(id); if (n) n.textContent = text; };

    // ---- the survey
    const objectives = (j?.objectives || []).map(o => {
      const n = row(o.name, o.text, o.done ? 'done' : '', o.place, o.name);
      n.dataset.tip = o.desc || '';
      return n;
    });
    fill('sheet-journal', objectives, 'Nothing to survey here yet.');
    meta('journal-share', j ? `${Math.round((j.share || 0) * 100)}% surveyed · ${j.title || ''}` : '');

    // ---- work in hand
    const quests = (j?.quests || []).map(q => row(q.title, q.progress, q.done ? 'done' : '', q.place, q.title));
    fill('journal-quests', quests, 'Nobody has asked you for anything.');
    meta('journal-quest-count', (j?.quests || []).length ? `${j.quests.length}` : '');

    // ---- who is hunting you, and who you have put down for good
    const foes = [];
    if (j?.nemesis) foes.push(row(`${j.nemesis.name} ${j.nemesis.title || ''}`.trim(), `beat you ${j.nemesis.defeats}×`, 'nemesis'));
    const beaten = j?.defeated || [];
    if (beaten.length) {
      foes.push(el('div', 'divider', 'Put down for good'));
      for (const d of beaten) foes.push(row(typeof d === 'string' ? d : `${d.name} ${d.title || ''}`.trim(), ''));
    }
    fill('journal-foes', foes, 'Nothing has taken an interest in you yet.');

    // ---- everything you have killed, all of it
    const seen = Object.entries(j?.bestiary || {}).sort((a, b) => b[1] - a[1]);
    fill('journal-kills', seen.map(([id, n]) => row((j.names?.[id] || id).replace(/_/g, ' '), n)),
      'You have not killed anything yet.');
    meta('journal-kill-count', seen.length ? `${seen.length} kinds` : '');

    /**
     * ---- WHO HOLDS THIS GROUND (The Territory).
     *
     * One row a faction, sorted by how they feel about you. The band name is the thing that matters —
     * a number between -100 and 100 is not a fact a player can act on, but "Trusted" and "Hunted" are.
     */
    const sbox = $('journal-standing');
    if (sbox) {
      const holderKey = this.territoryHere?.()?.holder || null;
      // Whoever holds the ground you are standing on goes first, then everyone else by how they feel
      // about you. At the start of a run every number is zero, and an alphabetical list with the one
      // faction that matters buried at the bottom of it is not a screen.
      const rows = (this.standings?.() || [])
        .slice()
        .sort((a, b) => (b.key === holderKey) - (a.key === holderKey)
          || b.value - a.value || a.name.localeCompare(b.name));
      /**
       * A BAND NAME AND A NUMBER EXPLAIN NOTHING.
       *
       * The panel showed a colour, a name, a word and a number, and never said what the word meant,
       * where you were on the ladder, what it cost you, or what moves it. All of that is data the
       * game already has — the five bands with their price multipliers, and a thirteen-entry table
       * of deeds — and none of it was on a screen.
       */
      const bands = this.factionBands?.() || [];
      sbox.replaceChildren(...(rows.length ? rows.map(f => {
        const n = el('div', 'standing-row' + (f.key === holderKey ? ' holder' : ''));
        const at = Math.max(0, bands.findIndex(b => b.key === f.band?.key));
        const price = f.band && f.band.priceMult !== 1
          ? `${f.band.priceMult > 1 ? '+' : ''}${Math.round((f.band.priceMult - 1) * 100)}% in their shops`
          : '';
        n.innerHTML = `<i style="background:${f.colour}"></i>`
          + `<span>${f.name}${f.key === holderKey ? ' <em class="row-note">holds this ground</em>' : ''}`
          + `<span class="ladder">${bands.map((b, i) =>
            `<u class="${i === at ? 'on' : ''}" title="${b.name}"></u>`).join('')}</span></span>`
          + `<span class="band">${f.band?.name || ''}${price ? `<em>${price}</em>` : ''}</span>`
          + `<span class="num ${f.value > 0 ? 'up' : f.value < 0 ? 'down' : ''}">${f.value > 0 ? '+' : ''}${f.value}</span>`;
        n.dataset.tip = `${f.blurb}\n${f.band?.blurb || ''}${f.unlikeable ? '\nThey cannot be reasoned with.' : ''}`;
        return n;
      }) : [el('p', 'muted small', 'Nobody has an opinion about you yet.')]));

      /**
       * WHAT BEING LIKED IS FOR.
       *
       * `data/faction-rewards.json` — twelve factions, two ranks each — was parsed at boot and read
       * by nothing. It is the long reason to pick a side, so it belongs on the screen that shows the
       * sides: the reward you have earned in white, the one you have not in grey with its threshold.
       */
      const rewards = this.factionRewards?.(holderKey) || [];
      if (rewards.length) {
        sbox.append(el('div', 'divider', 'What they owe you'));
        const list = el('div', 'deed-list');
        for (const r of rewards) {
          const row = el('div', 'reward-row' + (r.earned ? ' earned' : ''));
          row.innerHTML = `<b>${r.name}</b><span class="row-note">${r.earned ? r.rankName : `${r.rankName} · ${r.at > 0 ? '+' : ''}${r.at}`}</span>`;
          row.dataset.tip = r.desc;
          list.append(row);
        }
        sbox.append(list);
      }

      // …and what actually moves the numbers, which was in the data file and on no screen at all
      const deeds = this.factionDeeds?.() || [];
      if (deeds.length) {
        sbox.append(el('div', 'divider', 'What moves it'));
        const list = el('div', 'deed-list');
        for (const [what, by] of deeds) {
          const row = el('div', 'deed-row');
          row.innerHTML = `<span>${what}</span><b class="${by > 0 ? 'up' : 'down'}">${by > 0 ? '+' : ''}${by}</b>`;
          list.append(row);
        }
        sbox.append(list);
      }
      // the reference screen says the whole name — it used to read "the Reach" in the header and
      // "The Warden's Reach" in the row three pixels below it
      const holder = rows.find(f => f.key === holderKey);
      meta('journal-holder', holder ? `${holder.name} · ${holder.band?.name || ''}` : '');
    }

    /**
     * ---- WORK GOING HERE. Everything on the board names something in this zone right now.
     *
     * 4.5: THE JOURNAL SAYS WHAT IS GOING ON. IT IS NOT WHERE YOU TAKE IT.
     *
     * "Under your journal in the 'Work going on here' you can accept quests arbitrarily from the
     * menu. Let's remove that in favour of some other system. Players should look for towns to pick
     * up quests, or pick up randomly from events in the world, but not just through interface."
     *
     * Taking a job was a click on this row, which made the Journal a shop of quests — you never had
     * to meet anybody or go anywhere. The rows stay, because knowing what is going on in a region is
     * the point of a journal, and each one now says where the work is actually taken: off a notice
     * board in a town, or from the person on the road who is asking.
     */
    const bbox = $('journal-board');
    if (bbox) {
      const board = this.board?.() || [];
      bbox.replaceChildren(...(board.length ? board.map(job => {
        const n = el('div', 'journal-row job-row' + (job.taken ? ' taken' : ''));
        const from = job.faction ? this.factionName?.(job.faction) : 'a notice board';
        const away = job.place && this.player ? this.distanceTo?.(job.place) : null;
        n.innerHTML = `<span>${job.title}<span class="from">${from}${away ? ` · ${away}` : ''}</span></span>`
          + `<span class="muted">${job.reward.gold}g · ${job.reward.xp} xp</span>`
          + `<span class="where">${job.taken ? 'taken' : job.faction ? 'from them' : 'town board'}</span>`;
        n.dataset.tip = `${job.text}\n\n${job.scope === 'adjacent' ? 'Next door.' : 'In this zone.'}`
          + (job.taken ? '' : `\n\nHeard of, not taken. ${job.faction
            ? 'Find somebody of theirs — in a town, or on the road — and they will put your name to it.'
            : 'Read it off the notice board in a settlement, or from whoever is asking on the road.'}`);
        // R14: the position was already here, one line above, and was only ever turned into a
        // distance. A job you can be told the distance to is a job you can be shown.
        const go = this.locateButton(job.place, job.title);
        if (go) { n.append(go); n.classList.add('has-locate'); }
        return n;
      }) : [el('p', 'muted small', 'Nothing going here at the moment. Walk somewhere else and come back.')]));
      // one line under the list so the missing "take it" is explained rather than simply missing
      bbox.append(el('p', 'muted small',
        'Work is heard of here and taken elsewhere: a notice board in a settlement, or the person asking.'));
    }

    /**
     * ---- R14: GOING ON NEAR YOU.
     *
     *   "These should also appear in the journal with a button to view location."
     *
     * The same rows as the Nearby panel under the minimap, from the same pure list (js/nearby.js),
     * because two lists of "what is happening" that could disagree is worse than one that is
     * sometimes a second out of date. The panel is five rows and a glance while you walk; this is
     * all of them, when you have stopped to read.
     */
    const nbox = $('journal-nearby');
    if (nbox) {
      const near = this.nearby?.() || [];
      nbox.replaceChildren(...(near.length ? near.map(a => {
        const n = el('div', 'journal-row has-locate');
        n.innerHTML = `<span>${NEARBY_ICONS[a.kind] || '·'} ${a.name}</span>`
          + `<span class="muted">${a.where} ${a.compass}${a.ttl != null ? ` · ${mmss(a.ttl)} left` : a.state ? ` · ${a.state}` : ''}</span>`;
        const go = this.locateButton({ x: a.x, z: a.z, name: a.name, kind: a.kind === 'fall' ? 'fall' : 'place' }, a.name);
        if (go) n.append(go);
        return n;
      }) : [el('p', 'muted small', 'Nothing going on within a walk of here. Keep moving.')]));
    }

    /** ---- WORD GOING ROUND. The only thing in the game allowed to talk about somewhere else. */
    const rbox = $('journal-rumours');
    if (rbox) {
      const said = this.rumours?.() || [];
      rbox.replaceChildren(...(said.length ? said.slice(0, 14).map(r => {
        const n = el('div', 'rumour-row');
        n.innerHTML = `<span>${r.text}.</span><span class="who">${r.from}</span>`;
        return n;
      }) : [el('p', 'muted small', 'Nobody has told you anything yet. Talk to people on the road.')]));
    }

    /**
     * ---- R14: PLACES YOU KEEP.
     *
     *   "Add the ability to store locations and view them in a list, with a checkbox to toggle
     *    whether the location is highlighted on the map with a star."
     *
     * Three controls a row and no more: the star (highlighted on the map, or not), ⌖ (show me), and
     * × (forget it). They are saved markers — `js/markers.js` — so they ride the save with
     * everything else and no second store has to be kept in step.
     */
    const savedBox = $('journal-saved');
    if (savedBox) {
      const kept = j?.saved || [];
      savedBox.replaceChildren(...(kept.length ? kept.map(sv => {
        const n = el('div', 'journal-row saved-row has-locate');
        const star = el('button', 'row-star' + (sv.starred ? ' on' : ''), sv.starred ? '\u2605' : '\u2606');
        star.dataset.tip = sv.starred
          ? 'Starred. Highlighted on the map. Click to stop.'
          : 'Not starred. Click to highlight it on the map.';
        star.setAttribute('aria-pressed', sv.starred ? 'true' : 'false');
        star.onclick = ev => { ev.stopPropagation(); this.onStarSaved?.(sv.id, !sv.starred); this.renderJournal(); };
        n.append(star);
        n.append(el('span', null, sv.name));
        n.append(el('span', 'muted', sv.note || ''));
        const go = this.locateButton(sv.place, sv.name);
        if (go) n.append(go);
        const del = el('button', 'row-forget', '\u00d7');
        del.dataset.tip = 'Forget this place.';
        del.onclick = ev => { ev.stopPropagation(); hideTip(); this.onForgetSaved?.(sv.id); this.renderJournal(); };
        n.append(del);
        return n;
      }) : [el('p', 'muted small', 'Nothing kept yet. Ctrl-shift-click the map, or keep a place off one of these lists.')]));
    }

    // ---- the zone table: every named region, the levels that live in it, and what it looks like
    const zbox = $('sheet-zones');
    if (zbox) {
      const list = this.zones?.list?.() || [];
      const here = this.here || null;
      meta('journal-zone-count', list.length ? `${list.length} region${list.length === 1 ? '' : 's'}` : '');
      zbox.replaceChildren(...(list.length ? list.map(z => {
        const n = el('div', 'zone-row' + (here && z.id === here.id ? ' here' : ''));
        const tone = zoneTone(z.midLevel, this.player?.level || 1);
        /**
         * E12: THE DESCRIPTOR ONLY ON THE REGION YOU ARE IN.
         *
         * It is sampled from the biome under the region's middle, so with fifty-odd regions on a
         * green world five rows in a row read "a wide stretch of warm, green open grass, easy going,
         * open to the sea" — and where the name came out of Name Forge and the ground did not agree,
         * "The Frost Wastes" was described as mild and well watered. One copy of it, on the row you
         * are standing in, where it is telling you something you can check by looking up.
         */
        const mine = !!here && z.id === here.id;
        n.innerHTML = `<span>${z.name}${z.home ? ' <i class="muted small">(where you started)</i>' : ''}</span>
          <span class="zone-${tone}">level ${z.minLevel}–${z.maxLevel}</span>
          <span class="muted small">${z.danger}</span>`
          + (mine && z.descriptor ? `<span class="zone-desc">${z.descriptor}</span>` : '');
        // R14: a region's centre is a real place, and "where is The Frost Wastes" was a question
        // the zone table could not answer
        const go = z.center ? this.locateButton({ cell: { x: z.center.x, y: z.center.y }, name: z.name, kind: 'place' }, z.name) : null;
        if (go) { n.append(go); n.classList.add('has-locate'); }
        return n;
      }) : [el('p', 'muted small', 'No regions on this world.')]));
    }
  }

  // ---------------------------------------------------------------- the notice board

  /**
   * THE BOARD IN A SETTLEMENT — the one screen a board job may be taken from.
   *
   * 4.5: "Players should look for towns to pick up quests, or pick up randomly from events in the
   * world, but not just through interface." The Journal lost its take-a-job click; this is where
   * that click went, and it only opens when something in the world opens it — main.js calls this
   * when the player walks up to a board in a town, the same way it opens the talk panel for a
   * person. Nothing on the sheet and no key opens it.
   *
   *   hud.openNoticeBoard({ where: town.name });
   */
  openNoticeBoard({ where = '', title = 'Notice board' } = {}) {
    const root = $('noticeboard');
    if (!root) return false;
    this.boardOpen = true;
    const heading = $('board-title');
    if (heading) heading.textContent = title;
    const place = $('board-where');
    if (place) place.textContent = where ? `in ${where}` : '';
    if (!root.dataset.wired) {
      root.dataset.wired = '1';
      $('board-close').onclick = () => this.closeNoticeBoard();
      // click the dark behind the card to step away, the way every other overlay here behaves
      root.onclick = e => { if (e.target === root) this.closeNoticeBoard(); };
      window.addEventListener('keydown', e => {
        if (this.boardOpen && e.code === 'Escape') { e.preventDefault(); this.closeNoticeBoard(); }
      });
    }
    root.classList.remove('hidden');
    this.renderNoticeBoard();
    return true;
  }

  closeNoticeBoard() {
    this.boardOpen = false;
    $('noticeboard')?.classList.add('hidden');
  }

  /** What is pinned to it. Redrawn after every take, so a job that goes flips to "taken". */
  renderNoticeBoard() {
    const list = $('board-list');
    if (!list) return;
    const board = this.board?.() || [];
    list.replaceChildren(...(board.length ? board.map(job => {
      const row = el('div', 'board-job' + (job.taken ? ' taken' : ''));
      const from = job.faction ? this.factionName?.(job.faction) : 'posted by the village';
      const away = job.place && this.player ? this.distanceTo?.(job.place) : null;
      row.innerHTML = `<span>${job.title}<span class="from">${from}${away ? ` · ${away}` : ''}</span></span>`
        + `<span class="pay">${job.reward.gold}g · ${job.reward.xp} xp</span>`;
      row.dataset.tip = `${job.text}\n\n${job.scope === 'adjacent' ? 'Next door.' : 'In this zone.'}`;
      if (job.taken) {
        row.append(el('span', 'muted small', 'taken'));
      } else {
        const take = el('button', 'chip', 'Take it');
        take.onclick = () => { this.onTakeJob?.(job); hideTip(); this.renderNoticeBoard(); };
        row.append(take);
      }
      return row;
    }) : [el('p', 'muted small', 'Nothing is pinned to it today. Come back after something happens here.')]));
  }

  /**
   * The hover card for an item: the full thing — base numbers, every property spelled out in plain
   * language, set progress, lore, and what it would change if you put it on.
   */
  itemCard(item, { worn = false } = {}) {
    if (!item) return null;
    const player = this.player;
    const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
    // Some items could go in more than one place: a one-handed weapon can take the off hand, and a
    // ring can go on either hand. Hold Shift and the card compares against the other one instead.
    const alt = ALT_SLOT[slot] || null;
    const canAlt = !!alt && (slot !== 'weapon' || (!item.twoHanded && item.offHandOk));
    const compareSlot = (this.shiftHeld && canAlt) ? alt : slot;
    const current = worn ? null : player?.equipment?.[compareSlot];
    const delta = current ? itemScore(item) - itemScore(current) : 0;

    const bits = [];
    bits.push(`<b class="${rarityClass(item)}">${displayName(item)}</b>`);
    const kind = [
      SLOT_LABELS[slot] || slot,
      item.baseName && item.baseName !== item.name ? item.baseName : null,
      item.twoHanded ? 'two-handed' : null,
    ].filter(Boolean).join(' · ');
    bits.push(`<div class="tip-dim">${item.rarity}${item.quality ? ' · ' + item.quality : ''} · ${kind}</div>`);

    /**
     * Item level and what it takes to wear the thing.
     *
     * The requirement turns a different colour when something has lowered it — "this should cause
     * the level requirement indicator on tooltips to appear a different color than normal,
     * indicating it has been modified" — and it goes red when you simply cannot wear it yet, which
     * is the one thing a card has to say loudly.
     */
    if (item.ilvl) {
      const req = this.rpg?.levelRequirement
        ? this.rpg.levelRequirement(item, player)
        : { level: item.levelReq ?? 1, base: item.levelReq ?? 1, reduced: false, off: 0 };
      const canWear = (player?.level ?? 99) >= req.level;
      const cls = !canWear ? 'req-no' : req.reduced ? 'req-cut' : 'req-ok';
      const note = req.reduced ? ` <i class="tip-dim">(was ${req.base}, ${req.off} off)</i>` : '';
      bits.push(`<div class="tip-req">item level ${item.ilvl} · `
        + `<span class="${cls}">requires level ${req.level}</span>${note}`
        + (canWear ? '' : ' <i class="tip-dim">— you cannot wear this yet</i>') + '</div>');
    }

    // the base numbers
    const base = [];
    if (item.dmg) base.push(`<b>${item.dmg[0]}\u2013${item.dmg[1]}</b> damage`);
    if (item.armor) base.push(`<b>${item.armor}</b> armour`);
    if (item.ranged) base.push('ranged');
    if (item.brand) base.push(`branded with ${item.brand}`);
    if (item.quiver) base.push('quiver');
    if (base.length) bits.push(`<div class="tip-base">${base.join(' · ')}</div>`);

    /**
     * THE WEAPON'S RHYTHM, as glyphs and then in words.
     *
     * "The attack pattern should be indicated on the weapon using some type of glyphs." A rapier
     * shows two arrows, a greatsword shows a sweep and a drop. Below it, the same thing said plainly,
     * with the reach and the clock — which is how you tell a dagger from a halberd without equipping
     * either of them.
     */
    /**
     * EVERY weapon describes itself — this used to skip the ranged ones entirely.
     *
     * "I got a weapon called 'truthseeker' that shoots a projectile. How am I supposed to know that
     * without testing it?" The guard here was `&& !item.ranged`, so the whole description block was
     * skipped for every bow, wand and staff in the game: the one class of weapon whose behaviour you
     * cannot guess from its name was the one class that said nothing. `js/weapons.js` now writes a
     * headline, a sentence and the element onto the item, and `patternText` returns a ranged or a
     * staff sentence instead of a swing rhythm, so there is nothing left for the guard to protect.
     */
    if (item.type === 'weapon') {
      if (item.weaponHeadline) bits.push(`<div class="tip-head">${item.weaponHeadline}</div>`);
      if (item.weaponLine) bits.push(`<div class="tip-dim">${item.weaponLine}</div>`);
      if (item.castLine) bits.push(`<div class="tip-dim">${item.castLine}</div>`);
      if (item.elementNote) bits.push(`<div class="tip-dim">${item.elementNote}</div>`);
    }
    if (item.type === 'weapon' && item.rangeClass === 'melee') {
      const p = profileOf(item);
      bits.push(`<div class="tip-pattern"><span class="glyphs">${patternGlyphs(item)}</span>`
        + `<span class="muted small">${patternText(item)}</span></div>`);
      if (p.twoHanded) bits.push('<div class="tip-dim">Two-handed — it takes the off hand with it.</div>');
    }

    // Every property, in plain language, each one listed ONCE.
    //
    // The two filters used to overlap: an affix carrying `intrinsic: true` also carries
    // `baseIntrinsic: true`, so it passed the first test *and* the second and the card printed it
    // twice — once as an ordinary property and again in white as "(part of the item)". The rule is
    // simply whether it came with the base or was rolled onto it.
    const affixes = (item.affixes || []).filter(a => !a.baseIntrinsic);
    const intrinsic = (item.affixes || []).filter(a => a.baseIntrinsic && (a.brand || a.intrinsic));
    if (affixes.length) {
      bits.push('<ul class="tip-affixes">' + affixes.map(a => {
        const cls = a.id === 'legendary_effect' ? 'tip-legend'
          : a.setFixed ? 'tip-set'
          : String(a.stat).startsWith('cond_') ? 'tip-cond' : 'tip-stat';
        const tag = a.reworked ? ' <i class="tip-dim">reworked</i>' : a.enchanted ? ' <i class="tip-dim">enchanted</i>' : '';
        return `<li class="${cls}">${describeAffix(a)}${tag}</li>`;
      }).join('') + '</ul>');
    }
    if (intrinsic.length) {
      bits.push('<ul class="tip-affixes">' + intrinsic.map(a => `<li class="tip-base-affix">${describeAffix(a)} <i class="tip-dim">(part of the item)</i></li>`).join('') + '</ul>');
    }
    if (!affixes.length && !intrinsic.length) bits.push('<div class="tip-dim">No properties. Promote it at the bench to give it some.</div>');

    // set progress
    if (item.setId && this.rpg?.loot?.setInfo) {
      const info = this.rpg.loot.setInfo(item, player?.equipment || {}, { slot });
      if (info) {
        // `cond_setThresholdReduce` and `cond_extraSetPiece` make you count as wearing more than you
        // are. setInfo() does not know about them, so a bonus that WAS live read as inactive on the
        // card — which is what the user saw with the Drillmaster's Treads.
        const extra = this.rpg.setPieceBonus?.(player || {}) || 0;
        const counted = info.worn + extra;
        bits.push(`<div class="tip-set-head">${info.set.name} — ${info.worn} of ${info.pieces} worn`
          + (extra ? ` <i class="tip-dim">(counts as ${counted})</i>` : '') + '</div>');
        bits.push('<ul class="tip-affixes">' + info.steps.map(st => {
          const on = counted >= st.at;
          // "Update set bonuses to read naturally like other affixes, instead of summarized like
          // 'int +7, cooldownReduction +0.05'. These are technical names, they should not be
          // displayed to the player." A set bonus is a bag of stats, and every stat in the game
          // already knows how to describe itself — so ask it, the same way an affix does.
          const names = Object.entries(st.bonus)
            .filter(([k]) => k !== 'desc')
            .map(([stat, value]) => describeAffix({ stat, value }))
            .join(', ');
          return `<li class="${on ? 'tip-set' : 'tip-dim'}">${st.at} pieces: ${names || st.bonus.desc || 'a power'}${on ? ' ✓' : ''}</li>`;
        }).join('') + '</ul>');
      }
    }

    if (item.reworks) bits.push(`<div class="tip-dim">Reworked ${item.reworks} time${item.reworks > 1 ? 's' : ''} — the next one costs more.</div>`);
    if (item.lore) bits.push(`<div class="tip-lore">${item.lore}</div>`);

    // what changes if you wear it
    if (current) {
      bits.push(`<div class="tip-compare"><b>Instead of ${current.name}</b>`
        + `<span class="tip-dim"> (${SLOT_LABELS[compareSlot] || compareSlot})</span>`
        + `<span class="${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}"> ${delta > 0 ? '+' : ''}${delta}</span></div>`);
      const was = [];
      if (current.dmg) was.push(`${current.dmg[0]}\u2013${current.dmg[1]} damage`);
      if (current.armor) was.push(`${current.armor} armour`);
      if (was.length) bits.push(`<div class="tip-dim">it has ${was.join(' · ')}</div>`);
      const changed = (current.affixes || []).filter(a => !a.baseIntrinsic).map(a => describeAffix(a));
      if (changed.length) bits.push(`<ul class="tip-affixes tip-losing">${changed.map(t => `<li>${t}</li>`).join('')}</ul>`);
    } else if (!worn) {
      bits.push(`<div class="tip-dim">Nothing worn in ${SLOT_LABELS[compareSlot] || compareSlot}.</div>`);
    }
    if (canAlt && !worn) {
      bits.push(`<div class="tip-shift">${this.shiftHeld ? '\u2191' : 'Hold'} <b>Shift</b> to compare against ${SLOT_LABELS[this.shiftHeld ? slot : alt]} instead</div>`);
    }
    bits.push(`<div class="tip-foot">worth ${this.rpg?.price ? this.rpg.price(item) : '?'} gold · recycles into materials</div>`);
    return bits.join('');
  }

  /** Give an item a stable id for a tooltip to look it back up by. */
  tipFor(node, item) {
    if (!item) return node;
    const key = item.id || (item.id = 'tip_' + Math.random().toString(36).slice(2, 9));
    this.tipItems.set(key, item);
    node.dataset.tipRender = 'item';
    node.dataset.tipItem = key;
    return node;
  }

  /** The plain-text description, still used where a tooltip cannot reach (the reward popup). */
  describe(item) {
    const bits = [displayName(item), `${item.rarity}${item.quality ? ' · ' + item.quality : ''}`];
    if (item.dmg) bits.push(`Damage ${item.dmg[0]}–${item.dmg[1]}`);
    if (item.armor) bits.push(`Armour ${item.armor}`);
    for (const a of item.affixes || []) bits.push('· ' + describeAffix(a));
    if (item.setName) bits.push(`Part of ${item.setName}`);
    if (item.lore) bits.push(item.lore);
    return bits.join('\n');
  }

  /** Point the HUD at a different world — a new planet means a new minimap. */
  setTerrain(terrain) {
    this.terrain = terrain;
    this.buildMinimapBase();
  }

  setPlayer(player) {
    this.player = player;
    if (this.sheetOpen) this.renderSheet();
  }
}
