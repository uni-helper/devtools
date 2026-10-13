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
