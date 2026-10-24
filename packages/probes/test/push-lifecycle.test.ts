import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NODE_RPC } from '@uni-helper/devtools-shared'
import { NullAdapter } from '../src/adapter/types'

/**
 * 组件树推送与连接状态的配合：
 * - 没连上 node 时快照轮询不采集组件树（不在没人看的时候占用逻辑层线程）
 * - 每次（重）连上都放行一次首推，即使内容没变
 * - 没送达的推送不占住内容比对门，下一轮会重推
 */

/** 可控的假 socket：测试手动触发 open/close，记录发出的帧 */
function createSocketAdapter() {
  const sockets: Array<{
    sent: string[]
    open: () => void
    close: () => void
  }> = []
  const adapter = Object.assign(new NullAdapter(), {
    connectSocket: () => {
      const handlers: Record<string, (...args: any[]) => void> = {}
      const record = {
        sent: [] as string[],
        open: () => handlers.open?.(),
        close: () => handlers.close?.(1006, 'test'),
      }
      sockets.push(record)
      return {
        send: (data: string) => record.sent.push(data),
        close: () => {},
        onOpen: (fn: () => void) => (handlers.open = fn),
        onMessage: () => {},
        onClose: (fn: () => void) => (handlers.close = fn),
        onError: (fn: () => void) => (handlers.error = fn),
      }
    },
  })
  return { adapter, sockets }
}

const treePushes = (frames: string[]) =>
  frames.filter((frame) => frame.includes(NODE_RPC.pushComponentTree)).length

async function freshLifecycle() {
  vi.resetModules()
  return import('../src/runtime/lifecycle')
}

describe('组件树推送与连接状态', () => {
  const getCurrentPages = vi.fn(() => [])

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(globalThis as any).getCurrentPages = getCurrentPages
    getCurrentPages.mockClear()
  })

  afterEach(() => {
    delete (globalThis as any).getCurrentPages
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('未连上 node 时快照轮询不采集组件树', async () => {
    const lifecycle = await freshLifecycle()
    const { adapter } = createSocketAdapter()
    lifecycle.initAgentPipeline({
      adapter,
      clientFunctions: {},
      customConfig: { wsUrl: 'ws://test', token: 't' },
    })

    vi.advanceTimersByTime(10_000)

    expect(getCurrentPages).not.toHaveBeenCalled()
    lifecycle.disposeAgent()
  })

  it('断线重连后即使组件树没变也重推一次（node 侧可能已经清空）', async () => {
    const lifecycle = await freshLifecycle()
    const { adapter, sockets } = createSocketAdapter()
    lifecycle.initAgentPipeline({
      adapter,
      clientFunctions: {},
      customConfig: { wsUrl: 'ws://test', token: 't' },
    })

    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(500)
    expect(treePushes(sockets[0]!.sent)).toBe(1)

    sockets[0]!.close()
    await vi.advanceTimersByTimeAsync(1_000)
    sockets[1]!.open()
    await vi.advanceTimersByTimeAsync(500)

    expect(treePushes(sockets[1]!.sent)).toBe(1)
    lifecycle.disposeAgent()
  })
})

describe('组件事件驱动（Vue DevTools 钩子）', () => {
  const getCurrentPages = vi.fn(() => [])

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ;(globalThis as any).getCurrentPages = getCurrentPages
    getCurrentPages.mockClear()
  })

  afterEach(() => {
    delete (globalThis as any).getCurrentPages
    delete (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  async function startConnected() {
    const lifecycle = await freshLifecycle()
    const { ensureVueDevtoolsHook } =
      await import('../src/runtime/devtools-hook')
    const push = await import('../src/runtime/push')
    // 与 Vue 3 入口同序：先装钩子（早于 createApp），再起管道
    ensureVueDevtoolsHook()
    const { adapter, sockets } = createSocketAdapter()
    lifecycle.initAgentPipeline({
      adapter,
      clientFunctions: {},
      customConfig: { wsUrl: 'ws://test', token: 't' },
    })
    sockets[0]!.open()
    await vi.advanceTimersByTimeAsync(500) // 连上后的首推
    const runtimeHook = (globalThis as any).__VUE_DEVTOOLS_GLOBAL_HOOK__
    const tree = await import('../src/runtime/tree')
    return { lifecycle, push, runtimeHook, tree, sent: sockets[0]!.sent }
  }

  it('component:updated 把重渲染的组件 id 上报给 node（面板据此重拉状态）', async () => {
    const { lifecycle, runtimeHook, tree, sent } = await startConnected()
    // Vue 事件里带的是内部实例；探针登记组件 id 时用的是组件 proxy
    const internal: any = { uid: 7, type: { name: 'CounterCard' } }
    const proxy = { $: internal }
    internal.proxy = proxy
    tree.extractComponentNode(proxy, 0, 10, new Set(), 'pages/index/index')

    runtimeHook.emit('component:updated', {}, 7, 1, internal)
    await vi.advanceTimersByTimeAsync(400)

    const notified = sent.filter((frame) =>
      frame.includes(NODE_RPC.notifyComponentRendered),
    )
    expect(notified).toHaveLength(1)
    expect(notified[0]).toContain('pages/index/index#7')
    lifecycle.disposeAgent()
  })

  it('收到组件事件后不再轮询采集组件树；没有事件时轮询照常兜底', async () => {
    const { lifecycle, push, runtimeHook } = await startConnected()

    // 事件通道还没通：轮询照常采集
    push.resetPushGate()
    getCurrentPages.mockClear()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(getCurrentPages).toHaveBeenCalled()

    // Vue 运行时发来组件事件：事件驱动推送，之后轮询让位
    runtimeHook.emit('component:added', {}, 5, 1, { uid: 5 })
    await vi.advanceTimersByTimeAsync(400)
    push.resetPushGate()
    getCurrentPages.mockClear()
    await vi.advanceTimersByTimeAsync(6_000)
    expect(getCurrentPages).not.toHaveBeenCalled()

    lifecycle.disposeAgent()
  })

  it('首次收到组件事件时打印一次「已切换为事件驱动」，之后不再重复', async () => {
    const { lifecycle, runtimeHook } = await startConnected()
    const log = vi.mocked(console.log)
    const switched = () =>
      log.mock.calls.filter((args) => String(args[0]).includes('事件驱动'))

    expect(switched()).toHaveLength(0)
    runtimeHook.emit('component:added', {}, 5, 1, { uid: 5 })
    runtimeHook.emit('component:updated', {}, 5, 1, { uid: 5 })
    expect(switched()).toHaveLength(1)

    lifecycle.disposeAgent()
  })

  it('组件增删改都会在防抖后触发一次组件树采集', async () => {
    const { lifecycle, runtimeHook } = await startConnected()

    for (const event of [
      'component:added',
      'component:updated',
      'component:removed',
    ]) {
      getCurrentPages.mockClear()
      runtimeHook.emit(event, {}, 5, 1, { uid: 5 })
      expect(getCurrentPages).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(400)
      expect(getCurrentPages).toHaveBeenCalled()
    }

    lifecycle.disposeAgent()
  })
})

describe('推送防抖封顶', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('持续重渲染（间隔小于防抖窗口）时推送不会被无限顺延', async () => {
    vi.resetModules()
    const push = await import('../src/runtime/push')
    const $call = vi.fn(async () => ({ ok: true }))
    push.bindPushDeps({
      getActiveInstance: () => ({
        rpc: { $call },
        socketHandle: { isConnected: () => true },
      }),
    })
    const pushes = () => {
      push.resetPushGate() // 每轮内容视为有变化，只观察调度本身
      return $call.mock.calls.length
    }

    // 每 100ms 渲染一次，持续 5 秒
    for (let t = 0; t < 5_000; t += 100) {
      push.schedulePushComponentTree(300)
      await vi.advanceTimersByTimeAsync(100)
      pushes()
    }

    expect($call.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect($call.mock.calls.length).toBeLessThanOrEqual(3)
  })
})

describe('推送内容门', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function freshPush($call: (...args: any[]) => Promise<unknown>) {
    vi.resetModules()
    const push = await import('../src/runtime/push')
    push.bindPushDeps({
      getActiveInstance: () => ({
        rpc: { $call },
        socketHandle: { isConnected: () => true },
      }),
    })
    return push
  }

  it('送达后同样内容不再重推', async () => {
    const $call = vi.fn(async () => ({ ok: true }))
    const push = await freshPush($call)

    await push.pushComponentTreeNow()
    await push.pushComponentTreeNow()

    expect($call).toHaveBeenCalledTimes(1)
  })

  it('没送达的推送下一轮重推同样内容', async () => {
    const $call = vi.fn(async () => {
      throw new Error('socket closed')
    })
    const push = await freshPush($call)

    await push.pushComponentTreeNow()
    await push.pushComponentTreeNow()

    expect($call).toHaveBeenCalledTimes(2)
  })
})
