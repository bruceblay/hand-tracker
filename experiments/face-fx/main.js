import { createFaceTracker } from '../../src/tracking.js';
import { drawFace } from '../../src/draw.js';
import { OnePole, mirrorX } from '../../src/mappings.js';
import { createFaceFx } from './audio.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start');
const panel = document.getElementById('panel');
const ctx = canvas.getContext('2d');

const fillEls = {
  jawOpen:    panel.querySelector('[data-id="jawOpen"] .panel-fill'),
  browInner:  panel.querySelector('[data-id="browInner"] .panel-fill'),
  smile:      panel.querySelector('[data-id="smile"] .panel-fill'),
};

const jawSmoother = new OnePole(0.3);
const browSmoother = new OnePole(0.25);
const smileSmoother = new OnePole(0.25);

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

function getBlend(categories, name) {
  return categories.find(c => c.categoryName === name)?.score ?? 0;
}

function setBar(key, value) {
  fillEls[key].style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
}

async function run() {
  startBtn.hidden = true;
  setHud('requesting camera…');

  await startCamera();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setHud('loading face model (~5MB)…');
  const tracker = await createFaceTracker();

  setHud('starting audio…');
  const audio = await createFaceFx();
  audio.start();

  setHud('open mouth = filter. brows up = reverb. smile = distortion.');
  panel.hidden = false;

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        const result = tracker.detect(video, ts);
        lastTs = ts;

        const landmarks = result.faceLandmarks?.[0];
        const mirrored = landmarks ? mirrorX(landmarks) : null;
        drawFace(ctx, mirrored, { width: canvas.width, height: canvas.height });

        const cats = result.faceBlendshapes?.[0]?.categories ?? [];
        const jaw    = jawSmoother.process(getBlend(cats, 'jawOpen'));
        const brow   = browSmoother.process(getBlend(cats, 'browInnerUp'));
        const smile  = smileSmoother.process(
          (getBlend(cats, 'mouthSmileLeft') + getBlend(cats, 'mouthSmileRight')) / 2
        );

        audio.setFilterHz(200 * Math.pow(40, jaw));
        audio.setReverbWet(brow);
        audio.setDistortionWet(smile);

        setBar('jawOpen', jaw);
        setBar('browInner', brow);
        setBar('smile', smile);
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
    panel.hidden = true;
  });
});
