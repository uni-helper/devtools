import { beforeAll, describe, expect, it } from 'vitest'
import { proxyRefs } from 'vue'
import * as Vue from 'vue'
import { buildReactivityGraph } from '../src/runtime/reactivity-graph'
import { setVueRuntime } from '../src/runtime/serialize'

const BINDINGS_PROP = '__uni_devtools_bindings__'

// 在所有测试之前设置 Vue 运行时
beforeAll(() => {
  setVueRuntime(Vue)
})

// Vue 3.6 类模拟
class SetupRenderEffect {
  instance?: any
  constructor(instance?: any) {
    this.instance = instance
  }
}

class RenderWatcherEffect {
  cb?: any
  constructor(cb?: any) {
    this.cb = cb
  }
}

class WatcherEffect {
  cb?: any
  constructor(cb?: any) {
    this.cb = cb
  }
}

class ReactiveEffect {
  fn?: any
  constructor(fn?: any) {
    this.fn = fn
  }
}

class Dep {
  key?: string
  constructor(key?: string) {
    this.key = key
  }
}

// Vue 3.5 Watcher 类模拟
class Watcher {
  cb?: any
  constructor(cb?: any) {
    this.cb = cb
  }
}

describe('reactivity-graph: 响应式图采集器 (探针侧)', () => {
  describe('1. ref -> render 边构建', () => {
    it('正确解析 3.6 SetupRenderEffect 订阅与 ref -> render 边', () => {
      const renderEffect = new SetupRenderEffect({
        type: { name: 'MyComponent' },
      })
      const countRef = {
        __v_isRef: true,
        value: 10,
        subs: {
          sub: renderEffect,
          nextSub: null,
        },
      }

      const snapshot = buildReactivityGraph({ count: countRef })

      expect(snapshot.nodes).toHaveLength(2)
      const refNode = snapshot.nodes.find((n) => n.type === 'ref')
      const renderNode = snapshot.nodes.find((n) => n.type === 'render')

      expect(refNode).toBeDefined()
      expect(refNode!.label).toBe('count')
      expect(refNode!.data.value).toBe('10')

      expect(renderNode).toBeDefined()
      expect(renderNode!.label).toBe('MyComponent render')
      expect(renderNode!.data.instanceName).toBe('MyComponent')

      expect(snapshot.relationships).toHaveLength(1)
      expect(snapshot.relationships[0]).toEqual({
        id: `${refNode!.id}->${renderNode!.id}`,
        from: refNode!.id,
        to: renderNode!.id,
      })
    })

    it('正确解析 3.5 插桩 render 闭包订阅与 ref -> render 边', () => {
      const renderFn = function templateRender() {}
      ;(renderFn as any)[BINDINGS_PROP] = { count: true }

      const renderEffect35 = {
        fn: renderFn,
        instance: {
          type: { __name: 'UniHome' },
        },
      }

      const titleRef = {
        __v_isRef: true,
        value: 'hello',
        subs: {
          sub: renderEffect35,
          nextSub: null,
        },
      }

      const snapshot = buildReactivityGraph({ title: titleRef })

      expect(snapshot.nodes).toHaveLength(2)
      const refNode = snapshot.nodes.find((n) => n.type === 'ref')
      const renderNode = snapshot.nodes.find((n) => n.type === 'render')

      expect(refNode).toBeDefined()
      expect(refNode!.label).toBe('title')
      expect(refNode!.data.value).toBe('"hello"')

      expect(renderNode).toBeDefined()
      expect(renderNode!.label).toBe('UniHome render')
      expect(renderNode!.data.instanceName).toBe('UniHome')

      expect(snapshot.relationships[0]).toEqual({
        id: `${refNode!.id}->${renderNode!.id}`,
        from: refNode!.id,
        to: renderNode!.id,
      })
    })
  })

  describe('2. computed -> dep 边构建', () => {
    it('正确解析 computed 依赖链与 dep -> computed 边 (官方数据流向)', () => {
      const dep = new Dep('baseCount')
      const computedRef = {
        __v_isRef: true,
        effect: { raw: () => 20 },
        value: 20,
        deps: {
          dep,
          nextDep: null,
        },
      }

      const snapshot = buildReactivityGraph({ doubleCount: computedRef })

      expect(snapshot.nodes).toHaveLength(2)
      const computedNode = snapshot.nodes.find((n) => n.type === 'computed')
      const depNode = snapshot.nodes.find((n) => n.type === 'reactive')

      expect(computedNode).toBeDefined()
      expect(computedNode!.label).toBe('doubleCount')
      expect(computedNode!.data.value).toBe('20')

      expect(depNode).toBeDefined()
      expect(depNode!.label).toBe('reactive.baseCount')
      expect(depNode!.data.key).toBe('baseCount')

      // 官方 kit 约定：dep 流向 computed (depNode -> computedNode)
      expect(snapshot.relationships).toHaveLength(1)
      expect(snapshot.relationships[0]).toEqual({
        id: `${depNode!.id}->${computedNode!.id}`,
        from: depNode!.id,
        to: computedNode!.id,
      })
    })
  })

  describe('3. 同对象重复出现与边去重', () => {
    it('同一对象在 setupSource 多键引用时只产生 1 个节点，边去重', () => {
      const renderEffect = new SetupRenderEffect()
      const sharedRef = {
        __v_isRef: true,
        value: 100,
        subs: {
          sub: renderEffect,
          nextSub: null,
        },
      }

      const snapshot = buildReactivityGraph({
        aliasA: sharedRef,
        aliasB: sharedRef,
      })

      // sharedRef 节点只有 1 个，renderEffect 节点只有 1 个
      expect(snapshot.nodes).toHaveLength(2)
      const refNodes = snapshot.nodes.filter((n) => n.type === 'ref')
      expect(refNodes).toHaveLength(1)

      // aliasA 和 aliasB 指向同一个 ref，产生的边完全去重，只有一条
      expect(snapshot.relationships).toHaveLength(1)
      expect(snapshot.relationships[0].from).toBe(refNodes[0].id)
    })

    it('跨多次 buildReactivityGraph 调用，同一对象的节点 id 保持稳定', () => {
      const renderEffect = new SetupRenderEffect()
      const myRef = {
        __v_isRef: true,
        value: 1,
        subs: { sub: renderEffect, nextSub: null },
      }

      const snapshot1 = buildReactivityGraph({ count: myRef })
      const snapshot2 = buildReactivityGraph({ count: myRef })

      const node1 = snapshot1.nodes.find((n) => n.type === 'ref')
      const node2 = snapshot2.nodes.find((n) => n.type === 'ref')
      expect(node1!.id).toBe(node2!.id)

      const render1 = snapshot1.nodes.find((n) => n.type === 'render')
      const render2 = snapshot2.nodes.find((n) => n.type === 'render')
      expect(render1!.id).toBe(render2!.id)
    })
  })

  describe('4. nextSub / nextDep 环状链表不死循环', () => {
    it('nextSub 自环与多节点环不会死循环，能安全遍历且只记录各节点一次', () => {
      const effect1 = new SetupRenderEffect()
      const effect2 = new SetupRenderEffect()

      const link1: any = { sub: effect1, nextSub: null }
      const link2: any = { sub: effect2, nextSub: null }
      // 形成环：link1 -> link2 -> link1
      link1.nextSub = link2
      link2.nextSub = link1

      const cyclicRef = {
        __v_isRef: true,
        value: 99,
        subs: link1,
      }

      const snapshot = buildReactivityGraph({ cyclicRef })

      expect(snapshot.nodes).toHaveLength(3) // cyclicRef + effect1 + effect2
      expect(snapshot.relationships).toHaveLength(2)
    })

    it('nextDep 环状链表不会死循环', () => {
      const depA = new Dep('depA')
      const depB = new Dep('depB')

      const linkA: any = { dep: depA, nextDep: null }
      const linkB: any = { dep: depB, nextDep: null }
      linkA.nextDep = linkB
      linkB.nextDep = linkA

      const cyclicComputed = {
        __v_isRef: true,
        effect: { raw: () => 1 },
        value: 1,
        deps: linkA,
      }

      const snapshot = buildReactivityGraph({ cyclicComputed })

      expect(snapshot.nodes).toHaveLength(3) // cyclicComputed + depA + depB
      expect(snapshot.relationships).toHaveLength(2)
    })
  })

  describe('5. 3.5 与 3.6 双命名分类启发式规则', () => {
    it('vue 3.6 官方构造器名称分类', () => {
      const setupRender = new SetupRenderEffect()
      const renderWatcher = new RenderWatcherEffect()
      const watcherEffect = new WatcherEffect()
      const reactiveEffect = new ReactiveEffect()
      const dep = new Dep()

      const ref = {
        __v_isRef: true,
        value: 0,
        subs: {
          sub: setupRender,
          nextSub: {
            sub: renderWatcher,
            nextSub: {
              sub: watcherEffect,
              nextSub: {
                sub: reactiveEffect,
                nextSub: {
                  sub: dep,
                  nextSub: null,
                },
              },
            },
          },
        },
      }

      const snapshot = buildReactivityGraph({ val: ref })
      const types = snapshot.nodes.map((n) => n.type)

      expect(types).toContain('ref')
      expect(types).toContain('render')
      expect(types).toContain('watch')
      expect(types).toContain('effect')
      expect(types).toContain('reactive')
    })

    it('vue 3.5 启发式分类：Watcher 类、{ cb } 对象、{ fn 带 bindings 标记 }', () => {
      const watcherInstance = new Watcher()
      const cbWatcher = {
        cb: function onUpdate() {},
      }
      const renderWithBindings = {
        fn: Object.assign(() => {}, { [BINDINGS_PROP]: {} }),
      }

      const ref = {
        __v_isRef: true,
        value: 0,
        subs: {
          sub: watcherInstance,
          nextSub: {
            sub: cbWatcher,
            nextSub: {
              sub: renderWithBindings,
              nextSub: null,
            },
          },
        },
      }

      const snapshot = buildReactivityGraph({ val: ref })

      const renderNode = snapshot.nodes.find((n) => n.type === 'render')
      expect(renderNode).toBeDefined()
      expect(renderNode!.label).toBe('Anonymous component render')

      const watchNodes = snapshot.nodes.filter((n) => n.type === 'watch')
      expect(watchNodes).toHaveLength(2)
      // cbWatcher 提取出 cb 源码预览
      const cbNode = watchNodes.find((n) => n.data.cb !== undefined)
      expect(cbNode?.data.cb).toContain('onUpdate')
    })

    it('回落 getSetupBindingInfo 与 unknown 分类', () => {
      const plainRef = { __v_isRef: true, value: 'refVal' }
      const plainReactive = { __v_isReactive: true, count: 1 }
      const plainComputed = { __v_isRef: true, effect: {}, value: 2 }
      const unknownObj = { unknownProp: 123 }

      const refWithUnknown = {
        __v_isRef: true,
        value: 1,
        subs: {
          sub: unknownObj,
          nextSub: null,
        },
      }

      const snapshot = buildReactivityGraph({
        plainRef,
        plainReactive,
        plainComputed,
        refWithUnknown,
      })

      const types = snapshot.nodes.map((n) => n.type)
      expect(types).toContain('ref')
      expect(types).toContain('reactive')
      expect(types).toContain('computed')
      expect(types).toContain('unknown')
    })
  })

  describe('6. 边界与空输入', () => {
    it('null、undefined、空对象与非对象类型安全返回空快照', () => {
      expect(buildReactivityGraph(null)).toEqual({
        nodes: [],
        relationships: [],
      })
      expect(buildReactivityGraph(undefined)).toEqual({
        nodes: [],
        relationships: [],
      })
      expect(buildReactivityGraph({})).toEqual({ nodes: [], relationships: [] })
      expect(buildReactivityGraph(123 as any)).toEqual({
        nodes: [],
        relationships: [],
      })
      expect(buildReactivityGraph('string' as any)).toEqual({
        nodes: [],
        relationships: [],
      })
      expect(buildReactivityGraph(true as any)).toEqual({
        nodes: [],
        relationships: [],
      })
    })

    it('跳过以 "_" 或 "$" 开头的私有属性', () => {
      const snapshot = buildReactivityGraph({
        _internalRef: { __v_isRef: true, value: 1 },
        $systemRef: { __v_isRef: true, value: 2 },
        validRef: { __v_isRef: true, value: 3 },
      })

      expect(snapshot.nodes).toHaveLength(1)
      expect(snapshot.nodes[0].label).toBe('validRef')
    })
  })

  describe('7. 异常与防御性兜底', () => {
    it('循环引用对象不抛错', () => {
      const circular: any = {
        __v_isRef: true,
        value: 1,
      }
      circular.self = circular

      expect(() => buildReactivityGraph({ circular })).not.toThrow()
      const snapshot = buildReactivityGraph({ circular })
      expect(snapshot.nodes.length).toBeGreaterThan(0)
    })

    it('getter 抛错的有害对象不抛错且跳过受影响绑定', () => {
      const evilSetup: any = {
        get badGetter() {
          throw new Error('Explosion on setup property access')
        },
        safeRef: {
          __v_isRef: true,
          value: 42,
        },
      }

      expect(() => buildReactivityGraph(evilSetup)).not.toThrow()
      const snapshot = buildReactivityGraph(evilSetup)
      expect(snapshot.nodes).toHaveLength(1)
      expect(snapshot.nodes[0].label).toBe('safeRef')
    })

    it('value / subs 读取抛错的 ref 不抛错', () => {
      const throwingRef = {
        __v_isRef: true,
        get value() {
          throw new Error('Explosion on value')
        },
        get subs() {
          throw new Error('Explosion on subs')
        },
      }

      expect(() => buildReactivityGraph({ throwingRef })).not.toThrow()
      const snapshot = buildReactivityGraph({ throwingRef })
      expect(snapshot.nodes).toHaveLength(1)
      expect(snapshot.nodes[0].label).toBe('throwingRef')
      expect(snapshot.nodes[0].data.value).toBe('undefined')
    })
  })

  describe('8. proxyRefs 双读模式', () => {
    it('带 getter 的模拟代理对象：属性读取解包但 getRaw 能还原 ref', () => {
      const renderEffect = new SetupRenderEffect()
      const realRef = {
        __v_isRef: true,
        value: 123,
        subs: {
          sub: renderEffect,
          nextSub: null,
        },
      }

      const rawTarget = {
        count: realRef,
      }

      // 模拟 proxyRefs：直接读取 count 得到解包后的 primitive 123，丢失 __v_isRef
      const simulatedProxy = {
        get count() {
          return 123
        },
        __v_raw: rawTarget,
      }

      const snapshot = buildReactivityGraph(simulatedProxy)

      expect(snapshot.nodes).toHaveLength(2)
      const refNode = snapshot.nodes.find((n) => n.type === 'ref')
      const renderNode = snapshot.nodes.find((n) => n.type === 'render')

      expect(refNode).toBeDefined()
      expect(refNode!.label).toBe('count')
      expect(renderNode).toBeDefined()

      expect(snapshot.relationships).toHaveLength(1)
      expect(snapshot.relationships[0]).toEqual({
        id: `${refNode!.id}->${renderNode!.id}`,
        from: refNode!.id,
        to: renderNode!.id,
      })
    })

    it('真实 Vue proxyRefs 代理对象双读', () => {
      const renderEffect = new SetupRenderEffect()
      const realRef = {
        __v_isRef: true,
        value: 'vue-proxy',
        subs: {
          sub: renderEffect,
          nextSub: null,
        },
      }

      const rawSetup = {
        message: realRef as any,
      }
      const proxy = proxyRefs(rawSetup)

      // proxy.message 被解包为 'vue-proxy' (字符串，非对象)
      expect(typeof proxy.message).toBe('string')

      const snapshot = buildReactivityGraph(proxy as any)

      expect(snapshot.nodes).toHaveLength(2)
      const refNode = snapshot.nodes.find((n) => n.type === 'ref')
      expect(refNode).toBeDefined()
      expect(refNode!.label).toBe('message')
      expect(refNode!.data.value).toBe('"vue-proxy"')
      expect(snapshot.relationships).toHaveLength(1)
    })
  })
})
