// Farhold — the interface over the top of the world: bars, the log, the minimap, and the character
// sheet. Plain DOM, no framework, no build step.
//
// The HUD never decides anything; main.js hands it the player and it draws what is there.
//
// Round 4 split the sheet into **tabs** — Character, Inventory, Skills, Crafting, Journal — because
// one scrolling column could not hold thirty passives, six skills, a materials list and a bench.
// Only the visible tab is rebuilt, so opening the sheet is cheap whatever is in the bag.

import { itemScore, SLOTS, describeAffix } from './rpg.js';
import { worldPixels } from '../../../worldgen/js/render.js';
import { M_PER_CELL } from './planet.js';
import { zoneTone } from './zones.js';
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

/** The colour class for an item's name — the same rarity words Emberveil uses. */
export function rarityClass(item) {
  if (!item) return 'rarity-normal';
  if (item.setId) return 'rarity-set';
  if (item.isUnique) return 'rarity-unique';
  return 'rarity-' + (item.rarity || 'normal');
}

const SLOT_LABELS = {
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
    rpg, terrain, onEquip, onSpendAttr, onSpendPassive = null, onTakeTalent = null,
    onRecycle = null, onCraft = null, craft = null, pets = null, zones = null,
    journal = null, seed = 1, onOpen = null, onClose = null,
  } = {}) {
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
    this.onSpendAttr = onSpendAttr;
    this.onOpenSheet = onOpen;
    this.onCloseSheet = onClose;
    this.lines = [];
    this.sheetOpen = false;
    this.tab = 'character';
    this.bench = null;                 // the item on the crafting bench
    this.minimapBase = null;
    this.lastMinimap = 0;
    this.skillState = [];
    /** How many world cells the minimap shows across. `+` and `-` change it. */
    this.minimapSpan = 26;

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
    $('inv-recycle-junk').onclick = () => bulk('normal');
    $('inv-recycle-magic').onclick = () => bulk('magic');
    $('inv-recycle-rare').onclick = () => bulk('rare');
    this.buildMinimapBase();
  }

  // ---------------------------------------------------------------- log

  log(text, cls = '') {
    this.lines.unshift({ text, cls });
    if (this.lines.length > 9) this.lines.pop();
    const box = $('log');
    box.replaceChildren(...this.lines.map(l => {
      const div = el('div', l.cls, l.text);
      return div;
    }));
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
  reticles(marks, under = null, camera = null, card = null) {
    const box = $('reticles');
    if (!box) return;
    if (!marks || !marks.length || !camera) {
      if (this._ret?.length) { box.replaceChildren(); this._ret = null; }
      return;
    }
    if (!this._ret || this._ret.length !== marks.length) {
      this._ret = marks.map(() => {
        const n = el('div', 'reticle');
        n.innerHTML = '<i class="rt tl"></i><i class="rt tr"></i><i class="rt bl"></i><i class="rt br"></i>'
          + '<span class="rt-name"></span><span class="rt-dist"></span>';
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
    }

    // the card, beside the one you are pointing at
    const info = $('space-card');
    if (!info) return;
    info.classList.toggle('hidden', !card);
    if (!card) return;
    info.innerHTML = `<div class="sc-name">${card.name}</div>`
      + `<div class="sc-kind">${card.kind}${card.distanceAu != null ? ` · ${card.distanceAu.toFixed(2)} AU` : ''}</div>`
      + `<ul class="sc-lines">${card.lines.map(l => `<li>${l}</li>`).join('')}</ul>`
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
          + `<i class="skill-cd"></i>`;
        return slot;
      });
      box.replaceChildren(...this._skillSlots);
    }
    for (let i = 0; i < state.length; i++) {
      const s = state[i], slot = this._skillSlots[i];
      slot.querySelector('.skill-name').textContent = s.locked ? `level ${s.unlockAt}` : s.name;
      slot.querySelector('.skill-mp').textContent = s.locked ? '' : (s.mp ? String(s.mp) : '');
      slot.querySelector('.skill-cd').style.height = `${Math.round((s.ready / s.cooldown) * 100)}%`;
      slot.classList.toggle('blocked', !s.usable);
      slot.classList.toggle('locked', !!s.locked);
      slot.classList.toggle('ready', s.usable);
      // the hover card is the tooltip now; `title` would show a second, worse one over the top
    }
  }

  // ---------------------------------------------------------------- bars and place

  tick(player, { place, zone, clock, target, sky, weather, where }) {
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
    $('hud-name').innerHTML = `${player.name} <small>level ${player.level}${player.pendingAttr ? ' · ' + player.pendingAttr + ' points to spend' : ''}</small>`;

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

    if (target) {
      $('target').classList.remove('hidden');
      const rank = target.rank && target.rank !== 'normal' ? ` · ${target.rank}` : '';
      $('target-name').textContent = `${target.name} · level ${target.level}${rank}`;
      $('target-name').className = target.rank === 'rare' ? 'rarity-unique'
        : target.rank === 'champion' ? 'rarity-rare' : target.rank === 'boss' ? 'rarity-legendary' : '';
      $('target-fill').style.width = Math.max(0, target.hp / target.maxHp * 100) + '%';
    } else {
      $('target').classList.add('hidden');
    }
    if (sky) $('hud-sky').textContent = sky;
    if (weather !== undefined) $('hud-weather').textContent = weather;
    const whereBox = $('hud-where');
    if (whereBox && where !== undefined) whereBox.textContent = where;
  }

  /** Where the player is, in every form worth pasting into a bug report. */
  locationText(control, dungeon = null) {
    if (dungeon) {
      return `seed ${this.seed} · ${dungeon.name} · x ${Math.round(control.x)} z ${Math.round(control.z)}`
        + ` · ${dungeon.plan.rooms.length} rooms · level ${dungeon.level}`;
    }
    const cell = this.terrain.cellAt(control.x, control.z);
    return `seed ${this.seed} · x ${Math.round(control.x)} z ${Math.round(control.z)} · cell ${cell.x},${cell.y}`
      + ` · altitude ${Math.round(control.y)} m · ${this.terrain.biomeAt(control.x, control.z).name}`;
  }

  /** XP thresholds without importing the module twice. */
  _xpForLevel(level) { return level <= 1 ? 0 : Math.round(58 * Math.pow(level - 1, 1.86)); }

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

  drawMinimap(player, enemies = [], extras = []) {
    const canvas = $('minimap');
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    const span = this.minimapSpan;       // cells across the window; `+` and `-` change it
    const cx = player.x / M_PER_CELL, cy = player.z / M_PER_CELL;
    if (this.minimapBase) {
      ctx.drawImage(this.minimapBase, cx - span / 2, cy - span / 2, span, span, 0, 0, size, size);
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
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,16,.95)';
        ctx.strokeText(x.icon, ix, iy);
        ctx.fillStyle = x.color;
        ctx.fillText(x.icon, ix, iy);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      } else pip(x.x, x.z, x.color, x.r || 3.2);
    }
    // enemies: a red pip with a dark ring, so they read over snow, sand and grass alike; a
    // champion or a rare gets its own colour, because that is the pip worth walking towards
    for (const e of enemies) {
      if (e.dying != null) continue;
      const colour = e.rank === 'boss' ? '#ffd24a' : e.rank === 'rare' ? '#ff8adf' : e.rank === 'champion' ? '#6ab0ff' : '#ff4a2a';
      pip(e.x, e.z, colour, e.rank && e.rank !== 'normal' ? 4.6 : 3.6);
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

  toggleSheet(open = !this.sheetOpen) {
    hideTip();
    this.sheetOpen = open;
    $('sheet').classList.toggle('hidden', !open);
    if (open) { this.onOpenSheet?.(); this.renderSheet(); }
    else this.onCloseSheet?.();
    return open;
  }

  setTab(tab) {
    hideTip();
    this.tab = tab;
    for (const btn of $('sheet-tabs').querySelectorAll('button')) btn.classList.toggle('on', btn.dataset.tab === tab);
    for (const body of document.querySelectorAll('.tab-body')) body.classList.toggle('hidden', body.dataset.tab !== tab);
    $('sheet-title').textContent = {
      character: 'Character', inventory: 'Inventory', skills: 'Skills',
      crafting: 'Crafting', upgrade: 'Upgrade', journal: 'Journal',
    }[tab] || 'Character';
    this.renderSheet();
  }

  /** Only the tab you are looking at gets rebuilt. */
  renderSheet() {
    const player = this.player;
    if (!player) return;
    $('sheet-purse').innerHTML = `<b>${player.gold}</b> gold · level ${player.level}`;
    if (this.tab === 'character') this.renderCharacter();
    if (this.tab === 'inventory') this.renderInventory();
    if (this.tab === 'skills') this.renderSkills();
    if (this.tab === 'crafting') this.renderCrafting();
    if (this.tab === 'upgrade') this.renderUpgrade();
    if (this.tab === 'journal') this.renderJournal();
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
        <span class="name ${item ? rarityClass(item) : 'muted'}">${item ? item.name : '—'}</span>`;
      div.dataset.tipRender = 'slot';
      div.dataset.tipSlot = slot;
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
    ];
    $('sheet-stats').replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = el('dt', null, k);
      if (STAT_HELP[k]) { dt.dataset.tipRender = 'stat'; dt.dataset.tipStat = k; dt.tabIndex = 0; }
      return [dt, el('dd', null, String(v))];
    }));

    // attributes with the level-up spend buttons
    $('sheet-attrs').replaceChildren(...Object.entries(player.attrs).map(([key, value]) => {
      const row = el('div', 'attr-row');
      const label = el('span', null, key.toUpperCase());
      label.style.width = '42px';
      const val = el('b', null, String(value));
      val.style.width = '28px';
      const btn = el('button', null, '+');
      btn.disabled = !player.pendingAttr;
      btn.onclick = () => { this.onSpendAttr(key); this.renderSheet(); };
      row.append(label, val, btn);
      return row;
    }));
    $('sheet-points').textContent = player.pendingAttr ? `${player.pendingAttr} point${player.pendingAttr > 1 ? 's' : ''} to spend` : 'no points to spend';

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
          lines.push({ from: item.name, text: describeAffix(a), rarity: rarityClass(item) });
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
    }

    $('sheet-inert').textContent = d.inert?.length
      ? `Not understood by the effect registry: ${d.inert.join(', ')}`
      : '';
  }

  renderInventory() {
    const player = this.player;
    this.slotGrid('inv-slots');
    $('inv-count').textContent = `${player.bag.length} item${player.bag.length === 1 ? '' : 's'}`;
    const bag = $('sheet-bag');
    if (!player.bag.length) {
      bag.replaceChildren(el('div', 'empty', 'Nothing in the bag yet. Kill something.'));
      return;
    }
    bag.replaceChildren(...player.bag.map(item => this.bagRow(item)));
  }

  /** One line in the bag: name, slot, how it compares, and a recycle button. */
  bagRow(item, { pick = null } = {}) {
    const player = this.player;
    const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
    const worn = player.equipment[slot];
    const delta = itemScore(item) - itemScore(worn);
    const row = el('div', 'row');
    this.tipFor(row, item);
    row.tabIndex = 0;
    row.innerHTML = `<span class="${rarityClass(item)}">${item.name}</span>
      <span class="muted small">${SLOT_LABELS[slot] || slot}</span>
      <span class="score ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '– '}${Math.abs(delta)}</span>`;
    if (pick) {
      row.onclick = () => { hideTip(); pick(item); };
    } else {
      row.onmouseenter = () => { this.hoverItem = item; };
      row.onmouseleave = () => { if (this.hoverItem === item) this.hoverItem = null; };
      row.onfocus = () => { this.hoverItem = item; };
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
    const box = $('sheet-skills');
    if (box) {
      box.replaceChildren(...this.skillState.map((s, i) => {
        const row = el('div', 'skill-row' + (s.locked ? ' locked' : ''));
        row.dataset.tipRender = 'skill';
        row.dataset.tipSkill = String(i);
        row.tabIndex = 0;
        row.innerHTML = `<span class="skill-key">${i + 1}</span>
          <span class="skill-title">${s.name}</span>
          <span class="muted small">${s.locked ? `unlocks at level ${s.unlockAt}` : `${s.mp} mana · ${s.cooldown.toFixed(1)}s`}</span>
          <span class="muted skill-desc">${s.desc || ''}</span>`;
        return row;
      }));
      if (!this.skillState.length) box.replaceChildren(el('p', 'muted small', 'No skills on this screen.'));
    }

    // talents: the choices only appear when there is a point to spend
    const talentBox = $('sheet-talents');
    if (talentBox) {
      const taken = (player.talents || []).map(id => this.rpg.talentList.find(t => t.id === id)).filter(Boolean);
      const kids = taken.map(t => {
        const row = el('div', 'passive-row maxed');
        row.title = t.desc;
        row.append(el('span', 'passive-name', t.name), el('span', 'muted small', t.desc));
        return row;
      });
      if (player.pendingTalent) {
        for (const t of this.rpg.talentChoices(player)) {
          const row = el('div', 'passive-row');
          row.title = t.desc;
          const btn = el('button', null, '+');
          btn.onclick = () => { this.onTakeTalent?.(t.id); this.renderSheet(); };
          row.append(el('span', 'passive-name', t.name), el('span', 'muted small', t.desc), btn);
          kids.push(row);
        }
      } else if (!taken.length) {
        kids.push(el('p', 'muted small', 'A talent at levels 3, 8, 13, 18, 23 and 28.'));
      }
      talentBox.replaceChildren(...kids);
    }
    const tp = $('sheet-talent-points');
    if (tp) tp.textContent = player.pendingTalent ? `${player.pendingTalent} to choose` : '';

    // the passive tree
    const tree = $('sheet-passives');
    if (tree) {
      tree.replaceChildren(...this.rpg.passives(player).map(node => {
        const row = el('div', 'passive-row' + (node.rank >= node.maxRank ? ' maxed' : ''));
        row.title = node.desc;
        const pips = el('span', 'passive-pips', '●'.repeat(node.rank) + '○'.repeat(Math.max(0, node.maxRank - node.rank)));
        const btn = el('button', null, '+');
        btn.disabled = !player.pendingPassive || node.rank >= node.maxRank;
        btn.onclick = () => { this.onSpendPassive?.(node.id); this.renderSheet(); };
        row.append(el('span', 'passive-name', node.name), pips, btn);
        return row;
      }));
    }
    const pp = $('sheet-passive-points');
    if (pp) pp.textContent = player.pendingPassive ? `${player.pendingPassive} to spend` : 'none to spend';
  }

  // ---------------------------------------------------------------- crafting and upgrading
  //
  // Two tabs, and both are laid out the way a big MMO lays out a trade skill: a plain LIST of
  // recipes on the left, and a detail panel on the right that only fills in when you click one.
  // The old single panel tried to show sixteen recipes and every cost at once, which is a wall.

  /** The materials row, shared by both tabs. */
  drawMaterials(target) {
    const box = $(target);
    if (!box) return;
    if (!this.craft) { box.replaceChildren(el('p', 'muted small', 'No bench here.')); return; }
    const held = this.craft.held();
    box.replaceChildren(...(held.length ? held.map(m => {
      const chip = el('div', 'material');
      chip.dataset.tipRender = 'material';
      chip.dataset.tipMaterial = m.id;
      chip.tabIndex = 0;
      chip.innerHTML = `<i style="background:${m.color}"></i><span>${m.name}</span><b>${m.n}</b>`;
      return chip;
    }) : [el('p', 'muted small', 'Nothing yet. Recycle something on the Inventory tab — that is where every material comes from.')]));
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
    this.drawMaterials('craft-materials');
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

    // what it makes: a grid you actually choose from
    kids.push(el('h4', null, 'What to make'));
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
    kids.push(grid);

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

    const btn = el('button', 'forge-btn', 'Forge it');
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
    this.drawMaterials('up-materials');
    if (!craft) return;

    // the bench item may have been recycled or equipped since it was picked
    if (this.bench && !player.bag.includes(this.bench) && !Object.values(player.equipment).includes(this.bench)) this.bench = null;

    // what you could work on: the bag, then what you are wearing
    const pick = $('up-pick');
    const candidates = [...player.bag, ...Object.values(player.equipment).filter(Boolean)];
    pick.replaceChildren(...(candidates.length ? candidates.map(item => {
      const row = this.bagRow(item, { pick: it => { this.bench = it; this.craftIndex = 0; this.upRecipe = null; this.renderUpgrade(); } });
      if (item === this.bench) row.classList.add('on');
      return row;
    }) : [el('div', 'empty', 'Nothing to work on.')]));

    // the item itself
    const head = $('up-item');
    if (!this.bench) {
      head.replaceChildren(el('p', 'muted small', 'Pick something on the left. Anything in your bag, or anything you are wearing.'));
      $('up-list').replaceChildren();
      $('up-detail').replaceChildren();
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
    out.push(this.costTable(q.cost || {}));

    out.push(el('h4', null, 'What changes'));
    const change = el('div', 'forge-result');
    change.innerHTML = q.ok
      ? `<div>${q.note || CHANGE_TEXT[r.kind] || 'It is reworked.'}</div>`
        + (r.kind === 'rerollAll' ? '<div class="tip-bad small">Every property is thrown away and rolled again. It can come out worse.</div>' : '')
        + (r.kind === 'promote' ? '<div class="muted small">A promotion always comes with one more property.</div>' : '')
      : `<div class="tip-bad">${q.why}</div>`;
    out.push(change);

    const btn = el('button', 'forge-btn', 'Do it');
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

  renderJournal() {
    const j = this.journal?.();
    const jbox = $('sheet-journal');
    if (jbox && j) {
      const kids = [];
      const head = el('div', 'journal-head');
      head.innerHTML = `<b>${j.title}</b> <span class="muted small">${Math.round(j.share * 100)}% surveyed</span>`;
      kids.push(head);
      for (const o of j.objectives) {
        const row = el('div', 'journal-row' + (o.done ? ' done' : ''));
        row.title = o.desc;
        row.innerHTML = `<span>${o.name}</span><span class="muted">${o.text}</span>`;
        kids.push(row);
      }
      if (j.nemesis) {
        const n = el('div', 'journal-row nemesis');
        n.innerHTML = `<span>${j.nemesis.name} ${j.nemesis.title}</span><span class="muted">beat you ${j.nemesis.defeats}×</span>`;
        kids.push(n);
      }
      if (j.quests?.length) {
        const h = el('div', 'journal-head');
        h.innerHTML = '<b>Work in hand</b>';
        kids.push(h);
        for (const q of j.quests) {
          const row = el('div', 'journal-row' + (q.done ? ' done' : ''));
          row.innerHTML = `<span>${q.title}</span><span class="muted">${q.progress}</span>`;
          kids.push(row);
        }
      }
      const seen = Object.entries(j.bestiary || {}).sort((a, b) => b[1] - a[1]).slice(0, 12);
      if (seen.length) {
        const h = el('div', 'journal-head');
        h.innerHTML = '<b>Killed</b>';
        kids.push(h);
        for (const [id, n] of seen) {
          const row = el('div', 'journal-row');
          row.innerHTML = `<span>${(j.names?.[id] || id).replace(/_/g, ' ')}</span><span class="muted">${n}</span>`;
          kids.push(row);
        }
      }
      jbox.replaceChildren(...kids);
    }

    // the zone table: every named region and the levels that live in it
    const zbox = $('sheet-zones');
    if (zbox) {
      const list = this.zones?.list?.() || [];
      const here = this.here || null;
      zbox.replaceChildren(...(list.length ? list.map(z => {
        const row = el('div', 'zone-row' + (here && z.id === here.id ? ' here' : ''));
        const tone = zoneTone(z.midLevel, this.player?.level || 1);
        row.innerHTML = `<span>${z.name}${z.home ? ' <i class="muted small">(where you started)</i>' : ''}</span>
          <span class="zone-${tone}">level ${z.minLevel}–${z.maxLevel}</span>
          <span class="muted small">${z.danger}</span>`;
        row.title = z.descriptor || '';
        return row;
      }) : [el('p', 'muted small', 'No regions on this world.')]));
    }
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
    bits.push(`<b class="${rarityClass(item)}">${item.name}</b>`);
    const kind = [
      SLOT_LABELS[slot] || slot,
      item.baseName && item.baseName !== item.name ? item.baseName : null,
      item.twoHanded ? 'two-handed' : null,
    ].filter(Boolean).join(' · ');
    bits.push(`<div class="tip-dim">${item.rarity}${item.quality ? ' · ' + item.quality : ''} · ${kind}</div>`);

    // the base numbers
    const base = [];
    if (item.dmg) base.push(`<b>${item.dmg[0]}\u2013${item.dmg[1]}</b> damage`);
    if (item.armor) base.push(`<b>${item.armor}</b> armour`);
    if (item.ranged) base.push('ranged');
    if (item.brand) base.push(`branded with ${item.brand}`);
    if (base.length) bits.push(`<div class="tip-base">${base.join(' · ')}</div>`);

    // every property, in plain language, with the intrinsic ones marked
    const affixes = (item.affixes || []).filter(a => !(a.baseIntrinsic && !a.brand && !a.intrinsic));
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
          const names = Object.entries(st.bonus).filter(([k]) => k !== 'desc').map(([k, v]) => `${k} +${v}`).join(', ');
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
    const bits = [item.name, `${item.rarity}${item.quality ? ' · ' + item.quality : ''}`];
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
