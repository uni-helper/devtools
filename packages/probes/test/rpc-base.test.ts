import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createBaseRpcFunctions,
  getCurrentPagesSafe,
  resolveRuntimeUni,
} from '../src/runtime/rpc-base'
import { clearInstanceRegistry, extractComponentNode } from '../src/runtime/tree'

describe('rpc-base: createBaseRpcFunctions', () => {
  beforeEach(() => {
    clearInstanceRegistry()
    const vm = {
      $: {
        uid: 'comp-test',
        type: { name: 'CompTest' },
        data: { count: 1 },
      },
      count: 1,
    }
    extractComponentNode(vm, 0, 10, new Set(), '')
  })

  afterEach(() => {
    clearInstanceRegistry()
  })

  it('导出的 RPC 方法键集合恰好是 8 个契约键', () => {
    const fns = createBaseRpcFunctions()
    const keys = Object.keys(fns).sort()
    const expectedKeys = [
      'uni-devtools:agent:clearNetworkRecords',
      'uni-devtools:agent:getComponentState',
      'uni-devtools:agent:getComponentTree',
      'uni-devtools:agent:getNetworkRecords',
      'uni-devtools:agent:getRouterInfo',
      'uni-devtools:agent:navigate',
      'uni-devtools:agent:ping',
      'uni-devtools:agent:updateComponentState',
    ].sort()

    expect(keys).toEqual(expectedKeys)
    expect(keys).toHaveLength(8)
  })

  it('ping 返回当前时间戳数字', () => {
    const fns = createBaseRpcFunctions()
    const before = Date.now()
    const ts = fns['uni-devtools:agent:ping']()
    const after = Date.now()
    expect(typeof ts).toBe('number')
    expect(ts).toBeGreaterThanOrEqual(before)
    expect(ts).toBeLessThanOrEqual(after)
  })

  it('getComponentTree 返回 { pages, vueVersion } 结构', () => {
    const fns = createBaseRpcFunctions()
    const result = fns['uni-devtools:agent:getComponentTree']()
    expect(result).toHaveProperty('pages')
    expect(Array.isArray(result.pages)).toBe(true)
    expect(result).toHaveProperty('vueVersion')
  })

  it('getComponentState 支持字符串 id 与 { id } 对象入参', () => {
    const fns = createBaseRpcFunctions()
    const resString = fns['uni-devtools:agent:getComponentState']('comp-test')
    expect(resString).toHaveProperty('id', 'comp-test')
    expect(resString).toHaveProperty('data')
    expect(resString.data).toEqual({ count: 1 })

    const resObject = fns['uni-devtools:agent:getComponentState']({ id: 'comp-test' })
    expect(resObject).toHaveProperty('id', 'comp-test')
    expect(resObject.data).toEqual({ count: 1 })
  })

  it('getNetworkRecords 与 clearNetworkRecords 正常执行', () => {
    const fns = createBaseRpcFunctions()
    const netRes = fns['uni-devtools:agent:getNetworkRecords']()
    expect(netRes).toHaveProperty('records')
    expect(Array.isArray(netRes.records)).toBe(true)

    const clearRes = fns['uni-devtools:agent:clearNetworkRecords']()
    expect(clearRes).toEqual({ ok: true })
  })

  it('updateComponentState 支持两种入参形态并返回结果', () => {
    const fns = createBaseRpcFunctions()
    const resObj = fns['uni-devtools:agent:updateComponentState']({ id: 'comp-test', key: 'count', value: 2 })
    expect(resObj.ok).toBe(true)
    expect(resObj.key).toBe('count')

    const resArgs = fns['uni-devtools:agent:updateComponentState']('comp-test', 'count', 3)
    expect(resArgs.ok).toBe(true)
    expect(resArgs.key).toBe('count')
  })

  it('navigate 缺 path 时返回错误', async () => {
    const fns = createBaseRpcFunctions()
    const res = await fns['uni-devtools:agent:navigate']({ path: '' })
    expect(res).toEqual({ ok: false, error: 'Path is required' })
  })

  it('navigate 无 uni/wx 运行时返回错误', async () => {
    const originalUni = (globalThis as any).uni
    const originalWx = (globalThis as any).wx
    delete (globalThis as any).uni
    delete (globalThis as any).wx

    try {
      const fns = createBaseRpcFunctions()
      const res = await fns['uni-devtools:agent:navigate']({ path: '/pages/index' })
      expect(res).toEqual({ ok: false, error: 'uni runtime is not available' })
    }
    finally {
      if (originalUni !== undefined)
        (globalThis as any).uni = originalUni
      if (originalWx !== undefined)
        (globalThis as any).wx = originalWx
    }
  })
})

describe('rpc-base: getCurrentPagesSafe & getRouterInfo', () => {
  const originalGetPages = (globalThis as any).getCurrentPages

  afterEach(() => {
    if (originalGetPages !== undefined) {
      ;(globalThis as any).getCurrentPages = originalGetPages
    }
    else {
      delete (globalThis as any).getCurrentPages
    }
  })

  it('无 getCurrentPages 时 getCurrentPagesSafe 返回空数组', () => {
    delete (globalThis as any).getCurrentPages
    expect(getCurrentPagesSafe()).toEqual([])
  })

  it('getCurrentPages 抛错时 getCurrentPagesSafe 防御返回空数组', () => {
    ;(globalThis as any).getCurrentPages = () => {
      throw new Error('Not available yet')
    }
    expect(getCurrentPagesSafe()).toEqual([])
  })

  it('getCurrentPages 返回非数组时返回空数组', () => {
    ;(globalThis as any).getCurrentPages = () => null
    expect(getCurrentPagesSafe()).toEqual([])
  })

  it('无 getCurrentPages 时 getRouterInfo 返回 { currentRoute: null, stack: [] }', () => {
    delete (globalThis as any).getCurrentPages
    const fns = createBaseRpcFunctions()
    const routerInfo = fns['uni-devtools:agent:getRouterInfo']()
    expect(routerInfo).toEqual({
      currentRoute: null,
      stack: [],
    })
  })

  it('getRouterInfo 会为没有前导斜杠的路由补齐 / 并正确返回 currentRoute', () => {
    ;(globalThis as any).getCurrentPages = () => [
      { route: 'pages/index', options: { from: 'home' } },
      { route: '/pages/detail', options: { id: '42' } },
    ]
    const fns = createBaseRpcFunctions()
    const routerInfo = fns['uni-devtools:agent:getRouterInfo']()

    expect(routerInfo.stack).toHaveLength(2)
    expect(routerInfo.stack[0]).toEqual({
      path: '/pages/index',
      query: { from: 'home' },
      options: { from: 'home' },
    })
    expect(routerInfo.stack[1]).toEqual({
      path: '/pages/detail',
      query: { id: '42' },
      options: { id: '42' },
    })
    expect(routerInfo.currentRoute).toEqual({
      path: '/pages/detail',
      fullPath: '/pages/detail',
      query: { id: '42' },
    })
  })

  it('getRouterInfo 支持 __route__ 与 $page.options 回退', () => {
    ;(globalThis as any).getCurrentPages = () => [
      { __route__: 'pages/about', $page: { options: { lang: 'zh' } } },
    ]
    const fns = createBaseRpcFunctions()
    const routerInfo = fns['uni-devtools:agent:getRouterInfo']()
    expect(routerInfo.stack[0].path).toBe('/pages/about')
    expect(routerInfo.stack[0].query).toEqual({ lang: 'zh' })
  })
})

describe('rpc-base: resolveRuntimeUni', () => {
  const originalUni = (globalThis as any).uni
  const originalWx = (globalThis as any).wx

  afterEach(() => {
    if (originalUni !== undefined)
      (globalThis as any).uni = originalUni
    else delete (globalThis as any).uni
    if (originalWx !== undefined)
      (globalThis as any).wx = originalWx
    else delete (globalThis as any).wx
  })

  it('runtimeHint 优先', () => {
    const hint = { custom: true }
    ;(globalThis as any).uni = { globalUni: true }
    expect(resolveRuntimeUni(hint)).toBe(hint)
  })

  it('无 hint 时按 uni → wx 回退', () => {
    delete (globalThis as any).uni
    delete (globalThis as any).wx
    expect(resolveRuntimeUni()).toBeUndefined()

    const wxMock = { isWx: true }
    ;(globalThis as any).wx = wxMock
    expect(resolveRuntimeUni()).toBe(wxMock)

    const uniMock = { isUni: true }
    ;(globalThis as any).uni = uniMock
    expect(resolveRuntimeUni()).toBe(uniMock)
  })
})
