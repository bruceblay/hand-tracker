import '../../src/nav.js';
import { createFaceTracker } from '../../src/tracking.js';
import { drawFace } from '../../src/draw.js';
import { mirrorX } from '../../src/mappings.js';
import { createDrums } from './audio.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');
const hud = document.getElementById('hud');
const panel = document.getElementById('panel');
const ctx = overlay.getContext('2d');

function getBlend(cats, name) {
  return cats.find(c => c.categoryName === name)?.score ?? 0;
}

const TRIGGERS = [
  {
    id: 'kick',
    value: c => getBlend(c, 'jawOpen'),
    triggerAt: 0.4,
    releaseAt: 0.2
  },
  {
    id: 'snare',
    value: c => (getBlend(c, 'mouthSmileLeft') + getBlend(c, 'mouthSmileRight')) / 2,
    triggerAt: 0.4,
    releaseAt: 0.2
  },
  {
    id: 'hihat',
    value: c => getBlend(c, 'browInnerUp'),
    triggerAt: 0.4,
    releaseAt: 0.2
  },
  {
    id: 'tom',
    value: c => (getBlend(c, 'mouthFunnel') + getBlend(c, 'mouthPucker')) / 2,
    triggerAt: 0.4,
    releaseAt: 0.2
  },
  {
    id: 'crash',
    value: c => Math.max(0, getBlend(c, 'eyeBlinkLeft') - getBlend(c, 'eyeBlinkRight')),
    triggerAt: 0.5,
    releaseAt: 0.2
  },
  {
    id: 'ride',
    value: c => Math.max(0, getBlend(c, 'eyeBlinkRight') - getBlend(c, 'eyeBlinkLeft')),
    triggerAt: 0.35,
    releaseAt: 0.15
  }
];

const state = Object.fromEntries(TRIGGERS.map(t => [t.id, { armed: true, lastFire: 0 }]));
const rowEls = {};
const fillEls = {};
const threshEls = {};

for (const t of TRIGGERS) {
  const row = panel.querySelector(`[data-id="${t.id}"]`);
  rowEls[t.id] = row;
  fillEls[t.id] = row.querySelector('.panel-fill');
  threshEls[t.id] = row.querySelector('.panel-thresh');
  threshEls[t.id].style.left = `${t.triggerAt * 100}%`;
}

function setHud(text) { hud.textContent = text; hud.hidden = !text; }

function resizeOverlay() {
  overlay.width = overlay.clientWidth;
  overlay.height = overlay.clientHeight;
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

function getVideoDisplayBounds() {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = overlay.width;
  const ch = overlay.height;
  if (!vw || !vh || !cw || !ch) return { width: cw, height: ch, offsetX: 0, offsetY: 0 };
  const va = vw / vh;
  const ca = cw / ch;
  if (va > ca) {
    const height = ch;
    const width = ch * va;
    return { width, height, offsetX: (cw - width) / 2, offsetY: 0 };
  }
  const width = cw;
  const height = cw / va;
  return { width, height, offsetX: 0, offsetY: (ch - height) / 2 };
}

function flashRow(id) {
  const row = rowEls[id];
  row.classList.remove('flash');
  void row.offsetWidth;
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 250);
}

async function run() {
  startBtn.hidden = true;
  setHud('requesting camera…');
  await startCamera();
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);

  setHud('loading face model…');
  const tracker = await createFaceTracker();

  setHud('starting audio…');
  const drums = await createDrums();

  setHud('jaw=kick · smile=snare · brows up=hi-hat · pucker=tom · wink left=crash · wink right=ride');
  panel.hidden = false;

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const result = tracker.detect(video, ts);
        const cats = result.faceBlendshapes?.[0]?.categories ?? [];
        const landmarks = result.faceLandmarks?.[0];
        const mirrored = landmarks ? mirrorX(landmarks) : null;
        drawFace(ctx, mirrored, getVideoDisplayBounds());

        for (const t of TRIGGERS) {
          const v = t.value(cats);
          fillEls[t.id].style.width = `${Math.min(1, v) * 100}%`;
          const s = state[t.id];
          if (s.armed && v > t.triggerAt) {
            drums[t.id](Math.min(1, v));
            flashRow(t.id);
            s.armed = false;
            s.lastFire = ts;
          } else if (!s.armed && v < t.releaseAt) {
            s.armed = true;
          }
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
    panel.hidden = true;
  });
});
