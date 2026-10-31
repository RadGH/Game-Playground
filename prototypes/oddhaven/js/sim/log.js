// Two streams. `say` is for the client right now (drained each tick, not saved). `log` is the shared event log: capped,
// saved, what a recap, the Odd Sheet or a memory reads later. Only things worth retelling go in the log.

import { mailFromLog } from './mail.js';
import { momentFromLog } from './moments.js';
import { threadsOnLog } from './threads.js';

export function say(c, kind, data = {}) { c.out.push({ kind, t: c.s.t, ...data }); }

export function log(c, kind, data = {}) {
  const entry = { t: c.s.t, kind, ...data };
  const list = c.s.log;
  threadsOnLog(c, entry);        // may number it as a step in a thread, so do this before anyone copies it
  list.push(entry);
  if (list.length > c.k.log.cap) list.splice(0, list.length - c.k.log.cap);
  c.out.push({ ...entry });
  mailFromLog(c, entry);
  momentFromLog(c, entry);
}
