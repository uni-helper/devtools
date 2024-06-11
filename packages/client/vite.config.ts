/// <reference types="vitest" />

import path from 'node:path'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import UnoCSS from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'

export default defineConfig({
  resolve: {
    alias: {
      '~/': `${path.resolve(__dirname, 'src')}/`,
    },
  },
  plugins: [
    Vue({
      script: {
        propsDestructure: true,
        defineModel: true,
      },
    }),

    VueRouter(),

    AutoImport({
      imports: [
        'vue',
        '@vueuse/core',
        VueRouterAutoImports,
        {
          'vue-router/auto': ['useLink'],
        },
      ],
      dts: true,
      dirs: [
        './src/composables',
        './src/utils',
        './src/composables',
        './src/constants',
        './src/stores',
      ],
      vueTemplate: true,
    }),

    Components({
      dts: true,
    }),

    UnoCSS(),
  ],
  build: {
    target: 'esnext',
    outDir: path.resolve(__dirname, '../plugin/client'),
    minify: false, // 'esbuild',
    emptyOutDir: true,
  },
})
