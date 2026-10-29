// Daily Trials: a new challenge every day, GENERATED. PURE — same date, same trial, everywhere.
//
// A trial is built in the same shape as a hand-made level (data/levels.json), so the session,
// objectives, stars and results screen treat it like any other. The generator picks:
//   1. a THREAT archetype (swarm, molten tide, wildfire, wolf season, wyrm, siege night),
//   2. a land (recipe + seed) that suits it, and the side the trouble comes from (mirrored),
//   3. numbers scaled by a difficulty that rises through the week (Mon easy … Sun hard),
//   4. a loadout: the tools the archetype needs + a few the player owns (so unlocks matter),
//   5. goals and three stars from the archetype's templates.

import { makeRng, seedOf } from '../sim/rng.js';

const LANDS = { swarm: ['greenvale', 'isles', 'pinewood'], lava: ['greenvale', 'pinewood'], fire: ['greenvale', 'dunesea'], flock: ['greenvale', 'isles'], wyrm: ['greenvale', 'pinewood', 'fenmoor'], siege: ['greenvale', 'fenmoor', 'pinewood'], defenders: ['greenvale', 'pinewood', 'isles'] };
const NAMES = {
  swarm: ['The Pink Tide', 'Crawling Hills', 'A Thousand Legs', 'Swarm Season'],
  lava: ['Rivers of Fire', 'The Mountain Wakes', 'Cinder Spring', 'Red Flood'],
  fire: ['Tinder Summer', 'The Wind Turns', 'Smoke on the Hill', 'Burning Fields'],
  flock: ['Lambing Time', 'Wolf Winter', 'The Long Grazing', 'Shepherd\'s Luck'],
  wyrm: ['Shadow at Noon', 'Scales over the Roofs', 'The Hungry Sky', 'Wings of Ash'],
  siege: ['Moonless', 'Lanterns Out', 'Night of Knives', 'The Dark Road'],
  defenders: ['Call to Arms', 'Bows at Dawn', 'The Shield Line', 'Hold the Hill'],
};
const ICONS = { swarm: 'trial-swarm', lava: 'trial-lava', fire: 'trial-fire', flock: 'trial-flock', wyrm: 'trial-wyrm', siege: 'trial-siege', defenders: 'lvl-2-1' };

export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Build the trial for a day. owned = the player's Grimoire page ids (some get added to the loadout). */
export function makeTrial(day = dayKey(), owned = []) {
  const rng = makeRng(seedOf('kindlewild-trial-' + day));
  const kinds = Object.keys(LANDS);
  const kind = kinds[(rng() * kinds.length) | 0];
  const dow = new Date(day + 'T12:00:00').getDay();          // 0 Sunday
  const diff = 0.75 + ((dow + 6) % 7) * 0.09;                  // Mon 0.75 … Sun 1.29
  const W = 160, H = 240;
  const flip = rng() < 0.5;
  const fx = (x) => (flip ? W - 1 - x : x);
  const n = (v) => Math.max(1, Math.round(v * diff));
  const recipe = LANDS[kind][(rng() * LANDS[kind].length) | 0];
  const seed = (rng() * 1e6) | 0;
  const L = {
    id: 'trial-' + day, trial: true, day, kind,
    name: NAMES[kind][(rng() * NAMES[kind].length) | 0], icon: ICONS[kind],
    map: { W, H, seed, recipe, override: { rivers: kind === 'fire' ? 0 : 1, villages: 0, glades: 0, sea: kind === 'fire' ? 0 : 0.15 }, clock: 0.45, freezeTime: true, ops: [] },
    villages: [], herds: [], spawns: [], events: [], goals: [], stars: [], loadout: ['tool:inspect'],
    mana: { start: 80, max: 140, regen: 3 },
  };
  const vx = fx(80 + ((rng() * 30) | 0) - 15), vy = 196;
  const village = (extra = {}) => ({ at: [vx, vy], people: 7, prebuilt: ['cottage', 'cottage', 'cottage', 'farm', 'well'], ...extra });
  L.map.ops.push({ op: 'flatten', at: [vx, vy], r: 26 }, { op: 'clear', at: [vx, vy], r: 20 });

  switch (kind) {
    case 'swarm': {
      L.intro = ['Something is boiling up out of the hills.', 'Meteors, fire and lightning — stop the swarms before they reach the village.'];
      L.villages.push(village());
      const a = n(50), b = n(12), c = n(30);
      L.spawns.push({ species: 'mite', count: a, at: [fx(60 + ((rng() * 40) | 0)), 40], spread: 12, goal: 'village' });
      L.spawns.push({ species: rng() < 0.5 ? 'goblin' : 'imp', count: b, at: [fx(150), 80], spread: 6, goal: 'village', time: 10, announce: 'More from the east!' });
      L.spawns.push({ species: 'mite', count: c, at: [fx(10), 120], spread: 8, goal: 'village', time: 24, announce: 'And from the west woods!' });
      L.mana = { start: 130, max: 140, regen: 3.6 };
      L.loadout.push('spell:meteor', 'spell:fireball', 'spell:lightning');
      L.goals.push({ type: 'kill', team: 'monster', count: Math.round((a + b + c) * 0.9), text: 'Wipe out the swarms' }, { type: 'people', min: 4, text: 'Keep 4 villagers alive', failText: 'The swarm overran the village' });
      L.stars.push({ type: 'win', text: 'Stop the swarms' }, { type: 'killedBy', team: 'monster', by: ['meteor'], count: Math.round(a * 0.8), text: `Catch ${Math.round(a * 0.8)} in meteors` }, { type: 'peopleLostMax', n: 0, text: 'Nobody lost' });
      break;
    }
    case 'lava': {
      L.intro = ['The mountain above the village has cracked open.', 'Turn the lava aside until it sleeps again.'];
      L.map.override = { ...L.map.override, sea: 0, rivers: 0, temp: 0.4, vents: 0 };
      L.map.ops.unshift({ op: 'slope', dir: [0, 1], h: 120, base: 100, keep: 0.12 });
      const ventX = fx(60 + ((rng() * 40) | 0));
      L.map.ops.push({ op: 'ground', at: [ventX, 14], r: 16, mat: 'basalt', clearCells: true }, { op: 'vent', at: [ventX, 12] }, { op: 'paint', at: [ventX, 18], r: 5, mat: 'lava', amount: 60 });
      L.villages.push(village());
      L.events.push({ time: Math.round(40 / diff), op: { op: 'vent', at: [fx(ventX < 80 ? 120 : 40), 22] }, say: 'A second vent opens!' });
      L.mana = { start: 90, max: 160, regen: 3.4 };
      L.loadout.push('spell:earth', 'material:wall_stone', 'material:water', 'spell:rain');
      L.goals.push({ type: 'survive', secs: Math.round(90 * diff), text: 'Hold until the mountain sleeps' }, { type: 'contain', material: 'lava', zone: [vx, vy, 22], text: 'Keep lava out of the village', failText: 'Lava reached the village' });
      L.stars.push({ type: 'win', text: 'Save the village' }, { type: 'housesLostMax', n: 0, text: 'No house burned' }, { type: 'manaUsedMax', n: 220, text: 'Spend under 220 mana' });
      break;
    }
    case 'fire': {
      L.intro = ['A dry summer and a strong wind.', 'Fires are coming down from the north. Keep the cottages standing.'];
      L.map.override = { ...L.map.override, wet: -0.1, temp: 0.35 };
      L.map.wind = [flip ? -0.2 : 0.2, 1, 1.5 + diff * 0.2]; L.map.windLocked = true;
      L.map.ops.push({ op: 'drain' }, { op: 'dry', p: 0.16 }, { op: 'paint', at: [80, 70], r: 40, mat: 'tree', density: 0.35 }, { op: 'paint', at: [fx(140), 200], r: 8, mat: 'water', amount: 40 });
      L.villages.push(village({ people: 8, prebuilt: ['cottage', 'cottage', 'cottage', 'cottage', 'cottage', 'farm', 'well'] }));
      L.events.push({ time: 3, ignite: [[fx(50), 30, 4], [fx(110), 40, 4]], say: 'Smoke in the north!' }, { time: Math.round(50 / diff), ignite: [[fx(15), 110, 3]], say: 'Sparks have jumped west!' });
      L.mana = { start: 100, max: 150, regen: 3.5 };
      L.loadout.push('spell:rain', 'spell:earth', 'material:dirt', 'material:water', 'tool:erase');
      L.goals.push({ type: 'survive', secs: Math.round(95 * diff), text: 'Last until the fire burns out' }, { type: 'protect', what: 'houses', min: 3, text: 'Keep 3 cottages standing', failText: 'Too many cottages burned' });
      L.stars.push({ type: 'win', text: 'Survive the fire' }, { type: 'housesLostMax', n: 0, text: 'Every cottage standing' }, { type: 'peopleLostMax', n: 0, text: 'Nobody lost' });
      break;
    }
    case 'flock': {
      const target = Math.round(22 + 7 * diff);
      L.intro = ['A thin flock and a hungry season.', `Grow it to ${target} sheep before the year turns.`];
      L.map.ops.push({ op: 'flatten', at: [80, 120], r: 40 }, { op: 'clear', at: [80, 120], r: 26 }, { op: 'ground', at: [80, 120], r: 30, mat: 'meadow' });
      L.villages.push({ at: [fx(34), 206], people: 3, prebuilt: ['cottage', 'farm'] });
      L.spawns.push({ species: 'sheep', count: 8, at: [80, 120], spread: 6 });
      [25, 70, 120, 170].forEach((t, k) => L.spawns.push({ species: 'wolf', count: n(2 + k), at: ['north', 'east', 'west', 'north'][k], time: t, hunger: 0.6, goal: [80, 120], announce: k === 0 ? 'Wolves on the ridge!' : undefined }));
      L.mana = { start: 60, max: 120, regen: 2.5 };
      L.loadout.push('spell:bless', 'spell:heal', 'spell:lightning', 'material:wall_wood', 'spell:growth', 'tool:grab');
      L.timeLimit = 240; L.failText = 'The season ended before the flock was big enough';
      L.goals.push({ type: 'grow', species: 'sheep', count: target, text: `Grow the flock to ${target}` });
      L.stars.push({ type: 'win', text: `${target} sheep` }, { type: 'timeMax', secs: 170, text: 'Before the last pack' }, { type: 'killedBy', species: 'wolf', by: ['lightning'], count: 3, text: 'Strike down 3 wolves' });
      break;
    }
    case 'wyrm': {
      L.intro = ['Something huge is circling the village.', 'Bring it down, or hurt it enough that it leaves.'];
      L.villages.push(village({ people: 8, wardens: 3, prebuilt: ['cottage', 'cottage', 'cottage', 'cottage', 'stonehouse', 'farm', 'well', 'tower'] }));
      L.spawns.push({ species: 'dragon', count: 1, at: [fx(88), 10], spread: 0, goal: 'village', time: 4, hp: diff, announce: 'A shadow crosses the sun…' });
      if (diff > 1.05) L.spawns.push({ species: 'wyrmling', count: 2, at: 'north', time: 30, goal: 'village', announce: 'It brought its young!' });
      L.mana = { start: 150, max: 180, regen: 5 };
      L.loadout.push('spell:lightning', 'spell:missiles', 'spell:barrier', 'spell:frost', 'spell:rain', 'creature:archer', 'creature:warden');
      L.goals.push({ type: 'dragon', text: 'Drive off or bring down the dragon' }, { type: 'protect', what: 'houses', min: 3, text: 'Keep 3 houses standing', failText: 'The village burned' });
      L.stars.push({ type: 'win', text: 'Clear skies' }, { type: 'housesLostMax', n: 1, text: 'Lose one house at most' }, { type: 'killedBy', species: 'dragon', count: 1, text: 'Bring it down for good' });
      break;
    }
    case 'defenders': {
      L.intro = ['A raiding band is on its way, and there are no walls.', 'Call archers, knights and mages to the village and let them fight.'];
      L.villages.push(village({ people: 8 }));
      const waves = [['goblin', 10, 'north', 8], ['torchgob', 4, 'west', 30], ['goblin', 12, 'east', 50], ['troll', 1, 'north', 75], ['imp', 6, 'north', 95], ['goblin', 14, 'north', 110]];
      for (const [sp, c, at, t] of waves) L.spawns.push({ species: sp, count: Math.max(1, Math.round(c * diff)), at, time: t, goal: 'village' });
      L.mana = { start: 150, max: 190, regen: 4.6 };
      L.loadout.push('creature:archer', 'creature:knight', 'creature:mage', 'spell:barrier', 'spell:rain', 'spell:heal');
      L.goals.push({ type: 'survive', secs: 140, text: 'Hold until the raid breaks', short: 'Hold' }, { type: 'protect', what: 'houses', min: 2, text: 'Keep 2 cottages standing', failText: 'The raiders burned the village', short: 'Houses' });
      L.stars.push({ type: 'win', text: 'The village stands' }, { type: 'housesLostMax', n: 0, text: 'No cottage lost' }, { type: 'killedBy', team: 'monster', by: ['village'], count: 25, text: 'Your defenders fell 25' });
      break;
    }
    default: { // siege
      L.intro = ['The sun is going down, and the woods are full of eyes.', 'Keep the people alive until dawn.'];
      L.map.clock = 0.8; L.map.freezeTime = false; L.map.dayLength = 10200;
      L.villages.push(village({ people: 10, wardens: 3, mages: 1, prebuilt: ['cottage', 'cottage', 'cottage', 'cottage', 'cottage', 'farm', 'farm', 'well', 'lamppost', 'lamppost'] }));
      const waves = [['goblin', 10, 'west', 8], ['mite', 40, 'north', 30], ['torchgob', 5, 'east', 50], ['troll', 1, 'south', 70], ['goblin', 12, 'north', 95], ['skeleton', 8, 'east', 115]];
      for (const [sp, c, at, t] of waves) L.spawns.push({ species: sp, count: Math.max(1, Math.round(c * (diff + 0.25))), at, time: t, goal: 'village' });
      L.mana = { start: 100, max: 200, regen: 4.5 };
      L.loadout.push('spell:fireball', 'spell:lightning', 'spell:meteor', 'spell:frost', 'spell:rain', 'spell:earth', 'spell:heal', 'material:wall_stone', 'creature:warden');
      L.goals.push({ type: 'survive', secs: 150, text: 'Survive until dawn' }, { type: 'people', min: 8, text: 'Keep 8 people alive', failText: 'Too many lost in the night' });
      L.stars.push({ type: 'win', text: 'See the dawn' }, { type: 'peopleLostMax', n: 2, text: 'Lose 2 people at most' }, { type: 'housesLostMax', n: 0, text: 'Every house standing' });
    }
  }
  // a couple of the player's own spells join in, so what you have unlocked matters here
  const extra = owned.filter(p => p.startsWith('spell:') && !L.loadout.includes(p));
  for (let k = 0; k < 2 && extra.length; k++) L.loadout.push(extra.splice((rng() * extra.length) | 0, 1)[0]);
  L.tip = 'A new trial every day — and it gets harder toward the end of the week.';
  L.difficulty = diff;
  return L;
}
