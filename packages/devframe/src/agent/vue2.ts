/**
 * Vue 2（webpack 构建线）探针入口
 *
 * 与 Vite + Vue 3 线的 `./agent` 入口并列，产物形态**有意不同**：
 * 本入口预构建为 `dist/agent-vue2.mjs`（esbuild bundle），而不是源码直发——
 * webpack 4 / vue-cli 4 默认不转译 node_modules 里的 TS，源码直发无法被消费。
 *
 * 冻结契约见讨论记录 `batch-interface.md`：
 * - 子路径 `@uni-helper/devtools-devframe/agent/vue2`，导出 `initAgent()`
 * - 配置模块 `virtual:uni-devtools-agent`，形状 `{ wsUrl, token, clientMarker }`
 *
 * Vue 2 探针**不注册** Vue 3 专属方法：
 * - recomputeComponentState（Vue 2 computed 不需要重算）
 * - getComponentRenderCode（Vue 2 无 template 编译产物可读）
 * - pinia 三条（Pinia 依赖 Vue 3 Composition API）
 */

import { createRpcClient } from 'devframe/rpc/client'
import { config } from 'virtual:uni-devtools-agent'
import type { ClearNetworkRecordsResult, GetNetworkRecordsResult } from '../types.ts'
import { type UniSocketChannelHandle, createUniSocketChannel } from './socket'
import { bindPushDeps, cancelScheduledPush, resetPushGate, schedulePushComponentTree } from './push.ts'
import { navigateInMiniProgram } from './navigate.ts'
import { type PageComponentTree, collectComponentTree, getVueRuntimeVersion } from './tree'
import {
  type ComponentStateResult,
  type UpdateStateResult,
  getComponentState,
  updateComponentState,
} from './state'
import {
  cancelScheduledNetworkPush,
  clearNetworkRecords,
  getNetworkRecords,
  installNetworkInterceptors,
  resetNetworkPushState,
  scheduleNetworkPush,
} from './network.ts'

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

  // 快照比对兜底（轮询检测 data 变更）
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
    /* eslint-disable no-console */
    onOpen: () => {
      console.log('[uni-devtools-agent] DevTools connected, pushing initial state')
      schedulePushComponentTree(100)
      resetNetworkPushState()
      scheduleNetworkPush(100)
    },
    onError: (err) => {
      console.error('[uni-devtools-agent] Socket error:', err)
    },
    /* eslint-enable no-console */
  })

  // Vue 2 探针客户端函数表（移除 Vue 3 专属方法）
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
    'uni-devtools:agent:getNetworkRecords': (params?: any): GetNetworkRecordsResult => {
      return getNetworkRecords(params)
    },
    'uni-devtools:agent:clearNetworkRecords': (): ClearNetworkRecordsResult => {
      return clearNetworkRecords()
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
      const uniObj = typeof uni !== 'undefined'
        ? uni
        : ((typeof globalThis !== 'undefined' && (globalThis as any).uni)
          || (typeof wx !== 'undefined' ? wx : (typeof globalThis !== 'undefined' ? (globalThis as any).wx : undefined)))
      if (!uniObj) {
        return Promise.resolve({ ok: false, error: 'uni/wx runtime is not available' })
      }

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
  installNetworkInterceptors({
    getActiveInstance: () => activeAgentInstance,
    getUni: () => (typeof uni !== 'undefined'
      ? uni
      : ((typeof globalThis !== 'undefined' && (globalThis as any).uni)
        || (typeof wx !== 'undefined' ? wx : (typeof globalThis !== 'undefined' ? (globalThis as any).wx : undefined)))),
  })
  resetPushGate()
  resetNetworkPushState()
  setupChangeDetectionHooks()
  return instance
}

export function getAgentInstance(): AgentInstance | null {
  return activeAgentInstance
}

export function disposeAgent(): void {
  cancelScheduledPush()
  cancelScheduledNetworkPush()
  if (activeAgentInstance) {
    activeAgentInstance.dispose()
    activeAgentInstance = null
  }
}
