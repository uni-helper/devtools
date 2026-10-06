/**
 * 渲染钩子单测（CR P0-1 回归）：包装层必须转发全部实参。
 *
 * 背景：mp 运行时以 7 参调用 render（proxy, renderCache, props, setupState, data,
 * ctx），plain <script>/Options 组件的编译 render 是 6 参签名且使用 $setup/$data
 * ——初版包装只转发前两个参数导致这类组件渲染即崩（代码生成/语法检查都测不出，
 * 只有真机或本测试能拦住）。
 */
import { describe, expect, it } from 'vitest'
import { __uniDevtoolsNotifyRender } from '../src/runtime/render-hook'

const ctx = { a: 1 }
const cache = [1, 2]
const props = { p: true }
const setup = { s: 1 }
const data = { d: 1 }
const options = { o: 1 }

describe('__uniDevtoolsNotifyRender', () => {
  it('转发全部实参（6 参 render 签名场景）', () => {
    const received: unknown[] = []
    const render = (...args: unknown[]) => {
      received.push(...args)
      return { vnode: true }
    }
    const wrapped = __uniDevtoolsNotifyRender(render) as (...args: unknown[]) => unknown

    const args = [ctx, cache, props, setup, data, options]
    const thisObj = { proxy: true }
    const result = wrapped.apply(thisObj, args)

    expect(result).toEqual({ vnode: true })
    expect(received).toEqual(args)
  })

  it('保持 this 绑定与 length === 2 约定', () => {
    const render = function (this: any) {
      return this
    }
    const wrapped = __uniDevtoolsNotifyRender(render) as any
    const thisObj = { marker: 42 }
    expect(wrapped.call(thisObj)).toBe(thisObj)
    expect(wrapped.length).toBe(2)
  })

  it('非函数输入原样放行；探针未初始化也不炸渲染', () => {
    expect(__uniDevtoolsNotifyRender(undefined)).toBeUndefined()
    expect(__uniDevtoolsNotifyRender(42)).toBe(42)

    const render = (n: number) => n * 2
    const wrapped = __uniDevtoolsNotifyRender(render) as any
    expect([wrapped(1), wrapped(2)]).toEqual([2, 4])
  })
})
