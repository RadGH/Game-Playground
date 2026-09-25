// The title screen: roll a galaxy seed, survey the starting system, pick a world to land on.
//
// The planets come from the universe project (galaxy → star → system), adapted to the engine's planet
// contract by js/planets.js. The local map is still cut with Frontier Foundry's own world generator,
// so a save only has to remember the planet record and the galaxy seed to come back identical.

import { $, el, fill, num, clamp } from './dom.js';
import { rawIcon } from './icons.js';
import { generateGalaxy } from '../../../../universe/js/galaxy.js';
import { generateSystem } from '../../../../universe/js/system.js';
import { universePlanets } from '../planets.js';

const ARCH_LOOK = {
  temperate: ['#3f7a45', '#6f9f52', '#1d5a86'], arid: ['#8a6030', '#dac68d', '#a5714a'],
  frozen: ['#6f90a8', '#e2ecf2', '#8d9a8f'], volcanic: ['#3a1a10', '#8a2a0a', '#ff7a2a'],
  toxic: ['#4a5a14', '#8a8a2e', '#4a3a56'], verdant: ['#123a28', '#1e6b3a', '#5aa86a'],
  barren: ['#3a3733', '#6a6259', '#8e867a'], shattered: ['#2a2050', '#6a58a8', '#c0b0f0'],
  oceanic: ['#0a3050', '#1b6a94', '#7fc0d8'], gas_shrouded: ['#5a4a38', '#8a6a48', '#c8a878'],
};

const DIFFICULTY_WORD = t => (t <= 1 ? 'gentle' : t === 2 ? 'testing' : t === 3 ? 'hard' : t === 4 ? 'harsh' : 'brutal');

export class Title {
  constructor({ data, sound, onStart, onContinue, onSettings }) {
    this.data = data;
    this.sound = sound;
    this.onStart = onStart;
    this.onContinue = onContinue;
    this.onSettings = onSettings;
    this.candidates = [];
    this.provider = null;
    this.selected = null;
    this.galaxySeed = 7;
    this.starIndex = 0;
    this._wire();
  }

  _wire() {
    $('btn-roll').addEventListener('click', () => {
      $('seed').value = String(1 + Math.floor(Math.random() * 99999));
      this.sound?.ui('click');
      this.survey();
    });
    $('btn-scan-system').addEventListener('click', () => { this.sound?.ui('open'); this.survey(); });
    $('btn-quick').addEventListener('click', () => this.quickStart());
    $('btn-settings').addEventListener('click', () => this.onSettings?.());
    $('seed').addEventListener('change', () => this.survey());
  }

  /**
   * Build the galaxy, walk out from one star until there are a few worlds a lander could reach, and
   * put them on the board sorted easiest first.
   */
  survey() {
    const seed = clamp(+$('seed').value || 7, 1, 999999);
    this.galaxySeed = seed;
    $('system-note').textContent = 'Surveying…';
    const galaxy = generateGalaxy({ seed, stars: 44 });
    // start from a star with a decent chance of rocky worlds, then take neighbours until we have four
    const order = [...galaxy.stars].sort((a, b) => (b.lum ?? 0) - (a.lum ?? 0));
    const systems = [];
    let list = [];
    for (const star of order) {
      if (systems.length >= 4 || list.length >= 5) break;
      const sys = generateSystem(star, { seed });
      if (!sys.planets.some(p => p.landable !== false && !p.giant)) continue;
      systems.push(sys);
      this.provider = universePlanets(systems, this.data.resources);
      list = this.provider.list();
    }
    this.starIndex = 0;
    this.candidates = list.slice(0, 6);
    $('system-name').textContent = systems.length
      ? `${systems[0].star?.name || systems[0].name || 'unnamed star'}${systems.length > 1 ? ` and ${systems.length - 1} neighbour${systems.length > 2 ? 's' : ''}` : ''}`
      : '';
    $('system-note').textContent = this.candidates.length
      ? `${this.candidates.length} worlds within reach. The lander only has fuel for one of them.`
      : 'Nothing landable near that seed — roll again.';
    this.selected = this.candidates[0]?.id || null;
    this.renderCandidates();
    return this.candidates;
  }

  renderCandidates() {
    const g = this.data;
    fill($('candidate-list'), this.candidates.map(p => {
      const b = el('button.cand' + (p.id === this.selected ? '.on' : ''));
      const look = ARCH_LOOK[p.archetype] || ARCH_LOOK.barren;
      b.append(el('i.globe', { style: { background: `radial-gradient(circle at 34% 30%, ${look[2]}, ${look[1]} 55%, ${look[0]} 100%)` } }));
      const mid = el('div');
      mid.append(el('b', { text: p.name }));
      mid.append(el('span.sub', { text: `${p.archetype.replace('_', '-')} · gravity ${p.gravity}g · a day is ${Math.round(p.dayLength / 60)} min` }));
      const tags = el('div.tags');
      for (const r of (p.rareElements || []).slice(0, 3)) tags.append(el('span.tagchip.rare', { text: g.resource[r]?.name || r }));
      for (const h of (p.hazards || []).slice(0, 3)) tags.append(el('span.tagchip.hazard', { text: h }));
      const notable = (p.resources || []).filter(r => g.resource[r] && !['iron_ore', 'copper_ore', 'stone', 'coal'].includes(r)).slice(0, 4);
      for (const r of notable) tags.append(el('span.tagchip', { text: g.resource[r].name }));
      mid.append(tags);
      b.append(mid);
      b.append(el('span.diff', { text: `tier ${p.tier}\n${DIFFICULTY_WORD(p.tier)}` }));
      b.dataset.tip = `${p.resources.length} common resources in the ground. Rare: ${(p.rareElements || []).map(r => g.resource[r]?.name || r).join(', ') || 'none'}. Hazards: ${(p.hazards || []).join(', ') || 'none'}.`;
      b.addEventListener('click', () => {
        if (this.selected === p.id) return this.land(p);
        this.selected = p.id;
        this.sound?.ui('click');
        this.renderCandidates();
      });
      return b;
    }));
    if (this.candidates.length) {
      const go = el('button.primary.wide', { text: 'Land on ' + (this.candidates.find(p => p.id === this.selected)?.name || 'this world') });
      go.addEventListener('click', () => this.land(this.candidates.find(p => p.id === this.selected)));
      $('candidate-list').append(go);
    }
  }

  /** The recommended temperate world, or the gentlest thing going. */
  quickStart() {
    if (!this.candidates.length) this.survey();
    const pick = this.candidates.find(p => p.archetype === 'temperate')
      || this.candidates.find(p => p.archetype === 'verdant')
      || this.candidates[0];
    if (!pick) return;
    this.land(pick);
  }

  land(planet) {
    if (!planet) return;
    this.sound?.ui('open');
    this.onStart?.({
      planet,
      planets: this.provider,
      seed: this.galaxySeed,
      difficulty: $('difficulty').value,
      galaxySeed: this.galaxySeed,
      starIndex: this.starIndex,
    });
  }

  /** Enable or explain the Continue button. */
  setSave(save) {
    const btn = $('btn-continue');
    btn.disabled = !save;
    $('continue-note').textContent = save ? 'Saved run: ' + save.summary : 'No saved run in this browser yet.';
    btn.onclick = () => { if (save) { this.sound?.ui('open'); this.onContinue?.(save); } };
  }
}
