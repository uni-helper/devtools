import { defineConfig } from 'tsdown'

// 入口名与 publishConfig.exports 的 dist 路径一一对应（harness 只在开发时用，
// 不发布）。clean 默认会清空 dist，因此 scripts/copy-panel.mjs 必须在 tsdown
// 之后跑，否则拷进来的面板会被清掉
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    relay: 'src/relay.ts',
    sidecar: 'src/sidecar.ts',
    'inspect-serve': 'src/inspect-serve.ts',
  },
  format: ['esm'],
  platform: 'node',
  target: 'node18',
  outExtensions: () => ({ js: '.mjs', dts: '.d.ts' }),
  dts: true,
})
