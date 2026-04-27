import '../../src/nav.js';
import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX, OnePole } from '../../src/mappings.js';
import { PinchMotionDetector } from '../../src/gestures.js';
import { createPhysics, HEX_RADIUS, BALL_RADIUS } from './physics.js';
import { createAudio } from './audio.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const board = document.getElementById('board');
const legend = document.getElementById('legend');
const countEl = document.getElementById('count');
const ballCountEl = document.getElementById('ball-count');
const startBtn = document.getElementById('start');
const overlayCtx = overlay.getContext('2d');
const boardCtx = board.getContext('2d');

const CENTER = { x: board.width / 2, y: board.height / 2 };
const MAX_ANGULAR_VEL = 3.5;          // rad/s at hand x extremes

const physics = createPhysics(CENTER.x, CENTER.y);
const spawnPinch = new PinchMotionDetector({ minDrop: 0.18, minInterval: 200 });
const angularSmoother = new OnePole(0.2);
const gravitySmoother = new OnePole(0.15);
const MIN_GRAVITY = 100;
const MAX_GRAVITY = 1500;

const FINGERS = [
  { proximal: 5,  joint: 6,  distal: 8  },
  { proximal: 9,  joint: 10, distal: 12 },
  { proximal: 13, joint: 14, distal: 16 },
  { proximal: 17, joint: 18, distal: 20 },
];
const STRAIGHT_THRESHOLD = 2.4;

function angleAtJoint3D(a, j, b) {
  const v1x = a.x - j.x, v1y = a.y - j.y, v1z = (a.z ?? 0) - (j.z ?? 0);
  const v2x = b.x - j.x, v2y = b.y - j.y, v2z = (b.z ?? 0) - (j.z ?? 0);
  const mag = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z);
  if (mag < 1e-9) return Math.PI;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / mag));
  return Math.acos(cos);
}

function countExtendedFingers(hand) {
  let n = 0;
  for (const f of FINGERS) {
    if (angleAtJoint3D(hand[f.proximal], hand[f.joint], hand[f.distal]) > STRAIGHT_THRESHOLD) n++;
  }
  return n;
}

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
  return { left, right, all: hands };
}

function renderBoard() {
  boardCtx.clearRect(0, 0, board.width, board.height);
  const verts = physics.getVertices();
  const gaps = physics.isGapsOpen();

  // hexagon walls
  boardCtx.strokeStyle = gaps ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.85)';
  boardCtx.lineWidth = 3;
  boardCtx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    if (gaps && i % 2 === 0) continue;
    const a = verts[i];
    const c = verts[(i + 1) % 6];
    boardCtx.beginPath();
    boardCtx.moveTo(a.x, a.y);
    boardCtx.lineTo(c.x, c.y);
    boardCtx.stroke();
  }

  // dim "missing" walls when gaps open
  if (gaps) {
    boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    boardCtx.setLineDash([4, 6]);
    for (let i = 0; i < 6; i++) {
      if (i % 2 !== 0) continue;
      const a = verts[i];
      const c = verts[(i + 1) % 6];
      boardCtx.beginPath();
      boardCtx.moveTo(a.x, a.y);
      boardCtx.lineTo(c.x, c.y);
      boardCtx.stroke();
    }
    boardCtx.setLineDash([]);
  }

  // balls
  const balls = physics.getBalls();
  for (const b of balls) {
    boardCtx.fillStyle = b.color;
    boardCtx.beginPath();
    boardCtx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    boardCtx.fill();
    boardCtx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    boardCtx.lineWidth = 1;
    boardCtx.stroke();
  }

  countEl.textContent = balls.length;
}

let audio = null;
let lastFrameTime = 0;
let running = false;

async function run() {
  startBtn.hidden = true;
  await startCamera();
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);
  const tracker = await createHandTracker({ numHands: 2 });
  audio = await createAudio();

  legend.hidden = false;
  ballCountEl.hidden = false;
  running = true;
  lastFrameTime = performance.now();

  const loop = () => {
    if (video.readyState >= 2) {
      const now = performance.now();
      const dt = now - lastFrameTime;
      lastFrameTime = now;
      const result = tracker.detect(video, now);
      const { left, right, all } = pickHands(result);

      overlayCtx.save();
      overlayCtx.globalAlpha = 0.3;
      drawHands(overlayCtx, all, { width: overlay.width, height: overlay.height });
      overlayCtx.restore();

      if (right) {
        const p = spawnPinch.update(right);
        if (p.justClosed) {
          const { note, color } = audio.pickNote();
          physics.spawnBall(note, color);
        }
        const y = Math.max(0, Math.min(1, right[0].y));
        const targetG = MIN_GRAVITY + y * (MAX_GRAVITY - MIN_GRAVITY);
        physics.setGravity(gravitySmoother.process(targetG));
      } else {
        spawnPinch.update(null);
      }

      if (left) {
        const x = Math.max(0, Math.min(1, left[0].x));
        const target = (x - 0.5) * 2 * MAX_ANGULAR_VEL;
        physics.setAngularVel(angularSmoother.process(target));
        physics.setGapsOpen(countExtendedFingers(left) >= 4);
      } else {
        // no left hand: gentle decay toward 0
        physics.setAngularVel(angularSmoother.process(0));
      }

      physics.step(dt, (note, velocity) => {
        const v = Math.min(1, velocity / 600);
        audio.play(note, 0.3 + v * 0.7);
      });

      renderBoard();
    }
    if (running) requestAnimationFrame(loop);
  };
  loop();
}

startBtn.addEventListener('click', () => {
  run().catch(err => {
    console.error(err);
    startBtn.hidden = false;
    legend.hidden = true;
    ballCountEl.hidden = true;
  });
});
