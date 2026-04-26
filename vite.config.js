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
        faceFx: resolve(here, 'experiments/face-fx/index.html')
      }
    }
  }
});
