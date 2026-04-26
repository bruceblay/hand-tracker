import { distance } from './mappings.js';

export class PinchDetector {
  constructor({ closeThreshold = 0.45, openThreshold = 0.7, minInterval = 0 } = {}) {
    this.closed = false;
    this.closeThreshold = closeThreshold;
    this.openThreshold = openThreshold;
    this.minInterval = minInterval;
    this.lastClosedAt = -Infinity;
  }

  update(landmarks) {
    if (!landmarks) {
      const justOpened = this.closed;
      this.closed = false;
      return { state: 'idle', ratio: null, justClosed: false, justOpened };
    }
    const palm = distance(landmarks[0], landmarks[9]) || 1e-6;
    const pinch = distance(landmarks[4], landmarks[8]);
    const ratio = pinch / palm;

    let justClosed = false, justOpened = false;
    if (!this.closed && ratio < this.closeThreshold) {
      this.closed = true;
      const now = performance.now();
      if (now - this.lastClosedAt > this.minInterval) {
        justClosed = true;
        this.lastClosedAt = now;
      }
    } else if (this.closed && ratio > this.openThreshold) {
      this.closed = false;
      justOpened = true;
    }
    return { state: this.closed ? 'closed' : 'open', ratio, justClosed, justOpened };
  }
}
