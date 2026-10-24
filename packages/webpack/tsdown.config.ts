import { defineConfig } from 'tsdown'

// webpack 不在本包 dependencies 里（loader 运行在用户的 webpack 进程中），
// 需显式外部化以防将来被误打包
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  dts: true,
  shims: true,
  deps: { neverBundle: ['webpack'] },
})
