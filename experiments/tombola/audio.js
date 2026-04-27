import * as Tone from 'tone';

const NOTES = ['C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5', 'Eb5', 'F5', 'G5', 'Bb5'];
const COLORS = [
  '#7cf', '#fc7', '#cf7', '#f7c', '#c7f',
  '#7fc', '#fc9', '#9cf', '#f9c', '#cf9'
];

export async function createAudio() {
  await Tone.start();

  const limiter = new Tone.Limiter(-1).toDestination();
  const reverb = new Tone.Reverb({ decay: 2, wet: 0.25 }).connect(limiter);
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.4 }
  }).connect(reverb);
  synth.volume.value = -10;

  function play(note, velocity = 1) {
    const v = Math.max(0.1, Math.min(1, velocity));
    synth.triggerAttackRelease(note, '8n', undefined, v);
  }

  function pickNote() {
    const i = Math.floor(Math.random() * NOTES.length);
    return { note: NOTES[i], color: COLORS[i] };
  }

  return { play, pickNote };
}
