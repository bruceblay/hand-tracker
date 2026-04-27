import { createHandTracker } from './src/tracking.js';
import { drawHands } from './src/draw.js';
import { mirrorX, OnePole } from './src/mappings.js';
import { PinchDetector } from './src/gestures.js';

const enableBtn = document.getElementById('enable');
const video = document.getElementById('video');
const canvas = document.getElementById('overlay');
const cursor = document.getElementById('cursor');
const cards = Array.from(document.querySelectorAll('.card'));
const ctx = canvas.getContext('2d');

const xSmoother = new OnePole(0.4);
const ySmoother = new OnePole(0.4);
const pinch = new PinchDetector();
let hovered = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
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

function pickPrimaryHand(result) {
  const hands = (result.landmarks ?? []).map(mirrorX);
  if (hands.length === 0) return null;
  hands.sort((a, b) => a[8].y - b[8].y);
  return hands[0];
}

function findCardAt(x, y) {
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return card;
  }
  return null;
}

function setHovered(card) {
  if (hovered === card) return;
  hovered?.classList.remove('hover');
  hovered = card;
  hovered?.classList.add('hover');
}

async function enable() {
  enableBtn.hidden = true;
  document.body.classList.add('hand-mode');
  enableBtn.textContent = 'starting…';
  await startCamera();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  const tracker = await createHandTracker({ numHands: 1 });

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        const result = tracker.detect(video, ts);
        lastTs = ts;
        const hand = pickPrimaryHand(result);
        if (hand) {
          drawHands(ctx, [hand], { width: canvas.width, height: canvas.height });
          const tip = hand[8];
          const x = xSmoother.process(tip.x) * window.innerWidth;
          const y = ySmoother.process(tip.y) * window.innerHeight;
          const p = pinch.update(hand);
          const s = p.state === 'closed' ? 0.7 : 1;
          cursor.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
          cursor.classList.toggle('pinched', p.state === 'closed');
          cursor.classList.remove('hidden');
          setHovered(findCardAt(x, y));
          if (p.justClosed && hovered) {
            window.location.href = hovered.href;
          }
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          cursor.classList.add('hidden');
          setHovered(null);
          pinch.update(null);
        }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

const STORAGE_KEY = 'handControlEnabled';

function startEnable() {
  enable().catch(err => {
    console.error(err);
    enableBtn.hidden = false;
    enableBtn.textContent = `error: ${err.message}`;
    document.body.classList.remove('hand-mode');
    localStorage.removeItem(STORAGE_KEY);
  });
}

enableBtn.addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEY, 'true');
  startEnable();
});

if (localStorage.getItem(STORAGE_KEY) === 'true') {
  startEnable();
}
