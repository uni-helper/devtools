const INJECT_MARKER = '__UNI_DEVTOOLS_AGENT_VUE2_INJECTED__'
const INJECT_CODE = `/* ${INJECT_MARKER} */\nimport { initAgent } from '@uni-helper/devtools-probes/vue2';\ntry { if (typeof globalThis !== 'undefined' && !globalThis.uni) { globalThis.uni = uni; } } catch (e) {}\ninitAgent();\n`

/**
 * 判断是否应将探针入口注入到当前模块。
 *
 * 语义与 Vite 侧 `@uni-helper/devtools-vite/src/entry-inject.ts` 的 `shouldInjectAgentEntry` 对齐 (LESSONS #2)：
 * 1. resourceQuery 守卫：uni 的页面入口形如 src/main.js?{"page":"pages%2Findex%2Findex"}，
 *    而 @dcloudio/webpack-uni-mp-loader/lib/main-new.js 对带 page query
 *    的入口会完全丢弃输入重新生成代码，因此只在 resourceQuery 为空时注入。
 * 2. 防重守卫：若源码已包含 INJECT_MARKER 或 @uni-helper/devtools-probes/vue2 导入则跳过。
 *
 * @param {...unknown} args 兼容两种入参形式：
 *   (resourcePath, resourceQuery, source) 或 (resourceQuery, source)
 * @returns {boolean} 是否应在该模块注入探针入口
 */
function shouldInjectAgentEntry(...args) {
  const [first, second, third] = args
  const query = args.length === 2 ? first : second
  const code = args.length === 2 ? second : third

  // 仅允许空串（旧守卫 this.resourceQuery === ''）：带 query（包括裸 '?'）一律不注入
  if (query !== undefined && query !== null && query !== '') {
    return false
  }

  if (code && (code.includes(INJECT_MARKER) || code.includes('@uni-helper/devtools-probes/vue2'))) {
    return false
  }

  return true
}

/**
 * uni-app Vue 2（webpack 4）入口注入 loader：
 * 将探针初始化代码注入到 src/main.js 顶部。
 */
module.exports = function (source, map) {
  if (this.cacheable) {
    this.cacheable()
  }

  if (!shouldInjectAgentEntry(this.resourcePath, this.resourceQuery, source)) {
    return this.callback(null, source, map)
  }

  return this.callback(null, INJECT_CODE + source, map)
}

module.exports.shouldInjectAgentEntry = shouldInjectAgentEntry
module.exports.INJECT_MARKER = INJECT_MARKER
module.exports.INJECT_CODE = INJECT_CODE
