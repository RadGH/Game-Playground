// Entities in a room (stream A). docs/protocol.md §7.2: read fields freely, mutate through the methods
// so the snapshot dirty bits are set. `r` belongs to the rules module (cooldowns, threat, brain state).

import { F, ANIM_ID, STATE } from '../net/protocol.js';

export const BANDS = 3;   // near / mid / far send rates

/** How long a one-shot animation holds before locomotion may replace it (ms). */
export const ONE_SHOT = { attack: 500, attack2: 500, cast: 600, channel: 0, hit: 250, bite: 500, howl: 1200, emote: 1500, interact: 800 };

export class Entity {
  constructor(room, id, spec) {
    this.room = room;
    this.id = id;
    this.kind = spec.kind || 'monster';
    this.type = spec.type || null;
    this.name = spec.name || spec.type || this.kind;
    this.team = spec.team ?? (this.kind === 'player' ? 1 : 2);
    this.level = spec.level || 1;
    this.x = spec.x || 0; this.z = spec.z || 0;
    this.y = spec.y ?? room.groundAt(this.x, this.z);
    this.vy = 0;
    this.airborne = false;
    this.yaw = spec.yaw || 0;
    this.hp = 1; this.hpMax = 1; this.mp = 0; this.mpMax = 0;
    this.animId = 0; this.animSeq = 0; this.busyUntil = 0;
    this.state = spec.state || 0;
    this.target = 0;
    this.dead = false;
    this.char = spec.char || null;
    this.data = spec.data || null;
    this.cls = spec.cls || (spec.char && spec.char.cls) || null;
    this.look = spec.look || (spec.char && spec.char.look) || null;
    this.r = spec.r || {};          // a handoff carries the rules' state over (cooldowns, statuses)
    this.rank = spec.rank || 'normal';
    this.cell = -1;
    this.dirty = new Array(BANDS).fill(F.FULL);
    this.infoVer = 1;
    this.removed = false;
    this.st = null;                 // status ids others draw (play-test 2, Q8): the room keeps it in step with the rules
    this.mount = null;              // the mount a player rides (Q16), on `info.mount`
    this.speedMul = 1;              // movement speed factor while mounted (stepMove's state.speedMul)
  }
  mark(bits) { const d = this.dirty; for (let b = 0; b < BANDS; b++) d[b] |= bits; }

  /**
   * Move. A DEAD body does not move (play-test 1, P8: corpses — and a fallen player — were seen sliding along the
   * ground while lying down): anything that pushes a corpse (a knock, a follower's leash, a chase step the rules
   * left queued) is dropped here, at the one door every move goes through. `force` is for the server itself
   * (a teleport of a body, e.g. into a graveyard); a respawn revives first and then moves.
   */
  moveTo(x, z, y, force = false) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    if (this.dead && !force) return;
    const bd = this.room.bounds;
    x = Math.min(bd.maxX, Math.max(bd.minX, x));
    z = Math.min(bd.maxZ, Math.max(bd.minZ, z));
    const ny = Number.isFinite(y) ? y : this.room.groundAt(x, z);
    if (x === this.x && z === this.z && ny === this.y) return;
    this.x = x; this.z = z; this.y = ny;
    let bits = F.POS;
    if (this.state & (STATE.airborne | STATE.swimming)) bits |= F.Y;
    this.mark(bits);
    if (this.room.grid.move(this)) this.mark(F.FULL);   // crossed a cell: everyone gets the full record
  }
  face(yaw) { if (Number.isFinite(yaw) && yaw !== this.yaw) { this.yaw = yaw; this.mark(F.YAW); } }
  setHp(hp) {
    const v = Math.max(0, Math.min(this.hpMax, Number.isFinite(hp) ? hp : 0));
    if (v !== this.hp) { this.hp = v; this.mark(F.HP); }
  }
  setMp(mp) { this.mp = Math.max(0, Math.min(this.mpMax, Number.isFinite(mp) ? mp : 0)); }
  setMax(hpMax, mpMax = this.mpMax) {
    hpMax = Math.max(1, Math.round(hpMax)); mpMax = Math.max(0, Math.round(mpMax));
    if (hpMax !== this.hpMax) { this.hpMax = hpMax; this.hp = Math.min(this.hp, hpMax); this.mark(F.HP); this.infoVer++; }
    if (mpMax !== this.mpMax && this.kind === 'player') this.infoVer++;     // R6+: info.mpMax
    this.mpMax = mpMax; this.mp = Math.min(this.mp, mpMax);
  }
  /** Play an animation. One-shots (attack, cast, bite, hit…) hold for their duration: loop() waits. */
  anim(name, holdMs = ONE_SHOT[name] || 0) {
    const id = ANIM_ID[name];
    if (id === undefined) return;
    this.animId = id; this.animSeq = (this.animSeq + 1) & 255;
    this.busyUntil = holdMs ? this.room.now() + holdMs : 0;
    this.mark(F.ANIM);
  }
  /** Set a looping animation (idle/walk/run…) if it is not already playing and no one-shot is holding. */
  loop(name) {
    const id = ANIM_ID[name];
    if (id === undefined || id === this.animId || this.dead) return;
    if (this.busyUntil && this.busyUntil > this.room.now()) return;
    this.anim(name, 0);
  }
  setState(bit, on) {
    const s = on ? (this.state | bit) : (this.state & ~bit);
    if (s !== this.state) {
      this.state = s;
      this.mark(F.STATE | ((bit & (STATE.airborne | STATE.swimming)) ? F.Y : 0));
    }
  }
  setTarget(id) { id = id | 0; if (id !== this.target) { this.target = id; this.mark(F.TARGET); } }
  setLevel(level) { if (level !== this.level) { this.level = level; this.infoVer++; } }
  kill(by = null) {
    if (this.dead) return;
    this.dead = true;
    this.setHp(0);
    this.setState(STATE.dead, true);
    this.setState(STATE.combat, false);
    this.setTarget(0);
    this.anim('die');
    this.room.event({ type: 'die', d: this.id, by: by ? by.id : undefined, x: this.x, z: this.z });
  }
  /** Back to life (room respawn / rules). */
  revive(hpFrac = 1) {
    this.dead = false;
    this.setState(STATE.dead, false);
    this.setState(STATE.combat, false);
    this.setHp(Math.max(1, Math.round(this.hpMax * hpFrac)));
    this.mp = this.mpMax;
    this.anim('idle');
    this.mark(F.FULL);
  }
  /** `info()` as a JSON string, cached until the description changes (infoVer): a crowd gets the same text. */
  infoJSON() {
    if (this._infoStr === undefined || this._infoStrVer !== this.infoVer) { this._infoStr = JSON.stringify(this.info()); this._infoStrVer = this.infoVer; }
    return this._infoStr;
  }
  /** The description clients get in `info`. */
  info() {
    const o = { id: this.id, kind: this.kind, name: this.name, level: this.level, hpMax: this.hpMax, team: this.team };
    if (this.kind === 'player') {
      o.cls = this.cls; if (this.look) o.look = this.look;
      if (this.gear) o.gear = this.gear;                       // gear: what is worn, to draw (P22; trimmed by the wearer's prefs, Q22)
      if (this.gearOff) o.gearOff = 1;
      if (this.mount) o.mount = this.mount;                    // riding (Q16)
      if (this.mpMax > 0) o.mpMax = this.mpMax;                // R6+: mana bar maximum (the current value comes in `mp` events)
      if (this.sitting) o.sit = 1;                             // S20: sitting down to eat / drink (anim 'sit' too)
      if (this.eating) o.eat = this.eating;                    // S20 (D-world): 'food' | 'drink' while the meal runs
      if (this.fishing) o.fishing = this.fishing;              // T25: a line out — {x, z, tug?} where the bobber floats
    }
    else if (this.type) o.type = this.type;
    if (this.rank !== 'normal') o.rank = this.rank;
    if (this.aff && this.aff.length) { o.aff = this.aff; o.mods = this.aff.map(a => a.id); }   // S4: modifiers [{id, name, aura?}]; `mods` = ids (D-UI reads it)
    if (this.sc && this.sc !== 1) o.sc = this.sc;              // S4: body scale (champions/rares are bigger; a Giant much bigger)
    if (this.st && this.st.length) o.st = this.st;             // statuses everyone draws (Q8)
    if ((this.kind === 'object' || this.kind === 'npc') && this.data) {
      const d = this.data;
      if (d.hidden) { o.hidden = 1; if (d.hint) o.hint = d.hint; }
      if (d.lore) o.lore = d.lore;
      if (d.npc && d.npc.role) o.role = d.npc.role;
      if (d.title) o.title = d.title;                          // S19: the line above an NPC's name ('Weaponsmith', 'Unbinder — resets talents & perks')
      if (this.kind === 'npc') o.type = this.type;
      const key = d.key || (d.chest && d.chest.key);
      if (key) o.key = key;
      if (d.r) o.r = d.r;
      if (d.state) o.state = d.state;
      if (d.rules) o.rules = 1;
      if (d.look) o.look = d.look;                             // R7: how an arena object is dressed ('chained')
      if (d.tether != null) o.tether = d.tether;               // R7: the entity a chain runs to from this object
      if (d.banner) o.banner = d.banner;                       // a cleared dungeon's door: {by, party, at}
      if (d.trace) o.trace = d.trace;                          // grave {who, level, by, at, until} / campfire {who, at, until}
      if (d.waystone) o.waystone = d.waystone.key;
      if (d.site) o.site = d.site;                             // fort / farm / hook marker: {kind, template, friendly, blurb}
      if (d.treasure) o.treasure = { chain: d.treasure.chain, step: d.treasure.step, of: d.treasure.of, cache: d.treasure.cache || undefined };
      if (d.shimmer) o.shimmer = d.shimmer;
      if (d.pool) o.pool = { tier: d.pool.tier, minSkill: d.pool.minSkill, left: d.pool.left, water: d.pool.water };   // T25: a fish pool
      if (d.office) o.office = d.office;                       // a service NPC's own building (Q10): {kind, plot, x, z, yaw, lit}                    // a hidden cache glints within this many metres for someone who has every clue
    }
    return o;
  }
}
