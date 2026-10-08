import type { ProbeBackend } from '../src/backend.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockComponentState,
  mockPiniaState,
  mockResetNetworkRecords,
} from '../src/fixtures.ts'
import { createMockBackend } from '../src/mock-backend.ts'
import { validateNetworkSnapshot } from '../src/uni-devtools-rpc.ts'

let backend: ProbeBackend

beforeEach(() => {
  mockResetNetworkRecords()
  backend = createMockBackend({ networkTickInterval: 10 })
})

afterEach(() => {
  backend.dispose()
  backend.dispose() // 幂等
  vi.useRealTimers()
})

describe('方法面（探针语义对齐）', () => {
  it('get-component-tree 返回 fixtures 两页快照', async () => {
    const tree = (await backend.call('get-component-tree')) as {
      pages: Array<{ route: string }>
    }
    expect(tree.pages.map((p) => p.route)).toEqual([
      'pages/index/index',
      'pages/settings/settings',
    ])
  })

  it('get-component-state 未知 id 回落空状态；update 写回内存', async () => {
    const unknown = (await backend.call('get-component-state', {
      id: 'nope#1',
    })) as { id: string }
    expect(unknown.id).toBe('nope#1')

    await backend.call('update-component-state', {
      id: 'pages/index/index#4',
      path: ['count'],
      value: 5,
    })
    expect(
      mockComponentState('pages/index/index#4').setup?.count,
    ).toMatchObject({ value: 5 })
  })

  it('update-component-state 深路径与 remove 如实报不支持', async () => {
    await expect(
      backend.call('update-component-state', {
        id: 'pages/index/index#4',
        path: ['config', 'max'],
        value: 1,
      }),
    ).rejects.toThrow('暂不支持')
    await expect(
      backend.call('update-component-state', {
        id: 'pages/index/index#4',
        path: ['count'],
        remove: true,
      }),
    ).rejects.toThrow('暂不支持')
  })

  it('update-pinia-state 键不存在/getters 抛错（对齐探针），已知键写回', async () => {
    await expect(
      backend.call('update-pinia-state', {
        id: 'counter',
        key: 'nope',
        value: 1,
      }),
    ).rejects.toThrow('not found on store')
    await expect(
      backend.call('update-pinia-state', {
        id: 'counter',
        key: 'double',
        value: 1,
      }),
    ).rejects.toThrow('not found on store')

    await backend.call('update-pinia-state', {
      id: 'counter',
      key: 'count',
      value: 9,
    })
    expect(mockPiniaState('counter').state.count).toBe(9)
  })

  it('get-network-records 包装成 { records }，clear 后为空', async () => {
    const res = (await backend.call('get-network-records')) as {
      records: unknown[]
    }
    expect(res.records).toHaveLength(7)

    await backend.call('clear-network-records')
    const cleared = (await backend.call('get-network-records')) as {
      records: unknown[]
    }
    expect(cleared.records).toHaveLength(0)
  })

  it('capabilities 关闭 openInEditor；open-in-editor/inspect/navigate 语义', async () => {
    expect(backend.capabilities.openInEditor).toBe(false)
    await expect(
      backend.call('open-in-editor', { file: '/a.vue' }),
    ).rejects.toThrow('暂不支持')
    await expect(backend.call('get-inspect-status')).resolves.toEqual({
      available: false,
    })
    await expect(
      backend.call('navigate-to', { path: '/pages/index/index' }),
    ).resolves.toEqual({ ok: true })
    await expect(
      backend.call('recompute-component-state', {
        id: 'x',
        section: 's',
        path: ['k'],
      }),
    ).resolves.toBeDefined()
  })

  it('未知方法 fail loud', async () => {
    await expect(backend.call('get-not-exist' as never)).rejects.toThrow(
      'mock 后端暂不支持',
    )
  })
})

describe('push 通道', () => {
  it('component-tree 订阅立即推一次 fixtures 树', () => {
    const pushes: Array<{ pages: unknown[] }> = []
    const sub = backend.subscribe('component-tree', (s) =>
      pushes.push(s as { pages: unknown[] }),
    )
    expect(pushes).toHaveLength(1)
    expect(pushes[0]!.pages).toHaveLength(2)
    sub.unsubscribe()
  })

  it('network-records 心跳推送满足共享态校验；pending 记录超时结算；退订即停', async () => {
    vi.useFakeTimers()
    // pending 结算窗口以 Date.now() 为准：把 fake 时钟对齐真实当前时间后重建 fixtures
    vi.setSystemTime(new Date())
    mockResetNetworkRecords()

    const pushes: Array<{
      records: Array<{ id: number; ok?: boolean; duration?: number }>
    }> = []
    const sub = backend.subscribe('network-records', (s) =>
      pushes.push(s as never),
    )
    expect(pushes).toHaveLength(0) // 初始不推：首拉由路由器 pullNetworkOnce 负责

    await vi.advanceTimersByTimeAsync(50)
    expect(pushes.length).toBeGreaterThanOrEqual(4) // 10ms 间隔
    for (const p of pushes) expect(validateNetworkSnapshot(p).valid).toBe(true)

    await vi.advanceTimersByTimeAsync(6000)
    const settled = pushes.at(-1)!.records.find((r) => r.id === 7)!
    expect(settled.ok).toBe(true)
    expect(settled.duration).toBeGreaterThan(0)

    sub.unsubscribe()
    const count = pushes.length
    await vi.advanceTimersByTimeAsync(100)
    expect(pushes.length).toBe(count)
  })

  it('dispose 后心跳停止，dispose 幂等', async () => {
    vi.useFakeTimers()
    const pushes: unknown[] = []
    backend.subscribe('network-records', (s) => pushes.push(s))
    backend.dispose()
    await vi.advanceTimersByTimeAsync(100)
    expect(pushes).toHaveLength(0)
  })
})
