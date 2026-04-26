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

  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 }
  }).connect(compressor);

  const snareTone = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 2,
    envelope: { attack: 0.001, decay: 0.05, sustain: 0 }
  }).connect(compressor);
  snareTone.volume.value = -8;

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

  const clamp = (v) => Math.max(0.1, Math.min(1, v));

  return {
    kick(vel = 1) {
      kick.triggerAttackRelease('C2', '8n', undefined, clamp(vel));
    },
    snare(vel = 1) {
      const v = clamp(vel);
      snareNoise.triggerAttackRelease('16n', undefined, v);
      snareTone.triggerAttackRelease('200', '32n', undefined, v * 0.6);
    },
    hihat(vel = 1) {
      hihat.triggerAttackRelease(200, '32n', undefined, clamp(vel));
    },
    crash(vel = 1) {
      crash.triggerAttackRelease(250, '2n', undefined, clamp(vel));
    }
  };
}
