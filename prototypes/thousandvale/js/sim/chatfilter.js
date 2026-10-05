// Chat + name filter hooks (stream A, PLAN §11.6). Pure. The gateway and the province processes call
// `filter.text(s)` on every chat line and `filter.name(s)` on every new character / guild name / username.
// The word list is deliberately short — it is a HOOK: pass your own list (or a function) in the server options
// (`chatFilter: createChatFilter({ words, reserved })`) without touching the code that calls it.
//
//   const f = createChatFilter({ words?, reserved? })
//   f.text('you absolute sh1t') -> 'you absolute ****'     masks whole words, case and simple digit swaps ignored
//   f.name('Admin') -> false ; f.name('Aldra') -> true     reserved words and masked words anywhere in a name fail

export const DEFAULT_WORDS = Object.freeze(['fuck', 'fucking', 'fucker', 'shit', 'cunt', 'bitch', 'asshole', 'bastard', 'dick', 'cock', 'whore', 'slut', 'faggot', 'fag', 'nigger', 'nigga', 'retard', 'rape', 'rapist']);
export const DEFAULT_STRONG = Object.freeze(['fuck', 'cunt', 'nigger', 'nigga', 'faggot']);   // refused anywhere inside a name
export const DEFAULT_RESERVED = Object.freeze(['admin', 'administrator', 'moderator', 'gamemaster', 'staff', 'system', 'server', 'thousandvale', 'official', 'support']);
const SWAPS = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i' };
const fold = s => String(s).toLowerCase().replace(/[013457@$!]/g, c => SWAPS[c] || c);

export function createChatFilter({ words = DEFAULT_WORDS, reserved = DEFAULT_RESERVED, strong = DEFAULT_STRONG } = {}) {
  const set = new Set(words.map(w => fold(w)));
  const res = reserved.map(w => fold(w));
  return {
    text(s) {
      return String(s).replace(/[\p{L}\p{N}@$]+/gu, w => (set.has(fold(w)) ? '*'.repeat(w.length) : w));
    },
    name(s) {
      const f = fold(s).replace(/[^a-z]/g, '');
      if (res.some(r => f === r || f.startsWith(r))) return false;
      if (strong.some(w => f.includes(fold(w)))) return false;
      return !String(s).split(/[\s'\-]+/).some(p => set.has(fold(p)));
    },
  };
}
