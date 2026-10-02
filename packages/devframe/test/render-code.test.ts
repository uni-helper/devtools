import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getComponentRenderCode } from '../src/agent/render-code.ts'
import { clearInstanceRegistry, extractComponentNode } from '../src/agent/tree.ts'

const ORIGINAL_RENDER_PROP = '__uni_devtools_original_render__'

describe('render-code: 探针侧 Render Code 采集器', () => {
  beforeEach(() => {
    clearInstanceRegistry()
  })

  afterEach(() => {
    clearInstanceRegistry()
  })

  describe('1. 基础读取与回落链', () => {
    it('未注册 id 返回 {}', () => {
      expect(getComponentRenderCode('non-existent')).toEqual({})
      expect(getComponentRenderCode('')).toEqual({})
      expect(getComponentRenderCode(undefined as any)).toEqual({})
      expect(getComponentRenderCode(null as any)).toEqual({})
    })

    it('普通 render 函数直接读取（无包装标记）', () => {
      const plainRender = function myPlainRender() {
        return 'plain'
      }
      const vm = {
        $: {
          uid: 'comp-plain',
          render: plainRender,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-plain')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('myPlainRender')
    })

    it('扁平 vm（无 .$）直接支持', () => {
      const flatRender = function myFlatRender() {
        return 'flat'
      }
      const vm = {
        uid: 'comp-flat',
        render: flatRender,
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-flat')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('myFlatRender')
    })

    it('type.render 回落（instance.render 为 undefined 时）', () => {
      const typeRender = function myTypeRender() {
        return 'from-type-render'
      }
      const vm = {
        $: {
          uid: 'comp-type-render',
          type: {
            render: typeRender,
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-type-render')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('myTypeRender')
    })

    it('type.setup 回落（render 与 type.render 均无时）', () => {
      const setupFn = function mySetupFn() {
        return { count: 0 }
      }
      const vm = {
        $: {
          uid: 'comp-type-setup',
          type: {
            setup: setupFn,
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-type-setup')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('mySetupFn')
    })

    it('无 render 且无 setup 返回 {}', () => {
      const vm = {
        $: {
          uid: 'comp-empty',
          type: {},
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-empty')
      expect(res).toEqual({})
    })
  })

  describe('2. mp 特有包装函数解包（__uni_devtools_original_render__）', () => {
    it('包装函数解包：取标记指向的原始 render', () => {
      const originalRender = function rawRender() {
        return 'original-source'
      }
      const wrappedRender = function __uniDevtoolsNotifyRender() {
        return 'wrapped-source'
      }
      Object.defineProperty(wrappedRender, ORIGINAL_RENDER_PROP, {
        value: originalRender,
        enumerable: false,
        configurable: true,
      })

      const vm = {
        $: {
          uid: 'comp-wrapped',
          render: wrappedRender,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-wrapped')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('rawRender')
      expect(res.code).toContain('original-source')
      expect(res.code).not.toContain('__uniDevtoolsNotifyRender')
    })

    it('标记存在但为非函数值时，防御回落包装函数本身', () => {
      const wrappedRender = function wrappedWithInvalidMarker() {
        return 'fallback-to-wrapper'
      }
      Object.defineProperty(wrappedRender, ORIGINAL_RENDER_PROP, {
        value: 'not-a-function',
        enumerable: false,
        configurable: true,
      })

      const vm = {
        $: {
          uid: 'comp-invalid-marker',
          render: wrappedRender,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-invalid-marker')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('wrappedWithInvalidMarker')
      expect(res.code).toContain('fallback-to-wrapper')
    })

    it('标记为 null 或 undefined 时回落包装函数本身', () => {
      const wrappedRender = function wrappedWithNullMarker() {
        return 'fallback-null-marker'
      }
      Object.defineProperty(wrappedRender, ORIGINAL_RENDER_PROP, {
        value: null,
        enumerable: false,
        configurable: true,
      })

      const vm = {
        $: {
          uid: 'comp-null-marker',
          render: wrappedRender,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-null-marker')
      expect(res.code).toBeDefined()
      expect(res.code).toContain('wrappedWithNullMarker')
    })
  })

  describe('3. 归一缩进（normalizeFunctionIndentation 照搬算法）', () => {
    it('单行函数保持原样不动', () => {
      const singleLineFn = function single() {}
      singleLineFn.toString = () => 'function single() { return "ok"; }'
      const vm = {
        $: {
          uid: 'comp-single',
          render: singleLineFn,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-single')
      expect(res.code).toBe('function single() { return "ok"; }')
    })

    it('多行函数剥除主体行最小公共前导空白', () => {
      const multilineFn = function dummy() {}
      multilineFn.toString = () =>
        'function render() {\n'
        + '    const a = 1;\n'
        + '    const b = 2;\n'
        + '  }'

      const vm = {
        $: {
          uid: 'comp-multiline',
          render: multilineFn,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-multiline')
      expect(res.code).toBe(
        'function render() {\n'
        + '  const a = 1;\n'
        + '  const b = 2;\n'
        + '}',
      )
    })

    it('主体行无公共缩进时保持原样', () => {
      const noIndentFn = function dummy() {}
      noIndentFn.toString = () =>
        'function render() {\n'
        + 'const a = 1;\n'
        + '  const b = 2;\n'
        + '}'

      const vm = {
        $: {
          uid: 'comp-no-indent',
          render: noIndentFn,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-no-indent')
      expect(res.code).toBe(
        'function render() {\n'
        + 'const a = 1;\n'
        + '  const b = 2;\n'
        + '}',
      )
    })
  })

  describe('4. 健壮性与防御性（不抛错、任何失败返回 {}）', () => {
    it('render getter 抛错时不崩，返回 {}', () => {
      const vm = {
        $: {
          uid: 'comp-error-render',
          get render() {
            throw new Error('access render failed')
          },
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      expect(() => getComponentRenderCode('comp-error-render')).not.toThrow()
      expect(getComponentRenderCode('comp-error-render')).toEqual({})
    })

    it('标记 getter 抛错时回落包装函数本身', () => {
      const wrapped = function wrappedWithThrowingMarker() {
        return 'safe-wrapped'
      }
      Object.defineProperty(wrapped, ORIGINAL_RENDER_PROP, {
        get() {
          throw new Error('access marker failed')
        },
        configurable: true,
      })

      const vm = {
        $: {
          uid: 'comp-throwing-marker',
          render: wrapped,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      expect(() => getComponentRenderCode('comp-throwing-marker')).not.toThrow()
      const res = getComponentRenderCode('comp-throwing-marker')
      expect(res.code).toContain('safe-wrapped')
    })

    it('toString() 抛错时不崩，返回 {}', () => {
      const throwingFn = function brokenToString() {}
      throwingFn.toString = () => {
        throw new Error('toString crashed')
      }

      const vm = {
        $: {
          uid: 'comp-broken-tostring',
          render: throwingFn,
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      expect(() => getComponentRenderCode('comp-broken-tostring')).not.toThrow()
      expect(getComponentRenderCode('comp-broken-tostring')).toEqual({})
    })

    it('组件已卸载（isUnmounted: true）被清理并返回 {}', () => {
      const vm = {
        $: {
          uid: 'comp-unmounted',
          isUnmounted: true,
          render: () => 'unmounted',
        },
      }
      extractComponentNode(vm, 0, 10, new Set(), '')

      const res = getComponentRenderCode('comp-unmounted')
      expect(res).toEqual({})
    })
  })
})
