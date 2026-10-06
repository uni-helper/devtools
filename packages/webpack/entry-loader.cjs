const INJECT_MARKER = '__UNI_DEVTOOLS_AGENT_VUE2_INJECTED__'
const INJECT_CODE = `/* ${INJECT_MARKER} */\nimport { initAgent } from '@uni-helper/devtools-probes/vue2';\ntry { if (typeof globalThis !== 'undefined' && !globalThis.uni) { globalThis.uni = uni; } } catch (e) {}\ninitAgent();\n`

/**
 * uni-app Vue 2（webpack 4）入口注入 loader：
 * 将探针初始化代码注入到 src/main.js 顶部。
 *
 * 关键规则：
 * 1. uni 的页面入口形如 src/main.js?{"page":"pages%2Findex%2Findex"}，
 *    而 @dcloudio/webpack-uni-mp-loader/lib/main-new.js 对带 page query
 *    的入口会完全丢弃输入重新生成代码，因此只在 resourceQuery 为空时注入。
 * 2. 避免重复注入（检查 INJECT_MARKER 或 initAgent）。
 */
module.exports = function (source, map) {
  if (this.cacheable) {
    this.cacheable()
  }

  if (this.resourceQuery || source.includes(INJECT_MARKER) || source.includes('@uni-helper/devtools-probes/vue2')) {
    return this.callback(null, source, map)
  }

  return this.callback(null, INJECT_CODE + source, map)
}
