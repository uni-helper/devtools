/**
 * `@uni-helper/devtools` —— 门面包（facade）。
 *
 * 只做聚合，不承载实现：让使用者「装一个包、拿全部入口」，同时内部仍按
 * `docs/FINAL_STRUCTURE.md` 的接缝保持解耦。
 *
 * ```
 * shared  协议类型 + 冻结契约常量
 * probes  小程序探针（vue2 / vue3 两条线）
 * core    node 侧：DevframeDefinition + WebSocket 中继 + inspect 托管
 * mcp     MCP 暴露面
 * vite    Vite 插件
 * webpack Webpack 插件
 * adapter 协议适配器（面板用）
 * client  面板 SPA
 * ```
 */
import { AgentRegistry } from '@uni-helper/devtools-core/relay'
import { createUniDevtoolsDevframe } from '@uni-helper/devtools-core'

export { AgentRegistry }
export { createUniDevtoolsDevframe, createUniDevtoolsDevframe as UniDevtoolsDevframe }
export type { CreateUniDevtoolsDevframeOptions } from '@uni-helper/devtools-core'

export { UniDevtoolsPlugin } from '@uni-helper/devtools-vite'
export type { UniDevtoolsPluginOptions } from '@uni-helper/devtools-vite'

export { uniDevtoolsWebpack, UniDevtoolsWebpack } from '@uni-helper/devtools-webpack'
export type { UniDevtoolsWebpackOptions } from '@uni-helper/devtools-webpack'

export { MCP_ROUTE_SUFFIX, MCP_SETTING, serveUniDevtoolsMcpStdio } from '@uni-helper/devtools-mcp'
export type { McpStdioOptions } from '@uni-helper/devtools-mcp'

/**
 * 建一个带独立中继注册表的 DevframeDefinition。
 *
 * 中继注册表是「面板 / MCP ↔ 探针」之间的定向调用簿，必须与宿主 dev server
 * 共用同一份实例——所以这里把它一并交出来，而不是藏在内部。
 */
export function createUniDevtools(options: { clientAssets?: string } = {}) {
  const registry = new AgentRegistry()
  return { registry, def: createUniDevtoolsDevframe(registry, options) }
}
