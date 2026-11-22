// Boot: load data, create the app (renderer, input, loop), show the first screen.

import { loadData } from './data.js';
// No page zoom on phones (copy of playground shared/no-zoom.js — this game also runs from its own server, where shared/ isn't served):
// iPhone ignores user-scalable=no, so refuse its pinch gesture and turn off double-tap zoom.
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.documentElement.style.touchAction = 'manipulation';
import { App } from './app.js';

const data = await loadData();
const app = new App(data);
window.app = app; // handy for debugging and Playwright
app.boot();
