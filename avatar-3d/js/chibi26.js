// Chibi 2.6 opt-in entry point. The actor contract is shared; v26 selects the isolated 2.6 body and face paths.
import { createChibi2Character } from './chibi2.js';
import { CHIBI26_ANIMS } from './chibi26-motion.js';

export async function createChibi26Character(look, options = {}) {
  return createChibi2Character(look, { ...options, anims: options.anims || CHIBI26_ANIMS, v25: true, v26: true });
}
