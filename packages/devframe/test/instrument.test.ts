/**
 * 编译期插桩 + 探针读取的单测。
 *
 * 覆盖两条 mp 专属退化路径（instrument.ts 模块头）：
 * 1. `__file` 注入：虚拟入口两行形态的锚定与守卫
 * 2. script setup 闭包绑定捕获：「setup 返回 render 函数」形态改写后，
 *    探针 resolveSetupSource 能读回绑定（ref 活值 / 编辑落回原 ref）
 */
import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import { ref } from 'vue'
import { BINDINGS_PROP, injectEntryFileGuard, injectPlainRenderHook, injectSetupBindings, resolveVirtualEntryFile } from '../src/instrument'
import { collectComponentTree, getRegisteredInstance } from '../src/agent/tree'
import { getComponentState, updateComponentState } from '../src/agent/state'

const parseWithAcorn = (source: string): any => parse(source, { ecmaVersion: 'latest', sourceType: 'module' })

describe('injectEntryFileGuard', () => {
  it('在 createComponent 前注入 __file 守卫（微信形态，无分号）', () => {
    const code = `import Component from '/src/components/Foo.vue'\nwx.createComponent(Component)`
    const out = injectEntryFileGuard(code, 'components/Foo.vue')
    expect(out).toContain(`if (Component && !Component.__file) { Component.__file = "components/Foo.vue"; }`)
    expect(out).toContain('wx.createComponent(Component)')
    expect(out!.indexOf('__file =')).toBeLessThan(out!.indexOf('wx.createComponent'))
  })

  it('createPage 形态（带分号）同样注入', () => {
    const code = `import MiniProgramPage from '/src/pages/index.vue'\nwx.createPage(MiniProgramPage);`
    const out = injectEntryFileGuard(code, 'pages/index.vue')
    expect(out).toContain(`MiniProgramPage.__file = "pages/index.vue"`)
  })

  it('非入口形态或已注入时不改写', () => {
    expect(injectEntryFileGuard('const a = 1', 'a.vue')).toBeNull()
    const already = `import C from 'x'\n/* __uni_devtools_file__ */ if (C && !C.__file) { C.__file = "a"; }\nwx.createComponent(C)`
    expect(injectEntryFileGuard(already, 'a.vue')).toBeNull()
  })
})

describe('resolveVirtualEntryFile', () => {
  it('base64url 解码为相对 UNI_INPUT_DIR 路径', () => {
    // base64url('components/TestComp.vue')
    const encoded = Buffer.from('components/TestComp.vue', 'utf8').toString('base64url')
    process.env.UNI_INPUT_DIR = '/project/src'
    expect(resolveVirtualEntryFile(`uniComponent://${encoded}`)).toBe('components/TestComp.vue')
    expect(resolveVirtualEntryFile('not-a-virtual-id')).toBeUndefined()
    delete process.env.UNI_INPUT_DIR
  })
})

describe('injectSetupBindings', () => {
  const SCRIPT_SETUP_OUTPUT = `const _sfc_main = defineComponent({
  __name: "TestComp",
  setup(__props) {
    const r = ref(1);
    function name(params) { console.log(params); }
    const aa = () => { r.value++; };
    const obj = { a: 1 };
    return (_ctx, _cache) => {
      return { a: t(a), b: o(name), c: t(r.value), d: o(aa), e: t(obj) };
    };
  }
});`

  it('改写 setup 返回 render 函数的形态，捕获顶层绑定并包渲染钩子', () => {
    const out = injectSetupBindings(SCRIPT_SETUP_OUTPUT, parseWithAcorn)
    // 渲染钩子包装（渲染即调度树推送）+ 绑定对象只含用户声明
    expect(out).toContain(`Object.assign(__uni_devtools_notify_render((_ctx, _cache) => {`)
    expect(out).toContain(`{ ${BINDINGS_PROP}: { r, name, aa, obj } }`)
    expect(out).toContain(`import { __uniDevtoolsNotifyRender as __uni_devtools_notify_render } from '@uni-helper/devtools-devframe/agent/render-hook'`)
    // 语法仍可解析（插桩不炸构建）
    expect(() => parseWithAcorn(out!)).not.toThrow()
  })

  it('setup 返回对象（plain <script> 形态）不注入——运行时 setupState 已可用', () => {
    const plain = `const _sfc_main = { setup() { const count = ref(0); return { count }; } };`
    expect(injectSetupBindings(plain, parseWithAcorn)).toBeNull()
  })

  it('无 setup / 解析失败时安全放行', () => {
    expect(injectSetupBindings('const a = 1', parseWithAcorn)).toBeNull()
    expect(injectSetupBindings('setup(}}invalid', parseWithAcorn)).toBeNull()
  })
})

describe('injectPlainRenderHook', () => {
  it('包装 _export_sfc 的 render 引用并注入导入', () => {
    const code = `const Component = /* @__PURE__ */ _export_sfc(_sfc_main, [["render", _sfc_render]]);\nwx.createComponent(Component);`
    const out = injectPlainRenderHook(code)
    expect(out).toContain(`["render", __uni_devtools_notify_render(_sfc_render)]`)
    expect(out).toContain(`from '@uni-helper/devtools-devframe/agent/render-hook'`)
    expect(() => parseWithAcorn(out!)).not.toThrow()
  })

  it('无 _export_sfc / 已注入 / 无 render 项时不改写', () => {
    expect(injectPlainRenderHook('const a = 1')).toBeNull()
    expect(injectPlainRenderHook(`_export_sfc(m, [["render", __uni_devtools_notify_render(r)]])`)).toBeNull()
    expect(injectPlainRenderHook(`_export_sfc(m, [["__scopeId", "data-v-x"]])`)).toBeNull()
  })
})

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
    expect(state.setup.r).toEqual({ stateType: 'ref', value: 1 })
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
