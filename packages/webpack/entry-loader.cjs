const fs = require('fs')
const path = require('path')

const INJECT_MARKER = '__UNI_DEVTOOLS_AGENT_VUE2_INJECTED__'

/**
 * 构建注入代码
 *
 * 方案二改造要点：
 * 1. 使用 IIFE 立即执行函数，避免 ESM import（防止 Babel 生成 _vue 别名）
 * 2. 使用 queueMicrotask 脱离关键路径（Fail-Open 原则）
 * 3. 全程 try/catch 包裹，任何错误都不影响应用启动
 * 4. 显式校验 initAgent 函数存在性
 * 5. 配置通过 globalThis.__UNI_DEVTOOLS_CONFIG__ 传递
 *
 * @param {string} cliContext - CLI 上下文路径
 * @returns {string} 注入代码
 */
function buildInjectCode(cliContext) {
  // 1. 尝试读取配置文件
  let configStr = 'undefined'
  try {
    const context = cliContext || process.env.UNI_CLI_CONTEXT || process.cwd()
    const jsonPath = path.resolve(
      context,
      'node_modules/.uni-devtools/agent-config.json',
    )
    if (fs.existsSync(jsonPath)) {
      const agentConfig = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
      if (agentConfig && agentConfig.wsUrl) {
        configStr = JSON.stringify({
          wsUrl: agentConfig.wsUrl,
          token: agentConfig.token || '',
        })
      }
    }
  } catch (e) {
    // 配置读取失败不影响注入，使用 undefined
  }

  // 2. 构建注入代码（IIFE 形式，使用 CommonJS require）
  return `/* ${INJECT_MARKER} */
;(function() {
  // 脱离关键路径：使用 queueMicrotask 或 setTimeout(0)
  var scheduleBootstrap = typeof queueMicrotask !== 'undefined'
    ? queueMicrotask
    : function(fn) { setTimeout(fn, 0); };

  scheduleBootstrap(function() {
    try {
      // 1. 动态 require（CommonJS）
      var probes = require('@uni-helper/devtools-probes/vue2');
      var initAgent = probes && probes.initAgent;

      // 2. 显式校验函数存在性（防止模块解析失败）
      if (typeof initAgent !== 'function') {
        console.warn('[uni-devtools] initAgent is not a function, skipping bootstrap');
        return;
      }

      // 3. 设置全局配置（兜底机制）
      if (typeof globalThis !== 'undefined' && ${configStr}) {
        globalThis.__UNI_DEVTOOLS_CONFIG__ = ${configStr};
      }

      // 4. 初始化探针（传入配置）
      initAgent(${configStr});

      // 5. 可观测性日志
      console.log('[uni-devtools] agent bootstrapped');
    } catch (error) {
      // Fail-Open：任何错误都只记录日志，不向上传播
      console.warn('[uni-devtools] bootstrap failed:', error.message);
    }
  });
})();
`
}

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

  if (
    code &&
    (code.includes(INJECT_MARKER) ||
      code.includes('@uni-helper/devtools-probes/vue2'))
  ) {
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

  // 获取 CLI 上下文
  const cliContext =
    (this.query && typeof this.query === 'object' && this.query.cliContext) ||
    process.env.UNI_CLI_CONTEXT ||
    process.cwd()

  const injectCode = buildInjectCode(cliContext)

  return this.callback(null, injectCode + source, map)
}

module.exports.shouldInjectAgentEntry = shouldInjectAgentEntry
module.exports.buildInjectCode = buildInjectCode
module.exports.INJECT_MARKER = INJECT_MARKER
