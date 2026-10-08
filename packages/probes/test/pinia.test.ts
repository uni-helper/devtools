/**
 * Pinia 探针采集单测：fake pinia（_s Map + reactive store 形态）+ fake getApp。
 * 覆盖：store 枚举、state/getters 快照、深路径编辑、错误路径。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { computed, reactive, ref } from 'vue'
import {
  getPiniaState,
  getPiniaStores,
  updatePiniaState,
} from '../src/runtime/pinia'

function setupStores(stores: Record<string, any>) {
  ;(globalThis as any).getApp = () => ({
    $vm: {
      $: {
        appContext: {
          config: {
            globalProperties: {
              $pinia: { _s: new Map(Object.entries(stores)) },
            },
          },
        },
      },
    },
  })
  return () => delete (globalThis as any).getApp
}

afterEach(() => {
  delete (globalThis as any).getApp
})

describe('getPiniaStores / getPiniaState', () => {
  it('枚举 _s 全部 store（无 pinia 时安全空列表）', () => {
    expect(getPiniaStores()).toEqual({ stores: [] })
    const cleanup = setupStores({
      counter: reactive({ count: 1, double: computed(() => 2) }),
    })
    expect(getPiniaStores()).toEqual({ stores: [{ id: 'counter' }] })
    cleanup()
    expect(getPiniaStores()).toEqual({ stores: [] })
  })

  it('state 快照：$state 键 + getters 求值（ref 解包、函数排除）', () => {
    const counter = {
      count: 1,
      title: ref('hello'),
      $state: { count: 1, title: ref('hello') },
      double: computed(() => 2),
      $id: 'counter',
      doSomething: () => {},
      _custom: 'skip',
    }
    setupStores({ counter })

    const res = getPiniaState('counter')
    expect(res.id).toBe('counter')
    expect(res.state.count).toBe(1)
    expect(res.state.title).toBe('hello')
    expect(res.getters.double).toBe(2)
    expect(res.getters).not.toHaveProperty('doSomething')
    expect(res.getters).not.toHaveProperty('_custom')
    expect(res.getters).not.toHaveProperty('$id')
  })

  it('store 不存在如实报错', () => {
    setupStores({})
    expect(() => getPiniaState('ghost')).toThrow(/not found/)
  })
})

describe('updatePiniaState', () => {
  it('顶层 ref 赋值落 .value', () => {
    const title = ref('a')
    setupStores({ s: { $state: { title } } })
    expect(updatePiniaState({ id: 's', key: 'title', value: 'b' }).ok).toBe(
      true,
    )
    expect(title.value).toBe('b')
  })

  it('深路径：reactive 对象嵌套赋值 + 数组索引 + remove', () => {
    const store = { $state: reactive({ obj: { k: 1 }, list: ['x', 'y'] }) }
    setupStores({ s: store })

    updatePiniaState({ id: 's', path: ['obj', 'k'], value: 2 })
    expect(store.$state.obj.k).toBe(2)

    updatePiniaState({ id: 's', path: ['list', '0'], value: 'z' })
    expect(store.$state.list).toEqual(['z', 'y'])

    updatePiniaState({ id: 's', path: ['list', '0'], remove: true })
    expect(store.$state.list).toEqual(['y'])
  })

  it('键不存在 / 不可导航路径如实报错', () => {
    setupStores({ s: { $state: { n: 1 } } })
    expect(() => updatePiniaState({ id: 's', key: 'ghost', value: 1 })).toThrow(
      /not found/,
    )
    expect(() =>
      updatePiniaState({ id: 's', path: ['n', 'x'], value: 1 }),
    ).toThrow(/not navigable/)
  })
})
