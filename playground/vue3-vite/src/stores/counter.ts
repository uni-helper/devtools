import { defineStore } from 'pinia'

// Options 写法的 store。state 里放了几种难序列化的值，用来核对面板的展示
export const useCounterStore = defineStore('counter', {
  state: () => ({
    count: 0,
    label: 'counter',
    items: [1, 2, 3],
    nested: { a: 1, b: { c: 2 } },
    createdAt: new Date('2024-01-01T00:00:00Z'),
    pattern: /\d+/g,
    lookup: new Map([['key', 'value']]),
    tags: new Set(['x', 'y']),
    big: 12345678901234567890n,
    token: Symbol('counter'),
    format: (value: number) => `#${value}`,
  }),
  getters: {
    double: state => state.count * 2,
  },
  actions: {
    increment() {
      this.count++
    },
  },
})
