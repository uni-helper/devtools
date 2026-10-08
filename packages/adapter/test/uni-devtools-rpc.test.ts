import type { ComponentTreeResult } from '@uni-helper/devtools-shared'
import type {
  ProbeBackend,
  ProbeMethod,
  ProbeSubscription,
} from '../src/backend.ts'
import { describe, expect, it, vi } from 'vitest'
import { PINIA_ROOT_ID } from '../src/mapping/pinia.ts'
import { connectUniRpcClient } from '../src/uni-devtools-rpc.ts'

const TREE_V1: ComponentTreeResult = {
  fetchedAt: 1000,
  vueVersion: '3.5.13',
  pages: [
    {
      route: 'pages/index/index',
      components: {
        id: 'pages/index/index#1',
        name: 'IndexPage',
        type: 'page',
        children: [],
      },
    },
    {
      route: 'pages/settings/settings',
      components: {
        id: 'pages/settings/settings#1',
        name: 'SettingsPage',
        type: 'page',
        children: [],
      },
    },
  ],
}

interface ScriptedBackend extends ProbeBackend {
  calls: Array<{ method: ProbeMethod; args: unknown[] }>
  pushTree: (tree: ComponentTreeResult) => void
}

function createScriptedBackend(
  opts: { failMethods?: ProbeMethod[] } = {},
): ScriptedBackend {
  const calls: Array<{ method: ProbeMethod; args: unknown[] }> = []
  let treeCb: ((snapshot: unknown) => void) | undefined

  const backend: ProbeBackend = {
    capabilities: { openInEditor: true },
    connect: vi.fn(async () => {}),
    onConnectionStatus: vi.fn(() => () => {}),
    call: vi.fn(async (method: ProbeMethod, ...args: unknown[]) => {
      calls.push({ method, args })
      if (opts.failMethods?.includes(method))
        throw new Error(`探针故障: ${method}`)
      const arg0 = args[0] as { id?: string; key?: string } | undefined
      switch (method) {
        case 'get-component-tree':
          return TREE_V1
        case 'get-pinia-stores':
          return { stores: [{ id: 'counter' }, { id: 'user' }] }
        case 'get-pinia-state':
          return {
            id: arg0?.id ?? '',
            state: { count: 1 },
            getters: { double: 2 },
          }
        // 语义对齐真实探针：键不存在抛错
        case 'update-pinia-state':
          if (arg0?.key !== 'count')
            throw new Error(
              `[updatePiniaState] Key "${arg0?.key}" not found on store "${arg0?.id}"`,
            )
          return { ok: true }
        case 'get-registered-routes':
          return { routes: [{ path: '/a/b', name: 'a/b' }] }
        case 'get-router-info':
          return { currentRoute: { path: '/a/b' }, stack: [] }
        default:
          return {}
      }
    }),
    subscribe: vi.fn(
      (key: string, cb: (snapshot: unknown) => void): ProbeSubscription => {
        if (key === 'component-tree') {
          treeCb = cb
          cb(TREE_V1)
        }
        return { ready: Promise.resolve(), unsubscribe: () => {} }
      },
    ),
    dispose: vi.fn(),
  }
  return Object.assign(backend, {
    calls,
    pushTree: (tree: ComponentTreeResult) => treeCb?.(tree),
  })
}

describe('协议语义（注入脚本化数据源，无需 mock devframe/client）', () => {
  /** 等待工厂自连微任务链（connect → subscribe 首推）跑完 */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  it('components:treeSnapshot 按 appId 过滤；sharedState 已首推则不再拉树', async () => {
    const be = createScriptedBackend()
    const client = connectUniRpcClient({ backend: be })
    const res = (await client.query({
      type: 'components:treeSnapshot',
      appId: 'pages/index/index',
    })) as { nodes: Array<{ id: string }>; version: number }

    expect(res.nodes.map((n) => n.id)).toEqual(['pages/index/index#1'])
    expect(res.version).toBeGreaterThanOrEqual(0)
    expect(
      be.calls.filter((c) => c.method === 'get-component-tree'),
    ).toHaveLength(0)
    client.dispose()
  })

  it('同 app 集合的树更新产出 treePatched（version 递增）；app 集合变化发 apps:changed', async () => {
    const be = createScriptedBackend()
    const client = connectUniRpcClient({ backend: be })
    const events: any[] = []
    client.onEvent((e) => events.push(e))
    await flush() // 等 subscribe 首推注册完成，否则 pushTree 落空

    // 首推（subscribe 时）是 apps:changed（空 → 两 app）；同集合更新 → 按 app 拆补丁
    be.pushTree({
      fetchedAt: 2000,
      vueVersion: '3.5.13',
      pages: [
        {
          route: 'pages/index/index',
          components: {
            id: 'pages/index/index#1',
            name: 'IndexPage',
            type: 'page',
            children: [
              { id: 'pages/index/index#2', name: 'Child', type: 'component' },
            ],
          },
        },
        TREE_V1.pages[1]!,
      ],
    })
    // computeTreeDiff 在 app 集合不变时按 app 全量重建补丁：两个 app 各一组事件
    const patches = events.filter((e) => e.type === 'components:treePatched')
    expect(patches.map((e) => e.appId).sort()).toEqual([
      'pages/index/index',
      'pages/settings/settings',
    ])
    const indexPatch = patches.find((e) => e.appId === 'pages/index/index')!
    expect(indexPatch.version).toBe(1)
    expect(
      indexPatch.patches.some(
        (p: any) => p.op === 'insert' && p.node.id === 'pages/index/index#2',
      ),
    ).toBe(true)

    events.length = 0
    be.pushTree({
      fetchedAt: 3000,
      vueVersion: '3.5.13',
      pages: [TREE_V1.pages[0]!],
    })
    expect(events.some((e) => e.type === 'apps:changed')).toBe(true)
    client.dispose()
  })

  it('编辑命令递增 version 并带 appId 发失效事件', async () => {
    const be = createScriptedBackend()
    const client = connectUniRpcClient({ backend: be })
    const events: any[] = []
    client.onEvent((e) => events.push(e))

    const r1 = (await client.command({
      type: 'components:editState',
      payload: {
        componentId: 'pages/index/index#1',
        path: ['count'],
        value: 2,
      },
    })) as { status: number }
    const r2 = (await client.command({
      type: 'components:editState',
      payload: {
        componentId: 'pages/index/index#1',
        path: ['count'],
        value: 3,
      },
    })) as { status: number }
    expect(r1.status).toBe(1)
    expect(r2.status).toBe(1)

    const inv = events.filter((e) => e.type === 'components:stateInvalidated')
    expect(inv.map((e) => e.version)).toEqual([1, 2])
    expect(inv[0]).toMatchObject({
      appId: 'pages/index/index',
      componentId: 'pages/index/index#1',
    })
    client.dispose()
  })

  it('探针抛错 → 命令 resolve { status: 0, error }（§5.1 错误一致性），不发失效事件', async () => {
    const be = createScriptedBackend({
      failMethods: ['update-component-state'],
    })
    const client = connectUniRpcClient({ backend: be })
    const events: any[] = []
    client.onEvent((e) => events.push(e))

    const res = (await client.command({
      type: 'components:editState',
      payload: {
        componentId: 'pages/index/index#1',
        path: ['count'],
        value: 2,
      },
    })) as { status: number; error?: unknown }
    expect(res).toEqual({
      status: 0,
      error: '探针故障: update-component-state',
    })
    expect(
      events.filter((e) => e.type === 'components:stateInvalidated'),
    ).toHaveLength(0)
    client.dispose()
  })

  it('inspectors:editState：探针"键不存在"抛错转为面板可见的 status:0 文案', async () => {
    const be = createScriptedBackend()
    const client = connectUniRpcClient({ backend: be })

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
    expect(String(bad.error)).toContain('not found on store')
    client.dispose()
  })

  it('Pinia 聚合根逐 store 拉取组装（_root 语义）', async () => {
    const be = createScriptedBackend()
    const client = connectUniRpcClient({ backend: be })
    const res = (await client.query({
      type: 'inspectors:stateSnapshot',
      payload: { inspectorId: 'pinia', nodeId: PINIA_ROOT_ID },
    })) as { sections: Array<{ id: string; entries: Array<{ key: string }> }> }

    expect(be.calls.filter((c) => c.method === 'get-pinia-state')).toHaveLength(
      2,
    )
    const stateSection = res.sections.find((s) => s.id === 'state')!
    expect(stateSection.entries.map((e) => e.key)).toEqual(['counter', 'user'])
    client.dispose()
  })

  it('sharedState 订阅失败退化为主动拉取路径', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const be = createScriptedBackend()
    be.subscribe = vi.fn(() => ({
      ready: Promise.reject(new Error('订阅失败')),
      unsubscribe: () => {},
    })) as ProbeBackend['subscribe']

    const client = connectUniRpcClient({ backend: be })
    const res = (await client.query({ type: 'apps:snapshot' })) as {
      apps: Array<{ id: string }>
    }

    expect(res.apps.map((a) => a.id)).toEqual([
      'pages/index/index',
      'pages/settings/settings',
    ])
    expect(be.calls.some((c) => c.method === 'get-component-tree')).toBe(true)
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
    client.dispose()
  })

  it('router:snapshot 走共享回落逻辑（registered-routes + router-info）', async () => {
    const be = createScriptedBackend()
    const client = connectUniRpcClient({ backend: be })
    const res = (await client.query({ type: 'router:snapshot' })) as {
      currentRoute: { path: string; name: string }
      routes: Array<{ path: string }>
    }

    expect(res.currentRoute).toMatchObject({ path: '/a/b', name: 'a/b' })
    expect(res.routes).toEqual([{ path: '/a/b', name: 'a/b' }])
    client.dispose()
  })
})
