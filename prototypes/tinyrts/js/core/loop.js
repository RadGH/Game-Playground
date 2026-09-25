// Fixed-step game loop: the simulation always advances in 1/30 s steps (so physics behaves the
// same at any frame rate), while drawing happens every animation frame with an interpolation
// factor. Speed multiplier supports pause and fast-forward.

export const TICK_RATE = 30;
export const TICK_DT = 1 / TICK_RATE;

export class Loop {
  constructor({ tick, render, maxStepsPerFrame = 8 }) {
    this.tick = tick;
    this.render = render;
    this.maxSteps = maxStepsPerFrame;
    this.acc = 0;
    this.last = 0;
    this.speed = 1;       // 0 = paused
    this.running = false;
    this.frame = this.frame.bind(this);
    this.fps = 0; this._fpsAcc = 0; this._fpsN = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() { this.running = false; }

  frame(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25; // tab was in the background — don't try to catch up forever
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 0.5) { this.fps = Math.round(this._fpsN / this._fpsAcc); this._fpsAcc = 0; this._fpsN = 0; }

    this.acc += dt * this.speed;
    let steps = 0;
    while (this.acc >= TICK_DT && steps < this.maxSteps) {
      this.tick(TICK_DT);
      this.acc -= TICK_DT;
      steps++;
    }
    if (steps >= this.maxSteps) this.acc = 0; // too slow to keep up: drop time instead of spiraling
    this.render(this.acc / TICK_DT, dt);
    requestAnimationFrame(this.frame);
  }
}
