import { HandLandmarker, FaceLandmarker, GestureRecognizer, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const GESTURE_MODEL = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task';

export async function createHandTracker({ numHands = 2 } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'GPU' },
    numHands,
    runningMode: 'VIDEO'
  });

  return {
    detect(video, timestampMs) {
      return landmarker.detectForVideo(video, timestampMs);
    },
    close() { landmarker.close(); }
  };
}

export async function createFaceTracker() {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
    outputFaceBlendshapes: true,
    numFaces: 1,
    runningMode: 'VIDEO'
  });

  return {
    detect(video, timestampMs) {
      return landmarker.detectForVideo(video, timestampMs);
    },
    close() { landmarker.close(); }
  };
}

export async function createGestureRecognizer({ numHands = 2 } = {}) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const recognizer = await GestureRecognizer.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: 'GPU' },
    numHands,
    runningMode: 'VIDEO'
  });

  return {
    detect(video, timestampMs) {
      return recognizer.recognizeForVideo(video, timestampMs);
    },
    close() { recognizer.close(); }
  };
}
