/**
 * uni-app Vite 插件编译期入口注入与 AST 插桩纯函数模块 (LESSONS #1/#2)
 *
 * 将与 Vite 钩子耦合的策略逻辑（入口过滤、防重守卫、虚拟入口分支、AST 门控）
 * 全部收敛为无副作用纯函数，构建器钩子只做 `isDev` 门禁与转发。
 */
import path from 'node:path'
import process from 'node:process'
import MagicString from 'magic-string'
import type { SourceMap } from 'magic-string'
import {
  applyEntryFileGuard,
  applyPlainRenderHook,
  applySetupBindings,
  resolveVirtualEntryFile,
} from './instrument.ts'

export const AGENT_IMPORT_MARKER = '__UNI_DEVTOOLS_AGENT_INJECTED__'
// 探针自身不导入虚拟模块（它只在构建期可解析），配置必须由注入代码显式传入，
// 与 webpack 侧 entry-loader 的 initAgent(config) 对齐
export const AGENT_IMPORT_LINE = [
  `/* ${AGENT_IMPORT_MARKER} */`,
  `import { initAgent } from '@uni-helper/devtools-probes/vue3';`,
  `import { config as __uniDevtoolsConfig } from 'virtual:uni-devtools-agent';`,
  `initAgent(__uniDevtoolsConfig);`,
  '',
].join('\n')

export interface ShouldInjectAgentEntryOptions {
  query?: string
  code?: string
}

/**
 * 判断是否应将探针入口注入到当前模块。
 *
 * 语义与 webpack 侧 `packages/webpack/entry-loader.cjs` 的 `shouldInjectAgentEntry` 对齐：
 * 1. id 匹配：仅在主入口注入——有 `UNI_INPUT_DIR` 时精确匹配 `<UNI_INPUT_DIR>/main.[jt]s`
 *    （HBuilderX 项目的 main.js 在项目根，没有 src 目录）；没有时退回 `src/main.[jt]s`
 * 2. query 守卫：query 必须为空（防止 uni-app 页面入口重写等带 query 模块导致重复/错误注入）
 * 3. 防重守卫：若源码已包含 AGENT_IMPORT_MARKER 或 probe 导入则跳过
 *
 * @param id 模块路径（可包含 query 或单纯路径）
 * @param queryOrOptions query 字符串或配置对象
 * @param maybeCode 源码内容（可选，用于防重检查）
 */
export function shouldInjectAgentEntry(
  id: string,
  queryOrOptions?: string | ShouldInjectAgentEntryOptions,
  maybeCode?: string,
): boolean {
  let query: string | undefined
  let code: string | undefined

  if (typeof queryOrOptions === 'object' && queryOrOptions !== null) {
    query = queryOrOptions.query
    code = queryOrOptions.code
  } else {
    query = queryOrOptions
    code = maybeCode
  }

  const qIndex = id.indexOf('?')
  const bareId = qIndex >= 0 ? id.slice(0, qIndex) : id
  const extractedQuery = qIndex >= 0 ? id.slice(qIndex) : ''
  const effectiveQuery = query !== undefined ? query : extractedQuery

  // 仅允许空串：带 query 的入口（含裸 '?'）一律不注入——uni 会带 page query 重写页面入口
  if (effectiveQuery !== '') return false

  if (!isMainEntry(bareId)) return false

  if (
    code &&
    (code.includes(AGENT_IMPORT_MARKER) ||
      code.includes('@uni-helper/devtools-probes/vue3'))
  )
    return false

  return true
}

function isMainEntry(bareId: string): boolean {
  const inputDir = process.env.UNI_INPUT_DIR
  if (!inputDir) return /(?:^|\/)src\/main\.[jt]s$/.test(bareId)
  const file = path.resolve(bareId)
  return ['main.js', 'main.ts'].some(
    (name) => file === path.resolve(inputDir, name),
  )
}

export interface TransformResult {
  code: string
  map: SourceMap
}

function toTransformResult(ms: MagicString, id: string): TransformResult {
  return {
    code: ms.toString(),
    map: ms.generateMap({ hires: true, source: id, includeContent: true }),
  }
}

export function transformAgentEntry(
  code: string,
  id: string,
): TransformResult | null {
  if (!shouldInjectAgentEntry(id, undefined, code)) return null

  const ms = new MagicString(code)
  ms.prepend(AGENT_IMPORT_LINE)
  return toTransformResult(ms, id)
}

export function isVirtualComponentEntry(id: string): boolean {
  const bareId = id.split('?')[0]!
  return bareId.startsWith('uniComponent://') || bareId.startsWith('uniPage://')
}

export function isComponentModule(id: string): boolean {
  const bareId = id.split('?')[0]!
  return /\.(?:vue|js|ts|jsx|tsx)$/.test(bareId)
}

/**
 * 第三方依赖不插桩：插桩只服务用户自己的组件，给依赖做 AST 解析是纯开销；
 * 组件库发布的 `.vue` 源码也不该被改写。uni_modules 属于项目源码，照常插桩。
 */
export function isDependencyModule(id: string): boolean {
  return id.split('?')[0]!.includes('/node_modules/')
}

export interface InstrumentTransformOptions {
  parse?: (source: string) => any
}

/**
 * 编译期 AST 插桩纯函数。
 * - 虚拟入口：注入 `__file` 守卫（解决匿名组件问题；只是给组件对象补一个属性，
 *   不引入任何 import，依赖里的组件也照做）
 * - 项目内 SFC 组件：script setup 闭包绑定捕获 + 渲染钩子包装；plain <script>
 *   挂载 _export_sfc 渲染钩子
 */
export function transformInstrument(
  code: string,
  id: string,
  options: InstrumentTransformOptions = {},
): TransformResult | null {
  const bareId = id.split('?')[0]!
  const ms = new MagicString(code)

  if (isVirtualComponentEntry(bareId)) {
    const file = resolveVirtualEntryFile(bareId)
    if (!file) return null
    return applyEntryFileGuard(ms, code, file)
      ? toTransformResult(ms, id)
      : null
  }

  if (!isComponentModule(bareId) || isDependencyModule(bareId)) return null

  const instrumented =
    (code.includes('setup') &&
      !!options.parse &&
      applySetupBindings(ms, code, options.parse)) ||
    // plain <script>：render 经 _export_sfc 挂在模块层
    applyPlainRenderHook(ms, code)

  return instrumented ? toTransformResult(ms, id) : null
}
