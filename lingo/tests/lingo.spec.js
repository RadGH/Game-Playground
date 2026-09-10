// Playwright smoke test for the Lingo demo. Run: npm test -- lingo
import { test, expect } from '@playwright/test';
test.describe('lingo', () => {
  test('loads clean, speaks, converses, template tester works', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('lingo/');
    await expect(page.locator('#status')).toContainText('phrases');
    await page.getByRole('button', { name: 'Say it', exact: true }).click();
    await expect(page.locator('.line').first()).toContainText('Thalen');
    await page.getByRole('button', { name: 'One of each intent' }).click();
    expect(await page.locator('.line').count()).toBeGreaterThan(40);
    await page.getByRole('button', { name: 'Simulate conversation' }).click();
    await expect(page.locator('.line.b').first()).toBeVisible();
    await page.getByRole('button', { name: 'Expand ×5' }).click();
    const tpl = await page.locator('.panel:has(textarea.tpl) .line').first().textContent();
    expect(tpl).toMatch(/Thalen|Mara|coins/);
    const bad = await page.locator('.line').evaluateAll(els => els.map(e => e.textContent).filter(t => /\?\}|\.\w+\?|<no /.test(t)));
    expect(bad).toEqual([]);
    expect(errors).toEqual([]);
  });
  test('traits change what gets said (abrasive vs kind)', async ({ page }) => {
    await page.goto('lingo/'); await expect(page.locator('#status')).toContainText('phrases');
    const r = await page.evaluate(() => {
      const { lingo, state, Speaker } = window.lingoLab;
      const mk = traits => new Speaker({ name: 'T', entry: { id: 't', type: 'person', proper: true, pronouns: 'they', race: 'human', forms: { sg: 'T' } }, lexicon: lingo.lexicon, speech: { traits, formality: 0.5, verbosity: 0.5, cheer: 0.5, aggression: 0.5, confidence: 0.5, custom: {}, customRate: {}, tics: [], mood: 0 } });
      const count = (sp) => { let insults = 0; for (let i = 0; i < 60; i++) { const out = lingo.speak('retort', { speaker: sp, listener: state.B, opinion: 0 }); if (out.tags.includes('insult') || out.tags.includes('threat')) insults++; } return insults; };
      return { abrasive: count(mk(['abrasive', 'bloodlust'])), kind: count(mk(['kind', 'shy'])) };
    });
    expect(r.abrasive).toBeGreaterThan(r.kind);
  });
  test('lexicon editor adds a word usable in templates', async ({ page }) => {
    await page.goto('lingo/'); await expect(page.locator('#status')).toContainText('phrases');
    await page.evaluate(() => localStorage.clear());
    const r = await page.evaluate(() => {
      const { lingo, state } = window.lingoLab;
      lingo.lexicon.add({ id: 'moonwyrm', type: 'creature', forms: { sg: 'moonwyrm', pl: 'moonwyrms' }, tags: ['invented'], pron: { respell: 'MOON-wurm' } });
      lingo.invalidatePronunciations();
      const out = lingo.expand('{moonwyrm.a} and two {moonwyrm.pl}', { speaker: state.A });
      return { text: out.text, speech: lingo.toSpeech(out.text) };
    });
    expect(r.text).toBe('a moonwyrm and two moonwyrms');
    expect(r.speech).toContain('[[');
  });
});
