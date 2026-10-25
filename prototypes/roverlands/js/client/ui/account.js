// Optional games.radgh.com sign-in (game-standards §3), the same pattern as Knockabout's js/client/account.js: signed
// in, this device's player (name + look) is the ACCOUNT's, kept on the Roverlands server (POST <root>/account, which is
// Knockabout's server/accounts.js), so the same driver turns up on any phone or PC. Every call carries a fresh one-time
// ticket; the server swaps it for the user with rgs-api, so the browser never says who it is. Only offered when a
// Roverlands server sent this page (GitHub Pages has nowhere to keep the save). Never in the way: guests play as before.
//
//   const acct = installAccount({ me, toast });   el.append(acct.button('title'))   acct.on   acct.openSignIn()
import { account } from '../../../../../shared/rgs-account.js';
import { openSignIn, accountButton } from '../../../../../shared/rgs-signin.js';
import { serverAvailable, apiRoot } from '../../net/client.js';

export const ACCT = { game: 'roverlands', gameName: 'Roverlands' };
const NOTE = {
  moved: 'Signed in. Your driver is saved to your account now.',
  kept: 'Signed in. Your account already had a driver, so that one is in use. This device keeps its own for when you sign out.',
  failed: "Couldn't check your sign-in just now — playing as a guest.",
};

export function installAccount({ me, toast = () => {} }) {
  let on = false, userId = null, saveTimer = 0, pending = null, user = null;
  const post = async body => {
    const ticket = await account.ticket('roverlands');
    if (!ticket) return null;
    const r = await fetch(apiRoot() + 'account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ticket, ...body }) });
    return r.ok ? r.json() : null;
  };
  const save = data => {
    pending = data; clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => { const d = pending; pending = null; try { await post({ save: { name: d.name, look: d.look } }); } catch (e) { console.warn('[roverlands] account save failed', e); } }, 1200);
  };
  async function changed(u) {
    const id = u?.id || null;
    if (id === userId) return;
    userId = id; user = u || null;
    if (!u) { if (on) { on = false; me.useAccount(null, null); toast("Signed out — this device's own driver is back."); } return; }
    let r = null;
    try { r = await post({ guest: me.guest() || undefined }); } catch (e) { console.warn('[roverlands] account sign-in failed', e); }
    if (userId !== id) return;
    if (!r?.ok) { toast(NOTE.failed); return; }
    on = true;
    const data = r.profile || me.guest();
    me.useAccount(data, save);
    if (!r.profile && data) save(data);
    if (NOTE[r.note]) toast(NOTE[r.note]);
  }
  const ready = serverAvailable(), slots = new Map();
  return {
    get on() { return on; }, get user() { return user; }, ready,
    /** The "Sign in" pill (or the name + menu) for one place on screen: made once, re-placed on every redraw. Hidden without a server. */
    button(key = 'title') {
      if (slots.has(key)) return slots.get(key);
      const slot = document.createElement('div'); slot.className = 'acct-slot'; slot.hidden = true; slots.set(key, slot);
      ready.then(ok => { if (!ok) return; slot.append(accountButton({ ...ACCT, onChange: changed })); slot.hidden = false; });
      return slot;
    },
    openSignIn: () => openSignIn(ACCT),
    signOut: () => account.signOut(),
    account,
  };
}
