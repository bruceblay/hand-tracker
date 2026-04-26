import * as Tone from 'tone';

export async function createAudio() {
  await Tone.start();

  const filter = new Tone.Filter({ type: 'lowpass', frequency: 4000, Q: 1 }).toDestination();
  const synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.05, decay: 0.1, sustain: 1.0, release: 0.3 }
  }).connect(filter);

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
      const db = v <= 0.001 ? -60 : 20 * Math.log10(v);
      synth.volume.rampTo(db, 0.05);
    },
    setFilterHz(hz) {
      filter.frequency.rampTo(hz, 0.05);
    },
    setFilterQ(q) {
      filter.Q.rampTo(q, 0.05);
    }
  };
}
