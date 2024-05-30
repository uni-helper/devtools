/// <reference types="vitest" />

import { join, resolve } from 'node:path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import UnoCSS from 'unocss/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import Pages from 'vite-plugin-pages'

export default defineConfig({
  base: './',

  resolve: {
    alias: {
      '~/': __dirname,
    },
  },
  plugins: [
    Vue(),

    AutoImport({
      imports: [
        'vue',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          // add any other imports you were relying on
          'vue-router/auto': ['useLink'],
        },
      ],
      dts: join(__dirname, 'auto-imports.d.ts'),

      dirs: [
        './src/utils',
        './src/composables',
        './src/constants',
      ],
    }),

    Pages({
      pagesDir: 'pages',
    }),

    Components({
      dirs: ['./src/components/**'],
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
