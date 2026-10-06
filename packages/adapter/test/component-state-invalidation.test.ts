/**
 * 端上改值 → 面板刷新（adapter 半边）。
 *
 * 探针上报「哪些组件重渲染了」，过滤放在本层：`components:stateSnapshot` 是
 * **面板专有**入口（MCP/Coding Agent 走 core 的 `get-component-state`，不经过这里），
 * 所以「面板当前在看哪个组件」只有这里知道得准。命中面板选中项才发官方
 * `components:stateInvalidated`——面板只认这个事件才会重拉状态。
 *
 * 事件必须带 appId：官方 runtime 事件入口按 appId 校验，漏了会被静默丢弃。
 */
import type { ProbeBackend, ProbeMethod, ProbeSubscription } from '../src/backend.ts'
import { describe, expect, it, vi } from 'vitest'
import { connectUniRpcClient } from '../src/uni-devtools-rpc.ts'

interface Harness {
  backend: ProbeBackend
  /** 模拟 node 侧 sharedState 推送：端上这些组件重渲染了 */
  pushRendered: (snapshot: unknown) => void
}

function createHarness(): Harness {
  let renderedCb: ((snapshot: unknown) => void) | undefined

  const backend: ProbeBackend = {
    capabilities: { openInEditor: true },
    connect: vi.fn(async () => {}),
    onConnectionStatus: vi.fn(() => () => {}),
    call: vi.fn(async (method: ProbeMethod) => {
      if (method === 'get-component-tree')
        return { fetchedAt: 1, pages: [] }
      if (method === 'get-component-state')
        return { id: 'pages/index/index#4', name: 'CounterCard' }
      return {}
    }),
    subscribe: vi.fn((key: string, cb: (snapshot: unknown) => void): ProbeSubscription => {
      if (key === 'rendered-components')
        renderedCb = cb
      return { ready: Promise.resolve(), unsubscribe: () => {} }
    }),
    dispose: vi.fn(),
  }

  return {
    backend,
    pushRendered: snapshot => renderedCb?.(snapshot),
  }
}

/** 等待工厂自连微任务链（connect → subscribe）跑完 */
const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** 模拟面板选中组件：官方语义下选中即查询一次状态 */
async function select(client: ReturnType<typeof connectUniRpcClient>, componentId: string) {
  await client.query({ type: 'components:stateSnapshot', payload: { componentId } })
}

const invalidations = (events: any[]) => events.filter(e => e.type === 'components:stateInvalidated')

describe('端上重渲染 → 面板刷新', () => {
  it('面板选中的组件重渲染后，面板收到 components:stateInvalidated', async () => {
    const h = createHarness()
    const client = connectUniRpcClient({ backend: h.backend })
    const events: any[] = []
    client.onEvent(e => events.push(e))
    await flush()
    await select(client, 'pages/index/index#4')

    h.pushRendered({ ids: ['pages/index/index#4'], seq: 1, updatedAt: 1000 })

    expect(invalidations(events)).toEqual([
      {
        time: expect.any(Number),
        type: 'components:stateInvalidated',
        appId: 'pages/index/index',
        componentId: 'pages/index/index#4',
        version: 1,
        reason: 'update',
      },
    ])
    client.dispose()
  })

  it('只有其他组件重渲染时不产生事件', async () => {
    const h = createHarness()
    const client = connectUniRpcClient({ backend: h.backend })
    const events: any[] = []
    client.onEvent(e => events.push(e))
    await flush()
    await select(client, 'pages/index/index#4')

    h.pushRendered({ ids: ['pages/index/index#9'], seq: 1, updatedAt: 1000 })

    expect(invalidations(events)).toHaveLength(0)
    client.dispose()
  })

  it('面板尚未选中任何组件时不产生事件', async () => {
    const h = createHarness()
    const client = connectUniRpcClient({ backend: h.backend })
    const events: any[] = []
    client.onEvent(e => events.push(e))
    await flush()

    h.pushRendered({ ids: ['pages/index/index#4'], seq: 1, updatedAt: 1000 })

    expect(invalidations(events)).toHaveLength(0)
    client.dispose()
  })

  it('面板改选后，失效跟随新的选中项', async () => {
    const h = createHarness()
    const client = connectUniRpcClient({ backend: h.backend })
    const events: any[] = []
    client.onEvent(e => events.push(e))
    await flush()
    await select(client, 'pages/index/index#4')
    await select(client, 'pages/index/index#9')

    h.pushRendered({ ids: ['pages/index/index#4'], seq: 1, updatedAt: 1000 })
    expect(invalidations(events)).toHaveLength(0)

    h.pushRendered({ ids: ['pages/index/index#9'], seq: 2, updatedAt: 2000 })
    expect(invalidations(events).map(e => e.componentId)).toEqual(['pages/index/index#9'])
    client.dispose()
  })

  it('同一组件的重复推送递增 version（面板据此拒绝陈旧快照）', async () => {
    const h = createHarness()
    const client = connectUniRpcClient({ backend: h.backend })
    const events: any[] = []
    client.onEvent(e => events.push(e))
    await flush()
    await select(client, 'pages/index/index#4')

    h.pushRendered({ ids: ['pages/index/index#4'], seq: 1, updatedAt: 1000 })
    h.pushRendered({ ids: ['pages/index/index#4'], seq: 2, updatedAt: 2000 })

    expect(invalidations(events).map(e => e.version)).toEqual([1, 2])
    client.dispose()
  })

  it('畸形容忍：ids 缺失或非数组时不产生事件', async () => {
    const h = createHarness()
    const client = connectUniRpcClient({ backend: h.backend })
    const events: any[] = []
    client.onEvent(e => events.push(e))
    await flush()
    await select(client, 'pages/index/index#4')

    h.pushRendered({ seq: 1, updatedAt: 1000 })
    h.pushRendered({ ids: 'pages/index/index#4', seq: 2, updatedAt: 2000 })

    expect(invalidations(events)).toHaveLength(0)
    client.dispose()
  })
})
