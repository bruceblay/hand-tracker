# hand-tracker — implementation plan

## Goal

Browser-based experiment using webcam input to drive musical/sound output via hand, face, and body tracking. Start with hand tracking and a single playable instrument, then expand.

## Stack

- **Build:** Vite (vanilla JS to start — no framework overhead)
- **Tracking:** [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision) — runs entirely in-browser via WASM/WebGL. Three relevant tasks:
  - `HandLandmarker` — 21 landmarks per hand, up to 2 hands
  - `FaceLandmarker` — 478 landmarks, blendshapes (smile, mouth open, brows, etc.)
  - `PoseLandmarker` — 33 body landmarks
- **Audio:** [Tone.js](https://tonejs.github.io/) on top of Web Audio API. Synths, effects, transport, scheduling all handled.
- **Render:** `<canvas>` overlay on top of `<video>` for landmark visualization.

Why this stack: zero server, ships as static files, all processing client-side, no API keys, Bruce's JS strength carries the whole thing.

## Phases

### Phase 1 — Plumbing (target: working webcam + tracking + audio in one session)

1. Vite project scaffold, single `index.html` + `main.js`.
2. Request webcam, render to a `<video>` element.
3. Load `HandLandmarker` from MediaPipe CDN, run per-frame inference in a `requestAnimationFrame` loop.
4. Draw landmarks on a `<canvas>` overlaid on the video.
5. Wire up Tone.js with a click-to-start (browser audio policy) and a single test oscillator.

Success criterion: see your hand outlined on screen and hear a tone when you click "start".

### Phase 2 — First instrument: air theremin

Most direct mapping, immediate satisfaction.

- Right hand index fingertip (`landmarks[8]`):
  - X position → pitch (map to a scale, e.g. C minor pentatonic, to avoid ear fatigue)
  - Y position → volume
- Left hand pinch distance (thumb tip to index tip) → filter cutoff or vibrato depth
- Hand visibility → note on/off (no hands = silence)
- Smooth all values with a one-pole filter to kill jitter.

### Phase 3 — Gestures and expansion

Pick whichever sounds most fun first; not all of these need to ship.

- **Pinch-to-trigger drum hits.** Thumb-index pinch on each hand triggers a sample. Velocity from pinch speed.
- **Face controls effects.** Mouth-open blendshape → low-pass filter cutoff. Eyebrow raise → reverb wet. Smile → distortion. Use `FaceLandmarker` blendshapes — much cleaner than computing distances by hand.
- **Body as macro controller.** Arms-wide → tempo or chord change. Crouch → bass octave. Pose-driven loop selection.
- **Two-handed chord pads.** Each hand's fingertip count or position picks a chord; the other hand strums or arpeggiates.

### Phase 4 — Polish (only if it earns it)

- Visual feedback that feels musical: trails, particles on note triggers, pitch axis grid.
- Recording: capture audio + video together to share clips.
- Preset switcher: theremin / drum / pad / weird-mode.

## Open questions to decide while building

- **Scale/key handling.** Free pitch is unmusical; locking to a scale is friendlier but less expressive. Probably scale-locked with a "free" toggle.
- **Latency.** MediaPipe + Tone.js together is usually <50ms end-to-end on a decent laptop, but worth measuring early. If it's bad, drop to `HandLandmarker` lite model.
- **Mirror the video?** Almost certainly yes — selfie-mirrored feels natural, but X-axis pitch mapping has to mirror with it.
- **One model at a time, or all three?** Running hand+face+pose simultaneously is heavy. Start with hand only, add others behind a toggle.

## File layout (proposed)

```
hand-tracker/
  docs/
    implementation-plan.md   ← this file
  index.html
  src/
    main.js                  entry point
    tracking.js              MediaPipe setup + per-frame inference
    audio.js                 Tone.js synths, effects, mappings
    mappings.js              landmark → audio param functions (the fun part)
    draw.js                  canvas overlay
  package.json
  vite.config.js
```

## Out of scope (for now)

- Mobile / touch fallback
- Multi-user / networked jamming
- MIDI output to external DAW (tempting later — could feed into the DAW Solver project)
- Model training; using MediaPipe's pre-trained models only
