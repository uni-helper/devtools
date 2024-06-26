/// <reference types="vitest" />

import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import UnoCSS from 'unocss/vite'
import VueRouter from 'unplugin-vue-router/vite'
import { VueRouterAutoImports } from 'unplugin-vue-router'
import consola from 'consola'

let _resolvedConfig
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
        './src/trpc',
        './src/constants',
      ],
      vueTemplate: true,
    }),

    Components({
      dts: true,
    }),

    UnoCSS(),

    {
      name: 'create-end-flag-file',
      apply: 'build',
      enforce: 'post',
      configResolved(config) {
        const { watch, outDir } = config.build
        _resolvedConfig = { watch, outDir }
      },
      closeBundle() {
        const { watch, outDir } = _resolvedConfig!
        if (watch) {
          const flagFile = path.resolve(outDir, 'end.flag')
          fs.writeFileSync(flagFile, 'done')
        }
        consola.success('client build done')
      },
    },
  ],
  build: {
    target: 'esnext',
    outDir: path.resolve(__dirname, '../plugin/client'),
    minify: false, // 'esbuild',
    emptyOutDir: true,
  },
})
