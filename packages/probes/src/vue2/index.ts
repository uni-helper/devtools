/**
 * Vue 2（webpack 构建线）探针入口
 *
 * 与 Vite + Vue 3 线的 `./vue3` 入口并列，产物形态**有意不同**：
 * 本入口预构建为 `dist/agent-vue2.mjs`（esbuild bundle），而不是源码直发——
 * webpack 4 / vue-cli 4 默认不转译 node_modules 里的 TS，源码直发无法被消费。
 *
 * 冻结契约见讨论记录 `batch-interface.md`：
 * - 子路径 `@uni-helper/devtools-probes/vue2`，导出 `initAgent()`
 * - 配置通过 `globalThis.__UNI_DEVTOOLS_CONFIG__` 或函数参数传入
 *
 * Vue 2 探针**不注册** Vue 3 专属方法：
 * - recomputeComponentState（Vue 2 computed 不需要重算）
 * - getComponentRenderCode（Vue 2 无 template 编译产物可读）
 * - pinia 三条（Pinia 依赖 Vue 3 Composition API）
 *
 * 方案二改造要点：
 * 1. 引入 Adapter 层，不再直接访问 uni/wx 全局变量
 * 2. 使用 Bootstrap 层实现 Fail-Open（探针失败不影响应用启动）
 * 3. 配置从 globalThis.__UNI_DEVTOOLS_CONFIG__ 获取，不再依赖虚拟模块
 */

import type { AgentConfig, AgentInstance } from '../runtime/lifecycle.ts'
import { resolveAdapter } from '../adapter/resolve.ts'
import { createBaseRpcFunctions } from '../runtime/rpc-base.ts'
import { setVueRuntime } from '../runtime/serialize.ts'
import {
  disposeAgent,
  getAgentInstance,
  initAgentPipeline,
} from '../runtime/lifecycle.ts'
import { AGENT_RPC_VUE2 } from '@uni-helper/devtools-shared'
import { getVuexStores, updateVuexState } from '../runtime/vuex.ts'
import type {
  VuexStateResult,
  UpdateVuexStateParams,
} from '@uni-helper/devtools-shared'

/**
 * 初始化探针（同步版本，保持向后兼容）
 *
 * @param customConfig - 可选的自定义配置
 * @returns AgentInstance 或在失败时返回 stub 实例
 */
export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  try {
    // 1. 解析 Adapter（自动检测平台）
    const adapter = resolveAdapter()

    // 2. 设置 Vue 运行时（如果有）
    const vueRuntime = adapter.getVueRuntime?.()
    if (vueRuntime) {
      setVueRuntime(vueRuntime)
    }

    // 3. 初始化探针管道（修复 Critical 2: Vue 2 扩展 Vuex RPC）
    return initAgentPipeline({
      adapter,
      clientFunctions: {
        ...createBaseRpcFunctions(), // 8 个基础 RPC 方法
        // Vue 2 专属：Vuex 状态管理（从 AGENT_RPC_VUE2 注册）
        [AGENT_RPC_VUE2.getVuexStores]: (): VuexStateResult[] => {
          return getVuexStores()
        },
        [AGENT_RPC_VUE2.getVuexState]: (params: {
          id: string
        }): VuexStateResult | null => {
          const stores = getVuexStores()
          return stores.find((s) => s.id === params.id) || null
        },
        [AGENT_RPC_VUE2.updateVuexState]: (
          params: UpdateVuexStateParams,
        ): { ok: boolean } => {
          return updateVuexState(params)
        },
      },
      customConfig,
    })
  } catch (error) {
    // Fail-Open：探针初始化失败时返回 stub 实例，不影响应用启动
    console.error('[uni-devtools] initAgent failed:', error)

    // 返回一个空的 stub 实例
    return {
      rpc: new Proxy({}, { get: () => () => Promise.resolve() }),
      socketHandle: {
        channel: {
          post: () => {},
          on: () => {},
        },
        dispose: () => {},
        isConnected: () => false,
      },
      dispose: () => {},
    }
  }
}

export type { AgentConfig, AgentInstance }
export { disposeAgent, getAgentInstance }
