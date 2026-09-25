// Boot: load data, create the app (renderer, input, loop), show the first screen.

import { loadData } from './data.js';
import { App } from './app.js';

const data = await loadData();
const app = new App(data);
window.app = app; // handy for debugging and Playwright
app.boot();
