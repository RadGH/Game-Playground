// app.openWindow('controls') → Settings on the Controls tab (every key and controller button, rebindable).
import { open as openSettings } from './win-settings.js';
export const open = (app, opts = {}) => openSettings(app, { ...opts, tab: 'controls' });
