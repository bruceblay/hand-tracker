import '../../src/nav.js';
import { createGestureRecognizer, createFaceTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX, OnePole } from '../../src/mappings.js';
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

// Tunable values (sliders in the tune panel mutate these)
let linePinchThreshold = 0.2;   // pinch threshold in line / erase modes
let emojiPinchThreshold = 0.3;  // pinch threshold in emoji mode
let smoothingCoeff = 0.15;      // OnePole coefficient for drawing-hand position
const STAMP_INTERVAL_PX = 60;
const MAX_UNDO = 20;
const MIN_LINE_WIDTH = 1;
const MAX_LINE_WIDTH = 32;
const MIN_EMOJI_SIZE = 32;
const MAX_EMOJI_SIZE = 220;
const MIN_ERASE_WIDTH = 18;
const MAX_ERASE_WIDTH = 120;
const LINE_COLORS = [
  '#ffffff', '#e53935', '#fb8c00', '#fdd835',
  '#43a047', '#1e88e5', '#8e24aa', '#ec407a'
];

const video = document.getElementById('video');
const drawCanvas = document.getElementById('draw');
const overlay = document.getElementById('overlay');
const toolbar = document.getElementById('toolbar');
const legend = document.getElementById('legend');
const legendAction = document.getElementById('legend-action');
const legendLine = document.getElementById('legend-line');
const legendEmoji = document.getElementById('legend-emoji');
const legendErase = document.getElementById('legend-erase');
const reverseBtn = document.getElementById('reverse-btn');
const statusEl = document.getElementById('status');
const emojiInfoEl = document.getElementById('emoji-info');
const lineInfoEl = document.getElementById('line-info');
const eraseInfoEl = document.getElementById('erase-info');
const emojiEl = document.getElementById('current-emoji');
const emojiSrc = document.getElementById('emoji-src');
const colorDot = document.getElementById('color-dot');
const thicknessFill = document.getElementById('thickness-fill');
const eraseFill = document.getElementById('erase-fill');
const undoBtn = document.getElementById('undo-btn');
const clearBtn = document.getElementById('clear-btn');
const boot = document.getElementById('boot');
const dctx = drawCanvas.getContext('2d');
const octx = overlay.getContext('2d');

let mode = 'line';   // 'line' | 'emoji' | 'erase'
let reversed = false;
let currentEmoji = '🌟';
let emojiSource = 'default';
let colorIndex = 0;
let currentColor = LINE_COLORS[0];
let lineThickness = 5;
let emojiSize = 90;
let eraseWidth = 50;

const undoStack = [];

const xSmoother = new OnePole(smoothingCoeff);
const ySmoother = new OnePole(smoothingCoeff);
const thicknessSmoother = new OnePole(0.2, lineThickness);
const emojiSizeSmoother = new OnePole(0.2, emojiSize);
const eraseSizeSmoother = new OnePole(0.2, eraseWidth);
const colorPinch = new PinchMotionDetector({ minDrop: 0.18, minInterval: 300 });
let drawingVisible = false;

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

function getBlend(cats, name) {
  return cats.find(c => c.categoryName === name)?.score ?? 0;
}

function faceEmoji(cats) {
  const smileL = getBlend(cats, 'mouthSmileLeft');
  const smileR = getBlend(cats, 'mouthSmileRight');
  const smile = (smileL + smileR) / 2;
  const smileAsym = Math.abs(smileL - smileR);
  const frown  = (getBlend(cats, 'mouthFrownLeft') + getBlend(cats, 'mouthFrownRight')) / 2;
  const jaw    = getBlend(cats, 'jawOpen');
  const browUp = getBlend(cats, 'browInnerUp');
  const browDn = (getBlend(cats, 'browDownLeft') + getBlend(cats, 'browDownRight')) / 2;
  const eyeWide = (getBlend(cats, 'eyeWideLeft') + getBlend(cats, 'eyeWideRight')) / 2;
  const pucker = (getBlend(cats, 'mouthFunnel') + getBlend(cats, 'mouthPucker')) / 2;
  const blinkL = getBlend(cats, 'eyeBlinkLeft');
  const blinkR = getBlend(cats, 'eyeBlinkRight');
  const squint = (getBlend(cats, 'eyeSquintLeft') + getBlend(cats, 'eyeSquintRight')) / 2;
  if (Math.abs(blinkL - blinkR) > 0.55) return '😉';
  if (pucker > 0.4) return '😘';
  if (jaw > 0.5 && (browUp > 0.3 || eyeWide > 0.25)) return '😲';
  if (smile > 0.55 && jaw > 0.25) return '😄';
  if (smile > 0.5 && squint > 0.3) return '😆';
  if (smileAsym > 0.3 && Math.max(smileL, smileR) > 0.35) return '😏';
  if (browDn > 0.4 && frown > 0.25) return '😠';
  if (frown > 0.4) return '😢';
  if (smile > 0.4) return '😊';
  if (jaw > 0.4) return '😮';
  return '😐';
}

function pinchRatio(hand) {
  const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
  const tip = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
  return palm > 1e-6 ? tip / palm : 1;
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

function pickHands(result) {
  const raw = result.landmarks ?? [];
  if (raw.length === 0) return { drawing: null, selector: null, all: [] };
  const hands = raw.map((lm, i) => ({ lm: mirrorX(lm), idx: i }));
  if (hands.length === 1) {
    return { drawing: hands[0], selector: null, all: hands.map(h => h.lm) };
  }
  hands.sort((a, b) => a.lm[0].x - b.lm[0].x);
  // Default: rightmost-on-screen = drawing hand. Reversed: leftmost-on-screen = drawing hand.
  if (reversed) {
    return { drawing: hands[0], selector: hands[hands.length - 1], all: hands.map(h => h.lm) };
  }
  return { selector: hands[0], drawing: hands[hands.length - 1], all: hands.map(h => h.lm) };
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  // Preserve drawing across resize
  let snapshot = null;
  if (drawCanvas.width > 0 && drawCanvas.height > 0) {
    snapshot = dctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height);
  }
  drawCanvas.width = w;
  drawCanvas.height = h;
  overlay.width = w;
  overlay.height = h;
  if (snapshot) dctx.putImageData(snapshot, 0, 0);
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

function pushUndo() {
  undoStack.push(dctx.getImageData(0, 0, drawCanvas.width, drawCanvas.height));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function setMode(m) {
  mode = m;
  toolbar.querySelectorAll('button[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === m);
  });
  emojiInfoEl.hidden = m !== 'emoji';
  lineInfoEl.hidden = m !== 'line';
  eraseInfoEl.hidden = m !== 'erase';
  legendLine.hidden = m !== 'line';
  legendEmoji.hidden = m !== 'emoji';
  legendErase.hidden = m !== 'erase';
  if (m === 'line')      legendAction.innerHTML = 'pinch + drag to <b>draw</b>';
  else if (m === 'emoji') legendAction.innerHTML = 'pinch to <b>stamp</b> · pinch + drag for a stream';
  else                    legendAction.innerHTML = 'pinch + drag to <b>erase</b>';
}

function updateColorDot() {
  colorDot.style.background = currentColor;
}
function updateThicknessBar() {
  const t = (lineThickness - MIN_LINE_WIDTH) / (MAX_LINE_WIDTH - MIN_LINE_WIDTH);
  thicknessFill.style.width = `${Math.max(0, Math.min(1, t)) * 100}%`;
}
function updateEraseBar() {
  const t = (eraseWidth - MIN_ERASE_WIDTH) / (MAX_ERASE_WIDTH - MIN_ERASE_WIDTH);
  eraseFill.style.width = `${Math.max(0, Math.min(1, t)) * 100}%`;
}

toolbar.querySelectorAll('button[data-mode]').forEach(b => {
  b.addEventListener('click', () => setMode(b.dataset.mode));
});
undoBtn.addEventListener('click', () => {
  if (undoStack.length === 0) return;
  const data = undoStack.pop();
  dctx.putImageData(data, 0, 0);
});
clearBtn.addEventListener('click', () => {
  pushUndo();
  dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});
reverseBtn.addEventListener('click', () => {
  reversed = !reversed;
  reverseBtn.classList.toggle('active', reversed);
  reverseBtn.textContent = reversed ? 'right-handed' : 'reverse hands';
  // Reset smoother / drag state so the swap doesn't carry stale positions
  drawingVisible = false;
  prevDrawX = null;
  prevDrawY = null;
});

const tunePanel = document.getElementById('tune');
const tuneToggle = document.getElementById('tune-toggle');
tuneToggle.addEventListener('click', () => {
  tunePanel.hidden = !tunePanel.hidden;
  tuneToggle.classList.toggle('active', !tunePanel.hidden);
});

const tLinePinch = document.getElementById('t-line-pinch');
const tLinePinchVal = document.getElementById('t-line-pinch-val');
const tEmojiPinch = document.getElementById('t-emoji-pinch');
const tEmojiPinchVal = document.getElementById('t-emoji-pinch-val');
const tSmooth = document.getElementById('t-smooth');
const tSmoothVal = document.getElementById('t-smooth-val');

function bindSlider(input, valEl, get, set) {
  input.value = get();
  valEl.textContent = get().toFixed(2);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    set(v);
    valEl.textContent = v.toFixed(2);
  });
}
bindSlider(tLinePinch, tLinePinchVal, () => linePinchThreshold, v => linePinchThreshold = v);
bindSlider(tEmojiPinch, tEmojiPinchVal, () => emojiPinchThreshold, v => emojiPinchThreshold = v);
bindSlider(tSmooth, tSmoothVal, () => smoothingCoeff, v => {
  smoothingCoeff = v;
  xSmoother.coeff = v;
  ySmoother.coeff = v;
});


let prevDrawX = null, prevDrawY = null;
let lastStampX = 0, lastStampY = 0;
let wasPinched = false;

function stampEmoji(emoji, x, y, size) {
  dctx.save();
  dctx.font = `${size}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
  dctx.textAlign = 'center';
  dctx.textBaseline = 'middle';
  dctx.fillText(emoji, x, y);
  dctx.restore();
}

function drawSegment(x1, y1, x2, y2) {
  dctx.beginPath();
  dctx.moveTo(x1, y1);
  dctx.lineTo(x2, y2);
  dctx.lineWidth = lineThickness;
  dctx.lineCap = 'round';
  dctx.lineJoin = 'round';
  dctx.strokeStyle = currentColor;
  dctx.stroke();
}

function eraseSegment(x1, y1, x2, y2) {
  dctx.save();
  dctx.globalCompositeOperation = 'destination-out';
  dctx.beginPath();
  dctx.moveTo(x1, y1);
  dctx.lineTo(x2, y2);
  dctx.lineWidth = eraseWidth;
  dctx.lineCap = 'round';
  dctx.lineJoin = 'round';
  dctx.strokeStyle = 'rgba(0,0,0,1)';
  dctx.stroke();
  dctx.restore();
}

function drawCursor(x, y) {
  octx.save();
  octx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  octx.lineWidth = 1.5;
  octx.beginPath();
  const r = mode === 'erase' ? eraseWidth / 2 : 8;
  octx.arc(x, y, r, 0, Math.PI * 2);
  octx.stroke();
  octx.restore();
}

function setEmojiStatus(emoji, source) {
  if (currentEmoji === emoji && emojiSource === source) return;
  currentEmoji = emoji;
  emojiSource = source;
  emojiEl.textContent = emoji;
  emojiSrc.textContent = source;
}

async function run() {
  resize();
  window.addEventListener('resize', resize);
  await startCamera();
  const handTracker = await createGestureRecognizer({ numHands: 2 });
  const faceTracker = await createFaceTracker();

  boot.hidden = true;
  toolbar.hidden = false;
  statusEl.hidden = false;
  legend.hidden = false;
  setMode('line');
  updateColorDot();
  updateThicknessBar();
  updateEraseBar();
  document.getElementById('tune-toggle').hidden = false;

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const handResult = handTracker.detect(video, ts);
        const { drawing, selector, all } = pickHands(handResult);

        // Selector hand: drives line thickness/color, emoji size, or erase size depending on mode
        if (mode === 'line') {
          if (selector) {
            const sy = Math.max(0, Math.min(1, 1 - selector.lm[0].y));
            const target = MIN_LINE_WIDTH + sy * (MAX_LINE_WIDTH - MIN_LINE_WIDTH);
            lineThickness = thicknessSmoother.process(target);
            updateThicknessBar();
            const r = colorPinch.update(selector.lm);
            if (r.justClosed) {
              colorIndex = (colorIndex + 1) % LINE_COLORS.length;
              currentColor = LINE_COLORS[colorIndex];
              updateColorDot();
            }
          } else {
            colorPinch.update(null);
          }
        } else if (mode === 'erase') {
          colorPinch.update(null);
          if (selector) {
            const sy = Math.max(0, Math.min(1, 1 - selector.lm[0].y));
            const target = MIN_ERASE_WIDTH + sy * (MAX_ERASE_WIDTH - MIN_ERASE_WIDTH);
            eraseWidth = eraseSizeSmoother.process(target);
            updateEraseBar();
          }
        } else {
          colorPinch.update(null);
        }

        // Face is only used in emoji mode (for fallback emoji + landmark overlay)
        let faceLandmarks = null;
        if (mode === 'emoji') {
          const faceResult = faceTracker.detect(video, ts);
          faceLandmarks = faceResult.faceLandmarks?.[0] ?? null;

          let nextEmoji = null;
          let nextSource = 'default';
          if (selector) {
            const top = handResult.gestures?.[selector.idx]?.[0];
            const custom = customHandEmoji(selector.lm);
            const e = custom ?? HAND_EMOJI[top?.categoryName];
            if (e) { nextEmoji = e; nextSource = 'left hand'; }
            // selector y controls emoji size (high = big, low = small)
            const sy = Math.max(0, Math.min(1, 1 - selector.lm[0].y));
            const target = MIN_EMOJI_SIZE + sy * (MAX_EMOJI_SIZE - MIN_EMOJI_SIZE);
            emojiSize = emojiSizeSmoother.process(target);
          }
          if (!nextEmoji) {
            const cats = faceResult.faceBlendshapes?.[0]?.categories;
            if (cats) { nextEmoji = faceEmoji(cats); nextSource = 'face'; }
          }
          if (nextEmoji) setEmojiStatus(nextEmoji, nextSource);
        }

        // Faint hand wireframes (clears overlay first)
        octx.clearRect(0, 0, overlay.width, overlay.height);
        octx.save();
        octx.globalAlpha = 0.25;
        drawHands(octx, all, { width: overlay.width, height: overlay.height });
        octx.restore();

        // Face landmarks AFTER wireframes so they don't get cleared
        if (faceLandmarks && faceLandmarks.length) {
          const bounds = getVideoDisplayBounds();
          octx.save();
          octx.fillStyle = 'rgba(124, 204, 255, 0.55)';
          for (const p of faceLandmarks) {
            const mx = (1 - p.x) * bounds.width + bounds.offsetX;
            const my = p.y * bounds.height + bounds.offsetY;
            octx.beginPath();
            octx.arc(mx, my, 2, 0, Math.PI * 2);
            octx.fill();
          }
          octx.restore();
        }

        // Drawing hand: draws
        if (drawing) {
          const px = (drawing.lm[4].x + drawing.lm[8].x) / 2;
          const py = (drawing.lm[4].y + drawing.lm[8].y) / 2;
          const targetX = px * drawCanvas.width;
          const targetY = py * drawCanvas.height;

          if (!drawingVisible) {
            xSmoother.y = targetX;
            ySmoother.y = targetY;
          }
          drawingVisible = true;

          const x = xSmoother.process(targetX);
          const y = ySmoother.process(targetY);
          drawCursor(x, y);

          const threshold = mode === 'emoji' ? emojiPinchThreshold : linePinchThreshold;
          const pinched = pinchRatio(drawing.lm) < threshold;

          if (pinched && !wasPinched) {
            // Pinch start — snapshot for undo
            pushUndo();
            if (mode === 'line') {
              prevDrawX = x;
              prevDrawY = y;
            } else if (mode === 'erase') {
              prevDrawX = x;
              prevDrawY = y;
              eraseSegment(x, y, x, y);
            } else if (mode === 'emoji') {
              stampEmoji(currentEmoji, x, y, emojiSize);
              lastStampX = x; lastStampY = y;
            }
          } else if (pinched && wasPinched) {
            if (mode === 'line') {
              drawSegment(prevDrawX, prevDrawY, x, y);
              prevDrawX = x; prevDrawY = y;
            } else if (mode === 'erase') {
              eraseSegment(prevDrawX, prevDrawY, x, y);
              prevDrawX = x; prevDrawY = y;
            } else if (mode === 'emoji') {
              const dx = x - lastStampX, dy = y - lastStampY;
              if (Math.hypot(dx, dy) > STAMP_INTERVAL_PX) {
                stampEmoji(currentEmoji, x, y, emojiSize);
                lastStampX = x; lastStampY = y;
              }
            }
          } else if (!pinched && wasPinched) {
            prevDrawX = null; prevDrawY = null;
          }
          wasPinched = pinched;
        } else {
          wasPinched = false;
          drawingVisible = false;
          prevDrawX = null; prevDrawY = null;
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
    boot.textContent = `error: ${err.message}`;
    boot.hidden = false;
    started = false;
  });
}
autoStart();
