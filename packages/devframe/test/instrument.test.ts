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
import { BINDINGS_PROP, injectEntryFileGuard, injectSetupBindings, resolveVirtualEntryFile } from '../src/instrument'
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

  it('改写 setup 返回 render 函数的形态，捕获顶层绑定（跳过 __props）', () => {
    const out = injectSetupBindings(SCRIPT_SETUP_OUTPUT, parseWithAcorn)
    expect(out).toContain(`Object.assign((_ctx, _cache) => {`)
    // 绑定对象只含用户声明（编译器形参 __props 不进捕获）
    expect(out).toContain(`{ ${BINDINGS_PROP}: { r, name, aa, obj } }`)
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

  function registerPage(pages: any[]) {
    const trees = collectComponentTree(pages)
    expect(trees).toHaveLength(1)
    return trees[0]
  }

  it('getComponentState 读回 render 闭包绑定 + __file 兜底命名', () => {
    const { internal } = buildScriptSetupInstance()
    const page = { route: 'pages/test', $vm: { $: internal } }
    registerPage([page])

    const id = 'pages/test#63'
    expect(getRegisteredInstance(id)).toBeTruthy()
    const state = getComponentState(id)
    expect(state.name).toBe('Anonymous') // 'components/Anonymous.vue'.vue → Anonymous
    expect(state.setup.r).toEqual({ type: 'ref', value: 1 })
    expect(state.setup.obj).toEqual({ type: 'object', value: { nested: true } })
    expect(state.data).toEqual({})
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
