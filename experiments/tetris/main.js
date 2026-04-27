import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX, OnePole } from '../../src/mappings.js';
import { PinchMotionDetector } from '../../src/gestures.js';
import { createGame, PIECES, BOARD_W, BOARD_H } from './game.js';
import { createTetrisMusic } from './audio.js';

const CELL = 30;

const config = {
  ROT_VEL_CW: 0.06,             // smoothed rad/frame to fire CW once pinch is armed
  ROT_VEL_CCW: 0.04,            // smaller magnitude for CCW (harder direction)
  VELOCITY_SMOOTH: 0.5,         // EMA coefficient on raw velocity
  PINCH_CLOSE_RATIO: 0.4,       // pinch ratio below this = closed (pinch held)
  PINCH_OPEN_RATIO: 0.55,       // pinch ratio above this = open (hysteresis)
  PINCH_MIN_DROP: 0.15          // left hand drop pinch sensitivity
};

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const board = document.getElementById('board');
const hud = document.getElementById('hud');
const legend = document.getElementById('legend');
const scoreEl = document.getElementById('score');
const finalScoreEl = document.getElementById('final-score');
const gameoverEl = document.getElementById('gameover');
const restartBtn = document.getElementById('restart');
const startBtn = document.getElementById('start');
const nextCanvas = document.getElementById('next-canvas');
const overlayCtx = overlay.getContext('2d');
const boardCtx = board.getContext('2d');
const nextCtx = nextCanvas.getContext('2d');

const xSmoother = new OnePole(0.3);
const dropPinch = new PinchMotionDetector({ minDrop: config.PINCH_MIN_DROP, minInterval: 250 });

let game = createGame();
let music = null;
let lastGameOver = false;
let prevAngle = null;
let smoothedVelocity = 0;
let twistState = 'idle';      // 'idle' (pinch open) | 'armed' (pinch closed, ready to fire) | 'spent' (already fired this pinch)
let pinchHeld = false;
let lastFireDir = null;
let lastFireTime = 0;
let lastFrameTime = 0;
let running = false;
let leftVisible = false;

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

function getPalmAngle(hand) {
  return Math.atan2(hand[17].y - hand[5].y, hand[17].x - hand[5].x);
}

const dbg = {
  vel:   document.getElementById('dbg-neutral'),
  raw:   document.getElementById('dbg-angle'),
  ignore: document.getElementById('dbg-delta'),
  state: document.getElementById('dbg-state'),
  last:  document.getElementById('dbg-last'),
};

function updateDebug(now) {
  if (!dbg.vel) return;
  dbg.vel.textContent = smoothedVelocity.toFixed(3);
  dbg.raw.textContent = pinchHeld ? 'closed' : 'open';
  dbg.ignore.textContent = '';
  dbg.state.textContent = twistState;
  if (lastFireDir) {
    const ago = (now - lastFireTime) / 1000;
    dbg.last.textContent = `${lastFireDir} (${ago.toFixed(1)}s ago)`;
  } else {
    dbg.last.textContent = '—';
  }
}

function pinchRatio(hand) {
  const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
  const pinch = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
  return palm > 1e-6 ? pinch / palm : 1;
}

function checkRotation(hand) {
  if (!hand) {
    resetTwist();
    return null;
  }

  const angle = getPalmAngle(hand);
  if (prevAngle === null) {
    prevAngle = angle;
  } else {
    let v = angle - prevAngle;
    while (v > Math.PI) v -= 2 * Math.PI;
    while (v < -Math.PI) v += 2 * Math.PI;
    smoothedVelocity = config.VELOCITY_SMOOTH * smoothedVelocity + (1 - config.VELOCITY_SMOOTH) * v;
    prevAngle = angle;
  }

  const ratio = pinchRatio(hand);
  if (pinchHeld) {
    if (ratio > config.PINCH_OPEN_RATIO) pinchHeld = false;
  } else {
    if (ratio < config.PINCH_CLOSE_RATIO) pinchHeld = true;
  }

  if (!pinchHeld) {
    twistState = 'idle';
    return null;
  }
  if (twistState === 'idle') twistState = 'armed';
  if (twistState === 'armed') {
    if (smoothedVelocity > config.ROT_VEL_CW) {
      twistState = 'spent';
      return 'cw';
    }
    if (smoothedVelocity < -config.ROT_VEL_CCW) {
      twistState = 'spent';
      return 'ccw';
    }
  }
  return null;
}

function resetTwist() {
  prevAngle = null;
  smoothedVelocity = 0;
  twistState = 'idle';
  pinchHeld = false;
}

function drawCell(ctx, x, y, color, size = CELL) {
  ctx.fillStyle = color;
  ctx.fillRect(x * size, y * size, size, size);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x * size + 0.5, y * size + 0.5, size - 1, size - 1);
}

function renderBoard() {
  const s = game.state();
  boardCtx.clearRect(0, 0, board.width, board.height);

  boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  boardCtx.lineWidth = 1;
  for (let x = 1; x < BOARD_W; x++) {
    boardCtx.beginPath();
    boardCtx.moveTo(x * CELL, 0);
    boardCtx.lineTo(x * CELL, BOARD_H * CELL);
    boardCtx.stroke();
  }
  for (let y = 1; y < BOARD_H; y++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, y * CELL);
    boardCtx.lineTo(BOARD_W * CELL, y * CELL);
    boardCtx.stroke();
  }

  for (let y = 0; y < BOARD_H; y++) {
    for (let x = 0; x < BOARD_W; x++) {
      if (s.grid[y][x]) drawCell(boardCtx, x, y, s.grid[y][x]);
    }
  }

  if (s.current && !s.gameOver) {
    const color = PIECES[s.current.type].color;
    for (const [cx, cy] of s.cells) {
      if (cy >= 0) drawCell(boardCtx, cx, cy, color);
    }
  }

  scoreEl.textContent = s.score;

  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (s.next) {
    const color = PIECES[s.next.type].color;
    const cells = PIECES[s.next.type].rotations[0];
    const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const maxX = Math.max(...xs), maxY = Math.max(...ys);
    const cw = (maxX - minX + 1), ch = (maxY - minY + 1);
    const size = 22;
    const offsetX = (nextCanvas.width - cw * size) / 2;
    const offsetY = (nextCanvas.height - ch * size) / 2;
    for (const [cx, cy] of cells) {
      nextCtx.fillStyle = color;
      nextCtx.fillRect(offsetX + (cx - minX) * size, offsetY + (cy - minY) * size, size, size);
      nextCtx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      nextCtx.strokeRect(offsetX + (cx - minX) * size + 0.5, offsetY + (cy - minY) * size + 0.5, size - 1, size - 1);
    }
  }

  if (s.gameOver) {
    gameoverEl.hidden = false;
    finalScoreEl.textContent = s.score;
    if (!lastGameOver && music) music.stop();
  } else {
    gameoverEl.hidden = true;
  }
  lastGameOver = s.gameOver;
}

async function run() {
  startBtn.hidden = true;
  await startCamera();
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);
  const tracker = await createHandTracker({ numHands: 2 });
  hud.hidden = false;
  legend.hidden = false;
  document.getElementById('debug').hidden = false;

  music = await createTetrisMusic();
  music.start();
  running = true;
  lastFrameTime = performance.now();

  const loop = () => {
    if (video.readyState >= 2) {
      const now = performance.now();
      const dt = Math.min(50, now - lastFrameTime);
      lastFrameTime = now;
      const result = tracker.detect(video, now);
      const { left, right, all } = pickHands(result);

      overlayCtx.save();
      overlayCtx.globalAlpha = 0.3;
      drawHands(overlayCtx, all, { width: overlay.width, height: overlay.height });
      overlayCtx.restore();

      if (!game.state().gameOver) {
        if (left) {
          const tip = left[8];
          const handX = Math.max(0, Math.min(0.5, tip.x)) / 0.5;
          if (!leftVisible) xSmoother.y = handX;
          leftVisible = true;
          const p = dropPinch.update(left);
          if (!p.closing) {
            game.setPositionFraction(xSmoother.process(handX));
          }
          if (p.justClosed) game.hardDrop();
        } else {
          dropPinch.update(null);
          leftVisible = false;
        }

        const dir = checkRotation(right);
        if (dir) {
          game.tryRotate(dir);
          lastFireDir = dir;
          lastFireTime = now;
          console.log(`[twist] fired ${dir} | velocity=${smoothedVelocity.toFixed(3)} pinch=${pinchHeld}`);
        }

        updateDebug(now);

        game.tick(dt);
      }

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
    hud.hidden = true;
    legend.hidden = true;
  });
});

restartBtn.addEventListener('click', () => {
  game = createGame();
  gameoverEl.hidden = true;
  lastGameOver = false;
  if (music) music.start();
});

let muted = false;
const muteToggle = document.getElementById('mute-toggle');
const iosHint = document.getElementById('ios-silent-hint');
const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (isiOS) iosHint.hidden = false;

muteToggle.addEventListener('click', () => {
  muted = !muted;
  muteToggle.textContent = muted ? 'sound off' : 'sound on';
  if (music) music.setMuted(muted);
  if (isiOS) iosHint.hidden = muted;
});

const tunePanel = document.getElementById('tune-panel');
const tuneToggle = document.getElementById('tune-toggle');
const isDebug = new URLSearchParams(window.location.search).get('isDebug') === 'true';

if (!isDebug) {
  tuneToggle.hidden = true;
  tunePanel.hidden = true;
} else {
  function toggleTune() {
    tunePanel.hidden = !tunePanel.hidden;
  }
  tuneToggle.addEventListener('click', toggleTune);
  document.addEventListener('keydown', (e) => {
    if ((e.key === 't' || e.key === 'T') && e.target.tagName !== 'INPUT') toggleTune();
  });
}

const SLIDERS = [
  { id: 't-cw',      key: 'ROT_VEL_CW',          min: 0.02, max: 0.15, step: 0.005, fmt: v => v.toFixed(3) },
  { id: 't-ccw',     key: 'ROT_VEL_CCW',         min: 0.02, max: 0.15, step: 0.005, fmt: v => v.toFixed(3) },
  { id: 't-smooth',  key: 'VELOCITY_SMOOTH',     min: 0.1,  max: 0.9,  step: 0.05,  fmt: v => v.toFixed(2) },
  { id: 't-pclose',  key: 'PINCH_CLOSE_RATIO',   min: 0.2,  max: 0.6,  step: 0.02, fmt: v => v.toFixed(2) },
  { id: 't-popen',   key: 'PINCH_OPEN_RATIO',    min: 0.4,  max: 0.8,  step: 0.02, fmt: v => v.toFixed(2) },
  { id: 't-pinch',   key: 'PINCH_MIN_DROP',      min: 0.10, max: 0.50, step: 0.02, fmt: v => v.toFixed(2) },
];
for (const s of SLIDERS) {
  const input = document.getElementById(s.id);
  const val = document.getElementById(s.id + '-val');
  input.min = s.min; input.max = s.max; input.step = s.step;
  input.value = config[s.key];
  val.textContent = s.fmt(config[s.key]);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    config[s.key] = v;
    val.textContent = s.fmt(v);
    if (s.key === 'PINCH_MIN_DROP') dropPinch.minDrop = v;
  });
}

