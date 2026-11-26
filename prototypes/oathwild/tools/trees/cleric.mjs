// Cleric — holy fighter-priest (owner 2026-11-26 rebuild: "Fewer defensive abilities. Fewer heals. Focus on combat").
// Rules: tools/trees/_dsl.mjs. One heal, one revive; everything else hits: a lance of light, pillars from the sky,
// a holy nova that flattens what is round you, burning ground.
import { spell, rank, prof, mastery, passive, mod, capstone, ranks } from './_dsl.mjs';

export default {
  role: 'Holy fighter-priest',
  blurb: 'A mace and the light: lances of sun, pillars that slam down from the sky, a holy blast that flattens what is round you. One heal, one revive.',
  power: 1.45,   // balance factor on every damage number (lead pass 2026-11-26, tools/sim-fights.mjs)
  starter: ['iron_mace', 'buckler', 'medium_chest', 'light_legs'],
  spells: {
    sunlance: {
      name: 'Sunlance', shape: 'beam', element: 'holy', mult: 1.6, range: 22, width: 2.2, cooldown: 3, mp: 6,
      ranks: ranks({ width: 1 }, { statuses: [{ id: 'weaken', seconds: 4 }] }),
    },
    smite: {
      // a pillar of light that slams down on a spot
      name: 'Smite', shape: 'ground', element: 'holy', mult: 2.2, range: 26, radius: 3.5, delay: 0.35, cooldown: 7, mp: 9,
      knock: { push: 2, down: 1.5 },
      ranks: ranks({ radius: 1 }, { knock: { push: 2, down: 2.5 } }),
    },
    holy_nova: {
      name: 'Holy Nova', shape: 'around', element: 'holy', mult: 1.6, radius: 7, cooldown: 10, mp: 12,
      knock: { push: 3, down: 1 },
      ranks: ranks({ radius: 1.5 }, { knock: { push: 4, down: 1.8 } }),
    },
    heal: {
      name: 'Heal', shape: 'bolt', element: 'holy', target: 'ally', healPower: 1.8, range: 30, cooldown: 6, mp: 12,
      ranks: ranks(),
    },
    revive: {
      name: 'Revive', shape: 'self', element: 'holy', target: 'ally', range: 8, revive: { share: 0.4 }, cooldown: 45, mp: 25,
    },
    holy_ground: {
      name: 'Holy Ground', shape: 'ground', element: 'holy', range: 24, radius: 6, cooldown: 16, mp: 18,
      place: { kind: 'zone', seconds: 8, radius: 6, every: 1, strike: { mult: 0.55, targets: 10 } },
      ranks: ranks({ radius: 1.5 }, { statuses: [{ id: 'weaken', seconds: 2 }] }),
    },
    divine_hammer: {
      // a giant hammer of light thrown down a line, knocking everything in it flat
      name: 'Divine Hammer', shape: 'beam', element: 'holy', mult: 2.6, range: 18, width: 4, cooldown: 14, mp: 16,
      knock: { push: 4, down: 2 },
      ranks: ranks({ range: 6 }, { width: 2 }),
    },
    judgement: {
      name: 'Judgement', shape: 'ground', element: 'holy', mult: 4.2, range: 30, radius: 9, delay: 0.9, cooldown: 28, mp: 30,
      knock: { push: 6, down: 3 },
    },
    wrath: {
      name: 'Wrath of Light', shape: 'self', element: 'holy', cooldown: 60, mp: 24, allies: 15,
      selfBuff: { name: 'Wrath of Light', seconds: 14, damage: 0.45, haste: 0.25 },
    },
  },
  nodes: [
    // level 1
    spell('sunlance', 1, { free: true }), prof('mace', 1, { free: true }), prof('shield', 1, { free: true }),
    prof('leather', 1, { free: true }), prof('mail', 1, { free: true }),
    spell('heal', 1), prof('staff', 1), prof('scepter', 1),
    // level 2
    spell('smite', 2), spell('revive', 2), mastery('mace', 2), prof('twohand', 2),
    // level 3
    spell('holy_nova', 3), passive('holy_power', 'Holy Power', 3, { holyPct: 25 }), mastery('scepter', 3), mastery('staff', 3),
    // level 4
    rank('sunlance', 2, 4), rank('smite', 2, 4), spell('holy_ground', 4), prof('plate', 4, { needs: ['prof_mail'] }),
    // level 5
    spell('divine_hammer', 5), rank('holy_nova', 2, 5), rank('heal', 2, 5), passive('zeal', 'Zeal', 5, { meleePct: 25, hastePct: 20 }),
    // level 6
    rank('holy_ground', 2, 6), mod('blinding_light', 'Blinding Light', 'sunlance', 6, { add: { statuses: [{ id: 'stagger', seconds: 1 }] } }),
    passive('faith', 'Faith', 6, { spellPct: 25 }), passive('devotion', 'Devotion', 6, { maxMpPct: 40, mpRegen: 2 }),
    // level 7
    rank('sunlance', 3, 7), rank('smite', 3, 7), rank('divine_hammer', 2, 7), passive('righteous', 'Righteous Strikes', 7, { critChance: 6 }),
    // level 8
    rank('holy_nova', 3, 8), mod('twin_smite', 'Double Smite', 'smite', 8, { add: { repeats: 2, repeatEvery: 0.5 } }),
    passive('quick_prayer', 'Quick Prayers', 8, { cooldownPct: 25 }),
    // level 9
    rank('holy_ground', 3, 9), rank('divine_hammer', 3, 9), rank('heal', 3, 9), passive('light_unbound', 'Light Unbound', 9, { critDamage: 60 }),
    // level 10: pick one
    capstone(spell('judgement', 10)), capstone(spell('wrath', 10)),
  ],
};
