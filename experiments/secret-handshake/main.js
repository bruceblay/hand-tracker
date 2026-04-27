import '../../src/nav.js';
import { createGestureRecognizer } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX } from '../../src/mappings.js';
import { PinchMotionDetector } from '../../src/gestures.js';

const HAND_EMOJI = {
  'Closed_Fist': '✊',
  'Open_Palm':   '🖐',
  'Pointing_Up': '☝️',
  'Thumb_Down':  '👎',
  'Thumb_Up':    '👍',
  'Victory':     '✌️',
  'ILoveYou':    '🤟'
};

const SHAPE_STABLE_FRAMES = 4;

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');
const statusEl = document.getElementById('status');
const seqPanel = document.getElementById('sequence-panel');
const seqLabel = document.getElementById('seq-label');
const seqRow = document.getElementById('seq-row');
const actions = document.getElementById('actions');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const resultEl = document.getElementById('result');
const resultText = document.getElementById('result-text');
const tryAgainBtn = document.getElementById('try-again-btn');
const ctx = overlay.getContext('2d');

let mode = 'setup';      // 'setup' | 'verify' | 'success' | 'failed'
let password = [];
let attempt = [];

const enterPinch = new PinchMotionDetector({ minDrop: 0.2, minInterval: 350 });

let stableShape = null;
let pendingShape = null;
let pendingFrames = 0;

function angleAtJoint3D(a, j, b) {
  const v1x = a.x - j.x, v1y = a.y - j.y, v1z = (a.z ?? 0) - (j.z ?? 0);
  const v2x = b.x - j.x, v2y = b.y - j.y, v2z = (b.z ?? 0) - (j.z ?? 0);
  const mag = Math.hypot(v1x, v1y, v1z) * Math.hypot(v2x, v2y, v2z);
  if (mag < 1e-9) return Math.PI;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y + v1z * v2z) / mag));
  return Math.acos(cos);
}

function customHandEmoji(lm) {
  if (!lm || lm.length < 21) return null;
  const palm = Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y);
  if (palm < 1e-6) return null;
  const ext    = (p, j, d) => angleAtJoint3D(lm[p], lm[j], lm[d]) > 2.4;
  const folded = (p, j, d) => angleAtJoint3D(lm[p], lm[j], lm[d]) < 2.0;
  const indexExt = ext(5, 6, 8);
  const middleExt = ext(9, 10, 12);
  const ringExt = ext(13, 14, 16);
  const pinkyExt = ext(17, 18, 20);
  const middleFold = folded(9, 10, 12);
  const ringFold = folded(13, 14, 16);
  const tipDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  if (tipDist / palm < 0.25 && middleExt && ringExt && pinkyExt) return '👌';
  const thumbToPinky = Math.hypot(lm[4].x - lm[17].x, lm[4].y - lm[17].y);
  const palmWidth = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y);
  const thumbTucked = palmWidth > 1e-6 && thumbToPinky / palmWidth < 1.5;
  if (indexExt && pinkyExt && middleFold && ringFold && thumbTucked) return '🤘';
  return null;
}

function detectShape(landmarks, gesture) {
  const custom = customHandEmoji(landmarks);
  if (custom) return custom;
  return HAND_EMOJI[gesture?.categoryName] ?? null;
}

function updateStableShape(detected) {
  if (detected === stableShape) {
    pendingShape = null;
    pendingFrames = 0;
    return;
  }
  if (detected === pendingShape) {
    pendingFrames++;
    if (pendingFrames >= SHAPE_STABLE_FRAMES) {
      stableShape = detected;
      pendingShape = null;
      pendingFrames = 0;
    }
  } else {
    pendingShape = detected;
    pendingFrames = 1;
  }
}

function pickHands(result) {
  const hands = (result.landmarks ?? []).map(mirrorX);
  let left = null, right = null;
  let leftIdx = -1, rightIdx = -1;
  for (let i = 0; i < hands.length; i++) {
    const x = hands[i][0].x;
    if (x < 0.5) {
      if (!left || x < left[0].x) { left = hands[i]; leftIdx = i; }
    } else {
      if (!right || x > right[0].x) { right = hands[i]; rightIdx = i; }
    }
  }
  return { left, right, leftIdx, rightIdx, all: hands };
}

function renderSequence() {
  seqRow.innerHTML = '';
  if (mode === 'setup') {
    seqLabel.textContent = 'your handshake';
    if (password.length === 0) {
      const cell = document.createElement('div');
      cell.className = 'seq-cell placeholder';
      cell.textContent = '·';
      seqRow.appendChild(cell);
    } else {
      for (const s of password) {
        const cell = document.createElement('div');
        cell.className = 'seq-cell filled';
        cell.textContent = s;
        seqRow.appendChild(cell);
      }
    }
  } else if (mode === 'verify') {
    seqLabel.textContent = `enter your handshake (${password.length} shapes)`;
    for (let i = 0; i < password.length; i++) {
      const cell = document.createElement('div');
      if (i < attempt.length) {
        cell.className = 'seq-cell filled';
        cell.textContent = attempt[i];
      } else {
        cell.className = 'seq-cell placeholder';
        cell.textContent = '·';
      }
      seqRow.appendChild(cell);
    }
  }
}

function flashLastCell() {
  const cells = seqRow.querySelectorAll('.seq-cell.filled');
  const last = cells[cells.length - 1];
  if (last) {
    last.classList.remove('flash');
    void last.offsetWidth;
    last.classList.add('flash');
  }
}

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = false;
}

function refreshUI() {
  if (mode === 'setup') {
    setStatus('right hand: pose · left hand: pinch to add · save when ready');
    seqPanel.hidden = false;
    actions.hidden = false;
    saveBtn.disabled = password.length === 0;
    saveBtn.textContent = 'save handshake';
    resultEl.hidden = true;
  } else if (mode === 'verify') {
    setStatus('right hand: pose · left hand: pinch to enter the same sequence');
    seqPanel.hidden = false;
    actions.hidden = false;
    saveBtn.disabled = true;
    saveBtn.textContent = 'saved';
    resultEl.hidden = true;
  } else {
    seqPanel.hidden = true;
    actions.hidden = true;
    statusEl.hidden = true;
    resultEl.hidden = false;
    resultEl.classList.toggle('success', mode === 'success');
    resultEl.classList.toggle('failed', mode === 'failed');
    resultText.textContent = mode === 'success' ? 'access granted' : 'access denied';
  }
  renderSequence();
}

function recordShape() {
  if (!stableShape) return;
  if (mode === 'setup') {
    password.push(stableShape);
    refreshUI();
    flashLastCell();
  } else if (mode === 'verify') {
    attempt.push(stableShape);
    refreshUI();
    flashLastCell();
    if (attempt.length >= password.length) {
      const matches = attempt.every((s, i) => s === password[i]);
      mode = matches ? 'success' : 'failed';
      refreshUI();
    }
  }
}

saveBtn.addEventListener('click', () => {
  if (mode !== 'setup' || password.length === 0) return;
  mode = 'verify';
  attempt = [];
  refreshUI();
});

resetBtn.addEventListener('click', () => {
  mode = 'setup';
  password = [];
  attempt = [];
  refreshUI();
});

tryAgainBtn.addEventListener('click', () => {
  mode = 'setup';
  password = [];
  attempt = [];
  refreshUI();
});

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

function bbox(landmarks) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of landmarks) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

function drawShapeOnHand(emoji, landmarks, bounds, isRightSide) {
  const b = bbox(landmarks);
  const cx = (b.minX + b.maxX) / 2 * bounds.width + bounds.offsetX;
  const cy = (b.minY + b.maxY) / 2 * bounds.height + bounds.offsetY;
  const size = Math.max(b.w * bounds.width, b.h * bounds.height) * 1.4;
  const mirror = (emoji === '👌') ? !isRightSide : isRightSide;
  ctx.save();
  ctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 18;
  if (mirror) {
    ctx.translate(cx, cy);
    ctx.scale(-1, 1);
    ctx.fillText(emoji, 0, 0);
  } else {
    ctx.fillText(emoji, cx, cy);
  }
  ctx.restore();
}

async function run() {
  startBtn.hidden = true;
  await startCamera();
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);
  const tracker = await createGestureRecognizer({ numHands: 2 });
  refreshUI();

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const result = tracker.detect(video, ts);
        const hands = pickHands(result);
        const bounds = getVideoDisplayBounds();

        ctx.clearRect(0, 0, overlay.width, overlay.height);
        ctx.save();
        ctx.globalAlpha = 0.3;
        drawHands(ctx, hands.all, { width: overlay.width, height: overlay.height });
        ctx.restore();

        // detect right-hand shape for the active mode
        let detected = null;
        if (hands.right && hands.rightIdx >= 0) {
          const gesture = result.gestures?.[hands.rightIdx]?.[0];
          detected = detectShape(hands.right, gesture);
        }
        updateStableShape(detected);

        if (mode === 'setup' || mode === 'verify') {
          if (stableShape && hands.right) {
            drawShapeOnHand(stableShape, hands.right, bounds, true);
          }
          if (hands.left) {
            const r = enterPinch.update(hands.left);
            if (r.justClosed) recordShape();
          } else {
            enterPinch.update(null);
          }
        }
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
    startBtn.hidden = false;
    started = false;
  });
}

startBtn.addEventListener('click', autoStart);
autoStart();
