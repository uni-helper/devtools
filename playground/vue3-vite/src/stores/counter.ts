// stores/counter.js
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
	state: () => {
		return {
      count: 0,
      name: 'counter',
      map: new Map([['key1', 'value1']]),
      set: new Set(['value1',123]),
      array: [1,2,3],
      obj: {
        a: 1,
        b: 2
      },
      fn: () => 'hello',
      symbol: Symbol('test'),
      bigint: 123456789012345678901234567890123456789n,
      date: new Date(),
      regexp: /\d+/g,
      error: new Error('test')
    };
	},
  getters: {
    doubleCount: (state) => state.count * 2
  },
	// 也可以这样定义
	// state: () => ({ count: 0 })
	actions: {
		inc() {
			this.count++;
      console.log(this.count);
		},
    dec() {
      this.count--;
      console.log(this.count);
    }
	},
});
