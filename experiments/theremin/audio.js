import * as Tone from 'tone';

const PRESETS = {
  classic: { gain: 1.0,  oscillator: { type: 'triangle' }, envelope: { attack: 0.05, decay: 0.1, sustain: 1.0, release: 0.3 } },
  smooth:  { gain: 1.0,  oscillator: { type: 'sine' },     envelope: { attack: 0.2,  decay: 0.1, sustain: 1.0, release: 0.5 } },
  lead:    { gain: 0.7,  oscillator: { type: 'sawtooth' }, envelope: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.2 } },
  buzz:    { gain: 0.55, oscillator: { type: 'square' },   envelope: { attack: 0.005, decay: 0.1, sustain: 1.0, release: 0.1 } },
  pulse:   { gain: 0.5,  oscillator: { type: 'pulse', width: 0.25 }, envelope: { attack: 0.05, decay: 0.1, sustain: 1.0, release: 0.2 } },
  fatSaw:  {
    gain: 0.55,
    oscillator: { type: 'fatsawtooth', count: 5, spread: 60 },
    envelope: { attack: 0.01, decay: 0.1, sustain: 1.0, release: 0.3 }
  },
  wobble:  {
    gain: 0.55,
    oscillator: { type: 'pwm', modulationFrequency: 4 },
    envelope: { attack: 0.05, decay: 0.1, sustain: 1.0, release: 0.3 }
  },
  amRing:  {
    gain: 0.7,
    oscillator: { type: 'amsquare', modulationType: 'sine', harmonicity: 5 },
    envelope: { attack: 0.05, decay: 0.1, sustain: 1.0, release: 0.4 }
  },
  glass:   {
    gain: 0.7,
    oscillator: { type: 'fmtriangle', modulationType: 'sine', harmonicity: 1.5, modulationIndex: 3 },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.8, release: 0.8 }
  },
  fm:      {
    gain: 0.55,
    oscillator: { type: 'fmsquare', modulationType: 'sine', harmonicity: 7, modulationIndex: 20 },
    envelope: { attack: 0.002, decay: 0.6, sustain: 0.5, release: 1.5 }
  }
};

export async function createAudio() {
  await Tone.start();

  const limiter = new Tone.Limiter(-1).toDestination();
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 1 }).connect(limiter);
  const presetGain = new Tone.Gain(PRESETS.classic.gain).connect(filter);
  const synth = new Tone.Synth({
    oscillator: PRESETS.classic.oscillator,
    envelope: PRESETS.classic.envelope
  }).connect(presetGain);

  synth.volume.value = -Infinity;
  let active = false;

  return {
    noteOn() {
      if (active) return;
      synth.triggerAttack(220);
      active = true;
    },
    noteOff() {
      if (!active) return;
      synth.triggerRelease();
      active = false;
    },
    setPitchHz(hz) {
      synth.frequency.rampTo(hz, 0.03);
    },
    setVolume01(v) {
      const VOLUME_CAP = 0.3;
      const scaled = v * VOLUME_CAP;
      const db = scaled <= 0.001 ? -60 : 20 * Math.log10(scaled);
      synth.volume.rampTo(db, 0.05);
    },
    setFilterHz(hz) {
      filter.frequency.rampTo(hz, 0.05);
    },
    setFilterQ(q) {
      filter.Q.rampTo(q, 0.05);
    },
    setPreset(name) {
      const p = PRESETS[name];
      if (!p) return;
      synth.set({ oscillator: p.oscillator, envelope: p.envelope });
      presetGain.gain.rampTo(p.gain ?? 1, 0.05);
    }
  };
}
