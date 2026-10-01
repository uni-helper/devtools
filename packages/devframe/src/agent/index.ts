/**
 * Uni-Helper DevTools 运行时探针入口
 * 运行在小程序 / App 等受检沙箱环境
 * 契约：
 * - 探针 RPC 客户端：createRpcClient(functions, { channel })
 * - 虚拟模块：import { config } from 'virtual:uni-devtools-agent'
 * - 导出函数名：'uni-devtools:agent:getComponentTree', 'uni-devtools:agent:ping'
 * - 变更推送：主动采集树快照并调用 'uni-helper-devtools:push-component-tree'
 * - 约束：禁止使用 window / document / location
 */

import { createRpcClient } from 'devframe/rpc/client'
import { config } from 'virtual:uni-devtools-agent'
import { type UniSocketChannelHandle, createUniSocketChannel } from './socket'
import { type PageComponentTree, collectComponentTree, getRegisteredInstance } from './tree'
import {
  type ComponentStateResult,
  type UpdateStateResult,
  getComponentState,
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
let pushTimer: any = null
let changeHooksInstalled = false

declare const wx: any
declare const uni: any
declare const getCurrentPages: any

/**
 * 带有 debounce 防抖的组件树快照推送触发器（默认 300ms 防抖）
 */
export function schedulePushComponentTree(delay = 300): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
  }
  pushTimer = setTimeout(() => {
    pushTimer = null
    pushComponentTreeNow().catch(() => {})
  }, delay)
}

/**
 * 立即采集当前活跃页面的组件树快照并推送到 node 侧 sharedState
 */
export async function pushComponentTreeNow(): Promise<void> {
  if (!activeAgentInstance || !activeAgentInstance.socketHandle.isConnected()) {
    return
  }

  const pages = collectComponentTree()
  const snapshot = {
    fetchedAt: Date.now(),
    pages,
  }

  try {
    await activeAgentInstance.rpc.$call('uni-helper-devtools:push-component-tree', snapshot)
  }
  catch {
    // 允许网络暂未就绪或未注册该方法时静默跳过
  }
}

/**
 * 安装生命周期与路由变更监听器，自动发现组件树变化
 */
function setupChangeDetectionHooks(): void {
  if (changeHooksInstalled)
    return
  changeHooksInstalled = true

  // 1. 小程序原生页面路由事件（微信/小程序全局路由变更）
  if (typeof wx !== 'undefined' && typeof wx.onAppRoute === 'function') {
    try {
      wx.onAppRoute(() => {
        schedulePushComponentTree(200)
      })
    }
    catch {}
  }

  // 2. uni 路由跳转拦截（涵盖 navigateTo / redirectTo / switchTab / navigateBack / reLaunch）
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

  // 3. Vue DevTools 全局钩子接入（组件 mount/update 时触发）
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

  // 4. 快照比对兜底：uni 的 mp 构建里 __VUE_DEVTOOLS_GLOBAL_HOOK__ 通常不存在，
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

  const socketHandle = createUniSocketChannel({
    wsUrl: fullWsUrl,
    onOpen: () => {
      // 连接就绪后立即触发初次快照推送
      schedulePushComponentTree(100)
    },
  })

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
      const res = typeof params === 'object' && params !== null && 'id' in params
        ? updateComponentState(params)
        : updateComponentState({ id: params, key: maybeKey!, value: maybeVal })
      // 修改生效后触发组件树与状态推送
      schedulePushComponentTree(100)
      return res
    },
    'uni-devtools:agent:getRouterInfo': (): {
      currentRoute: { path: string, fullPath?: string, query?: Record<string, unknown> } | null
      stack: Array<{ path: string, query?: Record<string, unknown>, options?: Record<string, unknown> }>
    } => {
      const getPages = typeof getCurrentPages === 'function'
        ? getCurrentPages
        : (typeof globalThis !== 'undefined' && typeof (globalThis as any).getCurrentPages === 'function'
            ? (globalThis as any).getCurrentPages
            : undefined)

      const pages = getPages ? getPages() : []
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
    'uni-devtools:agent:navigate': async (params: { path: string }): Promise<{ ok: boolean, error?: string }> => {
      const url = params?.path
      if (!url) {
        return { ok: false, error: 'Path is required' }
      }
      const uniObj = typeof uni !== 'undefined' ? uni : (globalThis as any).uni
      if (!uniObj) {
        return { ok: false, error: 'uni runtime is not available' }
      }

      return new Promise((resolve) => {
        uniObj.navigateTo({
          url,
          success: () => {
            schedulePushComponentTree(200)
            resolve({ ok: true })
          },
          fail: (err: any) => {
            if (typeof uniObj.switchTab === 'function') {
              uniObj.switchTab({
                url,
                success: () => {
                  schedulePushComponentTree(200)
                  resolve({ ok: true })
                },
                fail: () => resolve({ ok: false, error: err?.errMsg || String(err) }),
              })
              return
            }
            resolve({ ok: false, error: err?.errMsg || String(err) })
          },
        })
      })
    },
  }

  const rpc = createRpcClient(clientFunctions, {
    channel: socketHandle.channel,
  })

  const instance: AgentInstance = {
    rpc,
    socketHandle,
    dispose: () => {
      if (pushTimer) {
        clearTimeout(pushTimer)
        pushTimer = null
      }
      socketHandle.dispose()
      if (activeAgentInstance === instance) {
        activeAgentInstance = null
      }
    },
  }

  activeAgentInstance = instance
  setupChangeDetectionHooks()
  return instance
}

export function getAgentInstance(): AgentInstance | null {
  return activeAgentInstance
}

export function disposeAgent(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
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
