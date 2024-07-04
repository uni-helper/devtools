// stores/counter.js
import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
	state: () => {
		return { count: 0 };
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
