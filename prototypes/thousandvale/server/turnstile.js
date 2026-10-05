// Cloudflare Turnstile check for guest creation (stream A, PLAN §9.4 / §11.6).
// The secret and the site key come from the environment (an env file OUTSIDE the repo, loaded by the
// systemd unit / ops/start-dev.sh, like dev.env) — never from the repo:
//   TV_TURNSTILE_SECRET   the secret key        (unset = no human check)
//   TV_TURNSTILE_SITEKEY  the public site key   (sent to the client in `welcome.human`)
// Cloudflare's published TEST keys (server/env.example) behave like real ones without a real account:
//   secret 1x0000000000000000000000000000000AA always passes, 2x0000000000000000000000000000000AA always fails;
//   site key 1x00000000000000000000AA renders a widget that always passes (token XXXX.DUMMY.TOKEN.XXXX).

export const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** A verifier `(token, ip) -> Promise<boolean>` for createWorld({ verifyHuman }), or null when not configured. */
export function turnstileFromEnv(env = process.env, { fetchImpl = globalThis.fetch, timeoutMs = 5000, log = () => {} } = {}) {
  const secret = env.TV_TURNSTILE_SECRET;
  if (!secret) return null;
  return async (token, ip) => {
    const body = new URLSearchParams({ secret, response: String(token || '') });
    if (ip && !/^(127\.|::1|::ffff:127\.)/.test(ip)) body.set('remoteip', ip);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetchImpl(SITEVERIFY, { method: 'POST', body, signal: ctl.signal });
      const j = await r.json();
      if (!j.success) log('turnstile refused', { codes: j['error-codes'] });
      return !!j.success;
    } finally { clearTimeout(t); }
  };
}
