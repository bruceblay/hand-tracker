import '../../src/nav.js';
import { createHandTracker, createFaceTracker } from '../../src/tracking.js';
import { createAudio } from './audio.js';
import { drawHands, drawHandsNeon, drawFaceNeon, fadeCanvas } from '../../src/draw.js';
import { quantizeToScale, midiToHz, OnePole, mirrorX } from '../../src/mappings.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start');
const ctx = canvas.getContext('2d');

const pitchSmoother = new OnePole(0.3);
const volSmoother = new OnePole(0.25);
const filterSmoother = new OnePole(0.2, 4000);
const resonanceSmoother = new OnePole(0.2, 1);

function setHud(text) { hud.textContent = text; hud.hidden = !text; }

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' },
    audio: false
  });
  video.srcObject = stream;
  await new Promise(r => video.onloadedmetadata = r);
  await video.play();
}

function pickHands(result) {
  const hands = (result.landmarks ?? []).map(mirrorX);
  hands.sort((a, b) => a[0].x - b[0].x);
  return { volume: hands[0] ?? null, pitch: hands[1] ?? null, all: hands };
}

async function run() {
  startBtn.hidden = true;
  setHud('requesting camera…');

  await startCamera();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setHud('loading hand model…');
  const tracker = await createHandTracker({ numHands: 2 });
  const faceTracker = await createFaceTracker();

  setHud('starting audio…');
  const audio = await createAudio();

  setHud('right hand: y = pitch, x = resonance. left hand: y = volume, x = filter cutoff.');
  audio.setVolume01(0.4);

  const controls = document.getElementById('controls');
  const presetSelect = document.getElementById('preset-select');
  controls.hidden = false;
  presetSelect.addEventListener('change', () => {
    audio.setPreset(presetSelect.value);
  });

  let pitchMode = 'stepped';
  const modeRadios = document.querySelectorAll('input[name="pitch-mode"]');
  modeRadios.forEach(r => r.addEventListener('change', () => {
    if (r.checked) pitchMode = r.value;
  }));

  const bindSlider = (id, valId, format, apply) => {
    const input = document.getElementById(id);
    const val = document.getElementById(valId);
    const update = () => {
      const n = parseFloat(input.value);
      val.textContent = format(n);
      apply(n);
    };
    input.addEventListener('input', update);
    update();
  };
  bindSlider('reverb-wet', 'reverb-wet-val', n => n.toFixed(2), n => audio.setReverbWet(n));
  bindSlider('reverb-decay', 'reverb-decay-val', n => `${n.toFixed(1)}s`, n => audio.setReverbDecay(n));
  bindSlider('delay-wet', 'delay-wet-val', n => n.toFixed(2), n => audio.setDelayWet(n));
  bindSlider('delay-time', 'delay-time-val', n => `${Math.round(n * 1000)}ms`, n => audio.setDelayTime(n));
  bindSlider('delay-feedback', 'delay-feedback-val', n => n.toFixed(2), n => audio.setDelayFeedback(n));

  const stage = document.getElementById('stage');
  const initialTrippy = new URLSearchParams(window.location.search).get('isTrippy') === 'true';
  let displayMode = initialTrippy ? 'trippy' : 'normal';
  const displayRadios = document.querySelectorAll('input[name="display-mode"]');
  displayRadios.forEach(r => {
    r.checked = r.value === displayMode;
    r.addEventListener('change', () => {
      if (!r.checked) return;
      displayMode = r.value;
      stage.classList.toggle('trippy', displayMode === 'trippy');
    });
  });
  stage.classList.toggle('trippy', displayMode === 'trippy');

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        const result = tracker.detect(video, ts);
        lastTs = ts;
        const { pitch, volume, all } = pickHands(result);

        if (displayMode === 'trippy') {
          const faceResult = faceTracker.detect(video, ts);
          const faceLandmarks = (faceResult.faceLandmarks?.[0] ?? null);
          const faceMirrored = faceLandmarks ? mirrorX(faceLandmarks) : null;
          const hue = (ts / 18) % 360;
          fadeCanvas(ctx, 0.09);
          drawFaceNeon(ctx, faceMirrored, { width: canvas.width, height: canvas.height, hue: (hue + 180) % 360 });
          drawHandsNeon(ctx, all, { width: canvas.width, height: canvas.height, hue });
        } else {
          drawHands(ctx, all, { width: canvas.width, height: canvas.height });
        }

        if (pitch) {
          const tip = pitch[8];
          const p01 = pitchSmoother.process(Math.max(0, Math.min(1, 1 - tip.y)));
          const midi = pitchMode === 'continuous' ? 48 + p01 * 34 : quantizeToScale(p01);
          audio.setPitchHz(midiToHz(midi));
          const x = Math.max(0, Math.min(1, tip.x));
          const q = resonanceSmoother.process(x * 12);
          audio.setFilterQ(q);
          audio.noteOn();
        } else {
          audio.noteOff();
        }

        if (volume) {
          const tip = volume[8];
          const v01 = volSmoother.process(Math.max(0, Math.min(1, 1 - tip.y)));
          audio.setVolume01(v01);
          const x = Math.max(0, Math.min(1, tip.x));
          const cutoff = filterSmoother.process(200 * Math.pow(40, x));
          audio.setFilterHz(cutoff);
        }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

startBtn.addEventListener('click', () => {
  run().catch(err => {
    console.error(err);
    setHud(`error: ${err.message}`);
    startBtn.hidden = false;
  });
});
