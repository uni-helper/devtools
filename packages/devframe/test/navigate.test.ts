import { describe, expect, it } from 'vitest'
import { navigateInMiniProgram, normalizeRoutePath } from '../src/agent/navigate'

/** 造一个 uni 导航 API stub，默认各方法均成功；无论是否覆写实现都记录调用供断言 */
function createUniStub(overrides: {
  navigateTo?: (opts: any) => void
  redirectTo?: (opts: any) => void
  switchTab?: (opts: any) => void | false
} = {}) {
  const calls: Record<string, any[]> = { navigateTo: [], redirectTo: [], switchTab: [] }
  const success = (opts: any) => opts.success?.()
  const wrap = (name: string, impl?: (opts: any) => void) => (opts: any) => {
    calls[name].push(opts)
    ;(impl ?? success)(opts)
  }
  const uniStub: any = {
    navigateTo: wrap('navigateTo', overrides.navigateTo),
    redirectTo: wrap('redirectTo', overrides.redirectTo),
  }
  if (overrides.switchTab !== false) {
    uniStub.switchTab = wrap('switchTab', overrides.switchTab)
  }
  return { uniStub, calls }
}

const failWith = (errMsg: string) => (opts: any) => opts.fail?.({ errMsg })

describe('normalizeRoutePath', () => {
  it('去 query/hash 并统一前导斜杠', () => {
    expect(normalizeRoutePath('/pages/index?a=1')).toBe('/pages/index')
    expect(normalizeRoutePath('pages/index')).toBe('/pages/index')
    expect(normalizeRoutePath('/pages/index#frag')).toBe('/pages/index')
    expect(normalizeRoutePath('/pages/hi?x=1&y=2')).toBe('/pages/hi')
  })
})

describe('navigateInMiniProgram', () => {
  it('目标与栈顶同页时用 redirectTo 替换而非压栈（query 原样透传）', async () => {
    const { uniStub, calls } = createUniStub()
    const res = await navigateInMiniProgram(uniStub, '/pages/index?tab=2', () => [{ route: 'pages/index' }])
    expect(res).toEqual({ ok: true })
    expect(calls.redirectTo).toHaveLength(1)
    expect(calls.redirectTo[0].url).toBe('/pages/index?tab=2')
    expect(calls.navigateTo).toHaveLength(0)
  })

  it('目标与栈顶不同页时正常 navigateTo 压栈', async () => {
    const { uniStub, calls } = createUniStub()
    const res = await navigateInMiniProgram(uniStub, '/pages/hi', () => [{ route: 'pages/index' }])
    expect(res).toEqual({ ok: true })
    expect(calls.navigateTo).toHaveLength(1)
    expect(calls.navigateTo[0].url).toBe('/pages/hi')
    expect(calls.redirectTo).toHaveLength(0)
  })

  it('栈为空时无从判断同页，退化为 navigateTo', async () => {
    const { uniStub, calls } = createUniStub()
    await navigateInMiniProgram(uniStub, '/pages/index', () => [])
    expect(calls.navigateTo).toHaveLength(1)
  })

  it('getPages 抛错时不炸，退化为 navigateTo', async () => {
    const { uniStub, calls } = createUniStub()
    const res = await navigateInMiniProgram(uniStub, '/pages/index', () => {
      throw new Error('boom')
    })
    expect(res).toEqual({ ok: true })
    expect(calls.navigateTo).toHaveLength(1)
  })

  it('未提供 getPages 时退化为 navigateTo', async () => {
    const { uniStub, calls } = createUniStub()
    await navigateInMiniProgram(uniStub, '/pages/index')
    expect(calls.navigateTo).toHaveLength(1)
  })

  it('navigateTo 失败（如 tabBar 页）时回落 switchTab', async () => {
    const { uniStub, calls } = createUniStub({ navigateTo: failWith('navigateTo:fail can not navigateTo a tabbar page') })
    const res = await navigateInMiniProgram(uniStub, '/pages/tab', () => [{ route: 'pages/index' }])
    expect(res).toEqual({ ok: true })
    expect(calls.switchTab).toHaveLength(1)
    expect(calls.switchTab[0].url).toBe('/pages/tab')
  })

  it('同页 redirect 失败（tabBar 页停在自身 tab 上）时同样回落 switchTab', async () => {
    const { uniStub, calls } = createUniStub({ redirectTo: failWith('redirectTo:fail can not redirectTo a tabbar page') })
    const res = await navigateInMiniProgram(uniStub, '/pages/tab', () => [{ route: 'pages/tab' }])
    expect(res).toEqual({ ok: true })
    expect(calls.redirectTo).toHaveLength(1)
    expect(calls.switchTab).toHaveLength(1)
  })

  it('主跳转与 switchTab 均失败时返回主跳变的原始错误', async () => {
    const { uniStub } = createUniStub({
      navigateTo: failWith('navigateTo:fail timeout'),
      switchTab: failWith('switchTab:fail not a tabbar page'),
    })
    const res = await navigateInMiniProgram(uniStub, '/pages/hi', () => [{ route: 'pages/index' }])
    expect(res.ok).toBe(false)
    expect(res.error).toBe('navigateTo:fail timeout')
  })

  it('运行时没有 switchTab 且主跳转失败时返回错误', async () => {
    const { uniStub } = createUniStub({ navigateTo: failWith('navigateTo:fail'), switchTab: false })
    const res = await navigateInMiniProgram(uniStub, '/pages/hi', () => [{ route: 'pages/index' }])
    expect(res).toEqual({ ok: false, error: 'navigateTo:fail' })
  })
})
