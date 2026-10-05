import { afterEach, describe, expect, it } from 'vitest'
import { clearInstanceRegistry, collectComponentTree, getRegisteredInstance, getVueRuntimeVersion } from '../src/agent/tree'

const g = globalThis as any

afterEach(() => {
  delete g.getCurrentPages
  delete g.getApp
  delete g.Vue
  clearInstanceRegistry()
})

/** 最小可采集的假页面：page.$vm 指向带 $ 内部对象的根实例，挂一个同名 uid 的子组件 */
function makePage(route: string, rootName = 'IndexPage') {
  const child = { $: { uid: 2, type: { name: 'ChildComp' } } }
  const root = { $: { uid: 1, type: { name: rootName }, $children: [child] } }
  return { route, $vm: root }
}

describe('collectComponentTree', () => {
  it('单实例页面保持裸 route 命名（route#uid 冻结契约不变）', () => {
    g.getCurrentPages = () => [makePage('pages/index')]
    const [first] = collectComponentTree()
    expect(first.route).toBe('pages/index')
    expect(first.components!.id).toBe('pages/index#1')
    expect(first.components!.children![0].id).toBe('pages/index#2')
  })

  it('不同 route 共存时互不加后缀', () => {
    g.getCurrentPages = () => [makePage('pages/index'), makePage('pages/hi', 'HiPage')]
    const routes = collectComponentTree().map(page => page.route)
    expect(routes).toEqual(['pages/index', 'pages/hi'])
  })

  it('同一 route 压栈多次时第 2+ 个实例的 route/节点 id 带出现序号，uid 撞车被隔离', () => {
    // 两个实例的根 uid 都是 1（Vue uid 按页面实例各自计数）——裸 route#uid 必撞车
    g.getCurrentPages = () => [makePage('pages/index'), makePage('pages/index')]
    const results = collectComponentTree()
    expect(results.map(page => page.route)).toEqual(['pages/index', 'pages/index@2'])
    expect(results[0].components!.id).toBe('pages/index#1')
    expect(results[1].components!.id).toBe('pages/index@2#1')

    // 注册表两个 key 各自可达，状态读写不会串实例
    expect(getRegisteredInstance('pages/index#1')).toBeTruthy()
    expect(getRegisteredInstance('pages/index@2#1')).toBeTruthy()
    expect(getRegisteredInstance('pages/index#1')).not.toBe(getRegisteredInstance('pages/index@2#1'))
  })

  it('第三个同 route 实例序号递增', () => {
    g.getCurrentPages = () => [
      makePage('pages/index'),
      makePage('pages/hi'),
      makePage('pages/index'),
      makePage('pages/index'),
    ]
    const routes = collectComponentTree().map(page => page.route)
    expect(routes).toEqual(['pages/index', 'pages/hi', 'pages/index@2', 'pages/index@3'])
  })
})

describe('getVueRuntimeVersion', () => {
  it('从已注册组件实例的 appContext 读取 Vue 版本', () => {
    const pageWithVersion = {
      route: 'pages/index',
      $vm: {
        $: {
          uid: 1,
          type: { name: 'IndexPage' },
          appContext: {
            app: { version: '3.5.13' },
          },
        },
      },
    }
    g.getCurrentPages = () => [pageWithVersion]
    collectComponentTree()
    expect(getVueRuntimeVersion()).toBe('3.5.13')
  })

  it('组件实例无版本时兜底从 getApp() 读取', () => {
    g.getApp = () => ({
      $vm: {
        $: {
          appContext: {
            app: { version: '3.5.20' },
          },
        },
      },
    })
    expect(getVueRuntimeVersion()).toBe('3.5.20')
  })

  it('组件实例与 getApp 均无版本时兜底从全局 Vue 读取', () => {
    g.Vue = { version: '3.5.30' }
    expect(getVueRuntimeVersion()).toBe('3.5.30')
  })

  it('无任何版本来源时返回 undefined', () => {
    expect(getVueRuntimeVersion()).toBeUndefined()
  })
})
