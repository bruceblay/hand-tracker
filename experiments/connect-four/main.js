import '../../src/nav.js';
import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX, OnePole } from '../../src/mappings.js';
import { createGame, COLS, ROWS } from './game.js';

const CELL = 60;
const TOKEN_R = 24;
const PREVIEW_ROW_H = CELL;
const BOARD_W = COLS * CELL;
const BOARD_H = ROWS * CELL;

const PINCH_CLOSE = 0.4;
const PINCH_OPEN = 0.55;

const COLOR_BG     = '#fdd835';
const COLOR_RED    = '#e53935';
const COLOR_BLACK  = '#0d47a1';
const COLOR_OUTLINE_BLACK = '#082671';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const board = document.getElementById('board');
const turnEl = document.getElementById('turn');
const turnDot = document.getElementById('turn-dot');
const turnText = document.getElementById('turn-text');
const legend = document.getElementById('legend');
const resultEl = document.getElementById('result');
const resultText = document.getElementById('result-text');
const restartBtn = document.getElementById('restart');
const startBtn = document.getElementById('start');
const overlayCtx = overlay.getContext('2d');
const boardCtx = board.getContext('2d');

let game = createGame();
let pinchHeld = false;
const xSmoother = new OnePole(0.4);
let smoothedX = null;
let lastFrameTime = 0;
let running = false;

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

function pickHand(result) {
  const hands = (result.landmarks ?? []).map(mirrorX);
  return hands[0] ?? null;
}

function pinchRatio(hand) {
  const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
  const tip = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
  return palm > 1e-6 ? tip / palm : 1;
}

function updatePinch(hand) {
  const ratio = pinchRatio(hand);
  if (pinchHeld) {
    if (ratio > PINCH_OPEN) pinchHeld = false;
  } else {
    if (ratio < PINCH_CLOSE) pinchHeld = true;
  }
  return pinchHeld;
}

function colorFor(player) {
  return player === 'red' ? COLOR_RED : COLOR_BLACK;
}

function displayName(player) {
  return player === 'black' ? 'blue' : 'red';
}

function drawToken(ctx, cx, cy, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, TOKEN_R, 0, Math.PI * 2);
  ctx.fill();
  if (color === COLOR_BLACK) {
    ctx.strokeStyle = COLOR_OUTLINE_BLACK;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function renderBoard(targetCol) {
  boardCtx.clearRect(0, 0, board.width, board.height);
  const s = game.state();
  const boardTop = PREVIEW_ROW_H;

  // preview held token
  if (pinchHeld && !s.winner && !s.isDraw && targetCol != null) {
    const cx = targetCol * CELL + CELL / 2;
    const cy = PREVIEW_ROW_H / 2;
    const available = game.columnAvailable(targetCol);
    const color = colorFor(s.turn);
    boardCtx.globalAlpha = available ? 1 : 0.3;
    drawToken(boardCtx, cx, cy, color);
    boardCtx.globalAlpha = 1;
  }

  // board background
  boardCtx.fillStyle = COLOR_BG;
  boardCtx.fillRect(0, boardTop, BOARD_W, BOARD_H);

  // punch transparent holes for empty cells
  boardCtx.save();
  boardCtx.globalCompositeOperation = 'destination-out';
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (s.grid[r][c]) continue;
      const cx = c * CELL + CELL / 2;
      const cy = boardTop + r * CELL + CELL / 2;
      boardCtx.beginPath();
      boardCtx.arc(cx, cy, TOKEN_R, 0, Math.PI * 2);
      boardCtx.fill();
    }
  }
  boardCtx.restore();

  // draw tokens for filled cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = s.grid[r][c];
      if (!piece) continue;
      const cx = c * CELL + CELL / 2;
      const cy = boardTop + r * CELL + CELL / 2;
      boardCtx.fillStyle = piece === 'red' ? COLOR_RED : COLOR_BLACK;
      boardCtx.beginPath();
      boardCtx.arc(cx, cy, TOKEN_R, 0, Math.PI * 2);
      boardCtx.fill();
      if (piece === 'black') {
        boardCtx.strokeStyle = COLOR_OUTLINE_BLACK;
        boardCtx.lineWidth = 1.5;
        boardCtx.stroke();
      }
    }
  }

  // highlight last-dropped piece
  if (s.lastDrop) {
    const { row, col } = s.lastDrop;
    const cx = col * CELL + CELL / 2;
    const cy = boardTop + row * CELL + CELL / 2;
    boardCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    boardCtx.lineWidth = 2.5;
    boardCtx.beginPath();
    boardCtx.arc(cx, cy, TOKEN_R + 2, 0, Math.PI * 2);
    boardCtx.stroke();
  }
}

function updateTurnHud() {
  const s = game.state();
  turnDot.className = 'turn-dot ' + s.turn;
  turnText.textContent = `${displayName(s.turn)}'s turn`;
}

function updateResult() {
  const s = game.state();
  if (s.winner) {
    resultText.textContent = `${displayName(s.winner)} wins`;
    resultEl.hidden = false;
  } else if (s.isDraw) {
    resultText.textContent = 'draw';
    resultEl.hidden = false;
  } else {
    resultEl.hidden = true;
  }
}

async function run() {
  startBtn.hidden = true;
  await startCamera();
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);
  const tracker = await createHandTracker({ numHands: 1 });
  turnEl.hidden = false;
  legend.hidden = false;
  running = true;
  lastFrameTime = performance.now();

  let wasPinchHeld = false;

  const loop = () => {
    if (video.readyState >= 2) {
      const now = performance.now();
      lastFrameTime = now;
      const result = tracker.detect(video, now);
      const hand = pickHand(result);

      overlayCtx.save();
      overlayCtx.globalAlpha = 0.3;
      drawHands(overlayCtx, hand ? [hand] : [], { width: overlay.width, height: overlay.height });
      overlayCtx.restore();

      let targetCol = null;

      if (hand) {
        const held = updatePinch(hand);
        const tip = hand[8];
        const x = Math.max(0, Math.min(1, tip.x));
        smoothedX = xSmoother.process(x);
        targetCol = Math.max(0, Math.min(COLS - 1, Math.floor(smoothedX * COLS)));

        // pinch released -> drop
        if (wasPinchHeld && !held && smoothedX != null) {
          const s = game.state();
          if (!s.winner && !s.isDraw) {
            game.dropPiece(targetCol);
            updateTurnHud();
            updateResult();
          }
        }

        wasPinchHeld = held;
      } else {
        wasPinchHeld = false;
        pinchHeld = false;
      }

      renderBoard(targetCol);
    }
    if (running) requestAnimationFrame(loop);
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
    turnEl.hidden = true;
    legend.hidden = true;
    started = false;
  });
}

startBtn.addEventListener('click', autoStart);
autoStart();

restartBtn.addEventListener('click', () => {
  game = createGame();
  updateTurnHud();
  updateResult();
});

updateTurnHud();
