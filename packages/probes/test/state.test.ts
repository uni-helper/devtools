import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getComponentState,
  recomputeComponentState,
  updateComponentState,
} from '../src/runtime/state'
import { clearInstanceRegistry, extractComponentNode } from '../src/runtime/tree'

const BINDINGS_PROP = '__uni_devtools_bindings__'

describe('state: 组件状态面板全能力对齐官方', () => {
  beforeEach(() => {
    clearInstanceRegistry()
  })

  afterEach(() => {
    clearInstanceRegistry()
  })

  describe('1. 分类与徽标：getSetupBindingInfo', () => {
    it('computed ref 识别：stateType "computed" + raw 源码 tooltip', () => {
      const getterFn = function myGetter() {
        return 42
      }
      const vm = {
        $: {
          uid: 'comp-1',
          type: { name: 'Comp1' },
          setupState: {
            // effect.raw 形式
            doubleCount: {
              __v_isRef: true,
              effect: { raw: getterFn },
              value: 42,
            },
            // fn 形式
            tripled: {
              __v_isRef: true,
              fn: function triple() {
                return 63
              },
              value: 63,
            },
            // _dirty 形式 (Vue 3.4)
            dirtyComputed: {
              __v_isRef: true,
              _dirty: true,
              value: 100,
            },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('comp-1')
      expect(state.setup).toBeDefined()
      expect(state.setup!.doubleCount.stateType).toBe('computed')
      expect(state.setup!.doubleCount.value).toBe(42)
      expect(state.setup!.doubleCount.raw).toContain('myGetter')

      expect(state.setup!.tripled.stateType).toBe('computed')
      expect(state.setup!.tripled.value).toBe(63)
      expect(state.setup!.tripled.raw).toContain('triple')

      expect(state.setup!.dirtyComputed.stateType).toBe('computed')
      expect(state.setup!.dirtyComputed.value).toBe(100)
    })

    it('普通 ref 与 reactive 识别，readonly 标记', () => {
      const vm = {
        $: {
          uid: 'comp-2',
          type: { name: 'Comp2' },
          setupState: {
            normalRef: {
              __v_isRef: true,
              value: 'hello',
            },
            reactiveObj: {
              __v_isReactive: true,
              count: 10,
            },
            readonlyRef: {
              __v_isRef: true,
              __v_isReadonly: true,
              value: 'frozen',
            },
            plainValue: 'simple',
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('comp-2')
      expect(state.setup!.normalRef.stateType).toBe('ref')
      expect(state.setup!.normalRef.value).toBe('hello')
      expect(state.setup!.normalRef.readonly).toBeUndefined()

      expect(state.setup!.reactiveObj.stateType).toBe('reactive')
      expect(state.setup!.reactiveObj.value).toEqual({ count: 10 })

      expect(state.setup!.readonlyRef.stateType).toBe('ref')
      expect(state.setup!.readonlyRef.readonly).toBe(true)

      expect(state.setup!.plainValue.stateType).toBeUndefined()
      expect(state.setup!.plainValue.value).toBe('simple')
    })

    it('function 绑定、v-前缀键、组件样对象归入 setupOther', () => {
      const vm = {
        $: {
          uid: 'comp-3',
          type: { name: 'Comp3' },
          setupState: {
            onClick: function handleClick() {
              return true
            },
            vCustomDirective: { mounted() {} },
            vSlots: { default: true },
            subComponent: {
              render() {},
              props: {},
            },
            normalVar: {
              __v_isRef: true,
              value: 123,
            },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('comp-3')
      expect(state.setupOther).toBeDefined()
      expect(state.setupOther!.onClick.fn).toBe(true)
      expect(state.setupOther!.onClick.fnName).toBe('handleClick')
      expect(state.setupOther!.onClick.fnSource).toContain('handleClick')
      expect(state.setupOther!.onClick.value).toBeUndefined()

      expect(state.setupOther!.vCustomDirective).toBeDefined()
      expect(state.setupOther!.vSlots).toBeDefined()
      expect(state.setupOther!.subComponent).toBeDefined()

      // 普通 ref 仍在 setup 中
      expect(state.setup!.normalVar.stateType).toBe('ref')
      expect(state.setupOther!.normalVar).toBeUndefined()
    })
  })

  describe('2. 段产出与同名键过滤', () => {
    it('props/attrs/options computed 正确产出，data 与 setup 排除 props/computed 同名键', () => {
      const vm = {
        $: {
          uid: 'comp-sections',
          type: {
            name: 'CompSections',
            props: {
              declaredProp: { type: String },
            },
            computed: {
              doubled() {
                return 84
              },
              writableComputed: {
                get() {
                  return 100
                },
                set(_v: number) {},
              },
            },
          },
          props: {
            declaredProp: 'from-props',
          },
          attrs: {
            'data-testid': 'custom-attr',
          },
          proxy: {
            doubled: 84,
            writableComputed: 100,
          },
          data: {
            declaredProp: 'shadowed-in-data', // 应被排除
            doubled: 'shadowed-computed-in-data', // 应被排除
            realData: 'valid-data',
          },
          setupState: {
            declaredProp: { __v_isRef: true, value: 'shadowed-in-setup' }, // 应被排除
            setupVar: { __v_isRef: true, value: 'valid-setup' },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('comp-sections')

      // 1. props 段
      expect(state.props).toEqual({ declaredProp: 'from-props' })

      // 2. attrs 段
      expect(state.attrs).toEqual({ 'data-testid': 'custom-attr' })

      // 3. computed 段 (Options API)
      expect(state.computed).toBeDefined()
      expect(state.computed!.doubled.stateType).toBe('computed')
      expect(state.computed!.doubled.value).toBe(84)
      expect(state.computed!.doubled.editable).toBe(false)
      expect(state.computed!.writableComputed.editable).toBe(true)
      expect(state.computed!.writableComputed.value).toBe(100)

      // 4. data 排除同名键
      expect(state.data).toEqual({ realData: 'valid-data' })
      expect(state.data!.declaredProp).toBeUndefined()
      expect(state.data!.doubled).toBeUndefined()

      // 5. setup 排除 props 同名键
      expect(state.setup!.setupVar.value).toBe('valid-setup')
      expect(state.setup!.declaredProp).toBeUndefined()
    })
  })

  describe('3. 编辑路由 (updateComponentState)', () => {
    it('section "props" 写 internal.props', () => {
      const vm = {
        $: {
          uid: 'edit-props',
          type: { name: 'EditProps' },
          props: {
            label: 'initial',
            config: { color: 'red' },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      // 顶层修改
      updateComponentState({ id: 'edit-props', section: 'props', key: 'label', value: 'updated' })
      expect(vm.$.props.label).toBe('updated')

      // 深层嵌套修改
      updateComponentState({ id: 'edit-props', section: 'props', path: ['config', 'color'], value: 'blue' })
      expect(vm.$.props.config.color).toBe('blue')
    })

    it('section "computed" 写 proxy', () => {
      let internalVal = 10
      const vm = {
        $: {
          uid: 'edit-computed',
          type: { name: 'EditComputed' },
          proxy: {
            get writable() {
              return internalVal
            },
            set writable(val: number) {
              internalVal = val
            },
            get readonlyComp() {
              return 999
            },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      // 可写 computed
      updateComponentState({ id: 'edit-computed', section: 'computed', key: 'writable', value: 20 })
      expect(internalVal).toBe(20)

      // 无 setter computed 抛错如实冒泡
      expect(() => {
        updateComponentState({ id: 'edit-computed', section: 'computed', key: 'readonlyComp', value: 50 })
      }).toThrow()
    })

    it('setup ref 顶层与深层编辑保持原行为', () => {
      const countRef = { __v_isRef: true, value: 1 }
      const nestedRef = { __v_isRef: true, value: { nested: { title: 'old' } } }
      const vm = {
        $: {
          uid: 'edit-setup',
          type: { name: 'EditSetup' },
          setupState: {
            count: countRef,
            nested: nestedRef,
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      updateComponentState({ id: 'edit-setup', section: 'setup', key: 'count', value: 2 })
      expect(countRef.value).toBe(2)

      updateComponentState({ id: 'edit-setup', section: 'setup', path: ['nested', 'nested', 'title'], value: 'new' })
      expect(nestedRef.value.nested.title).toBe('new')
    })
  })

  describe('4. recompute (recomputeComponentState & triggerComputedRef)', () => {
    it('对 setup computed ref 调用触发重算与 dirty/flags 更新', () => {
      let callCount = 0
      const triggerSpy = vi.fn()

      const computedRef = {
        __v_isRef: true,
        flags: 128,
        globalVersion: 10,
        _value: 'val-0',
        effect: {
          dirty: false,
          raw: () => 'val',
        },
        dep: {
          trigger: triggerSpy,
        },
      }
      Object.defineProperty(computedRef, 'value', {
        get() {
          callCount++
          this._value = `val-${callCount}`
          return this._value
        },
        enumerable: false,
        configurable: true,
      })

      const vm = {
        $: {
          uid: 'recomp-vm',
          type: { name: 'RecompVm' },
          setupState: {
            myComputed: computedRef,
            myRef: { __v_isRef: true, value: 1 },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = recomputeComponentState('recomp-vm', 'setup', ['myComputed'])
      expect(res.ok).toBe(true)
      expect(triggerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          target: computedRef,
          type: 'set',
          key: 'value',
        }),
      )
      expect(computedRef.effect.dirty).toBe(true)
      expect(computedRef.flags & 128).toBe(128)
      expect(callCount).toBe(1)
      expect(computedRef._value).toBe('val-1')
    })

    it('非 computed ref 抛错报不支持', () => {
      const vm = {
        $: {
          uid: 'recomp-fail',
          type: { name: 'RecompFail' },
          setupState: {
            plainRef: { __v_isRef: true, value: 123 },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      expect(() => {
        recomputeComponentState('recomp-fail', 'setup', ['plainRef'])
      }).toThrow(/not a computed ref/)
    })

    it('非 setup 段或路径非法抛错', () => {
      const vm = {
        $: {
          uid: 'recomp-err',
          type: { name: 'RecompErr' },
          setupState: {
            comp: { __v_isRef: true, effect: { raw: () => 1 }, value: 1 },
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      expect(() => {
        recomputeComponentState('recomp-err', 'computed', ['comp'])
      }).toThrow(/only supported for setup section/)

      expect(() => {
        recomputeComponentState('recomp-err', 'setup', ['comp', 'child'])
      }).toThrow(/path of length 1/)
    })
  })

  describe('5. 编译期插桩 __uni_devtools_bindings__ 闭包绑定读取', () => {
    it('setupState 为空时，通过 render 上的 __uni_devtools_bindings__ 读取状态', () => {
      const countRef = { __v_isRef: true, value: 99 }
      const renderFn: any = () => {}
      renderFn[BINDINGS_PROP] = {
        count: countRef,
        message: 'hello closure',
      }

      const vm = {
        $: {
          uid: 'render-bindings',
          type: { name: 'ClosureComp' },
          setupState: {},
          render: renderFn,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('render-bindings')
      expect(state.setup).toBeDefined()
      expect(state.setup!.count.stateType).toBe('ref')
      expect(state.setup!.count.value).toBe(99)
      expect(state.setup!.message.value).toBe('hello closure')
    })
  })

  describe('6. Reactivity Graph 集成（随 get-component-state 搭车下发）', () => {
    it('mp 插桩闭包绑定：ref → render 边随 state 快照产出', () => {
      const renderFn: any = () => {}
      const renderEffect = { fn: renderFn, instance: { type: { name: 'GraphComp' } } }
      const countRef = { __v_isRef: true, value: 7, subs: { sub: renderEffect, nextSub: null } }
      // render 闭包绑定与 renderEffect.fn 是同一函数：3.5 启发靠 fn 上的标记识别 render
      renderFn[BINDINGS_PROP] = { count: countRef }

      const vm = {
        $: {
          uid: 'graph-mp',
          type: { name: 'GraphComp' },
          setupState: {},
          render: renderFn,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('graph-mp')
      expect(state.reactivityGraph).toBeDefined()

      const graph = state.reactivityGraph!
      expect(graph.nodes).toHaveLength(2)
      const refNode = graph.nodes.find(n => n.type === 'ref')
      const renderNode = graph.nodes.find(n => n.type === 'render')
      expect(refNode?.label).toBe('count')
      expect(renderNode?.label).toBe('GraphComp render')
      expect(graph.relationships).toHaveLength(1)
      expect(graph.relationships[0]).toEqual({
        id: `${refNode!.id}->${renderNode!.id}`,
        from: refNode!.id,
        to: renderNode!.id,
      })
    })

    it('无响应式绑定时省略 reactivityGraph 字段', () => {
      const vm = {
        $: {
          uid: 'graph-empty',
          type: { name: 'EmptyComp' },
          setupState: { plain: 'value' },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const state = getComponentState('graph-empty')
      expect(state.setup!.plain.value).toBe('value')
      expect(state.reactivityGraph).toBeUndefined()
    })
  })
})
