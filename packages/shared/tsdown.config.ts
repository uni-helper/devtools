import { defineConfig } from 'tsdown'

// 入口名与 publishConfig.exports 的 dist 路径一一对应；
// "type": "module" 下 tsdown 的 ESM 默认扩展名是 .js，必须显式改成 .mjs
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'utils/network-merge': 'src/utils/network-merge.ts',
    'utils/mock-flag': 'src/utils/mock-flag.ts',
    'utils/tagged-value': 'src/utils/tagged-value.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  dts: true,
})
