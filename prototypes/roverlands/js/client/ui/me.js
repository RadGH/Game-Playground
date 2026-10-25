// The player on this device: a name and a Chibi 2.5 look (the same look format as Knockabout's builder, so its
// piece-by-piece editor is reused as is: prototypes/knockabout/js/client/look.js + builder.js). Kept in this browser
// (localStorage 'roverlands.me'); when signed in to games.radgh.com it is the ACCOUNT's (account.js swaps it in and
// every change is saved to the server too).
//
//   me.get() -> { name, look }    me.set({ name?, look? })    me.on(fn)    portrait(look) -> data: URL    avatarFor(look)
import { avatarOf, randomLook, loadLookData } from '../../../../knockabout/js/client/look.js';
import { svgPortrait } from '../../../../thousandvale/js/client/ui/svg-portrait.js';
import { store } from './dom.js';

const KEY = 'roverlands.me';
export const NAMES = ['Rusty', 'Dash', 'Gravel', 'Juniper', 'Skid', 'Marlo', 'Pebble', 'Tamsin', 'Rook', 'Bramble', 'Quill', 'Sorrel', 'Tumble', 'Wren'];
let ready = false;
export const lookReady = loadLookData().then(() => { ready = true; });
export const avatarFor = look => avatarOf(look);
const pcache = new Map();
/** A head-and-shoulders picture (data: URL). Before the part lists load, or if a look cannot be drawn, a plain silhouette (never cached). */
const BLANK = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#2a3a44"/><circle cx="5" cy="4" r="2.2" fill="#4a5e6a"/><rect x="1.8" y="7" width="6.4" height="4" rx="2" fill="#4a5e6a"/></svg>');
export function portrait(look) {
  const k = JSON.stringify(look || null);
  if (pcache.has(k)) return pcache.get(k);
  if (!ready) return BLANK;
  let src = '';
  try { src = svgPortrait(avatarOf(look || { race: 'human', seed: 1 })); } catch { src = ''; }
  if (!src) return BLANK;
  if (pcache.size > 60) pcache.clear();
  pcache.set(k, src);
  return src;
}

export function createMe() {
  let guest = store.get(KEY, null);
  const fresh = !guest || !guest.look;
  // a brand-new player: a plain look at once, the dressed random one as soon as the part lists have loaded
  if (fresh) guest = { name: NAMES[Math.floor(Math.random() * NAMES.length)], look: { race: 'human', seed: (Math.random() * 2 ** 31) >>> 0, v: 1 } };
  let acct = null;            // { data, save(data) } while signed in
  const subs = new Set();
  if (fresh) lookReady.then(() => { if (!store.get(KEY, null)) { try { guest = { ...guest, look: randomLook() }; } catch { /* keep the plain one */ } tell(); } });
  const cur = () => (acct?.data || guest);
  const tell = () => { for (const f of subs) { try { f(cur()); } catch (e) { console.error(e); } } };
  return {
    /** true until this browser has saved a player once (an invite link then asks for a name first). */
    get isNew() { return fresh && !store.get(KEY, null); },
    get: () => cur(),
    guest: () => guest,
    set(patch) {
      const next = { ...cur(), ...patch };
      if (acct) { acct.data = next; acct.save(next); } else { guest = next; store.set(KEY, guest); }
      tell();
    },
    /** account.js: signed in (data = the account's player, save = send it to the server) or out (null). */
    useAccount(data, save) { acct = save ? { data: data && data.look ? data : { ...guest }, save } : null; tell(); },
    save: () => { if (!acct) store.set(KEY, guest); },
    on(f) { subs.add(f); return () => subs.delete(f); },
  };
}
