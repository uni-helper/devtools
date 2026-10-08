/**
 * Vue 2（webpack 构建线）探针入口
 *
 * 与 Vite + Vue 3 线的 `./vue3` 入口并列，产物形态**有意不同**：
 * 本入口预构建为 `dist/agent-vue2.mjs`（esbuild bundle），而不是源码直发——
 * webpack 4 / vue-cli 4 默认不转译 node_modules 里的 TS，源码直发无法被消费。
 *
 * 冻结契约见讨论记录 `batch-interface.md`：
 * - 子路径 `@uni-helper/devtools-probes/vue2`，导出 `initAgent()`
 * - 配置模块 `virtual:uni-devtools-agent`，形状 `{ wsUrl, token, clientMarker }`
 *
 * Vue 2 探针**不注册** Vue 3 专属方法：
 * - recomputeComponentState（Vue 2 computed 不需要重算）
 * - getComponentRenderCode（Vue 2 无 template 编译产物可读）
 * - pinia 三条（Pinia 依赖 Vue 3 Composition API）
 */

import type { AgentConfig, AgentInstance } from '../runtime/lifecycle.ts'
import { createBaseRpcFunctions } from '../runtime/rpc-base.ts'
import {
  disposeAgent,
  getAgentInstance,
  initAgentPipeline,
} from '../runtime/lifecycle.ts'

declare const uni: any
declare const wx: any

export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  return initAgentPipeline({
    clientFunctions: createBaseRpcFunctions(), // 仅 8 个基础 RPC 方法
    customConfig,
    // Vue 2 运行时回退逻辑：uni → globalThis.uni → wx → globalThis.wx
    getUni: () =>
      typeof uni !== 'undefined'
        ? uni
        : (typeof globalThis !== 'undefined' && (globalThis as any).uni) ||
          (typeof wx !== 'undefined'
            ? wx
            : typeof globalThis !== 'undefined'
              ? (globalThis as any).wx
              : undefined),
  })
}

export type { AgentConfig, AgentInstance }
export { disposeAgent, getAgentInstance }
