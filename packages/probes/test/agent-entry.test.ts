import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * 入口层验证：两个入口（Vue 3 `index.ts` / Vue 2 `vue2.ts`）组装的 RPC 方法表是否精确，
 * 以及重构后两个入口**共享 `lifecycle.ts` 单例**带来的跨版本语义。
 *
 * 方法表无法从 birpc 客户端反查，因此 mock 掉 `devframe/rpc/client` 直接截获入参。
 */
const { createRpcClientMock } = vi.hoisted(() => ({
  createRpcClientMock: vi.fn(),
}))

vi.mock('devframe/rpc/client', () => ({
  createRpcClient: createRpcClientMock,
}))

const BASE_KEYS = [
  'uni-devtools:agent:clearNetworkRecords',
  'uni-devtools:agent:getComponentState',
  'uni-devtools:agent:getComponentTree',
  'uni-devtools:agent:getNetworkRecords',
  'uni-devtools:agent:getRouterInfo',
  'uni-devtools:agent:navigate',
  'uni-devtools:agent:ping',
  'uni-devtools:agent:updateComponentState',
].sort()

const VUE3_ONLY_KEYS = [
  'uni-devtools:agent:getComponentRenderCode',
  'uni-devtools:agent:recomputeComponentState',
  'uni-devtools:agent:getPiniaStores',
  'uni-devtools:agent:getPiniaState',
  'uni-devtools:agent:updatePiniaState',
].sort()

/** 单例与「全局钩子已安装」标记都是模块级、不可从外部重置，故每例取一份全新模块图 */
async function freshEntries(): Promise<{
  vue3: typeof import('../src/vue3/index')
  vue2: typeof import('../src/vue2/index')
}> {
  vi.resetModules()
  return {
    vue3: await import('../src/vue3/index'),
    vue2: await import('../src/vue2/index'),
  }
}

/** 截获最近一次 createRpcClient 收到的方法表 */
function lastClientFunctions(): Record<string, unknown> {
  const call = createRpcClientMock.mock.calls.at(-1)
  if (!call) {
    throw new Error('createRpcClient was not called')
  }
  return call[0] as Record<string, unknown>
}

const config = () => ({ wsUrl: 'ws://test', token: 'test-token' })

describe('入口 RPC 方法表', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    createRpcClientMock.mockReset()
    createRpcClientMock.mockReturnValue({ __mockRpc: true })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('vue 3 入口 = 8 个基础方法 + 5 个 Vue 3 专属方法', async () => {
    const { vue3 } = await freshEntries()

    vue3.initAgent(config())

    expect(Object.keys(lastClientFunctions()).sort()).toEqual(
      [...BASE_KEYS, ...VUE3_ONLY_KEYS].sort(),
    )

    vue3.disposeAgent()
  })

  it('vue 2 入口恰好只有 8 个基础方法，无任何 Vue 3 专属方法', async () => {
    const { vue2 } = await freshEntries()

    vue2.initAgent(config())

    const fns = lastClientFunctions()
    expect(Object.keys(fns).sort()).toEqual(BASE_KEYS)
    for (const key of VUE3_ONLY_KEYS) {
      expect(fns).not.toHaveProperty(key)
    }

    vue2.disposeAgent()
  })

  it('dispose 后切到另一版本入口，方法表正确切换、无残留', async () => {
    const { vue3, vue2 } = await freshEntries()

    vue3.initAgent(config())
    expect(Object.keys(lastClientFunctions()).sort()).toEqual(
      [...BASE_KEYS, ...VUE3_ONLY_KEYS].sort(),
    )
    vue3.disposeAgent()

    vue2.initAgent(config())
    expect(Object.keys(lastClientFunctions()).sort()).toEqual(BASE_KEYS)

    vue2.disposeAgent()
  })

  it('共享单例：未 dispose 时第二个入口复用已建实例，同进程只建一次连接', async () => {
    const { vue3, vue2 } = await freshEntries()

    const first = vue3.initAgent(config())
    const second = vue2.initAgent(config())

    expect(second).toBe(first)
    expect(createRpcClientMock).toHaveBeenCalledTimes(1)

    vue3.disposeAgent()
  })

  it('dispose 清空单例，再次 init 得到全新实例', async () => {
    const { vue3 } = await freshEntries()

    const first = vue3.initAgent(config())
    expect(vue3.getAgentInstance()).toBe(first)

    vue3.disposeAgent()
    expect(vue3.getAgentInstance()).toBeNull()

    const second = vue3.initAgent(config())
    expect(second).not.toBe(first)
    expect(vue3.getAgentInstance()).toBe(second)

    vue3.disposeAgent()
  })
})

describe('入口导出面（向后兼容）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('vue 3 入口保留全部历史导出（重构前 index.ts 的 16 个函数）', async () => {
    const { vue3 } = await freshEntries()

    const legacyExports = [
      'collectComponentTree',
      'createUniSocketChannel',
      'pushComponentTreeNow',
      'schedulePushComponentTree',
      'getComponentState',
      'getPiniaState',
      'getPiniaStores',
      'getRegisteredInstance',
      'recomputeComponentState',
      'updateComponentState',
      'updatePiniaState',
      'clearNetworkRecords',
      'getNetworkRecords',
      'installNetworkInterceptors',
      'resetNetworkPushState',
      'scheduleNetworkPush',
    ]

    for (const name of legacyExports) {
      expect(vue3, `missing legacy export: ${name}`).toHaveProperty(name)
      expect(typeof (vue3 as any)[name]).toBe('function')
    }

    // 新增导出（增量、不破坏兼容）
    expect(typeof vue3.getVueRuntimeVersion).toBe('function')
  })

  it('两个入口都导出 initAgent / getAgentInstance / disposeAgent', async () => {
    const { vue3, vue2 } = await freshEntries()

    for (const entry of [vue3, vue2]) {
      expect(typeof entry.initAgent).toBe('function')
      expect(typeof entry.getAgentInstance).toBe('function')
      expect(typeof entry.disposeAgent).toBe('function')
    }
  })
})
