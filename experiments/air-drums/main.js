import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX } from '../../src/mappings.js';
import { PinchMotionDetector } from '../../src/gestures.js';
import { createDrums } from './audio.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start');
const ctx = canvas.getContext('2d');

const HISTORY = 5;
const HIGH_LOW_Y = 0.5;
const VELOCITY_FULL_SCALE = 0.04;

const PINCH_OPTS = { minDrop: 0.18, minInterval: 70 };
const left = { pinch: new PinchMotionDetector(PINCH_OPTS), yHist: [], lastResult: null };
const right = { pinch: new PinchMotionDetector(PINCH_OPTS), yHist: [], lastResult: null };

const flashes = { kick: 0, snare: 0, hihat: 0, crash: 0 };

const ripples = [];
const RIPPLE_DURATION = 600;
const RIPPLE_MIN_RADIUS = 8;
const RIPPLE_MAX_RADIUS = 140;

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

function pickHands(result) {
  const hands = (result.landmarks ?? []).map(mirrorX);
  hands.sort((a, b) => a[0].x - b[0].x);
  return { left: hands[0] ?? null, right: hands[1] ?? null, all: hands };
}

function pushY(hist, y) {
  hist.push(y);
  if (hist.length > HISTORY) hist.shift();
}

function peakAbsDelta(hist) {
  let max = 0;
  for (let i = 1; i < hist.length; i++) {
    const d = Math.abs(hist[i] - hist[i - 1]);
    if (d > max) max = d;
  }
  return max;
}

function velToGain(v) {
  return Math.max(0.15, Math.min(1, v / VELOCITY_FULL_SCALE));
}

function drawZones() {
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.strokeStyle = 'rgba(124, 204, 255, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5);
  ctx.moveTo(w * 0.5, 0); ctx.lineTo(w * 0.5, h);
  ctx.stroke();

  ctx.font = '600 22px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const labels = [
    { text: 'HI-HAT', key: 'hihat', x: w * 0.25, y: h * 0.25 },
    { text: 'CRASH',  key: 'crash', x: w * 0.75, y: h * 0.25 },
    { text: 'KICK',   key: 'kick',  x: w * 0.25, y: h * 0.75 },
    { text: 'SNARE',  key: 'snare', x: w * 0.75, y: h * 0.75 },
  ];
  for (const l of labels) {
    const f = flashes[l.key];
    ctx.fillStyle = `rgba(124, 204, 255, ${0.16 + f * 0.7})`;
    ctx.fillText(l.text, l.x, l.y);
    if (f > 0) flashes[l.key] = Math.max(0, f - 0.07);
  }
  ctx.restore();
}

function pinchPointY(hand) {
  return (hand[4].y + hand[8].y) / 2;
}

function pinchPointX(hand) {
  return (hand[4].x + hand[8].x) / 2;
}

function spawnRipple(x, y) {
  ripples.push({ x, y, t0: performance.now() });
}

function drawRipples() {
  const now = performance.now();
  for (let i = ripples.length - 1; i >= 0; i--) {
    if (now - ripples[i].t0 >= RIPPLE_DURATION) ripples.splice(i, 1);
  }
  ctx.save();
  ctx.lineWidth = 2;
  for (const r of ripples) {
    const progress = (now - r.t0) / RIPPLE_DURATION;
    const radius = RIPPLE_MIN_RADIUS + (RIPPLE_MAX_RADIUS - RIPPLE_MIN_RADIUS) * Math.pow(progress, 0.7);
    const opacity = (1 - Math.pow(progress, 2)) * 0.85;
    ctx.strokeStyle = `rgba(124, 204, 255, ${opacity})`;
    ctx.beginPath();
    ctx.arc(r.x * canvas.width, r.y * canvas.height, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDebug() {
  ctx.save();
  ctx.font = '13px ui-monospace, SFMono-Regular, monospace';
  ctx.textBaseline = 'bottom';
  const y = canvas.height - 14;
  const fmt = (r) => r.lastResult && r.lastResult.ratio != null
    ? `${r.lastResult.ratio.toFixed(2)}${r.lastResult.closing ? ' closing' : ''}`
    : '—';
  ctx.fillStyle = 'rgba(124, 204, 255, 0.75)';
  ctx.textAlign = 'left';
  ctx.fillText(`L  ${fmt(left)}`, 14, y);
  ctx.textAlign = 'right';
  ctx.fillText(`${fmt(right)}  R`, canvas.width - 14, y);
  ctx.restore();
}

function handleHand(hand, side, drums) {
  if (!hand) {
    side.lastResult = side.pinch.update(null);
    side.yHist.length = 0;
    return;
  }
  const py = pinchPointY(hand);
  pushY(side.yHist, py);
  const p = side.pinch.update(hand);
  side.lastResult = p;
  if (p.justClosed) {
    const gain = velToGain(peakAbsDelta(side.yHist));
    const px = pinchPointX(hand);
    const high = py < HIGH_LOW_Y;
    const rightHalf = px > 0.5;
    if (high && !rightHalf)      { drums.hihat(gain); flashes.hihat = 1; }
    else if (high && rightHalf)  { drums.crash(gain); flashes.crash = 1; }
    else if (!high && !rightHalf){ drums.kick(gain);  flashes.kick = 1; }
    else                         { drums.snare(gain); flashes.snare = 1; }
    spawnRipple(px, py);
  }
}

async function run() {
  startBtn.hidden = true;
  setHud('starting…');

  await startCamera();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  setHud('loading hand model…');
  const tracker = await createHandTracker({ numHands: 2 });

  setHud('starting audio…');
  const drums = await createDrums();

  setHud('left hand: hi-hat (up) / kick (down). right hand: crash (up) / snare (down). pinch to play.');

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        const result = tracker.detect(video, ts);
        lastTs = ts;
        const hands = pickHands(result);

        drawHands(ctx, hands.all, { width: canvas.width, height: canvas.height });
        drawZones();

        handleHand(hands.left, left, drums);
        handleHand(hands.right, right, drums);

        drawRipples();
        drawDebug();
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
  });
});
