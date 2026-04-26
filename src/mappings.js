const C_MINOR_PENTATONIC = [0, 3, 5, 7, 10];
const ROOT_MIDI = 48;

export function quantizeToScale(value01, { scale = C_MINOR_PENTATONIC, root = ROOT_MIDI, octaves = 3 } = {}) {
  const total = scale.length * octaves;
  const idx = Math.max(0, Math.min(total - 1, Math.floor(value01 * total)));
  const octave = Math.floor(idx / scale.length);
  return root + scale[idx % scale.length] + 12 * octave;
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class OnePole {
  constructor(coeff = 0.25, init = 0) { this.y = init; this.coeff = coeff; }
  process(x) { return this.y = this.y + this.coeff * (x - this.y); }
}

export function mirrorX(landmarks) {
  return landmarks.map(p => ({ x: 1 - p.x, y: p.y, z: p.z }));
}
