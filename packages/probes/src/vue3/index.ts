/**
 * Uni-Helper DevTools 运行时探针入口（Vue 3 + Pinia）
 * 运行在小程序 / App 等受检沙箱环境
 * 契约：
 * - 探针 RPC 客户端：createRpcClient(functions, { channel })
 * - 虚拟模块：import { config } from 'virtual:uni-devtools-agent'
 * - 导出函数名：'uni-devtools:agent:getComponentTree', 'uni-devtools:agent:ping'
 * - 变更推送：主动采集树快照并调用 'uni-helper-devtools:push-component-tree'
 * （浏览器全局禁用由 eslint no-restricted-globals 执法）
 *
 * 入口只负责「Vue 3 专属方法」的组装与运行时差异；通用 8 个 RPC 方法在
 * `rpc-base.ts`，生命周期与单例在 `lifecycle.ts`。
 */

import { AGENT_RPC_VUE3 } from '@uni-helper/devtools-shared'
import type { AgentConfig, AgentInstance } from '../runtime/lifecycle.ts'
import { createBaseRpcFunctions } from '../runtime/rpc-base.ts'
import {
  disposeAgent,
  getAgentInstance,
  initAgentPipeline,
} from '../runtime/lifecycle.ts'
import {
  type PiniaStateResult,
  type PiniaStoresResult,
  type UpdatePiniaStateResult,
  getPiniaState,
  getPiniaStores,
  updatePiniaState,
} from '../runtime/pinia.ts'
import { getComponentRenderCode } from '../runtime/render-code.ts'
import { recomputeComponentState } from '../runtime/state.ts'

declare const uni: any

export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  const clientFunctions = {
    ...createBaseRpcFunctions(), // 8 个基础 RPC 方法（Vue 2/3 通用）

    // Vue 3 专属方法
    [AGENT_RPC_VUE3.getComponentRenderCode]: (
      params: { id: string } | string,
    ): { code?: string } => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentRenderCode(id)
    },
    [AGENT_RPC_VUE3.recomputeComponentState]: (params: {
      id: string
      section: string
      path: string[]
    }): { ok: boolean } => {
      return recomputeComponentState(params.id, params.section, params.path)
    },
    [AGENT_RPC_VUE3.getPiniaStores]: (): PiniaStoresResult => {
      return getPiniaStores()
    },
    [AGENT_RPC_VUE3.getPiniaState]: (
      args: { id: string } | string,
    ): PiniaStateResult => {
      const id = typeof args === 'string' ? args : args?.id
      return getPiniaState(id)
    },
    [AGENT_RPC_VUE3.updatePiniaState]: (
      params: any,
    ): UpdatePiniaStateResult => {
      return updatePiniaState(params)
    },
  }

  return initAgentPipeline({
    clientFunctions,
    customConfig,
    getUni: () => (typeof uni !== 'undefined' ? uni : (globalThis as any).uni),
  })
}

export type { AgentConfig, AgentInstance }
export { disposeAgent, getAgentInstance }

// 向后兼容导出（按实际模块分别 re-export，保持现有外部消费方不受影响）
export {
  collectComponentTree,
  getRegisteredInstance,
  getVueRuntimeVersion,
} from '../runtime/tree.ts'
export { createUniSocketChannel } from '../socket/index.ts'
export {
  pushComponentTreeNow,
  schedulePushComponentTree,
} from '../runtime/push.ts'
export {
  getComponentState,
  recomputeComponentState,
  updateComponentState,
} from '../runtime/state.ts'
export {
  getPiniaState,
  getPiniaStores,
  updatePiniaState,
} from '../runtime/pinia.ts'
export {
  clearNetworkRecords,
  getNetworkRecords,
  installNetworkInterceptors,
  resetNetworkPushState,
  scheduleNetworkPush,
} from '../runtime/network.ts'
