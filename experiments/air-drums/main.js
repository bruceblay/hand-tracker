import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX } from '../../src/mappings.js';
import { PinchDetector } from '../../src/gestures.js';
import { createDrums } from './audio.js';

const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const hud = document.getElementById('hud');
const startBtn = document.getElementById('start');
const ctx = canvas.getContext('2d');

const HISTORY = 5;
const HIGH_LOW_Y = 0.5;
const VELOCITY_FULL_SCALE = 0.04;

const left = { pinch: new PinchDetector(), yHist: [] };
const right = { pinch: new PinchDetector(), yHist: [] };

const flashes = { kick: 0, snare: 0, hihat: 0, crash: 0 };

function setHud(text) { hud.textContent = text; }

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
  ctx.strokeStyle = 'rgba(124, 204, 255, 0.12)';
  ctx.lineWidth = 1;
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
    ctx.fillStyle = `rgba(124, 204, 255, ${0.25 + f * 0.7})`;
    ctx.fillText(l.text, l.x, l.y);
    if (f > 0) flashes[l.key] = Math.max(0, f - 0.07);
  }
  ctx.restore();
}

function handleHand(hand, side, drums) {
  if (!hand) {
    side.pinch.update(null);
    side.yHist.length = 0;
    return;
  }
  pushY(side.yHist, hand[0].y);
  const p = side.pinch.update(hand);
  if (p.justClosed) {
    const gain = velToGain(peakAbsDelta(side.yHist));
    const high = hand[0].y < HIGH_LOW_Y;
    if (side === left) {
      if (high) { drums.hihat(gain); flashes.hihat = 1; }
      else      { drums.kick(gain);  flashes.kick = 1; }
    } else {
      if (high) { drums.crash(gain); flashes.crash = 1; }
      else      { drums.snare(gain); flashes.snare = 1; }
    }
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

setHud('click to start');
