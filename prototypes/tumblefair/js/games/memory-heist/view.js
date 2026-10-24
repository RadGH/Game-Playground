// MEMORY HEIST on a screen: the open vault (a grid of treasures drawn as small SVG pictures), then each question with
// big answer buttons; after each one the right answer lights up with the faces of everyone who picked each answer.
// A watch-only screen shows the same thing without being tappable.
import { esc, chip } from '../../client/gamehud.js';

const O = 'stroke="#0d2228" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
/** One treasure as an inline SVG in colour `c` (64 x 64 box). */
export function treasureSvg(id, c) {
  const body = {
    crown: `<path d="M10 46 L8 20 L22 32 L32 14 L42 32 L56 20 L54 46 Z" fill="${c}" ${O}/><rect x="10" y="46" width="44" height="8" rx="2" fill="${c}" ${O}/><circle cx="8" cy="18" r="4" fill="#fff" ${O}/><circle cx="32" cy="12" r="4" fill="#fff" ${O}/><circle cx="56" cy="18" r="4" fill="#fff" ${O}/>`,
    ring: `<circle cx="32" cy="38" r="17" fill="none" stroke="#0d2228" stroke-width="12"/><circle cx="32" cy="38" r="17" fill="none" stroke="${c}" stroke-width="6"/><path d="M24 14 L32 6 L40 14 L32 24 Z" fill="#fff" ${O}/>`,
    vase: `<path d="M24 8 H40 V14 C40 18 50 24 50 38 C50 50 42 58 32 58 C22 58 14 50 14 38 C14 24 24 18 24 14 Z" fill="${c}" ${O}/><path d="M18 36 H46" stroke="#fff" stroke-width="4" opacity=".7"/>`,
    goblet: `<path d="M14 8 H50 C50 26 42 34 32 34 C22 34 14 26 14 8 Z" fill="${c}" ${O}/><path d="M29 34 H35 V48 H29 Z" fill="${c}" ${O}/><path d="M18 56 C18 50 46 50 46 56 Z" fill="${c}" ${O}/>`,
    key: `<circle cx="18" cy="32" r="11" fill="${c}" ${O}/><circle cx="18" cy="32" r="4" fill="#173a5c" ${O}/><path d="M29 28 H58 V36 H52 V44 H46 V36 H29 Z" fill="${c}" ${O}/>`,
    gem: `<path d="M18 10 H46 L58 26 L32 58 L6 26 Z" fill="${c}" ${O}/><path d="M6 26 H58 M18 10 L26 26 L32 58 L38 26 L46 10" fill="none" ${O} stroke-width="2"/>`,
    coin: `<ellipse cx="32" cy="44" rx="22" ry="9" fill="${c}" ${O}/><ellipse cx="32" cy="36" rx="22" ry="9" fill="${c}" ${O}/><circle cx="32" cy="24" r="17" fill="${c}" ${O}/><path d="M32 13 L35 21 L43 21 L37 26 L39 34 L32 29 L25 34 L27 26 L21 21 L29 21 Z" fill="#fff" opacity=".85"/>`,
    lamp: `<path d="M27 16 C27 8 37 8 37 16 C37 20 32 24 32 24 C32 24 27 20 27 16 Z" fill="#ff9a1f" ${O} stroke-width="2"/><path d="M8 40 C8 30 20 26 32 26 C44 26 50 30 52 34 L60 28 L56 42 C52 48 44 50 32 50 C18 50 8 48 8 40 Z" fill="${c}" ${O}/><rect x="22" y="50" width="20" height="6" rx="2" fill="${c}" ${O}/>`,
    scroll: `<rect x="14" y="14" width="36" height="36" fill="#fff3d6" ${O}/><rect x="10" y="8" width="44" height="10" rx="5" fill="${c}" ${O}/><rect x="10" y="46" width="44" height="10" rx="5" fill="${c}" ${O}/><path d="M20 26 H44 M20 32 H40 M20 38 H44" stroke="#8a7a5a" stroke-width="2.5"/>`,
    mask: `<path d="M4 24 C14 18 24 20 32 26 C40 20 50 18 60 24 C60 40 50 46 42 46 C36 46 34 40 32 38 C30 40 28 46 22 46 C14 46 4 40 4 24 Z" fill="${c}" ${O}/><ellipse cx="20" cy="31" rx="7" ry="4.5" fill="#173a5c" ${O} stroke-width="2"/><ellipse cx="44" cy="31" rx="7" ry="4.5" fill="#173a5c" ${O} stroke-width="2"/>`,
    bell: `<path d="M32 6 C30 6 29 8 29 10 C18 12 14 22 14 34 C14 42 10 46 8 48 H56 C54 46 50 42 50 34 C50 22 46 12 35 10 C35 8 34 6 32 6 Z" fill="${c}" ${O}/><circle cx="32" cy="54" r="5" fill="#fff" ${O}/>`,
    medal: `<path d="M18 4 H30 L34 26 H22 Z" fill="#2f7ff0" ${O} stroke-width="2"/><path d="M46 4 H34 L30 26 H42 Z" fill="#e8383d" ${O} stroke-width="2"/><circle cx="32" cy="42" r="17" fill="${c}" ${O}/><path d="M32 30 L35.5 38 L44 38.5 L37.5 44 L39.5 52 L32 47.5 L24.5 52 L26.5 44 L20 38.5 L28.5 38 Z" fill="#fff" ${O} stroke-width="2"/>`,
    // Halloween (round 6): spooky-cute things, each mostly in its colour so colour questions still work
    pumpkin: `<path d="M32 16 C14 14 6 26 8 40 C10 54 22 58 32 56 C42 58 54 54 56 40 C58 26 50 14 32 16 Z" fill="${c}" ${O}/><path d="M24 18 C18 30 18 46 24 56 M40 18 C46 30 46 46 40 56" fill="none" ${O} stroke-width="2"/><path d="M32 16 C31 10 34 6 38 5" fill="none" stroke="#3f7a2a" stroke-width="5" stroke-linecap="round"/>`,
    hat: `<path d="M22 46 L32 8 L44 4 L38 14 L42 46 Z" fill="${c}" ${O}/><ellipse cx="32" cy="48" rx="28" ry="7" fill="${c}" ${O}/><path d="M23 40 H41" stroke="#fff" stroke-width="5" opacity=".8"/>`,
    potion: `<path d="M26 6 H38 V20 C50 24 54 34 52 44 C50 54 42 58 32 58 C22 58 14 54 12 44 C10 34 14 24 26 20 Z" fill="#fff" ${O}/><path d="M14 38 C22 34 42 42 50 36 C52 46 46 56 32 56 C18 56 12 48 14 38 Z" fill="${c}"/><path d="M26 6 H38 V20 C50 24 54 34 52 44 C50 54 42 58 32 58 C22 58 14 54 12 44 C10 34 14 24 26 20 Z" fill="none" ${O}/><rect x="24" y="2" width="16" height="7" rx="2" fill="#a0703a" ${O} stroke-width="2"/><circle cx="26" cy="46" r="3" fill="#fff" opacity=".7"/>`,
    broom: `<path d="M50 6 L28 36" stroke="#0d2228" stroke-width="8" stroke-linecap="round"/><path d="M50 6 L28 36" stroke="#a0703a" stroke-width="4" stroke-linecap="round"/><path d="M26 32 L36 40 L24 60 C16 60 6 54 4 48 Z" fill="${c}" ${O}/><path d="M22 40 L12 52 M28 44 L20 58" ${O} stroke-width="2"/>`,
    candy: `<path d="M18 32 L4 20 L8 32 L4 44 Z M46 32 L60 20 L56 32 L60 44 Z" fill="${c}" ${O}/><ellipse cx="32" cy="32" rx="16" ry="13" fill="${c}" ${O}/><path d="M24 24 L40 40" stroke="#fff" stroke-width="4" opacity=".75" stroke-linecap="round"/>`,
    candle: `<path d="M32 4 C26 12 26 18 32 20 C38 18 38 12 32 4 Z" fill="#ffcf4a" ${O} stroke-width="2"/><rect x="22" y="22" width="20" height="30" rx="3" fill="${c}" ${O}/><path d="M26 22 V30 M36 22 V34" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/><ellipse cx="32" cy="54" rx="18" ry="5" fill="#b8c4cc" ${O}/>`,
    bat: `<path d="M32 24 C24 12 10 12 2 20 C8 22 10 28 8 34 C14 30 20 32 22 38 C26 34 30 36 32 40 C34 36 38 34 42 38 C44 32 50 30 56 34 C54 28 56 22 62 20 C54 12 40 12 32 24 Z" fill="${c}" ${O}/><path d="M26 22 L24 14 L30 20 M38 22 L40 14 L34 20" fill="${c}" ${O} stroke-width="2"/><circle cx="28" cy="27" r="2.4" fill="#fff"/><circle cx="36" cy="27" r="2.4" fill="#fff"/>`,
    ghost: `<path d="M14 58 V28 C14 10 50 10 50 28 V58 L44 52 L38 58 L32 52 L26 58 L20 52 Z" fill="${c}" ${O}/><ellipse cx="25" cy="30" rx="3.5" ry="5" fill="#0d2228"/><ellipse cx="39" cy="30" rx="3.5" ry="5" fill="#0d2228"/><path d="M28 40 Q32 44 36 40" fill="none" ${O} stroke-width="2.5"/>`,
    cauldron: `<path d="M8 22 H56 C58 40 50 54 32 54 C14 54 6 40 8 22 Z" fill="${c}" ${O}/><ellipse cx="32" cy="22" rx="24" ry="6" fill="#7dff5a" ${O}/><circle cx="24" cy="14" r="4" fill="#9cff7a" ${O} stroke-width="2"/><circle cx="38" cy="10" r="3" fill="#9cff7a" ${O} stroke-width="2"/><path d="M14 54 L10 60 M50 54 L54 60" ${O}/>`,
    moon: `<path d="M40 6 C22 8 10 22 12 38 C14 52 28 62 44 58 C30 54 22 42 24 30 C26 18 34 10 40 6 Z" fill="${c}" ${O}/><circle cx="22" cy="40" r="2.5" fill="#0d2228"/><path d="M20 48 Q24 50 28 48" fill="none" ${O} stroke-width="2"/><path d="M48 18 l2 5 l5 1 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -1 Z" fill="#fff" ${O} stroke-width="1.5"/>`,
    lolly: `<path d="M32 34 V62" stroke="#0d2228" stroke-width="7" stroke-linecap="round"/><path d="M32 34 V62" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/><circle cx="32" cy="22" r="18" fill="${c}" ${O}/><path d="M32 22 m-10 0 a10 10 0 1 1 10 10 a6 6 0 1 1 -4 -8" fill="none" stroke="#fff" stroke-width="3" opacity=".85" stroke-linecap="round"/>`,
    cat: `<path d="M14 58 C10 44 14 30 22 26 L18 8 L30 20 H34 L46 8 L42 26 C50 30 54 44 50 58 Z" fill="${c}" ${O}/><ellipse cx="26" cy="36" rx="3.5" ry="4.5" fill="#ffd23f" ${O} stroke-width="1.5"/><ellipse cx="38" cy="36" rx="3.5" ry="4.5" fill="#ffd23f" ${O} stroke-width="1.5"/><path d="M30 44 L32 46 L34 44 M18 44 H8 M46 44 H56" fill="none" ${O} stroke-width="2"/>`,
    // Round 12: the Pirate's Hold, each mostly in its colour
    anchor: `<path d="M8 34 C10 50 22 57 32 57 C42 57 54 50 56 34 L49 38 C47 46 40 50 32 50 C24 50 17 46 15 38 Z" fill="${c}" ${O}/><path d="M29 14 H35 V52 H29 Z" fill="${c}" ${O}/><rect x="19" y="18" width="26" height="7" rx="3" fill="${c}" ${O}/><circle cx="32" cy="9" r="6" fill="none" stroke="#0d2228" stroke-width="8"/><circle cx="32" cy="9" r="6" fill="none" stroke="${c}" stroke-width="3.5"/>`,
    compass: `<circle cx="32" cy="32" r="25" fill="${c}" ${O}/><circle cx="32" cy="32" r="17" fill="#fff3d6" ${O} stroke-width="2"/><path d="M32 16 L37 32 H27 Z" fill="#e8383d" ${O} stroke-width="2"/><path d="M32 48 L37 32 H27 Z" fill="#fff" ${O} stroke-width="2"/><circle cx="32" cy="32" r="3" fill="#0d2228"/>`,
    map: `<path d="M6 14 L22 8 L42 14 L58 8 V50 L42 56 L22 50 L6 56 Z" fill="${c}" ${O}/><path d="M22 8 V50 M42 14 V56" fill="none" ${O} stroke-width="2"/><path d="M12 46 Q20 34 32 34" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="3 4"/><path d="M34 24 l8 8 m0 -8 l-8 8" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`,
    spyglass: `<path d="M6 46 L38 18 L46 28 L14 56 Z" fill="${c}" ${O}/><path d="M38 18 L50 8 L58 18 L46 28 Z" fill="${c}" ${O}/><path d="M20 36 L28 46" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/><ellipse cx="54" cy="13" rx="3" ry="6" transform="rotate(40 54 13)" fill="#9fd8ff" ${O} stroke-width="2"/>`,
    shell: `<path d="M32 54 L8 26 C12 10 52 10 56 26 Z" fill="${c}" ${O}/><path d="M32 54 L19 15 M32 54 L32 11 M32 54 L45 15 M32 54 L10 26 M32 54 L54 26" fill="none" ${O} stroke-width="2"/><path d="M24 52 H40 L36 60 H28 Z" fill="${c}" ${O}/>`,
    pearl: `<path d="M8 38 C10 14 54 14 56 38 Z" fill="#8996a8" ${O}/><circle cx="32" cy="34" r="14" fill="${c}" ${O}/><circle cx="27" cy="29" r="4" fill="#fff" opacity=".85"/><path d="M6 40 C10 58 54 58 58 40 Z" fill="#b8c4cc" ${O}/>`,
    bottle: `<path d="M26 8 H38 V16 C46 20 48 26 48 32 V54 C48 58 44 60 40 60 H24 C20 60 16 58 16 54 V32 C16 26 18 20 26 16 Z" fill="${c}" ${O}/><rect x="23" y="30" width="18" height="20" rx="2" fill="#fff3d6" ${O} stroke-width="2"/><path d="M27 37 H37 M27 43 H35" stroke="#8a7a5a" stroke-width="2"/><rect x="25" y="2" width="14" height="8" rx="2" fill="#a0703a" ${O} stroke-width="2"/>`,
    barrel: `<path d="M16 8 H48 C55 22 55 42 48 56 H16 C9 42 9 22 16 8 Z" fill="${c}" ${O}/><path d="M12 20 H52 M12 44 H52" stroke="#0d2228" stroke-width="5"/><path d="M26 10 C24 24 24 40 26 54" fill="none" stroke="#fff" stroke-width="3" opacity=".5"/>`,
    flag: `<path d="M14 6 V60" stroke="#0d2228" stroke-width="7" stroke-linecap="round"/><path d="M14 6 V60" stroke="#a0703a" stroke-width="3" stroke-linecap="round"/><path d="M16 10 C28 4 40 18 58 10 V36 C40 44 28 30 16 36 Z" fill="${c}" ${O}/><circle cx="35" cy="22" r="5" fill="#fff" ${O} stroke-width="2"/>`,
    cutlass: `<path d="M18 46 C34 38 48 22 56 6 C58 24 44 40 24 52 Z" fill="${c}" ${O}/><path d="M10 38 C14 46 18 50 26 54" fill="none" stroke="#0d2228" stroke-width="5" stroke-linecap="round"/><path d="M16 52 L8 60" stroke="#0d2228" stroke-width="8" stroke-linecap="round"/><path d="M16 52 L8 60" stroke="#a0703a" stroke-width="4" stroke-linecap="round"/>`,
    parrot: `<path d="M24 10 C40 6 48 18 46 30 C44 42 40 50 34 60 H28 C26 50 18 44 18 30 C18 20 18 12 24 10 Z" fill="${c}" ${O}/><path d="M44 16 C54 16 56 26 48 30 Z" fill="#f4c430" ${O} stroke-width="2"/><circle cx="36" cy="18" r="3.2" fill="#fff" ${O} stroke-width="1.5"/><path d="M22 30 C28 34 32 42 30 52" fill="none" ${O} stroke-width="2"/>`,
    chest: `<path d="M8 28 C8 12 56 12 56 28 Z" fill="${c}" ${O}/><rect x="8" y="28" width="48" height="26" rx="3" fill="${c}" ${O}/><path d="M18 16 V54 M46 16 V54" stroke="#0d2228" stroke-width="3"/><rect x="27" y="24" width="10" height="12" rx="2" fill="#f4c430" ${O} stroke-width="2"/>`,
    // Round 12: the Toy Chest
    teddy: `<circle cx="18" cy="13" r="7" fill="${c}" ${O}/><circle cx="46" cy="13" r="7" fill="${c}" ${O}/><ellipse cx="32" cy="48" rx="17" ry="13" fill="${c}" ${O}/><circle cx="32" cy="24" r="15" fill="${c}" ${O}/><ellipse cx="32" cy="30" rx="6.5" ry="4.5" fill="#fff3d6" ${O} stroke-width="2"/><circle cx="26" cy="21" r="2.4" fill="#0d2228"/><circle cx="38" cy="21" r="2.4" fill="#0d2228"/>`,
    ball: `<circle cx="32" cy="32" r="25" fill="${c}"/><path d="M8 26 C22 33 42 33 56 26 M11 44 C24 38 40 38 53 44" stroke="#fff" stroke-width="5" fill="none"/><circle cx="32" cy="32" r="25" fill="none" ${O}/>`,
    kite: `<path d="M32 4 L53 24 L32 48 L11 24 Z" fill="${c}" ${O}/><path d="M32 4 V48 M11 24 H53" fill="none" ${O} stroke-width="2"/><path d="M32 48 C26 53 38 56 30 62" fill="none" ${O} stroke-width="2"/><path d="M28 54 l-4 -3 M34 57 l4 -2" ${O} stroke-width="2"/>`,
    yoyo: `<path d="M32 30 V5" stroke="#0d2228" stroke-width="2.5"/><circle cx="32" cy="6" r="3" fill="#fff" ${O} stroke-width="1.5"/><circle cx="32" cy="40" r="20" fill="${c}" ${O}/><circle cx="32" cy="40" r="6" fill="#fff" ${O} stroke-width="2"/><path d="M18 34 A15 15 0 0 1 26 26" fill="none" stroke="#fff" stroke-width="3" opacity=".7" stroke-linecap="round"/>`,
    drum: `<path d="M10 22 V46 C10 56 54 56 54 46 V22 Z" fill="${c}" ${O}/><path d="M10 28 L21 50 L32 30 L43 52 L54 28" fill="none" stroke="#fff" stroke-width="3"/><ellipse cx="32" cy="22" rx="22" ry="8" fill="#fff3d6" ${O}/><path d="M42 4 L32 18 M54 8 L40 18" stroke="#0d2228" stroke-width="4" stroke-linecap="round"/>`,
    rocket: `<path d="M22 36 L11 52 L23 49 Z M42 36 L53 52 L41 49 Z" fill="${c}" ${O}/><path d="M26 48 L32 61 L38 48 Z" fill="#ff9a1f" ${O} stroke-width="2"/><path d="M32 3 C45 14 47 30 42 48 H22 C17 30 19 14 32 3 Z" fill="${c}" ${O}/><circle cx="32" cy="24" r="6" fill="#9fd8ff" ${O} stroke-width="2.5"/>`,
    duck: `<path d="M8 40 C8 32 18 30 24 34 C20 26 22 12 34 12 C45 12 49 22 45 30 C53 30 58 36 56 42 C54 54 44 58 32 58 C18 58 8 50 8 40 Z" fill="${c}" ${O}/><path d="M44 19 L58 22 L44 27 Z" fill="#ff9a1f" ${O} stroke-width="2"/><circle cx="37" cy="20" r="2.6" fill="#0d2228"/><path d="M20 44 C26 48 36 48 42 42" fill="none" ${O} stroke-width="2"/>`,
    block: `<path d="M10 18 L32 8 L54 18 V46 L32 56 L10 46 Z" fill="${c}" ${O}/><path d="M10 18 L32 28 L54 18 M32 28 V56" fill="none" ${O} stroke-width="2"/><path d="M16 42 L21 31 L26 42 M18 38 H24" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M38 31 V45 H45 C49 45 49 38 45 38 H38 M38 38 H44 C47 38 47 31 44 31 H38" stroke="#fff" stroke-width="2.5" fill="none"/>`,
    robot: `<path d="M32 14 V6" ${O}/><circle cx="32" cy="5" r="3.5" fill="#e8383d" ${O} stroke-width="1.5"/><rect x="15" y="13" width="34" height="25" rx="6" fill="${c}" ${O}/><rect x="19" y="40" width="26" height="19" rx="3" fill="${c}" ${O}/><circle cx="25" cy="25" r="4.5" fill="#fff" ${O} stroke-width="2"/><circle cx="39" cy="25" r="4.5" fill="#fff" ${O} stroke-width="2"/><path d="M26 33 H38 M27 48 H37" ${O} stroke-width="2"/>`,
    car: `<path d="M5 44 V35 L13 32 L22 19 H42 L51 32 L59 35 V44 Z" fill="${c}" ${O}/><path d="M25 23 H39 L44 31 H20 Z" fill="#9fd8ff" ${O} stroke-width="2"/><circle cx="18" cy="45" r="7" fill="#2b3546" ${O}/><circle cx="46" cy="45" r="7" fill="#2b3546" ${O}/><circle cx="18" cy="45" r="2.5" fill="#fff"/><circle cx="46" cy="45" r="2.5" fill="#fff"/>`,
    top: `<path d="M29 3 H35 V16 H29 Z" fill="#a0703a" ${O} stroke-width="2"/><path d="M7 28 C7 16 57 16 57 28 L32 61 Z" fill="${c}" ${O}/><path d="M9 30 H55" stroke="#fff" stroke-width="4" opacity=".75"/><path d="M15 39 H49" stroke="#0d2228" stroke-width="2.5"/>`,
    trumpet: `<rect x="16" y="18" width="5" height="10" fill="${c}" ${O} stroke-width="2"/><rect x="26" y="18" width="5" height="10" fill="${c}" ${O} stroke-width="2"/><path d="M4 27 H40 L59 12 V52 L40 37 H4 Z" fill="${c}" ${O}/><path d="M42 30 L56 20" stroke="#fff" stroke-width="3" opacity=".6" stroke-linecap="round"/>`,
  }[id] || '';
  return `<svg viewBox="0 0 64 64" class="mh-ic" aria-hidden="true">${body}</svg>`;
}
const NEUTRAL = '#efe6cf';

export function createView(ctx) {
  const { ui, players, me, init } = ctx, T = init.treasures, C = init.colours;
  const byPid = new Map(players.map(p => [p.pid, p])), watching = me == null, TH = init.theme || { id: 'royal', title: 'Memory Heist', door: 'VAULT' };
  const baseTitle = ctx.season === 'halloween' ? 'Haunted Heist' : 'Memory Heist';
  ui.innerHTML = `
    <div class="mh-top"><span class="mh-title">${baseTitle}</span><span class="clock"><b>--</b></span></div>
    <div class="mh-stage">
      <div class="mh-vault" style="--ar:${(init.w / init.h).toFixed(3)}"><div class="mh-door"><i></i><b>${esc(TH.door)}</b></div><div class="mh-grid" style="--w:${init.w};--h:${init.h}"></div></div>
      <div class="mh-quiz"><p class="mh-qn"></p><p class="mh-q"></p><div class="mh-opts"></div><div class="mh-map" style="--w:${init.w}" aria-hidden="true">${'<i></i>'.repeat(init.w * init.h)}</div></div>
      <div class="mh-slam" aria-hidden="true"><b>${esc(TH.door)}</b><span>SHUT!</span></div>
    </div>
    <div class="mh-players">${players.map(p => chip(p, '<em class="sc">0</em><strong class="delta"></strong>')).join('')}</div>
    <p class="mh-note"></p>`;
  const $ = s => ui.querySelector(s);
  ui.classList.toggle('watching', watching); ui.dataset.phase = 'study'; ui.classList.add('theme-' + TH.id);
  let lastLeft = null, streak = 0, scoredQ = -1;
  /** A number that floats up off an element and fades (the answer you tapped, your chip). */
  const pop = (el, text, cls = '') => { if (!el) return; const f = document.createElement('span'); f.className = 'mh-pop ' + cls; f.textContent = text; el.appendChild(f); setTimeout(() => f.remove(), 1300); };
  if (me != null) ui.querySelector(`.mh-players [data-pid="${me}"]`)?.classList.add('me');
  let phase = '', qi = -1, mine = null, gridFor = null;
  const face = p => `<i class="vface" style="--seat:${p.color}" title="${esc(p.name)}">${p.portrait ? `<img src="${p.portrait}" alt="">` : ''}</i>`;
  function drawVault(v) {
    const key = JSON.stringify(v); if (gridFor === key) return; gridFor = key;
    $('.mh-grid').innerHTML = v.map(([k, c], i) => `<div class="mh-cell" data-i="${i}" style="--d:${i * 40}ms" title="${esc(C[c].name + ' ' + T[k].name)}">${treasureSvg(T[k].id, C[c].hex)}<span>${esc(T[k].name)}</span></div>`).join('');
  }
  function drawQuestion(q) {
    $('.mh-qn').textContent = `Question ${qi + 1} of ${init.questions}`;
    $('.mh-q').textContent = q.text;
    $('.mh-opts').innerHTML = q.opts.map((o, i) => `<button class="mh-opt" data-i="${i}">${o.k != null ? treasureSvg(T[o.k].id, NEUTRAL) : o.c != null ? `<i class="sw" style="background:${C[o.c].hex}"></i>` : `<i class="num">${esc(o.t)}</i>`}<b>${o.n != null ? '' : esc(o.t)}</b><u class="who"></u></button>`).join('');
  }
  ui.addEventListener('click', e => {
    const b = e.target.closest('.mh-opt'); if (!b || watching || phase !== 'q' || mine != null) return;
    mine = +b.dataset.i; ctx.send('ans', mine); ctx.sfx('tap'); paintMine();
  });
  const paintMine = () => ui.querySelectorAll('.mh-opt').forEach((b, i) => b.classList.toggle('mine', i === mine));

  return {
    priv(d) { if (d.pick != null || phase !== 'q') { mine = d.pick; paintMine(); } },
    state(g) {
      if (g.phase !== phase) {
        if (g.phase === 'ans' && me != null) ctx.sfx(g.gain[me] ? 'good' : 'bad');
        if (g.phase === 'q' && phase === 'study') ctx.sfx('trap');
        if (g.phase === 'end') ctx.sfx('win');
      }
      if (g.phase === 'q' && phase === 'study') { const sl = $('.mh-slam'); sl.classList.remove('go'); void sl.offsetWidth; sl.classList.add('go'); }
      if (g.phase === 'study' && g.left !== lastLeft && g.left <= 3 && g.left > 0) { ctx.sfx('tap'); const c = $('.clock'); c.classList.remove('tick'); void c.offsetWidth; c.classList.add('tick'); }
      if (g.phase === 'q' && g.left !== lastLeft && g.left <= 3 && g.left > 0 && me != null && mine == null) ctx.sfx('tap');
      lastLeft = g.left;
      if (g.phase === 'ans' && scoredQ !== g.qi) {                                 // the reveal, once per question
        scoredQ = g.qi;
        if (me != null && g.gain[me] != null) {
          streak = g.gain[me] ? streak + 1 : 0;
          const btn = ui.querySelectorAll('.mh-opt')[g.picks[me] ?? -1];
          if (g.gain[me]) pop(btn, `+${g.gain[me]}`, g.gain[me] >= 9 ? 'fast' : '');
          if (g.gain[me] >= 9) pop(btn, 'QUICK!', 'tag');
        }
        ui.querySelectorAll('.mh-map i').forEach((c, i) => c.classList.toggle('on', i === g.spot));
      }
      if (g.qi != null && g.qi !== qi) { qi = g.qi; mine = null; drawQuestion(g.q); }
      phase = g.phase; ui.dataset.phase = g.phase;
      if (g.vault) drawVault(g.vault);
      $('.clock b').textContent = g.left;
      $('.clock').classList.toggle('hurry', g.phase === 'q' && g.left <= 3);
      $('.mh-title').textContent = g.phase === 'study' ? 'Remember everything!' : g.phase === 'end' ? `What was in ${TH.title.replace(/^The /, 'the ')}` : baseTitle;
      ui.classList.toggle('map-on', g.phase === 'ans' && g.spot != null);
      for (const p of players) {
        const r = ui.querySelector(`.mh-players [data-pid="${p.pid}"]`); r.querySelector('.sc').textContent = g.scores[p.pid];
        r.classList.toggle('in', g.phase === 'q' && g.in.includes(p.pid));
        const d = r.querySelector('.delta');
        d.textContent = g.phase === 'ans' ? (g.gain[p.pid] ? `+${g.gain[p.pid]}` : g.picks[p.pid] == null ? 'no answer' : 'miss') : g.phase === 'end' ? `${g.tally[p.pid]}/${init.questions} right` : '';
        d.className = 'delta ' + (g.phase === 'ans' ? (g.gain[p.pid] ? 'good' : 'bad') : '');
      }
      ui.querySelectorAll('.mh-opt').forEach((b, i) => {
        b.classList.toggle('right', g.phase === 'ans' && g.a === i);
        b.classList.toggle('wrong', g.phase === 'ans' && g.a !== i && mine === i);
        b.querySelector('.who').innerHTML = g.phase === 'ans' ? players.filter(p => g.picks[p.pid] === i).map(face).join('') : '';
      });
      const best = g.phase === 'end' ? Math.max(...players.map(p => g.scores[p.pid])) : 0, tops = players.filter(p => g.scores[p.pid] === best && best > 0);
      $('.mh-note').textContent = g.phase === 'study' ? `${TH.title}: the door shuts in a moment. Look closely!` : g.phase === 'q' ? (watching ? `${g.in.length} of ${players.length} answered` : mine == null ? 'Tap your answer. Faster = more points!' : 'Locked in!')
        : g.phase === 'ans' ? `Answer: ${g.q.opts[g.a].t}${streak >= 2 && me != null && g.gain[me] ? ` · ${streak} in a row!` : ''}`
        : tops.length === 1 && players.length > 1 ? `Master thief: ${tops[0].name}!` : tops.length && players.length === 1 ? `${g.tally[players[0].pid]} of ${init.questions} remembered!` : 'Thanks for the heist!';
      ui.classList.toggle('streak', g.phase === 'ans' && streak >= 2 && me != null && !!g.gain[me]);
    },
    dispose() {},
  };
}
