// Shared by the browser specs that build a custom class through the title screen.
//
// R28 gave every class its own skill, so a tier offers ~30 spells and the builder groups them by
// the class each one comes from (js/classbuild-ui.js `grouped`). Past four groups they start
// FOLDED, so "click the first enabled card" found a card inside a closed <details> and waited the
// whole test timeout for it to become visible. A player opens a group first; so does this.
//
// The rule asserted by the callers is unchanged: the open slot offers spells it can take, and one
// pick finishes the build. Which card is first is not the point.

/**
 * Click the first spell the open slot can take, opening its class group first when needed.
 * @param {import('@playwright/test').Page} page
 * @param {string} scope  CSS prefix for the builder (e.g. '.cb:not([hidden])'), '' for the page
 */
export async function pickOpenSpell(page, scope = '') {
  const visible = page.locator(`${scope} .cb-opt:not([disabled]):visible`);
  if (!(await visible.count())) {
    // the first class group of the READY list — not one nested inside "Spells for later slots"
    await page.evaluate(sc => {
      const root = (sc && document.querySelector(sc)) || document;
      const group = [...root.querySelectorAll('details.cb-origin')]
        .find(d => !d.parentElement.closest('details:not(.cb-origin)')
          && d.querySelector('.cb-opt:not([disabled])'));
      group?.setAttribute('data-test-pick', '1');
    }, scope);
    await page.locator(`${scope} details[data-test-pick] > summary`).first().click();
  }
  await visible.first().click();
}
