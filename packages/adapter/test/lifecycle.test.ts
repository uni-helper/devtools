import type { ProbeBackend, ProbeSubscription } from '../src/backend.ts'
import type { Mock } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockBackend } from '../src/mock-backend.ts'
import { connectUniRpcClient } from '../src/uni-devtools-rpc.ts'

interface ScriptedLifecycle {
  backend: ProbeBackend
  connect: Mock<[], Promise<void>>
  subscribe: Mock<[string, (s: unknown) => void], ProbeSubscription>
  unsubscribe: Mock<[], void>
  dispose: Mock<[], void>
}

function scriptedLifecycleBackend(opts: { connect?: 'hang' | 'ok' | 'fail' } = {}): ScriptedLifecycle {
  const connect = vi.fn(async () => {
    if (opts.connect === 'fail')
      throw new Error('连接失败')
    if (opts.connect === 'hang')
      await new Promise(() => {})
  })
  const unsubscribe = vi.fn()
  const subscribe = vi.fn((_key: string, _cb: (s: unknown) => void): ProbeSubscription => ({
    ready: new Promise(() => {}),
    unsubscribe,
  }))
  const dispose = vi.fn()
  const backend: ProbeBackend = {
    capabilities: { openInEditor: true },
    connect,
    onConnectionStatus: () => () => {},
    call: async () => ({}),
    subscribe,
    dispose,
  }
  return { backend, connect, subscribe, unsubscribe, dispose }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dispose 竞态（评审 P0-1 / P1-4）', () => {
  it('connect 挂起期间 dispose：backend 被清理、不调度重连、dispose 幂等', async () => {
    const be = scriptedLifecycleBackend({ connect: 'hang' })
    const client = connectUniRpcClient({ backend: be.backend })

    client.dispose()
    expect(be.dispose).toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)
    expect(be.connect).toHaveBeenCalledTimes(1) // dispose 后不重连
    expect(() => client.dispose()).not.toThrow()
  })

  it('subscribe 挂起期间 dispose：退订交给 backend 的 disposed 标记兜底（ready 未 settle 时路由器未持有 unsub）', async () => {
    const be = scriptedLifecycleBackend({ connect: 'ok' })
    const client = connectUniRpcClient({ backend: be.backend })

    await vi.advanceTimersByTimeAsync(1) // connect 完成，subscribe ready 永挂起
    expect(be.subscribe).toHaveBeenCalledWith('component-tree', expect.any(Function))

    client.dispose()
    expect(be.dispose).toHaveBeenCalled()
    expect(be.unsubscribe).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(100) // 无异常、无定时器泄漏
  })

  it('connect 失败且已 dispose：不调度重连', async () => {
    const be = scriptedLifecycleBackend({ connect: 'fail' })
    const client = connectUniRpcClient({ backend: be.backend })

    await vi.advanceTimersByTimeAsync(10) // 首连失败 → 1.5s 重连定时器
    expect(be.connect).toHaveBeenCalledTimes(1)

    client.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(be.connect).toHaveBeenCalledTimes(1)
  })

  it('对照：连接失败且未 dispose 时 1.5s 自动重连', async () => {
    const be = scriptedLifecycleBackend({ connect: 'fail' })
    const client = connectUniRpcClient({ backend: be.backend })

    await vi.advanceTimersByTimeAsync(1600)
    expect(be.connect).toHaveBeenCalledTimes(2)
    client.dispose()
  })

  it('MockBackend dispose 后心跳停止且幂等', async () => {
    const be = createMockBackend({ networkTickInterval: 10 })
    const pushes: unknown[] = []
    be.subscribe('network-records', s => pushes.push(s))

    be.dispose()
    be.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(pushes).toHaveLength(0)
  })
})
