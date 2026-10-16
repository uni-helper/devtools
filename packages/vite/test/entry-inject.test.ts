import { Buffer } from 'node:buffer'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'acorn'
import {
  AGENT_IMPORT_LINE,
  AGENT_IMPORT_MARKER,
  isComponentModule,
  isVirtualComponentEntry,
  shouldInjectAgentEntry,
  transformAgentEntry,
  transformInstrument,
} from '../src/entry-inject.ts'
import { BINDINGS_PROP } from '../src/instrument.ts'

const parseWithAcorn = (source: string): any =>
  parse(source, { ecmaVersion: 'latest', sourceType: 'module' })

describe('entry-inject: shouldInjectAgentEntry 命名谓词 (LESSONS #2)', () => {
  it('主入口 main.ts / main.js 正常判定为应注入', () => {
    expect(shouldInjectAgentEntry('/project/src/main.ts')).toBe(true)
    expect(shouldInjectAgentEntry('/project/src/main.js')).toBe(true)
    expect(shouldInjectAgentEntry('src/main.ts')).toBe(true)
  })

  it('非主入口文件不注入', () => {
    expect(shouldInjectAgentEntry('/project/src/pages/index.vue')).toBe(false)
    expect(shouldInjectAgentEntry('/project/src/main-sub.ts')).toBe(false)
    expect(shouldInjectAgentEntry('/project/src/utils/api.ts')).toBe(false)
  })

  it('带 query 的主入口不注入 (id 含 query 或显式 query 参数)', () => {
    expect(shouldInjectAgentEntry('/project/src/main.ts?vue&type=script')).toBe(
      false,
    )
    expect(
      shouldInjectAgentEntry(
        '/project/src/main.ts',
        '?{"page":"pages%2Findex%2Findex"}',
      ),
    ).toBe(false)
    expect(
      shouldInjectAgentEntry('/project/src/main.ts', { query: '?page=index' }),
    ).toBe(false)
  })

  it('裸 ? 不注入 (无论是 id 结尾含 ? 还是显式 query 为 ?)', () => {
    expect(shouldInjectAgentEntry('/project/src/main.ts?')).toBe(false)
    expect(shouldInjectAgentEntry('/project/src/main.ts', '?')).toBe(false)
    expect(shouldInjectAgentEntry('/project/src/main.ts', { query: '?' })).toBe(
      false,
    )
  })

  it('空 query 正常注入', () => {
    expect(shouldInjectAgentEntry('/project/src/main.ts', '')).toBe(true)
    expect(shouldInjectAgentEntry('/project/src/main.ts', { query: '' })).toBe(
      true,
    )
  })

  it('已含 AGENT_IMPORT_MARKER 或 probe 引用时不重复注入', () => {
    const already = `/* ${AGENT_IMPORT_MARKER} */\nimport { initAgent } from '@uni-helper/devtools-probes/vue3';`
    expect(shouldInjectAgentEntry('/project/src/main.ts', '', already)).toBe(
      false,
    )
    expect(
      shouldInjectAgentEntry('/project/src/main.ts', { code: already }),
    ).toBe(false)

    const probeCode = `import { initAgent } from '@uni-helper/devtools-probes/vue3';`
    expect(shouldInjectAgentEntry('/project/src/main.ts', '', probeCode)).toBe(
      false,
    )
  })
})

describe('entry-inject: 有 UNI_INPUT_DIR 时按输入目录精确识别主入口', () => {
  const original = process.env.UNI_INPUT_DIR
  afterEach(() => {
    if (original === undefined) delete process.env.UNI_INPUT_DIR
    else process.env.UNI_INPUT_DIR = original
  })

  it('HBuilderX 项目（main.js 在项目根、没有 src）也能注入', () => {
    process.env.UNI_INPUT_DIR = '/hbx-project'
    expect(shouldInjectAgentEntry('/hbx-project/main.js')).toBe(true)
    expect(shouldInjectAgentEntry('/hbx-project/main.ts')).toBe(true)
  })

  it('输入目录之外同名的 src/main.ts 不注入', () => {
    process.env.UNI_INPUT_DIR = '/project/src'
    expect(shouldInjectAgentEntry('/project/src/main.ts')).toBe(true)
    expect(
      shouldInjectAgentEntry('/project/node_modules/some-lib/src/main.ts'),
    ).toBe(false)
  })
})

describe('entry-inject: transformAgentEntry 纯函数', () => {
  it('正确前置注入 initAgent 代码', () => {
    const source = 'const app = createApp(App);'
    const result = transformAgentEntry(source, '/project/src/main.ts')
    expect(result).not.toBeNull()
    expect(result!.code).toBe(`${AGENT_IMPORT_LINE}${source}`)
  })

  it('注入的 initAgent 调用拿到虚拟模块提供的探针配置（wsUrl / token）', () => {
    const result = transformAgentEntry('', '/project/src/main.ts')!
    const body = parseWithAcorn(result.code).body
    const localNameOf = (source: string, imported: string) =>
      body
        .find(
          (n: any) =>
            n.type === 'ImportDeclaration' && n.source.value === source,
        )
        ?.specifiers.find((s: any) => s.imported?.name === imported)?.local.name
    const initAgentName = localNameOf(
      '@uni-helper/devtools-probes/vue3',
      'initAgent',
    )
    const configName = localNameOf('virtual:uni-devtools-agent', 'config')

    const initCall = body.find(
      (n: any) =>
        n.type === 'ExpressionStatement' &&
        n.expression.type === 'CallExpression' &&
        n.expression.callee.name === initAgentName,
    )
    expect(configName).toBeDefined()
    expect(initCall.expression.arguments.map((a: any) => a.name)).toEqual([
      configName,
    ])
  })

  it('产出 source map：注入的行不映射，原第 1 行映射回源码第 1 行', () => {
    const source = 'const app = createApp(App);'
    const result = transformAgentEntry(source, '/project/src/main.ts')!
    const injectedLines = AGENT_IMPORT_LINE.split('\n').length - 1

    expect(result.map.sources).toEqual(['/project/src/main.ts'])
    expect(result.map.sourcesContent).toEqual([source])
    // VLQ：每个 ';' 是一行；注入行没有映射段，紧随其后的第一段是 (0,0)→(0,0)
    expect(
      result.map.mappings.startsWith(`${';'.repeat(injectedLines)}AAAA`),
    ).toBe(true)
  })

  it('不符合条件时返回 null', () => {
    expect(
      transformAgentEntry('const a = 1;', '/project/src/other.ts'),
    ).toBeNull()
    expect(
      transformAgentEntry('const a = 1;', '/project/src/main.ts?vue'),
    ).toBeNull()
    expect(
      transformAgentEntry(
        `/* ${AGENT_IMPORT_MARKER} */`,
        '/project/src/main.ts',
      ),
    ).toBeNull()
  })
})

describe('entry-inject: isVirtualComponentEntry & isComponentModule 谓词', () => {
  it('isVirtualComponentEntry 识别 uni 虚拟组件/页面入口', () => {
    expect(isVirtualComponentEntry('uniComponent://YWJj')).toBe(true)
    expect(isVirtualComponentEntry('uniPage://YWJj')).toBe(true)
    expect(isVirtualComponentEntry('/project/src/Foo.vue')).toBe(false)
  })

  it('isComponentModule 识别 Vue/JS/TS 组件模块', () => {
    expect(isComponentModule('/project/src/Foo.vue')).toBe(true)
    expect(isComponentModule('/project/src/Foo.vue?vue&type=script')).toBe(true)
    expect(isComponentModule('/project/src/comp.tsx')).toBe(true)
    expect(isComponentModule('/project/src/style.css')).toBe(false)
    expect(isComponentModule('/project/src/data.json')).toBe(false)
  })
})

describe('entry-inject: transformInstrument 纯函数', () => {
  it('虚拟入口注入 __file 守卫', () => {
    const encoded = Buffer.from('components/TestComp.vue', 'utf8').toString(
      'base64url',
    )
    process.env.UNI_INPUT_DIR = '/project/src'
    const code = `import Component from '/src/components/TestComp.vue'\nwx.createComponent(Component)`
    const result = transformInstrument(code, `uniComponent://${encoded}`)

    expect(result).not.toBeNull()
    expect(result!.code).toContain('TestComp.vue')
    expect(result!.code).toContain('__file')
    delete process.env.UNI_INPUT_DIR
  })

  it('script setup 组件模块注入绑定捕获与渲染钩子', () => {
    const code = `const _sfc_main = defineComponent({
      __name: "TestComp",
      setup(__props) {
        const r = ref(1);
        return (_ctx, _cache) => {
          return { a: t(r.value) };
        };
      }
    });`

    const result = transformInstrument(
      code,
      '/project/src/components/TestComp.vue',
      {
        parse: parseWithAcorn,
      },
    )

    expect(result).not.toBeNull()
    expect(result!.code).toContain(BINDINGS_PROP)
    expect(result!.code).toContain('__uni_devtools_notify_render')
  })

  it('plain script 组件模块注入 _export_sfc 渲染钩子', () => {
    const code = `import { _export_sfc } from 'plugin-vue:export-helper';
const _sfc_render = () => {};
const _sfc_main = {};
export default /* @__PURE__ */ _export_sfc(_sfc_main, [['render', _sfc_render]]);`

    const result = transformInstrument(
      code,
      '/project/src/components/Plain.vue',
    )

    expect(result).not.toBeNull()
    expect(result!.code).toContain('__uniDevtoolsNotifyRender')
  })

  it('node_modules 里的组件不插桩（组件库发布的 .vue 源码）', () => {
    const code = `const _sfc_main = defineComponent({
      setup(__props) {
        const r = ref(1);
        return (_ctx, _cache) => ({ a: r.value });
      }
    });`

    expect(
      transformInstrument(
        code,
        '/project/node_modules/.pnpm/wot-design-uni@1.0.0/node_modules/wot-design-uni/components/wd-button/wd-button.vue',
        { parse: parseWithAcorn },
      ),
    ).toBeNull()
  })

  it('依赖里的组件虚拟入口仍注入 __file（只补属性，不引入 import）', () => {
    const encoded = Buffer.from(
      '/project/node_modules/lib/Button.vue',
      'utf8',
    ).toString('base64url')
    const code = `import C from '/project/node_modules/lib/Button.vue'\nwx.createComponent(C)`

    const result = transformInstrument(code, `uniComponent://${encoded}`)

    expect(result!.code).toContain('__file')
    expect(result!.code).not.toContain('import { __uniDevtoolsNotifyRender')
  })

  it('插桩产出指向原文件的 source map', () => {
    const code = `const _sfc_main = defineComponent({
      setup(__props) {
        const r = ref(1);
        return (_ctx, _cache) => ({ a: r.value });
      }
    });`

    const result = transformInstrument(code, '/project/src/A.vue', {
      parse: parseWithAcorn,
    })!

    expect(result.map.sources).toEqual(['/project/src/A.vue'])
    expect(result.map.mappings.length).toBeGreaterThan(0)
  })

  it('非组件模块或无匹配点时返回 null', () => {
    expect(
      transformInstrument('const a = 1;', '/project/src/utils.ts'),
    ).toBeNull()
    expect(
      transformInstrument('const a = 1;', '/project/src/plain.vue'),
    ).toBeNull()
  })
})
