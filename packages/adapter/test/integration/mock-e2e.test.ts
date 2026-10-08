import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  mockComponentState,
  mockPiniaState,
  mockResetNetworkRecords,
} from '../../src/fixtures.ts'
import {
  connectUniRpcClient,
  getUniNetworkApi,
} from '../../src/uni-devtools-rpc.ts'

// adapter 级集成测试（方案 §6）：mock 模式全链路——连接生命周期、五域 query、
// 编辑写回 + 失效事件、network 心跳推送、错误路径。UI 级回归（角标/五域 tab）
// 保留手工冒烟，不做 jsdom 挂载。
describe('mock 模式全链路 connectUniRpcClient({ mock: true })', () => {
  beforeEach(() => {
    mockResetNetworkRecords()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('连接即就绪，五域 query 返回 fixtures 数据', async () => {
    const client = connectUniRpcClient({ mock: true })
    const statuses: string[] = []
    client.onConnectionChanged?.((s) => {
      statuses.push(s)
    })

    const apps = (await client.query({ type: 'apps:snapshot' })) as {
      apps: Array<{ id: string }>
    }
    expect(statuses).toContain('connected')
    expect(apps.apps.map((a) => a.id)).toEqual([
      'pages/index/index',
      'pages/settings/settings',
    ])

    const tree = (await client.query({
      type: 'components:treeSnapshot',
      appId: 'pages/index/index',
    })) as { nodes: Array<{ id: string; appId: string }> }
    expect(tree.nodes.some((n) => n.id === 'pages/index/index#1')).toBe(true)
    for (const n of tree.nodes) expect(n.appId).toBe('pages/index/index')

    const pinia = (await client.query({
      type: 'inspectors:treeSnapshot',
      payload: { inspectorId: 'pinia' },
    })) as { rootNodes: Array<{ id: string }> }
    expect(pinia.rootNodes.map((n) => n.id)).toEqual([
      '_root',
      'store:counter',
      'store:user',
    ])

    const piniaState = (await client.query({
      type: 'inspectors:stateSnapshot',
      payload: { inspectorId: 'pinia', nodeId: 'store:counter' },
    })) as { sections: Array<{ id: string }> }
    expect(piniaState.sections.map((s) => s.id)).toEqual(['state', 'getters'])

    const router = (await client.query({ type: 'router:snapshot' })) as {
      currentRoute: { path: string; name: string }
      routes: unknown[]
    }
    expect(router.currentRoute).toMatchObject({
      path: '/pages/index/index',
      name: 'pages/index/index',
    })
    expect(router.routes).toHaveLength(2)

    const render = (await client.query({
      type: 'components:getRenderCode',
      payload: { componentId: 'pages/index/index#4' },
    })) as string
    expect(render).toContain('counter-card')
    expect(render).toContain('ActionButton')

    client.dispose()
  })

  it('编辑写回内存并递增 version 失效事件（会话内累积）', async () => {
    const client = connectUniRpcClient({ mock: true })
    const events: any[] = []
    client.onEvent((e) => events.push(e))

    const r1 = (await client.command({
      type: 'components:editState',
      payload: {
        componentId: 'pages/index/index#4',
        path: ['count'],
        value: 5,
      },
    })) as { status: number }
    expect(r1.status).toBe(1)
    expect(
      mockComponentState('pages/index/index#4').setup?.count,
    ).toMatchObject({ value: 5 })

    const r2 = (await client.command({
      type: 'components:editState',
      payload: {
        componentId: 'pages/index/index#4',
        path: ['count'],
        value: 6,
      },
    })) as { status: number }
    expect(r2.status).toBe(1)
    expect(
      mockComponentState('pages/index/index#4').setup?.count,
    ).toMatchObject({ value: 6 })

    const inv = events.filter((e) => e.type === 'components:stateInvalidated')
    expect(inv.map((e) => e.version)).toEqual([1, 2])
    expect(inv[0]).toMatchObject({
      appId: 'pages/index/index',
      componentId: 'pages/index/index#4',
    })
    client.dispose()
  })

  it('Pinia 编辑写回 + 失效事件；未知键报 status:0', async () => {
    const client = connectUniRpcClient({ mock: true })
    const events: any[] = []
    client.onEvent((e) => events.push(e))

    const ok = (await client.command({
      type: 'inspectors:editState',
      payload: {
        inspectorId: 'pinia',
        nodeId: 'store:counter',
        path: ['count'],
        value: 42,
      },
    })) as { status: number }
    expect(ok.status).toBe(1)
    expect(mockPiniaState('counter').state.count).toBe(42)
    const inv = events.filter((e) => e.type === 'inspectors:stateInvalidated')
    expect(inv).toHaveLength(1)
    expect(inv[0]).toMatchObject({
      inspectorId: 'pinia',
      nodeId: 'store:counter',
    })

    const bad = (await client.command({
      type: 'inspectors:editState',
      payload: {
        inspectorId: 'pinia',
        nodeId: 'store:counter',
        path: ['nope'],
        value: 1,
      },
    })) as { status: number; error?: unknown }
    expect(bad.status).toBe(0)
    expect(String(bad.error)).toContain('not found')
    client.dispose()
  })

  it('network 心跳驱动订阅者，pending 记录超时结算', async () => {
    // pending 结算窗口以 Date.now() 为准：fake 时钟对齐真实当前时间后重建 fixtures
    vi.setSystemTime(new Date())
    mockResetNetworkRecords()

    const client = connectUniRpcClient({ mock: true })
    await vi.advanceTimersByTimeAsync(1) // 等 initConnection 首拉完成
    const api = getUniNetworkApi()
    expect(api).toBeDefined()

    const lengths: number[] = []
    const unsub = api!.subscribe((records) => {
      lengths.push(records.length)
    })
    expect(lengths[0]).toBe(7) // 订阅立即回调当前缓存

    await vi.advanceTimersByTimeAsync(1000) // 一个心跳
    expect(lengths.length).toBeGreaterThan(1)

    await vi.advanceTimersByTimeAsync(6000) // pending（id 7）5s 结算
    const settled = api!.getRecords().find((r) => r.id === 7)
    expect(settled?.ok).toBe(true)
    expect(settled?.duration).toBeGreaterThan(0)

    unsub()
    client.dispose()
  })

  it('错误路径：capabilities 关闭入口，openInEditor 与深路径编辑报不支持', async () => {
    const client = connectUniRpcClient({ mock: true })

    const caps = (await client.query({ type: 'devtools:capabilities' })) as {
      openInEditor: boolean
      pagedComponentTree: boolean
      inspect: boolean
    }
    expect(caps).toEqual({
      openInEditor: false,
      pagedComponentTree: false,
      inspect: false,
    })

    const open = (await client.command({
      type: 'components:openInEditor',
      payload: { file: '/src/a.vue' },
    } as any)) as { status: number; error?: unknown }
    expect(open.status).toBe(0)
    expect(String(open.error)).toContain('暂不支持')

    const deep = (await client.command({
      type: 'components:editState',
      payload: {
        componentId: 'pages/index/index#4',
        path: ['config', 'max'],
        value: 1,
      },
    })) as { status: number; error?: unknown }
    expect(deep.status).toBe(0)
    expect(String(deep.error)).toContain('暂不支持')

    client.dispose()
  })
})
