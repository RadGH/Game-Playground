// Gamepad mock for Playwright (PLAN §19 #16). Inject with page.addInitScript({ content: PADMOCK }).
// window.__pad.connect(index, { id, mapping, buttons, axes }) adds a pad; __pad.down/up(index, button)
// and __pad.axis(index, axis, value) drive it; __pad.disconnect(index) removes it.
// navigator.getGamepads() then returns fresh snapshot objects, like a real browser.
export const PADMOCK = `
(() => {
  const pads = [];
  const api = {
    connect(index, { id = 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)', mapping = 'standard', buttons = 17, axes = 4 } = {}) {
      pads[index] = { id, index, mapping, connected: true, buttons: Array.from({ length: buttons }, () => ({ pressed: false, value: 0, touched: false })), axes: new Array(axes).fill(0), timestamp: 0 };
      window.dispatchEvent(new Event('gamepadconnected'));
    },
    disconnect(index) { pads[index] = null; },
    down(index, b) { const p = pads[index]; p.buttons[b] = { pressed: true, value: 1, touched: true }; p.timestamp++; },
    up(index, b) { const p = pads[index]; p.buttons[b] = { pressed: false, value: 0, touched: false }; p.timestamp++; },
    axis(index, a, v) { const p = pads[index]; p.axes[a] = v; p.timestamp++; },
    get list() { return pads; },
  };
  window.__pad = api;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const p = pads[i];
      out.push(p ? { ...p, buttons: p.buttons.map((b) => ({ ...b })), axes: p.axes.slice() } : null);
    }
    return out;
  } });
})();
`;

// Standard-mapping button indices.
export const STD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, View: 8, Menu: 9, L3: 10, R3: 11, DUp: 12, DDown: 13, DLeft: 14, DRight: 15 };
// Firefox-on-Linux X-input raw layout (mapping ""): buttons + hat axes 6/7.
export const XRAW = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, View: 6, Menu: 7, Guide: 8, L3: 9, R3: 10 };

/** Press and release a button. Pads are POLLED once per animation frame and headless WebGL can
 *  run at 5-10 fps, so the hold must outlast a slow frame or the press is never seen. */
export async function tap(page, index, b, hold = 350) {
  await page.evaluate(([i, x]) => window.__pad.down(i, x), [index, b]);
  await page.waitForTimeout(hold);
  await page.evaluate(([i, x]) => window.__pad.up(i, x), [index, b]);
  await page.waitForTimeout(220);
}
