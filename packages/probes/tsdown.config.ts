import { defineConfig } from 'tsdown'

// 小程序侧探针：跑在用户的 Vue 2 运行时里，CJS + ES2017 语法。小程序环境
// 没有 node_modules，产物必须自包含——运行时依赖一律打进包（新增依赖时记得
// 补进 alwaysBundle）；源码不 import vue（运行时由宿主注入），保留 external
// 兜底。类型走 src 源码发布，不产 dts
export default defineConfig({
  entry: { 'agent-vue2': 'src/vue2/index.ts' },
  format: ['cjs'],
  platform: 'browser',
  target: 'es2017',
  deps: {
    neverBundle: ['vue'],
    alwaysBundle: [/^@uni-helper\//, /^devframe(\/|$)/, 'birpc'],
  },
  dts: false,
  outExtensions: () => ({ js: '.js' }),
})
