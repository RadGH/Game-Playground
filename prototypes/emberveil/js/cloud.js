// Emberveil 2 — the optional games.radgh.com account and cloud saves (2026-10-23).
//
// "Sign in optional. QR code to sign in using your phone on all games. … I'd like to use my TV account for the other
// games - same password, different saves." Signed out, nothing changes: the run stays in this browser as before.
// Signed in, shared/rgs-cloudsave.js copies it to the account (game id 'emberveil2') and back.
//
// What travels: the one save, SAVE_KEY ('playground:emberveil:save:v1', js/game.js). Everything else Emberveil keeps
// in localStorage is a setting (the UI prefs, sound, language-debug overrides) and stays on the device. The shared
// character library ('playground:library:v1') belongs to the whole playground, not to this game, so it is not synced.
//
// Restoring: Emberveil has ONE save slot, and the running game writes it after every fight and every rest. So a
// download only happens while you are on the title or hiring screen (Continue lights up); during a run, newer saves
// from the account wait and the status line says so — they come down the next time the title screen opens.
import { cloudSave, statusLine } from '../../../shared/rgs-cloudsave.js';
import { accountButton } from '../../../shared/rgs-signin.js';
import { account } from '../../../shared/rgs-account.js';
import { Game, SAVE_KEY } from './game.js';

let cloud = null;
const lines = new Set();
const inRun = () => document.body.dataset.screen === 'world';

/**
 * Start cloud saves. `onRestore` runs after saves came down from the account (redraw Continue).
 * Returns the cloudSave handle.
 */
export function installCloud({ onRestore = () => {} } = {}) {
  if (cloud) return cloud;
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' || e.key === 'Tab') return;
    if (e.target?.closest?.('.rgs-signin')) e.stopPropagation();   // typing a name is not a hotkey
  }, true);
  cloud = cloudSave({
    game: 'emberveil2',
    keys: { save: SAVE_KEY },
    canRestore: () => !inRun(),
    onRestore,
    onConflict: askWhich,
  });
  Game.onSaved = () => cloud.saveSoon();
  cloud.onStatus(s => { for (const el of lines) el.textContent = statusLine(s); });
  setInterval(() => { const s = cloud.status(); for (const el of lines) el.textContent = statusLine(s); }, 30_000);
  return cloud;
}

/**
 * The account button + one-line status in `host`. `beforeSignIn` runs when a signed-out player presses the button —
 * the game menu is a modal <dialog>, which would sit on top of the sign-in box, so the menu closes first.
 */
export function mountAccount(host, { beforeSignIn = null } = {}) {
  if (!host || host.dataset.cloud) return;
  host.dataset.cloud = '1';
  const btn = accountButton({ game: 'emberveil2', gameName: 'Emberveil II' });
  if (beforeSignIn) btn.addEventListener('click', () => { if (!account.known) beforeSignIn(); }, true);
  const line = document.createElement('span');
  line.className = 'cloud-status tiny';
  line.setAttribute('aria-live', 'polite');
  line.textContent = statusLine(cloud?.status());
  lines.add(line);
  host.append(btn, line);
}

/** Both copies changed: ask with the game's own framed dialog. Resolves 'cloud' or 'local'. */
function askWhich(q) {
  return new Promise(resolve => {
    const at = (() => { try { return new Date(q.cloudAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch { return q.cloudAt; } })();
    const dlg = document.createElement('dialog');
    dlg.className = 'framed cloud-ask';
    dlg.innerHTML = `<h3 class="display">Which run should we keep?</h3><div class="ornament"></div>
      <p>Your account has a saved run from <b></b> (<span class="dev"></span>), and this browser has a different one.</p>
      <div class="menu-buttons">
        <button class="ornate primary" data-pick="cloud">Use the run from my account</button>
        <button class="ornate" data-pick="local">Keep this browser's run (and copy it to my account)</button>
      </div>`;
    dlg.querySelector('b').textContent = at;
    dlg.querySelector('.dev').textContent = q.cloudDevice || 'another device';
    let picked = null;
    for (const b of dlg.querySelectorAll('[data-pick]')) b.onclick = () => { picked = b.dataset.pick; dlg.close(); };
    dlg.addEventListener('cancel', e => e.preventDefault());           // Escape does not pick for you
    dlg.addEventListener('close', () => { dlg.remove(); resolve(picked || 'later'); });
    document.body.append(dlg);
    dlg.showModal();
  });
}
