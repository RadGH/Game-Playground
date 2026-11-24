// app.openWindow('travel', opts) → the travel window from win-services.js.
import { open as openService } from './win-services.js';
export const open = (app, opts = {}) => openService(app, { ...opts, kind: 'travel' });
