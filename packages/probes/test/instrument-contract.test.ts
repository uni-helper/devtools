/**
 * 插桩契约读端单测：验证探针 runtime 能正确读回编译期插桩注入的绑定与文件信息。
 *
 * 覆盖两条 mp 专属退化路径（读端）：
 * 1. 探针读取编译期捕获的绑定（mp script-setup 形态）
 * 2. 嵌套路径编辑（官方 editState 深路径语义）
 */
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { BINDINGS_PROP } from '@uni-helper/devtools-vite/instrument'
import { collectComponentTree, getRegisteredInstance } from '../src/runtime/tree'
import { getComponentState, updateComponentState } from '../src/runtime/state'

function registerPage(pages: any[]) {
  const trees = collectComponentTree(pages)
  expect(trees).toHaveLength(1)
  return trees[0]
}

describe('探针读取编译期捕获的绑定（mp script-setup 形态）', () => {
  function buildScriptSetupInstance() {
    const r = ref(1)
    const obj = { nested: true }
    const renderFn = () => ({ c: r.value })
    renderFn[BINDINGS_PROP] = { r, obj }
    const internal = {
      uid: 63,
      type: { __file: 'components/Anonymous.vue' }, // 无 name/__name：文件名兜底
      setupState: {}, // mp script-setup：EMPTY_OBJ
      render: renderFn,
    }
    return { internal, r }
  }

  it('getComponentState 读回 render 闭包绑定 + __file 兜底命名', () => {
    const { internal } = buildScriptSetupInstance()
    const page = { route: 'pages/test', $vm: { $: internal } }
    registerPage([page])

    const id = 'pages/test#63'
    expect(getRegisteredInstance(id)).toBeTruthy()
    const state = getComponentState(id)
    expect(state.name).toBe('Anonymous') // 'components/Anonymous.vue'.vue → Anonymous
    expect(state.setup.r).toEqual({ stateType: 'ref', value: 1, editable: true })
    expect(state.setup.obj).toEqual({ value: { nested: true } })
    expect(state.data).toBeUndefined()
  })

  it('updateComponentState 编辑 ref 绑定落到原 ref', () => {
    const { internal, r } = buildScriptSetupInstance()
    const page = { route: 'pages/test', $vm: { $: internal } }
    registerPage([page])

    const res = updateComponentState({ id: 'pages/test#63', key: 'r', value: 42 })
    expect(res.ok).toBe(true)
    expect(r.value).toBe(42)
  })

  it('编辑捕获绑定里的纯值（闭包 const）如实报错，不假装成功', () => {
    const renderFn = () => ({})
    renderFn[BINDINGS_PROP] = { plainConst: 1 }
    const internal = { uid: 64, type: { name: 'X' }, setupState: {}, render: renderFn }
    registerPage([{ route: 'pages/test', $vm: { $: internal } }])

    expect(() => updateComponentState({ id: 'pages/test#64', key: 'plainConst', value: 2 }))
      .toThrow(/非响应式 const/)
  })
})

describe('嵌套路径编辑（官方 editState 深路径语义）', () => {
  function registerWithSetupState(internal: any, route = 'pages/deep') {
    registerPage([{ route, $vm: { $: internal } }])
    return `${route}#${internal.uid}`
  }

  it('setupState 深路径：ref 包裹对象的嵌套属性赋值', () => {
    const r = ref({ nested: { count: 1 } })
    const internal = { uid: 70, type: { name: 'Deep' }, setupState: { r } }
    const id = registerWithSetupState(internal)

    const res = updateComponentState({ id, section: 'setup', path: ['r', 'nested', 'count'], value: 7 })
    expect(res.ok).toBe(true)
    expect(r.value.nested.count).toBe(7)
  })

  it('捕获绑定深路径：裸 ref 下钻 + 普通对象属性可写', () => {
    const r = ref({ a: 1 })
    const plain = { deep: { flag: false } }
    const renderFn = () => ({})
    renderFn[BINDINGS_PROP] = { r, plain }
    const internal = { uid: 71, type: { name: 'Cap' }, setupState: {}, render: renderFn }
    const id = registerWithSetupState(internal)

    updateComponentState({ id, section: 'setup', path: ['r', 'a'], value: 99 })
    expect(r.value.a).toBe(99)

    updateComponentState({ id, section: 'setup', path: ['plain', 'deep', 'flag'], value: true })
    expect(plain.deep.flag).toBe(true)
  })

  it('data section 深路径 + 数组索引写入', () => {
    const internal = { uid: 72, type: { name: 'D' }, data: { list: ['x', 'y'], obj: { k: 'v' } } }
    const id = registerWithSetupState(internal)

    updateComponentState({ id, section: 'data', path: ['obj', 'k'], value: 'v2' })
    expect(internal.data.obj.k).toBe('v2')
    updateComponentState({ id, section: 'data', path: ['list', '1'], value: 'z' })
    expect(internal.data.list).toEqual(['x', 'z'])
  })

  it('remove 语义：对象键删除 + 数组索引 splice', () => {
    const internal = { uid: 73, type: { name: 'R' }, data: { obj: { k: 'v' }, list: ['a', 'b'] } }
    const id = registerWithSetupState(internal)

    updateComponentState({ id, section: 'data', path: ['obj', 'k'], remove: true })
    expect('k' in internal.data.obj).toBe(false)
    updateComponentState({ id, section: 'data', path: ['list', '0'], remove: true })
    expect(internal.data.list).toEqual(['b'])
  })

  it('不可导航路径（原始值中间段）如实报错', () => {
    const r = ref(1)
    const internal = { uid: 74, type: { name: 'N' }, setupState: { r } }
    const id = registerWithSetupState(internal)

    expect(() => updateComponentState({ id, section: 'setup', path: ['r', 'x'], value: 1 }))
      .toThrow(/not navigable/)
  })

  it('section 显式指定但键不存在 → Key not found（不假装成功）', () => {
    const internal = { uid: 75, type: { name: 'M' }, setupState: {}, data: {} }
    const id = registerWithSetupState(internal)

    expect(() => updateComponentState({ id, section: 'setup', path: ['ghost'], value: 1 }))
      .toThrow(/not found/)
  })

  it('legacy 形态（key/value 无 path）保持兼容', () => {
    const r = ref(5)
    const internal = { uid: 76, type: { name: 'L' }, setupState: { r }, data: {} }
    const id = registerWithSetupState(internal)
    expect(updateComponentState({ id, key: 'r', value: 6 }).ok).toBe(true)
    expect(r.value).toBe(6)
  })
})
