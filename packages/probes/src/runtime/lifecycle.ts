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
  pushComponentTreeNow,
  resetPushGate,
  scheduleNotifyComponentRendered,
  schedulePushComponentTree,
} from './push.ts'
import { getVueDevtoolsHook } from './devtools-hook.ts'
import { getComponentIdOfInstance } from './tree.ts'
import {
  cancelScheduledNetworkPush,
  installNetworkInterceptors,
  resetNetworkPushState,
  scheduleNetworkPush,
} from './network.ts'
import { installStorageWriteInterceptors } from './storage.ts'

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
 * 收到过组件事件 = 运行时的事件通道是通的，组件树的增删改都会有事件，快照轮询
 * 就不必再跑。旧版运行时把事件裁掉、或 Vue 2 线时它恒为 false，轮询照常兜底。
 * 进程级，与钩子订阅同生命周期。
 */
let componentEventsObserved = false

/**
 * 首次收到组件事件时打一行日志：事件通道是否接通只在运行时才知道（各家小程序
 * 运行时的全局对象不同），控制台也未必看得到模块内的 globalThis，这行日志是
 * 现场确认「已切换为事件驱动」的唯一直接证据。
 */
function markComponentEventsObserved(): void {
  if (componentEventsObserved) return
  componentEventsObserved = true
  console.log(
    '[uni-devtools-agent] 已接收到 Vue 组件事件：组件树改为事件驱动推送，停止快照轮询',
  )
}

/**
 * 安装进程级全局事件钩子
 *
 * 直接读 globalThis 上的 wx/uni：它们是平台运行时的全局单例事件总线，
 * RuntimeAdapter 没有（也不必）抽象这几个事件源。
 */
function ensureProcessGlobalHooks(): void {
  if (processGlobalHooksInstalled) {
    return
  }
  processGlobalHooksInstalled = true

  // 小程序原生页面路由事件（wx 全局，仅微信系可用）
  try {
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

  // Vue DevTools 全局钩子：Vue 3 入口在 createApp 之前已装好（devtools-hook.ts），
  // Vue 2 线没有逐组件事件，这里拿不到钩子，继续靠快照轮询
  try {
    const hook = getVueDevtoolsHook()
    if (hook) {
      hook.on('component:added', () => {
        markComponentEventsObserved()
        schedulePushComponentTree(300)
      })
      hook.on('component:updated', (...args: any[]) => {
        markComponentEventsObserved()
        schedulePushComponentTree(300)
        // 参数为 (app, uid, parentUid, instance)。值变了树推送过不了内容门，
        // 要单独上报重渲染，面板才知道去重拉状态
        const instance = args[3]
        scheduleNotifyComponentRendered(
          getComponentIdOfInstance(instance) ??
            getComponentIdOfInstance(instance?.proxy),
        )
      })
      hook.on('component:removed', () => {
        markComponentEventsObserved()
        schedulePushComponentTree(300)
      })
    }
  } catch {}
}

/**
 * 实例级快照轮询定时器（随 Agent 实例生命周期启停）
 *
 * 快照轮询只是兜底：组件事件通道不通时（Vue 2 线、裁掉了 devtools 事件的运行时），
 * 组件增删与「小程序里改 data」就没有事件可听。事件通道一旦通了（见
 * componentEventsObserved），每轮直接跳过，不再在逻辑层线程上全量采集组件树。
 *
 * 开销控制：未连上 node 时整轮跳过（不采集组件树，避免在没人看的时候占用逻辑层
 * 线程）；连上时直接走 pushComponentTreeNow——它只采集、序列化一次，并用同一份
 * 序列化结果做「内容没变就不推」的比对。
 */
let snapshotPollingTimer: any = null

function startSnapshotPolling(): void {
  if (snapshotPollingTimer !== null) {
    return // 已启动，避免重复
  }

  snapshotPollingTimer = setInterval(() => {
    if (componentEventsObserved) return
    if (!activeAgentInstance?.socketHandle.isConnected()) return
    pushComponentTreeNow().catch(() => {})
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
      // 每次（重）连上都要放行首推：node 侧可能已重启、或刚把本探针切成活跃探针，
      // 它手上的树是空的——内容比对门不能挡住「内容相同但对端没有」的快照
      resetPushGate()
      schedulePushComponentTree(100)
      resetNetworkPushState()
      scheduleNetworkPush(100)
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

  // === 步骤 4B：安装 Storage 写拦截器 ===
  installStorageWriteInterceptors({
    getActiveInstance: () => activeAgentInstance,
    getUni: () => (globalThis as any).uni,
  })

  // === 步骤 5：重置推送门与网络状态门 ===
  // 重连/重建实例后首推必须放行：node 侧（尤其重启后的 sidecar）sharedState
  // 可能仍是空初值，内容比对门不能挡住「内容相同但没送达过」的首推
  resetPushGate()
  resetNetworkPushState()

  // === 步骤 6A：安装进程级全局事件钩子（只执行一次） ===
  ensureProcessGlobalHooks()

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
