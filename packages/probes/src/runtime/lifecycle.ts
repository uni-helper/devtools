/**
 * Agent 生命周期管道（探针内部模块）
 *
 * Vue 2/3 两个入口（`index.ts` / `vue2.ts`）共用的初始化与销毁逻辑：
 * 单例状态、WebSocket + RPC 装配、变更检测钩子、定时器清理。
 * 入口只负责组装各自版本的 RPC 方法表与运行时差异（`getUni`）。
 *
 * 清理责任分层（关键）：
 * - **进程级全局事件钩子**（`wx.onAppRoute` / `uni.addInterceptor` /
 *   `__VUE_DEVTOOLS_GLOBAL_HOOK__`）是宿主运行时的全局单例事件总线，小程序侧
 *   通常没有对应的反注册 API，因此**只安装一次、永不重置**；否则二次初始化会
 *   叠加挂载，第 N 次初始化触发 N 遍推送。
 * - **实例级快照轮询定时器**随 Agent 实例启停，`instance.dispose()` 与
 *   `disposeAgent()` 都会清理，避免 HMR / 多页面重复注入时的定时器泄漏。
 */

import { createRpcClient } from 'devframe/rpc/client'
import type { RuntimeAdapter } from '../adapter/types.ts'
import {
  type UniSocketChannelHandle,
  createUniSocketChannel,
} from '../socket/index.ts'
import {
  bindPushDeps,
  cancelScheduledPush,
  cancelScheduledRenderNotify,
  resetPushGate,
  schedulePushComponentTree,
} from './push.ts'
import { collectComponentTree } from './tree.ts'
import {
  cancelScheduledNetworkPush,
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

export interface AgentPipelineOptions {
  /** 运行时适配器（必需，显式传入，Runtime 层不再反查平台全局） */
  adapter: RuntimeAdapter
  /** 由入口组装的 RPC 方法表（基础方法 + 版本专属方法） */
  clientFunctions: Record<string, any>
  /** 自定义配置（可选，不传则从 globalThis.__UNI_DEVTOOLS_CONFIG__ 获取） */
  customConfig?: Partial<AgentConfig>
}

/** 模块级单例（由本模块统一持有，避免两个入口各自维护一份） */
let activeAgentInstance: AgentInstance | null = null

/** 进程级全局事件钩子是否已安装（只安装一次，永不重置，见文件头说明） */
let processGlobalHooksInstalled = false

/**
 * 安装进程级全局事件钩子
 *
 * 注意：这里仍然需要访问全局变量 wx/uni，因为这些是平台运行时的全局单例事件总线
 * 但现在通过 adapter 来访问，而不是直接声明全局变量
 */
function ensureProcessGlobalHooks(adapter: RuntimeAdapter): void {
  if (processGlobalHooksInstalled) {
    return
  }
  processGlobalHooksInstalled = true

  // 小程序原生页面路由事件（wx 全局，仅微信系可用）
  // 通过 adapter 获取平台运行时，避免直接访问全局 wx
  try {
    const app = adapter.getApp()
    const wx = (globalThis as any).wx
    if (wx && typeof wx.onAppRoute === 'function') {
      wx.onAppRoute(() => {
        schedulePushComponentTree(200)
      })
    }
  } catch {}

  // uni 路由跳转拦截（涵盖 navigateTo / redirectTo / switchTab / navigateBack / reLaunch）
  try {
    const uniObj = (globalThis as any).uni
    if (uniObj && typeof uniObj.addInterceptor === 'function') {
      const routeMethods = [
        'navigateTo',
        'redirectTo',
        'reLaunch',
        'switchTab',
        'navigateBack',
      ]
      for (const method of routeMethods) {
        try {
          uniObj.addInterceptor(method, {
            complete() {
              schedulePushComponentTree(250)
            },
          })
        } catch {}
      }
    }
  } catch {}

  // Vue DevTools 全局钩子接入（组件 mount/update 时触发）
  try {
    const globalObj = globalThis as any
    const existingHook = globalObj.__VUE_DEVTOOLS_GLOBAL_HOOK__
    if (existingHook && typeof existingHook.on === 'function') {
      existingHook.on('component:added', () => schedulePushComponentTree(300))
      existingHook.on('component:updated', () => schedulePushComponentTree(300))
      existingHook.on('component:removed', () => schedulePushComponentTree(300))
    }
  } catch {}
}

/**
 * 实例级快照轮询定时器（随 Agent 实例生命周期启停）
 *
 * 快照轮询是兜底机制：uni 的 mp 构建里 __VUE_DEVTOOLS_GLOBAL_HOOK__ 通常不存在，
 * 「小程序里改 data」没有任何事件可听——这恰恰是用户最高频的场景。轻量轮询只做
 * 一次序列化比对，内容没变就不推送；有 hook 事件时大部分变更已被防抖推送消费，
 * 这里多为空转。采集深度受 tree.ts 的 maxDepth 约束，dev 探针场景代价可接受。
 */
let snapshotPollingTimer: any = null

function startSnapshotPolling(): void {
  if (snapshotPollingTimer !== null) {
    return // 已启动，避免重复
  }

  let lastSnapshot = ''
  snapshotPollingTimer = setInterval(() => {
    try {
      const snapshot = JSON.stringify({ pages: collectComponentTree() })
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot
        schedulePushComponentTree(0)
      }
    } catch {}
  }, 2000)
}

function stopSnapshotPolling(): void {
  if (snapshotPollingTimer !== null) {
    clearInterval(snapshotPollingTimer)
    snapshotPollingTimer = null
  }
}

/**
 * Agent 初始化管道（严格按序执行）
 *
 * 单例防重复初始化（应对 HMR 或多页面重复注入）：已有实例时直接返回，不重建。
 */
export function initAgentPipeline(
  options: AgentPipelineOptions,
): AgentInstance {
  if (activeAgentInstance) {
    return activeAgentInstance
  }

  // 从全局配置获取兜底值
  const globalConfig =
    typeof globalThis !== 'undefined'
      ? (globalThis as any).__UNI_DEVTOOLS_CONFIG__
      : undefined

  const effectiveConfig: AgentConfig = {
    wsUrl: options.customConfig?.wsUrl || globalConfig?.wsUrl || '',
    token: options.customConfig?.token || globalConfig?.token || '',
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

  // === 步骤 1：创建 WebSocket 通道（通过 adapter） ===
  const socketHandle = createUniSocketChannel({
    wsUrl: fullWsUrl,
    adapter: options.adapter, // 显式传入 adapter
    /* eslint-disable no-console */
    onOpen: () => {
      console.log(
        '[uni-devtools-agent] DevTools connected, pushing initial state',
      )
      schedulePushComponentTree(100)
      resetNetworkPushState()
      scheduleNetworkPush(100)
    },
    onError: (err) => {
      console.error('[uni-devtools-agent] Socket error:', err)
    },
    /* eslint-enable no-console */
  })

  // === 步骤 2：创建 RPC Client ===
  const rpc = createRpcClient(options.clientFunctions, {
    channel: socketHandle.channel,
  })

  // === 步骤 3：绑定推送依赖 ===
  bindPushDeps({ getActiveInstance: () => activeAgentInstance })

  // === 步骤 4：安装网络拦截器 ===
  installNetworkInterceptors({
    getActiveInstance: () => activeAgentInstance,
    adapter: options.adapter,
    // 提供 getUni 回退，通过 globalThis 访问
    getUni: () => (globalThis as any).uni,
  })

  // === 步骤 5：重置推送门与网络状态门 ===
  // 重连/重建实例后首推必须放行：node 侧（尤其重启后的 sidecar）sharedState
  // 可能仍是空初值，内容比对门不能挡住「内容相同但没送达过」的首推
  resetPushGate()
  resetNetworkPushState()

  // === 步骤 6A：安装进程级全局事件钩子（只执行一次） ===
  ensureProcessGlobalHooks(options.adapter)

  // === 步骤 6B：启动实例级快照轮询定时器 ===
  startSnapshotPolling()

  const instance: AgentInstance = {
    rpc,
    socketHandle,
    dispose: () => {
      stopSnapshotPolling()
      socketHandle.dispose()
      if (activeAgentInstance === instance) {
        activeAgentInstance = null
      }
    },
  }

  activeAgentInstance = instance
  return instance
}

/** 获取当前活跃的 Agent 实例 */
export function getAgentInstance(): AgentInstance | null {
  return activeAgentInstance
}

/**
 * 清理并销毁当前 Agent 实例
 *
 * 取消待发推送 → 停止快照轮询 → 关闭 WebSocket → 清空单例。
 * 进程级全局钩子有意不撤销（见文件头说明）。
 */
export function disposeAgent(): void {
  cancelScheduledPush()
  cancelScheduledRenderNotify()
  cancelScheduledNetworkPush()
  stopSnapshotPolling()

  if (activeAgentInstance) {
    activeAgentInstance.dispose()
    activeAgentInstance = null
  }
}
