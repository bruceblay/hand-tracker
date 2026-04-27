import '../../src/nav.js';
import * as THREE from 'three';
import { createHandTracker } from '../../src/tracking.js';
import { drawHands } from '../../src/draw.js';
import { mirrorX, OnePole } from '../../src/mappings.js';

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const sceneCanvas = document.getElementById('scene');
const controls = document.getElementById('controls');
const legend = document.getElementById('legend');
const status = document.getElementById('status');
const shapeSelect = document.getElementById('shape-select');
const overlayCtx = overlay.getContext('2d');

function makeHeart() {
  const s = new THREE.Shape();
  s.moveTo(0.25, 0.25);
  s.bezierCurveTo(0.25, 0.25, 0.20, 0, 0, 0);
  s.bezierCurveTo(-0.30, 0, -0.30, 0.35, -0.30, 0.35);
  s.bezierCurveTo(-0.30, 0.55, -0.10, 0.77, 0.25, 0.95);
  s.bezierCurveTo(0.60, 0.77, 0.80, 0.55, 0.80, 0.35);
  s.bezierCurveTo(0.80, 0.35, 0.80, 0, 0.50, 0);
  s.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.3,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 4,
    curveSegments: 24
  });
  geo.center();
  geo.scale(1.2, 1.2, 1.2);
  return geo;
}

function makeStar() {
  const s = new THREE.Shape();
  const points = 5;
  const outer = 0.55;
  const inner = 0.22;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 3
  });
  geo.center();
  return geo;
}

const SHAPE_FACTORIES = {
  torus:        () => new THREE.TorusGeometry(0.55, 0.2, 24, 80),
  torusKnot:    () => new THREE.TorusKnotGeometry(0.45, 0.15, 128, 16, 2, 3),
  heart:        () => makeHeart(),
  star:         () => makeStar(),
  icosahedron:  () => new THREE.IcosahedronGeometry(0.85, 0),
  dodecahedron: () => new THREE.DodecahedronGeometry(0.8, 0),
  octahedron:   () => new THREE.OctahedronGeometry(0.85, 0),
  tetrahedron:  () => new THREE.TetrahedronGeometry(0.95, 0),
  capsule:      () => new THREE.CapsuleGeometry(0.4, 0.8, 8, 24),
  cone:         () => new THREE.ConeGeometry(0.6, 1.4, 32),
  cylinder:     () => new THREE.CylinderGeometry(0.5, 0.5, 1.4, 48),
  cube:         () => new THREE.BoxGeometry(1, 1, 1)
};

const FLAT_SHADED = new Set(['tetrahedron', 'octahedron', 'icosahedron', 'dodecahedron']);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.z = 3;

const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, alpha: true, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
keyLight.position.set(2, 3, 4);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x7cf, 0.6);
rimLight.position.set(-3, -2, -2);
scene.add(rimLight);

let mesh = null;
function setShape(key) {
  if (mesh) {
    mesh.geometry.dispose();
    mesh.material.dispose();
    scene.remove(mesh);
  }
  const geo = SHAPE_FACTORIES[key]();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xeaeaea,
    metalness: 0.4,
    roughness: 0.35,
    flatShading: FLAT_SHADED.has(key)
  });
  mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
}
setShape('torus');

shapeSelect.addEventListener('change', (e) => setShape(e.target.value));

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  overlay.width = overlay.clientWidth;
  overlay.height = overlay.clientHeight;
}
window.addEventListener('resize', onResize);

const ROT_RANGE_Y = Math.PI;        // ±π yaw across screen
const ROT_RANGE_X = Math.PI * 0.6;  // ±0.6π pitch across screen
const ZOOM_NEAR = 1.8;
const ZOOM_FAR = 5.5;

const INITIAL_ROT_Y = 0.7;
const INITIAL_ROT_X = -0.4;

const rotYSmoother = new OnePole(0.12, INITIAL_ROT_Y);
const rotXSmoother = new OnePole(0.12, INITIAL_ROT_X);
const zoomSmoother = new OnePole(0.08, camera.position.z);

let lastRotY = INITIAL_ROT_Y;
let lastRotX = INITIAL_ROT_X;

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

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 1280, height: 720, facingMode: 'user' },
    audio: false
  });
  video.srcObject = stream;
  await new Promise(r => video.onloadedmetadata = r);
  await video.play();
}

async function run() {
  await startCamera();
  onResize();
  const tracker = await createHandTracker({ numHands: 2 });
  status.hidden = true;
  controls.hidden = false;
  legend.hidden = false;

  let lastTs = -1;
  const loop = () => {
    if (video.readyState >= 2) {
      const ts = performance.now();
      if (ts !== lastTs) {
        lastTs = ts;
        const result = tracker.detect(video, ts);
        const { left, right, all } = pickHands(result);

        overlayCtx.save();
        overlayCtx.globalAlpha = 0.25;
        drawHands(overlayCtx, all, { width: overlay.width, height: overlay.height });
        overlayCtx.restore();

        // primary hand for rotation: prefer right, fall back to left, fall back to first
        const primary = right ?? left ?? null;
        if (primary) {
          const handX = Math.max(0, Math.min(1, primary[0].x));
          const handY = Math.max(0, Math.min(1, primary[0].y));
          lastRotY = (handX - 0.5) * 2 * ROT_RANGE_Y;
          lastRotX = (handY - 0.5) * 2 * ROT_RANGE_X;
        }

        // both hands: distance for zoom
        if (left && right) {
          const dx = right[0].x - left[0].x;
          const dy = right[0].y - left[0].y;
          const dist = Math.hypot(dx, dy);
          // dist ~0.1 (very close) -> ZOOM_FAR (camera far)
          // dist ~0.7 (wide spread) -> ZOOM_NEAR (camera close)
          const t = Math.max(0, Math.min(1, (dist - 0.1) / 0.55));
          const targetZ = ZOOM_FAR - t * (ZOOM_FAR - ZOOM_NEAR);
          camera.position.z = zoomSmoother.process(targetZ);
        }
      }
    }
    if (mesh) {
      mesh.rotation.y = rotYSmoother.process(lastRotY);
      mesh.rotation.x = rotXSmoother.process(lastRotX);
    }
    renderer.render(scene, camera);
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
    status.textContent = `error: ${err.message}`;
    status.hidden = false;
    started = false;
  });
}
autoStart();
