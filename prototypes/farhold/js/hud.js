// Farhold — the interface over the top of the world: bars, the log, the minimap, the character
// sheet and the bag. Plain DOM, no framework, no build step.
//
// The HUD never decides anything; main.js hands it the player and it draws what is there.

import { itemScore, SLOTS } from './rpg.js';
import { worldPixels } from '../../../worldgen/js/render.js';
import { M_PER_CELL } from './planet.js';

const $ = id => document.getElementById(id);

/** The colour class for an item's name — the same rarity words Emberveil uses. */
export function rarityClass(item) {
  if (!item) return 'rarity-normal';
  if (item.setId) return 'rarity-set';
  if (item.isUnique) return 'rarity-unique';
  return 'rarity-' + (item.rarity || 'normal');
}

const SLOT_LABELS = {
  weapon: 'Weapon', offhand: 'Off hand', head: 'Head', chest: 'Chest', legs: 'Legs',
  hands: 'Hands', feet: 'Feet', ring: 'Ring', necklace: 'Necklace',
};

/** What colour each status reads as in the chip row. */
const STATUS_COLOR = {
  burn: '#ff9a5c', poison: '#9ede6a', chill: '#8fd6ff', might: '#ffd27a', guard: '#dfe9ff',
};

export class Hud {
  constructor({ rpg, terrain, onEquip, onSpendAttr, onSpendPassive = null, onTakeTalent = null, journal = null, seed = 1 }) {
    this.journal = journal;
    this.onSpendPassive = onSpendPassive;
    this.onTakeTalent = onTakeTalent;
    this.rpg = rpg;
    this.terrain = terrain;
    this.seed = seed;
    this.onEquip = onEquip;
    this.onSpendAttr = onSpendAttr;
    this.lines = [];
    this.sheetOpen = false;
    this.minimapBase = null;
    this.lastMinimap = 0;

    $('sheet-close').onclick = () => this.toggleSheet(false);
    this.buildMinimapBase();
  }

  // ---------------------------------------------------------------- log

  log(text, cls = '') {
    this.lines.unshift({ text, cls });
    if (this.lines.length > 9) this.lines.pop();
    const box = $('log');
    box.replaceChildren(...this.lines.map(l => {
      const div = document.createElement('div');
      div.className = l.cls;
      div.textContent = l.text;
      return div;
    }));
  }

  // ---------------------------------------------------------------- skill bar

  /**
   * Draw the four slots. `state` is `skills.state()` — name, cooldown left, whether it can be used.
   * Rebuilt only when the shape changes; on every other frame it just moves the cooldown sweep,
   * because this runs at 60 fps and replacing nine nodes a frame is a waste.
   */
  skills(state) {
    const box = $('skillbar');
    if (!box) return;
    // `null` means "no bar" — in the ship, say, where 1-4 does nothing. Clear it once, not per frame.
    if (!state || !state.length) {
      if (this._skillSlots) { box.replaceChildren(); this._skillSlots = null; }
      return;
    }
    if (!this._skillSlots || this._skillSlots.length !== state.length) {
      this._skillSlots = state.map((s, i) => {
        const slot = document.createElement('div');
        slot.className = 'skill-slot';
        slot.innerHTML = `<span class="skill-key">${i + 1}</span>`
          + `<span class="skill-name"></span>`
          + `<span class="skill-mp"></span>`
          + `<i class="skill-cd"></i>`;
        slot.title = `${s.name} — ${s.desc || ''}`;
        return slot;
      });
      box.replaceChildren(...this._skillSlots);
    }
    for (let i = 0; i < state.length; i++) {
      const s = state[i], slot = this._skillSlots[i];
      slot.querySelector('.skill-name').textContent = s.name;
      slot.querySelector('.skill-mp').textContent = s.mp ? String(s.mp) : '';
      slot.querySelector('.skill-cd').style.height = `${Math.round((s.ready / s.cooldown) * 100)}%`;
      slot.classList.toggle('blocked', !s.usable);
      slot.classList.toggle('ready', s.usable);
    }
  }

  // ---------------------------------------------------------------- bars and place

  tick(player, { place, clock, target, sky, weather, where }) {
    const hpPct = Math.max(0, player.hp / player.maxHp * 100);
    $('bar-hp-fill').style.width = hpPct + '%';
    $('bar-hp-text').textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    $('bar-mp-fill').style.width = (player.mp / player.maxMp * 100) + '%';
    $('bar-mp-text').textContent = `${Math.round(player.mp)} / ${player.maxMp}`;

    const lo = this._xpForLevel(player.level), hi = this._xpForLevel(player.level + 1);
    const pct = hi > lo ? Math.max(0, Math.min(100, (player.xp - lo) / (hi - lo) * 100)) : 100;
    $('bar-xp-fill').style.width = pct + '%';
    $('hud-name').innerHTML = `${player.name} <small>level ${player.level}${player.pendingAttr ? ' · ' + player.pendingAttr + ' points to spend' : ''}</small>`;

    // statuses burning/chilling/buffing the player right now
    const chips = Object.values(player.statuses || {});
    const box = $('hud-statuses');
    if (box) box.replaceChildren(...chips.map(st => {
      const c = document.createElement('span');
      c.className = 'status-chip';
      c.style.color = STATUS_COLOR[st.type] || '#cfd8e3';
      c.textContent = `${st.name || st.type} ${st.remaining.toFixed(0)}s`;
      return c;
    }));

    $('hud-place-name').textContent = place || '';
    $('hud-clock').textContent = clock || '';

    if (target) {
      $('target').classList.remove('hidden');
      $('target-name').textContent = `${target.name} · level ${target.level}`;
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
  locationText(control) {
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
    const c = document.createElement('canvas');
    c.width = world.width; c.height = world.height;
    const ctx = c.getContext('2d');
    const px = worldPixels(world, { layer: 'biomes', hillshade: true, shade: 7 });
    const img = ctx.createImageData(world.width, world.height);
    img.data.set(px.data);
    ctx.putImageData(img, 0, 0);
    this.minimapBase = c;
  }

  drawMinimap(player, enemies = []) {
    const canvas = $('minimap');
    const ctx = canvas.getContext('2d');
    const world = this.terrain.world;
    const span = 26;                     // cells across the window
    const cx = player.x / M_PER_CELL, cy = player.z / M_PER_CELL;
    const size = canvas.width;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(this.minimapBase, cx - span / 2, cy - span / 2, span, span, 0, 0, size, size);
    const toPx = (wx, wz) => [
      ((wx / M_PER_CELL) - (cx - span / 2)) / span * size,
      ((wz / M_PER_CELL) - (cy - span / 2)) / span * size,
    ];
    // enemies: a red pip with a dark ring, so they read over snow, sand and grass alike
    for (const e of enemies) {
      if (e.dying != null) continue;
      const [px, py] = toPx(e.x, e.z);
      if (px < -4 || py < -4 || px > size + 4 || py > size + 4) continue;
      ctx.beginPath();
      ctx.arc(px, py, 3.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4a2a';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(10,8,6,.95)';
      ctx.stroke();
    }
    const [px, py] = toPx(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-player.yaw);
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.5, 5); ctx.lineTo(0, 2.5); ctx.lineTo(-4.5, 5); ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(10,20,32,.9)'; ctx.lineWidth = 1.6;
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- character sheet

  toggleSheet(open = !this.sheetOpen) {
    this.sheetOpen = open;
    $('sheet').classList.toggle('hidden', !open);
    if (open) this.renderSheet();
    return open;
  }

  renderSheet() {
    const player = this.player;
    if (!player) return;
    const d = player.derived;

    // equipment
    const grid = $('sheet-slots');
    grid.replaceChildren(...SLOTS.map(slot => {
      const item = player.equipment[slot];
      const div = document.createElement('div');
      div.className = 'slot';
      div.innerHTML = `<span class="label">${SLOT_LABELS[slot]}</span>
        <span class="name ${item ? rarityClass(item) : 'muted'}">${item ? item.name : '—'}</span>`;
      if (item) div.title = this.describe(item);
      div.onclick = () => { if (item) { this.onEquip(null, slot); this.renderSheet(); } };
      return div;
    }));

    // stats
    const stats = $('sheet-stats');
    const rows = [
      ['Health', `${Math.ceil(player.hp)} / ${d.maxHp}`],
      ['Mana', `${Math.round(player.mp)} / ${d.maxMp}`],
      ['Damage', `${d.damage[0]}–${d.damage[1]}`],
      ['Armour', Math.round(d.armor)],
      ['Crit', `${d.critChance.toFixed(1)}% for +${Math.round(d.critDamage)}%`],
      ['Dodge', `${d.dodge.toFixed(1)}%`],
      ['Move speed', `${d.moveSpeed.toFixed(1)} m/s`],
      ['Kills', player.kills],
      ['Gold', player.gold],
    ];
    stats.replaceChildren(...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      return [dt, dd];
    }));

    // attributes with the level-up spend buttons
    const attrs = $('sheet-attrs');
    attrs.replaceChildren(...Object.entries(player.attrs).map(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'attr-row';
      const label = document.createElement('span');
      label.style.width = '42px';
      label.textContent = key.toUpperCase();
      const val = document.createElement('b');
      val.style.width = '28px';
      val.textContent = value;
      const btn = document.createElement('button');
      btn.textContent = '+';
      btn.disabled = !player.pendingAttr;
      btn.onclick = () => { this.onSpendAttr(key); this.renderSheet(); };
      row.append(label, val, btn);
      return row;
    }));
    $('sheet-points').textContent = player.pendingAttr ? `${player.pendingAttr} point${player.pendingAttr > 1 ? 's' : ''} to spend` : 'no points to spend';

    // talents: the choices only appear when there is a point to spend
    const talentBox = $('sheet-talents');
    if (talentBox) {
      const taken = (player.talents || []).map(id => this.rpg.talentList.find(t => t.id === id)).filter(Boolean);
      const kids = taken.map(t => {
        const row = document.createElement('div');
        row.className = 'passive-row maxed';
        row.title = t.desc;
        const name = document.createElement('span');
        name.className = 'passive-name';
        name.textContent = t.name;
        const note = document.createElement('span');
        note.className = 'muted small';
        note.textContent = t.desc;
        row.append(name, note);
        return row;
      });
      if (player.pendingTalent) {
        for (const t of this.rpg.talentChoices(player)) {
          const row = document.createElement('div');
          row.className = 'passive-row';
          row.title = t.desc;
          const name = document.createElement('span');
          name.className = 'passive-name';
          name.textContent = t.name;
          const note = document.createElement('span');
          note.className = 'muted small';
          note.textContent = t.desc;
          const btn = document.createElement('button');
          btn.textContent = '+';
          btn.onclick = () => { this.onTakeTalent?.(t.id); this.renderSheet(); };
          row.append(name, note, btn);
          kids.push(row);
        }
      } else if (!taken.length) {
        const p = document.createElement('p');
        p.className = 'muted small';
        p.textContent = 'A talent at levels 3, 8, 13, 18, 23 and 28.';
        kids.push(p);
      }
      talentBox.replaceChildren(...kids);
    }
    const tp = $('sheet-talent-points');
    if (tp) tp.textContent = player.pendingTalent ? `${player.pendingTalent} to choose` : '';

    // the passive tree
    const tree = $('sheet-passives');
    if (tree) {
      const nodes = this.rpg.passives(player);
      tree.replaceChildren(...nodes.map(node => {
        const row = document.createElement('div');
        row.className = 'passive-row' + (node.rank >= node.maxRank ? ' maxed' : '');
        row.title = node.desc + (node.live ? '' : ' — carried, but not wired up in this phase');
        const name = document.createElement('span');
        name.className = 'passive-name' + (node.live ? '' : ' muted');
        name.textContent = node.name;
        const pips = document.createElement('span');
        pips.className = 'passive-pips';
        pips.textContent = '●'.repeat(node.rank) + '○'.repeat(Math.max(0, node.maxRank - node.rank));
        const btn = document.createElement('button');
        btn.textContent = '+';
        btn.disabled = !player.pendingPassive || node.rank >= node.maxRank;
        btn.onclick = () => { this.onSpendPassive?.(node.id); this.renderSheet(); };
        row.append(name, pips, btn);
        return row;
      }));
    }
    const pp = $('sheet-passive-points');
    if (pp) pp.textContent = player.pendingPassive ? `${player.pendingPassive} to spend` : 'none to spend';

    // inert affixes are declared, not hidden
    $('sheet-inert').textContent = d.inert?.length
      ? `Carried but not yet wired up in this phase: ${d.inert.join(', ')}`
      : '';

    // the journal: the survey, the work in hand, the grudge, and what you have killed
    const j = this.journal?.();
    const jbox = $('sheet-journal');
    if (jbox && j) {
      const kids = [];
      const head = document.createElement('div');
      head.className = 'journal-head';
      head.innerHTML = `<b>${j.title}</b> <span class="muted small">${Math.round(j.share * 100)}% surveyed</span>`;
      kids.push(head);
      for (const o of j.objectives) {
        const row = document.createElement('div');
        row.className = 'journal-row' + (o.done ? ' done' : '');
        row.title = o.desc;
        row.innerHTML = `<span>${o.name}</span><span class="muted">${o.text}</span>`;
        kids.push(row);
      }
      if (j.nemesis) {
        const n = document.createElement('div');
        n.className = 'journal-row nemesis';
        n.innerHTML = `<span>${j.nemesis.name} ${j.nemesis.title}</span><span class="muted">beat you ${j.nemesis.defeats}×</span>`;
        kids.push(n);
      }
      if (j.quests?.length) {
        const h = document.createElement('div');
        h.className = 'journal-head';
        h.innerHTML = '<b>Work in hand</b>';
        kids.push(h);
        for (const q of j.quests) {
          const row = document.createElement('div');
          row.className = 'journal-row' + (q.done ? ' done' : '');
          row.innerHTML = `<span>${q.title}</span><span class="muted">${q.progress}</span>`;
          kids.push(row);
        }
      }
      const seen = Object.entries(j.bestiary || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (seen.length) {
        const h = document.createElement('div');
        h.className = 'journal-head';
        h.innerHTML = '<b>Killed</b>';
        kids.push(h);
        for (const [id, n] of seen) {
          const row = document.createElement('div');
          row.className = 'journal-row';
          row.innerHTML = `<span>${(j.names?.[id] || id).replace(/_/g, ' ')}</span><span class="muted">${n}</span>`;
          kids.push(row);
        }
      }
      jbox.replaceChildren(...kids);
    }

    // bag
    const bag = $('sheet-bag');
    if (!player.bag.length) {
      bag.innerHTML = '<div class="empty">Nothing in the bag yet. Kill something.</div>';
    } else {
      bag.replaceChildren(...player.bag.map((item, i) => {
        const slot = item.type === 'weapon' ? 'weapon' : item.slot === 'ring1' ? 'ring' : item.slot;
        const worn = player.equipment[slot];
        const delta = itemScore(item) - itemScore(worn);
        const row = document.createElement('div');
        row.className = 'row';
        row.title = this.describe(item);
        row.innerHTML = `<span class="${rarityClass(item)}">${item.name}</span>
          <span class="muted small">${SLOT_LABELS[slot] || slot}</span>
          <span class="score ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '▲ +' : delta < 0 ? '▼ ' : '– '}${Math.abs(delta)}</span>`;
        row.onclick = () => { this.onEquip(item); this.renderSheet(); };
        return row;
      }));
    }
  }

  /** The tooltip text for an item: what it is and what it does. */
  describe(item) {
    const bits = [item.name, `${item.rarity}${item.quality ? ' · ' + item.quality : ''}`];
    if (item.dmg) bits.push(`Damage ${item.dmg[0]}–${item.dmg[1]}`);
    if (item.armor) bits.push(`Armour ${item.armor}`);
    for (const a of item.affixes || []) bits.push(`${a.name || a.stat}: ${a.value}`);
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
