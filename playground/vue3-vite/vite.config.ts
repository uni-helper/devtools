import { defineConfig } from 'vite'
import Uni from '@dcloudio/vite-plugin-uni'
import UniHelperManifest from '@uni-helper/vite-plugin-uni-manifest'
import UniHelperPages from '@uni-helper/vite-plugin-uni-pages'
import UniHelperLayouts from '@uni-helper/vite-plugin-uni-layouts'
import UniHelperComponents from '@uni-helper/vite-plugin-uni-components'
import AutoImport from 'unplugin-auto-import/vite'

// 本项目是 CJS 工程（package.json 无 "type": "module"），Vite 5 会把 vite.config 打包成 CJS，
// 静态 import 一个 ESM-only 的包会被 esbuild 拒绝（"resolved to an ESM file"），故与 unocss 一样
// 在工厂函数里动态 import。
// https://vitejs.dev/config/
export default async () => {
  const UnoCSS = (await import('unocss/vite')).default
  const { UniDevtoolsPlugin } = await import('@uni-helper/devtools-vite')

  return defineConfig({
    plugins: [
      // https://github.com/uni-helper/vite-plugin-uni-manifest
      UniHelperManifest(),
      // https://github.com/uni-helper/vite-plugin-uni-pages
      UniHelperPages({
        dts: 'src/uni-pages.d.ts',
      }),
      // https://github.com/uni-helper/vite-plugin-uni-layouts
      UniHelperLayouts(),
      // https://github.com/uni-helper/vite-plugin-uni-components
      UniHelperComponents({
        dts: 'src/components.d.ts',
        directoryAsNamespace: true,
      }),
      // Devframe 架构：探针 + node 侧 relay + 面板
      UniDevtoolsPlugin(),
      Uni(),
      // https://github.com/antfu/unplugin-auto-import
      AutoImport({
        imports: ['vue', '@vueuse/core', 'uni-app'],
        dts: 'src/auto-imports.d.ts',
        dirs: ['src/composables', 'src/stores', 'src/utils'],
        vueTemplate: true,
      }),
      // https://github.com/antfu/unocss
      // see unocss.config.ts for config
      UnoCSS(),
    ],
  })
}
