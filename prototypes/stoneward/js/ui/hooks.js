// Feature hooks for the page. A feature module (js/features/*.js) imports this and registers what
// it adds, so new systems never need to edit js/main.js beyond one import line in
// js/features/index.js. main.js fills `ui` with its helpers before any feature runs.
//
//   hooks.tabs.push({ id, label, render(ui) })     a dock tab (render fills ui.panel(...))
//   hooks.overlay.push((cam, out, ui) => {})      push [x, y, w, h, r, g, b, a] quads (drawn over the lit scene)
//   hooks.sprites.push((cam, out, ui) => {})      quads drawn INSIDE the scene (lit by day/night)
//   hooks.tap.push(async (p, ui) => true|false)    first one returning true eats the tap
//   hooks.tick.push((msg, ui) => {})               every sim message (≈10 a second)
//   hooks.keys.push((e, ui) => true|false)         keydown in the game
//   hooks.screen.push((cam, out, ui, dpr, vw, vh) => {})  quads in SCREEN device pixels (map view only)
//   hooks.infoTabs.push({ id, label, render(ui, head) })   a sub-tab of Info
//
// ui (filled by main.js): app, link(), toast, panel, btn, hint, sheet, esc, near, camera(), data,
// setTool(t), M, refreshDock().

export const hooks = { tabs: [], overlay: [], sprites: [], tap: [], tick: [], keys: [], infoTabs: [], screen: [] };
export const ui = {};
