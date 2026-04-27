import '../../src/nav.js';
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX, OnePole } from '../../src/mappings.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const PINCH_THRESHOLD = 0.3;
const SMOOTHING_COEFF = 0.2;
const HIGHLIGHT_WIDTH = 22;
const ERASE_WIDTH = 36;
const SIG_LINE_WIDTH = 4;
const SIG_PLACED_HEIGHT = 60; // px on the PDF when placed
const PDF_RENDER_SCALE = 1.5;
const MAX_UNDO = 20;

const video = document.getElementById('video');
const handOverlay = document.getElementById('hand-overlay');
const pdfWrap = document.getElementById('pdf-wrap');
const pdfScroll = document.getElementById('pdf-scroll');
const pdfCanvas = document.getElementById('pdf-canvas');
const annotCanvas = document.getElementById('annot-canvas');
const emptyState = document.getElementById('empty-state');
const emptyLoad = document.getElementById('empty-load');
const toolbar = document.getElementById('toolbar');
const legend = document.getElementById('legend');
const pagesEl = document.getElementById('pages');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const signBtn = document.getElementById('sign-btn');
const loadBtn = document.getElementById('load-btn');
const undoBtn = document.getElementById('undo-btn');
const fileInput = document.getElementById('file-input');
const placementHint = document.getElementById('placement-hint');
const sigModal = document.getElementById('sig-modal');
const sigCanvas = document.getElementById('sig-canvas');
const sigClear = document.getElementById('sig-clear');
const sigCancel = document.getElementById('sig-cancel');
const sigSave = document.getElementById('sig-save');

const handCtx = handOverlay.getContext('2d');
const pdfCtx = pdfCanvas.getContext('2d');
const annotCtx = annotCanvas.getContext('2d');
const sigCtx = sigCanvas.getContext('2d');

let mode = 'highlight'; // 'highlight' | 'erase' | 'place-signature'
let pdfDoc = null;
let currentPage = 1;
const pageAnnotations = new Map(); // pageNum -> ImageData
let pendingSignature = null; // canvas (trimmed) waiting to be placed
let savedSignature = null;   // persists across modal opens for reuse
let sigDirty = false;        // true if the modal canvas has been modified since opening

const xSmoother = new OnePole(SMOOTHING_COEFF);
const ySmoother = new OnePole(SMOOTHING_COEFF);
const sigXSmoother = new OnePole(SMOOTHING_COEFF);
const sigYSmoother = new OnePole(SMOOTHING_COEFF);
let drawingVisible = false;
let sigDrawingVisible = false;
let prevX = null, prevY = null;
let highlightLockY = null;     // y is locked at the start of each highlight stroke
let sigPrevX = null, sigPrevY = null;
let wasPinched = false;
let sigWasPinched = false;
let suppressPinchUntilRelease = false;
const undoStack = [];

function pushUndo() {
  if (!pdfDoc) return;
  undoStack.push(annotCtx.getImageData(0, 0, annotCanvas.width, annotCanvas.height));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

function resizeHandOverlay() {
  handOverlay.width = handOverlay.clientWidth;
  handOverlay.height = handOverlay.clientHeight;
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
  const cw = handOverlay.width;
  const ch = handOverlay.height;
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

function pinchRatio(hand) {
  const palm = Math.hypot(hand[0].x - hand[9].x, hand[0].y - hand[9].y);
  const tip = Math.hypot(hand[4].x - hand[8].x, hand[4].y - hand[8].y);
  return palm > 1e-6 ? tip / palm : 1;
}

function pickHand(result) {
  const raw = result.landmarks ?? [];
  if (raw.length === 0) return null;
  return mirrorX(raw[0]);
}

function setMode(m) {
  // Don't allow selecting place-signature via UI; it's set internally
  if (m === mode) return;
  mode = m;
  toolbar.querySelectorAll('button[data-mode]').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === m);
  });
  placementHint.hidden = mode !== 'place-signature';
  // Don't carry an in-progress pinch across mode changes — wait for a release first.
  suppressPinchUntilRelease = true;
}

toolbar.querySelectorAll('button[data-mode]').forEach(b => {
  b.addEventListener('click', () => setMode(b.dataset.mode));
});

emptyLoad.addEventListener('click', () => fileInput.click());
loadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  await loadPdf(buf);
  fileInput.value = '';
});

async function loadPdf(data) {
  pdfDoc = await pdfjsLib.getDocument({ data }).promise;
  pageAnnotations.clear();
  undoStack.length = 0;
  currentPage = 1;
  await renderPage(currentPage);
  emptyState.hidden = true;
  pdfScroll.classList.add('has-pdf');
  toolbar.hidden = false;
  legend.hidden = false;
  pagesEl.hidden = pdfDoc.numPages <= 1;
  updatePagesUi();
}

async function renderPage(num) {
  const page = await pdfDoc.getPage(num);
  const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });

  // size both canvases to the page
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);
  pdfCanvas.width = w;
  pdfCanvas.height = h;
  annotCanvas.width = w;
  annotCanvas.height = h;
  pdfWrap.style.width = `${w}px`;
  pdfWrap.style.height = `${h}px`;

  await page.render({ canvasContext: pdfCtx, viewport }).promise;

  // restore annotation layer for this page if any
  annotCtx.clearRect(0, 0, w, h);
  const saved = pageAnnotations.get(num);
  if (saved && saved.width === w && saved.height === h) {
    annotCtx.putImageData(saved, 0, 0);
  }
}

function saveCurrentAnnotations() {
  if (!pdfDoc) return;
  pageAnnotations.set(currentPage, annotCtx.getImageData(0, 0, annotCanvas.width, annotCanvas.height));
}

function updatePagesUi() {
  if (!pdfDoc) return;
  pageInfo.textContent = `${currentPage} / ${pdfDoc.numPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= pdfDoc.numPages;
}

prevPageBtn.addEventListener('click', async () => {
  if (currentPage <= 1) return;
  saveCurrentAnnotations();
  currentPage--;
  undoStack.length = 0;
  await renderPage(currentPage);
  updatePagesUi();
});
nextPageBtn.addEventListener('click', async () => {
  if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
  saveCurrentAnnotations();
  currentPage++;
  undoStack.length = 0;
  await renderPage(currentPage);
  updatePagesUi();
});

undoBtn.addEventListener('click', () => {
  if (undoStack.length === 0) return;
  const data = undoStack.pop();
  annotCtx.putImageData(data, 0, 0);
  // If the user happens to still be pinching, don't extend a stroke from the undone state.
  suppressPinchUntilRelease = true;
});

// === Highlight / erase drawing ===

function highlightSegment(x1, y1, x2, y2) {
  annotCtx.save();
  annotCtx.strokeStyle = 'rgba(255, 240, 0, 0.5)';
  annotCtx.lineWidth = HIGHLIGHT_WIDTH;
  annotCtx.lineCap = 'round';
  annotCtx.lineJoin = 'round';
  annotCtx.beginPath();
  annotCtx.moveTo(x1, y1);
  annotCtx.lineTo(x2, y2);
  annotCtx.stroke();
  annotCtx.restore();
}

function eraseSegment(x1, y1, x2, y2) {
  annotCtx.save();
  annotCtx.globalCompositeOperation = 'destination-out';
  annotCtx.strokeStyle = 'rgba(0,0,0,1)';
  annotCtx.lineWidth = ERASE_WIDTH;
  annotCtx.lineCap = 'round';
  annotCtx.lineJoin = 'round';
  annotCtx.beginPath();
  annotCtx.moveTo(x1, y1);
  annotCtx.lineTo(x2, y2);
  annotCtx.stroke();
  annotCtx.restore();
}

function viewportToCanvas(viewportX, viewportY, canvas) {
  const rect = canvas.getBoundingClientRect();
  return { x: viewportX - rect.left, y: viewportY - rect.top };
}

function drawCursorOnHand(viewportX, viewportY, color = 'rgba(255, 255, 255, 0.7)') {
  handCtx.save();
  handCtx.strokeStyle = color;
  handCtx.lineWidth = 1.5;
  handCtx.beginPath();
  handCtx.arc(viewportX, viewportY, 8, 0, Math.PI * 2);
  handCtx.stroke();
  handCtx.restore();
}

// === Signature flow ===

function setupSigCanvas() {
  const w = Math.min(window.innerWidth * 0.8, 800);
  const h = Math.min(window.innerHeight * 0.5, 400);
  sigCanvas.width = w;
  sigCanvas.height = h;
  sigCtx.clearRect(0, 0, w, h);
  if (savedSignature) {
    const margin = 20;
    const scale = Math.min(
      (w - margin * 2) / savedSignature.width,
      (h - margin * 2) / savedSignature.height
    );
    const dw = savedSignature.width * scale;
    const dh = savedSignature.height * scale;
    sigCtx.drawImage(savedSignature, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  sigDirty = false;
  updateSigSaveLabel();
}

function updateSigSaveLabel() {
  sigSave.textContent = (savedSignature && !sigDirty) ? 'use' : 'save';
}

function markSigDirty() {
  if (sigDirty) return;
  sigDirty = true;
  updateSigSaveLabel();
}

signBtn.addEventListener('click', () => {
  setupSigCanvas();
  sigModal.hidden = false;
  sigDrawingVisible = false;
  sigPrevX = null;
  sigPrevY = null;
  sigWasPinched = false;
});

sigClear.addEventListener('click', () => {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  savedSignature = null;
  sigDirty = true;
  updateSigSaveLabel();
});

sigCancel.addEventListener('click', () => {
  sigModal.hidden = true;
});

sigSave.addEventListener('click', () => {
  let toUse;
  if (savedSignature && !sigDirty) {
    toUse = savedSignature;
  } else {
    const trimmed = trimToContent(sigCanvas);
    if (!trimmed) return;
    savedSignature = trimmed;
    toUse = trimmed;
  }
  sigModal.hidden = true;
  pendingSignature = toUse;
  setMode('place-signature');
});

function trimToContent(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

function placeSignatureAt(canvasX, canvasY) {
  if (!pendingSignature) return;
  const targetH = SIG_PLACED_HEIGHT;
  const targetW = (pendingSignature.width / pendingSignature.height) * targetH;
  // anchor at the center
  annotCtx.drawImage(pendingSignature, canvasX - targetW / 2, canvasY - targetH / 2, targetW, targetH);
  pendingSignature = null;
  setMode('highlight');
  placementHint.hidden = true;
}

function previewSignatureAt(viewportX, viewportY) {
  if (!pendingSignature) return;
  const { x, y } = viewportToCanvas(viewportX, viewportY, annotCanvas);
  // draw on hand-overlay (cleared each frame) so it doesn't pollute annotations
  const targetH = SIG_PLACED_HEIGHT;
  const targetW = (pendingSignature.width / pendingSignature.height) * targetH;
  const rect = annotCanvas.getBoundingClientRect();
  handCtx.save();
  handCtx.globalAlpha = 0.6;
  handCtx.drawImage(pendingSignature, viewportX - targetW / 2, viewportY - targetH / 2, targetW, targetH);
  handCtx.restore();
  // outline of where it'll land
  handCtx.save();
  handCtx.strokeStyle = 'rgba(124, 204, 255, 0.6)';
  handCtx.setLineDash([4, 4]);
  handCtx.lineWidth = 1;
  handCtx.strokeRect(viewportX - targetW / 2, viewportY - targetH / 2, targetW, targetH);
  handCtx.restore();
  return { x, y };
}

// === Main loop ===

async function run() {
  resizeHandOverlay();
  window.addEventListener('resize', resizeHandOverlay);
  await startCamera();
  const tracker = await createHandTracker({ numHands: 1 });

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const result = tracker.detect(video, ts);
        const hand = pickHand(result);

        handCtx.clearRect(0, 0, handOverlay.width, handOverlay.height);
        handCtx.save();
        handCtx.globalAlpha = 0.3;
        drawHands(handCtx, hand ? [hand] : [], { width: handOverlay.width, height: handOverlay.height });
        handCtx.restore();

        if (!hand) {
          wasPinched = false; sigWasPinched = false;
          drawingVisible = false; sigDrawingVisible = false;
          prevX = null; prevY = null;
          sigPrevX = null; sigPrevY = null;
          requestAnimationFrame(loop);
          return;
        }

        const px = (hand[4].x + hand[8].x) / 2;
        const py = (hand[4].y + hand[8].y) / 2;
        const bounds = getVideoDisplayBounds();
        const viewportX = px * bounds.width + bounds.offsetX;
        const viewportY = py * bounds.height + bounds.offsetY;
        const pinched = pinchRatio(hand) < PINCH_THRESHOLD;

        if (!sigModal.hidden) {
          // Signature drawing mode (modal open)
          const sigRect = sigCanvas.getBoundingClientRect();
          const sigX = viewportX - sigRect.left;
          const sigY = viewportY - sigRect.top;
          if (!sigDrawingVisible) {
            sigXSmoother.y = sigX;
            sigYSmoother.y = sigY;
          }
          sigDrawingVisible = true;
          const x = sigXSmoother.process(sigX);
          const y = sigYSmoother.process(sigY);

          // cursor over the modal canvas (dark for contrast against white)
          drawCursorOnHand(viewportX, viewportY, 'rgba(0, 0, 0, 0.85)');

          if (pinched && !sigWasPinched) {
            sigPrevX = x; sigPrevY = y;
            markSigDirty();
          } else if (pinched && sigWasPinched) {
            sigCtx.beginPath();
            sigCtx.moveTo(sigPrevX, sigPrevY);
            sigCtx.lineTo(x, y);
            sigCtx.lineWidth = SIG_LINE_WIDTH;
            sigCtx.lineCap = 'round';
            sigCtx.lineJoin = 'round';
            sigCtx.strokeStyle = '#111';
            sigCtx.stroke();
            sigPrevX = x; sigPrevY = y;
          } else if (!pinched && sigWasPinched) {
            sigPrevX = null; sigPrevY = null;
          }
          sigWasPinched = pinched;
        } else if (pdfDoc) {
          // Annotation modes on PDF
          const { x, y } = viewportToCanvas(viewportX, viewportY, annotCanvas);
          if (!drawingVisible) {
            xSmoother.y = x;
            ySmoother.y = y;
          }
          drawingVisible = true;
          const sx = xSmoother.process(x);
          const sy = ySmoother.process(y);

          if (mode === 'place-signature') {
            previewSignatureAt(viewportX, viewportY);
            if (pinched && !wasPinched) {
              pushUndo();
              placeSignatureAt(sx, sy);
            }
            wasPinched = pinched;
          } else {
            drawCursorOnHand(viewportX, viewportY,
              mode === 'highlight' ? 'rgba(255, 230, 0, 0.85)' : 'rgba(255, 255, 255, 0.7)');

            // After a mode change, ignore any in-progress pinch until the user releases.
            let effectivePinched = pinched;
            if (suppressPinchUntilRelease) {
              if (!pinched) suppressPinchUntilRelease = false;
              effectivePinched = false;
            }

            if (effectivePinched && !wasPinched) {
              pushUndo();
              prevX = sx; prevY = sy;
              highlightLockY = sy;
            } else if (effectivePinched && wasPinched) {
              if (mode === 'highlight') {
                // lock y so highlights stay horizontal; one pinch = one line
                highlightSegment(prevX, highlightLockY, sx, highlightLockY);
                prevX = sx;
              } else if (mode === 'erase') {
                eraseSegment(prevX, prevY, sx, sy);
                prevX = sx; prevY = sy;
              }
            } else if (!effectivePinched && wasPinched) {
              prevX = null; prevY = null;
              highlightLockY = null;
            }
            wasPinched = effectivePinched;
          }
        }
      }
    }
    requestAnimationFrame(loop);
  };
  loop();
}

run().catch(err => {
  console.error(err);
  emptyState.querySelector('p').textContent = `error: ${err.message}`;
});
