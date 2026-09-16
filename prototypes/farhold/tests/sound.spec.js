// Farhold phase 7: sound and speech — the two things phase 1 deliberately left out.

import { test, expect } from '@playwright/test';

async function landWithAudio(page, query = '') {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7' + query);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  // a browser will not give a page an audio context until somebody has interacted with it
  await page.mouse.click(400, 400);
  await page.waitForTimeout(500);
  await page.evaluate(() => window.farhold.sound.start());
  return errors;
}

test('the Sound Lab comes up and the ambience follows the ground you are on', async ({ page }) => {
  const errors = await landWithAudio(page);
  const audio = await page.evaluate(() => {
    const f = window.farhold;
    const beds = {};
    for (const key of ['temperateForest', 'rainforest', 'marsh', 'mountains', 'snowyPeaks', 'desert', 'volcanic']) {
      beds[key] = f.sound.place(key, {});
    }
    const inTown = f.sound.place('grassland', { inTown: true });
    const storm = f.sound.place('grassland', { storm: 0.9 });
    return { stats: f.sound.stats(), beds, inTown, storm, hit: f.sound.combat('hit', { crit: true }), coin: f.sound.coin() };
  });
  expect(errors).toEqual([]);
  expect(audio.stats.ready).toBe(true);
  expect(audio.stats.failure).toBe(null);
  // a forest does not sound like a marsh, and a town does not sound like either
  expect(audio.beds.temperateForest).toBe('ambience.forest');
  expect(audio.beds.marsh).toBe('ambience.marsh');
  expect(audio.beds.mountains).toBe('ambience.mountain');
  expect(audio.inTown).toBe('ambience.town');
  expect(new Set(Object.values(audio.beds)).size).toBeGreaterThan(2);
  expect(audio.hit).toBe(true);
  expect(audio.coin).toBe(true);
});

test('sound can be switched off and back on', async ({ page }) => {
  await landWithAudio(page);
  const toggled = await page.evaluate(() => {
    const f = window.farhold;
    const off = f.sound.mute(true);
    const playedWhileMuted = f.sound.combat('hit');
    const on = f.sound.mute(false);
    const playedAfter = f.sound.combat('hit');
    return { off, playedWhileMuted, on, playedAfter };
  });
  expect(toggled.off).toBe(true);
  expect(toggled.playedWhileMuted).toBe(false);
  expect(toggled.on).toBe(false);
  expect(toggled.playedAfter).toBe(true);
});

test('the folk speak their own lines, not one fixed string each', async ({ page }) => {
  const errors = await landWithAudio(page);
  const talk = await page.evaluate(async () => {
    const f = window.farhold;
    const town = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(town.wx, town.wz);
    const t0 = Date.now();
    while (f.folk.stats().people === 0 && Date.now() - t0 < 25000) await new Promise(r => setTimeout(r, 200));
    const people = [...f.folk.live.values()].flat();
    for (const p of people) f.speech.attach(p);

    // many lines from one person, and one line from many people
    const npc = people[0];
    const many = [];
    for (let i = 0; i < 8; i++) many.push(f.speech.line(npc, 'greet', { listener: { name: 'Wren' } }));
    const across = people.slice(0, 5).map(p => f.speech.line(p, 'greet', { listener: { name: 'Wren' } }));

    return {
      ready: f.speech.stats(),
      roles: people.map(p => p.role),
      traits: people.slice(0, 4).map(p => p.speech?.traits?.join('/')),
      voices: people.slice(0, 4).map(p => !!p.voice && p.voice.engine),
      many, across,
      named: many.filter(t => t.includes('Wren')).length,
    };
  });
  expect(errors).toEqual([]);
  expect(talk.ready.lingo).toBe(true);
  // each role has its own personality, and each person their own voice
  expect(new Set(talk.traits).size).toBeGreaterThan(1);
  for (const v of talk.voices) expect(v).toBeTruthy();
  // the lines are generated, not one string repeated
  for (const line of [...talk.many, ...talk.across]) expect(line.length).toBeGreaterThan(3);
  expect(new Set(talk.many).size).toBeGreaterThan(2);
  // and they know who they are talking to
  expect(talk.named).toBeGreaterThan(0);
});

test('E speaks a generated line into the panel', async ({ page }) => {
  await landWithAudio(page);
  await page.evaluate(async () => {
    const f = window.farhold;
    const town = f.features.nearest('settlement', f.control.x, f.control.z);
    f.teleport(town.wx, town.wz);
    const t0 = Date.now();
    while (f.folk.stats().people === 0 && Date.now() - t0 < 25000) await new Promise(r => setTimeout(r, 200));
    const who = [...f.folk.live.values()].flat()[0];
    f.teleport(who.x + 1.2, who.z);
  });
  await page.waitForTimeout(250);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#talk')).toBeVisible();
  const said = await page.evaluate(() => ({
    greeting: document.querySelector('#talk .talk-say')?.textContent || '',
    role: window.farhold.talk.npc?.role,
    hasSpeaker: !!window.farhold.talk.npc?.speaker,
  }));
  expect(said.greeting.length).toBeGreaterThan(4);
  expect(said.hasSpeaker).toBe(true);
});

test('with sound turned off the game still runs', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('/prototypes/farhold/?auto=1&quality=low&seed=7&sound=off');
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  const off = await page.evaluate(() => {
    const f = window.farhold;
    return {
      sound: f.sound.stats(),
      speech: f.speech.stats(),
      // asking for sounds is harmless
      played: f.sound.combat('hit'),
      bed: f.sound.place('marsh', {}),
    };
  });
  expect(errors).toEqual([]);
  expect(off.sound.ready).toBe(false);
  expect(off.played).toBe(false);
  expect(off.speech.lingo).toBe(false);
});
