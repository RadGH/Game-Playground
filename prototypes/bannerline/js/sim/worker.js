// The match clock worker (PLAN §11.3). Browsers stop requestAnimationFrame and throttle main-thread
// timers in hidden tabs, which would freeze a lockstep match for everyone. A dedicated Worker's
// timers keep running, so while the tab is hidden this worker pulses the main thread every tick and
// js/net/netclock.js advances the lockstep from those pulses (inputs keep flowing, turns keep running).
//
// Deviation from PLAN §11.3 (noted in docs/online.md): the SIM stays on the main thread. The view
// reads sim.state synchronously every frame; moving the sim into the worker would mean streaming the
// whole state across every tick. The worker owns the CLOCK, which is what hidden tabs needed.
// This file is not imported by the sim (tests/sim-purity.test.js knows it is the clock, not the sim).
//
//   main: const w = new Worker(new URL('./sim/worker.js', import.meta.url), { type: 'module' });
//         w.postMessage({ cmd: 'start', ms: 50 }); w.onmessage = e => { if (e.data.t === 'pulse') clock.pump(); };
//         w.postMessage({ cmd: 'stop' });

let timer = 0;
self.onmessage = e => {
  const m = e.data || {};
  if (m.cmd === 'start') { clearInterval(timer); timer = setInterval(() => self.postMessage({ t: 'pulse' }), Math.max(5, m.ms || 50)); }
  else if (m.cmd === 'stop') { clearInterval(timer); timer = 0; }
};
