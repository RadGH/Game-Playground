import { test, expect } from '@playwright/test';

test('Gravenhold M0 room and M1 class hotbar load and work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/prototypes/gravenhold/');
  await expect(page.locator('#status'), errors.join('\n')).toHaveText('Room ready', { timeout: 20_000 });
  await expect(page.locator('#scene')).toBeVisible();
  await expect(page.locator('#class-select option')).not.toHaveCount(0);
  await expect(page.locator('#class-select')).toHaveValue('warrior');
  await expect(page.locator('#hotbar button')).toHaveCount(3);
  await expect(page.locator('#hotbar')).not.toContainText(/Star Dart|Scattered Stars|Called Star/);
  await expect(page.locator('#minimap')).toBeVisible();
  const layout = await page.evaluate(() => window.gravenhold.dungeon);
  expect(layout.rooms.length).toBeGreaterThan(4);
  expect(layout.links.length).toBe(layout.rooms.length - 1);
  expect(layout.stairs).toBeTruthy();
  await page.locator('#class-select').selectOption('starcaller');
  const health = page.locator('#target-hp');
  const initialHealth = await health.textContent();
  await page.getByRole('button', { name: /Star Dart/ }).click();
  await expect(page.locator('#status')).toHaveText('Star Dart cast');
  await expect(health).not.toHaveText(initialHealth, { timeout: 5_000 });
  await expect(health).toContainText('Moor Hound');
  const toggle = page.getByRole('button', { name: 'Tilt shift: off' });
  await toggle.click();
  await expect(page.locator('body')).toHaveClass(/tilt/);
  await expect(page.getByRole('button', { name: 'Tilt shift: on' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('M2 shared hound, monster AI, hit, death and XP; class hotbar follows selection', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/prototypes/gravenhold/');
  await expect(page.locator('#target-hp')).toContainText('Moor Hound', { timeout: 20_000 });
  const initial = await page.evaluate(() => ({ x: window.gravenhold.target.x, state: window.gravenhold.target.state }));
  await page.waitForTimeout(900);
  const moved = await page.evaluate(() => ({ x: window.gravenhold.target.x, z: window.gravenhold.target.z }));
  expect(Math.abs(moved.x - initial.x) + Math.abs(moved.z + 3)).toBeGreaterThan(0);
  await page.locator('#class-select').selectOption({ label: 'Warrior' });
  await expect(page.locator('#hotbar')).not.toContainText('Star Dart');
  await expect(page.locator('#hotbar')).not.toContainText('Scattered Stars');
  await expect(page.locator('#hotbar')).not.toContainText('Called Star');
  await page.evaluate(() => { window.gravenhold.target.hp = 1; window.gravenhold.target.x = 0; window.gravenhold.target.z = 1; window.gravenhold.player.position.set(0,0,0); });
  await page.keyboard.press('Space');
  await expect(page.locator('#target-hp')).toContainText('Target defeated', { timeout: 8_000 });
  await expect(page.locator('#target-hp')).toContainText('XP');
  expect(errors).toEqual([]);
});

test('M3 stairs descend to a new seeded floor with room monsters', async ({ page }) => {
  await page.goto('/prototypes/gravenhold/');
  await expect(page.locator('#status')).toHaveText('Room ready', { timeout: 20_000 });
  await expect(page.locator('#hotbar button')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('#minimap')).toBeVisible();
  await page.evaluate(() => {
    const d=window.gravenhold.dungeon, r=d.rooms.find(q=>q.id===d.stairs);
    window.gravenhold.player.position.set(r.x,0,r.z);
  });
  await page.keyboard.down('e');
  await expect(page.locator('#floor-label')).toHaveText('FLOOR 2');
  await page.keyboard.up('e');
  const nextFloor=await page.evaluate(()=>window.gravenhold.dungeon);
  expect(nextFloor.floor).toBe(2);
  expect(nextFloor.seed).not.toBe(41);
  expect(nextFloor.rooms.length).toBeGreaterThan(4);
});
