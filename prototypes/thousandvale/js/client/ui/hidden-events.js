// Play-test 8 (W13): the events the player hid from the HUD — one set for the tracker, the minimap and the map.
// Kept for the session (sessionStorage; a reload in the same tab keeps it, a new visit starts clean) and never sent
// to the server: hiding changes what YOU are shown, not the event. The rules are in pt8-core.js (createHidden).
import { createHidden } from './pt8-core.js';

const KEY = 'tv.ev.hidden';
export const HIDDEN = createHidden({
  load: () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch { return []; } },
  save: list => { try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private window */ } },
});
