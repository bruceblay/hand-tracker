import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX } from '../../src/mappings.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const startBtn = document.getElementById('start');
const counter = document.getElementById('counter');
const ctx = canvas.getContext('2d');

const FINGERS = [
  { proximal: 5,  joint: 6,  distal: 8  },  // index
  { proximal: 9,  joint: 10, distal: 12 },  // middle
  { proximal: 13, joint: 14, distal: 16 },  // ring
  { proximal: 17, joint: 18, distal: 20 },  // pinky
];

const STRAIGHT_THRESHOLD = 2.4;
const THUMB_DISTANCE_RATIO = 1.85;

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

function angleAtJoint3D(a, j, b) {
  const v1x = a.x - j.x, v1y = a.y - j.y, v1z = (a.z ?? 0) - (j.z ?? 0);
  const v2x = b.x - j.x, v2y = b.y - j.y, v2z = (b.z ?? 0) - (j.z ?? 0);
  const mag = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z);
  if (mag < 1e-9) return Math.PI;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / mag));
  return Math.acos(cos);
}

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

function countFingers(hand) {
  let count = 0;
  const palmWidth = dist3(hand[5], hand[17]);
  if (palmWidth > 1e-6 && dist3(hand[4], hand[17]) > palmWidth * THUMB_DISTANCE_RATIO) count++;
  for (const f of FINGERS) {
    const angle = angleAtJoint3D(hand[f.proximal], hand[f.joint], hand[f.distal]);
    if (angle > STRAIGHT_THRESHOLD) count++;
  }
  return count;
}

const STABLE_FRAMES = 4;
let lastTotal = -1;
let pendingCount = -1;
let pendingFrames = 0;
function setCount(total) {
  if (total !== pendingCount) {
    pendingCount = total;
    pendingFrames = 1;
    return;
  }
  pendingFrames++;
  if (pendingFrames < STABLE_FRAMES || total === lastTotal) return;
  lastTotal = total;
  counter.textContent = total;
  counter.classList.remove('pop');
  void counter.offsetWidth;
  counter.classList.add('pop');
}

async function run() {
  startBtn.hidden = true;
  await startCamera();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  const tracker = await createHandTracker({ numHands: 2 });
  counter.hidden = false;

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        const result = tracker.detect(video, ts);
        lastTs = ts;
        const hands = (result.landmarks ?? []).map(mirrorX);
        drawHands(ctx, hands, { width: canvas.width, height: canvas.height });
        const total = hands.reduce((sum, h) => sum + countFingers(h), 0);
        setCount(total);
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

startBtn.addEventListener('click', () => {
  run().catch(err => {
    console.error(err);
    startBtn.hidden = false;
    counter.hidden = true;
  });
});
