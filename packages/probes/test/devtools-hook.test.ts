import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VUE_DEVTOOLS_HOOK_KEY,
  ensureVueDevtoolsHook,
  getVueDevtoolsHook,
} from '../src/runtime/devtools-hook'

/**
 * 探针自装的 Vue DevTools 钩子：Vue 运行时在 createApp 时读它，之后组件
 * 挂载/更新/卸载都经它 emit 出来。
 */
describe('探针自装 Vue DevTools 钩子', () => {
  afterEach(() => {
    delete (globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]
    delete (globalThis as any).__VUE_DEVTOOLS_HOOK_REPLAY__
  })

  it('全局没有钩子时装一个，Vue 发的组件事件能被订阅到', () => {
    const hook = ensureVueDevtoolsHook()!
    const added = vi.fn()
    hook.on('component:added', added)

    // Vue 运行时的调用形态：(app, uid, parentUid, instance)
    const runtimeHook = (globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]
    runtimeHook.emit('component:added', {}, 3, 1, { uid: 3 })

    expect(getVueDevtoolsHook()).toBe(hook)
    expect(added).toHaveBeenCalledWith({}, 3, 1, { uid: 3 })
  })

  it('已有钩子（浏览器扩展、HBuilderX 等装的）原样复用，不覆盖', () => {
    const existing = { on: vi.fn(), emit: vi.fn() }
    ;(globalThis as any)[VUE_DEVTOOLS_HOOK_KEY] = existing

    expect(ensureVueDevtoolsHook()).toBe(existing)
    expect((globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]).toBe(existing)
  })

  it('全局上占着一个不像钩子的值时不覆盖，返回 undefined 让调用方退回轮询', () => {
    ;(globalThis as any)[VUE_DEVTOOLS_HOOK_KEY] = { custom: true }

    expect(ensureVueDevtoolsHook()).toBeUndefined()
    expect((globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]).toEqual({ custom: true })
  })

  it('订阅之前发生的事件不缓存（缓存会攥住已卸载的组件实例）', () => {
    ensureVueDevtoolsHook()
    const runtimeHook = (globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]
    runtimeHook.emit('component:added', {}, 1, 0, { uid: 1 })

    const added = vi.fn()
    runtimeHook.on('component:added', added)

    expect(added).not.toHaveBeenCalled()
  })

  it('订阅方抛错不会抛回 Vue 的渲染流程，也不影响其他订阅方', () => {
    const hook = ensureVueDevtoolsHook()!
    const second = vi.fn()
    hook.on('component:updated', () => {
      throw new Error('listener bug')
    })
    hook.on('component:updated', second)

    const runtimeHook = (globalThis as any)[VUE_DEVTOOLS_HOOK_KEY]
    expect(() => runtimeHook.emit('component:updated')).not.toThrow()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('Vue 先于钩子初始化留下的补挂回调（浏览器环境）会被回放', () => {
    const attach = vi.fn()
    ;(globalThis as any).__VUE_DEVTOOLS_HOOK_REPLAY__ = [attach]

    const hook = ensureVueDevtoolsHook()

    expect(attach).toHaveBeenCalledWith(hook)
  })
})
