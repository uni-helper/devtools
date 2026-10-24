/**
 * Vue DevTools 全局钩子（`__VUE_DEVTOOLS_GLOBAL_HOOK__`）的探针侧安装。
 *
 * Vue 运行时在组件挂载 / 更新 / 卸载时向这个钩子发 `component:added` /
 * `component:updated` / `component:removed`——官方 DevTools 就是靠它做到事件驱动、
 * 无需轮询。uni 的 mp 版运行时（@dcloudio/uni-mp-vue）保留并适配了这套事件
 * （dev 构建恒发），但它**只在 createApp 那一刻读一次钩子**：那时全局上没有钩子，
 * 事件就全部丢弃，且 mp 里没有 window，不会走浏览器的迟到注入补救。
 *
 * mp 里没有任何人会装这个钩子，所以由探针在入口（早于用户 main 里的
 * createSSRApp）自己装一个最小实现。已有钩子（浏览器扩展、HBuilderX 等）时
 * 原样复用，绝不覆盖。
 */

export const VUE_DEVTOOLS_HOOK_KEY = '__VUE_DEVTOOLS_GLOBAL_HOOK__'
/** 浏览器环境里 Vue 早于钩子求值时登记的补挂回调（runtime-core setDevtoolsHook） */
const VUE_DEVTOOLS_HOOK_REPLAY_KEY = '__VUE_DEVTOOLS_HOOK_REPLAY__'

type HookListener = (...args: any[]) => void

export interface VueDevtoolsHookLike {
  on: (event: string, listener: HookListener) => void
}

export function getVueDevtoolsHook(): VueDevtoolsHookLike | undefined {
  const hook = (globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]
  return hook && typeof hook.on === 'function' ? hook : undefined
}

/**
 * 确保全局上有可订阅的 Vue DevTools 钩子，返回它；全局上已占着一个不像钩子的
 * 值时返回 undefined（不覆盖别人的东西，调用方退回轮询）。
 *
 * 必须早于 `createApp` 调用。钩子挂在 globalThis 上：uni 运行时按
 * window → globalThis 的顺序取目标，mp 里没有 window，浏览器里两者是同一个对象。
 *
 * 自装的钩子不缓存事件：Vue 随事件传组件实例，缓存会让已卸载的组件无法回收；
 * 订阅前发生的事件由连上 node 时的首推兜住。
 */
export function ensureVueDevtoolsHook(): VueDevtoolsHookLike | undefined {
  const target = globalThis as any
  const existing = getVueDevtoolsHook()
  if (existing) return existing
  if (target[VUE_DEVTOOLS_HOOK_KEY] != null) return undefined

  const listeners = new Map<string, Set<HookListener>>()
  const hook = {
    // Vue 拿到钩子后自己置 true
    enabled: false,
    on(event: string, listener: HookListener) {
      let set = listeners.get(event)
      if (!set) listeners.set(event, (set = new Set()))
      set.add(listener)
    },
    off(event: string, listener: HookListener) {
      listeners.get(event)?.delete(listener)
    },
    once(event: string, listener: HookListener) {
      const wrapped = (...args: any[]) => {
        hook.off(event, wrapped)
        listener(...args)
      }
      hook.on(event, wrapped)
    },
    emit(event: string, ...args: any[]) {
      for (const listener of listeners.get(event) ?? []) {
        try {
          listener(...args)
        } catch {
          // 订阅方出错不能抛回 Vue 的渲染流程
        }
      }
    },
  }
  target[VUE_DEVTOOLS_HOOK_KEY] = hook

  // Vue 已先于钩子初始化（浏览器环境）时，它留下了补挂回调；照官方扩展的做法回放
  const replay = target[VUE_DEVTOOLS_HOOK_REPLAY_KEY]
  if (Array.isArray(replay)) {
    for (const attach of replay) {
      try {
        attach(hook)
      } catch {}
    }
  }
  return hook
}
