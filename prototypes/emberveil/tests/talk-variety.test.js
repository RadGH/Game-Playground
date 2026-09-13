// Combat speech routing: enemy families and hero roles pick different lines out of the same pools,
// nothing repeats inside one fight, and a named enemy's opener matches the history the game remembers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Lingo } from '../../../lingo/js/lingo.js';
import { Talk, enemyKind, heroRole, ENEMY_KINDS } from '../js/talk.js';

const lingoData = f => JSON.parse(readFileSync(new URL('../../../lingo/data/' + f, import.meta.url)));
const lexicon = lingoData('lexicon.json'), grammar = lingoData('grammar.json'), traits = lingoData('traits.json');
const pack = lingoData('packs/emberveil.json');

// The game object Talk actually leans on: zone(), classDef(), day, party, namedSlain.
function stubGame({ day = 4, namedSlain = [], party = [] } = {}) {
  return {
    zoneId: 'border_roads', day, namedSlain, party,
    zone: () => ({ name: 'The Border Roads', act: 1 }),
    classDef: id => ({ warrior: { role: 'Frontline Tank' }, cleric: { role: 'Primary Healer' }, pyromancer: { role: 'Fire Specialist' }, rogue: { role: 'Burst Assassin' }, ranger: { role: 'Precision Ranged' } }[id] || { role: '' }),
  };
}
function mk(seed = 5, game = stubGame()) {
  const lingo = new Lingo({ lexicon, grammar, traits, seed });
  for (const e of pack.entries) lingo.lexicon.add(e);
  lingo.invalidatePronunciations();
  return { lingo, talk: new Talk({ lingo, game }) };
}
const hero = (id, cls) => ({ id, name: id, short: id, class: cls, speech: { traits: [] } });
const foe = (id, templateId, extra = {}) => ({ id, name: templateId.replace(/_/g, ' '), templateId, ...extra });

test('enemy templates land in the right family and hero classes in the right role', () => {
  assert.equal(enemyKind('goblin_warlord'), 'goblin');
  assert.equal(enemyKind('bandit_captain'), 'bandit');      // "captain" must not read as a knight
  assert.equal(enemyKind('veil_cultist'), 'cultist');
  assert.equal(enemyKind('dragon_cultist'), 'cultist');     // cultist wins over dragon
  assert.equal(enemyKind('ash_wraith'), 'undead');
  assert.equal(enemyKind('demon_brute'), 'demon');
  assert.equal(enemyKind('star_horror'), 'void');
  assert.equal(enemyKind('void_prophet'), 'cultist'); // a prophet preaches, whatever it preaches about
  assert.equal(enemyKind('storm_dragon'), 'dragon');
  assert.equal(enemyKind('abyssal_knight'), 'knight');
  assert.equal(heroRole('Frontline Tank'), 'tank');
  assert.equal(heroRole('Primary Healer'), 'healer');
  assert.equal(heroRole('Chain Lightning Mage'), 'caster');
  assert.equal(heroRole('Burst Assassin'), 'rogue');
  assert.equal(heroRole('Precision Ranged'), 'ranger');
});

test('each enemy family gets 12+ of its own openers and never borrows another family\'s', () => {
  const kindTags = new Set(ENEMY_KINDS);
  for (const [kind, templateId] of [['goblin', 'goblin_warrior'], ['bandit', 'bandit'], ['cultist', 'veil_cultist'], ['undead', 'ash_wraith'], ['demon', 'imp'], ['void', 'reality_shard'], ['dragon', 'dragon_whelp'], ['knight', 'hell_knight']]) {
    const { talk } = mk(3);
    const h = hero('h1', 'warrior');
    const texts = new Set(); let own = 0;
    for (let i = 0; i < 60; i++) {
      const e = foe('e' + i, templateId);
      const out = talk.enemyOpener(e, h, { enc: 'fight' + i });
      assert.ok(out?.text, `${kind}: no opener`);
      texts.add(out.text);
      const tags = out.tags.filter(t => kindTags.has(t));
      assert.deepEqual(tags.filter(t => t !== kind), [], `${kind} said a ${tags} line: ${out.text}`);
      if (tags.includes(kind)) own++;
    }
    assert.ok(texts.size >= 12, `${kind}: only ${texts.size} distinct openers`);
    assert.ok(own >= 10, `${kind}: only ${own}/60 lines were family-flavoured`);
  }
});

test('hero roles colour their own lines and never each other\'s', () => {
  const roles = ['tank', 'healer', 'caster', 'rogue', 'ranger'];
  for (const [cls, role] of [['warrior', 'tank'], ['cleric', 'healer'], ['pyromancer', 'caster'], ['rogue', 'rogue'], ['ranger', 'ranger']]) {
    const { talk } = mk(6);
    const h = hero('h_' + cls, cls), other = hero('other', 'warrior');
    let own = 0;
    for (let i = 0; i < 40; i++) {
      const out = talk.line(h, 'combat_bark', { to: other });
      const tags = out.tags.filter(t => roles.includes(t));
      assert.deepEqual(tags.filter(t => t !== role), [], `${cls} used a ${tags} line: ${out.text}`);
      if (tags.length) own++;
    }
    assert.ok(own >= 3, `${cls}: ${own}/40 role-flavoured lines`);
  }
});

test('no two enemies in the same fight open with the same line', () => {
  const { talk } = mk(12);
  const h = hero('h1', 'warrior');
  const enc = { id: 'enc1' };
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const out = talk.enemyOpener(foe('e' + i, 'bandit'), h, { enc });
    assert.ok(!seen.has(out.text), 'two enemies said: ' + out.text);
    seen.add(out.text);
  }
  // a new fight clears the per-fight bans; the session history keeps it varied anyway
  talk.beginFight({ id: 'enc2' });
  assert.equal(talk.fightLines.size, 0);
});

test('named enemies open on the right history: first meeting, rematch, revenge, "you beat me once"', () => {
  const party = [hero('h1', 'warrior'), hero('h2', 'cleric')];
  const L = { id: 'n1', name: 'Vekkash the Ember-Tongued', short: 'Vekkash', templateId: 'goblin_shaman', staticId: 'vekkash' };

  const first = mk(2, stubGame({ party }));
  const o1 = first.talk.namedOpener({ ...L }, party[0], { enc: 'f1', rng: () => 0.9 });
  assert.equal(o1.intent, 'named_first');

  const re = mk(2, stubGame({ party }));
  const o2 = re.talk.namedOpener({ ...L }, party[0], { enc: 'f2', nemesis: { defeats: 1, sinceDay: 1 }, rng: () => 0.9 });
  assert.equal(o2.intent, 'named_rematch');

  const av = mk(2, stubGame({ party }));
  const o3 = av.talk.namedOpener({ ...L }, party[0], { enc: 'f3', nemesis: { defeats: 2, sinceDay: 1 }, rng: () => 0.1 });
  assert.equal(o3.intent, 'named_avenge');

  const bt = mk(2, stubGame({ party, namedSlain: ['vekkash'] }));
  const o4 = bt.talk.namedOpener({ ...L }, party[0], { enc: 'f4', rng: () => 0.9 });
  assert.equal(o4.intent, 'named_beaten');

  // every situation has enough phrasings that a long run of nemesis fights never repeats early
  for (const [nemesis, want] of [[null, 'named_first'], [{ defeats: 1, sinceDay: 1 }, 'named_rematch']]) {
    const { talk } = mk(7, stubGame({ party }));
    const texts = new Set();
    for (let i = 0; i < 12; i++) {
      const out = talk.namedOpener({ ...L }, party[0], { enc: 'f' + i, nemesis, rng: () => 0.9 });
      assert.equal(out.intent, want);
      assert.ok(!texts.has(out.text), `${want} repeated within 12 fights: ${out.text}`);
      texts.add(out.text);
    }
  }
});

test('beasts narrate instead of talking, and camp raids / ambushes read differently every time', () => {
  const { talk } = mk(8);
  const wolf = foe('w1', 'corrupted_wolf');
  const snarls = new Set(), named = new Set(), nights = new Set(), ambushes = new Set();
  for (let i = 0; i < 12; i++) {
    snarls.add(talk.beastOpener(wolf, { enc: 'b' + i }).text);
    named.add(talk.beastOpener({ ...wolf, name: 'Ashfang' }, { enc: 'b' + i, named: true }).text);
    nights.add(talk.raidOpener({ enemies: [wolf, wolf] }, { night: true }).text);
    ambushes.add(talk.raidOpener({ enemies: [wolf] }).text);
  }
  for (const [what, set] of [['snarl', snarls], ['named beast', named], ['night raid', nights], ['ambush', ambushes]])
    assert.equal(set.size, 12, `${what}: only ${set.size} of 12 were distinct`);
  assert.ok([...named].every(t => /Ashfang/.test(t)), 'a named beast should be named in the narration');
});

test('a 30-fight run never opens with the same enemy line twice in a row and stays wide', () => {
  const { talk } = mk(21);
  const h = hero('h1', 'warrior');
  const templates = ['bandit', 'goblin_scout', 'veil_cultist', 'ash_wraith', 'imp'];
  const lines = []; const window = [];
  for (let i = 0; i < 30; i++) {
    const out = talk.enemyOpener(foe('e' + i, templates[i % templates.length]), h, { enc: 'fight' + i });
    assert.ok(!window.includes(out.text), 'repeat inside the anti-repeat window: ' + out.text);
    window.push(out.text); if (window.length > 12) window.shift();
    lines.push(out.text);
  }
  assert.ok(new Set(lines).size >= 26, 'only ' + new Set(lines).size + ' distinct openers in 30 fights');
});
