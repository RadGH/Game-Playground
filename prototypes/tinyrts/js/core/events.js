// Tiny event bus. The simulation emits events (shot fired, building lost, wave started) and the
// browser side (audio, alerts, particles) listens. The sim never calls into the UI directly.

export class Events {
  constructor() { this.handlers = new Map(); this.queue = []; }

  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    return () => this.handlers.get(type).delete(fn);
  }

  // Emit right away.
  emit(type, data) {
    const set = this.handlers.get(type);
    if (set) for (const fn of set) fn(data);
    const any = this.handlers.get('*');
    if (any) for (const fn of any) fn(type, data);
  }
}
