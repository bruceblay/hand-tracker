import * as Tone from 'tone';

export async function createTetrisMusic() {
  await Tone.start();

  const limiter = new Tone.Limiter(-1).toDestination();

  const lead = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.005, decay: 0.08, sustain: 0.25, release: 0.05 }
  }).connect(limiter);
  lead.volume.value = -16;

  const bass = new Tone.MonoSynth({
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.1 },
    filter: { Q: 2, type: 'lowpass', rolloff: -12 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2, baseFrequency: 200, octaves: 2 }
  }).connect(limiter);
  bass.volume.value = -18;

  Tone.Transport.bpm.value = 140;

  const melody = [
    { time: '0:0:0', note: 'E5',  dur: '4n'  },
    { time: '0:1:0', note: 'B4',  dur: '8n'  },
    { time: '0:1:2', note: 'C5',  dur: '8n'  },
    { time: '0:2:0', note: 'D5',  dur: '4n'  },
    { time: '0:3:0', note: 'C5',  dur: '8n'  },
    { time: '0:3:2', note: 'B4',  dur: '8n'  },

    { time: '1:0:0', note: 'A4',  dur: '4n'  },
    { time: '1:1:0', note: 'A4',  dur: '8n'  },
    { time: '1:1:2', note: 'C5',  dur: '8n'  },
    { time: '1:2:0', note: 'E5',  dur: '4n'  },
    { time: '1:3:0', note: 'D5',  dur: '8n'  },
    { time: '1:3:2', note: 'C5',  dur: '8n'  },

    { time: '2:0:0', note: 'B4',  dur: '4n.' },
    { time: '2:1:2', note: 'C5',  dur: '8n'  },
    { time: '2:2:0', note: 'D5',  dur: '4n'  },
    { time: '2:3:0', note: 'E5',  dur: '4n'  },

    { time: '3:0:0', note: 'C5',  dur: '4n'  },
    { time: '3:1:0', note: 'A4',  dur: '4n'  },
    { time: '3:2:0', note: 'A4',  dur: '2n'  },

    { time: '4:0:0', note: 'D5',  dur: '4n'  },
    { time: '4:1:0', note: 'F5',  dur: '8n'  },
    { time: '4:1:2', note: 'A5',  dur: '4n'  },
    { time: '4:2:2', note: 'G5',  dur: '8n'  },
    { time: '4:3:0', note: 'F5',  dur: '4n'  },

    { time: '5:0:0', note: 'E5',  dur: '4n.' },
    { time: '5:1:2', note: 'C5',  dur: '8n'  },
    { time: '5:2:0', note: 'E5',  dur: '4n'  },
    { time: '5:3:0', note: 'D5',  dur: '8n'  },
    { time: '5:3:2', note: 'C5',  dur: '8n'  },

    { time: '6:0:0', note: 'B4',  dur: '4n'  },
    { time: '6:1:0', note: 'B4',  dur: '8n'  },
    { time: '6:1:2', note: 'C5',  dur: '8n'  },
    { time: '6:2:0', note: 'D5',  dur: '4n'  },
    { time: '6:3:0', note: 'E5',  dur: '4n'  },

    { time: '7:0:0', note: 'C5',  dur: '4n'  },
    { time: '7:1:0', note: 'A4',  dur: '4n'  },
    { time: '7:2:0', note: 'A4',  dur: '2n'  }
  ];

  const bassline = [
    { time: '0:0:0', note: 'E2', dur: '4n' }, { time: '0:2:0', note: 'B2', dur: '4n' },
    { time: '1:0:0', note: 'A2', dur: '4n' }, { time: '1:2:0', note: 'E2', dur: '4n' },
    { time: '2:0:0', note: 'G2', dur: '4n' }, { time: '2:2:0', note: 'D2', dur: '4n' },
    { time: '3:0:0', note: 'A2', dur: '4n' }, { time: '3:2:0', note: 'E2', dur: '4n' },
    { time: '4:0:0', note: 'D2', dur: '4n' }, { time: '4:2:0', note: 'A2', dur: '4n' },
    { time: '5:0:0', note: 'C3', dur: '4n' }, { time: '5:2:0', note: 'G2', dur: '4n' },
    { time: '6:0:0', note: 'B2', dur: '4n' }, { time: '6:2:0', note: 'E2', dur: '4n' },
    { time: '7:0:0', note: 'A2', dur: '4n' }, { time: '7:2:0', note: 'E2', dur: '4n' }
  ];

  const leadPart = new Tone.Part((time, ev) => {
    lead.triggerAttackRelease(ev.note, ev.dur, time);
  }, melody);
  leadPart.loop = true;
  leadPart.loopEnd = '8m';

  const bassPart = new Tone.Part((time, ev) => {
    bass.triggerAttackRelease(ev.note, ev.dur, time);
  }, bassline);
  bassPart.loop = true;
  bassPart.loopEnd = '8m';

  let started = false;

  return {
    start() {
      if (started) return;
      Tone.Transport.position = '0:0:0';
      leadPart.start(0);
      bassPart.start(0);
      Tone.Transport.start();
      started = true;
    },
    stop() {
      if (!started) return;
      leadPart.stop();
      bassPart.stop();
      Tone.Transport.stop();
      started = false;
    },
    setMuted(m) {
      Tone.Destination.mute = m;
    }
  };
}
