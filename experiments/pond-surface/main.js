import '../../src/nav.js';
import { createHandTracker } from '../../src/tracking.js';
import { mirrorX } from '../../src/mappings.js';
import { createRipple } from './ripple.js';

const SCALE = 2; // internal canvas runs at 1/2 viewport resolution
const AMBIENT_INTERVAL_MS = 1500;
const HELD_RIPPLE_INTERVAL_MS = 70;
const PINCH_THRESHOLD = 0.4;

const video = document.getElementById('video');
const display = document.getElementById('ripple');
const status = document.getElementById('status');
const legend = document.getElementById('legend');

const source = document.createElement('canvas');

let W = 1, H = 1;
let ripple = null;

function resize() {
  W = Math.max(1, Math.floor(window.innerWidth / SCALE));
  H = Math.max(1, Math.floor(window.innerHeight / SCALE));
  display.width = source.width = W;
  display.height = source.height = H;
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
  let left = null, right = null;
  for (const h of hands) {
    const x = h[0].x;
    if (x < 0.5) {
      if (!left || x < left[0].x) left = h;
    } else {
      if (!right || x > right[0].x) right = h;
    }
  }
  return { left, right };
}

function pinchRatio(hand) {
  const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
  const tip = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
  return palm > 1e-6 ? tip / palm : 1;
}

let leftLastFire = 0;
let rightLastFire = 0;

function drawVideoCover(sctx) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const va = vw / vh;
  const ca = W / H;
  let sx = 0, sy = 0, sw = vw, sh = vh;
  if (va > ca) {
    sw = vh * ca;
    sx = (vw - sw) / 2;
  } else {
    sh = vw / ca;
    sy = (vh - sh) / 2;
  }
  // mirror horizontally so the user sees a selfie-mirror pond
  sctx.save();
  sctx.scale(-1, 1);
  sctx.drawImage(video, sx, sy, sw, sh, -W, 0, W, H);
  sctx.restore();
}

function disturbAt(hand) {
  const px = (hand[4].x + hand[8].x) / 2;
  const py = (hand[4].y + hand[8].y) / 2;
  if (ripple) ripple.disturb(px * W, py * H);
}

async function run() {
  resize();
  window.addEventListener('resize', resize);
  await startCamera();
  const tracker = await createHandTracker({ numHands: 2 });
  ripple = createRipple(display, source);
  status.hidden = true;
  legend.hidden = false;

  const sctx = source.getContext('2d', { willReadFrequently: true });

  let lastAmbient = performance.now();

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        drawVideoCover(sctx);

        const result = tracker.detect(video, ts);
        const { left, right } = pickHands(result);

        if (left && pinchRatio(left) < PINCH_THRESHOLD &&
            ts - leftLastFire > HELD_RIPPLE_INTERVAL_MS) {
          disturbAt(left);
          leftLastFire = ts;
        }
        if (right && pinchRatio(right) < PINCH_THRESHOLD &&
            ts - rightLastFire > HELD_RIPPLE_INTERVAL_MS) {
          disturbAt(right);
          rightLastFire = ts;
        }

        // ambient idle ripple
        if (ts - lastAmbient > AMBIENT_INTERVAL_MS) {
          ripple.disturb(Math.random() * W, Math.random() * H, 60);
          lastAmbient = ts;
        }

        ripple.step();
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

let started = false;
function autoStart() {
  if (started) return;
  started = true;
  run().catch(err => {
    console.error(err);
    status.textContent = `error: ${err.message}`;
    status.hidden = false;
    started = false;
  });
}
autoStart();
