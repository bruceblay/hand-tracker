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
  pucker:     panel.querySelector('[data-id="pucker"] .panel-fill'),
  squint:     panel.querySelector('[data-id="squint"] .panel-fill'),
  pan:        panel.querySelector('[data-id="pan"] .panel-fill'),
};

const jawSmoother = new OnePole(0.3);
const browSmoother = new OnePole(0.25);
const smileSmoother = new OnePole(0.25);
const puckerSmoother = new OnePole(0.25);
const squintSmoother = new OnePole(0.25);
const panSmoother = new OnePole(0.3);

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

function getVideoDisplayBounds() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!vw || !vh || !cw || !ch) {
    return { width: cw, height: ch, offsetX: 0, offsetY: 0 };
  }
  const videoAspect = vw / vh;
  const canvasAspect = cw / ch;
  if (videoAspect > canvasAspect) {
    const height = ch;
    const width = ch * videoAspect;
    return { width, height, offsetX: (cw - width) / 2, offsetY: 0 };
  } else {
    const width = cw;
    const height = cw / videoAspect;
    return { width, height, offsetX: 0, offsetY: (ch - height) / 2 };
  }
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

  setHud('jaw=filter, brows=reverb, smile=distortion, pucker=vibrato, squint=bitcrush, mouth L/R=pan.');
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
        drawFace(ctx, mirrored, getVideoDisplayBounds());

        const cats = result.faceBlendshapes?.[0]?.categories ?? [];
        const jaw    = jawSmoother.process(Math.min(1, getBlend(cats, 'jawOpen') / 0.75));
        const brow   = browSmoother.process(getBlend(cats, 'browInnerUp'));
        const smile  = smileSmoother.process(
          (getBlend(cats, 'mouthSmileLeft') + getBlend(cats, 'mouthSmileRight')) / 2
        );
        const rawPucker = (getBlend(cats, 'mouthFunnel') + getBlend(cats, 'mouthPucker')) / 2;
        const pucker = puckerSmoother.process(Math.max(0, Math.min(1, (rawPucker - 0.35) / 0.25)));
        const rawSquint = (getBlend(cats, 'eyeSquintLeft') + getBlend(cats, 'eyeSquintRight')) / 2;
        const squint = squintSmoother.process(Math.max(0, (rawSquint - 0.45) / 0.55));
        const pan    = panSmoother.process(
          getBlend(cats, 'mouthRight') - getBlend(cats, 'mouthLeft')
        );

        audio.setFilterHz(200 * Math.pow(40, jaw));
        audio.setReverbWet(brow);
        audio.setDistortionWet(smile);
        audio.setVibratoWet(pucker);
        audio.setBitCrushWet(squint);
        audio.setPan(pan);

        setBar('jawOpen', jaw);
        setBar('browInner', brow);
        setBar('smile', smile);
        setBar('pucker', pucker);
        setBar('squint', squint);
        setBar('pan', (pan + 1) / 2);
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
