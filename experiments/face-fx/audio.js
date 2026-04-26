import * as Tone from 'tone';

export async function createFaceFx() {
  await Tone.start();

  const limiter = new Tone.Limiter(-1).toDestination();
  const reverb = new Tone.Reverb({ decay: 5, wet: 0 }).connect(limiter);
  await reverb.generate();
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 400, Q: 1.4 }).connect(reverb);
  const distortion = new Tone.Distortion(0.7).connect(filter);
  distortion.wet.value = 0;

  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 5,
    oscillator: { type: 'sine' },
    envelope: { attack: 2, decay: 0, sustain: 1, release: 3 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 2, decay: 0, sustain: 1, release: 3 }
  }).connect(distortion);
  synth.volume.value = -10;

  let active = false;

  return {
    start(notes = ['A2', 'C3', 'E3', 'A3']) {
      if (active) return;
      synth.triggerAttack(notes);
      active = true;
    },
    stop() {
      if (!active) return;
      synth.releaseAll();
      active = false;
    },
    setFilterHz(hz)    { filter.frequency.rampTo(hz, 0.08); },
    setReverbWet(w)    { reverb.wet.rampTo(w, 0.1); },
    setDistortionWet(w){ distortion.wet.rampTo(w, 0.1); }
  };
}
