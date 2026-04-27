# hand-tracker

Browser-based experiments that use a webcam plus hand, face, and gesture tracking
as input. Each experiment is a self-contained page; the landing page links to all of them.

## Quick start

```
npm install
npm run dev
```

Vite serves the landing page at the printed URL. Open it, click an experiment.
Camera permission is required; audio experiments also require a click to satisfy
the browser's autoplay gesture rule.

## Experiments

- **theremin** — two-handed synth. Hand position controls pitch, volume, filter, resonance. Multiple oscillator presets.
- **air drums** — pinch to hit one of four drums; hand height picks the drum, swing speed sets the volume.
- **face fx** — a drone that responds to facial expressions through an FX chain (filter, reverb, distortion, vibrato, bitcrusher, pan).
- **face drums** — six drums triggered by isolated facial actions (jaw open, smile, brows up, pucker, wink left, wink right).
- **tombola** — a spinning hexagon of bouncing notes, modeled on the OP-1 Tombola sequencer.
- **finger counter** — counts extended fingers across both hands, up to ten.
- **emoji mirror** — replaces face and hands with the closest matching emoji.
- **secret handshake** — record a sequence of hand shapes, then re-enter to unlock.
- **tetris** — hand-controlled Tetris with rotation by twist + pinch.
- **connect four** — two-player; pinch to grab a token, drop it into a column.
- **3d shapes** — pick a shape, rotate it with one hand, zoom by spreading two hands.
- **pond surface** — the webcam image rippling on water; pinch either hand to drop a stone.
- **paint** — line / emoji / erase modes. Right hand draws; left hand or face picks the emoji.
- **pdf annotator** — load a PDF, pinch + drag to highlight, draw a signature and place it.

## Stack

- **[Vite](https://vitejs.dev)** — dev server and bundler. Multi-page setup; each experiment is its own entry in `vite.config.js`.
- **[MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision)** — `HandLandmarker`, `FaceLandmarker` (with blendshapes), `GestureRecognizer`. WASM + GPU.
- **[Tone.js](https://tonejs.github.io)** — Web Audio synthesis for music experiments.
- **[Three.js](https://threejs.org)** — for the 3D shapes experiment.
- **[PDF.js](https://mozilla.github.io/pdf.js/)** — for the PDF annotator.

## Layout

```
hand-tracker/
  index.html              landing page
  main.js                 landing page logic (pinch-to-click navigation)
  src/
    tracking.js           MediaPipe tracker factories
    gestures.js           PinchDetector / PinchMotionDetector
    mappings.js           OnePole smoother, mirrorX, scale quantizer, distance
    draw.js               canvas helpers for hand wireframe and face mesh
    nav.js                injects prev/next buttons on each experiment page
    experiments.js        ordered list of experiments (single source of truth)
  experiments/
    <slug>/
      index.html
      main.js
      audio.js            (where applicable)
      ...
```

## Notes

- iOS silent-mode mutes Web Audio (not just HTML audio). Tetris music shows a hint when on iOS.
- Camera permission persists per origin; once granted, non-audio experiments auto-start on subsequent visits.
- Audio experiments always require a click on the start button — browsers can't bypass that.
