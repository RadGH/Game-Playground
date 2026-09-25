// Farhold phase 9 — the long game: a spine, standing, and a grudge.
//
// Three things that make a run more than a walk:
//
//   Objectives — eight of them over one system, each counted from an event the game already fires,
//                so nothing here needs bookkeeping invented for it.
//   Reputation — each settlement remembers what you have done for it, and charges you accordingly.
//   A nemesis  — whatever kills you gets a name, comes back stronger, and remembers.
//
// Pure JavaScript, no DOM, no Three.js: the node tests drive exactly what the game does.

const KINDS = ['distance', 'planets', 'settlements', 'quests', 'kills', 'dungeons', 'legendary', 'nemesis'];

export class Campaign {
  constructor(data = {}, state = null) {
    this.data = data;
    this.objectives = (data.objectives || []).map(o => ({ ...o }));
    this.progress = {};
    for (const o of this.objectives) this.progress[o.id] = 0;

    this.seenPlanets = new Set();
    this.seenSettlements = new Set();
    this.reputation = {};
    this.nemesis = null;
    this.defeatedNemeses = [];
    this.bestiary = {};                 // defId -> how many you have killed

    if (state) this.load(state);
  }

  /**
   * Cut the survey to fit the system it is being run in.
   *
   * Some systems have nobody living in them at all — the balance harness found 29% of them — and on
   * those, "walk into six settlements" and "finish eight jobs" can never be done. An objective you
   * cannot finish is worse than no objective, so the ones that depend on people are scaled down to
   * what is actually out there, and replaced entirely when the answer is none.
   */
  fit({ settlements = Infinity, planets = Infinity, dungeons = Infinity } = {}) {
    for (const o of this.objectives) {
      if (o.kind === 'settlements') o.target = Math.max(0, Math.min(o.target, settlements));
      if (o.kind === 'planets') o.target = Math.max(1, Math.min(o.target, planets));
      if (o.kind === 'dungeons') o.target = Math.max(0, Math.min(o.target, dungeons));
    }
    // With nobody to give work, the jobs objective has to become something else. Fold it into the
    // hunting rather than adding a second kills objective that counts the same events.
    if (settlements === 0) {
      const jobs = this.objectives.find(o => o.kind === 'quests');
      const hunting = this.objectives.find(o => o.kind === 'kills' && o !== jobs);
      if (jobs) {
        if (hunting) {
          hunting.target += 50;
          hunting.name = `${hunting.target} kills`;
          hunting.desc = 'Nobody lives in this system, so there is no work but the hunting.';
          this.objectives = this.objectives.filter(o => o !== jobs);
          delete this.progress[jobs.id];
        } else {
          jobs.kind = 'kills';
          jobs.target = 150;
          jobs.name = '150 kills';
          jobs.desc = 'Nobody lives in this system, so there is no work but the hunting.';
        }
      }
    }
    // drop anything that has been scaled to nothing
    this.objectives = this.objectives.filter(o => o.target > 0);
    this.fitted = { settlements, planets, dungeons };
    return this;
  }

  // ---------------------------------------------------------------- events

  /** Metres walked since the last call. */
  onWalk(metres) {
    if (!(metres > 0)) return;
    this.bump('distance', metres);
  }

  onLandOn(planetId) {
    if (planetId == null || this.seenPlanets.has(planetId)) return false;
    this.seenPlanets.add(planetId);
    this.set('planets', this.seenPlanets.size);
    return true;
  }

  onEnterSettlement(nodeId) {
    if (nodeId == null || this.seenSettlements.has(nodeId)) return false;
    this.seenSettlements.add(nodeId);
    this.set('settlements', this.seenSettlements.size);
    return true;
  }

  /** A job handed in. `nodeId` is the settlement it was given in. */
  onQuestDone(quest, nodeId = null) {
    this.bump('quests', 1);
    if (quest?.kind === 'clear') this.bump('dungeons', 1);
    if (nodeId != null) this.addReputation(nodeId, this.data.reputation?.perJob ?? 12);
  }

  onKill(defId) {
    this.bump('kills', 1);
    if (defId) this.bestiary[defId] = (this.bestiary[defId] || 0) + 1;
    // killing the thing that killed you settles it
    if (this.nemesis && defId === this.nemesis.defId) {
      this.defeatedNemeses.push({ ...this.nemesis, killedAt: Date.now() });
      this.set('nemesis', this.defeatedNemeses.length);
      this.nemesis = null;
      return 'nemesis';
    }
    return null;
  }

  onLoot(item) {
    if (!item) return;
    if (item.setId || item.isUnique || item.rarity === 'legendary') this.set('legendary', 1);
  }

  /**
   * You died. Whatever did it becomes, or stays, your nemesis — and gets harder each time.
   * `name` should come from the game's namer.
   */
  onDeath({ defId, name = null, title = null, level = 1 } = {}) {
    if (!defId) return null;
    if (this.nemesis && this.nemesis.defId === defId) {
      this.nemesis.defeats++;
      this.nemesis.level = Math.max(this.nemesis.level, level) + 1;
      return this.nemesis;
    }
    const titles = this.data.nemesisTitles || ['the Unkilled'];
    this.nemesis = {
      defId,
      name: name || 'Something',
      title: title || titles[(this.defeatedNemeses.length + defId.length) % titles.length],
      defeats: 1,
      level: level + 1,
    };
    return this.nemesis;
  }

  // ---------------------------------------------------------------- reputation

  addReputation(nodeId, amount) {
    const max = this.data.reputation?.max ?? 100;
    this.reputation[nodeId] = Math.max(0, Math.min(max, (this.reputation[nodeId] || 0) + amount));
    return this.reputation[nodeId];
  }

  reputationAt(nodeId) { return this.reputation[nodeId] || 0; }

  /** What this settlement charges you, as a multiplier. */
  priceMultiplier(nodeId) {
    const cfg = this.data.reputation || {};
    return this.reputationAt(nodeId) >= (cfg.discountAt ?? 40) ? 1 - (cfg.discount ?? 0.15) : 1;
  }

  /** "known", "welcome", "trusted" — for a greeting. */
  standing(nodeId) {
    const r = this.reputationAt(nodeId);
    if (r >= 70) return 'trusted';
    if (r >= 40) return 'welcome';
    if (r >= 15) return 'known';
    return 'a stranger';
  }

  // ---------------------------------------------------------------- objectives

  bump(kind, by = 1) {
    for (const o of this.objectives) if (o.kind === kind) this.progress[o.id] = (this.progress[o.id] || 0) + by;
  }

  set(kind, value) {
    for (const o of this.objectives) if (o.kind === kind) this.progress[o.id] = Math.max(this.progress[o.id] || 0, value);
  }

  isDone(o) { return (this.progress[o.id] || 0) >= o.target; }

  get complete() { return this.objectives.length > 0 && this.objectives.every(o => this.isDone(o)); }

  /** Everything a journal wants to show. */
  list() {
    return this.objectives.map(o => ({
      ...o,
      progress: Math.min(this.progress[o.id] || 0, o.target),
      done: this.isDone(o),
      text: o.kind === 'distance'
        ? `${Math.round(Math.min(this.progress[o.id] || 0, o.target) / 1000)} / ${Math.round(o.target / 1000)} km`
        : `${Math.min(this.progress[o.id] || 0, o.target)} / ${o.target}`,
    }));
  }

  /** How far through the whole survey you are, 0..1. */
  get share() {
    if (!this.objectives.length) return 0;
    const each = this.objectives.map(o => Math.min(1, (this.progress[o.id] || 0) / o.target));
    return each.reduce((a, b) => a + b, 0) / each.length;
  }

  // ---------------------------------------------------------------- saving

  toJSON() {
    return {
      progress: this.progress,
      planets: [...this.seenPlanets],
      settlements: [...this.seenSettlements],
      reputation: this.reputation,
      nemesis: this.nemesis,
      defeatedNemeses: this.defeatedNemeses,
      bestiary: this.bestiary,
    };
  }

  load(state = {}) {
    this.progress = { ...this.progress, ...(state.progress || {}) };
    this.seenPlanets = new Set(state.planets || []);
    this.seenSettlements = new Set(state.settlements || []);
    this.reputation = state.reputation || {};
    this.nemesis = state.nemesis || null;
    this.defeatedNemeses = state.defeatedNemeses || [];
    this.bestiary = state.bestiary || {};
    return this;
  }
}

export { KINDS as CAMPAIGN_KINDS };
