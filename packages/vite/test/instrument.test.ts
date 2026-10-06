/**
 * 编译期插桩单测（写端）。
 *
 * 覆盖两条 mp 专属退化路径（instrument.ts 模块头）：
 * 1. `__file` 注入：虚拟入口两行形态的锚定与守卫
 * 2. script setup 闭包绑定捕获：「setup 返回 render 函数」形态改写
 */
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import { BINDINGS_PROP, injectEntryFileGuard, injectPlainRenderHook, injectSetupBindings, resolveVirtualEntryFile } from '../src/instrument'

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
    expect(out).toContain(`import { __uniDevtoolsNotifyRender as __uni_devtools_notify_render } from '@uni-helper/devtools-probes/render-hook'`)
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
    expect(out).toContain(`from '@uni-helper/devtools-probes/render-hook'`)
    expect(() => parseWithAcorn(out!)).not.toThrow()
  })

  it('无 _export_sfc / 已注入 / 无 render 项时不改写', () => {
    expect(injectPlainRenderHook('const a = 1')).toBeNull()
    expect(injectPlainRenderHook(`_export_sfc(m, [["render", __uni_devtools_notify_render(r)]])`)).toBeNull()
    expect(injectPlainRenderHook(`_export_sfc(m, [["__scopeId", "data-v-x"]])`)).toBeNull()
  })
})
