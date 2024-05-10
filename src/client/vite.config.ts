/// <reference types="vitest" />

import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import UnoCSS from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import { join, resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '~/': __dirname,
    },
  },
  plugins: [
    VueRouter({
      routesFolder: 'src/client/pages',
      dts: join(__dirname, 'typed-router.d.ts')
    }),

    Vue({
      script: {
        propsDestructure: true,
        defineModel: true,
      },
    }),

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
      dts: true,
      dirs: [
        './composables',
      ],
      vueTemplate: true,
    }),

    Components({
      dirs: ['components'],
      dts: true,
    }),

    UnoCSS(),
  ],

  test: {
    environment: 'jsdom',
  },

  build: {
    target: 'esnext',
    outDir: resolve(__dirname, '../../dist/client'),
    minify: false, // 'esbuild',
    emptyOutDir: true,
  },
})
