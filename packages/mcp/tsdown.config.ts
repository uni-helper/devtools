import { defineConfig } from 'tsdown'

// 依赖全部在 package.json 里声明，由 tsdown 默认外部化（devframe、
// @uni-helper/devtools-core 等），产物只含本包代码
export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  platform: 'node',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  dts: true,
  shims: true,
})
