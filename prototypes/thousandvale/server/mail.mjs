// Sending email (password reset codes) through SendGrid's HTTP API. No library needed. Same service and key as the
// games server's rgs-api (rads-game-server api/src/mail.js).
//
// Off when no key is set — then a reset code goes only to the admin page, as before.
//   TV_SENDGRID_API_KEY (or RGS_SENDGRID_API_KEY)   the SendGrid key
//   TV_MAIL_FROM (or RGS_MAIL_FROM)                 "Name <address>" or a bare address; it must be a sender SendGrid
//                                                   has verified

function parseFrom(s) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(s || '');
  return m ? { name: m[1].replace(/^"|"$/g, ''), email: m[2] } : { email: s || 'noreply@games.radgh.com' };
}

/** -> null when mail is off, else { send({ to, subject, text }) } (throws on a SendGrid error). */
export function mailerFromEnv(env = process.env, { log = () => {}, fetchFn = globalThis.fetch } = {}) {
  const key = env.TV_SENDGRID_API_KEY || env.RGS_SENDGRID_API_KEY;
  if (!key) return null;
  const from = parseFrom(env.TV_MAIL_FROM || env.RGS_MAIL_FROM);
  log('mail on', { from: from.email });
  return {
    async send({ to, subject, text }) {
      const res = await fetchFn('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from, subject, content: [{ type: 'text/plain', value: text }] }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`sendgrid ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}
