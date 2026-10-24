import { defineConfig } from 'tsdown'

// vite 由宿主构建工具提供，保持 external；probes 发布时 exports 仍指向 src
// 源码，必须打进产物而不是留成运行时依赖。inspect 的面板静态资源直接从
// vite-plugin-inspect 拷贝，不参与打包
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  dts: true,
  shims: true,
  deps: {
    neverBundle: ['vite'],
    alwaysBundle: ['@uni-helper/devtools-probes'],
  },
  copy: 'node_modules/vite-plugin-inspect/dist/client',
})
