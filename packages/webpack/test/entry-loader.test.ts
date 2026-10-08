import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const entryLoader = require('../entry-loader.cjs')

const { shouldInjectAgentEntry, INJECT_MARKER, INJECT_CODE } = entryLoader

describe('entry-loader: shouldInjectAgentEntry 命名谓词 (LESSONS #2)', () => {
  it('带 query 的模块不注入 (防 uni 页面入口重写导致重复/错误注入)', () => {
    expect(
      shouldInjectAgentEntry(
        '/src/main.js',
        '?{"page":"pages%2Findex%2Findex"}',
        'console.log("hello")',
      ),
    ).toBe(false)
    expect(
      shouldInjectAgentEntry(undefined, '?page=index', 'console.log("hello")'),
    ).toBe(false)
    // 两个参数形式
    expect(
      shouldInjectAgentEntry(
        '?{"page":"pages%2Findex%2Findex"}',
        'console.log("hello")',
      ),
    ).toBe(false)
  })

  it('裸 ? 不注入 (resourceQuery 为 ? 时同样拒绝)', () => {
    expect(
      shouldInjectAgentEntry('/src/main.js', '?', 'console.log("hello")'),
    ).toBe(false)
    expect(shouldInjectAgentEntry('?', 'console.log("hello")')).toBe(false)
  })

  it('空 query 正常注入', () => {
    expect(
      shouldInjectAgentEntry('/src/main.js', '', 'console.log("hello")'),
    ).toBe(true)
    expect(
      shouldInjectAgentEntry('/src/main.js', undefined, 'console.log("hello")'),
    ).toBe(true)
    expect(shouldInjectAgentEntry('', 'console.log("hello")')).toBe(true)
  })

  it('已含 INJECT_MARKER 不重复注入', () => {
    const already = `/* ${INJECT_MARKER} */\nconsole.log("already injected")`
    expect(shouldInjectAgentEntry('/src/main.js', '', already)).toBe(false)
    expect(shouldInjectAgentEntry('', already)).toBe(false)
  })

  it('已含 probe 引用不重复注入', () => {
    const withProbe = `import { initAgent } from '@uni-helper/devtools-probes/vue2';\ninitAgent();`
    expect(shouldInjectAgentEntry('/src/main.js', '', withProbe)).toBe(false)
  })
})

describe('entry-loader: webpack loader 执行', () => {
  it('满足注入条件时前置注入 INJECT_CODE', () => {
    const callback = vi.fn()
    const ctx = {
      resourcePath: '/project/src/main.js',
      resourceQuery: '',
      callback,
      cacheable: vi.fn(),
    }

    entryLoader.call(ctx, 'const app = new Vue();', null)

    expect(callback).toHaveBeenCalledWith(
      null,
      `${INJECT_CODE}const app = new Vue();`,
      null,
    )
  })

  it('带 query 时放行原代码', () => {
    const callback = vi.fn()
    const ctx = {
      resourcePath: '/project/src/main.js',
      resourceQuery: '?{"page":"pages%2Findex%2Findex"}',
      callback,
      cacheable: vi.fn(),
    }

    entryLoader.call(ctx, 'const app = new Vue();', null)

    expect(callback).toHaveBeenCalledWith(null, 'const app = new Vue();', null)
  })

  it('已含 marker 时放行原代码', () => {
    const callback = vi.fn()
    const code = `/* ${INJECT_MARKER} */\nconst app = new Vue();`
    const ctx = {
      resourcePath: '/project/src/main.js',
      resourceQuery: '',
      callback,
      cacheable: vi.fn(),
    }

    entryLoader.call(ctx, code, null)

    expect(callback).toHaveBeenCalledWith(null, code, null)
  })
})
