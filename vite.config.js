import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  server: { open: true },
  build: {
    rollupOptions: {
      input: {
        index: resolve(here, 'index.html'),
        theremin: resolve(here, 'experiments/theremin/index.html'),
        airDrums: resolve(here, 'experiments/air-drums/index.html'),
        faceFx: resolve(here, 'experiments/face-fx/index.html'),
        fingerCounter: resolve(here, 'experiments/finger-counter/index.html'),
        tetris: resolve(here, 'experiments/tetris/index.html'),
        tombola: resolve(here, 'experiments/tombola/index.html'),
        emojiMirror: resolve(here, 'experiments/emoji-mirror/index.html'),
        connectFour: resolve(here, 'experiments/connect-four/index.html'),
        secretHandshake: resolve(here, 'experiments/secret-handshake/index.html'),
        faceDrums: resolve(here, 'experiments/face-drums/index.html'),
        threeDShapes: resolve(here, 'experiments/3d-shapes/index.html'),
        pondSurface: resolve(here, 'experiments/pond-surface/index.html'),
        paint: resolve(here, 'experiments/paint/index.html'),
        pdfAnnotator: resolve(here, 'experiments/pdf-annotator/index.html')
      }
    }
  }
});
