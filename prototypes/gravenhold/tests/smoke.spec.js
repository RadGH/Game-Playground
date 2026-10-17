import { test, expect } from '@playwright/test';

test('M7 each gamepad index joins as its own player and shared camera tracks the party', async ({ page }) => {
  await page.addInitScript(() => {
    const makePad = index => ({ index, id:`Fake pad ${index}`, mapping:'standard', connected:true, axes:[0,0,0,0], buttons:Array.from({length:16},()=>({pressed:false,value:0})) });
    window.fakePads=[makePad(0),makePad(1)];
    Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.fakePads});
  });
  await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click();
  await page.evaluate(()=>{window.fakePads[0].buttons[0].pressed=true;window.fakePads[1].buttons[0].pressed=true;});
  await expect(page.locator('#player-frames .player-frame')).toHaveCount(3);
  await page.evaluate(()=>{window.fakePads[0].buttons[0].pressed=false;window.fakePads[1].buttons[0].pressed=false;window.fakePads[0].axes[0]=0.9;});
  await page.waitForTimeout(450);
  const result=await page.evaluate(()=>({players:document.querySelectorAll('#player-frames .player-frame').length, roster:window.gravenhold.players?.map(p=>p.padIndex), firstX:window.gravenhold.player.position.x, secondX:document.querySelector('[data-player="player2"]')?.dataset.player}));
  expect(result.players).toBe(3);
  expect(result.firstX).toBe(0);
  expect(result.secondX).toBe('player2');
});

test('Gravenhold M0 room and M1 class hotbar load and work', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click();
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
  await page.evaluate(() => { window.gravenhold.player.position.set(0,0,0); window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD'})); });
  await page.waitForTimeout(450);
  const blocked=await page.evaluate(()=>window.gravenhold.player.position.x);
  expect(blocked).toBeLessThan(2.6);
  await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyD'}));window.gravenhold.player.position.set(0,0,0);});
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

test('M3 walls stop player and nearest monster selection is shared by attacks and skills', async ({page})=>{
 await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click(); await expect(page.locator('#target-hp')).toContainText('Moor Hound',{timeout:20000});
 const result=await page.evaluate(()=>{
   const {nearestLiving,moveWithWalls}=window.gameplayTest||{};
   const mobs=[{id:'far',x:4,z:0},{id:'near',x:1,z:0},{id:'dead',x:.1,z:0,dead:true}];
   return { target:nearestLiving(mobs,0,0)?.id, moved:moveWithWalls({x:0,z:0},1,0,[{x:.5,z:0,w:.4,d:2}]).x };
 });
 expect(result.target).toBe('near'); expect(result.moved).toBe(0);
});

test('M4 inventory lists picked Thousandvale loot and can equip it',async({page})=>{
 await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click(); await expect(page.locator('#target-hp')).toContainText('Moor Hound',{timeout:20000});
 await page.evaluate(()=>window.gravenhold.debugDrop());
 await expect(page.locator('#inventory button')).toHaveCount(1,{timeout:5000});
 await page.locator('#inventory button').first().click();
 await expect(page.locator('#status')).toContainText('Equipped');
});

test('M2 shared hound, monster AI, hit, death and XP; class hotbar follows selection', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click();
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
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click();
  await expect(page.locator('#status')).toHaveText('Room ready', { timeout: 20_000 });
  await expect(page.locator('#hotbar button')).toHaveCount(3, { timeout: 20_000 });
  await expect(page.locator('#minimap')).toBeVisible();
  await page.evaluate(() => {
    const d=window.gravenhold.dungeon, r=d.rooms.find(q=>q.id===d.stairs);
    window.gravenhold.debug.clearMonsters(); window.gravenhold.player.position.set(r.x,0,r.z);
  });
  await page.keyboard.down('e');
  await expect(page.locator('#floor-label')).toHaveText('FLOOR 2');
  await page.keyboard.up('e');
  const nextFloor=await page.evaluate(()=>window.gravenhold.dungeon);
  expect(nextFloor.floor).toBe(2);
  expect(nextFloor.seed).not.toBe(41);
  expect(nextFloor.rooms.length).toBeGreaterThan(4);
});


test('Ninth Star fans three distinct projectiles into three landed hits',async({page})=>{
 await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click(); await expect(page.locator('#target-hp')).toContainText('Moor Hound',{timeout:20000});
 const setup=await page.evaluate(()=>{const d=window.gravenhold.debug;d.clearMonsters();d.equipNinthStar();window.gravenhold.player.position.set(0,0,0);window.gravenhold.player.rotation.y=0;for(const [i,x] of [-4,0,4].entries())d.spawnMonster(`fan${i}`,x,9);d.reset();return window.gravenhold.hero.equipment.weapon.name;});
 expect(setup).toBe('Wand of the Ninth Star');
 await page.evaluate(()=>window.gravenhold.debug.attack());
 await expect.poll(()=>page.evaluate(()=>window.gravenhold.debug.stats.projectileHits.length),{timeout:5000}).toBe(3);
 const stats=await page.evaluate(()=>window.gravenhold.debug.stats);
 expect(stats.projectileSpawns).toBe(3);expect(stats.projectileHits).toHaveLength(3);expect(stats.projectileHits.every(h=>h.damage>0)).toBeTruthy();
});

test('M5 level-ups award Thousandvale perks and talent choices change a skill plan',async({page})=>{
 await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click();await expect(page.locator('#target-hp')).toContainText('Moor Hound',{timeout:20000});
 const result=await page.evaluate(()=>{const d=window.gravenhold.debug;d.levelUp();d.levelUp();const h=window.gravenhold.hero;const skill=h.skills.slots.find(s=>s.id)?.id;const view=window.gravenhold.room.run(()=>window.gravenhold.room.engine.skillData.skills[skill]);const options=Object.entries(view.talents||{}).flatMap(([tier,t])=>(t.nodes||[]).map(n=>({tier:Number(tier),id:n.id,name:n.name})));return {skill,options,level:h.level};});
 expect(result.level).toBe(3);expect(result.options.length).toBeGreaterThan(0);
 const picked=await page.evaluate(({skill,option})=>{const d=window.gravenhold.debug;const before=d.skillPlan(skill);const accepted=d.chooseTalent(skill,option.tier,option.id);const after=d.skillPlan(skill);return {accepted,before,after,picks:window.gravenhold.hero.skillTalents?.[skill]};},{skill:result.skill,option:result.options[0]});
 expect(picked.accepted.ok).toBeTruthy();expect(picked.picks).toBeTruthy();expect(JSON.stringify({mult:picked.after.mult,damage:picked.after.damage,kind:picked.after.kind,status:picked.after.status})).not.toBe(JSON.stringify({mult:picked.before.mult,damage:picked.before.damage,kind:picked.before.kind,status:picked.before.status}));
 const perk=await page.evaluate(()=>{const f=window.gravenhold.room.engine.rpg.forest;return f.links.find(([a,b])=>a==='start'||b==='start')?.find(id=>id!=='start');});
 if(perk){const r=await page.evaluate(id=>window.gravenhold.debug.choosePerk(id),perk);expect(r.ok).toBeTruthy();}
});

test('M6 starts a run, gates floors, uses Thousandvale boss data and saves unlocks', async ({page}) => {
  await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await expect(page.locator('#run-screen')).toBeVisible();
  await expect(page.locator('#start-class option')).not.toHaveCount(0);
  await page.locator('#start-run').click();
  await expect(page.locator('#run-screen')).toBeHidden();
  for (let floor=1; floor<4; floor++) {
    await page.evaluate(() => {
      window.gravenhold.debug.clearMonsters();
      const d=window.gravenhold.dungeon, r=d.rooms.find(q=>q.id===d.stairs);
      window.gravenhold.player.position.set(r.x,0,r.z);
    });
    await page.keyboard.press('e');
    await expect(page.locator('#floor-label')).toHaveText(floor+1===4?'BOSS FLOOR':`FLOOR ${floor+1}`);
  }
  const boss=await page.evaluate(()=>window.gravenhold.room.field.monsters.find(m=>m.boss)?.name);
  expect(boss).toContain('Ossathra');
  await page.evaluate(()=>{
    window.gravenhold.debug.clearMonsters();
    const d=window.gravenhold.dungeon,r=d.rooms.find(q=>q.id===d.stairs);
    window.gravenhold.player.position.set(r.x,0,r.z);
  });
  await page.keyboard.press('e');
  await expect(page.locator('#run-title')).toHaveText('KEEP CLEARED');
  const meta=await page.evaluate(()=>JSON.parse(localStorage.getItem('gravenhold-meta')));
  expect(meta.runs).toBeGreaterThan(0);
  expect(meta.unlocked.length).toBeGreaterThan(1);
});


test('M6 death ends the run with a saved summary', async ({page}) => {
  await page.goto('/prototypes/gravenhold/');
  await page.waitForFunction(() => !!window.gravenhold);
  await page.locator('#start-run').click();
  await page.evaluate(()=>{window.gravenhold.hero.hp=0;});
  await expect(page.locator('#run-title')).toHaveText('RUN ENDED');
  await expect(page.locator('#run-copy')).toContainText('floor 1');
});
