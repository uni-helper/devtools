import { fileURLToPath } from 'node:url'
import Vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

/**
 * Builds the panel SPA into `dist/` — the directory the devframe's
 * `clientAssets` points at.
 *
 * `base: './'` keeps every asset URL relative so the same bundle works under
 * any mount path: the hub's synthesized iframe dock, a standalone dev server,
 * or a static build. Nothing here may assume it is served from the origin root.
 */
export default defineConfig({
  base: './',
  plugins: [Vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@design': fileURLToPath(new URL('../../design', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    // Reached from arbitrary hostnames (LAN IPs, tunnels) like every other
    // surface in this repo.
    allowedHosts: true,
    strictPort: false,
  },
})
