// The map's travel controls, in the real page.
//
// "Can you update the map to show waypoint accessible tiles and let you click on them, indicate as
// selected, and click a button to teleport to it. It can work like the existing teleport button but
// should only work where waypoints have been activated. Make the current teleport feature a debug
// option, but keep it enabled by default."
//
// Three things to prove: a click PICKS rather than travels, the button refuses an unlit pad and
// says why, and "Go here" answers to the debug switch while the waypoint button never does.

import { test, expect } from '@playwright/test';

async function land(page, { seed = 11 } = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`/prototypes/farhold/?auto=1&quality=low&sound=off&seed=${seed}&class=ranger`);
  await page.waitForFunction(() => document.body.dataset.ready === '1' && !!window.farhold, null, { timeout: 120000 });
  return errors;
}

test('clicking a pad picks it; the button is what travels', async ({ page }) => {
  const errors = await land(page);
  await page.evaluate(() => window.farhold.map.toggle(true));
  await page.waitForTimeout(900);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const pads = f.waypoints.list();
    const unlit = pads.find(p => !p.lit);
    // click the pad on the canvas exactly where the map drew it
    const hit = f.map.padHits.find(h => h.id === unlit.id) || f.map.padHits[0];
    const canvas = document.getElementById('map-canvas');
    const rect = canvas.getBoundingClientRect();
    const before = { x: f.control.x, z: f.control.z };
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + hit.x * (rect.width / canvas.width),
      clientY: rect.top + hit.y * (rect.height / canvas.height),
    }));
    await new Promise(r => setTimeout(r, 250));

    const side = document.querySelector('.map-side');
    const button = [...side.querySelectorAll('button')].find(b => b.textContent.includes('Travel to this waypoint'));
    return {
      picked: f.map.padPick,
      wanted: hit.id,
      moved: f.control.x !== before.x || f.control.z !== before.z,
      stillOpen: f.map.isOpen,
      hasButton: !!button,
      disabled: button ? button.disabled : null,
      says: side.textContent,
    };
  });

  expect(out.picked, 'clicking a pad did not select it').toBe(out.wanted);
  expect(out.moved, 'clicking a pad teleported the player with no confirmation').toBe(false);
  expect(out.stillOpen, 'the map closed itself on a plain click').toBe(true);
  expect(out.hasButton, 'the picked pad has no travel button').toBe(true);
  expect(out.disabled, 'an unlit pad offered a live travel button').toBe(true);
  expect(out.says, 'the refusal is not on screen').toMatch(/have not been to|sigils are dark/);
  expect(errors).toEqual([]);
});

test('a lit pad travels, and lands the player on the sigil', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    // light one the way the game does — walk into it
    const pad = f.waypoints.list()[0];
    f.waypoints.visit(pad.node);
    f.control.teleport(pad.x + 4000, pad.z + 4000);

    f.map.toggle(true);
    await new Promise(r => setTimeout(r, 600));
    f.map.pickPad(pad.id);
    await new Promise(r => setTimeout(r, 150));
    const button = [...document.querySelectorAll('.map-side button')]
      .find(b => b.textContent.includes('Travel to this waypoint'));
    const disabled = button.disabled;
    button.click();
    await new Promise(r => setTimeout(r, 600));
    return {
      disabled,
      away: Math.hypot(f.control.x - pad.x, f.control.z - pad.z),
      open: f.map.isOpen,
      portal: !!f.portals?.portal,
    };
  });

  expect(out.disabled, 'a lit pad would not travel').toBe(false);
  expect(out.away, 'travel did not put the player on the pad').toBeLessThan(6);
  expect(out.open, 'the map stayed open after travelling').toBe(false);
  expect(out.portal, 'no town portal was left behind').toBe(true);
  expect(errors).toEqual([]);
});

test('"Go here" is a debug option, on by default, and the waypoint button is not', async ({ page }) => {
  const errors = await land(page);

  const out = await page.evaluate(async () => {
    const f = window.farhold;
    const pad = f.waypoints.list()[0];
    f.waypoints.visit(pad.node);
    f.map.toggle(true);
    await new Promise(r => setTimeout(r, 600));

    const goHere = () => {
      // pick a plain cell, which is what puts the "Go here" panel up
      const canvas = document.getElementById('map-canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true, clientX: rect.left + rect.width * 0.2, clientY: rect.top + rect.height * 0.2,
      }));
      return [...document.querySelectorAll('.map-side button')].some(b => b.textContent.trim() === 'Go here');
    };

    const onByDefault = goHere();
    f.settings.set('debugTeleport', false);
    await new Promise(r => setTimeout(r, 150));
    const afterOff = goHere();

    // …and the waypoint button does NOT answer to the switch: it is a game rule, not a cheat
    f.map.pickPad(pad.id);
    await new Promise(r => setTimeout(r, 150));
    const stillTravels = [...document.querySelectorAll('.map-side button')]
      .some(b => b.textContent.includes('Travel to this waypoint'));
    f.settings.set('debugTeleport', true);
    return { onByDefault, afterOff, stillTravels };
  });

  expect(out.onByDefault, '"Go here" is not on by default').toBe(true);
  expect(out.afterOff, '"Go here" ignored the debug switch').toBe(false);
  expect(out.stillTravels, 'turning debug teleport off also took away waypoint travel').toBe(true);
  expect(errors).toEqual([]);
});
