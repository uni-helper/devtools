import { defineConfig } from 'tsdown'

// vite 由宿主构建工具提供，保持 external。探针不经本包打包：插件只把
// '@uni-helper/devtools-probes/*' 作为字符串注入用户代码，由宿主 vite 解析。
// inspect 的面板静态资源直接从 vite-plugin-inspect 拷贝，不参与打包
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  dts: true,
  shims: true,
  deps: { neverBundle: ['vite'] },
  copy: 'node_modules/vite-plugin-inspect/dist/client',
})
