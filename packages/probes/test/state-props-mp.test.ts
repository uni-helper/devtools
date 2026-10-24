import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getComponentState, updateComponentState } from '../src/runtime/state'
import {
  clearInstanceRegistry,
  extractComponentNode,
} from '../src/runtime/tree'

/**
 * props 编辑在 mp 运行时下的写入路径。
 *
 * 背景：官方 devtools 与探针原本都直接写组件实例的 props 对象（`vm.$props`），这在浏览器里
 * 生效。但 mp 下 props 的渲染真源是宿主组件的 `properties`——mp-vue 的 setData 载荷
 * （`cloneWithData`）不含 props，所以只写 Vue 侧到不了视图，还会被 properties 的 observer
 * 覆写回去。修复是：mp 下改为写宿主 `setData`。
 *
 * 这里用 Vue 2 形态的假实例（无 `.$`，字段直接挂在 vm 上）覆盖各条分支。
 */
function createMpVm(
  props: Record<string, any>,
  options: { withScope?: boolean } = {},
) {
  const { withScope = true } = options
  const setData = vi.fn()

  const vm: any = {
    _uid: 'comp-props',
    _isDestroyed: false,
    $options: {
      props: Object.fromEntries(
        Object.keys(props).map((key) => [key, { type: null }]),
      ),
    },
    $props: { ...props },
    $data: {},
    $forceUpdate: vi.fn(),
  }
  if (withScope) {
    vm.$scope = { setData }
  }
  // Vue 2 的 setReactive 会探测构造器上的静态 set/delete 来判定是否走 Vue.set/Vue.delete
  vm.constructor = { set: () => {}, delete: () => {} }

  return { vm, setData }
}

function register(vm: any) {
  extractComponentNode(vm, 0, 10, new Set(), '')
}

describe('props 编辑：mp 下写宿主 properties', () => {
  beforeEach(() => {
    clearInstanceRegistry()
  })

  afterEach(() => {
    clearInstanceRegistry()
  })

  it('顶层 prop：写入宿主 setData，Vue 侧同步落地', () => {
    const { vm, setData } = createMpVm({ title: 'a', item: { qty: 1 } })
    register(vm)

    const res = updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['title'],
      value: 'b',
    })

    expect(res.ok).toBe(true)
    expect(setData).toHaveBeenCalledTimes(1)
    expect(setData).toHaveBeenCalledWith({ title: 'b' })
    expect(vm.$props.title).toBe('b')
    // 面板紧随其后重拉状态，必须立刻读到新值
    expect(getComponentState('comp-props').props!.title).toBe('b')
  })

  it('嵌套路径：整值替换，不用 a.b 路径写法', () => {
    const { vm, setData } = createMpVm({ item: { qty: 1 } })
    register(vm)

    updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['item', 'qty'],
      value: 5,
    })

    expect(setData).toHaveBeenCalledWith({ item: { qty: 5 } })
    expect(vm.$props.item.qty).toBe(5)
  })

  it('数组下标：整值替换', () => {
    const { vm, setData } = createMpVm({ tags: ['x', 'y'] })
    register(vm)

    updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['tags', '0'],
      value: 'z',
    })

    expect(setData).toHaveBeenCalledWith({ tags: ['z', 'y'] })
    expect(vm.$props.tags[0]).toBe('z')
  })

  it('多层嵌套 + 数组混合路径', () => {
    const { vm, setData } = createMpVm({ list: [{ meta: { done: false } }] })
    register(vm)

    updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['list', '0', 'meta', 'done'],
      value: true,
    })

    expect(setData).toHaveBeenCalledWith({ list: [{ meta: { done: true } }] })
    expect(vm.$props.list[0].meta.done).toBe(true)
  })

  it('非 mp 运行时（无 $scope）：不碰 setData，保持原有行为', () => {
    const { vm, setData } = createMpVm({ title: 'a' }, { withScope: false })
    register(vm)

    updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['title'],
      value: 'b',
    })

    expect(setData).not.toHaveBeenCalled()
    expect(vm.$props.title).toBe('b')
  })

  it('宿主无 setData 方法时同样降级', () => {
    const { vm, setData } = createMpVm({ title: 'a' })
    vm.$scope = {}
    register(vm)

    const res = updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['title'],
      value: 'b',
    })

    expect(res.ok).toBe(true)
    expect(setData).not.toHaveBeenCalled()
    expect(vm.$props.title).toBe('b')
  })

  it('remove 不写宿主：properties 无法删除，避免把视图改坏', () => {
    const { vm, setData } = createMpVm({ title: 'a' })
    register(vm)

    updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['title'],
      remove: true,
    })

    expect(setData).not.toHaveBeenCalled()
  })

  it('宿主 setData 抛错时降级，不打断编辑', () => {
    const { vm } = createMpVm({ title: 'a' })
    vm.$scope.setData = () => {
      throw new Error('setData size limit exceeded')
    }
    register(vm)

    const res = updateComponentState({
      id: 'comp-props',
      section: 'props',
      path: ['title'],
      value: 'b',
    })

    expect(res.ok).toBe(true)
    expect(vm.$props.title).toBe('b')
  })

  it('未声明的 prop 仍然报错', () => {
    const { vm, setData } = createMpVm({ title: 'a' })
    register(vm)

    expect(() =>
      updateComponentState({
        id: 'comp-props',
        section: 'props',
        path: ['nope'],
        value: 1,
      }),
    ).toThrow(/not found in props/)
    expect(setData).not.toHaveBeenCalled()
  })
})
