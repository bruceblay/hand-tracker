import * as Tone from 'tone';

export async function createDrums() {
  await Tone.start();

  const compressor = new Tone.Compressor(-12, 4).toDestination();

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
  }).connect(compressor);

  const snareNoiseFilter = new Tone.Filter({ frequency: 1800, type: 'highpass', Q: 0.8 }).connect(compressor);
  const snareBodyFilter = new Tone.Filter({ frequency: 400, type: 'lowpass', Q: 1 }).connect(compressor);
  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0 }
  }).connect(snareNoiseFilter);
  const snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.04,
    octaves: 2,
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.07, sustain: 0, release: 0.05 }
  }).connect(snareBodyFilter);
  snareBody.volume.value = -6;

  const hihat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5
  }).connect(compressor);
  hihat.volume.value = -12;

  const crash = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.6, release: 0.5 },
    harmonicity: 8.5,
    modulationIndex: 40,
    resonance: 5000,
    octaves: 2
  }).connect(compressor);
  crash.volume.value = -16;

  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.4, release: 0.3 },
    harmonicity: 3.5,
    modulationIndex: 22,
    resonance: 3500,
    octaves: 1.5
  }).connect(compressor);
  ride.volume.value = -14;

  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.03,
    octaves: 4,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.2 }
  }).connect(compressor);
  tom.volume.value = -8;

  const clamp = (v) => Math.max(0.15, Math.min(1, v));

  return {
    kick(v = 1) {
      kick.triggerAttackRelease('C2', '8n', undefined, clamp(v));
    },
    snare(v = 1) {
      const c = clamp(v);
      snareNoise.triggerAttackRelease('8n', undefined, c);
      snareBody.triggerAttackRelease(160, '16n', undefined, c * 0.55);
    },
    hihat(v = 1) {
      hihat.triggerAttackRelease(200, '32n', undefined, clamp(v));
    },
    crash(v = 1) {
      crash.triggerAttackRelease(250, '2n', undefined, clamp(v));
    },
    ride(v = 1) {
      ride.triggerAttackRelease(380, '4n', undefined, clamp(v));
    },
    tom(v = 1) {
      tom.triggerAttackRelease('A2', '8n', undefined, clamp(v));
    }
  };
}
