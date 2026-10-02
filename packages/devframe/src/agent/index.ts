/**
 * Uni-Helper DevTools 运行时探针入口
 * 运行在小程序 / App 等受检沙箱环境
 * 契约：
 * - 探针 RPC 客户端：createRpcClient(functions, { channel })
 * - 虚拟模块：import { config } from 'virtual:uni-devtools-agent'
 * - 导出函数名：'uni-devtools:agent:getComponentTree', 'uni-devtools:agent:ping'
 * - 变更推送：主动采集树快照并调用 'uni-helper-devtools:push-component-tree'
 * （浏览器全局禁用由 eslint no-restricted-globals 执法）
 */

import { createRpcClient } from 'devframe/rpc/client'
import { config } from 'virtual:uni-devtools-agent'
import { type UniSocketChannelHandle, createUniSocketChannel } from './socket'
import { bindPushDeps, cancelScheduledPush, pushComponentTreeNow, resetPushGate, schedulePushComponentTree } from './push.ts'
import { navigateInMiniProgram } from './navigate.ts'
import { type PageComponentTree, collectComponentTree, getRegisteredInstance, getVueRuntimeVersion } from './tree'
import { type PiniaStateResult, type PiniaStoresResult, type UpdatePiniaStateResult, getPiniaState, getPiniaStores, updatePiniaState } from './pinia'
import {
  type ComponentStateResult,
  type UpdateStateResult,
  getComponentState,
  recomputeComponentState,
  updateComponentState,
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
let changeHooksInstalled = false

declare const wx: any
declare const uni: any
declare const getCurrentPages: any

/** 安全读取当前页面栈（mp 全局 getCurrentPages 可能不存在或抛错） */
function getCurrentPagesSafe(): any[] {
  const getPages = typeof getCurrentPages === 'function'
    ? getCurrentPages
    : (typeof globalThis !== 'undefined' && typeof (globalThis as any).getCurrentPages === 'function'
        ? (globalThis as any).getCurrentPages
        : undefined)
  try {
    const pages = getPages ? getPages() : []
    return Array.isArray(pages) ? pages : []
  }
  catch {
    return []
  }
}

function setupChangeDetectionHooks(): void {
  if (changeHooksInstalled)
    return
  changeHooksInstalled = true

  // 小程序原生页面路由事件（wx 全局，仅微信系可用）
  if (typeof wx !== 'undefined' && typeof wx.onAppRoute === 'function') {
    try {
      wx.onAppRoute(() => {
        schedulePushComponentTree(200)
      })
    }
    catch {}
  }

  // uni 路由跳转拦截（涵盖 navigateTo / redirectTo / switchTab / navigateBack / reLaunch）
  const uniObj = typeof uni !== 'undefined' ? uni : (globalThis as any).uni
  if (uniObj && typeof uniObj.addInterceptor === 'function') {
    const routeMethods = ['navigateTo', 'redirectTo', 'reLaunch', 'switchTab', 'navigateBack']
    for (const method of routeMethods) {
      try {
        uniObj.addInterceptor(method, {
          complete() {
            schedulePushComponentTree(250)
          },
        })
      }
      catch {}
    }
  }

  // Vue DevTools 全局钩子接入（组件 mount/update 时触发）
  try {
    const globalObj = globalThis as any
    const existingHook = globalObj.__VUE_DEVTOOLS_GLOBAL_HOOK__
    if (existingHook && typeof existingHook.on === 'function') {
      existingHook.on('component:added', () => schedulePushComponentTree(300))
      existingHook.on('component:updated', () => schedulePushComponentTree(300))
      existingHook.on('component:removed', () => schedulePushComponentTree(300))
    }
  }
  catch {}

  // 快照比对兜底：uni 的 mp 构建里 __VUE_DEVTOOLS_GLOBAL_HOOK__ 通常不存在，
  // 「小程序里改 data」没有任何事件可听——而这恰恰是用户最高频的场景。轻量轮询
  // 只做一次序列化比对，内容没变就不推送；有 hook 事件时大部分变更已被上面的
  // 防抖推送消费，这里多为空转。采集深度受 tree.ts 的 maxDepth 约束，dev 探针
  // 场景代价可接受。
  let lastSnapshot = ''
  setInterval(() => {
    try {
      const snapshot = JSON.stringify({ pages: collectComponentTree() })
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot
        schedulePushComponentTree(0)
      }
    }
    catch {}
  }, 2000)
}

export function initAgent(customConfig?: Partial<AgentConfig>): AgentInstance {
  // 单例防重复初始化（应对 HMR 或多页面重复注入）
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

  const separator = effectiveConfig.wsUrl.includes('?') ? '&' : '?'
  let fullWsUrl = effectiveConfig.token
    ? `${effectiveConfig.wsUrl}${separator}devframe_auth_token=${encodeURIComponent(effectiveConfig.token)}`
    : effectiveConfig.wsUrl

  // 携带探针标记（供 node 侧 relay AgentRegistry 识别定向连接）
  if (!fullWsUrl.includes('client=uni-agent')) {
    fullWsUrl += `${fullWsUrl.includes('?') ? '&' : '?'}client=uni-agent`
  }

  const socketHandle = createUniSocketChannel({
    wsUrl: fullWsUrl,
    onOpen: () => {
      schedulePushComponentTree(100)
    },
  })

  // 探针暴露给 node 侧调用的客户端函数表（wire 层精确字符串契约）
  const clientFunctions = {
    'uni-devtools:agent:getComponentTree': (): { pages: PageComponentTree[], vueVersion?: string } => {
      return {
        pages: collectComponentTree(),
        vueVersion: getVueRuntimeVersion(),
      }
    },
    'uni-devtools:agent:ping': (): number => {
      return Date.now()
    },
    'uni-devtools:agent:getComponentState': (params: { id: string } | string): ComponentStateResult => {
      const id = typeof params === 'string' ? params : params?.id
      return getComponentState(id)
    },
    'uni-devtools:agent:updateComponentState': (params: any, maybeKey?: string, maybeVal?: unknown): UpdateStateResult => {
      const res = typeof params === 'object' && params !== null && 'id' in params
        ? updateComponentState(params)
        : updateComponentState({ id: params, key: maybeKey!, value: maybeVal })
      schedulePushComponentTree(100)
      return res
    },
    'uni-devtools:agent:recomputeComponentState': (params: { id: string, section: string, path: string[] }): { ok: boolean } => {
      return recomputeComponentState(params.id, params.section, params.path)
    },
    'uni-devtools:agent:getPiniaStores': (): PiniaStoresResult => {
      return getPiniaStores()
    },
    'uni-devtools:agent:getPiniaState': (args: { id: string } | string): PiniaStateResult => {
      const id = typeof args === 'string' ? args : args?.id
      return getPiniaState(id)
    },
    'uni-devtools:agent:updatePiniaState': (params: any): UpdatePiniaStateResult => {
      return updatePiniaState(params)
    },
    'uni-devtools:agent:getRouterInfo': (): {
      currentRoute: { path: string, fullPath?: string, query?: Record<string, unknown> } | null
      stack: Array<{ path: string, query?: Record<string, unknown>, options?: Record<string, unknown> }>
    } => {
      const pages = getCurrentPagesSafe()
      const stack = pages.map((page: any) => {
        const rawRoute = page?.route || page?.__route__ || ''
        const path = rawRoute ? (rawRoute.startsWith('/') ? rawRoute : `/${rawRoute}`) : '/'
        const query = page?.options || page?.$page?.options || {}
        return {
          path,
          query,
          options: query,
        }
      })

      const top = stack[stack.length - 1]
      const currentRoute = top
        ? {
            path: top.path,
            fullPath: top.path,
            query: top.query,
          }
        : null

      return {
        currentRoute,
        stack,
      }
    },
    'uni-devtools:agent:navigate': (params: { path: string }): Promise<{ ok: boolean, error?: string }> => {
      const url = params?.path
      if (!url) {
        return Promise.resolve({ ok: false, error: 'Path is required' })
      }
      const uniObj = typeof uni !== 'undefined' ? uni : (globalThis as any).uni
      if (!uniObj) {
        return Promise.resolve({ ok: false, error: 'uni runtime is not available' })
      }

      // 同页导航在探针侧改用 redirect 防叠栈（决策逻辑与单测见 navigate.ts）
      return navigateInMiniProgram(uniObj, url, getCurrentPagesSafe)
    },
  }

  const rpc = createRpcClient(clientFunctions, {
    channel: socketHandle.channel,
  })

  bindPushDeps({ getActiveInstance: () => activeAgentInstance })

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
  // 重连/重建实例后首推必须放行：node 侧（尤其重启后的 sidecar）sharedState
  // 可能仍是空初值，内容比对门不能挡住「内容相同但没送达过」的首推
  resetPushGate()
  setupChangeDetectionHooks()
  return instance
}

export function getAgentInstance(): AgentInstance | null {
  return activeAgentInstance
}

export function disposeAgent(): void {
  cancelScheduledPush()
  if (activeAgentInstance) {
    activeAgentInstance.dispose()
    activeAgentInstance = null
  }
}

export {
  collectComponentTree,
  createUniSocketChannel,
  pushComponentTreeNow,
  schedulePushComponentTree,
  getComponentState,
  getPiniaState,
  getPiniaStores,
  getRegisteredInstance,
  recomputeComponentState,
  updateComponentState,
  updatePiniaState,
}
