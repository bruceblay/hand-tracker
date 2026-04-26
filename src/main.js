import { createHandTracker } from './tracking.js';
import { createAudio } from './audio.js';
import { drawHands } from './draw.js';
import { quantizeToScale, midiToHz, distance, OnePole, mirrorX } from './mappings.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start');
const ctx = canvas.getContext('2d');

const pitchSmoother = new OnePole(0.3);
const volSmoother = new OnePole(0.25);
const filterSmoother = new OnePole(0.2, 4000);

function setHud(text) { hud.textContent = text; }

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
  return { pitch: hands[0] ?? null, filter: hands[1] ?? null, all: hands };
}

async function run() {
  startBtn.hidden = true;
  setHud('requesting camera…');

  await startCamera();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setHud('loading hand model…');
  const tracker = await createHandTracker({ numHands: 2 });

  setHud('starting audio…');
  const audio = await createAudio();

  setHud('left side of screen = pitch/volume. right side = pinch to open filter.');

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        const result = tracker.detect(video, ts);
        lastTs = ts;
        const { pitch, filter, all } = pickHands(result);

        drawHands(ctx, all, { width: canvas.width, height: canvas.height });

        if (pitch) {
          const tip = pitch[8];
          const p01 = pitchSmoother.process(Math.max(0, Math.min(1, tip.x)));
          const v01 = volSmoother.process(Math.max(0, Math.min(1, 1 - tip.y)));
          audio.setPitchHz(midiToHz(quantizeToScale(p01)));
          audio.setVolume01(v01);
          audio.noteOn();
        } else {
          audio.noteOff();
        }

        if (filter) {
          const pinch = distance(filter[4], filter[8]);
          const cutoff = filterSmoother.process(200 + Math.min(1, pinch * 4) * 7800);
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

setHud('click to start');
