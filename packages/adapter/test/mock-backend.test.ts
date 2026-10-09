import type { ProbeBackend } from '../src/backend.ts'
import type {
  StorageEntriesResult,
  StorageInfoResult,
} from '@uni-helper/devtools-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockComponentState,
  mockPiniaState,
  mockResetNetworkRecords,
  mockResetVuexState,
  mockVuexState,
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

describe('Vuex / Storage 方法面（探针语义对齐）', () => {
  beforeEach(() => {
    mockResetVuexState()
  })

  it('get-vuex-stores 返回 root + namespaced modules（getters 全名/去前缀差异）', async () => {
    const stores = (await backend.call('get-vuex-stores')) as Array<{
      id: string
      namespaced?: boolean
      getters: Record<string, unknown>
    }>
    expect(stores.map((s) => s.id)).toEqual(['_root', 'cart', 'cart/products'])
    // root 的 getters 含 namespaced 全名（对齐 extractGetters 遍历 store.getters）
    expect(stores[0]!.namespaced).toBe(false)
    expect(stores[0]!.getters['cart/itemCount']).toBe(2)
    // module 的 getters 去掉 `module/` 前缀（对齐 extractModuleGetters）
    expect(stores[1]!.namespaced).toBe(true)
    expect(stores[1]!.getters.itemCount).toBe(2)
  })

  it('get-vuex-state 未知 id 返回 null（对齐探针 find 失败语义）', async () => {
    await expect(
      backend.call('get-vuex-state', { id: 'nope' }),
    ).resolves.toBeNull()
  })

  it('get-vuex-state 正向：cart 完整形状；_root getters 含 namespaced 全名', async () => {
    const cart = (await backend.call('get-vuex-state', { id: 'cart' })) as {
      id: string
      state: Record<string, unknown>
      getters: Record<string, unknown>
      namespaced?: boolean
    }
    expect(cart.id).toBe('cart')
    expect(cart.namespaced).toBe(true)
    expect(cart.state).toEqual({
      items: [{ sku: 'p1', count: 2 }],
      coupon: null,
    })
    expect(cart.getters).toEqual({ itemCount: 2 })

    const root = (await backend.call('get-vuex-state', { id: '_root' })) as {
      getters: Record<string, unknown>
    }
    expect(root.getters['cart/itemCount']).toBe(2)
  })

  it('update-vuex-state 嵌套 path 写回 + remove + 中间路径创建；未知 module 抛错', async () => {
    await backend.call('update-vuex-state', {
      id: 'cart',
      path: ['items', '0', 'count'],
      value: 5,
    })
    expect(mockVuexState('cart')!.state.items).toEqual([
      { sku: 'p1', count: 5 },
    ])

    await backend.call('update-vuex-state', {
      id: 'cart',
      path: ['coupon'],
      remove: true,
    })
    expect(mockVuexState('cart')!.state).not.toHaveProperty('coupon')

    // 中间路径不存在时创建（对齐探针 setValueByPath）
    await backend.call('update-vuex-state', {
      id: 'cart',
      path: ['meta', 'source'],
      value: 'mock',
    })
    expect(mockVuexState('cart')!.state.meta).toEqual({ source: 'mock' })

    // 数组元素删除走 splice、不留稀疏空洞（对齐探针 Vue.delete 的数组语义）
    await backend.call('update-vuex-state', {
      id: 'cart/products',
      path: ['list', '1'],
      remove: true,
    })
    expect(mockVuexState('cart/products')!.state.list).toEqual([
      'devtools',
      'pinia',
    ])

    await expect(
      backend.call('update-vuex-state', { id: 'nope', path: ['a'], value: 1 }),
    ).rejects.toThrow('not found')
  })

  it('get-storage-info 返回元数据（KB 口径 + 精确 keyCount）', async () => {
    const info = (await backend.call('get-storage-info')) as StorageInfoResult
    expect(info.keyCount).toBe(5)
    expect(info.keys).toEqual(
      expect.arrayContaining([
        'token',
        'user_profile',
        'search_history',
        'settings',
        'draft_content',
      ]),
    )
    expect(info.limitSize).toBe(10240)
    expect(info.currentSize).toBeGreaterThan(0)
  })

  it('get-storage-entries 过滤/显式 miss/分页/截断/字节大小', async () => {
    // matchPattern 过滤 + includeSize
    const filtered = (await backend.call('get-storage-entries', {
      matchPattern: '^search',
      includeSize: true,
    })) as StorageEntriesResult
    expect(filtered.total).toBe(1)
    expect(filtered.entries[0]!.key).toBe('search_history')
    expect(filtered.entries[0]!.size).toBeGreaterThan(0)

    // 显式 keys：存在值 + 不存在 key（显式 miss 条目，不静默丢弃）
    const mixed = (await backend.call('get-storage-entries', {
      keys: ['token', 'no_such_key'],
    })) as StorageEntriesResult
    expect(mixed.total).toBe(2)
    expect(mixed.entries[0]!.value).toContain('mock-signed-token')
    expect(mixed.entries[1]!.error).toBe('key not found')

    // 分页：limit 截断 + hasMore
    const paged = (await backend.call('get-storage-entries', {
      limit: 2,
    })) as StorageEntriesResult
    expect(paged.entries).toHaveLength(2)
    expect(paged.hasMore).toBe(true)

    // maxValueChars 截断：value 变为序列化字符串前缀
    const truncated = (await backend.call('get-storage-entries', {
      keys: ['draft_content'],
      maxValueChars: 4,
    })) as StorageEntriesResult
    expect(truncated.entries[0]!.truncated).toBe(true)
    expect(truncated.entries[0]!.value).toHaveLength(4)

    // 无效正则抛错（对齐探针错误文案）
    await expect(
      backend.call('get-storage-entries', { matchPattern: '[' }),
    ).rejects.toThrow('Invalid matchPattern')
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
