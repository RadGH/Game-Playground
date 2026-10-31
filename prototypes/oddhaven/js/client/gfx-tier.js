// Graphics tier: low or high, chosen by what the device says about itself. Phones start low (PLAN §3: low until a real
// phone's numbers come back), and a device that cannot hold its frame rate on high is dropped to low while playing.
// Pure, so a test can check the choice.

export const TIERS = {
  low: { name: 'Low', dpr: 1.25, fogNear: 110, fogFar: 430, shadows: false, propRadius: 250, lodNear: 200, lodFar: 480 },
  high: { name: 'High', dpr: 2, fogNear: 220, fogFar: 950, shadows: true, propRadius: 420, lodNear: 300, lodFar: 760 },
};

/** setting 'auto' | 'low' | 'high'; device { mobile, cores, memory }. */
export function chooseTier(setting, device = {}) {
  if (setting === 'low' || setting === 'high') return setting;
  if (device.mobile) return 'low';
  if ((device.cores ?? 8) <= 4 || (device.memory ?? 8) <= 4) return 'low';
  return 'high';
}

export function deviceFacts(nav = globalThis.navigator, win = globalThis) {
  const mobile = !!(nav?.userAgentData?.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(nav?.userAgent || '') || (win?.matchMedia?.('(pointer: coarse)').matches && !win?.matchMedia?.('(pointer: fine)').matches);
  return { mobile: !!mobile, cores: nav?.hardwareConcurrency, memory: nav?.deviceMemory };
}
