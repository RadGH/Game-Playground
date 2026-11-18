// The starter frame each maker lends a new pilot (the first-mission choice before the hangar opens in round 2):
// that maker's first part for every slot, two of its arm weapons and a shoulder launcher. Data-driven from parts.json.
const SKIP_ARM = ['shield', 'repair', 'laser-blade', 'pile', 'saw'];
const SHOULDER_OK = ['missile-pod', 'swarm-pod', 'mortar'];

export function starterBuild(PARTS, maker) {
  const first = slot => PARTS.parts.find(p => p.maker === maker && p.slot === slot && (p.tier || 1) === 1 && (slot !== 'legs' || p.type === 'biped'))?.id
    || PARTS.parts.find(p => p.maker === maker && p.slot === slot)?.id;
  const arms = PARTS.parts.filter(p => p.slot === 'weapon' && p.mount === 'arm' && p.hand === 'one' && !SKIP_ARM.includes(p.kind));
  const shoulders = PARTS.parts.filter(p => p.slot === 'weapon' && p.mount === 'shoulder' && SHOULDER_OK.includes(p.kind));
  const own = l => l.filter(p => p.maker === maker).concat(l.filter(p => p.maker !== maker));
  return { head: first('head'), core: first('core'), arms: first('arms'), legs: first('legs'), booster: first('booster'), generator: first('generator'), cooling: first('cooling'), cpu: first('cpu'),
    weapons: [own(arms)[0].id, own(arms)[1].id, own(shoulders)[0].id, null], paint: 'maker' };
}
