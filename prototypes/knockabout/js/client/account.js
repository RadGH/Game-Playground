// Accounts (2026-10-23): optional games.radgh.com sign-in for Knockabout. Never in the way: guests play exactly as before.
//
// Signed in, this device's FIRST player (slot 0) is the account's fighter — name and look — kept on the Knockabout
// server (POST <root>/account, server/accounts.js), so the same fighter turns up on any phone or PC. The other local
// players, and everyone when signed out, keep their looks in this browser (look.js loadSlot / saveSlot).
// Every call to the server carries a fresh one-time ticket (account.ticket('knockabout')); the server swaps it for the
// user with rgs-api, so the browser never says who it is. Only offered when the page came from a Knockabout server
// (net.js serverAvailable): GitHub Pages and plain file servers have nowhere to keep the save.
//
//   const acct = installAccount({ onProfile(data|null, note), toast });   el.append(acct.button('title'))
import { account } from '../../../../shared/rgs-account.js';
import { openSignIn, accountButton } from '../../../../shared/rgs-signin.js';
import { setAccountSlot, loadGuestSlot } from './look.js';
import { serverAvailable, apiRoot } from './net.js';

export const ACCT = { game: 'knockabout', gameName: 'Knockabout' };
const NOTE = {
  moved: 'Signed in. Your fighter is saved to your account now.',
  kept: 'Signed in. Your account already had a fighter, so that one is in use. This device keeps its own for when you sign out.',
  failed: "Couldn't check your sign-in just now — playing as a guest.",
};

export function installAccount({ onProfile = () => {}, toast = () => {} } = {}) {
  let on = false, userId = null, saveTimer = 0, pending = null;
  const post = async body => {
    const ticket = await account.ticket('knockabout');
    if (!ticket) return null;
    const r = await fetch(apiRoot() + 'account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket, ...body }) });
    return r.ok ? r.json() : null;
  };
  const save = data => {
    pending = data; clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { const d = pending; pending = null; try { if (!(await post({ save: { name: d.name, look: d.look } }))) console.warn('[knockabout] account save failed'); } catch (e) { console.warn('[knockabout] account save failed', e); } }, 1200);
  };
  async function changed(u) {
    const id = u?.id || null;
    if (id === userId) return;
    userId = id;
    if (!u) { if (on) { on = false; setAccountSlot(null); onProfile(null, null); toast("Signed out — this device's own fighter is back."); } return; }
    let r = null;
    try { r = await post({ guest: loadGuestSlot(0) || undefined }); } catch (e) { console.warn('[knockabout] account sign-in failed', e); }
    if (userId !== id) return;                       // signed out again meanwhile
    if (!r?.ok) { toast(NOTE.failed); return; }
    on = true;
    const data = r.profile || loadGuestSlot(0);
    setAccountSlot(data, save);
    if (!r.profile && data) save(data);              // a brand-new account starts from this device's fighter
    onProfile(data, r.note || null);
    if (NOTE[r.note]) toast(NOTE[r.note]);
  }
  const ready = serverAvailable(), slots = new Map();
  return {
    get on() { return on; },
    /** The "Sign in" button (or the name + menu) for one place on screen (`key`): made once, re-placed on every redraw.
     *  Stays empty (hidden) unless a Knockabout server is there. */
    button(key = 'title') {
      if (slots.has(key)) return slots.get(key);
      const slot = document.createElement('div'); slot.className = 'acct-slot'; slot.hidden = true; slots.set(key, slot);
      ready.then(ok => { if (!ok) return; slot.append(accountButton({ ...ACCT, onChange: changed })); slot.hidden = false; });
      return slot;
    },
    openSignIn: () => openSignIn(ACCT),
    account,
  };
}
