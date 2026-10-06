import { afterEach, describe, expect, it } from 'vitest'
import { clearInstanceRegistry, collectComponentTree, getRegisteredInstance, getVueRuntimeVersion } from '../src/runtime/tree'

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

  it('缺少 uid 的组件在多次树快照刷新中保持稳定 ID（WeakMap 缓存）', () => {
    // 模拟没有 uid 的合成组件（如 Vue 2 边缘情况）
    const syntheticChild = {
      $options: { name: 'SyntheticChild' },
    }
    const root = {
      $: { uid: 1, type: { name: 'IndexPage' }, $children: [syntheticChild] },
    }
    g.getCurrentPages = () => [{ route: 'pages/index', $vm: root }]

    // 第一次快照
    const [snapshot1] = collectComponentTree()
    const childNode1 = snapshot1.components!.children![0]
    expect(childNode1.name).toBe('SyntheticChild')
    expect(childNode1.id).toMatch(/^pages\/index#c_1_\d+$/)

    // 第二次快照（模拟快照轮询/刷新）
    const [snapshot2] = collectComponentTree()
    const childNode2 = snapshot2.components!.children![0]

    // ID 必须完全一致，防止面板误判为节点重建
    expect(childNode2.id).toBe(childNode1.id)

    // 第三次快照
    const [snapshot3] = collectComponentTree()
    const childNode3 = snapshot3.components!.children![0]
    expect(childNode3.id).toBe(childNode1.id)

    // 实例注册表可通过稳定 ID 正确找回 vm 实例
    expect(getRegisteredInstance(childNode1.id)).toBe(syntheticChild)
  })

  it('多个无 uid 组件获得不同但各自稳定的 ID', () => {
    const childA = { $options: { name: 'CompA' } }
    const childB = { $options: { name: 'CompB' } }
    const root = {
      $: { uid: 1, type: { name: 'IndexPage' }, $children: [childA, childB] },
    }
    g.getCurrentPages = () => [{ route: 'pages/index', $vm: root }]

    const [snapshot1] = collectComponentTree()
    const idA1 = snapshot1.components!.children![0].id
    const idB1 = snapshot1.components!.children![1].id

    expect(idA1).not.toBe(idB1)
    expect(getRegisteredInstance(idA1)).toBe(childA)
    expect(getRegisteredInstance(idB1)).toBe(childB)

    const [snapshot2] = collectComponentTree()
    expect(snapshot2.components!.children![0].id).toBe(idA1)
    expect(snapshot2.components!.children![1].id).toBe(idB1)
  })

  it('uni-mp $children 残留的已销毁实例不进树（v-if 切换后新旧实例不重复）', () => {
    // uni-mp-vue 内核只在 mountComponent 时向父 ctx.$children push、卸载从不
    // 移除：v-if 切走时旧实例（isUnmounted）滞留链上，切回后同名新实例再追加
    const deadChild = { $: { uid: 5, type: { name: 'TestComp' }, isUnmounted: true } }
    const aliveChild = { $: { uid: 12, type: { name: 'TestComp' } } }
    const deadVue2Child = { _uid: 6, $options: { name: 'HiCounter' }, _isDestroyed: true }
    const aliveVue2Child = { _uid: 13, $options: { name: 'HiCounter' } }
    const root = {
      $: {
        uid: 1,
        type: { name: 'IndexPage' },
        $children: [deadChild, aliveChild, deadVue2Child, aliveVue2Child],
      },
    }
    g.getCurrentPages = () => [{ route: 'pages/index', $vm: root }]

    const [snapshot] = collectComponentTree()
    const children = snapshot.components!.children!

    // 死实例及其子树被剪掉，仅存活实例可达——同名组件只出现一次
    expect(children.map(node => node.id)).toEqual(['pages/index#12', 'pages/index#13'])
    expect(children.filter(node => node.name === 'TestComp')).toHaveLength(1)
    expect(children.filter(node => node.name === 'HiCounter')).toHaveLength(1)

    // 死实例不进入实例注册表（状态读写不能命中已销毁实例）
    expect(getRegisteredInstance('pages/index#5')).toBeUndefined()
    expect(getRegisteredInstance('pages/index#12')).toBe(aliveChild)
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
