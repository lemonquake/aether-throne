import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Vite configuration for Aether Throne.
 *
 * - `@vitejs/plugin-react` handles JSX in the UI overlay layer.
 * - `build.target: 'esnext'` is required by @dimforge/rapier3d-compat
 *   (the wasm-embedded build uses BigInt literals and top-level await helpers).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 2048, // rapier wasm blob inflates the vendor chunk; expected.
  },
});
