import { join, resolve } from 'node:path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '~': resolve(__dirname, '..'),
    },
  },
  plugins: [
    Vue(),

    AutoImport({
      imports: [
        'vue',
        '@vueuse/core',
        'vue-router',
      ],
      dts: join(__dirname, 'auto-imports.d.ts'),

      dirs: [
        './utils',
        './composables',
        './constants',
        './stores',
      ],
    }),

    Components({
      dirs: ['components'],
      dts: join(__dirname, 'components.d.ts'),
    }),

    UnoCSS(),
  ],

  build: {
    target: 'esnext',
    outDir: resolve(__dirname, '../../dist/client'),
    minify: false, // 'esbuild',
    emptyOutDir: true,
  },
})
