/**
 * Uni-Helper DevTools 运行时探针入口
 * 运行在小程序 / App 等受检沙箱环境
 * 契约：
 * - 探针 RPC 客户端：createRpcClient(functions, { channel })
 * - 虚拟模块：import { config } from 'virtual:uni-devtools-agent'
 * - 导出函数名：'uni-devtools:agent:getComponentTree', 'uni-devtools:agent:ping'
 * - 约束：禁止使用 window / document / location
 */

import { createRpcClient } from 'devframe/rpc/client'
import { config } from 'virtual:uni-devtools-agent'
import { createUniSocketChannel, type UniSocketChannelHandle } from './socket'
import { collectComponentTree, getRegisteredInstance, type PageComponentTree } from './tree'
import {
  getComponentState,
  updateComponentState,
  type ComponentStateResult,
  type UpdateStateParams,
  type UpdateStateResult,
} from './state'

export interface AgentConfig {
  wsUrl: string
  token: string
}

export interface AgentInstance {
  rpc: any
  socketHandle: UniSocketChannelHandle
  dispose: () => void
}

let activeAgentInstance: AgentInstance | null = null

export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  // 防重复初始化单例保护（应对 HMR 或多页面重复注入）
  if (activeAgentInstance) {
    return activeAgentInstance
  }

  const effectiveConfig: AgentConfig = {
    wsUrl: customConfig?.wsUrl || config?.wsUrl || '',
    token: customConfig?.token || config?.token || '',
  }

  if (!effectiveConfig.wsUrl) {
    throw new Error('[uni-devtools-agent] wsUrl is missing from configuration')
  }

  // 拼接带有预共享 Devframe 鉴权 token 与探针标记的 WebSocket 地址
  const separator = effectiveConfig.wsUrl.includes('?') ? '&' : '?'
  let fullWsUrl = effectiveConfig.token
    ? `${effectiveConfig.wsUrl}${separator}devframe_auth_token=${encodeURIComponent(effectiveConfig.token)}`
    : effectiveConfig.wsUrl

  // 携带探针标记（供 node 侧 relay AgentRegistry 识别定向连接）
  if (!fullWsUrl.includes('client=uni-agent')) {
    fullWsUrl += `${fullWsUrl.includes('?') ? '&' : '?'}client=uni-agent`
  }

  const socketHandle = createUniSocketChannel(fullWsUrl)

  // 探针暴露给 node 侧调用的客户端函数表（wire 层精确字符串契约）
  const clientFunctions = {
    'uni-devtools:agent:getComponentTree': (): PageComponentTree[] => {
      return collectComponentTree()
    },
    'uni-devtools:agent:ping': (): number => {
      return Date.now()
    },
    'uni-devtools:agent:getComponentState': (params: { id: string } | string): ComponentStateResult => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentState(id)
    },
    'uni-devtools:agent:updateComponentState': (params: any, maybeKey?: string, maybeVal?: unknown): UpdateStateResult => {
      if (typeof params === 'object' && params !== null && 'id' in params) {
        return updateComponentState(params)
      }
      return updateComponentState({ id: params, key: maybeKey!, value: maybeVal })
    },
  }

  const rpc = createRpcClient(clientFunctions, {
    channel: socketHandle.channel,
  })

  const instance: AgentInstance = {
    rpc,
    socketHandle,
    dispose: () => {
      socketHandle.dispose()
      if (activeAgentInstance === instance) {
        activeAgentInstance = null
      }
    },
  }

  activeAgentInstance = instance
  return instance
}

export function getAgentInstance(): AgentInstance | null {
  return activeAgentInstance
}

export function disposeAgent(): void {
  if (activeAgentInstance) {
    activeAgentInstance.dispose()
    activeAgentInstance = null
  }
}

export {
  collectComponentTree,
  createUniSocketChannel,
  getComponentState,
  getRegisteredInstance,
  updateComponentState,
}
