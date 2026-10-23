// Farhold — the optional games.radgh.com account and cloud saves (2026-10-23).
//
// "Sign in optional. QR code to sign in using your phone on all games. … I'd like to use my TV account for the other
// games - same password, different saves." Nothing here changes a guest's game: signed out, the saves stay in this
// browser exactly as before. Signed in, shared/rgs-cloudsave.js copies them to the account and back.
//
// What travels (every localStorage key a run depends on):
//   farhold.saves.v1      every save slot (js/save.js)
//   farhold.lastSave      which one Continue loads
//   farhold.blueprints.v1 the build layouts kept across worlds (js/build.js)
//   farhold.seen.*        which regions you have discovered, per world (js/map.js) — one key per world, so it travels
//                         as a prefix group
// Left on the device: settings and key bindings (farhold.settings…), the log filter, and the terrain cache
// (js/planet.js), which is rebuilt from the seed anyway.
//
// Restoring: a download only happens on the title screen. There it re-draws the menu (Continue) and the Load list in
// place. While a run is being played, newer saves from the account WAIT (the status line says so) — the running game
// writes its own slot every few seconds and would undo a download, and the account copy must not be overwritten — and
// they are offered the next time the title screen opens (Main menu in the pause menu).
import { cloudSave, statusLine } from '../../../shared/rgs-cloudsave.js';
import { accountButton } from '../../../shared/rgs-signin.js';

export const CLOUD_KEYS = { saves: 'farhold.saves.v1', last: 'farhold.lastSave', blueprints: 'farhold.blueprints.v1' };
export const CLOUD_PREFIXES = { seen: 'farhold.seen.' };

let playing = false;
let cloud = null;
const lines = new Set();

/** Start cloud saves. Safe to call once at boot; returns the cloudSave handle. */
export function installCloud() {
  if (cloud) return cloud;
  // Keys typed into the sign-in box must not walk the character or open the sheet underneath it.
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'Tab') return;
    if (e.target?.closest?.('.rgs-signin, .fh-cloud-ask')) e.stopPropagation();
  }, true);
  cloud = cloudSave({
    game: 'farhold',
    keys: CLOUD_KEYS,
    prefixes: CLOUD_PREFIXES,
    canRestore: () => !playing,
    onRestore: () => window.dispatchEvent(new Event('farhold:saves-changed')),
    onConflict: askWhich,
  });
  cloud.onStatus(s => { for (const el of lines) el.textContent = statusLine(s); });
  // "saved 2 min ago" has to keep counting
  setInterval(() => { const s = cloud.status(); for (const el of lines) el.textContent = statusLine(s); }, 30_000);
  return cloud;
}

/** The run has started: from now on account saves wait for the title screen instead of loading. */
export function setPlaying(v = true) { playing = !!v; }

/** Put the account button and the one-line status into `host` (the title menu, the pause menu). */
export function mountAccount(host) {
  if (!host || host.dataset.cloud) return;
  host.dataset.cloud = '1';
  const btn = accountButton({ game: 'farhold', gameName: 'Farhold' });
  const line = document.createElement('span');
  line.className = 'cloud-status';
  line.setAttribute('aria-live', 'polite');
  lines.add(line);
  line.textContent = statusLine(cloud?.status());
  host.append(btn, line);
}

/** Both copies changed: ask in the game's own style. Resolves 'cloud' or 'local'. */
function askWhich(q) {
  return new Promise(resolve => {
    const at = (() => { try { return new Date(q.cloudAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return q.cloudAt; } })();
    const box = document.createElement('div');
    box.className = 'fh-cloud-ask';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'fh-cloud-ask-h');
    box.innerHTML = `<div class="fh-cloud-card">
      <h2 id="fh-cloud-ask-h">Which saves should Farhold use?</h2>
      <p>Your account has saves from <b></b> (<span class="dev"></span>), and this device has different ones.</p>
      <div class="fh-cloud-choices">
        <button type="button" data-pick="cloud">Use my account's saves<small>This device's saves are replaced</small></button>
        <button type="button" class="ghost" data-pick="local">Keep this device's saves<small>They are copied to your account</small></button>
      </div></div>`;
    box.querySelector('b').textContent = at;
    box.querySelector('.dev').textContent = q.cloudDevice || 'another device';
    for (const b of box.querySelectorAll('[data-pick]')) b.onclick = () => { box.remove(); resolve(b.dataset.pick); };
    document.body.append(box);
    box.querySelector('[data-pick="cloud"]').focus();
  });
}
