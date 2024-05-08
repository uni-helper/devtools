import { URL, fileURLToPath } from 'node:url'

import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import Inspect from 'vite-plugin-inspect'

import DevTools from 'uni-devtools'

export default async () => {
  return defineConfig({
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    plugins: [
      DevTools(),
      uni(),
      Inspect(),
    ],
  })
}
