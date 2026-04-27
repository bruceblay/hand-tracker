import { createGestureRecognizer, createFaceTracker } from '../../src/tracking.js';
import { mirrorX } from '../../src/mappings.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start');
const status = document.getElementById('status');
const legend = document.getElementById('legend');
const ctx = overlay.getContext('2d');

const HAND_EMOJI = {
  'Closed_Fist':  '✊',                              // fist
  'Open_Palm':    '🖐️',                  // raised hand with fingers splayed
  'Pointing_Up':  '☝️',                        // index pointing up
  'Thumb_Down':   '👎',                        // thumbs down
  'Thumb_Up':     '👍',                        // thumbs up
  'Victory':      '✌️',                        // victory / peace
  'ILoveYou':     '🤟'                         // love-you gesture
};

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
  const ext = (p, j, d) => angleAtJoint3D(lm[p], lm[j], lm[d]) > 2.4;
  const folded = (p, j, d) => angleAtJoint3D(lm[p], lm[j], lm[d]) < 2.0;

  const indexExt  = ext(5, 6, 8);
  const middleExt = ext(9, 10, 12);
  const ringExt   = ext(13, 14, 16);
  const pinkyExt  = ext(17, 18, 20);
  const middleFold = folded(9, 10, 12);
  const ringFold   = folded(13, 14, 16);

  // OK sign: thumb tip touching index tip, other 3 fingers extended
  const tipDist = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y);
  if (tipDist / palm < 0.25 && middleExt && ringExt && pinkyExt) return '👌';

  // Horns: index + pinky extended, middle + ring folded, thumb tucked
  const thumbToPinky = Math.hypot(lm[4].x - lm[17].x, lm[4].y - lm[17].y);
  const palmWidth = Math.hypot(lm[5].x - lm[17].x, lm[5].y - lm[17].y);
  const thumbTucked = palmWidth > 1e-6 && thumbToPinky / palmWidth < 1.5;
  if (indexExt && pinkyExt && middleFold && ringFold && thumbTucked) return '🤘';

  return null;
}

function getBlend(cats, name) {
  return cats.find(c => c.categoryName === name)?.score ?? 0;
}

const STABLE_FRAMES = 3;

function makeStability() {
  return { current: null, candidate: null, frames: 0 };
}

function debounce(s, detected) {
  if (detected === s.current) {
    s.candidate = null;
    s.frames = 0;
    return s.current;
  }
  if (detected === s.candidate) {
    s.frames++;
    if (s.frames >= STABLE_FRAMES) {
      s.current = detected;
      s.candidate = null;
      s.frames = 0;
    }
  } else {
    s.candidate = detected;
    s.frames = 1;
  }
  return s.current;
}

function reset(s) {
  s.current = null;
  s.candidate = null;
  s.frames = 0;
}

const faceStable = makeStability();
const handStable = { left: makeStability(), right: makeStability() };

let eyesClosedSince = null;

function faceEmoji(cats, now) {
  const smileL = getBlend(cats, 'mouthSmileLeft');
  const smileR = getBlend(cats, 'mouthSmileRight');
  const smile = (smileL + smileR) / 2;
  const smileAsym = Math.abs(smileL - smileR);
  const frown  = (getBlend(cats, 'mouthFrownLeft') + getBlend(cats, 'mouthFrownRight')) / 2;
  const jaw    = getBlend(cats, 'jawOpen');
  const browUp = getBlend(cats, 'browInnerUp');
  const browDn = (getBlend(cats, 'browDownLeft') + getBlend(cats, 'browDownRight')) / 2;
  const browOuterL = getBlend(cats, 'browOuterUpLeft');
  const browOuterR = getBlend(cats, 'browOuterUpRight');
  const browOuterAsym = Math.abs(browOuterL - browOuterR);
  const browOuterMax = Math.max(browOuterL, browOuterR);
  const eyeWide = (getBlend(cats, 'eyeWideLeft') + getBlend(cats, 'eyeWideRight')) / 2;
  const pucker = (getBlend(cats, 'mouthFunnel') + getBlend(cats, 'mouthPucker')) / 2;
  const blinkL = getBlend(cats, 'eyeBlinkLeft');
  const blinkR = getBlend(cats, 'eyeBlinkRight');
  const squint = (getBlend(cats, 'eyeSquintLeft') + getBlend(cats, 'eyeSquintRight')) / 2;

  // sustained eye closure -> sleeping
  if (blinkL > 0.6 && blinkR > 0.6) {
    if (eyesClosedSince === null) eyesClosedSince = now;
    if (now - eyesClosedSince > 600) return '😴';
  } else {
    eyesClosedSince = null;
  }

  if (Math.abs(blinkL - blinkR) > 0.55) return '😉';                              // wink
  if (jaw > 0.7 && (blinkL + blinkR) / 2 > 0.4) return '🥱';                      // yawn
  if (pucker > 0.4) return '😘';                                                  // kiss
  if (jaw > 0.5 && (browUp > 0.3 || eyeWide > 0.25)) return '😲';                 // astonished
  if (smile > 0.55 && jaw > 0.25) return '😄';                                    // big smile
  if (smile > 0.5 && squint > 0.3) return '😆';                                   // laughing
  if (browOuterAsym > 0.3 && browOuterMax > 0.4) {
    if (smileAsym > 0.2) return '🤔';                                             // thinking
    return '🤨';                                                                  // raised brow
  }
  if (smileAsym > 0.3 && Math.max(smileL, smileR) > 0.35) return '😏';            // smirk
  if (browUp > 0.5 && frown > 0.15 && smile < 0.2) return '🥺';                   // pleading
  if (browDn > 0.4 && frown > 0.25) return '😠';                                  // angry
  if (frown > 0.4) return '😢';                                                   // sad
  if (smile > 0.4) return '😊';                                                   // smile
  if (jaw > 0.4) return '😮';                                                     // open mouth
  return '😐';                                                                    // neutral
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

function drawEmoji(emoji, cx, cy, sizePx, mirror = false) {
  ctx.save();
  ctx.font = `${sizePx}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif`;
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
  status.hidden = false;
  status.textContent = 'requesting camera…';
  await startCamera();
  resizeOverlay();
  window.addEventListener('resize', resizeOverlay);

  status.textContent = 'loading hand model…';
  const handTracker = await createGestureRecognizer({ numHands: 2 });

  status.textContent = 'loading face model…';
  const faceTracker = await createFaceTracker();

  status.hidden = true;
  legend.hidden = false;

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        const bounds = getVideoDisplayBounds();

        const handResult = handTracker.detect(video, ts);
        const seen = { left: false, right: false };
        if (handResult.landmarks) {
          for (let i = 0; i < handResult.landmarks.length; i++) {
            const top = handResult.gestures?.[i]?.[0];
            const custom = customHandEmoji(handResult.landmarks[i]);
            const detected = custom ?? (top ? HAND_EMOJI[top.categoryName] : null);
            const mirrored = mirrorX(handResult.landmarks[i]);
            const b = bbox(mirrored);
            const xCenter = (b.minX + b.maxX) / 2;
            const slot = xCenter > 0.5 ? 'right' : 'left';
            seen[slot] = true;
            const emoji = debounce(handStable[slot], detected ?? null);
            if (!emoji) continue;
            const cx = xCenter * bounds.width + bounds.offsetX;
            const cy = (b.minY + b.maxY) / 2 * bounds.height + bounds.offsetY;
            const size = Math.max(b.w * bounds.width, b.h * bounds.height) * 1.4;
            const invertedMirror = emoji === '👌';
            const mirror = invertedMirror ? slot === 'left' : slot === 'right';
            drawEmoji(emoji, cx, cy, size, mirror);
          }
        }
        if (!seen.left) reset(handStable.left);
        if (!seen.right) reset(handStable.right);

        const faceResult = faceTracker.detect(video, ts);
        const cats = faceResult.faceBlendshapes?.[0]?.categories;
        const faceLm = faceResult.faceLandmarks?.[0];
        if (cats && faceLm && faceLm.length) {
          const detected = faceEmoji(cats, ts);
          const emoji = debounce(faceStable, detected);
          if (emoji) {
            const mirrored = mirrorX(faceLm);
            const b = bbox(mirrored);
            const cx = (b.minX + b.maxX) / 2 * bounds.width + bounds.offsetX;
            const cy = (b.minY + b.maxY) / 2 * bounds.height + bounds.offsetY;
            const size = Math.max(b.w * bounds.width, b.h * bounds.height) * 1.25;
            drawEmoji(emoji, cx, cy, size);
          }
        } else {
          reset(faceStable);
          eyesClosedSince = null;
        }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

startBtn.addEventListener('click', () => {
  run().catch(err => {
    console.error(err);
    status.textContent = `error: ${err.message}`;
    startBtn.hidden = false;
  });
});
