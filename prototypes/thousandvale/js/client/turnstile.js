// Cloudflare Turnstile ("are you human") for the public link (PLAN §11.6, protocol §16.1). OFF by default: the
// widget is only drawn when the server's welcome carries `human: {siteKey}` (net.humanCheck), and Cloudflare's
// script is only fetched then — never on the LAN/friends build. Its token goes out as `guest.human` (client.js
// calls our function through connect({ human })) or as `account {op:'claim', human}`.

const API = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

function loadApi() {
  if (globalThis.turnstile) return Promise.resolve(globalThis.turnstile);
  if (loading) return loading;
  loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = API; s.async = true; s.defer = true;
    s.onload = () => (globalThis.turnstile ? res(globalThis.turnstile) : rej(new Error('The human check did not load.')));
    s.onerror = () => { loading = null; rej(new Error('The human check could not load. Check your connection and try again.')); };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Draw the widget in `box` and resolve with its token. `box` is shown while the check runs. The promise rejects
 * when the script cannot load or the check errors; an expired token re-runs the check by itself.
 */
export async function humanToken(box, siteKey, { label = 'One quick check that you are a person:' } = {}) {
  if (!siteKey) throw new Error('No human check is needed.');
  box.hidden = false;
  box.replaceChildren(Object.assign(document.createElement('p'), { className: 'hc-label', textContent: label }));
  const slot = document.createElement('div'); box.appendChild(slot);
  const ts = await loadApi();
  return new Promise((res, rej) => {
    let id = null;
    id = ts.render(slot, {
      sitekey: siteKey, theme: 'dark', appearance: 'always',
      callback: token => { res(token); setTimeout(() => { box.hidden = true; try { ts.remove(id); } catch {} }, 600); },
      'error-callback': () => rej(new Error('The human check failed. Reload the page to try again.')),
      'expired-callback': () => { try { ts.reset(id); } catch {} },
    });
  });
}

/** For connect({ human }): an async ({siteKey}) => token that draws the widget in `box`. */
export const humanFn = box => async check => humanToken(box, check && check.siteKey);
