// app.openWindow('trainer', opts) → the trainer window from win-services.js.
import { open as openService } from './win-services.js';
export const open = (app, opts = {}) => openService(app, { ...opts, kind: 'trainer' });
