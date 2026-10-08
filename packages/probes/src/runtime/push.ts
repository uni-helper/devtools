/**
 * 组件树推送调度（探针内部模块）。
 *
 * 独立成模块的原因：编译期插桩注入的 render-hook 只依赖「调度推送」这一个
 * 能力——若直接依赖探针入口 index.ts，会把 virtual:uni-devtools-agent（仅构建
 * 期可解析）与整个 socket/rpc 链拖进依赖闭包，也使 render-hook 无法脱离完整
 * 探针被单测。
 */
import { NODE_RPC } from '@uni-helper/devtools-shared'
import type { ComponentTreeResult } from '@uni-helper/devtools-shared'
import { collectComponentTree, getVueRuntimeVersion } from './tree.ts'

interface PushDeps {
  getActiveInstance: () => {
    rpc: any
    socketHandle: { isConnected: () => boolean }
  } | null
}

let deps: PushDeps | null = null
let pushTimer: any = null

/** 探针入口 initAgent 注入实例访问器（避免循环导入） */
export function bindPushDeps(next: PushDeps): void {
  deps = next
}

/** 带防抖的组件树快照推送触发器 */
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
 * 立即采集当前活跃页面的组件树快照并推送到 node 侧 sharedState。
 *
 * 带内容比对门：渲染钩子（render-hook）让每次渲染都调度推送，持续重渲染的页面
 * （动画/倒计时）若不加门会变成 300ms 间隔的全量推送风暴——序列化成本与
 * sharedState 写放大都吃不消。与 setupChangeDetectionHooks 的 2s 轮询共用
 * 「内容没变就不推」的语义（同一把 lastPushedTreeJson 锁，两路互不重复推）。
 */
let lastPushedTreeJson = ''

export async function pushComponentTreeNow(): Promise<void> {
  const instance = deps?.getActiveInstance()
  if (!instance || !instance.socketHandle.isConnected()) {
    return
  }

  const pages = collectComponentTree()
  const vueVersion = getVueRuntimeVersion()
  const snapshot: ComponentTreeResult = {
    fetchedAt: Date.now(),
    pages,
    ...(vueVersion ? { vueVersion } : {}),
  }

  let treeJson: string
  try {
    treeJson = `${vueVersion ?? ''}:${JSON.stringify(pages)}`
  } catch {
    treeJson = ''
  }
  if (treeJson === lastPushedTreeJson) {
    return
  }
  lastPushedTreeJson = treeJson

  try {
    await instance.rpc.$call(NODE_RPC.pushComponentTree, snapshot)
  } catch {
    // 允许网络暂未就绪或未注册该方法时静默跳过
  }
}

/** 取消待发的防抖推送（disposeAgent 用） */
export function cancelScheduledPush(): void {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
}

// ---------------------------------------------------------------------------
// 重渲染上报（与树推送分开：树推送有内容门，setup 值变化过不了那道门）
// ---------------------------------------------------------------------------

let renderNotifyTimer: any = null
const pendingRenderedIds = new Set<string>()

/**
 * 登记「组件 id 刚渲染过」，窗口到期合并上报给 node。
 *
 * 是**合并窗口**而非防抖：定时器只在空闲时启动、不随新渲染重置，否则动画/倒计时
 * 这类持续重渲染的组件会把定时器一直顶回去，永远不发声。窗口内同一组件多次渲染
 * 只记一次（Set 去重）。
 *
 * id 由调用方（render-hook）在渲染时解析——那时才拿得到组件实例。
 */
export function scheduleNotifyComponentRendered(
  id: string | undefined,
  delay = 300,
): void {
  if (!id) return
  pendingRenderedIds.add(id)
  if (renderNotifyTimer !== null) return
  renderNotifyTimer = setTimeout(() => {
    renderNotifyTimer = null
    const ids = [...pendingRenderedIds]
    pendingRenderedIds.clear()
    notifyComponentRenderedNow(ids).catch(() => {})
  }, delay)
}

async function notifyComponentRenderedNow(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const instance = deps?.getActiveInstance()
  if (!instance || !instance.socketHandle.isConnected()) {
    return
  }
  try {
    await instance.rpc.$call(NODE_RPC.notifyComponentRendered, { ids })
  } catch {
    // 与树推送同语义：网络未就绪或方法未注册时静默跳过
  }
}

/** 取消待发的重渲染上报并丢弃待发集合（disposeAgent 用） */
export function cancelScheduledRenderNotify(): void {
  if (renderNotifyTimer !== null) {
    clearTimeout(renderNotifyTimer)
    renderNotifyTimer = null
  }
  pendingRenderedIds.clear()
}

/** 探针重建实例时重置内容比对门（见 initAgent 内调用处的注释） */
export function resetPushGate(): void {
  lastPushedTreeJson = ''
}

/** 测试用：读当前推送门内容 */
export function __lastPushedTreeJsonForTest(): string {
  return lastPushedTreeJson
}
