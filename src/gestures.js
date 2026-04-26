import { distance } from './mappings.js';

export class PinchMotionDetector {
  constructor({
    minDrop = 0.18,
    minInterval = 70,
    startVelocity = 0.012,
    endVelocity = 0.005
  } = {}) {
    this.minDrop = minDrop;
    this.minInterval = minInterval;
    this.startVelocity = startVelocity;
    this.endVelocity = endVelocity;
    this.lastTriggerAt = -Infinity;
    this.startRatio = null;
    this.minSeen = null;
    this.prevRatio = null;
    this.smoothedDelta = 0;
  }

  update(landmarks) {
    if (!landmarks) {
      this.startRatio = null;
      this.minSeen = null;
      this.prevRatio = null;
      this.smoothedDelta = 0;
      return { ratio: null, justClosed: false, closing: false };
    }
    const palm = distance(landmarks[0], landmarks[9]) || 1e-6;
    const ratio = distance(landmarks[4], landmarks[8]) / palm;

    let justClosed = false;
    if (this.prevRatio != null) {
      const delta = ratio - this.prevRatio;
      this.smoothedDelta = 0.5 * this.smoothedDelta + 0.5 * delta;

      if (this.startRatio === null) {
        if (this.smoothedDelta < -this.startVelocity) {
          this.startRatio = this.prevRatio;
          this.minSeen = ratio;
        }
      } else {
        if (ratio < this.minSeen) this.minSeen = ratio;
        if (this.smoothedDelta > -this.endVelocity) {
          const drop = this.startRatio - this.minSeen;
          if (drop >= this.minDrop) {
            const now = performance.now();
            if (now - this.lastTriggerAt > this.minInterval) {
              justClosed = true;
              this.lastTriggerAt = now;
            }
          }
          this.startRatio = null;
          this.minSeen = null;
        }
      }
    }
    this.prevRatio = ratio;

    return { ratio, justClosed, closing: this.startRatio !== null };
  }
}

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
